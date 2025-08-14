### Module: `Iframe Manager Panel`

-   **ID:** `iframeManagerPanel`
-   **Purpose:** Provides a user interface for managing `iframePanel` instances. It allows users to load content from a URL or a list of predefined pages into any available `iframePanel`.

---

#### Key Files

-   `frontend/modules/iframeManagerPanel/index.js`: The module's entry point for registration.
-   `frontend/modules/iframeManagerPanel/iframeManagerUI.js`: The UI class that renders the panel and handles user interactions.

#### Responsibilities

-   **Render UI Panel:** Displays a Golden Layout panel with controls for managing iframe content.
-   **Provide Content Sources:** Offers two ways for users to select content:
    1.  A text input field for any custom URL.
    2.  A dropdown menu populated with a list of "known pages" (e.g., standalone Text Adventure, test pages) for convenience.
-   **Load Content:** Provides a "Load Iframe" button that publishes an `iframe:loadUrl` event. Any available `iframePanel` instance can listen for this event and load the specified URL.
-   **Unload Content:** Provides an "Unload All" button that publishes an `iframe:unload` event to clear all active `iframePanel` instances.
-   **Display Status:** Shows the current status of connected iframes by listening to events from the `iframeAdapter`. It maintains and displays a list of all `iframe` clients that have successfully connected to the main application.

#### Events Published

-   **`eventBus`**:
    -   `iframe:loadUrl`: Published when the "Load Iframe" button is clicked. The payload contains the `url` to be loaded.
    -   `iframe:unload`: Published when the "Unload All" button is clicked.

#### Events Subscribed To

-   **`eventBus`**:
    -   `iframe:connected`: Listens for this event from the `iframeAdapter` to add an iframe to its list of connected clients.
    -   `iframe:disconnected`: Listens for this event from the `iframeAdapter` to remove an iframe from its list.
    -   `iframePanel:loaded`, `iframePanel:unloaded`, `iframePanel:error`: Listens for these events to provide user feedback in its status display area.

#### Public Functions (`centralRegistry`)

This module is self-contained and does not register any public functions.

#### Dependencies & Interactions

-   **`iframePanel` Module**: This is the module that the `iframeManagerPanel` controls. It sends `iframe:loadUrl` and `iframe:unload` events that `iframePanel` instances are designed to receive and act upon.
-   **`iframeAdapter` Module**: It indirectly depends on the `iframeAdapter` by listening for the `iframe:connected` and `iframe:disconnected` events that the adapter publishes. This allows the manager panel to know the real-time connection status of all iframes.
-   **Golden Layout**: Manages the lifecycle and display of the `iframeManagerPanel` itself.