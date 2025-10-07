# Phased Plan
## Phase 1 – MVP (4–6 weeks)
Goal: Local desktop app that can load layers, draw areas, run conflicts, export.

Set up Electron + MapLibre/OpenLayers.

Implement Layer Control (load from GeoPackage).

Implement Map View (pan/zoom, basemaps).

Add Draw Polygon tool + send to local backend.

Backend (FastAPI) reads GeoPackage, runs conflict query with GeoPandas/Shapely.

Export basic PNG + CSV.

Package with PyInstaller/Electron Builder for .exe.

## Phase 2 – Performance & Usability (3–4 weeks)
Goal: Make it smooth for real-world data.

Spatial indexes on GeoPackage.

Fetch by viewport extent.

Layer opacity + ordering.

Identify tool (click feature → show attributes).

Persist UI state (active layers, last extent).

## Phase 3 – Multi-User Transition Prep (2–3 weeks)
Goal: Keep same UI but point to central DB.

Migrate schema to PostGIS.

Add API auth tokens (JWT).

Test backend with remote DB endpoint.

Ensure all file reads/writes in backend only.

## Phase 4 – Web Version Release (3–5 weeks)
Goal: Allow access in browser while keeping desktop build.

Host API (FastAPI) + PostGIS in cloud/on-prem server.

Serve frontend as static site (same code from Electron).

Configure CORS, HTTPS, authentication.

Keep Electron build for offline users (points to local backend).

---

## Structure Symbol Implementation Guide

This application implements a specialized symbology system for structure features (manholes, handholds, vaults) that displays letter markers instead of standard point symbols. This section documents how to replicate this approach in other GIS applications.

### Overview

Structures are displayed with letter symbols based on their `subtypecod` field:
- **?** = Unknown (subtypecod = 0 or null)
- **M** = Manhole (subtypecod = 1)
- **H** = Handhold (subtypecod = 2)
- **V** = Vault (subtypecod = 3, non-Everstream)
- **H** = Handhold (subtypecod = 3, Everstream-owned)

### Implementation Components

#### 1. Database Layer (PostgreSQL/PostGIS)

Add symbol calculation directly in SQL queries for optimal performance:

```sql
SELECT
  ST_AsGeoJSON(geom)::jsonb as geometry,
  structure_name,
  owner,
  subtypecod,
  -- Calculate symbol based on subtypecod and owner
  CASE
    WHEN COALESCE(subtypecod, 0) = 0 THEN '?'
    WHEN subtypecod = 1 THEN 'M'
    WHEN subtypecod = 2 THEN 'H'
    WHEN subtypecod = 3 THEN
      CASE
        WHEN LOWER(COALESCE(owner, '')) LIKE '%everstream%' THEN 'H'
        ELSE 'V'
      END
    ELSE '?'
  END as symbol
FROM raw_data.structure_everstream
WHERE geom IS NOT NULL;
```

**Key Points:**
- Symbol is computed server-side to reduce client processing
- Uses `COALESCE` to handle null values
- Case-insensitive owner matching with `LOWER()` and `LIKE`

#### 2. Frontend Rendering (Leaflet.js)

Create a custom canvas-based marker class for high performance with many points:

```javascript
// Custom SymbolMarker that extends CircleMarker for canvas rendering
L.SymbolMarker = L.CircleMarker.extend({
  _updatePath: function() {
    if (!this.options.symbol) {
      return L.CircleMarker.prototype._updatePath.call(this);
    }

    const renderer = this._renderer;
    const ctx = renderer._ctx;
    const p = this._point;
    const r = Math.max(Math.round(this._radius), 1);

    if (ctx) {
      ctx.save();
      // Draw white circle background
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2, false);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      // Draw colored border
      ctx.strokeStyle = this.options.color || '#3388ff';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Draw symbol text
      ctx.fillStyle = this.options.color || '#3388ff';
      ctx.font = `bold ${Math.round(r * 1.4)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.options.symbol, p.x, p.y);
      ctx.restore();
    }
  }
});

// Usage in pointToLayer
pointToLayer: (feature, latlng) => {
  const symbol = feature?.properties?.symbol;
  if (symbol) {
    return new L.SymbolMarker(latlng, {
      renderer: canvasRenderer,
      radius: 8,
      color: '#9333ea',
      symbol: symbol,
    });
  }
  return L.circleMarker(latlng, { /* default options */ });
}
```

**Performance Notes:**
- Canvas rendering is **100x faster** than DOM-based markers for 1000+ points
- Avoid `L.divIcon` or `L.marker` with HTML for high-density datasets
- Use shared canvas renderer across all markers

#### 3. Legend Implementation

Display symbols in the legend with their meanings:

```javascript
function renderStructureLegend(color) {
  const symbolLabels = {
    '?': 'Unknown',
    'M': 'Manhole',
    'H': 'Handhold',
    'V': 'Vault'
  };

  return Object.entries(symbolLabels).map(([symbol, label]) => `
    <div class="legend-item">
      <span class="symbol-badge" style="
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        font-weight: bold;
        font-size: 12px;
        color: ${color};
        background: white;
        border: 2px solid ${color};
        border-radius: 50%;
      ">${symbol}</span>
      <span class="label">${label}</span>
    </div>
  `).join('');
}
```

#### 4. Export (KMZ/KML)

Include symbols in exported files for Google Earth compatibility:

```javascript
// Preserve symbol property during export
if (orig.symbol) kept.symbol = orig.symbol;

// Generate legend entries with symbols
const symbols = new Set();
features.forEach(f => {
  if (f?.properties?.symbol) symbols.add(f.properties.symbol);
});

if (symbols.size > 0) {
  const symbolLabels = { '?': 'Unknown', 'M': 'Manhole', 'H': 'Handhold', 'V': 'Vault' };
  legendEntries = Array.from(symbols).sort().map(sym => ({
    label: symbolLabels[sym] || sym,
    symbol: sym,
    color: layerColor
  }));
}

// Draw symbols in legend PNG using canvas
function drawSymbol(ctx, x, y, symbol, color) {
  const size = 20;
  // Draw white background
  ctx.beginPath();
  ctx.arc(x, y, size/2, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  // Draw colored border
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  // Draw letter
  ctx.fillStyle = color;
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(symbol, x, y);
}
```

### Adapting for Other Applications

#### QGIS
1. Use **Rule-based symbology** or **Categorized** renderer on `subtypecod`
2. Set symbol type to **Font Marker**
3. Configure expression:
   ```python
   CASE
     WHEN "subtypecod" = 1 THEN 'M'
     WHEN "subtypecod" = 2 THEN 'H'
     WHEN "subtypecod" = 3 AND "owner" ILIKE '%everstream%' THEN 'H'
     WHEN "subtypecod" = 3 THEN 'V'
     ELSE '?'
   END
   ```

#### ArcGIS Pro
1. Use **Unique Values** renderer on calculated field
2. Create label class with arcade expression:
   ```javascript
   var code = $feature.subtypecod;
   var owner = Lower($feature.owner);

   if (code == 1) return "M";
   if (code == 2) return "H";
   if (code == 3) {
     if (Find("everstream", owner) > -1) return "H";
     return "V";
   }
   return "?";
   ```

#### Python (GeoPandas/Matplotlib)
```python
import pandas as pd

def calculate_symbol(row):
    code = pd.to_numeric(row.get('subtypecod', 0), errors='coerce')
    owner = str(row.get('owner', '')).lower()

    if pd.isna(code) or code == 0:
        return '?'
    elif code == 1:
        return 'M'
    elif code == 2:
        return 'H'
    elif code == 3:
        return 'H' if 'everstream' in owner else 'V'
    return '?'

gdf['symbol'] = gdf.apply(calculate_symbol, axis=1)

# Plot with text markers
for idx, row in gdf.iterrows():
    ax.plot(row.geometry.x, row.geometry.y, 'o',
            color='white', markeredgecolor='purple', markersize=10)
    ax.text(row.geometry.x, row.geometry.y, row['symbol'],
            ha='center', va='center', fontweight='bold', color='purple')
```

### Best Practices

1. **Performance**: Always compute symbols server-side when possible
2. **Consistency**: Use the same color scheme across all visualization types
3. **Accessibility**: Ensure sufficient contrast between symbol text and background
4. **Documentation**: Include symbol legend in all exports and sharing formats
5. **Validation**: Test with null/missing values in both `subtypecod` and `owner` fields

### File Locations in This Project

- **Database queries**: `backend/database.js` (lines 145-152, 360-367)
- **Canvas rendering**: `frontend/js/layers.js` (lines 10-40)
- **Legend display**: `frontend/js/legend.js` (lines 27-43, 222-236)
- **KMZ export**: `backend/export/clipToKmz.js` (lines 176-217, 421-434)
