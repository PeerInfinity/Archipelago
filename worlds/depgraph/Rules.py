from typing import List, Dict, Set, Optional
from worlds.generic.Rules import add_rule
from collections import defaultdict, deque
import csv
import json
import os
import re


class GraphNode:
    """Represents a single node in a dependency graph."""

    def __init__(self, index: int, node_id: str, expression: str,
                 dependencies: List[int], full_text: Optional[str] = None):
        self.index = index          # 1-based position in topological order
        self.node_id = node_id      # Original string key
        self.expression = expression  # Display label
        self.dependencies = dependencies  # List of node indices this depends on
        self.full_text = full_text  # Description text


class GraphStructure:
    """Manages the dependency structure of a directed acyclic graph."""

    def __init__(self):
        self.nodes: Dict[int, GraphNode] = {}
        self.dependency_graph: Dict[int, Set[int]] = {}
        self.reverse_dependencies: Dict[int, Set[int]] = {}
        self.label_to_index: Dict[str, int] = {}
        self.title: str = "Graph"

    def add_node(self, node: GraphNode):
        """Add a node to the graph structure."""
        self.nodes[node.index] = node
        self.dependency_graph[node.index] = set(node.dependencies)

        if node.node_id:
            self.label_to_index[node.node_id] = node.index

        for dep in node.dependencies:
            if dep not in self.reverse_dependencies:
                self.reverse_dependencies[dep] = set()
            self.reverse_dependencies[dep].add(node.index)


def topological_sort_graph(node_ids: List[str], dependencies: Dict[str, Set[str]]) -> List[str]:
    """
    Reorder nodes using Kahn's algorithm so dependencies come before dependents.

    Args:
        node_ids: List of node ID strings
        dependencies: Dictionary mapping each node to its dependency node IDs

    Returns:
        Topologically sorted list of node IDs

    Raises:
        ValueError: If the graph contains cycles
    """
    graph = defaultdict(list)
    in_degree = defaultdict(int)

    for node_id in node_ids:
        if node_id not in in_degree:
            in_degree[node_id] = 0

    for node_id, deps in dependencies.items():
        for dep in deps:
            graph[dep].append(node_id)
            in_degree[node_id] += 1

    queue = deque([node_id for node_id in node_ids if in_degree[node_id] == 0])
    result = []

    while queue:
        current = sorted(queue)[0]
        queue.remove(current)
        result.append(current)

        for neighbor in sorted(graph[current]):
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    if len(result) != len(node_ids):
        raise ValueError(
            f"Graph contains cycles: sorted {len(result)} of {len(node_ids)} nodes. "
            "Only directed acyclic graphs (DAGs) are supported."
        )

    return result


def parse_json_graph(path: str) -> GraphStructure:
    """
    Parse a JSON graph file into a GraphStructure.

    Expected format:
    {
        "title": "My Graph",
        "nodes": {
            "node_id": {
                "label": "Display Name",
                "description": "What this node represents",
                "depends_on": ["other_node_id", ...]
            }
        }
    }
    """
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    if not data.get("nodes"):
        raise ValueError(f"JSON graph file {path} has no 'nodes' field or it is empty")

    structure = GraphStructure()
    structure.title = data.get("title", os.path.splitext(os.path.basename(path))[0])

    nodes = data["nodes"]
    node_ids = list(nodes.keys())

    # Build dependencies dict for topological sort
    dependencies: Dict[str, Set[str]] = {}
    for node_id, node_data in nodes.items():
        deps = set(node_data.get("depends_on", []))
        # Validate dependency references
        for dep in deps:
            if dep not in nodes:
                raise ValueError(f"Node '{node_id}' depends on unknown node '{dep}'")
        dependencies[node_id] = deps

    # Topological sort
    sorted_ids = topological_sort_graph(node_ids, dependencies)

    # Build index mapping
    id_to_index = {node_id: i + 1 for i, node_id in enumerate(sorted_ids)}

    # Create graph nodes
    for node_id in sorted_ids:
        node_data = nodes[node_id]
        index = id_to_index[node_id]
        label = node_data.get("label", node_id)
        description = node_data.get("description", "")
        dep_ids = node_data.get("depends_on", [])
        dep_indices = [id_to_index[d] for d in dep_ids]

        full_text = f"{node_id}: {description}" if description else f"{node_id}: {label}"

        structure.add_node(GraphNode(
            index=index,
            node_id=node_id,
            expression=label,
            dependencies=dep_indices,
            full_text=full_text
        ))

    return structure


def parse_dot_graph(path: str) -> GraphStructure:
    """
    Parse a DOT graph file into a GraphStructure.

    Supports basic DOT syntax:
        digraph "Title" {
            a [label="Node A"];
            b [label="Node B"];
            a -> b;
        }
    """
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    structure = GraphStructure()

    # Extract title from digraph declaration
    title_match = re.search(r'digraph\s+"([^"]+)"', content)
    if not title_match:
        title_match = re.search(r'digraph\s+(\w+)', content)
    structure.title = title_match.group(1) if title_match else os.path.splitext(os.path.basename(path))[0]

    # Extract node labels: node_id [label="Display Name"]
    labels: Dict[str, str] = {}
    for match in re.finditer(r'(\w+)\s*\[([^\]]*)\]', content):
        node_id = match.group(1)
        attrs = match.group(2)
        label_match = re.search(r'label\s*=\s*"([^"]*)"', attrs)
        if label_match:
            labels[node_id] = label_match.group(1)

    # Extract edges: a -> b
    edges: List[tuple] = []
    all_nodes: Set[str] = set()
    for match in re.finditer(r'(\w+)\s*->\s*(\w+)', content):
        src = match.group(1)
        dst = match.group(2)
        edges.append((src, dst))
        all_nodes.add(src)
        all_nodes.add(dst)

    # Also add any nodes defined with labels but no edges
    all_nodes.update(labels.keys())

    if not all_nodes:
        raise ValueError(f"DOT graph file {path} contains no nodes")

    # Build dependencies
    node_ids = sorted(all_nodes)
    dependencies: Dict[str, Set[str]] = {n: set() for n in node_ids}
    for src, dst in edges:
        dependencies[dst].add(src)

    # Topological sort
    sorted_ids = topological_sort_graph(node_ids, dependencies)

    # Build index mapping
    id_to_index = {node_id: i + 1 for i, node_id in enumerate(sorted_ids)}

    # Create graph nodes
    for node_id in sorted_ids:
        index = id_to_index[node_id]
        label = labels.get(node_id, node_id)
        dep_indices = [id_to_index[d] for d in dependencies[node_id]]

        structure.add_node(GraphNode(
            index=index,
            node_id=node_id,
            expression=label,
            dependencies=dep_indices,
            full_text=f"{node_id}: {label}"
        ))

    return structure


def parse_csv_graph(path: str) -> GraphStructure:
    """
    Parse a CSV graph file into a GraphStructure.

    Expected columns: id, label, depends_on, description
    depends_on is semicolon-separated list of node IDs.
    """
    with open(path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    if not rows:
        raise ValueError(f"CSV graph file {path} is empty")

    structure = GraphStructure()
    structure.title = os.path.splitext(os.path.basename(path))[0].replace("_", " ").title()

    # Collect node data
    nodes: Dict[str, dict] = {}
    node_ids = []
    for row in rows:
        node_id = row["id"].strip()
        node_ids.append(node_id)
        nodes[node_id] = {
            "label": row.get("label", "").strip() or node_id,
            "description": row.get("description", "").strip(),
            "depends_on": [d.strip() for d in row.get("depends_on", "").split(";") if d.strip()]
        }

    # Validate and build dependencies
    dependencies: Dict[str, Set[str]] = {}
    for node_id, node_data in nodes.items():
        deps = set(node_data["depends_on"])
        for dep in deps:
            if dep not in nodes:
                raise ValueError(f"Node '{node_id}' depends on unknown node '{dep}'")
        dependencies[node_id] = deps

    # Topological sort
    sorted_ids = topological_sort_graph(node_ids, dependencies)

    # Build index mapping
    id_to_index = {node_id: i + 1 for i, node_id in enumerate(sorted_ids)}

    # Create graph nodes
    for node_id in sorted_ids:
        node_data = nodes[node_id]
        index = id_to_index[node_id]
        label = node_data["label"]
        description = node_data["description"]
        dep_indices = [id_to_index[d] for d in node_data["depends_on"]]

        full_text = f"{node_id}: {description}" if description else f"{node_id}: {label}"

        structure.add_node(GraphNode(
            index=index,
            node_id=node_id,
            expression=label,
            dependencies=dep_indices,
            full_text=full_text
        ))

    return structure


def parse_depgraph(graph_key: str) -> GraphStructure:
    """
    Parse a dependency graph from a bundled preset name or filesystem path.

    Args:
        graph_key: Either a bundled graph name (e.g. 'tech_tree') or a filesystem path

    Returns:
        GraphStructure containing the parsed graph
    """
    # Check bundled graphs first
    bundled_graphs = {
        "tech_tree": ("tech_tree.json", parse_json_graph),
        "skill_tree": ("skill_tree.dot", parse_dot_graph),
        "recipe_chain": ("recipe_chain.csv", parse_csv_graph),
        "baking_adventure": ("baking_adventure.json", parse_json_graph),
        "coding_adventure": ("coding_adventure.json", parse_json_graph),
    }
    if graph_key in bundled_graphs:
        filename, parser = bundled_graphs[graph_key]
        data_dir = os.path.join(os.path.dirname(__file__), "data")
        path = os.path.join(data_dir, filename)
        if not os.path.exists(path):
            raise FileNotFoundError(f"Bundled graph '{graph_key}' not found at {path}")
        return parser(path)

    # Treat as filesystem path
    if not os.path.exists(graph_key):
        raise FileNotFoundError(f"Graph file not found: {graph_key}")

    # Auto-detect format by extension
    ext = os.path.splitext(graph_key)[1].lower()
    if ext == ".json":
        return parse_json_graph(graph_key)
    elif ext in (".dot", ".gv"):
        return parse_dot_graph(graph_key)
    elif ext == ".csv":
        return parse_csv_graph(graph_key)
    else:
        raise ValueError(f"Unsupported graph file format '{ext}'. Use .json, .dot, .gv, or .csv")


def set_depgraph_rules(world, graph_structure: GraphStructure, entrance_rule_mode: int = 1):
    """Set access rules for depgraph regions based on node dependencies.

    entrance_rule_mode is a 2-bit field (bit 0 = relaxed items, bit 1 = relaxed events):
        0 (strict):         All events + all items required for every entrance.
        1 (relaxed_items):  All events required, but only source node's item.
        2 (relaxed_events): All items required, but only source node's event.
        3 (fully_relaxed):  Only source node's event and item required.
    """
    player = world.player
    relax_items = bool(entrance_rule_mode & 1)
    relax_events = bool(entrance_rule_mode & 2)

    region_name_to_index = getattr(world, '_region_name_to_index', {})

    for region in world.multiworld.get_regions(player):
        stmt_num = region_name_to_index.get(region.name)
        if stmt_num is None:
            continue

        if stmt_num in graph_structure.dependency_graph:
            dependencies = graph_structure.dependency_graph[stmt_num]

            if dependencies:
                if not relax_items and not relax_events:
                    # Strict: one shared rule with all events + all items
                    required_names = frozenset(
                        name
                        for d in dependencies
                        for name in (world.get_item_name(d), f"Completed Node {d}")
                    )
                    access_rule = lambda state, p=player, items=required_names: state.has_all(items, p)
                    for entrance in region.entrances:
                        add_rule(entrance, access_rule)
                else:
                    # Per-entrance rules based on source node
                    for entrance in region.entrances:
                        source_index = region_name_to_index.get(entrance.parent_region.name)
                        is_valid_source = source_index is not None and source_index in dependencies

                        required_names = set()

                        # Events: source only if relaxed, all otherwise
                        if relax_events and is_valid_source:
                            required_names.add(f"Completed Node {source_index}")
                        else:
                            for d in dependencies:
                                required_names.add(f"Completed Node {d}")

                        # Items: source only if relaxed, all otherwise
                        if relax_items and is_valid_source:
                            required_names.add(world.get_item_name(source_index))
                        else:
                            for d in dependencies:
                                required_names.add(world.get_item_name(d))

                        required_names = frozenset(required_names)
                        access_rule = lambda state, p=player, items=required_names: state.has_all(items, p)
                        add_rule(entrance, access_rule)
