/**
 * Shared helper utilities for rule evaluation.
 *
 * Contains logging, tracing, boss detection, and context binding helpers
 * used across all rule engine modules.
 *
 * @module shared/ruleEngine/helpers
 */

import { DEFAULT_PLAYER_ID } from '../playerIdUtils.js';

export { DEFAULT_PLAYER_ID };

// Helper function for logging with fallback
export function log(level, message, ...data) {
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

export class RuleTrace {
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
export function hasDefeatMethod(ruleObj, stateSnapshotInterface) {
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

export function safeLog(message, level = 'debug') {
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
export function isBossDefeatCheck(rule, stateSnapshotInterface) {
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
 * Creates a new context with bound iterator variables for all_of/any_of comprehensions.
 * Supports both simple names and tuple unpacking (for dict.items() patterns).
 * @param {object} context - The original context
 * @param {object} iterator_info - Iterator information with target and iterator
 * @param {any} value - The value to bind to the iterator variable
 * @returns {object} - A new context with the variable binding
 */
export function createBoundContext(context, iterator_info, value) {
  if (!iterator_info || !iterator_info.target) {
    // No variable to bind, return original context
    return context;
  }

  const boundVariables = {};
  const target = iterator_info.target;

  // Handle tuple unpacking (e.g., for key, value in dict.items())
  if (target.type === 'tuple' && target.elements && Array.isArray(target.elements)) {
    // Value should be an array [key, value] for dict items
    if (Array.isArray(value)) {
      target.elements.forEach((element, index) => {
        if (element.type === 'name' && element.name) {
          boundVariables[element.name] = value[index];
        }
      });
    }
  }
  // Handle list type (alternative format for tuple unpacking)
  else if (target.type === 'list' && Array.isArray(target.value) && Array.isArray(value)) {
    for (let i = 0; i < target.value.length && i < value.length; i++) {
      const targetElem = target.value[i];
      if (targetElem && targetElem.type === 'name' && targetElem.name) {
        boundVariables[targetElem.name] = value[i];
      }
    }
  }
  // Handle simple name binding
  else if (target.type === 'name' && target.name) {
    boundVariables[target.name] = value;
  }
  // Fallback for direct name property (legacy format)
  else if (target.name) {
    boundVariables[target.name] = value;
  }

  // If no variables were bound, return original context
  if (Object.keys(boundVariables).length === 0) {
    return context;
  }

  // Create a wrapper context that intercepts resolveName calls
  return {
    ...context,
    resolveName: function(name) {
      // Check if this is one of the bound variables
      if (name in boundVariables) {
        return boundVariables[name];
      }
      // Otherwise delegate to the original context
      if (context && typeof context.resolveName === 'function') {
        return context.resolveName(name);
      }
      return undefined;
    }
  };
}
