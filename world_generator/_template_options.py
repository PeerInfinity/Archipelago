"""Options template generation for Archipelago world files.

Contains the options generator and option class generation.
"""

from typing import Any, Dict

from .extractors import ExtractedData
from ._sanitization import sanitize_for_class_name, sanitize_for_identifier


# Use sanitize_for_identifier as the option name sanitizer
sanitize_option_name = sanitize_for_identifier


def _generate_option_class_from_definition(setting_name: str, option_def: Dict[str, Any]) -> tuple:
    """Generate an option class from an option definition.

    Args:
        setting_name: The name of the setting (e.g., 'bat_logic')
        option_def: The option definition dict with type, default, etc.

    Returns:
        Tuple of (class_code, field_code, import_name, name_lookup_override) or
        (None, None, None, None) if unsupported.
        name_lookup_override is optional code to set the name_lookup after class definition.
    """
    class_name = ''.join(word.capitalize() for word in setting_name.split('_'))
    # Only include display_name in generated code if it was in the original option definition
    has_display_name = 'display_name' in option_def
    display_name = option_def.get('display_name', ' '.join(word.capitalize() for word in setting_name.split('_')))
    # Escape double quotes in display names to generate valid Python code
    display_name_escaped = display_name.replace('"', '\\"')
    # Create the display_name line only if it was in the original
    display_name_line = f'    display_name = "{display_name_escaped}"\n' if has_display_name else ''
    option_type = option_def.get('type')
    default = option_def.get('default', 0)

    if option_type == 'choice':
        # Generate Choice option with option_<name> = <value> for each choice
        name_lookup = option_def.get('name_lookup', {})

        # Properly quote string default values
        if isinstance(default, str):
            default_repr = f'"{default}"'
        else:
            default_repr = default

        # If name_lookup is empty, this is a TextChoice (accepts arbitrary text)
        if not name_lookup:
            class_code = f'''
class {class_name}(TextChoice):
    """Option for {display_name}."""
{display_name_line}
    default = {default_repr}
'''
            return class_code, f'    {setting_name}: {class_name}', 'TextChoice', None

        # Check if all keys are numeric (convertible to int)
        # Some games use TextChoice with string keys (e.g., "random-2p", "M", "MA")
        try:
            sorted_items = sorted(name_lookup.items(), key=lambda x: int(x[0]))
            has_numeric_keys = True
        except ValueError:
            # Non-numeric keys indicate a TextChoice or similar complex option
            has_numeric_keys = False

        if not has_numeric_keys:
            # Non-numeric keys - generate TextChoice but preserve name_lookup
            # Build the name_lookup dict representation
            name_lookup_items = []
            for key, value in sorted(name_lookup.items()):
                name_lookup_items.append(f'        {repr(key)}: {repr(value)}')
            name_lookup_str = ',\n'.join(name_lookup_items)

            class_code = f'''
class {class_name}(TextChoice):
    """Option for {display_name}."""
{display_name_line}
    default = {default_repr}

# Preserve original name_lookup for export
{class_name}.name_lookup = {{
{name_lookup_str}
}}
'''
            return class_code, f'    {setting_name}: {class_name}', 'TextChoice', None

        # Numeric keys - generate normal Choice class
        option_lines = []
        needs_name_lookup_override = False
        for value_str, name in sorted_items:
            # Sanitize the option name to be a valid Python identifier
            safe_name = sanitize_option_name(name)
            if safe_name != name:
                needs_name_lookup_override = True
            option_lines.append(f'    option_{safe_name} = {value_str}')
        options_code = '\n'.join(option_lines)

        class_code = f'''
class {class_name}(Choice):
    """Option for {display_name}."""
{display_name_line}{options_code}
    default = {default_repr}
'''

        # If any option names were sanitized, we need to override name_lookup
        # to preserve the original names (e.g., "random-middle" instead of "random_middle")
        name_lookup_override = None
        if needs_name_lookup_override:
            name_lookup_items = []
            for value_str, name in sorted_items:
                name_lookup_items.append(f'    {value_str}: {repr(name)}')
            name_lookup_str = ',\n'.join(name_lookup_items)
            name_lookup_override = f'''
# Preserve original option names in name_lookup (before sanitization)
{class_name}.name_lookup = {{
{name_lookup_str}
}}
'''

        return class_code, f'    {setting_name}: {class_name}', 'Choice', name_lookup_override

    elif option_type == 'range':
        range_start = option_def.get('range_start', 0)
        range_end = option_def.get('range_end', 100)

        # Properly quote string default values
        if isinstance(default, str):
            default_repr = f'"{default}"'
        else:
            default_repr = default

        # Check if default is outside the range - need to use NamedRange with special_range_names
        default_outside_range = (
            isinstance(default, (int, float)) and
            (default < range_start or default > range_end)
        )

        if default_outside_range:
            # Use NamedRange with special_range_names for defaults outside the range
            class_code = f'''
class {class_name}(NamedRange):
    """Option for {display_name}."""
{display_name_line}    range_start = {range_start}
    range_end = {range_end}
    default = {default_repr}
    special_range_names = {{"default": {default_repr}}}
'''
            return class_code, f'    {setting_name}: {class_name}', 'NamedRange', None
        else:
            class_code = f'''
class {class_name}(Range):
    """Option for {display_name}."""
{display_name_line}    range_start = {range_start}
    range_end = {range_end}
    default = {default_repr}
'''
            return class_code, f'    {setting_name}: {class_name}', 'Range', None

    elif option_type == 'default_on_toggle':
        class_code = f'''
class {class_name}(DefaultOnToggle):
    """Option for {display_name}."""
{display_name_line}'''
        return class_code, f'    {setting_name}: {class_name}', 'DefaultOnToggle', None

    elif option_type == 'toggle':
        # Get the default value, preserving boolean type if present
        toggle_default = option_def.get('default', False)
        # Normalize to Python boolean for consistency
        if toggle_default == 0 or toggle_default is False:
            default_repr = 'False'
        else:
            default_repr = 'True'
        class_code = f'''
class {class_name}(Toggle):
    """Option for {display_name}."""
{display_name_line}    default = {default_repr}
'''
        return class_code, f'    {setting_name}: {class_name}', 'Toggle', None

    elif option_type == 'removed':
        # Deprecated/removed options - use Removed class
        # Default is typically an empty string
        default_str = option_def.get('default', '')
        if isinstance(default_str, str):
            default_repr = f'"{default_str}"'
        else:
            default_repr = repr(default_str)
        class_code = f'''
class {class_name}(Removed):
    """Deprecated option for {display_name}."""
    default = {default_repr}
'''
        return class_code, f'    {setting_name}: {class_name}', 'Removed', None

    elif option_type == 'freetext':
        # Free text options (like entrance_shuffle_seed)
        default_str = option_def.get('default', '')
        if isinstance(default_str, str):
            default_repr = f'"{default_str}"'
        else:
            default_repr = repr(default_str)
        class_code = f'''
class {class_name}(FreeText):
    """Option for {display_name}."""
{display_name_line}    default = {default_repr}
'''
        return class_code, f'    {setting_name}: {class_name}', 'FreeText', None

    elif option_type == 'plando_connections':
        # Plando connections - inherits from PlandoConnections
        # Must define entrances and exits (required by PlandoConnections metaclass)
        # Using empty sets since plando is not used in worldgen testing
        class_code = f'''
class {class_name}(PlandoConnections):
    """Plando connections for {display_name}."""
    entrances = frozenset()
    exits = frozenset()
'''
        return class_code, f'    {setting_name}: {class_name}', 'PlandoConnections', None

    elif option_type == 'plando_texts':
        # Plando texts - inherits from PlandoTexts
        class_code = f'''
class {class_name}(PlandoTexts):
    """Plando texts for {display_name}."""
'''
        return class_code, f'    {setting_name}: {class_name}', 'PlandoTexts', None

    elif option_type == 'start_inventory_pool':
        # Start inventory from pool option - inherits from StartInventoryPool
        class_code = f'''
class {class_name}(StartInventoryPool):
    """Start inventory from pool for {display_name}."""
'''
        return class_code, f'    {setting_name}: {class_name}', 'StartInventoryPool', None

    return None, None, None, None


def generate_options_py(data: ExtractedData) -> str:
    """Generate Options.py file content."""
    game_name = data.metadata.game_name
    class_name = sanitize_for_class_name(game_name)
    option_definitions = data.metadata.option_definitions

    imports_needed = {'Toggle'}  # Always need Toggle for RandomizeItems
    option_classes = []
    option_fields = []

    # These options are always inherited from PerGameCommonOptions and should not be regenerated
    # unless they have non-standard defaults
    always_skip_options = {
        'progression_balancing', 'local_items', 'non_local_items',
        'start_inventory', 'start_hints', 'start_location_hints', 'exclude_locations',
        'priority_locations', 'item_links', 'plando_items',
        'randomize_items',  # Defined in hardcoded template with default=True
        'use_canonical_options',  # Defined in hardcoded template with default=True
    }

    # Standard defaults for common options - if the game uses different defaults,
    # we need to generate a custom class
    common_option_defaults = {
        'accessibility': 0,  # Standard Accessibility default is 0 (full)
    }

    # Check if accessibility needs a custom class (different default than standard)
    custom_accessibility = False
    accessibility_def = option_definitions.get('accessibility', {})
    if accessibility_def.get('default', 0) != common_option_defaults.get('accessibility', 0):
        custom_accessibility = True
        # Generate custom accessibility class
        acc_default = accessibility_def.get('default', 0)
        name_lookup = accessibility_def.get('name_lookup', {})

        # Build the options
        option_lines = []
        for value, name in sorted(name_lookup.items(), key=lambda x: int(x[0])):
            option_lines.append(f"    option_{name} = {value}")

        acc_class = f'''
class Accessibility(Choice):
    """Accessibility option with game-specific default."""
    display_name = "Accessibility"
{chr(10).join(option_lines)}
    default = {acc_default}
'''
        option_classes.append(acc_class)
        option_fields.append('    accessibility: Accessibility')
        imports_needed.add('Choice')

    skip_options = always_skip_options.copy()
    if not custom_accessibility:
        skip_options.add('accessibility')
    else:
        # Already handled above
        skip_options.add('accessibility')

    # Generate option classes from definitions
    name_lookup_overrides = []
    seen_class_names = set()
    for setting_name in sorted(option_definitions.keys()):
        if setting_name in skip_options:
            continue

        # Skip hidden/backwards-compat options (visibility == 0)
        option_def = option_definitions[setting_name]
        if option_def.get('visibility') == 0:
            continue

        class_code, field_code, import_name, name_lookup_override = _generate_option_class_from_definition(setting_name, option_def)
        if class_code:
            # Deduplicate by class name - some worlds export both snake_case and
            # CamelCase variants of the same option (backwards-compat aliases)
            option_class_name = ''.join(word.capitalize() for word in setting_name.split('_'))
            if option_class_name in seen_class_names:
                continue
            seen_class_names.add(option_class_name)
            option_classes.append(class_code)
            option_fields.append(field_code)
            imports_needed.add(import_name)
            if name_lookup_override:
                name_lookup_overrides.append(name_lookup_override)

    imports_str = ', '.join(sorted(imports_needed))
    option_classes_str = ''.join(option_classes)
    name_lookup_overrides_str = ''.join(name_lookup_overrides)
    option_fields_str = ('\n' + '\n'.join(option_fields)) if option_fields else ''

    return f'''"""
Game options for {game_name}.

Auto-generated by world_generator.
"""

from dataclasses import dataclass
from Options import {imports_str}, PerGameCommonOptions


class RandomizeItems(Toggle):
    """Enable item randomization.

    When disabled, items will be placed in their original locations.
    """
    display_name = "Randomize Items"
    default = True


class UseCanonicalOptions(Toggle):
    """Use canonical options for seed 1.

    When enabled and generating seed 1, options will be loaded from the
    _worldgen_options.json file to reproduce the exact original seed.
    This ensures deterministic output matching the original world export.
    """
    display_name = "Use Canonical Options"
    default = True
{option_classes_str}{name_lookup_overrides_str}

@dataclass
class {class_name}Options(PerGameCommonOptions):
    """Options for {game_name}."""
    randomize_items: RandomizeItems
    use_canonical_options: UseCanonicalOptions{option_fields_str}
'''
