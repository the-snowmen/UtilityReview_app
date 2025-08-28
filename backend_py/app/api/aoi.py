from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/aoi", tags=["aoi"])

class AoiFromGeoJSON(BaseModel):
    geojson: dict

@router.post("/set")
def set_aoi(body: AoiFromGeoJSON):
    # stateless for now; frontend stores AOI, backend just validates
    gj = body.geojson
    if not gj or gj.get("type") != "Feature" or gj.get("geometry", {}).get("type") not in ("Polygon","MultiPolygon"):
        raise HTTPException(status_code=400, detail="AOI must be a Polygon/MultiPolygon Feature.")
    return {"ok": True, "aoi": gj}

class AoiFromKmzBody(BaseModel):
    path: str

@router.post("/from-kmz")
def aoi_from_kmz(body: AoiFromKmzBody):
    # Minimal placeholder: KMZ→KML parsing is omitted for brevity.
    # You can expand by unzipping .kmz, locating .kml, parsing polygons (fastkml), and returning GeoJSON.
    raise HTTPException(status_code=501, detail="KMZ import not implemented yet (Python).")
