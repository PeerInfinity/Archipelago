// loopUI.js - UI for the Loop mode
import stateManager from '../core/stateManagerSingleton.js';
import loopState from '../core/loop/loopStateSingleton.js';
import eventBus from '../core/eventBus.js';
import commonUI from './commonUI.js';
import {
  levelFromXP,
  xpForNextLevel,
  proposedLinearFinalCost,
  proposedLinearReduction,
} from '../core/loop/xpFormulas.js';
import settingsManager from '../core/settingsManager.js'; // Import Settings Manager

export class LoopUI {
  constructor(gameUI) {
    this.gameUI = gameUI;

    // UI state
    this.expandedRegions = new Set();
    this.regionsInQueue = new Set(); // Track which regions have actions in the queue
    this.isLoopModeActive = false;
    this.repeatExploreStates = new Map(); // Map to track repeat explore checkbox states per region
    this.settingsUnsubscribe = null; // Add property

    // Animation state
    this._animationFrameId = null;
    this._lastUpdateTime = 0;

    // --- Create root element ---
    this.rootElement = this.createRootElement(); // Create root element
    this.loopRegionsArea = this.rootElement.querySelector('#loop-regions-area'); // Cache reference
    this.loopControlsContainer = this.rootElement.querySelector(
      '.loop-controls-area'
    ); // Cache controls container
    this.loopTopControlsContainer =
      this.rootElement.querySelector('.loop-controls'); // Cache TOP controls container

    // --- Moved Listener Attachment ---
    // Event listener attachment is now deferred to attachInternalListeners()
    // _attachControlEventListeners() is renamed and moved

    // Make this instance globally accessible for direct event handlers (Consider removing this if possible later)
    window.loopUIInstance = this;

    // Attach event listeners for loop state changes
    this.subscribeToEvents();
    this.subscribeToSettings(); // Subscribe to settings

    // Set up animation frame for continuous UI updates
    this._startAnimationLoop();
  }

  // <<< Add Subscription Logic >>>
  subscribeToSettings() {
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
    }
    this.settingsUnsubscribe = eventBus.subscribe(
      'settings:changed',
      ({ key, value }) => {
        if (key === '*' || key.startsWith('colorblindMode.loops')) {
          console.log('LoopUI reacting to settings change:', key);
          this.renderLoopPanel(); // Re-render panel when setting changes
        }
      }
    );
  }

  createRootElement() {
    const element = document.createElement('div');
    element.classList.add('loop-panel-container', 'panel-container');
    element.style.display = 'flex';
    element.style.flexDirection = 'column';
    element.style.height = '100%';

    // Recreate the structure, including controls that were previously in index.html
    // IMPORTANT: Ensure unique IDs if these controls exist elsewhere
    element.innerHTML = `
        <div class="control-group loop-controls" style="padding: 0.5rem; border-bottom: 1px solid #666; flex-shrink: 0;">
            <button id="loop-ui-toggle-loop-mode" class="button"> <!-- Changed ID -->
              Enter Loop Mode
            </button>
            <button id="loop-ui-toggle-pause" class="button" disabled>Pause</button> <!-- Changed ID -->
            <button id="loop-ui-toggle-restart" class="button" disabled>Restart</button> <!-- Changed ID -->
            <button id="loop-ui-toggle-auto-restart" class="button"> <!-- Changed ID -->
              Pause when queue complete
            </button>
            <button id="loop-ui-expand-collapse-all" class="button"> <!-- Changed ID -->
              Expand All
            </button>
            <div class="speed-controls">
              <label for="loop-ui-game-speed">Speed:</label> <!-- Changed ID -->
              <input
                type="range"
                id="loop-ui-game-speed"
                min="0.5"
                max="100"
                step="0.5"
                value="1"
              />
              <span id="loop-ui-speed-value">1.0x</span> <!-- Changed ID -->
            </div>
        </div>
        <div id="loop-fixed-area" class="loop-fixed-area" style="flex-shrink: 0;">
            <!-- Mana bar and current action display will go here -->
        </div>
        <div id="loop-regions-area" class="loop-regions-area" style="flex-grow: 1; overflow-y: auto; min-height: 0;"> <!-- Added min-height: 0 -->
            <!-- Scrollable region/action list -->
        </div>
        <div class="loop-controls-area control-group" style="padding: 0.5rem; border-top: 1px solid #666; flex-shrink: 0;">
            <button id="loop-ui-clear-queue" class="button">Clear Queue</button> <!-- Changed ID -->
            <button id="loop-ui-save-state" class="button">Save Game</button> <!-- Changed ID -->
            <button id="loop-ui-export-state" class="button">Export</button> <!-- Changed ID -->
            <label for="loop-ui-state-import" class="button">Import</label> <!-- Changed ID -->
            <input type="file" id="loop-ui-state-import" class="hidden" accept=".json" /> <!-- Changed ID -->
            <button id="loop-ui-hard-reset" class="button">Hard Reset</button> <!-- Changed ID -->
        </div>
    `;
    return element;
  }

  // --- NEW Method to attach listeners AFTER element is in DOM ---
  /**
   * Attaches event listeners to the internal controls of the LoopUI panel.
   * Should be called by PanelManager after the root element is appended.
   */
  attachInternalListeners() {
    console.log('LoopUI: Attaching internal listeners...');
    if (!this.rootElement) {
      console.error('LoopUI: Cannot attach listeners, rootElement is missing.');
      return;
    }

    // --- Use this.rootElement.querySelector ---
    const querySelector = (selector) =>
      this.rootElement.querySelector(selector);

    const attachButtonHandler = (buttonId, handler) => {
      const button = querySelector(`#${buttonId}`);
      if (button) {
        // Clear existing listeners before adding new ones
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);
        newButton.addEventListener('click', handler.bind(this)); // Bind 'this' correctly
        return newButton;
      } else {
        console.warn(
          `LoopUI: Button with ID #${buttonId} not found in rootElement.`
        );
      }
      return null;
    };

    // --- Attach Listeners using NEW IDs ---
    attachButtonHandler('loop-ui-toggle-loop-mode', this.toggleLoopMode); // Use method reference

    attachButtonHandler('loop-ui-toggle-pause', function () {
      const newPauseState = !loopState.isPaused;
      loopState.setPaused(newPauseState);
      this._updatePauseButtonState(newPauseState); // Update button state locally
    });

    attachButtonHandler('loop-ui-toggle-restart', this._handleRestartClick);

    attachButtonHandler('loop-ui-toggle-auto-restart', function () {
      const newState = !loopState.autoRestartQueue;
      loopState.setAutoRestartQueue(newState);
      const button = querySelector('#loop-ui-toggle-auto-restart');
      if (button) {
        button.textContent = newState
          ? 'Restart when queue complete'
          : 'Pause when queue complete';
      }
    });

    attachButtonHandler('loop-ui-expand-collapse-all', function () {
      const button = querySelector('#loop-ui-expand-collapse-all');
      if (!button) return;
      if (button.textContent === 'Expand All') {
        this.expandAllRegions();
      } else {
        this.collapseAllRegions();
      }
    });

    attachButtonHandler('loop-ui-clear-queue', this._handleClearQueueClick);

    attachButtonHandler('loop-ui-save-state', this._handleSaveStateClick);

    attachButtonHandler('loop-ui-export-state', this._exportState);

    attachButtonHandler('loop-ui-hard-reset', this._handleHardResetClick);

    // Import button and file input
    // Use querySelector to find the label acting as a button
    const importLabelButton = querySelector(
      'label[for="loop-ui-state-import"]'
    );
    const fileInput = querySelector('#loop-ui-state-import');
    if (importLabelButton && fileInput) {
      // Clone the label and input to remove old listeners
      const newImportLabel = importLabelButton.cloneNode(true);
      const newFileInput = fileInput.cloneNode(true);

      // Replace the old elements with the new ones
      importLabelButton.parentNode.replaceChild(
        newImportLabel,
        importLabelButton
      );
      fileInput.parentNode.replaceChild(newFileInput, fileInput);

      // Add click listener to the new label
      newImportLabel.addEventListener('click', () => newFileInput.click());

      // Add change listener to the new file input
      newFileInput.addEventListener('change', (event) => {
        if (event.target.files && event.target.files.length > 0) {
          this._importState(event.target.files[0]);
        }
        // Reset the input value to allow importing the same file again
        newFileInput.value = '';
      });
    } else {
      console.warn('LoopUI: Import label/button or file input not found.');
    }

    // Game speed slider
    const speedSlider = querySelector('#loop-ui-game-speed');
    const speedValueSpan = querySelector('#loop-ui-speed-value'); // Use span ID
    if (speedSlider && speedValueSpan) {
      const newSpeedSlider = speedSlider.cloneNode(true);
      speedSlider.parentNode.replaceChild(newSpeedSlider, speedSlider);
      newSpeedSlider.max = 100;
      newSpeedSlider.value = loopState.gameSpeed;
      speedValueSpan.textContent = `${loopState.gameSpeed.toFixed(1)}x`;
      newSpeedSlider.addEventListener('input', () => {
        const speed = parseFloat(newSpeedSlider.value);
        loopState.setGameSpeed(speed);
        speedValueSpan.textContent = `${speed.toFixed(1)}x`;
      });
    } else {
      console.warn('LoopUI: Speed slider or value span not found.');
    }

    console.log('LoopUI: Internal listeners attached.');
  }

  // --- Helper handlers for button clicks ---
  _handleRestartClick() {
    try {
      loopState._resetLoop();
      document.querySelectorAll('.action-progress-bar').forEach((bar) => {
        bar.style.width = '0%';
      });
      document.querySelectorAll('.action-status').forEach((status) => {
        status.textContent = 'Pending';
        status.className = 'action-status pending';
      });
      loopState.restartQueueFromBeginning();
      document.querySelectorAll('.action-progress-value').forEach((value) => {
        const actionItem = value.closest('.action-item');
        if (actionItem) {
          const actionId = actionItem.id.replace('action-', '');
          const action = loopState.actionQueue.find((a) => a.id === actionId);
          if (action) {
            const actionCost = this._estimateActionCost(action);
            const actionIndex = loopState.actionQueue.findIndex(
              (a) => a.id === actionId
            );
            const displayIndex = actionIndex !== -1 ? actionIndex + 1 : '?';
            value.textContent = `0/${actionCost}, Action ${displayIndex} of ${loopState.actionQueue.length}`;
          }
        }
      });
      if (loopState.isPaused) {
        loopState.setPaused(false);
        const pauseBtn = this.rootElement.querySelector(
          '#loop-ui-toggle-pause'
        );
        if (pauseBtn) pauseBtn.textContent = 'Pause';
      }
    } catch (error) {
      console.error('Error during restart:', error);
    }
  }

  _handleClearQueueClick() {
    loopState.actionQueue = [];
    loopState.currentAction = null;
    loopState.currentActionIndex = 0;
    loopState.isProcessing = false;
    loopState.currentMana = loopState.maxMana;
    this.regionsInQueue.clear();
    // Use rootElement to find the container
    const actionContainer = this.rootElement.querySelector(
      '#current-action-container'
    );
    if (actionContainer)
      actionContainer.innerHTML = `<div class="no-action-message">No action in progress</div>`;
    this._updateManaDisplay(loopState.currentMana, loopState.maxMana);
    eventBus.publish('loopState:queueUpdated', {
      queue: loopState.actionQueue,
    });
    this.renderLoopPanel();
  }

  _handleSaveStateClick() {
    loopState.saveToStorage();
    if (window.consoleManager)
      window.consoleManager.print('Game saved!', 'success');
    else alert('Game saved!');
  }

  _handleHardResetClick() {
    if (
      confirm(
        'Are you sure you want to hard reset? This will clear all progress, discovery, and XP data.'
      )
    ) {
      loopState.discoveredRegions = new Set(['Menu']);
      loopState.discoveredLocations = new Set();
      loopState.discoveredExits = new Map([['Menu', new Set()]]);
      loopState.regionXP = new Map();
      loopState.actionQueue = [];
      loopState.currentAction = null;
      loopState.currentActionIndex = 0;
      loopState.currentMana = loopState.maxMana;
      loopState.isProcessing = false;
      loopState._initializeDiscoverableData();
      loopState.saveToStorage();
      // Clear UI specific states
      this.expandedRegions.clear();
      this.expandedRegions.add('Menu'); // Keep menu expanded
      this.regionsInQueue.clear();
      this.repeatExploreStates.clear();
      // Render the panel
      this.renderLoopPanel();
      if (window.consoleManager)
        window.consoleManager.print('Game has been hard reset!', 'warning');
    }
  }

  getRootElement() {
    return this.rootElement;
  }

  /**
   * Start a continuous animation loop for UI updates
   */
  _startAnimationLoop() {
    const updateUI = (timestamp) => {
      // Limit to around 10 updates per second to avoid performance issues
      if (timestamp - this._lastUpdateTime > 100) {
        this._lastUpdateTime = timestamp;

        // Update UI for current action if one exists and loop mode is active
        if (
          this.isLoopModeActive &&
          loopState.isProcessing &&
          loopState.currentAction
        ) {
          this._updateActionProgress(loopState.currentAction);
          this._updateManaDisplay(loopState.currentMana, loopState.maxMana);
          this._updateCurrentActionDisplay(loopState.currentAction);
        }
      }

      // Continue the animation loop
      this._animationFrameId = requestAnimationFrame(updateUI);
    };

    // Start the animation loop
    this._animationFrameId = requestAnimationFrame(updateUI);
  }

  /**
   * Initialize the loop UI
   */
  initialize() {
    // Clear UI and prep container
    this.clear(); // Calls renderLoopPanel internally

    // Initialize loop state (might have been loaded from storage)
    loopState.initialize();

    // Set initial expanded state for starting region
    this.expandedRegions.add('Menu');

    // Store this instance in the window for access from event handlers
    window.loopUIInstance = this;

    // Render initial state based on whether loop mode is already active
    this.renderLoopPanel(); // Render based on current isLoopModeActive state

    // Update controls based on initial loopState
    this._updatePauseButtonState(loopState.isPaused);
    const autoRestartBtn = this.rootElement.querySelector(
      '#loop-ui-toggle-auto-restart'
    );
    if (autoRestartBtn) {
      autoRestartBtn.textContent = loopState.autoRestartQueue
        ? 'Restart when queue complete'
        : 'Pause when queue complete';
    }
    const speedSlider = this.rootElement.querySelector('#loop-ui-game-speed');
    const speedValueSpan = this.rootElement.querySelector(
      '#loop-ui-speed-value'
    );
    if (speedSlider && speedValueSpan) {
      speedSlider.value = loopState.gameSpeed;
      speedValueSpan.textContent = `${loopState.gameSpeed.toFixed(1)}x`;
    }
    const colorblindCheckbox = this.rootElement.querySelector(
      '#loop-ui-colorblind'
    );
    if (colorblindCheckbox) colorblindCheckbox.checked = this.colorblindMode; // Assuming colorblindMode is persisted/set elsewhere if needed

    return true;
  }

  /**
   * Build the initial DOM structure for the loop UI panel.
   * Should be called once by PanelManager after the root element is attached.
   */
  buildInitialStructure() {
    console.log('LoopUI: Building initial structure (ensuring areas exist)');
    // This method might become simpler if createRootElement and attachInternalListeners
    // handle most of the setup. Ensure essential containers exist.

    const container = this.rootElement; // Use the root element property
    if (!container) {
      console.error('Loop panel container (rootElement) not found or not set');
      return;
    }

    // Ensure essential areas exist (created in createRootElement)
    if (!container.querySelector('#loop-fixed-area')) {
      console.error('LoopUI: #loop-fixed-area missing in rootElement');
    }
    if (!container.querySelector('#loop-regions-area')) {
      console.error('LoopUI: #loop-regions-area missing in rootElement');
    }
    if (!container.querySelector('.loop-controls-area')) {
      console.error('LoopUI: .loop-controls-area missing in rootElement');
    }
    if (!container.querySelector('.loop-controls')) {
      console.error('LoopUI: .loop-controls (top) missing in rootElement');
    }

    // Cache references to key elements if not already done in constructor
    this.actionQueueContainer = container.querySelector(
      '#current-action-container'
    ); // May not exist yet in fixed-area
    this.loopRegionsArea = container.querySelector('#loop-regions-area');
    this.manaBarElement = container.querySelector('#mana-bar'); // May not exist yet in fixed-area
    this.manaValueElement = container.querySelector('#mana-value'); // May not exist yet in fixed-area

    // Initialize fixed area content (Mana bar, current action)
    this._initializeFixedArea();

    // Initial render based on mode
    this.renderLoopPanel();
  }

  // Helper to initialize the fixed area content
  _initializeFixedArea() {
    const fixedArea = this.rootElement.querySelector('#loop-fixed-area');
    if (!fixedArea) {
      console.error('LoopUI: #loop-fixed-area not found for initialization.');
      return;
    }
    // Only add content if it's not already there
    if (!fixedArea.querySelector('.mana-container')) {
      fixedArea.innerHTML = `
      <div class="loop-resources">
        <div class="mana-container">
          <div class="resource-label">Mana:</div>
          <div class="mana-bar-container">
            <div id="mana-bar" class="mana-bar"></div>
                    <span id="mana-value">Loading...</span>
          </div>
        </div>
        <div class="current-action-container" id="current-action-container">
          <div class="no-action-message">No action in progress</div>
        </div>
      </div>
    `;
      // Re-cache elements created here
      this.actionQueueContainer = fixedArea.querySelector(
        '#current-action-container'
      );
      this.manaBarElement = fixedArea.querySelector('#mana-bar');
      this.manaValueElement = fixedArea.querySelector('#mana-value');

      // Update display with current state
      this._updateManaDisplay(loopState.currentMana, loopState.maxMana);
      this._updateCurrentActionDisplay(loopState.currentAction);
    }
  }

  /**
   * Set up event listeners for loop state changes
   */
  subscribeToEvents() {
    // Prevent adding duplicate listeners if called multiple times (though it shouldn't be with new structure)
    if (this.eventSubscriptions && this.eventSubscriptions.length > 0) {
      console.warn(
        'LoopUI: subscribeToEvents called multiple times. Skipping.'
      );
      return;
    }
    this.eventSubscriptions = []; // Initialize array to hold unsubscribe handles

    const subscribe = (eventName, handler) => {
      const unsubscribe = eventBus.subscribe(eventName, handler.bind(this)); // Bind 'this'
      this.eventSubscriptions.push(unsubscribe);
    };

    console.log('LoopUI: Subscribing to EventBus events');

    // Mana changes
    subscribe('loopState:manaChanged', (data) => {
      if (this.isLoopModeActive)
        this._updateManaDisplay(data.current, data.max);
    });

    // XP changes
    subscribe('loopState:xpChanged', (data) => {
      if (this.isLoopModeActive) this._updateRegionXPDisplay(data.regionName);
    });

    // Pause state changes
    subscribe('loopState:paused', (data) => {
      if (this.isLoopModeActive) this._updatePauseButtonState(true);
    });

    subscribe('loopState:resumed', (data) => {
      if (this.isLoopModeActive) this._updatePauseButtonState(false);
    });

    subscribe('loopState:pauseStateChanged', (data) => {
      if (this.isLoopModeActive) this._updatePauseButtonState(data.isPaused);
    });

    // Queue updates
    subscribe('loopState:queueUpdated', (data) => {
      if (!this.isLoopModeActive) return; // Don't update if not active
      this._updateRegionsInQueue(data.queue);
      this.renderLoopPanel(); // Re-render the panel
    });

    // Auto-restart changes
    subscribe('loopState:autoRestartChanged', (data) => {
      if (!this.isLoopModeActive) return; // Don't update if not active
      const autoRestartBtn = this.rootElement?.querySelector(
        // Use optional chaining
        '#loop-ui-toggle-auto-restart'
      ); // Find within cached controls
      if (autoRestartBtn) {
        autoRestartBtn.textContent = data.autoRestart
          ? 'Restart when queue complete'
          : 'Pause when queue complete';
      }
    });

    // Progress updates
    subscribe('loopState:progressUpdated', (data) => {
      if (!this.isLoopModeActive || !loopState.isProcessing) return; // Don't update if not active or paused

      if (data.action) {
        this._updateActionProgress(data.action);
        this._updateCurrentActionDisplay(data.action);

        // Force a reflow to ensure animations are visible
        window.requestAnimationFrame(() => {
          // Use rootElement querySelector
          const actionEl = this.rootElement.querySelector(
            `#action-${data.action.id}`
          );
          if (actionEl) {
            // Force a style recalculation
            void actionEl.offsetWidth;
          }
        });
      }

      // Always update mana display, even if there's no current action
      if (data.mana) {
        // Add check for mana object
        this._updateManaDisplay(data.mana.current, data.mana.max);
      }
    });

    // Action completion
    subscribe('loopState:actionCompleted', () => {
      if (this.isLoopModeActive) this.renderLoopPanel(); // Re-render on completion
    });

    // New action started
    subscribe('loopState:newActionStarted', (data) => {
      if (this.isLoopModeActive && data.action) {
        this._updateCurrentActionDisplay(data.action);
      }
    });

    // Queue completed
    subscribe('loopState:queueCompleted', () => {
      if (!this.isLoopModeActive) return;
      // Use cached reference or query rootElement
      const actionContainer =
        this.actionQueueContainer ||
        this.rootElement.querySelector('#current-action-container');
      if (actionContainer) {
        actionContainer.innerHTML = `<div class="no-action-message">No action in progress</div>`;
      }
    });

    // New discoveries
    subscribe('loopState:locationDiscovered', (data) => {
      if (this.isLoopModeActive) this._updateDiscoveredItems(data.regionName);
    });

    subscribe('loopState:exitDiscovered', (data) => {
      if (this.isLoopModeActive) this._updateDiscoveredItems(data.regionName);
    });

    subscribe('loopState:regionDiscovered', (data) => {
      if (this.isLoopModeActive) this.renderLoopPanel(); // Re-render when a new region is available
    });

    // Loop reset
    subscribe('loopState:loopReset', (data) => {
      if (this.isLoopModeActive) this._handleLoopReset(data);
      if (data.mana) {
        // Add check for mana object
        if (this.isLoopModeActive)
          this._updateManaDisplay(data.mana.current, data.mana.max);
      }
    });

    // State loaded (e.g., from import or save)
    subscribe('loopState:stateLoaded', () => {
      // When state is loaded, ONLY update the UI to reflect the loaded state.
      // DO NOT call this.initialize() here as it causes loops.
      console.log(
        'LoopUI: Received loopState:stateLoaded event. Updating UI based on loaded state.'
      );

      // Re-render the main panel content based on the new loopState
      this.renderLoopPanel();

      // Update specific controls based on the now-loaded loopState
      this._updatePauseButtonState(loopState.isPaused);
      const autoRestartBtn = this.rootElement.querySelector(
        '#loop-ui-toggle-auto-restart'
      );
      if (autoRestartBtn) {
        autoRestartBtn.textContent = loopState.autoRestartQueue
          ? 'Restart when queue complete'
          : 'Pause when queue complete';
      }
      const speedSlider = this.rootElement.querySelector('#loop-ui-game-speed');
      const speedValueSpan = this.rootElement.querySelector(
        '#loop-ui-speed-value'
      );
      if (speedSlider && speedValueSpan) {
        speedSlider.value = loopState.gameSpeed;
        speedValueSpan.textContent = `${loopState.gameSpeed.toFixed(1)}x`;
      }

      // TODO: Confirm if loopState actually saves/loads the isLoopModeActive state.
      // If yes, update this.isLoopModeActive and the button text directly here.
      // Avoid calling toggleLoopMode() to prevent loops.
      // Example:
      // const loadedLoopMode = loopState.getLoopModeActiveState ? loopState.getLoopModeActiveState() : this.isLoopModeActive;
      // this.isLoopModeActive = loadedLoopMode;
      // const toggleBtn = this.rootElement?.querySelector('#loop-ui-toggle-loop-mode');
      // if (toggleBtn) {
      //    toggleBtn.textContent = this.isLoopModeActive ? 'Exit Loop Mode' : 'Enter Loop Mode';
      // }
      // // If loop mode changed, we might need to re-render again or publish the event
      // this.renderLoopPanel(); // Potentially re-render if mode changed
      // eventBus.publish('loopUI:modeChanged', { active: this.isLoopModeActive });
    });

    // Listen for explore action repeat events
    subscribe('loopState:exploreActionRepeated', (data) => {
      if (this.isLoopModeActive) {
        this.regionsInQueue.add(data.regionName);
        this.renderLoopPanel(); // Update the UI
      }
    });
  }

  /**
   * Unsubscribe from all eventBus events.
   */
  unsubscribeFromEvents() {
    if (this.eventSubscriptions && this.eventSubscriptions.length > 0) {
      console.log(
        `LoopUI: Unsubscribing from ${this.eventSubscriptions.length} event(s).`
      );
      this.eventSubscriptions.forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch (e) {
          console.warn('LoopUI: Error during event unsubscription:', e);
        }
      });
      this.eventSubscriptions = []; // Clear the array
    } else {
      console.log('LoopUI: No active event subscriptions to unsubscribe from.');
    }
  }

  /**
   * Cleanup method called when the panel is destroyed.
   */
  onPanelDestroy() {
    console.log('LoopUI onPanelDestroy called');
    this._stopAnimationLoop();
    this.unsubscribeFromEvents();
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe(); // Unsubscribe
      this.settingsUnsubscribe = null;
    }
    window.loopUIInstance = null; // Clear global reference
  }

  /**
   * Update the set of regions that have actions in the queue
   * @param {Array} queue - The current action queue
   */
  _updateRegionsInQueue(queue) {
    // Clear current set
    this.regionsInQueue.clear();

    // Add all unique regions that have actions in the queue
    for (const action of queue) {
      if (action.type === 'moveToRegion') {
        // For move actions, add the destination region
        this.regionsInQueue.add(action.destinationRegion);
      }
      // Always add the region where the action is performed
      if (action.regionName) {
        this.regionsInQueue.add(action.regionName);
      }
    }

    //console.log('Updated regions in queue:', [...this.regionsInQueue]);
  }

  /**
   * Handle a loop reset
   * @param {Object} data - Reset event data
   */
  _handleLoopReset(data = {}) {
    // Flash the mana bar to indicate reset
    const manaBar = document.getElementById('mana-bar');
    if (manaBar) {
      manaBar.classList.add('reset-flash');
      setTimeout(() => {
        manaBar.classList.remove('reset-flash');
      }, 1000);
    }

    // Show appropriate message based on whether we're paused or restarting
    const isPaused = data.paused === true;
    const message = isPaused
      ? 'Out of mana! Processing paused.'
      : 'Loop reset: out of mana!';

    // Add a message to the console
    if (window.consoleManager) {
      //window.consoleManager.print(message, 'warning');
    }

    // Update pause button if we're paused
    if (isPaused) {
      const pauseBtn = document.getElementById('toggle-pause');
      if (pauseBtn) {
        pauseBtn.textContent = 'Resume';
      }
      return; // Don't reset progress bars if we're paused
    }

    // If it's a full reset (not a pause), reset all progress displays
    // Reset progress on all action displays
    document.querySelectorAll('.action-progress-bar').forEach((bar) => {
      bar.style.width = '0%';
    });

    // Update all action status indicators
    document.querySelectorAll('.action-status').forEach((status) => {
      // Get the action element containing this status
      const actionItem = status.closest('.action-item');
      if (actionItem) {
        const actionId = actionItem.id.replace('action-', '');
        const action = loopState.actionQueue.find((a) => a.id === actionId);

        // Set the first action as Active, all others as Pending
        if (action && action === loopState.currentAction) {
          status.textContent = 'Active';
          status.className = 'action-status active';
        } else {
          status.textContent = 'Pending';
          status.className = 'action-status pending';
        }
      } else {
        // Fallback if we can't find the parent action
        status.textContent = 'Pending';
        status.className = 'action-status pending';
      }
    });
  }

  /**
   * Update the mana display
   * @param {number} current - Current mana
   * @param {number} max - Maximum mana
   */
  _updateManaDisplay(current, max) {
    if (!this.rootElement || !this.isLoopModeActive) return; // Don't update if not visible/active

    // Find elements within rootElement
    const manaBar =
      this.manaBarElement || this.rootElement.querySelector('#mana-bar');
    const manaValue =
      this.manaValueElement || this.rootElement.querySelector('#mana-value');

    const updateBar = (bar, valueElement, textFormat) => {
      if (!bar || !valueElement) return;

      const currentVal = Math.max(0, current);
      const maxVal = Math.max(1, max); // Avoid division by zero
      const percentage = Math.min(100, (currentVal / maxVal) * 100);

      // Remove the transition temporarily
      bar.style.transition = 'none';
      // Force a reflow
      void bar.offsetWidth;
      // Restore the transition
      bar.style.transition = 'width 0.1s linear';
      // Update the width for animation
      bar.style.width = `${percentage}%`;

      // Add color classes based on percentage
      bar.className = 'mana-bar'; // Reset classes
      if (percentage < 25) {
        bar.classList.add('low');
      } else if (percentage < 50) {
        bar.classList.add('medium');
      } else {
        bar.classList.add('high');
      }

      // Update the text
      valueElement.textContent = textFormat(currentVal, maxVal);
    };

    // Update the main mana bar within the panel
    updateBar(
      manaBar,
      manaValue,
      (cur, mx) => `${Math.floor(cur)} of ${mx} Mana Remaining`
    );
  }

  /**
   * Update the pause button text to reflect the current state
   * @param {boolean} isPaused - Whether the system is currently paused
   */
  _updatePauseButtonState(isPaused) {
    // Update the button text within this panel's scope
    const pauseBtn = this.rootElement?.querySelector('#loop-ui-toggle-pause'); // Use optional chaining
    if (pauseBtn) {
      pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
      // Also disable/enable based on loop mode activity
      pauseBtn.disabled = !this.isLoopModeActive;
    }
    // Ensure restart button state is also updated
    const restartBtn = this.rootElement?.querySelector(
      '#loop-ui-toggle-restart'
    );
    if (restartBtn) {
      restartBtn.disabled = !this.isLoop_mode_active;
    }
    // And auto-restart button
    const autoRestartBtn = this.rootElement?.querySelector(
      '#loop-ui-toggle-auto-restart'
    );
    if (autoRestartBtn) {
      autoRestartBtn.disabled = !this.isLoopModeActive;
    }
  }

  /**
   * Update an action's progress display
   * @param {Object} action - The action being processed
   */
  _updateActionProgress(action) {
    if (!action || !this.rootElement || !this.isLoopModeActive) return;

    requestAnimationFrame(() => {
      try {
        // Find by valid ID selector within rootElement
        const actionElement = this.rootElement.querySelector(
          `#action-${action.id}`
        );

        // Update individual action item within the panel
        if (!actionElement) return; // Skip if element not found in panel

        const progressBar = actionElement.querySelector('.action-progress-bar');
        const progressValue = actionElement.querySelector(
          '.action-progress-value'
        );
        const statusElement = actionElement.querySelector('.action-status');

        if (progressBar) {
          progressBar.style.transition = 'none';
          void progressBar.offsetWidth;
          progressBar.style.transition = 'width 0.1s linear';
          progressBar.style.width = `${action.progress}%`;
        }

        if (progressValue) {
          const actionCost = this._estimateActionCost(action);
          const manaCostSoFar = Math.floor(
            (action.progress / 100) * actionCost
          );
          let displayIndex;
          if (action === loopState.currentAction) {
            displayIndex = loopState.currentActionIndex + 1;
          } else {
            const actionIndex = loopState.actionQueue.findIndex(
              (a) => a.id === action.id
            );
            displayIndex = actionIndex !== -1 ? actionIndex + 1 : '?';
          }
          progressValue.textContent = `Action ${displayIndex} of ${loopState.actionQueue.length}, Progress: ${manaCostSoFar} of ${actionCost} mana`;
        }

        if (statusElement) {
          if (
            action === loopState.currentAction &&
            !statusElement.classList.contains('active')
          ) {
            statusElement.textContent = 'Active';
            statusElement.className = 'action-status active';
          } else if (
            action !== loopState.currentAction &&
            statusElement.classList.contains('active')
          ) {
            if (action.completed) {
              statusElement.textContent = 'Completed';
              statusElement.className = 'action-status completed';
            } else {
              statusElement.textContent = 'Pending';
              statusElement.className = 'action-status pending';
            }
          }
        }
      } catch (error) {
        console.error('Error updating action progress:', error);
      }
    });
  }

  /**
   * Update displayed discovered items for a region
   * @param {string} regionName - Name of the region
   */
  _updateDiscoveredItems(regionName) {
    const regionBlock = document.querySelector(
      `.loop-region-block[data-region="${regionName}"]`
    );
    if (!regionBlock) return;

    // Update location and exit counts
    this._updateDiscoveryCountDisplay(regionName);

    // If the region is expanded, update the discovery lists
    if (this.expandedRegions.has(regionName)) {
      const locationsContainer = regionBlock.querySelector(
        '.loop-region-locations-container'
      );
      const exitsContainer = regionBlock.querySelector(
        '.loop-region-exits-container'
      );

      if (locationsContainer) {
        this._updateDiscoveredLocations(regionName, locationsContainer);
      }

      if (exitsContainer) {
        this._updateDiscoveredExits(regionName, exitsContainer);
      }
    }
  }

  /**
   * Update discovery count display for a region
   * @param {string} regionName - Name of the region
   */
  _updateDiscoveryCountDisplay(regionName) {
    const regionBlock = document.querySelector(
      `.loop-region-block[data-region="${regionName}"]`
    );
    if (!regionBlock) return;

    const discoveryStats = regionBlock.querySelector('.region-discovery-stats');
    if (!discoveryStats) return;

    const regionData = stateManager.regions[regionName];
    if (!regionData) return;

    // Calculate discovery percentages
    const totalLocations = regionData.locations
      ? regionData.locations.length
      : 0;
    const totalExits = regionData.exits ? regionData.exits.length : 0;

    let discoveredLocationCount = 0;
    if (regionData.locations) {
      discoveredLocationCount = regionData.locations.filter((loc) =>
        loopState.isLocationDiscovered(loc.name)
      ).length;
    }

    let discoveredExitCount = 0;
    const regionExits = loopState.discoveredExits.get(regionName);
    if (regionExits) {
      discoveredExitCount = regionExits.size;
    }

    // Calculate exploration percentage
    const totalItems = totalLocations + totalExits;
    const discoveredItems = discoveredLocationCount + discoveredExitCount;
    const explorationPercentage =
      totalItems > 0 ? Math.floor((discoveredItems / totalItems) * 100) : 100;

    // Update display
    discoveryStats.innerHTML = `
      <div>Exploration: <span class="stat-value">${explorationPercentage}%</span></div>
      <div>Locations: <span class="stat-value">${discoveredLocationCount}/${totalLocations}</span></div>
      <div>Exits: <span class="stat-value">${discoveredExitCount}/${totalExits}</span></div>
    `;
  }

  /**
   * Update the region XP display
   * @param {string} regionName - Name of the region
   */
  _updateRegionXPDisplay(regionName) {
    const regionBlock = document.querySelector(
      `.loop-region-block[data-region="${regionName}"]`
    );
    if (!regionBlock) return;

    const xpData = loopState.getRegionXP(regionName);
    const xpDisplay = regionBlock.querySelector('.region-xp-display');

    if (xpDisplay && xpData) {
      // Calculate percentage to next level
      const percentage = (xpData.xp / xpData.xpForNextLevel) * 100;

      // Calculate the action speed/efficiency bonus (5% per level)
      const speedBonus = xpData.level * 5;

      // Animate XP bar by removing transition first
      const xpBar = xpDisplay.querySelector('.xp-bar');
      if (xpBar) {
        // Remove transition temporarily
        xpBar.style.transition = 'none';
        // Force a reflow
        void xpBar.offsetWidth;
        // Restore transition
        xpBar.style.transition = 'width 0.3s ease';
        // Update width
        xpBar.style.width = `${percentage}%`;
      }

      // Update XP text
      const xpText = xpDisplay.querySelector('.xp-text');
      if (xpText) {
        xpText.innerHTML = `Level ${xpData.level} (${Math.floor(xpData.xp)}/${
          xpData.xpForNextLevel
        } XP) <span class="discount-text">+${speedBonus}% action efficiency</span>`;
      } else {
        // Re-create the entire display if needed
        xpDisplay.innerHTML = `
          <div class="xp-text">Level ${xpData.level} (${Math.floor(
          xpData.xp
        )}/${
          xpData.xpForNextLevel
        } XP) <span class="discount-text">+${speedBonus}% action efficiency</span></div>
          <div class="xp-bar-container">
            <div class="xp-bar" style="width: ${percentage}%"></div>
          </div>
        `;
      }
    }
  }

  /**
   * Update the list of discovered locations in a region
   * @param {string} regionName - Name of the region
   * @param {HTMLElement} container - Container element
   */
  _updateDiscoveredLocations(regionName, container) {
    if (!container) return;

    // Clear existing locations
    container.innerHTML = '<h4>Locations</h4>';

    const regionData = stateManager.regions[regionName];
    if (!regionData || !regionData.locations) return;

    // Add discovered locations
    regionData.locations.forEach((loc) => {
      // For locations, we show all but style them differently if not discovered
      const isDiscovered = loopState.isLocationDiscovered(loc.name);
      const isChecked = stateManager.isLocationChecked(loc.name);
      const canAccess = stateManager.isLocationAccessible(loc);

      const locDiv = document.createElement('div');
      locDiv.className = 'loop-location-wrapper';

      // Determine the display name based on discovery status
      const displayName = isDiscovered ? loc.name : '???';

      // Create a location link
      const locLink = commonUI.createLocationLink(
        displayName,
        regionName,
        this.colorblindMode,
        (locationName, regionName, e) => {
          // Clicking on location in loop mode adds a check action to queue
          e.stopPropagation();
          if (
            this.isLoopModeActive &&
            !isChecked &&
            canAccess &&
            isDiscovered
          ) {
            this._queueCheckLocationAction(regionName, loc.name);
          }
        }
      );

      // Store the real name as a data attribute
      locLink.dataset.realName = loc.name;

      // Add appropriate classes
      if (isChecked) {
        locLink.classList.add('checked-loc');
      } else if (canAccess) {
        locLink.classList.add('accessible');
      } else {
        locLink.classList.add('inaccessible');
      }

      // Add undiscovered class if needed
      if (!isDiscovered) {
        locLink.classList.add('undiscovered-location');
      }

      locDiv.appendChild(locLink);

      // Add check button only for discovered, unchecked, accessible locations
      if (isDiscovered && !isChecked && canAccess && this.isLoopModeActive) {
        const checkBtn = document.createElement('button');
        checkBtn.className = 'loop-check-loc-btn';
        checkBtn.textContent = 'Queue Check';
        checkBtn.addEventListener('click', () => {
          this._queueCheckLocationAction(regionName, loc.name);
        });
        locDiv.appendChild(checkBtn);
      }

      // Add check mark for checked locations
      if (isChecked) {
        const checkMark = document.createElement('span');
        checkMark.className = 'loop-check-mark';
        checkMark.textContent = '✓';
        locDiv.appendChild(checkMark);
      }

      container.appendChild(locDiv);
    });
  }

  /**
   * Queue a location check action
   * @param {string} regionName - Name of the region
   * @param {string} locationName - Name of the location
   */
  _queueCheckLocationAction(regionName, locationName) {
    if (!this.isLoopModeActive) return;

    //console.log(
    //  `Queueing check location action for ${locationName} in ${regionName}`
    //);

    const action = {
      id: `action_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      type: 'checkLocation',
      regionName,
      locationName,
      progress: 0,
      completed: false,
    };

    loopState.queueAction(action);

    // Make sure the region appears in the queue
    this.regionsInQueue.add(regionName);

    // Force re-render to update UI
    this.renderLoopPanel();
  }

  /**
   * Update the list of discovered exits in a region
   * @param {string} regionName - Name of the region
   * @param {HTMLElement} container - Container element
   */
  _updateDiscoveredExits(regionName, container) {
    if (!container) return;

    // Clear existing exits
    container.innerHTML = '<h4>Exits</h4>';

    const regionData = stateManager.regions[regionName];
    if (!regionData || !regionData.exits) return;

    const discoveredExits =
      loopState.discoveredExits.get(regionName) || new Set();

    // Add exits (both discovered and undiscovered)
    regionData.exits.forEach((exit) => {
      const isDiscovered = discoveredExits.has(exit.name);
      const canAccess =
        !exit.access_rule ||
        stateManager.evaluateRuleWithPathContext(exit.access_rule);

      const exitWrapper = document.createElement('div');
      exitWrapper.className = 'loop-exit-wrapper';

      // Create wrapper for exit info
      const exitInfo = document.createElement('span');

      // Add base class based on accessibility
      if (canAccess) {
        exitInfo.classList.add('accessible');
      } else {
        exitInfo.classList.add('inaccessible');
      }

      // Add undiscovered class if needed
      if (!isDiscovered) {
        exitInfo.classList.add('undiscovered-location');
      }

      // Determine the display name based on discovery status
      const exitDisplayName = isDiscovered ? exit.name : '???';
      exitInfo.textContent = `${exitDisplayName} → `;

      // Add connected region as a link if it exists
      if (exit.connected_region) {
        // Determine if the region is discovered
        const isDestRegionDiscovered = loopState.isRegionDiscovered(
          exit.connected_region
        );
        // Display name based on discovery status
        const connectedRegionDisplay = isDestRegionDiscovered
          ? exit.connected_region
          : '???';

        const regionLink = commonUI.createRegionLink(
          connectedRegionDisplay,
          this.colorblindMode,
          (connectedRegion, e) => {
            e.stopPropagation();
            // In loop mode, clicking a region link queues a move action
            if (this.isLoopModeActive && canAccess && isDiscovered) {
              this._queueMoveAction(
                regionName,
                exit.name,
                exit.connected_region
              );
            }
          }
        );

        // Store the real region name for click action
        regionLink.dataset.realRegion = exit.connected_region;

        // Add classes to region link
        if (canAccess) {
          regionLink.classList.add('accessible');
        } else {
          regionLink.classList.add('inaccessible');
        }

        // Add undiscovered class if needed
        if (!isDiscovered) {
          regionLink.classList.add('undiscovered-location');
        }

        exitInfo.appendChild(regionLink);
      } else {
        exitInfo.textContent += '(none)';
      }

      exitWrapper.appendChild(exitInfo);

      // Add move button only for discovered, accessible exits
      if (
        isDiscovered &&
        this.isLoopModeActive &&
        canAccess &&
        exit.connected_region
      ) {
        const moveBtn = document.createElement('button');
        moveBtn.className = 'loop-move-btn';
        moveBtn.textContent = 'Queue Move';
        moveBtn.addEventListener('click', () => {
          this._queueMoveAction(regionName, exit.name, exit.connected_region);
        });
        exitWrapper.appendChild(moveBtn);
      }

      container.appendChild(exitWrapper);
    });
  }

  /**
   * Queue a move action
   * @param {string} regionName - Source region name
   * @param {string} exitName - Exit name
   * @param {string} destinationRegion - Destination region name
   */
  _queueMoveAction(regionName, exitName, destinationRegion) {
    if (!this.isLoopModeActive) return;

    // Check if there's already a move action for this region
    const existingMoveAction = loopState.actionQueue.find(
      (action) =>
        action.type === 'moveToRegion' && action.regionName === regionName
    );

    // Check if there's already a move action TO the destination region
    const existingDestinationAction = loopState.actionQueue.find(
      (action) =>
        action.type === 'moveToRegion' &&
        action.destinationRegion === destinationRegion
    );

    if (existingMoveAction) {
      console.log(
        `There's already a move action from ${regionName} to ${existingMoveAction.destinationRegion}`
      );

      // Create a modal message with don't show again checkbox
      const message = `You already have a move action from ${regionName} to ${existingMoveAction.destinationRegion}. Remove it first to add a new move action.`;

      // Check if the user has chosen to hide this message
      if (localStorage.getItem('hideDoubleMovementWarning') !== 'true') {
        // Modal for better UI
        const modalHtml = `
          <div class="warning-message">${message}</div>
          <div class="dont-show-again">
            <input type="checkbox" id="dont-show-move-warning">
            <label for="dont-show-move-warning">Don't show this message again</label>
          </div>
        `;

        // Show in the console and create a modal dialog
        if (window.consoleManager) {
          window.consoleManager.print(message, 'warning');

          // Show modal
          const modal = document.getElementById('location-modal');
          const modalTitle = document.getElementById('modal-title');
          const modalInfo = document.getElementById('modal-info');

          if (modal && modalTitle && modalInfo) {
            modalTitle.textContent = 'Move Action Warning';
            modalInfo.innerHTML = modalHtml;
            modal.classList.remove('hidden');

            // Handle don't show again checkbox
            const checkbox = document.getElementById('dont-show-move-warning');
            if (checkbox) {
              checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                  localStorage.setItem('hideDoubleMovementWarning', 'true');
                }
              });
            }
          }
        } else {
          alert(message);
        }
      }

      return;
    }

    // If there's already a move action TO the destination region, show warning
    if (existingDestinationAction) {
      console.log(
        `There's already a move action to ${destinationRegion} from ${existingDestinationAction.regionName}`
      );

      // Create a modal message with don't show again checkbox
      const message = `You already have a move action to ${destinationRegion} from ${existingDestinationAction.regionName}. Remove it first to add a new move action to this region.`;

      // Check if the user has chosen to hide this message
      if (localStorage.getItem('hideDoubleDestinationWarning') !== 'true') {
        // Modal for better UI
        const modalHtml = `
          <div class="warning-message">${message}</div>
          <div class="dont-show-again">
            <input type="checkbox" id="dont-show-destination-warning">
            <label for="dont-show-destination-warning">Don't show this message again</label>
          </div>
        `;

        // Show in the console and create a modal dialog
        if (window.consoleManager) {
          window.consoleManager.print(message, 'warning');

          // Show modal
          const modal = document.getElementById('location-modal');
          const modalTitle = document.getElementById('modal-title');
          const modalInfo = document.getElementById('modal-info');

          if (modal && modalTitle && modalInfo) {
            modalTitle.textContent = 'Move Action Warning';
            modalInfo.innerHTML = modalHtml;
            modal.classList.remove('hidden');

            // Handle don't show again checkbox
            const checkbox = document.getElementById(
              'dont-show-destination-warning'
            );
            if (checkbox) {
              checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                  localStorage.setItem('hideDoubleDestinationWarning', 'true');
                }
              });
            }
          }
        } else {
          alert(message);
        }
      }

      return;
    }

    // Immediately collapse the source region when adding a move action
    this.expandedRegions.delete(regionName);

    //console.log(
    //  `Queueing move action from ${regionName} to ${destinationRegion} via ${exitName}`
    //);

    const action = {
      id: `action_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      type: 'moveToRegion',
      regionName,
      exitName,
      destinationRegion,
      progress: 0,
      completed: false,
    };

    loopState.queueAction(action);

    // Update regionsInQueue
    this.regionsInQueue.add(regionName);
    this.regionsInQueue.add(destinationRegion);

    // Immediately expand the destination region
    this.expandedRegions.add(destinationRegion);

    // Re-render to update UI
    this.renderLoopPanel();
  }

  /**
   * Expand all regions
   */
  expandAllRegions() {
    console.log('LoopUI: Expanding all regions');
    if (!this.isLoopModeActive) return;
    const discoveredRegions = loopState.discoveredRegions;
    if (!discoveredRegions || typeof discoveredRegions.forEach !== 'function') {
      console.error('discoveredRegions is not a valid Set:', discoveredRegions);
      return;
    }
    discoveredRegions.forEach((regionName) => {
      this.expandedRegions.add(regionName);
    });

    const expandCollapseBtn = this.rootElement.querySelector(
      '#loop-ui-expand-collapse-all'
    );
    if (expandCollapseBtn) {
      expandCollapseBtn.textContent = 'Collapse All';
    }
    // Also update the potentially existing global header button
    const headerExpandCollapseBtn = document.querySelector(
      '.loop-controls #loop-expand-collapse-all'
    );
    if (headerExpandCollapseBtn) {
      headerExpandCollapseBtn.textContent = 'Collapse All';
    }
    this.renderLoopPanel(); // Re-render
  }

  /**
   * Collapse all regions
   */
  collapseAllRegions() {
    console.log('LoopUI: Collapsing all regions');
    if (!this.isLoopModeActive) return;
    this.expandedRegions.clear();

    const expandCollapseBtn = this.rootElement.querySelector(
      '#loop-ui-expand-collapse-all'
    );
    if (expandCollapseBtn) {
      expandCollapseBtn.textContent = 'Expand All';
    }
    // Also update the potentially existing global header button
    const headerExpandCollapseBtn = document.querySelector(
      '.loop-controls #loop-expand-collapse-all'
    );
    if (headerExpandCollapseBtn) {
      headerExpandCollapseBtn.textContent = 'Expand All';
    }
    this.renderLoopPanel(); // Re-render
  }

  /**
   * Toggle a region's expanded state
   * @param {string} regionName - Name of the region
   */
  toggleRegionExpanded(regionName) {
    if (this.expandedRegions.has(regionName)) {
      this.expandedRegions.delete(regionName);
    } else {
      this.expandedRegions.add(regionName);
    }
    this.renderLoopPanel();
  }

  /**
   * Render the loop panel
   */
  renderLoopPanel() {
    console.log(`LoopUI: Rendering panel. Active: ${this.isLoopModeActive}`);

    // <<< Get setting once for the panel >>>
    const useLoopColorblind = settingsManager.getSetting(
      'colorblindMode.loops',
      true
    );

    // Get necessary elements, preferably cached ones
    const container = this.rootElement; // Main container
    if (!container) {
      console.error('LoopUI: Container rootElement not found');
      return;
    }

    // --- Manage Visibility Based on Mode ---
    const fixedArea = this.rootElement.querySelector('#loop-fixed-area');
    const regionsArea =
      this.loopRegionsArea ||
      this.rootElement.querySelector('#loop-regions-area');
    let inactiveMessage = this.rootElement.querySelector(
      '.loop-inactive-message'
    );

    if (!this.isLoopModeActive) {
      if (fixedArea) fixedArea.style.display = 'none';
      if (regionsArea) regionsArea.style.display = 'none';

      if (!inactiveMessage) {
        inactiveMessage = document.createElement('div');
        inactiveMessage.className = 'loop-inactive-message';
        inactiveMessage.innerHTML = `
          <div>Loop Mode is not active. Click "Enter Loop Mode" to begin.</div>
          <style>
            .loop-inactive-message { padding: 20px; text-align: center; color: #888; font-style: italic; }
          </style>
        `;
        // Insert after controls, before fixed area
        const topControls = this.rootElement.querySelector('.loop-controls');
        if (topControls) {
          topControls.insertAdjacentElement('afterend', inactiveMessage);
        } else {
          container.prepend(inactiveMessage); // Fallback
        }
      }
      inactiveMessage.style.display = 'block';
      return; // Don't render regions etc.
    } else {
      // Ensure active areas are visible and inactive message is hidden
      if (fixedArea) fixedArea.style.display = 'block'; // Or appropriate display type
      if (regionsArea) regionsArea.style.display = 'block'; // Or appropriate display type
      if (inactiveMessage) inactiveMessage.style.display = 'none';
    }
    // --- End Visibility Management ---

    // Ensure fixed area exists and is initialized - REMOVED Check, buildInitialStructure handles this
    // if (!this.rootElement.querySelector('#loop-fixed-area .mana-container')) {
    //   this._initializeFixedArea();
    // }

    // Get discovered regions (only render if loop mode is active)
    const discoveredRegions = loopState.discoveredRegions;

    // Use the cached or queried regionsArea
    if (!regionsArea) {
      console.error('Could not find #loop-regions-area to render regions.');
      return; // Can't proceed without the regions area
    }

    if (!discoveredRegions || discoveredRegions.size === 0) {
      regionsArea.innerHTML = // Clear and set message inside regionsArea
        '<div class="no-regions-message">No regions discovered yet.</div>';
      // Still update mana/action display even if no regions
      this._updateManaDisplay(loopState.currentMana, loopState.maxMana);
      this._updateCurrentActionDisplay(loopState.currentAction);
      return;
    }

    // Create a container for regions
    const regionsContainer = document.createElement('div');
    regionsContainer.id = 'regions-container';
    regionsContainer.className = 'regions-container';
    container.appendChild(regionsContainer);

    // Sort discovered regions alphabetically, keeping 'Menu' first if present
    const sortedRegions = [...discoveredRegions].sort((a, b) => {
      if (a === 'Menu') return -1;
      if (b === 'Menu') return 1;
      return a.localeCompare(b);
    });

    sortedRegions.forEach((regionName) => {
      const region = stateManager.regions[regionName];
      if (!region) return;
      // Show regions that are 'Menu', have actions queued, or are the destination of a move action
      const isDestination = loopState.actionQueue.some(
        (action) =>
          action.type === 'moveToRegion' &&
          action.destinationRegion === regionName
      );
      const showRegion =
        regionName === 'Menu' ||
        this.regionsInQueue.has(regionName) ||
        isDestination;
      if (showRegion) {
        const isExpanded = this.expandedRegions.has(regionName);
        const regionBlock = this._buildRegionBlock(
          region,
          isExpanded,
          useLoopColorblind
        ); // <<< Pass setting
        regionsContainer.appendChild(regionBlock);
      }
    });

    // Update mana display and current action
    this._updateManaDisplay(loopState.currentMana, loopState.maxMana);
    this._updateCurrentActionDisplay(loopState.currentAction); // Use helper

    // Ensure Expand/Collapse button text is correct
    const expandCollapseBtn = this.rootElement.querySelector(
      '#loop-ui-expand-collapse-all'
    );
    if (expandCollapseBtn) {
      // Check if ALL shown regions are expanded
      let allExpanded = true;
      if (regionsContainer.children.length === 0) {
        allExpanded = false; // No regions shown, default to "Expand"
      } else {
        for (const regionBlock of regionsContainer.children) {
          if (!regionBlock.classList.contains('expanded')) {
            allExpanded = false;
            break;
          }
        }
      }
      expandCollapseBtn.textContent = allExpanded
        ? 'Collapse All'
        : 'Expand All';
    }

    console.log('LoopUI: Panel rendered.');
  }

  /**
   * Build a region block
   * @param {Object} region - Region data
   * @param {boolean} expanded - Whether the region is expanded
   * @returns {HTMLElement} - The region block element
   */
  _buildRegionBlock(region, expanded, useColorblind) {
    // <<< Receive setting
    if (!region) {
      console.warn('buildRegionBlock called with invalid region data');
      return document.createElement('div');
    }

    const regionName = region.name;
    const regionBlock = document.createElement('div');
    regionBlock.className = 'loop-region-block';
    regionBlock.dataset.region = regionName;
    regionBlock.classList.add(expanded ? 'expanded' : 'collapsed');
    regionBlock.classList.toggle('colorblind-mode', useColorblind); // <<< Apply class to block

    // --- Header ---
    const headerEl = document.createElement('div');
    headerEl.className = 'loop-region-header';
    headerEl.innerHTML = `
      <span class="loop-region-name">${regionName}</span>
      <button class="loop-collapse-btn">${
        expanded ? 'Collapse' : 'Expand'
      }</button>
    `;
    headerEl.addEventListener('click', (e) => {
      // Prevent clicks on buttons inside header from toggling expand/collapse
      if (e.target.tagName !== 'BUTTON') {
        this.toggleRegionExpanded(regionName);
      }
    });
    regionBlock.appendChild(headerEl);

    // --- Queued Actions ---
    // Filter actions: show if regionName matches OR (it's moveToRegion AND destination matches)
    const actionsForRegion = loopState.actionQueue.filter(
      (action) =>
        action.regionName === regionName ||
        (action.type === 'moveToRegion' &&
          action.destinationRegion === regionName)
    );

    if (actionsForRegion.length > 0) {
      const queuedActionsContainer = document.createElement('div');
      queuedActionsContainer.className = 'region-queued-actions';
      actionsForRegion.forEach((action) => {
        const actionItem = this._createActionItem(action, useColorblind); // <<< Accept setting
        queuedActionsContainer.appendChild(actionItem);
      });
      regionBlock.appendChild(queuedActionsContainer);
    }

    // --- Details (if expanded) ---
    if (expanded) {
      const detailEl = document.createElement('div');
      detailEl.className = 'loop-region-details';

      // XP Display
      const xpData = loopState.getRegionXP(regionName);
      const speedBonus = xpData.level * 5; // Assuming 5% per level
      const xpPercentage =
        xpData.xpForNextLevel > 0
          ? (xpData.xp / xpData.xpForNextLevel) * 100
          : 0;
      const xpDisplay = document.createElement('div');
      xpDisplay.className = 'region-xp-display';
      xpDisplay.innerHTML = `
            <div class="xp-text">Level ${xpData.level} (${Math.floor(
        xpData.xp
      )}/${
        xpData.xpForNextLevel
      } XP) <span class="discount-text">+${speedBonus}% efficiency</span></div>
            <div class="xp-bar-container"><div class="xp-bar" style="width: ${xpPercentage}%"></div></div>
      `;
      detailEl.appendChild(xpDisplay);

      // Discovery Stats
      const regionData = stateManager.regions[regionName]; // Get full data
      const totalLocations = regionData?.locations?.length || 0;
      const totalExits = regionData?.exits?.length || 0;
      const discoveredLocationCount =
        regionData?.locations?.filter((loc) =>
          loopState.isLocationDiscovered(loc.name)
        ).length || 0;
      const discoveredExitCount =
        loopState.discoveredExits.get(regionName)?.size || 0;
      const totalItems = totalLocations + totalExits;
      const discoveredItems = discoveredLocationCount + discoveredExitCount;
      const explorationPercentage =
        totalItems > 0
          ? Math.floor((discoveredItems / totalItems) * 100)
          : totalItems === 0
          ? 100
          : 0; // Handle 0 total items
      const discoveryStats = document.createElement('div');
      discoveryStats.className = 'region-discovery-stats';
      discoveryStats.innerHTML = `
        <div>Exploration: <span class="stat-value">${explorationPercentage}%</span></div>
        <div>Locations: <span class="stat-value">${discoveredLocationCount}/${totalLocations}</span></div>
        <div>Exits: <span class="stat-value">${discoveredExitCount}/${totalExits}</span></div>
      `;
      detailEl.appendChild(discoveryStats);

      // Actions Area (Explore Button + Repeat Checkbox)
      if (this.isLoopModeActive) {
        // Only show actions if loop mode is active
        const actionsArea = document.createElement('div');
        actionsArea.className = 'region-actions';

        const exploreBtn = document.createElement('button');
        exploreBtn.className = 'explore-btn button'; // Added button class
        exploreBtn.textContent =
          discoveredItems < totalItems ? 'Explore Region' : 'Farm Region XP';
        exploreBtn.addEventListener('click', (e) => {
          e.stopPropagation(); // Prevent header click
          this._queueExploreAction(regionName);
        });
        actionsArea.appendChild(exploreBtn);

        const repeatCheckboxId = `repeat-explore-checkbox-${regionName.replace(
          /\s+/g,
          '-'
        )}`;
        const repeatWrapper = document.createElement('div');
        repeatWrapper.className = 'checkbox-container';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = repeatCheckboxId;
        checkbox.className = 'repeat-explore-checkbox';
        checkbox.checked = this.repeatExploreStates.get(regionName) || false;
        checkbox.addEventListener('change', (e) => {
          e.stopPropagation(); // Prevent header click
          this.repeatExploreStates.set(regionName, e.target.checked);
        });
        checkbox.addEventListener('click', (e) => e.stopPropagation()); // Also stop propagation on click

        const label = document.createElement('label');
        label.htmlFor = repeatCheckboxId;
        label.textContent = 'Repeat Explore Action';
        label.addEventListener('click', (e) => e.stopPropagation()); // Prevent header click on label

        repeatWrapper.appendChild(checkbox);
        repeatWrapper.appendChild(label);
        actionsArea.appendChild(repeatWrapper);

        detailEl.appendChild(actionsArea);
      }

      // Locations Container
      if (
        regionData &&
        regionData.locations &&
        regionData.locations.length > 0
      ) {
        const locationsContainer = document.createElement('div');
        locationsContainer.className = 'loop-region-locations-container';
        locationsContainer.classList.toggle('colorblind-mode', useColorblind); // Apply to lists
        this._updateDiscoveredLocations(regionName, locationsContainer); // Populate
        detailEl.appendChild(locationsContainer);
      }

      // Exits Container
      if (regionData && regionData.exits && regionData.exits.length > 0) {
        const exitsContainer = document.createElement('div');
        exitsContainer.className = 'loop-region-exits-container';
        exitsContainer.classList.toggle('colorblind-mode', useColorblind); // Apply to lists
        this._updateDiscoveredExits(regionName, exitsContainer); // Populate
        detailEl.appendChild(exitsContainer);
      }

      regionBlock.appendChild(detailEl);
    }

    return regionBlock;
  }

  /**
   * Create an action item element
   * @param {Object} action - The action data
   * @returns {HTMLElement} - The action item element
   */
  _createActionItem(action, useColorblind) {
    // <<< Accept setting
    const actionDiv = document.createElement('div');
    actionDiv.id = `action-${action.id}`;
    actionDiv.className = 'action-item';
    actionDiv.classList.toggle('colorblind-mode', useColorblind); // <<< Apply class based on setting

    // Determine action name and display
    let actionName = '';
    switch (action.type) {
      case 'explore':
        actionName = `Explore ${action.regionName}`;
        break;
      case 'checkLocation':
        actionName = `Check ${action.locationName}`;
        break;
      case 'moveToRegion':
        actionName = `Move to ${action.destinationRegion}`;
        break;
      default:
        actionName = `${action.type}`;
    }

    // Calculate mana cost
    const actionCost = this._estimateActionCost(action);
    const manaCostSoFar = action.completed
      ? actionCost
      : (action.progress / 100) * actionCost;

    // Is this the active action?
    const isActive =
      loopState.currentAction && loopState.currentAction.id === action.id;

    // Determine status text and class
    let statusText = 'Pending';
    let statusClass = 'pending';
    if (action.completed) {
      statusText = 'Completed';
      statusClass = 'completed';
    } else if (isActive) {
      statusText = 'Active';
      statusClass = 'active';
    }

    // Find the index of this action in the queue
    const actionIndex = loopState.actionQueue.findIndex(
      (a) => a.id === action.id
    );

    // Create action content
    actionDiv.innerHTML = `
      <div class="action-header">
        <span class="action-name">${actionName}</span>
        <span class="action-status ${statusClass}">
          ${statusText}
        </span>
      </div>
      <div class="action-container">
        <div class="action-progress">
          <div class="action-progress-bar" style="width: ${
            action.completed ? 100 : action.progress
          }%"></div>
          <span class="action-progress-value">Action ${
            actionIndex + 1 // Now always display the actual queue position
          } of ${loopState.actionQueue.length}, Progress: ${Math.floor(
      manaCostSoFar
    )} of ${actionCost} mana</span>
        </div>
        <button class="remove-action-btn">✖</button>
      </div>
    `;

    // Add remove button listener
    const removeBtn = actionDiv.querySelector('.remove-action-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        // Find the index of this action in the queue
        const index = loopState.actionQueue.findIndex(
          (a) => a.id === action.id
        );
        if (index !== -1) {
          // If this is a move action, we need to handle dependent actions
          if (action.type === 'moveToRegion') {
            const destinationRegion = action.destinationRegion;

            // First collect all regions that will be affected
            // Starting with the destination of this move
            const regionsToRemove = new Set([destinationRegion]);

            // Now collect all regions that would be reached from actions in those regions
            // This is a recursive process to handle chains of move actions
            let foundNew = true;
            while (foundNew) {
              foundNew = false;

              // Look through all actions to find moves from any region in our set
              loopState.actionQueue.forEach((a) => {
                if (
                  a.type === 'moveToRegion' &&
                  regionsToRemove.has(a.regionName) &&
                  !regionsToRemove.has(a.destinationRegion)
                ) {
                  // Found a move from one of our affected regions to a new region
                  regionsToRemove.add(a.destinationRegion);
                  foundNew = true;
                }
              });
            }

            console.log('Removing all actions in regions:', [
              ...regionsToRemove,
            ]);

            // Remove this action and all actions in or leading to the affected regions
            const actionsToRemove = loopState.actionQueue.slice(index).filter(
              (a) =>
                a.id === action.id || // This action
                regionsToRemove.has(a.regionName) || // Actions in any affected region
                (a.type === 'moveToRegion' &&
                  regionsToRemove.has(a.destinationRegion)) // Move actions to any affected region
            );

            // Remove each action individually
            for (const actionToRemove of actionsToRemove) {
              const actionIndex = loopState.actionQueue.findIndex(
                (a) => a.id === actionToRemove.id
              );
              if (actionIndex !== -1) {
                loopState.removeAction(actionIndex);
              }
            }
          } else {
            // Just remove this action
            loopState.removeAction(index);
          }

          // Update regionsInQueue
          this._updateRegionsInQueue(loopState.actionQueue);

          // Re-render the panel
          this.renderLoopPanel();
        }
      });
    }

    return actionDiv;
  }

  /**
   * Queue an explore action
   * @param {string} regionName - Name of the region to explore
   */
  _queueExploreAction(regionName) {
    if (!this.isLoopModeActive) return;

    console.log(`Queueing explore action for region ${regionName}`);

    // Use the stored checkbox state from our map
    const shouldRepeat = this.repeatExploreStates.get(regionName) || false;

    console.log(
      `Queuing explore action for ${regionName}, repeat: ${shouldRepeat}`
    );

    const action = {
      id: `action_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      type: 'explore',
      regionName,
      progress: 0,
      completed: false,
      repeatAction: shouldRepeat, // Add repeatAction flag for explore actions
    };
    loopState.queueAction(action);

    // Update regionsInQueue
    this.regionsInQueue.add(regionName);

    // Re-render to update UI
    this.renderLoopPanel();
  }

  /**
   * Clean up resources when the UI is destroyed
   */
  dispose() {
    this.onPanelDestroy();
  }

  /**
   * Estimate the mana cost of an action based on the formulas in loopState
   * @param {Object} action - The action to estimate
   * @returns {number} - Estimated mana cost
   */
  _estimateActionCost(action) {
    if (!action) return 0;

    // Use similar logic to loopState._calculateActionCost
    let baseCost;

    // Determine base cost by action type
    switch (action.type) {
      case 'explore':
        baseCost = 50; // Changed from 100 to 50
        break;
      case 'checkLocation':
        baseCost = 100;
        break;
      case 'moveToRegion':
        baseCost = 10;
        break;
      default:
        baseCost = 50;
    }

    // Apply region XP reduction if applicable
    if (action.regionName) {
      const xpData = loopState.getRegionXP(action.regionName);
      // Use proposedLinearFinalCost formula to match loopState._calculateActionCost
      return Math.floor(proposedLinearFinalCost(baseCost, xpData.level));
    }

    return baseCost;
  }

  /**
   * Export game state to a JSON file
   */
  _exportState() {
    try {
      const stateObj = loopState.getSerializableState();
      const stateJson = JSON.stringify(stateObj, null, 2);

      // Create a blob and download link
      const blob = new Blob([stateJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = 'archipelago_save.json';
      document.body.appendChild(a);
      a.click();

      // Clean up
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 0);

      if (window.consoleManager) {
        window.consoleManager.print('Game state exported!', 'success');
      }
    } catch (error) {
      console.error('Failed to export state:', error);
      if (window.consoleManager) {
        window.consoleManager.print(`Export failed: ${error.message}`, 'error');
      }
    }
  }

  /**
   * Import game state from a JSON file
   * @param {File} file - The file to import
   */
  _importState(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const stateObj = JSON.parse(e.target.result);
        loopState.loadFromSerializedState(stateObj);
        this.renderLoopPanel();

        if (window.consoleManager) {
          window.consoleManager.print('Game state imported!', 'success');
        }
      } catch (error) {
        console.error('Failed to import state:', error);
        if (window.consoleManager) {
          window.consoleManager.print(
            `Import failed: ${error.message}`,
            'error'
          );
        }
      }
    };

    reader.readAsText(file);
  }

  /**
   * Toggle loop mode on/off
   */
  toggleLoopMode() {
    this.isLoopModeActive = !this.isLoopModeActive;

    // --- Update THIS panel's UI elements ---
    const toggleBtn = this.rootElement?.querySelector(
      '#loop-ui-toggle-loop-mode'
    );
    if (toggleBtn) {
      toggleBtn.textContent = this.isLoopModeActive
        ? 'Exit Loop Mode'
        : 'Enter Loop Mode';
    }

    // Update other control states based on loop mode activation
    this._updatePauseButtonState(loopState.isPaused); // This handles pause, restart, auto-restart buttons

    // --- Update rendering based on mode ---
    this.renderLoopPanel(); // Re-render to show/hide appropriate content

    // --- Emit event for other components ---
    eventBus.publish('loopUI:modeChanged', { active: this.isLoopModeActive });

    console.log(`LoopUI: Loop mode toggled. Active: ${this.isLoopModeActive}`);
  }

  clear() {
    // Clear internal state
    this.expandedRegions.clear();
    this.regionsInQueue.clear();
    this.repeatExploreStates.clear();
    // Don't clear currentAction, let loopState manage it

    // Clear the regions area in the DOM if rootElement exists
    if (this.loopRegionsArea) {
      this.loopRegionsArea.innerHTML = '';
    }

    // Reset mana display to max
    this._updateManaDisplay(loopState.maxMana, loopState.maxMana);

    // Reset current action display
    this._updateCurrentActionDisplay(null); // Pass null to show 'No action'

    // Add Menu back to expanded regions
    this.expandedRegions.add('Menu');

    // Re-render the panel in its cleared state
    this.renderLoopPanel();
  }

  /**
   * Update the display for the current action progress, fixed at the top
   * @param {Object|null} action - The current action, or null to clear
   */
  _updateCurrentActionDisplay(action) {
    // Use cached or query rootElement
    const actionContainer =
      this.actionQueueContainer ||
      this.rootElement?.querySelector('#current-action-container');
    if (!actionContainer || !this.isLoopModeActive) {
      // Only update if active
      if (actionContainer) actionContainer.innerHTML = ''; // Clear if not active
      return;
    }

    if (!action) {
      actionContainer.innerHTML = `<div class="no-action-message">No action in progress</div>`;
      return;
    }

    const actionCost = this._estimateActionCost(action);
    const manaCostSoFar = (action.progress / 100) * actionCost;
    const displayIndex = loopState.currentActionIndex + 1;
    const actionName = this._getActionDisplayName(action);

    actionContainer.innerHTML = `
      <div class="current-action-label">
        <span>${actionName}</span>
        <span class="mana-cost">${Math.floor(
          manaCostSoFar
        )}/${actionCost} mana</span>
      </div>
      <div class="current-action-progress">
        <div class="current-action-progress-bar" style="width: ${
          action.progress
        }%"></div>
        <span class="current-action-value">Action ${displayIndex} of ${
      loopState.actionQueue.length
    }, Progress: ${Math.floor(manaCostSoFar)} of ${actionCost} mana</span>
      </div>
    `;
  }

  // Helper to get display name
  _getActionDisplayName(action) {
    if (!action) return '';
    switch (action.type) {
      case 'explore':
        return `Explore ${action.regionName}`;
      case 'checkLocation':
        return `Check ${action.locationName}`;
      case 'moveToRegion':
        return `Move to ${action.destinationRegion}`;
      default:
        return `${action.type}`;
    }
  }
}

export default LoopUI;
