// Build a legend PNG (as base64) from exported layers.
// Each row: color swatch + layer name. AOI shown first (optional).
export async function buildLegendPngBase64({ title = "Legend", aoi = true, layers = [] }) {
  // derive rows
  const rows = [];
  if (aoi) rows.push({ name: "AOI", color: "#10b981" });
  for (const ly of layers) {
    const col = ly?.style?.fillColor || ly?.style?.color || "#22c55e";
    rows.push({ name: ly?.name || "Layer", color: col });
  }

  const padX = 14, padY = 12, rowH = 26, swatch = 16, gap = 10, titleH = 20, border = 10;
  const w = 300;
  const h = padY + titleH + 10 + rows.length * rowH + padY;

  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");

  // panel
  ctx.fillStyle = "rgba(31,41,55,0.86)";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

  // title
  ctx.fillStyle = "#e5e7eb";
  ctx.font = "bold 14px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(title, padX, padY);

  // rows
  let y = padY + titleH + 10;
  ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  for (const r of rows) {
    // swatch
    ctx.fillStyle = r.color || "#22c55e";
    ctx.fillRect(padX, y + (rowH - swatch) / 2, swatch, swatch);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.strokeRect(padX + 0.5, y + (rowH - swatch) / 2 + 0.5, swatch - 1, swatch - 1);
    // label
    ctx.fillStyle = "#d1d5db";
    ctx.fillText(r.name, padX + swatch + gap, y + (rowH - 14) / 2);
    y += rowH;
  }

  return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
}
