// frontend/js/map.js
export const sharedCanvas = L.canvas({ padding: 0.5, tolerance: 3 });
const $map = document.getElementById("map");

export const map = L.map($map, { preferCanvas: true, zoomControl: false, renderer: sharedCanvas })
  .setView([39, -96], 4);

L.control.zoom({ position: "bottomright" }).addTo(map);

// Optional: If you have a Stadia Maps API key, put it here. It also works without a key
// for light dev/testing usage, but a key is recommended for reliability/rate limits.
const STADIA_KEY = ""; // e.g. "your-api-key"

// Use Stadia Maps endpoints for Stamen layers
const stamenAttribution = '© <a href="https://stadiamaps.com/">Stadia Maps</a>, © <a href="https://stamen.com/">Stamen Design</a>, © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const baseLayers = {
  osm: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap",
    maxZoom: 22
  }),

  esri_streets: L.tileLayer(
    "https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Tiles © Esri", maxZoom: 22 }
  ),

  esri_sat: L.tileLayer(
    "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Imagery © Esri", maxZoom: 22 }
  ),

  carto_light: L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    { attribution: "&copy; CARTO & OpenStreetMap", maxZoom: 22 }
  ),
};

export let currentBase = baseLayers.carto_light.addTo(map);

export function switchBasemap(key) {
  if (!baseLayers[key]) return;
  if (currentBase) map.removeLayer(currentBase);
  currentBase = baseLayers[key].addTo(map);
}

// ---- AOI drawing (Leaflet.draw)
let aoiLayer = null;

export function startAoiDraw() {
  if (!L || !L.Draw || !L.Draw.Polygon) {
    alert("Leaflet.draw not loaded");
    return;
  }
  const draw = new L.Draw.Polygon(map, {
    shapeOptions: { color: "#111827", weight: 2, dashArray: "4,3", fillOpacity: 0.05 },
    allowIntersection: false,
    showArea: true,
  });
  draw.enable();
}

export function clearAoi() {
  if (aoiLayer) { map.removeLayer(aoiLayer); aoiLayer = null; }
}

export function getAoiGeoJSON() {
  return aoiLayer ? aoiLayer.toGeoJSON() : null;
}

map.on(L.Draw.Event.CREATED, (e) => {
  if (e.layerType !== "polygon") return;
  if (aoiLayer) map.removeLayer(aoiLayer);
  aoiLayer = e.layer;
  aoiLayer.setStyle?.({ color: "#111827", weight: 2, dashArray: "4,3", fillOpacity: 0.05 });
  aoiLayer.addTo(map);
});
