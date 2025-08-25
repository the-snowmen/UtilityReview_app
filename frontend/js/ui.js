// frontend/js/ui.js
import { map, switchBasemap, startAoiDraw, clearAoi, getAoiGeoJSON, stopAoiDraw } from "./map.js";
import { state, setOrderFromDom, getById } from "./store.js";
import {
  addGeoJSONLayer, removeLayer, applyLayerStyle, setVisibility,
  syncMapOrder, zoomToLayer, zoomToAllVisible,
  setIdentifyMode, addDebugMarker, clearDebugMarkers,
  setCategoricalStyle, clearCategoricalStyle,
} from "./layers.js";
import { refreshLegend } from "./legend.js";

// --- DOM
const $basemap       = document.getElementById("basemapSelect");
const $btnImport     = document.getElementById("btnImport");
const $btnFitAll     = document.getElementById("btnFitAll");
const $layerList     = document.getElementById("layerList");

const $btnDrawAoi    = document.getElementById("btnDrawAoi");
const $aoiPanel      = document.getElementById("aoiPanel");
const $btnClearAoi   = document.getElementById("btnClearAoi");
const $btnExportAoi  = document.getElementById("btnExportAoi");
const $chkKeepAttrs  = document.getElementById("chkKeepAttrs");
const $chkIncludeAoi = document.getElementById("chkIncludeAoi");

const $btnIdentify   = document.getElementById("btnIdentify");
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

let identifyOn = false;
let aoiOn = false;
let lastIdentifyMarker = null;
let styleTargetId = null;

// ---- Top controls
$basemap?.addEventListener("change", () => switchBasemap($basemap.value));
$btnFitAll?.addEventListener("click", () => zoomToAllVisible());

// ---- Import files
$btnImport?.addEventListener("click", importFiles);
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
$btnDrawAoi?.addEventListener("click", () => {
  aoiOn = !aoiOn;
  $btnDrawAoi.classList.toggle("active", aoiOn);
  if (aoiOn) {
    $aoiPanel?.removeAttribute("hidden");
    startAoiDraw();
  } else {
    $aoiPanel?.setAttribute("hidden", "true");
    stopAoiDraw();
    clearAoi();
  }
});
$btnClearAoi?.addEventListener("click", () => clearAoi());
$btnExportAoi?.addEventListener("click", onExportAoiKmz);

// ---- Identify toggle
$btnIdentify?.addEventListener("click", () => {
  identifyOn = !identifyOn;
  $btnIdentify.classList.toggle("active", identifyOn);
  setIdentifyMode(identifyOn);
  if (!identifyOn) hideInfo();
});

// Feature click events (only when Identify is ON)
window.addEventListener("ur-identify", (e) => {
  if (!identifyOn) return;
  const d = e.detail || {};
  showInfo(d.layerName, d.properties, d.latlng);
  if (lastIdentifyMarker) { try { map.removeLayer(lastIdentifyMarker); } catch {} lastIdentifyMarker = null; }
  if (d.latlng) lastIdentifyMarker = addDebugMarker(d.latlng.lat, d.latlng.lng, "Clicked");
});

// Info panel close
$infoClose?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); hideInfo(); }, { capture: true });

// Map background click closes info (but not during identify)
map.on("click", (e) => {
  if (identifyOn) return;
  const onVector = e.originalEvent?.target?.closest?.(".leaflet-interactive");
  if (!onVector) hideInfo();
});

// Global Esc: close info; exit AOI draw if active
window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (aoiOn) {
    aoiOn = false;
    $btnDrawAoi?.classList.remove("active");
    $aoiPanel?.setAttribute("hidden", "true");
    stopAoiDraw();
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

// ---- Build one layer list item (compact; Style opens modal)
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
      <button class="style-btn" title="Style">Style</button>
      <button class="remove-btn" title="Remove">✕</button>
    </div>`;

  const chk = li.querySelector(".chk");
  const removeBtn = li.querySelector(".remove-btn");
  const zoomBtn = li.querySelector(".zoom-btn");
  const dragHandle = li.querySelector(".drag-handle");
  const styleBtn = li.querySelector(".style-btn");

  chk.addEventListener("change", () => setVisibility(id, chk.checked));
  removeBtn.addEventListener("click", () => { removeLayer(id); li.remove(); setOrderFromDom($layerList); refreshLegend(); });
  zoomBtn.addEventListener("click", () => zoomToLayer(id));

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

// ---- AOI export
async function onExportAoiKmz(e) {
  e?.preventDefault?.();
  e?.stopPropagation?.();

  const aoi = getAoiGeoJSON();
  if (!aoi) { alert("Draw an AOI polygon first."); return; }

  const layersForExport = [];
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
    const loc = latlng ? `<div style="margin:6px 0 8px 0;color:#64748b">
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
// Style Modal logic
// =====================
function openStyleModal(id) {
  const st = getById(id); if (!st) return;
  styleTargetId = id;
  $styleTitle.textContent = `Style: ${st.name}`;

  // Base style fields
  $styleBaseColor.value = st.color || "#ff3333";
  $styleBaseWeight.value = st.weight ?? 2;
  $styleBaseOpacity.value = st.opacity ?? 1;

  // Change handlers (immediate apply)
  $styleBaseColor.oninput = () => { st.color = $styleBaseColor.value; applyLayerStyle(id); };
  $styleBaseWeight.oninput = () => { st.weight = clampNum($styleBaseWeight.value, 0, 20, st.weight); $styleBaseWeight.value = st.weight; applyLayerStyle(id); };
  $styleBaseOpacity.oninput = () => { st.opacity = clampNum($styleBaseOpacity.value, 0, 1, st.opacity); $styleBaseOpacity.value = st.opacity; applyLayerStyle(id); };

  // Populate field list
  $styleField.innerHTML = `<option value="">(choose)</option>` +
    (st.propKeys || []).map(k => `<option value="${escapeHtml(k)}"${st.styleBy?.field===k?' selected':''}>${escapeHtml(k)}</option>`).join("");

  $styleMapWrap.innerHTML = "";
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
  bulk.style.margin = "0 0 6px 0";
  bulk.innerHTML = `
    <label style="display:flex;align-items:center;gap:6px">
      <input type="checkbox" id="styleSelectAll">
      <span>Select all</span>
    </label>`;
  $styleMapWrap.appendChild(bulk);

  // Default color row (for unmatched values)
  const defColor = (st.styleBy && st.styleBy.field === field && st.styleBy.defaultColor)
    ? st.styleBy.defaultColor : st.color;
  const defRow = document.createElement("div");
  defRow.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px">
      <span class="small-label" style="min-width:60px">Default</span>
      <input type="color" class="map-default" value="${defColor}">
      <span class="small-label" style="opacity:.7">(used for values not listed)</span>
    </div>`;
  $styleMapWrap.appendChild(defRow);

  // Category rows
  for (const v of values) {
    const key = String(v);
    const preset = rescan ? null : rulesExisting[key];
    const color = preset || randomPastelFor(key);
    const checked = !hiddenExisting.has(key);
    const row = document.createElement("div");
    row.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px">
        <label style="display:flex;align-items:center;gap:6px;min-width:60px">
          <input type="checkbox" class="map-show" data-key="${escapeHtml(key)}" ${checked ? "checked" : ""}>
          <span>Show</span>
        </label>
        <span class="small-label" style="min-width:120px;max-width:260px;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(key)}">${escapeHtml(key)}</span>
        <input type="color" class="map-color" data-key="${escapeHtml(key)}" value="${color}">
      </div>`;
    $styleMapWrap.appendChild(row);
  }

  // Wire the master checkbox
  const allBoxes = [...$styleMapWrap.querySelectorAll(".map-show")];
  const $master = $styleMapWrap.querySelector("#styleSelectAll");
  const refreshMaster = () => { $master.checked = allBoxes.every(b => b.checked); };
  refreshMaster();
  $master.addEventListener("change", () => { allBoxes.forEach(b => (b.checked = $master.checked)); });
  allBoxes.forEach(b => b.addEventListener("change", refreshMaster));
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
