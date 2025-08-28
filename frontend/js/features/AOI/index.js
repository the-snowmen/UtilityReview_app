import { backend } from "../../api.js";
import { map } from "../../map/map.js";
import { addGeoJSONLayer, applyLayerStyle } from "../../layers/layers.js";
import * as Draw from "./draw.js";
import * as AoiExport from "./export.js";
import * as AoiImport from "./import_kmx.js";

let aoiFeature = null;

export async function setAoiFromGeoJSON(feature) {
  // validate via backend (cheap sanity)
  await backend.aoiSet(feature);
  aoiFeature = feature;
  Draw.showOnMap(feature, map);
}

export async function importAoiFromKmz(path) {
  // NOTE: server returns 501 for now (stubbed); keep UI graceful
  try {
    const res = await backend.aoiFromKmz(path);
    await setAoiFromGeoJSON(res.aoi);
  } catch (e) {
    alert("KMZ import not implemented yet on Python backend.");
  }
}

export async function exportKmz(layers, suggestedName="aoi_export.kmz") {
  const data = layers.map(l => ({
    name: l.name,
    geojson: l.geojson,
    style: l.style
  }));
  const out = await backend.exportAoiKmz(aoiFeature, data, suggestedName, {});
  return out.file;
}
