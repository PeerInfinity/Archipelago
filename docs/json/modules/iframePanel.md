### Module: `Iframe Panel`

-   **ID:** `iframePanel`
-   **Purpose:** Provides a generic, reusable Golden Layout panel designed to host external web content within an `<iframe>` element. It works in tandem with the `iframeAdapter` to connect the hosted content to the main application.

---

#### Key Files

-   `frontend/modules/iframePanel/index.js`: The module's entry point for registration.
-   `frontend/modules/iframePanel/iframePanelUI.js`: The UI class that creates and manages the `<iframe>` element and its lifecycle within the Golden Layout panel.

#### Responsibilities

-   **Create a Golden Layout Panel:** Registers a generic `iframePanel` component with Golden Layout, allowing one or more iframe containers to be placed in the user's layout.
-   **Load Content:** Listens for a `iframe:loadUrl` event. When received, it creates an `<iframe>` element and sets its `src` attribute to the specified URL. It also appends a unique `iframeId` as a URL parameter to help the `iframeAdapter` identify it.
-   **Display Status:** Shows the current status of the iframe, such as "Loading...", "Connected", or "Error".
-   **Unload Content:** Listens for an `iframe:unload` event to remove the `<iframe>` element, effectively clearing the panel and disconnecting the external content.
-   **Lifecycle Management:** Manages the lifecycle of the `<iframe>` element, ensuring it is properly created and destroyed along with its parent Golden Layout panel.

#### Events Published

-   **`eventBus`**:
    -   `iframePanel:loaded`: Published when the `<iframe>` has loaded its content and its internal client has successfully connected to the `iframeAdapter`.
    -   `iframePanel:unloaded`: Published when the `<iframe>` is removed from the panel.
    -   `iframePanel:error`: Published if the `<iframe>` fails to load or if a connection timeout occurs.

#### Events Subscribed To

-   **`eventBus`**:
    -   `iframe:loadUrl`: The primary trigger for this module to load content into its `<iframe>`. The event payload must contain a `url`.
    -   `iframe:unload`: The trigger for this module to remove its `<iframe>` and reset to its empty state.
-   **`window` `message` event**: The `IframePanelUI` listens to this low-level event to detect the initial `IFRAME_READY` message from its specific `iframe` child, which confirms a successful connection.

#### Public Functions (`centralRegistry`)

This module is self-contained and controlled by events; it does not register any public functions.

#### Dependencies & Interactions

-   **`iframeAdapter` Module**: This is the panel's most critical counterpart. The `iframePanel` creates the `<iframe>`, but it is the `iframeAdapter` that handles all subsequent communication and event bridging with the content running inside it.
-   **`iframeManagerPanel` Module**: This UI panel is the primary source of `iframe:loadUrl` and `iframe:unload` events. It provides the user-facing controls to load and unload content from `iframePanel` instances.
-   **Golden Layout**: Manages the creation, destruction, and lifecycle of the `iframePanel` itself.