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
 *     ├─> Convert eventLocations Map to object
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
 */

import { initializeGameLogic, getGameLogic } from '../../shared/gameLogic/gameLogicRegistry.js';

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

  // 5. Convert eventLocations Map to plain object
  const eventLocationsObject = {};
  if (sm.eventLocations && sm.eventLocations instanceof Map) {
    for (const [
      locationName,
      locationData,
    ] of sm.eventLocations.entries()) {
      eventLocationsObject[locationName] = locationData;
    }
  }

  // 6. Assemble Snapshot
  // REFACTOR: Duplication removed - using single source of truth for all fields
  const snapshot = {
    inventory: inventorySnapshot,
    // All games now use gameStateModule flags
    flags: sm.gameStateModule?.flags || [],
    checkedLocations: Array.from(sm.checkedLocations || []),
    // REFACTOR: Separated region and location reachability to prevent name conflicts
    regionReachability: regionReachability,
    locationReachability: locationReachability,
    // serverProvidedUncheckedLocations: Array.from(sm.serverProvidedUncheckedLocations || []), // Optionally expose if UI needs it directly
    player: {
      name: sm.settings?.playerName || `Player ${sm.playerSlot}`,
      slot: sm.playerSlot,
      team: sm.team, // Assuming sm.team exists on StateManager
    },
    game: sm.rules?.game_name || sm.settings?.game || 'Unknown', // Single game identifier
    // All games now use gameStateModule data
    difficultyRequirements: sm.gameStateModule?.difficultyRequirements,
    shops: sm.gameStateModule?.shops,
    gameMode: sm.gameStateModule?.gameMode || sm.mode,
    events: sm.gameStateModule?.events || [],
    // REFACTOR: Add missing properties for canonical state
    debugMode: sm.debugMode || false,
    autoCollectEventsEnabled: sm.autoCollectEventsEnabled !== false, // Default true
    eventLocations: eventLocationsObject,
    startRegions: sm.startRegions || ['Menu'],

    // Note: We don't include progressionMapping, itemData, groupData, etc. here
    // because they are static data already available in staticDataCache
  };

  // REFACTOR: Debug logging for snapshot structure
  if (sm.debugMode) {
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
 * @returns {Object} Snapshot interface with helper methods
 */
export function _createSelfSnapshotInterface(sm) {
  const anInterface = {
    _isSnapshotInterface: true,
    hasItem: (itemName) => sm._hasItem(itemName),
    countItem: (itemName) => sm._countItem(itemName),
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
    getSetting: (settingName) =>
      sm.settings ? sm.settings[settingName] : undefined,
    getAllSettings: () => sm.settings,
    isRegionReachable: (regionName) => sm.isRegionReachable(regionName),
    isLocationChecked: (locName) => sm.isLocationChecked(locName),
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
    getPlayerSlot: () => sm.playerSlot,
    helpers: sm.helpers,
    resolveName: (name) => {
      // Standard constants
      if (name === 'True') return true;
      if (name === 'False') return false;
      if (name === 'None') return null;

      // Player slot
      if (name === 'player') return sm.playerSlot;

      // World object (commonly used in helper functions)
      if (name === 'world') {
        return {
          player: sm.playerSlot,
          options: sm.settings?.[sm.playerSlot] || sm.settings || {}
        };
      }

      // Logic object (game-specific helper functions)
      if (name === 'logic') {
        // Get game-specific helpers from the game logic module
        const gameName = sm.rules?.game_name;
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
      // Return gameStateModule for ALTTP, state for others
      if (name === 'state') {
        if (sm.gameStateModule && sm.settings?.game === 'A Link to the Past') {
          // For ALTTP, return a state object that includes the multiworld structure for compatibility with Python rules
          return {
            ...sm.gameStateModule,
            multiworld: {
              worlds: {
                [sm.playerSlot]: {
                  options: {
                    ...sm.settings // Include all settings as options (now properly exported from Python)
                  }
                }
              }
            }
          };
        } else {
          return sm.state; // For other games, return the state instance
        }
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

      // log('warn', `[StateManager SelfSnapshotInterface resolveName] Unhandled name: ${name}`);
      return undefined; // Crucial: return undefined for unhandled names
    },
    // Static data accessors (mirroring proxy's snapshot interface)
    get staticData() {
      return getStaticGameData(sm);
    },
    getStaticData: () => getStaticGameData(sm),
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

      return undefined;
    },
  };

  // NOTE: We do NOT expose helpers as direct properties here to avoid recursion issues.
  // Helpers should be called through executeHelper() which properly manages state.

  return anInterface;
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
        });
      } else if (loc.item) {
        locationItemsMap.set(loc.name, null);
      } else {
        locationItemsMap.set(loc.name, null);
      }
    }
  }

  // Phase 3.2: Return Maps directly instead of converting to arrays
  // Helper functions (like location_item_name) are already designed to handle Maps
  return {
    game_name: sm.rules?.game_name,
    game_directory: sm.rules?.game_directory,
    playerId: String(sm.playerSlot),
    locations: sm.locations || new Map(),  // Return Map directly
    regions: sm.regions || new Map(),      // Return Map directly
    exits: sm.exits,
    dungeons: sm.dungeons || new Map(),    // Return Map directly
    items: sm.itemData,  // Direct access for UI components
    itemsByPlayer: { [String(sm.playerSlot)]: sm.itemData },  // Provide items indexed by player slot for stateInterface
    itemData: sm.itemData,  // Keep for backwards compatibility
    groups: sm.groupData,
    groupData: sm.groupData,
    item_groups: { [String(sm.playerSlot)]: sm.groupData },  // Provide item_groups for stateInterface.countGroup
    progressionMapping: sm.progressionMapping,
    itempoolCounts: sm.itempoolCounts,
    startRegions: sm.startRegions,
    mode: sm.mode,
    // Game-specific information
    game_info: sm.gameInfo,
    settings: sm.rules?.settings,
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
    locationItems: locationItemsMap
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

  // Remove all event items from inventory and uncheck their locations
  for (const itemName in sm.itemData) {
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
