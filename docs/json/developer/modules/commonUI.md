### Module: `CommonUI`

- **ID:** `commonUI` (Note: This is a utility module and does not have an entry in `module-configs/modules.json` as it's directly imported by other modules).
- **Purpose:** Provides shared, reusable UI utility functions that can be used by any UI panel module to maintain a consistent look and feel and avoid code duplication.

---

#### Key Files

- `frontend/modules/commonUI/commonUI.js`: Contains the `CommonUI` class and exports its methods as standalone functions.
- `frontend/modules/commonUI/index.js`: Re-exports the functions from `commonUI.js` for easy consumption by other modules.

#### Responsibilities

- **Render Logic Trees:** The primary responsibility is to take a JSON rule object and recursively render it as a nested HTML structure. This visualization is used throughout the application (in the Locations, Exits, and Regions panels) to show users the requirements for accessing something.
- **Evaluate and Style Rules:** While rendering a logic tree, it uses a `StateSnapshotInterface` to evaluate each node of the rule. It then applies appropriate CSS classes (`pass`, `fail`, `unknown`) to visually represent the current status of each condition.
- **Colorblind Support:** Includes logic to add text-based symbols (`✓`, `✗`, `?`) next to rule conditions, providing an alternative to color-based indicators for accessibility.
- **Create Standardized Links:** Provides factory functions like `createRegionLink` to generate consistent, clickable links that navigate the user to different panels.
- **Provide Utility Functions:** Contains other shared functions like `debounce` to improve UI performance by limiting the rate of function execution (e.g., on search input).

#### Events Published

This module is a pure utility and does not publish any events itself. The components it creates (like region links) may publish events when clicked.

#### Events Subscribed To

This module does not subscribe to any events.

#### Public Functions (`centralRegistry`)

This module does not register any public functions. Its functions are consumed by direct import.

#### Key Exported Functions

- **`renderLogicTree(rule, useColorblindMode, stateSnapshotInterface)`:** The main function. Takes a rule object and returns an `HTMLElement` representing the visual tree.
- **`createRegionLink(regionName, useColorblindMode, snapshot)`:** Creates a styled, clickable `<span>` that, when clicked, fires a `ui:navigateToRegion` event to focus the UI on the specified region.
- **`createLocationLink(...)`:** (If implemented) Creates a link that navigates to a specific location.
- **`debounce(func, wait)`:** A utility function for debouncing event handlers.

#### Dependencies & Interactions

- **StateManager (`stateManagerProxy`)**: The `renderLogicTree` and link creation functions are heavily dependent on the `StateManager`. They require a `StateSnapshotInterface` (created via `createSnapshotInterface` from the proxy) to evaluate rules and determine the accessibility status of regions and locations for correct styling.
- **All UI Panels:** Any module that needs to display a rule tree (`locationsPanel`, `exitsPanel`, `regionsPanel`, `pathAnalyzerPanel`) or create a standardized link to a region imports and uses functions from this module.
