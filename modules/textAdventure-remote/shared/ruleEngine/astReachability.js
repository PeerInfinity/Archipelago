/**
 * Reachability and placement AST handlers.
 *
 * Handles: can_reach, can_reach_entrance, region_reference,
 * region_attribute, placement_lookup, placement_search
 *
 * @module shared/ruleEngine/astReachability
 */

import { log, DEFAULT_PLAYER_ID } from './helpers.js';

export function createReachabilityHandlers(evaluateRule) {
  return {
    'can_reach': (rule, context, depth, localScope, isValidContext) => {
      let targetName;
      let targetType = 'Region';

      if (rule.target !== undefined) {
        targetName = typeof rule.target === 'string'
          ? rule.target
          : evaluateRule(rule.target, context, depth + 1, localScope);
        targetType = rule.target_type || 'Region';
      } else if (rule.region !== undefined) {
        targetName = evaluateRule(rule.region, context, depth + 1, localScope);
      } else {
        log('warn', '[evaluateRule] can_reach rule missing both target and region');
        return undefined;
      }

      if (targetName === undefined) {
        return undefined;
      } else if (targetType === 'Entrance') {
        if (typeof context.isEntranceReachable === 'function') {
          return context.isEntranceReachable(targetName);
        }
        log('warn', '[evaluateRule] context.isEntranceReachable is not a function for can_reach Entrance');
        return undefined;
      } else if (targetType === 'Location') {
        if (typeof context.isLocationAccessible === 'function') {
          return context.isLocationAccessible(targetName);
        }
        log('warn', '[evaluateRule] context.isLocationAccessible is not a function for can_reach Location');
        return undefined;
      } else {
        if (typeof context.isRegionReachable === 'function') {
          const result = context.isRegionReachable(targetName);
          if (result === undefined) {
            log('debug', `[evaluateRule] Region ${targetName} reachability could not be determined`);
          }
          return result;
        }
        log('warn', '[evaluateRule] context.isRegionReachable is not a function for can_reach.');
        return undefined;
      }
    },

    'can_reach_entrance': (rule, context, depth, localScope, isValidContext) => {
      const entranceName = typeof rule.entrance === 'string'
        ? rule.entrance
        : evaluateRule(rule.entrance, context, depth + 1, localScope);
      if (!entranceName) {
        log('warn', '[evaluateRule] can_reach_entrance rule missing entrance name');
        return undefined;
      }

      let entrance = null;
      let sourceRegion = null;

      if (typeof context.getStaticData === 'function') {
        const staticData = context.getStaticData();
        const regionsData = staticData?.regions;

        if (regionsData && regionsData instanceof Map) {
          for (const [regionName, regionData] of regionsData.entries()) {
            const exits = regionData.exits || [];
            const foundExit = exits.find(exit => exit.name === entranceName);
            if (foundExit) {
              entrance = foundExit;
              sourceRegion = regionName;
              break;
            }
          }
        }
      }

      if (!entrance || !sourceRegion) {
        log('warn', `[evaluateRule] Entrance "${entranceName}" not found in regions data`);
        return undefined;
      }

      if (typeof context.isRegionReachable !== 'function') {
        log('warn', '[evaluateRule] context.isRegionReachable is not a function for can_reach_entrance.');
        return undefined;
      }

      const sourceReachable = context.isRegionReachable(sourceRegion);
      if (!sourceReachable) return false;

      if (entrance.access_rule) {
        return evaluateRule(entrance.access_rule, context, depth + 1);
      }
      return true;
    },

    'region_reference': (rule, context, depth, localScope, isValidContext) => {
      const regionName = rule.region;
      if (!regionName) {
        log('warn', '[evaluateRule] region_reference rule missing region name', { rule });
        return undefined;
      }
      return { __regionRef: true, regionName };
    },

    'region_attribute': (rule, context, depth, localScope, isValidContext) => {
      const regionExpr = evaluateRule(rule.region, context, depth + 1, localScope);
      const attrName = rule.attr;

      if (regionExpr === undefined) {
        log('debug', '[evaluateRule] region_attribute: region evaluated to undefined', { rule });
        return undefined;
      }

      if (!attrName) {
        log('warn', '[evaluateRule] region_attribute rule missing attr', { rule });
        return undefined;
      }

      let regionName;
      if (typeof regionExpr === 'string') {
        regionName = regionExpr;
      } else if (regionExpr?.__regionRef) {
        if (attrName in regionExpr) {
          return regionExpr[attrName];
        }
        regionName = regionExpr.regionName;
      } else if (typeof regionExpr === 'object' && regionExpr !== null) {
        if (attrName in regionExpr) {
          return regionExpr[attrName];
        }
        regionName = regionExpr.name || regionExpr.regionName;
        if (!regionName) {
          log('debug', '[evaluateRule] region_attribute: region object has no name, checking attribute directly', { regionExpr, attrName });
          return undefined;
        }
      } else {
        log('debug', '[evaluateRule] region_attribute: cannot determine region name (returning undefined)', { regionExpr, rule });
        return undefined;
      }

      if (typeof context.getStaticData !== 'function') {
        log('warn', '[evaluateRule] region_attribute: context.getStaticData not available');
        return undefined;
      }

      const staticData = context.getStaticData();
      const regionsData = staticData?.regions;

      if (!regionsData) {
        log('warn', '[evaluateRule] region_attribute: no regions data in staticData');
        return undefined;
      }

      let regionData;
      if (regionsData instanceof Map) {
        regionData = regionsData.get(regionName);
      } else {
        regionData = regionsData[regionName];
      }

      if (!regionData) {
        log('debug', `[evaluateRule] region_attribute: region '${regionName}' not found`);
        return undefined;
      }

      const result = regionData[attrName];
      if (result === undefined) {
        log('debug', `[evaluateRule] region_attribute: attribute '${attrName}' not found on region '${regionName}'`);
      }
      return result;
    },

    'placement_lookup': (rule, context, depth, localScope, isValidContext) => {
      const locationName = evaluateRule(rule.location, context, depth + 1, localScope);

      if (typeof locationName !== 'string') {
        log('warn', '[evaluateRule] placement_lookup: location did not evaluate to string', { rule, locationName });
        return null;
      }

      if (typeof context.getStaticData !== 'function') {
        log('warn', '[evaluateRule] placement_lookup: context.getStaticData not available');
        return null;
      }

      const staticData = context.getStaticData();

      if (staticData?.locationItems) {
        const itemData = staticData.locationItems instanceof Map
          ? staticData.locationItems.get(locationName)
          : staticData.locationItems[locationName];

        if (itemData && itemData.name) {
          return [itemData.name, itemData.player || 1];
        }
      }

      const regionsData = staticData?.regions;
      if (regionsData) {
        const regions = regionsData instanceof Map
          ? Array.from(regionsData.values())
          : Object.values(regionsData);

        for (const region of regions) {
          if (region?.locations) {
            const loc = region.locations.find(l => l.name === locationName);
            if (loc?.item?.name) {
              return [loc.item.name, loc.item.player || 1];
            }
          }
        }
      }

      log('debug', `[evaluateRule] placement_lookup: no item found at location '${locationName}'`);
      return null;
    },

    'placement_search': (rule, context, depth, localScope, isValidContext) => {
      const searchItem = evaluateRule(rule.item, context, depth + 1, localScope);
      const searchPlayer = evaluateRule(rule.player, context, depth + 1, localScope);
      const locations = evaluateRule(rule.locations, context, depth + 1, localScope);

      if (typeof searchItem !== 'string') {
        log('warn', '[evaluateRule] placement_search: item did not evaluate to string', { rule, searchItem });
        return false;
      }

      if (!Array.isArray(locations)) {
        log('warn', '[evaluateRule] placement_search: locations is not an array', { rule, locations });
        return false;
      }

      if (typeof context.getStaticData !== 'function') {
        log('warn', '[evaluateRule] placement_search: context.getStaticData not available');
        return false;
      }

      const staticData = context.getStaticData();

      for (const locEntry of locations) {
        let locName, locPlayer;
        if (Array.isArray(locEntry) && locEntry.length >= 2) {
          [locName, locPlayer] = locEntry;
        } else if (typeof locEntry === 'string') {
          locName = locEntry;
          locPlayer = searchPlayer;
        } else {
          continue;
        }
        if (typeof locName !== 'string') continue;

        let itemData = null;
        if (staticData?.locationItems) {
          itemData = staticData.locationItems instanceof Map
            ? staticData.locationItems.get(locName)
            : staticData.locationItems[locName];
        }

        if (!itemData?.name && staticData?.regions) {
          const regions = staticData.regions instanceof Map
            ? Array.from(staticData.regions.values())
            : Object.values(staticData.regions);

          for (const region of regions) {
            if (region?.locations) {
              const loc = region.locations.find(l => l.name === locName);
              if (loc?.item?.name) {
                itemData = { name: loc.item.name, player: loc.item.player || 1 };
                break;
              }
            }
          }
        }

        if (itemData?.name === searchItem && itemData?.player === locPlayer) {
          return true;
        }
      }
      return false;
    },
  };
}
