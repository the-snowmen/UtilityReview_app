```
ur-app/
├─ backend_py/                  # Python FastAPI backend
│  ├─ app/
│  │  ├─ api/                   # Route groups (feature-aligned)
│  │  │  ├─ ingest.py
│  │  │  ├─ aoi.py
│  │  │  ├─ export.py           # KMZ export endpoint
│  │  │  ├─ comments.py
│  │  │  └─ workspace.py
│  │  ├─ models/                # DB + schemas
│  │  │  ├─ db.py
│  │  │  └─ schemas.py
│  │  ├─ services/              # Domain logic & helpers
│  │  │  ├─ geo.py
│  │  │  └─ kmz.py
│  │  ├─ core/                  # Config, logging, constants
│  │  │  └─ config.py
│  │  └─ main.py                # FastAPI app entrypoint
│  ├─ pyproject.toml            # Backend dependencies
│  ├─ Dockerfile                # API image (prod & dev)
│  ├─ .dockerignore
│
├─ docker-compose.yml           # Base compose (api, db, etc.)
├─ docker-compose.override.yml  # Dev override (reload, volumes)
│
├─ frontend/                    # Electron + UI (renderer)
│  ├─ electron/
│  │  ├─ main.js                # Electron main process (IPC + window)
│  │  └─ preload.js             # Secure bridge to renderer
│  ├─ js/
│  │  ├─ main.js                # Renderer entry: boot + wire UI
│  │  ├─ map.js                 # Leaflet init + AOI logic
│  │  ├─ test_export.js         # Test KMZ export button / toast
│  │  └─ features/
│  │     └─ search.js           # Coordinate search feature (stub/real)
│  ├─ index.html                # UI shell, loads Leaflet + renderer
│  ├─ style.css                 # App-wide CSS
│
├─ package.json                 # npm scripts for dev, backend, electron
├─ package-lock.json
├─ README.md
└─ structure.md                 # This file


```