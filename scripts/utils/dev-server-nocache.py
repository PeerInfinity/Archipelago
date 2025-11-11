#!/usr/bin/env python3
"""
Development server with cache disabled.
This prevents browser caching issues during development.
"""
import http.server
import socketserver
from datetime import datetime
import os

class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP request handler with cache control headers."""

    def end_headers(self):
        """Add no-cache headers to all responses."""
        self.send_no_cache_headers()
        super().end_headers()

    def send_no_cache_headers(self):
        """Send headers to prevent browser caching."""
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        # Add timestamp to help identify fresh responses
        self.send_header("X-Timestamp", datetime.now().isoformat())

    def log_message(self, format, *args):
        """Override to add timestamp to console logs."""
        timestamp = datetime.now().strftime('%H:%M:%S')
        print(f"[{timestamp}] {format % args}")

def main():
    PORT = 8000

    # Change to the project root directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    os.chdir(project_root)

    print(f"Starting development server at http://localhost:{PORT}/")
    print("Cache-Control headers enabled - browser caching disabled")
    print(f"Serving from: {os.getcwd()}")
    print("Press Ctrl+C to stop")
    print("-" * 50)

    with socketserver.TCPServer(("", PORT), NoCacheHTTPRequestHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped")

if __name__ == "__main__":
    main()