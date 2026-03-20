### Module: `State Manager`

-   **ID:** `stateManager`
-   **Purpose:** The central nervous system of the application. It manages the entire game state, evaluates all game logic, and performs all heavy computations in a background Web Worker to keep the UI responsive. It does not have its own UI panel.

---

#### Key Files

-   **`frontend/modules/stateManager/index.js`**: The module entry point. It primarily exports the `stateManagerProxySingleton`.
-   **`stateManagerProxySingleton.js`**: Exports a singleton instance of the `StateManagerProxy`. This is the **only object** other modules should interact with to access or modify game state.
-   **`stateManagerProxy.js`**: The proxy class that runs on the main UI thread. It queues commands, sends them to the worker, and receives/caches state snapshots.
-   **`stateManagerWorker.js`**: The entry point for the Web Worker thread. It receives commands from the proxy and passes them to the `StateManager` instance.
-   **`stateManager.js`**: The core logic class that runs **exclusively in the worker**. It holds the authoritative game state and performs all computations.
-   **`ruleEngine.js`**: The JavaScript rule evaluation engine, which also runs **exclusively in the worker**.
-   **`frontend/modules/shared/gameLogic/`**: Directory containing game-agnostic logic modules (e.g., `alttpLogic.js`, `genericLogic.js`).

#### Responsibilities

-   **State Management:** Holds the authoritative "source of truth" for the player's inventory, checked locations, and all other game-specific state flags and events.
-   **Rule Evaluation:** Uses the `RuleEngine` to evaluate complex JSON rule trees from the `rules.json` file.
-   **Accessibility Computation:** Implements a Breadth-First Search (BFS) algorithm to traverse the game's region graph and determine which regions and locations are currently reachable.
-   **Web Worker Isolation:** Executes all the above tasks in a separate Web Worker thread to prevent locking up the main UI thread.
-   **Command Processing:** Manages a command queue to process state change requests from the main thread (e.g., `addItemToInventory`, `checkLocation`).
-   **Snapshot Generation:** After any state change, it creates and sends an immutable, read-only "snapshot" of the entire current game state back to the main thread.
-   **Game-Agnostic Logic:** The core `StateManager` is game-agnostic. It dynamically loads game-specific helper modules from the `frontend/modules/shared/gameLogic/` directory based on the active game.

#### Events Published

The `StateManager` (via its proxy on the main thread) is one of the most important event publishers in the application.

-   `stateManager:snapshotUpdated`: The most critical event. Published whenever a new state snapshot is available from the worker. Nearly all UI panels listen for this to trigger a re-render.
-   `stateManager:rulesLoaded`: Published after a new `rules.json` file has been successfully processed by the worker and the initial state has been calculated.
-   `stateManager:ready`: Published once after the very first `rulesLoaded` and snapshot cycle is complete, signaling that core systems are ready for interaction.
-   `stateManager:workerError`: Published if an error occurs within the worker.

#### Events Subscribed To

The `StateManager` module itself does not subscribe to high-level application events. It receives all its instructions as direct command calls to the `stateManagerProxySingleton`. The `StateManager`'s handler for the `user:locationCheck` and `user:itemCheck` events acts as the final, local fallback in the `eventDispatcher` chain if the `Client` module does not handle them.

#### Public Functions (`centralRegistry`)

This module does not register public functions in the traditional sense. Its entire public API is the set of methods available on the `stateManagerProxySingleton`, which is directly imported by other modules.

#### Dependencies & Interactions

-   **All UI Modules:** Virtually every UI panel (`Locations`, `Inventory`, `Regions`, etc.) depends on the `StateManager` to function. They get all their data by calling methods on the `stateManagerProxySingleton` (e.g., `getLatestStateSnapshot()`, `getStaticData()`) and trigger all state changes by calling its command methods (e.g., `checkLocation()`).
-   **`init.js`**: The initialization script is responsible for providing the `StateManager` with its initial `rules.json` data via `stateManagerProxySingleton.loadRules()`.