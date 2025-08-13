// =============================
// backend/ingest/kmlKmz.js
// =============================
const path = require("path");
const mapshaper = require("mapshaper");

async function readKmlKmzZipToGeoJSON(filePath) {
  // mapshaper can read .kml, .kmz, and .zip (zipped shapefiles).
  // combine-files merges multi-layer inputs; force avoids overwrite prompts when using stdout
  const cmd = `-i "${filePath}" combine-files -o format=geojson precision=0.000001 encoding=utf8 force stdout`;
  const { stdout } = await mapshaper.runCommands(cmd);
  const gj = JSON.parse(stdout);
  return { name: path.basename(filePath, path.extname(filePath)), geojson: gj };
}

module.exports = { readKmlKmzZipToGeoJSON };