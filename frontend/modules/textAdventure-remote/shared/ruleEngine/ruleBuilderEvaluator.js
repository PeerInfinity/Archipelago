/**
 * Rule Builder format evaluator.
 *
 * Handles rules in Rule Builder format:
 * {"rule": "RuleName", "options": [], "args": {...}} or
 * {"rule": "And/Or", "options": [], "children": [...]} for composite rules.
 *
 * Cases: True_, False_, Constant, List, CountCheck, AST_placement_lookup,
 * AST_placement_search, AST_function_call, AST_dict_lambda_lookup,
 * AST_all_of, AST_any_of, Has, HasAll, HasAny, HasAllCounts, HasAnyCount,
 * HasFromList, HasFromListUnique, HasGroup, HasGroupUnique,
 * And, Or, Conditional, Not, AST_setting_value, AST_location_rule_ref,
 * AST_block, AST_count_true, AST_weighted_count_true, AST_prog_item_count,
 * CanReachRegion, CanReachLocation, CanReachEntrance, EntranceAccessRule,
 * Filtered, HelperCall, Compare, Arithmetic, MinValue, MaxValue,
 * Count, CountItem, CountGroup, CountGroupUnique, CountFromList,
 * UniqueCount, SettingValue, OptionValue, WorldAttribute, ItemCheck,
 * StateMethod, Attribute, Name, Tuple, weighted_sum, unique_count
 *
 * @module shared/ruleEngine/ruleBuilderEvaluator
 */

import { log, DEFAULT_PLAYER_ID } from './helpers.js';

/**
 * Create a Rule Builder evaluator bound to the given evaluateRule function.
 *
 * @param {Function} evaluateRule - The main rule evaluation function
 * @returns {Function} evaluateRuleBuilderRule(rule, context, depth, localScope)
 */
export function createRuleBuilderEvaluator(evaluateRule) {
  return function evaluateRuleBuilderRule(rule, context, depth, localScope) {
    const ruleName = rule.rule;
    const args = rule.args || {};
    const children = rule.children || [];
    const child = rule.child;

    // Log at debug level
    if (depth < 3) {
      log('debug', `[evaluateRuleBuilderRule] Evaluating ${ruleName}`, { args, childCount: children.length });
    }

    switch (ruleName) {
      // Boolean literals
      case 'True_':
        return true;

      case 'False_':
        return false;

      // Constant value (from converted AST format)
      case 'Constant':
        return args.value;

      // List value (from converted AST format)
      case 'List': {
        const listValue = args.value || [];
        // Evaluate each element in the list
        return listValue.map(item => evaluateRule(item, context, depth + 1, localScope));
      }

      // CountCheck (from converted AST format) - check if player has at least N of an item
      case 'CountCheck': {
        const itemName = args.item;
        let count = args.count;
        // Evaluate count if it's a rule object
        if (count && typeof count === 'object' && (count.type || count.rule)) {
          count = evaluateRule(count, context, depth + 1, localScope);
        }
        count = count ?? 1;
        return evaluateRule({ type: 'count_check', item: itemName, count }, context, depth + 1, localScope);
      }

      // AST_placement_lookup (from converted AST format) - look up what item is at a location
      case 'AST_placement_lookup': {
        let locationName = args.location;
        // Evaluate location if it's a rule object
        if (locationName && typeof locationName === 'object' && (locationName.type || locationName.rule)) {
          locationName = evaluateRule(locationName, context, depth + 1, localScope);
        } else if (locationName && typeof locationName === 'object' && locationName.type === 'constant') {
          locationName = locationName.value;
        }
        // Get the item placed at this location
        if (typeof context?.getLocationItem === 'function') {
          const item = context.getLocationItem(locationName);
          if (item) {
            // Return [item_name, player] tuple for comparison
            return [item.name || item.item, item.player || 1];
          }
        }
        return undefined;
      }

      // AST_placement_search (from converted AST format) - search for an item at specific locations
      // Returns true if the item is found at any of the locations, false otherwise
      case 'AST_placement_search': {
        // Evaluate item name
        let searchItem = args.item;
        if (searchItem && typeof searchItem === 'object' && (searchItem.type || searchItem.rule)) {
          searchItem = evaluateRule(searchItem, context, depth + 1, localScope);
        }

        // Evaluate player
        let searchPlayer = args.player;
        if (searchPlayer && typeof searchPlayer === 'object' && (searchPlayer.type || searchPlayer.rule)) {
          searchPlayer = evaluateRule(searchPlayer, context, depth + 1, localScope);
        }
        searchPlayer = searchPlayer ?? 1;

        // Evaluate locations list
        let locations = args.locations;
        if (locations && typeof locations === 'object') {
          if (locations.type === 'constant') {
            locations = locations.value;
          } else if (locations.type === 'list' && Array.isArray(locations.value)) {
            // Recursively evaluate list items
            locations = locations.value.map(item => {
              if (item && typeof item === 'object' && (item.type || item.rule)) {
                return evaluateRule(item, context, depth + 1, localScope);
              }
              return item;
            });
          } else if (locations.type || locations.rule) {
            locations = evaluateRule(locations, context, depth + 1, localScope);
          }
        }

        if (!Array.isArray(locations) || !searchItem) {
          return undefined;
        }

        // Search each location for the item
        for (const locEntry of locations) {
          let locName, locPlayer;
          if (Array.isArray(locEntry)) {
            [locName, locPlayer] = locEntry;
          } else if (locEntry && typeof locEntry === 'object') {
            locName = locEntry.location || locEntry.name;
            locPlayer = locEntry.player ?? 1;
          } else {
            continue;
          }

          locPlayer = locPlayer ?? 1;

          // Get the item at this location
          if (typeof context?.getLocationItem === 'function') {
            const foundItem = context.getLocationItem(locName);
            if (foundItem) {
              const itemName = foundItem.name || foundItem.item;
              const itemPlayer = foundItem.player || 1;
              // Check if this matches what we're searching for
              if (itemName === searchItem && itemPlayer === searchPlayer) {
                return true;
              }
            }
          }
        }

        return false;
      }

      // AST_function_call (from converted AST format) - evaluate a function call like boss.can_defeat()
      case 'AST_function_call': {
        // Convert Rule Builder format to legacy function_call format
        // Structure: { rule: 'AST_function_call', args: { function: {...}, args: [...], _original_ast_type: 'function_call' } }
        const funcExpr = args.function;
        const funcArgs = args.args || [];

        // Build the legacy format and evaluate it
        return evaluateRule({
          type: 'function_call',
          function: funcExpr,
          args: funcArgs
        }, context, depth + 1, localScope);
      }

      // AST_dict_lambda_lookup (from converted AST format) - delegate to dict_lambda_lookup handler
      // Used for entrance-dependent rules in ALttP (checking where entrances connect to)
      // Structure: { rule: 'AST_dict_lambda_lookup', args: { dict_name, key, cases, default } }
      case 'AST_dict_lambda_lookup': {
        // Convert to AST format and evaluate
        return evaluateRule({
          type: 'dict_lambda_lookup',
          key: args.key,
          cases: args.cases,
          default: args.default
        }, context, depth + 1, localScope);
      }

      // AST_all_of (from converted AST format) - delegate to AST all_of handler
      // Structure: { rule: 'AST_all_of', args: { element_rule: {...}, iterator_info: {...} } }
      // The args contain the same structure as an AST all_of rule
      case 'AST_all_of': {
        // If the element_rule is already a complete all_of rule with its own iterator_info,
        // AND the outer AST_all_of has no iterator_info of its own,
        // evaluate it directly to avoid double iteration.
        // BUT if the outer has iterator_info, we MUST iterate to bind variables that the inner may reference.
        if (args.element_rule && args.element_rule.type === 'all_of' && args.element_rule.iterator_info && !args.iterator_info) {
          return evaluateRule(args.element_rule, context, depth + 1, localScope);
        }

        // Otherwise, convert Rule Builder format to AST format and delegate
        return evaluateRule({
          type: 'all_of',
          element_rule: args.element_rule,
          iterator_info: args.iterator_info
        }, context, depth + 1, localScope);
      }

      // AST_any_of (from converted AST format) - delegate to AST any_of handler
      // Structure: { rule: 'AST_any_of', args: { element_rule: {...}, iterator_info: {...} } }
      // The args contain the same structure as an AST any_of rule
      case 'AST_any_of': {
        // If the element_rule is already a complete any_of rule with its own iterator_info,
        // AND the outer AST_any_of has no iterator_info of its own,
        // evaluate it directly to avoid double iteration.
        // BUT if the outer has iterator_info, we MUST iterate to bind variables that the inner may reference.
        if (args.element_rule && args.element_rule.type === 'any_of' && args.element_rule.iterator_info && !args.iterator_info) {
          return evaluateRule(args.element_rule, context, depth + 1, localScope);
        }

        // Otherwise, convert Rule Builder format to AST format and delegate
        return evaluateRule({
          type: 'any_of',
          element_rule: args.element_rule,
          iterator_info: args.iterator_info
        }, context, depth + 1, localScope);
      }

      // Item check: Has(item_name, count)
      case 'Has': {
        const itemName = args.item_name;
        const count = args.count ?? 1;
        if (!itemName) {
          log('warn', '[evaluateRuleBuilderRule] Has rule missing item_name');
          return undefined;
        }
        // Delegate to AST format evaluation
        return evaluateRule({ type: 'item_check', item: itemName, count }, context, depth + 1, localScope);
      }

      // HasAll: all items required (AND of Has checks)
      case 'HasAll': {
        // Support both "items" (from Resolved._get_args_dict) and "item_names" (from Rule.to_dict)
        const items = args.items || args.item_names || children.map(c => c.args?.item_name).filter(Boolean);
        if (!items || items.length === 0) {
          return true; // Empty AND is true
        }
        for (const item of items) {
          const result = evaluateRule({ type: 'item_check', item, count: 1 }, context, depth + 1, localScope);
          if (result === false) return false;
          if (result === undefined) return undefined;
        }
        return true;
      }

      // HasAny: any item required (OR of Has checks)
      case 'HasAny': {
        // Support both "items" (from Resolved._get_args_dict) and "item_names" (from Rule.to_dict)
        const items = args.items || args.item_names || children.map(c => c.args?.item_name).filter(Boolean);
        if (!items || items.length === 0) {
          return false; // Empty OR is false
        }
        let hasUndefined = false;
        for (const item of items) {
          const result = evaluateRule({ type: 'item_check', item, count: 1 }, context, depth + 1, localScope);
          if (result === true) return true;
          if (result === undefined) hasUndefined = true;
        }
        return hasUndefined ? undefined : false;
      }

      // HasAllCounts: all items with specific counts
      case 'HasAllCounts': {
        // Support both Rule Builder format (items) and legacy format (item_counts)
        const itemCounts = args.items || args.item_counts || {};
        for (const [item, count] of Object.entries(itemCounts)) {
          const result = evaluateRule({ type: 'item_check', item, count }, context, depth + 1, localScope);
          if (result === false) return false;
          if (result === undefined) return undefined;
        }
        return true;
      }

      // HasAnyCount: any item with specific count
      case 'HasAnyCount': {
        // Support both Rule Builder format (items) and legacy format (item_counts)
        const itemCounts = args.items || args.item_counts || {};
        let hasUndefined = false;
        for (const [item, count] of Object.entries(itemCounts)) {
          const result = evaluateRule({ type: 'item_check', item, count }, context, depth + 1, localScope);
          if (result === true) return true;
          if (result === undefined) hasUndefined = true;
        }
        return hasUndefined ? undefined : false;
      }

      // HasFromList: N items from a list (sums total item counts)
      // Python: found += player_prog_items[item_name] for each item
      case 'HasFromList': {
        // Support both "items" (from Resolved._get_args_dict) and "item_names" (from Rule.to_dict)
        const items = args.items || args.item_names || [];
        const count = args.count ?? 1;
        let found = 0;
        // Sum the count of each item (not just presence)
        for (const item of items) {
          if (typeof context.countItem === 'function') {
            found += context.countItem(item) || 0;
          } else {
            // Fallback: check presence only
            const result = evaluateRule({ type: 'item_check', item, count: 1 }, context, depth + 1, localScope);
            if (result === true) found++;
          }
          if (found >= count) return true;
        }
        return found >= count;
      }

      // HasFromListUnique: N unique items from a list
      case 'HasFromListUnique': {
        // Support both "items" (from Resolved._get_args_dict) and "item_names" (from Rule.to_dict)
        const items = args.items || args.item_names || [];
        const count = args.count ?? 1;
        let found = 0;
        let hasUndefined = false;
        for (const item of items) {
          const result = evaluateRule({ type: 'item_check', item, count: 1 }, context, depth + 1, localScope);
          if (result === true) {
            found++;
            if (found >= count) return true;
          } else if (result === undefined) {
            hasUndefined = true;
          }
        }
        if (hasUndefined && found < count) return undefined;
        return found >= count;
      }

      // HasGroup: items from an item group
      case 'HasGroup': {
        // Support both "group" (from Resolved._get_args_dict) and "item_name_group" (from Rule.to_dict)
        const groupName = args.group || args.item_name_group;
        const count = args.count ?? 1;
        return evaluateRule({ type: 'group_check', group: groupName, count }, context, depth + 1, localScope);
      }

      // HasGroupUnique: unique items from an item group
      case 'HasGroupUnique': {
        // Support both "group" (from Resolved._get_args_dict) and "item_name_group" (from Rule.to_dict)
        const groupName = args.group || args.item_name_group;
        const count = args.count ?? 1;
        // For unique, we use the same group_check - the semantics are handled by the group logic
        return evaluateRule({ type: 'group_check', group: groupName, count }, context, depth + 1, localScope);
      }

      // Composite rules: And
      case 'And': {
        // Support both rule.children (legacy) and args.rules (Rule Builder format)
        const andChildren = args.rules || children;
        if (andChildren.length === 0) return true;
        let hasUndefined = false;
        let hasSMBool = false;
        let totalDifficulty = 0;
        for (const childRule of andChildren) {
          let result = evaluateRule(childRule, context, depth + 1, localScope);
          // Handle SMBool objects from SM helpers - extract bool property and accumulate difficulty
          let boolValue = result;
          if (result && typeof result === 'object' && 'bool' in result) {
            boolValue = result.bool;
            hasSMBool = true;
            totalDifficulty += result.difficulty || 0;
          }
          // Check for falsy values (false, 0, "", null) but not undefined
          // Use !boolValue to catch all falsy values including 0, not just === false
          if (!boolValue && boolValue !== undefined) return false;
          if (boolValue === undefined) hasUndefined = true;
        }
        if (hasUndefined) return undefined;
        // If any child was SMBool, return SMBool with accumulated difficulty
        if (hasSMBool) {
          return { bool: true, difficulty: totalDifficulty };
        }
        return true;
      }

      // Composite rules: Or
      case 'Or': {
        // Support both rule.children (legacy) and args.rules (Rule Builder format)
        const orChildren = args.rules || children;
        if (orChildren.length === 0) return false;
        let hasUndefined = false;
        let hasSMBool = false;
        let minDifficulty = Infinity;
        for (const childRule of orChildren) {
          let result = evaluateRule(childRule, context, depth + 1, localScope);
          // Handle SMBool objects from SM helpers - extract bool property and track min difficulty
          let boolValue = result;
          if (result && typeof result === 'object' && 'bool' in result) {
            boolValue = result.bool;
            hasSMBool = true;
            // Track min difficulty for truthy SMBool results
            if (boolValue && (result.difficulty || 0) < minDifficulty) {
              minDifficulty = result.difficulty || 0;
            }
          }
          // Check for truthy values (not just === true) but exclude undefined
          if (boolValue && boolValue !== undefined) {
            // For Or, return immediately with the min difficulty seen so far
            if (hasSMBool) {
              return { bool: true, difficulty: minDifficulty };
            }
            return true;
          }
          if (boolValue === undefined) hasUndefined = true;
        }
        return hasUndefined ? undefined : false;
      }

      // Conditional: ternary rule (test ? if_true : if_false)
      // Rule Builder: {"rule": "Conditional", "args": {"test": {...}, "if_true": {...}, "if_false": {...}}}
      case 'Conditional': {
        const testRule = args.test;
        const ifTrueRule = args.if_true;
        const ifFalseRule = args.if_false;

        if (!testRule) {
          log('warn', '[evaluateRuleBuilderRule] Conditional rule missing test');
          return undefined;
        }

        const testResult = evaluateRule(testRule, context, depth + 1, localScope);

        if (testResult === undefined) {
          // If test is unknown, outcome is unknown
          return undefined;
        } else if (testResult) {
          // Test is truthy - evaluate if_true branch
          return ifTrueRule
            ? evaluateRule(ifTrueRule, context, depth + 1, localScope)
            : true;
        } else {
          // Test is falsy - evaluate if_false branch
          // Missing if_false means no restriction (Python None = accessible)
          return ifFalseRule
            ? evaluateRule(ifFalseRule, context, depth + 1, localScope)
            : true;
        }
      }

      // Wrapper rules: Not (inverts child)
      case 'Not': {
        // Support both 'child' key and 'args.condition' (from converted AST format)
        const notChild = child || args.condition;
        if (!notChild) {
          log('warn', '[evaluateRuleBuilderRule] Not rule missing child/condition');
          return undefined;
        }
        const result = evaluateRule(notChild, context, depth + 1, localScope);
        if (result === undefined) return undefined;
        return !result;
      }

      // Setting value lookup (from converted AST format)
      case 'AST_setting_value': {
        const settingName = args.setting;
        if (typeof context?.getSetting === 'function') {
          return context.getSetting(settingName);
        }
        return undefined;
      }

      // Location rule reference (from converted AST format) - evaluate another location's access rule
      case 'AST_location_rule_ref': {
        const locationName = args.location;
        // Check if the location is accessible
        if (typeof context?.isLocationAccessible === 'function') {
          const result = context.isLocationAccessible(locationName);
          return result === 'reachable' || result === true;
        }
        return undefined;
      }

      // AST_block (from rule analyzer) - execute a sequence of statements
      // This is the Rule Builder format for code blocks with statements, variable assignments,
      // and control flow (if/else, return). Converts to AST 'block' type for evaluation.
      case 'AST_block': {
        const statements = args.statements || [];
        // Delegate to the AST format 'block' handler
        return evaluateRule({ type: 'block', statements }, context, depth + 1, localScope);
      }

      // AST_count_true (from Stardew Valley) - count how many conditions are true
      case 'AST_count_true': {
        const requiredCount = args.count || 0;
        const conditions = args.conditions || [];

        if (requiredCount === 0) return true;
        if (conditions.length === 0) return requiredCount === 0;

        let trueCount = 0;
        let undefinedCount = 0;

        for (const condition of conditions) {
          const conditionResult = evaluateRule(condition, context, depth + 1, localScope);
          if (conditionResult === true) {
            trueCount++;
            if (trueCount >= requiredCount) return true;
          } else if (conditionResult === undefined) {
            undefinedCount++;
          }
        }

        if (trueCount >= requiredCount) return true;
        if (trueCount + undefinedCount >= requiredCount) return undefined;
        return false;
      }

      // AST_weighted_count_true (from Stardew Valley) - weighted count of conditions
      case 'AST_weighted_count_true': {
        const requiredCount = args.count || 0;
        const weightedConditions = args.weighted_conditions || [];

        if (requiredCount === 0) return true;
        if (weightedConditions.length === 0) return requiredCount === 0;

        let weightSum = 0;
        let undefinedWeightSum = 0;

        for (const [condition, weight] of weightedConditions) {
          const conditionResult = evaluateRule(condition, context, depth + 1, localScope);
          if (conditionResult === true) {
            weightSum += weight;
            if (weightSum >= requiredCount) return true;
          } else if (conditionResult === undefined) {
            undefinedWeightSum += weight;
          }
        }

        if (weightSum >= requiredCount) return true;
        if (weightSum + undefinedWeightSum >= requiredCount) return undefined;
        return false;
      }

      // AST_prog_item_count (from DLCQuest and other games with accumulator items)
      // Returns the count of a progression item from state.prog_items[player][key]
      // Inlined for performance - this is called frequently in games with coinsanity
      case 'AST_prog_item_count': {
        const progKey = args.key;
        if (progKey === undefined) {
          log('warn', '[evaluateRuleBuilderRule] AST_prog_item_count: missing key');
          return undefined;
        }
        // Inline the prog_item_count logic to avoid recursive evaluateRule overhead
        if (typeof context.countProgItem === 'function') {
          return context.countProgItem(progKey) ?? 0;
        }
        // Fallback: check prog_items directly from snapshot
        const snapshot = context.snapshot || context;
        const playerId = context.playerId || context.getPlayerId?.() || 1;
        const progItems = snapshot?.prog_items;
        // Use standard player ID format (string keys in JSON)
        return progItems?.[playerId]?.[progKey] ??
               progItems?.[String(playerId)]?.[progKey] ??
               0;
      }

      // Reachability rules
      case 'CanReachRegion': {
        const regionName = args.region_name;
        return evaluateRule({ type: 'can_reach', region: regionName }, context, depth + 1, localScope);
      }

      case 'CanReachLocation': {
        const locationName = args.location_name;
        return evaluateRule({ type: 'location_check', location: locationName }, context, depth + 1, localScope);
      }

      case 'CanReachEntrance': {
        const entranceName = args.entrance_name;
        return evaluateRule({ type: 'can_reach_entrance', entrance: entranceName }, context, depth + 1, localScope);
      }

      case 'EntranceAccessRule': {
        // Evaluate an entrance's access_rule, optionally with a fake Moon Pearl state.
        // This is used for ALttP underworld glitch rules where dungeon_entrance.access_rule()
        // is called with a fake pearl state, simulating having Moon Pearl.
        // Accept both 'entrance_name' (from Python export) and 'entrance' (simpler form)
        const entranceName = args.entrance_name || args.entrance;
        const fakePearl = args.fake_pearl || false;

        if (!entranceName) {
          log('warn', '[evaluateRuleBuilderRule] EntranceAccessRule missing entrance_name/entrance');
          return undefined;
        }

        // Find the entrance in the regions data
        let entrance = null;

        if (typeof context.getStaticData === 'function') {
          const staticData = context.getStaticData();
          const regionsData = staticData?.regions;

          if (regionsData && regionsData instanceof Map) {
            // Search for the entrance in all regions
            for (const [regionName, regionData] of regionsData.entries()) {
              const exits = regionData.exits || [];
              const foundExit = exits.find(exit => exit.name === entranceName);
              if (foundExit) {
                entrance = foundExit;
                break;
              }
            }
          }
        }

        if (!entrance) {
          // Entrance not found - conservatively return true (matches Python behavior)
          log('debug', `[evaluateRuleBuilderRule] EntranceAccessRule: entrance "${entranceName}" not found, returning true`);
          return true;
        }

        // If no access_rule, the entrance is accessible
        if (!entrance.access_rule) {
          return true;
        }

        // If fake_pearl is true, create a modified context that includes Moon Pearl
        let evalContext = context;
        if (fakePearl) {
          // Check if we already have Moon Pearl
          const hasMoonPearl = typeof context.hasItem === 'function' && context.hasItem('Moon Pearl');

          if (!hasMoonPearl) {
            // Create a wrapper context that pretends to have Moon Pearl
            evalContext = {
              ...context,
              hasItem: (itemName) => {
                if (itemName === 'Moon Pearl') {
                  return true;
                }
                return typeof context.hasItem === 'function' ? context.hasItem(itemName) : undefined;
              },
              countItem: (itemName) => {
                if (itemName === 'Moon Pearl') {
                  // Return at least 1 (or add 1 to existing count)
                  const existing = typeof context.countItem === 'function' ? context.countItem(itemName) : 0;
                  return Math.max(1, (existing || 0) + 1);
                }
                return typeof context.countItem === 'function' ? context.countItem(itemName) : 0;
              }
            };
          }
        }

        // Evaluate the entrance's access rule
        return evaluateRule(entrance.access_rule, evalContext, depth + 1, localScope);
      }

      // Wrapper rule with filter (option-based filtering)
      case 'Filtered': {
        // For now, just evaluate the child - option filtering is typically world-level
        if (!child) {
          log('warn', '[evaluateRuleBuilderRule] Filtered rule missing child');
          return undefined;
        }
        return evaluateRule(child, context, depth + 1, localScope);
      }

      // HelperCall: Rule Builder rule that wraps a helper function
      // The body_data contains the AST format rule to evaluate
      case 'HelperCall': {
        const bodyData = args.body_data;
        if (bodyData) {
          // Check if body_data has params wrapper: {params: [...], body: {...}}
          if (bodyData.params && bodyData.body) {
            const params = bodyData.params;
            const helperArgs = args.args || [];
            const defaults = bodyData.defaults || {};
            let helperLocalScope = localScope ? { ...localScope } : {};

            // Bind arguments to parameter names, using defaults for missing params
            for (let i = 0; i < params.length; i++) {
              const paramName = params[i];
              let argValue;

              if (i < helperArgs.length) {
                argValue = helperArgs[i];
                // Only evaluate as a rule if it's an object with 'type' or 'rule' key
                // Plain values (primitives, arrays, plain objects) should be used directly
                if (argValue && typeof argValue === 'object' && !Array.isArray(argValue) && (argValue.type || argValue.rule)) {
                  argValue = evaluateRule(argValue, context, depth + 1, localScope);
                }
              } else if (defaults[paramName] !== undefined) {
                // Use default value from body_data.defaults
                argValue = defaults[paramName];
              } else {
                // No default provided - use 1 as common default for quantity-like params
                // This matches Python's common default patterns (quantity=1, count=1)
                argValue = 1;
              }

              helperLocalScope[paramName] = argValue;
            }

            let result = evaluateRule(bodyData.body, context, depth + 1, helperLocalScope);
            // Unwrap return marker if present
            if (result && typeof result === 'object' && result.__isReturn) {
              result = result.value;
            }
            return result;
          }
          // No params wrapper - evaluate body_data directly
          return evaluateRule(bodyData, context, depth + 1, localScope);
        }
        // No body_data - try evaluating as a CC helper with the helper name
        const helperName = args.helper_name;
        if (helperName) {
          const helperArgs = args.args || [];
          return evaluateRule({ type: 'helper', name: helperName, args: helperArgs }, context, depth + 1, localScope);
        }
        log('warn', '[evaluateRuleBuilderRule] HelperCall missing both body_data and helper_name');
        return undefined;
      }

      // Compare: comparison between two values
      // Rule Builder: {"rule": "Compare", "args": {"left": ..., "op": ">=", "right": ...}}
      case 'Compare': {
        const left = args.left;
        const op = args.op || '==';
        const right = args.right;

        // Fast path: Handle common AST_prog_item_count >= number pattern directly
        // This is very common in games with coinsanity (DLCQuest, etc.)
        // Bypasses 2-3 levels of function call overhead
        let leftValue;
        if (left && typeof left === 'object' && left.rule === 'AST_prog_item_count') {
          const progKey = left.args?.key;
          if (progKey !== undefined) {
            if (typeof context.countProgItem === 'function') {
              leftValue = context.countProgItem(progKey) ?? 0;
            } else {
              const snapshot = context.snapshot || context;
              const playerId = context.playerId || context.getPlayerId?.() || 1;
              const progItems = snapshot?.prog_items;
              leftValue = progItems?.[playerId]?.[progKey] ??
                         progItems?.[String(playerId)]?.[progKey] ??
                         0;
            }
          } else {
            leftValue = evaluateRule(left, context, depth + 1, localScope);
          }
        } else if (typeof left !== 'object' || left === null) {
          leftValue = left;
        } else {
          leftValue = evaluateRule(left, context, depth + 1, localScope);
        }

        // Optimize: skip evaluateRule for primitive values (common case)
        const rightValue = (typeof right !== 'object' || right === null)
          ? right
          : evaluateRule(right, context, depth + 1, localScope);

        // If either operand is undefined, we can't compare
        if (leftValue === undefined || rightValue === undefined) {
          return undefined;
        }

        // Perform the comparison
        switch (op) {
          case '==':
          case 'eq':
            // Handle array comparison by value (JS === compares by reference)
            if (Array.isArray(leftValue) && Array.isArray(rightValue)) {
              return leftValue.length === rightValue.length &&
                     leftValue.every((val, index) => val === rightValue[index]);
            }
            return leftValue === rightValue;
          case '!=':
          case 'ne':
            // Handle array comparison by value
            if (Array.isArray(leftValue) && Array.isArray(rightValue)) {
              return leftValue.length !== rightValue.length ||
                     leftValue.some((val, index) => val !== rightValue[index]);
            }
            return leftValue !== rightValue;
          case '<':
          case 'lt':
            return leftValue < rightValue;
          case '<=':
          case 'le':
            return leftValue <= rightValue;
          case '>':
          case 'gt':
            return leftValue > rightValue;
          case '>=':
          case 'ge':
            return leftValue >= rightValue;
          case 'in':
            // Check if leftValue is in rightValue (array)
            if (Array.isArray(rightValue)) {
              // Handle array comparison with deep equality for nested arrays
              if (Array.isArray(leftValue)) {
                return rightValue.some(item => {
                  if (Array.isArray(item)) {
                    // Deep array comparison
                    return item.length === leftValue.length &&
                           item.every((val, index) => val === leftValue[index]);
                  }
                  return item === leftValue;
                });
              }
              return rightValue.includes(leftValue);
            }
            if (typeof rightValue === 'string') {
              return rightValue.includes(leftValue);
            }
            return false;
          case 'not in':
            // Negate the 'in' check
            if (Array.isArray(rightValue)) {
              if (Array.isArray(leftValue)) {
                return !rightValue.some(item => {
                  if (Array.isArray(item)) {
                    return item.length === leftValue.length &&
                           item.every((val, index) => val === leftValue[index]);
                  }
                  return item === leftValue;
                });
              }
              return !rightValue.includes(leftValue);
            }
            if (typeof rightValue === 'string') {
              return !rightValue.includes(leftValue);
            }
            return true;
          default:
            log('warn', `[evaluateRuleBuilderRule] Unknown Compare operator '${op}'`);
            return undefined;
        }
      }

      // Arithmetic: arithmetic operation between two values
      // Rule Builder: {"rule": "Arithmetic", "args": {"left": ..., "op": "+", "right": ...}}
      case 'Arithmetic': {
        const left = args.left;
        const op = args.op || '+';
        const right = args.right;

        // Recursively evaluate operands
        const leftValue = evaluateRule(left, context, depth + 1, localScope);
        const rightValue = evaluateRule(right, context, depth + 1, localScope);

        // If either operand is undefined, we can't compute
        if (leftValue === undefined || rightValue === undefined) {
          return undefined;
        }

        // Perform the arithmetic operation
        switch (op) {
          case '+':
            return leftValue + rightValue;
          case '-':
            return leftValue - rightValue;
          case '*':
            return leftValue * rightValue;
          case '/':
            return rightValue !== 0 ? leftValue / rightValue : undefined;
          case '//':
            return rightValue !== 0 ? Math.floor(leftValue / rightValue) : undefined;
          case '%':
            return rightValue !== 0 ? leftValue % rightValue : undefined;
          case '**':
            return Math.pow(leftValue, rightValue);
          default:
            log('warn', `[evaluateRuleBuilderRule] Unknown Arithmetic operator '${op}'`);
            return undefined;
        }
      }

      // MinValue: returns the minimum of two values (used to cap item contributions)
      // Rule Builder: {"rule": "MinValue", "args": {"left": ..., "right": ...}}
      case 'MinValue': {
        const left = args.left;
        const right = args.right;

        // Recursively evaluate operands
        const leftValue = evaluateRule(left, context, depth + 1, localScope);
        const rightValue = evaluateRule(right, context, depth + 1, localScope);

        // If either operand is undefined, we can't compute
        if (leftValue === undefined || rightValue === undefined) {
          return undefined;
        }

        return Math.min(leftValue, rightValue);
      }

      // MaxValue: returns the maximum of two values (used for max depth calculations)
      // Rule Builder: {"rule": "MaxValue", "args": {"left": ..., "right": ...}}
      case 'MaxValue': {
        const left = args.left;
        const right = args.right;

        // Recursively evaluate operands
        const leftValue = evaluateRule(left, context, depth + 1, localScope);
        const rightValue = evaluateRule(right, context, depth + 1, localScope);

        // If either operand is undefined, we can't compute
        if (leftValue === undefined || rightValue === undefined) {
          return undefined;
        }

        return Math.max(leftValue, rightValue);
      }

      // Count/CountItem: get the count of an item (used as operand in Compare/Arithmetic)
      // Rule Builder: {"rule": "Count", "args": {"item_name": "Key"}}
      // Rule Builder: {"rule": "CountItem", "args": {"item_name": "Key"}}
      case 'Count':
      case 'CountItem': {
        const itemName = args.item_name;
        if (!itemName) {
          log('warn', '[evaluateRuleBuilderRule] Count rule missing item_name');
          return 0;
        }
        // Use countItem if available, otherwise fall back to has check
        if (typeof context?.countItem === 'function') {
          return context.countItem(itemName) || 0;
        }
        // Fallback: return 1 if has, 0 if not
        const hasItem = evaluateRule({ type: 'item_check', item: itemName, count: 1 }, context, depth + 1, localScope);
        return hasItem ? 1 : 0;
      }

      // CountGroup: get the count of items in a group
      // Rule Builder: {"rule": "CountGroup", "args": {"group": "Keys"}}
      case 'CountGroup': {
        const groupName = args.group;
        if (!groupName) {
          log('warn', '[evaluateRuleBuilderRule] CountGroup rule missing group');
          return 0;
        }
        if (typeof context?.countGroup === 'function') {
          return context.countGroup(groupName) || 0;
        }
        // Fallback: delegate to AST evaluator
        return evaluateRule({ type: 'state_method', method: 'count_group', args: [{ type: 'constant', value: groupName }] }, context, depth + 1, localScope);
      }

      // CountGroupUnique: get the count of unique items in a group
      // Rule Builder: {"rule": "CountGroupUnique", "args": {"group": "Keys"}}
      case 'CountGroupUnique': {
        const groupName = args.group;
        if (!groupName) {
          log('warn', '[evaluateRuleBuilderRule] CountGroupUnique rule missing group');
          return 0;
        }
        if (typeof context?.countGroupUnique === 'function') {
          return context.countGroupUnique(groupName) || 0;
        }
        // Fallback: delegate to AST evaluator
        return evaluateRule({ type: 'state_method', method: 'count_group_unique', args: [{ type: 'constant', value: groupName }] }, context, depth + 1, localScope);
      }

      // CountFromList: get cumulative count of items from a list
      // Rule Builder: {"rule": "CountFromList", "args": {"item_names": ["Key", "Door"]}}
      // Returns total count of all listed items (duplicates in list are counted separately)
      case 'CountFromList': {
        const itemNames = args.item_names || args.items || [];
        if (!Array.isArray(itemNames) || itemNames.length === 0) {
          return 0;
        }
        let total = 0;
        for (const itemName of itemNames) {
          if (typeof context?.countItem === 'function') {
            total += context.countItem(itemName) || 0;
          } else {
            // Fallback: delegate to AST evaluator
            const count = evaluateRule({ type: 'count_item', item: itemName }, context, depth + 1, localScope);
            total += count || 0;
          }
        }
        return total;
      }

      // UniqueCount: check if enough unique item types are present
      // Rule Builder: {"rule": "UniqueCount", "args": {"threshold": 3, "items": [["ItemA", 1.0], ["ItemB", 1.0]]}}
      // Returns true if the number of unique item types present >= threshold
      case 'UniqueCount': {
        const threshold = args.threshold || 0;
        const items = args.items || [];
        if (!Array.isArray(items)) {
          return threshold <= 0;
        }
        let uniqueCount = 0;
        for (const itemEntry of items) {
          // Items can be either strings or [itemName, weight] tuples
          const itemName = Array.isArray(itemEntry) ? itemEntry[0] : itemEntry;
          const hasItem = typeof context?.hasItem === 'function'
            ? context.hasItem(itemName)
            : evaluateRule({ type: 'item_check', item: itemName }, context, depth + 1, localScope);
          if (hasItem) {
            uniqueCount++;
          }
        }
        return uniqueCount >= threshold;
      }

      // SettingValue: get a game setting value
      // Rule Builder: {"rule": "SettingValue", "args": {"setting": "difficulty"}}
      case 'SettingValue': {
        const settingName = args.setting;
        if (!settingName) {
          log('warn', '[evaluateRuleBuilderRule] SettingValue rule missing setting');
          return undefined;
        }
        // Try to get setting from context
        if (context.getStaticData || context.staticData) {
          const staticData = context.getStaticData ? context.getStaticData() : context.staticData;
          const playerId = context.playerId || context.getPlayerId?.() || context.getPlayerSlot?.() || DEFAULT_PLAYER_ID;
          // Get world data
          const worldData = staticData?.world;
          if (worldData && worldData[playerId]) {
            const playerWorld = worldData[playerId];

            // Check direct setting first
            let settingValue = playerWorld[settingName];

            // If not found, check in options sub-object
            if (settingValue === undefined && playerWorld.options) {
              settingValue = playerWorld.options[settingName];
            }

            if (settingValue !== undefined) {
              // Convert string booleans to actual booleans
              if (settingValue === 'true') return true;
              if (settingValue === 'false') return false;
              return settingValue;
            }
          }
        }
        log('debug', `[evaluateRuleBuilderRule] SettingValue: setting '${settingName}' not found`);
        return undefined;
      }

      // OptionValue: get a user-configurable option value
      // Rule Builder: {"rule": "OptionValue", "args": {"option": "open_pyramid"}}
      case 'OptionValue': {
        const optionName = args.option;
        if (!optionName) {
          log('warn', '[evaluateRuleBuilderRule] OptionValue rule missing option');
          return undefined;
        }
        // Try to get option from context
        if (context.getStaticData || context.staticData) {
          const staticData = context.getStaticData ? context.getStaticData() : context.staticData;
          const playerId = context.playerId || context.getPlayerId?.() || context.getPlayerSlot?.() || DEFAULT_PLAYER_ID;
          // Get world data
          const worldData = staticData?.world;
          if (worldData && worldData[playerId]) {
            const playerWorld = worldData[playerId];

            // Check in options sub-object first (where options typically are)
            let optionValue = playerWorld.options?.[optionName];

            // If not found, check at top level
            if (optionValue === undefined) {
              optionValue = playerWorld[optionName];
            }

            if (optionValue !== undefined) {
              // Convert string booleans to actual booleans
              if (optionValue === 'true') return true;
              if (optionValue === 'false') return false;
              return optionValue;
            }
          }
        }
        log('debug', `[evaluateRuleBuilderRule] OptionValue: option '${optionName}' not found`);
        return undefined;
      }

      // WorldAttribute: get a runtime-computed world attribute value
      // Rule Builder: {"rule": "WorldAttribute", "args": {"attribute": "shop_items", "index": 0}}
      case 'WorldAttribute': {
        const attributeName = args.attribute;
        const index = args.index;
        if (!attributeName) {
          log('warn', '[evaluateRuleBuilderRule] WorldAttribute rule missing attribute');
          return undefined;
        }
        // Try to get attribute from context
        if (context.getStaticData || context.staticData) {
          const staticData = context.getStaticData ? context.getStaticData() : context.staticData;
          const playerId = context.playerId || context.getPlayerId?.() || context.getPlayerSlot?.() || DEFAULT_PLAYER_ID;
          // Get world data
          const worldData = staticData?.world;
          if (worldData && worldData[playerId]) {
            const playerWorld = worldData[playerId];

            // Get the attribute value
            let attrValue = playerWorld[attributeName];

            // Apply index if specified
            if (attrValue !== undefined && index !== undefined) {
              if (Array.isArray(attrValue) && typeof index === 'number') {
                attrValue = attrValue[index];
              } else if (typeof attrValue === 'object' && attrValue !== null) {
                attrValue = attrValue[index];
              }
            }

            if (attrValue !== undefined) {
              // Convert string booleans to actual booleans
              if (attrValue === 'true') return true;
              if (attrValue === 'false') return false;
              return attrValue;
            }
          }
        }
        log('debug', `[evaluateRuleBuilderRule] WorldAttribute: attribute '${attributeName}' not found`);
        return undefined;
      }

      // ItemCheck: complex item check (fallback from converter when item couldn't be resolved)
      // Rule Builder: {"rule": "ItemCheck", "args": {"item": {...}, "count": ...}}
      case 'ItemCheck': {
        const item = args.item;
        const count = args.count ?? 1;
        // Try to resolve item to a string
        let itemName;
        if (typeof item === 'string') {
          itemName = item;
        } else if (item && typeof item === 'object') {
          // Try to evaluate item expression
          const resolvedItem = evaluateRule(item, context, depth + 1, localScope);
          if (typeof resolvedItem === 'string') {
            itemName = resolvedItem;
          }
        }
        if (!itemName) {
          log('warn', '[evaluateRuleBuilderRule] ItemCheck could not resolve item', { item });
          return false;
        }
        // Resolve count if it's a complex expression
        let countValue = count;
        if (typeof count === 'object') {
          countValue = evaluateRule(count, context, depth + 1, localScope);
        }
        // Delegate to AST evaluator
        return evaluateRule({ type: 'item_check', item: itemName, count: countValue ?? 1 }, context, depth + 1, localScope);
      }

      // StateMethod: complex state method call (fallback from converter)
      // Rule Builder: {"rule": "StateMethod", "args": {"method": "...", "args": [...]}}
      case 'StateMethod': {
        const method = args.method;
        const methodArgs = args.args || [];
        if (!method) {
          log('warn', '[evaluateRuleBuilderRule] StateMethod missing method');
          return false;
        }
        // Pass args directly to AST evaluator - it will evaluate them
        return evaluateRule({ type: 'state_method', method, args: methodArgs }, context, depth + 1, localScope);
      }

      // Attribute: complex attribute access (fallback from converter)
      // Rule Builder: {"rule": "Attribute", "args": {"object": {...}, "attr": "..."}}
      case 'Attribute': {
        const obj = args.object;
        const attr = args.attr;
        if (!attr) {
          log('warn', '[evaluateRuleBuilderRule] Attribute missing attr');
          return undefined;
        }
        // Convert object if it's Rule Builder format
        let convertedObj = obj;
        if (obj && typeof obj === 'object' && obj.rule) {
          convertedObj = evaluateRule(obj, context, depth + 1, localScope);
        }
        // Delegate to AST evaluator
        return evaluateRule({ type: 'attribute', object: convertedObj, attr }, context, depth + 1, localScope);
      }

      // Name: variable/name reference (fallback from converter)
      // Rule Builder: {"rule": "Name", "args": {"name": "..."}}
      case 'Name': {
        const name = args.name;
        if (!name) {
          log('warn', '[evaluateRuleBuilderRule] Name missing name');
          return undefined;
        }
        // Delegate to AST evaluator
        return evaluateRule({ type: 'name', name }, context, depth + 1, localScope);
      }

      // Tuple: tuple expression (fallback from converter)
      // Rule Builder: {"rule": "Tuple", "args": {"value": [...]}}
      case 'Tuple': {
        const value = args.value || [];
        // Evaluate each element
        return value.map(item => {
          if (item && typeof item === 'object') {
            return evaluateRule(item, context, depth + 1, localScope);
          }
          return item;
        });
      }

      // weighted_sum: Check if weighted sum of owned items meets threshold (Overcooked! 2)
      // Rule Builder: {"rule": "weighted_sum", "args": [threshold, [[item, weight], ...]]}
      // The logic: sum (count_of_item * weight) for each item, return true if sum >= threshold
      case 'weighted_sum': {
        // Handle both array format and object format for args
        let thresholdArg, itemsArg;
        if (Array.isArray(rule.args)) {
          // New format: rule.args is an array [threshold, items]
          thresholdArg = rule.args[0];
          itemsArg = rule.args[1];
        } else {
          // Fallback for object format
          thresholdArg = args[0];
          itemsArg = args[1];
        }

        // Evaluate threshold (usually a Constant with value 1.0)
        const threshold = evaluateRule(thresholdArg, context, depth + 1, localScope);
        if (threshold === undefined || typeof threshold !== 'number') {
          log('warn', '[evaluateRuleBuilderRule] weighted_sum: invalid threshold', { threshold });
          return undefined;
        }

        // Evaluate items array (array of [item_name, weight] pairs)
        const items = evaluateRule(itemsArg, context, depth + 1, localScope);
        if (!Array.isArray(items)) {
          log('warn', '[evaluateRuleBuilderRule] weighted_sum: invalid items array', { items });
          return undefined;
        }

        // Calculate weighted sum of owned items
        let total = 0;
        let hasUndefined = false;

        for (const pair of items) {
          if (!Array.isArray(pair) || pair.length < 2) continue;

          const [itemName, weight] = pair;
          if (typeof itemName !== 'string' || typeof weight !== 'number') continue;

          // Get count of this item from context
          let itemCount;
          if (typeof context.countItem === 'function') {
            itemCount = context.countItem(itemName);
          } else if (typeof context.count === 'function') {
            itemCount = context.count(itemName);
          }

          if (itemCount === undefined) {
            hasUndefined = true;
            continue;
          }

          // Add weight for each copy of the item owned
          total += itemCount * weight;

          // Early exit if we've already met the threshold (with small tolerance for floating point)
          if (total >= threshold - 0.01) {
            return true;
          }
        }

        // If we had undefined counts, we can't be certain
        if (hasUndefined && total < threshold) {
          return undefined;
        }

        return total >= threshold - 0.01;
      }

      // unique_count: Check if count of unique items owned meets threshold (A Hat in Time)
      // Rule Builder: {"rule": "unique_count", "args": [threshold, [[item, weight], ...]]}
      // The logic: sum (weight if count > 0 else 0) for each item, return true if sum >= threshold
      // Unlike weighted_sum, this counts unique item types, not total items
      case 'unique_count': {
        // Handle both array format and object format for args
        let thresholdArg, itemsArg;
        if (Array.isArray(rule.args)) {
          // New format: rule.args is an array [threshold, items]
          thresholdArg = rule.args[0];
          itemsArg = rule.args[1];
        } else {
          // Fallback for object format
          thresholdArg = args[0];
          itemsArg = args[1];
        }

        // Evaluate threshold (usually a Constant with value like 12.0)
        const threshold = evaluateRule(thresholdArg, context, depth + 1, localScope);
        if (threshold === undefined || typeof threshold !== 'number') {
          log('warn', '[evaluateRuleBuilderRule] unique_count: invalid threshold', { threshold });
          return undefined;
        }

        // Evaluate items array (array of [item_name, weight] pairs)
        const items = evaluateRule(itemsArg, context, depth + 1, localScope);
        if (!Array.isArray(items)) {
          log('warn', '[evaluateRuleBuilderRule] unique_count: invalid items array', { items });
          return undefined;
        }

        // Calculate count of unique items owned (weight if count > 0, else 0)
        let total = 0;
        let hasUndefined = false;

        for (const item of items) {
          // Handle both formats:
          // 1. [itemName, weight] pairs (weighted format)
          // 2. Simple string item names (implicit weight of 1)
          let itemName, weight;
          if (Array.isArray(item) && item.length >= 2) {
            [itemName, weight] = item;
            if (typeof itemName !== 'string' || typeof weight !== 'number') continue;
          } else if (typeof item === 'string') {
            itemName = item;
            weight = 1; // Default weight for simple string format
          } else {
            continue;
          }

          // Get count of this item from context
          let itemCount;
          if (typeof context.countItem === 'function') {
            itemCount = context.countItem(itemName);
          } else if (typeof context.count === 'function') {
            itemCount = context.count(itemName);
          }

          if (itemCount === undefined) {
            hasUndefined = true;
            continue;
          }

          // Add weight only if we have at least one of this item (unique count)
          if (itemCount > 0) {
            total += weight;
          }

          // Early exit if we've already met the threshold (with small tolerance for floating point)
          if (total >= threshold - 0.01) {
            return true;
          }
        }

        // If we had undefined counts, we can't be certain
        if (hasUndefined && total < threshold) {
          return undefined;
        }

        return total >= threshold - 0.01;
      }

      // Unknown rule type - try to find as a custom helper or delegate to AST evaluator
      default: {
        log('debug', `[evaluateRuleBuilderRule] Unknown Rule Builder type '${ruleName}', checking options`);

        // Check for _original_ast_type to determine if this should be delegated to AST evaluator
        // Note: _original_ast_type may be at top level (rule._original_ast_type) or inside args (args._original_ast_type)
        const originalAstType = rule._original_ast_type || args?._original_ast_type;
        if (originalAstType && !originalAstType.endsWith('helper')) {
          // This was converted from an AST rule that we should try to evaluate as AST
          log('debug', `[evaluateRuleBuilderRule] Delegating to AST evaluator for type '${originalAstType}'`);

          // Build AST rule from the args
          const astRule = { type: originalAstType };

          // Copy non-metadata args to AST rule
          if (args) {
            for (const [key, value] of Object.entries(args)) {
              if (!key.startsWith('_')) {
                astRule[key] = value;
              }
            }
          }

          return evaluateRule(astRule, context, depth + 1, localScope);
        }

        // Handle as helper (converted from AST helper or unknown Rule Builder type)
        // New format: {rule: "helper_name", args: [...], _original_ast_type: "helper"}
        // Old format: {rule: "helper_name", args: {args: [...], _original_ast_type: "helper"}}
        // Raft format: {rule: "helper_name", _original_ast_type: "helper"} (no args)
        let helperArgs;
        if (Array.isArray(args)) {
          // New flattened format - args is directly an array
          helperArgs = args;
        } else if ((rule._original_ast_type?.endsWith('helper') || args._original_ast_type?.endsWith('helper')) && Array.isArray(args.args)) {
          // Old nested format - args.args contains the helper arguments
          helperArgs = args.args;
        } else {
          // For simpler Rule Builder rules, use all arg values (excluding metadata keys)
          helperArgs = Object.entries(args)
            .filter(([key]) => !key.startsWith('_'))
            .map(([, value]) => value);
        }
        // Try evaluating as an AST helper
        return evaluateRule({ type: 'helper', name: ruleName, args: helperArgs }, context, depth + 1, localScope);
      }
    }
  };
}
