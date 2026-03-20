# Frontend Web Client

The frontend is a modular, single-page web application for Archipelago game tracking and analysis. It runs entirely in the browser with heavy computation offloaded to Web Workers.

## Quick Start

```bash
# Start local development server
python -m http.server 8000

# Open in browser
open http://localhost:8000/frontend/
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

- **[Module Reference](../docs/json/modules/)** - Detailed module documentation
- **[Developer Guides](../docs/json/developer/guides/)** - Development guides
- **[Architecture](../docs/json/developer/architecture.md)** - System design overview
- **[Event System](../docs/json/developer/guides/event-system.md)** - EventBus and EventDispatcher
- **[State Management](../docs/json/developer/guides/state-management.md)** - StateManager details

## Browser Support

- Chrome/Edge (recommended)
- Firefox
- Safari (limited testing)

Requires ES modules support and Web Workers.
