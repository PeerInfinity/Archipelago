# Archipelago JSON Export Tools - Documentation

This is the official documentation for the Archipelago JSON Export Tools and its associated web client. This documentation provides comprehensive guides for both users of the application and developers looking to contribute or understand its architecture.

This project is a fork of the main Archipelago project that focuses on two key areas:

1.  A Python-based system to export a game's logic (location access rules, region connections, item data) into a standardized JSON format.
2.  A modular, feature-rich web client that consumes this JSON to provide advanced tracking, accessibility analysis, and other tools.

**Try the Live Demo:** Either the **[Latest Stable Version](https://peerinfinity.github.io/Archipelago/)** or the **[Latest Development Version](https://peerinfinity.github.io/Archipelago-CC/)**

For the main project overview and credits, please see the [README.md at the project root](../../README.md).

## Features

For an overview of all major features in this project, see the **[Features Index](./features/README.md)**. Highlights include:

**Core Tools:**
- [JSON Exporter](../../exporter/README.md) — Export multiworld game logic to JSON
- [Web Frontend & Tracker](../../frontend/README.md) — Browser-based tracker with region graph, discovery mode, and reachability analysis
- [JSON Tools Installer](../../worlds/json_tools_installer/README.md) — One-click APWorld installer for vanilla Archipelago
- [Skip Required Files](./features/skip-required-files.md) — Generate seeds without ROM files

**World Generation & Tracking:**
- [World Generator](../../world_generator/README.md) — Convert JSON rules back into functional Python worlds
- [Universal Tracker Enhancements](./features/universal-tracker.md) — Three tracking modes with hybrid auto-selection
- [Rule Builder Extensions](../../rule_builder/README.md) — 15 new rule types, AST format, explain support
- [Fuzzer Improvements](./features/fuzzer.md) — Reproducible fuzzing for cross-game validation

**New Games & Modes:**
- [MetaMath](../../worlds/metamath/docs/README.md) — Mathematical proofs as playable Archipelago worlds
- [DepGraph](./features/depgraph.md) — Any dependency graph as an Archipelago world
- [Journey to Ascension](../../worlds/jta/docs/en_Journey%20to%20Ascension.md) — Incremental game integration with cost rebalancing ([Demo](https://peerinfinity.github.io/Archipelago-CC/?mode=jta))
- [Loops](./features/loops.md) — Incremental/idle game mode on top of the tracker
- [Maze Metagame](./features/maze-metagame.md) — A-Mazing-Idle as a meta-progression layer

## Documentation Sections

This documentation is organized into the following main sections:

### 1. User Guides

This section is for anyone who wants to use the JSON Web Client to play or track their Archipelago games. These guides cover the application's features from a user's perspective.

- **[Overview: What Is This?](./user/overview.md)**: Start here if you're new. Learn what this project does, see game compatibility, and understand how to use the tracker.
- **[Quick Start Guide](./user/quick-start.md)**: A fast-paced introduction to getting the client running.
- **[Standard Client Guide](./user/standard-client.md)**: A detailed guide on using the client for tracking, checking accessibility, and connecting to a multiworld server.
- **[Tips & Tricks](./user/tips-and-tricks.md)**: A collection of useful notes, console commands, and frequently asked questions.

### 2. Developer Documentation

This section is for developers who want to understand, modify, or contribute to the project. It covers the project's architecture, development setup, and core concepts. See the **[Developer Documentation Index](./developer/README.md)** for a complete overview.

- **[Getting Started for Developers](./developer/getting-started.md)**: Your first stop for setting up a local development environment.
- **[System Architecture](./developer/architecture.md)**: A high-level overview of the modular frontend and Python backend systems.
- **[Developer Guides](./developer/guides/README.md)**: In-depth guides on specific architectural components like the State Manager, Module System, and Event System.
- **[Reference](./developer/reference/README.md)**: Detailed reference material, such as the Logging System guide.
- **[Diffs from Upstream](./developer/diffs/README.md)**: Line-by-line changes from the upstream Archipelago repository.
- **[Upstream Bugs](./upstream-bugs/README.md)**: Bugs discovered in the upstream Archipelago codebase during testing.
- **[Project Roadmap](./project-roadmap.md)**: Development priorities and future plans for the project.
- **[Test Results](./developer/test-results/)**: Automated test results for all game templates:
  - [Test Results Summary](./developer/test-results/test-results-summary.md): Combined overview of all test types
  - [Minimal Spoiler Test Results](./developer/test-results/test-results-spoilers-minimal.md): Tests with advancement items only
  - [Full Spoiler Test Results](./developer/test-results/test-results-spoilers-full.md): Tests with all locations
  - [Multiclient Test Results](./developer/test-results/test-results-multiclient.md): Tests in multiclient mode

### 3. Module Reference

This section provides detailed, auto-generated, or manually written documentation for each individual frontend module. It is an essential technical reference for understanding the specific responsibilities and interactions of each component in the application.

- **[Module Index](./modules/README.md)**: An overview and index of all documented frontend modules.

### 4. Source-Level Documentation

READMEs in the source directories provide quick-start guides for each major component:

| Component | README | Description |
|-----------|--------|-------------|
| Frontend | [frontend/README.md](../../frontend/README.md) | Web client overview, directory structure, development setup |
| Exporter | [exporter/README.md](../../exporter/README.md) | Python rule export pipeline, game handlers, analyzer |
| World Generator | [world_generator/README.md](../../world_generator/README.md) | JSON to Python world conversion |
| Rule Builder | [rule_builder/README.md](../../rule_builder/README.md) | Declarative rule definition system |
| Archipelago Games Sheet | [docs/json/archipelago-games-sheet/README.md](./archipelago-games-sheet/README.md) | Community game compatibility data |
