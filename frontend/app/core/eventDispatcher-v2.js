// frontend/app/core/eventDispatcher.js

/**
 * Manages event handling based on module load priority.
 * Allows prioritized handling and explicit propagation down the priority chain.
 */
class EventDispatcher {
  constructor() {
    // Stores handlers: Map<eventName, Array<{moduleId, handlerFunction}>>
    this.handlers = new Map();

    // Stores data loaded from modules.json
    this.moduleData = {
      definitions: {}, // { moduleId: { path, description, enabled }, ... }
      loadPriority: [], // Array of moduleIds in load order
    };

    this.initialized = false;
    console.log('EventDispatcher instance created.');
  }

  /**
   * Initializes the dispatcher with module configuration data.
   * MUST be called after modules are registered and before any events are published.
   * @param {object} modulesData - The parsed content of modules.json
   * @param {Map<string, Array<{moduleId: string, handler: function}>>} registeredHandlers - Handlers collected during module registration.
   */
  initialize(modulesData, registeredHandlers) {
    if (this.initialized) {
      console.warn('EventDispatcher already initialized.');
      return;
    }
    if (
      !modulesData ||
      !modulesData.loadPriority ||
      !modulesData.moduleDefinitions
    ) {
      console.error(
        'EventDispatcher: Invalid modulesData provided during initialization.'
      );
      return;
    }
    if (!registeredHandlers || !(registeredHandlers instanceof Map)) {
      console.error(
        'EventDispatcher: Invalid registeredHandlers provided during initialization.'
      );
      return;
    }

    console.log('Initializing EventDispatcher...');
    this.moduleData = modulesData;
    this.handlers = registeredHandlers; // Use the handlers collected during registration

    // Pre-calculate priority indices for faster lookup
    this.priorityMap = new Map();
    this.moduleData.loadPriority.forEach((moduleId, index) => {
      this.priorityMap.set(moduleId, index);
    });

    this.initialized = true;
    console.log('EventDispatcher initialized successfully.');
    // console.log('Registered Handlers:', this.handlers); // Optional: Debugging
    // console.log('Module Priority:', this.moduleData.loadPriority); // Optional: Debugging
  }

  /**
   * Publishes an event to the highest-priority enabled module that handles it.
   * @param {string} eventName - The name of the event to publish.
   * @param {any} data - The data payload associated with the event.
   */
  publish(eventName, data) {
    if (!this.initialized) {
      console.warn(
        `EventDispatcher not initialized. Cannot publish event: ${eventName}`
      );
      return;
    }
    // console.log(`[Dispatcher] Publishing event: ${eventName}`, data); // Debug log

    const potentialHandlers = this.handlers.get(eventName) || [];
    if (potentialHandlers.length === 0) {
      // console.log(`[Dispatcher] No handlers registered for ${eventName}`); // Debug log
      return; // No handlers registered for this event
    }

    // Filter for enabled modules and sort by reverse load priority (highest first)
    const eligibleHandlers = potentialHandlers
      .filter((entry) => this.moduleData.definitions[entry.moduleId]?.enabled)
      .sort((a, b) => {
        const priorityA = this.priorityMap.get(a.moduleId) ?? -1;
        const priorityB = this.priorityMap.get(b.moduleId) ?? -1;
        return priorityB - priorityA; // Descending order of priority index
      });

    if (eligibleHandlers.length === 0) {
      // console.log(`[Dispatcher] No *enabled* handlers for ${eventName}`); // Debug log
      return; // No enabled modules handle this event
    }

    // Get the highest priority handler
    const handlerEntry = eligibleHandlers[0];

    // console.log(`[Dispatcher] Dispatching ${eventName} to module: ${handlerEntry.moduleId}`); // Debug log
    try {
      // Execute the handler
      handlerEntry.handler(data);
    } catch (error) {
      console.error(
        `[EventDispatcher] Error executing handler for event "${eventName}" in module "${handlerEntry.moduleId}":`,
        error
      );
    }
  }

  /**
   * Publishes an event to the next-highest priority enabled module *before* the origin module.
   * This is intended to be called *by* a module's event handler to propagate the event down the chain.
   * @param {string} originModuleId - The ID of the module calling this function.
   * @param {string} eventName - The name of the event to publish.
   * @param {any} data - The data payload associated with the event.
   */
  publishToPredecessors(originModuleId, eventName, data) {
    if (!this.initialized) {
      console.warn(
        `EventDispatcher not initialized. Cannot publishToPredecessors event: ${eventName} from ${originModuleId}`
      );
      return;
    }
    // console.log(`[Dispatcher] Propagating event: ${eventName} from ${originModuleId} to predecessors`, data); // Debug log

    const originPriority = this.priorityMap.get(originModuleId);
    if (originPriority === undefined) {
      console.warn(
        `[EventDispatcher] publishToPredecessors called by unknown module: ${originModuleId}`
      );
      return;
    }

    const potentialHandlers = this.handlers.get(eventName) || [];
    if (potentialHandlers.length === 0) {
      // console.log(`[Dispatcher] No handlers registered for ${eventName} (in predecessors)`); // Debug log
      return; // No handlers registered for this event
    }

    // Filter for enabled modules loaded *before* the origin module, then sort by highest priority first
    const eligiblePredecessors = potentialHandlers
      .filter((entry) => {
        const entryPriority = this.priorityMap.get(entry.moduleId);
        return (
          this.moduleData.definitions[entry.moduleId]?.enabled &&
          entryPriority !== undefined &&
          entryPriority < originPriority // Only modules loaded BEFORE the origin
        );
      })
      .sort((a, b) => {
        const priorityA = this.priorityMap.get(a.moduleId);
        const priorityB = this.priorityMap.get(b.moduleId);
        return priorityB - priorityA; // Descending order (highest priority first)
      });

    if (eligiblePredecessors.length === 0) {
      // console.log(`[Dispatcher] No enabled predecessors handle ${eventName} for ${originModuleId}`); // Debug log
      return; // No preceding enabled modules handle this event
    }

    // Get the highest priority predecessor handler
    const handlerEntry = eligiblePredecessors[0];

    // console.log(`[Dispatcher] Dispatching ${eventName} (predecessor) to module: ${handlerEntry.moduleId}`); // Debug log
    try {
      // Execute the handler
      handlerEntry.handler(data);
    } catch (error) {
      console.error(
        `[EventDispatcher] Error executing predecessor handler for event "${eventName}" in module "${handlerEntry.moduleId}":`,
        error
      );
    }
  }

  /**
   * Method for modules to register their handlers during the Registration phase.
   * This method assumes it's called by the central registration logic in init.js.
   * @param {string} moduleId - The ID of the module registering the handler.
   * @param {string} eventName - The name of the event to handle.
   * @param {function} handlerFunction - The function to execute when the event occurs.
   */
  _registerEventHandler(moduleId, eventName, handlerFunction) {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }
    const handlersArray = this.handlers.get(eventName);

    // Avoid duplicate registrations from the same module for the same event
    if (
      !handlersArray.some(
        (h) => h.moduleId === moduleId && h.handler === handlerFunction
      )
    ) {
      handlersArray.push({ moduleId, handler: handlerFunction });
      // console.log(`[Dispatcher Registry] Registered handler for "${eventName}" from module "${moduleId}"`);
    }
  }

  // --- API for Registration Phase ---
  /**
   * Provides methods for modules to use during the registration phase.
   * @param {object} registry - The central application registry object.
   * @returns {object} The registration API.
   */
  getRegistrationApi(registry) {
    // Ensure registry exists and has the handlers map initialized
    if (
      !registry ||
      !registry.eventHandlers ||
      !(registry.eventHandlers instanceof Map)
    ) {
      console.error(
        'EventDispatcher: Invalid registry provided to getRegistrationApi.'
      );
      // Return a dummy API to prevent crashes, but log the error.
      return {
        registerEventHandler: () => {},
        // Add other dummy registration methods if needed
      };
    }

    return {
      /**
       * Allows a module to declare an event handler function.
       * @param {string} eventName - The event name.
       * @param {function} handlerFunction - The handler function (should accept eventData).
       */
      registerEventHandler: (eventName, handlerFunction) => {
        // This needs the moduleId, which isn't directly available here.
        // The calling code in init.js MUST pass the moduleId.
        // This internal method should ideally not be exposed directly.
        // Instead, the loop in init.js should call this._registerEventHandler.
        console.error(
          'registerEventHandler should be called via the registration loop in init.js, not directly via API.'
        );
      },
      // Add other registration methods needed by modules here
      // registerPanelComponent: (...)
      // registerSettingsSchema: (...)
      // registerPublicFunction: (...)
    };
  }

  // --- API for Initialization Phase ---
  /**
   * Provides methods and data for modules to use during the initialization phase.
   * @param {string} moduleId - The ID of the module being initialized.
   * @returns {object} The initialization API for the specific module.
   */
  getInitializationApi(moduleId) {
    // Ensure dispatcher is initialized before providing API
    if (!this.initialized) {
      console.error(
        `EventDispatcher: Cannot get initApi for ${moduleId} before dispatcher is initialized.`
      );
      // Return a dummy API
      return {
        getSettings: () => ({}),
        getDispatcher: () => ({
          publish: () => {},
          publishToPredecessors: () => {},
        }),
        getSingleton: () => null,
        getModuleFunction: () => null,
      };
    }

    // Pre-bind publishToPredecessors with the moduleId
    const boundPublishToPredecessors = this.publishToPredecessors.bind(
      this,
      moduleId
    );

    return {
      /**
       * Retrieves the specific settings object for this module.
       * Requires settingsManager to be available.
       */
      getSettings: () => {
        // Assumes settingsManager is globally available or passed differently
        return window.settingsManager?.getModuleSettings(moduleId) || {};
      },
      /**
       * Returns the dispatcher's publish functions.
       */
      getDispatcher: () => ({
        publish: this.publish.bind(this),
        publishToPredecessors: boundPublishToPredecessors,
      }),
      /**
       * Retrieves a core singleton instance.
       * Requires singletons to be globally available or managed centrally.
       */
      getSingleton: (name) => {
        // Example implementation - adjust based on actual singleton management
        switch (name) {
          case 'stateManager':
            return window.stateManager; // Assumes global
          case 'eventBus':
            return window.eventBus; // Assumes global/imported eventBus
          case 'discoveryState':
            return window.discoveryStateSingleton; // Assumes global
          case 'loopState':
            return window.loopStateSingleton; // Assumes global
          default:
            return null;
        }
      },
      /**
       * Retrieves a public function registered by another module.
       * Requires access to the central registry. USE WITH CAUTION.
       */
      getModuleFunction: (targetModuleId, functionName) => {
        // This requires the dispatcher (or init.js) to hold the registry
        // For simplicity now, assume registry is accessible, e.g., via window
        const registry = window.appRegistry; // Example: assumes registry is global
        return (
          registry?.publicFunctions?.get(targetModuleId)?.get(functionName) ||
          null
        );
      },
    };
  }
}

// Create and export a singleton instance
const eventDispatcher = new EventDispatcher();
export default eventDispatcher;
