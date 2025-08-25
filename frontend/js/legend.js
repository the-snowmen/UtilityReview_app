// frontend/js/legend.js
import { map } from "./map.js";
import { state, getById } from "./store.js";

function swatchLine(color, px = 2) {
  const h = Math.max(8, px + 4), w = 32;
  const y = (h / 2).toFixed(1);
  return `
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="vertical-align:middle">
      <line x1="2" y1="${y}" x2="${w-2}" y2="${y}" stroke="${color}" stroke-width="${px}" stroke-linecap="round"/>
    </svg>`;
}
function swatchFill(color) {
  return `<span style="display:inline-block;width:16px;height:12px;border:1px solid #777;background:${color};vertical-align:middle;border-radius:2px"></span>`;
}
function swatchPoint(color, px = 2) {
  const r = Math.max(3, px + 2);
  const d = r * 2 + 2;
  return `
    <svg width="${d}" height="${d}" viewBox="0 0 ${d} ${d}" style="vertical-align:middle">
      <circle cx="${d/2}" cy="${d/2}" r="${r}" fill="${color}" stroke="#333" stroke-width="0.5"/>
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
      color: #0f172a;
      background: rgba(255,255,255,0.92);
      backdrop-filter: blur(4px);
      border: 1px solid rgba(0,0,0,0.1);
      border-radius: 10px;
      box-shadow: 0 10px 24px rgba(0,0,0,0.18);
      padding: 8px 10px;
      max-width: 280px;
      max-height: 40vh;
      overflow: auto;
    }
    .ur-legend h4 {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .08em;
      margin: 4px 4px 8px 4px;
      color: #334155;
    }
    .ur-legend .group {
      margin: 0 0 10px 0;
      padding: 6px 6px 4px 6px;
      border-radius: 8px;
      background: rgba(241,245,249,.7);
    }
    .ur-legend .group > .title {
      font-weight: 600;
      margin: 0 0 6px 0;
      color: #0b1324;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ur-legend-row { display: flex; align-items: center; gap: 8px; margin: 3px 0; }
    .ur-legend-row .swatch { width: 34px; display: inline-flex; justify-content: center; }
    .ur-legend-row .label { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ur-legend .muted { opacity: .55; }
    .leaflet-top.leaflet-right .ur-legend { margin-right: 12px; margin-top: 12px; }
  `;
  document.head.appendChild(style);
}

let div;
const control = L.control({ position: "topright" });
control.onAdd = function() {
  injectCssOnce();
  div = L.DomUtil.create("div", "ur-legend");
  div.innerHTML = `<h4>Legend</h4><div class="muted">No visible layers</div>`;
  L.DomEvent.disableClickPropagation(div);
  return div;
};
control.addTo(map);

export function refreshLegend() {
  if (!div) return;

  const groups = [];
  for (const id of state.order) {
    const st = getById(id);
    if (!st?.visible) continue;

    if (st.styleBy?.field) {
      const field = st.styleBy.field;
      const hidden = st.styleBy.hidden || new Set();
      const rules = st.styleBy.rules || {};
      const keys = Object.keys(rules);
      const rows = [];
      for (const k of keys) {
        if (hidden.has(String(k))) continue;
        const color = rules[k] || st.styleBy.defaultColor || st.color;
        const g = firstGeomType(st);
        const sw = g.includes("Point")
          ? swatchPoint(color, st.weight)
          : g.includes("Line")
          ? swatchLine(color, st.weight)
          : swatchFill(color);
        rows.push(entryRow({ label: `${field} = ${k}`, html: sw }));
      }
      if (!rows.length) rows.push(`<div class="ur-legend-row muted">(all categories hidden)</div>`);

      groups.push(`
        <div class="group">
          <div class="title">${st.name}</div>
          ${rows.join("")}
        </div>`);
    } else {
      groups.push(`
        <div class="group">
          <div class="title">${st.name}</div>
          ${entryRow({ label: "Features", html: swatchFor(st) })}
        </div>`);
    }
  }

  div.innerHTML = `<h4>Legend</h4>${groups.length ? groups.join("") : `<div class="muted">No visible layers</div>`}`;
}

// Build an initial legend
refreshLegend();
