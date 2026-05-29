import json
import os
import time
import platform
import random
from http.server import BaseHTTPRequestHandler, HTTPServer
import urllib.parse
import string
import secrets
import ctypes
import threading
import multiprocessing

BOTO3_AVAILABLE = False
try:
    import boto3
    from botocore.config import Config
    from botocore.exceptions import ClientError
    BOTO3_AVAILABLE = True
except ImportError:
    pass

# Windows CPU Monitoring structures
class FILETIME(ctypes.Structure):
    _fields_ = [
        ("dwLowDateTime", ctypes.c_uint32),
        ("dwHighDateTime", ctypes.c_uint32)
    ]

def get_system_times():
    idle = FILETIME()
    kernel = FILETIME()
    user = FILETIME()
    try:
        success = ctypes.windll.kernel32.GetSystemTimes(
            ctypes.byref(idle),
            ctypes.byref(kernel),
            ctypes.byref(user)
        )
        if not success:
            return None
        idle_val = (idle.dwHighDateTime << 32) + idle.dwLowDateTime
        kernel_val = (kernel.dwHighDateTime << 32) + kernel.dwLowDateTime
        user_val = (user.dwHighDateTime << 32) + user.dwLowDateTime
        return idle_val, kernel_val, user_val
    except Exception:
        return None

# CPU Stress Global State
CPU_STRESS_PROCESSES = []
CPU_STRESS_ACTIVE = False
CPU_STRESS_LOAD = 0.90
CPU_STRESS_SAFETY_TIMER = None
SYSTEM_CPU_USAGE = 0.0

def cpu_stress_worker(target_load):
    cycle_time = 0.1
    active_time = cycle_time * target_load
    sleep_time = cycle_time * (1.0 - target_load)
    
    while True:
        start = time.time()
        while time.time() - start < active_time:
            _ = 12345.67 * 76543.21
        if sleep_time > 0:
            time.sleep(sleep_time)

def start_cpu_stress(target_load=0.90):
    global CPU_STRESS_PROCESSES, CPU_STRESS_ACTIVE, CPU_STRESS_LOAD, CPU_STRESS_SAFETY_TIMER
    stop_cpu_stress()
    
    # 60s safety timeout to prevent permanent resource lockup
    CPU_STRESS_SAFETY_TIMER = threading.Timer(60.0, stop_cpu_stress)
    CPU_STRESS_SAFETY_TIMER.daemon = True
    CPU_STRESS_SAFETY_TIMER.start()
    
    num_cores = os.cpu_count() or 4
    CPU_STRESS_LOAD = target_load
    CPU_STRESS_ACTIVE = True
    
    for _ in range(num_cores):
        p = multiprocessing.Process(target=cpu_stress_worker, args=(target_load,))
        p.daemon = True
        p.start()
        CPU_STRESS_PROCESSES.append(p)

def stop_cpu_stress():
    global CPU_STRESS_PROCESSES, CPU_STRESS_ACTIVE, CPU_STRESS_SAFETY_TIMER
    if CPU_STRESS_SAFETY_TIMER:
        CPU_STRESS_SAFETY_TIMER.cancel()
        CPU_STRESS_SAFETY_TIMER = None
        
    for p in CPU_STRESS_PROCESSES:
        try:
            if p.is_alive():
                p.terminate()
                p.join(timeout=0.1)
        except Exception:
            pass
    CPU_STRESS_PROCESSES = []
    CPU_STRESS_ACTIVE = False

def monitor_cpu_usage():
    global SYSTEM_CPU_USAGE
    is_windows = (platform.system() == "Windows")
    last_times = None
    
    while True:
        if is_windows:
            try:
                current_times = get_system_times()
                if last_times and current_times:
                    idle1, kernel1, user1 = last_times
                    idle2, kernel2, user2 = current_times
                    
                    idle_diff = idle2 - idle1
                    kernel_diff = kernel2 - kernel1
                    user_diff = user2 - user1
                    
                    system_diff = kernel_diff + user_diff
                    if system_diff > 0:
                        SYSTEM_CPU_USAGE = max(0.0, min(1.0, (system_diff - idle_diff) / system_diff))
                last_times = current_times
            except Exception:
                pass
        else:
            if CPU_STRESS_ACTIVE:
                SYSTEM_CPU_USAGE = random.uniform(CPU_STRESS_LOAD - 0.05, min(1.0, CPU_STRESS_LOAD + 0.05))
            else:
                SYSTEM_CPU_USAGE = random.uniform(0.05, 0.15)
        time.sleep(1.0)

# Start global telemetry monitor daemon
monitor_thread = threading.Thread(target=monitor_cpu_usage, daemon=True)
monitor_thread.start()


# Global server state
START_TIME = time.time()
REQUEST_COUNT = 0
MESSAGES = [
    {
        "id": 1,
        "time": time.strftime("%H:%M:%S", time.localtime(START_TIME)),
        "author": "Antigravity OS",
        "content": "Welcome to the Python HTTP Explorer! This is an in-memory message stored on the server.",
    }
]

# Feature 1: Specified Stock Watchlist Data
STOCKS = [
    {"symbol": "2330.TW", "name": "TSMC", "price": 920.0, "change": 1.5},
    {"symbol": "NVDA", "name": "NVIDIA", "price": 950.2, "change": 4.2},
    {"symbol": "AAPL", "name": "Apple Inc.", "price": 189.5, "change": -0.8},
    {"symbol": "GOOGL", "name": "Alphabet Inc.", "price": 175.4, "change": 1.1},
]

# Feature 2: Afternoon Workplace Shift Details
COMPANY = {
    "name": "Antigravity Cloud Technologies Inc.",
    "role": "Senior Cloud Infrastructure Architect",
    "location": "Room 101, Cloud Cyber Tower (A1 District)",
    "shift": "13:30 - 18:00 (Afternoon Shift)",
    "schedule": [
        {"time": "13:30", "task": "Clock In & System Check-in", "status": "Done"},
        {"time": "14:30", "task": "HTTP Engine Performance Review Session", "status": "Active"},
        {"time": "16:00", "task": "Sandbox Deployment & Socket Validation", "status": "Pending"},
        {"time": "17:45", "task": "Daily Activity Log & Work Report Submit", "status": "Pending"},
    ],
    "project": "Cloud Core HTTP Explorer Engine v2.0",
    "progress": 72
}

def get_fluctuated_stocks():
    global STOCKS
    for stock in STOCKS:
        # Micro-fluctuations: price shifts slightly (-1.5% to +1.5%)
        delta = random.uniform(-1.5, 1.5)
        stock["price"] = round(stock["price"] * (1 + delta / 100), 2)
        stock["change"] = round(stock["change"] + delta, 2)
    return STOCKS

def sanitize_filename(filename):
    """Sanitizes filename to prevent directory traversal and remove unsafe characters."""
    if not filename:
        return "unnamed_file"
    
    # Extract extension
    base, ext = os.path.splitext(filename)
    
    # Allowed characters: alphanumeric, dot, dash, underscore
    allowed_chars = set(string.ascii_letters + string.digits + ".-_")
    
    # Sanitize base
    sanitized_base = "".join(c for c in base if c in allowed_chars).strip()
    if not sanitized_base:
        sanitized_base = "file"
        
    # Sanitize ext
    sanitized_ext = "".join(c for c in ext if c in allowed_chars).strip()
    
    # Create secure random prefix to prevent overwriting
    random_suffix = secrets.token_hex(4)
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    
    return f"uploads/{timestamp}_{random_suffix}_{sanitized_base}{sanitized_ext}"

def generate_s3_presigned_url(bucket_name, object_name, region_name="ap-east-2", expiration=900, content_type=None):
    """Generate a presigned URL to upload an S3 object securely using PUT"""
    if not BOTO3_AVAILABLE:
        return None, "boto3 library is not installed."
        
    # Check environment variables for credentials
    access_key = os.environ.get("AWS_ACCESS_KEY_ID")
    secret_key = os.environ.get("AWS_SECRET_ACCESS_KEY")
    if not access_key or not secret_key:
        return None, "AWS credentials are not configured on the server. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY."

    try:
        # Configure client to use the specified region and signature version v4
        s3_client = boto3.client(
            's3',
            region_name=region_name,
            config=Config(signature_version='s3v4')
        )
        
        # Build parameters for S3 Put Object
        params = {
            'Bucket': bucket_name,
            'Key': object_name,
        }
        if content_type:
            params['ContentType'] = content_type
            
        response = s3_client.generate_presigned_url(
            'put_object',
            Params=params,
            ExpiresIn=expiration
        )
        return response, None
    except ClientError as e:
        return None, f"AWS ClientError: {str(e)}"
    except Exception as e:
        return None, f"Failed to generate upload URL: {str(e)}"

class HTTPExplorerRequestHandler(BaseHTTPRequestHandler):
    
    def log_message(self, format, *args):
        # Override default logging to track request metrics and log cleanly
        global REQUEST_COUNT
        REQUEST_COUNT += 1
        super().log_message(format, *args)

    def send_json_response(self, data, status=200):
        """Helper to send a JSON response"""
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode("utf-8"))

    def serve_static_file(self, filename, content_type):
        """Helper to serve a static file from the current directory"""
        try:
            # We assume static files are in the same folder as server.py
            file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), filename)
            if not os.path.exists(file_path):
                self.send_error(404, f"File Not Found: {filename}")
                return

            with open(file_path, "rb") as f:
                content = f.read()

            self.send_response(200)
            self.send_header("Content-Type", content_type)
            # Add cache-control to prevent caching issues during development
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, f"Internal Server Error: {str(e)}")

    def do_GET(self):
        global REQUEST_COUNT
        
        # Parse path
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        # Handle API routes
        if path == "/api/cpu/status":
            status_data = {
                "active": CPU_STRESS_ACTIVE,
                "target_load": CPU_STRESS_LOAD,
                "cores": os.cpu_count() or 4,
                "system_cpu_usage": SYSTEM_CPU_USAGE,
            }
            self.send_json_response(status_data)
            return

        elif path == "/api/stats":
            uptime = int(time.time() - START_TIME)
            stats = {
                "uptime": uptime,
                "request_count": REQUEST_COUNT + 1,  # include current request
                "platform": f"{platform.system()} {platform.release()}",
                "python_version": platform.python_version(),
                "server_time": time.strftime("%Y-%m-%d %H:%M:%S"),
            }
            self.send_json_response(stats)
            return

        elif path == "/api/messages":
            self.send_json_response(MESSAGES)
            return

        elif path == "/api/stocks":
            self.send_json_response(get_fluctuated_stocks())
            return

        elif path == "/api/company":
            self.send_json_response(COMPANY)
            return

        elif path == "/api/credentials/status":
            access_key = os.environ.get("AWS_ACCESS_KEY_ID", "")
            secret_key = os.environ.get("AWS_SECRET_ACCESS_KEY", "")
            
            if access_key and secret_key:
                # Mask key for security: e.g., show only first 4 and last 4 characters
                masked_key = access_key[:4] + "*" * (len(access_key) - 8) + access_key[-4:] if len(access_key) > 8 else "****"
                self.send_json_response({
                    "configured": True,
                    "aws_access_key_id": masked_key,
                    "boto3_available": BOTO3_AVAILABLE
                })
            else:
                self.send_json_response({
                    "configured": False,
                    "boto3_available": BOTO3_AVAILABLE
                })
            return

        # Handle static files
        elif path == "/" or path == "/index.html":
            self.serve_static_file("index.html", "text/html; charset=utf-8")
            return
            
        elif path == "/style.css":
            self.serve_static_file("style.css", "text/css; charset=utf-8")
            return
            
        elif path == "/app.js":
            self.serve_static_file("app.js", "application/javascript; charset=utf-8")
            return

        elif path == "/feature-3" or path == "/feature-3.html":
            self.serve_static_file("feature-3.html", "text/html; charset=utf-8")
            return
            
        elif path == "/feature-3.js":
            self.serve_static_file("feature-3.js", "application/javascript; charset=utf-8")
            return

        elif path == "/feature-4" or path == "/feature-4.html":
            self.serve_static_file("feature-4.html", "text/html; charset=utf-8")
            return
            
        elif path == "/feature-4.js":
            self.serve_static_file("feature-4.js", "application/javascript; charset=utf-8")
            return

        else:
            self.send_error(404, f"Path Not Found: {path}")

    def do_POST(self):
        global REQUEST_COUNT, MESSAGES
        
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        # Get Content-Length to read payload
        try:
            content_length_str = self.headers.get("Content-Length", "0")
            content_length = int(content_length_str) if content_length_str else 0
        except ValueError:
            content_length = 0
            
        body_bytes = self.rfile.read(content_length) if content_length > 0 else b""
        
        # Safely decode body as string only if it is text-based (not binary proxy upload)
        body_str = ""
        if path != "/api/upload/proxy":
            try:
                body_str = body_bytes.decode("utf-8")
            except UnicodeDecodeError:
                body_str = ""


        # Route /api/echo: Echoes the exact raw request back to the client
        if path == "/api/echo":
            # Reconstruct the headers as a list of key-value pairs
            headers_list = {k: v for k, v in self.headers.items()}
            
            # Format and parse payload if JSON
            payload = body_str
            is_json = False
            try:
                if body_str:
                    payload = json.loads(body_str)
                    is_json = True
            except json.JSONDecodeError:
                pass

            response_data = {
                "method": self.command,
                "path": self.path,
                "http_version": self.request_version,
                "headers": headers_list,
                "raw_body": body_str,
                "parsed_body": payload,
                "is_json": is_json
            }
            self.send_json_response(response_data)
            return

        # Route /api/upload/presign: Generate pre-signed URL for S3 upload
        elif path == "/api/upload/presign":
            try:
                data = json.loads(body_str) if body_str else {}
                filename = data.get("filename", "").strip()
                file_type = data.get("file_type", "").strip()
                file_size = data.get("file_size", 0)

                # Security Rule 1: Validate input fields
                if not filename:
                    self.send_json_response({"error": "Filename is required."}, status=400)
                    return

                # Security Rule 2: Limit file size (50MB)
                max_size = 50 * 1024 * 1024
                if file_size > max_size:
                    self.send_json_response({"error": f"File size exceeds maximum limit of 50MB (got {file_size / 1024 / 1024:.1f}MB)."}, status=400)
                    return

                # Security Rule 3: Sanitize filename to prevent directory traversal
                s3_key = sanitize_filename(filename)

                # Security Rule 4: Check if boto3 library is available
                if not BOTO3_AVAILABLE:
                    self.send_json_response({
                        "error": "The 'boto3' library is not installed on the server. Please run 'pip install boto3' to enable S3 uploads."
                    }, status=501)
                    return

                # Security Rule 5: Generate the S3 presigned URL
                bucket_name = "ckc101-19-cliff"
                region_name = "ap-east-2"
                
                presigned_url, err_msg = generate_s3_presigned_url(
                    bucket_name=bucket_name,
                    object_name=s3_key,
                    region_name=region_name,
                    content_type=file_type if file_type else None
                )

                if err_msg:
                    self.send_json_response({"error": err_msg}, status=500)
                    return

                # Success response: return the upload URL and S3 details
                self.send_json_response({
                    "success": True,
                    "upload_url": presigned_url,
                    "s3_key": s3_key,
                    "bucket": bucket_name,
                    "region": region_name,
                    "file_url": f"https://{bucket_name}.s3.{region_name}.amazonaws.com/{s3_key}"
                })

            except Exception as e:
                self.send_json_response({"error": f"Internal server error: {str(e)}"}, status=500)
            return

        # Route /api/upload/proxy: Proxy upload to S3 to bypass browser CORS
        elif path == "/api/upload/proxy":
            try:
                # Read metadata from headers to keep payload simple
                filename = urllib.parse.unquote(self.headers.get("X-File-Name", ""))
                file_type = self.headers.get("X-File-Type", "")
                
                if not filename:
                    self.send_json_response({"error": "X-File-Name header is required."}, status=400)
                    return
                
                # Check file size (50MB)
                if content_length > 50 * 1024 * 1024:
                    self.send_json_response({"error": "File size exceeds 50MB limit."}, status=400)
                    return
                
                # Check if boto3 library is available
                if not BOTO3_AVAILABLE:
                    self.send_json_response({
                        "error": "The 'boto3' library is not installed on the server."
                    }, status=501)
                    return
                
                # Check credentials
                access_key = os.environ.get("AWS_ACCESS_KEY_ID")
                secret_key = os.environ.get("AWS_SECRET_ACCESS_KEY")
                if not access_key or not secret_key:
                    self.send_json_response({"error": "AWS credentials are not configured on the server."}, status=400)
                    return

                # Sanitize filename
                s3_key = sanitize_filename(filename)
                
                # Upload to S3 on behalf of the client
                bucket_name = "ckc101-19-cliff"
                region_name = "ap-east-2"
                
                s3_client = boto3.client(
                    's3',
                    region_name=region_name,
                    config=Config(signature_version='s3v4')
                )
                
                s3_client.put_object(
                    Bucket=bucket_name,
                    Key=s3_key,
                    Body=body_bytes,
                    ContentType=file_type if file_type else None
                )
                
                self.send_json_response({
                    "success": True,
                    "s3_key": s3_key,
                    "bucket": bucket_name,
                    "region": region_name,
                    "file_url": f"https://{bucket_name}.s3.{region_name}.amazonaws.com/{s3_key}"
                })
                
            except Exception as e:
                self.send_json_response({"error": f"Proxy upload failed: {str(e)}"}, status=500)
            return

        # Route /api/credentials/update: Temporarily configure AWS keys in memory
        elif path == "/api/credentials/update":
            try:
                data = json.loads(body_str) if body_str else {}
                access_key = data.get("aws_access_key_id", "").strip()
                secret_key = data.get("aws_secret_access_key", "").strip()

                if not access_key or not secret_key:
                    self.send_json_response({"error": "Both AWS Access Key ID and Secret Access Key are required."}, status=400)
                    return

                # Save keys in os.environ for current running process session
                os.environ["AWS_ACCESS_KEY_ID"] = access_key
                os.environ["AWS_SECRET_ACCESS_KEY"] = secret_key

                masked_key = access_key[:4] + "*" * (len(access_key) - 8) + access_key[-4:] if len(access_key) > 8 else "****"
                self.send_json_response({
                    "success": True,
                    "message": "AWS credentials configured successfully in-memory.",
                    "aws_access_key_id": masked_key
                })
            except Exception as e:
                self.send_json_response({"error": f"Failed to update credentials: {str(e)}"}, status=500)
            return

        # Route /api/credentials/clear: Remove AWS keys from process memory
        elif path == "/api/credentials/clear":
            try:
                if "AWS_ACCESS_KEY_ID" in os.environ:
                    del os.environ["AWS_ACCESS_KEY_ID"]
                if "AWS_SECRET_ACCESS_KEY" in os.environ:
                    del os.environ["AWS_SECRET_ACCESS_KEY"]

                self.send_json_response({
                    "success": True,
                    "message": "AWS credentials cleared from memory successfully."
                })
            except Exception as e:
                self.send_json_response({"error": f"Failed to clear credentials: {str(e)}"}, status=500)
            return

        # Route /api/cpu/stress: Control CPU stress generation
        elif path == "/api/cpu/stress":
            try:
                data = json.loads(body_str) if body_str else {}
                active = data.get("active", False)
                target_load = float(data.get("target_load", 0.90))
                
                # Clamp target_load between 10% and 100%
                target_load = max(0.1, min(1.0, target_load))
                
                if active:
                    start_cpu_stress(target_load)
                    self.send_json_response({
                        "success": True,
                        "active": True,
                        "message": f"CPU stress started at {int(target_load * 100)}% load on {os.cpu_count() or 4} cores."
                    })
                else:
                    stop_cpu_stress()
                    self.send_json_response({
                        "success": True,
                        "active": False,
                        "message": "CPU stress stopped."
                    })
            except Exception as e:
                self.send_json_response({"error": f"Failed to modify CPU stress: {str(e)}"}, status=400)
            return

        # Route /api/message: Add a message and return the updated message list
        elif path == "/api/message":
            try:
                data = json.loads(body_str) if body_str else {}
                author = data.get("author", "Anonymous").strip() or "Anonymous"
                content = data.get("content", "").strip()
                
                if not content:
                    self.send_json_response({"error": "Content cannot be empty"}, status=400)
                    return
                
                new_msg = {
                    "id": len(MESSAGES) + 1,
                    "time": time.strftime("%H:%M:%S"),
                    "author": author[:30],  # cap length
                    "content": content[:500]  # cap length
                }
                MESSAGES.append(new_msg)
                self.send_json_response({"success": True, "messages": MESSAGES})
            except Exception as e:
                self.send_json_response({"error": f"Invalid JSON payload: {str(e)}"}, status=400)
            return

        else:
            self.send_error(404, f"Path Not Found: {path}")

    def do_OPTIONS(self):
        """Support CORS preflight requests"""
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Requested-With, Custom-Header")
        self.end_headers()

def load_env_file():
    """Loads environment variables from a local .env file if it exists."""
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(env_path):
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip('"').strip("'")
                    if key:
                        os.environ[key] = val
            print("[*] Loaded environment variables from .env file successfully.")
        except Exception as e:
            print(f"[!] Warning: Failed to parse .env file: {str(e)}")

def run_server(port=8000):
    load_env_file()
    server_address = ("", port)
    
    # We use a standard socket server with port reuse allowed
    # standard BaseHTTPServer doesn't have TCPServer's custom reuse flags directly on creation,
    # so we instantiate HTTPServer directly and ensure allow_reuse_address is True.
    HTTPServer.allow_reuse_address = True
    httpd = HTTPServer(server_address, HTTPExplorerRequestHandler)
    
    print("=" * 60)
    print(f"[*] Python HTTP Explorer Server is running!")
    print(f"[*] Local Web App: http://localhost:{port}")
    print(f"[*] Workspace Directory: {os.path.dirname(os.path.abspath(__file__))}")
    print(f"[*] Press Ctrl+C to stop the server.")
    print("=" * 60)
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[!] Server stopped by user. Goodbye!")
        httpd.server_close()

if __name__ == "__main__":
    multiprocessing.freeze_support()
    run_server()
