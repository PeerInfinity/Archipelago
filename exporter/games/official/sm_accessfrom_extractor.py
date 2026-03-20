"""Extract AccessFrom data from VARIA locations."""

import logging
import inspect
from typing import Dict, Any, Set

logger = logging.getLogger(__name__)

def get_location_accessfrom_data(world) -> Dict[str, Dict[str, Any]]:
    """Extract AccessFrom data for all VARIA locations.

    Returns a dictionary mapping location names to their AccessFrom information:
    {
        "Location Name": {
            "regions": {
                "Region Name": <lambda function>,
                ...
            },
            "available": <lambda function>,
            "post_available": <lambda function>
        }
    }
    """
    try:
        from worlds.sm.variaRandomizer.graph.vanilla.graph_locations import locationsDict

        accessfrom_data = {}

        for loc_name, loc_obj in locationsDict.items():
            # Extract AccessFrom dictionary (maps region name -> lambda)
            access_from = getattr(loc_obj, 'AccessFrom', None)
            available = getattr(loc_obj, 'Available', None)
            post_available = getattr(loc_obj, 'PostAvailable', None)

            if access_from is not None or available is not None or post_available is not None:
                accessfrom_data[loc_name] = {
                    'regions': access_from if access_from is not None else {},
                    'available': available,
                    'post_available': post_available
                }

        logger.debug(f"SM: Extracted AccessFrom data for {len(accessfrom_data)} locations")

        return accessfrom_data

    except Exception as e:
        logger.error(f"SM: Failed to extract AccessFrom data: {e}", exc_info=True)
        return {}


def get_simple_accessfrom_locations(world) -> Set[str]:
    """Get locations where all AccessFrom lambdas return SMBool(True).

    These are "simple" locations where region reachability is the only requirement
    from the AccessFrom side.

    Args:
        world: The world instance (used for context, but data comes from locationsDict)

    Returns:
        Set of location names with simple AccessFrom
    """
    try:
        from worlds.sm.variaRandomizer.graph.vanilla.graph_locations import locationsDict

        simple_locations = set()

        for loc_name, loc_obj in locationsDict.items():
            access_from = getattr(loc_obj, 'AccessFrom', None)
            if access_from is None:
                continue

            # Check if all AccessFrom lambdas are SMBool(True)
            is_simple = True
            for region, func in access_from.items():
                try:
                    source = inspect.getsource(func)
                    # Check if the lambda just returns SMBool(True)
                    if 'SMBool(True)' not in source or 'and' in source.lower() or 'wand' in source.lower():
                        # Has additional logic, not simple
                        is_simple = False
                        break
                except Exception:
                    # Can't inspect source, assume not simple
                    is_simple = False
                    break

            if is_simple:
                simple_locations.add(loc_name)

        logger.debug(f"SM: Found {len(simple_locations)} locations with simple AccessFrom")
        return simple_locations

    except Exception as e:
        logger.error(f"SM: Failed to get simple AccessFrom locations: {e}", exc_info=True)
        return set()


def extract_all_accessfrom_info(world_module_path: str) -> Dict[str, Dict[str, str]]:
    """Extract AccessFrom lambda source code for all VARIA locations.

    This parses the source files to get the exact lambda expressions.

    Args:
        world_module_path: Path to the worlds/sm directory

    Returns:
        Dict mapping location_name -> {region_name -> lambda_source}
    """
    import re

    try:
        from worlds.sm.variaRandomizer.graph.vanilla.graph_locations import locationsDict

        accessfrom_info = {}

        for loc_name, loc_obj in locationsDict.items():
            access_from = getattr(loc_obj, 'AccessFrom', None)
            if access_from is None:
                continue

            region_lambdas = {}
            for region, func in access_from.items():
                try:
                    source = inspect.getsource(func)
                    # Source format: "    'Region Name': lambda sm: <body>,\n"
                    # We need to extract just: "lambda sm: <body>"
                    source = source.strip()
                    # Remove trailing comma if present
                    if source.endswith(','):
                        source = source[:-1]
                    # Find the lambda keyword and extract from there
                    lambda_match = re.search(r'lambda\s+\w+\s*:', source)
                    if lambda_match:
                        # Extract from lambda to end
                        lambda_source = source[lambda_match.start():].strip()
                        region_lambdas[region] = lambda_source
                    else:
                        logger.debug(f"SM: Could not find lambda in source for {loc_name}/{region}")
                        continue
                except Exception as e:
                    logger.debug(f"SM: Could not get source for {loc_name}/{region}: {e}")
                    continue

            if region_lambdas:
                accessfrom_info[loc_name] = region_lambdas

        logger.debug(f"SM: Extracted AccessFrom source for {len(accessfrom_info)} locations")
        return accessfrom_info

    except Exception as e:
        logger.error(f"SM: Failed to extract AccessFrom info: {e}", exc_info=True)
        return {}
