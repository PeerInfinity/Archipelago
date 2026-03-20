### Module: `Window Manager Panel`

-   **ID:** `windowManagerPanel`
-   **Purpose:** Provides a user interface for managing separate browser windows. It allows users to open content from a URL or a list of predefined pages in a new window that connects back to the main application via the `windowAdapter`.

---

#### Key Files

-   `frontend/modules/windowManagerPanel/index.js`: The module's entry point for registration.
-   `frontend/modules/windowManagerPanel/windowManagerUI.js`: The UI class that renders the panel and handles user interactions.

#### Responsibilities

-   **Render UI Panel:** Displays a Golden Layout panel with controls for managing separate windows.
-   **Provide Content Sources:** Offers two ways for users to select content to open:
    1.  A text input field for any custom URL.
    2.  A dropdown menu populated with a list of "known pages" suitable for running in a separate window.
-   **Open Windows:** Provides an "Open Window" button that uses `window.open()` to launch the selected URL in a new browser window or tab. It also publishes a `window:loadUrl` event, which can be used by `windowPanel` instances to track the opened window.
-   **Close Windows:** Provides a "Close All" button that publishes a `window:close` event to instruct all connected windows to close themselves.
-   **Display Status:** Shows the current status of connected windows by listening to events from the `windowAdapter`. It maintains and displays a list of all window clients that have successfully connected to the main application.

#### Events Published

-   **`eventBus`**:
    -   `window:loadUrl`: Published when the "Open Window" button is clicked. The payload contains the `url` to be opened. This can be used by a `windowPanel` to associate itself with the newly opened window.
    -   `window:close`: Published when the "Close All" button is clicked, signaling all connected windows to terminate.

#### Events Subscribed To

-   **`eventBus`**:
    -   `window:connected`: Listens for this event from the `windowAdapter` to add a window to its list of connected clients.
    -   `window:disconnected`: Listens for this event from the `windowAdapter` to remove a window from its list.
    -   `windowPanel:opened`, `windowPanel:closed`, `windowPanel:error`: Listens for these events to provide user feedback in its status display area.

#### Public Functions (`centralRegistry`)

This module is self-contained and does not register any public functions.

#### Dependencies & Interactions

-   **`windowPanel` Module**: This module works in concert with `windowPanel` instances. It opens the external windows, and the `windowPanel` provides a space within the main UI to display the status of those external windows.
-   **`windowAdapter` Module**: It indirectly depends on the `windowAdapter` by listening for the `window:connected` and `window:disconnected` events that the adapter publishes. This allows the manager panel to know the real-time connection status of all separate windows.
-   **Golden Layout**: Manages the lifecycle and display of the `windowManagerPanel` itself.