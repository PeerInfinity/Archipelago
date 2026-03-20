from typing import ClassVar, Dict, Any
from BaseClasses import Region, Entrance, Location, Item, Tutorial
from worlds.AutoWorld import World, WebWorld
from .Items import BakingAdventureItem, base_item_id, item_table
from .Locations import BakingAdventureLocation, base_location_id, location_table
from .Regions import create_regions
from .Rules import set_rules
from .Options import BakingAdventureOptions


class BakingAdventureWeb(WebWorld):
    theme = "partyTime"
    game_info_languages = ['en']
    tutorials = [Tutorial(
        "Multiworld Setup Guide",
        "A guide to setting up the Archipelago Baking Adventure randomizer on your computer.",
        "English",
        "setup_en.md",
        "setup/en",
        ["Archipelago Team"]
    )]


class BakingAdventureWorld(World):
    """
    Baking Adventure is a game about baking the perfect chocolate chip cookies.
    Navigate through the kitchen regions, gather ingredients and tools, and follow the
    baking process step by step to create delicious cookies!
    """

    game = "Baking Adventure"
    web = BakingAdventureWeb()
    options_dataclass = BakingAdventureOptions
    options: BakingAdventureOptions

    base_id = base_location_id
    item_name_to_id = {name: data.code for name, data in item_table.items() if data.code is not None}
    location_name_to_id = {name: data.id for name, data in location_table.items() if data.id is not None}

    item_name_groups: ClassVar[Dict[str, frozenset]] = {
        "Everything": frozenset(["Mixing Bowls", "Electric Mixer", "Measuring Tools", "Preheated Oven", "Prepared Sheets", "Softened Butter", "Butter Sugar Base", "Egg Mixture", "Creamed Mixture", "Measured Flour", "Flour Mixture", "Basic Dough", "Cookie Dough", "Shaped Cookies", "Baked Cookies"]),
    }

    # Canonical item placements - where items belong in the "vanilla" game
    # Used by exporter to distinguish canonical placements from always-locked items
    canonical_placements: ClassVar[Dict[str, str]] = {
        "Gather Mixing Bowls": "Mixing Bowls",
        "Get Electric Mixer": "Electric Mixer",
        "Find Measuring Tools": "Measuring Tools",
        "Preheat Oven to 375F": "Preheated Oven",
        "Line Baking Sheets": "Prepared Sheets",
        "Soften Butter": "Softened Butter",
        "Cream Butter and Sugars": "Butter Sugar Base",
        "Add Eggs": "Egg Mixture",
        "Add Vanilla": "Creamed Mixture",
        "Measure Flour": "Measured Flour",
        "Add Baking Soda and Salt": "Flour Mixture",
        "Gradually Mix Dry into Wet": "Basic Dough",
        "Fold in Chocolate Chips": "Cookie Dough",
        "Scoop Dough onto Sheets": "Shaped Cookies",
        "Bake for 9-11 Minutes": "Baked Cookies",
    }
    
    def create_items(self) -> None:
        """Create items for the world."""
        # Create all progression items
        for item_name, item_data in item_table.items():
            if item_data.progression and item_name != "Victory":
                item = self.create_item(item_name)
                self.multiworld.itempool.append(item)
    
    def create_item(self, name: str) -> Item:
        """Create an item by name."""
        item_data = item_table[name]
        return BakingAdventureItem(name, item_data.classification, item_data.code, self.player)
    
    def create_regions(self) -> None:
        """Create regions for the world."""
        create_regions(self.multiworld, self.player)
    
    def set_rules(self) -> None:
        """Set access rules for locations and entrances."""
        set_rules(self.multiworld, self.player)
    
    def fill_slot_data(self) -> Dict[str, Any]:
        """Fill slot data for the client."""
        return {
            "vanilla_placement": self.options.vanilla_placement.value,
        }

    def generate_early(self) -> None:
        """Generate early logic."""
        # Set is_vanilla dynamically based on the option
        if self.options.vanilla_placement.value:
            self.is_vanilla = True
    
    def generate_basic(self) -> None:
        """Generate basic elements including victory condition."""
        # Place the Victory event at the Cool on Wire Rack location
        victory_location = self.multiworld.get_location("Cool on Wire Rack", self.player)

        # Only place if not already filled (e.g., by _place_original_items)
        if victory_location.item is None:
            victory_item = BakingAdventureItem("Victory", item_table["Victory"].classification, None, self.player)
            victory_location.place_locked_item(victory_item)

        # Set completion condition
        self.multiworld.completion_condition[self.player] = lambda state: state.has("Victory", self.player)
    
    def pre_fill(self) -> None:
        """Pre-fill items if using vanilla placement."""
        if self.options.vanilla_placement.value:
            self._place_original_items()
    
    def _place_original_items(self) -> None:
        """Place items in their canonical locations when not randomized."""
        for location_name, item_name in self.canonical_placements.items():
            location = self.multiworld.get_location(location_name, self.player)
            item = self.create_item(item_name)
            location.place_locked_item(item)
            
            # Remove the item from the pool if it exists
            for pool_item in self.multiworld.itempool[:]:
                if pool_item.name == item_name and pool_item.player == self.player:
                    self.multiworld.itempool.remove(pool_item)
                    break