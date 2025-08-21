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


export const map = L.map($map, { preferCanvas: true, zoomControl: false, renderer: sharedCanvas })
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

// ---- AOI drawing (Leaflet.draw)
let aoiLayer = null;
let aoiDrawTool = null;   // <— track current draw tool

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
  if (aoiLayer) { map.removeLayer(aoiLayer); aoiLayer = null; }
}

export function getAoiGeoJSON() {
  return aoiLayer ? aoiLayer.toGeoJSON() : null;
}

map.on(L.Draw.Event.CREATED, (e) => {
  if (e.layerType !== "polygon") return;
  if (aoiLayer) map.removeLayer(aoiLayer);
  aoiLayer = e.layer;
  aoiLayer.setStyle?.(AOI_STYLE);
  aoiLayer.addTo(map);
  aoiLayer.bringToFront();          // keep it visible above tiles
  stopAoiDraw();
});


