/**
 * State Persistence Module
 *
 * Handles state snapshot generation, persistence, and restoration for StateManager.
 * This module manages:
 * - Snapshot generation and transmission
 * - Runtime state application (from server or JSON export)
 * - State clearing and reset operations
 * - Static game data provisioning
 *
 * Data Flow:
 *
 * Snapshot Generation (getSnapshot):
 *   Input: Current StateManager state
 *     ├─> this.inventory (current items)
 *     ├─> this.knownReachableRegions (reachability cache)
 *     ├─> this.checkedLocations (checked locations set)
 *     ├─> this.gameStateModule (game-specific state)
 *
 *   Processing:
 *     ├─> Recompute reachability if cache invalid
 *     ├─> Build inventory snapshot (copy)
 *     ├─> Build region reachability map
 *     ├─> Build location reachability map
 *
 *   Output: Snapshot object
 *     ├─> inventory: {itemName: count}
 *     ├─> regionReachability: {regionName: 'reachable'|'unreachable'}
 *     ├─> locationReachability: {locationName: 'reachable'|'unreachable'|'checked'}
 *     ├─> flags, events, player info, game info
 *
 * Static Data (getStaticGameData):
 *   Input: StateManager data structures
 *     ├─> this.locations (Map of locations)
 *     ├─> this.regions (Map of regions)
 *     ├─> this.dungeons (Map of dungeons)
 *     ├─> this.itemData, this.groupData
 *
 *   Output: Static game data object
 *     ├─> locations, regions, dungeons (as Maps)
 *     ├─> itemData, groupData, progressionMapping
 *     ├─> ID mappings, original orders
 *
 * Runtime State Application (applyRuntimeState):
 *   Input: Payload from server or JSON export
 *     ├─> serverCheckedLocationNames (array)
 *     ├─> receivedItemsForProcessing (array)
 *     ├─> inventory (object) - JSON export format
 *     ├─> checkedLocations (array) - JSON export format
 *
 *   Processing:
 *     ├─> Reset or preserve inventory based on resetInventory flag
 *     ├─> Apply server checked locations
 *     ├─> Add received items
 *     ├─> Or restore from JSON export format
 *     ├─> Recompute reachability
 *
 *   Output: Updated StateManager state
 *     ├─> Inventory updated
 *     ├─> Checked locations updated
 *     ├─> Cache invalidated and recomputed
 *     ├─> Snapshot sent to proxy
 *
 * Phase 4 Refactoring Notes:
 * - Extracted from stateManager.js to separate concerns
 * - Maintains all existing APIs for compatibility
 * - Works with Maps from Phase 3 optimizations
 * - Handles both server updates and JSON export/import
 *
 * @module stateManager/core/statePersistence
 */

import { initializeGameLogic, getGameLogic } from '../../shared/gameLogic/gameLogicRegistry.js';
import { DEFAULT_PLAYER_ID } from '../../shared/playerIdUtils.js';
import { buildSubstitutionMaps, getDisplayName } from '../../shared/nameSubstitutions.js';

// Module-level helper for logging
function log(level, message, ...data) {
  console[level === 'info' ? 'log' : level]?.(message, ...data);
}

/**
 * Generates a complete state snapshot for transmission to the proxy
 *
 * @param {Object} sm - StateManager instance
 * @returns {Object} Snapshot object containing all dynamic state
 */
export function getSnapshot(sm) {
  // Don't recompute reachability during helper execution to prevent circular recursion
  if (!sm.cacheValid && !sm._inHelperExecution) {
    sm._logDebug(
      '[StateManager getSnapshot] Cache invalid, recomputing reachability...'
    );
    sm.computeReachableRegions();
  }

  // 1. Inventory
  let inventorySnapshot = {};
  if (sm.inventory) {
    // In canonical format, inventory is already a plain object with all items
    inventorySnapshot = { ...sm.inventory };
  } else {
    log(
      'warn',
      `[StateManager getSnapshot] Inventory is not available. Snapshot inventory may be empty.`
    );
  }

  // 2. Region Reachability
  const regionReachability = {};
  if (sm.regions) {
    for (const regionName of sm.regions.keys()) {
      if (sm.knownReachableRegions.has(regionName)) {
        regionReachability[regionName] = 'reachable';
      } else {
        regionReachability[regionName] = sm.knownUnreachableRegions.has(
          regionName
        )
          ? 'unreachable'
          : 'unreachable';
      }
    }
  }

  // 3. Location Reachability
  const locationReachability = {};
  if (sm.locations) {
    for (const loc of sm.locations.values()) {
      if (sm.isLocationChecked(loc.name)) {
        locationReachability[loc.name] = 'checked';
      } else if (!sm._inHelperExecution && sm.isLocationAccessible(loc)) {
        // Skip location accessibility check during helper execution to prevent recursion
        locationReachability[loc.name] = 'reachable';
      } else if (!sm._inHelperExecution) {
        // Only mark as unreachable if we actually checked accessibility
        locationReachability[loc.name] = 'unreachable';
      }
      // During helper execution, we don't set locationReachability for unchecked locations
      // This prevents incorrect 'unreachable' status during rule evaluation
    }
  }

  // 4. LocationItems - REMOVED: Now in static data
  // 5. eventLocations - REMOVED: Now in static data

  // Increment snapshot counter
  sm.snapshotCount++;

  // 6. Get game-specific state if the module provides getStateForSnapshot
  let gameSpecificState = {};
  if (sm.logicModule && typeof sm.logicModule.getStateForSnapshot === 'function') {
    try {
      gameSpecificState = sm.logicModule.getStateForSnapshot(sm.gameStateModule || {});
    } catch (error) {
      log('warn', '[StateManager getSnapshot] Error calling getStateForSnapshot:', error);
      // Fallback to default game state extraction
      gameSpecificState = {
        flags: sm.gameStateModule?.flags || [],
        events: sm.gameStateModule?.events || [],
      };
    }
  } else {
    // Fallback for games without getStateForSnapshot
    gameSpecificState = {
      flags: sm.gameStateModule?.flags || [],
      events: sm.gameStateModule?.events || [],
    };
  }

  // 7. Assemble Snapshot
  // REFACTOR: Duplication removed - using single source of truth for all fields
  const snapshot = {
    snapshotCount: sm.snapshotCount,
    inventory: inventorySnapshot,
    // Merge game-specific state (flags, events, and any other game-specific fields like age)
    ...gameSpecificState,
    checkedLocations: Array.from(sm.checkedLocations || []),
    // REFACTOR: Separated region and location reachability to prevent name conflicts
    regionReachability: regionReachability,
    locationReachability: locationReachability,
    // serverProvidedUncheckedLocations: Array.from(sm.serverProvidedUncheckedLocations || []), // Optionally expose if UI needs it directly
    player: {
      name: sm.settings?.playerName || `Player ${sm.playerId}`,
      id: sm.playerId,
      slot: sm.playerId, // Deprecated: use 'id' instead
      team: sm.team, // Assuming sm.team exists on StateManager
    },
    game: sm.rules?.game_name || sm.settings?.game || 'Unknown', // Single game identifier
    // All games now use gameStateModule data
    difficultyRequirements: sm.gameStateModule?.difficultyRequirements,
    shops: sm.gameStateModule?.shops,
    gameMode: sm.gameStateModule?.gameMode || sm.mode,
    // REFACTOR: Add missing properties for canonical state
    debugMode: sm.debugMode || false,
    autoCollectEventsEnabled: sm.autoCollectEventsEnabled !== false, // Default true
    startRegions: sm.startRegions || [],
    // Progressive items tracking (used by games like DLCQuest for coin accumulation)
    prog_items: sm.prog_items || {},

    // Note: We don't include progressionMapping, itemData, groupData, etc. here
    // because they are static data already available in staticDataCache
  };

  // REFACTOR: Debug logging for snapshot structure
  if (sm.debugMode) {
    log(
      'info',
      '[StateManager getSnapshot] Snapshot structure:',
      {
        snapshotCount: snapshot.snapshotCount,
        game: snapshot.game,
        inventoryItemCount: Object.keys(snapshot.inventory).length,
        flagsCount: snapshot.flags.length,
        checkedLocationsCount: snapshot.checkedLocations.length,
        eventsCount: snapshot.events.length,
        regionReachabilityCount: Object.keys(snapshot.regionReachability).length,
        locationReachabilityCount: Object.keys(snapshot.locationReachability).length,
      }
    );
  }

  return snapshot;
}

/**
 * Sends a state snapshot update via the communication channel
 *
 * @param {Object} sm - StateManager instance
 * @private
 */
export function _sendSnapshotUpdate(sm) {
  if (sm.postMessageCallback) {
    try {
      const snapshot = getSnapshot(sm);
      if (snapshot) {
        sm.postMessageCallback({
          type: 'stateSnapshot',
          snapshot: snapshot,
        });
        sm._logDebug('[StateManager Class] Sent stateSnapshot update.');
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
    // No callback - worker mode not active or not configured
  }
}

/**
 * Creates a snapshot-like interface from the StateManager instance
 * Used for internal rule evaluation (like isLocationAccessible)
 *
 * @param {Object} sm - StateManager instance
 * @param {Object} contextVariables - Optional context variables (e.g., { location: currentLocation })
 * @returns {Object} Snapshot interface with helper methods
 */
export function _createSelfSnapshotInterface(sm, contextVariables = {}) {
  const anInterface = {
    _isSnapshotInterface: true,
    hasItem: (itemName) => {
      // Use game-specific 'has' helper if available (handles progressive items)
      // This ensures Progressive Shield → Mirror Shield resolution works correctly
      if (sm.helperFunctions && typeof sm.helperFunctions.has === 'function') {
        try {
          // Create a minimal snapshot for the helper
          const snapshot = {
            inventory: sm.inventory,
            flags: sm.gameStateModule?.flags || [],
            events: sm.gameStateModule?.events || [],
            player: { id: sm.playerId, slot: sm.playerId },
            prog_items: sm.prog_items  // Include prog_items for state counter games
          };
          // Include all game-specific data needed by helpers (e.g., Pokemon local_poke_data)
          const staticData = {
            progressionMapping: sm.progressionMapping,
            // Also include snake_case with player key for generic helpers
            progression_mapping: { [sm.playerId]: sm.progressionMapping },
            items: sm.itemData,
            game_info: sm.gameInfo,
            settings: sm.settings,
            playerId: sm.playerId
          };
          return sm.helperFunctions.has(snapshot, staticData, itemName);
        } catch (e) {
          // Fallback to direct inventory check if helper fails
          sm.logger?.warn?.('StatePersistence', `Error using game-specific has helper for ${itemName}:`, e);
          return sm._hasItem(itemName);
        }
      }
      // Fallback to direct inventory check if no helper available
      return sm._hasItem(itemName);
    },
    countItem: (itemName) => {
      // Use game-specific 'count' helper if available (handles progressive items)
      if (sm.helperFunctions && typeof sm.helperFunctions.count === 'function') {
        try {
          const snapshot = {
            inventory: sm.inventory,
            flags: sm.gameStateModule?.flags || [],
            events: sm.gameStateModule?.events || [],
            player: { id: sm.playerId, slot: sm.playerId },
            prog_items: sm.prog_items  // Include prog_items for state counter games
          };
          // Include all game-specific data needed by helpers (e.g., Pokemon local_poke_data)
          const staticData = {
            progressionMapping: sm.progressionMapping,
            // Also include snake_case with player key for generic helpers
            progression_mapping: { [sm.playerId]: sm.progressionMapping },
            items: sm.itemData,
            game_info: sm.gameInfo,
            settings: sm.settings,
            playerId: sm.playerId
          };

          return sm.helperFunctions.count(snapshot, staticData, itemName);
        } catch (e) {
          sm.logger?.warn?.('StatePersistence', `Error using game-specific count helper for ${itemName}:`, e);
          return sm._countItem(itemName);
        }
      }
      return sm._countItem(itemName);
    },
    hasGroup: (groupName) => sm._hasGroup(groupName),
    countGroup: (groupName) => sm._countGroup(groupName),
    getTotalItemCount: () => {
      // Count total items across all item types in inventory
      let totalCount = 0;
      if (sm.inventory) {
        for (const itemName in sm.inventory) {
          totalCount += sm.inventory[itemName] || 0;
        }
      }
      return totalCount;
    },
    // Flags check gameStateModule for ALTTP, state for others
    hasFlag: (flagName) =>
      sm.checkedLocations.has(flagName) ||
      (sm.gameStateModule && sm.logicModule && typeof sm.logicModule.hasFlag === 'function'
        ? sm.logicModule.hasFlag(sm.gameStateModule, flagName)
        : (sm.state &&
          typeof sm.state.hasFlag === 'function' &&
          sm.state.hasFlag(flagName))),
    getSetting: (settingName) => {
      const playerIdKey = String(sm.playerId);
      let rawValue;

      // Check world data (new structure) or settings (legacy) if available
      // sm.world and sm.settings now point to the same object for backwards compatibility
      const worldData = sm.world || sm.settings;
      if (worldData) {
        // Check if world data is keyed by player ID (multiworld case)
        // JSON keys are always strings, so convert playerId to string for lookup
        let worldToUse = worldData;
        if (worldData[playerIdKey] && typeof worldData[playerIdKey] === 'object') {
          worldToUse = worldData[playerIdKey];
        }
        // First check direct lookup at top level (includes runtime attributes in new structure)
        rawValue = worldToUse[settingName];
        // If not found at top level, check inside 'options' object
        // Many settings like dk_coins_for_gyrocopter are nested in options
        if (rawValue === undefined && worldToUse?.options) {
          rawValue = worldToUse.options[settingName];
        }
      }

      // Legacy fallback: check world_attributes for computed runtime values
      // In new structure, these are merged into 'world' directly, but check here for backwards compatibility
      if (rawValue === undefined && sm.rules?.world_attributes) {
        let worldAttrsToUse = sm.rules.world_attributes;
        // Check if world_attributes is keyed by player ID
        if (worldAttrsToUse[playerIdKey] && typeof worldAttrsToUse[playerIdKey] === 'object') {
          worldAttrsToUse = worldAttrsToUse[playerIdKey];
        }
        rawValue = worldAttrsToUse?.[settingName];
      }

      // Special case: item_name_groups needs to be constructed dynamically
      // This is needed for world_attribute rules that reference item_name_groups
      // (used by helpers like has_relic_combo in AHIT)
      if (rawValue === undefined && settingName === 'item_name_groups') {
        const gameInfo = sm.gameInfo?.[playerIdKey] || sm.gameInfo || {};
        rawValue = {
          ...(sm.groupData || {}),
          ...(gameInfo.relic_groups || {})
        };
      }

      // Normalize "off"/"none" type strings to falsy values
      // Choice options in Python use 0 for "off"/"none" which get exported as strings
      if (typeof rawValue === 'string') {
        const lowerValue = rawValue.toLowerCase();
        if (lowerValue === 'off' || lowerValue === 'none' || lowerValue === 'false' || lowerValue === '') {
          return 0;
        }
      }
      return rawValue;
    },
    getAllSettings: () => sm.settings,
    isRegionReachable: (regionName) => sm.isRegionReachable(regionName),
    isRegionAccessible: (regionName) => sm.isRegionReachable(regionName), // Alias for isRegionReachable
    isLocationChecked: (locName) => sm.isLocationChecked(locName),
    isLocationAccessible: (locationOrName) => {
      // Check if a location is accessible (reachable and rules pass)
      const locationName = typeof locationOrName === 'string' ? locationOrName : locationOrName?.name;
      if (!locationName) return undefined;

      // Find the location data
      const location = sm.locations.get(locationName);
      if (!location) return undefined;

      // Check if the parent region is reachable
      const regionName = location.region;
      if (!regionName) return undefined;

      const parentRegionIsReachable = sm.isRegionReachable(regionName);
      if (parentRegionIsReachable === undefined) return undefined;
      if (parentRegionIsReachable === false) return false;

      // If no access rule, location is accessible if region is reachable
      if (!location.access_rule) return true;

      // Evaluate the access rule
      // Create a context with the location set via contextVariables
      const locationContext = sm._createSelfSnapshotInterface({ location, currentLocation: location });

      return sm.evaluateRuleFromEngine(location.access_rule, locationContext);
    },
    executeHelper: (name, ...args) => {
      // Just delegate to the new centralized method
      return sm.executeHelper(name, ...args);
    },
    executeStateManagerMethod: (name, ...args) => {
      return sm.executeStateMethod(name, ...args);
    },
    getCurrentRegion: () => sm.currentRegionName,
    getAllItems: () => sm.itemData,
    getAllLocations: () => Array.from(sm.locations.values()),
    getAllRegions: () => sm.regions,
    getPlayerId: () => sm.playerId,
    getPlayerSlot: () => sm.playerId, // Deprecated: use getPlayerId
    helpers: sm.helpers,
    resolveName: (name) => {
      // Check context variables first (e.g., 'location' when evaluating location access rules)
      if (contextVariables && Object.prototype.hasOwnProperty.call(contextVariables, name)) {
        return contextVariables[name];
      }

      // Standard constants
      if (name === 'True') return true;
      if (name === 'False') return false;
      if (name === 'None') return null;

      // Player ID
      if (name === 'player') return sm.playerId;

      // World object (commonly used in helper functions)
      if (name === 'world') {
        // sm.world contains world data (game, options, runtime attributes)
        // sm.settings is an alias for backwards compatibility
        // The structure has game options nested under world.options
        const worldData = sm.world || sm.settings;
        let worldToUse = worldData;
        // Check if world is keyed by player ID (multiworld case)
        if (worldData?.[sm.playerId] && typeof worldData[sm.playerId] === 'object') {
          worldToUse = worldData[sm.playerId];
        }
        const gameOptions = worldToUse?.options || worldToUse || {};

        // Get game-specific info from game_info (e.g., AHIT hat_yarn_costs)
        const playerIdKey = String(sm.playerId);
        const gameInfo = sm.gameInfo?.[playerIdKey] || sm.gameInfo || {};

        // Build the world object with game-specific properties
        // item_name_groups comes from multiple sources:
        // - sm.itemGroups for standard item groups
        // - gameInfo.relic_groups for AHIT relic combos
        const itemNameGroups = {
          ...(sm.itemGroups?.[playerIdKey] || sm.itemGroups || {}),
          ...(gameInfo.relic_groups || {})
        };

        const worldObj = {
          player: sm.playerId,
          options: gameOptions,
          // Include item_name_groups for helpers like has_relic_combo
          item_name_groups: itemNameGroups
        };

        // In new structure, world attributes are directly on worldToUse
        // Copy all attributes except 'options' and 'option_definitions' which are handled separately
        if (worldToUse) {
          for (const [key, value] of Object.entries(worldToUse)) {
            if (key !== 'options' && key !== 'option_definitions' && key !== 'game' && !(key in worldObj)) {
              worldObj[key] = value;
            }
          }
        }

        // Legacy fallback: check world_attributes for older exports
        if (sm.rules?.world_attributes) {
          let worldAttrs = sm.rules.world_attributes;
          // Check if world_attributes is keyed by player ID
          if (worldAttrs[playerIdKey] && typeof worldAttrs[playerIdKey] === 'object') {
            worldAttrs = worldAttrs[playerIdKey];
          }
          Object.assign(worldObj, worldAttrs);
        }

        // Merge in game-specific properties from game_info
        // For AHIT: hat_yarn_costs, hat_craft_order come from hat_info
        if (gameInfo.hat_info) {
          worldObj.hat_yarn_costs = gameInfo.hat_info.hat_yarn_costs || {};
          worldObj.hat_craft_order = gameInfo.hat_info.hat_craft_order || [];
        }

        // For other game-specific properties, spread them onto world
        if (gameInfo.variables) {
          Object.assign(worldObj, gameInfo.variables);
        }

        return worldObj;
      }

      // Logic object (game-specific helper functions)
      if (name === 'logic') {
        // Get game-specific helpers from the game logic module
        // For multiworld, use the player-specific game from world data instead of the top-level game_name
        const worldData = sm.world || sm.settings;
        let gameName = sm.rules?.game_name;
        if (gameName === 'Multiworld' && worldData?.game) {
          gameName = worldData.game;
        }
        if (gameName) {
          const gameLogic = getGameLogic(gameName);
          if (gameLogic && gameLogic.helperFunctions) {
            // Create a logic object with all helper functions bound to receive (snapshot, staticData, ...args)
            // Note: We create the snapshot/staticData lazily inside each function to avoid recursion
            // Instead, create a minimal snapshot object
            const logicObject = {};

            for (const [helperName, helperFunction] of Object.entries(gameLogic.helperFunctions)) {
              logicObject[helperName] = (...args) => {
                // Create a lightweight snapshot for the helper
                // We can't call getSnapshot() here because it might trigger recursion
                // Instead, create a minimal snapshot object
                const snapshot = {
                  inventory: { ...sm.inventory },
                  flags: sm.gameStateModule?.flags || [],
                  events: sm.gameStateModule?.events || [],
                  checkedLocations: Array.from(sm.checkedLocations || [])
                };
                const staticData = getStaticGameData(sm);
                return helperFunction(snapshot, staticData, ...args);
              };
            }
            return logicObject;
          }
        }
        return undefined;
      }

      // Current location being evaluated (for location access rules)
      if (name === 'location') {
        return anInterface.currentLocation || anInterface.location;
      }

      // Parent region being evaluated (for exit access rules)
      if (name === 'parent_region') return anInterface.parent_region;

      // Game-specific entities (e.g., 'old_man') from helpers.entities
      if (
        sm.helpers &&
        sm.helpers.entities &&
        typeof sm.helpers.entities === 'object' &&
        Object.prototype.hasOwnProperty.call(sm.helpers.entities, name)
      ) {
        return sm.helpers.entities[name];
      }

      // Core StateManager components often accessed by rules
      if (name === 'inventory') return sm.inventory; // The inventory instance
      // Return gameStateModule with optional game-specific transformation
      if (name === 'state') {
        let stateObject;
        if (sm.gameStateModule && sm.settings?.game) {
          // Check if the game has a custom state builder hook
          const gameLogic = getGameLogic(sm.settings.game);
          if (gameLogic?.stateModule?.buildStateWithMultiworld) {
            stateObject = gameLogic.stateModule.buildStateWithMultiworld(
              sm.gameStateModule,
              sm.settings,
              sm.playerId
            );
          } else {
            // Fallback: return gameStateModule as-is
            stateObject = sm.gameStateModule;
          }
        } else {
          stateObject = sm.state; // For other games, return the state instance
        }

        // Always include prog_items in the state object for games that use it
        // This allows rules to access state.prog_items[playerId][itemName]
        if (sm.prog_items && Object.keys(sm.prog_items).length > 0) {
          return {
            ...stateObject,
            prog_items: sm.prog_items
          };
        }

        return stateObject;
      }
      if (name === 'settings') return sm.settings; // The settings object for the current game
      // Note: 'helpers' itself is usually not resolved by name directly in rules this way,
      // rather its methods are called via 'helper' or 'state_method' rule types,
      // or its entities are resolved as above. Exposing it directly could be an option if specific rules need it.
      // if (name === 'helpers') return sm.helpers;

      // Checked locations are often used as flags (covered by hasFlag, but direct access if needed)
      if (name === 'flags') return sm.checkedLocations; // The Set of checked location names

      // Static data from StateManager
      if (name === 'regions') return sm.regions;
      if (name === 'locations') return sm.locations; // The flat array of all location objects
      if (name === 'items') return sm.itemData; // Item definitions
      if (name === 'groups') return sm.groupData; // Item group definitions

      // Fallback: if 'name' is a direct method or property on the helpers object
      if (
        sm.helpers &&
        Object.prototype.hasOwnProperty.call(sm.helpers, name)
      ) {
        const helperProp = sm.helpers[name];
        if (typeof helperProp === 'function') {
          // Bind to helpers context if it's a function from helpers
          return helperProp.bind(sm.helpers);
        }
        return helperProp; // Return property value
      }

      // If the name refers to a setting property directly (already covered by getSetting)
      // but direct name resolution might be expected by some rules.
      if (
        sm.settings &&
        Object.prototype.hasOwnProperty.call(sm.settings, name)
      ) {
        return sm.settings[name];
      }

      // Check if this is a game-specific variable (e.g., required_technologies for Factorio)
      // These are stored in game_info[playerId].variables in the rules.json
      const staticData = getStaticGameData(sm);
      const currentPlayerId = sm.playerId || DEFAULT_PLAYER_ID;
      // Normalize to string for JSON object key lookup (JSON keys are always strings)
      const currentPlayerIdStr = String(currentPlayerId);
      if (staticData?.game_info?.[currentPlayerIdStr]?.variables &&
          staticData.game_info[currentPlayerIdStr].variables[name]) {
        return staticData.game_info[currentPlayerIdStr].variables[name];
      }

      // Check if there's a helper function that computes this value
      // SC2 uses this for power_rating which is computed from inventory state
      // IMPORTANT: Only call helpers directly if they take no extra args (beyond snapshot, staticData)
      // Helpers that require additional arguments (like graffiti_spots with movestyle, limit, etc.)
      // must be called via executeHelper with their args properly evaluated
      // Also skip helpers that have optional parameters (function.length doesn't count defaults)
      const gameName = sm.rules?.game_name;
      if (gameName) {
        const gameLogic = getGameLogic(gameName);
        const computedHelpers = gameLogic?.helperFunctions;
        // Get the set of helpers with optional args that should NOT be called directly
        const helpersWithOptionalArgs = gameLogic?.helpersWithOptionalArgs || new Set();
        if (computedHelpers) {
          // Try exact match first (e.g., 'power_rating' -> power_rating helper)
          // Only call directly if:
          // 1. The function takes at most 2 params (snapshot, staticData)
          // 2. The helper is NOT in the helpersWithOptionalArgs set (has optional params)
          if (typeof computedHelpers[name] === 'function'
              && computedHelpers[name].length <= 2
              && !helpersWithOptionalArgs.has(name)) {
            // Create a snapshot for the helper that includes regionReachability
            // Some helpers (like lingo_can_use_level_2_location) need to check which regions are reachable
            const regionReachability = {};
            if (sm.regions) {
              for (const regionName of sm.regions.keys()) {
                if (sm.knownReachableRegions.has(regionName)) {
                  regionReachability[regionName] = 'reachable';
                } else {
                  regionReachability[regionName] = 'unreachable';
                }
              }
            }
            const snapshot = {
              inventory: sm.inventory,
              flags: sm.gameStateModule?.flags || [],
              events: sm.gameStateModule?.events || [],
              player: { id: sm.playerId, slot: sm.playerId },
              checkedLocations: Array.from(sm.checkedLocations || []),
              regionReachability: regionReachability
            };
            const staticData = getStaticGameData(sm);
            return computedHelpers[name](snapshot, staticData);
          }
          // Try with game-specific prefixes if defined (e.g., 'power_rating' -> 'terran_power_rating' for SC2)
          const prefixes = gameLogic.helperPrefixes || [];
          for (const prefix of prefixes) {
            const prefixedName = prefix + name;
            if (typeof computedHelpers[prefixedName] === 'function'
                && computedHelpers[prefixedName].length <= 2
                && !helpersWithOptionalArgs.has(prefixedName)) {
              // Create a snapshot for the helper that includes regionReachability
              const regionReachability = {};
              if (sm.regions) {
                for (const regionName of sm.regions.keys()) {
                  if (sm.knownReachableRegions.has(regionName)) {
                    regionReachability[regionName] = 'reachable';
                  } else {
                    regionReachability[regionName] = 'unreachable';
                  }
                }
              }
              const snapshot = {
                inventory: sm.inventory,
                flags: sm.gameStateModule?.flags || [],
                events: sm.gameStateModule?.events || [],
                player: { id: sm.playerId, slot: sm.playerId },
                checkedLocations: Array.from(sm.checkedLocations || []),
                regionReachability: regionReachability
              };
              const staticData = getStaticGameData(sm);
              return computedHelpers[prefixedName](snapshot, staticData);
            }
          }
        }
      }

      // Game-specific location variable extraction hook
      // For variables not found elsewhere, try to extract from current location name
      const currentLoc = anInterface.currentLocation || anInterface.location;
      if (currentLoc && currentLoc.name) {
        const locationName = currentLoc.name;
        const gameName = sm.rules?.game_name;

        if (gameName) {
          const gameLogic = getGameLogic(gameName);
          const selectedHelpers = gameLogic?.helperFunctions;

          // Check if the game has a custom extractor for this variable
          const extractorName = `extract${name.charAt(0).toUpperCase()}${name.slice(1)}`;
          if (selectedHelpers && typeof selectedHelpers[extractorName] === 'function') {
            const extractedValue = selectedHelpers[extractorName](locationName);
            if (extractedValue !== null && extractedValue !== undefined) {
              return extractedValue;
            }
          }
        }
      }

      // log('warn', `[StateManager SelfSnapshotInterface resolveName] Unhandled name: ${name}`);
      return undefined; // Crucial: return undefined for unhandled names
    },
    // Static data accessors (mirroring proxy's snapshot interface)
    get staticData() {
      return getStaticGameData(sm);
    },
    getStaticData: () => getStaticGameData(sm),
    // Get item placed at a location (for placement_lookup rules)
    getLocationItem: (locationName) => {
      // Get location from StateManager's locations Map
      const location = sm.locations.get(locationName);
      if (!location || !location.item) return undefined;
      return {
        name: location.item.name,
        player: location.item.player || sm.playerId
      };
    },
    // Resolve attributes with special handling for parent_region
    resolveAttribute: (baseObject, attributeName) => {
      if (
        baseObject &&
        typeof baseObject === 'object' &&
        Object.prototype.hasOwnProperty.call(baseObject, attributeName)
      ) {
        const attrValue = baseObject[attributeName];
        if (typeof attrValue === 'function') {
          return attrValue.bind(baseObject);
        }
        return attrValue;
      }

      // Handle location.parent_region -> get actual region object
      if (attributeName === 'parent_region') {
        let regionName = null;

        // Try different ways to get the region name
        if (baseObject.region) {
          regionName = baseObject.region;
        } else if (baseObject.parent_region_name) {
          regionName = baseObject.parent_region_name;
        }

        if (regionName) {
          // Look up the actual region object from sm.regions
          if (sm.regions && sm.regions.has(regionName)) {
            return sm.regions.get(regionName);
          }
        }

        return undefined;
      }

      // Handle region.dungeon -> get actual dungeon object (not just the name)
      // Note: The rule engine tries direct property access first, which returns the string dungeon name
      // We need to intercept this to return the actual dungeon object
      if (attributeName === 'dungeon' && baseObject && typeof baseObject.dungeon === 'string') {
        const dungeonName = baseObject.dungeon;
        // Look up the actual dungeon object from sm.dungeons
        if (sm.dungeons && sm.dungeons instanceof Map && sm.dungeons.has(dungeonName)) {
          return sm.dungeons.get(dungeonName);
        }
        // Also try plain object access if not a Map
        if (sm.dungeons && !(sm.dungeons instanceof Map) && sm.dungeons[dungeonName]) {
          return sm.dungeons[dungeonName];
        }
        return undefined;
      }

      // Handle dungeonString.boss -> treat string as dungeon name and look up boss
      // This handles the case where region.dungeon returns a string instead of a dungeon object
      if (attributeName === 'boss' && typeof baseObject === 'string') {
        // baseObject is a dungeon name string, look up the dungeon first
        let dungeon = null;
        if (sm.dungeons && sm.dungeons instanceof Map && sm.dungeons.has(baseObject)) {
          dungeon = sm.dungeons.get(baseObject);
        } else if (sm.dungeons && !(sm.dungeons instanceof Map) && sm.dungeons[baseObject]) {
          dungeon = sm.dungeons[baseObject];
        }
        if (dungeon && dungeon.bosses) {
          // Return the main boss (keyed by "None" or first available)
          if (dungeon.bosses['None']) {
            return dungeon.bosses['None'];
          }
          const bossKeys = Object.keys(dungeon.bosses);
          if (bossKeys.length > 0) {
            return dungeon.bosses[bossKeys[0]];
          }
        }
        return undefined;
      }

      // Handle dungeon.boss -> get the main boss object (when dungeon is already an object)
      if (attributeName === 'boss' && baseObject && typeof baseObject === 'object' && baseObject.bosses) {
        // Return the "None" keyed boss (main boss) or the first boss if "None" doesn't exist
        if (baseObject.bosses['None']) {
          return baseObject.bosses['None'];
        }
        // Fallback: return the first boss
        const bossKeys = Object.keys(baseObject.bosses);
        if (bossKeys.length > 0) {
          return baseObject.bosses[bossKeys[0]];
        }
        return undefined;
      }

      return undefined;
    },
  };

  // NOTE: We do NOT expose helpers as direct properties here to avoid recursion issues.
  // Helpers should be called through executeHelper() which properly manages state.

  // Spread contextVariables onto the interface so properties like currentLocation
  // are directly accessible (needed by ruleEngine's get_location handler)
  // Also include prog_items and playerId for prog_item_count rule evaluation
  return {
    ...anInterface,
    ...contextVariables,
    prog_items: sm.prog_items || {},
    playerId: sm.playerId
  };
}

/**
 * Returns static game data that doesn't change during gameplay
 * This includes location/item ID mappings, original orders, etc.
 *
 * @param {Object} sm - StateManager instance
 * @returns {Object} Static game data object
 */
export function getStaticGameData(sm) {
  // Phase 3.2: Build locationItems map from location data as a Map
  const locationItemsMap = new Map();
  if (sm.locations) {
    for (const loc of sm.locations.values()) {
      if (
        loc.item &&
        typeof loc.item.name === 'string' &&
        typeof loc.item.player === 'number'
      ) {
        locationItemsMap.set(loc.name, {
          name: loc.item.name,
          player: loc.item.player,
          advancement: loc.item.advancement, // Include advancement flag
          type: loc.item.type, // Include item type
        });
      } else if (loc.item && typeof loc.item.name === 'string') {
        // Handle items without player field (single-player games)
        locationItemsMap.set(loc.name, {
          name: loc.item.name,
          player: loc.item.player, // May be undefined for single-player
          advancement: loc.item.advancement,
          type: loc.item.type,
        });
      } else if (loc.item) {
        locationItemsMap.set(loc.name, null);
      } else {
        locationItemsMap.set(loc.name, null);
      }
    }
  }

  // Build name substitution maps and enrich objects with displayName
  const nameSubstitutions = sm.rules?.world?.[sm.playerId]?.name_substitutions;
  const subMaps = buildSubstitutionMaps(nameSubstitutions);

  // Add .displayName to each location object
  if (sm.locations) {
    for (const loc of sm.locations.values()) {
      loc.displayName = getDisplayName(subMaps.locations, loc.name);
    }
  }

  // Add .displayName to each item object
  if (sm.itemData) {
    for (const [itemName, itemObj] of Object.entries(sm.itemData)) {
      if (itemObj && typeof itemObj === 'object') {
        itemObj.displayName = getDisplayName(subMaps.items, itemName);
      }
    }
  }

  // Add .displayName to each region object and its embedded location objects
  if (sm.regions) {
    for (const region of sm.regions.values()) {
      region.displayName = getDisplayName(subMaps.regions, region.name);
      // Region.locations is a separate array of location objects (not the same refs as sm.locations)
      if (region.locations) {
        for (const loc of region.locations) {
          loc.displayName = getDisplayName(subMaps.locations, loc.name);
        }
      }
    }
  }

  // Add .displayName to locationItemsMap entries
  for (const [locName, itemInfo] of locationItemsMap) {
    if (itemInfo) {
      itemInfo.displayName = getDisplayName(subMaps.items, itemInfo.name);
    }
  }

  // Phase 3.2: Return Maps directly instead of converting to arrays
  // Helper functions (like location_item_name) are already designed to handle Maps
  return {
    game_name: sm.rules?.game_name,
    game_directory: sm.rules?.game_directory,
    playerId: sm.playerId, // String player ID
    locations: sm.locations || new Map(),  // Return Map directly
    regions: sm.regions || new Map(),      // Return Map directly
    exits: sm.exits,
    dungeons: sm.dungeons || new Map(),    // Return Map directly
    items: sm.itemData,  // Direct access for UI components
    itemsByPlayer: { [sm.playerId]: sm.itemData },  // Provide items indexed by player ID for stateInterface
    itemData: sm.itemData,  // Keep for backwards compatibility
    groups: sm.groupData,
    groupData: sm.groupData,
    item_groups: { [sm.playerId]: sm.groupData },  // Provide item_groups for stateInterface.countGroup
    progressionMapping: sm.progressionMapping,
    progression_mapping: sm.rules?.progression_mapping,  // Add snake_case version for compatibility with game helpers
    itempoolCounts: sm.itempoolCounts,
    startRegions: sm.startRegions,
    mode: sm.mode,
    // Game-specific information
    game_info: sm.gameInfo,
    // World data - player options and runtime attributes keyed by player ID
    world: sm.rules?.world,  // Full world object (game, options, runtime attributes) keyed by player ID
    exporter: sm.rules?.exporter,  // Exporter-specific settings (keyed by player ID for multiworld)
    world_attributes: sm.rules?.world_attributes,  // Legacy: now merged into world
    helpers: sm.rules?.helpers,  // Helper function definitions (keyed by player ID for multiworld)
    // Starting items (precollected items)
    starting_items: sm.rules?.starting_items,
    // ID mappings
    locationNameToId: sm.locationNameToId,
    itemNameToId: sm.itemNameToId,
    // Original orders for consistency
    originalLocationOrder: sm.originalLocationOrder,
    originalRegionOrder: sm.originalRegionOrder,
    originalExitOrder: sm.originalExitOrder,
    // Event locations
    eventLocations: Object.fromEntries(sm.eventLocations || new Map()),
    // Location items mapping (Phase 3.2: Keep as Map)
    locationItems: locationItemsMap,
    // Name substitution maps (items, locations, regions)
    nameSubstitutionMaps: subMaps
  };
}

/**
 * Applies runtime state from external source (server or JSON export)
 * Handles both full resets and incremental updates
 *
 * @param {Object} sm - StateManager instance
 * @param {Object} payload - State payload containing inventory, checked locations, etc.
 */
export function applyRuntimeState(sm, payload) {
  sm._logDebug(
    '[StateManager applyRuntimeState] Received payload:',
    payload
  );

  // Check if this is a full reset or incremental update
  const isFullReset = payload.resetInventory !== false; // Default to true for backward compatibility

  sm._logDebug(
    `[StateManager applyRuntimeState] ${isFullReset ? 'Full reset' : 'Incremental update'} mode`
  );

  // 1. Reset game-specific state only for full resets
  if (isFullReset && sm.settings) {
    // Fallback: Re-create state if reset is not available but settings are
    const gameSettings = sm.settings;
    const determinedGameName = gameSettings.game || sm.rules?.game_name;

    // Use centralized game logic selection for runtime state reset
    const logic = getGameLogic(determinedGameName);
    sm.logicModule = logic.logicModule;
    sm.helperFunctions = logic.helperFunctions;

    // Re-initialize using selected logic module
    sm.gameStateModule = sm.logicModule.initializeState();
    sm.gameStateModule = sm.logicModule.loadSettings(sm.gameStateModule, gameSettings);

    // All games now use gameStateModule - no legacy GameState needed
    sm.state = null;
    sm._logDebug(
      '[StateManager applyRuntimeState] Game-specific state (sm.state) set to null - using gameStateModule only.'
    );
  } else if (isFullReset) {
    log(
      'warn',
      '[StateManager applyRuntimeState] Could not reset or re-initialize game-specific state (sm.state).'
    );
  }

  // 2. Reset inventory only for full resets
  if (isFullReset) {
    const gameNameForInventory = sm.settings
      ? sm.settings.game
      : sm.rules?.game_name || 'UnknownGame';
    sm.inventory = sm._createInventoryInstance(gameNameForInventory);
    sm._logDebug(
      `[StateManager applyRuntimeState] Inventory re-initialized via _createInventoryInstance for ${gameNameForInventory}.`
    );
    // In canonical format, itemData and groupData are accessed from StateManager instance directly
    // No need to assign them to inventory object

    // Re-add starting items (precollected items like keycards in SMZ3 when Keysanity is off)
    // These should always be present after a reset, just like at initial load
    const startingItems = sm.rules?.starting_items?.[sm.playerId] || [];
    if (startingItems.length > 0) {
      sm._logDebug(
        `[StateManager applyRuntimeState] Re-adding ${startingItems.length} starting items for player ${sm.playerId}`
      );
      startingItems.forEach((itemName) => {
        if (sm.itemData?.[itemName]) {
          sm._addItemToInventory(itemName, 1);
        } else {
          log(
            'warn',
            `[StateManager applyRuntimeState] Starting item '${itemName}' not found in itemData`
          );
        }
      });
    }
  } else {
    sm._logDebug(
      '[StateManager applyRuntimeState] Preserving existing inventory (incremental update).'
    );
  }

  // 3. Clear pathfinding cache and related structures
  sm.indirectConnections = new Map();
  sm.invalidateCache(); // This clears knownReachableRegions, path, blockedConnections, sets cacheValid = false
  sm._logDebug(
    '[StateManager applyRuntimeState] Pathfinding cache and indirect connections cleared.'
  );

  // 4. Process Server Checked Locations
  if (
    payload.serverCheckedLocationNames &&
    Array.isArray(payload.serverCheckedLocationNames)
  ) {
    if (isFullReset) {
      // For full reset (initial connection), replace checked locations with server's authoritative list
      sm.checkedLocations = new Set(payload.serverCheckedLocationNames);
      sm._logDebug(
        `[StateManager applyRuntimeState] Replaced checked locations with server authoritative list: ${payload.serverCheckedLocationNames.length} locations`
      );
    } else {
      // For incremental updates, merge new locations with existing ones
      let changed = false;
      payload.serverCheckedLocationNames.forEach((name) => {
        if (sm.checkedLocations && !sm.checkedLocations.has(name)) {
          sm.checkedLocations.add(name);
          changed = true;
        }
      });

      if (changed) {
        sm._logDebug(
          `[StateManager applyRuntimeState] Merged ${payload.serverCheckedLocationNames.length
          } server checked locations. New total: ${sm.checkedLocations ? sm.checkedLocations.size : 'undefined'
          }`
        );
      } else {
        sm._logDebug(
          `[StateManager applyRuntimeState] No new server checked locations to add. Total remains: ${sm.checkedLocations ? sm.checkedLocations.size : 'undefined'
          }`
        );
      }
    }
  } else {
    sm._logDebug(
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
    if (!sm.inventory) {
      log(
        'warn',
        '[StateManager applyRuntimeState] Inventory is unexpectedly null/undefined before processing received items.'
      );
    } else {
      let itemsProcessedCount = 0;
      payload.receivedItemsForProcessing.forEach((itemDetail) => {
        if (itemDetail && itemDetail.itemName) {
          sm._addItemToInventory(itemDetail.itemName, 1);
          itemsProcessedCount++;
        }
      });
      if (itemsProcessedCount > 0) {
        sm._logDebug(
          `[StateManager applyRuntimeState] Added ${itemsProcessedCount} items from payload to inventory.`
        );
      }
    }
  }

  // 7. Process JSON Export Format (inventory object + checkedLocations array)
  if (payload.inventory && typeof payload.inventory === 'object') {
    sm._logDebug(
      '[StateManager applyRuntimeState] Processing JSON export format - inventory object'
    );
    if (!sm.inventory) {
      log(
        'warn',
        '[StateManager applyRuntimeState] Inventory is unexpectedly null/undefined before processing JSON export inventory.'
      );
    } else {
      // Replace inventory from JSON format (restorative, not additive)
      // Clear existing inventory items by setting them to 0
      for (const existingItemName in sm.inventory) {
        if (sm.inventory[existingItemName] > 0) {
          sm.inventory[existingItemName] = 0;
        }
      }
      // Then set the imported inventory items
      for (const [itemName, quantity] of Object.entries(payload.inventory)) {
        if (typeof quantity === 'number' && quantity > 0) {
          // Set the inventory item directly to the specified quantity
          sm.inventory[itemName] = quantity;
          sm._logDebug(
            `[StateManager applyRuntimeState] Set inventory[${itemName}] to ${sm.inventory[itemName]}`
          );
        }
      }
      sm._logDebug(
        `[StateManager applyRuntimeState] Applied ${Object.keys(payload.inventory).length} inventory items from JSON format`
      );
    }
  }

  if (payload.checkedLocations && Array.isArray(payload.checkedLocations)) {
    sm._logDebug(
      '[StateManager applyRuntimeState] Processing JSON export format - checkedLocations array'
    );
    // Replace checked locations from JSON format (restorative, not additive)
    sm.checkedLocations = new Set(payload.checkedLocations);
    sm._logDebug(
      `[StateManager applyRuntimeState] Replaced checked locations with JSON format. Total: ${sm.checkedLocations.size}`
    );
  }

  // 6. Finalize state and send snapshot
  if (!sm.batchUpdateActive) {
    sm._logDebug(
      '[StateManager applyRuntimeState] Not in batch mode. Recomputing regions and sending snapshot.'
    );
    sm.computeReachableRegions(); // InvalidateCache was called, so this will fully recompute
    _sendSnapshotUpdate(sm);
    sm.isModified = false;
  } else {
    sm._logDebug(
      '[StateManager applyRuntimeState] In batch mode. Computation and snapshot deferred. Marking as modified.'
    );
    sm.isModified = true; // Resetting inventory/state and potentially locations implies modifications.
  }
}

/**
 * Clears all state and resets to initial condition
 * Re-initializes inventory and game-specific state
 *
 * @param {Object} sm - StateManager instance
 * @param {Object} options - Options object
 * @param {boolean} options.recomputeAndSendUpdate - Whether to recompute and send snapshot (default: true)
 */
export function clearState(sm, options = { recomputeAndSendUpdate: true }) {
  // Re-initialize inventory - canonical format: reset all items to 0
  if (sm.inventory) {
    // First, clear all items currently in inventory (including unknown/event items)
    for (const itemName in sm.inventory) {
      if (Object.hasOwn(sm.inventory, itemName)) {
        sm.inventory[itemName] = 0;
      }
    }

    // Also ensure all items in itemData are set to 0 (in case they weren't in inventory yet)
    if (sm.itemData) {
      for (const itemName in sm.itemData) {
        if (Object.hasOwn(sm.itemData, itemName)) {
          sm.inventory[itemName] = 0;
        }
      }
    }

    // Also ensure virtual progression items are cleared
    if (sm.progressionMapping) {
      for (const virtualItemName in sm.progressionMapping) {
        sm.inventory[virtualItemName] = 0;
      }
    }

    // Also clear prog_items accumulator values (for games like DLCQuest that track coins)
    if (sm.prog_items) {
      for (const playerId in sm.prog_items) {
        if (Object.hasOwn(sm.prog_items, playerId)) {
          for (const itemName in sm.prog_items[playerId]) {
            if (Object.hasOwn(sm.prog_items[playerId], itemName)) {
              sm.prog_items[playerId][itemName] = 0;
            }
          }
        }
      }
    }

    // Re-initialize prog_items from prog_items_init (e.g., for precollected coins)
    const gameInfo = sm.gameInfo?.[sm.playerId];
    if (gameInfo?.prog_items_init && sm.prog_items) {
      const playerId = sm.playerId;
      if (!sm.prog_items[playerId]) {
        sm.prog_items[playerId] = {};
      }
      for (const [accumulatorName, initialValue] of Object.entries(gameInfo.prog_items_init)) {
        sm.prog_items[playerId][accumulatorName] = initialValue;
      }
      sm._logDebug(`[clearState] Re-initialized prog_items from prog_items_init`);
    }
  } else if (!sm.inventory) {
    // If inventory doesn't exist, create it
    sm.inventory = sm._createInventoryInstance(
      sm.settings ? sm.settings.game : sm.rules?.game_name || 'UnknownGame'
    );
  }

  // Re-initialize game-specific state using dynamic logic modules
  if (sm.settings) {
    const gameSettings = sm.settings;

    // Use centralized game logic selection
    const logic = initializeGameLogic({
      gameName: sm.rules?.game_name,
      settings: gameSettings,
      worldClass: null // Not available in this context
    });

    sm.logicModule = logic.logicModule;
    sm.helperFunctions = logic.helperFunctions;

    // Re-initialize using selected logic module
    sm.gameStateModule = sm.logicModule.initializeState();
    sm.gameStateModule = sm.logicModule.loadSettings(sm.gameStateModule, gameSettings);

    // All games now use gameStateModule - no legacy state system needed
    sm.state = null;
  } else {
    // Fallback if no settings to determine game type - use generic logic
    log('warn', '[clearState] No settings available for game type determination, using generic logic');
    const logic = getGameLogic('Generic');
    sm.logicModule = logic.logicModule;
    sm.helperFunctions = logic.helperFunctions;
    sm.gameStateModule = sm.logicModule.initializeState();
    sm.state = null;
  }

  sm.clearCheckedLocations({ sendUpdate: false }); // Call quietly

  sm.indirectConnections = new Map();
  sm.invalidateCache();
  sm._logDebug(
    '[StateManager Class] Internal state structures cleared by clearState.'
  );

  if (options.recomputeAndSendUpdate) {
    sm._logDebug(
      '[StateManager Class] clearState recomputing and sending snapshot.'
    );
    sm.computeReachableRegions();
    _sendSnapshotUpdate(sm);
  }
}

/**
 * Removes all event items from inventory while preserving other state
 * Useful for testing scenarios where you want to reset auto-collected events
 * without clearing manually collected items or checked locations
 * Also unchecks event locations so they can be checked again during testing
 *
 * @param {Object} sm - StateManager instance
 * @param {Object} options - Options object
 * @param {boolean} options.recomputeAndSendUpdate - Whether to recompute and send snapshot (default: true)
 */
export function clearEventItems(sm, options = { recomputeAndSendUpdate: true }) {
  if (!sm.inventory || !sm.itemData) {
    sm._logDebug('[StateManager] Cannot clear event items: inventory or itemData not available');
    return;
  }

  // Items that should never be cleared (managed by game-specific hooks)
  const preservedItems = new Set([
    'Received Progression Item',    // Stardew Valley - cumulative progression count
    'Received Progression Percent',  // Stardew Valley - computed from progression count
  ]);

  // Remove all event items from inventory and uncheck their locations
  for (const itemName in sm.itemData) {
    // Skip preserved items that are managed by game-specific hooks
    if (preservedItems.has(itemName)) {
      sm._logDebug(`[StateManager] Preserving hook-managed event item: ${itemName}`);
      continue;
    }

    if (sm.itemData[itemName]?.event || sm.itemData[itemName]?.id === 0 || sm.itemData[itemName]?.id === null) {
      if (sm.inventory[itemName] > 0) {
        sm._logDebug(`[StateManager] Clearing event item: ${itemName}`);
        sm.inventory[itemName] = 0;
      }
    }
  }

  // Uncheck all event locations so they can be checked again during testing
  if (sm.eventLocations) {
    for (const eventLocation of sm.eventLocations.values()) {
      if (sm.checkedLocations.has(eventLocation.name)) {
        sm._logDebug(`[StateManager] Unchecking event location: ${eventLocation.name}`);
        sm.checkedLocations.delete(eventLocation.name);
      }
    }
  }

  sm.invalidateCache();

  if (options.recomputeAndSendUpdate) {
    sm.computeReachableRegions();
    _sendSnapshotUpdate(sm);
  }
}
