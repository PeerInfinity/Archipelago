from typing import Dict, NamedTuple, Optional
from BaseClasses import Location


class LocationData(NamedTuple):
    id: Optional[int]
    region: str
    

base_location_id = 300000000


class BakingAdventureLocation(Location):
    game = "Baking Adventure"
    

# All locations from the JSON file with their regions
location_table: Dict[str, LocationData] = {
    # Kitchen locations
    "Gather Mixing Bowls": LocationData(
        id=base_location_id + 1,
        region="Kitchen"
    ),
    "Get Electric Mixer": LocationData(
        id=base_location_id + 2,
        region="Kitchen"
    ),
    "Find Measuring Tools": LocationData(
        id=base_location_id + 3,
        region="Kitchen"
    ),
    
    # Preparation locations
    "Preheat Oven to 375F": LocationData(
        id=base_location_id + 4,
        region="Preparation"
    ),
    "Line Baking Sheets": LocationData(
        id=base_location_id + 5,
        region="Preparation"
    ),
    "Soften Butter": LocationData(
        id=base_location_id + 6,
        region="Preparation"
    ),
    
    # WetIngredients locations
    "Cream Butter and Sugars": LocationData(
        id=base_location_id + 7,
        region="WetIngredients"
    ),
    "Add Eggs": LocationData(
        id=base_location_id + 8,
        region="WetIngredients"
    ),
    "Add Vanilla": LocationData(
        id=base_location_id + 9,
        region="WetIngredients"
    ),
    
    # DryIngredients locations
    "Measure Flour": LocationData(
        id=base_location_id + 10,
        region="DryIngredients"
    ),
    "Add Baking Soda and Salt": LocationData(
        id=base_location_id + 11,
        region="DryIngredients"
    ),
    
    # Combining locations
    "Gradually Mix Dry into Wet": LocationData(
        id=base_location_id + 12,
        region="Combining"
    ),
    "Fold in Chocolate Chips": LocationData(
        id=base_location_id + 13,
        region="Combining"
    ),
    
    # Finishing locations
    "Scoop Dough onto Sheets": LocationData(
        id=base_location_id + 14,
        region="Finishing"
    ),
    
    # Baking locations
    "Bake for 9-11 Minutes": LocationData(
        id=base_location_id + 15,
        region="Baking"
    ),
    
    # Victory event location (no ID)
    "Cool on Wire Rack": LocationData(
        id=None,  # Event locations don't have IDs
        region="Baking"
    ),
}


# Helper functions
def get_location_names() -> list[str]:
    """Get all location names."""
    return list(location_table.keys())


def get_locations_by_region(region: str) -> list[str]:
    """Get all location names in a specific region."""
    return [name for name, data in location_table.items() if data.region == region]


def get_all_regions() -> list[str]:
    """Get all unique region names."""
    return list(set(data.region for data in location_table.values()))