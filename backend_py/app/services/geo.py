from typing import Optional
from pathlib import Path
import geopandas as gpd
from shapely.geometry import mapping
from shapely.ops import unary_union

def load_vector(path: str, src_epsg: Optional[int] = None) -> gpd.GeoDataFrame:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Not found: {p}")
    # geopandas with pyogrio backend reads SHP/GeoJSON/… fast
    gdf = gpd.read_file(p)
    # prefer declared CRS; optional override if provided
    if src_epsg:
        gdf = gdf.set_crs(epsg=src_epsg, allow_override=True)
    if gdf.crs is None:
        # naive fallback; better: detect or ask user
        gdf = gdf.set_crs(epsg=4326)
    gdf = gdf.to_crs(4326)
    return gdf

def gdf_to_geojson_dict(gdf: gpd.GeoDataFrame, idx_prefix: str = "feat"):
    feats = []
    for i, row in gdf.iterrows():
        geom = row.geometry
        if geom is None or geom.is_empty:
            continue
        props = {k: v for k, v in row.items() if k != "geometry"}
        feats.append({
            "type": "Feature",
            "id": f"{idx_prefix}_{i}",
            "geometry": mapping(geom),
            "properties": props
        })
    return {"type": "FeatureCollection", "features": feats}

def bbox_of_geojson(geojson: dict):
    minx = miny = +1e20
    maxx = maxy = -1e20
    for f in geojson.get("features", []):
        coords = _flatten_coords(f["geometry"])
        for (x, y) in coords:
            minx = min(minx, x); maxx = max(maxx, x)
            miny = min(miny, y); maxy = max(maxy, y)
    return [minx, miny, maxx, maxy]

def _flatten_coords(geom):
    t = geom["type"]
    c = geom["coordinates"]
    if t == "Point":
        return [tuple(c)]
    if t in ("LineString", "MultiPoint"):
        return [tuple(p) for p in c]
    if t == "Polygon":
        return [tuple(p) for ring in c for p in ring]
    if t in ("MultiLineString", "MultiPolygon"):
        flat = []
        def walk(x):
            if isinstance(x[0], (float, int)): flat.append(tuple(x))
            else:
                for y in x: walk(y)
        walk(c)
        return flat
    if t == "GeometryCollection":
        flat = []
        for g in geom["geometries"]:
            flat.extend(_flatten_coords(g))
        return flat
    return []
