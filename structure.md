```
ur-app/
├─ backend_py/                  # NEW: Python backend (FastAPI)
│  ├─ app/
│  │  ├─ api/                  # Route groups (feature-aligned)
│  │  │  ├─ ingest.py
│  │  │  ├─ aoi.py
│  │  │  ├─ export.py
│  │  │  ├─ comments.py
│  │  │  └─ workspace.py
│  │  ├─ models/               # DB + schemas
│  │  │  ├─ db.py
│  │  │  └─ schemas.py
│  │  ├─ services/             # Domain logic & helpers
│  │  │  ├─ geo.py
│  │  │  └─ kmz.py
│  │  ├─ core/                 # Config, logging, constants
│  │  │  └─ config.py
│  │  └─ main.py               # FastAPI app entry
│  └─ pyproject.toml
│
├─ frontend/                   # Electron + UI
│  ├─ electron/
│  │  ├─ main.js               # Spawns Python, window, IPC where needed
│  │  └─ preload.js            # Exposes safe APIs to renderer
│  ├─ js/
│  │  ├─ api.js                # Tiny HTTP client to Python (fetch wrapper)
│  │  ├─ core/                 # shared utils/state
│  │  │  ├─ store.js
│  │  │  └─ events.js
│  │  ├─ map/                  # Leaflet setup + helpers
│  │  │  └─ map.js
│  │  ├─ layers/               # Layer mgmt, styling, legend adapters
│  │  │  ├─ layers.js
│  │  │  └─ legend.js
│  │  └─ features/
│  │     └─ AOI/               # AOI feature as a module (clear ownership)
│  │        ├─ index.js        # entry & wiring for AOI mode
│  │        ├─ draw.js         # draw/edit AOI on map
│  │        ├─ import_kmx.js   # import AOI from KML/KMZ paths
│  │        ├─ export.js       # KMZ export orchestration
│  │        └─ comments/       # AOI-scoped comments
│  │           ├─ index.js
│  │           └─ ui.js
│  ├─ index.html
│  └─ style.css
│
├─ package.json                # add dev scripts to run both Electron & FastAPI
└─ README.md

```