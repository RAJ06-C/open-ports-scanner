/* script.js — cleaned and unified for your Port Scanner frontend
   - Sends payload expected by app.py: { target, protocol, port_mode, ports }
   - Stores scan result in sessionStorage under 'scanResults'
   - Single DOMContentLoaded initializer
   - Theme handling, form validation, submission, and results loader
*/

(() => {
  // ---------- Theme Helpers ----------
  const setTheme = (theme) => {
    document.body.classList.remove('light-theme', 'dark-theme');
    document.body.classList.add(theme);
    localStorage.setItem('theme', theme);
    const themeToggleBtn = document.getElementById('theme-toggle');
    if (themeToggleBtn) themeToggleBtn.textContent = (theme === 'dark-theme' ? 'Light Theme' : 'Dark Theme');
  };

  const loadInitialTheme = () => {
    const saved = localStorage.getItem('theme') || 'light-theme';
    setTheme(saved);
  };

  // ---------- Validators ----------
  const validateTarget = (target) => {
    if (!target || !target.trim()) return "Target IP or Host is required.";
    // Accept typical hostnames, IPv4, IPv6 (basic checks)
    const targetRegex = /^(?:[a-zA-Z0-9.-]+|\[[0-9a-fA-F:]+\]|(?:\d{1,3}\.){3}\d{1,3})$/;
    if (!targetRegex.test(target)) return "Invalid format for IP/hostname.";
    return null;
  };

  const validatePorts = (ports) => {
    if (!ports || !ports.trim()) return "Custom port list is required.";
    // allow "21,80,443-445" (no spaces required, spaces are removed)
    const cleaned = ports.replace(/\s+/g, '');
    const regex = /^(\d+(?:-\d+)?)(,\d+(?:-\d+)?)*$/;
    if (!regex.test(cleaned)) return "Invalid port list. Use comma separated numbers or ranges (e.g., 21,80,443-445).";
    return null;
  };

  // ---------- API / Submission ----------
  const API_URL = 'http://127.0.0.1:5000/api/scan'; // Make sure app.py runs here

  async function submitScan(scanData, startButton) {
    // Disable button + show loading
    if (startButton) {
      startButton.disabled = true;
      startButton.dataset.originalText = startButton.innerHTML;
      startButton.innerHTML = 'Scanning...';
    }

    try {
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scanData)
      });

      const json = await resp.json();

      if (!resp.ok) {
        const msg = json.error || `Scan failed with status ${resp.status}`;
        alert(`Scan Error: ${msg}`);
        console.error("Backend error:", json);
        return;
      }

      // Success: store result in sessionStorage and go to results page
      // Ensure fields that results.html expects are present
      // app.py returns: target_ip, open_ports (list), scan_duration, protocol, ports_list
      sessionStorage.setItem('scanResults', JSON.stringify(json));
      window.location.href = 'results.html';

    } catch (err) {
      console.error("Network error:", err);
      alert("Network Error: Could not connect to backend. Is app.py running on http://127.0.0.1:5000 ?");
    } finally {
      if (startButton) {
        startButton.disabled = false;
        startButton.innerHTML = startButton.dataset.originalText || 'Start Scan';
      }
    }
  }

  // ---------- Results Page Loader ----------
  // Called by results.html after lucide icons are created
  window.loadResultsPage = function loadResultsPage() {
    try {
      const resultsJson = sessionStorage.getItem('scanResults');
      if (!resultsJson) {
        const targetEl = document.getElementById('target-ip');
        if (targetEl) targetEl.textContent = 'No data available. Please run a scan.';
        return;
      }

      const data = JSON.parse(resultsJson);

      // Populate summary & details (guarding for missing fields)
      document.getElementById('target-ip').textContent = data.target_ip || data.target || 'N/A';
      document.getElementById('open-ports-count').textContent = (data.open_ports || []).length;
      document.getElementById('scan-duration').textContent = (typeof data.scan_duration === 'number') ? `${data.scan_duration.toFixed(2)}s` : (data.scan_duration || 'N/A');
      document.getElementById('protocol-used').textContent = (data.protocol || 'tcp').toUpperCase();

      let portsText = data.ports_list || data.port_mode || 'N/A';
      if (typeof portsText === 'string' && portsText.startsWith('top')) {
        const num = portsText.replace(/\D/g, '') || '100';
        portsText = `Top ${num} ports`;
      }
      document.getElementById('ports-scanned').textContent = portsText;

      // Fill table
      const tbody = document.querySelector('#ports-table tbody');
      const noPortsMsg = document.getElementById('no-ports-message');
      tbody.innerHTML = '';

      if (data.open_ports && data.open_ports.length > 0) {
        noPortsMsg.style.display = 'none';
        data.open_ports.forEach(p => {
          const tr = document.createElement('tr');
          const portTd = document.createElement('td'); portTd.textContent = p.port;
          const protoTd = document.createElement('td'); protoTd.textContent = (p.protocol || 'tcp').toUpperCase();
          const stateTd = document.createElement('td'); stateTd.textContent = (p.state || 'unknown').toUpperCase();
          stateTd.classList.add(p.state && p.state.toLowerCase().startsWith('open') ? 'status-open' : 'status-closed');
          const serviceTd = document.createElement('td'); serviceTd.textContent = p.service || 'N/A';
          const verTd = document.createElement('td'); verTd.textContent = p.version || 'N/A';

          tr.appendChild(portTd);
          tr.appendChild(protoTd);
          tr.appendChild(stateTd);
          tr.appendChild(serviceTd);
          tr.appendChild(verTd);
          tbody.appendChild(tr);
        });
      } else {
        noPortsMsg.style.display = 'block';
      }

      // Re-scan button behaviour
      const rescanBtn = document.getElementById('rescan-button');
      if (rescanBtn) {
        rescanBtn.addEventListener('click', (ev) => {
          sessionStorage.removeItem('scanResults');
          window.location.href = 'scanning.html';
        });
      }
    } catch (e) {
      console.error('Error loading results page:', e);
    }
  };

  // ---------- Main Initialization ----------
  document.addEventListener('DOMContentLoaded', () => {
    loadInitialTheme();
    lucide && lucide.createIcons && lucide.createIcons();

    // Theme toggle
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', () => {
        const newTheme = document.body.classList.contains('light-theme') ? 'dark-theme' : 'light-theme';
        setTheme(newTheme);
      });
    }

    // If on scanning page: set up form
    const scanForm = document.getElementById('scan-form') || document.getElementById('scanning-form') || null;
    const startScanBtn = document.getElementById('start-scan-btn') || document.getElementById('startScanBtn') || null;

    if (scanForm) {
      // Handle port-mode visibility (assumes select has id 'port-mode' and custom input id 'custom-ports')
      const portModeSelect = document.getElementById('port-mode') || document.getElementById('port-select');
      const customGroup = document.getElementById('custom-ports-group') || null;

      if (portModeSelect) {
        portModeSelect.addEventListener('change', () => {
          if (customGroup) {
            customGroup.style.display = (portModeSelect.value === 'custom') ? 'block' : 'none';
          }
        });
      }

      // Submit handler
      scanForm.addEventListener('submit', (e) => {
        e.preventDefault();

        // read values from DOM (IDs used in your HTML)
        const targetInput = document.getElementById('target-ip') || document.getElementById('target-ip-input') || document.getElementById('ip-host') || document.getElementById('target-ip-field');
        const target = (targetInput && targetInput.value) ? targetInput.value.trim() : (targetInput && targetInput.textContent ? targetInput.textContent.trim() : '');

        const protocolEl = document.querySelector('input[name="protocol"]:checked');
        const protocol = protocolEl ? protocolEl.value : 'tcp';

        const portModeEl = document.getElementById('port-mode') || document.getElementById('port-select');
        const port_mode = portModeEl ? portModeEl.value : 'top100';

        const customPortsEl = document.getElementById('custom-ports') || document.getElementById('ports-list') || document.getElementById('ports-list-input');
        const ports = (port_mode === 'custom' && customPortsEl) ? customPortsEl.value.trim() : '';

        const termsCheckbox = document.getElementById('terms-agree') || document.getElementById('terms-agreement') || document.getElementById('terms-agree-checkbox');

        // Simple client-side validation
        // Target
        const targetErr = validateTarget(target || '');
        if (targetErr) {
          alert(targetErr);
          return;
        }

        // Custom ports if selected
        if (port_mode === 'custom') {
          const portsErr = validatePorts(ports || '');
          if (portsErr) {
            alert(portsErr);
            return;
          }
        }

        // Terms
        if (termsCheckbox && !termsCheckbox.checked) {
          alert('You must agree to the Terms of Service.');
          return;
        }

        // Build payload expected by app.py
        const payload = {
          target: target,
          protocol: protocol,
          port_mode: port_mode,
          ports: (port_mode === 'custom') ? ports : ''
        };

        submitScan(payload, startScanBtn);
      });
    }

  });
})();

