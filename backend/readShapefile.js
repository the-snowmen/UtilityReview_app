// backend/readShapefile.js
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const shapefile = require("shapefile");
const proj4 = require("proj4");
const mapshaper = require("mapshaper"); // fallback for rare CRSs

// Basic proj4 defs
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs +type=crs");
proj4.defs("EPSG:4269", "+proj=longlat +datum=NAD83 +no_defs +type=crs");
proj4.defs("EPSG:3857", "+proj=merc +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs +type=crs");

const FALLBACK_ENCODINGS = ["utf-8", "latin1", "win1252", "gbk", "shiftjis"];

async function readTextSafe(p) { try { return await fsp.readFile(p, "utf8"); } catch { return null; } }
async function readPrjText(shpPath) { return await readTextSafe(shpPath.replace(/\.shp$/i, ".prj")); }
async function readCpg(shpPath) { return await readTextSafe(shpPath.replace(/\.shp$/i, ".cpg")); }

function normalizeCpgName(raw) {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s.includes("utf-8") || s === "utf8") return "utf-8";
  if (s.includes("iso-8859-1") || s.includes("latin1")) return "latin1";
  if (s.includes("1252") || s.includes("windows-1252") || s.includes("ansi")) return "win1252";
  if (s.includes("gbk") || s.includes("gb2312")) return "gbk";
  if (s.includes("shift") || s.includes("sjis")) return "shiftjis";
  return s;
}

function detectSrcEpsgFromPrj(prjText) {
  if (!prjText) return null;
  const s = prjText.toLowerCase();
  if (s.includes("auxiliary_sphere") || s.includes("102100")) return 3857; // ESRI Web Mercator Auxiliary Sphere
  if (s.includes("north_american_1983") || s.includes("nad_1983") || s.includes("nad83")) return 4269;
  if (s.includes("wgs_1984")) return 4326;
  const m = prjText.match(/epsg[^\d]*(\d{3,6})/i);
  return m ? Number(m[1]) : null;
}

async function readShpWithEncoding(shpPath, encoding) {
  const dbfPath = shpPath.replace(/\.shp$/i, ".dbf");
  return await shapefile.read(shpPath, dbfPath, { encoding }); // FeatureCollection
}

async function readShapefileRobust(shpPath) {
  const cpg = normalizeCpgName(await readCpg(shpPath));
  const tries = cpg ? [cpg, ...FALLBACK_ENCODINGS.filter(e => e !== cpg)] : FALLBACK_ENCODINGS;
  let lastErr = null;
  for (const enc of tries) {
    try { return await readShpWithEncoding(shpPath, enc); }
    catch (e) { lastErr = e; }
  }
  if (lastErr) throw lastErr;
  throw new Error("Unable to read shapefile DBF with common encodings.");
}

function reprojectCoords(coords, project) {
  if (typeof coords[0] === "number" && typeof coords[1] === "number") {
    const [x, y] = coords;
    const [lon, lat] = project.forward([x, y]);
    return [lon, lat];
  }
  return coords.map(c => reprojectCoords(c, project));
}

function reprojectGeometry(geom, fromEpsg) {
  if (!geom) return geom;
  if (fromEpsg === 4326 || fromEpsg === "EPSG:4326" || fromEpsg === null) return geom;
  const from = typeof fromEpsg === "string" ? fromEpsg : `EPSG:${fromEpsg}`;
  if (!proj4.defs(from)) return null; // let fallback handle
  const project = proj4(from, "EPSG:4326");
  return { type: geom.type, coordinates: reprojectCoords(geom.coordinates, project) };
}

function summarizeGeoJSON(gj) {
  const types = {};
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  function walk(c){ if(typeof c[0]==="number"){const[x,y]=c; if(x<minX)minX=x;if(y<minY)minY=y;if(x>maxX)maxX=x;if(y>maxY)maxY=y;} else c.forEach(walk);}
  for (const f of (gj.features||[])) {
    const t=f?.geometry?.type||"Unknown"; types[t]=(types[t]||0)+1;
    if (f?.geometry?.coordinates) walk(f.geometry.coordinates);
  }
  return { count: gj.features?.length||0, types, extent:{minX,minY,maxX,maxY} };
}

async function mapshaperTo4326(shpPath, srcEpsg) {
  const tmpName = `out_${crypto.randomBytes(6).toString("hex")}.geo.json`;
  const tmpPath = path.join(os.tmpdir(), tmpName);
  const projArg = srcEpsg ? `-proj from=EPSG:${srcEpsg} crs=EPSG:4326` : `-proj crs=EPSG:4326`;
  const cmd = `-quiet -i "${shpPath}" ${projArg} -o format=geojson precision=6 "${tmpPath}"`;
  await new Promise((res, rej) => mapshaper.runCommands(cmd, err => err ? rej(err) : res()));
  const buf = await fsp.readFile(tmpPath, "utf8");
  fsp.unlink(tmpPath).catch(()=>{});
  return JSON.parse(buf);
}

async function shapefileToGeoJSON(shpPath, userSrcEpsg /* optional */) {
  if (!/\.shp$/i.test(shpPath)) throw new Error("Please select a .shp file.");
  const prjTxt = await readPrjText(shpPath);
  const sniffed = detectSrcEpsgFromPrj(prjTxt);
  const srcEpsg = userSrcEpsg || sniffed || null;

  if (!prjTxt && !srcEpsg) {
    return { needsSrcEpsg: true, message: "Missing .prj — please specify the source EPSG." };
  }

  const gj = await readShapefileRobust(shpPath);

  // Reproject to 4326 (proj4) or fallback to mapshaper
  let out = gj;
  if (srcEpsg && (srcEpsg !== 4326)) {
    const feats = [];
    let usedProj4 = true;
    for (const f of gj.features || []) {
      const g = reprojectGeometry(f.geometry, srcEpsg);
      if (g === null) { usedProj4 = false; break; }
      feats.push({ type:"Feature", properties: f.properties, geometry: g });
    }
    out = usedProj4 ? { type:"FeatureCollection", features: feats } : await mapshaperTo4326(shpPath, srcEpsg);
  }
  return { encodingUsed: "auto", geojson: out, srcEpsgUsed: srcEpsg || "from .prj", debug: summarizeGeoJSON(out) };
}

module.exports = { shapefileToGeoJSON };
