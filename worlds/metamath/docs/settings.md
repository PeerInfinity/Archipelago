# Metamath Settings Guide

## Complete Settings Reference

All available options for configuring your Metamath experience.

## Core Settings

### theorem
**Type**: Text Choice / Weighted Choice
**Default**: `2p2e4`

The theorem to prove. This determines your entire game structure.

```yaml
# Single theorem
theorem: 2p2e4

# URL format
theorem: https://us.metamath.org/mpeuni/2p2e4.html

# Weighted random selection
theorem:
  2p2e4: 50      # 50% chance
  1p1e2: 30      # 30% chance
  3p3e6: 20      # 20% chance
```

**Common Theorems**:
- `2p2e4` - 2 + 2 = 4 (10 steps)
- `1p1e2` - 1 + 1 = 2 (2 steps)
- `3p3e6` - 3 + 3 = 6 (10 steps)
- `pm2.21` - Logical theorem (2 steps)
- `pm5.32` - Complex logic (7 steps)

---

### complexity
**Type**: Choice
**Default**: `moderate`
**Options**: `simple`, `moderate`, `complex`

Controls how the proof structure is randomized and distributed.

```yaml
complexity: moderate
```

- **simple**: Basic statement reordering, linear progression
- **moderate**: Some statements may require proving out of order
- **complex**: Full randomization with multi-world dependencies

---

### starting_statements
**Type**: Range
**Default**: `10`
**Range**: `0-50`

Percentage of proof statements that are pre-unlocked at the start. Higher values make the proof easier to complete.

```yaml
starting_statements: 10  # Start with 10% of proof unlocked

# Or use random
starting_statements:
  random: 50
  random-low: 25    # Random between 0-25%
  random-high: 25   # Random between 25-50%
```

- `0`: Start with no statements (hardest)
- `10`: Start with 10% (default, balanced)
- `30`: Start with 30% (easier)
- `50`: Start with half the proof (easiest)

---

### hint_frequency
**Type**: Range
**Default**: `10`
**Range**: `0-30`

Percentage of hint items in the item pool. Hints are filler items that don't affect progression.

```yaml
hint_frequency: 10  # 10% of items are hints
```

Hint items include:
- Proof Hint
- Logic Guide
- Axiom Reference
- Lemma Note
- Theorem Insight
- Deduction Tip
- Inference Help
- QED Moment

---

### auto_download_database
**Type**: Toggle
**Default**: `true`

Automatically download the metamath database (set.mm) if not found locally. The file is about 50MB and will be cached for future use.

```yaml
auto_download_database: true   # Auto-download if needed
auto_download_database: false  # Never download, use fallbacks only
```

## Standard Archipelago Settings

### progression_balancing
**Type**: Range
**Default**: `50`
**Range**: `0-99`

A system that can move progression earlier, to try and prevent the player from getting stuck and bored early.

```yaml
progression_balancing: 50

# Or use named values
progression_balancing:
  disabled: 50    # 0
  normal: 50      # 50
  extreme: 0      # 99
```

---

### accessibility
**Type**: Choice
**Default**: `full`
**Options**: `full`, `minimal`

Set rules for reachability of your items/locations.

```yaml
accessibility: full
```

- **full**: Ensure everything can be reached and acquired
- **minimal**: Ensure what is needed to reach your goal can be acquired

---

### local_items
**Type**: Item List
**Default**: `[]`

Forces these items to be in their native world.

```yaml
local_items: []

# Example: Keep specific statements local
local_items:
  - "Statement 1"
  - "Statement 10"
```

---

### non_local_items
**Type**: Item List
**Default**: `[]`

Forces these items to be outside their native world.

```yaml
non_local_items: []

# Example: Force statements to other worlds
non_local_items:
  - "Statement 5"
```

---

### start_inventory
**Type**: Item Dict
**Default**: `{}`

Start with these items.

```yaml
start_inventory: {}

# Example: Start with specific statements
start_inventory:
  "Statement 2": 1
  "Statement 3": 1
```

---

### start_hints
**Type**: Item List
**Default**: `[]`

Start with these item's locations prefilled into the `!hint` command.

```yaml
start_hints: []

# Example
start_hints:
  - "Statement 10"  # Know where the final theorem is
```

---

### start_location_hints
**Type**: Location List
**Default**: `[]`

Start with these locations and their item prefilled into the `!hint` command.

```yaml
start_location_hints: []

# Example
start_location_hints:
  - "Prove Statement 10"
```

---

### exclude_locations
**Type**: Location List
**Default**: `[]`

Prevent these locations from having an important item.

```yaml
exclude_locations: []

# Example: Make certain proofs non-progression
exclude_locations:
  - "Prove Statement 5"
```

---

### priority_locations
**Type**: Location List
**Default**: `[]`

Prevent these locations from having an unimportant item.

```yaml
priority_locations: []

# Example: Ensure key proofs have progression
priority_locations:
  - "Prove Statement 10"
```

---

### item_links
**Type**: Item Links
**Default**: `[]`

Share part of your item pool with other players.

```yaml
item_links: []
```

## Example Configurations

### Easy Mode
```yaml
Metamath:
  theorem: 1p1e2              # Simple 2-step proof
  complexity: simple          # Basic ordering
  starting_statements: 30     # Start with 30% unlocked
  hint_frequency: 20          # More hints
  progression_balancing: 75   # Items front-loaded
```

### Balanced
```yaml
Metamath:
  theorem: 2p2e4              # Classic 10-step proof
  complexity: moderate        # Some reordering
  starting_statements: 10     # Start with 10%
  hint_frequency: 10          # Standard hints
  progression_balancing: 50   # Balanced
```

### Challenge Mode
```yaml
Metamath:
  theorem: pm5.32             # Complex logic proof
  complexity: complex         # Full randomization
  starting_statements: 0      # Start with nothing
  hint_frequency: 5           # Minimal hints
  progression_balancing: 25   # Items back-loaded
  accessibility: minimal      # Only guarantee completion
```

### Multiworld Friendly
```yaml
Metamath:
  theorem: 3p3e6
  complexity: moderate
  starting_statements: 15
  hint_frequency: 10
  non_local_items:           # Send items to others
    - "Statement 5"
    - "Statement 7"
  progression_balancing: 50
```

## Tips for Settings

1. **New Players**: Start with `simple` complexity and higher `starting_statements`
2. **Multiworld**: Consider `non_local_items` to increase interaction
3. **Racing**: Use `minimal` accessibility for faster games
4. **Learning**: Higher `hint_frequency` helps understand the proof structure
5. **Database**: Keep `auto_download_database: true` unless you have bandwidth concerns

## Troubleshooting Settings

**"Not enough locations"**: Lower `starting_statements` or choose a theorem with more steps

**"Too difficult"**: Increase `starting_statements` or choose `simple` complexity

**"Too easy"**: Decrease `starting_statements`, increase `complexity`, or choose a harder theorem

**"Takes too long to generate"**: The first generation with a new theorem needs to parse the database (5-10 seconds). This is normal.