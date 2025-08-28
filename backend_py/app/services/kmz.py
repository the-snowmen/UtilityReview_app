from pathlib import Path
import simplekml

def write_kmz(features, aoi_polygon, legend, out_path: Path):
    """
    features: list of dicts with {name, geometry(GeoJSON geometry), style{color,width,fillColor,fillOpacity}}
    aoi_polygon: GeoJSON Polygon geometry or None
    legend: optional list of {label, color}
    """
    kml = simplekml.Kml()
    # AOI
    if aoi_polygon and aoi_polygon["type"] in ("Polygon","MultiPolygon"):
        pol = kml.newpolygon(name="AOI")
        pol.outerboundaryis = _first_ring(aoi_polygon)
        pol.style.polystyle.color = _rgba_to_abgr_hex("#ff9aa2", 0.3)
        pol.style.linestyle.color = _rgba_to_abgr_hex("#ff5a5f", 1.0)
        pol.style.linestyle.width = 2

    # features
    for f in features:
        geom = f["geometry"]
        name = f.get("name","Layer")
        style = f.get("style", {})
        color = style.get("color", "#22c55e")
        width = int(style.get("width", 4))
        fill = style.get("fillColor", color)
        fill_op = float(style.get("fillOpacity", 0.2))

        t = geom["type"]
        if t in ("LineString", "MultiLineString"):
            ls = kml.newlinestring(name=name)
            ls.coords = _coords_line_like(geom)
            ls.style.linestyle.color = _rgba_to_abgr_hex(color, 1.0)
            ls.style.linestyle.width = width
        elif t in ("Polygon","MultiPolygon"):
            pol = kml.newpolygon(name=name)
            pol.outerboundaryis = _first_ring(geom)
            pol.style.polystyle.color = _rgba_to_abgr_hex(fill, fill_op)
            pol.style.linestyle.color = _rgba_to_abgr_hex(color, 1.0)
            pol.style.linestyle.width = width
        elif t in ("Point","MultiPoint"):
            for xy in _coords_points(geom):
                p = kml.newpoint(name=name, coords=[xy])
                p.style.iconstyle.color = _rgba_to_abgr_hex(color, 1.0)
        # ignore other types for brevity

    kml.savekmz(str(out_path))
    return str(out_path)

def _first_ring(geom):
    if geom["type"] == "Polygon":
        return geom["coordinates"][0]
    if geom["type"] == "MultiPolygon":
        return geom["coordinates"][0][0]
    return []

def _coords_line_like(geom):
    if geom["type"] == "LineString":
        return geom["coordinates"]
    if geom["type"] == "MultiLineString":
        return geom["coordinates"][0]
    return []

def _coords_points(geom):
    if geom["type"] == "Point":
        return [geom["coordinates"]]
    if geom["type"] == "MultiPoint":
        return geom["coordinates"]
    return []

def _rgba_to_abgr_hex(hex_color: str, alpha: float) -> str:
    # KML uses aabbggrr
    hex_color = hex_color.lstrip("#")
    if len(hex_color) == 3:
        hex_color = "".join(c*2 for c in hex_color)
    r = int(hex_color[0:2],16); g = int(hex_color[2:4],16); b = int(hex_color[4:6],16)
    a = max(0, min(255, int(alpha*255)))
    return f"{a:02x}{b:02x}{g:02x}{r:02x}"
