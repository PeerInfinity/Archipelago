import { ALTTPInventory } from './games/alttp/inventory.js';
import { ALTTPState } from './games/alttp/state.js';
import { ALTTPWorkerHelpers } from './games/alttp/alttpWorkerHelpers.js';

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
  constructor(evaluateRuleFunction) {
    // Core state storage
    this.inventory = new ALTTPInventory();
    this.state = new ALTTPState();
    // Pass 'this' (the manager instance) to helpers when running in worker context
    this.helpers = null; // Initialize as null

    // Injected dependencies
    this.eventBus = null; // Legacy/optional
    this.postMessageCallback = null; // For worker communication
    this.evaluateRuleFromEngine = evaluateRuleFunction; // Store the injected rule evaluator

    // --- ADDED Check for missing evaluator --- >
    if (!this.evaluateRuleFromEngine) {
      console.warn(
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

    // Game configuration
    this.mode = null;
    this.settings = null;
    this.startRegions = null;

    // Checked locations tracking
    this.checkedLocations = new Set();

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

    console.log('[StateManager Class] Instance created.');
  }

  /**
   * Applies initial settings to the StateManager instance.
   * @param {object} settingsObject - The settings object to apply.
   */
  applySettings(settingsObject) {
    this.settings = settingsObject;
    console.log('[StateManager Class] Settings applied:', this.settings);
    // Potentially call other methods if settings need immediate effect
    // For example, this.state.loadSettings(this.settings) if that wasn't done elsewhere
    // or if settings affect helper instantiation or other core components.
    // For now, just storing them.
  }

  /**
   * Sets the event bus instance dependency (legacy/optional).
   * @param {object} eventBusInstance - The application's event bus.
   */
  setEventBus(eventBusInstance) {
    console.log('[StateManager Class] Setting EventBus instance (legacy)...');
    this.eventBus = eventBusInstance;
  }

  /**
   * Sets the communication callback function for sending messages (e.g., to the proxy).
   * @param {function} callback - The function to call (e.g., self.postMessage).
   */
  setCommunicationChannel(callback) {
    console.log('[StateManager Class] Setting communication channel...');
    if (typeof callback === 'function') {
      this.postMessageCallback = callback;
    } else {
      console.error(
        '[StateManager Class] Invalid communication channel provided.'
      );
      this.postMessageCallback = null;
    }
  }

  /**
   * Initializes inventory with loaded game data
   */
  initializeInventory(items, progressionMapping, itemData) {
    this.inventory = new ALTTPInventory(items, progressionMapping, itemData);
    this.itemData = itemData; // Store for convenience
    // Do not publish here, wait for full rules load
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
        this.eventBus.publish(`stateManager:${eventType}`, {});
      }
    } catch (e) {
      console.warn('Could not publish to eventBus:', e);
    }
  }

  clearInventory() {
    const progressionMapping = this.inventory.progressionMapping || {};
    const itemData = this.inventory.itemData || {};
    const groupData = this.inventory.groupData || {};
    this.inventory = new ALTTPInventory([], progressionMapping, itemData);
    this.inventory.groupData = groupData;
    this.itemData = itemData;
    this.groupData = groupData;
    this._logDebug('[StateManager Class] Inventory cleared.');
    this.invalidateCache();
    this.computeReachableRegions(); // Recompute first
    // this._publishEvent('inventoryChanged'); // Snapshot update implies this
  }

  clearState() {
    const progressionMapping = this.inventory.progressionMapping || {};
    const itemData = this.inventory.itemData || {};
    const groupData = this.inventory.groupData || {};
    this.inventory = new ALTTPInventory([], progressionMapping, itemData);
    this.inventory.groupData = groupData;
    this.itemData = itemData;
    this.groupData = groupData;
    this.state = new ALTTPState();
    this.clearCheckedLocations(); // This calls _publishEvent('checkedLocationsCleared') -> maybe keep this specific event?
    this.indirectConnections = new Map();
    this.invalidateCache();
    this._logDebug('[StateManager Class] Full state cleared.');
    this.computeReachableRegions(); // Recompute, triggers snapshot update
    // this._publishEvent('inventoryChanged'); // Snapshot update implies this
  }

  /**
   * Adds an item and notifies all registered callbacks
   */
  addItemToInventory(itemName) {
    if (!this.itemData || !this.itemData[itemName]) {
      console.warn(
        `[StateManager Class] Attempted to add unknown item: ${itemName}`
      );
      return false;
    }
    if (this._batchMode) {
      const currentCount =
        this._batchedUpdates.get(itemName) || this.inventory.count(itemName);
      this._batchedUpdates.set(itemName, currentCount + 1);
    } else {
      this.inventory.addItem(itemName);
      this._logDebug(`[StateManager Class] Added item: ${itemName}`);
      this.invalidateCache();
      this._sendSnapshotUpdate();
    }
    return true;
  }

  /**
   * Helper method to process progressive item effects
   * This runs regardless of batch mode to ensure progressive items are handled correctly
   */
  _processProgressiveItem(itemName) {
    // No action needed here by default - this is just a hook for processing
    // Progressive items are automatically handled by the inventory.has() method
  }

  getItemCount(itemName) {
    const count = this.inventory.count(itemName);
    return count;
  }

  /**
   * Loads and processes region/location data from a JSON file
   * @param {object} jsonData - The parsed JSON data.
   * @param {string} selectedPlayerId - The ID of the player whose data should be loaded.
   */
  loadFromJSON(jsonData, selectedPlayerId) {
    // --- VERY EARLY DIAGNOSTIC LOG (using console.log directly) ---
    console.log(
      `[StateManager Worker loadFromJSON VERY EARLY DIRECT LOG] Entered method. Player ID: ${selectedPlayerId}. jsonData keys: ${
        jsonData ? Object.keys(jsonData) : 'jsonData is null/undefined'
      }`
    );
    // --- END VERY EARLY DIAGNOSTIC LOG ---

    this._logDebug(
      `[StateManager Class] Loading JSON for player ${selectedPlayerId}...`
    );

    // Initialize order arrays
    this.originalLocationOrder = [];
    this.originalRegionOrder = [];
    this.originalExitOrder = [];

    if (!jsonData) {
      console.error(
        '[StateManager loadFromJSON] jsonData is null or undefined. Aborting.'
      );
      throw new Error('Invalid JSON data provided to loadFromJSON');
    }
    if (!selectedPlayerId) {
      console.error(
        '[StateManager loadFromJSON] selectedPlayerId is not provided. Aborting.'
      );
      throw new Error('loadFromJSON called without selectedPlayerId');
    }
    if (!jsonData.schema_version || jsonData.schema_version !== 3) {
      // It's often better to log an error and continue with a defined (but perhaps empty) state
      // rather than throwing an error that might crash the worker, unless schema version is absolutely critical.
      console.error(
        `[StateManager loadFromJSON] Invalid JSON schema version: ${jsonData.schema_version}. Expected 3. Proceeding with caution.`
      );
      // Depending on strictness, you might still want to throw:
      // throw new Error('Invalid JSON format: requires schema version 3');
    }

    // Set the player slot based on selection
    this.playerSlot = parseInt(selectedPlayerId, 10);
    console.log(`StateManager playerSlot set to: ${this.playerSlot}`);

    // Load item data for the selected player
    this.itemData = jsonData.items?.[selectedPlayerId] || {};
    this.itemNameToId = {};
    for (const id in this.itemData) {
      if (Object.hasOwn(this.itemData, id) && this.itemData[id]?.name) {
        this.itemNameToId[this.itemData[id].name] = id;
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

    // Load group data for the selected player
    const playerSpecificGroupData =
      jsonData.item_groups?.[String(selectedPlayerId)];
    if (Array.isArray(playerSpecificGroupData)) {
      this.groupData = playerSpecificGroupData;
      this._logDebug(
        `Loaded player-specific item_groups for player ${selectedPlayerId}: ${this.groupData.length} groups.`
      );
    } else if (jsonData.groups && Array.isArray(jsonData.groups)) {
      this.groupData = jsonData.groups; // Fallback to global jsonData.groups
      this._logDebug(
        `Used global jsonData.groups for player ${selectedPlayerId}: ${this.groupData.length} groups (item_groups not suitable).`
      );
    } else {
      this.groupData = []; // Default to empty array if no suitable group data is found
      console.warn(
        `[StateManager loadFromJSON] No valid group data found for player ${selectedPlayerId}. Defaulting to empty array.`
      );
    }

    // Load other direct properties
    this.settings = jsonData.settings?.[selectedPlayerId] || {};
    this.startRegions = jsonData.start_regions?.[selectedPlayerId] || [];
    this.mode = jsonData.mode?.[selectedPlayerId] || null; // Default to null if not present
    this.itempoolCounts = jsonData.itempool_counts?.[selectedPlayerId] || {};
    this.progressionMapping =
      jsonData.progression_mapping?.[selectedPlayerId] || {};
    this._logDebug(
      'Loaded settings, startRegions, mode, itempoolCounts, and progressionMapping.'
    );

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

    // console.log(`Loaded ${Object.keys(this.itemNameToId).length} item IDs`); // Covered by _logDebug

    // Aggregate all locations from all regions into a flat list and build nameToId map
    this.locations = [];
    this.locationNameToId = {};
    this.eventLocations.clear(); // Clear event locations before populating

    // Iterate regions using the guaranteed originalRegionOrder for consistent processing order
    for (const regionName of this.originalRegionOrder) {
      const region = this.regions[regionName]; // Get region data using the name
      if (!region) {
        console.warn(
          `[StateManager loadFromJSON] Region data for '${regionName}' not found in this.regions. Skipping.`
        );
        continue;
      }

      if (region.locations && Array.isArray(region.locations)) {
        region.locations.forEach((locationDataItem) => {
          const descriptiveName = locationDataItem.name;

          if (!descriptiveName) {
            console.warn(
              `[StateManager loadFromJSON] Location data in region '${regionName}' is missing a 'name' property:`,
              locationDataItem
            );
            return;
          }

          const locationObjectForArray = {
            ...locationDataItem,
            region: regionName, // Ensure parent region context is explicitly set
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

          this.locationNameToId[descriptiveName] = this.locations.length - 1;
        });
      } else if (region.locations) {
        console.warn(
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
        console.warn(
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

    // After loading base data, initialize helpers
    // Crucially, helpers need access to the manager instance, especially for worker context
    // For ALTTP, this would be new ALTTPWorkerHelpers(this);
    // TODO: Make this game-agnostic based on this.game or similar
    if (this.settings && this.settings.game === 'A Link to the Past') {
      this.helpers = new ALTTPWorkerHelpers(this);
      console.log(
        '[StateManager loadFromJSON] ALTTPWorkerHelpers instantiated AFTER data load.'
      );
    } else {
      // TODO: Instantiate generic GameWorkerHelpers or throw error if game not supported
      console.warn(
        '[StateManager loadFromJSON] No specific helpers for game:',
        this.settings?.game
      );
      // this.helpers = new GameWorkerHelpers(this); // Fallback if needed
    }

    // Initialize inventory with the loaded item data and progression mapping
    this.initializeInventory(
      [], // Initial inventory is empty
      this.progressionMapping, // Corrected: Use this.progressionMapping
      this.itemData // Corrected: Use this.itemData
    );
    this.inventory.groupData = this.groupData; // Corrected: Use this.groupData

    // Load settings into the state object
    this.state.loadSettings(this.settings); // Corrected: Use this.settings

    // Load shop data if available in jsonData
    if (jsonData.shops && jsonData.shops[selectedPlayerId]) {
      this.state.loadShops(jsonData.shops[selectedPlayerId]);
    } else {
      // console.warn('No shop data found for player in JSON.');
    }

    // --- Start of new group processing logic ---
    console.log(
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
        console.log(
          `[StateManager loadFromJSON] Loaded player-specific item_groups for player ${selectedPlayerId}:`,
          JSON.parse(JSON.stringify(this.groupData))
        );
      } else {
        console.log(
          `[StateManager loadFromJSON] item_groups found, but no specific entry for player ${selectedPlayerId} or entry is not an array. Player entry:`,
          playerSpecificGroups
        );
        this.groupData = []; // Default to empty if player-specific groups are not an array
      }
    } else if (jsonData.groups && Array.isArray(jsonData.groups)) {
      // Fallback for old global 'groups' array format if item_groups is not present
      console.log(
        `[StateManager loadFromJSON] No player-specific item_groups found or item_groups is not an object. Falling back to global jsonData.groups (if array).`
      );
      this.groupData = jsonData.groups;
    } else {
      console.log(
        `[StateManager loadFromJSON] No player-specific item_groups or suitable global fallback found. Setting groupData to [].`
      );
      this.groupData = [];
    }
    console.log(
      `[StateManager loadFromJSON] Final this.groupData for player ${selectedPlayerId}:`,
      JSON.parse(JSON.stringify(this.groupData)),
      'Is Array:',
      Array.isArray(this.groupData)
    );
    // --- End of new group processing logic ---

    // Process starting items
    const startingItems = jsonData.starting_items?.[selectedPlayerId] || [];
    if (startingItems && startingItems.length > 0) {
      console.log(
        `[StateManager loadFromJSON] Adding ${startingItems.length} starting items for player ${selectedPlayerId}:`,
        startingItems
      );
      this.beginBatchUpdate(true); // Defer computation until after adding all items
      startingItems.forEach((itemName) => {
        // Ensure the item exists in itemData before trying to add
        if (this.itemData && this.itemData[itemName]) {
          this.addItemToInventory(itemName); // This will add to _batchedUpdates
        } else {
          console.warn(
            `[StateManager loadFromJSON] Starting item '${itemName}' not found in itemData, skipping.`
          );
        }
      });
      this.commitBatchUpdate(); // This will apply batched items and trigger computation if needed
      console.log(
        '[StateManager loadFromJSON] Starting items processed and batch committed.'
      );
    } else {
      console.log('[StateManager loadFromJSON] No starting items to process.');
      // If batch mode was somehow active and we didn't add items, ensure it's reset.
      // And if no starting items, we still need an initial computation if cache is still invalid.
      if (this._batchMode) {
        // If a batch was started for some other reason (unlikely here)
        this.commitBatchUpdate(); // Ensure it's committed.
      } else if (!this.cacheValid) {
        // If no starting items and cache is invalid (e.g. fresh load), trigger computation
        // This computeReachableRegions will update the cache. The snapshot is sent later.
        console.log(
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
          region.exits.forEach((exit) => {
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
    //console.log(
    //  '[StateManager Worker loadFromJSON] DIAGNOSTIC (direct log): Listing all incoming exit names from jsonData.regions...'
    //);
    //console.log(
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
              //console.log(
              //  `  DIAGNOSTIC (direct log): Region '${regionKey}', Exit Index ${index}, Name: '${exit.name}', Connected Region (snake): '${exit.connected_region}', Connected Region (camel): '${exit.connectedRegion}'`
              //);
            }
          });
        }
      }
    } else {
      //console.log(
      //  '[StateManager Worker loadFromJSON] DIAGNOSTIC (direct log): jsonData.regions or player-specific region data for diagnostic loop not found.'
      //);
    }
    //console.log(
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
              console.log(
                `[StateManager Worker loadFromJSON] Processing "Links House S&Q" (Region: ${regionKey}):`
              );
              console.log(
                `  Original Exit Object (raw): ${JSON.stringify(
                  originalExitObject
                )}`
              );
              console.log(
                `  Attempted snake_case originalExitObject.connected_region: ${originalExitObject.connected_region}`
              );
              console.log(
                `  Attempted camelCase originalExitObject.connectedRegion: ${originalExitObject.connectedRegion}`
              );
              console.log(
                `  Resolved connectedRegionValue for processedExit: ${connectedRegionValue}`
              );
              console.log(
                `  Processed Exit Object (to be pushed): ${JSON.stringify(
                  processedExit
                )}`
              );
              console.log(
                `  Value of connected_region being pushed: ${processedExit.connected_region}`
              );
            }

            if (!processedExit.name) {
              //console.warn(
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
              //console.warn(
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
            console.warn(
              `[StateManager Worker loadFromJSON] Encountered invalid exit data in region '${regionKey}':`,
              originalExitObject
            );
          }
        });
      } else if (regionObject.exits) {
        // Log if regionObject.exits is defined but not an array (unexpected structure)
        console.warn(
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

    console.log(
      '[StateManager loadFromJSON END] Final check before return. this.originalExitOrder type:',
      typeof this.originalExitOrder,
      'Is Array:',
      Array.isArray(this.originalExitOrder),
      'Length:',
      this.originalExitOrder ? this.originalExitOrder.length : 'N/A',
      'Sample:',
      this.originalExitOrder ? this.originalExitOrder.slice(0, 5) : 'N/A'
    );
  } // End of loadFromJSON

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
      let newEventCollected = true;

      while (newEventCollected) {
        newEventCollected = false;

        // Process reachability with BFS
        const newlyReachable = this.runBFSPass();

        // Auto-collect events
        for (const loc of this.eventLocations.values()) {
          if (this.knownReachableRegions.has(loc.region)) {
            const canAccessLoc = this.isLocationAccessible(loc);
            if (canAccessLoc && !this.inventory.has(loc.item.name)) {
              this.inventory.addItem(loc.item.name);
              this.checkedLocations.add(loc.name);
              newEventCollected = true;
              this._logDebug(
                `Auto-collected event item: ${loc.item.name} from ${loc.name}`
              );
            }
          }
        }

        // If any new regions or events were found, continue searching
        if (newlyReachable || newEventCollected) {
          continue;
        }

        // When no more progress is made, we're done
        break;
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

    // Exactly match Python's nested loop structure
    let newConnection = true;
    while (newConnection) {
      newConnection = false;

      let queue = [...this.blockedConnections];
      while (queue.length > 0) {
        const connection = queue.shift();
        const { fromRegion, exit } = connection;
        const targetRegion = exit.connected_region; // Use connected_region consistently

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
        const canTraverse =
          !exit.access_rule ||
          this.evaluateRuleFromEngine(
            exit.access_rule,
            snapshotInterfaceContext
          );

        if (canTraverse) {
          // Region is now reachable
          this.knownReachableRegions.add(targetRegion);
          newRegionsFound = true;
          newConnection = true; // Signal that we found a new connection

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
    // Get start regions from state object if available, or use default
    if (this.state && this.state.startRegions) {
      return this.state.startRegions;
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
    const reachableRegions = this.computeReachableRegions();
    if (!reachableRegions.has(location.region)) {
      return false;
    }
    if (!location.access_rule) return true;

    // Use the *injected* evaluateRule engine
    try {
      const snapshotInterface = this._createSelfSnapshotInterface();
      return this.evaluateRuleFromEngine(
        location.access_rule,
        snapshotInterface
      );
    } catch (e) {
      console.error(
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
        //console.log(
        //  'Using itempool_counts data for test inventory:',
        //  this.itempoolCounts
        //);

        // Process special maximum values first to ensure state is properly configured
        if (this.itempoolCounts['__max_progressive_bottle']) {
          this.state.difficultyRequirements.progressive_bottle_limit =
            this.itempoolCounts['__max_progressive_bottle'];
        }
        if (this.itempoolCounts['__max_boss_heart_container']) {
          this.state.difficultyRequirements.boss_heart_container_limit =
            this.itempoolCounts['__max_boss_heart_container'];
        }
        if (this.itempoolCounts['__max_heart_piece']) {
          this.state.difficultyRequirements.heart_piece_limit =
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
        console.warn(
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
      if (this.state?.processEventItem) {
        this.state.processEventItem(itemName);
      }
    });
    this.commitBatchUpdate();

    // Update regions and UI
    this.invalidateCache();
    this.computeReachableRegions();
    this.notifyUI('inventoryChanged');
  }

  /**
   * Check if a location has been marked as checked
   */
  isLocationChecked(locationName) {
    return this.checkedLocations.has(locationName);
  }

  /**
   * Mark a location as checked
   */
  checkLocation(locationName) {
    if (!this.checkedLocations.has(locationName)) {
      this.checkedLocations.add(locationName);
      this._logDebug(`[StateManager Class] Checked location: ${locationName}`);
      const location = this.locations.find((loc) => loc.name === locationName);

      // --- ADDED: Grant item from location --- >
      if (location && location.item && typeof location.item.name === 'string') {
        this._logDebug(
          `[StateManager Class] Location ${locationName} contains item: ${location.item.name}`
        );
        this.inventory.addItem(location.item.name);
        this._logDebug(
          `[StateManager Class] Added ${location.item.name} to inventory.`
        );
        // Potentially trigger an event for item acquisition if needed by other systems
        // this._publishEvent('itemAcquired', { itemName: location.item.name, locationName });
      } else if (location && location.item) {
        this._logDebug(
          `[StateManager Class] Location ${locationName} has an item, but item.name is not a string: ${JSON.stringify(
            location.item
          )}`
        );
      } else {
        this._logDebug(
          `[StateManager Class] Location ${locationName} has no item or location data is incomplete.`
        );
      }
      // --- END ADDED --- >

      this.invalidateCache();
      this._sendSnapshotUpdate();
    }
  }

  /**
   * Clear all checked locations
   */
  clearCheckedLocations() {
    if (this.checkedLocations.size > 0) {
      this.checkedLocations.clear();
      this._logDebug('[StateManager Class] Cleared checked locations.');
      // Publish specific event for this?
      this._publishEvent('checkedLocationsCleared'); // Maybe keep this one
      // Send snapshot update
      this._sendSnapshotUpdate();
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
      const existingCount = this.inventory.count(itemName);
      const diff = count - existingCount;

      if (diff > 0) {
        for (let i = 0; i < diff; i++) {
          this.inventory.addItem(itemName);
        }
        inventoryChanged = true;
      } else if (diff < 0) {
        console.warn(`Batch commit needs inventory.removeItem for ${itemName}`);
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
    if (this.debugMode) {
      if (data) {
        try {
          const clonedData = JSON.parse(JSON.stringify(data));
          console.debug(message, clonedData);
        } catch (e) {
          console.debug(message, '[Could not clone data]', data);
        }
      } else {
        console.debug(message);
      }
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

    // Publish specific events like checkedLocationsCleared or errors via EventBus if available
    if (this.eventBus) {
      try {
        this.eventBus.publish(`stateManager:${eventType}`, eventData);
        this._logDebug(
          `[StateManager Class] Published ${eventType} event via EventBus.`
        );
      } catch (error) {
        console.error(
          `[StateManager Class] Error publishing ${eventType} event via EventBus:`,
          error
        );
      }
    } else if (!this.postMessageCallback) {
      // Only warn if not in worker mode and eventBus is missing
      console.warn(
        `[StateManager Class] Event bus not available to publish ${eventType}.`
      );
    }
  }

  /**
   * Helper method to execute a state method by name
   */
  executeStateMethod(method, ...args) {
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

    // 3. Look in helpers - handle both underscore and non-underscore versions
    // Some helper methods might be defined with leading underscores
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

    // 4. Check in state object if helpers didn't have the method
    if (this.state && typeof this.state[method] === 'function') {
      return this.state[method](...args);
    }

    // Log failure in debug mode
    if (this.debugMode) {
      console.log(`Unknown state method: ${method}`, {
        args: args,
        stateManagerHas: typeof this[method] === 'function',
        helpersHas: this.helpers
          ? typeof this.helpers[method] === 'function' ||
            (method.startsWith('_') &&
              typeof this.helpers[method.substring(1)] === 'function') ||
            (!method.startsWith('_') &&
              typeof this.helpers['_' + method] === 'function')
          : false,
        stateHas: this.state ? typeof this.state[method] === 'function' : false,
      });
    }

    return false;
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

    console.log('============ CRITICAL REGIONS DEBUG ============');

    // Log the current inventory state
    console.log('Current inventory:');
    const inventoryItems = [];
    this.inventory.items.forEach((count, item) => {
      if (count > 0) {
        inventoryItems.push(`${item} (${count})`);
      }
    });
    console.log(inventoryItems.join(', '));

    // Check each critical region
    criticalRegions.forEach((regionName) => {
      const region = this.regions[regionName];
      if (!region) {
        console.log(`Region "${regionName}" not found in loaded regions`);
        return;
      }

      console.log(`\nAnalyzing "${regionName}":`);
      console.log(
        `- Reachable according to stateManager: ${this.isRegionReachable(
          regionName
        )}`
      );

      // Check incoming paths
      console.log(`\nIncoming connections to ${regionName}:`);
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
          console.log(
            `- From ${sourceRegionName} (${
              sourceReachable ? 'REACHABLE' : 'UNREACHABLE'
            }):`
          );

          connectingExits.forEach((exit) => {
            const exitAccessible = this.evaluateRuleFromEngine(
              exit.access_rule
            );
            console.log(
              `  - Exit: ${exit.name} (${
                exitAccessible ? 'ACCESSIBLE' : 'BLOCKED'
              })`
            );

            if (exit.access_rule) {
              console.log(
                '    Rule:',
                JSON.stringify(exit.access_rule, null, 2)
              );
              this.debugRuleEvaluation(exit.access_rule);
            }
          });
        }
      });

      if (!hasIncomingPaths) {
        console.log('  No incoming paths found.');
      }

      // Check region's own rules if any
      if (region.region_rules && region.region_rules.length > 0) {
        console.log(
          `\n${regionName} has ${region.region_rules.length} region rules:`
        );
        region.region_rules.forEach((rule, i) => {
          const ruleResult = this.evaluateRuleFromEngine(rule);
          console.log(`- Rule #${i + 1}: ${ruleResult ? 'PASSES' : 'FAILS'}`);
          this.debugRuleEvaluation(rule);
        });
      }

      // Check path from stateManager
      const path = this.getPathToRegion(regionName);
      if (path && path.length > 0) {
        console.log(`\nPath found to ${regionName}:`);
        path.forEach((segment) => {
          console.log(
            `- ${segment.from} → ${segment.entrance} → ${segment.to}`
          );
        });
      } else {
        console.log(`\nNo path found to ${regionName}`);
      }
    });

    console.log('===============================================');
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
        console.log(
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
          console.log(
            `${indent}- Condition #${i + 1}: ${result ? 'PASS' : 'FAIL'}`
          );
          this.debugRuleEvaluation(condition, depth + 1);
        });

        if (rule.type === 'and') {
          console.log(
            `${indent}AND result: ${
              allResults.every((r) => r) ? 'PASS' : 'FAIL'
            }`
          );
        } else {
          console.log(
            `${indent}OR result: ${allResults.some((r) => r) ? 'PASS' : 'FAIL'}`
          );
        }
        break;

      case 'item_check':
        const hasItem = this.inventory.has(rule.item);
        console.log(
          `${indent}ITEM CHECK: ${rule.item} - ${hasItem ? 'HAVE' : 'MISSING'}`
        );
        break;

      case 'count_check':
        const count = this.inventory.count(rule.item);
        console.log(
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
        console.log(
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
        console.log(
          `${indent}STATE METHOD: ${rule.method}(${JSON.stringify(
            rule.args
          )}) - ${methodResult ? 'PASS' : 'FAIL'}`
        );

        // Special debug for can_reach which is often the source of problems
        if (rule.method === 'can_reach' && rule.args && rule.args.length > 0) {
          const targetRegion = rule.args[0];
          const targetType = rule.args[1] || 'Region';

          if (targetType === 'Region') {
            console.log(
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
        return testResult
          ? this.evaluateRuleFromEngine(rule.if_true)
          : this.evaluateRuleFromEngine(rule.if_false);

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
            console.warn(
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
            console.warn(
              `[StateManager._internalEvaluateRule] 'not in' operator requires iterable right-hand side (Array, String, Set). Got:`,
              right
            );
            return true;
          default:
            console.warn(
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
            console.warn(
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
          console.error(
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
          console.error(
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
        console.warn(
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
        console.warn(
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
      hasItem: (itemName) => self.inventory.has(itemName),
      countItem: (itemName) => self.inventory.count(itemName),
      hasGroup: (groupName) => self.inventory.countGroup(groupName) > 0,
      countGroup: (groupName) => self.inventory.countGroup(groupName),
      // Flags in this context usually refer to checked locations or game-specific state flags
      hasFlag: (flagName) =>
        self.checkedLocations.has(flagName) ||
        (self.state &&
          typeof self.state.hasFlag === 'function' &&
          self.state.hasFlag(flagName)),
      getSetting: (settingName) =>
        self.settings ? self.settings[settingName] : undefined,
      getAllSettings: () => self.settings,
      isRegionReachable: (regionName) => self.isRegionReachable(regionName),
      isLocationChecked: (locName) => self.isLocationChecked(locName),
      executeHelper: (name, ...args) => {
        if (!self.helpers) {
          console.error('[SelfSnapshotInterface] Helpers not initialized!');
          return undefined;
        }
        return self.helpers.executeHelper(name, ...args);
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
        if (name === 'inventory') return self.inventory; // The ALTTPInventory instance
        if (name === 'state') return self.state; // The ALTTPState instance (for game-specific flags/logic)
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

        // console.warn(`[StateManager SelfSnapshotInterface resolveName] Unhandled name: ${name}`);
        return undefined; // Crucial: return undefined for unhandled names
      },
      // Static data accessors (mirroring proxy's snapshot interface)
      staticData: {
        items: self.itemData,
        groups: self.groupData,
        locations: self.locations,
        regions: self.regions,
      },
      getStaticData: () => ({
        items: self.itemData,
        groups: self.groupData,
        locations: self.locations,
        regions: self.regions,
      }),
    };
    // console.log(
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
          console.warn(
            '[StateManager Class] Failed to generate snapshot for update.'
          );
        }
      } catch (error) {
        console.error(
          '[StateManager Class] Error sending state snapshot update:',
          error
        );
      }
    } else {
    }
  }

  getSnapshot() {
    if (!this.cacheValid) {
      this._logDebug(
        '[StateManager getSnapshot] Cache invalid, recomputing reachability...'
      );
      this.computeReachableRegions();
    }

    // 1. Inventory
    const inventorySnapshot = {};
    if (this.inventory && this.inventory.items instanceof Map) {
      for (const [item, count] of this.inventory.items.entries()) {
        inventorySnapshot[item] = count !== undefined ? count : 0;
      }
    } else {
      console.warn(
        `[StateManager getSnapshot] Inventory or inventory.items is not a Map. Type: ${typeof this
          .inventory?.items}, Constructor: ${
          this.inventory?.items?.constructor?.name
        }`
      );
    }

    // 2. Reachability
    const finalReachability = {};
    if (this.regions) {
      for (const regionName in this.regions) {
        if (this.knownReachableRegions.has(regionName)) {
          finalReachability[regionName] = 'reachable';
        } else {
          finalReachability[regionName] = this.knownUnreachableRegions.has(
            regionName
          )
            ? 'unreachable'
            : 'unreachable';
        }
      }
    }
    if (this.locations) {
      this.locations.forEach((loc) => {
        if (this.isLocationChecked(loc.name)) {
          finalReachability[loc.name] = 'checked';
        } else if (this.isLocationAccessible(loc)) {
          finalReachability[loc.name] = 'reachable';
        } else {
          finalReachability[loc.name] = 'unreachable';
        }
      });
    }

    // 3. LocationItems
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
        }
      });
    }

    // 4. Assemble Snapshot
    const snapshot = {
      inventory: inventorySnapshot,
      settings: { ...this.settings },
      flags: Array.from(this.checkedLocations || []),
      state: this.state.getState(), // Contains game-specific state like mode, dungeon states
      reachability: finalReachability,
      locationItems: locationItemsMap,
      player: {
        name: this.settings?.playerName || `Player ${this.playerSlot}`,
        slot: this.playerSlot,
        team: this.team, // Assuming this.team exists on StateManager
      },
      game: this.settings?.game || 'Unknown',
      difficultyRequirements: this.state?.difficultyRequirements,
      shops: this.state?.shops,
      gameMode: this.mode,
    };
    return snapshot;
  }

  async loadRules(source) {
    this.eventBus.publish('stateManager:loadingRules', { source });
    console.log(`[StateManager] Attempting to load rules from source:`, source);

    if (
      this.gameSpecificState &&
      typeof this.gameSpecificState.resetForNewRules === 'function'
    ) {
      this.gameSpecificState.resetForNewRules();
    }

    if (typeof source === 'string') {
      // Source is a URL
      console.log(`[StateManager] Loading rules from URL: ${source}`);
      try {
        const response = await fetch(source);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const parsedRules = await response.json();
        this.rules = parsedRules;
        console.log(
          '[StateManager] Successfully fetched and parsed rules from URL.'
        );
      } catch (error) {
        console.error('[StateManager] Error loading rules from URL:', error);
        this.eventBus.publish('stateManager:rulesLoadFailed', {
          source,
          error,
        });
        this.rules = null; // Ensure rules are null on failure
        return; // Exit early
      }
    } else if (typeof source === 'object' && source !== null) {
      // Source is direct data
      console.log('[StateManager] Loading rules from provided object data.');
      this.rules = source; // Assign the object directly
      // Perform a basic validation
      if (!this.rules || typeof this.rules.regions === 'undefined') {
        // Example check
        console.error(
          '[StateManager] Provided rules data is malformed or missing essential parts (e.g., regions). Data:',
          this.rules
        );
        this.eventBus.publish('stateManager:rulesLoadFailed', {
          source: 'directData',
          error: 'Malformed direct rules data',
        });
        this.rules = null; // Ensure rules are null on failure
        return; // Exit early
      }
      console.log(
        '[StateManager] Successfully loaded rules from direct object data.'
      );
    } else {
      console.warn(
        '[StateManager] loadRules called with invalid source type:',
        source
      );
      this.eventBus.publish('stateManager:rulesLoadFailed', {
        source,
        error: 'Invalid rules source type',
      });
      this.rules = null;
      return; // Exit early
    }

    if (!this.rules) {
      console.error(
        '[StateManager] Rules are null after loading attempt. Cannot proceed.'
      );
      // No rulesLoadFailed event here as it should have been published by the failing block
      return;
    }

    // Reset and re-initialize game-specific state components based on new rules
  }
}
