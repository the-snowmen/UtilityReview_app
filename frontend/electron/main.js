// frontend/electron/main.js
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const fetch = (...a) => import("node-fetch").then(({ default: f }) => f(...a));

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
    const { name = "export" } = payload || {};
    const win = BrowserWindow.getFocusedWindow();

    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: "Save KMZ",
      defaultPath: `${name}.kmz`,
      filters: [{ name: "KMZ", extensions: ["kmz"] }],
    });
    if (canceled || !filePath) return { ok: false, error: "User canceled" };

    try {
      const res = await fetch(`${API_BASE}/export/kmz`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) return { ok: false, error: `Backend ${res.status} ${res.statusText}` };

      const buf = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(filePath, buf);
      return { ok: true, path: filePath };
    } catch (err) {
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
