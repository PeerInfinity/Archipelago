// ruleEngine.js
export const evaluateRule = (rule, inventory, depth = 0) => {
  if (!rule) {
      return true;
  }

  const debug = inventory.debug;
  const indent = ' '.repeat(depth * 2);
  
  const log = (message) => {
      if (debug?.log) {
          debug.log(`${indent}${message}`);
      }
  };

  log(`Rule type: ${rule.type}`);

  let result = false;
  switch (rule.type) {
      case 'and':
          log(`Evaluating AND with ${rule.conditions.length} conditions`);
          result = rule.conditions.every((condition, index) => {
              const conditionResult = evaluateRule(condition, inventory, depth + 1);
              log(`AND condition ${index + 1}: ${conditionResult}`);
              return conditionResult;
          });
          break;
          
      case 'or':
          log(`Evaluating OR with ${rule.conditions.length} conditions`);
          result = rule.conditions.some((condition, index) => {
              const conditionResult = evaluateRule(condition, inventory, depth + 1);
              log(`OR condition ${index + 1}: ${conditionResult}`);
              return conditionResult;
          });
          break;
          
      case 'item_check':
          result = rule.item && inventory.has(rule.item);
          log(`Item check ${rule.item}: ${result}`);
          break;
          
      case 'count_check':
          result = rule.item && inventory.count(rule.item) >= (rule.count || 1);
          log(`Count check ${rule.item} (need ${rule.count || 1}): ${result}`);
          break;
          
      case 'group_check':
          result = rule.group && inventory.countGroup(rule.group) >= (rule.count || 1);
          log(`Group check ${rule.group}: ${result}`);
          break;
          
      case 'comparison':
          const leftValue = typeof rule.left === 'object' ? 
              evaluateRule(rule.left, inventory, depth + 1) : rule.left;
          const rightValue = typeof rule.right === 'object' ? 
              evaluateRule(rule.right, inventory, depth + 1) : rule.right;
          
          switch (rule.op) {
              case 'GtE': result = leftValue >= rightValue; break;
              case 'Gt': result = leftValue > rightValue; break;
              case 'LtE': result = leftValue <= rightValue; break;
              case 'Lt': result = leftValue < rightValue; break;
              case 'Eq': result = leftValue === rightValue; break;
              default: result = false;
          }
          log(`Comparison ${rule.op}: ${result}`);
          break;
          
      default:
          log(`Unknown rule type: ${rule.type}`);
          result = false;
  }

  return result;
};