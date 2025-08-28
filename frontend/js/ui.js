// frontend/js/ui.js
import { map, switchBasemap, startAoiDraw, clearAoi, getAoiGeoJSON, stopAoiDraw, setAoiFromGeoJSON } from "./map.js";
import { state, setOrderFromDom, getById } from "./store.js";
import {
  addGeoJSONLayer, removeLayer, setVisibility,
  syncMapOrder, zoomToLayer,
  setCategoricalStyle, clearCategoricalStyle,
  addDebugMarker
} from "./layers.js";
import { refreshLegend } from "./legend.js";
import { toggleCommentMode, getCommentsGeoJSON } from "./features/comments.js";

// --- DOM
const $basemap       = document.getElementById("basemapSelect");
const $layerList     = document.getElementById("layerList");
const $btnImport     = document.getElementById("btnImport");

// HUD
const $hudCursor     = document.getElementById("hudCursor");
const $hudCenter     = document.getElementById("hudCenter");
const $hudZoom       = document.getElementById("hudZoom");
const $hudCenterBtn  = document.getElementById("hudCenterBtn");

// AOI
const $aoiPanel       = document.getElementById("aoiPanel");
const $btnAoi         = document.getElementById("btnDrawAoi");
const $btnClearAoi    = document.getElementById("btnClearAoi");
const $btnExportAoi   = document.getElementById("btnExportAoi");
const $chkIncludeAoi  = document.getElementById("chkIncludeAoi");
const $btnAoiComment  = document.getElementById("btnAoiComment");
const $btnAoiFromKmz  = document.getElementById("btn-aoi-from-kmz");

// Info
const $info          = document.getElementById("infoPanel");
const $infoClose     = document.getElementById("infoClose");
const $infoTitle     = document.getElementById("infoTitle");
const $infoBody      = document.getElementById("infoBody");

let aoiOn = false;

// ---------- helpers ----------
const escapeHtml = (s) => String(s ?? "")
  .replaceAll("&","&amp;").replaceAll("<","&lt;")
  .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
const fmtLL = (ll) => `${(+ll.lat).toFixed(6)}, ${(+ll.lng).toFixed(6)}`;

// ---------- map + HUD ----------
$basemap?.addEventListener("change", () => {
  try { switchBasemap($basemap.value); } catch (e) { console.error(e); }
});

map.on("mousemove", (e) => { $hudCursor && ($hudCursor.textContent = `cursor ${fmtLL(e.latlng)}`); });
map.on("moveend", () => {
  const c = map.getCenter();
  if ($hudCenter) $hudCenter.textContent = `center ${fmtLL(c)}`;
  if ($hudZoom)   $hudZoom.textContent   = `z${map.getZoom()}`;
});

$hudCenterBtn?.addEventListener("click", () => {
  window.dispatchEvent(new CustomEvent("ur-open-coord-search"));
});

// ---------- import ----------
$btnImport?.addEventListener("click", onImportFiles);

async function onImportFiles() {
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
    } else {
      console.error("Ingest failed:", res?.error || res);
      alert(`Failed to ingest:\n${p}\n${res?.error || ""}`);
    }
  }
  setOrderFromDom($layerList);
  syncMapOrder();
  refreshLegend();
}

// ---------- layer list ----------
export function rebuildList() {
  $layerList.innerHTML = "";
  for (const id of state.order) {
    const st = getById(id);
    if (!st) continue;
    $layerList.appendChild(buildLayerItem(id, st));
  }
  setOrderFromDom($layerList);
}

function buildLayerItem(id, st) {
  const li = document.createElement("li");
  li.className = "layer-item";
  li.dataset.layerId = id;
  li.innerHTML = `
    <div class="layer-top">
      <button class="drag-handle" title="Drag to reorder">☰</button>
      <div class="layer-name" title="${escapeHtml(st.name)}">${escapeHtml(st.name)}</div>
      <button class="zoom-btn" title="Zoom">⤢</button>
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
  styleBtn.addEventListener("click", () => openStyleModal(id));

  // DnD reorder
  dragHandle.setAttribute("draggable", "true");
  dragHandle.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    li.classList.add("dragging");
    draggingId = id;
  });
  dragHandle.addEventListener("dragend", () => { li.classList.remove("dragging"); draggingId = null; });

  return li;
}

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

// ---------- AOI mode ----------
$btnAoi?.addEventListener("click", () => {
  aoiOn = !aoiOn;
  if (aoiOn) {
    startAoiDraw();
    $aoiPanel?.removeAttribute("hidden");
    $btnAoi.classList.add("active");
  } else {
    stopAoiDraw();
    $aoiPanel?.setAttribute("hidden", "true");
    $btnAoi.classList.remove("active");
  }
});

$btnAoiFromKmz?.addEventListener("click", async () => {
  // Use dedicated IPC so we can parse KML/KMZ in main
  if (!window.backend?.aoiPickKmx) {
    alert("AOI importer not available (preload).");
    return;
  }
  const res = await window.backend.aoiPickKmx();
  if (!res?.ok || !res.geojson) {
    if (!res?.canceled) alert(`Failed to read AOI${res?.error ? ":\n" + res.error : ""}`);
    return;
  }
  try {
    // prefer polygons
    setAoiFromGeoJSON(res.geojson);
    if ($aoiPanel.hasAttribute("hidden")) {
      $aoiPanel.removeAttribute("hidden");
      $btnAoi?.classList.add("active");
    }
  } catch (e) {
    console.error(e);
    alert("Could not set AOI from that file.");
  }
});

$btnClearAoi?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); clearAoi(); });
$btnAoiComment?.addEventListener("click", (e) => {
  e.preventDefault(); e.stopPropagation();
  const on = toggleCommentMode();
  $btnAoiComment.classList.toggle("active", on);
});

$btnExportAoi?.addEventListener("click", onExportAoiKmz);

async function onExportAoiKmz(e) {
  e?.preventDefault?.();
  e?.stopPropagation?.();

  const aoi = getAoiGeoJSON();
  if (!aoi) { alert("Draw or set an AOI first."); return; }

  const layersForExport = [];
  for (const id of state.order) {
    const st = state.layers.get(id);
    if (!st?.visible || !st?.source?.features?.length) continue;

    const fc = st.source;
    const sb = st.styleBy;
    const hiddenSet = sb?.hidden || null;

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

  const opts = { includeAoi: !!$chkIncludeAoi?.checked };
  try {
    const res = await window.backend.exportAoiKmz(aoi, layersForExport, "aoi_export.kmz", opts);
    if (!res?.ok && !res?.canceled) alert("Export failed: " + (res?.error || "unknown"));
  } catch (err) {
    console.error("[exportAoiKmz]", err);
    alert("Export failed: " + (err?.message || err));
  }
}

// ---------- Info panel ----------
function showInfo(title, props) {
  if ($infoTitle) $infoTitle.textContent = title || "Feature Info";
  if ($infoBody) {
    const rows = Object.entries(props || {}).map(([k, v]) =>
      `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`
    ).join("");
    $infoBody.innerHTML = rows ? `<table>${rows}</table>` : "<em>No attributes</em>";
  }
  $info?.removeAttribute("hidden");
}
function hideInfo() { $info?.setAttribute("hidden", "true"); }
let lastIdentifyMarker = null;
window.addEventListener("ur-identify", (e) => {
  const d = e.detail || {};
  showInfo(d.layerName, d.properties, d.latlng);
  if (lastIdentifyMarker) { try { map.removeLayer(lastIdentifyMarker); } catch {} lastIdentifyMarker = null; }
  if (d.latlng) lastIdentifyMarker = addDebugMarker(d.latlng.lat, d.latlng.lng, "Clicked");
});
$infoClose?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); hideInfo(); }, { capture: true });

// Global Esc: close info; exit AOI draw if active
window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (aoiOn) {
    aoiOn = false;
    $btnAoi?.classList.remove("active");
    $aoiPanel?.setAttribute("hidden", "true");
    stopAoiDraw();
  } else {
    hideInfo();
  }
});

export {};
