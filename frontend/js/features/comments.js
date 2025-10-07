// frontend/js/features/comments.js
import { map } from "../map.js";

let COMMENT_MODE = false;

// own pane so pins float above vectors
const paneName = "pane-comments";
if (!map.getPane(paneName)) {
  map.createPane(paneName);
  map.getPane(paneName).style.zIndex = "1200";
}

const group = L.layerGroup().addTo(map);
const idToMarker = new Map();
const comments = []; // {id, lat, lng, title, text, color, createdAt}
let counter = 1;

// ---- public API
export function toggleCommentMode() {
  setCommentMode(!COMMENT_MODE);
  return COMMENT_MODE;
}

export function setCommentMode(on) {
  COMMENT_MODE = !!on;
  map.getContainer().style.cursor = on ? "crosshair" : "";
  if (on) map.on("click", onMapClick);
  else map.off("click", onMapClick);
}

export function getCommentsGeoJSON() {
  return {
    type: "FeatureCollection",
    features: comments.map(c => ({
      type: "Feature",
      properties: {
        title: c.title || "",
        text: c.text || "",
        color: c.color || "#f59e0b",
        createdAt: c.createdAt,
        // convenience for exporter tooltip
        comment: c.title ? `${c.title}\n\n${c.text || ""}` : (c.text || "")
      },
      geometry: { type: "Point", coordinates: [c.lng, c.lat] }
    })),
  };
}

export function clearComments() {
  group.clearLayers();
  idToMarker.clear();
  comments.length = 0;
}

// ---- internals
function onMapClick(e) {
  if (!COMMENT_MODE) return;

  // ignore clicks on existing markers/popups
  const t = e?.originalEvent?.target;
  if (t && (t.closest(".leaflet-marker-icon") || t.closest(".leaflet-popup"))) return;

  createNewComment(e.latlng);
}

function createNewComment(latlng) {
  const c = {
    id: counter++,
    lat: latlng.lat,
    lng: latlng.lng,
    title: "",
    text: "",
    color: "#f59e0b",
    createdAt: new Date().toISOString()
  };

  const marker = L.circleMarker(latlng, {
    pane: paneName,
    radius: 6,
    color: c.color,
    fillColor: c.color,
    fillOpacity: 0.85,
    weight: 1,
    bubblingMouseEvents: false,
  }).addTo(group);

  idToMarker.set(c.id, marker);
  openEditPopup(marker, c, /*isNew*/ true);
}

function openViewPopup(marker, c) {
  const popupHtml = viewHtml(c);
  const popupOpts = { className: "ur-ctx-pop", closeButton: false, autoClose: true, maxWidth: 340 };

  const onOpen = (ev) => {
    if (ev.popup._source !== marker) return;
    const $root = ev.popup.getElement();

    // keep clicks inside from hitting the map
    L.DomEvent.disableClickPropagation($root);

    $root.querySelector(".js-close")?.addEventListener("click", () => marker.closePopup());
    $root.querySelector(".js-edit")?.addEventListener("click", () => openEditPopup(marker, c, false));
    $root.querySelector(".js-del")?.addEventListener("click", () => {
      if (!confirm("Delete this comment?")) return;
      deleteComment(c.id);
    });
  };

  marker.once("popupopen", onOpen);
  marker.bindPopup(popupHtml, popupOpts);
  marker.openPopup();
}

function openEditPopup(marker, c, isNew) {
  const popupHtml = editHtml(c, isNew);
  const popupOpts = { className: "ur-ctx-pop", closeButton: false, autoClose: false, maxWidth: 360 };

  const onOpen = (ev) => {
    if (ev.popup._source !== marker) return;
    const $root = ev.popup.getElement();

    L.DomEvent.disableClickPropagation($root);

    const $title = $root.querySelector(".js-title");
    const $text  = $root.querySelector(".js-text");
    const $color = $root.querySelector(".js-color");

    $root.querySelector(".js-cancel")?.addEventListener("click", () => {
      if (isNew) {
        // cancel brand new comment → remove marker
        deleteComment(c.id);
      } else {
        openViewPopup(marker, c);
      }
    });

    $root.querySelector(".js-save")?.addEventListener("click", () => {
      c.title = ($title?.value || "").trim();
      c.text  = ($text?.value  || "").trim();
      c.color = ($color?.value || "#f59e0b");

      // add to store if new
      if (!comments.find(x => x.id === c.id)) comments.push(c);

      // update marker appearance
      try {
        marker.setStyle({ color: c.color, fillColor: c.color });
      } catch {}

      openViewPopup(marker, c);
    });

    // autofocus title
    setTimeout(() => $title?.focus(), 0);
  };

  marker.once("popupopen", onOpen);
  marker.bindPopup(popupHtml, popupOpts);
  marker.openPopup();
}

function deleteComment(id) {
  const idx = comments.findIndex(c => c.id === id);
  if (idx >= 0) comments.splice(idx, 1);
  const m = idToMarker.get(id);
  if (m) { try { group.removeLayer(m); } catch {} }
  idToMarker.delete(id);
  map.closePopup();
}

// ----- tiny templating -----
function coordsLabel(lat, lng) { return `${(+lat).toFixed(6)}, ${(+lng).toFixed(6)}`; }

function viewHtml(c) {
  const title = escapeHtml(c.title || "(No title)");
  const text  = escapeHtml(c.text  || "");
  const coords = coordsLabel(c.lat, c.lng);
  return `
    <div class="ur-cmt">
      <div class="hdr">
        <div class="t">${title}</div>
        <button class="js-close ur-btn ghost">✕</button>
      </div>
      <div class="meta">${coords}</div>
      ${text ? `<div class="body"><pre>${text}</pre></div>` : ""}
      <div class="row actions">
        <button class="js-edit ur-btn">Edit</button>
        <button class="js-del ur-btn danger">Delete</button>
      </div>
    </div>`;
}

function editHtml(c, isNew) {
  const coords = coordsLabel(c.lat, c.lng);
  return `
    <div class="ur-cmt">
      <div class="hdr">
        <div class="t">${isNew ? "New Comment" : "Edit Comment"}</div>
        <button class="js-cancel ur-btn ghost">✕</button>
      </div>
      <div class="meta">${coords}</div>
      <div class="row">
        <label>Title</label>
        <input class="js-title" type="text" value="${escapeAttr(c.title || "")}">
      </div>
      <div class="row">
        <label>Text</label>
        <textarea class="js-text" rows="4">${escapeAttr(c.text || "")}</textarea>
      </div>
      <div class="row">
        <label>Color</label>
        <input class="js-color" type="color" value="${escapeAttr(c.color || "#f59e0b")}">
      </div>
      <div class="row actions">
        ${isNew ? `<button class="js-cancel ur-btn ghost">Cancel</button>`
                : `<button class="js-del ur-btn danger">Delete</button>`}
        <button class="js-save ur-btn solid">Save</button>
      </div>
    </div>`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}
function escapeAttr(s) { return escapeHtml(s).replaceAll("\n", "&#10;"); }

// Clicking an existing marker opens the view popup
group.on("click", (e) => {
  const m = e?.layer;
  if (!m) return;
  const c = [...idToMarker.entries()].find(([,mk]) => mk === m)?.[0];
  const found = comments.find(x => x.id === c);
  if (found) openViewPopup(m, found);
});
