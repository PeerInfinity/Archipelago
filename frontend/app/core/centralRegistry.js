class CentralRegistry {
  constructor() {
    this.panelComponents = new Map(); // componentType -> { moduleId: string, componentClass: Function }
    this.moduleIdToComponentType = new Map(); // moduleId -> componentType
    this.dispatcherHandlers = new Map(); // eventName -> Array<{moduleId, handlerFunction, propagationDetails}>
    this.settingsSchemas = new Map(); // moduleId -> schemaSnippet
    this.publicFunctions = new Map(); // moduleId -> Map<functionName, functionRef>

    // New maps for event registration details
    this.dispatcherSenders = new Map(); // eventName -> Array<{moduleId, direction: 'highestFirst'|'lowestFirst'|'next', target: 'first'|'last'|'next'}>
    this.eventBusPublishers = new Map(); // eventName -> Set<moduleId>
    this.eventBusSubscribers = new Map(); // eventName -> Array<{moduleId, callback}>

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

  registerEventHandler(moduleId, eventName, handlerFunction) {
    if (!this.dispatcherHandlers.has(eventName)) {
      this.dispatcherHandlers.set(eventName, []);
    }
    console.log(
      `[Registry] Registering basic event handler for '${eventName}' from ${moduleId}`
    );
    this.dispatcherHandlers.get(eventName).push({
      moduleId,
      handlerFunction,
      propagationDetails: null, // Default for basic registration
    });
  }

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
    this.dispatcherSenders.get(eventName).push({ moduleId, direction, target });
  }

  registerEventBusPublisher(moduleId, eventName) {
    if (!this.eventBusPublishers.has(eventName)) {
      this.eventBusPublishers.set(eventName, new Set());
    }
    console.log(
      `[Registry] Registering event bus publisher for '${eventName}' from ${moduleId}`
    );
    this.eventBusPublishers.get(eventName).add(moduleId);
  }

  registerEventBusSubscriber(moduleId, eventName, callback) {
    if (!this.eventBusSubscribers.has(eventName)) {
      this.eventBusSubscribers.set(eventName, []);
    }
    console.log(
      `[Registry] Registering event bus subscriber for '${eventName}' from ${moduleId}`
    );
    this.eventBusSubscribers.get(eventName).push({ moduleId, callback });
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
   * @returns {Map<string, Array<{moduleId: string, handlerFunction: Function, propagationDetails: object | null}>>}
   */
  getAllDispatcherHandlers() {
    return this.dispatcherHandlers;
  }

  /**
   * Returns the map of all registered dispatcher senders.
   * @returns {Map<string, Array<{moduleId: string, direction: string, target: string}>>}
   */
  getAllDispatcherSenders() {
    return this.dispatcherSenders;
  }

  /**
   * Returns the map of all registered EventBus publishers.
   * @returns {Map<string, Set<string>>} Map of eventName -> Set<moduleId>
   */
  getAllEventBusPublishers() {
    return this.eventBusPublishers;
  }

  /**
   * Returns the map of all registered EventBus subscribers.
   * @returns {Map<string, Array<{moduleId: string, callback: Function}>>}
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
}

// Export a singleton instance
const centralRegistry = new CentralRegistry();
export default centralRegistry;
