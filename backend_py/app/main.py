# backend_py/app/main.py
from fastapi import FastAPI
from fastapi.responses import ORJSONResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# --- Optional settings (works even if core/config.py doesn't exist)
try:
    from app.core.config import Settings  # type: ignore
    settings = Settings()
except Exception:
    class _Fallback(BaseModel):
        HOST: str = "0.0.0.0"
        PORT: int = 5178
        APP_NAME: str = "UR Geo API"
        VERSION: str = "0.1.1"
    settings = _Fallback()  # type: ignore

APP_NAME = getattr(settings, "APP_NAME", "UR Geo API")
APP_VERSION = getattr(settings, "VERSION", "0.1.0")

# --- App
app = FastAPI(
    title=APP_NAME,
    version=APP_VERSION,
    default_response_class=ORJSONResponse,
)

# --- CORS (Electron loads files from file:// and http://localhost)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*", "http://localhost", "http://127.0.0.1"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Schemas
class Health(BaseModel):
    ok: bool
    service: str
    version: str

class VersionInfo(BaseModel):
    service: str
    version: str

# --- Routes
@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/docs")

@app.get("/health", response_model=Health, summary="Liveness/health check")
def health():
    return Health(ok=True, service=APP_NAME, version=APP_VERSION)

@app.get("/version", response_model=VersionInfo, summary="Service version")
def version():
    return VersionInfo(service=APP_NAME, version=APP_VERSION)

# --- Optional: auto-include feature routers if present
def _try_include_routers() -> None:
    import importlib

    routers = [
        ("app.api.ingest",   "router", "/ingest"),
        ("app.api.aoi",      "router", "/aoi"),
        ("app.api.export",   "router", "/export"),
        ("app.api.comments", "router", "/comments"),
        ("app.api.workspace","router", "/workspace"),
    ]

    for module_path, attr, prefix in routers:
        try:
            mod = importlib.import_module(module_path)
            router = getattr(mod, attr, None)
            if router is not None:
                app.include_router(router, prefix=prefix)
        except Exception:
            # Silently skip if module not present yet
            pass

_try_include_routers()
