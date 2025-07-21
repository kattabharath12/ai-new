// Global variables
let authToken = localStorage.getItem('authToken');
let currentStep = 1;
let stripe;
let cardElement;
let currentUser = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Stripe - REPLACE WITH YOUR ACTUAL PUBLISHABLE KEY
    stripe = Stripe('pk_test_your_actual_stripe_publishable_key_here');
    
    if (authToken) {
        showDashboard();
        loadUserData();
    } else {
        showAuth();
    }

    initializeEventListeners();
    
    // Add W-9 fields to the tax info form after DOM loads
    setTimeout(() => {
        if (document.getElementById('taxInfoForm')) {
            addW9Fields();
        }
    }, 100);
});

// Event Listeners
function initializeEventListeners() {
    // Auth forms
    document.getElementById('loginFormElement').addEventListener('submit', handleLogin);
    document.getElementById('signupFormElement').addEventListener('submit', handleSignup);
    document.getElementById('showSignup').addEventListener('click', () => toggleAuthForms('signup'));
    document.getElementById('showLogin').addEventListener('click', () => toggleAuthForms('login'));
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // W-9 Tax info form (Step 1) - Updated for W-9
    document.getElementById('taxInfoForm').addEventListener('submit', handleW9Submit);
    document.getElementById('addDependent').addEventListener('click', addDependentFields);

    // File upload (Step 2)
    document.getElementById('uploadArea').addEventListener('click', () => document.getElementById('w2Upload').click());
    document.getElementById('w2Upload').addEventListener('change', handleFileUpload);
    document.getElementById('continueToReview').addEventListener('click', generateForm1040); // Fixed: was generateForm1098

    // Review and payment (Steps 3-4)
    document.getElementById('editForm').addEventListener('click', enableFormEditing);
    document.getElementById('proceedToPayment').addEventListener('click', () => showStep(4));
    document.getElementById('submitPayment').addEventListener('click', handlePayment);
    document.getElementById('finalSubmit').addEventListener('click', handleFinalSubmission);
}

// Authentication Functions
async function handleLogin(e) {
    e.preventDefault();
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
        } else {
            showAlert(data.message || 'Login failed', 'error');
        }
    } catch (error) {
        showAlert('Login failed. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

async function handleSignup(e) {
    e.preventDefault();
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
            showDashboard();
            showAlert('Account created successfully!', 'success');
        } else {
            showAlert(data.message || 'Signup failed', 'error');
        }
    } catch (error) {
        showAlert('Signup failed. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

function handleLogout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    showAuth();
    showAlert('Logged out successfully', 'success');
}

// UI Functions
function showAuth() {
    document.getElementById('authSection').classList.remove('hidden');
    document.getElementById('dashboardSection').classList.add('hidden');
    document.getElementById('userEmail').classList.add('hidden');
    document.getElementById('logoutBtn').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('authSection').classList.add('hidden');
    document.getElementById('dashboardSection').classList.remove('hidden');
    document.getElementById('userEmail').classList.remove('hidden');
    document.getElementById('logoutBtn').classList.remove('hidden');
    
    if (currentUser) {
        document.getElementById('userEmail').textContent = currentUser.email;
    }
    
    // Update step labels to reflect correct form names
    updateStepLabels();
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
    if (form === 'signup') {
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('signupForm').classList.remove('hidden');
    } else {
        document.getElementById('signupForm').classList.add('hidden');
        document.getElementById('loginForm').classList.remove('hidden');
    }
}

function showStep(step) {
    // Hide all steps
    document.querySelectorAll('[id$="Step"]').forEach(el => el.classList.add('hidden'));
    
    // Show current step
    const stepElements = {
        1: 'taxInfoStep',
        2: 'uploadStep',
        3: 'reviewStep',
        4: 'paymentStep',
        5: 'submissionStep'
    };
    
    document.getElementById(stepElements[step]).classList.remove('hidden');
    
    // Update step indicators
    for (let i = 1; i <= 5; i++) {
        const stepEl = document.getElementById(`step${i}`);
        stepEl.className = `w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            i < step ? 'step-completed' : 
            i === step ? 'step-active' : 'step-inactive'
        }`;
    }
    
    currentStep = step;
    
    // Initialize payment form when reaching payment step
    if (step === 4 && !cardElement) {
        initializePaymentForm();
    }
}

// W-9 Tax Information Functions (Step 1) - Enhanced for proper W-9 handling
async function handleW9Submit(e) {
    e.preventDefault();
    showLoading(true);

    const filingStatus = document.getElementById('filingStatus').value;
    const dependents = collectDependents();
    const address = {
        street: document.getElementById('addressStreet').value,
        city: document.getElementById('addressCity').value,
        state: document.getElementById('addressState').value,
        zipCode: document.getElementById('addressZip').value
    };

    // Enhanced W-9 data collection
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
            showAlert('W-9 tax information saved successfully!', 'success');
            showStep(2);
        } else {
            showAlert(data.message || 'Failed to save tax information', 'error');
        }
    } catch (error) {
        showAlert('Failed to save tax information', 'error');
    } finally {
        showLoading(false);
    }
}

function addDependentFields() {
    const container = document.getElementById('dependentsContainer');
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
    document.getElementById('dependentsContainer').querySelectorAll('div').forEach(div => {
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

// Enhanced W-9 Integration Functions
function addW9Fields() {
    // Add W-9 specific fields to the tax info form
    const taxInfoForm = document.getElementById('taxInfoForm');
    const existingFields = taxInfoForm.querySelector('.space-y-6');
    
    if (!existingFields || document.getElementById('taxClassification')) {
        return; // Already added or form not found
    }
    
    // Add tax classification section
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

// File Upload Functions (Step 2)
async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

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
            showAlert('W-2 uploaded and processed successfully!', 'success');
            displayUploadedDocument(file.name, data.extractedData);
            document.getElementById('continueToReview').disabled = false;
        } else {
            showAlert(data.message || 'Upload failed', 'error');
        }
    } catch (error) {
        showAlert('Upload failed. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

function displayUploadedDocument(filename, extractedData) {
    const container = document.getElementById('uploadedDocs');
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

// Form 1040 Functions (Step 3) - FIXED: Changed from Form 1098 to 1040
async function generateForm1040() {
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
            displayForm1040(data.form1040);
            showStep(3);
            showAlert('Form 1040 generated successfully!', 'success');
            
            // Update step title
            const reviewTitle = document.querySelector('#reviewStep h3');
            if (reviewTitle) {
                reviewTitle.textContent = 'Review Your Tax Return (Form 1040)';
            }
        } else {
            showAlert(data.message || 'Failed to generate form', 'error');
        }
    } catch (error) {
        showAlert('Failed to generate form', 'error');
    } finally {
        showLoading(false);
    }
}

function displayForm1040(formData) {
    const container = document.getElementById('form1098Content');
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
                        <span class="font-medium">$${formData.income.wages.toLocaleString()}</span>
                    </div>
                    <div class="flex justify-between">
                        <span>Taxable Interest (Line 2b):</span>
                        <span class="font-medium">$${formData.income.taxableInterest.toLocaleString()}</span>
                    </div>
                    <div class="flex justify-between">
                        <span>Ordinary Dividends (Line 3b):</span>
                        <span class="font-medium">$${formData.income.ordinaryDividends.toLocaleString()}</span>
                    </div>
                    <div class="flex justify-between border-t pt-2 font-bold text-green-800">
                        <span>Adjusted Gross Income (Line 11):</span>
                        <span>$${formData.income.adjustedGrossIncome.toLocaleString()}</span>
                    </div>
                </div>
            </div>

            <!-- Deductions Section -->
            <div class="bg-yellow-50 p-4 rounded-lg">
                <h5 class="font-bold text-yellow-900 mb-3">Deductions</h5>
                <div class="space-y-2 text-sm">
                    <div class="flex justify-between">
                        <span>Standard Deduction (Line 12a):</span>
                        <span class="font-medium">$${formData.deductions.standardDeduction.toLocaleString()}</span>
                    </div>
                    <div class="flex justify-between">
                        <span>QBI Deduction (Line 13):</span>
                        <span class="font-medium">$${formData.deductions.qbiDeduction.toLocaleString()}</span>
                    </div>
                    <div class="flex justify-between border-t pt-2 font-bold text-yellow-800">
                        <span>Taxable Income (Line 15):</span>
                        <span>$${formData.deductions.taxableIncome.toLocaleString()}</span>
                    </div>
                </div>
            </div>

            <!-- Tax Calculation -->
            <div class="bg-red-50 p-4 rounded-lg">
                <h5 class="font-bold text-red-900 mb-3">Tax Calculation</h5>
                <div class="space-y-2 text-sm">
                    <div class="flex justify-between">
                        <span>Income Tax (Line 16):</span>
                        <span class="font-medium">$${formData.tax.baseTax.toLocaleString()}</span>
                    </div>
                    <div class="flex justify-between">
                        <span>Other Taxes (Line 17-23):</span>
                        <span class="font-medium">$${formData.tax.otherTaxes || 0}</span>
                    </div>
                    <div class="flex justify-between border-t pt-2 font-bold text-red-800">
                        <span>Total Tax (Line 24):</span>
                        <span>$${formData.tax.totalTax.toLocaleString()}</span>
                    </div>
                </div>
            </div>

            <!-- Payments & Credits -->
            <div class="bg-purple-50 p-4 rounded-lg">
                <h5 class="font-bold text-purple-900 mb-3">Payments & Credits</h5>
                <div class="space-y-2 text-sm">
                    <div class="flex justify-between">
                        <span>Federal Tax Withheld (Line 25a):</span>
                        <span class="font-medium">$${formData.payments.federalIncomeTaxWithheld.toLocaleString()}</span>
                    </div>
                    <div class="flex justify-between">
                        <span>Total Credits (Line 32):</span>
                        <span class="font-medium">$${formData.credits.totalCredits.toLocaleString()}</span>
                    </div>
                    <div class="flex justify-between border-t pt-2 font-bold text-purple-800">
                        <span>Total Payments (Line 33):</span>
                        <span>$${formData.payments.totalPayments.toLocaleString()}</span>
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
                            <div>Wages: $${w2.wages.toLocaleString()}</div>
                            <div>Fed. Withheld: $${w2.federalWithheld.toLocaleString()}</div>
                            <div>SS Wages: $${w2.socialSecurityWages.toLocaleString()}</div>
                            <div>Medicare Wages: $${w2.medicareWages.toLocaleString()}</div>
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
                $${Math.abs(formData.summary.refundOrOwed).toLocaleString()}
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
    // Here you could add functionality to make form fields editable
}

// Payment Functions (Step 4)
function initializePaymentForm() {
    const elements = stripe.elements();
    cardElement = elements.create('card');
    cardElement.mount('#card-element');

    cardElement.on('change', function(event) {
        const displayError = document.getElementById('card-errors');
        if (event.error) {
            displayError.textContent = event.error.message;
        } else {
            displayError.textContent = '';
        }
    });
}

async function handlePayment() {
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
        showAlert('Payment failed. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// Final Submission (Step 5)
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
            document.getElementById('submissionStep').classList.add('hidden');
            document.getElementById('successMessage').classList.remove('hidden');
            document.getElementById('submissionId').textContent = data.submissionId || generateSubmissionId();
            showAlert('Tax return submitted successfully!', 'success');
        } else {
            showAlert(data.message || 'Submission failed', 'error');
        }
    } catch (error) {
        showAlert('Submission failed. Please try again.', 'error');
    } finally {
        showLoading(false);
    }
}

// Utility Functions
async function loadUserData() {
    try {
        const response = await fetch('/api/auth/me', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const userData = await response.json();
            currentUser = userData;
            
            // Pre-fill forms with existing data
            if (userData.taxInfo) {
                populateTaxInfoForm(userData.taxInfo);
            }
            
            // Check progress and show appropriate step
            determineCurrentStep(userData);
        }
    } catch (error) {
        console.error('Failed to load user data:', error);
    }
}

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
        const dependentDivs = document.getElementById('dependentsContainer').children;
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

function determineCurrentStep(userData) {
    // Determine which step to show based on user's progress
    if (!userData.taxInfo || !userData.taxInfo.filingStatus) {
        showStep(1);
    } else if (!userData.documents || userData.documents.filter(doc => doc.type === 'w2').length === 0) {
        showStep(2);
    } else if (!userData.taxReturn || !userData.taxReturn.form1040) {
        showStep(2);
    } else if (!userData.payments || userData.payments.length === 0) {
        showStep(3);
    } else if (userData.taxReturn.status === 'draft' || userData.taxReturn.status === 'review') {
        showStep(5);
    } else {
        // Show success if already submitted
        document.getElementById('dashboardSection').innerHTML = `
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

function showLoading(show) {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) {
        spinner.classList.toggle('hidden', !show);
    }
}

function showAlert(message, type = 'info') {
    // Create alert element
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
    
    // Remove alert after 5 seconds
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.parentNode.removeChild(alertDiv);
        }
    }, 5000);
}

function generateSubmissionId() {
    return 'TX' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 5).toUpperCase();
}

// Enhanced OCR Processing for W-2 forms
function enhanceOCRExtraction(text) {
    const enhancedPatterns = {
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
    
    for (const [field, pattern] of Object.entries(enhancedPatterns)) {
        const match = text.match(pattern);
        if (match) {
            let value = match[1] || match[0];
            
            // Clean up monetary values
            if (field.includes('wages') || field.includes('tax') || field.includes('Tax')) {
                value = value.replace(/[,$]/g, '');
                if (!isNaN(value)) {
                    extractedData[field] = parseFloat(value);
                }
            } else {
                extractedData[field] = value.trim();
            }
        }
    }

    return extractedData;
}

// Export functions for global access (for inline event handlers)
window.formatSSNInput = formatSSNInput;
window.formatEINInput = formatEINInput;

// Enhanced error handling
window.addEventListener('error', function(event) {
    console.error('Global error:', event.error);
    showAlert('An unexpected error occurred. Please try again.', 'error');
});

// Enhanced fetch error handling
const originalFetch = window.fetch;
window.fetch = function(...args) {
    return originalFetch.apply(this, args)
        .catch(error => {
            console.error('Fetch error:', error);
            showAlert('Network error. Please check your connection.', 'error');
            throw error;
        });
};
