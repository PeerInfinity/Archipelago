# Metamath Developer Documentation

## Architecture Overview

The Metamath world transforms mathematical proofs from the Metamath database into Archipelago gameplay by converting logical dependencies into item/location relationships.

## Core Components

### 1. Proof Parsing (`Rules.py`)

The heart of the system. Uses `metamath-py` to verify proofs and extract dependency graphs.

```python
# Key function: extract_proof_dependencies
def extract_proof_dependencies(db, theorem_name):
    rule = db.rules[theorem_name]
    root_step, proof_dict = verify_proof(db, rule)

    # Extract all steps with dependencies
    for step in root_step.all_steps():
        label = step.rule.consequent.label
        deps = {dep.rule.consequent.label
                for dep in step.dependencies.values()}
    return ordered_steps, dependencies
```

**Dependency Extraction Process**:
1. Load theorem from metamath database
2. Verify proof using `metamath-py.proof.verify_proof()`
3. Walk proof tree to extract all steps
4. Map dependencies between steps
5. Convert to indexed ProofStructure

### 2. World Generation (`__init__.py`)

Main world class that orchestrates generation:

```python
class MetamathWorld(World):
    def generate_early(self):
        # Parse theorem from config
        # Extract proof structure
        # Determine starting statements

    def create_regions(self):
        # Create locations for each proof step
        # Skip pre-given starting statements

    def create_items(self):
        # Create items for non-starting statements
        # Add filler hints as needed
```

**Key Methods**:
- `generate_early()`: Parse theorem and build proof structure
- `create_regions()`: Create proof locations
- `create_items()`: Generate statement items
- `set_rules()`: Apply logical dependencies as access rules

### 3. Data Structures

#### ProofStatement
```python
class ProofStatement:
    index: int          # 1-based position in proof
    label: str          # Theorem/axiom name (e.g., "df-2")
    expression: str     # Mathematical expression
    dependencies: List[int]  # Indices of required statements
```

#### ProofStructure
```python
class ProofStructure:
    statements: Dict[int, ProofStatement]
    dependency_graph: Dict[int, Set[int]]
    reverse_dependencies: Dict[int, Set[int]]
    label_to_index: Dict[str, int]
```

### 4. Items and Locations

**Items** (`Items.py`):
- Statement items: `Statement 1` through `Statement N`
- Filler hints: `Proof Hint`, `Logic Guide`, etc.
- All statements are progression items

**Locations** (`Locations.py`):
- Proof locations: `Prove Statement 1` through `Prove Statement N`
- Starting statements don't create locations
- Each location requires specific statement items

### 5. Options (`Options.py`)

Configuration options:
- `theorem`: Which theorem to prove
- `complexity`: Randomization level
- `starting_statements`: Percentage pre-unlocked
- `hint_frequency`: Filler item percentage
- `auto_download_database`: Auto-download set.mm

## Metamath Integration

### Database Loading

The system uses the Metamath database (`set.mm`) for theorem data:

```python
def get_metamath_database(auto_download=True):
    # Try multiple paths
    # Auto-download if enabled
    # Parse with metamath-py
    return md.parse(path)
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
    'new_theorem': get_hardcoded_new_theorem,  # Add here
}
```

### Custom Proof Sources

To support other proof databases:

1. Implement database parser
2. Create ProofStructure from parsed data
3. Add to `parse_metamath_proof()` logic

### Enhanced Hints

To make hints more meaningful:

```python
# In create_items()
hint_text = f"Hint: {statement.label} requires {deps}"
item = MetamathItem(hint_text, ...)
```

## Technical Details

### Dependency Graph Algorithm

The system builds three representations:

1. **Forward dependencies**: What each statement requires
2. **Reverse dependencies**: What depends on each statement
3. **Label mapping**: Convert between labels and indices

### Starting Statement Selection

```python
# Simple mode: First N statements
if complexity == "simple":
    starting = range(1, num_start + 1)

# Complex mode: Random selection
else:
    starting = random.sample(range(1, total), num_start)
```

### Access Rule Generation

Each location gets a rule based on its dependencies:

```python
def make_rule(deps):
    def rule(state):
        return all(state.has(f"Statement {dep}", player)
                  for dep in deps)
    return rule
```

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
assert dependencies['eqtr4i'] == {'oveq2i', '3eqtri'}
assert dependencies['addassi'] == {'ax-1cn', '2cn'}
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