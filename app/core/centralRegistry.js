import eventBus from './eventBus.js'; // Added import

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('centralRegistry', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[centralRegistry] ${message}`, ...data);
  }
}

class CentralRegistry {
  constructor() {
    this.panelComponents = new Map(); // componentType -> { moduleId: string, componentClass: Function }
    this.moduleIdToComponentType = new Map(); // moduleId -> componentType
    this.dispatcherHandlers = new Map(); // eventName -> Array<{moduleId, handlerFunction, propagationDetails, enabled: boolean}>
    this.settingsSchemas = new Map(); // moduleId -> schemaSnippet
    this.publicFunctions = new Map(); // moduleId -> Map<functionName, functionRef>
    this.jsonDataHandlers = new Map(); // dataKey -> { moduleId, displayName, defaultChecked, requiresReload, getSaveDataFunction, applyLoadedDataFunction }

    // New maps for event registration details
    this.dispatcherSenders = new Map(); // eventName -> Array<{moduleId, direction: 'top'|'bottom'|'next', target: 'first'|'last'|'next', enabled: boolean}>
    this.eventBusPublishers = new Map(); // eventName -> Map<moduleId, { enabled: boolean }>
    this.eventBusSubscribers = new Map(); // eventName -> Array<{moduleId: string, enabled: boolean}>

    this.uiHostProviders = new Map(); // Key: uiComponentType (string), Value: Array of host objects

    log('info', 'CentralRegistry initialized');
  }

  registerPanelComponent(moduleId, componentType, componentClass) {
    if (typeof componentClass !== 'function') {
      log(
        'error',
        `Attempted to register non-function as component class for ${componentType} from ${moduleId}`
      );
      return;
    }
    if (this.panelComponents.has(componentType)) {
      log(
        'warn',
        `Panel component type '${componentType}' registered by ${moduleId} is already registered. Overwriting.`
      );
      // If overwriting, potentially remove old moduleId mapping?
      // this.moduleIdToComponentType.forEach((type, mId) => { if (type === componentType) this.moduleIdToComponentType.delete(mId); });
    }
    if (this.moduleIdToComponentType.has(moduleId)) {
      log(
        'warn',
        `Module ${moduleId} is attempting to register a second panel component (${componentType}). Only one is supported.`
      );
      // Do not overwrite the mapping, just warn.
    } else {
      this.moduleIdToComponentType.set(moduleId, componentType);
    }
    log(
      'info',
      `Registering panel component class '${componentType}' from ${moduleId}`
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
   *   - direction {'up'|'down'|'none'}: The direction the handler intends to propagate towards using publishToNextModule. Use 'none' or null if no propagation.
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
    this.dispatcherHandlers.get(eventName).push({
      moduleId,
      handlerFunction,
      propagationDetails, // Store the provided details
      enabled: true, // Default enabled state
    });
    log(
      'info',
      `Dispatcher receiver registered for MODULE '${moduleId}' on EVENT '${eventName}'. Handler: ${
        handlerFunction.name || 'anonymous'
      }. Total distinct event names in map: ${this.dispatcherHandlers.size}`
    );
  }

  registerDispatcherSender(moduleId, eventName, direction, target) {
    if (!this.dispatcherSenders.has(eventName)) {
      this.dispatcherSenders.set(eventName, []);
    }
    // TODO: Add validation for direction/target values?
    log(
      'info',
      `Registering dispatcher sender for '${eventName}' from ${moduleId} (Direction: ${direction}, Target: ${target})`
    );
    this.dispatcherSenders
      .get(eventName)
      .push({ moduleId, direction, target, enabled: true }); // Default enabled state
  }

  registerEventBusPublisher(moduleId, eventName) {
    if (!this.eventBusPublishers.has(eventName)) {
      this.eventBusPublishers.set(eventName, new Map());
    }
    log(
      'info',
      `Registering event bus publisher for '${eventName}' from ${moduleId}`
    );
    // Store publisher with enabled state
    this.eventBusPublishers.get(eventName).set(moduleId, { enabled: true });

    // Also register with eventBus itself
    if (typeof window !== 'undefined' && window.eventBus) {
      window.eventBus.registerPublisher(eventName, moduleId);
    }
  }

  /**
   * Registers a module's intent to subscribe to a specific event on the EventBus.
   * This is used for tracking and potentially enabling/disabling the module's ability
   * to receive these events, but does not perform the actual subscription.
   *
   * @param {string} moduleId - The ID of the module intending to subscribe.
   * @param {string} eventName - The name of the event.
   */
  registerEventBusSubscriberIntent(moduleId, eventName) {
    if (!this.eventBusSubscribers.has(eventName)) {
      this.eventBusSubscribers.set(eventName, []);
    }
    const subscribersForEvent = this.eventBusSubscribers.get(eventName);
    if (!subscribersForEvent.some((sub) => sub.moduleId === moduleId)) {
      log(
        'info',
        `Registering event bus subscriber intent for '${eventName}' from ${moduleId}`
      );
      subscribersForEvent.push({ moduleId, enabled: true });
    } else {
      log(
        'info',
        `Module ${moduleId} already registered subscriber intent for ${eventName}.`
      );
    }
  }

  registerSettingsSchema(moduleId, schemaSnippet) {
    if (this.settingsSchemas.has(moduleId)) {
      log(
        'warn',
        `Settings schema for module '${moduleId}' is already registered. Overwriting.`
      );
    }
    // TODO: Consider merging schema snippets if multiple parts of a module register?
    log('info', `Registering settings schema for ${moduleId}`);
    this.settingsSchemas.set(moduleId, schemaSnippet);
    // We might want to merge this into a single master schema for validation or UI generation later
  }

  registerPublicFunction(moduleId, functionName, functionRef) {
    if (!this.publicFunctions.has(moduleId)) {
      this.publicFunctions.set(moduleId, new Map());
    }
    const moduleFunctions = this.publicFunctions.get(moduleId);
    if (moduleFunctions.has(functionName)) {
      log(
        'warn',
        `Public function '${functionName}' for module '${moduleId}' is already registered. Overwriting.`
      );
    }
    log(
      'info',
      `Registering public function '${functionName}' for ${moduleId}`
    );
    moduleFunctions.set(functionName, functionRef);
  }

  getPublicFunction(moduleId, functionName) {
    const moduleFunctions = this.publicFunctions.get(moduleId);
    if (!moduleFunctions || !moduleFunctions.has(functionName)) {
      log(
        'error',
        `Public function '${functionName}' not found for module '${moduleId}'`
      );
      return null; // Or throw error
    }
    return moduleFunctions.get(functionName);
  }

  /**
   * Returns the map of all registered event handlers with propagation details.
   * Expected propagationDetails structure: { direction: 'up'|'down'|'none', condition: 'conditional'|'unconditional', timing: 'immediate'|'delayed' } | null
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
   * Returns the map of all registered EventBus subscribers (intentions).
   * @returns {Map<string, Array<{moduleId: string, enabled: boolean}>>}
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

  registerUIHost(
    uiComponentType,
    hostModuleId,
    placeholderElement,
    hostPriority
  ) {
    if (!this.uiHostProviders.has(uiComponentType)) {
      this.uiHostProviders.set(uiComponentType, []);
    }
    const hostsForType = this.uiHostProviders.get(uiComponentType);
    const existingIndex = hostsForType.findIndex(
      (h) => h.moduleId === hostModuleId
    );

    let oldPriority = undefined;
    let oldIsActive = false; // Default for new host, will be preserved if host existed
    let wasAlreadyRegistered = false;

    if (existingIndex !== -1) {
      oldPriority = hostsForType[existingIndex].priority;
      oldIsActive = hostsForType[existingIndex].isActive;
      wasAlreadyRegistered = true;
    }

    const newHostData = {
      moduleId: hostModuleId,
      placeholder: placeholderElement,
      priority: hostPriority,
      isActive: oldIsActive, // Preserve current active status on update
      uiComponentType,
    };

    if (wasAlreadyRegistered) {
      hostsForType[existingIndex] = newHostData;
      log(
        'info',
        `[CentralRegistry] Host ${hostModuleId} for UI type ${uiComponentType} re-registered/updated. New priority: ${hostPriority}. Placeholder:`,
        placeholderElement
      );
    } else {
      hostsForType.push(newHostData);
      log(
        'info',
        `[CentralRegistry] Host ${hostModuleId} (priority ${hostPriority}) newly registered for UI type: ${uiComponentType}. Placeholder:`,
        placeholderElement
      );
    }

    // Fire event if it's a new registration or if the priority/placeholder changed for an existing one.
    // Placeholder comparison is tricky with DOM elements, so we rely on priority change or new registration.
    // The isActive status in the event should reflect the host's current state.
    if (!wasAlreadyRegistered || oldPriority !== newHostData.priority) {
      eventBus.publish('uiHostRegistry:hostStatusChanged', {
        uiComponentType: uiComponentType,
        moduleId: hostModuleId,
        status: 'registration_update', // More generic status
        isActive: newHostData.isActive,
        priority: newHostData.priority,
      }, 'core');
      // log('info',`[CentralRegistry] Fired uiHostRegistry:hostStatusChanged for ${hostModuleId} (type ${uiComponentType}) due to registration/priority update. New Prio: ${newHostData.priority}, Active: ${newHostData.isActive}`);
    }
  }

  setUIHostActive(uiComponentType, hostModuleId, isActive) {
    const hostsForType = this.uiHostProviders.get(uiComponentType);
    if (!hostsForType) {
      log(
        'info',
        `[CentralRegistry] No hosts registered for UI type ${uiComponentType}. Cannot set active status for ${hostModuleId}.`
      );
      return;
    }
    const host = hostsForType.find((h) => h.moduleId === hostModuleId);
    if (host) {
      if (host.isActive !== isActive) {
        host.isActive = isActive;
        log(
          'info',
          `[CentralRegistry] Host ${hostModuleId} for ${uiComponentType} set to active: ${isActive}.`
        );
        eventBus.publish('uiHostRegistry:hostStatusChanged', {
          uiComponentType: uiComponentType,
          moduleId: hostModuleId,
          status: isActive ? 'activated' : 'deactivated',
          isActive: isActive,
          priority: host.priority,
        }, 'core');
      } else {
        // Optionally log if no change, or just be silent
        // log('info',`[CentralRegistry] Host ${hostModuleId} for ${uiComponentType} active status already ${isActive}. No change necessary.`);
      }
    } else {
      log(
        'warn',
        `[CentralRegistry] Host ${hostModuleId} not found for UI type ${uiComponentType}. Cannot set active status.`
      );
    }
  }

  getActiveUIHosts(uiComponentType) {
    const hosts = this.uiHostProviders.get(uiComponentType) || [];
    const activeHosts = hosts.filter((h) => h.isActive);
    // Sort by priority descending (higher number = higher priority = loaded later)
    activeHosts.sort((a, b) => b.priority - a.priority);
    return activeHosts;
  }

  unregisterUIHost(uiComponentType, hostModuleId) {
    const hostsForType = this.uiHostProviders.get(uiComponentType);
    if (!hostsForType) {
      log(
        'warn',
        `[CentralRegistry] No hosts registered for UI type ${uiComponentType}. Cannot unregister ${hostModuleId}.`
      );
      return;
    }

    const hostIndex = hostsForType.findIndex(
      (h) => h.moduleId === hostModuleId
    );

    if (hostIndex !== -1) {
      const removedHost = hostsForType.splice(hostIndex, 1)[0];
      log(
        'info',
        `[CentralRegistry] Host ${hostModuleId} unregistered for UI type ${uiComponentType}.`
      );
      eventBus.publish('uiHostRegistry:hostStatusChanged', {
        uiComponentType: uiComponentType,
        moduleId: hostModuleId,
        status: 'unregistered',
        isActive: removedHost.isActive, // Report its last known active state
        priority: removedHost.priority,
      }, 'core');
    } else {
      log(
        'warn',
        `[CentralRegistry] Host ${hostModuleId} not found for UI type ${uiComponentType}. Cannot unregister.`
      );
    }
  }

  registerJsonDataHandler(moduleId, dataKey, handlerObject) {
    if (this.jsonDataHandlers.has(dataKey)) {
      log(
        'warn',
        `JSON Data Handler for dataKey '${dataKey}' already registered (by module ${
          this.jsonDataHandlers.get(dataKey).moduleId
        }). Overwriting with registration from ${moduleId}.`
      );
    }
    // Basic validation of handlerObject structure
    if (handlerObject) {
      log(
        'info',
        `[Registry Validation Debug] typeof displayName: ${typeof handlerObject.displayName}`
      );
      log(
        'info',
        `[Registry Validation Debug] typeof defaultChecked: ${typeof handlerObject.defaultChecked}`
      );
      log(
        'info',
        `[Registry Validation Debug] typeof requiresReload: ${typeof handlerObject.requiresReload}`
      );
      log(
        'info',
        `[Registry Validation Debug] typeof getSaveDataFunction: ${typeof handlerObject.getSaveDataFunction}`
      );
      log(
        'info',
        `[Registry Validation Debug] typeof applyLoadedDataFunction: ${typeof handlerObject.applyLoadedDataFunction}`
      );
    } else {
      log(
        'info',
        `[Registry Validation Debug] handlerObject is null or undefined.`
      );
    }
    if (
      !handlerObject ||
      typeof handlerObject.displayName !== 'string' ||
      typeof handlerObject.defaultChecked !== 'boolean' ||
      typeof handlerObject.requiresReload !== 'boolean' ||
      typeof handlerObject.getSaveDataFunction !== 'function' ||
      typeof handlerObject.applyLoadedDataFunction !== 'function'
    ) {
      log(
        'error',
        `Invalid handlerObject provided by ${moduleId} for dataKey '${dataKey}'. Missing or incorrect properties.`,
        handlerObject // Log the object separately
      );
      return;
    } else {
      log(
        'info',
        `JSON Data Handler validation PASSED for dataKey '${dataKey}' from module ${moduleId}`
      );
    }

    log(
      'info',
      `Registering JSON Data Handler for dataKey '${dataKey}' from module ${moduleId}`
    );
    this.jsonDataHandlers.set(dataKey, { moduleId, ...handlerObject });
  }

  getAllJsonDataHandlers() {
    return this.jsonDataHandlers;
  }

  // TODO: Add unregister methods? Needed for full module unloading.

  // --- Methods to toggle enabled state --- //

  _setEnabledState(map, eventName, moduleId, isEnabled, findCallback = null) {
    if (!map.has(eventName)) {
      log('warn', `[Registry Toggle] Event '${eventName}' not found in map.`);
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
      const entry = entries.find((e) => e.moduleId === moduleId);

      if (entry) {
        entry.enabled = isEnabled;
        found = true;
      }
    }

    if (found) {
      log(
        'info',
        `[Registry Toggle] Set '${eventName}' for module '${moduleId}' to enabled=${isEnabled}`
      );
    } else {
      log(
        'warn',
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
    // Update the registry
    if (!this.eventBusPublishers.has(eventName)) {
      log(
        'warn',
        `[Registry Toggle] Event '${eventName}' not found for EventBus publishers.`
      );
      return false;
    }
    const moduleMap = this.eventBusPublishers.get(eventName);
    if (!moduleMap.has(moduleId)) {
      log(
        'warn',
        `[Registry Toggle] Module '${moduleId}' not found for EventBus event '${eventName}'.`
      );
      return false;
    }
    moduleMap.get(moduleId).enabled = isEnabled;

    // Also update the eventBus itself
    if (typeof window !== 'undefined' && window.eventBus) {
      window.eventBus.setPublisherEnabled(eventName, moduleId, isEnabled);
    }

    log(
      'info',
      `[Registry Toggle] Set publisher '${eventName}' for module '${moduleId}' to enabled=${isEnabled}`
    );
    return true;
  }

  setEventBusSubscriberIntentEnabled(eventName, moduleId, isEnabled) {
    const success = this._setEnabledState(
      this.eventBusSubscribers,
      eventName,
      moduleId,
      isEnabled
    );

    // Also update the eventBus itself
    if (success && typeof window !== 'undefined' && window.eventBus) {
      window.eventBus.setSubscriberEnabled(eventName, moduleId, isEnabled);
    }

    return success;
  }

  _getEnabledState(map, eventName, moduleId) {
    if (!map.has(eventName)) {
      return false;
    }
    const entries = map.get(eventName);

    // Simplified logic using Map access or Array find
    if (entries instanceof Map) {
      return entries.get(moduleId)?.enabled ?? false;
    } else if (Array.isArray(entries)) {
      return entries.find((e) => e.moduleId === moduleId)?.enabled ?? false;
    }
    return false; // Event or module not found
  }
}

// Create and export a singleton instance
const centralRegistry = new CentralRegistry();
export { centralRegistry }; // Export the instance
