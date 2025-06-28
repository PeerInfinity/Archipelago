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

    // Resources
    this.maxMana = 100;
    this.currentMana = 100;
    this.manaPerItem = 10; // How much each inventory item increases max mana

    // Experience tracking
    this.regionXP = new Map(); // regionName -> {level, xp, xpForNextLevel}

    // Action queue and processing
    this.actionQueue = [];
    this.currentAction = null;
    this.currentActionIndex = 0; // Index of the current action in the queue
    this.isProcessing = false;
    this.isPaused = false;
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
   * Add an action to the queue
   * @param {Object} action - Action to add
   */
  queueAction(action) {
    // Insert the action in order by region
    if (action.regionName) {
      // Find the last action in the queue with the same region
      const lastIndex = this.actionQueue
        .map((a) => a.regionName)
        .lastIndexOf(action.regionName);
      if (lastIndex !== -1) {
        // Insert after the last action with the same region
        this.actionQueue.splice(lastIndex + 1, 0, action);
      } else {
        // If no actions with this region, just append
        this.actionQueue.push(action);
      }
    } else {
      // If no region specified, just append
      this.actionQueue.push(action);
    }

    //log('info', 'Action queued:', action);
    this.eventBus.publish('loopState:queueUpdated', {
      queue: this.actionQueue,
    });
    //log('info', 'Published loopState:queueUpdated event');

    // Start processing if not already running
    if (!this.isProcessing && !this.isPaused) {
      this.startProcessing();
    }
  }

  /**
   * Remove an action from the queue
   * @param {number} index - Index of action to remove
   */
  removeAction(index) {
    if (index < 0 || index >= this.actionQueue.length) return;

    // Special handling for move actions with dependent regions
    const removedAction = this.actionQueue[index];
    if (removedAction && removedAction.type === 'moveToRegion') {
      const destinationRegion = removedAction.destinationRegion;

      // Find all actions that depend on this move (they come after this one)
      // and are either in the destination region or are moves from the destination
      const dependentActions = [];

      // First collect the indices of actions to remove
      for (let i = index; i < this.actionQueue.length; i++) {
        const action = this.actionQueue[i];
        if (
          i === index || // The removed action itself
          action.regionName === destinationRegion || // Actions in the destination
          (action.type === 'moveToRegion' &&
            action.regionName === destinationRegion)
        ) {
          // Moves from destination
          dependentActions.push(i);
        }
      }

      // Sort in reverse order and remove them
      dependentActions
        .sort((a, b) => b - a)
        .forEach((idx) => {
          this.actionQueue.splice(idx, 1);
        });

      // If we removed the current action or any action before it, adjust the current action index
      if (this.isProcessing) {
        const lowestRemovedIndex = Math.min(...dependentActions);
        if (lowestRemovedIndex <= this.currentActionIndex) {
          if (lowestRemovedIndex === this.currentActionIndex) {
            // Removing the current action
            this.stopProcessing();
          } else {
            // Removing an action before the current action
            // Count how many actions were removed before the current action
            const removedBeforeCurrent = dependentActions.filter(
              (idx) => idx < this.currentActionIndex
            ).length;
            this.currentActionIndex -= removedBeforeCurrent;
          }
        }
      }
    } else {
      // Standard behavior for non-move actions
      // If removing the current action, stop processing it
      if (index === this.currentActionIndex && this.isProcessing) {
        this.stopProcessing();
      } else if (index < this.currentActionIndex) {
        // If removing an action before the current one, adjust the index
        this.currentActionIndex--;
      }

      // Just remove this specific action
      this.actionQueue.splice(index, 1);
    }

    // Notify queue updated
    this.eventBus.publish('loopState:queueUpdated', {
      queue: this.actionQueue,
    });

    // Restart processing if stopped and there are actions to process
    if (!this.isProcessing && this.actionQueue.length > 0 && !this.isPaused) {
      // If we removed all actions up to current index, reset to beginning
      if (this.currentActionIndex >= this.actionQueue.length) {
        this.currentActionIndex = 0;
      }
      this.startProcessing();
    }
  }

  /**
   * Start processing the action queue
   */
  startProcessing() {
    if (this.isPaused || this.isProcessing || this.actionQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    this.currentActionIndex = this.currentActionIndex || 0; // Default to 0 if not set

    // Make sure the index is valid
    if (this.currentActionIndex >= this.actionQueue.length) {
      this.currentActionIndex = 0;
    }

    this.currentAction = this.actionQueue[this.currentActionIndex];

    // Ensure we have a valid action
    if (!this.currentAction) {
      log('error', 'No valid action at index', this.currentActionIndex);
      this.isProcessing = false;
      return;
    }

    // Don't reset progress when resuming from pause
    // Only set to 0 if it's a new action with no progress yet
    if (!this.currentAction.progress) {
      this.currentAction.progress = 0;
    }

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
      this.eventBus.publish('loopState:paused', { isPaused: true });
    } else if (this.actionQueue.length > 0) {
      this.startProcessing();
      this.eventBus.publish('loopState:resumed', { isPaused: false });
    } else {
      // Even if there are no actions, still publish the state change
      this.eventBus.publish('loopState:pauseStateChanged', {
        isPaused: this.isPaused,
      });
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

    this.eventBus.publish('loopState:speedChanged', { speed: this.gameSpeed });
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
      // Verify we have a valid current action and index
      if (
        !this.currentAction ||
        this.currentActionIndex >= this.actionQueue.length
      ) {
        log('error', 'Invalid action state in _processFrame:', {
          currentActionIndex: this.currentActionIndex,
          queueLength: this.actionQueue.length,
          hasCurrentAction: !!this.currentAction,
        });

        // Try to recover by finding a valid action
        if (this.actionQueue.length > 0) {
          this.currentActionIndex = 0;
          this.currentAction = this.actionQueue[0];
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

      // Update progress
      this.currentAction.progress += progressIncrement;

      // Reduce mana based on progress
      const manaCost = (progressIncrement / 100) * actionCost;
      this.currentMana = Math.max(0, this.currentMana - manaCost);

      // Publish mana changed event immediately after update
      this.eventBus.publish('loopState:manaChanged', {
        current: this.currentMana,
        max: this.maxMana,
      });

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

    // Mark as completed but keep in queue
    this.currentAction.completed = true;
    this.currentAction.progress = 100; // Ensure it shows 100% complete

    // Notify completion
    this.eventBus.publish('loopState:actionCompleted', {
      action: this.currentAction,
    });

    // Check if this is an explore action that just completed
    if (this.currentAction.type === 'explore') {
      // Get the regionName from the action
      const regionName = this.currentAction.regionName;

      // Get the repeat state from THIS instance's map
      const shouldRepeat = this.getRepeatExplore(regionName); // Use internal method

      // Check if there are already more explore actions for this region in the queue
      const hasMoreExploreActions = this.actionQueue.some(
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

        // Create a new action instance
        const repeatAction = {
          ...this.currentAction, // Copy all properties
          id: `action_${Date.now()}_${Math.floor(Math.random() * 10000)}`, // Generate new ID
          progress: 0,
          completed: false,
          repeatAction: true, // Mark for UI purposes
        };

        // Add the new action right after the current action
        this.actionQueue.splice(this.currentActionIndex + 1, 0, repeatAction);

        // Notify that a new explore action was added
        this.eventBus.publish('loopState:exploreActionRepeated', {
          action: repeatAction,
          regionName: repeatAction.regionName,
        });
      }
    }

    // Move to next action in the queue or wrap around to beginning
    this.currentActionIndex++;

    // Loop to find the next valid, runnable action, skipping checked locations
    while (this.currentActionIndex < this.actionQueue.length) {
      const nextAction = this.actionQueue[this.currentActionIndex];

      // Check if it's a checkLocation action for an already checked location
      if (
        nextAction.type === 'checkLocation' &&
        this.stateManager.instance.isLocationChecked(nextAction.locationName)
      ) {
        //log('info',
        //  `Skipping already checked location: ${nextAction.locationName}. Removing action.`
        //);
        // Remove the action from the queue
        this.actionQueue.splice(this.currentActionIndex, 1);
        // NOTE: Do NOT increment index here, the next loop iteration will check the new action at the same index

        // If queue became empty, stop processing
        if (this.actionQueue.length === 0) {
          this.currentAction = null;
          this.isProcessing = false;
          this.eventBus.publish('loopState:queueCompleted', {});
          this.eventBus.publish('loopState:queueUpdated', {
            queue: this.actionQueue,
          });
          return; // Exit the function
        }

        // Continue the loop to check the next action at the current index
      } else {
        // Found a valid action to process
        break;
      }
    }

    // If we reached the end of the queue (possibly after removing checked locations)
    if (this.currentActionIndex >= this.actionQueue.length) {
      // Reset to beginning if auto-restart is enabled
      if (this.autoRestartQueue) {
        this.currentActionIndex = 0;
        this._resetActionsProgress();
      } else {
        // Queue completed
        this.currentAction = null;
        this.isProcessing = false;
        this.eventBus.publish('loopState:queueCompleted', {});
        return;
      }
    }

    // Start processing next action if there's one available
    if (this.currentActionIndex < this.actionQueue.length) {
      this.currentAction = this.actionQueue[this.currentActionIndex];
      this.currentAction.progress = 0;
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
        });
        break;
      case 'checkLocation':
        // Mark location as checked in stateManager (assuming this is still desired)
        this._handleLocationCheckCompletion(action);
        // Publish event for discovery module
        this.eventBus.publish('loop:locationChecked', {
          locationName: action.locationName,
          regionName: action.regionName, // Include region for context
          // Include item info if needed by discovery/other modules?
        });
        break;
      case 'moveToRegion':
        // Publish event for discovery module
        this.eventBus.publish('loop:moveCompleted', {
          sourceRegion: action.regionName,
          destinationRegion: action.destinationRegion,
          exitName: action.exitName,
        });
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
    // Reset progress for all actions
    for (const action of this.actionQueue) {
      action.progress = 0;
      action.completed = false;
    }
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
      });

      return;
    }

    // Otherwise, do a full reset (this is the original behavior)
    // Reset all action progress
    this._resetActionsProgress();

    // Reset to first action
    this.currentActionIndex = 0;

    // Update current action reference
    if (this.actionQueue.length > 0) {
      this.currentAction = this.actionQueue[this.currentActionIndex];
    }

    // Notify loop reset
    this.eventBus.publish('loopState:loopReset', {
      mana: {
        current: this.currentMana,
        max: this.maxMana,
      },
      paused: false,
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

    // Start processing if there are actions
    if (this.actionQueue.length > 0) {
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

    // Notify about queue update (so UI can refresh)
    this.eventBus.publish('loopState:queueUpdated', {
      queue: this.actionQueue,
    });

    // Start processing if there are actions
    if (this.actionQueue.length > 0 && !this.isPaused) {
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
      // REMOVED: Discovery state saving
      // discoveredRegions: Array.from(this.discoveredRegions),
      // discoveredLocations: Array.from(this.discoveredLocations),
      // discoveredExits: Array.from(this.discoveredExits.entries()).map(
      //   ([region, exits]) => [region, Array.from(exits)]
      // ),
      gameSpeed: this.gameSpeed,
      autoRestartQueue: this.autoRestartQueue,
      actionQueue: this.actionQueue,
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

    // REMOVED: Always recalculate maxMana based on current inventory
    // Max mana will be calculated when the first snapshot event arrives.
    // this.recalculateMaxMana();

    // Load current mana, cap at a reasonable default if needed (e.g., 100) until snapshot arrives
    // We don't know the true maxMana yet.
    this.currentMana = state.currentMana ?? 100;

    // Load region XP
    this.regionXP = new Map(state.regionXP || []);

    // REMOVED: Discovery state loading

    // Load game speed
    this.gameSpeed = state.gameSpeed ?? 10;

    // Load auto-restart setting
    this.autoRestartQueue = state.autoRestartQueue ?? false;

    // Load queue state if available
    if (state.actionQueue) {
      this.actionQueue = state.actionQueue;
      this.currentActionIndex = state.currentActionIndex ?? 0;
      if (this.currentActionIndex < this.actionQueue.length) {
        this.currentAction = this.actionQueue[this.currentActionIndex];
      }
    }

    // ADDED: Load repeatExploreStates
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
