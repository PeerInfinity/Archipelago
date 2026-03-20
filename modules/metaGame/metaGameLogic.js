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
    this.progressBarCompletionHandlers = new Map(); // Track active completion handler unsubscribers
    this.registeredDispatcherReceivers = []; // Track registered dispatcher receivers for cleanup
    this.activeMazeChallenge = null; // Active maze challenge state
    this.mazeCompletionUnsubscribe = null; // Unsubscribe function for maze completion handler
    
    this.logger.info('metaGame', 'MetaGameLogic instance created');
  }
  
  async postInitialize() {
    try {
      // Get access to other modules we need
      this.progressBarAPI = {
        create: (config) => this.eventBus.publish('progressBar:create', config),
        show: (id) => this.eventBus.publish('progressBar:show', { id }),
        hide: (id) => this.eventBus.publish('progressBar:hide', { id }),
        destroy: (id) => this.eventBus.publish('progressBar:destroy', { id })
      };
      
      this.isReady = true;
      this.eventBus.publish('metaGame:ready', { status: 'ready' });
      this.logger.info('metaGame', 'MetaGameLogic ready');
      
    } catch (error) {
      this.logger.error('metaGame', 'MetaGameLogic post-initialization failed:', error);
      throw error;
    } finally {
      this._isLoadingConfig = false;
    }
  }
  
  async loadConfiguration(filePath) {
    if (this._isLoadingConfig) {
      this.logger.info('metaGame', `Ignoring duplicate loadConfiguration call for: ${filePath}`);
      console.log('MetaGameLogic.loadConfiguration SKIPPED (already loading):', filePath);
      return { success: true, configuration: this.configuration, skipped: true };
    }
    this._isLoadingConfig = true;

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
      });
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
      });
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
    
    // Register event dispatcher receivers for all events in the configuration
    if (this.registrationApi && this.registeredDispatcherReceivers.length === 0) {
      if (this.configuration.eventDispatcher) {
        for (const [eventName, eventConfig] of Object.entries(this.configuration.eventDispatcher)) {
          if (!eventConfig.actions) {
            this.logger.warn('metaGame', `No actions defined for event: ${eventName}`);
            continue;
          }

          const handler = (eventData, context) => {
            return this.handleDispatcherEvent(eventName, eventData, context);
          };

          this.registrationApi.registerDispatcherReceiver(
            'metaGame',
            eventName,
            handler,
            { direction: 'up', condition: 'unconditional', timing: 'immediate' }
          );

          this.registeredDispatcherReceivers.push(
            { moduleName: 'metaGame', eventName, handler }
          );

          this.logger.debug('metaGame', `Registered dispatcher receiver for: ${eventName}`);
        }
      }

      this.logger.info('metaGame', `Event dispatcher receivers registered: ${this.registeredDispatcherReceivers.length} events`);
    } else if (this.registeredDispatcherReceivers.length > 0) {
      this.logger.debug('metaGame', 'Event dispatcher receivers already registered, skipping duplicate registration');
    }
    
    // Process eventBus configuration
    if (this.configuration.eventBus) {
      for (const [eventName, eventConfig] of Object.entries(this.configuration.eventBus)) {
        this.logger.debug('metaGame', `Setting up bus handler for: ${eventName}`);
        
        if (eventConfig.actions) {
          // Set up event bus subscriber if needed
          this.eventBus.subscribe(eventName, (data) => {
            this.executeActions(eventConfig.actions, data, eventName);
          });
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

      case 'startMazeChallenge':
        await this.handleStartMazeChallenge(action, eventData, eventName);
        break;

      case 'cancelMazeChallenge':
        this.handleCancelMazeChallenge();
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
    
    // If this progress bar is already active, cancel it (restart behavior)
    const existingUnsub = this.progressBarCompletionHandlers.get(progressBarId);
    if (existingUnsub) {
      const oldConfig = this.progressBars.get(progressBarId);
      this.logger.debug('metaGame', `Cancelling active progress bar: ${progressBarId}`);
      existingUnsub();
      this.progressBarCompletionHandlers.delete(progressBarId);

      // Notify that this progress bar's action was cancelled
      if (oldConfig?.completionPayload) {
        this.eventBus.publish('metaGame:progressBarCancelled', {
          progressBarId,
          originalEvent: oldConfig.completionPayload.originalEvent,
          eventData: oldConfig.completionPayload.eventData
        });
      }
    }

    this.logger.debug('metaGame', `Creating progress bar: ${progressBarId}`, progressBarConfig);
    this.progressBarAPI.create(progressBarConfig);
    this.progressBars.set(progressBarId, progressBarConfig);

    // Start the progress bar immediately
    this.eventBus.publish(`metaGame:${progressBarId}Start`, {});

    // Set up completion handler
    const completionHandler = (completionData) => {
      this.logger.debug('metaGame', `Progress bar ${progressBarId} completed`, completionData);

      // Execute completion actions if specified
      if (config.completionActions) {
        this.executeActions(config.completionActions, eventData, originalEventName);
      }

      // Clean up the handler
      this.progressBarCompletionHandlers.delete(progressBarId);
      unsubscribe();
    };

    const unsubscribe = this.eventBus.subscribe(`metaGame:${progressBarId}Complete`, completionHandler);
    this.progressBarCompletionHandlers.set(progressBarId, unsubscribe);
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
  
  async handleStartMazeChallenge(action, eventData, originalEventName) {
    const { challengeId, config } = action;
    if (!challengeId || !config) {
      throw new Error('startMazeChallenge action requires challengeId and config');
    }

    this.logger.debug('metaGame', `Starting maze challenge: ${challengeId}`, config);

    // Cancel any existing active maze challenge
    this.handleCancelMazeChallenge();

    // Save the currently active panel in the iframe panel's stack
    const savedPanelType = this.findActivePanelInIframeStack();
    this.logger.debug('metaGame', `Saved active panel type: ${savedPanelType}`);

    // Store active challenge state
    this.activeMazeChallenge = {
      challengeId,
      completionActions: config.completionActions,
      eventData,
      originalEventName,
      savedPanelType
    };

    // Check if using window mode
    const useWindow = new URLSearchParams(window.location.search).get('useWindow');

    if (useWindow) {
      // In window mode: open the maze game in a separate window
      this.eventBus.publish('window:loadUrl', {
        url: './modules/a-mazing-idle-remote/index-iframe.html'
      });
    } else {
      // In iframe mode: activate the iframe panel to show the maze game
      this.eventBus.publish('ui:activatePanel', { panelId: 'iframePanel' });
    }

    // Set the biome for this challenge (triggers iframe reload).
    // Upgrades are written directly to save data; disableBiomeCheck zeros out
    // the game's biome requirements so upgrades take effect at any biome level.
    if (typeof config.biome === 'number') {
      const setBiomeData = { biome: config.biome };
      if (config.upgrades) {
        setBiomeData.upgrades = config.upgrades;
      }
      if (config.disableBiomeCheck) {
        setBiomeData.disableBiomeCheck = true;
      }
      this.eventBus.publish('amazingIdle:setBiome', setBiomeData);
    }

    if (!useWindow) {
      // Focus the iframe so keyboard input goes to the maze game
      requestAnimationFrame(() => {
        const iframe = document.querySelector('.iframe-panel-container iframe');
        if (iframe) {
          iframe.focus();
          this.logger.debug('metaGame', 'Focused maze game iframe');
        }
      });
    }

    // Subscribe to maze completion (one-shot)
    const completionHandler = (data) => {
      this.onMazeCompleted(data);
    };
    this.mazeCompletionUnsubscribe = this.eventBus.subscribe('amazingIdle:mazeCompleted', completionHandler);

    this.logger.info('metaGame', `Maze challenge ${challengeId} started, waiting for completion`);
  }

  handleCancelMazeChallenge() {
    if (!this.activeMazeChallenge) {
      return;
    }

    this.logger.debug('metaGame', `Cancelling maze challenge: ${this.activeMazeChallenge.challengeId}`);

    // Unsubscribe the completion handler
    if (this.mazeCompletionUnsubscribe) {
      this.mazeCompletionUnsubscribe();
      this.mazeCompletionUnsubscribe = null;
    }

    this.activeMazeChallenge = null;
  }

  findActivePanelInIframeStack() {
    const gl = window.goldenLayoutInstance;
    if (!gl || !gl.root) {
      this.logger.warn('metaGame', 'Cannot find iframe stack: GoldenLayout not available');
      return null;
    }

    // Find the iframePanel component in the layout
    const allItems = gl.getAllContentItems();
    let iframePanelItem = null;
    for (const item of allItems) {
      if (item.componentType === 'iframePanel') {
        iframePanelItem = item;
        break;
      }
    }

    if (!iframePanelItem) {
      this.logger.warn('metaGame', 'Could not find iframePanel in layout');
      return null;
    }

    // Get the parent stack and its active component
    const stack = iframePanelItem.parent;
    if (!stack || !stack.getActiveComponentItem) {
      this.logger.warn('metaGame', 'iframePanel parent is not a stack');
      return null;
    }

    const activeItem = stack.getActiveComponentItem();
    if (activeItem) {
      return activeItem.componentType;
    }

    return null;
  }

  onMazeCompleted(data) {
    if (!this.activeMazeChallenge) {
      this.logger.warn('metaGame', 'Maze completed but no active challenge');
      return;
    }

    const { challengeId, completionActions, eventData, originalEventName, savedPanelType } = this.activeMazeChallenge;
    this.logger.info('metaGame', `Maze challenge ${challengeId} completed`, data);

    // Clean up the completion handler
    if (this.mazeCompletionUnsubscribe) {
      this.mazeCompletionUnsubscribe();
      this.mazeCompletionUnsubscribe = null;
    }

    // Restore the previously active panel or close the window
    const useWindow = new URLSearchParams(window.location.search).get('useWindow');
    if (useWindow) {
      this.eventBus.publish('window:close', {});
    } else if (savedPanelType) {
      this.logger.debug('metaGame', `Restoring panel: ${savedPanelType}`);
      this.eventBus.publish('ui:activatePanel', { panelId: savedPanelType });
    }

    // Clear active challenge before executing completion actions
    this.activeMazeChallenge = null;

    // Execute completion actions
    if (completionActions) {
      this.executeActions(completionActions, eventData, originalEventName);
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
    return this.handleDispatcherEvent('user:regionMove', eventData, context);
  }

  async handleLocationCheckEvent(eventData, context) {
    return this.handleDispatcherEvent('user:locationCheck', eventData, context);
  }

  /**
   * Generic dispatcher event handler. Looks up the event in the configuration,
   * evaluates conditions, executes actions, and controls propagation.
   * @param {string} eventName - The event name
   * @param {Object} eventData - The event data
   * @param {Object} context - The dispatcher context
   * @returns {Object} Action result ({ action: 'continue' | 'stop' })
   */
  async handleDispatcherEvent(eventName, eventData, context) {
    this.logger.debug('metaGame', `Handling dispatcher event: ${eventName}`, eventData);

    let shouldForward = true;

    if (this.configuration && this.configuration.eventDispatcher) {
      const eventConfig = this.configuration.eventDispatcher[eventName];
      if (eventConfig) {
        // If a condition function is defined, evaluate it first
        if (typeof eventConfig.condition === 'function' && !eventConfig.condition(eventData)) {
          this.logger.debug('metaGame', `Condition returned false for ${eventName}, forwarding immediately`);
          this.dispatcher.publishToNextModule('metaGame', eventName, eventData, { direction: 'up' });
          return { action: 'continue' };
        }

        // Execute the configured actions
        if (eventConfig.actions) {
          await this.executeActions(eventConfig.actions, eventData, eventName);
        }

        // Check if configuration says not to forward
        if (eventConfig.stopPropagation) {
          shouldForward = false;
        }
      }
    }

    if (shouldForward) {
      this.dispatcher.publishToNextModule('metaGame', eventName, eventData, { direction: 'up' });
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
      });
      
      this.logger.info('metaGame', 'JSON configuration updated successfully');
      return { success: true, configuration: this.configuration };
      
    } catch (error) {
      this.logger.error('metaGame', 'Failed to update JSON configuration:', error);
      this.eventBus.publish('metaGame:error', {
        error: `Configuration update failed: ${error.message}`
      });
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
    
    // Clean up active maze challenge
    this.handleCancelMazeChallenge();

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