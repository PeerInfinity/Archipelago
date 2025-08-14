### Module: `PlayerState`

-   **ID:** `playerState`
-   **Purpose:** Tracks player-specific state information that is separate from the core game logic, such as the player's current region in the game world. This is primarily used by UI-centric modules like the Text Adventure.

---

#### Key Files

-   `frontend/modules/playerState/index.js`: The module's entry point for registration and event handling.
-   `frontend/modules/playerState/state.js`: Defines the `PlayerState` class, which contains the core logic for state tracking.
-   `frontend/modules/playerState/singleton.js`: Creates and exports a singleton instance of the `PlayerState` class for global access.

#### Responsibilities

-   Maintains the player's current region (e.g., "Light World", "Death Mountain").
-   Provides methods to get and set the player's current region.
-   Publishes an event whenever the player's region changes, allowing other modules to react.
-   Automatically resets the player's region to the default starting area ("Menu") whenever a new `rules.json` file is loaded.

#### Events Published

-   **`playerState:regionChanged`**: Published on the `eventBus` whenever the player's current region is updated. The event payload includes `{ oldRegion, newRegion }`.

#### Events Subscribed To

-   **`eventDispatcher`**:
    -   `user:regionMove`: Listens for this event to know when to update the player's current region to the destination of the move. It updates its state and then propagates the event for other modules to process.
-   **`eventBus`**:
    -   `stateManager:rulesLoaded`: Listens for this event to reset its state, ensuring the player is always at the correct starting region when a new game begins.

#### Public Functions (`centralRegistry`)

The `playerState` module registers public functions so that other modules can query its state:

-   **`getCurrentRegion()`**: Returns the name of the player's current region as a string.
-   **`getState()`**: Returns the entire `PlayerState` singleton instance.

#### Dependencies & Interactions

-   **StateManager**: The `playerState` module listens for the `stateManager:rulesLoaded` event to know when to reset. It does not send any commands to the `StateManager`.
-   **TextAdventure Module**: A primary consumer of this module. The `textAdventure` module calls `getCurrentRegion()` to determine which area's description, locations, and exits to display to the user.
-   **EventDispatcher**: It is a key participant in the `user:regionMove` event chain. It intercepts move commands, updates its own internal state, and then passes the event along so that other modules (like the `StateManager` or `Client`) can handle the core logic of the move.