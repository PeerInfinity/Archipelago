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
            children: this.children
        };
    }
}

export const evaluateRule = (rule, inventory, depth = 0) => {
    if (!rule) {
        return true;
    }

    // Create trace object for this evaluation
    const trace = new RuleTrace(rule, depth);
    
    const log = (message, details = null) => {
        if (inventory.debug?.log) {
            const logEntry = {
                message,
                details,
                timestamp: new Date().toISOString()
            };
            trace.addChild(logEntry);
            inventory.debug.log(JSON.stringify(logEntry, null, 2));
        }
    };

    log(`Evaluating ${rule.type} rule at depth ${depth}`, rule);

    let result = false;
    switch (rule.type) {
        case 'helper': {
            if (inventory.helpers && typeof inventory.helpers.executeHelper === 'function') {
                result = inventory.helpers.executeHelper(rule.name, ...(rule.args || []));
                log(`Helper ${rule.name} returned: ${result}`, {
                    args: rule.args,
                    helpers: Object.keys(inventory.helpers)
                });
            } else {
                log(`No helper implementation available for: ${rule.name}`, {
                    availableHelpers: inventory.helpers ? Object.keys(inventory.helpers) : []
                });
                result = false;
            }
            break;
        }

        case 'and': {
            log(`Evaluating AND with ${rule.conditions.length} conditions`);
            const results = rule.conditions.map((condition, index) => {
                const conditionResult = evaluateRule(condition, inventory, depth + 1);
                log(`AND condition ${index + 1}: ${conditionResult}`, condition);
                trace.addChild(new RuleTrace(condition, depth + 1).complete(conditionResult));
                return conditionResult;
            });
            result = results.every(Boolean);
            log(`AND final result: ${result}`, { individualResults: results });
            break;
        }
            
        case 'or': {
            log(`Evaluating OR with ${rule.conditions.length} conditions`);
            const results = rule.conditions.map((condition, index) => {
                const conditionResult = evaluateRule(condition, inventory, depth + 1);
                log(`OR condition ${index + 1}: ${conditionResult}`, condition);
                trace.addChild(new RuleTrace(condition, depth + 1).complete(conditionResult));
                return conditionResult;
            });
            result = results.some(Boolean);
            log(`OR final result: ${result}`, { individualResults: results });
            break;
        }
            
        case 'item_check': {
            result = rule.item && inventory.has(rule.item);
            log(`Item check ${rule.item}: ${result}`, {
                itemState: inventory.getItemState(rule.item)
            });
            break;
        }
            
        case 'count_check': {
            result = rule.item && inventory.count(rule.item) >= (rule.count || 1);
            log(`Count check ${rule.item} (need ${rule.count || 1}): ${result}`, {
                actual: inventory.count(rule.item)
            });
            break;
        }
            
        case 'group_check': {
            result = rule.group && inventory.countGroup(rule.group) >= (rule.count || 1);
            log(`Group check ${rule.group}: ${result}`, {
                actual: inventory.countGroup(rule.group)
            });
            break;
        }
            
        case 'constant': {
            result = rule.value;
            log(`Constant rule returns: ${result}`);
            break;
        }

        case 'comparison': {
            const leftValue = typeof rule.left === 'object' ? 
                evaluateRule(rule.left, inventory, depth + 1) : rule.left;
            const rightValue = typeof rule.right === 'object' ? 
                evaluateRule(rule.right, inventory, depth + 1) : rule.right;
            
            log('Evaluating comparison', {
                operator: rule.op,
                left: leftValue,
                right: rightValue
            });

            switch (rule.op) {
                case 'GtE': result = leftValue >= rightValue; break;
                case 'Gt': result = leftValue > rightValue; break;
                case 'LtE': result = leftValue <= rightValue; break;
                case 'Lt': result = leftValue < rightValue; break;
                case 'Eq': result = leftValue === rightValue; break;
                default: result = false;
            }
            
            log(`Comparison ${rule.op} result: ${result}`);
            break;
        }

        case 'count': {
            result = inventory.count(rule.item);
            log(`Count for ${rule.item}: ${result}`);
            break;
        }

        case 'state_flag': {
            result = rule.flag && inventory.state?.hasFlag(rule.flag);
            log(`State flag check ${rule.flag}: ${result}`, {
                flag: rule.flag,
                hasState: !!inventory.state,
                stateFlags: inventory.state ? Array.from(inventory.state.flags) : null
            });
            break;
        }

        default: {
            log(`Unknown rule type: ${rule.type}`);
            result = false;
        }
    }

    // Complete the trace with the final result
    trace.complete(result);

    // Add full trace to inventory's debug history if available
    if (inventory.debug?.addTrace) {
        inventory.debug.addTrace(trace);
    }

    return result;
};