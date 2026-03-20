### Module: `ProgressBar`

-   **ID:** `progressBar`
-   **Purpose:** Provides the core logic for creating and managing multiple, independent, and configurable progress bars. It is a utility module that does not have its own UI panel but creates UI elements that are hosted by other panels.

---

#### Key Files

-   `frontend/modules/progressBar/index.js`: The module's entry point for registration and event handling.
-   `frontend/modules/progressBar/progressBarLogic.js`: Contains the `ProgressBarManager` and `ProgressBar` classes, which handle the creation, logic, and UI rendering for each progress bar instance.

#### Responsibilities

-   **Dynamic Creation:** Listens for a `progressBar:create` event on the `eventBus`. When this event is received, it instantiates and renders a new progress bar based on the configuration provided in the event payload.
-   **Instance Management:** The `ProgressBarManager` can manage multiple progress bar instances simultaneously, each identified by a unique ID.
-   **Multiple Modes:** Supports two primary modes of operation for each progress bar:
    -   **Timer Mode:** The progress bar fills up over a specified duration.
    -   **Event Mode:** The progress bar's value is controlled by external `progressBar:update` events.
-   **Event-Driven Control:** Each progress bar instance can be configured with a unique `startEvent` and `completionEvent`. It will begin filling upon receiving its `startEvent` and will publish its `completionEvent` when it is full.
-   **UI Rendering:** Each `ProgressBar` instance creates its own self-contained DOM element, which includes a text label and the progress bar itself. This element is then appended to a `targetElement` specified during creation.

#### Events Published

-   **`progressBar:completed`**: A generic event published when any progress bar completes.
-   **`progressBar:started`**: A generic event published when any progress bar starts.
-   **`progressBar:updated`**: A generic event published when any progress bar's value changes.
-   **Custom `completionEvent`**: Each progress bar instance publishes its own unique, configurable completion event (e.g., `metaGame:regionMoveBarComplete`) when it finishes. The payload for this event is also configurable.

#### Events Subscribed To

-   **`eventBus`**:
    -   `progressBar:create`: The primary trigger. The payload for this event is a configuration object that defines the new progress bar's ID, mode, duration, events, and target DOM element.
    -   `progressBar:update`: Used to manually update the value of a progress bar running in 'event' mode.
    -   `progressBar:show`: Makes a specific progress bar visible.
    -   `progressBar:hide`: Hides a specific progress bar.
    -   `progressBar:destroy`: Removes a specific progress bar and cleans up its resources.
    -   **Custom `startEvent`**: Each progress bar instance listens for its own unique start event.

#### Public Functions (`centralRegistry`)

The module registers public functions that allow for direct, programmatic control over progress bars as an alternative to the event-based system:

-   **`createProgressBar(config)`**: Creates a new progress bar.
-   **`updateProgressBar(id, value, max, text)`**: Updates an existing progress bar.
-   **`showProgressBar(id)`**: Shows a progress bar.
-   **`hideProgressBar(id)`**: Hides a progress bar.
-   **`destroyProgressBar(id)`**: Destroys a progress bar.

#### Dependencies & Interactions

-   **Event Bus**: The `ProgressBar` module is fundamentally event-driven and relies on the `eventBus` for both its creation and its operation.
-   **Host Panels (`progressBarPanel`, `metaGamePanel`):** This module creates UI elements but does not have its own panel. Other modules, like `progressBarPanel`, provide a dedicated container (`targetElement`) where the progress bar UI can be rendered.
-   **`MetaGame` Module**: A primary consumer of this module. The `MetaGame` logic creates and starts progress bars to provide visual feedback for scripted event sequences, and it listens for their custom `completionEvent` to know when to proceed to the next action.