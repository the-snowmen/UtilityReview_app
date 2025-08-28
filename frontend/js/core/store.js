// frontend/js/store.js
export const state = {
  layers: new Map(), // id -> { layer, name, color, weight, opacity, visible, paneName, propKeys }
  order: [],         // top -> bottom order of ids
  idCounter: 1,
};

export function nextId() { return String(state.idCounter++); }
export function getById(id) { return state.layers.get(id); }

export function setOrderFromDom($ul) {
  state.order = [...$ul.children].map(n => n.dataset.layerId);
}
