#!/usr/bin/env python3
"""
Convert a flat task list into a DepGraph-compatible dependency graph.

Supports four approaches for synthesizing dependencies from a flat list:
  layered    - Divide tasks into layers with random inter-layer dependencies
  sparse     - Randomly assign 0-N dependencies from earlier tasks
  priority   - Use priority tags (high/med/low) to determine layer placement
  categories - Group by category, chain within groups, cross-link between them

Usage:
  python tasklist_to_depgraph.py tasks.txt
  python tasklist_to_depgraph.py tasks.txt --approach sparse --seed 42
  python tasklist_to_depgraph.py tasks.json --approach priority -o output.json
  python tasklist_to_depgraph.py tasks.txt --approach categories --cross-link-percent 30
  python tasklist_to_depgraph.py tasks.txt --dry-run
"""

import argparse
import json
import math
import os
import random
import re
import sys
from typing import Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

class Task:
    """A single task parsed from user input."""

    def __init__(self, name: str, priority: str = "med", category: str = "general"):
        self.name = name
        self.priority = priority  # "high", "med", "low"
        self.category = category


class DepGraphNode:
    """A node in the output dependency graph."""

    def __init__(self, node_id: str, label: str, description: str,
                 depends_on: Optional[List[str]] = None):
        self.node_id = node_id
        self.label = label
        self.description = description
        self.depends_on = depends_on or []


# ---------------------------------------------------------------------------
# Input parsing
# ---------------------------------------------------------------------------

def parse_text_file(path: str) -> Tuple[List[Task], Optional[str]]:
    """
    Parse a plain text file into tasks.

    Supports three formats per line:
      Plain:      Do the dishes
      Priority:   [high] Do the dishes
      Category:   @cleaning Do the dishes

    Returns (tasks, title) where title is None (derived from filename later).
    """
    tasks = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue

            priority = "med"
            category = "general"

            # Check for priority tag: [high], [med], [low]
            priority_match = re.match(r"^\[(high|med|low)\]\s*(.+)$", line, re.IGNORECASE)
            if priority_match:
                priority = priority_match.group(1).lower()
                line = priority_match.group(2).strip()

            # Check for category tag: @category
            category_match = re.match(r"^@(\S+)\s+(.+)$", line)
            if category_match:
                category = category_match.group(1).lower()
                line = category_match.group(2).strip()

            if line:
                tasks.append(Task(line, priority=priority, category=category))

    return tasks, None


def parse_json_file(path: str) -> Tuple[List[Task], Optional[str]]:
    """
    Parse a JSON task file.

    Expected format:
    {
        "title": "Tuesday Tasks",
        "tasks": [
            {"name": "Do the dishes", "priority": "high", "category": "cleaning"},
            {"name": "Exercise"}
        ]
    }
    """
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    title = data.get("title")
    tasks = []
    for entry in data.get("tasks", []):
        if isinstance(entry, str):
            tasks.append(Task(entry))
        elif isinstance(entry, dict):
            tasks.append(Task(
                name=entry["name"],
                priority=entry.get("priority", "med"),
                category=entry.get("category", "general"),
            ))

    return tasks, title


def load_tasks(path: str) -> Tuple[List[Task], Optional[str]]:
    """Load tasks from a file, auto-detecting format by extension."""
    ext = os.path.splitext(path)[1].lower()
    if ext == ".json":
        return parse_json_file(path)
    else:
        return parse_text_file(path)


# ---------------------------------------------------------------------------
# Node ID generation
# ---------------------------------------------------------------------------

def make_node_id(index: int) -> str:
    """Generate a stable node ID like 'task_1', 'task_2', etc."""
    return f"task_{index}"


# ---------------------------------------------------------------------------
# Approach 1: Layered Random DAG
# ---------------------------------------------------------------------------

def build_layered_dag(tasks: List[Task], roots_percent: float,
                      max_deps: int, rng: random.Random) -> List[DepGraphNode]:
    """
    Divide tasks into layers and wire random dependencies between adjacent layers.

    Layer 0 contains ~roots_percent of tasks (at least 1). Each subsequent layer
    has roughly the same size. Non-root tasks depend on 1..max_deps random tasks
    from the previous layer.
    """
    n = len(tasks)
    num_roots = max(1, round(n * roots_percent / 100))

    # Shuffle tasks to randomize layer assignment
    indices = list(range(n))
    rng.shuffle(indices)

    # Partition into layers
    layers: List[List[int]] = []
    remaining = indices[num_roots:]
    layers.append(indices[:num_roots])

    # Decide layer sizes for remaining tasks: aim for similar size to root layer
    layer_size = max(1, num_roots)
    while remaining:
        chunk = remaining[:layer_size]
        remaining = remaining[layer_size:]
        layers.append(chunk)

    # Build nodes
    nodes: List[DepGraphNode] = []
    task_to_node_id: Dict[int, str] = {}

    for task_idx in layers[0]:
        nid = make_node_id(task_idx + 1)
        task_to_node_id[task_idx] = nid
        nodes.append(DepGraphNode(
            node_id=nid,
            label=tasks[task_idx].name,
            description="Task from your task list",
            depends_on=[],
        ))

    for layer_num in range(1, len(layers)):
        prev_layer = layers[layer_num - 1]
        prev_node_ids = [task_to_node_id[i] for i in prev_layer]

        for task_idx in layers[layer_num]:
            nid = make_node_id(task_idx + 1)
            task_to_node_id[task_idx] = nid

            num_deps = rng.randint(1, min(max_deps, len(prev_node_ids)))
            deps = rng.sample(prev_node_ids, num_deps)

            nodes.append(DepGraphNode(
                node_id=nid,
                label=tasks[task_idx].name,
                description="Task from your task list",
                depends_on=deps,
            ))

    return nodes


# ---------------------------------------------------------------------------
# Approach 2: Random Sparse DAG
# ---------------------------------------------------------------------------

def build_sparse_dag(tasks: List[Task], roots_percent: float,
                     max_deps: int, rng: random.Random) -> List[DepGraphNode]:
    """
    For each task (in shuffled order), randomly pick 0..max_deps earlier tasks
    as dependencies. The probability of having zero dependencies is controlled
    by roots_percent.
    """
    n = len(tasks)
    indices = list(range(n))
    rng.shuffle(indices)

    nodes: List[DepGraphNode] = []
    ordered_node_ids: List[str] = []

    for pos, task_idx in enumerate(indices):
        nid = make_node_id(task_idx + 1)

        if pos == 0:
            # First task is always a root
            deps = []
        elif not ordered_node_ids:
            deps = []
        else:
            # Decide whether this is a root
            is_root = rng.random() < (roots_percent / 100)
            if is_root:
                deps = []
            else:
                num_deps = rng.randint(1, min(max_deps, len(ordered_node_ids)))
                deps = rng.sample(ordered_node_ids, num_deps)

        ordered_node_ids.append(nid)
        nodes.append(DepGraphNode(
            node_id=nid,
            label=tasks[task_idx].name,
            description="Task from your task list",
            depends_on=deps,
        ))

    return nodes


# ---------------------------------------------------------------------------
# Approach 3: Priority-Weighted
# ---------------------------------------------------------------------------

def build_priority_dag(tasks: List[Task], max_deps: int,
                       rng: random.Random) -> List[DepGraphNode]:
    """
    Group tasks by priority (high/med/low), then treat each priority level as
    a layer. High-priority tasks are roots, medium depend on high, low depend
    on medium. Within each tier, dependencies are randomized.
    """
    tiers: Dict[str, List[int]] = {"high": [], "med": [], "low": []}
    for i, task in enumerate(tasks):
        tier = task.priority if task.priority in tiers else "med"
        tiers[tier].append(i)

    # Shuffle within each tier
    for tier_tasks in tiers.values():
        rng.shuffle(tier_tasks)

    # Order of tiers for dependency wiring
    tier_order = ["high", "med", "low"]

    # If a tier is empty, skip it but keep the chain going
    active_tiers = [(t, tiers[t]) for t in tier_order if tiers[t]]

    if not active_tiers:
        return []

    nodes: List[DepGraphNode] = []
    tier_node_ids: Dict[str, List[str]] = {}

    for tier_idx, (tier_name, task_indices) in enumerate(active_tiers):
        tier_nids = []
        # Previous tier's node IDs (for dependencies)
        prev_nids = []
        if tier_idx > 0:
            prev_tier_name = active_tiers[tier_idx - 1][0]
            prev_nids = tier_node_ids.get(prev_tier_name, [])

        for task_idx in task_indices:
            nid = make_node_id(task_idx + 1)
            tier_nids.append(nid)

            if not prev_nids:
                # First tier or no previous tier tasks — these are roots
                deps = []
            else:
                num_deps = rng.randint(1, min(max_deps, len(prev_nids)))
                deps = rng.sample(prev_nids, num_deps)

            nodes.append(DepGraphNode(
                node_id=nid,
                label=tasks[task_idx].name,
                description=f"{tier_name.capitalize()}-priority task",
                depends_on=deps,
            ))

        tier_node_ids[tier_name] = tier_nids

    return nodes


# ---------------------------------------------------------------------------
# Approach 4: Category Chains
# ---------------------------------------------------------------------------

def build_category_dag(tasks: List[Task], max_deps: int,
                       cross_link_percent: float,
                       rng: random.Random) -> List[DepGraphNode]:
    """
    Group tasks by category. Within each category, create a sequential chain.
    Then randomly add cross-category links between tasks at similar positions
    in their respective chains.

    cross_link_percent controls how many cross-category edges are added
    (as a percentage of total non-root tasks).
    """
    # Group by category
    categories: Dict[str, List[int]] = {}
    for i, task in enumerate(tasks):
        cat = task.category
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(i)

    # Shuffle within each category for variety
    for cat_tasks in categories.values():
        rng.shuffle(cat_tasks)

    nodes: List[DepGraphNode] = []
    node_id_map: Dict[int, str] = {}  # task_index -> node_id
    chain_positions: Dict[int, int] = {}  # task_index -> position in its chain

    # Build intra-category chains
    for cat_name, task_indices in categories.items():
        for pos, task_idx in enumerate(task_indices):
            nid = make_node_id(task_idx + 1)
            node_id_map[task_idx] = nid
            chain_positions[task_idx] = pos

            if pos == 0:
                deps = []
            else:
                prev_idx = task_indices[pos - 1]
                deps = [node_id_map[prev_idx]]

            nodes.append(DepGraphNode(
                node_id=nid,
                label=tasks[task_idx].name,
                description=f"Category: {cat_name}",
                depends_on=deps,
            ))

    # Add cross-category links
    cat_names = list(categories.keys())
    if len(cat_names) >= 2:
        # Collect non-root tasks (position > 0 in their chain)
        non_root_tasks = [i for i, pos in chain_positions.items() if pos > 0]
        num_cross_links = max(0, round(len(non_root_tasks) * cross_link_percent / 100))

        # Build a lookup: for each task, which category is it in?
        task_to_cat: Dict[int, str] = {}
        for cat_name, task_indices in categories.items():
            for task_idx in task_indices:
                task_to_cat[task_idx] = cat_name

        candidates = list(non_root_tasks)
        rng.shuffle(candidates)

        links_added = 0
        for task_idx in candidates:
            if links_added >= num_cross_links:
                break

            my_cat = task_to_cat[task_idx]
            my_pos = chain_positions[task_idx]

            # Find a task in a different category at an earlier or equal position
            other_cats = [c for c in cat_names if c != my_cat]
            if not other_cats:
                continue

            source_cat = rng.choice(other_cats)
            source_tasks = categories[source_cat]
            # Pick a task at position < my_pos (or position 0 if my_pos is 0)
            valid_sources = [t for t in source_tasks
                            if chain_positions[t] < my_pos
                            or (chain_positions[t] == 0 and my_pos > 0)]
            if not valid_sources:
                # Fall back to the first task in the other category
                valid_sources = [source_tasks[0]]

            source_idx = rng.choice(valid_sources)
            source_nid = node_id_map[source_idx]

            # Find the node and add the dependency (avoid duplicates)
            for node in nodes:
                if node.node_id == node_id_map[task_idx]:
                    if source_nid not in node.depends_on:
                        node.depends_on.append(source_nid)
                        links_added += 1
                    break

    return nodes


# ---------------------------------------------------------------------------
# Final node and output
# ---------------------------------------------------------------------------

def add_final_node(nodes: List[DepGraphNode]) -> List[DepGraphNode]:
    """
    Add a synthetic 'Day Complete!' node that depends on all leaf nodes
    (nodes that nothing else depends on).
    """
    # Find all node IDs that are depended on by at least one other node
    depended_on = set()
    for node in nodes:
        depended_on.update(node.depends_on)

    all_ids = {node.node_id for node in nodes}
    leaf_ids = all_ids - depended_on

    # If no leaves found (shouldn't happen), depend on all
    if not leaf_ids:
        leaf_ids = all_ids

    final = DepGraphNode(
        node_id="day_complete",
        label="Day Complete!",
        description="All tasks accounted for!",
        depends_on=sorted(leaf_ids),
    )

    return nodes + [final]


def nodes_to_json(nodes: List[DepGraphNode], title: str) -> dict:
    """Convert a list of DepGraphNodes to the DepGraph JSON format."""
    output = {
        "title": title,
        "nodes": {}
    }
    for node in nodes:
        output["nodes"][node.node_id] = {
            "label": node.label,
            "description": node.description,
            "depends_on": node.depends_on,
        }
    return output


def print_graph_summary(nodes: List[DepGraphNode]):
    """Print a human-readable summary of the generated graph."""
    roots = [n for n in nodes if not n.depends_on]
    leaves_depended_on = set()
    for n in nodes:
        leaves_depended_on.update(n.depends_on)
    all_ids = {n.node_id for n in nodes}
    leaves = all_ids - leaves_depended_on

    print(f"  Total nodes:  {len(nodes)}")
    print(f"  Root nodes:   {len(roots)}")
    print(f"  Leaf nodes:   {len(leaves)}")
    total_edges = sum(len(n.depends_on) for n in nodes)
    print(f"  Total edges:  {total_edges}")
    print()

    # Show the structure
    for node in nodes:
        if node.depends_on:
            deps_str = ", ".join(node.depends_on)
            print(f"  {node.node_id} ({node.label})")
            print(f"    depends on: {deps_str}")
        else:
            print(f"  {node.node_id} ({node.label})  [ROOT]")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Convert a task list into a DepGraph-compatible dependency graph.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s tasks.txt
  %(prog)s tasks.txt --approach sparse --seed 42 -o my_day.json
  %(prog)s tasks.json --approach priority
  %(prog)s tasks.txt --approach categories --cross-link-percent 30
  %(prog)s tasks.txt --dry-run
        """,
    )

    parser.add_argument("input", help="Path to task list file (.txt or .json)")
    parser.add_argument("-o", "--output", help="Output JSON file path (default: <input>_depgraph.json)")
    parser.add_argument("--approach", choices=["layered", "sparse", "priority", "categories"],
                        default="layered",
                        help="DAG construction approach (default: layered)")
    parser.add_argument("--title", help="Graph title (default: derived from filename)")
    parser.add_argument("--roots-percent", type=float, default=30,
                        help="Percentage of tasks that are root nodes (default: 30)")
    parser.add_argument("--max-deps", type=int, default=2,
                        help="Maximum dependencies per non-root task (default: 2)")
    parser.add_argument("--cross-link-percent", type=float, default=30,
                        help="For categories approach: percentage of non-root tasks "
                             "that get a cross-category link (default: 30)")
    parser.add_argument("--seed", type=int, default=None,
                        help="Random seed for reproducible DAG generation")
    parser.add_argument("--no-final-node", action="store_true",
                        help="Skip adding the synthetic 'Day Complete!' final node")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print the graph structure without writing a file")

    args = parser.parse_args()

    # Load tasks
    if not os.path.exists(args.input):
        print(f"Error: Input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    tasks, file_title = load_tasks(args.input)

    if not tasks:
        print("Error: No tasks found in input file.", file=sys.stderr)
        sys.exit(1)

    if len(tasks) < 2:
        print("Error: Need at least 2 tasks to build a dependency graph.", file=sys.stderr)
        sys.exit(1)

    # Determine title
    title = args.title or file_title or os.path.splitext(os.path.basename(args.input))[0].replace("_", " ").title()

    # Initialize RNG
    rng = random.Random(args.seed)

    # Build the DAG
    print(f"Building {args.approach} DAG from {len(tasks)} tasks...")

    if args.approach == "layered":
        nodes = build_layered_dag(tasks, args.roots_percent, args.max_deps, rng)
    elif args.approach == "sparse":
        nodes = build_sparse_dag(tasks, args.roots_percent, args.max_deps, rng)
    elif args.approach == "priority":
        nodes = build_priority_dag(tasks, args.max_deps, rng)
    elif args.approach == "categories":
        nodes = build_category_dag(tasks, args.max_deps, args.cross_link_percent, rng)
    else:
        print(f"Error: Unknown approach '{args.approach}'", file=sys.stderr)
        sys.exit(1)

    # Add final node
    if not args.no_final_node:
        nodes = add_final_node(nodes)

    # Output
    print()
    print_graph_summary(nodes)

    if args.dry_run:
        print()
        print("Dry run — no file written.")
        print()
        print("JSON output would be:")
        print(json.dumps(nodes_to_json(nodes, title), indent=4))
        return

    # Determine output path
    output_path = args.output
    if not output_path:
        base = os.path.splitext(args.input)[0]
        output_path = f"{base}_depgraph.json"

    graph_json = nodes_to_json(nodes, title)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(graph_json, f, indent=4)
        f.write("\n")

    print()
    print(f"Wrote DepGraph JSON to: {output_path}")
    print()
    print("To use with DepGraph, set in your YAML template:")
    print(f'  graph_file: {os.path.abspath(output_path)}')


if __name__ == "__main__":
    main()
