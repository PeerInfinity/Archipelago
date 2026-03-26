#!/usr/bin/env python3
"""
Convert a Taskipelago YAML file into a DepGraph-compatible dependency graph.

Taskipelago (https://github.com/barretg/Taskipelago) uses parallel lists of
tasks, rewards, and prereqs specified as comma-separated indices.  This tool
reads that format and emits a standard DepGraph JSON graph.

Usage:
  python taskipelago_to_depgraph.py my_taskipelago.yaml
  python taskipelago_to_depgraph.py my_taskipelago.yaml -o output.json
  python taskipelago_to_depgraph.py my_taskipelago.yaml --dry-run
  python taskipelago_to_depgraph.py my_taskipelago.yaml --no-final-node
"""

import argparse
import json
import os
import sys
from typing import Dict, List, Optional, Set, Tuple

try:
    import yaml
except ImportError:
    yaml = None  # handled at runtime


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

def load_taskipelago_yaml(path: str) -> dict:
    """Load and validate a Taskipelago YAML file, returning the game section."""
    if yaml is None:
        raise RuntimeError(
            "PyYAML is required to read Taskipelago files.  "
            "Install it with: pip install pyyaml"
        )

    with open(path, "r", encoding="utf-8") as f:
        doc = yaml.safe_load(f)

    if not isinstance(doc, dict):
        raise ValueError(f"Expected a YAML mapping at top level, got {type(doc).__name__}")

    # The game options live under the "Taskipelago" key
    section = doc.get("Taskipelago")
    if section is None:
        # Maybe the file *is* the options dict directly (no wrapper)
        if "tasks" in doc:
            section = doc
        else:
            raise ValueError(
                "Could not find a 'Taskipelago' section in this YAML.  "
                "Expected a key named 'Taskipelago' containing tasks, rewards, etc."
            )

    return section


def parse_prereqs(raw: str, num_tasks: int, task_index_1: int) -> List[int]:
    """
    Parse a comma-separated string of 1-based task indices into a list of
    0-based indices.  Validates range and rejects self-references.
    """
    if not raw or not raw.strip():
        return []

    result: List[int] = []
    seen: Set[int] = set()
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            idx_1 = int(part)
        except ValueError:
            raise ValueError(
                f"Invalid prereq '{part}' on task {task_index_1}.  "
                f"Use comma-separated integers like '1,2'."
            )
        if idx_1 < 1 or idx_1 > num_tasks:
            raise ValueError(
                f"Prereq '{idx_1}' on task {task_index_1} is out of range (1..{num_tasks})."
            )
        if idx_1 == task_index_1:
            raise ValueError(f"Task {task_index_1} cannot require itself.")
        idx_0 = idx_1 - 1
        if idx_0 not in seen:
            seen.add(idx_0)
            result.append(idx_0)
    return result


# ---------------------------------------------------------------------------
# Conversion
# ---------------------------------------------------------------------------

def make_node_id(index_0: int) -> str:
    """Generate a stable node ID like 'task_1', 'task_2', etc."""
    return f"task_{index_0 + 1}"


def convert(section: dict, player_name: Optional[str] = None,
            title: Optional[str] = None,
            add_final_node: bool = True) -> Tuple[dict, dict]:
    """
    Convert a Taskipelago options section into a DepGraph JSON graph.

    Returns (graph_json, stats) where stats has summary info.
    """
    tasks = [str(t).strip() for t in section.get("tasks", []) if str(t).strip()]
    if not tasks:
        raise ValueError("Taskipelago YAML has no tasks.")

    n = len(tasks)

    # --- Parse prereqs (both kinds) ---
    raw_task_prereqs = list(section.get("task_prereqs", []))
    raw_reward_prereqs = list(section.get("reward_prereqs", []))

    # Pad to length n
    raw_task_prereqs += [""] * max(0, n - len(raw_task_prereqs))
    raw_reward_prereqs += [""] * max(0, n - len(raw_reward_prereqs))
    raw_task_prereqs = raw_task_prereqs[:n]
    raw_reward_prereqs = raw_reward_prereqs[:n]

    # Parse into 0-based index lists
    task_prereqs: List[List[int]] = []
    reward_prereqs: List[List[int]] = []
    for i in range(n):
        task_prereqs.append(parse_prereqs(str(raw_task_prereqs[i]), n, i + 1))
        reward_prereqs.append(parse_prereqs(str(raw_reward_prereqs[i]), n, i + 1))

    # Merge both prereq types into a single dependency set per task.
    # In DepGraph, "depends on node X" subsumes both "task X completed" and
    # "reward X received" — completing a node grants both.
    merged_deps: List[Set[int]] = []
    for i in range(n):
        deps = set(task_prereqs[i]) | set(reward_prereqs[i])
        merged_deps.append(deps)

    # Cycle detection (DFS)
    visiting: Set[int] = set()
    visited: Set[int] = set()

    def dfs(v: int) -> None:
        if v in visiting:
            raise ValueError(
                f"Prereq graph contains a cycle involving task {v + 1} "
                f"('{tasks[v]}'). Fix your prereqs."
            )
        if v in visited:
            return
        visiting.add(v)
        for u in merged_deps[v]:
            dfs(u)
        visiting.remove(v)
        visited.add(v)

    for i in range(n):
        dfs(i)

    # --- Optional metadata ---
    rewards = [str(r).strip() for r in section.get("rewards", [])]
    reward_types = [str(r).strip().lower() for r in section.get("reward_types", [])]
    # Pad
    rewards += [""] * max(0, n - len(rewards))
    reward_types += [""] * max(0, n - len(reward_types))

    # --- Build DepGraph nodes ---
    nodes: Dict[str, dict] = {}
    node_ids: List[str] = []

    for i in range(n):
        nid = make_node_id(i)
        node_ids.append(nid)

        dep_nids = sorted(make_node_id(d) for d in merged_deps[i])

        # Build a description from available metadata
        desc_parts = []
        reward = rewards[i] if i < len(rewards) else ""
        rtype = reward_types[i] if i < len(reward_types) else ""
        if reward and reward != "nothing here, get pranked nerd":
            desc_parts.append(f"Reward: {reward}")
        if rtype and rtype != "junk":
            desc_parts.append(f"Type: {rtype}")
        description = "; ".join(desc_parts) if desc_parts else "Task from Taskipelago"

        nodes[nid] = {
            "label": tasks[i],
            "description": description,
            "depends_on": dep_nids,
        }

    # --- Final node ---
    if add_final_node:
        # Find leaf nodes (not depended on by anything else)
        depended_on: Set[str] = set()
        for node_data in nodes.values():
            depended_on.update(node_data["depends_on"])
        leaf_ids = sorted(set(node_ids) - depended_on)
        if not leaf_ids:
            leaf_ids = sorted(node_ids)

        nodes["all_complete"] = {
            "label": "All Tasks Complete!",
            "description": "All Taskipelago tasks accounted for!",
            "depends_on": leaf_ids,
        }

    # --- Title ---
    if not title:
        title = player_name or "Taskipelago Tasks"

    graph_json = {"title": title, "nodes": nodes}

    # Stats
    num_roots = sum(1 for nid in node_ids if not nodes[nid]["depends_on"])
    total_edges = sum(len(nd["depends_on"]) for nd in nodes.values())
    stats = {
        "num_tasks": n,
        "num_nodes": len(nodes),
        "num_roots": num_roots,
        "total_edges": total_edges,
        "has_final_node": add_final_node,
        "task_prereqs_used": sum(1 for p in task_prereqs if p),
        "reward_prereqs_used": sum(1 for p in reward_prereqs if p),
    }

    return graph_json, stats


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def print_summary(graph_json: dict, stats: dict) -> None:
    """Print a human-readable summary of the converted graph."""
    print(f"  Title:           {graph_json['title']}")
    print(f"  Tasks converted: {stats['num_tasks']}")
    print(f"  Total nodes:     {stats['num_nodes']}")
    print(f"  Root nodes:      {stats['num_roots']}")
    print(f"  Total edges:     {stats['total_edges']}")
    if stats["task_prereqs_used"] or stats["reward_prereqs_used"]:
        print(f"  Task prereqs:    {stats['task_prereqs_used']} tasks have completion prereqs")
        print(f"  Reward prereqs:  {stats['reward_prereqs_used']} tasks have reward prereqs")
        print(f"  (Both types merged into DepGraph depends_on edges)")
    else:
        print(f"  No prereqs defined — all tasks are root nodes")
    if stats["has_final_node"]:
        print(f"  Final node:      'All Tasks Complete!' added")
    print()

    nodes = graph_json["nodes"]
    for nid, nd in nodes.items():
        label = nd["label"]
        if nd["depends_on"]:
            deps_str = ", ".join(nd["depends_on"])
            print(f"  {nid} ({label})")
            print(f"    depends on: {deps_str}")
        else:
            print(f"  {nid} ({label})  [ROOT]")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Convert a Taskipelago YAML into a DepGraph-compatible dependency graph.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s my_taskipelago.yaml
  %(prog)s my_taskipelago.yaml -o my_day.json
  %(prog)s my_taskipelago.yaml --title "Wednesday Grind"
  %(prog)s my_taskipelago.yaml --no-final-node
  %(prog)s my_taskipelago.yaml --dry-run
        """,
    )

    parser.add_argument("input", help="Path to Taskipelago YAML file")
    parser.add_argument("-o", "--output", help="Output JSON file path (default: <input>_depgraph.json)")
    parser.add_argument("--title", help="Graph title (default: player name from YAML, or 'Taskipelago Tasks')")
    parser.add_argument("--no-final-node", action="store_true",
                        help="Skip adding the synthetic 'All Tasks Complete!' final node")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print the graph structure without writing a file")

    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"Error: Input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    # Load
    section = load_taskipelago_yaml(args.input)

    # Extract player name from the top-level YAML (outside the Taskipelago section)
    player_name = None
    try:
        with open(args.input, "r", encoding="utf-8") as f:
            doc = yaml.safe_load(f)
        if isinstance(doc, dict):
            player_name = doc.get("name")
    except Exception:
        pass

    # Convert
    print(f"Converting Taskipelago YAML: {args.input}")
    print()

    graph_json, stats = convert(
        section,
        player_name=player_name,
        title=args.title,
        add_final_node=not args.no_final_node,
    )

    print_summary(graph_json, stats)

    if args.dry_run:
        print()
        print("Dry run — no file written.")
        print()
        print("JSON output would be:")
        print(json.dumps(graph_json, indent=4))
        return

    # Write
    output_path = args.output
    if not output_path:
        base = os.path.splitext(args.input)[0]
        output_path = f"{base}_depgraph.json"

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
