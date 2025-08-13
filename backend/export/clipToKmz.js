// backend/export/clipToKmz.js

const os = require("os");
const path = require("path");
const fsp = require("fs/promises");
const mapshaper = require("mapshaper");
const AdmZip = require("adm-zip");

async function exportClippedKmz(aoiGeoJSON, featuresGeoJSON, outKmzPath) {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "urapp-"));
  const aoiPath = path.join(tmp, "aoi.geojson");
  const featPath = path.join(tmp, "features.geojson");
  await fsp.writeFile(aoiPath, JSON.stringify(aoiGeoJSON));
  await fsp.writeFile(featPath, JSON.stringify(featuresGeoJSON));

  // Clip features by AOI and write a KML
  const outKml = path.join(tmp, "export.kml");
  const cmd = `-i "${featPath}" -clip "${aoiPath}" -o format=kml encoding=utf8 "${outKml}"`;
  await mapshaper.runCommands(cmd);

  // Zip KML into KMZ
  const zip = new AdmZip();
  zip.addLocalFile(outKml);
  await new Promise((resolve, reject) => {
    zip.writeZip(outKmzPath, (err) => (err ? reject(err) : resolve()));
  });

  return outKmzPath;
}

module.exports = { exportClippedKmz };