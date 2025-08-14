### Module: `Path Analyzer`

- **ID:** `pathAnalyzer`
- **Purpose:** Provides the core logic and UI components for analyzing accessibility paths between regions. It is a powerful debugging tool used to understand why a location or region is inaccessible.

---

#### Key Files

- `frontend/modules/pathAnalyzer/index.js`: The module entry point, which primarily exports the `PathAnalyzerLogic` and `PathAnalyzerUI` classes.
- `frontend/modules/pathAnalyzer/pathAnalyzerLogic.js`: Contains the core algorithms for pathfinding (Depth-First Search) and rule analysis. This class is UI-agnostic.
- `frontend/modules/pathAnalyzer/pathAnalyzerUI.js`: Contains the class responsible for rendering the analysis results into a user-friendly HTML format.

#### Responsibilities

- **Pathfinding:** Implements a DFS algorithm (`findPathsToRegion`) to find all possible paths from the game's start region(s) to a specified target region. It respects a maximum iteration count and timeout to prevent browser freezes.
- **Rule Analysis:** For each path found, it analyzes every exit transition. It evaluates the exit's `access_rule` against the current game state to determine if the transition is passable.
- **Requirement & Blocker Identification:** It walks the rule trees of all exits along all found paths to compile a detailed, categorized list of:
  - **Primary Blockers:** Items that are failing a check and are the sole reason a path is blocked.
  - **Primary Requirements:** Items that are passing a check and are the sole reason a path is open.
  - Secondary/Tertiary items that are contributing but not critical.
- **UI Rendering:** The `PathAnalyzerUI` class takes the results from the `PathAnalyzerLogic` and renders them into a detailed, interactive display. This includes showing the paths, color-coding them, displaying exit rules, and presenting the compiled list of blockers and requirements.
- **Discrepancy Detection:** Compares its own pathfinding results against the `StateManager`'s reachability data and flags any discrepancies (e.g., when the `StateManager` says a region is reachable but the path analyzer cannot find a viable path).

#### Events Published

This module does not publish any events. It is a tool that is invoked by other modules.

#### Events Subscribed To

The `PathAnalyzerUI` listens for `settings:changed` to update its display if `colorblindMode` is toggled.

#### Public Functions (`centralRegistry`)

This module does not register any public functions. Its classes (`PathAnalyzerLogic` and `PathAnalyzerUI`) are directly imported and instantiated by the modules that use them.

#### Dependencies & Interactions

- **Regions Module (`RegionUI`):** This is the primary consumer of the Path Analyzer. The `RegionUI` instantiates `PathAnalyzerUI` and calls it to render the analysis results within a region's collapsible details view when the user clicks the "Analyze Paths" button.
- **StateManager**: The path analyzer is critically dependent on the `StateManager`. It operates on a `StateSnapshotInterface` created from the proxy's latest snapshot. It needs the snapshot for current inventory/flags and the static data for the region graph and rule definitions.
- **CommonUI**: It uses `commonUI.renderLogicTree` to visualize the access rules for each exit in the discovered paths.
