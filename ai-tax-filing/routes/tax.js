// routes/tax.js - PostgreSQL Version
const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// Update tax information (W-9 form data)
router.put('/info', auth, [
  body('filingStatus').isIn(['single', 'married-joint', 'married-separate', 'head-of-household', 'qualifying-widow'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { filingStatus, dependents, address, taxClassification, ssn, ein } = req.body;

    const taxInfoData = {
      filingStatus,
      dependents: dependents || [],
      address: address || {},
      taxClassification: taxClassification || 'individual',
      ssn: ssn || '',
      ein: ein || ''
    };

    await User.updateTaxInfo(req.userId, taxInfoData);

    res.json({ message: 'Tax information updated successfully' });
  } catch (error) {
    console.error('Tax info update error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get tax information
router.get('/info', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user.taxInfo || {});
  } catch (error) {
    console.error('Get tax info error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Generate Form 1040 (FIXED: was 1098)
router.post('/generate-1040', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Find W-2 documents
    const w2Documents = user.documents.filter(doc => doc.type === 'w2');
    
    if (w2Documents.length === 0) {
      return res.status(400).json({ message: 'No W-2 documents found. Please upload W-2 first.' });
    }

    // Calculate total income from all W-2s
    const totalWages = w2Documents.reduce((total, doc) => {
      const wages = doc.extractedData?.wages || 0;
      return total + (typeof wages === 'string' ? parseFloat(wages) : wages);
    }, 0);

    const totalFederalWithheld = w2Documents.reduce((total, doc) => {
      const withheld = doc.extractedData?.federalTaxWithheld || 0;
      return total + (typeof withheld === 'string' ? parseFloat(withheld) : withheld);
    }, 0);

    const totalSocialSecurityWages = w2Documents.reduce((total, doc) => {
      const ssWages = doc.extractedData?.socialSecurityWages || 0;
      return total + (typeof ssWages === 'string' ? parseFloat(ssWages) : ssWages);
    }, 0);

    const totalMedicareWages = w2Documents.reduce((total, doc) => {
      const medWages = doc.extractedData?.medicareWages || 0;
      return total + (typeof medWages === 'string' ? parseFloat(medWages) : medWages);
    }, 0);

    // Determine standard deduction based on filing status (2024 values)
    const getStandardDeduction = (filingStatus) => {
      const deductions = {
        'single': 14600,
        'married-joint': 29200,
        'married-separate': 14600,
        'head-of-household': 21900,
        'qualifying-widow': 29200
      };
      return deductions[filingStatus] || 14600;
    };

    const standardDeduction = getStandardDeduction(user.taxInfo.filingStatus);
    const adjustedGrossIncome = totalWages;
    const taxableIncome = Math.max(0, adjustedGrossIncome - standardDeduction);

    // Calculate federal income tax using 2024 tax brackets
    const calculateFederalTax = (taxableIncome, filingStatus) => {
      const brackets = {
        single: [
          { min: 0, max: 11000, rate: 0.10 },
          { min: 11000, max: 44725, rate: 0.12 },
          { min: 44725, max: 95375, rate: 0.22 },
          { min: 95375, max: 182050, rate: 0.24 },
          { min: 182050, max: 231250, rate: 0.32 },
          { min: 231250, max: 578125, rate: 0.35 },
          { min: 578125, max: Infinity, rate: 0.37 }
        ],
        'married-joint': [
          { min: 0, max: 22000, rate: 0.10 },
          { min: 22000, max: 89450, rate: 0.12 },
          { min: 89450, max: 190750, rate: 0.22 },
          { min: 190750, max: 364200, rate: 0.24 },
          { min: 364200, max: 462500, rate: 0.32 },
          { min: 462500, max: 693750, rate: 0.35 },
          { min: 693750, max: Infinity, rate: 0.37 }
        ]
      };

      const applicableBrackets = brackets[filingStatus] || brackets.single;
      let tax = 0;
      let remainingIncome = taxableIncome;

      for (const bracket of applicableBrackets) {
        if (remainingIncome <= 0) break;
        
        const taxableAtThisBracket = Math.min(remainingIncome, bracket.max - bracket.min);
        tax += taxableAtThisBracket * bracket.rate;
        remainingIncome -= taxableAtThisBracket;
      }

      return Math.round(tax);
    };

    const federalIncomeTax = calculateFederalTax(taxableIncome, user.taxInfo.filingStatus);
    const refundOrOwed = totalFederalWithheld - federalIncomeTax;

    // Generate comprehensive Form 1040 data
    const form1040Data = {
      taxYear: new Date().getFullYear() - 1,
      formType: '1040',
      
      // Taxpayer Information
      taxpayer: {
        name: `${user.firstName} ${user.lastName}`,
        ssn: user.taxInfo.ssn || '',
        address: user.taxInfo.address || {},
        filingStatus: user.taxInfo.filingStatus || 'single'
      },
      
      // Income Section
      income: {
        wages: totalWages,
        taxableInterest: 0,
        ordinaryDividends: 0,
        iraDistributions: 0,
        pensionsAnnuities: 0,
        socialSecurityBenefits: 0,
        capitalGainLoss: 0,
        otherIncome: 0,
        totalIncome: totalWages,
        adjustedGrossIncome: adjustedGrossIncome
      },
      
      // Deductions Section
      deductions: {
        standardDeduction: standardDeduction,
        itemizedDeductions: 0,
        qbiDeduction: 0,
        totalDeductions: standardDeduction,
        taxableIncome: taxableIncome
      },
      
      // Tax Calculation
      tax: {
        baseTax: federalIncomeTax,
        scheduleD: 0,
        excessAdvancePTC: 0,
        otherTaxes: 0,
        totalTax: federalIncomeTax
      },
      
      // Credits
      credits: {
        childTaxCredit: 0,
        creditForOtherDependents: 0,
        educationCredits: 0,
        retirementSavingsCredit: 0,
        childCareCredit: 0,
        residentialEnergyCredit: 0,
        otherCredits: 0,
        totalCredits: 0,
        taxAfterCredits: federalIncomeTax
      },
      
      // Other Taxes
      otherTaxes: {
        selfEmploymentTax: 0,
        unreportedSocialSecurityTax: 0,
        additionalTax: 0,
        totalOtherTaxes: 0
      },
      
      // Payments
      payments: {
        federalIncomeTaxWithheld: totalFederalWithheld,
        estimatedTaxPayments: 0,
        earnedIncomeCredit: 0,
        additionalChildTaxCredit: 0,
        americanOpportunityCredit: 0,
        netPremiumTaxCredit: 0,
        amountPaidWithExtension: 0,
        excessSocialSecurityWithheld: 0,
        totalPayments: totalFederalWithheld
      },
      
      // Refund or Amount Owed
      refundOrOwed: {
        overpaid: refundOrOwed > 0 ? refundOrOwed : 0,
        refundAmount: refundOrOwed > 0 ? refundOrOwed : 0,
        amountOwed: refundOrOwed < 0 ? Math.abs(refundOrOwed) : 0,
        penalty: 0
      },
      
      // Dependents Information
      dependents: user.taxInfo.dependents || [],
      
      // W-2 Information
      w2Information: w2Documents.map(doc => ({
        employer: doc.extractedData?.employerName || 'Unknown',
        ein: doc.extractedData?.employerEIN || '',
        wages: parseFloat(doc.extractedData?.wages) || 0,
        federalWithheld: parseFloat(doc.extractedData?.federalTaxWithheld) || 0,
        socialSecurityWages: parseFloat(doc.extractedData?.socialSecurityWages) || 0,
        medicareWages: parseFloat(doc.extractedData?.medicareWages) || 0
      })),
      
      // Summary
      summary: {
        totalIncome: adjustedGrossIncome,
        totalDeductions: standardDeduction,
        taxableIncome: taxableIncome,
        totalTax: federalIncomeTax,
        totalWithheld: totalFederalWithheld,
        refundOrOwed: refundOrOwed,
        isRefund: refundOrOwed > 0
      }
    };

    // Save the generated form
    await User.updateTaxReturn(req.userId, form1040Data);

    res.json({ 
      message: 'Form 1040 generated successfully', 
      form1040: form1040Data 
    });
  } catch (error) {
    console.error('Generate 1040 error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update Form 1040
router.put('/update-1040', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Merge updates with existing form data
    const updatedFormData = { ...user.taxReturn.form1040, ...req.body };
    await User.updateTaxReturn(req.userId, updatedFormData);

    res.json({ 
      message: 'Form 1040 updated successfully', 
      form1040: updatedFormData 
    });
  } catch (error) {
    console.error('Update 1040 error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get Form 1040
router.get('/form-1040', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user.taxReturn.form1040 || {});
  } catch (error) {
    console.error('Get 1040 error:', error);
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

    // Check if payment has been made
    if (!user.payments || user.payments.length === 0) {
      return res.status(400).json({ message: 'Payment required before submission' });
    }

    await User.submitTaxReturn(req.userId);

    res.json({ 
      message: 'Tax return submitted successfully',
      submissionId: generateSubmissionId(),
      status: 'submitted'
    });
  } catch (error) {
    console.error('Submit tax return error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Helper function to generate submission ID
function generateSubmissionId() {
  return 'TX' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 5).toUpperCase();
}

module.exports = router;
