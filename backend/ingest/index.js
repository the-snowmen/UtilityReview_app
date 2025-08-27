// =============================
// backend/ingest/index.js
// =============================

const fsp = require("fs/promises");
const path = require("path");
const { readShapefileToGeoJSON } = require("./shapefile");
const { readKmlKmzZipToGeoJSON } = require("./kmz");

async function ingestAny(filePath, srcEpsg = null) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".shp") {
    return readShapefileToGeoJSON(filePath, srcEpsg);
  }
  if (ext === ".kml" || ext === ".kmz" || ext === ".zip") {
    return readKmlKmzZipToGeoJSON(filePath);
  }
  if (ext === ".geojson" || ext === ".json") {
    const txt = await fsp.readFile(filePath, "utf8");
    const gj = JSON.parse(txt);
    return { name: path.basename(filePath, ext), geojson: gj };
  }
  throw new Error(`Unsupported file type: ${ext}`);
}

module.exports = { ingestAny };