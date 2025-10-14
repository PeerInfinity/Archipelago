# Developer Guide: Creating a New Module

This guide provides a step-by-step walkthrough for creating a new frontend module. Following this pattern ensures your module integrates correctly with the application's lifecycle, layout, and event systems.

As an example, we will create a simple "Greeter" module that displays a welcome message and reacts to an event.

## Naming Conventions

Before creating a module, it's important to understand the project's naming conventions. The codebase follows a consistent pattern based on whether a name is a single word or a compound name:

### Single-Word Concepts → Use Plural

When a module represents a collection or capability with a single-word name, use the **plural** form:

- **Module directory**: `regions/`, `locations/`, `exits/`, `dungeons/`, `modules/`, `presets/`, `tests/`
- **Module name** (in `modules.json`): `"regions"`, `"locations"`, `"exits"`, `"dungeons"`
- **Component type**: `"regionsPanel"`, `"locationsPanel"`, `"exitsPanel"`, `"dungeonsPanel"`

### Compound Names → Singular Noun

When a module name is a compound (modifier + noun), keep the **noun singular**:

- **Module directory**: `regionGraph/`, `pathAnalyzer/`, `playerState/`, `spoilerChecklist/`
- **Module name**: `"regionGraph"`, `"pathAnalyzer"`, `"playerState"`, `"spoilerChecklist"`
- **Component type**: `"regionGraphPanel"`, `"pathAnalyzerPanel"`, `"playerStatePanel"`

**Rationale**: In compound names, the noun is modified by another word, making it singular. For example:
- "region graph" = a graph *of* regions (one graph, many regions)
- "player state" = the state *of* a player (one state, one player)
- "spoiler checklist" = a checklist *for* spoilers (one checklist, many spoilers)

### UI Class Names → Always Singular

Regardless of the module name, UI class names should always be **singular** with a "UI" suffix:

- **UI class file**: `regionUI.js`, `locationUI.js`, `exitUI.js`, `dungeonUI.js`
- **UI class name**: `RegionUI`, `LocationUI`, `ExitUI`, `DungeonUI`

**Rationale**: Each UI class represents a single panel or component instance, so it should be singular even if the module deals with multiple entities.

### Examples

| Module Type | Directory | Module Name | Component Type | UI Class File | UI Class Name |
|-------------|-----------|-------------|----------------|---------------|---------------|
| Single-word | `regions/` | `regions` | `regionsPanel` | `regionUI.js` | `RegionUI` |
| Single-word | `locations/` | `locations` | `locationsPanel` | `locationUI.js` | `LocationUI` |
| Compound | `regionGraph/` | `regionGraph` | `regionGraphPanel` | `regionGraphUI.js` | `RegionGraphUI` |
| Compound | `playerState/` | `playerState` | N/A (no panel) | N/A | N/A |
| Compound | `spoilerChecklist/` | `spoilerChecklist` | `spoilerChecklistPanel` | `spoilerChecklistUI.js` | `SpoilerChecklistUI` |

## Step 1: Create the Module Directory and Files

First, create a new directory for your module inside `frontend/modules/`.

```
frontend/
└── modules/
    └── greeter/
        ├── index.js          # Module entry point and registration
        └── greeterUI.js      # The UI class for the panel
```

## Step 2: Define the UI Component (`greeterUI.js`)

This class will contain the logic for your module's UI panel. It must follow the standard component pattern to be managed by Golden Layout.

```javascript
// frontend/modules/greeter/greeterUI.js

import eventBus from '../../app/core/eventBus.js';

export class GreeterUI {
  constructor(container, componentState) {
    // 1. Store the Golden Layout container
    this.container = container;

    // 2. Create the root DOM element for the panel
    this.rootElement = document.createElement('div');
    this.rootElement.style.padding = '15px';
    this.rootElement.innerHTML = `
      <h2>Welcome!</h2>
      <p>This is the Greeter Module.</p>
      <p>Last notification received: <strong id="last-notification">None</strong></p>
    `;

    // 3. Append the root element to the GL container's element
    this.container.element.appendChild(this.rootElement);

    // 4. Set up internal state and event listeners
    this.lastNotificationElement = this.rootElement.querySelector('#last-notification');
    this.unsubscribeHandle = null;

    // 5. Attach listeners for Golden Layout lifecycle events
    this.container.on('show', () => this.onPanelShow());
    this.container.on('destroy', () => this.destroy());

    // It's best practice to subscribe to events in a dedicated method.
    this._subscribeToEvents();
  }

  // Called when the panel's tab is selected
  onPanelShow() {
    console.log('[GreeterUI] Panel is now visible.');
  }

  // Subscribe to events from the eventBus
  _subscribeToEvents() {
    // Unsubscribe from previous listener if it exists to prevent duplicates
    if (this.unsubscribeHandle) this.unsubscribeHandle();

    // Listen for system-wide notifications
    this.unsubscribeHandle = eventBus.subscribe('ui:notification', (data) => {
      if (this.lastNotificationElement) {
        this.lastNotificationElement.textContent = data.message || 'Unknown notification';
      }
    }, 'greeter'); // Pass module ID for tracking
  }

  // Clean up when the panel is closed
  destroy() {
    console.log('[GreeterUI] Panel is being destroyed. Cleaning up.');
    if (this.unsubscribeHandle) {
      this.unsubscribeHandle();
    }
  }
}
```

## Step 3: Create the Module Entry Point (`index.js`)

This file is the main entry point for your module. Its job is to register the module's capabilities with the `centralRegistry`.

```javascript
// frontend/modules/greeter/index.js

import { GreeterUI } from './greeterUI.js';

// Define metadata for the module (optional but good practice)
export const moduleInfo = {
  name: 'Greeter',
  description: 'A simple example module that displays a welcome message.',
};

// The registration function called by init.js during Phase 1
export function register(registrationApi) {
  console.log('[Greeter Module] Registering...');

  // Register our UI class as a panel component that Golden Layout can use.
  // The first argument is the 'componentType' used in layout configurations.
  registrationApi.registerPanelComponent('greeterPanel', GreeterUI);
}

// (Optional) The initialize function for more complex setup, called in Phase 3.
export function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(`[Greeter Module] Initializing with ID: ${moduleId}`);
  // This is where you would get settings or the dispatcher if needed.
}
```

## Step 4: Add the Module to the Manifest (`modules.json`)

Now, we need to tell the application about our new module.

1.  Open `frontend/modules.json`.
2.  Add an entry for `greeter` to the `moduleDefinitions` object.

    ```json
    {
      "moduleDefinitions": {
        "greeter": {
          "path": "./modules/greeter/index.js",
          "enabled": true
        },
        // ... other modules
      },
      "loadPriority": [
        // ...
      ]
    }
    ```

3.  Add `"greeter"` to the `loadPriority` array. The position determines its initialization order relative to other modules. For a simple UI module, placing it near the end is usually safe.

    ```json
    {
      // ... moduleDefinitions
      "loadPriority": [
        // ... other modules
        "tests",
        "greeter" // Add our new module here
      ]
    }
    ```

## Step 5: Add the Panel to the Layout (`layout_presets.json`)

Finally, we need to tell Golden Layout where to put our new panel.

1.  Open `frontend/layout_presets.json`.
2.  Find the layout you want to modify (e.g., `"default"`).
3.  Add a new component object to the `content` array of a `stack`. The `componentType` must match what you used in `registerPanelComponent`.

    ```json
    // Inside the "default" layout definition...
    {
      "type": "stack",
      "width": 20,
      "content": [
        {
          "type": "component",
          "componentType": "inventoryPanel",
          "title": "Inventory"
        },
        {
          "type": "component",
          "componentType": "greeterPanel", // Our new panel
          "title": "Welcome" // The title for the tab
        }
        // ... other components in this stack
      ]
    }
    ```

## Step 6: Launch and Verify

1.  Make sure your local HTTP server is running.
2.  Refresh the web client in your browser.
3.  You should now see a "Welcome" tab in the same stack as the "Inventory" panel.
4.  To test the event subscription, you can publish a notification event from the browser's developer console:
    ```javascript
    eventBus.publish('ui:notification', { message: 'Hello from the console!' }, 'console');
    ```
    The text in your Greeter panel should update to "Hello from the console!".

You have successfully created and integrated a new frontend module.