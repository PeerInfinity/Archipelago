"""Region template generation for Archipelago world files.

Contains the regions generator and dungeon class/data generation.
"""

import json
import re
from typing import Dict

from .extractors import ExtractedData, DungeonData, BossData
from ._sanitization import sanitize_for_class_name


def _generate_dungeon_classes_and_data(data: ExtractedData, game_name: str) -> tuple:
    """Generate Dungeon/Boss wrapper classes and dungeon data.

    Returns:
        Tuple of (dungeon_classes_code, dungeon_data_code, dungeon_setup_code, has_dungeons)
    """
    if not data.dungeons:
        return "", "", "", False

    # Note: Defeat rule functions are generated in Rules.py (see generate_rules_py)
    # because they need access to helper functions defined there.

    # Build boss function mapping for reference in dungeon data
    boss_func_mapping = {}  # (dungeon_name, boss_key) -> function_name
    for dungeon_name, dungeon_data in data.dungeons.items():
        for boss_key, boss_data in dungeon_data.bosses.items():
            if boss_data.defeat_rule:
                safe_dungeon = re.sub(r'[^a-zA-Z0-9]', '_', dungeon_name)
                safe_key = 'default' if boss_key == 'None' else boss_key
                func_name = f"_can_defeat_{safe_dungeon}_{safe_key}"
                boss_func_mapping[(dungeon_name, boss_key)] = func_name

    # Generate dungeon classes
    dungeon_classes = '''
# Dungeon and Boss wrapper classes for WorldGen
class _Boss:
    """Boss wrapper for WorldGen dungeons."""
    def __init__(self, name: str, defeat_func_name: str = None):
        self.name = name
        self._defeat_func_name = defeat_func_name
        self._defeat_func = None  # Set by set_rules() via setup_dungeon_bosses()
        self.player = None  # Set when dungeon is created

    def can_defeat(self, state) -> bool:
        """Check if this boss can be defeated."""
        if self._defeat_func is None:
            return True
        return self._defeat_func(state, self.player)

    @property
    def defeat_rule(self):
        """Property for exporter compatibility - returns the defeat function."""
        return self._defeat_func


class _Dungeon:
    """Dungeon wrapper for WorldGen."""
    def __init__(self, name: str, player: int):
        self.name = name
        self.player = player
        self.bosses: Dict[str, _Boss] = {}
        self.regions: list = []  # List of Region objects, populated by create_regions()

    @property
    def boss(self) -> _Boss:
        """Get the default boss (key 'None')."""
        return self.bosses.get('None')

    @boss.setter
    def boss(self, value: _Boss):
        """Set the default boss."""
        self.bosses['None'] = value

'''

    # Generate dungeon data structure
    dungeon_data_entries = []
    for dungeon_name, dungeon_data in data.dungeons.items():
        escaped_name = dungeon_name.replace('\\', '\\\\').replace('"', '\\"')

        # Build bosses dict - store function name as string for later lookup
        boss_entries = []
        for boss_key, boss_data in dungeon_data.bosses.items():
            escaped_boss_name = boss_data.name.replace('\\', '\\\\').replace('"', '\\"')
            func_name = boss_func_mapping.get((dungeon_name, boss_key))
            func_name_str = f'"{func_name}"' if func_name else 'None'
            boss_entries.append(f'        "{boss_key}": ("{escaped_boss_name}", {func_name_str}),')

        bosses_content = '\n'.join(boss_entries) if boss_entries else ''

        # Build regions list
        regions_list = ', '.join(f'"{r.replace(chr(34), chr(92)+chr(34))}"' for r in dungeon_data.regions)

        dungeon_data_entries.append(f'''    "{escaped_name}": {{
        "regions": [{regions_list}],
        "bosses": {{
{bosses_content}
        }},
    }},''')

    dungeon_data_code = '''
# Dungeon data (name -> {regions, bosses})
# Boss defeat functions are defined in Rules.py and wired up by set_rules()
DUNGEON_DATA = {
''' + '\n'.join(dungeon_data_entries) + '''
}
'''

    # Generate dungeon setup code - creates dungeons but defeat functions are wired later
    dungeon_setup_code = '''
    # Create dungeon objects (defeat functions are wired up by set_rules())
    dungeons = {}
    for dungeon_name, dungeon_info in DUNGEON_DATA.items():
        dungeon = _Dungeon(dungeon_name, player)
        for boss_key, (boss_name, defeat_func_name) in dungeon_info["bosses"].items():
            boss = _Boss(boss_name, defeat_func_name)
            boss.player = player
            dungeon.bosses[boss_key] = boss
        dungeons[dungeon_name] = dungeon

    # Assign dungeons to regions
    for region_name, dungeon_name in REGION_DUNGEONS.items():
        if region_name in regions and dungeon_name in dungeons:
            regions[region_name].dungeon = dungeons[dungeon_name]

    # Populate dungeon.regions in the original order from DUNGEON_DATA
    # (not REGION_DUNGEONS order, which may differ)
    for dungeon_name, dungeon_info in DUNGEON_DATA.items():
        if dungeon_name in dungeons:
            for region_name in dungeon_info["regions"]:
                if region_name in regions:
                    dungeons[dungeon_name].regions.append(regions[region_name])
'''

    return dungeon_classes, dungeon_data_code, dungeon_setup_code, True


def generate_regions_py(data: ExtractedData) -> str:
    """Generate Regions.py file content."""
    game_name = data.metadata.game_name
    class_name = sanitize_for_class_name(game_name)

    # Build region list - preserve exactly what's in the original data
    # Note: We no longer add "Menu" automatically. Instead, if the original world
    # doesn't have Menu, we set origin_region_name in the world class to point
    # to the actual start region (see generate_init_py).
    region_names = list(data.regions.keys())
    # Escape quotes in region names
    region_list = ', '.join(f'"{r.replace(chr(34), chr(92)+chr(34))}"' for r in region_names)

    # Build region hints dict (only for regions with hint_text different from name)
    hint_entries = []
    for region_name, region_data in data.regions.items():
        if region_data.hint_text and region_data.hint_text != region_name:
            escaped_name = region_name.replace('\\', '\\\\').replace('"', '\\"')
            escaped_hint = region_data.hint_text.replace('\\', '\\\\').replace('"', '\\"')
            hint_entries.append(f'    "{escaped_name}": "{escaped_hint}",')
    region_hints_content = '\n'.join(hint_entries)

    # Build list of dynamically added regions
    dynamically_added_regions = []
    for region_name, region_data in data.regions.items():
        if region_data.dynamically_added:
            escaped_name = region_name.replace('\\', '\\\\').replace('"', '\\"')
            dynamically_added_regions.append(f'"{escaped_name}"')

    # Build region dungeons dict (region -> dungeon name mapping)
    dungeon_entries = []
    for region_name, region_data in data.regions.items():
        if region_data.dungeon:
            escaped_name = region_name.replace('\\', '\\\\').replace('"', '\\"')
            escaped_dungeon = region_data.dungeon.replace('\\', '\\\\').replace('"', '\\"')
            dungeon_entries.append(f'    "{escaped_name}": "{escaped_dungeon}",')
    region_dungeons_content = '\n'.join(dungeon_entries)

    # Build entrance connections
    entrance_lines = []

    # Note: We no longer add MenuToStart entrance. The world uses origin_region_name instead.

    for exit_name, exit_data in data.exits.items():
        source = exit_data.source_region.replace('"', '\\"')
        target = exit_data.target_region.replace('"', '\\"')
        name = exit_name.replace('"', '\\"')
        entrance_lines.append(
            f'    _create_entrance(regions["{source}"], regions["{target}"], "{name}")'
        )

    entrances_content = '\n'.join(entrance_lines)

    # Generate region hints dict section (only if there are hints)
    region_hints_section = ""
    if hint_entries:
        region_hints_section = f'''
# Region display names (hint text)
REGION_HINTS: Dict[str, str] = {{
{region_hints_content}
}}
'''

    # Generate dynamically added regions set (if any)
    dynamically_added_section = ""
    if dynamically_added_regions:
        dynamically_added_list = ', '.join(dynamically_added_regions)
        dynamically_added_section = f'''
# Regions that were added after sphere calculation (from original export)
DYNAMICALLY_ADDED_REGIONS = {{{dynamically_added_list}}}
'''

    # Generate region dungeons dict section (if any)
    region_dungeons_section = ""
    if dungeon_entries:
        region_dungeons_section = f'''
# Region to dungeon mapping
REGION_DUNGEONS: Dict[str, str] = {{
{region_dungeons_content}
}}
'''

    # Build region extra attributes dict (only for regions with extra_attributes)
    region_extra_entries = []
    for region_name, region_data in data.regions.items():
        if region_data.extra_attributes:
            escaped_name = region_name.replace('\\', '\\\\').replace('"', '\\"')
            # Serialize extra_attributes as a Python dict literal
            extra_str = json.dumps(region_data.extra_attributes).replace('true', 'True').replace('false', 'False').replace('null', 'None')
            region_extra_entries.append(f'    "{escaped_name}": {extra_str},')
    region_extra_content = '\n'.join(region_extra_entries)

    # Generate region extra attributes section (if any)
    region_extra_section = ""
    if region_extra_entries:
        region_extra_section = f'''
# Region extra attributes (game-specific, e.g., code)
REGION_EXTRA_ATTRIBUTES: Dict[str, Dict[str, Any]] = {{
{region_extra_content}
}}
'''

    # Check if any locations have extra attributes
    has_location_extra_attrs = any(
        loc_data.extra_attributes for loc_data in data.locations.values()
    )

    # Generate the hint lookup in create_regions
    hint_lookup = "REGION_HINTS.get(region_name)" if hint_entries else "None"

    # Determine imports needed
    typing_import = "Dict, Set, Any" if region_extra_entries or has_location_extra_attrs else "Dict, Set"

    # Generate code to apply region extra attributes
    region_extra_apply = ""
    if region_extra_entries:
        region_extra_apply = '''
    # Apply region extra attributes (game-specific, e.g., code)
    for region_name, extra_attrs in REGION_EXTRA_ATTRIBUTES.items():
        if region_name in regions:
            for attr_name, attr_value in extra_attrs.items():
                setattr(regions[region_name], attr_name, attr_value)
'''

    # Generate dungeon classes and data if dungeons exist
    dungeon_classes, dungeon_data_code, dungeon_setup_code, has_dungeons = \
        _generate_dungeon_classes_and_data(data, game_name)

    # Generate code to apply dungeon attributes to regions
    region_dungeons_apply = ""
    if has_dungeons:
        # Use full dungeon object setup
        region_dungeons_apply = dungeon_setup_code
    elif dungeon_entries:
        # Fallback: simple string assignment if no dungeon data but region mapping exists
        region_dungeons_apply = '''
    # Apply dungeon assignments to regions (string names only)
    for region_name, dungeon_name in REGION_DUNGEONS.items():
        if region_name in regions:
            regions[region_name].dungeon = dungeon_name
'''

    # Generate code to apply location extra attributes
    location_extra_apply = ""
    if has_location_extra_attrs:
        location_extra_apply = '''
        # Apply extra attributes (game-specific, e.g., type_string, price)
        for attr_name, attr_value in location_data.extra_attributes.items():
            setattr(location, attr_name, attr_value)
'''

    # Build dungeon section (classes + data)
    dungeon_section = ""
    if has_dungeons:
        dungeon_section = dungeon_classes + dungeon_data_code

    return f'''"""
Region definitions for {game_name}.

Auto-generated by world_generator.
"""

from typing import {typing_import}
from BaseClasses import MultiWorld, Region, Entrance
from .Locations import location_table, {class_name}Location
{dungeon_section}
{region_hints_section}{dynamically_added_section}{region_dungeons_section}{region_extra_section}
def create_regions(multiworld: MultiWorld, player: int) -> None:
    """Create all regions, locations, and connections."""

    # Create all regions
    region_names = [{region_list}]

    regions = {{}}
    for region_name in region_names:
        hint = {hint_lookup}
        region = Region(region_name, player, multiworld, hint)
        regions[region_name] = region

    # Mark dynamically added regions (these won't appear in sphere log comparisons)
    try:
        _dynamically_added = DYNAMICALLY_ADDED_REGIONS
    except NameError:
        _dynamically_added = set()
    for region_name in _dynamically_added:
        if region_name in regions:
            regions[region_name].dynamically_added = True
{region_extra_apply}{region_dungeons_apply}
    # Add locations to regions
    for location_name, location_data in location_table.items():
        region = regions[location_data.region]
        location = {class_name}Location(
            player,
            location_name,
            location_data.location_id,
            region
        )

        # Apply location properties from location_data
        if location_data.event:
            location.event = True
        if location_data.progress_type is not None:
            location.progress_type = location_data.progress_type
        if not location_data.show_in_spoiler:
            location.show_in_spoiler = False
{location_extra_apply}
        region.locations.append(location)

    # Create entrances
{entrances_content}

    # Add all regions to multiworld
    # Regions must be added even if they have no locations or exits, because:
    # 1. They may be targets of entrances from other regions
    # 2. They may be referenced by CanReachRegion() rules
    for region in regions.values():
        multiworld.regions.append(region)


def _create_entrance(source: Region, target: Region, name: str) -> Entrance:
    """Helper to create and connect an entrance."""
    entrance = Entrance(source.player, name, source)
    entrance.connect(target)
    source.exits.append(entrance)
    return entrance
'''
