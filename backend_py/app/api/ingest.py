from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..services.geo import load_vector, gdf_to_geojson_dict, bbox_of_geojson

router = APIRouter(prefix="/ingest", tags=["ingest"])

class IngestBody(BaseModel):
    path: str
    srcEpsg: int | None = None
    name: str | None = None

@router.post("")
def ingest_local(body: IngestBody):
    try:
        gdf = load_vector(body.path, body.srcEpsg)
        geojson = gdf_to_geojson_dict(gdf, idx_prefix="ing")
        bbox = bbox_of_geojson(geojson)
        name = body.name or (body.path.split("/")[-1])
        layer = {
            "id": f"layer_{hash(body.path) & 0xfffffff}",
            "name": name,
            "geojson": geojson,
            "bbox": bbox,
            "style": {"color":"#22c55e","width":4,"fillColor":"#22c55e","fillOpacity":0.2},
            "visible": True
        }
        return {"ok": True, "layer": layer}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
