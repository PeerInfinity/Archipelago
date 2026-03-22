"""Base class for game-specific helper expanders.

NOTE: New games should generally inherit from GenericGameExportHandler
instead of BaseGameExportHandler directly, unless you need full control
over all export methods. GenericGameExportHandler provides intelligent
defaults for rule analysis, item data discovery, and common helper patterns.

See exporter/games/generic.py for details on the enhanced functionality.
"""

from collections import Counter
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set
import importlib
import logging

from exporter.games.base.rule_expansion import RuleExpansionMixin
from exporter.games.base.world_data import WorldDataMixin
from exporter.games.base.helper_discovery import HelperDiscoveryMixin
from exporter.games.base.option_normalization import OptionNormalizationMixin
from exporter.games.base.utilities import (
    extract_closure_vars,
    count_rule_nodes,
    sanitize_helper_name,
)

logger = logging.getLogger(__name__)


class BaseGameExportHandler(
    RuleExpansionMixin,
    WorldDataMixin,
    HelperDiscoveryMixin,
    OptionNormalizationMixin,
):
    """Base class for game-specific export handlers.

    This class provides the core functionality for exporting Archipelago
    world data to JSON format. Game-specific handlers should inherit from
    this class (or GenericGameExportHandler) and override methods as needed.
    """

    # Configuration for automatic helper extraction
    # Games should override these class variables

    # List of module paths containing helper functions (e.g., ['worlds.shapez.regions'])
    HELPER_MODULES: List[str] = []

    # Dict mapping world attribute names to callables that compute them
    # Callable signature: (world, multiworld, player) -> value
    # Example: {'difficulty_requirements': lambda w, m, p: {...}}
    # These are exported to the 'world_attributes' section (separate from settings)
    # World attributes are runtime-computed values on the world instance (e.g., world.difficulty_requirements)
    WORLD_ATTRIBUTES: Dict[str, Callable] = {}

    # Legacy alias for WORLD_ATTRIBUTES - deprecated, use WORLD_ATTRIBUTES instead
    # TODO: Remove after migrating game-specific handlers
    COMPUTED_SETTINGS: Dict[str, Callable] = {}

    # List of option names to export at the top level of settings_dict
    # These are simple world.options.<name>.value extractions
    # Example: ['difficulty', 'logic_percent'] exports both as settings_dict['difficulty'], etc.
    EXPORTED_OPTIONS: List[str] = []

    # List of module paths containing item name constants (e.g., ['worlds.shapez.data.strings'])
    # The exporter will look for classes like ITEMS with attributes that map to item names
    ITEM_NAME_MODULES: List[str] = []

    # Module-level variables to inject into closure_vars for helper analysis.
    # Maps module path -> list of variable names to import.
    # Used by prepare_closure_vars() to make module constants available during rule analysis.
    # Example: {'worlds.mm2.rules': ['robot_masters', 'weapons_to_name']}
    CLOSURE_VAR_IMPORTS: Dict[str, List[str]] = {}

    # Whether to automatically export discovered helpers as definitions
    # When False (default), only whitelisted helpers are exported
    # When True, discovered helpers are exported (minus blacklist)
    # Games must explicitly set this to True to enable automatic helper export
    AUTO_EXPORT_DISCOVERED_HELPERS: bool = False

    # Whether to auto-discover and export all simple region attributes
    # When False (default), only dynamically_added is exported
    # When True, all simple attributes (bool, int, float, str) are exported
    AUTO_DISCOVER_REGION_ATTRIBUTES: bool = True

    # Whether to auto-discover and export all simple location attributes
    # When False (default), no attributes are exported
    # When True, all simple attributes (bool, int, float, str) are exported
    AUTO_DISCOVER_LOCATION_ATTRIBUTES: bool = True

    # Whether to auto-discover and export all simple world attributes
    # When False (default), only explicitly defined WORLD_ATTRIBUTES are exported
    # When True, all simple attributes (bool, int, float, str) on the world instance are exported
    AUTO_DISCOVER_WORLD_ATTRIBUTES: bool = True

    # Whether to auto-discover helper modules from the world directory
    # When True, all Python files in the game's world directory are treated as potential helper modules
    # This eliminates the need to manually specify HELPER_MODULES for most games
    # The discovery only affects where helpers are searched for - it doesn't cause extra exports
    AUTO_DISCOVER_WORLD_HELPER_MODULES: bool = True

    # Whether the analyzer should process if-statements with multiple statements in the body
    # When False (default), only simple if-statements with a single statement are handled
    # When True, complex if-statements with multiple statements are combined into compound conditions
    PROCESS_MULTISTATEMENT_IF_BODIES: bool = True

    # Whether the analyzer should recursively analyze closure variable function calls
    # When False (default), closure variables are converted to helper calls without recursive analysis
    # When True, closure variables are recursively analyzed and inlined for complex rule logic
    RECURSIVELY_ANALYZE_CLOSURES: bool = True

    # Whether to sort region locations by name for deterministic output.
    # When False (default), locations appear in the order they were added to region.locations.
    # When True, locations within each region are sorted by name before export.
    # Use this for games where locations are added via set iteration (non-deterministic order).
    SORT_REGION_LOCATIONS_BY_NAME: bool = False

    # Whether to export Choice options as numeric values or string keys
    # When True (default), Choice options are exported as integers (e.g., 0, 1, 2)
    #   - Enables proper ordered comparisons (< > <= >=) in JavaScript
    #   - String constants in helpers are normalized to numeric via normalize_helper_option_constants
    # When False, Choice options are exported as string keys (e.g., "easy", "default")
    #   - Works for equality/membership comparisons only
    #   - Ordered comparisons will use JavaScript string ordering (alphabetical, not semantic)
    EXPORT_CHOICE_OPTIONS_AS_NUMERIC: bool = True

    # Whether to resolve world.options.X.value patterns to constants at export time
    # When True (default), option values are resolved to their current numeric/string value
    #   - Results in smaller, faster rules with pre-computed option values
    #   - Rules are baked for the specific option configuration used during export
    # When False, option values are kept as option_value references
    #   - Rules remain generic and can work with different option configurations
    #   - Requires runtime option resolution in the frontend
    # This can be overridden by the host.yaml setting: json_tools.resolve_options_to_constants
    RESOLVE_OPTIONS_TO_CONSTANTS: bool = True

    # Set of helper function names to export as definitions (manual whitelist)
    # These helpers are always exported regardless of AUTO_EXPORT_DISCOVERED_HELPERS
    HELPERS_TO_EXPORT_WHITELIST: Set[str] = set()

    # Set of helper function names to NOT export as definitions (blacklist)
    # These helpers are too complex and need JavaScript implementations
    HELPERS_TO_EXPORT_BLACKLIST: Set[str] = set()

    # Parameter name mappings for helpers whose parameter names don't match slot_data keys.
    # Maps helper_name -> {param_name: slot_data_key}
    # The frontend uses these mappings to resolve parameter values from slot_data/settings.
    # Example: {'my_helper': {'param1': 'slot_data_key1', 'param2': 'setting_key2'}}
    HELPER_PARAM_MAPPINGS: Dict[str, Dict[str, str]] = {}

    # Settings class attributes that control export behavior
    # These are applied in get_world_data and can be overridden in subclasses

    # When True, method calls on 'self' or 'world' (e.g., self.quest_points(), world.quest_points())
    # are automatically converted to helper function calls in expand_rule.
    # This is useful for games that define methods on the World class that are used in rules.
    CONVERT_WORLD_METHODS_TO_HELPERS: bool = True

    # Set of object names whose method calls/attribute access should be converted to helper calls.
    # When a function_call like obj.method() is found where obj is one of these names,
    # it's converted to a helper call with name='method'.
    # Default includes 'self' and 'world' for World class methods.
    # Games like Yoshi's Island can extend this to include 'logic', 'bosses', etc.
    HELPER_OBJECT_NAMES: Set[str] = {'self', 'world'}

    # When True, eventProcessor uses resolved_items from sphere log instead of base_items
    # Use for games with complex event items or computed tracking items
    USE_RESOLVED_ITEMS: bool = False

    # When True, add all items from sphere log before comparing accessible locations
    # Required for games that need items in prog_items before evaluating rules
    ADD_SPHERE_ITEMS_UPFRONT: bool = False

    # When True, use auto sweep algorithm for indirect region dependencies.
    # Use for games with custom Rules.py that sets access_rule directly on entrances
    # without registering indirect_connections via RuleBuilder.set_rule().
    USE_AUTO_INDIRECT_CONDITIONS: bool = False

    # Set of helper function names that should be preserved as helper calls
    # during rule analysis (not inlined/expanded by generic pattern matching)
    # This is used by should_preserve_as_helper() - games can set this instead
    # of overriding the method
    HELPERS_TO_PRESERVE: Set[str] = set()

    # Set of option names recognized during bytecode analysis
    # Used by ClosureFunctionAnalyzer to detect option access patterns like:
    #   world.worlds[player].options.open_pyramid
    # Games should override this with their specific option names
    KNOWN_OPTION_NAMES: Set[str] = set()

    # Whether exits should be assumed bidirectional for frontend logic
    # Set to True for games where going through an entrance implies being able to return
    # Set to False to explicitly disable bidirectional assumption
    # Leave as None (default) to let the frontend auto-detect based on region structure
    ASSUME_BIDIRECTIONAL_EXITS: Optional[bool] = None

    # Enable automatic helper preservation based on size
    # When enabled, helpers with more nodes than HELPER_INLINE_THRESHOLD will be
    # preserved as helper calls instead of inlined, reducing rules.json size
    # Most games work better with this disabled (17 games explicitly disable it)
    AUTO_PRESERVE_LARGE_HELPERS: bool = True

    # Threshold for automatic helper preservation (only used if AUTO_PRESERVE_LARGE_HELPERS is True)
    # Helpers with more than this many nodes will be preserved as helper calls
    HELPER_INLINE_THRESHOLD: int = 0

    # Set of helper names that are defined as computed helpers in get_helper_definitions()
    # rather than discovered from helper modules. Used with AUTO_PRESERVE_COMPUTED_HELPERS.
    COMPUTED_HELPERS: Set[str] = set()

    # When True, helpers listed in COMPUTED_HELPERS are automatically preserved
    # (not inlined during rule analysis). This allows games to avoid manually
    # listing computed helpers in HELPERS_TO_PRESERVE.
    AUTO_PRESERVE_COMPUTED_HELPERS: bool = False

    # When True, helpers listed in HELPERS_TO_EXPORT_WHITELIST are automatically
    # preserved (not inlined during rule analysis). This is a common pattern since
    # helpers that need to be exported as definitions also shouldn't be inlined.
    # Default is True - set to False only if you want whitelisted helpers to be
    # inlined despite being exported.
    AUTO_PRESERVE_WHITELISTED_HELPERS: bool = True

    # Mapping of parameter/variable names used in inlined functions to their
    # corresponding setting names. Applied during expand_rule for 'name' type rules.
    # Example: {'ow_boss_req': 'ow_boss_requirement'}
    NAME_REMAPPING: Dict[str, str] = {}

    # Set of setting names that should be converted from 'name' type to 'setting_value' type.
    # This ensures they are looked up via getSetting which checks the options.* path.
    # Example: {'open_world', 'ow_boss_requirement'}
    SETTINGS_TO_CONVERT: Set[str] = set()

    # Mapping of state_method names to their replacement rule structures.
    # This allows games to declaratively replace game-specific state methods with
    # equivalent rule structures without overriding expand_rule.
    # Example: {'_my_game_setting': {'type': 'setting_value', 'setting': 'my_setting'}}
    # Replacements are applied recursively during rule expansion.
    # Manual entries here take precedence over auto-detected replacements.
    STATE_METHOD_REPLACEMENTS: Dict[str, Dict[str, Any]] = {}

    # Whether to auto-detect LogicMixin state method replacements.
    # When True, analyzes LogicMixin subclasses to detect common patterns like:
    # - return self.multiworld.worlds[player].<attr> -> setting_value
    # - return not self.multiworld.worlds[player].<attr> -> not(setting_value)
    # Manual STATE_METHOD_REPLACEMENTS always take precedence over auto-detected ones.
    AUTO_DISCOVER_LOGIC_MIXIN_REPLACEMENTS: bool = True

    # Accumulator rules for games that track progressive items (like coins).
    # Each rule is a dict with keys: pattern (regex), extract_value (bool),
    # target (accumulator name), discriminator (optional grouping key).
    # Example: [{'pattern': r'^(\d+) coins?$', 'extract_value': True, 'target': ' coins'}]
    ACCUMULATOR_RULES: List[Dict[str, Any]] = []

    # Initial values for prog_items accumulators.
    # These are used to initialize counters for games with accumulator-based rules.
    # Example: {' coins': 0, ' coins freemium': 0}
    PROG_ITEMS_INIT: Dict[str, Any] = {}

    # Mapping of self.<attr> patterns to setting configurations.
    # Used by the analyzer to convert self.attr access to setting_value rules.
    # This is useful for games where the world class stores option values in instance attributes.
    # Values can be:
    #   - str: setting name (uses numeric value)
    #   - dict: {'setting': name, 'use_current_key': True} (uses string key from name_lookup)
    # Example: {'fight_logic': {'setting': 'FightLogic', 'use_current_key': True}}
    SELF_ATTR_TO_SETTING: Dict[str, Any] = {}

    # Mapping of helper function names to their constant return values.
    # Used for helpers that always return a constant (typically True or False).
    # These are automatically expanded by expand_helper in the base class.
    # Example: {'always_true_helper': True, 'disabled_feature': False}
    CONSTANT_HELPER_EXPANSIONS: Dict[str, Any] = {}

    # Mapping of helper function names to rule type configurations.
    # Used for helpers that take a single argument and convert it to a rule type.
    # Format: {'helper_name': {'type': 'rule_type', 'field': 'field_name', 'arg_index': 0}}
    # - type: The rule type to create (location_check, can_reach, item_check, etc.)
    # - field: The field name in the rule to set (location, region, item, etc.)
    # - arg_index: Which argument to use (default 0)
    # Example: {'_can_get': {'type': 'location_check', 'field': 'location'}}
    # This expands _can_get("Location Name") to {'type': 'location_check', 'location': ...}
    HELPER_TO_RULE_MAPPINGS: Dict[str, Dict[str, Any]] = {}

    # Mapping of export names to item value extraction configuration.
    # Used to compute item->value mappings from world attributes at export time.
    # Each entry defines: 'source' (world attribute name) and 'value_extractor' (callable).
    # The value_extractor takes an item name and returns its numeric value.
    # Example: {'qp_items': {'source': 'available_QP_locations', 'value_extractor': lambda x: int(x[0])}}
    # The computed mapping is exported as world data and can be used by DICT_SUM_HELPERS.
    ITEM_VALUE_MAPPINGS: Dict[str, Dict[str, Any]] = {}

    # Mapping of helper names to the dict setting they sum over.
    # Automatically generates sum_of helpers that iterate over item->value mappings.
    # Example: {'quest_points': 'qp_items'} generates a helper that sums qp_items values
    # for items the player has.
    DICT_SUM_HELPERS: Dict[str, str] = {}

    # Configuration for auto-generating accumulator items.
    # When PROG_ITEMS_INIT is set and these are configured, the base class will:
    # 1. Create accumulator target items (e.g., " coins") from PROG_ITEMS_INIT keys
    # 2. Find items matching ACCUMULATOR_RULES patterns in locations
    # 3. Configure all matching items with these properties
    ACCUMULATOR_ITEM_GROUP: str = ''  # Group name for accumulator items (e.g., 'coins')
    ACCUMULATOR_ITEM_TYPE: str = ''   # Type for accumulator items (e.g., 'coins')
    ACCUMULATOR_TARGET_MAX_COUNT: int = 999999  # Max count for accumulator target items

    # Mapping of (option_name, property_name) to rule structures for expanding
    # computed option properties to their equivalent rule structures.
    # Used when an option class has computed properties (e.g., SwimRule.base_depth)
    # that need to be expanded to their underlying computation for the frontend.
    # Format: {('option_name', 'property_name'): rule_structure}
    # Example (Subnautica SwimRule):
    #   {('swim_rule', 'base_depth'): {
    #       'type': 'subscript',
    #       'value': {'type': 'constant', 'value': [200, 400, 600]},
    #       'index': {'type': 'binary_op', 'left': {'type': 'name', 'name': 'swim_rule'}, ...}
    #   }}
    OPTION_PROPERTY_EXPANSIONS: Dict[tuple, Dict[str, Any]] = {}

    # ==========================================================================
    # Game-specific analyzer configuration
    # These attributes allow game handlers to configure analyzer behavior
    # without hardcoding game-specific logic in shared analyzer code.
    # ==========================================================================

    # Set of known item names for bytecode-based rule analysis fallback.
    # When the analyzer falls back to bytecode analysis, it only recognizes
    # items in this set. Games with complex rule patterns should populate this.
    # Example: {'Moon Pearl', 'Magic Mirror', 'Hookshot', ...}
    KNOWN_ITEMS_FOR_BYTECODE_ANALYSIS: Set[str] = set()

    # Mapping of helper names to item lists for bytecode-based expansion.
    # When the analyzer sees a helper name (e.g., 'has_sword') in bytecode, it expands
    # to HasAny(items=BYTECODE_HELPER_EXPANSIONS[helper_name]).
    # Example: {'has_sword': ['Fighter Sword', 'Master Sword', 'Tempered Sword', 'Golden Sword']}
    BYTECODE_HELPER_EXPANSIONS: Dict[str, List[str]] = {}

    # Item name to use as fallback when rule analysis fails completely.
    # If set, unanalyzable rules fall back to Has(item_name=FALLBACK_ITEM).
    # If None, no game-specific fallback is applied.
    # Example: 'Moon Pearl' for ALttP bunny rules
    UNANALYZABLE_RULE_FALLBACK_ITEM: Optional[str] = None

    # Option values that indicate permissive logic modes are enabled.
    # When the logic option has one of these values, unanalyzable rules use a
    # permissive fallback (True) instead of requiring a fallback item.
    # Example: ['minor_glitches', 'overworld_glitches', 'no_logic', 'hard', 'expert']
    PERMISSIVE_LOGIC_OPTION_VALUES: List[str] = []

    # Option name for permissive logic detection.
    # The analyzer checks world.options.<PERMISSIVE_LOGIC_OPTION_NAME> to determine
    # if permissive logic is enabled. Leave as None to disable this detection.
    # Example: 'glitches_required', 'logic_rules', 'difficulty'
    PERMISSIVE_LOGIC_OPTION_NAME: Optional[str] = None

    def __init__(self, world=None):
        """Initialize the handler with an empty set of discovered helpers.

        Args:
            world: Optional world object for game-specific data access.
                   Many game handlers need access to the world during rule
                   expansion or other processing.
        """
        # Store world reference if provided
        self.world = world
        # Set of helper names discovered during rule analysis
        # Populated automatically by register_helper_usage()
        self._discovered_helpers: Set[str] = set()
        # Dict mapping helper names to their source modules (auto-detected)
        self._discovered_helper_modules: Dict[str, str] = {}
        # Set of helper names that were auto-preserved due to HELPER_INLINE_THRESHOLD
        # These helpers should not be expanded by common pattern matching
        self._auto_preserved_helpers: Set[str] = set()
        # Cache of analyzed helper definitions (for auto-preserved large helpers)
        self._analyzed_helper_cache: Dict[str, Any] = {}
        # Cache for worldgen detection result
        self._is_worldgen_cache: Optional[bool] = None
        # Dict of auto-discovered param_mappings from call-site analysis
        # Maps helper_name -> {param_name: slot_data_key}
        self._discovered_param_mappings: Dict[str, Dict[str, str]] = {}
        # Cache for auto-detected LogicMixin state method replacements
        self._auto_detected_replacements_cache: Optional[Dict[str, Dict[str, Any]]] = None

    # ==========================================================================
    # Helper registration methods
    # ==========================================================================

    def register_helper_usage(self, helper_name: str, helper_func: Any = None) -> None:
        """
        Register that a helper function is used in the rules.

        This is called by the analyzer when it encounters a helper function call.
        The helper will be automatically analyzed and exported as a definition
        (unless it's in the blacklist).

        Args:
            helper_name: The name of the helper function
            helper_func: Optional - the actual function object (used to auto-detect module)
        """
        if not hasattr(self, '_discovered_helpers'):
            self._discovered_helpers = set()
        if not hasattr(self, '_discovered_helper_modules'):
            self._discovered_helper_modules = {}
        self._discovered_helpers.add(helper_name)

        # Auto-detect the module from the function object
        if helper_func is not None and hasattr(helper_func, '__module__'):
            module_name = helper_func.__module__
            if module_name and helper_name not in self._discovered_helper_modules:
                self._discovered_helper_modules[helper_name] = module_name
                logger.debug(f"Auto-detected module for helper '{helper_name}': {module_name}")

    def register_helpers_from_rule(self, rule: Optional[Dict[str, Any]]) -> None:
        """
        Recursively register all helpers referenced in a rule structure.

        This is useful for games that construct rule structures manually
        (e.g., from JSON data or hardcoded dictionaries) and need to ensure
        all referenced helpers are discovered for export.

        Walks through the rule tree and calls register_helper_usage() for
        any helper nodes found.

        Args:
            rule: The rule dictionary to scan for helper references
        """
        if rule is None or not isinstance(rule, dict):
            return

        rule_type = rule.get('type')
        if rule_type == 'helper':
            helper_name = rule.get('name')
            if helper_name:
                self.register_helper_usage(helper_name)
        elif rule_type in ('and', 'or'):
            for condition in rule.get('conditions', []):
                self.register_helpers_from_rule(condition)
        elif rule_type == 'not':
            self.register_helpers_from_rule(rule.get('condition'))
        elif rule_type == 'conditional':
            self.register_helpers_from_rule(rule.get('test'))
            self.register_helpers_from_rule(rule.get('if_true'))
            self.register_helpers_from_rule(rule.get('if_false'))

    def get_discovered_helpers(self) -> Set[str]:
        """
        Return the set of helper names discovered during rule analysis.

        Returns:
            Set of helper function names that were used in the analyzed rules
        """
        if not hasattr(self, '_discovered_helpers'):
            self._discovered_helpers = set()
        return self._discovered_helpers

    def get_discovered_helper_modules(self) -> Dict[str, str]:
        """
        Return the dict mapping helper names to their auto-detected modules.

        Returns:
            Dict mapping helper function names to module paths
        """
        if not hasattr(self, '_discovered_helper_modules'):
            self._discovered_helper_modules = {}
        return self._discovered_helper_modules

    def register_discovered_param_mapping(self, helper_name: str, param_mappings: Dict[str, str]) -> None:
        """
        Register auto-discovered param_mappings from call-site analysis.

        This is called by the analyzer when it detects that helper arguments
        follow patterns like world.options.X.value or world.Y, allowing automatic
        mapping of parameter names to slot_data keys.

        Args:
            helper_name: The name of the helper function
            param_mappings: Dict mapping param_name -> slot_data_key
        """
        if not hasattr(self, '_discovered_param_mappings'):
            self._discovered_param_mappings = {}

        if not param_mappings:
            return

        # Merge with existing mappings (first discovery wins for each param)
        if helper_name not in self._discovered_param_mappings:
            self._discovered_param_mappings[helper_name] = {}

        for param_name, slot_data_key in param_mappings.items():
            if param_name not in self._discovered_param_mappings[helper_name]:
                self._discovered_param_mappings[helper_name][param_name] = slot_data_key
                logger.debug(f"Discovered param_mapping: {helper_name}.{param_name} -> '{slot_data_key}'")

    def get_discovered_param_mappings(self, helper_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Return auto-discovered param_mappings.

        Args:
            helper_name: Optional - if provided, return mappings for this helper only

        Returns:
            Dict mapping helper_name -> {param_name: slot_data_key}
            If helper_name is provided, returns just that helper's mappings dict
        """
        if not hasattr(self, '_discovered_param_mappings'):
            self._discovered_param_mappings = {}

        if helper_name:
            return self._discovered_param_mappings.get(helper_name, {})
        return self._discovered_param_mappings

    def register_auto_preserved_helper(self, helper_name: str) -> None:
        """
        Register that a helper was auto-preserved due to HELPER_INLINE_THRESHOLD.

        Auto-preserved helpers should not be expanded by common pattern matching
        in expand_rule() because they will have proper definitions exported.

        Args:
            helper_name: The name of the helper function
        """
        if not hasattr(self, '_auto_preserved_helpers'):
            self._auto_preserved_helpers = set()
        self._auto_preserved_helpers.add(helper_name)

    def is_auto_preserved_helper(self, helper_name: str) -> bool:
        """
        Check if a helper was auto-preserved due to HELPER_INLINE_THRESHOLD.

        Args:
            helper_name: The name of the helper function

        Returns:
            True if the helper was auto-preserved
        """
        if not hasattr(self, '_auto_preserved_helpers'):
            self._auto_preserved_helpers = set()
        return helper_name in self._auto_preserved_helpers

    def clear_discovered_helpers(self) -> None:
        """Clear the set of discovered helpers. Called between player exports."""
        self._discovered_helpers = set()
        self._discovered_helper_modules = {}
        self._auto_preserved_helpers = set()
        self._analyzed_helper_cache = {}
        self._discovered_param_mappings = {}

    def get_effective_state_method_replacements(self) -> Dict[str, Dict[str, Any]]:
        """Get the effective STATE_METHOD_REPLACEMENTS combining auto-detected and manual.

        This method:
        1. Auto-detects LogicMixin patterns if AUTO_DISCOVER_LOGIC_MIXIN_REPLACEMENTS is True
        2. Merges with manual STATE_METHOD_REPLACEMENTS (manual takes precedence)
        3. Caches the result for performance

        Returns:
            Dict mapping method names to their rule replacement structures
        """
        # Return cached result if available
        if self._auto_detected_replacements_cache is not None:
            return self._auto_detected_replacements_cache

        # Start with manual replacements (these take precedence)
        effective = dict(self.STATE_METHOD_REPLACEMENTS)

        # Auto-detect if enabled
        if self.AUTO_DISCOVER_LOGIC_MIXIN_REPLACEMENTS and self.world is not None:
            try:
                from exporter.games.base.logic_mixin_analyzer import discover_state_method_replacements
                auto_detected = discover_state_method_replacements(self.world, None)

                # Merge auto-detected (manual takes precedence, so add auto-detected first)
                merged = dict(auto_detected)
                merged.update(effective)
                effective = merged

                # Log what was auto-detected vs manual
                auto_only = set(auto_detected.keys()) - set(self.STATE_METHOD_REPLACEMENTS.keys())
                if auto_only:
                    logger.info(f"Auto-detected {len(auto_only)} LogicMixin replacements: {sorted(auto_only)}")

            except Exception as e:
                logger.warning(f"Error auto-detecting LogicMixin replacements: {e}")

        # Cache the result
        self._auto_detected_replacements_cache = effective
        return effective

    def is_worldgen_world(self, world=None) -> bool:
        """
        Check if this is a worldgen world (generated by world_generator).

        Worldgen worlds have their module path ending with '_worldgen'
        (e.g., 'worlds.lingo_worldgen' or 'worlds.lingo_worldgen.LingoWorld').

        Args:
            world: Optional world object to check. If not provided, uses self.world.

        Returns:
            True if this is a worldgen world, False otherwise
        """
        # Use cached result if available
        if self._is_worldgen_cache is not None:
            return self._is_worldgen_cache

        check_world = world or self.world
        if not check_world:
            return False

        module_path = type(check_world).__module__
        # Match _worldgen, _worldgen2, _worldgen3, etc. at end or before dot
        import re
        self._is_worldgen_cache = bool(re.search(r'_worldgen\d*($|\.)', module_path))
        return self._is_worldgen_cache

    def cache_analyzed_helper(self, helper_name: str, definition: Dict[str, Any]) -> None:
        """
        Cache an analyzed helper definition for later export.

        This is called by the analyzer when a helper is automatically preserved
        due to exceeding HELPER_INLINE_THRESHOLD. The cached definition will be
        used by get_helper_definitions() instead of re-analyzing the helper.

        Args:
            helper_name: The name of the helper function
            definition: The analyzed rule definition for the helper
        """
        if not hasattr(self, '_analyzed_helper_cache'):
            self._analyzed_helper_cache = {}
        self._analyzed_helper_cache[helper_name] = definition

    def get_cached_helper(self, helper_name: str) -> Optional[Dict[str, Any]]:
        """
        Get a cached helper definition if available.

        Args:
            helper_name: The name of the helper function

        Returns:
            The cached rule definition, or None if not cached
        """
        if not hasattr(self, '_analyzed_helper_cache'):
            self._analyzed_helper_cache = {}
        return self._analyzed_helper_cache.get(helper_name)

    # ==========================================================================
    # Closure variable methods
    # ==========================================================================

    def prepare_closure_vars(self, rule_func: Optional[Callable], closure_vars: Dict[str, Any]) -> Dict[str, Any]:
        """Inject module-level variables into closure_vars for helper analysis.

        This default implementation uses CLOSURE_VAR_IMPORTS to automatically
        inject module-level constants that are needed during rule analysis.

        Games can override this method for more complex injection logic, such as
        processing Region objects or handling dynamic module discovery.

        Args:
            rule_func: The rule function being analyzed (unused in base implementation)
            closure_vars: The existing closure variables dict

        Returns:
            Enhanced closure_vars dict with injected module-level variables
        """
        if not self.CLOSURE_VAR_IMPORTS:
            return closure_vars

        enhanced_closure = closure_vars.copy()

        for module_path, var_names in self.CLOSURE_VAR_IMPORTS.items():
            try:
                module = importlib.import_module(module_path)
                for var_name in var_names:
                    if var_name not in enhanced_closure:
                        if hasattr(module, var_name):
                            enhanced_closure[var_name] = getattr(module, var_name)
                            logger.debug(f"Injected {var_name} from {module_path} into closure_vars")
                        else:
                            logger.warning(f"Variable {var_name} not found in module {module_path}")
            except ImportError as e:
                logger.warning(f"Could not import module {module_path} for closure injection: {e}")

        return enhanced_closure

    # ==========================================================================
    # Optional hook methods (overridden by game-specific handlers)
    # Default implementations are no-ops or pass-throughs.
    # ==========================================================================

    def postprocess_helper(self, helper_name: str, helper_def: Dict[str, Any]) -> Dict[str, Any]:
        """Post-process a helper definition. Override to modify helpers before export."""
        return helper_def

    def postprocess_regions(self, multiworld: Any, player: int) -> None:
        """Called before region extraction. Override to modify regions."""

    def handle_complex_entrance_rule(self, entrance_name: str, rule: Any) -> Optional[Dict[str, Any]]:
        """Handle complex entrance rules. Return None to fall back to normal analysis."""
        return None

    def postprocess_entrance_rule(
        self, rule: Dict[str, Any],
        entrance_name: Optional[str] = None, connected_region: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Post-process an entrance rule. Override to modify rules after analysis."""
        return rule

    def postprocess_rule(self, rule: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Post-process a rule. Override to modify rules after analysis."""
        return rule

    def set_context(self, location_name: Optional[str]) -> None:
        """Set the current location context. Override to track location state."""

    def set_exit_context(self, exit_name: Optional[str]) -> None:
        """Set the current exit context. Override to track exit state."""

    def set_exit_info(self, exit_name: str, connected_region: str) -> None:
        """Set exit connection info. Override to track exit/region relationships."""

    def get_unwrapped_exit_lambda(self, exit_name: Optional[str], original_lambda: Any) -> Optional[Any]:
        """Get unwrapped exit lambda. Return None to use the original."""
        return None

    def set_location_context(self, location_name: Optional[str]) -> None:
        """Set the current location context. Override to track location state."""

    def get_custom_location_access_rule(self, location: Any, world: Any) -> Optional[Dict[str, Any]]:
        """Get custom access rule for a location. Return None to use normal analysis."""
        return None

    def post_process_location_data(
        self, location_data: Dict[str, Any], location_name: Optional[str] = None,
        region_name: Optional[str] = None, world: Any = None
    ) -> Dict[str, Any]:
        """Post-process location data before adding to region. Override to modify data."""
        return location_data

    def get_extra_locations_for_region(
        self, region_name: str, existing_locations: List[str]
    ) -> List[Dict[str, Any]]:
        """Get extra locations for a region not generated in this seed."""
        return []

    def get_item_type_for_name(self, item_name: str, world: Any) -> Optional[str]:
        """Get the item type for an item name. Return None for default handling."""
        return None

    # ==========================================================================
    # Static utility methods (delegated to utilities module)
    # ==========================================================================

    @staticmethod
    def _extract_closure_vars(rule_func: Callable) -> Dict[str, Any]:
        """Extract closure variables from a function."""
        return extract_closure_vars(rule_func)

    @staticmethod
    def count_rule_nodes(rule: Dict[str, Any]) -> int:
        """Count the number of nodes in a rule tree."""
        return count_rule_nodes(rule)

    @staticmethod
    def sanitize_helper_name(name: str) -> str:
        """Convert a name to a valid helper function identifier."""
        return sanitize_helper_name(name)

    # ==========================================================================
    # Hook methods (override in subclasses)
    # ==========================================================================

    def expand_helper(self, helper_name: str, args: Optional[List[Any]] = None) -> Optional[Dict[str, Any]]:
        """Expand a helper function into basic rule conditions.

        Override this method in game-specific handlers to provide
        game-specific helper expansions. When overriding, call
        super().expand_helper() first to handle CONSTANT_HELPER_EXPANSIONS
        and HELPER_TO_RULE_MAPPINGS.

        Args:
            helper_name: The name of the helper to expand
            args: The arguments passed to the helper

        Returns:
            A rule dictionary if the helper should be expanded, None otherwise
        """
        # Check CONSTANT_HELPER_EXPANSIONS for helpers that return constant values
        if helper_name in self.CONSTANT_HELPER_EXPANSIONS:
            value = self.CONSTANT_HELPER_EXPANSIONS[helper_name]
            return {'type': 'constant', 'value': value}

        # Check HELPER_TO_RULE_MAPPINGS for helpers that map to rule types
        if helper_name in self.HELPER_TO_RULE_MAPPINGS:
            mapping = self.HELPER_TO_RULE_MAPPINGS[helper_name]
            arg_index = mapping.get('arg_index', 0)
            if args and len(args) > arg_index:
                arg = args[arg_index]
                # Determine the field value based on arg type:
                # - If arg is a dict (rule structure), use it as-is
                # - If arg is a raw value, wrap it in a constant node
                if isinstance(arg, dict):
                    # Already a rule structure (constant, name, f_string, etc.) - use as-is
                    field_value = arg
                else:
                    # Raw value - wrap in constant
                    field_value = {'type': 'constant', 'value': arg}
                return {
                    'type': mapping['type'],
                    mapping['field']: field_value
                }

        return None

    def replace_name(self, name: str) -> str:
        """Replace a name with another name if needed for game-specific logic."""
        return name

    def handle_special_function_call(self, func_name: str, processed_args: list) -> Optional[dict]:
        """
        Handle game-specific special function calls that should be converted to helpers.

        Args:
            func_name: The name of the function being called
            processed_args: The processed arguments to the function

        Returns:
            A dict with the rule structure, or None if this function should not be handled specially
        """
        # Convert location_item_name calls to placement_lookup rule type
        # This is a generic function from worlds/generic/Rules.py used by multiple games
        # location_item_name(state, location_name, player) -> (item_name, player) tuple
        if func_name == 'location_item_name':
            logger.debug(f"BaseGameExportHandler: Converting {func_name} to placement_lookup rule")
            # location_item_name takes (state, location_name, player) - we only need location_name
            if processed_args:
                return {
                    'type': 'placement_lookup',
                    'location': processed_args[0]  # First arg is location name
                }
            else:
                logger.warning(f"BaseGameExportHandler: location_item_name called without location argument")
                return None

        # Convert item_name_in_location_names calls to placement_search rule type
        # This is a generic function from worlds/generic/Rules.py used by multiple games
        # item_name_in_location_names(state, item, player, location_pairs) -> bool
        # After state/player filtering, processed_args contains: [item, location_pairs]
        if func_name == 'item_name_in_location_names':
            logger.debug(f"BaseGameExportHandler: Converting {func_name} to placement_search rule")
            if len(processed_args) >= 2:
                item_arg = processed_args[0]
                locations_arg = processed_args[1]
                # Player is filtered out; use player 1 for single-player exports
                return {
                    'type': 'placement_search',
                    'item': item_arg,
                    'player': {'type': 'constant', 'value': 1},
                    'locations': locations_arg
                }
            else:
                logger.warning(f"BaseGameExportHandler: item_name_in_location_names missing arguments: {processed_args}")
                return None

        return None

    def handle_complex_exit_rule(self, exit_name: str, exit_rule) -> Optional[Dict[str, Any]]:
        """Handle complex exit rules by extracting locations from lambda closures.

        Many games use patterns like set_region_exit_rules() which creates lambdas:
            lambda state: any(location.access_rule(state) for location in locations)
            lambda state: all(location.access_rule(state) for location in locations)

        This method extracts the locations from the lambda's closure and analyzes
        their access rules, combining them with 'or' (any) or 'and' (all).

        Args:
            exit_name: The name of the exit being processed
            exit_rule: The exit's access rule function (lambda)

        Returns:
            A rule dict combining the location access rules, or None to let
            normal analysis proceed
        """
        # Try to extract locations from the lambda's closure
        if hasattr(exit_rule, '__closure__') and exit_rule.__closure__:
            locations = None
            for cell in exit_rule.__closure__:
                try:
                    cell_contents = cell.cell_contents
                    # Check if this is a list of location objects
                    if isinstance(cell_contents, list) and len(cell_contents) > 0:
                        # Check if the first item looks like a location (has access_rule)
                        if hasattr(cell_contents[0], 'access_rule'):
                            locations = cell_contents
                            break
                except (AttributeError, ValueError):
                    continue

            # If we found locations, analyze their access rules
            if locations:
                from exporter.analyzer import analyze_rule
                location_access_rules = []
                player = getattr(self, 'player', 1)

                for location in locations:
                    if hasattr(location, 'access_rule') and location.access_rule:
                        loc_name = getattr(location, 'name', 'Unknown')
                        try:
                            # Get the raw access rule function
                            access_rule_func = location.access_rule

                            # Analyze it with the proper context
                            analyzed_rule = analyze_rule(
                                rule_func=access_rule_func,
                                game_handler=self,
                                player_context=player
                            )

                            if analyzed_rule and analyzed_rule.get('type') != 'error':
                                # Expand the rule using the game handler
                                expanded_rule = self.expand_rule(analyzed_rule)
                                if expanded_rule:
                                    location_access_rules.append(expanded_rule)
                                else:
                                    # If expansion failed, use the analyzed rule as-is
                                    location_access_rules.append(analyzed_rule)
                        except Exception as e:
                            logger.warning(f"Could not analyze location rule for {loc_name}: {e}")
                            # Try to continue with other locations

                # If we got location rules, combine them with 'or' (any pattern)
                if location_access_rules:
                    if len(location_access_rules) == 1:
                        return location_access_rules[0]
                    else:
                        return {'type': 'or', 'conditions': location_access_rules}

        return None  # Let normal analysis proceed

    def should_preserve_as_helper(self, func_name: str) -> bool:
        """
        Check if a function should be preserved as a helper call during rule analysis.

        This prevents the analyzer from recursively analyzing closure variables that
        should remain as helper functions in the exported rules.

        Games can either:
        1. Set the HELPERS_TO_PRESERVE class attribute with a set of helper names
        2. Set AUTO_PRESERVE_COMPUTED_HELPERS = True and list helpers in COMPUTED_HELPERS
        3. Set AUTO_PRESERVE_WHITELISTED_HELPERS = True (default) to auto-preserve
           helpers in HELPERS_TO_EXPORT_WHITELIST
        4. Override this method for custom logic

        Note: Helpers listed in HELPERS_TO_EXPORT_BLACKLIST are automatically preserved,
        since complex helpers that can't be exported also shouldn't be inlined.

        Args:
            func_name: The name of the function being analyzed

        Returns:
            True if the function should be preserved as a helper, False otherwise
        """
        # Check the class attribute for preserved helpers
        if func_name in self.HELPERS_TO_PRESERVE:
            return True

        # Blacklisted helpers are automatically preserved - if a helper is too complex
        # to export as a definition, it shouldn't be inlined during analysis either
        if func_name in self.HELPERS_TO_EXPORT_BLACKLIST:
            return True

        # Check computed helpers if auto-preservation is enabled
        if self.AUTO_PRESERVE_COMPUTED_HELPERS and func_name in self.COMPUTED_HELPERS:
            return True

        # Auto-preserve whitelisted helpers - if a helper is exported as a definition,
        # it typically shouldn't be inlined during analysis either
        if self.AUTO_PRESERVE_WHITELISTED_HELPERS and func_name in self.HELPERS_TO_EXPORT_WHITELIST:
            return True

        return False

    def should_process_multistatement_if_bodies(self) -> bool:
        """
        Check if the analyzer should process if-statements with multiple statements in the body.

        By default, the analyzer only handles simple if-statements with a single statement
        in the body. Some games (like Mario Land 2) have complex if-statements with multiple
        statements that need to be combined into compound conditions.

        Games can either override this method or set PROCESS_MULTISTATEMENT_IF_BODIES = True.

        Returns:
            True if multi-statement if-bodies should be processed, False otherwise
        """
        return self.PROCESS_MULTISTATEMENT_IF_BODIES

    def should_recursively_analyze_closures(self) -> bool:
        """
        Check if the analyzer should recursively analyze closure variable function calls.

        By default, closure variables are converted to helper calls without recursive analysis.
        Some games (like Mario Land 2) need closure variables to be recursively analyzed and
        inlined to properly export complex rule logic.

        Games can either override this method or set RECURSIVELY_ANALYZE_CLOSURES = True.

        Returns:
            True if closure variables should be recursively analyzed, False otherwise
        """
        return self.RECURSIVELY_ANALYZE_CLOSURES

    def should_resolve_options_to_constants(self) -> bool:
        """
        Check if the analyzer should resolve world.options.X.value patterns to constants.

        When True (default), option values like world.options.Difficulty.value are
        resolved to their actual values (e.g., 2) at export time. This results in
        smaller, faster rules but bakes in the specific option configuration.

        When False, option values are kept as option_value references that are
        resolved at runtime by the frontend. This allows rules to work with
        different option configurations.

        The host.yaml setting (json_tools.resolve_options_to_constants) takes
        precedence over the class variable RESOLVE_OPTIONS_TO_CONSTANTS.

        Returns:
            True if options should be resolved to constants, False otherwise
        """
        # Check host.yaml setting first (takes precedence)
        try:
            from worlds.json_tools_installer.json_tools_settings import get_json_tools_settings
            jt = get_json_tools_settings()
            host_setting = getattr(jt, 'resolve_options_to_constants', None)
            if host_setting is not None:
                return host_setting
        except Exception:
            pass  # Fall back to class variable if settings unavailable

        return self.RESOLVE_OPTIONS_TO_CONSTANTS

    # ==========================================================================
    # Unanalyzable rule handling hooks
    # These methods allow game handlers to provide fallback rules when the
    # analyzer cannot fully analyze complex rule patterns.
    # ==========================================================================

    def is_unanalyzable_rule_pattern(self, func: Callable) -> bool:
        """Check if a function matches a known unanalyzable rule pattern.

        This is called by the analyzer when it encounters a callable that
        cannot be analyzed normally. Game handlers can override this to
        identify game-specific patterns (e.g., ALttP bunny rules).

        Args:
            func: The function object to check

        Returns:
            True if this is a known unanalyzable pattern that should use fallback
        """
        return False  # Base implementation: no special patterns

    def get_unanalyzable_rule_fallback(self, func: Optional[Callable] = None) -> Optional[Dict[str, Any]]:
        """Get the fallback rule for an unanalyzable rule pattern.

        This is called when is_unanalyzable_rule_pattern() returns True or
        when rule analysis fails completely. Game handlers can override this
        to provide game-specific fallback rules.

        The base implementation uses class attributes:
        - If PERMISSIVE_LOGIC_OPTION_NAME is set and permissive logic is enabled,
          returns True (always accessible)
        - Otherwise returns Has(UNANALYZABLE_RULE_FALLBACK_ITEM) if set
        - Otherwise returns None (no fallback)

        Args:
            func: Optional function that failed analysis (for context)

        Returns:
            Fallback rule dict, or None if no fallback available
        """
        # Check if permissive logic mode is enabled
        if self.PERMISSIVE_LOGIC_OPTION_NAME and self.PERMISSIVE_LOGIC_OPTION_VALUES:
            if self.world and hasattr(self.world, 'options'):
                option = getattr(self.world.options, self.PERMISSIVE_LOGIC_OPTION_NAME, None)
                if option is not None:
                    current_value = str(getattr(option, 'current_key', ''))
                    if current_value in self.PERMISSIVE_LOGIC_OPTION_VALUES:
                        # In permissive logic modes, return True as fallback
                        return {'type': 'constant', 'value': True}

        # Fall back to item requirement if configured
        if self.UNANALYZABLE_RULE_FALLBACK_ITEM:
            return {'type': 'item_check', 'item': self.UNANALYZABLE_RULE_FALLBACK_ITEM, 'count': 1}

        return None

    def get_known_items_for_bytecode(self) -> Set[str]:
        """Get the set of known items for bytecode-based analysis.

        The analyzer uses this when falling back to bytecode analysis to
        identify item check patterns. Only items in this set are recognized.

        Games can override this or set KNOWN_ITEMS_FOR_BYTECODE_ANALYSIS.

        Returns:
            Set of known item names
        """
        return self.KNOWN_ITEMS_FOR_BYTECODE_ANALYSIS

    def get_bytecode_helper_expansion(self, helper_name: str) -> List[str]:
        """Get the item list expansion for a helper seen in bytecode.

        When the analyzer encounters a helper name (e.g., 'has_sword') in
        bytecode, it can expand to HasAny(items=expansion). Games can
        configure this via BYTECODE_HELPER_EXPANSIONS.

        Args:
            helper_name: The helper function name seen in bytecode

        Returns:
            List of item names to expand to, or empty list if not configured
        """
        return self.BYTECODE_HELPER_EXPANSIONS.get(helper_name, [])

    def get_known_option_names(self) -> Set[str]:
        """Get the set of known option names for bytecode-based analysis.

        The analyzer uses this when falling back to bytecode analysis to
        identify option access patterns like:
            world.worlds[player].options.open_pyramid

        Games can override this or set KNOWN_OPTION_NAMES.

        Returns:
            Set of known option names
        """
        return self.KNOWN_OPTION_NAMES

    def handle_game_specific_state_method(
        self,
        method_name: str,
        args: List[Any],
        world: Any
    ) -> Optional[Dict[str, Any]]:
        """Handle a game-specific state method call.

        This is called by the analyzer when it encounters a state method
        that might need game-specific handling. For example, ALttP's
        _lttp_has_key method needs special handling for universal keys.

        Args:
            method_name: The name of the state method (e.g., '_lttp_has_key')
            args: The processed arguments to the method
            world: The world object for option access

        Returns:
            Rule dict if this method should be handled specially, None otherwise
        """
        return None  # Base implementation: no special handling

    def get_effective_item_type(self, item_name: str, original_type: Any) -> Any:
        """
        Get the effective type for an item, considering game-specific event item rules.

        Args:
            item_name: The name of the item
            original_type: The original type from the item object

        Returns:
            The effective type that should be used for export
        """
        # Default implementation: return the original type
        return original_type

    # ==========================================================================
    # Item and progression data methods
    # ==========================================================================

    @staticmethod
    def _classification_to_string(classification) -> str:
        """Convert ItemClassification to string, preserving modifiers like skip_balancing.

        This mirrors the logic in exporter/exporter.py classification_to_string().
        """
        from BaseClasses import ItemClassification

        # Check compound classifications first (order matters!)
        if classification == ItemClassification.progression_deprioritized_skip_balancing:
            return "progression_deprioritized_skip_balancing"
        if classification == ItemClassification.progression_skip_balancing:
            return "progression_skip_balancing"
        if classification == ItemClassification.progression_deprioritized:
            return "progression_deprioritized"

        # Check simple classifications
        if classification == ItemClassification.progression:
            return "progression"
        if classification == ItemClassification.useful:
            return "useful"
        if classification == ItemClassification.trap:
            return "trap"
        if classification == ItemClassification.filler:
            return "filler"

        # Fallback for combined classifications (e.g., progression|useful)
        if ItemClassification.progression in classification:
            return "progression"
        if ItemClassification.useful in classification:
            return "useful"
        if ItemClassification.trap in classification:
            return "trap"

        # Check if the classification has a name attribute
        if hasattr(classification, 'name'):
            return classification.name

        return str(classification)

    def get_item_data(self, world) -> Dict[str, Dict[str, Any]]:
        """
        Return item data with classification flags.

        This method auto-discovers items from world.item_name_to_id and determines
        their classification by checking the item pool and placed items.
        Game-specific handlers can override this for custom item data.
        """
        from BaseClasses import ItemClassification
        from exporter.exporter import classification_to_string

        item_data = {}

        # Get items from world.item_name_to_id if available
        if hasattr(world, 'item_name_to_id'):
            for item_name, item_id in world.item_name_to_id.items():
                # Try to get classification from item class
                is_advancement = False
                is_useful = False
                is_trap = False
                item_classification = ItemClassification.filler  # Default

                try:
                    item_class = getattr(world, 'item_name_to_item', {}).get(item_name)
                    if item_class and hasattr(item_class, 'classification'):
                        item_classification = item_class.classification
                        # Use 'in' operator to handle combined flags like progression|useful
                        is_advancement = ItemClassification.progression in item_classification
                        is_useful = ItemClassification.useful in item_classification
                        is_trap = ItemClassification.trap in item_classification
                except Exception as e:
                    logger.debug(f"Could not determine classification for {item_name}: {e}")
                    # Fallback: check item pool if available
                    if hasattr(world, 'multiworld'):
                        for item in world.multiworld.itempool:
                            if item.player == world.player and item.name == item_name:
                                item_classification = item.classification
                                # Use 'in' operator to handle combined flags like progression|useful
                                is_advancement = ItemClassification.progression in item_classification
                                is_useful = ItemClassification.useful in item_classification
                                is_trap = ItemClassification.trap in item_classification
                                break

                        # Additional fallback: check placed items in locations
                        if item_classification is None:
                            for location in world.multiworld.get_locations(world.player):
                                if (location.item and location.item.player == world.player and
                                    location.item.name == item_name and location.item.code is not None):
                                    item_classification = location.item.classification
                                    # Use 'in' operator to handle combined flags like progression|useful
                                    is_advancement = ItemClassification.progression in item_classification
                                    is_useful = ItemClassification.useful in item_classification
                                    is_trap = ItemClassification.trap in item_classification
                                    break

                # Get groups if available
                groups = []
                if hasattr(world, 'item_name_groups'):
                    groups = [
                        group_name for group_name, items in world.item_name_groups.items()
                        if item_name in items
                    ]

                # Get custom item type from game handler if available
                item_type = None
                if hasattr(self, 'get_item_type_for_name'):
                    try:
                        item_type = self.get_item_type_for_name(item_name, world)
                    except Exception as e:
                        logger.debug(f"Error getting custom type for {item_name}: {e}")

                # Build item data with actual classification string (preserves compound types)
                item_entry = {
                    'name': item_name,
                    'id': item_id,
                    'groups': sorted(groups),
                    'classification': self._classification_to_string(item_classification),
                    'advancement': is_advancement,
                    'useful': is_useful,
                    'trap': is_trap,
                    'type': item_type,
                    'max_count': 1
                }
                # Add classification string if we found one (preserves progression_skip_balancing, etc.)
                if item_classification is not None:
                    item_entry['classification'] = classification_to_string(item_classification)
                item_data[item_name] = item_entry

        # Handle dynamically created event items by scanning locations
        # Some games (like Mario Land 2) place items with item.code = None, converting
        # them to events at runtime. We need to detect these and update the item data.
        if hasattr(world, 'multiworld'):
            for location in world.multiworld.get_locations(world.player):
                if location.item and location.item.player == world.player:
                    item_name = location.item.name
                    item_classification = location.item.classification

                    # Check if this is an event item (no code/ID)
                    if location.item.code is None and hasattr(location.item, 'classification'):
                        if item_name not in item_data:
                            # New event item not in item_name_to_id
                            item_data[item_name] = {
                                'name': item_name,
                                'id': None,
                                'groups': ['Event'],
                                'classification': self._classification_to_string(item_classification),
                                # Use 'in' operator to handle combined flags like progression|useful
                                'advancement': ItemClassification.progression in item_classification,
                                'useful': ItemClassification.useful in item_classification,
                                'trap': ItemClassification.trap in item_classification,
                                'classification': classification_to_string(item_classification),
                                'event': True,
                                'type': 'Event',
                                'max_count': 1
                            }
                        else:
                            # Item exists but was placed as an event - mark as event but preserve ID
                            # Some items have valid IDs in item_name_to_id but may be placed as events
                            # in certain configurations. We preserve the ID so the worldgen world
                            # knows all possible item IDs, even for items that may sometimes be events.
                            if not item_data[item_name].get('event', False):
                                logger.debug(f"Marking {item_name} as event based on runtime placement (item.code=None), preserving original ID")
                                item_data[item_name]['event'] = True
                                item_data[item_name]['type'] = 'Event'
                                # NOTE: We intentionally do NOT set id=None here.
                                # The item's ID from item_name_to_id should be preserved so the
                                # worldgen world knows all possible item IDs for UT compatibility.
                                item_data[item_name]['classification'] = self._classification_to_string(item_classification)
                                item_data[item_name]['advancement'] = ItemClassification.progression in item_classification
                                item_data[item_name]['useful'] = ItemClassification.useful in item_classification
                                item_data[item_name]['trap'] = ItemClassification.trap in item_classification
                                item_data[item_name]['classification'] = classification_to_string(item_classification)
                                if 'Event' not in item_data[item_name]['groups']:
                                    item_data[item_name]['groups'].append('Event')
                                    item_data[item_name]['groups'].sort()

        # Extract hint_text from item_table if available
        # Many games (WorldGen or original) define hint_text in their item_table structure
        # First try world-level item_table attribute
        item_table = getattr(world, 'item_table', None)
        # If not found, try importing from the world's module
        if item_table is None:
            try:
                world_module = type(world).__module__
                base_module = '.'.join(world_module.split('.')[:2])  # e.g., "worlds.alttp"
                items_module = importlib.import_module(f"{base_module}.Items")
                item_table = getattr(items_module, 'item_table', None)
            except (ImportError, AttributeError):
                pass

        if item_table:
            for item_name, item_entry in item_data.items():
                if item_name in item_table:
                    table_data = item_table[item_name]
                    # Try to get hint_text from the table data
                    hint_text = getattr(table_data, 'hint_text', None)
                    if hint_text and hint_text != item_name and 'hint_text' not in item_entry:
                        item_entry['hint_text'] = hint_text

        # Return sorted by item ID to ensure consistent ordering
        # Items with None ID (events) will be placed at the end
        return dict(sorted(item_data.items(), key=lambda x: (x[1].get('id') is None, x[1].get('id'))))

    def get_item_max_counts(self, world) -> Dict[str, int]:
        """
        Return game-specific maximum counts for certain items.
        """
        return {}

    def get_progression_mapping(self, world) -> Dict[str, Any]:
        """Return game-specific progression item mapping data.

        This method auto-detects progressive items by probing the world's
        collect_item method at runtime. This approach doesn't rely on naming
        conventions - it uses the actual game behavior to discover which items
        are progressive and what concrete items they map to.

        Game-specific handlers can override this method if they need custom
        logic (e.g., for additive progression like REP or Time Shards).

        Returns:
            Dict mapping progressive item names to their progression data:
            {
                "Progressive Sword": {
                    "items": [
                        {"name": "Fighter Sword", "level": 1},
                        {"name": "Master Sword", "level": 2},
                        ...
                    ],
                    "base_item": "Progressive Sword"
                },
                ...
            }
        """
        # First, try runtime probing (works for advancement items)
        mapping = self._probe_collect_item_for_progression(world)

        # Then, try to find additional mappings from module-level data structures
        # This catches non-advancement progressive items that collect_item skips
        module_mapping = self._find_module_progression_data(world)

        # Merge: module data fills in gaps from runtime probing
        for prog_name, data in module_mapping.items():
            if prog_name not in mapping:
                mapping[prog_name] = data
                logger.debug(f"Added {prog_name} from module data (not found via probing)")

        return mapping

    def _find_module_progression_data(self, world) -> Dict[str, Any]:
        """Find progression mapping from module-level data structures.

        Different games store progression data in different formats:
        - progression_mapping dict in Items.py (concrete -> (progressive, level))
        - progressive_technology_table (progressive -> object with .progressive tuple)
        - progressive_item_list (progressive -> [concrete_items])

        Returns:
            Dict with progression mapping in the standard format
        """
        mapping_data: Dict[str, Any] = {}

        # Get the world's module
        world_module = type(world).__module__
        base_module = '.'.join(world_module.split('.')[:2])  # e.g., "worlds.mygame"

        # Try different known patterns
        mapping_data.update(self._try_progression_mapping_pattern(base_module))
        mapping_data.update(self._try_progressive_table_pattern(base_module))
        mapping_data.update(self._try_progressive_list_pattern(base_module))

        return mapping_data

    def _try_progression_mapping_pattern(self, base_module: str) -> Dict[str, Any]:
        """Try progression_mapping dict pattern from Items.py.

        Format: concrete_item -> (progressive_item, level)
        """
        try:
            items_module = importlib.import_module(f"{base_module}.Items")
            if not hasattr(items_module, 'progression_mapping'):
                return {}

            progression_mapping = getattr(items_module, 'progression_mapping')
            if not isinstance(progression_mapping, dict):
                return {}

            # Convert: {concrete: (progressive, level)} -> {progressive: {items: [...]}}
            mapping_data: Dict[str, Any] = {}
            for concrete_item, (progressive_item, level) in progression_mapping.items():
                if progressive_item not in mapping_data:
                    mapping_data[progressive_item] = {
                        'items': [],
                        'base_item': progressive_item
                    }
                mapping_data[progressive_item]['items'].append({
                    'name': concrete_item,
                    'level': level
                })

            # Sort items by level
            for prog_data in mapping_data.values():
                prog_data['items'].sort(key=lambda x: x['level'])

            if mapping_data:
                logger.debug(f"Found {len(mapping_data)} progressive items via progression_mapping pattern")

            return mapping_data

        except ImportError:
            return {}
        except Exception as e:
            logger.debug(f"Error trying progression_mapping pattern: {e}")
            return {}

    def _try_progressive_table_pattern(self, base_module: str) -> Dict[str, Any]:
        """Try progressive_technology_table pattern.

        Format: progressive_item -> object with .progressive tuple attribute
        """
        try:
            # Try importing from Technologies submodule first
            try:
                tech_module = importlib.import_module(f"{base_module}.Technologies")
                if hasattr(tech_module, 'progressive_technology_table'):
                    prog_table = getattr(tech_module, 'progressive_technology_table')
                else:
                    return {}
            except ImportError:
                # Try main module
                main_module = importlib.import_module(base_module)
                if hasattr(main_module, 'progressive_technology_table'):
                    prog_table = getattr(main_module, 'progressive_technology_table')
                else:
                    return {}

            if not isinstance(prog_table, dict):
                return {}

            # Convert: {progressive: Technology(progressive=tuple)} -> standard format
            mapping_data: Dict[str, Any] = {}
            for prog_name, tech_data in prog_table.items():
                # Check if it has a progressive attribute (tuple of concrete items)
                progressive_tuple = getattr(tech_data, 'progressive', None)
                if not progressive_tuple:
                    continue

                mapping_data[prog_name] = {
                    'items': [
                        {'name': name, 'level': level}
                        for level, name in enumerate(progressive_tuple, 1)
                    ],
                    'base_item': prog_name
                }

            if mapping_data:
                logger.debug(f"Found {len(mapping_data)} progressive items via progressive_table pattern")

            return mapping_data

        except ImportError:
            return {}
        except Exception as e:
            logger.debug(f"Error trying progressive_table pattern: {e}")
            return {}

    def _try_progressive_list_pattern(self, base_module: str) -> Dict[str, Any]:
        """Try progressive_item_list dict pattern.

        Format: progressive_item -> [concrete_items in order]
        """
        try:
            # Try main module first
            main_module = importlib.import_module(base_module)

            # Look for progressive_item_list
            if hasattr(main_module, 'progressive_item_list'):
                prog_list = getattr(main_module, 'progressive_item_list')
            else:
                # Try Items submodule
                try:
                    items_module = importlib.import_module(f"{base_module}.Items")
                    if hasattr(items_module, 'progressive_item_list'):
                        prog_list = getattr(items_module, 'progressive_item_list')
                    else:
                        return {}
                except ImportError:
                    return {}

            if not isinstance(prog_list, dict):
                return {}

            # Convert: {progressive: [concrete_items]} -> standard format
            mapping_data: Dict[str, Any] = {}
            for prog_name, concrete_items in prog_list.items():
                if not isinstance(concrete_items, (list, tuple)):
                    continue

                mapping_data[prog_name] = {
                    'items': [
                        {'name': name, 'level': level}
                        for level, name in enumerate(concrete_items, 1)
                    ],
                    'base_item': prog_name
                }

            if mapping_data:
                logger.debug(f"Found {len(mapping_data)} progressive items via progressive_list pattern")

            return mapping_data

        except ImportError:
            return {}
        except Exception as e:
            logger.debug(f"Error trying progressive_list pattern: {e}")
            return {}

    def _probe_collect_item_for_progression(self, world) -> Dict[str, Any]:
        """Discover progressive items by probing collect_item behavior.

        This method creates a mock collection state and repeatedly calls
        collect_item to discover which items are progressive and what
        concrete items they resolve to at each level.

        Args:
            world: The world instance to probe

        Returns:
            Dict with progression mapping in the standard format
        """
        # Check if the world has overridden collect_item
        # If not, there are no progressive items to discover
        try:
            from worlds.AutoWorld import World as BaseWorld
            if type(world).collect_item is BaseWorld.collect_item:
                logger.debug(f"{world.game}: No custom collect_item, skipping progression probe")
                return {}
        except ImportError:
            logger.warning("Could not import AutoWorld.World for collect_item check")
            return {}

        # Get the player ID
        player = getattr(world, 'player', 1)

        # Create a minimal mock state that satisfies collect_item requirements
        class MockCollectionState:
            """Minimal mock state for probing collect_item behavior."""

            def __init__(self, player_id: int):
                self.prog_items = {player_id: Counter()}
                self._player = player_id

            def has(self, item_name: str, player: int, count: int = 1) -> bool:
                """Check if player has at least count of item_name."""
                return self.prog_items.get(player, Counter())[item_name] >= count

            def count(self, item_name: str, player: int) -> int:
                """Count how many of item_name the player has."""
                return self.prog_items.get(player, Counter())[item_name]

            def has_group(self, group: str, player: int, count: int = 1) -> bool:
                """Mock has_group - returns False for probing purposes."""
                return False

            def has_any(self, items: Set[str], player: int) -> bool:
                """Check if player has any of the items."""
                return any(self.has(item, player) for item in items)

            def has_all(self, items: Set[str], player: int) -> bool:
                """Check if player has all of the items."""
                return all(self.has(item, player) for item in items)

        # Track discovered progressions: progressive_item -> [concrete_items in order]
        progressions: Dict[str, List[str]] = {}

        # Get all item names the world can create
        item_names = list(getattr(world, 'item_name_to_id', {}).keys())

        for item_name in item_names:
            try:
                item = world.create_item(item_name)
            except Exception as e:
                logger.debug(f"Could not create item '{item_name}': {e}")
                continue

            # Skip items that can't possibly be progressive
            # (We probe all items, not just advancement, because some games like
            # Factorio have progressive items classified as filler/useful)

            # Create fresh state for each item probe
            mock_state = MockCollectionState(player)
            chain: List[str] = []

            # Collect the item repeatedly to build the progression chain
            # Max 20 levels should be more than enough for any game
            for _ in range(20):
                try:
                    result = world.collect_item(mock_state, item, remove=False)
                except Exception as e:
                    logger.debug(f"Error probing collect_item for '{item_name}': {e}")
                    break

                if result is None:
                    # Item no longer grants anything (reached max level)
                    break

                if result == item_name:
                    # Item returns its own name - not a progressive item
                    break

                if result in chain:
                    # Already seen this result - we've reached max level
                    # (collect_item returns the same item when at max)
                    break

                # This is a progressive item! Record the concrete item
                chain.append(result)

                # Add to mock state so next iteration gets the next level
                mock_state.prog_items[player][result] += 1

            if chain:
                progressions[item_name] = chain
                logger.debug(f"Discovered progression: {item_name} -> {chain}")

        # Convert to the standard output format
        mapping_data: Dict[str, Any] = {}

        # First pass: create basic mapping
        for progressive_name, concrete_items in progressions.items():
            mapping_data[progressive_name] = {
                'items': [
                    {'name': name, 'level': level}
                    for level, name in enumerate(concrete_items, 1)
                ],
                'base_item': progressive_name
            }

        # Second pass: detect progressive items that share the same concrete items
        # and set their base_item to the "canonical" one (first alphabetically)
        # This handles cases like Progressive Bow / Progressive Bow (Alt) which
        # both resolve to Bow -> Silver Bow and should count together
        concrete_to_progressives: Dict[tuple, List[str]] = {}
        for progressive_name, concrete_items in progressions.items():
            key = tuple(concrete_items)
            if key not in concrete_to_progressives:
                concrete_to_progressives[key] = []
            concrete_to_progressives[key].append(progressive_name)

        # For groups with multiple progressive items sharing same concrete items,
        # set base_item to the canonical (first alphabetically) name
        for concrete_key, progressive_names in concrete_to_progressives.items():
            if len(progressive_names) > 1:
                # Sort to get canonical name (first alphabetically)
                canonical = sorted(progressive_names)[0]
                for prog_name in progressive_names:
                    mapping_data[prog_name]['base_item'] = canonical
                logger.debug(
                    f"Grouped progressive items with shared concrete items: "
                    f"{progressive_names} -> base_item='{canonical}'"
                )

        if mapping_data:
            logger.info(f"{world.game}: Auto-detected {len(mapping_data)} progressive item(s)")

        return mapping_data

    # ==========================================================================
    # Exporter settings and game info methods
    # ==========================================================================

    def get_exporter_settings(self) -> Dict[str, Any]:
        """Get exporter-specific settings (not part of the Archipelago world).

        These settings control how the frontend processes the exported data.
        Only non-default values are included to keep the output minimal.
        """
        exporter_settings = {}

        # assume_bidirectional_exits: Whether region connections are bidirectional by default
        # Only include when explicitly set (True or False); omitting allows frontend auto-detection
        if self.ASSUME_BIDIRECTIONAL_EXITS is not None:
            exporter_settings['assume_bidirectional_exits'] = self.ASSUME_BIDIRECTIONAL_EXITS

        # use_resolved_items: When true, eventProcessor uses resolved_items
        # Default is False, so only include when True
        if self.USE_RESOLVED_ITEMS:
            exporter_settings['use_resolved_items'] = True

        # add_sphere_items_upfront: When true, adds items at the start of each sphere before accessibility checks
        if self.ADD_SPHERE_ITEMS_UPFRONT:
            exporter_settings['add_sphere_items_upfront'] = True

        # use_auto_indirect_conditions: When true, use auto sweep for indirect region dependencies
        if self.USE_AUTO_INDIRECT_CONDITIONS:
            exporter_settings['use_auto_indirect_conditions'] = True

        return exporter_settings

    def get_game_info(self, world) -> Dict[str, Any]:
        """
        Get game-specific information for the frontend.

        This method is for game-specific custom data and accumulator patterns.
        Game-specific expanders can override this to add custom data.

        Accumulator rules can be set via:
        1. Class attribute ACCUMULATOR_RULES (preferred for game-specific exporters)
        2. World attribute accumulator_rules (for dynamically generated worlds)

        Initial prog_items values can be set via:
        1. Class attribute PROG_ITEMS_INIT (preferred for game-specific exporters)
        2. World attribute prog_items_init (for dynamically generated worlds)

        Note: Base fields have been moved to other methods:
        - name (game) -> world[player].game in get_world_data()
        - slot_data, base_id, world_description, web -> get_world_data()
        - rule_format -> get_exporter_settings()

        Returns:
            A dictionary with game-specific information for the frontend.
        """
        game_info = {}

        # Use class-level ACCUMULATOR_RULES if defined, otherwise check world attribute
        if self.ACCUMULATOR_RULES:
            game_info['accumulator_rules'] = self.ACCUMULATOR_RULES
        elif hasattr(world, 'accumulator_rules') and world.accumulator_rules:
            game_info['accumulator_rules'] = world.accumulator_rules

        # For prog_items_init, worldgen worlds get priority for world attribute
        # because worldgen worlds may pre-compute accumulator initial values.
        # For non-worldgen worlds, class attribute takes priority.
        if self.is_worldgen_world(world) and hasattr(world, 'prog_items_init') and world.prog_items_init:
            game_info['prog_items_init'] = dict(world.prog_items_init)
        elif self.PROG_ITEMS_INIT:
            game_info['prog_items_init'] = dict(self.PROG_ITEMS_INIT)
        elif hasattr(world, 'prog_items_init') and world.prog_items_init:
            game_info['prog_items_init'] = dict(world.prog_items_init)

        # Export completion_condition if available and non-trivial
        try:
            completion_func = world.multiworld.completion_condition.get(world.player)
            if completion_func is not None:
                from BaseClasses import CollectionState
                empty_state = CollectionState(world.multiworld)
                if not completion_func(empty_state):  # Non-trivial condition
                    # Check if this is a Rule Builder Resolved rule with native serialization
                    if hasattr(completion_func, 'to_dict') and callable(completion_func.to_dict):
                        from exporter.exporter import _make_rule_dict_serializable
                        rb_dict = completion_func.to_dict()
                        rb_dict = _make_rule_dict_serializable(rb_dict)
                        if hasattr(self, 'expand_rule'):
                            rb_dict = self.expand_rule(rb_dict)
                        game_info['completion_condition'] = rb_dict
                    else:
                        from exporter.analyzer import analyze_rule
                        from exporter.games.base.utilities import extract_closure_vars
                        closure_vars = extract_closure_vars(completion_func)
                        closure_vars.setdefault('world', world)
                        closure_vars.setdefault('self', world)
                        result = analyze_rule(rule_func=completion_func, closure_vars=closure_vars,
                                              game_handler=self, player_context=world.player)
                        if result and result.get('type') != 'error':
                            game_info['completion_condition'] = result
        except Exception as e:
            import logging
            logging.getLogger('exporter').debug(f"Could not export completion_condition: {e}")

        return game_info

    def get_required_fields(self) -> List[str]:
        """
        Get list of required fields for a complete game export.

        Returns:
            A list of field names that must be included in the export.
        """
        return ['region_name', 'locations', 'entrances']

    def get_all_worlds(self) -> List[Any]:
        """
        Get all worlds associated with this helper.
        This is typically used to access game-specific data and logic.

        Returns:
            A list of world objects.
        """
        return []

    # ==========================================================================
    # Helper module configuration methods
    # ==========================================================================

    def get_helpers_to_export_whitelist(self) -> Set[str]:
        """
        Return a set of helper function names that SHOULD be exported as definitions.

        When this returns a non-empty set, only these helpers will be exported as
        definitions in the rules.json. All other helpers will remain as helper calls
        that the frontend must implement.

        Returns:
            A set of helper function names to export as definitions.
        """
        return self.HELPERS_TO_EXPORT_WHITELIST

    def get_helpers_to_export_blacklist(self) -> Set[str]:
        """
        Return a set of helper function names that should NOT be exported as definitions.

        When this returns a non-empty set, these helpers will NOT be exported as
        definitions even if they would otherwise be eligible. This is useful when
        most helpers can be exported but a few are too complex.

        The blacklist is checked after the whitelist.

        Returns:
            A set of helper function names to NOT export as definitions.
        """
        return self.HELPERS_TO_EXPORT_BLACKLIST

    def get_helper_modules(self) -> List[str]:
        """
        Return a list of module paths containing helper functions.

        When AUTO_DISCOVER_WORLD_HELPER_MODULES is True, this method automatically
        includes all Python files from the game's world directory as potential
        helper modules. Non-callable objects (like lists, dicts) are filtered out
        at the helper retrieval stage, so it's safe to include all modules.

        Returns:
            A list of module paths (e.g., ['worlds.shapez.regions'])
        """
        # Start with manually specified modules
        modules = list(self.HELPER_MODULES)

        # Auto-discover helper modules from world directory if enabled
        if self.AUTO_DISCOVER_WORLD_HELPER_MODULES and self.world is not None:
            try:
                # Get the world class module path (e.g., 'worlds.mlss')
                world_module = type(self.world).__module__
                # Handle nested module paths - get the top-level world module
                # e.g., 'worlds.mlss.something' -> 'worlds.mlss'
                parts = world_module.split('.')
                if len(parts) >= 2 and parts[0] == 'worlds':
                    base_world_module = '.'.join(parts[:2])  # 'worlds.mlss'

                    # Get the directory path for this module
                    try:
                        world_pkg = __import__(base_world_module, fromlist=[''])
                        if hasattr(world_pkg, '__path__'):
                            world_dir = Path(world_pkg.__path__[0])

                            # Find all Python files in this directory
                            # Skip GUI/client modules that have display dependencies
                            skip_patterns = ('gui', 'client', 'kivy', 'kvui')
                            for py_file in world_dir.glob('*.py'):
                                if py_file.name.startswith('_'):
                                    continue  # Skip __init__.py, __pycache__, etc.

                                # Skip GUI/client modules to avoid importing display dependencies
                                name_lower = py_file.name.lower()
                                if any(pattern in name_lower for pattern in skip_patterns):
                                    logger.debug(f"Skipping GUI/client module: {py_file.name}")
                                    continue

                                module_name = py_file.stem  # e.g., 'StateLogic'

                                # Convert to module path
                                full_module_path = f"{base_world_module}.{module_name}"

                                # Add if not already in the list
                                if full_module_path not in modules:
                                    modules.append(full_module_path)
                                    logger.debug(f"Auto-discovered helper module: {full_module_path}")
                    except ImportError as e:
                        logger.debug(f"Could not import world package for helper discovery: {e}")
            except Exception as e:
                logger.debug(f"Error during helper module auto-discovery: {e}")

        return modules

    def get_item_name_modules(self) -> List[str]:
        """
        Return a list of module paths containing item name constants.

        Returns:
            A list of module paths (e.g., ['worlds.shapez.data.strings'])
        """
        return self.ITEM_NAME_MODULES

    # ==========================================================================
    # Pre/post processing hooks
    # ==========================================================================

    def preprocess_world_data(self, world, export_data: Dict[str, Any], player: int) -> None:
        """
        Preprocess game-specific data before region processing.
        This is called early in the export process to set up any necessary data.

        For worldgen worlds, discovers helper functions from Rules.py and marks
        them as auto-preserved to prevent incorrect pattern-based expansion
        during region processing.

        Args:
            world: The world object for this player
            export_data: The export data dictionary being built
            player: The player number

        Returns:
            None (modifies export_data in place)
        """
        # For worldgen worlds, discover helpers early so they are auto-preserved
        # before expand_rule() processes location rules in process_regions().
        # Without this, _expand_helper_by_pattern() incorrectly converts
        # helpers like "has_fire_arrows" to Has("Fire_Arrows") via pattern matching.
        if self.is_worldgen_world(world):
            self._discover_worldgen_helpers_for_preservation(world)

    def _discover_worldgen_helpers_for_preservation(self, world) -> None:
        """Discover helper function names from a worldgen Rules.py and auto-preserve them.

        This must run before process_regions() so that expand_rule() knows not to
        pattern-expand these helpers during location rule processing.
        """
        try:
            world_module = type(world).__module__
            rules_module_name = world_module + '.Rules'
            rules_module = importlib.import_module(rules_module_name)
        except ImportError:
            logger.debug("Could not import worldgen Rules module for helper preservation")
            return

        count = 0
        for name in dir(rules_module):
            if name.startswith('__'):
                continue

            obj = getattr(rules_module, name)

            if getattr(obj, '_internal_function', False):
                continue
            if not callable(obj) or not hasattr(obj, '__code__'):
                continue

            # Check if this looks like a helper function (has state and player params)
            code = obj.__code__
            if code.co_argcount < 2:
                continue

            varnames = code.co_varnames[:code.co_argcount]
            if len(varnames) < 2 or varnames[0] != 'state' or varnames[1] != 'player':
                continue

            # Strip worldgen prefix to get the canonical helper name
            helper_name = name
            if name.startswith('_') and 'worldgen_' in name:
                prefix_end = name.find('worldgen_') + len('worldgen_')
                helper_name = name[prefix_end:]

            self.register_auto_preserved_helper(helper_name)
            count += 1

        if count:
            logger.debug(f"Auto-preserved {count} worldgen helpers for pattern expansion prevention")

    def post_process_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Post-process the exported data after all standard processing is complete.
        This is called at the end of the export process to allow game-specific modifications.

        When PROG_ITEMS_INIT and ACCUMULATOR_ITEM_GROUP are set, this method:
        1. Creates accumulator target items (e.g., " coins") from PROG_ITEMS_INIT keys
        2. Finds items matching ACCUMULATOR_RULES patterns in locations
        3. Configures all matching items with the specified group and type

        Args:
            data: The complete export data dictionary

        Returns:
            The modified export data dictionary
        """
        import re

        # Auto-generate accumulator items if configured
        if self.PROG_ITEMS_INIT and self.ACCUMULATOR_ITEM_GROUP:
            group = self.ACCUMULATOR_ITEM_GROUP
            item_type = self.ACCUMULATOR_ITEM_TYPE or group
            max_count = self.ACCUMULATOR_TARGET_MAX_COUNT

            def make_accumulator_item(name: str, is_target: bool = False) -> Dict[str, Any]:
                return {
                    'name': name, 'id': None, 'groups': [group],
                    'advancement': True, 'useful': False, 'trap': False,
                    'type': item_type,
                    'max_count': max_count if is_target else 1
                }

            accumulator_items: Dict[str, Dict[str, Dict[str, Any]]] = {}

            # Step 1: Create accumulator target items from PROG_ITEMS_INIT
            for player_id in data.get('regions', {}).keys():
                accumulator_items[player_id] = {}
                for target_name in self.PROG_ITEMS_INIT.keys():
                    accumulator_items[player_id][target_name] = make_accumulator_item(
                        target_name, is_target=True
                    )

            # Step 2: Find items matching ACCUMULATOR_RULES patterns in locations
            patterns = [rule.get('pattern') for rule in self.ACCUMULATOR_RULES if rule.get('pattern')]
            if patterns:
                for player_id, regions in data.get('regions', {}).items():
                    for region_data in regions.values():
                        for location in region_data.get('locations', []):
                            item_name = location.get('item', {}).get('name', '')
                            if not item_name:
                                continue
                            # Check if item matches any accumulator pattern
                            for pattern in patterns:
                                if pattern and re.match(pattern, item_name):
                                    if item_name not in accumulator_items.get(player_id, {}):
                                        accumulator_items.setdefault(player_id, {})[item_name] = (
                                            make_accumulator_item(item_name)
                                        )
                                    break  # Only match first pattern

            # Step 3: Merge accumulator items into data (only add items that don't already exist)
            if accumulator_items:
                data.setdefault('items', {})
                for player_id, player_items in accumulator_items.items():
                    existing_items = data['items'].setdefault(player_id, {})
                    for item_name, item_data in player_items.items():
                        # Only add if item doesn't already exist (preserve existing items with proper IDs)
                        if item_name not in existing_items:
                            existing_items[item_name] = item_data

        return data
