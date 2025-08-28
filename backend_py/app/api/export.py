from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pathlib import Path
from ..core.config import EXPORT_DIR
from ..services.kmz import write_kmz

router = APIRouter(prefix="/export", tags=["export"])

class ExportBody(BaseModel):
    aoi: dict | None = None               # Feature (Polygon/MultiPolygon)
    data: list[dict]                      # [{ name, geojson(FC), style }]
    suggestedName: str = "aoi_export.kmz"
    opts: dict | None = None

@router.post("/kmz")
def export_kmz(body: ExportBody):
    try:
        out = EXPORT_DIR / body.suggestedName
        # flatten features FCs -> simple list of geometries with style
        feats = []
        for l in body.data:
            name = l.get("name","Layer")
            style = l.get("style", {})
            fc = l.get("geojson", {})
            for f in fc.get("features", []):
                feats.append({
                    "name": name,
                    "geometry": f["geometry"],
                    "style": style
                })
        aoi_geom = body.aoi.get("geometry") if body.aoi else None
        write_kmz(feats, aoi_geom, legend=None, out_path=out)
        return {"ok": True, "file": str(out)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
