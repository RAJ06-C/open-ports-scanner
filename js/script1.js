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
