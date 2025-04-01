// loopUI.js - UI for the Loop mode
import stateManager from '../core/stateManagerSingleton.js';
import loopState from '../core/loop/loopState.js';
import eventBus from '../core/eventBus.js';
import commonUI from './commonUI.js';
import {
  levelFromXP,
  xpForNextLevel,
  proposedLinearFinalCost,
  proposedLinearReduction,
} from '../core/loop/xpFormulas.js';

export class LoopUI {
  constructor(gameUI) {
    this.gameUI = gameUI;

    // UI state
    this.expandedRegions = new Set();
    this.regionsInQueue = new Set(); // Track which regions have actions in the queue
    this.colorblindMode = false;
    this.isLoopModeActive = false;
    this.repeatExploreStates = new Map(); // Map to track repeat explore checkbox states per region

    // Animation state
    this._animationFrameId = null;
    this._lastUpdateTime = 0;

    // Make this instance globally accessible for direct event handlers
    window.loopUIInstance = this;

    // Attach event listeners for loop state changes
    this._setupEventListeners();

    // Set up animation frame for continuous UI updates
    this._startAnimationLoop();
  }

  /**
   * Start a continuous animation loop for UI updates
   */
  _startAnimationLoop() {
    const updateUI = (timestamp) => {
      // Limit to around 10 updates per second to avoid performance issues
      if (timestamp - this._lastUpdateTime > 100) {
        this._lastUpdateTime = timestamp;

        // Update UI for current action if one exists
        if (loopState.isProcessing && loopState.currentAction) {
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
    this.clear();
    this.createUIStructure();

    // Initialize loop state
    loopState.initialize();

    // Set initial expanded state for starting region
    this.expandedRegions.add('Menu');

    // Store this instance in the window for access from event handlers
    window.loopUIInstance = this;

    // Initialize the loop status display in header - hide it initially
    const headerStatusDisplay = document.querySelector('.loop-status-display');
    if (headerStatusDisplay) {
      headerStatusDisplay.style.display = 'none';
    }

    // Render initial state (without attaching event listeners again)
    this.renderLoopPanel();

    // Attach event handlers after ensuring the DOM is fully built
    // This is separate from renderLoopPanel to avoid duplicate event listeners
    this._attachControlEventListeners();

    return true;
  }

  /**
   * Create the basic structure for the loop UI panel
   */
  createUIStructure() {
    const container = document.getElementById('loop-panel');
    if (!container) {
      console.error('Loop panel container not found');
      return;
    }

    // Clear container first
    container.innerHTML = '';

    // Set container style to ensure proper layout
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.height = '100%';
    container.style.overflow = 'hidden';

    // Create top status area with just the mana bar and current action
    const fixedArea = document.createElement('div');
    fixedArea.id = 'loop-fixed-area';
    fixedArea.className = 'loop-fixed-area';

    fixedArea.innerHTML = `
      <div class="loop-resources">
        <div class="mana-container">
          <div class="resource-label">Mana:</div>
          <div class="mana-bar-container">
            <div id="mana-bar" class="mana-bar"></div>
            <span id="mana-value">100 of 100 Mana Remaining</span>
          </div>
        </div>
        <div class="current-action-container" id="current-action-container">
          <div class="no-action-message">No action in progress</div>
        </div>
      </div>
    `;
    container.appendChild(fixedArea);

    // Create scrollable region area
    const regionsArea = document.createElement('div');
    regionsArea.id = 'loop-regions-area';
    regionsArea.className = 'loop-regions-area';
    // Ensure scrolling works
    regionsArea.style.overflowY = 'auto';
    regionsArea.style.flex = '1';
    regionsArea.style.height = '100%';
    container.appendChild(regionsArea);

    // Add other controls at the bottom (without the Expand All button)
    const controlsArea = document.createElement('div');
    controlsArea.className = 'loop-controls-area';
    controlsArea.innerHTML = `
      <button id="loop-clear-queue" class="button">Clear Queue</button>
      <button id="loop-save-state" class="button">Save Game</button>
      <button id="loop-export-state" class="button">Export</button>
      <button id="loop-import-state" class="button">Import</button>
      <button id="loop-hard-reset" class="button">Hard Reset</button>
    `;
    container.appendChild(controlsArea);

    //console.log(
    //  'UI structure created: loop-regions-area exists:',
    //  !!document.getElementById('loop-regions-area')
    //);

    // Add hidden file input for import
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'loop-state-import';
    fileInput.className = 'hidden';
    fileInput.accept = '.json';
    container.appendChild(fileInput);

    // Add colorblind mode toggle listener
    const colorblindToggle = document.getElementById('loop-colorblind');
    if (colorblindToggle) {
      colorblindToggle.addEventListener('change', (e) => {
        this.setColorblindMode(e.target.checked);
      });
    }
  }

  /**
   * Set up event listeners for loop state changes
   */
  _setupEventListeners() {
    // Mana changes
    eventBus.subscribe('loopState:manaChanged', (data) => {
      this._updateManaDisplay(data.current, data.max);
    });

    // XP changes
    eventBus.subscribe('loopState:xpChanged', (data) => {
      this._updateRegionXPDisplay(data.regionName);
    });

    // Pause state changes
    eventBus.subscribe('loopState:paused', (data) => {
      this._updatePauseButtonState(true);
    });

    eventBus.subscribe('loopState:resumed', (data) => {
      this._updatePauseButtonState(false);
    });

    eventBus.subscribe('loopState:pauseStateChanged', (data) => {
      this._updatePauseButtonState(data.isPaused);
    });

    // Queue updates
    eventBus.subscribe('loopState:queueUpdated', (data) => {
      //console.log(
      //  'Received loopState:queueUpdated event, queue length:',
      //  data.queue.length
      //);
      // Update regions in queue
      this._updateRegionsInQueue(data.queue);
      // Render the entire panel to ensure regions are shown/hidden properly
      this.renderLoopPanel();
    });

    // Auto-restart changes
    eventBus.subscribe('loopState:autoRestartChanged', (data) => {
      const autoRestartBtn = document.getElementById('toggle-auto-restart');
      if (autoRestartBtn) {
        autoRestartBtn.textContent = data.autoRestart
          ? 'Restart when queue complete'
          : 'Pause when queue complete';
      }
    });

    // Progress updates
    eventBus.subscribe('loopState:progressUpdated', (data) => {
      if (data.action) {
        this._updateActionProgress(data.action);
        this._updateCurrentActionDisplay(data.action);

        // Force a reflow to ensure animations are visible
        window.requestAnimationFrame(() => {
          const actionEl = document.getElementById(`action-${data.action.id}`);
          if (actionEl) {
            // Force a style recalculation
            void actionEl.offsetWidth;
          }
        });
      }

      // Always update mana display, even if there's no current action
      this._updateManaDisplay(data.mana.current, data.mana.max);
    });

    // Action completion
    eventBus.subscribe('loopState:actionCompleted', () => {
      this.renderLoopPanel();
    });

    // New action started
    eventBus.subscribe('loopState:newActionStarted', (data) => {
      if (data.action) {
        this._updateCurrentActionDisplay(data.action);
      }
    });

    // Queue completed
    eventBus.subscribe('loopState:queueCompleted', () => {
      const actionContainer = document.getElementById(
        'current-action-container'
      );
      if (actionContainer) {
        actionContainer.innerHTML = `<div class="no-action-message">No action in progress</div>`;
      }
    });

    // New discoveries
    eventBus.subscribe('loopState:locationDiscovered', (data) => {
      this._updateDiscoveredItems(data.regionName);
    });

    eventBus.subscribe('loopState:exitDiscovered', (data) => {
      this._updateDiscoveredItems(data.regionName);
    });

    eventBus.subscribe('loopState:regionDiscovered', (data) => {
      this.renderLoopPanel();
    });

    // Loop reset
    eventBus.subscribe('loopState:loopReset', (data) => {
      this._handleLoopReset(data);
      this._updateManaDisplay(data.mana.current, data.mana.max);
    });

    // State loaded
    eventBus.subscribe('loopState:stateLoaded', () => {
      this.renderLoopPanel();
    });

    // Listen for explore action repeat events
    eventBus.subscribe('loopState:exploreActionRepeated', (data) => {
      //console.log('Explore action repeated for region:', data.regionName);
      // Make sure the region is in the queue
      this.regionsInQueue.add(data.regionName);
      // Update the UI
      this.renderLoopPanel();
    });
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
   * Attach event listeners to control elements
   */
  _attachControlEventListeners() {
    //console.log('Attaching all control event listeners');

    // Store a reference to this for use in event handlers
    const self = this;

    // === Attach listeners for control buttons ===
    // We'll use a helper function to avoid duplicating code
    const attachButtonHandler = (buttonId, handler) => {
      const button = document.getElementById(buttonId);
      if (button) {
        // Clone and replace to remove existing event listeners
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);

        // Add the new click handler
        newButton.addEventListener('click', handler);
        return newButton;
      }
      return null;
    };

    // Toggle loop mode button
    attachButtonHandler('toggle-loop-mode', function () {
      console.log('Toggle loop mode button clicked');
      self.toggleLoopMode();
    });

    // Pause button
    attachButtonHandler('toggle-pause', function () {
      console.log('Pause button clicked');
      // Toggle the pause state
      const newPauseState = !loopState.isPaused;
      loopState.setPaused(newPauseState);
      // Update button text based on the new state
      this.textContent = newPauseState ? 'Resume' : 'Pause';
    });

    // Restart button
    attachButtonHandler('toggle-restart', function () {
      console.log('Restart button clicked');
      try {
        // Reset the loop state
        loopState._resetLoop();

        // Reset progress on all actions in the queue
        document.querySelectorAll('.action-progress-bar').forEach((bar) => {
          bar.style.width = '0%';
        });

        // Reset all action status indicators
        document.querySelectorAll('.action-status').forEach((status) => {
          status.textContent = 'Pending';
          status.className = 'action-status pending';
        });

        // Move all actions back to the beginning of the queue in original order
        loopState.restartQueueFromBeginning();

        // Reset all action progress values
        document.querySelectorAll('.action-progress-value').forEach((value) => {
          const actionItem = value.closest('.action-item');
          if (actionItem) {
            const actionId = actionItem.id.replace('action-', '');
            const action = loopState.actionQueue.find((a) => a.id === actionId);
            if (action) {
              const actionCost = self._estimateActionCost(action);
              // Find action index for the "X of Y" text
              const actionIndex = loopState.actionQueue.findIndex(
                (a) => a.id === actionId
              );
              const displayIndex = actionIndex !== -1 ? actionIndex + 1 : '?';
              value.textContent = `0/${actionCost}, Action ${displayIndex} of ${loopState.actionQueue.length}`;
            }
          }
        });

        // If currently paused, resume processing
        if (loopState.isPaused) {
          loopState.setPaused(false);
          const pauseBtn = document.getElementById('toggle-pause');
          if (pauseBtn) {
            pauseBtn.textContent = 'Pause';
          }
        }
      } catch (error) {
        console.error('Error during restart:', error);
      }
    });

    // Auto-restart toggle button
    attachButtonHandler('toggle-auto-restart', function () {
      const newState = !loopState.autoRestartQueue;
      loopState.setAutoRestartQueue(newState);
      this.textContent = newState
        ? 'Restart when queue complete'
        : 'Pause when queue complete';
    });

    // Game speed slider
    const speedSlider = document.getElementById('game-speed');
    const speedValue = document.getElementById('speed-value');
    if (speedSlider && speedValue) {
      // Remove existing listeners by cloning
      const newSpeedSlider = speedSlider.cloneNode(true);
      speedSlider.parentNode.replaceChild(newSpeedSlider, speedSlider);

      // Set max speed to 100x
      newSpeedSlider.max = 100;

      // Set initial value based on loopState
      newSpeedSlider.value = loopState.gameSpeed;
      speedValue.textContent = `${loopState.gameSpeed.toFixed(1)}x`;

      // Add event listener
      newSpeedSlider.addEventListener('input', () => {
        const speed = parseFloat(newSpeedSlider.value);
        loopState.setGameSpeed(speed);
        speedValue.textContent = `${speed.toFixed(1)}x`;
      });
    }

    // Expand/collapse all button
    attachButtonHandler('loop-expand-collapse-all', function () {
      console.log('Expand/collapse button clicked:', this.textContent);
      if (this.textContent === 'Expand All') {
        console.log('Expanding all regions');
        self.expandAllRegions();
      } else {
        console.log('Collapsing all regions');
        self.collapseAllRegions();
      }
    });

    // Look for possible header expand button as well
    const headerExpandCollapseBtn = document.querySelector(
      '.loop-controls #loop-expand-collapse-all'
    );
    if (headerExpandCollapseBtn) {
      // Clear any existing handlers
      const newHeaderBtn = headerExpandCollapseBtn.cloneNode(true);
      headerExpandCollapseBtn.parentNode.replaceChild(
        newHeaderBtn,
        headerExpandCollapseBtn
      );

      // Add a simple click handler
      newHeaderBtn.addEventListener('click', function () {
        if (this.textContent === 'Expand All') {
          self.expandAllRegions();
        } else {
          self.collapseAllRegions();
        }
      });
    }

    // Store the instance globally for direct access from event handlers
    window.loopUIInstance = this;

    // Clear queue button
    attachButtonHandler('loop-clear-queue', function () {
      // Completely reset the queue
      loopState.actionQueue = [];
      loopState.currentAction = null;
      loopState.currentActionIndex = 0;
      loopState.isProcessing = false;

      // Refill mana to maximum
      loopState.currentMana = loopState.maxMana;

      // Clear regions in queue
      self.regionsInQueue.clear();

      // Clear the action progress bar under the mana bar
      const actionContainer = document.getElementById(
        'current-action-container'
      );
      if (actionContainer) {
        actionContainer.innerHTML = `<div class="no-action-message">No action in progress</div>`;
      }

      // Clear the header progress bar
      const headerProgressBar = document.getElementById(
        'header-action-progress-bar'
      );
      const headerProgressText = document.getElementById(
        'header-action-progress-text'
      );
      if (headerProgressBar && headerProgressText) {
        headerProgressBar.style.width = '0%';
        headerProgressText.textContent = '';
      }

      // Update mana display
      self._updateManaDisplay(loopState.currentMana, loopState.maxMana);

      // Notify queue updated
      eventBus.publish('loopState:queueUpdated', {
        queue: loopState.actionQueue,
      });

      // Force re-render
      self.renderLoopPanel();
    });

    // Save state button
    attachButtonHandler('loop-save-state', function () {
      loopState.saveToStorage();
      if (window.consoleManager) {
        window.consoleManager.print('Game saved!', 'success');
      } else {
        alert('Game saved!');
      }
    });

    // Export button
    attachButtonHandler('loop-export-state', function () {
      self._exportState();
    });

    // Import button & file input
    const importBtn = document.getElementById('loop-import-state');
    const fileInput = document.getElementById('loop-state-import');
    if (importBtn && fileInput) {
      // Remove existing listeners
      const newImportBtn = importBtn.cloneNode(true);
      importBtn.parentNode.replaceChild(newImportBtn, importBtn);

      const newFileInput = fileInput.cloneNode(true);
      fileInput.parentNode.replaceChild(newFileInput, fileInput);

      newImportBtn.addEventListener('click', () => {
        newFileInput.click();
      });

      newFileInput.addEventListener('change', (event) => {
        self._importState(event.target.files[0]);
      });
    }

    // Hard Reset button
    attachButtonHandler('loop-hard-reset', function () {
      // Show a confirmation dialog
      if (
        confirm(
          'Are you sure you want to hard reset? This will clear all progress, discovery, and XP data.'
        )
      ) {
        // Clear all loop state
        loopState.discoveredRegions = new Set(['Menu']);
        loopState.discoveredLocations = new Set();
        loopState.discoveredExits = new Map();
        loopState.discoveredExits.set('Menu', new Set());
        loopState.regionXP = new Map();
        loopState.actionQueue = [];
        loopState.currentAction = null;
        loopState.currentActionIndex = 0;
        loopState.currentMana = loopState.maxMana;
        loopState.isProcessing = false;

        // Re-initialize discoverable data
        loopState._initializeDiscoverableData();

        // Save the reset state to storage
        loopState.saveToStorage();

        // Re-render the UI
        self.renderLoopPanel();

        // Show a message to the user
        if (window.consoleManager) {
          window.consoleManager.print('Game has been hard reset!', 'warning');
        }
      }
    });

    //console.log('All control event listeners attached');
  }

  /**
   * Update the display for the current action progress, fixed at the top
   * @param {Object} action - The current action
   */
  _updateCurrentActionDisplay(action) {
    if (!action) return;

    const actionContainer = document.getElementById('current-action-container');
    if (!actionContainer) return;

    // Calculate cost
    const actionCost = this._estimateActionCost(action);
    const manaCostSoFar = (action.progress / 100) * actionCost;

    // Get the action index directly from loopState
    const displayIndex = loopState.currentActionIndex + 1; // 1-based for display

    // Generate action name for display
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

    // Create the current action display
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

    // --- Update title and header text based on loop mode state ---
    const headerTextElement = document.getElementById('header-text');
    if (this.isLoopModeActive) {
      const spacedLoopsTitle = 'Archipelago Loops'.split('').join(' ');
      const loopsTitleHtml = 'A r c h i p e l a g o &nbsp; L o o p s'; // Use &nbsp; for the main space
      document.title = 'Archipelago Loops';
      if (headerTextElement) {
        headerTextElement.innerHTML = loopsTitleHtml; // Use innerHTML for &nbsp;
      }
    } else {
      const spacedJsonTitle = 'JSON Web Client'.split('').join(' ');
      const jsonTitleHtml = 'J S O N &nbsp; W e b &nbsp; C l i e n t'; // Use &nbsp; for the main space
      document.title = 'JSON Web Client';
      if (headerTextElement) {
        headerTextElement.innerHTML = jsonTitleHtml; // Use innerHTML for &nbsp;
      }
    }
    // --- End Update ---

    // Update button appearance and other UI elements
    const toggleBtn = document.getElementById('toggle-loop-mode');
    if (toggleBtn) {
      toggleBtn.textContent = this.isLoopModeActive
        ? 'Exit Loop Mode'
        : 'Enter Loop Mode';
    }

    // Update pause button state
    const pauseBtn = document.getElementById('toggle-pause');
    if (pauseBtn) {
      pauseBtn.disabled = !this.isLoopModeActive;
    }

    // Update restart button state
    const restartBtn = document.getElementById('toggle-restart');
    if (restartBtn) {
      restartBtn.disabled = !this.isLoopModeActive;
    }

    // Update auto-restart button state
    const autoRestartBtn = document.getElementById('toggle-auto-restart');
    if (autoRestartBtn) {
      autoRestartBtn.disabled = !this.isLoopModeActive;
    }

    // Hide/Show Load JSON and Show Debug buttons
    const loadJsonBtn = document.querySelector('label[for="json-upload"]');
    const debugToggleBtn = document.getElementById('debug-toggle');

    if (loadJsonBtn) {
      loadJsonBtn.style.display = this.isLoopModeActive
        ? 'none'
        : 'inline-block';
    }

    if (debugToggleBtn) {
      debugToggleBtn.style.display = this.isLoopModeActive
        ? 'none'
        : 'inline-block';
    }

    // Show/hide the loop status display in header
    const headerStatusDisplay = document.querySelector('.loop-status-display');
    if (headerStatusDisplay) {
      headerStatusDisplay.style.display = this.isLoopModeActive
        ? 'flex'
        : 'none';

      // If entering loop mode, update the header mana bar
      if (this.isLoopModeActive) {
        const headerManaBar = document.getElementById('header-mana-bar');
        if (headerManaBar) {
          const percentage = Math.max(
            0,
            Math.min(100, (loopState.currentMana / loopState.maxMana) * 100)
          );
          headerManaBar.style.width = `${percentage}%`;
          headerManaBar.innerHTML = `<span class="mana-text">${Math.floor(
            loopState.currentMana
          )}/${loopState.maxMana} Mana</span>`;

          // Add color classes
          headerManaBar.className = 'mana-bar';
          if (percentage < 25) {
            headerManaBar.classList.add('low');
          } else if (percentage < 50) {
            headerManaBar.classList.add('medium');
          } else {
            headerManaBar.classList.add('high');
          }

          // Clear action progress
          const headerProgressBar = document.getElementById(
            'header-action-progress-bar'
          );
          const headerProgressText = document.getElementById(
            'header-action-progress-text'
          );
          if (headerProgressBar && headerProgressText) {
            headerProgressBar.style.width = '0%';
            headerProgressText.textContent = '';
          }
        }
      }
    }

    // Toggle visibility of the "Show Explored" checkbox based on Loop Mode
    const showExploredCheckbox = document.getElementById('show-explored');
    if (showExploredCheckbox) {
      showExploredCheckbox.parentElement.style.display = this.isLoopModeActive
        ? 'inline'
        : 'none';
    }

    // Toggle visibility of the "Exit Show Explored" checkbox based on Loop Mode
    const exitShowExploredCheckbox =
      document.getElementById('exit-show-explored');
    if (exitShowExploredCheckbox) {
      exitShowExploredCheckbox.parentElement.style.display = this
        .isLoopModeActive
        ? 'inline'
        : 'none';
    }

    // If entering loop mode, start any queued actions
    if (this.isLoopModeActive) {
      try {
        // Set paused state first
        loopState.setPaused(true);

        // Update all pause buttons to show "Resume"
        const allPauseButtons = document.querySelectorAll(
          'button#toggle-pause'
        );
        allPauseButtons.forEach((btn) => {
          btn.textContent = 'Resume';
          btn.disabled = false; // Make sure the button is enabled
        });

        // Fallback for single pause button
        const pauseBtn = document.getElementById('toggle-pause');
        if (pauseBtn && !allPauseButtons.length) {
          pauseBtn.textContent = 'Resume';
          pauseBtn.disabled = false;
        }

        console.log('Entered loop mode in paused state');
      } catch (error) {
        console.error('Error initializing loop mode:', error);
        if (window.consoleManager) {
          window.consoleManager.print('Error initializing loop mode.', 'error');
        }
      }
    }

    // If exiting loop mode, pause any active actions
    if (!this.isLoopModeActive && loopState.isProcessing) {
      loopState.setPaused(true);

      // Update all pause buttons
      const allPauseButtons = document.querySelectorAll('button#toggle-pause');
      allPauseButtons.forEach((btn) => {
        btn.textContent = 'Resume';
      });

      // Fallback
      const pauseBtn = document.getElementById('toggle-pause');
      if (pauseBtn && !allPauseButtons.length) {
        pauseBtn.textContent = 'Resume';
      }
    }

    const filesPanel = document.getElementById('files-panel');
    const testCasesPanel = document.getElementById('test-cases-panel');
    const presetsPanel = document.getElementById('presets-panel');

    if (this.isLoopModeActive) {
      // Disable file panels when entering loop mode
      if (filesPanel) {
        filesPanel.classList.add('loop-mode-disabled');
      }

      // Add a notice to the files panel
      const disabledMessage = document.createElement('div');
      disabledMessage.className = 'loop-mode-disabled-message';
      disabledMessage.textContent =
        'The Files panel is disabled while Loop Mode is active.';

      if (testCasesPanel) {
        testCasesPanel.innerHTML = ''; // Clear previous content
        testCasesPanel.appendChild(disabledMessage.cloneNode(true));
      }

      if (presetsPanel) {
        presetsPanel.innerHTML = ''; // Clear previous content
        presetsPanel.appendChild(disabledMessage.cloneNode(true));
      }
    } else {
      // Re-enable file panels when exiting loop mode
      if (filesPanel) {
        filesPanel.classList.remove('loop-mode-disabled');
      }

      // Restore BOTH panel structures
      if (testCasesPanel) {
        const message = testCasesPanel.querySelector(
          '.loop-mode-disabled-message'
        );
        if (message) message.remove();
        // Ensure the inner container exists
        if (!testCasesPanel.querySelector('#test-cases-list')) {
          testCasesPanel.innerHTML = '<div id="test-cases-list"></div>';
        }
      }

      if (presetsPanel) {
        const message = presetsPanel.querySelector(
          '.loop-mode-disabled-message'
        );
        if (message) message.remove();
        // Ensure the inner container exists
        if (!presetsPanel.querySelector('#presets-list')) {
          presetsPanel.innerHTML = '<div id="presets-list"></div>';
        }
      }

      // Now, render content ONLY for the ACTIVE view
      if (
        this.gameUI &&
        this.gameUI.testCaseUI &&
        this.gameUI.currentFileView === 'test-cases'
      ) {
        if (this.gameUI.testCaseUI.currentTestSet) {
          this.gameUI.testCaseUI.renderTestCasesList();
        } else {
          this.gameUI.testCaseUI.renderTestSetSelector();
        }
      } else if (
        this.gameUI &&
        this.gameUI.presetUI &&
        this.gameUI.currentFileView === 'presets'
      ) {
        if (
          this.gameUI.presetUI.currentGame &&
          this.gameUI.presetUI.currentPreset
        ) {
          this.gameUI.presetUI.loadPreset(
            this.gameUI.presetUI.currentGame,
            this.gameUI.presetUI.currentPreset
          );
        } else {
          this.gameUI.presetUI.renderGamesList();
        }
      }
    }

    // Notify other UI components about loop mode change
    eventBus.publish('loopUI:modeChanged', { active: this.isLoopModeActive });

    // Update all UI components
    if (this.gameUI) {
      if (this.gameUI.locationUI) {
        this.gameUI.locationUI.updateLocationDisplay();
      }

      if (this.gameUI.exitUI) {
        this.gameUI.exitUI.updateExitDisplay();
      }

      if (this.gameUI.regionUI) {
        this.gameUI.regionUI.renderAllRegions();
      }
    }

    console.log(
      `Loop mode ${this.isLoopModeActive ? 'activated' : 'deactivated'}`
    );

    // Only render the panel once at the end
    this.renderLoopPanel();
  }

  /**
   * Clear the loop UI
   */
  clear() {
    const container = document.getElementById('loop-panel');
    if (container) {
      container.innerHTML = '';
    }

    this.expandedRegions = new Set();
    this.expandedRegions.add('Menu'); // Always start with Menu expanded
    this.regionsInQueue = new Set();
  }

  /**
   * Update the mana display
   * @param {number} current - Current mana
   * @param {number} max - Maximum mana
   */
  _updateManaDisplay(current, max) {
    // Use requestAnimationFrame to ensure the DOM updates happen in the next paint cycle
    requestAnimationFrame(() => {
      // Update the main mana bar
      const manaBar = document.getElementById('mana-bar');
      const manaValue = document.getElementById('mana-value');

      // Update the header mana bar - directly, not through the updateBar function
      const headerManaBar = document.getElementById('header-mana-bar');

      const percentage = Math.max(0, Math.min(100, (current / max) * 100));

      // First update the header mana bar directly
      if (headerManaBar) {
        // Remove the transition temporarily
        headerManaBar.style.transition = 'none';
        // Force a reflow
        void headerManaBar.offsetWidth;
        // Restore the transition
        headerManaBar.style.transition = 'width 0.1s linear';
        // Update the width for animation
        headerManaBar.style.width = `${percentage}%`;

        // Add color classes based on percentage
        headerManaBar.className = 'mana-bar';
        if (percentage < 25) {
          headerManaBar.classList.add('low');
        } else if (percentage < 50) {
          headerManaBar.classList.add('medium');
        } else {
          headerManaBar.classList.add('high');
        }

        // Put the text directly inside the mana-bar element for header
        headerManaBar.innerHTML = `<span class="mana-text">${Math.floor(
          current
        )}/${max} Mana</span>`;

        // Log for debugging
        //console.log(`Updated header mana bar: ${Math.floor(current)}/${max} Mana`);
      }

      // Function to update the main mana bar
      const updateMainBar = (bar, value) => {
        if (!bar || !value) return;

        // Remove the transition temporarily
        bar.style.transition = 'none';
        // Force a reflow
        void bar.offsetWidth;
        // Restore the transition
        bar.style.transition = 'width 0.1s linear';
        // Update the width for animation
        bar.style.width = `${percentage}%`;

        // Add color classes based on percentage
        bar.className = 'mana-bar';
        if (percentage < 25) {
          bar.classList.add('low');
        } else if (percentage < 50) {
          bar.classList.add('medium');
        } else {
          bar.classList.add('high');
        }

        // Update the regular mana display text
        value.textContent = `${Math.floor(current)} of ${max} Mana Remaining`;
      };

      // Update the main mana bar
      updateMainBar(manaBar, manaValue);
    });
  }

  /**
   * Update the pause button text to reflect the current state
   * @param {boolean} isPaused - Whether the system is currently paused
   */
  _updatePauseButtonState(isPaused) {
    const pauseBtn = document.getElementById('toggle-pause');
    if (pauseBtn) {
      pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
    }
  }

  /**
   * Update an action's progress display
   * @param {Object} action - The action being processed
   */
  _updateActionProgress(action) {
    if (!action) return;

    // Use requestAnimationFrame to ensure the DOM updates happen in the next paint cycle
    requestAnimationFrame(() => {
      try {
        // Find by valid ID selector
        const actionElement = document.getElementById(`action-${action.id}`);

        // Also update the header action progress bar
        const headerProgressBar = document.getElementById(
          'header-action-progress-bar'
        );
        const headerProgressText = document.getElementById(
          'header-action-progress-text'
        );

        // Update header action progress regardless of whether the individual action element exists
        if (
          headerProgressBar &&
          headerProgressText &&
          action === loopState.currentAction
        ) {
          // Calculate action cost and progress
          const actionCost = this._estimateActionCost(action);
          const manaCostSoFar = Math.floor(
            (action.progress / 100) * actionCost
          );

          // Update header progress bar
          headerProgressBar.style.width = `${action.progress}%`;

          // Generate action name for display
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

          // Calculate the action position in the queue
          const currentIndex = loopState.currentActionIndex + 1; // 1-based for display
          const totalActions = loopState.actionQueue.length;

          // Update header progress text with action number
          headerProgressText.textContent = `${currentIndex} of ${totalActions}: ${actionName}: ${manaCostSoFar}/${actionCost} mana`;
        } else if (
          headerProgressBar &&
          headerProgressText &&
          !loopState.currentAction
        ) {
          // No current action, clear the header progress
          headerProgressBar.style.width = '0%';
          headerProgressText.textContent = '';
        }

        // Skip the rest if the individual action element doesn't exist
        if (!actionElement) {
          // Element not found, possibly because the panel was re-rendered
          return;
        }

        const progressBar = actionElement.querySelector('.action-progress-bar');
        const progressValue = actionElement.querySelector(
          '.action-progress-value'
        );
        const statusElement = actionElement.querySelector('.action-status');

        if (progressBar) {
          // Remove the transition temporarily
          progressBar.style.transition = 'none';
          // Force a reflow
          void progressBar.offsetWidth;
          // Restore the transition
          progressBar.style.transition = 'width 0.1s linear';
          // Update the width for animation
          progressBar.style.width = `${action.progress}%`;
        }

        // Update progress value with mana cost
        if (progressValue) {
          const actionCost = this._estimateActionCost(action);
          const manaCostSoFar = Math.floor(
            (action.progress / 100) * actionCost
          );

          // Use the provided action's index or determine it from the queue
          let displayIndex;
          if (action === loopState.currentAction) {
            // For the current action, use the tracked index
            displayIndex = loopState.currentActionIndex + 1; // 1-based for display
          } else {
            // For other actions, find their position in the queue
            const actionIndex = loopState.actionQueue.findIndex(
              (a) => a.id === action.id
            );
            displayIndex = actionIndex !== -1 ? actionIndex + 1 : '?';
          }

          progressValue.textContent = `Action ${displayIndex} of ${loopState.actionQueue.length}, Progress: ${manaCostSoFar} of ${actionCost} mana`;
        }

        // Only mark as active if this is the currently processing action
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
            // Reset if this was active but is no longer the current action
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
    console.log('Expanding all regions');
    const discoveredRegions = loopState.discoveredRegions;
    //console.log('Discovered regions:', [...discoveredRegions]);

    // Make sure we're getting a Set and not undefined
    if (!discoveredRegions || typeof discoveredRegions.forEach !== 'function') {
      console.error('discoveredRegions is not a valid Set:', discoveredRegions);
      return;
    }

    discoveredRegions.forEach((regionName) => {
      //console.log('Adding region to expanded set:', regionName);
      this.expandedRegions.add(regionName);
    });

    //console.log('Expanded regions after update:', [...this.expandedRegions]);

    // Update both possible buttons that might exist
    const loopExpandCollapseBtn = document.getElementById(
      'loop-expand-collapse-all'
    );
    if (loopExpandCollapseBtn) {
      loopExpandCollapseBtn.textContent = 'Collapse All';
    }

    // The one in the header might also need updating
    const headerExpandCollapseBtn = document.querySelector(
      '.loop-controls #loop-expand-collapse-all'
    );
    if (headerExpandCollapseBtn) {
      headerExpandCollapseBtn.textContent = 'Collapse All';
    }

    // Render the panel to apply changes
    this.renderLoopPanel();
  }

  /**
   * Collapse all regions
   */
  collapseAllRegions() {
    console.log('Collapsing all regions');
    this.expandedRegions.clear();

    // Update both possible buttons that might exist
    const loopExpandCollapseBtn = document.getElementById(
      'loop-expand-collapse-all'
    );
    if (loopExpandCollapseBtn) {
      loopExpandCollapseBtn.textContent = 'Expand All';
    }

    // The one in the header might also need updating
    const headerExpandCollapseBtn = document.querySelector(
      '.loop-controls #loop-expand-collapse-all'
    );
    if (headerExpandCollapseBtn) {
      headerExpandCollapseBtn.textContent = 'Expand All';
    }

    // Render the panel to apply changes
    this.renderLoopPanel();
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
    //console.log('Rendering complete loop panel');
    const container = document.getElementById('loop-regions-area');
    if (!container) {
      console.error('Container loop-regions-area not found');
      return;
    }

    // Clear container
    container.innerHTML = '';
    //console.log('Container cleared');

    // Get all discovered regions
    const discoveredRegions = loopState.discoveredRegions;
    //console.log('Discovered regions:', [...discoveredRegions]);

    // Get regions that have actions in the queue
    //console.log('Regions in queue:', [...this.regionsInQueue]);

    // If no regions yet, show a message
    if (discoveredRegions.size === 0) {
      //console.log('No regions to display');
      container.innerHTML =
        '<div class="no-regions-message">No regions discovered yet.</div>';
      return;
    }

    // Create a container for regions
    const regionsContainer = document.createElement('div');
    regionsContainer.id = 'regions-container';
    regionsContainer.className = 'regions-container';
    container.appendChild(regionsContainer);

    // Add each discovered region to the regions container, but only if it's in the queue
    // Only show discovered regions when loop mode is active
    discoveredRegions.forEach((regionName) => {
      const region = stateManager.regions[regionName];
      if (!region) return;

      // Only show regions that are in the action queue, unless it's the Menu
      const showRegion =
        regionName === 'Menu' || this.regionsInQueue.has(regionName);

      if (showRegion) {
        const isExpanded = this.expandedRegions.has(regionName);
        //console.log(
        //  `Building block for region ${regionName}, expanded: ${isExpanded}`
        //);
        const regionBlock = this._buildRegionBlock(region, isExpanded);
        regionsContainer.appendChild(regionBlock);
      }
    });

    // Update mana display in both locations
    this._updateManaDisplay(loopState.currentMana, loopState.maxMana);

    // Update current action display if applicable
    if (loopState.currentAction) {
      this._updateCurrentActionDisplay(loopState.currentAction);
    } else {
      const actionContainer = document.getElementById(
        'current-action-container'
      );
      if (actionContainer) {
        actionContainer.innerHTML = `<div class="no-action-message">No action in progress</div>`;
      }

      // Clear the header action progress bar if no current action
      const headerProgressBar = document.getElementById(
        'header-action-progress-bar'
      );
      const headerProgressText = document.getElementById(
        'header-action-progress-text'
      );
      if (headerProgressBar && headerProgressText) {
        headerProgressBar.style.width = '0%';
        headerProgressText.textContent = '';
      }
    }

    // If loop mode is active, make sure file panels are disabled
    if (this.isLoopModeActive) {
      // Make sure file panels are disabled
      const filesPanel = document.getElementById('files-panel');
      if (filesPanel) {
        filesPanel.classList.add('loop-mode-disabled');
      }

      // Add a notice to the files panel
      const testCasesPanel = document.getElementById('test-cases-panel');
      const presetsPanel = document.getElementById('presets-panel');

      const disabledMessage = document.createElement('div');
      disabledMessage.className = 'loop-mode-disabled-message';
      disabledMessage.textContent =
        'The Files panel is disabled while Loop Mode is active.';

      if (testCasesPanel) {
        testCasesPanel.innerHTML = '';
        testCasesPanel.appendChild(disabledMessage.cloneNode(true));
      }

      if (presetsPanel) {
        presetsPanel.innerHTML = '';
        presetsPanel.appendChild(disabledMessage.cloneNode(true));
      }
    }
  }

  /**
   * Build a region block
   * @param {Object} region - Region data
   * @param {boolean} expanded - Whether the region is expanded
   * @returns {HTMLElement} - The region block element
   */
  _buildRegionBlock(region, expanded) {
    if (!region) return document.createElement('div');

    const regionName = region.name;
    const regionBlock = document.createElement('div');
    regionBlock.className = 'loop-region-block';
    regionBlock.dataset.region = regionName;
    regionBlock.classList.add(expanded ? 'expanded' : 'collapsed');

    // Get XP data for the region
    const xpData = loopState.getRegionXP(regionName);

    // Calculate the action speed/efficiency bonus (5% per level)
    const speedBonus = xpData.level * 5;

    // Calculate discovery stats
    const totalLocations = region.locations ? region.locations.length : 0;
    const totalExits = region.exits ? region.exits.length : 0;

    let discoveredLocationCount = 0;
    if (region.locations) {
      discoveredLocationCount = region.locations.filter((loc) =>
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

    // Calculate XP percentage
    const xpPercentage = (xpData.xp / xpData.xpForNextLevel) * 100;

    // Create header
    const headerEl = document.createElement('div');
    headerEl.className = 'loop-region-header';
    headerEl.innerHTML = `
      <span class="loop-region-name">${regionName}</span>
      <button class="loop-collapse-btn">${
        expanded ? 'Collapse' : 'Expand'
      }</button>
    `;
    regionBlock.appendChild(headerEl);

    // Header click event for expanding/collapsing
    headerEl.addEventListener('click', () => {
      this.toggleRegionExpanded(regionName);
    });

    // Find queued actions for this region
    // Only show moveToRegion actions in their starting region (not destination)
    const actionsForRegion = loopState.actionQueue.filter(
      (action) =>
        action.regionName === regionName ||
        (action.type === 'moveToRegion' &&
          action.destinationRegion === regionName &&
          !action.regionName)
    );

    // If there are queued actions for this region, add them at the top
    if (actionsForRegion.length > 0) {
      const queuedActionsContainer = document.createElement('div');
      queuedActionsContainer.className = 'region-queued-actions';

      actionsForRegion.forEach((action, index) => {
        const actionItem = this._createActionItem(action);
        queuedActionsContainer.appendChild(actionItem);
      });

      regionBlock.appendChild(queuedActionsContainer);
    }

    // If expanded, add details
    if (expanded) {
      const detailEl = document.createElement('div');
      detailEl.className = 'loop-region-details';

      // Add XP display with discount information
      const xpDisplay = document.createElement('div');
      xpDisplay.className = 'region-xp-display';
      xpDisplay.innerHTML = `
        <div class="xp-text">Level ${xpData.level} (${Math.floor(xpData.xp)}/${
        xpData.xpForNextLevel
      } XP) <span class="discount-text">+${speedBonus}% action efficiency</span></div>
        <div class="xp-bar-container">
          <div class="xp-bar" style="width: ${xpPercentage}%"></div>
        </div>
      `;
      detailEl.appendChild(xpDisplay);

      // Add discovery stats
      const discoveryStats = document.createElement('div');
      discoveryStats.className = 'region-discovery-stats';
      discoveryStats.innerHTML = `
        <div>Exploration: <span class="stat-value">${explorationPercentage}%</span></div>
        <div>Locations: <span class="stat-value">${discoveredLocationCount}/${totalLocations}</span></div>
        <div>Exits: <span class="stat-value">${discoveredExitCount}/${totalExits}</span></div>
      `;
      detailEl.appendChild(discoveryStats);

      // Add actions area
      const actionsArea = document.createElement('div');
      actionsArea.className = 'region-actions';

      // Always allow exploring, but with different message if everything is discovered
      if (this.isLoopModeActive) {
        const exploreBtn = document.createElement('button');
        exploreBtn.className = 'explore-btn';
        exploreBtn.textContent =
          discoveredItems < totalItems ? 'Explore Region' : 'Farm Region XP';
        exploreBtn.addEventListener('click', () => {
          this._queueExploreAction(regionName);
        });
        actionsArea.appendChild(exploreBtn);

        // Add repeat explore checkbox - using region-specific ID
        const repeatCheckboxId = `repeat-explore-checkbox-${regionName.replace(
          /\s+/g,
          '-'
        )}`;

        // Create the checkbox container
        const repeatWrapper = document.createElement('div');
        repeatWrapper.className = 'checkbox-container';

        // Create checkbox element separately so we can maintain its state
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = repeatCheckboxId;
        checkbox.className = 'repeat-explore-checkbox';

        // Get state from our map
        checkbox.checked = this.repeatExploreStates.get(regionName) || false;

        // Add event listener to update our map when checkbox state changes
        checkbox.addEventListener('change', (e) => {
          this.repeatExploreStates.set(regionName, e.target.checked);
          //console.log(
          //  `Checkbox for ${regionName} changed to ${e.target.checked}`
          //);
        });

        // Create the label
        const label = document.createElement('label');
        label.htmlFor = repeatCheckboxId;
        label.textContent = 'Repeat Explore Action';

        // Append elements to the wrapper
        repeatWrapper.appendChild(checkbox);
        repeatWrapper.appendChild(label);

        actionsArea.appendChild(repeatWrapper);
      }

      detailEl.appendChild(actionsArea);

      // Add locations container (show all locations in loop mode)
      if (totalLocations > 0) {
        const locationsContainer = document.createElement('div');
        locationsContainer.className = 'loop-region-locations-container';
        locationsContainer.innerHTML = '<h4>Locations</h4>';

        // Add all locations
        this._updateDiscoveredLocations(regionName, locationsContainer);

        detailEl.appendChild(locationsContainer);
      }

      // Add exits container (show all exits in loop mode)
      if (totalExits > 0) {
        const exitsContainer = document.createElement('div');
        exitsContainer.className = 'loop-region-exits-container';
        exitsContainer.innerHTML = '<h4>Exits</h4>';

        // Add all exits
        this._updateDiscoveredExits(regionName, exitsContainer);

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
  _createActionItem(action) {
    const actionDiv = document.createElement('div');
    actionDiv.id = `action-${action.id}`;
    actionDiv.className = 'action-item';

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
   * Set colorblind mode
   * @param {boolean} enabled - Whether colorblind mode is enabled
   */
  setColorblindMode(enabled) {
    this.colorblindMode = enabled;
    this.renderLoopPanel();
  }

  /**
   * Clean up resources when the UI is destroyed
   */
  dispose() {
    if (this._animationFrameId) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }
  }
}

export default LoopUI;
