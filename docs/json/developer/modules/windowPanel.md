### Module: `Window Panel`

-   **ID:** `windowPanel`
-   **Purpose:** Provides a UI panel within the main application to display the connection status and heartbeat information of a separate browser window managed by the `windowAdapter`.

---

#### Key Files

-   `frontend/modules/windowPanel/index.js`: The module's entry point for registration.
-   `frontend/modules/windowPanel/windowPanelUI.js`: The UI class that renders the panel's content, including status indicators.

#### Responsibilities

-   **Create a Golden Layout Panel:** Registers a `windowPanel` component with Golden Layout, allowing a dedicated status display to be placed in the user's layout.
-   **Display Connection Status:** Shows whether a separate window is currently connected to the main application's `windowAdapter`.
-   **Track Heartbeats:** Listens for `HEARTBEAT` messages forwarded by the `windowAdapter` and displays a running count, providing a live indicator of the connection's health.
-   **Display Window ID:** Shows the unique ID of the connected window for identification and debugging purposes.
-   **Associate with an Opened Window:** While it does not open windows itself, it listens for `window:loadUrl` events to know which external window it should be tracking.

#### Events Published

-   **`eventBus`**:
    -   `windowPanel:opened`: Published when the panel is first opened.
    -   `windowPanel:closed`: Published when the panel is closed.
    -   `windowPanel:connected`: Published when it successfully associates with and receives a connection confirmation from a separate window.
    -   `windowPanel:error`: Published if it encounters an error.

#### Events Subscribed To

-   **`eventBus`**:
    -   `window:loadUrl`: Listens for this event from the `windowManagerPanel` to associate itself with a newly opened window.
    -   `window:close`: Listens for this event to know when to reset its status.
    -   `window:connected`: Listens for this event from the `windowAdapter` to update its status to "Connected".
    -   `window:disconnected`: Listens for this event from the `windowAdapter` to update its status to "Disconnected".
-   **`window` `message` event**: The `WindowPanelUI` listens to this low-level event to detect `HEARTBEAT` messages from its associated window.

#### Public Functions (`centralRegistry`)

This module is self-contained and controlled by events; it does not register any public functions.

#### Dependencies & Interactions

-   **`windowAdapter` Module**: This is the panel's most critical counterpart. The `windowAdapter` manages the actual communication with the separate window and publishes the `window:connected` and `window:disconnected` events that this panel relies on for its status display. It also forwards heartbeat messages.
-   **`windowManagerPanel` Module**: This UI panel is the source of the `window:loadUrl` and `window:close` events that the `windowPanel` listens to in order to manage its lifecycle and association with an external window.
-   **Golden Layout**: Manages the creation, destruction, and lifecycle of the `windowPanel` itself.