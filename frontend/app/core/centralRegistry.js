class CentralRegistry {
  constructor() {
    this.panelComponents = new Map(); // componentType -> { moduleId: string, componentClass: Function }
    this.moduleIdToComponentType = new Map(); // moduleId -> componentType
    this.dispatcherHandlers = new Map(); // eventName -> Array<{moduleId, handlerFunction, propagationDetails, enabled: boolean}>
    this.settingsSchemas = new Map(); // moduleId -> schemaSnippet
    this.publicFunctions = new Map(); // moduleId -> Map<functionName, functionRef>

    // New maps for event registration details
    this.dispatcherSenders = new Map(); // eventName -> Array<{moduleId, direction: 'highestFirst'|'lowestFirst'|'next', target: 'first'|'last'|'next', enabled: boolean}>
    this.eventBusPublishers = new Map(); // eventName -> Map<moduleId, { enabled: boolean }>
    this.eventBusSubscribers = new Map(); // eventName -> Array<{moduleId, callback, enabled: boolean}>

    console.log('CentralRegistry initialized');
  }

  registerPanelComponent(moduleId, componentType, componentClass) {
    if (typeof componentClass !== 'function') {
      console.error(
        `[Registry] Attempted to register non-function as component class for ${componentType} from ${moduleId}`
      );
      return;
    }
    if (this.panelComponents.has(componentType)) {
      console.warn(
        `[Registry] Panel component type '${componentType}' registered by ${moduleId} is already registered. Overwriting.`
      );
      // If overwriting, potentially remove old moduleId mapping?
      // this.moduleIdToComponentType.forEach((type, mId) => { if (type === componentType) this.moduleIdToComponentType.delete(mId); });
    }
    if (this.moduleIdToComponentType.has(moduleId)) {
      console.warn(
        `[Registry] Module ${moduleId} is attempting to register a second panel component (${componentType}). Only one is supported.`
      );
      // Do not overwrite the mapping, just warn.
    } else {
      this.moduleIdToComponentType.set(moduleId, componentType);
    }
    console.log(
      `[Registry] Registering panel component class '${componentType}' from ${moduleId}`
    );
    this.panelComponents.set(componentType, { moduleId, componentClass }); // Store class constructor and moduleId
  }

  getComponentTypeForModule(moduleId) {
    return this.moduleIdToComponentType.get(moduleId) || null;
  }

  /**
   * Registers a handler function for a specific event dispatched via the EventDispatcher.
   * This allows tracking which modules are intended receivers for prioritized events.
   *
   * @param {string} moduleId - The ID of the module registering the handler.
   * @param {string} eventName - The name of the event to handle.
   * @param {Function} handlerFunction - The function to execute when the event is received.
   * @param {object | null} propagationDetails - Optional details about how this handler might propagate the event further.
   *   If null, it's treated as a basic handler that does not explicitly propagate via publishToNextModule.
   *   If an object, it should contain:
   *   - direction {'highestFirst'|'lowestFirst'|'none'}: The direction the handler intends to propagate towards using publishToNextModule. Use 'none' or null if no propagation.
   *   - condition {'conditional'|'unconditional'}: Whether the propagation call is conditional.
   *   - timing {'immediate'|'delayed'}: Whether the propagation happens immediately or is delayed.
   */
  registerDispatcherReceiver(
    moduleId,
    eventName,
    handlerFunction,
    propagationDetails
  ) {
    if (!this.dispatcherHandlers.has(eventName)) {
      this.dispatcherHandlers.set(eventName, []);
    }
    // TODO: Add validation for propagationDetails structure?
    console.log(
      `[Registry] Registering dispatcher receiver for '${eventName}' from ${moduleId} with details:`,
      propagationDetails
    );
    this.dispatcherHandlers.get(eventName).push({
      moduleId,
      handlerFunction,
      propagationDetails, // Store the provided details
      enabled: true, // Default enabled state
    });
  }

  registerDispatcherSender(moduleId, eventName, direction, target) {
    if (!this.dispatcherSenders.has(eventName)) {
      this.dispatcherSenders.set(eventName, []);
    }
    // TODO: Add validation for direction/target values?
    console.log(
      `[Registry] Registering dispatcher sender for '${eventName}' from ${moduleId} (Direction: ${direction}, Target: ${target})`
    );
    this.dispatcherSenders
      .get(eventName)
      .push({ moduleId, direction, target, enabled: true }); // Default enabled state
  }

  registerEventBusPublisher(moduleId, eventName) {
    if (!this.eventBusPublishers.has(eventName)) {
      this.eventBusPublishers.set(eventName, new Map());
    }
    console.log(
      `[Registry] Registering event bus publisher for '${eventName}' from ${moduleId}`
    );
    // Store publisher with enabled state
    this.eventBusPublishers.get(eventName).set(moduleId, { enabled: true });
  }

  registerEventBusSubscriber(moduleId, eventName, callback) {
    if (!this.eventBusSubscribers.has(eventName)) {
      this.eventBusSubscribers.set(eventName, []);
    }
    console.log(
      `[Registry] Registering event bus subscriber for '${eventName}' from ${moduleId}`
    );
    this.eventBusSubscribers
      .get(eventName)
      .push({ moduleId, callback, enabled: true }); // Default enabled state
  }

  registerSettingsSchema(moduleId, schemaSnippet) {
    if (this.settingsSchemas.has(moduleId)) {
      console.warn(
        `[Registry] Settings schema for module '${moduleId}' is already registered. Overwriting.`
      );
    }
    // TODO: Consider merging schema snippets if multiple parts of a module register?
    console.log(`[Registry] Registering settings schema for ${moduleId}`);
    this.settingsSchemas.set(moduleId, schemaSnippet);
    // We might want to merge this into a single master schema for validation or UI generation later
  }

  registerPublicFunction(moduleId, functionName, functionRef) {
    if (!this.publicFunctions.has(moduleId)) {
      this.publicFunctions.set(moduleId, new Map());
    }
    const moduleFunctions = this.publicFunctions.get(moduleId);
    if (moduleFunctions.has(functionName)) {
      console.warn(
        `[Registry] Public function '${functionName}' for module '${moduleId}' is already registered. Overwriting.`
      );
    }
    console.log(
      `[Registry] Registering public function '${functionName}' for ${moduleId}`
    );
    moduleFunctions.set(functionName, functionRef);
  }

  getPublicFunction(moduleId, functionName) {
    const moduleFunctions = this.publicFunctions.get(moduleId);
    if (!moduleFunctions || !moduleFunctions.has(functionName)) {
      console.error(
        `[Registry] Public function '${functionName}' not found for module '${moduleId}'`
      );
      return null; // Or throw error
    }
    return moduleFunctions.get(functionName);
  }

  /**
   * Returns the map of all registered event handlers with propagation details.
   * Expected propagationDetails structure: { direction: 'highestFirst'|'lowestFirst'|'none', condition: 'conditional'|'unconditional', timing: 'immediate'|'delayed' } | null
   * @returns {Map<string, Array<{moduleId: string, handlerFunction: Function, propagationDetails: object | null, enabled: boolean}>>}
   */
  getAllDispatcherHandlers() {
    return this.dispatcherHandlers;
  }

  /**
   * Returns the map of all registered dispatcher senders.
   * @returns {Map<string, Array<{moduleId: string, direction: string, target: string, enabled: boolean}>>}
   */
  getAllDispatcherSenders() {
    return this.dispatcherSenders;
  }

  /**
   * Returns the map of all registered EventBus publishers.
   * @returns {Map<string, Map<string, {enabled: boolean}>>} Map of eventName -> Map<moduleId, {enabled}>
   */
  getAllEventBusPublishers() {
    return this.eventBusPublishers;
  }

  /**
   * Returns the map of all registered EventBus subscribers.
   * @returns {Map<string, Array<{moduleId: string, callback: Function, enabled: boolean}>>}
   */
  getAllEventBusSubscribers() {
    return this.eventBusSubscribers;
  }

  /**
   * Returns the map of all registered panel components.
   * @returns {Map<string, { moduleId: string, componentClass: Function }>}
   */
  getAllPanelComponents() {
    return this.panelComponents;
  }

  // TODO: Add unregister methods? Needed for full module unloading.

  // --- Methods to toggle enabled state --- //

  _setEnabledState(map, eventName, moduleId, isEnabled, findCallback = null) {
    if (!map.has(eventName)) {
      console.warn(`[Registry Toggle] Event '${eventName}' not found in map.`);
      return false;
    }

    const entries = map.get(eventName);
    let found = false;

    if (entries instanceof Map) {
      // For eventBusPublishers
      if (entries.has(moduleId)) {
        entries.get(moduleId).enabled = isEnabled;
        found = true;
      }
    } else if (Array.isArray(entries)) {
      // For handlers, senders, subscribers
      const entry = entries.find(
        (e) =>
          e.moduleId === moduleId &&
          (!findCallback || e.callback === findCallback)
      );
      if (entry) {
        entry.enabled = isEnabled;
        found = true;
      }
    }

    if (found) {
      console.log(
        `[Registry Toggle] Set '${eventName}' for module '${moduleId}' to enabled=${isEnabled}`
      );
    } else {
      console.warn(
        `[Registry Toggle] Could not find entry for '${eventName}' and module '${moduleId}'.`
      );
    }
    return found;
  }

  setDispatcherHandlerEnabled(eventName, moduleId, isEnabled) {
    return this._setEnabledState(
      this.dispatcherHandlers,
      eventName,
      moduleId,
      isEnabled
    );
  }

  setDispatcherSenderEnabled(eventName, moduleId, isEnabled) {
    return this._setEnabledState(
      this.dispatcherSenders,
      eventName,
      moduleId,
      isEnabled
    );
  }

  setEventBusPublisherEnabled(eventName, moduleId, isEnabled) {
    // Special handling because the value is an object { enabled: ...}
    if (!this.eventBusPublishers.has(eventName)) {
      console.warn(
        `[Registry Toggle] Event '${eventName}' not found for EventBus publishers.`
      );
      return false;
    }
    const moduleMap = this.eventBusPublishers.get(eventName);
    if (!moduleMap.has(moduleId)) {
      console.warn(
        `[Registry Toggle] Module '${moduleId}' not found for EventBus event '${eventName}'.`
      );
      return false;
    }
    moduleMap.get(moduleId).enabled = isEnabled;
    console.log(
      `[Registry Toggle] Set publisher '${eventName}' for module '${moduleId}' to enabled=${isEnabled}`
    );
    return true;
  }

  setEventBusSubscriberEnabled(eventName, moduleId, isEnabled) {
    // We might need callback reference here if multiple callbacks per module+event are allowed
    // For now, assuming one subscriber UI toggle per module+event
    return this._setEnabledState(
      this.eventBusSubscribers,
      eventName,
      moduleId,
      isEnabled
    );
  }
}

// Export a singleton instance
const centralRegistry = new CentralRegistry();
export default centralRegistry;
