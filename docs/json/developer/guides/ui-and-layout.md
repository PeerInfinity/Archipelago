# Developer Guide: UI and Layout System

The web client's user interface is built on a combination of the powerful **Golden Layout** library for panel management and a **modular component system** where each UI panel is a self-contained JavaScript class.

## Golden Layout: The Window Manager

Golden Layout is the foundation of the UI. It is a web-based window manager that allows for a highly customizable, multi-panel interface similar to a desktop application.

-   **Panels and Stacks:** All UI components live inside panels. Panels can be arranged into rows and columns, or stacked on top of each other to create tabbed views.
-   **Dynamic Layout:** Users can drag, drop, resize, and close panels. Golden Layout handles the complex logic of rearranging the layout tree.
-   **Configuration (`layout_presets.json`):** The initial arrangement of panels is defined in `layout_presets.json`. This file contains one or more named layout configurations (e.g., `"default"`, `"compact"`). The active layout is chosen based on the application's current mode and settings.
-   **Persistence:** A user's custom layout is automatically saved to their browser's `localStorage` and will be restored on their next visit.

## The Panel Manager (`panelManager.js`)

The `PanelManager` is a core service that acts as the primary intermediary between the application and the Golden Layout instance. While `init.js` handles the initial setup, the `PanelManager` provides a clean API for dynamic interactions.

-   **Component Registration:** `init.js` orchestrates the initial registration by taking all panel classes declared by modules in the `centralRegistry` and registering them with the Golden Layout instance before loading a layout.
-   **Dynamic Panel Creation:** The `panelManagerInstance.createPanelForComponent()` method allows any part of the application to programmatically add a new panel to the layout at runtime.
-   **Panel Lifecycle:** The `PanelManager` ensures that a panel's UI class `destroy()` method is called when its Golden Layout container is closed, preventing memory leaks.
-   **Activation:** The `panelManagerInstance.activatePanel()` method can be used to bring a specific panel's tab into focus.

## The Module UI Component Pattern

Every UI panel in the application is a JavaScript class that follows a standard pattern. This ensures that it can be correctly instantiated and managed by the Golden Layout system.

### Example UI Class (`MyModuleUI.js`)

```javascript
import eventBus from '../../app/core/eventBus.js';

export class MyModuleUI {
  constructor(container, componentState) {
    // Golden Layout provides this 'container' object.
    // 'container.element' is the actual DOM element for our panel.
    this.container = container;
    this.componentState = componentState; // State persisted by Golden Layout (if any).

    // 1. Create the root DOM element for this panel.
    this.rootElement = document.createElement('div');
    this.rootElement.innerHTML = `<h2>My Module Panel</h2>`;

    // 2. Append the root element to the Golden Layout container.
    this.container.element.appendChild(this.rootElement);

    // 3. Set up event listeners for this panel.
    this._subscribeToEvents();

    // 4. Attach listeners for Golden Layout's own lifecycle events.
    this.container.on('destroy', () => this.destroy());
    this.container.on('show', () => this.onPanelShow());
  }

  // Called when the panel is shown (e.g., its tab is clicked).
  onPanelShow() {
    console.log('My Module Panel is now visible!');
    // A good place to refresh data if it might be stale.
    this.render();
  }

  // Main rendering logic.
  render() {
    // Update the content of this.rootElement based on the latest game state.
  }

  // Main cleanup logic, called when the panel is closed.
  destroy() {
    // Unsubscribe from all eventBus listeners to prevent memory leaks.
    this._unsubscribeFromEvents();
  }

  _subscribeToEvents() {
    // It's crucial to store the unsubscribe handle returned by eventBus.subscribe.
    this.unsubscribeHandle = eventBus.subscribe('some:event', (data) => {
      this.render();
    }, 'myModule');
  }

  _unsubscribeFromEvents() {
    if (this.unsubscribeHandle) {
      this.unsubscribeHandle();
    }
  }
}
```

### Module UI Registration

For a UI class to be used by Golden Layout, it must be registered with the `centralRegistry` during the application's [registration phase](./module-system.md).

In your module's `index.js`:

```javascript
import { MyModuleUI } from './MyModuleUI.js';

export function register(registrationApi) {
  // Tell the system that the componentType 'myModulePanel' should be
  // created using the MyModuleUI class constructor.
  registrationApi.registerPanelComponent('myModulePanel', MyModuleUI);
}```

This `componentType` string (`'myModulePanel'`) is the same string used in `layout_presets.json` to define where this panel should appear in the default layout.