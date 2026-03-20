### Module: `Client`

-   **ID:** `client`
-   **Purpose:** Manages the WebSocket connection to the Archipelago server, processes incoming messages, sends client commands, and provides the primary UI for server interaction.

---

#### Key Files

-   `frontend/modules/client/index.js`: Module entry point, registration, and dispatcher handler setup.
-   `frontend/modules/client/ui/mainContentUI.js`: The UI class for the main console and connection panel.
-   `frontend/modules/client/core/connection.js`: Handles the low-level WebSocket connection, including connection, disconnection, and reconnection logic.
-   `frontend/modules/client/core/messageHandler.js`: Processes all incoming messages from the server (e.g., `Connected`, `ReceivedItems`, `PrintJSON`) and updates the application state accordingly.
-   `frontend/modules/client/utils/idMapping.js`: Provides utility functions to map server-side numeric IDs for items and locations to their human-readable names using the data package.

#### Responsibilities

-   Establishes and maintains a WebSocket connection to an Archipelago server.
-   Handles the authentication handshake (`Connect` command).
-   Requests and processes the game's `DataPackage` for ID-to-name mappings.
-   Listens for and processes all incoming server messages.
-   Updates the `StateManager` (via commands to its proxy) with state changes received from the server, such as received items or locations checked by other players.
-   Sends commands to the server, such as location checks (`LocationChecks`), chat messages (`Say`), and status updates.
-   Provides the main UI panel for server connection, console output, and command input.
-   Acts as a primary "host" for the `Timer` module's UI, providing a placeholder for the progress bar and control buttons.

#### Events Published

While most of its actions result in calls to the `StateManager` (which then publishes state changes), the `Client` module's core components publish key network status events on the `eventBus`:

-   `game:connected`: Published when the connection and authentication handshake is successfully completed.
-   `game:roomInfo`: Published when server room information is received.
-   `network:connectionRefused`: Published when the server refuses the connection attempt.

#### Events Subscribed To

-   **`eventDispatcher`**:
    -   `user:locationCheck`: Acts as the highest-priority handler for location check requests when connected to a server. It gets the server ID for the location and sends the check command. If not connected, it propagates the event for local handling.
    -   `user:itemCheck`: Handles manual item checks by sending a `!getitem` command to the server when connected. If not connected, it propagates the event.
    -   `system:rehomeTimerUI`: Participates in the "re-homing" process for the Timer UI, offering its panel as a potential host.
-   **`eventBus`**:
    -   The internal `messageHandler` listens to `connection:open`, `connection:close`, and `connection:message` events from the `connection` object to process server data.

#### Public Functions (`centralRegistry`)

This module does not register any public functions for other modules to call. Interactions are primarily handled through the `eventDispatcher`.

#### Dependencies & Interactions

-   **StateManager**: The `Client` module is a primary driver of state changes. It calls methods like `stateManagerProxySingleton.addItemToInventory()` when `ReceivedItems` packets arrive and `stateManagerProxySingleton.checkLocation()` for server-side location updates. It also reads static data from the `StateManager` to map location names to server IDs.
-   **EventDispatcher**: It is a key participant in the `user:locationCheck` and `user:itemCheck` event chains, acting as the authoritative handler when an online session is active.
-   **Timer Module**: The `Client` module's `mainContentUI` acts as a host for the `TimerUI` component. It provides a DOM element where the timer's progress bar and buttons are rendered, a process managed by the `system:rehomeTimerUI` dispatched event.