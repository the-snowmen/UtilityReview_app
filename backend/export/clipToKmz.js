// backend/export/clipToKmz.js
const fs = require("fs/promises");
const path = require("path");
const JSZip = require("jszip");
const mapshaper = require("mapshaper");
// Use the CommonJS build of tokml
const tokml = require("tokml");

/**
 * Export AOI-clipped features to a KMZ file (doc.kml zipped).
 * Supports points, lines, and polygons in the input FeatureCollection.
 *
 * @param {object} aoi      Polygon/MultiPolygon (Feature | FC | Geometry)
 * @param {object} features FeatureCollection to clip
 * @param {string} outPath  Absolute path ending with .kmz
 * @param {object} [opts]
 * @param {boolean} [opts.stripProps=false] If true, drops all properties
 * @param {string}  [opts.kmlName="AOI Export"] KML Document name
 */
async function exportClippedKmz(aoi, features, outPath, opts = {}) {
  if (!aoi) throw new Error("AOI is required");
  if (!features || !Array.isArray(features.features) || features.features.length === 0) {
    throw new Error("No features to export");
  }
  if (!outPath) throw new Error("Output path required");
  if (!outPath.toLowerCase().endsWith(".kmz")) outPath += ".kmz";

  const aoiFC = toPolygonFC(aoi);

  // Feed both layers to mapshaper with explicit names, then clip
  const inputs = {
    "features.json": JSON.stringify(features),
    "aoi.json": JSON.stringify(aoiFC),
  };

  const cmd = [
    "-i features.json name=features",
    "-i aoi.json name=aoi",
    "-clip target=features aoi",
    "-o format=geojson precision=0.000001 clipped.json",
  ].join(" ");

  const outFiles = await mapshaper.applyCommands(cmd, inputs);
  const clipped = JSON.parse(outFiles["clipped.json"].toString());

  if (opts.stripProps) {
    for (const f of clipped.features) f.properties = {};
  }

  const kml = tokml(clipped, {
    name: "name",
    description: "description",
    documentName: opts.kmlName || "AOI Export",
  });

  const zip = new JSZip();
  zip.file("doc.kml", kml);
  const kmzBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, kmzBuffer);
}

/** Ensure input is a FeatureCollection of (Multi)Polygons */
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

module.exports = { exportClippedKmz };
