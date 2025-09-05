// frontend/electron/main.js
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const { buildKmzBuffer } = require("./kmz"); // <-- add this near top
const fetchHttp = (...args) => globalThis.fetch(...args);

const API_BASE = process.env.UR_API_BASE || "http://localhost:5178";

/** Ensure single app instance (prevents double-main) */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
}

/** Register IPC handlers ONCE, even if dev reload re-evaluates this file */
function registerIpcOnce() {
  if (global.__UR_IPC_REGISTERED__) return;

  // Always remove existing handlers to avoid "second handler" error
  ipcMain.removeHandler("api:base");
  ipcMain.handle("api:base", () => API_BASE);

  ipcMain.removeHandler("export:kmz");
  ipcMain.handle("export:kmz", async (_e, payload) => {
    console.log("[IPC] export:kmz called with", payload);
    const { name = "export", kml = null, legendPngBase64 = null } = payload || {};
    const win = BrowserWindow.getFocusedWindow();

    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: "Save KMZ",
      defaultPath: `${name}.kmz`,
      filters: [{ name: "Google Earth (KMZ)", extensions: ["kmz"] }],
    });
    if (canceled || !filePath) return { ok: false, error: "User canceled" };

    // Helper: default minimal KML if none was sent
    const fallbackKml = `<?xml version="1.0" encoding="UTF-8"?>
  <kml xmlns="http://www.opengis.net/kml/2.2">
    <Document>
      <name>${name}</name>
      <Placemark><name>UR App test</name>
        <Point><coordinates>-87.9065,43.0389,0</coordinates></Point>
      </Placemark>
    </Document>
  </kml>`;

    // Try backend first (if running)
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetchHttp(`${API_BASE}/export/kmz`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, kml, legendPngBase64 }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        await fs.writeFile(filePath, buf);
        return { ok: true, path: filePath, via: "backend" };
      }

      console.warn(`[export:kmz] backend HTTP ${res.status} ${res.statusText}; falling back local KMZ`);
    } catch (err) {
      console.warn(`[export:kmz] backend error; falling back local KMZ:`, err?.message || err);
    }

    // Local KMZ fallback using provided KML (or minimal fallback)
    try {
      const assets = [];
      if (legendPngBase64) {
        const pngBuf = Buffer.from(legendPngBase64, "base64");
        assets.push({ name: "legend.png", data: pngBuf });
      }
      const kmzBuf = await buildKmzBuffer({ kml: kml || fallbackKml, assets });
      await fs.writeFile(filePath, kmzBuf);
      return { ok: true, path: filePath, via: "local" };
    } catch (err) {
      console.error("export:kmz local build failed:", err);
      return { ok: false, error: String(err?.message || err) };
    }
  });


  global.__UR_IPC_REGISTERED__ = true;
}

/** Create the main window */
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load your UI (adjust path if needed)
  win.loadFile(path.join(__dirname, "..", "index.html"));
}

app.whenReady().then(() => {
  registerIpcOnce();
  createWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
