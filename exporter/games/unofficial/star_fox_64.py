"""Star Fox 64 game-specific export handler.

Star Fox 64 uses a custom DSL for rules that are stored as strings in data modules
and compiled at runtime using AST transformation. This handler extracts the original
DSL strings and converts them to Rule Builder format.

The DSL supports:
- `true` / `false` - boolean constants
- `LevelAccess == 'shuffle_paths'` - option comparisons
- `CorneriaBluePath` - item checks (item names with spaces/special chars removed)
- `(Medal, RequiredMedals)` - item count checks where count is from an option
- `and` / `or` - boolean operators

The apworld compiles these strings using:
    compile(node, file, "eval")
where `file` is a descriptive string like "Star Fox 64, Exit: Menu -> Corneria".
When the exporter tries to read this "file" using inspect.getfile(), it fails
because it's not a real path. This handler intercepts rule analysis using
override_rule_analysis() to parse the DSL strings directly.
"""

from typing import Dict, Any, List, Optional, Set, Callable
from ..base import GenericGameExportHandler
import logging
import re
import ast
import inspect

logger = logging.getLogger(__name__)


class StarFox64GameExportHandler(GenericGameExportHandler):
    """Export handler for Star Fox 64.

    Parses the apworld's DSL-based rules directly rather than relying on
    source extraction, which fails because the rules are dynamically compiled.

    Uses override_rule_analysis() to intercept the rule before source extraction
    fails, then parses the DSL strings from the apworld's data modules.
    """

    GAME_NAME = "Star Fox 64"

    # Cache for data module access (class-level to persist across instances)
    _data_regions: Optional[Dict[str, Any]] = None
    _item_alias_map: Optional[Dict[str, str]] = None
    _option_names: Optional[Set[str]] = None
    _location_to_region: Optional[Dict[str, str]] = None

    def __init__(self, world=None):
        super().__init__(world)
        self._load_apworld_data()

    def _load_apworld_data(self) -> None:
        """Load the apworld's data modules for rule extraction."""
        if StarFox64GameExportHandler._data_regions is not None:
            return  # Already loaded

        try:
            from worlds.star_fox_64 import data as sf64_data  # type: ignore[import-untyped]
            from worlds.star_fox_64 import items as sf64_items  # type: ignore[import-untyped]
            from worlds.star_fox_64.options import StarFox64Options  # type: ignore[import-untyped]
            import typing

            # Store the regions data
            StarFox64GameExportHandler._data_regions = sf64_data.regions

            # Build the item alias -> name mapping
            StarFox64GameExportHandler._item_alias_map = {}
            for name in sf64_items.name_to_id.keys():
                alias = re.sub(r"[^a-zA-Z0-9]+", "", name)
                StarFox64GameExportHandler._item_alias_map[alias] = name

            # Build the set of option class names
            StarFox64GameExportHandler._option_names = set()
            hints = typing.get_type_hints(StarFox64Options)
            for option_name, option_class in hints.items():
                StarFox64GameExportHandler._option_names.add(option_class.__name__)

            # Build location name -> region name mapping for quick lookups
            StarFox64GameExportHandler._location_to_region = {}
            for region_name, region_data in sf64_data.regions.items():
                for location_name in region_data.get('locations', {}).keys():
                    StarFox64GameExportHandler._location_to_region[location_name] = region_name

            logger.debug(f"Loaded Star Fox 64 data: {len(sf64_data.regions)} regions, "
                        f"{len(StarFox64GameExportHandler._item_alias_map)} items, "
                        f"{len(StarFox64GameExportHandler._option_names)} options")
        except Exception as e:
            logger.warning(f"Could not load Star Fox 64 data modules: {e}")
            StarFox64GameExportHandler._data_regions = {}
            StarFox64GameExportHandler._item_alias_map = {}
            StarFox64GameExportHandler._option_names = set()
            StarFox64GameExportHandler._location_to_region = {}

    def _get_logic_string(self, rule_type: str, region_name: str, target_name: str) -> Optional[str]:
        """Get the original logic string from the apworld's data.

        Args:
            rule_type: 'location' or 'exit'
            region_name: The region containing the location/exit
            target_name: The location or exit name

        Returns:
            The logic string, or None if not found
        """
        if not self._data_regions:
            return None

        region_data = self._data_regions.get(region_name, {})

        if rule_type == 'location':
            locations = region_data.get('locations', {})
            location_data = locations.get(target_name, {})
            return location_data.get('logic')
        elif rule_type == 'exit':
            exits = region_data.get('exits', {})
            exit_data = exits.get(target_name, {})
            return exit_data.get('logic')

        return None

    def _parse_file_string(self, file_string: str) -> Optional[Dict[str, str]]:
        """Parse the 'file' string passed to compile() to extract rule context.

        The apworld uses file strings like:
        - "Star Fox 64, Exit: Menu -> Corneria"
        - "Star Fox 64, Location: Aquas -> Aquas - Mission Complete"

        Args:
            file_string: The 'file' string from the compiled lambda

        Returns:
            Dict with 'type', 'region', 'target' keys, or None if parsing fails
        """
        if not file_string or not file_string.startswith("Star Fox 64, "):
            return None

        # Remove the game prefix
        rest = file_string[len("Star Fox 64, "):]

        # Parse type and content
        if rest.startswith("Exit: "):
            content = rest[len("Exit: "):]
            if " -> " in content:
                parts = content.split(" -> ", 1)
                return {'type': 'exit', 'region': parts[0], 'target': parts[1]}
        elif rest.startswith("Location: "):
            content = rest[len("Location: "):]
            if " -> " in content:
                parts = content.split(" -> ", 1)
                return {'type': 'location', 'region': parts[0], 'target': parts[1]}

        return None

    def override_rule_analysis(self, rule_func: Callable, rule_target_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Override rule analysis to extract DSL logic directly.

        Star Fox 64 uses dynamically compiled lambdas where inspect.getfile()
        returns a descriptive string (not a file path) that contains the
        region and target information. We use this to look up the original
        DSL logic string and parse it ourselves.

        Args:
            rule_func: The rule function (a lambda compiled from DSL)
            rule_target_name: The target name (location or exit name)

        Returns:
            Rule dict in Rule Builder format, or None to fall back to standard analysis
        """
        try:
            # Try to get the "file" string from the compiled lambda
            file_string = None
            try:
                file_string = inspect.getfile(rule_func)
            except (TypeError, OSError):
                pass

            # Parse the file string to get context
            if file_string:
                context = self._parse_file_string(file_string)
                if context:
                    logic_string = self._get_logic_string(
                        context['type'],
                        context['region'],
                        context['target']
                    )
                    if logic_string:
                        logger.debug(f"SF64: Found DSL for {context['type']} "
                                    f"{context['region']}->{context['target']}: {logic_string}")
                        return self._parse_dsl_to_rule(logic_string)

            # Fallback: try to find the rule by target name
            if rule_target_name:
                # For exits like "Menu -> Corneria"
                if " -> " in rule_target_name:
                    parts = rule_target_name.split(" -> ", 1)
                    source_region, target = parts[0], parts[1]
                    logic_string = self._get_logic_string('exit', source_region, target)
                    if logic_string:
                        logger.debug(f"SF64: Found DSL for exit {rule_target_name}: {logic_string}")
                        return self._parse_dsl_to_rule(logic_string)
                else:
                    # For locations, try to find the region
                    if self._location_to_region and rule_target_name in self._location_to_region:
                        region_name = self._location_to_region[rule_target_name]
                        logic_string = self._get_logic_string('location', region_name, rule_target_name)
                        if logic_string:
                            logger.debug(f"SF64: Found DSL for location {rule_target_name}: {logic_string}")
                            return self._parse_dsl_to_rule(logic_string)

            # Could not find DSL - return None to fall back to standard analysis
            # This might still fail, but at least we tried
            return None

        except Exception as e:
            logger.warning(f"SF64: Error in override_rule_analysis for {rule_target_name}: {e}")
            return None

    def _parse_dsl_to_rule(self, logic_string: str) -> Dict[str, Any]:
        """Parse a Star Fox 64 DSL logic string into Rule Builder format.

        Args:
            logic_string: The DSL string like "LevelAccess == 'shuffle_paths' and Corneria"

        Returns:
            A Rule Builder format dictionary
        """
        if not logic_string or logic_string.strip() == '':
            return {'rule': 'Constant', 'value': True}

        logic_string = logic_string.strip()

        # Handle simple constants
        if logic_string.lower() == 'true':
            return {'rule': 'Constant', 'value': True}
        if logic_string.lower() == 'false':
            return {'rule': 'Constant', 'value': False}

        # Parse using Python AST
        try:
            tree = ast.parse(logic_string, mode='eval')
            return self._convert_ast_node(tree.body)
        except SyntaxError as e:
            logger.warning(f"Could not parse DSL: {logic_string} - {e}")
            return {'rule': 'Constant', 'value': True}

    def _convert_ast_node(self, node: ast.AST) -> Dict[str, Any]:
        """Convert a Python AST node to Rule Builder format."""

        if isinstance(node, ast.Constant):
            if node.value is True:
                return {'rule': 'Constant', 'value': True}
            elif node.value is False:
                return {'rule': 'Constant', 'value': False}
            else:
                return {'rule': 'Constant', 'value': node.value}

        elif isinstance(node, ast.Name):
            # Could be a boolean constant or an item alias
            name = node.id
            if name == 'true':
                return {'rule': 'Constant', 'value': True}
            elif name == 'false':
                return {'rule': 'Constant', 'value': False}
            elif self._item_alias_map and name in self._item_alias_map:
                # Item check
                return {
                    'rule': 'Has',
                    'args': {'item_name': self._item_alias_map[name]}
                }
            elif self._option_names and name in self._option_names:
                # Option reference - return as setting access
                return {
                    'rule': 'SettingValue',
                    'args': {'setting_name': name}
                }
            else:
                # Unknown name - might be an option or item we don't know about
                # Try as item first
                logger.debug(f"Unknown name in DSL: {name}")
                return {
                    'rule': 'Has',
                    'args': {'item_name': name}
                }

        elif isinstance(node, ast.Compare):
            # Option comparison like LevelAccess == 'shuffle_paths'
            left = node.left
            if not isinstance(left, ast.Name):
                return {'rule': 'Constant', 'value': True}

            setting_name = left.id

            # Handle the comparison
            if len(node.ops) == 1 and len(node.comparators) == 1:
                op = node.ops[0]
                comparator = node.comparators[0]

                if isinstance(comparator, ast.Constant):
                    value = comparator.value
                elif isinstance(comparator, ast.Str):  # Python 3.7 compatibility
                    value = comparator.s
                elif isinstance(comparator, ast.Name):
                    # Comparing to an option value - this is a setting reference
                    value = comparator.id
                else:
                    return {'rule': 'Constant', 'value': True}

                if isinstance(op, ast.Eq):
                    return {
                        'rule': 'SettingIs',
                        'args': {'setting_name': setting_name, 'value': value}
                    }
                elif isinstance(op, ast.NotEq):
                    return {
                        'rule': 'SettingIsNot',
                        'args': {'setting_name': setting_name, 'value': value}
                    }
                elif isinstance(op, ast.Lt):
                    return {
                        'rule': 'SettingLessThan',
                        'args': {'setting_name': setting_name, 'value': value}
                    }
                elif isinstance(op, ast.LtE):
                    return {
                        'rule': 'SettingLessOrEqual',
                        'args': {'setting_name': setting_name, 'value': value}
                    }
                elif isinstance(op, ast.Gt):
                    return {
                        'rule': 'SettingGreaterThan',
                        'args': {'setting_name': setting_name, 'value': value}
                    }
                elif isinstance(op, ast.GtE):
                    return {
                        'rule': 'SettingGreaterOrEqual',
                        'args': {'setting_name': setting_name, 'value': value}
                    }

            return {'rule': 'Constant', 'value': True}

        elif isinstance(node, ast.BoolOp):
            # and / or operations
            conditions = [self._convert_ast_node(val) for val in node.values]

            # Filter out True constants for And, False for Or
            if isinstance(node.op, ast.And):
                conditions = [c for c in conditions if not (c.get('rule') == 'Constant' and c.get('value') is True)]
                if not conditions:
                    return {'rule': 'Constant', 'value': True}
                if any(c.get('rule') == 'Constant' and c.get('value') is False for c in conditions):
                    return {'rule': 'Constant', 'value': False}
                if len(conditions) == 1:
                    return conditions[0]
                return {'rule': 'And', 'children': conditions}

            elif isinstance(node.op, ast.Or):
                conditions = [c for c in conditions if not (c.get('rule') == 'Constant' and c.get('value') is False)]
                if not conditions:
                    return {'rule': 'Constant', 'value': False}
                if any(c.get('rule') == 'Constant' and c.get('value') is True for c in conditions):
                    return {'rule': 'Constant', 'value': True}
                if len(conditions) == 1:
                    return conditions[0]
                return {'rule': 'Or', 'children': conditions}

        elif isinstance(node, ast.Tuple):
            # (Medal, RequiredMedals) - item count where count is from option
            if len(node.elts) == 2:
                item_node = node.elts[0]
                count_node = node.elts[1]

                if isinstance(item_node, ast.Name) and self._item_alias_map and item_node.id in self._item_alias_map:
                    item_name = self._item_alias_map[item_node.id]

                    if isinstance(count_node, ast.Constant):
                        # Fixed count
                        count = count_node.value
                        if count == 0:
                            return {'rule': 'Constant', 'value': True}
                        return {
                            'rule': 'Has',
                            'args': {'item_name': item_name, 'count': count}
                        }
                    elif isinstance(count_node, ast.Name):
                        # Count from option
                        option_name = count_node.id
                        return {
                            'rule': 'HasCountFromSetting',
                            'args': {'item_name': item_name, 'count_setting': option_name}
                        }

            return {'rule': 'Constant', 'value': True}

        elif isinstance(node, ast.UnaryOp):
            if isinstance(node.op, ast.Not):
                operand = self._convert_ast_node(node.operand)
                return {'rule': 'Not', 'child': operand}

        # Fallback for unknown nodes
        logger.debug(f"Unknown AST node type: {type(node).__name__}")
        return {'rule': 'Constant', 'value': True}
