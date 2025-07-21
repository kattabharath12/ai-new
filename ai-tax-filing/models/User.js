// models/User.js - Complete PostgreSQL User Model
const pool = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  // Create new user
  static async create(userData) {
    const { email, password, firstName, lastName, phone } = userData;
    const hashedPassword = await bcrypt.hash(password, 12);
    
    const query = `
      INSERT INTO users (email, password, first_name, last_name, phone)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, email, first_name, last_name, phone, created_at
    `;
    
    const result = await pool.query(query, [email, hashedPassword, firstName, lastName, phone]);
    return result.rows[0];
  }

  // Find user by email
  static async findByEmail(email) {
    const query = 'SELECT * FROM users WHERE email = $1';
    const result = await pool.query(query, [email]);
    return result.rows[0];
  }

  // Find user by ID with all related data
  static async findById(id) {
    const query = `
      SELECT 
        u.*,
        ti.filing_status,
        ti.tax_classification,
        ti.ssn,
        ti.ein,
        ti.street_address,
        ti.city,
        ti.state,
        ti.zip_code,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', d.id,
              'name', d.name,
              'ssn', d.ssn,
              'relationship', d.relationship,
              'dateOfBirth', d.date_of_birth
            )
          ) FILTER (WHERE d.id IS NOT NULL), 
          '[]'
        ) as dependents,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', doc.id,
              'type', doc.document_type,
              'filename', doc.filename,
              'extractedData', doc.extracted_data,
              'uploadDate', doc.upload_date
            )
          ) FILTER (WHERE doc.id IS NOT NULL), 
          '[]'
        ) as documents,
        tr.form_1040_data as form1040,
        tr.status as tax_return_status,
        tr.submission_date,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', p.id,
              'amount', p.amount,
              'stripePaymentId', p.stripe_payment_id,
              'status', p.status,
              'date', p.created_at
            )
          ) FILTER (WHERE p.id IS NOT NULL), 
          '[]'
        ) as payments
      FROM users u
      LEFT JOIN tax_info ti ON u.id = ti.user_id
      LEFT JOIN dependents d ON u.id = d.user_id
      LEFT JOIN documents doc ON u.id = doc.user_id
      LEFT JOIN tax_returns tr ON u.id = tr.user_id
      LEFT JOIN payments p ON u.id = p.user_id
      WHERE u.id = $1
      GROUP BY u.id, ti.id, tr.id
    `;
    
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) return null;
    
    const user = result.rows[0];
    
    // Structure the data to match the original MongoDB format
    return {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      phone: user.phone,
      taxInfo: {
        filingStatus: user.filing_status,
        taxClassification: user.tax_classification,
        ssn: user.ssn,
        ein: user.ein,
        address: {
          street: user.street_address,
          city: user.city,
          state: user.state,
          zipCode: user.zip_code
        },
        dependents: user.dependents || []
      },
      documents: user.documents || [],
      taxReturn: {
        form1040: user.form1040,
        status: user.tax_return_status || 'draft',
        submissionDate: user.submission_date
      },
      payments: user.payments || [],
      createdAt: user.created_at,
      updatedAt: user.updated_at
    };
  }

  // Compare password
  static async comparePassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  // Update tax information (W-9 data)
  static async updateTaxInfo(userId, taxInfo) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Upsert tax info (insert or update if exists)
      const taxInfoQuery = `
        INSERT INTO tax_info (
          user_id, filing_status, tax_classification, ssn, ein, 
          street_address, city, state, zip_code
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          filing_status = EXCLUDED.filing_status,
          tax_classification = EXCLUDED.tax_classification,
          ssn = EXCLUDED.ssn,
          ein = EXCLUDED.ein,
          street_address = EXCLUDED.street_address,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          zip_code = EXCLUDED.zip_code,
          updated_at = CURRENT_TIMESTAMP
      `;
      
      await client.query(taxInfoQuery, [
        userId,
        taxInfo.filingStatus,
        taxInfo.taxClassification || 'individual',
        taxInfo.ssn,
        taxInfo.ein,
        taxInfo.address?.street,
        taxInfo.address?.city,
        taxInfo.address?.state,
        taxInfo.address?.zipCode
      ]);

      // Delete existing dependents and insert new ones
      await client.query('DELETE FROM dependents WHERE user_id = $1', [userId]);
      
      if (taxInfo.dependents && taxInfo.dependents.length > 0) {
        const dependentValues = taxInfo.dependents.map((dep, index) => 
          `($1, $${index * 4 + 2}, $${index * 4 + 3}, $${index * 4 + 4}, $${index * 4 + 5})`
        ).join(', ');
        
        const dependentQuery = `
          INSERT INTO dependents (user_id, name, ssn, relationship, date_of_birth)
          VALUES ${dependentValues}
        `;
        
        const dependentParams = [userId];
        taxInfo.dependents.forEach(dep => {
          dependentParams.push(
            dep.name, 
            dep.ssn, 
            dep.relationship, 
            dep.dateOfBirth || null
          );
        });
        
        await client.query(dependentQuery, dependentParams);
      }

      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Add document (W-2, etc.)
  static async addDocument(userId, documentData) {
    const query = `
      INSERT INTO documents (user_id, document_type, filename, extracted_data)
      VALUES ($1, $2, $3, $4)
      RETURNING id, document_type, filename, extracted_data, upload_date
    `;
    
    const result = await pool.query(query, [
      userId,
      documentData.type,
      documentData.filename,
      JSON.stringify(documentData.extractedData)
    ]);
    
    return result.rows[0];
  }

  // Update tax return (Form 1040)
  static async updateTaxReturn(userId, form1040Data) {
    const query = `
      INSERT INTO tax_returns (user_id, form_1040_data, status)
      VALUES ($1, $2, 'review')
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        form_1040_data = EXCLUDED.form_1040_data,
        status = EXCLUDED.status,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    
    const result = await pool.query(query, [userId, JSON.stringify(form1040Data)]);
    return result.rows[0];
  }

  // Submit tax return
  static async submitTaxReturn(userId) {
    const query = `
      UPDATE tax_returns 
      SET status = 'submitted', submission_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING *
    `;
    
    const result = await pool.query(query, [userId]);
    return result.rows[0];
  }

  // Add payment record
  static async addPayment(userId, paymentData) {
    const query = `
      INSERT INTO payments (user_id, amount, stripe_payment_id, status)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      userId,
      paymentData.amount,
      paymentData.stripePaymentId,
      paymentData.status
    ]);
    
    return result.rows[0];
  }

  // Get documents by type (e.g., 'w2')
  static async getDocumentsByType(userId, type) {
    const query = `
      SELECT * FROM documents 
      WHERE user_id = $1 AND document_type = $2 
      ORDER BY upload_date DESC
    `;
    
    const result = await pool.query(query, [userId, type]);
    return result.rows;
  }

  // Delete document
  static async deleteDocument(userId, documentId) {
    const query = `
      DELETE FROM documents 
      WHERE user_id = $1 AND id = $2
      RETURNING *
    `;
    
    const result = await pool.query(query, [userId, documentId]);
    return result.rows[0];
  }

  // Get user's payment history
  static async getPaymentHistory(userId) {
    const query = `
      SELECT * FROM payments 
      WHERE user_id = $1 
      ORDER BY created_at DESC
    `;
    
    const result = await pool.query(query, [userId]);
    return result.rows;
  }

  // Update user profile
  static async updateProfile(userId, profileData) {
    const { firstName, lastName, phone } = profileData;
    
    const query = `
      UPDATE users 
      SET first_name = $1, last_name = $2, phone = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING id, email, first_name, last_name, phone, updated_at
    `;
    
    const result = await pool.query(query, [firstName, lastName, phone, userId]);
    return result.rows[0];
  }

  // Check if user has completed tax info
  static async hasCompletedTaxInfo(userId) {
    const query = `
      SELECT COUNT(*) as count 
      FROM tax_info 
      WHERE user_id = $1 AND filing_status IS NOT NULL
    `;
    
    const result = await pool.query(query, [userId]);
    return result.rows[0].count > 0;
  }

  // Check if user has uploaded W-2
  static async hasUploadedW2(userId) {
    const query = `
      SELECT COUNT(*) as count 
      FROM documents 
      WHERE user_id = $1 AND document_type = 'w2'
    `;
    
    const result = await pool.query(query, [userId]);
    return result.rows[0].count > 0;
  }

  // Check if user has made payment
  static async hasCompletedPayment(userId) {
    const query = `
      SELECT COUNT(*) as count 
      FROM payments 
      WHERE user_id = $1 AND status = 'completed'
    `;
    
    const result = await pool.query(query, [userId]);
    return result.rows[0].count > 0;
  }

  // Get user progress summary
  static async getProgressSummary(userId) {
    const user = await this.findById(userId);
    if (!user) return null;

    const hasTaxInfo = user.taxInfo?.filingStatus ? true : false;
    const hasW2 = user.documents?.some(doc => doc.type === 'w2') || false;
    const hasForm1040 = user.taxReturn?.form1040 ? true : false;
    const hasPayment = user.payments?.some(payment => payment.status === 'completed') || false;
    const isSubmitted = user.taxReturn?.status === 'submitted';

    let currentStep = 1;
    if (hasTaxInfo && !hasW2) currentStep = 2;
    else if (hasTaxInfo && hasW2 && !hasForm1040) currentStep = 2;
    else if (hasTaxInfo && hasW2 && hasForm1040 && !hasPayment) currentStep = 3;
    else if (hasTaxInfo && hasW2 && hasForm1040 && hasPayment && !isSubmitted) currentStep = 5;
    else if (isSubmitted) currentStep = 6; // Completed

    return {
      currentStep,
      hasTaxInfo,
      hasW2,
      hasForm1040,
      hasPayment,
      isSubmitted,
      completionPercentage: Math.round((currentStep / 5) * 100)
    };
  }
}

// Add unique constraints if they don't exist (for deployment safety)
const addConstraintsIfNeeded = async () => {
  try {
    // These might fail if constraints already exist, which is fine
    await pool.query(`
      ALTER TABLE tax_info 
      ADD CONSTRAINT IF NOT EXISTS unique_user_tax_info 
      UNIQUE (user_id)
    `).catch(() => {}); // Ignore if constraint exists

    await pool.query(`
      ALTER TABLE tax_returns 
      ADD CONSTRAINT IF NOT EXISTS unique_user_tax_return 
      UNIQUE (user_id)
    `).catch(() => {}); // Ignore if constraint exists

  } catch (error) {
    // Constraints may already exist, ignore errors
  }
};

// Run constraint setup when model loads
addConstraintsIfNeeded();

module.exports = User;
