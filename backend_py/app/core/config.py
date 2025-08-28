import os
from pathlib import Path

APP_NAME = "UR App Backend"
APP_PORT = int(os.getenv("UR_PORT", "5178"))
APP_HOST = os.getenv("UR_HOST", "127.0.0.1")

DATA_DIR = Path(os.getenv("UR_DATA_DIR", Path.home() / ".ur_app"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "project.sqlite"
EXPORT_DIR = DATA_DIR / "exports"
EXPORT_DIR.mkdir(parents=True, exist_ok=True)
