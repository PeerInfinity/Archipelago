# Loops Mode

Loops is an incremental/idle game mode layered on top of the Archipelago tracker. Instead of checking locations directly, you queue actions and watch them execute automatically, spending mana on each action. When mana runs out, the loop resets and you start again — but with XP earned from previous loops reducing future costs.

Inspired by idle games like [Idle Loops](https://stopsign.github.io/idleLoops/), [Stuck in Time](https://store.steampowered.com/app/1681110/Stuck_In_Time/), and [Increlution](https://store.steampowered.com/app/1593350/Increlution/).

## How It Works

### Core Loop

1. You start each loop in the Menu region with full mana
2. Queue actions: move to regions, explore undiscovered areas, check locations
3. Actions execute automatically, each consuming mana based on its cost
4. When mana runs out, the loop resets: mana refills, position resets, queue restarts
5. Checked locations and earned XP persist across loops

### Action Types

| Action | Description | Base Cost |
|--------|-------------|-----------|
| **Move to Region** | Navigate to an adjacent region | Region's move cost (from cost data, or 50 default) |
| **Explore Region** | Discover locations and exits in a region | 2x the region's move cost |
| **Check Location** | Check a location for items | Per-location cost (from cost data, or 100 default) |

Actions are animated in real time. Each action's duration is proportional to its mana cost — expensive actions take longer. The formula is: `time = (cost * 5) / gameSpeed` seconds.

### Mana

Mana is the core resource that limits what you can accomplish in a single loop.

- **Base mana**: 100
- **Mana per item**: Each inventory item adds 10 to your max mana
- **Max mana formula**: `100 + (itemCount * 10)`
- Mana is consumed continuously as actions execute (not all at once)
- When mana hits 0, the loop resets
- On reset, mana refills to its current maximum

As you check locations and receive items, your max mana grows, letting you do more per loop.

### XP and Leveling

Each region tracks its own XP. Every mana point spent on an action in a region grants 1 XP to that region.

**XP thresholds:**

| Level | XP to Next Level | Total XP | Cost Reduction |
|-------|------------------|----------|----------------|
| 0 → 1 | 100 | 100 | 5% |
| 1 → 2 | 120 | 220 | 10% |
| 2 → 3 | 140 | 360 | 15% |
| 3 → 4 | 160 | 520 | 20% |
| N → N+1 | 100 + N×20 | 10N² + 90N | N×5% |

**Cost reduction formula**: `finalCost = baseCost / (1 + level * 0.05)`

At level 10, actions cost half their base price. At level 20, they cost a third. This means early loops are about exploration and discovery, while later loops become efficient as XP accumulates.

### Progression Strategy

- **Queue optimization**: Design efficient action sequences that check the most locations per loop
- **Mana management**: Balance exploration (expensive) with exploitation (cheaper with XP)
- **Region ordering**: Visit cheaper regions first to save mana for expensive areas deeper in the path
- **Explore vs. check**: Exploring costs 2x move cost but unlocks locations. Once discovered, check individual locations for their specific costs.

## How to Play

### Starting Loops Mode

Load the mode via URL parameter:
```
?mode=loops
```

Or select "Loops" from the mode selector in the frontend.

**Important**: The parameter must be `loops` (plural). `?mode=loop` does not work.

### Building a Queue

When Loops mode is active, clicking in the tracker queues actions instead of executing them directly:

- **Click a location** → Pathfinding calculates the route from Menu to the location's region, queues all the intermediate region moves, then queues the location check (or an explore action if the location is undiscovered)
- **Click an exit** → Queues region moves along the path to the exit's source region, then moves through the exit (or queues an explore if the exit is undiscovered)

Each click replaces the current queue with a fresh path to the clicked target.

### Controls

| Control | Function |
|---------|----------|
| **Start** | Begin processing the action queue |
| **Pause** | Stop processing mid-queue (resume from same point) |
| **Resume** | Continue from where you paused |
| **Restart** | Reset the loop (refill mana) and start the queue from the beginning |
| **Speed slider** | Adjust game speed (0.1x to 100x) |
| **Instant mode** | Actions complete in one frame (disables speed slider) |
| **Auto-restart** | Automatically restart the loop when mana runs out |
| **Auto-resume** | Automatically resume processing when new actions are added after queue completion |
| **Auto-remove** | Remove completed location checks and fully-explored explore actions from the queue |
| **Clear queue** | Remove all queued actions |
| **Clear explores** | Remove only explore actions from the queue |

### Processing States

The queue cycles through these states:

| State | Meaning | Button |
|-------|---------|--------|
| **idle** | Queue not started or empty | Start |
| **running** | Actively processing actions | Pause |
| **paused** | User paused mid-queue | Resume |
| **completed** | Queue ran to the end | Restart |
| **waiting** | Queue completed, auto-resume on, waiting for new actions | — |

### Repeat Explore

Explore actions can be set to repeat. When a repeating explore action completes, a new explore action is automatically appended to the queue for the same region. This is useful for grinding XP in a region without manually re-queuing.

## Cost Data System

The mana cost for each region move and location check can be customized per game via cost data files.

### Cost Data File

Cost data is stored alongside preset files:
```
frontend/presets/{game}/AP_{seed_id}/AP_{seed_id}_costs.json
```

Format:
```json
{
  "version": "1.0",
  "generatedFrom": "AP_14089154938208861744_sphere_log.jsonl",
  "generatedAt": "2025-01-15T10:30:00Z",
  "regions": {
    "Menu": { "moveCost": 0 },
    "Light World": { "moveCost": 12 },
    "Kakariko": { "moveCost": 8 }
  },
  "locations": {
    "Kakariko - Bug Kid": 15,
    "Eastern Palace - Big Chest": 45
  },
  "defaultRegionCost": 50,
  "defaultLocationCost": 10
}
```

### Cost Generator

The cost generator creates balanced cost data by simulating an actual playthrough of the sphere log using the real loop mechanics:

1. Start at the start region with max mana
2. For each location in sphere order:
   - Find the path from start to the target location
   - For each uncosted region in the path: assign `floor(currentMana / 2 / uncostedRegionsRemaining)`
   - For the location (if uncosted): assign `floor(currentMana / 2)`
   - Simulate executing the queued actions using actual loop mechanics
   - Reset the loop, continue to the next location
3. Assign default costs to any unvisited regions (use highest neighbor's cost) and locations (use highest existing location cost)

This produces costs that scale with the game's progression — early-sphere locations are cheap, late-sphere locations are expensive.

### Fallback Costs

When no cost data is loaded, hardcoded defaults apply:

| Action | Default Cost |
|--------|-------------|
| Region move | 50 |
| Explore | 100 (2×50) |
| Location check | 100 |

## Loop Stats Panel

The Loop Stats panel appears in the left column and displays a detailed cost analysis for every action in the queue.

### Layout

- **Two-column table**: Previous loop data vs. current loop data
- **Expandable rows**: Click to expand an action's row for cost breakdown details
- **Tabs**: Mana Costs (active), Inventory (placeholder for future)

### Display Options

- **Show remaining mana** (default: on) — predicted mana after each action
- **Show mana cost** (default: off) — the mana cost of each action

When both are on, entries display as "cost / remaining".

### Cost Breakdown (Expanded View)

Each action row expands to show:

| Field | Description |
|-------|-------------|
| Base cost | Raw mana cost from cost data |
| Level discount | Reduction from region XP level |
| Final cost | Actual mana charged |
| Mana before | Mana at start of action |
| Mana after | Predicted remaining mana |
| Predicted time | Estimated real-time duration |

### Color Coding

Mana remaining is color-coded:
- **Green** (`loop-mana-good`): > 50% mana remaining
- **Yellow** (`loop-mana-warn`): 10–50% mana remaining
- **Red** (`loop-mana-low`): < 10% mana remaining
- **Red** (`loop-mana-insufficient`): mana goes negative (action won't complete)

### Previous vs. Current

When a loop resets, the current analysis is archived as the "previous" loop. This lets you compare how XP gains from the previous loop reduced costs in the current one.

## Cost Debugger

The Cost Debugger (`loopsCostDebugger` module) provides developer tools for inspecting, editing, and generating cost data. It includes a cost planner for designing balanced mana economies for new games.

## Settings

### Persisted Settings

Settings that survive across sessions (stored in localStorage):

| Setting | Default | Description |
|---------|---------|-------------|
| `defaultSpeed` | 10 | Game speed multiplier |
| `autoRestart` | false | Auto-restart loop on mana depletion |
| `instantMode` | false | Complete actions in one frame |

### Settings File

Loop mode can be pre-enabled via `frontend/settings/settings-loops.json`:
```json
{
  "moduleSettings": {
    "loops": {
      "loopModeEnabled": true
    }
  }
}
```

### Test Mode Flags

For testing and cost generation, two special flags bypass normal behavior:

| Flag | Effect |
|------|--------|
| `instantMode` | Actions complete in one animation frame |
| `noManaDepletionReset` | Mana can go negative without triggering a loop reset |

## Integration with Other Systems

### Discovery System

Loops mode integrates tightly with the discovery system:
- Only discovered regions and exits can be used for pathfinding
- Exploring a region triggers discovery events, revealing locations and exits
- The explore action publishes `loop:exploreCompleted` through the dispatcher chain

### PlayerState Path

The action queue is built on top of PlayerState's path system:
- Region moves, location checks, and explore actions are stored as PlayerState path entries
- The `ActionQueueManager` maps path entries to loop action objects with progress/completion tracking
- Queue modifications (add, remove, clear) delegate to PlayerState's API

### Region Graph

Loops mode is designed to integrate with the region graph visualization (planned features include displaying nodes as pie charts showing mana costs as fractions of total mana).

### MetaGame (Maze Metagame)

Loops mode can be combined with the [Maze Metagame](maze-metagame.md) via `?metagame=mazegameloops`, which adds maze challenges before explore and location check actions.

## Architecture

### Module Structure

The loops system is split across three frontend modules:

**`frontend/modules/loops/`** — Core loop mechanics:

| File | Purpose |
|------|---------|
| `loopState.js` | Core game state: mana, XP, action processing, loop reset |
| `loopUI.js` | Main UI controller, panel rendering, event coordination |
| `loopRenderer.js` | Rendering orchestration, separating render logic from state |
| `loopBlockBuilder.js` | Region block DOM construction, mana cost coloring |
| `actionQueueManager.js` | Maps PlayerState path to action objects, tracks progress |
| `costDataManager.js` | Loads and caches per-region/per-location cost data |
| `costGenerator.js` | Generates cost data by simulating sphere log playthrough |
| `eventCoordinator.js` | Centralizes event subscriptions and routing |
| `loopEvents.js` | Event handlers for location clicks, exit clicks, mode changes |
| `displaySettingsManager.js` | Persisted UI display preferences |
| `expansionStateManager.js` | Tracks which region blocks are expanded/collapsed |
| `xpFormulas.js` | XP calculation formulas (level thresholds, cost reduction) |
| `loopStateSingleton.js` | Singleton export for cross-module access |
| `loop.css` | Styling for the loop panel and region blocks |

**`frontend/modules/loopStats/`** — Statistics panel:

| File | Purpose |
|------|---------|
| `loopStatsUI.js` | Statistics panel UI with two-column prev/current layout |
| `queueAnalyzer.js` | Queue analysis with prev/current comparison and caching |
| `loopStats.css` | Statistics panel styling |

**`frontend/modules/loopsCostDebugger/`** — Developer tools:

| File | Purpose |
|------|---------|
| `costDebuggerUI.js` | Cost inspection and editing UI |
| `costPlanner.js` | Planning tool for designing cost economies |
| `costDebugger.css` | Cost debugger styling |

**`frontend/modules/shared/`** — Shared utilities:

| File | Purpose |
|------|---------|
| `queueAnalysis.js` | Cost calculation, queue analysis, time prediction, mana color coding |
| `pathfinder.js` | Pathfinding for route calculation from current region to target |

### Event Flow

The loops module uses a dispatcher-based event system:

1. **User clicks location/exit** → Event captured by `loopEvents.js`
2. **Pathfinding** → Route calculated from Menu to target
3. **Queue built** → Region moves and action dispatched via PlayerState API
4. **Processing** → `loopState._processFrame()` runs via `requestAnimationFrame`
5. **Mana consumed** → Continuous deduction proportional to progress
6. **XP awarded** → 1 XP per mana spent, applied to the action's source region
7. **Action completes** → Effects applied via dispatcher (`loop:exploreCompleted`, `user:locationCheck`)
8. **Mana depleted** → Loop resets or pauses depending on auto-restart setting

### Key Events

| Event | Published By | Description |
|-------|-------------|-------------|
| `loopState:manaChanged` | LoopState | Mana value updated |
| `loopState:xpChanged` | LoopState | Region XP changed |
| `loopState:queueUpdated` | LoopState | Action queue modified |
| `loopState:progressUpdated` | LoopState | Frame-by-frame progress tick |
| `loopState:actionCompleted` | LoopState | Single action finished |
| `loopState:queueCompleted` | LoopState | All actions in queue finished |
| `loopState:loopReset` | LoopState | Loop reset (mana refilled) |
| `loopState:pauseStateChanged` | LoopState | Processing state transition |
| `loopState:speedChanged` | LoopState | Game speed adjusted |
| `loopUI:modeChanged` | LoopUI | Loop mode toggled on/off |
| `costDataManager:loaded` | CostDataManager | Cost data loaded or generated |
| `costGenerator:progress` | CostGenerator | Cost generation progress update |

## Testing

### Test Modes

| URL Parameter | Description |
|---------------|-------------|
| `?mode=loops` | Normal Loops mode |
| `?mode=test-loops` | Loops with standard test suite |
| `?mode=test-loops-only` | Loops with only Loops-specific tests |

### Test Cases

The test suite (`frontend/modules/tests/testCases/loopsPanelTests.js`) covers:

1. **Initial Menu not processed** — Starting region isn't treated as an action
2. **Real actions processed** — Queued actions execute correctly
3. **Mana consumption** — Mana deducted proportional to action cost
4. **XP awarding** — XP gained matches mana spent
5. **Level up mechanics** — XP thresholds and cost reduction verified
6. **Speed adjustment** — Game speed affects processing rate
7. **Pause/resume** — Processing pauses and resumes correctly
8. **Auto-restart** — Queue restarts when mana depletes with auto-restart on
9. **Enter/exit loop mode** — Mode activation and deactivation

### Unit Tests

- `xpFormulas.test.js` — Tests for XP calculation formulas
- `queueAnalyzer.test.js` — Tests for queue analysis and cost calculations

## Current Status

The core systems are implemented and working: mana, XP, action queues, loop reset, cost calculations, cost generation, and the Loop Stats panel with cost predictions.

### Planned Features

- Missing item cost penalties (double cost if required item not collected in the current loop)
- Region graph visualization enhancements (pie chart nodes showing mana fractions, animated player movement)
- Global XP affecting game speed
- Server-side loop data persistence
- Inventory tab in the Loop Stats panel

## Further Reading

- [Loops Planning Document](../../../CC/docs/plans/partial/loops-planning-document.md)
- [Loop Stats Panel UI](../../../CC/docs/plans/completed/loops-panel-ui-upgrade.md)
- [Loops Testing Options Report](../../../CC/docs/plans/completed/loops-testing-options-report.md)
