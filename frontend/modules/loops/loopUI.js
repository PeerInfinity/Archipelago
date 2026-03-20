// loopUI.js - UI for the Loop mode
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js'; // <<< Re-added import
import loopState from './loopStateSingleton.js';
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
import { getPlayerStateAPI, getLoopsModuleDispatcher, getCostDataManager, getModuleEventBus } from './index.js';
import { createSnapshotInterface } from '../shared/snapshotInterface.js';
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

    Object.defineProperty(this, 'eventBus', { get: () => getModuleEventBus(), configurable: true });

    // UI state
    this.regionsInQueue = new Set(); // Track which regions have actions in the queue
    this.isLoopModeActive = false;
    this.repeatExploreStates = new Map(); // Map to track repeat explore checkbox states per region
    this.settingsUnsubscribe = null; // Add property

    // Discovery mode state (mirrors RegionUI pattern)
    this.isDiscoveryModeActive = false;
    this.discoverySettings = {
      undiscoveredDisplay: 'hidden',
      clickDiscoversLocation: true,
      clickDiscoversRegion: false,
      disableLocationCheckUI: false,
      showUndiscoveredDetails: false,
      showUndiscoveredRegionNames: false
    };

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
    this.loopTopControlsContainer =
      this.rootElement.querySelector('.loop-controls'); // Cache controls container

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
    this.eventCoordinator = new EventCoordinator(this.eventBus, this);

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
      this.eventBus.unsubscribe('app:readyForUiDataLoad', readyHandler);
    };
    this.eventBus.subscribe('app:readyForUiDataLoad', readyHandler);

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
    this.settingsUnsubscribe = this.eventBus.subscribe(
      'settings:changed',
      ({ key, value }) => {
        // Delegate to DisplaySettingsManager
        const settingsUpdated = this.displaySettings.handleSettingsChanged({ key, value });
        if (settingsUpdated) {
          log('info', 'LoopUI reacting to settings change:', key);
          this.renderLoopPanel(); // Re-render panel when setting changes
        }
      }
    );
  }

  /**
   * Load discovery settings from settingsManager
   */
  async loadDiscoverySettings() {
    try {
      this.discoverySettings.undiscoveredDisplay = await settingsManager.getSetting(
        'moduleSettings.discovery.undiscoveredDisplay', 'hidden'
      );
      this.discoverySettings.clickDiscoversLocation = await settingsManager.getSetting(
        'moduleSettings.discovery.clickDiscoversLocation', true
      );
      this.discoverySettings.clickDiscoversRegion = await settingsManager.getSetting(
        'moduleSettings.discovery.clickDiscoversRegion', false
      );
      this.discoverySettings.disableLocationCheckUI = await settingsManager.getSetting(
        'moduleSettings.discovery.disableLocationCheckUI', false
      );
      this.discoverySettings.showUndiscoveredDetails = await settingsManager.getSetting(
        'moduleSettings.discovery.showUndiscoveredDetails', false
      );
      this.discoverySettings.showUndiscoveredRegionNames = await settingsManager.getSetting(
        'moduleSettings.discovery.showUndiscoveredRegionNames', false
      );
      this.isDiscoveryModeActive = await settingsManager.getSetting(
        'moduleSettings.discovery.enableDiscoveryMode', false
      );
      log('info', '[LoopUI] Discovery settings loaded');
    } catch (error) {
      log('error', '[LoopUI] Error loading discovery settings:', error);
    }
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
            <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
              <div class="controls-header" style="cursor: pointer; user-select: none; display: flex; align-items: center; padding: 5px 10px; border: 1px solid #555; border-radius: 4px; margin-right: 6px;">
                <span class="collapse-indicator" style="margin-right: 5px; transition: transform 0.3s; transform: rotate(-90deg);">▼</span>
                <span style="font-weight: bold;">Controls</span>
              </div>
              <button id="loop-ui-toggle-pause" class="button" disabled>Pause</button>
              <button id="loop-ui-clear-queue" class="button" disabled>Clear Queue</button>
              <button id="loop-ui-expand-collapse-all" class="button">Expand All</button>
              <button id="loop-ui-compact-view" class="button">Compact View</button>
            </div>
            <div class="controls-content" style="display: none; margin-top: 8px;">
              <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin-bottom: 8px;">
                <div class="speed-controls">
                  <label for="loop-ui-game-speed">Speed:</label>
                  <input type="range" id="loop-ui-game-speed" min="0.5" max="1000" step="0.5" value="100" />
                  <span id="loop-ui-speed-value">1.0x</span>
                </div>
                <label class="instant-mode-label"><input type="checkbox" id="loop-ui-toggle-instant" /> Instant</label>
                <label class="auto-restart-label"><input type="checkbox" id="loop-ui-toggle-auto-restart" /> Auto-restart when queue complete</label>
                <label class="auto-resume-label"><input type="checkbox" id="loop-ui-toggle-auto-resume" /> Auto-resume on new action</label>
                <label class="auto-remove-label"><input type="checkbox" id="loop-ui-toggle-auto-remove" /> Auto-remove completed actions</label>
              </div>
              <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin-bottom: 8px;">
                <button id="loop-ui-save-state" class="button">Save Game</button>
                <button id="loop-ui-load-state" class="button">Load Game</button>
                <button id="loop-ui-export-state" class="button">Export</button>
                <label for="loop-ui-state-import" class="button">Import</label>
                <input type="file" id="loop-ui-state-import" class="hidden" accept=".json" />
                <button id="loop-ui-hard-reset" class="button">Hard Reset</button>
                <button id="loop-ui-toggle-loop-mode" class="button">Enter Loop Mode</button>
              </div>
              <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
                <button id="loop-ui-toggle-restart" class="button" disabled>Restart</button>
                <button id="loop-ui-clear-explore" class="button">Clear Explore Actions</button>
              </div>
            </div>
        </div>
        <div id="loop-fixed-area" class="loop-fixed-area" style="flex-shrink: 0;">
            <!-- Mana bar and current action display will go here -->
        </div>
        <div id="loop-regions-area" class="loop-regions-area" style="flex-grow: 1; overflow-y: auto; min-height: 0;">
            <!-- Scrollable region/action list -->
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

    // Collapsible controls header
    const controlsHeader = querySelector('.controls-header');
    const controlsContent = querySelector('.controls-content');
    const collapseIndicator = querySelector('.collapse-indicator');
    if (controlsHeader && controlsContent && collapseIndicator) {
      controlsHeader.addEventListener('click', () => {
        const isCollapsed = controlsContent.style.display === 'none';
        controlsContent.style.display = isCollapsed ? '' : 'none';
        collapseIndicator.style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(-90deg)';
      });
    }

    // --- Attach Listeners using NEW IDs ---
    attachButtonHandler('loop-ui-toggle-loop-mode', () => {
      // Always use the event for consistency
      this.eventBus.publish('loops:setLoopMode', { action: 'toggle' });
    });

    attachButtonHandler('loop-ui-toggle-pause', function () {
      const state = loopState.getProcessingState();
      if (state === 'running') {
        loopState.setPaused(true);   // Pause → paused
      } else {
        loopState.setPaused(false);  // Start or Resume → running
      }
      // Button update is handled by the loopState:pauseStateChanged event
    });

    attachButtonHandler('loop-ui-toggle-restart', this._handleRestartClick);

    const autoRestartCheckbox = querySelector('#loop-ui-toggle-auto-restart');
    const autoResumeCheckbox = querySelector('#loop-ui-toggle-auto-resume');

    if (autoRestartCheckbox) {
      autoRestartCheckbox.checked = loopState.autoRestartQueue;
      autoRestartCheckbox.addEventListener('change', async () => {
        const newState = autoRestartCheckbox.checked;
        loopState.setAutoRestartQueue(newState);
        await this.displaySettings.setSetting('autoRestart', newState, true);
        // Mutually exclusive: disable auto-resume when auto-restart is enabled
        if (newState && loopState.autoResumeOnNewAction) {
          loopState.setAutoResumeOnNewAction(false);
          await this.displaySettings.setSetting('autoResumeOnNewAction', false, true);
          if (autoResumeCheckbox) autoResumeCheckbox.checked = false;
        }
      });
    }

    if (autoResumeCheckbox) {
      autoResumeCheckbox.checked = loopState.autoResumeOnNewAction;
      autoResumeCheckbox.addEventListener('change', async () => {
        const newState = autoResumeCheckbox.checked;
        loopState.setAutoResumeOnNewAction(newState);
        await this.displaySettings.setSetting('autoResumeOnNewAction', newState, true);
        // Mutually exclusive: disable auto-restart when auto-resume is enabled
        if (newState && loopState.autoRestartQueue) {
          loopState.setAutoRestartQueue(false);
          await this.displaySettings.setSetting('autoRestart', false, true);
          if (autoRestartCheckbox) autoRestartCheckbox.checked = false;
        }
      });
    }

    const autoRemoveCheckbox = querySelector('#loop-ui-toggle-auto-remove');
    if (autoRemoveCheckbox) {
      autoRemoveCheckbox.checked = loopState.autoRemoveCompleted;
      autoRemoveCheckbox.addEventListener('change', async () => {
        const newState = autoRemoveCheckbox.checked;
        loopState.setAutoRemoveCompleted(newState);
        await this.displaySettings.setSetting('autoRemoveCompleted', newState, true);
      });
    }

    attachButtonHandler('loop-ui-expand-collapse-all', function () {
      const button = querySelector('#loop-ui-expand-collapse-all');
      if (!button) return;
      if (button.textContent === 'Expand All') {
        this.expandAllRegions();
      } else {
        this.collapseAllRegions();
      }
    });

    attachButtonHandler('loop-ui-compact-view', function () {
      if (!this.loopRenderer) return;
      const isCompact = this.loopRenderer.toggleCompactView();
      const button = querySelector('#loop-ui-compact-view');
      if (button) {
        button.textContent = isCompact ? 'Normal View' : 'Compact View';
      }
      this.renderLoopPanel();
    });

    attachButtonHandler('loop-ui-clear-queue', this._handleClearQueueClick);

    attachButtonHandler('loop-ui-save-state', this._handleSaveStateClick);

    attachButtonHandler('loop-ui-load-state', this._handleLoadStateClick);

    attachButtonHandler('loop-ui-export-state', this._exportState);

    attachButtonHandler('loop-ui-hard-reset', this._handleHardResetClick);

    attachButtonHandler('loop-ui-clear-explore', this._handleClearExploreClick);

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

    // Instant mode checkbox
    const instantCheckbox = querySelector('#loop-ui-toggle-instant');
    if (instantCheckbox) {
      const currentSpeedSlider = querySelector('#loop-ui-game-speed');
      instantCheckbox.checked = loopState.instantMode;
      if (currentSpeedSlider) {
        currentSpeedSlider.disabled = loopState.instantMode;
      }
      instantCheckbox.addEventListener('change', async () => {
        const enabled = instantCheckbox.checked;
        loopState.setInstantMode(enabled);
        const slider = querySelector('#loop-ui-game-speed');
        if (slider) {
          slider.disabled = enabled;
        }
        await this.displaySettings.setSetting('instantMode', enabled, true);
      });
    }

    log('info', 'LoopUI: Internal listeners attached.');
  }

  // --- Helper handlers for button clicks ---
  _handleRestartClick() {
    try {
      loopState._resetLoop();
      const restartRoot = this.rootElement || document;
      restartRoot.querySelectorAll('.action-progress-bar').forEach((bar) => {
        bar.style.width = '0%';
      });
      restartRoot.querySelectorAll('.action-status').forEach((status) => {
        status.textContent = 'Pending';
        status.className = 'action-status pending';
      });
      loopState.restartQueueFromBeginning();
      restartRoot.querySelectorAll('.action-progress-value').forEach((value) => {
        const actionItem = value.closest('.action-item');
        if (actionItem) {
          const actionId = actionItem.id.replace('action-', '');
          const actionQueue = this.getActionQueue();
          const action = actionQueue.find((a) => a.id === actionId);
          if (action) {
            const actionCost = this._estimateActionCost(action);
            const currentQueue = this.getActionQueue();
            const actionIndex = currentQueue.findIndex(
              (a) => a.id === actionId
            );
            const displayIndex = actionIndex !== -1 ? actionIndex + 1 : '?';
            value.textContent = `0/${actionCost}, Action ${displayIndex} of ${currentQueue.length}`;
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
    // Use resetQueue which handles stopping processing, clearing path,
    // clearing tracking, and publishing queueUpdated
    loopState.resetQueue();

    // Reset to idle state
    loopState.isPaused = false;
    loopState._queueCompleted = false;
    loopState.currentMana = loopState.maxMana;

    this.regionsInQueue.clear();
    this._updateManaDisplay(loopState.currentMana, loopState.maxMana);

    // Publish state change so button updates to "Start"
    this.eventBus.publish('loopState:pauseStateChanged', {
      isPaused: false,
      processingState: loopState.getProcessingState(),
    });
    this.renderLoopPanel();
  }

  _handleSaveStateClick() {
    loopState.saveToStorage();
    console.info('Game saved!');
  }

  _handleLoadStateClick() {
    const loaded = loopState.loadFromStorage();
    if (loaded) {
      console.info('Game loaded!');
      this.renderLoopPanel();
    } else {
      console.info('No saved game found.');
    }
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
      const startRegion = this.getPrimaryStartRegion();
      if (startRegion) this.expansionState.setRegionExpanded(startRegion, true);
      this.regionsInQueue.clear();
      // REMOVED: this.repeatExploreStates.clear(); - Now handled by LoopState
      // Render the panel
      this.renderLoopPanel();
      // Use console.warn instead of window.consoleManager
      log('warn', 'Game has been hard reset!');
    }
  }

  /**
   * Handle Generate Costs from the inline "no cost data" prompt.
   * Uses the CostPlanner from the loopsCostDebugger module.
   */
  async _handleGenerateCostsInline() {
    const costDataManager = getCostDataManager();
    if (!costDataManager) {
      log('error', 'CostDataManager not available');
      return;
    }

    // Get CostPlanner via centralRegistry
    const getCostPlannerFn = centralRegistry.getPublicFunction('loopsCostDebugger', 'getCostPlanner');
    const costPlanner = getCostPlannerFn?.();
    if (!costPlanner) {
      log('error', 'CostPlanner not available. Is the loopsCostDebugger module loaded?');
      alert('Cost planner not available. Ensure the Loops Cost Debugger module is loaded.');
      return;
    }

    // Get sphere log
    const getSphereLogFn = centralRegistry.getPublicFunction('loopsCostDebugger', 'getSphereLog');
    const sphereLog = getSphereLogFn?.();
    if (!sphereLog || sphereLog.length === 0) {
      alert('No sphere log available. Load a game with sphere data first.');
      return;
    }

    // Show progress UI
    const progressContainer = this.rootElement.querySelector('#loop-ui-cost-progress');
    const progressLabel = this.rootElement.querySelector('#loop-ui-cost-progress-label');
    const progressBar = this.rootElement.querySelector('#loop-ui-cost-progress-bar');
    const generateBtn = this.rootElement.querySelector('#loop-ui-generate-costs-inline');
    const acceptBtn = this.rootElement.querySelector('#loop-ui-accept-defaults');

    if (progressContainer) progressContainer.style.display = 'block';
    if (generateBtn) generateBtn.disabled = true;
    if (acceptBtn) acceptBtn.disabled = true;

    try {
      // Load sphere log into planner
      costPlanner.reset();
      const loadResult = costPlanner.loadSphereLog(sphereLog);
      log('info', `Loaded sphere log: ${loadResult.entryCount} entries`);

      // Plan all steps, updating progress by sphere
      const totalEntries = costPlanner.getTotalEntries();
      let lastSphere = -1;

      while (!costPlanner.isComplete()) {
        const step = costPlanner.planNextStep();
        if (!step) break;

        // Update progress bar based on entry progress
        if (step.sphereIndex !== lastSphere) {
          lastSphere = step.sphereIndex;
          const entryIdx = step.sphereEntryIndex ?? 0;
          const percent = Math.round((entryIdx / totalEntries) * 100);
          if (progressLabel) progressLabel.textContent = `Sphere ${step.sphereIndex}... (${entryIdx}/${totalEntries} entries)`;
          if (progressBar) progressBar.style.width = `${percent}%`;
        }

        // Yield to let the UI update periodically
        if (step.stepIndex % 20 === 0) {
          await new Promise(r => setTimeout(r, 0));
        }
      }

      // Get generated cost data and load it into costDataManager
      const costData = costPlanner.getCostData();
      if (costData) {
        costDataManager.setCostData(costData, 'costPlanner');
        log('info', `Costs generated: ${Object.keys(costData.regions).length} regions, ${Object.keys(costData.locations).length} locations`);
      }

      // Re-render (will now show region blocks since costs are loaded)
      this.renderLoopPanel();

      // Auto-enter loop mode
      if (!this.isLoopModeActive) {
        this.eventBus.publish('loops:setLoopMode', { action: 'enable' });
      }
    } catch (error) {
      log('error', 'Cost generation failed:', error);
      alert(`Cost generation failed: ${error.message}`);
      if (generateBtn) generateBtn.disabled = false;
      if (acceptBtn) acceptBtn.disabled = false;
      if (progressContainer) progressContainer.style.display = 'none';
    }
  }

  /**
   * Handle Accept Defaults - set default costs without generation.
   * Start region = 0, all other regions = 50, all locations = 100.
   */
  _handleAcceptDefaults() {
    const costDataManager = getCostDataManager();
    if (!costDataManager) {
      log('error', 'CostDataManager not available');
      return;
    }

    // Build minimal cost data with just the start region at cost 0
    const startRegion = this.getPrimaryStartRegion();
    const regions = {};
    if (startRegion) {
      regions[startRegion] = { moveCost: 0 };
    }

    const costData = {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      generatedFrom: 'defaults',
      regions,
      locations: {},
      defaultRegionCost: 50,
      defaultLocationCost: 100,
    };

    costDataManager.setCostData(costData, 'defaults');
    log('info', 'Accepted default costs');
    this.renderLoopPanel();

    // Auto-enter loop mode
    if (!this.isLoopModeActive) {
      this.eventBus.publish('loops:setLoopMode', { action: 'enable' });
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

    // Load discovery settings
    await this.loadDiscoverySettings();

    // Sync persisted settings to loopState
    const defaultSpeed = this.displaySettings.getSetting('defaultSpeed');
    const autoRestart = this.displaySettings.getSetting('autoRestart');
    if (defaultSpeed !== undefined) {
      loopState.setGameSpeed(defaultSpeed);
    }
    if (autoRestart !== undefined) {
      loopState.setAutoRestartQueue(autoRestart);
    }
    const instantMode = this.displaySettings.getSetting('instantMode');
    if (instantMode !== undefined) {
      loopState.setInstantMode(instantMode);
    }
    const autoResumeOnNewAction = this.displaySettings.getSetting('autoResumeOnNewAction');
    if (autoResumeOnNewAction !== undefined) {
      loopState.setAutoResumeOnNewAction(autoResumeOnNewAction);
    }
    const autoRemoveCompleted = this.displaySettings.getSetting('autoRemoveCompleted');
    if (autoRemoveCompleted !== undefined) {
      loopState.autoRemoveCompleted = autoRemoveCompleted; // Don't call setter here to avoid premature removal
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

    // Check if we should automatically enter loop mode based on settings or URL
    const loopModeEnabled = this.displaySettings.getSetting('loopModeEnabled');
    const urlParams = new URLSearchParams(window.location.search);
    const urlModeIsLoops = urlParams.get('mode') === 'loops';
    log('info', `[LoopUI] loopModeEnabled setting: ${loopModeEnabled}, URL mode=loops: ${urlModeIsLoops}, isLoopModeActive: ${this.isLoopModeActive}`);

    if ((loopModeEnabled || urlModeIsLoops) && !this.isLoopModeActive) {
      // Cost generation and loop mode entry are handled by _handleSetLoopMode
      // in the EventCoordinator, which checks for cost data and auto-generates if needed.
      log('info', '[LoopUI] Auto-entering loop mode via event');
      this.eventBus.publish('loops:setLoopMode', { action: 'enable' });
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
    const autoRestartCheckbox = this.rootElement.querySelector('#loop-ui-toggle-auto-restart');
    if (autoRestartCheckbox) {
      autoRestartCheckbox.checked = loopState.autoRestartQueue;
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
      <div class="loop-stats-container" style="display: none; flex-wrap: wrap; justify-content: space-evenly; padding: 0 10px 10px;">
          <span class="stat-item"><span class="stat-label">Loop #:</span> <span id="loop-number" class="stat-value">1</span></span>
          <span class="stat-item"><span class="stat-label">Total XP:</span> <span id="total-xp" class="stat-value">0</span></span>
          <span class="stat-item"><span class="stat-label">Actions Completed:</span> <span id="actions-completed" class="stat-value">0</span></span>
          <span class="stat-item"><span class="stat-label">Queue Length:</span> <span id="queue-length" class="stat-value">0</span></span>
      </div>
      <div class="loop-resources">
        <div class="mana-container">
          <div class="resource-label">Mana:</div>
          <div class="mana-bar-container">
            <div class="mana-bar-fill"></div>
            <span class="mana-text">0/0</span>
          </div>
        </div>
        <div class="current-action-container" id="current-action-container">
          <div class="no-action-message">Queue ready</div>
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
      const completedCount = loopState.actionQueueManager?.actionCompleted?.size || 0;
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
   * Gets the primary start region name from stateManager static data.
   * @returns {string|null} The start region name, or null if unavailable
   */
  getPrimaryStartRegion() {
    const staticData = stateManager.getStaticData();
    let startRegions = staticData?.startRegions;
    if (startRegions && !Array.isArray(startRegions) && typeof startRegions === 'object' && Array.isArray(startRegions.default)) {
      startRegions = startRegions.default;
    }
    if (Array.isArray(startRegions) && startRegions.length > 0) {
      return startRegions[0];
    }
    // Fallback: first region in static data
    if (staticData?.regions?.size > 0) {
      return staticData.regions.keys().next().value;
    }
    return null;
  }

  /**
   * Gets the current action queue from playerState
   * @returns {Array} The current path/action queue
   */
  getActionQueue() {
    // Use loopState's ActionQueueManager which maps raw path entries to action objects
    // (e.g., regionMove → moveToRegion, locationCheck → checkLocation, customAction → explore)
    const queue = loopState.getActionQueue();
    log('info', `LoopUI: Got action queue with ${queue.length} entries`, queue);
    return queue;
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
          entry.sourceRegion,
          entry.instanceNumber
        );
      } else if (entry.type === 'customAction' && this.playerStateAPI?.removeCustomActionAt) {
        this.playerStateAPI.removeCustomActionAt(
          entry.actionName,
          entry.sourceRegion,
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
      if (action.type === 'regionMove') {
        // Add both source and destination for move actions
        if (action.sourceRegion) this.regionsInQueue.add(action.sourceRegion);
        if (action.destinationRegion) this.regionsInQueue.add(action.destinationRegion);
      } else if (action.sourceRegion) {
        this.regionsInQueue.add(action.sourceRegion);
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
    const manaBar = this.rootElement?.querySelector('.mana-bar-fill');
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
      const pauseBtn = this.rootElement?.querySelector('#loop-ui-toggle-pause');
      if (pauseBtn) {
        pauseBtn.textContent = 'Resume';
      }
      return; // Don't reset progress bars if we're paused
    }

    // If it's a full reset (not a pause), reset all progress displays
    // Reset progress on all action displays (scoped to this panel)
    const root = this.rootElement || document;
    root.querySelectorAll('.action-progress-bar').forEach((bar) => {
      bar.style.width = '0%';
    });
    root.querySelectorAll('.loop-action-progress-bar').forEach((bar) => {
      bar.style.width = '0%';
    });

    // Update all action status indicators
    root.querySelectorAll('.action-status').forEach((status) => {
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
   * Update the pause button text and status line to reflect the current state
   * @param {boolean} isPaused - Whether the system is currently paused (legacy, used as fallback)
   * @param {string} [processingState] - 'idle', 'running', 'paused', or 'completed'
   */
  _updatePauseButtonState(isPaused, processingState) {
    // Derive state from loopState if not provided explicitly
    if (!processingState) {
      processingState = loopState.getProcessingState();
    }

    const pauseBtn = this.rootElement?.querySelector('#loop-ui-toggle-pause');
    if (pauseBtn) {
      const labels = { idle: 'Start', running: 'Pause', paused: 'Resume', completed: 'Restart', waiting: 'Waiting' };
      pauseBtn.textContent = labels[processingState] || 'Start';
      pauseBtn.disabled = !this.isLoopModeActive || processingState === 'waiting';
    }

    // Update the status line in the action container
    if (processingState !== 'running') {
      const actionContainer = this.rootElement?.querySelector('#current-action-container');
      if (actionContainer) {
        const statusMessages = {
          idle: 'Queue ready',
          paused: 'Paused',
          completed: 'Queue complete',
          waiting: 'Waiting for new actions...',
        };
        const msg = statusMessages[processingState];
        if (msg) {
          actionContainer.innerHTML = `<div class="no-action-message">${msg}</div>`;
        }
      }
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
    // And auto-resume button
    const autoResumeBtn = this.rootElement?.querySelector(
      '#loop-ui-toggle-auto-resume'
    );
    if (autoResumeBtn) {
      autoResumeBtn.disabled = !this.isLoopModeActive;
    }
    // And clear queue button
    const clearQueueBtn = this.rootElement?.querySelector(
      '#loop-ui-clear-queue'
    );
    if (clearQueueBtn) {
      clearQueueBtn.disabled = !this.isLoopModeActive;
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
        // Find by action index in the new entry format
        const actionIndex = loopState.currentActionIndex;
        const actionElement = this.rootElement.querySelector(
          `.loop-action-entry[data-action-index="${actionIndex}"]`
        );

        // Also try the old format (for backwards compatibility during transition)
        const legacyElement = !actionElement ? this.rootElement.querySelector(
          `#action-${action.id}`
        ) : null;

        const element = actionElement || legacyElement;
        if (!element) return;

        // Update new format entry
        if (actionElement) {
          const progressBar = actionElement.querySelector('.loop-action-progress-bar');
          const statusEl = actionElement.querySelector('.loop-action-status');

          if (progressBar) {
            progressBar.style.transition = 'none';
            void progressBar.offsetWidth;
            progressBar.style.transition = 'width 0.3s ease';
            progressBar.style.width = `${action.progress}%`;
          }

          // Update status
          if (statusEl) {
            const isActive = action === loopState.currentAction;
            const isCompleted = action.completed;
            let status = 'pending';
            if (isCompleted) status = 'completed';
            else if (isActive) status = 'active';

            statusEl.textContent = status;
            statusEl.className = `loop-action-status status-${status}`;

            // Update entry state class
            actionElement.classList.remove('state-pending', 'state-active', 'state-completed');
            actionElement.classList.add(`state-${status}`);
          }
        }

        // Update legacy format entry
        if (legacyElement) {
          const progressBar = legacyElement.querySelector('.action-progress-bar');
          if (progressBar) {
            progressBar.style.width = `${action.progress}%`;
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
    const regionBlock = this.rootElement?.querySelector(
      `.loop-region-block[data-region="${regionName}"]`
    );
    if (!regionBlock) return;

    const xpData = loopState.getRegionXP(regionName);
    const xpDisplay = regionBlock.querySelector('.region-xp-display');

    if (xpData) {
      // Calculate percentage to next level
      const percentage = (xpData.xp / xpData.xpForNextLevel) * 100;

      // Calculate the action speed/efficiency bonus (5% per level)
      const speedBonus = xpData.level * 5;

      // Update the header XP bar (always visible)
      const headerXpBar = regionBlock.querySelector('.region-header-xp-bar');
      const headerXpText = regionBlock.querySelector('.region-header-xp-text');
      const headerLevel = regionBlock.querySelector('.region-xp-level');
      const headerEfficiency = regionBlock.querySelector('.region-xp-efficiency');

      if (headerXpBar) {
        headerXpBar.style.width = `${percentage}%`;
      }
      if (headerXpText) {
        headerXpText.textContent = `${Math.floor(xpData.xp)} / ${xpData.xpForNextLevel} XP`;
      }
      if (headerLevel) {
        headerLevel.textContent = `Level ${xpData.level}`;
      }
      if (headerEfficiency) {
        headerEfficiency.textContent = `+${speedBonus}%`;
      }

      // Update the expanded details XP display (if present)
      if (xpDisplay) {
        const xpBar = xpDisplay.querySelector('.xp-bar');
        if (xpBar) {
          xpBar.style.transition = 'none';
          void xpBar.offsetWidth;
          xpBar.style.transition = 'width 0.3s ease';
          xpBar.style.width = `${percentage}%`;
        }

        const xpText = xpDisplay.querySelector('.xp-text');
        if (xpText) {
          xpText.innerHTML = `Level ${xpData.level} (${Math.floor(xpData.xp)}/${
            xpData.xpForNextLevel
          } XP) <span class="discount-text">+${speedBonus}% action efficiency</span>`;
        } else {
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
      type: 'locationCheck',
      region: regionName,
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
        action.type === 'regionMove' && action.sourceRegion === regionName
    );

    // Check if there's already a move action TO the destination region
    const existingDestinationAction = actionQueue.find(
      (action) =>
        action.type === 'regionMove' &&
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
        `There's already a move action to ${destinationRegion} from ${existingDestinationAction.sourceRegion}`
      );

      // Create a modal message with don't show again checkbox
      const message = `You already have a move action to ${destinationRegion} from ${existingDestinationAction.sourceRegion}. Remove it first to add a new move action to this region.`;

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
      type: 'regionMove',
      region: destinationRegion,
      sourceRegion: regionName,
      exitUsed: exitName,
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
    const headerExpandCollapseBtn = this.rootElement?.querySelector(
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
    const headerExpandCollapseBtn = this.rootElement?.querySelector(
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
   * Navigate to a region: expand it, re-render, and scroll to it with a highlight
   * Called when the user clicks an exit or entrance to move to a new region
   * @param {string} regionName - The target region to navigate to
   */
  navigateToRegion(regionName) {
    // Collapse all other regions when navigating to a new one
    this.expansionState.collapseAll();
    this.expansionState.setRegionExpanded(regionName, true);
    this.renderLoopPanel();

    // Scroll to the new region block after the DOM updates
    requestAnimationFrame(() => {
      const regionBlock = this.rootElement?.querySelector(
        `.loop-region-block[data-region="${CSS.escape(regionName)}"]`
      );
      if (regionBlock) {
        regionBlock.scrollIntoView({ behavior: 'smooth', block: 'start' });
        regionBlock.classList.add('highlight-region');
        setTimeout(() => regionBlock.classList.remove('highlight-region'), 2000);
      }
    });
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
    const actionQueue = this.getActionQueue();
    if (index < 0 || index >= actionQueue.length) return;

    const entry = actionQueue[index];

    if (entry.type === 'regionMove') {
      // For regionMove: trim path so this move and everything after it is removed.
      // Find the previous regionMove entry and trim to that point.
      let prevMoveRegion = null;
      let prevMoveInstance = null;
      for (let i = index - 1; i >= 0; i--) {
        if (actionQueue[i].type === 'regionMove') {
          prevMoveRegion = actionQueue[i].destinationRegion;
          prevMoveInstance = actionQueue[i].instanceNumber;
          break;
        }
      }
      if (prevMoveRegion && this.playerStateAPI?.trimPath) {
        this.playerStateAPI.trimPath(prevMoveRegion, prevMoveInstance);
        this.renderLoopPanel();
      }
    } else if (entry.type === 'locationCheck' && this.playerStateAPI?.removeLocationCheckAt) {
      this.playerStateAPI.removeLocationCheckAt(entry.locationName, entry.sourceRegion, entry.instanceNumber);
      this.renderLoopPanel();
    } else if (entry.type === 'customAction' && this.playerStateAPI?.removeCustomActionAt) {
      this.playerStateAPI.removeCustomActionAt(entry.actionName, entry.sourceRegion, entry.instanceNumber);
      this.renderLoopPanel();
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
      case 'customAction':
        actionName = `Explore ${action.sourceRegion}`;
        break;
      case 'locationCheck':
        actionName = `Check ${action.locationName}`;
        break;
      case 'regionMove':
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
    )} of ${parseFloat(actionCost.toFixed(1))} mana</span>
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
          if (action.type === 'regionMove') {
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
                  a.type === 'regionMove' &&
                  regionsToRemove.has(a.sourceRegion) &&
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
              (a) => {
                if (a.id === action.id) return true; // This action
                return regionsToRemove.has(a.sourceRegion); // Actions in any affected region
              }
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

    const costDataManager = getCostDataManager();
    let baseCost;

    if (costDataManager?.isLoaded()) {
      switch (action.type) {
        case 'regionMove':
          baseCost = costDataManager.getRegionCost(action.sourceRegion);
          break;
        case 'locationCheck':
          baseCost = costDataManager.getLocationCost(action.locationName);
          break;
        case 'customAction':
          baseCost = costDataManager.getRegionCost(action.sourceRegion) * 2;
          break;
        default:
          baseCost = 50;
      }
    } else {
      switch (action.type) {
        case 'customAction':
          baseCost = 50;
          break;
        case 'locationCheck':
          baseCost = 100;
          break;
        case 'regionMove':
          baseCost = 50;
          break;
        default:
          baseCost = 50;
      }
    }

    // Apply region XP reduction if applicable
    if (action.sourceRegion) {
      const xpData = loopState.getRegionXP(action.sourceRegion);
      return proposedLinearFinalCost(baseCost, xpData.level);
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
    
    // If entering loop mode, expand the first region block by default
    if (this.isLoopModeActive) {
      const actionQueue = this.getActionQueue();
      const firstRegion = actionQueue.length > 0 ? actionQueue[0].sourceRegion : null;
      if (firstRegion) {
        this.expansionState.setRegionExpanded(firstRegion, true);
      } else {
        // Fallback to start region if queue is empty
        const startRegion = this.getPrimaryStartRegion();
        if (startRegion) this.expansionState.setRegionExpanded(startRegion, true);
      }
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
    this.eventBus.publish('loopUI:modeChanged', { active: this.isLoopModeActive });

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

    // Add start region back to expanded regions
    const startRegion = this.getPrimaryStartRegion();
    if (startRegion) this.expansionState.setRegionExpanded(startRegion, true);

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
      case 'customAction':
        return `Explore ${action.sourceRegion}`;
      case 'locationCheck':
        return `Check ${action.locationName}`;
      case 'regionMove':
        return `Move to ${action.destinationRegion}`;
      default:
        return `${action.type}`;
    }
  }
}

export default LoopUI;
