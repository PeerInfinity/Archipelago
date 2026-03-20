### Module: `Discovery`

- **ID:** `discovery`
- **Purpose:** Manages the "discovered" state of regions, locations, and exits. This is a core component of the "Archipelago Loops" game mode, tracking what the player has _encountered_, which is distinct from what is _accessible_ based on rules.

---

#### Key Files

- `frontend/modules/discovery/index.js`: The module entry point that registers event handlers.
- `frontend/modules/discovery/state.js`: Defines the `DiscoveryState` class, which holds the sets of discovered elements.
- `frontend/modules/discovery/singleton.js`: Exports the singleton instance (`discoveryStateSingleton`) of the `DiscoveryState` class, which is used by other modules to query discovery status.

#### Responsibilities

- Maintains three primary data sets: `discoveredRegions`, `discoveredLocations`, and `discoveredExits`.
- Provides methods to check if a specific game element has been discovered (e.g., `isRegionDiscovered(regionName)`).
- Provides methods to add new elements to the discovery sets (e.g., `discoverRegion(regionName)`), which are called in response to game events.
- Initializes its state with the "Menu" region as the first discovered element.
- Handles persistence by saving and loading its state to `localStorage` as part of the overall loop state.

#### Events Published

When a new discovery is made, this module (via the `DiscoveryState` class) publishes events on the `eventBus` so that UI components like `LoopUI` can update.

- `discovery:regionDiscovered`: When a new region is added to the `discoveredRegions` set.
- `discovery:locationDiscovered`: When a new location is added.
- `discovery:exitDiscovered`: When a new exit is added.
- `discovery:changed`: A general-purpose event fired whenever any part of the discovery state changes, used as a signal for a general UI refresh.

#### Events Subscribed To

The `Discovery` module listens for events from the `Loops` module to learn when to update its state. These are handled via the `eventDispatcher`.

- `loop:exploreCompleted`: When an "Explore" action finishes, this module processes the results to discover the revealed locations and exits.
- `loop:moveCompleted`: When a "Move" action finishes, this module discovers the destination region.
- `loop:locationChecked`: When a "Check Location" action finishes, this ensures both the location and its parent region are marked as discovered.
- `state:rulesLoaded`: When new game rules are loaded, this module re-initializes its state to match the new game world.

#### Public Functions (`centralRegistry`)

This module does not register public functions via the `centralRegistry`. Its public API is exposed through the methods of the `discoveryStateSingleton` instance.

#### Dependencies & Interactions

- **Loops Module:** The `Discovery` module is a critical dependency for the `Loops` module.
  - **`LoopState`** publishes events that the `Discovery` module consumes.
  - **`LoopUI`** constantly queries `discoveryStateSingleton` to determine which regions, locations, and exits to display and which should be hidden or shown as "???".
- **StateManager**: The `Discovery` module uses the `StateManager`'s static data to know the full list of possible regions, locations, and exits when it initializes.
