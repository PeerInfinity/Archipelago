import { evaluateRule } from '../shared/ruleEngine.js';

/**
 * Test Spoiler Rule Evaluator
 * 
 * Provides detailed rule analysis and evaluation specifically for the test spoiler system.
 * This module contains the complex rule evaluation logic that was extracted from testSpoilerUI.js
 * to improve code organization and maintainability.
 *
 * @module testSpoilers/testSpoilerRuleEvaluator
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

    const ruleType = rule.type;
    let result;
    let evaluationError = null;
    
    try {
      result = evaluateRule(rule, snapshotInterface);
      const resultSymbol = result === true ? '✓' : result === false ? '✗' : result === undefined ? '?' : result;
      
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
            
            // Check if helper function exists
            if (snapshotInterface[helperName]) {
              this.log('info', `${indent}  Helper function "${helperName}" found in snapshotInterface`);
              
              // Add specific analysis for commonly problematic helper functions
              if (result === false) {
                this.log('info', `${indent}  Helper function returned false - analyzing why:`);
                
                // Special analysis for medallion helpers
                if (helperName.includes('medallion')) {
                  this._analyzeMedallionHelper(helperName, snapshotInterface, indent);
                }
                
                // Special analysis for weapon/sword helpers
                if (helperName.includes('sword') || helperName === 'has_sword') {
                  this._analyzeSwordHelper(helperName, snapshotInterface, indent);
                }
                
                // Special analysis for item requirement helpers
                if (helperName.includes('has_') && !helperName.includes('medallion') && !helperName.includes('sword')) {
                  this._analyzeItemHelper(helperName, snapshotInterface, indent);
                }
              }
              
              // Add specific analysis for undefined results (common issue with complex helpers)
              if (result === undefined) {
                this.log('info', `${indent}  Helper function returned undefined - analyzing why:`);
                this.log('info', `${indent}    Args evaluated to: ${args.map(a => `${typeof a}: ${JSON.stringify(a)}`).join(', ')}`);
                
                // Special analysis for item_name_in_location_names helper
                if (helperName === 'item_name_in_location_names') {
                  this._analyzeItemNameInLocationNamesHelper(args, snapshotInterface, indent);
                }
                
                // Special analysis for zip helper
                if (helperName === 'zip') {
                  this._analyzeZipHelper(args, snapshotInterface, indent);
                }
                
                // Special analysis for len helper
                if (helperName === 'len') {
                  this._analyzeLenHelper(args, snapshotInterface, indent);
                }
              }
            } else {
              this.log('error', `${indent}  Helper function "${helperName}" NOT FOUND in snapshotInterface`);
              this.log('info', `${indent}  Available helper functions: ${Object.keys(snapshotInterface).filter(k => typeof snapshotInterface[k] === 'function').join(', ')}`);
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
          // Check if identifier exists in context
          if (snapshotInterface[rule.name] !== undefined) {
            this.log('info', `${indent}  Identifier "${rule.name}" found: ${JSON.stringify(snapshotInterface[rule.name])}`);
          } else {
            this.log('error', `${indent}  Identifier "${rule.name}" NOT FOUND in context`);
            this.log('info', `${indent}  Available identifiers: ${Object.keys(snapshotInterface).join(', ')}`);
          }
          break;
          
        case 'literal':
          this.log('info', `${indent}LITERAL: ${JSON.stringify(rule.value)} (${resultSymbol})`);
          break;
          
        case 'name':
          this.log('info', `${indent}NAME: ${resultSymbol}`);
          this.log('info', `${indent}  name: ${rule.name}`);
          // Check what this name resolves to
          if (snapshotInterface[rule.name] !== undefined) {
            this.log('info', `${indent}  Resolves to: ${JSON.stringify(snapshotInterface[rule.name])}`);
          } else {
            this.log('error', `${indent}  Name "${rule.name}" NOT FOUND in context`);
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
      evaluationError = error;
      this.log('error', `${indent}ERROR evaluating ${ruleType}: ${error.message}`);
      this.log('error', `${indent}  Error stack: ${error.stack}`);
      this.log('info', `${indent}  Full rule causing error: ${JSON.stringify(rule)}`);
    }
    
    return result;
  }

  /**
   * Analyzes medallion-specific helper functions
   * @private
   */
  _analyzeMedallionHelper(helperName, snapshotInterface, indent) {
    this.log('info', `${indent}    This is a medallion requirement helper`);
    this.log('info', `${indent}    Check if player has the required medallion item`);
    
    // Show game settings for medallion assignments
    if (snapshotInterface.getSetting) {
      const mmMedallion = snapshotInterface.getSetting('misery_mire_medallion');
      const trMedallion = snapshotInterface.getSetting('turtle_rock_medallion');
      this.log('info', `${indent}    Game settings: misery_mire_medallion=${mmMedallion}, turtle_rock_medallion=${trMedallion}`);
    } else if (snapshotInterface.settings) {
      this.log('info', `${indent}    Settings object available: ${JSON.stringify(snapshotInterface.settings)}`);
    } else {
      this.log('info', `${indent}    No settings interface available for medallion lookup`);
    }
    
    // Try to determine which medallion is required for this specific helper
    if (helperName === 'has_misery_mire_medallion') {
      const mmMedallion = snapshotInterface.getSetting ? snapshotInterface.getSetting('misery_mire_medallion') : null;
      const requiredMedallion = mmMedallion || 'Ether'; // Default to Ether like the helper function
      this.log('info', `${indent}    Misery Mire requires: ${requiredMedallion} (from setting: ${mmMedallion})`);
      
      const hasRequired = snapshotInterface.hasItem ? snapshotInterface.hasItem(requiredMedallion) : false;
      const countRequired = snapshotInterface.countItem ? snapshotInterface.countItem(requiredMedallion) : 0;
      this.log('info', `${indent}    Required medallion ${requiredMedallion}: ${hasRequired} (count: ${countRequired})`);
    }
    
    // Show all medallions for context
    const medallionItems = ['Ether', 'Bombos', 'Quake'];
    this.log('info', `${indent}    All medallions in inventory:`);
    for (const medallion of medallionItems) {
      const hasThis = snapshotInterface.hasItem ? snapshotInterface.hasItem(medallion) : false;
      const count = snapshotInterface.countItem ? snapshotInterface.countItem(medallion) : 0;
      this.log('info', `${indent}      ${medallion}: ${hasThis} (count: ${count})`);
    }
  }

  /**
   * Analyzes sword/weapon-specific helper functions
   * @private
   */
  _analyzeSwordHelper(helperName, snapshotInterface, indent) {
    this.log('info', `${indent}    This is a sword/weapon requirement helper`);
    const swordItems = ['Fighter Sword', 'Master Sword', 'Tempered Sword', 'Golden Sword'];
    for (const sword of swordItems) {
      const hasThis = snapshotInterface.hasItem ? snapshotInterface.hasItem(sword) : false;
      const count = snapshotInterface.countItem ? snapshotInterface.countItem(sword) : 0;
      this.log('info', `${indent}      ${sword}: ${hasThis} (count: ${count})`);
    }
  }

  /**
   * Analyzes item requirement helper functions
   * @private
   */
  _analyzeItemHelper(helperName, snapshotInterface, indent) {
    const itemName = helperName.replace('has_', '').replace(/_/g, ' ');
    this.log('info', `${indent}    This appears to be an item requirement helper`);
    this.log('info', `${indent}    Possible required item: "${itemName}"`);
    
    // Try variations of the item name
    const itemVariations = [
      itemName,
      itemName.charAt(0).toUpperCase() + itemName.slice(1),
      itemName.replace(/ /g, '_'),
      itemName.replace(/ /g, '')
    ];
    
    for (const variation of itemVariations) {
      const hasThis = snapshotInterface.hasItem ? snapshotInterface.hasItem(variation) : false;
      const count = snapshotInterface.countItem ? snapshotInterface.countItem(variation) : 0;
      if (hasThis || count > 0) {
        this.log('info', `${indent}      Found item "${variation}": ${hasThis} (count: ${count})`);
      }
    }
  }

  /**
   * Analyzes item_name_in_location_names helper function
   * @private
   */
  _analyzeItemNameInLocationNamesHelper(args, snapshotInterface, indent) {
    this.log('info', `${indent}    This is an item_name_in_location_names helper`);
    if (args.length >= 2) {
      const [searchItem, locationPairs] = args;
      this.log('info', `${indent}      Search Item: ${JSON.stringify(searchItem)}`);
      this.log('info', `${indent}      Location Pairs: ${JSON.stringify(locationPairs)}`);
      
      if (Array.isArray(locationPairs)) {
        this.log('info', `${indent}      Checking ${locationPairs.length} location pairs:`);
        locationPairs.forEach((pair, idx) => {
          if (Array.isArray(pair) && pair.length >= 2) {
            const [locationName, playerId] = pair;
            this.log('info', `${indent}        ${idx+1}. Location: "${locationName}", Player: ${playerId}`);
            
            // Try to get the item at this location
            try {
              if (snapshotInterface.location_item_name) {
                const itemAtLocation = snapshotInterface.location_item_name(locationName);
                this.log('info', `${indent}           Item at location: ${JSON.stringify(itemAtLocation)}`);
                if (itemAtLocation && Array.isArray(itemAtLocation)) {
                  const [foundItem, foundPlayer] = itemAtLocation;
                  const matches = foundItem === searchItem && parseInt(foundPlayer) === parseInt(playerId);
                  this.log('info', `${indent}           Match check: ${foundItem} === ${searchItem} && ${foundPlayer} === ${playerId} = ${matches}`);
                }
              } else {
                this.log('info', `${indent}           location_item_name function not available`);
              }
            } catch (error) {
              this.log('error', `${indent}           Error checking location: ${error.message}`);
            }
          } else {
            this.log('info', `${indent}        ${idx+1}. Invalid pair format: ${JSON.stringify(pair)}`);
          }
        });
      } else {
        this.log('info', `${indent}      Location pairs is not an array: ${typeof locationPairs}`);
      }
    } else {
      this.log('info', `${indent}      Insufficient arguments: expected 2, got ${args.length}`);
    }
  }

  /**
   * Analyzes zip helper function  
   * @private
   */
  _analyzeZipHelper(args, snapshotInterface, indent) {
    this.log('info', `${indent}    This is a zip helper`);
    this.log('info', `${indent}      Args count: ${args.length}`);
    args.forEach((arg, idx) => {
      this.log('info', `${indent}        Arg ${idx+1}: ${typeof arg} = ${JSON.stringify(arg)}`);
      if (Array.isArray(arg)) {
        this.log('info', `${indent}          Array length: ${arg.length}`);
        if (arg.length <= 10) { // Don't spam if array is too long
          arg.forEach((item, i) => {
            this.log('info', `${indent}            [${i}]: ${JSON.stringify(item)}`);
          });
        }
      }
    });
  }

  /**
   * Analyzes len helper function
   * @private  
   */
  _analyzeLenHelper(args, snapshotInterface, indent) {
    this.log('info', `${indent}    This is a len helper`);
    if (args.length >= 1) {
      const [target] = args;
      this.log('info', `${indent}      Target: ${typeof target} = ${JSON.stringify(target)}`);
      if (Array.isArray(target)) {
        this.log('info', `${indent}        Array length: ${target.length}`);
      } else if (typeof target === 'string') {
        this.log('info', `${indent}        String length: ${target.length}`);
      } else if (target && typeof target === 'object') {
        this.log('info', `${indent}        Object keys count: ${Object.keys(target).length}`);
      } else {
        this.log('info', `${indent}        Cannot determine length of this type`);
      }
    } else {
      this.log('info', `${indent}      No arguments provided`);
    }
  }
}

export default TestSpoilerRuleEvaluator;