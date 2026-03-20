/**
 * Imperative statement AST handlers.
 *
 * Handles: block, assign, aug_assign, return, for_range, for_iter,
 * while_loop, if_statement, break, continue, method_call, call
 *
 * @module shared/ruleEngine/astImperative
 */

import { log } from './helpers.js';

export function createImperativeHandlers(evaluateRule) {
  return {
    'block': (rule, context, depth, localScope, isValidContext) => {
      if (!Array.isArray(rule.statements)) return undefined;

      const isTopLevelBlock = localScope === null;
      const hasReturnStatement = rule.statements.some(
        stmt => stmt.type === 'return' ||
               (stmt.type === 'if_statement' &&
                (stmt.body?.some(s => s.type === 'return') ||
                 stmt.orelse?.some(s => s.type === 'return')))
      );

      let blockScope;
      if (isTopLevelBlock) {
        blockScope = {};
      } else if (hasReturnStatement) {
        blockScope = Object.assign({}, localScope);
      } else {
        blockScope = localScope;
      }

      let result;
      for (let i = 0; i < rule.statements.length; i++) {
        const stmt = rule.statements[i];
        const stmtResult = evaluateRule(stmt, context, depth + 1, blockScope);

        if (stmtResult && typeof stmtResult === 'object' && stmtResult.__isReturn) {
          result = stmtResult;
          break;
        }
        result = stmtResult;
      }

      if ((isTopLevelBlock || hasReturnStatement) && result && typeof result === 'object' && result.__isReturn) {
        result = result.value;
      }
      return result;
    },

    'assign': (rule, context, depth, localScope, isValidContext) => {
      const varName = rule.var || rule.name;
      if (!varName) return undefined;

      if (localScope === null) {
        log('warn', '[evaluateRule] assign used without local scope');
        return undefined;
      }

      let value = evaluateRule(rule.value, context, depth + 1, localScope);

      if (value && typeof value === 'object' && value.__isReturn) {
        value = value.value;
      }

      if (rule.op && rule.op !== '=') {
        const currentVal = localScope[varName] || 0;
        switch (rule.op) {
          case '+=': localScope[varName] = currentVal + value; break;
          case '-=': localScope[varName] = currentVal - value; break;
          case '*=': localScope[varName] = currentVal * value; break;
          case '/=': localScope[varName] = currentVal / value; break;
          default:
            log('warn', `[evaluateRule] Unknown assignment operator: ${rule.op}`);
            localScope[varName] = value;
        }
      } else {
        localScope[varName] = value;
      }
      return localScope[varName];
    },

    'aug_assign': (rule, context, depth, localScope, isValidContext) => {
      const varName = rule.target;
      if (!varName) return undefined;

      if (localScope === null) {
        log('warn', '[evaluateRule] aug_assign used without local scope');
        return undefined;
      }

      let value = evaluateRule(rule.value, context, depth + 1, localScope);
      const currentVal = localScope[varName] || 0;

      switch (rule.op) {
        case '+': localScope[varName] = currentVal + value; break;
        case '-': localScope[varName] = currentVal - value; break;
        case '*': localScope[varName] = currentVal * value; break;
        case '/': localScope[varName] = currentVal / value; break;
        case '//': localScope[varName] = Math.floor(currentVal / value); break;
        case '%': localScope[varName] = currentVal % value; break;
        default:
          log('warn', `[evaluateRule] Unknown aug_assign operator: ${rule.op}`);
          localScope[varName] = value;
      }
      return localScope[varName];
    },

    'return': (rule, context, depth, localScope, isValidContext) => {
      const returnValue = evaluateRule(rule.value, context, depth + 1, localScope);
      return { __isReturn: true, value: returnValue };
    },

    'for_range': (rule, context, depth, localScope, isValidContext) => {
      let startVal = 0;
      let endVal;

      if (rule.start !== undefined && rule.end !== undefined) {
        startVal = typeof rule.start === 'number'
          ? rule.start
          : evaluateRule(rule.start, context, depth + 1, localScope);
        endVal = typeof rule.end === 'number'
          ? rule.end
          : evaluateRule(rule.end, context, depth + 1, localScope);
      } else {
        const count = typeof rule.count === 'number'
          ? rule.count
          : evaluateRule(rule.count, context, depth + 1, localScope);
        endVal = count;
      }

      if (typeof startVal !== 'number' || typeof endVal !== 'number' ||
          !Number.isFinite(startVal) || !Number.isFinite(endVal)) {
        return undefined;
      }

      if (localScope === null) {
        log('warn', '[evaluateRule] for_range used without local scope');
        return undefined;
      }

      const iterations = endVal - startVal;
      const maxIterations = Math.min(iterations, 1000);
      if (iterations > 1000) {
        log('warn', `[evaluateRule] for_range iterations ${iterations} limited to 1000`);
      }

      let result;
      let breakLoop = false;
      for (let i = startVal; i < startVal + maxIterations && !breakLoop; i++) {
        if (rule.var && rule.var !== '_') {
          localScope[rule.var] = i;
        }

        if (Array.isArray(rule.body)) {
          for (const stmt of rule.body) {
            const stmtResult = evaluateRule(stmt, context, depth + 1, localScope);

            if (stmtResult && typeof stmtResult === 'object' && stmtResult.__isReturn) {
              result = stmtResult;
              breakLoop = true;
              break;
            }
            if (stmtResult && typeof stmtResult === 'object' && stmtResult.__isBreak) {
              breakLoop = true;
              break;
            }
            if (stmtResult && typeof stmtResult === 'object' && stmtResult.__isContinue) {
              break;
            }
          }
        }
      }

      if (!(result && typeof result === 'object' && result.__isReturn)) {
        result = undefined;
      }
      return result;
    },

    'for_iter': (rule, context, depth, localScope, isValidContext) => {
      const iterable = evaluateRule(rule.iterable, context, depth + 1, localScope);

      if (!Array.isArray(iterable)) {
        log('warn', `[evaluateRule] for_iter: iterable is not an array: ${typeof iterable}`);
        return undefined;
      }

      if (localScope === null) {
        log('warn', '[evaluateRule] for_iter used without local scope');
        return undefined;
      }

      const maxIterations = Math.min(iterable.length, 1000);
      if (iterable.length > 1000) {
        log('warn', `[evaluateRule] for_iter iterable length ${iterable.length} limited to 1000`);
      }

      let result;
      let breakIterLoop = false;
      for (let i = 0; i < maxIterations && !breakIterLoop; i++) {
        const item = iterable[i];

        if (rule.vars && Array.isArray(rule.vars)) {
          if (Array.isArray(item)) {
            rule.vars.forEach((varName, idx) => {
              if (varName !== '_') {
                localScope[varName] = item[idx];
              }
            });
          } else {
            log('warn', `[evaluateRule] for_iter: expected array item for tuple unpacking, got ${typeof item}`);
          }
        } else if (rule.var && rule.var !== '_') {
          localScope[rule.var] = item;
        }

        if (Array.isArray(rule.body)) {
          for (const stmt of rule.body) {
            const stmtResult = evaluateRule(stmt, context, depth + 1, localScope);

            if (stmtResult && typeof stmtResult === 'object' && stmtResult.__isReturn) {
              result = stmtResult;
              breakIterLoop = true;
              break;
            }
            if (stmtResult && typeof stmtResult === 'object' && stmtResult.__isBreak) {
              breakIterLoop = true;
              break;
            }
            if (stmtResult && typeof stmtResult === 'object' && stmtResult.__isContinue) {
              break;
            }
          }
        }
      }

      if (!(result && typeof result === 'object' && result.__isReturn)) {
        result = undefined;
      }
      return result;
    },

    'while_loop': (rule, context, depth, localScope, isValidContext) => {
      if (localScope === null) {
        log('warn', '[evaluateRule] while_loop used without local scope');
        return undefined;
      }

      const conditionRule = rule.condition || rule.test;
      if (!conditionRule) {
        log('warn', '[evaluateRule] while_loop missing condition/test');
        return undefined;
      }

      const maxWhileIterations = 1000;
      let whileIterCount = 0;
      let breakWhileLoop = false;
      let result;

      while (!breakWhileLoop && whileIterCount < maxWhileIterations) {
        const conditionResult = evaluateRule(conditionRule, context, depth + 1, localScope);

        if (!conditionResult) break;

        whileIterCount++;

        if (Array.isArray(rule.body)) {
          for (const stmt of rule.body) {
            const stmtResult = evaluateRule(stmt, context, depth + 1, localScope);

            if (stmtResult && typeof stmtResult === 'object' && stmtResult.__isReturn) {
              result = stmtResult;
              breakWhileLoop = true;
              break;
            }
            if (stmtResult && typeof stmtResult === 'object' && stmtResult.__isBreak) {
              breakWhileLoop = true;
              break;
            }
            if (stmtResult && typeof stmtResult === 'object' && stmtResult.__isContinue) {
              break;
            }
          }
        }
      }

      if (whileIterCount >= maxWhileIterations) {
        log('warn', `[evaluateRule] while_loop exceeded max iterations (${maxWhileIterations})`);
      }

      if (!breakWhileLoop && Array.isArray(rule.orelse)) {
        for (const stmt of rule.orelse) {
          const stmtResult = evaluateRule(stmt, context, depth + 1, localScope);
          if (stmtResult && typeof stmtResult === 'object' && stmtResult.__isReturn) {
            result = stmtResult;
            break;
          }
        }
      }

      if (!(result && typeof result === 'object' && result.__isReturn)) {
        result = undefined;
      }
      return result;
    },

    'break': (rule, context, depth, localScope, isValidContext) => {
      return { __isBreak: true };
    },

    'continue': (rule, context, depth, localScope, isValidContext) => {
      return { __isContinue: true };
    },

    'if_statement': (rule, context, depth, localScope, isValidContext) => {
      let testResult = evaluateRule(rule.test, context, depth + 1, localScope);

      if (testResult && typeof testResult === 'object' && testResult.__isReturn) {
        testResult = testResult.value;
      }

      if (testResult === undefined) return undefined;

      const statementsToExecute = testResult ? rule.body : rule.orelse;
      let result;

      if (Array.isArray(statementsToExecute)) {
        for (const stmt of statementsToExecute) {
          const stmtResult = evaluateRule(stmt, context, depth + 1, localScope);

          if (stmtResult && typeof stmtResult === 'object') {
            if (stmtResult.__isReturn || stmtResult.__isBreak || stmtResult.__isContinue) {
              result = stmtResult;
              break;
            }
          }
        }
      }

      if (!(result && typeof result === 'object' &&
            (result.__isReturn || result.__isBreak || result.__isContinue))) {
        result = undefined;
      }
      return result;
    },

    'method_call': (rule, context, depth, localScope, isValidContext) => {
      const obj = evaluateRule(rule.object, context, depth + 1, localScope);
      const args = (rule.args || []).map(arg =>
        evaluateRule(arg, context, depth + 1, localScope)
      );

      if (obj === undefined) return undefined;

      if (Array.isArray(obj)) {
        switch (rule.method) {
          case 'index':
            return obj.indexOf(args[0]);
          case 'count':
            return obj.filter(x => x === args[0]).length;
          case '__contains__':
            return obj.includes(args[0]);
          case 'append':
            obj.push(args[0]);
            return undefined;
          case 'extend':
            if (Array.isArray(args[0])) {
              obj.push(...args[0]);
            }
            return undefined;
          case 'pop':
            return obj.pop();
          case 'clear':
            obj.length = 0;
            return undefined;
          default:
            log('warn', `[evaluateRule] Unknown array method: ${rule.method}`);
            return undefined;
        }
      } else if (typeof obj === 'string') {
        switch (rule.method) {
          case 'index':
            return obj.indexOf(args[0]);
          case '__contains__':
            return obj.includes(args[0]);
          case 'capitalize':
            return obj.length > 0 ? obj.charAt(0).toUpperCase() + obj.slice(1).toLowerCase() : '';
          case 'upper':
            return obj.toUpperCase();
          case 'lower':
            return obj.toLowerCase();
          case 'strip':
            return obj.trim();
          case 'startswith':
            return obj.startsWith(args[0]);
          case 'endswith':
            return obj.endsWith(args[0]);
          default:
            log('warn', `[evaluateRule] Unknown string method: ${rule.method}`);
            return undefined;
        }
      } else if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
        switch (rule.method) {
          case 'items':
            return Object.entries(obj);
          case 'keys':
            return Object.keys(obj);
          case 'values':
            return Object.values(obj);
          case 'get':
            return obj.hasOwnProperty(args[0]) ? obj[args[0]] : (args[1] !== undefined ? args[1] : null);
          case '__contains__':
            return Object.prototype.hasOwnProperty.call(obj, args[0]);
          default:
            log('warn', `[evaluateRule] Unknown dict method: ${rule.method}`);
            return undefined;
        }
      } else {
        log('warn', `[evaluateRule] method_call on unsupported type: ${typeof obj}`);
        return undefined;
      }
    },

    'call': (rule, context, depth, localScope, isValidContext) => {
      const funcName = rule.func;
      const callArgs = rule.args || [];

      const evaluatedArgs = callArgs.map(arg =>
        evaluateRule(arg, context, depth + 1, localScope)
      );

      if (evaluatedArgs.some(arg => arg === undefined)) return undefined;

      switch (funcName) {
        case 'max':
          if (evaluatedArgs.length === 0) return undefined;
          if (evaluatedArgs.length === 1 && Array.isArray(evaluatedArgs[0])) {
            const arr = evaluatedArgs[0];
            return arr.length > 0 ? Math.max(...arr) : undefined;
          }
          return Math.max(...evaluatedArgs);

        case 'min':
          if (evaluatedArgs.length === 0) return undefined;
          if (evaluatedArgs.length === 1 && Array.isArray(evaluatedArgs[0])) {
            const arr = evaluatedArgs[0];
            return arr.length > 0 ? Math.min(...arr) : undefined;
          }
          return Math.min(...evaluatedArgs);

        case 'len':
          if (evaluatedArgs.length === 1) {
            const val = evaluatedArgs[0];
            if (Array.isArray(val)) return val.length;
            if (typeof val === 'string') return val.length;
            if (val && typeof val === 'object') return Object.keys(val).length;
            return undefined;
          }
          return undefined;

        case 'sum':
          if (evaluatedArgs.length === 1 && Array.isArray(evaluatedArgs[0])) {
            return evaluatedArgs[0].reduce((acc, val) => acc + (typeof val === 'number' ? val : 0), 0);
          } else if (evaluatedArgs.length === 2 && Array.isArray(evaluatedArgs[0])) {
            return evaluatedArgs[0].reduce((acc, val) => acc + (typeof val === 'number' ? val : 0), evaluatedArgs[1]);
          }
          return evaluatedArgs.reduce((acc, val) => acc + (typeof val === 'number' ? val : 0), 0);

        case 'abs':
          if (evaluatedArgs.length === 1 && typeof evaluatedArgs[0] === 'number') {
            return Math.abs(evaluatedArgs[0]);
          }
          return undefined;

        case 'int':
          if (evaluatedArgs.length === 1) {
            const val = evaluatedArgs[0];
            if (typeof val === 'number') return Math.trunc(val);
            if (typeof val === 'string') {
              const parsed = parseInt(val, 10);
              return isNaN(parsed) ? undefined : parsed;
            }
            if (typeof val === 'boolean') return val ? 1 : 0;
            return undefined;
          }
          return undefined;

        case 'bool':
          if (evaluatedArgs.length === 1) return Boolean(evaluatedArgs[0]);
          return undefined;

        case 'any':
          if (evaluatedArgs.length === 1 && Array.isArray(evaluatedArgs[0])) {
            return evaluatedArgs[0].some(val => Boolean(val));
          }
          return evaluatedArgs.some(val => Boolean(val));

        case 'all':
          if (evaluatedArgs.length === 1 && Array.isArray(evaluatedArgs[0])) {
            return evaluatedArgs[0].every(val => Boolean(val));
          }
          return evaluatedArgs.every(val => Boolean(val));

        default:
          log('warn', `[evaluateRule] Unknown call function: ${funcName}`, { rule });
          return undefined;
      }
    },
  };
}
