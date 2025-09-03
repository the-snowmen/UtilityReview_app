from fastapi import APIRouter
from fastapi.responses import FileResponse
from pydantic import BaseModel
import tempfile, zipfile, os

router = APIRouter(tags=["export"])

class ExportRequest(BaseModel):
    name: str = "export"

@router.post("/kmz")
def export_kmz(req: ExportRequest):
    kml = f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>{req.name}</name>
  <Placemark><name>Hello</name><Point><coordinates>-87.9065,43.0389,0</coordinates></Point></Placemark>
</Document>
</kml>"""
    tmpdir = tempfile.mkdtemp(prefix="ur_export_")
    kml_path = os.path.join(tmpdir, "doc.kml")
    with open(kml_path, "w", encoding="utf-8") as f: f.write(kml)
    kmz_path = os.path.join(tmpdir, f"{req.name or 'export'}.kmz")
    with zipfile.ZipFile(kmz_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(kml_path, arcname="doc.kml")
    return FileResponse(kmz_path, media_type="application/vnd.google-earth.kmz",
                        filename=os.path.basename(kmz_path))
