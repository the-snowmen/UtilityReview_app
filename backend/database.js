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
      SELECT
        *,
        ST_AsGeoJSON(geom) as geojson_geom
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

    const result = await pool.query(query, params);

    // Convert to GeoJSON format
    const features = result.rows.map(row => {
      const { geojson_geom, geom, ...properties } = row;
      return {
        type: 'Feature',
        geometry: JSON.parse(geojson_geom),
        properties
      };
    });

    return {
      type: 'FeatureCollection',
      features
    };
  } catch (err) {
    console.error('Error fetching fiber cable data:', err);
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
  getTableSchema,
  getDataBounds,
  closeConnection
};