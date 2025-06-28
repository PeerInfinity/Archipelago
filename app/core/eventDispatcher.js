// frontend/app/core/eventDispatcher.js

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('eventDispatcher', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[eventDispatcher] ${message}`, ...data);
  }
}

/**
 * Manages event handling based on module load priority.
 * Allows prioritized handling and explicit propagation down the priority chain.
 */
class EventDispatcher {
  /**
   * Constructs the EventDispatcher.
   * @param {function(): Map<string, Array<{moduleId: string, handlerFunction: Function}>>} getHandlersFunc - Function to get the current map of registered event handlers.
   * @param {function(): Array<string>} getLoadPriorityFunc - Function to get the current load priority array.
   * @param {function(string): boolean} isModuleEnabledFunc - Function to check if a module is currently enabled by its ID.
   */
  constructor(getHandlersFunc, getLoadPriorityFunc, isModuleEnabledFunc) {
    if (typeof getHandlersFunc !== 'function') {
      throw new Error(
        'EventDispatcher: getHandlersFunc is required and must be a function.'
      );
    }
    if (typeof getLoadPriorityFunc !== 'function') {
      throw new Error(
        'EventDispatcher: getLoadPriorityFunc is required and must be a function.'
      );
    }
    if (typeof isModuleEnabledFunc !== 'function') {
      throw new Error(
        'EventDispatcher: isModuleEnabledFunc is required and must be a function.'
      );
    }

    // Store the functions to retrieve dynamic data
    this.getHandlers = getHandlersFunc;
    this.getLoadPriority = getLoadPriorityFunc;
    this.isModuleEnabled = isModuleEnabledFunc;

    log('info', 'EventDispatcher instance created (dynamic data fetching).');
  }

  /**
   * Helper to get priority index on the fly.
   * @param {string} moduleId
   * @returns {number} Priority index or -1 if not found.
   */
  _getPriorityIndex(moduleId) {
    const loadPriority = this.getLoadPriority();
    return loadPriority.indexOf(moduleId);
  }

  /**
   * Publishes an event to the highest (or lowest) priority enabled module that handles it.
   * @param {string} eventName - The name of the event to publish.
   * @param {any} data - The data payload associated with the event.
   * @param {object} [options={}] - Optional parameters.
   * @param {'top'|'bottom'} [options.initialTarget='bottom'] - Order to check handlers.
   */
  publish(eventName, data, options = {}) {
    const { initialTarget = 'bottom' } = options;

    const allHandlers = this.getHandlers(); // Get current handlers
    const potentialHandlers = allHandlers.get(eventName) || [];

    log(
      'info',
      `[EventDispatcher.publish] Event: ${eventName}, initialTarget: ${initialTarget}, All Handlers Map Size: ${allHandlers.size}, Potential Handlers for Event:`,
      JSON.parse(
        JSON.stringify(
          potentialHandlers.map((h) => ({
            moduleId: h.moduleId,
            funcName: h.handlerFunction.name,
          }))
        )
      )
    );

    if (potentialHandlers.length === 0) {
      log(
        'info',
        `[EventDispatcher.publish] No potential handlers registered for event: ${eventName}`
      );
      return; // No handlers registered for this event
    }

    // Filter for enabled modules and sort by priority
    const eligibleHandlers = potentialHandlers
      .filter((entry) => this.isModuleEnabled(entry.moduleId)) // Use checker function
      .filter((entry) => entry.enabled !== false) // Also check if the specific handler registration is enabled (default true)
      .sort((a, b) => {
        const priorityA = this._getPriorityIndex(a.moduleId); // Get current priority
        const priorityB = this._getPriorityIndex(b.moduleId);

        // Handle cases where module might not be in priority list (e.g., async loading issues)
        if (priorityA === -1) return 1; // Put unknowns last
        if (priorityB === -1) return -1;

        // For 'bottom' target: Start with highest priority index (last loaded) - DESCENDING order
        // For 'top' target: Start with lowest priority index (first loaded) - ASCENDING order
        return initialTarget === 'bottom'
          ? priorityB - priorityA  // FIXED: Descending order for bottom (highest index first)
          : priorityA - priorityB; // Ascending order for top (lowest index first)
      });

    if (eligibleHandlers.length === 0) {
      return; // No enabled modules handle this event
    }

    // Get the first handler based on the sorted order
    const handlerEntry = eligibleHandlers[0];

    log(
      'info',
      `[Dispatcher] Dispatching ${eventName} to module: ${handlerEntry.moduleId} (initialTarget: ${initialTarget})`
    );
    try {
      // Execute the handler
      // Ensure the handler function reference is correct
      if (typeof handlerEntry.handlerFunction === 'function') {
        handlerEntry.handlerFunction(data);
      } else {
        log(
          'error',
          `[Dispatcher] Invalid handlerFunction found for ${eventName} in module ${handlerEntry.moduleId}`
        );
      }
    } catch (error) {
      log(
        'error',
        `[Dispatcher] Error executing handler for event "${eventName}" in module "${handlerEntry.moduleId}":`,
        error
      );
    }
  }

  /**
   * Publishes an event to the next enabled module in the priority chain that handles it.
   * This is intended to be called *by* a module's event handler to propagate the event along the chain.
   * @param {string} originModuleId - The ID of the module calling this function.
   * @param {string} eventName - The name of the event to publish.
   * @param {any} data - The data payload associated with the event.
   * @param {object} [options={}] - Optional parameters.
   * @param {'up'|'down'} [options.direction='up'] - Order to check handlers (should match original publish direction).
   */
  publishToNextModule(originModuleId, eventName, data, options = {}) {
    const { direction = 'up' } = options;
    const originPriority = this._getPriorityIndex(originModuleId);

    if (originPriority === -1) {
      log(
        'warn',
        `[Dispatcher] publishToNextModule called by module not in current priority list: ${originModuleId}`
      );
      return;
    }

    const allHandlers = this.getHandlers();
    const potentialHandlers = allHandlers.get(eventName) || [];
    if (potentialHandlers.length === 0) {
      return;
    }

    // Filter for enabled modules after the origin module in the specified direction, then sort accordingly
    const eligibleNextHandlers = potentialHandlers
      .filter((entry) => {
        const entryPriority = this._getPriorityIndex(entry.moduleId);
        // Check module enabled, handler enabled, and priority validity
        if (
          !this.isModuleEnabled(entry.moduleId) ||
          entry.enabled === false ||
          entryPriority === -1
        ) {
          return false;
        }
        // If up, we want modules with lower priority index (loaded before)
        // If down, we want modules with higher priority index (loaded after)
        // Priority index increases as modules are loaded, so a higher priority index means a lower priority, and vice versa
        return direction === 'up'
          ? entryPriority < originPriority
          : entryPriority > originPriority;
      })
      .sort((a, b) => {
        const priorityA = this._getPriorityIndex(a.moduleId);
        const priorityB = this._getPriorityIndex(b.moduleId);
        // Handle unknowns just in case
        if (priorityA === -1) return 1;
        if (priorityB === -1) return -1;

        // Sort based on the desired direction to find the *next* one
        return direction === 'down'
          ? priorityA - priorityB // Ascending order
          : priorityB - priorityA; // Descending order
      });

    if (eligibleNextHandlers.length === 0) {
      // log('info', `[Dispatcher] No further modules found for ${eventName} after ${originModuleId} in direction ${direction}.`);
      return; // No subsequent enabled modules handle this event
    }

    // Get the very next handler based on the sorted order
    const handlerEntry = eligibleNextHandlers[0];

    log(
      'info',
      `[Dispatcher] Dispatching ${eventName} (propagated from ${originModuleId}) to module: ${handlerEntry.moduleId} (Direction: ${direction})`
    );
    try {
      // Execute the handler
      if (typeof handlerEntry.handlerFunction === 'function') {
        // Pass the original event data AND the propagation options
        // The receiving handler might need the origin/direction info
        handlerEntry.handlerFunction(data, {
          originModuleId: originModuleId,
          propagationDirection: direction,
        });
      } else {
        log(
          'error',
          `[Dispatcher] Invalid handlerFunction found for ${eventName} in module ${handlerEntry.moduleId} during propagation.`
        );
      }
    } catch (error) {
      log(
        'error',
        `[Dispatcher] Error executing propagated handler for event "${eventName}" in module "${handlerEntry.moduleId}":`,
        error
      );
    }
  }
}

// Export the class, not an instance
export default EventDispatcher;
