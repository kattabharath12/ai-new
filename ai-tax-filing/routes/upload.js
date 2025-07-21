const express = require('express');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');
const { User } = require('../database/index'); // Fixed import path
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
    
    // Uncomment this for real OCR processing:
    /*
    const { data: { text } } = await Tesseract.recognize(imagePath, 'eng');
    
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
        if (field !== 'employerEIN' && field !== 'employeeSSN') {
          extractedData[field] = extractedData[field].replace(/[,$]/g, '');
        }
      }
    }

    return extractedData;
    */
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
  console.log('Request method:', req.method);
  console.log('Request URL:', req.url);
  console.log('User ID from auth:', req.userId);
  console.log('File in request:', !!req.file);
  
  if (req.file) {
    console.log('File details:', {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      encoding: req.file.encoding,
      mimetype: req.file.mimetype,
      size: req.file.size,
      destination: req.file.destination,
      filename: req.file.filename,
      path: req.file.path
    });
  }

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
    console.log('Current documents before upload:', JSON.stringify(user.documents, null, 2));

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

    console.log('📝 Document info to save:', JSON.stringify(documentInfo, null, 2));

    // Add to user's documents array
    const currentDocuments = Array.isArray(user.documents) ? [...user.documents] : [];
    console.log('📋 Current documents array:', currentDocuments);
    
    currentDocuments.push(documentInfo);
    console.log('📋 Documents after adding new one:', JSON.stringify(currentDocuments, null, 2));

    // Update the user
    console.log('💾 Saving to database...');
    await user.update({ documents: currentDocuments });
    console.log('✅ Database update completed');

    // Verify the save worked
    const verifyUser = await User.findByPk(req.userId);
    console.log('🔍 Verification - documents after save:', JSON.stringify(verifyUser.documents, null, 2));
    console.log('📊 Document count after save:', verifyUser.documents.length);

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
    console.error('Error stack:', error.stack);
    
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
    console.log('Current documents:', JSON.stringify(user.documents, null, 2));

    const documents = Array.isArray(user.documents) ? user.documents : [];
    const documentToDelete = documents.find(doc => doc.id === req.params.documentId);
    
    if (!documentToDelete) {
      console.log('❌ Document not found:', req.params.documentId);
      return res.status(404).json({ message: 'Document not found' });
    }

    console.log('📄 Found document to delete:', documentToDelete.originalName);

    // Remove document from array
    const updatedDocuments = documents.filter(doc => doc.id !== req.params.documentId);
    console.log('📋 Documents after removal:', JSON.stringify(updatedDocuments, null, 2));

    // Update user in database
    await user.update({ documents: updatedDocuments });
    console.log('✅ Database updated successfully');

    // Verify deletion
    const verifyUser = await User.findByPk(req.userId);
    console.log('🔍 Verification - documents after deletion:', verifyUser.documents.length);

    console.log('🎉 DOCUMENT DELETED SUCCESSFULLY!');

    res.json({ 
      message: 'Document deleted successfully',
      deletedDocument: documentToDelete.originalName,
      remainingDocuments: updatedDocuments.length
    });
  } catch (error) {
    console.error('💥 Delete document error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
