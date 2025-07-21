const express = require('express');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Please upload images or PDF files.'));
    }
  }
});

// Extract text from W-2 using OCR
const extractW2Data = async (imagePath) => {
  try {
    const { data: { text } } = await Tesseract.recognize(imagePath, 'eng');
    
    // Simple regex patterns to extract common W-2 fields
    const patterns = {
      employerEIN: /\b\d{2}-\d{7}\b/,
      employeeSSN: /\b\d{3}-\d{2}-\d{4}\b/,
      wages: /(?:wages|box\s*1)[:\s]*\$?([\d,]+\.?\d*)/i,
      federalTaxWithheld: /(?:federal|box\s*2)[:\s]*\$?([\d,]+\.?\d*)/i,
      socialSecurityWages: /(?:social security|box\s*3)[:\s]*\$?([\d,]+\.?\d*)/i,
      medicareWages: /(?:medicare|box\s*5)[:\s]*\$?([\d,]+\.?\d*)/i
    };

    const extractedData = {};
    
    for (const [field, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern);
      if (match) {
        extractedData[field] = match[1] || match[0];
      }
    }

    return extractedData;
  } catch (error) {
    console.error('OCR extraction error:', error);
    return {};
  }
};

// Upload W-2 document
router.post('/w2', auth, upload.single('w2Document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Extract data from the uploaded document
    const extractedData = await extractW2Data(req.file.path);

    // Save document info to user
    const documentInfo = {
      type: 'w2',
      filename: req.file.filename,
      extractedData: extractedData
    };

    user.documents.push(documentInfo);
    await user.save();

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      message: 'W-2 document uploaded and processed successfully',
      extractedData: extractedData
    });
  } catch (error) {
    // Clean up file if error occurs
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get uploaded documents
router.get('/documents', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('documents');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user.documents);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete document
router.delete('/documents/:docId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.documents = user.documents.filter(doc => doc._id.toString() !== req.params.docId);
    await user.save();

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;