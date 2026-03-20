# Proof Queue Module

**Module ID:** `proofQueue`

**Purpose:** Provides a panel where players arrange MetaMath proof steps in dependency order and verify them. Steps appear as they become available (dependencies satisfied) and are auto-filled into a queue. The player assigns hypothesis references and checks steps to build the proof.

## Key Files

- `frontend/modules/proofQueue/index.js` - Module entry point and registration
- `frontend/modules/proofQueue/proofQueueUI.js` - Main UI class managing the queue panel
- `frontend/modules/proofQueue/proofQueueState.js` - State class extending ProofQueueBaseState
- `frontend/modules/proofQueue/proofQueueStateSingleton.js` - Singleton state instance
- `frontend/modules/proofQueue/proofQueue.css` - Panel styling

## Responsibilities

- **Queue Display:** Renders an ordered queue of unchecked proof steps with hypothesis, reference, expression, and type columns
- **Proven Table:** Shows already-checked steps in a numbered table matching MetaMath proof format
- **Hypothesis Assignment:** Supports multiple difficulty modes for assigning hypothesis references (see Difficulty Modes below)
- **Step Checking:** Dispatches location checks for valid queue steps via the Archipelago protocol
- **Auto-fill:** Automatically adds newly available steps to the queue in topological order
- **Auto-check:** Optionally checks steps automatically as they become valid
- **Drag-and-Drop:** Allows reordering queue entries by dragging
- **Cross-panel Sync:** In Easy mode, synchronizes hypothesis assignments bidirectionally with the Proof Graph panel

## Difficulty Modes

| Mode | Behavior |
|------|----------|
| **Trivial** | Hypothesis values auto-filled; no player input required |
| **Easy** (default) | Player assigns hyp refs by typing or clicking proven steps; individual inputs lock when correct; syncs with Proof Graph |
| **Medium** | Player assigns hyp refs; all inputs for a step lock together when all are correct |
| **Hard** | Player assigns hyp refs; wrong check triggers a 5-second cooldown with visual feedback |

### Click-to-Assign (Easy/Medium/Hard)

In non-trivial modes, proven rows are clickable. Clicking a proven row selects it (highlighted with pulse animation), then clicking a hypothesis input auto-fills it with the selected row number.

## Events Published

| Event | Payload | Description |
|-------|---------|-------------|
| `proofQueue:queueChanged` | `{ queue, validation }` | Queue contents or order changed |
| `proofQueue:hypAssigned` | `{ source, target, slot }` | A hypothesis was correctly assigned in Easy mode |
| `proofQueue:stepChecked` | | A step was successfully checked |
| `proofQueue:proofComplete` | | The entire proof has been completed |

## Events Subscribed To

| Event | Handler |
|-------|---------|
| `stateManager:rulesLoaded` | Reloads proof structure from new rules data |
| `stateManager:snapshotUpdated` | Syncs inventory and checked locations from game state |
| `stateManager:inventoryChanged` | Syncs inventory and re-renders |
| `proofGraph:edgeDrawn` | In Easy mode, auto-fills the corresponding hyp input when an edge is drawn in the Proof Graph |

## Public Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `getProofQueueState()` | `ProofQueueState` | Returns the singleton proof queue state instance |

## Dependencies & Interactions

- **`stateManager`:** Uses `getStaticData()` for proof structure, `getLatestStateSnapshot()` for current state
- **`proofShared`:** Inherits from `ProofQueueBaseState` (queue operations, validation, available steps) and `ProofBaseState` (proof structure parsing, inventory sync)
- **`proofGraph`:** Bidirectional sync in Easy mode via `proofGraph:edgeDrawn` and `proofQueue:hypAssigned` events
- **`eventBus`:** Primary communication mechanism with other modules
- **`dispatcher`:** Sends `user:locationCheck` messages to check proof steps

## State Class Hierarchy

```
ProofBaseState          (proofShared/proofBaseState.js)
  - Proof structure parsing, inventory/location sync, step lookup
  └── ProofQueueBaseState   (proofShared/proofQueueBaseState.js)
        - Queue operations, validation, available steps, topological sort
        └── ProofQueueState     (proofQueue/proofQueueState.js)
              - Concrete state with loadFromSlotData
```
