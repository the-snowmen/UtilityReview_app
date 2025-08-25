// backend/export/clipToKmz.js
const fs = require("fs/promises");
const path = require("path");
const JSZip = require("jszip");
const turf = require("@turf/turf");

/**
 * Export features clipped to an AOI into a KMZ with styling/legend.
 * @param {import("geojson").Feature|import("geojson").Polygon|import("geojson").MultiPolygon|number[]} aoi
 * @param {Array<{
 *   name: string,
 *   style: {
 *     baseColor?: string,
 *     weight?: number,
 *     opacity?: number,
 *     styleBy?: {
 *       field: string,
 *       rules: Record<string,string>,
 *       defaultColor?: string,
 *       hidden?: string[]
 *     }
 *   },
 *   features: import("geojson").FeatureCollection
 * }>} layersIn
 * @param {string} [outPath]
 * @param {{keepAttributes?: boolean, includeAoi?: boolean, lineWidthPx?: number, aoiStrokeAlpha?: number, aoiFillAlpha?: number, aoiWidthPx?: number}} [opts]
 * @returns {Promise<{ok: boolean, path?: string, buffer?: Buffer}>}
 */

// =======================
// Defaults (overridable)
// =======================
const DEFAULT_FEATURE_WIDTH_PX = 4;   // thicker so GE Pro renders nicely
const DEFAULT_AOI_STROKE_ALPHA = 1.0;  // opaque outline
const DEFAULT_AOI_FILL_ALPHA   = 0.55; // visible red fill on dark backgrounds
const DEFAULT_AOI_WIDTH_PX     = 3;

async function exportClippedKmz(aoi, layersIn, outPath, opts = {}) {
  const keepAttributes = !!opts.keepAttributes;
  const includeAoi = !!opts.includeAoi;

  const featureWidthPx = Number(opts.lineWidthPx) || DEFAULT_FEATURE_WIDTH_PX;
  const aoiStrokeAlpha = opts.aoiStrokeAlpha ?? DEFAULT_AOI_STROKE_ALPHA;
  const aoiFillAlpha   = opts.aoiFillAlpha   ?? DEFAULT_AOI_FILL_ALPHA;
  const aoiWidthPx     = Number(opts.aoiWidthPx) || DEFAULT_AOI_WIDTH_PX;

  const AOI_STROKE_KML = hexToKmlColor("#ff5a5f", aoiStrokeAlpha);
  const AOI_FILL_KML   = hexToKmlColor("#ff9aa2", aoiFillAlpha);

  const aoiPoly = normalizeToPolygon(aoi);
  if (!aoiPoly) throw new Error("AOI must be a Polygon/MultiPolygon (or a bbox array).");

  const docStyles = [];
  const docFolders = [];

  // ---------- AOI ----------
  if (includeAoi) {
    const aoiStyleId = "aoi__style";
    const aoiSm = kmlStyleMap({
      id: aoiStyleId,
      strokeKml: AOI_STROKE_KML,
      widthPx: aoiWidthPx,
      fillKml: AOI_FILL_KML,
    });
    docStyles.push(aoiSm.xml);

    const aoiPlacemarks = polygonGeomToKmlPlacemarks(
      aoiPoly.geometry,
      aoiSm.url,
      "AOI",
      { strokeKml: AOI_STROKE_KML, widthPx: aoiWidthPx, fillKml: AOI_FILL_KML }
    );
    docFolders.push(`
      <Folder>
        <name>AOI</name>
        ${aoiPlacemarks}
      </Folder>
    `);
  }

  // ---------- Layers ----------
  for (const L of layersIn || []) {
    const src = L?.features;
    if (!src?.features?.length) continue;

    // 1) Clip to AOI (polygons trimmed; lines/points kept if they intersect)
    const clippedFC = clipWithAOI(src, aoiPoly);

    // 2) Apply hidden-category filter
    const sb = L?.style?.styleBy || null;
    const styleField = sb?.field || null;
    const rules = sb?.rules || {};
    const hidden = Array.isArray(sb?.hidden) ? new Set(sb.hidden.map(String)) : new Set();

    let feats = clippedFC.features;
    if (styleField && hidden.size) {
      feats = feats.filter(f => !hidden.has(String(f?.properties?.[styleField])));
    }
    if (!feats.length) continue;

    // 3) Drop attrs if requested (but keep style field + name)
    const fc = keepAttributes
      ? { type: "FeatureCollection", features: feats }
      : {
          type: "FeatureCollection",
          features: feats.map(f => {
            const props = {};
            if (styleField) props[styleField] = f?.properties?.[styleField];
            if (f?.properties?.name !== undefined) props.name = f.properties.name;
            return { ...f, properties: props };
          })
        };

    // 4) Compute used categories (inside AOI)
    const baseColorHex =
      L?.style?.baseColor || L?.style?.base || L?.style?.color || "#3388ff";
    const defaultColorHex = sb?.defaultColor || baseColorHex;

    const usedValues = new Set();
    let defaultCount = 0;
    for (const f of fc.features) {
      const v = styleField != null ? f?.properties?.[styleField] : undefined;
      if (styleField == null || v == null || !(String(v) in rules)) {
        defaultCount++;
      } else {
        usedValues.add(String(v));
      }
    }

    // 5) Build StyleMap styles for used categories only
    const layerStyleXml = [];
    const ruleStyleIds = new Map(); // value -> styleUrl
    const layerIdBase = safeId(L?.name || "Layer");

    for (const [val, hex] of Object.entries(rules)) {
      if (!usedValues.has(String(val))) continue;
      const id = `${layerIdBase}__${safeId(val)}`;
      const sm = kmlStyleMap({
        id,
        strokeKml: hexToKmlColor(hex, 1),
        widthPx: featureWidthPx,
        fillKml: hexToKmlColor(hex, 0.35),
      });
      layerStyleXml.push(sm.xml);
      ruleStyleIds.set(String(val), sm.url);
    }

    // Default style if needed
    let defaultStyleUrl = null;
    if (defaultCount > 0 || usedValues.size === 0) {
      const defId = `${layerIdBase}__default`;
      const defSm = kmlStyleMap({
        id: defId,
        strokeKml: hexToKmlColor(defaultColorHex, 1),
        widthPx: featureWidthPx,
        fillKml: hexToKmlColor(defaultColorHex, 0.25),
      });
      layerStyleXml.push(defSm.xml);
      defaultStyleUrl = defSm.url;
    }

    // 6) Placemarks (styleUrl + inline fallback)
    const placemarksXml = fc.features.map(f => {
      const name = (f.properties?.name != null) ? String(f.properties.name) : null;

      let strokeHex = defaultColorHex;
      let fillHex   = defaultColorHex;
      let url = defaultStyleUrl;

      if (styleField != null) {
        const v = f?.properties?.[styleField];
        const sUrl = ruleStyleIds.get(String(v));
        if (sUrl) {
          url = sUrl;
          strokeHex = rules[String(v)];
          fillHex   = rules[String(v)];
        }
      }

      return buildPlacemarkXml(
        f,
        url,
        name,
        {
          strokeKml: hexToKmlColor(strokeHex, 1),
          widthPx: featureWidthPx,
          fillKml:  hexToKmlColor(fillHex, 0.35),
        }
      );
    }).join("");

    // 7) Legend (only used categories; hidden by default so it doesn't affect the view)
    const legendXml = buildLegendFolder(L?.name || "Layer", {
      rules, usedValues, defaultColorHex, defaultCount
    });

    docStyles.push(layerStyleXml.join(""));
    docFolders.push(`
      <Folder>
        <name>${escapeXml(L?.name || "Layer")}</name>
        ${placemarksXml}
      </Folder>
      ${legendXml}
    `);
  }

  // ---------- Assemble KML with a LookAt on the AOI ----------
  const lookAtXml = buildLookAtForBbox(turf.bbox(aoiPoly));
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${escapeXml(path.basename(outPath || "export.kmz"))}</name>
  <open>1</open>
  ${lookAtXml}
  ${docStyles.join("\n")}
  ${docFolders.join("\n")}
</Document>
</kml>`.trim();

  // ZIP → KMZ
  const zip = new JSZip();
  zip.file("doc.kml", kml);
  const kmzBuf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });

  if (outPath) {
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, kmzBuf);
    return { ok: true, path: outPath };
  }
  return { ok: true, buffer: kmzBuf };
}

// =======================
// Geometry helpers
// =======================
function normalizeToPolygon(geo) {
  if (!geo) return null;
  const g = geo.type === "Feature" ? geo.geometry : geo;
  if (!g) return null;
  if (g.type === "Polygon" || g.type === "MultiPolygon") return turf.feature(g);
  // Support bbox array [minX,minY,maxX,maxY]
  if (Array.isArray(geo) && geo.length === 4 && geo.every(Number.isFinite)) {
    return turf.bboxPolygon(geo);
  }
  return null;
}

function clipWithAOI(fc, aoiPoly) {
  const out = [];
  for (const f of fc.features || []) {
    if (!f?.geometry) continue;
    const ft = f.type === "Feature" ? f : turf.feature(f);
    const typ = ft.geometry.type;

    try {
      if (typ === "Polygon" || typ === "MultiPolygon") {
        const inter = safeIntersect(ft, aoiPoly);
        if (inter) out.push({ ...f, geometry: inter.geometry });
      } else if (typ === "LineString" || typ === "MultiLineString") {
        if (turf.booleanIntersects(ft, aoiPoly)) out.push(f);
      } else if (typ === "Point" || typ === "MultiPoint") {
        if (turf.booleanIntersects(ft, aoiPoly)) out.push(f);
      } else if (typ === "GeometryCollection") {
        const parts = flattenGeometryCollection(ft);
        for (const p of parts) {
          if (p.geometry.type === "Polygon" || p.geometry.type === "MultiPolygon") {
            const inter = safeIntersect(p, aoiPoly);
            if (inter) { out.push({ ...f, geometry: inter.geometry }); continue; }
          } else if (turf.booleanIntersects(p, aoiPoly)) {
            out.push(f); break;
          }
        }
      }
    } catch {
      if (turf.booleanIntersects(ft, aoiPoly)) out.push(f);
    }
  }
  return { type: "FeatureCollection", features: out };
}

function safeIntersect(a, b) { try { return turf.intersect(a, b) || null; } catch { return null; } }

function flattenGeometryCollection(feature) {
  if (feature.geometry?.type !== "GeometryCollection") return [feature];
  const out = [];
  for (const g of feature.geometry.geometries || []) out.push(turf.feature(g, feature.properties || {}));
  return out;
}

// =======================
// KML helpers
// =======================
function hexToKmlColor(hex, alpha = 1) {
  // hex "#rrggbb" -> KML "aabbggrr"
  const a = Math.round(Math.max(0, Math.min(1, Number(alpha) || 0)) * 255).toString(16).padStart(2, "0");
  const r = parseInt(hex.slice(1, 3), 16).toString(16).padStart(2, "0");
  const g = parseInt(hex.slice(3, 5), 16).toString(16).padStart(2, "0");
  const b = parseInt(hex.slice(5, 7), 16).toString(16).padStart(2, "0");
  return a + b + g + r;
}
function safeId(s) { return String(s || "").replace(/[^a-zA-Z0-9_\-]/g, "_"); }
function escapeXml(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;")
    .replaceAll("'","&apos;");
}

// StyleMap: normal + highlight (slightly thicker on highlight)
function kmlStyleMap({ id, strokeKml, widthPx, fillKml, highlightGrow = 2 }) {
  const nId = `${safeId(id)}-n`;
  const hId = `${safeId(id)}-h`;
  const wN = Math.max(1, Number(widthPx) || 1);
  const wH = Math.max(1, wN + highlightGrow);

  const fillNode = c => c ? `<PolyStyle><color>${c}</color><fill>1</fill><outline>1</outline></PolyStyle>` : "";

  const xml = `
  <Style id="${nId}">
    <LineStyle><color>${strokeKml}</color><width>${wN}</width></LineStyle>
    ${fillNode(fillKml)}
  </Style>
  <Style id="${hId}">
    <LineStyle><color>${strokeKml}</color><width>${wH}</width></LineStyle>
    ${fillNode(fillKml)}
  </Style>
  <StyleMap id="${safeId(id)}">
    <Pair><key>normal</key><styleUrl>#${nId}</styleUrl></Pair>
    <Pair><key>highlight</key><styleUrl>#${hId}</styleUrl></Pair>
  </StyleMap>`.trim();

  return { xml, url: `#${safeId(id)}` };
}

function buildPlacemarkXml(feature, styleUrl, nameText, inline) {
  const name = nameText ? `<name>${escapeXml(nameText)}</name>` : "";
  const styleRef = styleUrl ? `<styleUrl>${styleUrl}</styleUrl>` : "";

  let inlineXml = "";
  if (inline && (inline.strokeKml || inline.fillKml || inline.widthPx)) {
    inlineXml = `
      <Style>
        ${inline.strokeKml || inline.widthPx ? `<LineStyle>${inline.strokeKml ? `<color>${inline.strokeKml}</color>` : ""}${inline.widthPx ? `<width>${inline.widthPx}</width>` : ""}</LineStyle>` : ""}
        ${inline.fillKml ? `<PolyStyle><color>${inline.fillKml}</color><fill>1</fill><outline>1</outline></PolyStyle>` : ""}
      </Style>`;
  }

  const geomXml = geometryToKml(feature.geometry);
  if (!geomXml) return "";
  return `
  <Placemark>
    ${name}
    ${styleRef}
    ${inlineXml}
    ${geomXml}
  </Placemark>`.trim();
}

function geometryToKml(geom) {
  if (!geom) return "";
  switch (geom.type) {
    case "Point": return pointToKml(geom.coordinates);
    case "MultiPoint": return multiGeometry(geom.coordinates.map(pointToKml));
    case "LineString": return lineToKml(geom.coordinates);
    case "MultiLineString": return multiGeometry(geom.coordinates.map(lineToKml));
    case "Polygon": return polygonToKml(geom.coordinates);
    case "MultiPolygon": return multiGeometry(geom.coordinates.map(polygonToKml));
    case "GeometryCollection": {
      const parts = (geom.geometries || []).map(geometryToKml).filter(Boolean);
      return parts.length ? `<MultiGeometry>${parts.join("")}</MultiGeometry>` : "";
    }
    default: return "";
  }
}

function pointToKml(coord) {
  const [lng, lat] = coord;
  return `<Point><coordinates>${lng},${lat},0</coordinates></Point>`;
}
function lineToKml(coords) {
  const cs = coords.map(([lng, lat]) => `${lng},${lat},0`).join(" ");
  return `<LineString><tessellate>1</tessellate><coordinates>${cs}</coordinates></LineString>`;
}
function polygonToKml(rings) {
  if (!rings?.length) return "";
  const [outer, ...holes] = rings;
  const outerStr = (outer || []).map(([lng, lat]) => `${lng},${lat},0`).join(" ");
  const holesStr = holes.map(h => `
    <innerBoundaryIs>
      <LinearRing><coordinates>${h.map(([lng,lat]) => `${lng},${lat},0`).join(" ")}</coordinates></LinearRing>
    </innerBoundaryIs>`).join("");
  return `
    <Polygon>
      <tessellate>1</tessellate>
      <outerBoundaryIs>
        <LinearRing><coordinates>${outerStr}</coordinates></LinearRing>
      </outerBoundaryIs>
      ${holesStr}
    </Polygon>`.trim();
}
function multiGeometry(geomsXmlArray) { return `<MultiGeometry>${geomsXmlArray.join("")}</MultiGeometry>`; }

function polygonGeomToKmlPlacemarks(geom, styleUrl, name, inline) {
  if (!geom) return "";
  const inlineXml = (inline && (inline.strokeKml || inline.fillKml || inline.widthPx))
    ? `
      <Style>
        ${inline.strokeKml || inline.widthPx ? `<LineStyle>${inline.strokeKml ? `<color>${inline.strokeKml}</color>` : ""}${inline.widthPx ? `<width>${inline.widthPx}</width>` : ""}</LineStyle>` : ""}
        ${inline.fillKml ? `<PolyStyle><color>${inline.fillKml}</color><fill>1</fill><outline>1</outline></PolyStyle>` : ""}
      </Style>` : "";

  if (geom.type === "Polygon") {
    return `
      <Placemark>
        ${name ? `<name>${escapeXml(name)}</name>` : ""}
        <styleUrl>${styleUrl}</styleUrl>
        ${inlineXml}
        ${polygonToKml(geom.coordinates)}
      </Placemark>`;
  }
  if (geom.type === "MultiPolygon") {
    return geom.coordinates.map((poly, i) => `
      <Placemark>
        ${name ? `<name>${escapeXml(name)} ${i+1}</name>` : ""}
        <styleUrl>${styleUrl}</styleUrl>
        ${inlineXml}
        ${polygonToKml(poly)}
      </Placemark>`).join("");
  }
  return "";
}

// =======================
// Legend (hidden by default)
// =======================
function buildLegendFolder(layerName, legend) {
  const { rules, usedValues, defaultColorHex, defaultCount } = legend;
  const entries = [];

  for (const [val, hex] of Object.entries(rules)) {
    if (!usedValues.has(String(val))) continue;
    entries.push({ label: String(val), hex });
  }
  if (defaultCount > 0) entries.push({ label: "Other", hex: defaultColorHex });

  if (!entries.length) return "";

  return `
  <Folder>
    <name>Legend — ${escapeXml(layerName)}</name>
    <visibility>0</visibility>
    ${entries.map(e => `
      <Placemark>
        <name>${escapeXml(e.label)}</name>
        <Style>
          <IconStyle>
            <color>${hexToKmlColor(e.hex, 1)}</color>
            <scale>1.2</scale>
            <Icon>
              <href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href>
            </Icon>
          </IconStyle>
        </Style>
        <Point><coordinates>0,0,0</coordinates></Point>
      </Placemark>`).join("")}
  </Folder>`.trim();
}

// =======================
// LookAt for initial view
// =======================
function buildLookAtForBbox(bbox) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const lon = (minLon + maxLon) / 2;
  const lat = (minLat + maxLat) / 2;
  const dLon = Math.max(1e-6, maxLon - minLon);
  const dLat = Math.max(1e-6, maxLat - minLat);

  const mPerDegLat = 111320;
  const mPerDegLon = mPerDegLat * Math.cos(lat * Math.PI / 180);
  const spanMeters = Math.max(dLon * mPerDegLon, dLat * mPerDegLat);
  const range = Math.max(200, spanMeters * 1.6); // pad a bit

  return `
  <LookAt>
    <longitude>${lon}</longitude>
    <latitude>${lat}</latitude>
    <altitude>0</altitude>
    <range>${Math.round(range)}</range>
    <tilt>0</tilt>
    <heading>0</heading>
    <altitudeMode>clampToGround</altitudeMode>
  </LookAt>`.trim();
}

// =======================
// Exports
// =======================
module.exports = {
  exportClippedKmz,
  _utils: { hexToKmlColor, clipWithAOI, normalizeToPolygon, buildLookAtForBbox },
};
