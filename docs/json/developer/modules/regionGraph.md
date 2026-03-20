# Region Graph Module

**Module ID:** `regionGraph`

**Purpose:** Provides an interactive visualization of the game world's region connectivity using Cytoscape.js. Displays regions as nodes and exits as edges, with real-time updates showing accessibility status, location counts, and player position.

## Key Files

- `frontend/modules/regionGraph/index.js` - Module entry point and registration
- `frontend/modules/regionGraph/regionGraphUI.js` - Main UI class managing the graph visualization
- `frontend/modules/regionGraph/graphDataManager.js` - Graph data structure and visual updates
- `frontend/modules/regionGraph/graphInteractionManager.js` - User interactions with graph nodes and edges
- `frontend/modules/regionGraph/navigationManager.js` - Player movement and pathfinding logic
- `frontend/modules/regionGraph/layoutControlsManager.js` - Control panel and layout editor management
- `frontend/modules/regionGraph/regionGraphLayoutEditor.js` - Graph layout editing functionality
- `frontend/modules/regionGraph/pathfinder.js` - Pathfinding algorithm implementation

## Responsibilities

- **Graph Visualization:** Renders interactive graph using Cytoscape.js with dynamic loading of library files
- **Region Display:** Shows regions as nodes with customizable labels and location counts (checked/accessible/inaccessible/total)
- **Exit Visualization:** Displays region connections as directional edges with support for bidirectional exits
- **Accessibility Coloring:** Updates node and edge colors based on real-time reachability status
- **Location Nodes:** Dynamically creates location nodes positioned around region nodes with zoom-based visibility
- **Hub Detection:** Identifies and styles hub regions (high-degree nodes) for better layout
- **Player Positioning:** Tracks and displays player location as a marker node on the graph
- **Path Visualization:** Highlights the current player path with visual indicators
- **Discovery Mode Integration:** Hides undiscovered regions/locations/exits with "???" placeholders
- **Layout Management:** Supports COSE-based layout algorithm with reset, re-layout, and position saving
- **Control Panel:** Provides UI controls for location visibility, player movement, and settings

## Events Published

| Event | Description |
|-------|-------------|
| `ui:activatePanel` | Activates the Region Graph panel |
| `ui:navigateToRegion` | Navigates to a specific region in the panel |
| `user:regionMove` | User attempts to move player to a region |
| `user:locationCheck` | User checks a location |
| `regionGraph:nodeSelected` | A region node is selected in the graph |

## Events Subscribed To

| Event | Handler |
|-------|---------|
| `stateManager:snapshotUpdated` | Updates graph accessibility coloring when game state changes |
| `stateManager:rulesLoaded` | Loads graph data when new rules are loaded |
| `stateManager:ready` | Ensures graph is loaded once state manager is ready |
| `playerState:regionChanged` | Updates player location marker |
| `playerState:pathUpdated` | Updates path highlighting |
| `discovery:modeChanged` | Toggles discovery mode filtering |
| `discovery:settingsChanged` | Updates discovery display settings |
| `discovery:changed` | Updates graph visibility when discovery state changes |
| `app:readyForUiDataLoad` | Triggers initial Cytoscape library loading |

## Public Functions

This module does not register public functions in `centralRegistry`. It is primarily a UI panel component.

## Dependencies & Interactions

- **`stateManager`:** Uses `getStaticData()` for region/exit definitions, `getLatestStateSnapshot()` for current state
- **`settingsManager`:** Loads and saves display settings and location visibility
- **`eventBus`:** Primary communication mechanism with other modules
- **`discoveryStateSingleton`:** Queries discovery state for regions, locations, and exits
- **`playerState`:** Gets current player location and path data
- **`Cytoscape.js`:** External graph visualization library (dynamically loaded)
- **`ruleEngine`:** Evaluates location and exit access rules
- **`commonUI`:** Shared UI utilities

## Features

### Layout Management

The module supports multiple layout features:
- COSE-based automatic layout algorithm
- Manual node dragging with position persistence
- Layout reset and re-layout functions
- Export layout positions as JSON

### Discovery Mode

When discovery mode is enabled:
- Undiscovered regions show as "???"
- Undiscovered exits are hidden or shown as dashed lines
- Location counts only reflect discovered locations
- Regions become visible when entered by the player

### Location Display

Locations can be displayed as small nodes around their parent region:
- Visibility controlled by zoom level
- Color indicates accessibility status
- Click to check/uncheck locations
- Grouped in a ring pattern around the region node
