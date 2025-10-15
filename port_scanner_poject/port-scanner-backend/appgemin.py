import json
import subprocess
from flask import Flask, request, jsonify
# IMPORT THE CORS EXTENSION
from flask_cors import CORS
import nmap

# Initialize the Flask application
app = Flask(__name__)

# --- CORS CONFIGURATION ---
CORS(app)

# --- Configuration ---
nm = nmap.PortScanner()

# --- Helper Functions ---

def determine_nmap_arguments(protocol, port_mode, custom_ports):
    """
    Constructs the command-line arguments for Nmap based on user input.
    """
    args = '-T4 -n -PN'

    if protocol == 'TCP':
        args += ' -sT'
    elif protocol == 'UDP':
        args += ' -sU'
    else:
        args += ' -sT'

    if isinstance(port_mode, str) and 'top' in port_mode:
        num_ports = port_mode.replace('top', '')
        args += f' --top-ports {num_ports}'
    elif port_mode == 'custom' and custom_ports:
        cleaned_ports = str(custom_ports).replace(' ', '')
        args += f' -p {cleaned_ports}'
    else:
        args += ' -p 21,22,23,80,443'

    return args


def parse_nmap_results(portscanner_obj, target_ip):
    """
    Parses the PortScanner object results for a single target IP and
    returns a friendly JSON dict for the frontend.
    """
    target_ip_str = str(target_ip)

    results = {
        'target': target_ip_str,
        'status': 'Error',
        'open_ports': [],
        'error_message': None,
        'scan_details': {}
    }

    # Make sure we check against the scanned host list (all_hosts returns strings)
    scanned_hosts = [str(h) for h in portscanner_obj.all_hosts()]
    if target_ip_str not in scanned_hosts:
        results['error_message'] = f"Scan returned no data for host {target_ip_str}. Target may be down or filtered."
        return results

    # Get host info safely
    host_info = portscanner_obj[target_ip_str]

    # Hostname (fall back to ip string)
    hostname = host_info.hostname() if host_info.hostname() else target_ip_str
    results['target'] = hostname
    results['status'] = host_info.state()

    # Work with tcp/udp dicts safely using .get()
    tcp_dict = host_info.get('tcp', {}) if isinstance(host_info, dict) or hasattr(host_info, 'get') else {}
    for port in tcp_dict:
        port_str = str(port)
        data = tcp_dict[port]
        if data.get('state') == 'open':
            results['open_ports'].append({
                'port': port_str,
                'protocol': 'tcp',
                'state': data.get('state', 'unknown'),
                'service': data.get('name', 'N/A'),
                'version': data.get('version', 'N/A')
            })

    udp_dict = host_info.get('udp', {}) if isinstance(host_info, dict) or hasattr(host_info, 'get') else {}
    for port in udp_dict:
        port_str = str(port)
        data = udp_dict[port]
        if data.get('state') in ('open', 'open|filtered'):
            results['open_ports'].append({
                'port': port_str,
                'protocol': 'udp',
                'state': data.get('state', 'unknown'),
                'service': data.get('name', 'N/A'),
                'version': data.get('version', 'N/A')
            })

    # Add scan metadata
    try:
        cmd = portscanner_obj.command_line()
    except Exception:
        cmd = 'N/A'
    try:
        dur = portscanner_obj.scanstats().get('elapsed', 'N/A')
    except Exception:
        dur = 'N/A'

    results['scan_details'] = {
        'command': cmd,
        'duration': dur
    }

    results['open_ports'].sort(key=lambda p: int(p['port']))
    return results


# --- API Endpoint ---

@app.route('/api/scan', methods=['POST'])
def run_scan():
    try:
        data = request.get_json()
        target = data.get('target')
        protocol = data.get('protocol')
        port_mode = data.get('port_mode')
        custom_ports = data.get('ports') if port_mode == 'custom' else None

        if not target:
            return jsonify({'error': 'Target IP or Host is required.'}), 400

        # Ensure we work with strings everywhere
        target_str = str(target)

        args = determine_nmap_arguments(protocol, port_mode, custom_ports)
        print(f"Executing scan on {target_str} with arguments: {args}")

        # Run the scan (ensure arguments are strings)
        nm.scan(hosts=target_str, arguments=str(args), timeout=120)

        host_ips = nm.all_hosts()
        if not host_ips:
            return jsonify({'error': 'Scan failed or host is unreachable. Nmap returned no host data.'}), 400

        target_ip_scanned = str(host_ips[0])

        parsed_results = parse_nmap_results(nm, target_ip_scanned)

        if parsed_results.get('error_message'):
            return jsonify({'error': parsed_results['error_message']}), 400

        if parsed_results['status'] not in ('up', 'unknown'):
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
        # Log full exception and types to help debugging
        print("*** UNEXPECTED SERVER ERROR: {} ***".format(repr(e)))
        try:
            import traceback
            traceback.print_exc()
        except Exception:
            pass
        return jsonify({'error': 'An unexpected server error occurred. Please check the server console for debugging information.'}), 500


# --- Run Flask App ---
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
