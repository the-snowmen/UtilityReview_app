// frontend/js/features/contextmenu.js
import { map } from "../map.js";

const PRECISION = 6; // <- change this if you want more/less decimals

let menuEl;
let lastLL = null;

function injectCssOnce() {
  if (document.getElementById("ur-ctx-css")) return;
  const s = document.createElement("style");
  s.id = "ur-ctx-css";
  s.textContent = `
    .ur-ctx {
      position: fixed;
      z-index: 99999;
      min-width: 240px;
      max-width: 320px;
      color: #e7eef8;
      background: rgba(31,41,55,0.30); /* opacity: 20% — tweak this alpha if you want */
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 14px 34px rgba(0,0,0,0.35);
      border-radius: 12px;
      backdrop-filter: blur(6px);
      padding: 8px;
      animation: ur-ctx-fade .12s ease-out;
    }
    @keyframes ur-ctx-fade { from { opacity:0; transform:scale(.98)} to { opacity:1; transform:scale(1)} }

    .ur-ctx h5 {
      margin: 0 0 6px 0;
      font: 600 12px/1.2 system-ui, Segoe UI, Roboto, Arial, sans-serif;
      color: #cbd5e1;
      letter-spacing: .04em;
      text-transform: uppercase;
    }

    .ur-ctx-row { display: flex; align-items: center; gap: 8px; margin: 6px 0; flex-wrap: wrap; }

    .ur-ctx .pill {
      appearance: none;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(15,23,42,0.35); /* gray-900 overlay */
      color: #e5e7eb;
      padding: 6px 10px;
      border-radius: 999px;
      font: 500 12px/1 system-ui, Segoe UI, Roboto, Arial, sans-serif;
      cursor: pointer;
      white-space: nowrap;
      max-width: 100%;
      text-overflow: ellipsis;
      overflow: hidden;
    }
    .ur-ctx .pill:hover { background: rgba(15,23,42,0.5); }
    .ur-ctx .pill.copied { border-color: rgba(34,197,94,.7); box-shadow: 0 0 0 2px rgba(34,197,94,.2) inset; }

    .ur-ctx .subtle {
      color: #94a3b8;
      font-size: 11px;
      margin-top: 2px;
    }
  `;
  document.head.appendChild(s);
}

function createMenu() {
  injectCssOnce();
  menuEl = document.createElement("div");
  menuEl.className = "ur-ctx";
  menuEl.setAttribute("hidden", "true");
  menuEl.innerHTML = `
    <h5>Map tools</h5>
    <div class="ur-ctx-row">
      <button class="pill" id="ur-ctx-copy-latlng" title="lat, lng"></button>
      <button class="pill" id="ur-ctx-copy-lnglat" title="lng, lat"></button>
    </div>
  `;
  document.body.appendChild(menuEl);

  // stop clicks inside from bubbling (so it doesn't close immediately)
  menuEl.addEventListener("mousedown", (e) => e.stopPropagation());
  menuEl.addEventListener("contextmenu", (e) => e.preventDefault());

  // copy handlers
  const btnLatLng = menuEl.querySelector("#ur-ctx-copy-latlng");
  const btnLngLat = menuEl.querySelector("#ur-ctx-copy-lnglat");

  btnLatLng.addEventListener("click", () => copyBtn(btnLatLng));
  btnLngLat.addEventListener("click", () => copyBtn(btnLngLat));
}

function fmt(lat, lng, order = "latlng") {
  const la = Number(lat).toFixed(PRECISION);
  const lo = Number(lng).toFixed(PRECISION);
  return order === "lnglat" ? `${lo}, ${la}` : `${la}, ${lo}`;
}

async function copyBtn(btn) {
  if (!lastLL) return;
  const isLngLat = btn.id === "ur-ctx-copy-lnglat";
  const text = isLngLat ? fmt(lastLL.lat, lastLL.lng, "lnglat") : fmt(lastLL.lat, lastLL.lng, "latlng");
  try {
    await copyToClipboard(text);
    flashCopied(btn);
  } catch {
    flashFail(btn);
  }
}

function flashCopied(btn) {
  btn.classList.add("copied");
  const old = btn.textContent;
  btn.textContent = "Copied!";
  setTimeout(() => { btn.classList.remove("copied"); btn.textContent = old; }, 900);
}
function flashFail(btn) {
  const old = btn.textContent;
  btn.textContent = "Copy failed";
  setTimeout(() => { btn.textContent = old; }, 900);
}

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  // Fallback
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(ta);
  if (!ok) throw new Error("copy failed");
}

function showAt(latlng, clientX, clientY) {
  if (!menuEl) createMenu();
  lastLL = latlng;

  // fill both pills
  menuEl.querySelector("#ur-ctx-copy-latlng").textContent = fmt(latlng.lat, latlng.lng, "latlng");
  menuEl.querySelector("#ur-ctx-copy-lnglat").textContent = fmt(latlng.lat, latlng.lng, "lnglat");

  // place near cursor with overflow guard
  menuEl.removeAttribute("hidden");
  menuEl.style.left = `${clientX + 8}px`;
  menuEl.style.top  = `${clientY + 8}px`;

  requestAnimationFrame(() => {
    const r = menuEl.getBoundingClientRect();
    let x = clientX + 8, y = clientY + 8;
    if (r.right > window.innerWidth - 8) x = clientX - (r.width + 8);
    if (r.bottom > window.innerHeight - 8) y = clientY - (r.height + 8);
    menuEl.style.left = `${Math.max(8, x)}px`;
    menuEl.style.top  = `${Math.max(8, y)}px`;
  });
}

function hide() {
  menuEl?.setAttribute("hidden", "true");
}

// Hook Leaflet right-click
map.on("contextmenu", (e) => {
  e?.originalEvent?.preventDefault?.();
  const { latlng } = e;
  const clientX = e?.originalEvent?.clientX ?? 0;
  const clientY = e?.originalEvent?.clientY ?? 0;
  showAt(latlng, clientX, clientY);
});

// Click-away & ESC
document.addEventListener("mousedown", (e) => {
  if (!menuEl || menuEl.hasAttribute("hidden")) return;
  if (e.target && menuEl.contains(e.target)) return; // inside menu
  hide();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });

// Hide on map interactions
map.on("movestart zoomstart", hide);
