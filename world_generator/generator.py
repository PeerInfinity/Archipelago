"""
Main world generator - orchestrates the conversion process.

This module provides the WorldGenerator class which handles the complete
process of converting a JSON rules file into an Archipelago world package.
"""

import json
import logging
from pathlib import Path
from typing import List, Optional, Dict

from .extractors import extract_all, apply_name_substitutions, ExtractedData, sanitize_identifier
from .templates import (
    generate_items_py,
    generate_locations_py,
    generate_regions_py,
    generate_rules_py,
    generate_options_py,
    generate_init_py,
)

logger = logging.getLogger(__name__)


class WorldGenerator:
    """
    Generates an Archipelago world package from a JSON rules file.

    Usage:
        generator = WorldGenerator('path/to/rules.json', 'worlds/mygame/')
        generator.generate()
    """

    def __init__(
        self,
        json_path: str,
        output_dir: Optional[str] = None,
        game_name: Optional[str] = None,
        force: bool = False,
        canonical_seed: Optional[int] = None,
        player_id: str = '1',
        apply_name_substitutions: bool = False,
    ):
        """
        Initialize the generator.

        Args:
            json_path: Path to the JSON rules file
            output_dir: Output directory for generated files. If None, derived from JSON.
            game_name: Override the game name (useful to avoid conflicts with existing worlds)
            force: If True, overwrite existing files
            canonical_seed: If set, generated world will place items in original locations when seed matches this value
            player_id: Player ID to extract from multiworld rules file (default: '1')
            apply_name_substitutions: If True, apply name_substitutions from the rules file (default: False)
        """
        self.json_path = Path(json_path)
        self.game_name_override = game_name
        self.force = force
        self.canonical_seed = canonical_seed
        self.player_id = player_id
        self.apply_name_substitutions = apply_name_substitutions
        self.data: Optional[ExtractedData] = None
        self._output_dir: Optional[Path] = Path(output_dir) if output_dir else None

    @property
    def output_dir(self) -> Path:
        """Get the output directory, deriving from JSON if not specified."""
        if self._output_dir:
            return self._output_dir

        if self.data:
            return Path('worlds') / self.data.metadata.game_directory

        # Fallback - extract from JSON without full parsing
        with open(self.json_path, 'r', encoding='utf-8') as f:
            json_data = json.load(f)
            game_dir = json_data.get('game_directory', 'unknown_game')
            return Path('worlds') / str(game_dir)

    def load(self) -> ExtractedData:
        """Load and parse the JSON rules file."""
        logger.info(f"Loading JSON from {self.json_path}")

        with open(self.json_path, 'r', encoding='utf-8') as f:
            json_data = json.load(f)

        # Apply name substitutions if present (e.g. Metamath generic → meaningful names)
        if self.apply_name_substitutions:
            apply_name_substitutions(json_data, player_id=self.player_id)

        self.data = extract_all(json_data, player_id=self.player_id)

        # Apply game name override if specified
        if self.game_name_override:
            self._apply_game_name_override(self.game_name_override)

        # Sort placements by classification to ensure items with
        # classification_counts have their progression copies placed first
        self._sort_placements_by_classification()

        logger.info(f"Extracted: {len(self.data.items)} items, "
                   f"{len(self.data.locations)} locations, "
                   f"{len(self.data.regions)} regions")

        return self.data

    def _sort_placements_by_classification(self) -> None:
        """
        Sort canonical_placements and original_placements so that items with
        multiple copies have their progression copies listed first.

        This ensures that for items with classification_counts (e.g., progression: 1, useful: 1),
        the progression copy is created first when iterating through placements.

        Uses canonical_placement_advancements extracted from regions data (item.advancement field).
        """
        if self.data is None:
            return

        # Determine which placements dict to sort
        # (templates.py uses canonical_placements if available, otherwise original_placements)
        placements_to_sort = self.data.canonical_placements if self.data.canonical_placements else self.data.original_placements
        if not placements_to_sort:
            return

        classifications = self.data.canonical_placement_advancements
        if not classifications:
            logger.debug("No placement classifications available, skipping sort")
            return

        # Group placements by item name
        from collections import defaultdict
        item_locations: Dict[str, List[str]] = defaultdict(list)
        for loc_name, item_name in placements_to_sort.items():
            item_locations[item_name].append(loc_name)

        # Sort each item's locations so advancement=True comes first
        # This ensures progression copies are created before useful copies
        sorted_placements: Dict[str, str] = {}
        for item_name, locations in item_locations.items():
            # Sort by (not is_advancement) so True (0) comes before False (1)
            sorted_locs = sorted(
                locations,
                key=lambda loc: (0 if classifications.get(loc, False) else 1, loc)
            )
            for loc in sorted_locs:
                sorted_placements[loc] = item_name

        # Update the appropriate dict
        if self.data.canonical_placements:
            self.data.canonical_placements = sorted_placements
        else:
            self.data.original_placements = sorted_placements

        logger.info("Sorted placements by classification (progression first)")

    def _apply_game_name_override(self, new_name: str) -> None:
        """Apply a game name override to the extracted metadata."""
        if self.data is None:
            raise RuntimeError("Cannot apply game name override before loading data")

        old_name = self.data.metadata.game_name

        # Update game name
        self.data.metadata.game_name = new_name

        # Only update world class name if there's no original from the exporter
        # This preserves the original class name (e.g., "ALTTPWorld") even when
        # the game is renamed (e.g., to "A Link to the Past WorldGen")
        if not self.data.metadata.original_world_class_name:
            class_base = sanitize_identifier(new_name)
            self.data.metadata.world_class_name = class_base + 'World'

        # Update game directory: "My Game WorldGen" -> "my_game_worldgen"
        # First remove non-alphanumeric chars except spaces and dashes, then convert to snake_case
        import re
        clean_name = re.sub(r"[^a-zA-Z0-9 -]", '', new_name)
        self.data.metadata.game_directory = clean_name.lower().replace(' ', '_').replace('-', '_')

        logger.info(f"Renamed game from '{old_name}' to '{new_name}'")

    def generate(self, dry_run: bool = False) -> None:
        """
        Generate all world files.

        Args:
            dry_run: If True, only show what would be generated without writing
        """
        if self.data is None:
            self.load()

        # After load(), self.data is guaranteed to be set
        assert self.data is not None

        output_dir = self.output_dir

        logger.info(f"Generating world in {output_dir}")

        if not dry_run:
            self._create_directory_structure(output_dir)

        # Generate each file
        files = {
            'Items.py': generate_items_py(self.data),
            'Locations.py': generate_locations_py(self.data),
            'Regions.py': generate_regions_py(self.data),
            'Rules.py': generate_rules_py(self.data),
            'Options.py': generate_options_py(self.data),
            '__init__.py': generate_init_py(self.data, canonical_seed=self.canonical_seed),
        }

        # Generate archipelago.json manifest for apworld packaging compatibility
        manifest = {
            "game": self.data.metadata.game_name,
            "authors": ["World Generator"],
            "minimum_ap_version": self.data.metadata.archipelago_version or "0.6.0",
            "world_version": "1.0.0",
        }
        manifest_path = output_dir / 'archipelago.json'
        if not dry_run:
            manifest_path.write_text(json.dumps(manifest, indent=4), encoding='utf-8')
            logger.info(f"Wrote manifest to {manifest_path}")
        else:
            logger.info(f"Would write: {manifest_path}")

        # Export options for canonical seed generation
        # This allows worldgen worlds to reproduce the exact original seed when seed=1
        with open(self.json_path, 'r', encoding='utf-8') as f:
            source_json = json.load(f)

        # Extract options from world section
        source_world = source_json.get('world', {}).get(self.player_id, {})
        options_data = source_world.get('options', {})

        if options_data:
            options_path = output_dir / '_worldgen_options.json'
            if not dry_run:
                options_path.write_text(json.dumps(options_data, indent=2), encoding='utf-8')
                logger.info(f"Wrote worldgen options to {options_path}")

        for filename, content in files.items():
            file_path = output_dir / filename

            if dry_run:
                logger.info(f"Would write: {file_path}")
                print(f"\n{'='*60}")
                print(f"FILE: {filename}")
                print('='*60)
                print(content[:500] + ('...' if len(content) > 500 else ''))
            else:
                self._write_file(file_path, content)

        if not dry_run:
            logger.info(f"Successfully generated world in {output_dir}")
            print(f"\nGenerated world files in: {output_dir}")
            print("\nNext steps:")
            print("1. Review generated files and make any necessary adjustments")
            # self.data is guaranteed non-None here due to the assert above
            assert self.data is not None
            print("2. Test with: python -c \"from worlds.{} import *\"".format(
                self.data.metadata.game_directory))
            print("3. Generate template: python -c \"from Options import generate_yaml_templates; "
                  "generate_yaml_templates('Players/Templates')\"")
            print("4. Generate test seed: python Generate.py --seed 1")

    def _create_directory_structure(self, output_dir: Path) -> None:
        """Create the output directory structure."""
        if output_dir.exists() and not self.force:
            # Check if any files exist
            existing_files = list(output_dir.glob('*.py'))
            if existing_files:
                raise FileExistsError(
                    f"Output directory {output_dir} already contains Python files. "
                    f"Use --force to overwrite."
                )

        output_dir.mkdir(parents=True, exist_ok=True)

        # Create docs directory (flat structure matching Archipelago conventions)
        docs_dir = output_dir / 'docs'
        docs_dir.mkdir(parents=True, exist_ok=True)

        # self.data is guaranteed non-None when this method is called from generate()
        assert self.data is not None

        # Create a doc file for each tutorial referenced in the metadata
        tutorial_files_created = set()
        for tutorial in self.data.metadata.web_tutorials:
            if tutorial.file_name and tutorial.file_name not in tutorial_files_created:
                tutorial_md = docs_dir / tutorial.file_name
                if not tutorial_md.exists() or self.force:
                    tutorial_content = f"# {tutorial.name}\n\n{tutorial.description}\n"
                    tutorial_md.write_text(tutorial_content, encoding='utf-8')
                tutorial_files_created.add(tutorial.file_name)

        # Create setup_en.md if no tutorials created it
        if 'setup_en.md' not in tutorial_files_created:
            setup_md = docs_dir / 'setup_en.md'
            if not setup_md.exists() or self.force:
                setup_content = f"# {self.data.metadata.game_name} Setup Guide\n\nGenerated world package.\n"
                setup_md.write_text(setup_content, encoding='utf-8')

        # Create game info file (en_GameName.md) for WebHost integration
        game_info_md = docs_dir / f'en_{self.data.metadata.game_name}.md'
        if not game_info_md.exists() or self.force:
            game_info_content = f"# {self.data.metadata.game_name}\n\nGenerated world package.\n"
            game_info_md.write_text(game_info_content, encoding='utf-8')

    def _write_file(self, file_path: Path, content: str) -> None:
        """Write content to a file."""
        if file_path.exists() and not self.force:
            logger.warning(f"Skipping existing file: {file_path}")
            return

        logger.info(f"Writing: {file_path}")
        file_path.write_text(content, encoding='utf-8')

    def validate(self) -> List[str]:
        """
        Validate the extracted data for common issues.

        Returns:
            List of warning/error messages
        """
        if self.data is None:
            self.load()

        # After load(), self.data is guaranteed to be set
        assert self.data is not None

        issues: List[str] = []

        # Check for items
        if not self.data.items:
            issues.append("ERROR: No items found in JSON")

        # Check for locations
        if not self.data.locations:
            issues.append("ERROR: No locations found in JSON")

        # Check for regions
        if not self.data.regions:
            issues.append("ERROR: No regions found in JSON")

        # Check item/location balance
        regular_items = sum(1 for i in self.data.items.values() if not i.is_event)
        regular_locations = sum(1 for loc in self.data.locations.values() if not loc.is_event)

        if regular_items != regular_locations:
            issues.append(
                f"WARNING: Item/location mismatch: {regular_items} items vs "
                f"{regular_locations} locations"
            )

        # Check for missing regions in exits
        all_regions = set(self.data.regions.keys())
        for exit_name, exit_data in self.data.exits.items():
            if exit_data.target_region not in all_regions:
                issues.append(
                    f"ERROR: Exit '{exit_name}' targets unknown region "
                    f"'{exit_data.target_region}'"
                )

        # Check for victory condition
        has_victory = any(
            'victory' in loc.lower() or 'victory' in (self.data.original_placements.get(loc, '')).lower()
            for loc in self.data.locations
        )
        if not has_victory:
            issues.append("WARNING: No victory location/item detected")

        return issues
