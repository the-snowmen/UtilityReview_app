// =============================
// backend/util.js
// =============================
const fsp = require("fs/promises");
const path = require("path");

function extLower(p) { return path.extname(p || "").toLowerCase(); }
const SUPPORTED_EXTS = new Set([".shp", ".kml", ".kmz", ".zip", ".geojson", ".json"]);

async function fileExists(p) {
  try { await fsp.access(p); return true; } catch { return false; }
}

async function readText(p, encoding = "utf8") { return fsp.readFile(p, encoding); }
function isSupported(p) { return SUPPORTED_EXTS.has(extLower(p)); }

module.exports = { extLower, SUPPORTED_EXTS, fileExists, readText, isSupported };