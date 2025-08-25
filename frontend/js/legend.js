// frontend/js/legend.js
import { map } from "./map.js";
import { state, getById } from "./store.js";

// Keep per-layer collapsed state across refreshes (keyed by layer id)
const collapsed = new Map();

function swatchLine(color, px = 2) {
  const h = Math.max(8, px + 4), w = 32;
  const y = (h / 2).toFixed(1);
  return `
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="vertical-align:middle">
      <line x1="2" y1="${y}" x2="${w-2}" y2="${y}" stroke="${color}" stroke-width="${px}" stroke-linecap="round"/>
    </svg>`;
}
function swatchFill(color) {
  return `<span style="display:inline-block;width:16px;height:12px;border:1px solid rgba(255,255,255,.18);background:${color};vertical-align:middle;border-radius:2px"></span>`;
}
function swatchPoint(color, px = 2) {
  const r = Math.max(3, px + 2);
  const d = r * 2 + 2;
  return `
    <svg width="${d}" height="${d}" viewBox="0 0 ${d} ${d}" style="vertical-align:middle">
      <circle cx="${d/2}" cy="${d/2}" r="${r}" fill="${color}" stroke="rgba(0,0,0,.6)" stroke-width="0.5"/>
    </svg>`;
}
function firstGeomType(st) {
  const f = st?.source?.features?.find?.(x => x?.geometry?.type);
  return f?.geometry?.type || "Unknown";
}
function swatchFor(st) {
  const g = firstGeomType(st);
  if (g.includes("Point")) return swatchPoint(st.color, st.weight);
  if (g.includes("Line"))  return swatchLine(st.color, st.weight);
  if (g.includes("Poly"))  return swatchFill(st.color);
  return swatchLine(st.color, st.weight);
}
function entryRow({ label, html }) {
  return `<div class="ur-legend-row">
    <span class="swatch">${html}</span>
    <span class="label" title="${label}">${label}</span>
  </div>`;
}

function injectCssOnce() {
  if (document.getElementById("ur-legend-css")) return;
  const style = document.createElement("style");
  style.id = "ur-legend-css";
  style.textContent = `
    .ur-legend {
      font: 12px system-ui, Segoe UI, Roboto, Arial, sans-serif;
      color: #e7eef8;
      background: rgba(31,41,55,0.92); /* gray-800 glass */
      backdrop-filter: blur(6px);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      box-shadow: 0 14px 34px rgba(0,0,0,0.35);
      padding: 8px 10px;
      max-width: 320px;
      max-height: 44vh;
      overflow: auto;
    }
    .ur-legend h4 {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .12em;
      margin: 4px 4px 8px 4px;
      color: #cbd5e1; /* muted */
    }
    .ur-legend .group {
      margin: 0 0 10px 0;
      border-radius: 10px;
      background: rgba(15,23,42,0.25); /* gray-900 overlay */
      border: 1px solid rgba(255,255,255,0.06);
    }
    .ur-legend .group .hdr {
      display: flex; align-items: center; gap: 8px;
      cursor: pointer; user-select: none;
      padding: 8px 8px 6px 8px;
    }
    .ur-legend .group .caret {
      width: 12px; height: 12px; display:inline-block;
      border-right: 2px solid #94a3b8; border-bottom: 2px solid #94a3b8;
      transform: rotate(45deg); transition: transform .18s ease;
      margin-right: 2px;
    }
    .ur-legend .group.collapsed .caret { transform: rotate(-45deg); }
    .ur-legend .group .title {
      font-weight: 600; color: #e2e8f0;
      flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .ur-legend .body { padding: 0 8px 8px 8px; }
    .ur-legend .group.collapsed .body { display: none; }
    .ur-legend-row {
      display: flex; align-items: center; gap: 8px; margin: 4px 0;
      color: #f1f5f9;
    }
    .ur-legend-row .swatch {
      width: 34px; display: inline-flex; justify-content: center;
      filter: drop-shadow(0 1px 0 rgba(0,0,0,.25));
    }
    .ur-legend-row .label {
      flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      color: #e5e7eb;
    }
    .ur-legend .muted { opacity: .6; color: #cbd5e1; }
    /* move to lower-right */
    .leaflet-bottom.leaflet-right .ur-legend { margin-right: 12px; margin-bottom: 12px; }
  `;
  document.head.appendChild(style);
}

let div;
const control = L.control({ position: "bottomright" });
control.onAdd = function() {
  injectCssOnce();
  div = L.DomUtil.create("div", "ur-legend");
  div.innerHTML = `<h4>Legend</h4><div class="muted">No visible layers</div>`;
  L.DomEvent.disableClickPropagation(div);
  // Toggle expand/collapse via delegation
  div.addEventListener("click", (e) => {
    const hdr = e.target.closest(".group .hdr");
    if (!hdr) return;
    const group = hdr.closest(".group");
    const id = group?.dataset?.layerId;
    if (!id) return;
    const isCollapsed = !!collapsed.get(id);
    collapsed.set(id, !isCollapsed);
    group.classList.toggle("collapsed", !isCollapsed);
  });
  return div;
};
control.addTo(map);

function renderGroup(st) {
  // Build rows
  let rows = "";
  if (st.styleBy?.field) {
    const field = st.styleBy.field;
    const hidden = st.styleBy.hidden || new Set();
    const rules = st.styleBy.rules || {};
    const keys = Object.keys(rules);
    for (const k of keys) {
      if (hidden.has(String(k))) continue;
      const color = rules[k] || st.styleBy.defaultColor || st.color;
      const g = firstGeomType(st);
      const sw = g.includes("Point")
        ? swatchPoint(color, st.weight)
        : g.includes("Line")
          ? swatchLine(color, st.weight)
          : swatchFill(color);
      rows += entryRow({ label: `${field} = ${k}`, html: sw });
    }
    if (!rows) rows = `<div class="ur-legend-row muted">(all categories hidden)</div>`;
  } else {
    rows = entryRow({ label: "Features", html: swatchFor(st) });
  }

  const id = String(st.id);
  const isCollapsed = !!collapsed.get(id);
  return `
    <div class="group ${isCollapsed ? "collapsed" : ""}" data-layer-id="${id}">
      <div class="hdr"><span class="caret"></span><div class="title">${st.name}</div></div>
      <div class="body">${rows}</div>
    </div>`;
}

export function refreshLegend() {
  if (!div) return;

  const groups = [];
  for (const id of state.order) {
    const st = getById(id);
    if (!st?.visible) continue;
    if (!collapsed.has(String(st.id))) collapsed.set(String(st.id), false); // default expanded
    groups.push(renderGroup(st));
  }

  div.innerHTML = `<h4>Legend</h4>${groups.length ? groups.join("") : `<div class="muted">No visible layers</div>`}`;
}

// initial
refreshLegend();
