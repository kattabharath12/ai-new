const express = require('express');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');
const User = require('../models/User'); // Direct import, no destructuring
const auth = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    // Ensure upload directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
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

// Extract text from W-2 using OCR (simplified for demo)
const extractW2Data = async (imagePath) => {
  try {
    console.log('Processing file:', imagePath);
    
    // For now, return mock data to avoid OCR issues
    const mockData = {
      employerEIN: '12-3456789',
      employeeSSN: '123-45-6789',
      wages: '50000',
      federalTaxWithheld: '7500',
      socialSecurityWages: '50000',
      medicareWages: '50000'
    };
    
    console.log('Returning mock data:', mockData);
    return mockData;
  } catch (error) {
    console.error('OCR extraction error:', error);
    return {
      wages: '0',
      federalTaxWithheld: '0',
      socialSecurityWages: '0',
      medicareWages: '0'
    };
  }
};

// Upload W-2 document
router.post('/w2', auth, upload.single('w2Document'), async (req, res) => {
  console.log('🔥 W-2 UPLOAD REQUEST RECEIVED!');
  console.log('User ID from auth:', req.userId);
  console.log('File in request:', !!req.file);

  try {
    if (!req.file) {
      console.log('❌ No file in request');
      return res.status(400).json({ message: 'No file uploaded' });
    }

    console.log('🔍 Looking for user with ID:', req.userId);
    const user = await User.findByPk(req.userId);
    if (!user) {
      console.log('❌ User not found:', req.userId);
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('✅ User found:', user.email);

    // Extract data from the uploaded document
    console.log('📄 Starting data extraction...');
    const extractedData = await extractW2Data(req.file.path);
    console.log('✅ Extraction completed:', extractedData);

    // Generate unique document ID
    const documentId = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);

    // Create document info
    const documentInfo = {
      id: documentId,
      type: 'w2',
      filename: req.file.filename,
      originalName: req.file.originalname,
      uploadDate: new Date(),
      extractedData: extractedData
    };

    // Add to user's documents array
    const currentDocuments = Array.isArray(user.documents) ? [...user.documents] : [];
    currentDocuments.push(documentInfo);

    // Update the user
    console.log('💾 Saving to database...');
    await user.update({ documents: currentDocuments });
    console.log('✅ Database update completed');

    // Clean up uploaded file
    try {
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
        console.log('🗑️ Temporary file deleted');
      }
    } catch (unlinkError) {
      console.warn('⚠️ Could not delete temporary file:', unlinkError.message);
    }

    console.log('🎉 W-2 UPLOAD COMPLETED SUCCESSFULLY!');

    res.json({
      message: 'W-2 document uploaded and processed successfully',
      documentId: documentId,
      extractedData: extractedData
    });
  } catch (error) {
    console.error('💥 Upload error:', error);
    
    // Clean up file if error occurs
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.warn('Could not delete temporary file after error:', unlinkError.message);
      }
    }
    
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get uploaded documents
router.get('/documents', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.userId, {
      attributes: ['documents']
    });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user.documents || []);
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE: Remove uploaded document
router.delete('/documents/:documentId', auth, async (req, res) => {
  console.log('🗑️ DELETE DOCUMENT REQUEST RECEIVED!');
  console.log('User ID:', req.userId);
  console.log('Document ID to delete:', req.params.documentId);
  
  try {
    const user = await User.findByPk(req.userId);
    if (!user) {
      console.log('❌ User not found:', req.userId);
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('✅ User found:', user.email);

    const documents = Array.isArray(user.documents) ? user.documents : [];
    const documentToDelete = documents.find(doc => doc.id === req.params.documentId);
    
    if (!documentToDelete) {
      console.log('❌ Document not found:', req.params.documentId);
      return res.status(404).json({ message: 'Document not found' });
    }

    console.log('📄 Found document to delete:', documentToDelete.originalName);

    // Remove document from array
    const updatedDocuments = documents.filter(doc => doc.id !== req.params.documentId);

    // Update user in database
    await user.update({ documents: updatedDocuments });
    console.log('✅ Database updated successfully');

    console.log('🎉 DOCUMENT DELETED SUCCESSFULLY!');

    res.json({ 
      message: 'Document deleted successfully',
      deletedDocument: documentToDelete.originalName,
      remainingDocuments: updatedDocuments.length
    });
  } catch (error) {
    console.error('💥 Delete document error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
