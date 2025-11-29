/**
 * StateManager Initialization Module
 *
 * Handles initialization and configuration of the StateManager instance.
 * Extracted from stateManager.js to improve code organization and maintainability.
 *
 * DATA FLOW:
 * Input: Archipelago JSON rules file
 *   - Format: {schema_version, game_name, items, locations, regions, etc.}
 *   - Source: File system or network
 *
 * Processing:
 *   1. Validates JSON structure and schema version
 *   2. Detects game type and selects appropriate logic module
 *   3. Loads player-specific data (items, locations, regions)
 *   4. Creates canonical inventory format
 *   5. Initializes game-specific state
 *
 * Output: Fully initialized StateManager instance
 *   - this.inventory: {itemName: count} (canonical format)
 *   - this.locations: Array of location objects
 *   - this.regions: Map of region objects
 *   - this.gameStateModule: Game-specific state instance
 *
 * @module stateManager/core/initialization
 */

import { getGameLogic } from '../../shared/gameLogic/gameLogicRegistry.js';
import { PlayerIdUtils } from '../../shared/playerIdUtils.js';

/**
 * Loads and processes JSON rules data for a specific player
 *
 * @param {Object} stateManager - The StateManager instance
 * @param {Object} jsonData - The rules JSON data
 * @param {string} selectedPlayerId - The player ID to load data for
 *
 * @throws {Error} If jsonData is invalid or missing required fields
 */
export function loadFromJSON(stateManager, jsonData, selectedPlayerId) {
  const sm = stateManager; // Shorthand

  sm.invalidateCache();
  sm.clearCheckedLocations({ sendUpdate: false });

  // Warn if playerId was not explicitly provided
  if (selectedPlayerId === undefined || selectedPlayerId === null) {
    sm.logger.warn('StateManager', '[Initialization] No playerId provided - defaulting to player 1. Consider explicitly specifying playerId for multiworld support.');
  }

  sm._logDebug(
    `[Initialization] Loading JSON for player ${selectedPlayerId}...`
  );

  // Store rules data
  sm.rules = jsonData;

  // Initialize order arrays
  sm.originalLocationOrder = [];
  sm.originalRegionOrder = [];
  sm.originalExitOrder = [];

  // Validate input
  validateJSONData(jsonData, selectedPlayerId);

  // Set player ID (normalized to string)
  sm.playerId = PlayerIdUtils.normalize(selectedPlayerId);
  sm.logger.info('StateManager', `Player ID set to: ${sm.playerId}`);

  // Store rules and log game info
  sm.rules = jsonData;
  sm._logDebug(
    `[Initialization] Game name: "${sm.rules?.game_name}", directory: "${sm.rules?.game_directory}"`
  );

  // Load player-specific data
  loadPlayerData(sm, jsonData, selectedPlayerId);

  // Select and initialize game logic module
  initializeGameLogic(sm, jsonData, selectedPlayerId);

  // Create inventory instance
  sm.inventory = createInventoryInstance(sm, sm.settings.game);

  // Load game-specific data from game_info (e.g., total_progression_items for Stardew Valley)
  const playerGameInfo = sm.gameInfo?.[selectedPlayerId];
  if (playerGameInfo?.total_progression_items) {
    sm.totalProgressionItems = playerGameInfo.total_progression_items;
    sm._logDebug(`[Initialization] Loaded totalProgressionItems: ${sm.totalProgressionItems}`);
  }

  // Load shops if applicable
  loadShops(sm, jsonData, selectedPlayerId);

  // Process starting items
  processStartingItems(sm, jsonData, selectedPlayerId);

  // Initialize game-specific virtual items AFTER starting items are processed
  // (e.g., Stardew Valley progression tracking needs to count starting advancement items)
  if (sm.logicModule && typeof sm.logicModule.initializeVirtualItems === 'function') {
    sm.logicModule.initializeVirtualItems(sm);
    sm._logDebug('[Initialization] Initialized game-specific virtual items');
  }

  // Compute initial reachability
  sm.buildIndirectConnections();
  sm.computeReachableRegions();

  // Reset game-specific events
  if (sm.gameStateModule && sm.gameStateModule.events) {
    sm.gameStateModule.events = [];
    sm._logDebug('[Initialization] Reset events in gameStateModule.');
  }

  // Ensure settings exist
  sm.settings = sm.settings || {};

  sm._logDebug('[Initialization] loadFromJSON completed.');
}

/**
 * Validates JSON data structure
 *
 * @param {Object} jsonData - The JSON data to validate
 * @param {string} selectedPlayerId - The selected player ID
 * @throws {Error} If validation fails
 */
function validateJSONData(jsonData, selectedPlayerId) {
  if (!jsonData) {
    throw new Error('Invalid JSON data provided to loadFromJSON');
  }

  if (!selectedPlayerId) {
    throw new Error('loadFromJSON called without selectedPlayerId');
  }

  if (!jsonData.schema_version || jsonData.schema_version !== 3) {
    console.error(
      `[Initialization] Invalid JSON schema version: ${jsonData.schema_version}. Expected 3.`
    );
  }
}

/**
 * Loads player-specific data from JSON
 *
 * DATA FLOW:
 * Input: jsonData.items[playerId], jsonData.regions[playerId], etc.
 * Output: Populates stateManager.itemData, .regions, .locations, .exits
 *
 * @param {Object} sm - StateManager instance
 * @param {Object} jsonData - The JSON data
 * @param {string} selectedPlayerId - The player ID
 */
function loadPlayerData(sm, jsonData, selectedPlayerId) {
  // Load items and build name->ID map
  sm.itemData = jsonData.items?.[selectedPlayerId] || {};
  sm.itemNameToId = {};
  for (const id in sm.itemData) {
    if (Object.hasOwn(sm.itemData, id) && sm.itemData[id]?.name) {
      sm.itemNameToId[sm.itemData[id].name] = sm.itemData[id].id;
    }
  }
  sm._logDebug(
    `Loaded ${Object.keys(sm.itemNameToId).length} item IDs`
  );

  // Load regions as Map (Phase 3: Map optimization)
  const regionsObject = jsonData.regions?.[selectedPlayerId] || {};
  sm.regions.clear(); // Clear the Map initialized in constructor
  for (const [regionName, regionData] of Object.entries(regionsObject)) {
    sm.regions.set(regionName, regionData);
  }
  sm.originalRegionOrder = Array.from(sm.regions.keys());
  sm._logDebug(
    `Loaded ${sm.originalRegionOrder.length} regions into Map`
  );

  // Load dungeons as Map (Phase 3: Map optimization)
  const dungeonsObject = jsonData.dungeons?.[selectedPlayerId] || {};
  sm.dungeons.clear(); // Clear the Map initialized in constructor
  for (const [dungeonName, dungeonData] of Object.entries(dungeonsObject)) {
    sm.dungeons.set(dungeonName, dungeonData);
  }
  sm._logDebug(`Loaded ${sm.dungeons.size} dungeons into Map`);

  // Link regions to dungeons
  for (const [regionName, region] of sm.regions.entries()) {
    if (region.dungeon && sm.dungeons.has(region.dungeon)) {
      region.dungeon = sm.dungeons.get(region.dungeon);
    }
  }
  sm._logDebug('Linked regions to dungeon objects');

  // Load group data
  loadGroupData(sm, jsonData, selectedPlayerId);

  // Load other properties
  sm.startRegions = jsonData.start_regions?.[selectedPlayerId] || [];
  sm.mode = jsonData.mode?.[selectedPlayerId] || null;
  sm.itempoolCounts = jsonData.itempool_counts?.[selectedPlayerId] || {};
  sm.progressionMapping = jsonData.progression_mapping?.[selectedPlayerId] || {};
  sm.gameInfo = jsonData.game_info || {};

  // Initialize prog_items for games that use accumulated/progressive items
  // Structure: prog_items[playerId][itemName] = accumulated_count
  if (!sm.prog_items) {
    sm.prog_items = {};
  }
  if (!sm.prog_items[selectedPlayerId]) {
    sm.prog_items[selectedPlayerId] = {};
  }

  // Initialize accumulators from game_info metadata (generic for all games)
  const gameInfo = jsonData.game_info?.[selectedPlayerId];
  if (gameInfo?.prog_items_init) {
    for (const [accumulatorName, initialValue] of Object.entries(gameInfo.prog_items_init)) {
      if (!(accumulatorName in sm.prog_items[selectedPlayerId])) {
        sm.prog_items[selectedPlayerId][accumulatorName] = initialValue;
      }
    }
    sm._logDebug(`[Initialization] Initialized ${Object.keys(gameInfo.prog_items_init).length} prog_items accumulators from game_info`);
  }

  sm._logDebug('[Initialization] Initialized prog_items structure');

  // Load locations
  loadLocations(sm, selectedPlayerId);

  // Load exits
  loadExits(sm, selectedPlayerId);
}

/**
 * Loads group data with fallback logic
 *
 * @param {Object} sm - StateManager instance
 * @param {Object} jsonData - The JSON data
 * @param {string} selectedPlayerId - The player ID
 */
function loadGroupData(sm, jsonData, selectedPlayerId) {
  const playerSpecificGroupData = jsonData.item_groups?.[String(selectedPlayerId)];

  if (Array.isArray(playerSpecificGroupData)) {
    sm.groupData = playerSpecificGroupData;
  } else if (jsonData.groups && Array.isArray(jsonData.groups)) {
    sm.groupData = jsonData.groups;
    sm._logDebug(
      `Used global jsonData.groups for player ${selectedPlayerId}`
    );
  } else {
    sm.groupData = [];
    sm.logger.warn(
      'StateManager',
      `No valid group data found for player ${selectedPlayerId}`
    );
  }
}

/**
 * Loads and processes locations from regions
 *
 * DATA FLOW:
 * Input: Locations embedded in regions
 * Output: Flat locations array, originalLocationOrder, eventLocations map
 *
 * @param {Object} sm - StateManager instance
 * @param {string} selectedPlayerId - The player ID
 */
function loadLocations(sm, selectedPlayerId) {
  sm.locations.clear(); // Clear the Map initialized in constructor
  sm.locationNameToId = {};
  sm.eventLocations.clear();

  for (const regionName of sm.originalRegionOrder) {
    const region = sm.regions.get(regionName); // Use Map.get() instead of bracket notation
    if (!region) continue;

    if (region.locations && Array.isArray(region.locations)) {
      region.locations.forEach((locationDataItem) => {
        const descriptiveName = locationDataItem.name;

        if (!descriptiveName) {
          sm.logger.warn(
            'StateManager',
            `Location in region '${regionName}' missing name`,
            locationDataItem
          );
          return;
        }

        const locationObject = {
          ...locationDataItem,
          region: regionName,
          parent_region_name: regionName,
        };
        delete locationObject.parent_region;

        sm.locations.set(descriptiveName, locationObject); // Store in Map by name
        sm.originalLocationOrder.push(descriptiveName);

        // Track event locations
        // Event locations are those with event=true in their item
        // Look up the full item data from sm.itemData to get the event flag
        // Note: Must explicitly check === true to exclude items with event=false
        if (locationDataItem.item && locationDataItem.item.name) {
          const fullItemData = sm.itemData[locationDataItem.item.name];
          if (fullItemData && fullItemData.event === true) {
            sm.eventLocations.set(descriptiveName, locationObject);
          } else if (locationDataItem.id === null || locationDataItem.id === 0) {
            // Track local item locations (id: null or 0, but NOT events)
            // These are items like coins in DLCQuest that are auto-collected when region is accessible
            sm.localItemLocations.set(descriptiveName, locationObject);
          }
        }

        // Store location ID mapping
        sm.locationNameToId[descriptiveName] = locationDataItem.id ?? null;
      });
    }
  }

  sm._logDebug(
    `Processed ${sm.locations.size} locations into Map`
  );
}

/**
 * Loads and processes exits from regions
 *
 * DATA FLOW:
 * Input: Exits embedded in regions
 * Output: Flat exits array, originalExitOrder
 *
 * @param {Object} sm - StateManager instance
 * @param {string} selectedPlayerId - The player ID
 */
function loadExits(sm, selectedPlayerId) {
  sm.exits = [];
  sm._logDebug('[Initialization] Populating exits...');

  for (const regionName of sm.originalRegionOrder) {
    const regionObject = sm.regions.get(regionName); // Use Map.get() instead of bracket notation
    if (!regionObject) continue;

    if (regionObject.exits && Array.isArray(regionObject.exits)) {
      regionObject.exits.forEach((originalExitObject) => {
        if (!originalExitObject || !originalExitObject.name) {
          sm._logDebug(
            `Malformed exit in region '${regionName}'`,
            originalExitObject
          );
          return;
        }

        const connectedRegionValue = originalExitObject.connected_region;

        const processedExit = {
          name: originalExitObject.name,
          connectedRegion: connectedRegionValue,
          access_rule: originalExitObject.access_rule,
          parentRegion: regionName,
          player: originalExitObject.player !== undefined
            ? PlayerIdUtils.normalize(originalExitObject.player)
            : sm.playerId,
          type: originalExitObject.type || 'Exit',
        };

        sm.exits.push(processedExit);
      });
    }
  }

  sm.originalExitOrder = sm.exits.map((exit) => exit.name);
  sm._logDebug(
    `Processed ${sm.exits.length} exits`
  );
}

/**
 * Initializes game-specific logic module
 *
 * DATA FLOW:
 * Input: Game name from settings or rules
 * Output:
 *   - sm.logicModule: Selected game logic module
 *   - sm.helperFunctions: Game-specific helper functions
 *   - sm.gameStateModule: Initialized game state
 *   - sm.settings: Game settings
 *
 * @param {Object} sm - StateManager instance
 * @param {Object} jsonData - The JSON data
 * @param {string} selectedPlayerId - The player ID
 */
function initializeGameLogic(sm, jsonData, selectedPlayerId) {
  const gameSettingsFromFile = jsonData.settings?.[selectedPlayerId] || {};
  const gameName = gameSettingsFromFile.game || sm.rules?.game_name || 'UnknownGame';

  sm._logDebug(
    `[Initialization] Selecting logic module for game: "${gameName}"`
  );

  // Use centralized game logic selection
  const logic = getGameLogic(gameName);
  sm.logicModule = logic.logicModule;
  sm.helperFunctions = logic.helperFunctions;
  sm.stateMethods = logic.stateMethods; // For game-specific state methods (e.g., has_from_list_unique for Mario Land 2)

  // Initialize state
  sm.gameStateModule = sm.logicModule.initializeState();
  sm.gameStateModule = sm.logicModule.loadSettings(sm.gameStateModule, gameSettingsFromFile);

  // Set settings
  sm.settings = gameSettingsFromFile;
  sm.settings.game = gameName;

  sm.logger.info('StateManager', `Loaded logic module for: "${gameName}"`);

  // Clear legacy state
  sm.state = null;
  sm.helpers = null;
}

/**
 * Creates a canonical inventory instance
 *
 * DATA FLOW:
 * Input: sm.itemData (all available items)
 * Output: Plain object {itemName: 0, ...} (all items initialized to 0)
 *
 * @param {Object} sm - StateManager instance
 * @param {string} gameName - The game name
 * @returns {Object} Canonical inventory object
 */
export function createInventoryInstance(sm, gameName) {
  sm._logDebug(
    `[Initialization] Creating canonical inventory for: ${gameName}`
  );

  const canonicalInventory = {};

  if (sm.itemData) {
    for (const itemName in sm.itemData) {
      if (Object.hasOwn(sm.itemData, itemName)) {
        canonicalInventory[itemName] = 0;
      }
    }
  }

  return canonicalInventory;
}

/**
 * Loads shop data if applicable
 *
 * @param {Object} sm - StateManager instance
 * @param {Object} jsonData - The JSON data
 * @param {string} selectedPlayerId - The player ID
 */
function loadShops(sm, jsonData, selectedPlayerId) {
  if (jsonData.shops && jsonData.shops[selectedPlayerId] && sm.logicModule) {
    if (typeof sm.logicModule.loadShops === 'function') {
      sm.gameStateModule = sm.logicModule.loadShops(
        sm.gameStateModule,
        jsonData.shops[selectedPlayerId]
      );
      sm.logger.info('StateManager', `Shops loaded for ${sm.settings?.game}`);
    }
  }
}

/**
 * Processes starting items for the player
 *
 * DATA FLOW:
 * Input: jsonData.starting_items[playerId] (array of item names)
 * Processing: Uses batch mode to add items efficiently
 * Output: Items added to inventory, initial reachability computed
 *
 * @param {Object} sm - StateManager instance
 * @param {Object} jsonData - The JSON data
 * @param {string} selectedPlayerId - The player ID
 */
function processStartingItems(sm, jsonData, selectedPlayerId) {
  const startingItems = jsonData.starting_items?.[selectedPlayerId] || [];

  if (startingItems && startingItems.length > 0) {
    sm.logger.info(
      'StateManager',
      `Adding ${startingItems.length} starting items for player ${selectedPlayerId}`
    );

    sm.beginBatchUpdate(true);

    startingItems.forEach((itemName) => {
      // itemData is indexed by item name
      if (sm.itemData?.[itemName]) {
        sm.addItemToInventory(itemName);
      } else {
        sm.logger.warn(
          'StateManager',
          `Starting item '${itemName}' not found in itemData`
        );
      }
    });

    sm.commitBatchUpdate();
  } else {
    // No starting items, ensure initial computation
    if (sm._batchMode) {
      sm.commitBatchUpdate();
    } else if (!sm.cacheValid) {
      sm.logger.info('StateManager', 'No starting items, ensuring initial computation');
      sm.computeReachableRegions();
    }
  }
}

/**
 * Applies initial settings to the StateManager instance
 *
 * @param {Object} sm - StateManager instance
 * @param {Object} settingsObject - The settings to apply
 */
export function applySettings(sm, settingsObject) {
  sm.settings = settingsObject;
  sm.logger.info('StateManager', 'Settings applied:', sm.settings);
}
