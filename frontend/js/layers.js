// frontend/js/layers.js
import { map, sharedCanvas } from "./map.js";
import { state, nextId, getById } from "./store.js";

/** Normalize any GeoJSON-ish input to a FeatureCollection */
function toFeatureCollection(gj) {
  if (!gj) return { type: "FeatureCollection", features: [] };
  if (gj.type === "FeatureCollection") return gj;
  if (gj.type === "Feature") return { type: "FeatureCollection", features: [gj] };
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: gj }],
  };
}

function getPropKeys(geojson) {
  const f = geojson?.features?.[0] || null;
  return f ? Object.keys(f.properties || {}) : [];
}

export function addGeoJSONLayer(name, geojson, prependToTop = true) {
  const id = nextId();
  const paneName = `pane-${id}`;
  map.createPane(paneName);

  // Keep a sanitized deep copy for export/analysis (avoid circular refs)
  const source = JSON.parse(JSON.stringify(toFeatureCollection(geojson)));

  const st = {
    id,
    name: name || `Layer ${id}`,
    color: "#ff3333",
    weight: 2,
    opacity: 1,
    visible: true,
    propKeys: getPropKeys(source),
    paneName,
    layer: null,
    source,                 // <- stable clean copy
  };

  const leafletLayer = L.geoJSON(source, {
    pane: paneName,
    renderer: sharedCanvas,
    interactive: false,
    style: () => ({
      color: st.color,
      weight: st.weight,
      opacity: st.opacity,
      fillColor: st.color,
      fillOpacity: Math.max(0, Math.min(1, st.opacity * 0.5)),
    }),
    pointToLayer: (_f, latlng) =>
      L.circleMarker(latlng, {
        pane: paneName,
        interactive: false,
        radius: Math.max(3, st.weight + 1),
        color: st.color,
        opacity: st.opacity,
        fillOpacity: Math.max(0, Math.min(1, st.opacity * 0.5)),
      }),
  }).addTo(map);

  st.layer = leafletLayer;
  state.layers.set(id, st);
  if (prependToTop) state.order.unshift(id); else state.order.push(id);
  syncMapOrder();

  const b = leafletLayer.getBounds?.();
  if (b?.isValid()) map.fitBounds(b, { padding: [20, 20] });

  return id;
}

export function removeLayer(id) {
  const st = getById(id); if (!st) return;
  map.removeLayer(st.layer);
  state.layers.delete(id);
  state.order = state.order.filter(x => x !== id);
  syncMapOrder();
}

export function applyLayerStyle(id) {
  const st = getById(id); if (!st) return;
  const stroke = { color: st.color, weight: st.weight, opacity: st.opacity };
  const fill = { fillColor: st.color, fillOpacity: Math.max(0, Math.min(1, st.opacity * 0.5)) };
  st.layer.setStyle?.({ ...stroke, ...fill });
  st.layer.eachLayer?.(l => {
    if (l.setStyle) l.setStyle({ ...stroke, ...fill });
    if (l.setRadius) l.setRadius(Math.max(3, st.weight + 1));
  });
}

export function setVisibility(id, visible) {
  const st = getById(id); if (!st) return;
  st.visible = visible;
  if (visible) st.layer.addTo(map); else map.removeLayer(st.layer);
  syncMapOrder();
}

export function syncMapOrder() {
  let z = 500 + state.order.length;
  for (const id of state.order) {
    const st = getById(id); if (!st?.visible) continue;
    const pane = map.getPane(st.paneName);
    if (pane) pane.style.zIndex = String(z--);
  }
}

export function zoomToLayer(id) {
  const st = getById(id); if (!st) return;
  const b = st.layer.getBounds?.();
  if (b?.isValid()) map.fitBounds(b, { padding: [20, 20] });
}

export function zoomToAllVisible() {
  const bounds = L.latLngBounds();
  let hasAny = false;
  for (const id of state.order) {
    const st = getById(id); if (!st?.visible) continue;
    const b = st.layer.getBounds?.();
    if (b?.isValid()) { bounds.extend(b); hasAny = true; }
  }
  if (hasAny) map.fitBounds(bounds, { padding: [24, 24] });
}
