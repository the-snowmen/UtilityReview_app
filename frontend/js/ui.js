// frontend/js/ui.js
import { map, switchBasemap, startAoiDraw, clearAoi, getAoiGeoJSON } from "./map.js";
import { state, setOrderFromDom, getById } from "./store.js";
import {
  addGeoJSONLayer,
  removeLayer,
  applyLayerStyle,
  setVisibility,
  syncMapOrder,
  zoomToLayer,
  zoomToAllVisible,
  setIdentifyMode,
  addDebugMarker,
  clearDebugMarkers,
  setCategoricalStyle,
  clearCategoricalStyle,
} from "./layers.js";

// --- DOM
const $basemap      = document.getElementById("basemapSelect");
const $btnImport    = document.getElementById("btnImport");
const $btnFitAll    = document.getElementById("btnFitAll");
const $layerList    = document.getElementById("layerList");

const $btnDrawAoi   = document.getElementById("btnDrawAoi");
const $btnClearAoi  = document.getElementById("btnClearAoi");
const $btnExportAoi = document.getElementById("btnExportAoi");
const $chkKeepAttrs = document.getElementById("chkKeepAttrs");

const $btnIdentify  = document.getElementById("btnIdentify");
const $info         = document.getElementById("infoPanel");
const $infoClose    = document.getElementById("infoClose");
const $infoTitle    = document.getElementById("infoTitle");
const $infoBody     = document.getElementById("infoBody");
const $chkIncludeAoi = document.getElementById("chkIncludeAoi");


// Coordinate HUD
const $hudCursor    = document.getElementById("hudCursor");
const $hudCenter    = document.getElementById("hudCenter");
const $hudZoom      = document.getElementById("hudZoom");

let identifyOn = false;
let lastIdentifyMarker = null;

// ---- Top controls
$basemap?.addEventListener("change", () => switchBasemap($basemap.value));
$btnFitAll?.addEventListener("click", () => zoomToAllVisible());

// ---- AOI
$btnDrawAoi?.addEventListener("click", () => startAoiDraw());
$btnClearAoi?.addEventListener("click", () => clearAoi());
$btnExportAoi?.addEventListener("click", onExportAoiKmz);

// ---- Identify toggle
$btnIdentify?.addEventListener("click", () => {
  identifyOn = !identifyOn;
  $btnIdentify.classList.toggle("active", identifyOn);
  setIdentifyMode(identifyOn);
  if (!identifyOn) hideInfo();
});

// Feature click events from layers.js
window.addEventListener("ur-identify", (e) => {
  const d = e.detail || {};
  showInfo(d.layerName, d.properties, d.latlng);

  // Keep only one identify marker at a time
  if (lastIdentifyMarker) {
    try { map.removeLayer(lastIdentifyMarker); } catch {}
    lastIdentifyMarker = null;
  }
  if (d.latlng) {
    lastIdentifyMarker = addDebugMarker(d.latlng.lat, d.latlng.lng, "Clicked");
  }
});

// --- Close info panel
if ($infoClose) {
  $infoClose.setAttribute("type", "button");
  $infoClose.addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation(); hideInfo();
  }, { capture: true });
}
$info?.addEventListener("click", (e) => {
  const t = e.target;
  if (t && (t.id === "infoClose" || t.closest?.("#infoClose"))) {
    e.preventDefault(); e.stopPropagation(); hideInfo();
  }
}, { capture: true });
window.addEventListener("keydown", (e) => { if (e.key === "Escape") hideInfo(); });

// Close on background map clicks, but ONLY when Identify is off
map.on("click", (e) => {
  if (identifyOn) return;
  const tgt = e.originalEvent?.target;
  const onVector = tgt?.closest?.(".leaflet-interactive");
  if (onVector) return;
  hideInfo();
});

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
}

// ---- Utilities
function clamp(n, min, max, fallback = min) {
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}
function fmtLL(latlng) {
  if (!latlng) return "—";
  return `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
}

// ---- Build one layer list item (row) — Style editor with Hide toggles
function buildLayerItem(id, st) {
  const li = document.createElement("li");
  li.className = "layer-item";
  li.dataset.layerId = id;

  li.innerHTML = `
    <div class="layer-top">
      <button class="drag-handle" title="Drag to reorder">☰</button>
      <div class="layer-name" title="${escapeHtml(st.name)}">${escapeHtml(st.name)}</div>
      <button class="zoom-btn" title="Zoom to this layer">⤢</button>
      <input type="checkbox" class="chk" ${st.visible ? "checked" : ""} />
      <button class="remove-btn" title="Remove layer">✕</button>
      <button class="style-btn" title="Style by attribute">Style</button>
    </div>
    <div class="layer-controls">
      <span class="small-label">Color</span>
      <input type="color" class="color-chip" value="${st.color}">
      <span class="small-label">Weight</span>
      <input type="number" class="num weight-num" value="${st.weight}" min="0" max="20">
      <span class="small-label">Opacity</span>
      <input type="number" class="num opacity-num" value="${st.opacity}" min="0" max="1" step="0.05">
    </div>
    <div class="style-panel" hidden style="margin:8px 0 0 0;padding:8px;border:1px solid #e5e7eb;border-radius:8px;background:#f8fafc">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="small-label" style="min-width:60px">Field</span>
        <select class="style-field" style="padding:4px 6px;border:1px solid #d0d7e2;border-radius:6px">
          <option value="">(choose)</option>
          ${st.propKeys.map(k => `<option value="${escapeHtml(k)}"${st.styleBy?.field===k?' selected':''}>${escapeHtml(k)}</option>`).join("")}
        </select>
        <button class="style-scan" title="Scan values">Scan</button>
        <button class="style-clear" title="Clear style">Clear</button>
      </div>
      <div style="margin-top:6px;color:#475569;font-size:12px">
        <em>Tip:</em> Uncheck “Show” to hide a category from the map & export.
      </div>
      <div class="style-mapping" style="margin-top:8px;display:grid;gap:6px"></div>
      <div class="style-actions" style="margin-top:8px;display:flex;gap:8px">
        <button class="style-apply">Apply</button>
      </div>
    </div>
  `;

  const chk = li.querySelector(".chk");
  const colorInput = li.querySelector(".color-chip");
  const weightInput = li.querySelector(".weight-num");
  const opacityInput = li.querySelector(".opacity-num");
  const removeBtn = li.querySelector(".remove-btn");
  const zoomBtn = li.querySelector(".zoom-btn");
  const dragHandle = li.querySelector(".drag-handle");
  const styleBtn = li.querySelector(".style-btn");

  const panel = li.querySelector(".style-panel");
  const selField = li.querySelector(".style-field");
  const btnScan = li.querySelector(".style-scan");
  const btnClear = li.querySelector(".style-clear");
  const mapWrap = li.querySelector(".style-mapping");
  const btnApply = li.querySelector(".style-apply");

  // --- basic style controls
  chk.addEventListener("change", () => setVisibility(id, chk.checked));

  colorInput.addEventListener("input", () => {
    st.color = colorInput.value;
    if (!st.styleBy?.field) applyLayerStyle(id);
  });

  weightInput.addEventListener("input", () => {
    const v = clamp(+weightInput.value, 0, 20, st.weight);
    st.weight = v;
    weightInput.value = String(v);
    applyLayerStyle(id);
  });

  opacityInput.addEventListener("input", () => {
    const v = clamp(+opacityInput.value, 0, 1, st.opacity);
    st.opacity = v;
    opacityInput.value = String(v);
    applyLayerStyle(id);
  });

  removeBtn.addEventListener("click", () => {
    removeLayer(id);
    li.remove();
    setOrderFromDom($layerList);
  });

  zoomBtn.addEventListener("click", () => zoomToLayer(id));

  // --- Drag reordering (handle-only)
  dragHandle.setAttribute("draggable", "true");
  dragHandle.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    li.classList.add("dragging");
    draggingId = id;
  });
  dragHandle.addEventListener("dragend", () => {
    li.classList.remove("dragging");
    draggingId = null;
  });

  // --- Categorical styling UI with Hide toggles

  styleBtn.addEventListener("click", () => {
    const on = panel.hasAttribute("hidden");
    panel.toggleAttribute("hidden", !on);
    if (on && selField.value) {
      renderMappingRows(false);
    }
  });

  btnScan.addEventListener("click", () => {
    if (!selField.value) { alert("Choose a field first."); return; }
    renderMappingRows(true); // rescan values from features
  });

  btnClear.addEventListener("click", () => {
    clearCategoricalStyle(id);
    colorInput.value = st.color; // back to base color
    panel.setAttribute("hidden", "true");
  });

  btnApply.addEventListener("click", () => {
    const field = selField.value;
    if (!field) { alert("Choose a field."); return; }
    const { rules, def, hidden } = readMappingFromDom();
    setCategoricalStyle(id, field, rules, def || st.color, hidden);
  });

  // helpers
  function renderMappingRows(rescan = false) {
    const field = selField.value;
    const stNow = getById(id);
    const rulesExisting =
      (stNow.styleBy && stNow.styleBy.field === field) ? (stNow.styleBy.rules || {}) : {};
    const hiddenExisting =
      (stNow.styleBy && stNow.styleBy.field === field && stNow.styleBy.hidden) ? stNow.styleBy.hidden : new Set();

    const values = uniqueValuesForField(stNow.source, field, 4000, 50);
    mapWrap.innerHTML = "";

    // default row
    const defColor = (stNow.styleBy && stNow.styleBy.field === field && stNow.styleBy.defaultColor)
      ? stNow.styleBy.defaultColor
      : stNow.color;
    const defRow = document.createElement("div");
    defRow.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px">
        <span class="small-label" style="min-width:60px">Default</span>
        <input type="color" class="map-default" value="${defColor}">
        <span class="small-label" style="opacity:.7">(used for values not listed)</span>
      </div>`;
    mapWrap.appendChild(defRow);

    // value rows
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
          <span class="small-label" style="min-width:120px;max-width:220px;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(key)}">${escapeHtml(key)}</span>
          <input type="color" class="map-color" data-key="${escapeHtml(key)}" value="${color}">
        </div>`;
      mapWrap.appendChild(row);
    }
  }

  function readMappingFromDom() {
    const colors = mapWrap.querySelectorAll(".map-color");
    const shows  = mapWrap.querySelectorAll(".map-show");
    const def = mapWrap.querySelector(".map-default")?.value || null;
    const rules = {};
    const hidden = [];
    colors.forEach(inp => { rules[inp.dataset.key] = inp.value; });
    shows.forEach(chk => { if (!chk.checked) hidden.push(chk.dataset.key); });
    return { rules, def, hidden };
  }

  return li;
}

// ---- helpers for categorical style
function uniqueValuesForField(fc, field, sampleLimit = 4000, uniqueCap = 50) {
  const vals = new Set();
  let count = 0;
  for (const f of fc?.features || []) {
    if (count++ > sampleLimit) break;
    const v = f?.properties?.[field];
    if (v === undefined || v === null) continue;
    vals.add(String(v));
    if (vals.size >= uniqueCap) break;
  }
  return [...vals].sort((a,b)=>a.localeCompare(b));
}
function randomPastelFor(s) {
  let h = 0;
  for (let i=0;i<s.length;i++) h = (h*33 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return hslToHex(hue, 65, 60);
}
function hslToHex(h, s, l) {
  s/=100; l/=100;
  const c=(1-Math.abs(2*l-1))*s, x=c*(1-Math.abs((h/60)%2-1)), m=l-c/2;
  let r=0,g=0,b=0;
  if (0<=h&&h<60){r=c;g=x;} else if (60<=h&&h<120){r=x;g=c;}
  else if (120<=h&&h<180){g=c;b=x;} else if (180<=h&&h<240){g=x;b=c;}
  else if (240<=h&&h<300){r=x;b=c;} else {r=c;b=x;}
  const toHex = v => (`0${Math.round((v+m)*255).toString(16)}`).slice(-2);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ---- One set of DnD handlers on the list
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

$layerList?.addEventListener("drop", () => {
  setOrderFromDom($layerList);
  syncMapOrder();
});

function getDragAfterElement(container, y) {
  const els = [...container.querySelectorAll(".layer-item:not(.dragging)")];
  return els.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset, element: child };
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY }
  ).element;
}

export function rebuildList() {
  $layerList.innerHTML = "";
  for (const id of state.order) {
    const li = buildLayerItem(id, getById(id));
    $layerList.appendChild(li);
  }
}

// ---- AOI export
async function onExportAoiKmz(e) {
  e?.preventDefault?.();
  e?.stopPropagation?.();

  const aoi = getAoiGeoJSON();
  if (!aoi) { alert("Draw an AOI polygon first."); return; }

  // Collect visible layers + their styles; also filter out hidden categories
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
      // pass full style info so backend can style KML
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
      features: fc,  // FeatureCollection already filtered
    });
  }

  if (!layersForExport.length) { alert("No visible features to export."); return; }
  if (!window.backend?.exportAoiKmz) { alert("Export API missing from preload."); return; }

  const safeAoi = JSON.parse(JSON.stringify(aoi));
  const safeLayers = JSON.parse(JSON.stringify(layersForExport));
  const opts = {
    keepAttributes: !!$chkKeepAttrs?.checked,
    includeAoi: !!$chkIncludeAoi?.checked,
  };


  try {
    const res = await window.backend.exportAoiKmz(safeAoi, safeLayers, "aoi_export.kmz", opts);
    if (!res?.ok && !res?.canceled) alert("Export failed: " + (res?.error || "unknown"));
  } catch (err) {
    console.error("[exportAoiKmz]", err);
    alert("Export failed: " + (err?.message || err));
  }
}

// ---- Identify info panel helpers
function showInfo(title, props, latlng) {
  if ($infoTitle) $infoTitle.textContent = title || "Feature Info";
  if ($infoBody) {
    const rows = Object.entries(props || {}).map(([k, v]) =>
      `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`
    ).join("");
    const loc = latlng ? `<div style="margin:6px 0 8px 0;color:#64748b">
      <small>Clicked at ${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}</small>
    </div>` : "";
    $infoBody.innerHTML = loc + (rows ? `<table>${rows}</table>` : "<em>No attributes</em>");
  }
  $info?.removeAttribute("hidden");
}

function hideInfo() {
  $info?.setAttribute("hidden", "true");
  if (lastIdentifyMarker) {
    try { map.removeLayer(lastIdentifyMarker); } catch {}
    lastIdentifyMarker = null;
  }
  clearDebugMarkers();
}

// ---- Coordinate HUD wiring
function updateHudCenter() {
  const c = map.getCenter();
  if ($hudCenter) $hudCenter.textContent = fmtLL(c);
  if ($hudZoom) $hudZoom.textContent = String(map.getZoom());
}
function updateHudCursor(e) {
  if (!e?.latlng) return;
  if ($hudCursor) $hudCursor.textContent = fmtLL(e.latlng);
}

updateHudCenter();
map.on("moveend zoomend", updateHudCenter);
map.on("mousemove", updateHudCursor);
