// frontend/modules/timer/timerUI.js
import { Config } from '../client/core/config.js'; // For default timer interval
import { stateManagerProxySingleton } from '../stateManager/index.js'; // ADDED


// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('timerUI', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[timerUI] ${message}`, ...data);
  }
}

export class TimerUI {
  constructor(dependencies) {
    if (!dependencies || !dependencies.timerLogic || !dependencies.eventBus) {
      throw new Error(
        '[TimerUI] Missing required dependencies (timerLogic, eventBus).'
      );
    }
    this.timerLogic = dependencies.timerLogic;
    this.eventBus = dependencies.eventBus;

    this.domElement = null;
    this.progressBar = null;
    this.checksCounter = null;
    this.controlButton = null;
    this.quickCheckButton = null;
    this.unsubscribeHandles = [];

    log('info', '[TimerUI] Instance created.');
    log('info', 
      '[TimerUI Constructor] this.domElement initially:',
      this.domElement
    );
  }

  initialize() {
    log('info', '[TimerUI] Initializing...');
    log('info', 
      '[TimerUI Initialize] Before createDOMElement, this.domElement:',
      this.domElement
    );
    if (!this.domElement) {
      this.createDOMElement(); // Create DOM if not already present
    }
    log('info', 
      '[TimerUI Initialize] After createDOMElement, this.domElement:',
      this.domElement
    );
    this._attachButtonListeners();
    this._subscribeToEvents();
    this.updateChecksCounter(); // Initial update based on current state
    this.enableControls(false); // Initially disabled until state/connection ready
    // TimerLogic might re-enable if conditions met (e.g., rules loaded)
  }

  attachToHost(placeholderElement) {
    if (
      !placeholderElement ||
      typeof placeholderElement.appendChild !== 'function'
    ) {
      log('error', 
        '[TimerUI] attachToHost: Invalid placeholderElement provided.',
        placeholderElement
      );
      return;
    }
    if (!this.domElement) {
      log('warn', 
        '[TimerUI] attachToHost: domElement not created yet. Creating now.'
      );
      this.createDOMElement();
    }

    // If already parented and the new placeholder is different, detach first.
    if (
      this.domElement.parentNode &&
      this.domElement.parentNode !== placeholderElement
    ) {
      log('info', 
        '[TimerUI] attachToHost: DOM element already parented to a different host. Detaching first.'
      );
      this.detachFromHost();
    }

    // Avoid re-appending if already in the correct placeholder
    if (this.domElement.parentNode === placeholderElement) {
      log('info', 
        '[TimerUI] attachToHost: DOM element already in the target placeholder. No action needed.'
      );
      return;
    }

    // Clear the placeholder before appending to prevent duplicates if the placeholder might have old content.
    // Be cautious with this if the placeholder is shared and might have other legitimate children.
    // For a dedicated placeholder, this is safer.
    while (placeholderElement.firstChild) {
      placeholderElement.removeChild(placeholderElement.firstChild);
    }

    placeholderElement.appendChild(this.domElement);
    log('info', 
      '[TimerUI] attachToHost: DOM element appended to new host.',
      placeholderElement
    );
  }

  detachFromHost() {
    if (this.domElement && this.domElement.parentNode) {
      log('info', 
        '[TimerUI] detachFromHost: Removing DOM element from parent:',
        this.domElement.parentNode
      );
      this.domElement.parentNode.removeChild(this.domElement);
    } else {
      log('info', 
        '[TimerUI] detachFromHost: DOM element not parented or does not exist. No action needed.'
      );
    }
  }

  getDOMElement() {
    log('info', '[TimerUI getDOMElement] Method called.');
    log('info', 
      '[TimerUI getDOMElement] Before check, this.domElement:',
      this.domElement
    );
    if (!this.domElement) {
      log('info', 
        '[TimerUI getDOMElement] this.domElement is null, calling createDOMElement.'
      );
      this.createDOMElement();
    }
    log('info', 
      '[TimerUI getDOMElement] Returning this.domElement:',
      this.domElement
    );
    return this.domElement;
  }

  createDOMElement() {
    log('info', '[TimerUI createDOMElement] Method called.');
    this.domElement = document.createElement('div');
    this.domElement.id = 'progress-container';
    // Styles will be from index.css as per clarification
    // this.domElement.style.marginBottom = '10px';
    // this.domElement.style.padding = '8px';
    // this.domElement.style.backgroundColor = '#333';
    // this.domElement.style.borderRadius = '4px';

    this.domElement.innerHTML = `
      <h3 id="progress-container-header" style="margin: 0 0 5px 0; font-size: 1em;">Location Check Progress</h3>
      <div style="margin-bottom: 5px;">
        <progress id="timer-progress-bar" value="0" max="30000" style="width: 100%; height: 15px;"></progress>
      </div>
      <div class="button-container" style="display: flex; align-items: center; gap: 10px;">
        <button id="timer-control-button" disabled style="padding: 4px 10px;">Begin</button>
        <button id="timer-quick-check-button" disabled style="padding: 4px 10px;">Quick Check</button>
        <span id="timer-checks-sent" style="font-size: 0.9em; margin-left: auto; white-space: nowrap;">Checked: 0/0, Reachable: 0, Unreachable: 0, Events: 0/0</span>
      </div>
    `;

    // Store references to the created elements
    this.progressBar = this.domElement.querySelector('#timer-progress-bar');
    this.checksCounter = this.domElement.querySelector('#timer-checks-sent');
    this.controlButton = this.domElement.querySelector('#timer-control-button');
    this.quickCheckButton = this.domElement.querySelector(
      '#timer-quick-check-button'
    );

    log('info', 
      '[TimerUI createDOMElement] After creation, this.domElement:',
      this.domElement
    );
    return this.domElement;
  }

  _attachButtonListeners() {
    if (this.controlButton) {
      this.controlButton.addEventListener('click', () => {
        if (this.timerLogic.isRunning()) {
          this.timerLogic.stop();
        } else {
          this.timerLogic.begin();
        }
      });
    }

    if (this.quickCheckButton) {
      this.quickCheckButton.addEventListener('click', () => {
        this.timerLogic.determineAndDispatchQuickCheck();
      });
    }
  }

  _subscribeToEvents() {
    const subscribe = (eventName, handler) => {
      const unsub = this.eventBus.subscribe(eventName, handler.bind(this), 'timer');
      this.unsubscribeHandles.push(unsub);
    };

    subscribe('timer:started', this._handleTimerStarted);
    subscribe('timer:stopped', this._handleTimerStopped);
    subscribe('timer:progressUpdate', this._handleTimerProgressUpdate);
    subscribe('stateManager:snapshotUpdated', this._handleSnapshotUpdated); // For checksCounter

    // Enable controls when rules are loaded or connection is established
    const enableControlsHandler = () => this.enableControls(true);
    subscribe('stateManager:rulesLoaded', (eventData) => {
      enableControlsHandler();
      this.updateChecksCounter(eventData.snapshot);
    });
    subscribe('connection:open', enableControlsHandler);
    subscribe('connection:close', () => this.enableControls(false));

    log('info', '[TimerUI] Subscribed to timer and state events.');
  }

  _handleTimerStarted(data) {
    // data = { startTime, endTime }
    if (this.progressBar && data && data.endTime && data.startTime) {
      this.progressBar.setAttribute(
        'max',
        (data.endTime - data.startTime).toString()
      );
      this.progressBar.setAttribute('value', '0');
    }
    this.setControlButtonState(true); // Timer is running, button shows "Stop"
    this.enableControls(true); // Ensure controls are enabled when timer starts
  }

  _handleTimerStopped() {
    if (this.progressBar) {
      this.progressBar.setAttribute('value', '0');
      // Max can remain, or be reset to a default
    }
    this.setControlButtonState(false); // Timer is stopped, button shows "Begin"
    // Don't disable controls here, allow user to restart.
    // enableControls(false) might be called by connection:close
  }

  _handleTimerProgressUpdate(data) {
    // data = { value, max }
    if (
      this.progressBar &&
      data &&
      data.value !== undefined &&
      data.max !== undefined
    ) {
      if (Number(data.max) > 0) {
        // Avoid setting max to 0 or negative
        this.progressBar.setAttribute('max', data.max.toString());
      } else if (Number(data.max) === 0 && Number(data.value) === 0) {
        // If max is 0 and value is 0 (e.g. timer stopped, progress reset), set max to a nominal value
        this.progressBar.setAttribute('max', '1');
      }
      this.progressBar.setAttribute('value', data.value.toString());
    }
  }

  _handleSnapshotUpdated(eventData) {
    // eventData = { snapshot }
    if (eventData && eventData.snapshot) {
      this.updateChecksCounter(eventData.snapshot);
    } else {
      // If no snapshot, perhaps clear or show loading for counter
      // Pass the current snapshot from proxy if eventData.snapshot is missing, or null if proxy also has no snapshot
      this.updateChecksCounter(
        stateManagerProxySingleton.getLatestStateSnapshot()
      );
    }
  }

  updateProgressBar(value, max) {
    if (this.progressBar) {
      if (max !== undefined && Number(max) > 0) this.progressBar.max = max;
      else if (max !== undefined && Number(max) === 0 && Number(value) === 0)
        this.progressBar.max = 1;
      if (value !== undefined) this.progressBar.value = value;
    }
  }

  updateChecksCounter(snapshot = null) {
    if (!this.checksCounter) return;

    // If snapshot wasn't passed, try to get the latest one.
    const currentSnapshot =
      snapshot || stateManagerProxySingleton.getLatestStateSnapshot();
    const staticData = stateManagerProxySingleton.getStaticData();

    if (
      !currentSnapshot ||
      !staticData ||
      !staticData.locations
    ) {
      this.checksCounter.textContent = 'Checked: ?/?, Reachable: ?, Unreachable: ?, Events: ?/?';
      this.checksCounter.title = 'Location or snapshot data not yet available.';
      return;
    }

    const allLocationDefinitions = staticData.locations; // This is an object keyed by name
    const checkedLocations = new Set(currentSnapshot.checkedLocations || []);

    // Initialize counters
    let checkedCount = 0;
    let reachableCount = 0;
    let unreachableCount = 0;
    let totalCount = 0;

    // Event locations (locations with no ID)
    let checkedEventCount = 0;
    let totalEventCount = 0;

    // Process each location
    for (const locName in allLocationDefinitions) {
      if (Object.prototype.hasOwnProperty.call(allLocationDefinitions, locName)) {
        const loc = allLocationDefinitions[locName];
        
        // Determine if this is an event location (no ID)
        const isEventLocation = loc.id === null || loc.id === undefined;

        // Process event locations separately
        if (isEventLocation) {
          totalEventCount++;
          if (checkedLocations.has(locName)) {
            checkedEventCount++;
          }
        } else {
          // Regular locations
          totalCount++;

          // Track checked locations
          if (checkedLocations.has(locName)) {
            checkedCount++;
          } else {
            // For unchecked locations, determine if they are reachable
            const reachability = currentSnapshot.locationReachability && currentSnapshot.locationReachability[locName];
            if (reachability === 'reachable') {
              reachableCount++;
            } else {
              unreachableCount++;
            }
          }
        }
      }
    }

    // Format the display text like the old version
    const displayText = `Checked: ${checkedCount}/${totalCount}, Reachable: ${reachableCount}, Unreachable: ${unreachableCount}, Events: ${checkedEventCount}/${totalEventCount}`;
    
    this.checksCounter.textContent = displayText;
    this.checksCounter.title = `Checked ${checkedCount} of ${totalCount} locations (${reachableCount} reachable, ${unreachableCount} unreachable)\nEvents: ${checkedEventCount} of ${totalEventCount} event locations collected`;
  }

  setControlButtonState(isStarted) {
    if (this.controlButton) {
      this.controlButton.textContent = isStarted ? 'Stop' : 'Begin';
    }
  }

  enableControls(enable) {
    if (this.controlButton) this.controlButton.disabled = !enable;
    if (this.quickCheckButton) this.quickCheckButton.disabled = !enable;
  }

  dispose() {
    log('info', '[TimerUI] Disposing TimerUI...');
    this.detachFromHost(); // Ensure DOM element is removed from any host
    this.unsubscribeHandles.forEach((unsub) => {
      if (typeof unsub === 'function') {
        unsub();
      }
    });
    this.unsubscribeHandles = [];
    // DOM element will be removed by its parent (ClientUI or PanelManager)
    this.domElement = null;
  }
}
