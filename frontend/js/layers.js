// frontend/js/layers.js
import { map, sharedCanvas } from "./map.js";
import { state, nextId, getById } from "./store.js";
import { refreshLegend } from "./legend.js";

// Track temporary identify/debug markers so we can remove them.
const activeMarkers = new Set();

// ---------- helpers ----------
function toFeatureCollection(gj) {
  if (!gj) return { type: "FeatureCollection", features: [] };
  if (gj.type === "FeatureCollection") return gj;
  if (gj.type === "Feature") return { type: "FeatureCollection", features: [gj] };
  return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: gj }] };
}
function getPropKeys(fc) {
  const f = fc?.features?.[0] || null;
  return f ? Object.keys(f.properties || {}) : [];
}
function isHiddenByCategory(st, feature) {
  const sb = st.styleBy;
  if (!sb?.field || !sb?.hidden?.size) return false;
  const v = feature?.properties?.[sb.field];
  return sb.hidden.has(String(v));
}
function colorForFeature(st, feature) {
  const base = st.color || "#ff3333";
  const styleBy = st.styleBy;
  if (!styleBy?.field) return base;
  const v = feature?.properties?.[styleBy.field];
  const rules = styleBy.rules || {};
  const hit = v != null && rules[String(v)];
  return hit || styleBy.defaultColor || base;
}

function buildLeafletLayer(source, st, interactive) {
  if (st.layer) { try { map.removeLayer(st.layer); } catch {} st.layer = null; }

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
    pane: st.paneName,
    renderer: sharedCanvas,
    interactive,
    style: styleFn,
    filter: (feature) => !isHiddenByCategory(st, feature),
    pointToLayer: (feature, latlng) =>
      L.circleMarker(latlng, {
        pane: st.paneName,
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
          geomType: feature?.geometry?.type || null
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

// ---------- public API ----------
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
    source,
    interactive: true,            // ALWAYS interactive now (identify removed)
    styleBy: null,                // { field, rules:{val:color}, defaultColor, hidden:Set<string> }
  };

  buildLeafletLayer(source, st, st.interactive);

  state.layers.set(id, st);
  if (prependToTop) state.order.unshift(id); else state.order.push(id);
  syncMapOrder();

  const b = st.layer.getBounds?.();
  if (b?.isValid()) map.fitBounds(b, { padding: [20, 20] });

  refreshLegend();
  return id;
}

export function removeLayer(id) {
  const st = getById(id); if (!st) return;
  try { map.removeLayer(st.layer); } catch {}
  state.layers.delete(id);
  state.order = state.order.filter(x => x !== id);
  syncMapOrder();
  refreshLegend();
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
  refreshLegend();
}

export function setVisibility(id, visible) {
  const st = getById(id); if (!st) return;
  st.visible = visible;
  if (visible) { st.layer?.addTo(map); } else { try { map.removeLayer(st.layer); } catch {} }
  syncMapOrder();
  refreshLegend();
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
  const bounds = L.latLngBounds(); let hasAny = false;
  for (const id of state.order) {
    const st = getById(id); if (!st?.visible) continue;
    const b = st.layer.getBounds?.();
    if (b?.isValid()) { bounds.extend(b); hasAny = true; }
  }
  if (hasAny) map.fitBounds(bounds, { padding: [24, 24] });
}

// Identify toggle was removed; keep no-op for backward compatibility if anything imports it
export function setIdentifyMode(_on) {
  // no-op — features are always interactive now
}

export function addDebugMarker(lat, lng, label = "") {
  const m = L.marker([lat, lng], { keyboard: false });
  const txt = label ? `${label}<br>${lat.toFixed(6)}, ${lng.toFixed(6)}` : `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  m.bindPopup(txt, { closeButton: true, autoClose: false });
  m.on("popupclose", () => { try { map.removeLayer(m); } catch {} activeMarkers.delete(m); });
  m.addTo(map).openPopup(); activeMarkers.add(m); return m;
}
export function clearDebugMarkers() {
  for (const m of activeMarkers) { try { map.removeLayer(m); } catch {} }
  activeMarkers.clear();
}

// Categorical styling
export function setCategoricalStyle(id, field, rules, defaultColor, hiddenValues = []) {
  const st = getById(id); if (!st) return;
  const hidden = new Set((hiddenValues || []).map(String));
  st.styleBy = { field, rules: rules || {}, defaultColor: defaultColor || st.color, hidden };
  buildLeafletLayer(st.source, st, st.interactive);
  if (!st.visible) { try { map.removeLayer(st.layer); } catch {} }
  syncMapOrder();
  refreshLegend();
}

export function clearCategoricalStyle(id) {
  const st = getById(id); if (!st) return;
  st.styleBy = null;
  buildLeafletLayer(st.source, st, st.interactive);
  if (!st.visible) { try { map.removeLayer(st.layer); } catch {} }
  syncMapOrder();
  refreshLegend();
}
