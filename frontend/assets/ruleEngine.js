import stateManager from './stateManagerSingleton.js';

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

export const evaluateRule = (rule, depth = 0) => {
  if (!rule) {
    return true;
  }
  if (!stateManager.inventory) {
    return false; // Add early return if inventory is undefined
  }

  // Create trace object for this evaluation
  const trace = new RuleTrace(rule, depth);

  let result = false;
  switch (rule.type) {
    case 'helper': {
      if (
        stateManager.helpers &&
        typeof stateManager.helpers.executeHelper === 'function'
      ) {
        // Process arguments - they may now be complex objects instead of simple values
        const processedArgs = (rule.args || []).map((arg) => {
          // If the arg is a complex object with its own type, evaluate it first
          if (arg && typeof arg === 'object' && arg.type) {
            return evaluateRule(arg, depth + 1);
          }
          // Otherwise return it as-is
          return arg;
        });

        // Call the helper with processed arguments
        result = stateManager.helpers.executeHelper(
          rule.name,
          ...processedArgs
        );
      } else {
        safeLog(`No helper implementation available for: ${rule.name}`, {
          availableHelpers: stateManager.helpers
            ? Object.keys(stateManager.helpers)
            : [],
        });
        result = false;
      }
      break;
    }

    case 'and': {
      // For AND rules, short-circuit on first failure
      result = true;
      for (const condition of rule.conditions) {
        const conditionResult = evaluateRule(condition, depth + 1);
        trace.addChild(
          new RuleTrace(condition, depth + 1).complete(conditionResult)
        );
        if (!conditionResult) {
          result = false;
          break; // Short-circuit on first false condition
        }
      }
      break;
    }

    case 'or': {
      // For OR rules, short-circuit on first success
      result = false;
      for (const condition of rule.conditions) {
        const conditionResult = evaluateRule(condition, depth + 1);
        trace.addChild(
          new RuleTrace(condition, depth + 1).complete(conditionResult)
        );
        if (conditionResult) {
          result = true;
          break; // Short-circuit on first true condition
        }
      }
      break;
    }

    case 'item_check': {
      // Handle item_check with the new structure
      // Now 'item' might be a complex object instead of a direct string
      let itemName;
      if (typeof rule.item === 'string') {
        // Legacy format: direct string
        itemName = rule.item;
      } else if (rule.item && rule.item.type === 'constant') {
        // New format: {type: 'constant', value: 'ItemName'}
        itemName = rule.item.value;
      } else if (rule.item) {
        // Other complex expression - evaluate it
        itemName = evaluateRule(rule.item, depth + 1);
      }

      // Check if we got a valid string for the item name
      if (typeof itemName === 'string') {
        result = stateManager.inventory.has?.(itemName) ?? false;
      } else {
        result = false;
      }
      break;
    }

    case 'count_check': {
      // Handle count_check with the new structure
      // Both item and count might be complex objects
      let itemName, countValue;

      // Process item
      if (typeof rule.item === 'string') {
        itemName = rule.item;
      } else if (rule.item && rule.item.type === 'constant') {
        itemName = rule.item.value;
      } else if (rule.item) {
        itemName = evaluateRule(rule.item, depth + 1);
      }

      // Process count
      if (typeof rule.count === 'number') {
        countValue = rule.count;
      } else if (rule.count && rule.count.type === 'constant') {
        countValue = rule.count.value;
      } else if (rule.count) {
        countValue = evaluateRule(rule.count, depth + 1);
      } else {
        countValue = 1; // Default count
      }

      // Make the comparison
      result = (stateManager.inventory.count?.(itemName) ?? 0) >= countValue;
      break;
    }

    case 'group_check': {
      // Handle group_check with the new structure
      let groupName;
      if (typeof rule.group === 'string') {
        groupName = rule.group;
      } else if (rule.group && rule.group.type === 'constant') {
        groupName = rule.group.value;
      } else if (rule.group) {
        groupName = evaluateRule(rule.group, depth + 1);
      }

      result =
        groupName &&
        stateManager.inventory.countGroup(groupName) >= (rule.count || 1);
      break;
    }

    case 'constant': {
      result = rule.value;
      break;
    }

    case 'count': {
      let itemName;
      if (typeof rule.item === 'string') {
        itemName = rule.item;
      } else if (rule.item && rule.item.type === 'constant') {
        itemName = rule.item.value;
      } else if (rule.item) {
        itemName = evaluateRule(rule.item, depth + 1);
      }

      result = stateManager.inventory.count(itemName);
      break;
    }

    case 'state_flag': {
      let flagName;
      if (typeof rule.flag === 'string') {
        flagName = rule.flag;
      } else if (rule.flag && rule.flag.type === 'constant') {
        flagName = rule.flag.value;
      } else if (rule.flag) {
        flagName = evaluateRule(rule.flag, depth + 1);
      }

      result = flagName && stateManager.state?.hasFlag(flagName);
      break;
    }

    // NEW NODE TYPES

    case 'attribute': {
      // Handle attribute access (e.g., foo.bar)
      // First evaluate the object
      let baseObject = evaluateRule(rule.object, depth + 1);

      // Check if we have a valid base object
      if (baseObject == null) {
        result = false;
        break;
      }

      // Handle special cases for common Python builtins
      if (rule.object.type === 'name' && rule.object.name === 'builtins') {
        // Handle Python builtins
        if (rule.attr === 'len') {
          return stateManager.helpers.len;
        } else if (rule.attr === 'zip') {
          return stateManager.helpers.zip;
        } else if (rule.attr === 'range') {
          return stateManager.helpers.range;
        } else if (rule.attr === 'all') {
          return stateManager.helpers.all;
        } else if (rule.attr === 'any') {
          return stateManager.helpers.any;
        } else if (rule.attr === 'bool') {
          return stateManager.helpers.to_bool;
        }
      }

      // Look up the attribute - specifically handle Python-like attribute access
      if (typeof baseObject === 'object' && baseObject !== null) {
        // Standard attribute lookup
        result = baseObject[rule.attr];

        // Special handling for getattr
        if (
          result === undefined &&
          stateManager.helpers &&
          typeof stateManager.helpers.getattr === 'function'
        ) {
          result = stateManager.helpers.getattr(baseObject, rule.attr);
        }

        // If the result is a function, don't call it yet - function_call will do that
        if (typeof result === 'function') {
          // Return the function reference
          return result;
        }
      } else {
        // Invalid base object, return false
        result = false;
      }
      break;
    }

    case 'subscript': {
      // Handle subscript access (e.g., foo[bar])
      // First evaluate the value and index
      const containerValue = evaluateRule(rule.value, depth + 1);
      const indexValue = evaluateRule(rule.index, depth + 1);

      // If we have a valid container, access the index
      if (containerValue !== undefined && containerValue !== null) {
        result = containerValue[indexValue];
      } else {
        result = false;
      }
      break;
    }

    case 'function_call': {
      // Handle function calls from the Python AST by mapping them to appropriate helpers

      // Extract function path and name
      let functionPath = '';
      let functionName = '';

      // Process the function identifier
      if (rule.function.type === 'attribute') {
        // Build the function path (e.g., "state.multiworld.get_region")
        functionName = rule.function.attr;

        // Traverse the attribute chain to build the full path
        let currentObj = rule.function.object;
        let pathComponents = [];

        while (currentObj) {
          if (currentObj.type === 'attribute') {
            pathComponents.unshift(currentObj.attr);
            currentObj = currentObj.object;
          } else if (currentObj.type === 'name') {
            pathComponents.unshift(currentObj.name);
            currentObj = null;
          } else {
            // Stop traversal for other node types
            break;
          }
        }

        functionPath = pathComponents.join('.');
        if (functionName) {
          functionPath += '.' + functionName;
        }
      } else if (rule.function.type === 'name') {
        // Direct function name
        functionName = rule.function.name;
        functionPath = functionName;
      } else {
        // Unknown function type
        console.warn('Unhandled function type:', rule.function.type, rule);
        result = false;
        break;
      }

      // Process arguments
      const processedArgs = (rule.args || []).map((arg) =>
        evaluateRule(arg, depth + 1)
      );

      // Map function path to our helpers system
      if (functionPath.startsWith('state.multiworld.')) {
        // Handle state.multiworld.X methods
        const method = functionPath.split('.').pop();

        if (method === 'get_region') {
          // Map to can_reach with Region type
          const regionName = processedArgs[0];
          result = stateManager.can_reach(regionName, 'Region', 1);
        } else if (method === 'get_location') {
          // Map to can_reach with Location type
          const locationName = processedArgs[0];
          result = stateManager.can_reach(locationName, 'Location', 1);
        } else if (method === 'get_entrance') {
          // Map to can_reach with Entrance type
          const entranceName = processedArgs[0];
          result = stateManager.can_reach(entranceName, 'Entrance', 1);
        } else {
          // For unknown multiworld methods, log and default to false
          console.warn('Unknown multiworld method:', method, processedArgs);
          result = false;
        }
      } else if (
        functionPath.includes('.can_defeat') ||
        functionPath.includes('.defeat_rule')
      ) {
        // Boss defeat checks - these typically evaluate to true in our frontend system
        // since we don't have complex boss fight mechanics
        result = true;
      } else if (functionPath.includes('.can_reach')) {
        // Handle region can_reach calls
        // Typically format: region.can_reach(state)
        const regionName = functionPath.split('.')[0];
        result = stateManager.can_reach(regionName, 'Region', 1);
      } else if (
        stateManager.helpers &&
        typeof stateManager.helpers.executeHelper === 'function'
      ) {
        // Try to map to a helper function
        try {
          result = stateManager.helpers.executeHelper(
            functionName,
            ...processedArgs
          );
        } catch (error) {
          console.warn(
            'Error executing helper for function:',
            functionPath,
            error
          );
          result = false;
        }
      } else {
        // Log unhandled function calls
        console.warn('Unhandled function call:', functionPath, processedArgs);
        result = false;
      }

      break;
    }

    case 'name': {
      // Handle name references (variables)
      const varName = rule.name;

      // Special case handling
      if (varName === 'state') {
        return stateManager.state;
      } else if (varName === 'player') {
        return 1; // Default player ID
      } else if (varName === 'self') {
        // This might need special handling depending on context
        return stateManager;
      }

      // For other variable names, try to find them in the state
      if (stateManager.state && stateManager.state[varName] !== undefined) {
        result = stateManager.state[varName];
      } else {
        // If no match, check inventory by name as a last resort
        result = stateManager.inventory.has?.(varName) ?? false;
      }
      break;
    }

    case 'comparison': {
      const leftValue =
        typeof rule.left === 'object' && rule.left.type
          ? evaluateRule(rule.left, depth + 1)
          : rule.left;
      const rightValue =
        typeof rule.right === 'object' && rule.right.type
          ? evaluateRule(rule.right, depth + 1)
          : rule.right;

      switch (rule.op) {
        case 'GtE':
          result = leftValue >= rightValue;
          break;
        case 'Gt':
          result = leftValue > rightValue;
          break;
        case 'LtE':
          result = leftValue <= rightValue;
          break;
        case 'Lt':
          result = leftValue < rightValue;
          break;
        case 'Eq':
          result = leftValue === rightValue;
          break;
        default:
          result = false;
      }
      break;
    }

    case 'state_method': {
      const startTime = performance.now();

      // Process arguments - now they might be complex objects
      const processedArgs = (rule.args || []).map((arg) => {
        if (arg && typeof arg === 'object' && arg.type) {
          return evaluateRule(arg, depth + 1);
        }
        return arg;
      });

      // Try using stateManager's executeStateMethod
      if (
        stateManager &&
        typeof stateManager.executeStateMethod === 'function'
      ) {
        result = stateManager.executeStateMethod(rule.method, ...processedArgs);
      }
      // Fall back to helpers if stateManager doesn't have the method
      else if (
        stateManager.helpers &&
        typeof stateManager.helpers.executeStateMethod === 'function'
      ) {
        result = stateManager.helpers.executeStateMethod(
          rule.method,
          ...processedArgs
        );
      } else {
        safeLog(
          `No state method implementation available for: ${rule.method}`,
          {
            availableHelpers: stateManager.helpers
              ? Object.keys(stateManager.helpers)
              : [],
          }
        );
        result = false;
      }

      const duration = performance.now() - startTime;
      if (duration > 5) {
        // Only log slow method calls
        safeLog(
          `State method ${rule.method} took ${duration.toFixed(2)}ms`,
          {
            args: processedArgs || [],
            result,
          },
          'warn'
        );
      }

      break;
    }

    default: {
      safeLog(`Unknown rule type: ${rule.type}`);
      result = false;
    }
  }

  // Complete the trace but don't try to add it to inventory debug
  trace.complete(result);

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
      console.group('Object:');
      debugPythonAST(rule.object);
      console.groupEnd();
      break;

    case 'name':
      console.log(`Name: ${rule.name}`);
      break;

    case 'constant':
      console.log(`Value: ${rule.value}`);
      break;

    case 'subscript':
      console.group('Container:');
      debugPythonAST(rule.value);
      console.groupEnd();

      console.group('Index:');
      debugPythonAST(rule.index);
      console.groupEnd();
      break;

    case 'comparison':
      console.log(`Operator: ${rule.op}`);

      console.group('Left:');
      debugPythonAST(rule.left);
      console.groupEnd();

      console.group('Right:');
      debugPythonAST(rule.right);
      console.groupEnd();
      break;

    default:
      console.log(rule);
  }

  console.groupEnd();
}
