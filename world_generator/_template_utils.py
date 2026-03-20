"""Shared utilities for template generation.

These functions are used by multiple template generators and have no
world_generator dependencies.
"""

from typing import Any


def is_valid_identifier(name: str) -> bool:
    """Check if a string is a valid Python identifier.

    Python identifiers must start with a letter or underscore, and contain
    only letters, digits, and underscores. They also cannot be keywords.
    """
    import keyword
    return name.isidentifier() and not keyword.iskeyword(name)


def _format_dict_repr(value: Any) -> str:
    """Format a value for use in Python source code, converting numeric string keys to integers.

    JSON always uses string keys, but if the original Python code used integer keys,
    they would be serialized as strings. This function converts numeric string keys
    back to integers so that lookups like dict[1] work (instead of requiring dict["1"]).

    Args:
        value: The value to format (handles dicts, lists, and primitives)

    Returns:
        A string representation suitable for Python source code
    """
    if isinstance(value, dict):
        items = []
        for k, v in value.items():
            # Convert numeric string keys to integers
            if isinstance(k, str) and k.lstrip('-').isdigit():
                key_repr = k  # Use as integer literal (no quotes)
            else:
                key_repr = repr(k)
            # Recursively format the value
            val_repr = _format_dict_repr(v)
            items.append(f'{key_repr}: {val_repr}')
        return '{' + ', '.join(items) + '}'
    elif isinstance(value, list):
        items = [_format_dict_repr(v) for v in value]
        return '[' + ', '.join(items) + ']'
    else:
        return repr(value)


def _classification_to_enum(classification: str) -> str:
    """Convert classification string to ItemClassification enum.

    Handles combined classifications like 'progression|useful' by splitting
    and joining the corresponding enum values.
    """
    mapping = {
        'progression': 'ItemClassification.progression',
        'progression_skip_balancing': 'ItemClassification.progression_skip_balancing',
        'progression_deprioritized': 'ItemClassification.progression_deprioritized',
        'progression_deprioritized_skip_balancing': 'ItemClassification.progression_deprioritized_skip_balancing',
        'useful': 'ItemClassification.useful',
        'trap': 'ItemClassification.trap',
        'filler': 'ItemClassification.filler',
    }

    # Handle combined classifications (e.g., 'progression|useful')
    if '|' in classification:
        parts = classification.split('|')
        enum_parts = []
        for part in parts:
            part = part.strip()
            if part in mapping:
                enum_parts.append(mapping[part])
        if enum_parts:
            return ' | '.join(enum_parts)
        # Fallback if no valid parts found
        return 'ItemClassification.filler'

    return mapping.get(classification, 'ItemClassification.filler')
