from typing import Any, Dict, Set
from BaseClasses import Item, ItemClassification, Region, Tutorial
from worlds.AutoWorld import WebWorld, World
from .Items import MetamathItem, item_table, item_groups, statement_item_name, proved_item_name
from .Locations import MetamathLocation, location_table, statement_location_name
from .Options import MetamathOptions, metamath_option_groups
from .Rules import ProofStructure, set_metamath_rules, parse_metamath_proof

class MetamathWeb(WebWorld):
    game_info_languages = ['en']
    tutorials = [Tutorial(
        "Multiworld Setup Guide",
        "A guide to setting up Metamath for MultiWorld.",
        "English",
        "setup_en.md",
        "setup/en",
        ["Archipelago Team"]
    )]
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
        self._entrance_labels: Dict[int, str] = {}
        # Reverse lookup: region/location name -> statement index
        self._region_name_to_index: Dict[str, int] = {}

    def _build_name_maps(self):
        """Build name mappings from proof structure."""
        for index, stmt in self.proof_structure.statements.items():
            self._entrance_labels[index] = stmt.label if stmt.label else f"Statement {index}"
        # Build reverse lookup from generic region names
        for i in range(1, self.num_statements + 1):
            self._region_name_to_index[f"Prove Statement {i}"] = i

    def get_item_name(self, index: int) -> str:
        """Get the generic item name for a statement index (matches datapackage)."""
        return f"Statement {index}"

    def get_location_name(self, index: int) -> str:
        """Get the generic location/region name for a statement index (matches datapackage)."""
        return f"Prove Statement {index}"

    def get_entrance_label(self, index: int) -> str:
        """Get a short label for entrance names."""
        return self._entrance_labels.get(index, f"Statement {index}")

    def generate_early(self):
        """Load and parse the metamath proof based on options."""
        # Vanilla placement disables randomization and marks world as vanilla
        if self.options.vanilla_placement.value:
            self.options.randomize_items.value = False
            self.options.starting_statements.value = 0
            self.is_vanilla = True

        # When items aren't randomized, locked placement creates circular region
        # dependencies that the accessibility checker can't traverse (e.g. prmunb
        # has Statement 22 -> 23 -> 24 -> 27 -> 22). The placement is always valid
        # by construction (proof structure guarantees it), so use minimal accessibility.
        if not self.options.randomize_items.value:
            self.options.accessibility.value = 2  # minimal

        # Get the theorem name from options (use current_key for string representation)
        theorem_name = self.options.theorem.current_key

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

        # Build meaningful name mappings from proof structure
        self._build_name_maps()

        # Set preset label for the frontend (e.g., "canth s4" or "2p2e4 v")
        if self.options.vanilla_placement.value:
            self.preset_label = f"{theorem_name} v"
        else:
            self.preset_label = f"{theorem_name} s{self.multiworld.seed}"

        # Build name substitutions for the world generator to apply
        # Maps generic names -> meaningful names so WorldGen worlds use readable names
        self.name_substitutions = {"items": {}, "locations": {}, "regions": {}}
        for i, stmt in self.proof_structure.statements.items():
            dependencies = self.proof_structure.dependency_graph.get(i, set())
            has_deps = len(dependencies) > 0

            # Determine prefix based on label convention and dependency status
            if has_deps:
                loc_prefix = "Prove"
                proved_prefix = "Proved"
            elif stmt.label and stmt.label.startswith("ax-"):
                loc_prefix = "Axiom"
                proved_prefix = "Axiom"
            elif stmt.label and stmt.label.startswith("df-"):
                loc_prefix = "Definition"
                proved_prefix = "Definition"
            else:
                loc_prefix = "Given"
                proved_prefix = "Given"

            generic_item = f"Statement {i}"
            generic_loc = f"Prove Statement {i}"
            generic_proved = f"Proved Statement {i}"
            meaningful_item = statement_item_name(stmt.label, stmt.expression)
            meaningful_loc = statement_location_name(stmt.label, stmt.expression, prefix=loc_prefix)
            meaningful_proved = proved_item_name(stmt.label, stmt.expression, prefix=proved_prefix)
            if generic_item != meaningful_item:
                self.name_substitutions["items"][generic_item] = meaningful_item
            if generic_proved != meaningful_proved:
                self.name_substitutions["items"][generic_proved] = meaningful_proved
            if generic_loc != meaningful_loc:
                self.name_substitutions["locations"][generic_loc] = meaningful_loc
                self.name_substitutions["regions"][generic_loc] = meaningful_loc

        # Use the class-level generic item/location tables (Statement N / Prove Statement N)
        # Meaningful names (theorem labels) are sent in slot_data for client display

        # Determine starting statements
        num_starting = max(1, int(self.num_statements * self.options.starting_statements.value / 100))
        if not self.options.randomize_starting_statements.value:
            # Ordered: give the first N statements in proof order
            self.starting_statements = set(range(1, num_starting + 1))
        else:
            # Randomized: pick from throughout the proof
            self.starting_statements = {1}  # Always start with first axiom
            remaining = num_starting - 1
            if remaining > 0:
                import random
                candidates = list(range(2, self.num_statements + 1))
                random.shuffle(candidates)
                self.starting_statements.update(candidates[:remaining])

        # Build canonical placements dict (location -> item for vanilla placement)
        # Must be after starting_statements is computed since starting items don't have locations
        # Exclude the final statement — its item is always locked at its location
        self.canonical_placements: Dict[str, str] = {}
        for i in range(1, self.num_statements + 1):
            if i not in self.starting_statements and i != self.num_statements:
                self.canonical_placements[self.get_location_name(i)] = self.get_item_name(i)


    def create_regions(self):
        """Create one region per statement with connections based on proof dependencies."""
        menu_region = Region("Menu", self.player, self.multiworld)

        # Create a region for each statement
        statement_regions = {}

        for i in range(1, self.num_statements + 1):
            region_name = self.get_location_name(i)
            region = Region(region_name, self.player, self.multiworld)
            statement_regions[i] = region

            # Create location in this region (if not a starting statement)
            if i not in self.starting_statements:
                loc_name = self.get_location_name(i)
                if loc_name in self.location_name_to_id:
                    location = MetamathLocation(
                        self.player,
                        loc_name,
                        self.location_name_to_id[loc_name],
                        self.proof_structure.dependency_graph.get(i, []),
                        region
                    )
                    region.locations.append(location)

                # Add event location: "Proved Statement N" fires when region is reachable
                event_loc = MetamathLocation(
                    self.player,
                    f"Proved Statement {i}",
                    None,  # Event locations have no address
                    [],
                    region
                )
                event_item = MetamathItem(
                    f"Proved Statement {i}",
                    ItemClassification.progression,
                    None,  # Event items have no code
                    self.player
                )
                event_loc.place_locked_item(event_item)
                region.locations.append(event_loc)

        # Connect Menu to statement regions that have NO dependencies (axioms/base statements)
        for i in sorted(statement_regions.keys()):
            region = statement_regions[i]
            dependencies = self.proof_structure.dependency_graph.get(i, [])
            if not dependencies:
                menu_region.connect(region, f"To {self.get_entrance_label(i)}")

        # Connect regions based on dependency graph
        # Create exits from each statement to statements that depend on it
        for i in sorted(self.proof_structure.reverse_dependencies.keys()):
            dependents = self.proof_structure.reverse_dependencies[i]
            if i in statement_regions:
                source_region = statement_regions[i]
                for dependent in sorted(dependents):
                    if dependent in statement_regions:
                        target_region = statement_regions[dependent]
                        source_region.connect(
                            target_region,
                            f"From {self.get_entrance_label(i)} to {self.get_entrance_label(dependent)}"
                        )

        # Add all regions to multiworld
        self.multiworld.regions.append(menu_region)
        self.multiworld.regions.extend(statement_regions.values())

    def set_rules(self):
        """Set access rules based on proof dependencies."""
        set_metamath_rules(self, self.proof_structure, self.options.entrance_rule_mode.value)

        # Set completion condition - require the "Proved" event for the final theorem
        final_proved = f"Proved Statement {self.num_statements}"
        self.multiworld.completion_condition[self.player] = \
            lambda state, name=final_proved: state.has(name, self.player)

        # Save dependency mappings for the exporter to use
        # Each dependency requires both the item AND the proved event
        location_dependencies = {}
        entrance_dependencies = {}
        exit_dependencies = {}

        for region in self.multiworld.get_regions(self.player):
            stmt_num = self._region_name_to_index.get(region.name)

            if stmt_num is not None and stmt_num in self.proof_structure.dependency_graph:
                dependencies = self.proof_structure.dependency_graph[stmt_num]
                if dependencies:
                    dep_names = []
                    for d in sorted(dependencies):
                        dep_names.append(self.get_item_name(d))       # "Statement K"
                        dep_names.append(f"Proved Statement {d}")     # "Proved Statement K"

                    for location in region.locations:
                        location_dependencies[location.name] = dep_names

                    for entrance in region.entrances:
                        entrance_dependencies[entrance.name] = dep_names

            # Also store exit dependencies - exits lead TO regions with dependencies
            for exit in region.exits:
                if exit.connected_region:
                    target_stmt_num = self._region_name_to_index.get(exit.connected_region.name)
                    if target_stmt_num is not None and target_stmt_num in self.proof_structure.dependency_graph:
                        target_dependencies = self.proof_structure.dependency_graph[target_stmt_num]
                        if target_dependencies:
                            target_dep_names = []
                            for d in sorted(target_dependencies):
                                target_dep_names.append(self.get_item_name(d))
                                target_dep_names.append(f"Proved Statement {d}")
                            exit_dependencies[exit.name] = target_dep_names

        self.location_dependencies = location_dependencies
        self.entrance_dependencies = entrance_dependencies
        self.exit_dependencies = exit_dependencies

    def create_items(self):
        """Create statement items for the item pool."""
        # Only create item pool if randomization is enabled
        if not self.options.randomize_items.value:
            # Items will be placed in pre_fill instead
            return

        # Create items for all statements
        items = []

        # Add statement items (skip starting statements and the final statement)
        # The final statement's item is always locked at its location (victory item)
        for i in range(1, self.num_statements + 1):
            if i not in self.starting_statements and i != self.num_statements:
                item_name = self.get_item_name(i)
                if item_name in self.item_name_to_id:
                    item = MetamathItem(
                        item_name,
                        ItemClassification.progression,
                        self.item_name_to_id[item_name],
                        self.player
                    )
                    items.append(item)

        # Add items to multiworld
        self.multiworld.itempool += items

    def pre_fill(self):
        """Pre-fill items: always lock the final statement, and all others if not randomizing."""
        # Always lock the final statement's item at its location (victory item)
        final_item_name = self.get_item_name(self.num_statements)
        final_location_name = self.get_location_name(self.num_statements)
        final_location = self.multiworld.get_location(final_location_name, self.player)
        final_location.place_locked_item(self.create_item(final_item_name))

        if not self.options.randomize_items.value:
            self._place_original_items()

    def _place_original_items(self):
        """Place statement items in their corresponding prove locations when randomization is disabled.
        Skips the final statement (already locked in pre_fill)."""
        for i in range(1, self.num_statements + 1):
            if i not in self.starting_statements and i != self.num_statements:
                item_name = self.get_item_name(i)
                location_name = self.get_location_name(i)

                location = self.multiworld.get_location(location_name, self.player)
                item = self.create_item(item_name)

                location.place_locked_item(item)

    def generate_basic(self):
        """Generate the basic world structure."""
        # Pre-collect starting statements (both the item and the "proved" event)
        for stmt_index in self.starting_statements:
            item_name = self.get_item_name(stmt_index)
            self.multiworld.push_precollected(self.create_item(item_name))
            # Also pre-collect the "Proved" event so downstream entrance rules are satisfied
            proved_item = MetamathItem(
                f"Proved Statement {stmt_index}",
                ItemClassification.progression,
                None,  # Event items have no code
                self.player
            )
            self.multiworld.push_precollected(proved_item)

    def create_item(self, name: str) -> Item:
        """Create a single item."""
        item_data = item_table.get(name)
        if item_data:
            return MetamathItem(
                name,
                item_data.classification,
                item_data.code,
                self.player
            )
        # Last resort: create as progression with the requested name
        return MetamathItem(
            name,
            ItemClassification.progression,
            self.item_name_to_id.get(name, 234790000),
            self.player
        )

    def fill_slot_data(self) -> Dict[str, Any]:
        """Data to send to the client for this world."""
        return {
            "proof_structure": {
                i: {
                    "label": stmt.label,
                    "expression": stmt.expression,
                    "dependencies": stmt.dependencies,
                    "full_text": stmt.full_text,
                    **({"instantiated_expression": stmt.instantiated_expression}
                       if stmt.instantiated_expression and stmt.instantiated_expression != stmt.expression
                       else {}),
                }
                for i, stmt in self.proof_structure.statements.items()
            },
            "starting_statements": list(self.starting_statements),
            "theorem": self.options.theorem.current_key,
            "randomize_items": self.options.randomize_items.value,
            "vanilla_placement": self.options.vanilla_placement.value,
        }
