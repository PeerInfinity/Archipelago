// Refactored to use canonical inventory format and agnostic logic modules
import { 
  initializeGameLogic, 
  determineGameName, 
  getGameLogic,
  detectGameFromWorldClass 
} from '../shared/gameLogic/gameLogicRegistry.js';

// Import universal logger for consistent logging across contexts
import { createUniversalLogger } from '../../app/core/universalLogger.js';

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

    // Region and location data
    this.locations = []; // Flat array of all locations
    this.regions = {}; // Map of region name -> region data
    this.dungeons = {}; // ADDED: Map of dungeon name -> dungeon data
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
    this.settings = settingsObject;
    this.logger.info('StateManager', 'Settings applied:', this.settings);
    // Potentially call other methods if settings need immediate effect
    // Game-specific settings are now loaded through gameStateModule
    // or if settings affect helper instantiation or other core components.
    // For now, just storing them.
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

  /**
   * DEPRECATED: Legacy inventory initialization method.
   * Use _createInventoryInstance() for canonical format instead.
   */
  initializeInventory(
    gameName,
    items,
    progressionMapping,
    itemData,
    groupData
  ) {
    // Use canonical format for all games
    this.inventory = this._createInventoryInstance(gameName);
    this.itemData = itemData; // Store for convenience
    this.groupData = groupData; // Store groupData
    
    log('info', `[StateManager] Initialized canonical inventory for game: ${gameName}`);
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
    // Canonical format: reset all items to 0
    if (this.inventory && this.itemData) {
      for (const itemName in this.itemData) {
        if (Object.hasOwn(this.itemData, itemName)) {
          this.inventory[itemName] = 0;
        }
      }
    }
    this._logDebug('[StateManager Class] Inventory cleared.');

    // Only invalidate cache and recompute if NOT in batch mode
    if (!this._batchMode) {
      this.invalidateCache();
      this.computeReachableRegions(); // Recompute first
      // this._publishEvent('inventoryChanged'); // Snapshot update implies this
    } else {
      this._logDebug(
        '[StateManager Class] clearInventory: In batch mode, deferring cache invalidation and recomputation.'
      );
      this.invalidateCache(); // Still need to invalidate cache for batch commit to know to recompute
    }
  }

  clearState(options = { recomputeAndSendUpdate: true }) {
    // Re-initialize inventory - canonical format: reset all items to 0
    if (this.inventory && this.itemData) {
      for (const itemName in this.itemData) {
        if (Object.hasOwn(this.itemData, itemName)) {
          this.inventory[itemName] = 0;
        }
      }
    } else if (!this.inventory) {
      // If inventory doesn't exist, create it
      this.inventory = this._createInventoryInstance(
        this.settings ? this.settings.game : this.rules?.game_name || 'UnknownGame'
      );
    }

    // Re-initialize game-specific state using dynamic logic modules
    if (this.settings) {
      const gameSettings = this.settings;
      
      // Use centralized game logic selection
      const logic = initializeGameLogic({
        gameName: this.rules?.game_name,
        settings: gameSettings,
        worldClass: null // Not available in this context
      });
      
      this.logicModule = logic.logicModule;
      this.helperFunctions = logic.helperFunctions;
      
      // Re-initialize using selected logic module
      this.gameStateModule = this.logicModule.initializeState();
      this.gameStateModule = this.logicModule.loadSettings(this.gameStateModule, gameSettings);
      
      // All games now use gameStateModule - no legacy state system needed
      this.state = null;
    } else {
      // Fallback if no settings to determine game type - use generic logic
      this.logicModule = genericLogic.genericStateModule;
      this.helperFunctions = genericLogic.helperFunctions;
      this.gameStateModule = this.logicModule.initializeState();
      this.state = null;
    }

    this.clearCheckedLocations({ sendUpdate: false }); // Call quietly

    this.indirectConnections = new Map();
    this.invalidateCache();
    this._logDebug(
      '[StateManager Class] Internal state structures cleared by clearState.'
    );

    if (options.recomputeAndSendUpdate) {
      this._logDebug(
        '[StateManager Class] clearState recomputing and sending snapshot.'
      );
      this.computeReachableRegions();
      this._sendSnapshotUpdate();
    }
  }

  /**
   * Adds an item and notifies all registered callbacks
   */
  addItemToInventory(itemName, count = 1) {
    if (!this._batchMode) {
      // Non-batch mode: Apply immediately and update
      if (this.inventory) {
        // REFACTOR: Use format-agnostic helper
        this._addItemToInventory(itemName, count);
        this._logDebug(
          `[StateManager] addItemToInventory: Added "${itemName}" x${count} (canonical format)`
        );
        this.invalidateCache(); // Adding an item can change reachability
        this._sendSnapshotUpdate(); // Send a new snapshot
      } else {
        this._logDebug(
          `[StateManager] addItemToInventory: Inventory not available for "${itemName}"`,
          null,
          'warn'
        );
      }
    } else {
      // Batch mode: Record the item update for later processing by commitBatchUpdate
      this._logDebug(
        `[StateManager] addItemToInventory: Batching item "${itemName}" with count ${count}`
      );
      const currentBatchedCount = this._batchedUpdates.get(itemName) || 0;
      this._batchedUpdates.set(itemName, currentBatchedCount + count);
      // DO NOT call this.inventory.addItem() here directly.
      // DO NOT call invalidateCache() or _sendSnapshotUpdate() here directly.
    }
  }

  /**
   * Removes items from the player's inventory
   */
  removeItemFromInventory(itemName, count = 1) {
    if (!this._batchMode) {
      // Non-batch mode: Apply immediately and update
      if (this.inventory) {
        // Use format-agnostic helper
        this._removeItemFromInventory(itemName, count);
        this._logDebug(
          `[StateManager] removeItemFromInventory: Removed "${itemName}" x${count} (canonical format)`
        );
        this.invalidateCache(); // Removing items can change reachability
        this._sendSnapshotUpdate(); // Send a new snapshot
      } else {
        this._logDebug(
          `[StateManager] removeItemFromInventory: Inventory not available for "${itemName}"`,
          null,
          'warn'
        );
      }
    } else {
      // Batch mode: Record the item update for later processing by commitBatchUpdate
      this._logDebug(
        `[StateManager] removeItemFromInventory: Batching item removal "${itemName}" with count ${count}`
      );
      const currentBatchedCount = this._batchedUpdates.get(itemName) || 0;
      this._batchedUpdates.set(itemName, currentBatchedCount - count);
      // DO NOT call invalidateCache() or _sendSnapshotUpdate() here directly.
    }
  }

  /**
   * Adds an item to the player's inventory by its name.
   */
  addItemToInventoryByName(itemName, count = 1, fromServer = false) {
    if (!itemName) {
      this._logDebug(
        '[StateManager addItemToInventoryByName] Attempted to add null or undefined item.',
        null,
        'warn'
      );
      return;
    }

    this._logDebug(
      `[StateManager addItemToInventoryByName] Attempting to add: ${itemName}, Count: ${count}, FromServer: ${fromServer}`
    );

    // Use format-agnostic helper method that works with both legacy and canonical formats
    this._addItemToInventory(itemName, count);
    this._logDebug(
      `[StateManager addItemToInventoryByName] Added ${count} of "${itemName}" using format-agnostic method.`
    );

    // Publish events and update state
    this._publishEvent('stateManager:inventoryItemAdded', {
      itemName,
      count,
      currentInventory: this.inventory, // Canonical format is always a plain object
    });
    this.invalidateCache(); // Adding items can change reachability
    this._sendSnapshotUpdate(); // Send a new snapshot

    // If the item is an event item and settings indicate auto-checking event locations
    const itemDetails = this.itemData[itemName];
    if (
      itemDetails &&
      itemDetails.event &&
      this.settings?.gameSpecific?.auto_check_event_locations
    ) {
      this.checkEventLocation(itemName); // Check the corresponding event location
    }
  }

  getItemCount(itemName) {
    return this._countItem(itemName);
  }

  /**
   * Loads and processes region/location data from a JSON file
   * @param {object} jsonData - The parsed JSON data.
   * @param {string} selectedPlayerId - The ID of the player whose data should be loaded.
   */
  loadFromJSON(jsonData, selectedPlayerId) {
    this.invalidateCache(); // +++ ADDED: Ensure cache is cleared for new rules load +++

    // Clear checked locations for fresh rules load
    this.clearCheckedLocations({ sendUpdate: false }); // Don't send update during initialization

    // --- VERY EARLY DIAGNOSTIC LOG (using console.log directly) ---
    //log('info',
    //  `[StateManager Worker loadFromJSON VERY EARLY DIRECT LOG] Entered method. Player ID: ${selectedPlayerId}. jsonData keys: ${
    //    jsonData ? Object.keys(jsonData) : 'jsonData is null/undefined'
    //  }`
    //);
    // --- END VERY EARLY DIAGNOSTIC LOG ---

    this._logDebug(
      `[StateManager Class] Loading JSON for player ${selectedPlayerId}...`
    );

    // Store the rules data so it's available for getStaticGameData()
    this.rules = jsonData;

    // Initialize order arrays
    this.originalLocationOrder = [];
    this.originalRegionOrder = [];
    this.originalExitOrder = [];

    if (!jsonData) {
      log(
        'error',
        '[StateManager loadFromJSON] jsonData is null or undefined. Aborting.'
      );
      throw new Error('Invalid JSON data provided to loadFromJSON');
    }
    if (!selectedPlayerId) {
      log(
        'error',
        '[StateManager loadFromJSON] selectedPlayerId is not provided. Aborting.'
      );
      throw new Error('loadFromJSON called without selectedPlayerId');
    }
    if (!jsonData.schema_version || jsonData.schema_version !== 3) {
      // It's often better to log an error and continue with a defined (but perhaps empty) state
      // rather than throwing an error that might crash the worker, unless schema version is absolutely critical.
      log(
        'error',
        `[StateManager loadFromJSON] Invalid JSON schema version: ${jsonData.schema_version}. Expected 3. Proceeding with caution.`
      );
      // Depending on strictness, you might still want to throw:
      // throw new Error('Invalid JSON format: requires schema version 3');
    }

    // Set the player slot based on selection
    this.playerSlot = parseInt(selectedPlayerId, 10);
    log('info', `StateManager playerSlot set to: ${this.playerSlot}`);

    // Store rules data (including game_name and game_directory)
    this.rules = jsonData;

    // Log the game name from rules
    this._logDebug(
      `[StateManager loadFromJSON] Game name from rules: "${this.rules?.game_name}", directory: "${this.rules?.game_directory}"`
    );

    // Load item data for the selected player
    this.itemData = jsonData.items?.[selectedPlayerId] || {};
    this.itemNameToId = {};
    for (const id in this.itemData) {
      if (Object.hasOwn(this.itemData, id) && this.itemData[id]?.name) {
        this.itemNameToId[this.itemData[id].name] = this.itemData[id].id;
      }
    }
    this._logDebug(
      `Loaded ${
        Object.keys(this.itemNameToId).length
      } item IDs and populated itemNameToId map.`
    );

    // Load regions for the selected player and their original order
    this.regions = jsonData.regions?.[selectedPlayerId] || {};
    this.originalRegionOrder = Object.keys(this.regions); // Order based on keys from JSON
    this._logDebug(
      `Loaded ${this.originalRegionOrder.length} regions and their original order.`
    );

    // ADDED: Load dungeons for the selected player
    this.dungeons = jsonData.dungeons?.[selectedPlayerId] || {};
    this._logDebug(`Loaded ${Object.keys(this.dungeons).length} dungeons.`);

    // ADDED: Link regions to their dungeons
    for (const regionName in this.regions) {
      const region = this.regions[regionName];
      if (region.dungeon && this.dungeons[region.dungeon]) {
        // The region.dungeon from JSON is just a name.
        // We replace it with a direct reference to the dungeon object.
        region.dungeon = this.dungeons[region.dungeon];
      }
    }
    this._logDebug('Linked regions to their dungeon objects.');

    // Load group data for the selected player
    const playerSpecificGroupData =
      jsonData.item_groups?.[String(selectedPlayerId)];
    if (Array.isArray(playerSpecificGroupData)) {
      this.groupData = playerSpecificGroupData;
      //this._logDebug(
      //  `Loaded player-specific item_groups for player ${selectedPlayerId}: ${this.groupData.length} groups.`
      //);
    } else if (jsonData.groups && Array.isArray(jsonData.groups)) {
      this.groupData = jsonData.groups; // Fallback to global jsonData.groups
      this._logDebug(
        `Used global jsonData.groups for player ${selectedPlayerId}: ${this.groupData.length} groups (item_groups not suitable).`
      );
    } else {
      this.groupData = []; // Default to empty array if no suitable group data is found
      log(
        'warn',
        `[StateManager loadFromJSON] No valid group data found for player ${selectedPlayerId}. Defaulting to empty array.`
      );
    }

    // Load other direct properties
    this.startRegions = jsonData.start_regions?.[selectedPlayerId] || [];
    this.mode = jsonData.mode?.[selectedPlayerId] || null;
    this.itempoolCounts = jsonData.itempool_counts?.[selectedPlayerId] || {};
    this.progressionMapping =
      jsonData.progression_mapping?.[selectedPlayerId] || {};
    this._logDebug(
      'Loaded startRegions, mode, itempoolCounts, and progressionMapping.'
    );

    // --- Select and Initialize Game-Specific Logic Module ---
    const gameSettingsFromFile = jsonData.settings?.[selectedPlayerId] || {};
    // Use game_name from rules (already loaded) if gameSettingsFromFile.game is missing
    const gameName = gameSettingsFromFile.game || this.rules?.game_name || 'UnknownGame';

    this._logDebug(
      `[StateManager loadFromJSON] Selecting logic module for game: "${gameName}" (derived from settings.game or rules.game_name)`
    );

    // Use centralized game logic selection
    const logic = getGameLogic(gameName);
    this.logicModule = logic.logicModule;
    this.helperFunctions = logic.helperFunctions;

    // Initialize the state using the selected module
    this.gameStateModule = this.logicModule.initializeState();
    
    // Load settings using the selected module
    this.gameStateModule = this.logicModule.loadSettings(this.gameStateModule, gameSettingsFromFile);
    
    // Set the main settings object for the StateManager instance
    this.settings = gameSettingsFromFile;
    this.settings.game = gameName; // Ensure game name is correctly set
    
    
    log('info', `[StateManager] Loaded logic module for: "${gameName}"`);

    // All games now use gameStateModule - no legacy GameState needed
    this.state = null;

    // REFACTOR: Always using canonical state format

    // CRITICAL: Ensure this.settings.game is aligned with the gameName
    // This ensures helpers are chosen based on the game we just instantiated state for.
    if (this.settings && typeof this.settings === 'object') {
      // Ensure settings is an object
      if (
        !this.settings.game ||
        this.settings.game !== gameName
      ) {
        this._logDebug(
          `[StateManager loadFromJSON] Aligning this.settings.game to "${gameName}". Previous was: "${this.settings.game}"`
        );
        this.settings.game = gameName;
      }
    } else {
      log(
        'error',
        '[StateManager loadFromJSON] this.settings is not an object after state.loadSettings. Re-initializing as empty object.'
      );
      this.settings = { game: gameName }; // Fallback
    }
    this._logDebug(
      `[StateManager loadFromJSON] Effective this.settings.game for helper instantiation: "${this.settings.game}"`
    );

    // Settings are now managed directly - no legacy state.settings assignment needed

    // this.settings.game should now be correctly set.
    //this._logDebug(
    //  `[StateManager loadFromJSON] Game-specific state loaded. Effective game: ${this.settings.game}`
    //);
    // --- END Instantiate Game-Specific State ---

    // --- MOVED UP: Load settings into the game-specific state object (e.g., ALTTPState) ---
    // This allows the game-specific state to process jsonData.settings and update
    // this.settings (e.g., this.settings.game) before helpers are chosen.
    // COMMENTED OUT - Replaced by new section above
    // Settings loading is now handled through gameStateModule during initialization
    // --- END MOVED UP ---

    // The following diagnostic log can be very verbose, enable if needed for deep debugging of regions
    // if (jsonData?.regions?.[selectedPlayerId]) {
    //   const sampleRegionName = Object.keys(
    //     jsonData.regions[selectedPlayerId]
    //   )[0];
    //   if (sampleRegionName) {
    //     const sampleRegionLocations =
    //       jsonData.regions[selectedPlayerId][sampleRegionName]?.locations;
    //     if (sampleRegionLocations) {
    //       this._logDebug(
    //         `[StateManager loadFromJSON ENTRY] Player ${selectedPlayerId}, Sample region '${sampleRegionName}' location keys:`,
    //         Object.keys(sampleRegionLocations)
    //       );
    //     } else {
    //       this._logDebug(
    //         `[StateManager loadFromJSON ENTRY] Player ${selectedPlayerId}, Sample region '${sampleRegionName}' has no locations object.`
    //       );
    //     }
    //   } else {
    //     this._logDebug(
    //       `[StateManager loadFromJSON ENTRY] Player ${selectedPlayerId} has no regions.`
    //     );
    //   }
    // } else {
    //   this._logDebug(
    //     `[StateManager loadFromJSON ENTRY] No regions data for player ${selectedPlayerId} in jsonData.`
    //   );
    // }

    // log('info', `Loaded ${Object.keys(this.itemNameToId).length} item IDs`); // Covered by _logDebug

    // Aggregate all locations from all regions into a flat list and build nameToId map
    this.locations = [];
    this.locationNameToId = {};
    this.eventLocations.clear(); // Clear event locations before populating

    // Iterate regions using the guaranteed originalRegionOrder for consistent processing order
    for (const regionName of this.originalRegionOrder) {
      const region = this.regions[regionName]; // Get region data using the name
      if (!region) {
        log(
          'warn',
          `[StateManager loadFromJSON] Region data for '${regionName}' not found in this.regions. Skipping.`
        );
        continue;
      }

      if (region.locations && Array.isArray(region.locations)) {
        region.locations.forEach((locationDataItem) => {
          const descriptiveName = locationDataItem.name;

          if (!descriptiveName) {
            log(
              'warn',
              `[StateManager loadFromJSON] Location data in region '${regionName}' is missing a 'name' property:`,
              locationDataItem
            );
            return;
          }

          const locationObjectForArray = {
            ...locationDataItem,
            region: regionName, // Ensure parent region context is explicitly set
            parent_region_name: regionName, // Store region name for dynamic resolution
          };

          this.locations.push(locationObjectForArray);
          this.originalLocationOrder.push(descriptiveName);

          if (
            locationObjectForArray.item &&
            locationObjectForArray.item.type === 'Event'
          ) {
            this.eventLocations.set(
              locationObjectForArray.name,
              locationObjectForArray
            );
          }

          // Store the actual server location ID, or null if not present
          if (locationDataItem.id !== undefined && locationDataItem.id !== null) {
            this.locationNameToId[descriptiveName] = locationDataItem.id;
          } else {
            // Expected for client-side only locations that don't exist in server data
            this.locationNameToId[descriptiveName] = null;
          }
        });
      } else if (region.locations) {
        log(
          'warn',
          `[StateManager loadFromJSON] region.locations for region '${regionName}' is not an array:`,
          region.locations
        );
      }
    }
    this._logDebug(
      `Processed ${this.locations.length} locations and populated originalLocationOrder.`
    );

    // Initialize exits array and populate it along with originalExitOrder
    this.exits = [];
    this._logDebug(
      '[StateManager Worker loadFromJSON] Populating this.exits...'
    );

    for (const regionName of this.originalRegionOrder) {
      // Use the ordered list of region names
      const regionObject = this.regions[regionName]; // Access the region object
      if (!regionObject) {
        // This case should ideally not happen if originalRegionOrder is derived from Object.keys(this.regions)
        // but as a safeguard:
        log(
          'warn',
          `[StateManager loadFromJSON] Region data for '${regionName}' not found in this.regions during exit processing. Skipping.`
        );
        continue;
      }

      if (regionObject.exits && Array.isArray(regionObject.exits)) {
        regionObject.exits.forEach((originalExitObject) => {
          if (
            originalExitObject &&
            typeof originalExitObject === 'object' &&
            originalExitObject.name
          ) {
            const connectedRegionValue = originalExitObject.connected_region;

            if (
              !connectedRegionValue ||
              typeof connectedRegionValue !== 'string' ||
              connectedRegionValue.trim() === ''
            ) {
              //this._logDebug(
              //  `[StateManager Worker loadFromJSON] Exit '${
              //    originalExitObject.name
              //  }' in region '${regionName}' has missing, empty, or non-string 'connected_region'. Original Exit Object: ${JSON.stringify(
              //    originalExitObject
              //  )}. Connected region value was: '${connectedRegionValue}'`
              //);
              // We still push the exit, connected_region will be what it was (e.g., undefined)
            }

            const processedExit = {
              name: originalExitObject.name,
              connectedRegion: connectedRegionValue,
              access_rule: originalExitObject.access_rule, // Rule object reference is fine
              parentRegion: regionName,
              // Explicitly copy other specified properties, defaulting if not present on original
              player:
                originalExitObject.player !== undefined
                  ? originalExitObject.player
                  : this.playerSlot, // Default to current player if not specified
              type: originalExitObject.type || 'Exit', // Default type if not specified
              // Add any other properties that systems might expect if they exist on originalExitObject
              // e.g., id: originalExitObject.id (if exits have original IDs like locations)
            };

            this.exits.push(processedExit);
          } else {
            this._logDebug(
              `[StateManager Worker loadFromJSON] Malformed or unnamed exit object in region '${regionName}':`,
              originalExitObject
            );
          }
        });
      }
    }
    // After populating this.exits, create the originalExitOrder
    this.originalExitOrder = this.exits.map((exit) => exit.name);
    this._logDebug(
      `Processed ${this.exits.length} exits and populated originalExitOrder.`
    );

    // --- Game Logic Module Selected Above ---
    // Note: this.logicModule and this.helperFunctions are now set based on game type
    // Legacy this.helpers is no longer used as executeHelper now uses this.helperFunctions
    this.helpers = null; // Legacy helpers no longer needed
    log(
      'info',
      `[StateManager loadFromJSON] Dynamic logic module loaded for game: ${this.settings?.game}`
    );

    // --- Create game-specific inventory instance ---
    this.inventory = this._createInventoryInstance(this.settings.game);
    if (!this.inventory) {
      // This case should ideally not be reached if _createInventoryInstance always returns an instance
      log(
        'error',
        '[StateManager loadFromJSON CRITICAL] Failed to create inventory instance! this.inventory is null/undefined.'
      );
      // Depending on how critical inventory is, you might want to throw an error here
      // throw new Error("Failed to initialize inventory in StateManager");
    } else {
      this._logDebug(
        `[StateManager loadFromJSON] Game-specific inventory instance ${this.inventory.constructor.name} created.`
      );
      // If groupData specifically needs to be on the inventory instance itself and inventory classes support it:
      // Example: if (this.groupData && typeof this.inventory.setGroupData === 'function') {
      //   this.inventory.setGroupData(this.groupData);
      // } else if (this.groupData && this.inventory) { // Check this.inventory again
      //   this.inventory.groupData = this.groupData; // Direct assignment if that's the pattern for relevant inventory class
      // }
    }
    // --- END Create game-specific inventory instance ---

    // Load shop data using dynamic logic module
    if (jsonData.shops && jsonData.shops[selectedPlayerId] && this.logicModule) {
      if (typeof this.logicModule.loadShops === 'function') {
        this.gameStateModule = this.logicModule.loadShops(this.gameStateModule, jsonData.shops[selectedPlayerId]);
        log('info', `[StateManager loadFromJSON] Shops loaded into ${this.settings?.game} game state module.`);
      } else {
        log('info', `[StateManager loadFromJSON] No shop loading needed for ${this.settings?.game}.`);
      }
    }

    // --- Start of new group processing logic ---
    log(
      'info',
      `[StateManager loadFromJSON] Processing group data. Player ID: ${selectedPlayerId}. Raw jsonData.item_groups:`,
      jsonData.item_groups
        ? JSON.parse(JSON.stringify(jsonData.item_groups))
        : 'undefined'
    );

    if (
      jsonData.item_groups &&
      typeof jsonData.item_groups === 'object' &&
      jsonData.item_groups !== null
    ) {
      const playerSpecificGroups =
        jsonData.item_groups[String(selectedPlayerId)]; // Ensure playerId is a string key
      if (Array.isArray(playerSpecificGroups)) {
        this.groupData = playerSpecificGroups;
        //log('info',
        //  `[StateManager loadFromJSON] Loaded player-specific item_groups for player ${selectedPlayerId}:`,
        //  JSON.parse(JSON.stringify(this.groupData))
        //);
      } else {
        log(
          'info',
          `[StateManager loadFromJSON] item_groups found, but no specific entry for player ${selectedPlayerId} or entry is not an array. Player entry:`,
          playerSpecificGroups
        );
        this.groupData = []; // Default to empty if player-specific groups are not an array
      }
    } else if (jsonData.groups && Array.isArray(jsonData.groups)) {
      // Fallback for old global 'groups' array format if item_groups is not present
      log(
        'info',
        `[StateManager loadFromJSON] No player-specific item_groups found or item_groups is not an object. Falling back to global jsonData.groups (if array).`
      );
      this.groupData = jsonData.groups;
    } else {
      log(
        'info',
        `[StateManager loadFromJSON] No player-specific item_groups or suitable global fallback found. Setting groupData to [].`
      );
      this.groupData = [];
    }
    log(
      'info',
      `[StateManager loadFromJSON] Final this.groupData for player ${selectedPlayerId}:`,
      JSON.parse(JSON.stringify(this.groupData)),
      'Is Array:',
      Array.isArray(this.groupData)
    );
    // --- End of new group processing logic ---

    // Process starting items
    const startingItems = jsonData.starting_items?.[selectedPlayerId] || [];
    if (startingItems && startingItems.length > 0) {
      log(
        'info',
        `[StateManager loadFromJSON] Adding ${startingItems.length} starting items for player ${selectedPlayerId}:`,
        startingItems
      );
      this.beginBatchUpdate(true); // Defer computation until after adding all items
      startingItems.forEach((itemName) => {
        // Ensure the item exists in itemData before trying to add
        if (this.itemData && this.itemData[itemName]) {
          this.addItemToInventory(itemName); // This will add to _batchedUpdates
        } else {
          log(
            'warn',
            `[StateManager loadFromJSON] Starting item '${itemName}' not found in itemData, skipping.`
          );
        }
      });
      this.commitBatchUpdate(); // This will apply batched items and trigger computation if needed
      log(
        'info',
        '[StateManager loadFromJSON] Starting items processed and batch committed.'
      );
    } else {
      log('info', '[StateManager loadFromJSON] No starting items to process.');
      // If batch mode was somehow active and we didn't add items, ensure it's reset.
      // And if no starting items, we still need an initial computation if cache is still invalid.
      if (this._batchMode) {
        // If a batch was started for some other reason (unlikely here)
        this.commitBatchUpdate(); // Ensure it's committed.
      } else if (!this.cacheValid) {
        // If no starting items and cache is invalid (e.g. fresh load), trigger computation
        // This computeReachableRegions will update the cache. The snapshot is sent later.
        log(
          'info',
          '[StateManager loadFromJSON] No starting items, ensuring initial computation.'
        );
        this.computeReachableRegions();
      }
    }
    // --- END ADDED ---

    // Compute initial reachability after all data is loaded
    this.enhanceLocationsWithStaticRules();
    this.buildIndirectConnections();
    this.computeReachableRegions(); // This will also trigger an initial snapshot update
    this._logDebug('[StateManager Class] JSON data loaded and processed.');

    // Populate original region order
    this.originalRegionOrder = Object.keys(jsonData.regions[selectedPlayerId]);
    this._logDebug(
      `[StateManager Class] Processed regions. Original order stored.`
    );

    // Populate original exit order by iterating through regions in their original order
    this.originalRegionOrder.forEach((regionKey) => {
      const region = this.regions[regionKey];
      if (region && region.exits) {
        // Exits in the rules file might be an array of objects or an object
        if (Array.isArray(region.exits)) {
          region.exits.forEach((exit, index) => {
            if (exit && exit.name) {
              this.originalExitOrder.push(exit.name);
            }
          });
        } else if (typeof region.exits === 'object') {
          // Assuming exits are an object keyed by exit name
          Object.keys(region.exits).forEach((exitName) => {
            this.originalExitOrder.push(exitName);
          });
        }
      }
    });

    this._logDebug(
      `[StateManager Class] Original exit order stored. Total exits: ${this.originalExitOrder.length}`
    );

    this.exits = []; // Reset exits array
    this._logDebug(
      '[StateManager Worker loadFromJSON] Populating this.exits...'
    );

    // --- BEGIN DIAGNOSTIC LOGGING (using console.log directly for first few) ---
    //log('info',
    //  '[StateManager Worker loadFromJSON] DIAGNOSTIC (direct log): Listing all incoming exit names from jsonData.regions...'
    //);
    //log('info',
    //  `[StateManager Worker loadFromJSON] DIAGNOSTIC (direct log): Content of jsonData.regions[${selectedPlayerId}]:`,
    //  jsonData.regions
    //    ? jsonData.regions[selectedPlayerId]
    //    : 'jsonData.regions is undefined'
    //);

    if (jsonData.regions && jsonData.regions[selectedPlayerId]) {
      for (const regionKey in jsonData.regions[selectedPlayerId]) {
        const regionData = jsonData.regions[selectedPlayerId][regionKey];
        if (regionData.exits && Array.isArray(regionData.exits)) {
          regionData.exits.forEach((exit, index) => {
            if (exit && typeof exit === 'object') {
              // Using console.log for this initial raw dump as well
              //log('info',
              //  `  DIAGNOSTIC (direct log): Region '${regionKey}', Exit Index ${index}, Name: '${exit.name}', Connected Region (snake): '${exit.connected_region}', Connected Region (camel): '${exit.connectedRegion}'`
              //);
            }
          });
        }
      }
    } else {
      //log('info',
      //  '[StateManager Worker loadFromJSON] DIAGNOSTIC (direct log): jsonData.regions or player-specific region data for diagnostic loop not found.'
      //);
    }
    //log('info',
    //  '[StateManager Worker loadFromJSON] DIAGNOSTIC (direct log): End of incoming exit name listing.'
    //);
    // --- END DIAGNOSTIC LOGGING ---

    for (const regionKey in this.regions) {
      const regionObject = this.regions[regionKey]; // This is jsonData.regions[selectedPlayerId][regionKey]

      if (regionObject.exits && Array.isArray(regionObject.exits)) {
        regionObject.exits.forEach((originalExitObject) => {
          if (originalExitObject && typeof originalExitObject === 'object') {
            // Create a new object for the this.exits array
            // This ensures we explicitly copy the properties we need and avoid potential
            // issues with shared references or missing properties on the source object.

            // Resolve connected_region, checking for snake_case and then camelCase
            const connectedRegionValue =
              originalExitObject.connected_region !== undefined
                ? originalExitObject.connected_region
                : originalExitObject.connectedRegion; // Fallback to camelCase

            const processedExit = {
              name: originalExitObject.name,
              connectedRegion: connectedRegionValue, // Use the resolved value
              access_rule: originalExitObject.access_rule, // Reference is fine for the rule object itself
              parentRegion: regionKey, // Add the parentRegion context
              // Copy any other properties that ExitUI or other systems might expect
              // For example, if 'player' or 'type' are relevant for exits:
              player: originalExitObject.player,
              type: originalExitObject.type,
            };

            // Debugging for the specific problematic exit - MORE GENERAL CHECK (ANY REGION)
            // This will use _logDebug and depends on debugMode being true by this point
            if (originalExitObject.name === 'Links House S&Q') {
              log(
                'info',
                `[StateManager Worker loadFromJSON] Processing "Links House S&Q" (Region: ${regionKey}):`
              );
              log(
                'info',
                `  Original Exit Object (raw): ${JSON.stringify(
                  originalExitObject
                )}`
              );
              log(
                'info',
                `  Attempted snake_case originalExitObject.connected_region: ${originalExitObject.connected_region}`
              );
              log(
                'info',
                `  Attempted camelCase originalExitObject.connectedRegion: ${originalExitObject.connectedRegion}`
              );
              log(
                'info',
                `  Resolved connectedRegionValue for processedExit: ${connectedRegionValue}`
              );
              log(
                'info',
                `  Processed Exit Object (to be pushed): ${JSON.stringify(
                  processedExit
                )}`
              );
              log(
                'info',
                `  Value of connected_region being pushed: ${processedExit.connected_region}`
              );
            }

            if (!processedExit.name) {
              //log('warn',
              //  `[StateManager Worker loadFromJSON] Exit in region '${regionKey}' is missing a 'name'. Original object:`,
              //  JSON.stringify(originalExitObject)
              //);
              // Decide if you want to skip, or assign a default name:
              // processedExit.name = `Unnamed Exit from ${regionKey} to ${processedExit.connected_region || 'Unknown'}`;
            }

            // Crucially, ensure connected_region is actually present and valid before relying on it.
            const isConnectedRegionValid =
              processedExit.connected_region &&
              typeof processedExit.connected_region === 'string' &&
              processedExit.connected_region.trim() !== '';

            if (!isConnectedRegionValid) {
              // This warning will use console.warn directly
              //log('warn',
              //  `[StateManager Worker loadFromJSON] Exit "${
              //    processedExit.name || 'Unnamed'
              //  }" in region '${regionKey}' has a problematic 'connected_region'. ` +
              //    `Type: ${typeof processedExit.connected_region}, Value: "${
              //      processedExit.connected_region
              //    }". ` +
              //    `Source snake_case: "${originalExitObject.connected_region}", camelCase: "${originalExitObject.connectedRegion}". ` +
              //    `This will likely cause issues in ExitUI.`
              //);
              // Depending on requirements, you might want to:
              // 1. Skip this exit: return; (from forEach callback)
              // 2. Assign a placeholder: processedExit.connected_region = "UNKNOWN_DESTINATION";
              // 3. Let it proceed as is and handle it in ExitUI
            }

            this.exits.push(processedExit);
          } else {
            log(
              'warn',
              `[StateManager Worker loadFromJSON] Encountered invalid exit data in region '${regionKey}':`,
              originalExitObject
            );
          }
        });
      } else if (regionObject.exits) {
        // Log if regionObject.exits is defined but not an array (unexpected structure)
        log(
          'warn',
          `[StateManager Worker loadFromJSON] region.exits for region '${regionKey}' is not an array:`,
          regionObject.exits
        );
      }
    }
    this._logDebug(
      `[StateManager Worker loadFromJSON] Populated this.exits with ${this.exits.length} entries.`
    );

    // Ensure originalExitOrder is populated based on the newly processed this.exits
    this.originalExitOrder = [];
    this.exits.forEach((exit) => {
      if (exit && exit.name) {
        this.originalExitOrder.push(exit.name);
      }
    });
    this._logDebug(
      `[StateManager Worker loadFromJSON] Repopulated originalExitOrder with ${this.originalExitOrder.length} entries.`
    );

    this._logDebug(
      '[StateManager loadFromJSON] Initial reachable regions computation complete.'
    );

    //log('info',
    //  '[StateManager loadFromJSON END] Final check before return. this.originalExitOrder type:',
    //  typeof this.originalExitOrder,
    //  'Is Array:',
    //  Array.isArray(this.originalExitOrder),
    //  'Length:',
    //  this.originalExitOrder ? this.originalExitOrder.length : 'N/A',
    //  'Sample:',
    //  this.originalExitOrder ? this.originalExitOrder.slice(0, 5) : 'N/A'
    //);

    // Ensure game-specific state (like events from ALTTPState) is initialized/reset if game changes
    // This should ideally happen AFTER helpers are instantiated and settings are fully loaded,
    // as the game-specific state (e.g., ALTTPState instance) might depend on them.
    // However, gameStateInstance is not clearly defined/used. This block might need review.
    // Events are now handled through gameStateModule - reset events if needed
    if (this.gameStateModule && this.gameStateModule.events) {
      this.gameStateModule.events = [];
      this._logDebug(
        '[StateManager loadFromJSON] Reset events in gameStateModule.'
      );
    }

    // --- '_initializeInventory' was a helper method added for a specific purpose earlier.
    // The main inventory initialization is now handled by the call to 'this.initializeInventory' moved above.
    // The call to 'this._initializeInventory' below seems redundant with the main 'this.initializeInventory' call if its purpose was general setup.
    // If jsonData.starting_items logic requires a different kind of inventory interaction, it should be distinct.
    // For now, commenting out the direct call to this._initializeInventory as its role is unclear post-refactor.
    /*
    this._initializeInventory(
      jsonData.starting_items || [], // This was passing starting_items
      jsonData.items, // This was passing jsonData.items (raw)
      selectedPlayerId
    );
    */
    // The 'Process starting items' block later in the code handles starting_items correctly
    // by calling this.addItemToInventory, which uses the already initialized 'this.inventory'.

    // Ensure this.settings exists before trying to access or assign to its properties
    this.settings = this.settings || {};

    // Initial computation of reachable regions based on current inventory and rules
    this._logDebug(
      '[StateManager loadFromJSON] Triggering initial _computeReachability...'
    );
    // this.computeReachableRegions(); // MODIFIED: Was this._computeReachability(this.settings.gameMode);
    // The call to computeReachableRegions() is already present a bit earlier (after starting_items processing)
    // and also after buildIndirectConnections. Let's ensure it's called appropriately.
    // The existing calls seem sufficient.

    this._logDebug('[StateManager loadFromJSON] loadFromJSON completed.');
  }

  // --- ADDED: Helper for inventory initialization ---
  _initializeInventory(startingItems, itemData, playerId) {
    // This method should be implemented to initialize the inventory based on the given starting items, item data, and player ID
    // You might want to call this.initializeInventory(startingItems, itemData, playerId) from the main loadFromJSON method
    // or implement it separately if needed.
    // For example, you can use this method to add items based on the itempool_counts,
    // or to handle any other specific initialization logic for the inventory.
  }

  getLocationItem(locationName) {
    if (!this.locations || this.locations.length === 0) {
      this._logDebug(
        `[StateManager getLocationItem] Locations array is empty or not initialized.`
      );
      return null;
    }
    const location = this.locations.find((loc) => loc.name === locationName);
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

  /**
   * Processes location data to attach static rule objects directly for faster evaluation.
   */
  enhanceLocationsWithStaticRules() {
    // Implementation of enhanceLocationsWithStaticRules method
  }

  /**
   * Build indirect connections map similar to Python implementation
   * Identifies exits that depend on regions in their access rules
   */
  buildIndirectConnections() {
    this.indirectConnections.clear();
    if (!this.regions) return;
    Object.values(this.regions).forEach((region) => {
      if (!region.exits) return;
      region.exits.forEach((exit) => {
        if (exit.rule) {
          const dependencies = this.findRegionDependencies(exit.rule);
          dependencies.forEach((depRegionName) => {
            if (!this.indirectConnections.has(depRegionName)) {
              this.indirectConnections.set(depRegionName, new Set());
            }
            if (exit.name) {
              this.indirectConnections.get(depRegionName).add(exit.name);
            }
          });
        }
      });
    });
  }

  /**
   * Find regions that a rule depends on through can_reach state methods
   */
  findRegionDependencies(rule) {
    const dependencies = new Set();
    if (!rule) return dependencies;
    if (typeof rule === 'string') {
      if (this.regions && this.regions[rule]) {
        dependencies.add(rule);
      } else {
        const match = rule.match(/@helper\/[^\(]+\(([^\)]+)\)/);
        if (match && match[1]) {
          const args = match[1].split(/,\s*/);
          args.forEach((arg) => {
            const cleanArg = arg.replace(/['"]/g, '');
            if (this.regions && this.regions[cleanArg]) {
              dependencies.add(cleanArg);
            }
          });
        }
      }
    } else if (Array.isArray(rule)) {
      rule.forEach((subRule) => {
        this.findRegionDependencies(subRule).forEach((dep) =>
          dependencies.add(dep)
        );
      });
    } else if (typeof rule === 'object') {
      Object.values(rule).forEach((subRule) => {
        this.findRegionDependencies(subRule).forEach((dep) =>
          dependencies.add(dep)
        );
      });
    }
    return dependencies;
  }

  invalidateCache() {
    this.cacheValid = false;
    this.knownReachableRegions.clear();
    this.knownUnreachableRegions.clear();
    this.path = new Map();
    this.blockedConnections = new Set();
    this._logDebug('[StateManager Instance] Cache invalidated.');
  }

  /**
   * Core pathfinding logic: determines which regions are reachable
   * Closely mirrors Python's update_reachable_regions method
   * Also handles automatic collection of event items
   */
  computeReachableRegions() {
    // For custom inventories, don't use the cache
    const useCache = this.cacheValid;
    if (useCache) {
      return this.knownReachableRegions;
    }

    // Recursion protection
    if (this._computing) {
      return this.knownReachableRegions;
    }

    this._computing = true;

    try {
      // Get start regions and initialize BFS
      const startRegions = this.getStartRegions();

      // Safety check: ensure startRegions is an array
      if (!Array.isArray(startRegions)) {
        log('error', '[StateManager] computeReachableRegions: startRegions is not an array:', typeof startRegions, startRegions);
        throw new Error(`startRegions must be an array, got ${typeof startRegions}`);
      }

      // Initialize path tracking
      this.path.clear();
      this.blockedConnections.clear();

      // Initialize reachable regions with start regions
      this.knownReachableRegions = new Set(startRegions);

      // Add exits from start regions to blocked connections
      for (const startRegion of startRegions) {
        const region = this.regions[startRegion];
        if (region && region.exits) {
          // Add all exits from this region to blocked connections
          for (const exit of region.exits) {
            this.blockedConnections.add({
              fromRegion: startRegion,
              exit: exit,
            });
          }
        }
      }

      // Start BFS process
      let continueSearching = true;
      let passCount = 0;

      while (continueSearching) {
        continueSearching = false;
        passCount++;
        
        // Debug logging for A Hat in Time
        if (this.rules?.game_name === 'A Hat in Time' || this.rules?.game_directory === 'ahit') {
          console.log(`[BFS] Starting pass ${passCount}`);
        }

        // Process reachability with BFS
        const newlyReachable = this.runBFSPass();
        if (newlyReachable) {
          continueSearching = true;
          if (this.rules?.game_name === 'A Hat in Time' || this.rules?.game_directory === 'ahit') {
            console.log(`[BFS] Pass ${passCount} found new regions, will continue`);
          }
        }

        // Auto-collect events - MODIFIED: Make conditional
        let newEventCollected = false;
        if (this.autoCollectEventsEnabled) {
          for (const loc of this.eventLocations.values()) {
            if (this.knownReachableRegions.has(loc.region)) {
              const canAccessLoc = this.isLocationAccessible(loc);
              if (canAccessLoc && !this._hasItem(loc.item.name)) {
                this._addItemToInventory(loc.item.name, 1);
                this.checkedLocations.add(loc.name);
                newEventCollected = true;
                continueSearching = true;
                this._logDebug(
                  `Auto-collected event item: ${loc.item.name} from ${loc.name}`
                );
              }
            }
          }
        }

        // If no new regions or events were found, we're done
        if (!continueSearching) {
          break;
        }
      }

      // Finalize unreachable regions set
      this.knownUnreachableRegions = new Set(
        Object.keys(this.regions).filter(
          (region) => !this.knownReachableRegions.has(region)
        )
      );

      this.cacheValid = true;
    } finally {
      this._computing = false;
    }

    return this.knownReachableRegions;
  }

  /**
   * Run a single BFS pass to find reachable regions
   * Implements Python's _update_reachable_regions_auto_indirect_conditions approach
   */
  runBFSPass() {
    let newRegionsFound = false;
    const passStartRegions = new Set(this.knownReachableRegions);

    // Exactly match Python's nested loop structure
    let newConnection = true;
    while (newConnection) {
      newConnection = false;

      let queue = [...this.blockedConnections];
      while (queue.length > 0) {
        const connection = queue.shift();
        const { fromRegion, exit } = connection;
        // Prioritize snake_case connected_region from JSON, fallback to camelCase if needed
        const targetRegion =
          exit.connected_region !== undefined
            ? exit.connected_region
            : exit.connectedRegion;

        // Skip if the target region is already reachable
        if (this.knownReachableRegions.has(targetRegion)) {
          this.blockedConnections.delete(connection);
          continue;
        }

        // Skip if the source region isn't reachable (important check)
        if (!this.knownReachableRegions.has(fromRegion)) {
          continue;
        }

        // Check if exit is traversable using the *injected* evaluateRule engine
        const snapshotInterfaceContext = this._createSelfSnapshotInterface();
        // Set parent_region context for exit evaluation - needs to be the region object, not just the name
        snapshotInterfaceContext.parent_region = this.regions[fromRegion];
        // Set currentExit so get_entrance can detect self-references
        snapshotInterfaceContext.currentExit = exit.name;
        const ruleEvaluationResult = exit.access_rule
          ? this.evaluateRuleFromEngine(
              exit.access_rule,
              snapshotInterfaceContext
            )
          : true; // No rule means true

        const canTraverse = !exit.access_rule || ruleEvaluationResult;
        
        // Debug Time Rift connections
        if ((this.rules?.game_name === 'A Hat in Time' || this.rules?.game_directory === 'ahit') &&
            targetRegion && targetRegion.includes('Time Rift')) {
          console.log(`[BFS] Evaluating ${fromRegion} -> ${targetRegion} (${exit.name}): canTraverse=${canTraverse}`);
        }

        // +++ DETAILED LOGGING FOR RULE EVALUATION +++
        //if (exit.name === 'GameStart' || fromRegion === 'Menu') {
        //  log('info',
        //    `  - Exit Access Rule:`,
        //    exit.access_rule
        //      ? JSON.parse(JSON.stringify(exit.access_rule))
        //      : 'None (implicitly true)'
        //  );
        //  log('info', `  - Rule Evaluation Result: ${ruleEvaluationResult}`);
        //  log('info', `  - CanTraverse: ${canTraverse}`);
        //}
        // +++ END DETAILED LOGGING +++

        if (canTraverse) {
          // Region is now reachable
          this.knownReachableRegions.add(targetRegion);
          newRegionsFound = true;
          newConnection = true; // Signal that we found a new connection
          
          // Debug logging for A Hat in Time Time Rifts
          if ((this.rules?.game_name === 'A Hat in Time' || this.rules?.game_directory === 'ahit') &&
              (targetRegion.includes('Time Rift') || targetRegion === 'The Golden Vault' || targetRegion === 'Picture Perfect')) {
            console.log(`[BFS] NEW REGION: ${targetRegion} (from ${fromRegion} via ${exit.name})`);
          }

          // Remove from blocked connections
          this.blockedConnections.delete(connection);

          // Record the path taken to reach this region
          if (!this.path.has(targetRegion)) {
            // Only set path if not already set
            this.path.set(targetRegion, {
              name: targetRegion,
              entrance: exit.name,
              previousRegion: fromRegion,
            });
          }

          // Add all exits from the newly reachable region to blockedConnections (if not already processed)
          const region = this.regions[targetRegion];
          if (region && region.exits) {
            for (const newExit of region.exits) {
              // Ensure the target of the new exit exists
              if (
                newExit.connected_region &&
                this.regions[newExit.connected_region]
              ) {
                const newConnObj = {
                  fromRegion: targetRegion,
                  exit: newExit,
                };
                // Avoid adding duplicates or exits leading to already reachable regions
                if (!this.knownReachableRegions.has(newExit.connected_region)) {
                  let alreadyBlocked = false;
                  for (const blocked of this.blockedConnections) {
                    if (
                      blocked.fromRegion === newConnObj.fromRegion &&
                      blocked.exit.name === newConnObj.exit.name
                    ) {
                      alreadyBlocked = true;
                      break;
                    }
                  }
                  if (!alreadyBlocked) {
                    this.blockedConnections.add(newConnObj);
                    queue.push(newConnObj); // Add to the current pass queue
                  }
                }
              }
            }
          }

          // Check for indirect connections affected by this region
          if (this.indirectConnections.has(targetRegion)) {
            // Use the indirect connections structure which maps region -> set of EXIT NAMES
            const affectedExitNames =
              this.indirectConnections.get(targetRegion);
            affectedExitNames.forEach((exitName) => {
              // Find the actual connection object in blockedConnections using the exit name
              for (const blockedConn of this.blockedConnections) {
                if (blockedConn.exit.name === exitName) {
                  // Re-add this connection to the queue to re-evaluate it,
                  // but only if its source region is reachable.
                  if (this.knownReachableRegions.has(blockedConn.fromRegion)) {
                    queue.push(blockedConn);
                  }
                  break; // Found the connection, move to next affected exit name
                }
              }
            });
          }
        }
      }
      // Python equivalent: queue.extend(blocked_connections)
      // We've finished the current queue, next iteration will recheck all remaining blocked connections
      if (this.debugMode && newConnection) {
        this._logDebug(
          'BFS pass: Found new regions/connections, rechecking blocked connections'
        );
      }
    }
    
    return newRegionsFound;
  }

  /**
   * Evaluate a rule with awareness of the current path context
   * This is no longer needed with our new BFS approach, but kept for backwards
   * compatibility with the rest of the code
   */
  evaluateRuleWithPathContext(rule, context) {
    // Standard rule evaluation is now sufficient with our improved BFS
    return this.evaluateRule(rule);
  }

  getStartRegions() {
    // Get start regions from startRegions property or use default
    // Ensure we always return an array
    if (Array.isArray(this.startRegions)) {
      return this.startRegions;
    }
    
    // Log unexpected values for debugging
    if (this.startRegions !== null && this.startRegions !== undefined) {
      this._logDebug(`[StateManager] Unexpected startRegions value: ${typeof this.startRegions}`, this.startRegions);
    }
    
    return ['Menu'];
  }

  /**
   * Determines if a region is reachable with the given inventory
   * @param {string} regionName - The name of the region to check
   * @return {boolean} - Whether the region is reachable
   */
  isRegionReachable(regionName) {
    const reachableRegions = this.computeReachableRegions();
    return reachableRegions.has(regionName);
  }

  /**
   * Determines if a location is accessible with the given inventory
   * @param {Object} location - The location to check
   * @return {boolean} - Whether the location is accessible
   */
  isLocationAccessible(location) {
    // The check for serverProvidedUncheckedLocations was removed from here.
    // A location being unchecked by the server does not mean it's inaccessible by rules.

    // Recursion protection: if we're already computing reachable regions,
    // use the current state instead of triggering another computation
    const reachableRegions = this._computing
      ? this.knownReachableRegions
      : this.computeReachableRegions();
    if (!reachableRegions.has(location.region)) {
      return false;
    }
    if (!location.access_rule) return true;

    // Use the *injected* evaluateRule engine
    try {
      const snapshotInterface = this._createSelfSnapshotInterface();
      // Add the current location to the context so rules can access it
      snapshotInterface.currentLocation = location;
      return this.evaluateRuleFromEngine(
        location.access_rule,
        snapshotInterface
      );
    } catch (e) {
      log(
        'error',
        `Error evaluating internal rule for location ${location.name}:`,
        e,
        location.access_rule
      );
      return false;
    }
  }

  getProcessedLocations(
    sorting = 'original',
    showReachable = true,
    showUnreachable = true
  ) {
    return this.locations
      .slice()
      .sort((a, b) => {
        if (sorting === 'accessibility') {
          const aAccessible = this.isLocationAccessible(a);
          const bAccessible = this.isLocationAccessible(b);
          return bAccessible - aAccessible;
        }
        return 0;
      })
      .filter((location) => {
        const isAccessible = this.isLocationAccessible(location);
        return (
          (isAccessible && showReachable) || (!isAccessible && showUnreachable)
        );
      });
  }

  /**
   * Get the path used to reach a region
   * Similar to Python's get_path method
   */
  getPathToRegion(regionName) {
    if (!this.knownReachableRegions.has(regionName)) {
      return null; // Region not reachable
    }

    // Build path by following previous regions
    const pathSegments = [];
    let currentRegion = regionName;

    while (currentRegion) {
      const pathEntry = this.path.get(currentRegion);
      if (!pathEntry) break;

      // Add this segment
      pathSegments.unshift({
        from: pathEntry.previousRegion,
        entrance: pathEntry.entrance,
        to: currentRegion,
      });

      // Move to previous region
      currentRegion = pathEntry.previousRegion;
    }

    return pathSegments;
  }

  /**
   * Get all path info for debug/display purposes
   */
  getAllPaths() {
    const paths = {};

    for (const region of this.knownReachableRegions) {
      paths[region] = this.getPathToRegion(region);
    }

    return paths;
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
            this.inventory.itemData[itemName]?.type === 'Event'
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
            this.inventory.itemData[itemName].type !== 'Event'
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
      const location = this.locations.find((loc) => loc.name === locationName);
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
          const staticData = {
            progressionMapping: this.progressionMapping,
            groupData: this.groupData,
            itemData: this.itemData,
          };
          return this.helperFunctions[method](snapshot, 'world', args[0], staticData);
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
      `[StateManager Worker executeHelper] Helper: ${name}, game: ${
        this.settings?.game
      }, hasHelper: ${!!(this.helperFunctions && this.helperFunctions[name])}`
    );

    try {
      // The `this.helperFunctions` property is now set dynamically based on the game.
      if (this.helperFunctions && this.helperFunctions[name]) {
        const snapshot = this.getSnapshot(); 
        const staticData = {
          progressionMapping: this.progressionMapping,
          groupData: this.groupData,
          itemData: this.itemData,
        };
        // For helpers that need multiple arguments, pass them as an array in the itemName parameter
        // Most helpers expect (state, world, itemName, staticData) but some need multiple args
        const helperArgs = args.length > 1 ? args : args[0];
        return this.helperFunctions[name](snapshot, 'world', helperArgs, staticData);
      }
      return false; // Default return if no helper is found
    } finally {
      // Restore the previous state
      this._inHelperExecution = wasInHelperExecution;
    }
  }

  /**
   * Implementation of can_reach state method that mirrors Python
   */
  can_reach(region, type = 'Region', player = 1) {
    // The context-aware state manager handles position-specific constraints correctly
    if (player !== this.playerSlot) {
      this._logDebug(`can_reach check for wrong player (${player})`);
      return false;
    }
    if (type === 'Region') {
      return this.isRegionReachable(region);
    } else if (type === 'Location') {
      // Find the location object
      const location = this.locations.find((loc) => loc.name === region);
      return location && this.isLocationAccessible(location);
    } else if (type === 'Entrance') {
      // Find the entrance across all regions
      for (const regionName in this.regions) {
        const regionData = this.regions[regionName];
        if (regionData.exits) {
          const exit = regionData.exits.find((e) => e.name === region);
          if (exit) {
            const snapshotInterface = this._createSelfSnapshotInterface();
            // Set parent_region context for exit evaluation - needs to be the region object, not just the name
            snapshotInterface.parent_region = this.regions[regionName];
            // Set currentExit so get_entrance can detect self-references
            snapshotInterface.currentExit = exit.name;
            return (
              this.isRegionReachable(regionName) &&
              (!exit.access_rule ||
                this.evaluateRuleFromEngine(
                  exit.access_rule,
                  snapshotInterface
                ))
            );
          }
        }
      }
      return false;
    }

    return false;
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
      const region = this.regions[regionName];
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

      Object.keys(this.regions).forEach((sourceRegionName) => {
        const sourceRegion = this.regions[sourceRegionName];
        if (!sourceRegion || !sourceRegion.exits) return;

        const connectingExits = sourceRegion.exits.filter(
          (exit) => exit.connected_region === regionName
        );

        if (connectingExits.length > 0) {
          hasIncomingPaths = true;
          const sourceReachable = this.isRegionReachable(sourceRegionName);
          log(
            'info',
            `- From ${sourceRegionName} (${
              sourceReachable ? 'REACHABLE' : 'UNREACHABLE'
            }):`
          );

          connectingExits.forEach((exit) => {
            const snapshotInterface = this._createSelfSnapshotInterface();
            // Set parent_region context for exit evaluation - needs to be the region object, not just the name
            snapshotInterface.parent_region = this.regions[sourceRegionName];
            // Set currentExit so get_entrance can detect self-references
            snapshotInterface.currentExit = exit.name;
            const exitAccessible = exit.access_rule
              ? this.evaluateRuleFromEngine(exit.access_rule, snapshotInterface)
              : true;
            log(
              'info',
              `  - Exit: ${exit.name} (${
                exitAccessible ? 'ACCESSIBLE' : 'BLOCKED'
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
      });

      if (!hasIncomingPaths) {
        log('info', '  No incoming paths found.');
      }

      // Check region's own rules if any
      if (region.region_rules && region.region_rules.length > 0) {
        log(
          'info',
          `\n${regionName} has ${region.region_rules.length} region rules:`
        );
        region.region_rules.forEach((rule, i) => {
          const ruleResult = this.evaluateRuleFromEngine(rule);
          log('info', `- Rule #${i + 1}: ${ruleResult ? 'PASSES' : 'FAILS'}`);
          this.debugRuleEvaluation(rule);
        });
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
    } catch (e) {}

    switch (rule.type) {
      case 'and':
      case 'or':
        log(
          'info',
          `${indent}${rule.type.toUpperCase()} rule with ${
            rule.conditions.length
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
            `${indent}AND result: ${
              allResults.every((r) => r) ? 'PASS' : 'FAIL'
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
          `${indent}COUNT CHECK: ${rule.item} (${count}) >= ${rule.count} - ${
            count >= rule.count ? 'PASS' : 'FAIL'
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
          `${indent}HELPER: ${rule.name}(${JSON.stringify(rule.args)}) - ${
            helperResult ? 'PASS' : 'FAIL'
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
              `${indent}  -> Checking can_reach for region "${targetRegion}": ${
                this.isRegionReachable(targetRegion)
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
    const self = this;
    const anInterface = {
      _isSnapshotInterface: true,
      hasItem: (itemName) => self._hasItem(itemName),
      countItem: (itemName) => self._countItem(itemName),
      hasGroup: (groupName) => self._hasGroup(groupName),
      countGroup: (groupName) => self._countGroup(groupName),
      // Flags check gameStateModule for ALTTP, state for others
      hasFlag: (flagName) =>
        self.checkedLocations.has(flagName) ||
        (self.gameStateModule && self.logicModule && typeof self.logicModule.hasFlag === 'function'
          ? self.logicModule.hasFlag(self.gameStateModule, flagName)
          : (self.state &&
             typeof self.state.hasFlag === 'function' &&
             self.state.hasFlag(flagName))),
      getSetting: (settingName) =>
        self.settings ? self.settings[settingName] : undefined,
      getAllSettings: () => self.settings,
      isRegionReachable: (regionName) => self.isRegionReachable(regionName),
      isLocationChecked: (locName) => self.isLocationChecked(locName),
      executeHelper: (name, ...args) => {
        // Just delegate to the new centralized method
        return self.executeHelper(name, ...args);
      },
      executeStateManagerMethod: (name, ...args) => {
        return self.executeStateMethod(name, ...args);
      },
      getCurrentRegion: () => self.currentRegionName,
      getAllItems: () => self.itemData,
      getAllLocations: () => [...self.locations],
      getAllRegions: () => self.regions,
      getPlayerSlot: () => self.playerSlot,
      helpers: self.helpers,
      resolveName: (name) => {
        // Standard constants
        if (name === 'True') return true;
        if (name === 'False') return false;
        if (name === 'None') return null;

        // Player slot
        if (name === 'player') return self.playerSlot;
        
        // World object (commonly used in helper functions)
        if (name === 'world') return 'world'; // Return a placeholder string for now

        // Current location being evaluated (for location access rules)
        if (name === 'location') return anInterface.currentLocation;
        
        // Parent region being evaluated (for exit access rules)
        if (name === 'parent_region') return anInterface.parent_region;

        // Game-specific entities (e.g., 'old_man') from helpers.entities
        if (
          self.helpers &&
          self.helpers.entities &&
          typeof self.helpers.entities === 'object' &&
          Object.prototype.hasOwnProperty.call(self.helpers.entities, name)
        ) {
          return self.helpers.entities[name];
        }

        // Core StateManager components often accessed by rules
        if (name === 'inventory') return self.inventory; // The inventory instance
        // Return gameStateModule for ALTTP, state for others
        if (name === 'state') {
          if (self.gameStateModule && self.settings?.game === 'A Link to the Past') {
            // For ALTTP, return a state object that includes the multiworld structure for compatibility with Python rules
            return {
              ...self.gameStateModule,
              multiworld: {
                worlds: {
                  [self.playerSlot]: {
                    options: {
                      ...self.settings // Include all settings as options (now properly exported from Python)
                    }
                  }
                }
              }
            };
          } else {
            return self.state; // For other games, return the state instance
          }
        }
        if (name === 'settings') return self.settings; // The settings object for the current game
        // Note: 'helpers' itself is usually not resolved by name directly in rules this way,
        // rather its methods are called via 'helper' or 'state_method' rule types,
        // or its entities are resolved as above. Exposing it directly could be an option if specific rules need it.
        // if (name === 'helpers') return self.helpers;

        // Checked locations are often used as flags (covered by hasFlag, but direct access if needed)
        if (name === 'flags') return self.checkedLocations; // The Set of checked location names

        // Static data from StateManager
        if (name === 'regions') return self.regions;
        if (name === 'locations') return self.locations; // The flat array of all location objects
        if (name === 'items') return self.itemData; // Item definitions
        if (name === 'groups') return self.groupData; // Item group definitions

        // Fallback: if 'name' is a direct method or property on the helpers object
        if (
          self.helpers &&
          Object.prototype.hasOwnProperty.call(self.helpers, name)
        ) {
          const helperProp = self.helpers[name];
          if (typeof helperProp === 'function') {
            // Bind to helpers context if it's a function from helpers
            return helperProp.bind(self.helpers);
          }
          return helperProp; // Return property value
        }

        // If the name refers to a setting property directly (already covered by getSetting)
        // but direct name resolution might be expected by some rules.
        if (
          self.settings &&
          Object.prototype.hasOwnProperty.call(self.settings, name)
        ) {
          return self.settings[name];
        }

        // log('warn', `[StateManager SelfSnapshotInterface resolveName] Unhandled name: ${name}`);
        return undefined; // Crucial: return undefined for unhandled names
      },
      // Static data accessors (mirroring proxy's snapshot interface)
      staticData: {
        items: self.itemData,
        groups: self.groupData,
        locations: self.locations,
        regions: self.regions,
        dungeons: self.dungeons, // ADDED
      },
      getStaticData: () => ({
        items: self.itemData,
        groups: self.groupData,
        locations: self.locations,
        regions: self.regions,
        dungeons: self.dungeons, // ADDED
        game_name: self.rules?.game_name,
        game_directory: self.rules?.game_directory,
      }),
    };
    // log('info',
    //   '[StateManager _createSelfSnapshotInterface] Returning interface:',
    //   anInterface
    // );
    return anInterface;
  }

  /**
   * Sends a state snapshot update via the communication channel.
   * @private
   */
  _sendSnapshotUpdate() {
    if (this.postMessageCallback) {
      try {
        const snapshot = this.getSnapshot();
        if (snapshot) {
          this.postMessageCallback({
            type: 'stateSnapshot',
            snapshot: snapshot,
          });
          this._logDebug('[StateManager Class] Sent stateSnapshot update.');
        } else {
          log(
            'warn',
            '[StateManager Class] Failed to generate snapshot for update.'
          );
        }
      } catch (error) {
        log(
          'error',
          '[StateManager Class] Error sending state snapshot update:',
          error
        );
      }
    } else {
    }
  }

  getSnapshot() {
    // Don't recompute reachability during helper execution to prevent circular recursion
    if (!this.cacheValid && !this._inHelperExecution) {
      this._logDebug(
        '[StateManager getSnapshot] Cache invalid, recomputing reachability...'
      );
      this.computeReachableRegions();
    }

    // 1. Inventory
    let inventorySnapshot = {};
    if (this.inventory) {
      // In canonical format, inventory is already a plain object with all items
      inventorySnapshot = { ...this.inventory };
    } else {
      log(
        'warn',
        `[StateManager getSnapshot] Inventory is not available. Snapshot inventory may be empty.`
      );
    }

    // 2. Region Reachability
    const regionReachability = {};
    if (this.regions) {
      for (const regionName in this.regions) {
        if (this.knownReachableRegions.has(regionName)) {
          regionReachability[regionName] = 'reachable';
        } else {
          regionReachability[regionName] = this.knownUnreachableRegions.has(
            regionName
          )
            ? 'unreachable'
            : 'unreachable';
        }
      }
    }

    // 3. Location Reachability
    const locationReachability = {};
    if (this.locations) {
      this.locations.forEach((loc) => {
        if (this.isLocationChecked(loc.name)) {
          locationReachability[loc.name] = 'checked';
        } else if (!this._inHelperExecution && this.isLocationAccessible(loc)) {
          // Skip location accessibility check during helper execution to prevent recursion
          locationReachability[loc.name] = 'reachable';
        } else if (!this._inHelperExecution) {
          // Only mark as unreachable if we actually checked accessibility
          locationReachability[loc.name] = 'unreachable';
        }
        // During helper execution, we don't set locationReachability for unchecked locations
        // This prevents incorrect 'unreachable' status during rule evaluation
      });
    }

    // 4. LocationItems
    const locationItemsMap = {};
    if (this.locations) {
      this.locations.forEach((loc) => {
        if (
          loc.item &&
          typeof loc.item.name === 'string' &&
          typeof loc.item.player === 'number'
        ) {
          locationItemsMap[loc.name] = {
            name: loc.item.name,
            player: loc.item.player,
          };
        } else if (loc.item) {
          locationItemsMap[loc.name] = null;
        } else {
          locationItemsMap[loc.name] = null;
        }
      });
    }

    // 5. Convert eventLocations Map to plain object
    const eventLocationsObject = {};
    if (this.eventLocations && this.eventLocations instanceof Map) {
      for (const [
        locationName,
        locationData,
      ] of this.eventLocations.entries()) {
        eventLocationsObject[locationName] = locationData;
      }
    }

    // 6. Assemble Snapshot
    // REFACTOR: Duplication removed - using single source of truth for all fields
    const snapshot = {
      inventory: inventorySnapshot,
      settings: { ...this.settings },
      // All games now use gameStateModule flags
      flags: this.gameStateModule?.flags || [],
      checkedLocations: Array.from(this.checkedLocations || []),
      // REFACTOR: Separated region and location reachability to prevent name conflicts
      regionReachability: regionReachability,
      locationReachability: locationReachability,
      locationItems: locationItemsMap,
      // serverProvidedUncheckedLocations: Array.from(this.serverProvidedUncheckedLocations || []), // Optionally expose if UI needs it directly
      player: {
        name: this.settings?.playerName || `Player ${this.playerSlot}`,
        slot: this.playerSlot,
        team: this.team, // Assuming this.team exists on StateManager
      },
      game: this.rules?.game_name || this.settings?.game || 'Unknown', // Single game identifier
      // All games now use gameStateModule data
      difficultyRequirements: this.gameStateModule?.difficultyRequirements,
      shops: this.gameStateModule?.shops,
      gameMode: this.gameStateModule?.gameMode || this.mode,
      // ALTTP-specific properties promoted from state object
      requiredMedallions: this.gameStateModule?.requiredMedallions,
      treasureHuntRequired: this.gameStateModule?.treasureHuntRequired,
      events: this.gameStateModule?.events || [],
      // ADDED: Expose dungeons in the main snapshot body for easier access by some components
      dungeons: this.dungeons,
      // REFACTOR: Add missing properties for canonical state
      debugMode: this.debugMode || false,
      autoCollectEventsEnabled: this.autoCollectEventsEnabled !== false, // Default true
      eventLocations: eventLocationsObject,
      startRegions: this.startRegions || ['Menu'],

      // Note: We don't include progressionMapping, itemData, groupData, etc. here
      // because they are static data already available in staticDataCache
    };

    // REFACTOR: Debug logging for snapshot structure
    if (this.debugMode) {
      log(
        'info',
        '[StateManager getSnapshot] Snapshot structure:',
        {
          game: snapshot.game,
          inventoryItemCount: Object.keys(snapshot.inventory).length,
          flagsCount: snapshot.flags.length,
          checkedLocationsCount: snapshot.checkedLocations.length,
          eventsCount: snapshot.events.length,
          eventLocationsCount: Object.keys(snapshot.eventLocations).length,
          regionReachabilityCount: Object.keys(snapshot.regionReachability).length,
          locationReachabilityCount: Object.keys(snapshot.locationReachability).length,
        }
      );
    }

    return snapshot;
  }

  // REMOVED: Legacy canonical state format initialization - now always canonical

  // REMOVED: Legacy inventory migration - now always canonical

  // REMOVED: Legacy inventory migration - now always canonical

  /**
   * Helper function to add items to canonical inventory
   */
  _addItemToInventory(itemName, count = 1) {
    // Canonical format: plain object
    if (!(itemName in this.inventory)) {
      log('warn', `[StateManager] Adding unknown item: ${itemName}`);
      this.inventory[itemName] = 0;
    }

    const currentCount = this.inventory[itemName];
    const itemDef = this.itemData[itemName];
    const maxCount = itemDef?.max_count ?? Infinity;

    this.inventory[itemName] = Math.min(currentCount + count, maxCount);
  }

  /**
   * Helper function to remove items from canonical inventory
   */
  _removeItemFromInventory(itemName, count = 1) {
    // Canonical format: plain object
    if (!(itemName in this.inventory)) {
      this._logDebug(`[StateManager] Attempting to remove unknown item: ${itemName}`, null, 'warn');
      return;
    }

    const currentCount = this.inventory[itemName];
    const newCount = Math.max(0, currentCount - count);

    this.inventory[itemName] = newCount;
    
    this._logDebug(
      `[StateManager] _removeItemFromInventory: "${itemName}" count changed from ${currentCount} to ${newCount}`
    );
  }

  /**
   * Helper function to check items in canonical inventory
   */
  _hasItem(itemName) {
    return (this.inventory[itemName] || 0) > 0;
  }

  /**
   * Helper function to count items in canonical inventory
   */
  _countItem(itemName) {
    return this.inventory[itemName] || 0;
  }

  /**
   * Helper function to count groups in canonical inventory
   */
  _countGroup(groupName) {
    // In canonical format, inventory is a plain object, so we need to manually count group items
    let count = 0;
    if (this.itemData) {
      for (const itemName in this.itemData) {
        const itemInfo = this.itemData[itemName];
        if (itemInfo?.groups?.includes(groupName)) {
          count += this.inventory[itemName] || 0;
        }
      }
    }
    return count;
  }

  /**
   * Helper function to check if group has items in canonical inventory
   */
  _hasGroup(groupName) {
    return this._countGroup(groupName) > 0;
  }

  applyRuntimeState(payload) {
    this._logDebug(
      '[StateManager applyRuntimeState] Received payload:',
      payload
    );

    // Check if this is a full reset or incremental update
    const isFullReset = payload.resetInventory !== false; // Default to true for backward compatibility
    
    this._logDebug(
      `[StateManager applyRuntimeState] ${isFullReset ? 'Full reset' : 'Incremental update'} mode`
    );

    // 1. Reset game-specific state only for full resets
    if (isFullReset && this.settings) {
      // Fallback: Re-create state if reset is not available but settings are
      const gameSettings = this.settings;
      const determinedGameName = gameSettings.game || this.rules?.game_name;
      
      // Use centralized game logic selection for runtime state reset
      const logic = getGameLogic(determinedGameName);
      this.logicModule = logic.logicModule;
      this.helperFunctions = logic.helperFunctions;
      
      // Re-initialize using selected logic module
      this.gameStateModule = this.logicModule.initializeState();
      this.gameStateModule = this.logicModule.loadSettings(this.gameStateModule, gameSettings);
      
      // All games now use gameStateModule - no legacy GameState needed
      this.state = null;
      this._logDebug(
        '[StateManager applyRuntimeState] Game-specific state (this.state) set to null - using gameStateModule only.'
      );
    } else if (isFullReset) {
      log(
        'warn',
        '[StateManager applyRuntimeState] Could not reset or re-initialize game-specific state (this.state).'
      );
    }

    // 2. Reset inventory only for full resets
    if (isFullReset) {
      const gameNameForInventory = this.settings
        ? this.settings.game
        : this.rules?.game_name || 'UnknownGame';
      this.inventory = this._createInventoryInstance(gameNameForInventory);
      this._logDebug(
        `[StateManager applyRuntimeState] Inventory re-initialized via _createInventoryInstance for ${gameNameForInventory}.`
      );
      // In canonical format, itemData and groupData are accessed from StateManager instance directly
      // No need to assign them to inventory object
    } else {
      this._logDebug(
        '[StateManager applyRuntimeState] Preserving existing inventory (incremental update).'
      );
    }

    // 3. Clear pathfinding cache and related structures
    this.indirectConnections = new Map();
    this.invalidateCache(); // This clears knownReachableRegions, path, blockedConnections, sets cacheValid = false
    this._logDebug(
      '[StateManager applyRuntimeState] Pathfinding cache and indirect connections cleared.'
    );

    // 4. Process Server Checked Locations
    if (
      payload.serverCheckedLocationNames &&
      Array.isArray(payload.serverCheckedLocationNames)
    ) {
      if (isFullReset) {
        // For full reset (initial connection), replace checked locations with server's authoritative list
        this.checkedLocations = new Set(payload.serverCheckedLocationNames);
        this._logDebug(
          `[StateManager applyRuntimeState] Replaced checked locations with server authoritative list: ${payload.serverCheckedLocationNames.length} locations`
        );
      } else {
        // For incremental updates, merge new locations with existing ones
        let changed = false;
        payload.serverCheckedLocationNames.forEach((name) => {
          if (this.checkedLocations && !this.checkedLocations.has(name)) {
            this.checkedLocations.add(name);
            changed = true;
          }
        });
        
        if (changed) {
          this._logDebug(
            `[StateManager applyRuntimeState] Merged ${
              payload.serverCheckedLocationNames.length
            } server checked locations. New total: ${
              this.checkedLocations ? this.checkedLocations.size : 'undefined'
            }`
          );
        } else {
          this._logDebug(
            `[StateManager applyRuntimeState] No new server checked locations to add. Total remains: ${
              this.checkedLocations ? this.checkedLocations.size : 'undefined'
            }`
          );
        }
      }
    } else {
      this._logDebug(
        '[StateManager applyRuntimeState] No serverCheckedLocationNames in payload; existing checkedLocations preserved.'
      );
    }
    // serverUncheckedLocationNames from payload implies they should not be in checkedLocations,
    // which is handled by the clearCheckedLocations() if serverCheckedLocationNames is present.

    // 5. Process Received Items (add to now-reset inventory)
    if (
      payload.receivedItemsForProcessing &&
      Array.isArray(payload.receivedItemsForProcessing)
    ) {
      if (!this.inventory) {
        log(
          'warn',
          '[StateManager applyRuntimeState] Inventory is unexpectedly null/undefined before processing received items.'
        );
      } else {
        let itemsProcessedCount = 0;
        payload.receivedItemsForProcessing.forEach((itemDetail) => {
          if (itemDetail && itemDetail.itemName) {
            this._addItemToInventory(itemDetail.itemName, 1);
            itemsProcessedCount++;
          }
        });
        if (itemsProcessedCount > 0) {
          this._logDebug(
            `[StateManager applyRuntimeState] Added ${itemsProcessedCount} items from payload to inventory.`
          );
        }
      }
    }

    // 7. Process JSON Export Format (inventory object + checkedLocations array)
    if (payload.inventory && typeof payload.inventory === 'object') {
      this._logDebug(
        '[StateManager applyRuntimeState] Processing JSON export format - inventory object'
      );
      if (!this.inventory) {
        log(
          'warn',
          '[StateManager applyRuntimeState] Inventory is unexpectedly null/undefined before processing JSON export inventory.'
        );
      } else {
        // Replace inventory from JSON format (restorative, not additive)
        // Clear existing inventory items by setting them to 0
        for (const existingItemName in this.inventory) {
          if (this.inventory[existingItemName] > 0) {
            this.inventory[existingItemName] = 0;
          }
        }
        // Then set the imported inventory items
        for (const [itemName, quantity] of Object.entries(payload.inventory)) {
          if (typeof quantity === 'number' && quantity > 0) {
            // Set the inventory item directly to the specified quantity
            this.inventory[itemName] = quantity;
            this._logDebug(
              `[StateManager applyRuntimeState] Set inventory[${itemName}] to ${this.inventory[itemName]}`
            );
          }
        }
        this._logDebug(
          `[StateManager applyRuntimeState] Applied ${Object.keys(payload.inventory).length} inventory items from JSON format`
        );
      }
    }

    if (payload.checkedLocations && Array.isArray(payload.checkedLocations)) {
      this._logDebug(
        '[StateManager applyRuntimeState] Processing JSON export format - checkedLocations array'
      );
      // Replace checked locations from JSON format (restorative, not additive)
      this.checkedLocations = new Set(payload.checkedLocations);
      this._logDebug(
        `[StateManager applyRuntimeState] Replaced checked locations with JSON format. Total: ${this.checkedLocations.size}`
      );
    }

    // 6. Finalize state and send snapshot
    if (!this.batchUpdateActive) {
      this._logDebug(
        '[StateManager applyRuntimeState] Not in batch mode. Recomputing regions and sending snapshot.'
      );
      this.computeReachableRegions(); // InvalidateCache was called, so this will fully recompute
      this._sendSnapshotUpdate();
      this.isModified = false;
    } else {
      this._logDebug(
        '[StateManager applyRuntimeState] In batch mode. Computation and snapshot deferred. Marking as modified.'
      );
      this.isModified = true; // Resetting inventory/state and potentially locations implies modifications.
    }
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
    this._logDebug(
      `[StateManager _createInventoryInstance] Creating canonical inventory for game: ${gameName}`
    );

    const canonicalInventory = {};

    // Initialize all items to 0
    if (this.itemData) {
      for (const itemName in this.itemData) {
        if (Object.hasOwn(this.itemData, itemName)) {
          canonicalInventory[itemName] = 0;
        }
      }
    }

    return canonicalInventory;
  }

  initializeInventory(selectedPlayerId, startingItems) {
    // Inventory is a canonical plain object created by _createInventoryInstance
    this._logDebug(
      `[StateManager initializeInventory] Using canonical inventory format for game: ${this.settings.game}`
    );

    if (!this.inventory) {
      this._logError(
        '[StateManager initializeInventory CRITICAL] this.inventory is null/undefined before processing items!'
      );
    }
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
            this.itemData[item]?.type === 'Event'
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
            this.itemData[itemName]?.type === 'Event'
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
      const locationObject = this.locations.find(
        (loc) => loc.name === locationName
      );
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
    return {
      game_name: this.rules?.game_name,
      game_directory: this.rules?.game_directory,
      locations: this.locations,
      regions: this.regions,
      exits: this.exits,
      dungeons: this.dungeons,
      items: this.itemData,
      itemData: this.itemData,
      groups: this.groupData,
      groupData: this.groupData,
      progressionMapping: this.progressionMapping,
      itempoolCounts: this.itempoolCounts,
      startRegions: this.startRegions,
      mode: this.mode,
      // ID mappings
      locationNameToId: this.locationNameToId,
      itemNameToId: this.itemNameToId,
      // Original orders for consistency
      originalLocationOrder: this.originalLocationOrder,
      originalRegionOrder: this.originalRegionOrder,
      originalExitOrder: this.originalExitOrder,
      // Event locations
      eventLocations: Object.fromEntries(this.eventLocations || new Map())
    };
  }
}
