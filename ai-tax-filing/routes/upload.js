// routes/upload.js - PostgreSQL Version
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

// Enhanced W-2 OCR extraction function
const extractW2Data = async (imagePath) => {
  try {
    const { data: { text } } = await Tesseract.recognize(imagePath, 'eng');
    
    // Enhanced regex patterns for W-2 data extraction
    const patterns = {
      employerName: /(?:employer|company)[:\s]*([^\n\r]{2,50})/i,
      employerEIN: /(?:employer.*ein|ein)[:\s]*(\d{2}-\d{7})/i,
      employeeSSN: /(?:employee.*ssn|social.*security)[:\s]*(\d{3}-\d{2}-\d{4})/i,
      wages: /(?:wages.*tips.*compensation|box\s*1)[:\s]*\$?([\d,]+\.?\d*)/i,
      federalTaxWithheld: /(?:federal.*income.*tax.*withheld|box\s*2)[:\s]*\$?([\d,]+\.?\d*)/i,
      socialSecurityWages: /(?:social.*security.*wages|box\s*3)[:\s]*\$?([\d,]+\.?\d*)/i,
      socialSecurityTax: /(?:social.*security.*tax.*withheld|box\s*4)[:\s]*\$?([\d,]+\.?\d*)/i,
      medicareWages: /(?:medicare.*wages.*tips|box\s*5)[:\s]*\$?([\d,]+\.?\d*)/i,
      medicareTax: /(?:medicare.*tax.*withheld|box\s*6)[:\s]*\$?([\d,]+\.?\d*)/i,
      stateWages: /(?:state.*wages|box\s*16)[:\s]*\$?([\d,]+\.?\d*)/i,
      stateTax: /(?:state.*tax|box\s*17)[:\s]*\$?([\d,]+\.?\d*)/i
    };

    const extractedData = {};
    
    for (const [field, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern);
      if (match) {
        let value = match[1] || match[0];
        
        // Clean up monetary values
        if (field.includes('wages') || field.includes('Tax') || field.includes('tax')) {
          value = value.replace(/[,$]/g, '');
          if (!isNaN(value)) {
            extractedData[field] = parseFloat(value);
          }
        } else {
          extractedData[field] = value.trim();
        }
      }
    }

    console.log('OCR extracted data:', extractedData);
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

    console.log('Processing uploaded file:', req.file.filename);

    // Extract data from the uploaded document using OCR
    const extractedData = await extractW2Data(req.file.path);

    // Save document info to PostgreSQL database
    const documentData = {
      type: 'w2',
      filename: req.file.filename,
      extractedData: extractedData
    };

    const savedDocument = await User.addDocument(req.userId, documentData);

    // Clean up uploaded file after processing
    fs.unlinkSync(req.file.path);

    console.log('Document saved to database:', savedDocument);

    res.json({
      message: 'W-2 document uploaded and processed successfully',
      extractedData: extractedData,
      documentId: savedDocument.id
    });
  } catch (error) {
    // Clean up file if error occurs
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get uploaded documents for current user
router.get('/documents', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user.documents || []);
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get documents by type (e.g., only W-2 documents)
router.get('/documents/:type', auth, async (req, res) => {
  try {
    const { type } = req.params;
    const documents = await User.getDocumentsByType(req.userId, type);
    
    res.json(documents);
  } catch (error) {
    console.error('Get documents by type error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete document
router.delete('/documents/:docId', auth, async (req, res) => {
  try {
    const { docId } = req.params;
    
    const deletedDoc = await User.deleteDocument(req.userId, docId);
    
    if (!deletedDoc) {
      return res.status(404).json({ message: 'Document not found' });
    }

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Upload multiple documents
router.post('/multiple', auth, upload.array('documents', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const processedDocuments = [];

    for (const file of req.files) {
      try {
        // Extract data from each document
        const extractedData = await extractW2Data(file.path);

        // Determine document type based on filename or content
        const documentType = req.body.type || 'w2';

        const documentData = {
          type: documentType,
          filename: file.filename,
          extractedData: extractedData
        };

        const savedDocument = await User.addDocument(req.userId, documentData);
        processedDocuments.push(savedDocument);

        // Clean up file
        fs.unlinkSync(file.path);
      } catch (fileError) {
        console.error(`Error processing file ${file.filename}:`, fileError);
        // Clean up file on error
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
    }

    res.json({
      message: `${processedDocuments.length} documents uploaded successfully`,
      documents: processedDocuments
    });
  } catch (error) {
    // Clean up all files on general error
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    console.error('Multiple upload error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
