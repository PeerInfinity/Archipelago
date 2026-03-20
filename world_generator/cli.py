"""
Command-line interface for the world generator.

Usage:
    python -m world_generator input.json [-o output_dir] [--game-name NAME] [--force] [--dry-run]
"""

import argparse
import json
import logging
import shutil
import sys
from pathlib import Path

from .generator import WorldGenerator


def _cleanup_empty_worldgen_dirs(worlds_dir: Path) -> None:
    """Remove empty worldgen temp directories to prevent warnings on the next run.

    These are leftover directories from interrupted fuzz/worldgen runs that
    don't have an __init__.py, causing warnings when worlds are loaded.
    They typically have names like 'adventure_worldgen_86998726363870010506'.
    """
    if not worlds_dir.is_dir():
        return
    removed_count = 0
    for entry in worlds_dir.iterdir():
        if not entry.is_dir():
            continue
        name = entry.name
        if name.endswith(("_worldgen", "_worldgen2")) or "_worldgen_" in name or (name.split("_")[-1].isdigit() and len(name.split("_")[-1]) > 10):
            if not (entry / "__init__.py").exists():
                try:
                    shutil.rmtree(entry)
                    removed_count += 1
                except OSError:
                    pass
    if removed_count > 0:
        logging.getLogger(__name__).debug(f"Cleaned up {removed_count} empty worldgen directories")


def setup_logging(verbose: bool = False) -> None:
    """Configure logging."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format='%(levelname)s: %(message)s'
    )


def main() -> int:
    """Main entry point for CLI."""
    parser = argparse.ArgumentParser(
        description='Generate Archipelago world from JSON rules file',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  # Generate world from JSON (auto-detect output directory)
  python -m world_generator frontend/presets/mygame/AP_*/AP_*_rules.json

  # Specify output directory
  python -m world_generator input.json -o worlds/mygame/

  # Rename the game (to avoid conflicts with existing worlds)
  python -m world_generator input.json --game-name "My Game Test"

  # Preview what would be generated
  python -m world_generator input.json --dry-run

  # Overwrite existing files
  python -m world_generator input.json --force
'''
    )

    parser.add_argument(
        'input',
        type=str,
        help='Path to JSON rules file'
    )

    parser.add_argument(
        '-o', '--output',
        type=str,
        default=None,
        help='Output directory for generated world (default: worlds/<game_directory>/)'
    )

    parser.add_argument(
        '--game-name',
        type=str,
        default=None,
        help='Override the game name (useful to avoid conflicts with existing worlds)'
    )

    parser.add_argument(
        '--force',
        action='store_true',
        help='Overwrite existing files'
    )

    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be generated without writing files'
    )

    parser.add_argument(
        '--validate',
        action='store_true',
        help='Validate the JSON file and report issues'
    )

    parser.add_argument(
        '--canonical-seed',
        type=int,
        nargs='?',
        const=1,
        default=None,
        metavar='N',
        help='Enable canonical placement for seed N (default: 1 if flag provided). Places items in original locations when seed matches.'
    )

    parser.add_argument(
        '--apply-name-substitutions',
        action='store_true',
        help='Apply name_substitutions from the rules file (e.g. Metamath generic to meaningful names)'
    )

    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Enable verbose output'
    )

    parser.add_argument(
        '--player-id',
        type=str,
        default='1',
        help='Player ID to extract from multiworld rules file (default: 1)'
    )

    args = parser.parse_args()

    setup_logging(args.verbose)
    logger = logging.getLogger(__name__)

    # Clean up empty worldgen temp directories left over from interrupted previous runs
    _cleanup_empty_worldgen_dirs(Path(__file__).parent.parent / "worlds")

    # Validate input file
    input_path = Path(args.input)
    if not input_path.exists():
        logger.error(f"Input file not found: {input_path}")
        return 1

    if not input_path.suffix == '.json':
        logger.warning(f"Input file does not have .json extension: {input_path}")

    try:
        canonical_seed = args.canonical_seed

        # Create generator
        generator = WorldGenerator(
            json_path=str(input_path),
            output_dir=args.output,
            game_name=args.game_name,
            force=args.force,
            canonical_seed=canonical_seed,
            player_id=args.player_id,
            apply_name_substitutions=args.apply_name_substitutions,
        )

        # Load and validate
        generator.load()

        if args.validate or args.verbose:
            issues = generator.validate()
            if issues:
                print("\nValidation results:")
                for issue in issues:
                    print(f"  {issue}")
                print()

                # Stop if there are errors in validate-only mode
                if args.validate:
                    has_errors = any(issue.startswith('ERROR') for issue in issues)
                    return 1 if has_errors else 0

        if not args.validate:
            # Generate the world
            generator.generate(dry_run=args.dry_run)

        return 0

    except FileExistsError as e:
        logger.error(str(e))
        return 1
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in {input_path}: {e}")
        return 1
    except Exception as e:
        logger.error(f"Generation failed: {e}")
        if args.verbose:
            import traceback
            traceback.print_exc()
        return 1


if __name__ == '__main__':
    sys.exit(main())
