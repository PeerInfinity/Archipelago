import { evaluateRule } from '../shared/ruleEngine.js';

/**
 * Test Spoiler Rule Evaluator
 * 
 * Provides detailed rule analysis and evaluation specifically for the test spoiler system.
 * This module contains the complex rule evaluation logic that was extracted from testSpoilerUI.js
 * to improve code organization and maintainability.
 *
 * @module spoilerTest/testSpoilerRuleEvaluator
 */
export class TestSpoilerRuleEvaluator {
  /**
   * @param {Function} logFunction - Function to call for logging output (usually this.log from the UI)
   */
  constructor(logFunction) {
    this.log = logFunction;
  }

  /**
   * Analyzes a rule tree recursively, providing detailed logging about each rule evaluation.
   * This method is primarily used for debugging and understanding why certain rules pass or fail.
   *
   * @param {Object} rule - The rule to analyze
   * @param {Object} snapshotInterface - Interface to the current game state snapshot
   * @param {string} indent - Current indentation level for display
   * @param {number} depth - Current recursion depth (to prevent infinite loops)
   * @returns {*} The result of evaluating the rule
   */
  analyzeRuleTree(rule, snapshotInterface, indent = '', depth = 0) {
    if (depth > 10) {
      this.log('warn', `${indent}[MAX DEPTH REACHED]`);
      return;
    }

    if (!rule || typeof rule !== 'object') {
      this.log('warn', `${indent}[INVALID RULE]: ${JSON.stringify(rule)}`);
      return false;
    }

    // Detect Rule Builder format: has 'rule' key but no 'type' key
    // Rule Builder format: {"rule": "HasFromList", "options": [], "args": {...}}
    // AST format: {"type": "item_check", "item": "Sword"}
    const isRuleBuilderFormat = rule.rule && !rule.type;
    const ruleType = isRuleBuilderFormat ? rule.rule : rule.type;
    let result;

    try {
      result = evaluateRule(rule, snapshotInterface);
      const resultSymbol = result === true ? '✓' : result === false ? '✗' : result === undefined ? '?' : result;

      // Handle Rule Builder format rules with special logging
      if (isRuleBuilderFormat) {
        this.log('info', `${indent}RULE_BUILDER ${rule.rule} (${resultSymbol}):`);
        if (rule.args) {
          this.log('info', `${indent}  args: ${JSON.stringify(rule.args)}`);
        }
        if (rule.children && rule.children.length > 0) {
          this.log('info', `${indent}  children (${rule.children.length}):`);
          for (let i = 0; i < rule.children.length; i++) {
            const childResult = this.analyzeRuleTree(rule.children[i], snapshotInterface, indent + '    ', depth + 1);
            this.log('info', `${indent}    Child ${i + 1}: ${childResult} ${childResult === true ? '✓' : childResult === false ? '✗' : '?'}`);
          }
        }
        if (rule.child) {
          this.log('info', `${indent}  child:`);
          this.analyzeRuleTree(rule.child, snapshotInterface, indent + '    ', depth + 1);
        }
        return result;
      }

      switch (ruleType) {
        case 'and':
          this.log('info', `${indent}AND (${resultSymbol}):`);
          if (rule.conditions && Array.isArray(rule.conditions)) {
            for (let i = 0; i < rule.conditions.length; i++) {
              const condition = rule.conditions[i];
              const conditionResult = this.analyzeRuleTree(condition, snapshotInterface, indent + '  ', depth + 1);
              this.log('info', `${indent}  Condition ${i + 1}: ${conditionResult} ${conditionResult === true ? '✓' : conditionResult === false ? '✗' : '?'}`);
            }
          }
          break;
          
        case 'or':
          this.log('info', `${indent}OR (${resultSymbol}):`);
          if (rule.conditions && Array.isArray(rule.conditions)) {
            for (let i = 0; i < rule.conditions.length; i++) {
              const condition = rule.conditions[i];
              const conditionResult = this.analyzeRuleTree(condition, snapshotInterface, indent + '  ', depth + 1);
              this.log('info', `${indent}  Condition ${i + 1}: ${conditionResult} ${conditionResult === true ? '✓' : conditionResult === false ? '✗' : '?'}`);
            }
          }
          break;
          
        case 'not':
          this.log('info', `${indent}NOT (${resultSymbol}):`);
          if (rule.operand) {
            const operandResult = this.analyzeRuleTree(rule.operand, snapshotInterface, indent + '  ', depth + 1);
            this.log('info', `${indent}  Operand: ${operandResult} → NOT = ${result}`);
          }
          break;
          
        case 'item_check':
          let itemName, hasItem;
          try {
            itemName = evaluateRule(rule.item, snapshotInterface);
            hasItem = snapshotInterface.hasItem ? snapshotInterface.hasItem(itemName) : false;
            this.log('info', `${indent}HAS_ITEM "${itemName}": ${hasItem} (${resultSymbol})`);
            
            // Show inventory state for debugging
            if (snapshotInterface.countItem) {
              const currentCount = snapshotInterface.countItem(itemName);
              this.log('info', `${indent}  Current inventory count for "${itemName}": ${currentCount}`);
            }
          } catch (itemError) {
            this.log('error', `${indent}HAS_ITEM evaluation error: ${itemError.message}`);
            this.log('info', `${indent}  Rule.item: ${JSON.stringify(rule.item)}`);
          }
          break;
          
        case 'count_check':
          let countItemName, countRequired, currentCount;
          try {
            countItemName = evaluateRule(rule.item, snapshotInterface);
            countRequired = rule.count ? evaluateRule(rule.count, snapshotInterface) : 1;
            currentCount = snapshotInterface.countItem ? snapshotInterface.countItem(countItemName) : 0;
            this.log('info', `${indent}COUNT_ITEM "${countItemName}": ${currentCount} >= ${countRequired} = ${currentCount >= countRequired} (${resultSymbol})`);
          } catch (countError) {
            this.log('error', `${indent}COUNT_ITEM evaluation error: ${countError.message}`);
            this.log('info', `${indent}  Rule.item: ${JSON.stringify(rule.item)}`);
            this.log('info', `${indent}  Rule.count: ${JSON.stringify(rule.count)}`);
          }
          break;
          
        case 'helper':
          const helperName = rule.name;
          let args = [];
          try {
            args = rule.args ? rule.args.map(arg => evaluateRule(arg, snapshotInterface)) : [];
            this.log('info', `${indent}HELPER ${helperName}(${args.map(a => JSON.stringify(a)).join(', ')}): ${resultSymbol}`);

            // Helper functions are evaluated via evaluateRule() which:
            // 1. First checks for helper definitions in rules.json (staticData.helpers)
            // 2. Falls back to executeHelper() for JS helper functions if definition returns undefined
            // The 'result' variable already contains the evaluated result.

            if (result === false) {
              this.log('info', `${indent}  Helper returned false`);
            }

            if (result === undefined) {
              this.log('info', `${indent}  Helper returned undefined`);
              this.log('info', `${indent}    Args evaluated to: ${args.map(a => `${typeof a}: ${JSON.stringify(a)}`).join(', ')}`);
            }
          } catch (helperError) {
            this.log('error', `${indent}HELPER evaluation error: ${helperError.message}`);
            this.log('info', `${indent}  Helper name: ${helperName}`);
            this.log('info', `${indent}  Raw args: ${JSON.stringify(rule.args)}`);
            this.log('info', `${indent}  Error stack: ${helperError.stack}`);
          }
          break;
          
        case 'attribute':
          let objectValue;
          try {
            if (rule.object) {
              this.log('info', `${indent}ATTRIBUTE ${rule.attr} (${resultSymbol}):`);
              objectValue = this.analyzeRuleTree(rule.object, snapshotInterface, indent + '  ', depth + 1);
              this.log('info', `${indent}  Object value: ${JSON.stringify(objectValue)}`);
              
              if (objectValue && typeof objectValue === 'object') {
                this.log('info', `${indent}  Attribute "${rule.attr}" value: ${JSON.stringify(objectValue[rule.attr])}`);
              } else {
                this.log('info', `${indent}  Cannot access attribute "${rule.attr}" on non-object: ${JSON.stringify(objectValue)}`);
              }
            } else {
              this.log('info', `${indent}ATTRIBUTE ${rule.attr} (${resultSymbol}) - no object specified`);
            }
          } catch (attrError) {
            this.log('error', `${indent}ATTRIBUTE evaluation error: ${attrError.message}`);
            this.log('info', `${indent}  Rule.object: ${JSON.stringify(rule.object)}`);
            this.log('info', `${indent}  Rule.attr: ${rule.attr}`);
          }
          break;
          
        case 'function_call':
          let funcObj;
          try {
            this.log('info', `${indent}FUNCTION_CALL (${resultSymbol}):`);
            
            funcObj = rule.function ? evaluateRule(rule.function, snapshotInterface) : null;
            this.log('info', `${indent}  Function object: ${JSON.stringify(funcObj)}`);
            this.log('info', `${indent}  Function type: ${typeof funcObj}`);
            
            if (rule.function) {
              this.analyzeRuleTree(rule.function, snapshotInterface, indent + '  ', depth + 1);
            }
            
            if (rule.args && rule.args.length > 0) {
              this.log('info', `${indent}  Function arguments:`);
              for (let i = 0; i < rule.args.length; i++) {
                const argResult = this.analyzeRuleTree(rule.args[i], snapshotInterface, indent + '    ', depth + 1);
                this.log('info', `${indent}    Arg ${i + 1}: ${JSON.stringify(argResult)}`);
              }
            }
            
            this.log('info', `${indent}  Final result: ${JSON.stringify(result)}`);
          } catch (funcError) {
            this.log('error', `${indent}FUNCTION_CALL evaluation error: ${funcError.message}`);
            this.log('info', `${indent}  Function rule: ${JSON.stringify(rule.function)}`);
            this.log('info', `${indent}  Args rule: ${JSON.stringify(rule.args)}`);
          }
          break;
          
        case 'identifier':
          this.log('info', `${indent}IDENTIFIER "${rule.name}": ${resultSymbol}`);
          // Check if identifier exists in context (use resolveName for proper resolution)
          const identifierValue = snapshotInterface.resolveName ? snapshotInterface.resolveName(rule.name) : snapshotInterface[rule.name];
          if (identifierValue !== undefined) {
            this.log('info', `${indent}  Identifier "${rule.name}" resolves to: ${JSON.stringify(identifierValue)}`);
          } else {
            this.log('warn', `${indent}  Identifier "${rule.name}" resolved to undefined`);
          }
          break;
          
        case 'literal':
          this.log('info', `${indent}LITERAL: ${JSON.stringify(rule.value)} (${resultSymbol})`);
          break;
          
        case 'name':
          this.log('info', `${indent}NAME: ${resultSymbol}`);
          this.log('info', `${indent}  name: ${rule.name}`);
          // Check what this name resolves to (use resolveName for proper resolution)
          const nameValue = snapshotInterface.resolveName ? snapshotInterface.resolveName(rule.name) : snapshotInterface[rule.name];
          if (nameValue !== undefined) {
            this.log('info', `${indent}  Resolves to: ${JSON.stringify(nameValue)}`);
          } else {
            this.log('warn', `${indent}  Name "${rule.name}" resolved to undefined`);
          }
          break;

        case 'conditional':
          this.log('info', `${indent}CONDITIONAL (${resultSymbol}):`);
          if (rule.test) {
            this.log('info', `${indent}  Test condition:`);
            const testResult = this.analyzeRuleTree(rule.test, snapshotInterface, indent + '    ', depth + 1);
            this.log('info', `${indent}  Test result: ${testResult} (${testResult === true ? '✓' : testResult === false ? '✗' : '?'})`);
            
            if (testResult === true && rule.if_true) {
              this.log('info', `${indent}  Executing IF_TRUE branch:`);
              this.analyzeRuleTree(rule.if_true, snapshotInterface, indent + '    ', depth + 1);
            } else if (testResult === false) {
              if (rule.if_false) {
                this.log('info', `${indent}  Executing IF_FALSE branch:`);
                this.analyzeRuleTree(rule.if_false, snapshotInterface, indent + '    ', depth + 1);
              } else if (rule.if_false === null) {
                this.log('info', `${indent}  IF_FALSE branch is null (evaluates to true - no additional requirements)`);
              } else {
                this.log('info', `${indent}  No IF_FALSE branch defined (evaluates to undefined)`);
              }
            } else {
              this.log('info', `${indent}  Test result is undefined - conditional result is undefined`);
            }
          } else {
            this.log('error', `${indent}  Missing test condition in conditional rule`);
          }
          break;
          
        default:
          this.log('info', `${indent}${ruleType.toUpperCase()}: ${resultSymbol}`);
          // Try to show some basic info about the rule
          if (rule.name) this.log('info', `${indent}  name: ${rule.name}`);
          if (rule.value !== undefined) this.log('info', `${indent}  value: ${JSON.stringify(rule.value)}`);
          this.log('info', `${indent}  Full rule: ${JSON.stringify(rule)}`);
          break;
      }
      
    } catch (error) {
      this.log('error', `${indent}ERROR evaluating ${ruleType}: ${error.message}`);
      this.log('error', `${indent}  Error stack: ${error.stack}`);
      this.log('info', `${indent}  Full rule causing error: ${JSON.stringify(rule)}`);
    }
    
    return result;
  }

}

export default TestSpoilerRuleEvaluator;