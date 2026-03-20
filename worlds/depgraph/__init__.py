from typing import Any, Dict, Set
from BaseClasses import Item, ItemClassification, Region, Tutorial
from worlds.AutoWorld import WebWorld, World
from .Items import DepGraphItem, item_table, item_groups, node_item_name, event_item_name
from .Locations import DepGraphLocation, location_table, node_location_name
from .Options import DepGraphOptions, depgraph_option_groups
from .Rules import GraphStructure, set_depgraph_rules, parse_depgraph

class DepGraphWeb(WebWorld):
    game_info_languages = ['en']
    tutorials = [Tutorial(
        "Multiworld Setup Guide",
        "A guide to setting up DepGraph for MultiWorld.",
        "English",
        "setup_en.md",
        "setup/en",
        ["Archipelago Team"]
    )]
    option_groups = depgraph_option_groups

class DepGraphWorld(World):
    """
    Turn any directed acyclic graph into an Archipelago world!
    Each node is both a location (unlocking it) and an item (ability to use it).
    Navigate dependency edges across the multiworld to reach the final node.
    """

    game: str = "DepGraph"
    options_dataclass = DepGraphOptions
    web = DepGraphWeb()

    item_name_to_id = {name: data.code for name, data in item_table.items()}
    location_name_to_id = {name: data.id for name, data in location_table.items()}
    item_name_groups = item_groups

    ap_world_version = "0.1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.graph_structure: GraphStructure = None
        self.num_nodes: int = 0
        self.starting_node_set: Set[int] = set()
        self._entrance_labels: Dict[int, str] = {}
        self._region_name_to_index: Dict[str, int] = {}

    def _build_name_maps(self):
        """Build name mappings from graph structure."""
        for index, node in self.graph_structure.nodes.items():
            self._entrance_labels[index] = node.node_id if node.node_id else f"Node {index}"
        for i in range(1, self.num_nodes + 1):
            self._region_name_to_index[f"Complete Node {i}"] = i

    def get_item_name(self, index: int) -> str:
        """Get the generic item name for a node index (matches datapackage)."""
        return f"Node {index}"

    def get_location_name(self, index: int) -> str:
        """Get the generic location/region name for a node index (matches datapackage)."""
        return f"Complete Node {index}"

    def get_entrance_label(self, index: int) -> str:
        """Get a short label for entrance names."""
        return self._entrance_labels.get(index, f"Node {index}")

    def generate_early(self):
        """Load and parse the dependency graph based on options."""
        if self.options.vanilla_placement.value:
            self.options.randomize_items.value = False
            self.options.starting_nodes.value = 0
            self.is_vanilla = True

        if not self.options.randomize_items.value:
            self.options.accessibility.value = 2  # minimal

        graph_key = self.options.graph_file.current_key
        self.graph_structure = parse_depgraph(graph_key)
        self.num_nodes = len(self.graph_structure.nodes)

        self._build_name_maps()

        # Set preset label for the frontend
        if self.options.vanilla_placement.value:
            self.preset_label = f"{graph_key} v"
        else:
            self.preset_label = f"{graph_key} s{self.multiworld.seed}"

        # Build name substitutions
        self.name_substitutions = {"items": {}, "locations": {}, "regions": {}}
        for i, node in self.graph_structure.nodes.items():
            generic_item = f"Node {i}"
            generic_loc = f"Complete Node {i}"
            generic_proved = f"Completed Node {i}"
            meaningful_item = node_item_name(node.expression)
            meaningful_loc = node_location_name(node.expression)
            meaningful_proved = event_item_name(node.expression)
            if generic_item != meaningful_item:
                self.name_substitutions["items"][generic_item] = meaningful_item
            if generic_proved != meaningful_proved:
                self.name_substitutions["items"][generic_proved] = meaningful_proved
            if generic_loc != meaningful_loc:
                self.name_substitutions["locations"][generic_loc] = meaningful_loc
                self.name_substitutions["regions"][generic_loc] = meaningful_loc

        # Determine starting nodes
        num_starting = max(1, int(self.num_nodes * self.options.starting_nodes.value / 100))
        if not self.options.randomize_starting_nodes.value:
            self.starting_node_set = set(range(1, num_starting + 1))
        else:
            self.starting_node_set = {1}
            remaining = num_starting - 1
            if remaining > 0:
                import random
                candidates = list(range(2, self.num_nodes + 1))
                random.shuffle(candidates)
                self.starting_node_set.update(candidates[:remaining])

        # Build canonical placements (exclude final node)
        self.canonical_placements: Dict[str, str] = {}
        for i in range(1, self.num_nodes + 1):
            if i not in self.starting_node_set and i != self.num_nodes:
                self.canonical_placements[self.get_location_name(i)] = self.get_item_name(i)

    def create_regions(self):
        """Create one region per node with connections based on dependencies."""
        menu_region = Region("Menu", self.player, self.multiworld)

        node_regions = {}

        for i in range(1, self.num_nodes + 1):
            region_name = self.get_location_name(i)
            region = Region(region_name, self.player, self.multiworld)
            node_regions[i] = region

            if i not in self.starting_node_set:
                loc_name = self.get_location_name(i)
                if loc_name in self.location_name_to_id:
                    location = DepGraphLocation(
                        self.player,
                        loc_name,
                        self.location_name_to_id[loc_name],
                        self.graph_structure.dependency_graph.get(i, []),
                        region
                    )
                    region.locations.append(location)

                event_loc = DepGraphLocation(
                    self.player,
                    f"Completed Node {i}",
                    None,
                    [],
                    region
                )
                event_item = DepGraphItem(
                    f"Completed Node {i}",
                    ItemClassification.progression,
                    None,
                    self.player
                )
                event_loc.place_locked_item(event_item)
                region.locations.append(event_loc)

        # Connect Menu to root nodes (no dependencies)
        for i in sorted(node_regions.keys()):
            region = node_regions[i]
            dependencies = self.graph_structure.dependency_graph.get(i, [])
            if not dependencies:
                menu_region.connect(region, f"To {self.get_entrance_label(i)}")

        # Connect regions based on reverse dependencies
        for i in sorted(self.graph_structure.reverse_dependencies.keys()):
            dependents = self.graph_structure.reverse_dependencies[i]
            if i in node_regions:
                source_region = node_regions[i]
                for dependent in sorted(dependents):
                    if dependent in node_regions:
                        target_region = node_regions[dependent]
                        source_region.connect(
                            target_region,
                            f"From {self.get_entrance_label(i)} to {self.get_entrance_label(dependent)}"
                        )

        self.multiworld.regions.append(menu_region)
        self.multiworld.regions.extend(node_regions.values())

    def set_rules(self):
        """Set access rules based on graph dependencies."""
        set_depgraph_rules(self, self.graph_structure, self.options.entrance_rule_mode.value)

        final_proved = f"Completed Node {self.num_nodes}"
        self.multiworld.completion_condition[self.player] = \
            lambda state, name=final_proved: state.has(name, self.player)

        location_dependencies = {}
        entrance_dependencies = {}
        exit_dependencies = {}

        for region in self.multiworld.get_regions(self.player):
            stmt_num = self._region_name_to_index.get(region.name)

            if stmt_num is not None and stmt_num in self.graph_structure.dependency_graph:
                dependencies = self.graph_structure.dependency_graph[stmt_num]
                if dependencies:
                    dep_names = []
                    for d in sorted(dependencies):
                        dep_names.append(self.get_item_name(d))
                        dep_names.append(f"Completed Node {d}")

                    for location in region.locations:
                        location_dependencies[location.name] = dep_names

                    for entrance in region.entrances:
                        entrance_dependencies[entrance.name] = dep_names

            for exit in region.exits:
                if exit.connected_region:
                    target_stmt_num = self._region_name_to_index.get(exit.connected_region.name)
                    if target_stmt_num is not None and target_stmt_num in self.graph_structure.dependency_graph:
                        target_dependencies = self.graph_structure.dependency_graph[target_stmt_num]
                        if target_dependencies:
                            target_dep_names = []
                            for d in sorted(target_dependencies):
                                target_dep_names.append(self.get_item_name(d))
                                target_dep_names.append(f"Completed Node {d}")
                            exit_dependencies[exit.name] = target_dep_names

        self.location_dependencies = location_dependencies
        self.entrance_dependencies = entrance_dependencies
        self.exit_dependencies = exit_dependencies

    def create_items(self):
        """Create node items for the item pool."""
        if not self.options.randomize_items.value:
            return

        items = []
        for i in range(1, self.num_nodes + 1):
            if i not in self.starting_node_set and i != self.num_nodes:
                item_name = self.get_item_name(i)
                if item_name in self.item_name_to_id:
                    item = DepGraphItem(
                        item_name,
                        ItemClassification.progression,
                        self.item_name_to_id[item_name],
                        self.player
                    )
                    items.append(item)

        self.multiworld.itempool += items

    def pre_fill(self):
        """Pre-fill items: always lock the final node, and all others if not randomizing."""
        final_item_name = self.get_item_name(self.num_nodes)
        final_location_name = self.get_location_name(self.num_nodes)
        final_location = self.multiworld.get_location(final_location_name, self.player)
        final_location.place_locked_item(self.create_item(final_item_name))

        if not self.options.randomize_items.value:
            self._place_original_items()

    def _place_original_items(self):
        """Place node items in their corresponding locations when randomization is disabled."""
        for i in range(1, self.num_nodes + 1):
            if i not in self.starting_node_set and i != self.num_nodes:
                item_name = self.get_item_name(i)
                location_name = self.get_location_name(i)
                location = self.multiworld.get_location(location_name, self.player)
                item = self.create_item(item_name)
                location.place_locked_item(item)

    def generate_basic(self):
        """Generate the basic world structure."""
        for stmt_index in self.starting_node_set:
            item_name = self.get_item_name(stmt_index)
            self.multiworld.push_precollected(self.create_item(item_name))
            proved_item = DepGraphItem(
                f"Completed Node {stmt_index}",
                ItemClassification.progression,
                None,
                self.player
            )
            self.multiworld.push_precollected(proved_item)

    def create_item(self, name: str) -> Item:
        """Create a single item."""
        item_data = item_table.get(name)
        if item_data:
            return DepGraphItem(
                name,
                item_data.classification,
                item_data.code,
                self.player
            )
        return DepGraphItem(
            name,
            ItemClassification.progression,
            self.item_name_to_id.get(name, 234800000),
            self.player
        )

    def fill_slot_data(self) -> Dict[str, Any]:
        """Data to send to the client for this world."""
        return {
            "graph_structure": {
                i: {
                    "label": node.node_id,
                    "expression": node.expression,
                    "dependencies": node.dependencies,
                    "full_text": node.full_text,
                }
                for i, node in self.graph_structure.nodes.items()
            },
            "starting_nodes": list(self.starting_node_set),
            "title": self.graph_structure.title,
            "randomize_items": self.options.randomize_items.value,
            "vanilla_placement": self.options.vanilla_placement.value,
        }
