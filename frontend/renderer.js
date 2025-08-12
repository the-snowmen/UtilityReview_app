// frontend/renderer.js

// ---------- Map + basemaps ----------
const map = L.map("map", { zoomControl: false });

const baseLayers = {
  osm: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 22
  }),
  esri_streets: L.tileLayer(
    "https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Tiles © Esri" }
  ),
  esri_sat: L.tileLayer(
    "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Imagery © Esri" }
  )
};

let currentBase = baseLayers.osm.addTo(map);
L.control.zoom({ position: "bottomright" }).addTo(map);
map.setView([39.5, -98.5], 4); // USA-ish default

// ---------- UI refs ----------
const $btnImport  = document.getElementById("btnImport");
const $layerList  = document.getElementById("layerList");
const $basemapSel = document.getElementById("basemapSel");

// ---------- Sanity ----------
try { console.log(window.backend?.ping?.() || "preload available"); } catch { console.warn("no preload"); }

// ---------- State ----------
const layers = new Map(); // id -> { layer, name, color, weight, opacity, visible, propKeys }
let idCounter = 1;

// palette
const PALETTE = ["#d81b60","#1e88e5","#43a047","#f4511e","#8e24aa","#3949ab","#00897b","#fdd835","#5d4037","#0081cb"];
let paletteIdx = 0;
const nextColor = () => { const c = PALETTE[paletteIdx % PALETTE.length]; paletteIdx++; return c; };

// ---------- Basemap switching ----------
$basemapSel.addEventListener("change", () => {
  const v = $basemapSel.value;
  if (currentBase) map.removeLayer(currentBase);
  currentBase = baseLayers[v];
  currentBase.addTo(map);
});

// ---------- Import (dialog) ----------
$btnImport.addEventListener("click", async () => {
  try {
    const paths = await window.backend.selectShapefiles();
    if (!paths || paths.length === 0) return;
    for (const p of paths) await loadShapefile(p);
  } catch (e) {
    console.error("Import error:", e);
    alert("Import failed. Check DevTools console for details.");
  }
});

// ---------- Import (drag & drop) ----------
const dropTargets = [document.body, document.getElementById("map")];
dropTargets.forEach(t => {
  t.addEventListener("dragover", (e) => { e.preventDefault(); e.stopPropagation(); });
  t.addEventListener("drop", async (e) => {
    e.preventDefault(); e.stopPropagation();
    const files = [...(e.dataTransfer?.files || [])];
    const shpFiles = files.filter(f => f.path && f.path.toLowerCase().endsWith(".shp"));
    if (shpFiles.length === 0) {
      if (files.length) alert("Drop a .shp file (keep .shx/.dbf/.prj beside it).");
      return;
    }
    for (const f of shpFiles) await loadShapefile(f.path);
  });
});

// ---------- Helpers ----------
function getPropKeys(geojson) {
  const keys = new Set();
  for (const f of geojson.features || []) {
    if (f.properties) {
      for (const k of Object.keys(f.properties)) keys.add(k);
      if (keys.size >= 30) break;
    }
  }
  return Array.from(keys).sort();
}

function clamp(v, min, max, fallback) {
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

// Apply color/weight/opacity + point radius
function applyLayerStyle(layerId) {
  const st = layers.get(layerId);
  if (!st) return;

  const stroke = { color: st.color, weight: st.weight, opacity: st.opacity };
  const fill   = { fillColor: st.color, fillOpacity: Math.min(st.opacity * 0.35, 1) };

  st.layer.setStyle?.({ ...stroke, ...fill });

  st.layer.eachLayer(l => {
    if (l.setStyle)  l.setStyle({ ...stroke, ...fill });
    if (l.setRadius) l.setRadius(Math.max(3, st.weight + 1));
  });
}

// Zoom to layer
function zoomToLayer(layerId) {
  const st = layers.get(layerId);
  if (!st) return;

  let b = null;
  try { b = st.layer.getBounds(); } catch {}
  if (b && b.isValid()) {
    map.fitBounds(b.pad(0.05));
    return;
  }

  // Fallback for pure point layers
  const pts = [];
  st.layer.eachLayer(l => { if (l.getLatLng) pts.push(l.getLatLng()); });
  if (pts.length) {
    map.fitBounds(L.latLngBounds(pts).pad(0.3));
  }
}

// ---------- Loader ----------
async function loadShapefile(shpPath) {
  console.log("[loadShapefile]", shpPath);
  let res = await window.backend.ingestShapefile(shpPath, null);

  if (res?.needsSrcEpsg) {
    const guess = "4269";
    const epsg = prompt(
      "This shapefile is missing a .prj.\nEnter the SOURCE EPSG (e.g., 3857 Web Mercator, 4269 NAD83, 3435 WISCRS, 4326 WGS84):",
      guess
    );
    if (!epsg) return;
    res = await window.backend.ingestShapefile(shpPath, epsg.trim());
  }
  if (!res || !res.ok) {
    console.error("ingest failed:", res);
    alert(`Failed to import:\n${res?.error || "Unknown error"}`);
    return;
  }

  console.log("debug:", res?.debug); // quick extent/types sanity

  const { name, geojson } = res;
  const color   = nextColor();
  const weight  = 2;
  const opacity = 1;

  const layerId = String(idCounter++);
  const layer = L.geoJSON(geojson, {
    pointToLayer: (_f, latlng) => L.circleMarker(latlng)
  }).addTo(map);

  try {
    const b = layer.getBounds();
    if (b.isValid()) map.fitBounds(b.pad(0.05));
  } catch {}

  layers.set(layerId, {
    layer, name, color, weight, opacity,
    visible: true,
    propKeys: getPropKeys(geojson)
  });

  addLayerRow(layerId);
  applyLayerStyle(layerId);
  syncMapOrder();
}

// ---------- UI rows ----------
function addLayerRow(layerId) {
  const st = layers.get(layerId);

  const li = document.createElement("li");
  li.className = "layer-item";
  li.dataset.layerId = layerId;

  // Top row
  const top = document.createElement("div");
  top.className = "layer-top";

  const handle = document.createElement("button");
  handle.className = "drag-handle";
  handle.title = "Reorder";
  handle.textContent = "≡";
  handle.draggable = true;

  const name = document.createElement("div");
  name.className = "layer-name";
  name.textContent = st.name;
  name.title = "Double-click to zoom";
  name.addEventListener("dblclick", (e) => {
    e.preventDefault();
    e.stopPropagation();
    zoomToLayer(layerId);
  });

  const toggle = document.createElement("input");
  toggle.type = "checkbox"; toggle.className = "chk"; toggle.checked = true;
  toggle.title = "Show/Hide";
  toggle.addEventListener("change", () => {
    st.visible = toggle.checked;
    if (st.visible) st.layer.addTo(map); else map.removeLayer(st.layer);
    syncMapOrder();
  });

  const zoomBtn = document.createElement("button");
  zoomBtn.type = "button";
  zoomBtn.textContent = "Zoom";
  zoomBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    zoomToLayer(layerId);
  });

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.textContent = "Remove";
  removeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    removeLayer(layerId, li);
  });

  top.appendChild(handle);
  top.appendChild(name);
  top.appendChild(toggle);
  top.appendChild(zoomBtn);
  top.appendChild(removeBtn);

  // Controls row
  const ctrl = document.createElement("div");
  ctrl.className = "layer-controls";

  // Color
  const colorLbl = document.createElement("span"); colorLbl.className = "small-label"; colorLbl.textContent = "Color";
  const colorInput = document.createElement("input");
  colorInput.type = "color"; colorInput.className = "color-chip"; colorInput.value = st.color;
  colorInput.addEventListener("input", () => {
    st.color = colorInput.value;
    applyLayerStyle(layerId);
  });

  // Weight (number)
  const wLbl = document.createElement("span"); wLbl.className = "small-label"; wLbl.textContent = "Weight";
  const wNum = document.createElement("input");
  wNum.type = "number"; wNum.className = "num"; wNum.min = "0"; wNum.max = "20"; wNum.step = "0.5";
  wNum.value = String(st.weight);
  wNum.addEventListener("change", () => {
    const v = clamp(+wNum.value, 0, 20, st.weight);
    st.weight = v; wNum.value = String(v);
    applyLayerStyle(layerId);
  });

  // Opacity (0..1)
  const oLbl = document.createElement("span"); oLbl.className = "small-label"; oLbl.textContent = "Opacity";
  const oNum = document.createElement("input");
  oNum.type = "number"; oNum.className = "num"; oNum.min = "0"; oNum.max = "1"; oNum.step = "0.05";
  oNum.value = String(st.opacity);
  oNum.addEventListener("change", () => {
    const v = clamp(+oNum.value, 0, 1, st.opacity);
    st.opacity = v; oNum.value = String(v);
    applyLayerStyle(layerId);
  });

  // mount controls (labels only: Color, Weight, Opacity)
  ctrl.appendChild(colorLbl); ctrl.appendChild(colorInput);
  ctrl.appendChild(wLbl);     ctrl.appendChild(wNum);
  ctrl.appendChild(oLbl);     ctrl.appendChild(oNum);

  // assemble
  li.appendChild(top);
  li.appendChild(ctrl);
  $layerList.appendChild(li);

  // Drag only from handle
  handle.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", layerId);
    e.dataTransfer.effectAllowed = "move";
  });
  li.addEventListener("dragover", (e) => { e.preventDefault(); li.classList.add("drag-over"); });
  li.addEventListener("dragleave", () => li.classList.remove("drag-over"));
  li.addEventListener("drop", (e) => {
    e.preventDefault(); li.classList.remove("drag-over");
    const draggedId = e.dataTransfer.getData("text/plain");
    const draggedEl = [...$layerList.children].find(n => n.dataset.layerId === draggedId);
    if (!draggedEl || draggedEl === li) return;
    const rect = li.getBoundingClientRect();
    const before = (e.clientY - rect.top) < rect.height / 2;
    $layerList.insertBefore(draggedEl, before ? li : li.nextSibling);
    syncMapOrder();
  });

  // Stop drag bubbling from interactive controls
  [removeBtn, zoomBtn, colorInput, wNum, oNum, toggle].forEach(el => {
    el.setAttribute("draggable", "false");
    ["pointerdown","mousedown","touchstart","dragstart"].forEach(evt =>
      el.addEventListener(evt, ev => ev.stopPropagation())
    );
  });
}

// ---------- Remove & ordering ----------
function removeLayer(layerId, rowEl) {
  const st = layers.get(layerId);
  if (!st) return;
  map.removeLayer(st.layer);
  layers.delete(layerId);
  rowEl?.remove();
}

function syncMapOrder() {
  // Visible layers render in the same order as the list (top row on top)
  const ids = [...$layerList.children].map(n => n.dataset.layerId);

  // remove all visible
  for (const id of ids) {
    const st = layers.get(id);
    if (st?.visible) map.removeLayer(st.layer);
  }

  // re-add in list order
  for (const id of ids) {
    const st = layers.get(id);
    if (!st?.visible) continue;
    st.layer.addTo(map);
    applyLayerStyle(id); // also re-sets point radii
  }
}
