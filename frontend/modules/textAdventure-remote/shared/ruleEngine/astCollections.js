/**
 * Collection and iteration AST handlers.
 *
 * Handles: all_of, any_of, sum_of, generator_expression,
 * min, max, sum, map, lambda, list, set, index, subscript, slice
 *
 * @module shared/ruleEngine/astCollections
 */

import { log, createBoundContext } from './helpers.js';

export function createCollectionHandlers(evaluateRule) {
  const handlers = {
    'min': (rule, context, depth, localScope, isValidContext) => {
      if (rule.iterable) {
        const minIterable = evaluateRule(rule.iterable, context, depth + 1, localScope);
        if (minIterable === undefined) return undefined;
        if (Array.isArray(minIterable)) {
          if (minIterable.length === 0) {
            log('debug', '[evaluateRule] min called on empty iterable', { rule });
            return undefined;
          }
          if (minIterable.some((v) => v === undefined)) return undefined;
          return Math.min(...minIterable);
        } else if (typeof minIterable === 'number') {
          return minIterable;
        }
        log('warn', '[evaluateRule] min iterable is not an array or number', { minIterable, rule });
        return undefined;
      }
      if (!rule.args || rule.args.length === 0) {
        log('warn', '[evaluateRule] min rule has no arguments or iterable', { rule });
        return undefined;
      }
      const minArgs = rule.args.map((arg) => evaluateRule(arg, context, depth + 1, localScope));
      if (minArgs.some((arg) => arg === undefined)) return undefined;
      return Math.min(...minArgs);
    },

    'max': (rule, context, depth, localScope, isValidContext) => {
      if (rule.iterable) {
        const maxIterable = evaluateRule(rule.iterable, context, depth + 1, localScope);
        if (maxIterable === undefined) return undefined;
        if (Array.isArray(maxIterable)) {
          if (maxIterable.length === 0) {
            log('debug', '[evaluateRule] max called on empty iterable', { rule });
            return undefined;
          }
          if (maxIterable.some((v) => v === undefined)) return undefined;
          return Math.max(...maxIterable);
        } else if (typeof maxIterable === 'number') {
          return maxIterable;
        }
        log('warn', '[evaluateRule] max iterable is not an array or number', { maxIterable, rule });
        return undefined;
      }
      if (!rule.args || rule.args.length === 0) {
        log('warn', '[evaluateRule] max rule has no arguments or iterable', { rule });
        return undefined;
      }
      const maxArgs = rule.args.map((arg) => evaluateRule(arg, context, depth + 1, localScope));
      if (maxArgs.some((arg) => arg === undefined)) return undefined;
      return Math.max(...maxArgs);
    },

    'sum': (rule, context, depth, localScope, isValidContext) => {
      if (!rule.iterable) {
        log('warn', '[evaluateRule] sum rule has no iterable', { rule });
        return 0;
      }
      const sumIterable = evaluateRule(rule.iterable, context, depth + 1, localScope);
      const startValue = rule.start !== undefined
        ? evaluateRule(rule.start, context, depth + 1, localScope)
        : 0;

      if (sumIterable === undefined) return undefined;
      if (startValue === undefined) return undefined;

      if (Array.isArray(sumIterable)) {
        if (sumIterable.some((v) => v === undefined)) return undefined;
        return sumIterable.reduce((acc, val) => {
          if (typeof val === 'number') return acc + val;
          if (typeof val === 'boolean') return acc + (val ? 1 : 0);
          return acc;
        }, startValue);
      } else if (typeof sumIterable === 'number') {
        return sumIterable + startValue;
      }
      log('warn', '[evaluateRule] sum iterable is not an array or number', { sumIterable, rule });
      return undefined;
    },

    'map': (rule, context, depth, localScope, isValidContext) => {
      if (!rule.function || !rule.iterable) {
        log('warn', '[evaluateRule] map rule missing function or iterable', { rule });
        return undefined;
      }

      const mapIterable = evaluateRule(rule.iterable, context, depth + 1, localScope);
      if (mapIterable === undefined) return undefined;

      if (!Array.isArray(mapIterable)) {
        log('warn', '[evaluateRule] map iterable is not an array', { mapIterable, rule });
        return undefined;
      }

      const mapFunc = rule.function;
      const mappedResults = [];

      for (const item of mapIterable) {
        const lambdaScope = localScope ? { ...localScope } : {};

        if (mapFunc.type === 'lambda' && mapFunc.params && mapFunc.params.length > 0) {
          lambdaScope[mapFunc.params[0]] = item;
          const mappedValue = evaluateRule(mapFunc.body, context, depth + 1, lambdaScope);
          mappedResults.push(mappedValue);
        } else {
          log('warn', '[evaluateRule] map function is not a lambda with params', { mapFunc });
          mappedResults.push(undefined);
        }
      }

      if (mappedResults.some((v) => v === undefined)) return undefined;
      return mappedResults;
    },

    'lambda': (rule, context, depth, localScope, isValidContext) => {
      log('debug', '[evaluateRule] Lambda encountered directly - returning function representation');
      return rule;
    },

    'list': (rule, context, depth, localScope, isValidContext) => {
      if (!Array.isArray(rule.value)) {
        log('warn', '[evaluateRule] List rule does not have an array value:', rule);
        return undefined;
      }
      const evaluatedList = rule.value.map((itemRule) =>
        evaluateRule(itemRule, context, depth + 1)
      );
      return evaluatedList.some((item) => item === undefined)
        ? undefined
        : evaluatedList;
    },

    'set': (rule, context, depth, localScope, isValidContext) => {
      if (!Array.isArray(rule.elements)) {
        log('warn', '[evaluateRule] Set rule does not have an elements array:', rule);
        return undefined;
      }
      const evaluatedSet = rule.elements.map((itemRule) =>
        evaluateRule(itemRule, context, depth + 1)
      );
      const uniqueSet = [...new Set(evaluatedSet)];
      return evaluatedSet.some((item) => item === undefined)
        ? undefined
        : uniqueSet;
    },

    'all_of': (rule, context, depth, localScope, isValidContext) => {
      if (!rule.element_rule) {
        log('warn', '[evaluateRule] all_of rule missing element_rule', { rule });
        return undefined;
      }

      let iterable;
      if (rule.iterator_info && rule.iterator_info.iterator) {
        iterable = evaluateRule(rule.iterator_info.iterator, context, depth + 1, localScope);
      } else if (rule.iterable) {
        iterable = evaluateRule(rule.iterable, context, depth + 1, localScope);
      } else {
        log('warn', '[evaluateRule] all_of rule missing iterator information', { rule });
        return undefined;
      }

      if (!Array.isArray(iterable)) {
        if (iterable && typeof iterable === 'object') {
          iterable = Object.keys(iterable);
          log('debug', '[evaluateRule] all_of: converted object to keys array', { keys: iterable });
        } else {
          log('warn', '[evaluateRule] all_of iterator is not an array or object', { rule, iterable });
          return false;
        }
      }

      let result = true;
      for (const item of iterable) {
        const boundContext = createBoundContext(context, rule.iterator_info, item);
        const itemResult = evaluateRule(rule.element_rule, boundContext, depth + 1, localScope);
        if (itemResult === false) {
          result = false;
          break;
        }
        if (itemResult === undefined) {
          result = undefined;
          break;
        }
      }
      return result;
    },

    'any_of': (rule, context, depth, localScope, isValidContext) => {
      if (!rule.element_rule) {
        log('warn', '[evaluateRule] any_of rule missing element_rule', { rule });
        return undefined;
      }

      let iterable;
      if (rule.iterator_info && rule.iterator_info.iterator) {
        iterable = evaluateRule(rule.iterator_info.iterator, context, depth + 1, localScope);
      } else if (rule.iterable) {
        iterable = evaluateRule(rule.iterable, context, depth + 1, localScope);
      } else {
        log('warn', '[evaluateRule] any_of rule missing iterator information', { rule });
        return undefined;
      }

      if (!Array.isArray(iterable)) {
        if (iterable && typeof iterable === 'object') {
          iterable = Object.keys(iterable);
          log('debug', '[evaluateRule] any_of: converted object to keys array', { keys: iterable });
        } else {
          log('debug', '[evaluateRule] any_of iterator is not an array or object (treating as empty)', { rule, iterable });
          return false;
        }
      }

      if (iterable.length === 0) return false;

      let result = false;
      let hasUndefined = false;
      for (const item of iterable) {
        const boundContext = createBoundContext(context, rule.iterator_info, item);
        const itemResult = evaluateRule(rule.element_rule, boundContext, depth + 1, localScope);
        if (itemResult === true) {
          result = true;
          break;
        }
        if (itemResult === undefined) {
          hasUndefined = true;
        }
      }
      if (result === false && hasUndefined) {
        result = undefined;
      }
      return result;
    },

    'sum_of': (rule, context, depth, localScope, isValidContext) => {
      if (!rule.element_rule) {
        log('warn', '[evaluateRule] sum_of rule missing element_rule', { rule });
        return undefined;
      }

      let iterable;
      if (rule.iterator_info && rule.iterator_info.iterator) {
        iterable = evaluateRule(rule.iterator_info.iterator, context, depth + 1, localScope);
      } else if (rule.iterable) {
        iterable = evaluateRule(rule.iterable, context, depth + 1, localScope);
      } else {
        log('warn', '[evaluateRule] sum_of rule missing iterator information', { rule });
        return undefined;
      }

      if (!Array.isArray(iterable)) {
        if (iterable && typeof iterable === 'object') {
          iterable = Object.keys(iterable);
          log('debug', '[evaluateRule] sum_of: converted object to keys array', { keys: iterable });
        } else {
          log('warn', '[evaluateRule] sum_of iterator is not an array or object', { rule, iterable });
          return 0;
        }
      }

      if (iterable.length === 0) return 0;

      const hasCondition = rule.iterator_info && rule.iterator_info.condition;

      let result = 0;
      let sumHasUndefined = false;
      for (const item of iterable) {
        const boundContext = createBoundContext(context, rule.iterator_info, item);

        if (hasCondition) {
          const conditionResult = evaluateRule(rule.iterator_info.condition, boundContext, depth + 1);
          if (conditionResult === undefined) {
            sumHasUndefined = true;
            continue;
          }
          if (!conditionResult) continue;
        }

        const itemResult = evaluateRule(rule.element_rule, boundContext, depth + 1);
        if (itemResult === undefined) {
          sumHasUndefined = true;
        } else if (typeof itemResult === 'number') {
          result += itemResult;
        } else {
          log('debug', '[evaluateRule] sum_of element returned non-numeric value', { item, itemResult });
        }
      }
      if (sumHasUndefined) return undefined;
      return result;
    },

    'generator_expression': (rule, context, depth, localScope, isValidContext) => {
      if (!rule.element) {
        log('warn', '[evaluateRule] generator_expression rule missing element', { rule });
        return undefined;
      }

      if (rule.comprehension && rule.comprehension.iterator) {
        const comp = rule.comprehension;
        const targetName = comp.target?.name;
        const iteratorRule = comp.iterator;
        let conditions = comp.conditions || [];
        if (!Array.isArray(conditions) && comp.condition) {
          conditions = [comp.condition];
        }

        const iteratorValue = evaluateRule(iteratorRule, context, depth + 1, localScope);

        if (!Array.isArray(iteratorValue)) {
          log('debug', '[evaluateRule] generator_expression iterator is not an array', { iteratorValue, rule });
          return [];
        }

        const generatedValues = [];
        for (const item of iteratorValue) {
          const iterationScope = localScope ? { ...localScope } : {};

          const target = comp.target;
          if (target && target.type === 'tuple' && target.elements && Array.isArray(target.elements)) {
            if (Array.isArray(item)) {
              target.elements.forEach((element, index) => {
                if (element.type === 'name' && element.name) {
                  iterationScope[element.name] = item[index];
                }
              });
            }
          } else if (target && target.type === 'list' && Array.isArray(target.value) && Array.isArray(item)) {
            for (let i = 0; i < target.value.length && i < item.length; i++) {
              const targetElem = target.value[i];
              if (targetElem && targetElem.type === 'name' && targetElem.name) {
                iterationScope[targetElem.name] = item[i];
              }
            }
          } else if (targetName) {
            iterationScope[targetName] = item;
          }

          let conditionsPassed = true;
          for (const condRule of conditions) {
            const condResult = evaluateRule(condRule, context, depth + 1, iterationScope);
            if (condResult !== true) {
              conditionsPassed = false;
              break;
            }
          }

          if (conditionsPassed) {
            const elementValue = evaluateRule(rule.element, context, depth + 1, iterationScope);
            generatedValues.push(elementValue);
          }
        }

        return generatedValues;
      } else {
        return evaluateRule(rule.element, context, depth + 1, localScope);
      }
    },

    'index': (rule, context, depth, localScope, isValidContext) => {
      const list = evaluateRule(rule.object || rule.value, context, depth + 1, localScope);
      const index = evaluateRule(rule.index, context, depth + 1, localScope);

      if (list === undefined || index === undefined) {
        return undefined;
      } else if (Array.isArray(list)) {
        const idx = index < 0 ? list.length + index : index;
        return list[idx];
      } else if (typeof list === 'string') {
        const idx = index < 0 ? list.length + index : index;
        return list[idx];
      } else if (list && typeof list === 'object') {
        let result = list[index];
        if (result && typeof result === 'object' && result.type && typeof result.type === 'string') {
          log('debug', `[evaluateRule] Subscript result is a rule object (type: ${result.type}), evaluating recursively`);
          result = evaluateRule(result, context, depth + 1, localScope);
        }
        return result;
      } else {
        log('warn', '[evaluateRule] Subscript applied to non-object/non-map or null value.', { rule, list });
        return undefined;
      }
    },

    'slice': (rule, context, depth, localScope, isValidContext) => {
      const sliceValue = evaluateRule(rule.value, context, depth + 1, localScope);

      if (sliceValue === undefined) return undefined;

      if (!Array.isArray(sliceValue) && typeof sliceValue !== 'string') {
        log('warn', '[evaluateRule] Slice applied to non-array/non-string value', { rule, sliceValue });
        return undefined;
      }

      const lower = rule.lower !== null && rule.lower !== undefined
        ? evaluateRule(rule.lower, context, depth + 1, localScope)
        : undefined;
      const upper = rule.upper !== null && rule.upper !== undefined
        ? evaluateRule(rule.upper, context, depth + 1, localScope)
        : undefined;
      const step = rule.step !== null && rule.step !== undefined
        ? evaluateRule(rule.step, context, depth + 1, localScope)
        : undefined;

      const len = sliceValue.length;

      let start = lower !== undefined ? (lower < 0 ? Math.max(0, len + lower) : lower) : 0;
      let stop = upper !== undefined ? (upper < 0 ? Math.max(0, len + upper) : upper) : len;
      const stepVal = step !== undefined ? step : 1;

      start = Math.max(0, Math.min(len, start));
      stop = Math.max(0, Math.min(len, stop));

      if (stepVal === 0) {
        log('warn', '[evaluateRule] Slice step cannot be 0');
        return undefined;
      }

      if (stepVal === 1) {
        return Array.isArray(sliceValue) ? sliceValue.slice(start, stop) : sliceValue.slice(start, stop);
      } else if (stepVal > 0) {
        const result = [];
        for (let i = start; i < stop; i += stepVal) {
          result.push(sliceValue[i]);
        }
        return result;
      } else {
        const actualStart = lower !== undefined ? lower : len - 1;
        const actualStop = upper !== undefined ? upper : -len - 1;
        const result = [];
        for (let i = actualStart; i > actualStop; i += stepVal) {
          if (i >= 0 && i < len) {
            result.push(sliceValue[i]);
          }
        }
        return result;
      }
    },
  };

  // Add alias
  handlers['subscript'] = handlers['index'];

  return handlers;
}
