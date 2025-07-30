# Frontend Module Reference

This directory contains detailed documentation for each of the major frontend modules in the web client. The application is built on a modular architecture where each distinct piece of functionality is encapsulated within its own module.

This reference is intended for developers who need to understand the specific responsibilities, dependencies, and interactions of a particular module.

## Module Documentation Structure

Each document in this section follows a consistent structure:

- **Module ID & Purpose:** The unique identifier for the module and a brief summary of its role in the application.
- **Key Files:** A list of the most important source code files for the module.
- **Responsibilities:** A detailed breakdown of what the module is designed to do.
- **Events Published:** A list of events the module sends out on the `eventBus`.
- **Events Subscribed To:** A list of events the module listens for from the `eventBus` or `eventDispatcher`.
- **Public Functions:** A list of functions the module registers with the `centralRegistry` for other modules to call directly.
- **Dependencies & Interactions:** A description of how the module interacts with other core systems (like the State Manager) or other modules.

## Core Service Modules

These modules provide foundational services that other modules depend on.

- **[State Manager](./stateManager.md):** The most critical module. Manages all game state, logic evaluation, and accessibility in a background Web Worker.
- **[Client](./client.md):** Handles WebSocket communication with the Archipelago server.
- **[Discovery](./discovery.md):** Tracks the "discovered" state of regions, locations, and exits for the Loops game mode.
- **[Timer](./timer.md):** Manages the logic for the automated location checking timer.

## UI Panel Modules

These modules each correspond to a UI panel that the user can interact with in the Golden Layout interface.

- **[Dungeons](./dungeons.md):** Displays dungeon-specific information.
- **[Editor](./editor.md):** A simple JSON viewer for inspecting application data like `rules.json`.
- **[Events](./events.md):** A debug panel for inspecting registered event handlers.
- **[Exits](./exits.md):** Displays all region exits and their accessibility.
- **[Inventory](./inventory.md):** Displays and manages the player's item inventory.
- **[JSON](./json.md):** Handles saving and loading of the application's entire configuration state.
- **[Locations](./locations.md):** Displays all game locations and their accessibility.
- **[Loops](./loops.md):** The main UI panel for the Archipelago Loops incremental game mode.
- **[Modules](./modules.md):** A panel for viewing and managing the loaded frontend modules.
- **[Path Analyzer](./pathAnalyzer.md):** The UI component for the path analysis tool.
- **[Presets](./presets.md):** Handles loading of pre-configured game files.
- **[Regions](./regions.md):** Displays the game world organized by regions and their connections.
- **[Settings](./settings.md):** Provides a UI for editing application settings.
- **[Test Playthroughs](./testPlaythroughs.md):** UI for stepping through and validating game playthrough logs.
- **[Test Spoilers](./testSpoilers.md):** UI for validating game progression against spoiler logs.
- **[Tests](./tests.md):** UI for the in-app automated feature testing framework.
- **[Timer Panel](./timerPanel.md):** A dedicated panel that can host the Timer UI.

## Utility Modules

These modules provide shared functionality but do not have their own UI panels.

- **[CommonUI](./commonUI.md):** Provides shared UI utility functions, such as rendering logic trees.
