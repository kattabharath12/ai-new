// migrations/migrate.js - Fixed version
const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

async function runMigrations() {
  console.log('🚀 Starting database migrations...');
  
  let client;
  try {
    // Get a client from the pool
    client = await pool.connect();
    console.log('✅ Database connection successful');

    // Read the schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error('Schema file not found at: ' + schemaPath);
    }

    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
    console.log('📄 Schema file loaded successfully');
    
    // Execute the entire schema at once
    await client.query(schemaSQL);
    console.log('🏗️  Tables created successfully');
    
    // Verify tables were created
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;
    
    const result = await client.query(tablesQuery);
    const tableNames = result.rows.map(row => row.table_name);
    
    console.log('📊 Created tables:', tableNames);
    
    if (tableNames.length === 0) {
      throw new Error('No tables were created!');
    }

    console.log('✅ Database migrations completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
    process.exit(0);
  }
}

runMigrations();
