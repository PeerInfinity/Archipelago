### Module: `Window Adapter`

-   **ID:** `windowAdapter`
-   **Purpose:** Provides the core logic for establishing and managing a two-way communication bridge between the main application and external web content running in a separate browser window (`window.open`). It allows window-based modules to interact with the main application's state and event systems.

---

#### Key Files

-   `frontend/modules/windowAdapter/index.js`: The module's entry point for registration and initialization.
-   `frontend/modules/windowAdapter/windowAdapterCore.js`: The `WindowAdapterCore` class that manages all connected windows, handles message routing, and bridges events.
-   `frontend/modules/windowAdapter/communicationProtocol.js`: Defines the standardized message types and validation functions for all `postMessage` communication between the main app and separate windows.

#### Responsibilities

-   **Establish Communication:** Listens for `WINDOW_READY` messages from clients in separate windows. Upon receiving one, it completes a handshake by sending an `ADAPTER_READY` message back, establishing a trusted communication channel.
-   **Window Registry:** Maintains a registry of all active and connected window clients, each identified by a unique ID.
-   **Event Bridging:**
    -   **Main App to Window:** Listens for all events on the main application's `eventBus` and forwards them to any separate window that has subscribed to that specific event.
    -   **Window to Main App:** Listens for `PUBLISH_EVENT_BUS` messages from windows and publishes the corresponding event on the main application's `eventBus`.
-   **State Bridging:** Handles requests from separate windows for the latest `StateManager` snapshot and static game data, enabling external windows to stay in sync with the main application's state.
-   **Heartbeat Monitoring:** Manages a heartbeat system to detect if a separate window becomes unresponsive or is closed, and cleans up the connection if it times out.
-   **Dynamic Publisher Registration:** When a separate window publishes an event, the adapter dynamically registers the window as a publisher for that event in the main app's `centralRegistry`.

#### Events Published

-   **`eventBus`**:
    -   `window:connected`: Published when a separate window successfully completes the handshake.
    -   `window:disconnected`: Published when a window is unregistered (either by timeout or being closed).
    -   It also re-publishes any event it receives from a connected window.

#### Events Subscribed To

-   **`eventBus`**:
    -   `*` (Wildcard): The adapter subscribes to **all** events on the main `eventBus` so it can forward them to any interested window clients.
-   **`window` `message` event**: This is the low-level browser event it listens to for all incoming `postMessage` communication from separate windows.

#### Public Functions (`centralRegistry`)

This module is a core service and does not register public functions for other modules to call.

#### Dependencies & Interactions

-   **`windowPanel` Module**: The `windowPanel` is a UI element that displays the status of a window opened by the `windowManagerPanel`. It relies on the events published by the `windowAdapter` to update its status.
-   **`windowManagerPanel` Module**: This UI panel allows users to open URLs in new windows. The `windowAdapter` then automatically detects and connects to the client running in the newly opened window.
-   **`eventBus` & `eventDispatcher`**: The adapter is deeply integrated with the main eventing systems, acting as a two-way bridge to allow separate windows to participate as if they were native modules.
-   **`StateManager`**: The adapter provides a read-only bridge to the `StateManager` by handling requests for state snapshots and static data from connected windows.