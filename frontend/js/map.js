// frontend/js/map.js
export const sharedCanvas = L.canvas({ padding: 0.5, tolerance: 3 });
const $map = document.getElementById("map");

// High-contrast AOI style (works on dark/light basemaps)
const AOI_STYLE = {
  color: "#ff5a5f",        // stroke (light red)
  weight: 2,
  dashArray: "6,4",
  fillColor: "#ff9aa2",    // soft red fill
  fillOpacity: 0.20
};

// ----------------------------------------------------------------------------
// Map + basemaps
// ----------------------------------------------------------------------------
export const map = L.map($map, {
  preferCanvas: true,
  zoomControl: false,
  renderer: sharedCanvas,
  worldCopyJump: true
})
  .setView([39, -96], 4);

export const baseLayers = {
  osm: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap",
    maxZoom: 22
  }),

  esri_streets: L.tileLayer(
    "https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Tiles © Esri", maxZoom: 19 }
  ),

  esri_sat: L.tileLayer(
    "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Imagery © Esri", maxZoom: 19 }
  ),

  carto_light: L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    { attribution: "&copy; CARTO & OpenStreetMap", maxZoom: 19 }
  ),

  carto_dark: L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    { attribution: "&copy; CARTO & OpenStreetMap", maxZoom: 19 }
  ),
};

export let currentBase = baseLayers.carto_light.addTo(map);

export function switchBasemap(key) {
  if (!baseLayers[key]) return;
  if (currentBase) map.removeLayer(currentBase);
  currentBase = baseLayers[key].addTo(map);
}

// ----------------------------------------------------------------------------
/** AOI management: draw, clear, get/set from GeoJSON (single source of truth) */
// ----------------------------------------------------------------------------
let aoiLayer = null;     // Leaflet layer for AOI
let aoiDrawTool = null;  // current Leaflet.draw tool instance

export function startAoiDraw() {
  if (!L || !L.Draw || !L.Draw.Polygon) {
    alert("Leaflet.draw not loaded");
    return;
  }
  if (aoiDrawTool?.disable) aoiDrawTool.disable();

  aoiDrawTool = new L.Draw.Polygon(map, {
    shapeOptions: AOI_STYLE,
    allowIntersection: false,
    showArea: true,
  });
  aoiDrawTool.enable();
}

export function stopAoiDraw() {
  if (aoiDrawTool?.disable) aoiDrawTool.disable();
  aoiDrawTool = null;
}

export function clearAoi() {
  try { if (aoiLayer) map.removeLayer(aoiLayer); } catch {}
  aoiLayer = null;
}

// Returns AOI as a Feature (Polygon or MultiPolygon) or null
export function getAoiGeoJSON() {
  return aoiLayer ? aoiLayer.toGeoJSON() : null;
}

// Programmatically set AOI from a GeoJSON Feature (Polygon/MultiPolygon)
export function setAoiFromGeoJSON(feature) {
  if (!feature || !feature.type || feature.type !== "Feature") {
    throw new Error("setAoiFromGeoJSON expects a GeoJSON Feature");
  }
  const g = feature.geometry;
  if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) {
    throw new Error("AOI must be a Polygon or MultiPolygon feature");
  }

  // Replace the existing AOI layer
  clearAoi();
  aoiLayer = L.geoJSON(feature, { style: AOI_STYLE }).addTo(map);
  try {
    const b = aoiLayer.getBounds();
    if (b && b.isValid()) map.fitBounds(b, { padding: [24, 24] });
  } catch {}
}

// When user finishes drawing a polygon, make it the AOI and fit
map.on(L.Draw.Event.CREATED, (e) => {
  if (e.layerType !== "polygon") return;

  // Replace existing AOI layer
  clearAoi();
  aoiLayer = e.layer;
  aoiLayer.setStyle?.(AOI_STYLE);
  aoiLayer.addTo(map);
  aoiLayer.bringToFront();

  // Fit to AOI
  try {
    const b = aoiLayer.getBounds();
    if (b && b.isValid()) map.fitBounds(b, { padding: [24, 24] });
  } catch {}

  // Stop drawing mode
  stopAoiDraw();
});
