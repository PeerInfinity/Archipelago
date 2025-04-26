class CentralRegistry {
  constructor() {
    this.panelComponents = new Map(); // componentType -> componentFactory
    this.moduleIdToComponentType = new Map(); // moduleId -> componentType
    this.eventHandlers = new Map(); // eventName -> Array<{moduleId, handlerFunction}>
    this.settingsSchemas = new Map(); // moduleId -> schemaSnippet
    this.publicFunctions = new Map(); // moduleId -> Map<functionName, functionRef>
    console.log('CentralRegistry initialized');
  }

  registerPanelComponent(moduleId, componentType, componentFactory) {
    if (this.panelComponents.has(componentType)) {
      console.warn(
        `[Registry] Panel component type '${componentType}' registered by ${moduleId} is already registered. Overwriting.`
      );
    }
    if (this.moduleIdToComponentType.has(moduleId)) {
      console.warn(
        `[Registry] Module ${moduleId} is attempting to register a second panel component (${componentType}). Only one is supported.`
      );
    } else {
      this.moduleIdToComponentType.set(moduleId, componentType);
    }
    console.log(
      `[Registry] Registering panel component '${componentType}' from ${moduleId}`
    );
    this.panelComponents.set(componentType, componentFactory);
  }

  getComponentTypeForModule(moduleId) {
    return this.moduleIdToComponentType.get(moduleId) || null;
  }

  registerEventHandler(moduleId, eventName, handlerFunction) {
    if (!this.eventHandlers.has(eventName)) {
      this.eventHandlers.set(eventName, []);
    }
    // Check for duplicates? Might be valid to have multiple handlers from one module?
    // For now, allow it. Dispatcher logic handles priority.
    console.log(
      `[Registry] Registering event handler for '${eventName}' from ${moduleId}`
    );
    this.eventHandlers.get(eventName).push({ moduleId, handlerFunction });
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
}

// Export a singleton instance
const centralRegistry = new CentralRegistry();
export default centralRegistry;
