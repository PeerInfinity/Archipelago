"""Satisfactory game-specific export handler.

Satisfactory uses complex OOP patterns (StateLogic instances, Recipe objects,
closure variables) in its access rules. The generic exporter captures these as
AST-level representations (AST_function_call, AST_generic_helper, AST_subscript)
that the world generator cannot reconstruct.

This handler resolves these patterns in post_process_data by:
1. Converting state_logic method calls (can_build, can_build_all, can_produce_all)
   to Has/HasAll Rule Builder format
2. Expanding pipes_rule to HasAny checks for pipe and pump building events
3. Expanding radio_active_rule to HasAll for hazmat events
4. Expanding belt_rule[N] subscripts to HasAny for belt events at the given speed
5. Expanding is_recipe_producible(recipe) for Part locations by looking up
   actual recipe data from the world's GameLogic
6. Resolving EventBuilding, ElevatorPhase, PowerInfrastructure, HardDrive,
   and ShopSlot rules using world data
"""

import json
import re
import logging
from typing import Any, Dict, List, Optional

from ..base import GenericGameExportHandler

logger = logging.getLogger(__name__)

# Constants matching StateLogic class variables
PART_EVENT_PREFIX = "Can Produce: "
BUILDING_EVENT_PREFIX = "Can Build: "

PIPE_EVENTS = tuple(BUILDING_EVENT_PREFIX + b for b in ("Pipes Mk.1", "Pipes Mk.2"))
PUMP_EVENTS = tuple(BUILDING_EVENT_PREFIX + b for b in ("Pipeline Pump Mk.1", "Pipeline Pump Mk.2"))
HAZMAT_EVENTS = tuple(PART_EVENT_PREFIX + p for p in ("Hazmat Suit", "Iodine-Infused Filter"))

# Belt events per speed level (0-indexed: speed N has belts from Mk.N+1 to Mk.5)
BELT_EVENTS = tuple(
    tuple(BUILDING_EVENT_PREFIX + f"Conveyor Mk.{mk}" for mk in range(speed, 6))
    for speed in range(1, 6)
)

# Shop slot costs: slot number -> coupon cost
SHOP_SLOT_COSTS = {1: 3, 2: 3, 3: 5, 4: 5, 5: 10, 6: 10, 7: 20, 8: 20, 9: 50, 10: 50}


def _make_has(item_name: str) -> Dict[str, Any]:
    """Create a Has rule."""
    return {"rule": "Has", "args": {"item_name": item_name}}


def _make_has_all(items: List[str]) -> Dict[str, Any]:
    """Create a HasAll rule."""
    if len(items) == 1:
        return _make_has(items[0])
    return {"rule": "HasAll", "args": {"items": items}}


def _make_has_any(items: List[str]) -> Dict[str, Any]:
    """Create a HasAny rule."""
    if len(items) == 1:
        return _make_has(items[0])
    return {"rule": "HasAny", "args": {"items": items}}


def _make_and(children: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Create an And rule, simplifying single-child case."""
    children = [c for c in children if c.get("rule") != "True_"]
    if not children:
        return {"rule": "True_"}
    if len(children) == 1:
        return children[0]
    return {"rule": "And", "children": children}


def _make_or(children: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Create an Or rule, simplifying single-child case."""
    if not children:
        return {"rule": "False_"}
    if len(children) == 1:
        return children[0]
    return {"rule": "Or", "children": children}


def _make_true() -> Dict[str, Any]:
    return {"rule": "True_"}


def _make_pipes_rule() -> Dict[str, Any]:
    """Expand pipes_rule: need any pipe AND any pump."""
    return _make_and([
        _make_has_any(list(PIPE_EVENTS)),
        _make_has_any(list(PUMP_EVENTS)),
    ])


def _make_radio_active_rule() -> Dict[str, Any]:
    """Expand radio_active_rule: need all hazmat items."""
    return _make_has_all(list(HAZMAT_EVENTS))


def _make_belt_rule(speed_index: int) -> Dict[str, Any]:
    """Expand belt_rule[speed_index]: need any belt at that speed or higher."""
    if 0 <= speed_index < len(BELT_EVENTS):
        return _make_has_any(list(BELT_EVENTS[speed_index]))
    return _make_true()


def _resolve_can_build(name: str) -> Dict[str, Any]:
    """Resolve state_logic.can_build(name) to Has('Can Build: name')."""
    return _make_has(BUILDING_EVENT_PREFIX + name)


def _resolve_can_build_all(names) -> Dict[str, Any]:
    """Resolve state_logic.can_build_all(names) to HasAll."""
    if isinstance(names, dict):
        names = list(names.keys())
    elif isinstance(names, (list, tuple)):
        names = list(names)
    return _make_has_all([BUILDING_EVENT_PREFIX + n for n in names])


def _resolve_can_produce_all(parts) -> Dict[str, Any]:
    """Resolve state_logic.can_produce_all(parts) to HasAll."""
    if isinstance(parts, dict):
        parts = list(parts.keys())
    elif isinstance(parts, (list, tuple)):
        parts = list(parts)
    if not parts:
        return _make_true()
    return _make_has_all([PART_EVENT_PREFIX + p for p in parts])


def _extract_constant_args(func_call_rule: Dict[str, Any]):
    """Extract constant arguments from an AST_function_call rule."""
    args = func_call_rule.get("args", {})
    call_args = args.get("args", [])
    results = []
    for arg in call_args:
        if isinstance(arg, dict):
            if arg.get("type") == "constant":
                results.append(arg.get("value"))
            elif arg.get("type") == "tuple":
                results.append([
                    elem.get("value") for elem in arg.get("elements", [])
                    if elem.get("type") == "constant"
                ])
            elif arg.get("type") == "function_call":
                # Handle dict.keys() pattern - the dict is in a subscript
                obj = arg.get("function", {}).get("object", {})
                if obj.get("type") == "subscript":
                    val = obj.get("value", {})
                    if val.get("type") == "constant" and isinstance(val.get("value"), list):
                        # space_elevator_phases[index].keys()
                        idx_expr = obj.get("index", {})
                        idx = _eval_constant_expr(idx_expr)
                        if idx is not None and isinstance(val["value"], list) and idx < len(val["value"]):
                            phase_dict = val["value"][idx]
                            if isinstance(phase_dict, dict):
                                results.append(list(phase_dict.keys()))
                            else:
                                results.append(phase_dict)
                        else:
                            results.append(None)
                    else:
                        results.append(None)
                else:
                    results.append(None)
            else:
                results.append(None)
        else:
            results.append(arg)
    return results


def _eval_constant_expr(expr: Dict[str, Any]) -> Optional[int]:
    """Evaluate a simple constant expression (e.g., 1 - 1 = 0)."""
    if not isinstance(expr, dict):
        return None
    if expr.get("type") == "constant":
        return expr.get("value")
    if expr.get("type") == "binary_op":
        left = _eval_constant_expr(expr.get("left", {}))
        right = _eval_constant_expr(expr.get("right", {}))
        op = expr.get("op")
        if left is not None and right is not None:
            if op == "-":
                return left - right
            elif op == "+":
                return left + right
    return None


class SatisfactoryGameExportHandler(GenericGameExportHandler):
    """Export handler for Satisfactory.

    Resolves complex StateLogic-based rules into simple Rule Builder format
    that the world generator can properly convert to Python code.
    """

    GAME_NAME = 'Satisfactory'
    AUTO_EXPORT_DISCOVERED_HELPERS = False

    def __init__(self, world=None):
        super().__init__(world)
        self._game_logic = None
        self._critical_path = None
        self._state_logic = None
        self._options = None
        if world:
            self._game_logic = getattr(world, 'game_logic', None)
            self._critical_path = getattr(world, 'critical_path', None)
            self._state_logic = getattr(world, 'state_logic', None)
            self._options = getattr(world, 'options', None)
            logger.debug(f"Initialized Satisfactory export handler for player {world.player}")

    def _get_base_recipe_name(self, recipe_name: str) -> str:
        """Get the base (source) item name for a recipe, handling indirect_recipes.

        In Python, indirect_recipes maps source -> target (e.g.,
        "Recipe: Quartz Purification" -> "Recipe: Distilled Silica").
        The player receives the source item, but the recipe object stores the target name.
        We need to check for the source item in rules, since the frontend uses base_items.
        """
        if not self._game_logic:
            return recipe_name
        inverse = getattr(self, '_inverse_indirect_recipes', None)
        if inverse is None:
            self._inverse_indirect_recipes = {
                target: source
                for source, target in self._game_logic.indirect_recipes.items()
            }
            inverse = self._inverse_indirect_recipes
        return inverse.get(recipe_name, recipe_name)

    def post_process_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Transform Satisfactory rules from AST format to Rule Builder format."""
        data = super().post_process_data(data)

        # Only process this player's regions, not all players' regions.
        # In multiworld, data['regions'] contains all players' region data keyed by player ID.
        # Processing other players' regions would corrupt their rules.
        my_player_id = str(self.world.player) if self.world else None
        player_ids_to_process = [my_player_id] if my_player_id and my_player_id in data.get('regions', {}) else list(data.get('regions', {}).keys())

        for player_id in player_ids_to_process:
            player_regions = data['regions'][player_id]
            for region_name, region_data in player_regions.items():
                exits = region_data.get('exits', [])
                # Transform exit rules
                for exit_data in exits:
                    access_rule = exit_data.get('access_rule')
                    if access_rule:
                        exit_data['access_rule'] = self._transform_rule(access_rule, region_name)

                # Fix broken hub tier transition exits (closure variables can't be resolved)
                self._fix_hub_tier_exits(region_name, exits)

                # Transform location rules
                for loc_data in region_data.get('locations', []):
                    access_rule = loc_data.get('access_rule')
                    if access_rule:
                        loc_data['access_rule'] = self._transform_location_rule(
                            access_rule, loc_data, region_name
                        )

        # Remove the helpers section only for this player
        if 'helpers' in data:
            helpers_to_process = [my_player_id] if my_player_id and my_player_id in data.get('helpers', {}) else list(data.get('helpers', {}).keys())
            for player_id in helpers_to_process:
                if player_id in data['helpers']:
                    helpers = data['helpers'][player_id]
                    for helper_name in ['can_build', 'can_produce', 'can_produce_all',
                                        'has_recipe', 'is_recipe_producible',
                                        'can_handcraft_single_part']:
                        helpers.pop(helper_name, None)

        return data

    def _transform_rule(self, rule: Dict[str, Any], context: str = "") -> Dict[str, Any]:
        """Transform a single rule node recursively.

        Rules can be in two formats:
        1. Rule Builder format: {"rule": "Has", "args": {...}} or {"rule": "And", "children": [...]}
        2. Raw AST format: {"type": "function_call", "function": {...}, "args": [...]}

        This method handles both formats.
        """
        if not isinstance(rule, dict):
            return rule

        rule_type = rule.get("rule", "")
        ast_type = rule.get("type", "")

        # === Rule Builder format (has "rule" key) ===

        # Handle AST_function_call for state_logic methods
        if rule_type == "AST_function_call":
            return self._transform_ast_function_call(rule, context)

        # Handle And/Or recursively
        if rule_type in ("And", "Or"):
            children = rule.get("children", [])
            transformed = [self._transform_rule(c, context) for c in children]
            if rule_type == "And":
                return _make_and(transformed)
            else:
                return _make_or(transformed)

        # Handle pipes_rule helper
        if rule_type == "pipes_rule":
            return _make_pipes_rule()

        # Handle radio_active_rule helper
        if rule_type == "radio_active_rule":
            return _make_radio_active_rule()

        # Handle AST_subscript for belt_rule[N]
        if rule_type == "AST_subscript":
            return self._transform_subscript(rule)

        # Handle AST_generic_helper
        if rule_type == "AST_generic_helper":
            return self._transform_generic_helper(rule, context)

        # Handle Conditional (ShopSlot rules)
        if rule_type == "Conditional":
            return self._transform_conditional(rule)

        # Handle AST_all_of (milestone entrance rules with handcrafting)
        if rule_type == "AST_all_of":
            return self._transform_all_of(rule, context)

        # === Raw AST format (has "type" key, no "rule" key) ===

        # Handle raw function_call (state_logic.method calls)
        if ast_type == "function_call" and not rule_type:
            return self._transform_raw_function_call(rule, context)

        # Handle raw "and" boolean operation
        if ast_type == "and" and not rule_type:
            left = rule.get("left", {})
            right = rule.get("right", {})
            return _make_and([
                self._transform_rule(left, context),
                self._transform_rule(right, context),
            ])

        # Handle raw "or" boolean operation
        if ast_type == "or" and not rule_type:
            left = rule.get("left", {})
            right = rule.get("right", {})
            return _make_or([
                self._transform_rule(left, context),
                self._transform_rule(right, context),
            ])

        # Handle raw all_of (milestone entrance rules)
        if ast_type == "all_of" and not rule_type:
            return self._transform_all_of(
                {"rule": "AST_all_of", "args": rule}, context
            )

        # Handle raw attribute access (e.g., state_logic.pipes_rule)
        if ast_type == "attribute" and not rule_type:
            obj = rule.get("object", {})
            attr = rule.get("attr", "")
            obj_name = obj.get("name", "")
            if obj_name in ("self", "state_logic"):
                if attr == "pipes_rule":
                    return _make_pipes_rule()
                if attr == "radio_active_rule":
                    return _make_radio_active_rule()

        # Handle raw subscript (belt_rule[N])
        if ast_type == "subscript" and not rule_type:
            value = rule.get("value", {})
            if isinstance(value, dict) and value.get("attr") == "belt_rule":
                idx = _eval_constant_expr(rule.get("index", {}))
                if idx is not None:
                    return _make_belt_rule(idx)

        # Handle raw conditional
        if ast_type == "conditional" and not rule_type:
            test = rule.get("test", {})
            if_true = rule.get("if_true", {})
            if_false = rule.get("if_false", {})
            transformed_true = self._transform_rule(if_true, context) if isinstance(if_true, dict) else if_true
            transformed_false = self._transform_rule(if_false, context) if isinstance(if_false, dict) else if_false
            # Check for constant test
            if isinstance(test, dict):
                if test.get("type") == "constant":
                    return transformed_true if test.get("value") else transformed_false
                if test.get("type") == "not":
                    operand = test.get("operand", {})
                    if isinstance(operand, dict) and operand.get("type") == "constant":
                        return transformed_false if operand.get("value") else transformed_true
            return _make_or([transformed_true, transformed_false]) if isinstance(transformed_true, dict) and isinstance(transformed_false, dict) else rule

        # Handle raw item_check
        if ast_type == "item_check" and not rule_type:
            item = rule.get("item", "")
            if isinstance(item, str):
                return _make_has(item)

        return rule

    def _transform_raw_function_call(self, rule: Dict[str, Any], context: str = "") -> Dict[str, Any]:
        """Transform raw AST function_call format (type='function_call').

        Raw format: {"type": "function_call", "function": {...}, "args": [...]}
        """
        func = rule.get("function", {})
        if func.get("type") == "attribute":
            obj = func.get("object", {})
            attr = func.get("attr", "")
            obj_name = obj.get("name", "")

            if obj_name == "state_logic":
                # Extract constant args from raw format
                raw_args = rule.get("args", [])
                call_args = []
                for arg in raw_args:
                    if isinstance(arg, dict):
                        if arg.get("type") == "constant":
                            call_args.append(arg.get("value"))
                        elif arg.get("type") == "tuple":
                            call_args.append([
                                elem.get("value") for elem in arg.get("elements", [])
                                if elem.get("type") == "constant"
                            ])
                        else:
                            call_args.append(None)
                    else:
                        call_args.append(arg)

                if attr == "can_build" and call_args:
                    name = call_args[0]
                    if name is not None:
                        return _resolve_can_build(name)

                if attr == "can_build_all" and call_args:
                    names = call_args[0]
                    if names is not None:
                        return _resolve_can_build_all(names)

                if attr == "can_produce_all" and call_args:
                    parts = call_args[0]
                    if parts is not None:
                        return _resolve_can_produce_all(parts)

                if attr == "can_produce" and call_args:
                    part = call_args[0]
                    if part is not None:
                        return _make_has(PART_EVENT_PREFIX + part)

                if attr == "can_power" and call_args:
                    power_name = call_args[0]
                    if power_name is not None:
                        return _make_has(BUILDING_EVENT_PREFIX + str(power_name))

                if attr == "has_recipe" and call_args:
                    recipe_name = call_args[0]
                    if isinstance(recipe_name, str):
                        return _make_has(recipe_name)

                if attr == "can_build_any" and call_args:
                    names = call_args[0]
                    if names is not None and isinstance(names, (list, tuple)):
                        return _make_has_any([BUILDING_EVENT_PREFIX + n for n in names])

                logger.debug(f"Unresolved raw state_logic.{attr} call in {context}")

        return rule

    def _transform_ast_function_call(self, rule: Dict[str, Any], context: str = "") -> Dict[str, Any]:
        """Transform AST_function_call rules (state_logic.method calls)."""
        args = rule.get("args", {})
        func = args.get("function", {})

        if func.get("type") == "attribute":
            obj = func.get("object", {})
            attr = func.get("attr", "")
            obj_name = obj.get("name", "")

            if obj_name == "state_logic":
                call_args = _extract_constant_args(rule)

                if attr == "can_build" and call_args:
                    name = call_args[0]
                    if name is not None:
                        return _resolve_can_build(name)

                if attr == "can_build_all" and call_args:
                    names = call_args[0]
                    if names is not None:
                        return _resolve_can_build_all(names)

                if attr == "can_produce_all" and call_args:
                    parts = call_args[0]
                    if parts is not None:
                        return _resolve_can_produce_all(parts)

                if attr == "can_produce" and call_args:
                    part = call_args[0]
                    if part is not None:
                        return _make_has(PART_EVENT_PREFIX + part)

                if attr == "can_power" and call_args:
                    power_name = call_args[0]
                    if power_name is not None:
                        return _make_has(BUILDING_EVENT_PREFIX + str(power_name))

                if attr == "has_recipe" and call_args:
                    # has_recipe checks state.has(recipe.name, player)
                    # but recipe is often an object. If we have the name, use it.
                    recipe_name = call_args[0]
                    if isinstance(recipe_name, str):
                        return _make_has(recipe_name)

                if attr == "can_build_any" and call_args:
                    names = call_args[0]
                    if names is not None:
                        if isinstance(names, (list, tuple)):
                            return _make_has_any([BUILDING_EVENT_PREFIX + n for n in names])

                logger.debug(f"Unresolved state_logic.{attr} call in {context}")

        return rule

    def _transform_all_of(self, rule: Dict[str, Any], context: str = "") -> Dict[str, Any]:
        """Transform AST_all_of rules (milestone entrance handcraft checks).

        These have the pattern: all(can_handcraft_single_part(state, part) for part in parts)
        where parts is a dict like {"Concrete": 200, "Iron Plate": 100, ...}
        """
        args = rule.get("args", {})
        element_rule = args.get("element_rule", {})
        iterator_info = args.get("iterator_info", {})

        # Check if this is a handcraft_single_part capability check.
        # The element_rule can appear in two forms:
        # 1. Generic expansion: {"type": "capability", "capability": "handcraft_single_part"}
        # 2. Raw AST export: {"type": "helper", "name": "can_handcraft_single_part", ...}
        capability = element_rule.get("capability", "")
        helper_name = element_rule.get("name", "")
        is_handcraft = (
            capability == "handcraft_single_part"
            or (element_rule.get("type") == "helper" and helper_name == "can_handcraft_single_part")
        )
        if is_handcraft and self._critical_path:
            # Extract the parts from the iterator
            iterator = iterator_info.get("iterator", {})
            parts_value = iterator.get("value") if isinstance(iterator, dict) else None

            if isinstance(parts_value, dict):
                # Parts dict like {"Concrete": 200, "Iron Plate": 100}
                part_names = list(parts_value.keys())
                return self._build_handcraft_all_rule(part_names)
            elif isinstance(parts_value, (list, tuple)):
                return self._build_handcraft_all_rule(parts_value)

        # Fallback: pass through
        return rule

    def _transform_subscript(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Transform AST_subscript for belt_rule[N]."""
        args = rule.get("args", {})
        value = args.get("value", {})
        index_expr = args.get("index", {})

        if value.get("attr") == "belt_rule":
            idx = _eval_constant_expr(index_expr)
            if idx is not None:
                return _make_belt_rule(idx)

        return rule

    def _transform_generic_helper(self, rule: Dict[str, Any], context: str = "") -> Dict[str, Any]:
        """Transform AST_generic_helper (e.g., is_recipe_producible)."""
        args = rule.get("args", {})
        helper_name = args.get("name", "")

        if helper_name == "is_recipe_producible":
            # Can't resolve without recipe data - return True_ as the
            # actual recipe check will be handled at location level
            return _make_true()

        return rule

    def _transform_location_rule(
        self, rule: Dict[str, Any], loc_data: Dict[str, Any], region_name: str
    ) -> Dict[str, Any]:
        """Transform a location's access rule using game logic data."""
        loc_name = loc_data.get("name", "")

        # Part locations: "Can Produce: <Part> in <Building>"
        part_match = re.match(r"^Can Produce: (.+) in (.+)$", loc_name)
        if part_match and self._game_logic:
            part_name = part_match.group(1)
            building_name = part_match.group(2)
            return self._build_part_location_rule(part_name, building_name)

        # EventBuilding locations: "Can Build: <Building>" in Overworld
        build_match = re.match(r"^Can Build: (.+)$", loc_name)
        if build_match and region_name == "Overworld" and self._game_logic:
            building_name = build_match.group(1)
            # Check if this is a power infrastructure event
            if building_name.startswith("Power level: "):
                return self._build_power_infrastructure_rule(building_name)
            return self._build_event_building_rule(building_name)

        # ElevatorPhase locations: "Elevator Phase N" in Overworld
        phase_match = re.match(r"^Elevator Phase (\d+)$", loc_name)
        if phase_match and region_name == "Overworld" and self._game_logic:
            phase_num = int(phase_match.group(1))
            return self._build_elevator_phase_rule(phase_num)

        # HardDrive locations: "Hard drive random check N"
        hd_match = re.match(r"^Hard drive random check (\d+)$", loc_name)
        if hd_match and self._game_logic:
            hd_num = int(hd_match.group(1))
            return self._build_hard_drive_rule(hd_num)

        # AWESOME Shop purchase locations
        shop_match = re.match(r"^AWESOME Shop purchase (\d+)$", loc_name)
        if shop_match:
            return self._build_shop_rule(int(shop_match.group(1)))

        # Default: transform recursively
        return self._transform_rule(rule, f"location:{loc_name}")

    def _build_part_location_rule(self, part_name: str, building_name: str) -> Dict[str, Any]:
        """Build a complete rule for a Part location using game logic."""
        recipes = self._game_logic.recipes.get(part_name, ())  # type: ignore[union-attr]
        final_phase = self._options.final_elevator_phase.value if self._options else 5

        # Filter recipes for this building and phase
        matching_recipes = [
            r for r in recipes
            if (r.building or "Overworld") == building_name
            and r.minimal_phase <= final_phase
        ]

        if not matching_recipes:
            logger.warning(f"No recipes found for '{part_name}' in '{building_name}'")
            return _make_true()

        # Build an Or of recipe rules (one per matching recipe)
        recipe_rules = []
        for recipe in matching_recipes:
            recipe_rules.append(self._build_single_recipe_rule(recipe))

        return _make_or(recipe_rules)

    def _build_single_recipe_rule(self, recipe) -> Dict[str, Any]:
        """Build the rule for a single recipe (is_recipe_producible + extras)."""
        conditions = []

        # has_recipe: check if player has the recipe item
        implicitly_unlocked = set()
        if self._critical_path:
            implicitly_unlocked = getattr(self._critical_path, 'implicitly_unlocked', set())

        if recipe.name not in implicitly_unlocked:
            # Use the source item name if this recipe is an indirect recipe target
            # (e.g., "Recipe: Distilled Silica" is resolved from "Recipe: Quartz Purification")
            recipe_item_name = self._get_base_recipe_name(recipe.name)
            conditions.append(_make_has(recipe_item_name))

        # can_build: check building (redundant with region entrance, but safe)
        if recipe.building:
            conditions.append(_make_has(BUILDING_EVENT_PREFIX + recipe.building))

        # can_produce_all: check inputs
        if recipe.inputs:
            conditions.append(_make_has_all([PART_EVENT_PREFIX + inp for inp in recipe.inputs]))

        # pipes_rule
        if recipe.needs_pipes:
            conditions.append(_make_pipes_rule())

        # radio_active_rule
        if recipe.is_radio_active:
            conditions.append(_make_radio_active_rule())

        # NOTE: belt_rule is dead code in Python's StateLogic.py - the belt_rule
        # callable is referenced but never called with (state), so it always
        # evaluates as truthy. We omit it here to match actual Python behavior.

        return _make_and(conditions)

    def _build_handcraft_rule(self, part_name: str, _depth: int = 0) -> Dict[str, Any]:
        """Build a rule matching can_handcraft_single_part for a given part.

        The rule is: Can Produce (from buildings) OR (has recipe AND can handcraft all inputs).
        This mirrors StateLogic.can_handcraft_single_part exactly.
        """
        if _depth > 15:
            return _make_true()

        options = []

        # Option 1: part is already produced by a building (Can Produce event)
        options.append(_make_has(PART_EVENT_PREFIX + part_name))

        # Option 2: handcraft using recipes
        handcraftable = {}
        if self._critical_path:
            handcraftable = getattr(self._critical_path, 'handcraftable_parts', {})

        if part_name in handcraftable:
            recipes = handcraftable[part_name]
            for recipe in recipes:
                recipe_conditions = []

                # Need the recipe
                implicitly_unlocked = set()
                if self._critical_path:
                    implicitly_unlocked = getattr(self._critical_path, 'implicitly_unlocked', set())

                if recipe.name not in implicitly_unlocked:
                    recipe_item_name = self._get_base_recipe_name(recipe.name)
                    recipe_conditions.append(_make_has(recipe_item_name))

                # Need to be able to handcraft all inputs
                if recipe.inputs:
                    for inp in recipe.inputs:
                        recipe_conditions.append(self._build_handcraft_rule(inp, _depth + 1))

                if recipe_conditions:
                    options.append(_make_and(recipe_conditions))
                else:
                    # No conditions needed - recipe is always available
                    options.append(_make_true())

        return _make_or(options)

    def _build_handcraft_all_rule(self, parts) -> Dict[str, Any]:
        """Build a rule matching get_can_produce_all_allowing_handcrafting_rule.

        Checks that all given parts can be handcrafted (or produced).
        """
        if not parts:
            return _make_true()

        conditions = []
        for part in parts:
            conditions.append(self._build_handcraft_rule(part))

        return _make_and(conditions)

    def _build_event_building_rule(self, building_name: str) -> Dict[str, Any]:
        """Build rule for EventBuilding location 'Can Build: <Building>'."""
        building = self._game_logic.buildings.get(building_name)  # type: ignore[union-attr]
        if not building:
            logger.warning(f"Building '{building_name}' not found in game logic")
            return _make_true()

        conditions = []

        # has_recipe: check if player has the building's recipe
        implicitly_unlocked = set()
        if self._critical_path:
            implicitly_unlocked = getattr(self._critical_path, 'implicitly_unlocked', set())

        if building.name not in implicitly_unlocked:
            conditions.append(_make_has(building.name))

        # can_power: check power requirement
        if building.power_requirement:
            conditions.append(_make_has(BUILDING_EVENT_PREFIX + building.power_requirement.to_name()))

        # handcrafting_rule: check building inputs can be handcrafted
        if building.inputs:
            conditions.append(self._build_handcraft_all_rule(building.inputs))

        return _make_and(conditions)

    def _build_elevator_phase_rule(self, phase_num: int) -> Dict[str, Any]:
        """Build rule for 'Elevator Phase N' location."""
        conditions = []

        # Need Space Elevator building
        conditions.append(_make_has(BUILDING_EVENT_PREFIX + "Space Elevator"))

        # Need to produce all parts for this phase
        phase_index = phase_num - 1
        if phase_index < len(self._game_logic.space_elevator_phases):  # type: ignore[union-attr]
            parts = list(self._game_logic.space_elevator_phases[phase_index].keys())  # type: ignore[union-attr]
            if parts:
                conditions.append(_resolve_can_produce_all(parts))

        return _make_and(conditions)

    def _build_power_infrastructure_rule(self, power_name: str) -> Dict[str, Any]:
        """Build rule for power infrastructure locations."""
        from worlds.satisfactory.GameLogic import PowerInfrastructureLevel

        # Find the power level
        target_level = None
        for level in PowerInfrastructureLevel:
            if level.to_name() == power_name:
                target_level = level
                break

        if target_level is None:
            return _make_true()

        # Power infrastructure can be achieved by having any higher power level
        # OR by being able to build any of the buildings at this level
        conditions = []

        # Higher power levels
        higher_levels = [level for level in PowerInfrastructureLevel if level > target_level]
        for level in higher_levels:
            conditions.append(_make_has(BUILDING_EVENT_PREFIX + level.to_name()))

        # Buildings at this power level
        recipes = self._game_logic.requirement_per_powerlevel.get(target_level, [])  # type: ignore[union-attr]
        for recipe in recipes:
            if recipe.building:
                conditions.append(_make_has(BUILDING_EVENT_PREFIX + recipe.building))

        if conditions:
            return _make_or(conditions)
        return _make_true()

    def _build_hard_drive_rule(self, hd_num: int) -> Dict[str, Any]:
        """Build rule for 'Hard drive random check N' from game data.

        The Python rule is: can_build("MAM") AND (not unlocked_by OR can_produce(unlocked_by))
        where unlocked_by comes from DropPodData.item for the sorted drop pod list.

        When unlocked_by is None, simplifies to: Has("Can Build: MAM")
        When unlocked_by is set, simplifies to: And(Has("Can Build: MAM"), Has("Can Produce: item"))
        """
        if not hasattr(self, '_sorted_drop_pods'):
            self._sorted_drop_pods = sorted(
                self._game_logic.drop_pods,  # type: ignore[union-attr]
                key=lambda dp: ("!" if dp.item is None else dp.item) + str(dp.x - dp.z)
            )

        pod_index = hd_num - 1
        if pod_index < 0 or pod_index >= len(self._sorted_drop_pods):
            logger.warning(f"Hard drive {hd_num} out of range (max {len(self._sorted_drop_pods)})")
            return _make_has(BUILDING_EVENT_PREFIX + "MAM")

        pod = self._sorted_drop_pods[pod_index]
        conditions = [_make_has(BUILDING_EVENT_PREFIX + "MAM")]

        if pod.item:
            conditions.append(_make_has(PART_EVENT_PREFIX + pod.item))

        return _make_and(conditions)

    def _build_shop_rule(self, slot_num: int) -> Dict[str, Any]:
        """Build rule for AWESOME Shop purchase locations.

        Shop slots have a coupon cost that determines elevator phase requirements:
        - cost < 20: always accessible (True)
        - 20 <= cost < 50: is_elevator_phase(1)
        - 50 <= cost < 100: is_elevator_phase(2)
        - cost >= 100: is_elevator_phase(3)

        is_elevator_phase applies: limited_phase = min(final_elevator_phase - 1, phase)
        If limited_phase == 0, return True; else Has("Elevator Phase {limited_phase}").
        """
        cost = SHOP_SLOT_COSTS.get(slot_num, 0)

        if cost < 20:
            return _make_true()
        elif cost < 50:
            phase = 1
        elif cost < 100:
            phase = 2
        else:
            phase = 3

        # Apply is_elevator_phase logic
        final_phase = self._options.final_elevator_phase.value if self._options else 5
        limited_phase = min(final_phase - 1, phase)

        if limited_phase != 0:
            return _make_has(f"Elevator Phase {limited_phase}")
        else:
            return _make_true()

    def _fix_hub_tier_exits(self, region_name: str, exits: list) -> None:
        """Fix broken hub tier transition exit rules.

        The Python code uses closure variables (player, is_universal_tracker) that
        the AST analyzer can't resolve, producing empty {} rule nodes.

        Hub tier transitions from Python Regions.py:
        - Hub Tier 1 -> Hub Tier 2: can_build_all(super_early_game_buildings)
        - Hub Tier 2 -> Hub Tier 3: Has("Elevator Phase 1") AND can_build_all(early_game_buildings)
        - Hub Tier 4 -> Hub Tier 5: Has("Elevator Phase 2")
        - Hub Tier 6 -> Hub Tier 7: Has("Elevator Phase 3")
        - Hub Tier 8 -> Hub Tier 9: Has("Elevator Phase 4")
        """
        if not self._options:
            return

        for exit_data in exits:
            rule = exit_data.get('access_rule', {})
            rule_str = json.dumps(rule)
            if '{}' not in rule_str:
                continue

            # This exit has unresolved empty rules - rebuild it
            rebuilt = self._rebuild_hub_tier_exit_rule(region_name)
            if rebuilt:
                exit_data['access_rule'] = rebuilt

    def _rebuild_hub_tier_exit_rule(self, region_name: str) -> Optional[Dict[str, Any]]:
        """Rebuild the hub tier transition rule for a given region."""
        from worlds.satisfactory.Options import Placement
        from worlds.satisfactory.GameLogic import PowerInfrastructureLevel

        if not self._options:
            return None

        final_phase = self._options.final_elevator_phase.value

        if region_name == "Hub Tier 1":
            # Hub Tier 1 -> Hub Tier 2: can_build_all(super_early_game_buildings)
            buildings = ["Foundation", "Walls Orange"]
            if self._options.splitter_placement == Placement.early:
                buildings.extend(["Conveyor Splitter", "Conveyor Merger"])
            if final_phase == 1:
                # When final_phase == 1, early_game_buildings are merged into super_early
                buildings.append(PowerInfrastructureLevel.Automated.to_name())
                if self._options.mam_logic_placement.value == Placement.early:
                    buildings.append("MAM")
                if self._options.awesome_logic_placement.value == Placement.early:
                    buildings.extend(["AWESOME Sink", "AWESOME Shop"])
                if self._options.energy_link_logic_placement.value == Placement.early:
                    buildings.append("Power Storage")
            items = [BUILDING_EVENT_PREFIX + b for b in buildings]
            return _make_has_all(items)

        elif region_name == "Hub Tier 2" and final_phase >= 2:
            # Hub Tier 2 -> Hub Tier 3: Has("Elevator Phase 1") AND can_build_all(early_game_buildings)
            conditions = [_make_has("Elevator Phase 1")]
            buildings = [PowerInfrastructureLevel.Automated.to_name()]
            if self._options.mam_logic_placement.value == Placement.early:
                buildings.append("MAM")
            if self._options.awesome_logic_placement.value == Placement.early:
                buildings.extend(["AWESOME Sink", "AWESOME Shop"])
            if self._options.energy_link_logic_placement.value == Placement.early:
                buildings.append("Power Storage")
            items = [BUILDING_EVENT_PREFIX + b for b in buildings]
            conditions.append(_make_has_all(items))
            return _make_and(conditions)

        elif region_name == "Hub Tier 4" and final_phase >= 3:
            return _make_has("Elevator Phase 2")

        elif region_name == "Hub Tier 6" and final_phase >= 4:
            return _make_has("Elevator Phase 3")

        elif region_name == "Hub Tier 8" and final_phase >= 5:
            return _make_has("Elevator Phase 4")

        return None

    def _transform_conditional(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Transform Conditional rules.

        Conditionals that still reference state_logic need to be resolved.
        Most shop conditionals are handled by _build_shop_rule at the location level,
        but this catches any remaining ones.
        """
        # Try to extract the test and branches
        args = rule.get("args", {})
        test = args.get("test", {})
        if_true = args.get("if_true", {})
        if_false = args.get("if_false", {})

        # Transform branches recursively
        transformed_true = self._transform_rule(if_true, "conditional_true") if isinstance(if_true, dict) else if_true
        transformed_false = self._transform_rule(if_false, "conditional_false") if isinstance(if_false, dict) else if_false

        # If test is a simple True/False constant, simplify
        if isinstance(test, dict):
            cond_type = test.get("type", "")
            if cond_type == "constant":
                val = test.get("value")
                if val is True:
                    return transformed_true
                elif val is False:
                    return transformed_false

            # If test is a negation of True (not True → False), take false branch
            if cond_type == "not":
                operand = test.get("operand", {})
                if isinstance(operand, dict) and operand.get("type") == "constant" and operand.get("value") is True:
                    return transformed_false

        # Can't simplify: use Or of both branches as safe approximation
        if isinstance(transformed_true, dict) and isinstance(transformed_false, dict):
            return _make_or([transformed_true, transformed_false])
        return rule
