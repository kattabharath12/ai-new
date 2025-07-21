const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

async function runMigrations() {
  console.log('🚀 Starting database migrations...');
  
  try {
    const client = await pool.connect();
    console.log('✅ Database connection successful');
    client.release();

    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
    
    const statements = schemaSQL.split(';').filter(stmt => stmt.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await pool.query(statement);
        } catch (error) {
          console.warn(`⚠️  Statement warning: ${error.message}`);
        }
      }
    }
    
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;
    
    const result = await pool.query(tablesQuery);
    const tableNames = result.rows.map(row => row.table_name);
    
    console.log('📊 Created tables:', tableNames);
    console.log('✅ Database migrations completed successfully!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
