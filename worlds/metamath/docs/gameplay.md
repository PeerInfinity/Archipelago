# Metamath Gameplay Guide

## How It Works

In Metamath, you're not just playing a game—you're constructing a mathematical proof! Each step of the proof is a location that needs to be "proven" by collecting the required statement items.

## Core Concepts

### Statements = Items
Every mathematical statement in your proof becomes an item. For example:
- `Statement 1: df-2` - The definition that 2 = (1 + 1)
- `Statement 5: 2cn` - The axiom that 2 is a complex number
- `Statement 8: addassi` - The associativity of addition

### Proof Steps = Locations
Each statement that needs to be proven is a location. To "check" a location, you need all the statements it depends on. For example:
- `Prove Statement 6` might require Statements 1 and 3
- `Prove Statement 10` might require Statements 6 and 9

### Dependencies = Access Rules
Mathematical logic determines access! You can only prove a statement if you have all its logical prerequisites.

## Example: Playing "2 + 2 = 4"

Let's walk through the famous proof that 2 + 2 = 4:

### The Proof Structure
```
1. df-2: "2 = (1 + 1)" (definition)
2. df-3: "3 = (2 + 1)" (definition)
3. df-4: "4 = (3 + 1)" (definition)
4. ax-1cn: "1 is a complex number" (axiom)
5. 2cn: "2 is a complex number" (axiom)
6. oveq2i: "(2 + 2) = (2 + (1 + 1))" [requires: df-2]
7. oveq1i: "(3 + 1) = ((2 + 1) + 1)" [requires: df-3]
8. addassi: "((2 + 1) + 1) = (2 + (1 + 1))" [requires: ax-1cn, 2cn]
9. 3eqtri: "4 = (2 + (1 + 1))" [requires: df-4, oveq1i, addassi]
10. eqtr4i: "(2 + 2) = 4" ✓ [requires: oveq2i, 3eqtri]
```

### Gameplay Flow

1. **Start**: You begin with 10% of statements (typically Statement 1)
2. **Early Game**: Find basic definitions and axioms (Statements 2-5)
3. **Mid Game**: Build intermediate results (Statements 6-8)
4. **End Game**: Combine everything to reach the final theorem (Statements 9-10)

### In Multiworld

Your proof steps can be scattered across different worlds:
- You might find `df-2` in Link's chest in Zelda
- Another player might send you `ax-1cn` from their Mario level
- You could find `3eqtri` as a check in Pokémon

## Strategy Tips

### 1. Understand Your Proof
Before playing, look up your theorem on [metamath.org](https://us.metamath.org/). Understanding the logical flow helps you prioritize checks.

### 2. Identify Bottlenecks
Some statements depend on many others. Finding these "hub" statements early opens up more locations:
- In 2p2e4: `addassi` and `3eqtri` are key bottlenecks
- In pm5.32: `3bitri` combines multiple branches

### 3. Communicate Dependencies
Tell your multiworld partners what you need:
- "I need Statement 3 (df-4) to unlock 2 locations"
- "Statement 8 (addassi) is blocking my progression"

### 4. Use Hints
Hint items like "Proof Hint" and "Logic Guide" are filler but can provide useful information in some implementations.

## Common Theorems and Their Difficulty

### Beginner (1-5 steps)
- `1p1e2` (1 + 1 = 2): 2 steps, very quick
- `pm2.21`: 2 steps, simple logic

### Intermediate (5-15 steps)
- `2p2e4` (2 + 2 = 4): 10 steps, good balance
- `3p3e6` (3 + 3 = 6): 10 steps, similar to 2p2e4
- `pm5.32`: 7 steps, propositional logic

### Advanced (15+ steps)
- Complex theorems from algebra, analysis, or topology
- Custom proofs from specialized areas

## Understanding Your Tracker

When using tracking tools:
- **Green**: You have this statement
- **Yellow**: Available to check (you have all dependencies)
- **Red**: Missing dependencies
- **Blue**: Contains a progression item

## Mathematical Concepts

Don't worry if you don't understand the math! The game is about logical dependencies, not mathematical knowledge. However, here are some common symbols:

- `|-` means "it is provable that"
- `->` means "implies"
- `<->` means "if and only if"
- `e.` means "is an element of"
- `CC` means "complex numbers"
- `/\` means "and"
- `\/` means "or"
- `-.` means "not"

## Completion

You win when you prove your target theorem! This happens when you:
1. Collect all required statement items
2. Check the final proof location
3. The complete proof validates

## Tips for New Players

1. **Start Simple**: Try `1p1e2` for your first game
2. **Read the Proof**: Check the theorem on metamath.org
3. **Track Dependencies**: Keep notes on what requires what
4. **Ask for Help**: The math community loves explaining proofs!

## Advanced Strategies

### Sphere Analysis
Proof steps naturally form "spheres" based on dependencies:
- Sphere 0: Starting statements and axioms
- Sphere 1: Statements requiring only Sphere 0
- Sphere 2: Statements requiring Sphere 1
- etc.

Understanding spheres helps predict progression.

### Parallel Branches
Many proofs have independent branches that merge later. You can work on multiple branches simultaneously for efficiency.

### Critical Path
Identify the longest chain of dependencies. This is your minimum number of steps to completion, assuming perfect item distribution.

## Have Fun!

Remember: You're literally playing with the fundamental building blocks of mathematics. Every game is a journey through centuries of mathematical discovery!