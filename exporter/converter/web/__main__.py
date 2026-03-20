#!/usr/bin/env python3
"""
Entry point for running the web UI as a module.

Usage:
    python -m exporter.converter.web
    python -m exporter.converter.web --port 8080
    python -m exporter.converter.web --no-browser
"""

import argparse
import sys


def main():
    parser = argparse.ArgumentParser(
        description='Rule Format Converter Web UI',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python -m exporter.converter.web
    python -m exporter.converter.web --port 9000
    python -m exporter.converter.web --host 0.0.0.0 --port 8080
    python -m exporter.converter.web --no-browser
        """
    )

    parser.add_argument(
        '--host',
        default='127.0.0.1',
        help='Host to bind to (default: 127.0.0.1)'
    )

    parser.add_argument(
        '--port', '-p',
        type=int,
        default=8080,
        help='Port to listen on (default: 8080)'
    )

    parser.add_argument(
        '--debug',
        action='store_true',
        help='Enable Flask debug mode'
    )

    parser.add_argument(
        '--no-browser',
        action='store_true',
        help='Do not open browser automatically'
    )

    args = parser.parse_args()

    try:
        from .app import run_server
        run_server(
            host=args.host,
            port=args.port,
            debug=args.debug,
            open_browser=not args.no_browser
        )
    except ImportError as e:
        print(f"Error: Missing dependency. Please install Flask:", file=sys.stderr)
        print(f"  pip install flask", file=sys.stderr)
        print(f"\nOriginal error: {e}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nShutting down...")
        sys.exit(0)


if __name__ == '__main__':
    main()
