#!/usr/bin/env python3
"""
Script to update frontend/presets/preset_files.json with test results data
from test-results.json. This adds test result information to each
game entry so the frontend can display test status.
"""

import argparse
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Tuple


def load_test_results(results_file: str) -> Dict[str, Any]:
    """Load the template test results from JSON file."""
    try:
        with open(results_file, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Error loading results file {results_file}: {e}")
        return {}


def load_preset_files(preset_files_path: str) -> Dict[str, Any]:
    """Load the preset_files.json file."""
    try:
        with open(preset_files_path, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Error loading preset files {preset_files_path}: {e}")
        return {}


def normalize_game_name(template_name: str) -> str:
    """Convert template filename to lowercase directory name format."""
    # Remove .yaml extension
    game_name = template_name.replace('.yaml', '')
    # Convert to lowercase and replace spaces with underscores
    return game_name.lower().replace(' ', '_').replace('-', '_').replace('&', 'and').replace('!', '').replace("'", '')


def extract_test_data_for_game(template_name: str, template_data: Dict[str, Any]) -> Dict[str, Any]:
    """Extract test result data for a single game."""
    # Check if this is seed range data
    if 'seed_range' in template_data:
        # Handle seed range results
        seeds_passed = template_data.get('seeds_passed', 0)
        seeds_failed = template_data.get('seeds_failed', 0)
        consecutive_passes = template_data.get('consecutive_passes_before_failure', 0)
        first_failure_seed = template_data.get('first_failure_seed')
        total_seeds = template_data.get('total_seeds_tested', 0)
        seed_range = template_data.get('seed_range', 'unknown')
        individual_results = template_data.get('individual_results', {})
        
        # Determine which seed's data to use (same logic as generate-test-chart.py)
        if seeds_failed == 0 and seeds_passed > 0:
            # All passed - use data from first seed
            pass_fail = 'passed'
            if individual_results:
                first_seed_key = sorted(individual_results.keys(), key=lambda x: int(x) if x.isdigit() else 0)[0]
                first_result = individual_results[first_seed_key]
            else:
                first_result = {}
        else:
            # Some failed - use data from first failed seed
            pass_fail = 'failed'
            if first_failure_seed and individual_results:
                first_result = individual_results.get(str(first_failure_seed), {})
            else:
                # Fallback to first result if we can't find the failed seed
                if individual_results:
                    first_seed_key = sorted(individual_results.keys(), key=lambda x: int(x) if x.isdigit() else 0)[0]
                    first_result = individual_results[first_seed_key]
                else:
                    first_result = {}
        
        # Extract data from the selected seed result
        gen_error_count = first_result.get('generation', {}).get('error_count', 0)
        gen_warning_count = first_result.get('generation', {}).get('warning_count', 0)
        sphere_reached = first_result.get('spoiler_test', {}).get('sphere_reached', 0)
        max_spheres = first_result.get('spoiler_test', {}).get('total_spheres', 0)
        generation_time = first_result.get('generation', {}).get('processing_time_seconds', 0)
        spoiler_time = first_result.get('spoiler_test', {}).get('processing_time_seconds', 0)
        
        # Calculate progress percentage based on sphere data
        progress_percent = (sphere_reached / max_spheres * 100) if max_spheres > 0 else 0
        
        # Extract world info from the first result
        world_info = first_result.get('world_info', {})
        has_custom_exporter = world_info.get('has_custom_exporter', False)
        has_custom_game_logic = world_info.get('has_custom_game_logic', False)
        
        test_timestamp = template_data.get('timestamp', '')
        
    else:
        # Handle single seed results (original logic)
        # Extract original pass/fail result
        original_pass_fail = template_data.get('spoiler_test', {}).get('pass_fail', 'unknown')
        
        # Extract generation error and warning counts
        gen_error_count = template_data.get('generation', {}).get('error_count', 0)
        gen_warning_count = template_data.get('generation', {}).get('warning_count', 0)
        
        # Extract sphere reached (where the test stopped or failed)
        sphere_reached = template_data.get('spoiler_test', {}).get('sphere_reached', 0)
        
        # Extract max spheres (total spheres available)
        max_spheres = template_data.get('spoiler_test', {}).get('total_spheres', 0)
        
        # Extract world info for custom exporter/gameLogic status
        world_info = template_data.get('world_info', {})
        has_custom_exporter = world_info.get('has_custom_exporter', False)
        has_custom_game_logic = world_info.get('has_custom_game_logic', False)
        
        # Apply stricter pass criteria: must have 0 generation errors AND max_spheres > 0
        if original_pass_fail.lower() == 'passed' and gen_error_count == 0 and max_spheres > 0:
            pass_fail = 'passed'
        elif original_pass_fail.lower() == 'failed':
            pass_fail = 'failed'
        else:
            # Mark as failed if it doesn't meet strict criteria, even if spoiler test "passed"
            pass_fail = 'failed'
        
        # Calculate progress percentage
        progress_percent = 0.0
        if max_spheres > 0:
            progress_percent = (sphere_reached / max_spheres) * 100
        
        # Get timestamps
        test_timestamp = template_data.get('timestamp', '')
        generation_time = template_data.get('generation', {}).get('processing_time_seconds', 0)
        spoiler_time = template_data.get('spoiler_test', {}).get('processing_time_seconds', 0)
    
    result_data = {
        'test_result': {
            'status': pass_fail,
            'generation_errors': gen_error_count,
            'generation_warnings': gen_warning_count,
            'sphere_reached': sphere_reached,
            'max_spheres': max_spheres,
            'progress_percent': round(progress_percent, 1),
            'has_custom_exporter': has_custom_exporter,
            'has_custom_game_logic': has_custom_game_logic,
            'timestamp': test_timestamp,
            'processing_time': {
                'generation_seconds': generation_time,
                'spoiler_test_seconds': spoiler_time,
                'total_seconds': generation_time + spoiler_time
            }
        }
    }
    
    # Add seed range specific info if available
    if 'seed_range' in template_data:
        result_data['test_result']['seed_range_info'] = {
            'seed_range': template_data.get('seed_range', ''),
            'seeds_passed': seeds_passed,
            'seeds_failed': seeds_failed,
            'consecutive_passes_before_failure': consecutive_passes,
            'first_failure_seed': first_failure_seed,
            'total_seeds_tested': total_seeds
        }
    
    return result_data


def update_preset_files_with_test_data(preset_files: Dict[str, Any], test_results: Dict[str, Any]) -> Dict[str, Any]:
    """Update preset_files with test result data, preserving original order."""
    # Use the original preset_files to preserve order
    updated_preset_files = preset_files
    
    if 'results' not in test_results:
        print("No test results found in input data")
        return updated_preset_files
    
    # Track which games were updated
    updated_games = []
    missing_games = []
    
    for template_name, template_data in test_results['results'].items():
        # Extract expected game name from template filename
        expected_game_name = template_name.replace('.yaml', '')
        
        # Find the corresponding game in preset_files by searching the "name" field
        found_game_id = None
        for game_id, game_data in updated_preset_files.items():
            # Skip metadata entry
            if game_id == 'metadata':
                continue
                
            # Check if the name matches
            preset_game_name = game_data.get('name', '')
            if preset_game_name == expected_game_name:
                found_game_id = game_id
                break
        
        if found_game_id:
            # Extract test data
            test_data = extract_test_data_for_game(template_name, template_data)
            
            # Add test data to the game entry
            updated_preset_files[found_game_id].update(test_data)
            updated_games.append(found_game_id)
            
            print(f"Updated test data for: {expected_game_name} ({template_name})")
        else:
            # Try case-insensitive fuzzy matching as fallback
            found_game_id = None
            for game_id, game_data in updated_preset_files.items():
                if game_id == 'metadata':
                    continue
                    
                preset_game_name = game_data.get('name', '')
                # Compare case-insensitive and handle common variations
                if (preset_game_name.lower() == expected_game_name.lower() or
                    preset_game_name.lower().replace(':', '').replace(' ', '') == 
                    expected_game_name.lower().replace(':', '').replace(' ', '')):
                    found_game_id = game_id
                    print(f"Fuzzy matched: '{expected_game_name}' -> '{preset_game_name}'")
                    break
            
            if found_game_id:
                # Extract test data
                test_data = extract_test_data_for_game(template_name, template_data)
                
                # Add test data to the game entry
                updated_preset_files[found_game_id].update(test_data)
                updated_games.append(found_game_id)
                
                print(f"Updated test data for: {expected_game_name} ({template_name}) [fuzzy match]")
            else:
                print(f"No match found for: '{expected_game_name}' (from {template_name})")
                # Show available names for debugging
                available_names = [data.get('name', '') for data in updated_preset_files.values() 
                                 if isinstance(data, dict) and data.get('name')]
                similar_names = [name for name in available_names if 'jak' in name.lower()]
                if similar_names:
                    print(f"  Similar names available: {similar_names}")
                missing_games.append(f"{expected_game_name} (from {template_name})")
    
    # Add metadata about the update
    if 'metadata' not in updated_preset_files:
        updated_preset_files['metadata'] = {}
    
    # Find games in preset_files that didn't get test data
    # Exclude 'metadata' and 'multiworld' (multiworld is a configuration, not a testable game)
    all_game_ids = [game_id for game_id in updated_preset_files.keys() 
                    if game_id not in ['metadata', 'multiworld']]
    games_without_test_data = [game_id for game_id in all_game_ids if game_id not in updated_games]
    
    updated_preset_files['metadata'].update({
        'test_data_updated': datetime.now().isoformat(),
        'test_data_source': test_results.get('metadata', {}),
        'games_with_test_data': len(updated_games),
        'total_games': len([k for k in updated_preset_files.keys() if k not in ['metadata', 'multiworld']]),
        'games_without_test_data': len(games_without_test_data)
    })
    
    # Report games without test data
    if games_without_test_data:
        print(f"\nGames in preset_files.json without test data ({len(games_without_test_data)}):")
        for game_id in games_without_test_data:
            game_name = updated_preset_files[game_id].get('name', game_id)
            print(f"  - {game_name} (id: {game_id})")
    else:
        print(f"\nAll games in preset_files.json have test data!")
    
    print(f"\nSummary:")
    print(f"- Updated {len(updated_games)} games with test data")
    print(f"- {len(missing_games)} games from test results not found in preset_files")
    
    if missing_games:
        print(f"\nMissing games:")
        for game in missing_games[:10]:  # Show first 10
            print(f"  - {game}")
        if len(missing_games) > 10:
            print(f"  ... and {len(missing_games) - 10} more")
    
    return updated_preset_files


def save_preset_files(preset_files: Dict[str, Any], output_path: str):
    """Save the updated preset_files.json."""
    try:
        # Write updated file, preserving original order
        with open(output_path, 'w') as f:
            json.dump(preset_files, f, indent=2, sort_keys=False)
        print(f"Updated preset_files.json saved to: {output_path}")
        
    except IOError as e:
        print(f"Error saving preset files: {e}")


def main():
    parser = argparse.ArgumentParser(
        description='Update preset_files.json with test results data from test-results.json'
    )
    parser.add_argument(
        '--test-results',
        type=str,
        default='scripts/output/spoiler-full/test-results.json',
        help='Input test results JSON file (default: scripts/output/spoiler-full/test-results.json)'
    )
    parser.add_argument(
        '--preset-files',
        type=str,
        default='frontend/presets/preset_files.json',
        help='Preset files JSON to update (default: frontend/presets/preset_files.json)'
    )
    parser.add_argument(
        '--output',
        type=str,
        help='Output file path (default: overwrites --preset-files)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be updated without making changes'
    )
    
    args = parser.parse_args()
    
    # Determine project root and resolve paths
    project_root = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
    test_results_path = os.path.join(project_root, args.test_results)
    preset_files_path = os.path.join(project_root, args.preset_files)
    output_path = args.output if args.output else preset_files_path
    if args.output:
        output_path = os.path.join(project_root, args.output)
    
    # Check if input files exist
    if not os.path.exists(test_results_path):
        print(f"Error: Test results file not found: {test_results_path}")
        print("Please run test-all-templates.py first to generate the results file.")
        return 1
    
    if not os.path.exists(preset_files_path):
        print(f"Error: Preset files not found: {preset_files_path}")
        return 1
    
    # Load input files
    print(f"Loading test results from: {test_results_path}")
    test_results = load_test_results(test_results_path)
    
    if not test_results:
        print("Failed to load test results.")
        return 1
    
    print(f"Loading preset files from: {preset_files_path}")
    preset_files = load_preset_files(preset_files_path)
    
    if not preset_files:
        print("Failed to load preset files.")
        return 1
    
    # Update preset files with test data
    print(f"\nUpdating preset files with test data...")
    updated_preset_files = update_preset_files_with_test_data(preset_files, test_results)
    
    # Save or display results
    if args.dry_run:
        print(f"\nDry run complete. Would update: {output_path}")
        print("Use --dry-run=false to actually save changes.")
    else:
        save_preset_files(updated_preset_files, output_path)
    
    return 0


if __name__ == '__main__':
    exit(main())