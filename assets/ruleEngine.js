import stateManager from './stateManagerSingleton.js';

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

export const evaluateRule = (rule, depth = 0) => {
  if (!rule) {
    return true;
  }
  if (!stateManager.inventory) {
    return false; // Add early return if inventory is undefined
  }

  // Create trace object for this evaluation
  const trace = new RuleTrace(rule, depth);

  let result = false;
  switch (rule.type) {
    case 'helper': {
      if (
        stateManager.helpers &&
        typeof stateManager.helpers.executeHelper === 'function'
      ) {
        result = stateManager.helpers.executeHelper(
          rule.name,
          ...(rule.args || [])
        );
      } else {
        safeLog(`No helper implementation available for: ${rule.name}`, {
          availableHelpers: stateManager.helpers
            ? Object.keys(stateManager.helpers)
            : [],
        });
        result = false;
      }
      break;
    }

    case 'and': {
      const results = rule.conditions.map((condition, index) => {
        const conditionResult = evaluateRule(condition, depth + 1);
        trace.addChild(
          new RuleTrace(condition, depth + 1).complete(conditionResult)
        );
        return conditionResult;
      });
      result = results.every(Boolean);
      break;
    }

    case 'or': {
      const results = rule.conditions.map((condition, index) => {
        const conditionResult = evaluateRule(condition, depth + 1);
        trace.addChild(
          new RuleTrace(condition, depth + 1).complete(conditionResult)
        );
        return conditionResult;
      });
      result = results.some(Boolean);
      break;
    }

    case 'item_check': {
      result = stateManager.inventory.has?.(rule.item) ?? false; // Add safe access
      break;
    }

    case 'count_check': {
      result =
        (stateManager.inventory.count?.(rule.item) ?? 0) >= (rule.count || 1); // Add safe access
      break;
    }

    case 'group_check': {
      result =
        rule.group &&
        stateManager.inventory.countGroup(rule.group) >= (rule.count || 1);
      break;
    }

    case 'constant': {
      result = rule.value;
      break;
    }

    case 'comparison': {
      const leftValue =
        typeof rule.left === 'object'
          ? evaluateRule(rule.left, depth + 1)
          : rule.left;
      const rightValue =
        typeof rule.right === 'object'
          ? evaluateRule(rule.right, depth + 1)
          : rule.right;

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

      break;
    }

    case 'count': {
      result = stateManager.inventory.count(rule.item);
      break;
    }

    case 'state_flag': {
      result = rule.flag && stateManager.state?.hasFlag(rule.flag);
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
