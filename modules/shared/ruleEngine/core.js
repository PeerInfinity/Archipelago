/**
 * Core rule evaluation engine.
 *
 * Defines evaluateRule and _evaluateRuleImpl, which dispatch to handler modules
 * and the Rule Builder evaluator. All handler modules are registered at module
 * load time via their factory functions.
 *
 * @module shared/ruleEngine/core
 */

import { profiler } from '../profiler.js';
import { log } from './helpers.js';

// Handler module factories
import { createLogicHandlers } from './astLogic.js';
import { createCheckHandlers } from './astChecks.js';
import { createAttributeHandlers } from './astAttributes.js';
import { createFunctionCallHandlers } from './astFunctionCalls.js';
import { createCollectionHandlers } from './astCollections.js';
import { createImperativeHandlers } from './astImperative.js';
import { createReachabilityHandlers } from './astReachability.js';
import { createHelperHandlers } from './astHelpers.js';
import { createRuleBuilderEvaluator } from './ruleBuilderEvaluator.js';

/**
 * Evaluates a rule against the provided state context (either StateManager or main thread snapshot).
 * @param {any} rule - The rule object (or primitive) to evaluate.
 * @param {object} context - Either the StateManager instance (or its interface) in the worker,
 *                           or the snapshot interface on the main thread.
 * @param {number} [depth=0] - Current recursion depth for debugging.
 * @param {object|null} [localScope=null] - Local variable scope for parameter resolution.
 * @returns {boolean|any} - The result of the rule evaluation.
 */
export const evaluateRule = (rule, context, depth = 0, localScope = null) => {
  // Profile top-level calls only (depth 0) to minimize overhead
  const shouldProfile = depth === 0 && profiler.enabled;
  if (shouldProfile) {
    profiler.start('evaluateRule');
  }

  try {
    return _evaluateRuleImpl(rule, context, depth, localScope);
  } finally {
    if (shouldProfile) {
      profiler.end('evaluateRule');
    }
  }
};

// Build handler map at module load time.
// evaluateRule is already defined above; handlers call it at runtime via closure.
const handlers = Object.assign({},
  createLogicHandlers(evaluateRule),
  createCheckHandlers(evaluateRule),
  createAttributeHandlers(evaluateRule),
  createFunctionCallHandlers(evaluateRule),
  createCollectionHandlers(evaluateRule),
  createImperativeHandlers(evaluateRule),
  createReachabilityHandlers(evaluateRule),
  createHelperHandlers(evaluateRule),
);

const evaluateRuleBuilderRule = createRuleBuilderEvaluator(evaluateRule);

// Internal implementation of evaluateRule
const _evaluateRuleImpl = (rule, context, depth, localScope) => {
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

  // Handle arrays directly - they're literal values, not rules
  // This happens when Compare rules have raw arrays for placement lookups like ["Item", 1]
  if (Array.isArray(rule)) {
    return rule;
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

  // Detect Rule Builder format: has 'rule' key but no 'type' key
  // Rule Builder format: {"rule": "Has", "options": [], "args": {"item_name": "Sword"}}
  // AST format: {"type": "item_check", "item": "Sword"}
  if (rule.rule && !rule.type) {
    let rbResult = evaluateRuleBuilderRule(rule, context, depth, localScope);

    // Handle SMBool objects from SM helpers at depth 0
    // Convert to boolean based on maxDiff check
    if (depth === 0 && rbResult && typeof rbResult === 'object' && 'bool' in rbResult && 'difficulty' in rbResult) {
      let maxDiff = 50; // Default to hardcore for Super Metroid
      if (typeof context?.getPlayerId === 'function' && typeof context?.resolveName === 'function') {
        const playerId = context.getPlayerId();
        const state = context.resolveName('state');
        if (state?.smbm?.[playerId]?.maxDiff !== undefined) {
          maxDiff = state.smbm[playerId].maxDiff;
        }
      }
      rbResult = rbResult.bool === true && rbResult.difficulty <= maxDiff;
    }

    // If the result is itself a rule object (has 'type' property that is a string), evaluate it recursively
    // This handles helpers that return rules (e.g., get_prison_keeper_rules returns a compare rule)
    // Note: We check typeof type === 'string' because data objects like regionRef have numeric 'type' fields
    // that represent data (region types) rather than rule types
    if (rbResult && typeof rbResult === 'object' && typeof rbResult.type === 'string' && !('__isReturn' in rbResult)) {
      rbResult = evaluateRule(rbResult, context, depth + 1, localScope);
    }

    return rbResult;
  }

  // Handle plain object literals (dicts) that are not rules
  // These are literal values passed as arguments to helpers (e.g., location data dicts)
  // They have neither 'type' (AST format) nor 'rule' (Rule Builder format) properties
  if (!rule.type && !rule.rule) {
    return rule;
  }

  let result;
  let ruleType = rule?.type;

  try {
    // Dispatch to handler
    const handler = handlers[ruleType];
    if (handler) {
      result = handler(rule, context, depth, localScope, isValidContext);
    } else {
      log('warn', `[evaluateRule] Unknown rule type: ${ruleType}`, { rule });
      result = undefined;
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

  // At depth 0 (top-level rule), unwrap return markers from block rules
  // Block rules with return statements produce {__isReturn: true, value: X}
  // which needs to be unwrapped to get the actual value
  // Note: This MUST only happen at depth 0 to preserve nested block return behavior
  if (depth === 0 && result && typeof result === 'object' && result.__isReturn) {
    result = result.value;
  }

  // At depth 0 (top-level rule), convert SMBool to boolean with difficulty check
  // This ensures difficulty is properly checked against maxDiff for SM games
  // when the top-level rule is 'and', 'or', or any rule type returning SMBool
  if (depth === 0 && result && typeof result === 'object' && 'bool' in result && 'difficulty' in result) {
    let maxDiff = 50; // Default to hardcore for Super Metroid
    if (typeof context?.getPlayerId === 'function' && typeof context?.resolveName === 'function') {
      const playerId = context.getPlayerId();
      const state = context.resolveName('state');
      if (state?.smbm?.[playerId]?.maxDiff !== undefined) {
        maxDiff = state.smbm[playerId].maxDiff;
      }
    }
    result = result.bool === true && result.difficulty <= maxDiff;
  }

  return result;
};
