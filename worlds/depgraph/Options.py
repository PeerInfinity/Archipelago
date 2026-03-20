from dataclasses import dataclass
from Options import Choice, Range, TextChoice, Toggle, PerGameCommonOptions, OptionGroup


class GraphFileSelection(TextChoice):
    """
    The dependency graph to use. Select from bundled examples or enter a file path
    to a custom graph file. Supported formats: JSON, DOT (.dot/.gv), CSV.
    """
    display_name = "Graph File"

    option_tech_tree = 0
    option_skill_tree = 1
    option_recipe_chain = 2
    option_baking_adventure = 3
    option_coding_adventure = 4

    default = 4


class VanillaPlacement(Toggle):
    """
    If enabled, items will be placed in their original locations (nodes will be
    at their corresponding graph locations) without any randomization.
    """
    display_name = "Vanilla Item Placement"
    default = False


class RandomizeItems(Toggle):
    """
    Enable item randomization. When disabled, all items will remain in their original locations.
    """
    display_name = "Randomize Items"
    default = True


class RandomizeStartingNodes(Toggle):
    """
    Controls how starting nodes are selected when starting_nodes is above 0%.
    Off: Starting nodes are the first N nodes in topological order (easier)
    On: Starting nodes are randomly selected from throughout the graph (harder)
    Has no effect when starting_nodes is 0%.
    """
    display_name = "Randomize Starting Nodes"
    default = True


class StartingNodes(Range):
    """
    Percentage of graph nodes that are pre-unlocked at the start.
    Higher values make the graph easier to complete.
    """
    display_name = "Starting Nodes %"
    range_start = 0
    range_end = 50
    default = 0


class EntranceRuleMode(Choice):
    """
    Controls how entrance rules handle convergence nodes (nodes with multiple dependencies).

    Strict: Every entrance requires both events and items for ALL dependencies.
    Faithful to the original graph logic but may fail to generate in multiworld.

    Relaxed Items: Each entrance requires completion events for ALL dependencies but only
    the source node's item. Preserves the requirement to visit all prerequisites while
    giving the fill algorithm flexibility at convergence points.

    Relaxed Events: Each entrance requires items for ALL dependencies but only the
    source node's event. The inverse of relaxed_items.

    Fully Relaxed: Each entrance only requires the source node's event and item.
    Convergence nodes can be entered from any single completed branch.
    """
    display_name = "Entrance Rule Mode"

    option_strict = 0
    option_relaxed_items = 1
    option_relaxed_events = 2
    option_fully_relaxed = 3

    default = 1


@dataclass
class DepGraphOptions(PerGameCommonOptions):
    graph_file: GraphFileSelection
    vanilla_placement: VanillaPlacement
    randomize_items: RandomizeItems
    randomize_starting_nodes: RandomizeStartingNodes
    starting_nodes: StartingNodes
    entrance_rule_mode: EntranceRuleMode


depgraph_option_groups = [
    OptionGroup("Graph Settings", [
        GraphFileSelection,
        VanillaPlacement,
        RandomizeItems,
        RandomizeStartingNodes,
        StartingNodes,
        EntranceRuleMode,
    ])
]
