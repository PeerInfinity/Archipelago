// frontend/modules/stateManager/ruleEngine.js

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

import { processRule } from './ruleProcessor.js';
import { evaluationProcessor } from './evaluationProcessor.js';

/**
 * Evaluates a rule against the provided state context (either StateManager or main thread snapshot).
 * Now uses the shared rule processor system to eliminate code duplication.
 * 
 * @param {any} rule - The rule object (or primitive) to evaluate.
 * @param {object} context - Either the StateManager instance (or its interface) in the worker,
 *                           or the snapshot interface on the main thread.
 * @param {number} [depth=0] - Current recursion depth for debugging.
 * @returns {boolean|any} - The result of the rule evaluation.
 */
export const evaluateRule = (rule, context, depth = 0) => {
  return processRule(rule, context, evaluationProcessor, { depth });
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
