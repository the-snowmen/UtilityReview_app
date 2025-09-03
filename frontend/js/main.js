// frontend/js/main.js
// Robust renderer entry: loads map module with fallback and wires UI.

import "./test_export.js";          // optional KMZ test button
import { initSearch } from "./features/search.js";

function $(sel, el = document) { return el.querySelector(sel); }
function show(el) { if (el) el.hidden = false; }
function hide(el) { if (el) el.hidden = true; }
function toggle(el) { if (el) el.hidden = !el.hidden; }

async function loadMapModule() {
  // Try ./map.js (same folder), then ./map/map.js (subfolder) as a fallback.
  try {
    const mod = await import("./map.js");
    console.log("Loaded map from ./map.js");
    return mod;
  } catch (e1) {
    console.warn("Failed to load ./map.js, trying ./map/map.js", e1);
    const mod = await import("./map/map.js");
    console.log("Loaded map from ./map/map.js");
    return mod;
  }
}

function formatCenter(map) {
  const c = map.getCenter();
  return `center ${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}`;
}

function wireHud(map) {
  const $hudCenter = $("#hudCenter");
  const $hudZoom   = $("#hudZoom");
  const $hudCursor = $("#hudCursor");
  const $hudCenterBtn = $("#hudCenterBtn");

  const updateCZ = () => {
    if ($hudCenter) $hudCenter.textContent = formatCenter(map);
    if ($hudZoom)   $hudZoom.textContent = `z${map.getZoom()}`;
  };
  map.on("moveend zoomend", updateCZ);
  updateCZ();

  map.on("mousemove", (e) => {
    if ($hudCursor) $hudCursor.textContent = `${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`;
  });

  $hudCenterBtn?.addEventListener("click", () => {
    console.log("HUD center clicked");
  });
}

function wireBasemap(switchBasemap) {
  const $sel = $("#basemapSelect");
  if (!$sel) return;
  $sel.value = "carto_light";
  $sel.addEventListener("change", (e) => {
    const key = e.target.value;
    switchBasemap(key);
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

  $btnClearAoi?.addEventListener("click", () => {
    clearAoi();
  });

  $btnExportAoi?.addEventListener("click", async () => {
    if (!window.backend?.exportKmz) { alert("Backend not available"); return; }
    const res = await window.backend.exportKmz({ name: "aoi_export" });
    if (!res?.ok) alert(`Export failed: ${res?.error || "unknown"}`);
    else alert(`Saved: ${res.path}`);
  });
}

function wireLayersPanel() {
  $("#layersHeader")?.addEventListener("click", () => {
    // Fit/refresh placeholder — you can expand later
    console.log("Layers header clicked");
  });
  $("#btnImport")?.addEventListener("click", () => {
    alert("Import flow not wired yet in this step.");
  });
}

async function boot() {
  try {
    const mapMod = await loadMapModule();
    const { initMap, switchBasemap, startAoiDraw, stopAoiDraw, clearAoi } = mapMod;

    if (typeof initMap !== "function") {
      console.error("initMap not exported from map module.");
      return;
    }

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
    console.error("Failed to load map module:", err);
    alert("Could not load map module. Check console for details.");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
