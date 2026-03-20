# Sphere State Module

**Module ID:** `sphereState`

**Purpose:** Manages sphere log data (progression tracking) for games supporting the sphere system. Parses JSONL sphere logs, tracks player progression through spheres, and provides query functions for sphere-related data. This is a data management module without its own UI panel.

## Key Files

- `frontend/modules/sphereState/index.js` - Module entry point and registration
- `frontend/modules/sphereState/sphereState.js` - Core sphere state management
- `frontend/modules/sphereState/singleton.js` - Singleton instance management

## Responsibilities

- **Sphere Log Loading:** Fetches and parses JSONL sphere log files
- **Format Detection:** Automatically detects verbose vs incremental format and parses accordingly
- **Verbose Format Parsing:** Parses entries where each sphere contains complete cumulative state
- **Incremental Format Parsing:** Parses delta updates and accumulates state across spheres
- **Multiworld Support:** Handles sphere data from multiworld seeds with multiple players
- **Current Sphere Tracking:** Determines current sphere based on checked locations
- **Progression Calculation:** Computes accessible locations/regions up to current sphere
- **Focused Mode Support:** Manages focused regression test logs with specific location focus
- **Auto-Load:** Automatically loads sphere log when rules are loaded based on preset directory

## Events Published

| Event | Data | Description |
|-------|------|-------------|
| `sphereState:dataLoaded` | `{ sphereCount, filePath }` | Sphere log successfully loaded |
| `sphereState:dataCleared` | - | Sphere state cleared/reset |
| `sphereState:currentSphereChanged` | Sphere info object | Current sphere changed based on checked locations |
| `sphereState:allSpheresComplete` | - | All spheres have been completed |

## Events Subscribed To

| Event | Handler |
|-------|---------|
| `stateManager:rulesLoaded` | Resets sphere state and auto-loads sphere log from preset directory |
| `stateManager:snapshotUpdated` | Updates current sphere based on newly checked locations |

## Public Functions

Registered with `centralRegistry`:

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `getSphereData()` | - | `Array` | Returns array of all parsed sphere entries |
| `getCurrentSphere()` | - | `Object` | Returns current sphere info with integer/fractional indices |
| `getCurrentIntegerSphere()` | - | `number` | Returns current integer sphere number |
| `getCurrentFractionalSphere()` | - | `number` | Returns current fractional sphere number |
| `getCheckedLocations()` | - | `Array` | Returns array of currently checked locations |
| `isLocationChecked(name)` | `name: string` | `boolean` | Checks if a specific location is checked |
| `getAccessibleLocations()` | - | `Array` | Returns locations accessible up to current sphere |
| `getAccessibleRegions()` | - | `Array` | Returns regions accessible up to current sphere |
| `isSphereComplete(int, frac)` | `int: number, frac: number` | `boolean` | Checks if specific sphere is complete |
| `isIntegerSphereComplete(int)` | `int: number` | `boolean` | Checks if all fractional spheres are complete |
| `getSphereByIndex(int, frac)` | `int: number, frac: number` | `Object` | Gets specific sphere data |
| `getAllSpheresForInteger(int)` | `int: number` | `Array` | Gets all fractional spheres for an integer |
| `getCurrentPlayerId()` | - | `string` | Returns current player ID |
| `loadSphereLog(path, content)` | `path: string, content?: string` | `Promise` | Manually loads sphere log |
| `setCurrentPlayerId(id)` | `id: string` | - | Sets current player and re-filters data |
| `isFocusedMode()` | - | `boolean` | Returns whether this is a focused test log |
| `getFocusLocations()` | - | `Array` | Returns locations to focus on in focused mode |
| `getLogHeader()` | - | `Object` | Returns log header metadata |

## Dependencies & Interactions

- **`stateManager`:** Uses `getStaticData()` to identify current player, `getLatestStateSnapshot()` for checked locations
- **`eventBus`:** Publishes sphere state events and subscribes to state manager events
- **No UI dependencies:** This is a data-only module

## Sphere Log Format

### Verbose Format

Each entry contains complete cumulative state:

```json
{"type": "state_update", "sphere_index": 0, "player_data": {"1": {"locations": [...], "items": [...]}}}
{"type": "state_update", "sphere_index": 1, "player_data": {"1": {"locations": [...], "items": [...]}}}
```

### Incremental Format

Each entry contains only changes from previous sphere:

```json
{"type": "header", "seed_name": "12345", "version": "1.0"}
{"type": "state_update", "sphere_index": [0, 0], "player_data": {"1": {"new_locations": [...], "new_items": [...]}}}
{"type": "state_update", "sphere_index": [0, 1], "player_data": {"1": {"new_locations": [...], "new_items": [...]}}}
```

## Usage Example

```javascript
import { getSphereStateSingleton } from './sphereState/singleton.js';

const sphereState = getSphereStateSingleton();

// Check current progression
const current = sphereState.getCurrentSphere();
console.log(`Currently at sphere ${current.integerSphere}.${current.fractionalSphere}`);

// Get accessible locations
const accessible = sphereState.getAccessibleLocations();
console.log(`${accessible.length} locations accessible`);

// Check if specific sphere is complete
if (sphereState.isSphereComplete(2, 0)) {
    console.log('Sphere 2.0 is complete!');
}
```
