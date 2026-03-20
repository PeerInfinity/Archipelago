"""
Data extractors for parsing JSON rules files.

These functions extract structured data from the JSON rules file format
and prepare it for code generation.
"""

import logging
import re
from typing import Any, Dict, List, Optional, Set, Tuple
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

from .constants import INTERNAL_SETTINGS
from ._sanitization import sanitize_for_class_name


# Backwards-compatible alias
sanitize_identifier = sanitize_for_class_name


@dataclass
class TutorialData:
    """Tutorial information."""
    name: str
    description: str
    language: str
    file_name: str
    link: str
    authors: List[str] = field(default_factory=list)


@dataclass
class GameMetadata:
    """Extracted game metadata."""
    game_name: str
    game_directory: str
    world_class_name: str
    archipelago_version: str
    schema_version: int
    base_id: Optional[int] = None
    web_theme: Optional[str] = None
    web_tutorials: List[TutorialData] = field(default_factory=list)
    world_description: Optional[str] = None
    slot_data_fields: Dict[str, Any] = field(default_factory=dict)  # Fields returned by fill_slot_data
    game_options: Dict[str, Any] = field(default_factory=dict)  # Game-specific options from settings
    resolved_values: Dict[str, Any] = field(default_factory=dict)  # Resolved values from seed (options + world attributes)
    option_definitions: Dict[str, Dict[str, Any]] = field(default_factory=dict)  # Option class definitions (type, range, choices, etc.)
    use_auto_indirect_conditions: bool = False  # When True, use auto sweep for indirect region dependencies
    original_world_class_name: Optional[str] = None  # Original class name from exporter (preserved during game name override)


@dataclass
class ItemData:
    """Extracted item data."""
    name: str
    item_id: Optional[int]
    classification: str  # 'progression', 'useful', 'trap', 'filler', 'progression_skip_balancing', etc.
    groups: List[str] = field(default_factory=list)
    max_count: int = 1
    is_event: bool = False
    hint_text: Optional[str] = None  # Display name if different from name
    classification_counts: Optional[Dict[str, int]] = None  # Per-classification counts for mixed items


@dataclass
class LocationData:
    """Extracted location data."""
    name: str
    location_id: Optional[int]
    region: str
    access_rule: Optional[Dict[str, Any]] = None
    is_event: bool = False
    original_item: Optional[str] = None  # For seed=1 placement
    locked: bool = False  # True if item was placed via place_locked_item
    progress_type: Optional[str] = None  # 'EXCLUDED', 'PRIORITY', or None for DEFAULT
    show_in_spoiler: bool = True  # Whether to show in spoiler log
    access: Optional[Dict[str, Any]] = None  # Game-specific access data
    extra_attributes: Dict[str, Any] = field(default_factory=dict)  # Game-specific attributes


@dataclass
class ExitData:
    """Extracted exit/entrance data."""
    name: str
    source_region: str
    target_region: str
    access_rule: Optional[Dict[str, Any]] = None


@dataclass
class RegionData:
    """Extracted region data."""
    name: str
    locations: List[str] = field(default_factory=list)
    exits: List[str] = field(default_factory=list)
    hint_text: Optional[str] = None  # Display name if different from name
    dynamically_added: bool = False  # True if region was added after sphere calculation
    dungeon: Optional[str] = None  # Dungeon name this region belongs to
    extra_attributes: Dict[str, Any] = field(default_factory=dict)  # Game-specific attributes (e.g., code)


def _param_is_used_in_body(param_name: str, body: Any) -> bool:
    """
    Check if a parameter name is referenced anywhere in a rule body.

    Since helper bodies can be fully expanded (with params like 'damaging_items'
    becoming direct item checks), we need to detect unused params and exclude
    them from the function signature to avoid "missing required argument" errors.

    Args:
        param_name: The parameter name to search for
        body: The rule body (dict, list, or primitive)

    Returns:
        True if the param_name appears to be referenced in the body
    """
    if body is None:
        return False

    if isinstance(body, dict):
        # Check for explicit param reference (type: param_ref, variable, name, etc.)
        if body.get('type') in ('param_ref', 'variable', 'param', 'name'):
            if body.get('name') == param_name or body.get('param') == param_name:
                return True
        # Check if param name appears as a value
        for key, value in body.items():
            if key == param_name:
                return True
            if isinstance(value, str) and param_name in value:
                return True
            if _param_is_used_in_body(param_name, value):
                return True
    elif isinstance(body, list):
        for item in body:
            if _param_is_used_in_body(param_name, item):
                return True
    elif isinstance(body, str) and param_name in body:
        return True

    return False


@dataclass
class HelperData:
    """Extracted helper function data."""
    name: str
    params: List[str] = field(default_factory=list)  # Parameters (excluding state/player)
    body: Optional[Dict[str, Any]] = None  # The rule body
    defaults: Dict[str, Any] = field(default_factory=dict)  # Default parameter values
    param_mappings: Dict[str, str] = field(default_factory=dict)  # Maps param names to option/attribute names


@dataclass
class BossData:
    """Extracted boss data."""
    name: str
    defeat_rule: Optional[Dict[str, Any]] = None  # Rule Builder format rule for defeating the boss


@dataclass
class DungeonData:
    """Extracted dungeon data."""
    name: str
    regions: List[str] = field(default_factory=list)  # Region names in this dungeon
    bosses: Dict[str, BossData] = field(default_factory=dict)  # Boss key -> BossData (key is 'None', 'top', 'middle', 'bottom', etc.)


@dataclass
class ExtractedData:
    """All extracted data from a JSON rules file."""
    metadata: GameMetadata
    items: Dict[str, ItemData]
    locations: Dict[str, LocationData]
    regions: Dict[str, RegionData]
    exits: Dict[str, ExitData]
    item_groups: List[str]
    item_name_groups: Dict[str, List[str]]  # group_name -> [item_names]
    start_region: str
    original_placements: Dict[str, str]  # location -> item (from locked items at generation time)
    helpers: Dict[str, HelperData] = field(default_factory=dict)  # Helper function definitions
    itempool_counts: Dict[str, int] = field(default_factory=dict)  # item -> count
    locked_placements: Dict[str, str] = field(default_factory=dict)  # location -> item (must ALWAYS be placed via place_locked_item, e.g., events)
    starting_items: Dict[str, int] = field(default_factory=dict)  # item -> count (precollected items)
    accumulator_rules: List[Dict[str, Any]] = field(default_factory=list)  # Rules for state counters (e.g., coins)
    prog_items_init: Dict[str, int] = field(default_factory=dict)  # Initial values for prog_items counters
    canonical_placements: Dict[str, str] = field(default_factory=dict)  # location -> item (vanilla/original locations from world class)
    canonical_placement_advancements: Dict[str, bool] = field(default_factory=dict)  # location -> is_advancement (for mixed-class items)
    is_vanilla: bool = False  # Whether placements match the original non-randomized game
    preset_label: str = ''  # Frontend label for preset buttons (e.g., "canth s4")
    progression_mapping: Dict[str, List[str]] = field(default_factory=dict)  # progressive_item -> [component_items] in order
    world_attributes: Dict[str, Any] = field(default_factory=dict)  # Game-specific world instance attributes
    dungeons: Dict[str, DungeonData] = field(default_factory=dict)  # dungeon_name -> DungeonData
    completion_condition: Optional[Dict[str, Any]] = None  # Analyzed completion condition rule


def extract_game_metadata(json_data: Dict[str, Any], player_id: str = '1') -> GameMetadata:
    """Extract game metadata from JSON.

    Args:
        json_data: Parsed JSON rules file
        player_id: Player ID to extract data for (default: '1')
    """
    game_name = json_data.get('game_name', 'UnknownGame')

    # Extract world data for the specified player (contains main world attributes)
    world_data = json_data.get('world', {}).get(player_id, {})

    # Extract exporter settings (legacy location for world_class_name)
    exporter_data = json_data.get('exporter', {}).get(player_id, {})

    # Get world class name with priority:
    # 1. world.{player}.world_class_name (authoritative, new format)
    # 2. exporter.{player}.world_class_name (legacy)
    # 3. world_classes (older legacy)
    # 4. derive from game name (fallback)
    #
    # Track original_world_class_name to preserve during game name override
    # This is set when the class name comes from the source export (not derived)
    original_world_class_name = world_data.get('world_class_name')
    world_class_name = original_world_class_name

    if not world_class_name:
        # Try exporter section (legacy)
        original_world_class_name = exporter_data.get('world_class_name')
        world_class_name = original_world_class_name

    if not world_class_name:
        # Try top-level world_classes (older legacy)
        world_classes = json_data.get('world_classes', {})
        if world_classes:
            # Get the world class for the specified player, or fall back to first available
            world_class_name = world_classes.get(player_id) or list(world_classes.values())[0]
            # Also set original_world_class_name since this came from the source export
            original_world_class_name = world_class_name

    if not world_class_name:
        # Derive from game name: "My Game" -> "MyGameWorld"
        # Note: original_world_class_name stays None since this is derived, not from source
        world_class_name = sanitize_identifier(game_name) + 'World'

    # Extract game_info for the specified player (contains game-specific custom data)
    game_info = json_data.get('game_info', {}).get(player_id, {})

    # Extract base_id (now in world[player], fallback to game_info for legacy)
    base_id = world_data.get('base_id') or game_info.get('base_id')

    # Extract web theme (now in world[player].web, fallback to game_info for legacy)
    web_data = world_data.get('web', {})
    web_theme = web_data.get('theme') or game_info.get('web_theme')

    # Extract tutorials (now in world[player].web.tutorials, fallback to game_info for legacy)
    web_tutorials = []
    tutorials_data = web_data.get('tutorials', []) or game_info.get('web_tutorials', [])
    for t in tutorials_data:
        web_tutorials.append(TutorialData(
            name=t.get('name', ''),
            description=t.get('description', ''),
            language=t.get('language', 'English'),
            file_name=t.get('file_name', ''),
            link=t.get('link', ''),
            authors=t.get('authors', []),
        ))

    # Extract world description (now in world[player], fallback to game_info for legacy)
    world_description = world_data.get('world_description') or game_info.get('world_description')

    # Extract slot_data fields (now in world[player], fallback to game_info for legacy)
    slot_data_fields = world_data.get('slot_data', {}) or game_info.get('slot_data', {})

    # Extract game options (for generating dynamic fill_slot_data)
    game_options = world_data.get('options', {})

    # Extract resolved values for evaluating option_value/world_attribute/setting_value nodes
    # This flat dict merges values from three sources:
    # 1. game_options (from world_data.options) - user-configurable options
    # 2. Top-level world_data attributes - game-specific values with correct types
    # 3. world_attributes section - runtime-computed values like shop_items
    #
    # IMPORTANT: Start with game_options, then merge top-level settings to let them take precedence.
    # This is necessary because:
    # - game_options may have string keys for Choice options (e.g., "100" instead of 100)
    # - game_options may have string booleans ('true'/'false') that need conversion
    # - Top-level settings from game-specific handlers have the correct types
    # - By applying top-level settings last, we ensure correct types win
    resolved_values = {}
    for k, v in game_options.items():
        # Convert string booleans to actual booleans
        if v == 'true':
            resolved_values[k] = True
        elif v == 'false':
            resolved_values[k] = False
        else:
            resolved_values[k] = v

    # Merge top-level attributes from world_data
    skip_keys = INTERNAL_SETTINGS | {'options', 'option_definitions', 'dungeons', 'shops', 'game'}
    for k, v in world_data.items():
        if k not in skip_keys:
            resolved_values[k] = v

    # Also include world_attributes (new format) for resolving world_attribute nodes
    # that reference runtime values like shop_items, difficulty_requirements, etc.
    world_attrs = json_data.get('world_attributes', {}).get(player_id, {})
    for k, v in world_attrs.items():
        resolved_values[k] = v

    # Extract option definitions (type, range, choices, etc.)
    option_definitions = world_data.get('option_definitions', {})

    return GameMetadata(
        game_name=game_name,
        game_directory=json_data.get('game_directory', game_name.lower().replace(' ', '_')),
        world_class_name=world_class_name,
        archipelago_version=json_data.get('archipelago_version', '0.0.0'),
        schema_version=json_data.get('schema_version', 1),
        base_id=base_id,
        web_theme=web_theme,
        web_tutorials=web_tutorials,
        world_description=world_description,
        slot_data_fields=slot_data_fields,
        game_options=game_options,
        resolved_values=resolved_values,
        option_definitions=option_definitions,
        # use_auto_indirect_conditions is now in exporter[player_id], fallback to world_data for legacy
        use_auto_indirect_conditions=exporter_data.get('use_auto_indirect_conditions', False) or world_data.get('use_auto_indirect_conditions', False),
        # Track original world class name from exporter (preserved during game name override)
        original_world_class_name=original_world_class_name,
    )


def _determine_classification(item_data: Dict[str, Any]) -> str:
    """Determine item classification from JSON data.

    First checks for the new 'classification' field, then falls back to
    legacy boolean flags for backwards compatibility.
    """
    # New format: direct classification string
    if 'classification' in item_data:
        return item_data['classification']

    # Legacy format: boolean flags (for backwards compatibility)
    if item_data.get('event', False):
        return 'progression'
    if item_data.get('trap', False):
        return 'trap'
    if item_data.get('advancement', False):
        return 'progression'
    if item_data.get('useful', False):
        return 'useful'
    return 'filler'


def extract_items(json_data: Dict[str, Any], player_id: str = '1') -> Tuple[Dict[str, ItemData], List[str], Dict[str, List[str]]]:
    """
    Extract items and item groups from JSON.

    Args:
        json_data: Parsed JSON rules file
        player_id: Player ID to extract data for (default: '1')

    Returns:
        Tuple of (items dict, item_groups list, item_name_groups dict)
    """
    items: Dict[str, ItemData] = {}
    item_groups: List[str] = []
    item_name_groups: Dict[str, List[str]] = {}

    # Get items for the specified player
    items_data = json_data.get('items', {}).get(player_id, {})

    for item_name, item_info in items_data.items():
        item_id = item_info.get('id')
        # Treat list IDs as None (e.g., ALttP pendants/crystals export SRAM data as lists)
        if isinstance(item_id, list):
            item_id = None
        is_event = item_id is None or item_info.get('event', False)
        groups = item_info.get('groups', [])
        hint_text = item_info.get('hint_text')  # Only set if different from name

        items[item_name] = ItemData(
            name=item_name,
            item_id=item_id,
            classification=_determine_classification(item_info),
            groups=groups,
            max_count=item_info.get('max_count', 1),
            is_event=is_event,
            hint_text=hint_text,
            classification_counts=item_info.get('classification_counts'),
        )

        # Build item_name_groups mapping
        for group in groups:
            if group not in item_name_groups:
                item_name_groups[group] = []
            item_name_groups[group].append(item_name)

    # Get item groups
    groups_data = json_data.get('item_groups', {}).get(player_id, [])
    item_groups = list(groups_data) if groups_data else []

    return items, item_groups, item_name_groups


def extract_locations(json_data: Dict[str, Any], player_id: str = '1') -> Tuple[Dict[str, LocationData], Dict[str, str], Dict[str, str], Dict[str, bool]]:
    """
    Extract locations from JSON regions.

    Args:
        json_data: Parsed JSON rules file
        player_id: Player ID to extract data for (default: '1')

    Returns:
        Tuple of (locations dict, original_placements dict, locked_placements dict, canonical_placement_advancements dict)
    """
    locations: Dict[str, LocationData] = {}
    original_placements: Dict[str, str] = {}
    locked_placements: Dict[str, str] = {}
    canonical_placement_advancements: Dict[str, bool] = {}  # location -> is_advancement

    regions_data = json_data.get('regions', {}).get(player_id, {})

    # Standard location keys that are handled explicitly
    standard_location_keys = {
        'name', 'id', 'access_rule', 'item_rule', 'item', 'locked',
        'progress_type', 'show_in_spoiler', 'event', 'access'
    }

    for region_name, region_info in regions_data.items():
        for loc_info in region_info.get('locations', []):
            loc_name = loc_info.get('name', '')
            loc_id = loc_info.get('id')
            is_event = loc_id is None
            is_locked = loc_info.get('locked', False)
            progress_type = loc_info.get('progress_type')  # 'EXCLUDED', 'PRIORITY', or None
            show_in_spoiler = loc_info.get('show_in_spoiler', True)

            # Extract extra attributes (game-specific fields like type_string, price)
            extra_attrs = {
                k: v for k, v in loc_info.items()
                if k not in standard_location_keys and v is not None
            }

            locations[loc_name] = LocationData(
                name=loc_name,
                location_id=loc_id,
                region=region_name,
                access_rule=loc_info.get('access_rule'),
                is_event=is_event,
                locked=is_locked,
                progress_type=progress_type,
                show_in_spoiler=show_in_spoiler,
                access=loc_info.get('access'),  # Game-specific access data
                extra_attributes=extra_attrs,
            )

            # Track original item placement for seed=1 mode
            item_info = loc_info.get('item')
            if item_info:
                item_name = item_info.get('name', '')
                original_placements[loc_name] = item_name
                # Track the item's classification (advancement = progression)
                is_advancement = item_info.get('advancement', False)
                canonical_placement_advancements[loc_name] = is_advancement
                # If the location is locked, also track it as a locked placement
                if is_locked and item_name:
                    locked_placements[loc_name] = item_name

    return locations, original_placements, locked_placements, canonical_placement_advancements


def extract_regions(json_data: Dict[str, Any], player_id: str = '1') -> Tuple[Dict[str, RegionData], Dict[str, ExitData]]:
    """
    Extract regions and exits from JSON.

    Args:
        json_data: Parsed JSON rules file
        player_id: Player ID to extract data for (default: '1')

    Returns:
        Tuple of (regions dict, exits dict)
    """
    regions: Dict[str, RegionData] = {}
    exits: Dict[str, ExitData] = {}

    regions_data = json_data.get('regions', {}).get(player_id, {})

    # Standard region keys that are handled explicitly
    standard_region_keys = {
        'name', 'locations', 'exits', 'entrances', 'hint_text',
        'dynamically_added', 'shop', 'dungeon'
    }

    for region_name, region_info in regions_data.items():
        location_names = [loc.get('name', '') for loc in region_info.get('locations', [])]
        exit_names = [exit_info.get('name', '') for exit_info in region_info.get('exits', [])]
        hint_text = region_info.get('hint_text')  # Only set if different from name
        dynamically_added = region_info.get('dynamically_added', False)
        dungeon = region_info.get('dungeon')  # Dungeon name this region belongs to

        # Auto-mark regions with no locations and no exits as dynamically_added.
        # The original world may filter these out (e.g., shapez does this).
        # These regions exist in the rules.json because other regions have exits to them,
        # but they won't appear in the sphere log because they have no content.
        if not location_names and not exit_names:
            dynamically_added = True

        # Extract extra attributes (game-specific fields like code)
        extra_attrs = {
            k: v for k, v in region_info.items()
            if k not in standard_region_keys and v is not None
        }

        regions[region_name] = RegionData(
            name=region_name,
            locations=location_names,
            exits=exit_names,
            hint_text=hint_text,
            dynamically_added=dynamically_added,
            dungeon=dungeon,
            extra_attributes=extra_attrs,
        )

        # Extract exits
        for exit_info in region_info.get('exits', []):
            exit_name = exit_info.get('name', '')
            exits[exit_name] = ExitData(
                name=exit_name,
                source_region=region_name,
                target_region=exit_info.get('connected_region', ''),
                access_rule=exit_info.get('access_rule'),
            )

    # Create missing regions that are referenced by exits but not defined
    # This handles cases where exits connect to regions that aren't top-level
    for exit_data in exits.values():
        target = exit_data.target_region
        if target and target not in regions:
            regions[target] = RegionData(
                name=target,
                locations=[],
                exits=[],
                hint_text=None,
            )

    return regions, exits


def extract_start_region(json_data: Dict[str, Any], player_id: str = '1') -> str:
    """Extract the starting region name.

    Args:
        json_data: Parsed JSON rules file
        player_id: Player ID to extract data for (default: '1')
    """
    start_regions = json_data.get('start_regions', {}).get(player_id, {})
    default_starts = start_regions.get('default', [])

    if default_starts:
        return str(default_starts[0])

    # Fallback to Menu if it exists
    regions = json_data.get('regions', {}).get(player_id, {})
    if 'Menu' in regions:
        return 'Menu'

    # Return first region as fallback
    if regions:
        return str(list(regions.keys())[0])

    return 'Menu'


def extract_itempool_counts(json_data: Dict[str, Any], player_id: str = '1') -> Dict[str, int]:
    """
    Extract item pool counts from JSON.

    The itempool_counts field contains the actual number of each item
    that should be created in the item pool.

    Args:
        json_data: Parsed JSON rules file
        player_id: Player ID to extract data for (default: '1')

    Returns:
        Dict mapping item name to count
    """
    itempool_counts: Dict[str, int] = {}

    # Get itempool_counts for the specified player
    counts_data = json_data.get('itempool_counts', {}).get(player_id, {})

    for item_name, count in counts_data.items():
        if isinstance(count, int) and count > 0:
            itempool_counts[item_name] = count

    return itempool_counts


def extract_starting_items(json_data: Dict[str, Any], player_id: str = '1') -> Dict[str, int]:
    """Extract starting items from JSON (precollected items).

    Args:
        json_data: Parsed JSON rules file
        player_id: Player ID to extract data for (default: '1')
    """
    starting = {}
    starting_data = json_data.get('starting_items', {}).get(player_id, [])

    for item in starting_data:
        if isinstance(item, str):
            starting[item] = starting.get(item, 0) + 1
        elif isinstance(item, dict):
            name = item.get('name', '')
            count = item.get('count', 1)
            if name:
                starting[name] = starting.get(name, 0) + count

    return starting


def extract_canonical_placements(json_data: Dict[str, Any], player_id: str = '1') -> Dict[str, str]:
    """
    Extract canonical placements from JSON.

    Canonical placements are the vanilla/original item locations as defined
    by the world class. These are used for seed=1 mode to place items in
    their original positions.

    Args:
        json_data: Parsed JSON rules file
        player_id: Player ID to extract data for (default: '1')

    Returns:
        Dict mapping location name to item name
    """
    canonical_data = json_data.get('canonical_placements', {}).get(player_id, {})
    return dict(canonical_data)


def extract_progression_mapping(json_data: Dict[str, Any], player_id: str = '1') -> Dict[str, List[str]]:
    """
    Extract progression mapping from JSON.

    Progression mapping defines how progressive items map to their component items.
    For example, 'progressive-processing' might map to ['steel-processing', 'oil-processing', ...].
    When a progressive item is collected, it grants access to the next uncollected component.

    Args:
        json_data: Parsed JSON rules file
        player_id: Player ID to extract data for (default: '1')

    Returns:
        Dict mapping progressive item name to ordered list of component item names
    """
    progression_data = json_data.get('progression_mapping', {}).get(player_id, {})
    result: Dict[str, List[str]] = {}

    for prog_name, prog_info in progression_data.items():
        # Skip additive type mappings - they use a different format and are handled
        # separately by compute_state_counter_accumulator_rules
        if prog_info.get('type') == 'additive':
            continue

        # prog_info has structure: {'items': [{'name': '...', 'level': N}, ...], 'base_item': '...'}
        items_list = prog_info.get('items', [])

        # Ensure items_list is actually a list (not a dict from additive mappings)
        if not isinstance(items_list, list):
            continue

        # Sort by level to ensure correct order
        sorted_items = sorted(items_list, key=lambda x: x.get('level', 0))
        component_names = [item.get('name') for item in sorted_items if item.get('name')]
        if component_names:
            result[prog_name] = component_names

    return result


def compute_state_counter_accumulator_rules(
    items: Dict[str, 'ItemData'],
    original_placements: Dict[str, str],
    helpers: Dict[str, Any] = None,
    settings: Dict[str, Any] = None
) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    """
    Compute accumulator rules and prog_items_init for state counter patterns.

    Some games (like DLCQuest) use state counters where collecting items like
    "60 coins" contributes to a " coins" counter. The rules check Has(" coins", X)
    but the actual items collected are "60 coins", "4 coins", etc.

    Other games (like Bomb Rush Cyberfunk) use items like "8 REP", "16 REP" that
    should accumulate to a "rep" counter checked via state.has("rep", player, N).

    Instead of precollecting all items (which breaks sphere progression), this
    generates accumulator_rules that tell the frontend how to parse item names
    and accumulate values into counters.

    Returns:
        Tuple of (accumulator_rules, prog_items_init)
        - accumulator_rules: List of rule dicts with pattern, extract_value, target
        - prog_items_init: Dict mapping counter names to initial value (0)
    """
    import re as regex_module

    accumulator_rules = []
    prog_items_init = {}

    # Pattern 1: Find items that are used in rules but have id=None (event/counter items)
    # and have a name pattern like " coins" or " coins freemium"
    # Use a list to preserve input order for deterministic output
    counter_items = []
    for item_name, item_data in items.items():
        if item_data.item_id is None and item_name.startswith(' '):
            # This looks like a counter item (e.g., " coins")
            if item_name not in counter_items:
                counter_items.append(item_name)

    # For each counter, find items that contribute to it and build a regex pattern
    # Check both the items dict and original_placements for matching items
    for counter_name in counter_items:
        suffix = counter_name.strip()  # e.g., "coins" from " coins"

        # Check if there are items matching the pattern "N <suffix>"
        has_matching_items = False

        # Check in items dict
        for item_name in items.keys():
            if item_name.endswith(suffix) and item_name != counter_name:
                try:
                    parts = item_name.split()
                    # Handle multi-word suffixes like "coins freemium"
                    # Check if the remaining parts after the number match the suffix
                    if len(parts) >= 2 and ' '.join(parts[1:]) == suffix:
                        int(parts[0])  # Verify it's a number
                        has_matching_items = True
                        break
                except (ValueError, IndexError):
                    pass

        # Also check in original_placements
        if not has_matching_items:
            for loc_name, item_name in original_placements.items():
                if item_name.endswith(suffix) and item_name != counter_name:
                    try:
                        parts = item_name.split()
                        # Handle multi-word suffixes like "coins freemium"
                        # Check if the remaining parts after the number match the suffix
                        if len(parts) >= 2 and ' '.join(parts[1:]) == suffix:
                            int(parts[0])  # Verify it's a number
                            has_matching_items = True
                            break
                    except (ValueError, IndexError):
                        pass

        if has_matching_items:
            # Generate regex pattern: ^(\d+) suffix$ (handles singular/plural)
            # Use word boundary or space before suffix to avoid partial matches
            if suffix.endswith('s'):
                # e.g., "coins" -> match "coin" or "coins"
                pattern = f'^(\\d+) {suffix[:-1]}s?$'
            else:
                pattern = f'^(\\d+) {suffix}s?$'

            accumulator_rules.append({
                'pattern': pattern,
                'extract_value': True,
                'target': counter_name,
                'discriminator': None
            })
            prog_items_init[counter_name] = 0

    # Pattern 2: Find items like "8 REP", "16 REP" that should accumulate to "rep"
    # These are detected by finding items matching "N <SUFFIX>" pattern where:
    # - The items have real IDs (not counter items)
    # - There's no item with just the suffix name
    # - A helper function references the lowercase suffix as a counter
    #
    # Look for patterns like "N REP" -> accumulate to "rep"
    numeric_prefix_pattern = regex_module.compile(r'^(\d+)\s+([A-Z]+)$')
    suffix_candidates = {}  # suffix -> list of matching items

    for item_name in items.keys():
        match = numeric_prefix_pattern.match(item_name)
        if match:
            suffix = match.group(2)  # e.g., "REP"
            if suffix not in suffix_candidates:
                suffix_candidates[suffix] = []
            suffix_candidates[suffix].append(item_name)

    # Also check original_placements for additional items
    for loc_name, item_name in original_placements.items():
        match = numeric_prefix_pattern.match(item_name)
        if match:
            suffix = match.group(2)
            if suffix not in suffix_candidates:
                suffix_candidates[suffix] = []
            if item_name not in suffix_candidates[suffix]:
                suffix_candidates[suffix].append(item_name)

    # For each suffix candidate, check if we should create an accumulator rule
    for suffix, matching_items in suffix_candidates.items():
        if len(matching_items) < 2:
            continue  # Need at least 2 items to be a meaningful pattern

        target_name = suffix.lower()  # e.g., "REP" -> "rep"

        # Skip if we already have a rule for this target
        if any(rule['target'] == target_name for rule in accumulator_rules):
            continue

        # Skip if there's already an item with exactly this name
        if target_name in items:
            continue

        # Create the accumulator rule
        pattern = f'^(\\d+) {suffix}$'
        accumulator_rules.append({
            'pattern': pattern,
            'extract_value': True,
            'target': target_name,
            'discriminator': None
        })
        prog_items_init[target_name] = 0

    # Pattern 3: Find items like "50 Rupees", "100 Rupees" that should accumulate
    # These are detected by finding items matching "N <Suffix>" pattern where:
    # - The suffix is a SINGLE title case word (e.g., "Rupees", not "Scraps Reward")
    # - Multiple items share the same suffix with different numbers
    # - Look for patterns like "50 Rupees" -> accumulate to "RUPEES"
    # Note: Multi-word suffixes like "Scraps Reward" are excluded to avoid false positives
    mixed_case_pattern = regex_module.compile(r'^(\d+)\s+([A-Z][a-z]+)$')
    mixed_suffix_candidates = {}  # suffix -> (uppercase_target, list of items)

    for item_name in items.keys():
        match = mixed_case_pattern.match(item_name)
        if match:
            suffix = match.group(2)  # e.g., "Rupees"
            uppercase_target = suffix.upper()  # e.g., "RUPEES"
            if suffix not in mixed_suffix_candidates:
                mixed_suffix_candidates[suffix] = (uppercase_target, [])
            mixed_suffix_candidates[suffix][1].append(item_name)

    # Also check original_placements for additional items
    for loc_name, item_name in original_placements.items():
        match = mixed_case_pattern.match(item_name)
        if match:
            suffix = match.group(2)
            uppercase_target = suffix.upper()
            if suffix not in mixed_suffix_candidates:
                mixed_suffix_candidates[suffix] = (uppercase_target, [])
            if item_name not in mixed_suffix_candidates[suffix][1]:
                mixed_suffix_candidates[suffix][1].append(item_name)

    # For each suffix candidate, check if we should create an accumulator rule
    for suffix, (target_name, matching_items) in mixed_suffix_candidates.items():
        if len(matching_items) < 2:
            continue  # Need at least 2 items to be a meaningful pattern

        # Skip if we already have a rule for this target
        if any(rule['target'] == target_name for rule in accumulator_rules):
            continue

        # Skip if there's already an item with exactly this name
        if target_name in items:
            continue

        # Create the accumulator rule
        pattern = f'^(\\d+) {suffix}$'
        accumulator_rules.append({
            'pattern': pattern,
            'extract_value': True,
            'target': target_name,
            'discriminator': None
        })
        prog_items_init[target_name] = 0

    # Pattern 4: Find items like "Time Shard (100)", "Time Shard (50)" that should accumulate
    # These are detected by finding items matching "BaseName (N)" pattern where:
    # - Multiple items share the same base name with different numbers in parentheses
    # - Look for patterns like "Time Shard (100)" -> accumulate to "Shards"
    # This pattern is opt-in via the 'use_paren_number_accumulator' setting
    if settings and settings.get('use_paren_number_accumulator', False):
        paren_number_pattern = regex_module.compile(r'^(.+?)\s+\((\d+)\)$')
        paren_suffix_candidates = {}  # base_name -> list of matching items

        for item_name in items.keys():
            match = paren_number_pattern.match(item_name)
            if match:
                base_name = match.group(1)  # e.g., "Time Shard"
                if base_name not in paren_suffix_candidates:
                    paren_suffix_candidates[base_name] = []
                paren_suffix_candidates[base_name].append(item_name)

        # Also check original_placements for additional items
        for loc_name, item_name in original_placements.items():
            match = paren_number_pattern.match(item_name)
            if match:
                base_name = match.group(1)
                if base_name not in paren_suffix_candidates:
                    paren_suffix_candidates[base_name] = []
                if item_name not in paren_suffix_candidates[base_name]:
                    paren_suffix_candidates[base_name].append(item_name)

        # For each base name candidate, check if we should create an accumulator rule
        for base_name, matching_items in paren_suffix_candidates.items():
            if len(matching_items) < 2:
                continue  # Need at least 2 items to be a meaningful pattern

            # For "Time Shard", the target is "Shards"
            # For other patterns, use the base name with 's' suffix
            if base_name == "Time Shard":
                target_name = "Shards"
            else:
                # Create a target name by removing spaces and adding 's' if needed
                target_name = base_name.replace(" ", "") + "s"

            # Skip if we already have a rule for this target
            if any(rule['target'] == target_name for rule in accumulator_rules):
                continue

            # Skip if there's already an item with exactly this name
            if target_name in items:
                continue

            # Create the accumulator rule - escape the parentheses in the pattern
            escaped_base = regex_module.escape(base_name)
            pattern = f'^{escaped_base} \\((\\d+)\\)$'
            accumulator_rules.append({
                'pattern': pattern,
                'extract_value': True,
                'target': target_name,
                'discriminator': None
            })
            prog_items_init[target_name] = 0

    return accumulator_rules, prog_items_init


def extract_helpers(json_data: Dict[str, Any], player_id: str = '1') -> Dict[str, HelperData]:
    """
    Extract helper function definitions from JSON.

    Helpers are stored in rules.json in two formats:
    1. Simple helpers (no params): Just a rule body directly
       {"can_stack": {"type": "item_check", "item": "Stacker"}}

    2. Parameterized helpers: Have params, body, and optional defaults
       {"has_x_belt_multiplier": {"params": ["needed"], "body": {...}, "defaults": {...}}}

    Args:
        json_data: Parsed JSON rules file
        player_id: Player ID to extract data for (default: '1')

    Returns:
        Dict mapping helper name to HelperData
    """
    helpers: Dict[str, HelperData] = {}
    helpers_data = json_data.get('helpers', {}).get(player_id, {})

    for helper_name, helper_def in helpers_data.items():
        if not isinstance(helper_def, dict):
            continue

        if 'params' in helper_def or 'body' in helper_def:
            # Parameterized helper with explicit params/body structure
            raw_params = helper_def.get('params', [])
            body = helper_def.get('body', helper_def)
            defaults = helper_def.get('defaults', {})
            param_mappings = helper_def.get('param_mappings', {})

            # Include all declared params in the function signature, even if they're
            # not used in the body. This is necessary because callers will pass
            # arguments based on the original helper's params, not on what the
            # (possibly simplified/expanded) body uses. Unused params will simply
            # be ignored by the function body.
            helpers[helper_name] = HelperData(
                name=helper_name,
                params=raw_params,
                body=body,
                defaults=defaults,
                param_mappings=param_mappings
            )
        else:
            # Simple helper - the entire helper_def is the body
            helpers[helper_name] = HelperData(
                name=helper_name,
                params=[],
                body=helper_def,
                defaults={},
                param_mappings={}
            )

    return helpers


def extract_world_attributes(json_data: Dict[str, Any], player_id: str = '1') -> Dict[str, Any]:
    """
    Extract game-specific world instance attributes from JSON.

    These are attributes that need to be added to the generated world class
    as instance attributes (runtime-computed values like difficulty settings,
    shop data, etc.).

    World attributes are stored in the 'world_attributes' section of the JSON
    (new format), or extracted from 'world' section for legacy compatibility.

    Args:
        json_data: Parsed JSON rules file
        player_id: Player ID to extract data for (default: '1')

    Returns:
        Dict of attribute_name -> attribute_value
    """
    world_attributes: Dict[str, Any] = {}

    # Extract world data for the specified player
    world_data = json_data.get('world', {}).get(player_id, {})

    # New format: world_attributes is a separate section
    new_world_attrs = json_data.get('world_attributes', {}).get(player_id, {})
    if new_world_attrs:
        world_attributes.update(new_world_attrs)

    # Extract shops data from world.<player_id>.shops for games with shop-related helpers
    # This is needed for cross-validation where can_buy/can_buy_unlimited helpers
    # iterate over shops to check item availability
    # Only include shops if they exist and are non-empty
    if 'shops' in world_data and world_data['shops']:
        world_attributes['shops'] = world_data['shops']

    # Also check game_info for shops (new ALttP format with unlimited_items)
    game_info = json_data.get('game_info', {}).get(player_id, {})
    if 'shops' in game_info and game_info['shops'] and 'shops' not in world_attributes:
        world_attributes['shops'] = game_info['shops']

    if not new_world_attrs:
        # Extract game-specific computed settings that need to be world attributes
        # These are settings that are accessed by helpers as world.X
        # (e.g., world.difficulty_requirements, world.shop_items)
        # Settings to skip (internal/structural settings, not world attributes)
        skip_settings = {
            'game',
            'options',
            'option_definitions',
            'world_directory',
            'assume_bidirectional_exits',
            'use_resolved_items',
            'use_auto_indirect_conditions',
            'player_name',  # Read-only property on base World class
            'web',  # Handled by WebWorld class (theme, tutorials)
        }

        for key, value in world_data.items():
            if key in skip_settings:
                continue
            # Only include complex types (dicts, lists) or specific primitives
            # that are likely game-specific computed attributes
            if isinstance(value, (dict, list)):
                world_attributes[key] = value
            elif isinstance(value, bool) and key not in {'death_link'}:
                # Include booleans that aren't common options
                world_attributes[key] = value
            elif isinstance(value, (int, float)) and not isinstance(value, bool):
                # Include numeric values (these are often computed limits/requirements)
                world_attributes[key] = value
            elif isinstance(value, str) and key not in {'game'}:
                # Include string values (like medallion names)
                world_attributes[key] = value

    return world_attributes


def extract_dungeons(json_data: Dict[str, Any], player_id: str = '1') -> Dict[str, DungeonData]:
    """
    Extract dungeon data from JSON.

    Args:
        json_data: Parsed JSON rules file
        player_id: Player ID to extract data for (default: '1')

    Returns:
        Dictionary of dungeon_name -> DungeonData
    """
    dungeons_data = json_data.get('dungeons', {}).get(player_id, {})
    dungeons = {}

    for dungeon_name, dungeon_info in dungeons_data.items():
        # Extract boss data
        bosses = {}
        bosses_info = dungeon_info.get('bosses', {})
        for boss_key, boss_info in bosses_info.items():
            # boss_key is 'None', 'top', 'middle', 'bottom', etc.
            bosses[boss_key] = BossData(
                name=boss_info.get('name', ''),
                defeat_rule=boss_info.get('defeat_rule')
            )

        dungeons[dungeon_name] = DungeonData(
            name=dungeon_name,
            regions=dungeon_info.get('regions', []),
            bosses=bosses
        )

    return dungeons


def apply_name_substitutions(json_data: Dict[str, Any], player_id: str = '1') -> None:
    """
    Apply name substitutions to raw JSON data before extraction.

    If the world section contains a ``name_substitutions`` dict (with sub-dicts
    ``items``, ``locations``, ``regions``), every occurrence of each generic name
    is replaced with its meaningful counterpart throughout the JSON.  This lets
    worlds that must use generic class-level names (e.g. "Statement 1") publish
    readable names for use in WorldGen worlds.

    Mutates *json_data* in place.
    """
    world_section = json_data.get('world', {}).get(player_id, {})
    subs = world_section.get('name_substitutions')
    if not subs:
        return

    item_map: Dict[str, str] = subs.get('items', {})
    loc_map: Dict[str, str] = subs.get('locations', {})
    region_map: Dict[str, str] = subs.get('regions', {})

    if not item_map and not loc_map and not region_map:
        return

    logger.info(
        f"Applying name substitutions: {len(item_map)} items, "
        f"{len(loc_map)} locations, {len(region_map)} regions"
    )

    # --- helper: rename dict keys in place -----------------------------------
    def _rename_keys(d: Dict[str, Any], mapping: Dict[str, str]) -> None:
        for old, new in mapping.items():
            if old in d:
                d[new] = d.pop(old)

    # --- helper: rename dict values in place ---------------------------------
    def _rename_values(d: Dict[str, Any], mapping: Dict[str, str]) -> None:
        for key, val in d.items():
            if isinstance(val, str) and val in mapping:
                d[key] = mapping[val]

    # --- helper: rename strings in a list in place ---------------------------
    def _rename_list(lst: List[Any], mapping: Dict[str, str]) -> None:
        for i, val in enumerate(lst):
            if isinstance(val, str) and val in mapping:
                lst[i] = mapping[val]

    # --- helper: recursively substitute item names inside an access rule -----
    def _sub_rule(rule: Any) -> None:
        if not isinstance(rule, dict):
            return
        args = rule.get('args', {})
        if not isinstance(args, dict):
            return
        # Has / CountItem use "item_name"
        if 'item_name' in args and args['item_name'] in item_map:
            args['item_name'] = item_map[args['item_name']]
        # HasAll / HasAny use "items" list
        if 'items' in args and isinstance(args['items'], list):
            _rename_list(args['items'], item_map)
        # HasGroup / CountGroup use "group" — groups aren't renamed here
        # CountFromList uses "items" list (already covered above)
        # item field (used in some rules)
        if 'item' in args and isinstance(args['item'], str) and args['item'] in item_map:
            args['item'] = item_map[args['item']]
        # Recurse into compound rules (And, Or, Not, Compare)
        for key in ('rules', 'left', 'right', 'rule'):
            child = args.get(key)
            if isinstance(child, list):
                for sub in child:
                    _sub_rule(sub)
            elif isinstance(child, dict):
                _sub_rule(child)

    # =========================================================================
    # 1. items.{player_id} — dict keys
    # =========================================================================
    items_section = json_data.get('items', {}).get(player_id, {})
    if items_section:
        _rename_keys(items_section, item_map)

    # =========================================================================
    # 2. regions.{player_id} — region keys, location names/items, exit targets,
    #    and access rules
    # =========================================================================
    regions_section = json_data.get('regions', {}).get(player_id, {})
    if regions_section:
        # Rename region keys
        _rename_keys(regions_section, region_map)

        for region_data in regions_section.values():
            # Region name field
            if isinstance(region_data.get('name'), str) and region_data['name'] in region_map:
                region_data['name'] = region_map[region_data['name']]

            # Locations
            for loc in region_data.get('locations', []):
                # Location name
                if isinstance(loc.get('name'), str) and loc['name'] in loc_map:
                    loc['name'] = loc_map[loc['name']]
                # Placed item name
                item_info = loc.get('item')
                if isinstance(item_info, dict):
                    if isinstance(item_info.get('name'), str) and item_info['name'] in item_map:
                        item_info['name'] = item_map[item_info['name']]
                # Location access rule
                _sub_rule(loc.get('access_rule'))

            # Exits
            for ex in region_data.get('exits', []):
                # Connected region
                if isinstance(ex.get('connected_region'), str) and ex['connected_region'] in region_map:
                    ex['connected_region'] = region_map[ex['connected_region']]
                # Exit access rule
                _sub_rule(ex.get('access_rule'))

    # =========================================================================
    # 3. canonical_placements.{player_id} — keys are locations, values are items
    # =========================================================================
    cp = json_data.get('canonical_placements', {}).get(player_id)
    if cp and isinstance(cp, dict):
        _rename_keys(cp, loc_map)
        _rename_values(cp, item_map)

    # =========================================================================
    # 4. starting_items.{player_id} — list of item names
    # =========================================================================
    si = json_data.get('starting_items', {}).get(player_id)
    if si and isinstance(si, list):
        _rename_list(si, item_map)

    # =========================================================================
    # 5. itempool_counts.{player_id} — dict keys are item names
    # =========================================================================
    ic = json_data.get('itempool_counts', {}).get(player_id)
    if ic and isinstance(ic, dict):
        _rename_keys(ic, item_map)

    # =========================================================================
    # 6. game_info.{player_id}.completion_condition.item
    # =========================================================================
    gi = json_data.get('game_info', {}).get(player_id, {})
    cc = gi.get('completion_condition', {})
    if isinstance(cc, dict) and isinstance(cc.get('item'), str) and cc['item'] in item_map:
        cc['item'] = item_map[cc['item']]

    # =========================================================================
    # 7. progression_mapping.{player_id} — keys and values
    # =========================================================================
    pm = json_data.get('progression_mapping', {}).get(player_id)
    if pm and isinstance(pm, dict):
        _rename_keys(pm, item_map)
        _rename_values(pm, item_map)

    # =========================================================================
    # 8. world.{player_id} sub-sections
    # =========================================================================
    ws = json_data.get('world', {}).get(player_id, {})

    # canonical_placements — keys are locations, values are items
    wcp = ws.get('canonical_placements')
    if wcp and isinstance(wcp, dict):
        _rename_keys(wcp, loc_map)
        _rename_values(wcp, item_map)

    # location_dependencies — keys are locations, values are item name lists
    ld = ws.get('location_dependencies')
    if ld and isinstance(ld, dict):
        _rename_keys(ld, loc_map)
        for dep_list in ld.values():
            if isinstance(dep_list, list):
                _rename_list(dep_list, item_map)

    # entrance_dependencies — values are item name lists
    ed = ws.get('entrance_dependencies')
    if ed and isinstance(ed, dict):
        for dep_list in ed.values():
            if isinstance(dep_list, list):
                _rename_list(dep_list, item_map)

    # exit_dependencies — values are item name lists
    exd = ws.get('exit_dependencies')
    if exd and isinstance(exd, dict):
        for dep_list in exd.values():
            if isinstance(dep_list, list):
                _rename_list(dep_list, item_map)

    # Remove name_substitutions from world section so it doesn't get exported
    # as a world attribute in the generated code
    ws.pop('name_substitutions', None)

    logger.info("Name substitutions applied successfully")


def extract_all(json_data: Dict[str, Any], player_id: str = '1') -> ExtractedData:
    """
    Extract all data from a JSON rules file.

    Args:
        json_data: Parsed JSON rules file
        player_id: Player ID to extract data for (default: '1')

    Returns:
        ExtractedData containing all extracted information
    """
    metadata = extract_game_metadata(json_data, player_id=player_id)
    items, item_groups, item_name_groups = extract_items(json_data, player_id=player_id)
    locations, original_placements, locked_placements, canonical_placement_advancements = extract_locations(json_data, player_id=player_id)
    regions, exits = extract_regions(json_data, player_id=player_id)
    start_region = extract_start_region(json_data, player_id=player_id)
    itempool_counts = extract_itempool_counts(json_data, player_id=player_id)
    helpers = extract_helpers(json_data, player_id=player_id)

    # Get starting items from JSON
    starting_items = extract_starting_items(json_data, player_id=player_id)

    # Get canonical placements from JSON (vanilla/original item locations)
    canonical_placements = extract_canonical_placements(json_data, player_id=player_id)

    # Check if placements are vanilla (match original non-randomized game)
    is_vanilla = json_data.get('is_vanilla', False)

    # Get preset label for frontend display (e.g., "canth s4")
    preset_label = json_data.get('preset_label', '')

    # Get progression mapping for progressive items (e.g., progressive-processing -> [steel-processing, oil-processing, ...])
    progression_mapping = extract_progression_mapping(json_data, player_id=player_id)

    # Compute accumulator rules for state counter patterns (for frontend export)
    accumulator_rules, prog_items_init = compute_state_counter_accumulator_rules(
        items, original_placements, settings=metadata.resolved_values
    )

    # If no accumulator rules were auto-detected, check game_info for explicitly provided rules.
    # This is needed for games like Jigsaw that use non-standard patterns (e.g., "17 Puzzle Pieces" -> "pcs")
    # that can't be auto-detected but are explicitly defined in the game's export handler.
    game_info = json_data.get('game_info', {}).get(player_id, {})
    completion_condition = game_info.get('completion_condition')
    if not accumulator_rules and 'accumulator_rules' in game_info:
        accumulator_rules = game_info['accumulator_rules']
        logger.info(f"Using accumulator_rules from game_info: {accumulator_rules}")
    if not prog_items_init and 'prog_items_init' in game_info:
        prog_items_init = game_info['prog_items_init']
        logger.info(f"Using prog_items_init from game_info: {prog_items_init}")

    # For games with state counters, we need to precollect the counter items
    # for generation to work (rules check Has(" coins", X) which needs items in inventory).
    # The exporter will filter these out from starting_items since the frontend
    # uses accumulator_rules instead. The prog_items_init stays at 0 (set by
    # compute_state_counter_accumulator_rules) and the counter accumulates as items are collected.
    if accumulator_rules:
        # Calculate total for each counter from items in original_placements
        for rule in accumulator_rules:
            import re
            pattern = rule['pattern']
            target = rule['target']
            total = 0
            for loc_name, item_name in original_placements.items():
                match = re.match(pattern, item_name)
                if match:
                    try:
                        value = int(match.group(1))
                        total += value
                    except (ValueError, IndexError):
                        pass
            if total > 0:
                # Add to starting_items for generation (will be filtered by exporter)
                starting_items[target] = starting_items.get(target, 0) + total
                # Note: prog_items_init[target] stays at 0 - it's already set by
                # compute_state_counter_accumulator_rules. We don't want to initialize
                # the counter to the total - we want it to accumulate from 0.

    # Extract game-specific world attributes
    world_attributes = extract_world_attributes(json_data, player_id=player_id)

    # Add option values from helper param_mappings to world_attributes.
    # This ensures that options referenced via param_mappings are accessible as
    # world attributes at runtime, which enables proper param_mapping discovery
    # when the worldgen world is re-exported.
    # Get the option values and definitions from metadata extraction above
    world_data = json_data.get('world', {}).get(player_id, {})
    game_options = world_data.get('options', {})
    option_definitions = world_data.get('option_definitions', {})
    for helper_data in helpers.values():
        for param, setting_name in helper_data.param_mappings.items():
            # Check if this setting_name refers to an option (not already a world attribute)
            if setting_name in option_definitions or setting_name in game_options:
                if setting_name not in world_attributes:
                    # Get the option value and add it as a world attribute
                    if setting_name in game_options:
                        value = game_options[setting_name]
                        # Convert string booleans
                        if value == 'true':
                            value = True
                        elif value == 'false':
                            value = False
                        world_attributes[setting_name] = value

    # Extract dungeon data (including bosses and defeat rules)
    dungeons = extract_dungeons(json_data, player_id=player_id)

    return ExtractedData(
        metadata=metadata,
        items=items,
        locations=locations,
        regions=regions,
        exits=exits,
        item_groups=item_groups,
        item_name_groups=item_name_groups,
        start_region=start_region,
        original_placements=original_placements,
        helpers=helpers,
        itempool_counts=itempool_counts,
        locked_placements=locked_placements,
        starting_items=starting_items,
        accumulator_rules=accumulator_rules,
        prog_items_init=prog_items_init,
        canonical_placements=canonical_placements,
        canonical_placement_advancements=canonical_placement_advancements,
        is_vanilla=is_vanilla,
        preset_label=preset_label,
        progression_mapping=progression_mapping,
        world_attributes=world_attributes,
        dungeons=dungeons,
        completion_condition=completion_condition,
    )
