// frontend/modules/stateManager/ruleEngine.js

// Remove stateManagerSingleton import and getter
// import stateManagerSingleton from './stateManagerSingleton.js';
// function getStateManager() {
//   return stateManagerSingleton.instance;
// }

// Evaluation trace object for capturing debug info
class RuleTrace {
  constructor(rule, depth) {
    this.type = rule?.type || 'unknown';
    this.rule = rule;
    this.depth = depth;
    this.children = [];
    this.result = null;
    this.startTime = new Date().toISOString();
    this.endTime = null;
  }

  addChild(child) {
    this.children.push(child);
  }

  complete(result) {
    this.result = result;
    this.endTime = new Date().toISOString();
    return this;
  }

  toJSON() {
    return {
      type: this.type,
      rule: this.rule,
      depth: this.depth,
      result: this.result,
      startTime: this.startTime,
      endTime: this.endTime,
      children: this.children,
    };
  }
}

/**
 * Recursively checks if a rule object contains defeat methods in its chain
 * @param {Object} ruleObj - The rule object to check
 * @param {StateSnapshotInterface} stateSnapshotInterface - Provides state access methods
 * @returns {boolean} - True if a defeat method was found in the chain
 */
function hasDefeatMethod(ruleObj, stateSnapshotInterface) {
  if (!ruleObj || typeof ruleObj !== 'object') return false;

  // Check if this is an attribute access to can_defeat or defeat_rule
  if (
    ruleObj.type === 'attribute' &&
    (ruleObj.attr === 'can_defeat' || ruleObj.attr === 'defeat_rule')
  ) {
    return true;
  }

  // Recursively check object property for attribute chains
  if (ruleObj.object) {
    // Pass the interface down
    return hasDefeatMethod(ruleObj.object, stateSnapshotInterface);
  }

  // Check function property for function calls
  if (ruleObj.function) {
    // Pass the interface down
    return hasDefeatMethod(ruleObj.function, stateSnapshotInterface);
  }

  return false;
}

function safeLog(message, level = 'debug') {
  if (
    window.consoleManager &&
    typeof window.consoleManager[level] === 'function'
  ) {
    window.consoleManager[level](message);
  } else {
    console[level] ? console[level](message) : console.log(message);
  }
}

/**
 * Specifically checks if a rule is a boss defeat check using targeted pattern matching
 * @param {Object} rule - The rule object to check
 * @param {StateSnapshotInterface} stateSnapshotInterface - Provides state access methods
 * @returns {boolean} - True if this is a boss defeat check
 */
function isBossDefeatCheck(rule, stateSnapshotInterface) {
  // Direct check for simple cases
  if (
    rule.type === 'attribute' &&
    (rule.attr === 'can_defeat' || rule.attr === 'defeat_rule')
  ) {
    return true;
  }

  // Check for the specific nested structure we're seeing in Desert Palace - Prize
  if (
    rule.type === 'function_call' &&
    rule.function &&
    rule.function.type === 'attribute'
  ) {
    // Check if the attribute is 'can_defeat'
    if (
      rule.function.attr === 'can_defeat' ||
      rule.function.attr === 'defeat_rule'
    ) {
      return true;
    }

    // Check deeper in the chain if we have a boss or dungeon reference
    let current = rule.function.object;
    while (current) {
      if (current.type === 'attribute') {
        // If we see boss or dungeon in the chain, consider it a boss defeat check
        if (current.attr === 'boss' || current.attr === 'dungeon') {
          return true;
        }
        current = current.object;
      } else {
        break;
      }
    }
  }

  return false;
}

/**
 * Evaluates a rule against the provided state context (either StateManager or main thread snapshot).\n * @param {any} rule - The rule object (or primitive) to evaluate.\n * @param {object} context - Either the StateManager instance (or its interface) in the worker,\n *                           or the snapshot interface on the main thread.\n * @param {number} [depth=0] - Current recursion depth for debugging.\n * @returns {boolean|any} - The result of the rule evaluation.\n */
export const evaluateRule = (rule, context, depth = 0) => {
  if (!rule) {
    return true; // Empty rule is true
  }

  // --- Log the received context object --- >
  /* // Commented out for cleaner console
  if (depth === 0) {
    // Log only for top-level calls to reduce noise initially
    console.log('[evaluateRule Top-Level Context Check]', {
      contextReceived: typeof context,
      hasIsSnapshotInterface: context ? context._isSnapshotInterface : 'N/A',
      hasGetItemCount: context ? typeof context.countItem : 'N/A', // Check for countItem specifically
      hasExecuteHelper: context ? typeof context.executeHelper : 'N/A',
    });
  }
  */
  // --- END LOG --- >

  const isSnapshotInterfaceContext =
    context && context._isSnapshotInterface === true;
  const isWorkerContext = !isSnapshotInterfaceContext; // Simplified assumption

  if (!context) {
    console.error('[evaluateRule] Missing context object.', { rule });
    return isSnapshotInterfaceContext ? undefined : false; // Unknown for snapshot
  }
  if (
    isWorkerContext &&
    (!context.inventory || !context.helpers || !context.inventory.itemData)
  ) {
    console.error(
      '[evaluateRule] Invalid worker context provided (missing inventory, helpers, or inventory.itemData).',
      { rule }
    );
    return false; // Worker errors are still hard false for now
  }
  if (isSnapshotInterfaceContext && typeof context.hasItem !== 'function') {
    console.error(
      '[evaluateRule] Invalid snapshot interface provided (missing hasItem).',
      { rule }
    );
    return undefined; // Unknown for snapshot
  }

  let result; // Not initializing to false, so undefined can propagate naturally
  const ruleType = rule?.type;

  try {
    switch (ruleType) {
      case 'helper': {
        const args = rule.args
          ? rule.args.map((arg) => evaluateRule(arg, context, depth + 1))
          : [];

        // Filter out undefined arguments if a helper isn't designed to handle them,
        // or ensure helpers are robust. For now, let's see if any arg is undefined.
        if (args.some((arg) => arg === undefined)) {
          result = undefined; // If any argument to helper is unknown, helper result is unknown
        } else if (isSnapshotInterfaceContext) {
          if (typeof context.executeHelper === 'function') {
            result = context.executeHelper(rule.name, ...args);
            // executeHelper itself should return undefined if it can't evaluate
          } else {
            console.warn(
              `[evaluateRule SnapshotIF] context.executeHelper is not a function for helper \'${rule.name}\'. Assuming undefined.`
            );
            result = undefined;
          }
        } else {
          // Worker Context
          if (
            context.helpers &&
            typeof context.helpers.executeHelper === 'function'
          ) {
            result = context.helpers.executeHelper(rule.name, ...args);
          } else {
            console.error(
              `[evaluateRule Worker] context.helpers.executeHelper not found for \'${rule.name}\'.`
            );
            result = false; // Worker failure
          }
        }
        break;
      }

      case 'state_method': {
        const args = rule.args
          ? rule.args.map((arg) => evaluateRule(arg, context, depth + 1))
          : [];

        if (args.some((arg) => arg === undefined)) {
          result = undefined;
        } else if (isSnapshotInterfaceContext) {
          if (typeof context.executeStateManagerMethod === 'function') {
            result = context.executeStateManagerMethod(rule.method, ...args);
            // executeStateManagerMethod itself should return undefined if it can't evaluate
          } else {
            console.warn(
              `[evaluateRule SnapshotIF] context.executeStateManagerMethod not a function for \'${rule.method}\'. Assuming undefined.`
            );
            result = undefined;
          }
        } else {
          // Worker Context
          if (typeof context[rule.method] === 'function') {
            result = context[rule.method](...args);
          } else {
            console.error(
              `[evaluateRule Worker] StateManager method \'${rule.method}\' not found.`
            );
            result = false;
          }
        }
        break;
      }
      case 'and': {
        result = true; // Assume true initially
        let hasUndefined = false;
        for (const condition of rule.conditions || []) {
          const conditionResult = evaluateRule(condition, context, depth + 1);
          if (conditionResult === false) {
            result = false;
            hasUndefined = false; // Definitively false
            break;
          }
          if (conditionResult === undefined) {
            hasUndefined = true;
          }
        }
        if (result && hasUndefined) {
          // If not definitively false, but encountered undefined
          result = undefined;
        }
        break;
      }

      case 'or': {
        result = false; // Assume false initially
        let hasUndefined = false;
        for (const condition of rule.conditions || []) {
          const conditionResult = evaluateRule(condition, context, depth + 1);
          if (conditionResult === true) {
            result = true;
            hasUndefined = false; // Definitively true
            break;
          }
          if (conditionResult === undefined) {
            hasUndefined = true;
          }
        }
        if (!result && hasUndefined) {
          // If not definitively true, but encountered undefined
          result = undefined;
        }
        break;
      }

      case 'not': {
        const operandResult = evaluateRule(rule.operand, context, depth + 1);
        if (operandResult === undefined) {
          result = undefined;
        } else {
          result = !operandResult;
        }
        break;
      }

      case 'value': {
        result = rule.value;
        break;
      }

      case 'attribute': {
        const objectResult = evaluateRule(rule.object, context, depth + 1);
        if (objectResult === undefined) {
          result = undefined; // If the base object is unknown, attribute is unknown
        } else if (objectResult === null) {
          console.warn(
            `[evaluateRule] Attribute \'${rule.attr}\' accessed on null object. Rule:`,
            rule.object
          );
          result = isSnapshotInterfaceContext ? undefined : false;
        } else {
          // Special handling for settings if the object is the context itself (snapshot or worker)
          // and we are trying to get a setting value.
          if (
            (isSnapshotInterfaceContext ||
              (isWorkerContext && objectResult === context)) &&
            typeof objectResult.getSetting === 'function' &&
            !(rule.attr in objectResult)
          ) {
            // Check if it's not a direct property
            result = objectResult.getSetting(rule.attr);
            // If getSetting returns undefined, it means the setting is not present or value is undefined.
            // This is different from the rule node itself being "unknown".
            // If the setting itself is not found by getSetting, that's its value.
          } else {
            result = objectResult[rule.attr];
          }

          // If, after attempting to get the attribute, the result is undefined,
          // it means the attribute doesn't exist on the object.
          // For snapshot, this implies "unknown" if it's not a setting we explicitly got as undefined.
          if (result === undefined && isSnapshotInterfaceContext) {
            // Check if it was a setting that was explicitly undefined vs. a missing attribute
            let wasSettingLookup = false;
            if (
              (isSnapshotInterfaceContext ||
                (isWorkerContext && objectResult === context)) &&
              typeof objectResult.getSetting === 'function' &&
              !(rule.attr in objectResult)
            ) {
              wasSettingLookup = true;
            }
            if (!wasSettingLookup) {
              // If it wasn't a setting lookup that returned undefined, then the attr is unknown.
              /* // Commented out for cleaner console
              console.warn(
                `[evaluateRule SnapshotIF] Attribute '${rule.attr}' resolved to undefined on object. Assuming rule node is undefined. Object:`,
                objectResult
              );
              */
              result = undefined;
            }
            // If it *was* a setting lookup that returned undefined, 'result' is already correctly undefined (the setting's value).
          }
        }
        break;
      }

      case 'function_call': {
        const func = evaluateRule(rule.function, context, depth + 1);
        if (typeof func === 'undefined') {
          result = undefined;
          break;
        }
        const args = (rule.args || []).map((arg) =>
          evaluateRule(arg.value, context, depth + 1)
        );
        if (typeof func === 'function') {
          try {
            let thisContext = null;
            if (rule.function?.type === 'attribute' && rule.function.object) {
              thisContext = evaluateRule(
                rule.function.object,
                context,
                depth + 1
              );
            }
            if (thisContext === null || typeof thisContext === 'undefined') {
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
            console.error(
              `[evaluateRule] Error executing function call '${funcName}':`,
              e,
              {
                rule,
                contextType: isSnapshotInterfaceContext
                  ? 'snapshotIF'
                  : 'worker',
              }
            );
            result = false;
          }
        } else {
          console.warn(
            `[evaluateRule] Resolved identifier is not a function:`,
            { identifier: rule.function, resolvedValue: func }
          );
          result = false;
        }
        break;
      }

      case 'subscript': {
        const value = evaluateRule(rule.value, context, depth + 1);
        const index = evaluateRule(rule.index, context, depth + 1);
        if (isSnapshotInterfaceContext) {
          // For snapshot, if value is 'inventory', we might redirect to countItem or hasItem
          // This is a simplistic direct access for now, might need more specific handling.
          if (value === context.inventory && context.countItem) {
            result = context.countItem(index); // Assuming index is itemName, result is count
          } else if (value && typeof value === 'object') {
            result = value[index];
          }
        } else if (value instanceof Map) {
          // Worker context
          result = value.get(index);
        } else if (value && typeof value === 'object') {
          // Worker context
          result = value[index];
        } else {
          console.warn(
            '[evaluateRule] Subscript applied to non-object/non-map.',
            { rule }
          );
          result = undefined;
        }
        break;
      }

      case 'compare': {
        const left = evaluateRule(rule.left, context, depth + 1);
        const right = evaluateRule(rule.right, context, depth + 1);
        const op = rule.op;
        switch (op) {
          case '>':
            result = left > right;
            break;
          case '<':
            result = left < right;
            break;
          case '>=':
            result = left >= right;
            break;
          case '<=':
            result = left <= right;
            break;
          case '==':
            result = left == right;
            break;
          case '!=':
            result = left != right;
            break;
          case 'in':
            if (Array.isArray(right)) {
              result = right.includes(left);
            } else if (typeof right === 'string') {
              result = right.includes(left);
            } else {
              console.warn(
                '[evaluateRule] "in" operator used with non-array/non-string on the right side:',
                { left, right }
              );
              result = false;
            }
            break;
          default:
            console.warn(
              `[evaluateRule] Unsupported comparison operator: ${op}`
            );
            result = false;
        }
        break;
      }

      case 'item_check': {
        const itemName = evaluateRule(rule.item, context, depth + 1);
        if (isSnapshotInterfaceContext) {
          if (typeof context.hasItem === 'function') {
            result = context.hasItem(itemName);
          } else {
            console.warn(
              '[evaluateRule SnapshotIF] context.hasItem is not a function for item_check.'
            );
            result = undefined;
          }
        } else {
          // Worker Context
          if (
            context.inventory &&
            typeof context.inventory.has === 'function'
          ) {
            result = context.inventory.has(itemName);
          } else {
            console.warn(
              '[evaluateRule Worker] context.inventory.has is not a function for item_check.'
            );
            result = false;
          }
        }
        break;
      }

      case 'count_check': {
        const itemName = evaluateRule(rule.item, context, depth + 1);
        const requiredCount = evaluateRule(rule.count, context, depth + 1);
        if (isSnapshotInterfaceContext) {
          if (typeof context.countItem === 'function') {
            // ADDING DETAILED LOG FOR THIS SPECIFIC CASE
            // console.warn( // Temporarily commented out
            //   '[evaluateRule count_check SnapshotIF Specific Log]',
            //   {
            //     contextType: typeof context,
            //     isSnapshotInterfaceProp: context._isSnapshotInterface,
            //     hasCountItemMethod: typeof context.countItem,
            //     itemName,
            //     requiredCount,
            //   }
            // );
            const currentCount = context.countItem(itemName);
            if (currentCount === undefined && isSnapshotInterfaceContext) {
              // If countItem itself returns undefined
              result = undefined;
            } else {
              result = (currentCount || 0) >= requiredCount;
            }
          } else {
            console.warn(
              '[evaluateRule SnapshotIF] context.countItem is not a function for count_check.'
            );
            result = undefined;
          }
        } else {
          // Worker Context
          if (
            context.inventory &&
            typeof context.inventory.count === 'function'
          ) {
            const currentCount = context.inventory.count(itemName);
            result = (currentCount || 0) >= requiredCount;
          } else {
            console.warn(
              '[evaluateRule Worker] context.inventory.count is not a function for count_check.'
            );
            result = false;
          }
        }
        break;
      }

      case 'group_check': {
        const groupName = evaluateRule(rule.group, context, depth + 1);
        const requiredCount = evaluateRule(rule.count, context, depth + 1); // Assuming count is always present
        if (isSnapshotInterfaceContext) {
          if (typeof context.countGroup === 'function') {
            const currentCount = context.countGroup(groupName);
            if (currentCount === undefined) result = undefined;
            else result = (currentCount || 0) >= requiredCount;
          } else {
            console.warn(
              '[evaluateRule SnapshotIF] context.countGroup is not a function for group_check.'
            );
            result = undefined;
          }
        } else {
          // Worker Context
          if (
            context.inventory &&
            typeof context.inventory.countGroup === 'function'
          ) {
            const currentCount = context.inventory.countGroup(groupName);
            result = (currentCount || 0) >= requiredCount;
          } else {
            console.warn(
              '[evaluateRule Worker] context.inventory.countGroup is not a function for group_check.'
            );
            result = false;
          }
        }
        break;
      }

      case 'setting_check': {
        let settingName = evaluateRule(rule.setting, context, depth + 1);
        let expectedValue = evaluateRule(rule.value, context, depth + 1);
        if (typeof settingName === 'string') {
          result = context.getSetting(settingName) === expectedValue;
        } else {
          console.warn(
            '[evaluateRule] Invalid setting name for setting_check',
            { rule, settingName }
          );
          result = false;
        }
        break;
      }

      case 'constant': {
        result = rule.value;
        break;
      }

      case 'name': {
        if (isSnapshotInterfaceContext) {
          if (typeof context.resolveRuleObject === 'function') {
            if (rule.name === 'player') {
              console.log(
                "[evaluateRule SnapshotIF 'player'] Rule before resolve:",
                JSON.parse(JSON.stringify(rule))
              );
              console.log(
                "[evaluateRule SnapshotIF 'player'] Context before resolve:",
                {
                  isSnapshotInterface: context._isSnapshotInterface,
                  hasPlayer: !!(context.snapshot && context.snapshot.player),
                  playerSlot: context.snapshot?.player?.slot,
                }
              );
            }
            result = context.resolveRuleObject(rule);
            if (rule.name === 'player') {
              console.log(
                `[evaluateRule SnapshotIF 'player'] Value of 'result' after call: ${result} (type: ${typeof result})`
              );
            }
            if (result === undefined) {
              console.warn(
                `[evaluateRule SnapshotIF] Name '${rule.name}' resolved to undefined by resolveRuleObject.`
              );
            }
          } else {
            // Fallback for snapshot if resolveRuleObject isn't there
            if (
              rule.name === 'state' ||
              rule.name === 'settings' ||
              rule.name === 'inventory'
            )
              result = context;
            else if (rule.name === 'helpers') result = context.helpers;
            else if (context.entities && context.entities[rule.name])
              result = context.entities[rule.name];
            else {
              console.warn(
                `[evaluateRule SnapshotIF] Name '${rule.name}' could not be resolved (no resolveRuleObject).`
              );
              result = undefined;
            }
          }
        } else {
          // Worker Context
          if (rule.name === 'state')
            result = context.state; // StateManager has a .state property
          else if (rule.name === 'inventory') result = context.inventory;
          else if (rule.name === 'helpers') result = context.helpers;
          else if (rule.name === 'settings')
            result = context.settings; // StateManager has a .settings property
          // Check for entities within helpers first for worker context
          else if (
            context.helpers &&
            context.helpers.entities &&
            context.helpers.entities[rule.name]
          ) {
            result = context.helpers.entities[rule.name];
          }
          // Then check for direct properties on StateManager (context) itself as a fallback
          else if (context[rule.name] !== undefined)
            result = context[rule.name];
          else {
            console.warn(
              `[evaluateRule Worker] Name '${rule.name}' not found on worker context or its sub-properties (state, inventory, helpers, settings, helpers.entities).`
            );
            result = null; // Consistent with previous worker behavior for not found names
          }
        }
        break;
      }

      // --- ADDED: Handle 'conditional' rule type --- >
      case 'conditional': {
        if (!rule.test || !rule.if_true || !rule.if_false) {
          console.warn(
            '[evaluateRule Conditional] Malformed conditional rule:',
            rule
          );
          result = false;
        } else {
          const testResult = evaluateRule(rule.test, context, depth + 1);
          if (testResult) {
            result = evaluateRule(rule.if_true, context, depth + 1);
          } else {
            result = evaluateRule(rule.if_false, context, depth + 1);
          }
        }
        break;
      }
      // --- END ADDED --- >

      // --- ADDED: Handle 'binary_op' rule type --- >
      case 'binary_op': {
        const left = evaluateRule(rule.left, context, depth + 1);
        const right = evaluateRule(rule.right, context, depth + 1);
        const op = rule.op; //  e.g., '+', '-', '*', '/', '==', '!=', '<', '>', '<=', '>=', 'AND', 'OR', etc.

        if (left === undefined || right === undefined) {
          result = undefined; // If any operand is unknown, the result is unknown
          break;
        }

        switch (op) {
          case '+':
            result = left + right;
            break;
          case '-':
            result = left - right;
            break;
          case '*':
            result = left * right;
            break;
          case '/':
            result = right !== 0 ? left / right : undefined;
            break; // Handle division by zero
          case '==':
            result = left == right;
            break;
          case '!=':
            result = left != right;
            break;
          case '<':
            result = left < right;
            break;
          case '>':
            result = left > right;
            break;
          case '<=':
            result = left <= right;
            break;
          case '>=':
            result = left >= right;
            break;
          // Logical operators - assuming they might appear here, though 'and'/'or' types exist
          case 'AND':
          case 'and':
            result = left && right;
            break;
          case 'OR':
          case 'or':
            result = left || right;
            break;
          // Bitwise operators (add if needed)
          // case '|': result = left | right; break;
          // case '&': result = left & right; break;
          // case '^': result = left ^ right; break;
          default:
            console.warn(`[evaluateRule] Unknown binary_op operator: ${op}`, {
              rule,
            });
            result = isSnapshotInterfaceContext ? undefined : false;
        }
        break;
      }
      // --- END ADDED --- >

      // --- ADDED: Handle 'list' rule type --- >
      case 'list': {
        if (!Array.isArray(rule.value)) {
          console.warn(
            '[evaluateRule] List rule does not have an array value:',
            rule
          );
          result = isSnapshotInterfaceContext ? undefined : []; // Default to empty list or undefined
          break;
        }
        const evaluatedList = rule.value.map((itemRule) =>
          evaluateRule(itemRule, context, depth + 1)
        );
        // If any item in the list evaluated to undefined, the entire list result might be considered undefined
        // depending on how it's used. For now, let's return the list with undefined values in it.
        // A more stringent approach would be: if (evaluatedList.some(item => item === undefined)) result = undefined;
        result = evaluatedList;
        break;
      }
      // --- END ADDED --- >

      default: {
        // For any unhandled rule type
        console.warn(`[evaluateRule] Unknown rule type: ${ruleType}`, { rule });
        result = isSnapshotInterfaceContext ? undefined : false; // Default to unknown for snapshot
        break;
      }
    }
  } catch (error) {
    console.error('[evaluateRule] Error during evaluation:', {
      ruleType,
      rule,
      error,
      contextType: typeof context,
      isSnapshot: isSnapshotInterfaceContext,
    });
    result = isSnapshotInterfaceContext ? undefined : false; // Default to unknown on error for snapshot
  }

  // Final check: if result is still undefined here (e.g. from a case not explicitly setting it or an error),
  // make sure it's consistently returned. For boolean-expected outcomes in worker, might default to false.
  // For snapshot, undefined should propagate.
  if (result === undefined && isWorkerContext) {
    // This should ideally not happen if all worker paths set true/false.
    // console.warn(`[evaluateRule Worker] Evaluation resulted in undefined for rule:`, rule, `Returning false.`);
    // return false; // Let's allow undefined to pass through for now, to see if it's handled by callers.
  }

  return result;
};

// Debugging helper function for visualizing rule structures in console
export function debugRule(rule, indent = 0) {
  const prefix = ' '.repeat(indent);

  if (!rule) {
    console.log(`${prefix}null or undefined rule`);
    return;
  }

  console.log(`${prefix}Type: ${rule.type}`);

  switch (rule.type) {
    case 'constant':
      console.log(`${prefix}Value: ${rule.value}`);
      break;

    case 'name':
      console.log(`${prefix}Name: ${rule.name}`);
      break;

    case 'attribute':
      console.log(`${prefix}Attribute: ${rule.attr}`);
      console.log(`${prefix}Object:`);
      debugRule(rule.object, indent + 2);
      break;

    case 'subscript':
      console.log(`${prefix}Subscript:`);
      console.log(`${prefix}  Value:`);
      debugRule(rule.value, indent + 4);
      console.log(`${prefix}  Index:`);
      debugRule(rule.index, indent + 4);
      break;

    case 'function_call':
      console.log(`${prefix}Function Call:`);
      console.log(`${prefix}  Function:`);
      debugRule(rule.function, indent + 4);
      console.log(`${prefix}  Args:`);
      (rule.args || []).forEach((arg, i) => {
        console.log(`${prefix}    Arg ${i + 1}:`);
        debugRule(arg, indent + 6);
      });
      break;

    case 'item_check':
      if (typeof rule.item === 'string') {
        console.log(`${prefix}Item: ${rule.item}`);
      } else {
        console.log(`${prefix}Item (complex):`);
        debugRule(rule.item, indent + 2);
      }
      break;

    case 'count_check':
      if (typeof rule.item === 'string') {
        console.log(`${prefix}Item: ${rule.item}`);
      } else {
        console.log(`${prefix}Item (complex):`);
        debugRule(rule.item, indent + 2);
      }

      if (typeof rule.count === 'number') {
        console.log(`${prefix}Count: ${rule.count}`);
      } else if (rule.count) {
        console.log(`${prefix}Count (complex):`);
        debugRule(rule.count, indent + 2);
      }
      break;

    case 'group_check':
      if (typeof rule.group === 'string') {
        console.log(`${prefix}Group: ${rule.group}`);
      } else {
        console.log(`${prefix}Group (complex):`);
        debugRule(rule.group, indent + 2);
      }

      console.log(`${prefix}Count: ${rule.count || 1}`);
      break;

    case 'helper':
      console.log(`${prefix}Helper: ${rule.name}`);
      if (rule.args && rule.args.length > 0) {
        console.log(`${prefix}Args:`);
        rule.args.forEach((arg, i) => {
          if (typeof arg === 'string' || typeof arg === 'number') {
            console.log(`${prefix}  Arg ${i + 1}: ${arg}`);
          } else {
            console.log(`${prefix}  Arg ${i + 1} (complex):`);
            debugRule(arg, indent + 4);
          }
        });
      }
      break;

    case 'and':
    case 'or':
      console.log(
        `${prefix}${rule.type.toUpperCase()} with ${
          rule.conditions.length
        } conditions:`
      );
      rule.conditions.forEach((cond, i) => {
        console.log(`${prefix}  Condition ${i + 1}:`);
        debugRule(cond, indent + 4);
      });
      break;

    case 'state_method':
      console.log(`${prefix}Method: ${rule.method}`);
      if (rule.args && rule.args.length > 0) {
        console.log(`${prefix}Args:`);
        rule.args.forEach((arg, i) => {
          if (typeof arg === 'string' || typeof arg === 'number') {
            console.log(`${prefix}  Arg ${i + 1}: ${arg}`);
          } else {
            console.log(`${prefix}  Arg ${i + 1} (complex):`);
            debugRule(arg, indent + 4);
          }
        });
      }
      break;

    case 'comparison':
      console.log(`${prefix}Comparison: ${rule.op}`);
      console.log(`${prefix}Left:`);
      if (typeof rule.left === 'object' && rule.left.type) {
        debugRule(rule.left, indent + 2);
      } else {
        console.log(`${prefix}  ${rule.left}`);
      }

      console.log(`${prefix}Right:`);
      if (typeof rule.right === 'object' && rule.right.type) {
        debugRule(rule.right, indent + 2);
      } else {
        console.log(`${prefix}  ${rule.right}`);
      }
      break;

    default:
      console.log(`${prefix}${JSON.stringify(rule, null, 2)}`);
  }
}

/**
 * Helper to extract function path from a Python AST function node
 * @param {Object} funcNode - Function node from the AST
 * @returns {string} - Extracted function path
 */
export function extractFunctionPath(funcNode) {
  if (!funcNode) return '(unknown)';

  if (funcNode.type === 'attribute') {
    // Handle attribute access (e.g., foo.bar)
    const objectPath = extractFunctionPath(funcNode.object);
    return `${objectPath}.${funcNode.attr}`;
  } else if (funcNode.type === 'name') {
    // Handle direct name (e.g., function_name)
    return funcNode.name;
  } else if (funcNode.type === 'subscript') {
    // Handle subscript access (e.g., foo[bar])
    return `${extractFunctionPath(funcNode.value)}[...]`;
  } else {
    // Other node types
    return `(${funcNode.type})`;
  }
}

/**
 * Log a Python AST structure with better formatting
 * @param {Object} rule - The AST node to visualize
 */
export function debugPythonAST(rule) {
  if (!rule) {
    console.log('null or undefined rule');
    return;
  }

  console.group(`Python AST Node: ${rule.type}`);

  switch (rule.type) {
    case 'function_call':
      console.log(`Function: ${extractFunctionPath(rule.function)}`);
      console.log('Arguments:');
      (rule.args || []).forEach((arg, i) => {
        console.group(`Arg ${i + 1}:`);
        debugPythonAST(arg);
        console.groupEnd();
      });
      break;

    case 'attribute':
      console.log(`Attribute: ${rule.attr}`);
      console.log('Object:');
      debugPythonAST(rule.object);
      break;

    case 'subscript':
      console.log('Value:');
      debugPythonAST(rule.value);
      console.log('Index:');
      debugPythonAST(rule.index);
      break;

    case 'name':
      console.log(`Name: ${rule.name}`);
      break;

    case 'constant':
      console.log(`Constant: ${rule.value}`);
      break;

    default:
      console.log(`${JSON.stringify(rule, null, 2)}`);
  }

  console.groupEnd();
}
