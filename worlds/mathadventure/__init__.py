from typing import Dict, ClassVar
from BaseClasses import Item, ItemClassification, MultiWorld, Tutorial
from worlds.AutoWorld import WebWorld, World
from .Items import item_table, MathProofItem
from .Locations import location_table
from .Options import MathProof2p2e4Options
from .Regions import create_regions
from .Rules import set_rules


class MathProof2p2e4Web(WebWorld):
    theme = "ocean"
    
    tutorials = [Tutorial(
        "Mathematical Proof Guide",
        "A guide to completing the proof that 2+2=4",
        "English",
        "guide_en.md",
        "guide/en",
        ["MathAdventureTeam"]
    )]


class MathProof2p2e4World(World):
    """
    Math Adventure: Proof that 2+2=4
    
    A logical adventure through mathematical proofs where you must collect
    definitions, axioms, and theorems to prove that 2+2=4.
    Navigate through the regions of mathematical logic, gathering the
    necessary components to complete your proof.
    """
    
    game: ClassVar[str] = "MathProof2p2e4"
    web: ClassVar[WebWorld] = MathProof2p2e4Web()
    
    options_dataclass = MathProof2p2e4Options
    
    item_name_to_id: ClassVar[Dict[str, int]] = {
        name: data.id for name, data in item_table.items() if data.id is not None
    }
    
    location_name_to_id: ClassVar[Dict[str, int]] = {
        name: data.location_id for name, data in location_table.items() if data.location_id is not None
    }
    
    def __init__(self, world: MultiWorld, player: int):
        super().__init__(world, player)
    
    def generate_early(self) -> None:
        # If seed is 1, disable randomization to use canonical item placements
        if self.multiworld.seed == 1:
            self.options.randomize_items.value = False
    
    def create_regions(self) -> None:
        create_regions(self.options, self.multiworld, self.player)
    
    def set_rules(self) -> None:
        set_rules(self)
    
    def create_items(self) -> None:
        # Only create item pool if randomization is enabled
        if self.options.randomize_items.value:
            # Create item pool for randomization
            item_pool = []
            for name, data in item_table.items():
                if name != "Victory":  # Victory is an event, not placed in pool
                    item = MathProofItem(name, data.classification, data.id, self.player)
                    item_pool.append(item)
            
            self.multiworld.itempool += item_pool
    
    def _place_original_items(self) -> None:
        """Place items in their canonical locations when randomization is disabled."""
        # Original item placements: location_name -> item_name
        original_placements = {
            "Definition of 2": "df-2",
            "Definition of 3": "df-3", 
            "Definition of 4": "df-4",
            "1 is Complex": "ax-1cn",
            "2 is Complex": "2cn",
            "Equality Substitution Right": "oveq2i",
            "Equality Substitution Left": "oveq1i",
            "Addition Associativity": "addassi",
            "Triple Equality Transitivity": "3eqtri",
            "Final Equality": "eqtr4i",
        }
        
        for location_name, item_name in original_placements.items():
            location = self.multiworld.get_location(location_name, self.player)
            item_data = item_table[item_name]
            item = MathProofItem(item_name, item_data.classification, item_data.id, self.player)
            location.place_locked_item(item)
    
    def create_item(self, name: str) -> Item:
        data = item_table[name]
        return MathProofItem(name, data.classification, data.id, self.player)
    
    def pre_fill(self) -> None:
        """Pre-fill items if not randomizing."""
        if not self.options.randomize_items.value:
            self._place_original_items()
    
    def generate_basic(self) -> None:
        # Place Victory event at the goal location
        victory_location = self.multiworld.get_location("Theorem: 2+2=4", self.player)
        victory_item = MathProofItem("Victory", ItemClassification.progression, None, self.player)
        victory_location.place_locked_item(victory_item)
        
        # Set completion condition
        self.multiworld.completion_condition[self.player] = lambda state: state.has("Victory", self.player)
    
    def fill_slot_data(self) -> Dict:
        return {
            "proof_complexity": self.options.proof_complexity.value,
            "hint_complexity": self.options.hint_complexity.value,
            "require_all_proofs": self.options.require_all_proofs.value,
        }