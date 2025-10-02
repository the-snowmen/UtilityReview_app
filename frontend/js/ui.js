// frontend/js/ui.js
import { map, switchBasemap, startAoiDraw, clearAoi, getAoiGeoJSON, stopAoiDraw, setAoiFromGeoJSON } from "./map.js";
import { state, setOrderFromDom, getById } from "./store.js";
import {
  addGeoJSONLayer, removeLayer, setVisibility,
  syncMapOrder, zoomToLayer,
  setCategoricalStyle, clearCategoricalStyle,
  addDebugMarker
} from "./layers.js";
import { refreshLegend } from "./legend.js";
import { toggleCommentMode, getCommentsGeoJSON } from "./features/comments.js";

// --- DOM
const $basemap       = document.getElementById("basemapSelect");
const $layerList     = document.getElementById("layerList");
const $btnImport     = document.getElementById("btnImport");
const $btnLoadDB     = document.getElementById("btnLoadDB");

// HUD
const $hudCursor     = document.getElementById("hudCursor");
const $hudCenter     = document.getElementById("hudCenter");
const $hudZoom       = document.getElementById("hudZoom");
const $hudCenterBtn  = document.getElementById("hudCenterBtn");

// AOI
const $aoiPanel       = document.getElementById("aoiPanel");
const $btnAoi         = document.getElementById("btnDrawAoi");
const $btnClearAoi    = document.getElementById("btnClearAoi");
const $btnExportAoi   = document.getElementById("btnExportAoi");
const $chkIncludeAoi  = document.getElementById("chkIncludeAoi");
const $btnAoiComment  = document.getElementById("btnAoiComment");
const $btnAoiFromKmz  = document.getElementById("btn-aoi-from-kmz");

// Info
const $info          = document.getElementById("infoPanel");
const $infoClose     = document.getElementById("infoClose");
const $infoTitle     = document.getElementById("infoTitle");
const $infoBody      = document.getElementById("infoBody");

// Style Modal
const $styleModal      = document.getElementById("styleModal");
const $styleModalClose = document.getElementById("styleModalClose");
const $styleModalTitle = document.getElementById("styleModalTitle");
const $styleBaseColor  = document.getElementById("styleBaseColor");
const $styleBaseWeight = document.getElementById("styleBaseWeight");
const $styleBaseOpacity = document.getElementById("styleBaseOpacity");
const $styleFieldSelect = document.getElementById("styleFieldSelect");
const $styleScanBtn    = document.getElementById("styleScanBtn");
const $styleClearBtn   = document.getElementById("styleClearBtn");
const $styleApplyBtn   = document.getElementById("styleApplyBtn");
const $styleMapWrap    = document.getElementById("styleMapWrap");

let aoiOn = false;

// ---------- helpers ----------
const escapeHtml = (s) => String(s ?? "")
  .replaceAll("&","&amp;").replaceAll("<","&lt;")
  .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
const fmtLL = (ll) => `${(+ll.lat).toFixed(6)}, ${(+ll.lng).toFixed(6)}`;

// ---------- map + HUD ----------
$basemap?.addEventListener("change", () => {
  try { switchBasemap($basemap.value); } catch (e) { console.error(e); }
});

map.on("mousemove", (e) => { $hudCursor && ($hudCursor.textContent = `cursor ${fmtLL(e.latlng)}`); });
map.on("moveend", () => {
  const c = map.getCenter();
  if ($hudCenter) $hudCenter.textContent = `center ${fmtLL(c)}`;
  if ($hudZoom)   $hudZoom.textContent   = `z${map.getZoom()}`;
});

$hudCenterBtn?.addEventListener("click", () => {
  window.dispatchEvent(new CustomEvent("ur-open-coord-search"));
});

// ---------- import ----------
$btnImport?.addEventListener("click", onImportFiles);

// ---------- database ----------
$btnLoadDB?.addEventListener("click", onLoadFromDatabase);

async function onImportFiles() {
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
    } else {
      console.error("Ingest failed:", res?.error || res);
      alert(`Failed to ingest:\n${p}\n${res?.error || ""}`);
    }
  }
  setOrderFromDom($layerList);
  syncMapOrder();
  refreshLegend();
}

async function onLoadFromDatabase() {
  if (!window.backend?.dbLoadFiberCables) {
    alert("Database IPC not available. Check preload/electron wiring.");
    return;
  }

  try {
    // Test connection first
    const connTest = await window.backend.dbTestConnection();
    if (!connTest?.ok || !connTest?.connected) {
      alert("Database connection failed. Please check your .env configuration and ensure the database is running.");
      return;
    }

    // Load fiber cable data (no spatial filtering to see all features)
    console.log("Loading fiber cable data from database...");
    const res = await window.backend.dbLoadFiberCables(null, 100000);

    if (res?.ok && res.geojson) {
      console.log(`Loaded ${res.geojson.features?.length || 0} fiber cable features`);
      const id = addGeoJSONLayer(res.name || "Fiber Cables", res.geojson, true);
      const li = buildLayerItem(id, getById(id));
      $layerList.prepend(li);

      // Zoom to the loaded data if it has features
      if (res.geojson.features?.length > 0) {
        zoomToLayer(id);
      }
    } else {
      console.error("Database load failed:", res?.error || res);
      alert(`Failed to load from database:\n${res?.error || "Unknown error"}`);
    }
  } catch (e) {
    console.error("Database load error:", e);
    alert(`Database error: ${e.message}`);
  }

  setOrderFromDom($layerList);
  syncMapOrder();
  refreshLegend();
}

// ---------- layer list ----------
export function rebuildList() {
  $layerList.innerHTML = "";
  for (const id of state.order) {
    const st = getById(id);
    if (!st) continue;
    $layerList.appendChild(buildLayerItem(id, st));
  }
  setOrderFromDom($layerList);
}

function buildLayerItem(id, st) {
  const li = document.createElement("li");
  li.className = "layer-item";
  li.dataset.layerId = id;
  li.innerHTML = `
    <div class="layer-top">
      <button class="drag-handle" title="Drag to reorder">☰</button>
      <div class="layer-name" title="${escapeHtml(st.name)}">${escapeHtml(st.name)}</div>
      <button class="zoom-btn" title="Zoom">⤢</button>
      <input type="checkbox" class="chk" ${st.visible ? "checked" : ""} title="Show/Hide"/>
      <button class="style-btn" title="Style">Style</button>
      <button class="remove-btn" title="Remove">✕</button>
    </div>`;

  const chk = li.querySelector(".chk");
  const removeBtn = li.querySelector(".remove-btn");
  const zoomBtn = li.querySelector(".zoom-btn");
  const dragHandle = li.querySelector(".drag-handle");
  const styleBtn = li.querySelector(".style-btn");

  chk.addEventListener("change", () => setVisibility(id, chk.checked));
  removeBtn.addEventListener("click", () => { removeLayer(id); li.remove(); setOrderFromDom($layerList); refreshLegend(); });
  zoomBtn.addEventListener("click", () => zoomToLayer(id));
  styleBtn.addEventListener("click", () => openStyleModal(id));

  // DnD reorder
  dragHandle.setAttribute("draggable", "true");
  dragHandle.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    li.classList.add("dragging");
    draggingId = id;
  });
  dragHandle.addEventListener("dragend", () => { li.classList.remove("dragging"); draggingId = null; });

  return li;
}

let draggingId = null;
$layerList?.addEventListener("dragover", (e) => {
  if (!draggingId) return;
  e.preventDefault();
  const after = getDragAfterElement($layerList, e.clientY);
  const draggingEl = [...$layerList.children].find((n) => n.dataset.layerId === draggingId);
  if (!draggingEl) return;
  if (after == null) $layerList.appendChild(draggingEl);
  else $layerList.insertBefore(draggingEl, after);
});
$layerList?.addEventListener("drop", () => { setOrderFromDom($layerList); syncMapOrder(); refreshLegend(); });

function getDragAfterElement(container, y) {
  const els = [...container.querySelectorAll(".layer-item:not(.dragging)")];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// ---------- AOI mode ----------
$btnAoi?.addEventListener("click", () => {
  aoiOn = !aoiOn;
  if (aoiOn) {
    startAoiDraw();
    $aoiPanel?.removeAttribute("hidden");
    $btnAoi.classList.add("active");
  } else {
    stopAoiDraw();
    $aoiPanel?.setAttribute("hidden", "true");
    $btnAoi.classList.remove("active");
  }
});

$btnAoiFromKmz?.addEventListener("click", async () => {
  // Use dedicated IPC so we can parse KML/KMZ in main
  if (!window.backend?.aoiPickKmx) {
    alert("AOI importer not available (preload).");
    return;
  }
  const res = await window.backend.aoiPickKmx();
  if (!res?.ok || !res.geojson) {
    if (!res?.canceled) alert(`Failed to read AOI${res?.error ? ":\n" + res.error : ""}`);
    return;
  }
  try {
    // prefer polygons
    setAoiFromGeoJSON(res.geojson);
    if ($aoiPanel.hasAttribute("hidden")) {
      $aoiPanel.removeAttribute("hidden");
      $btnAoi?.classList.add("active");
    }
  } catch (e) {
    console.error(e);
    alert("Could not set AOI from that file.");
  }
});

$btnClearAoi?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); clearAoi(); });
$btnAoiComment?.addEventListener("click", (e) => {
  e.preventDefault(); e.stopPropagation();
  const on = toggleCommentMode();
  $btnAoiComment.classList.toggle("active", on);
});

$btnExportAoi?.addEventListener("click", onExportAoiKmz);

async function onExportAoiKmz(e) {
  e?.preventDefault?.();
  e?.stopPropagation?.();

  const aoi = getAoiGeoJSON();
  if (!aoi) { alert("Draw or set an AOI first."); return; }

  const layersForExport = [];
  for (const id of state.order) {
    const st = state.layers.get(id);
    if (!st?.visible || !st?.source?.features?.length) continue;

    const fc = st.source;
    const sb = st.styleBy;
    const hiddenSet = sb?.hidden || null;

    layersForExport.push({
      name: st.name,
      style: {
        baseColor: st.color,
        weight: st.weight,
        opacity: st.opacity,
        styleBy: sb ? {
          field: sb.field,
          rules: sb.rules || {},
          defaultColor: sb.defaultColor || st.color,
          hidden: hiddenSet ? [...hiddenSet] : [],
        } : null
      },
      features: fc,
    });
  }

  const comments = getCommentsGeoJSON();
  if (comments?.features?.length) {
    layersForExport.push({
      name: "Comments",
      style: { baseColor: "#f59e0b", weight: 2, opacity: 1, styleBy: null },
      features: comments
    });
  }

  if (!layersForExport.length) { alert("No visible features to export."); return; }
  if (!window.backend?.exportAoiKmz) { alert("Export API missing from preload."); return; }

  const opts = { includeAoi: !!$chkIncludeAoi?.checked };
  try {
    const res = await window.backend.exportAoiKmz(aoi, layersForExport, "aoi_export.kmz", opts);
    if (!res?.ok && !res?.canceled) alert("Export failed: " + (res?.error || "unknown"));
  } catch (err) {
    console.error("[exportAoiKmz]", err);
    alert("Export failed: " + (err?.message || err));
  }
}

// ---------- Info panel ----------
function showInfo(title, props) {
  if ($infoTitle) $infoTitle.textContent = title || "Feature Info";
  if ($infoBody) {
    const rows = Object.entries(props || {}).map(([k, v]) =>
      `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`
    ).join("");
    $infoBody.innerHTML = rows ? `<table>${rows}</table>` : "<em>No attributes</em>";
  }
  $info?.removeAttribute("hidden");
}
function hideInfo() { $info?.setAttribute("hidden", "true"); }
let lastIdentifyMarker = null;
window.addEventListener("ur-identify", (e) => {
  const d = e.detail || {};
  showInfo(d.layerName, d.properties, d.latlng);
  if (lastIdentifyMarker) { try { map.removeLayer(lastIdentifyMarker); } catch {} lastIdentifyMarker = null; }
  if (d.latlng) lastIdentifyMarker = addDebugMarker(d.latlng.lat, d.latlng.lng, "Clicked");
});
$infoClose?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); hideInfo(); }, { capture: true });

// ---------- style modal ----------
let currentStyleLayerId = null;

function openStyleModal(layerId) {
  currentStyleLayerId = layerId;
  const layer = getById(layerId);
  if (!layer) return;

  $styleModalTitle.textContent = `Style: ${layer.name}`;

  // Populate field dropdown
  populateFieldDropdown(layer);

  // Reset categorical styling UI
  resetCategoricalStyling();

  $styleModal.hidden = false;
}

function populateFieldDropdown(layer) {
  // Clear existing options
  $styleFieldSelect.innerHTML = '<option value="">Select a field...</option>';

  if (!layer.geojson?.features?.length) return;

  // Get all property keys from the first feature
  const firstFeature = layer.geojson.features[0];
  if (!firstFeature?.properties) return;

  const fields = Object.keys(firstFeature.properties);

  fields.forEach(field => {
    const option = document.createElement('option');
    option.value = field;
    option.textContent = field;
    $styleFieldSelect.appendChild(option);
  });

  // Enable scan button when a field is selected
  $styleFieldSelect.addEventListener('change', () => {
    const hasField = $styleFieldSelect.value !== '';
    $styleScanBtn.disabled = !hasField;
    if (!hasField) {
      resetCategoricalStyling();
    }
  });
}

function resetCategoricalStyling() {
  $styleMapWrap.innerHTML = '';
  $styleClearBtn.disabled = true;
  $styleApplyBtn.disabled = true;
}

function scanFieldValues() {
  if (!currentStyleLayerId || !$styleFieldSelect.value) return;

  const layer = getById(currentStyleLayerId);
  if (!layer?.geojson?.features) return;

  const fieldName = $styleFieldSelect.value;
  const uniqueValues = new Set();

  // Collect unique values
  layer.geojson.features.forEach(feature => {
    const value = feature.properties?.[fieldName];
    if (value !== null && value !== undefined && value !== '') {
      uniqueValues.add(String(value));
    }
  });

  // Limit to reasonable number of categories
  const values = Array.from(uniqueValues).slice(0, 20);

  if (values.length === 0) {
    $styleMapWrap.innerHTML = '<p>No values found for this field.</p>';
    return;
  }

  // Generate color mappings
  const colorMappings = generateColorMappings(values);

  // Build UI for value mappings
  buildValueMappingUI(values, colorMappings);

  $styleClearBtn.disabled = false;
  $styleApplyBtn.disabled = false;
}

function generateColorMappings(values) {
  const colors = [
    '#ff3333', '#33ff33', '#3333ff', '#ffff33', '#ff33ff', '#33ffff',
    '#ff6633', '#33ff66', '#6633ff', '#ff3366', '#66ff33', '#3366ff',
    '#ff9933', '#33ff99', '#9933ff', '#ff3399', '#99ff33', '#3399ff'
  ];

  const mappings = {};
  values.forEach((value, index) => {
    mappings[value] = colors[index % colors.length];
  });

  return mappings;
}

function buildValueMappingUI(values, colorMappings) {
  const html = values.map(value => `
    <div class="value-mapping" style="display: flex; align-items: center; gap: 8px; margin: 4px 0;">
      <input type="color" value="${colorMappings[value]}" data-value="${escapeHtml(value)}"
             style="width: 30px; height: 20px; border: none; border-radius: 4px;">
      <span style="flex: 1; font-size: 12px;">${escapeHtml(value)}</span>
    </div>
  `).join('');

  $styleMapWrap.innerHTML = html;
}

function applyCategoricalStyle() {
  if (!currentStyleLayerId || !$styleFieldSelect.value) return;

  const layer = getById(currentStyleLayerId);
  if (!layer?.leafletLayer) return;

  const fieldName = $styleFieldSelect.value;
  const colorMappings = {};

  // Collect color mappings from UI
  $styleMapWrap.querySelectorAll('input[type="color"]').forEach(input => {
    const value = input.dataset.value;
    const color = input.value;
    colorMappings[value] = color;
  });

  // Apply categorical styling using layers.js function
  setCategoricalStyle(currentStyleLayerId, fieldName, colorMappings);
}

function clearCurrentCategoricalStyle() {
  if (!currentStyleLayerId) return;
  clearCategoricalStyle(currentStyleLayerId);
  resetCategoricalStyling();
}

function closeStyleModal() {
  $styleModal.hidden = true;
  currentStyleLayerId = null;
  resetCategoricalStyling();
}

function applyBasicStyle() {
  if (!currentStyleLayerId) return;

  const color = $styleBaseColor.value;
  const weight = parseInt($styleBaseWeight.value) || 2;
  const opacity = parseFloat($styleBaseOpacity.value) || 1;

  const layer = getById(currentStyleLayerId);
  if (layer?.leafletLayer) {
    layer.leafletLayer.setStyle({
      color: color,
      weight: weight,
      opacity: opacity,
      fillOpacity: opacity * 0.3
    });
  }
}

$styleModalClose?.addEventListener("click", closeStyleModal);
$styleBaseColor?.addEventListener("change", applyBasicStyle);
$styleBaseWeight?.addEventListener("change", applyBasicStyle);
$styleBaseOpacity?.addEventListener("change", applyBasicStyle);

// Categorical styling event listeners
$styleScanBtn?.addEventListener("click", scanFieldValues);
$styleApplyBtn?.addEventListener("click", applyCategoricalStyle);
$styleClearBtn?.addEventListener("click", clearCurrentCategoricalStyle);

// Global Esc: close info; exit AOI draw if active
window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (aoiOn) {
    aoiOn = false;
    $btnAoi?.classList.remove("active");
    $aoiPanel?.setAttribute("hidden", "true");
    stopAoiDraw();
  } else if (!$styleModal.hidden) {
    closeStyleModal();
  } else {
    hideInfo();
  }
});

// ---------- Facility Layers ----------
const FACILITY_LAYERS = {
  fiberUnderground: { id: null, name: "Underground Fiber Cable", color: "#28a745" },
  fiberAerial: { id: null, name: "Aerial Fiber Cable", color: "#007bff" },
  conduit: { id: null, name: "Conduit", color: "#8b0000" },
  structure: { id: null, name: "Structure", color: "#8b5cf6" }
};

const $toggleFiberUnderground = document.getElementById("toggleFiberUnderground");
const $toggleFiberAerial = document.getElementById("toggleFiberAerial");
const $toggleConduit = document.getElementById("toggleConduit");
const $toggleStructure = document.getElementById("toggleStructure");

async function toggleFacilityLayer(type) {
  const facilityConfig = FACILITY_LAYERS[type];
  if (!facilityConfig) return;

  const checkbox = document.getElementById(`toggle${type.charAt(0).toUpperCase() + type.slice(1)}`);
  if (!checkbox) return;

  if (checkbox.checked) {
    // Load the facility layer
    try {
      let res;
      if (type === "fiberUnderground" || type === "fiberAerial") {
        // Load fiber cables and filter by placement type
        res = await window.backend.dbLoadFiberCables(null, 100000);
        if (res?.ok && res.geojson) {
          // Filter features based on placement type
          const placementType = type === "fiberUnderground" ? "UNDERGROUND" : "AERIAL";
          const filteredFeatures = res.geojson.features.filter(f => {
            const placement = f.properties?.placementt?.toUpperCase();
            return placement === placementType;
          });
          res.geojson = { type: "FeatureCollection", features: filteredFeatures };
        }
      } else if (type === "conduit") {
        res = await window.backend.dbLoadConduit(null, 100000);
      } else if (type === "structure") {
        res = await window.backend.dbLoadStructure(null, 100000);
      }

      if (res?.ok && res.geojson) {
        // Add the layer with custom styling
        const id = addGeoJSONLayer(facilityConfig.name, res.geojson, true);
        facilityConfig.id = id;

        // Update the layer's color in state and re-apply style
        const layer = getById(id);
        if (layer) {
          layer.color = facilityConfig.color;
          layer.weight = 2;
          layer.opacity = 0.8;

          // Re-apply the style with the new color
          if (layer.layer) {
            const style = {
              color: facilityConfig.color,
              weight: 2,
              opacity: 0.8,
              fillColor: facilityConfig.color,
              fillOpacity: type === "structure" ? 0.6 : 0.2
            };
            layer.layer.setStyle(style);
          }
        }

        console.log(`Loaded ${res.geojson.features?.length || 0} ${facilityConfig.name} features`);
      } else {
        console.error(`Failed to load ${facilityConfig.name}:`, res?.error);
        checkbox.checked = false;
      }
    } catch (e) {
      console.error(`Error loading ${facilityConfig.name}:`, e);
      checkbox.checked = false;
    }
  } else {
    // Remove the facility layer
    if (facilityConfig.id) {
      removeLayer(facilityConfig.id);
      facilityConfig.id = null;
    }
  }

  refreshLegend();
}

$toggleFiberUnderground?.addEventListener("change", () => toggleFacilityLayer("fiberUnderground"));
$toggleFiberAerial?.addEventListener("change", () => toggleFacilityLayer("fiberAerial"));
$toggleConduit?.addEventListener("change", () => toggleFacilityLayer("conduit"));
$toggleStructure?.addEventListener("change", () => toggleFacilityLayer("structure"));

export {};
