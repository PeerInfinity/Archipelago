#!/usr/bin/env python3
"""
Script to generate text files listing games from preset_files.json and Players/Templates directory.
"""

import argparse
import json
import os
import glob
from pathlib import Path
from typing import List, Set


def load_preset_files(preset_files_path: str) -> List[str]:
    """Load game names from preset_files.json."""
    try:
        with open(preset_files_path, 'r') as f:
            data = json.load(f)
        
        games = []
        for game_id, game_data in data.items():
            # Skip metadata and multiworld entries
            if game_id in ['metadata', 'multiworld']:
                continue
            
            game_name = game_data.get('name', game_id)
            games.append(game_name)
        
        return sorted(games)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Error loading preset files {preset_files_path}: {e}")
        return []


def load_template_games(templates_dir: str) -> List[str]:
    """Load game names from template YAML files."""
    try:
        # Find all YAML files in the templates directory
        yaml_files = glob.glob(os.path.join(templates_dir, "*.yaml"))
        
        games = []
        for yaml_file in yaml_files:
            # Get the filename without extension
            filename = os.path.basename(yaml_file)
            game_name = filename.replace('.yaml', '')
            
            # Convert underscores to spaces and title case for readability
            display_name = game_name.replace('_', ' ').title()
            games.append(display_name)
        
        return sorted(games)
    except Exception as e:
        print(f"Error loading template files from {templates_dir}: {e}")
        return []


def save_game_list(games: List[str], output_path: str, source_description: str):
    """Save a list of games to a text file."""
    try:
        with open(output_path, 'w') as f:
            f.write(f"# Games from {source_description}\n")
            f.write(f"# Generated on: {os.popen('date').read().strip()}\n")
            f.write(f"# Total games: {len(games)}\n\n")
            
            for game in games:
                f.write(f"{game}\n")
        
        print(f"Saved {len(games)} games from {source_description} to: {output_path}")
    except IOError as e:
        print(f"Error saving game list to {output_path}: {e}")


def main():
    parser = argparse.ArgumentParser(
        description='Generate text files listing games from preset_files.json and Templates directory'
    )
    parser.add_argument(
        '--preset-files',
        type=str,
        default='frontend/presets/preset_files.json',
        help='Path to preset_files.json (default: frontend/presets/preset_files.json)'
    )
    parser.add_argument(
        '--templates-dir',
        type=str,
        default='Players/Templates',
        help='Path to Templates directory (default: Players/Templates)'
    )
    parser.add_argument(
        '--output-dir',
        type=str,
        default='scripts/output',
        help='Output directory for game lists (default: scripts/output)'
    )
    
    args = parser.parse_args()
    
    # Determine project root and resolve paths
    project_root = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
    preset_files_path = os.path.join(project_root, args.preset_files)
    templates_dir = os.path.join(project_root, args.templates_dir)
    output_dir = os.path.join(project_root, args.output_dir)
    
    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)
    
    # Check if input files/directories exist
    if not os.path.exists(preset_files_path):
        print(f"Error: Preset files not found: {preset_files_path}")
        return 1
    
    if not os.path.exists(templates_dir):
        print(f"Error: Templates directory not found: {templates_dir}")
        return 1
    
    # Load games from both sources
    print(f"Loading games from preset_files.json: {preset_files_path}")
    preset_games = load_preset_files(preset_files_path)
    
    print(f"Loading games from Templates directory: {templates_dir}")
    template_games = load_template_games(templates_dir)
    
    if not preset_games and not template_games:
        print("No games found from either source.")
        return 1
    
    # Save game lists
    preset_output = os.path.join(output_dir, 'games-from-preset-files.txt')
    templates_output = os.path.join(output_dir, 'games-from-templates.txt')
    
    if preset_games:
        save_game_list(preset_games, preset_output, "preset_files.json")
    
    if template_games:
        save_game_list(template_games, templates_output, "Players/Templates")
    
    # Generate comparison summary
    summary_output = os.path.join(output_dir, 'games-comparison.txt')
    try:
        # Create case-insensitive comparison sets
        preset_set = set(preset_games)
        template_set = set(template_games)
        
        # Create lowercase mapping for case-insensitive comparison
        # Exclude 'Multiworld' from preset games for comparison since it's not a testable game
        preset_games_for_comparison = [game for game in preset_games if game != 'Multiworld']
        preset_lower_to_original = {game.lower(): game for game in preset_games_for_comparison}
        template_lower_to_original = {game.lower(): game for game in template_games}
        
        preset_lower_set = set(preset_lower_to_original.keys())
        template_lower_set = set(template_lower_to_original.keys())
        
        with open(summary_output, 'w') as f:
            f.write("# Game Lists Comparison (Case-Insensitive)\n")
            f.write(f"# Generated on: {os.popen('date').read().strip()}\n\n")
            
            f.write(f"Games in preset_files.json: {len(preset_games)} (excluding Multiworld)\n")
            f.write(f"Games in Templates directory: {len(template_games)}\n\n")
            
            # Games in both (case-insensitive)
            in_both_lower = preset_lower_set & template_lower_set
            
            # Add fuzzy matching for games that are almost the same
            # (handles cases like "Jak and Daxter: The Precursor Legacy" vs "Jak And Daxter The Precursor Legacy")
            preset_only_lower = preset_lower_set - template_lower_set
            template_only_lower = template_lower_set - preset_lower_set
            
            fuzzy_matches = []
            for preset_lower in list(preset_only_lower):
                for template_lower in list(template_only_lower):
                    # Compare without punctuation and spaces
                    preset_normalized = preset_lower.replace(':', '').replace(' ', '').replace('-', '')
                    template_normalized = template_lower.replace(':', '').replace(' ', '').replace('-', '')
                    
                    if preset_normalized == template_normalized:
                        fuzzy_matches.append((preset_lower, template_lower))
                        preset_only_lower.discard(preset_lower)
                        template_only_lower.discard(template_lower)
                        in_both_lower.add(preset_lower)  # Count as matched
            
            f.write(f"Games in both (ignoring case): {len(in_both_lower)}\n")
            
            # Games only in preset_files (case-insensitive)
            only_in_presets_lower = preset_only_lower
            if only_in_presets_lower:
                f.write(f"\nGames only in preset_files.json ({len(only_in_presets_lower)}):\n")
                for game_lower in sorted(only_in_presets_lower):
                    original_name = preset_lower_to_original[game_lower]
                    f.write(f"  - {original_name}\n")
            
            # Games only in templates (case-insensitive)
            only_in_templates_lower = template_only_lower
            if only_in_templates_lower:
                f.write(f"\nGames only in Templates directory ({len(only_in_templates_lower)}):\n")
                for game_lower in sorted(only_in_templates_lower):
                    original_name = template_lower_to_original[game_lower]
                    f.write(f"  - {original_name}\n")
            
            # Show fuzzy matches that were found
            if fuzzy_matches:
                f.write(f"\nFuzzy matches found (games that are essentially the same):\n")
                for preset_lower, template_lower in fuzzy_matches:
                    preset_name = preset_lower_to_original[preset_lower]
                    template_name = template_lower_to_original[template_lower]
                    f.write(f"  - preset_files.json: '{preset_name}' ↔ Templates: '{template_name}'\n")
            
            # Show case differences for games that exist in both
            if in_both_lower:
                f.write(f"\nCase differences for games in both sources:\n")
                case_differences = []
                for game_lower in sorted(in_both_lower):
                    preset_name = preset_lower_to_original[game_lower]
                    template_name = template_lower_to_original[game_lower]
                    if preset_name != template_name:
                        case_differences.append((preset_name, template_name))
                
                if case_differences:
                    for preset_name, template_name in case_differences:
                        f.write(f"  - preset_files.json: '{preset_name}' vs Templates: '{template_name}'\n")
                else:
                    f.write("  - No case differences found\n")
        
        print(f"Saved comparison summary to: {summary_output}")
    except Exception as e:
        print(f"Error creating comparison summary: {e}")
    
    return 0


if __name__ == '__main__':
    exit(main())