"""
Data loading functions for test results and world mappings.
"""

import json
import os
from typing import Dict, Any


def load_full_world_mapping(project_root: str) -> Dict[str, Dict[str, Any]]:
    """
    Load the full world mapping from JSON files, including file sizes.

    Loads both world-mapping.json (official/bundled worlds) and
    world-mapping-unofficial.json (apworlds) if they exist.
    Unofficial mapping takes precedence for any conflicts.

    Returns a dict mapping game names to their full info dict.
    """
    mapping = {}

    # Load official world mapping
    official_file = os.path.join(project_root, 'scripts/data/world-mapping.json')
    try:
        with open(official_file, 'r') as f:
            mapping = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Error loading official world mapping file {official_file}: {e}")

    # Load unofficial world mapping (apworlds) and merge
    unofficial_file = os.path.join(project_root, 'scripts/data/world-mapping-unofficial.json')
    try:
        with open(unofficial_file, 'r') as f:
            unofficial_mapping = json.load(f)
            mapping.update(unofficial_mapping)
    except FileNotFoundError:
        pass  # Unofficial mapping is optional
    except json.JSONDecodeError as e:
        print(f"Warning: Could not parse unofficial world mapping file {unofficial_file}: {e}")

    return mapping


def load_test_results(results_file: str) -> Dict[str, Any]:
    """Load the template test results from JSON file."""
    try:
        with open(results_file, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Error loading results file {results_file}: {e}")
        return {}
