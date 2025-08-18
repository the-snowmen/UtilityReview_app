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

/** Build (or rebuild) a Leaflet GeoJSON layer with an interactivity flag */
function buildLeafletLayer(source, st, interactive) {
  if (st.layer) {
    try { map.removeLayer(st.layer); } catch {}
    st.layer = null;
  }
  const paneName = st.paneName;

  const layer = L.geoJSON(source, {
    pane: paneName,
    renderer: sharedCanvas,
    interactive, // only active during Identify mode
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
        interactive,
        radius: Math.max(3, st.weight + 1),
        color: st.color,
        opacity: st.opacity,
        fillOpacity: Math.max(0, Math.min(1, st.opacity * 0.5)),
      }),
    onEachFeature: (feature, lyr) => {
      if (!interactive) return;
      lyr.on("click", (e) => {
        const detail = {
          layerId: st.id,
          layerName: st.name,
          latlng: e.latlng,
          properties: feature?.properties || {},
          geomType: feature?.geometry?.type || null,
        };
        window.dispatchEvent(new CustomEvent("ur-identify", { detail }));
      });
    },
  });

  st.layer = layer;
  if (st.visible !== false) layer.addTo(map);
  return layer;
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
    source,                 // stable clean copy used for export & rebuilds
    interactive: false,     // default off; Identify toggles it
  };

  buildLeafletLayer(source, st, st.interactive);

  state.layers.set(id, st);
  if (prependToTop) state.order.unshift(id); else state.order.push(id);
  syncMapOrder();

  const b = st.layer.getBounds?.();
  if (b?.isValid()) map.fitBounds(b, { padding: [20, 20] });

  return id;
}

export function removeLayer(id) {
  const st = getById(id); if (!st) return;
  try { map.removeLayer(st.layer); } catch {}
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
  if (visible) {
    st.layer?.addTo(map);
  } else {
    try { map.removeLayer(st.layer); } catch {}
  }
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

/** Toggle Identify mode by rebuilding layers with interactivity on/off */
export function setIdentifyMode(on) {
  for (const id of state.order) {
    const st = getById(id); if (!st) continue;
    st.interactive = !!on;
    buildLeafletLayer(st.source, st, st.interactive);
    if (!st.visible) {
      try { map.removeLayer(st.layer); } catch {}
    }
  }
  syncMapOrder();
}

/** Debug: add a marker with popup showing coordinates */
export function addDebugMarker(lat, lng, label = "") {
  const m = L.marker([lat, lng]).addTo(map);
  const txt = label ? `${label}<br>${lat.toFixed(6)}, ${lng.toFixed(6)}` : `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  m.bindPopup(txt).openPopup();
  return m;
}

