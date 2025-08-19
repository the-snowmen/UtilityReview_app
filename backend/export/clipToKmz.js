// backend/export/clipToKmz.js
const fs = require("fs/promises");
const JSZip = require("jszip");
const mapshaper = require("mapshaper");

// KML color is aabbggrr (alpha first), hex
function hexToKmlColor(hex, alpha = 1) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  const rgb = m ? m[1] : "ff0000";
  const r = rgb.substring(0,2), g = rgb.substring(2,4), b = rgb.substring(4,6);
  const a = Math.round(alpha * 255).toString(16).padStart(2, "ff");
  return (a + b + g + r).toLowerCase();
}

function escapeXml(s) {
  return String(s ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;")
    .replace(/'/g,"&apos;");
}

function coordString(g) {
  const t = g?.type;
  if (t === "Point") {
    const [x,y] = g.coordinates;
    return `${x},${y},0`;
  }
  const ring = (arr) => arr.map(([x,y]) => `${x},${y},0`).join(" ");
  if (t === "LineString") return g.coordinates.map(([x,y]) => `${x},${y},0`).join(" ");
  if (t === "Polygon") {
    const outer = `<outerBoundaryIs><LinearRing><coordinates>${ring(g.coordinates[0])}</coordinates></LinearRing></outerBoundaryIs>`;
    const inners = (g.coordinates.slice(1)||[]).map(
      r => `<innerBoundaryIs><LinearRing><coordinates>${ring(r)}</coordinates></LinearRing></innerBoundaryIs>`
    ).join("");
    return { outer, inners };
  }
  if (t === "MultiLineString") return g.coordinates.map(ls => ls.map(([x,y]) => `${x},${y},0`).join(" "));
  if (t === "MultiPolygon") {
    return g.coordinates.map(poly => ({
      outer: `<outerBoundaryIs><LinearRing><coordinates>${ring(poly[0])}</coordinates></LinearRing></outerBoundaryIs>`,
      inners: (poly.slice(1)||[]).map(r => `<innerBoundaryIs><LinearRing><coordinates>${ring(r)}</coordinates></LinearRing></innerBoundaryIs>`).join("")
    }));
  }
  if (t === "MultiPoint") return g.coordinates.map(([x,y]) => `${x},${y},0`);
  return null;
}

function buildLegendHtml(layers) {
  let rows = [];
  for (const L of layers) {
    const sb = L.style?.styleBy;
    if (!sb || !sb.field) {
      rows.push(`<tr><th colspan="2" style="text-align:left;padding-top:6px">${escapeXml(L.name)}</th></tr>
                 <tr><td><div style="width:14px;height:14px;background:${escapeXml(L.style?.baseColor||"#ff3333")};border:1px solid #333"></div></td><td>All features</td></tr>`);
      continue;
    }
    rows.push(`<tr><th colspan="2" style="text-align:left;padding-top:6px">${escapeXml(L.name)} — ${escapeXml(sb.field)}</th></tr>`);
    const hidden = new Set(sb.hidden||[]);
    for (const [val,color] of Object.entries(sb.rules || {})) {
      if (hidden.has(String(val))) continue;
      rows.push(`<tr><td><div style="width:14px;height:14px;background:${escapeXml(color)};border:1px solid #333"></div></td><td>${escapeXml(val)}</td></tr>`);
    }
    rows.push(`<tr><td><div style="width:14px;height:14px;background:${escapeXml(sb.defaultColor||L.style?.baseColor||"#ff3333")};border:1px solid #333"></div></td><td>Other</td></tr>`);
  }
  return `
  <![CDATA[
  <div style="font-family:Segoe UI,Roboto,Arial,sans-serif;font-size:12px">
    <h3 style="margin:0 0 6px 0">Legend</h3>
    <table cellspacing="4" cellpadding="2" style="border-collapse:separate">
      ${rows.join("")}
    </table>
    <div style="margin-top:8px;color:#666">Hidden categories are omitted.</div>
  </div>
  ]]>`;
}

function layerStyleEntries(layer, layerIndex) {
  const baseColor = layer?.style?.baseColor || "#ff3333";
  const weight = Math.max(1, Math.min(20, layer?.style?.weight ?? 2));
  const opacity = Math.max(0, Math.min(1, layer?.style?.opacity ?? 1));
  const sb = layer?.style?.styleBy || null;
  const hidden = new Set(sb?.hidden || []);
  const ruleMap = sb?.rules || {};

  const styles = [];
  const styleIdForVal = (val) => `L${layerIndex}_v_${Buffer.from(String(val)).toString("hex")}`;
  const fallbackId = `L${layerIndex}_default`;

  styles.push({ id: fallbackId, color: sb?.defaultColor || baseColor, weight, opacity });

  if (sb?.field) {
    for (const [val, col] of Object.entries(ruleMap)) {
      if (hidden.has(String(val))) continue;
      styles.push({ id: styleIdForVal(val), color: col, weight, opacity });
    }
  }
  return { styles, styleIdForVal, fallbackId, field: sb?.field || null };
}

function kmlStyleXml(id, colorHex, weight, opacity) {
  const kmlCol = hexToKmlColor(colorHex, opacity);
  return `
  <Style id="${escapeXml(id)}">
    <LineStyle><color>${kmlCol}</color><width>${weight}</width></LineStyle>
    <PolyStyle><color>${kmlCol}</color><fill>1</fill><outline>1</outline></PolyStyle>
    <IconStyle>
      <color>${kmlCol}</color><scale>1.0</scale>
      <Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon>
    </IconStyle>
  </Style>`;
}

function placemarkForFeature(f, styleUrl, keepAttributes) {
  const g = f.geometry;
  const name = f.properties?.name || "";
  const descTbl = keepAttributes
    ? Object.entries(f.properties || {}).map(([k,v])=>`<tr><th>${escapeXml(k)}</th><td>${escapeXml(v)}</td></tr>`).join("")
    : "";

  const desc = keepAttributes && descTbl ? `<description><![CDATA[<table>${descTbl}</table>]]></description>` : "";

  if (g.type === "Point") {
    const coords = coordString(g);
    return `<Placemark><name>${escapeXml(name)}</name>${desc}<styleUrl>#${escapeXml(styleUrl)}</styleUrl><Point><coordinates>${coords}</coordinates></Point></Placemark>`;
  }
  if (g.type === "LineString") {
    const coords = coordString(g);
    return `<Placemark><name>${escapeXml(name)}</name>${desc}<styleUrl>#${escapeXml(styleUrl)}</styleUrl><LineString><coordinates>${coords}</coordinates></LineString></Placemark>`;
  }
  if (g.type === "Polygon") {
    const { outer, inners } = coordString(g);
    return `<Placemark><name>${escapeXml(name)}</name>${desc}<styleUrl>#${escapeXml(styleUrl)}</styleUrl><Polygon>${outer}${inners}</Polygon></Placemark>`;
  }
  if (g.type === "MultiPoint") {
    return coordString(g).map(c => `<Placemark><name>${escapeXml(name)}</name>${desc}<styleUrl>#${escapeXml(styleUrl)}</styleUrl><Point><coordinates>${c}</coordinates></Point></Placemark>`).join("");
  }
  if (g.type === "MultiLineString") {
    return coordString(g).map(seg => `<Placemark><name>${escapeXml(name)}</name>${desc}<styleUrl>#${escapeXml(styleUrl)}</styleUrl><LineString><coordinates>${seg}</coordinates></LineString></Placemark>`).join("");
  }
  if (g.type === "MultiPolygon") {
    return coordString(g).map(p => `<Placemark><name>${escapeXml(name)}</name>${desc}<styleUrl>#${escapeXml(styleUrl)}</styleUrl><Polygon>${p.outer}${p.inners}</Polygon></Placemark>`).join("");
  }
  return "";
}

// Clip a FeatureCollection to AOI using mapshaper (in-memory)
async function clipWithAOI(fc, aoi) {
  if (!aoi) return fc;
  const files = { "src.json": JSON.stringify(fc), "aoi.json": JSON.stringify(aoi) };
  const cmd = "-i src.json name=src -clip aoi.json -o format=geojson out.json";
  const out = await mapshaper.applyCommands(cmd, files);
  const clippedStr = out["out.json"];
  return clippedStr ? JSON.parse(clippedStr) : fc;
}

// Create KML for AOI polygon(s)
function aoiFolderKml(aoi) {
  const styleId = "AOI_STYLE";
  const stroke = hexToKmlColor("#6b7280", 1);   // gray 700 for outline
  const fill   = hexToKmlColor("#9ca3af", 0.18); // gray 400, alpha ~0.18

  let s = `
  <Style id="${styleId}">
    <LineStyle><color>${stroke}</color><width>2</width></LineStyle>
    <PolyStyle><color>${fill}</color><fill>1</fill><outline>1</outline></PolyStyle>
  </Style>
  <Folder><name>AOI</name><open>1</open>
  `;

  const pushGeom = (geom) => {
    if (!geom) return;
    if (geom.type === "Polygon") {
      const { outer, inners } = coordString(geom);
      s += `<Placemark><name>AOI</name><styleUrl>#${styleId}</styleUrl><Polygon>${outer}${inners}</Polygon></Placemark>`;
    } else if (geom.type === "MultiPolygon") {
      const polys = coordString(geom);
      polys.forEach(p => {
        s += `<Placemark><name>AOI</name><styleUrl>#${styleId}</styleUrl><Polygon>${p.outer}${p.inners}</Polygon></Placemark>`;
      });
    }
  };

  if (aoi.type === "Feature") pushGeom(aoi.geometry);
  else if (aoi.type === "FeatureCollection") (aoi.features||[]).forEach(f => pushGeom(f.geometry));
  else if (aoi.type === "Polygon" || aoi.type === "MultiPolygon") pushGeom(aoi);

  s += `</Folder>`;
  return s;
}

/**
 * Export KMZ:
 *  - clips each layer to AOI
 *  - honors keepAttributes
 *  - includes ONE legend folder (no Document-level duplicate)
 *  - optionally includes the AOI polygon
 */
async function exportClippedKmz(aoi, exportData, outPath, opts = {}) {
  const keepAttributes = !!opts.keepAttributes;
  const includeAoi = !!opts.includeAoi;

  const layersIn = Array.isArray(exportData)
    ? exportData
    : [{ name: "Layer", style: {}, features: exportData }];

  // Clip & (optionally) strip attributes
  const layers = [];
  for (const L of layersIn) {
    const clipped = await clipWithAOI(L.features, aoi);
    if (!clipped?.features?.length) continue;

    const fc = keepAttributes ? clipped : {
      type: "FeatureCollection",
      features: clipped.features.map(f => ({ ...f, properties: {} }))
    };

    layers.push({ name: L.name, style: L.style || {}, features: fc });
  }

  // If nothing intersects, still create an explanatory KMZ
  if (!layers.length) {
    const zip = new JSZip();
    zip.file("doc.kml", `<?xml version="1.0" encoding="UTF-8"?>
      <kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <name>${escapeXml(opts.kmlName || "AOI Export")}</name>
      <open>1</open>
      ${includeAoi && aoi ? aoiFolderKml(aoi) : ""}
      <Placemark><name>No features intersect the AOI</name></Placemark>
      </Document></kml>`);
    const content = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
    await fs.writeFile(outPath, content);
    return;
  }

  // Build KML
  const legendHtml = buildLegendHtml(layers);
  let kml = `<?xml version="1.0" encoding="UTF-8"?>
  <kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(opts.kmlName || "AOI Export")}</name>
    <open>1</open>
    <!-- Intentionally no Document-level legend to avoid duplicates -->
  `;

  // Styles per layer/category
  const styleEntries = layers.map((L, i) => layerStyleEntries(L, i));
  styleEntries.forEach(({ styles }) => styles.forEach(s => { kml += kmlStyleXml(s.id, s.color, s.weight, s.opacity); }));

  // Optional AOI polygon folder
  if (includeAoi && aoi) kml += aoiFolderKml(aoi);

  // Layers and Placemarks
  layers.forEach((L, i) => {
    const { styleIdForVal, fallbackId, field } = styleEntries[i];
    kml += `<Folder><name>${escapeXml(L.name)}</name>`;
    for (const f of L.features.features || []) {
      const val = field ? String(f?.properties?.[field] ?? "") : "";
      let styleId = fallbackId;

      if (field) {
        const rules = L.style?.styleBy?.rules || {};
        if (Object.prototype.hasOwnProperty.call(rules, val)) {
          styleId = styleIdForVal(val);
        }
      }

      kml += placemarkForFeature(f, styleId, keepAttributes);
    }
    kml += `</Folder>`;
  });

  // Single Legend folder (clickable balloon)
  kml += `<Folder><name>Legend</name><open>1</open>
    <Placemark><name>Legend (open me)</name><description>${legendHtml}</description>
      <Point><coordinates>0,0,0</coordinates></Point>
    </Placemark>
  </Folder>`;

  kml += `</Document></kml>`;

  // Zip to KMZ
  const zip = new JSZip();
  zip.file("doc.kml", kml);
  const content = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  await fs.writeFile(outPath, content);
}

module.exports = { exportClippedKmz };
