// backend/export/clipToKmz.js
const fsp = require("fs/promises");
const path = require("path");
const JSZip = require("jszip");
const mapshaper = require("mapshaper");
let createCanvas;
try { ({ createCanvas } = require("canvas")); }
catch { throw new Error("Missing dependency: canvas. Install with `npm i canvas`"); }

// ---------- Helpers ----------
function hexToKmlColor(hex, opacity = 1) {
  const h = String(hex || "#ff3333").replace("#", "");
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  const a = Math.max(0, Math.min(255, Math.round(opacity * 255)));
  const to2 = (n)=>n.toString(16).padStart(2,"0");
  return `${to2(a)}${to2(b)}${to2(g)}${to2(r)}`.toLowerCase(); // AABBGGRR
}

function eachCoord(geom, fn) {
  // Calls fn([x,y]) for any GeoJSON geometry
  if (!geom) return;
  const t = geom.type;
  const C = geom.coordinates;
  if (t === "Point") return fn(C);
  if (t === "MultiPoint" || t === "LineString") return C.forEach(fn);
  if (t === "MultiLineString" || t === "Polygon") {
    // flatten one level to get an array of [x,y]
    return C.flat(1).forEach(fn);
  }
  if (t === "MultiPolygon") return C.flat(2).forEach(fn);
  if (t === "GeometryCollection") return geom.geometries.forEach(g => eachCoord(g, fn));
}

function centroidOfPolygonlike(fc) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of fc?.features || []) {
    eachCoord(f.geometry, ([x,y]) => {
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    });
  }
  if (minX === Infinity) return { lon: -96, lat: 39, range: 1200000 };
  const lon = (minX + maxX) / 2;
  const lat = (minY + maxY) / 2;
  const dx = maxX - minX, dy = maxY - minY;
  const km = Math.max(dx, dy) * 111;         // rough degrees→km
  const range = Math.max(500, Math.min(5e6, km * 1000 * 2.2));
  return { lon, lat, range };
}

function geomToKml(geom) {
  const esc = (n)=>Number(n).toFixed(7);
  const coords1 = (arr)=>arr.map(([x,y])=>`${esc(x)},${esc(y)},0`).join(" ");
  const polygon = (rings)=>`
    <Polygon><tessellate>1</tessellate>
      <outerBoundaryIs><LinearRing><coordinates>${coords1(rings[0])}</coordinates></LinearRing></outerBoundaryIs>
      ${rings.slice(1).map(h=>`<innerBoundaryIs><LinearRing><coordinates>${coords1(h)}</coordinates></LinearRing></innerBoundaryIs>`).join("")}
    </Polygon>`;
  const line = (pts)=>`<LineString><tessellate>1</tessellate><coordinates>${coords1(pts)}</coordinates></LineString>`;
  const point = (pt)=>`<Point><coordinates>${esc(pt[0])},${esc(pt[1])},0</coordinates></Point>`;

  const t = geom.type;
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
  const f = fc?.features?.find?.(x => x?.geometry?.type);
  return f?.geometry?.type || "Unknown";
}

// ---------- Mapshaper clipping ----------
async function clipWithMapshaper(layerFC, aoiFC) {
  const inputs = {
    "aoi.json": JSON.stringify(aoiFC),
    "src.json": JSON.stringify(layerFC),
  };
  const cmd = [
    "-i aoi.json name=aoi",
    "-i src.json name=src",
    "-clip target=src source=aoi",
    "-o format=geojson precision=0.000001 clipped.json"
  ].join(" ");
  const out = await mapshaper.applyCommands(cmd, inputs);
  const clipped = JSON.parse(out["clipped.json"] || '{"type":"FeatureCollection","features":[]}');
  return clipped;
}

// ---------- Legend PNG ----------
function drawLegendPng(layersMeta) {
  const rowH = 20, titleH = 18, groupPad = 10, sidePad = 12;
  let rows = 0;
  for (const L of layersMeta) {
    rows += 1; // title
    if (L.style.styleBy?.field) {
      const hidden = new Set(L.style.styleBy.hidden || []);
      const keys = Object.keys(L.style.styleBy.rules || {});
      rows += Math.max(1, keys.filter(k => !hidden.has(String(k))).length);
    } else rows += 1;
    rows += 1; // spacing
  }
  const width = 360;
  const height = Math.max(60, rows * rowH + layersMeta.length * groupPad + 24);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // bg
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.fillRect(0, 0, width, height);

  ctx.font = "12px Segoe UI, system-ui, Arial";
  ctx.fillStyle = "#0f172a";
  ctx.textBaseline = "middle";

  let y = 12;

  ctx.fillStyle = "#334155";
  ctx.font = "bold 12px Segoe UI, system-ui, Arial";
  ctx.fillText("Legend", sidePad, y);
  y += 16;

  for (const L of layersMeta) {
    y += 6;
    ctx.font = "600 12px Segoe UI, system-ui, Arial";
    ctx.fillStyle = "#0b1324";
    ctx.fillText(L.name, sidePad, y);
    y += titleH;

    const g = L.geomType;
    const baseColor = L.style.baseColor || "#ff3333";
    const w = Math.max(1, Math.min(12, Number(L.style.weight || 2)));
    const op = Number(L.style.opacity ?? 1);

    function drawSwatch(x, cy, colorHex) {
      const color = colorHex || baseColor;
      if (g.includes("Point")) {
        const r = Math.max(3, w + 2);
        ctx.beginPath(); ctx.arc(x+10, cy, r, 0, Math.PI*2);
        ctx.fillStyle = color; ctx.globalAlpha = op; ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = "#333"; ctx.lineWidth = 0.5; ctx.stroke();
      } else if (g.includes("Line")) {
        ctx.strokeStyle = color; ctx.lineWidth = w; ctx.globalAlpha = op;
        ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x+24, cy); ctx.stroke(); ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = color; ctx.globalAlpha = op;
        ctx.fillRect(x, cy-6, 24, 12); ctx.globalAlpha = 1;
        ctx.strokeStyle = "#777"; ctx.lineWidth = 1; ctx.strokeRect(x, cy-6, 24, 12);
      }
    }

    if (L.style.styleBy?.field) {
      const field = L.style.styleBy.field;
      const hidden = new Set(L.style.styleBy.hidden || []);
      const rules = L.style.styleBy.rules || {};
      const keys = Object.keys(rules);
      const vis = keys.filter(k => !hidden.has(String(k)));

      if (!vis.length) {
        drawSwatch(sidePad, y + 10, L.style.styleBy.defaultColor || baseColor);
        ctx.fillStyle = "#475569";
        ctx.font = "12px Segoe UI, system-ui, Arial";
        ctx.fillText("(all categories hidden)", sidePad + 36, y + 10);
        y += rowH;
      } else {
        for (const k of vis) {
          drawSwatch(sidePad, y + 10, rules[k] || baseColor);
          ctx.fillStyle = "#0f172a";
          ctx.font = "12px Segoe UI, system-ui, Arial";
          ctx.fillText(`${field} = ${k}`, sidePad + 36, y + 10);
          y += rowH;
        }
      }
    } else {
      drawSwatch(sidePad, y + 10, baseColor);
      ctx.fillStyle = "#0f172a";
      ctx.font = "12px Segoe UI, system-ui, Arial";
      ctx.fillText("Features", sidePad + 36, y + 10);
      y += rowH;
    }
    y += groupPad;
  }
  return canvas.toBuffer("image/png");
}

// ---------- KML builder ----------
function escapeXml(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&apos;");
}

function buildKmlDoc({ aoi, layers, includeAoi }) {
  const allStyles = new Map(); // styleId -> xml
  const placemarks = [];

  function styleIdFor(layerIdx, color, weight, isPolyOrLine, pointIconHref) {
    const key = `${layerIdx}|${color}|${weight}|${isPolyOrLine?"pl":"pt"}`;
    if (allStyles.has(key)) return key;
    const kmlColor = hexToKmlColor(color, 1);
    const line = `<LineStyle><color>${kmlColor}</color><width>${Math.max(1, weight)}</width></LineStyle>`;
    const poly = `<PolyStyle><color>${hexToKmlColor(color, 0.6)}</color><fill>1</fill><outline>1</outline></PolyStyle>`;
    const icon = pointIconHref
      ? `<IconStyle><color>${kmlColor}</color><scale>${Math.max(0.6, Math.min(4, weight/2))}</scale><Icon><href>${pointIconHref}</href></Icon></IconStyle>`
      : "";
    const xml = `<Style id="${key}">${icon}${line}${poly}</Style>`;
    allStyles.set(key, xml);
    return key;
  }

  // AOI style (optional)
  if (includeAoi) {
    allStyles.set("aoi-style", `
      <Style id="aoi-style">
        <LineStyle><color>${hexToKmlColor("#ff5a5f", 1)}</color><width>2</width></LineStyle>
        <PolyStyle><color>${hexToKmlColor("#ff9aa2", 0.25)}</color></PolyStyle>
      </Style>`);
    for (const f of aoi.features || []) {
      placemarks.push(`
        <Placemark><name>AOI</name><styleUrl>#aoi-style</styleUrl>
          ${geomToKml(f.geometry)}
        </Placemark>`);
    }
  }

  layers.forEach((L, idx) => {
    const base = L.style?.baseColor || "#ff3333";
    const weight = Number(L.style?.weight ?? 2);
    const sb = L.style?.styleBy || null;
    const hidden = new Set((sb?.hidden || []).map(String));
    const rules = sb?.rules || {};

    const geomType = guessLayerGeomType(L.features);
    const isPoint = geomType.includes("Point");

    for (const f of L.features.features || []) {
      const props = f.properties || {};
      const val = sb?.field ? String(props[sb.field]) : null;
      if (val && hidden.has(val)) continue;

      const color = (val && rules[val]) || sb?.defaultColor || base;
      const sid = styleIdFor(idx, color, weight, !isPoint, isPoint ? "media/dot.png" : null);
      placemarks.push(`
        <Placemark>
          <name>${escapeXml(L.name)}</name>
          <styleUrl>#${sid}</styleUrl>
          ${geomToKml(f.geometry)}
        </Placemark>`);
    }
  });

  const { lon, lat, range } = centroidOfPolygonlike(aoi);

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
  <kml xmlns="http://www.opengis.net/kml/2.2">
    <Document>
      <name>AOI Export</name>
      <open>1</open>
      <LookAt>
        <longitude>${lon.toFixed(7)}</longitude>
        <latitude>${lat.toFixed(7)}</latitude>
        <range>${Math.max(500, Math.min(5e6, range || 200000))}</range>
        <tilt>0</tilt>
        <heading>0</heading>
      </LookAt>

      ${[...allStyles.values()].join("\n")}

      ${placemarks.join("\n")}

      <!-- ScreenOverlay legend (bottom-right) -->
      <ScreenOverlay>
        <name>Legend</name>
        <Icon><href>legend.png</href></Icon>
        <overlayXY x="1" y="0" xunits="fraction" yunits="fraction"/>
        <screenXY  x="0.98" y="0.02" xunits="fraction" yunits="fraction"/>
        <size      x="0" y="0" xunits="pixels"  yunits="pixels"/>
      </ScreenOverlay>
    </Document>
  </kml>`;
  return kml;
}

// ---------- Public API ----------
async function exportClippedKmz(aoi, data, outPath, opts = {}) {
  const includeAoi = opts.includeAoi !== false;
  const keepAttrs = !!opts.keepAttributes;

  // Normalize AOI -> FeatureCollection
  const aoiFC = (aoi?.type === "FeatureCollection") ? aoi : { type: "FeatureCollection", features: [aoi] };

  // Normalize layer array input
  const layersIn = Array.isArray(data)
    ? data
    : [{ name: "Layer", style: { baseColor: "#ff3333", weight: 2, opacity: 1 }, features: data }];

  // 1) Clip each layer to AOI
  const layersClipped = [];
  for (const L of layersIn) {
    if (!L?.features?.features?.length) continue;
    const clipped = await clipWithMapshaper(L.features, aoiFC);
    if (!clipped?.features?.length) continue;

    if (!keepAttrs) for (const f of clipped.features) f.properties = {};

    layersClipped.push({
      name: L.name || "Layer",
      features: clipped,
      style: {
        baseColor: L.style?.baseColor || "#ff3333",
        weight: Number(L.style?.weight ?? 2),
        opacity: Number(L.style?.opacity ?? 1),
        styleBy: L.style?.styleBy ? {
          field: L.style.styleBy.field,
          rules: L.style.styleBy.rules || {},
          defaultColor: L.style.styleBy.defaultColor || (L.style?.baseColor || "#ff3333"),
          hidden: Array.isArray(L.style.styleBy.hidden) ? L.style.styleBy.hidden : (L.style.styleBy.hidden ? [...L.style.styleBy.hidden] : []),
        } : null
      }
    });
  }

  if (!layersClipped.length && !includeAoi) throw new Error("No visible features within AOI to export.");

  // 2) Legend PNG
  const legendMeta = layersClipped.map(L => ({
    name: L.name,
    geomType: guessLayerGeomType(L.features),
    style: L.style
  }));
  const legendPng = drawLegendPng(legendMeta);

  // 3) Point icon
  const dotCanvas = createCanvas(16, 16);
  const dctx = dotCanvas.getContext("2d");
  dctx.clearRect(0,0,16,16);
  dctx.fillStyle = "#ffffff";
  dctx.beginPath(); dctx.arc(8,8,6,0,Math.PI*2); dctx.fill();
  const dotPng = dotCanvas.toBuffer("image/png");

  // 4) KML
  const kml = buildKmlDoc({ aoi: aoiFC, layers: layersClipped, includeAoi });

  // 5) Package KMZ
  const zip = new JSZip();
  zip.file("doc.kml", kml);
  zip.file("legend.png", legendPng);
  zip.file("media/dot.png", dotPng);

  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  await fsp.mkdir(path.dirname(outPath), { recursive: true });
  await fsp.writeFile(outPath, buf);
}

module.exports = { exportClippedKmz };
