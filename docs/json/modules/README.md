# Frontend Module Reference

This directory contains detailed documentation for each of the major frontend modules in the web client. The application is built on a modular architecture where each distinct piece of functionality is encapsulated within its own module.

This reference is intended for developers who need to understand the specific responsibilities, dependencies, and interactions of a particular module.

## Module Documentation Structure

Each document in this section follows a consistent structure:

-   **Module ID & Purpose:** The unique identifier for the module and a brief summary of its role in the application.
-   **Key Files:** A list of the most important source code files for the module.
-   **Responsibilities:** A detailed breakdown of what the module is designed to do.
-   **Events Published:** A list of events the module sends out on the `eventBus`.
-   **Events Subscribed To:** A list of events the module listens for from the `eventBus` or `eventDispatcher`.
-   **Public Functions:** A list of functions the module registers with the `centralRegistry` for other modules to call directly.
-   **Dependencies & Interactions:** A description of how the module interacts with other core systems or modules.

## Core Service Modules

These modules provide foundational services that other modules depend on. They typically do not have their own UI panels.

-   **[State Manager](./stateManager.md):** The most critical module. Manages all game state, logic evaluation, and accessibility in a background Web Worker.
-   **[Client](./client.md):** Handles WebSocket communication with the Archipelago server.
-   **[Discovery](./discovery.md):** Tracks the "discovered" state of regions, locations, and exits for game modes like Archipelago Loops.
-   **[PlayerState](./playerState.md):** Tracks the player's current region, primarily for UI-centric features like the Text Adventure.
-   **[Timer](./timer.md):** Manages the logic for the automated location checking timer.
-   **[ProgressBar](./progressBar.md):** Provides the core logic for creating and managing generic, event-driven progress bars.
-   **[MetaGame](./metaGame.md):** An event orchestration system for creating scripted, narrative, or tutorial-like experiences.
-   **[IframeAdapter](./iframeAdapter.md):** Core logic for bridging communication between the main app and content running in an `<iframe>`.
-   **[WindowAdapter](./windowAdapter.md):** Core logic for bridging communication between the main app and content running in a separate browser window.

## UI Panel Modules

These modules each correspond to a UI panel that the user can interact with in the Golden Layout interface.

-   **[Dungeons](./dungeons.md):** Displays dungeon-specific information, such as bosses and medallion requirements.
-   **[Editor](./editor.md):** A simple JSON viewer for inspecting application data like `rules.json`.
-   **[Events](./events.md):** A debug panel for inspecting registered handlers for the `eventBus` and `eventDispatcher`.
-   **[Exits](./exits.md):** Displays all region exits and their real-time accessibility status.
-   **[Inventory](./inventory.md):** Displays and manages the player's item inventory.
-   **[JSON](./json.md):** Handles saving and loading of the application's entire configuration state (modes).
-   **[Locations](./locations.md):** Displays all game locations and their real-time accessibility status.
-   **[Loops](./loops.md):** The main UI panel for the Archipelago Loops incremental game mode.
-   **[Modules](./modules.md):** A panel for viewing and managing the loaded frontend modules.
-   **[Path Analyzer Panel](./pathAnalyzerPanel.md):** A dedicated panel for running the path analysis tool.
-   **[Player State Panel](./playerStatePanel.md):** A simple panel for displaying the player's current state (e.g., current region).
-   **[Presets](./presets.md):** Handles loading of pre-configured game files (`rules.json`).
-   **[Regions](./regions.md):** Displays the game world organized by regions and their connections.
-   **[Settings](./settings.md):** Provides a UI for editing application settings.
-   **[Test Spoilers](./testSpoilers.md):** The primary tool for validating game logic by replaying a game's progression against its spoiler log.
-   **[Tests](./tests.md):** A developer panel that provides an in-app framework for running automated feature tests and integrates with Playwright for end-to-end validation.
-   **[Text Adventure](./textAdventure.md):** Provides a text-based interface for interacting with the game world.
-   **[Timer Panel](./timerPanel.md):** A dedicated panel that can host the Timer UI component.
-   **[Progress Bar Panel](./progressBarPanel.md):** A panel designed to host UI elements from the `ProgressBar` module.
-   **[Meta Game Panel](./metaGamePanel.md):** A UI for loading and managing `MetaGame` configurations.
-   **[Iframe Panel](./iframePanel.md):** A generic panel designed to host an `<iframe>` and connect it to the `iframeAdapter`.
-   **[Iframe Manager Panel](./iframeManagerPanel.md):** A UI for loading content into `iframePanel` instances.
-   **[Window Panel](./windowPanel.md):** A panel that displays the status of a connected separate browser window.
-   **[Window Manager Panel](./windowManagerPanel.md):** A UI for opening and managing separate windows that connect via the `windowAdapter`.

## Utility Modules

These modules provide shared functionality but do not have their own UI panels.

-   **[CommonUI](./commonUI.md):** Provides shared UI utility functions, such as rendering logic trees.
-   **[Path Analyzer](./pathAnalyzer.md):** The core logic and UI rendering components for the path analysis tool, used by `regionsPanel` and `pathAnalyzerPanel`.