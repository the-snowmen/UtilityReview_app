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

// Close on background map clicks, but ONLY when Identify is off,
// and never when the click originated from a vector feature.
map.on("click", (e) => {
  if (identifyOn) return; // don’t fight Identify clicks
  const tgt = e.originalEvent?.target;
  const onVector = tgt?.closest?.(".leaflet-interactive");
  if (onVector) return;   // came from a feature; ignore
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

// ---- Build one layer list item (row)
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
    </div>
    <div class="layer-controls">
      <span class="small-label">Color</span>
      <input type="color" class="color-chip" value="${st.color}">
      <span class="small-label">Weight</span>
      <input type="number" class="num weight-num" value="${st.weight}" min="0" max="20">
      <span class="small-label">Opacity</span>
      <input type="number" class="num opacity-num" value="${st.opacity}" min="0" max="1" step="0.05">
    </div>
  `;

  const chk = li.querySelector(".chk");
  const colorInput = li.querySelector(".color-chip");
  const weightInput = li.querySelector(".weight-num");
  const opacityInput = li.querySelector(".opacity-num");
  const removeBtn = li.querySelector(".remove-btn");
  const zoomBtn = li.querySelector(".zoom-btn");
  const dragHandle = li.querySelector(".drag-handle");

  chk.addEventListener("change", () => setVisibility(id, chk.checked));

  colorInput.addEventListener("input", () => {
    st.color = colorInput.value;
    applyLayerStyle(id);
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

  return li;
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

  // Collect visible layers + their styles
  const layersForExport = [];
  for (const id of state.order) {
    const st = state.layers.get(id);
    if (!st?.visible || !st?.source?.features?.length) continue;

    layersForExport.push({
      name: st.name,
      style: { color: st.color, weight: st.weight, opacity: st.opacity },
      features: st.source,  // FeatureCollection
    });
  }
  if (!layersForExport.length) { alert("No visible features to export."); return; }

  if (!window.backend?.exportAoiKmz) { alert("Export API missing from preload."); return; }

  const safeAoi = JSON.parse(JSON.stringify(aoi));
  const safeLayers = JSON.parse(JSON.stringify(layersForExport));
  const opts = { keepAttributes: !!$chkKeepAttrs?.checked };

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
