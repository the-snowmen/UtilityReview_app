// frontend/js/ui.js
import { switchBasemap } from "./map.js";
import { state, setOrderFromDom, getById } from "./store.js";
import {
  addGeoJSONLayer,
  removeLayer,
  applyLayerStyle,
  setVisibility,
  syncMapOrder,
  zoomToLayer,
  zoomToAllVisible,
} from "./layers.js";

const $basemap = document.getElementById("basemapSelect");
const $btnImport = document.getElementById("btnImport");
const $btnFitAll = document.getElementById("btnFitAll");
const $layerList = document.getElementById("layerList");

$basemap?.addEventListener("change", () => switchBasemap($basemap.value));
$btnFitAll?.addEventListener("click", () => zoomToAllVisible());

$btnImport?.addEventListener("click", importFiles);
async function importFiles() {
  if (!window.backend?.selectFiles || !window.backend?.ingestFile) {
    alert("IPC not available. Check preload/electron wiring.");
    return;
  }
  const sel = await window.backend.selectFiles();
  const paths = Array.isArray(sel) ? sel : sel?.paths;
  if (!paths?.length) return;

  for (const p of paths) {
    const res = await window.backend.ingestFile(p, null);
    if (res?.ok && res.geojson) {
      const id = addGeoJSONLayer(res.name || p, res.geojson, true);
      const li = buildLayerItem(id, getById(id));
      $layerList.prepend(li);
      setOrderFromDom($layerList);
      syncMapOrder();
    } else {
      console.error("Ingest failed:", res?.error || res);
    }
  }
}

function clamp(n, min, max, fallback = min) {
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function buildLayerItem(id, st) {
  const li = document.createElement("li");
  li.className = "layer-item";
  li.dataset.layerId = id;

  li.innerHTML = `
    <div class="layer-top">
      <button class="drag-handle" title="Drag to reorder">☰</button>
      <div class="layer-name" title="${st.name}">${st.name}</div>
      <button class="zoom-btn" title="Zoom to this layer">⤢</button>
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
  const zoomBtn = li.querySelector(".zoom-btn");
  const dragHandle = li.querySelector(".drag-handle");

  chk.addEventListener("change", () => setVisibility(id, chk.checked));

  colorInput.addEventListener("input", () => {
    st.color = colorInput.value;
    applyLayerStyle(id);
  });
  weightInput.addEventListener("input", () => {
    const v = clamp(+weightInput.value, 0, 20, st.weight);
    st.weight = v;
    weightInput.value = String(v);
    applyLayerStyle(id);
  });
  opacityInput.addEventListener("input", () => {
    const v = clamp(+opacityInput.value, 0, 1, st.opacity);
    st.opacity = v;
    opacityInput.value = String(v);
    applyLayerStyle(id);
  });

  removeBtn.addEventListener("click", () => {
    removeLayer(id);
    li.remove();
    setOrderFromDom($layerList);
  });

  zoomBtn.addEventListener("click", () => zoomToLayer(id));

  // Handle-only drag
  dragHandle.setAttribute("draggable", "true");
  dragHandle.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    li.classList.add("dragging");
    draggingId = id;
  });
  dragHandle.addEventListener("dragend", () => {
    li.classList.remove("dragging");
    draggingId = null;
  });

  return li;
}

// single set of DnD listeners on the list
let draggingId = null;

$layerList.addEventListener("dragover", (e) => {
  if (!draggingId) return;
  e.preventDefault();
  const after = getDragAfterElement($layerList, e.clientY);
  const draggingEl = [...$layerList.children].find(n => n.dataset.layerId === draggingId);
  if (!draggingEl) return;
  if (after == null) $layerList.appendChild(draggingEl);
  else $layerList.insertBefore(draggingEl, after);
});

$layerList.addEventListener("drop", () => {
  setOrderFromDom($layerList);
  syncMapOrder();
});

function getDragAfterElement(container, y) {
  const els = [...container.querySelectorAll(".layer-item:not(.dragging)")];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

export function rebuildList() {
  $layerList.innerHTML = "";
  for (const id of state.order) {
    const li = buildLayerItem(id, getById(id));
    $layerList.appendChild(li);
  }
}
