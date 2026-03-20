"""Helper function discovery and analysis mixin for game export handlers.

This module handles discovering, analyzing, and exporting helper functions
used in game rules.
"""

import enum
import importlib
import inspect
import logging
from typing import Any, Callable, Dict, List, Optional, Set, TYPE_CHECKING

from exporter.constants import MAX_HELPER_DISCOVERY_ITERATIONS

logger = logging.getLogger(__name__)


class HelperDiscoveryMixin:
    """Mixin providing helper function discovery and analysis methods."""

    # These attributes are expected to be defined on the main handler class
    world: Any
    _discovered_helpers: Set[str]
    _discovered_helper_modules: Dict[str, str]
    _auto_preserved_helpers: Set[str]
    _analyzed_helper_cache: Dict[str, Any]
    AUTO_EXPORT_DISCOVERED_HELPERS: bool
    HELPER_PARAM_MAPPINGS: Dict[str, Dict[str, str]]
    ITEM_NAME_MODULES: List[str]

    if TYPE_CHECKING:
        DICT_SUM_HELPERS: Dict[str, str]
        def get_discovered_param_mappings(self, helper_name: Optional[str] = None) -> Dict[str, Any]: ...

    def _analyze_worldgen_helpers(self, rules_module, world) -> Dict[str, Any]:
        """
        Analyze helper functions from a worldgen Rules.py module.

        Worldgen worlds have helper functions defined as Python code in their Rules.py.
        This method finds all helper functions (those starting with '_' and taking
        state/player args) and analyzes them to produce AST definitions.

        Args:
            rules_module: The imported Rules.py module from a worldgen world
            world: The world object for this player

        Returns:
            A dictionary mapping helper names to their rule definitions.
        """
        from exporter.analyzer import analyze_rule

        helper_definitions = {}

        # Find all helper functions in the module
        # Helper functions take (state, player) or (state, player, *args) as parameters
        for name in dir(rules_module):
            if name.startswith('__'):
                continue

            obj = getattr(rules_module, name)

            # Skip internal functions (e.g., defeat rules) marked with _internal_function attribute
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

            # This is a helper function - analyze it
            try:
                rule = analyze_rule(
                    rule_func=obj,
                    game_handler=self,
                    player_context=world.player if hasattr(world, 'player') else None,
                    preserve_parameter_names=True
                )

                if rule and rule.get('type') != 'error':
                    # Extract parameter names beyond state/player
                    params = list(varnames[2:])  # Skip state, player
                    defaults = {}

                    # Get default values if any
                    if obj.__defaults__:
                        num_defaults = len(obj.__defaults__)
                        param_names_with_defaults = params[-num_defaults:]
                        for param_name, default_val in zip(param_names_with_defaults, obj.__defaults__):
                            if default_val is not None:
                                defaults[param_name] = default_val

                    # Extract the helper name without the worldgen prefix
                    # e.g., _shapezworldgen_can_cut_half -> can_cut_half
                    # The pattern is: _<gamename>worldgen_<helper_name>
                    # We need to match the unprefixed names used in the rules
                    helper_name = name
                    if name.startswith('_') and 'worldgen_' in name:
                        # Strip the _<gamename>worldgen_ prefix
                        prefix_end = name.find('worldgen_') + len('worldgen_')
                        helper_name = name[prefix_end:]

                    if params:
                        helper_def = {
                            'params': params,
                            'body': rule
                        }
                        if defaults:
                            helper_def['defaults'] = defaults
                        # Add param_mappings: prefer manual definition, fallback to auto-discovered
                        if helper_name in getattr(self, 'HELPER_PARAM_MAPPINGS', {}):
                            helper_def['param_mappings'] = self.HELPER_PARAM_MAPPINGS[helper_name]
                        elif hasattr(self, 'get_discovered_param_mappings'):
                            discovered = self.get_discovered_param_mappings(helper_name)
                            if discovered:
                                helper_def['param_mappings'] = discovered
                                logger.debug(f"Using auto-discovered param_mappings for worldgen helper '{helper_name}': {discovered}")
                        helper_definitions[helper_name] = helper_def
                    else:
                        helper_definitions[helper_name] = rule

                    logger.debug(f"Analyzed worldgen helper '{helper_name}'")

            except Exception as e:
                logger.warning(f"Failed to analyze worldgen helper '{name}': {e}")

        # Post-process: strip worldgen prefix from all helper references within rules
        helper_definitions = self._strip_worldgen_prefixes_from_rules(helper_definitions)

        return helper_definitions

    def _strip_worldgen_prefixes_from_rules(self, helper_definitions: Dict[str, Any]) -> Dict[str, Any]:
        """
        Strip worldgen prefixes from all helper references within rule bodies.

        When the analyzer parses Python code like `_shapezworldgen_can_stack(state, player)`,
        it creates helper references with the full prefixed name. This method transforms
        all such references to use the unprefixed name (e.g., `can_stack`).
        """
        def strip_prefix(name: str) -> str:
            if name.startswith('_') and 'worldgen_' in name:
                prefix_end = name.find('worldgen_') + len('worldgen_')
                return name[prefix_end:]
            return name

        def transform_rule(rule: Any) -> Any:
            if isinstance(rule, dict):
                # Make a copy and recursively process all values
                result = {k: transform_rule(v) for k, v in rule.items()}
                # If this is a helper reference, strip the worldgen prefix from the name
                if result.get('type') == 'helper' and 'name' in result:
                    result['name'] = strip_prefix(result['name'])
                return result
            elif isinstance(rule, list):
                return [transform_rule(item) for item in rule]
            return rule

        return {name: transform_rule(definition) for name, definition in helper_definitions.items()}

    def get_helper_definitions(self, world) -> Dict[str, Any]:
        """
        Extract helper function definitions and return them as rule structures.

        This method automatically finds and analyzes helper functions from the
        modules specified in HELPER_MODULES, converting them to rule structures
        that the frontend can evaluate directly.

        Helper discovery works in two ways:
        1. Automatic: Helpers discovered during rule analysis (via register_helper_usage)
        2. Manual: Helpers listed in HELPERS_TO_EXPORT_WHITELIST

        The blacklist (HELPERS_TO_EXPORT_BLACKLIST) excludes helpers from export.

        For worldgen worlds, helper functions are analyzed directly from the
        Rules.py module's Python code, converting them to AST format.

        Args:
            world: The world object for this player

        Returns:
            A dictionary mapping helper names to their rule definitions.
            Example: {"can_cut_half": {"type": "item_check", "item": "Cutter"}}
        """
        # Check for worldgen worlds first - analyze helper functions from their Rules.py module
        try:
            if self.is_worldgen_world(world):
                # This is a worldgen world - analyze helper functions from Rules.py
                # world_module is like 'worlds.ahit_worldgen' - we need 'worlds.ahit_worldgen.Rules'
                world_module = type(world).__module__
                rules_module_name = world_module + '.Rules'
                try:
                    rules_module = importlib.import_module(rules_module_name)
                    worldgen_helpers = self._analyze_worldgen_helpers(rules_module, world)
                    if worldgen_helpers:
                        logger.debug(f"Analyzed {len(worldgen_helpers)} helper definitions from worldgen Rules.py")
                        return worldgen_helpers
                except ImportError as e:
                    logger.debug(f"Could not import worldgen Rules module: {e}")
        except Exception as e:
            logger.debug(f"Error checking for worldgen helpers: {e}")

        # Import analyze_rule here to avoid circular imports
        from exporter.analyzer import analyze_rule

        helper_definitions = {}

        # Get helper configuration
        whitelist = self.get_helpers_to_export_whitelist()
        blacklist = self.get_helpers_to_export_blacklist()
        helper_modules = self.get_helper_modules()

        # Determine which helpers to export based on AUTO_EXPORT_DISCOVERED_HELPERS
        # When False (default), only whitelisted helpers are exported
        # When True, discovered helpers are also exported (minus blacklist)
        # Auto-preserved helpers (from AUTO_PRESERVE_LARGE_HELPERS) are always exported
        auto_preserved = self._auto_preserved_helpers if hasattr(self, '_auto_preserved_helpers') else set()
        if self.AUTO_EXPORT_DISCOVERED_HELPERS:
            discovered = self.get_discovered_helpers()
            helpers_to_export = discovered | whitelist | auto_preserved
        else:
            helpers_to_export = whitelist | auto_preserved

        # Collect modules to load - both manually specified and auto-discovered
        auto_discovered_modules = set(self.get_discovered_helper_modules().values())
        all_module_paths = set(helper_modules) | auto_discovered_modules

        if not helpers_to_export or not all_module_paths:
            return helper_definitions

        # Load helper modules
        loaded_modules = []
        for module_path in all_module_paths:
            try:
                module = importlib.import_module(module_path)
                loaded_modules.append(module)
            except ImportError as e:
                logger.warning(f"Could not import helper module '{module_path}': {e}")

        if not loaded_modules:
            return helper_definitions

        # Process helpers iteratively to discover nested helper dependencies
        # When analyzing a helper, it may call other helpers which get registered
        # Keep iterating until no new helpers are discovered
        processed_helpers: Set[str] = set()

        for iteration in range(MAX_HELPER_DISCOVERY_ITERATIONS):
            # Get current set of helpers to export (may grow as we discover new ones)
            # Include auto-preserved helpers in each iteration (they may grow too)
            auto_preserved = self._auto_preserved_helpers if hasattr(self, '_auto_preserved_helpers') else set()
            if self.AUTO_EXPORT_DISCOVERED_HELPERS:
                discovered = self.get_discovered_helpers()
                current_helpers = discovered | whitelist | auto_preserved
            else:
                current_helpers = whitelist | auto_preserved

            # Find helpers that haven't been processed yet
            new_helpers = current_helpers - processed_helpers - blacklist

            if not new_helpers:
                logger.debug(f"Helper discovery complete after {iteration + 1} iteration(s)")
                break

            logger.debug(f"Iteration {iteration + 1}: Processing {len(new_helpers)} new helpers: {new_helpers}")

            for helper_name in new_helpers:
                processed_helpers.add(helper_name)

                # Find the helper function in one of the loaded modules
                # First check module-level functions, then class methods
                helper_func = None
                for module in loaded_modules:
                    # Check module-level function
                    if hasattr(module, helper_name):
                        candidate = getattr(module, helper_name)
                        # Only use callable objects (functions, methods, classes)
                        # Skip non-callable objects like lists, dicts, strings, etc.
                        if callable(candidate):
                            helper_func = candidate
                            break
                        else:
                            logger.debug(f"Skipping non-callable '{helper_name}' in {module.__name__}: {type(candidate).__name__}")
                    # Check methods in classes defined in the module
                    for name, obj in vars(module).items():
                        if isinstance(obj, type):  # It's a class
                            if hasattr(obj, helper_name):
                                method = getattr(obj, helper_name)
                                # Get the underlying function from the method
                                if callable(method):
                                    helper_func = method
                                    break
                    if helper_func is not None:
                        break

                # Fallback: check if this is a method on the World class itself
                # This handles games like Dark Souls 3 where helper methods like _can_get
                # are defined on the World class in __init__.py (which is skipped by module discovery)
                if helper_func is None and self.world is not None:
                    if hasattr(self.world, helper_name):
                        method = getattr(self.world, helper_name)
                        if callable(method):
                            # Get the underlying function from the bound method
                            helper_func = getattr(method, '__func__', method)
                            logger.debug(f"Found helper '{helper_name}' as method on World class")

                # Check if we have a cached definition (from auto-preservation due to size)
                cached_def = self.get_cached_helper(helper_name)
                if cached_def is not None:
                    # Apply game-specific rule expansion to cached definitions
                    # (e.g., TWW state method replacement, civ_6 subscript resolution)
                    if hasattr(self, 'expand_rule') and callable(self.expand_rule):
                        cached_def = self.expand_rule(cached_def)

                    # Extract parameter names and defaults from the function (excluding state, player, world, self)
                    params = []
                    defaults = {}
                    if helper_func and hasattr(helper_func, '__code__'):
                        all_params = helper_func.__code__.co_varnames[:helper_func.__code__.co_argcount]
                        params = [p for p in all_params if p not in ('state', 'player', 'world', 'self')]

                        # Extract default values for parameters
                        if hasattr(helper_func, '__defaults__') and helper_func.__defaults__:
                            func_defaults = helper_func.__defaults__
                            num_defaults = len(func_defaults)
                            params_with_defaults = all_params[-num_defaults:]
                            for param_name, default_value in zip(params_with_defaults, func_defaults):
                                if param_name in params:
                                    if isinstance(default_value, (bool, int, float, str, type(None))):
                                        defaults[param_name] = default_value

                    # Store with params if the helper has parameters
                    if params:
                        helper_def = {
                            'params': params,
                            'body': cached_def
                        }
                        if defaults:
                            helper_def['defaults'] = defaults
                        # Add param_mappings: prefer manual definition, fallback to auto-discovered
                        if helper_name in self.HELPER_PARAM_MAPPINGS:
                            helper_def['param_mappings'] = self.HELPER_PARAM_MAPPINGS[helper_name]
                        elif hasattr(self, 'get_discovered_param_mappings'):
                            discovered = self.get_discovered_param_mappings(helper_name)
                            if discovered:
                                helper_def['param_mappings'] = discovered
                                logger.debug(f"Using auto-discovered param_mappings for '{helper_name}': {discovered}")
                        helper_definitions[helper_name] = helper_def
                        logger.debug(f"Using cached definition for helper '{helper_name}' with params {params}, defaults {defaults}")
                    else:
                        helper_definitions[helper_name] = cached_def
                        logger.debug(f"Using cached definition for helper '{helper_name}': {cached_def}")
                    continue

                if helper_func is None:
                    # Not found in helper modules - this is normal for built-in helpers
                    # like 'has', 'count', etc. that the frontend implements directly
                    logger.debug(f"Helper function '{helper_name}' not found in helper modules (may be a built-in)")
                    continue

                # Skip built-in functions (e.g., math.floor imported at module level)
                # These can't be analyzed via source inspection and are typically
                # handled directly by the frontend rule engine
                if inspect.isbuiltin(helper_func):
                    logger.debug(f"Helper '{helper_name}' is a built-in function, skipping analysis (handled by frontend)")
                    continue

                # Check if this is an enum class (e.g., Difficulty, HatType)
                # Enum constructors like Difficulty(value) are essentially identity functions
                # for rule purposes - they take a numeric value and return the enum member,
                # but for comparisons we only care about the underlying numeric value.
                if isinstance(helper_func, type) and issubclass(helper_func, enum.Enum):
                    logger.debug(f"Helper '{helper_name}' is an enum class - exporting as identity function")
                    # Export as a simple passthrough: takes one arg and returns it
                    # This allows Difficulty(world.options.LogicDifficulty) to work correctly
                    helper_definitions[helper_name] = {
                        'params': ['value'],
                        'body': {'type': 'name', 'name': 'value'}
                    }
                    continue

                # Check if this is a regular class (non-enum)
                # Classes like SMBool can't be analyzed via source inspection since they
                # don't have __code__ attributes. These classes are typically constructors
                # that the frontend implements directly.
                if isinstance(helper_func, type):
                    logger.debug(f"Helper '{helper_name}' is a class - skipping analysis (frontend-implemented)")
                    continue

                # Note: We previously checked for "dynamic for loops" here and blocked export.
                # Now that for_iter with tuple unpacking, map(), and dict methods are supported,
                # we allow the analysis to proceed. If the analyzer can't handle a specific case,
                # it will return an error or unsupported result.

                # Analyze the function to get its rule structure
                # This may discover new helpers via register_helper_usage
                # Use preserve_parameter_names=True so that default parameter values
                # are kept as name references (not inlined) for runtime resolution
                try:
                    rule = analyze_rule(
                        rule_func=helper_func,
                        game_handler=self,
                        player_context=world.player if hasattr(world, 'player') else None,
                        preserve_parameter_names=True
                    )

                    # Clean up the rule - resolve item names, convert state methods to rule types
                    rule = self._clean_helper_rule(rule, world)

                    # Expand helper calls in the rule (game-specific expansions)
                    if rule is not None and hasattr(self, 'expand_rule') and callable(self.expand_rule):
                        rule = self.expand_rule(rule)

                    if rule and rule.get('type') != 'error':
                        # Extract parameter names and defaults from the function (excluding state, player, world, self)
                        params = []
                        defaults = {}
                        if hasattr(helper_func, '__code__'):
                            all_params = helper_func.__code__.co_varnames[:helper_func.__code__.co_argcount]
                            params = [p for p in all_params if p not in ('state', 'player', 'world', 'self')]

                            # Extract default values for parameters
                            if hasattr(helper_func, '__defaults__') and helper_func.__defaults__:
                                func_defaults = helper_func.__defaults__
                                # Defaults apply to the last N parameters
                                num_defaults = len(func_defaults)
                                params_with_defaults = all_params[-num_defaults:]
                                for param_name, default_value in zip(params_with_defaults, func_defaults):
                                    if param_name in params:  # Only include if it's not state/player/world
                                        # Only include simple JSON-serializable defaults
                                        if isinstance(default_value, (bool, int, float, str, type(None))):
                                            defaults[param_name] = default_value

                        # Store with params if the helper has parameters, otherwise just the rule
                        if params:
                            helper_def = {
                                'params': params,
                                'body': rule
                            }
                            if defaults:
                                helper_def['defaults'] = defaults
                            # Add param_mappings: prefer manual definition, fallback to auto-discovered
                            if helper_name in self.HELPER_PARAM_MAPPINGS:
                                helper_def['param_mappings'] = self.HELPER_PARAM_MAPPINGS[helper_name]
                            elif hasattr(self, 'get_discovered_param_mappings'):
                                discovered = self.get_discovered_param_mappings(helper_name)
                                if discovered:
                                    helper_def['param_mappings'] = discovered
                                    logger.debug(f"Using auto-discovered param_mappings for '{helper_name}': {discovered}")
                            helper_definitions[helper_name] = helper_def
                            logger.debug(f"Exported helper '{helper_name}' with params {params}, defaults {defaults}: {rule}")
                        else:
                            helper_definitions[helper_name] = rule
                            logger.debug(f"Exported helper '{helper_name}': {rule}")
                    else:
                        logger.warning(f"Failed to analyze helper '{helper_name}': {rule}")
                except Exception as e:
                    logger.error(f"Error analyzing helper '{helper_name}': {e}")
        else:
            logger.warning(f"Helper discovery reached max iterations ({MAX_HELPER_DISCOVERY_ITERATIONS}), may have circular dependencies")

        # Generate helpers from DICT_SUM_HELPERS configuration
        # These are helpers that sum values from item->value mappings
        # DICT_SUM_HELPERS overrides existing definitions because:
        # 1. The original helper may be too complex for frontend evaluation (loops, closures, etc.)
        # 2. DICT_SUM_HELPERS specifically provides simplified, evaluable versions
        # 3. The game exporter explicitly configures this to replace the complex version
        if hasattr(self, 'DICT_SUM_HELPERS') and self.DICT_SUM_HELPERS:
            for helper_name, mapping_name in self.DICT_SUM_HELPERS.items():
                if helper_name in helper_definitions:
                    logger.debug(f"DICT_SUM_HELPERS['{helper_name}'] overriding existing definition")

                helper_definitions[helper_name] = self._generate_dict_sum_helper(mapping_name)
                logger.debug(f"Generated sum helper '{helper_name}' from DICT_SUM_HELPERS")

        # Sort alphabetically for consistent output
        return dict(sorted(helper_definitions.items()))

    def _generate_dict_sum_helper(self, mapping_name: str) -> Dict[str, Any]:
        """
        Generate a sum_of helper that iterates over an item->value mapping.

        The generated helper sums values for items the player has:
        sum(value for item, value in mapping.items() if state.has(item))

        Args:
            mapping_name: The name of the setting containing the item->value dict

        Returns:
            A helper definition dict with params and body
        """
        return {
            'params': [],
            'body': {
                'type': 'sum_of',
                'iterator_info': {
                    'target': {
                        'type': 'tuple',
                        'elements': [
                            {'type': 'name', 'name': 'item_name'},
                            {'type': 'name', 'name': 'value'}
                        ]
                    },
                    'iterator': {
                        'type': 'method_call',
                        'object': {'type': 'setting_value', 'setting': mapping_name},
                        'method': 'items',
                        'args': []
                    }
                },
                'element_rule': {
                    'type': 'conditional',
                    'test': {
                        'type': 'item_check',
                        'item': {'type': 'name', 'name': 'item_name'}
                    },
                    'if_true': {'type': 'name', 'name': 'value'},
                    'if_false': {'type': 'constant', 'value': 0}
                }
            }
        }

    def _clean_helper_rule(self, rule: Optional[Dict[str, Any]], world) -> Optional[Dict[str, Any]]:
        """
        Clean up a helper rule by resolving attribute nodes and simplifying structure.

        This handles cases where the analyzer produces attribute nodes like
        ITEMS.cutter that need to be resolved to actual item names, and converts
        state method calls (has, has_any, has_all) to rule types the frontend
        can evaluate directly.

        Args:
            rule: The rule dictionary to clean up
            world: The world object for context

        Returns:
            The cleaned up rule dictionary
        """
        if not rule or not isinstance(rule, dict):
            return rule

        rule_type = rule.get('type')

        # Resolve item_check with attribute-based item names
        if rule_type == 'item_check':
            item = rule.get('item')
            if isinstance(item, dict) and item.get('type') == 'attribute':
                resolved_item = self._resolve_item_attribute(item)
                if resolved_item:
                    rule['item'] = resolved_item
            return rule

        # Handle state.has(item, player) -> item_check
        if rule_type == 'state_method' and rule.get('method') == 'has':
            args = rule.get('args', [])
            if len(args) >= 1:
                item_arg = args[0]
                if isinstance(item_arg, dict) and item_arg.get('type') == 'attribute':
                    resolved_item = self._resolve_item_attribute(item_arg)
                    if resolved_item:
                        return {'type': 'item_check', 'item': resolved_item}
                elif isinstance(item_arg, dict) and item_arg.get('type') == 'constant':
                    return {'type': 'item_check', 'item': item_arg.get('value')}
            return rule

        # Handle state.has_any((items), player) -> or of item_checks
        if rule_type == 'state_method' and rule.get('method') == 'has_any':
            args = rule.get('args', [])
            if len(args) >= 1:
                items_arg = args[0]
                items = self._resolve_items_collection(items_arg)
                if items:
                    return {
                        'type': 'or',
                        'conditions': [{'type': 'item_check', 'item': item} for item in items]
                    }
            return rule

        # Handle state.has_all((items), player) -> and of item_checks
        if rule_type == 'state_method' and rule.get('method') == 'has_all':
            args = rule.get('args', [])
            if len(args) >= 1:
                items_arg = args[0]
                items = self._resolve_items_collection(items_arg)
                if items:
                    return {
                        'type': 'and',
                        'conditions': [{'type': 'item_check', 'item': item} for item in items]
                    }
            return rule

        # Handle state.can_reach_location(location, player) -> location_check
        if rule_type == 'state_method' and rule.get('method') == 'can_reach_location':
            args = rule.get('args', [])
            if len(args) >= 1:
                location_arg = args[0]
                # Handle both constant and name (parameter reference) types
                if isinstance(location_arg, dict):
                    if location_arg.get('type') == 'constant':
                        return {'type': 'location_check', 'location': location_arg.get('value')}
                    elif location_arg.get('type') == 'name':
                        # Parameter reference - keep as location_check with the name node
                        return {'type': 'location_check', 'location': location_arg}
                elif isinstance(location_arg, str):
                    return {'type': 'location_check', 'location': location_arg}
            return rule

        # Handle state.can_reach_entrance(entrance, player) -> can_reach_entrance
        if rule_type == 'state_method' and rule.get('method') == 'can_reach_entrance':
            args = rule.get('args', [])
            if len(args) >= 1:
                entrance_arg = args[0]
                # Handle both constant and complex types (like f_string)
                if isinstance(entrance_arg, dict):
                    if entrance_arg.get('type') == 'constant':
                        return {'type': 'can_reach_entrance', 'entrance': entrance_arg.get('value')}
                    elif entrance_arg.get('type') in ('name', 'f_string'):
                        # Parameter reference or f-string - keep the node
                        return {'type': 'can_reach_entrance', 'entrance': entrance_arg}
                elif isinstance(entrance_arg, str):
                    return {'type': 'can_reach_entrance', 'entrance': entrance_arg}
            return rule

        # Recursively clean conditions
        if rule_type in ['and', 'or']:
            rule['conditions'] = [self._clean_helper_rule(c, world) for c in rule.get('conditions', [])]
            return rule

        if rule_type == 'not':
            rule['condition'] = self._clean_helper_rule(rule.get('condition'), world)
            return rule

        return rule

    def _resolve_item_attribute(self, attr_node: Dict[str, Any]) -> Optional[str]:
        """
        Resolve an attribute node (like ITEMS.cutter) to an item name string.

        Searches through the modules specified in ITEM_NAME_MODULES for classes
        that have the matching attribute.

        Args:
            attr_node: The attribute node dictionary from the analyzer

        Returns:
            The resolved item name string, or None if not found
        """
        if not attr_node or attr_node.get('type') != 'attribute':
            return None

        attr_name = attr_node.get('attr')
        obj = attr_node.get('object', {})

        # Get the class name (e.g., 'ITEMS')
        class_name = None
        if obj.get('type') == 'name':
            class_name = obj.get('name')

        if not class_name or not attr_name:
            return None

        # Search through item name modules for the class and attribute
        for module_path in self.get_item_name_modules():
            try:
                module = importlib.import_module(module_path)
                if hasattr(module, class_name):
                    item_class = getattr(module, class_name)
                    if hasattr(item_class, attr_name):
                        return getattr(item_class, attr_name)
            except ImportError:
                pass

        return None

    def _resolve_items_collection(self, collection_node: Dict[str, Any]) -> Optional[List[str]]:
        """
        Resolve a tuple/list/set of item attributes to a list of item name strings.

        Handles:
        - Constant nodes with list/tuple values (already resolved by analyzer)
        - Tuple/list/set nodes with attribute or constant elements
        - Set nodes used in has_any/has_all patterns

        Args:
            collection_node: The collection node dictionary from the analyzer

        Returns:
            A list of item name strings, or None if not resolvable
        """
        if not collection_node:
            return None

        items = []
        node_type = collection_node.get('type')

        # Handle constant type with list/tuple value (already resolved by analyzer)
        if node_type == 'constant':
            value = collection_node.get('value')
            if isinstance(value, (list, tuple)):
                return list(value)

        # Handle tuple, list, or set types
        if node_type in ('tuple', 'list', 'set'):
            elements = collection_node.get('elements', [])
            for elem in elements:
                if elem.get('type') == 'attribute':
                    item_name = self._resolve_item_attribute(elem)
                    if item_name:
                        items.append(item_name)
                elif elem.get('type') == 'constant':
                    value = elem.get('value')
                    if isinstance(value, str):
                        items.append(value)

        return items if items else None

    # These methods are expected to be provided by the main handler class
    def is_worldgen_world(self, world=None) -> bool:
        """Check if this is a worldgen world. Stub for mixin."""
        return False

    def get_helpers_to_export_whitelist(self) -> Set[str]:
        """Return the helper whitelist. Stub for mixin."""
        return set()

    def get_helpers_to_export_blacklist(self) -> Set[str]:
        """Return the helper blacklist. Stub for mixin."""
        return set()

    def get_helper_modules(self) -> List[str]:
        """Return the list of helper modules. Stub for mixin."""
        return []

    def get_item_name_modules(self) -> List[str]:
        """Return the list of item name modules. Stub for mixin."""
        return []

    def get_discovered_helpers(self) -> Set[str]:
        """Return the set of discovered helpers. Stub for mixin."""
        return set()

    def get_discovered_helper_modules(self) -> Dict[str, str]:
        """Return the dict of discovered helper modules. Stub for mixin."""
        return {}

    def get_cached_helper(self, helper_name: str) -> Optional[Dict[str, Any]]:
        """Get a cached helper definition. Stub for mixin."""
        return None

    def expand_rule(self, rule: Dict[str, Any], _depth: int = 0) -> Dict[str, Any]:
        """Expand a rule. Stub for mixin."""
        return rule
