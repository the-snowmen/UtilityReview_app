// =============================
// backend/reproject.js
// =============================
const proj4 = require("proj4");

proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs +type=crs");
proj4.defs("EPSG:4269", "+proj=longlat +datum=NAD83 +no_defs +type=crs");
proj4.defs("EPSG:3857", "+proj=merc +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs +type=crs");

function detectSrcEpsgFromPrj(prjText) {
  if (!prjText) return null;
  const s = prjText.toLowerCase();
  if (s.includes("auxiliary_sphere") || s.includes("102100")) return 3857;
  if (s.includes("north_american_1983") || s.includes("nad_1983") || s.includes("nad83")) return 4269;
  if (s.includes("wgs_1984") || s.includes("wgs 1984")) return 4326;
  const m = prjText.match(/epsg[^\d]*(\d{3,6})/i);
  return m ? Number(m[1]) : null;
}

function transformCoords(coords, forward) {
  if (!coords) return coords;
  if (typeof coords[0] === "number") {
    const [x, y] = coords; return forward([x, y]);
  }
  return coords.map(c => transformCoords(c, forward));
}

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