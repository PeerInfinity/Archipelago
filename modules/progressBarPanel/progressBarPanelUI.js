import eventBus from '../../app/core/eventBus.js';

export class ProgressBarPanelUI {
  constructor(container, componentState) {
    this.container = container;
    this.componentState = componentState;
    this.rootElement = null;
    this.mainAreaElement = null;
    this.headerElement = null;
    this.buttonContainer = null;
    this.infoElement = null;
    this.unsubscribeHandles = [];
    this.isInitialized = false;
    
    this._createBaseUI();
    
    // Wait for app ready before full initialization
    const readyHandler = (eventPayload) => {
      this.initialize();
      eventBus.unsubscribe('app:readyForUiDataLoad', readyHandler);
    };
    eventBus.subscribe('app:readyForUiDataLoad', readyHandler, 'progressBarPanel');
    
    // Handle panel destruction
    this.container.on('destroy', () => {
      this.destroy();
    });
  }

  // Helper function for logging
  log(level, message, ...data) {
    if (typeof window !== 'undefined' && window.logger) {
      window.logger[level]('progressBarPanel', message, ...data);
    } else {
      const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
      consoleMethod(`[progressBarPanel] ${message}`, ...data);
    }
  }

  // Required by Golden Layout wrapper
  getRootElement() {
    return this.rootElement;
  }

  // Create the basic DOM structure
  _createBaseUI() {
    this.log('debug', 'Creating base UI for ProgressBarPanel');
    
    // Create root container
    this.rootElement = document.createElement('div');
    this.rootElement.classList.add('progress-bar-panel', 'panel-container');
    
    // Create header
    this.headerElement = document.createElement('div');
    this.headerElement.classList.add('panel-header');
    this.headerElement.innerHTML = '<h3>Progress Bars</h3>';
    
    // Create main content area where progress bars will be placed
    this.mainAreaElement = document.createElement('div');
    this.mainAreaElement.classList.add('progress-bar-panel-main');
    this.mainAreaElement.style.padding = '8px';
    this.mainAreaElement.style.overflow = 'auto';
    this.mainAreaElement.style.height = 'calc(100% - 50px)'; // Account for header
    
    // Create info text
    this.infoElement = document.createElement('div');
    this.infoElement.classList.add('progress-bar-panel-info');
    this.infoElement.style.color = '#888';
    this.infoElement.style.fontSize = '12px';
    this.infoElement.style.marginBottom = '12px';
    this.infoElement.innerHTML = 'Progress bars created via progressBar:create events will appear here.';
    
    // Append elements
    this.rootElement.appendChild(this.headerElement);
    this.mainAreaElement.appendChild(this.infoElement);
    this.rootElement.appendChild(this.mainAreaElement);
    
    // Add to container
    this.container.element.appendChild(this.rootElement);
    
    this.log('debug', 'Base UI created for ProgressBarPanel');
  }

  // Initialize after app is ready
  initialize() {
    if (!this.isInitialized) {
      this.log('info', 'Initializing ProgressBarPanel');
      
      this._subscribeToEvents();
      this._addTestButton();
      
      this.isInitialized = true;
      this.log('info', 'ProgressBarPanel initialized');
    }
  }

  // Subscribe to relevant events
  _subscribeToEvents() {
    // Subscribe to show/hide UI content events
    const showUIHandler = () => this.showUIContent();
    const hideUIHandler = () => this.hideUIContent();
    
    eventBus.subscribe('progressBarPanel:showUIContent', showUIHandler, 'progressBarPanel');
    eventBus.subscribe('progressBarPanel:hideUIContent', hideUIHandler, 'progressBarPanel');
    
    this.unsubscribeHandles.push(
      () => eventBus.unsubscribe('progressBarPanel:showUIContent', showUIHandler),
      () => eventBus.unsubscribe('progressBarPanel:hideUIContent', hideUIHandler)
    );
  }

  // Add a test button for demonstration purposes
  _addTestButton() {
    this.buttonContainer = document.createElement('div');
    this.buttonContainer.style.marginBottom = '12px';
    
    const testButton = document.createElement('button');
    testButton.textContent = 'Create Test Progress Bar';
    testButton.style.padding = '6px 12px';
    testButton.style.marginRight = '8px';
    testButton.onclick = () => this._createTestProgressBar();
    
    const clearButton = document.createElement('button');
    clearButton.textContent = 'Clear All';
    clearButton.style.padding = '6px 12px';
    clearButton.onclick = () => this._clearAllProgressBars();
    
    this.buttonContainer.appendChild(testButton);
    this.buttonContainer.appendChild(clearButton);
    this.mainAreaElement.insertBefore(this.buttonContainer, this.mainAreaElement.firstChild);
  }

  // Create a test progress bar for demonstration
  _createTestProgressBar() {
    const testId = `test-progress-${Date.now()}`;
    
    this.log('info', `Creating test progress bar with id: ${testId}`);
    
    // Register dynamic event publishers for this test progress bar
    const startEvent = `test:start-${testId}`;
    const completionEvent = `test:complete-${testId}`;
    
    // Register start event under progressBarPanel (since we publish it)
    eventBus.registerPublisher(startEvent, 'progressBarPanel');
    // Register completion event under progressBar (since the progressBar module publishes it)
    eventBus.registerPublisher(completionEvent, 'progressBar');
    
    // Send progressBar:create event
    eventBus.publish('progressBar:create', {
      id: testId,
      targetElement: this.mainAreaElement,
      mode: 'timer',
      duration: 3000, // 3 seconds
      text: `Test Progress Bar ${testId.split('-').pop()}`,
      startEvent: startEvent,
      completionEvent: completionEvent,
      completionPayload: `Test completed for ${testId}`,
      autoCleanup: 'none' // Keep visible after completion
    }, 'progressBarPanel');
    
    // Start the progress bar after a short delay
    setTimeout(() => {
      this.log('debug', `Starting test progress bar: ${testId}`);
      eventBus.publish(startEvent, {}, 'progressBarPanel');
    }, 500);
    
    // Listen for completion
    const completionHandler = (payload) => {
      this.log('info', `Test progress bar completed: ${testId}`, payload);
      eventBus.unsubscribe(completionEvent, completionHandler);
    };
    eventBus.subscribe(completionEvent, completionHandler, 'progressBarPanel');
  }

  // Clear all progress bars from the main area
  _clearAllProgressBars() {
    const progressBars = this.mainAreaElement.querySelectorAll('.progress-bar-container');
    progressBars.forEach(progressBar => {
      const progressId = progressBar.getAttribute('data-progress-id');
      if (progressId) {
        this.log('debug', `Destroying progress bar: ${progressId}`);
        eventBus.publish('progressBar:destroy', { id: progressId }, 'progressBarPanel');
      }
    });
    
    this.log('info', `Cleared ${progressBars.length} progress bars`);
  }

  // Get the main area element (for external use)
  getMainAreaElement() {
    return this.mainAreaElement;
  }

  // Show UI content (header, buttons, info text)
  showUIContent() {
    this.log('debug', 'Showing Progress Bar Panel UI content');
    
    if (this.headerElement) {
      this.headerElement.style.display = '';
    }
    
    if (this.buttonContainer) {
      this.buttonContainer.style.display = '';
    }
    
    if (this.infoElement) {
      this.infoElement.style.display = '';
    }
  }

  // Hide UI content (header, buttons, info text) - keep only progress bars visible
  hideUIContent() {
    this.log('debug', 'Hiding Progress Bar Panel UI content');
    
    if (this.headerElement) {
      this.headerElement.style.display = 'none';
    }
    
    if (this.buttonContainer) {
      this.buttonContainer.style.display = 'none';
    }
    
    if (this.infoElement) {
      this.infoElement.style.display = 'none';
    }
  }

  // Cleanup when panel is destroyed
  destroy() {
    this.log('info', 'Destroying ProgressBarPanel');
    
    // Unsubscribe from events
    this.unsubscribeHandles.forEach(unsub => unsub());
    this.unsubscribeHandles = [];
    
    // Clear any remaining progress bars
    this._clearAllProgressBars();
    
    this.log('info', 'ProgressBarPanel destroyed');
  }
}