"""
Flask application for the rule format converter web UI.
"""

import json
import time
from pathlib import Path
from typing import Any, Dict

from flask import Flask, render_template, request, jsonify

# Create Flask app
app = Flask(__name__, template_folder='templates')


def _convert_python_to_json(code: str) -> Dict[str, Any]:
    """Convert Python code to JSON rule."""
    from ..python_to_json import convert_python_to_json

    start = time.time()
    rule, warnings = convert_python_to_json(code)
    elapsed = (time.time() - start) * 1000  # ms

    return {
        'success': True,
        'result': rule,
        'warnings': warnings,
        'elapsed_ms': round(elapsed, 2)
    }


def _convert_json_to_python(rule: Dict[str, Any], output_format: str = 'expression') -> Dict[str, Any]:
    """Convert JSON rule to Python code."""
    from ..json_to_python import convert_json_to_python, convert_json_to_lambda, convert_json_to_function

    start = time.time()

    if output_format == 'lambda':
        code, warnings = convert_json_to_lambda(rule)
    elif output_format == 'function':
        code, warnings = convert_json_to_function(rule)
    else:
        code, warnings = convert_json_to_python(rule)

    elapsed = (time.time() - start) * 1000  # ms

    return {
        'success': True,
        'result': code,
        'warnings': warnings,
        'elapsed_ms': round(elapsed, 2)
    }


@app.route('/')
def index():
    """Serve the main page."""
    return render_template('index.html')


@app.route('/api/python-to-json', methods=['POST'])
def api_python_to_json():
    """API endpoint: Convert Python code to JSON."""
    try:
        data = request.get_json()
        if not data or 'code' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing "code" field in request body'
            }), 400

        code = data['code']
        if not code.strip():
            return jsonify({
                'success': True,
                'result': None,
                'warnings': [],
                'elapsed_ms': 0
            })

        result = _convert_python_to_json(code)
        return jsonify(result)

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/json-to-python', methods=['POST'])
def api_json_to_python():
    """API endpoint: Convert JSON rule to Python code."""
    try:
        data = request.get_json()
        if not data or 'rule' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing "rule" field in request body'
            }), 400

        rule = data['rule']
        output_format = data.get('format', 'expression')

        if rule is None:
            return jsonify({
                'success': True,
                'result': '',
                'warnings': [],
                'elapsed_ms': 0
            })

        result = _convert_json_to_python(rule, output_format)
        return jsonify(result)

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/validate-json', methods=['POST'])
def api_validate_json():
    """API endpoint: Validate JSON syntax."""
    try:
        data = request.get_json()
        if not data or 'json' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing "json" field in request body'
            }), 400

        json_str = data['json']
        if not json_str.strip():
            return jsonify({
                'success': True,
                'valid': True,
                'parsed': None
            })

        try:
            parsed = json.loads(json_str)
            return jsonify({
                'success': True,
                'valid': True,
                'parsed': parsed
            })
        except json.JSONDecodeError as e:
            return jsonify({
                'success': True,
                'valid': False,
                'error': str(e),
                'line': e.lineno,
                'column': e.colno
            })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


def run_server(host: str = '127.0.0.1', port: int = 8080, debug: bool = False, open_browser: bool = True):
    """Run the Flask development server."""
    import webbrowser
    import threading

    url = f'http://{host}:{port}'
    print(f"Starting Rule Format Converter Web UI at {url}")
    print("Press Ctrl+C to stop")

    if open_browser:
        # Open browser after a short delay to let server start
        def open_browser_delayed():
            time.sleep(0.5)
            webbrowser.open(url)

        threading.Thread(target=open_browser_delayed, daemon=True).start()

    app.run(host=host, port=port, debug=debug)
