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
  // Check if we're in a worker context (no window object)
  const isWorkerContext = typeof window === 'undefined';

  // Use the new logger service if available
  if (!isWorkerContext && window.logger) {
    window.logger[level]('ruleEngine', message);
  } else if (
    !isWorkerContext &&
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
  // Ensure rule is an object
  if (typeof rule !== 'object' || rule === null) {
    // Handle primitive types directly if they sneak in (e.g., simple string/number requirement)
    // Though ideally, rules should always be structured objects.
    return rule; // Return the primitive value itself
  }

  // Check if context is provided and is a valid snapshot interface
  const isValidContext = context && context._isSnapshotInterface === true;
  if (!isValidContext) {
    console.warn(
      '[evaluateRule] Missing or invalid context (snapshotInterface). Evaluation may fail or be inaccurate.',
      { rule: rule, contextProvided: !!context }
    );
    return undefined;
  }

  let result;
  const ruleType = rule?.type;

  try {
    switch (ruleType) {
      case 'helper': {
        const args = rule.args
          ? rule.args.map((arg) => evaluateRule(arg, context, depth + 1))
          : [];
        if (args.some((arg) => arg === undefined)) {
          result = undefined;
        } else if (isValidContext) {
          if (typeof context.executeHelper === 'function') {
            result = context.executeHelper(rule.name, ...args);
          } else {
            console.warn(
              `[evaluateRule SnapshotIF] context.executeHelper is not a function for helper \'${rule.name}\'. Assuming undefined.`
            );
            result = undefined;
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
        } else if (isValidContext) {
          if (typeof context.executeStateManagerMethod === 'function') {
            result = context.executeStateManagerMethod(rule.method, ...args);
          } else {
            console.warn(
              `[evaluateRule SnapshotIF] context.executeStateManagerMethod not a function for \'${rule.method}\'. Assuming undefined.`
            );
            result = undefined;
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
            hasUndefined = true; // Potential undefined result
          }
        }
        // Only set to undefined if not definitively false and encountered an undefined condition
        if (result === true && hasUndefined) {
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
            hasUndefined = true; // Potential undefined result
          }
        }
        // Only set to undefined if not definitively true and encountered an undefined condition
        if (result === false && hasUndefined) {
          result = undefined;
        }
        break;
      }

      case 'not': {
        const operandResult = evaluateRule(rule.operand, context, depth + 1);
        // Negation of undefined is undefined
        result = operandResult === undefined ? undefined : !operandResult;
        break;
      }

      case 'value': // Handles literal values encoded as nodes
      case 'constant': {
        // Keep constant for backward compatibility
        result = rule.value;
        break;
      }

      case 'attribute': {
        const objectResult = evaluateRule(rule.object, context, depth + 1);
        if (objectResult === undefined) {
          result = undefined; // Cannot access attribute of undefined
        } else if (objectResult === null) {
          console.warn(
            `[evaluateRule] Attribute \'${rule.attr}\' accessed on null object. Rule:`,
            rule.object
          );
          result = undefined; // Accessing attr of null is likely undefined
        } else {
          // If the resolved object has the attribute directly, use it
          if (rule.attr in objectResult) {
            result = objectResult[rule.attr];
          } else {
            // Special handling: if object resolved to the 'settings' context, try getSetting
            if (typeof objectResult.getSetting === 'function') {
              // Check if objectResult resembles the settings part of the context
              // This is heuristic - ideally rule.object would resolve clearly
              const settingsFromContext = context.resolveName('settings');
              if (objectResult === settingsFromContext) {
                result = context.getSetting(rule.attr);
                // console.log(`[evaluateRule Attribute] Used getSetting for ${rule.attr}:`, result);
              } else {
                // console.warn(`[evaluateRule Attribute] objectResult has getSetting but doesn't match context.settings`);
                result = undefined;
              }
            } else {
              // Attribute not found directly, and not a settings lookup context
              // console.warn(`[evaluateRule Attribute] Attribute '${rule.attr}' not found on object:`, objectResult);
              result = undefined; // Attribute doesn't exist
            }
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
        const args = (rule.args || []).map(
          (arg) => evaluateRule(arg, context, depth + 1) // Evaluate args recursively
        );

        // If any argument evaluation results in undefined, the function call result is undefined
        if (args.some((arg) => arg === undefined)) {
          result = undefined;
          break;
        }

        if (typeof func === 'function') {
          try {
            let thisContext = null;
            // Determine the context ('this') for the function call
            if (rule.function?.type === 'attribute' && rule.function.object) {
              // If the function was an attribute access (e.g., obj.method()),
              // 'this' should be the object it was accessed on.
              thisContext = evaluateRule(
                rule.function.object,
                context,
                depth + 1
              );
            } else {
              // Otherwise, default to the main context (snapshotInterface)
              thisContext = context;
            }

            // Handle cases where thisContext might still be null/undefined after evaluation
            if (thisContext === null || typeof thisContext === 'undefined') {
              console.warn(
                "[evaluateRule FunctionCall] Resolved 'this' context is null/undefined. Using main context.",
                rule.function
              );
              thisContext = context;
            }

            result = func.apply(thisContext, args);
            // Check if the function itself returned undefined
            if (result === undefined) {
              // console.warn(`[evaluateRule FunctionCall] Function ${rule.function?.attr || rule.function?.name || '?'} returned undefined.`);
            }
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
                contextType: isValidContext ? 'snapshotIF' : 'worker',
              }
            );
            result = undefined; // Error during execution means undefined outcome
          }
        } else {
          console.warn(
            `[evaluateRule] Resolved identifier is not a function:`,
            { identifier: rule.function, resolvedValue: func }
          );
          result = undefined; // Not a function, result undefined
        }
        break;
      }

      case 'subscript': {
        const value = evaluateRule(rule.value, context, depth + 1);
        const index = evaluateRule(rule.index, context, depth + 1);

        if (value === undefined || index === undefined) {
          result = undefined; // If array/object or index is unknown, result is unknown
        } else if (value && typeof value === 'object') {
          result = value[index]; // Access property/index
          // If value[index] itself is undefined (property doesn't exist), result remains undefined.
        } else {
          console.warn(
            '[evaluateRule] Subscript applied to non-object/non-map or null value.',
            { rule, value }
          );
          result = undefined;
        }
        break;
      }

      case 'compare': {
        const left = evaluateRule(rule.left, context, depth + 1);
        const right = evaluateRule(rule.right, context, depth + 1);
        const op = rule.op;

        // If either operand is undefined, the comparison result is undefined
        if (left === undefined || right === undefined) {
          result = undefined;
          break;
        }

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
            if (Array.isArray(right) || typeof right === 'string') {
              result = right.includes(left);
            } else if (right instanceof Set) {
              // Handle Set
              result = right.has(left);
            } else {
              console.warn(
                '[evaluateRule] "in" operator used with invalid right side type:',
                { left, right }
              );
              result = false; // Define behavior: false if right side isn't iterable
            }
            break;
          default:
            console.warn(
              `[evaluateRule] Unsupported comparison operator: ${op}`
            );
            result = undefined; // Operator unknown -> result unknown
        }
        break;
      }

      case 'item_check': {
        const itemName = evaluateRule(rule.item, context, depth + 1);
        if (itemName === undefined) {
          result = undefined;
        } else if (typeof context.hasItem === 'function') {
          result = context.hasItem(itemName); // hasItem should return true/false/undefined
        } else {
          console.warn(
            '[evaluateRule SnapshotIF] context.hasItem is not a function for item_check.'
          );
          result = undefined;
        }
        break;
      }

      case 'count_check': {
        const itemName = evaluateRule(rule.item, context, depth + 1);
        // Default count to 1 if not specified
        const requiredCount =
          rule.count !== undefined
            ? evaluateRule(rule.count, context, depth + 1)
            : 1;

        if (itemName === undefined || requiredCount === undefined) {
          result = undefined;
        } else if (typeof context.countItem === 'function') {
          const currentCount = context.countItem(itemName);
          // countItem itself might return undefined if it can't determine the count
          result =
            currentCount === undefined
              ? undefined
              : (currentCount || 0) >= requiredCount;
        } else {
          console.warn(
            '[evaluateRule SnapshotIF] context.countItem is not a function for count_check.'
          );
          result = undefined;
        }
        break;
      }

      case 'group_check': {
        const groupName = evaluateRule(rule.group, context, depth + 1);
        // Default count to 1 if not specified
        const requiredCount =
          rule.count !== undefined
            ? evaluateRule(rule.count, context, depth + 1)
            : 1;

        if (groupName === undefined || requiredCount === undefined) {
          result = undefined;
        } else if (typeof context.countGroup === 'function') {
          const currentCount = context.countGroup(groupName);
          // countGroup might return undefined
          result =
            currentCount === undefined
              ? undefined
              : (currentCount || 0) >= requiredCount;
        } else {
          console.warn(
            '[evaluateRule SnapshotIF] context.countGroup is not a function for group_check.'
          );
          result = undefined;
        }
        break;
      }

      case 'setting_check': {
        let settingName = evaluateRule(rule.setting, context, depth + 1);
        let expectedValue = evaluateRule(rule.value, context, depth + 1);

        if (settingName === undefined || expectedValue === undefined) {
          result = undefined;
        } else if (typeof settingName === 'string') {
          const actualValue = context.getSetting(settingName);
          // If getSetting returns undefined (setting doesn't exist/value is undefined), comparison result is undefined
          result =
            actualValue === undefined
              ? undefined
              : actualValue === expectedValue;
        } else {
          console.warn(
            '[evaluateRule] Invalid setting name for setting_check',
            { rule, settingName }
          );
          result = undefined;
        }
        break;
      }

      case 'name': {
        // Resolve name using the context's resolveName method if available
        if (context && typeof context.resolveName === 'function') {
          result = context.resolveName(rule.name);
        } else {
          console.warn(
            `[evaluateRule] Context cannot resolve name: ${rule.name}`
          );
          result = undefined;
        }
        break;
      }

      case 'conditional': {
        if (!rule.test || !rule.if_true || !rule.if_false) {
          console.warn(
            '[evaluateRule Conditional] Malformed conditional rule:',
            rule
          );
          result = undefined;
        } else {
          const testResult = evaluateRule(rule.test, context, depth + 1);
          if (testResult === undefined) {
            result = undefined; // If test is unknown, outcome is unknown
          } else if (testResult) {
            result = evaluateRule(rule.if_true, context, depth + 1);
          } else {
            result = evaluateRule(rule.if_false, context, depth + 1);
          }
        }
        break;
      }

      case 'binary_op': {
        const left = evaluateRule(rule.left, context, depth + 1);
        const right = evaluateRule(rule.right, context, depth + 1);
        const op = rule.op;

        if (left === undefined || right === undefined) {
          result = undefined;
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
            break;
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
          case 'AND':
          case 'and':
            result = left && right;
            break;
          case 'OR':
          case 'or':
            result = left || right;
            break;
          default:
            console.warn(`[evaluateRule] Unknown binary_op operator: ${op}`, {
              rule,
            });
            result = undefined;
        }
        break;
      }

      case 'list': {
        if (!Array.isArray(rule.value)) {
          console.warn(
            '[evaluateRule] List rule does not have an array value:',
            rule
          );
          result = undefined;
          break;
        }
        const evaluatedList = rule.value.map((itemRule) =>
          evaluateRule(itemRule, context, depth + 1)
        );
        // If any item evaluation is undefined, the list as a whole might be considered undefined for some operations
        // For now, return the list potentially containing undefined
        result = evaluatedList.some((item) => item === undefined)
          ? undefined
          : evaluatedList;
        break;
      }

      default: {
        console.warn(`[evaluateRule] Unknown rule type: ${ruleType}`, { rule });
        result = undefined;
        break;
      }
    }
  } catch (error) {
    console.error('[evaluateRule] Error during evaluation:', {
      ruleType,
      rule,
      error,
      contextType: typeof context,
      isSnapshot: isValidContext,
    });
    result = undefined;
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
