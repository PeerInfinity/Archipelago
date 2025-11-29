#!/usr/bin/env python3
"""
Export yacht_weights data from Yacht Dice world to JSON format.

This script reads the yacht_weights dictionary from worlds/yachtdice/YachtWeights.py
and exports it to a JSON file that can be loaded by the JavaScript helper function.
"""

import json
import sys
from pathlib import Path

# Add the project root to the path
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root))

from worlds.yachtdice.YachtWeights import yacht_weights

def convert_yacht_weights_to_json():
    """
    Convert yacht_weights dictionary to JSON-serializable format.

    The yacht_weights dict has tuple keys like:
    ("Category Ones", 1, 1): {0: 100000, 1: 66509}

    We need to convert to JSON with string keys:
    "Category Ones,1,1": {"0": 100000, "1": 66509}
    """
    json_weights = {}

    for key, distribution in yacht_weights.items():
        # Key is a tuple: (category_name, num_dice, num_rolls)
        category_name, num_dice, num_rolls = key

        # Create string key for JSON
        json_key = f"{category_name},{num_dice},{num_rolls}"

        # Convert distribution dict to have string keys (JSON requirement)
        json_distribution = {str(score): probability for score, probability in distribution.items()}

        json_weights[json_key] = json_distribution

    return json_weights

def main():
    print("Exporting yacht_weights to JSON...")
    print(f"Total entries in yacht_weights: {len(yacht_weights)}")

    # Convert to JSON-serializable format
    json_weights = convert_yacht_weights_to_json()

    # Output path
    output_path = project_root / "frontend" / "modules" / "shared" / "gameLogic" / "yachtdice" / "yacht_weights.json"

    # Write to JSON file
    with open(output_path, 'w') as f:
        json.dump(json_weights, f, separators=(',', ':'))  # Compact format

    # Get file size
    file_size = output_path.stat().st_size
    file_size_mb = file_size / (1024 * 1024)

    print(f"✓ Exported {len(json_weights)} entries to {output_path}")
    print(f"  File size: {file_size:,} bytes ({file_size_mb:.2f} MB)")

    # Sample a few entries to verify
    print("\nSample entries:")
    for i, (key, value) in enumerate(list(json_weights.items())[:3]):
        print(f"  {key}: {list(value.items())[:5]}...")
        if i >= 2:
            break

if __name__ == "__main__":
    main()
