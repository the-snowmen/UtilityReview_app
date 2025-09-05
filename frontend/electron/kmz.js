// Minimal KMZ builder: zips a KML and optional assets into a .kmz buffer.
const { ZipFile } = require("yazl");
const { Readable } = require("stream");

function bufferToStream(buf) {
  const r = new Readable({ read() {} });
  r.push(buf);
  r.push(null);
  return r;
}

/**
 * buildKmzBuffer({ kml, assets })
 *  - kml: string (required)
 *  - assets: array of { name: string, data: Buffer } (optional), e.g. legend.png
 */
async function buildKmzBuffer({ kml, assets = [] }) {
  return new Promise((resolve, reject) => {
    const zip = new ZipFile();
    const chunks = [];

    zip.addBuffer(Buffer.from(kml, "utf8"), "doc.kml");

    for (const a of assets) {
      if (!a?.name || !a?.data) continue;
      zip.addReadStream(bufferToStream(a.data), a.name);
    }

    zip.end();
    zip.outputStream.on("data", (c) => chunks.push(c));
    zip.outputStream.on("error", reject);
    zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

module.exports = { buildKmzBuffer };
