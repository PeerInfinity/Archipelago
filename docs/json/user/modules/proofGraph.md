# Proof Graph Panel

The Proof Graph panel displays your MetaMath proof as an interactive node-and-edge graph. Each proof step is a node, and you draw edges between nodes to show which steps depend on which. This provides a visual complement to the [Proof Queue](proofQueue.md) panel.

This panel appears automatically when a MetaMath game is loaded.

## Graph Display

### Nodes

Each proof step is shown as a labeled rectangle. Nodes are arranged in rows: axioms and definitions at the top, with dependent steps in lower rows.

| Appearance | Meaning |
|-----------|---------|
| **Dashed blue border** | Axiom or definition — no dependencies, always available |
| **Dark background** | Step with unconnected dependencies |
| **Yellow border** | All edges drawn, waiting for dependencies to be proved |
| **Thick green border** | Checkable — fully connected and all dependencies proved |
| **Dim, gray** | Already checked (proved) |
| **Larger size** | The final goal theorem |

### Input Ports

Nodes with dependencies show small dots along their top edge — one per dependency. These are input ports:

- **Gray dot** — Dependency not yet connected
- **Green dot** — Dependency correctly connected

A step like `addassi` that depends on two things (ax-1cn and 2cn) will have two ports. If it depends on the same step twice, it gets two separate ports for that step.

### Edges

Green arrows connect source nodes to their target's input ports, showing the dependency relationship.

## Drawing Edges

To connect a dependency:

1. **Click and drag** from the source node (the dependency) toward the target node (the step that needs it)
2. If the connection is correct, a green arrow snaps into place pointing at the appropriate port
3. If incorrect, both nodes flash red

You don't need to aim precisely at a specific port — the system finds the correct unfilled slot automatically.

### Auto-Connect

When a step is checked (proved), all its incoming edges are drawn automatically. You don't need to manually connect edges for steps that were proved through the [Proof Queue](proofQueue.md) or via the Archipelago server.

## Node Visibility

Not all nodes are visible from the start. A node appears in the graph when its dependencies are satisfied — the same condition that makes a step available in the Proof Queue. As you prove more steps and receive more items, new nodes appear in a row at the bottom and move to their proper position when connected.

## Controls

- **Re-layout** — Recalculates all node positions based on the current dependency structure
- **Fit** — Zooms and pans to fit all nodes in the viewport
- **Check Next** — Checks the first fully-connected, checkable step
- **Click a green node** — Checks that specific step

You can also zoom with the scroll wheel and pan by dragging the background.

## Easy Mode Sync

When the Proof Queue is set to **Easy** difficulty, the two panels stay in sync:

- Drawing a correct edge in the Proof Graph automatically fills the corresponding hypothesis input in the Proof Queue
- Entering a correct hypothesis in the Proof Queue automatically draws the corresponding edge in the Proof Graph

This sync only applies in Easy mode. In other difficulty modes, each panel operates independently.

## Completion

When all edges are drawn and all steps are proved, the status bar shows **Proof complete!**

## See Also

- [Proof Queue](proofQueue.md) — Table-based proof interface with difficulty modes
