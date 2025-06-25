// frontend/modules/stateManager/evaluationProcessor.js
// Evaluation processor for rule processing - extracted from ruleEngine.js

import { BaseRuleProcessor } from './ruleProcessor.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('evaluationProcessor', message, ...data);
  } else {
    // In worker context, only log ERROR and WARN levels to keep console clean
    if (level === 'error' || level === 'warn') {
      const consoleMethod =
        console[level === 'info' ? 'log' : level] || console.log;
      consoleMethod(`[evaluationProcessor] ${message}`, ...data);
    }
  }
}

/**
 * Processor for evaluating rules to boolean/computed results.
 * Used by both worker thread and main thread evaluation.
 */
export class EvaluationProcessor extends BaseRuleProcessor {
  validateContext(context, rule) {
    // Check if context is provided and is a valid snapshot interface
    const isValidContext = context && context._isSnapshotInterface === true;
    if (!isValidContext) {
      log(
        'warn',
        '[EvaluationProcessor] Missing or invalid context (snapshotInterface). Evaluation may fail or be inaccurate.',
        { rule: rule, contextProvided: !!context }
      );
      return false;
    }
    return true;
  }

  handlePrimitive(rule, context, options) {
    // Handle primitive types directly if they sneak in
    return rule;
  }

  handleConstant(rule, context, options, processChild) {
    return rule.value;
  }

  handleName(rule, context, options, processChild) {
    // Resolve name using the context's resolveName method if available
    if (context && typeof context.resolveName === 'function') {
      return context.resolveName(rule.name);
    } else {
      log('warn', `[EvaluationProcessor] Context cannot resolve name: ${rule.name}`);
      return undefined;
    }
  }

  handleItemCheck(rule, context, options, processChild) {
    const itemName = processChild(rule.item);
    if (itemName === undefined) {
      return undefined;
    } else if (typeof context.hasItem === 'function') {
      return context.hasItem(itemName); // hasItem should return true/false/undefined
    } else {
      log('warn', '[EvaluationProcessor] context.hasItem is not a function for item_check.');
      return undefined;
    }
  }

  handleCountCheck(rule, context, options, processChild) {
    const itemName = processChild(rule.item);
    // Default count to 1 if not specified
    const requiredCount = rule.count !== undefined ? processChild(rule.count) : 1;

    if (itemName === undefined || requiredCount === undefined) {
      return undefined;
    } else if (typeof context.countItem === 'function') {
      const currentCount = context.countItem(itemName);
      // countItem itself might return undefined if it can't determine the count
      return currentCount === undefined ? undefined : (currentCount || 0) >= requiredCount;
    } else {
      log('warn', '[EvaluationProcessor] context.countItem is not a function for count_check.');
      return undefined;
    }
  }

  handleGroupCheck(rule, context, options, processChild) {
    const groupName = processChild(rule.group);
    // Default count to 1 if not specified
    const requiredCount = rule.count !== undefined ? processChild(rule.count) : 1;

    if (groupName === undefined || requiredCount === undefined) {
      return undefined;
    } else if (typeof context.countGroup === 'function') {
      const currentCount = context.countGroup(groupName);
      // countGroup might return undefined
      return currentCount === undefined ? undefined : (currentCount || 0) >= requiredCount;
    } else {
      log('warn', '[EvaluationProcessor] context.countGroup is not a function for group_check.');
      return undefined;
    }
  }

  handleHelper(rule, context, options, processChild) {
    const args = rule.args ? rule.args.map((arg) => processChild(arg)) : [];
    if (args.some((arg) => arg === undefined)) {
      return undefined;
    } else {
      if (typeof context.executeHelper === 'function') {
        return context.executeHelper(rule.name, ...args);
      } else {
        log('warn', `[EvaluationProcessor] context.executeHelper is not a function for helper '${rule.name}'. Assuming undefined.`);
        return undefined;
      }
    }
  }

  handleStateMethod(rule, context, options, processChild) {
    const args = rule.args ? rule.args.map((arg) => processChild(arg)) : [];

    if (args.some((arg) => arg === undefined)) {
      return undefined;
    } else {
      if (typeof context.executeStateManagerMethod === 'function') {
        return context.executeStateManagerMethod(rule.method, ...args);
      } else {
        log('warn', `[EvaluationProcessor] context.executeStateManagerMethod not a function for '${rule.method}'. Assuming undefined.`);
        return undefined;
      }
    }
  }

  handleAnd(rule, context, options, processChild) {
    let result = true; // Assume true initially
    let hasUndefined = false;
    for (const condition of rule.conditions || []) {
      const conditionResult = processChild(condition);
      if (conditionResult === false) {
        result = false;
        hasUndefined = false; // Definitively false
        break;
      }
      if (conditionResult === undefined) {
        hasUndefined = true; // Potential undefined result
      }
    }
    // Only set to undefined if not definitively false and encountered an undefined condition
    if (result === true && hasUndefined) {
      result = undefined;
    }
    return result;
  }

  handleOr(rule, context, options, processChild) {
    let result = false; // Assume false initially
    let hasUndefined = false;
    for (const condition of rule.conditions || []) {
      const conditionResult = processChild(condition);
      if (conditionResult === true) {
        result = true;
        hasUndefined = false; // Definitively true
        break;
      }
      if (conditionResult === undefined) {
        hasUndefined = true; // Potential undefined result
      }
    }
    // Only set to undefined if not definitively true and encountered an undefined condition
    if (result === false && hasUndefined) {
      result = undefined;
    }
    return result;
  }

  handleNot(rule, context, options, processChild) {
    // Handle both 'operand' and 'condition' field names for compatibility
    const conditionToNegate = rule.operand || rule.condition;
    if (!conditionToNegate) {
      log('warn', '[EvaluationProcessor] Missing operand/condition in not rule:', rule);
      return undefined;
    } else {
      const operandResult = processChild(conditionToNegate);
      // Negation of undefined is undefined
      return operandResult === undefined ? undefined : !operandResult;
    }
  }

  handleAttribute(rule, context, options, processChild) {
    const baseObject = processChild(rule.object);

    if (baseObject && typeof baseObject === 'object') {
      // Special handling for parent_region attribute on location objects
      if (rule.attr === 'parent_region' && baseObject.parent_region_name) {
        // Dynamically resolve the parent region from the context
        if (context.getStaticData && context.getStaticData().regions) {
          const regions = context.getStaticData().regions;
          return regions[baseObject.parent_region_name];
        }
        return undefined;
      }

      // First try direct property access
      let attrValue = baseObject[rule.attr];

      // If not found, try resolveAttribute for mapping/transformation
      if (attrValue === undefined && typeof context.resolveAttribute === 'function') {
        attrValue = context.resolveAttribute(baseObject, rule.attr);
      }

      // If the attribute value is itself a rule object that needs evaluation
      // Rule objects should have string type properties, not numeric ones (which are used by data objects)
      if (attrValue && typeof attrValue === 'object' && attrValue.type && typeof attrValue.type === 'string') {
        return processChild(attrValue);
      }

      if (typeof attrValue === 'function') {
        return attrValue.bind(baseObject);
      }

      return attrValue;
    } else {
      return undefined;
    }
  }

  handleFunctionCall(rule, context, options, processChild) {
    // Special handling for boss.can_defeat function calls
    // These need to be redirected to use the boss's defeat_rule data
    if (rule.function?.type === 'attribute' && rule.function.attr === 'can_defeat') {
      // Check if this is a boss.can_defeat call by walking up the chain
      let current = rule.function.object;
      let isDungeonBossDefeat = false;

      // Look for the pattern: location.parent_region.dungeon.boss.can_defeat
      while (current && current.type === 'attribute') {
        if (current.attr === 'boss') {
          isDungeonBossDefeat = true;
          break;
        }
        current = current.object;
      }

      if (isDungeonBossDefeat) {
        // Evaluate the boss object (everything before .can_defeat)
        const bossObject = processChild(rule.function.object);

        // Debug the chain resolution step by step
        log('debug', '[EvaluationProcessor] Boss defeat chain resolution:', {
          hasLocation: !!context.currentLocation,
          locationName: context.currentLocation?.name,
          bossObjectResult: bossObject,
          bossObjectType: typeof bossObject,
          hasBossDefeatRule: !!(bossObject && bossObject.defeat_rule),
          functionChain: this.extractFunctionChain(rule.function.object),
        });

        if (bossObject && bossObject.defeat_rule) {
          // Use the boss's defeat_rule instead of trying to call can_defeat
          log('debug', '[EvaluationProcessor] Redirecting boss.can_defeat to boss.defeat_rule', {
            boss: bossObject.name,
            defeatRule: bossObject.defeat_rule,
          });
          return processChild(bossObject.defeat_rule);
        } else {
          return undefined;
        }
      }
    }

    const func = processChild(rule.function);

    if (typeof func === 'undefined') {
      return undefined;
    }

    // Special case: If func is a rule object (not a JavaScript function),
    // evaluate it directly. This handles cases like boss.defeat_rule where
    // defeat_rule is a rule object that needs evaluation, not a function call.
    if (func && typeof func === 'object' && func.type && typeof func.type === 'string') {
      // Evaluate the rule object directly
      return processChild(func);
    }

    const args = (rule.args || []).map((arg) => processChild(arg));

    // If any argument evaluation results in undefined, the function call result is undefined
    if (args.some((arg) => arg === undefined)) {
      return undefined;
    }

    if (typeof func === 'function') {
      try {
        let thisContext = null;
        // Determine the context ('this') for the function call
        if (rule.function?.type === 'attribute' && rule.function.object) {
          // If the function was an attribute access (e.g., obj.method()),
          // 'this' should be the object it was accessed on.
          thisContext = processChild(rule.function.object);
        } else {
          // Otherwise, default to the main context (snapshotInterface)
          thisContext = context;
        }

        // Handle cases where thisContext might still be null/undefined after evaluation
        if (thisContext === null || typeof thisContext === 'undefined') {
          log('warn', "[EvaluationProcessor] Resolved 'this' context is null/undefined. Using main context.", rule.function);
          thisContext = context;
        }

        const result = func.apply(thisContext, args);
        // Check if the function itself returned undefined
        if (result === undefined) {
          // log('warn', `[EvaluationProcessor] Function ${rule.function?.attr || rule.function?.name || '?'} returned undefined.`);
        }
        return result;
      } catch (e) {
        let funcName = 'unknown';
        if (rule.function?.type === 'attribute') {
          funcName = rule.function.attr;
        } else if (rule.function?.type === 'value') {
          funcName = rule.function.value;
        } else if (rule.function?.type === 'name') {
          funcName = rule.function.name;
        }
        log('error', `[EvaluationProcessor] Error executing function call '${funcName}':`, e, {
          rule,
          contextType: context?._isSnapshotInterface ? 'snapshotIF' : 'worker',
        });
        return undefined; // Error during execution means undefined outcome
      }
    } else {
      log('warn', `[EvaluationProcessor] Resolved identifier is not a function:`, {
        identifier: rule.function,
        resolvedValue: func,
      });
      return undefined; // Not a function, result undefined
    }
  }

  handleSubscript(rule, context, options, processChild) {
    const list = processChild(rule.value);
    const index = processChild(rule.index);

    if (list === undefined || index === undefined) {
      return undefined; // If array/object or index is unknown, result is unknown
    } else if (list && typeof list === 'object') {
      return list[index]; // Access property/index
      // If list[index] itself is undefined (property doesn't exist), result remains undefined.
    } else {
      log('warn', '[EvaluationProcessor] Subscript applied to non-object/non-map or null value.', { rule, list });
      return undefined;
    }
  }

  handleCompare(rule, context, options, processChild) {
    const left = processChild(rule.left);
    const right = processChild(rule.right);
    const op = rule.op;

    // If either operand is undefined, the comparison result is undefined
    if (left === undefined || right === undefined) {
      return undefined;
    }

    switch (op) {
      case '>':
        return left > right;
      case '<':
        return left < right;
      case '>=':
        return left >= right;
      case '<=':
        return left <= right;
      case '==':
        if (Array.isArray(left) && Array.isArray(right)) {
          return left.length === right.length && left.every((val, index) => val == right[index]);
        } else {
          return left == right;
        }
      case '!=':
        if (Array.isArray(left) && Array.isArray(right)) {
          return left.length !== right.length || left.some((val, index) => val != right[index]);
        } else {
          return left != right;
        }
      case 'in':
        if (Array.isArray(right) || typeof right === 'string') {
          return right.includes(left);
        } else if (right instanceof Set) {
          // Handle Set
          return right.has(left);
        } else {
          log('warn', '[EvaluationProcessor] "in" operator used with invalid right side type:', { left, right });
          return false; // Define behavior: false if right side isn't iterable
        }
      default:
        log('warn', `[EvaluationProcessor] Unsupported comparison operator: ${op}`);
        return undefined; // Operator unknown -> result unknown
    }
  }

  handleConditional(rule, context, options, processChild) {
    if (!rule.test || !rule.if_true) {
      log('warn', '[EvaluationProcessor] Malformed conditional rule:', rule);
      return undefined;
    } else {
      const testResult = processChild(rule.test);
      if (testResult === undefined) {
        return undefined; // If test is unknown, outcome is unknown
      } else if (testResult) {
        return processChild(rule.if_true);
      } else {
        // Handle null if_false as false (can't defeat boss if condition not met)
        return rule.if_false === null ? false : processChild(rule.if_false);
      }
    }
  }

  handleBinaryOp(rule, context, options, processChild) {
    const left = processChild(rule.left);
    const right = processChild(rule.right);
    const op = rule.op;

    if (left === undefined || right === undefined) {
      return undefined;
    }

    switch (op) {
      case '+':
        return left + right;
      case '-':
        return left - right;
      case '*':
        return left * right;
      case '/':
        return right !== 0 ? left / right : undefined;
      case '==':
        return left == right;
      case '!=':
        return left != right;
      case '<':
        return left < right;
      case '>':
        return left > right;
      case '<=':
        return left <= right;
      case '>=':
        return left >= right;
      case 'AND':
      case 'and':
        return left && right;
      case 'OR':
      case 'or':
        return left || right;
      default:
        log('warn', `[EvaluationProcessor] Unknown binary_op operator: ${op}`, { rule });
        return undefined;
    }
  }

  handleList(rule, context, options, processChild) {
    if (!Array.isArray(rule.value)) {
      log('warn', '[EvaluationProcessor] List rule does not have an array value:', rule);
      return undefined;
    }
    const evaluatedList = rule.value.map((itemRule) => processChild(itemRule));
    // If any item evaluation is undefined, the list as a whole might be considered undefined for some operations
    // For now, return the list potentially containing undefined
    return evaluatedList.some((item) => item === undefined) ? undefined : evaluatedList;
  }

  handleSettingCheck(rule, context, options, processChild) {
    let settingName = processChild(rule.setting);
    let expectedValue = processChild(rule.value);

    if (settingName === undefined || expectedValue === undefined) {
      return undefined;
    } else if (typeof settingName === 'string') {
      const actualValue = context.getSetting(settingName);
      // If getSetting returns undefined (setting doesn't exist/value is undefined), comparison result is undefined
      return actualValue === undefined ? undefined : actualValue === expectedValue;
    } else {
      log('warn', '[EvaluationProcessor] Invalid setting name for setting_check', { rule, settingName });
      return undefined;
    }
  }

  // Helper method for extracting function chains (used in boss defeat logic)
  extractFunctionChain(node) {
    const chain = [];
    let current = node;

    while (current) {
      if (current.type === 'attribute') {
        chain.unshift(current.attr);
        current = current.object;
      } else if (current.type === 'name') {
        chain.unshift(current.name);
        break;
      } else {
        chain.unshift(`[${current.type}]`);
        break;
      }
    }

    return chain.join('.');
  }
}

// Create a singleton instance
export const evaluationProcessor = new EvaluationProcessor();