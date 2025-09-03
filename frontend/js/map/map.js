// frontend/js/map.js
// Initialize Leaflet *after* DOM is ready. Export functions for other modules.

export let map = null;
export let currentBase = null;

const AOI_STYLE = {
  color: "#ff5a5f",
  weight: 2,
  dashArray: "6,4",
  fillColor: "#ff9aa2",
  fillOpacity: 0.20,
};

let aoiLayer = null;
let aoiDrawTool = null;

export function initMap() {
  // Ensure DOM element exists
  const el = document.getElementById("map");
  if (!el) {
    console.error("Map container #map not found in DOM.");
    return null;
  }

  // Ensure Leaflet is loaded
  if (!window.L) {
    console.error("Leaflet (L) is not loaded. Include leaflet.js before this script.");
    return null;
  }

  // Create a shared canvas renderer (optional perf)
  const sharedCanvas = L.canvas({ padding: 0.5, tolerance: 3 });

  // Create map
  map = L.map(el, { preferCanvas: true, zoomControl: false, renderer: sharedCanvas })
          .setView([39, -96], 4);

  // Basemaps
  const baseLayers = {
    osm: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 22,
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
      { attribution: "© CARTO & OpenStreetMap", maxZoom: 19 }
    ),
    carto_dark: L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { attribution: "© CARTO & OpenStreetMap", maxZoom: 19 }
    ),
  };

  currentBase = baseLayers.carto_light.addTo(map);

  // Expose a simple switcher
  map.__urBaseLayers = baseLayers;
  return map;
}

export function switchBasemap(key) {
  if (!map || !map.__urBaseLayers) return;
  const next = map.__urBaseLayers[key];
  if (!next) return;
  if (currentBase) map.removeLayer(currentBase);
  currentBase = next.addTo(map);
}

/* ---------------- AOI management ---------------- */

export function startAoiDraw() {
  if (!map) return;
  if (!L || !L.Draw || !L.Draw.Polygon) {
    alert("Leaflet.draw not loaded (include leaflet.draw.js and .css).");
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
  if (map && aoiLayer) {
    try { map.removeLayer(aoiLayer); } catch {}
  }
  aoiLayer = null;
}

export function getAoiGeoJSON() {
  return aoiLayer ? aoiLayer.toGeoJSON() : null;
}

export function setAoiFromGeoJSON(feature) {
  if (!map) return;
  if (!feature || feature.type !== "Feature") throw new Error("GeoJSON Feature required");
  const g = feature.geometry;
  if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) {
    throw new Error("AOI must be Polygon or MultiPolygon");
  }
  clearAoi();
  aoiLayer = L.geoJSON(feature, { style: AOI_STYLE }).addTo(map);
  try {
    const b = aoiLayer.getBounds();
    if (b?.isValid()) map.fitBounds(b, { padding: [24, 24] });
  } catch {}
}

// Attach once the map exists
if (typeof window !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    // If another module calls initMap() first, skip here.
    if (!map) initMap();

    if (map && L?.Draw) {
      map.on(L.Draw.Event.CREATED, (e) => {
        if (e.layerType !== "polygon") return;
        clearAoi();
        aoiLayer = e.layer;
        aoiLayer.setStyle?.(AOI_STYLE);
        aoiLayer.addTo(map);
        aoiLayer.bringToFront();
        try {
          const b = aoiLayer.getBounds();
          if (b?.isValid()) map.fitBounds(b, { padding: [24, 24] });
        } catch {}
        stopAoiDraw();
      });
    }
  });
}
