// frontend/js/export/kml.js
// Build a styled KML string from AOI + array of layers { name, geojson, style }.

function hexToKmlColor(hex, alpha = 1.0) {
  // Accepts "#rrggbb" or "rrggbb". Returns "aabbggrr" (KML format).
  const h = (hex || "#000000").replace("#", "").trim();
  const r = parseInt(h.slice(0, 2) || "00", 16);
  const g = parseInt(h.slice(2, 4) || "00", 16);
  const b = parseInt(h.slice(4, 6) || "00", 16);
  const a = Math.max(0, Math.min(255, Math.round(alpha * 255)));
  const toHex2 = (n) => n.toString(16).padStart(2, "0");
  // KML uses AABBGGRR — yes, weird order
  return `${toHex2(a)}${toHex2(b)}${toHex2(g)}${toHex2(r)}`.toLowerCase();
}

function coordPair(c) {
  // GeoJSON [lng,lat,(z)] -> "lng,lat[,z]"
  if (c.length >= 3) return `${c[0]},${c[1]},${c[2]}`;
  return `${c[0]},${c[1]}`;
}

function ringCoords(coords) {
  // coords: array of [lng,lat,(z)] — ensure closed ring for KML polygon
  if (!coords || !coords.length) return "";
  const first = coords[0];
  const last = coords[coords.length - 1];
  const isClosed = first[0] === last[0] && first[1] === last[1];
  const arr = isClosed ? coords : coords.concat([first]);
  return arr.map(coordPair).join(" ");
}

function linestringCoords(coords) {
  return (coords || []).map(coordPair).join(" ");
}

function kmlStyleFrom(layerId, style) {
  const strokeOn = style?.stroke !== false;
  const fillOn   = style?.fill   !== false;

  const lineColor = hexToKmlColor(style?.color || "#22c55e", style?.opacity ?? 1.0);
  const polyColor = hexToKmlColor(style?.fillColor || style?.color || "#22c55e", style?.fillOpacity ?? 0.35);
  const width     = style?.weight ?? 2;

  return `
    <Style id="sty_${layerId}">
      <LineStyle>
        <color>${lineColor}</color>
        <width>${width}</width>
      </LineStyle>
      <PolyStyle>
        <color>${polyColor}</color>
        <fill>${fillOn ? 1 : 0}</fill>
        <outline>${strokeOn ? 1 : 0}</outline>
      </PolyStyle>
      <IconStyle>
        <scale>1.0</scale>
        <Icon><href>http://maps.google.com/mapfiles/kml/pushpin/ylw-pushpin.png</href></Icon>
      </IconStyle>
      <LabelStyle><scale>0.0</scale></LabelStyle>
    </Style>
  `;
}

function featurePlacemark(f, styleId, namePrefix = "") {
  const nm = (f.properties?.name || f.properties?.NAME || f.id || "Feature");
  const title = (namePrefix ? `${namePrefix} — ` : "") + nm;

  switch (f.geometry?.type) {
    case "Point": {
      const c = coordPair(f.geometry.coordinates);
      return `<Placemark><name>${title}</name><styleUrl>#${styleId}</styleUrl><Point><coordinates>${c}</coordinates></Point></Placemark>`;
    }
    case "MultiPoint": {
      const parts = (f.geometry.coordinates || []).map((pt, i) =>
        `<Placemark><name>${title} (${i+1})</name><styleUrl>#${styleId}</styleUrl><Point><coordinates>${coordPair(pt)}</coordinates></Point></Placemark>`
      ).join("");
      return parts;
    }
    case "LineString": {
      const c = linestringCoords(f.geometry.coordinates);
      return `<Placemark><name>${title}</name><styleUrl>#${styleId}</styleUrl><LineString><coordinates>${c}</coordinates></LineString></Placemark>`;
    }
    case "MultiLineString": {
      const parts = (f.geometry.coordinates || []).map((ls, i) =>
        `<Placemark><name>${title} (${i+1})</name><styleUrl>#${styleId}</styleUrl><LineString><coordinates>${linestringCoords(ls)}</coordinates></LineString></Placemark>`
      ).join("");
      return parts;
    }
    case "Polygon": {
      const rings = f.geometry.coordinates || [];
      const outer = rings[0] || [];
      const inners = rings.slice(1);
      const innerXml = inners.map(r => `<innerBoundaryIs><LinearRing><coordinates>${ringCoords(r)}</coordinates></LinearRing></innerBoundaryIs>`).join("");
      return `
        <Placemark><name>${title}</name><styleUrl>#${styleId}</styleUrl>
          <Polygon>
            <outerBoundaryIs><LinearRing><coordinates>${ringCoords(outer)}</coordinates></LinearRing></outerBoundaryIs>
            ${innerXml}
          </Polygon>
        </Placemark>`;
    }
    case "MultiPolygon": {
      const polys = f.geometry.coordinates || [];
      return polys.map((poly, i) => {
        const outer = poly[0] || [];
        const inners = (poly || []).slice(1);
        const innerXml = inners.map(r => `<innerBoundaryIs><LinearRing><coordinates>${ringCoords(r)}</coordinates></LinearRing></innerBoundaryIs>`).join("");
        return `
          <Placemark><name>${title} (${i+1})</name><styleUrl>#${styleId}</styleUrl>
            <Polygon>
              <outerBoundaryIs><LinearRing><coordinates>${ringCoords(outer)}</coordinates></LinearRing></outerBoundaryIs>
              ${innerXml}
            </Polygon>
          </Placemark>`;
      }).join("");
    }
    case "GeometryCollection": {
      const geoms = f.geometry.geometries || [];
      const fakes = geoms.map(g => ({ type:"Feature", properties:f.properties || {}, geometry:g }));
      return fakes.map(x => featurePlacemark(x, styleId, namePrefix)).join("");
    }
    default:
      return ""; // unsupported/null
  }
}

function fcToPlacemarks(fc, styleId, layerName="") {
  const feats = fc.type === "FeatureCollection" ? (fc.features || []) :
                fc.type === "Feature"          ? [fc] : [];
  return feats.map(f => featurePlacemark(f, styleId, layerName)).join("");
}

export function buildKml({ name = "UR Export", aoi = null, layers = [] }) {
  const styles = [];
  const folders = [];

  // AOI first (distinct style)
  if (aoi) {
    const aoiStyle = {
      stroke: true, color: "#10b981", opacity: 1,
      fill: true,  fillColor: "#10b981", fillOpacity: 0.25, weight: 3,
    };
    styles.push(kmlStyleFrom("aoi", aoiStyle));
    folders.push(`
      <Folder><name>AOI</name>
        ${fcToPlacemarks(
          aoi.type === "Feature" ? aoi : { type:"FeatureCollection", features:[].concat(aoi.features||[]) },
          "sty_aoi",
          "AOI"
        )}
      </Folder>
    `);
  }

  // Visible layers
  layers.forEach((ly, idx) => {
    const id = `ly${idx}`;
    styles.push(kmlStyleFrom(id, ly.style || {}));
    folders.push(`
      <Folder><name>${ly.name || `Layer ${idx+1}`}</name>
        ${fcToPlacemarks(
          ly.geojson?.type === "Feature" ? ly.geojson : { type:"FeatureCollection", features:[].concat(ly.geojson?.features||[]) },
          `sty_${id}`,
          ly.name || `Layer ${idx+1}`
        )}
      </Folder>
    `);
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${name}</name>
    ${styles.join("\n")}
    ${folders.join("\n")}
    ${legendOverlayKml(legendHref)}
  </Document>
</kml>`;
}
