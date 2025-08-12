const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { shapefileToGeoJSON } = require("../backend/readShapefile");

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1200, height: 800,
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, "preload.js") },
    title: "Shapefile Viewer"
  });
  win.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

ipcMain.handle("select-shapefiles", async () => {
  try {
    const res = await dialog.showOpenDialog(win, {
      title: "Select Shapefile(s)",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Shapefiles", extensions: ["shp"] }]
    });
    if (res.canceled) return [];
    console.log("[select-shapefiles] selected:", res.filePaths);
    return res.filePaths || [];
  } catch (e) {
    console.error("[select-shapefiles] error:", e);
    throw e;
  }
});

ipcMain.handle("ingest-shapefile", async (_evt, { path: shpPath, srcEpsg }) => {
  console.log("[ingest-shapefile] path:", shpPath, "srcEpsg:", srcEpsg);
  try {
    const r = await shapefileToGeoJSON(shpPath, srcEpsg);
    if (r.needsSrcEpsg) return { ok: false, needsSrcEpsg: true, error: r.message };
    return { ok: true, name: require("path").basename(shpPath, require("path").extname(shpPath)), ...r };
  } catch (e) {
    console.error("[ingest-shapefile] error:", e);
    return { ok: false, error: String(e) };
  }
});
