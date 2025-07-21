// Global variables
let authToken = localStorage.getItem('authToken');
let currentStep = 1;
let stripe;
let cardElement;
let currentUser = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing...');
    
    // Initialize Stripe
    if (window.Stripe) {
        stripe = Stripe('pk_test_YOUR_ACTUAL_STRIPE_KEY_HERE'); // Replace with your real Stripe publishable key
    }
    
    if (authToken) {
        showDashboard();
        loadUserData();
    } else {
        showAuth();
    }

    initializeEventListeners();
});

// Event Listeners
function initializeEventListeners() {
    console.log('Setting up event listeners...');
    
    // Auth form toggles
    const showSignup = document.getElementById('showSignup');
    const showLogin = document.getElementById('showLogin');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (showSignup) {
        showSignup.addEventListener('click', () => toggleAuthForms('signup'));
    }
    
    if (showLogin) {
        showLogin.addEventListener('click', () => toggleAuthForms('login'));
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Auth forms
    const loginForm = document.getElementById('loginFormElement');
    const signupForm = document.getElementById('signupFormElement');
    
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    if (signupForm) {
        signupForm.addEventListener('submit', handleSignup);
    }

    // W-9/Tax info form
    const taxInfoForm = document.getElementById('taxInfoForm');
    const addDependentBtn = document.getElementById('addDependent');
    
    if (taxInfoForm) {
        taxInfoForm.addEventListener('submit', handleTaxInfoSubmit);
    }
    
    if (addDependentBtn) {
        addDependentBtn.addEventListener('click', addDependentFields);
    }

    // W-9 specific listeners
    const taxClassificationRadios = document.querySelectorAll('input[name="taxClassification"]');
    const w9SSN = document.getElementById('w9SSN');

    // Handle tax classification radio buttons
    taxClassificationRadios.forEach(radio => {
        radio.addEventListener('change', function(e) {
            console.log('Tax classification changed to:', e.target.value);
        });
    });
    
    // Format SSN input
    if (w9SSN) {
        w9SSN.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length > 3 && value.length <= 5) {
                value = `${value.slice(0, 3)}-${value.slice(3)}`;
            } else if (value.length > 5) {
                value = `${value.slice(0, 3)}-${value.slice(3, 5)}-${value.slice(5, 9)}`;
            }
            e.target.value = value;
        });
    }

    // File upload
    const uploadArea = document.getElementById('uploadArea');
    const w2Upload = document.getElementById('w2Upload');
    const continueToReview = document.getElementById('continueToReview');
    
    if (uploadArea) {
        uploadArea.addEventListener('click', () => document.getElementById('w2Upload').click());
    }
    
    if (w2Upload) {
        w2Upload.addEventListener('change', handleFileUpload);
    }
    
    if (continueToReview) {
        continueToReview.addEventListener('click', generateForm1098);
    }

    // Review and payment
    const editForm = document.getElementById('editForm');
    const proceedToPayment = document.getElementById('proceedToPayment');
    const submitPayment = document.getElementById('submitPayment');
    const finalSubmit = document.getElementById('finalSubmit');
    
    if (editForm) {
        editForm.addEventListener('click', enableFormEditing);
    }
    
    if (proceedToPayment) {
        proceedToPayment.addEventListener('click', () => showStep(4));
    }
    
    if (submitPayment) {
        submitPayment.addEventListener('click', handlePayment);
    }
    
    if (finalSubmit) {
        finalSubmit.addEventListener('click', handleFinalSubmission);
    }
}

// UI Functions
function showAuth() {
    const authSection = document.getElementById('authSection');
    const dashboardSection = document.getElementById('dashboardSection');
    const userEmail = document.getElementById('userEmail');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (authSection) authSection.classList.remove('hidden');
    if (dashboardSection) dashboardSection.classList.add('hidden');
    if (userEmail) userEmail.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
}

function showDashboard() {
    const authSection = document.getElementById('authSection');
    const dashboardSection = document.getElementById('dashboardSection');
    const userEmail = document.getElementById('userEmail');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (authSection) authSection.classList.add('hidden');
    if (dashboardSection) dashboardSection.classList.remove('hidden');
    if (userEmail) userEmail.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    
    if (currentUser) {
        const emailElement = document.getElementById('userEmail');
        if (emailElement) {
            emailElement.textContent = currentUser.email;
        }
    }
    
    showStep(1);
}

function toggleAuthForms(form) {
    console.log('Toggling to:', form);
    
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    
    if (form === 'signup') {
        if (loginForm) loginForm.classList.add('hidden');
        if (signupForm) signupForm.classList.remove('hidden');
    } else {
        if (signupForm) signupForm.classList.add('hidden');
        if (loginForm) loginForm.classList.remove('hidden');
    }
}

function showStep(step) {
    console.log('Showing step:', step);
    
    // Hide all steps
    const steps = ['taxInfoStep', 'uploadStep', 'reviewStep', 'paymentStep', 'submissionStep'];
    steps.forEach(stepId => {
        const element = document.getElementById(stepId);
        if (element) element.classList.add('hidden');
    });
    
    // Show current step
    const stepElements = {
        1: 'taxInfoStep',
        2: 'uploadStep',
        3: 'reviewStep',
        4: 'paymentStep',
        5: 'submissionStep'
    };
    
    const stepElement = document.getElementById(stepElements[step]);
    if (stepElement) {
        stepElement.classList.remove('hidden');
    }
    
    // Update step indicators
    for (let i = 1; i <= 5; i++) {
        const stepEl = document.getElementById(`step${i}`);
        if (stepEl) {
            // Clear existing classes
            stepEl.className = 'step';
            
            if (i < step) {
                stepEl.classList.add('completed');
            } else if (i === step) {
                stepEl.classList.add('active');
            } else {
                stepEl.classList.add('inactive');
            }
        }
    }
    
    currentStep = step;
    
    // Load documents when showing upload step
    if (step === 2) {
        loadUploadedDocuments();
    }
    
    // Initialize payment form when reaching payment step
    if (step === 4 && !cardElement && stripe) {
        initializePaymentForm();
    }
}

// Authentication Functions
async function handleLogin(e) {
    e.preventDefault();
    console.log('Login attempted');
    showLoading(true);
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('authToken', authToken);
            showDashboard();
            loadUserData();
            showAlert('Login successful!', 'success');
        } else {
            showAlert(data.message || 'Login failed', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showAlert('Login failed. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

async function handleSignup(e) {
    e.preventDefault();
    console.log('Signup attempted');
    showLoading(true);

    const userData = {
        firstName: document.getElementById('signupFirstName').value,
        lastName: document.getElementById('signupLastName').value,
        email: document.getElementById('signupEmail').value,
        phone: document.getElementById('signupPhone').value || '',
        password: document.getElementById('signupPassword').value
    };

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });

        const data = await response.json();

        if (response.ok) {
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('authToken', authToken);
            showDashboard();
            showAlert('Account created successfully!', 'success');
        } else {
            showAlert(data.message || 'Signup failed', 'error');
        }
    } catch (error) {
        console.error('Signup error:', error);
        showAlert('Signup failed. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

function handleLogout() {
    authToken = null;
    currentUser = null;
    currentStep = 1;
    localStorage.removeItem('authToken');
    showAuth();
    showAlert('Logged out successfully', 'success');
}

// W-9/Tax Information Functions
async function handleTaxInfoSubmit(e) {
    e.preventDefault();
    console.log('W-9 form submitted');
    showLoading(true);

    // Get selected tax classification from radio buttons
    const selectedClassification = document.querySelector('input[name="taxClassification"]:checked');
    
    // Validate that SSN is provided
    const ssn = document.getElementById('w9SSN')?.value || '';
    
    if (!ssn) {
        showAlert('Please provide your Social Security Number.', 'error');
        showLoading(false);
        return;
    }
    
    if (!selectedClassification) {
        showAlert('Please select a federal tax classification.', 'error');
        showLoading(false);
        return;
    }

    // Collect W-9 data
    const w9Data = {
        name: document.getElementById('w9Name')?.value || '',
        businessName: document.getElementById('w9BusinessName')?.value || '',
        federalTaxClassification: selectedClassification.value,
        address: document.getElementById('w9Address')?.value || '',
        city: document.getElementById('w9City')?.value || '',
        state: document.getElementById('w9State')?.value || '',
        zip: document.getElementById('w9Zip')?.value || '',
        ssn: ssn
    };

    // Collect traditional tax info
    const filingStatus = document.getElementById('filingStatus')?.value || '';
    const dependents = collectDependents();
    const address = {
        street: document.getElementById('w9Address')?.value || '',
        city: document.getElementById('w9City')?.value || '',
        state: document.getElementById('w9State')?.value || '',
        zipCode: document.getElementById('w9Zip')?.value || ''
    };

    try {
        const response = await fetch('/api/tax/info', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ 
                filingStatus, 
                dependents, 
                address,
                w9Data 
            })
        });

        const data = await response.json();

        if (response.ok) {
            showAlert('W-9 and tax information saved successfully!', 'success');
            showStep(2);
        } else {
            showAlert(data.message || 'Failed to save information', 'error');
        }
    } catch (error) {
        console.error('Form submission error:', error);
        showAlert('Failed to save information', 'error');
    } finally {
        showLoading(false);
    }
}

function addDependentFields() {
    console.log('Adding dependent fields');
    const container = document.getElementById('dependentsContainer');
    if (!container) return;
    
    const dependentIndex = container.children.length;
    
    const dependentDiv = document.createElement('div');
    dependentDiv.className = 'p-4 border border-gray-300 rounded-lg space-y-3 bg-white';
    dependentDiv.innerHTML = `
        <h6 class="font-medium text-gray-900">Dependent ${dependentIndex + 1}</h6>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input type="text" placeholder="Full Name" class="dependent-name rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border">
            <input type="text" placeholder="SSN (xxx-xx-xxxx)" class="dependent-ssn rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border">
            <input type="text" placeholder="Relationship" class="dependent-relationship rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border">
            <input type="date" placeholder="Date of Birth" class="dependent-dob rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border">
        </div>
        <button type="button" class="remove-dependent text-red-600 hover:text-red-800 text-sm">Remove Dependent</button>
    `;
    
    const removeBtn = dependentDiv.querySelector('.remove-dependent');
    removeBtn.addEventListener('click', function() {
        dependentDiv.remove();
    });
    
    container.appendChild(dependentDiv);
}

function collectDependents() {
    const dependents = [];
    const container = document.getElementById('dependentsContainer');
    if (!container) return dependents;
    
    container.querySelectorAll('div').forEach(div => {
        const name = div.querySelector('.dependent-name')?.value;
        const ssn = div.querySelector('.dependent-ssn')?.value;
        const relationship = div.querySelector('.dependent-relationship')?.value;
        const dateOfBirth = div.querySelector('.dependent-dob')?.value;
        
        if (name) {
            dependents.push({ name, ssn, relationship, dateOfBirth });
        }
    });
    return dependents;
}

// File Upload Functions
async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    console.log('File upload started');
    console.log('File details:', {
        name: file.name,
        size: file.size,
        type: file.type
    });

    showLoading(true);

    const formData = new FormData();
    formData.append('w2Document', file);

    try {
        const response = await fetch('/api/upload/w2', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });

        console.log('Upload response:', response.status);
        const data = await response.json();

        if (response.ok) {
            showAlert('W-2 uploaded and processed successfully!', 'success');
            displayUploadedDocument(file.name, data.extractedData, data.documentId);
            updateContinueButton();
        } else {
            showAlert(data.message || 'Upload failed', 'error');
        }
    } catch (error) {
        console.error('Upload error:', error);
        showAlert('Upload failed. Please try again.', 'error');
    } finally {
        showLoading(false);
        // Clear the file input
        e.target.value = '';
    }
}

function displayUploadedDocument(filename, extractedData, documentId) {
    const container = document.getElementById('uploadedDocs');
    if (!container) return;
    
    const docDiv = document.createElement('div');
    docDiv.className = 'p-4 bg-green-50 border border-green-200 rounded-lg';
    docDiv.setAttribute('data-document-id', documentId);
    docDiv.innerHTML = `
        <div class="flex items-center justify-between">
            <div class="flex-1">
                <h4 class="font-medium text-green-900">${filename}</h4>
                <p class="text-sm text-green-700">Processed successfully</p>
                ${extractedData.wages ? `<p class="text-xs text-green-600">Wages: $${extractedData.wages}</p>` : ''}
            </div>
            <div class="flex items-center space-x-2">
                <svg class="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <button onclick="deleteDocument('${documentId}', '${filename}')" 
                        class="text-red-600 hover:text-red-800 p-1 rounded transition-colors"
                        title="Delete document">
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                </button>
            </div>
        </div>
    `;
    container.appendChild(docDiv);
}

// Load uploaded documents when entering step 2
async function loadUploadedDocuments() {
    if (!authToken) return;
    
    try {
        const response = await fetch('/api/upload/documents', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const documents = await response.json();
            
            // Clear existing displayed documents
            const container = document.getElementById('uploadedDocs');
            if (container) {
                container.innerHTML = '';
            }
            
            // Display each document
            documents.forEach(doc => {
                if (doc.type === 'w2') {
                    displayUploadedDocument(doc.originalName || doc.filename, doc.extractedData, doc.id);
                }
            });
            
            updateContinueButton();
        }
    } catch (error) {
        console.error('Failed to load documents:', error);
    }
}

// Delete document function
async function deleteDocument(documentId, filename) {
    if (!confirm(`Are you sure you want to delete "${filename}"?`)) {
        return;
    }
    
    console.log('Deleting document:', documentId);
    showLoading(true);
    
    try {
        const response = await fetch(`/api/upload/documents/${documentId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Remove the document from UI
            const docElement = document.querySelector(`[data-document-id="${documentId}"]`);
            if (docElement) {
                docElement.remove();
            }
            
            updateContinueButton();
            showAlert(`Document "${filename}" deleted successfully!`, 'success');
        } else {
            showAlert(data.message || 'Failed to delete document', 'error');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showAlert('Failed to delete document. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// Update continue button based on uploaded documents
function updateContinueButton() {
    const continueBtn = document.getElementById('continueToReview');
    const uploadedDocs = document.getElementById('uploadedDocs');
    
    if (continueBtn && uploadedDocs) {
        const hasDocuments = uploadedDocs.children.length > 0;
        
        continueBtn.disabled = !hasDocuments;
        
        if (hasDocuments) {
            continueBtn.classList.remove('bg-gray-400');
            continueBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
        } else {
            continueBtn.classList.add('bg-gray-400');
            continueBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
        }
    }
}

// Form 1098 Generation and Display
async function generateForm1098() {
    console.log('Generating Form 1098...');
    showLoading(true);

    try {
        const response = await fetch('/api/tax/generate-1098', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();

        if (response.ok) {
            displayForm1098(data.form1098);
            showStep(3);
            showAlert('Form 1098 generated successfully!', 'success');
        } else {
            showAlert(data.message || 'Failed to generate form', 'error');
        }
    } catch (error) {
        console.error('Form generation error:', error);
        showAlert('Failed to generate form. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

function displayForm1098(formData) {
    console.log('Displaying Form 1098 with data:', formData);
    
    // Update taxpayer information
    const reviewName = document.getElementById('reviewName');
    const reviewSSN = document.getElementById('reviewSSN');
    const reviewFilingStatus = document.getElementById('reviewFilingStatus');
    
    if (reviewName) reviewName.textContent = formData.taxpayer.name || 'Not provided';
    if (reviewSSN) reviewSSN.textContent = formData.taxpayer.ssn || 'Not provided';
    if (reviewFilingStatus) {
        const statusMap = {
            'single': 'Single',
            'married-joint': 'Married Filing Jointly',
            'married-separate': 'Married Filing Separately',
            'head-of-household': 'Head of Household',
            'qualifying-widow': 'Qualifying Widow(er)'
        };
        reviewFilingStatus.textContent = statusMap[formData.filingStatus] || formData.filingStatus;
    }
    
    // Update income information
    const reviewWages = document.getElementById('reviewWages');
    const reviewFederalTax = document.getElementById('reviewFederalTax');
    const reviewSSWages = document.getElementById('reviewSSWages');
    const reviewMedicareWages = document.getElementById('reviewMedicareWages');
    
    if (reviewWages) reviewWages.textContent = `${formData.income.wages.toLocaleString()}`;
    if (reviewFederalTax) reviewFederalTax.textContent = `${formData.income.federalTaxWithheld.toLocaleString()}`;
    if (reviewSSWages) reviewSSWages.textContent = `${formData.income.socialSecurityWages.toLocaleString()}`;
    if (reviewMedicareWages) reviewMedicareWages.textContent = `${formData.income.medicareWages.toLocaleString()}`;
    
    // Update deductions
    const reviewStandardDeduction = document.getElementById('reviewStandardDeduction');
    const reviewItemizedDeductions = document.getElementById('reviewItemizedDeductions');
    
    if (reviewStandardDeduction) reviewStandardDeduction.textContent = `${formData.deductions.standardDeduction.toLocaleString()}`;
    if (reviewItemizedDeductions) reviewItemizedDeductions.textContent = `${formData.deductions.itemizedDeductions.toLocaleString()}`;
    
    // Update dependents
    const reviewDependents = document.getElementById('reviewDependents');
    if (reviewDependents) {
        if (formData.dependents && formData.dependents.length > 0) {
            reviewDependents.textContent = `${formData.dependents.length} dependent(s) claimed`;
        } else {
            reviewDependents.textContent = 'No dependents claimed';
        }
    }
    
    // Calculate and display tax amount
    const taxLiability = calculateTaxLiability(formData);
    const refundOrOwed = formData.income.federalTaxWithheld - taxLiability;
    
    const reviewTaxAmount = document.getElementById('reviewTaxAmount');
    if (reviewTaxAmount) {
        if (refundOrOwed >= 0) {
            reviewTaxAmount.textContent = `${Math.abs(refundOrOwed).toLocaleString()} Refund`;
            reviewTaxAmount.style.color = '#27ae60';
        } else {
            reviewTaxAmount.textContent = `${Math.abs(refundOrOwed).toLocaleString()} Owed`;
            reviewTaxAmount.style.color = '#e74c3c';
        }
    }
}

function calculateTaxLiability(formData) {
    const taxableIncome = Math.max(0, formData.income.wages - formData.deductions.standardDeduction);
    
    // 2023 tax brackets for single filers
    if (taxableIncome <= 11000) {
        return Math.round(taxableIncome * 0.10);
    } else if (taxableIncome <= 44725) {
        return Math.round(1100 + (taxableIncome - 11000) * 0.12);
    } else if (taxableIncome <= 95375) {
        return Math.round(5147 + (taxableIncome - 44725) * 0.22);
    } else if (taxableIncome <= 182050) {
        return Math.round(16290 + (taxableIncome - 95375) * 0.24);
    } else if (taxableIncome <= 231250) {
        return Math.round(37104 + (taxableIncome - 182050) * 0.32);
    } else if (taxableIncome <= 578125) {
        return Math.round(52832 + (taxableIncome - 231250) * 0.35);
    } else {
        return Math.round(174238 + (taxableIncome - 578125) * 0.37);
    }
}

// Payment Functions
function initializePaymentForm() {
    if (!stripe) {
        console.log('Stripe not loaded');
        return;
    }
    
    const elements = stripe.elements();
    cardElement = elements.create('card');
    cardElement.mount('#card-element');

    cardElement.on('change', function(event) {
        const displayError = document.getElementById('card-errors');
        if (displayError) {
            if (event.error) {
                displayError.textContent = event.error.message;
            } else {
                displayError.textContent = '';
            }
        }
    });
}

async function handlePayment() {
    if (!stripe || !cardElement) {
        showAlert('Payment system not properly initialized. Please refresh the page.', 'error');
        return;
    }

    showLoading(true);

    try {
        // Create payment intent
        const intentResponse = await fetch('/api/payment/create-intent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ amount: 4999 })
        });

        const intentData = await intentResponse.json();

        if (!intentResponse.ok) {
            throw new Error(intentData.message);
        }

        // Confirm payment with Stripe
        const { error, paymentIntent } = await stripe.confirmCardPayment(intentData.clientSecret, {
            payment_method: {
                card: cardElement,
                billing_details: {
                    name: `${currentUser.firstName} ${currentUser.lastName}`,
                    email: currentUser.email
                }
            }
        });

        if (error) {
            showAlert(error.message, 'error');
        } else {
            // Confirm payment on backend
            const confirmResponse = await fetch('/api/payment/confirm', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    paymentIntentId: paymentIntent.id,
                    amount: 4999
                })
            });

            const confirmData = await confirmResponse.json();

            if (confirmResponse.ok) {
                showAlert('Payment successful!', 'success');
                showStep(5);
            } else {
                showAlert(confirmData.message || 'Payment confirmation failed', 'error');
            }
        }
    } catch (error) {
        console.error('Payment error:', error);
        showAlert('Payment failed. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// Final Submission
async function handleFinalSubmission() {
    showLoading(true);

    try {
        const response = await fetch('/api/tax/submit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();

        if (response.ok) {
            const submissionStep = document.getElementById('submissionStep');
            const successMessage = document.getElementById('successMessage');
            const submissionId = document.getElementById('submissionId');
            
            if (submissionStep) submissionStep.classList.add('hidden');
            if (successMessage) successMessage.classList.remove('hidden');
            if (submissionId) submissionId.textContent = generateSubmissionId();
            
            showAlert('Tax return submitted successfully!', 'success');
        } else {
            showAlert(data.message || 'Submission failed', 'error');
        }
    } catch (error) {
        console.error('Submission error:', error);
        showAlert('Submission failed. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// Utility Functions
async function loadUserData() {
    if (!authToken) return;
    
    try {
        const response = await fetch('/api/auth/me', {
           headers: {
               'Authorization': `Bearer ${authToken}`
           }
       });

       if (response.ok) {
           const userData = await response.json();
           currentUser = userData;
           
           if (userData.taxInfo) {
               populateTaxInfoForm(userData.taxInfo);
           }
       }
   } catch (error) {
       console.error('Failed to load user data:', error);
   }
}

function populateTaxInfoForm(taxInfo) {
   if (taxInfo.w9) {
       const w9 = taxInfo.w9;
       
       const fields = [
           { id: 'w9Name', value: w9.name },
           { id: 'w9BusinessName', value: w9.businessName },
           { id: 'w9Address', value: w9.address },
           { id: 'w9City', value: w9.city },
           { id: 'w9State', value: w9.state },
           { id: 'w9Zip', value: w9.zip },
           { id: 'w9SSN', value: w9.ssn }
       ];
       
       fields.forEach(field => {
           const element = document.getElementById(field.id);
           if (element && field.value) {
               element.value = field.value;
           }
       });

       if (w9.federalTaxClassification) {
           const radioButton = document.querySelector(`input[name="taxClassification"][value="${w9.federalTaxClassification}"]`);
           if (radioButton) {
               radioButton.checked = true;
           }
       }
   }
   
   if (taxInfo.filingStatus) {
       const filingStatusEl = document.getElementById('filingStatus');
       if (filingStatusEl) filingStatusEl.value = taxInfo.filingStatus;
   }
   
   if (taxInfo.dependents && taxInfo.dependents.length > 0) {
       taxInfo.dependents.forEach(() => addDependentFields());
       const dependentDivs = document.getElementById('dependentsContainer')?.children;
       if (dependentDivs) {
           taxInfo.dependents.forEach((dependent, index) => {
               if (dependentDivs[index]) {
                   const div = dependentDivs[index];
                   const nameField = div.querySelector('.dependent-name');
                   const ssnField = div.querySelector('.dependent-ssn');
                   const relationshipField = div.querySelector('.dependent-relationship');
                   const dobField = div.querySelector('.dependent-dob');
                   
                   if (nameField) nameField.value = dependent.name || '';
                   if (ssnField) ssnField.value = dependent.ssn || '';
                   if (relationshipField) relationshipField.value = dependent.relationship || '';
                   if (dobField) dobField.value = dependent.dateOfBirth || '';
               }
           });
       }
   }
}

function showLoading(show) {
   const spinner = document.getElementById('loadingSpinner');
   if (spinner) {
       spinner.classList.toggle('hidden', !show);
   }
}

function showAlert(message, type = 'info') {
   console.log(`Alert (${type}):`, message);
   
   const alertDiv = document.createElement('div');
   alertDiv.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 ${
       type === 'success' ? 'bg-green-500 text-white' :
       type === 'error' ? 'bg-red-500 text-white' :
       type === 'warning' ? 'bg-yellow-500 text-black' :
       'bg-blue-500 text-white'
   }`;
   alertDiv.textContent = message;
   
   document.body.appendChild(alertDiv);
   
   setTimeout(() => {
       if (alertDiv.parentNode) {
           alertDiv.parentNode.removeChild(alertDiv);
       }
   }, 5000);
}

function enableFormEditing() {
   showAlert('Form editing enabled. You can modify the values above.', 'info');
   // You can add actual form editing logic here
   showStep(1); // Go back to step 1 for editing
}

function generateSubmissionId() {
   return 'TX' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 5).toUpperCase();
}

// Additional helper functions for debugging
function debugUser() {
    console.log('Current User:', currentUser);
    console.log('Auth Token:', authToken ? 'Present' : 'Missing');
    console.log('Current Step:', currentStep);
}

// Call this if you need to debug
// debugUser();
