// frontend/js/export/collect.js
// Collect AOI + visible GeoJSON layers from Leaflet without depending on app state.

import { map, getAoiGeoJSON } from "../map/map.js";

/**
 * Returns { aoi, layers }
 *  - aoi: GeoJSON (Feature|FeatureCollection|null)
 *  - layers: Array<{ name, geojson, style }>
 */
export function collectForExport() {
  const aoi = typeof getAoiGeoJSON === "function" ? (getAoiGeoJSON() || null) : null;

  const layers = [];
  map.eachLayer((layer) => {
    // Only export L.GeoJSON instances that are on the map (visible)
    if (layer instanceof L.GeoJSON) {
      const gj = layer.toGeoJSON();
      // Try to pull a friendly layer name and style options if present
      const name =
        layer.options?.name ||
        layer.feature?.properties?.name ||
        `Layer_${layer._leaflet_id}`;

      // Leaflet style usually on layer.options or through a style function.
      // We snapshot whatever static style we see on the layer.
      const style = {
        stroke: layer.options?.stroke !== false,
        color: layer.options?.color || "#22c55e",            // green default
        weight: layer.options?.weight ?? 2,
        fill: layer.options?.fill !== false,
        fillColor: layer.options?.fillColor || layer.options?.color || "#22c55e",
        fillOpacity: layer.options?.fillOpacity ?? 0.35,
        opacity: layer.options?.opacity ?? 1.0,
      };

      layers.push({ name, geojson: gj, style });
    }
  });

  return { aoi, layers };
}
