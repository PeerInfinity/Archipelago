/**
 * Debug utilities for rule engine.
 *
 * Provides functions for visualizing and debugging rule structures
 * in the console.
 *
 * @module shared/ruleEngine/debug
 */

import { log } from './helpers.js';

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

    case 'region_check':
      if (typeof rule.region === 'string') {
        log('info', `${prefix}Region: ${rule.region}`);
      } else {
        log('info', `${prefix}Region (complex):`);
        debugRule(rule.region, indent + 2);
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

    case 'count_true':
      log(
        'info',
        `${prefix}COUNT_TRUE (at least ${rule.count} of ${
          rule.conditions.length
        } conditions):`
      );
      rule.conditions.forEach((cond, i) => {
        log('info', `${prefix}  Condition ${i + 1}:`);
        debugRule(cond, indent + 4);
      });
      break;

    case 'weighted_count_true': {
      const totalWeight = (rule.weighted_conditions || []).reduce((sum, [, w]) => sum + w, 0);
      log(
        'info',
        `${prefix}WEIGHTED_COUNT_TRUE (at least ${rule.count} of ${totalWeight} weight from ${
          (rule.weighted_conditions || []).length
        } unique conditions):`
      );
      (rule.weighted_conditions || []).forEach(([cond, weight], i) => {
        log('info', `${prefix}  Condition ${i + 1} (weight ${weight}):`);
        debugRule(cond, indent + 4);
      });
      break;
    }

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

export function extractFunctionChain(node) {
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
