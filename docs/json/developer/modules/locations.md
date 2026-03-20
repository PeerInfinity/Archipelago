### Module: `Locations`

- **ID:** `locations`
- **Purpose:** Displays a grid of all item locations in the game, providing a real-time, at-a-glance view of their accessibility based on the player's current inventory and game state.

---

#### Key Files

- `frontend/modules/locations/index.js`: The module's entry point for registration.
- `frontend/modules/locations/locationUI.js`: The UI class that renders the panel, including the grid of location cards and their associated logic trees.

#### Responsibilities

- **Render All Locations:** Fetches the complete list of locations from the `StateManager`'s static data and displays each one as an interactive card.
- **Display Location Information:** For each location, it shows the name, the region it belongs to (with a clickable link), and the player it belongs to in a multiworld game.
- **Show Detailed Accessibility Status:** This is the module's primary function. The color of each location card instantly communicates its status:
  - **Green (`fully-reachable`):** The location's region is accessible, and the location's own access rule is met.
  - **Red (`fully-unreachable`):** The region is inaccessible, and the access rule is not met.
  - **Orange (`location-only-reachable`):** The region is inaccessible, but the item requirements for the location _are_ met.
  - **Yellow (`region-only-reachable`):** The region is accessible, but the item requirements for the location _are not_ met.
  - **Gray (`checked`):** The location has already been checked.
  - **Blue (`pending`):** The user has clicked to check this location, and the UI is awaiting confirmation from the `StateManager`.
- **Visualize Rules:** For each location, it renders a detailed logic tree for its `access_rule`, showing exactly which conditions (items, helpers, etc.) are currently met or unmet.
- **User Interaction:** Allows the user to click on a location card to check it. This action dispatches a `user:locationCheck` event to the `eventDispatcher`.
- **Filtering and Sorting:** Provides UI controls to filter the display by status (Checked, Reachable, Unreachable) and to sort the locations (e.g., by name, accessibility, or original game order).
- **Layout Customization:** Includes controls to change the number of columns in the grid display.

#### Events Published

This module's primary output is dispatching an event.

- **Dispatches to `eventDispatcher`**: `user:locationCheck` when a location card is clicked.

#### Events Subscribed To

- `app:readyForUiDataLoad`: Listens for this to perform initial setup.
- `stateManager:rulesLoaded`: When a new `rules.json` is loaded, the `LocationUI` gets the new static list of all locations and their original order.
- `stateManager:snapshotUpdated`: This is the most important event. On every state change, it receives the new snapshot and re-evaluates/re-renders the accessibility status of all locations.
- `stateManager:locationCheckRejected`: Listens for this to clear the "pending" state on a location if the `StateManager` rejected the check (e.g., it became inaccessible before the command was processed).
- `settings:changed`: Listens for changes to `colorblindMode` to update its display.

#### Public Functions (`centralRegistry`)

This module does not register any public functions.

#### Dependencies & Interactions

- **StateManager**: The `Locations` module is fundamentally dependent on the `StateManager`. It gets the static list of all locations from the `staticDataCache` and uses the `createSnapshotInterface` method to evaluate the `access_rule` for every location during each render cycle.
- **EventDispatcher**: It is a primary initiator of the `user:locationCheck` event, which is the core action for checking a location in the game.
- **CommonUI**: It makes extensive use of `commonUI.renderLogicTree` to display the accessibility rules and `commonUI.createRegionLink` to create clickable links to each location's parent region.
