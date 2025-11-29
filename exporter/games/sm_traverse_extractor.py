"""Extract traverse and transition lambdas from Super Metroid AccessPoint objects.

This module provides functionality to extract functions from AccessPoint objects
and unwrap Cache.ldeco decorators, which is needed to properly export exit rules
that reference the 'ret' variable from the Cache.ldeco decorator.
"""

import logging
from typing import Dict, Any, Optional, Callable

logger = logging.getLogger(__name__)


def is_cache_ldeco_wrapped(func: Callable) -> bool:
    """Check if a function is wrapped by Cache.ldeco.

    Cache.ldeco creates a wrapper with:
    - Function name: '_decorator'
    - Closure with 1 cell containing the original function
    - Free variable named 'func'

    Args:
        func: The function to check

    Returns:
        True if the function is Cache.ldeco wrapped
    """
    if not callable(func):
        return False

    # Check for closure
    if not hasattr(func, '__closure__') or not func.__closure__:
        return False

    # Check for exactly 1 closure cell
    if len(func.__closure__) != 1:
        return False

    # Check for free variable named 'func'
    if not hasattr(func, '__code__'):
        return False

    freevars = func.__code__.co_freevars
    if len(freevars) != 1 or freevars[0] != 'func':
        return False

    # Check if the wrapper is named '_decorator'
    if func.__name__ != '_decorator':
        return False

    return True


def unwrap_cache_ldeco(func: Callable) -> Optional[Callable]:
    """Unwrap a Cache.ldeco-wrapped function to get the original lambda.

    Args:
        func: The wrapped function

    Returns:
        The original unwrapped function, or None if unwrapping failed
    """
    if not is_cache_ldeco_wrapped(func):
        return None

    try:
        # The original function is in the first closure cell
        original_func = func.__closure__[0].cell_contents
        logger.debug(f"SM: Successfully unwrapped Cache.ldeco wrapper")
        return original_func
    except (AttributeError, ValueError, IndexError) as e:
        logger.warning(f"SM: Failed to unwrap Cache.ldeco: {e}")
        return None


def get_accesspoint_traverse_funcs(world) -> Dict[str, Any]:
    """Extract traverse functions from all AccessPoints in the world.

    Args:
        world: The SM world instance

    Returns:
        Dict mapping AccessPoint name to its traverse function
    """
    traverse_funcs = {}

    try:
        # Import accessPoints directly from graph_access module
        from worlds.sm.variaRandomizer.graph.vanilla.graph_access import accessPoints

        # accessPoints is a list of AccessPoint objects
        for ap in accessPoints:
            ap_name = ap.Name
            traverse_func = ap.traverse

            # Store the traverse function for this AccessPoint
            traverse_funcs[ap_name] = traverse_func
            logger.debug(f"SM: Extracted traverse function for AccessPoint '{ap_name}'")

        logger.debug(f"SM: Extracted traverse functions for {len(traverse_funcs)} AccessPoints")

    except Exception as e:
        logger.error(f"SM: Failed to extract AccessPoint traverse functions: {e}", exc_info=True)

    return traverse_funcs


def get_transitions_for_accesspoint(world, ap_name: str) -> Dict[str, Any]:
    """Get all transitions for a specific AccessPoint.

    Args:
        world: The SM world instance
        ap_name: The AccessPoint name

    Returns:
        Dict mapping destination name to transition function
    """
    try:
        from worlds.sm.variaRandomizer.graph.vanilla.graph_access import accessPoints

        for ap in accessPoints:
            if ap.Name == ap_name:
                # Return the transitions dictionary (includes both intra and inter-area)
                return ap.transitions

        logger.warning(f"SM: AccessPoint '{ap_name}' not found")
        return {}

    except Exception as e:
        logger.error(f"SM: Failed to get transitions for '{ap_name}': {e}", exc_info=True)
        return {}


def get_all_transitions() -> Dict[str, Dict[str, Callable]]:
    """Extract all transitions from all AccessPoints.

    Returns:
        Dict mapping AccessPoint name -> {destination name -> transition function}
    """
    all_transitions = {}

    try:
        from worlds.sm.variaRandomizer.graph.vanilla.graph_access import accessPoints

        for ap in accessPoints:
            ap_name = ap.Name
            # Get the transitions dictionary (intraTransitions, not including connected areas)
            transitions = ap.intraTransitions.copy()

            all_transitions[ap_name] = transitions
            logger.debug(f"SM: Extracted {len(transitions)} transitions for AccessPoint '{ap_name}'")

        logger.debug(f"SM: Extracted transitions for {len(all_transitions)} AccessPoints")

    except Exception as e:
        logger.error(f"SM: Failed to extract all transitions: {e}", exc_info=True)

    return all_transitions


def get_transition_lambda(source_ap_name: str, dest_ap_name: str, unwrap: bool = True) -> Optional[Callable]:
    """Get the transition lambda for a specific exit.

    Args:
        source_ap_name: Source AccessPoint name
        dest_ap_name: Destination AccessPoint name
        unwrap: If True, unwrap Cache.ldeco decorators

    Returns:
        The transition lambda, optionally unwrapped, or None if not found
    """
    try:
        from worlds.sm.variaRandomizer.graph.vanilla.graph_access import accessPoints

        # Find the source AccessPoint
        for ap in accessPoints:
            if ap.Name == source_ap_name:
                # Get the transition for this destination
                transition_func = ap.intraTransitions.get(dest_ap_name)

                if transition_func is None:
                    # Maybe it's in the full transitions (includes inter-area)
                    transition_func = ap.transitions.get(dest_ap_name)

                if transition_func is None:
                    logger.debug(f"SM: No transition from '{source_ap_name}' to '{dest_ap_name}'")
                    return None

                # Unwrap if requested and wrapped
                if unwrap and is_cache_ldeco_wrapped(transition_func):
                    unwrapped = unwrap_cache_ldeco(transition_func)
                    if unwrapped:
                        logger.debug(f"SM: Unwrapped Cache.ldeco for transition '{source_ap_name}' -> '{dest_ap_name}'")
                        return unwrapped
                    else:
                        logger.warning(f"SM: Failed to unwrap transition '{source_ap_name}' -> '{dest_ap_name}'")
                        return transition_func
                else:
                    return transition_func

        logger.warning(f"SM: Source AccessPoint '{source_ap_name}' not found")
        return None

    except Exception as e:
        logger.error(f"SM: Failed to get transition lambda for '{source_ap_name}' -> '{dest_ap_name}': {e}", exc_info=True)
        return None
