// Refactored to use canonical inventory format and agnostic logic modules
import {
  initializeGameLogic,
  determineGameName,
  getGameLogic,
  detectGameFromWorldClass
} from '../shared/gameLogic/gameLogicRegistry.js';
import { createStateSnapshotInterface } from '../shared/stateInterface.js';

// Import universal logger for consistent logging across contexts
import { createUniversalLogger } from '../../app/core/universalLogger.js';

// Import core modules
import * as InitializationModule from './core/initialization.js';
import * as InventoryModule from './core/inventoryManager.js';
import * as ReachabilityModule from './core/reachabilityEngine.js';
import * as StatePersistenceModule from './core/statePersistence.js';

// Create module-level logger
const moduleLogger = createUniversalLogger('stateManager');

// Helper function for logging with fallback (for backward compatibility)
function log(level, message, ...data) {
  moduleLogger[level](message, ...data);
}

/**
 * Manages game state including inventory and reachable regions/locations.
 * Handles automatic collection of event items when their locations become accessible.
 * All state (including events) is tracked through the inventory system.
 */
export class StateManager {
  /**
   * @param {function} [evaluateRuleFunction] - The rule evaluation function (from ruleEngine.js).
   *                                             Required when running in worker/isolated context.
   */
  constructor(evaluateRuleFunction, loggerInstance) {
    // Store the injected logger instance
    this.logger = loggerInstance || console;

    // Core state storage
    this.inventory = null; // Initialize as null
    this.state = null; // Initialize as null
    // Pass 'this' (the manager instance) to helpers when running in worker context
    this.helpers = null; // Initialize as null

    // Game-specific state module
    this.gameStateModule = null; // Will be set based on game type

    // Dynamic logic module selection
    this.logicModule = null; // e.g., alttpLogic.alttpStateModule or genericLogic.genericStateModule
    this.helperFunctions = null; // e.g., alttpLogic.helperFunctions or genericLogic.helperFunctions

    // Injected dependencies
    this.eventBus = null; // Legacy/optional
    this.postMessageCallback = null; // For worker communication
    this.evaluateRuleFromEngine = evaluateRuleFunction; // Store the injected rule evaluator
    this.autoCollectEventsEnabled = true; // MODIFIED: Added flag, default to true

    // --- ADDED Check for missing evaluator --- >
    if (!this.evaluateRuleFromEngine) {
      log(
        'warn',
        '[StateManager Constructor] evaluateRuleFunction was not provided. Rule evaluation within the worker might fail if called directly.'
      );
    }
    // --- END Check ---

    // Player identification
    this.playerSlot = 1; // Default player slot to 1 for single-player/offline
    this.team = 0; // Default team

    // Region and location data (Phase 3: Converted to Maps for O(1) lookups)
    this.locations = new Map(); // Map of location name -> location data
    this.regions = new Map(); // Map of region name -> region data
    this.dungeons = new Map(); // Map of dungeon name -> dungeon data
    this.eventLocations = new Map(); // Map of location name -> event location data

    // Enhance the indirectConnections to match Python implementation
    this.indirectConnections = new Map(); // Map of region name -> set of entrances affected by that region

    // Enhanced region reachability tracking with path context
    this.knownReachableRegions = new Set();
    this.knownUnreachableRegions = new Set();
    this.cacheValid = false;

    // Path tracking similar to Python implementation
    this.path = new Map(); // Map of region name -> {name, entrance, previousRegion}
    this.blockedConnections = new Set(); // Set of entrances that are currently blocked

    // Flag to prevent recursion during computation
    this._computing = false;

    // Flag to prevent recursion during helper execution
    this._inHelperExecution = false;

    // Game configuration
    this.mode = null;
    this.settings = null;
    this.startRegions = null;

    // Checked locations tracking
    this.checkedLocations = new Set();
    // this.serverProvidedUncheckedLocations = new Set(); // Removed

    this._uiCallbacks = {};

    // Batch update support
    this._batchMode = false;
    this._deferRegionComputation = false;
    this._batchedUpdates = new Map();

    // Add debug mode flag
    this.debugMode = false; // Set to true to enable detailed logging

    // New maps for item and location IDs
    this.itemNameToId = {};
    this.locationNameToId = {};

    // Initialize order arrays
    this.originalLocationOrder = [];
    this.originalRegionOrder = [];
    this.originalExitOrder = [];

    this.logger.info('StateManager', 'Instance created with injected logger.');
  }

  /**
   * Centralized logging method using the injected logger instance
   * @param {string} level - Log level (error, warn, info, debug, verbose)
   * @param {string} category - Category name for the log message
   * @param {string} message - Log message
   * @param {...any} data - Additional data to log
   */
  log(level, category, message, ...data) {
    if (this.logger && typeof this.logger[level] === 'function') {
      this.logger[level](category, message, ...data);
    } else {
      // Fallback to console if logger method not available
      const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
      consoleMethod(`[${category}] ${message}`, ...data);
    }
  }

  /**
   * Convenience logging methods for different categories
   */
  logStateManager(level, message, ...data) {
    this.log(level, 'StateManager', message, ...data);
  }

  logInventory(level, message, ...data) {
    this.log(level, 'gameInventory', message, ...data);
  }

  logALTTP(level, message, ...data) {
    this.log(level, 'ALTTPState', message, ...data);
  }

  logHelpers(level, message, ...data) {
    this.log(level, 'alttpHelpers', message, ...data);
  }

  /**
   * Responds to a ping request from the main thread.
   * @param {*} payload - The payload to echo back.
   */
  ping(data) {
    // Renamed arg to 'data' for clarity
    if (this.postMessageCallback) {
      // data is expected to be an object like { queryId: anId, payload: actualDataToEcho }
      this._logDebug(
        '[StateManager] Received ping, sending pong with data:',
        data
      );
      this.postMessageCallback({
        type: 'pingResponse',
        queryId: data.queryId, // queryId at the top level
        payload: data.payload, // The actual echoed payload at the top level
      });
    } else {
      log(
        'warn',
        '[StateManager] Ping received but no postMessageCallback set.'
      );
    }
  }

  /**
   * Applies initial settings to the StateManager instance.
   * @param {object} settingsObject - The settings object to apply.
   */
  applySettings(settingsObject) {
    InitializationModule.applySettings(this, settingsObject);
  }

  /**
   * Sets the event bus instance dependency (legacy/optional).
   * @param {object} eventBusInstance - The application's event bus.
   */
  setEventBus(eventBusInstance) {
    this.logger.info('StateManager', 'Setting EventBus instance (legacy)...');
    this.eventBus = eventBusInstance;
  }

  /**
   * Sets the communication callback function for sending messages (e.g., to the proxy).
   * @param {function} callback - The function to call (e.g., self.postMessage).
   */
  setCommunicationChannel(callback) {
    this.logger.info('StateManager', 'Setting communication channel...');
    if (typeof callback === 'function') {
      this.postMessageCallback = callback;
    } else {
      this.logger.error(
        'StateManager',
        'Invalid communication channel provided.'
      );
      this.postMessageCallback = null;
    }
  }

  registerUICallback(name, callback) {
    this._uiCallbacks[name] = callback;
  }

  notifyUI(eventType) {
    Object.values(this._uiCallbacks).forEach((callback) => {
      if (typeof callback === 'function') callback(eventType);
    });

    // Also emit to eventBus for ProgressUI
    try {
      if (this.eventBus) {
        this.eventBus.publish(`stateManager:${eventType}`, {}, 'stateManager');
      }
    } catch (e) {
      log('warn', 'Could not publish to eventBus:', e);
    }
  }

  clearInventory() {
    InventoryModule.clearInventory(this);
  }

  clearState(options = { recomputeAndSendUpdate: true }) {
    StatePersistenceModule.clearState(this, options);
  }

  /**
   * Removes all event items from inventory while preserving other state.
   * Useful for testing scenarios where you want to reset auto-collected events
   * without clearing manually collected items or checked locations.
   * Also unchecks event locations so they can be checked again during testing.
   */
  clearEventItems(options = { recomputeAndSendUpdate: true }) {
    StatePersistenceModule.clearEventItems(this, options);
  }

  /**
   * Adds an item and notifies all registered callbacks
   */
  addItemToInventory(itemName, count = 1) {
    InventoryModule.addItemToInventory(this, itemName, count);
  }

  /**
   * Removes items from the player's inventory
   */
  removeItemFromInventory(itemName, count = 1) {
    InventoryModule.removeItemFromInventory(this, itemName, count);
  }

  /**
   * Adds an item to the player's inventory by its name.
   */
  addItemToInventoryByName(itemName, count = 1, fromServer = false) {
    InventoryModule.addItemToInventoryByName(this, itemName, count, fromServer);
  }

  getItemCount(itemName) {
    return InventoryModule.getItemCount(this, itemName);
  }

  /**
   * Loads and processes region/location data from a JSON file
   * @param {object} jsonData - The parsed JSON data.
   * @param {string} selectedPlayerId - The ID of the player whose data should be loaded.
   */
  /**
   * Loads JSON rules data for a specific player
   * Delegated to initialization module for better organization
   *
   * @param {Object} jsonData - The Archipelago JSON rules data
   * @param {string} selectedPlayerId - The player ID to load data for
   */
  loadFromJSON(jsonData, selectedPlayerId) {
    InitializationModule.loadFromJSON(this, jsonData, selectedPlayerId);
  }

  getLocationItem(locationName) {
    if (!this.locations || this.locations.size === 0) {
      this._logDebug(
        `[StateManager getLocationItem] Locations map is empty or not initialized.`
      );
      return null;
    }
    const location = this.locations.get(locationName);
    if (location && location.item) {
      // Ensure item has name and player properties
      if (
        typeof location.item.name === 'string' &&
        typeof location.item.player === 'number'
      ) {
        return { name: location.item.name, player: location.item.player };
      }
      this._logDebug(
        `[StateManager getLocationItem] Location ${locationName} found, but item has malformed data:`,
        location.item
      );
      return null;
    }
    this._logDebug(
      `[StateManager getLocationItem] Location ${locationName} not found or has no item.`
    );
    return null;
  }

  // Delegate reachability helper methods to ReachabilityModule
  buildIndirectConnections() {
    return ReachabilityModule.buildIndirectConnections(this);
  }

  findRegionDependencies(rule) {
    return ReachabilityModule.findRegionDependencies(this, rule);
  }

  invalidateCache() {
    return ReachabilityModule.invalidateCache(this);
  }

  // Delegate BFS core methods to ReachabilityModule
  computeReachableRegions() {
    return ReachabilityModule.computeReachableRegions(this);
  }

  runBFSPass() {
    return ReachabilityModule.runBFSPass(this);
  }

  getStartRegions() {
    return ReachabilityModule.getStartRegions(this);
  }

  // Delegate reachability query methods to ReachabilityModule
  isRegionReachable(regionName) {
    return ReachabilityModule.isRegionReachable(this, regionName);
  }

  isLocationAccessible(location) {
    return ReachabilityModule.isLocationAccessible(this, location);
  }

  getProcessedLocations(sorting = 'original', showReachable = true, showUnreachable = true) {
    return ReachabilityModule.getProcessedLocations(this, sorting, showReachable, showUnreachable);
  }

  getPathToRegion(regionName) {
    return ReachabilityModule.getPathToRegion(this, regionName);
  }

  getAllPaths() {
    return ReachabilityModule.getAllPaths(this);
  }

  /**
   * Updates the inventory with multiple items at once
   */
  updateInventoryFromList(items) {
    this.beginBatchUpdate();
    items.forEach((item) => {
      this.addItemToInventory(item);
    });
    this.commitBatchUpdate();
  }

  /**
   * Initialize the inventory with a specific set of items for testing
   */
  initializeInventoryForTest(requiredItems = [], excludedItems = []) {
    this.clearState(); // Use clearState instead of clearInventory

    // Begin batch updates
    this.beginBatchUpdate(true);

    // Handle excludedItems by using itempool_counts
    if (excludedItems?.length > 0) {
      // Check if we have itempool_counts data directly on the stateManager
      if (this.itempoolCounts) {
        //log('info',
        //  'Using itempool_counts data for test inventory:',
        //  this.itempoolCounts
        //);

        // Process special maximum values first to ensure state is properly configured
        if (!this.gameStateModule.difficultyRequirements) {
          this.gameStateModule.difficultyRequirements = {};
        }
        if (this.itempoolCounts['__max_progressive_bottle']) {
          this.gameStateModule.difficultyRequirements.progressive_bottle_limit =
            this.itempoolCounts['__max_progressive_bottle'];
        }
        if (this.itempoolCounts['__max_boss_heart_container']) {
          this.gameStateModule.difficultyRequirements.boss_heart_container_limit =
            this.itempoolCounts['__max_boss_heart_container'];
        }
        if (this.itempoolCounts['__max_heart_piece']) {
          this.gameStateModule.difficultyRequirements.heart_piece_limit =
            this.itempoolCounts['__max_heart_piece'];
        }

        // Add items based on their counts from the pool
        Object.entries(this.itempoolCounts).forEach(([itemName, count]) => {
          // Skip special max values that start with __
          if (itemName.startsWith('__')) return;

          // Skip excluded items
          if (excludedItems.includes(itemName)) return;

          // Skip bottles if AnyBottle is excluded
          if (
            itemName.includes('Bottle') &&
            excludedItems.includes('AnyBottle')
          )
            return;

          // Skip event items
          if (
            this.inventory.itemData[itemName]?.event ||
            this.inventory.itemData[itemName]?.id === 0 ||
            this.inventory.itemData[itemName]?.id === null
          ) {
            return;
          }

          // Add the correct count of each item
          for (let i = 0; i < count; i++) {
            this.addItemToInventory(itemName);
          }
        });
      } else {
        log(
          'warn',
          'No itempool_counts data available, falling back to default behavior'
        );
        // Fallback to original behavior if itempool_counts not available
        Object.keys(this.inventory.itemData).forEach((itemName) => {
          if (
            !excludedItems.includes(itemName) &&
            !(
              itemName.includes('Bottle') && excludedItems.includes('AnyBottle')
            ) &&
            !this.inventory.itemData[itemName].event &&
            this.inventory.itemData[itemName].id !== 0 &&
            this.inventory.itemData[itemName].id !== null
          ) {
            this.addItemToInventory(itemName);
          }
        });
      }
    }

    this.commitBatchUpdate();

    // Handle progressive items for exclusions
    if (excludedItems?.length > 0) {
      excludedItems.forEach((excludedItem) => {
        if (this.inventory.isProgressiveBaseItem(excludedItem)) {
          const providedItems =
            this.inventory.getProgressiveProvidedItems(excludedItem);
          providedItems.forEach((providedItem) => {
            if (this.inventory.items.has(providedItem)) {
              this.inventory.items.set(providedItem, 0);
            }
          });
        }
      });
    }

    // Add required items in second batch
    this.beginBatchUpdate(true);
    requiredItems.forEach((itemName) => {
      this.addItemToInventory(itemName);

      // Process event items using dynamic logic module
      if (this.gameStateModule && this.logicModule) {
        const updatedState = this.logicModule.processEventItem(this.gameStateModule, itemName);
        if (updatedState) {
          this.gameStateModule = updatedState;
        }
      }
      // Event processing now handled entirely through gameStateModule
    });
    this.commitBatchUpdate();

    // Update regions and UI
    this.invalidateCache();
    this.computeReachableRegions();
    // this.notifyUI('inventoryChanged'); // Commented out: Snapshot is requested by the worker command handler
  }

  /**
   * Check if a location has been marked as checked
   */
  isLocationChecked(locationName) {
    return this.checkedLocations.has(locationName);
  }



  /**
   * Mark a location as checked
   * @param {string} locationName - Name of the location to check
   * @param {boolean} addItems - Whether to add the location's item to inventory (default: true)
   */
  checkLocation(locationName, addItems = true) {
    let locationWasActuallyChecked = false;

    // First check if location is already checked
    if (this.checkedLocations.has(locationName)) {
      this._logDebug(`[StateManager Class] Location ${locationName} is already checked, ignoring.`);

      // Publish event to notify UI that location check was rejected due to already being checked
      this._publishEvent('locationCheckRejected', {
        locationName: locationName,
        reason: 'already_checked'
      });
    } else {
      // Find the location data
      const location = this.locations.get(locationName);
      if (!location) {
        this._logDebug(`[StateManager Class] Location ${locationName} not found in locations data.`);

        // Publish event to notify UI that location check was rejected due to location not found
        this._publishEvent('locationCheckRejected', {
          locationName: locationName,
          reason: 'location_not_found'
        });
      } else {
        // Validate that the location is accessible before checking
        if (!this.isLocationAccessible(location)) {
          this._logDebug(`[StateManager Class] Location ${locationName} is not accessible, cannot check.`);

          // Publish event to notify UI that location check was rejected due to inaccessibility
          this._publishEvent('locationCheckRejected', {
            locationName: locationName,
            reason: 'not_accessible'
          });
        } else {
          // Location is accessible, proceed with checking
          this.checkedLocations.add(locationName);
          this._logDebug(`[StateManager Class] Checked location: ${locationName}`);
          locationWasActuallyChecked = true;

          // --- ADDED: Grant item from location (if addItems is true) --- >
          if (addItems && location && location.item && typeof location.item.name === 'string') {
            this._logDebug(
              `[StateManager Class] Location ${locationName} contains item: ${location.item.name}`
            );
            this._addItemToInventory(location.item.name, 1);
            this._logDebug(
              `[StateManager Class] Added ${location.item.name} to inventory.`
            );
            // Potentially trigger an event for item acquisition if needed by other systems
            // this._publishEvent('itemAcquired', { itemName: location.item.name, locationName });
          } else if (addItems && location && location.item) {
            this._logDebug(
              `[StateManager Class] Location ${locationName} has an item, but item.name is not a string: ${JSON.stringify(
                location.item
              )}`
            );
          } else if (addItems) {
            this._logDebug(
              `[StateManager Class] Location ${locationName} has no item or location data is incomplete.`
            );
          } else {
            this._logDebug(
              `[StateManager Class] Location ${locationName} marked as checked without adding items (addItems=false).`
            );
          }
          // --- END ADDED --- >

          this.invalidateCache();
        }
      }
    }

    // Always send a snapshot update so the UI knows the operation completed
    // This ensures pending states are cleared even if the location wasn't actually checked
    this._sendSnapshotUpdate();
  }

  /**
   * Clear all checked locations
   */
  clearCheckedLocations(options = { sendUpdate: true }) {
    if (this.checkedLocations && this.checkedLocations.size > 0) {
      // Ensure checkedLocations exists
      this.checkedLocations.clear();
      this._logDebug('[StateManager Class] Cleared checked locations.');
      this._publishEvent('checkedLocationsCleared');
      if (options.sendUpdate) {
        this._sendSnapshotUpdate();
      }
    } else if (!this.checkedLocations) {
      this.checkedLocations = new Set(); // Initialize if it was null/undefined
    }
  }

  /**
   * Start a batch update to collect inventory changes without triggering UI updates
   * @param {boolean} deferRegionComputation - Whether to defer region computation until commit
   */
  beginBatchUpdate(deferRegionComputation = true) {
    this._batchMode = true;
    this._deferRegionComputation = deferRegionComputation;
    this._batchedUpdates = new Map();
  }

  /**
   * Commit a batch update and process all collected inventory changes
   */
  commitBatchUpdate() {
    if (!this._batchMode) {
      return; // Not in batch mode, nothing to do
    }

    this._logDebug('[StateManager Class] Committing batch update...');
    this._batchMode = false;
    let inventoryChanged = false;

    // Process all batched updates
    for (const [itemName, count] of this._batchedUpdates.entries()) {
      if (count > 0) {
        // REFACTOR: Use format-agnostic helper
        this._addItemToInventory(itemName, count);
        inventoryChanged = true;
      } else if (count < 0) {
        // This case is not currently used as we only add items in batch mode
        log(
          'warn',
          `Batch commit with count ${count} needs inventory.removeItem for ${itemName}`
        );
      }
    }

    this._batchedUpdates.clear();

    let needsSnapshotUpdate = false;

    if (inventoryChanged) {
      this._logDebug('Inventory changed during batch update.');
      this.invalidateCache();
      needsSnapshotUpdate = true;
    }

    // Compute regions if not deferred OR if inventory changed (which invalidates cache)
    if (!this._deferRegionComputation || inventoryChanged) {
      this._logDebug(
        'Recomputing regions after batch commit (if cache was invalid).'
      );
      this.computeReachableRegions(); // This will update cache if invalid. Does not send snapshot.
      needsSnapshotUpdate = true; // Ensure snapshot is sent if recomputation happened or was due.
    }

    if (needsSnapshotUpdate) {
      this._sendSnapshotUpdate();
    }
    this._logDebug('[StateManager Class] Batch update committed.');
  }

  /**
   * Log debug information during region accessibility calculations
   * @private
   */
  _logDebug(message, data = null) {
    // Use the proper logger instance with DEBUG level and StateManager category
    if (data) {
      try {
        const clonedData = JSON.parse(JSON.stringify(data));
        this.logStateManager('debug', message, clonedData);
      } catch (e) {
        this.logStateManager('debug', message, '[Could not clone data]', data);
      }
    } else {
      this.logStateManager('debug', message);
    }
  }

  /**
   * Notifies listeners via the event bus (Legacy or specific events).
   */
  _publishEvent(eventType, eventData = {}) {
    // Only publish essential/non-snapshot events or if specifically configured?
    const snapshotEvents = [
      'inventoryChanged',
      'locationChecked',
      'regionsComputed',
      'rulesLoaded',
    ]; // Events covered by snapshot
    if (snapshotEvents.includes(eventType) && this.postMessageCallback) {
      // If using callback (worker mode), assume snapshot covers these
      this._logDebug(
        `[StateManager Class] Suppressing event '${eventType}' in worker mode (covered by snapshot).`
      );
      return;
    }

    // In worker mode, send events through postMessage for the proxy to republish
    if (this.postMessageCallback) {
      try {
        this.postMessageCallback({
          type: 'eventPublish',
          eventType: eventType,
          eventData: eventData
        });
        this._logDebug(
          `[StateManager Class] Sent ${eventType} event via postMessage for republishing.`
        );
      } catch (error) {
        log(
          'error',
          `[StateManager Class] Error sending ${eventType} event via postMessage:`,
          error
        );
      }
    } else if (this.eventBus) {
      // Main thread mode - publish directly to eventBus
      try {
        this.eventBus.publish(`stateManager:${eventType}`, eventData, 'stateManager');
        this._logDebug(
          `[StateManager Class] Published ${eventType} event via EventBus.`
        );
      } catch (error) {
        log(
          'error',
          `[StateManager Class] Error publishing ${eventType} event via EventBus:`,
          error
        );
      }
    } else {
      // Neither worker mode nor eventBus available
      log(
        'warn',
        `[StateManager Class] No event publishing method available for ${eventType}.`
      );
    }
  }

  /**
   * Helper method to execute a state method by name
   */
  executeStateMethod(method, ...args) {
    // Recursion protection: prevent getSnapshot from calling computeReachableRegions during helper execution
    const wasInHelperExecution = this._inHelperExecution;
    this._inHelperExecution = true;

    try {
      // For consistency, we should check multiple places systematically

      // 1. Check if it's a direct method on stateManager
      if (typeof this[method] === 'function') {
        return this[method](...args);
      }

      // 2. Check special case for can_reach since it's commonly used
      if (method === 'can_reach' && args.length >= 1) {
        const targetName = args[0];
        const targetType = args[1] || 'Region';
        const player = args[2] || 1;
        return this.can_reach(targetName, targetType, player);
      }

      // 3. Look in modern helperFunctions system
      if (this.helperFunctions) {
        // Try exact method name first
        if (typeof this.helperFunctions[method] === 'function') {
          const snapshot = this.getSnapshot();
          const staticData = this.getStaticGameData();
          return this.helperFunctions[method](snapshot, staticData, ...args);
        }

      }

      // 4. Legacy helpers system (fallback)
      if (this.helpers) {
        // Try exact method name first
        if (typeof this.helpers[method] === 'function') {
          return this.helpers[method](...args);
        }

        // If method starts with underscore and no match found, try without underscore
        if (
          method.startsWith('_') &&
          typeof this.helpers[method.substring(1)] === 'function'
        ) {
          return this.helpers[method.substring(1)](...args);
        }

        // If method doesn't start with underscore, try with underscore
        if (
          !method.startsWith('_') &&
          typeof this.helpers['_' + method] === 'function'
        ) {
          return this.helpers['_' + method](...args);
        }
      }

      // If no method found, return undefined
      return undefined;
    } finally {
      // Restore the previous state
      this._inHelperExecution = wasInHelperExecution;
    }

    // State methods are now handled through gameStateModule - no legacy state object

    // Log failure in debug mode
    if (this.debugMode) {
      log('info', `Unknown state method: ${method}`, {
        args: args,
        stateManagerHas: typeof this[method] === 'function',
        helpersHas: this.helpers
          ? typeof this.helpers[method] === 'function' ||
          (method.startsWith('_') &&
            typeof this.helpers[method.substring(1)] === 'function') ||
          (!method.startsWith('_') &&
            typeof this.helpers['_' + method] === 'function')
          : false,
        stateHas: false, // Legacy state system removed
      });
    }

    return false;
  }

  /**
   * Execute a helper function using the thread-agnostic logic
   * @param {string} name - The helper function name
   * @param {...any} args - Arguments to pass to the helper function
   * @returns {any} Result from the helper function
   */
  executeHelper(name, ...args) {

    // Recursion protection: prevent getSnapshot from calling isLocationAccessible during helper execution
    const wasInHelperExecution = this._inHelperExecution;
    this._inHelperExecution = true;

    // Debug logging for helper execution (can be enabled when needed)
    this._logDebug(
      `[StateManager Worker executeHelper] Helper: ${name}, game: ${this.settings?.game
      }, hasHelper: ${!!(this.helperFunctions && this.helperFunctions[name])}`
    );

    try {
      // The `this.helperFunctions` property is now set dynamically based on the game.
      if (this.helperFunctions && this.helperFunctions[name]) {
        const snapshot = this.getSnapshot();
        const staticData = this.getStaticGameData();

        // Add evaluateRule method to snapshot for AHIT helpers
        const self = this;
        snapshot.evaluateRule = function (rule) {
          // Create a minimal snapshot interface for rule evaluation
          const snapshotInterface = self._createSelfSnapshotInterface();
          return self.evaluateRuleFromEngine(rule, snapshotInterface);
        };

        // New helper signature: (snapshot, staticData, ...args)
        return this.helperFunctions[name](snapshot, staticData, ...args);
      }
      return false; // Default return if no helper is found
    } finally {
      // Restore the previous state
      this._inHelperExecution = wasInHelperExecution;
    }
  }

  // Delegate can_reach methods to ReachabilityModule (Python API compatibility)
  can_reach(target, type = 'Region', player = 1) {
    return ReachabilityModule.can_reach(this, target, type, player);
  }

  can_reach_region(region, player = null) {
    return ReachabilityModule.can_reach_region(this, region, player);
  }

  /**
   * Set debug mode for detailed logging
   * @param {boolean|string} mode - true for basic debug, 'ultra' for verbose, false to disable
   */
  setDebugMode(mode) {
    this.debugMode = mode;
    this._logDebug(`Debug mode set to: ${mode}`);
  }

  /**
   * Debug specific critical regions to understand evaluation discrepancies
   */
  debugCriticalRegions() {
    // List of regions that are causing issues
    const criticalRegions = [
      'Pyramid Fairy',
      'Big Bomb Shop',
      'Inverted Big Bomb Shop',
    ];

    log('info', '============ CRITICAL REGIONS DEBUG ============');

    // Log the current inventory state
    log('info', 'Current inventory:');
    const inventoryItems = [];
    this.inventory.items.forEach((count, item) => {
      if (count > 0) {
        inventoryItems.push(`${item} (${count})`);
      }
    });
    log('info', inventoryItems.join(', '));

    // Check each critical region
    criticalRegions.forEach((regionName) => {
      const region = this.regions.get(regionName);
      if (!region) {
        log('info', `Region "${regionName}" not found in loaded regions`);
        return;
      }

      log('info', `\nAnalyzing "${regionName}":`);
      log(
        'info',
        `- Reachable according to stateManager: ${this.isRegionReachable(
          regionName
        )}`
      );

      // Check incoming paths
      log('info', `\nIncoming connections to ${regionName}:`);
      let hasIncomingPaths = false;

      for (const [sourceRegionName, sourceRegion] of this.regions.entries()) {
        if (!sourceRegion || !sourceRegion.exits) return;

        const connectingExits = sourceRegion.exits.filter(
          (exit) => exit.connected_region === regionName
        );

        if (connectingExits.length > 0) {
          hasIncomingPaths = true;
          const sourceReachable = this.isRegionReachable(sourceRegionName);
          log(
            'info',
            `- From ${sourceRegionName} (${sourceReachable ? 'REACHABLE' : 'UNREACHABLE'
            }):`
          );

          connectingExits.forEach((exit) => {
            const snapshotInterface = this._createSelfSnapshotInterface();
            // Set parent_region context for exit evaluation - needs to be the region object, not just the name
            snapshotInterface.parent_region = this.regions.get(sourceRegionName);
            // Set currentExit so get_entrance can detect self-references
            snapshotInterface.currentExit = exit.name;
            const exitAccessible = exit.access_rule
              ? this.evaluateRuleFromEngine(exit.access_rule, snapshotInterface)
              : true;
            log(
              'info',
              `  - Exit: ${exit.name} (${exitAccessible ? 'ACCESSIBLE' : 'BLOCKED'
              })`
            );

            if (exit.access_rule) {
              log(
                'info',
                '    Rule:',
                JSON.stringify(exit.access_rule, null, 2)
              );
              this.debugRuleEvaluation(exit.access_rule);
            }
          });
        }
      }

      if (!hasIncomingPaths) {
        log('info', '  No incoming paths found.');
      }

      // Check path from stateManager
      const path = this.getPathToRegion(regionName);
      if (path && path.length > 0) {
        log('info', `\nPath found to ${regionName}:`);
        path.forEach((segment) => {
          log(
            'info',
            `- ${segment.from} → ${segment.entrance} → ${segment.to}`
          );
        });
      } else {
        log('info', `\nNo path found to ${regionName}`);
      }
    });

    log('info', '===============================================');
  }

  /**
   * Debug evaluation of a specific rule
   */
  debugRuleEvaluation(rule, depth = 0) {
    if (!rule) return;

    const indent = '    ' + '  '.repeat(depth);

    // Get result using internal evaluation
    let ruleResult = false;
    try {
      const snapshotInterface = this._createSelfSnapshotInterface();
      ruleResult = this.evaluateRuleFromEngine(rule, snapshotInterface);
    } catch (e) { }

    switch (rule.type) {
      case 'and':
      case 'or':
        log(
          'info',
          `${indent}${rule.type.toUpperCase()} rule with ${rule.conditions.length
          } conditions`
        );
        let allResults = [];
        rule.conditions.forEach((condition, i) => {
          const snapshotInterfaceInner = this._createSelfSnapshotInterface();
          const result = this.evaluateRuleFromEngine(
            condition,
            snapshotInterfaceInner
          );
          allResults.push(result);
          log(
            'info',
            `${indent}- Condition #${i + 1}: ${result ? 'PASS' : 'FAIL'}`
          );
          this.debugRuleEvaluation(condition, depth + 1);
        });

        if (rule.type === 'and') {
          log(
            'info',
            `${indent}AND result: ${allResults.every((r) => r) ? 'PASS' : 'FAIL'
            }`
          );
        } else {
          log(
            'info',
            `${indent}OR result: ${allResults.some((r) => r) ? 'PASS' : 'FAIL'}`
          );
        }
        break;

      case 'item_check':
        const hasItem = this._hasItem(rule.item);
        log(
          'info',
          `${indent}ITEM CHECK: ${rule.item} - ${hasItem ? 'HAVE' : 'MISSING'}`
        );
        break;

      case 'count_check':
        const count = this._countItem(rule.item);
        log(
          'info',
          `${indent}COUNT CHECK: ${rule.item} (${count}) >= ${rule.count} - ${count >= rule.count ? 'PASS' : 'FAIL'
          }`
        );
        break;

      case 'helper':
        const helperResult = this.helpers.executeHelper(
          rule.name,
          ...(rule.args || [])
        );
        log(
          'info',
          `${indent}HELPER: ${rule.name}(${JSON.stringify(rule.args)}) - ${helperResult ? 'PASS' : 'FAIL'
          }`
        );
        break;

      case 'state_method':
        const methodResult = this.helpers.executeStateMethod(
          rule.method,
          ...(rule.args || [])
        );
        log(
          'info',
          `${indent}STATE METHOD: ${rule.method}(${JSON.stringify(
            rule.args
          )}) - ${methodResult ? 'PASS' : 'FAIL'}`
        );

        // Special debug for can_reach which is often the source of problems
        if (rule.method === 'can_reach' && rule.args && rule.args.length > 0) {
          const targetRegion = rule.args[0];
          const targetType = rule.args[1] || 'Region';

          if (targetType === 'Region') {
            log(
              'info',
              `${indent}  -> Checking can_reach for region "${targetRegion}": ${this.isRegionReachable(targetRegion)
                ? 'REACHABLE'
                : 'UNREACHABLE'
              }`
            );
          }
        }
        break;

      case 'conditional':
        const testResult = this.evaluateRuleFromEngine(rule.test);
        if (testResult) {
          return this.evaluateRuleFromEngine(rule.if_true);
        } else {
          // Handle null if_false as true (no additional requirements)
          return rule.if_false === null
            ? true
            : this.evaluateRuleFromEngine(rule.if_false);
        }

      case 'comparison':
      case 'compare':
        const left = this.evaluateRuleFromEngine(rule.left);
        const right = this.evaluateRuleFromEngine(rule.right);
        let op = rule.op.trim();
        switch (op) {
          case '==':
            return left == right;
          case '!=':
            return left != right;
          case '<=':
            return left <= right;
          case '<':
            return left < right;
          case '>=':
            return left >= right;
          case '>':
            return left > right;
          case 'in':
            if (Array.isArray(right) || typeof right === 'string') {
              return right.includes(left);
            } else if (right instanceof Set) {
              return right.has(left);
            }
            log(
              'warn',
              `[StateManager._internalEvaluateRule] 'in' operator requires iterable right-hand side (Array, String, Set). Got:`,
              right
            );
            return false;
          case 'not in':
            if (Array.isArray(right) || typeof right === 'string') {
              return !right.includes(left);
            } else if (right instanceof Set) {
              return !right.has(left);
            }
            log(
              'warn',
              `[StateManager._internalEvaluateRule] 'not in' operator requires iterable right-hand side (Array, String, Set). Got:`,
              right
            );
            return true;
          default:
            log(
              'warn',
              `[StateManager._internalEvaluateRule] Unsupported comparison operator: ${rule.op}`
            );
            return false;
        }

      case 'binary_op':
        const leftOp = this.evaluateRuleFromEngine(rule.left);
        const rightOp = this.evaluateRuleFromEngine(rule.right);
        switch (rule.op) {
          case '+':
            return leftOp + rightOp;
          case '-':
            return leftOp - rightOp;
          case '*':
            return leftOp * rightOp;
          case '/':
            return rightOp !== 0 ? leftOp / rightOp : Infinity;
          default:
            log(
              'warn',
              `[StateManager._internalEvaluateRule] Unsupported binary operator: ${rule.op}`
            );
            return undefined;
        }

      case 'attribute':
        const baseObject = this.evaluateRuleFromEngine(rule.object);
        if (baseObject && typeof baseObject === 'object') {
          const attrValue = baseObject[rule.attr];
          if (typeof attrValue === 'function') {
            return attrValue.bind(baseObject);
          }
          return attrValue;
        } else {
          return undefined;
        }

      case 'function_call':
        const func = this.evaluateRuleFromEngine(rule.function);
        if (typeof func !== 'function') {
          log(
            'error',
            '[StateManager._internalEvaluateRule] Attempted to call non-function:',
            func,
            { rule }
          );
          return false;
        }
        const args = rule.args
          ? rule.args.map((arg) => this.evaluateRuleFromEngine(arg))
          : [];
        let thisContext = null;
        try {
          return func.apply(thisContext, args);
        } catch (callError) {
          log(
            'error',
            '[StateManager._internalEvaluateRule] Error executing function call:',
            callError,
            { rule, funcName: rule.function?.attr || rule.function?.id }
          );
          return false;
        }

      case 'constant':
        return rule.value;

      case 'bool':
        return rule.value;

      case 'string':
        return rule.value;

      case 'number':
        return rule.value;

      case 'name':
        if (rule.id === 'True') return true;
        if (rule.id === 'False') return false;
        if (rule.id === 'None') return null;
        if (rule.id === 'self') return this;
        if (this.settings && this.settings.hasOwnProperty(rule.id)) {
          return this.settings[rule.id];
        }
        if (this.helpers && typeof this.helpers[rule.id] === 'function') {
          return this.helpers[rule.id].bind(this.helpers);
        }
        if (typeof this[rule.id] === 'function') {
          return this[rule.id].bind(this);
        }
        log(
          'warn',
          `[StateManager._internalEvaluateRule] Unresolved name: ${rule.id}`
        );
        return undefined;

      default:
        if (
          typeof rule === 'string' ||
          typeof rule === 'number' ||
          typeof rule === 'boolean' ||
          rule === null
        ) {
          return rule;
        }
        log(
          'warn',
          `[StateManager._internalEvaluateRule] Unsupported rule type or invalid rule: ${rule.type}`,
          rule
        );
        return false;
    }
  }

  // Helper to create a snapshot-like interface from the instance itself
  // Needed for internal methods that rely on rule evaluation (like isLocationAccessible)
  _createSelfSnapshotInterface() {
    return StatePersistenceModule._createSelfSnapshotInterface(this);
  }

  /**
   * Sends a state snapshot update via the communication channel.
   * @private
   */
  _sendSnapshotUpdate() {
    StatePersistenceModule._sendSnapshotUpdate(this);
  }

  getSnapshot() {
    return StatePersistenceModule.getSnapshot(this);
  }

  // REMOVED: Legacy canonical state format initialization - now always canonical

  // REMOVED: Legacy inventory migration - now always canonical

  // REMOVED: Legacy inventory migration - now always canonical

  // Delegate inventory helper methods to InventoryModule
  _addItemToInventory(itemName, count = 1) {
    return InventoryModule._addItemToInventory(this, itemName, count);
  }

  _removeItemFromInventory(itemName, count = 1) {
    return InventoryModule._removeItemFromInventory(this, itemName, count);
  }

  _hasItem(itemName) {
    return InventoryModule.hasItem(this, itemName);
  }

  _countItem(itemName) {
    return InventoryModule.countItem(this, itemName);
  }

  _countGroup(groupName) {
    return InventoryModule.countGroup(this, groupName);
  }

  _hasGroup(groupName) {
    return InventoryModule.hasGroup(this, groupName);
  }

  has_any(items) {
    return InventoryModule.has_any(this, items);
  }

  has_all(items) {
    return InventoryModule.has_all(this, items);
  }

  has_all_counts(itemCounts) {
    return InventoryModule.has_all_counts(this, itemCounts);
  }

  has_from_list(items, count) {
    return InventoryModule.has_from_list(this, items, count);
  }

  applyRuntimeState(payload) {
    StatePersistenceModule.applyRuntimeState(this, payload);
  }

  async loadRules(source) {
    this.eventBus.publish('stateManager:loadingRules', { source }, 'stateManager');
    log('info', `[StateManager] Attempting to load rules from source:`, source);

    if (
      this.gameSpecificState &&
      typeof this.gameSpecificState.resetForNewRules === 'function'
    ) {
      this.gameSpecificState.resetForNewRules();
    }

    if (typeof source === 'string') {
      // Source is a URL
      log('info', `[StateManager] Loading rules from URL: ${source}`);
      try {
        const response = await fetch(source);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const parsedRules = await response.json();
        this.rules = parsedRules;
        log(
          'info',
          '[StateManager] Successfully fetched and parsed rules from URL.'
        );
      } catch (error) {
        log('error', '[StateManager] Error loading rules from URL:', error);
        this.eventBus.publish('stateManager:rulesLoadFailed', {
          source,
          error,
        }, 'stateManager');
        this.rules = null; // Ensure rules are null on failure
        return; // Exit early
      }
    } else if (typeof source === 'object' && source !== null) {
      // Source is direct data
      log('info', '[StateManager] Loading rules from provided object data.');
      this.rules = source; // Assign the object directly
      // Perform a basic validation
      if (!this.rules || typeof this.rules.regions === 'undefined') {
        // Example check
        log(
          'error',
          '[StateManager] Provided rules data is malformed or missing essential parts (e.g., regions). Data:',
          this.rules
        );
        this.eventBus.publish('stateManager:rulesLoadFailed', {
          source: 'directData',
          error: 'Malformed direct rules data',
        }, 'stateManager');
        this.rules = null; // Ensure rules are null on failure
        return; // Exit early
      }
      log(
        'info',
        '[StateManager] Successfully loaded rules from direct object data.'
      );
    } else {
      log(
        'warn',
        '[StateManager] loadRules called with invalid source type:',
        source
      );
      this.eventBus.publish('stateManager:rulesLoadFailed', {
        source,
        error: 'Invalid rules source type',
      }, 'stateManager');
      this.rules = null;
      return; // Exit early
    }

    if (!this.rules) {
      log(
        'error',
        '[StateManager] Rules are null after loading attempt. Cannot proceed.'
      );
      // No rulesLoadFailed event here as it should have been published by the failing block
      return;
    }

    // Reset and re-initialize game-specific state components based on new rules
  }

  _createInventoryInstance(gameName) {
    // Delegated to initialization module - kept as private method for compatibility
    return InitializationModule.createInventoryInstance(this, gameName);
  }

  /**
   * Evaluates location accessibility for a given test scenario.
   * Temporarily sets inventory, evaluates, then restores original inventory.
   * This method assumes the rules (staticData) have already been loaded for the current test set.
   * @param {string} locationName - The name of the location to check.
   * @param {string[]} requiredItems - Items to add for this test.
   * @param {string[]} excludedItems - Items to ensure are not present for this test.
   * @returns {boolean} - True if accessible, false otherwise.
   */
  evaluateAccessibilityForTest(
    locationName,
    requiredItems = [],
    excludedItems = []
  ) {
    this._logDebug(
      `[StateManager evaluateAccessibilityForTest] For: ${locationName}`,
      { requiredItems, excludedItems }
    );

    if (!this.inventory || !this.locations || !this.itemData) {
      log(
        'error',
        '[StateManager evaluateAccessibilityForTest] Core data (inventory, locations, itemData) not initialized.'
      );
      return false;
    }

    // 1. Save current inventory state
    const originalInventoryItems = new Map(this.inventory.items);
    const originalCheckedLocations = new Set(this.checkedLocations); // Save checked locations if they influence tests

    let accessibilityResult = false;
    try {
      // 2. Clear current inventory and checked locations for the test
      this.inventory.items.clear();
      this.checkedLocations.clear(); // Tests usually start with no locations checked unless specified

      // 3. Set up the temporary inventory for the test
      // This logic is similar to initializeInventoryForTest but more focused on the items map
      const itemsForTest = {}; // Build a simple { itemName: count } map

      // Add items from itempool (respecting exclusions)
      if (this.itempoolCounts) {
        for (const item in this.itempoolCounts) {
          if (excludedItems.includes(item)) continue;
          if (
            this.itemData[item]?.event ||
            this.itemData[item]?.id === 0 ||
            this.itemData[item]?.id === null
          )
            continue; // Skip event items from pool for test setup

          // For progressive items in the pool, add the base progressive item name
          let baseItemName = item;
          // A simple check: if itemData for 'item' does not have max_count, it might be a tier.
          // A more robust way is to check if 'item' is a value in any progressionMapping.
          // For now, we assume itempoolCounts uses base progressive names.
          // If `item` is 'Fighter Sword' and 'Progressive Sword' maps to it, we should add 'Progressive Sword'.
          // This part is tricky and depends on how itempoolCounts and progressionMapping are structured.
          // Assuming itempoolCounts uses base progressive item names for simplicity here.

          itemsForTest[baseItemName] =
            (itemsForTest[baseItemName] || 0) + this.itempoolCounts[item];
        }
      } else {
        // Fallback: If no itempool, use all non-event, non-excluded items from itemData (typically 1 of each for testing)
        for (const itemName in this.itemData) {
          if (excludedItems.includes(itemName)) continue;
          if (
            this.itemData[itemName]?.event ||
            this.itemData[itemName]?.id === 0 ||
            this.itemData[itemName]?.id === null
          )
            continue;
          itemsForTest[itemName] = (itemsForTest[itemName] || 0) + 1;
        }
      }

      // Add required items, ensuring they override any pool/default setup
      requiredItems.forEach((item) => {
        // For progressive items, requiredItems should list the base progressive name.
        itemsForTest[item] = (itemsForTest[item] || 0) + 1; // Or set to specific count if needed
      });

      // Apply this test-specific inventory to this.inventory.items
      for (const itemName in itemsForTest) {
        const count = itemsForTest[itemName];
        for (let i = 0; i < count; i++) {
          this._addItemToInventory(itemName, 1); // Format-agnostic method handles progressive logic
        }
      }

      this._logDebug(
        '[StateManager evaluateAccessibilityForTest] Temporary inventory set:',
        this.inventory.items
      );

      // 4. Invalidate cache and recompute reachability based on temporary inventory
      this.invalidateCache();
      this.computeReachableRegions();
      this._logDebug(
        '[StateManager evaluateAccessibilityForTest] Reachability recomputed for test inventory.'
      );

      // 5. Find the location object (worker has its own this.locations)
      const locationObject = this.locations.get(locationName);
      if (!locationObject) {
        log(
          'warn',
          `[StateManager evaluateAccessibilityForTest] Location object not found: ${locationName}`
        );
        return false; // Location itself doesn't exist in current rules
      }

      // 6. Evaluate accessibility using the worker's internal methods
      accessibilityResult = this.isLocationAccessible(locationObject); // This uses the worker's engine and processed rules
      this._logDebug(
        `[StateManager evaluateAccessibilityForTest] Evaluation for "${locationName}" result: ${accessibilityResult}`
      );
    } catch (error) {
      log(
        'error',
        `[StateManager evaluateAccessibilityForTest] Error during evaluation for "${locationName}":`,
        error
      );
      accessibilityResult = false;
    } finally {
      // 7. Restore original inventory and checked locations
      this.inventory.items = originalInventoryItems;
      this.checkedLocations = originalCheckedLocations;
      this._logDebug(
        '[StateManager evaluateAccessibilityForTest] Original inventory and checked locations restored.'
      );

      // 8. Invalidate cache and recompute reachability for the original state
      this.invalidateCache();
      this.computeReachableRegions(); // This will recompute based on the restored inventory
      this._logDebug(
        '[StateManager evaluateAccessibilityForTest] Reachability recomputed for original state.'
      );
      // A snapshot update might be sent here if other parts of the system listen, but for a test, it's usually not the focus.
      // The worker does not proactively send snapshots unless a command like getSnapshot is called or an item is added/checked *permanently*.
    }

    return accessibilityResult;
  }

  /**
   * Returns the item pool counts for the current game/rules.
   * @returns {object|null} The itempool_counts object or null if not loaded.
   */
  getItemPoolCounts() {
    return this.itempoolCounts || null;
  }

  /**
   * Returns all item definitions.
   * @returns {object|null} The itemData object or null if not loaded.
   */
  getAllItemData() {
    return this.itemData;
  }

  getDungeons() {
    return this.dungeons;
  }

  setAutoCollectEventsConfig(enabled) {
    this.autoCollectEventsEnabled = enabled;
    this.logger.info(
      `[StateManager] Setting autoCollectEventsEnabled to: ${enabled}`
    );
    // If disabling, it might be necessary to re-evaluate reachability without auto-collection.
    // For testing, this is usually paired with a state clear/reset before tests.
    // If enabling, a re-computation might pick up pending events.
    this.invalidateCache(); // Invalidate cache as this changes a core behavior
    this._sendSnapshotUpdate(); // Send update if state might have changed due to this setting
  }

  /**
   * Returns static game data that doesn't change during gameplay.
   * This includes location/item ID mappings, original orders, etc.
   */
  getStaticGameData() {
    return StatePersistenceModule.getStaticGameData(this);
  }
}
