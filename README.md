# Frontend Web Client

**[Live demo](https://peerinfinity.github.io/Archipelago-CC/)**

The frontend is a browser-based tracker and client for [Archipelago](https://archipelago.gg/) multiworld randomizer games. It connects to an Archipelago server and tracks your game state in real-time — when you receive items or check locations, the tracker updates automatically, re-evaluating the entire game world to show you exactly which locations and exits are now accessible.

## What It Does

The tracker loads a `rules.json` file (produced by the [exporter](../exporter/README.md) during seed generation) that contains your game's complete logic: items, locations, regions, access rules, and connections. With this, it provides:

- **Logic-aware tracking** — Locations are color-coded by accessibility: green (reachable), red (inaccessible), yellow (partially accessible), black (checked). Rules update instantly as your inventory changes.
- **Visual rule trees** — Expand any location or exit to see exactly what's required, with satisfied conditions in green and missing ones in red.
- **Region graph** — Interactive [Cytoscape](https://js.cytoscape.org/) visualization showing how all regions connect, colored by reachability.
- **Discovery mode** — Regions and exits are revealed as you explore them, rather than shown all at once — useful for entrance shuffle seeds.
- **Path analysis** — Select a target region to see all possible paths and exactly which items you need.
- **Customizable layout** — Drag, drop, stack, and resize panels using [Golden Layout](http://golden-layout.com/) to create your ideal workspace.

## Game Modes

Beyond standard tracking, the frontend supports alternate game modes activated via URL parameters:

| Mode | URL Parameter | Description |
|------|---------------|-------------|
| **Standard** | *(default)* | Connect to an Archipelago server and track your game |
| **[MetaMath](../worlds/metamath/docs/README.md)** | `?mode=metamath` | Play through mathematical proofs as Archipelago worlds |
| **[DepGraph](../docs/json/features/depgraph.md)** | `?mode=depgraph` | Navigate dependency graphs (tech trees, skill trees) |
| **[Journey to Ascension](../worlds/jta/docs/en_Journey%20to%20Ascension.md)** | `?mode=jta` | Incremental/idle game with randomized perks |
| **[Loops](../docs/json/features/loops.md)** | `?mode=loops` | Incremental/idle mode — queue actions, spend mana, earn XP |
| **[Maze Metagame](../docs/json/features/maze-metagame.md)** | `?metagame=mazegame` | Solve mazes before checking locations or moving regions |
| **Text Adventure** | *(via module config)* | Play the randomizer as a text-based adventure |

## Getting Started

### Try the live demo

Open the [live demo](https://peerinfinity.github.io/Archipelago-CC/) — it loads with a default game preset so you can explore the interface immediately. Use the Presets panel to switch between 158 supported games.

### Use with your own games

To track your own multiworld, you need the [exporter](../exporter/README.md) to produce `rules.json` files during seed generation. Two options:

1. **JSON Tools Installer** (recommended) — Download the [`.apworld` package](https://github.com/PeerInfinity/Archipelago-CC/raw/main/apworlds/json_tools_installer.apworld), drop it into your Archipelago `custom_worlds/` directory, and install from the Launcher. No repository clone needed.
2. **Clone the repository** — For full source access. See the [Quick Start Guide](../docs/json/user/quick-start.md) for step-by-step instructions.

### Run locally

```bash
# Start local development server
python -m http.server 8000

# Open in browser
open http://localhost:8000/frontend/
```

### Connect to a server

Open the Console panel, enter your server address (e.g., `archipelago.gg:12345`), and click Connect. Or use URL parameters for auto-connect:

```
http://localhost:8000/frontend/?game=adventure&seed=1&autoConnect=true&server=ws://localhost:38281&playerName=Player1
```

## Directory Structure

```
frontend/
├── index.html              # Main HTML entry point
├── init.js                 # Application initialization
├── init-bundled.js         # Bundled initialization (standalone)
│
├── app/core/               # Core services
│   ├── centralRegistry.js  # Module capability registry
│   ├── eventBus.js         # Pub/sub event system
│   ├── eventDispatcher.js  # Prioritized event handling
│   ├── panelManager.js     # Golden Layout integration
│   ├── settingsManager.js  # Application settings
│   ├── loggerService.js    # Structured logging
│   └── universalLogger.js  # Cross-context logging
│
├── modules/                # Feature modules (48 modules)
│   ├── stateManager/       # Core state management (Web Worker)
│   ├── client/             # Archipelago server connection
│   ├── locations/          # Location tracking UI
│   ├── inventory/          # Item inventory UI
│   ├── regions/            # Region display UI
│   └── ...                 # See docs/json/modules/
│
├── libs/                   # Third-party libraries
│   ├── golden-layout/      # Dockable panel system
│   ├── cytoscape/          # Graph visualization
│   ├── codemirror6/        # Code editor
│   ├── jquery/             # DOM utilities
│   └── jszip/              # ZIP file handling
│
├── presets/                # Game rule presets (158 games)
├── schema/                 # JSON schemas
├── styles/                 # CSS stylesheets
├── utils/                  # Utility functions
└── public/                 # Static assets
```

## Configuration Files

| File | Purpose |
|------|---------|
| `module-configs/modules.json` | Module manifest (enabled modules, load order) |
| `modes.json` | Application modes (default, test, adventure, etc.) |
| `settings/settings.json` | Default application settings |
| `settings/settings.schema.json` | Settings validation schema |
| `layout-configs/layout_presets.json` | UI layout configurations |
| `test-configs/playwright_tests_config*.json` | Test configurations |

## Architecture

### Module System

The application is built on a modular architecture:

1. **Registration Phase:** Modules declare capabilities via `register()`
2. **Initialization Phase:** Modules initialize via `initialize()` and `postInitialize()`
3. **Runtime:** Modules communicate via EventBus and EventDispatcher

```javascript
// Module structure
export const moduleInfo = {
    name: 'myModule',
    componentType: 'myModulePanel'
};

export function register(api) {
    api.registerPanelComponent('myModulePanel', MyModuleUI);
}

export function initialize(api) {
    // Setup code
}
```

### State Management

Game state is managed in a Web Worker for performance:

```
Main Thread                    Web Worker
┌─────────────────┐            ┌─────────────────┐
│ StateManagerProxy│◄─────────►│  StateManager   │
│ (commands/snapshots)         │ (authoritative) │
└─────────────────┘            └─────────────────┘
```

### Event System

- **EventBus:** Pub/sub for broadcast notifications
- **EventDispatcher:** Prioritized handling for commands

```javascript
// Publishing
eventBus.publish('myModule:eventName', { data });

// Subscribing
eventBus.subscribe('stateManager:snapshotUpdated', handler);
```

## Development

### Adding a New Module

1. Create directory: `modules/myModule/`
2. Create `index.js` with module exports
3. Create UI class (e.g., `myModuleUI.js`)
4. Register in `module-configs/modules.json`

See [Creating Modules Guide](../docs/json/developer/guides/creating-modules.md).

### Running Tests

```bash
# Run all tests
npm test

# Run specific test mode
npm test -- --mode=test-spoilers

# Run with visible browser
npm run test:headed
```

### Debugging

- Open browser DevTools (F12)
- Check console for structured logs
- Use Events panel to inspect event flow
- Use Editor panel to view state data

## Key Modules

| Module | Purpose |
|--------|---------|
| `stateManager` | Game state, rule evaluation, accessibility |
| `client` | Archipelago server WebSocket connection |
| `locations` | Location tracking and display |
| `inventory` | Item management |
| `regions` | Region navigation |
| `regionGraph` | Visual region graph |
| `spoilerTest` | Logic validation testing |

## Related Documentation

- **[Quick Start Guide](../docs/json/user/quick-start.md)** - Getting started with the web client
- **[Project Overview](../docs/json/user/overview.md)** - What the project does and how to use it
- **[Documentation Portal](../docs/json/README.md)** - Full documentation index
- **[Module Reference](../docs/json/modules/)** - Detailed module documentation
- **[Developer Guides](../docs/json/developer/guides/)** - Development guides
- **[Architecture](../docs/json/developer/architecture.md)** - System design overview
- **[Event System](../docs/json/developer/guides/event-system.md)** - EventBus and EventDispatcher
- **[State Management](../docs/json/developer/guides/state-management.md)** - StateManager details
- **[JSON Schema](schema/README.md)** - Schema documentation for rules files
- **[Project Roadmap](../docs/json/project-roadmap.md)** - Development priorities and future features

## Browser Support

- Chrome/Edge (recommended)
- Firefox
- Safari (limited testing)

Requires ES modules support and Web Workers.
