// =============================
// backend/ingest/shapefile.js
// =============================
const fsp = require("fs/promises");
const path = require("path");
const shapefile = require("shapefile");
const mapshaper = require("mapshaper");
const { detectSrcEpsgFromPrj, reprojectGeoJSON } = require("../reproject");

/** Heuristic: do the coordinates *look* like lon/lat degrees? */
function looksLikeDegrees(coords) {
  if (!coords) return false;

  // Flatten a limited sample (avoid huge allocations)
  const flat = [];
  const stack = [coords];
  while (stack.length && flat.length < 2000) {
    const v = stack.pop();
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) stack.push(v[i]);
    } else if (typeof v === "number" && Number.isFinite(v)) {
      flat.push(v);
    }
  }
  if (flat.length < 2) return false;

  // Check pairs as [lon, lat]
  let okPairs = 0, pairs = 0;
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const lon = flat[i], lat = flat[i + 1];
    if (Math.abs(lon) <= 180 && Math.abs(lat) <= 90) okPairs++;
    pairs++;
  }
  return pairs > 0 && okPairs / pairs >= 0.7;
}

function sampleXY(coords) {
  if (!coords) return null;
  if (typeof coords[0] === "number") return [coords[0], coords[1]];
  let n = coords;
  while (Array.isArray(n) && Array.isArray(n[0])) n = n[0];
  return Array.isArray(n) ? [n[0], n[1]] : null;
}

async function reprojectWithMapshaper(gj, to = "wgs84") {
  const input = JSON.stringify(gj);
  const cmd = `-i data.json -proj ${to} -o format=geojson precision=0.000001 force stdout`;
  const { stdout } = await mapshaper.runCommands(cmd, { "data.json": input });
  return JSON.parse(stdout);
}

/** Read a .shp (+.dbf/.prj) into GeoJSON, reprojecting to EPSG:4326 when needed. */
async function readShapefileToGeoJSON(shpPath, srcEpsg = null) {
  const dbfPath = shpPath.replace(/\.shp$/i, ".dbf");

  // Try auto-detect from .prj if caller didn't specify srcEpsg
  if (!srcEpsg) {
    const prjPath = shpPath.replace(/\.shp$/i, ".prj");
    try {
      const prjText = await fsp.readFile(prjPath, "utf8");
      srcEpsg = detectSrcEpsgFromPrj(prjText);
    } catch {
      // no .prj or unreadable — leave srcEpsg as null
    }
  }

  // Stream features out of the shapefile
  const source = await shapefile.open(shpPath, dbfPath);
  const features = [];
  while (true) {
    const r = await source.read();
    if (r.done) break;
    const { properties, geometry } = r.value || {};
    if (!geometry) continue;
    features.push({ type: "Feature", properties: properties || {}, geometry });
  }

  // Build FeatureCollection
  let gj = { type: "FeatureCollection", features };

  // DEBUG: log what we actually saw
  const firstSample = sampleXY(features[0]?.geometry?.coordinates);
  console.log(
    "[BACKEND] shapefile",
    path.basename(shpPath),
    "detected srcEpsg:", srcEpsg,
    "sample:", firstSample
  );

  // Reproject to EPSG:4326 if appropriate
  if (srcEpsg && srcEpsg !== 4326 && features.length) {
    const firstCoords = features[0]?.geometry?.coordinates;
    const suspectWebMercator = srcEpsg === 3857 && looksLikeDegrees(firstCoords);

    if (suspectWebMercator) {
      console.warn(
        `[BACKEND] Skipping reprojection: PRJ suggests 3857 but coordinates appear to be degrees (4326). ${path.basename(shpPath)}`
      );
    } else {
      try {
        gj = reprojectGeoJSON(gj, srcEpsg, 4326);
      } catch (e) {
        console.warn(
          `[BACKEND] proj4 reprojection failed EPSG:${srcEpsg}→4326; trying mapshaper. Error:`,
          e?.message || e
        );
        try {
          gj = await reprojectWithMapshaper(gj, "wgs84");
        } catch (e2) {
          console.warn("[BACKEND] mapshaper reprojection also failed; using raw coords.", e2?.message || e2);
        }
      }
    }
  }

  return { name: path.basename(shpPath, path.extname(shpPath)), geojson: gj };
}

module.exports = { readShapefileToGeoJSON };
