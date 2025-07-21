// routes/upload.js - Fixed PDF Support
const express = require('express');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const pdfParse = require('pdf-parse');
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

// Enhanced W-2 data extraction function
const extractW2Data = async (filePath, fileType) => {
  try {
    let extractedText = '';

    if (fileType === 'application/pdf') {
      console.log('Processing PDF file...');
      // Handle PDF files
      const pdfBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(pdfBuffer);
      extractedText = pdfData.text;
      console.log('PDF text extracted, length:', extractedText.length);
    } else {
      console.log('Processing image file with OCR...');
      // Handle image files with Tesseract OCR
      const { data: { text } } = await Tesseract.recognize(filePath, 'eng');
      extractedText = text;
      console.log('OCR text extracted, length:', extractedText.length);
    }

    // Enhanced regex patterns for W-2 data extraction
    const patterns = {
      employerName: /(?:employer|company|business)[:\s]*([^\n\r]{2,50})/i,
      employerEIN: /(?:employer.*ein|ein|federal.*id)[:\s]*(\d{2}-?\d{7})/i,
      employeeSSN: /(?:employee.*ssn|social.*security|ssn)[:\s]*(\d{3}-?\d{2}-?\d{4})/i,
      
      // Box patterns - more flexible
      wages: /(?:wages.*tips.*compensation|wages|box\s*1|1\.|1\s|^1\b)[:\s]*\$?([\d,]+\.?\d*)/i,
      federalTaxWithheld: /(?:federal.*income.*tax.*withheld|federal.*tax|box\s*2|2\.|2\s|^2\b)[:\s]*\$?([\d,]+\.?\d*)/i,
      socialSecurityWages: /(?:social.*security.*wages|ss.*wages|box\s*3|3\.|3\s|^3\b)[:\s]*\$?([\d,]+\.?\d*)/i,
      socialSecurityTax: /(?:social.*security.*tax.*withheld|ss.*tax|box\s*4|4\.|4\s|^4\b)[:\s]*\$?([\d,]+\.?\d*)/i,
      medicareWages: /(?:medicare.*wages.*tips|medicare.*wages|box\s*5|5\.|5\s|^5\b)[:\s]*\$?([\d,]+\.?\d*)/i,
      medicareTax: /(?:medicare.*tax.*withheld|medicare.*tax|box\s*6|6\.|6\s|^6\b)[:\s]*\$?([\d,]+\.?\d*)/i,
      
      // State information
      stateWages: /(?:state.*wages|box\s*16|16\.|16\s)[:\s]*\$?([\d,]+\.?\d*)/i,
      stateTax: /(?:state.*tax|box\s*17|17\.|17\s)[:\s]*\$?([\d,]+\.?\d*)/i,
      state: /(?:state|st)[:\s]*([A-Z]{2})/i,
      
      // Additional fields
      dependentCare: /(?:dependent.*care|box\s*10|10\.|10\s)[:\s]*\$?([\d,]+\.?\d*)/i,
      nonqualifiedPlans: /(?:nonqualified.*plans|box\s*11|11\.|11\s)[:\s]*\$?([\d,]+\.?\d*)/i,
      retirement401k: /(?:401.*k|retirement|box\s*12a|12a)[:\s]*\$?([\d,]+\.?\d*)/i
    };

    const extractedData = {};
    
    console.log('Applying extraction patterns...');
    
    for (const [field, pattern] of Object.entries(patterns)) {
      const match = extractedText.match(pattern);
      if (match) {
        let value = match[1] || match[0];
        
        // Clean up monetary values
        if (field.includes('wages') || field.includes('Tax') || field.includes('tax') || field.includes('Care') || field.includes('Plans') || field.includes('401k')) {
          value = value.replace(/[,$\s]/g, '');
          if (!isNaN(value) && value !== '') {
            extractedData[field] = parseFloat(value);
            console.log(`Extracted ${field}: ${extractedData[field]}`);
          }
        } else {
          extractedData[field] = value.trim();
          console.log(`Extracted ${field}: ${extractedData[field]}`);
        }
      }
    }

    // If no specific data found, try simpler patterns
    if (Object.keys(extractedData).length === 0) {
      console.log('No specific patterns matched, trying simpler extraction...');
      
      // Look for any dollar amounts
      const dollarAmounts = extractedText.match(/\$[\d,]+\.?\d*/g);
      if (dollarAmounts) {
        console.log('Found dollar amounts:', dollarAmounts);
        
        // Try to map the first few amounts to common W-2 fields
        if (dollarAmounts[0]) extractedData.wages = parseFloat(dollarAmounts[0].replace(/[$,]/g, ''));
        if (dollarAmounts[1]) extractedData.federalTaxWithheld = parseFloat(dollarAmounts[1].replace(/[$,]/g, ''));
        if (dollarAmounts[2]) extractedData.socialSecurityWages = parseFloat(dollarAmounts[2].replace(/[$,]/g, ''));
      }
      
      // Look for any SSN patterns
      const ssnMatch = extractedText.match(/\d{3}-?\d{2}-?\d{4}/);
      if (ssnMatch) {
        extractedData.employeeSSN = ssnMatch[0];
        console.log('Found SSN pattern:', extractedData.employeeSSN);
      }
      
      // Look for EIN patterns
      const einMatch = extractedText.match(/\d{2}-?\d{7}/);
      if (einMatch) {
        extractedData.employerEIN = einMatch[0];
        console.log('Found EIN pattern:', extractedData.employerEIN);
      }
    }

    console.log('Final extracted data:', extractedData);
    return extractedData;
  } catch (error) {
    console.error('Data extraction error:', error);
    return {
      error: 'Failed to extract data from document',
      message: error.message,
      // Return some default structure so the app doesn't break
      wages: 0,
      federalTaxWithheld: 0,
      socialSecurityWages: 0,
      medicareWages: 0
    };
  }
};

// Upload W-2 document
router.post('/w2', auth, upload.single('w2Document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    console.log('Processing uploaded file:', req.file.filename);
    console.log('File type:', req.file.mimetype);
    console.log('File size:', req.file.size, 'bytes');

    // Extract data from the uploaded document
    const extractedData = await extractW2Data(req.file.path, req.file.mimetype);

    // Save document info to PostgreSQL database
    const documentData = {
      type: 'w2',
      filename: req.file.filename,
      extractedData: extractedData
    };

    const savedDocument = await User.addDocument(req.userId, documentData);

    // Clean up uploaded file after processing
    fs.unlinkSync(req.file.path);

    console.log('Document saved to database:', savedDocument.id);

    res.json({
      message: 'W-2 document uploaded and processed successfully',
      extractedData: extractedData,
      documentId: savedDocument.id,
      filename: req.file.filename,
      fileType: req.file.mimetype
    });
  } catch (error) {
    // Clean up file if error occurs
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('Upload error:', error);
    res.status(500).json({ 
      message: 'Server error during file processing', 
      error: error.message,
      filename: req.file ? req.file.filename : 'unknown'
    });
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

// Test OCR endpoint (for debugging)
router.post('/test-ocr', auth, upload.single('testDocument'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    console.log('Testing OCR on file:', req.file.filename);
    
    const extractedData = await extractW2Data(req.file.path, req.file.mimetype);
    
    // Don't save to database, just return results
    fs.unlinkSync(req.file.path);
    
    res.json({
      message: 'OCR test completed',
      filename: req.file.filename,
      fileType: req.file.mimetype,
      extractedData: extractedData
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('OCR test error:', error);
    res.status(500).json({ 
      message: 'OCR test failed', 
      error: error.message 
    });
  }
});

// Upload multiple documents
router.post('/multiple', auth, upload.array('documents', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const processedDocuments = [];
    const errors = [];

    for (const file of req.files) {
      try {
        console.log('Processing multiple upload file:', file.filename);
        
        // Extract data from each document
        const extractedData = await extractW2Data(file.path, file.mimetype);

        // Determine document type based on filename or content
        const documentType = req.body.type || 'w2';

        const documentData = {
          type: documentType,
          filename: file.filename,
          extractedData: extractedData
        };

        const savedDocument = await User.addDocument(req.userId, documentData);
        processedDocuments.push({
          id: savedDocument.id,
          filename: file.filename,
          extractedData: extractedData
        });

        // Clean up file
        fs.unlinkSync(file.path);
      } catch (fileError) {
        console.error(`Error processing file ${file.filename}:`, fileError);
        errors.push({
          filename: file.filename,
          error: fileError.message
        });
        
        // Clean up file on error
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
    }

    res.json({
      message: `${processedDocuments.length} documents processed successfully`,
      successful: processedDocuments,
      errors: errors,
      totalProcessed: processedDocuments.length,
      totalErrors: errors.length
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
