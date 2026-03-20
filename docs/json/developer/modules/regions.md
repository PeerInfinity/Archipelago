### Module: `Regions`

- **ID:** `regions`
- **Purpose:** Displays the game world organized by its regions. It serves as the primary tool for exploring the game's map, understanding connections between regions, and analyzing the requirements to traverse them.

---

#### Key Files

- `frontend/modules/regions/index.js`: The module's entry point for registration.
- `frontend/modules/regions/regionUI.js`: The UI class that renders the panel, including the collapsible region blocks and their contents.

#### Responsibilities

- **Render Region Hierarchy:** Displays the game's regions as a list of collapsible blocks. By default, it shows a "path view," starting with the "Menu" region and adding new regions as the user navigates through exits. An option to "Show All Regions" is available to display every region at once.
- **Display Region Contents:** Inside each region block, it lists all of the **exits** leading out of that region and all of the **locations** contained within it.
- **Show Real-Time Accessibility:**
  - The region header is color-coded to indicate if the region is currently reachable.
  - Each exit and location listed is also styled to show its individual accessibility status based on the current game state.
- **Visualize Rules:** It uses `commonUI` to render the detailed logic trees for each exit and location, allowing the user to see precisely why an element is or isn't accessible.
- **Enable Navigation:** Each exit has a "Move" button. In the default path view, clicking this button collapses the current region and appends the destination region to the bottom of the view, simulating movement through the world.
- **Path Analysis Integration:** Each region block contains an **"Analyze Paths"** button. Clicking this invokes the `Path Analyzer` module to perform a deep analysis and display all possible paths and requirements to reach that specific region.
- **Interactive Navigation:** The `RegionUI` listens for `ui:navigateToRegion` events, allowing it to automatically scroll to and expand a specific region block when a user clicks a region link elsewhere in the application.

#### Events Published

- `user:checkLocationRequest`: When a "Check" button next to a location is clicked, this event is published to the `eventBus` (it should ideally be dispatched to the `eventDispatcher` in the future for consistency).
- It also indirectly triggers `ui:navigateToRegion` and `ui:navigateToDungeon` events through the `commonUI` links it renders.

#### Events Subscribed To

- `app:readyForUiDataLoad`: To trigger its initial setup.
- `stateManager:ready`: To perform its first full render once the `StateManager` has loaded the initial game data and snapshot.
- `stateManager:snapshotUpdated`: Listens for all state changes to re-evaluate and re-render the accessibility status of all its displayed regions, exits, and locations.
- `stateManager:rulesLoaded`: To get the new static list of regions and reset its view when a new game is loaded.
- `ui:navigateToRegion`: To handle requests from other panels to scroll to and highlight a specific region.
- `settings:changed`: To update its display based on settings like `colorblindMode`.

#### Public Functions (`centralRegistry`)

This module does not register any public functions.

#### Dependencies & Interactions

- **StateManager**: The `Regions` module is fundamentally dependent on the `StateManager`. It gets the static region graph from the `staticDataCache` and uses the `createSnapshotInterface` to evaluate the rules for all contained exits and locations during each render.
- **Path Analyzer Module**: The `RegionUI` instantiates and directly calls the `PathAnalyzerUI` to render the path analysis results within its own panel.
- **CommonUI**: It makes extensive use of `commonUI.renderLogicTree` and `commonUI.createRegionLink` to build its display.
- **Dungeons Module**: It renders links to dungeons, which, when clicked, publish an event to activate and navigate the `Dungeons` panel.
