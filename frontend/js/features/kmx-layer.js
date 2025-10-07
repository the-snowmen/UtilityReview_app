// frontend/features/kmx-layer.js
const { ipcRenderer } = require("electron");
const aoi = require("./aoi");

let _map = null;
const _layers = new Map(); // id -> { group, name, fc, visible }

const STYLE_POLY = { color: "#ff5a5f", weight: 2, fillOpacity: 0.30 };
const STYLE_LINE = { color: "#ff5a5f", weight: 3 };
const POINT_RADIUS = 5;

function init(mapInstance) {
  _map = mapInstance;
}

function _renderFC(fc) {
  return L.geoJSON(fc, {
    style: f => {
      const t = f.geometry?.type;
      if (t === "Polygon" || t === "MultiPolygon") return STYLE_POLY;
      if (t === "LineString" || t === "MultiLineString") return STYLE_LINE;
      return STYLE_LINE;
    },
    pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: POINT_RADIUS, ...STYLE_LINE, fillOpacity: 0.7 }),
  });
}

function _fitTo(group) {
  try {
    const b = group.getBounds();
    if (b && b.isValid()) _map.fitBounds(b, { padding: [24, 24] });
  } catch {}
}

function _uid() {
  return "kmx_" + Math.random().toString(36).slice(2, 9);
}

function addLayerFromFC(name, fc, { fit = true } = {}) {
  if (!_map) throw new Error("kmx-layer not initialized");
  const group = _renderFC(fc).addTo(_map);
  const id = _uid();
  _layers.set(id, { id, name, fc, group, visible: true });
  if (fit) _fitTo(group);
  return id;
}

function setVisible(id, visible) {
  const ent = _layers.get(id);
  if (!ent) return;
  if (visible && !ent.visible) {
    ent.group.addTo(_map);
    ent.visible = true;
  } else if (!visible && ent.visible) {
    ent.group.remove();
    ent.visible = false;
  }
}

function remove(id) {
  const ent = _layers.get(id);
  if (!ent) return;
  ent.group.remove();
  _layers.delete(id);
}

function fitTo(id) {
  const ent = _layers.get(id);
  if (ent) _fitTo(ent.group);
}

function useAsAoi(id) {
  const ent = _layers.get(id);
  if (!ent) return alert("Layer not found.");
  // Merge all polygons from this layer's FC
  const polysOnly = {
    type: "FeatureCollection",
    features: (ent.fc.features || []).filter(f => {
      const t = f.geometry?.type;
      return t === "Polygon" || t === "MultiPolygon";
    }),
  };
  if (!polysOnly.features.length) {
    alert("This layer has no polygons to use as an AOI.");
    return;
  }
  // Build a single AOI feature (Polygon or MultiPolygon)
  const coords = [];
  for (const f of polysOnly.features) {
    const g = f.geometry;
    if (g.type === "Polygon") coords.push(g.coordinates);
    else if (g.type === "MultiPolygon") coords.push(...g.coordinates);
  }
  const feature =
    coords.length === 1
      ? { type: "Feature", properties: { name: `AOI: ${ent.name}` }, geometry: { type: "Polygon", coordinates: coords[0] } }
      : { type: "Feature", properties: { name: `AOI: ${ent.name}` }, geometry: { type: "MultiPolygon", coordinates: coords } };
  aoi.setAoiFeature(feature);
}

async function importKmxAsLayer() {
  const resp = await ipcRenderer.invoke("layer:import-kmx");
  if (!resp) return; // user canceled
  if (!resp.ok) {
    console.error(resp.error);
    alert(`Import failed:\n${resp.error}`);
    return;
  }
  const id = addLayerFromFC(resp.name, resp.fc, { fit: true });
  // Return metadata so caller can add it to the Layers panel UI
  return { id, name: resp.name };
}

module.exports = {
  init,
  importKmxAsLayer,
  addLayerFromFC,
  setVisible,
  remove,
  fitTo,
  useAsAoi,
};
