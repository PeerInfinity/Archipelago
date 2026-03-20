# Proof Shared Module

**Module ID:** N/A (utility module, not independently registered)

**Purpose:** Provides shared base classes and helper functions used by the Proof Queue and Proof Graph modules. Contains the proof structure parsing, state management, and common UI utilities that all proof modules build upon.

## Key Files

- `frontend/modules/proofShared/proofBaseState.js` - Base state class with proof structure parsing and inventory/location sync
- `frontend/modules/proofShared/proofQueueBaseState.js` - Extended base class adding ordered queue operations, validation, and available steps tracking
- `frontend/modules/proofShared/proofUIHelpers.js` - Shared UI helper functions (event bus wrapper, logger, snapshot sync, location check dispatch)
- `frontend/modules/proofShared/proofModuleHelpers.js` - Shared module-level helpers (player world extraction, state initialization)

## Class: ProofBaseState

Base class for all proof module states. Inherited by ProofQueueBaseState and ProofGraphState.

### Responsibilities

- **Proof Structure Parsing:** Parses `slot_data.proof_structure` into a `Map<number, ProofStep>` of step objects
- **Name Substitution:** Handles generic-to-display name mapping from `name_substitutions` in rules data
- **Inventory Sync:** Tracks received items (`receivedItems` Set) and checked locations (`checkedLocations` Set)
- **Proof Completion:** Detects when the goal step's location has been checked
- **Step Lookup:** Provides helpers to find steps by index, item name, or display name

### ProofStep Object

```
{
  index: number,              // 1-based statement index
  label: string,              // Short theorem/axiom name (e.g. "2cn")
  expression: string,         // Mathematical expression (e.g. "|- 2 e. CC")
  instantiatedExpression: string|null,  // Concrete expression (e.g. "|- ( 2 + 2 ) = 4")
  dependencies: number[],     // Indices of statements this depends on
  fullText: string|null,      // Full description text
  itemName: string,           // Archipelago item name ("Statement 1")
  locationName: string,       // Archipelago location name ("Prove Statement 1")
  displayName: string,        // Human-readable display name
}
```

## Class: ProofQueueBaseState

Extends ProofBaseState with ordered queue management. Used by ProofQueueState (Proof Queue module).

### Responsibilities

- **Queue Operations:** Add, remove, move, clear steps in an ordered queue
- **Validation:** Checks that each step's dependencies appear earlier in the queue
- **Available Steps:** Tracks which steps can be placed (no-dependency axioms, or all dependency items received and locations checked)
- **Topological Sort:** Orders steps respecting dependency relationships
- **Auto-fill:** Adds all available unplaced steps to the queue in dependency order

## Helper: proofUIHelpers.js

Shared functions used by ProofQueueUI and ProofGraphUI:

| Function | Description |
|----------|-------------|
| `createEventBusGetter(name, getter)` | Creates a lazy event bus accessor with fallback logging |
| `createLogger(name)` | Creates a module-scoped logger function |
| `hasProofStructure()` | Checks if the current game has a proof_structure in slot_data |
| `syncStateFromSnapshot(state, data)` | Syncs inventory and checked locations from a state snapshot |
| `ensureStateLoaded(state)` | Loads proof structure if not already loaded |
| `dispatchLocationCheck(step, state, dispatcher, tag, log, callback)` | Dispatches a location check via the Archipelago protocol |

## Helper: proofModuleHelpers.js

Shared functions used by proof module index.js files:

| Function | Description |
|----------|-------------|
| `getPlayerWorld(staticData)` | Extracts player-specific world data from static data |
| `syncStateFromSnapshot(state, data)` | Syncs state from a stateManager snapshot (handles wrapper formats) |
| `createLogger(name)` | Creates a logger with window.logger integration |
| `initializeProofState(state, staticData, log, wirePublishing)` | Common initialization pattern: parse proof structure, sync state, wire event publishing |
