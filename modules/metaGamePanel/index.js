import { MetaGamePanelUI } from './metaGamePanelUI.js';
import { createUniversalLogger } from '../../app/core/universalLogger.js';

export const moduleInfo = {
  name: 'MetaGamePanel',
  description: 'UI panel for metaGame module configuration and management'
};

export function register(registrationApi) {
  // Register the panel component
  registrationApi.registerPanelComponent('metaGamePanel', MetaGamePanelUI);
  
  // Register event bus publishers
  registrationApi.registerEventBusPublisher('metaGamePanel:configurationApplied');
  registrationApi.registerEventBusPublisher('metaGamePanel:jsonConfigurationApplied');
  registrationApi.registerEventBusPublisher('metaGamePanel:error');
  registrationApi.registerEventBusPublisher('metaGame:jsFileContent');
  
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
  const logger = createUniversalLogger('metaGamePanel');
  
  logger.info('Initializing MetaGamePanel module...');
  
  try {
    // Get access to metaGame module functions via centralRegistry
    const metaGameAPI = {
      loadConfiguration: window.centralRegistry?.getPublicFunction('MetaGame', 'loadConfiguration'),
      getStatus: window.centralRegistry?.getPublicFunction('MetaGame', 'getStatus'),
      updateJSONConfiguration: window.centralRegistry?.getPublicFunction('MetaGame', 'updateJSONConfiguration')
    };
    
    logger.debug('metaGameAPI setup:', {
      loadConfiguration: !!metaGameAPI.loadConfiguration,
      getStatus: !!metaGameAPI.getStatus,
      updateJSONConfiguration: !!metaGameAPI.updateJSONConfiguration,
      centralRegistry: !!window.centralRegistry
    });
    
    // Set up a way to pass APIs to UI instances when they're created
    MetaGamePanelUI.prototype.initializeAPIs = function() {
      this.setAPIs(eventBus, metaGameAPI);
    };
    
    // Also initialize APIs for any existing UI instances
    // This handles the case where Golden Layout creates the UI before module initialization
    const existingPanels = document.querySelectorAll('.metagame-panel');
    existingPanels.forEach(panelElement => {
      // Try to find the UI instance associated with this element
      // This is a bit hacky but necessary due to Golden Layout timing
      if (panelElement.__uiInstance) {
        logger.debug('Initializing APIs for existing panel instance');
        panelElement.__uiInstance.setAPIs(eventBus, metaGameAPI);
      }
    });
    
    logger.info('MetaGamePanel module initialized successfully');
    
    // Return cleanup function
    return () => {
      logger.info('Cleaning up MetaGamePanel module...');
    };
    
  } catch (error) {
    logger.error('Failed to initialize MetaGamePanel module:', error);
    throw error;
  }
}