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

/**
 * Recursively checks if a rule object contains defeat methods in its chain
 * @param {Object} ruleObj - The rule object to check
 * @returns {boolean} - True if a defeat method was found in the chain
 */
function hasDefeatMethod(ruleObj) {
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
    return hasDefeatMethod(ruleObj.object);
  }

  // Check function property for function calls
  if (ruleObj.function) {
    return hasDefeatMethod(ruleObj.function);
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
 * @returns {boolean} - True if this is a boss defeat check
 */
function isBossDefeatCheck(rule) {
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

export const evaluateRule = (rule, depth = 0) => {
  if (!rule) {
    return true;
  }
  if (!stateManager.inventory) {
    return false; // Add early return if inventory is undefined
  }

  // Debug check for specific boss defeat patterns
  if (
    rule &&
    rule.type === 'function_call' &&
    rule.function &&
    rule.function.type === 'attribute' &&
    rule.function.attr === 'can_defeat'
  ) {
    //console.log('FOUND DIRECT can_defeat CALL', {
    //  rule: rule,
    //  depth: depth,
    //});
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
        //console.log(`Calling helper: ${rule.name} with args:`, processedArgs);
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
      // Check if this is a boss defeat attribute check
      if (rule.attr === 'can_defeat' || rule.attr === 'defeat_rule') {
        if (stateManager.debugMode) {
          console.log('Detected boss defeat check via attribute');
        }
        result = true;
        break;
      }

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
      // First check if this is a boss defeat check using our enhanced detection
      if (isBossDefeatCheck(rule)) {
        if (stateManager.debugMode) {
          console.log('Detected boss defeat check via enhanced detection');
        }
        result = true;
        break;
      }

      // Existing detailed debugging for depth 5 patterns (likely boss defeat checks)
      if (
        depth === 5 &&
        rule &&
        rule.type === 'function_call' &&
        rule.function &&
        rule.function.type === 'attribute'
      ) {
        console.log('EXAMINING POTENTIAL BOSS DEFEAT CHECK', {
          rule: rule,
          functionAttr: rule.function.attr,
          depth: depth,
          isBossCheck: isBossDefeatCheck(rule),
        });
      }

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

        // Special case for region.can_reach pattern
        if (
          functionName === 'can_reach' &&
          currentObj.type === 'function_call'
        ) {
          // This might be state.multiworld.get_region("RegionName").can_reach()
          if (
            currentObj.function.type === 'attribute' &&
            currentObj.function.attr === 'get_region' &&
            currentObj.args &&
            currentObj.args.length > 0
          ) {
            // Extract region name from the get_region call
            let regionName = null;
            if (currentObj.args[0].type === 'constant') {
              regionName = currentObj.args[0].value;
            } else {
              // If the region name is a complex expression, evaluate it
              regionName = evaluateRule(currentObj.args[0], depth + 1);
            }

            if (regionName) {
              // Directly return the region accessibility check
              return stateManager.can_reach(regionName, 'Region', 1);
            }
          }
        }

        while (currentObj) {
          if (currentObj.type === 'attribute') {
            pathComponents.unshift(currentObj.attr);
            currentObj = currentObj.object;
          } else if (currentObj.type === 'name') {
            pathComponents.unshift(currentObj.name);
            currentObj = null;
          } else if (currentObj.type === 'function_call') {
            // Handle function calls in the chain - just extract the function name
            if (currentObj.function.type === 'attribute') {
              pathComponents.unshift(currentObj.function.attr);
              currentObj = currentObj.function.object;
            } else {
              // Unknown function structure, break the loop
              break;
            }
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
        } else if (method === 'can_reach') {
          // Handle direct state.multiworld.can_reach(spot, type, player) calls
          const spotName = processedArgs[0];
          const typeHint = processedArgs[1] || 'Region'; // Default hint
          const player = processedArgs[2] || 1; // Default player
          // Use the helpers.can_reach method which correctly uses stateManager
          if (
            stateManager.helpers &&
            typeof stateManager.helpers.executeHelper === 'function'
          ) {
            result = stateManager.helpers.executeHelper(
              'can_reach',
              spotName,
              typeHint,
              player
            );
          } else {
            console.error(
              'Cannot execute can_reach: helpers or executeHelper not found.'
            );
            result = false;
          }
        } else {
          // For unknown multiworld methods, log and default to false
          console.warn('Unknown multiworld method:', method, processedArgs);
          result = false;
        }
      } else if (functionPath === 'world.get_location') {
        // Handle world.get_location("Location Name") -> return "Location Name"
        // This allows it to be passed as an argument to other helpers
        if (processedArgs.length > 0) {
          result = processedArgs[0]; // Return the evaluated location name
        } else {
          console.warn('world.get_location called with no arguments');
          result = undefined;
        }
      } else if (
        functionPath.includes('.can_defeat') ||
        functionPath.includes('.defeat_rule') ||
        // Note: The explicit isBossDefeatCheck is handled at the start of this case
        // but we keep these simpler checks for backward compatibility
        (rule.function &&
          rule.function.type === 'attribute' &&
          rule.function.attr === 'can_defeat') ||
        hasDefeatMethod(rule.function)
      ) {
        // Boss defeat checks - these typically evaluate to true in our frontend system
        // since we don't have complex boss fight mechanics

        if (stateManager.debugMode) {
          console.log('Boss defeat check detected via function path:', {
            functionPath,
            rule: rule,
          });
        }

        // Always return true for boss defeat checks
        result = true;
      } else if (functionPath.includes('.can_reach')) {
        // Handle region can_reach calls

        // Check for deeper structure where the path might include get_region
        if (functionPath.includes('get_region')) {
          // The path contains get_region, try to extract region name from processed args
          // This might be set already if we found a direct get_region call
          let regionName = null;

          // Look for the region name in the path parts and args
          const pathParts = functionPath.split('.');
          const getRegionIndex = pathParts.indexOf('get_region');

          if (getRegionIndex !== -1 && processedArgs.length > 0) {
            // If get_region is in the path and we have args, the first arg is likely the region name
            regionName = processedArgs[0];
          }

          if (regionName) {
            result = stateManager.can_reach(regionName, 'Region', 1);
          } else {
            console.warn('Could not determine region name for', functionPath);
            result = false;
          }
        } else {
          // Traditional format: region.can_reach(state)
          const pathParts = functionPath.split('.');
          // Get the first part which should be the region name
          const regionName = pathParts[0];
          result = stateManager.can_reach(regionName, 'Region', 1);
        }
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
      // Handle name resolution (e.g., 'player')
      if (rule.name === 'player') {
        // Assuming player ID is stored in stateManager.playerSlot
        result = stateManager.playerSlot;
        // console.log(`[evaluateRule] Name 'player' resolved to: ${result} (Type: ${typeof result})`); // DEBUG LOG
      } else {
        // Handle other named variables if needed
        safeLog(`Unsupported name variable: ${rule.name}`);
        result = undefined; // Or null, or throw error
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

      //console.log(
      //  `Calling state_method: ${rule.method} with args:`,
      //  processedArgs
      //);

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

    case 'compare': {
      const leftValue = evaluateRule(rule.left, depth + 1);
      let rightValue = rule.right;

      // If the right side is complex, evaluate it
      if (rightValue && typeof rightValue === 'object' && rightValue.type) {
        if (rightValue.type === 'list') {
          // Evaluate each element in the list
          rightValue = rightValue.value.map((item) =>
            evaluateRule(item, depth + 1)
          );
        } else {
          // Evaluate other complex types
          rightValue = evaluateRule(rightValue, depth + 1);
        }
      }

      // Perform comparison
      switch (rule.op) {
        case '==':
          // Basic deep comparison for arrays/objects
          if (Array.isArray(leftValue) && Array.isArray(rightValue)) {
            result =
              leftValue.length === rightValue.length &&
              leftValue.every((val, index) => val === rightValue[index]);
          } else if (
            typeof leftValue === 'object' &&
            leftValue !== null &&
            typeof rightValue === 'object' &&
            rightValue !== null
          ) {
            // Simple object comparison (can be enhanced)
            result = JSON.stringify(leftValue) === JSON.stringify(rightValue);
          } else {
            result = leftValue === rightValue;
          }
          break;
        case '!=':
          if (Array.isArray(leftValue) && Array.isArray(rightValue)) {
            result =
              leftValue.length !== rightValue.length ||
              leftValue.some((val, index) => val !== rightValue[index]);
          } else if (
            typeof leftValue === 'object' &&
            leftValue !== null &&
            typeof rightValue === 'object' &&
            rightValue !== null
          ) {
            result = JSON.stringify(leftValue) !== JSON.stringify(rightValue);
          } else {
            result = leftValue !== rightValue;
          }
          break;
        // Add other operators (>, <, >=, <=) as needed
        default:
          safeLog(`Unsupported comparison operator: ${rule.op}`);
          result = false;
      }
      break;
    }

    case 'list': {
      // Handle list literals (e.g., [item1, item2])
      if (Array.isArray(rule.value)) {
        // Evaluate each element in the list
        result = rule.value.map((element) => evaluateRule(element, depth + 1));
      } else {
        console.warn('List rule type found, but value is not an array:', rule);
        result = []; // Return empty array on error
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
