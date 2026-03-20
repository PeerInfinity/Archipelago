### Module: `PlayerState`

-   **ID:** `playerState`
-   **Purpose:** Tracks the player's current region, path history through regions, and navigation configuration. This is the source of truth for all path data. Consumer modules (loops, regionGraph, regions) read from this module's public API and react to its events.

---

#### Key Files

-   `frontend/modules/playerState/index.js`: Module entry point, event handling, and public API registration.
-   `frontend/modules/playerState/state.js`: Defines the `PlayerState` class with path data model and manipulation logic.
-   `frontend/modules/playerState/singleton.js`: Creates and exports a singleton instance of the `PlayerState` class.

#### Responsibilities

-   Maintains the player's current region.
-   Maintains the path — an ordered sequence of entries with three types: `regionMove`, `locationCheck`, and `customAction`.
-   Tracks region instance counts (how many times each region appears in the path).
-   Manages start regions configuration and navigation behavior (`allowLoops`).
-   Provides path manipulation methods (insert, remove, trim, clear actions).
-   Publishes events when the path or current region changes.
-   Resets to the starting region when a new `rules.json` is loaded.

#### Settings Owned

| Setting | Type | Default | Purpose |
|---------|------|---------|---------|
| `allowLoops` | boolean | `true` | Whether backward navigation creates loops or trims the path |
| `startRegions` | string[] | `['Menu']` | Starting regions; affects initial path and default trim target |

These are path-structural settings. For queue execution settings, see the `loops` module. For a full overview, see [Path and Queue Settings Ownership](../developer/path-and-queue-settings.md).

#### Events Published

-   **`playerState:regionChanged`**: Published when the current region changes. Payload: `{ oldRegion, newRegion }`.
-   **`playerState:pathUpdated`**: Published when the path is modified. Payload: `{ path, currentRegion, regionCounts }`.

#### Events Subscribed To

-   **`eventDispatcher`**:
    -   `user:regionMove`: Updates path and current region.
    -   `user:locationCheck`: Adds a location check entry to the path.
    -   `user:customAction`: Adds a custom action entry to the path.
    -   `playerState:trimPath`: Trims the path at a specified region instance.
-   **`eventBus`**:
    -   `stateManager:rulesLoaded`: Resets state and sets start regions from static data.

#### Public Functions (`centralRegistry`)

-   **`getCurrentRegion()`**: Returns the player's current region name.
-   **`getState()`**: Returns the `PlayerState` singleton instance.
-   **`getPath()`**: Returns a copy of the full path array.
-   **`getRegionCounts()`**: Returns a copy of the region instance count Map.
-   **`setAllowLoops(boolean)`** / **`getAllowLoops()`**: Configure loop behavior.
-   **`trimPath(regionName, instanceNumber)`**: Trim path at a specific region instance.
-   **`addLocationCheck(locationName, regionName)`**: Append a location check.
-   **`addCustomAction(actionName, params)`**: Append a custom action.
-   **`insertLocationCheckAt(...)`** / **`insertCustomActionAt(...)`**: Insert at a specific region instance.
-   **`removeLocationCheckAt(...)`** / **`removeCustomActionAt(...)`**: Remove from a specific region instance.
-   **`clearActionsAt(regionName, instanceNumber)`**: Clear all non-regionMove entries at a region instance.
-   **`removeAllActionsOfType(actionType, specificName)`**: Remove all entries of a type.
-   **`setStartRegions(regions)`** / **`isStartRegion(regionName)`**: Manage start regions.

#### Dependencies & Interactions

-   **StateManager**: Listens for `stateManager:rulesLoaded` to reset state and read start regions from static data.
-   **Loops Module**: Uses the public API to manipulate the path during queue building and execution. The loops module maintains its own execution settings (speed, pause, auto-restart) separately.
-   **RegionGraph / Regions Modules**: Subscribe to `playerState:pathUpdated` to display the path. Both use `getRegionMovesFromPath()` from `shared/pathUtils.js` to filter for regionMove entries.
-   **EventDispatcher**: Participates in the `user:regionMove` event chain, updating path state before propagating.
