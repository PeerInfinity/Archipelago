"""
Web UI for the rule format converter.

Run with:
    python -m exporter.converter.web

Or import the Flask app:
    from exporter.converter.web import app
"""

from .app import app, run_server

__all__ = ['app', 'run_server']
