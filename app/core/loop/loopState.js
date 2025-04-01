/**
 * Loop state manager for the ArchipIDLE incremental game
 * Manages game state for the loop mode, including:
 * - Experience levels for regions
 * - Action queue
 * - Mana resources
 * - Loop progress and reset logic
 * - Region and location discovery
 */

import stateManager from '../stateManagerSingleton.js';
import eventBus from '../eventBus.js';
import {
  proposedLinearReduction,
  proposedLinearFinalCost,
} from './xpFormulas.js';

class LoopState {
  constructor() {
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

    // Discovery tracking
    this.discoveredRegions = new Set(['Menu']); // Start with Menu discovered
    this.discoveredLocations = new Set();
    this.discoveredExits = new Map(); // regionName -> Set of exit names

    // Initialize exits for the starting region
    this.discoveredExits.set('Menu', new Set());

    // Animation frame tracking
    this._animationFrameId = null;

    // Auto-save interval
    this._saveIntervalId = null;

    // Listen for inventory changes to update max mana
    this._setupEventListeners();
  }

  /**
   * Sets up event listeners for game events
   */
  _setupEventListeners() {
    eventBus.subscribe('stateManager:inventoryChanged', () => {
      this.recalculateMaxMana();
    });
  }

  /**
   * Initialize the loop state when data is loaded
   */
  initialize() {
    // Calculate initial mana based on current inventory
    this.recalculateMaxMana();

    // Initialize discoverable regions and exits
    this._initializeDiscoverableData();

    // Set up auto-save timer
    this._setupAutoSave();

    // Try to load saved state
    this.loadFromStorage();
  }

  /**
   * Initialize data about what regions, locations, and exits can be discovered
   */
  _initializeDiscoverableData() {
    // Ensure Menu region starts as discovered with its exits visible
    this.discoveredRegions.add('Menu');

    if (!this.discoveredExits.has('Menu')) {
      this.discoveredExits.set('Menu', new Set());
    }

    // Add all exits from Menu to the discovered exits
    const menuRegion = stateManager.regions['Menu'];
    if (menuRegion && menuRegion.exits) {
      const menuExits = this.discoveredExits.get('Menu');
      menuRegion.exits.forEach((exit) => {
        menuExits.add(exit.name);
      });
    }
  }

  /**
   * Calculate max mana based on inventory items
   */
  recalculateMaxMana() {
    // Base mana + extra for each inventory item
    const baseMana = 100;
    let itemCount = 0;

    // Count all items in inventory
    if (stateManager.inventory && stateManager.inventory.items) {
      stateManager.inventory.items.forEach((count, item) => {
        if (count > 0) {
          itemCount += count;
        }
      });
    }

    this.maxMana = baseMana + itemCount * this.manaPerItem;

    // Cap current mana if it exceeds the new maximum
    if (this.currentMana > this.maxMana) {
      this.currentMana = this.maxMana;
    }

    // Notify about mana changes
    eventBus.publish('loopState:manaChanged', {
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
      eventBus.publish('loopState:xpChanged', { regionName, xpData });
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

    //console.log('Action queued:', action);
    eventBus.publish('loopState:queueUpdated', { queue: this.actionQueue });
    //console.log('Published loopState:queueUpdated event');

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
    eventBus.publish('loopState:queueUpdated', { queue: this.actionQueue });

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
      console.error('No valid action at index', this.currentActionIndex);
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

    //console.log('Started processing action:', this.currentAction);

    eventBus.publish('loopState:processingStarted', {
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

    eventBus.publish('loopState:processingStopped', {});
  }

  /**
   * Pause/unpause the action queue
   * @param {boolean} isPaused - Whether to pause or unpause
   */
  setPaused(isPaused) {
    this.isPaused = isPaused;

    if (isPaused) {
      this.stopProcessing();
      eventBus.publish('loopState:paused', { isPaused: true });
    } else if (this.actionQueue.length > 0) {
      this.startProcessing();
      eventBus.publish('loopState:resumed', { isPaused: false });
    } else {
      // Even if there are no actions, still publish the state change
      eventBus.publish('loopState:pauseStateChanged', {
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

    eventBus.publish('loopState:speedChanged', { speed: this.gameSpeed });
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
        console.error('Invalid action state in _processFrame:', {
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
      eventBus.publish('loopState:manaChanged', {
        current: this.currentMana,
        max: this.maxMana,
      });

      // Continuous XP gain during action
      if (this.currentAction.regionName) {
        const xpGain = (progressIncrement / 100) * actionCost * 0.1;
        this.addRegionXP(this.currentAction.regionName, xpGain);

        // Notify UI about XP change even for small increments
        const xpData = this.getRegionXP(this.currentAction.regionName);
        eventBus.publish('loopState:xpChanged', {
          regionName: this.currentAction.regionName,
          xpData,
        });
      }

      // Log every few frames for debugging
      //if (Math.random() < 0.05) {
      //  console.log(
      //    `Action progress: ${this.currentAction.progress.toFixed(
      //      2
      //    )}%, Mana: ${this.currentMana.toFixed(2)}/${this.maxMana}`
      //  );
      //}

      // Check for action completion
      if (this.currentAction.progress >= 100) {
        //console.log('Action completed:', this.currentAction);
        this._completeCurrentAction();
      }

      // Check for loop reset (out of mana)
      if (this.currentMana <= 0) {
        //console.log('Loop reset: out of mana');
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

      eventBus.publish('loopState:progressUpdated', eventData);
    } catch (error) {
      console.error('Error in _processFrame:', error);
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
    eventBus.publish('loopState:actionCompleted', {
      action: this.currentAction,
    });

    // Check if this is an explore action that just completed
    if (this.currentAction.type === 'explore') {
      // Get the regionName from the action
      const regionName = this.currentAction.regionName;

      // Get the repeat state from LoopUI's map
      let shouldRepeat = false;
      if (window.loopUIInstance && window.loopUIInstance.repeatExploreStates) {
        shouldRepeat =
          window.loopUIInstance.repeatExploreStates.get(regionName) || false;
      }

      // Check if there are already more explore actions for this region in the queue
      const hasMoreExploreActions = this.actionQueue.some(
        (action, index) =>
          index > this.currentActionIndex &&
          action.type === 'explore' &&
          action.regionName === regionName
      );

      // Only add a new explore action if shouldRepeat is true AND there are no more explore actions for this region
      if (shouldRepeat && !hasMoreExploreActions) {
        //console.log(
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
        eventBus.publish('loopState:exploreActionRepeated', {
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
        stateManager.isLocationChecked(nextAction.locationName)
      ) {
        //console.log(
        //  `Skipping already checked location: ${nextAction.locationName}. Removing action.`
        //);
        // Remove the action from the queue
        this.actionQueue.splice(this.currentActionIndex, 1);
        // NOTE: Do NOT increment index here, the next loop iteration will check the new action at the same index

        // If queue became empty, stop processing
        if (this.actionQueue.length === 0) {
          this.currentAction = null;
          this.isProcessing = false;
          eventBus.publish('loopState:queueCompleted', {});
          eventBus.publish('loopState:queueUpdated', {
            queue: this.actionQueue,
          }); // Notify UI of empty queue
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
        eventBus.publish('loopState:queueCompleted', {});
        return;
      }
    }

    // Start processing next action if there's one available
    if (this.currentActionIndex < this.actionQueue.length) {
      this.currentAction = this.actionQueue[this.currentActionIndex];
      this.currentAction.progress = 0;
      eventBus.publish('loopState:newActionStarted', {
        action: this.currentAction,
      });
    }
  }

  /**
   * Apply the effects of completing an action
   * @param {Object} action - The completed action
   */
  _applyActionEffects(action) {
    switch (action.type) {
      case 'explore':
        this._handleExploreCompletion(action);
        break;
      case 'checkLocation':
        this._handleLocationCheckCompletion(action);
        break;
      case 'moveToRegion':
        this._handleMoveCompletion(action);
        break;
    }
  }

  /**
   * Handle completion of an explore action
   * @param {Object} action - The explore action
   */
  _handleExploreCompletion(action) {
    // Get region data
    const regionName = action.regionName;
    const regionData = stateManager.regions[regionName];

    if (!regionData) {
      return;
    }

    // Logic to reveal a new location or exit
    // First, count how many are left to discover
    const undiscoveredLocations = this._countUndiscoveredLocations(regionName);
    const undiscoveredExits = this._countUndiscoveredExits(regionName);

    // If there's something to discover
    if (undiscoveredLocations + undiscoveredExits > 0) {
      // Randomly choose between location and exit, weighted by how many are left
      const revealLocation =
        Math.random() * (undiscoveredLocations + undiscoveredExits) <
        undiscoveredLocations;

      if (revealLocation && undiscoveredLocations > 0) {
        this._revealRandomLocation(regionName);
      } else if (undiscoveredExits > 0) {
        this._revealRandomExit(regionName);
      }

      // Normal XP gain when still discovering
      this.addRegionXP(regionName, 20);
    } else {
      // Double XP gain when everything is discovered but user continues exploring
      this.addRegionXP(regionName, 40); // Doubled from 20 to 40
    }
  }

  /**
   * Handle completion of a location check action
   * @param {Object} action - The location check action
   */
  _handleLocationCheckCompletion(action) {
    // Mark location as checked
    const locationName = action.locationName;
    stateManager.checkLocation(locationName);

    // Get item from location if available
    const location = stateManager.locations.find(
      (loc) => loc.name === locationName
    );
    if (location && location.item) {
      stateManager.addItemToInventory(location.item.name);
    }

    // Add XP for region
    this.addRegionXP(action.regionName, 30);
  }

  /**
   * Handle completion of a move to region action
   * @param {Object} action - The move action
   */
  _handleMoveCompletion(action) {
    // Mark destination region as discovered
    this.discoveredRegions.add(action.destinationRegion);

    // Add XP for both regions
    this.addRegionXP(action.regionName, 10);
    this.addRegionXP(action.destinationRegion, 10);

    // Notify region discovery
    eventBus.publish('loopState:regionDiscovered', {
      regionName: action.destinationRegion,
    });
  }

  /**
   * Count how many undiscovered locations are in a region
   * @param {string} regionName - Name of the region
   * @returns {number} - Count of undiscovered locations
   */
  _countUndiscoveredLocations(regionName) {
    const regionData = stateManager.regions[regionName];
    if (!regionData || !regionData.locations) {
      return 0;
    }

    let count = 0;
    for (const location of regionData.locations) {
      if (!this.discoveredLocations.has(location.name)) {
        count++;
      }
    }

    return count;
  }

  /**
   * Count how many undiscovered exits are in a region
   * @param {string} regionName - Name of the region
   * @returns {number} - Count of undiscovered exits
   */
  _countUndiscoveredExits(regionName) {
    const regionData = stateManager.regions[regionName];
    if (!regionData || !regionData.exits) {
      return 0;
    }

    const discoveredExits = this.discoveredExits.get(regionName) || new Set();
    let count = 0;

    for (const exit of regionData.exits) {
      if (!discoveredExits.has(exit.name)) {
        count++;
      }
    }

    return count;
  }

  /**
   * Reveal a random undiscovered location in a region
   * @param {string} regionName - Name of the region
   */
  _revealRandomLocation(regionName) {
    const regionData = stateManager.regions[regionName];
    if (!regionData || !regionData.locations) {
      return;
    }

    // Find all undiscovered locations
    const undiscoveredLocations = regionData.locations.filter(
      (loc) => !this.discoveredLocations.has(loc.name)
    );

    if (undiscoveredLocations.length === 0) {
      return;
    }

    // Pick a random one
    const randomIndex = Math.floor(
      Math.random() * undiscoveredLocations.length
    );
    const location = undiscoveredLocations[randomIndex];

    // Mark as discovered
    this.discoveredLocations.add(location.name);

    // Notify discovery
    eventBus.publish('loopState:locationDiscovered', {
      locationName: location.name,
      regionName,
    });
  }

  /**
   * Reveal a random undiscovered exit in a region
   * @param {string} regionName - Name of the region
   */
  _revealRandomExit(regionName) {
    const regionData = stateManager.regions[regionName];
    if (!regionData || !regionData.exits) {
      return;
    }

    // Ensure the region has an entry in discoveredExits
    if (!this.discoveredExits.has(regionName)) {
      this.discoveredExits.set(regionName, new Set());
    }

    const discoveredExits = this.discoveredExits.get(regionName);

    // Find all undiscovered exits
    const undiscoveredExits = regionData.exits.filter(
      (exit) => !discoveredExits.has(exit.name)
    );

    if (undiscoveredExits.length === 0) {
      return;
    }

    // Pick a random one
    const randomIndex = Math.floor(Math.random() * undiscoveredExits.length);
    const exit = undiscoveredExits[randomIndex];

    // Mark as discovered
    discoveredExits.add(exit.name);

    // Notify discovery
    eventBus.publish('loopState:exitDiscovered', {
      exitName: exit.name,
      regionName,
      destinationRegion: exit.connected_region,
    });
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
      eventBus.publish('loopState:loopReset', {
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
    eventBus.publish('loopState:loopReset', {
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
    eventBus.publish('loopState:autoRestartChanged', {
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
    eventBus.publish('loopState:manaChanged', {
      current: this.currentMana,
      max: this.maxMana,
    });

    // Notify about queue update (so UI can refresh)
    eventBus.publish('loopState:queueUpdated', { queue: this.actionQueue });

    // Start processing if there are actions
    if (this.actionQueue.length > 0 && !this.isPaused) {
      this.startProcessing();
    }
  }

  /**
   * Check if a region is discovered
   * @param {string} regionName - Name of the region
   * @returns {boolean} - Whether region is discovered
   */
  isRegionDiscovered(regionName) {
    // Menu is always discovered
    if (regionName === 'Menu') return true;

    return this.discoveredRegions.has(regionName);
  }

  /**
   * Check if a location is discovered
   * @param {string} locationName - Name of the location
   * @returns {boolean} - Whether location is discovered
   */
  isLocationDiscovered(locationName) {
    // If location is checked, consider it discovered
    if (stateManager.isLocationChecked(locationName)) return true;

    // Otherwise check discovery state
    return this.discoveredLocations.has(locationName);
  }

  /**
   * Check if an exit is discovered
   * @param {string} regionName - Name of the region containing the exit
   * @param {string} exitName - Name of the exit
   * @returns {boolean} - Whether exit is discovered
   */
  isExitDiscovered(regionName, exitName) {
    // Exits in Menu are always discovered
    if (regionName === 'Menu') return true;

    const regionExits = this.discoveredExits.get(regionName);
    return regionExits ? regionExits.has(exitName) : false;
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
      discoveredRegions: Array.from(this.discoveredRegions),
      discoveredLocations: Array.from(this.discoveredLocations),
      discoveredExits: Array.from(this.discoveredExits.entries()).map(
        ([region, exits]) => [region, Array.from(exits)]
      ),
      gameSpeed: this.gameSpeed,
      autoRestartQueue: this.autoRestartQueue,
      actionQueue: this.actionQueue,
      currentActionIndex: this.currentActionIndex,
    };
  }

  /**
   * Load state from a serialized object
   * @param {Object} state - Serialized state
   */
  loadFromSerializedState(state) {
    if (!state) return;

    // Always recalculate maxMana based on current inventory
    this.recalculateMaxMana();

    // Cap current mana at the max value
    this.currentMana = Math.min(
      state.currentMana ?? this.maxMana,
      this.maxMana
    );

    // Load region XP
    this.regionXP = new Map(state.regionXP || []);

    // Load discoveries
    this.discoveredRegions = new Set(state.discoveredRegions || ['Menu']);
    this.discoveredLocations = new Set(state.discoveredLocations || []);

    // Load discovered exits
    this.discoveredExits = new Map();
    (state.discoveredExits || []).forEach(([region, exits]) => {
      this.discoveredExits.set(region, new Set(exits));
    });

    // Ensure Menu region is discovered with its exits
    this._initializeDiscoverableData();

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

    // Notify state loaded
    eventBus.publish('loopState:stateLoaded', {});
  }

  /**
   * Save state to localStorage
   */
  saveToStorage() {
    try {
      const serializedState = this.getSerializableState();
      localStorage.setItem(
        'archipidle_loop_state',
        JSON.stringify(serializedState)
      );
    } catch (error) {
      console.error('Failed to save loop state:', error);
    }
  }

  /**
   * Load state from localStorage
   */
  loadFromStorage() {
    try {
      const savedState = localStorage.getItem('archipidle_loop_state');
      if (savedState) {
        const parsedState = JSON.parse(savedState);
        this.loadFromSerializedState(parsedState);
        return true;
      }
    } catch (error) {
      console.error('Failed to load loop state:', error);
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

// Create singleton instance
const loopState = new LoopState();
export default loopState;
