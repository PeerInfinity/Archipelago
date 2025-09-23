# Metamath Examples

## Example YAML Configurations

### Minimal Configuration

```yaml
# minimal.yaml
name: MathStudent
game: Metamath

Metamath:
  theorem: 1p1e2
```

### Standard Configuration

```yaml
# standard.yaml
name: Mathematician
description: Proving that 2 + 2 = 4
game: Metamath
requires:
  version: 0.6.4

Metamath:
  theorem: 2p2e4
  complexity: moderate
  starting_statements: 10
  hint_frequency: 10
  auto_download_database: true
  progression_balancing: 50
  accessibility: full
```

### Advanced Multi-Theorem

```yaml
# advanced.yaml
name: LogicMaster
description: Random theorem each time
game: Metamath

Metamath:
  theorem:
    2p2e4: 40    # 40% chance - Medium difficulty
    1p1e2: 20    # 20% chance - Easy
    3p3e6: 20    # 20% chance - Medium
    pm5.32: 10   # 10% chance - Hard
    pm2.21: 10   # 10% chance - Easy

  complexity:
    simple: 25
    moderate: 50
    complex: 25

  starting_statements:
    random: 50
    random-low: 25
    random-high: 25

  hint_frequency: 15
```

### Challenge Mode

```yaml
# challenge.yaml
name: HardcoreProver
description: No help, pure logic
game: Metamath

Metamath:
  theorem: pm5.32
  complexity: complex
  starting_statements: 0
  hint_frequency: 0
  progression_balancing: 0
  accessibility: minimal
```

### Beginner Friendly

```yaml
# beginner.yaml
name: NewPlayer
description: Learning the ropes
game: Metamath

Metamath:
  theorem: 1p1e2
  complexity: simple
  starting_statements: 50
  hint_frequency: 30
  progression_balancing: 90
  accessibility: full

  # Start with one statement already
  start_inventory:
    "Statement 1": 1
```

## Example Theorems

### Arithmetic Proofs

| Theorem | Description | Steps | Difficulty |
|---------|------------|-------|------------|
| `1p1e2` | 1 + 1 = 2 | 2 | Very Easy |
| `2p2e4` | 2 + 2 = 4 | 10 | Medium |
| `3p3e6` | 3 + 3 = 6 | 10 | Medium |
| `2p3e5` | 2 + 3 = 5 | ~10 | Medium |
| `4p4e8` | 4 + 4 = 8 | ~12 | Medium |

### Logic Proofs

| Theorem | Description | Steps | Difficulty |
|---------|------------|-------|------------|
| `pm2.21` | ¬φ → (φ → ψ) | 2 | Easy |
| `pm2.43` | ((φ → (φ → ψ)) → (φ → ψ)) | 3 | Easy |
| `pm5.32` | Complex biconditional | 7 | Hard |
| `con3i` | Contraposition | 3 | Easy |
| `syl` | Syllogism | 3 | Easy |

### Set Theory

| Theorem | Description | Steps | Difficulty |
|---------|------------|-------|------------|
| `uneq12i` | Union equality | ~5 | Medium |
| `sseq12i` | Subset equality | ~5 | Medium |
| `ineq12i` | Intersection equality | ~5 | Medium |

## Example Gameplay Scenarios

### Scenario 1: First Timer
**Player**: NewToMath
**Theorem**: `1p1e2`
**Settings**: Simple, 50% starting

```
Generation: Creates 2 proof steps
Starting with: Statement 1 (df-2)
Need to find: Statement 2 (eqcomi)
Gameplay: Find one item to complete the proof!
```

### Scenario 2: Multiworld Integration
**Player**: MathGeek
**Theorem**: `2p2e4`
**Other Players**: Zelda, Mario, Pokémon

```
Turn 1: Find "Statement 3 (df-4)" in Zelda's dungeon
Turn 2: Zelda finds your "Statement 5 (2cn)" in Death Mountain
Turn 3: Mario sends you "Statement 8 (addassi)"
Turn 4: You can now prove Statement 9 (3eqtri)!
```

### Scenario 3: Race Setup
**All Players**: Same theorem `2p2e4`
**Settings**: Moderate, 10% starting, minimal accessibility

```
Goal: First to prove 2+2=4 wins
Strategy: Rush for key dependencies (addassi, 3eqtri)
Challenge: Items might be in other worlds
```

## Example Commands

### Generating a Game

```bash
# Single player
python Generate.py --weights_file_path "examples/standard.yaml"

# Multiworld with friends
python Generate.py \
  --weights_file_path "math_player.yaml" \
  --weights_file_path "zelda_player.yaml" \
  --weights_file_path "mario_player.yaml"
```

### Checking Your Proof

In-game commands:
```
!hint Statement 10        # Where is the final theorem?
!missing                  # What statements do I still need?
!checked                  # What have I already proven?
```

## Example Proof Walkthrough: 2 + 2 = 4

Here's how the proof unfolds in gameplay:

1. **Start**: You have `Statement 1 (df-2)` which defines 2 = (1+1)

2. **Early finds**:
   - Find `Statement 3 (df-4)` → Defines 4 = (3+1)
   - Find `Statement 4 (ax-1cn)` → Axiom: 1 is complex

3. **Unlock locations**:
   - Can now check `Prove Statement 6` (needs Statement 1)
   - Receive `Statement 6 (oveq2i)`

4. **Mid-game**:
   - Find `Statement 2 (df-3)` and `Statement 5 (2cn)`
   - Can prove `Statement 7` and `Statement 8`

5. **Convergence**:
   - With Statements 3, 7, and 8 → Can prove `Statement 9 (3eqtri)`
   - With Statements 6 and 9 → Can prove `Statement 10 (eqtr4i)`

6. **Victory**: 2 + 2 = 4 is proven!

## Tips from Examples

1. **Start small**: `1p1e2` is perfect for learning
2. **Standard choice**: `2p2e4` is the "Hello World" of Metamath
3. **For groups**: Use different theorems to reduce competition
4. **For racing**: Use the same theorem with minimal accessibility
5. **For learning**: High starting_statements and hint_frequency help