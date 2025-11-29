// loopUI.js - UI for the Loop mode
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js'; // <<< Re-added import
import loopState from './loopStateSingleton.js';
import eventBus from '../../app/core/eventBus.js';
import commonUI from '../commonUI/index.js';
import panelManagerInstance from '../../app/core/panelManager.js'; // Changed from panelManagerSingleton.js
import discoveryStateSingleton from '../discovery/singleton.js';
import {
  levelFromXP,
  xpForNextLevel,
  proposedLinearFinalCost,
  proposedLinearReduction,
} from './xpFormulas.js';
import settingsManager from '../../app/core/settingsManager.js';
import { centralRegistry } from '../../app/core/centralRegistry.js';
import { DisplaySettingsManager } from './displaySettingsManager.js';
import { ExpansionStateManager } from './expansionStateManager.js';
import { LoopRenderer } from './loopRenderer.js';
import { EventCoordinator } from './eventCoordinator.js';
import { LoopBlockBuilder } from './loopBlockBuilder.js';
import { getPlayerStateAPI, getLoopsModuleDispatcher } from './index.js';
import { createStateSnapshotInterface } from '../shared/stateInterface.js';
import { evaluateRule } from '../shared/ruleEngine.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('loopUI', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[loopUI] ${message}`, ...data);
  }
}

// import { logger } from '../../app/core/logger.js';

export class LoopUI {
  constructor(container, componentState) {
    // MODIFIED: GL constructor
    this.container = container; // ADDED
    this.componentState = componentState; // ADDED

    // UI state
    this.regionsInQueue = new Set(); // Track which regions have actions in the queue
    this.isLoopModeActive = false;
    this.repeatExploreStates = new Map(); // Map to track repeat explore checkbox states per region
    this.settingsUnsubscribe = null; // Add property

    // Animation state
    this._animationFrameId = null;
    this._lastUpdateTime = 0;

    // Initialization state flags
    this.structureBuilt = false; // Track if initial DOM structure is built

    // PlayerState API (will be set during initialization)
    this.playerStateAPI = null;

    // Create the loop block builder for rendering region blocks
    this.loopBlockBuilder = new LoopBlockBuilder(this);

    // Create managers
    this.displaySettings = new DisplaySettingsManager(settingsManager, null); // rootElement will be set later
    this.expansionState = new ExpansionStateManager();
    this.loopRenderer = null; // Will be initialized after rootElement is created

    // --- Create root element ---
    this.rootElement = this.createRootElement(); // Create root element
    this.loopRegionsArea = this.rootElement.querySelector('#loop-regions-area'); // Cache reference
    this.loopControlsContainer = this.rootElement.querySelector(
      '.loop-controls-area'
    ); // Cache controls container
    this.loopTopControlsContainer =
      this.rootElement.querySelector('.loop-controls'); // Cache TOP controls container

    this.container.element.appendChild(this.rootElement); // ADDED: Append to GL container

    // Set rootElement for DisplaySettingsManager now that it's created
    this.displaySettings.rootElement = this.rootElement;

    // Initialize LoopRenderer with callback to loopBlockBuilder.buildRegionBlock
    this.loopRenderer = new LoopRenderer(
      this.expansionState,
      this.displaySettings,
      this.rootElement,
      this.loopBlockBuilder.buildRegionBlock.bind(this.loopBlockBuilder),
      this // Pass loopUI instance for accessing structureBuilt flag
    );

    // Initialize EventCoordinator
    this.eventCoordinator = new EventCoordinator(eventBus, this);

    // --- Moved Listener Attachment ---
    // Event listener attachment is now deferred to attachInternalListeners()
    // _attachControlEventListeners() is renamed and moved

    // Attach event listeners for loop state changes
    this.subscribeToEvents();
    this.subscribeToSettings(); // Subscribe to settings

    // Set up animation frame for continuous UI updates
    this._startAnimationLoop();

    // Defer full initialization until app is ready
    const readyHandler = (eventPayload) => {
      log('info', 
        '[LoopUI] Received app:readyForUiDataLoad. Initializing panel.'
      );
      this.initialize(); // This will call buildInitialStructure and attachInternalListeners
      eventBus.unsubscribe('app:readyForUiDataLoad', readyHandler);
    };
    eventBus.subscribe('app:readyForUiDataLoad', readyHandler, 'loops');

    this.container.on('destroy', () => {
      // ADDED: Ensure cleanup
      this.onPanelDestroy();
    });
  }

  // <<< Add Subscription Logic >>>
  subscribeToSettings() {
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
    }
    this.settingsUnsubscribe = eventBus.subscribe(
      'settings:changed',
      ({ key, value }) => {
        // Delegate to DisplaySettingsManager
        const settingsUpdated = this.displaySettings.handleSettingsChanged({ key, value });
        if (settingsUpdated) {
          log('info', 'LoopUI reacting to settings change:', key);
          this.renderLoopPanel(); // Re-render panel when setting changes
        }
      }
    , 'loops');
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
    log('info', 'LoopUI: Attaching internal listeners...');
    if (!this.rootElement) {
      log('error', 'LoopUI: Cannot attach listeners, rootElement is missing.');
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
        log('warn', 
          `LoopUI: Button with ID #${buttonId} not found in rootElement.`
        );
      }
      return null;
    };

    // --- Attach Listeners using NEW IDs ---
    attachButtonHandler('loop-ui-toggle-loop-mode', () => {
      // Always use the event for consistency
      eventBus.publish('loops:setLoopMode', { action: 'toggle' }, 'loops');
    });

    attachButtonHandler('loop-ui-toggle-pause', function () {
      const newPauseState = !loopState.isPaused;
      loopState.setPaused(newPauseState);
      this._updatePauseButtonState(newPauseState); // Update button state locally
    });

    attachButtonHandler('loop-ui-toggle-restart', this._handleRestartClick);

    attachButtonHandler('loop-ui-toggle-auto-restart', async function () {
      const newState = !loopState.autoRestartQueue;
      loopState.setAutoRestartQueue(newState);
      const button = querySelector('#loop-ui-toggle-auto-restart');
      if (button) {
        button.textContent = newState
          ? 'Restart when queue complete'
          : 'Pause when queue complete';
      }
      // Persist auto-restart setting via DisplaySettingsManager
      await this.displaySettings.setSetting('autoRestart', newState, true);
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
      log('warn', 'LoopUI: Import label/button or file input not found.');
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
      newSpeedSlider.addEventListener('input', async () => {
        const speed = parseFloat(newSpeedSlider.value);
        loopState.setGameSpeed(speed);
        speedValueSpan.textContent = `${speed.toFixed(1)}x`;
        // Persist speed setting via DisplaySettingsManager
        await this.displaySettings.setSetting('defaultSpeed', speed, true);
      });
    } else {
      log('warn', 'LoopUI: Speed slider or value span not found.');
    }

    log('info', 'LoopUI: Internal listeners attached.');
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
          const actionQueue = this.getActionQueue();
          const action = actionQueue.find((a) => a.id === actionId);
          if (action) {
            const actionCost = this._estimateActionCost(action);
            const actionQueue = this.getActionQueue();
            const actionIndex = actionQueue.findIndex(
              (a) => a.id === actionId
            );
            const displayIndex = actionIndex !== -1 ? actionIndex + 1 : '?';
            value.textContent = `0/${actionCost}, Action ${displayIndex} of ${actionQueue.length}`;
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
      log('error', 'Error during restart:', error);
    }
  }

  _handleClearQueueClick() {
    // Use playerState API to trim the path to just the initial Menu
    if (this.playerStateAPI?.trimPath) {
      this.playerStateAPI.trimPath(1); // Keep only the first entry (Menu)
    }
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
      queue: this.getActionQueue(),
    }, 'loops');
    this.renderLoopPanel();
  }

  _handleSaveStateClick() {
    loopState.saveToStorage();
    // Use console.info instead of window.consoleManager
    console.info('Game saved!');
  }

  _handleHardResetClick() {
    if (
      confirm(
        'Are you sure you want to hard reset? This will clear all progress, discovery, and XP data.'
      )
    ) {
      // Reset loopState properties
      loopState.regionXP = new Map();
      // Clear the action queue using playerState API
      if (this.playerStateAPI?.trimPath) {
        this.playerStateAPI.trimPath(1); // Keep only Menu
      }
      loopState.currentAction = null;
      loopState.currentActionIndex = 0;
      loopState.currentMana = loopState.maxMana;
      loopState.isProcessing = false;

      // ADDED: Clear discovery state via its singleton
      discoveryStateSingleton.clearDiscovery();

      // Save the reset loop state (without discovery data)
      loopState.saveToStorage();

      // Clear UI specific states
      this.expansionState.clear();
      this.expansionState.setRegionExpanded('Menu', true); // Keep menu expanded
      this.regionsInQueue.clear();
      // REMOVED: this.repeatExploreStates.clear(); - Now handled by LoopState
      // Render the panel
      this.renderLoopPanel();
      // Use console.warn instead of window.consoleManager
      log('warn', 'Game has been hard reset!');
    }
  }

  getRootElement() {
    return this.rootElement;
  }

  /**
   * Get the loopState singleton instance
   * Helper method for EventCoordinator
   * @returns {Object} loopState instance
   */
  getLoopState() {
    return loopState;
  }

  /**
   * Get the panelManager instance
   * Helper method for EventCoordinator
   * @returns {Object} panelManager instance or null
   */
  getPanelManager() {
    return panelManagerInstance;
  }

  /**
   * Start a continuous animation loop for UI updates
   * NOTE: Most updates are now event-driven. This is kept minimal for any remaining continuous updates.
   */
  _startAnimationLoop() {
    // Currently all updates are event-driven, so we don't need a continuous loop
    // Keeping this method in case we need to add continuous updates later
    log('info', '[LoopUI] Animation loop not started - all updates are event-driven');
  }

  /**
   * Initialize the loop UI
   */
  async initialize() {
    log('info', '[LoopUI] Initializing LoopUI panel content...'); // Added log

    // Initialize DisplaySettingsManager
    await this.displaySettings.initialize();
    log('info', '[LoopUI] DisplaySettingsManager initialized');

    // Sync persisted settings to loopState
    const defaultSpeed = this.displaySettings.getSetting('defaultSpeed');
    const autoRestart = this.displaySettings.getSetting('autoRestart');
    if (defaultSpeed !== undefined) {
      loopState.setGameSpeed(defaultSpeed);
    }
    if (autoRestart !== undefined) {
      loopState.setAutoRestartQueue(autoRestart);
    }

    // Get and set the playerState API
    const playerStateAPI = getPlayerStateAPI();
    if (playerStateAPI) {
      this.setPlayerStateAPI(playerStateAPI);
      log('info', '[LoopUI] PlayerState API retrieved and set', playerStateAPI);
      // Test if we can get the path
      if (playerStateAPI.getPath) {
        const testPath = playerStateAPI.getPath();
        log('info', '[LoopUI] Test path retrieval:', testPath);
      }
    } else {
      log('warn', '[LoopUI] PlayerState API not available during initialization - will retry later');
    }

    this.buildInitialStructure();
    this.attachInternalListeners(); // Attach listeners for the newly built structure

    // Check if we should automatically enter loop mode based on settings
    const loopModeEnabled = this.displaySettings.getSetting('loopModeEnabled');
    log('info', `[LoopUI] loopModeEnabled setting value: ${loopModeEnabled}, isLoopModeActive: ${this.isLoopModeActive}`);
    if (loopModeEnabled && !this.isLoopModeActive) {
      log('info', '[LoopUI] Auto-entering loop mode based on loopModeEnabled setting');
      eventBus.publish('loops:setLoopMode', { action: 'enable' }, 'loops');
    }
  }

  /**
   * Build the initial DOM structure for the loop UI panel.
   * Should be called once by PanelManager after the root element is attached.
   */
  buildInitialStructure() {
    log('info', 'LoopUI: Building initial structure (ensuring areas exist)');
    // This method might become simpler if createRootElement and attachInternalListeners
    // handle most of the setup. Ensure essential containers exist.

    const container = this.rootElement; // Use the root element property
    if (!container) {
      log('error', 'Loop panel container (rootElement) not found or not set');
      return;
    }

    // Ensure essential areas exist (created in createRootElement)
    if (!container.querySelector('#loop-fixed-area')) {
      log('error', 'LoopUI: #loop-fixed-area missing in rootElement');
    }
    if (!container.querySelector('#loop-regions-area')) {
      log('error', 'LoopUI: #loop-regions-area missing in rootElement');
    }
    if (!container.querySelector('.loop-controls-area')) {
      log('error', 'LoopUI: .loop-controls-area missing in rootElement');
    }
    if (!container.querySelector('.loop-controls')) {
      log('error', 'LoopUI: .loop-controls (top) missing in rootElement');
    }

    // Cache references to key elements if not already done in constructor
    this.actionQueueContainer = container.querySelector(
      '#current-action-container'
    ); // May not exist yet in fixed-area
    this.loopRegionsArea = container.querySelector('#loop-regions-area');

    // Initialize fixed area content (Mana bar, current action)
    this._initializeFixedArea();

    // Set initial button states based on loopState
    this._updatePauseButtonState(loopState.isPaused);

    // Update auto-restart button state
    const autoRestartBtn = this.rootElement.querySelector('#loop-ui-toggle-auto-restart');
    if (autoRestartBtn) {
      autoRestartBtn.textContent = loopState.autoRestartQueue
        ? 'Auto-restart enabled'
        : 'Pause when queue complete';
    }

    // Mark structure as built
    this.structureBuilt = true;
    log('info', 'LoopUI: Initial structure build complete');

    // Initial render based on mode
    this.renderLoopPanel();
  }

  // Helper to initialize the fixed area content
  _initializeFixedArea() {
    const fixedArea = this.rootElement.querySelector('#loop-fixed-area');
    if (!fixedArea) {
      log('error', 'LoopUI: #loop-fixed-area not found for initialization.');
      return;
    }
    // Only add content if it's not already there
    if (!fixedArea.querySelector('.mana-container')) {
      fixedArea.innerHTML = `
      <div class="loop-stats-container" style="padding: 10px; background: #2a2a2a; border-bottom: 1px solid #444;">
        <div class="loop-stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">
          <div class="stat-item">
            <span class="stat-label">Loop #:</span>
            <span id="loop-number" class="stat-value">1</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Total XP:</span>
            <span id="total-xp" class="stat-value">0</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Actions Completed:</span>
            <span id="actions-completed" class="stat-value">0</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Queue Length:</span>
            <span id="queue-length" class="stat-value">0</span>
          </div>
        </div>
      </div>
      <div class="loop-resources">
        <div class="mana-container">
          <div class="resource-label">Mana:</div>
          <div class="mana-bar-container">
            <div class="mana-bar-fill"></div>
            <span class="mana-text">0/0</span>
          </div>
        </div>
        <div class="loop-control-buttons" style="padding: 5px 0;">
          <button id="loop-clear-queue" class="button">Clear Queue</button>
          <button id="loop-clear-explore" class="button">Clear Explore Actions</button>
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
      this.loopNumberElement = fixedArea.querySelector('#loop-number');
      this.totalXpElement = fixedArea.querySelector('#total-xp');
      this.actionsCompletedElement = fixedArea.querySelector('#actions-completed');
      this.queueLengthElement = fixedArea.querySelector('#queue-length');

      // Attach listeners to the new buttons
      const clearQueueBtn = fixedArea.querySelector('#loop-clear-queue');
      if (clearQueueBtn) {
        clearQueueBtn.addEventListener('click', () => this._handleClearQueueClick());
      }
      
      const clearExploreBtn = fixedArea.querySelector('#loop-clear-explore');
      if (clearExploreBtn) {
        clearExploreBtn.addEventListener('click', () => this._handleClearExploreClick());
      }

      // Update display with current state
      this._updateManaDisplay(loopState.currentMana, loopState.maxMana);
      this._updateCurrentActionDisplay(loopState.currentAction);
      this._updateLoopStats();
    }
  }

  /**
   * Update the loop stats display
   */
  _updateLoopStats() {
    if (!this.isLoopModeActive) return;
    
    // Update loop number (if tracking exists in loopState)
    if (this.loopNumberElement && loopState.loopNumber !== undefined) {
      this.loopNumberElement.textContent = loopState.loopNumber || 1;
    }
    
    // Calculate total XP across all regions
    let totalXP = 0;
    if (loopState.regionXP) {
      for (const [region, xpData] of loopState.regionXP) {
        totalXP += xpData.xp || 0;
      }
    }
    if (this.totalXpElement) {
      this.totalXpElement.textContent = Math.floor(totalXP);
    }
    
    // Update actions completed count
    if (this.actionsCompletedElement) {
      const completedCount = loopState.actionCompleted?.size || 0;
      this.actionsCompletedElement.textContent = completedCount;
    }
    
    // Update queue length
    const queueLength = this.getActionQueue().length;
    if (this.queueLengthElement) {
      this.queueLengthElement.textContent = queueLength;
    }
  }

  /**
   * Handle clearing explore actions from the queue
   */
  _handleClearExploreClick() {
    if (this.playerStateAPI?.removeAllActionsOfType) {
      this.playerStateAPI.removeAllActionsOfType('customAction', 'explore');
      this.renderLoopPanel();
    }
  }

  /**
   * Set up event listeners for loop state changes
   * Delegates to EventCoordinator
   */
  subscribeToEvents() {
    if (!this.eventCoordinator) {
      log('warn', 'LoopUI: EventCoordinator not initialized');
      return;
    }
    this.eventCoordinator.subscribeToEvents();
  }

  /**
   * Unsubscribe from all eventBus events.
   * Delegates to EventCoordinator
   */
  unsubscribeFromEvents() {
    if (!this.eventCoordinator) {
      log('warn', 'LoopUI: EventCoordinator not initialized');
      return;
    }
    this.eventCoordinator.unsubscribeAll();
  }

  /**
   * Cleanup method called when the panel is destroyed.
   */
  /**
   * Sets the playerState API functions for accessing the action queue
   * @param {Object} api - Object containing playerState API functions
   */
  setPlayerStateAPI(api) {
    this.playerStateAPI = api;
    log('info', 'LoopUI: PlayerState API set');
  }

  /**
   * Gets the current action queue from playerState
   * @returns {Array} The current path/action queue
   */
  getActionQueue() {
    if (!this.playerStateAPI || !this.playerStateAPI.getPath) {
      // Only log warning if structure is built (meaning this is happening after init)
      // During initialization, this is expected and not a problem
      if (this.structureBuilt) {
        log('warn', 'LoopUI: PlayerState API not available after initialization');
      } else {
        log('debug', 'LoopUI: PlayerState API not yet available during initialization');
      }
      return [];
    }
    const path = this.playerStateAPI.getPath() || [];
    log('info', `LoopUI: Got path from playerState with ${path.length} entries`, path);
    return path;
  }

  /**
   * Toggle expanded state for an action block
   * @param {number} pathIndex - Index in the path array
   */
  toggleActionExpanded(pathIndex) {
    const key = `action-${pathIndex}`;
    this.expansionState.toggleAction(key);
    this.renderLoopPanel();
  }

  /**
   * Remove an action at a specific index
   * @param {number} pathIndex - Index in the path array
   */
  removeActionAtIndex(pathIndex) {
    const path = this.getActionQueue();
    if (pathIndex >= 0 && pathIndex < path.length) {
      const entry = path[pathIndex];
      
      // Use playerState API to remove the action
      if (entry.type === 'locationCheck' && this.playerStateAPI?.removeLocationCheckAt) {
        this.playerStateAPI.removeLocationCheckAt(
          entry.locationName,
          entry.region,
          entry.instanceNumber
        );
      } else if (entry.type === 'customAction' && this.playerStateAPI?.removeCustomActionAt) {
        this.playerStateAPI.removeCustomActionAt(
          entry.actionName,
          entry.region,
          entry.instanceNumber
        );
      }
      // Note: We don't remove regionMove entries directly
    }
  }

  /**
   * Insert a location check at a specific region instance
   */
  insertLocationCheckAt(locationName, regionName, instanceNumber) {
    if (this.playerStateAPI?.insertLocationCheckAt) {
      this.playerStateAPI.insertLocationCheckAt(locationName, regionName, instanceNumber);
      this.renderLoopPanel();
    }
  }

  /**
   * Insert a custom action at a specific region instance
   */
  insertCustomActionAt(actionName, regionName, instanceNumber, params = {}) {
    if (this.playerStateAPI?.insertCustomActionAt) {
      this.playerStateAPI.insertCustomActionAt(actionName, regionName, instanceNumber, params);
      this.renderLoopPanel();
    }
  }

  /**
   * Update custom action parameters
   */
  updateCustomActionParams(pathIndex, params) {
    // This would need to be implemented in playerState API
    // For now, we'll just re-render
    this.renderLoopPanel();
  }

  onPanelDestroy() {
    log('info', 'LoopUI onPanelDestroy called');
    // Animation loop no longer needed - all updates are event-driven
    this.unsubscribeFromEvents();
    window.loopUIInstance = null; // Clear global reference
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe(); // Unsubscribe
      this.settingsUnsubscribe = null;
    }
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

    //log('info', 'Updated regions in queue:', [...this.regionsInQueue]);
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
        const actionQueue = this.getActionQueue();
        const action = actionQueue.find((a) => a.id === actionId);

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
   * Delegates to LoopRenderer
   * @param {number} current - Current mana
   * @param {number} max - Maximum mana
   */
  _updateManaDisplay(current, max) {
    if (!this.loopRenderer) return;
    this.loopRenderer.updateManaDisplay(current, max);
  }

  /**
   * Update the mana display (old implementation)
   * @param {number} current - Current mana
   * @param {number} max - Maximum mana
   */
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
      restartBtn.disabled = !this.isLoopModeActive;
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
            const actionQueue = this.getActionQueue();
            const actionIndex = actionQueue.findIndex(
              (a) => a.id === action.id
            );
            displayIndex = actionIndex !== -1 ? actionIndex + 1 : '?';
          }
          progressValue.textContent = `Action ${displayIndex} of ${actionQueue.length}, Progress: ${manaCostSoFar} of ${actionCost} mana`;
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
        log('error', 'Error updating action progress:', error);
      }
    });
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
   * Queue a location check action
   * @param {string} regionName - Name of the region
   * @param {string} locationName - Name of the location
   */
  _queueCheckLocationAction(regionName, locationName) {
    if (!this.isLoopModeActive) return;

    //log('info', 
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
   * Queue a move action
   * @param {string} regionName - Source region name
   * @param {string} exitName - Exit name
   * @param {string} destinationRegion - Destination region name
   */
  _queueMoveAction(regionName, exitName, destinationRegion) {
    if (!this.isLoopModeActive) return;

    // Check if there's already a move action for this region
    const actionQueue = this.getActionQueue();
    const existingMoveAction = actionQueue.find(
      (action) =>
        action.type === 'moveToRegion' && action.regionName === regionName
    );

    // Check if there's already a move action TO the destination region
    const existingDestinationAction = actionQueue.find(
      (action) =>
        action.type === 'moveToRegion' &&
        action.destinationRegion === destinationRegion
    );

    if (existingMoveAction) {
      log('info', 
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
      log('info', 
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
    this.expansionState.setRegionExpanded(regionName, false);

    //log('info', 
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
    this.expansionState.setRegionExpanded(destinationRegion, true);

    // Re-render to update UI
    this.renderLoopPanel();
  }

  /**
   * Expand all action blocks
   */
  expandAllRegions() {
    log('info', 'LoopUI: Expanding all region blocks');
    if (!this.isLoopModeActive) return;
    
    // Get all discovered regions
    const discoveredRegions = discoveryStateSingleton.discoveredRegions;

    // Add all regions to the expanded set
    const regionNamesArray = Array.from(discoveredRegions);
    this.expansionState.expandAll(regionNamesArray);

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
   * Collapse all action blocks
   */
  collapseAllRegions() {
    log('info', 'LoopUI: Collapsing all region blocks');
    if (!this.isLoopModeActive) return;
    
    // Clear all expanded regions
    this.expansionState.collapseAll();

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
    this.expansionState.toggleRegion(regionName);
    this.renderLoopPanel();
  }

  /**
   * Render the loop panel
   * Delegates to LoopRenderer
   */
  renderLoopPanel() {
    if (!this.loopRenderer) {
      log('error', 'LoopRenderer not initialized');
      return;
    }

    const actionQueue = this.getActionQueue();
    this.loopRenderer.renderLoopPanel(this.isLoopModeActive, actionQueue, loopState);
  }

  /**
   * Remove an action at a specific index
   * @param {number} index - The index to remove
   */
  _removeActionAtIndex(index) {
    // We need to get the action queue to find the proper path index
    const actionQueue = this.getActionQueue();
    if (index >= 0 && index < actionQueue.length) {
      // Use playerState API to trim the path at this point
      const entry = actionQueue[index];
      if (this.playerStateAPI?.trimPath) {
        // Trim path at the action's region and instance
        this.playerStateAPI.trimPath(entry.region, entry.instanceNumber);
        this.renderLoopPanel();
      }
    }
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
    const actionQueue = this.getActionQueue();
    const actionIndex = actionQueue.findIndex(
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
          } of ${actionQueue.length}, Progress: ${Math.floor(
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
        const actionQueue = this.getActionQueue();
        const index = actionQueue.findIndex(
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
              actionQueue.forEach((a) => {
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

            log('info', 'Removing all actions in regions:', [
              ...regionsToRemove,
            ]);

            // Remove this action and all actions in or leading to the affected regions
            const actionsToRemove = actionQueue.slice(index).filter(
              (a) =>
                a.id === action.id || // This action
                regionsToRemove.has(a.regionName) || // Actions in any affected region
                (a.type === 'moveToRegion' &&
                  regionsToRemove.has(a.destinationRegion)) // Move actions to any affected region
            );

            // Remove each action individually
            for (const actionToRemove of actionsToRemove) {
              const actionIndex = actionQueue.findIndex(
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
          this._updateRegionsInQueue(actionQueue);

          // Re-render the panel
          this.renderLoopPanel();
        }
      });
    }

    return actionDiv;
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

      // Use console.info instead of window.consoleManager
      console.info('Game state exported!');
    } catch (error) {
      log('error', 'Failed to export state:', error);
      // Use console.error instead of window.consoleManager
      log('error', `Export failed: ${error.message}`);
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

        // Use console.info instead of window.consoleManager
        console.info('Game state imported!');
      } catch (error) {
        log('error', 'Failed to import state:', error);
        // Use console.error instead of window.consoleManager
        log('error', `Import failed: ${error.message}`);
      }
    };

    reader.readAsText(file);
  }

  /**
   * Toggle loop mode on/off
   */
  toggleLoopMode() {
    this.isLoopModeActive = !this.isLoopModeActive;

    // If entering loop mode and we don't have the playerState API yet, try to get it
    if (this.isLoopModeActive && !this.playerStateAPI) {
      const playerStateAPI = getPlayerStateAPI();
      if (playerStateAPI) {
        this.setPlayerStateAPI(playerStateAPI);
        log('info', '[LoopUI] PlayerState API retrieved on mode toggle');
      } else {
        log('warn', '[LoopUI] PlayerState API still not available on mode toggle');
      }
    }
    
    // If entering loop mode, expand the Menu region by default
    if (this.isLoopModeActive) {
      this.expansionState.setRegionExpanded('Menu', true);
    }

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
    eventBus.publish('loopUI:modeChanged', { active: this.isLoopModeActive }, 'loops');

    log('info', `LoopUI: Loop mode toggled. Active: ${this.isLoopModeActive}`);
  }

  clear() {
    // Clear internal state
    this.expansionState.clear();
    this.regionsInQueue.clear();
    // REMOVED: this.repeatExploreStates.clear(); - Now handled by LoopState
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
    this.expansionState.setRegionExpanded('Menu', true);

    // Re-render the panel in its cleared state
    this.renderLoopPanel();
  }

  /**
   * Update the display for the current action progress
   * Delegates to LoopRenderer
   * @param {Object|null} action - The current action, or null to clear
   */
  _updateCurrentActionDisplay(action) {
    if (!this.loopRenderer) return;
    this.loopRenderer.updateCurrentActionDisplay(
      action,
      loopState,
      this.getActionQueue.bind(this),
      this._estimateActionCost.bind(this),
      this._getActionDisplayName.bind(this),
      this.isLoopModeActive
    );
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
