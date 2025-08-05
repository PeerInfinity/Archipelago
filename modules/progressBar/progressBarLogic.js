/**
 * ProgressBarManager - Manages multiple progress bars
 */
export class ProgressBarManager {
  constructor(eventBus, dispatcher, logFunction) {
    this.eventBus = eventBus;
    this.dispatcher = dispatcher;
    this.log = logFunction;
    this.progressBars = new Map(); // id -> ProgressBar instance
  }

  /**
   * Handle progressBar:create event
   */
  handleCreateEvent(data) {
    this.log('debug', 'Received progressBar:create event', data);
    
    if (!data || !data.id) {
      this.log('error', 'progressBar:create event missing required id field', data);
      return;
    }

    if (this.progressBars.has(data.id)) {
      this.log('warn', `Progress bar with id "${data.id}" already exists, replacing it`);
      this.destroyProgressBar(data.id);
    }

    const progressBar = this.createProgressBar(data);
    if (progressBar) {
      this.log('info', `Created progress bar "${data.id}"`);
    }
  }

  /**
   * Handle progressBar:update event
   */
  handleUpdateEvent(data) {
    this.log('debug', 'Received progressBar:update event', data);
    
    if (!data || !data.id) {
      this.log('error', 'progressBar:update event missing required id field', data);
      return;
    }

    this.updateProgressBar(data.id, data.value, data.max, data.text);
  }

  /**
   * Handle progressBar:show event
   */
  handleShowEvent(data) {
    this.log('debug', 'Received progressBar:show event', data);
    
    if (!data || !data.id) {
      this.log('error', 'progressBar:show event missing required id field', data);
      return;
    }

    this.showProgressBar(data.id);
  }

  /**
   * Handle progressBar:hide event
   */
  handleHideEvent(data) {
    this.log('debug', 'Received progressBar:hide event', data);
    
    if (!data || !data.id) {
      this.log('error', 'progressBar:hide event missing required id field', data);
      return;
    }

    this.hideProgressBar(data.id);
  }

  /**
   * Handle progressBar:destroy event
   */
  handleDestroyEvent(data) {
    this.log('debug', 'Received progressBar:destroy event', data);
    
    if (!data || !data.id) {
      this.log('error', 'progressBar:destroy event missing required id field', data);
      return;
    }

    this.destroyProgressBar(data.id);
  }

  /**
   * Create a new progress bar
   */
  createProgressBar(config) {
    if (!config.id) {
      this.log('error', 'Cannot create progress bar without id', config);
      return null;
    }

    if (!config.targetElement) {
      this.log('error', `Cannot create progress bar "${config.id}" without targetElement`, config);
      return null;
    }

    // Validate target element exists and is in DOM
    if (!(config.targetElement instanceof HTMLElement)) {
      this.log('error', `Target element for progress bar "${config.id}" is not a valid HTMLElement`, config.targetElement);
      return null;
    }

    if (!document.contains(config.targetElement)) {
      this.log('error', `Target element for progress bar "${config.id}" is not in the DOM`, config.targetElement);
      return null;
    }

    try {
      const progressBar = new ProgressBar(config, this.eventBus, this.dispatcher, this.log);
      this.progressBars.set(config.id, progressBar);
      return progressBar;
    } catch (error) {
      this.log('error', `Failed to create progress bar "${config.id}"`, error);
      return null;
    }
  }

  /**
   * Update a progress bar
   */
  updateProgressBar(id, value, max, text) {
    const progressBar = this.progressBars.get(id);
    if (!progressBar) {
      this.log('warn', `Cannot update progress bar "${id}" - not found`);
      return;
    }

    progressBar.updateProgress(value, max, text);
  }

  /**
   * Show a progress bar
   */
  showProgressBar(id) {
    const progressBar = this.progressBars.get(id);
    if (!progressBar) {
      this.log('warn', `Cannot show progress bar "${id}" - not found`);
      return;
    }

    progressBar.show();
  }

  /**
   * Hide a progress bar
   */
  hideProgressBar(id) {
    const progressBar = this.progressBars.get(id);
    if (!progressBar) {
      this.log('warn', `Cannot hide progress bar "${id}" - not found`);
      return;
    }

    progressBar.hide();
  }

  /**
   * Destroy a progress bar
   */
  destroyProgressBar(id) {
    const progressBar = this.progressBars.get(id);
    if (!progressBar) {
      this.log('warn', `Cannot destroy progress bar "${id}" - not found`);
      return;
    }

    progressBar.destroy();
    this.progressBars.delete(id);
    this.log('info', `Destroyed progress bar "${id}"`);
  }

  /**
   * Clean up all progress bars
   */
  cleanup() {
    this.log('info', `Cleaning up ${this.progressBars.size} progress bars`);
    for (const [id, progressBar] of this.progressBars) {
      progressBar.destroy();
    }
    this.progressBars.clear();
  }
}

/**
 * ProgressBar - Individual progress bar instance
 */
export class ProgressBar {
  constructor(config, eventBus, dispatcher, logFunction) {
    this.id = config.id;
    this.eventBus = eventBus;
    this.dispatcher = dispatcher;
    this.log = logFunction;
    this.config = config;
    
    // Progress tracking
    this.currentValue = 0;
    this.maxValue = 100;
    this.isStarted = false;
    this.isCompleted = false;
    
    // Timer mode tracking
    this.timerInterval = null;
    this.startTime = null;
    this.duration = config.duration || 5000; // Default 5 seconds
    
    // Event subscriptions
    this.eventUnsubscribers = [];
    this.dispatcherUnsubscribers = [];
    
    // DOM elements
    this.containerElement = null;
    this.textElement = null;
    this.progressElement = null;
    
    this._createDOM();
    this._setupEventListeners();
  }

  /**
   * Create DOM structure
   */
  _createDOM() {
    // Create container
    this.containerElement = document.createElement('div');
    this.containerElement.className = 'progress-bar-container';
    this.containerElement.setAttribute('data-progress-id', this.id);

    // Create text element
    this.textElement = document.createElement('div');
    this.textElement.className = 'progress-bar-text';
    this.textElement.textContent = this.config.text || '';

    // Create progress element
    this.progressElement = document.createElement('progress');
    this.progressElement.className = 'progress-bar-element';
    this.progressElement.value = 0;
    this.progressElement.max = 100;

    // Append elements
    this.containerElement.appendChild(this.textElement);
    this.containerElement.appendChild(this.progressElement);

    // Add to target element
    this.config.targetElement.appendChild(this.containerElement);
  }

  /**
   * Setup event listeners
   */
  _setupEventListeners() {
    const eventSource = this.config.eventSource || 'eventBus';
    
    if (eventSource === 'eventBus' || eventSource === 'both') {
      this._setupEventBusListeners();
    }
    
    if (eventSource === 'eventDispatcher' || eventSource === 'both') {
      this._setupDispatcherListeners();
    }
  }

  /**
   * Setup eventBus listeners
   */
  _setupEventBusListeners() {
    // Listen for start event
    if (this.config.startEvent) {
      const startUnsubscriber = this.eventBus.subscribe(
        this.config.startEvent,
        this._handleStartEvent.bind(this),
        'progressBar'
      );
      this.eventUnsubscribers.push(startUnsubscriber);
    }

    // Listen for update events (event mode)
    if (this.config.mode === 'event' && this.config.updateEvent) {
      const updateUnsubscriber = this.eventBus.subscribe(
        this.config.updateEvent,
        this._handleUpdateEvent.bind(this),
        'progressBar'
      );
      this.eventUnsubscribers.push(updateUnsubscriber);
    }
  }

  /**
   * Setup dispatcher listeners
   */
  _setupDispatcherListeners() {
    // Note: EventDispatcher doesn't have subscribe method
    // Dispatcher events are handled through the registration system at the module level
    // Individual progress bars only use eventBus for now
  }

  /**
   * Handle start event
   */
  _handleStartEvent(data) {
    if (this.isStarted) {
      this.log('warn', `Progress bar "${this.id}" start event received but already started`);
      return;
    }

    this.start();
  }

  /**
   * Handle update event (for event mode)
   */
  _handleUpdateEvent(data) {
    if (!this.isStarted) {
      this.log('warn', `Progress bar "${this.id}" update event received but not started`);
      return;
    }

    if (this.config.mode !== 'event') {
      this.log('warn', `Progress bar "${this.id}" update event received but not in event mode`);
      return;
    }

    // Check if update is for this progress bar (if data has id field)
    if (data && data.id && data.id !== this.id) {
      return; // Not for this progress bar
    }

    if (data && typeof data.value === 'number') {
      const max = typeof data.max === 'number' ? data.max : this.maxValue;
      const text = data.text || null;
      this.updateProgress(data.value, max, text);
    }
  }

  /**
   * Start the progress bar
   */
  start() {
    if (this.isStarted) {
      return;
    }

    this.isStarted = true;
    this.log('info', `Starting progress bar "${this.id}" in ${this.config.mode || 'timer'} mode`);

    // Publish start event
    this._publishEvent('progressBar:started', {
      id: this.id,
      mode: this.config.mode || 'timer'
    });

    if (this.config.mode === 'timer' || !this.config.mode) {
      this._startTimerMode();
    } else if (this.config.mode === 'event') {
      this._startEventMode();
    }
  }

  /**
   * Start timer mode
   */
  _startTimerMode() {
    this.startTime = Date.now();
    this.maxValue = this.duration;
    this.progressElement.max = this.duration;

    // Update every 100ms (10 times per second)
    this.timerInterval = setInterval(() => {
      const elapsed = Date.now() - this.startTime;
      
      if (elapsed >= this.duration) {
        // Complete
        this.updateProgress(this.duration, this.duration);
        this._complete();
      } else {
        // Update progress
        this.updateProgress(elapsed, this.duration);
      }
    }, 100);
  }

  /**
   * Start event mode
   */
  _startEventMode() {
    // Event mode waits for external update events
    // Nothing to do here except mark as started
    this.log('debug', `Progress bar "${this.id}" started in event mode, waiting for updates`);
  }

  /**
   * Update progress
   */
  updateProgress(value, max, text) {
    if (typeof value === 'number') {
      this.currentValue = value;
      this.progressElement.value = value;
    }

    if (typeof max === 'number') {
      this.maxValue = max;
      this.progressElement.max = max;
    }

    // Update text if provided
    if (text !== null && text !== undefined) {
      this.textElement.textContent = text;
    } else if (this.config.mode === 'timer' || !this.config.mode) {
      // For timer mode, update text with time remaining
      const elapsed = this.currentValue;
      const remaining = Math.max(0, this.maxValue - elapsed);
      const remainingSeconds = Math.ceil(remaining / 1000);
      this.textElement.textContent = `${this.config.text || ''} (${remainingSeconds}s remaining)`;
    }

    // Publish update event
    this._publishEvent('progressBar:updated', {
      id: this.id,
      value: this.currentValue,
      max: this.maxValue,
      progress: this.maxValue > 0 ? (this.currentValue / this.maxValue) : 0
    });

    // Check for completion in event mode
    if (this.config.mode === 'event' && this.currentValue >= this.maxValue) {
      this._complete();
    }
  }

  /**
   * Complete the progress bar
   */
  _complete() {
    if (this.isCompleted) {
      return;
    }

    this.isCompleted = true;
    this.log('info', `Progress bar "${this.id}" completed`);

    // Clear timer if running
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    // Update final text
    this.textElement.textContent = `${this.config.text || ''} (Complete)`;

    // Publish completion event
    if (this.config.completionEvent) {
      this._publishEvent(this.config.completionEvent, this.config.completionPayload || null);
    }

    // Handle auto cleanup
    const autoCleanup = this.config.autoCleanup || 'none';
    if (autoCleanup === 'hide') {
      setTimeout(() => this.hide(), 100);
    } else if (autoCleanup === 'destroy') {
      setTimeout(() => this.destroy(), 100);
    }
  }

  /**
   * Show the progress bar
   */
  show() {
    if (this.containerElement) {
      this.containerElement.style.display = '';
      this.log('debug', `Showed progress bar "${this.id}"`);
    }
  }

  /**
   * Hide the progress bar
   */
  hide() {
    if (this.containerElement) {
      this.containerElement.style.display = 'none';
      this.log('debug', `Hid progress bar "${this.id}"`);
    }
  }

  /**
   * Destroy the progress bar
   */
  destroy() {
    this.log('debug', `Destroying progress bar "${this.id}"`);

    // Clear timer
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    // Unsubscribe from events
    this.eventUnsubscribers.forEach(unsub => unsub());
    this.eventUnsubscribers = [];
    
    // Note: dispatcher doesn't provide unsubscribe mechanism

    // Remove DOM elements
    if (this.containerElement && this.containerElement.parentNode) {
      this.containerElement.parentNode.removeChild(this.containerElement);
    }

    this.containerElement = null;
    this.textElement = null;
    this.progressElement = null;
  }

  /**
   * Publish event to both eventBus and dispatcher (if configured)
   */
  _publishEvent(eventName, data) {
    const eventSource = this.config.eventSource || 'eventBus';
    
    if (eventSource === 'eventBus' || eventSource === 'both') {
      this.eventBus.publish(eventName, data, 'progressBar');
    }
    
    if (eventSource === 'eventDispatcher' || eventSource === 'both') {
      this.dispatcher.publish(eventName, data);
    }
  }
}