import math
from typing import Any, Dict, List, Set
from BaseClasses import CollectionState, Entrance, Item, ItemClassification, Region, Tutorial
from worlds.AutoWorld import WebWorld, World
from .Items import MetamathItem, item_table, item_groups, generate_item_table
from .Locations import MetamathLocation, location_table, generate_location_table
from .Options import MetamathOptions, metamath_option_groups
from .Rules import ProofStructure, ProofStatement, set_metamath_rules, parse_metamath_proof

class MetamathWeb(WebWorld):
    tutorials = []
    option_groups = metamath_option_groups

class MetamathWorld(World):
    """
    Turn MetaMath proofs into Archipelago worlds!
    Each proof step is both a location (proving it) and an item (ability to use it).
    Navigate logical dependencies across the multiworld to complete your proof.
    """

    game: str = "Metamath"
    options_dataclass = MetamathOptions
    web = MetamathWeb()

    item_name_to_id = {name: data.code for name, data in item_table.items()}
    location_name_to_id = {name: data.id for name, data in location_table.items()}
    item_name_groups = item_groups

    ap_world_version = "0.1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.proof_structure: ProofStructure = None
        self.num_statements: int = 0
        self.starting_statements: Set[int] = set()

    def generate_early(self):
        """Load and parse the metamath proof based on options."""
        # Get the theorem name from options
        theorem_name = self.options.theorem.value

        # Extract theorem name from URL if provided
        if theorem_name.startswith("http"):
            # Extract the theorem name from URLs like https://us.metamath.org/mpeuni/2p2e4.html
            import re
            match = re.search(r'/([^/]+)\.html?$', theorem_name)
            if match:
                theorem_name = match.group(1)
            else:
                # Try to extract from path without extension
                parts = theorem_name.rstrip('/').split('/')
                theorem_name = parts[-1] if parts else "2p2e4"

        # Parse the proof using metamath-py
        auto_download = bool(self.options.auto_download_database.value)
        self.proof_structure = parse_metamath_proof(theorem_name, auto_download)
        self.num_statements = len(self.proof_structure.statements)

        # Regenerate item and location tables based on actual proof size
        self.item_table = generate_item_table(self.num_statements)
        self.location_table = generate_location_table(self.num_statements)

        # Update name to id mappings
        self.item_name_to_id = {name: data.code for name, data in self.item_table.items()}
        self.location_name_to_id = {name: data.id for name, data in self.location_table.items()}

        # Determine starting statements
        num_starting = max(1, int(self.num_statements * self.options.starting_statements.value / 100))
        # For simple complexity, give the first few statements
        # For complex, randomize which statements are given
        if self.options.complexity.value == 0:  # Simple
            self.starting_statements = set(range(1, num_starting + 1))
        else:  # Moderate or Complex
            # Give some early statements plus some random ones
            self.starting_statements = {1}  # Always start with first axiom
            remaining = num_starting - 1
            if remaining > 0:
                import random
                candidates = list(range(2, self.num_statements + 1))
                random.shuffle(candidates)
                self.starting_statements.update(candidates[:remaining])


    def create_regions(self):
        """Create the proof region containing all statement locations."""
        menu_region = Region("Menu", self.player, self.multiworld)
        proof_region = Region("Proof", self.player, self.multiworld)

        # Create locations for each statement that can be proven
        for i in range(1, self.num_statements + 1):
            if i not in self.starting_statements:  # Don't create locations for pre-proven statements
                loc_name = f"Prove Statement {i}"
                if loc_name in self.location_name_to_id:
                    location = MetamathLocation(
                        self.player,
                        loc_name,
                        self.location_name_to_id[loc_name],
                        self.proof_structure.dependency_graph.get(i, []),
                        proof_region
                    )
                    proof_region.locations.append(location)

        # Connect regions
        menu_region.connect(proof_region)
        self.multiworld.regions += [menu_region, proof_region]

    def set_rules(self):
        """Set access rules based on proof dependencies."""
        set_metamath_rules(self, self.proof_structure)

    def create_items(self):
        """Create statement items for the item pool."""
        # Create items for all statements
        items = []

        # Add statement items (only for non-starting statements)
        for i in range(1, self.num_statements + 1):
            if i not in self.starting_statements:  # Only create items for statements that need to be found
                item_name = f"Statement {i}"
                if item_name in self.item_name_to_id:
                    item = MetamathItem(
                        item_name,
                        ItemClassification.progression,
                        self.item_name_to_id[item_name],
                        self.player
                    )
                    items.append(item)

        # Add hint/filler items based on settings
        num_locations = self.num_statements - len(self.starting_statements)
        num_items = len(items)
        num_fillers_needed = max(0, num_locations - num_items)

        if num_fillers_needed > 0:
            hints = ["Proof Hint", "Logic Guide", "Axiom Reference", "Lemma Note",
                    "Theorem Insight", "Deduction Tip", "Inference Help", "QED Moment"]
            for _ in range(num_fillers_needed):
                hint = self.random.choice(hints)
                if hint in self.item_name_to_id:
                    item = MetamathItem(
                        hint,
                        ItemClassification.filler,
                        self.item_name_to_id[hint],
                        self.player
                    )
                    items.append(item)

        # Add items to multiworld
        self.multiworld.itempool += items

    def generate_basic(self):
        """Generate the basic world structure."""
        # Pre-collect starting statements
        for stmt_index in self.starting_statements:
            item_name = f"Statement {stmt_index}"
            self.multiworld.push_precollected(self.create_item(item_name))

    def create_item(self, name: str) -> Item:
        """Create a single item."""
        if name in self.item_name_to_id:
            item_data = self.item_table.get(name)
            if item_data:
                return MetamathItem(
                    name,
                    item_data.classification,
                    self.item_name_to_id[name],
                    self.player
                )
        # Fallback to filler
        return MetamathItem(
            "Proof Hint",
            ItemClassification.filler,
            self.item_name_to_id.get("Proof Hint", 234791999),
            self.player
        )

    def fill_slot_data(self) -> Dict[str, Any]:
        """Data to send to the client for this world."""
        return {
            "proof_structure": {
                i: {
                    "label": stmt.label,
                    "expression": stmt.expression,
                    "dependencies": stmt.dependencies
                }
                for i, stmt in self.proof_structure.statements.items()
            },
            "starting_statements": list(self.starting_statements),
            "theorem": self.options.theorem.value,
        }