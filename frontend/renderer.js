// renderer.js

// ---------- utils ----------
function clamp(n, min, max, fallback = min) {
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
function debounce(fn, wait = 200) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}
function getPropKeys(geojson) {
  const f = geojson?.features?.[0] || null;
  return f ? Object.keys(f.properties || {}) : [];
}

// ---------- DOM ----------
const $map = document.getElementById("map");
const $basemap = document.getElementById("basemapSelect");
const $btnImport = document.getElementById("btnImport");
const $layerList = document.getElementById("layerList");

// ---------- Leaflet (Canvas) ----------
const sharedCanvas = L.canvas({ padding: 0.5, tolerance: 3 });
const map = L.map($map, { preferCanvas: true, renderer: sharedCanvas });
map.setView([39, -96], 4);

const baseLayers = {
  osm: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors", maxZoom: 22
  }),
  esri_streets: L.tileLayer(
    "https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Tiles © Esri" }
  ),
  esri_sat: L.tileLayer(
    "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Imagery © Esri" }
  ),
  carto_light: L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    { attribution: "&copy; CARTO & OpenStreetMap", maxZoom: 22 }
  ),
  stamen_toner: L.tileLayer(
    "https://stamen-tiles.a.ssl.fastly.net/toner-lite/{z}/{x}/{y}.png",
    { attribution: "Map tiles by Stamen; Data © OpenStreetMap" }
  )
};
let currentBase = baseLayers.osm.addTo(map);

// listen for basemap changes
$basemap?.addEventListener("change", () => {
  const key = $basemap.value;
  if (!baseLayers[key]) return;
  if (currentBase) map.removeLayer(currentBase);
  currentBase = baseLayers[key].addTo(map);
});

// ---------- state ----------
const layers = new Map(); // id -> { layer, name, color, weight, opacity, visible, paneName, propKeys }
let idCounter = 1;

// ---------- import ----------
async function importLayers() {
  if (!window.backend?.selectShapefiles || !window.backend?.ingestShapefile) {
    alert("IPC not available. Check preload/electron wiring.");
    return;
  }
  const sel = await window.backend.selectShapefiles(); // may return {ok, paths} or a raw array
  const paths = Array.isArray(sel) ? sel : sel?.paths;
  if (!paths?.length) return;

  for (const shpPath of paths) {
    const res = await window.backend.ingestShapefile(shpPath, null);
    if (res?.ok && res.geojson) addGeoJSONLayer(res.name || shpPath, res.geojson);
    else console.error("Ingest failed:", res?.error || res);
  }
}
$btnImport?.addEventListener("click", importLayers);

// ---------- add layer ----------
function addGeoJSONLayer(name, geojson) {
  const layerId = String(idCounter++);
  const paneName = `pane-${layerId}`;
  map.createPane(paneName);
  map.getPane(paneName).style.zIndex = String(500 + $layerList.children.length);

  const st = {
    name: name || `Layer ${layerId}`,
    color: "#ff3333",
    weight: 2,
    opacity: 1,
    visible: true,
    propKeys: getPropKeys(geojson),
    paneName
  };

  const leafletLayer = L.geoJSON(geojson, {
    renderer: sharedCanvas,
    pane: paneName,
    interactive: false,
    style: () => ({
      color: st.color,
      weight: st.weight,
      opacity: 1,
      fillColor: st.color,
      fillOpacity: 0.35
    }),
    pointToLayer: (_f, latlng) =>
      L.circleMarker(latlng, {
        pane: paneName,
        interactive: false,
        radius: Math.max(3, st.weight + 1)
      })
  }).addTo(map);

  st.layer = leafletLayer;
  layers.set(layerId, st);

  const b = leafletLayer.getBounds?.();
  if (b?.isValid()) map.fitBounds(b, { padding: [20, 20] });

  const li = buildLayerItem(layerId, st);
  $layerList.prepend(li);
  syncMapOrder();
  applyLayerStyle(layerId);
}

// ---------- UI row ----------
function buildLayerItem(layerId, st) {
  const li = document.createElement("li");
  li.className = "layer-item";
  li.dataset.layerId = layerId;
  li.draggable = true;

  li.innerHTML = `
    <div class="layer-top">
      <button class="drag-handle" title="Drag to reorder">☰</button>
      <div class="layer-name">${st.name}</div>
      <input type="checkbox" class="chk" ${st.visible ? "checked" : ""} />
      <button class="remove-btn" title="Remove layer">✕</button>
    </div>
    <div class="layer-controls">
      <span class="small-label">Color</span>
      <input type="color" class="color-chip" value="${st.color}">
      <span class="small-label">Weight</span>
      <input type="number" class="num weight-num" value="${st.weight}" min="0" max="20">
      <span class="small-label">Opacity</span>
      <input type="number" class="num opacity-num" value="${st.opacity}" min="0" max="1" step="0.05">
    </div>
  `;

  const chk = li.querySelector(".chk");
  const colorInput = li.querySelector(".color-chip");
  const weightInput = li.querySelector(".weight-num");
  const opacityInput = li.querySelector(".opacity-num");
  const removeBtn = li.querySelector(".remove-btn");

  chk.addEventListener("change", () => {
    st.visible = chk.checked;
    if (st.visible) st.layer.addTo(map); else map.removeLayer(st.layer);
    syncMapOrder();
  });

  colorInput.addEventListener("input", debounce(() => {
    st.color = colorInput.value;
    applyLayerStyle(layerId);
  }, 180));

  weightInput.addEventListener("input", debounce(() => {
    const v = clamp(+weightInput.value, 0, 20, st.weight);
    st.weight = v; weightInput.value = String(v);
    applyLayerStyle(layerId);
  }, 180));

  opacityInput.addEventListener("input", debounce(() => {
    const v = clamp(+opacityInput.value, 0, 1, st.opacity);
    st.opacity = v; opacityInput.value = String(v);
    const pane = map.getPane(st.paneName);
    if (pane) pane.style.opacity = String(v);
  }, 180));

  removeBtn.addEventListener("click", () => {
    map.removeLayer(st.layer);
    layers.delete(layerId);
    li.remove();
  });

  // drag & drop
  li.addEventListener("dragstart", () => li.classList.add("dragging"));
  li.addEventListener("dragend", () => { li.classList.remove("dragging"); syncMapOrder(); });
  li.addEventListener("dragover", (e) => {
    e.preventDefault();
    const dragging = $layerList.querySelector(".dragging");
    if (!dragging || dragging === li) return;
    const rect = li.getBoundingClientRect();
    const before = e.clientY - rect.top < rect.height / 2;
    if (before) $layerList.insertBefore(dragging, li);
    else $layerList.insertBefore(dragging, li.nextSibling);
  });

  return li;
}

// ---------- styling + order ----------
function applyLayerStyle(layerId) {
  const st = layers.get(layerId);
  if (!st) return;
  const stroke = { color: st.color, weight: st.weight, opacity: 1 };
  const fill = { fillColor: st.color, fillOpacity: 0.35 };
  st.layer.setStyle?.({ ...stroke, ...fill });
  st.layer.eachLayer?.(l => {
    if (l.setStyle) l.setStyle({ ...stroke, ...fill });
    if (l.setRadius) l.setRadius(Math.max(3, st.weight + 1));
  });
  const pane = map.getPane(st.paneName);
  if (pane) pane.style.opacity = String(st.opacity);
}
function syncMapOrder() {
  const ids = [...$layerList.children].map(n => n.dataset.layerId);
  let z = 500;
  for (const id of ids) {
    const st = layers.get(id);
    if (!st?.visible) continue;
    const pane = map.getPane(st.paneName);
    if (pane) pane.style.zIndex = String(z++);
  }
}
