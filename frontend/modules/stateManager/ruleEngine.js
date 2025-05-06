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

  // --- Context Detection ---
  // --- ADDED LOGGING ---
  console.log(
    `[evaluateRule Debug] Depth: ${depth}, Context Type: ${typeof context}, Has executeHelper: ${typeof context?.executeHelper}`
  );
  if (context && typeof context.executeHelper !== 'function') {
    console.log(
      '[evaluateRule Debug] Context object keys:',
      Object.keys(context)
    );
  }
  // --- END LOGGING ---
  // Check if we have full state manager capabilities (worker context) vs. just snapshot access (main thread)
  const isWorkerContext =
    context && typeof context.executeHelper === 'function'; // Use executeHelper as a marker

  // Basic validation: Ensure SOME context object is provided
  if (!context) {
    console.error('[evaluateRule] Missing context object.', { rule });
    return false;
  }
  // If main thread, ensure basic snapshot methods exist
  if (!isWorkerContext && typeof context.hasItem !== 'function') {
    console.error(
      '[evaluateRule] Invalid main thread snapshot interface provided.',
      { rule }
    );
    return false;
  }

  // Create trace object for this evaluation
  // const trace = new RuleTrace(rule, depth); // TODO: Re-enable tracing if needed

  let result = false;
  const ruleType = rule?.type;

  try {
    // Add a try-catch around the main switch for robustness
    switch (ruleType) {
      case 'helper': {
        if (isWorkerContext) {
          const args = rule.args
            ? rule.args.map((arg) => evaluateRule(arg, context, depth + 1)) // Pass worker context down
            : [];
          // Use apply to handle potential array of args correctly
          result = context.executeHelper.apply(context, [rule.name, ...args]);
        } else {
          // Main thread snapshot interface cannot execute helpers
          console.warn(
            `[evaluateRule] Cannot execute helper '${rule.name}' on main thread via snapshot interface. Assuming false.`
          );
          result = false;
        }
        break;
      }

      case 'state_method': {
        if (isWorkerContext) {
          const args = rule.args
            ? rule.args.map((arg) => evaluateRule(arg, context, depth + 1)) // Pass worker context down
            : [];
          if (typeof context[rule.method] === 'function') {
            result = context[rule.method].apply(context, args);
          } else {
            console.error(
              `[evaluateRule] StateManager method '${rule.method}' not found in worker context.`
            );
            result = false;
          }
        } else {
          // Main thread snapshot interface cannot execute state methods
          console.warn(
            `[evaluateRule] Cannot execute state_method '${rule.method}' on main thread via snapshot interface. Assuming false.`
          );
          result = false;
        }
        break;
      }

      // --- Cases that should work similarly in both contexts (need careful implementation) ---

      case 'and': {
        result = true;
        for (const condition of rule.conditions || []) {
          // Pass the appropriate context down
          const conditionResult = evaluateRule(condition, context, depth + 1);
          if (!conditionResult) {
            result = false;
            break;
          }
          // trace.addChild(conditionTrace); // TODO: Tracing
        }
        break;
      }

      case 'or': {
        result = false;
        for (const condition of rule.conditions || []) {
          // Pass the appropriate context down
          const conditionResult = evaluateRule(condition, context, depth + 1);
          if (conditionResult) {
            result = true;
            break;
          }
          // trace.addChild(conditionTrace); // TODO: Tracing
        }
        break;
      }

      case 'not': {
        // Pass the appropriate context down
        result = !evaluateRule(rule.condition, context, depth + 1);
        break;
      }

      case 'value': {
        // Simple values are context-independent
        result = rule.value;
        break;
      }

      case 'attribute': {
        // Evaluate the object part first using the current context
        const obj = evaluateRule(rule.object, context, depth + 1);

        // Check if obj is valid before accessing attribute
        if (obj === null || typeof obj === 'undefined') {
          // The base object evaluated to null/undefined
          // console.warn(`[evaluateRule] Base object for attribute '${rule.attr}' evaluated to null/undefined.`, { rule });
          result = undefined; // Propagate undefined/failure
        } else {
          // Base object is valid, try accessing attribute
          if (typeof obj[rule.attr] !== 'undefined') {
            result = obj[rule.attr];
          } else if (obj instanceof Map && typeof obj.get === 'function') {
            result = obj.get(rule.attr);
          } else if (obj instanceof Set && typeof obj.has === 'function') {
            result = obj.has(rule.attr);
          } else {
            // Attribute doesn't exist on the object/map/set
            // console.debug(`[evaluateRule] Attribute '${rule.attr}' not found on object:`, obj, { rule });
            result = undefined; // Attribute not found
          }
        }
        break;
      }

      case 'function_call': {
        // Evaluate the function identifier first.
        // This might involve evaluating an attribute access (e.g., context.hasItem)
        const func = evaluateRule(rule.function, context, depth + 1);

        // Check if function evaluation failed (e.g., base object was undefined)
        if (typeof func === 'undefined') {
          // If evaluating the function identifier itself failed (e.g., due to undefined base object like 'old_man'),
          // then the call cannot proceed.
          // console.warn(`[evaluateRule] Function identifier evaluated to undefined, cannot call.`, { rule });
          result = undefined; // Propagate failure
          break; // Exit the function_call case
        }

        // Evaluate arguments (use the current context)
        const args = (rule.args || []).map((arg) =>
          evaluateRule(arg.value, context, depth + 1)
        );

        // Check if the resolved identifier is actually a function
        if (typeof func === 'function') {
          try {
            // Determine the correct 'this' context for the call.
            let thisContext = null;
            // If the function was accessed via an attribute (e.g., context.hasItem),
            // the 'this' should be the object the attribute belonged to.
            if (rule.function?.type === 'attribute' && rule.function.object) {
              thisContext = evaluateRule(
                rule.function.object,
                context,
                depth + 1
              );
            }
            // If it wasn't an attribute access, or the base object eval is complex,
            // fall back to using the main context object (might be correct for helpers bound to state)
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
                contextType: isWorkerContext ? 'worker' : 'main_snapshot',
              }
            );
            result = false;
          }
        } else {
          // This case should ideally be less frequent now due to the check above
          console.warn(
            `[evaluateRule] Resolved identifier is not a function:`,
            {
              identifier: rule.function,
              resolvedValue: func,
            }
          );
          result = false; // Identifier didn't resolve to a function
        }
        break;
      }

      // --- Cases only relevant for main thread snapshot (or need specific worker handling) ---

      case 'subscript': {
        // e.g., inventory['item']
        if (isWorkerContext) {
          // Worker context: Evaluate value and index, then perform lookup on the resulting object/map
          const value = evaluateRule(rule.value, context, depth + 1);
          const index = evaluateRule(rule.index, context, depth + 1);
          if (value instanceof Map) {
            result = value.get(index);
          } else if (value && typeof value === 'object') {
            result = value[index];
          } else {
            console.warn(
              '[evaluateRule] Subscript applied to non-object/non-map in worker context.',
              { rule }
            );
            result = undefined;
          }
        } else {
          // Main thread snapshot: Typically inventory['item'] translates to hasItem('item')
          // This specific AST node might not appear often if rules are well-formed for snapshot.
          // Let's try evaluating the base and index and see if direct access works on the snapshot interface
          const baseValue = evaluateRule(rule.value, context, depth + 1);
          const indexValue = evaluateRule(rule.index, context, depth + 1);
          try {
            result = baseValue[indexValue];
          } catch (e) {
            console.warn(
              `[evaluateRule] Error evaluating rule type 'subscript' on main thread via snapshot interface. Assuming false.`,
              { rule, error: e }
            );
            result = false;
          }
        }
        break;
      }

      case 'compare': {
        // e.g., inventory['item'] >= 1
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
            break; // Use loose equality based on Python behavior?
          case '!=':
            result = left != right;
            break; // Use loose inequality?
          // Add 'in', 'not in' if needed and if AST supports them directly
          default:
            console.warn(
              `[evaluateRule] Unsupported comparison operator: ${op}`
            );
            result = false;
        }
        break;
      }

      case 'item_check': {
        let itemName = evaluateRule(rule.item, context, depth + 1);
        if (typeof itemName === 'string' && context.hasItem) {
          result = context.hasItem(itemName);
        } else {
          console.warn(
            '[evaluateRule] Invalid item name or context for item_check',
            { rule, itemName }
          );
          result = false;
        }
        break;
      }

      case 'count_check': {
        let itemName = evaluateRule(rule.item, context, depth + 1);
        let requiredCount = evaluateRule(rule.count, context, depth + 1);
        if (
          typeof itemName === 'string' &&
          typeof requiredCount === 'number' &&
          context.countItem
        ) {
          result = context.countItem(itemName) >= requiredCount;
        } else {
          console.warn(
            '[evaluateRule] Invalid item name, count, or context for count_check',
            { rule, itemName, requiredCount }
          );
          result = false;
        }
        break;
      }

      case 'group_check': {
        let groupName = evaluateRule(rule.group, context, depth + 1);
        let requiredCount = evaluateRule(rule.count, context, depth + 1);
        if (
          typeof groupName === 'string' &&
          typeof requiredCount === 'number' &&
          context.countGroup
        ) {
          result = context.countGroup(groupName) >= requiredCount;
        } else {
          console.warn(
            '[evaluateRule] Invalid group name, count, or context for group_check',
            { rule, groupName, requiredCount }
          );
          result = false;
        }
        break;
      }

      case 'setting_check': {
        let settingName = evaluateRule(rule.setting, context, depth + 1);
        let expectedValue = evaluateRule(rule.value, context, depth + 1);
        if (typeof settingName === 'string' && context.getSetting) {
          result = context.getSetting(settingName) === expectedValue;
        } else {
          console.warn(
            '[evaluateRule] Invalid setting name or context for setting_check',
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
        if (isWorkerContext && rule.name === 'player') {
          result = context.getPlayerSlot ? context.getPlayerSlot() : undefined;
        } else {
          console.warn(
            `[evaluateRule] Unhandled 'name' type reference: ${rule.name}. Returning undefined.`
          );
          result = undefined;
        }
        break;
      }

      default:
        console.warn(`[evaluateRule] Unknown rule type: ${ruleType}`, { rule });
        result = false; // Unknown type defaults to false
    }
  } catch (evaluationError) {
    console.error(
      '[evaluateRule] Uncaught error during rule evaluation:',
      evaluationError,
      { rule, contextType: isWorkerContext ? 'worker' : 'main_snapshot' }
    );
    result = false; // Return false on error
  }

  // trace.complete(result); // TODO: Tracing
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
