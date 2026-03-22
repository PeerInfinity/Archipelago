# Features

An overview of the major features in the Archipelago JSON Export Tools project.

## Core Tools

| Feature | Description | Overview |
|---------|-------------|----------|
| **JSON Exporter** | Exports multiworld game logic (rules, regions, items, locations) to a standardized JSON format | [exporter/README.md](../../../exporter/README.md) |
| **Web Frontend & Tracker** | Modular browser-based tracker with region graph visualization, discovery mode, reachability analysis, and multiple game modes. [Live demo](https://peerinfinity.github.io/Archipelago-CC/) | [frontend/README.md](../../../frontend/README.md) |
| **JSON Tools Installer** | APWorld package for installing JSON Tools into a vanilla Archipelago installation — no repository clone needed | [worlds/json_tools_installer/README.md](../../../worlds/json_tools_installer/README.md) |
| **Skip Required Files** | Generate seeds without ROM files for testing, CI/CD, and tool development | [skip-required-files.md](skip-required-files.md) |

## World Generation & Tracking

| Feature | Description | Overview |
|---------|-------------|----------|
| **World Generator** | Converts JSON rules files back into fully functional Python Archipelago world packages | [world_generator/README.md](../../../world_generator/README.md) |
| **Universal Tracker Enhancements** | Three tracking modes (worldgen, pickle, original) with hybrid auto-selection per game | [universal-tracker.md](universal-tracker.md) |
| **Rule Builder Extensions** | 15 new rule types, AST format support, explain support, and pathfinding — extending upstream PR #5048 | [rule_builder/README.md](../../../rule_builder/README.md) |
| **Fuzzer Improvements** | Reproducible seeded fuzzing, option exclusion, early termination — enabling comprehensive cross-game validation | [fuzzer.md](fuzzer.md) |

## New Games & Modes

| Feature | Description | Overview |
|---------|-------------|----------|
| **MetaMath APWorld** | Turns MetaMath theorem proofs into playable Archipelago worlds — each proof step is a location, each proven statement is an item. [Live demo](https://peerinfinity.github.io/Archipelago-CC/?mode=metamath) | [worlds/metamath/docs/README.md](../../../worlds/metamath/docs/README.md) |
| **DepGraph APWorld** | Converts any directed acyclic graph into an Archipelago world — bundled examples include tech trees, skill trees, and recipe chains. [Live demo](https://peerinfinity.github.io/Archipelago-CC/?mode=depgraph) | [depgraph.md](depgraph.md) |
| **Journey to Ascension APWorld** | Archipelago integration for the incremental/idle game Journey to Ascension, with automatic cost rebalancing for randomized perk placement. [Live demo](https://peerinfinity.github.io/Archipelago-CC/?mode=jta) | [worlds/jta/docs/en_Journey to Ascension.md](../../../worlds/jta/docs/en_Journey%20to%20Ascension.md) |
| **Loops Mode** | Incremental/idle game mode layered on the tracker — queue actions, spend mana, earn XP, optimize your loops. [Live demo](https://peerinfinity.github.io/Archipelago-CC/?mode=loops) | [loops.md](loops.md) |
| **Maze Metagame** | A-Mazing-Idle as a meta-progression layer — solve mazes before checking locations or moving to new regions. Live demo: [standard](https://peerinfinity.github.io/Archipelago-CC/?metagame=mazegame), [with Loops](https://peerinfinity.github.io/Archipelago-CC/?metagame=mazegameloops) | [maze-metagame.md](maze-metagame.md) |
