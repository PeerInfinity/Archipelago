/**
 * State Snapshot Interface - Thread-Agnostic Context Creation
 *
 * This module creates SnapshotInterface objects that provide a unified API for rule
 * evaluation regardless of thread context. The same interface works identically in
 * both the web worker (StateManager) and main thread (UI components).
 *
 * **THREAD-AGNOSTIC DESIGN**:
 * This file runs in BOTH thread contexts without modification:
 * - **Worker Thread**: Called by StateManager to create context for rule evaluation
 * - **Main Thread**: Called by UI components to evaluate rules on cached snapshots
 *
 * The key to thread-agnostic design:
 * - No StateManager dependencies - works with pure data (snapshot + staticData)
 * - Thread-aware logging (detects window object)
 * - Pure functional approach - no side effects
 * - Game logic selection via gameLogicRegistry (thread-agnostic)
 *
 * **DATA FLOW - WORKER THREAD PATH**:
 *
 * StateManager.checkLocation() [worker thread]:
 *   Input: Location needs accessibility check
 *   ↓
 * StateManager._createSelfSnapshotInterface():
 *   Processing:
 *     ├─> Calls getSnapshot() to get current state
 *     │     └─> Returns: { inventory, flags, events, regionReachability, player, ... }
 *     ├─> Calls getStaticGameData() to get static data
 *     │     └─> Returns: { items, regions, locations, world, exporter, progressionMapping, ... }
 *     ├─> Calls createSnapshotInterface(snapshot, staticData, contextVars)
 *     │
 *   Output: SnapshotInterface object
 *   ↓
 * createSnapshotInterface() [THIS FILE] (worker thread):
 *   Input:
 *     ├─> snapshot: Current game state from StateManager
 *     │     └─> { inventory: Map, flags: [], events: [], regionReachability: {}, ... }
 *     ├─> staticData: Static game data from StateManager
 *     │     └─> { items: Map, regions: Map, locations: Map, world: {}, exporter: {}, ... }
 *     ├─> contextVariables: Optional context (e.g., { location: currentLocation })
 *     │
 *   Processing:
 *     ├─> Detects game from staticData.game_name or snapshot.game
 *     ├─> Gets helper functions from gameLogicRegistry.getGameLogic(gameName)
 *     │     └─> Returns: { logicModule, helperFunctions } for detected game
 *     ├─> Creates interface object with methods:
 *     │     ├─> executeHelper(name, ...args):
 *     │     │     └─> helperFunctions[name](snapshot, staticData, ...args)
 *     │     ├─> hasItem(itemName):
 *     │     │     └─> Delegates to game-specific has() helper
 *     │     ├─> countItem(itemName):
 *     │     │     └─> Delegates to game-specific count() helper
 *     │     ├─> isRegionReachable(regionName):
 *     │     │     └─> Returns snapshot.regionReachability[regionName]
 *     │     ├─> isLocationAccessible(locationName):
 *     │     │     └─> Evaluates location.access_rule with evaluateRule()
 *     │     ├─> getStaticData():
 *     │     │     └─> Returns { items, groups, locations, regions, dungeons }
 *     │     └─> resolveName(name):
 *     │           └─> Resolves Python names (True/False/None/state/self/world/etc.)
 *     │
 *   Output: SnapshotInterface object
 *     └─> { _isSnapshotInterface: true, executeHelper(), hasItem(), countItem(), ... }
 *   ↓
 * StateManager.evaluateRuleFromEngine(rule, snapshotInterface):
 *   Processing: Passes interface to ruleEngine.evaluateRule()
 *   ↓
 * ruleEngine.evaluateRule(rule, snapshotInterface):
 *   Processing:
 *     ├─> Calls snapshotInterface.executeHelper('has', 'Progressive Sword')
 *     │     └─> Interface calls helperFunctions.has(snapshot, staticData, 'Progressive Sword')
 *     │           └─> Worker-side data (live StateManager instance data)
 *     │
 *   Output: boolean result
 *
 * **DATA FLOW - MAIN THREAD PATH**:
 *
 * LocationUI.updateLocationDisplay() [main thread]:
 *   Input: Need to render location cards with accessibility
 *   ↓
 * LocationUI gets cached data:
 *   Processing:
 *     ├─> const snapshot = stateManager.getLatestStateSnapshot()
 *     │     └─> Returns CACHED snapshot from proxy (no worker call)
 *     ├─> const staticData = stateManager.getStaticData()
 *     │     └─> Returns CACHED static data from proxy (no worker call)
 *     ├─> const snapshotInterface = createSnapshotInterface(snapshot, staticData)
 *     │
 *   Output: SnapshotInterface object
 *   ↓
 * createSnapshotInterface() [THIS FILE] (main thread):
 *   Input:
 *     ├─> snapshot: Cached snapshot from proxy
 *     │     └─> { inventory: {}, flags: [], events: [], regionReachability: {}, ... }
 *     ├─> staticData: Cached static data from proxy
 *     │     └─> { items: Map, regions: Map, locations: Map, world: {}, exporter: {}, ... }
 *     ├─> contextVariables: Optional context (e.g., { location: locationObj })
 *     │
 *   Processing:
 *     ├─> Detects game from staticData.game_name or snapshot.game
 *     ├─> Gets helper functions from gameLogicRegistry.getGameLogic(gameName)
 *     │     └─> SAME game logic as worker thread!
 *     ├─> Creates interface object with methods:
 *     │     ├─> executeHelper(name, ...args):
 *     │     │     └─> helperFunctions[name](snapshot, staticData, ...args)
 *     │     │           └─> Uses CACHED data, not live StateManager
 *     │     ├─> hasItem(itemName):
 *     │     │     └─> Delegates to game-specific has() helper
 *     │     │           └─> Checks CACHED snapshot.inventory
 *     │     ├─> isRegionReachable(regionName):
 *     │     │     └─> Returns CACHED snapshot.regionReachability[regionName]
 *     │     └─> ... (all other methods work the same way)
 *     │
 *   Output: SnapshotInterface object (identical structure to worker thread)
 *   ↓
 * LocationUI.evaluateRule(location.access_rule, snapshotInterface):
 *   Processing: Passes interface to ruleEngine.evaluateRule()
 *   ↓
 * ruleEngine.evaluateRule(rule, snapshotInterface):
 *   Processing:
 *     ├─> Calls snapshotInterface.executeHelper('has', 'Progressive Sword')
 *     │     └─> Interface calls helperFunctions.has(snapshot, staticData, 'Progressive Sword')
 *     │           └─> Main-thread data (cached from proxy)
 *     │
 *   Output: boolean result
 *   ↓
 * LocationUI:
 *   Processing: Uses result to set CSS class on location card
 *   Output: DOM element rendered with correct styling
 *
 * **KEY DIFFERENCE BETWEEN PATHS**:
 *
 * Worker Thread:
 *   ├─> Data source: Live StateManager instance
 *   ├─> snapshot: Fresh from getSnapshot()
 *   ├─> staticData: Direct from StateManager properties
 *   └─> Evaluation triggers reachability computation
 *
 * Main Thread:
 *   ├─> Data source: Cached from StateManagerProxy
 *   ├─> snapshot: Last snapshot posted by worker
 *   ├─> staticData: Cached when rules were loaded
 *   └─> Evaluation is read-only (no state changes)
 *
 * **SNAPSHOT INTERFACE API**:
 * The interface object provides these methods:
 * - executeHelper(name, ...args): Execute game-specific helper function
 * - hasItem(itemName): Check if player has item (calls game's has() helper)
 * - countItem(itemName): Get item quantity (calls game's count() helper)
 * - countGroup(groupName): Count items in group
 * - getTotalItemCount(): Count all items in inventory
 * - isRegionReachable(regionName): Check region reachability
 * - isLocationAccessible(locationName): Check location accessibility
 * - getStaticData(): Get static game data reference
 * - resolveName(name): Resolve Python variable names
 * - resolveAttribute(obj, attr): Resolve object attributes
 * - getRegionData(regionName): Get region object
 * - getLocationItem(locationName): Get item at location
 * - executeStateManagerMethod(method, ...args): Execute StateManager methods
 *
 * **HELPER FUNCTION SIGNATURE**:
 * All game-specific helper functions follow this signature:
 *   helperFunction(snapshot, staticData, ...args)
 *
 * Example:
 *   has(snapshot, staticData, itemName) {
 *     return (snapshot.inventory[itemName] || 0) > 0;
 *   }
 *
 * **ARCHITECTURE NOTES**:
 * - Stateless functional design - no instance state
 * - Game logic loaded dynamically via gameLogicRegistry
 * - Context variables allow passing location/exit context for self-referential rules
 * - Progressive item mapping support
 * - Helper functions attached directly to interface for compatibility
 *
 * @module shared/snapshotInterface
 * @see ruleEngine.js - Uses this interface for rule evaluation
 * @see gameLogicRegistry.js - Provides game-specific helper functions
 * @see stateManager/stateManager.js - Creates interface in worker thread
 */

// frontend/modules/shared/snapshotInterface.js

import { evaluateRule, resolveHelperScope } from './ruleEngine.js';
import { getGameLogic } from './gameLogic/gameLogicRegistry.js';
import { helperFunctions as genericLogic } from './gameLogic/generic/genericLogic.js';
import { DEFAULT_PLAYER_ID } from './playerIdUtils.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('snapshotInterface', message, ...data);
  } else {
    // In worker context, only log ERROR and WARN levels to keep console clean
    if (level === 'error' || level === 'warn') {
      const consoleMethod =
        console[level === 'info' ? 'log' : level] || console.log;
      consoleMethod(`[snapshotInterface] ${message}`, ...data);
    }
  }
}

// Helper function to get game-specific helper functions
function getHelperFunctions(gameName) {
  if (!gameName) {
    return genericLogic; // Default to generic (genericLogic IS the helperFunctions object)
  }

  const gameLogic = getGameLogic(gameName);
  return gameLogic.helperFunctions || genericLogic;
}

/**
 * Get state methods for a game
 * @param {string} gameName - The name of the game
 * @returns {Object} Object containing game-specific state methods, or empty object if none
 */
function getStateMethods(gameName) {
  if (!gameName) {
    return {}; // No state methods for generic
  }

  const gameLogic = getGameLogic(gameName);
  return gameLogic.stateMethods || {};
}

/**
 * Creates an interface object suitable for main-thread rule evaluation
 * based on the latest cached snapshot data.
 * @param {object | null} snapshot - The raw state snapshot from the worker (or null if not available).
 * @param {object | null} staticData - The cached static data (items, groups, etc.).
 * @param {object} contextVariables - Optional context variables (e.g., { location: currentLocation }).
 * @returns {object} - An object conforming to the StateSnapshotInterface.
 */
export function createSnapshotInterface(
  snapshot,
  staticData,
  contextVariables = {},
  stateManager = null
) {
  // Legacy snapshotHelpersInstance removed - using agnostic helpers directly
  let gameName = staticData?.game_name || snapshot?.game; // Get game name from static data or snapshot

  // In multiworld mode, get the player-specific game name
  // The overall game_name will be "Multiworld", but each player has their own game
  if (gameName === 'Multiworld') {
    const rawPlayerId = snapshot?.player?.id || snapshot?.player?.slot ||
                     staticData?.playerId || contextVariables?.playerId || DEFAULT_PLAYER_ID;
    // Normalize to string since world keys are strings ('1', '2', etc.)
    const playerId = String(rawPlayerId);
    if (staticData?.world?.[playerId]?.game) {
      gameName = staticData.world[playerId].game;
    }
  }

  function findLocationDataInStatic(locationName) {
    if (!staticData) return null;

    // staticData.locations is always a Map after initialization
    if (staticData.locations) {
      const location = staticData.locations.get(locationName);
      if (location) return location;
    }

    // Search in regions if not found in flat locations
    // staticData.regions is always a Map after initialization
    if (staticData.regions) {
      for (const [regionNameKey, region] of staticData.regions.entries()) {
        if (region.locations && Array.isArray(region.locations)) {
          const foundLoc = region.locations.find(
            (l) => l.name === locationName
          );
          if (foundLoc) {
            return {
              ...foundLoc,
              region: regionNameKey,
              parent_region_name: regionNameKey,
            };
          }
        }
      }
    }
    return null;
  }

  const rawInterfaceForHelpers = {
    _isSnapshotInterface: true,
    snapshot: snapshot,
    staticData: staticData,
    resolveName: (name) => {
      // Check context variables first (e.g., 'location' when evaluating location access rules)
      if (
        contextVariables &&
        Object.prototype.hasOwnProperty.call(contextVariables, name)
      ) {
        return contextVariables[name];
      }

      switch (name) {
        case 'True':
          return true;
        case 'False':
          return false;
        case 'None':
          return null;
        case 'inventory':
          return snapshot?.inventory;
        case 'settings': {
          // Return current player's world data (game, options, runtime attributes)
          // This allows helpers to reference settings.X directly for player-specific values
          // 'settings' is kept as an alias for backwards compatibility with 'world'
          const settingsPlayerId = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || contextVariables?.playerId || DEFAULT_PLAYER_ID;
          return staticData?.world?.[settingsPlayerId] || staticData?.world || {};
        }
        case 'flags':
          return snapshot?.flags;
        case 'state':
          // Return snapshot, optionally wrapped by game-specific logic
          if (!snapshot) return {};

          // Check if the game has a custom wrapState function
          const gameLogicForState = getGameLogic(gameName);
          if (gameLogicForState.wrapState) {
            return gameLogicForState.wrapState(snapshot);
          }

          // Default: return snapshot as-is
          return snapshot;
        case 'self':
          // In Python rules, 'self' refers to the game's rules class instance
          // which has attributes like nerf_roc_wing from the world options
          // We return the world data for the current player from staticData
          const selfPlayerId = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || contextVariables?.playerId || DEFAULT_PLAYER_ID;
          return staticData?.world?.[selfPlayerId] || staticData?.world || {};
        case 'regions':
          return staticData?.regions;
        case 'locations':
          // Return Map directly or fall back to object
          return staticData?.locations;
        case 'items':
          return staticData?.items;
        case 'groups':
          return staticData?.groups;
        case 'dungeons':
          return staticData?.dungeons;
        case 'player':
          return snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || contextVariables?.playerId || DEFAULT_PLAYER_ID;
        case 'world':
          // Return an object with player, options, and game-specific properties
          // This matches the Python world object structure used in helper definitions
          const playerId = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || contextVariables?.playerId || DEFAULT_PLAYER_ID;
          // The world structure has game options nested under world[playerId].options
          // or directly on world[playerId] (for games like Shivers with options like early_beth)
          const playerWorld = staticData?.world?.[playerId];
          const gameOptions = playerWorld?.options || playerWorld || staticData?.world || {};

          // Get game-specific info from game_info (e.g., AHIT hat_yarn_costs, hat_craft_order)
          const gameInfo = staticData?.game_info?.[playerId] || {};

          // Build the world object with both options and game-specific properties
          // Define helper functions that can be used both on world and multiworld
          const getEntranceHelper = (entranceName) => {
            // Find entrance in regions and return it with connected_region
            if (staticData?.regions) {
              for (const [regionName, regionData] of staticData.regions.entries()) {
                const exits = regionData.exits || [];
                const exit = exits.find(e => e.name === entranceName);
                if (exit) {
                  return {
                    name: exit.name,
                    connected_region: {
                      name: exit.connected_region
                    }
                  };
                }
              }
            }
            return null;
          };

          const getLocationHelper = (locationName) => {
            // Return location with access_rule method
            if (staticData?.locations) {
              const loc = staticData.locations.get(locationName);
              if (loc) {
                return {
                  ...loc,
                  access_rule: () => {
                    // Evaluate access rule through evaluateRule
                    if (!loc.access_rule) return true;
                    return evaluateRule(loc.access_rule, rawInterfaceForHelpers);
                  }
                };
              }
            }
            return null;
          };

          const worldObj = {
            player: playerId,
            options: gameOptions,
            // Add get_entrance and get_location directly on world for rules like world.get_entrance(...)
            get_entrance: getEntranceHelper,
            get_location: getLocationHelper,
            // Include multiworld reference for helpers that need it (backwards compatibility)
            multiworld: {
              get_entrance: getEntranceHelper,
              get_location: getLocationHelper
            },
            // Include item_name_groups for helpers like has_relic_combo
            // Combines standard item_groups with game-specific groups (e.g., AHIT relic_groups)
            item_name_groups: {
              ...(staticData?.item_groups?.[playerId] || staticData?.item_groups || {}),
              ...(gameInfo.relic_groups || {})
            }
          };

          // Merge in world attributes (computed runtime values like difficulty_requirements, required_medallions)
          // These are now part of the world data directly (previously in separate world_attributes section)
          // They are accessed via world.difficulty_requirements, world.required_medallions, etc.
          if (playerWorld) {
            // Copy all world attributes except 'options' and 'option_definitions' which are handled separately
            for (const [key, value] of Object.entries(playerWorld)) {
              if (key !== 'options' && key !== 'option_definitions' && key !== 'game' && !(key in worldObj)) {
                worldObj[key] = value;
              }
            }
          }

          // Merge in game-specific properties from game_info
          // For AHIT: hat_yarn_costs, hat_craft_order come from hat_info
          if (gameInfo.hat_info) {
            worldObj.hat_yarn_costs = gameInfo.hat_info.hat_yarn_costs || {};
            worldObj.hat_craft_order = gameInfo.hat_info.hat_craft_order || [];
          }

          // For other game-specific properties, spread them onto world
          // This allows helper definitions to access world.* properties as exported
          if (gameInfo.variables) {
            Object.assign(worldObj, gameInfo.variables);
          }

          return worldObj;
        case 'logic':
        case 'StateLogic':
          // Return game-specific helper functions as an object
          // This allows code like logic.can_surf(...) or StateLogic.hammers(...) to work
          const selectedHelpers = getHelperFunctions(gameName);
          if (selectedHelpers) {
            // Wrap each helper to accept the right parameters
            const logicObject = {};
            for (const [helperName, helperFunction] of Object.entries(selectedHelpers)) {
              logicObject[helperName] = (...args) => {
                return helperFunction(snapshot, staticData, ...args);
              };
            }
            return logicObject;
          }
          return undefined;
        case 'Bosses':
          // SM-specific Bosses object for checking boss defeat status
          // Used by rules like Bosses.bossDead(sm, "BossName")
          const bossHelpers = getHelperFunctions(gameName);
          if (bossHelpers?.bossDead) {
            return {
              bossDead: (sm, bossName) => {
                // The 'sm' argument is the SMBoolManager reference from Python, which we don't need
                // We just need the bossName to check if that boss item is in inventory
                return bossHelpers.bossDead(snapshot, staticData, bossName);
              }
            };
          }
          return undefined;
        case 'sm':
        case 'smbm':
          // SM-specific SMBoolManager reference used in rules like sm.getDmgReduction()
          // Return an object with all helper functions wrapped for the current state
          const smHelpers = getHelperFunctions(gameName);
          if (smHelpers) {
            const smObject = {};
            for (const [helperName, helperFunction] of Object.entries(smHelpers)) {
              smObject[helperName] = (...args) => {
                return helperFunction(snapshot, staticData, ...args);
              };
            }
            return smObject;
          }
          return undefined;
        default:
          // Check if this is a game-specific variable (e.g., required_technologies for Factorio)
          const currentPlayerId = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || contextVariables?.playerId || DEFAULT_PLAYER_ID;
          // Normalize to string for JSON object key lookup (JSON keys are always strings)
          const currentPlayerIdStr = String(currentPlayerId);
          if (staticData?.game_info?.[currentPlayerIdStr]?.variables && staticData.game_info[currentPlayerIdStr].variables[name]) {
            return staticData.game_info[currentPlayerIdStr].variables[name];
          }

          // Check if this is a game-specific constant (e.g., OPTIONS for shapez)
          const gameLogic = getGameLogic(gameName);
          if (gameLogic.constants && gameLogic.constants[name]) {
            return gameLogic.constants[name];
          }

          // Built-in game constants for games that export helper definitions to rules.json
          // These map Python module-level constants to JavaScript equivalents
          const builtInGameConstants = {
            // A Hat in Time: maps hat enum values to item names
            'hat_type_to_item': {
              0: 'Sprint Hat',
              1: 'Brewing Hat',
              2: 'Ice Hat',
              3: 'Dweller Mask',
              4: 'Time Stop Hat'
            }
          };
          if (builtInGameConstants[name]) {
            return builtInGameConstants[name];
          }

          // Check if there's a helper function that computes this value
          // Some games use computed values (e.g., SC2's power_rating) from inventory state
          // IMPORTANT: Only call helpers directly if they take no extra args (beyond snapshot, staticData)
          // Helpers that require additional arguments (like graffiti_spots with movestyle, limit, etc.)
          // must be called via executeHelper with their args properly evaluated
          const computedHelpers = getHelperFunctions(gameName);
          if (computedHelpers) {
            // Try exact match first (e.g., 'power_rating' -> power_rating helper)
            // Only call directly if the function takes at most 2 params (snapshot, staticData)
            if (typeof computedHelpers[name] === 'function' && computedHelpers[name].length <= 2) {
              const result = computedHelpers[name](snapshot, staticData);
              return result;
            }
            // Try with game-specific prefixes if defined (e.g., 'power_rating' -> 'terran_power_rating' for SC2)
            const prefixes = gameLogic.helperPrefixes || [];
            for (const prefix of prefixes) {
              const prefixedName = prefix + name;
              if (typeof computedHelpers[prefixedName] === 'function' && computedHelpers[prefixedName].length <= 2) {
                const result = computedHelpers[prefixedName](snapshot, staticData);
                return result;
              }
            }
          }

          // Game-specific location variable extraction hook
          // For variables not found in context, try to extract from location name
          if (contextVariables && contextVariables.location) {
            const locationName = contextVariables.location.name || '';
            const selectedHelpers = getHelperFunctions(gameName);

            // Check if the game has a custom extractor for this variable
            const extractorName = `extract${name.charAt(0).toUpperCase()}${name.slice(1)}`;
            if (selectedHelpers && typeof selectedHelpers[extractorName] === 'function') {
              const extractedValue = selectedHelpers[extractorName](locationName);
              if (extractedValue !== null && extractedValue !== undefined) {
                return extractedValue;
              }
            }
          }
          return undefined;
      }
    },
    hasItem: (itemName) => {
      const selectedHelpers = getHelperFunctions(gameName);

      // Use dynamic helper selection for has functionality
      if (selectedHelpers && selectedHelpers.has) {
        return selectedHelpers.has(snapshot, staticData, itemName);
      }

      // Legacy implementation fallback
      return !!(snapshot?.inventory && snapshot.inventory[itemName] > 0);
    },
    countItem: (itemName) => {
      const selectedHelpers = getHelperFunctions(gameName);

      // Use dynamic helper selection for count functionality
      if (selectedHelpers && selectedHelpers.count) {
        return selectedHelpers.count(snapshot, staticData, itemName);
      }

      // Check regular inventory first
      const inventoryCount = snapshot?.inventory?.[itemName] || 0;
      if (inventoryCount > 0) {
        return inventoryCount;
      }

      // Also check prog_items for counter items (e.g., " coins")
      // This allows item_check rules to work with accumulator_rules targets
      const playerId = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || contextVariables?.playerId || DEFAULT_PLAYER_ID;

      const progItemsCount = snapshot?.prog_items?.[playerId]?.[itemName] ||
                             snapshot?.prog_items?.[String(playerId)]?.[itemName] ||
                             snapshot?.prog_items?.[parseInt(playerId)]?.[itemName] || 0;

      if (progItemsCount > 0) {
        return progItemsCount;
      }

      return 0;
    },
    getTotalItemCount: () => {
      // Count total items across all item types in inventory
      let totalCount = 0;
      if (snapshot?.inventory) {
        for (const itemName in snapshot.inventory) {
          totalCount += snapshot.inventory[itemName] || 0;
        }
      }
      return totalCount;
    },
    countGroup: (groupName) => {
      if (!snapshot?.inventory) {
        return 0;
      }
      let count = 0;
      const playerId = snapshot?.player?.id || snapshot?.player?.slot || DEFAULT_PLAYER_ID;

      // First check game_info for group definitions (e.g., relic_groups in A Hat in Time)
      const gameInfo = staticData?.game_info?.[playerId] || {};
      if (gameInfo.relic_groups?.[groupName]) {
        const itemsInGroup = gameInfo.relic_groups[groupName];
        if (Array.isArray(itemsInGroup)) {
          for (const itemName of itemsInGroup) {
            count += snapshot.inventory[itemName] || 0;
          }
          return count;
        }
      }

      // Then check if we have item_groups (ALTTP-style with group names as array)
      const playerItemGroups = staticData?.item_groups?.[playerId] || staticData?.item_groups;

      if (Array.isArray(playerItemGroups)) {
        // ALTTP uses array of group names
        // This logic assumes staticData.itemsByPlayer or staticData.items is available and structured per player
        const playerItemsData =
          (staticData.itemsByPlayer && staticData.itemsByPlayer[playerId]) ||
          (staticData.items && staticData.items[playerId]);
        if (playerItemsData) {
          for (const itemName in playerItemsData) {
            if (playerItemsData[itemName]?.groups?.includes(groupName)) {
              const itemCount = snapshot.inventory[itemName] || 0;
              count += itemCount;
            }
          }
        } else {
          log('warn', `[countGroup] playerItemsData not found for player ${playerId}.`);
        }
      } else if (
        typeof playerItemGroups === 'object' &&
        playerItemGroups[groupName] &&
        Array.isArray(playerItemGroups[groupName])
      ) {
        // If item_groups is an object { groupName: [itemNames...] }
        for (const itemInGroup of playerItemGroups[groupName]) {
          count += snapshot.inventory[itemInGroup] || 0;
        }
      } else if (staticData?.groups) {
        // Fallback to old groups structure if available
        const playerGroups = staticData.groups[playerId] || staticData.groups;
        if (
          typeof playerGroups === 'object' &&
          playerGroups[groupName] &&
          Array.isArray(playerGroups[groupName])
        ) {
          for (const itemInGroup of playerGroups[groupName]) {
            count += snapshot.inventory[itemInGroup] || 0;
          }
        }
      }
      return count;
    },
    hasFlag: (flagName) =>
      !!(snapshot?.flags && snapshot.flags.includes(flagName)),
    getSetting: (settingName) => {
      // World data may be in snapshot OR staticData, keyed by player ID (multiworld) or directly
      // Try snapshot first, then staticData
      let worldToUse = snapshot?.world || staticData?.world;
      const rawPlayerId = snapshot?.player?.id || snapshot?.player?.slot ||
                       staticData?.playerId || contextVariables?.playerId || DEFAULT_PLAYER_ID;
      const playerIdKey = String(rawPlayerId);
      if (worldToUse) {
        // Check if world is keyed by player ID
        if (worldToUse[playerIdKey] && typeof worldToUse[playerIdKey] === 'object') {
          worldToUse = worldToUse[playerIdKey];
        }
      }
      // First check direct lookup at top level of world (includes runtime attributes)
      let rawValue = worldToUse?.[settingName];
      // If not found at top level, check inside 'options' object
      // Many settings like LuckyEmblemsRequired are nested in options
      if (rawValue === undefined && worldToUse?.options) {
        rawValue = worldToUse.options[settingName];
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
    isRegionReachable: (regionName) => {
      // During BFS (when stateManager is provided and _computing is true),
      // check the LIVE knownReachableRegions being built, not the frozen snapshot.
      // This allows circular dependencies to resolve as BFS progresses.
      if (stateManager && stateManager._computing && stateManager.knownReachableRegions) {
        return stateManager.knownReachableRegions.has(regionName);
      }

      // Otherwise, use the frozen snapshot data
      const status = snapshot?.regionReachability?.[regionName];
      if (status === 'reachable' || status === 'checked') return true;
      if (status === 'unreachable') return false;
      return undefined;
    },
    isLocationAccessible: function (locationOrName) {
      const locationName =
        typeof locationOrName === 'string'
          ? locationOrName
          : locationOrName?.name;
      if (!locationName) return undefined;
      const locData = findLocationDataInStatic(locationName);
      if (!locData) return undefined;
      const regionName = locData.parent_region_name || locData.parent_region || locData.region;
      if (!regionName) return undefined;
      const parentRegionIsReachable = this.isRegionReachable(regionName);
      if (parentRegionIsReachable === undefined) return undefined;
      if (parentRegionIsReachable === false) return false;
      if (!locData.access_rule) return true;

      // Create a new interface with location context for rule evaluation
      // This matches what StateManager does in its isLocationAccessible method
      const locationContext = createSnapshotInterface(snapshot, staticData, {
        ...contextVariables,
        location: locData,
        currentLocation: locData
      });
      return evaluateRule(locData.access_rule, locationContext);
    },
    // Alias for isRegionReachable to match naming convention used in region_check rules
    isRegionAccessible: function (regionName) {
      return this.isRegionReachable(regionName);
    },
    // Check if an entrance is reachable
    // An entrance is reachable if its source region is reachable AND its access rule passes
    isEntranceReachable: function (entranceName) {
      if (!staticData || !staticData.regions) return undefined;

      // Find the entrance in the regions data
      let entrance = null;
      let sourceRegion = null;

      // staticData.regions is a Map of region name -> region data
      for (const [regionName, regionData] of staticData.regions.entries()) {
        const exits = regionData.exits || [];
        const foundExit = exits.find(exit => exit.name === entranceName);
        if (foundExit) {
          entrance = foundExit;
          sourceRegion = regionName;
          break;
        }
      }

      if (!entrance || !sourceRegion) {
        // Entrance not found
        return undefined;
      }

      // Check if source region is reachable
      const sourceReachable = this.isRegionReachable(sourceRegion);
      if (sourceReachable === undefined) return undefined;
      if (sourceReachable === false) return false;

      // Evaluate the entrance's access rule
      if (entrance.access_rule) {
        // Create an enhanced entrance object with parent_region_name for attribute access
        const enhancedEntrance = {
          ...entrance,
          parent_region_name: sourceRegion,
          parent_region: sourceRegion  // Also add parent_region directly for simpler access
        };

        // Normalize the entrance name for variable binding (matches Python exporter convention)
        // "Kiki Skip" -> "kikiskip"
        const normalizedName = entrance.name?.toLowerCase().replace(/\s+/g, '');

        // Create a context for evaluating the entrance's access rule
        // Bind the entrance under both standard names and its normalized name
        const entranceContext = createSnapshotInterface(snapshot, staticData, {
          ...contextVariables,
          entrance: enhancedEntrance,
          currentEntrance: enhancedEntrance,
          // Bind under normalized name so rules like "kikiskip.parent_region" work
          ...(normalizedName ? { [normalizedName]: enhancedEntrance } : {})
        });
        return evaluateRule(entrance.access_rule, entranceContext);
      }

      // No access rule means the entrance is accessible if the source region is reachable
      return true;
    },
    getPlayerSlot: () => snapshot?.player?.slot,
    getPlayerId: () => contextVariables?.playerId || snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID,
    playerId: contextVariables?.playerId || snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID,
    getGameMode: () => snapshot?.gameMode,
    getDifficultyRequirements: () => snapshot?.difficultyRequirements,
    getShops: () => snapshot?.shops,
    getRegionData: (regionName) => {
      if (!staticData || !staticData.regions) return undefined;

      // staticData.regions is always a Map after initialization
      return staticData.regions.get(regionName);
    },
    getStaticData: () => ({
      items: staticData.itemData || staticData.items,
      groups: staticData.groupData || staticData.groups,
      locations: staticData.locationData || staticData.locations,
      regions: staticData.regions, // Use the main regions property for rule engine compatibility
      dungeons: staticData.dungeonData || staticData.dungeons,
      game_info: staticData.game_info, // Include game_info for variable resolution
      helpers: staticData.helpers, // Include helper definitions for rule engine
      world: staticData.world, // Include world data for helper evaluation (game, options, runtime attributes)
      exporter: staticData.exporter, // Include exporter settings for processing behavior
    }),
    getStateValue: (pathString) => {
      if (!snapshot) return undefined;
      if (typeof pathString !== 'string' || pathString.trim() === '')
        return undefined;
      const keys = pathString.split('.');
      let current = snapshot;
      for (const key of keys) {
        if (current && typeof current === 'object' && key in current)
          current = current[key];
        else return undefined;
      }
      return current;
    },
    getLocationItem: (locationName) => {
      if (!staticData || !staticData.locationItems) return undefined;
      return staticData.locationItems.get(locationName);
    },
    // ADDED: A more direct way to resolve attribute chains
    resolveAttribute: (baseObject, attributeName) => {
      if (
        baseObject &&
        typeof baseObject === 'object' &&
        Object.prototype.hasOwnProperty.call(baseObject, attributeName)
      ) {
        const attrValue = baseObject[attributeName];
        if (typeof attrValue === 'function') {
          // If the attribute is a function, we need to bind it to its object
          // so that 'this' is correctly set when the function is called.
          return attrValue.bind(baseObject);
        }
        return attrValue;
      }

      // Handle common attribute name mismatches between Python and JavaScript
      if (baseObject && typeof baseObject === 'object') {
        // Handle location.parent_region -> get actual region object
        if (attributeName === 'parent_region') {
          let regionName = null;

          // Try different ways to get the region name
          if (baseObject.region) {
            regionName = baseObject.region;
          } else if (baseObject.parent_region) {
            regionName = baseObject.parent_region;
          } else if (staticData && staticData.locations) {
            // Try to find the location in static data and get its region
            const locationName = baseObject.name;
            if (locationName) {
              // staticData.locations is always a Map after initialization
              const locationData = staticData.locations.get(locationName);

              if (locationData) {
                regionName = locationData.region || locationData.parent_region;
              }
            }
          }

          if (regionName) {
            // Look up the actual region object from static data
            // staticData.regions is always a Map after initialization
            if (staticData && staticData.regions) {
              const regionObject = staticData.regions.get(regionName);
              if (regionObject) return regionObject;
            }
            // Fallback: return the region name if we can't find the object
            return regionName;
          }

          return undefined;
        }
      }

      return undefined;
    },
  };

  // Legacy GameSnapshotHelpers removed - all games now use agnostic helpers directly

  const finalSnapshotInterface = {
    _isSnapshotInterface: true,
    inventory: snapshot?.inventory || {},
    events: snapshot?.events || {},
    prog_items: snapshot?.prog_items || {},
    ...rawInterfaceForHelpers,
    // Add context variables to the interface (e.g., currentLocation for boss defeat rules)
    ...contextVariables,
    // Map 'location' contextVariable to 'currentLocation' for rule engine compatibility
    currentLocation: contextVariables.location,
    // Legacy helpers property removed - use executeHelper method instead
    executeHelper: (helperName, ...args) => {
      // First, check if there's a helper definition in rules.json (staticData.helpers)
      // This allows Python-exported helper definitions to be evaluated without JavaScript
      const playerId = snapshot?.player?.id || snapshot?.player?.slot ||
                       staticData?.playerId || contextVariables?.playerId || DEFAULT_PLAYER_ID;
      const playerIdStr = String(playerId);

      const helperDefinition = staticData?.helpers?.[playerIdStr]?.[helperName];

      if (helperDefinition && helperDefinition.body) {
        // Helper definition found - evaluate it using the rule engine
        // Use shared utility to resolve parameter values from args, slot_data, or settings
        const helperScope = resolveHelperScope(helperDefinition, args, staticData, playerIdStr);

        // Evaluate the helper body with the resolved parameters
        const result = evaluateRule(helperDefinition.body, finalSnapshotInterface, 0, helperScope);

        // If definition evaluation succeeded (not undefined), use that result
        // Otherwise, fall through to try JavaScript helpers as a fallback
        // This handles cases where the exported Python helper relies on APIs not available in JS
        if (result !== undefined) {
          return result;
        }
        // Fall through to JavaScript helpers if definition returned undefined
      }

      // Fall back to game-specific JavaScript helpers
      const selectedHelpers = getHelperFunctions(gameName);

      if (selectedHelpers && selectedHelpers[helperName]) {
        return selectedHelpers[helperName](snapshot, staticData, ...args);
      }
      return undefined; // Helper not found - all games should use agnostic helpers
    },
    evaluateRule: function (rule, contextName = null) {
      return evaluateRule(rule, this, contextName);
    },
    resolveRuleObject: (ruleObjectPath) => {
      if (ruleObjectPath && ruleObjectPath.type === 'name') {
        const name = ruleObjectPath.name;
        // Legacy helpers reference removed - use executeHelper method instead
        if (name === 'state' || name === 'settings' || name === 'inventory')
          return finalSnapshotInterface;
        if (name === 'player') return snapshot?.player?.slot;
        // Legacy entities system removed - use snapshot data directly
      }
      return finalSnapshotInterface;
    },
    executeStateManagerMethod: (methodName, ...args) => {
      // Handle special can_reach method
      if (methodName === 'can_reach' && args.length >= 1) {
        const targetName = args[0];
        let targetType = args[1];

        // If no type specified, auto-detect based on whether it's a location or region
        // This handles cases like Factorio's state.can_reach(loc) where loc is a Location object
        // that gets exported without a type argument
        if (!targetType) {
          const isLocation = findLocationDataInStatic(targetName) !== null;
          targetType = isLocation ? 'Location' : 'Region';
        }

        if (targetType === 'Region')
          return finalSnapshotInterface.isRegionReachable(targetName);
        if (targetType === 'Location')
          return finalSnapshotInterface.isLocationAccessible(targetName);
        if (targetType === 'Entrance')
          return finalSnapshotInterface.isEntranceReachable(targetName);
      }

      // Handle can_reach_region method (Python alias for can_reach with Region type)
      if (methodName === 'can_reach_region' && args.length >= 1) {
        const regionName = args[0];
        // args[1] would be player_id in Python but we ignore it in single-player context
        return finalSnapshotInterface.isRegionReachable(regionName);
      }

      // Handle can_reach_location method (Python alias for can_reach with Location type)
      if (methodName === 'can_reach_location' && args.length >= 1) {
        const locationName = args[0];
        // args[1] would be player_id in Python but we ignore it in single-player context
        return finalSnapshotInterface.isLocationAccessible(locationName);
      }

      // Handle StateManager inventory methods
      if (methodName === 'has_any' && args.length >= 1) {
        const items = args[0];
        if (!Array.isArray(items)) return false;
        return items.some(itemName => finalSnapshotInterface.hasItem(itemName));
      }

      if (methodName === 'has_all' && args.length >= 1) {
        const items = args[0];
        if (!Array.isArray(items)) return false;
        return items.every(itemName => finalSnapshotInterface.hasItem(itemName));
      }

      if (methodName === 'has_all_counts' && args.length >= 1) {
        const itemCounts = args[0];
        if (typeof itemCounts !== 'object' || itemCounts === null) return false;
        for (const [itemName, requiredCount] of Object.entries(itemCounts)) {
          if (finalSnapshotInterface.countItem(itemName) < requiredCount) {
            return false;
          }
        }
        return true;
      }

      // Handle has_any_count - returns true if ANY ONE item meets its required count
      if (methodName === 'has_any_count' && args.length >= 1) {
        const itemCounts = args[0];
        if (typeof itemCounts !== 'object' || itemCounts === null) return false;
        for (const [itemName, requiredCount] of Object.entries(itemCounts)) {
          if (finalSnapshotInterface.countItem(itemName) >= requiredCount) {
            return true;
          }
        }
        return false;
      }

      // Handle count method - returns the count of a specific item
      if (methodName === 'count' && args.length >= 1) {
        const itemName = args[0];
        return finalSnapshotInterface.countItem(itemName);
      }

      if (methodName === 'has_from_list' && args.length >= 2) {
        const items = args[0];
        const count = args[1];
        if (!Array.isArray(items)) return false;
        if (typeof count !== 'number' || count < 0) return false;

        // Count total items from the list
        let itemsFound = 0;
        for (const itemName of items) {
          itemsFound += (finalSnapshotInterface.countItem(itemName) || 0);
        }
        return itemsFound >= count;
      }

      // Handle has_from_list_unique - counts unique items from a list (ignores duplicates)
      if (methodName === 'has_from_list_unique' && args.length >= 2) {
        const items = args[0];
        const count = args[1];
        if (!Array.isArray(items)) return false;
        if (typeof count !== 'number' || count < 0) return false;

        // Count unique items from the list (items with count > 0)
        let uniqueItemsFound = 0;
        for (const itemName of items) {
          if ((finalSnapshotInterface.countItem(itemName) || 0) > 0) {
            uniqueItemsFound++;
          }
        }
        return uniqueItemsFound >= count;
      }

      // Handle count_from_list_unique - returns the count of unique items from a list (ignores duplicates)
      if (methodName === 'count_from_list_unique' && args.length >= 1) {
        const items = args[0];
        if (!Array.isArray(items)) return 0;

        // Count unique items from the list (items with count > 0)
        let uniqueItemsFound = 0;
        for (const itemName of items) {
          if ((finalSnapshotInterface.countItem(itemName) || 0) > 0) {
            uniqueItemsFound++;
          }
        }
        return uniqueItemsFound;
      }

      // Handle count_from_list - returns the total count of items from a list (sums all quantities)
      if (methodName === 'count_from_list' && args.length >= 1) {
        const items = args[0];
        if (!Array.isArray(items)) return 0;

        // Sum all item counts from the list
        let totalCount = 0;
        for (const itemName of items) {
          totalCount += (finalSnapshotInterface.countItem(itemName) || 0);
        }
        return totalCount;
      }

      // Handle has_group_unique - counts unique items from a group (ignores duplicates)
      if (methodName === 'has_group_unique' && args.length >= 2) {
        const groupName = args[0];
        const requiredCount = args[1];
        if (typeof groupName !== 'string') return false;
        if (typeof requiredCount !== 'number' || requiredCount < 0) return false;

        const playerId = snapshot?.player?.id || snapshot?.player?.slot || DEFAULT_PLAYER_ID;
        const playerItemGroups = staticData?.item_groups?.[playerId] || staticData?.item_groups;

        let uniqueItemsFound = 0;

        if (Array.isArray(playerItemGroups)) {
          // ALTTP-style with group names as array
          const playerItemsData = staticData.itemsByPlayer && staticData.itemsByPlayer[playerId];
          if (playerItemsData) {
            for (const itemName in playerItemsData) {
              if (playerItemsData[itemName]?.groups?.includes(groupName)) {
                const itemCount = snapshot.inventory[itemName] || 0;
                if (itemCount > 0) {
                  uniqueItemsFound++;
                  if (uniqueItemsFound >= requiredCount) {
                    return true;
                  }
                }
              }
            }
          }
        } else if (
          typeof playerItemGroups === 'object' &&
          playerItemGroups[groupName] &&
          Array.isArray(playerItemGroups[groupName])
        ) {
          // Item_groups is an object { groupName: [itemNames...] }
          for (const itemInGroup of playerItemGroups[groupName]) {
            const itemCount = snapshot.inventory[itemInGroup] || 0;
            if (itemCount > 0) {
              uniqueItemsFound++;
              if (uniqueItemsFound >= requiredCount) {
                return true;
              }
            }
          }
        } else if (staticData?.groups) {
          // Fallback to old groups structure if available
          const playerGroups = staticData.groups[playerId] || staticData.groups;
          if (
            typeof playerGroups === 'object' &&
            playerGroups[groupName] &&
            Array.isArray(playerGroups[groupName])
          ) {
            for (const itemInGroup of playerGroups[groupName]) {
              const itemCount = snapshot.inventory[itemInGroup] || 0;
              if (itemCount > 0) {
                uniqueItemsFound++;
                if (uniqueItemsFound >= requiredCount) {
                  return true;
                }
              }
            }
          }
        }

        return uniqueItemsFound >= requiredCount;
      }

      // Handle count_group_unique - returns count of unique items from a group (ignores duplicates)
      if (methodName === 'count_group_unique' && args.length >= 1) {
        const groupName = args[0];
        if (typeof groupName !== 'string') return 0;

        const playerId = snapshot?.player?.id || snapshot?.player?.slot || DEFAULT_PLAYER_ID;
        const playerItemGroups = staticData?.item_groups?.[playerId] || staticData?.item_groups;

        let uniqueItemsFound = 0;

        if (Array.isArray(playerItemGroups)) {
          // ALTTP-style with group names as array
          const playerItemsData = staticData.itemsByPlayer && staticData.itemsByPlayer[playerId];
          if (playerItemsData) {
            for (const itemName in playerItemsData) {
              if (playerItemsData[itemName]?.groups?.includes(groupName)) {
                const itemCount = snapshot.inventory[itemName] || 0;
                if (itemCount > 0) {
                  uniqueItemsFound++;
                }
              }
            }
          }
        } else if (
          typeof playerItemGroups === 'object' &&
          playerItemGroups[groupName] &&
          Array.isArray(playerItemGroups[groupName])
        ) {
          // Item_groups is an object { groupName: [itemNames...] }
          for (const itemInGroup of playerItemGroups[groupName]) {
            const itemCount = snapshot.inventory[itemInGroup] || 0;
            if (itemCount > 0) {
              uniqueItemsFound++;
            }
          }
        } else if (staticData?.groups) {
          // Fallback to old groups structure if available
          const playerGroups = staticData.groups[playerId] || staticData.groups;
          if (
            typeof playerGroups === 'object' &&
            playerGroups[groupName] &&
            Array.isArray(playerGroups[groupName])
          ) {
            for (const itemInGroup of playerGroups[groupName]) {
              const itemCount = snapshot.inventory[itemInGroup] || 0;
              if (itemCount > 0) {
                uniqueItemsFound++;
              }
            }
          }
        }

        return uniqueItemsFound;
      }

      // Check for game-specific state methods first
      const selectedStateMethods = getStateMethods(gameName);

      if (selectedStateMethods && selectedStateMethods[methodName]) {
        // For state methods with no args, pass the player ID so they can look up
        // player-specific settings (important for multiworld)
        const playerId = snapshot?.player?.id || snapshot?.player?.slot || DEFAULT_PLAYER_ID;
        const argsWithPlayer = args.length === 0 ? [playerId] : args;
        return selectedStateMethods[methodName](snapshot, staticData, ...argsWithPlayer);
      }

      // Use game-specific agnostic helpers for all helper methods
      const selectedHelpers = getHelperFunctions(gameName);

      if (selectedHelpers[methodName]) {
        // For helper methods with no args, pass the player ID so they can look up
        // player-specific data (important for multiworld)
        const playerId = snapshot?.player?.id || snapshot?.player?.slot || DEFAULT_PLAYER_ID;
        const argsWithPlayer = args.length === 0 ? [playerId] : args;
        return selectedHelpers[methodName](snapshot, staticData, ...argsWithPlayer);
      }

      // Legacy helper system removed - all games should use agnostic helpers
      return undefined;
    },
    resolveName: rawInterfaceForHelpers.resolveName,
  };

  // Helper functions are now evaluated from rules.json helper definitions
  // via evaluateRule() in ruleEngine.js, not as direct properties on the interface.
  // The executeHelper() method remains as a fallback for games that still need JS helpers.

  return finalSnapshotInterface;
}