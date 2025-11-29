/**
 * Rule Evaluator Module
 *
 * Handles helper function execution, state method execution, and rule evaluation debugging.
 * This module centralizes all rule evaluation logic and provides debugging utilities
 * for understanding rule evaluation behavior.
 *
 * **Data Flow**:
 *
 * Helper Execution (executeHelper):
 *   Input: Helper function name and arguments
 *     ├─> name: string (helper function name)
 *     ├─> args: any[] (arguments to pass to helper)
 *
 *   Processing:
 *     ├─> Get current snapshot from StateManager
 *     ├─> Get static game data from StateManager
 *     ├─> Add evaluateRule method to snapshot for helper use
 *     ├─> Call helper function with (snapshot, staticData, ...args)
 *
 *   Output: Helper function result (boolean or any type)
 *
 * State Method Execution (executeStateMethod):
 *   Input: Method name and arguments
 *     ├─> method: string (method name to execute)
 *     ├─> args: any[] (arguments to pass to method)
 *
 *   Processing:
 *     ├─> Check if method exists on StateManager instance
 *     ├─> Check for special cases (can_reach)
 *     ├─> Check modern helperFunctions system
 *     ├─> Check legacy helpers system (with/without underscore)
 *
 *   Output: Method result (typically boolean)
 *
 * Rule Debugging (debugRuleEvaluation):
 *   Input: Rule object to debug
 *     ├─> rule: object (rule AST from JSON)
 *     ├─> depth: number (recursion depth for indentation)
 *
 *   Processing:
 *     ├─> Evaluate rule and get result
 *     ├─> Log rule type and details
 *     ├─> Recursively debug sub-rules (and/or conditions)
 *     ├─> Log item checks, count checks, helpers, state methods
 *
 *   Output: Console logging of rule evaluation details
 *
 * Critical Region Debugging (debugCriticalRegions):
 *   Input: None (uses current StateManager state)
 *
 *   Processing:
 *     ├─> Log current inventory
 *     ├─> For each critical region:
 *       ├─> Check if region is reachable
 *       ├─> Analyze incoming connections from other regions
 *       ├─> Evaluate exit access rules
 *       ├─> Show path to region if found
 *
 *   Output: Console logging of critical region analysis
 *
 * **Recursion Protection**:
 * Both executeHelper and executeStateMethod set _inHelperExecution flag to prevent
 * infinite recursion when getSnapshot calls computeReachableRegions.
 *
 * **Dual Path Architecture**:
 * Worker Thread Path: Direct evaluation with full StateManager context
 * Main Thread Path: Proxy sends query to worker, worker evaluates, returns result
 *
 * Phase 6 of StateManager refactoring plan.
 *
 * @module stateManager/core/ruleEvaluator
 */

import { createUniversalLogger } from '../../../app/core/universalLogger.js';
import { PlayerIdUtils } from '../../shared/playerIdUtils.js';

const moduleLogger = createUniversalLogger('ruleEvaluator');

function log(level, message, ...data) {
  moduleLogger[level](message, ...data);
}

/**
 * Execute a helper function using the thread-agnostic logic
 * @param {StateManager} manager - The StateManager instance
 * @param {string} name - The helper function name
 * @param {...any} args - Arguments to pass to the helper function
 * @returns {any} Result from the helper function
 */
export function executeHelper(manager, name, ...args) {
  // Recursion protection: prevent getSnapshot from calling isLocationAccessible during helper execution
  const wasInHelperExecution = manager._inHelperExecution;
  manager._inHelperExecution = true;

  // Debug logging for helper execution (can be enabled when needed)
  manager._logDebug(
    `[RuleEvaluator executeHelper] Helper: ${name}, game: ${manager.settings?.game}, hasHelper: ${!!(manager.helperFunctions && manager.helperFunctions[name])}`
  );

  try {
    // The `manager.helperFunctions` property is now set dynamically based on the game.
    if (manager.helperFunctions && manager.helperFunctions[name]) {
      const snapshot = manager.getSnapshot();
      const staticData = manager.getStaticGameData();

      // Add evaluateRule method to snapshot for AHIT helpers
      snapshot.evaluateRule = function (rule) {
        // Create a minimal snapshot interface for rule evaluation
        const snapshotInterface = manager._createSelfSnapshotInterface();
        return manager.evaluateRuleFromEngine(rule, snapshotInterface);
      };

      // New helper signature: (snapshot, staticData, ...args)
      return manager.helperFunctions[name](snapshot, staticData, ...args);
    }
    return false; // Default return if no helper is found
  } finally {
    // Restore the previous state
    manager._inHelperExecution = wasInHelperExecution;
  }
}

/**
 * Helper method to execute a state method by name
 * @param {StateManager} manager - The StateManager instance
 * @param {string} method - The method name to execute
 * @param {...any} args - Arguments to pass to the method
 * @returns {any} Result from the state method
 */
export function executeStateMethod(manager, method, ...args) {
  // Recursion protection: prevent getSnapshot from calling computeReachableRegions during helper execution
  const wasInHelperExecution = manager._inHelperExecution;
  manager._inHelperExecution = true;

  try {
    // For consistency, we should check multiple places systematically

    // 1. Check if it's a direct method on stateManager
    if (typeof manager[method] === 'function') {
      return manager[method](...args);
    }

    // 2. Check special case for can_reach since it's commonly used
    if (method === 'can_reach' && args.length >= 1) {
      const targetName = args[0];
      const targetType = args[1] || 'Region';
      // Normalize player ID, defaulting to current player if not specified
      const playerId = args[2] !== undefined ? PlayerIdUtils.normalize(args[2]) : manager.playerId;
      return manager.can_reach(targetName, targetType, playerId);
    }

    // 3. Check for game-specific state methods (e.g., has_from_list_unique for Mario Land 2)
    if (manager.stateMethods && typeof manager.stateMethods[method] === 'function') {
      const snapshot = manager.getSnapshot();
      const staticData = manager.getStaticGameData();
      return manager.stateMethods[method](snapshot, staticData, ...args);
    }

    // 4. Look in modern helperFunctions system
    if (manager.helperFunctions) {
      // Try exact method name first
      if (typeof manager.helperFunctions[method] === 'function') {
        const snapshot = manager.getSnapshot();
        const staticData = manager.getStaticGameData();
        return manager.helperFunctions[method](snapshot, staticData, ...args);
      }
    }

    // 4. Legacy helpers system (fallback)
    if (manager.helpers) {
      // Try exact method name first
      if (typeof manager.helpers[method] === 'function') {
        return manager.helpers[method](...args);
      }

      // If method starts with underscore and no match found, try without underscore
      if (
        method.startsWith('_') &&
        typeof manager.helpers[method.substring(1)] === 'function'
      ) {
        return manager.helpers[method.substring(1)](...args);
      }

      // If method doesn't start with underscore, try with underscore
      if (
        !method.startsWith('_') &&
        typeof manager.helpers['_' + method] === 'function'
      ) {
        return manager.helpers['_' + method](...args);
      }
    }

    // If no method found, log in debug mode
    if (manager.debugMode) {
      log('info', `Unknown state method: ${method}`, {
        args: args,
        stateManagerHas: typeof manager[method] === 'function',
        helpersHas: manager.helpers
          ? typeof manager.helpers[method] === 'function' ||
          (method.startsWith('_') &&
            typeof manager.helpers[method.substring(1)] === 'function') ||
          (!method.startsWith('_') &&
            typeof manager.helpers['_' + method] === 'function')
          : false,
        stateHas: false, // Legacy state system removed
      });
    }

    return undefined;
  } finally {
    // Restore the previous state
    manager._inHelperExecution = wasInHelperExecution;
  }
}

/**
 * Debug evaluation of a specific rule
 * @param {StateManager} manager - The StateManager instance
 * @param {object} rule - The rule to debug
 * @param {number} depth - Recursion depth for indentation
 */
export function debugRuleEvaluation(manager, rule, depth = 0) {
  if (!rule) return;

  const indent = '    ' + '  '.repeat(depth);

  // Get result using internal evaluation
  let ruleResult = false;
  try {
    const snapshotInterface = manager._createSelfSnapshotInterface();
    ruleResult = manager.evaluateRuleFromEngine(rule, snapshotInterface);
  } catch (e) { }

  switch (rule.type) {
    case 'and':
    case 'or':
      log(
        'info',
        `${indent}${rule.type.toUpperCase()} rule with ${rule.conditions.length} conditions`
      );
      let allResults = [];
      rule.conditions.forEach((condition, i) => {
        const snapshotInterfaceInner = manager._createSelfSnapshotInterface();
        const result = manager.evaluateRuleFromEngine(
          condition,
          snapshotInterfaceInner
        );
        allResults.push(result);
        log(
          'info',
          `${indent}- Condition #${i + 1}: ${result ? 'PASS' : 'FAIL'}`
        );
        debugRuleEvaluation(manager, condition, depth + 1);
      });

      if (rule.type === 'and') {
        log(
          'info',
          `${indent}AND result: ${allResults.every((r) => r) ? 'PASS' : 'FAIL'}`
        );
      } else {
        log(
          'info',
          `${indent}OR result: ${allResults.some((r) => r) ? 'PASS' : 'FAIL'}`
        );
      }
      break;

    case 'item_check':
      const hasItem = manager._hasItem(rule.item);
      log(
        'info',
        `${indent}ITEM CHECK: ${rule.item} - ${hasItem ? 'HAVE' : 'MISSING'}`
      );
      break;

    case 'count_check':
      const count = manager._countItem(rule.item);
      log(
        'info',
        `${indent}COUNT CHECK: ${rule.item} (${count}) >= ${rule.count} - ${count >= rule.count ? 'PASS' : 'FAIL'}`
      );
      break;

    case 'helper':
      // Evaluate args before passing to helper (similar to function call args at line 430)
      const evaluatedHelperArgs = rule.args
        ? rule.args.map((arg) => manager.evaluateRuleFromEngine(arg))
        : [];
      const helperResult = manager.helpers.executeHelper(
        rule.name,
        ...evaluatedHelperArgs
      );
      log(
        'info',
        `${indent}HELPER: ${rule.name}(${JSON.stringify(evaluatedHelperArgs)}) - ${helperResult ? 'PASS' : 'FAIL'}`
      );
      break;

    case 'state_method':
      // Evaluate args before passing to state method (similar to function call args)
      const evaluatedMethodArgs = rule.args
        ? rule.args.map((arg) => manager.evaluateRuleFromEngine(arg))
        : [];
      const methodResult = manager.helpers.executeStateMethod(
        rule.method,
        ...evaluatedMethodArgs
      );
      log(
        'info',
        `${indent}STATE METHOD: ${rule.method}(${JSON.stringify(
          evaluatedMethodArgs
        )}) - ${methodResult ? 'PASS' : 'FAIL'}`
      );

      // Special debug for can_reach which is often the source of problems
      if (rule.method === 'can_reach' && evaluatedMethodArgs.length > 0) {
        const targetRegion = evaluatedMethodArgs[0];
        const targetType = evaluatedMethodArgs[1] || 'Region';

        if (targetType === 'Region') {
          log(
            'info',
            `${indent}  -> Checking can_reach for region "${targetRegion}": ${manager.isRegionReachable(targetRegion)
              ? 'REACHABLE'
              : 'UNREACHABLE'
            }`
          );
        }
      }
      break;

    case 'conditional':
      const testResult = manager.evaluateRuleFromEngine(rule.test);
      if (testResult) {
        return manager.evaluateRuleFromEngine(rule.if_true);
      } else {
        // Handle null if_false as true (no additional requirements)
        return rule.if_false === null
          ? true
          : manager.evaluateRuleFromEngine(rule.if_false);
      }

    case 'comparison':
    case 'compare':
      const left = manager.evaluateRuleFromEngine(rule.left);
      const right = manager.evaluateRuleFromEngine(rule.right);
      let op = rule.op.trim();
      switch (op) {
        case '==':
          return left == right;
        case '!=':
          return left != right;
        case '<=':
          return left <= right;
        case '<':
          return left < right;
        case '>=':
          return left >= right;
        case '>':
          return left > right;
        case 'in':
          if (Array.isArray(right) || typeof right === 'string') {
            return right.includes(left);
          } else if (right instanceof Set) {
            return right.has(left);
          }
          log(
            'warn',
            `[RuleEvaluator debugRuleEvaluation] 'in' operator requires iterable right-hand side (Array, String, Set). Got:`,
            right
          );
          return false;
        case 'not in':
          if (Array.isArray(right) || typeof right === 'string') {
            return !right.includes(left);
          } else if (right instanceof Set) {
            return !right.has(left);
          }
          log(
            'warn',
            `[RuleEvaluator debugRuleEvaluation] 'not in' operator requires iterable right-hand side (Array, String, Set). Got:`,
            right
          );
          return true;
        default:
          log(
            'warn',
            `[RuleEvaluator debugRuleEvaluation] Unsupported comparison operator: ${rule.op}`
          );
          return false;
      }

    case 'binary_op':
      const leftOp = manager.evaluateRuleFromEngine(rule.left);
      const rightOp = manager.evaluateRuleFromEngine(rule.right);
      switch (rule.op) {
        case '+':
          return leftOp + rightOp;
        case '-':
          return leftOp - rightOp;
        case '*':
          return leftOp * rightOp;
        case '/':
          return rightOp !== 0 ? leftOp / rightOp : Infinity;
        default:
          log(
            'warn',
            `[RuleEvaluator debugRuleEvaluation] Unsupported binary operator: ${rule.op}`
          );
          return undefined;
      }

    case 'attribute':
      const baseObject = manager.evaluateRuleFromEngine(rule.object);
      if (baseObject && typeof baseObject === 'object') {
        const attrValue = baseObject[rule.attr];
        if (typeof attrValue === 'function') {
          return attrValue.bind(baseObject);
        }
        return attrValue;
      } else {
        return undefined;
      }

    case 'function_call':
      const func = manager.evaluateRuleFromEngine(rule.function);
      if (typeof func !== 'function') {
        log(
          'error',
          '[RuleEvaluator debugRuleEvaluation] Attempted to call non-function:',
          func,
          { rule }
        );
        return false;
      }
      const args = rule.args
        ? rule.args.map((arg) => manager.evaluateRuleFromEngine(arg))
        : [];
      let thisContext = null;
      try {
        return func.apply(thisContext, args);
      } catch (callError) {
        log(
          'error',
          '[RuleEvaluator debugRuleEvaluation] Error executing function call:',
          callError,
          { rule, funcName: rule.function?.attr || rule.function?.id }
        );
        return false;
      }

    case 'constant':
      return rule.value;

    case 'bool':
      return rule.value;

    case 'string':
      return rule.value;

    case 'number':
      return rule.value;

    case 'name':
      if (rule.id === 'True') return true;
      if (rule.id === 'False') return false;
      if (rule.id === 'None') return null;
      if (rule.id === 'self') return manager;
      if (rule.id === 'state') {
        // Support for SM's state.smbm[player].maxDiff pattern
        return manager.getSnapshot();
      }
      if (manager.settings && manager.settings.hasOwnProperty(rule.id)) {
        return manager.settings[rule.id];
      }
      if (manager.helpers && typeof manager.helpers[rule.id] === 'function') {
        return manager.helpers[rule.id].bind(manager.helpers);
      }
      if (typeof manager[rule.id] === 'function') {
        return manager[rule.id].bind(manager);
      }
      log(
        'warn',
        `[RuleEvaluator debugRuleEvaluation] Unresolved name: ${rule.id}`
      );
      return undefined;

    default:
      if (
        typeof rule === 'string' ||
        typeof rule === 'number' ||
        typeof rule === 'boolean' ||
        rule === null
      ) {
        return rule;
      }
      log(
        'warn',
        `[RuleEvaluator debugRuleEvaluation] Unsupported rule type or invalid rule: ${rule.type}`,
        rule
      );
      return false;
  }
}

/**
 * Debug specific critical regions to understand evaluation discrepancies
 * @param {StateManager} manager - The StateManager instance
 */
export function debugCriticalRegions(manager) {
  // List of regions that are causing issues
  const criticalRegions = [
    'Pyramid Fairy',
    'Big Bomb Shop',
    'Inverted Big Bomb Shop',
  ];

  log('info', '============ CRITICAL REGIONS DEBUG ============');

  // Log the current inventory state
  log('info', 'Current inventory:');
  const inventoryItems = [];
  manager.inventory.items.forEach((count, item) => {
    if (count > 0) {
      inventoryItems.push(`${item} (${count})`);
    }
  });
  log('info', inventoryItems.join(', '));

  // Check each critical region
  criticalRegions.forEach((regionName) => {
    const region = manager.regions.get(regionName);
    if (!region) {
      log('info', `Region "${regionName}" not found in loaded regions`);
      return;
    }

    log('info', `\nAnalyzing "${regionName}":`);
    log(
      'info',
      `- Reachable according to stateManager: ${manager.isRegionReachable(
        regionName
      )}`
    );

    // Check incoming paths
    log('info', `\nIncoming connections to ${regionName}:`);
    let hasIncomingPaths = false;

    for (const [sourceRegionName, sourceRegion] of manager.regions.entries()) {
      if (!sourceRegion || !sourceRegion.exits) return;

      const connectingExits = sourceRegion.exits.filter(
        (exit) => exit.connected_region === regionName
      );

      if (connectingExits.length > 0) {
        hasIncomingPaths = true;
        const sourceReachable = manager.isRegionReachable(sourceRegionName);
        log(
          'info',
          `- From ${sourceRegionName} (${sourceReachable ? 'REACHABLE' : 'UNREACHABLE'}):`
        );

        connectingExits.forEach((exit) => {
          const snapshotInterface = manager._createSelfSnapshotInterface();
          // Set parent_region context for exit evaluation - needs to be the region object, not just the name
          snapshotInterface.parent_region = manager.regions.get(sourceRegionName);
          // Set currentExit so get_entrance can detect self-references
          snapshotInterface.currentExit = exit.name;
          const exitAccessible = exit.access_rule
            ? manager.evaluateRuleFromEngine(exit.access_rule, snapshotInterface)
            : true;
          log(
            'info',
            `  - Exit: ${exit.name} (${exitAccessible ? 'ACCESSIBLE' : 'BLOCKED'})`
          );

          if (exit.access_rule) {
            log(
              'info',
              '    Rule:',
              JSON.stringify(exit.access_rule, null, 2)
            );
            debugRuleEvaluation(manager, exit.access_rule);
          }
        });
      }
    }

    if (!hasIncomingPaths) {
      log('info', '  No incoming paths found.');
    }

    // Check path from stateManager
    const path = manager.getPathToRegion(regionName);
    if (path && path.length > 0) {
      log('info', `\nPath found to ${regionName}:`);
      path.forEach((segment) => {
        log(
          'info',
          `- ${segment.from} → ${segment.entrance} → ${segment.to}`
        );
      });
    } else {
      log('info', `\nNo path found to ${regionName}`);
    }
  });

  log('info', '===============================================');
}
