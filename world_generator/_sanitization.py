"""
Shared sanitization utilities for world_generator and related modules.

This module provides common functions for converting strings into valid
Python identifiers, used for generating class names, function names,
and option names.
"""

import re


def sanitize_for_class_name(name: str) -> str:
    """
    Sanitize a name for use as a Python class name.

    Removes all characters that are not alphanumeric (letters and digits).
    Does NOT ensure the result starts with a letter - caller must verify
    if needed for a valid Python identifier.

    Args:
        name: The name to sanitize (e.g., "A Link to the Past")

    Returns:
        A sanitized name suitable for class names (e.g., "ALinkToThePast")
    """
    return re.sub(r'[^a-zA-Z0-9]', '', name)


def sanitize_for_identifier(name: str, allow_underscore: bool = True) -> str:
    """
    Sanitize a name for use as a Python identifier.

    Replaces special characters with underscores, collapses consecutive
    underscores, and strips leading/trailing underscores.

    Args:
        name: The name to sanitize
        allow_underscore: If True, preserve underscores in the name.
                         If False, remove all non-alphanumeric characters.

    Returns:
        A sanitized name suitable for Python identifiers
    """
    if allow_underscore:
        # Replace any non-alphanumeric character (except underscore) with underscore
        result = re.sub(r'[^a-zA-Z0-9_]', '_', name)
    else:
        # Remove all non-alphanumeric characters
        result = re.sub(r'[^a-zA-Z0-9]', '', name)

    # Collapse multiple underscores into one
    result = re.sub(r'_+', '_', result)
    # Remove leading/trailing underscores
    return result.strip('_')


def sanitize_for_helper_name(name: str) -> str:
    """
    Convert a name to a valid helper function identifier.

    Replaces spaces and special characters with underscores, removes
    consecutive underscores, strips leading/trailing underscores,
    ensures the result starts with a letter, and lowercases everything.

    Args:
        name: The name to sanitize (e.g., "Gold Bar (Logic event)")

    Returns:
        A sanitized name suitable for helper names (e.g., "gold_bar_logic_event")
    """
    result = sanitize_for_identifier(name, allow_underscore=True)

    # Ensure it starts with a letter (prepend 'item_' if needed)
    if result and not result[0].isalpha():
        result = 'item_' + result

    return result.lower()


# Backwards-compatible aliases
sanitize_identifier = sanitize_for_class_name
sanitize_class_name = sanitize_for_class_name
sanitize_option_name = sanitize_for_identifier
sanitize_helper_name = sanitize_for_helper_name
