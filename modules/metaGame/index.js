import { MetaGameLogic } from './metaGameLogic.js';

export const moduleInfo = {
  name: 'metaGame',
  description: 'Meta-game features and event orchestration system'
};

let metaGameLogic = null;
let storedRegistrationApi = null;

// Handler functions for dispatcher events
function handleRegionMove(eventData, context) {
  if (metaGameLogic) {
    return metaGameLogic.handleRegionMoveEvent(eventData, context);
  }
  return { action: 'continue' };
}

function handleLocationCheck(eventData, context) {
  if (metaGameLogic) {
    return metaGameLogic.handleLocationCheckEvent(eventData, context);
  }
  return { action: 'continue' };
}

/**
 * Handle editor config Apply events
 * Allows users to edit the metaGame configuration in the editor and apply changes
 * @param {Object} eventData - Event data containing the configuration
 */
async function handleEditorConfigApply(eventData) {
  console.log('[MetaGame] Editor config Apply requested', eventData);

  if (!eventData || !eventData.configuration) {
    console.warn('[MetaGame] No configuration data in editor:metaGameConfigApply event');
    return;
  }

  if (!metaGameLogic) {
    console.error('[MetaGame] Module not initialized, cannot apply configuration');
    return;
  }

  try {
    // Update the JSON configuration using the existing API
    await metaGameLogic.updateJSONConfiguration(eventData.configuration);
    console.log('[MetaGame] Applied configuration from editor');
  } catch (error) {
    console.error('[MetaGame] Error applying configuration from editor:', error);
  }
}

export function register(registrationApi) {
  // Store registrationApi for later use when configuration is loaded
  storedRegistrationApi = registrationApi;
  // Event dispatcher receivers will be registered after configuration is loaded
  
  // Register public functions for other modules to call
  registrationApi.registerPublicFunction(moduleInfo.name, 'loadConfiguration', loadConfiguration);
  registrationApi.registerPublicFunction(moduleInfo.name, 'getStatus', getStatus);
  registrationApi.registerPublicFunction(moduleInfo.name, 'updateJSONConfiguration', updateJSONConfiguration);
  registrationApi.registerPublicFunction(moduleInfo.name, 'clearConfiguration', clearConfiguration);
  
  // Register event publishers
  registrationApi.registerEventBusPublisher('metaGame:configurationLoaded');
  registrationApi.registerEventBusPublisher('metaGame:configurationUpdated');
  registrationApi.registerEventBusPublisher('metaGame:ready');
  registrationApi.registerEventBusPublisher('metaGame:error');
  registrationApi.registerEventBusPublisher('progressBar:create');
  registrationApi.registerEventBusPublisher('progressBar:show');
  registrationApi.registerEventBusPublisher('progressBar:hide');
  registrationApi.registerEventBusPublisher('progressBar:destroy');
  registrationApi.registerEventBusPublisher('ui:activatePanel');
  registrationApi.registerEventBusPublisher('window:loadUrl');
  registrationApi.registerEventBusPublisher('window:close');
  registrationApi.registerEventBusPublisher('progressBarPanel:showUIContent');
  registrationApi.registerEventBusPublisher('progressBarPanel:hideUIContent');
  registrationApi.registerEventBusPublisher('metaGame:progressBarCancelled');
  // Note: metaGame-specific progress bar events are registered dynamically when progress bars are created
  
  // Register settings schema
  registrationApi.registerSettingsSchema({
    metaGame: {
      type: 'object',
      properties: {
        enableDebugLogging: { type: 'boolean', default: false },
        defaultConfigurationPath: { type: 'string', default: '' }
      }
    }
  });
}

export function initialize(moduleId, priorityIndex, initializationApi) {
  const dispatcher = initializationApi.getDispatcher();
  const eventBus = initializationApi.getEventBus();
  const logger = initializationApi.getLogger();

  logger.info('metaGame', 'Initializing MetaGame module...');

  try {
    // Create the MetaGameLogic instance
    metaGameLogic = new MetaGameLogic({
      dispatcher,
      eventBus,
      logger,
      moduleId,
      priorityIndex,
      initializationApi,
      registrationApi: storedRegistrationApi
    });

    // Subscribe to editor config Apply events
    eventBus.subscribe('editor:metaGameConfigApply', handleEditorConfigApply);
    logger.info('metaGame', 'Subscribed to editor:metaGameConfigApply events');

    // Event handlers are registered during the registration phase
    // and will be called automatically by the event dispatcher system

    logger.info('metaGame', 'MetaGame module initialized successfully');
    
    // Return cleanup function
    return () => {
      logger.info('metaGame', 'Cleaning up MetaGame module...');
      if (metaGameLogic) {
        metaGameLogic.cleanup();
        metaGameLogic = null;
      }
    };
    
  } catch (error) {
    logger.error('metaGame', 'Failed to initialize MetaGame module:', error);
    eventBus.publish('metaGame:error', { error: error.message });
    throw error;
  }
}

export async function postInitialize(initializationApi, moduleConfig) {
  const logger = initializationApi.getLogger();
  
  try {
    if (metaGameLogic) {
      await metaGameLogic.postInitialize();
      logger.info('metaGame', 'MetaGame module post-initialization completed');
    }
  } catch (error) {
    logger.error('metaGame', 'MetaGame module post-initialization failed:', error);
    throw error;
  }
}

// Public API functions
export async function loadConfiguration(filePath) {
  console.log('MetaGame.loadConfiguration called with:', filePath);
  if (!metaGameLogic) {
    console.error('MetaGame module not initialized');
    throw new Error('MetaGame module not initialized');
  }
  console.log('Calling metaGameLogic.loadConfiguration with:', filePath);
  const result = await metaGameLogic.loadConfiguration(filePath);
  console.log('metaGameLogic.loadConfiguration returned:', result);
  return result;
}

export function getStatus() {
  if (!metaGameLogic) {
    return { initialized: false };
  }
  return metaGameLogic.getStatus();
}

export async function updateJSONConfiguration(jsonData) {
  console.log('MetaGame.updateJSONConfiguration called with:', jsonData);
  if (!metaGameLogic) {
    console.error('MetaGame module not initialized');
    throw new Error('MetaGame module not initialized');
  }
  console.log('Calling metaGameLogic.updateJSONConfiguration with:', jsonData);
  const result = await metaGameLogic.updateJSONConfiguration(jsonData);
  console.log('metaGameLogic.updateJSONConfiguration returned:', result);
  return result;
}

export function clearConfiguration() {
  console.log('MetaGame.clearConfiguration called');
  if (!metaGameLogic) {
    console.log('MetaGame module not initialized - nothing to clear');
    return;
  }
  console.log('Calling metaGameLogic.cleanup');
  metaGameLogic.cleanup();
  console.log('MetaGame configuration cleared');
}