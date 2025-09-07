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
    this.playerState = null; // NEW: playerState API

    // Resources
    this.maxMana = 100;
    this.currentMana = 100;
    this.manaPerItem = 10; // How much each inventory item increases max mana

    // Experience tracking
    this.regionXP = new Map(); // regionName -> {level, xp, xpForNextLevel}

    // Action processing - now based on playerState path
    this.currentActionIndex = 0; // Index in the playerState path
    this.actionProgress = new Map(); // pathIndex -> progress (0-100)
    this.actionCompleted = new Set(); // Set of completed path indices
    this.currentAction = null; // Current action being processed
    this.isProcessing = false;
    this.isPaused = true; // Start paused by default
    this.autoRestartQueue = false; // Flag to auto-restart queue when complete
    this.gameSpeed = 10; // Multiplier for processing speed

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
    this.playerState = dependencies.playerState; // Store playerState API

    // Re-setup listeners that depend on the event bus
    this._setupEventListeners();
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
    }, 'loops');
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

    // Try to load saved state
    this.loadFromStorage(); // Load saved mana/xp etc AFTER setting listeners
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
    }, 'loops');
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
      this.eventBus.publish('loopState:xpChanged', { regionName, xpData }, 'loops');
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
   * Maps path entries to action objects for processing
   * @returns {Array} Array of action objects
   */
  getActionQueue() {
    if (!this.playerState || !this.playerState.getPath) {
      return [];
    }
    
    const path = this.playerState.getPath();
    const actions = [];
    
    // Map each path entry to an action object
    path.forEach((entry, index) => {
      let action = null;
      
      if (entry.type === 'regionMove') {
        // Map regionMove to moveToRegion action
        action = {
          type: 'moveToRegion',
          regionName: entry.region,
          destinationRegion: entry.region, // For compatibility
          exitUsed: entry.exitUsed,
          instanceNumber: entry.instanceNumber,
          pathIndex: index
        };
      } else if (entry.type === 'locationCheck') {
        // Map locationCheck to checkLocation action
        action = {
          type: 'checkLocation',
          locationName: entry.locationName,
          regionName: entry.region,
          instanceNumber: entry.instanceNumber,
          pathIndex: index
        };
      } else if (entry.type === 'customAction') {
        // Map customAction based on actionName
        if (entry.actionName === 'explore') {
          action = {
            type: 'explore',
            regionName: entry.region,
            instanceNumber: entry.instanceNumber,
            pathIndex: index
          };
        }
        // Add other custom actions as needed
      }
      
      if (action) {
        // Add progress and completion status from our tracking
        action.progress = this.actionProgress.get(index) || 0;
        action.completed = this.actionCompleted.has(index);
        actions.push(action);
      }
    });
    
    return actions;
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
    if (action.type === 'explore') {
      if (targetRegion && targetInstance) {
        // Insert at specific location
        this.playerState.insertCustomActionAt('explore', targetRegion, targetInstance, {});
      } else {
        // Add to current location
        this.playerState.addCustomAction('explore', {});
      }
    } else if (action.type === 'checkLocation') {
      if (targetRegion && targetInstance) {
        // Insert at specific location
        this.playerState.insertLocationCheckAt(action.locationName, targetRegion, targetInstance, action.regionName);
      } else {
        // Add to current location
        this.playerState.addLocationCheck(action.locationName, action.regionName);
      }
    } else if (action.type === 'moveToRegion') {
      // Movement is handled by the user:regionMove event, not added here
      log('warn', '[LoopState] moveToRegion actions should be handled via user:regionMove event');
    }

    // Get updated queue
    const queue = this.getActionQueue();
    
    //log('info', 'Action queued:', action);
    this.eventBus.publish('loopState:queueUpdated', {
      queue: queue,
    }, 'loops');

    // Start processing if not already running
    if (!this.isProcessing && !this.isPaused) {
      this.startProcessing();
    }
  }

  /**
   * Remove an action from the queue by index
   * @param {number} index - Index of action to remove in the current action queue
   */
  removeAction(index) {
    if (!this.playerState) {
      log('error', '[LoopState] Cannot remove action: playerState not available');
      return false;
    }
    
    const queue = this.getActionQueue();
    if (index < 0 || index >= queue.length) {
      log('warn', '[LoopState] Invalid action index for removal:', index);
      return false;
    }
    
    const actionToRemove = queue[index];
    
    // Remove the action from playerState path
    if (actionToRemove.type === 'checkLocation') {
      this.playerState.removeLocationCheckAt(
        actionToRemove.locationName, 
        actionToRemove.regionName, 
        actionToRemove.instanceNumber
      );
    } else if (actionToRemove.type === 'explore') {
      this.playerState.removeCustomActionAt(
        'explore', 
        actionToRemove.regionName, 
        actionToRemove.instanceNumber
      );
    } else if (actionToRemove.type === 'moveToRegion') {
      log('warn', '[LoopState] Cannot remove regionMove actions - they are managed by navigation');
      return false;
    }
    
    // Clean up our tracking data
    if (actionToRemove.pathIndex !== undefined) {
      this.actionProgress.delete(actionToRemove.pathIndex);
      this.actionCompleted.delete(actionToRemove.pathIndex);
    }
    
    // If we removed the current action, stop processing
    if (index === this.currentActionIndex && this.isProcessing) {
      this.stopProcessing();
    } else if (index < this.currentActionIndex) {
      // If removing an action before the current one, adjust the index
      this.currentActionIndex--;
    }
    
    // Get updated queue and notify
    const updatedQueue = this.getActionQueue();
    this.eventBus.publish('loopState:queueUpdated', {
      queue: updatedQueue,
    }, 'loops');
    
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
    
    // Clear tracking
    this.actionProgress.clear();
    this.actionCompleted.clear();
    this.currentActionIndex = 0;
    
    // Remove all location checks and custom actions from the path
    this.playerState.removeAllActionsOfType('locationCheck');
    this.playerState.removeAllActionsOfType('customAction');
    
    // Get updated queue
    const queue = this.getActionQueue();
    
    // Notify queue updated
    this.eventBus.publish('loopState:queueUpdated', {
      queue: queue,
    }, 'loops');
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
      }, 'loops');
      
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

    // Check if we have any real actions to process (not just the initial Menu)
    let firstActionIndex = 0;
    if (queue.length > 0 && queue[0].type === 'regionMove' && queue[0].region === 'Menu' && !queue[0].exitUsed) {
      // First entry is the initial Menu position, real actions start at index 1
      firstActionIndex = 1;
    }
    
    // If there are no real actions, don't start processing
    if (firstActionIndex >= queue.length) {
      log('info', 'No actions to process (only initial Menu in queue)');
      return;
    }

    this.isProcessing = true;
    
    // Set the current action index to the first real action if not already set
    if (this.currentActionIndex === 0 || this.currentActionIndex === undefined) {
      this.currentActionIndex = firstActionIndex;
    }

    // Make sure the index is valid
    if (this.currentActionIndex >= queue.length) {
      // No more actions to process
      this.stopProcessing();
      return;
    }

    this.currentAction = queue[this.currentActionIndex];

    // Ensure we have a valid action
    if (!this.currentAction) {
      log('error', 'No valid action at index', this.currentActionIndex);
      this.isProcessing = false;
      return;
    }

    // Initialize progress if not tracked yet
    if (!this.actionProgress.has(this.currentAction.pathIndex)) {
      this.actionProgress.set(this.currentAction.pathIndex, 0);
    }
    
    // Set current action progress from tracking
    this.currentAction.progress = this.actionProgress.get(this.currentAction.pathIndex);

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
    }, 'loops');
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

    this.eventBus.publish('loopState:processingStopped', {}, 'loops');
  }

  /**
   * Pause/unpause the action queue
   * @param {boolean} isPaused - Whether to pause or unpause
   */
  setPaused(isPaused) {
    this.isPaused = isPaused;

    if (isPaused) {
      this.stopProcessing();
      this.eventBus.publish('loopState:paused', { isPaused: true }, 'loops');
    } else {
      const queue = this.getActionQueue();
      if (queue.length > 0) {
        this.startProcessing();
        this.eventBus.publish('loopState:resumed', { isPaused: false }, 'loops');
      } else {
        // Even if there are no actions, still publish the state change
        this.eventBus.publish('loopState:pauseStateChanged', {
          isPaused: this.isPaused,
        }, 'loops');
      }
    }
  }

  /**
   * Set game speed multiplier
   * @param {number} speed - Speed multiplier (1.0 = normal speed)
   */
  setGameSpeed(speed) {
    this.gameSpeed = Math.max(0.1, Math.min(100, speed));

    // Reset the _lastFrameTime to ensure smooth speed transitions
    if (this.isProcessing) {
      this._lastFrameTime = null;
    }

    this.eventBus.publish('loopState:speedChanged', { speed: this.gameSpeed }, 'loops');
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
          this.currentAction = queue[0];
        } else {
          // No actions left, stop processing
          this.stopProcessing();
          return;
        }
      }

      // Process current action
      const actionCost = this._calculateActionCost(this.currentAction);
      // Slow down the action for better visibility - use 20 instead of 100
      const progressIncrement = (deltaTime / 1000) * (20 / actionCost);

      // Update progress in our tracking Map
      const currentProgress = this.actionProgress.get(this.currentAction.pathIndex) || 0;
      const newProgress = currentProgress + progressIncrement;
      this.actionProgress.set(this.currentAction.pathIndex, newProgress);
      this.currentAction.progress = newProgress;

      // Reduce mana based on progress
      const manaCost = (progressIncrement / 100) * actionCost;
      this.currentMana = Math.max(0, this.currentMana - manaCost);

      // Publish mana changed event immediately after update
      this.eventBus.publish('loopState:manaChanged', {
        current: this.currentMana,
        max: this.maxMana,
      }, 'loops');

      // Continuous XP gain during action
      if (this.currentAction.regionName) {
        // Award 1 XP per mana spent
        const xpGain = (progressIncrement / 100) * actionCost;

        // SIMPLIFIED XP Gain: Always award 1x XP during explore/other actions.
        // The 4x "farming" logic relied on discovery state which is now removed.
        // This logic can be reinstated later by querying DiscoveryState if needed.
        this.addRegionXP(this.currentAction.regionName, xpGain);

        // Notify UI about XP change even for small increments
        const xpData = this.getRegionXP(this.currentAction.regionName);
        this.eventBus.publish('loopState:xpChanged', {
          regionName: this.currentAction.regionName,
          xpData,
        }, 'loops');
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
      }

      // Check for loop reset (out of mana)
      if (this.currentMana <= 0) {
        //log('info', 'Loop reset: out of mana');
        this._resetLoop();
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

      this.eventBus.publish('loopState:progressUpdated', eventData, 'loops');
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
    this.actionCompleted.add(this.currentAction.pathIndex);
    this.actionProgress.set(this.currentAction.pathIndex, 100);
    this.currentAction.completed = true;
    this.currentAction.progress = 100; // Ensure it shows 100% complete

    // Notify completion
    this.eventBus.publish('loopState:actionCompleted', {
      action: this.currentAction,
    }, 'loops');

    // Check if this is an explore action that just completed
    if (this.currentAction.type === 'explore') {
      // Get the regionName from the action
      const regionName = this.currentAction.regionName;

      // Get the repeat state from THIS instance's map
      const shouldRepeat = this.getRepeatExplore(regionName); // Use internal method

      // Get current queue to check for more explore actions
      const queue = this.getActionQueue();
      
      // Check if there are already more explore actions for this region in the queue
      const hasMoreExploreActions = queue.some(
        (action, index) =>
          index > this.currentActionIndex &&
          action.type === 'explore' &&
          action.regionName === regionName
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
        }, 'loops');
      }
    }

    // Move to next action in the queue or wrap around to beginning
    this.currentActionIndex++;

    // Get updated queue
    const queue = this.getActionQueue();
    
    // Loop to find the next valid, runnable action, skipping checked locations
    while (this.currentActionIndex < queue.length) {
      const nextAction = queue[this.currentActionIndex];

      // Check if it's a checkLocation action for an already checked location
      if (
        nextAction.type === 'checkLocation' &&
        this.stateManager.instance.isLocationChecked(nextAction.locationName)
      ) {
        //log('info',
        //  `Skipping already checked location: ${nextAction.locationName}.`
        //);
        // Mark as completed since it's already checked
        this.actionCompleted.add(nextAction.pathIndex);
        this.actionProgress.set(nextAction.pathIndex, 100);
        
        // Skip to next action
        this.currentActionIndex++;
        
        // Continue the loop to check the next action at the current index
      } else {
        // Found a valid action to process
        break;
      }
    }

    // If we reached the end of the queue
    if (this.currentActionIndex >= queue.length) {
      // Reset to beginning if auto-restart is enabled
      if (this.autoRestartQueue) {
        // Skip initial Menu if present
        this.currentActionIndex = 0;
        if (queue.length > 0 && queue[0].type === 'regionMove' && queue[0].region === 'Menu' && !queue[0].exitUsed) {
          this.currentActionIndex = 1;
        }
        this._resetActionsProgress();
      } else {
        // Queue completed
        this.currentAction = null;
        this.isProcessing = false;
        this.eventBus.publish('loopState:queueCompleted', {}, 'loops');
        return;
      }
    }

    // Start processing next action if there's one available
    if (this.currentActionIndex < queue.length) {
      this.currentAction = queue[this.currentActionIndex];
      // Initialize progress for new action if not tracked yet
      if (!this.actionProgress.has(this.currentAction.pathIndex)) {
        this.actionProgress.set(this.currentAction.pathIndex, 0);
      }
      this.currentAction.progress = this.actionProgress.get(this.currentAction.pathIndex);
      this.eventBus.publish('loopState:newActionStarted', {
        action: this.currentAction,
      }, 'loops');
    }
  }

  /**
   * Apply the effects of completing an action
   * @param {Object} action - The completed action
   */
  _applyActionEffects(action) {
    // Ensure eventBus dependency is set
    if (!this.eventBus) {
      log(
        'warn',
        '[LoopState] Cannot apply action effects: eventBus dependency missing.'
      );
      return;
    }

    switch (action.type) {
      case 'explore':
        // Publish event for discovery module
        this.eventBus.publish('loop:exploreCompleted', {
          regionName: action.regionName,
          // Any other relevant data loopState knows? Probably just the region.
        }, 'loops');
        break;
      case 'checkLocation':
        // Mark location as checked in stateManager (assuming this is still desired)
        this._handleLocationCheckCompletion(action);
        // Publish event for discovery module
        this.eventBus.publish('loop:locationChecked', {
          locationName: action.locationName,
          regionName: action.regionName, // Include region for context
          // Include item info if needed by discovery/other modules?
        }, 'loops');
        break;
      case 'moveToRegion':
        // Publish event for discovery module
        this.eventBus.publish('loop:moveCompleted', {
          sourceRegion: action.regionName,
          destinationRegion: action.destinationRegion,
          exitName: action.exitName,
        }, 'loops');
        break;
    }
  }

  /**
   * Handle completion of a location check action (Internal State Update Only)
   * NOTE: This *only* updates the core game state (checked status, inventory).
   * The discovery aspect is now handled by publishing 'loop:locationChecked'.
   * @param {Object} action - The location check action
   */
  _handleLocationCheckCompletion(action) {
    // Ensure dependencies are set
    if (!this.stateManager) {
      log(
        'warn',
        '[LoopState] Cannot handle location check: stateManager dependency missing.'
      );
      return;
    }
    // Mark location as checked
    const locationName = action.locationName;
    // Use this.stateManager
    this.stateManager.instance.checkLocation(locationName);

    // Get item from location if available
    // Use this.stateManager
    const location = this.stateManager.instance.locations.find(
      (loc) => loc.name === locationName
    );
    if (location && location.item) {
      // Use this.stateManager
      this.stateManager.instance.addItemToInventory(location.item.name);
    }

    // No XP bonus on completion - XP is awarded continuously during the action
  }

  /**
   * Calculate the mana cost of an action
   * @param {Object} action - The action
   * @returns {number} - Mana cost
   */
  _calculateActionCost(action) {
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
      const xpData = this.getRegionXP(action.regionName);
      return proposedLinearFinalCost(baseCost, xpData.level);
    }

    return baseCost;
  }

  /**
   * Reset progress for all actions in the queue
   */
  _resetActionsProgress() {
    // Clear all progress tracking
    this.actionProgress.clear();
    this.actionCompleted.clear();
  }

  /**
   * Reset the loop when running out of mana
   */
  _resetLoop() {
    // Restore mana to full
    this.currentMana = this.maxMana;

    // If autoRestartQueue is false (pause when queue complete mode),
    // just pause processing instead of resetting
    if (!this.autoRestartQueue) {
      // Pause processing
      this.setPaused(true);

      // Notify loop reset but don't reset progress
      this.eventBus.publish('loopState:loopReset', {
        mana: {
          current: this.currentMana,
          max: this.maxMana,
        },
        paused: true,
      }, 'loops');

      return;
    }

    // Otherwise, do a full reset (this is the original behavior)
    // Reset all action progress
    this._resetActionsProgress();

    // Get queue to check for initial Menu
    const queue = this.getActionQueue();
    
    // Reset to first real action (skip initial Menu if present)
    this.currentActionIndex = 0;
    if (queue.length > 0 && queue[0].type === 'regionMove' && queue[0].region === 'Menu' && !queue[0].exitUsed) {
      this.currentActionIndex = 1;
    }

    // Update current action reference
    if (this.currentActionIndex < queue.length) {
      this.currentAction = queue[this.currentActionIndex];
    } else {
      this.currentAction = null;
    }

    // Notify loop reset
    this.eventBus.publish('loopState:loopReset', {
      mana: {
        current: this.currentMana,
        max: this.maxMana,
      },
      paused: false,
    }, 'loops');
  }

  /**
   * Set auto-restart mode for the queue
   * @param {boolean} autoRestart - Whether to auto-restart the queue
   */
  setAutoRestartQueue(autoRestart) {
    this.autoRestartQueue = autoRestart;
    this.eventBus.publish('loopState:autoRestartChanged', {
      autoRestart: this.autoRestartQueue,
    }, 'loops');
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

    // Get queue to check for initial Menu
    const queue = this.getActionQueue();
    
    // Reset to beginning, skipping initial Menu if present
    this.currentActionIndex = 0;
    if (queue.length > 0 && queue[0].type === 'regionMove' && queue[0].region === 'Menu' && !queue[0].exitUsed) {
      this.currentActionIndex = 1;
    }

    // Reset progress on all actions
    this._resetActionsProgress();

    // Restore mana to full
    this.currentMana = this.maxMana;

    // Notify about mana change
    this.eventBus.publish('loopState:manaChanged', {
      current: this.currentMana,
      max: this.maxMana,
    }, 'loops');

    // Notify about queue update (so UI can refresh)
    this.eventBus.publish('loopState:queueUpdated', {
      queue: queue,
    }, 'loops');

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
    return {
      // Don't save maxMana as it should be calculated dynamically based on inventory
      currentMana: this.currentMana,
      regionXP: Array.from(this.regionXP.entries()),
      gameSpeed: this.gameSpeed,
      autoRestartQueue: this.autoRestartQueue,
      // Save progress tracking instead of queue
      actionProgress: Array.from(this.actionProgress.entries()),
      actionCompleted: Array.from(this.actionCompleted),
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
    this.gameSpeed = state.gameSpeed ?? 10;

    // Load auto-restart setting
    this.autoRestartQueue = state.autoRestartQueue ?? false;

    // Load progress tracking
    if (state.actionProgress) {
      this.actionProgress = new Map(state.actionProgress);
    }
    if (state.actionCompleted) {
      this.actionCompleted = new Set(state.actionCompleted);
    }
    this.currentActionIndex = state.currentActionIndex ?? 0;

    // Load repeatExploreStates
    this.repeatExploreStates = new Map(state.repeatExploreStates || []);

    // Notify state loaded
    if (this.eventBus) {
      // Ensure eventBus is available
      this.eventBus.publish('loopState:stateLoaded', {}, 'loops');
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
