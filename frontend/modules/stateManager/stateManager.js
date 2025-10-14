/**
 * State Manager Module
 *
 * Manages game state including inventory and reachable regions/locations.
 * Handles automatic collection of event items when their locations become accessible.
 * All state (including events) is tracked through the inventory system.
 *
 * @module stateManager
 */

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
import * as LocationCheckingModule from './core/locationChecking.js';
import * as RuleEvaluatorModule from './core/ruleEvaluator.js';
import * as BatchUpdateModule from './core/batchUpdateManager.js';

// Create module-level logger
const moduleLogger = createUniversalLogger('stateManager');

// Helper function for logging with fallback (for backward compatibility)
function log(level, message, ...data) {
  moduleLogger[level](message, ...data);
}

/**
 * Main state manager class that coordinates game state, inventory, and reachability calculations.
 *
 * This class delegates most functionality to specialized core modules:
 * - InitializationModule: Game setup and rule loading
 * - InventoryModule: Item management and counting
 * - ReachabilityModule: Region and location accessibility
 * - StatePersistenceModule: State snapshots and serialization
 * - LocationCheckingModule: Tracking checked locations
 * - RuleEvaluatorModule: Logic evaluation and helper execution
 * - BatchUpdateModule: Efficient bulk updates
 *
 * @class StateManager
 * @memberof module:stateManager
 */
export class StateManager {
  /**
   * @param {function} [evaluateRuleFunction] - The rule evaluation function (from ruleEngine.js).
   *                                             Required when running in worker/isolated context.
   * @param {object} [loggerInstance] - Logger instance for logging
   * @param {object} [commandQueueInstance] - Command queue instance (Phase 8)
   */
  constructor(evaluateRuleFunction, loggerInstance, commandQueueInstance) {
    // Store the injected logger instance
    this.logger = loggerInstance || console;

    // Phase 8: Store command queue reference (injected from worker)
    this.commandQueue = commandQueueInstance || null;

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
    this.spoilerTestMode = false; // Flag to indicate if running in spoiler test mode (filters non-advancement items)

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
    BatchUpdateModule.updateInventoryFromList(this, items);
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
    return LocationCheckingModule.isLocationChecked(this, locationName);
  }

  /**
   * Mark a location as checked
   * @param {string} locationName - Name of the location to check
   * @param {boolean} addItems - Whether to add the location's item to inventory (default: true)
   */
  checkLocation(locationName, addItems = true) {
    LocationCheckingModule.checkLocation(this, locationName, addItems);
  }

  /**
   * Clear all checked locations
   */
  clearCheckedLocations(options = { sendUpdate: true }) {
    LocationCheckingModule.clearCheckedLocations(this, options);
  }

  /**
   * Start a batch update to collect inventory changes without triggering UI updates
   * @param {boolean} deferRegionComputation - Whether to defer region computation until commit
   */
  beginBatchUpdate(deferRegionComputation = true) {
    BatchUpdateModule.beginBatchUpdate(this, deferRegionComputation);
  }

  /**
   * Commit a batch update and process all collected inventory changes
   */
  commitBatchUpdate() {
    BatchUpdateModule.commitBatchUpdate(this);
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
    return RuleEvaluatorModule.executeStateMethod(this, method, ...args);
  }

  /**
   * Execute a helper function using the thread-agnostic logic
   * @param {string} name - The helper function name
   * @param {...any} args - Arguments to pass to the helper function
   * @returns {any} Result from the helper function
   */
  executeHelper(name, ...args) {
    return RuleEvaluatorModule.executeHelper(this, name, ...args);
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
    return RuleEvaluatorModule.debugCriticalRegions(this);
  }

  /**
   * Debug evaluation of a specific rule
   */
  debugRuleEvaluation(rule, depth = 0) {
    return RuleEvaluatorModule.debugRuleEvaluation(this, rule, depth);
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
    LocationCheckingModule.setAutoCollectEventsConfig(this, enabled);
  }

  /**
   * Sets whether StateManager is running in spoiler test mode
   * In spoiler test mode, only advancement items are added to inventory (matching Python's CollectionState behavior)
   * @param {boolean} enabled - True to enable spoiler test mode, false for normal gameplay
   */
  setSpoilerTestMode(enabled) {
    this.spoilerTestMode = enabled;
    this.logger.info(
      'StateManager',
      `Setting spoilerTestMode to: ${enabled}`
    );
  }

  /**
   * Returns static game data that doesn't change during gameplay.
   * This includes location/item ID mappings, original orders, etc.
   */
  getStaticGameData() {
    return StatePersistenceModule.getStaticGameData(this);
  }

  /**
   * Phase 8: Get command queue snapshot for debugging
   * Returns queue state information including pending commands, history, and metrics
   * @returns {Object} Queue snapshot or error object if queue not available
   */
  getCommandQueueSnapshot() {
    if (!this.commandQueue) {
      return {
        error: 'Command queue not available',
        available: false
      };
    }

    return this.commandQueue.getSnapshot();
  }
}
