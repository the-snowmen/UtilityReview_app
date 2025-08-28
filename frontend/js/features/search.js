// Coordinate search pop that opens when HUD center is clicked.
// Uses radio buttons + glass theme (matches your CSS block).
import { map } from "../map.js";

let $pop, $input, $go;
let isOpen = false;

function ensureUi() {
  if ($pop) return;
  $pop = document.createElement("div");
  $pop.className = "coord-pop";
  $pop.setAttribute("hidden", "true");
  $pop.innerHTML = `
    <div class="coord-head">
      <strong>GO TO COORDINATE</strong>
      <button class="coord-close" title="Close">✕</button>
    </div>
    <div class="coord-body">
      <input id="coordInput" type="text" placeholder="41.88 -87.63  |  41.88N 87.63W" />
      <div class="coord-row">
        <label class="radio"><input type="radio" name="coordMode" value="latlon" checked> lat, lon (default)</label>
        <label class="radio"><input type="radio" name="coordMode" value="lonlat"> lon, lat</label>
        <label class="radio"><input type="radio" name="coordMode" value="auto"> auto-detect</label>
        <button id="coordGo">Go</button>
      </div>
      <div class="hint">Tips: "41.88 -87.63" · "41.88N 87.63W" · "41.88, -87.63"</div>
    </div>`;
  document.body.appendChild($pop);

  const $close = $pop.querySelector(".coord-close");
  $input = $pop.querySelector("#coordInput");
  $go    = $pop.querySelector("#coordGo");

  $close.addEventListener("click", closeSearch);
  $go.addEventListener("click", go);
  $input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
}

function openSearch() {
  ensureUi();
  $pop.removeAttribute("hidden");
  isOpen = true;
  setTimeout(() => $input?.focus(), 0);
}
function closeSearch() {
  if (!$pop) return;
  $pop.setAttribute("hidden", "true");
  isOpen = false;
}

function selectedMode() {
  const el = document.querySelector('input[name="coordMode"]:checked');
  return el?.value || "latlon";
}

function go() {
  const text = ($input?.value || "").trim();
  const mode = selectedMode();
  const pair = parsePair(text);
  if (!pair) { alert("Enter coordinates like 41.88 -87.63 or 41.88N 87.63W"); return; }

  const ll = interpret(pair, mode);
  if (!ll) { alert("Coordinates out of bounds."); return; }

  const targetZ = Math.max(map.getZoom(), 18);
  map.setView([ll.lat, ll.lng], targetZ);
  closeSearch();
}

// ---- parsing helpers ----
function parsePair(s) {
  if (!s) return null;
  // "41.88 -87.63", "41.88, -87.63"
  const simple = s.match(/^\s*([+-]?\d+(\.\d+)?)\s*[, ]\s*([+-]?\d+(\.\d+)?)\s*$/);
  if (simple) return { a: parseFloat(simple[1]), b: parseFloat(simple[3]) };

  // "41.88N 87.63W" (any spacing/punct)
  const dms = s.match(/([+-]?\d+(\.\d+)?)\s*([NSEW])[^0-9\-+]*([+-]?\d+(\.\d+)?)\s*([NSEW])/i);
  if (dms) {
    const v1 = parseFloat(dms[1]), c1 = dms[3].toUpperCase();
    const v2 = parseFloat(dms[4]), c2 = dms[6].toUpperCase();
    const sign = (v,c) => (c === "S" || c === "W") ? -Math.abs(v) : Math.abs(v);
    let lat, lon;
    if (c1 === "N" || c1 === "S") { lat = sign(v1,c1); lon = sign(v2,c2); }
    else { lon = sign(v1,c1); lat = sign(v2,c2); }
    return { a: lat, b: lon };
  }
  return null;
}

function interpret(pair, mode) {
  let lat, lon;
  if (mode === "latlon") { lat = pair.a; lon = pair.b; }
  else if (mode === "lonlat") { lon = pair.a; lat = pair.b; }
  else {
    // auto
    if (Math.abs(pair.a) > 90 || (Math.abs(pair.b) <= 90 && Math.abs(pair.a) > Math.abs(pair.b))) {
      lon = pair.a; lat = pair.b;
    } else { lat = pair.a; lon = pair.b; }
  }
  if (!isFinite(lat) || !isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lng: lon };
}

// Open on HUD center click
window.addEventListener("ur-open-coord-search", openSearch);
// Escape closes
window.addEventListener("keydown", (e) => { if (isOpen && e.key === "Escape") closeSearch(); });

export {};
