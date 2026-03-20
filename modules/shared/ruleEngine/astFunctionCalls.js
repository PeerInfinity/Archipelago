/**
 * Function call AST handler.
 *
 * Handles: function_call
 *
 * @module shared/ruleEngine/astFunctionCalls
 */

import { log, DEFAULT_PLAYER_ID } from './helpers.js';

export function createFunctionCallHandlers(evaluateRule) {
  return {
    'function_call': (rule, context, depth, localScope, isValidContext) => {
      let result;

      // Special handling for state method calls like state.has(), state.count(), etc.
      if (rule.function?.type === 'attribute' &&
          rule.function.object?.type === 'constant' &&
          rule.function.object.value === true) {

        const methodName = rule.function.attr;
        const methodArgs = (rule.args || []).map(
          (arg) => evaluateRule(arg, context, depth + 1, localScope)
        );

        if (methodArgs.some((arg) => arg === undefined)) {
          return undefined;
        }

        let handled = true;
        switch (methodName) {
          case 'has':
            if (typeof context.hasItem === 'function') {
              result = context.hasItem(methodArgs[0]);
            } else {
              result = evaluateRule({ type: 'item_check', item: methodArgs[0] }, context, depth + 1, localScope);
            }
            break;
          case 'count':
            if (typeof context.countItem === 'function') {
              result = context.countItem(methodArgs[0]);
            } else {
              result = evaluateRule({ type: 'count_item', item: methodArgs[0] }, context, depth + 1, localScope);
            }
            break;
          case 'can_reach':
            if (typeof context.canReach === 'function') {
              result = context.canReach(methodArgs[0]);
            } else {
              result = evaluateRule({ type: 'can_reach', region: methodArgs[0] }, context, depth + 1, localScope);
            }
            break;
          case 'has_group':
            if (typeof context.hasGroup === 'function') {
              result = context.hasGroup(methodArgs[0], methodArgs[1] || 1);
            } else {
              result = evaluateRule({ type: 'group_check', group: methodArgs[0], count: methodArgs[1] || 1 }, context, depth + 1, localScope);
            }
            break;
          default:
            handled = false;
        }

        if (handled) return result;

        // For SMZ3 and other game-specific methods
        const helperName = `smz3_${methodName}`;

        if (context.executeHelper) {
          try {
            result = context.executeHelper(helperName, ...methodArgs);
            return result;
          } catch (error) {
            log('error', `[ruleEngine] [evaluateRule] Failed to execute state method helper '${helperName}':`, error);
            return undefined;
          }
        } else {
          log('error', `[ruleEngine] [evaluateRule] No executeHelper method in context for state method '${helperName}'`);
          return undefined;
        }
      }

      // Special handling for math module functions
      if (
        rule.function?.type === 'attribute' &&
        rule.function.object?.type === 'name' &&
        rule.function.object.name === 'math'
      ) {
        const mathFunc = rule.function.attr;
        const args = (rule.args || []).map(arg => evaluateRule(arg, context, depth + 1, localScope));

        switch (mathFunc) {
          case 'sqrt':
            return (typeof args[0] === 'number' && args[0] >= 0) ? Math.sqrt(args[0]) : undefined;
          case 'pow':
            return (typeof args[0] === 'number' && typeof args[1] === 'number') ? Math.pow(args[0], args[1]) : undefined;
          case 'floor':
            return (typeof args[0] === 'number') ? Math.floor(args[0]) : undefined;
          case 'ceil':
            return (typeof args[0] === 'number') ? Math.ceil(args[0]) : undefined;
          case 'abs':
            return (typeof args[0] === 'number') ? Math.abs(args[0]) : undefined;
          default:
            log('warn', `[evaluateRule] Unknown math function: math.${mathFunc}`);
            return undefined;
        }
      }

      // Special handling for state.multiworld.get_location() calls
      if (rule.function?.type === 'attribute' &&
          rule.function.attr === 'get_location' &&
          rule.function.object?.type === 'attribute' &&
          rule.function.object.attr === 'multiworld') {

        const args = rule.args ? rule.args.map(arg => evaluateRule(arg, context, depth + 1, localScope)) : [];
        const locationName = args[0];

        if (context.currentLocation && context.currentLocation.name === locationName) {
          return {
            name: context.currentLocation.name,
            parent_region: context.currentLocation.parent_region ||
                         (context.currentLocation.region ?
                           context.getStaticData?.().regions?.[context.currentLocation.region] :
                           undefined),
            parent_region_name: context.currentLocation.region
          };
        }

        if (context.getStaticData) {
          const staticData = context.getStaticData();
          for (const [regionName, regionData] of staticData.regions.entries()) {
            if (regionData.locations) {
              const location = regionData.locations.find(loc => loc.name === locationName);
              if (location) {
                return {
                  name: location.name,
                  parent_region: regionData,
                  parent_region_name: regionName
                };
              }
            }
          }
        }
        return undefined;
      }

      // Special handling for state.multiworld.get_entrance() calls
      if (rule.function?.type === 'attribute' &&
          rule.function.attr === 'get_entrance' &&
          rule.function.object?.type === 'attribute' &&
          rule.function.object.attr === 'multiworld') {

        const args = rule.args ? rule.args.map(arg => evaluateRule(arg, context, depth + 1, localScope)) : [];
        const exitName = args[0];

        if (context.currentExit && context.currentExit === exitName) {
          return {
            __entranceRef: true,
            name: exitName,
            parent_region: context.parent_region
          };
        }

        if (context.getStaticData) {
          const staticData = context.getStaticData();
          for (const [regionName, regionData] of staticData.regions.entries()) {
            if (regionData.exits) {
              const exit = regionData.exits.find(ex => ex.name === exitName);
              if (exit) {
                return {
                  __entranceRef: true,
                  name: exit.name,
                  parent_region: regionData,
                  parent_region_name: regionName,
                  access_rule: exit.access_rule
                };
              }
            }
          }
        }
        return undefined;
      }

      // Special handling for world.get_region() calls
      if (rule.function?.type === 'attribute' &&
          rule.function.attr === 'get_region' &&
          rule.function.object?.type === 'name' &&
          rule.function.object.name === 'world') {

        const args = rule.args ? rule.args.map(arg => evaluateRule(arg, context, depth + 1, localScope)) : [];
        const regionName = args[0];

        if (!regionName) {
          log('warn', '[evaluateRule] world.get_region() called without region name');
          return undefined;
        }

        if (context.getStaticData) {
          const staticData = context.getStaticData();
          const playerId = context.playerId || context.getPlayerId?.() || context.getPlayerSlot?.() || DEFAULT_PLAYER_ID;
          const playerIdStr = String(playerId);

          let regionsData = staticData.regions;
          if (regionsData && regionsData[playerIdStr]) {
            regionsData = regionsData[playerIdStr];
          }

          let regionData;
          if (regionsData instanceof Map) {
            regionData = regionsData.get(regionName);
          } else if (regionsData && typeof regionsData === 'object') {
            regionData = regionsData[regionName];
          }

          if (regionData) {
            return {
              __regionRef: true,
              regionName: regionName,
              name: regionName,
              is_light_world: regionData.is_light_world ?? false,
              is_dark_world: regionData.is_dark_world ?? false,
              type: regionData.type,
              dungeon: regionData.dungeon
            };
          }
        }
        return undefined;
      }

      // Special handling for world.get_entrance() calls
      if (rule.function?.type === 'attribute' &&
          rule.function.attr === 'get_entrance' &&
          rule.function.object?.type === 'name' &&
          rule.function.object.name === 'world') {

        const args = rule.args ? rule.args.map(arg => evaluateRule(arg, context, depth + 1, localScope)) : [];
        const entranceName = args[0];

        if (!entranceName) {
          log('warn', '[evaluateRule] world.get_entrance() called without entrance name');
          return undefined;
        }

        if (context.getStaticData) {
          const staticData = context.getStaticData();
          for (const [regionName, regionData] of staticData.regions.entries()) {
            if (regionData.exits) {
              const exit = regionData.exits.find(ex => ex.name === entranceName);
              if (exit) {
                return {
                  name: exit.name,
                  connected_region: { name: exit.connected_region },
                  parent_region: { name: regionName }
                };
              }
            }
          }
        }
        return undefined;
      }

      // Special handling for shop.has(item) method calls
      if (rule.function?.type === 'attribute' &&
          rule.function.attr === 'has' &&
          rule.function.object?.type === 'name') {
        const shopObj = evaluateRule(rule.function.object, context, depth + 1, localScope);
        if (shopObj && Array.isArray(shopObj.inventory)) {
          const args = (rule.args || []).map(arg => evaluateRule(arg, context, depth + 1, localScope));
          const itemName = args[0];
          return shopObj.inventory.some(inv => inv && inv.item === itemName);
        }
      }

      // Special handling for shop.has_unlimited(item) method calls
      if (rule.function?.type === 'attribute' &&
          rule.function.attr === 'has_unlimited' &&
          rule.function.object?.type === 'name') {
        const shopObj = evaluateRule(rule.function.object, context, depth + 1, localScope);
        if (shopObj) {
          const args = (rule.args || []).map(arg => evaluateRule(arg, context, depth + 1, localScope));
          const itemName = args[0];

          if (Array.isArray(shopObj.unlimited_items)) {
            return shopObj.unlimited_items.includes(itemName);
          }

          if (Array.isArray(shopObj.inventory)) {
            return shopObj.inventory.some(inv => {
              if (!inv) return false;
              if (!inv.max && inv.item === itemName) return true;
              if (inv.max && inv.replacement === itemName) return true;
              return false;
            });
          }
        }
      }

      // Special handling for boss.can_defeat function calls
      if (
        rule.function?.type === 'attribute' &&
        rule.function.attr === 'can_defeat'
      ) {
        let current = rule.function.object;
        let isDungeomBossDefeat = false;

        if (current && current.type === 'subscript') {
          let subscriptValue = current.value;
          while (subscriptValue && subscriptValue.type === 'attribute') {
            if (subscriptValue.attr === 'bosses' || subscriptValue.attr === 'boss') {
              isDungeomBossDefeat = true;
              break;
            }
            subscriptValue = subscriptValue.object;
          }
        }

        while (current && current.type === 'attribute') {
          if (current.attr === 'boss' || current.attr === 'bosses') {
            isDungeomBossDefeat = true;
            break;
          }
          current = current.object;
        }

        if (isDungeomBossDefeat) {
          const bossObject = evaluateRule(rule.function.object, context, depth + 1, localScope);

          if (bossObject && bossObject.defeat_rule) {
            return evaluateRule(bossObject.defeat_rule, context, depth + 1, localScope);
          }
          return undefined;
        }
      }

      // Special handling for variable.can_reach() calls where variable is a region reference
      if (
        rule.function?.type === 'attribute' &&
        rule.function.attr === 'can_reach' &&
        rule.function.object?.type === 'name'
      ) {
        const varName = rule.function.object.name;
        let regionRef = localScope?.[varName];

        if (regionRef && regionRef.__regionRef) {
          const regionName = regionRef.regionName;
          if (typeof context.isRegionReachable === 'function') {
            return context.isRegionReachable(regionName);
          }
          log('warn', `[evaluateRule] Cannot check region reachability for '${regionName}' - context.isRegionReachable not available`);
          return undefined;
        }
      }

      // Special handling for self.method_name() calls
      if (
        rule.function?.type === 'attribute' &&
        rule.function.object?.type === 'name' &&
        rule.function.object.name === 'self'
      ) {
        const helperName = rule.function.attr;
        const args = (rule.args || []).map(
          (arg) => evaluateRule(arg, context, depth + 1, localScope)
        );

        if (args.some((arg) => arg === undefined)) return undefined;

        if (context.executeHelper) {
          try {
            return context.executeHelper(helperName, ...args);
          } catch (error) {
            log('error', `[ruleEngine] [evaluateRule] Failed to execute helper '${helperName}':`, error);
            return undefined;
          }
        } else {
          log('error', `[ruleEngine] [evaluateRule] No executeHelper method in context for helper '${helperName}'`);
          return undefined;
        }
      }

      // Special handling for true.method(...) calls (state method placeholder pattern)
      // Note: This block handles the duplicate case for constant true
      if (
        rule.function?.type === 'attribute' &&
        rule.function.object?.type === 'constant' &&
        rule.function.object.value === true
      ) {
        const methodName = rule.function.attr;
        const methodArgs = (rule.args || []).map(
          (arg) => evaluateRule(arg, context, depth + 1, localScope)
        );

        switch (methodName) {
          case 'has':
            if (typeof context.hasItem === 'function') {
              return context.hasItem(methodArgs[0]);
            }
            return evaluateRule({ type: 'item_check', item: methodArgs[0] }, context, depth + 1, localScope);
          case 'count':
            if (typeof context.countItem === 'function') {
              return context.countItem(methodArgs[0]);
            }
            return evaluateRule({ type: 'count_item', item: methodArgs[0] }, context, depth + 1, localScope);
          case 'can_reach':
            if (typeof context.canReach === 'function') {
              return context.canReach(methodArgs[0]);
            }
            return evaluateRule({ type: 'can_reach', region: methodArgs[0] }, context, depth + 1, localScope);
          case 'has_group':
            if (typeof context.hasGroup === 'function') {
              return context.hasGroup(methodArgs[0], methodArgs[1] || 1);
            }
            return evaluateRule({ type: 'group_check', group: methodArgs[0], count: methodArgs[1] || 1 }, context, depth + 1, localScope);
          default:
            if (typeof context.executeHelper === 'function') {
              try {
                return context.executeHelper(methodName, ...methodArgs);
              } catch (error) {
                log('warn', `[evaluateRule] State method '${methodName}' not recognized, trying as helper`);
                return undefined;
              }
            }
            log('warn', `[evaluateRule] Unknown state method: ${methodName}`);
            return undefined;
        }
      }

      // Special handling for dict.get(key, default) pattern
      if (
        rule.function?.type === 'attribute' &&
        rule.function.attr === 'get' &&
        rule.function.object
      ) {
        const obj = evaluateRule(rule.function.object, context, depth + 1, localScope);
        if (obj && typeof obj === 'object' && !Array.isArray(obj) && !(obj instanceof Map)) {
          const args = (rule.args || []).map(arg => evaluateRule(arg, context, depth + 1, localScope));
          const key = args[0];
          const defaultValue = args.length > 1 ? args[1] : undefined;

          if (key !== undefined && Object.prototype.hasOwnProperty.call(obj, key)) {
            return obj[key];
          }
          return defaultValue;
        }
      }

      // Special handling for dict.items(), dict.keys(), dict.values() patterns
      if (
        rule.function?.type === 'attribute' &&
        ['items', 'keys', 'values'].includes(rule.function.attr) &&
        rule.function.object
      ) {
        const obj = evaluateRule(rule.function.object, context, depth + 1, localScope);
        if (obj && typeof obj === 'object' && !Array.isArray(obj) && !(obj instanceof Map)) {
          switch (rule.function.attr) {
            case 'items':
              return Object.entries(obj);
            case 'keys':
              return Object.keys(obj);
            case 'values':
              return Object.values(obj);
          }
        }
      }

      // Special handling for Python array/list methods like .count()
      if (
        rule.function?.type === 'attribute' &&
        rule.function.attr === 'count' &&
        rule.function.object
      ) {
        const obj = evaluateRule(rule.function.object, context, depth + 1, localScope);
        if (Array.isArray(obj)) {
          const args = (rule.args || []).map(arg => evaluateRule(arg, context, depth + 1, localScope));
          const searchValue = args[0];
          return obj.filter(x => x === searchValue).length;
        }
      }

      // Special handling for Python string methods
      if (
        rule.function?.type === 'attribute' &&
        rule.function.object
      ) {
        const strMethodName = rule.function.attr;
        const pythonStringMethods = ['capitalize', 'upper', 'lower', 'strip', 'lstrip', 'rstrip',
                                     'startswith', 'endswith', 'replace', 'split', 'join'];

        if (pythonStringMethods.includes(strMethodName)) {
          const obj = evaluateRule(rule.function.object, context, depth + 1, localScope);

          if (typeof obj === 'string') {
            const args = (rule.args || []).map(arg => evaluateRule(arg, context, depth + 1, localScope));

            switch (strMethodName) {
              case 'capitalize':
                return obj.length > 0 ? obj.charAt(0).toUpperCase() + obj.slice(1).toLowerCase() : '';
              case 'upper':
                return obj.toUpperCase();
              case 'lower':
                return obj.toLowerCase();
              case 'strip':
                return obj.trim();
              case 'lstrip':
                return obj.trimStart();
              case 'rstrip':
                return obj.trimEnd();
              case 'startswith':
                return obj.startsWith(args[0]);
              case 'endswith':
                return obj.endsWith(args[0]);
              case 'replace':
                return obj.replace(args[0], args[1] || '');
              case 'split':
                return args[0] ? obj.split(args[0]) : obj.split('');
              case 'join':
                return Array.isArray(args[0]) ? args[0].join(obj) : String(args[0]);
              default:
                return undefined;
            }
          }
        }
      }

      const func = evaluateRule(rule.function, context, depth + 1, localScope);

      if (typeof func === 'undefined') return undefined;

      // Special case: __regionCanReach marker
      if (func && typeof func === 'object' && func.__regionCanReach) {
        const regionName = func.regionName;
        if (typeof context.isRegionReachable === 'function') {
          return context.isRegionReachable(regionName);
        }
        log('warn', `[evaluateRule] Cannot check region reachability for '${regionName}' - context.isRegionReachable not available`);
        return undefined;
      }

      // Special case: __entranceCanReach marker
      if (func && typeof func === 'object' && func.__entranceCanReach) {
        const { parentRegionName, accessRule } = func;

        let parentReachable = false;
        if (typeof context.isRegionReachable === 'function' && parentRegionName) {
          parentReachable = context.isRegionReachable(parentRegionName);
        }

        if (!parentReachable) return false;

        if (accessRule) {
          return evaluateRule(accessRule, context, depth + 1, localScope);
        }
        return true;
      }

      // Special case: func is a rule object
      if (func && typeof func === 'object' && func.type && typeof func.type === 'string') {
        return evaluateRule(func, context, depth + 1, localScope);
      }

      // Special case: func is a boolean
      if (typeof func === 'boolean') return func;

      // Special case: Dynamic function dispatch
      if (typeof func === 'string') {
        const helperName = func;
        const callArgs = (rule.args || []).map(
          (arg) => evaluateRule(arg, context, depth + 1, localScope)
        );

        if (callArgs.some((arg) => arg === undefined)) return undefined;

        // First, check for a JSON helper definition
        if (typeof context?.getStaticData === 'function') {
          const staticData = context.getStaticData();
          const playerId = context.playerId || context.getPlayerId?.() || context.getPlayerSlot?.() || DEFAULT_PLAYER_ID;
          const playerIdKey = String(playerId);
          const helperDefinition = staticData?.helpers?.[playerIdKey]?.[helperName];

          if (helperDefinition) {
            const params = helperDefinition.params || [];
            const defaults = helperDefinition.defaults || {};
            const body = helperDefinition.body || helperDefinition;

            let helperLocalScope = localScope ? { ...localScope } : {};

            for (const paramName of params) {
              if (paramName in defaults) {
                helperLocalScope[paramName] = defaults[paramName];
              }
            }

            for (let i = 0; i < params.length && i < callArgs.length; i++) {
              helperLocalScope[params[i]] = callArgs[i];
            }

            result = evaluateRule(body, context, depth + 1, helperLocalScope);

            if (result && typeof result === 'object' && result.__isReturn) {
              result = result.value;
            }

            if (result !== undefined) {
              log('debug', `[evaluateRule] Dynamic helper (JSON) '${helperName}' returned: ${result}`);
              return result;
            }
          }
        }

        // Fallback: Call the helper function through context.executeHelper
        if (context.executeHelper) {
          try {
            result = context.executeHelper(helperName, ...callArgs);
            log('debug', `[evaluateRule] Dynamic helper (JS) '${helperName}' returned: ${result}`);
          } catch (error) {
            log('error', `[evaluateRule] Failed to execute dynamic helper '${helperName}':`, error);
            result = undefined;
          }
        } else {
          log('warn', `[evaluateRule] No executeHelper method in context for dynamic helper '${helperName}'`);
          result = undefined;
        }
        return result;
      }

      const args = (rule.args || []).map(
        (arg) => evaluateRule(arg, context, depth + 1, localScope)
      );

      if (args.some((arg) => arg === undefined)) return undefined;

      if (typeof func === 'function') {
        try {
          let thisContext = null;
          if (rule.function?.type === 'attribute' && rule.function.object) {
            thisContext = evaluateRule(rule.function.object, context, depth + 1, localScope);
          } else {
            thisContext = context;
          }

          if (thisContext === null || typeof thisContext === 'undefined') {
            log('warn', "[evaluateRule FunctionCall] Resolved 'this' context is null/undefined. Using main context.", rule.function);
            thisContext = context;
          }

          result = func.apply(thisContext, args);
        } catch (e) {
          let funcName = 'unknown';
          if (rule.function?.type === 'attribute') {
            funcName = rule.function.attr;
          } else if (rule.function?.type === 'value') {
            funcName = rule.function.value;
          } else if (rule.function?.type === 'name') {
            funcName = rule.function.name;
          }
          log('error', `[evaluateRule] Error executing function call '${funcName}':`, e, {
            rule,
            contextType: isValidContext ? 'snapshotIF' : 'worker',
          });
          result = undefined;
        }
      } else {
        log('warn', `[evaluateRule] Resolved identifier is not a function:`, {
          identifier: rule.function,
          resolvedValue: func,
        });
        result = undefined;
      }
      return result;
    },
  };
}
