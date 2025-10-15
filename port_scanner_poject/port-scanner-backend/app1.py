import json
import subprocess
from flask import Flask, request, jsonify
# IMPORT THE CORS EXTENSION
from flask_cors import CORS
import nmap

# Initialize the Flask application
app = Flask(__name__)

# --- CORS CONFIGURATION (FIXED) ---
# Allow requests from all origins ('*'). This is essential for local testing
# when your HTML files are running on a different port than the Flask server.
CORS(app)

# --- Configuration ---
nm = nmap.PortScanner()

# --- Helper Functions ---

def determine_nmap_arguments(protocol, port_mode, custom_ports):
    """
    Constructs the command-line arguments for Nmap based on user input.

    NOTE: Using -sT (TCP Connect) as the primary scan type because -sS (SYN)
    requires root privileges, which is often unavailable in local user environments.
    """
    # CRITICAL FIX: Add -PN (No Ping) and -T4 (Timing). We'll rely on the port scan itself
    # for host up/down status, which is more reliable in non-privileged environments.
    args = '-T4 -n -PN' # Aggressive timing, no reverse DNS lookup, treat host as always up

    # Set scan type based on protocol
    if protocol == 'TCP':
        args += ' -sT'
    elif protocol == 'UDP':
        # UDP scan (-sU) can be very slow and sometimes problematic. We rely on it if selected.
        args += ' -sU'
    else:
        # Default fallback
        args += ' -sT'

    # Set port specification
    if 'top' in port_mode:
        num_ports = port_mode.replace('top', '')
        args += f' --top-ports {num_ports}'
    elif port_mode == 'custom' and custom_ports:
        cleaned_ports = custom_ports.replace(' ', '')
        args += f' -p {cleaned_ports}'
    else:
        # Fallback to a small default set
        args += ' -p 21,22,23,80,443'

    return args

def parse_nmap_results(scan_data, target_ip):
    """
    Parses the direct dictionary output from PortScanner (nm[ip]) into a cleaner JSON format for the frontend.
    """
    # Ensure target_ip is a string for consistent use as a dictionary key
    target_ip_str = str(target_ip)

    results = {
        'target': target_ip_str,
        'status': 'Error',
        'open_ports': [],
        'error_message': None,
        'scan_details': {}
    }

    # Use the target_ip_str to lookup the specific host data in the scan results
    if target_ip_str not in scan_data:
        results['error_message'] = f"Scan returned no data for host {target_ip_str}. Target may be down or filtered."
        return results

    # The scan_data here is essentially the nm object itself, keyed by IP
    host_info = scan_data[target_ip_str]

    # We try to get hostname first, then fall back to IP
    # FIX: Use .hostname() method for reliable hostname retrieval
    hostname = host_info.hostname() if host_info.hostname() else target_ip_str

    results['target'] = hostname
    results['status'] = host_info.state()

    # Extract open ports and filter out non-open ports
    if 'tcp' in host_info:
        for port in host_info['tcp']:
            # CRITICAL FIX: Ensure port is stored as a string
            port_str = str(port)
            data = host_info['tcp'][port]
            if data['state'] == 'open':
                results['open_ports'].append({
                    'port': port_str,
                    'protocol': 'tcp',
                    'state': data.get('state', 'unknown'),
                    'service': data.get('name', 'N/A'),
                    'version': data.get('version', 'N/A')
                })

    if 'udp' in host_info:
        for port in host_info['udp']:
            # CRITICAL FIX: Ensure port is stored as a string
            port_str = str(port)
            data = host_info['udp'][port]
             # UDP ports can be 'open' or 'open|filtered'
            if data['state'] == 'open' or data['state'] == 'open|filtered':
                results['open_ports'].append({
                    'port': port_str,
                    'protocol': 'udp',
                    'state': data.get('state', 'unknown'),
                    'service': data.get('name', 'N/A'),
                    'version': data.get('version', 'N/A')
                })

    results['scan_details'] = {
        'command': nm.command_line(),
        'duration': nm.scanstats().get('elapsed', 'N/A')
    }

    # Sorting requires converting the port string back to an integer
    results['open_ports'].sort(key=lambda p: int(p['port']))

    return results


# --- API Endpoint ---

@app.route('/api/scan', methods=['POST'])
def run_scan():
    """
    Receives scan parameters from the frontend, runs Nmap, and returns results.
    """
    try:
        data = request.get_json()
        target = data.get('target')
        protocol = data.get('protocol')
        port_mode = data.get('port_mode')
        custom_ports = data.get('ports') if port_mode == 'custom' else None

        if not target:
            return jsonify({'error': 'Target IP or Host is required.'}), 400

        # Ensure target is a string before passing to nmap.scan
        target_str = str(target)

        # 1. Determine Nmap Arguments
        args = determine_nmap_arguments(protocol, port_mode, custom_ports)
        print(f"Executing scan on {target_str} with arguments: {args}") # Log command to server console

        # 2. Execute Nmap Scan
        nm.scan(hosts=target_str, arguments=args, timeout=120)

        # 3. Parse and Return Results
        host_ips = nm.all_hosts()
        if not host_ips:
            return jsonify({'error': 'Scan failed or host is unreachable. Nmap returned no host data.'}), 400

        target_ip_scanned = host_ips[0]

        # Use the nm object (which is callable by IP after a scan) and the scanned IP for parsing
        # CRITICAL FIX: Ensure target_ip_scanned is passed as a string to parse_nmap_results
        parsed_results = parse_nmap_results(nm, str(target_ip_scanned))

        # Final checks
        if parsed_results.get('error_message'):
            return jsonify({'error': parsed_results['error_message']}), 400

        if parsed_results['status'] != 'up' and parsed_results['status'] != 'unknown':
            return jsonify({'error': f'Host is reported as {parsed_results["status"].upper()}. No open ports found.'}), 200

        if not parsed_results['open_ports']:
            return jsonify({'error': f'Scan complete. Host is {parsed_results["status"].upper()}, but no OPEN ports were found using the selected options.'}), 200


        return jsonify(parsed_results), 200

    except nmap.PortScannerError as e:
        print(f"Nmap execution error: {e}")
        return jsonify({'error': f'Nmap execution error. Check Nmap installation/path. Details: {str(e)}'}), 500
    except subprocess.CalledProcessError as e:
        print(f"Subprocess error: {e}")
        return jsonify({'error': f'Subprocess error during Nmap execution. Check server console for details.'}), 500
    except Exception as e:
        # General error catcher, printing the error to the console for your debugging
        print(f"*** UNEXPECTED SERVER ERROR: {e} ***")
        # Return a generic message to the client, but log the specific error on the server side
        return jsonify({'error': f"An unexpected server error occurred. Please check the server console for debugging information."}), 500

# --- Run Flask App ---
if __name__ == '__main__':
    # Running on all interfaces (0.0.0.0) so it's accessible from other machines
    app.run(host='0.0.0.0', port=5000, debug=True)