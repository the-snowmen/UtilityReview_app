// electron.js (main process)
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const JSZip = require("jszip");
const mapshaper = require("mapshaper");

function createWin() {
  const win = new BrowserWindow({
    width: 1400, height: 900,
    webPreferences: {
      preload: path.join(__dirname, "frontend/preload.js"),
      contextIsolation: true, nodeIntegration: false,
    }
  });
  win.loadFile(path.join(__dirname, "frontend/index.html"));
}

app.whenReady().then(() => {
  createWin();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWin(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

// ----------------- helpers -----------------
async function mapshaperToGeoJSONFromPath(pth) {
  const cmd = `-i "${pth}" -o format=geojson out.json`;
  const res = await mapshaper.runCommands(cmd);
  const out = JSON.parse(res["out.json"] || "{}");
  if (out.type === "FeatureCollection") return out;
  if (out.type === "Feature") return { type: "FeatureCollection", features: [out] };
  return { type: "FeatureCollection", features: [] };
}

async function mapshaperKmlStringToGeoJSON(kmlString) {
  const cmd = `-i in.kml -o format=geojson out.json`;
  const res = await mapshaper.runCommands(cmd, { "in.kml": kmlString });
  const out = JSON.parse(res["out.json"] || "{}");
  if (out.type === "FeatureCollection") return out;
  if (out.type === "Feature") return { type: "FeatureCollection", features: [out] };
  return { type: "FeatureCollection", features: [] };
}

async function readKmlOrKmzToGeoJSON(fp) {
  const ext = path.extname(fp).toLowerCase();
  if (ext === ".kml") {
    const kml = await fsp.readFile(fp, "utf8");
    return mapshaperKmlStringToGeoJSON(kml);
  }
  if (ext === ".kmz") {
    const buf = await fsp.readFile(fp);
    const zip = await JSZip.loadAsync(buf);
    // Prefer doc.kml, else first .kml in archive
    let kmlFile = zip.file(/(^|\/)doc\.kml$/i)[0] || zip.file(/\.kml$/i)[0];
    if (!kmlFile) throw new Error("KMZ has no .kml file.");
    const kml = await kmlFile.async("text");
    return mapshaperKmlStringToGeoJSON(kml);
  }
  throw new Error("Not a KML/KMZ file.");
}

// ----------------- IPC -----------------
ipcMain.handle("select-files", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Select data file(s)",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "GIS", extensions: ["geojson","json","shp","zip","kml","kmz","csv"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });
  if (canceled) return { ok:false, canceled:true };
  return { ok:true, paths: filePaths };
});

ipcMain.handle("ingest-file", async (_e, { path: fp }) => {
  try {
    if (!fp) throw new Error("No path");
    const ext = path.extname(fp).toLowerCase();
    let geojson;
    if (ext === ".kml" || ext === ".kmz") {
      geojson = await readKmlOrKmzToGeoJSON(fp);
    } else {
      // Let mapshaper handle GeoJSON, SHP (and zipped SHP), CSV, etc.
      geojson = await mapshaperToGeoJSONFromPath(fp);
    }
    return { ok:true, name: path.basename(fp), geojson };
  } catch (e) {
    console.error("[ingest-file]", e);
    return { ok:false, error:String(e?.message||e) };
  }
});

// AOI picker dedicated to KML/KMZ (but will accept KML too)
ipcMain.handle("aoi:pick-kmx", async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "Pick AOI KML/KMZ",
      properties: ["openFile"],
      filters: [{ name: "Google Earth", extensions: ["kml","kmz"] }]
    });
    if (canceled || !filePaths?.length) return { ok:false, canceled:true };
    const fp = filePaths[0];
    const geojson = await readKmlOrKmzToGeoJSON(fp);
    return { ok:true, geojson, name: path.basename(fp) };
  } catch (e) {
    console.error("[aoi:pick-kmx]", e);
    return { ok:false, error:String(e?.message||e) };
  }
});

// Export handler (you already have the exporter file wired)
ipcMain.handle("export-aoi-kmz", async (_evt, payload = {}) => {
  try {
    const {
      aoi, data, features,
      suggestedName = "aoi_export.kmz",
      opts = {},
    } = payload;
    if (!aoi) throw new Error("Missing AOI polygon");
    const exportData = data ?? features;
    if (!exportData) throw new Error("No features to export");

    const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow(), {
      title: "Save AOI Export (KMZ)",
      defaultPath: suggestedName.endsWith(".kmz") ? suggestedName : `${suggestedName}.kmz`,
      filters: [{ name: "KMZ", extensions: ["kmz"] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };

    const { exportClippedKmz } = require("./backend/export/clipToKmz.js");
    await exportClippedKmz(aoi, exportData, filePath, {
      includeAoi: opts.includeAoi !== false,
      keepAttributes: false,
      kmlName: "AOI Export",
    });
    return { ok:true, path:filePath };
  } catch (e) {
    console.error("[export-aoi-kmz]", e);
    return { ok:false, error:String(e?.message||e) };
  }
});
