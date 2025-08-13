// frontend/js/map.js
export const sharedCanvas = L.canvas({ padding: 0.5, tolerance: 3 });
const $map = document.getElementById("map");

export const map = L.map($map, { preferCanvas: true, zoomControl: false, renderer: sharedCanvas })
  .setView([39, -96], 4);

L.control.zoom({ position: "bottomright" }).addTo(map);

export const baseLayers = {
  osm: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    { attribution: "&copy; OpenStreetMap", maxZoom: 22 }),
  esri_streets: L.tileLayer(
    "https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Tiles © Esri" }),
  esri_sat: L.tileLayer(
    "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Imagery © Esri" }),
  carto_light: L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    { attribution: "&copy; CARTO & OpenStreetMap", maxZoom: 22 }),
  stamen_toner: L.tileLayer(
    "https://stamen-tiles.a.ssl.fastly.net/toner-lite/{z}/{x}/{y}.png",
    { attribution: "Map tiles by Stamen; Data © OpenStreetMap" }),
};

export let currentBase = baseLayers.osm.addTo(map);

export function switchBasemap(key) {
  if (!baseLayers[key]) return;
  if (currentBase) map.removeLayer(currentBase);
  currentBase = baseLayers[key].addTo(map);
}
