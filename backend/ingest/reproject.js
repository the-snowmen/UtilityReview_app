// =============================
// backend/reproject.js
// =============================
const proj4 = require("proj4");

// EPSG:4326 WGS84 lon/lat (degrees)
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs +type=crs");

// EPSG:4269 NAD83 lon/lat (degrees)
proj4.defs("EPSG:4269", "+proj=longlat +datum=NAD83 +no_defs +type=crs");

// ✅ EPSG:3857 Web/Pseudo‑Mercator on a SPHERE (the only correct choice for “Web Mercator”)
// Do NOT use +datum=WGS84 here — that makes it ellipsoidal Mercator and produces a north shift.
const EPSG3857 = "+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +no_defs +type=crs";
proj4.defs("EPSG:3857", EPSG3857);
// ESRI alias (many .prj files say 102100/102113)
proj4.defs("EPSG:102100", EPSG3857);
proj4.defs("EPSG:102113", EPSG3857);

/** Try to guess an EPSG code from a PRJ WKT string. */
function detectSrcEpsgFromPrj(prjText) {
  if (!prjText) return null;
  const s = prjText.toLowerCase();

  // Common ESRI/WebMercator names and codes
  if (s.includes("auxiliary_sphere") || s.includes("web_mercator") || s.includes("wgs_1984_web_mercator") ||
      s.includes("102100") || s.includes("102113")) return 3857;

  if (s.includes("north_american_1983") || s.includes("nad_1983") || s.includes("nad83")) return 4269;
  if (s.includes("wgs_1984") || s.includes("wgs 1984")) return 4326;

  const m = prjText.match(/epsg[^\d]*(\d{3,6})/i);
  return m ? Number(m[1]) : null;
}

/** Recursively transform coordinate arrays using a forward function */
function transformCoords(coords, forward) {
  if (!coords) return coords;
  if (typeof coords[0] === "number") {
    const [x, y] = coords;
    return forward([x, y]);
  }
  return coords.map(c => transformCoords(c, forward));
}

/** Reproject a GeoJSON Feature/FeatureCollection to another EPSG (default 4326). */
function reprojectGeoJSON(geojson, fromEpsg, toEpsg = 4326) {
  if (!fromEpsg || fromEpsg === toEpsg) return geojson;

  const src = proj4(`EPSG:${fromEpsg}`);
  const dst = proj4(`EPSG:${toEpsg}`);
  const fwd = (xy) => proj4(src, dst, xy);

  const out = JSON.parse(JSON.stringify(geojson));
  for (const f of out.features || []) {
    const g = f.geometry; if (!g) continue;
    if (g.type === "GeometryCollection") {
      g.geometries = (g.geometries || []).map(gg => ({
        ...gg,
        coordinates: transformCoords(gg.coordinates, fwd)
      }));
    } else if (g.coordinates) {
      g.coordinates = transformCoords(g.coordinates, fwd);
    }
  }
  return out;
}

module.exports = { detectSrcEpsgFromPrj, reprojectGeoJSON };
