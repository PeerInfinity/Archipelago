### Module: `Dungeons`

- **ID:** `dungeons`
- **Purpose:** Displays a list of all dungeons in the game, showing their contents and logical status. This panel provides a focused view for players to track their progress through the major keyed areas of a world.

---

#### Key Files

- `frontend/modules/dungeons/index.js`: The module's entry point for registration.
- `frontend/modules/dungeons/dungeonUI.js`: The UI class that renders the panel, including the collapsible dungeon blocks.

#### Responsibilities

- **Render Dungeon List:** Fetches the list of all dungeons for the current game from the `StateManager`'s static data. Provides a search input to filter dungeons by name and an **Expand All / Collapse All** button.
- **Display Dungeon Details:** Renders each dungeon as a collapsible block showing a region count in the header. When expanded, it shows:
  - A list of all the **regions** that make up the dungeon.
  - All **bosses** in the dungeon (iterates through `dungeon.bosses` object). For each boss, it shows the boss name and renders the logic tree for its **defeat rule**.
- **Show Live Status:** The panel is fully reactive to the player's inventory. As the player collects items, the defeat rule trees will update to show their current pass/fail status.
- **Interactive Navigation:** The region names listed within a dungeon block are clickable links (provided by `commonUI`). Clicking a region name will navigate the user to that specific region in the "Regions" panel.
- **External Navigation:** Listens for `ui:navigateToDungeon` events to automatically expand and scroll to a specific dungeon with a brief green highlight effect.

#### Events Published

- `ui:navigateToRegion`: Published indirectly when a user clicks on a region name link within a dungeon block.

#### Events Subscribed To

- `stateManager:ready`: To perform its first full render once the `StateManager` has loaded the initial game data and snapshot.
- `stateManager:snapshotUpdated`: Listens for all state changes to re-evaluate and re-render the status of all displayed rules (debounced at 50ms).
- `stateManager:rulesLoaded`: To get the new static list of dungeons when a new game is loaded.
- `ui:navigateToDungeon`: Listens for requests from other panels to scroll to and highlight a specific dungeon.
- `settings:changed`: To update its display based on settings like `colorblindMode.dungeons`.

#### Public Functions (`centralRegistry`)

This module does not register any public functions.

#### Dependencies & Interactions

- **StateManager**: The `Dungeons` module gets its static dungeon definitions (including boss defeat rules) from the `StateManager`'s `staticDataCache`. It uses `createSnapshotInterface` to evaluate the rules for display.
- **CommonUI**: It uses `commonUI.renderLogicTree` to visualize boss defeat rules, and `commonUI.createRegionLink` for navigation links.
- **Regions Module & Locations Module**: The `Dungeons` module provides valuable context. A user can see which regions make up a dungeon and then click a link to navigate to the `Regions` panel to see the exits and locations within that part of the dungeon.
