// frontend/js/layers.js
import { map, sharedCanvas } from "./map.js";
import { state, nextId, getById } from "./store.js";

/** Track temporary identify/debug markers so we can remove them. */
const activeMarkers = new Set();

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

/** Helper: test if a feature should be hidden based on the styleBy.hidden set */
function isHiddenByCategory(st, feature) {
  const sb = st.styleBy;
  if (!sb?.field || !sb?.hidden?.size) return false;
  const v = feature?.properties?.[sb.field];
  return sb.hidden.has(String(v));
}

/** Pick a color for a feature based on st.styleBy (if present) */
function colorForFeature(st, feature) {
  const base = st.color || "#ff3333";
  const styleBy = st.styleBy;
  if (!styleBy?.field) return base;
  const val = feature?.properties?.[styleBy.field];
  const rules = styleBy.rules || {};
  const match = val != null && rules[String(val)];
  return match || styleBy.defaultColor || base;
}

/** Build (or rebuild) a Leaflet GeoJSON layer with an interactivity flag */
function buildLeafletLayer(source, st, interactive) {
  if (st.layer) {
    try { map.removeLayer(st.layer); } catch {}
    st.layer = null;
  }
  const paneName = st.paneName;

  const styleFn = (feature) => {
    const color = colorForFeature(st, feature);
    return {
      color,
      weight: st.weight,
      opacity: st.opacity,
      fillColor: color,
      fillOpacity: Math.max(0, Math.min(1, st.opacity * 0.5)),
    };
  };

  const layer = L.geoJSON(source, {
    pane: paneName,
    renderer: sharedCanvas,
    interactive, // only active during Identify mode
    style: styleFn,
    // NEW: filter features hidden by category
    filter: (feature) => !isHiddenByCategory(st, feature),
    pointToLayer: (feature, latlng) =>
      L.circleMarker(latlng, {
        pane: paneName,
        interactive,
        radius: Math.max(3, st.weight + 1),
        color: colorForFeature(st, feature),
        opacity: st.opacity,
        fillColor: colorForFeature(st, feature),
        fillOpacity: Math.max(0, Math.min(1, st.opacity * 0.5)),
      }),
    onEachFeature: (feature, lyr) => {
      if (!interactive) return;
      const handler = (e) => {
        const detail = {
          layerId: st.id,
          layerName: st.name,
          latlng: e.latlng,
          properties: feature?.properties || {},
          geomType: feature?.geometry?.type || null,
        };
        window.dispatchEvent(new CustomEvent("ur-identify", { detail }));
      };
      lyr.on("click", handler);
      if (lyr.eachLayer) lyr.eachLayer(ch => ch.on && ch.on("click", handler));
    },
  });

  st._styleFn = styleFn;
  st.layer = layer;
  if (st.visible !== false) layer.addTo(map);
  return layer;
}

export function addGeoJSONLayer(name, geojson, prependToTop = true) {
  const id = nextId();
  const paneName = `pane-${id}`;
  map.createPane(paneName);

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
    // NEW: styleBy can now include a hidden Set
    styleBy: null,          // { field, rules: {value:color}, defaultColor, hidden:Set<string> }
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
  const styleFn = (f) => {
    const color = colorForFeature(st, f);
    return {
      color,
      weight: st.weight,
      opacity: st.opacity,
      fillColor: color,
      fillOpacity: Math.max(0, Math.min(1, st.opacity * 0.5)),
    };
  };
  st._styleFn = styleFn;

  // Rebuild when styleBy filtering is active so filter() runs again.
  if (st.styleBy?.hidden?.size) {
    buildLeafletLayer(st.source, st, st.interactive);
    if (!st.visible) { try { map.removeLayer(st.layer); } catch {} }
  } else {
    st.layer.setStyle?.(styleFn);
    st.layer.eachLayer?.(l => {
      if (l.setStyle && l.feature) l.setStyle(styleFn(l.feature));
      if (l.setRadius) l.setRadius(Math.max(3, st.weight + 1));
    });
  }
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

/** Add a marker with popup showing coordinates. Removes itself when popup closes. */
export function addDebugMarker(lat, lng, label = "") {
  const m = L.marker([lat, lng], { keyboard: false });
  const txt = label
    ? `${label}<br>${lat.toFixed(6)}, ${lng.toFixed(6)}`
    : `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

  m.bindPopup(txt, { closeButton: true, autoClose: false });
  m.on("popupclose", () => {
    try { map.removeLayer(m); } catch {}
    activeMarkers.delete(m);
  });

  m.addTo(map).openPopup();
  activeMarkers.add(m);
  return m;
}

/** Remove all temporary markers. */
export function clearDebugMarkers() {
  for (const m of activeMarkers) {
    try { map.removeLayer(m); } catch {}
  }
  activeMarkers.clear();
}

/** === New: Categorical styling API with hide support === **/

/**
 * Set per-category colors for a given layer ID.
 * @param {number} id
 * @param {string} field  - attribute/column name
 * @param {Record<string,string>} rules - value->color map
 * @param {string} defaultColor - fallback color
 * @param {string[]} hiddenValues - values to hide
 */
export function setCategoricalStyle(id, field, rules, defaultColor, hiddenValues = []) {
  const st = getById(id); if (!st) return;
  const hidden = new Set((hiddenValues || []).map(String));
  st.styleBy = { field, rules: rules || {}, defaultColor: defaultColor || st.color, hidden };
  buildLeafletLayer(st.source, st, st.interactive);
  if (!st.visible) { try { map.removeLayer(st.layer); } catch {} }
  syncMapOrder();
}

/** Clear the categorical styling and go back to a single color */
export function clearCategoricalStyle(id) {
  const st = getById(id); if (!st) return;
  st.styleBy = null;
  buildLeafletLayer(st.source, st, st.interactive);
  if (!st.visible) { try { map.removeLayer(st.layer); } catch {} }
  syncMapOrder();
}
