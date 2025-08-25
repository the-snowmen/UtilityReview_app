// frontend/js/features/comments.js
import { map } from "../map.js";

let commentMode = false;
let group = null;
let features = [];                 // [{ id, type:'Feature', properties:{comment}, geometry:{Point}}]
const markers = new Map();         // id -> Leaflet marker
let nextId = 1;

function ensureLayerGroup() {
  if (!group) group = L.layerGroup().addTo(map);
}

// ---- Public API (used by ui.js)
export function setCommentMode(on) { commentMode = !!on; if (commentMode) ensureLayerGroup(); }
export function toggleCommentMode() { setCommentMode(!commentMode); return commentMode; }
export function clearComments() {
  features = [];
  markers.forEach(m => { try { group?.removeLayer(m); } catch {} });
  markers.clear();
}
export function getCommentsGeoJSON() {
  return { type: "FeatureCollection", features: features.map(x => JSON.parse(JSON.stringify(x))) };
}

// ---- Helpers
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}
function getFeatureById(id) { return features.find(f => f.id === id); }

function htmlEditable(id, lat, lng, val="") {
  const eid = n => `cmt-${id}-${n}`;
  return `
    <div style="min-width:240px">
      <div style="font-weight:600;margin-bottom:6px;color:#e2e8f0">Comment</div>
      <textarea id="${eid("txt")}" rows="3"
        style="width:100%;box-sizing:border-box;padding:6px;border-radius:8px;border:1px solid #cbd5e1">${escapeHtml(val)}</textarea>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
        <button id="${eid("delete")}" style="background:#fee2e2;border:1px solid #fecaca;color:#b91c1c;border-radius:8px;padding:6px 10px">Delete</button>
        <button id="${eid("cancel")}" style="background:#e2e8f0;border:1px solid #cbd5e1;color:#0f172a;border-radius:8px;padding:6px 10px">Cancel</button>
        <button id="${eid("save")}" style="background:#111827;color:#fff;border:0;border-radius:8px;padding:6px 12px">Save</button>
      </div>
      <div style="margin-top:6px;color:#94a3b8;font-size:12px">${lat.toFixed(6)}, ${lng.toFixed(6)}</div>
    </div>`;
}

function htmlReadonly(id, lat, lng, val="") {
  const eid = n => `cmt-${id}-${n}`;
  return `
    <div style="min-width:240px">
      <div style="font-weight:600;margin-bottom:6px;color:#e2e8f0">Comment</div>
      <div style="white-space:pre-wrap;color:#e5e7eb;background:#11182712;border:1px solid #cbd5e1;border-radius:8px;padding:6px">${escapeHtml(val || "(no text)")}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
        <button id="${eid("delete")}" style="background:#fee2e2;border:1px solid #fecaca;color:#b91c1c;border-radius:8px;padding:6px 10px">Delete</button>
        <button id="${eid("edit")}"   style="background:#111827;color:#fff;border:0;border-radius:8px;padding:6px 12px">Edit</button>
      </div>
      <div style="margin-top:6px;color:#94a3b8;font-size:12px">${lat.toFixed(6)}, ${lng.toFixed(6)}</div>
    </div>`;
}

function ensurePopup(marker) {
  // Bind an empty popup once so setPopupContent works reliably
  if (!marker.getPopup()) {
    marker.bindPopup("", { closeButton: false, autoPan: true, maxWidth: 320 });
  }
}

function showEditablePopup(id, marker, isNew) {
  const f = getFeatureById(id); if (!f) return;
  ensurePopup(marker);
  const ll = marker.getLatLng();
  marker.setPopupContent(htmlEditable(id, ll.lat, ll.lng, f.properties.comment || ""));
  marker.openPopup();

  marker.once("popupopen", () => {
    const eid = n => `cmt-${id}-${n}`;
    const $txt = document.getElementById(eid("txt"));
    const $save = document.getElementById(eid("save"));
    const $cancel = document.getElementById(eid("cancel"));
    const $delete = document.getElementById(eid("delete"));

    $save?.addEventListener("click", () => {
      f.properties.comment = ($txt?.value ?? "").trim();
      showReadonlyPopup(id, marker);
    });
    $cancel?.addEventListener("click", () => {
      if (isNew && !(f.properties.comment && f.properties.comment.length)) removeComment(id);
      else showReadonlyPopup(id, marker);
    });
    $delete?.addEventListener("click", () => removeComment(id));
  });
}

function showReadonlyPopup(id, marker) {
  const f = getFeatureById(id); if (!f) return;
  ensurePopup(marker);
  const ll = marker.getLatLng();
  marker.setPopupContent(htmlReadonly(id, ll.lat, ll.lng, f.properties.comment || ""));
  marker.openPopup();

  marker.once("popupopen", () => {
    const eid = n => `cmt-${id}-${n}`;
    const $edit = document.getElementById(eid("edit"));
    const $delete = document.getElementById(eid("delete"));
    $edit?.addEventListener("click", () => showEditablePopup(id, marker, false));
    $delete?.addEventListener("click", () => removeComment(id));
  });
}

function removeComment(id) {
  const idx = features.findIndex(x => x.id === id);
  if (idx >= 0) features.splice(idx, 1);
  const mk = markers.get(id);
  if (mk) { try { group?.removeLayer(mk); } catch {} }
  markers.delete(id);
}

function addComment(latlng, initialText = "") {
  ensureLayerGroup();
  const id = nextId++;

  const marker = L.marker(latlng, { autoPan: true }).addTo(group);
  markers.set(id, marker);

  features.push({
    id,
    type: "Feature",
    properties: { comment: initialText },
    geometry: { type: "Point", coordinates: [latlng.lng, latlng.lat] },
  });

  // Click behavior: open readonly when not in comment mode; editable when in comment mode
  marker.on("click", () => {
    if (commentMode) showEditablePopup(id, marker, false);
    else showReadonlyPopup(id, marker);
  });

  // First open: editable
  showEditablePopup(id, marker, initialText === "");
}

// Map click → drop a pin when Comment mode is ON
map.on("click", (e) => {
  if (!commentMode) return;
  addComment(e.latlng);
});
