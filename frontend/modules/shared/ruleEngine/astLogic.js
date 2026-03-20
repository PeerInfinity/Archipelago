/**
 * Logic and comparison AST handlers.
 *
 * Handles: and, or, not, conditional, dict_lambda_lookup,
 * comparison/compare, binop/binary_op, negate
 *
 * @module shared/ruleEngine/astLogic
 */

import { log } from './helpers.js';

export function createLogicHandlers(evaluateRule) {
  const handlers = {
    'and': (rule, context, depth, localScope, isValidContext) => {
      let result = true;
      let hasUndefined = false;
      let hasSMBool = false;
      let totalDifficulty = 0;
      for (const condition of rule.conditions || []) {
        let conditionResult = evaluateRule(condition, context, depth + 1, localScope);
        if (conditionResult && typeof conditionResult === 'object' && conditionResult.__isReturn) {
          conditionResult = conditionResult.value;
        }
        let boolValue = conditionResult;
        if (conditionResult && typeof conditionResult === 'object' && 'bool' in conditionResult) {
          boolValue = conditionResult.bool === true;
          hasSMBool = true;
          totalDifficulty += conditionResult.difficulty || 0;
        }
        if (!boolValue && boolValue !== undefined) {
          result = false;
          hasUndefined = false;
          break;
        }
        if (boolValue === undefined) {
          hasUndefined = true;
        }
      }
      if (result === true && hasUndefined) {
        result = undefined;
      }
      if (result === true && hasSMBool) {
        result = { bool: true, difficulty: totalDifficulty };
      }
      return result;
    },

    'or': (rule, context, depth, localScope, isValidContext) => {
      let result = false;
      let hasUndefined = false;
      let hasSMBool = false;
      let minDifficulty = Infinity;
      for (const condition of rule.conditions || []) {
        let conditionResult = evaluateRule(condition, context, depth + 1, localScope);
        if (conditionResult && typeof conditionResult === 'object' && conditionResult.__isReturn) {
          conditionResult = conditionResult.value;
        }
        let boolValue = conditionResult;
        let difficulty = 0;
        if (conditionResult && typeof conditionResult === 'object' && 'bool' in conditionResult) {
          boolValue = conditionResult.bool === true;
          difficulty = conditionResult.difficulty || 0;
          hasSMBool = true;
        }
        if (boolValue && boolValue !== undefined) {
          result = true;
          if (difficulty < minDifficulty) {
            minDifficulty = difficulty;
          }
          hasUndefined = false;
        }
        if (conditionResult === undefined) {
          hasUndefined = true;
        }
      }
      if (result === false && hasUndefined) {
        result = undefined;
      }
      if (result === true && hasSMBool) {
        result = { bool: true, difficulty: minDifficulty === Infinity ? 0 : minDifficulty };
      }
      return result;
    },

    'not': (rule, context, depth, localScope, isValidContext) => {
      const conditionToNegate = rule.operand || rule.condition;
      if (!conditionToNegate) {
        log('warn', '[evaluateRule Not] Missing operand/condition in not rule:', rule);
        return undefined;
      }
      const operandResult = evaluateRule(conditionToNegate, context, depth + 1, localScope);
      return operandResult === undefined ? undefined : !operandResult;
    },

    'conditional': (rule, context, depth, localScope, isValidContext) => {
      if (!rule.test || !rule.if_true) {
        log('warn', '[evaluateRule Conditional] Malformed conditional rule:', rule);
        return undefined;
      }
      const testResult = evaluateRule(rule.test, context, depth + 1, localScope);
      if (testResult === undefined) {
        return undefined;
      } else if (testResult) {
        return evaluateRule(rule.if_true, context, depth + 1, localScope);
      } else {
        return rule.if_false === null
          ? true
          : evaluateRule(rule.if_false, context, depth + 1, localScope);
      }
    },

    'dict_lambda_lookup': (rule, context, depth, localScope, isValidContext) => {
      if (!rule.key || !rule.cases) {
        log('warn', '[evaluateRule] Malformed dict_lambda_lookup rule:', rule);
        return undefined;
      }
      const lookupKey = evaluateRule(rule.key, context, depth + 1, localScope);
      if (lookupKey === undefined) {
        return undefined;
      } else if (rule.cases.hasOwnProperty(lookupKey)) {
        return evaluateRule(rule.cases[lookupKey], context, depth + 1, localScope);
      } else if (rule.default !== undefined) {
        return evaluateRule(rule.default, context, depth + 1, localScope);
      } else {
        log('debug', `[evaluateRule] dict_lambda_lookup key '${lookupKey}' not found and no default`);
        return undefined;
      }
    },

    'comparison': (rule, context, depth, localScope, isValidContext) => {
      let left = rule.left;
      let right = rule.right;

      if (left && left.type === 'item_check' && left.count === undefined) {
        const itemName = evaluateRule(left.item, context, depth + 1, localScope);
        if (itemName === undefined) {
          left = undefined;
        } else if (typeof context.countItem === 'function') {
          left = context.countItem(itemName) || 0;
        } else {
          log('warn', '[evaluateRule] context.countItem not available for item_check in compare');
          left = undefined;
        }
      } else {
        left = evaluateRule(left, context, depth + 1, localScope);
      }

      if (right && right.type === 'item_check' && right.count === undefined) {
        const itemName = evaluateRule(right.item, context, depth + 1, localScope);
        if (itemName === undefined) {
          right = undefined;
        } else if (typeof context.countItem === 'function') {
          right = context.countItem(itemName) || 0;
        } else {
          log('warn', '[evaluateRule] context.countItem not available for item_check in compare');
          right = undefined;
        }
      } else {
        right = evaluateRule(right, context, depth + 1, localScope);
      }

      if (left && typeof left === 'object' && left.__isReturn) {
        left = left.value;
      }
      if (right && typeof right === 'object' && right.__isReturn) {
        right = right.value;
      }

      const op = rule.op;

      if (left === undefined || right === undefined) {
        return undefined;
      }

      switch (op) {
        case '>':
          return left > right;
        case '<':
          return left < right;
        case '>=':
          return left >= right;
        case '<=':
          return left <= right;
        case '==':
          if (Array.isArray(left) && Array.isArray(right)) {
            return left.length === right.length &&
              left.every((val, index) => val == right[index]);
          }
          return left == right;
        case '!=':
          if (Array.isArray(left) && Array.isArray(right)) {
            return left.length !== right.length ||
              left.some((val, index) => val != right[index]);
          }
          return left != right;
        case 'in':
          if (Array.isArray(right)) {
            if (Array.isArray(left)) {
              return right.some(item => {
                if (Array.isArray(item)) {
                  return item.length === left.length &&
                         item.every((val, index) => val === left[index]);
                }
                return item === left;
              });
            }
            return right.includes(left);
          } else if (typeof right === 'string') {
            return right.includes(left);
          } else if (right instanceof Set) {
            return right.has(left);
          } else if (typeof right === 'object' && right !== null) {
            return left in right;
          }
          log('warn', '[evaluateRule] "in" operator used with invalid right side type:', { left, right });
          return false;
        case 'not in':
          if (Array.isArray(right)) {
            if (Array.isArray(left)) {
              return !right.some(item => {
                if (Array.isArray(item)) {
                  return item.length === left.length &&
                         item.every((val, index) => val === left[index]);
                }
                return item === left;
              });
            }
            return !right.includes(left);
          } else if (typeof right === 'string') {
            return !right.includes(left);
          } else if (right instanceof Set) {
            return !right.has(left);
          } else if (typeof right === 'object' && right !== null) {
            return !(left in right);
          }
          log('warn', '[evaluateRule] "not in" operator used with invalid right side type:', { left, right });
          return true;
        case 'is':
          return left === right;
        case 'is not':
          return left !== right;
        default:
          log('warn', `[evaluateRule] Unsupported comparison operator: ${op}`);
          return undefined;
      }
    },

    'binop': (rule, context, depth, localScope, isValidContext) => {
      let left = evaluateRule(rule.left, context, depth + 1, localScope);
      let right = evaluateRule(rule.right, context, depth + 1, localScope);
      const op = rule.op;

      if (left && typeof left === 'object' && left.__isReturn) {
        left = left.value;
      }
      if (right && typeof right === 'object' && right.__isReturn) {
        right = right.value;
      }

      if (left === undefined || right === undefined) {
        return undefined;
      }

      switch (op) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          if (Array.isArray(left) && typeof right === 'number') {
            const result = [];
            for (let i = 0; i < right; i++) {
              result.push(...left);
            }
            return result;
          }
          return left * right;
        case '/':
          return right !== 0 ? left / right : undefined;
        case '//':
          return right !== 0 ? Math.floor(left / right) : undefined;
        case '==':
          return left == right;
        case '!=':
          return left != right;
        case '<':
          return left < right;
        case '>':
          return left > right;
        case '<=':
          return left <= right;
        case '>=':
          return left >= right;
        case 'AND':
        case 'and':
          return left && right;
        case 'OR':
        case 'or':
          return left || right;
        case '**':
          return Math.pow(left, right);
        case '%':
          return right !== 0 ? left % right : undefined;
        case '&':
          if (typeof left === 'boolean' && typeof right === 'boolean') {
            return left && right;
          } else if (typeof left === 'number' && typeof right === 'number') {
            return left & right;
          }
          return Boolean(left) && Boolean(right);
        case '|':
          if (typeof left === 'boolean' && typeof right === 'boolean') {
            return left || right;
          } else if (typeof left === 'number' && typeof right === 'number') {
            return left | right;
          }
          return Boolean(left) || Boolean(right);
        case '^':
          if (typeof left === 'number' && typeof right === 'number') {
            return left ^ right;
          }
          return Boolean(left) !== Boolean(right);
        default:
          log('warn', `[evaluateRule] Unknown binary_op operator: ${op}`, { rule });
          return undefined;
      }
    },

    'negate': (rule, context, depth, localScope, isValidContext) => {
      const operand = evaluateRule(rule.operand, context, depth + 1, localScope);
      if (operand === undefined) {
        return undefined;
      } else if (typeof operand === 'number') {
        return -operand;
      }
      log('warn', '[evaluateRule] negate operand is not a number:', { operand, rule });
      return undefined;
    },
  };

  // Add aliases
  handlers['compare'] = handlers['comparison'];
  handlers['binary_op'] = handlers['binop'];

  return handlers;
}
