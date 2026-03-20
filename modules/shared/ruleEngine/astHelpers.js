/**
 * Helper function AST handlers.
 *
 * Handles: helper, generic_helper, state_method
 *
 * @module shared/ruleEngine/astHelpers
 */

import { log, DEFAULT_PLAYER_ID } from './helpers.js';

export function createHelperHandlers(evaluateRule) {
  return {
    'helper': (rule, context, depth, localScope, isValidContext) => {
      let result;

      // First, check if there's a helper definition in the rules.json
      if (typeof context?.getStaticData === 'function') {
        const staticData = context.getStaticData();
        const playerId = context.playerId || context.getPlayerId?.() || context.getPlayerSlot?.() || DEFAULT_PLAYER_ID;
        const playerIdKey = String(playerId);
        const helperDefinition = staticData?.helpers?.[playerIdKey]?.[rule.name];
        if (helperDefinition) {
          const params = helperDefinition.params || [];
          const defaults = helperDefinition.defaults || {};
          const body = helperDefinition.body || helperDefinition;
          const args = rule.args || [];

          let helperLocalScope = localScope ? { ...localScope } : {};

          for (const paramName of params) {
            if (paramName in defaults) {
              helperLocalScope[paramName] = defaults[paramName];
            }
          }

          const evaluatedArgs = [];
          for (let i = 0; i < params.length && i < args.length; i++) {
            const argValue = evaluateRule(args[i], context, depth + 1, localScope);
            helperLocalScope[params[i]] = argValue;
            evaluatedArgs.push(argValue);
          }

          const helperCache = context._helperCache || (context._helperCache = new Map());
          const cacheKey = `${rule.name}:${JSON.stringify(evaluatedArgs)}`;
          if (helperCache.has(cacheKey)) {
            return helperCache.get(cacheKey);
          }

          result = evaluateRule(body, context, depth + 1, helperLocalScope);

          if (result && typeof result === 'object' && result.__isReturn) {
            result = result.value;
          }
          if (result && typeof result === 'object' && result.type) {
            result = evaluateRule(result, context, depth + 1, helperLocalScope);
          }
          if (result !== undefined) {
            helperCache.set(cacheKey, result);
            return result;
          }
          log('debug', `[evaluateRule] Helper definition for '${rule.name}' returned undefined, trying JavaScript fallback`);
        }
      }

      // Check for inline body in the rule itself (used by worldgen worlds)
      if (rule.body) {
        const params = rule.params || [];
        const args = rule.args || [];
        let helperLocalScope = localScope ? { ...localScope } : {};

        const evaluatedArgs = [];
        for (let i = 0; i < args.length; i++) {
          const argValue = evaluateRule(args[i], context, depth + 1, localScope);
          evaluatedArgs.push(argValue);
          if (params[i]) {
            helperLocalScope[params[i]] = argValue;
          } else {
            helperLocalScope[`arg${i}`] = argValue;
          }
        }

        const helperCache = context._helperCache || (context._helperCache = new Map());
        const cacheKey = `inline:${rule.name}:${JSON.stringify(evaluatedArgs)}`;
        if (helperCache.has(cacheKey)) {
          return helperCache.get(cacheKey);
        }

        result = evaluateRule(rule.body, context, depth + 1, helperLocalScope);

        if (result && typeof result === 'object' && result.__isReturn) {
          result = result.value;
        }
        if (result !== undefined) {
          helperCache.set(cacheKey, result);
          return result;
        }
        log('debug', `[evaluateRule] Inline body for '${rule.name}' returned undefined, trying fallbacks`);
      }

      // Handle Python built-in functions
      if (rule.name === 'any') {
        if (!rule.args || rule.args.length === 0) return false;

        const firstArg = rule.args[0];
        if (firstArg && firstArg.type === 'generator_expression') {
          return evaluateRule(firstArg, context, depth + 1);
        }
        const evalArgs = rule.args.map(arg => evaluateRule(arg, context, depth + 1, localScope));
        if (evalArgs.length === 1 && Array.isArray(evalArgs[0])) {
          const items = evalArgs[0];
          let anyTrue = false;
          for (const item of items) {
            const val = (item && typeof item === 'object' && (item.type || item.rule))
              ? evaluateRule(item, context, depth + 1, localScope)
              : item;
            if (val === true || (val && val !== false && val !== undefined && val !== null && val !== 0)) {
              anyTrue = true;
              break;
            }
          }
          return anyTrue;
        }
        return evalArgs.some(val => val === true);
      }

      if (rule.name === 'all') {
        if (!rule.args || rule.args.length === 0) return true;

        const firstArg = rule.args[0];
        if (firstArg && firstArg.type === 'generator_expression') {
          return evaluateRule(firstArg, context, depth + 1);
        }
        const evalArgs = rule.args.map(arg => evaluateRule(arg, context, depth + 1, localScope));
        if (evalArgs.length === 1 && Array.isArray(evalArgs[0])) {
          const items = evalArgs[0];
          let allTrue = true;
          for (const item of items) {
            const val = (item && typeof item === 'object' && (item.type || item.rule))
              ? evaluateRule(item, context, depth + 1, localScope)
              : item;
            if (val !== true && !(val && val !== false && val !== undefined && val !== null && val !== 0)) {
              allTrue = false;
              break;
            }
          }
          return allTrue;
        }
        return evalArgs.every(val => val === true);
      }

      if (rule.name === 'min') {
        if (!rule.args || rule.args.length === 0) return undefined;
        const evalArgs = rule.args.map(arg => evaluateRule(arg, context, depth + 1, localScope));
        if (evalArgs.some(val => val === undefined)) return undefined;
        return Math.min(...evalArgs);
      }

      if (rule.name === 'max') {
        if (!rule.args || rule.args.length === 0) return undefined;
        const evalArgs = rule.args.map(arg => evaluateRule(arg, context, depth + 1, localScope));
        if (evalArgs.some(val => val === undefined)) return undefined;
        return Math.max(...evalArgs);
      }

      if (rule.name === 'set') {
        if (!rule.args || rule.args.length === 0) return [];
        const setArg = evaluateRule(rule.args[0], context, depth + 1, localScope);
        if (Array.isArray(setArg)) return [...new Set(setArg)];
        return setArg;
      }

      // Handle can_buy and can_buy_unlimited
      if (rule.name === 'can_buy' || rule.name === 'can_buy_unlimited') {
        const itemName = rule.args?.[0] ? evaluateRule(rule.args[0], context, depth + 1, localScope) : undefined;
        if (itemName === undefined) return undefined;

        let shopItems = context.getSetting?.('shop_items');

        if (!shopItems) {
          const shops = context.getSetting?.('shops');
          if (Array.isArray(shops) && shops.length > 0) {
            shopItems = {};
            for (const shop of shops) {
              const regionName = shop.region;
              if (!regionName) continue;
              if (Array.isArray(shop.unlimited_items)) {
                for (const item of shop.unlimited_items) {
                  if (!shopItems[item]) shopItems[item] = { unlimited: [], limited: [] };
                  if (!shopItems[item].unlimited.includes(regionName)) shopItems[item].unlimited.push(regionName);
                }
              }
              if (Array.isArray(shop.inventory)) {
                for (const inv of shop.inventory) {
                  if (!inv || !inv.item) continue;
                  if (inv.max && inv.max > 0) {
                    if (!shopItems[inv.item]) shopItems[inv.item] = { unlimited: [], limited: [] };
                    if (!shopItems[inv.item].limited.includes(regionName)) shopItems[inv.item].limited.push(regionName);
                  }
                }
              }
            }
            log('debug', `[evaluateRule] ${rule.name}: converted shops array to shop_items with ${Object.keys(shopItems).length} items`);
          }
        }

        if (!shopItems || !shopItems[itemName]) {
          log('debug', `[evaluateRule] ${rule.name}: item '${itemName}' not found in shop_items`);
          return false;
        }
        const regionsKey = rule.name === 'can_buy_unlimited' ? 'unlimited' : 'limited';
        const regions = shopItems[itemName][regionsKey] || [];
        if (regions.length === 0) return false;
        if (typeof context.isRegionReachable !== 'function') {
          log('warn', `[evaluateRule] ${rule.name}: context.isRegionReachable not available`);
          return undefined;
        }
        return regions.some(regionName => context.isRegionReachable(regionName));
      }

      // Handle built-in Python functions (second set check)
      if (rule.name === 'set') {
        const value = rule.args?.[0] ? evaluateRule(rule.args[0], context, depth + 1, localScope) : undefined;
        if (Array.isArray(value)) return value;
        if (value && typeof value === 'object') return Object.keys(value);
        return value;
      }

      if (rule.name === 'list') {
        const value = rule.args?.[0] ? evaluateRule(rule.args[0], context, depth + 1, localScope) : undefined;
        if (Array.isArray(value)) return value;
        if (value && typeof value === 'object') return Object.values(value);
        if (typeof value === 'string') return value.split('');
        return value ? [value] : [];
      }

      if (rule.name === 'tuple') {
        const value = rule.args?.[0] ? evaluateRule(rule.args[0], context, depth + 1, localScope) : undefined;
        if (Array.isArray(value)) return value;
        if (value && typeof value === 'object') return Object.values(value);
        if (typeof value === 'string') return value.split('');
        return value ? [value] : [];
      }

      if (rule.name === 'int') {
        const value = rule.args?.[0] ? evaluateRule(rule.args[0], context, depth + 1, localScope) : undefined;
        if (typeof value === 'number') return Math.trunc(value);
        return undefined;
      }

      if (rule.name === 'sqrt') {
        const value = rule.args?.[0] ? evaluateRule(rule.args[0], context, depth + 1, localScope) : undefined;
        if (typeof value === 'number' && value >= 0) return Math.sqrt(value);
        return undefined;
      }

      if (rule.name === 'floor') {
        const value = rule.args?.[0] ? evaluateRule(rule.args[0], context, depth + 1, localScope) : undefined;
        if (typeof value === 'number') return Math.floor(value);
        return undefined;
      }

      if (rule.name === 'ceil') {
        const value = rule.args?.[0] ? evaluateRule(rule.args[0], context, depth + 1, localScope) : undefined;
        if (typeof value === 'number') return Math.ceil(value);
        return undefined;
      }

      if (rule.name === 'len') {
        const value = rule.args?.[0] ? evaluateRule(rule.args[0], context, depth + 1, localScope) : undefined;
        if (Array.isArray(value)) return value.length;
        if (typeof value === 'string') return value.length;
        if (value && typeof value === 'object') return Object.keys(value).length;
        if (value === null || value === undefined) return undefined;
        log('warn', '[evaluateRule] len() called on non-sequence type', { value, rule });
        return undefined;
      }

      if (rule.name === 'bool') {
        const value = rule.args?.[0] ? evaluateRule(rule.args[0], context, depth + 1, localScope) : undefined;
        if (value === undefined) return undefined;
        return Boolean(value);
      }

      if (rule.name === 'getattr') {
        const obj = rule.args?.[0] ? evaluateRule(rule.args[0], context, depth + 1, localScope) : undefined;
        const attrName = rule.args?.[1] ? evaluateRule(rule.args[1], context, depth + 1, localScope) : undefined;
        const defaultVal = rule.args?.[2] ? evaluateRule(rule.args[2], context, depth + 1, localScope) : undefined;

        if (obj !== undefined && obj !== null && typeof obj === 'object' && attrName in obj) {
          return obj[attrName];
        }
        if (defaultVal !== undefined && typeof defaultVal === 'object' &&
            defaultVal !== null && Object.keys(defaultVal).length === 0) {
          return null;
        }
        return defaultVal;
      }

      if (rule.name === 'hasattr') {
        const obj = rule.args?.[0] ? evaluateRule(rule.args[0], context, depth + 1, localScope) : undefined;
        const attrName = rule.args?.[1] ? evaluateRule(rule.args[1], context, depth + 1, localScope) : undefined;

        if (obj !== undefined && obj !== null && typeof obj === 'object') {
          return attrName in obj;
        }
        return false;
      }

      if (rule.name === 'iter') {
        if (!rule.args || rule.args.length === 0) {
          return { __isIterator: true, items: [], position: 0 };
        }

        const iterArg = rule.args[0];
        let items;
        if (iterArg && iterArg.type === 'generator_expression') {
          items = evaluateRule(iterArg, context, depth + 1, localScope);
          if (!Array.isArray(items)) {
            items = items !== undefined ? [items] : [];
          }
        } else {
          const value = evaluateRule(iterArg, context, depth + 1, localScope);
          if (Array.isArray(value)) {
            items = value;
          } else if (value && typeof value === 'object') {
            items = Object.keys(value);
          } else if (typeof value === 'string') {
            items = value.split('');
          } else {
            items = [];
          }
        }
        return { __isIterator: true, items: items, position: 0 };
      }

      if (rule.name === 'next') {
        if (!rule.args || rule.args.length === 0) return undefined;

        const iteratorArg = evaluateRule(rule.args[0], context, depth + 1, localScope);
        const defaultValue = rule.args.length > 1
          ? evaluateRule(rule.args[1], context, depth + 1, localScope)
          : undefined;

        if (iteratorArg && iteratorArg.__isIterator) {
          if (iteratorArg.position < iteratorArg.items.length) {
            result = iteratorArg.items[iteratorArg.position];
            iteratorArg.position++;
          } else {
            result = defaultValue;
          }
        } else if (Array.isArray(iteratorArg)) {
          result = iteratorArg.length > 0 ? iteratorArg[0] : defaultValue;
        } else {
          result = defaultValue;
        }
        return result;
      }

      // Regular helper function handling
      const args = rule.args
        ? rule.args.map((arg) => evaluateRule(arg, context, depth + 1))
        : [];

      const helpersAllowingUndefinedArgs = new Set([
        'wor', 'wand', 'evalSMBool', 'SMBool',
        'smz3_CanAccessMiseryMirePortal'
      ]);
      const allowUndefinedArgs = helpersAllowingUndefinedArgs.has(rule.name);

      // Check if the helper name is actually a bound variable from iterator context
      if (context && typeof context.resolveName === 'function') {
        const boundValue = context.resolveName(rule.name);
        if (boundValue !== undefined) {
          if (boundValue && typeof boundValue === 'object' && (boundValue.type || boundValue.rule)) {
            log('debug', `[evaluateRule] Helper '${rule.name}' resolved to bound rule object, evaluating recursively`);
            return evaluateRule(boundValue, context, depth + 1, localScope);
          }
          if (typeof boundValue !== 'object' || boundValue === null) {
            return boundValue;
          }
        }
      }

      if (!allowUndefinedArgs && args.some((arg) => arg === undefined)) {
        result = undefined;
      } else if (isValidContext) {
        if (typeof context.executeHelper === 'function') {
          result = context.executeHelper(rule.name, ...args);

          if (result && typeof result === 'object' && 'bool' in result && 'difficulty' in result) {
            if (depth === 0) {
              let maxDiff = 50;
              if (typeof context.getPlayerId === 'function' && typeof context.resolveName === 'function') {
                const playerId = context.getPlayerId();
                const state = context.resolveName('state');
                if (state?.smbm?.[playerId]?.maxDiff !== undefined) {
                  maxDiff = state.smbm[playerId].maxDiff;
                }
              }
              result = result.bool === true && result.difficulty <= maxDiff;
            }
          }
        } else {
          log('warn', `[evaluateRule SnapshotIF] context.executeHelper is not a function for helper '${rule.name}'. Assuming undefined.`);
          result = undefined;
        }
      }
      return result;
    },

    'generic_helper': (rule, context, depth, localScope, isValidContext) => {
      const args = rule.args
        ? rule.args.map((arg) => evaluateRule(arg, context, depth + 1))
        : [];
      let result;
      if (args.some((arg) => arg === undefined)) {
        result = undefined;
      } else if (isValidContext) {
        if (typeof context.executeHelper === 'function') {
          result = context.executeHelper(rule.name, ...args);

          if (result && typeof result === 'object' && 'bool' in result && 'difficulty' in result) {
            if (depth === 0) {
              let maxDiff = 50;
              if (typeof context.getPlayerId === 'function' && typeof context.resolveName === 'function') {
                const playerId = context.getPlayerId();
                const state = context.resolveName('state');
                if (state?.smbm?.[playerId]?.maxDiff !== undefined) {
                  maxDiff = state.smbm[playerId].maxDiff;
                }
              }
              result = result.bool === true && result.difficulty <= maxDiff;
            }
          }
        } else {
          log('warn', `[evaluateRule] context.executeHelper is not a function for generic helper '${rule.name}'. Falling back to true.`);
          result = true;
        }
      } else {
        log('warn', `[evaluateRule] Generic helper '${rule.name}' called without valid context - falling back to true`, { rule });
        result = true;
      }
      return result;
    },

    'state_method': (rule, context, depth, localScope, isValidContext) => {
      const args = rule.args
        ? rule.args.map((arg) => evaluateRule(arg, context, depth + 1, localScope))
        : [];

      if (args.some((arg) => arg === undefined)) {
        return undefined;
      } else if (isValidContext) {
        if (rule.method === 'count' && args.length >= 1 && typeof context.countItem === 'function') {
          return context.countItem(args[0]) || 0;
        } else if (typeof context.executeStateManagerMethod === 'function') {
          return context.executeStateManagerMethod(rule.method, ...args);
        } else {
          log('warn', `[evaluateRule SnapshotIF] context.executeStateManagerMethod not a function for '${rule.method}'. Assuming undefined.`);
          return undefined;
        }
      } else {
        return undefined;
      }
    },
  };
}
