// frontend/js/features/comments.js
import { map } from "../map.js"; // uses your initialized Leaflet map :contentReference[oaicite:2]{index=2}

let COMMENT_MODE = false;

// Dedicated pane so pins float above vectors
const paneName = "pane-comments";
if (!map.getPane(paneName)) {
  map.createPane(paneName);
  map.getPane(paneName).style.zIndex = "1200";
}

const group = L.layerGroup().addTo(map);
const idToMarker = new Map();
const comments = []; // {id, lat, lng, title, text, color, createdAt}
let counter = 1;

// ----- Public API (used by ui.js) -----
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
        title: c.title,
        text: c.text,
        color: c.color,
        createdAt: c.createdAt,
        // convenience for current exporter:
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

// ----- Internals -----
function onMapClick(e) {
  if (!COMMENT_MODE) return;
  const t = e?.originalEvent?.target;
  if (t && (t.closest(".leaflet-marker-icon") || t.closest(".leaflet-popup"))) return;
  createNewAt(e.latlng);
}

function createNewAt(latlng) {
  const m = L.circleMarker(latlng, {
    pane: paneName,
    renderer: L.canvas(),
    radius: 6,
    weight: 2,
    color: "#f59e0b",
    fillColor: "#f59e0b",
    fillOpacity: 0.9,
    opacity: 1,
    interactive: true,
    // ↓↓↓ this is the important part
    bubblingMouseEvents: false,
  }).addTo(group);

  const draft = {
    id: `tmp-${Date.now()}`,
    lat: latlng.lat,
    lng: latlng.lng,
    title: "",
    text: "",
    color: "#f59e0b",
  };
  openEditPopup(m, draft, /*isNew=*/true);
}

function styleMarker(marker, color) {
  if (marker.setStyle) {
    marker.setStyle({
      color,
      fillColor: color,
      fillOpacity: 0.9,
      opacity: 1,
      weight: 2,
      radius: 6,
    });
  }
}

function openViewPopup(marker, c) {
  const popupHtml = viewHtml(c);
  const popupOpts = { className: "ur-ctx-pop", closeButton: false, autoClose: true, maxWidth: 340 };

  const onOpen = (ev) => {
    if (ev.popup._source !== marker) return;
    const $root = ev.popup.getElement();
    $root.querySelector(".js-close")?.addEventListener("click", () => marker.closePopup());
    $root.querySelector(".js-edit")?.addEventListener("click", () => openEditPopup(marker, c, false));
    $root.querySelector(".js-del")?.addEventListener("click", () => {
      if (!confirm("Delete this comment?")) return;
      deleteComment(c.id);
    });
  };

  marker.once("popupopen", onOpen);          // attach first
  marker.bindPopup(popupHtml, popupOpts);    // then bind
  marker.openPopup();                        // then open
}


function openEditPopup(marker, c, isNew) {
  const popupHtml = editHtml(c, isNew);
  const popupOpts = { className: "ur-ctx-pop", closeButton: false, autoClose: false, maxWidth: 360 };

  // Attach BEFORE opening
  const onOpen = (ev) => {
    if (ev.popup._source !== marker) return;
    const $root  = ev.popup.getElement();
    const $title = $root.querySelector(".js-title");
    const $text  = $root.querySelector(".js-text");
    const $color = $root.querySelector(".js-color");

    const closeOrCancelDraft = () => {
      if (isNew) { try { group.removeLayer(marker); } catch {} }
      marker.closePopup();
    };

    // ✕ = same as Cancel for NEW drafts; just close for existing
    $root.querySelector(".js-close")?.addEventListener("click", () => {
      if (isNew) { closeOrCancelDraft(); } else { marker.closePopup(); }
    });

    $root.querySelector(".js-cancel")?.addEventListener("click", closeOrCancelDraft);

    const delBtn = $root.querySelector(".js-del");
    if (delBtn) {
      delBtn.addEventListener("click", () => {
        if (!confirm("Delete this comment?")) return;
        deleteComment(c.id);
      });
    }

    $root.querySelector(".js-save")?.addEventListener("click", () => {
      const title = $title.value.trim();
      const text  = $text.value.trim();
      const color = $color.value || "#f59e0b";
      if (!text) { alert("Please enter some text."); return; }

      if (isNew) {
        const id = String(counter++);
        const persisted = {
          id, lat: c.lat, lng: c.lng, title, text, color,
          createdAt: new Date().toISOString()
        };
        comments.push(persisted);
        idToMarker.set(id, marker);
        styleMarker(marker, color);
        marker.off("click");
        marker.on("click", (ev) => {
          // prevent the map’s click handler from firing
          if (ev) L.DomEvent.stop(ev);
          openViewPopup(marker, persisted);
        });
                marker.closePopup();
      } else {
        c.title = title; c.text = text; c.color = color;
        styleMarker(marker, color);
        marker.closePopup();
      }
    });

    setTimeout(() => $title?.focus(), 0);
  };

  marker.once("popupopen", onOpen);          // attach first
  marker.bindPopup(popupHtml, popupOpts);    // then bind content
  marker.openPopup();                        // then open
}


function deleteComment(id) {
  const idx = comments.findIndex(c => c.id === id);
  if (idx >= 0) comments.splice(idx, 1);
  const m = idToMarker.get(id);
  if (m) { try { group.removeLayer(m); } catch {} }
  idToMarker.delete(id);
  map.closePopup();
}

function coordsLabel(lat, lng) {
  return `${(+lat).toFixed(6)}, ${(+lng).toFixed(6)}`;
}

// ----- Templating (tiny) -----
function viewHtml(c) {
  const title = escapeHtml(c.title || "(No title)");
  const text  = escapeHtml(c.text  || "");
  const coords = coordsLabel(c.lat, c.lng);
  return `
    <div class="ur-cmt">
      <div class="hdr">
        <div class="t">${title}</div>
        <button class="js-close ur-btn ghost" title="Close">✕</button>
      </div>
      <div class="meta">${coords}</div>
      <div class="body">${text.replace(/\n/g, "<br>")}</div>
      <div class="actions">
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
        <button class="js-close ur-btn ghost" title="Close">✕</button>
      </div>
      <div class="meta">${coords}</div>

      <div class="row"><input type="text" class="js-title" placeholder="Title (optional)" value="${escapeAttr(c.title || "")}"></div>
      <div class="row"><textarea class="js-text" placeholder="Write a note...">${escapeHtml(c.text || "")}</textarea></div>
      <div class="row" style="justify-content:flex-end;gap:10px">
        <label style="color:#cbd5e1;font-size:12px;display:flex;align-items:center;gap:6px">
          Color <input type="color" class="js-color" value="${escapeAttr(c.color || "#f59e0b")}">
        </label>
      </div>

      <div class="actions">
        ${isNew
          ? `<button class="js-cancel ur-btn ghost">Cancel</button>`
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
