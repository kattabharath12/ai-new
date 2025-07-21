const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const { User, sequelize, initializeDatabase } = require('./models/User');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for Railway deployment
app.set('trust proxy', 1);

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      scriptSrc: ["'self'", "https://cdn.tailwindcss.com", "https://js.stripe.com"],
      scriptSrcAttr: ["'self'", "'unsafe-inline'"], // Add this line
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.stripe.com"],
      frameSrc: ["'self'", "https://js.stripe.com"]
    },
  },
}));
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Database setup endpoint
app.get('/setup-database', async (req, res) => {
  try {
    await initializeDatabase();
    res.json({ 
      message: 'Database setup completed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Database setup error:', error);
    res.status(500).json({ 
      message: 'Database setup failed', 
      error: error.message 
    });
  }
});

// Database check endpoint
app.get('/check-database', async (req, res) => {
  try {
    await sequelize.authenticate();
    const userCount = await User.count();
    res.json({ 
      status: 'Connected',
      userCount: userCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Database check error:', error);
    res.status(500).json({ 
      status: 'Error',
      error: error.message 
    });
  }
});

// Start server
async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    
    // Routes
    app.use('/api/auth', require('./routes/auth'));
    app.use('/api/tax', require('./routes/tax'));
    app.use('/api/upload', require('./routes/upload'));
    app.use('/api/payment', require('./routes/payment'));

    // Serve frontend
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🗄️ Database: PostgreSQL`);
      console.log(`🌐 Health check: http://localhost:${PORT}/health`);
      console.log(`🔧 Database setup: http://localhost:${PORT}/setup-database`);
      console.log(`🔍 Database check: http://localhost:${PORT}/check-database`);
      
      if (process.env.RAILWAY_STATIC_URL) {
        console.log(`🔗 Live URL: ${process.env.RAILWAY_STATIC_URL}`);
        console.log(`🔧 Setup Database: ${process.env.RAILWAY_STATIC_URL}/setup-database`);
      }
    });
  } catch (error) {
    console.error('❌ Server startup failed:', error);
    process.exit(1);
  }
}

startServer();

module.exports = { sequelize, User };
