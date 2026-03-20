### Module: `Exits`

- **ID:** `exits`
- **Purpose:** Displays a comprehensive list of all region exits (transitions between regions) in the game, showing their real-time accessibility status and the logic required to traverse them.

---

#### Key Files

- `frontend/modules/exits/index.js`: The module's entry point for registration.
- `frontend/modules/exits/exitUI.js`: The UI class that renders the panel, including the grid of exit cards and their associated logic trees.

#### Responsibilities

- **Render All Exits:** Fetches the complete list of exits from the `StateManager`'s static data and displays each one as an interactive card in a configurable grid.
- **Display Exit Information:** For each exit, it clearly shows the source region, the exit's name, and the destination region (both as clickable links). Shows player number if present.
- **Show Accessibility Status:** Uses color-coding to show whether an exit is traversable (green), non-traversable due to rules or region inaccessibility (red), or in an unknown state (gray). Displays a human-readable status text: "Traversable", "Rule Fails", "To Locked Region", "From Locked Region, Rule OK", or "Fully Locked".
- **Visualize Rules:** For each exit, it renders a detailed logic tree for its `access_rule`, showing exactly which conditions (items, helpers, etc.) are met or unmet based on the player's current inventory.
- **Filtering and Sorting:** Provides UI controls including:
  - Search input to filter exits by name, source region, or destination region
  - Sort dropdown with options: Original Order, Sort by Name, Sort by Accessibility (Original), Sort by Accessibility (Name)
  - Filter checkboxes: Show Traversable, Show Non-Traversable
  - Discovery mode filters: Show Explored, Show Undiscovered (visible only when discovery mode is active)
- **Column Controls:** Configurable grid columns from 1 to 10 via +/- buttons.
- **Discovery Mode Integration:** When discovery mode is active, undiscovered exits show as "???" placeholders with minimal information (unless `showUndiscoveredDetails` is enabled). The `[E]` badge indicates explored exits.
- **Exit Click Handling:** Clicking an exit card publishes both `ui:exitClicked` (eventBus) and `user:exitClicked` (dispatcher). The dispatcher event is published with 'bottom' priority, allowing the Loops module or other interceptors to handle it before the default Regions module handler.

#### Events Published

- `ui:exitClicked`: Published to eventBus when an exit card is clicked. Payload: `{ exitName, sourceRegion, destinationRegion }`.
- `user:exitClicked`: Published to eventDispatcher with 'bottom' priority. Payload: `{ exitName, sourceRegion, destinationRegion, accessRule, isDiscovered }`.

#### Events Subscribed To

- `stateManager:ready`: Triggers initial full display update and validates originalExitOrder.
- `stateManager:snapshotUpdated`: Debounced (50ms) display update on every state change.
- `stateManager:rulesLoaded`: Fetches new originalExitOrder; triggers full display update.
- `loop:stateChanged`: Debounced display update when loop state changes.
- `loop:actionCompleted`: Debounced display update when loop action completes.
- `discovery:changed`: Debounced display update when discovery state changes.
- `discovery:modeChanged`: Updates `isDiscoveryModeActive` flag; toggles visibility of explored/undiscovered checkboxes.
- `discovery:settingsChanged`: Updates cached discovery settings.
- `settings:changed`: Handles `colorblindMode.exits` changes.

#### Public Functions (`centralRegistry`)

This module does not register any public functions.

#### Dependencies & Interactions

- **StateManager**: Gets the static list of all exits from `staticDataCache` and uses `createSnapshotInterface` to evaluate the `access_rule` for every exit during each render cycle.
- **CommonUI**: Makes extensive use of `commonUI.renderLogicTree` to display the accessibility rules and `commonUI.createRegionLink` to create clickable links for the source and destination regions.
- **Discovery State**: Queries `discoveryStateSingleton` to determine exit and region discovery status for filtering and placeholder display.
- **Event Dispatcher**: Exit clicks are dispatched with 'bottom' priority, allowing the Loops module or Regions module to intercept and handle the action through the dispatcher's priority chain (no direct `loopStateSingleton` dependency).
