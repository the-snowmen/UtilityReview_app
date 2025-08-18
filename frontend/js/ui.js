// frontend/js/ui.js
import { switchBasemap, startAoiDraw, clearAoi, getAoiGeoJSON } from "./map.js";
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
} from "./layers.js";
import { addDebugMarker } from "./layers.js";


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

const $btnAddDebug = document.getElementById("btnAddDebug");

let identifyOn = false;

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
});

// Close info panel via ✕ or Esc
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

// ---- Check the coordinate
$btnAddDebug?.addEventListener("click", () => {
  // Pick the current map center as debug point
  const c = map.getCenter();  // requires `map` exported from map.js
  addDebugMarker(c.lat, c.lng, "Map center");
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
      <button class="crs-btn" title="Set source CRS (EPSG)">CRS</button>
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
  const crsBtn = li.querySelector(".crs-btn");

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

  // CRS override: re-ingest with explicit EPSG
  crsBtn.addEventListener("click", async () => {
    const guess = prompt("Enter source EPSG (e.g., 4326, 3857, 3421, 32143...). Leave blank to cancel.");
    if (!guess) return;
    const epsg = Number(guess);
    if (!Number.isInteger(epsg)) { alert("Invalid EPSG."); return; }

    const sel = await window.backend.selectFiles();
    const p = Array.isArray(sel) ? sel[0] : sel?.paths?.[0];
    if (!p) return;

    const res = await window.backend.ingestFile(p, epsg);
    if (!res?.ok || !res.geojson) { alert("Re-ingest failed."); return; }

    // Replace layer’s source and rebuild
    applyLayerReplacement(id, {
      ...st,
      source: res.geojson,
      propKeys: Object.keys(res.geojson?.features?.[0]?.properties || {}),
    });
  });

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

// Replace a layer keeping name/style/visibility; rebuild sidebar
function applyLayerReplacement(oldId, newState) {
  const visible = newState.visible;
  const name = newState.name, color = newState.color, weight = newState.weight, opacity = newState.opacity;

  removeLayer(oldId);
  const newId = addGeoJSONLayer(name, newState.source, true);
  const nst = getById(newId);
  nst.color = color; nst.weight = weight; nst.opacity = opacity; nst.visible = visible;
  applyLayerStyle(newId);
  if (!visible) setVisibility(newId, false);

  rebuildList();
  syncMapOrder();
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
function hideInfo() { $info?.setAttribute("hidden", "true"); }
