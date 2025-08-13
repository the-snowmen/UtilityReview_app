// =============================
// backend/ingest/shapefile.js
// =============================
const fsp = require("fs/promises");
const path = require("path");
const shapefile = require("shapefile");
const { detectSrcEpsgFromPrj, reprojectGeoJSON } = require("../reproject");

async function readShapefileToGeoJSON(shpPath, srcEpsg = null) {
  const dbfPath = shpPath.replace(/\.shp$/i, ".dbf");

  if (!srcEpsg) {
    const prjPath = shpPath.replace(/\.shp$/i, ".prj");
    try { srcEpsg = detectSrcEpsgFromPrj(await fsp.readFile(prjPath, "utf8")); }
    catch (_) {}
  }

  const source = await shapefile.open(shpPath, dbfPath);
  const features = [];
  while (true) {
    const r = await source.read();
    if (r.done) break;
    features.push({ type: "Feature", properties: r.value.properties, geometry: r.value.geometry });
  }
  let gj = { type: "FeatureCollection", features };
  if (srcEpsg && srcEpsg !== 4326) gj = reprojectGeoJSON(gj, srcEpsg, 4326);
  return { name: path.basename(shpPath, path.extname(shpPath)), geojson: gj };
}

module.exports = { readShapefileToGeoJSON };