const { DataTypes, Sequelize } = require('sequelize');
const bcrypt = require('bcryptjs');

// Create sequelize instance using DATABASE_URL from Railway
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  logging: console.log
});

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  firstName: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  lastName: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  taxInfo: {
    type: DataTypes.JSONB,
    defaultValue: {},
    allowNull: false
  },
  documents: {
    type: DataTypes.JSONB,
    defaultValue: [],
    allowNull: false
  },
  taxReturn: {
    type: DataTypes.JSONB,
    defaultValue: {},
    allowNull: false
  },
  payments: {
    type: DataTypes.JSONB,
    defaultValue: [],
    allowNull: false
  }
}, {
  tableName: 'Users',
  timestamps: true,
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        user.password = await bcrypt.hash(user.password, 12);
      }
    }
  }
});

// Add instance method for password comparison
User.prototype.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

// Initialize database connection and sync
async function initializeDatabase() {
  try {
    console.log('🔄 Connecting to PostgreSQL...');
    await sequelize.authenticate();
    console.log('✅ PostgreSQL connected successfully');
    
    console.log('🔄 Creating database tables...');
    await sequelize.sync({ 
      force: false,
      alter: true,
      logging: console.log 
    });
    console.log('✅ Database sync completed');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

// Export the User model and helper functions
module.exports = {
  User,
  sequelize,
  initializeDatabase
};
