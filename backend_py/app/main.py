import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .core.config import APP_HOST, APP_PORT
from .models.db import init_db
from .api import ingest, aoi, export, comments, workspace

app = FastAPI(title="UR App Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # Electron's file:// origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingest.router)
app.include_router(aoi.router)
app.include_router(export.router)
app.include_router(comments.router)
app.include_router(workspace.router)

@app.get("/health")
def health():
    return {"ok": True}

def _boot():
    init_db()

_boot()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=APP_HOST, port=APP_PORT, log_level="info")
