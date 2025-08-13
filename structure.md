# -----------------------------
# Project Structure (proposed)
# -----------------------------
project-root/
├── backend/
│   ├── ingest/
│   │   ├── index.js              # dispatches to the right reader based on file type
│   │   ├── shapefile.js          # .shp reader using `shapefile` + reprojection
│   │   └── kmlKmz.js             # .kml/.kmz/.zip via mapshaper -> GeoJSON
│   ├── reproject.js              # all reprojection utilities live here
│   └── util.js                   # (optional) shared fs helpers (not critical now)
│
├── frontend/
│   ├── electron.js               # Electron main (updated)
│   ├── preload.js                # IPC surface (updated)
│   ├── index.html                # Loads modules with <script type="module">
│   ├── style.css                 # Minor tweaks for controls
│   └── js/
│       ├── main.js               # App bootstrap (imports others)
│       ├── map.js                # Leaflet map + basemaps + controls
│       ├── store.js              # Central state for layers
│       ├── layers.js             # Add/remove/layer styling + z-order logic
│       └── ui.js                 # Panel UI (list, drag handle, opacity, zoom)
│
├── package.json                  # unchanged deps; just new IPC channel name
└── README.md