// frontend/js/main.js
// Stable renderer entry: use static imports (no dynamic import() on file://)

import "./test_export.js";                 // optional KMZ test button
import { initSearch } from "./features/search.js";
import {
  initMap, switchBasemap,
  startAoiDraw, stopAoiDraw, clearAoi
} from "./map/map.js"; // <-- static import to avoid file:// dynamic-import flakiness

const $ = (sel, el = document) => el.querySelector(sel);
const show   = el => { if (el) el.hidden = false; };
const hide   = el => { if (el) el.hidden = true;  };
const toggle = el => { if (el) el.hidden = !el.hidden; };

function formatCenter(map) {
  const c = map.getCenter();
  return `center ${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}`;
}

function wireHud(map) {
  const $hudCenter    = $("#hudCenter");
  const $hudZoom      = $("#hudZoom");
  const $hudCursor    = $("#hudCursor");
  const $hudCenterBtn = $("#hudCenterBtn");

  const updateCZ = () => {
    if ($hudCenter) $hudCenter.textContent = formatCenter(map);
    if ($hudZoom)   $hudZoom.textContent   = `z${map.getZoom()}`;
  };
  map.on("moveend zoomend", updateCZ);
  updateCZ();

  map.on("mousemove", (e) => {
    if ($hudCursor) $hudCursor.textContent =
      `${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`;
  });

  $hudCenterBtn?.addEventListener("click", () => {
    console.log("HUD center clicked");
  });
}

function wireBasemap(switchBasemapFn) {
  const $sel = $("#basemapSelect");
  if (!$sel) return;
  $sel.value = "carto_light";
  $sel.addEventListener("change", (e) => {
    const key = e.target.value;
    switchBasemapFn(key);
  });
}

function wireAoi({ startAoiDraw, stopAoiDraw, clearAoi }) {
  const $btnDrawAoi   = $("#btnDrawAoi");
  const $btnClearAoi  = $("#btnClearAoi");
  const $btnExportAoi = $("#btnExportAoi");
  const $aoiPanel     = $("#aoiPanel");

  $btnDrawAoi?.addEventListener("click", () => {
    toggle($aoiPanel);
    if ($aoiPanel && !$aoiPanel.hidden) startAoiDraw();
    else stopAoiDraw();
  });

  $btnClearAoi?.addEventListener("click", () => clearAoi());

  $btnExportAoi?.addEventListener("click", async () => {
    if (!window.backend?.exportKmz) { alert("Backend not available"); return; }
    const res = await window.backend.exportKmz({ name: "aoi_export" });
    if (!res?.ok) alert(`Export failed: ${res?.error || "unknown"}`);
    else alert(`Saved: ${res.path}`);
  });
}

function wireLayersPanel() {
  $("#layersHeader")?.addEventListener("click", () => {
    console.log("Layers header clicked");
  });
  $("#btnImport")?.addEventListener("click", () => {
    alert("Import flow not wired yet in this step.");
  });
}

function boot() {
  try {
    const map = initMap();
    if (!map) {
      console.error("Map failed to initialize. Check Leaflet includes and #map element.");
      return;
    }
    wireHud(map);
    wireBasemap(switchBasemap);
    wireAoi({ startAoiDraw, stopAoiDraw, clearAoi });
    wireLayersPanel();

    try { initSearch?.(); } catch (e) { console.error("initSearch error:", e); }

    console.log("App ready. Leaflet:", L?.version, "Backend bridge:", typeof window.backend);
  } catch (err) {
    console.error("Failed to start app:", err);
    alert("Could not start app. Check console for details.");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
