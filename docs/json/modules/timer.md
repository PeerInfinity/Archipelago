### Module: `Timer`

-   **ID:** `timer`
-   **Purpose:** Manages the logic and UI for the automated location checking timer. This module encapsulates the "Begin" / "Stop" functionality, the progress bar, and the "Quick Check" feature. It is designed as a "headless" component whose UI can be hosted within other panels.

---

#### Key Files

-   `frontend/modules/timer/index.js`: The module's entry point, which handles registration and creates the logic/UI instances.
-   `frontend/modules/timer/timerLogic.js`: Contains the core `TimerLogic` class, which handles the timer loop, calculating delays, and determining the next location to check.
-   `frontend/modules/timer/timerUI.js`: The `TimerUI` class, which renders the UI components (progress bar and buttons) and connects them to the `TimerLogic`.

#### Responsibilities

-   **Timer Management:** The `TimerLogic` class is responsible for the core timer loop. When started, it calculates a random delay (within a configurable range) and waits for that duration before acting.
-   **Progress Updates:** While the timer is running, it periodically publishes `timer:progressUpdate` events so the UI can display a smoothly advancing progress bar.
-   **Location Checking:** When the timer completes, `TimerLogic` determines the next accessible, unchecked location by querying the `StateManager`. It then dispatches a `user:locationCheck` event to the `eventDispatcher` to initiate the check.
-   **UI Rendering (`TimerUI`):**
    -   Creates the DOM for the progress bar, the `Checks Sent` counter, the "Begin"/"Stop" button, and the "Quick Check" button.
    -   This UI component is "headless"—it does not create its own panel but is designed to be attached to a placeholder DOM element provided by a host panel (like `clientPanel` or `timerPanel`).
-   **Control Logic:** Handles user interaction with the "Begin", "Stop", and "Quick Check" buttons, calling the appropriate methods on the `TimerLogic` instance.

#### Events Published

-   **`eventBus`**:
    -   `timer:started`: When the main timer begins a new countdown.
    -   `timer:stopped`: When the timer is manually stopped or finishes.
    -   `timer:progressUpdate`: Fired periodically while the timer is running to update the progress bar UI.
-   **`eventDispatcher`**:
    -   `user:locationCheck`: Published when the timer fires or when the "Quick Check" button is clicked. This is the primary output for initiating a game action.

#### Events Subscribed To

-   **`eventBus`**:
    -   `stateManager:rulesLoaded` & `connection:open`: Listens for these to know when to enable the control buttons.
    -   `stateManager:snapshotUpdated`: Listens for state changes to update the "Checks Sent" counter.
    -   `loop:modeChanged`: Listens for this to automatically pause itself if the user enters Archipelago Loops mode.

#### Public Functions (`centralRegistry`)

The `timer` module registers public functions to allow other modules to host and control it:

-   **`attachTimerToHost(placeholderElement)`:** The primary function for the re-homing mechanism. A host panel calls this to provide a DOM element where the `TimerUI` should render itself.
-   **`detachTimerFromHost()`:** Removes the `TimerUI` from its current host.
-   **`setCheckDelay(min, max)`:** Allows the `/set_delay` console command to configure the timer's delay range.

#### Dependencies & Interactions

-   **Host Panels (`clientPanel`, `timerPanel`):** The `Timer` module's UI is not visible unless a host panel is active and calls `attachTimerToHost`. This is managed by the "Dynamic Re-homing" system, orchestrated by a `system:rehomeTimerUI` event on the `eventDispatcher`. The highest-priority visible host panel "claims" and displays the timer UI.
-   **StateManager**: The `TimerLogic` depends on the `StateManager` to determine which locations are currently accessible and unchecked, so it knows what to check next.
-   **EventDispatcher**: It is a primary initiator of the `user:locationCheck` event, which is the core action for checking a location in the game.