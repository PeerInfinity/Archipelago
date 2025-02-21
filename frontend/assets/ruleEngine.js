// frontend/assets/ruleEngine.js

// Evaluation trace object for capturing debug info
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

function safeLog(message, level = 'debug') {
  if (
    window.consoleManager &&
    typeof window.consoleManager[level] === 'function'
  ) {
    window.consoleManager[level](message);
  } else {
    console[level] ? console[level](message) : console.log(message);
  }
}

export const evaluateRule = (rule, inventory, depth = 0) => {
  if (!rule) {
    return true;
  }

  // Create trace object for this evaluation
  const trace = new RuleTrace(rule, depth);

  // Remove debug logging and just use safeLog
  safeLog(`Evaluating ${rule.type} rule at depth ${depth}`);

  let result = false;
  switch (rule.type) {
    case 'helper': {
      if (
        inventory.helpers &&
        typeof inventory.helpers.executeHelper === 'function'
      ) {
        result = inventory.helpers.executeHelper(
          rule.name,
          ...(rule.args || [])
        );
        safeLog(`Helper ${rule.name} returned: ${result}`, {
          args: rule.args,
          helpers: Object.keys(inventory.helpers),
        });
      } else {
        safeLog(`No helper implementation available for: ${rule.name}`, {
          availableHelpers: inventory.helpers
            ? Object.keys(inventory.helpers)
            : [],
        });
        result = false;
      }
      break;
    }

    case 'and': {
      safeLog(`Evaluating AND with ${rule.conditions.length} conditions`);
      const results = rule.conditions.map((condition, index) => {
        const conditionResult = evaluateRule(condition, inventory, depth + 1);
        safeLog(`AND condition ${index + 1}: ${conditionResult}`, condition);
        trace.addChild(
          new RuleTrace(condition, depth + 1).complete(conditionResult)
        );
        return conditionResult;
      });
      result = results.every(Boolean);
      safeLog(`AND final result: ${result}`, { individualResults: results });
      break;
    }

    case 'or': {
      safeLog(`Evaluating OR with ${rule.conditions.length} conditions`);
      const results = rule.conditions.map((condition, index) => {
        const conditionResult = evaluateRule(condition, inventory, depth + 1);
        safeLog(`OR condition ${index + 1}: ${conditionResult}`, condition);
        trace.addChild(
          new RuleTrace(condition, depth + 1).complete(conditionResult)
        );
        return conditionResult;
      });
      result = results.some(Boolean);
      safeLog(`OR final result: ${result}`, { individualResults: results });
      break;
    }

    case 'item_check': {
      result = rule.item && inventory.has(rule.item);
      safeLog(`Item check ${rule.item}: ${result}`, {
        itemState: inventory.getItemState(rule.item),
      });
      break;
    }

    case 'count_check': {
      result = rule.item && inventory.count(rule.item) >= (rule.count || 1);
      safeLog(`Count check ${rule.item} (need ${rule.count || 1}): ${result}`, {
        actual: inventory.count(rule.item),
      });
      break;
    }

    case 'group_check': {
      result =
        rule.group && inventory.countGroup(rule.group) >= (rule.count || 1);
      safeLog(`Group check ${rule.group}: ${result}`, {
        actual: inventory.countGroup(rule.group),
      });
      break;
    }

    case 'constant': {
      result = rule.value;
      safeLog(`Constant rule returns: ${result}`);
      break;
    }

    case 'comparison': {
      const leftValue =
        typeof rule.left === 'object'
          ? evaluateRule(rule.left, inventory, depth + 1)
          : rule.left;
      const rightValue =
        typeof rule.right === 'object'
          ? evaluateRule(rule.right, inventory, depth + 1)
          : rule.right;

      safeLog('Evaluating comparison', {
        operator: rule.op,
        left: leftValue,
        right: rightValue,
      });

      switch (rule.op) {
        case 'GtE':
          result = leftValue >= rightValue;
          break;
        case 'Gt':
          result = leftValue > rightValue;
          break;
        case 'LtE':
          result = leftValue <= rightValue;
          break;
        case 'Lt':
          result = leftValue < rightValue;
          break;
        case 'Eq':
          result = leftValue === rightValue;
          break;
        default:
          result = false;
      }

      safeLog(`Comparison ${rule.op} result: ${result}`);
      break;
    }

    case 'count': {
      result = inventory.count(rule.item);
      safeLog(`Count for ${rule.item}: ${result}`);
      break;
    }

    case 'state_flag': {
      result = rule.flag && inventory.state?.hasFlag(rule.flag);
      safeLog(`State flag check ${rule.flag}: ${result}`, {
        flag: rule.flag,
        hasState: !!inventory.state,
        stateFlags: inventory.state ? Array.from(inventory.state.flags) : null,
      });
      break;
    }

    default: {
      safeLog(`Unknown rule type: ${rule.type}`);
      result = false;
    }
  }

  // Complete the trace but don't try to add it to inventory debug
  trace.complete(result);

  return result;
};
