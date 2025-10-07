// backend/export/clipToKmz.js
const fsp = require("fs/promises");
const path = require("path");
const JSZip = require("jszip");
const mapshaper = require("mapshaper");

let createCanvas;
try { ({ createCanvas } = require("canvas")); }
catch { throw new Error("Missing dependency: canvas. Install with `npm i canvas`"); }

// ---------- utils ----------
const normVal   = v => String(v ?? "").trim();
const normKey   = s => String(s ?? "");
const normKeyMap = (obj = {}) => Object.fromEntries(Object.entries(obj).map(([k,v]) => [normKey(k), v]));
const normSet    = (it = []) => new Set([...it].map(normVal));

function hexToKmlColor(hex, opacity = 1) {
  const h = String(hex || "#ff3333").replace("#", "");
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  const a = Math.max(0, Math.min(255, Math.round(opacity * 255)));
  const to2 = (n)=>n.toString(16).padStart(2,"0");
  return `${to2(a)}${to2(b)}${to2(g)}${to2(r)}`.toLowerCase(); // AABBGGRR
}

function eachCoord(geom, fn) {
  if (!geom) return;
  const t = geom.type, C = geom.coordinates;
  if (t === "Point") return fn(C);
  if (t === "MultiPoint") return C.forEach(fn);
  if (t === "LineString") return C.forEach(fn);
  if (t === "MultiLineString") return C.flat(1).forEach(fn);
  if (t === "Polygon") return C.flat(1).forEach(fn);
  if (t === "MultiPolygon") return C.flat(2).forEach(fn);
  if (t === "GeometryCollection") return geom.geometries.forEach(g => eachCoord(g, fn));
}

function centroidOfPolygonlike(fc) {
  let minX= Infinity, minY= Infinity, maxX= -Infinity, maxY= -Infinity;
  for (const f of fc?.features || []) {
    eachCoord(f.geometry, ([x,y]) => {
      if (x<minX) minX=x; if (y<minY) minY=y;
      if (x>maxX) maxX=x; if (y>maxY) maxY=y;
    });
  }
  if (minX === Infinity) return { lon:-96, lat:39, range:1200000 };
  const lon = (minX+maxX)/2, lat = (minY+maxY)/2;
  const dx = maxX - minX, dy = maxY - minY;
  const km = Math.max(dx, dy) * 111;
  const range = Math.max(500, Math.min(5e6, km * 1000 * 2.2));
  return { lon, lat, range };
}

function geomToKml(geom) {
  const esc = n => Number(n).toFixed(7);
  const coords1 = arr => arr.map(([x,y]) => `${esc(x)},${esc(y)},0`).join(" ");
  const polygon = rings => `
    <Polygon><tessellate>1</tessellate>
      <outerBoundaryIs><LinearRing><coordinates>${coords1(rings[0])}</coordinates></LinearRing></outerBoundaryIs>
      ${rings.slice(1).map(h=>`<innerBoundaryIs><LinearRing><coordinates>${coords1(h)}</coordinates></LinearRing></innerBoundaryIs>`).join("")}
    </Polygon>`;
  const line = pts => `<LineString><tessellate>1</tessellate><coordinates>${coords1(pts)}</coordinates></LineString>`;
  const point = pt => `<Point><coordinates>${esc(pt[0])},${esc(pt[1])},0</coordinates></Point>`;

  const t = geom?.type;
  if (t === "Polygon") return polygon(geom.coordinates);
  if (t === "MultiPolygon") return geom.coordinates.map(polygon).join("");
  if (t === "LineString") return line(geom.coordinates);
  if (t === "MultiLineString") return geom.coordinates.map(line).join("");
  if (t === "Point") return point(geom.coordinates);
  if (t === "MultiPoint") return geom.coordinates.map(point).join("");
  if (t === "GeometryCollection") return geom.geometries.map(geomToKml).join("");
  return "";
}

function guessLayerGeomType(fc) {
  let hasPoint=false, hasLine=false, hasPoly=false;
  for (const f of fc?.features || []) {
    const t = f.geometry?.type;
    if (t === "Point" || t === "MultiPoint") hasPoint = true;
    else if (t === "LineString" || t === "MultiLineString") hasLine = true;
    else if (t === "Polygon" || t === "MultiPolygon") hasPoly = true;
  }
  return hasPoint ? "Point" : hasLine ? "LineString" : hasPoly ? "Polygon" : "Unknown";
}

/** FIX: proper in-memory mapshaper call + correct layer names (no ".json" suffix) */
async function clipWithMapshaper(fc, aoiFC) {
  // Log bounding boxes for debugging
  const getBounds = (geojson) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const f of geojson?.features || []) {
      eachCoord(f.geometry, ([x,y]) => {
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      });
    }
    return { minX, minY, maxX, maxY };
  };

  const srcBounds = getBounds(fc);
  const aoiBounds = getBounds(aoiFC);
  console.log(`[clipWithMapshaper] Source bounds:`, srcBounds);
  console.log(`[clipWithMapshaper] AOI bounds:`, aoiBounds);

  const cmd = [
    "-i", "src.json",
    "-i", "aoi.json",
    "-clip", "aoi.json",
    "-o", "format=geojson", "out.json"
  ].join(" ");

  const inputs = {
    "src.json": JSON.stringify(fc),
    "aoi.json": JSON.stringify(aoiFC),
  };

  try {
    const res = await mapshaper.runCommands(cmd, inputs);

    if (!res || !res["out.json"]) {
      console.warn("Mapshaper clip failed (no output), returning empty FeatureCollection");
      console.warn("This usually means the AOI doesn't intersect with the features");
      return { type: "FeatureCollection", features: [] };
    }

    const out = JSON.parse(res["out.json"] || "{}");

    if (!out || !out.type) return { type: "FeatureCollection", features: [] };
    if (out.type === "FeatureCollection") return out;
    if (out.type === "Feature") return { type: "FeatureCollection", features: [out] };
    return { type: "FeatureCollection", features: [] };
  } catch (err) {
    console.error("Mapshaper clip error:", err.message || err);
    return { type: "FeatureCollection", features: [] };
  }
}

function drawLegendPng(layersMeta) {
  const width = 320;
  const sidePad = 12;
  const titleH = 16;

  let height = 28 + 12;
  for (const L of layersMeta) {
    height += titleH + 8;
    const rows = L.entries?.length ? L.entries.length : 1;
    height += rows * 22 + 6;
  }

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;

  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.fillRect(0,0,width,height);

  ctx.fillStyle = "#0b1324";
  ctx.fillRect(0,0,width,28);
  ctx.fillStyle = "#e7eef8";
  ctx.font = "600 13px Segoe UI, system-ui, Arial";
  ctx.fillText("Legend", sidePad, 18);

  let y = 34;
  for (const L of layersMeta) {
    ctx.globalAlpha = 1;
    y += 6;
    ctx.font = "600 12px Segoe UI, system-ui, Arial";
    ctx.fillStyle = "#0b1324";
    ctx.fillText(L.name, sidePad, y);
    y += titleH;

    const g = L.geomType;
    const w = Math.max(1, Math.min(12, Number(L.weight || 2)));
    const op = Number(L.opacity ?? 1);

    function drawSwatch(x, cy, colorHex, symbol = null) {
      if (symbol) {
        // Draw letter symbol for structures
        const size = 20;
        const cx = x + 10;
        ctx.globalAlpha = 1;
        // Draw white background circle
        ctx.beginPath();
        ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        // Draw colored border
        ctx.strokeStyle = colorHex;
        ctx.lineWidth = 2;
        ctx.stroke();
        // Draw letter
        ctx.fillStyle = colorHex;
        ctx.font = "bold 14px Segoe UI, system-ui, Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(symbol, cx, cy);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
      } else if (g.includes("Point")) {
        const r = Math.max(3, w + 2);
        ctx.beginPath(); ctx.arc(x+10, cy, r, 0, Math.PI*2);
        ctx.fillStyle = colorHex; ctx.globalAlpha = op; ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = colorHex; ctx.lineWidth = 1; ctx.stroke();
      } else if (g.includes("Line")) {
        ctx.beginPath();
        ctx.lineWidth = w;
        ctx.strokeStyle = colorHex; ctx.globalAlpha = op;
        ctx.moveTo(x, cy); ctx.lineTo(x+38, cy); ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = colorHex; ctx.globalAlpha = Math.max(0.15, Math.min(1, op * 0.6));
        ctx.fillRect(x, cy-7, 38, 14);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = colorHex; ctx.lineWidth = Math.max(1, Math.min(3, w));
        ctx.strokeRect(x, cy-7, 38, 14);
      }
    }

    const entries = (L.entries?.length ? L.entries : [{ label: "Features", color: L.baseColor }]);
    for (const ent of entries) {
      drawSwatch(sidePad, y+8, ent.color || L.baseColor, ent.symbol || null);
      ctx.fillStyle = "#0b1324";
      ctx.font = "12px Segoe UI, system-ui, Arial";
      ctx.fillText(String(ent.label ?? ""), sidePad + 52, y + 12);
      y += 22;
    }
    y += 6;
  }
  return canvas.toBuffer("image/png");
}

function escapeXml(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;");
}

function buildKmlDoc({ aoi, layers, includeAoi, kmlName = "AOI Export" }) {
  const styles = new Map();
  const safeId = s => String(s).replace(/[^A-Za-z0-9_\-]/g, "_");
  const styleIdFor = (layerIdx, colorHex, weight, kind, symbol = null) => {
    const symSuffix = symbol ? `_${symbol}` : '';
    const key = `s_${layerIdx}_${safeId(String(colorHex).replace("#",""))}_${Math.max(1,weight)}_${kind}${symSuffix}`;
    if (styles.has(key)) return key;

    const kmlColor = hexToKmlColor(colorHex, 1);
    const kmlFill  = hexToKmlColor(colorHex, 0.6);
    const line = `<LineStyle><color>${kmlColor}</color><width>${Math.max(1, weight)}</width></LineStyle>`;
    const poly = (kind === "pl") ? `<PolyStyle><color>${kmlFill}</color><fill>1</fill><outline>1</outline></PolyStyle>` : "";
    const iconScale = Math.max(0.8, Math.min(2, 0.6 + Number(weight) * 0.2));

    let icon = "";
    if (kind === "pt") {
      if (symbol) {
        // Use symbol-specific icon for structures
        icon = `<IconStyle><color>${kmlColor}</color><scale>${iconScale.toFixed(2)}</scale><Icon><href>media/symbol_${symbol}.png</href></Icon></IconStyle>`;
      } else {
        // Use generic dot for other points
        icon = `<IconStyle><color>${kmlColor}</color><scale>${iconScale.toFixed(2)}</scale><Icon><href>media/dot.png</href></Icon></IconStyle>`;
      }
    }

    styles.set(key, `<Style id="${key}">${icon}${line}${poly}</Style>`);
    return key;
  };

  const folders = [];

  console.log(`[buildKmlDoc] includeAoi=${includeAoi}, aoi?.features?.length=${aoi?.features?.length}`);
  if (includeAoi && (aoi?.features?.length)) {
    console.log(`[buildKmlDoc] Including AOI with ${aoi.features.length} features`);
    const aoiStyle = `
      <Style id="aoi-style">
        <LineStyle><color>${hexToKmlColor("#ff5a5f", 1)}</color><width>2</width></LineStyle>
        <PolyStyle><color>${hexToKmlColor("#ff9aa2", 0.3)}</color><fill>1</fill><outline>1</outline></PolyStyle>
      </Style>`;
    const aoiPlcs = (aoi.features || []).map(f => `
      <Placemark>
        <name>AOI</name>
        <styleUrl>#aoi-style</styleUrl>
        ${geomToKml(f.geometry)}
      </Placemark>
    `).join("\n");
    folders.push(`<Folder><name>AOI</name>${aoiPlcs}</Folder>`);
    styles.set("aoi-style", aoiStyle);
  } else {
    console.log(`[buildKmlDoc] NOT including AOI - includeAoi=${includeAoi}, hasFeatures=${!!aoi?.features?.length}`);
  }

  layers.forEach((L, idx) => {
    const base = L.style?.baseColor || "#ff3333";
    const weight = Number(L.style?.weight ?? 2);
    const sb = L.style?.styleBy || null;
    const rules = sb ? normKeyMap(sb.rules || {}) : {};
    const hidden = sb ? normSet(sb.hidden || []) : new Set();

    const geomType = guessLayerGeomType(L.features);
    const isPoint = geomType.includes("Point");

    const feats = (L.features.features || []).map(f => {
      const props = f.properties || {};
      const val = sb?.field ? normVal(props[sb.field]) : "";
      if (val && hidden.has(val)) return "";

      const color = props.color || (val && rules[val]) || sb?.defaultColor || base;
      const symbol = props.symbol || null; // Get structure symbol if present

      // Increase line width for conduit and fibercable exports
      const featureType = props.feature_type || '';
      let exportWeight = weight;
      if (featureType === 'FiberCable' || featureType === 'Conduit') {
        exportWeight = Math.min(12, weight * 2.5); // Make lines thicker
      }

      const sid = styleIdFor(idx, color, exportWeight, isPoint ? "pt" : "pl", symbol);

      const title = props.title ? String(props.title).trim() : "";
      const text  = props.text  ? String(props.text).trim()  : "";
      const comment = props.comment ? String(props.comment) : null;

      // For database features without custom names, use a generic name or skip
      let nameStr;
      if (title) {
        nameStr = title;
      } else if (comment) {
        nameStr = comment;
      } else if (featureType === 'Structure') {
        // Don't show generic "Structure (Database)" name
        nameStr = "";
      } else {
        nameStr = L.name;
      }

      const descStr = text || ((comment && !title) ? comment : "");

      const nameXml = nameStr ? `<name>${escapeXml(nameStr)}</name>` : "";
      const descXml = descStr ? `<description><![CDATA[${descStr}]]></description>` : "";

      return `
        <Placemark>
          ${nameXml}
          ${descXml}
          <styleUrl>#${sid}</styleUrl>
          ${geomToKml(f.geometry)}
        </Placemark>`;
    }).join("\n");

    if (feats.trim()) {
      folders.push(`<Folder><name>${escapeXml(L.name)}</name>${feats}</Folder>`);
    }
  });

  const { lon, lat, range } = centroidOfPolygonlike(aoi);

  const stylesXml = [...styles.values()].join("\n");
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${escapeXml(kmlName)}</name>
  <open>1</open>

  <LookAt>
    <longitude>${lon}</longitude><latitude>${lat}</latitude>
    <altitude>0</altitude><range>${Math.round(range)}</range><tilt>0</tilt><heading>0</heading>
  </LookAt>

  ${stylesXml}

  <ScreenOverlay>
    <name>Legend</name>
    <Icon><href>legend.png</href></Icon>
    <overlayXY x="1" y="0" xunits="fraction" yunits="fraction"/>
    <screenXY  x="0.98" y="0.05" xunits="fraction" yunits="fraction"/>
    <size x="0" y="0" xunits="pixels" yunits="pixels"/>
  </ScreenOverlay>

  ${folders.join("\n")}
</Document>
</kml>`;
  return kml;
}

async function exportClippedKmz(aoi, data, outPath, opts = {}) {
  const includeAoi = opts.includeAoi !== false;
  const keepAttrs  = !!opts.keepAttributes; // we set false from main
  const kmlName    = String(opts.kmlName || "AOI Export");

  console.log(`[exportClippedKmz] includeAoi=${includeAoi}, aoi type=${aoi?.type}, opts=`, opts);

  const aoiFC = (aoi?.type === "FeatureCollection") ? aoi : { type: "FeatureCollection", features: [aoi] };
  console.log(`[exportClippedKmz] aoiFC features count=${aoiFC.features.length}`);

  const layersIn = Array.isArray(data) ? data : [{ name: "Layer", style: { baseColor: "#ff3333", weight: 2, opacity: 1 }, features: data }];

  console.log(`[exportClippedKmz] Processing ${layersIn.length} layers`);

  const layersClipped = [];
  for (const L of layersIn) {
    if (!L?.features?.features?.length) {
      console.log(`[exportClippedKmz] Skipping layer "${L?.name}" - no features`);
      continue;
    }

    let clipped;
    // Check if this layer is pre-clipped (e.g., by PostGIS)
    if (L._preClipped) {
      // DB layers are already clipped by PostGIS
      console.log(`[exportClippedKmz] Using pre-clipped layer "${L.name}" with ${L.features.features.length} features`);
      clipped = L.features;
    } else {
      // Regular layers need mapshaper clipping
      console.log(`[exportClippedKmz] Clipping layer "${L.name}" with ${L.features.features.length} features`);
      clipped = await clipWithMapshaper(L.features, aoiFC);
      console.log(`[exportClippedKmz] Clipped result: ${clipped?.features?.length || 0} features`);
    }

    if (!clipped?.features?.length) continue;

    const keepField = L.style?.styleBy?.field || null;

    for (const f of clipped.features) {
      const orig = f.properties || {};
      if (!keepAttrs) {
        const kept = {};
        if (orig.title) kept.title = orig.title;
        if (orig.text)  kept.text  = orig.text;
        if (orig.color) kept.color = orig.color;
        if (orig.comment) kept.comment = orig.comment;
        if (orig.symbol) kept.symbol = orig.symbol; // Preserve structure symbols
        if (keepField && (orig[keepField] !== undefined)) kept[keepField] = orig[keepField];
        f.properties = kept;
      }
    }

    const present = new Set();
    if (keepField) {
      for (const f of clipped.features) {
        const v = f?.properties?.[keepField];
        if (v !== undefined && v !== null) present.add(normVal(v));
      }
    }

    let filteredEntries = [];
    if (L.style?.styleBy) {
      const rules  = normKeyMap(L.style.styleBy.rules || {});
      const hidden = normSet(L.style.styleBy.hidden || []);
      filteredEntries = [...present]
        .filter(k => !hidden.has(k))
        .map(k => {
          // Find a feature with this category to get its symbol
          const feat = clipped.features.find(f => normVal(f?.properties?.[keepField]) === k);
          const symbol = feat?.properties?.symbol;
          return {
            key: k,
            color: rules[k] || L.style.styleBy.defaultColor || L.style.baseColor || "#ff3333",
            symbol: symbol || null
          };
        });
    } else {
      // If no styleBy, check if layer has structure symbols
      const symbols = new Set();
      for (const f of clipped.features) {
        if (f?.properties?.symbol) symbols.add(f.properties.symbol);
      }
      if (symbols.size > 0) {
        const symbolLabels = { '?': 'Unknown', 'M': 'Manhole', 'H': 'Handhole', 'V': 'Vault' };
        filteredEntries = Array.from(symbols).sort().map(sym => ({
          key: symbolLabels[sym] || sym,
          color: L.style?.baseColor || "#ff3333",
          symbol: sym
        }));
      }
    }

    layersClipped.push({
      name: L.name || "Layer",
      features: clipped,
      style: {
        baseColor: L.style?.baseColor || "#ff3333",
        weight: Number(L.style?.weight ?? 2),
        opacity: Number(L.style?.opacity ?? 1),
        styleBy: L.style?.styleBy ? {
          field: L.style.styleBy.field,
          rules: normKeyMap(L.style.styleBy.rules || {}),
          defaultColor: L.style.styleBy.defaultColor || (L.style?.baseColor || "#ff3333"),
          hidden: Array.isArray(L.style.styleBy.hidden) ? L.style.styleBy.hidden : [],
        } : null,
        _legendEntries: filteredEntries
      }
    });
  }

  if (!layersClipped.length && !includeAoi) {
    throw new Error("No visible features within AOI to export.");
  }

  const legendMeta = layersClipped.map(L => ({
    name: L.name,
    geomType: guessLayerGeomType(L.features),
    baseColor: L.style.baseColor,
    weight: L.style.weight,
    opacity: L.style.opacity,
    entries: (L.style._legendEntries && L.style._legendEntries.length)
      ? L.style._legendEntries.map(e => ({
          label: `${L.style.styleBy?.field ?? ""}${L.style.styleBy ? " = " : ""}${e.key}`,
          color: e.color,
          symbol: e.symbol || null
        }))
      : (L.style.styleBy ? [] : [{ label: "Features", color: L.style.baseColor }]),
  }));
  const legendPng = drawLegendPng(legendMeta);

  const dotCanvas = createCanvas(16, 16);
  const dctx = dotCanvas.getContext("2d");
  dctx.clearRect(0,0,16,16);
  dctx.fillStyle = "#ffffff";
  dctx.beginPath(); dctx.arc(8,8,6,0,Math.PI*2); dctx.fill();
  const dotPng = dotCanvas.toBuffer("image/png");

  // Generate symbol icons for structures (M, H, V, ?)
  function createSymbolIcon(symbol, color = "#9333ea") {
    const size = 48; // Larger for better quality in Google Earth
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 4;

    // Draw white background circle
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    // Draw colored border
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw symbol text
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.round(size * 0.6)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(symbol, cx, cy);

    return canvas.toBuffer("image/png");
  }

  const kml = buildKmlDoc({ aoi: aoiFC, layers: layersClipped, includeAoi, kmlName });

  const zip = new JSZip();
  zip.file("doc.kml", kml);
  zip.file("legend.png", legendPng);
  const mediaFolder = zip.folder("media");
  mediaFolder.file("dot.png", dotPng);

  // Add structure symbol icons
  mediaFolder.file("symbol_M.png", createSymbolIcon("M"));
  mediaFolder.file("symbol_H.png", createSymbolIcon("H"));
  mediaFolder.file("symbol_V.png", createSymbolIcon("V"));
  mediaFolder.file("symbol_?.png", createSymbolIcon("?"));

  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  await fsp.mkdir(path.dirname(outPath), { recursive: true });
  await fsp.writeFile(outPath, buf);
}

module.exports = { exportClippedKmz };
