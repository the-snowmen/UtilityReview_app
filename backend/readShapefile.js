// readShapefile.js
const fsp = require("fs/promises");
const path = require("path");
const shapefile = require("shapefile");
const proj4 = require("proj4");

// Basic proj4 defs
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs +type=crs");
proj4.defs("EPSG:4269", "+proj=longlat +datum=NAD83 +no_defs +type=crs");
proj4.defs("EPSG:3857", "+proj=merc +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs +type=crs");

function detectSrcEpsgFromPrj(prjText) {
  if (!prjText) return null;
  const s = prjText.toLowerCase();
  if (s.includes("auxiliary_sphere") || s.includes("102100")) return 3857; // ESRI Auxiliary Sphere
  if (s.includes("north_american_1983") || s.includes("nad_1983") || s.includes("nad83")) return 4269;
  if (s.includes("wgs_1984") || s.includes("wgs 1984")) return 4326;
  const m = prjText.match(/epsg[^\d]*(\d{3,6})/i);
  return m ? Number(m[1]) : null;
}

function transformCoords(coords, forward) {
  // handles [x,y], LineString rings, Multi*, Polygon nesting
  if (typeof coords[0] === "number") {
    const [x, y] = coords;
    const [lon, lat] = forward([x, y]);
    return [lon, lat];
  }
  return coords.map(c => transformCoords(c, forward));
}

async function shapefileToGeoJSON(shpPath, srcEpsg = null) {
  if (!/\.shp$/i.test(shpPath)) {
    // Allow simple GeoJSON passthrough if user selects .geojson/.json
    if (/\.(geojson|json)$/i.test(shpPath)) {
      const txt = await fsp.readFile(shpPath, "utf8");
      return { geojson: JSON.parse(txt) };
    }
    throw new Error("Unsupported file type; select a .shp or .geojson");
  }

  // Try to read .prj for EPSG detection if none given
  if (!srcEpsg) {
    const prjPath = shpPath.replace(/\.shp$/i, ".prj");
    try {
      const prj = await fsp.readFile(prjPath, "utf8");
      srcEpsg = detectSrcEpsgFromPrj(prj) || null;
    } catch (_) { /* no .prj, ignore */ }
  }

  const dbfPath = shpPath.replace(/\.shp$/i, ".dbf");
  const source = await shapefile.open(shpPath, dbfPath); // relies on iconv-lite via package
  const features = [];
  while (true) {
    const r = await source.read();
    if (r.done) break;
    features.push({ type: "Feature", properties: r.value.properties, geometry: r.value.geometry });
  }

  // Reproject to WGS84 if needed
  if (srcEpsg && srcEpsg !== 4326) {
    const src = proj4(`EPSG:${srcEpsg}`);
    const dst = proj4("EPSG:4326");
    const forward = (xy) => proj4(src, dst, xy);

    for (const f of features) {
      const g = f.geometry;
      if (!g) continue;
      if (g.type === "GeometryCollection") {
        g.geometries = g.geometries.map(gg => ({
          ...gg, coordinates: transformCoords(gg.coordinates, forward)
        }));
      } else if (g.coordinates) {
        g.coordinates = transformCoords(g.coordinates, forward);
      }
    }
  }

  return { geojson: { type: "FeatureCollection", features } };
}

module.exports = { shapefileToGeoJSON };
