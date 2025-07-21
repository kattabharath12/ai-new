const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
  phone: String,
  taxInfo: {
    filingStatus: {
      type: String,
      enum: ['single', 'married-joint', 'married-separate', 'head-of-household', 'qualifying-widow'],
      default: 'single'
    },
    dependents: [{
      name: String,
      ssn: String,
      relationship: String,
      dateOfBirth: Date
    }],
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String
    }
  },
  documents: [{
    type: {
      type: String,
      enum: ['w2', 'w9', '1098', '1099']
    },
    filename: String,
    uploadDate: {
      type: Date,
      default: Date.now
    },
    extractedData: mongoose.Schema.Types.Mixed
  }],
  taxReturn: {
    form1040: mongoose.Schema.Types.Mixed,
    status: {
      type: String,
      enum: ['draft', 'review', 'submitted', 'processing', 'completed'],
      default: 'draft'
    },
    submissionDate: Date
  },
  payments: [{
    amount: Number,
    stripePaymentId: String,
    status: String,
    date: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('User', userSchema);