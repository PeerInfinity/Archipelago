# Development Documentation

## Vision

Create a robust system for using Archipelago's location access rules in web-based applications. This enables:

- Accurate client-side location checking and accessibility tracking.
- Development of new web interfaces and tools.
- Enhanced testing capabilities for Archipelago rules.
- Interactive exploration of region graphs and access requirements.
- An alternative incremental game mode ("Loop Mode") utilizing the core rule system.

## Architecture

```
exporter/                            # Backend: Python rule extraction & JSON export
  analyzer.py                        # Python AST analysis for rule parsing
  exporter.py                        # Handles region graph and rule export logic
  games/                             # Game-specific logic (e.g., alttp helpers)

frontend/                            # Frontend: Web client implementation
  app/
    core/                            # Core logic for both modes
      stateManager.js                # Manages game state (inventory, regions, etc.)
      stateManagerSingleton.js       # Singleton instance access
      ruleEngine.js                  # Evaluates JSON rules
      loop/                          # Logic specific to Loop Mode
        loopState.js                 # Manages loop resources (Mana, XP, Queue)
        xpFormulas.js                # XP calculation logic
    games/alttp/                     # ALTTP-specific frontend code
      helpers.js                     # JS implementations of Python helpers
      inventory.js                   # ALTTP inventory logic
      state.js                       # ALTTP state flags
    logic/                           # UI-independent logic
      pathAnalyzerLogic.js           # Path finding algorithms
    ui/                              # UI components
      gameUI.js                      # Main application UI orchestrator
      inventoryUI.js                 # Inventory panel
      locationUI.js                  # Locations view
      regionUI.js                    # Regions view
      loopUI.js                      # Loop Mode panel
      pathAnalyzerUI.js              # Path analysis display
      testCaseUI.js                  # Test case interface
      presetUI.js                    # Preset loading interface
  client/                            # Standard Archipelago client logic
    core/                            # Connection, message handling, timing
    ui/                              # Console, progress bar
  index.html                         # Main HTML file
  styles/                            # CSS stylesheets
```

### Core Components

1.  **Rule Export System (Backend - Python)**

    - Parses Python rule functions (lambdas, helpers) using AST (`exporter/analyzer.py`).
    - Converts rules to a standardized JSON format, preserving helper function references (`exporter/exporter.py`).
    - Handles complex rule patterns (boolean logic, method calls, conditionals).
    - Exports the complete region graph (regions, locations, exits, connections), item data, game settings, etc. (`exporter/exporter.py`, `exporter/games/`).

2.  **Frontend Rule Engine & State (JavaScript)**

    - Evaluates the standardized JSON rules (`frontend/app/core/ruleEngine.js`).
    - Uses native JavaScript implementations of Python helper functions (`frontend/app/games/alttp/helpers.js`).
    - Manages all relevant game state (inventory, flags, settings, reachability) via a central singleton (`frontend/app/core/stateManager.js`, `stateManagerSingleton.js`).
    - Includes game-specific state logic (`frontend/app/games/alttp/state.js`) and inventory handling (`frontend/app/games/alttp/inventory.js`).
    - Computes region accessibility using BFS (`stateManager.js`).
    - Supports rule debugging and tracing.

3.  **Web User Interface (Frontend - JavaScript/HTML/CSS)**

    - **Main UI (`gameUI.js`):** Orchestrates different views and interactions.
    - **Views:** Locations (`locationUI.js`), Exits (`exitUI.js` - assumed), Regions (`regionUI.js`), Loops (`loopUI.js`), Files (`testCaseUI.js`, `presetUI.js`).
    - **Components:** Inventory (`inventoryUI.js`), Path Analysis (`pathAnalyzerUI.js`), Common UI elements (`commonUI.js`).
    - Provides interactive navigation, rule visualization, path finding display, inventory management, and Loop Mode controls.

4.  **Loop Mode System (Frontend - JavaScript)**

    - Manages the incremental game state: Mana, Region XP, Action Queue, Discovery (`frontend/app/core/loop/loopState.js`).
    - Handles action processing loop, Mana costs, XP gains (`loopState.js`, `xpFormulas.js`).
    - Updates the Loop UI panel (`loopUI.js`).

5.  **Testing Infrastructure**
    - Compares frontend JS rule evaluation against backend Python results.
    - Supports interactive test case execution from the UI (`testCaseUI.js`).
    - Provides comprehensive debug logging and result analysis (`testLogger.js`).

### Data Flow

1.  **Generation:** Python backend (`exporter`) parses game rules and exports `rules.json`.
2.  **Loading:** Frontend loads `rules.json` into `stateManager`.
3.  **Interaction (Standard):** User interacts with Inventory UI -> `stateManager` updates -> `ruleEngine` re-evaluates accessibility -> Location/Region UIs update.
4.  **Interaction (Loop):** User interacts with Loop UI -> `loopState` updates Action Queue -> `loopState` processes actions, consuming Mana, gaining XP/Discoveries -> `loopUI` updates. `loopState` uses `stateManager` for rule checks.
5.  **Interaction (Server):** Client connects (`connection.js`) -> `messageHandler.js` processes server messages -> `stateManager` updates inventory/locations -> UI updates. User actions (checks, item clicks) may send commands back via `messageHandler`.

### Supported Rule/AST Node Types (Examples)

- **Leaf Nodes:** `constant`, `name` (variable access), `item_check`, `count_check`, `group_check`, `helper`, `state_method`.
- **Composite Nodes:** `and`, `or`, `comparison` (GtE, Lt, Eq, etc.), `attribute` (e.g., `state.item`), `subscript` (e.g., `list[0]`), `function_call` (e.g., `helper_func(arg)`).
- **Special Handling:** Progressive items, state flags, complex nested structures, event item collection.

## Implementation Status

- Core rule export and evaluation system is functional for ALTTP.
- Helper function preservation and native JS implementation approach is working.
- Centralized `stateManager` handles inventory, state, and reachability calculations (BFS).
- Interactive UI with Location, Region, and File views.
- Path analysis logic and UI (`PathAnalyzerUI`, `PathAnalyzerLogic`) provide insights into region requirements.
- **Loop Mode** core mechanics (Mana, XP, Queue, Discovery, Persistence) are implemented in `loopState.js` and controllable via `loopUI.js`.

## Development Priorities & Roadmap

See [Project Roadmap](/docs/json/project-roadmap.md) for current priorities, known issues, and future plans. Generally includes:

- Completing implementation of remaining helper functions.
- Improving Loop Mode features (stats, action choices, analysis).
- Addressing known bugs (test case failures, UI glitches).
- Enhancing Archipelago console integration and server communication.
- Adding support for other Archipelago games.

## Technical Details

- **JSON Export Format (v3):** A region-centric format containing the full graph, rules, items, settings, etc. (See `frontend/app/types/alttp.d.ts` for structure).
- **State Management:** Singleton `stateManager` provides synchronous access to inventory, flags, settings, and cached reachability. Uses `ALTTPInventory`, `ALTTPState`, `ALTTPHelpers` for game-specific logic.
- **Rule Evaluation:** Recursive evaluation in `ruleEngine.js`, handling various AST node types and delegating to `stateManager` or `helpers` as needed.
- **Loop State:** `loopState.js` manages Mana, XP (using formulas from `xpFormulas.js`), the action queue, discovery sets, and persistence via localStorage.
- **UI Framework:** Vanilla JavaScript with distinct UI classes for different panels/views. Uses an `eventBus` for cross-component communication.
