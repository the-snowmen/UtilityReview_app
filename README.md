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
