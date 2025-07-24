import { MetaGamePanelUI } from './metaGamePanelUI.js';

export const moduleInfo = {
  name: 'MetaGamePanel',
  description: 'UI panel for metaGame module configuration and management'
};

export function register(registrationApi) {
  // Register the panel component
  registrationApi.registerPanelComponent('metaGamePanel', MetaGamePanelUI);
  
  // Register event bus publishers
  registrationApi.registerEventBusPublisher('metaGamePanel:configurationApplied');
  registrationApi.registerEventBusPublisher('metaGamePanel:error');
  
  // Register settings schema
  registrationApi.registerSettingsSchema({
    metaGamePanel: {
      type: 'object',
      properties: {
        defaultFilePath: { type: 'string', default: '' },
        enableSyntaxHighlighting: { type: 'boolean', default: true }
      }
    }
  });
}

export function initialize(moduleId, priorityIndex, initializationApi) {
  const eventBus = initializationApi.getEventBus();
  const logger = initializationApi.getLogger();
  
  logger.info('metaGamePanel', 'Initializing MetaGamePanel module...');
  
  try {
    // Get access to metaGame module functions
    const metaGameAPI = {
      loadConfiguration: initializationApi.getModuleFunction('MetaGame', 'loadConfiguration'),
      getStatus: initializationApi.getModuleFunction('MetaGame', 'getStatus')
    };
    
    // Set up a way to pass APIs to UI instances when they're created
    MetaGamePanelUI.prototype.initializeAPIs = function() {
      this.setAPIs(eventBus, logger, metaGameAPI);
    };
    
    logger.info('metaGamePanel', 'MetaGamePanel module initialized successfully');
    
    // Return cleanup function
    return () => {
      logger.info('metaGamePanel', 'Cleaning up MetaGamePanel module...');
    };
    
  } catch (error) {
    logger.error('metaGamePanel', 'Failed to initialize MetaGamePanel module:', error);
    throw error;
  }
}