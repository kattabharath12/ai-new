// script.js - Fixed Navigation Version
let authToken = localStorage.getItem('authToken');
let currentStep = 1;
let stripe;
let cardElement;
let currentUser = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Initializing AI Tax Filing App...');
    
    // Initialize Stripe - REPLACE WITH YOUR ACTUAL KEY
    try {
        stripe = Stripe('pk_test_your_actual_stripe_publishable_key_here');
        console.log('✅ Stripe initialized');
    } catch (error) {
        console.error('❌ Stripe initialization failed:', error);
    }
    
    // Check authentication and show appropriate section
    if (authToken) {
        console.log('👤 User authenticated, loading dashboard...');
        showDashboard();
        loadUserData();
    } else {
        console.log('🔐 No authentication, showing login...');
        showAuth();
    }

    // Initialize all event listeners
    initializeEventListeners();
    
    // Add W-9 fields after DOM loads
    setTimeout(() => {
        if (document.getElementById('taxInfoForm')) {
            addW9Fields();
            console.log('📝 W-9 fields added');
        }
    }, 100);
    
    console.log('✅ App initialization complete');
});

// Event Listeners Setup
function initializeEventListeners() {
    console.log('🎧 Setting up event listeners...');
    
    try {
        // Auth forms
        document.getElementById('loginFormElement')?.addEventListener('submit', handleLogin);
        document.getElementById('signupFormElement')?.addEventListener('submit', handleSignup);
        document.getElementById('showSignup')?.addEventListener('click', () => toggleAuthForms('signup'));
        document.getElementById('showLogin')?.addEventListener('click', () => toggleAuthForms('login'));
        document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);

        // W-9 Tax info form (Step 1)
        document.getElementById('taxInfoForm')?.addEventListener('submit', handleW9Submit);
        document.getElementById('addDependent')?.addEventListener('click', addDependentFields);

        // File upload (Step 2)
        document.getElementById('uploadArea')?.addEventListener('click', () => {
            document.getElementById('w2Upload')?.click();
        });
        document.getElementById('w2Upload')?.addEventListener('change', handleFileUpload);
        document.getElementById('continueToReview')?.addEventListener('click', generateForm1040);

        // Review and payment (Steps 3-4)
        document.getElementById('editForm')?.addEventListener('click', enableFormEditing);
        document.getElementById('proceedToPayment')?.addEventListener('click', () => {
            console.log('👆 Proceed to payment clicked');
            showStep(4);
        });
        document.getElementById('submitPayment')?.addEventListener('click', handlePayment);
        document.getElementById('finalSubmit')?.addEventListener('click', handleFinalSubmission);
        
        // Add navigation buttons if they exist
        const nextButtons = document.querySelectorAll('[data-next-step]');
        const prevButtons = document.querySelectorAll('[data-prev-step]');
        
        nextButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const nextStep = parseInt(e.target.getAttribute('data-next-step'));
                console.log('➡️ Next button clicked, going to step:', nextStep);
                showStep(nextStep);
            });
        });
        
        prevButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const prevStep = parseInt(e.target.getAttribute('data-prev-step'));
                console.log('⬅️ Previous button clicked, going to step:', prevStep);
                showStep(prevStep);
            });
        });

        console.log('✅ Event listeners set up successfully');
    } catch (error) {
        console.error('❌ Error setting up event listeners:', error);
    }
}

// Authentication Functions
async function handleLogin(e) {
    e.preventDefault();
    console.log('🔐 Login attempt...');
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
            console.log('✅ Login successful');
            showDashboard();
            loadUserData();
        } else {
            console.error('❌ Login failed:', data.message);
            showAlert(data.message || 'Login failed', 'error');
        }
    } catch (error) {
        console.error('❌ Login error:', error);
        showAlert('Login failed. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

async function handleSignup(e) {
    e.preventDefault();
    console.log('📝 Signup attempt...');
    showLoading(true);

    const userData = {
        firstName: document.getElementById('signupFirstName').value,
        lastName: document.getElementById('signupLastName').value,
        email: document.getElementById('signupEmail').value,
        phone: document.getElementById('signupPhone').value,
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
            console.log('✅ Signup successful');
            showDashboard();
            showAlert('Account created successfully!', 'success');
        } else {
            console.error('❌ Signup failed:', data.message);
            showAlert(data.message || 'Signup failed', 'error');
        }
    } catch (error) {
        console.error('❌ Signup error:', error);
        showAlert('Signup failed. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

function handleLogout() {
    console.log('👋 Logging out...');
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    currentStep = 1;
    showAuth();
    showAlert('Logged out successfully', 'success');
}

// UI Navigation Functions
function showAuth() {
    console.log('🔐 Showing auth section');
    document.getElementById('authSection')?.classList.remove('hidden');
    document.getElementById('dashboardSection')?.classList.add('hidden');
    document.getElementById('userEmail')?.classList.add('hidden');
    document.getElementById('logoutBtn')?.classList.add('hidden');
}

function showDashboard() {
    console.log('📊 Showing dashboard');
    document.getElementById('authSection')?.classList.add('hidden');
    document.getElementById('dashboardSection')?.classList.remove('hidden');
    document.getElementById('userEmail')?.classList.remove('hidden');
    document.getElementById('logoutBtn')?.classList.remove('hidden');
    
    if (currentUser) {
        const userEmailEl = document.getElementById('userEmail');
        if (userEmailEl) {
            userEmailEl.textContent = currentUser.email;
        }
    }
    
    updateStepLabels();
    
    // Show the current step
    showStep(currentStep);
}

function updateStepLabels() {
    const stepLabels = document.querySelector('.mt-2.flex.justify-between');
    if (stepLabels) {
        stepLabels.innerHTML = `
            <span>W-9 Info</span>
            <span>Upload W-2</span>
            <span>Review 1040</span>
            <span>Payment</span>
            <span>Submit</span>
        `;
    }
}

function toggleAuthForms(form) {
    console.log('🔄 Toggling auth form to:', form);
    if (form === 'signup') {
        document.getElementById('loginForm')?.classList.add('hidden');
        document.getElementById('signupForm')?.classList.remove('hidden');
    } else {
        document.getElementById('signupForm')?.classList.add('hidden');
        document.getElementById('loginForm')?.classList.remove('hidden');
    }
}

// MAIN NAVIGATION FUNCTION - This is crucial!
function showStep(step) {
    console.log(`📍 Navigating to step ${step} (current: ${currentStep})`);
    
    // Validate step number
    if (step < 1 || step > 5) {
        console.error('❌ Invalid step number:', step);
        return;
    }
    
    // Hide all step sections first
    const stepElements = ['taxInfoStep', 'uploadStep', 'reviewStep', 'paymentStep', 'submissionStep'];
    
    stepElements.forEach(elementId => {
        const element = document.getElementById(elementId);
        if (element) {
            element.classList.add('hidden');
        }
    });
    
    // Show the target step
    const targetSteps = {
        1: 'taxInfoStep',
        2: 'uploadStep',
        3: 'reviewStep',
        4: 'paymentStep',
        5: 'submissionStep'
    };
    
    const targetElement = document.getElementById(targetSteps[step]);
    if (targetElement) {
        targetElement.classList.remove('hidden');
        console.log(`✅ Step ${step} (${targetSteps[step]}) is now visible`);
    } else {
        console.error(`❌ Step element not found: ${targetSteps[step]}`);
    }
    
    // Update step indicators
    for (let i = 1; i <= 5; i++) {
        const stepEl = document.getElementById(`step${i}`);
        if (stepEl) {
            let className = 'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ';
            
            if (i < step) {
                className += 'step-completed';
            } else if (i === step) {
                className += 'step-active';
            } else {
                className += 'step-inactive';
            }
            
            stepEl.className = className;
        }
    }
    
    currentStep = step;
    
    // Initialize payment form when reaching payment step
    if (step === 4 && !cardElement) {
        console.log('💳 Initializing payment form...');
        initializePaymentForm();
    }
    
    // Scroll to top when changing steps
    window.scrollTo(0, 0);
}

// Add manual navigation buttons (call this after DOM loads)
function addNavigationButtons() {
    const steps = document.querySelectorAll('[id$="Step"]');
    
    steps.forEach((stepElement, index) => {
        const stepNumber = index + 1;
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'flex justify-between mt-6 pt-6 border-t';
        
        // Previous button (except for step 1)
        if (stepNumber > 1) {
            const prevBtn = document.createElement('button');
            prevBtn.textContent = 'Previous';
            prevBtn.className = 'px-6 py-2 border border-gray-300 rounded-md hover:bg-gray-50';
            prevBtn.onclick = () => showStep(stepNumber - 1);
            buttonContainer.appendChild(prevBtn);
        } else {
            buttonContainer.appendChild(document.createElement('div')); // Spacer
        }
        
        // Next button (except for step 5)
        if (stepNumber < 5) {
            const nextBtn = document.createElement('button');
            nextBtn.textContent = 'Next';
            nextBtn.className = 'px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700';
            nextBtn.onclick = () => showStep(stepNumber + 1);
            buttonContainer.appendChild(nextBtn);
        }
        
        // Only add if not already present
        if (!stepElement.querySelector('.flex.justify-between')) {
            stepElement.appendChild(buttonContainer);
        }
    });
}

// Test navigation function (for debugging)
window.testNavigation = function() {
    console.log('🧪 Testing navigation...');
    showStep(1);
    setTimeout(() => showStep(2), 1000);
    setTimeout(() => showStep(3), 2000);
    setTimeout(() => showStep(4), 3000);
    setTimeout(() => showStep(5), 4000);
    setTimeout(() => showStep(1), 5000);
};

// W-9 Tax Information Functions (Step 1)
async function handleW9Submit(e) {
    e.preventDefault();
    console.log('📝 Submitting W-9 form...');
    showLoading(true);

    const filingStatus = document.getElementById('filingStatus')?.value;
    const dependents = collectDependents();
    const address = {
        street: document.getElementById('addressStreet')?.value || '',
        city: document.getElementById('addressCity')?.value || '',
        state: document.getElementById('addressState')?.value || '',
        zipCode: document.getElementById('addressZip')?.value || ''
    };

    const w9Data = {
        filingStatus,
        dependents,
        address,
        taxClassification: document.getElementById('taxClassification')?.value || 'individual',
        ssn: document.getElementById('taxpayerSSN')?.value || '',
        ein: document.getElementById('taxpayerEIN')?.value || ''
    };

    try {
        const response = await fetch('/api/tax/info', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(w9Data)
        });

        const data = await response.json();

        if (response.ok) {
            console.log('✅ W-9 form saved successfully');
            showAlert('W-9 tax information saved successfully!', 'success');
            showStep(2); // Navigate to next step
        } else {
            console.error('❌ W-9 save failed:', data.message);
            showAlert(data.message || 'Failed to save tax information', 'error');
        }
    } catch (error) {
        console.error('❌ W-9 submit error:', error);
        showAlert('Failed to save tax information', 'error');
    } finally {
        showLoading(false);
    }
}

// File Upload Functions (Step 2)
async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    console.log('📁 Uploading file:', file.name);
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

        const data = await response.json();

        if (response.ok) {
            console.log('✅ File uploaded successfully');
            showAlert('W-2 uploaded and processed successfully!', 'success');
            displayUploadedDocument(file.name, data.extractedData);
            
            const continueBtn = document.getElementById('continueToReview');
            if (continueBtn) {
                continueBtn.disabled = false;
                continueBtn.textContent = 'Generate Form 1040';
            }
        } else {
            console.error('❌ Upload failed:', data.message);
            showAlert(data.message || 'Upload failed', 'error');
        }
    } catch (error) {
        console.error('❌ Upload error:', error);
        showAlert('Upload failed. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

function displayUploadedDocument(filename, extractedData) {
    const container = document.getElementById('uploadedDocs');
    if (!container) return;
    
    const docDiv = document.createElement('div');
    docDiv.className = 'p-4 bg-green-50 border border-green-200 rounded-lg';
    docDiv.innerHTML = `
        <div class="flex items-center justify-between">
            <div>
                <h4 class="font-medium text-green-900">${filename}</h4>
                <p class="text-sm text-green-700">Processed successfully</p>
                ${extractedData.wages ? `<p class="text-xs text-green-600">Wages: $${parseFloat(extractedData.wages).toLocaleString()}</p>` : ''}
                ${extractedData.federalTaxWithheld ? `<p class="text-xs text-green-600">Federal Tax Withheld: $${parseFloat(extractedData.federalTaxWithheld).toLocaleString()}</p>` : ''}
            </div>
            <svg class="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
        </div>
    `;
    container.appendChild(docDiv);
}

// Form 1040 Generation (Step 3)
async function generateForm1040() {
    console.log('📋 Generating Form 1040...');
    showLoading(true);

    try {
        const response = await fetch('/api/tax/generate-1040', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();

        if (response.ok) {
            console.log('✅ Form 1040 generated successfully');
            displayForm1040(data.form1040);
            showStep(3); // Navigate to review step
            showAlert('Form 1040 generated successfully!', 'success');
            
            // Update step title
            const reviewTitle = document.querySelector('#reviewStep h3');
            if (reviewTitle) {
                reviewTitle.textContent = 'Review Your Tax Return (Form 1040)';
            }
        } else {
            console.error('❌ Form generation failed:', data.message);
            showAlert(data.message || 'Failed to generate form', 'error');
        }
    } catch (error) {
        console.error('❌ Form generation error:', error);
        showAlert('Failed to generate form', 'error');
    } finally {
        showLoading(false);
    }
}

// Helper Functions
function addDependentFields() {
    const container = document.getElementById('dependentsContainer');
    if (!container) return;
    
    const dependentIndex = container.children.length;
    
    const dependentDiv = document.createElement('div');
    dependentDiv.className = 'p-4 border rounded-lg space-y-3';
    dependentDiv.innerHTML = `
        <h5 class="font-medium text-gray-900">Dependent ${dependentIndex + 1}</h5>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input type="text" placeholder="Full Name" class="dependent-name rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border">
            <input type="text" placeholder="SSN (xxx-xx-xxxx)" class="dependent-ssn rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border" oninput="formatSSNInput(this)">
            <input type="text" placeholder="Relationship" class="dependent-relationship rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border">
            <input type="date" placeholder="Date of Birth" class="dependent-dob rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border">
        </div>
        <button type="button" onclick="this.parentElement.remove()" class="text-red-600 hover:text-red-800 text-sm">Remove Dependent</button>
    `;
    
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

// Load existing user data
async function loadUserData() {
    try {
        console.log('👤 Loading user data...');
        const response = await fetch('/api/auth/me', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const userData = await response.json();
            currentUser = userData;
            console.log('✅ User data loaded');
            
            // Pre-fill forms with existing data
            if (userData.taxInfo) {
                populateTaxInfoForm(userData.taxInfo);
            }
            
            // Determine current step based on progress
            determineCurrentStep(userData);
        }
    } catch (error) {
        console.error('❌ Failed to load user data:', error);
    }
}

function determineCurrentStep(userData) {
    console.log('🎯 Determining current step from user data...');
    
    if (!userData.taxInfo || !userData.taxInfo.filingStatus) {
        console.log('📍 Starting at step 1 - no tax info');
        showStep(1);
    } else if (!userData.documents || userData.documents.filter(doc => doc.type === 'w2').length === 0) {
        console.log('📍 Starting at step 2 - no W-2 documents');
        showStep(2);
    } else if (!userData.taxReturn || !userData.taxReturn.form1040) {
        console.log('📍 Starting at step 2 - no Form 1040');
        showStep(2);
    } else if (!userData.payments || userData.payments.length === 0) {
        console.log('📍 Starting at step 3 - no payments');
        showStep(3);
    } else if (userData.taxReturn.status === 'draft' || userData.taxReturn.status === 'review') {
        console.log('📍 Starting at step 5 - ready to submit');
        showStep(5);
    } else {
        console.log('📍 Tax return already submitted - showing completion');
        showCompletedStatus(userData);
    }
}

// Add W-9 specific fields
function addW9Fields() {
    const taxInfoForm = document.getElementById('taxInfoForm');
    const existingFields = taxInfoForm?.querySelector('.space-y-6');
    
    if (!existingFields || document.getElementById('taxClassification')) {
        return; // Already added or form not found
    }
    
    // Add the W-9 fields HTML (same as before)
    const taxClassificationHTML = `
        <div class="bg-blue-50 p-4 rounded-lg">
            <h4 class="text-lg font-medium text-gray-900 mb-4">Tax Classification (W-9 Information)</h4>
            <div class="space-y-3">
                <label class="block text-sm font-medium text-gray-700">Federal Tax Classification</label>
                <select id="taxClassification" class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3 border">
                    <option value="individual">Individual/sole proprietor or single-member LLC</option>
                    <option value="c-corp">C Corporation</option>
                    <option value="s-corp">S Corporation</option>
                    <option value="partnership">Partnership</option>
                    <option value="trust">Trust/estate</option>
                    <option value="llc">Limited liability company</option>
                    <option value="other">Other</option>
                </select>
            </div>
        </div>
    `;

    const tinHTML = `
        <div class="bg-yellow-50 p-4 rounded-lg">
            <h4 class="text-lg font-medium text-gray-900 mb-4">Taxpayer Identification Numbers</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700">Social Security Number (SSN)</label>
                    <input type="text" id="taxpayerSSN" placeholder="XXX-XX-XXXX" maxlength="11"
                           class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3 border"
                           oninput="formatSSNInput(this)">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">Employer Identification Number (EIN)</label>
                    <input type="text" id="taxpayerEIN" placeholder="XX-XXXXXXX" maxlength="10"
                           class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-3 border"
                           oninput="formatEINInput(this)">
                </div>
            </div>
            <p class="text-xs text-gray-600 mt-2">
                For individuals, enter your SSN. For businesses, enter your EIN. At least one is required.
            </p>
        </div>
    `;
    
    // Insert before the dependents section
    const dependentsSection = existingFields.querySelector('div:has(#dependentsContainer)')?.parentElement;
    if (dependentsSection) {
        const classificationDiv = document.createElement('div');
        classificationDiv.innerHTML = taxClassificationHTML;
        existingFields.insertBefore(classificationDiv.firstElementChild, dependentsSection);
        
        const tinDiv = document.createElement('div');
        tinDiv.innerHTML = tinHTML;
        existingFields.insertBefore(tinDiv.firstElementChild, dependentsSection);
    }
}

// Formatting functions
function formatSSNInput(input) {
    let value = input.value.replace(/\D/g, '');
    if (value.length >= 6) {
        value = value.substring(0, 3) + '-' + value.substring(3, 5) + '-' + value.substring(5, 9);
    } else if (value.length >= 4) {
        value = value.substring(0, 3) + '-' + value.substring(3);
    }
    input.value = value;
}

function formatEINInput(input) {
    let value = input.value.replace(/\D/g, '');
    if (value.length >= 3) {
        value = value.substring(0, 2) + '-' + value.substring(2, 9);
    }
    input.value = value;
}

// Utility Functions
function showLoading(show) {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) {
        spinner.classList.toggle('hidden', !show);
    }
}

function showAlert(message, type = 'info') {
    console.log(`📢 ${type.toUpperCase()}: ${message}`);
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 max-w-md ${
        type === 'success' ? 'bg-green-500 text-white' :
        type === 'error' ? 'bg-red-500 text-white' :
        type === 'warning' ? 'bg-yellow-500 text-black' :
        'bg-blue-500 text-white'
    }`;
    alertDiv.innerHTML = `
        <div class="flex items-center justify-between">
            <span class="text-sm font-medium">${message}</span>
            <button onclick="this.parentElement.parentElement.remove()" class="ml-4 text-white hover:text-gray-200">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </button>
        </div>
    `;
    
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.parentNode.removeChild(alertDiv);
        }
    }, 5000);
}

// Export functions for global access (for inline event handlers)
window.formatSSNInput = formatSSNInput;
window.formatEINInput = formatEINInput;
window.showStep = showStep; // Make sure this is globally accessible

// Debug functions
window.debugNavigation = function() {
    console.log('Current step:', currentStep);
    console.log('Auth token:', authToken ? 'Present' : 'Missing');
    console.log('Current user:', currentUser);
    
    // Check if all step elements exist
    const stepElements = ['taxInfoStep', 'uploadStep', 'reviewStep', 'paymentStep', 'submissionStep'];
    stepElements.forEach((id, index) => {
        const element = document.getElementById(id);
        console.log(`Step ${index + 1} (${id}):`, element ? 'Found' : 'Missing');
    });
};

// Additional missing functions to complete the implementation

function populateTaxInfoForm(taxInfo) {
    if (taxInfo.filingStatus) {
        const filingStatusEl = document.getElementById('filingStatus');
        if (filingStatusEl) filingStatusEl.value = taxInfo.filingStatus;
    }
    
    if (taxInfo.address) {
        const addressStreetEl = document.getElementById('addressStreet');
        const addressCityEl = document.getElementById('addressCity');
        const addressStateEl = document.getElementById('addressState');
        const addressZipEl = document.getElementById('addressZip');
        
        if (addressStreetEl) addressStreetEl.value = taxInfo.address.street || '';
        if (addressCityEl) addressCityEl.value = taxInfo.address.city || '';
        if (addressStateEl) addressStateEl.value = taxInfo.address.state || '';
        if (addressZipEl) addressZipEl.value = taxInfo.address.zipCode || '';
    }

    // Populate W-9 specific fields
    if (taxInfo.taxClassification) {
        const taxClassificationEl = document.getElementById('taxClassification');
        if (taxClassificationEl) taxClassificationEl.value = taxInfo.taxClassification;
    }
    
    if (taxInfo.ssn) {
        const taxpayerSSNEl = document.getElementById('taxpayerSSN');
        if (taxpayerSSNEl) taxpayerSSNEl.value = taxInfo.ssn;
    }
    
    if (taxInfo.ein) {
        const taxpayerEINEl = document.getElementById('taxpayerEIN');
        if (taxpayerEINEl) taxpayerEINEl.value = taxInfo.ein;
    }
    
    if (taxInfo.dependents && taxInfo.dependents.length > 0) {
        taxInfo.dependents.forEach(() => addDependentFields());
        // Populate dependent fields
        const dependentDivs = document.getElementById('dependentsContainer')?.children;
        if (dependentDivs) {
            taxInfo.dependents.forEach((dependent, index) => {
                if (dependentDivs[index]) {
                    const div = dependentDivs[index];
                    const nameEl = div.querySelector('.dependent-name');
                    const ssnEl = div.querySelector('.dependent-ssn');
                    const relationshipEl = div.querySelector('.dependent-relationship');
                    const dobEl = div.querySelector('.dependent-dob');
                    
                    if (nameEl) nameEl.value = dependent.name || '';
                    if (ssnEl) ssnEl.value = dependent.ssn || '';
                    if (relationshipEl) relationshipEl.value = dependent.relationship || '';
                    if (dobEl) dobEl.value = dependent.dateOfBirth || '';
                }
            });
        }
    }
}

function displayForm1040(formData) {
    const container = document.getElementById('form1098Content'); // Note: ID remains same for compatibility
    if (!container) {
        console.error('❌ Form display container not found');
        return;
    }
    
    container.innerHTML = `
        <div class="bg-blue-50 p-6 rounded-lg mb-6">
            <h4 class="text-xl font-bold text-blue-900 mb-4">Form 1040 - U.S. Individual Income Tax Return</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                    <p><span class="font-medium">Tax Year:</span> ${formData.taxYear}</p>
                    <p><span class="font-medium">Taxpayer:</span> ${formData.taxpayer.name}</p>
                    <p><span class="font-medium">SSN:</span> ${formData.taxpayer.ssn || 'Not provided'}</p>
                </div>
                <div>
                    <p><span class="font-medium">Filing Status:</span> ${formatFilingStatus(formData.taxpayer.filingStatus)}</p>
                    <p><span class="font-medium">Address:</span> ${formatAddress(formData.taxpayer.address)}</p>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Income Section -->
            <div class="bg-green-50 p-4 rounded-lg">
                <h5 class="font-bold text-green-900 mb-3">Income</h5>
                <div class="space-y-2 text-sm">
                    <div class="flex justify-between">
                        <span>Wages (Line 1a):</span>
                        <span class="font-medium">${formData.income.wages.toLocaleString()}</span>
                    </div>
                    <div class="flex justify-between">
                        <span>Taxable Interest (Line 2b):</span>
                        <span class="font-medium">${formData.income.taxableInterest.toLocaleString()}</span>
                    </div>
                    <div class="flex justify-between">
                        <span>Ordinary Dividends (Line 3b):</span>
                        <span class="font-medium">${formData.income.ordinaryDividends.toLocaleString()}</span>
                    </div>
                    <div class="flex justify-between border-t pt-2 font-bold text-green-800">
                        <span>Adjusted Gross Income (Line 11):</span>
                        <span>${formData.income.adjustedGrossIncome.toLocaleString()}</span>
                    </div>
                </div>
            </div>

            <!-- Deductions Section -->
            <div class="bg-yellow-50 p-4 rounded-lg">
                <h5 class="font-bold text-yellow-900 mb-3">Deductions</h5>
                <div class="space-y-2 text-sm">
                    <div class="flex justify-between">
                        <span>Standard Deduction (Line 12a):</span>
                        <span class="font-medium">${formData.deductions.standardDeduction.toLocaleString()}</span>
                    </div>
                    <div class="flex justify-between">
                        <span>QBI Deduction (Line 13):</span>
                        <span class="font-medium">${formData.deductions.qbiDeduction.toLocaleString()}</span>
                    </div>
                    <div class="flex justify-between border-t pt-2 font-bold text-yellow-800">
                        <span>Taxable Income (Line 15):</span>
                        <span>${formData.deductions.taxableIncome.toLocaleString()}</span>
                    </div>
                </div>
            </div>

            <!-- Tax Calculation -->
            <div class="bg-red-50 p-4 rounded-lg">
                <h5 class="font-bold text-red-900 mb-3">Tax Calculation</h5>
                <div class="space-y-2 text-sm">
                    <div class="flex justify-between">
                        <span>Income Tax (Line 16):</span>
                        <span class="font-medium">${formData.tax.baseTax.toLocaleString()}</span>
                    </div>
                    <div class="flex justify-between">
                        <span>Other Taxes (Line 17-23):</span>
                        <span class="font-medium">${formData.tax.otherTaxes || 0}</span>
                    </div>
                    <div class="flex justify-between border-t pt-2 font-bold text-red-800">
                        <span>Total Tax (Line 24):</span>
                        <span>${formData.tax.totalTax.toLocaleString()}</span>
                    </div>
                </div>
            </div>

            <!-- Payments & Credits -->
            <div class="bg-purple-50 p-4 rounded-lg">
                <h5 class="font-bold text-purple-900 mb-3">Payments & Credits</h5>
                <div class="space-y-2 text-sm">
                    <div class="flex justify-between">
                        <span>Federal Tax Withheld (Line 25a):</span>
                        <span class="font-medium">${formData.payments.federalIncomeTaxWithheld.toLocaleString()}</span>
                    </div>
                    <div class="flex justify-between">
                        <span>Total Credits (Line 32):</span>
                        <span class="font-medium">${formData.credits.totalCredits.toLocaleString()}</span>
                    </div>
                    <div class="flex justify-between border-t pt-2 font-bold text-purple-800">
                        <span>Total Payments (Line 33):</span>
                        <span>${formData.payments.totalPayments.toLocaleString()}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- W-2 Information -->
        <div class="mt-6 bg-gray-50 p-4 rounded-lg">
            <h5 class="font-bold text-gray-900 mb-3">W-2 Information</h5>
            <div class="space-y-2">
                ${formData.w2Information.map((w2, index) => `
                    <div class="bg-white p-3 rounded border">
                        <h6 class="font-medium">W-2 #${index + 1}</h6>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm mt-2">
                            <div>Wages: ${w2.wages.toLocaleString()}</div>
                            <div>Fed. Withheld: ${w2.federalWithheld.toLocaleString()}</div>
                            <div>SS Wages: ${w2.socialSecurityWages.toLocaleString()}</div>
                            <div>Medicare Wages: ${w2.medicareWages.toLocaleString()}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>

        <!-- Refund/Amount Owed -->
        <div class="mt-6 p-6 ${formData.summary.isRefund ? 'bg-green-100 border-green-300' : 'bg-red-100 border-red-300'} border-2 rounded-lg text-center">
            <h4 class="text-2xl font-bold ${formData.summary.isRefund ? 'text-green-800' : 'text-red-800'} mb-2">
                ${formData.summary.isRefund ? 'REFUND DUE' : 'AMOUNT OWED'}
            </h4>
            <p class="text-3xl font-bold ${formData.summary.isRefund ? 'text-green-900' : 'text-red-900'}">
                ${Math.abs(formData.summary.refundOrOwed).toLocaleString()}
            </p>
            <p class="text-sm ${formData.summary.isRefund ? 'text-green-700' : 'text-red-700'} mt-2">
                ${formData.summary.isRefund ? 
                    'You will receive this amount as a tax refund' : 
                    'You need to pay this amount with your tax return'
                }
            </p>
        </div>

        <!-- Dependents Information -->
        ${formData.dependents.length > 0 ? `
            <div class="mt-6 bg-blue-50 p-4 rounded-lg">
                <h5 class="font-bold text-blue-900 mb-3">Dependents Claimed</h5>
                <div class="space-y-2">
                    ${formData.dependents.map((dep, index) => `
                        <div class="bg-white p-2 rounded text-sm">
                            <span class="font-medium">${dep.name}</span> - 
                            ${dep.relationship} - 
                            SSN: ${dep.ssn || 'Not provided'}
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
    `;
}

function formatFilingStatus(status) {
    const statusMap = {
        'single': 'Single',
        'married-joint': 'Married Filing Jointly',
        'married-separate': 'Married Filing Separately',
        'head-of-household': 'Head of Household',
        'qualifying-widow': 'Qualifying Widow(er)'
    };
    return statusMap[status] || status;
}

function formatAddress(address) {
    if (!address || !address.street) return 'Not provided';
    return `${address.street}, ${address.city}, ${address.state} ${address.zipCode}`;
}

function enableFormEditing() {
    showAlert('Form editing enabled. You can modify the calculated values if needed.', 'info');
}

function initializePaymentForm() {
    if (!stripe) {
        console.error('❌ Stripe not initialized');
        return;
    }

    try {
        const elements = stripe.elements();
        cardElement = elements.create('card');
        
        const cardElementContainer = document.getElementById('card-element');
        if (cardElementContainer) {
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
            
            console.log('✅ Payment form initialized');
        }
    } catch (error) {
        console.error('❌ Payment form initialization failed:', error);
    }
}

async function handlePayment() {
    console.log('💳 Processing payment...');
    showLoading(true);

    try {
        // Create payment intent
        const intentResponse = await fetch('/api/payment/create-intent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ amount: 4999 }) // $49.99 in cents
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
            console.error('❌ Payment failed:', error);
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
                console.log('✅ Payment successful');
                showAlert('Payment successful!', 'success');
                showStep(5); // Navigate to final step
            } else {
                console.error('❌ Payment confirmation failed:', confirmData.message);
                showAlert(confirmData.message || 'Payment confirmation failed', 'error');
            }
        }
    } catch (error) {
        console.error('❌ Payment error:', error);
        showAlert('Payment failed. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

async function handleFinalSubmission() {
    console.log('📤 Submitting tax return...');
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
            console.log('✅ Tax return submitted successfully');
            document.getElementById('submissionStep')?.classList.add('hidden');
            document.getElementById('successMessage')?.classList.remove('hidden');
            
            const submissionIdEl = document.getElementById('submissionId');
            if (submissionIdEl) {
                submissionIdEl.textContent = data.submissionId || generateSubmissionId();
            }
            
            showAlert('Tax return submitted successfully!', 'success');
        } else {
            console.error('❌ Submission failed:', data.message);
            showAlert(data.message || 'Submission failed', 'error');
        }
    } catch (error) {
        console.error('❌ Submission error:', error);
        showAlert('Submission failed. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

function generateSubmissionId() {
    return 'TX' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 5).toUpperCase();
}

function showCompletedStatus(userData) {
    const dashboardSection = document.getElementById('dashboardSection');
    if (dashboardSection) {
        dashboardSection.innerHTML = `
            <div class="bg-white rounded-lg shadow p-6 text-center">
                <div class="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
                    <svg class="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                </div>
                <h3 class="text-2xl font-bold text-gray-900 mb-2">Tax Return Already Submitted</h3>
                <p class="text-gray-600">Your tax return was submitted on ${new Date(userData.taxReturn.submissionDate).toLocaleDateString()}</p>
                <p class="text-gray-600">Status: ${userData.taxReturn.status}</p>
            </div>
        `;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Add navigation buttons after a short delay
    setTimeout(() => {
        addNavigationButtons();
        console.log('✅ Navigation buttons added');
    }, 500);
});

console.log('📱 AI Tax Filing App Script Loaded Successfully');
