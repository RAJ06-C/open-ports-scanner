import json
import subprocess
from flask import Flask, request, jsonify
from flask_cors import CORS
import nmap
import traceback

# ---------------------------
# Flask App Configuration
# ---------------------------
app = Flask(__name__)
CORS(app)  # Allow requests from your frontend (localhost)

nm = nmap.PortScanner()


# ---------------------------
# Helper Function: Build Nmap Command
# ---------------------------
def build_nmap_args(protocol: str, port_mode: str, custom_ports: str = None) -> str:
    """
    Constructs nmap arguments based on user input.
    """
    args = "-T4 -n -PN"  # performance, skip DNS, skip host discovery

    # Protocol
    if protocol.lower() == "udp":
        args += " -sU"
    else:
        args += " -sT"  # default to TCP

    # Port Mode
    if port_mode and port_mode.startswith("top"):
        num_ports = ''.join(filter(str.isdigit, port_mode))
        args += f" --top-ports {num_ports or 100}"
    elif port_mode == "custom" and custom_ports:
        clean_ports = str(custom_ports).replace(" ", "")
        args += f" -p {clean_ports}"
    else:
        args += " --top-ports 100"

    return args


# ---------------------------
# Helper Function: Parse Results
# ---------------------------
def parse_results(scanner: nmap.PortScanner, host: str):
    """
    Extracts structured JSON from nmap scan result.
    """
    host_str = str(host)
    result = {
        "target_ip": host_str,
        "status": "unknown",
        "open_ports": [],
        "scan_duration": 0.0,
        "protocol": "tcp",
        "ports_list": "",
        "error": None
    }

    # Check host presence
    scanned_hosts = [str(h) for h in scanner.all_hosts()]
    if host_str not in scanned_hosts:
        result["error"] = f"No data returned for {host_str}. Host may be down or filtered."
        return result

    host_info = scanner[host_str]
    result["status"] = host_info.state()

    # --- TCP Ports ---
    if "tcp" in host_info:
        for port, data in host_info["tcp"].items():
            if data.get("state") == "open":
                result["open_ports"].append({
                    "port": port,
                    "protocol": "tcp",
                    "state": data.get("state"),
                    "service": data.get("name", "N/A"),
                    "version": data.get("version", "N/A"),
                })

    # --- UDP Ports ---
    if "udp" in host_info:
        for port, data in host_info["udp"].items():
            if data.get("state") in ("open", "open|filtered"):
                result["open_ports"].append({
                    "port": port,
                    "protocol": "udp",
                    "state": data.get("state"),
                    "service": data.get("name", "N/A"),
                    "version": data.get("version", "N/A"),
                })

    # --- Scan Details ---
    try:
        result["scan_duration"] = float(scanner.scanstats().get("elapsed", "0.0"))
    except Exception:
        result["scan_duration"] = 0.0

    result["open_ports"].sort(key=lambda p: int(p["port"]))
    return result


# ---------------------------
# Main Scan Endpoint
# ---------------------------
@app.route("/api/scan", methods=["POST"])
def api_scan():
    try:
        data = request.get_json(force=True)

        target = str(data.get("target") or data.get("target_ip"))
        protocol = data.get("protocol", "tcp")
        port_mode = data.get("port_mode", "top100")
        custom_ports = data.get("ports", "")

        if not target:
            return jsonify({"error": "Target IP or Host is required."}), 400

        # Build Nmap Arguments
        args = build_nmap_args(protocol, port_mode, custom_ports)
        print(f"Executing scan on {target} with arguments: {args}")

        # Run Scan
        nm.scan(hosts=target, arguments=args, timeout=120)

        hosts = nm.all_hosts()
        if not hosts:
            return jsonify({"error": "No hosts found. Target may be down or unreachable."}), 400

        # Parse & Return Result
        result_data = parse_results(nm, hosts[0])
        result_data["protocol"] = protocol
        result_data["ports_list"] = custom_ports if port_mode == "custom" else port_mode

        if result_data.get("error"):
            return jsonify(result_data), 400

        return jsonify(result_data), 200

    except nmap.PortScannerError as e:
        print(f"[NMAP ERROR] {e}")
        return jsonify({"error": f"Nmap execution error: {str(e)}"}), 500

    except subprocess.CalledProcessError as e:
        print(f"[SUBPROCESS ERROR] {e}")
        return jsonify({"error": "Subprocess failed during Nmap execution."}), 500

    except Exception as e:
        print("*** UNEXPECTED SERVER ERROR ***")
        traceback.print_exc()
        return jsonify({"error": f"Unexpected server error: {str(e)}"}), 500


# ---------------------------
# Run Flask App
# ---------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
