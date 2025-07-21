// server.js - Updated with Database Setup Endpoint
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const pool = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// IMPORTANT: Trust proxy for Railway deployment
app.set('trust proxy', 1);

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://js.stripe.com"],
      connectSrc: ["'self'", "https://api.stripe.com"],
      frameSrc: ["https://js.stripe.com", "https://hooks.stripe.com"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://ai-new-production.up.railway.app', 'https://*.railway.app'] 
    : ['http://localhost:3000', 'http://localhost:8080'],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting - Fixed for Railway
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests, please try again later.',
    retryAfter: Math.round(15 * 60) // 15 minutes in seconds
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

app.use('/api/', limiter);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Test database connection on startup
const testDatabaseConnection = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ PostgreSQL connected successfully');
    
    // Test a simple query
    const result = await client.query('SELECT NOW() as current_time');
    console.log('📅 Database time:', result.rows[0].current_time);
    
    client.release();
  } catch (error) {
    console.error('❌ PostgreSQL connection failed:', error.message);
    console.error('Database URL format check:', process.env.DATABASE_URL ? 'Set' : 'Not set');
    
    // Don't exit in production, just log the error
    if (process.env.NODE_ENV !== 'production') {
      process.exit(1);
    }
  }
};

// Initialize database connection
testDatabaseConnection();

// TEMPORARY DATABASE SETUP ENDPOINT - Remove after setup
app.get('/setup-database', async (req, res) => {
  try {
    console.log('🚀 Starting database setup...');
    const client = await pool.connect();
    
    // Define the schema directly in the code
    const schemaSQL = `
      -- Create tables in correct order
      CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          first_name VARCHAR(100) NOT NULL,
          last_name VARCHAR(100) NOT NULL,
          phone VARCHAR(20),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tax_info (
          id SERIAL PRIMARY KEY,
          user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          filing_status VARCHAR(50) NOT NULL CHECK (filing_status IN ('single', 'married-joint', 'married-separate', 'head-of-household', 'qualifying-widow')),
          tax_classification VARCHAR(50) DEFAULT 'individual',
          ssn VARCHAR(11),
          ein VARCHAR(10),
          street_address TEXT,
          city VARCHAR(100),
          state VARCHAR(50),
          zip_code VARCHAR(10),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS dependents (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          ssn VARCHAR(11),
          relationship VARCHAR(100),
          date_of_birth DATE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS documents (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          document_type VARCHAR(20) NOT NULL CHECK (document_type IN ('w2', 'w9', '1098', '1099')),
          filename VARCHAR(255) NOT NULL,
          extracted_data JSONB,
          upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tax_returns (
          id SERIAL PRIMARY KEY,
          user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          form_1040_data JSONB,
          status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'submitted', 'processing', 'completed')),
          submission_date TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS payments (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          amount DECIMAL(10,2) NOT NULL,
          stripe_payment_id VARCHAR(255) UNIQUE,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_tax_info_user_id ON tax_info(user_id);
      CREATE INDEX IF NOT EXISTS idx_dependents_user_id ON dependents(user_id);
      CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
      CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type);
      CREATE INDEX IF NOT EXISTS idx_documents_extracted_data ON documents USING GIN (extracted_data);
      CREATE INDEX IF NOT EXISTS idx_tax_returns_user_id ON tax_returns(user_id);
      CREATE INDEX IF NOT EXISTS idx_tax_returns_status ON tax_returns(status);
      CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
      CREATE INDEX IF NOT EXISTS idx_payments_stripe_id ON payments(stripe_payment_id);
    `;
    
    console.log('📄 Executing schema SQL...');
    
    // Execute the entire schema
    await client.query(schemaSQL);
    
    console.log('🏗️  Schema executed successfully');
    
    // Verify tables were created
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    const tableNames = tablesResult.rows.map(row => row.table_name);
    console.log('📊 Created tables:', tableNames);
    
    client.release();
    
    res.json({
      success: true,
      message: 'Database setup completed successfully! 🎉',
      tablesCreated: tableNames,
      totalTables: tableNames.length,
      timestamp: new Date().toISOString()
    });
    
    console.log('✅ Database setup endpoint completed successfully');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    res.status(500).json({
      success: false,
      error: 'Database setup failed',
      details: error.message,
      code: error.code,
      timestamp: new Date().toISOString()
    });
  }
});

// Check database tables endpoint
app.get('/check-database', async (req, res) => {
  try {
    const client = await pool.connect();
    
    // Check if tables exist
    const tablesResult = await client.query(`
      SELECT table_name, 
             (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    const tables = tablesResult.rows;
    
    // Check if users table has any data
    let userCount = 0;
    if (tables.some(t => t.table_name === 'users')) {
      const userResult = await client.query('SELECT COUNT(*) as count FROM users');
      userCount = parseInt(userResult.rows[0].count);
    }
    
    client.release();
    
    res.json({
      databaseConnected: true,
      tablesExist: tables.length > 0,
      tables: tables,
      totalTables: tables.length,
      userCount: userCount,
      expectedTables: ['users', 'tax_info', 'dependents', 'documents', 'tax_returns', 'payments'],
      setupComplete: tables.length >= 6,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      databaseConnected: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tax', require('./routes/tax'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/payment', require('./routes/payment'));

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
    
    // Check if tables exist
    const tablesResult = await client.query(`
      SELECT COUNT(*) as table_count
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    
    const tableCount = parseInt(tablesResult.rows[0].table_count);
    
    client.release();
    
    res.json({ 
      status: 'healthy', 
      database: 'connected',
      tablesExist: tableCount > 0,
      tableCount: tableCount,
      timestamp: result.rows[0].current_time,
      postgresVersion: result.rows[0].pg_version.split(',')[0],
      environment: process.env.NODE_ENV,
      port: PORT
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy', 
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    service: 'AI Tax Filing API',
    status: 'online',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  
  // Don't leak error details in production
  const errorMessage = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : error.message;
    
  res.status(500).json({ 
    message: errorMessage,
    timestamp: new Date().toISOString(),
    path: req.path
  });
});

// Handle 404s
app.use('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({
      error: 'API endpoint not found',
      path: req.path,
      method: req.method
    });
  } else {
    // Serve the frontend for non-API routes
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// Graceful shutdown handlers
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`🗄️  Database: PostgreSQL`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  console.log(`🔧 Database setup: http://localhost:${PORT}/setup-database`);
  console.log(`🔍 Database check: http://localhost:${PORT}/check-database`);
  
  if (process.env.NODE_ENV === 'production') {
    console.log(`🔗 Live URL: https://ai-new-production.up.railway.app`);
    console.log(`🔧 Setup Database: https://ai-new-production.up.railway.app/setup-database`);
  }
});

// Handle server errors
server.on('error', (error) => {
  console.error('Server error:', error);
});

module.exports = app;
