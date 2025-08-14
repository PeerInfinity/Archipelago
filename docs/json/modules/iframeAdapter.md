### Module: `Iframe Adapter`

-   **ID:** `iframeAdapter`
-   **Purpose:** Provides the core logic for establishing and managing a two-way communication bridge between the main application and external web content running inside an `<iframe>`. It allows `iframe`-based modules to interact with the main application's state and event systems.

---

#### Key Files

-   `frontend/modules/iframeAdapter/index.js`: The module's entry point for registration and initialization.
-   `frontend/modules/iframeAdapter/iframeAdapterCore.js`: The `IframeAdapterCore` class that manages all connected iframes, handles message routing, and bridges events.
-   `frontend/modules/iframeAdapter/communicationProtocol.js`: Defines the standardized message types and validation functions for all `postMessage` communication between the main app and iframes.

#### Responsibilities

-   **Establish Communication:** Listens for `IFRAME_READY` messages from `iframe` clients. Upon receiving one, it completes a handshake by sending an `ADAPTER_READY` message back, establishing a trusted communication channel.
-   **Iframe Registry:** Maintains a registry of all active and connected `iframe` clients, each identified by a unique ID.
-   **Event Bridging:**
    -   **Main App to Iframe:** Listens for all events on the main application's `eventBus` and forwards them to any `iframe` that has subscribed to that specific event.
    -   **Iframe to Main App:** Listens for `PUBLISH_EVENT_BUS` messages from iframes and publishes the corresponding event on the main application's `eventBus`. This allows an iframe to trigger actions in the main app.
-   **State Bridging:** Handles requests from iframes for the latest `StateManager` snapshot and static game data, ensuring that iframe-based modules can access and display up-to-date game state information.
-   **Heartbeat Monitoring:** Manages a heartbeat system to detect if an `iframe` becomes unresponsive or is closed, and cleans up the connection if it times out.
-   **Dynamic Publisher Registration:** When an iframe publishes an event, the adapter dynamically registers the iframe as a publisher for that event in the main app's `centralRegistry` for debugging and tracking purposes.

#### Events Published

-   **`eventBus`**:
    -   `iframe:connected`: Published when an iframe successfully completes the handshake and is registered with the adapter.
    -   `iframe:disconnected`: Published when an iframe is unregistered (either by timeout or explicit unload).
    -   It also re-publishes any event it receives from a connected iframe (e.g., if an iframe publishes `playerState:regionChanged`, the adapter publishes that same event on the main `eventBus`).

#### Events Subscribed To

-   **`eventBus`**:
    -   `*` (Wildcard): The adapter subscribes to **all** events on the main `eventBus` so it can forward them to any interested iframe clients.
-   **`window` `message` event**: This is the low-level browser event it listens to for all incoming `postMessage` communication from `iframe` elements.

#### Public Functions (`centralRegistry`)

This module is a core service and does not register public functions for other modules to call. Other modules interact with it via the `iframePanel` or by directly embedding an iframe and following the communication protocol.

#### Dependencies & Interactions

-   **`iframePanel` Module**: The `iframePanel` is the primary consumer of this adapter. It creates the `<iframe>` element and is responsible for loading content into it. The `iframeAdapter` then automatically detects and connects to the client running inside the `iframePanel`.
-   **`iframeManagerPanel` Module**: This UI panel allows users to load different URLs into `iframePanel` instances, indirectly utilizing the `iframeAdapter` to connect to the new content.
-   **`eventBus` & `eventDispatcher`**: The adapter is deeply integrated with the main eventing systems, acting as a two-way bridge to allow iframes to participate as if they were native modules.
-   **`StateManager`**: The adapter provides a read-only bridge to the `StateManager` by handling requests for state snapshots and static data from connected iframes.