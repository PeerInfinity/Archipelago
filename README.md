# Archipelago JSON Export Tools

This project provides a system for exporting Archipelago's location access rules into a JSON format and includes a web client that utilizes these rules for advanced tracking and a new incremental game mode.

## Core System: JSON Rule Export

- Extracts game rules (location access, region connections) from Archipelago's Python codebase.
- Converts these rules into a standardized JSON format.
- Exports the complete region graph, including entrances, exits, and associated metadata.
- Includes game settings, item definitions, and progression data.
- The `rules.json` file is generated alongside the `.archipelago` file during game generation.

## JSON Web Client

The JSON Web Client is a web-based client for Archipelago, enhanced with features powered by the exported `rules.json` file.

[Try it live](https://peerinfinity.github.io/Archipelago/)

### Features:

1.  **Standard Archipelago Client:** Connect to multiworld servers, send/receive items, chat, and use console commands.
2.  **JSON Rules Integration (Default Mode):**
    - Load your game's `rules.json` file.
    - Track your inventory visually.
    - View locations color-coded by accessibility (reachable, unreachable, checked).
    - Explore regions, view exits, and analyze paths to understand requirements.
    - Automatically collects event items when their locations become accessible.
    - [User Guide](/docs/json/json-web-client.md)
3.  **Archipelago Loops (Incremental Game Mode):**
    - A new game mode inspired by idle/incremental games like Idle Loops.
    - Play through your Archipelago world in automated time loops.
    - Manage Mana, queue actions (Explore, Check Location, Move), and gain Region XP.
    - Inventory and discoveries persist across loops, allowing deeper exploration over time.
    - Optimize your action queue to complete the game objectives efficiently.
    - [Loop Mode Guide](/docs/json/archipelago-loops.md)

## Key Technical Features

- **Complete Region Graph Export:** Detailed information about regions, locations, exits, and their connections.
- **Native JavaScript Rule Engine:** Evaluates JSON rules using JavaScript implementations of Python helper functions.
- **Centralized State Management:** A singleton `stateManager` ensures consistent game state (inventory, flags, region accessibility) across the application.
- **Region Accessibility:** Uses Breadth-First Search (BFS) to determine reachable regions based on current inventory and rules.
- **Path Analysis:** Tools to visualize paths between regions and identify blocking items or conditions.
- **Comprehensive Testing:** Validates the JavaScript rule engine against Python behavior.

## Usage Notes & Tips

This document summarizes the main details that might not be obvious just from experimenting with the interface:

- **[Usage Notes & Tips](/docs/json/notes.md)** - Covers quick start for Loop Mode, automation buttons, interaction differences between modes, and other useful details.

## For Users

### Getting Started (Standard Mode)

1.  Generate your Archipelago game normally. You will get a `.archipelago` file and a `rules.json` file.
2.  Open the [JSON Web Client](https://peerinfinity.github.io/Archipelago/) in your browser.
3.  Click "Load JSON" and select your `rules.json` file.
4.  Connect to your multiworld server using the "Server Address" input and `/connect` command if needed.
5.  Use the Inventory panel (left) to track collected items.
6.  Use the Locations/Regions tabs (right) to track progress and check accessibility.

See the [User Guide](/docs/json/json-web-client.md) for more details.

### Getting Started (Loop Mode)

1.  Load your `rules.json` file as above or use the default preset data.
2.  Switch to the "Loops" tab in the right panel.
3.  Click "Enter Loop Mode".
4.  Queue actions like "Explore Region" or "Check Location" within region blocks.
5.  Manage your Mana and watch the automated loops progress.

See the [Loop Mode Guide](/docs/json/archipelago-loops.md) for detailed instructions.

## For Developers

- The **Rule Export System** uses Python's AST module to parse rule lambdas and helper functions, exporting them to a structured JSON format.
- The **Frontend Rule Engine** (`ruleEngine.js`) evaluates these rules using native JavaScript implementations of helper functions provided by game-specific modules (e.g., `frontend/app/games/alttp/helpers.js`).
- **State Management** (`stateManager.js`) is crucial, handling inventory, region reachability (BFS), event collection, and providing a consistent state view for rule evaluation.
- **Loop Mode** (`loopState.js`, `loopUI.js`) adds an incremental game layer, managing its own state (Mana, XP, Action Queue, Discovery) built upon the core `stateManager`.
- **Testing** (`test-runner.md`) provides tools for comparing frontend JavaScript execution against backend Python test results.

See the [Developer Guide](/docs/json/development.md) and [Testing Guide](/docs/json/test-runner.md) for more implementation details.

## Current Status & Roadmap

See the [Project Roadmap](/docs/json/project-roadmap.md) for the latest status, known issues, and future plans.

## Credits

- Based on the original [Archipelago](https://github.com/ArchipelagoMW/Archipelago) multiworld system.
- Web client interface derived from [ArchipIDLE](https://github.com/LegendaryLinux/archipidle-client).
- Loop mode inspired by games like [Idle Loops](https://github.com/dmchurch/omsi-loops/), Increlution, and Stuck In Time.
