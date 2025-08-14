### Module: `MetaGame`

-   **ID:** `metaGame`
-   **Purpose:** An event orchestration system for creating scripted, narrative, or tutorial-like experiences. It operates by loading a configuration file that defines how to react to game events (like moving to a region) and what actions to perform in response (like showing a progress bar).

---

#### Key Files

-   `frontend/modules/metaGame/index.js`: The module's entry point for registration and initialization.
-   `frontend/modules/metaGame/metaGameLogic.js`: The core `MetaGameLogic` class that loads configurations, sets up event listeners, and executes actions.
-   `frontend/modules/metaGame/configs/`: A directory containing meta-game configuration files (e.g., `progressBarTest.js`).

#### Responsibilities

-   **Configuration Loading:** Loads a JavaScript-based configuration file specified by the `metaGamePanel`. This configuration file defines the entire logic for the meta-game scenario.
-   **Event Orchestration:** Dynamically sets up event listeners on the `eventDispatcher` and `eventBus` based on the loaded configuration.
-   **Action Execution:** When a configured event is triggered, the `MetaGame` module executes a sequence of actions defined in the configuration. Supported actions include:
    -   Creating, showing, and hiding progress bars via the `ProgressBar` module.
    -   Stopping or continuing the propagation of events through the `eventDispatcher` chain.
    -   Forwarding events to other modules after a delay (e.g., after a progress bar completes).
-   **Dynamic Event Registration:** It can dynamically register and unregister event handlers, allowing for complex, stateful scenarios where the available actions change as the player progresses.

#### Events Published

-   **`eventBus`**:
    -   `metaGame:configurationLoaded`: Published when a new meta-game configuration file has been successfully loaded and processed.
    -   `metaGame:ready`: Published after the module has been initialized and is ready to load a configuration.
    -   `progressBar:create`, `progressBar:show`, `progressBar:hide`, `progressBar:destroy`: Publishes events to control the `ProgressBar` module.
    -   It also dynamically publishes the unique `startEvent` for each progress bar it creates (e.g., `metaGame:regionMoveBarStart`).

#### Events Subscribed To

-   **`eventDispatcher`**:
    -   The `MetaGame` module dynamically registers handlers for any event specified in its loaded configuration (e.g., `user:regionMove`, `user:locationCheck`). This allows it to intercept user actions to trigger its scripted sequences.
-   **`eventBus`**:
    -   It dynamically subscribes to the unique `completionEvent` of each progress bar it creates (e.g., `metaGame:regionMoveBarComplete`) to know when to proceed to the next action in a sequence.

#### Public Functions (`centralRegistry`)

-   **`loadConfiguration(filePath)`**: The primary public function. Tells the module to load and apply a new meta-game configuration from the specified file path.
-   **`updateJSONConfiguration(jsonData)`**: Applies a JSON object to the currently loaded configuration, allowing for live updates.
-   **`getStatus()`**: Returns the current status of the module, including whether it's initialized and has a configuration loaded.
-   **`clearConfiguration()`**: Unloads the current configuration and cleans up all dynamically registered event handlers.

#### Dependencies & Interactions

-   **`metaGamePanel` Module**: This UI panel is the primary way a user interacts with the `MetaGame` module, allowing them to select and load different configuration files.
-   **`ProgressBar` & `progressBarPanel` Modules**: The `MetaGame` module is a major consumer of the progress bar system. It creates progress bars and renders them inside the `progressBarPanel` to provide visual feedback for its scripted actions.
-   **`eventDispatcher`**: The module's core functionality relies on its ability to register as a high-priority handler for user action events on the `eventDispatcher`, allowing it to intercept and manage these actions before they are processed by other modules.