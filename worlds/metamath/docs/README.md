# Metamath for Archipelago

## Overview

Metamath is a unique Archipelago world that transforms mathematical proofs into gameplay. Each theorem or axiom in a mathematical proof becomes both a location (proving it) and an item (the ability to use it in other proofs). Navigate logical dependencies across the multiworld to complete your proof!

## What is Metamath?

[Metamath](http://metamath.org/) is a formal proof language and a vast database of mathematical theorems. This Archipelago world takes theorems from the Metamath database and converts their proof structure into a game where:

- **Locations**: Each step in the proof that needs to be proven
- **Items**: The proven statements that unlock other proof steps
- **Goal**: Complete the entire proof by collecting all necessary statements

## Features

- 📐 **Real Mathematical Proofs**: Play through actual proofs from the Metamath database
- 🔗 **Logical Dependencies**: Items unlock locations based on mathematical logic
- 🎯 **Multiple Theorems**: Choose from various theorems like `2p2e4` (2+2=4), `1p1e2` (1+1=2), and more
- 🌐 **Multiworld Compatible**: Your proof steps can be scattered across other players' worlds
- ⚙️ **Customizable Difficulty**: Adjust complexity and starting statements

## Quick Start

1. **Installation**: Place the `metamath` folder in your Archipelago `worlds` directory
2. **Generate**: Use a YAML configuration file to specify your theorem
3. **Play**: Connect with other players and complete your proof!

## Available Theorems

Popular choices include:
- `2p2e4` - Proof that 2 + 2 = 4 (10 steps)
- `1p1e2` - Proof that 1 + 1 = 2 (2 steps)
- `3p3e6` - Proof that 3 + 3 = 6 (10 steps)
- `pm5.32` - A propositional logic theorem (7 steps)
- Any theorem from the [Metamath database](https://us.metamath.org/)

## Example YAML Configuration

```yaml
name: MathPlayer
game: Metamath

Metamath:
  theorem: 2p2e4  # The theorem to prove
  complexity: moderate
  starting_statements: 10  # Percentage of statements pre-unlocked
  hint_frequency: 10
  auto_download_database: true
  progression_balancing: 50
  accessibility: full
```

## Documentation

- [Setup Guide](setup.md) - Detailed installation and configuration
- [Gameplay Guide](gameplay.md) - How to play and strategies
- [Settings Guide](settings.md) - All available options explained
- [Examples](examples.md) - Sample configurations and walkthroughs
- [Developer Guide](developer.md) - Technical details and extending the world

## Credits

- Metamath database by Norman Megill and contributors
- Archipelago framework by the Archipelago community
- Metamath world implementation using `metamath-py` library