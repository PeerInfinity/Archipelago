// frontend/modules/shared/stateInterface.js
// Stateless state snapshot interface creation - thread-agnostic

import { evaluateRule } from './ruleEngine.js';
import { helperFunctions as alttpLogic } from './gameLogic/alttp/alttpLogic.js';
import { helperFunctions as genericLogic } from './gameLogic/generic/genericLogic.js';
import { createSharedLogger } from './sharedLogger.js';

// Create logger for this module
const logger = createSharedLogger('stateInterface');

/**
 * Creates an interface object suitable for main-thread rule evaluation
 * based on the latest cached snapshot data.
 * @param {object | null} snapshot - The raw state snapshot from the worker (or null if not available).
 * @param {object | null} staticData - The cached static data (items, groups, etc.).
 * @param {object} contextVariables - Optional context variables (e.g., { location: currentLocation }).
 * @returns {object} - An object conforming to the StateSnapshotInterface.
 */
export function createStateSnapshotInterface(
  snapshot,
  staticData,
  contextVariables = {}
) {
  // Legacy snapshotHelpersInstance removed - using agnostic helpers directly
  const gameName = staticData?.game_name || snapshot?.game; // Get game name from static data or snapshot

  function findLocationDataInStatic(locationName) {
    if (!staticData) return null;
    if (
      staticData.locations &&
      typeof staticData.locations === 'object' &&
      !Array.isArray(staticData.locations)
    ) {
      if (staticData.locations[locationName]) {
        return staticData.locations[locationName];
      }
    }
    if (staticData.regions) {
      for (const playerId in staticData.regions) {
        if (
          Object.prototype.hasOwnProperty.call(staticData.regions, playerId)
        ) {
          const playerRegions = staticData.regions[playerId];
          for (const regionNameKey in playerRegions) {
            if (
              Object.prototype.hasOwnProperty.call(playerRegions, regionNameKey)
            ) {
              const region = playerRegions[regionNameKey];
              if (region.locations && Array.isArray(region.locations)) {
                const foundLoc = region.locations.find(
                  (l) => l.name === locationName
                );
                if (foundLoc) {
                  return {
                    ...foundLoc,
                    region: regionNameKey,
                    parent_region: regionNameKey,
                  };
                }
              }
            }
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
        case 'settings':
          return snapshot?.settings;
        case 'flags':
          return snapshot?.flags;
        case 'state':
          return snapshot;
        case 'regions':
          return staticData?.regions;
        case 'locations':
          return staticData.locations &&
            typeof staticData.locations === 'object' &&
            !Array.isArray(staticData.locations)
            ? staticData.locations
            : undefined;
        case 'items':
          return staticData?.items;
        case 'groups':
          return staticData?.groups;
        case 'dungeons':
          return staticData?.dungeons;
        case 'player':
          return snapshot?.player?.slot || staticData?.playerId || contextVariables?.playerId || '1';
        default:
          return undefined;
      }
    },
    hasItem: (itemName) => {
      let selectedHelpers = genericLogic; // Default to generic

      if (gameName === 'A Link to the Past') {
        selectedHelpers = alttpLogic;
      }

      // Use dynamic helper selection for has functionality
      if (selectedHelpers && selectedHelpers.has) {
        return selectedHelpers.has(snapshot, itemName, staticData);
      }
      
      // Legacy implementation fallback
      return !!(snapshot?.inventory && snapshot.inventory[itemName] > 0);
    },
    countItem: (itemName) => {
      let selectedHelpers = genericLogic; // Default to generic

      if (gameName === 'A Link to the Past') {
        selectedHelpers = alttpLogic;
      }

      // Use dynamic helper selection for count functionality
      if (selectedHelpers && selectedHelpers.count) {
        return selectedHelpers.count(snapshot, itemName, staticData);
      }
      
      // Legacy implementation fallback
      return snapshot?.inventory?.[itemName] || 0;
    },
    countGroup: (groupName) => {
      if (!staticData?.groups || !snapshot?.inventory) return 0;
      let count = 0;
      const playerSlot = snapshot?.player?.slot || '1'; // Default to '1' if not specified
      const playerItemGroups =
        staticData.groups[playerSlot] || staticData.groups; // Try player-specific then general

      if (Array.isArray(playerItemGroups)) {
        // ALTTP uses array of group names
        // This logic assumes staticData.items is available and structured per player
        const playerItemsData =
          staticData.items && staticData.items[playerSlot];
        if (playerItemsData) {
          for (const itemName in playerItemsData) {
            if (playerItemsData[itemName]?.groups?.includes(groupName)) {
              count += snapshot.inventory[itemName] || 0;
            }
          }
        }
      } else if (
        typeof playerItemGroups === 'object' &&
        playerItemGroups[groupName] &&
        Array.isArray(playerItemGroups[groupName])
      ) {
        // If groups is an object { groupName: [itemNames...] }
        for (const itemInGroup of playerItemGroups[groupName]) {
          count += snapshot.inventory[itemInGroup] || 0;
        }
      }
      return count;
    },
    hasFlag: (flagName) =>
      !!(snapshot?.flags && snapshot.flags.includes(flagName)),
    getSetting: (settingName) => snapshot?.settings?.[settingName],
    isRegionReachable: (regionName) => {
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
      const regionName = locData.parent_region || locData.region;
      if (!regionName) return undefined;
      const parentRegionIsReachable = this.isRegionReachable(regionName);
      if (parentRegionIsReachable === undefined) return undefined;
      if (parentRegionIsReachable === false) return false;
      if (!locData.access_rule) return true;
      return evaluateRule(locData.access_rule, this);
    },
    getPlayerSlot: () => snapshot?.player?.slot,
    getGameMode: () => snapshot?.gameMode,
    getDifficultyRequirements: () => snapshot?.difficultyRequirements,
    getShops: () => snapshot?.shops,
    getRegionData: (regionName) => {
      if (!staticData || !staticData.regions) return undefined;
      for (const playerId in staticData.regions) {
        if (
          staticData.regions[playerId] &&
          staticData.regions[playerId][regionName]
        ) {
          return staticData.regions[playerId][regionName];
        }
      }
      if (staticData.regions[regionName]) return staticData.regions[regionName];
      return undefined;
    },
    getStaticData: () => ({
      items: staticData.itemData || staticData.items,
      groups: staticData.groupData || staticData.groups,
      locations: staticData.locationData || staticData.locations,
      regions: staticData.regions, // Use the main regions property for rule engine compatibility
      dungeons: staticData.dungeonData || staticData.dungeons,
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
      if (!snapshot || !snapshot.locationItems) return undefined;
      return snapshot.locationItems[locationName];
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
            if (locationName && staticData.locations[locationName]) {
              regionName =
                staticData.locations[locationName].region ||
                staticData.locations[locationName].parent_region;
            }
          }

          if (regionName) {
            // Look up the actual region object from static data
            if (staticData && staticData.regions) {
              // staticData.regions might be nested by player, try to find the region
              for (const playerId in staticData.regions) {
                if (
                  staticData.regions[playerId] &&
                  staticData.regions[playerId][regionName]
                ) {
                  const regionObject = staticData.regions[playerId][regionName];
                  return regionObject;
                }
              }
              // If not nested by player, try direct lookup
              if (staticData.regions[regionName]) {
                const regionObject = staticData.regions[regionName];
                return regionObject;
              }
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
    ...rawInterfaceForHelpers,
    // Add context variables to the interface (e.g., currentLocation for boss defeat rules)
    ...contextVariables,
    // Map 'location' contextVariable to 'currentLocation' for rule engine compatibility
    currentLocation: contextVariables.location,
    // Legacy helpers property removed - use executeHelper method instead
    executeHelper: (helperName, ...args) => {
      let selectedHelpers = genericLogic; // Default to generic

      if (gameName === 'A Link to the Past') {
        selectedHelpers = alttpLogic;
      }
      // Add other `else if` blocks for future complex games

      if (selectedHelpers && selectedHelpers[helperName]) {
        // Call the agnostic helper, passing the snapshot as the state
        return selectedHelpers[helperName](snapshot, 'world', args[0], staticData);
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
        const targetType = args[1] || 'Region';
        if (targetType === 'Region')
          return finalSnapshotInterface.isRegionReachable(targetName);
        if (targetType === 'Location')
          return finalSnapshotInterface.isLocationAccessible(targetName);
      }
      
      // For ALTTP, use agnostic helpers for all helper methods
      if (snapshot?.game === 'A Link to the Past') {
        // Map method names to helper names if needed
        let helperName = methodName;
        
        // Check if this is a helper function in alttpLogic
        if (alttpLogic[helperName]) {
          // All agnostic helpers follow the same pattern: (state, world, itemName, staticData)
          // For has_any, itemName should be an array
          // For _has_specific_key_count, itemName should be a string like "Small Key (Palace),3"
          // For most others, itemName is a single item name
          
          // Special handling for multi-argument methods that need to be formatted
          let itemNameArg = args[0];
          if (helperName === 'has_any' && args.length > 1) {
            // If multiple args are passed, combine them into an array
            itemNameArg = args;
          } else if (helperName === '_has_specific_key_count' && args.length > 1) {
            // Combine key name and count into comma-separated string
            itemNameArg = `${args[0]},${args[1]}`;
          }
          
          return alttpLogic[helperName](snapshot, 'world', itemNameArg, staticData);
        }
      }
      
      // Legacy helper system removed - all games should use agnostic helpers
      return undefined;
    },
    resolveName: rawInterfaceForHelpers.resolveName,
  };

  // Add helper functions as direct properties for compatibility with spoiler tests
  if (snapshot?.game === 'A Link to the Past') {
    for (const [helperName, helperFunction] of Object.entries(alttpLogic)) {
      finalSnapshotInterface[helperName] = (...args) => {
        return helperFunction(snapshot, 'world', args[0], staticData);
      };
    }
  }

  return finalSnapshotInterface;
}