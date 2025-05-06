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

  // --- ADDED: Log the received context object --- >
  if (depth === 0) {
    // Log only for top-level calls to reduce noise initially
    console.log('[evaluateRule Top-Level Context Check]', {
      contextReceived: typeof context,
      hasIsSnapshotInterface: context ? context._isSnapshotInterface : 'N/A',
      hasInventory: context ? !!context.inventory : 'N/A',
      hasHelpers: context ? !!context.helpers : 'N/A',
      hasInventoryItemData: context?.inventory
        ? !!context.inventory.itemData
        : 'N/A',
    });
  }
  // --- END ADDED --- >

  const isSnapshotInterfaceContext =
    context && context._isSnapshotInterface === true;
  // const isWorkerContext = !isSnapshotInterfaceContext && context && typeof context.executeHelper === 'function';
  // Let's simplify: if it's not a snapshot interface, assume it's a worker-like context (has .helpers, .inventory directly)
  const isWorkerContext = !isSnapshotInterfaceContext;

  if (!context) {
    console.error('[evaluateRule] Missing context object.', { rule });
    return false;
  }
  if (
    isWorkerContext &&
    (!context.inventory || !context.helpers || !context.inventory.itemData)
  ) {
    console.error(
      '[evaluateRule] Invalid worker context provided (missing inventory, helpers, or inventory.itemData).',
      { rule }
    );
    return false;
  }
  if (isSnapshotInterfaceContext && typeof context.hasItem !== 'function') {
    // This check is for the integrity of the snapshot interface itself
    console.error(
      '[evaluateRule] Invalid snapshot interface provided (missing hasItem).',
      { rule }
    );
    return false;
  }

  let result = false;
  const ruleType = rule?.type;

  try {
    switch (ruleType) {
      case 'helper': {
        const args = rule.args
          ? rule.args.map((arg) => evaluateRule(arg, context, depth + 1))
          : [];
        if (isSnapshotInterfaceContext) {
          // Snapshot interface MIGHT have a simple executeHelper for some display-only cases
          // or it might need to indicate it cannot run complex helpers.
          if (typeof context.executeHelper === 'function') {
            try {
              result = context.executeHelper(rule.name, ...args);
            } catch (e) {
              console.warn(
                `[evaluateRule SnapshotIF] Error executing helper '${rule.name}': ${e.message}`
              );
              result = false; // Default to false on error
            }
          } else {
            console.warn(
              `[evaluateRule SnapshotIF] Helper '${rule.name}' cannot be executed by snapshot interface (no executeHelper). Assuming false.`
            );
            result = false;
          }
        } else {
          // Worker Context
          result = context.helpers.executeHelper.apply(context.helpers, [
            rule.name,
            ...args,
          ]);
        }
        break;
      }

      case 'state_method': {
        const args = rule.args
          ? rule.args.map((arg) => evaluateRule(arg, context, depth + 1))
          : [];
        if (isSnapshotInterfaceContext) {
          if (typeof context.executeStateManagerMethod === 'function') {
            try {
              result = context.executeStateManagerMethod(rule.method, ...args);
            } catch (e) {
              console.warn(
                `[evaluateRule SnapshotIF] Error executing state_method '${rule.method}': ${e.message}`
              );
              result = false;
            }
          } else {
            console.warn(
              `[evaluateRule SnapshotIF] StateMethod '${rule.method}' cannot be executed (no executeStateManagerMethod). Assuming false.`
            );
            result = false;
          }
        } else {
          // Worker Context
          if (typeof context[rule.method] === 'function') {
            result = context[rule.method].apply(context, args);
          } else {
            console.error(
              `[evaluateRule Worker] StateManager method '${rule.method}' not found.`
            );
            result = false;
          }
        }
        break;
      }
      case 'and': {
        result = true;
        for (const condition of rule.conditions || []) {
          const conditionResult = evaluateRule(condition, context, depth + 1);
          if (!conditionResult) {
            result = false;
            break;
          }
        }
        break;
      }

      case 'or': {
        result = false;
        for (const condition of rule.conditions || []) {
          const conditionResult = evaluateRule(condition, context, depth + 1);
          if (conditionResult) {
            result = true;
            break;
          }
        }
        break;
      }

      case 'not': {
        result = !evaluateRule(rule.condition, context, depth + 1);
        break;
      }

      case 'value': {
        result = rule.value;
        break;
      }

      case 'attribute': {
        const obj = evaluateRule(rule.object, context, depth + 1);
        if (obj === null || typeof obj === 'undefined') {
          result = undefined;
        } else {
          if (typeof obj[rule.attr] !== 'undefined') {
            result = obj[rule.attr];
          } else if (obj instanceof Map && typeof obj.get === 'function') {
            result = obj.get(rule.attr);
          } else if (obj instanceof Set && typeof obj.has === 'function') {
            result = obj.has(rule.attr);
          } else {
            console.warn(
              `[evaluateRule Attribute] Attribute '${rule.attr}' not found on object`,
              {
                objectType: typeof obj,
                objectKeys: typeof obj === 'object' ? Object.keys(obj) : null,
              }
            );
            result = undefined;
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
        if (typeof itemName === 'string') {
          if (isWorkerContext) {
            result = context.inventory.has(itemName);
          } else {
            result = context.hasItem(itemName);
          }
        } else {
          console.warn('[evaluateRule] Invalid item name for item_check', {
            rule,
            itemName,
          });
          result = false;
        }
        break;
      }

      case 'count_check': {
        let itemName = evaluateRule(rule.item, context, depth + 1);
        let requiredCount = evaluateRule(rule.count, context, depth + 1);
        if (typeof itemName === 'string' && typeof requiredCount === 'number') {
          if (isWorkerContext) {
            result = context.inventory.count(itemName) >= requiredCount;
          } else {
            // SnapshotInterface path
            // --- ADDED: Log type of getItemCount --- >
            console.log(
              '[evaluateRule count_check SnapshotIF] typeof context.getItemCount:',
              typeof context.getItemCount,
              context.getItemCount === undefined
            );
            result = context.getItemCount(itemName) >= requiredCount;
          }
        } else {
          console.warn(
            '[evaluateRule] Invalid item name or count for count_check',
            { rule, itemName, requiredCount }
          );
          result = false;
        }
        break;
      }

      case 'group_check': {
        let groupName = evaluateRule(rule.group, context, depth + 1);
        let requiredCountRaw = rule.count
          ? evaluateRule(rule.count, context, depth + 1)
          : 1;
        let requiredCount =
          typeof requiredCountRaw === 'number' ? requiredCountRaw : 1;

        if (typeof groupName === 'string') {
          if (isWorkerContext) {
            result = context.inventory.countGroup(groupName) >= requiredCount;
          } else {
            result = context.countGroup(groupName) >= requiredCount;
          }
        } else {
          console.warn('[evaluateRule] Invalid group name for group_check', {
            rule,
            groupName,
            requiredCount,
          });
          result = false;
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
        const nameToResolve = rule.name;
        if (nameToResolve === 'state') {
          result = context; // 'state' refers to the current evaluation context
        } else if (
          isWorkerContext &&
          context.helpers?.entities?.[nameToResolve]
        ) {
          // Worker context: resolve via helpers.entities
          result = context.helpers.entities[nameToResolve];
        } else if (
          isSnapshotInterfaceContext &&
          context.helpers?.entities?.[nameToResolve]
          // Check if snapshot interface also has entities on a helpers prop
        ) {
          result = context.helpers.entities[nameToResolve];
        } else if (
          isSnapshotInterfaceContext &&
          nameToResolve === 'player' &&
          typeof context.getPlayerSlot === 'function'
        ) {
          result = context.getPlayerSlot();
        } else if (
          isSnapshotInterfaceContext &&
          typeof context.getSetting === 'function' &&
          context.getSetting(nameToResolve) !== undefined
        ) {
          // Snapshot interface: resolve via getSetting()
          result = context.getSetting(nameToResolve);
        } else if (
          isWorkerContext &&
          context.settings &&
          Object.prototype.hasOwnProperty.call(context.settings, nameToResolve)
        ) {
          // Worker context: resolve via direct settings object
          result = context.settings[nameToResolve];
        } else {
          // Fallback for boolean/none literals or unhandled names
          if (nameToResolve === 'True') result = true;
          else if (nameToResolve === 'False') result = false;
          else if (nameToResolve === 'None') result = null; // Or undefined
          else {
            console.warn(
              `[evaluateRule ${
                isSnapshotInterfaceContext ? 'SnapshotIF' : 'Worker'
              }] Unhandled 'name': ${nameToResolve}. Returning undefined.`
            );
            result = undefined;
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

      default:
        console.warn(`[evaluateRule] Unknown rule type: ${ruleType}`, { rule });
        result = false;
    }
  } catch (evaluationError) {
    console.error(
      '[evaluateRule] Uncaught error during rule evaluation:',
      evaluationError,
      {
        rule,
        contextType: isSnapshotInterfaceContext ? 'snapshotIF' : 'worker',
      }
    );
    result = false;
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
