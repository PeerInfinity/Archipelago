/**
 * Item, location, region, and setting check AST handlers.
 *
 * Handles: item_check, count_check, count_item, group_check, group_count,
 * counts, prog_item_count, count_true, weighted_count_true, unique_count,
 * total_items_count, locations_checked, location_check, location_rule_ref,
 * region_check, option_value, world_attribute, setting_value, setting_check,
 * capability, value, constant, world_reference, tuple, name, f_string, player_id
 *
 * @module shared/ruleEngine/astChecks
 */

import { log, DEFAULT_PLAYER_ID } from './helpers.js';

export function createCheckHandlers(evaluateRule) {
  const handlers = {
    'count_true': (rule, context, depth, localScope, isValidContext) => {
      const requiredCount = rule.count || 0;
      const conditions = rule.conditions || [];

      if (requiredCount === 0) return true;
      if (conditions.length === 0) return requiredCount === 0;

      let trueCount = 0;
      let undefinedCount = 0;
      let result;

      for (const condition of conditions) {
        const conditionResult = evaluateRule(condition, context, depth + 1, localScope);
        if (conditionResult === true) {
          trueCount++;
        } else if (conditionResult === undefined) {
          undefinedCount++;
        }
        if (trueCount >= requiredCount) {
          result = true;
          break;
        }
      }

      if (result !== true) {
        if (trueCount >= requiredCount) {
          result = true;
        } else if (trueCount + undefinedCount >= requiredCount) {
          result = undefined;
        } else {
          result = false;
        }
      }
      return result;
    },

    'unique_count': (rule, context, depth, localScope, isValidContext) => {
      const argsArray = rule.args || [];
      if (argsArray.length < 2) {
        log('warn', '[evaluateRule] unique_count: missing args');
        return undefined;
      }

      const threshold = evaluateRule(argsArray[0], context, depth + 1, localScope);
      const items = evaluateRule(argsArray[1], context, depth + 1, localScope);

      if (typeof threshold !== 'number') {
        log('warn', '[evaluateRule] unique_count: invalid threshold', { threshold });
        return undefined;
      }

      if (!Array.isArray(items)) {
        log('warn', '[evaluateRule] unique_count: invalid items array', { items });
        return undefined;
      }

      let total = 0;
      let result;
      for (const item of items) {
        let itemName, weight;
        if (Array.isArray(item) && item.length >= 2) {
          [itemName, weight] = item;
        } else if (typeof item === 'string') {
          itemName = item;
          weight = 1;
        } else {
          continue;
        }

        let hasItem = false;
        if (typeof context.hasItem === 'function') {
          hasItem = context.hasItem(itemName);
        } else if (typeof context.countItem === 'function') {
          hasItem = (context.countItem(itemName) || 0) > 0;
        }

        if (hasItem) {
          total += weight;
        }

        if (total >= threshold) {
          result = true;
          break;
        }
      }

      if (result !== true) {
        result = total >= threshold;
      }
      return result;
    },

    'weighted_count_true': (rule, context, depth, localScope, isValidContext) => {
      const requiredCount = rule.count || 0;
      const weightedConditions = rule.weighted_conditions || [];

      if (requiredCount === 0) return true;
      if (weightedConditions.length === 0) return requiredCount === 0;

      let weightSum = 0;
      let undefinedWeightSum = 0;
      let result;

      for (const [condition, weight] of weightedConditions) {
        const conditionResult = evaluateRule(condition, context, depth + 1, localScope);
        if (conditionResult === true) {
          weightSum += weight;
        } else if (conditionResult === undefined) {
          undefinedWeightSum += weight;
        }
        if (weightSum >= requiredCount) {
          result = true;
          break;
        }
      }

      if (result !== true) {
        if (weightSum >= requiredCount) {
          result = true;
        } else if (weightSum + undefinedWeightSum >= requiredCount) {
          result = undefined;
        } else {
          result = false;
        }
      }
      return result;
    },

    'value': (rule, context, depth, localScope, isValidContext) => {
      const constValue = rule.value;

      if (constValue !== null && typeof constValue === 'object') {
        if (Array.isArray(constValue)) {
          return constValue.map(elem => {
            if (elem && typeof elem === 'object' && (elem.type || elem.rule)) {
              return evaluateRule(elem, context, depth + 1, localScope);
            }
            return elem;
          });
        } else {
          const hasNestedRules = Object.values(constValue).some(
            v => v && typeof v === 'object' && (v.type || v.rule)
          );

          if (hasNestedRules) {
            const result = {};
            for (const [key, val] of Object.entries(constValue)) {
              if (val && typeof val === 'object' && (val.type || val.rule)) {
                result[key] = evaluateRule(val, context, depth + 1, localScope);
              } else {
                result[key] = val;
              }
            }
            return result;
          } else {
            return constValue;
          }
        }
      } else {
        return constValue;
      }
    },

    'world_reference': (rule, context, depth, localScope, isValidContext) => {
      return null;
    },

    'tuple': (rule, context, depth, localScope, isValidContext) => {
      if (!rule.elements || !Array.isArray(rule.elements)) {
        return [];
      }
      const elements = rule.elements.map((elem) => evaluateRule(elem, context, depth + 1));
      if (elements.some((elem) => elem === undefined)) {
        return undefined;
      }
      return elements;
    },

    'total_items_count': (rule, context, depth, localScope, isValidContext) => {
      const requiredCount = evaluateRule(rule.count, context, depth + 1);
      if (requiredCount === undefined) {
        return undefined;
      } else if (typeof context.getTotalItemCount === 'function') {
        const totalCount = context.getTotalItemCount();
        return totalCount >= requiredCount;
      } else if (context.snapshot && context.snapshot.inventory) {
        let totalCount = 0;
        for (const itemName in context.snapshot.inventory) {
          totalCount += context.snapshot.inventory[itemName] || 0;
        }
        return totalCount >= requiredCount;
      } else {
        log('warn', '[evaluateRule] No way to get total item count for total_items_count rule.');
        return undefined;
      }
    },

    'locations_checked': (rule, context, depth, localScope, isValidContext) => {
      const requiredCount = evaluateRule(rule.count, context, depth + 1);
      if (requiredCount === undefined) {
        return undefined;
      } else if (typeof context.getCheckedLocationsCount === 'function') {
        const checkedCount = context.getCheckedLocationsCount();
        return checkedCount >= requiredCount;
      } else {
        log('warn', '[evaluateRule] context.getCheckedLocationsCount is not a function for locations_checked.');
        return undefined;
      }
    },

    'item_check': (rule, context, depth, localScope, isValidContext) => {
      const itemName = evaluateRule(rule.item, context, depth + 1, localScope);
      if (itemName === undefined) {
        return undefined;
      } else if (rule.count !== undefined) {
        let requiredCount = evaluateRule(rule.count, context, depth + 1, localScope);
        if (requiredCount && typeof requiredCount === 'object' && requiredCount.__isReturn) {
          requiredCount = requiredCount.value;
        }
        if (requiredCount === undefined) {
          return undefined;
        } else if (typeof context.countItem === 'function') {
          const currentCount = context.countItem(itemName);
          if (currentCount === undefined) {
            return undefined;
          }
          return currentCount >= requiredCount;
        } else {
          log('warn', '[evaluateRule SnapshotIF] context.countItem is not a function for item_check with count.');
          return undefined;
        }
      } else if (typeof context.hasItem === 'function') {
        return context.hasItem(itemName);
      } else {
        log('warn', '[evaluateRule SnapshotIF] context.hasItem is not a function for item_check.');
        return undefined;
      }
    },

    'location_check': (rule, context, depth, localScope, isValidContext) => {
      const locationName = evaluateRule(rule.location, context, depth + 1, localScope);
      if (locationName === undefined) {
        return undefined;
      } else if (typeof context.isLocationAccessible === 'function') {
        const result = context.isLocationAccessible(locationName);
        if (result === undefined) {
          log('warn', `[evaluateRule] Location ${locationName} accessibility could not be determined`);
        }
        return result;
      } else {
        log('warn', '[evaluateRule] context.isLocationAccessible is not a function for location_check.');
        return undefined;
      }
    },

    'location_rule_ref': (rule, context, depth, localScope, isValidContext) => {
      const locationName = typeof rule.location === 'string'
        ? rule.location
        : evaluateRule(rule.location, context, depth + 1, localScope);

      if (typeof locationName !== 'string') {
        log('warn', '[evaluateRule] location_rule_ref: location did not evaluate to string', { rule, locationName });
        return undefined;
      }

      if (typeof context.getStaticData !== 'function') {
        log('warn', '[evaluateRule] location_rule_ref: context.getStaticData not available');
        return undefined;
      }

      const staticData = context.getStaticData();
      const regionsData = staticData?.regions;

      if (!regionsData) {
        log('warn', '[evaluateRule] location_rule_ref: no regions data in staticData');
        return undefined;
      }

      let locationData = null;
      if (regionsData instanceof Map) {
        for (const [regionName, regionData] of regionsData.entries()) {
          if (regionData.locations) {
            const loc = regionData.locations.find(l => l.name === locationName);
            if (loc) {
              locationData = loc;
              break;
            }
          }
        }
      } else {
        for (const regionData of Object.values(regionsData)) {
          if (regionData.locations) {
            const loc = regionData.locations.find(l => l.name === locationName);
            if (loc) {
              locationData = loc;
              break;
            }
          }
        }
      }

      if (!locationData) {
        log('debug', `[evaluateRule] location_rule_ref: location '${locationName}' not found`);
        return undefined;
      }

      if (locationData.access_rule) {
        return evaluateRule(locationData.access_rule, context, depth + 1, localScope);
      } else {
        return true;
      }
    },

    'region_check': (rule, context, depth, localScope, isValidContext) => {
      const regionName = evaluateRule(rule.region, context, depth + 1);
      if (regionName === undefined) {
        return undefined;
      } else if (typeof context.isRegionAccessible === 'function') {
        const result = context.isRegionAccessible(regionName);
        if (result === undefined) {
          log('warn', `[evaluateRule] Region ${regionName} accessibility could not be determined`);
        }
        return result;
      } else {
        log('warn', '[evaluateRule] context.isRegionAccessible is not a function for region_check.');
        return undefined;
      }
    },

    'count_check': (rule, context, depth, localScope, isValidContext) => {
      const itemName = evaluateRule(rule.item, context, depth + 1);
      const requiredCount =
        rule.count !== undefined
          ? evaluateRule(rule.count, context, depth + 1)
          : 1;

      if (itemName === undefined || requiredCount === undefined) {
        return undefined;
      } else if (typeof context.countItem === 'function') {
        const currentCount = context.countItem(itemName);
        return currentCount === undefined
          ? undefined
          : (currentCount || 0) >= requiredCount;
      } else {
        log('warn', '[evaluateRule SnapshotIF] context.countItem is not a function for count_check.');
        return undefined;
      }
    },

    'group_check': (rule, context, depth, localScope, isValidContext) => {
      const groupName = evaluateRule(rule.group, context, depth + 1, localScope);
      const requiredCount =
        rule.count !== undefined
          ? evaluateRule(rule.count, context, depth + 1, localScope)
          : 1;

      if (groupName === undefined || requiredCount === undefined) {
        return undefined;
      } else if (typeof context.countGroup === 'function') {
        const currentCount = context.countGroup(groupName);
        return currentCount === undefined
          ? undefined
          : (currentCount || 0) >= requiredCount;
      } else {
        log('warn', '[evaluateRule SnapshotIF] context.countGroup is not a function for group_check.');
        return undefined;
      }
    },

    'group_count': (rule, context, depth, localScope, isValidContext) => {
      const groupName = evaluateRule(rule.group, context, depth + 1, localScope);

      if (groupName === undefined) {
        return undefined;
      } else if (typeof context.countGroup === 'function') {
        const currentCount = context.countGroup(groupName);
        return currentCount === undefined ? 0 : currentCount;
      } else {
        log('warn', '[evaluateRule SnapshotIF] context.countGroup is not a function for group_count.');
        return undefined;
      }
    },

    'counts': (rule, context, depth, localScope, isValidContext) => {
      const countItems = rule.items || [];
      const requiredCount = evaluateRule(rule.count, context, depth + 1, localScope);

      if (requiredCount === undefined) return undefined;

      let totalItemCount = 0;
      let hasUndefined = false;

      for (const item of countItems) {
        const itemName = typeof item === 'string' ? item : evaluateRule(item, context, depth + 1, localScope);
        if (itemName === undefined) {
          hasUndefined = true;
          break;
        }
        const itemCount = typeof context.countItem === 'function'
          ? (context.countItem(itemName) ?? 0)
          : 0;
        totalItemCount += itemCount;
      }

      if (hasUndefined) return undefined;
      return totalItemCount >= requiredCount;
    },

    'prog_item_count': (rule, context, depth, localScope, isValidContext) => {
      const progKey = rule.key;
      if (progKey === undefined) {
        log('warn', '[evaluateRule] prog_item_count: missing key');
        return undefined;
      } else if (typeof context.countProgItem === 'function') {
        return context.countProgItem(progKey) ?? 0;
      } else {
        const snapshot = context.snapshot || context;
        const playerId = context.playerId || context.getPlayerId?.() || 1;
        const progItems = snapshot?.prog_items;
        const count =
          progItems?.[playerId]?.[progKey] ??
          progItems?.[String(playerId)]?.[progKey] ??
          progItems?.[parseInt(playerId)]?.[progKey] ??
          0;
        return count;
      }
    },

    'player_id': (rule, context, depth, localScope, isValidContext) => {
      if (typeof context.getPlayerId === 'function') {
        return context.getPlayerId();
      } else if (context.playerId !== undefined) {
        return context.playerId;
      } else if (typeof context.getPlayerSlot === 'function') {
        return context.getPlayerSlot();
      } else {
        log('debug', '[evaluateRule] player_id: No player ID available in context, defaulting to 1');
        return 1;
      }
    },

    'option_value': (rule, context, depth, localScope, isValidContext) => {
      let settingName = rule.option || rule.setting || rule.attribute;
      if (typeof settingName === 'string') {
        let rawValue;
        if (settingName.includes('.')) {
          const parts = settingName.split('.');
          rawValue = context.getSetting(parts[0]);
          for (let i = 1; i < parts.length && rawValue !== undefined; i++) {
            rawValue = rawValue?.[parts[i]];
          }
        } else {
          rawValue = context.getSetting(settingName);
        }
        let result;
        if (rule.index !== undefined && rawValue !== undefined) {
          if (Array.isArray(rawValue)) {
            result = rawValue[rule.index];
          } else {
            log('warn', `[evaluateRule] ${rule.type} has index but value is not an array`, { rule, rawValue });
            result = undefined;
          }
        } else {
          result = rawValue;
        }

        if (rule.use_current_key && result !== undefined && typeof context.getStaticData === 'function') {
          const staticData = context.getStaticData();
          const playerId = context.playerId || context.getPlayerId?.() || context.getPlayerSlot?.() || DEFAULT_PLAYER_ID;
          const playerIdKey = String(playerId);
          const optionDefs = staticData?.world?.[playerIdKey]?.option_definitions;
          const optionDef = optionDefs?.[settingName];
          if (optionDef?.name_lookup) {
            const stringKey = optionDef.name_lookup[String(result)];
            if (stringKey !== undefined) {
              log('debug', `[evaluateRule] setting_value use_current_key: converted ${settingName}=${result} to "${stringKey}"`);
              result = stringKey;
            }
          }
        }
        return result;
      } else {
        log('warn', `[evaluateRule] Invalid name for ${rule.type}`, { rule, settingName });
        return undefined;
      }
    },

    'f_string': (rule, context, depth, localScope, isValidContext) => {
      if (!rule.parts || !Array.isArray(rule.parts)) {
        log('warn', '[evaluateRule] f_string rule missing parts array', { rule });
        return undefined;
      }

      let resultStr = '';
      let hasError = false;
      for (const part of rule.parts) {
        if (part.type === 'constant') {
          resultStr += part.value;
        } else if (part.type === 'formatted_value') {
          const value = evaluateRule(part.value, context, depth + 1, localScope);
          if (value === undefined) {
            log('warn', '[evaluateRule] f_string formatted_value evaluated to undefined', { part });
            hasError = true;
            break;
          }
          resultStr += String(value);
        } else {
          log('warn', '[evaluateRule] Unknown f_string part type', { part });
          hasError = true;
          break;
        }
      }

      return hasError ? undefined : resultStr;
    },

    'setting_check': (rule, context, depth, localScope, isValidContext) => {
      let settingName = evaluateRule(rule.setting, context, depth + 1);
      let expectedValue = evaluateRule(rule.value, context, depth + 1);

      if (settingName === undefined || expectedValue === undefined) {
        return undefined;
      } else if (typeof settingName === 'string') {
        const actualValue = context.getSetting(settingName);
        return actualValue === undefined ? undefined : actualValue === expectedValue;
      } else {
        log('warn', '[evaluateRule] Invalid setting name for setting_check', { rule, settingName });
        return undefined;
      }
    },

    'name': (rule, context, depth, localScope, isValidContext) => {
      // First check local scope
      if (localScope !== null && rule.name in localScope) {
        return localScope[rule.name];
      }

      let result;
      // Resolve name using the context's resolveName method if available
      if (context && typeof context.resolveName === 'function') {
        result = context.resolveName(rule.name);
      }

      if (result === undefined && typeof context?.getStaticData === 'function') {
        const staticData = context.getStaticData();
        const playerId = context.playerId || context.getPlayerId?.() || context.getPlayerSlot?.() || DEFAULT_PLAYER_ID;

        if (rule.name === 'world') {
          const worldData = staticData?.world?.[playerId];
          if (worldData !== undefined) {
            log('debug', `[evaluateRule] Resolved 'world' to world data object`);
            return worldData;
          }
        }

        const settingValue = staticData?.world?.[playerId]?.[rule.name];
        if (settingValue !== undefined) {
          result = settingValue;
          log('debug', `[evaluateRule] Resolved name '${rule.name}' from world/settings: ${typeof result === 'object' ? 'object' : result}`);
        }
      }

      if (result === undefined) {
        log('debug', `[evaluateRule] Could not resolve name: ${rule.name}`);
      }
      return result;
    },

    'capability': (rule, context, depth, localScope, isValidContext) => {
      const capabilityName = rule.capability;
      if (!capabilityName) {
        log('warn', '[evaluateRule] Capability rule missing capability name', { rule });
        return undefined;
      }

      const helperName = `can_${capabilityName}`;

      if (!isValidContext || typeof context.executeHelper !== 'function') {
        log('warn', `[evaluateRule] Cannot execute capability helper '${helperName}' - invalid context`);
        return undefined;
      }

      return context.executeHelper(helperName);
    },

    'count_item': (rule, context, depth, localScope, isValidContext) => {
      const itemName = typeof rule.item === 'string'
        ? rule.item
        : evaluateRule(rule.item, context, depth + 1, localScope);

      if (itemName === undefined) return 0;

      if (typeof context?.countItem === 'function') {
        return context.countItem(itemName) || 0;
      } else {
        log('warn', '[evaluateRule] context.countItem not available for count_item');
        return 0;
      }
    },
  };

  // Add aliases
  handlers['constant'] = handlers['value'];
  handlers['world_attribute'] = handlers['option_value'];
  handlers['setting_value'] = handlers['option_value'];

  return handlers;
}
