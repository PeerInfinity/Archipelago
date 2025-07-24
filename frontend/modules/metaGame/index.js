import { MetaGameLogic } from './metaGameLogic.js';

export const moduleInfo = {
  name: 'MetaGame',
  description: 'Meta-game features and event orchestration system'
};

let metaGameLogic = null;

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

export function register(registrationApi) {
  // Register event dispatcher receivers for the events we want to intercept
  registrationApi.registerDispatcherReceiver(
    moduleInfo.name,
    'user:regionMove',
    handleRegionMove,
    { direction: 'up', condition: 'unconditional', timing: 'immediate' }
  );
  
  registrationApi.registerDispatcherReceiver(
    moduleInfo.name,
    'user:locationCheck',
    handleLocationCheck,
    { direction: 'up', condition: 'unconditional', timing: 'immediate' }
  );
  
  // Register public functions for other modules to call
  registrationApi.registerPublicFunction(moduleInfo.name, 'loadConfiguration', loadConfiguration);
  registrationApi.registerPublicFunction(moduleInfo.name, 'getStatus', getStatus);
  
  // Register event publishers
  registrationApi.registerEventBusPublisher('metaGame:configurationLoaded');
  registrationApi.registerEventBusPublisher('metaGame:ready');
  registrationApi.registerEventBusPublisher('metaGame:error');
  registrationApi.registerEventBusPublisher('progressBar:create');
  registrationApi.registerEventBusPublisher('progressBar:show');
  registrationApi.registerEventBusPublisher('progressBar:hide');
  registrationApi.registerEventBusPublisher('progressBar:destroy');
  registrationApi.registerEventBusPublisher('ui:activatePanel');
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
      initializationApi
    });
    
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
    eventBus.publish('metaGame:error', { error: error.message }, moduleInfo.name);
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