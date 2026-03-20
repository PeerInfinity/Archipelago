# Proof Queue Panel

The Proof Queue panel is the primary interface for playing MetaMath games. It displays your proof as a table of steps in dependency order, tracks which steps have been proved, and lets you check the next step when its prerequisites are satisfied.

This panel appears automatically when a MetaMath game is loaded.

## Panel Layout

The panel is divided into three sections:

### Proven Steps

A numbered table showing all steps that have been proved so far. Each row shows:

- **Step** — Row number in the proof
- **Hyp** — Hypothesis references (row numbers of the steps this one depends on)
- **Ref** — The theorem or axiom name (linked to its [MetaMath page](https://us.metamath.org/))
- **Expression** — The mathematical statement being proved
- **Type** — Axiom (Ax), Definition (Def), or Theorem (Thm)

Starting statements (axioms and definitions with no dependencies) appear at the top. As you prove more steps, they are added to the bottom of the table.

### Queue

Shows the unchecked steps waiting to be proved. Steps are automatically added to the queue as their dependencies become available. Each row is color-coded:

| Color | Meaning |
|-------|---------|
| **Green** | Ready to check — all dependencies are proved and hyps are assigned |
| **Gray** | Valid but not yet checkable — dependencies in the queue appear in order |
| **Red** | Invalid — a dependency is missing or out of order |

Click a green row to check it immediately.

### Status Bar

Shows proof progress: how many steps are proved out of the total, and how many are in the queue.

## Difficulty Modes

The **Hyp** dropdown in the toolbar controls how hypothesis references are handled:

### Trivial

Hypothesis values are filled in automatically. You just need to check steps as they become available.

### Easy (Default)

You assign hypothesis references yourself. There are two ways:

- **Type directly** — Click a hyp input field and type the row number of the dependency
- **Click-to-assign** — Click a proven row to select it (it pulses to show selection), then click a hyp input to fill it with that row number

Each hyp input locks (turns to plain text) as soon as you enter the correct value. In this mode, correct assignments are synchronized with the [Proof Graph](proofGraph.md) panel — making a connection in either panel updates the other.

### Medium

Same input methods as Easy, but individual inputs don't lock one by one. Instead, all hyp inputs for a step lock together once every hypothesis for that step is correct.

### Hard

Same input methods, but inputs never lock. If you click **Check Next** with an incorrect hypothesis, a 5-second cooldown activates and the wrong inputs flash red.

## Controls

- **Auto-check** — When enabled, steps are checked automatically as soon as they become valid and all hyps are correct
- **Show details** — Toggles additional information in the expression column (generic expressions, full text descriptions)
- **Check Next** — Checks the first valid unchecked step in the queue

## Completion

When all steps are proved, the queue section is replaced with a **Q.E.D.** banner linking to the theorem's MetaMath page. The proven table shows the complete proof matching the format used on [metamath.org](https://us.metamath.org/).

## See Also

- [Proof Graph](proofGraph.md) — Visual graph of proof dependencies (syncs with Easy mode)
