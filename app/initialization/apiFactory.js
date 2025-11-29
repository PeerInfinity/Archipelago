// apiFactory.js - Factory functions for creating module APIs
// Extracted from init.js lines 207-337

/**
 * Creates the standard Initialization API for a module
 *
 * @param {string} moduleId - The ID of the module
 * @param {Object} dependencies - Required dependencies
 * @param {Object} dependencies.settingsManager - Settings manager instance
 * @param {Object} dependencies.dispatcher - Event dispatcher instance
 * @param {Object} dependencies.centralRegistry - Central registry instance
 * @param {Object} dependencies.eventBus - Event bus instance
 * @param {Object} dependencies.logger - Logger instance
 * @param {Object} dependencies.moduleManagerApi - Module manager API instance
 * @returns {Object} Initialization API object
 */
export function createInitializationApi(moduleId, dependencies) {
  const {
    settingsManager,
    dispatcher,
    centralRegistry,
    eventBus,
    logger,
    moduleManagerApi,
  } = dependencies;

  logger.debug('init', `Creating API for module: ${moduleId}`);

  return {
    getModuleSettings: async () => settingsManager.getModuleSettings(moduleId),

    getDispatcher: () => ({
      publish: (eventName, data, options = {}) => {
        // Check if this module is enabled as a sender for this event
        const dispatcherSenders = centralRegistry.getAllDispatcherSenders();
        const sendersForEvent = dispatcherSenders.get(eventName) || [];
        const senderInfo = sendersForEvent.find(s => s.moduleId === moduleId);

        if (senderInfo && senderInfo.enabled === false) {
          logger.debug('init', `Module ${moduleId} is disabled as sender for event ${eventName}, skipping publish`);
          return;
        }

        return dispatcher.publish(moduleId, eventName, data, options);
      },
      publishToNextModule: dispatcher.publishToNextModule.bind(dispatcher),
    }),

    getEventBus: () => eventBus,

    getLogger: () => logger,

    getModuleFunction: (targetModuleId, functionName) => {
      return centralRegistry.getPublicFunction(targetModuleId, functionName);
    },

    getModuleManager: () => moduleManagerApi,

    getAllSettings: async () => {
      try {
        const allSettings = await settingsManager.getSettings();
        return allSettings;
      } catch (error) {
        logger.error(
          'init',
          `Error in getAllSettings called by ${moduleId}:`,
          error
        );
        throw error;
      }
    },
  };
}

/**
 * Creates the Registration API for a module
 *
 * @param {string} moduleId - The ID of the module
 * @param {Object} moduleInstance - The module instance
 * @param {Object} dependencies - Required dependencies
 * @param {Object} dependencies.centralRegistry - Central registry instance
 * @param {Map} dependencies.moduleInfoMap - Map of module IDs to module info
 * @returns {Object} Registration API object
 */
export function createRegistrationApi(moduleId, moduleInstance, dependencies) {
  const { centralRegistry, moduleInfoMap } = dependencies;

  return {
    registerPanelComponent: (componentType, componentFactory) => {
      // Try multiple sources for moduleInfo
      const moduleInfo = moduleInstance?.moduleInfo ||
                        componentFactory?.moduleInfo ||
                        moduleInfoMap.get(moduleId) ||
                        null;

      // Log registration
      dependencies.logger?.debug('init', `Registering panel component: ${componentType} from ${moduleId}`);

      centralRegistry.registerPanelComponent(
        moduleId,
        componentType,
        componentFactory,
        moduleInfo
      );
    },

    registerDispatcherReceiver: (
      moduleIdFromCall,
      eventNameFromCall,
      handlerFunctionFromCall,
      propagationDetailsFromCall
    ) => {
      centralRegistry.registerDispatcherReceiver(
        moduleId,
        eventNameFromCall,
        handlerFunctionFromCall,
        propagationDetailsFromCall
      );
    },

    registerDispatcherSender: (eventName, direction, target) => {
      centralRegistry.registerDispatcherSender(
        moduleId,
        eventName,
        direction,
        target
      );
    },

    registerEventBusPublisher: (eventName) => {
      centralRegistry.registerEventBusPublisher(moduleId, eventName);
    },

    registerEventBusSubscriberIntent: (eventName) => {
      centralRegistry.registerEventBusSubscriberIntent(moduleId, eventName);
    },

    registerSettingsSchema: (schemaSnippet) => {
      centralRegistry.registerSettingsSchema(moduleId, schemaSnippet);
    },

    registerPublicFunction: (idProvidedByModule, functionName, functionRef) => {
      centralRegistry.registerPublicFunction(
        idProvidedByModule,
        functionName,
        functionRef
      );
    },

    registerJsonDataHandler: (dataKey, handlerObject) => {
      centralRegistry.registerJsonDataHandler(moduleId, dataKey, handlerObject);
    },
  };
}
