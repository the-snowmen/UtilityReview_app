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

// Get fiber cable data from raw_data.fibercable_test table
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
        FROM raw_data.fibercable_test
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
            'feature_type', 'Structure'
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
async function getTableSchema(tableName = 'raw_data.fibercable_test') {
  try {
    const query = `
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'raw_data'
        AND table_name = 'fibercable_test'
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
      FROM raw_data.fibercable_test
      WHERE geom IS NOT NULL;
    `;

    const result = await pool.query(query);
    return result.rows[0];
  } catch (err) {
    console.error('Error fetching data bounds:', err);
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
  closeConnection
};