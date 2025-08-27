// =============================
// backend/ingest/shapefile.js
// =============================
const fsp = require("fs/promises");
const path = require("path");
const shapefile = require("shapefile");
const { detectSrcEpsgFromPrj, reprojectGeoJSON } = require("./reproject");
const proj4 = require("proj4");

function sampleXY(coords) {
  if (!coords) return null;
  if (typeof coords[0] === "number") return [coords[0], coords[1]];
  let n = coords;
  while (Array.isArray(n) && Array.isArray(n[0])) n = n[0];
  return Array.isArray(n) ? [n[0], n[1]] : null;
}

async function readShapefileToGeoJSON(shpPath, srcEpsg = null) {
  const dbfPath = shpPath.replace(/\.shp$/i, ".dbf");

  if (!srcEpsg) {
    const prjPath = shpPath.replace(/\.shp$/i, ".prj");
    try {
      const prjText = await fsp.readFile(prjPath, "utf8");
      srcEpsg = detectSrcEpsgFromPrj(prjText);
    } catch { /* no .prj */ }
  }

  const source = await shapefile.open(shpPath, dbfPath);
  const features = [];
  while (true) {
    const r = await source.read();
    if (r.done) break;
    const { properties, geometry } = r.value || {};
    if (!geometry) continue;
    features.push({ type: "Feature", properties: properties || {}, geometry });
  }

  let gj = { type: "FeatureCollection", features };

  // Debug: show detected EPSG and how the first coordinate converts to lon/lat
  const samp = sampleXY(features[0]?.geometry?.coordinates);
  let preview = null;
  if (samp && srcEpsg && srcEpsg !== 4326) {
    try { preview = proj4(`EPSG:${srcEpsg}`, "EPSG:4326", samp); } catch {}
  }
  console.log("[BACKEND] shapefile",
    path.basename(shpPath),
    "detected srcEpsg:", srcEpsg,
    "sample:", samp,
    preview ? ("-> lon/lat " + JSON.stringify(preview)) : ""
  );

  if (srcEpsg && srcEpsg !== 4326) {
    try {
      gj = reprojectGeoJSON(gj, srcEpsg, 4326);
    } catch (e) {
      console.warn(`[BACKEND] reprojection failed EPSG:${srcEpsg}→4326; using raw coords.`, e?.message || e);
    }
  }

  return { name: path.basename(shpPath, path.extname(shpPath)), geojson: gj };
}

module.exports = { readShapefileToGeoJSON };
