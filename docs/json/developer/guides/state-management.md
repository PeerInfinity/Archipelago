# Developer Guide: State Management

The state management system is the architectural heart of the web client. It is responsible for maintaining all game state, evaluating accessibility rules, and ensuring the UI remains responsive during complex calculations. This is achieved by offloading all heavy processing to a Web Worker.

## Architecture Overview

The system is built on a **proxy pattern** that separates the main UI thread from the worker thread where state is managed.

- **Main UI Thread:** Handles all user interaction and DOM rendering. It is not allowed to perform heavy computations to avoid freezing. It interacts with the state exclusively through the `StateManagerProxy`.
- **Web Worker Thread:** A background thread that runs the core `StateManager` and `RuleEngine`. It is responsible for all state mutations and logic evaluation.

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

### Key Components

- **`StateManager` (`stateManager.js`):** The "source of truth" that lives in the worker. It holds the canonical game state (inventory, checked locations, game-specific flags), and contains the core logic for calculating region reachability via Breadth-First Search (BFS).
- **`RuleEngine` (`ruleEngine.js`):** A JavaScript engine that recursively evaluates the JSON rule trees provided in `rules.json`. It runs inside the worker and gets its context from the `StateManager`.
- **`StateManagerProxy` (`stateManagerProxy.js`):** The public-facing interface on the main UI thread. All other modules interact with this proxy. It sends commands to the worker and caches the latest state **snapshot** it receives back.
- **`stateManagerProxySingleton.js`**: Ensures only one instance of the proxy exists, providing a global access point for all modules.
- **`stateManagerWorker.js`**: The script that bootstraps the worker, instantiates the `StateManager`, and handles the `postMessage` communication bridge.

## The Data Flow: Commands and Snapshots

Interaction with the state is a one-way data flow designed for performance and consistency.

1.  **Command:** A UI module (e.g., Inventory) needs to change the state. It calls a method on the `stateManagerProxySingleton`, for example, `addItemToInventory('Bow')`.
2.  **Message Passing:** The proxy packages this into a command object and sends it to the worker using `worker.postMessage()`.
3.  **Worker Processing:** The worker's `onmessage` listener receives the command. It calls the corresponding method on its internal `StateManager` instance (e.g., `stateManagerInstance.addItemToInventory('Bow')`).
4.  **State Mutation & Re-computation:** The `StateManager` updates its internal state (adds 'Bow' to the inventory). This action invalidates its cache, so it re-runs its expensive computations (like the BFS for region reachability).
5.  **Snapshot Creation:** Once re-computation is complete, the `StateManager` creates a new, immutable **snapshot** of the entire current game state. This is a plain JavaScript object designed to be easily serialized.
6.  **Snapshot Broadcast:** The worker sends this new snapshot back to the main thread via `postMessage()`.
7.  **Cache & Event:** The `StateManagerProxy` receives the snapshot, caches it internally, and publishes a `stateManager:snapshotUpdated` event on the global `eventBus`.
8.  **UI Update:** UI modules listen for `stateManager:snapshotUpdated` and re-render themselves using the new data, which they can get instantly from the proxy's cache (`getLatestStateSnapshot()`).

## State Snapshots

A snapshot is the primary way the UI learns about the game state. It's a read-only object containing everything needed for display and local rule evaluation.

**Key Properties of a Snapshot:**

- `inventory`: An object mapping item names to their counts.
- `checkedLocations`: An array of names of all checked locations.
- `reachability`: A map where keys are region/location names and values are their accessibility status (e.g., `'reachable'`, `'unreachable'`, `'checked'`).
- `flags` / `events`: Game-specific state flags.
- ...and other game-specific data.

For a full breakdown, see the [State Snapshots Documentation](./reference/state-snapshots.md).

## Main-Thread Rule Evaluation

While the worker handles the primary state computation, UI components often need to evaluate simple rules for display purposes (e.g., showing the logic tree for a location). To do this without asking the worker and waiting for a response, they use a **State Snapshot Interface**.

-   **`createStateSnapshotInterface()`**: A function in `frontend/modules/shared/stateInterface.js` that takes the latest snapshot and static data to create a temporary interface object.
-   This interface has methods similar to the real `StateManager` (e.g., `hasItem`, `countGroup`, `executeHelper`) but operates _synchronously_ on the cached snapshot data.
-   This allows `commonUI.renderLogicTree()` to instantly evaluate and display a rule's status on the main thread.

## Game-Specific Logic

The state management system is designed to be game-agnostic. It achieves this by dynamically loading game-specific logic modules.

-   **Location:** `frontend/modules/shared/gameLogic/`
-   **Structure:** Each game has its own logic file (e.g., `alttpLogic.js`). A `genericLogic.js` file is used as a fallback for unsupported games.
-   **Content:** Each file exports a set of `helperFunctions` and a `stateModule` that handles game-specific state properties (like flags, events, and dungeon states) and settings.
-   **Dynamic Loading:** The `StateManager` detects the game type from the loaded `rules.json` and uses the appropriate logic module.

This separation ensures the core `StateManager` and `RuleEngine` remain generic, while game-specific intricacies are handled in a modular and extensible way.
