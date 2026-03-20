# Proof Graph Module

**Module ID:** `proofGraph`

**Purpose:** Provides an interactive Cytoscape.js graph where players reconstruct the dependency structure of a MetaMath proof by drawing edges between proof step nodes. Each node represents a proof step, and players draw edges from dependency steps to the steps that use them.

## Key Files

- `frontend/modules/proofGraph/index.js` - Module entry point and registration
- `frontend/modules/proofGraph/proofGraphUI.js` - Main UI class managing the Cytoscape graph
- `frontend/modules/proofGraph/proofGraphState.js` - State class extending ProofBaseState with edge-drawing mechanics
- `frontend/modules/proofGraph/proofGraphStateSingleton.js` - Singleton state instance
- `frontend/modules/proofGraph/proofGraph.css` - Panel styling

## Responsibilities

- **Graph Visualization:** Renders proof steps as nodes in a Cytoscape.js graph with hierarchical row-based layout
- **Edge Drawing:** Players draw edges between nodes using the edgehandles plugin; correct edges stick, incorrect ones are rejected with visual feedback
- **Input Ports:** Each node displays small port indicators (one per dependency slot) along its top edge, showing which dependencies have been connected
- **Slot-indexed Edges:** Edges use slot-indexed keys (`source->target:slot`) to support duplicate dependencies (e.g., the same axiom used twice by one step)
- **Step Checking:** Fully-connected steps with satisfied dependencies become checkable; clicking them or using "Check Next" dispatches a location check
- **Auto-connect:** When a step is checked (proved), all its incoming dependency edges are automatically drawn
- **Visibility Filtering:** Only displays nodes whose dependencies are satisfied (same logic as Proof Queue's available steps)
- **Row-based Layout:** Axioms at row 0, connected nodes placed at `max(source rows) + 1`, unconnected non-axioms in a reserved bottom row
- **Cross-panel Sync:** In Proof Queue Easy mode, synchronizes edge draws bidirectionally with hypothesis assignments

## Graph Node Types

| Type | Appearance | Description |
|------|-----------|-------------|
| **Axiom** | Dashed blue border | No dependencies; always available |
| **Connected** | Yellow border | All edges drawn but not yet checkable |
| **Checkable** | Thick green border | Fully connected and all dependencies proved; click to check |
| **Checked** | Dim, gray border | Location has been checked (proved) |
| **Goal** | Larger node | The final theorem step |
| **Port (unfilled)** | Small gray dot | Dependency slot not yet connected |
| **Port (filled)** | Small green dot | Dependency slot correctly connected |

## Events Published

| Event | Payload | Description |
|-------|---------|-------------|
| `proofGraph:edgeDrawn` | `{ source, target, slot }` | An edge was correctly drawn between two steps |
| `proofGraph:edgeRejected` | `{ source, target }` | An incorrect edge attempt was rejected |
| `proofGraph:stepCompleted` | `{ stepIndex }` | A step became fully connected (all edges drawn) |
| `proofGraph:proofComplete` | | The entire proof has been completed |

## Events Subscribed To

| Event | Handler |
|-------|---------|
| `stateManager:rulesLoaded` | Destroys existing graph and reloads proof structure from new rules data |
| `stateManager:snapshotUpdated` | Syncs state, adds newly visible nodes, auto-connects checked steps |
| `stateManager:inventoryChanged` | Syncs state, adds newly visible nodes, auto-connects checked steps |
| `proofQueue:hypAssigned` | Draws the corresponding edge when a hypothesis is correctly assigned in the Proof Queue (Easy mode) |

## Public Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `getProofGraphState()` | `ProofGraphState` | Returns the singleton proof graph state instance |

## Dependencies & Interactions

- **`stateManager`:** Uses `getStaticData()` for proof structure, `getLatestStateSnapshot()` for current state
- **`proofShared`:** Inherits from `ProofBaseState` (proof structure parsing, inventory sync)
- **`proofQueue`:** Bidirectional sync in Easy mode via `proofQueue:hypAssigned` and `proofGraph:edgeDrawn` events
- **`eventBus`:** Primary communication mechanism with other modules
- **`dispatcher`:** Sends `user:locationCheck` messages to check proof steps
- **`Cytoscape.js`:** External graph visualization library (dynamically loaded)
- **`cytoscape-edgehandles`:** Cytoscape plugin for interactive edge drawing

## State Class Hierarchy

```
ProofBaseState          (proofShared/proofBaseState.js)
  - Proof structure parsing, inventory/location sync, step lookup
  └── ProofGraphState       (proofGraph/proofGraphState.js)
        - Edge-drawing mechanics, slot-indexed edges, port queries
        - correctEdges Map, drawnEdges Set, incorrectAttempts counter
```

## Edge Key Format

Edges are keyed as `"source->target:slot"` where slot is the dependency array index. This supports duplicate dependencies (e.g., step 5 depending on step 3 twice uses keys `3->5:0` and `3->5:1`).
