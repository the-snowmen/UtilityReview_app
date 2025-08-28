```
project-root/
├── backend/ # Backend logic (Node.js side)
│ ├── export/ # Export-related modules
│ │ └── clipToKmz.js # Handles clipping layers/geometry and exporting to KMZ
│ │
│ ├── ingest/ # File ingestion (import) modules
│ │ ├── index.js # Main entry point for file ingestion
│ │ ├── kmlkmz.js # KML/KMZ reader
│ │ ├── shapefile.js # Shapefile (.shp/.dbf) reader
│ │ └── reproject.js # CRS reprojection helpers
│ │
│ └── util.js # General-purpose utilities
│
├── frontend/ # Frontend (Electron renderer / UI)
│ ├── js/ # All JS modules for the frontend
│ │ ├── features/ # Feature-specific modules
│ │ │ ├── comments.js # Comment feature (add/edit/delete pins)
│ │ │ ├── contextmenu.js # Right-click context menu logic
| | | ├── aoi.js
| | | ├── kmx-layer.js
│ │ │ └── search.js # Coordinate search bar integration
│ │ │
│ │ ├── layers.js # Layer management (add/remove/set style/visibility)
│ │ ├── legend.js # Legend control and rendering
│ │ ├── main.js # App entry for the frontend
│ │ ├── map.js # Map initialization and Leaflet integration
│ │ ├── store.js # In-memory state store
│ │ └── ui.js # UI controls and layer list management
│ │
│ ├── electron.js # Main Electron process (window creation, IPC handlers)
│ ├── preload.js # Preload script (exposes safe IPC API to renderer)
│ ├── index.html # Frontend HTML entrypoint
│ └── style.css # Global styles for the app
│
├── node_modules/ # Installed npm dependencies
│
├── .gitignore # Git ignore rules
├── package.json # Project metadata and dependencies
├── package-lock.json # Dependency lock file
├── README.md # Project overview and instructions
└── structure.md # This file (project structure documentation)
```