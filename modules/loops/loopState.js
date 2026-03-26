/**
 * Loop state manager for the incremental game
 * Manages game state for the loop mode, including:
 * - Experience levels for regions
 * - Action queue
 * - Mana resources
 * - Loop progress and reset logic
 */

// REMOVED: import { stateManagerSingleton } from '../stateManager/index.js';
// Correctly import the default export from the singleton file if needed
// import stateManagerSingleton from '../stateManager/stateManagerSingleton.js';
// REMOVED: import eventBus from '../../app/core/eventBus.js';
import {
  proposedLinearReduction,
  proposedLinearFinalCost,
} from './xpFormulas.js';
import { ActionQueueManager } from './actionQueueManager.js';
import discoveryStateSingleton from '../discovery/singleton.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('loopState', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[loopState] ${message}`, ...data);
  }
}

export class LoopState {
  constructor() {
    // Injected dependencies (will be set via setDependencies)
    this.eventBus = null;
    this.stateManager = null;
    this.dispatcher = null;
    this.playerState = null; // NEW: playerState API
    this.costDataManager = null; // Cost data for per-region/per-location costs

    // Action queue manager (will be initialized after playerState is set)
    this.actionQueueManager = null;

    // Resources
    this.maxMana = 100;
    this.currentMana = 100;
    this.manaPerItem = 10; // How much each inventory item increases max mana

    // Experience tracking
    this.regionXP = new Map(); // regionName -> {level, xp, xpForNextLevel}

    // Action processing - now based on playerState path
    this.currentActionIndex = 0; // Index in the playerState path
    this.currentAction = null; // Current action being processed
    this.isProcessing = false;
    this.isPaused = false; // Not paused — idle (no queue started yet)
    this._queueCompleted = false; // True after queue runs to the end (distinct from idle)
    this.autoRestartQueue = false; // Flag to auto-restart queue when complete
    this.autoResumeOnNewAction = false; // Flag to auto-resume when a new action is added after completion
    this.autoRemoveCompleted = false; // Flag to auto-remove completed actions from queue
    this.gameSpeed = 100; // Multiplier for processing speed

    // Test mode flags
    this.instantMode = false; // When true, actions complete in one frame
    this.noManaDepletionReset = false; // When true, don't reset loop when mana reaches 0
    this.manaDebt = 0; // Track how negative mana went (for testing)

    // REMOVED: Discovery tracking
    // this.discoveredRegions = new Set(['Menu']); // Start with Menu discovered
    // this.discoveredLocations = new Set();
    // this.discoveredExits = new Map(); // regionName -> Set of exit names
    this.repeatExploreStates = new Map(); // NEW: regionName -> boolean

    // REMOVED: Initialize exits for the starting region
    // this.discoveredExits.set('Menu', new Set());

    // Animation frame tracking
    this._animationFrameId = null;

    // Auto-save interval
    this._saveIntervalId = null;
  }

  /**
   * Sets the required dependencies for the LoopState instance.
   * Should be called before or during initialize.
   * @param {object} dependencies - Object containing dependencies.
   * @param {EventBus} dependencies.eventBus - The application's event bus instance.
   * @param {StateManager} dependencies.stateManager - The application's state manager instance.
   * @param {Object} dependencies.playerState - The playerState API functions.
   */
  setDependencies(dependencies) {
    if (!dependencies.eventBus || !dependencies.stateManager) {
      log(
        'error',
        '[LoopState] Missing required dependencies (eventBus, stateManager).'
      );
      return;
    }
    log('info', '[LoopState] Setting dependencies...');
    this.eventBus = dependencies.eventBus;
    this.stateManager = dependencies.stateManager;
    this.dispatcher = dependencies.dispatcher || null;
    this.playerState = dependencies.playerState; // Store playerState API

    // Initialize ActionQueueManager now that we have playerState
    if (this.playerState) {
      this.actionQueueManager = new ActionQueueManager(this.playerState);
      log('info', '[LoopState] ActionQueueManager initialized');
    }

    // Re-setup listeners that depend on the event bus
    this._setupEventListeners();
  }

  /**
   * Set the cost data manager for per-region/per-location cost lookups.
   * Called after costDataManager is created (it's initialized after loopState).
   */
  setCostDataManager(costDataManager) {
    this.costDataManager = costDataManager;
    log('info', '[LoopState] CostDataManager set');
  }

  /**
   * Sets up event listeners for game events
   */
  _setupEventListeners() {
    // Ensure eventBus dependency is set
    if (!this.eventBus) {
      log(
        'warn',
        '[LoopState] Attempted to set up event listeners before eventBus dependency was set.'
      );
      return;
    }
    // Subscribe to snapshot updates for mana recalculation
    this.eventBus.subscribe('stateManager:snapshotUpdated', (eventData) => {
      if (eventData && eventData.snapshot) {
        this.recalculateMaxMana(eventData.snapshot); // Pass snapshot data
      } else {
        log(
          'warn',
          '[LoopState] Received snapshotUpdated event without snapshot data.'
        );
      }
    });
  }

  /**
   * Initialize the loop state when data is loaded
   */
  initialize() {
    // Ensure dependencies are set
    if (!this.stateManager || !this.eventBus) {
      log('error', '[LoopState] Cannot initialize: Dependencies not set.');
      return;
    }
    // REMOVED: Calculate initial mana based on current inventory
    // Initial mana will be set when the first snapshot arrives via the event listener.
    // this.recalculateMaxMana();

    // REMOVED: Initialize discoverable regions and exits
    // this._initializeDiscoverableData();

    // Set up auto-save timer
    this._setupAutoSave();

    // Automatic loading disabled — use the Load Game button in the UI instead
    // this.loadFromStorage();
  }

  /**
   * Calculate max mana based on inventory items from a snapshot
   * @param {object} snapshot - The state snapshot containing inventory data.
   */
  recalculateMaxMana(snapshot) {
    // Accepts snapshot as argument
    // Dependencies should already be set if this is called via event listener
    if (!this.stateManager || !this.eventBus) {
      log(
        'warn',
        '[LoopState] Cannot recalculate max mana: Dependencies not set (should not happen via event).'
      );
      return;
    }
    // Base mana + extra for each inventory item
    const baseMana = 100;
    let itemCount = 0;

    // REMOVED: Get current snapshot from the proxy
    // const snapshot = this.stateManager.getSnapshot();

    // Count all items in inventory from the provided snapshot argument
    if (snapshot && snapshot.inventory) {
      // Check snapshot.inventory directly

      // Assuming snapshot.inventory is a plain object { item: count }
      // Iterate the inventory object directly
      const itemsIterable = Object.entries(snapshot.inventory);

      for (const [item, count] of itemsIterable) {
        if (count > 0) {
          itemCount += count;
        }
      }
    } else {
      log(
        'warn',
        '[LoopState] Could not get inventory data from state snapshot.'
      );
    }

    this.maxMana = baseMana + itemCount * this.manaPerItem;

    // Cap current mana if it exceeds the new maximum
    if (this.currentMana > this.maxMana) {
      this.currentMana = this.maxMana;
    }

    // Notify about mana changes
    this.eventBus.publish('loopState:manaChanged', {
      current: this.currentMana,
      max: this.maxMana,
    });
  }

  /**
   * Get XP data for a region
   * @param {string} regionName - Name of the region
   * @returns {Object} - XP data for the region
   */
  getRegionXP(regionName) {
    if (!this.regionXP.has(regionName)) {
      // Initialize region XP data if not exists
      this.regionXP.set(regionName, {
        level: 0,
        xp: 0,
        xpForNextLevel: 100,
      });
    }

    return this.regionXP.get(regionName);
  }

  /**
   * Add XP to a region
   * @param {string} regionName - Name of the region
   * @param {number} amount - Amount of XP to add
   */
  addRegionXP(regionName, amount) {
    const xpData = this.getRegionXP(regionName);
    xpData.xp += amount;

    // Check for level up
    while (xpData.xp >= xpData.xpForNextLevel) {
      xpData.xp -= xpData.xpForNextLevel;
      xpData.level += 1;
      xpData.xpForNextLevel = this._calculateXPForNextLevel(xpData.level);

      // Always notify UI of level up
      this.eventBus.publish('loopState:xpChanged', { regionName, xpData });
    }
  }

  /**
   * Calculate XP required for the next level
   * @param {number} currentLevel - Current level
   * @returns {number} - XP required for next level
   */
  _calculateXPForNextLevel(currentLevel) {
    // Linear formula: 100 + (level * 20)
    return 100 + currentLevel * 20;
  }

  /**
   * Get the current action queue from playerState path
   * Delegates to ActionQueueManager
   * @returns {Array} Array of action objects
   */
  getActionQueue() {
    if (!this.actionQueueManager) {
      return [];
    }
    return this.actionQueueManager.getActionQueue();
  }

  /**
   * Queue an action by adding it to playerState path
   * @param {Object} action - Action to add
   * @param {string} targetRegion - Region to insert the action at (optional)
   * @param {number} targetInstance - Instance number to insert at (optional)
   */
  queueAction(action, targetRegion = null, targetInstance = null) {
    if (!this.playerState) {
      log('error', '[LoopState] Cannot queue action: playerState not available');
      return;
    }

    // Map action types to playerState path entries
    if (action.type === 'customAction') {
      if (targetRegion && targetInstance) {
        // Insert at specific location
        this.playerState.insertCustomActionAt(action.actionName, targetRegion, targetInstance, {});
      } else {
        // Add to current location
        this.playerState.addCustomAction(action.actionName, {});
      }
    } else if (action.type === 'locationCheck') {
      if (targetRegion && targetInstance) {
        // Insert at specific location
        this.playerState.insertLocationCheckAt(action.locationName, targetRegion, targetInstance, action.sourceRegion);
      } else {
        // Add to current location
        this.playerState.addLocationCheck(action.locationName, action.sourceRegion);
      }
    } else if (action.type === 'regionMove') {
      // Movement is handled by the user:regionMove event, not added here
      log('warn', '[LoopState] regionMove actions should be handled via user:regionMove event');
    }

    // Get updated queue
    const queue = this.getActionQueue();

    //log('info', 'Action queued:', action);
    this.eventBus.publish('loopState:queueUpdated', {
      queue: queue,
    });

    // Start processing if not already running.
    // Auto-resume from waiting state is handled by EventCoordinator
    // listening to playerState:pathUpdated.
    if (!this.isProcessing && !this.isPaused && !this._queueCompleted) {
      this.startProcessing();
    }
  }

  /**
   * Remove an action from the queue by index
   * @param {number} index - Index of action to remove in the current action queue
   */
  removeAction(index) {
    if (!this.actionQueueManager) {
      log('error', '[LoopState] Cannot remove action: actionQueueManager not available');
      return false;
    }

    const queue = this.getActionQueue();
    if (index < 0 || index >= queue.length) {
      log('warn', '[LoopState] Invalid action index for removal:', index);
      return false;
    }

    const actionToRemove = queue[index];

    // Check if this is a regionMove action (can't be removed)
    if (actionToRemove.type === 'regionMove') {
      log('warn', '[LoopState] Cannot remove regionMove actions - they are managed by navigation');
      return false;
    }

    // Delegate removal to ActionQueueManager (handles playerState and tracking cleanup)
    const success = this.actionQueueManager.removeAction(index);

    if (!success) {
      return false;
    }

    // LoopState-specific logic: Handle processing state
    if (index === this.currentActionIndex && this.isProcessing) {
      // If we removed the current action, stop processing
      this.stopProcessing();
    } else if (index < this.currentActionIndex) {
      // If removing an action before the current one, adjust the index
      this.currentActionIndex--;
    }

    // Get updated queue and notify
    const updatedQueue = this.getActionQueue();
    this.eventBus.publish('loopState:queueUpdated', {
      queue: updatedQueue,
    });

    // Restart processing if stopped and there are actions to process
    if (!this.isProcessing && updatedQueue.length > 0 && !this.isPaused) {
      // If we removed all actions up to current index, reset to beginning
      if (this.currentActionIndex >= updatedQueue.length) {
        this.currentActionIndex = 0;
      }
      this.startProcessing();
    }

    return true;
  }
  
  /**
   * Clear all actions from the queue
   */
  clearQueue() {
    if (!this.playerState) {
      log('error', '[LoopState] Cannot clear queue: playerState not available');
      return;
    }

    // Stop processing
    if (this.isProcessing) {
      this.stopProcessing();
    }

    // Clear queue via ActionQueueManager
    if (this.actionQueueManager) {
      this.actionQueueManager.clearQueue();
    }
    this.currentActionIndex = 0;

    // Get updated queue
    const queue = this.getActionQueue();

    // Notify queue updated
    this.eventBus.publish('loopState:queueUpdated', {
      queue: queue,
    });
  }

  /**
   * Atomically reset the entire queue: stop processing, clear all path entries
   * (including regionMoves), clear tracking, and emit a single queue update.
   * Use this before building a new queue from scratch.
   */
  resetQueue() {
    // Stop processing
    if (this.isProcessing) {
      this.stopProcessing();
    }
    this._queueCompleted = false;

    // Clear tracking in ActionQueueManager (progress, completion)
    if (this.actionQueueManager) {
      this.actionQueueManager.actionProgress.clear();
      this.actionQueueManager.actionCompleted.clear();
    }
    this.currentActionIndex = 0;

    // Clear the entire playerState path
    if (this.playerState) {
      this.playerState.removeAllActionsOfType('locationCheck');
      this.playerState.removeAllActionsOfType('customAction');
      if (this.playerState.reset) {
        this.playerState.reset();
      } else {
        this.playerState.trimPath();
      }
    }

    // Emit single queue update with the now-empty queue
    const queue = this.getActionQueue();
    this.eventBus.publish('loopState:queueUpdated', {
      queue: queue,
    });
  }

  /**
   * Clear all explore actions from the queue
   */
  clearExploreActions() {
    if (!this.playerState) {
      log('error', '[LoopState] Cannot clear explore actions: playerState not available');
      return;
    }
    
    // Remove all explore custom actions
    const removedCount = this.playerState.removeAllActionsOfType('customAction', 'explore');
    
    if (removedCount > 0) {
      // Clean up tracking for removed actions
      // Note: We'd need to match pathIndex to clean up properly, but this is a bulk operation
      // For now, we'll let the getActionQueue method handle missing progress
      
      // Get updated queue
      const queue = this.getActionQueue();
      
      // Notify queue updated
      this.eventBus.publish('loopState:queueUpdated', {
        queue: queue,
      });

      log('info', `[LoopState] Cleared ${removedCount} explore actions`);
    }
  }

  /**
   * Start processing the action queue
   */
  startProcessing() {
    const queue = this.getActionQueue();

    if (this.isPaused || this.isProcessing) {
      return;
    }

    // If there are no actions, don't start processing
    if (queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    this._queueCompleted = false;

    // Always reset currentActionIndex when starting fresh
    this.currentActionIndex = 0;

    // Make sure the index is valid
    if (this.currentActionIndex >= queue.length) {
      // No more actions to process
      log('info', 'No more actions to process, stopping');
      this.stopProcessing();
      return;
    }

    this.currentAction = queue[this.currentActionIndex];
    log('info', `Starting to process action at index ${this.currentActionIndex}:`, this.currentAction);

    // Ensure we have a valid action
    if (!this.currentAction) {
      log('error', 'No valid action at index', this.currentActionIndex);
      this.isProcessing = false;
      return;
    }

    // Initialize progress if not tracked yet
    if (!this.actionQueueManager.getProgress(this.currentAction.pathIndex)) {
      this.actionQueueManager.setProgress(this.currentAction.pathIndex, 0);
    }
    
    // Set current action progress from tracking
    this.currentAction.progress = this.actionQueueManager.getProgress(this.currentAction.pathIndex);

    // Cancel any existing animation frame
    if (this._animationFrameId) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }

    // Start animation frame for smooth updates
    this._lastFrameTime = null; // Reset to ensure proper first frame
    this._animationFrameId = requestAnimationFrame(
      this._processFrame.bind(this)
    );

    //log('info', 'Started processing action:', this.currentAction);

    this.eventBus.publish('loopState:processingStarted', {
      action: this.currentAction,
    });
  }

  /**
   * Resume processing from the current action index.
   * Unlike startProcessing() which resets to the beginning, this continues
   * from where processing left off. Used by auto-resume on new action.
   */
  resumeProcessing() {
    const queue = this.getActionQueue();

    if (this.isPaused || this.isProcessing) {
      return;
    }

    if (queue.length === 0 || this.currentActionIndex >= queue.length) {
      return;
    }

    this.isProcessing = true;
    this._queueCompleted = false;

    this.currentAction = queue[this.currentActionIndex];

    if (!this.currentAction) {
      log('error', '[LoopState] No valid action at index', this.currentActionIndex);
      this.isProcessing = false;
      return;
    }

    // Initialize progress if not tracked yet
    if (!this.actionQueueManager.getProgress(this.currentAction.pathIndex)) {
      this.actionQueueManager.setProgress(this.currentAction.pathIndex, 0);
    }
    this.currentAction.progress = this.actionQueueManager.getProgress(this.currentAction.pathIndex);

    // Cancel any existing animation frame
    if (this._animationFrameId) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }

    this._lastFrameTime = null;
    this._animationFrameId = requestAnimationFrame(
      this._processFrame.bind(this)
    );

    this.eventBus.publish('loopState:pauseStateChanged', {
      isPaused: false,
      processingState: this.getProcessingState(),
    });
  }

  /**
   * Stop processing the current action
   */
  stopProcessing() {
    if (!this.isProcessing) {
      return;
    }

    this.isProcessing = false;

    // Don't reset the action progress during a pause,
    // so we can continue from where we left off

    // Cancel animation frame
    if (this._animationFrameId) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }

    this.eventBus.publish('loopState:processingStopped', {});
  }

  /**
   * Pause/unpause the action queue
   * @param {boolean} isPaused - Whether to pause or unpause
   */
  setPaused(isPaused) {
    this.isPaused = isPaused;

    if (isPaused) {
      this.stopProcessing();
    } else {
      const queue = this.getActionQueue();
      if (queue.length > 0) {
        // Check if we need to reset the loop before resuming
        // This handles the case where the queue finished and user unpauses
        const needsReset = this._shouldResetOnResume(queue);

        if (needsReset) {
          // Reset loop to refill mana and reset action progress
          this._resetLoop();
        }

        this.startProcessing();
      }
    }

    // Single authoritative event after all state has settled
    this.eventBus.publish('loopState:pauseStateChanged', {
      isPaused: this.isPaused,
      processingState: this.getProcessingState(),
    });
  }

  /**
   * Get the current processing state:
   *   'idle'      — queue not started or empty; button: "Start"
   *   'running'   — actively processing actions; button: "Pause"
   *   'paused'    — user paused mid-queue; button: "Resume"
   *   'completed' — queue ran to the end; button: "Restart"
   *   'waiting'   — queue completed, auto-resume enabled, waiting for new actions
   * @returns {'idle'|'running'|'paused'|'completed'|'waiting'}
   */
  getProcessingState() {
    if (this.isProcessing) return 'running';
    if (this.isPaused) return 'paused';
    if (this._queueCompleted) {
      return this.autoResumeOnNewAction ? 'waiting' : 'completed';
    }
    return 'idle';
  }

  /**
   * Check if we should reset the loop when resuming from pause
   * Returns true if all actions are completed or if we've reached the end of the queue
   * @param {Array} queue - The action queue
   * @returns {boolean} - Whether to reset
   */
  _shouldResetOnResume(queue) {
    if (!queue || queue.length === 0) {
      return false;
    }

    // If there are no actions, no need to reset
    if (queue.length === 0) {
      return false;
    }

    // Check if all actions are completed
    let allCompleted = true;
    for (let i = 0; i < queue.length; i++) {
      const action = queue[i];
      // Skip checkLocation actions for already-checked locations
      if (action.type === 'locationCheck') {
        const snapshot = this.stateManager.getLatestStateSnapshot();
        const isChecked = snapshot?.checkedLocations?.includes(action.locationName);
        if (isChecked) {
          continue; // This one doesn't count, it's already done
        }
      }
      // Check if action is completed
      if (!action.completed && action.progress < 100) {
        allCompleted = false;
        break;
      }
    }

    // Also reset if currentActionIndex is past the end of the queue
    // (this means we finished processing)
    if (this.currentActionIndex >= queue.length) {
      return true;
    }

    return allCompleted;
  }

  /**
   * Set game speed multiplier
   * @param {number} speed - Speed multiplier (1.0 = normal speed)
   */
  setGameSpeed(speed) {
    // Allow Infinity for instant mode, otherwise cap at 1000
    if (speed === Infinity) {
      this.gameSpeed = Infinity;
    } else {
      this.gameSpeed = Math.max(0.1, Math.min(1000, speed));
    }

    // Reset the _lastFrameTime to ensure smooth speed transitions
    if (this.isProcessing) {
      this._lastFrameTime = null;
    }

    this.eventBus.publish('loopState:speedChanged', { speed: this.gameSpeed });
  }

  /**
   * Set instant mode - actions complete in one frame
   * @param {boolean} enabled - Whether to enable instant mode
   */
  setInstantMode(enabled) {
    this.instantMode = enabled;
    log('info', `[LoopState] Instant mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Set no-mana-depletion-reset mode - don't reset loop when mana reaches 0
   * @param {boolean} enabled - Whether to enable no-reset mode
   */
  setNoManaDepletionReset(enabled) {
    this.noManaDepletionReset = enabled;
    log('info', `[LoopState] No-mana-depletion-reset mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get the current mana debt (how negative mana went)
   * @returns {number} The mana debt
   */
  getManaDebt() {
    return this.manaDebt;
  }

  /**
   * Reset mana debt tracking
   */
  resetManaDebt() {
    this.manaDebt = 0;
  }

  /**
   * Process a single animation frame
   * @param {number} timestamp - Current timestamp
   */
  _processFrame(timestamp) {
    if (!this.isProcessing || this.isPaused) {
      this._animationFrameId = null;
      return;
    }

    if (!this._lastFrameTime) {
      this._lastFrameTime = timestamp;
      this._animationFrameId = requestAnimationFrame(
        this._processFrame.bind(this)
      );
      return;
    }

    // Calculate time delta and apply game speed
    const deltaTime = (timestamp - this._lastFrameTime) * this.gameSpeed;
    this._lastFrameTime = timestamp;

    try {
      // Get current queue from playerState
      const queue = this.getActionQueue();
      
      // Verify we have a valid current action and index
      if (
        !this.currentAction ||
        this.currentActionIndex >= queue.length
      ) {
        log('error', 'Invalid action state in _processFrame:', {
          currentActionIndex: this.currentActionIndex,
          queueLength: queue.length,
          hasCurrentAction: !!this.currentAction,
        });

        // Try to recover by finding a valid action
        if (queue.length > 0) {
          this.currentActionIndex = 0;
          this.currentAction = queue[this.currentActionIndex];
        } else {
          // No actions left, stop processing
          this.stopProcessing();
          return;
        }
      }

      // Process current action
      const actionCost = this._calculateActionCost(this.currentAction);

      // Calculate progress increment
      let progressIncrement;
      const currentProgress = this.actionQueueManager.getProgress(this.currentAction.pathIndex) || 0;

      if (actionCost === 0 || this.instantMode) {
        // Zero-cost or instant mode: complete action in one frame
        progressIncrement = 100 - currentProgress;
      } else {
        // Slow down the action for better visibility - use 20 instead of 100
        progressIncrement = (deltaTime / 1000) * (20 / actionCost);
      }

      // Update progress in our tracking Map
      const newProgress = currentProgress + progressIncrement;
      this.actionQueueManager.setProgress(this.currentAction.pathIndex, newProgress);
      this.currentAction.progress = newProgress;

      // Reduce mana based on progress
      const manaCost = (progressIncrement / 100) * actionCost;
      const newMana = this.currentMana - manaCost;

      // Track mana debt if mana goes negative
      if (newMana < 0 && this.noManaDepletionReset) {
        this.manaDebt = Math.max(this.manaDebt, Math.abs(newMana));
        this.currentMana = newMana; // Allow negative mana for tracking
      } else {
        this.currentMana = Math.max(0, newMana);
      }

      // Publish mana changed event immediately after update
      this.eventBus.publish('loopState:manaChanged', {
        current: this.currentMana,
        max: this.maxMana,
      });

      // Continuous XP gain during action
      if (this.currentAction.sourceRegion) {
        // Award 1 XP per mana spent
        const xpGain = (progressIncrement / 100) * actionCost;

        // SIMPLIFIED XP Gain: Always award 1x XP during explore/other actions.
        // The 4x "farming" logic relied on discovery state which is now removed.
        // This logic can be reinstated later by querying DiscoveryState if needed.
        this.addRegionXP(this.currentAction.sourceRegion, xpGain);

        // Notify UI about XP change even for small increments
        const xpData = this.getRegionXP(this.currentAction.sourceRegion);
        this.eventBus.publish('loopState:xpChanged', {
          regionName: this.currentAction.sourceRegion,
          xpData,
        });
      }

      // Log every few frames for debugging
      //if (Math.random() < 0.05) {
      //  log('info',
      //    `Action progress: ${this.currentAction.progress.toFixed(
      //      2
      //    )}%, Mana: ${this.currentMana.toFixed(2)}/${this.maxMana}`
      //  );
      //}

      // Check for action completion
      if (this.currentAction.progress >= 100) {
        //log('info', 'Action completed:', this.currentAction);
        this._completeCurrentAction();

        // _completeCurrentAction may have stopped processing (queue finished
        // or paused). Don't fall through to the mana check — it would
        // overwrite the idle/paused state with a spurious _resetLoop.
        if (!this.isProcessing) return;
      }

      // Check for loop reset (out of mana)
      if (this.currentMana <= 0 && !this.noManaDepletionReset) {
        //log('info', 'Loop reset: out of mana');
        this._resetLoop();

        if (!this.autoRestartQueue) {
          // Pause at end of loop — user must click Resume to go again
          this.isPaused = true;
          this.stopProcessing();
          this.eventBus.publish('loopState:pauseStateChanged', {
            isPaused: true,
            processingState: this.getProcessingState(),
          });
          return;
        }

        // Auto-restart: continue processing
        this._animationFrameId = requestAnimationFrame(
          this._processFrame.bind(this)
        );
        return;
      }
      // Update UI - important to keep this happening
      // Always include mana data, but only include action if it exists
      const eventData = {
        mana: {
          current: this.currentMana,
          max: this.maxMana,
        },
      };

      // Only include action data if there's a current action
      if (this.currentAction) {
        eventData.action = this.currentAction;
      }

      this.eventBus.publish('loopState:progressUpdated', eventData);
    } catch (error) {
      log('error', 'Error in _processFrame:', error);
      // Try to recover by stopping processing
      this.stopProcessing();
      return;
    }

    // Request next frame - this must always happen during processing
    this._animationFrameId = requestAnimationFrame(
      this._processFrame.bind(this)
    );
  }

  /**
   * Complete the current action
   */
  _completeCurrentAction() {
    // Apply action effects
    this._applyActionEffects(this.currentAction);

    // Mark as completed in our tracking
    this.actionQueueManager.markCompleted(this.currentAction.pathIndex);
    this.actionQueueManager.setProgress(this.currentAction.pathIndex, 100);
    this.currentAction.completed = true;
    this.currentAction.progress = 100; // Ensure it shows 100% complete

    // Notify completion
    this.eventBus.publish('loopState:actionCompleted', {
      action: this.currentAction,
    });

    // Check if this is an explore action that just completed
    if (this.currentAction.type === 'customAction' && this.currentAction.actionName === 'explore') {
      // Get the region from the action
      const regionName = this.currentAction.sourceRegion;

      // Get the repeat state from THIS instance's map
      const shouldRepeat = this.getRepeatExplore(regionName); // Use internal method

      // Get current queue to check for more explore actions
      const queue = this.getActionQueue();

      // Check if there are already more explore actions for this region in the queue
      const hasMoreExploreActions = queue.some(
        (action, index) =>
          index > this.currentActionIndex &&
          action.type === 'customAction' &&
          action.sourceRegion === regionName
      );

      // Only add a new explore action if shouldRepeat is true AND there are no more explore actions for this region
      if (shouldRepeat && !hasMoreExploreActions) {
        //log('info',
        //  `Repeating explore action for ${regionName} (repeat state is true, no other explore actions pending)`
        //);

        // Add a new explore action to playerState
        if (this.playerState && this.playerState.addCustomAction) {
          this.playerState.addCustomAction('explore', { repeat: true });
        }

        // Notify that a new explore action was added
        this.eventBus.publish('loopState:exploreActionRepeated', {
          regionName: regionName,
        });
      }
    }

    // Move to next action in the queue or wrap around to beginning
    this.currentActionIndex++;

    // Get updated queue
    const queue = this.getActionQueue();
    
    // Loop to find the next valid, runnable action, skipping checked locations
    while (this.currentActionIndex < queue.length) {
      const nextAction = queue[this.currentActionIndex];

      // Check if it's a locationCheck action for an already checked location
      if (nextAction.type === 'locationCheck') {
        const snapshot = this.stateManager.getLatestStateSnapshot();
        const isChecked = snapshot?.checkedLocations?.includes(nextAction.locationName);
        if (isChecked) {
          //log('info',
          //  `Skipping already checked location: ${nextAction.locationName}.`
          //);
          // Mark as completed since it's already checked
          this.actionQueueManager.markCompleted(nextAction.pathIndex);
          this.actionQueueManager.setProgress(nextAction.pathIndex, 100);

          // Skip to next action
          this.currentActionIndex++;

          // Continue the loop to check the next action at the current index
        } else {
          // Location not checked, this is a valid action
          break;
        }
      } else {
        // Found a valid action to process (not a checkLocation)
        break;
      }
    }

    // If we reached the end of the queue
    if (this.currentActionIndex >= queue.length) {
      // Reset to beginning if auto-restart is enabled
      if (this.autoRestartQueue) {
        this.currentActionIndex = 0;
        this._resetActionsProgress();
      } else {
        // Queue completed — transition to completed state
        this.currentAction = null;
        this.isProcessing = false;
        this.isPaused = false;
        this._queueCompleted = true;
        this.eventBus.publish('loopState:queueCompleted', {});
        this.eventBus.publish('loopState:pauseStateChanged', {
          isPaused: this.isPaused,
          processingState: this.getProcessingState(),
        });
        return;
      }
    }

    // Start processing next action if there's one available
    if (this.currentActionIndex < queue.length) {
      this.currentAction = queue[this.currentActionIndex];
      // Initialize progress for new action if not tracked yet
      if (!this.actionQueueManager.getProgress(this.currentAction.pathIndex)) {
        this.actionQueueManager.setProgress(this.currentAction.pathIndex, 0);
      }
      this.currentAction.progress = this.actionQueueManager.getProgress(this.currentAction.pathIndex);
      this.eventBus.publish('loopState:newActionStarted', {
        action: this.currentAction,
      });
    }
  }

  /**
   * Apply the effects of completing an action
   * @param {Object} action - The completed action
   */
  _applyActionEffects(action) {
    if (!this.dispatcher) {
      log(
        'warn',
        '[LoopState] Cannot apply action effects: dispatcher dependency missing.'
      );
      return;
    }

    switch (action.type) {
      case 'customAction':
        // Publish event for discovery module via dispatcher
        this.dispatcher.publish('loop:exploreCompleted', {
          regionName: action.sourceRegion,
        });
        break;
      case 'locationCheck':
        // Propagate user:locationCheck through the normal dispatcher chain
        // (discovery → playerState → stateManager), the same way it flows
        // when loop mode is inactive. The fromLoop flag tells playerState
        // to skip adding a duplicate path entry since the loop already
        // added it when the queue was built.
        this.dispatcher.publishToNextModule('loops', 'user:locationCheck', {
          locationName: action.locationName,
          regionName: action.sourceRegion,
          fromLoop: true,
        }, { direction: 'up' });
        break;
      case 'regionMove':
        // Publish event for discovery module via dispatcher
        this.dispatcher.publish('loop:moveCompleted', {
          sourceRegion: action.sourceRegion,
          destinationRegion: action.destinationRegion,
          exitName: action.exitUsed,
        });
        break;
    }
  }

  /**
   * Calculate the mana cost of an action.
   * Uses per-region/per-location costs from costDataManager when available,
   * falling back to hardcoded defaults.
   * @param {Object} action - The action
   * @returns {number} - Mana cost
   */
  _calculateActionCost(action) {
    let baseCost;

    if (this.costDataManager?.isLoaded()) {
      // Use per-region/per-location costs from cost data
      switch (action.type) {
        case 'regionMove':
          // Move cost = source region's moveCost
          baseCost = this.costDataManager.getRegionCost(action.sourceRegion);
          break;
        case 'locationCheck':
          // Location check cost = per-location cost
          baseCost = this.costDataManager.getLocationCost(action.locationName);
          break;
        case 'customAction':
          // Explore cost = 2x region's moveCost
          baseCost = this.costDataManager.getRegionCost(action.sourceRegion) * 2;
          break;
        default:
          baseCost = 50;
      }
    } else {
      // Fallback to hardcoded defaults when no cost data is loaded
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
      const xpData = this.getRegionXP(action.sourceRegion);
      return proposedLinearFinalCost(baseCost, xpData.level);
    }

    return baseCost;
  }

  /**
   * Reset progress for all actions in the queue
   * Also resets currentActionIndex so next startProcessing() starts fresh
   */
  _resetActionsProgress() {
    if (!this.actionQueueManager) return;
    // Clear all progress tracking
    this.actionQueueManager.resetProgress();
    // Reset current action index so startProcessing() starts from the beginning
    this.currentActionIndex = 0;
    this.currentAction = null;
  }

  /**
   * Full reset for when new rules/preset are loaded.
   * Unlike _resetLoop() which just resets mana and action progress for a loop iteration,
   * this clears all accumulated state (XP, explore states, etc.) that is preset-specific.
   */
  resetForNewRules() {
    // Stop any active processing
    this.stopProcessing();

    // Reset mana to base values
    this.maxMana = 100;
    this.currentMana = this.maxMana;
    this.manaDebt = 0;

    // Clear accumulated state
    this.regionXP.clear();
    this.repeatExploreStates.clear();

    // Reset action progress
    this._resetActionsProgress();

    // Reset to idle (not paused, not processing, not completed)
    this.isPaused = false;
    this._queueCompleted = false;

    // Notify about the reset
    if (this.eventBus) {
      this.eventBus.publish('loopState:loopReset', {
        mana: {
          current: this.currentMana,
          max: this.maxMana,
        },
        paused: true,
      });
    }
  }

  /**
   * Reset the loop: refill mana, reset action progress, reset to first action.
   * Does NOT modify pause state — the caller decides whether to pause or continue.
   */
  _resetLoop() {
    // Restore mana to full
    this.currentMana = this.maxMana;

    // Reset action progress tracking
    this._resetActionsProgress();

    // Reset to first action
    const queue = this.getActionQueue();
    this.currentActionIndex = 0;
    this.currentAction = queue.length > 0 ? queue[0] : null;
    this._queueCompleted = false;

    // Notify loop reset
    this.eventBus.publish('loopState:loopReset', {
      mana: {
        current: this.currentMana,
        max: this.maxMana,
      },
    });
  }

  /**
   * Set auto-restart mode for the queue
   * @param {boolean} autoRestart - Whether to auto-restart the queue
   */
  setAutoRestartQueue(autoRestart) {
    this.autoRestartQueue = autoRestart;
    this.eventBus.publish('loopState:autoRestartChanged', {
      autoRestart: this.autoRestartQueue,
    });
  }

  /**
   * Set auto-resume on new action mode.
   * When enabled, the queue automatically resumes from where it left off
   * when a new action is added after the queue has completed.
   * @param {boolean} autoResume - Whether to enable auto-resume
   */
  setAutoResumeOnNewAction(autoResume) {
    this.autoResumeOnNewAction = autoResume;
  }

  /**
   * Set auto-remove completed actions mode.
   * When enabled, completed actions are automatically removed from the queue:
   * - locationCheck actions for already-checked locations
   * - explore actions for fully-explored regions (all locations discovered)
   * @param {boolean} enabled - Whether to enable auto-removal
   */
  setAutoRemoveCompleted(enabled) {
    this.autoRemoveCompleted = enabled;
    if (enabled) {
      this.removeCompletedActions();
    }
  }

  /**
   * Remove completed actions from the queue.
   * Removes locationCheck actions for already-checked locations,
   * and explore actions for fully-explored regions (all locations and exits discovered).
   */
  removeCompletedActions() {
    if (!this.actionQueueManager) return;

    const queue = this.getActionQueue();
    if (queue.length === 0) return;

    const snapshot = this.stateManager?.getLatestStateSnapshot();
    const staticData = this.stateManager?.getStaticData();
    const checkedLocations = snapshot?.checkedLocations || [];

    // Collect indices to remove (in reverse order to avoid index shifting)
    const indicesToRemove = [];

    for (let i = queue.length - 1; i >= 0; i--) {
      const action = queue[i];

      // Skip the currently processing action
      if (i === this.currentActionIndex && this.isProcessing) continue;

      if (action.type === 'locationCheck') {
        if (checkedLocations.includes(action.locationName)) {
          indicesToRemove.push(i);
        }
      } else if (action.type === 'customAction' && action.actionName === 'explore') {
        if (this._isRegionFullyExplored(action.sourceRegion, staticData)) {
          indicesToRemove.push(i);
        }
      }
    }

    if (indicesToRemove.length === 0) return;

    log('info', `[LoopState] Auto-removing ${indicesToRemove.length} completed actions`);

    // Remove in reverse order (indices are already sorted descending)
    for (const index of indicesToRemove) {
      this.removeAction(index);
    }
  }

  /**
   * Check if a region is fully explored (all locations and exits discovered).
   * @param {string} regionName - The region name
   * @param {Object} [staticData] - Static data (optional, will be fetched if not provided)
   * @returns {boolean} True if the region has nothing left to discover
   * @private
   */
  _isRegionFullyExplored(regionName, staticData) {
    if (!staticData) staticData = this.stateManager?.getStaticData();
    const regionData = staticData?.regions?.get(regionName);
    if (!regionData) return false;

    const locations = regionData.locations || [];
    const exits = regionData.exits || [];

    // A region with nothing to discover is not considered "fully explored"
    // (it was never explorable in the first place)
    if (locations.length === 0 && exits.length === 0) return false;

    const allLocationsDiscovered = locations.every(loc =>
      discoveryStateSingleton.isLocationDiscovered(loc.name)
    );
    const allExitsDiscovered = exits.every(exit =>
      discoveryStateSingleton.isExitDiscovered(regionName, exit.name)
    );

    return allLocationsDiscovered && allExitsDiscovered;
  }

  /**
   * Disable repeat-explore for any regions that are now fully explored.
   * Safe to call during queue processing since it only modifies the
   * repeatExploreStates map, not the queue itself.
   */
  disableRepeatForExploredRegions() {
    const staticData = this.stateManager?.getStaticData();
    for (const [regionName, repeat] of this.repeatExploreStates) {
      if (repeat && this._isRegionFullyExplored(regionName, staticData)) {
        this.repeatExploreStates.set(regionName, false);
        log('info', `[LoopState] Disabled repeat-explore for fully explored region: ${regionName}`);
      }
    }
  }

  /**
   * Restart the queue from the beginning
   */
  restartQueue() {
    // Don't restart if paused or already processing
    if (this.isPaused) {
      return;
    }

    // Stop current processing if active
    if (this.isProcessing) {
      this.stopProcessing();
    }

    // Reset action index to beginning
    this.currentActionIndex = 0;

    // Reset progress on all actions
    this._resetActionsProgress();

    // Get queue from playerState
    const queue = this.getActionQueue();

    // Start processing if there are actions
    if (queue.length > 0) {
      this.startProcessing();
    }
  }

  /**
   * Restart the queue from the beginning
   * (with no reordering needed since we now maintain original order)
   */
  restartQueueFromBeginning() {
    // Stop current processing
    if (this.isProcessing) {
      this.stopProcessing();
    }

    // Reset to beginning
    this.currentActionIndex = 0;

    // Reset progress on all actions
    this._resetActionsProgress();

    // Restore mana to full
    this.currentMana = this.maxMana;

    // Notify about mana change
    this.eventBus.publish('loopState:manaChanged', {
      current: this.currentMana,
      max: this.maxMana,
    });

    // Get queue from playerState
    const queue = this.getActionQueue();

    // Notify about queue update (so UI can refresh)
    this.eventBus.publish('loopState:queueUpdated', {
      queue: queue,
    });

    // Start processing if there are actions
    if (queue.length > 0 && !this.isPaused) {
      this.startProcessing();
    }
  }

  /**
   * Set the repeat state for exploring a region.
   * @param {string} regionName
   * @param {boolean} repeat
   */
  setRepeatExplore(regionName, repeat) {
    this.repeatExploreStates.set(regionName, repeat);
    // Optionally save this state? For now, it's ephemeral.
  }

  /**
   * Get the repeat state for exploring a region.
   * @param {string} regionName
   * @returns {boolean}
   */
  getRepeatExplore(regionName) {
    return this.repeatExploreStates.get(regionName) || false;
  }

  /**
   * Get a serializable state object for saving
   * @returns {Object} - Serializable state
   */
  getSerializableState() {
    const queueState = this.actionQueueManager ? this.actionQueueManager.getState() : {
      actionProgress: [],
      actionCompleted: []
    };

    return {
      // Don't save maxMana as it should be calculated dynamically based on inventory
      currentMana: this.currentMana,
      regionXP: Array.from(this.regionXP.entries()),
      gameSpeed: this.gameSpeed,
      autoRestartQueue: this.autoRestartQueue,
      // Save progress tracking from ActionQueueManager
      actionProgress: queueState.actionProgress,
      actionCompleted: queueState.actionCompleted,
      currentActionIndex: this.currentActionIndex,
      repeatExploreStates: Array.from(this.repeatExploreStates.entries()),
    };
  }

  /**
   * Load state from a serialized object
   * @param {Object} state - Serialized state
   */
  loadFromSerializedState(state) {
    if (!state) return;

    // Load current mana, cap at a reasonable default if needed (e.g., 100) until snapshot arrives
    this.currentMana = state.currentMana ?? 100;

    // Load region XP
    this.regionXP = new Map(state.regionXP || []);

    // Load game speed
    this.gameSpeed = state.gameSpeed ?? 100;

    // Load auto-restart setting
    this.autoRestartQueue = state.autoRestartQueue ?? false;

    // Load progress tracking into ActionQueueManager
    if (this.actionQueueManager && (state.actionProgress || state.actionCompleted)) {
      this.actionQueueManager.loadState({
        actionProgress: state.actionProgress,
        actionCompleted: state.actionCompleted
      });
    }
    this.currentActionIndex = state.currentActionIndex ?? 0;

    // Load repeatExploreStates
    this.repeatExploreStates = new Map(state.repeatExploreStates || []);

    // Notify state loaded
    if (this.eventBus) {
      // Ensure eventBus is available
      this.eventBus.publish('loopState:stateLoaded', {});
    } else {
      log(
        'warn',
        '[LoopState] EventBus not available during loadFromSerializedState to publish stateLoaded event.'
      );
    }
  }

  /**
   * Save state to localStorage
   */
  saveToStorage() {
    try {
      const serializedState = this.getSerializableState();
      localStorage.setItem(
        'archipelago_loop_state',
        JSON.stringify(serializedState)
      );
    } catch (error) {
      log('error', 'Failed to save loop state:', error);
    }
  }

  /**
   * Load state from localStorage
   */
  loadFromStorage() {
    try {
      const savedState = localStorage.getItem('archipelago_loop_state');
      if (savedState) {
        const parsedState = JSON.parse(savedState);
        this.loadFromSerializedState(parsedState);
        return true;
      }
    } catch (error) {
      log('error', 'Failed to load loop state:', error);
    }
    return false;
  }

  /**
   * Set up auto-save timer
   */
  _setupAutoSave() {
    // Clear any existing interval
    if (this._saveIntervalId) {
      clearInterval(this._saveIntervalId);
    }

    // Save every minute
    this._saveIntervalId = setInterval(() => {
      this.saveToStorage();
    }, 60000);
  }

  /**
   * Clean up resources
   */
  dispose() {
    // Cancel animation frame
    if (this._animationFrameId) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }

    // Clear auto-save interval
    if (this._saveIntervalId) {
      clearInterval(this._saveIntervalId);
      this._saveIntervalId = null;
    }
  }
}
