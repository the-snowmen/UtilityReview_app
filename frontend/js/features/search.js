// frontend/js/features/search.js
import { map } from "../map.js";

const $popover   = document.getElementById("coordSearch");
const $openBtn   = document.getElementById("hudCenterBtn");
const $closeBtn  = document.getElementById("coordClose");
const $input     = document.getElementById("coordInput");
const $go        = document.getElementById("coordGo");

// ---------- Open/close & positioning ----------
function openSearch(prefillFromCenter = true) {
  if (prefillFromCenter) {
    const c = map.getCenter();
    $input.value = `${round6(c.lat)}, ${round6(c.lng)}`;
  }
  $popover.removeAttribute("hidden");
  positionPopover();               // <-- keep it fully on-screen
  queueMicrotask(() => $input?.focus());
}
function closeSearch() { $popover.setAttribute("hidden", "true"); }

function round6(n) { return Number(n).toFixed(6); }

function positionPopover() {
  // Anchor near the HUD center button; clamp to viewport
  try {
    const btn = $openBtn;
    const pop = $popover;
    if (!btn || !pop || pop.hasAttribute("hidden")) return;

    const br = btn.getBoundingClientRect();
    const pr = pop.getBoundingClientRect();
    const pad = 8;

    // Preferred left = button's left edge
    let left = Math.round(br.left);
    // If it would overflow right, shift left
    const maxLeft = window.innerWidth - pr.width - pad;
    left = Math.max(pad, Math.min(left, maxLeft));

    // Preferred bottom is already set via CSS; but if too tall, nudge up
    let bottom = parseInt(getComputedStyle(pop).bottom, 10) || 60;
    const willOverflowTop = (window.innerHeight - bottom - pr.height) < pad;
    if (willOverflowTop) bottom = Math.min(bottom + (pad + pr.height - (window.innerHeight - bottom)), 200);

    pop.style.left = `${left}px`;
    pop.style.bottom = `${bottom}px`;
  } catch {}
}

window.addEventListener("resize", positionPopover);

// ---------- Mode ----------
function readMode() {
  const el = document.querySelector('input[name="coordMode"]:checked');
  return el?.value === "lonlat" ? "lonlat" : "latlon";
}

// ---------- Parser (comma or space; N/S/E/W prefixes/suffixes) ----------
function parsePair(text) {
  if (!text) return null;
  // normalize odd separators to space
  const cleaned = text.trim().replaceAll(/[，;|]/g, " ");
  const parts = cleaned.split(/[\s,]+/).filter(Boolean);
  if (parts.length < 2) return null;

  const a = parseCoord(parts[0]);
  const b = parseCoord(parts[1]);
  if (a == null || b == null) return null;

  return [a, b];
}

function parseCoord(token) {
  if (!token) return null;
  token = token.trim().toUpperCase();

  // detect directional suffix/prefix (N,S,E,W)
  let sign = 1;
  if (/[NSEW]$/.test(token)) {
    const dir = token.at(-1);
    token = token.slice(0, -1);
    if (dir === "S" || dir === "W") sign = -1;
  } else if (/^[NSEW]/.test(token)) {
    const dir = token[0];
    token = token.slice(1);
    if (dir === "S" || dir === "W") sign = -1;
  }

  const num = Number(token);
  if (Number.isNaN(num)) return null;
  return num * sign;
}

function interpret(pair, mode) {
  let lat, lon;
  if (mode === "lonlat") { lon = pair[0]; lat = pair[1]; }
  else { lat = pair[0]; lon = pair[1]; }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return [lat, lon];
}

// ---------- Action ----------
async function go() {
  const text = $input.value;
  const pair = parsePair(text);
  if (!pair) { alert("Enter coordinates like 41.88 -87.63 or 41.88N 87.63W"); return; }

  const mode = readMode();
  const ll = interpret(pair, mode);
  if (!ll) { alert("Coordinates out of bounds."); return; }

  const currentZ = map.getZoom();
  const targetZ = currentZ < 10 ? 14 : currentZ;
  map.setView([ll[0], ll[1]], targetZ);
  closeSearch();
}

// ---------- Wiring ----------
$openBtn?.addEventListener("click", (e) => { e.preventDefault(); openSearch(true); });
$closeBtn?.addEventListener("click", () => closeSearch());
$go?.addEventListener("click", () => go());
$input?.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });

// Keyboard shortcut: "/" opens search (unless you're already typing)
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {            // ESC closes
    if (!$popover.hasAttribute("hidden")) { e.preventDefault(); closeSearch(); }
    return;
  }
  if (e.key !== "/") return;
  const t = e.target;
  const isTyping = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
  if (isTyping) return;
  e.preventDefault();                   // “/” = open
  openSearch(true);
});
