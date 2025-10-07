// backend/database.js
const { Pool } = require('pg');
require('dotenv').config();

// Database connection pool
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20, // maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test database connection
async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('Database connected successfully');
    client.release();
    return true;
  } catch (err) {
    console.error('Database connection error:', err);
    return false;
  }
}

// Get fiber cable data from raw_data.fibercable table
async function getFiberCableData(bounds = null, limit = 1000) {
  try {
    let query = `
      SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
      ) as geojson
      FROM (
        SELECT jsonb_build_object(
          'type', 'Feature',
          'geometry', ST_AsGeoJSON(geom)::jsonb,
          'properties', jsonb_build_object(
            'cable_name', cable_name,
            'owner', owner,
            'placementt', placementt,
            'cable_cate', cable_cate,
            'inventory_', inventory_,
            'serving_ar', serving_ar,
            'sof_number', sof_number,
            'feature_type', 'FiberCable'
          )
        ) as feature
        FROM raw_data.fibercable
        WHERE geom IS NOT NULL
    `;

    const params = [];

    // Add spatial filtering if bounds are provided
    if (bounds) {
      query += ` AND ST_Intersects(geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))`;
      params.push(bounds.west, bounds.south, bounds.east, bounds.north);
    }

    query += ` LIMIT $${params.length + 1}`;
    params.push(limit);
    query += `) features`;

    const result = await pool.query(query, params);
    return result.rows[0].geojson;
  } catch (err) {
    console.error('Error fetching fiber cable data:', err);
    throw err;
  }
}

// Get conduit data from raw_data.conduit_everstream table
async function getConduitData(bounds = null, limit = 1000) {
  try {
    let query = `
      SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
      ) as geojson
      FROM (
        SELECT jsonb_build_object(
          'type', 'Feature',
          'geometry', ST_AsGeoJSON(geom)::jsonb,
          'properties', jsonb_build_object(
            'route_name', route_name,
            'owner', owner,
            'inventory_', inventory_,
            'vacant', vacant,
            'sof_number', sof_number,
            'locate_tog', locate_tog,
            'feature_type', 'Conduit'
          )
        ) as feature
        FROM raw_data.conduit_everstream
        WHERE geom IS NOT NULL
    `;

    const params = [];

    if (bounds) {
      query += ` AND ST_Intersects(geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))`;
      params.push(bounds.west, bounds.south, bounds.east, bounds.north);
    }

    query += ` LIMIT $${params.length + 1}`;
    params.push(limit);
    query += `) features`;

    const result = await pool.query(query, params);
    return result.rows[0].geojson;
  } catch (err) {
    console.error('Error fetching conduit data:', err);
    throw err;
  }
}

// Get structure data from raw_data.structure_everstream table
async function getStructureData(bounds = null, limit = 1000) {
  try {
    let query = `
      SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
      ) as geojson
      FROM (
        SELECT jsonb_build_object(
          'type', 'Feature',
          'geometry', ST_AsGeoJSON(geom)::jsonb,
          'properties', jsonb_build_object(
            'structure_', structure_,
            'owner', owner,
            'inventory_', inventory_,
            'subtypecod', subtypecod,
            'serving_ar', serving_ar,
            'sof_number', sof_number,
            'locate_tog', locate_tog,
            'latitude', latitude,
            'longitude', longitude,
            'feature_type', 'Structure',
            'symbol', CASE
              WHEN COALESCE(subtypecod, 0) = 0 THEN '?'
              WHEN subtypecod = 1 THEN 'M'
              WHEN subtypecod = 2 THEN 'H'
              WHEN subtypecod = 3 THEN
                CASE WHEN LOWER(COALESCE(owner, '')) LIKE '%everstream%' THEN 'H' ELSE 'V' END
              ELSE '?'
            END
          )
        ) as feature
        FROM raw_data.structure_everstream
        WHERE geom IS NOT NULL
    `;

    const params = [];

    if (bounds) {
      query += ` AND ST_Intersects(geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))`;
      params.push(bounds.west, bounds.south, bounds.east, bounds.north);
    }

    query += ` LIMIT $${params.length + 1}`;
    params.push(limit);
    query += `) features`;

    const result = await pool.query(query, params);
    return result.rows[0].geojson;
  } catch (err) {
    console.error('Error fetching structure data:', err);
    throw err;
  }
}

// Get table schema information
async function getTableSchema(tableName = 'raw_data.fibercable') {
  try {
    const query = `
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'raw_data'
        AND table_name = 'fibercable'
      ORDER BY ordinal_position;
    `;

    const result = await pool.query(query);
    return result.rows;
  } catch (err) {
    console.error('Error fetching table schema:', err);
    throw err;
  }
}

// Get data bounds for initial map extent
async function getDataBounds() {
  try {
    const query = `
      SELECT
        ST_XMin(ST_Extent(geom)) as min_x,
        ST_YMin(ST_Extent(geom)) as min_y,
        ST_XMax(ST_Extent(geom)) as max_x,
        ST_YMax(ST_Extent(geom)) as max_y,
        COUNT(*) as feature_count
      FROM raw_data.fibercable
      WHERE geom IS NOT NULL;
    `;

    const result = await pool.query(query);
    return result.rows[0];
  } catch (err) {
    console.error('Error fetching data bounds:', err);
    throw err;
  }
}

// Diagnostic: Check coordinate systems and validity
async function diagnoseFiberCableGeometry(tableName = 'fibercable') {
  try {
    const query = `
      WITH geom_check AS (
        SELECT
          cable_name,
          ST_SRID(geom) as srid,
          ST_X(ST_Centroid(geom)) as lon,
          ST_Y(ST_Centroid(geom)) as lat,
          GeometryType(geom) as geom_type
        FROM raw_data.${tableName}
        WHERE geom IS NOT NULL
        LIMIT 100
      )
      SELECT
        COUNT(*) as total_checked,
        COUNT(DISTINCT srid) as unique_srids,
        MIN(lon) as min_lon,
        MAX(lon) as max_lon,
        MIN(lat) as min_lat,
        MAX(lat) as max_lat,
        COUNT(CASE WHEN lon < -180 OR lon > 180 THEN 1 END) as invalid_lon,
        COUNT(CASE WHEN lat < -90 OR lat > 90 THEN 1 END) as invalid_lat,
        array_agg(DISTINCT srid) as srids
      FROM geom_check;
    `;

    const result = await pool.query(query);
    console.log('Geometry Diagnostics:', result.rows[0]);
    return result.rows[0];
  } catch (err) {
    console.error('Error diagnosing geometry:', err);
    throw err;
  }
}

// Clip fiber cable data with AOI polygon (PostGIS clipping)
async function clipFiberCableData(aoiGeojson, limit = 100000) {
  try {
    const query = `
      SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
      ) as geojson
      FROM (
        SELECT jsonb_build_object(
          'type', 'Feature',
          'geometry', ST_AsGeoJSON(ST_Intersection(f.geom, aoi.geom))::jsonb,
          'properties', jsonb_build_object(
            'cable_name', f.cable_name,
            'owner', f.owner,
            'placementt', f.placementt,
            'cable_cate', f.cable_cate,
            'inventory_', f.inventory_,
            'serving_ar', f.serving_ar,
            'sof_number', f.sof_number,
            'feature_type', 'FiberCable'
          )
        ) as feature
        FROM raw_data.fibercable f,
        LATERAL (SELECT ST_GeomFromGeoJSON($1) as geom) aoi
        WHERE f.geom IS NOT NULL
          AND ST_Intersects(f.geom, aoi.geom)
        LIMIT $2
      ) features;
    `;

    const result = await pool.query(query, [JSON.stringify(aoiGeojson.geometry || aoiGeojson), limit]);
    return result.rows[0].geojson;
  } catch (err) {
    console.error('Error clipping fiber cable data:', err);
    throw err;
  }
}

// Clip conduit data with AOI polygon
async function clipConduitData(aoiGeojson, limit = 100000) {
  try {
    const query = `
      SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
      ) as geojson
      FROM (
        SELECT jsonb_build_object(
          'type', 'Feature',
          'geometry', ST_AsGeoJSON(ST_Intersection(f.geom, aoi.geom))::jsonb,
          'properties', jsonb_build_object(
            'route_name', f.route_name,
            'owner', f.owner,
            'inventory_', f.inventory_,
            'vacant', f.vacant,
            'sof_number', f.sof_number,
            'locate_tog', f.locate_tog,
            'feature_type', 'Conduit'
          )
        ) as feature
        FROM raw_data.conduit_everstream f,
        LATERAL (SELECT ST_GeomFromGeoJSON($1) as geom) aoi
        WHERE f.geom IS NOT NULL
          AND ST_Intersects(f.geom, aoi.geom)
        LIMIT $2
      ) features;
    `;

    const result = await pool.query(query, [JSON.stringify(aoiGeojson.geometry || aoiGeojson), limit]);
    return result.rows[0].geojson;
  } catch (err) {
    console.error('Error clipping conduit data:', err);
    throw err;
  }
}

// Clip structure data with AOI polygon
async function clipStructureData(aoiGeojson, limit = 100000) {
  try {
    const query = `
      SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
      ) as geojson
      FROM (
        SELECT jsonb_build_object(
          'type', 'Feature',
          'geometry', ST_AsGeoJSON(ST_Intersection(f.geom, aoi.geom))::jsonb,
          'properties', jsonb_build_object(
            'structure_', f.structure_,
            'owner', f.owner,
            'inventory_', f.inventory_,
            'subtypecod', f.subtypecod,
            'serving_ar', f.serving_ar,
            'sof_number', f.sof_number,
            'locate_tog', f.locate_tog,
            'latitude', f.latitude,
            'longitude', f.longitude,
            'feature_type', 'Structure',
            'symbol', CASE
              WHEN COALESCE(f.subtypecod, 0) = 0 THEN '?'
              WHEN f.subtypecod = 1 THEN 'M'
              WHEN f.subtypecod = 2 THEN 'H'
              WHEN f.subtypecod = 3 THEN
                CASE WHEN LOWER(COALESCE(f.owner, '')) LIKE '%everstream%' THEN 'H' ELSE 'V' END
              ELSE '?'
            END
          )
        ) as feature
        FROM raw_data.structure_everstream f,
        LATERAL (SELECT ST_GeomFromGeoJSON($1) as geom) aoi
        WHERE f.geom IS NOT NULL
          AND ST_Intersects(f.geom, aoi.geom)
        LIMIT $2
      ) features;
    `;

    const result = await pool.query(query, [JSON.stringify(aoiGeojson.geometry || aoiGeojson), limit]);
    return result.rows[0].geojson;
  } catch (err) {
    console.error('Error clipping structure data:', err);
    throw err;
  }
}

// Close database connection
async function closeConnection() {
  await pool.end();
}

module.exports = {
  testConnection,
  getFiberCableData,
  getConduitData,
  getStructureData,
  getTableSchema,
  getDataBounds,
  diagnoseFiberCableGeometry,
  clipFiberCableData,
  clipConduitData,
  clipStructureData,
  closeConnection
};