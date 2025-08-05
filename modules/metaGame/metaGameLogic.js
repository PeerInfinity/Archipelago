export class MetaGameLogic {
  constructor({ dispatcher, eventBus, logger, moduleId, priorityIndex, initializationApi, registrationApi }) {
    this.dispatcher = dispatcher;
    this.eventBus = eventBus;
    this.logger = logger;
    this.moduleId = moduleId;
    this.priorityIndex = priorityIndex;
    this.initializationApi = initializationApi;
    this.registrationApi = registrationApi;
    
    this.configuration = null;
    this.isReady = false;
    this.eventHandlers = new Map();
    this.progressBars = new Map(); // Track created progress bars
    this.registeredDispatcherReceivers = []; // Track registered dispatcher receivers for cleanup
    
    this.logger.info('metaGame', 'MetaGameLogic instance created');
  }
  
  async postInitialize() {
    try {
      // Get access to other modules we need
      this.progressBarAPI = {
        create: (config) => this.eventBus.publish('progressBar:create', config, 'metaGame'),
        show: (id) => this.eventBus.publish('progressBar:show', { id }, 'metaGame'),
        hide: (id) => this.eventBus.publish('progressBar:hide', { id }, 'metaGame'),
        destroy: (id) => this.eventBus.publish('progressBar:destroy', { id }, 'metaGame')
      };
      
      this.isReady = true;
      this.eventBus.publish('metaGame:ready', { status: 'ready' }, 'metaGame');
      this.logger.info('metaGame', 'MetaGameLogic ready');
      
    } catch (error) {
      this.logger.error('metaGame', 'MetaGameLogic post-initialization failed:', error);
      throw error;
    }
  }
  
  async loadConfiguration(filePath) {
    this.logger.info('metaGame', `Loading configuration from: ${filePath}`);
    console.log('MetaGameLogic.loadConfiguration called with:', filePath);
    
    try {
      // Dynamically import the configuration file
      console.log('About to import configuration module from:', filePath);
      const configModule = await import(filePath);
      console.log('Configuration module imported successfully:', configModule);
      
      // Check if the module has the expected structure
      console.log('Checking module structure...');
      console.log('Has initializeMetaGame:', !!configModule.initializeMetaGame);
      console.log('Has metaGameConfiguration:', !!configModule.metaGameConfiguration);
      
      if (!configModule.initializeMetaGame || !configModule.metaGameConfiguration) {
        throw new Error('Configuration file must export initializeMetaGame function and metaGameConfiguration object');
      }
      
      // Store the configuration
      console.log('Storing configuration...');
      this.configuration = configModule.metaGameConfiguration;
      console.log('Configuration stored:', this.configuration);
      
      // Call the initialization function
      console.log('About to call initializeMetaGame function...');
      this.logger.info('metaGame', 'Calling initializeMetaGame function...');
      await configModule.initializeMetaGame({
        eventBus: this.eventBus,
        dispatcher: this.dispatcher,
        logger: this.logger,
        progressBarAPI: this.progressBarAPI,
        initializationApi: this.initializationApi
      });
      console.log('initializeMetaGame function completed successfully');
      this.logger.info('metaGame', 'initializeMetaGame function completed');
      
      // Process the configuration to set up event handlers
      console.log('About to process configuration...');
      this.logger.info('metaGame', 'Processing configuration...');
      await this.processConfiguration();
      console.log('Configuration processing completed');
      this.logger.info('metaGame', 'Configuration processing completed');
      
      console.log('About to publish metaGame:configurationLoaded event');
      this.logger.info('metaGame', 'Publishing metaGame:configurationLoaded event');
      this.eventBus.publish('metaGame:configurationLoaded', { 
        filePath,
        configuration: this.configuration 
      }, 'metaGame');
      console.log('metaGame:configurationLoaded event published successfully');
      this.logger.info('metaGame', 'metaGame:configurationLoaded event published');
      
      this.logger.info('metaGame', 'Configuration loaded and applied successfully');
      return { success: true, configuration: this.configuration };
      
    } catch (error) {
      console.error('MetaGameLogic.loadConfiguration error:', error);
      console.error('Error stack:', error.stack);
      this.logger.error('metaGame', `Failed to load configuration from ${filePath}:`, error);
      this.eventBus.publish('metaGame:error', { 
        error: `Configuration loading failed: ${error.message}`,
        filePath 
      }, 'metaGame');
      throw error;
    }
  }
  
  async processConfiguration() {
    console.log('processConfiguration called');
    if (!this.configuration) {
      console.log('No configuration found, returning early');
      return;
    }
    
    console.log('Processing configuration with data:', this.configuration);
    this.logger.info('metaGame', 'Processing configuration...');
    
    // Register event dispatcher receivers now that we have configuration (only if not already registered)
    if (this.registrationApi && this.registeredDispatcherReceivers.length === 0) {
      // Create handler functions that call our methods
      const regionMoveHandler = (eventData, context) => {
        return this.handleRegionMoveEvent(eventData, context);
      };
      
      const locationCheckHandler = (eventData, context) => {
        return this.handleLocationCheckEvent(eventData, context);
      };
      
      this.registrationApi.registerDispatcherReceiver(
        'MetaGame',
        'user:regionMove',
        regionMoveHandler,
        { direction: 'up', condition: 'unconditional', timing: 'immediate' }
      );
      
      this.registrationApi.registerDispatcherReceiver(
        'MetaGame',
        'user:locationCheck',
        locationCheckHandler,
        { direction: 'up', condition: 'unconditional', timing: 'immediate' }
      );
      
      // Track registered receivers for cleanup
      this.registeredDispatcherReceivers.push(
        { moduleName: 'MetaGame', eventName: 'user:regionMove', handler: regionMoveHandler },
        { moduleName: 'MetaGame', eventName: 'user:locationCheck', handler: locationCheckHandler }
      );
      
      this.logger.info('metaGame', 'Event dispatcher receivers registered after configuration loading');
    } else if (this.registeredDispatcherReceivers.length > 0) {
      this.logger.debug('metaGame', 'Event dispatcher receivers already registered, skipping duplicate registration');
    }
    
    // Process eventDispatcher configuration
    if (this.configuration.eventDispatcher) {
      for (const [eventName, eventConfig] of Object.entries(this.configuration.eventDispatcher)) {
        this.logger.debug('metaGame', `Processing dispatcher configuration for: ${eventName}`);
        
        if (!eventConfig.actions) {
          this.logger.warn('metaGame', `No actions defined for event: ${eventName}`);
        }
      }
    }
    
    // Process eventBus configuration
    if (this.configuration.eventBus) {
      for (const [eventName, eventConfig] of Object.entries(this.configuration.eventBus)) {
        this.logger.debug('metaGame', `Setting up bus handler for: ${eventName}`);
        
        if (eventConfig.actions) {
          // Set up event bus subscriber if needed
          this.eventBus.subscribe(eventName, (data) => {
            this.executeActions(eventConfig.actions, data, eventName);
          }, 'metaGame');
        }
      }
    }
    
    console.log('processConfiguration completed successfully');
    this.logger.info('metaGame', 'Configuration processing completed');
  }
  
  async executeActions(actions, eventData, eventName) {
    if (!Array.isArray(actions)) {
      actions = [actions];
    }
    
    for (const action of actions) {
      try {
        await this.executeAction(action, eventData, eventName);
      } catch (error) {
        this.logger.error('metaGame', `Failed to execute action for ${eventName}:`, error);
      }
    }
  }
  
  async executeAction(action, eventData, eventName) {
    this.logger.debug('metaGame', `Executing action: ${action.type}`, action);
    
    switch (action.type) {
      case 'showProgressBar':
        await this.handleShowProgressBar(action, eventData, eventName);
        break;
        
      case 'hideProgressBar':
        await this.handleHideProgressBar(action, eventData, eventName);
        break;
        
      case 'createProgressBar':
        await this.handleCreateProgressBar(action, eventData, eventName);
        break;
        
      case 'forwardEvent':
        await this.handleForwardEvent(action, eventData, eventName);
        break;
        
      default:
        this.logger.warn('metaGame', `Unknown action type: ${action.type}`);
    }
  }
  
  async handleShowProgressBar(action, eventData, originalEventName) {
    const { progressBarId } = action;
    if (!progressBarId) {
      throw new Error('showProgressBar action requires progressBarId');
    }
    
    this.logger.debug('metaGame', `Showing progress bar: ${progressBarId}`);
    this.progressBarAPI.show(progressBarId);
  }
  
  async handleHideProgressBar(action, eventData, originalEventName) {
    const { progressBarId } = action;
    if (!progressBarId) {
      throw new Error('hideProgressBar action requires progressBarId');
    }
    
    this.logger.debug('metaGame', `Hiding progress bar: ${progressBarId}`);
    this.progressBarAPI.hide(progressBarId);
  }
  
  async handleCreateProgressBar(action, eventData, originalEventName) {
    const { progressBarId, config } = action;
    if (!progressBarId || !config) {
      throw new Error('createProgressBar action requires progressBarId and config');
    }
    
    // Replace placeholders in the text with actual data
    let text = config.text || '';
    
    // Handle region name replacement - try multiple possible property names
    if (eventData && (eventData.region || eventData.targetRegion)) {
      const regionName = eventData.region || eventData.targetRegion;
      text = text.replace(/\[region name\]/g, regionName);
    }
    
    // Handle location name replacement - try multiple possible property names
    if (eventData && (eventData.location || eventData.locationName)) {
      const locationName = eventData.location || eventData.locationName;
      text = text.replace(/\[location name\]/g, locationName);
    }
    
    // Get the target element for the progress bar
    const targetElement = this.getProgressBarTargetElement();
    
    const startEvent = `metaGame:${progressBarId}Start`;
    const completionEvent = `metaGame:${progressBarId}Complete`;
    
    // Dynamically register the start and completion events
    // metaGame publishes the start event, progressBar publishes the completion event
    this.eventBus.registerPublisher(startEvent, 'metaGame');
    this.eventBus.registerPublisher(completionEvent, 'progressBar');
    
    const progressBarConfig = {
      id: progressBarId,
      targetElement: targetElement,
      mode: config.mode || 'timer',
      duration: config.duration || 3000,
      text: text,
      startEvent: startEvent,
      completionEvent: completionEvent,
      completionPayload: { originalEvent: originalEventName, eventData },
      autoCleanup: 'hide',
      eventSource: 'eventBus'
    };
    
    this.logger.debug('metaGame', `Creating progress bar: ${progressBarId}`, progressBarConfig);
    this.progressBarAPI.create(progressBarConfig);
    this.progressBars.set(progressBarId, progressBarConfig);
    
    // Start the progress bar immediately
    this.eventBus.publish(`metaGame:${progressBarId}Start`, {}, 'metaGame');
    
    // Set up completion handler
    const completionHandler = (completionData) => {
      this.logger.debug('metaGame', `Progress bar ${progressBarId} completed`, completionData);
      
      // Execute completion actions if specified
      if (config.completionActions) {
        this.executeActions(config.completionActions, eventData, originalEventName);
      }
      
      // Clean up the handler
      this.eventBus.unsubscribe(`metaGame:${progressBarId}Complete`, completionHandler);
    };
    
    this.eventBus.subscribe(`metaGame:${progressBarId}Complete`, completionHandler, 'metaGame');
  }
  
  async handleForwardEvent(action, eventData, originalEventName) {
    const { eventName, direction } = action;
    const targetEventName = eventName || originalEventName;
    
    this.logger.debug('metaGame', `Forwarding event: ${targetEventName} in direction: ${direction}`);
    
    if (direction === 'up') {
      // Use publishToNextModule to forward to the next module in the "up" direction
      this.dispatcher.publishToNextModule(
        'metaGame',
        targetEventName,
        eventData,
        { direction: 'up' }
      );
    } else {
      // Regular dispatch
      this.dispatcher.publish(targetEventName, eventData, { initialTarget: 'bottom' });
    }
  }
  
  getProgressBarTargetElement() {
    // Try to find the progress bar panel
    const progressBarPanel = document.querySelector('.progress-bar-panel-main');
    if (progressBarPanel) {
      return progressBarPanel;
    }
    
    // Fallback to creating a container in the body
    let container = document.querySelector('#metaGame-progress-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'metaGame-progress-container';
      container.style.position = 'fixed';
      container.style.top = '10px';
      container.style.right = '10px';
      container.style.zIndex = '1000';
      document.body.appendChild(container);
    }
    
    return container;
  }
  
  async handleRegionMoveEvent(eventData, context) {
    this.logger.debug('metaGame', 'Handling user:regionMove event', eventData);
    
    // First, immediately forward the event up unless configuration instructs otherwise
    let shouldForward = true;
    
    if (this.configuration && this.configuration.eventDispatcher) {
      const eventConfig = this.configuration.eventDispatcher['user:regionMove'];
      if (eventConfig) {
        // Execute the configured actions
        if (eventConfig.actions) {
          await this.executeActions(eventConfig.actions, eventData, 'user:regionMove');
        }
        
        // Check if configuration says not to forward
        if (eventConfig.stopPropagation) {
          shouldForward = false;
        }
      }
    }
    
    if (shouldForward) {
      // Immediately forward the event up to the next module
      this.dispatcher.publishToNextModule(
        'MetaGame',
        'user:regionMove',
        eventData,
        { direction: 'up' }
      );
    }
    
    return { action: shouldForward ? 'continue' : 'stop' };
  }
  
  async handleLocationCheckEvent(eventData, context) {
    this.logger.debug('metaGame', 'Handling user:locationCheck event', eventData);
    
    // First, immediately forward the event up unless configuration instructs otherwise
    let shouldForward = true;
    
    if (this.configuration && this.configuration.eventDispatcher) {
      const eventConfig = this.configuration.eventDispatcher['user:locationCheck'];
      if (eventConfig) {
        // Execute the configured actions
        if (eventConfig.actions) {
          await this.executeActions(eventConfig.actions, eventData, 'user:locationCheck');
        }
        
        // Check if configuration says not to forward
        if (eventConfig.stopPropagation) {
          shouldForward = false;
        }
      }
    }
    
    if (shouldForward) {
      // Immediately forward the event up to the next module
      this.dispatcher.publishToNextModule(
        'MetaGame',
        'user:locationCheck',
        eventData,
        { direction: 'up' }
      );
    }
    
    return { action: shouldForward ? 'continue' : 'stop' };
  }
  
  async updateJSONConfiguration(jsonData) {
    this.logger.info('metaGame', 'Updating JSON configuration:', jsonData);
    
    try {
      // Validate that we have a current configuration to update
      if (!this.configuration) {
        throw new Error('No configuration currently loaded to update');
      }
      
      // Update the configuration's JSON data
      this.configuration = { ...this.configuration, ...jsonData };
      this.logger.info('metaGame', 'Configuration updated with new JSON data');
      
      // Reprocess the configuration to apply changes
      await this.processConfiguration();
      
      // Publish update event
      this.eventBus.publish('metaGame:configurationUpdated', { 
        configuration: this.configuration 
      }, 'metaGame');
      
      this.logger.info('metaGame', 'JSON configuration updated successfully');
      return { success: true, configuration: this.configuration };
      
    } catch (error) {
      this.logger.error('metaGame', 'Failed to update JSON configuration:', error);
      this.eventBus.publish('metaGame:error', { 
        error: `Configuration update failed: ${error.message}`
      }, 'metaGame');
      throw error;
    }
  }

  getStatus() {
    return {
      initialized: true,
      ready: this.isReady,
      hasConfiguration: !!this.configuration,
      progressBarsCreated: Array.from(this.progressBars.keys())
    };
  }
  
  cleanup() {
    this.logger.info('metaGame', 'Cleaning up MetaGameLogic...');
    
    // Clean up progress bars
    for (const progressBarId of this.progressBars.keys()) {
      this.progressBarAPI.destroy(progressBarId);
    }
    this.progressBars.clear();
    
    // Clean up event handlers
    this.eventHandlers.clear();
    
    // Clear registered dispatcher receivers array (note: actual unregistration not implemented yet)
    this.registeredDispatcherReceivers = [];
    
    // Remove container if we created one
    const container = document.querySelector('#metaGame-progress-container');
    if (container) {
      container.remove();
    }
    
    this.isReady = false;
    this.logger.info('metaGame', 'MetaGameLogic cleanup completed');
  }
}