# Path and Queue Settings Ownership

This document clarifies which modules own which path and queue-related settings. Multiple modules interact with the player's path through the game world, and their settings serve distinct purposes.

## Settings by Category

### 1. Path Data Model (owned by `playerState`)

These settings affect how path entries are constructed and stored. They are the source of truth for path structure.

| Setting | Type | Default | Purpose |
|---------|------|---------|---------|
| `allowLoops` | boolean | `true` | Whether backward navigation creates loops or trims the path |
| `startRegions` | string[] | `['Menu']` | Starting regions; affects initial path and default trim target |
| `currentRegion` | string | `'Menu'` | Player's current position |
| `path` | array | (initial regionMove) | Ordered sequence of regionMove, locationCheck, and customAction entries |
| `regionInstanceCounts` | Map | (derived) | How many times each region appears in path |

**Access:** Use `playerState` public functions directly (e.g., `centralRegistry.getPublicFunction('playerState', 'setAllowLoops')`).

### 2. Queue Execution Behavior (owned by `loops/loopState`)

These settings control how the action queue is processed during loop execution. They do not affect path structure.

| Setting | Type | Default | Purpose |
|---------|------|---------|---------|
| `gameSpeed` | number | `10` | Action processing speed multiplier |
| `autoRestartQueue` | boolean | `false` | Restart queue automatically on completion |
| `isPaused` | boolean | `true` | Whether queue processing is paused |
| `repeatExploreStates` | Map | `{}` | Per-region flags for repeating explore actions |
| `instantMode` | boolean | `false` | Test mode: actions complete in one frame |
| `noManaDepletionReset` | boolean | `false` | Test mode: no loop reset on mana depletion |

**Persisted settings** (via `settingsManager`):
- `moduleSettings.loops.defaultSpeed`
- `moduleSettings.loops.autoRestart`
- `moduleSettings.loops.loopModeEnabled`

### 3. Queue Progress Tracking (owned by `loops/actionQueueManager`)

These are runtime tracking data, not user-configurable settings.

| Data | Type | Purpose |
|------|------|---------|
| `actionProgress` | Map (pathIndex -> 0-100) | Completion percentage per action |
| `actionCompleted` | Set of pathIndices | Which actions are finished |

### 4. UI Interaction Preferences (owned by `regionGraph`)

These control what happens when the user clicks on graph nodes. They are graph-specific interaction modes, not path settings.

| Setting | Type | Default | Purpose |
|---------|------|---------|---------|
| `addToPath` | boolean | `true` | Clicking appends to the existing path |
| `overwritePath` | boolean | `false` | Clicking replaces the path from start region |
| `movePlayerOneStep` | boolean | `false` | Move one step toward target on click |
| `movePlayerDirectly` | boolean | `true` | Jump directly to target on click |
| `addLocationsToPath` | boolean | `false` | Also add location checks when navigating |
| `checkAllLocationsInRegion` | boolean | `false` | Auto-check all accessible locations on arrival |

### 5. Path Display Preferences (owned by `regions`)

These control how the path is rendered in the Regions panel. They do not modify the path itself.

| Setting | Type | Default | Purpose |
|---------|------|---------|---------|
| `showAll` | boolean | `false` | Show all regions (ignores path) |
| `showPaths` | boolean | `true` | Show full path vs. only the last region |

## Data Flow

```
playerState (path data model)
    │
    ├──► eventBus: playerState:pathUpdated
    │       │
    │       ├──► regionGraph (filters to regionMoves for visualization)
    │       │
    │       └──► regions (filters to regionMoves for panel display)
    │
    └──► loops/actionQueueManager (maps path to action objects + progress)
            │
            └──► loops/loopState (processes queue with execution settings)
```

## Shared Utilities

Path filtering logic (e.g., extracting only `regionMove` entries) is provided by `frontend/modules/shared/pathUtils.js` to avoid duplication across consumer modules.
