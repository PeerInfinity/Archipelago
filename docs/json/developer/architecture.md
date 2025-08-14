# System Architecture

This document provides a high-level overview of the technical architecture for the Archipelago JSON Export Tools project. It is intended to give developers a conceptual understanding of the main components and how they interact.

## Core Components

The project consists of two primary, distinct components:

1.  **Backend Exporter (Python):** A command-line tool that analyzes the game logic within the main Archipelago Python codebase and exports it to a structured JSON format.
2.  **Frontend Web Client (JavaScript):** A single-page web application that consumes the exported JSON to provide a powerful, modular interface for game tracking and other utilities.

```
┌────────────────────────┐      ┌─────────────┐      ┌─────────────────────────┐
│ Archipelago Game Logic │      │ exporter.py │      │       rules.json        │
│   (Python Worlds)      ├─────►│  (Backend)  ├─────►│  (Standardized Format)  │
└────────────────────────┘      └─────────────┘      └─────────────────────────┘
                                                                   │
                                                                   ▼
                                                     ┌─────────────────────────┐
                                                     │  Frontend Web Client    │
                                                     │      (JavaScript)       │
                                                     └─────────────────────────┘
```

## Backend Architecture: The Exporter

The exporter is a suite of Python scripts located in the `exporter/` directory. Its sole purpose is to convert Python-based game definitions into a machine-readable JSON format that the frontend can understand.

-   **AST Analysis (`exporter/analyzer.py`):** The core of the exporter uses Python's `ast` (Abstract Syntax Tree) module. It ingests Python rule functions (typically `lambda` expressions) and traverses their structure to convert Python logic into a corresponding JSON tree structure.
-   **Game-Specific Handlers (`exporter/games/`):** Each game (like `alttp.py`) has a handler that understands its unique helper functions, item properties, and data structures, ensuring they are correctly represented in the final JSON.
-   **Orchestration (`exporter/exporter.py`):** The main script coordinates the process, extracting the full region graph, location lists, item definitions, and game settings, and then uses the analyzer to process all associated rules.

## Frontend Architecture: The Web Client

The frontend is a highly modular, single-page application designed for performance, flexibility, and extensibility. It operates without a traditional backend server, running entirely in the user's browser and interacting with Archipelago servers via WebSockets.

### Key Design Principles

1.  **Modularity:** Every distinct feature or UI panel is a self-contained **Module**. This allows features to be enabled, disabled, or even loaded dynamically.
2.  **Performance via Web Workers:** All heavy computation, primarily game rule evaluation and accessibility analysis (BFS), is offloaded to a **Web Worker**. This keeps the main UI thread responsive and prevents freezing during complex state updates.
3.  **Event-Driven Communication:** Modules are decoupled and communicate through an **Event Bus** and a prioritized **Event Dispatcher**. This prevents direct dependencies and allows for flexible interaction patterns.
4.  **Configuration over Code:** The application's behavior, including which modules are loaded and how the UI is arranged, is controlled by a set of JSON configuration files (`modes.json`, `modules.json`, `settings.json`).
5.  **Structured Logging:** A centralized **Logger Service** provides consistent, filterable, and category-based logging across all modules and contexts (including Web Workers and iframes), replacing scattered `console.log` statements with a powerful debugging tool.

### Core Architectural Layers

#### 1. Initialization and Module System (`init.js`)

`init.js` is the main entry point for the frontend. It orchestrates the entire application startup process in a well-defined sequence:

1.  **Mode Detection:** Determines the active mode (e.g., `default`, `test`) from URL parameters or `localStorage`.
2.  **Configuration Loading:** Loads `modes.json`, `modules.json`, `settings.json`, and `layout_presets.json` based on the active mode.
3.  **Module Loading & Registration:** Dynamically imports all JavaScript modules defined in `modules.json`. Each module's `register()` function is called, allowing it to declare its capabilities (e.g., panel components, event handlers) to the `centralRegistry`.
4.  **UI Setup:** Initializes Golden Layout and registers all panel components provided by the modules.
5.  **Module Initialization:** Calls the `initialize()` and `postInitialize()` functions on each enabled module in a defined priority order, providing them with necessary APIs to interact with the system.

*(**Planned Enhancement**: The module system is designed to eventually support dynamic loading of external modules from a URL, though this is not yet fully implemented. Details may change.)*

#### 2. State Management

This is the most critical component of the frontend. It manages all game-related state and is split between a core logic engine and a more specific player state tracker.

##### The `stateManager` Module (Core Game Logic)

```
  Main UI Thread                    Web Worker Thread
┌───────────────────┐               ┌───────────────────┐
│   UI Components   │               │                   │
│ (e.g., Locations) │               │   StateManager    │
└─────────▲─────────┘               │ (Authoritative)   │
          │                         └─────────┬─────────┘
          │ (Read Snapshots)                  │ (Computes)
          │                                   │
┌─────────▼─────────┐   Commands    ┌─────────▼─────────┐
│ StateManagerProxy │◄─────────────►│    Rule Engine    │
│  (Cached State)   │ (postMessage) │ (Rule Evaluation) │
└───────────────────┘               └───────────────────┘
```

-   **`StateManager` (in Worker):** The authoritative source of game state. It holds the inventory, tracks checked locations, and runs the Breadth-First Search (BFS) algorithm to determine region reachability. It lives exclusively inside the Web Worker.
-   **`RuleEngine` (in Worker):** A JavaScript engine that evaluates the JSON rule trees against the current game state provided by the `StateManager`.
-   **`StateManagerProxy` (on Main Thread):** A singleton that acts as the sole interface for all other modules. It sends commands (like `addItem` or `checkLocation`) to the worker and receives state **snapshots** in return. It maintains a cached copy of the latest snapshot for the UI to read from instantly.
-   **Snapshots:** Immutable, read-only copies of the game state that are passed from the worker to the main thread. This prevents the UI from directly modifying state and ensures data consistency.

##### The `playerState` Module (Player-Specific State)

Complementing the core `stateManager`, the `playerState` module tracks player-centric information that is more closely tied to the user's interaction with the UI, such as the player's current region in the Text Adventure mode. This separation keeps the heavy game logic distinct from the more lightweight UI state.

#### 3. UI and Layout Management

-   **Golden Layout:** A powerful library used to create the dockable, multi-panel user interface. It handles the creation, destruction, resizing, and arrangement of all panels.
-   **`PanelManager`:** A core service that acts as an intermediary, registering UI component classes from modules with the Golden Layout instance. It provides a standardized way for the application to interact with the layout system.
-   **Module UI Classes:** Each UI panel (e.g., `InventoryUI`, `LocationUI`) is a JavaScript class responsible for rendering its own HTML content and handling user interactions within its panel.

#### 4. Inter-Application Communication (Adapters)

The architecture includes a sophisticated adapter system to bridge communication between the main application and external web content running in isolated contexts.

-   **`iframeAdapter` & `windowAdapter`:** These core modules use the browser's `postMessage` API to establish a standardized communication protocol.
-   **`iframePanel` & `windowPanel`:** These modules provide Golden Layout panels that can host external content (e.g., a standalone version of the Text Adventure game) and use the adapters to relay events and state information back and forth.
-   This system enables powerful integrations, allowing modules to be developed as independent web applications that can still interact seamlessly with the main client's state and event bus.

For more detailed information on these systems, please refer to the guides in the `docs/developer/guides/` directory.