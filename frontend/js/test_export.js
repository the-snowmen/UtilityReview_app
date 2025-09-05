// frontend/js/test_export.js
import { collectForExport } from "./export/collect.js";
import { buildKml } from "./export/kml.js";
import { buildLegendPngBase64 } from "./export/legend.js";

(function () {
  // ...toast + defaultName unchanged...

  async function onExportClick() {
    if (!window.backend?.exportKmz) { toast("Backend bridge missing: exportKmz"); return; }

    // 1) Gather AOI + visible layers
    const { aoi, layers } = collectForExport();

    // 2) Build legend PNG (base64)
    const legendPngBase64 = await buildLegendPngBase64({ title: "Map Legend", aoi: !!aoi, layers });

    // 3) Build KML with a ScreenOverlay that points to "legend.png" (we'll attach it in KMZ)
    const name = defaultName();
    const kml  = buildKml({ name, aoi, layers, legendHref: "legend.png" });

    // 4) Send to IPC; Electron main will embed legend.png into the KMZ
    try {
      const res = await window.backend.exportKmz({ name, kml, legendPngBase64 });
      if (!res?.ok) {
        if (res?.error === "User canceled") toast("Save canceled");
        else toast(`Export failed: ${res?.error || "unknown"}`);
      } else {
        const via = res.via === "backend" ? "backend" : (res.via || "local");
        toast(`Saved (${via}): ${res.path}`, 3200);
      }
    } catch (err) {
      console.error(err);
      toast(`Export crashed: ${String(err?.message || err)}`, 3500);
    }
  }

  function ensureButton() {
    if (document.getElementById("btnTestExport")) return;
    const btn = document.createElement("button");
    btn.id = "btnTestExport";
    btn.textContent = "Test KMZ Export";
    Object.assign(btn.style, {
      position: "fixed", right: "16px", bottom: "16px",
      padding: "10px 12px", background: "rgba(31,41,55,0.80)", color: "#e5e7eb",
      border: "1px solid rgba(255,255,255,0.10)", borderRadius: "10px",
      font: "600 12px/1 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif",
      cursor: "pointer", zIndex: 2000,
    });
    btn.addEventListener("mouseenter", () => (btn.style.background = "rgba(31,41,55,0.90)"));
    btn.addEventListener("mouseleave", () => (btn.style.background = "rgba(31,41,55,0.80)"));
    btn.addEventListener("click", onExportClick);
    document.body.appendChild(btn);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensureButton);
  else ensureButton();
})();
