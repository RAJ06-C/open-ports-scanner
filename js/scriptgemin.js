/**
 * Core JavaScript for Port Scanner Frontend
 * Handles: Theme Toggle, Form Validation, API Fetch/Scan, and Results Display.
 */

// --- Global Theme & Utility Functions ---

/**
 * Sets the theme based on preference and saves it to localStorage.
 * @param {string} theme - 'light-theme' or 'dark-theme'
 */
const setTheme = (theme) => {
    const body = document.body;
    const themeToggleBtn = document.getElementById('theme-toggle');

    body.classList.remove('light-theme', 'dark-theme');
    body.classList.add(theme);
    localStorage.setItem('theme', theme);

    if (themeToggleBtn) {
        themeToggleBtn.textContent = (theme === 'dark-theme' ? 'Light Theme' : 'Dark Theme');
    }
};

/**
 * Loads the saved theme or defaults to 'light-theme'.
 */
const loadInitialTheme = () => {
    const savedTheme = localStorage.getItem('theme') || 'light-theme';
    setTheme(savedTheme);
};

// --- Scanning Page Logic ---

/**
 * Shows/hides the custom port list input based on the 'Port Selection' dropdown value.
 */
const updatePortListVisibility = () => {
    const portSelect = document.getElementById('port-select');
    const customPortsGroup = document.getElementById('custom-ports-group');

    if (portSelect && customPortsGroup) {
        const isCustom = portSelect.value === 'custom';
        customPortsGroup.style.display = isCustom ? 'block' : 'none';
        
        // Clear custom ports input if switching away from custom
        if (!isCustom) {
            document.getElementById('ports-list').value = '';
        }
    }
};

/**
 * Displays validation error messages.
 * @param {string} elementId - ID of the input field to target.
 * @param {string} message - The error message to display.
 */
const displayError = (elementId, message) => {
    const input = document.getElementById(elementId);
    const errorElement = document.getElementById(elementId + '-error');

    if (input) {
        input.classList.add('error-border');
    }
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
};

/**
 * Clears validation error messages for a given field.
 * @param {string} elementId - ID of the input field to target.
 */
const clearError = (elementId) => {
    const input = document.getElementById(elementId);
    const errorElement = document.getElementById(elementId + '-error');

    if (input) {
        input.classList.remove('error-border');
    }
    if (errorElement) {
        errorElement.textContent = '';
        errorElement.style.display = 'none';
    }
};

/**
 * Validates the form inputs on the scanning page.
 * @returns {boolean} True if validation passes, otherwise False.
 */
const validateForm = () => {
    let isValid = true;
    const ipInput = document.getElementById('ip-host');
    const termsCheckbox = document.getElementById('terms-agreement');
    const portSelect = document.getElementById('port-select');
    const portsList = document.getElementById('ports-list');

    // 1. Validate IP/Host
    clearError('ip-host');
    if (!ipInput.value.trim()) {
        displayError('ip-host', 'Target IP or Hostname is required.');
        isValid = false;
    }

    // 2. Validate Custom Port List if selected
    clearError('ports-list');
    if (portSelect.value === 'custom') {
        if (!portsList.value.trim()) {
            displayError('ports-list', 'Custom port list cannot be empty.');
            isValid = false;
        } else {
            // Simple format check (comma or space separated numbers/ranges)
            const portsPattern = /^[\d\s,-]+$/;
            if (!portsPattern.test(portsList.value.trim())) {
                displayError('ports-list', 'Invalid port format. Use numbers, commas, hyphens, or spaces.');
                isValid = false;
            }
        }
    }

    // 3. Validate Terms and Services
    clearError('terms-agreement');
    if (!termsCheckbox.checked) {
        displayError('terms-agreement', 'You must agree to the Terms of Service.');
        isValid = false;
    }

    return isValid;
};

/**
 * Handles the actual scan submission, calling the backend API.
 */
const handleScanSubmission = async (event) => {
    event.preventDefault();

    if (!validateForm()) {
        return;
    }

    const startScanBtn = document.getElementById('start-scan-btn');
    const ipHost = document.getElementById('ip-host').value.trim();
    const protocol = document.querySelector('input[name="protocol"]:checked').value;
    const portSelect = document.getElementById('port-select').value;
    let portsList = '';

    if (portSelect === 'custom') {
        portsList = document.getElementById('ports-list').value.trim();
    } else {
        // Use the value from the select box (e.g., 'top_100')
        portsList = portSelect;
    }

    // Show Loading State
    const originalText = startScanBtn.innerHTML;
    startScanBtn.disabled = true;
    startScanBtn.innerHTML = '<i data-lucide="loader" class="animate-spin mr-2"></i> Scanning...';
    lucide.createIcons();

    const scanData = {
        target_ip: ipHost,
        protocol: protocol,
        ports_list: portsList
    };

    const API_URL = 'http://127.0.0.1:5000/api/scan';

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(scanData),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const resultJson = await response.json();

        if (resultJson.error) {
            alert(`Scan Error: ${resultJson.error}`);
        } else {
            // Success: Save result to session storage and redirect
            sessionStorage.setItem('scanResults', JSON.stringify(resultJson));
            window.location.href = 'results.html';
        }

    } catch (error) {
        console.error('Network or Server Error:', error);
        alert('Network Error: Could not connect to the Python backend. Ensure \'app.py\' is running on http://127.0.0.1:5000.');

    } finally {
        // Restore Button State
        startScanBtn.disabled = false;
        startScanBtn.innerHTML = originalText;
        lucide.createIcons();
    }
};


// --- Results Page Logic ---

/**
 * Renders the results onto the results.html page from session storage.
 */
const loadResultsPage = () => {
    const resultsData = JSON.parse(sessionStorage.getItem('scanResults'));

    if (!resultsData) {
        // Handle case where user navigates directly without scanning
        document.getElementById('target-ip').textContent = 'No data available. Please run a scan.';
        return;
    }
    
    // --- 1. Populate Target Info ---
    document.getElementById('target-ip').textContent = resultsData.target_ip || targetIp;

    // --- 2. Populate Summary Cards ---
    document.getElementById('open-ports-count').textContent = resultsData.open_ports.length;
    document.getElementById('scan-duration').textContent = `${resultsData.scan_duration.toFixed(2)}s`;
    document.getElementById('protocol-used').textContent = resultsData.protocol.toUpperCase();
    
    let portsScannedText = resultsData.ports_list;
    if (portsScannedText.startsWith('top_')) {
        portsScannedText = `Top ${portsScannedText.split('_')[1]} Ports`;
    }
    document.getElementById('ports-scanned').textContent = portsScannedText;


    // --- 3. Populate Detailed Ports Table ---
    const tableBody = document.querySelector('#ports-table tbody');
    const noPortsMessage = document.getElementById('no-ports-message');
    tableBody.innerHTML = ''; // Clear previous content

    if (resultsData.open_ports && resultsData.open_ports.length > 0) {
        noPortsMessage.style.display = 'none';

        resultsData.open_ports.forEach(port => {
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${port.port}</td>
                <td>${port.protocol.toUpperCase()}</td>
                <td class="status-open">${port.state.toUpperCase()}</td>
                <td>${port.service || 'N/A'}</td>
                <td>${port.version || 'N/A'}</td>
            `;
        });
    } else {
        noPortsMessage.style.display = 'block';
    }

    // --- 4. Handle Re-Scan Button ---
    const rescanBtn = document.getElementById('rescan-button');
    if (rescanBtn) {
        rescanBtn.addEventListener('click', () => {
            // Optional: Clear session storage before navigating back
            sessionStorage.removeItem('scanResults');
            window.location.href = 'scanning.html';
        });
    }
};

// --- Initializer ---

document.addEventListener('DOMContentLoaded', () => {
    // 1. Load Theme on all pages
    loadInitialTheme();

    const themeToggleBtn = document.getElementById('theme-toggle');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            if (document.body.classList.contains('light-theme')) {
                setTheme('dark-theme');
            } else {
                setTheme('light-theme');
            }
        });
    }

    // 2. Setup Scanning Page Elements (if on scanning.html)
    const scanningForm = document.getElementById('scanning-form');
    const portSelect = document.getElementById('port-select');

    if (scanningForm) {
        // Attach form submission handler
        scanningForm.addEventListener('submit', handleScanSubmission);
    }
    
    if (portSelect) {
        // Attach change listener for port selection dropdown
        portSelect.addEventListener('change', updatePortListVisibility);
        // Set initial visibility when page loads
        updatePortListVisibility(); 
    }
});

// Expose loadResultsPage for results.html to call after Lucide is ready
// This is done via the inline script in results.html to ensure execution order
// for the third-party library (Lucide).
// No need to wrap loadResultsPage in DOMContentLoaded here as it's called externally.



document.addEventListener('DOMContentLoaded', () => {
    const themeToggleBtn = document.getElementById('theme-toggle');
    const body = document.body;

    // --- Theme Toggling Logic (Copied from previous step) ---
    const setTheme = (theme) => {
        body.classList.remove('light-theme', 'dark-theme');
        body.classList.add(theme);
        localStorage.setItem('theme', theme);
        themeToggleBtn.textContent = (theme === 'dark-theme' ? 'Light Theme' : 'Dark Theme');
    };

    const savedTheme = localStorage.getItem('theme') || 'light-theme';
    setTheme(savedTheme);

    themeToggleBtn.addEventListener('click', () => {
        if (body.classList.contains('light-theme')) {
            setTheme('dark-theme');
        } else {
            setTheme('light-theme');
        }
    });

    // --- Scanning Page (scanning.html) Logic ---
    const scanForm = document.getElementById('scan-form');
    const portModeSelect = document.getElementById('port-mode');
    const customPortsGroup = document.getElementById('custom-ports-group');
    const startScanNavBtn = document.getElementById('start-scanning-btn'); // For index.html
    const startScanBtn = document.getElementById('start-scan-btn'); // Button in scanning.html

    // Base URL for the Flask API (Make sure your Flask app is running on port 5000!)
    const API_URL = 'http://127.0.0.1:5000/api/scan';

    // 1. Initial Redirection from index.html (Start Scanning button)
    if (startScanNavBtn) {
        startScanNavBtn.addEventListener('click', () => {
            window.location.href = 'scanning.html';
        });
    }

    // 2. Port Mode Toggle Logic
    if (portModeSelect) {
        portModeSelect.addEventListener('change', () => {
            if (portModeSelect.value === 'custom') {
                customPortsGroup.style.display = 'block';
                document.getElementById('custom-ports').setAttribute('required', 'required');
            } else {
                customPortsGroup.style.display = 'none';
                document.getElementById('custom-ports').removeAttribute('required');
            }
        });
    }
    
    // Helper to display error messages
    const displayError = (elementId, message) => {
        const errorElement = document.getElementById(elementId);
        errorElement.textContent = message;
        errorElement.style.display = message ? 'block' : 'none';
        // Also highlight the associated input field if possible
        const inputField = document.getElementById(elementId.replace('-error', ''));
        if (inputField) {
            inputField.classList.toggle('input-error', !!message);
        }
    };

    // Simple IP/Hostname validation (prevents command injection attempts)
    const validateTarget = (target) => {
        if (!target.trim()) return "Target IP or Host is required.";
        const targetRegex = /^(?:[a-zA-Z0-9.-]+|(?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-fA-F:]+\])$/;
        if (!targetRegex.test(target)) return "Invalid format. Please enter a valid IP or hostname.";
        return null;
    };

    // Custom Ports validation
    const validatePorts = (ports) => {
        if (!ports) return "Custom port list is required.";
        const portListRegex = /^(\d+(?:-\d+)?)(,\s*\d+(?:-\d+)?)*$/;
        if (!portListRegex.test(ports.replace(/\s/g, ''))) return "Invalid port list. Use comma-separated ports or ranges (e.g., 21, 80, 443-445).";
        return null;
    };

    // --- New: The Core Function to Submit and Fetch Scan Data ---
    const submitScan = async (scanData) => {
        // Disable button and show loading state
        startScanBtn.disabled = true;
        startScanBtn.textContent = 'Scanning... Please wait (up to 120s)';
        startScanBtn.classList.add('loading');

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                // Send the collected data as a JSON string
                body: JSON.stringify(scanData)
            });

            const result = await response.json();

            if (response.ok) {
                // SUCCESS: Save the result to localStorage for the results page to read
                localStorage.setItem('scanResults', JSON.stringify(result));
                
                // Redirect to the results page
                window.location.href = 'results.html';
            } else {
                // ERROR from Flask/Nmap (e.g., target down, Nmap execution error)
                const errorMessage = result.error || "An unknown error occurred during scanning.";
                alert(`Scan Error: ${errorMessage}`);
                console.error("Backend Scan Error:", result);
            }
        } catch (error) {
            // NETWORK ERROR (e.g., Flask server is not running or CORS issue)
            alert("Network Error: Could not connect to the Python backend. Ensure 'app.py' is running on http://127.0.0.1:5000.");
            console.error("Network Fetch Error:", error);
        } finally {
            // Re-enable button regardless of success or failure
            startScanBtn.disabled = false;
            startScanBtn.textContent = 'Start Scan';
            startScanBtn.classList.remove('loading');
        }
    }


    // 3. Form Validation and Submission Logic
    if (scanForm) {
        scanForm.addEventListener('submit', (e) => {
            e.preventDefault(); 

            let isValid = true;
            
            // Clear previous errors
            displayError('target-ip-error', null);
            displayError('custom-ports-error', null);
            displayError('terms-error', null);
            
            // 1. Validate Target IP/Host
            const targetIp = document.getElementById('target-ip').value;
            const targetError = validateTarget(targetIp);
            if (targetError) {
                displayError('target-ip-error', targetError);
                isValid = false;
            }

            // 2. Validate Custom Ports (if selected)
            const portMode = portModeSelect.value;
            let portsToScan = portMode; 
            if (portMode === 'custom') {
                const customPorts = document.getElementById('custom-ports').value;
                const portError = validatePorts(customPorts);
                if (portError) {
                    displayError('custom-ports-error', portError);
                    isValid = false;
                }
                portsToScan = customPorts; 
            }

            // 3. Validate Terms and Service Agreement
            const termsAgree = document.getElementById('terms-agree').checked;
            if (!termsAgree) {
                displayError('terms-error', 'You must agree to the terms of service.');
                isValid = false;
            }

            // If all validation passes, run the submission
            if (isValid) {
                const protocol = document.querySelector('input[name="protocol"]:checked').value;

                const scanData = {
                    target: targetIp,
                    protocol: protocol,
                    port_mode: portMode,
                    // Use the validated ports list/mode
                    ports: portsToScan, 
                };

                // CALL THE NEW SUBMISSION FUNCTION
                submitScan(scanData);
            }
        });
    }
});
