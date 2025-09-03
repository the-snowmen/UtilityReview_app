// frontend/js/test_export.js
// Minimal test harness for the KMZ export IPC

(function () {
  // Helpers
  const $ = (sel, el = document) => el.querySelector(sel);

  // Create a lightweight toast
  function toast(msg, ms = 2400) {
    let t = $("#ur-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "ur-toast";
      Object.assign(t.style, {
        position: "fixed",
        left: "16px",
        bottom: "16px",
        maxWidth: "60vw",
        zIndex: 99999,
        padding: "10px 14px",
        borderRadius: "10px",
        background: "rgba(31,41,55,0.80)",
        color: "#e5e7eb",
        font: "500 13px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
        boxShadow: "0 14px 34px rgba(0,0,0,0.35)",
        backdropFilter: "blur(6px)",
        border: "1px solid rgba(255,255,255,0.10)",
        pointerEvents: "none",
        opacity: "0",
        transition: "opacity .14s ease",
      });
      document.body.appendChild(t);
      // allow CSS override if needed
    }
    t.textContent = msg;
    requestAnimationFrame(() => { t.style.opacity = "1"; });
    setTimeout(() => { t.style.opacity = "0"; }, ms);
  }

  // Ensure the preload bridge exists
  function ensureBridge() {
    if (!window.backend || typeof window.backend.exportKmz !== "function") {
      alert("backend.exportKmz is not available. Ensure preload.js is loaded and main.js registered the IPC handler.");
      return false;
    }
    return true;
  }

  // Click handler
  async function onExportClick() {
    if (!ensureBridge()) return;
    const defaultName = "aoi_export";
    // Allow quick rename via prompt (for testing). You can remove this if not desired.
    const name = prompt("KMZ name?", defaultName) || defaultName;

    // Call IPC
    try {
      const res = await window.backend.exportKmz({ name });
      if (!res || !res.ok) {
        const msg = res?.error || "Unknown error";
        toast(`Export failed: ${msg}`);
        console.error("KMZ export failed:", res);
        return;
      }
      toast(`Saved: ${res.path}`);
      console.log("KMZ saved to:", res.path);
    } catch (err) {
      console.error(err);
      toast(`Export failed: ${String(err?.message || err)}`);
    }
  }

  // Wire up button if present; otherwise inject a small test button
  function ensureButton() {
    let btn = $("#btnExportTest");
    if (btn) {
      btn.addEventListener("click", onExportClick);
      return;
    }
    // Inject a non-intrusive floating button for quick testing
    btn = document.createElement("button");
    btn.id = "btnExportTest";
    btn.textContent = "Test KMZ Export";
    Object.assign(btn.style, {
      position: "fixed",
      left: "16px",
      bottom: "64px",
      zIndex: 99998,
      padding: "8px 12px",
      borderRadius: "10px",
      background: "rgba(31,41,55,0.80)",
      color: "#e5e7eb",
      border: "1px solid rgba(255,255,255,0.10)",
      boxShadow: "0 10px 24px rgba(0,0,0,0.30)",
      cursor: "pointer",
      font: "600 12px/1 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif",
      backdropFilter: "blur(6px)",
    });
    btn.addEventListener("mouseenter", () => btn.style.background = "rgba(31,41,55,0.90)");
    btn.addEventListener("mouseleave", () => btn.style.background = "rgba(31,41,55,0.80)");
    btn.addEventListener("click", onExportClick);
    document.body.appendChild(btn);
  }

  // Init
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureButton);
  } else {
    ensureButton();
  }
})();
