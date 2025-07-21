const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// Update tax information
router.put('/info', auth, [
  body('filingStatus').isIn(['single', 'married-joint', 'married-separate', 'head-of-household', 'qualifying-widow'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { filingStatus, dependents, address } = req.body;

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.taxInfo = {
      filingStatus,
      dependents: dependents || [],
      address: address || {}
    };

    await user.save();

    res.json({ message: 'Tax information updated successfully', taxInfo: user.taxInfo });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get tax information
router.get('/info', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('taxInfo');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user.taxInfo);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Replace the route:
router.post('/generate-1040', auth, async (req, res) => {  // Was: generate-1098
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Find W-2 documents and extract data
    const w2Documents = user.documents.filter(doc => doc.type === 'w2');
    
    if (w2Documents.length === 0) {
      return res.status(400).json({ message: 'No W-2 documents found. Please upload W-2 first.' });
    }

    // Generate 1098 form based on extracted W-2 data
    const form1098Data = {
      taxYear: new Date().getFullYear() - 1,
      taxpayer: {
        name: `${user.firstName} ${user.lastName}`,
        ssn: w2Documents[0].extractedData?.employeeSSN || '',
        address: user.taxInfo.address || {}
      },
      income: {
        wages: w2Documents.reduce((total, doc) => {
          return total + (parseFloat(doc.extractedData?.wages) || 0);
        }, 0),
        federalTaxWithheld: w2Documents.reduce((total, doc) => {
          return total + (parseFloat(doc.extractedData?.federalTaxWithheld) || 0);
        }, 0),
        socialSecurityWages: w2Documents.reduce((total, doc) => {
          return total + (parseFloat(doc.extractedData?.socialSecurityWages) || 0);
        }, 0),
        medicareWages: w2Documents.reduce((total, doc) => {
          return total + (parseFloat(doc.extractedData?.medicareWages) || 0);
        }, 0)
      },
      deductions: {
        standardDeduction: user.taxInfo.filingStatus === 'married-joint' ? 27700 : 13850,
        itemizedDeductions: 0
      },
      filingStatus: user.taxInfo.filingStatus,
      dependents: user.taxInfo.dependents || []
    };

    // Save the generated form
    user.taxReturn.form1040 = form1098Data;
    user.taxReturn.status = 'review';
    await user.save();

    res.json({ message: '1098 form generated successfully', form1098: form1098Data });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update 1098 form
router.put('/update-1098', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.taxReturn.form1040 = { ...user.taxReturn.form1040, ...req.body };
    await user.save();

    res.json({ message: '1098 form updated successfully', form1098: user.taxReturn.form1040 });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get 1098 form
router.get('/form-1098', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user.taxReturn.form1040 || {});
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Submit tax return
router.post('/submit', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.taxReturn.form1040) {
      return res.status(400).json({ message: 'No tax return data found' });
    }

    user.taxReturn.status = 'submitted';
    user.taxReturn.submissionDate = new Date();
    await user.save();

    res.json({ message: 'Tax return submitted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
