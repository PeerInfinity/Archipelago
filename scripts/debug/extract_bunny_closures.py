#!/usr/bin/env python3
"""
Diagnostic script to demonstrate that bunny rule data CAN be extracted from closures.

This script shows how to extract the path data from ALttP bunny rules without
reconstructing it - proving the data exists in the generated world's closures.

Usage:
    python scripts/debug/extract_bunny_closures.py
"""

import sys
import os

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, project_root)

from typing import Dict, List, Any, Optional, Callable
import json


def extract_closure_vars(func: Callable) -> Dict[str, Any]:
    """Extract closure variables from a function."""
    result = {}
    if not hasattr(func, '__closure__') or func.__closure__ is None:
        return result
    if not hasattr(func, '__code__'):
        return result

    freevars = func.__code__.co_freevars
    for name, cell in zip(freevars, func.__closure__):
        try:
            result[name] = cell.cell_contents
        except ValueError:
            pass  # Empty cell
    return result


def analyze_bunny_rule_closures(access_rule: Callable, depth: int = 0) -> Dict[str, Any]:
    """
    Recursively extract closure data from a bunny rule.

    This demonstrates that the path/entrance data IS stored and extractable.
    """
    indent = "  " * depth
    result = {
        'type': 'unknown',
        'closure_vars': {},
        'qualname': getattr(access_rule, '__qualname__', 'unknown'),
    }

    if not callable(access_rule):
        result['type'] = 'not_callable'
        result['value'] = str(access_rule)
        return result

    closure_vars = extract_closure_vars(access_rule)
    result['closure_vars'] = {k: type(v).__name__ for k, v in closure_vars.items()}

    # Detect pattern by closure variable names
    var_names = set(closure_vars.keys())

    # Pattern: add_rule combined lambda (rule, old_rule)
    if 'rule' in var_names or 'old_rule' in var_names:
        result['type'] = 'add_rule_combined'
        result['children'] = {}

        if 'rule' in closure_vars and callable(closure_vars['rule']):
            result['children']['rule'] = analyze_bunny_rule_closures(closure_vars['rule'], depth + 1)
        if 'old_rule' in closure_vars and callable(closure_vars['old_rule']):
            result['children']['old_rule'] = analyze_bunny_rule_closures(closure_vars['old_rule'], depth + 1)
        return result

    # Pattern: options_to_access_rule (options list)
    if 'options' in var_names:
        result['type'] = 'options_to_access_rule'
        options = closure_vars['options']
        if isinstance(options, (list, tuple)):
            result['options_count'] = len(options)
            result['options'] = []
            for i, opt in enumerate(options):
                if callable(opt):
                    result['options'].append(analyze_bunny_rule_closures(opt, depth + 1))
                else:
                    result['options'].append({'type': 'non_callable', 'value': str(opt)})
        return result

    # Pattern: path_to_access_rule (path, entrance)
    if 'path' in var_names and 'entrance' in var_names:
        result['type'] = 'path_to_access_rule'

        # Extract entrance info
        entrance = closure_vars['entrance']
        result['entrance'] = {
            'name': getattr(entrance, 'name', str(entrance)),
            'type': type(entrance).__name__,
        }
        if hasattr(entrance, 'parent_region'):
            result['entrance']['parent_region'] = getattr(entrance.parent_region, 'name', None)
        if hasattr(entrance, 'connected_region'):
            result['entrance']['connected_region'] = getattr(entrance.connected_region, 'name', None)

        # Extract path rules
        path = closure_vars['path']
        if isinstance(path, (list, tuple)):
            result['path_length'] = len(path)
            result['path_rules'] = []
            for i, rule in enumerate(path):
                if callable(rule):
                    # These are the original access rules from regions in the path
                    rule_info = {
                        'qualname': getattr(rule, '__qualname__', 'unknown'),
                        'closure_vars': {k: type(v).__name__ for k, v in extract_closure_vars(rule).items()},
                    }
                    # Try to get bytecode constants (item names, etc.)
                    if hasattr(rule, '__code__'):
                        consts = [c for c in rule.__code__.co_consts if isinstance(c, str) and c]
                        if consts:
                            rule_info['constants'] = consts
                        names = list(rule.__code__.co_names) if hasattr(rule.__code__, 'co_names') else []
                        if names:
                            rule_info['names'] = names
                    result['path_rules'].append(rule_info)
                else:
                    result['path_rules'].append({'type': 'non_callable', 'value': str(rule)})
        return result

    # Pattern: Simple item check (player captured)
    if 'player' in var_names and len(var_names) <= 2:
        result['type'] = 'simple_check'
        if hasattr(access_rule, '__code__'):
            consts = [c for c in access_rule.__code__.co_consts if isinstance(c, str) and c]
            if consts:
                result['item_names'] = consts
        return result

    # Unknown pattern - still extract what we can
    result['type'] = 'unknown_pattern'
    if hasattr(access_rule, '__code__'):
        consts = [c for c in access_rule.__code__.co_consts if isinstance(c, str) and c]
        if consts:
            result['constants'] = consts
        names = list(access_rule.__code__.co_names) if hasattr(access_rule.__code__, 'co_names') else []
        if names:
            result['names'] = names

    return result


def main():
    """Test bunny rule closure extraction on a generated ALttP world."""
    print("=" * 70)
    print("Bunny Rule Closure Extraction Test")
    print("=" * 70)

    # Generate an ALttP world with entrance shuffle
    from test.general import setup_multiworld

    print("\n1. Creating test world with inverted mode + entrance shuffle...")

    # Use the test helper to create a properly initialized world
    from worlds.alttp import ALTTPWorld

    # Create multiworld with test helper - this properly initializes options
    options = {
        'mode': 'inverted',
        'entrance_shuffle': 'insanity',
        'glitches_required': 'no_glitches',
    }

    print(f"   Mode: inverted, Entrance shuffle: insanity")

    # Generate the world
    print("\n2. Generating world (this creates bunny rules)...")
    try:
        multiworld = setup_multiworld(ALTTPWorld, options=options, seed=12345)
        print("   World generation completed!")
    except Exception as e:
        print(f"   Error during generation: {e}")
        import traceback
        traceback.print_exc()
        return

    # Find a location with bunny rules (in Dark World for inverted mode)
    print("\n3. Finding locations with bunny rules...")

    # In inverted mode, Light World requires Moon Pearl (bunny area)
    # Look for locations in Light World regions
    light_world_locations = []
    for loc in multiworld.get_locations(1):
        region = loc.parent_region
        if region and getattr(region, 'is_light_world', False):
            light_world_locations.append(loc)

    print(f"   Found {len(light_world_locations)} Light World locations (bunny in inverted)")

    # First, find locations with complex options_to_access_rule patterns (mixed regions)
    print("\n4. Searching for complex bunny rules (options_to_access_rule pattern)...")

    complex_locations = []
    for loc in light_world_locations:
        if not hasattr(loc, 'access_rule') or loc.access_rule is None:
            continue

        # Analyze the access rule closures
        analysis = analyze_bunny_rule_closures(loc.access_rule)

        if analysis['type'] == 'add_rule_combined':
            children = analysis.get('children', {})
            if 'rule' in children:
                rule_analysis = children['rule']
                if rule_analysis.get('type') == 'options_to_access_rule':
                    complex_locations.append((loc, analysis, rule_analysis))

    print(f"   Found {len(complex_locations)} locations with options_to_access_rule pattern")

    # Analyze a few complex locations in detail
    print("\n5. Detailed analysis of complex bunny rules...")

    for loc, analysis, rule_analysis in complex_locations[:3]:
        print(f"\n   Location: {loc.name}")
        print(f"   Region: {loc.parent_region.name if loc.parent_region else 'None'}")
        print(f"   Options count: {rule_analysis.get('options_count', 0)}")

        for i, opt in enumerate(rule_analysis.get('options', [])[:3]):
            if opt.get('type') == 'path_to_access_rule':
                ent = opt.get('entrance', {})
                print(f"\n   Option {i}: via entrance '{ent.get('name')}'")
                print(f"     Parent region: {ent.get('parent_region')}")
                print(f"     Connected region: {ent.get('connected_region')}")
                print(f"     Path length: {opt.get('path_length', 0)}")

                for j, path_rule in enumerate(opt.get('path_rules', [])[:5]):
                    print(f"       Path rule[{j}]:")
                    print(f"         qualname: {path_rule.get('qualname', 'unknown')}")
                    if path_rule.get('constants'):
                        print(f"         constants: {path_rule.get('constants')}")
                    if path_rule.get('names'):
                        print(f"         names: {path_rule.get('names')}")
                    if path_rule.get('closure_vars'):
                        print(f"         closure_vars: {path_rule.get('closure_vars')}")

        if rule_analysis.get('options_count', 0) > 3:
            print(f"\n   ... and {rule_analysis['options_count'] - 3} more options")

    if not complex_locations:
        # Fall back to showing simple bunny rules
        print("   No complex bunny rules found. Showing simple ones...")
        analyzed_count = 0
        for loc in light_world_locations[:5]:
            if not hasattr(loc, 'access_rule') or loc.access_rule is None:
                continue

            print(f"\n   Location: {loc.name}")
            analysis = analyze_bunny_rule_closures(loc.access_rule)
            print(f"   Rule type: {analysis.get('type', 'unknown')}")
            print(f"   Closure vars: {analysis.get('closure_vars', {})}")

            if analysis['type'] == 'add_rule_combined':
                children = analysis.get('children', {})
                if 'rule' in children:
                    rule_analysis = children['rule']
                    print(f"   - Bunny rule type: {rule_analysis.get('type', 'unknown')}")
                    if rule_analysis.get('item_names'):
                        print(f"   - Items: {rule_analysis.get('item_names')}")

            analyzed_count += 1
            if analyzed_count >= 3:
                break

    print("\n" + "=" * 70)
    print("CONCLUSION: The bunny rule data IS stored in closures and CAN be extracted.")
    print("The ClosureFunctionAnalyzer already does this, but depth-limits the extraction")
    print("to prevent exponential rule growth (MAX_BUNNY_PATH_DEPTH = 1).")
    print("=" * 70)


if __name__ == '__main__':
    main()
