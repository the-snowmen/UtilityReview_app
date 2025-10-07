// backend/ingest/kmz.js
// Parse KML/KMZ → build a single AOI feature (Polygon or MultiPolygon)

const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");
const { DOMParser } = require("@xmldom/xmldom");
const togeojson = require("@tmcw/togeojson");

const readText = (p) => fs.promises.readFile(p, "utf8");
const readBuffer = (p) => fs.promises.readFile(p);

function kmlToFeature(kmlStr) {
  const dom = new DOMParser().parseFromString(kmlStr, "text/xml");
  const fc = togeojson.kml(dom, { styles: true }) || { type: "FeatureCollection", features: [] };

  // collect polygons
  const polys = [];
  for (const f of fc.features || []) {
    const g = f?.geometry;
    if (!g) continue;
    if (g.type === "Polygon") polys.push(g.coordinates);
    else if (g.type === "MultiPolygon") polys.push(...g.coordinates);
  }

  if (polys.length === 1) {
    return { type: "Feature", properties: { name: "AOI from KML/KMZ" },
      geometry: { type: "Polygon", coordinates: polys[0] } };
  }
  if (polys.length > 1) {
    return { type: "Feature", properties: { name: "AOI from KML/KMZ" },
      geometry: { type: "MultiPolygon", coordinates: polys } };
  }

  // Fallback: build bbox of all geometries if no polygons present
  const extent = bboxOfFC(fc);
  if (!extent) throw new Error("No polygons or measurable geometry found.");
  return { type: "Feature", properties: { name: "AOI (bbox from KML/KMZ)" },
    geometry: bboxPolygon(extent) };
}

function bboxOfFC(fc) {
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  function visit(c) {
    if (!c) return;
    if (typeof c[0] === "number") {
      const [x,y] = c; if (x<minX) minX=x; if (y<minY) minY=y; if (x>maxX) maxX=x; if (y>maxY) maxY=y; return;
    }
    for (const v of c) visit(v);
  }
  for (const f of fc.features || []) visit(f?.geometry?.coordinates);
  return minX===Infinity ? null : [minX,minY,maxX,maxY];
}
function bboxPolygon([minX,minY,maxX,maxY]) {
  return { type: "Polygon", coordinates: [[
    [minX,minY],[maxX,minY],[maxX,maxY],[minX,maxY],[minX,minY]
  ]]};
}

async function kmlFileToAoiFeature(filePath) {
  const kmlStr = await readText(filePath);
  return kmlToFeature(kmlStr);
}
async function kmzFileToAoiFeature(filePath) {
  const buf = await readBuffer(filePath);
  const zip = await JSZip.loadAsync(buf);
  const entries = zip.file(/\.kml$/i);
  if (!entries?.length) throw new Error("KMZ does not contain any .kml file.");
  const preferred = entries.find(f => /(^|\/)doc\.kml$/i.test(f.name)) || entries[0];
  const kmlStr = await preferred.async("string");
  return kmlToFeature(kmlStr);
}

async function fileToAoiFeature(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".kml") return kmlFileToAoiFeature(filePath);
  if (ext === ".kmz") return kmzFileToAoiFeature(filePath);
  throw new Error("Please select a .kml or .kmz file.");
}

module.exports = { fileToAoiFeature, kmlFileToAoiFeature, kmzFileToAoiFeature };
