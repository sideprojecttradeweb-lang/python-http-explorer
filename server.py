import json
import os
import time
import platform
import random
from http.server import BaseHTTPRequestHandler, HTTPServer
import urllib.parse

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
        if path == "/api/stats":
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
        body_str = body_bytes.decode("utf-8")

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

def run_server(port=8000):
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
    run_server()
