const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User'); // Direct import, no destructuring
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

    const { filingStatus, dependents, address, w9Data } = req.body;

    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update taxInfo with both traditional and W-9 data
    const updatedTaxInfo = {
      filingStatus,
      dependents: dependents || [],
      address: address || {},
      w9: w9Data || {} // Add W-9 data
    };

    await user.update({ taxInfo: updatedTaxInfo });

    res.json({ 
      message: 'Tax information updated successfully', 
      taxInfo: updatedTaxInfo 
    });
  } catch (error) {
    console.error('Tax info update error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get tax information
router.get('/info', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.userId, {
      attributes: ['taxInfo']
    });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user.taxInfo || {});
  } catch (error) {
    console.error('Get tax info error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Generate 1098 form data
router.post('/generate-1098', auth, async (req, res) => {
  console.log('🔥 FORM 1098 GENERATION REQUEST RECEIVED!');
  console.log('User ID from auth:', req.userId);
  
  try {
    const user = await User.findByPk(req.userId);
    if (!user) {
      console.log('❌ User not found:', req.userId);
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('✅ User found for form generation:', user.email);

    // Find W-2 documents from user.documents array
    const documents = user.documents || [];
    console.log('📋 Documents after null check:', documents);
    
    const w2Documents = documents.filter(doc => {
      console.log('🔍 Checking document:', JSON.stringify(doc, null, 2));
      return doc.type === 'w2';
    });
    
    console.log('📋 Filtered W-2 documents:', JSON.stringify(w2Documents, null, 2));
    console.log('📊 W-2 documents count:', w2Documents.length);
    
    if (w2Documents.length === 0) {
      console.log('❌ NO W-2 DOCUMENTS FOUND AFTER FILTERING!');
      return res.status(400).json({ message: 'No W-2 documents found. Please upload W-2 first.' });
    }

    console.log('✅ Found W-2 documents, proceeding with form generation...');

    // Generate form data
    const form1098Data = {
      taxYear: new Date().getFullYear() - 1,
      taxpayer: {
        name: `${user.firstName} ${user.lastName}`,
        ssn: w2Documents[0].extractedData?.employeeSSN || '***-**-****',
        address: user.taxInfo?.address || {}
      },
      income: {
        wages: w2Documents.reduce((total, doc) => {
          const wages = doc.extractedData?.wages;
          if (wages) {
            const cleanWages = parseFloat(wages.toString().replace(/[,$]/g, '')) || 0;
            console.log(`💰 Adding wages from ${doc.filename}: ${cleanWages}`);
            return total + cleanWages;
          }
          return total;
        }, 0),
        federalTaxWithheld: w2Documents.reduce((total, doc) => {
          const withheld = doc.extractedData?.federalTaxWithheld;
          if (withheld) {
            const cleanWithheld = parseFloat(withheld.toString().replace(/[,$]/g, '')) || 0;
            return total + cleanWithheld;
          }
          return total;
        }, 0),
        socialSecurityWages: w2Documents.reduce((total, doc) => {
          const ssWages = doc.extractedData?.socialSecurityWages;
          if (ssWages) {
            const cleanSSWages = parseFloat(ssWages.toString().replace(/[,$]/g, '')) || 0;
            return total + cleanSSWages;
          }
          return total;
        }, 0),
        medicareWages: w2Documents.reduce((total, doc) => {
          const medicareWages = doc.extractedData?.medicareWages;
          if (medicareWages) {
            const cleanMedicareWages = parseFloat(medicareWages.toString().replace(/[,$]/g, '')) || 0;
            return total + cleanMedicareWages;
          }
          return total;
        }, 0)
      },
      deductions: {
        standardDeduction: user.taxInfo?.filingStatus === 'married-joint' ? 27700 : 13850,
        itemizedDeductions: 0
      },
      filingStatus: user.taxInfo?.filingStatus || 'single',
      dependents: user.taxInfo?.dependents || []
    };

    console.log('📋 Generated form data:', JSON.stringify(form1098Data, null, 2));

    // Update user's tax return
    const updatedTaxReturn = {
      ...user.taxReturn,
      form1040: form1098Data,
      status: 'review'
    };

    await user.update({ taxReturn: updatedTaxReturn });
    console.log('✅ Tax return updated in database');

    console.log('🎉 FORM 1098 GENERATION COMPLETED SUCCESSFULLY!');

    res.json({ 
      message: '1098 form generated successfully', 
      form1098: form1098Data 
    });
  } catch (error) {
    console.error('💥 Generate 1098 error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update 1098 form
router.put('/update-1098', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const updatedForm = { 
      ...user.taxReturn?.form1040, 
      ...req.body 
    };

    const updatedTaxReturn = {
      ...user.taxReturn,
      form1040: updatedForm
    };

    await user.update({ taxReturn: updatedTaxReturn });

    res.json({ 
      message: '1098 form updated successfully', 
      form1098: updatedForm 
    });
  } catch (error) {
    console.error('Update 1098 error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get 1098 form
router.get('/form-1098', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.userId, {
      attributes: ['taxReturn']
    });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user.taxReturn?.form1040 || {});
  } catch (error) {
    console.error('Get 1098 form error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Submit tax return
router.post('/submit', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.taxReturn?.form1040) {
      return res.status(400).json({ message: 'No tax return data found' });
    }

    const updatedTaxReturn = {
      ...user.taxReturn,
      status: 'submitted',
      submissionDate: new Date()
    };

    await user.update({ taxReturn: updatedTaxReturn });

    res.json({ message: 'Tax return submitted successfully' });
  } catch (error) {
    console.error('Submit tax return error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
