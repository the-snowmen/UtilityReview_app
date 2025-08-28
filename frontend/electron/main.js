const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

let pyProc = null;
let mainWin = null;

function startPython() {
  const venvPython = process.env.UR_PYTHON || "python"; // or bundle your venv/python.exe
  const backendDir = path.join(__dirname, "..", "..", "backend_py");
  pyProc = spawn(venvPython, ["-m", "app.main"], {
    cwd: backendDir,
    env: { ...process.env, UR_PORT: "5178" },
    stdio: "inherit"
  });
  pyProc.on("exit", (code) => console.log("Python exited:", code));
}

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1280, height: 800, backgroundColor: "#111827",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, nodeIntegration: false
    }
  });
  mainWin.loadFile(path.join(__dirname, "..", "index.html"));
}

app.whenReady().then(() => {
  startPython();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  if (pyProc && !pyProc.killed) { try { pyProc.kill(); } catch {} }
});

ipcMain.handle("select-files", async () => {
  const res = await dialog.showOpenDialog(mainWin, {
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "GIS", extensions: ["shp", "json", "geojson", "kml", "kmz"] }]
  });
  if (res.canceled) return { ok: false, files: [] };
  return { ok: true, files: res.filePaths };
});
