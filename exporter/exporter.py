# exporter/exporter.py

"""Handles preparation and formatting of rule data for export."""

import sys
import logging
import json
import os
import inspect
import shutil
from functools import lru_cache, partial
from typing import Any, Dict, List, Set, Optional, Tuple
from collections import defaultdict

import Utils
from .analyzer import analyze_rule, reset_analyze_rule_counter
from .analyzer.cache import clear_caches as clear_analyzer_caches
from .games import get_game_export_handler, clear_handler_cache
from .converter import convert_rules_file_to_rule_builder
from .constants import (
    MAX_RULE_SIZE_KB,
    MAX_INTERIM_EXPORT_SIZE_MB_BASE, MAX_INTERIM_EXPORT_SIZE_MB_PER_EXTRA_GAME,
    MAX_FINAL_EXPORT_SIZE_MB_BASE, MAX_FINAL_EXPORT_SIZE_MB_PER_EXTRA_GAME,
    SAFE_TO_SORT_KEYS, SAFE_TO_SORT_DICT_KEYS
)
from .profiling import profiler, auto_enable_from_env
from BaseClasses import ItemClassification

# Auto-enable profiling from environment variable
auto_enable_from_env()

logger = logging.getLogger(__name__)


def classification_to_string(classification: ItemClassification) -> str:
    """Convert an ItemClassification enum to its string name.

    Handles combined flags by returning the most specific named combination,
    or the highest priority component for unnamed combinations.
    """
    # Check for exact named combinations first (most specific)
    if classification == ItemClassification.progression_deprioritized_skip_balancing:
        return "progression_deprioritized_skip_balancing"
    if classification == ItemClassification.progression_skip_balancing:
        return "progression_skip_balancing"
    if classification == ItemClassification.progression_deprioritized:
        return "progression_deprioritized"

    # Check individual flags (in priority order)
    if classification == ItemClassification.progression:
        return "progression"
    if classification == ItemClassification.useful:
        return "useful"
    if classification == ItemClassification.trap:
        return "trap"
    if classification == ItemClassification.filler:
        return "filler"

    # Handle combined flags by returning the highest priority component
    # Priority order: progression > useful > trap > filler
    if ItemClassification.progression in classification:
        return "progression"
    if ItemClassification.useful in classification:
        return "useful"
    if ItemClassification.trap in classification:
        return "trap"

    # For other combinations, use the enum's name if available
    try:
        return classification.name or str(classification)
    except (AttributeError, ValueError):
        # Fallback: return string representation
        return str(classification)


# Classification priority for determining which classification wins when
# multiple copies of an item exist with different classifications.
# Higher number = higher priority (should win over lower priority)
CLASSIFICATION_PRIORITY = {
    'filler': 0,
    'trap': 1,
    'useful': 2,
    'progression': 3,
    'progression_skip_balancing': 3,
    'progression_deprioritized': 3,
    'progression_deprioritized_skip_balancing': 3,
}


def classification_has_higher_priority(new_classification: str, current_classification: str) -> bool:
    """Check if new_classification has higher priority than current_classification.

    Used when multiple copies of an item exist with different classifications
    (e.g., Muse Dash where first song copy is progression, duplicates are useful).
    The highest priority classification should be used.
    """
    new_priority = CLASSIFICATION_PRIORITY.get(new_classification, 0)
    current_priority = CLASSIFICATION_PRIORITY.get(current_classification, 0)
    return new_priority > current_priority


# Module-level cache for rule analysis results
# Key: (id(rule_func), id(game_handler), player, rule_target_name)
# Including rule_target_name prevents cache collisions when the same function
# is used for multiple targets with different results (e.g., Paint locations)
_rule_analysis_cache: Dict[Tuple[int, int, Optional[int], Optional[str]], Any] = {}

def clear_rule_cache():
    """Clear the rule analysis cache. Call between generations."""
    _rule_analysis_cache.clear()


# Cache for tracking-mode-config to avoid repeated file reads
_tracking_mode_config_cache: Optional[Dict[str, Any]] = None


def _load_tracking_mode_config() -> Optional[Dict[str, Any]]:
    """Load the tracking mode configuration from tracking-mode-config.json.

    The file is expected to be in the same directory as this module.
    Returns the config dict or None if not found/invalid.
    """
    global _tracking_mode_config_cache
    if _tracking_mode_config_cache is not None:
        return _tracking_mode_config_cache

    config_path = os.path.join(os.path.dirname(__file__), 'tracking-mode-config.json')

    if not os.path.exists(config_path):
        logger.debug(f"tracking-mode-config.json not found at {config_path}")
        return None

    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
        logger.debug(f"Loaded tracking mode config with {len(config.get('game_results', {}).get('bundled', {}))} bundled games")
        _tracking_mode_config_cache = config
        return config
    except (json.JSONDecodeError, IOError) as e:
        logger.warning(f"Failed to load tracking-mode-config.json: {e}")
        return None


def _get_game_category(game_name: str) -> str:
    """Determine whether a game is bundled or from apworlds.

    Returns 'bundled' or 'apworlds' based on game's world location.
    """
    try:
        from worlds.AutoWorld import AutoWorldRegister
        if game_name in AutoWorldRegister.world_types:
            world_cls = AutoWorldRegister.world_types[game_name]
            module_path = world_cls.__module__
            # APWorlds are typically in custom_worlds directory
            if 'custom_worlds' in module_path or module_path.startswith('custom_worlds'):
                return 'apworlds'
    except Exception as e:
        logger.debug(f"Could not determine category for {game_name}: {e}")
    return 'bundled'


def _get_passing_modes(game_name: str, config: Dict[str, Any]) -> List[str]:
    """Get the list of passing tracking modes for a game from the config.

    Args:
        game_name: Name of the game
        config: The loaded tracking mode config

    Returns:
        List of passing mode names (e.g., ['worldgen', 'pickle']) or empty list
    """
    if not config:
        return []

    game_results = config.get('game_results', {})
    category = _get_game_category(game_name)

    # Check in the appropriate category
    category_results = game_results.get(category, {})
    if game_name in category_results:
        return category_results[game_name]

    # Check both categories as fallback
    for cat in ['bundled', 'apworlds']:
        cat_results = game_results.get(cat, {})
        if game_name in cat_results:
            return cat_results[game_name]

    # Game not in config - return empty list (no passing modes)
    return []


def _get_first_passing_mode(game_name: str, config: Dict[str, Any]) -> Optional[str]:
    """Get the first tracking mode in fallback_order that passes for this game.

    Args:
        game_name: Name of the game
        config: The loaded tracking mode config

    Returns:
        First passing mode name or None if no modes pass
    """
    if not config:
        return None

    fallback_order = config.get('fallback_order', ['worldgen', 'pickle', 'original'])
    passing_modes = _get_passing_modes(game_name, config)

    for mode in fallback_order:
        if mode in passing_modes:
            return mode

    return None


def _should_export_rules_json_from_config(game_name: str) -> bool:
    """Determine if rules.json should be exported based on tracking mode config.

    Rules.json should be exported if the first passing mode is 'worldgen'.

    Args:
        game_name: Name of the game

    Returns:
        True if rules.json should be exported
    """
    config = _load_tracking_mode_config()
    if not config:
        # No config - fall back to always export
        return True

    first_mode = _get_first_passing_mode(game_name, config)
    return first_mode == 'worldgen'


def _should_export_pickle_from_config(game_name: str) -> bool:
    """Determine if pickle should be exported based on tracking mode config.

    Pickle should be exported if the first passing mode is 'pickle'.

    Args:
        game_name: Name of the game

    Returns:
        True if pickle should be exported
    """
    config = _load_tracking_mode_config()
    if not config:
        # No config - don't export pickle by default
        return False

    first_mode = _get_first_passing_mode(game_name, config)
    return first_mode == 'pickle'


def _insert_hint_text(item_data: dict, hint_text: str) -> None:
    """Insert hint_text immediately after 'name' key in item_data dict.

    This ensures consistent key ordering in the exported JSON.
    """
    if 'hint_text' in item_data:
        return  # Already has hint_text

    # Rebuild dict with hint_text after name
    new_data = {}
    for key, value in item_data.items():
        new_data[key] = value
        if key == 'name':
            new_data['hint_text'] = hint_text
    item_data.clear()
    item_data.update(new_data)

def resolve_attribute_nodes_in_rule(rule: Dict[str, Any], world) -> Dict[str, Any]:
    """
    Recursively resolve attribute nodes in a rule structure to their actual values.
    This is needed for item_check rules, helper arguments, and world option references.

    Args:
        rule: The rule dictionary to process
        world: The world object to resolve attributes from

    Returns:
        The rule with resolved attributes
    """
    if not rule or not isinstance(rule, dict):
        return rule

    # Helper function to resolve a single attribute node (including nested chains)
    def resolve_attribute(attr_node):
        if not isinstance(attr_node, dict) or attr_node.get('type') != 'attribute':
            return attr_node

        # Recursively resolve the object part first (handles nested attributes)
        obj_node = attr_node.get('object')
        attr_name = attr_node.get('attr')

        if not attr_name:
            return attr_node

        try:
            # If the object is a name (e.g., 'world'), resolve it first
            if isinstance(obj_node, dict) and obj_node.get('type') == 'name':
                obj_name = obj_node.get('name')
                if obj_name == 'world':
                    # Start with world object
                    obj = world
                elif obj_name and hasattr(world, obj_name):
                    obj = getattr(world, obj_name)
                elif obj_name and hasattr(world, '__class__') and hasattr(world.__class__, '__module__'):
                    # Import the world's module and look for the object there
                    import sys
                    world_module = sys.modules.get(world.__class__.__module__)
                    if world_module and hasattr(world_module, obj_name):
                        obj = getattr(world_module, obj_name)
                    else:
                        return attr_node
                else:
                    return attr_node
            # If the object is itself an attribute (e.g., world.options), resolve it recursively
            elif isinstance(obj_node, dict) and obj_node.get('type') == 'attribute':
                resolved_obj_node = resolve_attribute(obj_node)
                # If we successfully resolved to a constant, use that value as the object
                if resolved_obj_node.get('type') == 'constant':
                    obj = resolved_obj_node.get('value')
                else:
                    return attr_node
            else:
                return attr_node

            # Now get the attribute from the resolved object
            if obj is not None:
                resolved_value = getattr(obj, attr_name)
                # Resolve any basic types (str, int, bool, float)
                if isinstance(resolved_value, (str, int, bool, float, type(None))):
                    logger.debug(f"Resolved attribute chain to value: {resolved_value}")
                    return {'type': 'constant', 'value': resolved_value}
                # If it's another object (like world.options), keep it as a value for further resolution
                else:
                    logger.debug(f"Resolved attribute {attr_name} to object: {type(resolved_value)}")
                    return {'type': 'constant', 'value': resolved_value}
        except (AttributeError, KeyError, TypeError) as e:
            logger.debug(f"Could not resolve attribute {attr_name}: {e}")

        return attr_node

    # Helper function to resolve subscript nodes
    def resolve_subscript(subscript_node):
        if not isinstance(subscript_node, dict) or subscript_node.get('type') != 'subscript':
            return subscript_node

        value_node = subscript_node.get('value')
        index_node = subscript_node.get('index')

        if not value_node or not index_node:
            return subscript_node

        try:
            # First resolve the value (the object being subscripted)
            resolved_value = resolve_attribute_nodes_in_rule(value_node, world)

            # Then resolve the index
            resolved_index = resolve_attribute_nodes_in_rule(index_node, world)

            # If both resolved to constants, perform the subscript operation
            if (resolved_value.get('type') == 'constant' and
                resolved_index.get('type') == 'constant'):
                obj = resolved_value.get('value')
                idx = resolved_index.get('value')

                if obj is not None and idx is not None:
                    try:
                        # Try direct subscript first
                        result = obj[idx]
                    except (KeyError, TypeError):
                        # If that fails and obj is a dict, try to match Enum keys by their .value
                        if isinstance(obj, dict):
                            result = None
                            for key, value in obj.items():
                                # Check if the key is an Enum and its value matches idx
                                if hasattr(key, 'value') and key.value == idx:
                                    result = value
                                    break
                            if result is None:
                                logger.debug(f"Could not find key {idx} in dict with keys: {list(obj.keys())}")
                                return subscript_node
                        else:
                            logger.debug(f"Could not resolve subscript: {idx}")
                            return subscript_node
                    except (IndexError, Exception) as e:
                        logger.debug(f"Could not resolve subscript: {e}")
                        return subscript_node

                    # Convert result to proper JSON-serializable format
                    try:
                        if isinstance(result, dict):
                            logger.debug(f"Resolved subscript to dict: {result}")
                            return {'type': 'constant', 'value': dict(result)}
                        elif isinstance(result, (list, tuple)):
                            logger.debug(f"Resolved subscript to list: {result}")
                            return {'type': 'constant', 'value': list(result)}
                        elif isinstance(result, (str, int, bool, float, type(None))):
                            logger.debug(f"Resolved subscript to value: {result}")
                            return {'type': 'constant', 'value': result}
                        else:
                            logger.debug(f"Resolved subscript to object: {type(result)}")
                            return {'type': 'constant', 'value': result}
                    except Exception as e:
                        logger.debug(f"Could not convert result to JSON: {e}")
                        return subscript_node
        except Exception as e:
            logger.debug(f"Error resolving subscript: {e}")

        return subscript_node

    # If the rule itself is an attribute node, try to resolve it
    if rule.get('type') == 'attribute':
        return resolve_attribute(rule)

    # If the rule itself is a subscript node, try to resolve it
    if rule.get('type') == 'subscript':
        resolved = resolve_subscript(rule)
        # If we resolved to a constant containing a dict/list, this might need
        # further transformation for state_method calls
        return resolved

    # Process state_method rules with complex arguments
    if rule.get('type') == 'state_method':
        method = rule.get('method')
        args = rule.get('args', [])

        # Resolve args recursively first
        if args:
            resolved_args = [resolve_attribute_nodes_in_rule(arg, world) if isinstance(arg, dict) else arg for arg in args]
            rule['args'] = resolved_args

            # For has_all_counts and has_all, if the first arg is now a constant (dict/list),
            # inline it into the rule structure
            if method == 'has_all_counts' and len(resolved_args) > 0:
                first_arg = resolved_args[0]
                if first_arg.get('type') == 'constant' and isinstance(first_arg.get('value'), dict):
                    # Transform to inline items dict
                    rule['args'] = [{'type': 'constant', 'value': dict(first_arg['value'])}]

            elif method == 'has_all' and len(resolved_args) > 0:
                first_arg = resolved_args[0]
                if first_arg.get('type') == 'constant' and isinstance(first_arg.get('value'), (list, tuple)):
                    # Transform to inline items list
                    rule['args'] = [{'type': 'constant', 'value': list(first_arg['value'])}]

    # Process item_check rules
    if rule.get('type') == 'item_check':
        item = rule.get('item')
        if isinstance(item, dict):
            rule['item'] = resolve_attribute_nodes_in_rule(item, world)

    # Process helper rules and their arguments
    if rule.get('type') == 'helper':
        args = rule.get('args', [])
        if args:
            rule['args'] = [resolve_attribute_nodes_in_rule(arg, world) if isinstance(arg, dict) else arg for arg in args]

    # Recursively process nested rules
    if rule.get('type') in ['and', 'or']:
        rule['conditions'] = [resolve_attribute_nodes_in_rule(cond, world) for cond in rule.get('conditions', [])]

    if rule.get('type') == 'not':
        rule['condition'] = resolve_attribute_nodes_in_rule(rule.get('condition'), world)  # type: ignore[arg-type]

    if rule.get('type') == 'conditional':
        rule['test'] = resolve_attribute_nodes_in_rule(rule.get('test'), world)  # type: ignore[arg-type]
        if rule.get('if_true') is not None:
            rule['if_true'] = resolve_attribute_nodes_in_rule(rule.get('if_true'), world)  # type: ignore[arg-type]
        if rule.get('if_false') is not None:
            rule['if_false'] = resolve_attribute_nodes_in_rule(rule.get('if_false'), world)  # type: ignore[arg-type]

        # Eliminate constant conditionals after resolving attributes
        test = rule.get('test')
        if test and test.get('type') == 'constant':
            test_value = test.get('value')
            if test_value:  # Truthy - return if_true branch
                return rule.get('if_true')  # type: ignore[return-value]
            else:  # Falsy - return if_false branch
                return rule.get('if_false')  # type: ignore[return-value]

    # Process compare rules
    if rule.get('type') == 'compare':
        if rule.get('left'):
            rule['left'] = resolve_attribute_nodes_in_rule(rule['left'], world)
        if rule.get('right'):
            rule['right'] = resolve_attribute_nodes_in_rule(rule['right'], world)

    # Process binary_op rules
    if rule.get('type') == 'binary_op':
        if rule.get('left'):
            rule['left'] = resolve_attribute_nodes_in_rule(rule['left'], world)
        if rule.get('right'):
            rule['right'] = resolve_attribute_nodes_in_rule(rule['right'], world)

    return rule

@lru_cache(maxsize=128)
def get_world_directory_name(game_name: str) -> str:
    """
    Get the world directory name for a given game name.
    First tries to read from the pre-built world-mapping.json file (which includes apworld files),
    then falls back to scanning the worlds directory.
    Falls back to the old naming logic if no matching world is found.

    Results are cached to avoid repeated filesystem access.
    """
    try:
        # First, try to read from the pre-built world-mapping.json
        mapping_file = os.path.join(os.path.dirname(__file__), '..', 'scripts', 'data', 'world-mapping.json')
        if os.path.exists(mapping_file):
            try:
                with open(mapping_file, 'r', encoding='utf-8') as f:
                    mapping = json.load(f)
                    if game_name in mapping:
                        world_dir = mapping[game_name].get('world_directory')
                        if world_dir:
                            logger.info(f"Found world directory '{world_dir}' for game '{game_name}' in world-mapping.json")
                            return world_dir
                    else:
                        logger.debug(f"Game '{game_name}' not found in world-mapping.json (has {len(mapping)} entries)")
            except (IOError, json.JSONDecodeError) as e:
                logger.debug(f"Could not read world mapping file: {e}")

        # Also check world-mapping-unofficial.json for apworld entries
        unofficial_mapping_file = os.path.join(os.path.dirname(__file__), '..', 'scripts', 'data', 'world-mapping-unofficial.json')
        if os.path.exists(unofficial_mapping_file):
            try:
                with open(unofficial_mapping_file, 'r', encoding='utf-8') as f:
                    mapping = json.load(f)
                    if game_name in mapping:
                        world_dir = mapping[game_name].get('world_directory')
                        if world_dir:
                            logger.info(f"Found world directory '{world_dir}' for game '{game_name}' in world-mapping-unofficial.json")
                            return world_dir
                    else:
                        logger.debug(f"Game '{game_name}' not found in world-mapping-unofficial.json (has {len(mapping)} entries)")
            except (IOError, json.JSONDecodeError) as e:
                logger.debug(f"Could not read unofficial world mapping file: {e}")

        # Fall back to scanning worlds directory
        # Get path to worlds directory relative to this file (exporter/exporter.py)
        worlds_dir = os.path.join(os.path.dirname(__file__), '..', 'worlds')

        if not os.path.exists(worlds_dir):
            logger.warning(f"Worlds directory not found: {worlds_dir}")
            return game_name.lower().replace(' ', '_').replace(':', '_')
        
        # Scan each world directory
        for world_dir_name in os.listdir(worlds_dir):
            world_path = os.path.join(worlds_dir, world_dir_name)
            
            # Skip non-directories and hidden/private directories
            if not os.path.isdir(world_path) or world_dir_name.startswith('.') or world_dir_name.startswith('_'):
                continue
                
            init_file = os.path.join(world_path, '__init__.py')
            if not os.path.exists(init_file):
                continue
                
            # Extract game name from __init__.py
            try:
                with open(init_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                # Look for pattern: game: ClassVar[str] = "Game Name"
                import re
                pattern = r'game:\s*ClassVar\[str\]\s*=\s*"([^"]*)"'
                match = re.search(pattern, content)

                if match:
                    found_game_name = match.group(1)
                    if found_game_name == game_name:
                        return world_dir_name

                # Fallback pattern for single quotes
                pattern = r'game:\s*ClassVar\[str\]\s*=\s*\'([^\']*)\''
                match = re.search(pattern, content)

                if match:
                    found_game_name = match.group(1)
                    if found_game_name == game_name:
                        return world_dir_name

                # Pattern for type-annotated declarations: game: str = "Game Name"
                # This matches ClassVar[str], str, or any other type annotation
                pattern = r'game:\s*[A-Za-z_]\w*(?:\[[^\]]*\])?\s*=\s*"([^"]*)"'
                match = re.search(pattern, content)

                if match:
                    found_game_name = match.group(1)
                    if found_game_name == game_name:
                        return world_dir_name

                # Fallback pattern for single quotes with type annotations
                pattern = r'game:\s*[A-Za-z_]\w*(?:\[[^\]]*\])?\s*=\s*\'([^\']*)\''
                match = re.search(pattern, content)

                if match:
                    found_game_name = match.group(1)
                    if found_game_name == game_name:
                        return world_dir_name

                # Fallback: look for simpler pattern: game = "Game Name"
                pattern = r'game\s*=\s*"([^"]*)"'
                match = re.search(pattern, content)

                if match:
                    found_game_name = match.group(1)
                    if found_game_name == game_name:
                        return world_dir_name

                # Fallback pattern for single quotes
                pattern = r'game\s*=\s*\'([^\']*)\''
                match = re.search(pattern, content)

                if match:
                    found_game_name = match.group(1)
                    if found_game_name == game_name:
                        return world_dir_name

                # NEW: Handle case where game = CONSTANT_NAME (e.g., game = LINKS_AWAKENING or game = jak1_name)
                # First, look for game = <identifier> (not a string)
                # Match both uppercase constants and lowercase identifiers
                pattern = r'game\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:#|$)'
                match = re.search(pattern, content, re.MULTILINE)

                if match:
                    constant_name = match.group(1)

                    # Try to find the constant definition in the same file
                    const_pattern = rf'{constant_name}\s*=\s*"([^"]*)"'
                    const_match = re.search(const_pattern, content)

                    if const_match:
                        found_game_name = const_match.group(1)
                        if found_game_name == game_name:
                            return world_dir_name

                    # Try to find the constant in imported modules within the same world directory
                    # Look for: from .ModuleName import CONSTANT_NAME, from .ModuleName import *, or from . import ModuleName
                    # Pattern 1: Specific import - from .ModuleName import CONSTANT_NAME
                    import_pattern = rf'from\s+\.(\w+)\s+import.*\b{constant_name}\b'
                    import_match = re.search(import_pattern, content)

                    if import_match:
                        module_name = import_match.group(1)
                        module_file = os.path.join(world_path, f'{module_name}.py')

                        if os.path.exists(module_file):
                            try:
                                with open(module_file, 'r', encoding='utf-8') as mf:
                                    module_content = mf.read()
                                    const_pattern = rf'{constant_name}\s*=\s*"([^"]*)"'
                                    const_match = re.search(const_pattern, module_content)

                                    if const_match:
                                        found_game_name = const_match.group(1)
                                        if found_game_name == game_name:
                                            return world_dir_name
                            except (IOError, UnicodeDecodeError):
                                pass

                    # Pattern 2: Wildcard import - from .ModuleName import *
                    # Find all wildcard imports and check each module
                    wildcard_pattern = r'from\s+\.(\w+)\s+import\s+\*'
                    wildcard_matches = re.finditer(wildcard_pattern, content)

                    for wc_match in wildcard_matches:
                        module_name = wc_match.group(1)
                        module_file = os.path.join(world_path, f'{module_name}.py')

                        if os.path.exists(module_file):
                            try:
                                with open(module_file, 'r', encoding='utf-8') as mf:
                                    module_content = mf.read()
                                    const_pattern = rf'{constant_name}\s*=\s*"([^"]*)"'
                                    const_match = re.search(const_pattern, module_content)

                                    if const_match:
                                        found_game_name = const_match.group(1)
                                        if found_game_name == game_name:
                                            return world_dir_name
                            except (IOError, UnicodeDecodeError):
                                pass

            except (IOError, UnicodeDecodeError):
                continue
        
        # If no matching world found, fall back to old logic
        fallback_dir = game_name.lower().replace(' ', '_').replace(':', '_')
        logger.warning(f"Could not find world directory for game '{game_name}' in mappings or worlds directory, using fallback: '{fallback_dir}'")
        return fallback_dir

    except Exception as e:
        logger.error(f"Error finding world directory for game '{game_name}': {e}")
        return game_name.lower().replace(' ', '_').replace(':', '_')

# --- Configuration for Excluded Fields ---
# Add keys here to exclude them from the final JSON output (e.g., to reduce size)
# This applies recursively to nested structures.
EXCLUDED_FIELDS = {
    'item_rule',
    'entrances',  # Exclude entrance arrays from regions (redundant with exits)
}

# Context-specific exclusions
CONTEXT_EXCLUDED_FIELDS = {
    # Add more context-specific exclusions here as needed
}

def is_serializable(obj):
    """Check if an object can be serialized to JSON."""
    try:
        json.dumps(obj)
        return True
    except (TypeError, OverflowError, ValueError):
        return False

def make_serializable(obj):
    """
    Recursively convert an object to be JSON serializable.
    Extracts values from enums and custom objects intelligently.
    """
    # Handle basic types directly
    if obj is None or isinstance(obj, (bool, int, float, str)):
        return obj

    # Handle callable objects (functions, lambdas, methods) before other checks
    # These should not be serialized with memory addresses as that causes inconsistency
    if callable(obj):
        # Get a consistent representation that doesn't include memory addresses
        obj_str = str(obj)
        # Remove memory address portion (e.g., "at 0x7ea5d7e49ee0")
        if ' at 0x' in obj_str:
            # Split on ' at 0x' and take everything before it, then add the closing '>'
            base_repr = obj_str.rsplit(' at 0x', 1)[0]
            return base_repr + '>'
        return obj_str

    # Handle dictionaries
    if isinstance(obj, dict):
        serialized_dict = {str(k): make_serializable(v) for k, v in obj.items()}

        return serialized_dict

    # Handle lists, tuples, sets, and frozensets
    if isinstance(obj, (list, tuple, set, frozenset)):
        result = [make_serializable(i) for i in obj]
        # Sort sets and frozensets for consistent ordering
        if isinstance(obj, (set, frozenset)):
            return sorted(result)
        return result

    # Handle objects with __dict__ attribute (custom classes)
    if hasattr(obj, '__dict__'):
        # First check for value attribute (common in enums)
        if hasattr(obj, 'value'):
            return make_serializable(obj.value)

        # Try to extract value from string representation like "Type(Value)"
        str_rep = str(obj)
        if '(' in str_rep and ')' in str_rep:
            try:
                # Extract value inside parentheses
                extracted = str_rep.split('(', 1)[1].split(')', 1)[0]

                # Try to convert to appropriate type
                if extracted.lower() in ('yes', 'no', 'true', 'false'):
                    return extracted.lower() == 'yes' or extracted.lower() == 'true'
                elif extracted.isdigit():
                    return int(extracted)
                else:
                    return extracted
            except Exception as e:
                # If extraction fails, log and use string representation
                return str_rep

        # If no special handling applies, use string representation
        return str_rep

    # If all else fails, convert to string
    if not is_serializable(obj):
        return str(obj)

    return obj


def sort_rule_for_consistency(rule):
    """
    Recursively sort rule structures for consistent JSON output.

    This function sorts:
    - 'and'/'or' conditions lists by item names
    - Dictionary values in 'has_all_counts' and 'has_all' args (for consistent key ordering)
    - Normalizes lambda function strings to remove memory addresses

    Args:
        rule: The rule structure to sort

    Returns:
        The sorted rule structure
    """
    if rule is None or isinstance(rule, (bool, int, float)):
        return rule

    # Normalize lambda function strings by removing memory addresses
    if isinstance(rule, str):
        import re
        # Pattern: <function name at 0xABCD1234> -> <function name>
        return re.sub(r'(<function .+?) at 0x[0-9a-f]+>', r'\1>', rule)

    if isinstance(rule, dict):
        # Recursively process all values
        sorted_rule = {k: sort_rule_for_consistency(v) for k, v in rule.items()}

        # Special handling for 'and'/'or' conditions
        if sorted_rule.get('type') in ['and', 'or'] and 'conditions' in sorted_rule:
            conditions = sorted_rule['conditions']
            if isinstance(conditions, list) and conditions:
                # Sort conditions by a stable key
                # Use a tuple of (item value if present, method name, type, full dict as string) for stability
                def condition_sort_key(cond):
                    if not isinstance(cond, dict):
                        return ('', '', str(cond), str(cond))

                    # For item_check conditions, sort by the item value
                    if cond.get('type') == 'item_check':
                        item = cond.get('item')
                        if isinstance(item, dict):
                            # Handle nested item structures (e.g., {"type": "constant", "value": "..."})
                            item_value = item.get('value', str(item))
                        else:
                            item_value = item
                        return (str(item_value) if item_value is not None else '', '', 'item_check', str(cond))

                    # For state_method conditions, sort by method name
                    if cond.get('type') == 'state_method':
                        method = cond.get('method', '')
                        return ('', method, 'state_method', str(cond))

                    # For other condition types, sort by type then full representation
                    return ('', '', cond.get('type', ''), str(cond))

                sorted_rule['conditions'] = sorted(conditions, key=condition_sort_key)

        # Special handling for state_method calls with dict/list args that need sorting
        if sorted_rule.get('type') == 'state_method':
            method = sorted_rule.get('method')
            args = sorted_rule.get('args', [])

            # For has_all_counts, sort the dictionary keys in the argument
            if method in ['has_all_counts', 'has_all'] and args:
                sorted_args = []
                for arg in args:
                    if isinstance(arg, dict) and arg.get('type') == 'constant':
                        value = arg.get('value')
                        # If the value is a dict, sort its keys
                        if isinstance(value, dict):
                            sorted_value = {k: value[k] for k in sorted(value.keys())}
                            sorted_args.append({'type': 'constant', 'value': sorted_value})
                        # If the value is a list, sort it (for has_all)
                        elif isinstance(value, list):
                            sorted_value = sorted(value)
                            sorted_args.append({'type': 'constant', 'value': sorted_value})
                        else:
                            sorted_args.append(arg)
                    else:
                        sorted_args.append(sort_rule_for_consistency(arg))
                sorted_rule['args'] = sorted_args

        return sorted_rule

    if isinstance(rule, list):
        # Recursively process list items (this will also normalize lambda strings in lists)
        return [sort_rule_for_consistency(item) for item in rule]

    return rule


def write_field_by_field(export_data, filepath):
    """
    Tries to write each major section of the export_data to the file separately,
    to ensure at least some data is saved even if one section is problematic.
    """
    serializable_data = {"version": export_data.get("version", 1)}
    fields_written = []
    
    # Try each field separately
    for field in ["regions", "helpers", "items", "item_groups", "progression_mapping", "world", "exporter", "start_regions", "game_info", "itempool_counts"]:
        if field in export_data:
            try:
                serializable_field = make_serializable(export_data[field])
                # Test if it's serializable
                json.dumps(serializable_field)
                serializable_data[field] = serializable_field
                fields_written.append(field)
            except Exception as e:
                error_msg = f"Failed to process field {field}: {str(e)}"
                logger.error(error_msg)
                
                # For complex fields, try to process each player separately
                if field in ["world", "exporter", "game_info"] and isinstance(export_data.get(field, {}), dict):
                    # Initialize with empty dict
                    serializable_data[field] = {}
                    
                    # Try each player separately
                    for player_id in export_data.get(field, {}):
                        try:
                            player_data = make_serializable(export_data[field][player_id])
                            json.dumps(player_data)  # Test serialization
                            serializable_data[field][player_id] = player_data
                        except Exception as player_error:
                            error_msg = f"Failed to process {field} for player {player_id}: {str(player_error)}"
                            logger.error(error_msg)
                            # Use error message instead of default
                            serializable_data[field][player_id] = f"ERROR: {error_msg}"
    
    # Write what we have
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(serializable_data, f, indent=2)
        return True
    except Exception as e:
        error_msg = f"Failed to write even partial data: {str(e)}"
        logger.error(error_msg)
        return False

def prepare_export_data(multiworld) -> Dict[str, Any]:
    """
    Prepares complete game data for export to JSON format.
    Preserves as much of the Python backend's structure as possible.
    """
    with profiler.section("prepare_export_data"):
        return _prepare_export_data_impl(multiworld)


def _prepare_export_data_impl(multiworld) -> Dict[str, Any]:
    """Implementation of prepare_export_data (separated for profiling)."""
    export_data = {
        "schema_version": 3,  # Schema version for the export format
        "archipelago_version": Utils.__version__,
        "generation_seed": multiworld.seed,  # Short seed number (e.g., 1)
        "seed_name": multiworld.seed_name,   # Long seed string (e.g., "14089154938208861744")
        "player_names": getattr(multiworld, 'player_name', {}), # Player ID -> Name mapping (default to {} if missing)
        'regions': {},  # Full region graph
        'helpers': {},  # Helper function definitions by player
        'items': {},    # Item data by player
        'item_groups': {},  # Item groups by player
        'progression_mapping': {},  # Progressive item info
        'world': {},    # World data by player (mirrors Archipelago's world structure: game, options, runtime attributes)
        'exporter': {}, # Exporter-specific settings by player (controls frontend processing behavior)
        'start_regions': {},  # Start regions by player
        'itempool_counts': {},  # Complete itempool counts by player
        'game_info': {},  # Game-specific information for frontend
        'starting_items': {}, # Starting items by player
        'canonical_placements': {},  # Canonical item placements by player (vanilla/original locations)
    }
    
    # Dungeons will only be added if there's data to include
    all_dungeons = {}

    # Pre-compute location ID mappings for all players (optimization)
    location_id_mappings = {}
    for player in multiworld.player_ids:
        world = multiworld.worlds[player]
        if hasattr(world, 'location_id_to_name'):
            location_id_mappings[player] = {
                name: id for id, name in world.location_id_to_name.items()
            }

    for player in multiworld.player_ids:
        player_str = str(player) # Use player_str consistently

        # Reset the analyze_rule counter for each player to prevent accumulation
        # across players in a multiworld which can cause false infinite loop detection
        reset_analyze_rule_counter()

        # Get game name, world, and handler
        game_name = multiworld.game[player]
        world = multiworld.worlds[player]
        game_handler = get_game_export_handler(game_name, world)

        # Call game-specific preprocessing
        # This allows games to set up data and caches before region processing
        with profiler.section("preprocess_world_data"):
            game_handler.preprocess_world_data(world, export_data, player)

        # Process all regions and their connections
        # Also extract dungeons to separate structure
        with profiler.section("process_regions"):
            regions_data, dungeons_data = process_regions(multiworld, player, game_handler, location_id_mappings.get(player, {}))

        export_data['regions'][player_str] = regions_data

        # Only add dungeons if there's data
        if dungeons_data:
            if 'dungeons' not in export_data:
                export_data['dungeons'] = {}
            export_data['dungeons'][player_str] = dungeons_data
            all_dungeons[player_str] = dungeons_data
        
        # Pre-calculate itempool counts to use them when processing item data
        itempool_counts: Dict[str, Any] = {}
        try:
            itempool_counts = game_handler.get_itempool_counts(world, multiworld, player)
        except Exception as e:
            error_msg = f"Error calculating itempool counts for player {player}: {str(e)}"
            logger.error(error_msg)
            itempool_counts = {
                'error': error_msg,
                'details': "Failed to read itempool counts. Check logs for more information."
            }

        # Process items and groups, passing the itempool counts
        with profiler.section("process_items"):
            export_data['items'][player_str] = process_items(multiworld, player, itempool_counts)
        with profiler.section("process_item_groups"):
            export_data['item_groups'][player_str] = process_item_groups(multiworld, player)
        with profiler.section("process_progression_mapping"):
            export_data['progression_mapping'][player_str] = process_progression_mapping(multiworld, player)

        # Get game-specific information if available using handler
        try:
            game_info = game_handler.get_game_info(world) # Use handler directly
            export_data['game_info'][player_str] = game_info
        except Exception as e:
            error_msg = f"Error getting game_info from handler for player {player}: {str(e)}"
            logger.error(error_msg)
            # Fallback to empty dict (game name is in world[player].game)
            export_data['game_info'][player_str] = {}

        # Filter accumulator targets from itempool_counts
        # These are precollected for generation purposes but shouldn't be in
        # the exported itempool_counts - the frontend uses accumulator_rules instead
        game_info = export_data['game_info'].get(player_str, {})
        accumulator_targets = set()
        for rule in game_info.get('accumulator_rules', []):
            if rule.get('target'):
                accumulator_targets.add(rule['target'])
        if accumulator_targets:
            itempool_counts = {
                item: count for item, count in itempool_counts.items()
                if item not in accumulator_targets
            }
            logger.info(f"Filtered out accumulator target items from itempool_counts for player {player}: {accumulator_targets}")

        # Store the pre-calculated itempool counts
        export_data['itempool_counts'][player_str] = itempool_counts

        # Get world data using handler (includes options and runtime-computed attributes)
        with profiler.section("get_world_data"):
            try:
                world_data = game_handler.get_world_data(world, multiworld, player)
                # Add world_directory for handler lookup during cleanup (in case handler didn't add it)
                if 'world_directory' not in world_data:
                    try:
                        module_path = type(world).__module__
                        parts = module_path.split('.')
                        if len(parts) >= 2 and parts[0] == 'worlds':
                            world_data['world_directory'] = parts[1]
                    except Exception:
                        pass
                export_data['world'][player_str] = world_data
            except Exception as e:
                error_msg = f"Error exporting world data for player {player}: {str(e)}"
                logger.error(error_msg)
                export_data['world'][player_str] = {
                    'error': error_msg,
                    'details': "Failed to read world data. Check logs for more information."
                }

        # Get exporter-specific settings
        try:
            exporter_settings = game_handler.get_exporter_settings()
            if exporter_settings:
                export_data['exporter'][player_str] = exporter_settings
        except Exception as e:
            error_msg = f"Error exporting exporter settings for player {player}: {str(e)}"
            logger.error(error_msg)
            # Don't add error to export_data - exporter settings can fall back to defaults

        # Get helper definitions using handler
        # Reset counter before helper analysis to prevent false "infinite loop" detection
        # from accumulated counts during location/entrance rule analysis
        reset_analyze_rule_counter()
        with profiler.section("get_helper_definitions"):
            try:
                helper_definitions = game_handler.get_helper_definitions(world)
                if helper_definitions:
                    # Allow game handlers to post-process helper definitions
                    if hasattr(game_handler, 'postprocess_helper'):
                        for helper_name in list(helper_definitions.keys()):
                            helper_definitions[helper_name] = game_handler.postprocess_helper(
                                helper_name, helper_definitions[helper_name]
                            )
                    export_data['helpers'][player_str] = helper_definitions
                    logger.debug(f"Exported {len(helper_definitions)} helper definitions for player {player}")
            except Exception as e:
                error_msg = f"Error exporting helper definitions for player {player}: {str(e)}"
                logger.error(error_msg)
                # Don't add error to export_data - just skip helpers silently

        # Normalize option constants in helpers and regions to match the export format
        # This ensures comparisons work correctly in JavaScript
        try:
            world_data = export_data.get('world', {}).get(player_str, {})
            option_definitions = world_data.get('option_definitions', {})
            if option_definitions:
                if game_handler.EXPORT_CHOICE_OPTIONS_AS_NUMERIC:
                    # Convert string constants to numeric (for ordered comparisons)
                    if player_str in export_data.get('helpers', {}):
                        export_data['helpers'][player_str] = game_handler.normalize_helper_option_constants(
                            export_data['helpers'][player_str], option_definitions
                        )
                    if player_str in export_data.get('regions', {}):
                        export_data['regions'][player_str] = game_handler.normalize_region_option_constants(
                            export_data['regions'][player_str], option_definitions
                        )
                else:
                    # Convert numeric constants to strings (for equality comparisons)
                    if player_str in export_data.get('helpers', {}):
                        export_data['helpers'][player_str] = game_handler.normalize_to_string_constants(
                            export_data['helpers'][player_str], option_definitions, 'helpers'
                        )
                    if player_str in export_data.get('regions', {}):
                        export_data['regions'][player_str] = game_handler.normalize_to_string_constants(
                            export_data['regions'][player_str], option_definitions, 'regions'
                        )
        except Exception as e:
            logger.error(f"Error normalizing option constants for player {player}: {str(e)}")

        # Start regions
        try:
            # First, check if the world has an origin_region_name attribute
            default_start_region = 'Menu'  # Default fallback
            if hasattr(world, 'origin_region_name') and world.origin_region_name:
                default_start_region = world.origin_region_name
                logger.debug(f"Using world.origin_region_name '{default_start_region}' as starting region for player {player}")
            else:
                # Try to get Menu region first (common default)
                try:
                    menu_region = multiworld.get_region('Menu', player)
                except Exception as e:
                    # Menu region doesn't exist, need to find actual starting region
                    logger.debug(f"Menu region not found for player {player}, looking for actual starting region")
                    menu_region = None

                    # Find the actual starting region
                    player_regions = [
                        region for region in multiworld.get_regions()
                        if region.player == player
                    ]

                    # For single-region games, use that region as the starting region
                    if len(player_regions) == 1:
                        default_start_region = player_regions[0].name
                        logger.debug(f"Using single region '{default_start_region}' as starting region for player {player}")
                    else:
                        # Look for regions with no entrances (typically starting regions)
                        for region in player_regions:
                            if not region.entrances:
                                default_start_region = region.name
                                logger.debug(f"Found region '{default_start_region}' with no entrances as starting region for player {player}")
                                break

            available_regions = []
            player_regions = [
                region for region in multiworld.get_regions() 
                if region.player == player
            ]

            for region in player_regions:
                try:
                    if hasattr(region, 'can_start_at') and callable(getattr(region, 'can_start_at')):
                        try:
                            # Ensure world is passed to can_start_at if needed by the method
                            can_start = region.can_start_at(world) 
                            if (can_start):
                                region_data = {
                                    'name': region.name,
                                    'type': getattr(region, 'type', 'Region'), # Assuming extract_type_value is not needed here or applied later
                                    'dungeon': getattr(region.dungeon, 'name', None) if hasattr(region, 'dungeon') and region.dungeon else None,
                                }
                                
                                # Add game-specific region attributes from the handler
                                region_attributes = game_handler.get_region_attributes(region)
                                region_data.update(region_attributes)
                                
                                available_regions.append(region_data)
                        except Exception as e:
                            logger.error(f"Error checking can_start_at for region {region.name}: {str(e)}")
                    else:
                        pass  # Region doesn't have a callable can_start_at method
                except Exception as e:
                    logger.error(f"Error processing region {getattr(region, 'name', 'Unknown')} in start regions loop: {str(e)}")
                    continue

            export_data['start_regions'][player_str] = {
                'default': [default_start_region],
                'available': available_regions
            }

        except Exception as e:
            logger.error(f"Error in top-level start regions processing for player {player}: {str(e)}")
            logger.exception("Full traceback:")
            # Provide a fallback in case of error
            export_data['start_regions'][player_str] = {
                'default': ['Menu'],
                'available': []
            }

        # Process starting items
        try:
            starting_items_list = multiworld.precollected_items.get(player, []) # Use precollected_items
            # Extract item names directly, assuming make_serializable handles strings
            serializable_starting_items = [
                item.name for item in starting_items_list if hasattr(item, 'name')
            ]

            # Filter out counter items that are targets of accumulator_rules
            # These are precollected for generation purposes but shouldn't be in
            # the exported starting_items - the frontend uses accumulator_rules instead
            game_info = export_data.get('game_info', {}).get(player_str, {})
            accumulator_targets = set()
            for rule in game_info.get('accumulator_rules', []):
                if rule.get('target'):
                    accumulator_targets.add(rule['target'])

            if accumulator_targets:
                serializable_starting_items = [
                    item for item in serializable_starting_items
                    if item not in accumulator_targets
                ]
                logger.info(f"Filtered out accumulator target items from starting_items for player {player}: {accumulator_targets}")

            export_data['starting_items'][player_str] = serializable_starting_items
        except Exception as e:
            logger.error(f"Error processing starting items for player {player}: {str(e)}")
            export_data['starting_items'][player_str] = {'error': f"Failed to process starting items: {str(e)}"}

        # Process canonical_placements - vanilla/original item locations
        # This is read from a class attribute on the world, if it exists
        try:
            canonical_placements = {}
            # Check for canonical_placements class attribute
            if hasattr(world.__class__, 'canonical_placements'):
                canonical_placements = dict(world.__class__.canonical_placements)
                logger.debug(f"Found {len(canonical_placements)} canonical placements for player {player}")
            # Also check instance attribute (in case it's set dynamically)
            elif hasattr(world, 'canonical_placements'):
                canonical_placements = dict(world.canonical_placements)
                logger.debug(f"Found {len(canonical_placements)} canonical placements (instance) for player {player}")

            export_data['canonical_placements'][player_str] = canonical_placements
        except Exception as e:
            logger.error(f"Error processing canonical_placements for player {player}: {str(e)}")
            export_data['canonical_placements'][player_str] = {}

    # Determine is_vanilla and is_canonical from world class attributes
    # Check all players' worlds for these flags
    is_vanilla = False
    is_canonical = False
    for player in multiworld.player_ids:
        world = multiworld.worlds[player]
        if getattr(world.__class__, 'is_vanilla', False) or getattr(world, 'is_vanilla', False):
            is_vanilla = True
        if getattr(world.__class__, 'is_canonical', False) or getattr(world, 'is_canonical', False):
            is_canonical = True
    if is_vanilla:
        export_data['is_vanilla'] = True
    if is_canonical:
        export_data['is_canonical'] = True

    # Pick up preset_label from any player's world
    for player in multiworld.player_ids:
        world = multiworld.worlds[player]
        preset_label = getattr(world, 'preset_label', None)
        if preset_label:
            export_data['preset_label'] = preset_label
            break

    # Add raw spoiler entrances data for debugging
    #if hasattr(multiworld, 'spoiler') and multiworld.spoiler and hasattr(multiworld.spoiler, 'entrances'):
    #    export_data['debug_spoiler_entrances'] = {}
    #    try:
    #        for key, value in multiworld.spoiler.entrances.items():
    #            # Convert key to string for JSON serialization
    #            key_str = str(key)
    #            export_data['debug_spoiler_entrances'][key_str] = make_serializable(value)
    #        logger.debug(f"Added {len(export_data['debug_spoiler_entrances'])} spoiler entrance entries for debugging")
    #    except Exception as e:
    #        logger.error(f"Error processing debug spoiler entrances: {str(e)}")
    #        export_data['debug_spoiler_entrances'] = {'error': f"Failed to process spoiler entrances: {str(e)}"}
    
    # Apply game-specific post-processing for each player
    # This is done after all standard processing to allow for cross-player analysis if needed
    for player in multiworld.player_ids:
        game_name = multiworld.game[player]
        world = multiworld.worlds[player]
        game_handler = get_game_export_handler(game_name, world)

        if game_handler and hasattr(game_handler, 'post_process_data'):
            try:
                export_data = game_handler.post_process_data(export_data)
            except Exception as e:
                logger.warning(f"Error in post_process_data for {game_name}: {e}")

    return export_data

def _make_rule_dict_serializable(obj: Any) -> Any:
    """
    Recursively convert Rule.Resolved objects in a dict to their serializable form.

    When to_dict() is called on a rule, nested rules (like in Compare.left)
    may still be Rule.Resolved objects that need to be converted.
    """
    if hasattr(obj, 'to_dict') and callable(obj.to_dict):
        # This is a Rule.Resolved object - convert it
        return _make_rule_dict_serializable(obj.to_dict())
    elif isinstance(obj, dict):
        return {k: _make_rule_dict_serializable(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [_make_rule_dict_serializable(item) for item in obj]
    else:
        # Primitive value (str, int, bool, etc.) or other non-rule object
        # If it has __str__ and is a rule-like object, convert to string
        if hasattr(obj, '__str__') and hasattr(obj, 'player'):
            return str(obj)
        return obj


def process_regions(multiworld, player: int, game_handler=None, location_name_to_id: Optional[Dict[str, int]] = None) -> tuple:
    """
    Process complete region data including all available backend data.
    Returns (regions_data, dungeons_data) tuple with separate structures.

    Args:
        location_name_to_id: Pre-computed mapping from location names to IDs (optimization)
    """
    
    def safe_expand_rule(game_handler, rule_func,
                         rule_target_name: Optional[str] = None,
                         target_type: Optional[str] = None,
                         world=None):
        """
        Analyzes rule using runtime analysis (analyze_rule).

        Results are cached by (rule_func_id, game_handler_id, player, rule_target_name)
        to avoid repeated analysis of the same rule. Including rule_target_name prevents
        cache collisions when the same function is used for multiple targets (e.g., Paint
        locations share a class method that returns different thresholds per location).
        """
        try:
            if rule_func is None:
                return None

            # Create cache key from function identity and context
            # Including rule_target_name allows games with shared rule functions
            # (like Paint's PaintLocation.access_rule method) to have unique cache entries
            cache_key = (
                id(rule_func),
                id(game_handler),
                player,
                rule_target_name
            )

            # Check cache first (before override to avoid recursive loops)
            if cache_key in _rule_analysis_cache:
                return _rule_analysis_cache[cache_key]

            # Check if this is a Rule Builder Resolved rule with native serialization
            # Rule Builder rules have a to_dict() method that provides native JSON serialization
            # The frontend now supports Rule Builder format natively via evaluateRuleBuilderRule
            if hasattr(rule_func, 'to_dict') and callable(rule_func.to_dict):
                try:
                    rb_dict = rule_func.to_dict()
                    # Recursively convert nested Resolved objects to their dict form
                    rb_dict = _make_rule_dict_serializable(rb_dict)
                    # Allow game handlers to transform Rule Builder format rules
                    # This enables handlers to resolve unresolved references (e.g., variable names)
                    if game_handler and hasattr(game_handler, 'expand_rule'):
                        rb_dict = game_handler.expand_rule(rb_dict)
                    # Cache and return Rule Builder format directly
                    _rule_analysis_cache[cache_key] = rb_dict
                    logger.debug(f"Exported Rule Builder format for {target_type} '{rule_target_name}': {rb_dict.get('rule', 'unknown')}")
                    return rb_dict
                except Exception as e:
                    logger.warning(f"Rule Builder to_dict() failed for {target_type} '{rule_target_name}': {e}")
                    # Fall through to AST analysis as fallback

            # Check if game handler has an override for rule analysis (e.g., Blasphemous, Terraria)
            if game_handler and hasattr(game_handler, 'override_rule_analysis'):
                override_result = game_handler.override_rule_analysis(rule_func, rule_target_name)
                if override_result:
                    # Check for Terraria's sentinel value for "always accessible"
                    if isinstance(override_result, dict) and override_result.get('__terraria_handled__'):
                        actual_result = override_result.get('__value__')
                        _rule_analysis_cache[cache_key] = actual_result
                        return actual_result
                    # Cache the override result before returning
                    _rule_analysis_cache[cache_key] = override_result
                    return override_result

            # Unwrap functools.partial objects to get the underlying function
            # Many apworlds (e.g., Metroid Zero Mission) use partial to bind parameters
            partial_bound_vars = {}
            if isinstance(rule_func, partial):
                inner_func = rule_func.func
                bound_args = rule_func.args
                bound_keywords = rule_func.keywords or {}

                # Map positional bound args to parameter names
                if hasattr(inner_func, '__code__'):
                    param_names = inner_func.__code__.co_varnames[:inner_func.__code__.co_argcount]
                    for i, value in enumerate(bound_args):
                        if i < len(param_names):
                            partial_bound_vars[param_names[i]] = value
                            logger.debug(f"Partial unwrap: bound {param_names[i]} = {value}")

                # Add keyword bound args
                partial_bound_vars.update(bound_keywords)

                # Use the inner function for analysis
                rule_func = inner_func
                logger.debug(f"Unwrapped functools.partial: inner_func={inner_func}, bound_vars={list(partial_bound_vars.keys())}")

            # Extract closure variables from the rule function
            closure_vars = {}

            # Add partial-bound variables first (may be overridden by closure vars)
            closure_vars.update(partial_bound_vars)

            # Add globals from the function (for module-level imports like ChapterIndex)
            if hasattr(rule_func, '__globals__'):
                # Only include specific useful globals, not all of them
                useful_globals = ['ChapterIndex', 'HatType', 'Difficulty', 'HitType']
                for var_name in useful_globals:
                    if var_name in rule_func.__globals__:
                        closure_vars[var_name] = rule_func.__globals__[var_name]

            # Add closure variables
            if hasattr(rule_func, '__closure__') and rule_func.__closure__:
                # Get variable names from the function's code
                if hasattr(rule_func, '__code__'):
                    freevars = rule_func.__code__.co_freevars
                    for i, var_name in enumerate(freevars):
                        if i < len(rule_func.__closure__):
                            cell = rule_func.__closure__[i]
                            try:
                                closure_vars[var_name] = cell.cell_contents
                            except ValueError:
                                # Cell is empty
                                pass

            # Add world object to closure_vars if provided (may override closure value)
            if world is not None:
                closure_vars['world'] = world

            # Allow game handler to prepare/modify closure_vars before analysis
            if hasattr(game_handler, 'prepare_closure_vars'):
                closure_vars = game_handler.prepare_closure_vars(rule_func, closure_vars)

            # Directly call analyze_rule, which handles recursion internally for combined rules
            context_info = f"{target_type} '{rule_target_name or 'unknown'}'"
            analysis_result = analyze_rule(
                rule_func=rule_func,
                closure_vars=closure_vars,
                game_handler=game_handler,
                player_context=player,
                context_info=context_info,
                rule_target_name=rule_target_name,
                target_type=target_type
            )

            if analysis_result and analysis_result.get('type') != 'error':

                # Set context for A Hat In Time telescope rule processing
                if hasattr(game_handler, 'apply_chapter_costs_to_rule') and rule_target_name and rule_target_name.startswith("Telescope -> "):
                    analysis_result = game_handler.apply_chapter_costs_to_rule(analysis_result, rule_target_name, world)

                expanded = game_handler.expand_rule(analysis_result)

                # Resolve any attribute nodes in item_check rules
                if expanded:
                    expanded = resolve_attribute_nodes_in_rule(expanded, world)

                # Size check on individual rule to catch runaway expansion
                if expanded:
                    try:
                        rule_size = len(json.dumps(expanded, default=str))
                        rule_size_kb = rule_size / 1024
                        if rule_size_kb > MAX_RULE_SIZE_KB:
                            logger.error(f"Rule for {target_type} '{rule_target_name}' is too large "
                                        f"({rule_size_kb:.1f} KB > {MAX_RULE_SIZE_KB} KB). "
                                        f"This likely indicates a rule analysis loop. Returning None.")
                            return None
                    except (TypeError, ValueError):
                        pass  # If serialization fails, continue anyway

                # Cache the result before returning
                if expanded:
                    _rule_analysis_cache[cache_key] = expanded

                return expanded
            else:
                logger.warning(f"Failed to analyze or expand rule for {target_type} '{rule_target_name or 'unknown'}' using runtime analysis.")
                return None # Return None on failure
                
        except Exception as e:
            logger.error(f"Error analyzing/expanding rule for {target_type} '{rule_target_name or 'unknown'}': {e}")
            logger.exception("Traceback:")
        return None

    def extract_type_value(type_obj):
        """Extract clean type value from region type objects."""
        # If it's already an integer or string, return it directly
        if isinstance(type_obj, int) or isinstance(type_obj, str) and type_obj.isdigit():
            return int(type_obj)
        
        # If it has a value attribute (like an enum might), use that
        if hasattr(type_obj, 'value'):
            return getattr(type_obj, 'value')
        
        # Try to extract value if it's in the format "Type(1)"
        str_rep = str(type_obj)
        if '(' in str_rep and ')' in str_rep:
            type_value = str_rep.split('(', 1)[1].split(')', 1)[0]
            if type_value.isdigit():
                return int(type_value)
        
        # Default: convert to string
        return str(type_obj)


    try:
        regions_data = {}
        dungeons_data = {}  # structure to hold all dungeons
        
        # Different games have different levels of rule analysis support
        # ALTTP has detailed helper expansion, while other games may preserve more helper nodes
        game_name = multiworld.game[player]
        if not game_handler:
            game_handler = get_game_export_handler(game_name, multiworld.worlds[player])
        
        # Allow game handler to postprocess regions before extraction
        if game_handler and hasattr(game_handler, 'postprocess_regions'):
            game_handler.postprocess_regions(multiworld, player)
        
        player_regions = [
            region for region in multiworld.get_regions()
            if region.player == player
        ]

        # Get world object (needed for various operations below)
        world = multiworld.worlds[player] if player in multiworld.worlds else None

        # Use provided location name to ID mapping, or create if not provided
        if location_name_to_id is None:
            location_name_to_id = {}
            if world and hasattr(world, 'location_id_to_name'):
                # Create a reverse mapping from name to ID
                location_name_to_id = {name: id for id, name in world.location_id_to_name.items()}

        # First pass - collect all dungeon data
        for region in player_regions:
            if hasattr(region, 'dungeon') and region.dungeon:
                dungeon_name = getattr(region.dungeon, 'name', None)
                if dungeon_name and dungeon_name not in dungeons_data:
                    dungeon_data = {
                        'name': dungeon_name,
                        'regions': [],
                        'medallion_check': None
                    }

                    if hasattr(region.dungeon, 'regions'):
                        dungeon_data['regions'] = [r.name for r in region.dungeon.regions]

                    # Handle multiple bosses (e.g., Ganon's Tower has bosses['bottom'], bosses['middle'], bosses['top'])
                    if hasattr(region.dungeon, 'bosses') and region.dungeon.bosses:
                        dungeon_data['bosses'] = {}
                        for boss_key, boss in region.dungeon.bosses.items():
                            if boss:
                                dungeon_data['bosses'][boss_key] = {
                                    'name': getattr(boss, 'name', None),
                                    'defeat_rule': safe_expand_rule(
                                        game_handler,
                                        getattr(boss, 'defeat_rule', None),
                                        getattr(boss, 'name', None),
                                        target_type='Boss',
                                        world=world
                                    )
                                }

                    if hasattr(region.dungeon, 'medallion_check'):
                        dungeon_data['medallion_check'] = safe_expand_rule(
                            game_handler,
                            region.dungeon.medallion_check,
                            f"{dungeon_name} Medallion Check",
                            target_type='DungeonMedallion',
                            world=world
                        )

                    dungeons_data[dungeon_name] = dungeon_data

        # Second pass - process all regions
        region_count = 0
        for region in player_regions:
            try:
                region_count += 1
                region_name = getattr(region, 'name', 'Unknown')
                region_hint = getattr(region, 'hint_text', region_name)

                # Build region_data with hint_text immediately after name if present
                region_data = {'name': region_name}
                if region_hint and region_hint != region_name:
                    region_data['hint_text'] = region_hint
                region_data['entrances'] = []
                region_data['exits'] = []
                region_data['locations'] = []

                # Add game-specific region attributes from the handler
                region_attributes = game_handler.get_region_attributes(region)
                region_data.update(region_attributes)

                

                # Store reference to dungeon instead of full dungeon data
                if hasattr(region, 'dungeon') and region.dungeon:
                    # Handle both Dungeon objects (have .name) and strings (from WorldGen)
                    if hasattr(region.dungeon, 'name'):
                        dungeon_name = region.dungeon.name
                    else:
                        dungeon_name = str(region.dungeon) if region.dungeon else None
                    if dungeon_name:
                        region_data['dungeon'] = dungeon_name

                # Process shop data
                if hasattr(region, 'shop') and region.shop:
                    shop_inventory = []
                    if hasattr(region.shop, 'inventory'):
                        for item in region.shop.inventory:
                            try:
                                inventory_item = {
                                    'item': getattr(item, 'name', None),
                                    'price': getattr(item, 'price', 0),
                                    'max': getattr(item, 'max', 0),
                                    'replacement': None,
                                    'replacement_price': None
                                }
                                if hasattr(item, 'replacement') and item.replacement:
                                    inventory_item['replacement'] = item.replacement.name
                                    inventory_item['replacement_price'] = getattr(item, 'replacement_price', 0)
                                shop_inventory.append(inventory_item)
                            except Exception as e:
                                logger.error(f"Error processing shop inventory item: {str(e)}")

                    region_data['shop'] = {
                        'type': getattr(region.shop, 'type', None),
                        'inventory': shop_inventory,
                        'locked': getattr(region.shop, 'locked', False),
                        'region_name': getattr(region.shop, 'region_name', None),
                        'location_name': getattr(region.shop, 'location_name', None)
                    }

                # Process entrances
                with profiler.section("process_entrances"):
                    if hasattr(region, 'entrances'):
                        for entrance in region.entrances:
                            try:
                                expanded_rule = None
                                entrance_name = getattr(entrance, 'name', None)
                                if hasattr(entrance, 'access_rule') and entrance.access_rule is not None:
                                    rule_to_analyze = entrance.access_rule

                                    # Try special handling first for complex entrance rules
                                    # (e.g., LADX which uses custom entrance classes with condition attributes)
                                    if game_handler and hasattr(game_handler, 'handle_complex_entrance_rule'):
                                        special_rule = game_handler.handle_complex_entrance_rule(entrance_name, rule_to_analyze)  # type: ignore[arg-type]
                                        if special_rule:
                                            expanded_rule = game_handler.expand_rule(special_rule)
                                            # Resolve any attribute nodes in item_check rules
                                            expanded_rule = resolve_attribute_nodes_in_rule(expanded_rule, world)

                                    # If no special handling, use normal analysis
                                    if expanded_rule is None:
                                        expanded_rule = safe_expand_rule(
                                            game_handler,
                                            rule_to_analyze,
                                            entrance_name,
                                            target_type='Entrance',
                                            world=world
                                        )

                                    # Post-process the entrance rule if the game handler supports it
                                    if expanded_rule and game_handler and hasattr(game_handler, 'postprocess_entrance_rule'):
                                        # Check if the handler supports the new signature with connected_region
                                        import inspect
                                        sig = inspect.signature(game_handler.postprocess_entrance_rule)
                                        params = list(sig.parameters.keys())

                                        if 'connected_region' in params:
                                            # Use new signature with connected_region
                                            connected_region_name = getattr(entrance.connected_region, 'name', None) if hasattr(entrance, 'connected_region') else None
                                            expanded_rule = game_handler.postprocess_entrance_rule(expanded_rule, entrance_name, connected_region_name)  # type: ignore[arg-type]
                                        else:
                                            # Use old signature
                                            expanded_rule = game_handler.postprocess_entrance_rule(expanded_rule, entrance_name)  # type: ignore[arg-type]
                                    # Also call general postprocess_rule if available
                                    # Skip postprocessing for Rule Builder format (has 'rule' key instead of 'type')
                                    elif (expanded_rule and game_handler and
                                          hasattr(game_handler, 'postprocess_rule') and
                                          isinstance(expanded_rule, dict) and
                                          'rule' not in expanded_rule):
                                        expanded_rule = game_handler.postprocess_rule(expanded_rule)

                                entrance_data = {
                                    'name': entrance_name,
                                    'parent_region': getattr(entrance.parent_region, 'name', None) if hasattr(entrance, 'parent_region') else None,
                                    'access_rule': expanded_rule,
                                    'connected_region': getattr(entrance.connected_region, 'name', None) if hasattr(entrance, 'connected_region') else None,
                                }
                                region_data['entrances'].append(entrance_data)
                            except Exception as e:
                                logger.error(f"Error processing entrance {getattr(entrance, 'name', 'Unknown')}: {str(e)}")

                # Process exits
                with profiler.section("process_exits"):
                    if hasattr(region, 'exits'):
                        # Set region context before processing exits (for handlers that need source region)
                        region_name = getattr(region, 'name', 'Unknown')
                        if hasattr(game_handler, 'set_context'):
                            game_handler.set_context(region_name)

                        for exit in region.exits:
                            try:
                                expanded_rule = None
                                exit_name = getattr(exit, 'name', None)

                                # Set exit context for game handlers that need it (e.g., SM for 'ret' variable resolution)
                                if game_handler and hasattr(game_handler, 'set_exit_context'):
                                    game_handler.set_exit_context(exit_name)

                                # Set full exit info for handlers that need connected_region (e.g., Lingo worldgen)
                                connected_region = getattr(exit.connected_region, 'name', None) if hasattr(exit, 'connected_region') else None
                                if game_handler and exit_name is not None and connected_region is not None:
                                    game_handler.set_exit_info(exit_name, connected_region)

                                if hasattr(exit, 'access_rule') and exit.access_rule is not None:
                                    # Check if the game handler can provide an unwrapped version of the lambda
                                    # (e.g., SM unwraps Cache.ldeco decorators to avoid 'ret' variables)
                                    rule_to_analyze = exit.access_rule
                                    if game_handler:
                                        if hasattr(game_handler, 'get_unwrapped_exit_lambda'):
                                            unwrapped = game_handler.get_unwrapped_exit_lambda(exit_name, exit.access_rule)
                                            if unwrapped:
                                                rule_to_analyze = unwrapped

                                    # Try special handling first for complex exit rules
                                    if game_handler and hasattr(game_handler, 'handle_complex_exit_rule'):
                                        special_rule = game_handler.handle_complex_exit_rule(exit_name, rule_to_analyze)  # type: ignore[arg-type]
                                        if special_rule:
                                            expanded_rule = game_handler.expand_rule(special_rule)
                                            # Resolve any attribute nodes in item_check rules
                                            expanded_rule = resolve_attribute_nodes_in_rule(expanded_rule, world)

                                    # If no special handling, use normal analysis
                                    if expanded_rule is None:
                                        expanded_rule = safe_expand_rule(
                                            game_handler,
                                            rule_to_analyze,
                                            exit_name,
                                            target_type='Exit',
                                            world=world
                                        )

                                        # Post-process the exit rule if the game handler supports it
                                        if expanded_rule and game_handler and hasattr(game_handler, 'postprocess_entrance_rule'):
                                            # Check if the handler supports the connected_region parameter
                                            import inspect
                                            sig = inspect.signature(game_handler.postprocess_entrance_rule)
                                            params = list(sig.parameters.keys())

                                            if 'connected_region' in params:
                                                # Pass connected_region for games that need it (e.g., Lingo)
                                                connected_region_name = getattr(exit.connected_region, 'name', None) if hasattr(exit, 'connected_region') else None
                                                expanded_rule = game_handler.postprocess_entrance_rule(expanded_rule, exit_name, connected_region_name)  # type: ignore[arg-type]
                                            else:
                                                # Use old signature for games that don't need connected_region
                                                expanded_rule = game_handler.postprocess_entrance_rule(expanded_rule, exit_name)  # type: ignore[arg-type]
                                        # Also call general postprocess_rule if available
                                        # Skip postprocessing for Rule Builder format (has 'rule' key instead of 'type')
                                        elif (expanded_rule and game_handler and
                                              hasattr(game_handler, 'postprocess_rule') and
                                              isinstance(expanded_rule, dict) and
                                              'rule' not in expanded_rule):
                                            expanded_rule = game_handler.postprocess_rule(expanded_rule)

                                exit_data = {
                                    'name': exit_name,
                                    'connected_region': getattr(exit.connected_region, 'name', None) if hasattr(exit, 'connected_region') else None,
                                    'access_rule': expanded_rule,
                                }
                                region_data['exits'].append(exit_data)
                            except Exception as e:
                                logger.error(f"Error processing exit {getattr(exit, 'name', 'Unknown')}: {str(e)}")
                            finally:
                                # Clear exit context after processing
                                if game_handler and hasattr(game_handler, 'set_exit_context'):
                                    game_handler.set_exit_context(None)

                # Process locations
                with profiler.section("process_locations"):
                    if hasattr(region, 'locations'):
                        location_count = len(region.locations)
                        logger.debug(f"Processing {location_count} locations in region '{region.name}'")
                        for location in region.locations:
                            try:
                                location_name = getattr(location, 'name', None)

                                # Process access and item rules
                                access_rule_result = None
                                item_rule_result = None

                                # First check if game handler has special handling for this location
                                logger.debug(f"Location '{location_name}' access_rule type: {type(getattr(location, 'access_rule', None))}")
                                if hasattr(location, 'access_rule') and location.access_rule is not None:
                                    # Set context for game handlers that need it (e.g., Bomb Rush Cyberfunk, Super Metroid)
                                    if hasattr(game_handler, 'set_context'):
                                        game_handler.set_context(location_name)
                                    if hasattr(game_handler, 'set_location_context'):
                                        game_handler.set_location_context(location_name)
                                    # Check if game handler can extract custom access rule (e.g., Zillion)
                                    if game_handler and hasattr(game_handler, 'get_custom_location_access_rule'):
                                        custom_rule = game_handler.get_custom_location_access_rule(location, world)
                                        if custom_rule:
                                            access_rule_result = game_handler.expand_rule(custom_rule)
                                        else:
                                            # Fall back to normal analysis
                                            access_rule_result = safe_expand_rule(
                                                game_handler,
                                                location.access_rule,
                                                location_name,
                                                target_type='Location',
                                                world=world
                                            )
                                    else:
                                        # Use normal analysis
                                        access_rule_result = safe_expand_rule(
                                            game_handler,
                                            location.access_rule,
                                            location_name,
                                            target_type='Location',
                                            world=world
                                        )

                                    # Post-process the rule if the game handler supports it
                                    # Skip postprocessing for Rule Builder format (has 'rule' key instead of 'type')
                                    # Rule Builder rules are already in the correct format for export
                                    if (access_rule_result and game_handler and
                                        hasattr(game_handler, 'postprocess_rule') and
                                        isinstance(access_rule_result, dict) and
                                        'rule' not in access_rule_result):
                                        access_rule_result = game_handler.postprocess_rule(access_rule_result)

                                if hasattr(location, 'item_rule') and location.item_rule is not None:
                                    item_rule_result = safe_expand_rule(
                                        game_handler,
                                        location.item_rule,
                                        f"{location_name} Item Rule",
                                        target_type='LocationItemRule',
                                        world=world
                                    )


                                # Get progress_type - only include if not DEFAULT
                                progress_type = getattr(location, 'progress_type', None)
                                progress_type_str = None
                                if progress_type is not None:
                                    # Convert enum to string name
                                    progress_type_str = progress_type.name if hasattr(progress_type, 'name') else str(progress_type)
                                    # Only include if not DEFAULT
                                    if progress_type_str == 'DEFAULT':
                                        progress_type_str = None

                                # Get show_in_spoiler - only include if False (default is True)
                                show_in_spoiler = getattr(location, 'show_in_spoiler', True)

                                # Get location address, handling cases where it might be a list
                                # (e.g., ALTTP prize locations have multiple ROM addresses)
                                raw_address = getattr(location, 'address', None)
                                location_id = raw_address if isinstance(raw_address, int) else None

                                # Determine if this is an event location
                                # Event locations have event=True or address=None
                                is_event = getattr(location, 'event', False) or location_id is None

                                location_data = {
                                    'name': location_name,
                                    'id': location_id,  # Use actual location address (None for events or non-int addresses)
                                    'access_rule': access_rule_result,
                                    'item_rule': item_rule_result,
                                    'item': None,
                                    'locked': getattr(location, 'locked', False)  # True if item was placed via place_locked_item
                                }

                                # Only include event flag if True (to reduce JSON size)
                                if is_event:
                                    location_data['event'] = True

                                # Only include progress_type if not DEFAULT
                                if progress_type_str:
                                    location_data['progress_type'] = progress_type_str

                                # Only include show_in_spoiler if False (to reduce JSON size)
                                if not show_in_spoiler:
                                    location_data['show_in_spoiler'] = False

                                # Add game-specific location attributes from the handler
                                location_attributes = game_handler.get_location_attributes(location, world)
                                location_data.update(location_attributes)

                                if hasattr(location, 'item') and location.item:
                                    item_name = getattr(location.item, 'name', None)
                                    original_type = extract_type_value(getattr(location.item, 'type', None))
                                    effective_type = game_handler.get_effective_item_type(item_name, original_type) if game_handler and item_name else original_type

                                    # Check for canonical_placement_advancements to preserve original advancement values
                                    # This ensures cross-validation works correctly for worldgen worlds
                                    advancement = getattr(location.item, 'advancement', False)
                                    canonical_advancements = getattr(world.__class__, 'canonical_placement_advancements', None)
                                    if canonical_advancements and location_name in canonical_advancements:
                                        advancement = canonical_advancements[location_name]

                                    location_data['item'] = {
                                        'name': item_name,
                                        'player': getattr(location.item, 'player', None),
                                        'advancement': advancement,
                                        'type': effective_type
                                    }

                                # Allow game handler to post-process location data before adding to region
                                if game_handler and hasattr(game_handler, 'post_process_location_data'):
                                    location_data = game_handler.post_process_location_data(
                                        location_data, location_name,
                                        region_name=region.name, world=world
                                    )

                                region_data['locations'].append(location_data)
                            except Exception as e:
                                logger.error(f"Error processing location {getattr(location, 'name', 'Unknown')}: {str(e)}")

                # Allow game handler to add extra locations that weren't created for this seed
                # This is useful for games like Sims 4 where locations depend on DLC options
                if game_handler and hasattr(game_handler, 'get_extra_locations_for_region'):
                    try:
                        existing_location_names = [loc['name'] for loc in region_data['locations']]
                        extra_locations = game_handler.get_extra_locations_for_region(region.name, existing_location_names)
                        if extra_locations:
                            logger.debug(f"Adding {len(extra_locations)} extra locations to region '{region.name}'")
                            region_data['locations'].extend(extra_locations)
                    except Exception as e:
                        logger.error(f"Error getting extra locations for region '{region.name}': {str(e)}")

                # Sort locations by name if requested by the game handler
                # Used for games where locations are added via set iteration (non-deterministic order)
                if game_handler and getattr(game_handler, 'SORT_REGION_LOCATIONS_BY_NAME', False):
                    region_data['locations'].sort(key=lambda loc: loc.get('name', ''))

                # Auto-mark regions with no locations and no exits as dynamically_added
                # These are structural regions that exist for navigation but have no content
                if (not region_data.get('dynamically_added') and
                    not region_data['locations'] and
                    not region_data['exits']):
                    region_data['dynamically_added'] = True

                regions_data[region.name] = region_data

                # Size check every 50 regions to catch runaway data growth
                # Using make_serializable for accurate measurement, so check less frequently for performance
                if region_count % 50 == 0:
                    try:
                        # Use make_serializable to get an accurate size measurement
                        # that matches what the final export will produce.
                        # This is important because default=str can produce much larger
                        # output for Python objects that will be converted to compact
                        # representations by make_serializable in the final export.
                        serializable_data = make_serializable(regions_data)
                        current_size = len(json.dumps(serializable_data))
                        current_size_mb = current_size / (1024 * 1024)
                        # Dynamic interim limit (higher than final due to Python object overhead)
                        num_players = getattr(multiworld, 'players', 1)
                        max_size_mb = MAX_INTERIM_EXPORT_SIZE_MB_BASE + (MAX_INTERIM_EXPORT_SIZE_MB_PER_EXTRA_GAME * max(0, num_players - 1))
                        if current_size_mb > max_size_mb:
                            error_msg = (f"Export data size ({current_size_mb:.1f} MB) exceeded limit "
                                        f"({max_size_mb} MB) after processing region '{region_name}'. "
                                        f"This may indicate a rule analysis loop or exceptionally large game data.")
                            logger.error(error_msg)
                            # Return partial data instead of raising - allow export to complete with what we have
                            logger.warning(f"Stopping region processing for this player due to size limit. "
                                          f"Processed {region_count} regions before limit.")
                            return regions_data, dungeons_data
                    except (TypeError, ValueError, RecursionError) as e:
                        # If serialization fails, just log and continue
                        logger.warning(f"Could not check export size: {e}")

            except Exception as e:
                logger.error(f"Error processing region {getattr(region, 'name', 'Unknown')}: {str(e)}")
                logger.exception("Full traceback:")
                continue

        # Create missing regions that are referenced by exits but not defined
        # This handles cases where terminal regions (with no locations or exits) get
        # filtered out by the world but are still referenced as exit targets
        exit_targets = set()
        for region_data in regions_data.values():
            for exit_data in region_data.get('exits', []):
                target = exit_data.get('connected_region')
                if target:
                    exit_targets.add(target)

        missing_regions = exit_targets - set(regions_data.keys())
        for missing_region in sorted(missing_regions):
            logger.debug(f"Creating placeholder for missing terminal region: {missing_region}")
            regions_data[missing_region] = {
                'name': missing_region,
                'entrances': [],
                'exits': [],
                'locations': [],
                'placeholder': True,  # Mark as placeholder - these regions don't exist at runtime
            }

        # Sort all rules for consistency
        regions_data = sort_rule_for_consistency(regions_data)
        dungeons_data = sort_rule_for_consistency(dungeons_data)

        return regions_data, dungeons_data

    except Exception as e:
        logger.error(f"Error in process_regions: {str(e)}")
        logger.exception("Full traceback:")
        raise

def process_items(multiworld, player: int, itempool_counts: Dict[str, int]) -> Dict[str, Any]:
    """Process item data including progression flags and capacity information.

    Args:
        multiworld: The multiworld object
        player: The player ID
        itempool_counts: Item counts for this player's pool (used for itempool_counts export)
    """
    items_data = {}
    world = multiworld.worlds[player]
    game_name = multiworld.game[player]
    game_handler = get_game_export_handler(game_name, world) # Get game handler
    
    # 1. Start with game-specific item data from the handler
    try:
        items_data = game_handler.get_item_data(world)
        if not items_data:
             logger.warning(f"Handler for {game_name} returned no item data. Item export might be incomplete.")
    except Exception as e:
        logger.error(f"Error getting game-specific item data for {game_name}: {e}")
        items_data = {} # Start empty if handler fails

    # 1b. Migrate old-style handler data (advancement/useful/trap) to new classification field
    for item_name, item_data in items_data.items():
        if 'classification' not in item_data:
            # Convert old boolean flags to classification string
            if item_data.get('advancement'):
                item_data['classification'] = 'progression'
            elif item_data.get('useful'):
                item_data['classification'] = 'useful'
            elif item_data.get('trap'):
                item_data['classification'] = 'trap'
            else:
                item_data['classification'] = 'filler'
        # Remove old boolean flags from items table
        item_data.pop('advancement', None)
        item_data.pop('useful', None)
        item_data.pop('trap', None)

    # 2. Layer in base item IDs and groups from world.item_id_to_name
    for item_id, item_name in getattr(world, 'item_id_to_name', {}).items():
        if item_name not in items_data:
            # If item is in ID map but not handler data, create a basic entry
            #logger.warning(f"Item '{item_name}' found in item_id_to_name but not in handler data for {game_name}. Creating basic entry.")
            items_data[item_name] = {
                'name': item_name,
                'id': item_id,
                'groups': [],
                'classification': 'filler',
                'type': None, 'max_count': 1
            }
        else:
            # Ensure the ID from the world map is added if missing
            # BUT don't overwrite if the item is marked as an event (game handler intentionally set id=None)
            if items_data[item_name].get('id') is None and not items_data[item_name].get('event'):
                items_data[item_name]['id'] = item_id
        
        # Add groups from world.item_name_groups if they aren't already present
        base_groups = [
            group_name for group_name, items in getattr(world, 'item_name_groups', {}).items() 
            if item_name in items
        ]
        if item_name in items_data:
            # Ensure groups key exists
            if 'groups' not in items_data[item_name] or not isinstance(items_data[item_name]['groups'], list):
                 items_data[item_name]['groups'] = []
                 
            existing_groups = set(items_data[item_name]['groups'])
            new_groups_added = False
            for group in base_groups:
                if group not in existing_groups:
                    items_data[item_name]['groups'].append(group)
                    existing_groups.add(group)
                    new_groups_added = True
            if new_groups_added:
                 items_data[item_name]['groups'].sort()

    # 3. Update classification from placed items (use values from placed items if not set by handler)
    for location in multiworld.get_locations(player):
        if location.item:
            item_name = location.item.name
            item_classification = getattr(location.item, 'classification', ItemClassification.filler)

            # Add event items that aren't in items_data yet (items with code=None)
            if item_name not in items_data:
                # Extract type value
                type_obj = getattr(location.item, 'type', None)
                if type_obj is not None:
                    if hasattr(type_obj, 'value'):
                        item_type = type_obj.value
                    else:
                        item_type = str(type_obj)
                else:
                    item_type = None

                # Get hint_text if different from name
                item_hint = getattr(location.item, 'hint_text', item_name)

                # This is likely an event item - create an entry for it
                # Build dict with hint_text immediately after name if present
                item_entry = {'name': item_name}
                if item_hint and item_hint != item_name:
                    item_entry['hint_text'] = item_hint
                item_entry['id'] = getattr(location.item, 'code', None)
                item_entry['groups'] = []
                item_entry['classification'] = classification_to_string(item_classification)
                if getattr(location.item, 'code', None) is None:
                    item_entry['event'] = True
                item_entry['type'] = item_type
                item_entry['max_count'] = 1
                items_data[item_name] = item_entry
            else:
                # Item already exists, update classification if new one has higher priority
                # This handles cases like Muse Dash where first song copy is progression
                # but duplicates are useful - we want the highest priority classification
                item_data = items_data[item_name]
                new_classification = classification_to_string(item_classification)
                current_classification = item_data.get('classification', 'filler')
                if classification_has_higher_priority(new_classification, current_classification):
                    item_data['classification'] = new_classification
                # Add hint_text if not already set and differs from name
                item_hint = getattr(location.item, 'hint_text', item_name)
                if item_hint and item_hint != item_name:
                    _insert_hint_text(item_data, item_hint)

    # 3b. Also check precollected items for classification
    if player in multiworld.precollected_items:
        for item in multiworld.precollected_items[player]:
            item_name = item.name
            item_classification = getattr(item, 'classification', ItemClassification.filler)

            # Add items that aren't in items_data yet
            if item_name not in items_data:
                # Extract type value
                type_obj = getattr(item, 'type', None)
                if type_obj is not None:
                    if hasattr(type_obj, 'value'):
                        item_type = type_obj.value
                    else:
                        item_type = str(type_obj)
                else:
                    item_type = None

                # Get hint_text if different from name
                item_hint = getattr(item, 'hint_text', item_name)

                # Create an entry for this item
                # Build dict with hint_text immediately after name if present
                item_entry = {'name': item_name}
                if item_hint and item_hint != item_name:
                    item_entry['hint_text'] = item_hint
                item_entry['id'] = getattr(item, 'code', None)
                item_entry['groups'] = []
                item_entry['classification'] = classification_to_string(item_classification)
                if getattr(item, 'code', None) is None:
                    item_entry['event'] = True
                item_entry['type'] = item_type
                item_entry['max_count'] = 1
                items_data[item_name] = item_entry
            else:
                # Item already exists, update classification if new one has higher priority
                item_data = items_data[item_name]
                new_classification = classification_to_string(item_classification)
                current_classification = item_data.get('classification', 'filler')
                if classification_has_higher_priority(new_classification, current_classification):
                    item_data['classification'] = new_classification
                # Add hint_text if not already set and differs from name
                item_hint = getattr(item, 'hint_text', item_name)
                if item_hint and item_hint != item_name:
                    _insert_hint_text(item_data, item_hint)

    # 3c. Also update classification from items placed FOR this player across ALL locations
    # This is critical for multiworld where Player A's items may be placed in Player B's locations
    # Step 3 only checks placements IN this player's locations, but items can be placed anywhere
    try:
        for location in multiworld.get_locations():
            if location.item and location.item.player == player:
                item_name = location.item.name
                item_classification = getattr(location.item, 'classification', ItemClassification.filler)

                if item_name in items_data:
                    # Update classification if new one has higher priority
                    item_data = items_data[item_name]
                    new_classification = classification_to_string(item_classification)
                    current_classification = item_data.get('classification', 'filler')
                    if classification_has_higher_priority(new_classification, current_classification):
                        item_data['classification'] = new_classification
    except Exception as e:
        logger.warning(f"Could not update item classifications from multiworld placements for player {player}: {e}")

    # 4. Get and apply game-specific max counts
    try:
        game_max_counts = game_handler.get_item_max_counts(world)
        for item_name, max_count in game_max_counts.items():
            if item_name in items_data:
                items_data[item_name]['max_count'] = max_count
            else:
                 logger.warning(f"Item '{item_name}' found in max counts for {game_name} but not in items_data.")
    except Exception as e:
        logger.error(f"Error getting game-specific max counts for {game_name}: {e}")

    # Correct max_count for stackable items using actual item placements
    # In multiworld, a player can receive more items than their pool contributes
    # because items are distributed across all players' locations.
    # Count items placed FOR this player across ALL locations in the multiworld.
    placement_counts = {}
    try:
        for location in multiworld.get_locations():
            if location.item and location.item.player == player:
                item_name = location.item.name
                placement_counts[item_name] = placement_counts.get(item_name, 0) + 1
    except Exception as e:
        logger.warning(f"Could not count item placements for player {player}: {e}")

    # Also count starting items (precollected_items) since they contribute to max_count
    # This is important for games like Paint where progressive items start with 1 copy
    try:
        for starting_item in multiworld.precollected_items.get(player, []):
            if hasattr(starting_item, 'name'):
                item_name = starting_item.name
                placement_counts[item_name] = placement_counts.get(item_name, 0) + 1
    except Exception as e:
        logger.warning(f"Could not count starting items for player {player}: {e}")

    # Count items by classification (for items with mixed classifications like Faxanadu's Red Potion)
    # This tracks how many of each classification exist for each item type
    classification_counts: Dict[str, Dict[str, int]] = {}
    try:
        # Count from placements
        for location in multiworld.get_locations():
            if location.item and location.item.player == player:
                item_name = location.item.name
                item_classification = classification_to_string(
                    getattr(location.item, 'classification', ItemClassification.filler)
                )
                if item_name not in classification_counts:
                    classification_counts[item_name] = {}
                classification_counts[item_name][item_classification] = \
                    classification_counts[item_name].get(item_classification, 0) + 1

        # Also count starting items
        for starting_item in multiworld.precollected_items.get(player, []):
            if hasattr(starting_item, 'name'):
                item_name = starting_item.name
                item_classification = classification_to_string(
                    getattr(starting_item, 'classification', ItemClassification.filler)
                )
                if item_name not in classification_counts:
                    classification_counts[item_name] = {}
                classification_counts[item_name][item_classification] = \
                    classification_counts[item_name].get(item_classification, 0) + 1

        # Add classification_counts to items that have mixed classifications
        # (i.e., more than one classification type with non-zero count)
        for item_name, counts in classification_counts.items():
            if item_name in items_data and len(counts) > 1:
                # Item has mixed classifications - add the counts
                items_data[item_name]['classification_counts'] = counts
    except Exception as e:
        logger.warning(f"Could not count item classifications for player {player}: {e}")

    # Update max_count based on actual placements (use max of current max_count and placements)
    for item_name, item_data in items_data.items():
        placement_count = placement_counts.get(item_name, 0)
        current_max = item_data.get('max_count', 1)
        # If there are more placements than current max_count, update it
        if placement_count > current_max:
            item_data['max_count'] = placement_count

    # 5. Add groups from item_name_groups to ALL items (including events)
    # This ensures event items and other items not in item_id_to_name get their groups
    item_name_groups = getattr(world, 'item_name_groups', {})
    if item_name_groups:
        for group_name, group_items in item_name_groups.items():
            for item_name in group_items:
                if item_name in items_data:
                    # Ensure groups key exists
                    if 'groups' not in items_data[item_name] or not isinstance(items_data[item_name]['groups'], list):
                        items_data[item_name]['groups'] = []

                    # Add group if not already present
                    if group_name not in items_data[item_name]['groups']:
                        items_data[item_name]['groups'].append(group_name)

        # Sort groups for consistency
        for item_data in items_data.values():
            if 'groups' in item_data and isinstance(item_data['groups'], list):
                item_data['groups'].sort()

    return items_data

def process_item_groups(multiworld, player: int) -> List[str]:
    """Get item groups for this player."""
    world = multiworld.worlds[player]
    if hasattr(world, 'item_name_groups'):
        return sorted(world.item_name_groups.keys())
    return []

def process_progression_mapping(multiworld, player: int) -> Dict[str, Any]:
    """Extract progression item mapping data using the game handler."""
    try:
        world = multiworld.worlds[player]
        game_name = multiworld.game[player]
        game_handler = get_game_export_handler(game_name, world)
        return game_handler.get_progression_mapping(world)
    except Exception as e:
        game_name = multiworld.game.get(player, "Unknown")
        logger.error(f"Error getting progression mapping for game '{game_name}': {e}")
        logger.exception("Traceback:")
        return {} # Return empty on error


def sort_lists_for_consistency(data, key_name=None):
    """
    Recursively sort lists of simple types (strings, numbers) for consistent JSON output.

    Uses a whitelist approach: only sorts lists under specific keys known to be safe.
    This prevents accidentally breaking game logic where list order is semantically
    meaningful (e.g., hat_craft_order in A Hat in Time, level_logic tuples in Overcooked).

    Args:
        data: The data structure to process
        key_name: The key name from the parent dict (used to determine if sorting is safe)

    Returns:
        The data structure with whitelisted lists sorted
    """
    if data is None or isinstance(data, (bool, int, float, str)):
        return data

    if isinstance(data, list):
        # First, recursively process all items
        processed = [sort_lists_for_consistency(item) for item in data]

        # Only sort if this key is in the whitelist
        if key_name in SAFE_TO_SORT_KEYS:
            # Only sort if all items are simple comparable types (str, int, float)
            if processed and all(isinstance(item, (str, int, float)) for item in processed):
                try:
                    return sorted(processed)
                except TypeError:
                    # If comparison fails, return unsorted
                    return processed
        return processed

    if isinstance(data, dict):
        # Sort dict keys if this key is in the whitelist for dict key sorting
        items = data.items()
        if key_name in SAFE_TO_SORT_DICT_KEYS:
            items = sorted(items, key=lambda x: x[0])
        return {k: sort_lists_for_consistency(v, key_name=k) for k, v in items}

    return data


def cleanup_export_data(data):
    """
    Clean up specific fields in the export data that need special handling.
    This is applied after the initial serialization.
    """
    # Track the game type for each player to apply appropriate handler
    player_games = {}
    
    # Get player game mapping (needed for handler selection)
    # Game name is in world[player].game
    if 'world' in data and isinstance(data['world'], dict):
        for player_id, world_data in data['world'].items():
            if isinstance(world_data, dict) and 'game' in world_data:
                player_games[player_id] = world_data['game']
            else:
                logger.warning(f"Could not determine game for player {player_id} in cleanup")
                player_games[player_id] = "unknown"

    # Clean up world data fields
    if 'world' in data:
        for player, world_data in data['world'].items():
            if not isinstance(world_data, dict) or 'error' in world_data: # Skip if not dict or already an error
                continue
            # Get world_directory from world data (added during export) for handler lookup
            world_dir = world_data.get('world_directory') or ''
            game_handler = get_game_export_handler(world_directory=world_dir)  # World not available during cleanup
            try:
                # Delegate cleanup to the specific handler
                # Pass a copy to avoid modifying the original dict used elsewhere if cleanup fails partially
                cleaned_world_data = game_handler.cleanup_world_data(world_data.copy())
                data['world'][player] = cleaned_world_data # Update with cleaned world data
            except Exception as e:
                logger.error(f"Error cleaning world data via handler for player {player} ({world_dir}): {e}")
                # Keep original world data in case of error during cleanup

    # Clean up region types
    if 'regions' in data:
        for player, regions in data['regions'].items():
            for region_name, region in regions.items():
                # Convert region type to int if possible
                if 'type' in region and isinstance(region['type'], str):
                    if region['type'].isdigit():
                        region['type'] = int(region['type'])
                
                # Clean up location progress_type
                if 'locations' in region:
                    for location in region['locations']:
                        if 'progress_type' in location and isinstance(location['progress_type'], str):
                            if location['progress_type'].isdigit():
                                location['progress_type'] = int(location['progress_type'])

    # Sort lists in game_info (including slot_data) for consistent output
    # This handles cases like Terraria's goal list and Witness's disabled_entities
    if 'game_info' in data:
        for player_id, game_info in data['game_info'].items():
            data['game_info'][player_id] = sort_lists_for_consistency(game_info)

    # Sort lists/dicts in world data for consistent output
    # This handles cases like TWW's item_classification_overrides
    if 'world' in data:
        for player_id, world_data in data['world'].items():
            data['world'][player_id] = sort_lists_for_consistency(world_data)

    return data

# --- Helper for Field Exclusion ---
def remove_excluded_fields(data, excluded_keys):
    """ Recursively remove specified keys from nested dictionaries and lists. """
    if isinstance(data, dict):
        new_dict = {}
        for key, value in data.items():
            if key not in excluded_keys:
                new_dict[key] = remove_excluded_fields(value, excluded_keys)
        return new_dict
    elif isinstance(data, list):
        return [remove_excluded_fields(item, excluded_keys) for item in data]
    else:
        return data

# --- Helper function for common data processing steps ---
def _get_cleaned_rules_data(multiworld) -> Dict[str, Any]:
    """
    Prepares, serializes, and cleans rule data. Does NOT apply field exclusions.
    """
    try:
        export_data = prepare_export_data(multiworld)
        # Apply serialization and cleanup - important for consistent output
        serializable_data = make_serializable(export_data)
        cleaned_data = cleanup_export_data(serializable_data)
        return cleaned_data
    except Exception as e:
        logger.error(f"Error preparing or cleaning rule data: {e}")
        logger.exception("Full traceback during data preparation/cleaning:")
        # Consider returning a partial structure or raising? For now, return empty.
        return {}


# --- Game Rules Export ---
def _cleanup_empty_worldgen_dirs() -> None:
    """Remove empty worldgen temp directories to prevent warnings on the next run.

    These are leftover directories from interrupted fuzz/worldgen runs that
    don't have an __init__.py, causing warnings when worlds are loaded.
    They typically have names like 'adventure_worldgen_86998726363870010506'.
    """
    worlds_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "worlds")
    if not os.path.isdir(worlds_dir):
        return
    removed_count = 0
    for name in os.listdir(worlds_dir):
        if not name.endswith(("_worldgen", "_worldgen2")) and "_worldgen_" not in name and not (name.split("_")[-1].isdigit() and len(name.split("_")[-1]) > 10):
            continue
        entry = os.path.join(worlds_dir, name)
        if os.path.isdir(entry) and not os.path.isfile(os.path.join(entry, "__init__.py")):
            try:
                shutil.rmtree(entry)
                removed_count += 1
            except OSError:
                pass
    if removed_count > 0:
        logger.debug(f"Cleaned up {removed_count} empty worldgen directories")


def export_game_rules(multiworld, output_dir: str, filename_base: str, save_presets: bool = False, skip_preset_copy_if_rules_identical: bool = False, rules_json_format: str = "rule_builder", cleanup_multiworld: bool = False, clear_game_presets: bool = False, clear_all_presets: bool = False) -> Dict[str, str]:
    """
    Exports game rules to JSON files for frontend consumption.
    Also saves a copy of rules to frontend/presets with game name as prefix if save_presets is True.

    Args:
        multiworld: MultiWorld instance containing game rules
        output_dir: Directory to write output files
        filename_base: Base name for output files
        save_presets: Whether to save copies of files to the presets directory
        skip_preset_copy_if_rules_identical: If True, skip copying to presets if files are identical
        rules_json_format: Output format - "rule_builder" (default), "ast", or "both"
        cleanup_multiworld: If True, clear multiworld references after export to help garbage
            collection. Disabled by default as it invalidates the multiworld object.
        clear_game_presets: If True, delete all existing presets for the current game before generating
        clear_all_presets: If True, delete all existing presets for ALL games before generating

    Returns:
        Dict containing paths to generated files
    """

    # Determine whether to export rules.json based on settings mode.
    from worlds.json_tools_installer.json_tools_settings import get_json_tools_settings
    jt = get_json_tools_settings()

    if jt.use_tracking_mode_config:
        # Config-based logic: use tracking-mode-config.json
        if len(multiworld.worlds) == 1:  # Only 1 player in the multiworld
            world = list(multiworld.worlds.values())[0]
            if not _should_export_rules_json_from_config(world.game):
                logger.info(f"Skipping rules export for {world.game} (config-based: first passing mode is not 'worldgen')")
                return {}
    else:
        # Simple flag-based logic
        if not jt.save_rules_json:
            # save_rules_json is False - don't export
            return {}

    os.makedirs(output_dir, exist_ok=True)
    _cleanup_empty_worldgen_dirs()

    # --- Configuration for Excluded Fields (now defined globally) ---
    
    # --- Field Exclusion Helpers (now defined globally) --- 
    
    # --- Define key categories and order ---
    desired_key_order = [
        'schema_version',
        'game_name',
        'game_directory',
        'playerId',  # Player ID for player-specific exports
        'archipelago_version',
        'generation_seed',
        'seed_name',
        'player_names',
        'regions',
        'dungeons',
        'start_regions',
        'items',
        'item_groups',
        'itempool_counts',
        'canonical_placements',
        'progression_mapping',
        'starting_items',
        'world',
        'exporter',
        'game_info',
        'helpers'
    ]

    # Player-specific keys contain data nested under player IDs
    player_specific_keys = [
        'regions', 'dungeons', 'items', 'item_groups', 'progression_mapping',
        'world', 'exporter', 'start_regions', 'itempool_counts',
        'canonical_placements', 'game_info', 'starting_items'
    ]

    # Prepare the combined export data for all players using the helper
    with profiler.section("get_cleaned_rules_data"):
        cleaned_data = _get_cleaned_rules_data(multiworld)
    if not cleaned_data: # Handle potential errors from the helper
        logger.error("Failed to get cleaned data, cannot export game rules.")
        return {}

    # Validate rules_json_format parameter
    valid_formats = ("rule_builder", "ast", "both")
    if rules_json_format not in valid_formats:
        logger.warning(f"Invalid rules_json_format '{rules_json_format}', defaulting to 'rule_builder'")
        rules_json_format = "rule_builder"

    # Prepare data in appropriate format(s)
    # AST format is what we get from _get_cleaned_rules_data
    ast_data = cleaned_data
    rb_data = None

    if rules_json_format in ("rule_builder", "both"):
        # Convert to Rule Builder format
        with profiler.section("convert_to_rule_builder"):
            try:
                rb_data, conversion_warnings = convert_rules_file_to_rule_builder(cleaned_data)
                if conversion_warnings:
                    logger.debug(f"Format conversion warnings: {len(conversion_warnings)} warnings")
                    for warning in conversion_warnings[:5]:  # Log first 5 warnings
                        logger.debug(f"  - {warning}")
                    if len(conversion_warnings) > 5:
                        logger.debug(f"  ... and {len(conversion_warnings) - 5} more warnings")
            except Exception as e:
                logger.error(f"Error converting to Rule Builder format: {e}")
                if rules_json_format == "rule_builder":
                    logger.warning("Falling back to AST format due to conversion error")
                    rules_json_format = "ast"
                else:
                    logger.warning("Skipping Rule Builder output due to conversion error")
                    rb_data = None

    # --- Helper function to create an ordered dictionary with proper field ordering ---
    def create_ordered_export_data(data, game_name=None, player_id=None):
        """
        Create an ordered dictionary with fields in the desired order.
        
        Args:
            data: The data to order
            game_name: Game name to include (if provided)
            player_id: If provided, extract only this player's data from player-specific fields
            
        Returns:
            Dict with fields in desired order (Python 3.7+ maintains insertion order)
        """
        ordered_data = {}
        
        # Process each key in the desired order
        for key in desired_key_order:
            # Special handling for game_name
            if key == 'game_name':
                if game_name:
                    ordered_data[key] = game_name
                continue

            # Special handling for game_directory
            if key == 'game_directory':
                if game_name:
                    # Use the get_world_directory_name function to get the directory name
                    game_directory = get_world_directory_name(game_name)
                    ordered_data[key] = game_directory
                continue

            # Special handling for playerId - only include in player-specific exports
            if key == 'playerId':
                if player_id is not None:
                    ordered_data[key] = player_id
                continue

            # Special handling for dungeons (only include if it exists)
            if key == 'dungeons':
                if key in data:
                    if player_id is not None:
                        # For player-specific exports, only include this player's dungeons
                        if player_id in data[key]:
                            ordered_data[key] = {player_id: data[key][player_id]}
                    else:
                        # For combined exports, include all dungeons
                        ordered_data[key] = data[key]
                continue
                
            # Handle player-specific fields
            if key in player_specific_keys and key in data:
                if player_id is not None:
                    # For player-specific exports, only include this player's data
                    if player_id in data[key]:
                        ordered_data[key] = {player_id: data[key][player_id]}
                else:
                    # For combined exports, include all data
                    ordered_data[key] = data[key]
                continue
                
            # Handle normal fields
            if key in data:
                ordered_data[key] = data[key]
        
        # Add any keys not in the desired order at the end
        for key, value in data.items():
            if key not in ordered_data and key not in player_specific_keys:
                ordered_data[key] = value
                logger.warning(f"Key '{key}' was not in desired_key_order, added to end of export")
                
        return ordered_data
    
    # --- Helper function to write export data to a file ---
    def write_export_data(data, filepath):
        """
        Apply exclusions and write data to a JSON file.

        Args:
            data: The data to write
            filepath: The output file path

        Returns:
            Boolean indicating success
        """
        try:
            # Apply field exclusions
            filtered_data = remove_excluded_fields(data, EXCLUDED_FIELDS)

            # Apply context-specific exclusions
            if CONTEXT_EXCLUDED_FIELDS:
                filtered_data = process_field_exclusions(
                    filtered_data,
                    context_excluded_fields=CONTEXT_EXCLUDED_FIELDS,
                    global_excluded_fields=EXCLUDED_FIELDS
                )

            # Write to file
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(filtered_data, f, indent=2)

            # Check final file size against limit
            file_size_bytes = os.path.getsize(filepath)
            file_size_mb = file_size_bytes / (1024 * 1024)
            num_players = getattr(multiworld, 'players', 1)
            max_final_size_mb = MAX_FINAL_EXPORT_SIZE_MB_BASE + (MAX_FINAL_EXPORT_SIZE_MB_PER_EXTRA_GAME * max(0, num_players - 1))

            if file_size_mb > max_final_size_mb:
                logger.error(f"Final export file size ({file_size_mb:.2f} MB) exceeds limit ({max_final_size_mb} MB): {filepath}")
                # Don't delete the file - it may still be useful, but warn about it
                logger.warning(f"Export file exceeds size limit but was written anyway. Consider reducing game complexity.")
            else:
                logger.info(f"Successfully wrote rules to {filepath} ({file_size_mb:.2f} MB)")

            return True
        except Exception as e:
            logger.error(f"Error writing rules export file {filepath}: {e}")
            return False
    
    results = {}

    # --- Determine Game Name for Combined File ---
    combined_game_name = "Unknown"
    if multiworld.game:
        unique_games = set(g for g in multiworld.game.values() if g)
        if len(unique_games) > 1:
            combined_game_name = "Multiworld"
        elif len(unique_games) == 1:
            combined_game_name = sorted(unique_games)[0]
        else:
            combined_game_name = "Unknown"

    # --- Process Combined Export (all players) ---
    # Determine which data to use for the primary output file
    if rules_json_format == "ast":
        primary_data = ast_data
    else:
        # For "rule_builder" or "both", use Rule Builder format as primary
        primary_data = rb_data if rb_data is not None else ast_data

    combined_rules_path = os.path.join(output_dir, f"{filename_base}_rules.json")
    ordered_data = create_ordered_export_data(primary_data, game_name=combined_game_name)

    if write_export_data(ordered_data, combined_rules_path):
        results['rules_combined'] = combined_rules_path
    else:
        # Handle failure if needed
        pass

    # Write AST format file if "both" is selected
    if rules_json_format == "both":
        ast_rules_path = os.path.join(output_dir, f"{filename_base}_rules-ast.json")
        ordered_ast_data = create_ordered_export_data(ast_data, game_name=combined_game_name)
        if write_export_data(ordered_ast_data, ast_rules_path):
            results['rules_combined_ast'] = ast_rules_path
        else:
            logger.warning("Failed to write AST format file")

    # --- Process Player-Specific Exports ---
    # Only create individual player files if more than one player
    if len(multiworld.player_ids) > 1:
        for player in multiworld.player_ids:
            player_str = str(player)
            player_game_name = multiworld.game.get(player, "Unknown")
            player_rules_path = os.path.join(output_dir, f"{filename_base}_P{player_str}_rules.json")

            # Create ordered player-specific data (use primary format)
            player_data = create_ordered_export_data(primary_data, game_name=player_game_name, player_id=player_str)

            # Write player-specific file
            if write_export_data(player_data, player_rules_path):
                results[f"rules_p{player_str}"] = player_rules_path
            else:
                results[f"rules_p{player_str}"] = f"ERROR: Failed to write file"

            # Write AST format player file if "both" is selected
            if rules_json_format == "both":
                player_ast_path = os.path.join(output_dir, f"{filename_base}_P{player_str}_rules-ast.json")
                player_ast_data = create_ordered_export_data(ast_data, game_name=player_game_name, player_id=player_str)
                if write_export_data(player_ast_data, player_ast_path):
                    results[f"rules_p{player_str}_ast"] = player_ast_path

    # If save_presets is False, skip the preset saving parts
    if not save_presets:
        return results

    # --- Save presets ---
    try:
        # Determine if it's a multi-game world for naming purposes
        if not multiworld.game:
            logger.warning("No game data found in multiworld object, skipping preset save")
            return results
            
        unique_games = set(g for g in multiworld.game.values() if g) # Get unique, non-empty game names
        
        is_multi_game = len(unique_games) > 1
        
        # Determine game name for folder
        if is_multi_game:
            game_name = "Multiworld" # Name used in descriptions
            clean_game_name = "multiworld" # Name used for the folder
            logger.info(f"Detected multi-game world ({len(unique_games)} unique games), using '{clean_game_name}' preset folder.")
        else:
            # Single game or empty game dict, use first player's game (or default)
            first_player = min(multiworld.game.keys()) if multiworld.game else 1 # Handle empty case
            game_name = multiworld.game.get(first_player, "unknown_game")
            
            if not game_name or game_name == "unknown_game":
                logger.warning(f"Could not determine valid game name for player {first_player}, skipping preset save")
                return results
            
            # Get the world directory name for use in a filename/folder
            clean_game_name = get_world_directory_name(game_name)
            logger.info(f"Detected single game world ({game_name}), using '{clean_game_name}' preset folder.")

        # Determine preset directories
        presets_dir = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'presets')
        os.makedirs(presets_dir, exist_ok=True)

        # Clear all presets if requested (must be done before creating game directory)
        if clear_all_presets:
            preset_index_path = os.path.join(presets_dir, 'preset_files.json')
            for item in os.listdir(presets_dir):
                item_path = os.path.join(presets_dir, item)
                # Only remove game directories, preserve preset_files.json (will be rebuilt)
                if os.path.isdir(item_path):
                    try:
                        shutil.rmtree(item_path)
                        logger.info(f"Cleared preset directory: {item_path}")
                    except Exception as e:
                        logger.error(f"Error removing preset directory {item_path}: {e}")
            # Clear the preset index since all presets are gone
            if os.path.exists(preset_index_path):
                try:
                    # Keep only metadata key if present
                    with open(preset_index_path, 'r', encoding='utf-8') as f:
                        preset_index = json.load(f)
                    metadata = preset_index.get('metadata', {})
                    with open(preset_index_path, 'w', encoding='utf-8') as f:
                        json.dump({'metadata': metadata} if metadata else {}, f, indent=2)
                    logger.info("Cleared preset_files.json (preserving metadata)")
                except Exception as e:
                    logger.error(f"Error clearing preset_files.json: {e}")

        # Create game-specific directory
        game_dir = os.path.join(presets_dir, clean_game_name)

        # If this world has vanilla placements and the game directory doesn't already
        # include "_vanilla" (e.g. alttp_vanilla_worldgen already has it), route it to
        # a dedicated {game}_vanilla directory instead of the standard game directory.
        if cleaned_data.get('is_vanilla') and '_vanilla' not in clean_game_name:
            clean_game_name = f"{clean_game_name}_vanilla"
            game_dir = os.path.join(presets_dir, clean_game_name)

        # Clear current game's presets if requested (and not already cleared by clear_all_presets)
        if clear_game_presets and not clear_all_presets and os.path.exists(game_dir):
            for item in os.listdir(game_dir):
                item_path = os.path.join(game_dir, item)
                try:
                    if os.path.isdir(item_path):
                        shutil.rmtree(item_path)
                    elif os.path.isfile(item_path):
                        os.remove(item_path)
                except Exception as e:
                    logger.error(f"Error removing item {item_path}: {e}")
            logger.info(f"Cleared existing presets for game: {clean_game_name}")

            # Also clear the game entry from preset_files.json
            preset_index_path = os.path.join(presets_dir, 'preset_files.json')
            if os.path.exists(preset_index_path):
                try:
                    with open(preset_index_path, 'r', encoding='utf-8') as f:
                        preset_index = json.load(f)
                    if clean_game_name in preset_index:
                        # Keep the game name but clear folders
                        preset_index[clean_game_name] = {
                            "name": game_name,
                            "folders": {}
                        }
                        with open(preset_index_path, 'w', encoding='utf-8') as f:
                            json.dump(preset_index, f, indent=2)
                        logger.info(f"Cleared {clean_game_name} entry in preset_files.json")
                except Exception as e:
                    logger.error(f"Error updating preset_files.json after clearing game presets: {e}")

        os.makedirs(game_dir, exist_ok=True)

        # Create a folder for this specific preset
        preset_dir = os.path.join(game_dir, filename_base)

        # --- Check if preset update is needed ---
        needs_update = True 
        if os.path.exists(preset_dir):
            try:
                # Compare files in output_dir and preset_dir
                output_files = sorted([f for f in os.listdir(output_dir) if f.endswith('.json') and os.path.isfile(os.path.join(output_dir, f))])
                preset_files = sorted([f for f in os.listdir(preset_dir) if f.endswith('.json') and os.path.isfile(os.path.join(preset_dir, f))])

                if set(output_files) == set(preset_files):
                    # Same files exist in both dirs, compare content
                    all_match = True
                    for filename in output_files:
                        output_path = os.path.join(output_dir, filename)
                        preset_path = os.path.join(preset_dir, filename)
                        try:
                            with open(output_path, 'r', encoding='utf-8') as f_out, open(preset_path, 'r', encoding='utf-8') as f_pre:
                                output_json = json.load(f_out)
                                preset_json = json.load(f_pre)
                                if output_json != preset_json:
                                    all_match = False
                                    logger.info(f"Preset content mismatch found in {filename}. Update needed.")
                                    break
                        except Exception as e:
                            logger.warning(f"Error comparing preset file {filename}: {e}. Assuming update needed.")
                            all_match = False
                            break
                    
                    if all_match and skip_preset_copy_if_rules_identical:
                        needs_update = False
                        logger.info(f"Preset {preset_dir} is up-to-date. Skipping file copy.")
            except Exception as e:
                logger.error(f"Error checking existing preset directory {preset_dir}: {e}. Proceeding with update.")
                needs_update = True

        # --- Update preset if needed ---
        if needs_update:
            logger.info(f"Updating preset directory: {preset_dir}")
            
            # Create or clear preset directory
            if not os.path.exists(preset_dir):
                os.makedirs(preset_dir)
                logger.info(f"Created new preset directory: {preset_dir}")
            else:
                # Clear existing files
                for item in os.listdir(preset_dir):
                    item_path = os.path.join(preset_dir, item)
                    try:
                        if os.path.isfile(item_path):
                            os.remove(item_path)
                        elif os.path.isdir(item_path):
                            shutil.rmtree(item_path)
                    except Exception as e:
                        logger.error(f"Error removing item {item_path}: {e}")

            # Copy files from output_dir to preset_dir
            files_copied = 0
            for file_name in os.listdir(output_dir):
                src_file = os.path.join(output_dir, file_name)
                if os.path.isfile(src_file):
                    try:
                        dst_file = os.path.join(preset_dir, file_name)
                        shutil.copy2(src_file, dst_file)
                        files_copied += 1
                    except Exception as e:
                        logger.error(f"Error copying file {src_file} to {preset_dir}: {e}")
            
            logger.info(f"Copied {files_copied} files to preset directory {preset_dir}")
            
            # Get list of files after copying
            try:
                preset_files = sorted([f for f in os.listdir(preset_dir) if os.path.isfile(os.path.join(preset_dir, f))])
            except Exception as e:
                logger.error(f"Error listing files in updated preset directory {preset_dir}: {e}")
                preset_files = []

            # --- Update preset index file ---
            preset_index_path = os.path.join(presets_dir, 'preset_files.json')
            preset_index = {}
            
            # Load existing index if available
            if os.path.exists(preset_index_path):
                try:
                    with open(preset_index_path, 'r', encoding='utf-8') as f:
                        preset_index = json.load(f)
                except Exception as e:
                    logger.error(f"Error reading preset_files.json: {e}")
                    preset_index = {}

            # Initialize game entry if needed
            if clean_game_name not in preset_index:
                preset_index[clean_game_name] = {
                    "name": game_name,
                    "folders": {}
                }
            elif "folders" not in preset_index[clean_game_name]:
                preset_index[clean_game_name]["folders"] = {}
            
            # Prepare player game data
            player_game_data = []
            for player_id in multiworld.player_ids:
                # Use getattr to safely access player_name and provide a default
                player_name = getattr(multiworld, 'player_name', {}).get(player_id, f"Player {player_id}")
                player_game_data.append({
                    "player": player_id,
                    "name": player_name,
                    "game": multiworld.game.get(player_id, "Unknown Game")
                })

            # Update preset entry
            folder_entry = {
                "seed": multiworld.seed,
                "games": player_game_data,
                "files": preset_files
            }

            # Add placement flags if present in export data
            if cleaned_data.get('is_vanilla'):
                folder_entry["is_vanilla"] = True
            if cleaned_data.get('is_canonical'):
                folder_entry["is_canonical"] = True
            if cleaned_data.get('preset_label'):
                folder_entry["label"] = cleaned_data['preset_label']

            preset_index[clean_game_name]["folders"][filename_base] = folder_entry
            
            # Write updated index
            try:
                with open(preset_index_path, 'w', encoding='utf-8') as f:
                    json.dump(preset_index, f, indent=2)
                logger.info(f"Updated preset_files.json with {len(preset_files)} files for {clean_game_name}/{filename_base}")
            except Exception as e:
                logger.error(f"Error writing updated preset_files.json: {e}")

    except Exception as e:
        # Log but don't fail if preset saving fails
        logger.error(f"Error during preset saving: {e}")
        logger.exception("Exception details during preset saving:")

    # Clear caches to prevent memory leaks and allow MultiWorld de-allocation
    clear_rule_cache()
    from .games import clear_handler_cache
    clear_handler_cache()
    from .analyzer import clear_caches as clear_analyzer_caches
    clear_analyzer_caches()

    # Optionally clear circular references in multiworld to allow garbage collection
    # This is disabled by default as it invalidates the multiworld object
    if cleanup_multiworld:
        _clear_multiworld_references(multiworld)

    # Print profiling report if enabled
    if profiler.enabled:
        logger.info(profiler.report())

    return results


def _clear_multiworld_references(multiworld) -> None:
    """Clear circular references in multiworld to allow proper garbage collection.

    The MultiWorld object has circular references with:
    - Regions (each region.multiworld points to multiworld)
    - Entrances (connected to regions)
    - Locations (parent_region points to regions)
    - Worlds (world.multiworld points to multiworld)
    - Spoiler (spoiler.multiworld points to multiworld)
    - CollectionState (state.multiworld points to multiworld)

    Additionally, the exporter has module-level caches that hold references:
    - _handler_cache: Game export handlers that store world references
    - _rule_analysis_cache: Cached rule analysis results
    - Analyzer caches: File content and AST caches

    This function breaks these cycles and clears caches so the garbage collector
    can free the memory.
    """
    try:
        # Clear exporter caches first (they hold references to world objects)
        clear_handler_cache()
        clear_rule_cache()
        clear_analyzer_caches()

        # Clear region references
        if hasattr(multiworld, 'regions') and hasattr(multiworld.regions, 'region_cache'):
            for player_regions in multiworld.regions.region_cache.values():
                for region in list(player_regions.values()):
                    region.multiworld = None
                    for exit in region.exits:
                        exit.parent_region = None
                        exit.connected_region = None
                        # Clear access rules which may have closures capturing multiworld
                        if hasattr(exit, 'access_rule'):
                            exit.access_rule = None
                        if hasattr(exit, 'access_rules'):
                            exit.access_rules = []
                    for loc in region.locations:
                        loc.parent_region = None
                        # Clear location access rules as well
                        if hasattr(loc, 'access_rule'):
                            loc.access_rule = None
                        if hasattr(loc, 'item_rule'):
                            loc.item_rule = None
                    region.exits = []
                    region.locations = []
                player_regions.clear()

        # Clear world references and world-specific objects (like dungeons)
        if hasattr(multiworld, 'worlds'):
            for player, world in list(multiworld.worlds.items()):
                # Clear dungeon references (some games have dungeons dict that hold multiworld refs)
                if hasattr(world, 'dungeons') and isinstance(world.dungeons, dict):
                    dungeon_count = 0
                    for dungeon in list(world.dungeons.values()):
                        if hasattr(dungeon, 'multiworld'):
                            dungeon.multiworld = None
                            dungeon_count += 1
                        if hasattr(dungeon, 'regions'):
                            dungeon.regions = []
                        # Clear other dungeon attributes that might hold references
                        if hasattr(dungeon, 'bosses'):
                            dungeon.bosses.clear()
                        if hasattr(dungeon, 'big_key'):
                            dungeon.big_key = None
                        if hasattr(dungeon, 'small_keys'):
                            dungeon.small_keys = []
                        if hasattr(dungeon, 'dungeon_items'):
                            dungeon.dungeon_items = []
                    # Clear the dungeons dict
                    world.dungeons.clear()
                    logger.debug(f"Cleared {dungeon_count} dungeon multiworld refs for player {player}")
                if hasattr(world, 'multiworld'):
                    world.multiworld = None
            multiworld.worlds.clear()

        # Clear spoiler reference
        if hasattr(multiworld, 'spoiler') and multiworld.spoiler:
            if hasattr(multiworld.spoiler, 'multiworld'):
                multiworld.spoiler.multiworld = None

        # Clear collection state reference
        if hasattr(multiworld, 'state') and multiworld.state:
            if hasattr(multiworld.state, 'multiworld'):
                multiworld.state.multiworld = None

    except Exception as e:
        logger.warning(f"Error clearing multiworld references: {e}")

# --- Field Exclusion Processing ---
def process_field_exclusions(data, context_excluded_fields=None, global_excluded_fields=None, context_path=None):
    """
    Process all configured field exclusions on the data.
    
    Args:
        data: The data structure to process
        context_excluded_fields: Dict mapping parent fields to lists of child fields to exclude
                                (e.g. {'entrances': ['access_rule']})
        global_excluded_fields: Set of fields to exclude everywhere
        context_path: Current path in the data structure (for recursive calls)
        
    Returns:
        Processed data with excluded fields removed
    """
    if context_path is None:
        context_path = []
    
    # Use empty defaults if not provided
    if context_excluded_fields is None:
        context_excluded_fields = {}
        
    if global_excluded_fields is None:
        global_excluded_fields = set()
    
    # First process each object based on its context
    current_context = context_path[-1] if context_path else None
    
    if isinstance(data, dict):
        # Apply exclusions for the current context
        if current_context in context_excluded_fields:
            fields_to_exclude = context_excluded_fields[current_context]
            for field in fields_to_exclude:
                if field in data:
                    del data[field]
        
        # Process each field recursively with updated context
        for key, value in list(data.items()):
            if isinstance(value, (dict, list)):
                new_context_path = context_path + [key]
                data[key] = process_field_exclusions(
                    value, 
                    context_excluded_fields,
                    global_excluded_fields,
                    new_context_path
                )
                
    elif isinstance(data, list):
        # For lists, process each item with the current context
        for i, item in enumerate(data):
            if isinstance(item, (dict, list)):
                data[i] = process_field_exclusions(
                    item, 
                    context_excluded_fields,
                    global_excluded_fields,
                    context_path
                )
    
    # Apply global exclusions at all levels
    if isinstance(data, dict):
        for field in global_excluded_fields:
            if field in data:
                del data[field]
                
    return data