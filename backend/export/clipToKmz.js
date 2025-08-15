// backend/export/clipToKmz.js
const fs = require("fs/promises");
const path = require("path");
const JSZip = require("jszip");
const mapshaper = require("mapshaper");

// ---------- Public API ----------
/**
 * Export AOI-clipped data to KMZ.
 * Accepts either:
 *  - a FeatureCollection (merged), or
 *  - an array of { name, style: {color, weight, opacity}, features: FeatureCollection }
 *
 * Always strips attributes for privacy and includes the AOI polygon in the KMZ.
 */
async function exportClippedKmz(aoi, data, outPath, opts = {}) {
  if (!aoi) throw new Error("AOI is required");
  if (!outPath) throw new Error("Output path required");
  if (!outPath.toLowerCase().endsWith(".kmz")) outPath += ".kmz";

  const aoiFC = toPolygonFC(aoi);
  const includeAoi = opts.includeAoi !== false; // default true
  const docName = opts.kmlName || "AOI Export";

  // Normalize input into a layered array with style metadata
  const layers = normalizeToLayers(data);

  // Clip each layer to the AOI with mapshaper (reliable for pts/lines/polys)
  const clippedLayers = [];
  for (const layer of layers) {
    const clipped = await clipWithMapshaper(layer.features, aoiFC);

    // Respect "Keep attributes" checkbox
    const keepProps = !!opts.keepAttributes;
    if (!keepProps && Array.isArray(clipped.features)) {
      for (const f of clipped.features) f.properties = {};
    }

    clippedLayers.push({ ...layer, features: clipped });
  }

  // Build a styled KML string (with AOI folder)
  const kml = buildKml(docName, clippedLayers, includeAoi ? aoiFC : null);

  // Package KML as KMZ (doc.kml)
  const zip = new JSZip();
  zip.file("doc.kml", kml);
  const kmz = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, kmz);
}


module.exports = { exportClippedKmz };

// ---------- Helpers ----------

function normalizeToLayers(data) {
  // Array of layers? Keep as-is.
  if (Array.isArray(data)) {
    return data.map((d, i) => ({
      name: d?.name || `Layer ${i + 1}`,
      style: ensureStyle(d?.style),
      features: ensureFC(d?.features),
    }));
  }

  // Single FeatureCollection? Wrap in one layer with a default style.
  if (data && data.type === "FeatureCollection") {
    return [{
      name: "Features",
      style: ensureStyle({}), // defaults
      features: ensureFC(data),
    }];
  }

  throw new Error("Export payload must be a FeatureCollection or an array of layers.");
}

function ensureStyle(s = {}) {
  // Defaults match your UI look
  return {
    color: isColorHex(s.color) ? s.color : "#ff0000",
    weight: isFiniteNum(s.weight) ? s.weight : 2,
    opacity: isFiniteNum(s.opacity) ? s.opacity : 1,
  };
}

function isFiniteNum(n) { return Number.isFinite(+n); }
function isColorHex(x) { return typeof x === "string" && /^#?[0-9a-f]{6}$/i.test(x); }

function ensureFC(fc) {
  if (!fc || fc.type !== "FeatureCollection" || !Array.isArray(fc.features))
    throw new Error("Layer is missing a valid FeatureCollection");
  return fc;
}

async function clipWithMapshaper(fc, aoiFC) {
  const inputs = {
    "feats.json": JSON.stringify(fc),
    "aoi.json": JSON.stringify(aoiFC),
  };
  const cmd = [
    "-i feats.json name=features",
    "-i aoi.json name=aoi",
    "-clip target=features aoi",
    "-o format=geojson precision=0.000001 out.json",
  ].join(" ");
  const out = await mapshaper.applyCommands(cmd, inputs);
  return JSON.parse(out["out.json"].toString());
}

function toPolygonFC(aoi) {
  if (!aoi) throw new Error("AOI missing");
  if (aoi.type === "FeatureCollection") {
    const polys = (aoi.features || []).filter(f =>
      f?.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon")
    );
    if (!polys.length) throw new Error("AOI FC has no Polygon/MultiPolygon");
    return { type: "FeatureCollection", features: polys };
  }
  if (aoi.type === "Feature") {
    const g = aoi.geometry;
    if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) {
      throw new Error("AOI Feature must be Polygon/MultiPolygon");
    }
    return { type: "FeatureCollection", features: [aoi] };
  }
  if (aoi.type === "Polygon" || aoi.type === "MultiPolygon") {
    return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: aoi }] };
  }
  throw new Error("Unsupported AOI type");
}

// ---------- KML builder (styled) ----------

function buildKml(docName, layers, aoiFCOrNull) {
  const stylesXml = [];
  const foldersXml = [];

  // Styles + folders for data layers
  layers.forEach((layer, idx) => {
    const styleId = `style-layer-${idx}`;
    stylesXml.push(styleForLayer(styleId, layer.style));

    const placemarks = (layer.features.features || [])
      .map(f => placemarkXml(styleId, f.geometry))
      .join("");

    foldersXml.push(
      `<Folder><name>${xml(layer.name)}</name>${placemarks}</Folder>`
    );
  });

  // AOI folder (outline only)
  if (aoiFCOrNull) {
    stylesXml.push(`
      <Style id="style-aoi">
        <LineStyle><color>${kmlColor("#000000", 1)}</color><width>2</width></LineStyle>
        <PolyStyle><fill>0</fill><outline>1</outline></PolyStyle>
      </Style>
    `);

    const aoiPlacemarks = (aoiFCOrNull.features || [])
      .map(f => placemarkXml("style-aoi", f.geometry))
      .join("");

    foldersXml.push(`<Folder><name>AOI</name>${aoiPlacemarks}</Folder>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${xml(docName)}</name>
  ${stylesXml.join("")}
  ${foldersXml.join("")}
</Document>
</kml>`;
}

function styleForLayer(id, s) {
  // One style covers lines & polys; points use IconStyle color
  const kmlCol = kmlColor(s.color, s.opacity);
  const width = Math.max(1, +s.weight || 1);
  return `
<Style id="${xml(id)}">
  <LineStyle><color>${kmlCol}</color><width>${width}</width></LineStyle>
  <PolyStyle><color>${kmlCol}</color><fill>1</fill><outline>1</outline></PolyStyle>
  <IconStyle><color>${kmlCol}</color><scale>1.1</scale></IconStyle>
</Style>`;
}

function placemarkXml(styleId, geom) {
  const g = geom ? geomToKml(geom) : "";
  if (!g) return "";
  return `<Placemark><styleUrl>#${xml(styleId)}</styleUrl>${g}</Placemark>`;
}

function geomToKml(g) {
  if (!g) return "";
  const t = g.type;
  switch (t) {
    case "Point": return pointKml(g.coordinates);
    case "MultiPoint": return multiKml(g.coordinates.map(pointKml));
    case "LineString": return lineKml(g.coordinates);
    case "MultiLineString": return multiKml(g.coordinates.map(lineKml));
    case "Polygon": return polygonKml(g.coordinates);
    case "MultiPolygon": return multiKml(g.coordinates.map(polygonKml));
    case "GeometryCollection": return multiKml((g.geometries || []).map(geomToKml));
    default: return "";
  }
}

function pointKml([x, y]) {
  return `<Point><coordinates>${num(x)},${num(y)}</coordinates></Point>`;
}

function lineKml(coords) {
  return `<LineString><tessellate>1</tessellate><coordinates>${coordList(coords)}</coordinates></LineString>`;
}

function polygonKml(rings) {
  // rings: [outer, hole1, hole2, ...]
  if (!Array.isArray(rings) || !rings.length) return "";
  const outer = `<outerBoundaryIs><LinearRing><coordinates>${coordList(rings[0])}</coordinates></LinearRing></outerBoundaryIs>`;
  const inners = rings.slice(1).map(r =>
    `<innerBoundaryIs><LinearRing><coordinates>${coordList(r)}</coordinates></LinearRing></innerBoundaryIs>`
  ).join("");
  return `<Polygon><tessellate>1</tessellate>${outer}${inners}</Polygon>`;
}

function multiKml(parts) {
  const body = parts.map(p => (typeof p === "string" ? p : "")).join("");
  return `<MultiGeometry>${body}</MultiGeometry>`;
}

function coordList(coords) {
  return coords.map(c => `${num(c[0])},${num(c[1])}`).join(" ");
}

function num(n) {
  // compact but stable precision for KML
  return Number(n).toFixed(6).replace(/\.?0+$/,"");
}

function xml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Convert CSS hex + opacity (0..1) to KML aabbggrr */
function kmlColor(hex, opacity = 1) {
  const h = hex.replace("#", "");
  const rr = parseInt(h.slice(0, 2), 16);
  const gg = parseInt(h.slice(2, 4), 16);
  const bb = parseInt(h.slice(4, 6), 16);
  const aa = Math.max(0, Math.min(1, +opacity)) * 255;
  const a = Math.round(aa).toString(16).padStart(2, "0");
  const b = bb.toString(16).padStart(2, "0");
  const g = gg.toString(16).padStart(2, "0");
  const r = rr.toString(16).padStart(2, "0");
  return (a + b + g + r).toUpperCase();
}
