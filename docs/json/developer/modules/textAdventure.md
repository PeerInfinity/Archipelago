### Module: `Text Adventure`

-   **ID:** `textAdventure`
-   **Purpose:** Provides a classic text-based adventure interface for interacting with the game world, acting as a practical demonstration of module integration.

---

#### Key Files

-   `frontend/modules/textAdventure/index.js`: The module's entry point for registration and event handler setup.
-   `frontend/modules/textAdventure/textAdventureUI.js`: The UI class that renders the panel, including the text display area and command input.
-   `frontend/modules/textAdventure/textAdventureLogic.js`: Contains the core logic for processing commands, querying game state, and generating descriptive messages.
-   `frontend/modules/textAdventure/textAdventureParser.js`: Handles the parsing of raw user text input into structured commands.

#### Responsibilities

-   **UI Rendering:** Renders a Golden Layout panel with a scrollable text area for messages and an input field for user commands.
-   **Command Parsing:** Interprets user-typed commands such as `move <exit>`, `check <location>`, `inventory`, and `look`.
-   **State-Driven Display:** Presents information to the user based on the current game state, including:
    -   The player's current region name.
    -   A list of locations and exits in the current region.
    -   The player's current inventory.
-   **Interactive & Accessible Text:** Makes all location and exit names within the text display clickable. The color of these links is updated in real-time to reflect their accessibility status (e.g., green for accessible, red for inaccessible).
-   **Customization:** Supports the loading of an optional, game-specific JSON file to provide custom "flavor text" for regions, locations, exits, and items, falling back to generic descriptions if no custom text is available.

#### Events Published

-   **`eventDispatcher`**:
    -   `user:regionMove`: Dispatched when the user successfully enters a move command (either by typing or clicking an exit link).
    -   `user:locationCheck`: Dispatched when the user enters a check command (either by typing or clicking a location link).
-   **`eventBus`**:
    -   `textAdventure:messageAdded`: Published internally when a new message is added to the display, allowing the UI to update.
    -   `textAdventure:customDataLoaded`: Published when a custom flavor text file is successfully loaded.

#### Events Subscribed To

-   **`eventBus`**:
    -   `playerState:regionChanged`: This is the primary trigger for the module to display the description of a new region after the player moves.
    -   `stateManager:rulesLoaded`: Listens for this event to perform its initial setup and display the starting region message.
    -   `stateManager:snapshotUpdated`: Listens for any change in the game state to refresh the color-coding of all visible location and exit links.

#### Public Functions (`centralRegistry`)

This module is self-contained and does not register any public functions for other modules to call.

#### Dependencies & Interactions

-   **`playerState` Module**: This is the source of truth for the player's current location. The `textAdventure` module queries `playerState.getCurrentRegion()` to determine what to display.
-   **`stateManager` Module**: Used extensively to get static data (the list of locations and exits within a region) and to evaluate the real-time accessibility of those locations and exits for color-coding the interactive links.
-   **`discoveryState` Module**: If enabled via a custom data file, this module will query `discoveryState` to determine which locations and exits have been "discovered" and should be visible to the player.
-   **`eventDispatcher`**: This is the primary output for user actions. When a user checks a location or moves through an exit, the `textAdventure` module dispatches the appropriate event into the system's prioritized chain of command for processing.