# Developer Guide: The Module System

The frontend application is built on a powerful, custom module system designed for flexibility and clean separation of concerns. This guide explains the core components of this system and the lifecycle of a module.

## Core Concepts

-   **Module:** A self-contained unit of functionality, typically corresponding to a UI panel (e.g., `inventory`, `locations`) or a core service (e.g., `stateManager`, `client`). Each module resides in its own sub-directory in `frontend/modules/`.
-   **`init.js`:** The main application entry point. It acts as the **module loader and orchestrator**, responsible for loading all modules, managing their lifecycle, and setting up core services.
-   **`modules.json`:** A configuration file that serves as the **manifest of all known modules**. It defines each module's path, its default enabled state, and, most importantly, its `loadPriority`.
-   **`centralRegistry.js`:** A singleton that acts as a central "phone book" during the registration phase. Modules declare their capabilities (panels, event handlers, etc.) to the registry, and `init.js` uses it to wire up the application.

## The Module Lifecycle

The application starts and modules come online in a carefully orchestrated, three-phase process managed by `init.js`.

### Phase 1: Module Import & Registration

1.  `init.js` reads `modules.json` to get the list of all potential modules and their load priority.
2.  It uses dynamic `import()` to load the `index.js` file for **every module** defined in the manifest.
3.  As each module is imported, `init.js` immediately calls its exported `register(registrationApi)` function.
4.  **During registration, a module's only job is to declare its capabilities to the `centralRegistry`** using the provided `registrationApi`. It must not perform any setup, create instances, or try to access other modules.

    ```javascript
    // In your module's index.js
    export function register(registrationApi) {
      // Declare that this module provides a UI panel for Golden Layout
      registrationApi.registerPanelComponent('inventoryPanel', InventoryUI);

      // Declare that this module will handle a specific dispatched event
      registrationApi.registerDispatcherReceiver('user:locationCheck', handleLocationCheck);
      
      // Declare a public function that other modules can call
      registrationApi.registerPublicFunction('MyModuleAPI', 'doSomething', myCoolFunction);
    }
    ```

### Phase 2: Core Service & UI Initialization

1.  After all modules are registered, `init.js` instantiates core services like the `EventDispatcher`.
2.  It then initializes Golden Layout, using `centralRegistry.getAllPanelComponents()` to register all the UI panel classes that the modules declared in Phase 1.
3.  It loads a layout preset, which causes Golden Layout to create the visible panels by calling the constructor for each corresponding UI class.

### Phase 3: Module Initialization & Post-Initialization

1.  `init.js` iterates through the `loadPriority` array from `modules.json`.
2.  For each **enabled** module, it calls its exported `initialize(moduleId, priorityIndex, initializationApi)` function.
3.  **During initialization, a module can perform its main setup.** It can use the `initializationApi` to get its settings, access core services like the `eventBus`, and set up its own internal state or singletons. It **must not** yet attempt to communicate with other modules, as they may not have been initialized.
4.  After all enabled modules have been initialized, `init.js` performs a final loop, calling `postInitialize(initializationApi)` on any module that has this function.
5.  **During post-initialization, it is finally safe for modules to interact with each other.** This is the correct phase to subscribe to events on the `eventBus` or call public functions on other modules via the `centralRegistry`.

This phased approach ensures that all modules and their capabilities are known before any module tries to interact with another, preventing race conditions and dependency issues.

### Future Direction

The module system is designed with future enhancements in mind. A key planned feature is the ability to **dynamically load external modules** from a URL. This will allow for even greater flexibility and extensibility. Please note that the implementation details for planned features are subject to change.