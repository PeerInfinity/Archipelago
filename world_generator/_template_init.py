"""Init template generation for Archipelago world files.

Contains the __init__.py generator (the largest single template function).
"""

from typing import Any, Dict, Optional

from ._template_utils import _format_dict_repr, is_valid_identifier
from .extractors import ExtractedData
from ._sanitization import sanitize_for_class_name


def _generate_completion_lambda(rule_dict: Dict[str, Any],
                                helpers: Optional[Dict[str, Any]] = None) -> Optional[str]:
    """Generate a Python lambda string from an analyzed completion condition rule.

    Pattern-matches the analyzed rule JSON and returns a lambda string like:
        lambda state: state.has("Item", self.player)

    Args:
        rule_dict: Analyzed rule dictionary from the exporter's analyze_rule()
        helpers: Optional dict of helper name -> HelperData for resolving helper references

    Returns:
        Lambda body string (the part after "lambda state: "), or None if unrecognized
    """
    rule_type = rule_dict.get('type')

    if rule_type in ('item_check', 'count_check'):
        item_raw = rule_dict.get('item', '')
        # item can be a string or a dict (e.g., f_string with a 'value' field)
        item = _extract_constant_value(item_raw) if isinstance(item_raw, dict) else item_raw
        if not isinstance(item, str):
            return None
        item_escaped = item.replace('\\', '\\\\').replace('"', '\\"')
        count_raw = rule_dict.get('count')
        # count can be an int or a dict (e.g., {"type": "constant", "value": 9})
        count = _extract_constant_value(count_raw) if isinstance(count_raw, dict) else count_raw
        if isinstance(count, int) and count > 1:
            return f'state.has("{item_escaped}", self.player, {count})'
        elif count is not None and not isinstance(count, int):
            return None  # Can't handle non-constant counts (e.g., helper-based)
        return f'state.has("{item_escaped}", self.player)'

    if rule_type == 'location_check':
        # location_check -> state.can_reach(location, "Location", self.player)
        loc_raw = rule_dict.get('location', '')
        loc = _extract_constant_value(loc_raw) if isinstance(loc_raw, dict) else loc_raw
        if isinstance(loc, str):
            loc_escaped = loc.replace('\\', '\\\\').replace('"', '\\"')
            return f'state.can_reach("{loc_escaped}", "Location", self.player)'

    if rule_type == 'can_reach':
        # Top-level can_reach (not wrapped in state_method)
        region = rule_dict.get('region', '')
        resolution = rule_dict.get('resolution', 'Region')
        if isinstance(region, str) and isinstance(resolution, str):
            region_escaped = region.replace('\\', '\\\\').replace('"', '\\"')
            res_escaped = resolution.replace('\\', '\\\\').replace('"', '\\"')
            return f'state.can_reach("{region_escaped}", "{res_escaped}", self.player)'

    if rule_type == 'state_method':
        method = rule_dict.get('method', '')
        args = rule_dict.get('args', [])

        if method == 'has_all_counts' and args:
            # args[0] should be a dict or constant wrapping a dict
            counts_dict = _extract_constant_value(args[0])
            if isinstance(counts_dict, dict):
                entries = ', '.join(
                    f'"{k.replace(chr(92), chr(92)+chr(92)).replace(chr(34), chr(92)+chr(34))}": {v}'
                    for k, v in counts_dict.items()
                )
                return f'state.has_all_counts({{{entries}}}, self.player)'

        if method in ('has_all', 'has_any') and args:
            items_list = _extract_constant_value(args[0])
            if isinstance(items_list, list):
                items_str = ', '.join(
                    f'"{i.replace(chr(92), chr(92)+chr(92)).replace(chr(34), chr(92)+chr(34))}"'
                    for i in items_list
                )
                return f'state.{method}([{items_str}], self.player)'

        if method == 'can_reach' and len(args) >= 2:
            target = _extract_constant_value(args[0])
            reach_type = _extract_constant_value(args[1])
            if isinstance(target, str) and isinstance(reach_type, str):
                target_escaped = target.replace('\\', '\\\\').replace('"', '\\"')
                type_escaped = reach_type.replace('\\', '\\\\').replace('"', '\\"')
                return f'state.can_reach("{target_escaped}", "{type_escaped}", self.player)'

        if method == 'can_reach_location' and args:
            loc = _extract_constant_value(args[0])
            if isinstance(loc, str):
                loc_escaped = loc.replace('\\', '\\\\').replace('"', '\\"')
                return f'state.can_reach_location("{loc_escaped}", self.player)'

    if rule_type == 'helper' and helpers:
        helper_name = rule_dict.get('name', '')
        helper_args = rule_dict.get('args', [])
        helper_data = helpers.get(helper_name)
        if helper_data is not None:
            body = helper_data.body if hasattr(helper_data, 'body') else helper_data.get('body')
            params = helper_data.params if hasattr(helper_data, 'params') else helper_data.get('params', [])
            if body:
                # Substitute args into the body if the helper has parameters
                resolved_body = body
                if params and helper_args:
                    resolved_body = _substitute_helper_args(body, params, helper_args)
                return _generate_completion_lambda(resolved_body, helpers=helpers)

    if rule_type == 'and':
        conditions = rule_dict.get('conditions', [])
        parts = []
        for cond in conditions:
            part = _generate_completion_lambda(cond, helpers=helpers)
            if part is None:
                return None
            parts.append(part)
        if parts:
            return ' and '.join(parts)

    if rule_type == 'or':
        conditions = rule_dict.get('conditions', [])
        parts = []
        for cond in conditions:
            part = _generate_completion_lambda(cond, helpers=helpers)
            if part is None:
                return None
            parts.append(f'({part})' if ' and ' in part else part)
        if parts:
            return ' or '.join(parts)

    # Fallback: walk the tree looking for the first item_check
    first_item_check = _find_first_item_check(rule_dict)
    if first_item_check:
        return _generate_completion_lambda(first_item_check, helpers=helpers)

    return None


def _extract_constant_value(arg: Any) -> Any:
    """Extract the value from a constant wrapper or return as-is."""
    if isinstance(arg, dict):
        if arg.get('type') == 'constant':
            return arg.get('value')
        if arg.get('type') == 'f_string' and 'value' in arg:
            return arg.get('value')
        # Some analyzers put values directly
        if 'value' in arg:
            return arg.get('value')
    return arg


def _substitute_helper_args(body: Dict[str, Any], params: list, args: list) -> Dict[str, Any]:
    """Substitute helper arguments into a helper body.

    Replaces {"type": "name", "name": param_name} nodes with the corresponding
    argument value from the call site.
    """
    import copy
    result = copy.deepcopy(body)
    # Build param -> arg mapping
    param_map = {}
    for i, param_name in enumerate(params):
        if i < len(args):
            param_map[param_name] = args[i]
    return _substitute_names(result, param_map)


def _substitute_names(node: Any, param_map: Dict[str, Any]) -> Any:
    """Recursively substitute name references in a rule tree."""
    if isinstance(node, dict):
        if node.get('type') == 'name' and node.get('name') in param_map:
            return param_map[node['name']]
        return {k: _substitute_names(v, param_map) for k, v in node.items()}
    if isinstance(node, list):
        return [_substitute_names(item, param_map) for item in node]
    return node


def _find_first_item_check(rule_dict: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Recursively find the first item_check or count_check node in a rule tree."""
    if not isinstance(rule_dict, dict):
        return None
    if rule_dict.get('type') in ('item_check', 'count_check'):
        return rule_dict
    for key in ('conditions', 'condition', 'left', 'right'):
        val = rule_dict.get(key)
        if isinstance(val, list):
            for item in val:
                found = _find_first_item_check(item)
                if found:
                    return found
        elif isinstance(val, dict):
            found = _find_first_item_check(val)
            if found:
                return found
    return None


def generate_init_py(data: ExtractedData, canonical_seed: Optional[int] = None) -> str:
    """Generate __init__.py (main world file) content.

    Args:
        data: Extracted game data
        canonical_seed: If set, include canonical placement behavior for this seed number
    """
    game_name = data.metadata.game_name
    class_name = sanitize_for_class_name(game_name)
    world_class = data.metadata.world_class_name

    # Build canonical placements dict (only needed if canonical_seed is enabled)
    # canonical_class_attr_entries: vanilla locations for the exporter (from canonical_placements)
    # original_seed_placement_entries: actual seed 1 placements for _place_original_items()
    canonical_class_attr_entries = []  # For the class attribute (exporter to read)
    original_seed_placement_entries = []  # For actual item placement at runtime
    advancement_loc_entries = []  # Locations that should have advancement items
    if canonical_seed is not None:
        # canonical_placements class attribute uses vanilla locations (for exporter)
        canonical_source = data.canonical_placements if data.canonical_placements else data.original_placements
        for loc_name, item_name in canonical_source.items():
            if item_name:  # Skip empty placements
                loc_escaped = loc_name.replace('\\', '\\\\').replace('"', '\\"')
                item_escaped = item_name.replace('\\', '\\\\').replace('"', '\\"')
                canonical_class_attr_entries.append(f'        "{loc_escaped}": "{item_escaped}",')

        # original_seed_placements uses actual seed 1 placements (for _place_original_items)
        for loc_name, item_name in data.original_placements.items():
            if item_name:  # Skip empty placements
                loc_escaped = loc_name.replace('\\', '\\\\').replace('"', '\\"')
                item_escaped = item_name.replace('\\', '\\\\').replace('"', '\\"')
                original_seed_placement_entries.append(f'        "{loc_escaped}": "{item_escaped}",')
                # Track locations that should have advancement items
                if data.canonical_placement_advancements.get(loc_name, False):
                    advancement_loc_entries.append(f'        "{loc_escaped}",')

    canonical_class_attr_content = '\n'.join(canonical_class_attr_entries)
    original_seed_placements_content = '\n'.join(original_seed_placement_entries)
    advancement_loc_content = '\n'.join(advancement_loc_entries)

    # Build canonical advancement dict (maps location -> original advancement value)
    # This is used by the exporter to preserve original advancement values during cross-validation
    canonical_advancement_entries = []
    if canonical_seed is not None and data.canonical_placement_advancements:
        for loc_name, advancement in data.canonical_placement_advancements.items():
            loc_escaped = loc_name.replace('\\', '\\\\').replace('"', '\\"')
            canonical_advancement_entries.append(f'        "{loc_escaped}": {advancement},')
    canonical_advancement_content = '\n'.join(canonical_advancement_entries)

    # Find victory location and item (heuristic: event with "victory" in name)
    victory_location = None
    victory_item = None
    all_events = []
    for loc_name, loc_data in data.locations.items():
        if loc_data.is_event:
            item_name = data.original_placements.get(loc_name, '')
            all_events.append((loc_name, item_name))
            if 'victory' in item_name.lower() or 'victory' in loc_name.lower():
                victory_location = loc_name
                victory_item = item_name
                break

    # If no "victory" match found but there's exactly one event, use it as the victory
    if not victory_location and len(all_events) == 1:
        victory_location, victory_item = all_events[0]

    # Determine completion condition lambda body
    completion_lambda_body = None
    if data.completion_condition:
        completion_lambda_body = _generate_completion_lambda(data.completion_condition,
                                                              helpers=data.helpers)

    # Fall back to victory item heuristic
    if completion_lambda_body is None and victory_item:
        vi_escaped = victory_item.replace('\\', '\\\\').replace('"', '\\"')
        completion_lambda_body = f'state.has("{vi_escaped}", self.player)'

    # Build victory_section: place event item + set completion condition
    victory_section = ''
    if victory_location and victory_item and completion_lambda_body:
        # Have both event placement and completion condition
        victory_section = f'''
    def generate_basic(self) -> None:
        """Place victory event item and set completion condition."""
        victory_location = self.multiworld.get_location("{victory_location}", self.player)

        # Only place if not already filled (e.g., by _place_original_items)
        if victory_location.item is None:
            victory_item = {class_name}Item(
                "{victory_item}",
                item_table["{victory_item}"].classification,
                None,
                self.player
            )
            victory_location.place_locked_item(victory_item)

        # Set completion condition
        self.multiworld.completion_condition[self.player] = \\
            lambda state: {completion_lambda_body}
'''
    elif completion_lambda_body:
        # Have completion condition but no event placement needed
        victory_section = f'''
    def generate_basic(self) -> None:
        """Set completion condition."""
        self.multiworld.completion_condition[self.player] = \\
            lambda state: {completion_lambda_body}
'''

    # Generate canonical seed sections only if enabled
    if canonical_seed is not None:
        generate_early_section = f'''
    # Canonical seed for deterministic placement
    CANONICAL_SEED: ClassVar[int] = {canonical_seed}

    def generate_early(self) -> None:
        """Push starting items and load canonical options for canonical seed."""
        self._push_starting_items()
        # Set preset_label for exporter: use class-level label as base, append seed/vanilla suffix
        base_label = getattr(self.__class__, 'preset_label', '')
        if base_label:
            base = base_label.split()[0] if ' ' in base_label else base_label
            is_vanilla = getattr(self.__class__, 'is_vanilla', False)
            self.preset_label = f"{{base}} v" if is_vanilla else f"{{base}} s{{self.multiworld.seed}}"
        if self.multiworld.seed == self.CANONICAL_SEED:
            self.options.randomize_items.value = False
            if self.options.use_canonical_options.value:
                self._load_canonical_options()

    def _load_canonical_options(self) -> None:
        """Load options from _worldgen_options.json for canonical seed generation.

        This ensures that when generating the canonical seed, the same options are used
        as in the original export, producing identical output.
        """
        # Find the options file in the same directory as this module
        world_dir = os.path.dirname(os.path.abspath(__file__))
        options_path = os.path.join(world_dir, '_worldgen_options.json')

        if not os.path.exists(options_path):
            return  # No options file, use defaults

        try:
            with open(options_path, 'r') as f:
                options_data = json.load(f)
        except (json.JSONDecodeError, IOError):
            return  # Can't read options, use defaults

        if not options_data:
            return

        # Map option names from JSON (snake_case) to option attributes
        for option_name, option_value in options_data.items():
            # Get the option attribute if it exists
            if not hasattr(self.options, option_name):
                continue

            option_obj = getattr(self.options, option_name)

            # Handle different option types
            if isinstance(option_value, bool):
                # Toggle options - preserve as boolean to match original world behavior
                # (Original worlds set value = False directly, not value = 0)
                option_obj.value = option_value
            elif isinstance(option_value, int):
                # Range or Choice options with numeric value
                option_obj.value = option_value
            elif isinstance(option_value, str):
                # Choice options with string value - need to look up the value
                # Try to find the corresponding option_* attribute
                option_attr_name = f"option_{{option_value}}"
                if hasattr(option_obj.__class__, option_attr_name):
                    option_obj.value = getattr(option_obj.__class__, option_attr_name)
                else:
                    # Try to use the string directly if the class has a from_text method
                    try:
                        option_obj.value = option_obj.__class__.from_text(option_value).value
                    except (ValueError, KeyError, AttributeError):
                        pass  # Keep existing value
'''
        # Use pre_fill() for canonical placements like the original bakingadventure does
        # This ensures items are created first, then placed/removed from pool later
        create_items_section = f'''
    def create_items(self) -> None:
'''
        # Add pre_fill section for canonical placement
        pre_fill_section = f'''
    def pre_fill(self) -> None:
        """Pre-fill items if not randomizing or when tracking.

        During tracking (generation_is_fake=True), we always place canonical items
        so that location_item_name() checks work correctly for self-locking rules.
        """
        if not self.options.randomize_items.value or getattr(self.multiworld, 'generation_is_fake', False):
            self._place_original_items()

    def _place_original_items(self) -> None:
        """Place items in their original seed locations when not randomized.

        Uses original_seed_placements (actual seed 1 placements) rather than
        canonical_placements (vanilla locations) to match the original world's output.
        Process advancement locations first to ensure they get advancement items.
        This is critical for cross-validation in spoiler tests, where item
        advancement flags determine whether items are counted.
        """
        # Use original_seed_placements (actual seed 1 placements) for placement.
        # canonical_placements contains vanilla locations for the exporter.
        placements = getattr(self, 'original_seed_placements', self.canonical_placements)

        # Two-pass placement: first advancement locations, then the rest
        advancement_locs = getattr(self, 'advancement_locations', set())

        # Sort locations to process advancement locations first
        sorted_placements = sorted(
            placements.items(),
            key=lambda x: 0 if x[0] in advancement_locs else 1
        )

        for location_name, item_name in sorted_placements:
            location = self.multiworld.get_location(location_name, self.player)

            # Skip if already filled (e.g., by _place_locked_items or generate_basic)
            if location.item is not None:
                continue

            # Check if we have expected advancement status for this location (for mixed-class items)
            # This ensures we match the original's progression distribution
            expected_advancement = None
            if hasattr(self, 'canonical_placement_advancements'):
                expected_advancement = self.canonical_placement_advancements.get(location_name)

            # Try to find and use an item from the pool (preserves correct classification)
            # Note: Must use index-based removal because Item.__eq__ only compares name/player,
            # not classification, so list.remove() would remove the wrong item
            item = None
            progression_idx = None
            filler_idx = None

            for idx, pool_item in enumerate(self.multiworld.itempool):
                if pool_item.name == item_name and pool_item.player == self.player:
                    if pool_item.advancement:
                        if progression_idx is None:
                            progression_idx = idx
                    else:
                        if filler_idx is None:
                            filler_idx = idx

                    # If we found both types, stop searching
                    if progression_idx is not None and filler_idx is not None:
                        break

            # Select item based on expected advancement status or fall back to progression-first
            if expected_advancement is True and progression_idx is not None:
                chosen_idx = progression_idx
            elif expected_advancement is False and filler_idx is not None:
                chosen_idx = filler_idx
            elif progression_idx is not None:
                # Default: prefer progression
                chosen_idx = progression_idx
            else:
                chosen_idx = filler_idx

            if chosen_idx is not None:
                item = self.multiworld.itempool.pop(chosen_idx)
            else:
                # Fall back to creating a new item if not found in pool
                item = self.create_item(item_name)

            # Place item without setting locked=True, so the exporter writes
            # locked=false in rules.json (matching the original world's behavior).
            # place_locked_item() would mark these as locked, causing the frontend
            # spoiler test to skip them.
            location.item = item
            item.location = location
'''
    else:
        pre_fill_section = ''
        generate_early_section = '''
    def generate_early(self) -> None:
        """Push starting items as precollected."""
        self._push_starting_items()
        # Set preset_label for exporter: use class-level label as base, append seed/vanilla suffix
        base_label = getattr(self.__class__, 'preset_label', '')
        if base_label:
            base = base_label.split()[0] if ' ' in base_label else base_label
            is_vanilla = getattr(self.__class__, 'is_vanilla', False)
            self.preset_label = f"{base} v" if is_vanilla else f"{base} s{self.multiworld.seed}"
'''
        create_items_section = '''
    def create_items(self) -> None:
'''

    # Build locked_placements dictionary
    # When canonical_placements is available OR canonical_seed is enabled,
    # LOCKED_PLACEMENTS should only contain items that are ALWAYS locked
    # (like Victory events), not items that are canonical but should be randomizable.
    # We determine this by checking if the item is an event (id=None).
    # When canonical_seed is set, we build canonical_placements from original_placements,
    # so non-event items will be placed via canonical_placements instead of LOCKED_PLACEMENTS.
    locked_entries = []
    if data.canonical_placements or canonical_seed is not None:
        # Only include truly locked items (events) - not canonical placements
        for loc_name, item_name in data.locked_placements.items():
            if item_name:
                # Check if this is an event item (id=None) or placed at an event location
                item_data = data.items.get(item_name)
                loc_data = data.locations.get(loc_name)
                is_event_item = item_data and item_data.is_event
                is_event_location = loc_data and loc_data.is_event
                if is_event_item or is_event_location:
                    loc_escaped = loc_name.replace('\\', '\\\\').replace('"', '\\"')
                    item_escaped = item_name.replace('\\', '\\\\').replace('"', '\\"')
                    locked_entries.append(f'    "{loc_escaped}": "{item_escaped}",')
    else:
        # No canonical_placements - use all locked placements as before
        for loc_name, item_name in data.locked_placements.items():
            if item_name:
                loc_escaped = loc_name.replace('\\', '\\\\').replace('"', '\\"')
                item_escaped = item_name.replace('\\', '\\\\').replace('"', '\\"')
                locked_entries.append(f'    "{loc_escaped}": "{item_escaped}",')

    locked_content = '\n'.join(locked_entries)

    # Build starting_items dictionary (preserve original order)
    # Filter out items that are accumulator targets - these should start at 0 and accumulate
    # during gameplay, not be precollected (accumulators are tracked via collect/remove methods)
    accumulator_targets = set()
    if data.accumulator_rules:
        for rule in data.accumulator_rules:
            accumulator_targets.add(rule['target'])

    starting_entries = []
    for item_name, count in data.starting_items.items():
        if count > 0 and item_name not in accumulator_targets:
            item_escaped = item_name.replace('\\', '\\\\').replace('"', '\\"')
            starting_entries.append(f'    "{item_escaped}": {count},')

    starting_content = '\n'.join(starting_entries)

    # Build accumulator_rules list (for state counter patterns like coins)
    accumulator_rules_content = ''
    if data.accumulator_rules:
        rules_items = []
        for rule in data.accumulator_rules:
            # Use raw string for pattern - don't escape backslashes since r"..." preserves them
            pattern_escaped = rule['pattern'].replace('"', '\\"')
            target_escaped = rule['target'].replace('\\', '\\\\').replace('"', '\\"')
            rules_items.append(
                f'        {{"pattern": r"{pattern_escaped}", "extract_value": {rule["extract_value"]}, '
                f'"target": "{target_escaped}", "discriminator": None}},'
            )
        accumulator_rules_content = '\n'.join(rules_items)

    # Build prog_items_init dictionary (initial values for state counters)
    prog_items_init_content = ''
    if data.prog_items_init:
        init_entries = []
        for item_name, value in data.prog_items_init.items():
            item_escaped = item_name.replace('\\', '\\\\').replace('"', '\\"')
            init_entries.append(f'        "{item_escaped}": {value},')
        prog_items_init_content = '\n'.join(init_entries)

    # Generate accumulator_rules section (for state counter patterns like coins)
    collect_remove_section = ''
    if accumulator_rules_content:
        accumulator_rules_section = f'''
    # Accumulator rules for state counters (e.g., coins)
    # These tell the exporter how to parse items like "60 coins" -> add 60 to " coins" counter
    accumulator_rules: ClassVar[list] = [
{accumulator_rules_content}
    ]
'''
        # Generate collect/remove methods for accumulator rules
        collect_remove_section = '''
    def collect(self, state: "CollectionState", item: "Item") -> bool:
        """Collect item and track cumulative counters from accumulator rules."""
        import re
        change = super().collect(state, item)
        if change:
            for rule in self.accumulator_rules:
                match = re.match(rule["pattern"], item.name)
                if match:
                    if rule["extract_value"]:
                        value = int(match.group(1))
                    else:
                        value = 1
                    state.prog_items[item.player][rule["target"]] += value
                    break
        return change

    def remove(self, state: "CollectionState", item: "Item") -> bool:
        """Remove item and update cumulative counters from accumulator rules."""
        import re
        change = super().remove(state, item)
        if change:
            for rule in self.accumulator_rules:
                match = re.match(rule["pattern"], item.name)
                if match:
                    if rule["extract_value"]:
                        value = int(match.group(1))
                    else:
                        value = 1
                    state.prog_items[item.player][rule["target"]] -= value
                    break
        return change
'''
    else:
        accumulator_rules_section = ''

    # Generate prog_items_init section (initial counter values)
    if prog_items_init_content:
        prog_items_init_section = f'''
    # Initial values for prog_items accumulators
    prog_items_init: ClassVar[dict] = {{
{prog_items_init_content}
    }}
'''
    else:
        prog_items_init_section = ''

    # Generate progression_mapping section (for progressive items like progressive-processing)
    progression_mapping_section = ''
    collect_item_section = ''
    if data.progression_mapping:
        prog_map_entries = []
        for prog_name, components in data.progression_mapping.items():
            prog_escaped = prog_name.replace('\\', '\\\\').replace('"', '\\"')
            components_list = ', '.join(f'"{c.replace(chr(92), chr(92)+chr(92)).replace(chr(34), chr(92)+chr(34))}"' for c in components)
            prog_map_entries.append(f'        "{prog_escaped}": [{components_list}],')
        prog_map_content = '\n'.join(prog_map_entries)

        progression_mapping_section = f'''
    # Progressive item mapping: progressive_item -> [component_items_in_order]
    # When collecting a progressive item, it grants access to the next uncollected component
    progression_mapping: ClassVar[Dict[str, list]] = {{
{prog_map_content}
    }}
'''

        collect_item_section = '''
    def collect_item(self, state, item, remove=False):
        """Handle progressive item collection.

        When a progressive item is collected, this returns the name of the next
        uncollected component item. This allows rules that check for component
        items (e.g., state.has("steel-processing")) to work correctly when the
        player has collected the progressive version (e.g., "progressive-processing").
        """
        if item.advancement and item.name in self.progression_mapping:
            components = self.progression_mapping[item.name]
            if remove:
                # When removing, find the last component the player has
                for component_name in reversed(components):
                    if state.has(component_name, item.player):
                        return component_name
            else:
                # When collecting, find the first component the player doesn't have
                for component_name in components:
                    if not state.has(component_name, item.player):
                        return component_name

        return super().collect_item(state, item, remove)
'''

    # Generate is_vanilla and is_canonical class attributes (for exporter to read)
    placement_type_section = ''
    if canonical_seed is not None and canonical_class_attr_content:
        # All worldgen canonical worlds are is_canonical=True
        # is_vanilla is inherited from the source rules.json
        if data.is_vanilla:
            placement_type_section = '''
    # Placements match the original non-randomized game
    is_vanilla: ClassVar[bool] = True
    # Placements are deterministically reproduced by world generator
    is_canonical: ClassVar[bool] = True
'''
        else:
            placement_type_section = '''
    # Placements are deterministically reproduced by world generator
    is_canonical: ClassVar[bool] = True
'''

    # Generate preset_label class attribute (for frontend display in preset buttons)
    preset_label_section = ''
    if data.preset_label:
        escaped_label = data.preset_label.replace('\\', '\\\\').replace('"', '\\"')
        preset_label_section = f'''
    # Frontend preset button label (e.g., "canth s4")
    preset_label: ClassVar[str] = "{escaped_label}"
'''

    # Generate canonical_placements class attribute (for exporter to read)
    if canonical_seed is not None and canonical_class_attr_content:
        canonical_placements_section = f'''
    # Canonical item placements - where items belong in the "vanilla" game
    # Used by exporter to distinguish canonical placements from always-locked items
    canonical_placements: ClassVar[Dict[str, str]] = {{
{canonical_class_attr_content}
    }}
'''
    else:
        canonical_placements_section = ''

    # Generate original_seed_placements class attribute (actual seed 1 item placements)
    # This is what _place_original_items() uses to reproduce the exact original seed.
    # It may differ from canonical_placements when the original world randomizes items.
    original_seed_placements_section = ''
    if canonical_seed is not None and original_seed_placements_content:
        original_seed_placements_section = f'''
    # Original seed placements - actual item placements from the original seed generation
    # Used by _place_original_items() to reproduce exact original item placement
    original_seed_placements: ClassVar[Dict[str, str]] = {{
{original_seed_placements_content}
    }}
'''

    # Generate canonical_placement_advancements class attribute (for items with mixed classification)
    canonical_placement_advancements_section = ''
    if canonical_seed is not None and data.canonical_placement_advancements:
        adv_entries = []
        for loc_name, is_advancement in data.canonical_placement_advancements.items():
            loc_escaped = loc_name.replace('\\', '\\\\').replace('"', '\\"')
            adv_entries.append(f'        "{loc_escaped}": {is_advancement},')
        adv_content = '\n'.join(adv_entries)
        canonical_placement_advancements_section = f'''
    # Canonical placement advancement status - for items with mixed classifications
    # True = progression, False = useful/filler. Used to select correct item copy during placement.
    canonical_placement_advancements: ClassVar[Dict[str, bool]] = {{
{adv_content}
    }}
'''

    # Generate __init__ method for world_attributes (game-specific instance attributes)
    init_section = ''
    needs_types_import = False
    if data.world_attributes:
        init_attrs = []
        for attr_name, attr_value in data.world_attributes.items():
            # Format the value appropriately
            if isinstance(attr_value, dict):
                # Check if this dict has string keys that suggest attribute access
                # (e.g., difficulty_requirements) vs integer keys that suggest dict access
                has_string_keys = all(isinstance(k, str) for k in attr_value.keys())
                has_nested_values = not any(isinstance(v, dict) for v in attr_value.values())

                # Check if all keys are valid Python identifiers for SimpleNamespace
                # Only check isidentifier() if we know all keys are strings (has_string_keys)
                all_valid_identifiers = has_string_keys and all(k.isidentifier() for k in attr_value.keys())

                if has_string_keys and has_nested_values and attr_value and all_valid_identifiers:
                    # Use SimpleNamespace for dicts with valid identifier keys (attribute access pattern)
                    needs_types_import = True
                    # Check if all keys are valid Python identifiers
                    all_valid_identifiers = all(is_valid_identifier(k) for k in attr_value.keys())
                    if all_valid_identifiers:
                        # Use keyword argument form: SimpleNamespace(key=val, ...)
                        dict_items = ', '.join(f'{k}={v!r}' for k, v in attr_value.items())
                        init_attrs.append(f'        self.{attr_name} = types.SimpleNamespace({dict_items})')
                    else:
                        # Use dictionary unpacking: SimpleNamespace(**{"key with space": val, ...})
                        dict_items = ', '.join(f'{k!r}: {v!r}' for k, v in attr_value.items())
                        init_attrs.append(f'        self.{attr_name} = types.SimpleNamespace(**{{{dict_items}}})')
                else:
                    # Keep as dict for integer keys or nested dicts
                    # Use _format_dict_repr to convert numeric string keys to integers
                    init_attrs.append(f'        self.{attr_name} = {_format_dict_repr(attr_value)}')
            elif isinstance(attr_value, list):
                # Special handling for shops - convert dicts to ShopWrapper objects
                if attr_name == 'shops' and attr_value and isinstance(attr_value[0], dict):
                    # Shops need special handling - convert to ShopWrapper objects in __init__
                    init_attrs.append(f'        self.{attr_name} = self._create_shops({attr_value!r})')
                else:
                    init_attrs.append(f'        self.{attr_name} = {attr_value!r}')
            else:
                init_attrs.append(f'        self.{attr_name} = {attr_value!r}')

        init_attrs_content = '\n'.join(init_attrs)

        # Check if we need the ShopWrapper class (for games with shops)
        has_shops = 'shops' in data.world_attributes and data.world_attributes['shops']
        shop_wrapper_section = ''
        create_shops_method = ''
        if has_shops:
            shop_wrapper_section = '''

class _RegionWrapper:
    """Wrapper for region to provide can_reach interface for worldgen shops.

    This wrapper stores a region name and lazily resolves it to the actual
    Region object. Once resolved, the Region object is cached to ensure
    consistent behavior with the original ALttP world's shop.region.
    """
    def __init__(self, region_name: str, world):
        self.name = region_name
        self._world = world
        self._region = None  # Cache for the actual Region object
        self.player = world.player if hasattr(world, 'player') else 1  # For compatibility

    def _get_region(self):
        """Get the actual Region object, caching it for future use.

        Only caches successful lookups to handle the case where this is called
        before regions are created (during __init__).
        """
        if self._region is not None:
            return self._region
        try:
            region = self._world.multiworld.get_region(self.name, self._world.player)
            self._region = region  # Cache only on success
            return region
        except KeyError:
            return None

    def can_reach(self, state) -> bool:
        """Check if the region is reachable.

        Delegates to the actual Region.can_reach() method to ensure proper
        handling of state.stale checks and BFS updates. This is important
        because Region.can_reach() will trigger a BFS update if the state
        is stale, ensuring consistent behavior with the original world.
        """
        try:
            # Look up the region from the STATE's multiworld and delegate to it
            region = state.multiworld.get_region(self.name, self._world.player)
            return region.can_reach(state)
        except KeyError:
            return False


class _ShopWrapper:
    """Wrapper for shop data to provide has/has_unlimited interface for worldgen."""
    def __init__(self, shop_data: dict, world):
        self._data = shop_data
        self.region = _RegionWrapper(shop_data.get('region', ''), world)
        self.inventory = shop_data.get('inventory', [])
        # New simplified format: list of unlimited item names
        self.unlimited_items = shop_data.get('unlimited_items', [])
        self.room_id = shop_data.get('room_id', 0)
        self.shopkeeper_config = shop_data.get('shopkeeper_config', 0)
        self.custom = shop_data.get('custom', False)
        self.locked = shop_data.get('locked', False)
        self.sram_offset = shop_data.get('sram_offset', 0)

    def has_unlimited(self, item: str) -> bool:
        """Check if the shop has unlimited supply of an item.

        In ALttP's shop system:
        - max: 0 (or not present) means unlimited stock of the base item
        - max: N (N > 0) means limited stock, switches to replacement after N sales
        """
        # Check simplified unlimited_items list first (new format from ALttP exporter)
        if item in self.unlimited_items:
            return True
        # Fall back to legacy inventory format
        for inv in self.inventory:
            if inv is None:
                continue
            max_stock = inv.get('max', 0)
            if max_stock == 0:
                # Unlimited stock of the base item
                if inv.get('item') == item:
                    return True
            else:
                # Limited stock, but the replacement is unlimited after stock runs out
                if inv.get('replacement') == item:
                    return True
        return False

    def has(self, item: str) -> bool:
        """Check if the shop has an item."""
        for inv in self.inventory:
            if inv is None:
                continue
            if inv.get('item') == item:
                return True
            if inv.get('replacement') == item:
                return True
        return False

'''
            create_shops_method = '''
    def _create_shops(self, shops_data: list) -> list:
        """Convert shop data dicts to ShopWrapper objects."""
        return [_ShopWrapper(shop, self) for shop in shops_data]
'''

        init_section = f'''
    def __init__(self, multiworld: "MultiWorld", player: int):
        super().__init__(multiworld, player)
        # Game-specific world attributes
{init_attrs_content}
{create_shops_method}'''

    # Build itempool_counts dictionary
    # The subtraction logic must match what actually ends up in LOCKED_PLACEMENTS:
    # - When canonical_placements exist: LOCKED_PLACEMENTS only has event items/locations,
    #   so only subtract those. Non-event locked items stay in the pool for non-seed-1 games
    #   (they're placed via canonical_placements only for seed=1).
    # - When no canonical_placements: all locked items go into LOCKED_PLACEMENTS,
    #   so subtract all of them from the pool.
    itempool_entries = []
    if data.canonical_placements or canonical_seed is not None:
        # Only subtract items that are in LOCKED_PLACEMENTS
        # (event items or items at event locations)
        locked_event_counts: Dict[str, int] = {}
        for loc_name, item_name in data.locked_placements.items():
            if item_name:
                item_data = data.items.get(item_name)
                loc_data = data.locations.get(loc_name)
                is_event_item = item_data and item_data.is_event
                is_event_location = loc_data and loc_data.is_event
                if is_event_item or is_event_location:
                    locked_event_counts[item_name] = locked_event_counts.get(item_name, 0) + 1

        for item_name, count in data.itempool_counts.items():
            adjusted_count = count - locked_event_counts.get(item_name, 0)
            adjusted_count -= data.starting_items.get(item_name, 0)
            if adjusted_count > 0:
                item_data = data.items.get(item_name)
                # Skip true event items (id=None) - they have no ID and can't be in the pool.
                # Don't use is_event here because some items (e.g., ALttP small keys) have
                # event=True in the JSON but still have valid IDs and must be in the pool.
                if item_data and item_data.item_id is None:
                    continue
                item_escaped = item_name.replace('\\', '\\\\').replace('"', '\\"')
                itempool_entries.append(f'    "{item_escaped}": {adjusted_count},')
    else:
        # No canonical_placements - subtract all locked items
        locked_item_counts: Dict[str, int] = {}
        for loc_name, item_name in data.locked_placements.items():
            if item_name:
                locked_item_counts[item_name] = locked_item_counts.get(item_name, 0) + 1

        for item_name, count in data.itempool_counts.items():
            adjusted_count = count - locked_item_counts.get(item_name, 0)
            adjusted_count -= data.starting_items.get(item_name, 0)
            if adjusted_count > 0:
                item_escaped = item_name.replace('\\', '\\\\').replace('"', '\\"')
                itempool_entries.append(f'    "{item_escaped}": {adjusted_count},')

    itempool_content = '\n'.join(itempool_entries)

    # Build item_name_groups dictionary (preserve original order)
    # Skip the "Event" group — event items have no ID and aren't in item_name_to_id,
    # so including them causes test_item_name_group_has_valid_item to fail.
    # Other groups (e.g., "Crystals", "Pendants") may contain event items but are
    # needed for count_group rules, so we keep them as-is.
    item_name_groups_entries = []
    for group_name, item_names in data.item_name_groups.items():
        if group_name == "Event":
            continue
        group_escaped = group_name.replace('\\', '\\\\').replace('"', '\\"')
        items_list = ', '.join(f'"{item.replace(chr(92), chr(92)+chr(92)).replace(chr(34), chr(92)+chr(34))}"' for item in item_names)
        item_name_groups_entries.append(f'        "{group_escaped}": frozenset([{items_list}]),')

    item_name_groups_content = '\n'.join(item_name_groups_entries)

    # Build web theme
    web_theme = data.metadata.web_theme or "ocean"

    # Build tutorials content
    tutorials_content = "[]"
    if data.metadata.web_tutorials:
        tutorial_entries = []
        for t in data.metadata.web_tutorials:
            name_escaped = t.name.replace('\\', '\\\\').replace('"', '\\"')
            desc_escaped = t.description.replace('\\', '\\\\').replace('"', '\\"')
            lang_escaped = t.language.replace('\\', '\\\\').replace('"', '\\"')
            file_escaped = t.file_name.replace('\\', '\\\\').replace('"', '\\"')
            link_escaped = t.link.replace('\\', '\\\\').replace('"', '\\"')
            authors_list = ', '.join(f'"{a}"' for a in t.authors)
            tutorial_entries.append(
                f'        Tutorial(\n'
                f'            "{name_escaped}",\n'
                f'            "{desc_escaped}",\n'
                f'            "{lang_escaped}",\n'
                f'            "{file_escaped}",\n'
                f'            "{link_escaped}",\n'
                f'            [{authors_list}]\n'
                f'        )'
            )
        if tutorial_entries:
            tutorials_content = "[\n" + ",\n".join(tutorial_entries) + "\n    ]"

    # Build world docstring
    if data.metadata.world_description:
        # Format as a proper docstring
        world_docstring = '    """\n'
        for line in data.metadata.world_description.split('\n'):
            world_docstring += f'    {line}\n'
        world_docstring += '    """'
    else:
        world_docstring = f'    """\n    {game_name} for Archipelago.\n\n    Auto-generated world implementation.\n    """'

    # Build base_id section
    if data.metadata.base_id is not None:
        base_id_section = f'\n    base_id: ClassVar[int] = {data.metadata.base_id}'
    else:
        base_id_section = ''

    # Build origin_region_name section
    # This specifies the true starting region for the exporter, even when Menu is added
    if data.start_region and data.start_region != "Menu":
        start_region_escaped = data.start_region.replace('\\', '\\\\').replace('"', '\\"')
        origin_region_name_section = f'\n    origin_region_name: str = "{start_region_escaped}"'
    else:
        origin_region_name_section = ''

    # Build use_auto_indirect_conditions section
    # When True, use auto sweep algorithm for region dependencies instead of explicit
    # This is needed for worlds that set access_rule directly without registering indirect_connections
    if data.metadata.use_auto_indirect_conditions:
        use_auto_indirect_conditions_section = '''
    # Use auto indirect conditions since entrance rules have region dependencies
    # that aren't registered via RuleBuilder.set_rule()
    explicit_indirect_conditions: ClassVar[bool] = False'''
    else:
        use_auto_indirect_conditions_section = ''

    # Build fill_slot_data content
    # Check if slot_data fields match option names - if so, generate dynamic references
    # NOTE: We only dynamically reference 'randomize_items' since that's the only option
    # the world generator creates. Other options from the original game are not available.
    slot_data_fields = data.metadata.slot_data_fields
    # Only these options are generated by the world generator
    generated_options = {'randomize_items'}
    if slot_data_fields:
        slot_data_entries = []
        for key, value in slot_data_fields.items():
            key_escaped = key.replace('\\', '\\\\').replace('"', '\\"')
            # Check if this key matches an option we generate - if so, reference it dynamically
            if key in generated_options:
                slot_data_entries.append(f'            "{key_escaped}": self.options.{key}.value,')
            elif isinstance(value, bool):
                slot_data_entries.append(f'            "{key_escaped}": {str(value)},')
            elif isinstance(value, (int, float)):
                slot_data_entries.append(f'            "{key_escaped}": {value},')
            elif isinstance(value, str):
                value_escaped = value.replace('\\', '\\\\').replace('"', '\\"')
                slot_data_entries.append(f'            "{key_escaped}": "{value_escaped}",')
            else:
                # For complex types (dicts, lists), use _format_dict_repr to handle
                # numeric string keys from JSON (convert back to integers)
                slot_data_entries.append(f'            "{key_escaped}": {_format_dict_repr(value)},')
        slot_data_content = '\n'.join(slot_data_entries)
        fill_slot_data_section = f'''
    def fill_slot_data(self) -> Dict[str, Any]:
        """Return data for the client."""
        return {{
{slot_data_content}
        }}
'''
    else:
        fill_slot_data_section = '''
    def fill_slot_data(self) -> Dict[str, Any]:
        """Return data for the client."""
        return {}
'''

    # Build optional imports
    types_import = 'import types\n' if needs_types_import else ''
    # Add json and os imports for canonical options loading
    canonical_imports = 'import json\nimport os\n' if canonical_seed is not None else ''

    # Check if any items have hint_text for create_item method
    has_hint_text = any(item.hint_text for item in data.items.values())
    hint_text_code = '''        if data.hint_text:
            item._hint_text = data.hint_text
''' if has_hint_text else ''

    # Check if any items have classification_counts for create_item method
    has_classification_counts = any(item.classification_counts for item in data.items.values())

    # Generate create_item method with or without classification_counts handling
    if has_classification_counts:
        create_item_body = f'''        # Handle items with mixed classifications (e.g., some progression, some filler)
        classification_counts = getattr(data, 'classification_counts', None)
        if classification_counts:
            # Get or initialize the tracker for this item
            if not hasattr(self, '_classification_trackers'):
                self._classification_trackers = {{}}
            if name not in self._classification_trackers:
                self._classification_trackers[name] = {{}}
            tracker = self._classification_trackers[name]

            # Find the classification to use based on counts and what's been created
            classification = data.classification  # Default
            classification_map = {{
                'progression': ItemClassification.progression,
                'progression_skip_balancing': ItemClassification.progression_skip_balancing,
                'useful': ItemClassification.useful,
                'trap': ItemClassification.trap,
                'filler': ItemClassification.filler,
            }}
            for class_name_str, quota in classification_counts.items():
                created_count = tracker.get(class_name_str, 0)
                if created_count < quota:
                    classification = classification_map.get(class_name_str, ItemClassification.filler)
                    tracker[class_name_str] = created_count + 1
                    break

            item = {class_name}Item(name, classification, data.id, self.player)
        else:
            item = {class_name}Item(name, data.classification, data.id, self.player)
{hint_text_code}        return item'''
    else:
        create_item_body = f'''        item = {class_name}Item(name, data.classification, data.id, self.player)
{hint_text_code}        return item'''

    return f'''"""
{game_name} world implementation for Archipelago.

Auto-generated by world_generator.
"""
{canonical_imports}{types_import}
from typing import ClassVar, Dict, List, Set, Any, TYPE_CHECKING
from BaseClasses import Item, ItemClassification, Tutorial
from worlds.AutoWorld import WebWorld, World
from rule_builder import RuleWorldMixin

if TYPE_CHECKING:
    from BaseClasses import CollectionState, MultiWorld

from .Items import item_table, ItemData, {class_name}Item
from .Locations import location_table, {class_name}Location
from .Options import {class_name}Options
from .Regions import create_regions
from .Rules import set_rules


# Item pool counts from original generation (excluding locked placements)
ITEMPOOL_COUNTS: Dict[str, int] = {{
{itempool_content}
}}

# Locked placements - items that must be placed via place_locked_item
LOCKED_PLACEMENTS: Dict[str, str] = {{
{locked_content}
}}

# Starting items - items the player begins with (precollected)
STARTING_ITEMS: Dict[str, int] = {{
{starting_content}
}}
{shop_wrapper_section}

class {class_name}Web(WebWorld):
    """Web interface for {game_name}."""
    theme = "{web_theme}"
    game_info_languages: List[str] = ['en']
    tutorials = {tutorials_content}


class {world_class}(RuleWorldMixin, World):
{world_docstring}

    game: ClassVar[str] = "{game_name}"
    web: ClassVar[WebWorld] = {class_name}Web()

    options_dataclass = {class_name}Options
    options: {class_name}Options
{base_id_section}{origin_region_name_section}
    # Disable rule caching - requires CollectionState.rule_builder_cache from PR #5048
    rule_caching_enabled: ClassVar[bool] = False{use_auto_indirect_conditions_section}

    item_name_to_id: ClassVar[Dict[str, int]] = {{
        name: data.id for name, data in item_table.items() if data.id is not None
    }}

    # Expose item_table as item_name_to_item for exporter compatibility
    # This allows the exporter handler to find item classifications
    item_name_to_item: ClassVar[Dict[str, "ItemData"]] = item_table

    location_name_to_id: ClassVar[Dict[str, int]] = {{
        name: data.location_id for name, data in location_table.items()
        if data.location_id is not None
    }}

    item_name_groups: ClassVar[Dict[str, frozenset]] = {{
{item_name_groups_content}
    }}
{accumulator_rules_section}{prog_items_init_section}{progression_mapping_section}{placement_type_section}{preset_label_section}{canonical_placements_section}{original_seed_placements_section}{canonical_placement_advancements_section}{init_section}{generate_early_section}
    def create_regions(self) -> None:
        """Create regions, locations, and connections."""
        create_regions(self.multiworld, self.player)

    def set_rules(self) -> None:
        """Set access rules."""
        set_rules(self)
{collect_remove_section}{create_items_section}        """Create randomized item pool."""
        # First, place any locked items
        self._place_locked_items()

        # Then create the random item pool
        item_pool = []

        for item_name, count in ITEMPOOL_COUNTS.items():
            # Skip event items
            if item_name not in item_table or item_table[item_name].id is None:
                continue

            item_data = item_table[item_name]

            # Check for mixed classification items (e.g., some progression, some filler)
            classification_counts = getattr(item_data, 'classification_counts', None)
            if classification_counts:
                # Create items with per-classification counts
                classification_map = {{
                    'progression': ItemClassification.progression,
                    'progression_skip_balancing': ItemClassification.progression_skip_balancing,
                    'useful': ItemClassification.useful,
                    'trap': ItemClassification.trap,
                    'filler': ItemClassification.filler,
                }}
                for classification_name, class_count in classification_counts.items():
                    classification = classification_map.get(classification_name, ItemClassification.filler)
                    for _ in range(class_count):
                        item = {class_name}Item(
                            item_name,
                            classification,
                            item_data.id,
                            self.player
                        )
                        item_pool.append(item)
            else:
                # Standard case: all items have the same classification
                for _ in range(count):
                    item = {class_name}Item(
                        item_name,
                        item_data.classification,
                        item_data.id,
                        self.player
                    )
                    item_pool.append(item)

        self.multiworld.itempool += item_pool

    def _place_locked_items(self) -> None:
        """Place items that must be in specific locations (locked placements)."""
        for location_name, item_name in LOCKED_PLACEMENTS.items():
            if item_name and item_name in item_table:
                location = self.multiworld.get_location(location_name, self.player)
                item_data = item_table[item_name]
                item = {class_name}Item(
                    item_name,
                    item_data.classification,
                    item_data.id,
                    self.player
                )
                location.place_locked_item(item)
                # If the location is an event, mark the item as an event too
                # (matches original world behavior where item.code = None for events)
                if getattr(location, 'event', False) or location.address is None:
                    item.code = None

    def _push_starting_items(self) -> None:
        """Push starting items as precollected (for state counters like coins)."""
        for item_name, count in STARTING_ITEMS.items():
            if item_name in item_table:
                for _ in range(count):
                    item = self.create_item(item_name)
                    self.multiworld.push_precollected(item)
{victory_section}{pre_fill_section}
    def create_item(self, name: str) -> Item:
        """Create an item by name."""
        data = item_table[name]
{create_item_body}

{collect_item_section}{fill_slot_data_section}'''
