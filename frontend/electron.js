// electron.js
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { shapefileToGeoJSON } = require("../backend/readShapefile.js"); // ✅ correct path

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1200, height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js")
    },
    title: "Shapefile Viewer"
  });
  win.loadFile(path.join(__dirname, "index.html"));
}
app.whenReady().then(createWindow);

// file picker
ipcMain.handle("select-shapefiles", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: "Select Shapefile(s)",
    filters: [
      { name: "Shapefile", extensions: ["shp"] },
      { name: "Zipped Shapefile", extensions: ["zip"] },
      { name: "GeoJSON", extensions: ["geojson", "json"] }
    ],
    properties: ["openFile", "multiSelections"]
  });
  return { ok: true, paths: canceled ? [] : filePaths };
});

// ingest
ipcMain.handle("ingest-shapefile", async (_evt, { path: shpPath, srcEpsg }) => {
  try {
    const r = await shapefileToGeoJSON(shpPath, srcEpsg);
    if (r.needsSrcEpsg) return { ok: false, needsSrcEpsg: true, error: r.message };
    return {
      ok: true,
      name: path.basename(shpPath, path.extname(shpPath)),
      geojson: r.geojson
    };
  } catch (e) {
    console.error("[ingest-shapefile] error:", e);
    return { ok: false, error: String(e) };
  }
});
