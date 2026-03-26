# Task List to DepGraph Converter

## Overview

The DepGraph apworld turns any directed acyclic graph (DAG) into a playable
Archipelago world. But what if you don't have a dependency graph — just a plain
task list?

This tool converts a flat task list into a DepGraph-compatible dependency graph,
enabling a unique way to gamify daily routines, chores, and to-do lists through
Archipelago multiworld randomization.

## Motivation

A daily task list can feel overwhelming when everything is visible at once. By
converting it into a dependency graph and running it through Archipelago:

- **Tasks unlock gradually and randomly throughout the day.** You don't see
  everything at once — tasks appear as you (or other players) find items.
- **Completing a task might unblock another player.** If you're in a multiworld,
  finishing "Do the dishes" might send a key item to someone playing A Link to
  the Past. That social pressure can be motivating.
- **Mix productive tasks and leisure activities.** Put "Vacuum living room" and
  "Play 30 minutes of Hollow Knight" on the same list. They randomly gate each
  other, so doing chores literally unlocks fun activities (and vice versa).
- **Works solo too.** Run a multiworld with your task list and one or more
  normal Archipelago games. Progression in your tasks unlocks items in the game,
  and game progression unlocks new tasks.

## Prior Art: The Manual APWorld

The [Manual APWorld](https://github.com/ManualForArchipelago/Manual) is an
existing approach the Archipelago community uses for similar purposes. The
[Archipelago wiki](https://archipelago.miraheze.org/wiki/Manual_game) notes
that Manual has been used "to gamify daily chores or other responsibilities."

However, Manual and DepGraph solve this differently:

| Aspect               | Manual                          | DepGraph                                    |
|----------------------|---------------------------------|---------------------------------------------|
| Logic enforcement    | Honor system (self-report)      | Real access rules enforced by the randomizer |
| Dependencies         | None built-in (flat checklist)  | Full DAG with enforced progression           |
| Unlock pacing        | All locations available at once  | Tasks unlock progressively                   |
| Multiworld synergy   | Items shuffle but don't gate    | Tasks genuinely gate other players' items    |

For the gradual-unlock, motivation-through-dependencies use case, DepGraph is
the stronger fit because it has real enforced logic.

## The Core Challenge

A task list is flat — no dependencies. DepGraph requires a DAG. The converter
synthesizes a dependency structure from the flat list using one of four
approaches. Each creates a different gameplay feel.

## Conversion Approaches

### Approach 1: Layered Random DAG (`--approach layered`)

Divides tasks into horizontal layers, then wires random dependencies between
adjacent layers:

```
Layer 0 (roots):     [Dishes]  [Laundry]  [Email]
                        |    \    |    /     |
Layer 1:            [Vacuum]  [Groceries]  [Exercise]
                        |    \    |    /     |
Layer 2:            [Cook]  [Yard Work]  [Read]
                                  |
Final:              [Day Complete!]
```

**Best for:** Daily routines. Guarantees steady pacing — you always have
something available, and completing tasks reliably unlocks new ones in waves.

**Parameters:**
- `--roots-percent` controls what fraction of tasks start as roots (layer 0)
- `--max-deps` caps how many dependencies each non-root task has
- Tasks per layer are roughly equal

### Approach 2: Random Sparse DAG (`--approach sparse`)

For each task, randomly picks 0-2 earlier tasks as dependencies (based on
topological position). Creates a more organic, less uniform structure.

```
[Task A] ──→ [Task C] ──→ [Task F]
[Task B] ──→ [Task D] ─┬→ [Task G] ──→ [Day Complete!]
              └──→ [Task E] ─┘
```

**Best for:** Variety. Some paths chain deeply while others branch wide. Less
predictable than layered, which some players may prefer.

**Parameters:**
- `--roots-percent` controls the probability that a task has no dependencies
- `--max-deps` limits dependency count per task
- The structure emerges from random choices, so re-running with different seeds
  produces very different graphs

### Approach 3: Priority-Weighted (`--approach priority`)

Uses optional priority tags to determine graph structure. High-priority tasks
become roots, medium tasks depend on high-priority ones, low-priority tasks
depend on medium. Within each tier, dependencies are randomized.

```
High (roots):   [Urgent Email]  [Pay Bills]
                     |     \       |
Medium:         [Groceries] [Clean Kitchen]  [Exercise]
                     |          |        \      |
Low:            [Organize Closet]  [Watch Movie]  [Read Book]
                                      |
Final:                          [Day Complete!]
```

**Best for:** When tasks have natural importance levels. Ensures urgent tasks
are available first and leisure activities come later.

**Input format:** Tasks can include a priority prefix:
```
[high] Pay bills
[high] Urgent email
[med] Grocery shopping
[med] Clean kitchen
[low] Watch a movie
[low] Read a book
```

Unprioritized tasks default to medium.

### Approach 4: Category Chains (`--approach categories`)

Groups tasks by category, creates mini dependency chains within each category,
then cross-wires between categories.

```
Cleaning:     [Dishes] → [Vacuum] → [Mop]
                  \          |
Errands:      [Gas] → [Groceries] → [Returns]
                          |
Self-care:    [Exercise] → [Meditate] → [Journal]
                                           |
Final:                               [Day Complete!]
```

**Best for:** When tasks have natural groupings. The category chains create
logical mini-progressions (do dishes before vacuuming makes sense), while
cross-category links ensure everything interleaves.

**Input format:** Tasks include a category prefix:
```
@cleaning Do the dishes
@cleaning Vacuum living room
@cleaning Mop floors
@errands Get gas
@errands Grocery shopping
@self-care Exercise
@self-care Meditate
```

Uncategorized tasks go into a "general" category.

## Input Formats

### Plain text (one task per line)
```
Do the dishes
Vacuum living room
Reply to emails
Exercise
Grocery shopping
Cook dinner
```

### Text with priorities (for priority-weighted approach)
```
[high] Pay bills
[med] Grocery shopping
[low] Watch a movie
Exercise
```

### Text with categories (for category chains approach)
```
@cleaning Do the dishes
@cleaning Vacuum living room
@errands Grocery shopping
@errands Returns
@self-care Exercise
Read a book
```

### JSON (all approaches, most control)
```json
{
    "title": "Tuesday Tasks",
    "tasks": [
        {"name": "Do the dishes", "priority": "high", "category": "cleaning"},
        {"name": "Vacuum living room", "priority": "med", "category": "cleaning"},
        {"name": "Reply to emails", "priority": "high", "category": "work"},
        {"name": "Exercise", "priority": "med", "category": "self-care"},
        {"name": "Grocery shopping", "priority": "low", "category": "errands"},
        {"name": "Cook dinner", "priority": "low", "category": "cooking"}
    ]
}
```

## Output

All approaches produce a DepGraph-compatible JSON file that can be used directly
with the DepGraph apworld:

```json
{
    "title": "Tuesday Tasks",
    "nodes": {
        "task_1": {
            "label": "Do the dishes",
            "description": "Task from your task list",
            "depends_on": []
        },
        "task_2": {
            "label": "Vacuum living room",
            "description": "Task from your task list",
            "depends_on": ["task_1"]
        },
        ...
        "day_complete": {
            "label": "Day Complete!",
            "description": "All tasks accounted for!",
            "depends_on": ["task_4", "task_5", "task_6"]
        }
    }
}
```

## Usage

```bash
# Basic usage — layered approach with defaults
python worlds/depgraph/tasklist/tasklist_to_depgraph.py tasks.txt

# Specify approach and output file
python worlds/depgraph/tasklist/tasklist_to_depgraph.py tasks.txt \
    --approach layered \
    --output my_day.json

# Sparse DAG with custom parameters
python worlds/depgraph/tasklist/tasklist_to_depgraph.py tasks.txt \
    --approach sparse \
    --roots-percent 30 \
    --max-deps 2 \
    --seed 42

# Priority-weighted from tagged task list
python worlds/depgraph/tasklist/tasklist_to_depgraph.py tasks_with_priorities.txt \
    --approach priority

# Category chains from categorized task list
python worlds/depgraph/tasklist/tasklist_to_depgraph.py tasks_with_categories.txt \
    --approach categories \
    --cross-link-percent 30

# JSON input with title override
python worlds/depgraph/tasklist/tasklist_to_depgraph.py tasks.json \
    --approach layered \
    --title "Wednesday Grind"

# Skip the synthetic final node
python worlds/depgraph/tasklist/tasklist_to_depgraph.py tasks.txt \
    --no-final-node

# Preview graph structure without writing
python worlds/depgraph/tasklist/tasklist_to_depgraph.py tasks.txt --dry-run
```

## Using the Output with DepGraph

1. Generate the graph:
   ```bash
   python worlds/depgraph/tasklist/tasklist_to_depgraph.py my_tasks.txt -o my_day.json
   ```

2. Reference it in your YAML template:
   ```yaml
   name: TaskPlayer
   game: DepGraph
   DepGraph:
     graph_file: /absolute/path/to/my_day.json
     randomize_items: true
     starting_nodes: 10
   ```

3. Generate a multiworld seed (with other players/games as desired):
   ```bash
   python Generate.py --weights_file_path "Templates/DepGraph.yaml" --multi 1 --seed 1
   ```

## How It Plays

### Tasks aren't blocked — just the location checks

Nothing stops you from doing a task early in the real world. If "Vacuum living
room" shows up as locked in your tracker, you can still vacuum whenever you
want. What you *won't* get is the Archipelago location check for that task
until its randomized prerequisites are met. So you can work ahead, but the
multiworld progression only advances once the logic catches up.

### Completion is honor system

There's no game client verifying that you actually did the dishes. When a task
becomes available in the tracker, you mark it complete yourself. This is the
same model the Manual APWorld uses — the difference is that DepGraph enforces
the *order* through real access rules, while Manual presents everything at once.

### Baking in task names with the world generator

By default, DepGraph uses generic names ("Node 1", "Complete Node 1")
and substitutes your task labels at runtime. If you want the actual task names
to appear natively in other trackers and tools, you can run the output through
the world generator:

```bash
# 1. Convert task list to DepGraph JSON
python worlds/depgraph/tasklist/tasklist_to_depgraph.py my_tasks.txt -o my_day.json

# 2. Generate a seed with the DepGraph world
python Generate.py --weights_file_path "Templates/DepGraph.yaml" --multi 1 --seed 1

# 3. Run the rules export through the world generator
python -m world_generator frontend/presets/depgraph/AP_14089154938208861744/AP_14089154938208861744_rules.json \
    -o worlds/my_tasks_worldgen \
    --game-name "My Tasks" \
    --force \
    --canonical-seed 1
```

This creates a standalone world package with your task names and configuration
baked in. The generated world's items and locations use your real task names,
so they display correctly in any Archipelago tracker — not just the DepGraph-
aware ones.

## Design Notes

### Why a synthetic final node?

DepGraph uses the last node in topological order as the win condition. For a task
list, this would arbitrarily make one real task the "goal." Instead, the
converter adds a synthetic "Day Complete!" node that depends on the final layer,
giving a clear completion signal without privileging any single task. Use
`--no-final-node` to skip this if you prefer.

### Why not just make everything a root?

If every task were a root node (no dependencies), the entire list would be
available from the start — defeating the purpose of gradual unlocking. The
synthetic dependencies create the gating structure that makes items flow through
the multiworld.

### Reproducibility

Use `--seed` to get the same dependency structure from the same task list. This
is useful if you want to regenerate the same graph layout across multiple
Archipelago seeds, or if you want to share a specific graph with others.

---

# Taskipelago YAML to DepGraph Converter

## Overview

[Taskipelago](https://github.com/barretg/Taskipelago) is a separate Archipelago
apworld that also turns to-do lists into playable multiworld games. If you have
an existing Taskipelago YAML file, this converter translates it into a
DepGraph-compatible JSON graph so you can use it with DepGraph's features
(entrance rule modes, multiple graph formats, frontend visualization, etc.).

## How It Works

Taskipelago uses parallel lists with index-based prereqs:

```yaml
Taskipelago:
  tasks: [Read chapter 1, Read chapter 2, Write review]
  task_prereqs: ["", "1", "1, 2"]
  reward_prereqs: ["", "", "1"]
```

The converter:
1. Parses the `tasks` list into DepGraph nodes
2. Merges `task_prereqs` and `reward_prereqs` into unified `depends_on` edges
   (in DepGraph, completing a node grants both the item and the event)
3. Validates the graph (range checks, cycle detection)
4. Adds a synthetic "All Tasks Complete!" final node (optional)
5. Preserves reward names and types in node descriptions

## Usage

```bash
# Basic conversion
python worlds/depgraph/tasklist/taskipelago_to_depgraph.py my_taskipelago.yaml

# Specify output file
python worlds/depgraph/tasklist/taskipelago_to_depgraph.py my_taskipelago.yaml -o my_day.json

# Custom title
python worlds/depgraph/tasklist/taskipelago_to_depgraph.py my_taskipelago.yaml --title "Wednesday Grind"

# Skip the final node
python worlds/depgraph/tasklist/taskipelago_to_depgraph.py my_taskipelago.yaml --no-final-node

# Preview without writing
python worlds/depgraph/tasklist/taskipelago_to_depgraph.py my_taskipelago.yaml --dry-run
```

## Example

See `examples/taskipelago_grad_school.yaml` for a sample Taskipelago YAML.
Convert it with:

```bash
python worlds/depgraph/tasklist/taskipelago_to_depgraph.py \
    worlds/depgraph/tasklist/examples/taskipelago_grad_school.yaml \
    --dry-run
```

Then use the output with DepGraph:

```yaml
name: TaskPlayer
game: DepGraph
DepGraph:
  graph_file: /path/to/taskipelago_grad_school_depgraph.json
  randomize_items: true
  starting_nodes: 10
```

## What Carries Over and What Doesn't

| Taskipelago Feature | DepGraph Equivalent |
|--------------------|--------------------|
| `tasks` | Node labels |
| `task_prereqs` | `depends_on` edges |
| `reward_prereqs` | Merged into `depends_on` edges |
| `rewards` | Preserved in node descriptions |
| `reward_types` | Preserved in node descriptions (DepGraph items are all progression) |
| `death_link_*` | Not supported by DepGraph — ignored |
| `lock_prereqs` | Not applicable (DepGraph enforces logic via entrance rules) |
