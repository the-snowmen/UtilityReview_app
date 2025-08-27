// frontend/js/ui.js
import { map, switchBasemap, startAoiDraw, clearAoi, getAoiGeoJSON, stopAoiDraw, setAoiFromGeoJSON } from "./map.js";
import { state, setOrderFromDom, getById } from "./store.js";
import {
  addGeoJSONLayer, removeLayer, applyLayerStyle, setVisibility,
  syncMapOrder, zoomToLayer, zoomToAllVisible,
  setIdentifyMode, addDebugMarker, clearDebugMarkers,
  setCategoricalStyle, clearCategoricalStyle,
} from "./layers.js";
import { refreshLegend } from "./legend.js";

// NEW: comments feature
import { toggleCommentMode, setCommentMode, getCommentsGeoJSON, clearComments } from "./features/comments.js";

// --- DOM
const $basemap       = document.getElementById("basemapSelect");
const $layerList     = document.getElementById("layerList");
const $layersHeader  = document.getElementById("layersHeader"); // click = Fit All
const $btnImport     = document.getElementById("btnImport");    // inside layers header
// Optional dedicated KML/KMZ import (if you add a button with this id)
const $btnImportKmx  = document.getElementById("btnImportKmxLayer");

const $btnDrawAoi    = document.getElementById("btnDrawAoi");
const $aoiPanel      = document.getElementById("aoiPanel");
const $btnClearAoi   = document.getElementById("btnClearAoi");
const $btnExportAoi  = document.getElementById("btnExportAoi");
const $chkKeepAttrs  = document.getElementById("chkKeepAttrs");
const $chkIncludeAoi = document.getElementById("chkIncludeAoi");
const $btnAoiComment = document.getElementById("btnAoiComment");

// Identify controls removed from toolbar
const $info          = document.getElementById("infoPanel");
const $infoClose     = document.getElementById("infoClose");
const $infoTitle     = document.getElementById("infoTitle");
const $infoBody      = document.getElementById("infoBody");

// HUD
const $hudCursor     = document.getElementById("hudCursor");
const $hudCenter     = document.getElementById("hudCenter");
const $hudZoom       = document.getElementById("hudZoom");

// Style modal
const $styleModal    = document.getElementById("styleModal");
const $styleTitle    = document.getElementById("styleModalTitle");
const $styleClose    = document.getElementById("styleModalClose");
const $styleBaseColor   = document.getElementById("styleBaseColor");
const $styleBaseWeight  = document.getElementById("styleBaseWeight");
const $styleBaseOpacity = document.getElementById("styleBaseOpacity");
const $styleField    = document.getElementById("styleFieldSelect");
const $styleScan     = document.getElementById("styleScanBtn");
const $styleClear    = document.getElementById("styleClearBtn");
const $styleApply    = document.getElementById("styleApplyBtn");
const $styleMapWrap  = document.getElementById("styleMapWrap");

let aoiOn = false;
let lastIdentifyMarker = null;
let styleTargetId = null;

// Prevent scroll → map zoom on floating panels
const $layersPanel = document.querySelector(".layers-panel");
if ($layersPanel) {
  L.DomEvent.disableScrollPropagation($layersPanel);
}

const $infoPanel = document.getElementById("infoPanel");
if ($infoPanel) {
  L.DomEvent.disableScrollPropagation($infoPanel);
}

const $coordSearch = document.getElementById("coordSearch");
if ($coordSearch) {
  L.DomEvent.disableScrollPropagation($coordSearch);
}

// ---- Top controls
$basemap?.addEventListener("change", () => switchBasemap($basemap.value));

// ---- Fit-to-all via Layers header
$layersHeader?.addEventListener("click", () => zoomToAllVisible());

// ---- Import files (button now in Layers header)
$btnImport?.addEventListener("click", (e) => { e.stopPropagation(); importFiles(); });

// Optional: dedicated KML/KMZ import (uses backend.importKmxAsLayer if present)
$btnImportKmx?.addEventListener("click", async (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!window.backend?.importKmxAsLayer) {
    // fall back to generic import dialog
    return importFiles();
  }
  const meta = await window.backend.importKmxAsLayer();
  if (!meta || !meta.ok || !meta.fc) return;
  const id = addGeoJSONLayer(meta.name, meta.fc, true);
  const li = buildLayerItem(id, getById(id));
  $layerList.prepend(li);
  setOrderFromDom($layerList);
  syncMapOrder();
  refreshLegend();
});

async function importFiles() {
  if (!window.backend?.selectFiles || !window.backend?.ingestFile) {
    alert("IPC not available. Check preload/electron wiring.");
    return;
  }
  const sel = await window.backend.selectFiles();
  const paths = Array.isArray(sel) ? sel : sel?.paths;
  if (!paths?.length) return;

  for (const p of paths) {
    const res = await window.backend.ingestFile(p, null);
    if (res?.ok && res.geojson) {
      const id = addGeoJSONLayer(res.name || p, res.geojson, true);
      const li = buildLayerItem(id, getById(id));
      $layerList.prepend(li);
      setOrderFromDom($layerList);
      syncMapOrder();
    } else {
      console.error("Ingest failed:", res?.error || res);
      alert(`Failed to ingest:\n${p}\n${res?.error || ""}`);
    }
  }
  refreshLegend(); // rebuild legend once after all imports
}

// ---- Layer list rebuild (from state.order)
export function rebuildList() {
  $layerList.innerHTML = "";
  for (const id of state.order) $layerList.appendChild(buildLayerItem(id, getById(id)));
  refreshLegend();
}

// ---- AOI toggle
const $btnDrawAoiEl = $btnDrawAoi;
$btnDrawAoiEl?.addEventListener("click", () => {
  aoiOn = !aoiOn;
  $btnDrawAoiEl.classList.toggle("active", aoiOn);
  if (aoiOn) {
    $aoiPanel?.removeAttribute("hidden");
    startAoiDraw();
  } else {
    $aoiPanel?.setAttribute("hidden", "true");
    stopAoiDraw();
    setCommentMode(false); // turn off comment mode
  }
});

$btnAoiComment?.addEventListener("click", () => {
  const on = toggleCommentMode();
  $btnAoiComment.classList.toggle("active", on);
});

$btnClearAoi?.addEventListener("click", () => {
  clearAoi();
  // Keep comments unless you want them cleared too:
  // clearComments();
});
$btnExportAoi?.addEventListener("click", onExportAoiKmz);

// --- AOI from KML/KMZ button
const $btnAoiFromKmx = document.getElementById("btn-aoi-from-kmz");
$btnAoiFromKmx?.addEventListener("click", async (e) => {
  e.preventDefault();
  e.stopPropagation();

  if (!window.backend?.aoiPickKmx) {
    alert("AOI import not wired: expose aoiPickKmx in preload/electron.");
    return;
  }

  const res = await window.backend.aoiPickKmx();
  if (!res || res.canceled) return;

  if (!res.ok || !res.feature) {
    console.error("AOI import error:", res?.error);
    alert("Failed to import KML/KMZ: " + (res?.error || "Unknown error"));
    return;
  }

  try {
    setAoiFromGeoJSON(res.feature);
    // ensure AOI panel visible so user can export/clear
    $aoiPanel?.removeAttribute("hidden");
  } catch (err) {
    console.error("setAoiFromGeoJSON failed:", err);
    alert("Could not set AOI from file.");
  }
});


// ---- Identify removed: features are ALWAYS clickable
// Show info whenever a feature dispatches ur-identify
window.addEventListener("ur-identify", (e) => {
  const d = e.detail || {};
  showInfo(d.layerName, d.properties, d.latlng);
  if (lastIdentifyMarker) { try { map.removeLayer(lastIdentifyMarker); } catch {} lastIdentifyMarker = null; }
  if (d.latlng) lastIdentifyMarker = addDebugMarker(d.latlng.lat, d.latlng.lng, "Clicked");
});

// Info panel close
$infoClose?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); hideInfo(); }, { capture: true });

// Map background click closes info
map.on("click", (e) => {
  const onVector = e.originalEvent?.target?.closest?.(".leaflet-interactive");
  if (!onVector) hideInfo();
});

// Global Esc: close info; exit AOI draw if active
window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (aoiOn) {
    aoiOn = false;
    $btnDrawAoiEl?.classList.remove("active");
    $aoiPanel?.setAttribute("hidden", "true");
    stopAoiDraw();
    setCommentMode(false);
    $btnAoiComment?.classList.remove("active");
  }
  hideInfo();
});

// ---- Utilities
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}
function fmtLL(latlng) { return `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`; }

// ---- Build one layer list item
function buildLayerItem(id, st) {
  const li = document.createElement("li");
  li.className = "layer-item";
  li.dataset.layerId = id;
  li.innerHTML = `
    <div class="layer-top">
      <button class="drag-handle" title="Drag to reorder">☰</button>
      <div class="layer-name" title="${escapeHtml(st.name)}">${escapeHtml(st.name)}</div>
      <button class="zoom-btn" title="Zoom to this layer">⤢</button>
      <input type="checkbox" class="chk" ${st.visible ? "checked" : ""} title="Show/Hide"/>
      <button class="aoi-btn" title="Use layer polygons as AOI">AOI</button>
      <button class="style-btn" title="Style">Style</button>
      <button class="remove-btn" title="Remove">✕</button>
    </div>`;

  const chk = li.querySelector(".chk");
  const removeBtn = li.querySelector(".remove-btn");
  const zoomBtn = li.querySelector(".zoom-btn");
  const aoiBtn = li.querySelector(".aoi-btn");
  const dragHandle = li.querySelector(".drag-handle");
  const styleBtn = li.querySelector(".style-btn");

  chk.addEventListener("change", () => setVisibility(id, chk.checked));
  removeBtn.addEventListener("click", () => { removeLayer(id); li.remove(); setOrderFromDom($layerList); refreshLegend(); });
  zoomBtn.addEventListener("click", () => zoomToLayer(id));
  aoiBtn.addEventListener("click", () => useLayerAsAoi(id));

  // Drag reordering
  dragHandle.setAttribute("draggable", "true");
  dragHandle.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    li.classList.add("dragging");
    draggingId = id;
  });
  dragHandle.addEventListener("dragend", () => { li.classList.remove("dragging"); draggingId = null; });

  // Open style modal
  styleBtn.addEventListener("click", () => openStyleModal(id));

  return li;
}

// ---- DnD list
let draggingId = null;
$layerList?.addEventListener("dragover", (e) => {
  if (!draggingId) return;
  e.preventDefault();
  const after = getDragAfterElement($layerList, e.clientY);
  const draggingEl = [...$layerList.children].find((n) => n.dataset.layerId === draggingId);
  if (!draggingEl) return;
  if (after == null) $layerList.appendChild(draggingEl);
  else $layerList.insertBefore(draggingEl, after);
});
$layerList?.addEventListener("drop", () => { setOrderFromDom($layerList); syncMapOrder(); refreshLegend(); });

function getDragAfterElement(container, y) {
  const els = [...container.querySelectorAll(".layer-item:not(.dragging)")];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// ---- AOI: build from a layer’s polygons
function useLayerAsAoi(id) {
  const st = getById(id);
  if (!st?.source?.features?.length) {
    alert("That layer has no features.");
    return;
  }
  const aoiFeature = mergePolysToAoiFeature(st.source);
  if (!aoiFeature) {
    alert("This layer has no polygons to use as an AOI.");
    return;
  }
  try {
    setAoiFromGeoJSON(aoiFeature);
    // ensure AOI panel is visible so user can export
    $aoiPanel?.removeAttribute("hidden");
  } catch (err) {
    console.error("setAoiFromGeoJSON failed:", err);
    alert("Could not set AOI from this layer.");
  }
}

// Collect all Polygon/MultiPolygon rings → single Feature (Polygon or MultiPolygon)
function mergePolysToAoiFeature(fc) {
  const polys = [];
  for (const f of fc.features) {
    const g = f?.geometry;
    if (!g) continue;
    if (g.type === "Polygon") polys.push(g.coordinates);
    else if (g.type === "MultiPolygon") polys.push(...g.coordinates);
  }
  if (!polys.length) return null;
  if (polys.length === 1) {
    return { type: "Feature", properties: { name: "AOI" }, geometry: { type: "Polygon", coordinates: polys[0] } };
  }
  return { type: "Feature", properties: { name: "AOI" }, geometry: { type: "MultiPolygon", coordinates: polys } };
}

// ---- AOI export (includes Comments layer if any)
async function onExportAoiKmz(e) {
  e?.preventDefault?.();
  e?.stopPropagation?.();

  const aoi = getAoiGeoJSON();
  if (!aoi) { alert("Draw or set an AOI first."); return; }

  const layersForExport = [];

  // Existing visible layers (with styling info)
  for (const id of state.order) {
    const st = state.layers.get(id);
    if (!st?.visible || !st?.source?.features?.length) continue;

    let fc = st.source;
    const sb = st.styleBy;
    let hiddenSet = null;
    if (sb?.field && sb?.hidden?.size) {
      hiddenSet = sb.hidden;
      fc = {
        type: "FeatureCollection",
        features: st.source.features.filter(f => !hiddenSet.has(String(f?.properties?.[sb.field]))),
      };
    }
    if (!fc.features.length) continue;

    layersForExport.push({
      name: st.name,
      style: {
        baseColor: st.color,
        weight: st.weight,
        opacity: st.opacity,
        styleBy: sb ? {
          field: sb.field,
          rules: sb.rules || {},
          defaultColor: sb.defaultColor || st.color,
          hidden: hiddenSet ? [...hiddenSet] : [],
        } : null
      },
      features: fc,
    });
  }

  // NEW: Comments as a separate layer (points)
  const comments = getCommentsGeoJSON();
  if (comments?.features?.length) {
    layersForExport.push({
      name: "Comments",
      style: { baseColor: "#f59e0b", weight: 2, opacity: 1, styleBy: null },
      features: comments
    });
  }

  if (!layersForExport.length) { alert("No visible features to export."); return; }
  if (!window.backend?.exportAoiKmz) { alert("Export API missing from preload."); return; }

  const opts = {
    keepAttributes: !!$chkKeepAttrs?.checked,
    includeAoi: !!$chkIncludeAoi?.checked,
  };

  try {
    const res = await window.backend.exportAoiKmz(aoi, layersForExport, "aoi_export.kmz", opts);
    if (!res?.ok && !res?.canceled) alert("Export failed: " + (res?.error || "unknown"));
  } catch (err) {
    console.error("[exportAoiKmz]", err);
    alert("Export failed: " + (err?.message || err));
  }
}

// ---- Identify info panel
function showInfo(title, props, latlng) {
  if ($infoTitle) $infoTitle.textContent = title || "Feature Info";
  if ($infoBody) {
    const rows = Object.entries(props || {}).map(([k, v]) =>
      `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`
    ).join("");
    const loc = latlng ? `<div style="margin:6px 0 8px 0;color:#94a3b8">
      <small>Clicked at ${fmtLL(latlng)}</small>
    </div>` : "";
    $infoBody.innerHTML = loc + (rows ? `<table>${rows}</table>` : "<em>No attributes</em>");
  }
  $info?.removeAttribute("hidden");
}
function hideInfo() {
  $info?.setAttribute("hidden", "true");
  if (lastIdentifyMarker) { try { map.removeLayer(lastIdentifyMarker); } catch {} lastIdentifyMarker = null; }
  clearDebugMarkers();
}

// ---- HUD wiring
function updateHudCenter() {
  const c = map.getCenter();
  if ($hudCenter) $hudCenter.textContent = `center ${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}`;
  if ($hudZoom) $hudZoom.textContent = `z${map.getZoom()}`;
}
function updateHudCursor(e) {
  if (!e?.latlng) return;
  if ($hudCursor) $hudCursor.textContent = fmtLL(e.latlng);
}
updateHudCenter();
map.on("moveend zoomend", updateHudCenter);
map.on("mousemove", updateHudCursor);

// =====================
// Style Modal logic (unchanged)
// =====================
function openStyleModal(id) {
  const st = getById(id); if (!st) return;
  styleTargetId = id;
  $styleTitle.textContent = `Style: ${st.name}`;

  // Base style fields
  $styleBaseColor.value = st.color || "#ff3333";
  $styleBaseWeight.value = st.weight ?? 2;
  $styleBaseOpacity.value = st.opacity ?? 1;

  // Immediate apply for base style
  $styleBaseColor.oninput = () => { st.color = $styleBaseColor.value; applyLayerStyle(id); };
  $styleBaseWeight.oninput = () => { st.weight = clampNum($styleBaseWeight.value, 0, 20, st.weight); $styleBaseWeight.value = st.weight; applyLayerStyle(id); };
  $styleBaseOpacity.oninput = () => { st.opacity = clampNum($styleBaseOpacity.value, 0, 1, st.opacity); $styleBaseOpacity.value = st.opacity; applyLayerStyle(id); };

  // Populate field list (keeps current field selected if present)
  $styleField.innerHTML = `<option value="">(choose)</option>` +
    (st.propKeys || []).map(k =>
      `<option value="${escapeHtml(k)}"${st.styleBy?.field===k?' selected':''}>${escapeHtml(k)}</option>`
    ).join("");

  // Initial button states
  $styleScan.disabled  = !$styleField.value;
  $styleClear.disabled = !(st.styleBy && st.styleBy.field);
  $styleApply.disabled = true;

  // Field change → update enablement
  $styleField.onchange = () => {
    $styleScan.disabled = !$styleField.value;
    $styleApply.disabled = true;
    $styleMapWrap.innerHTML = "";
  };

  // Clear mapping UI
  $styleMapWrap.innerHTML = "";

  // If a field already styled, render mapping rows from existing rules
  if ($styleField.value) {
    renderMappingRowsModal(st, $styleField.value, /*rescan=*/false);
    $styleScan.disabled = false;
    $styleClear.disabled = !!(st.styleBy && st.styleBy.field);
    $styleApply.disabled = true;
  }

  $styleModal.removeAttribute("hidden");
}

$styleClose?.addEventListener("click", () => $styleModal.setAttribute("hidden","true"));
$styleScan?.addEventListener("click", () => {
  if (!styleTargetId) return;
  const st = getById(styleTargetId);
  const field = $styleField.value;
  if (!field) { alert("Choose a field first."); return; }
  renderMappingRowsModal(st, field, false);
});
$styleClear?.addEventListener("click", () => {
  if (!styleTargetId) return;
  clearCategoricalStyle(styleTargetId);
  $styleMapWrap.innerHTML = "";
});
$styleApply?.addEventListener("click", () => {
  if (!styleTargetId) return;
  const st = getById(styleTargetId);
  const field = $styleField.value;
  if (!field) { alert("Choose a field."); return; }
  const { rules, def, hidden } = readMappingFromModal();
  setCategoricalStyle(styleTargetId, field, rules, def || st.color, hidden);
});

function renderMappingRowsModal(st, field, rescan=false) {
  const rulesExisting =
    (st.styleBy && st.styleBy.field === field) ? (st.styleBy.rules || {}) : {};
  const hiddenExisting =
    (st.styleBy && st.styleBy.field === field && st.styleBy.hidden) ? st.styleBy.hidden : new Set();

  const values = uniqueValuesForField(st.source, field, 4000, 50);
  $styleMapWrap.innerHTML = "";

  // --- Select all/none master toggle
  const bulk = document.createElement("div");
  bulk.className = "map-row";
  bulk.innerHTML = `
    <label style="display:flex;align-items:center;gap:6px">
      <input type="checkbox" id="styleSelectAll">
      <span class="small-label">Select all</span>
    </label>`;
  $styleMapWrap.appendChild(bulk);

  // Default color row (for unmatched values)
  const defColor = (st.styleBy && st.styleBy.field === field && st.styleBy.defaultColor)
    ? st.styleBy.defaultColor : st.color;
  const defRow = document.createElement("div");
  defRow.className = "map-row";
  defRow.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px">
      <span class="small-label" style="min-width:72px">Default</span>
      <input type="color" class="map-default" value="${defColor}">
      <span class="small-label" style="opacity:.7">(for values not listed)</span>
    </div>`;
  $styleMapWrap.appendChild(defRow);

  // Category rows
  for (const v of values) {
    const key = String(v);
    const preset = rescan ? null : rulesExisting[key];
    const color = preset || randomPastelFor(key);
    const checked = !hiddenExisting.has(key);

    const row = document.createElement("div");
    row.className = "map-row";
    row.innerHTML = `
      <span class="map-value" title="${escapeHtml(key)}">${escapeHtml(key)}</span>
      <label class="map-show-wrap">
        <input type="checkbox" class="map-show" data-key="${escapeHtml(key)}" ${checked ? "checked" : ""}>
        <span class="small-label">Show</span>
      </label>
      <input type="color" class="map-color" data-key="${escapeHtml(key)}" value="${color}">
    `;
    $styleMapWrap.appendChild(row);
  }

  // Wire the master checkbox
  const allBoxes = [...$styleMapWrap.querySelectorAll(".map-show")];
  const $master = $styleMapWrap.querySelector("#styleSelectAll");
  const refreshMaster = () => { $master.checked = allBoxes.every(b => b.checked); };
  refreshMaster();
  $master.addEventListener("change", () => { allBoxes.forEach(b => (b.checked = $master.checked)); });

  // any change → allow Apply
  [...allBoxes, $styleMapWrap.querySelector(".map-default")].forEach(el =>
    el?.addEventListener?.("change", () => { $styleApply.disabled = false; })
  );

  $styleScan.disabled = false;
  $styleApply.disabled = false;
  $styleClear.disabled = false;
}

function readMappingFromModal() {
  const colors = $styleMapWrap.querySelectorAll(".map-color");
  const shows  = $styleMapWrap.querySelectorAll(".map-show");
  const def = $styleMapWrap.querySelector(".map-default")?.value || null;
  const rules = {};
  const hidden = [];
  colors.forEach(inp => { rules[inp.dataset.key] = inp.value; });
  shows.forEach(chk => { if (!chk.checked) hidden.push(chk.dataset.key); });
  return { rules, def, hidden };
}

function uniqueValuesForField(fc, field, sampleLimit = 4000, uniqueCap = 50) {
  const vals = new Set(); let count = 0;
  for (const f of fc?.features || []) {
    if (count++ > sampleLimit) break;
    const v = f?.properties?.[field];
    if (v === undefined || v === null) continue;
    vals.add(String(v)); if (vals.size >= uniqueCap) break;
  }
  return [...vals].sort((a,b)=>a.localeCompare(b));
}
function randomPastelFor(s) {
  let h = 0; for (let i=0;i<s.length;i++) h = (h*33 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360; return hslToHex(hue, 65, 60);
}
function hslToHex(h, s, l) {
  s/=100; l/=100; const c=(1-Math.abs(2*l-1))*s, x=c*(1-Math.abs((h/60)%2-1)), m=l-c/2;
  let r=0,g=0,b=0;
  if (0<=h&&h<60){r=c;g=x;} else if (60<=h&&h<120){r=x;g=c;}
  else if (120<=h&&h<180){g=c;b=x;} else if (180<=h&&h<240){g=x;b=c;}
  else if (240<=h&&h<300){r=x;b=c;} else {r=c;b=x;}
  const toHex = v => (`0${Math.round((v+m)*255).toString(16)}`).slice(-2);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
function clampNum(n, min, max, fallback) {
  const v = Number(n); if (Number.isNaN(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}
