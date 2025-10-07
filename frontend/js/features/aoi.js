// frontend/features/aoi.js
// AOI management + "Set AOI from KML/KMZ" glue in the renderer.

const { ipcRenderer } = require("electron");

let _map = null;
let _aoiLayer = null;
let _aoiFeature = null;

// tweak to match your theme
const AOI_STYLE = {
  color: "#ff5a5f",
  weight: 2,
  fillOpacity: 0.30,
};

function initAoi(mapInstance) {
  _map = mapInstance;
}

function clearAoi() {
  if (_aoiLayer) {
    _aoiLayer.remove();
    _aoiLayer = null;
  }
  _aoiFeature = null;
}

function setAoiFeature(geojsonFeature) {
  if (!_map) throw new Error("AOI not initialized (missing map).");

  clearAoi();

  _aoiFeature = geojsonFeature;

  _aoiLayer = L.geoJSON(geojsonFeature, {
    style: () => AOI_STYLE,
    pane: "overlayPane", // or your custom pane if you have one
  }).addTo(_map);

  try {
    const b = _aoiLayer.getBounds();
    if (b && b.isValid()) _map.fitBounds(b, { padding: [24, 24] });
  } catch (e) {
    // no-op if no bounds
  }
}

function getAoiFeature() {
  return _aoiFeature;
}

// Opens file dialog via IPC, parses, then applies AOI
async function pickAndSetAoiFromKmx() {
  const resp = await ipcRenderer.invoke("aoi:pick-kmx");
  if (!resp) return; // user canceled
  if (!resp.ok) {
    console.error("AOI import error:", resp.error);
    alert(`Failed to import KML/KMZ:\n${resp.error}`);
    return;
  }
  setAoiFeature(resp.feature);
}

// Optional helper to wire a button
function bindImportFromKmx(btn) {
  if (!btn) return;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    pickAndSetAoiFromKmx();
  });
}

module.exports = {
  initAoi,
  setAoiFeature,
  getAoiFeature,
  clearAoi,
  pickAndSetAoiFromKmx,
  bindImportFromKmx,
};
