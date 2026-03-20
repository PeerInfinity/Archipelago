# Metamath Developer Documentation

## Architecture Overview

The Metamath world transforms mathematical proofs from the Metamath database into Archipelago gameplay by converting logical dependencies into item/location relationships.

## Core Components

### 1. Proof Parsing (`Rules.py`)

The heart of the system. Uses `metamath-py` to verify proofs and extract dependency graphs.

```python
# Key function: extract_proof_dependencies
def extract_proof_dependencies(db, theorem_name: str) -> Tuple[List[str], Dict[str, Set[str]]]:
    """Extract proof steps and dependencies using metamath-py's proof verification."""
    if theorem_name not in db.rules:
        print(f"Warning: Theorem {theorem_name} not found in database")
        return [], {}

    rule = db.rules[theorem_name]

    try:
        # Verify the proof and get the proof tree
        root_step, proof_steps_dict = verify_proof(db, rule)

        # Extract all unique steps from the proof tree
        all_steps = root_step.all_steps()

        # Build dependency graph
        dependencies = {}
        ordered_steps = []
        seen = set()

        for step in all_steps:
            if step.rule and hasattr(step.rule, 'consequent'):
                label = step.rule.consequent.label

                # Skip constants, hypotheses, and duplicate entries
                if (not label.startswith('c') and
                    not label.startswith('w') and
                    label not in seen):

                    seen.add(label)
                    ordered_steps.append(label)

                    # Extract dependencies for this step
                    deps = set()
                    for dep_label, dep_step in step.dependencies.items():
                        if hasattr(dep_step.rule, 'consequent'):
                            dep_name = dep_step.rule.consequent.label
                            # Only include non-constant, non-hypothesis dependencies
                            if not dep_name.startswith('c') and not dep_name.startswith('w'):
                                deps.add(dep_name)

                    dependencies[label] = deps

        return ordered_steps, dependencies

    except Exception as e:
        print(f"Error verifying proof for {theorem_name}: {e}")
        return [], {}
```

**Dependency Extraction Process**:
1. Load theorem from metamath database
2. Verify proof using `metamath-py.proof.verify_proof()`
3. Walk proof tree to extract all steps
4. Filter out constants (prefixed with 'c') and wff variables (prefixed with 'w')
5. Map dependencies between steps
6. Apply topological sort for logical ordering (dependencies before dependents)
7. Convert to indexed ProofStructure

### 2. Topological Sorting

The system uses topological sorting to reorder proof steps for more logical presentation. For a detailed explanation of different proof ordering schemes and why we chose topological sort, see [Proof Ordering Documentation](proof_ordering.md).

```python
def topological_sort_proof(ordered_steps: List[str], dependencies: Dict[str, Set[str]]) -> List[str]:
    """Reorder proof steps so dependencies come before dependents."""
    # Create adjacency list and in-degree count
    graph = defaultdict(list)
    in_degree = defaultdict(int)

    # Build graph (dependency -> dependent)
    for step, deps in dependencies.items():
        for dep in deps:
            graph[dep].append(step)
            in_degree[step] += 1

    # Find all nodes with no incoming edges (no dependencies)
    queue = deque([step for step in ordered_steps if in_degree[step] == 0])
    result = []

    while queue:
        # Sort queue to ensure consistent ordering
        current = sorted(queue)[0]
        queue.remove(current)
        result.append(current)

        # Remove edges from this node
        for neighbor in sorted(graph[current]):
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    return result if len(result) == len(ordered_steps) else ordered_steps
```

This ensures that foundational axioms and definitions appear before the theorems that depend on them, making the proof structure more intuitive.

### 3. World Generation (`__init__.py`)

Main world class that orchestrates generation:

```python
class MetamathWorld(World):
    def generate_early(self):
        # Handle vanilla_placement (forces randomize_items=False, marks world as vanilla)
        # Parse theorem from config (supports URL extraction)
        # Extract proof structure
        # Build name mappings and name_substitutions
        # Determine starting statements
        # Build canonical_placements dict (excludes final statement — always locked)

    def create_regions(self):
        # Create locations for each proof step (skip starting statements)
        # Add "Proved Statement N" event locations for non-starting statements
        # Event items fire when a region is reachable, tracking proof completion

    def create_items(self):
        # Create statement items for non-starting, non-final statements
        # (only if randomization enabled; final statement is always locked at its location)

    def generate_basic(self):
        # Pre-collect starting statement items AND "Proved Statement K" events
```

**Key Methods**:
- `generate_early()`: Parse theorem and build proof structure, handle vanilla placement, build name substitutions. Excludes the final statement from `canonical_placements` (it's always locked).
- `create_regions()`: Create proof locations with connection logic. Each non-starting statement gets an event location "Proved Statement N" with a locked event item that fires when the region is reachable.
- `create_items()`: Generate statement items (only if randomization enabled; skipped entirely when disabled). Excludes the final statement — its item is always locked at its location.
- `generate_basic()`: Pre-collect starting statement items AND their "Proved Statement K" events so downstream entrance rules are satisfied from the start.
- `pre_fill()`: Always lock the final statement's item at its location. Also place all other items at original locations if randomization is disabled.
- `_place_original_items()`: Helper to place each non-starting, non-final statement at its corresponding location
- `set_rules()`: Apply logical dependencies as access rules, set completion condition to require the final "Proved" event, and store dependency mappings (item names only, not events) for the exporter
- `fill_slot_data()`: Export proof structure data, options, and vanilla_placement flag

### 4. Region Connections

The world creates a complex network of regions based on proof dependencies:

```python
def create_regions(self):
    """Create one region per statement with connections based on proof dependencies."""
    menu_region = Region("Menu", self.player, self.multiworld)

    # Create a region for each statement
    statement_regions = {}

    for i in range(1, self.num_statements + 1):
        region_name = self.get_location_name(i)  # "Prove Statement {i}"
        region = Region(region_name, self.player, self.multiworld)
        statement_regions[i] = region

        # Create location in this region (if not a starting statement)
        if i not in self.starting_statements:
            loc_name = self.get_location_name(i)
            if loc_name in self.location_name_to_id:
                location = MetamathLocation(...)
                region.locations.append(location)

            # Add event location: "Proved Statement N" fires when region is reachable
            event_loc = MetamathLocation(self.player, f"Proved Statement {i}", None, [], region)
            event_item = MetamathItem(f"Proved Statement {i}", ItemClassification.progression, None, self.player)
            event_loc.place_locked_item(event_item)
            region.locations.append(event_loc)

    # Connect Menu to axioms, connect regions based on dependency graph
    # ...
```

This creates a directed graph where:
- The Menu connects to all axioms (statements with no dependencies)
- Each statement region connects to regions of statements that depend on it
- Each non-starting region contains a "Proved Statement N" event that fires when the region is reached
- The connections form the logical flow of the proof

### 5. Data Structures

#### ProofStatement
```python
class ProofStatement:
    index: int              # 1-based position in proof
    label: Optional[str]    # Theorem/axiom name (e.g., "df-2")
    expression: str         # Mathematical expression
    dependencies: List[int] # Indices of required statements
    full_text: Optional[str]  # Full text description (if available)
```

#### ProofStructure
```python
class ProofStructure:
    statements: Dict[int, ProofStatement]
    dependency_graph: Dict[int, Set[int]]
    reverse_dependencies: Dict[int, Set[int]]
    label_to_index: Dict[str, int]
```

### 6. Item Placement and the Final Statement

The final statement's item is **always locked** at its own location — it is never placed in the multiworld item pool. This acts as the victory item: you can only obtain it by reaching and checking the final proof location.

```python
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
    """Place non-starting, non-final statement items at their locations (non-randomized mode)."""
    for i in range(1, self.num_statements + 1):
        if i not in self.starting_statements and i != self.num_statements:
            # ... place_locked_item at corresponding location
```

In randomized mode, `create_items()` also excludes the final statement from the pool:
- Starting statements: pre-collected (no location, no pool item)
- Final statement: locked at its location (not in pool)
- All other statements: added to the multiworld item pool for randomization

### 7. Items and Locations

**Items** (`Items.py`):
- Statement items: `Statement 1` through `Statement N` (generic names for datapackage)
- All statements are classified as progression items
- Meaningful names (e.g., `df-2: |- 2 = ( 1 + 1 )`) are provided via `name_substitutions` and `fill_slot_data()`
- Helper: `statement_item_name(label, expression)` builds display names from proof data

**Locations** (`Locations.py`):
- Proof locations: `Prove Statement 1` through `Prove Statement N` (generic names for datapackage)
- Starting statements don't create locations
- Each location requires specific statement items
- Helper: `statement_location_name(label, expression)` builds display names from proof data

### 8. Dependency Export and Completion

The completion condition checks for the "Proved" event of the final statement, not just the item:

```python
# Completion requires proving (not just receiving) the final theorem
final_proved = f"Proved Statement {self.num_statements}"
self.multiworld.completion_condition[self.player] = \
    lambda state, name=final_proved: state.has(name, self.player)
```

The world also stores dependency mappings for the JSON exporter. These export **only real item names** ("Statement K"), not event names ("Proved Statement K"). The backend uses events for access rules, but the frontend handles proof-completion gating separately via `checkedLocations` tracking.

```python
# Export only item names for the frontend stateManager
item_names = [self.get_item_name(d) for d in sorted(dependencies)]
```

This separation exists because the frontend stateManager cannot track backend-only event items in its inventory. The frontend proof modules enforce proof-completion requirements through their own `_updateAvailableSteps` logic.

### 9. Options (`Options.py`)

Configuration options:
- `vanilla_placement`: If enabled, forces `randomize_items=false` and marks world as vanilla
- `randomize_items`: Enable/disable item randomization
- `theorem`: Which theorem to prove (22 preset choices plus free-text entry)
- `randomize_starting_statements`: Controls how starting statements are selected (false=sequential, true=random)
- `starting_statements`: Percentage pre-unlocked (default 0, range 0-50)
- `auto_download_database`: Auto-download set.mm

## Metamath Integration

### Database Loading

The system uses the Metamath database (`set.mm`) for theorem data:

```python
def get_metamath_database(auto_download=True):
    # Try multiple paths for set.mm
    # Auto-download if enabled and not found
    # Parse with metamath-py
    return md.parse(path), path  # Returns (database, db_path) tuple
```

### Proof Verification

Using `metamath-py.proof` module:

```python
from metamathpy.proof import verify_proof

# Verify and get proof tree
root_step, proof_dict = verify_proof(db, rule)

# ProofStep contains:
# - conclusion: What was proved
# - rule: Theorem/axiom used
# - dependencies: Previous steps used
# - substitution: Variable mappings
```

### Compressed Proof Format

Metamath uses compression for proofs:
- Letters A-T: Labels 0-19 (base-20)
- Letters U-Y: Labels 20+ (base-5 continuation)
- Letter Z: Reference to saved subproof

The `verify_proof` function handles decompression automatically.

## Adding New Features

### Supporting New Theorems

Theorems are automatically supported if they exist in the database. For offline support, add to hardcoded proofs:

```python
# In Rules.py
known_proofs = {
    '2p2e4': get_hardcoded_2p2e4_proof,
    # Add more hardcoded proofs here as needed
}
```

### Custom Proof Sources

To support other proof databases:

1. Implement database parser
2. Create ProofStructure from parsed data
3. Add to `parse_metamath_proof()` logic

## Technical Details

### Dependency Graph Algorithm

The system builds three representations:

1. **Forward dependencies**: What each statement requires
2. **Reverse dependencies**: What depends on each statement
3. **Label mapping**: Convert between labels and indices

### Starting Statement Selection

```python
# Ordered mode: First N statements in proof order
if not self.options.randomize_starting_statements.value:
    self.starting_statements = set(range(1, num_starting + 1))

# Randomized mode: Random selection (always includes first statement)
else:
    self.starting_statements = {1}  # Always start with first axiom
    remaining = num_starting - 1
    if remaining > 0:
        candidates = list(range(2, self.num_statements + 1))
        random.shuffle(candidates)
        self.starting_statements.update(candidates[:remaining])
```

### Access Rule Generation

Entrance rules require both **"Proved Statement K"** events (proof step completed) and **"Statement K"** items (item received from randomizer) for each dependency K. This separates item possession from proof completion — having an item doesn't mean you've proved the corresponding step.

```python
# In set_metamath_rules function
if dependencies:  # Only set rule if there are dependencies
    # Require both the proof events AND the dependency items
    required_names = set()
    for d in dependencies:
        required_names.add(world.get_item_name(d))      # "Statement K"
        required_names.add(f"Proved Statement {d}")       # "Proved Statement K"

    access_rule = lambda state, p=player, items=required_names: state.has_all(items, p)

    # Set access rules on entrances only (locations are accessible once you enter the region)
    for entrance in region.entrances:
        add_rule(entrance, access_rule)
```

Per-location rules are not needed — entrance rules gate the entire region. "Proved Statement K" events fire automatically when a region is reachable (the event location has no access rule of its own).

## Performance Considerations

### Database Parsing
- First parse takes 5-10 seconds
- Consider caching parsed theorems
- Database is ~50MB

### Proof Verification
- Complex proofs may have 100+ steps
- Verification is recursive through proof tree
- Memory usage scales with proof size

### Generation Speed
- Most time spent in database parsing
- Actual world generation is fast (<1 second)
- Multiworld scaling is linear

## Testing

### Unit Tests

Key areas to test:

1. **Proof parsing**: Verify correct dependency extraction
2. **Access rules**: Ensure logical requirements work
3. **Item generation**: Correct number and starting items
4. **Fallback logic**: Handle missing theorems gracefully

### Integration Tests

Test with various theorems:
- Simple: `1p1e2` (2 steps)
- Medium: `2p2e4` (10 steps)
- Complex: `pm5.32` (7 steps with multiple dependencies)

### Validation

Verify mathematical correctness:
```python
# Dependencies should match theorem requirements
# Example: Check that proof structure correctly identifies dependencies
assert 10 in proof_structure.dependency_graph  # Final statement exists
assert len(proof_structure.statements) == expected_steps
```

## Debugging

### Common Issues

**Missing dependencies**: Check proof verification output
```python
print(f"Step {label} dependencies: {step.dependencies}")
```

**Wrong item count**: Verify starting statements
```python
print(f"Starting: {starting_statements}")
print(f"Total items: {len(items)}")
```

**Database not found**: Check paths and auto-download
```python
print(f"Checking path: {path}")
print(f"Auto-download: {auto_download}")
```

### Logging

Add debug output:
```python
import logging
logging.info(f"Parsed {theorem}: {len(steps)} steps")
```

## Future Enhancements

### Potential Features

1. **Proof Visualization**: Generate proof tree diagrams
2. **Difficulty Estimation**: Calculate complexity metrics
3. **Custom Axiom Systems**: Support non-standard foundations
4. **Proof Hints**: Contextual hints based on missing deps
5. **Achievement System**: Recognize famous theorems
6. **Parallel Proofs**: Multiple theorems in one world

### Performance Improvements

1. **Database Caching**: Cache parsed theorems
2. **Lazy Loading**: Load only needed theorems
3. **Compressed Storage**: Store proof structures efficiently
4. **Parallel Verification**: Verify multiple proofs concurrently

### Integration Ideas

1. **Educational Mode**: Show proof steps during play
2. **Competitive Mode**: Race to complete proofs
3. **Collaborative Mode**: Shared proof construction
4. **Tutorial Mode**: Guided introduction to logic

## Contributing

### Code Style
- Follow PEP 8
- Type hints encouraged
- Docstrings for public methods

### Pull Request Guidelines
1. Test with multiple theorems
2. Verify dependency extraction
3. Check generation succeeds
4. Update documentation

### Adding Theorems
1. Test theorem exists in database
2. Verify proof structure is correct
3. Add to documentation examples
4. Consider difficulty rating

## Resources

- [Metamath Homepage](http://metamath.org/)
- [Metamath Database](https://us.metamath.org/)
- [metamath-py Documentation](https://pypi.org/project/metamath-py/)
- [Archipelago Development](https://archipelago.gg/tutorial/)

## License

The Metamath world implementation follows Archipelago's licensing.
The Metamath database is in the public domain.
The metamath-py library has its own license terms.