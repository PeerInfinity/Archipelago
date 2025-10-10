// frontend/modules/shared/ruleEngine.js

// Remove stateManagerSingleton import and getter
// import stateManagerSingleton from './stateManagerSingleton.js';
// function getStateManager() {
//   return stateManagerSingleton.instance;
// }

// Evaluation trace object for capturing debug info

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('ruleEngine', message, ...data);
  } else {
    // In worker context, only log ERROR and WARN levels to keep console clean
    if (level === 'error' || level === 'warn') {
      const consoleMethod =
        console[level === 'info' ? 'log' : level] || console.log;
      consoleMethod(`[ruleEngine] ${message}`, ...data);
    }
  }
}

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
    console[level] ? console[level](message) : log('info', message);
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
  // Prevent infinite recursion by limiting depth
  if (depth > 100) {
    log('error', '[evaluateRule] Maximum recursion depth exceeded', {
      depth,
      rule: rule?.type,
      method: rule?.method
    });
    return false; // Return false for locations that would cause stack overflow
  }

  // Ensure rule is an object
  if (typeof rule !== 'object' || rule === null) {
    // Handle primitive types directly if they sneak in (e.g., simple string/number requirement)
    // Though ideally, rules should always be structured objects.
    return rule; // Return the primitive value itself
  }

  // Check if context is provided and is a valid snapshot interface
  const isValidContext = context && context._isSnapshotInterface === true;
  if (!isValidContext) {
    log(
      'warn',
      '[evaluateRule] Missing or invalid context (snapshotInterface). Evaluation may fail or be inaccurate.',
      { rule: rule, contextProvided: !!context }
    );
    return undefined;
  }

  let result;
  let ruleType = rule?.type;

  try {
    switch (ruleType) {
      case 'helper': {
        // Handle Python built-in functions
        if (rule.name === 'any') {
          // Python's any() returns True if any element is truthy
          // args[0] should be a generator expression or list
          if (!rule.args || rule.args.length === 0) {
            result = false;
            break;
          }

          const firstArg = rule.args[0];
          if (firstArg && firstArg.type === 'generator_expression') {
            // Evaluate the generator expression element - it should return true if any condition passes
            // For now, treat it like an OR of all possible evaluations
            result = evaluateRule(firstArg, context, depth + 1);
          } else {
            // Evaluate all args and return true if any is truthy
            const evalArgs = rule.args.map(arg => evaluateRule(arg, context, depth + 1));
            result = evalArgs.some(val => val === true);
          }
          break;
        }

        if (rule.name === 'all') {
          // Python's all() returns True if all elements are truthy
          if (!rule.args || rule.args.length === 0) {
            result = true;
            break;
          }

          const firstArg = rule.args[0];
          if (firstArg && firstArg.type === 'generator_expression') {
            result = evaluateRule(firstArg, context, depth + 1);
          } else {
            const evalArgs = rule.args.map(arg => evaluateRule(arg, context, depth + 1));
            result = evalArgs.every(val => val === true);
          }
          break;
        }

        // Regular helper function handling
        const args = rule.args
          ? rule.args.map((arg) => evaluateRule(arg, context, depth + 1))
          : [];
        if (args.some((arg) => arg === undefined)) {
          result = undefined;
        } else if (isValidContext) {
          if (typeof context.executeHelper === 'function') {
            result = context.executeHelper(rule.name, ...args);
          } else {
            log(
              'warn',
              `[evaluateRule SnapshotIF] context.executeHelper is not a function for helper \'${rule.name}\'. Assuming undefined.`
            );
            result = undefined;
          }
        }
        break;
      }

      case 'generic_helper': {
        // Handle generic helper functions that couldn't be converted to specific rule types
        // Try to call the game-specific helper function, fall back to true if not available
        const args = rule.args
          ? rule.args.map((arg) => evaluateRule(arg, context, depth + 1))
          : [];
        if (args.some((arg) => arg === undefined)) {
          result = undefined;
        } else if (isValidContext) {
          if (typeof context.executeHelper === 'function') {
            result = context.executeHelper(rule.name, ...args);
          } else {
            log(
              'warn',
              `[evaluateRule] context.executeHelper is not a function for generic helper '${rule.name}'. Falling back to true.`
            );
            result = true;
          }
        } else {
          log(
            'warn',
            `[evaluateRule] Generic helper '${rule.name}' called without valid context - falling back to true`,
            { rule }
          );
          result = true;
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
            log(
              'warn',
              `[evaluateRule SnapshotIF] context.executeStateManagerMethod not a function for \'${rule.method}\'. Assuming undefined.`
            );
            result = undefined;
          }
        } else {
          result = undefined;
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
        // Handle both 'operand' and 'condition' field names for compatibility
        const conditionToNegate = rule.operand || rule.condition;
        if (!conditionToNegate) {
          log(
            'warn',
            '[evaluateRule Not] Missing operand/condition in not rule:',
            rule
          );
          result = undefined;
        } else {
          const operandResult = evaluateRule(
            conditionToNegate,
            context,
            depth + 1
          );
          // Negation of undefined is undefined
          result = operandResult === undefined ? undefined : !operandResult;
        }
        break;
      }

      case 'value': // Handles literal values encoded as nodes
      case 'constant': {
        // Keep constant for backward compatibility
        result = rule.value;
        break;
      }

      case 'attribute': {
        const baseObject = evaluateRule(rule.object, context, depth + 1);

        // Special case: if baseObject is undefined and the object was "self",
        // try to resolve from game settings (self in Python rules = world/rules class instance with options)
        if (baseObject === undefined && rule.object && rule.object.type === 'name' && rule.object.name === 'self') {
          // Try to get the setting value from context
          if (context.getStaticData) {
            const staticData = context.getStaticData();
            const playerId = context.playerId || context.getPlayerSlot?.() || '1';

            // Check if the setting exists
            if (staticData.settings && staticData.settings[playerId]) {
              const settingValue = staticData.settings[playerId][rule.attr];
              if (settingValue !== undefined) {
                return settingValue;
              }
            }
          }

          return undefined;
        }

        // Special case: if baseObject is undefined and the object was "options",
        // try to resolve from game settings
        if (baseObject === undefined && rule.object && rule.object.type === 'name' && rule.object.name === 'options') {
          // Try to get the setting value from context
          if (context.getStaticData) {
            const staticData = context.getStaticData();
            const playerId = context.playerId || context.getPlayerSlot?.() || '1';

            // Check if the setting exists
            if (staticData.settings && staticData.settings[playerId]) {
              const settingValue = staticData.settings[playerId][rule.attr];
              if (settingValue !== undefined) {
                return settingValue;
              }
            }
          }

          // Default values for common KH1 options
          if (rule.attr === 'keyblades_unlock_chests') {
            return false; // Default value
          }

          return undefined;
        }

        if (baseObject && typeof baseObject === 'object') {
          // Special handling for parent_region attribute on location objects
          if (rule.attr === 'parent_region' && baseObject.parent_region_name) {
            // Dynamically resolve the parent region from the context
            if (context.getStaticData && context.getStaticData().regions) {
              const regions = context.getStaticData().regions;
              
              // Try direct lookup first
              if (regions[baseObject.parent_region_name]) {
                return regions[baseObject.parent_region_name];
              }
              
              // Try player-specific lookup  
              const playerId = context.playerId || context.getPlayerSlot?.() || '1';
              if (regions[playerId] && regions[playerId][baseObject.parent_region_name]) {
                return regions[playerId][baseObject.parent_region_name];
              }
            }
            return undefined;
          }

          // Special handling for boss attribute - redirect to bosses["None"] if bosses exists
          if (rule.attr === 'boss' && !baseObject.boss && baseObject.bosses) {
            // Use the new bosses format - default to "None" entry
            return baseObject.bosses["None"] || Object.values(baseObject.bosses)[0];
          }
          
          // Special handling for dungeon attribute - resolve string to actual dungeon object
          if (rule.attr === 'dungeon' && baseObject.dungeon) {
            const dungeonValue = baseObject.dungeon;
            
            if (typeof dungeonValue === 'string') {
              // Look up the actual dungeon object from staticData
              const dungeonName = dungeonValue;
              const playerId = context.playerId || context.getPlayerSlot?.() || '1';
              const dungeons = context.dungeons || context.getAllDungeons?.() || context.staticData?.dungeons;
              
              if (dungeons) {
                // Try player-specific dungeon first
                if (dungeons[playerId] && dungeons[playerId][dungeonName]) {
                  return dungeons[playerId][dungeonName];
                }
                // Fallback to direct dungeon lookup if not nested by player
                if (dungeons[dungeonName]) {
                  return dungeons[dungeonName];
                }
              }
              // If we couldn't resolve, return the string (fallback)
              return dungeonName;
            }
            // Already an object, return as-is
            return dungeonValue;
          }

          // First try direct property access
          let attrValue = baseObject[rule.attr];

          // If not found, try resolveAttribute for mapping/transformation
          if (
            attrValue === undefined &&
            typeof context.resolveAttribute === 'function'
          ) {
            attrValue = context.resolveAttribute(baseObject, rule.attr);
          }

          // If the attribute value is itself a rule object that needs evaluation
          // Rule objects should have string type properties, not numeric ones (which are used by data objects)
          if (
            attrValue &&
            typeof attrValue === 'object' &&
            attrValue.type &&
            typeof attrValue.type === 'string'
          ) {
            return evaluateRule(attrValue, context, depth + 1);
          }

          if (typeof attrValue === 'function') {
            return attrValue.bind(baseObject);
          }

          return attrValue;
        } else {
          return undefined;
        }
      }

      case 'function_call': {
        // Special handling for state.multiworld.get_location() calls
        // These are used in location access rules to reference the location's parent_region
        if (rule.function?.type === 'attribute' && 
            rule.function.attr === 'get_location' &&
            rule.function.object?.type === 'attribute' &&
            rule.function.object.attr === 'multiworld') {
          
          const args = rule.args ? rule.args.map(arg => evaluateRule(arg, context, depth + 1)) : [];
          const locationName = args[0];
          
          // If we're evaluating a rule for the same location, return the current location
          // This avoids circular references when a location's access rule references itself
          if (context.currentLocation && context.currentLocation.name === locationName) {
            // Return an object that has the parent_region property properly set
            return {
              name: context.currentLocation.name,
              parent_region: context.currentLocation.parent_region || 
                           (context.currentLocation.region ? 
                             context.getStaticData?.().regions?.[context.currentLocation.region] : 
                             undefined),
              parent_region_name: context.currentLocation.region
            };
          }
          
          // Otherwise, try to get the location from static data
          if (context.getStaticData) {
            const staticData = context.getStaticData();
            // Search all regions for this location
            for (const [regionName, regionData] of Object.entries(staticData.regions || {})) {
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
        // These are used in exit access rules to reference the exit's parent_region
        if (rule.function?.type === 'attribute' && 
            rule.function.attr === 'get_entrance' &&
            rule.function.object?.type === 'attribute' &&
            rule.function.object.attr === 'multiworld') {
          
          const args = rule.args ? rule.args.map(arg => evaluateRule(arg, context, depth + 1)) : [];
          const exitName = args[0];
          
          // When evaluating an exit rule, the context has parent_region set
          // If this is a self-reference to the current exit, return the appropriate object
          if (context.currentExit && context.currentExit === exitName) {
            // For the current exit being evaluated, return an object with parent_region
            return {
              name: exitName,
              parent_region: context.parent_region
            };
          }
          
          // Otherwise, try to find the exit in static data
          if (context.getStaticData) {
            const staticData = context.getStaticData();
            // Search all regions for this exit
            for (const [regionName, regionData] of Object.entries(staticData.regions || {})) {
              if (regionData.exits) {
                const exit = regionData.exits.find(ex => ex.name === exitName);
                if (exit) {
                  return {
                    name: exit.name,
                    parent_region: regionData,
                    parent_region_name: regionName
                  };
                }
              }
            }
          }
          
          return undefined;
        }
        
        // Special handling for boss.can_defeat function calls
        // These need to be redirected to use the boss's defeat_rule data
        if (
          rule.function?.type === 'attribute' &&
          rule.function.attr === 'can_defeat'
        ) {
          // Check if this is a boss.can_defeat call by walking up the chain
          let current = rule.function.object;
          let isDungeomBossDefeat = false;

          // Look for patterns:
          // 1. location.parent_region.dungeon.boss.can_defeat
          // 2. location.parent_region.dungeon.bosses["index"].can_defeat (subscript pattern)
          
          // First check if immediate parent is a subscript accessing bosses
          if (current && current.type === 'subscript') {
            // Check if the subscript is accessing a bosses attribute
            let subscriptValue = current.value;
            while (subscriptValue && subscriptValue.type === 'attribute') {
              if (subscriptValue.attr === 'bosses' || subscriptValue.attr === 'boss') {
                isDungeomBossDefeat = true;
                break;
              }
              subscriptValue = subscriptValue.object;
            }
          }
          
          // Also check the standard attribute chain
          while (current && current.type === 'attribute') {
            if (current.attr === 'boss' || current.attr === 'bosses') {
              isDungeomBossDefeat = true;
              break;
            }
            current = current.object;
          }

          if (isDungeomBossDefeat) {
            // Evaluate the boss object (everything before .can_defeat)
            const bossObject = evaluateRule(
              rule.function.object,
              context,
              depth + 1
            );

            // Debug the chain resolution step by step
            log('debug', '[evaluateRule] Boss defeat chain resolution:', {
              hasLocation: !!context.currentLocation,
              locationName: context.currentLocation?.name,
              bossObjectResult: bossObject,
              bossObjectType: typeof bossObject,
              hasBossDefeatRule: !!(bossObject && bossObject.defeat_rule),
              functionChain: extractFunctionChain(rule.function.object),
            });

            if (bossObject && bossObject.defeat_rule) {
              // Use the boss's defeat_rule instead of trying to call can_defeat
              log(
                'debug',
                '[evaluateRule] Redirecting boss.can_defeat to boss.defeat_rule',
                {
                  boss: bossObject.name,
                  defeatRule: bossObject.defeat_rule,
                }
              );
              result = evaluateRule(bossObject.defeat_rule, context, depth + 1);
              break;
            } else {
              //log('warn', '[evaluateRule] Boss object missing defeat_rule', {
              //  bossObject,
              //  functionObject: rule.function.object,
              //  contextCurrentLocation: context.currentLocation?.name,
              //});
              result = undefined;
              break;
            }
          }
        }

        const func = evaluateRule(rule.function, context, depth + 1);

        if (typeof func === 'undefined') {
          result = undefined;
          break;
        }

        // Special case: If func is a rule object (not a JavaScript function),
        // evaluate it directly. This handles cases like boss.defeat_rule where
        // defeat_rule is a rule object that needs evaluation, not a function call.
        if (
          func &&
          typeof func === 'object' &&
          func.type &&
          typeof func.type === 'string'
        ) {
          // Evaluate the rule object directly
          result = evaluateRule(func, context, depth + 1);
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
              log(
                'warn',
                "[evaluateRule FunctionCall] Resolved 'this' context is null/undefined. Using main context.",
                rule.function
              );
              thisContext = context;
            }

            result = func.apply(thisContext, args);
            // Check if the function itself returned undefined
            if (result === undefined) {
              // log('warn', `[evaluateRule FunctionCall] Function ${rule.function?.attr || rule.function?.name || '?'} returned undefined.`);
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
            log(
              'error',
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
          log('warn', `[evaluateRule] Resolved identifier is not a function:`, {
            identifier: rule.function,
            resolvedValue: func,
          });
          result = undefined; // Not a function, result undefined
        }
        break;
      }

      case 'subscript': {
        const list = evaluateRule(rule.value, context, depth + 1);
        const index = evaluateRule(rule.index, context, depth + 1);

        if (list === undefined || index === undefined) {
          result = undefined; // If array/object or index is unknown, result is unknown
        } else if (list && typeof list === 'object') {
          result = list[index]; // Access property/index
          // If list[index] itself is undefined (property doesn't exist), result remains undefined.
        } else {
          log(
            'warn',
            '[evaluateRule] Subscript applied to non-object/non-map or null value.',
            { rule, list }
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
            if (Array.isArray(left) && Array.isArray(right)) {
              result =
                left.length === right.length &&
                left.every((val, index) => val == right[index]);
            } else {
              result = left == right;
            }
            break;
          case '!=':
            if (Array.isArray(left) && Array.isArray(right)) {
              result =
                left.length !== right.length ||
                left.some((val, index) => val != right[index]);
            } else {
              result = left != right;
            }
            break;
          case 'in':
            if (Array.isArray(right)) {
              // Handle array comparison with deep equality for nested arrays
              if (Array.isArray(left)) {
                result = right.some(item => {
                  if (Array.isArray(item)) {
                    // Deep array comparison
                    return item.length === left.length && 
                           item.every((val, index) => val === left[index]);
                  } else {
                    return item === left;
                  }
                });
              } else {
                result = right.includes(left);
              }
            } else if (typeof right === 'string') {
              result = right.includes(left);
            } else if (right instanceof Set) {
              // Handle Set
              result = right.has(left);
            } else {
              log(
                'warn',
                '[evaluateRule] "in" operator used with invalid right side type:',
                { left, right }
              );
              result = false; // Define behavior: false if right side isn't iterable
            }
            break;
          default:
            log(
              'warn',
              `[evaluateRule] Unsupported comparison operator: ${op}`
            );
            result = undefined; // Operator unknown -> result unknown
        }
        break;
      }

      case 'total_items_count': {
        // Check if player has collected at least N items total across all item types
        const requiredCount = evaluateRule(rule.count, context, depth + 1);
        if (requiredCount === undefined) {
          result = undefined;
        } else if (typeof context.getTotalItemCount === 'function') {
          const totalCount = context.getTotalItemCount();
          result = totalCount >= requiredCount;
        } else if (context.snapshot && context.snapshot.inventory) {
          // Fallback: count items directly from snapshot inventory
          let totalCount = 0;
          for (const itemName in context.snapshot.inventory) {
            totalCount += context.snapshot.inventory[itemName] || 0;
          }
          result = totalCount >= requiredCount;
        } else {
          log('warn', '[evaluateRule] No way to get total item count for total_items_count rule.');
          result = undefined;
        }
        break;
      }
      
      case 'locations_checked': {
        // Check if player has checked at least N locations
        const requiredCount = evaluateRule(rule.count, context, depth + 1);
        console.log('[locations_checked] Rule triggered, requiredCount:', requiredCount);
        if (requiredCount === undefined) {
          console.log('[locations_checked] requiredCount is undefined');
          result = undefined;
        } else if (typeof context.getCheckedLocationsCount === 'function') {
          const checkedCount = context.getCheckedLocationsCount();
          console.log(`[locations_checked] Checking if ${checkedCount} >= ${requiredCount}`);
          result = checkedCount >= requiredCount;
          console.log(`[locations_checked] Result: ${result}`);
        } else {
          console.log('[locations_checked] context.getCheckedLocationsCount is not a function');
          log('warn', '[evaluateRule] context.getCheckedLocationsCount is not a function for locations_checked.');
          result = undefined;
        }
        break;
      }

      case 'item_check': {
        const itemName = evaluateRule(rule.item, context, depth + 1);
        if (itemName === undefined) {
          result = undefined;
        } else if (rule.count !== undefined) {
          // If there's a count field, use count-based checking
          const requiredCount = evaluateRule(rule.count, context, depth + 1);
          if (requiredCount === undefined) {
            result = undefined;
          } else if (typeof context.countItem === 'function') {
            const currentCount = context.countItem(itemName);
            if (currentCount === undefined) {
              result = undefined;
            } else {
              result = currentCount >= requiredCount;
            }
          } else {
            log('warn', '[evaluateRule SnapshotIF] context.countItem is not a function for item_check with count.');
            result = undefined;
          }
        } else if (typeof context.hasItem === 'function') {
          result = context.hasItem(itemName); // hasItem should return true/false/undefined
        } else {
          log(
            'warn',
            '[evaluateRule SnapshotIF] context.hasItem is not a function for item_check.'
          );
          result = undefined;
        }
        break;
      }

      case 'location_check': {
        // Check if a location is accessible (can be reached)
        // This matches the Python behavior where _can_get checks if a location CAN be reached
        const locationName = evaluateRule(rule.location, context, depth + 1);
        if (locationName === undefined) {
          result = undefined;
        } else if (typeof context.isLocationAccessible === 'function') {
          result = context.isLocationAccessible(locationName);
          if (result === undefined) {
            log('warn', `[evaluateRule] Location ${locationName} accessibility could not be determined`);
          }
        } else {
          log('warn', '[evaluateRule] context.isLocationAccessible is not a function for location_check.');
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
          log(
            'warn',
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
          log(
            'warn',
            '[evaluateRule SnapshotIF] context.countGroup is not a function for group_check.'
          );
          result = undefined;
        }
        break;
      }

      case 'setting_value': {
        // Retrieve a setting value (e.g. for self.world.options.difficulty)
        let settingName = rule.setting;
        if (typeof settingName === 'string') {
          result = context.getSetting(settingName);
        } else {
          log('warn', '[evaluateRule] Invalid setting name for setting_value', {
            rule,
            settingName,
          });
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
          log('warn', '[evaluateRule] Invalid setting name for setting_check', {
            rule,
            settingName,
          });
          result = undefined;
        }
        break;
      }

      case 'name': {
        // Resolve name using the context's resolveName method if available
        if (context && typeof context.resolveName === 'function') {
          result = context.resolveName(rule.name);
        } else {
          log(
            'warn',
            `[evaluateRule] Context cannot resolve name: ${rule.name}`
          );
          result = undefined;
        }
        break;
      }

      case 'conditional': {
        if (!rule.test || !rule.if_true) {
          log(
            'warn',
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
            // Handle null if_false as true (no additional requirements)
            result =
              rule.if_false === null
                ? true
                : evaluateRule(rule.if_false, context, depth + 1);
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
            // Handle Python-style list repetition: [item] * count = [item, item, ...]
            if (Array.isArray(left) && typeof right === 'number') {
              result = [];
              for (let i = 0; i < right; i++) {
                result.push(...left);
              }
            } else {
              result = left * right;
            }
            break;
          case '/':
            result = right !== 0 ? left / right : undefined;
            break;
          case '//':
            // Python floor division operator
            result = right !== 0 ? Math.floor(left / right) : undefined;
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
            log('warn', `[evaluateRule] Unknown binary_op operator: ${op}`, {
              rule,
            });
            result = undefined;
        }
        break;
      }

      case 'list': {
        if (!Array.isArray(rule.value)) {
          log(
            'warn',
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

      case 'all_of': {
        // all_of evaluates an element_rule against all items from an iterator
        if (!rule.element_rule) {
          log('warn', '[evaluateRule] all_of rule missing element_rule', { rule });
          result = undefined;
          break;
        }
        
        // Extract iterator information
        let iterable;
        if (rule.iterator_info && rule.iterator_info.iterator) {
          // Get the iterator from the iterator_info
          iterable = evaluateRule(rule.iterator_info.iterator, context, depth + 1);
        } else if (rule.iterable) {
          // Fallback for direct iterable field
          iterable = evaluateRule(rule.iterable, context, depth + 1);
        } else {
          log('warn', '[evaluateRule] all_of rule missing iterator information', { rule });
          result = undefined;
          break;
        }
        
        if (!Array.isArray(iterable)) {
          log('warn', '[evaluateRule] all_of iterator is not an array', { rule, iterable });
          result = false;
          break;
        }
        
        result = true;
        for (const item of iterable) {
          // For now, evaluate the element_rule directly
          // TODO: In a full implementation, we'd need to bind the iterator variable
          const itemResult = evaluateRule(rule.element_rule, context, depth + 1);
          if (itemResult === false) {
            result = false;
            break;
          }
          if (itemResult === undefined) {
            result = undefined;
            break;
          }
        }
        break;
      }

      case 'generator_expression': {
        // generator_expression represents a Python generator expression
        // It has an element and potentially filters/conditions
        if (!rule.element) {
          log('warn', '[evaluateRule] generator_expression rule missing element', { rule });
          result = undefined;
          break;
        }
        
        // For now, evaluate the element directly
        // This is a simplified implementation - real generator expressions would need
        // proper iteration and filtering support
        result = evaluateRule(rule.element, context, depth + 1);
        break;
      }

      case 'can_reach': {
        // Check if a region is reachable
        const regionName = evaluateRule(rule.region, context, depth + 1);
        if (regionName === undefined) {
          result = undefined;
        } else if (typeof context.isRegionReachable === 'function') {
          result = context.isRegionReachable(regionName);
          if (result === undefined) {
            log('debug', `[evaluateRule] Region ${regionName} reachability could not be determined`);
          }
        } else {
          log('warn', '[evaluateRule] context.isRegionReachable is not a function for can_reach.');
          result = undefined;
        }
        break;
      }

      default: {
        log('warn', `[evaluateRule] Unknown rule type: ${ruleType}`, { rule });
        result = undefined;
        break;
      }
    }
  } catch (error) {
    log('error', '[evaluateRule] Error during evaluation:', {
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
    log('info', `${prefix}null or undefined rule`);
    return;
  }

  log('info', `${prefix}Type: ${rule.type}`);

  switch (rule.type) {
    case 'constant':
      log('info', `${prefix}Value: ${rule.value}`);
      break;

    case 'name':
      log('info', `${prefix}Name: ${rule.name}`);
      break;

    case 'attribute':
      log('info', `${prefix}Attribute: ${rule.attr}`);
      log('info', `${prefix}Object:`);
      debugRule(rule.object, indent + 2);
      break;

    case 'subscript':
      log('info', `${prefix}Subscript:`);
      log('info', `${prefix}  Value:`);
      debugRule(rule.value, indent + 4);
      log('info', `${prefix}  Index:`);
      debugRule(rule.index, indent + 4);
      break;

    case 'function_call':
      log('info', `${prefix}Function Call:`);
      log('info', `${prefix}  Function:`);
      debugRule(rule.function, indent + 4);
      log('info', `${prefix}  Args:`);
      (rule.args || []).forEach((arg, i) => {
        log('info', `${prefix}    Arg ${i + 1}:`);
        debugRule(arg, indent + 6);
      });
      break;

    case 'location_check':
      if (typeof rule.location === 'string') {
        log('info', `${prefix}Location: ${rule.location}`);
      } else {
        log('info', `${prefix}Location (complex):`);
        debugRule(rule.location, indent + 2);
      }
      break;

    case 'locations_checked':
      if (typeof rule.count === 'number') {
        log('info', `${prefix}Required locations checked: ${rule.count}`);
      } else if (rule.count) {
        log('info', `${prefix}Required locations checked (complex):`);
        debugRule(rule.count, indent + 2);
      }
      break;

    case 'item_check':
      if (typeof rule.item === 'string') {
        log('info', `${prefix}Item: ${rule.item}`);
      } else {
        log('info', `${prefix}Item (complex):`);
        debugRule(rule.item, indent + 2);
      }
      break;

    case 'count_check':
      if (typeof rule.item === 'string') {
        log('info', `${prefix}Item: ${rule.item}`);
      } else {
        log('info', `${prefix}Item (complex):`);
        debugRule(rule.item, indent + 2);
      }

      if (typeof rule.count === 'number') {
        log('info', `${prefix}Count: ${rule.count}`);
      } else if (rule.count) {
        log('info', `${prefix}Count (complex):`);
        debugRule(rule.count, indent + 2);
      }
      break;

    case 'group_check':
      if (typeof rule.group === 'string') {
        log('info', `${prefix}Group: ${rule.group}`);
      } else {
        log('info', `${prefix}Group (complex):`);
        debugRule(rule.group, indent + 2);
      }

      log('info', `${prefix}Count: ${rule.count || 1}`);
      break;

    case 'helper':
      log('info', `${prefix}Helper: ${rule.name}`);
      if (rule.args && rule.args.length > 0) {
        log('info', `${prefix}Args:`);
        rule.args.forEach((arg, i) => {
          if (typeof arg === 'string' || typeof arg === 'number') {
            log('info', `${prefix}  Arg ${i + 1}: ${arg}`);
          } else {
            log('info', `${prefix}  Arg ${i + 1} (complex):`);
            debugRule(arg, indent + 4);
          }
        });
      }
      break;

    case 'generic_helper':
      log('info', `${prefix}Generic Helper: ${rule.name}`);
      if (rule.description) {
        log('info', `${prefix}Description: ${rule.description}`);
      }
      if (rule.args && rule.args.length > 0) {
        log('info', `${prefix}Args:`);
        rule.args.forEach((arg, i) => {
          if (typeof arg === 'string' || typeof arg === 'number') {
            log('info', `${prefix}  Arg ${i + 1}: ${arg}`);
          } else {
            log('info', `${prefix}  Arg ${i + 1} (complex):`);
            debugRule(arg, indent + 4);
          }
        });
      }
      break;

    case 'and':
    case 'or':
      log(
        'info',
        `${prefix}${rule.type.toUpperCase()} with ${
          rule.conditions.length
        } conditions:`
      );
      rule.conditions.forEach((cond, i) => {
        log('info', `${prefix}  Condition ${i + 1}:`);
        debugRule(cond, indent + 4);
      });
      break;

    case 'state_method':
      log('info', `${prefix}Method: ${rule.method}`);
      if (rule.args && rule.args.length > 0) {
        log('info', `${prefix}Args:`);
        rule.args.forEach((arg, i) => {
          if (typeof arg === 'string' || typeof arg === 'number') {
            log('info', `${prefix}  Arg ${i + 1}: ${arg}`);
          } else {
            log('info', `${prefix}  Arg ${i + 1} (complex):`);
            debugRule(arg, indent + 4);
          }
        });
      }
      break;

    case 'comparison':
      log('info', `${prefix}Comparison: ${rule.op}`);
      log('info', `${prefix}Left:`);
      if (typeof rule.left === 'object' && rule.left.type) {
        debugRule(rule.left, indent + 2);
      } else {
        log('info', `${prefix}  ${rule.left}`);
      }

      log('info', `${prefix}Right:`);
      if (typeof rule.right === 'object' && rule.right.type) {
        debugRule(rule.right, indent + 2);
      } else {
        log('info', `${prefix}  ${rule.right}`);
      }
      break;

    default:
      log('info', `${prefix}${JSON.stringify(rule, null, 2)}`);
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
    log('info', 'null or undefined rule');
    return;
  }

  console.group(`Python AST Node: ${rule.type}`);

  switch (rule.type) {
    case 'function_call':
      log('info', `Function: ${extractFunctionPath(rule.function)}`);
      log('info', 'Arguments:');
      (rule.args || []).forEach((arg, i) => {
        console.group(`Arg ${i + 1}:`);
        debugPythonAST(arg);
        console.groupEnd();
      });
      break;

    case 'attribute':
      log('info', `Attribute: ${rule.attr}`);
      log('info', 'Object:');
      debugPythonAST(rule.object);
      break;

    case 'subscript':
      log('info', 'Value:');
      debugPythonAST(rule.value);
      log('info', 'Index:');
      debugPythonAST(rule.index);
      break;

    case 'name':
      log('info', `Name: ${rule.name}`);
      break;

    case 'constant':
      log('info', `Constant: ${rule.value}`);
      break;

    default:
      log('info', `${JSON.stringify(rule, null, 2)}`);
  }

  console.groupEnd();
}

function extractFunctionChain(node) {
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
