### Module: `Player State Panel`

-   **ID:** `playerStatePanel`
-   **Purpose:** Provides a simple UI panel to display the player's current state, such as their current region in the game world. It acts as a visual front-end for the `playerState` module.

---

#### Key Files

-   `frontend/modules/playerStatePanel/index.js`: The module's entry point for registration.
-   `frontend/modules/playerStatePanel/playerStatePanelUI.js`: The UI class that renders the panel's content.

#### Responsibilities

-   Renders a Golden Layout panel to display player state information.
-   Shows the player's current region in real-time.
-   Automatically updates its display whenever the player's region changes.
-   Resets its display to the starting region when a new game (`rules.json`) is loaded.

#### Events Published

This module is for display purposes only and does not publish any events.

#### Events Subscribed To

-   **`eventBus`**:
    -   `playerState:regionChanged`: This is the primary trigger for the panel to update its content. It listens for this event to know when to fetch and display the new current region.
    -   `stateManager:rulesLoaded`: Listens for this event to update its display with the initial state when a new game starts.

#### Public Functions (`centralRegistry`)

This module does not register any public functions.

#### Dependencies & Interactions

-   **`playerState` Module**: This is the panel's primary dependency. It uses the `centralRegistry` to call the `getCurrentRegion` public function provided by the `playerState` module to get the data it displays.
-   **`StateManager` Module**: It has an indirect dependency on the `StateManager`. It listens for the `stateManager:rulesLoaded` event to know when a new game has been loaded, which prompts it to display the initial player state.
-   **Golden Layout**: As a UI panel, its lifecycle (creation, destruction, visibility) is managed by the Golden Layout framework.