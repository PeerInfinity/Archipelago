// frontend/modules/stateManager/renderingProcessor.js
// Rendering processor for rule processing - extracted from commonUI.js

import { BaseRuleProcessor } from './ruleProcessor.js';
import { evaluateRule } from './ruleEngine.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('renderingProcessor', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[renderingProcessor] ${message}`, ...data);
  }
}

/**
 * Processor for rendering rules to HTML DOM elements.
 * Used by the main thread UI for displaying rule trees.
 */
export class RenderingProcessor extends BaseRuleProcessor {
  constructor() {
    super();
    this.unknownEvaluationCount = 0; // Counter for undefined evaluations
  }

  validateContext(context, rule) {
    // For rendering, we need a valid snapshot interface for evaluation
    return context && context._isSnapshotInterface === true;
  }

  handleInvalidContext(rule, context, options) {
    const root = document.createElement('div');
    root.classList.add('logic-node', 'logic-node-unknown');
    root.textContent = '(invalid context)';
    return root;
  }

  handleError(error, rule, context, options) {
    log('error', 'Error rendering rule:', error, rule);
    const root = document.createElement('div');
    root.classList.add('logic-node', 'logic-node-unknown');
    root.textContent = '(error)';
    return root;
  }

  handlePrimitive(rule, context, options) {
    const root = document.createElement('div');
    root.classList.add('logic-node');
    root.textContent = `(primitive: ${rule})`;
    return root;
  }

  // Helper method to create and style the root element for a rule
  createRuleRoot(rule, context, options) {
    const root = document.createElement('div');
    root.classList.add('logic-node');

    if (!rule) {
      root.textContent = '(no rule)';
      root.classList.add('logic-node-unknown');
      return root;
    }

    // Determine if we should use colorblind mode
    const useColorblind = options.useColorblindMode ?? options._colorblindMode;

    // Evaluate the rule using the provided interface
    let evaluationResult; // Can be true, false, or undefined

    if (context) {
      try {
        evaluationResult = evaluateRule(rule, context);
      } catch (e) {
        log('error', 'Error evaluating rule in renderLogicTree:', e, rule);
        evaluationResult = undefined; // Treat error as unknown
      }
    } else {
      log('warn', 'renderLogicTree called without stateSnapshotInterface. Rule evaluation might be inaccurate.');
      evaluationResult = undefined; // No interface means unknown
    }

    const isValueNode = rule.type === 'constant' || rule.type === 'name' || rule.type === 'value';

    // Increment counter if evaluation is undefined
    if (evaluationResult === undefined) {
      this.unknownEvaluationCount++;
      // Always mark a node as unknown if its result is undefined
      root.classList.add('logic-node-unknown');
    } else if (!isValueNode) {
      // For non-value nodes, apply pass/fail styling
      if (evaluationResult === true) {
        root.classList.add('pass');
      } else if (evaluationResult === false) {
        root.classList.add('fail');
      } else {
        // If a boolean-like node resolves to something other than true/false/undefined, it's also unknown
        root.classList.add('logic-node-unknown');
      }
    }
    // Value nodes with defined results get no special styling.

    // Add colorblind symbol if enabled
    if (useColorblind) {
      const symbolSpan = document.createElement('span');
      symbolSpan.classList.add('colorblind-symbol');

      // Always show '?' for any node if its result is undefined
      if (evaluationResult === undefined) {
        symbolSpan.textContent = '? ';
        symbolSpan.classList.add('unknown');
        root.appendChild(symbolSpan);
      } else if (!isValueNode) {
        // Only show check/cross for non-value (boolean-like) nodes
        if (evaluationResult === true) {
          symbolSpan.textContent = '✓ ';
          symbolSpan.classList.add('accessible');
          root.appendChild(symbolSpan);
        } else if (evaluationResult === false) {
          symbolSpan.textContent = '✗ ';
          symbolSpan.classList.add('inaccessible');
          root.appendChild(symbolSpan);
        }
      }
    }

    return root;
  }

  handleConstant(rule, context, options, processChild) {
    const root = this.createRuleRoot(rule, context, options);
    
    const label = document.createElement('div');
    label.classList.add('logic-label');
    label.textContent = `Type: ${rule.type}`;
    root.appendChild(label);
    
    root.appendChild(document.createTextNode(` value: ${rule.value}`));
    return root;
  }

  handleName(rule, context, options, processChild) {
    const root = this.createRuleRoot(rule, context, options);
    
    const label = document.createElement('div');
    label.classList.add('logic-label');
    label.textContent = `Type: ${rule.type}`;
    root.appendChild(label);
    
    root.appendChild(document.createTextNode(` variable: ${rule.name}`));
    return root;
  }

  handleItemCheck(rule, context, options, processChild) {
    const root = this.createRuleRoot(rule, context, options);
    
    const label = document.createElement('div');
    label.classList.add('logic-label');
    label.textContent = `Type: ${rule.type}`;
    root.appendChild(label);

    let itemText = '';
    if (typeof rule.item === 'string') {
      itemText = rule.item;
    } else if (rule.item && rule.item.type === 'constant') {
      itemText = rule.item.value;
    } else if (rule.item) {
      itemText = `(complex expression)`;

      // Add visualization for complex item expression
      const itemExprLabel = document.createElement('div');
      itemExprLabel.textContent = 'Item Expression:';
      itemExprLabel.style.marginLeft = '10px';
      root.appendChild(itemExprLabel);

      const itemExpr = document.createElement('div');
      itemExpr.style.marginLeft = '20px';
      itemExpr.appendChild(processChild(rule.item));
      root.appendChild(itemExpr);
    }

    root.appendChild(document.createTextNode(` item: ${itemText}`));
    return root;
  }

  handleCountCheck(rule, context, options, processChild) {
    const root = this.createRuleRoot(rule, context, options);
    
    const label = document.createElement('div');
    label.classList.add('logic-label');
    label.textContent = `Type: ${rule.type}`;
    root.appendChild(label);

    let itemText = '';
    let countText = rule.count || 1;

    if (typeof rule.item === 'string') {
      itemText = rule.item;
    } else if (rule.item && rule.item.type === 'constant') {
      itemText = rule.item.value;
    } else if (rule.item) {
      itemText = '(complex expression)';
    }

    if (typeof rule.count === 'number') {
      countText = rule.count;
    } else if (rule.count && rule.count.type === 'constant') {
      countText = rule.count.value;
    } else if (rule.count) {
      countText = '(complex expression)';
    }

    root.appendChild(document.createTextNode(` ${itemText} >= ${countText}`));

    // Add visualization for complex expressions
    const hasComplexItem = rule.item && typeof rule.item === 'object' && rule.item.type;
    const hasComplexCount = rule.count && typeof rule.count === 'object' && rule.count.type;

    if (hasComplexItem || hasComplexCount) {
      const exprsContainer = document.createElement('div');
      exprsContainer.style.marginLeft = '10px';

      if (hasComplexItem) {
        const itemLabel = document.createElement('div');
        itemLabel.textContent = 'Item Expression:';
        exprsContainer.appendChild(itemLabel);

        const itemExpr = document.createElement('div');
        itemExpr.style.marginLeft = '10px';
        itemExpr.appendChild(processChild(rule.item));
        exprsContainer.appendChild(itemExpr);
      }

      if (hasComplexCount) {
        const countLabel = document.createElement('div');
        countLabel.textContent = 'Count Expression:';
        exprsContainer.appendChild(countLabel);

        const countExpr = document.createElement('div');
        countExpr.style.marginLeft = '10px';
        countExpr.appendChild(processChild(rule.count));
        exprsContainer.appendChild(countExpr);
      }

      root.appendChild(exprsContainer);
    }
    return root;
  }

  handleGroupCheck(rule, context, options, processChild) {
    const root = this.createRuleRoot(rule, context, options);
    
    const label = document.createElement('div');
    label.classList.add('logic-label');
    label.textContent = `Type: ${rule.type}`;
    root.appendChild(label);

    let groupText = '';
    if (typeof rule.group === 'string') {
      groupText = rule.group;
    } else if (rule.group && rule.group.type === 'constant') {
      groupText = rule.group.value;
    } else if (rule.group) {
      groupText = '(complex expression)';

      // Add visualization for complex group expression
      const groupExprLabel = document.createElement('div');
      groupExprLabel.textContent = 'Group Expression:';
      groupExprLabel.style.marginLeft = '10px';
      root.appendChild(groupExprLabel);

      const groupExpr = document.createElement('div');
      groupExpr.style.marginLeft = '20px';
      groupExpr.appendChild(processChild(rule.group));
      root.appendChild(groupExpr);
    }

    root.appendChild(document.createTextNode(` group: ${groupText}`));
    return root;
  }

  handleHelper(rule, context, options, processChild) {
    const root = this.createRuleRoot(rule, context, options);
    
    const label = document.createElement('div');
    label.classList.add('logic-label');
    label.textContent = `Type: ${rule.type}`;
    root.appendChild(label);

    // Display helper name
    root.appendChild(document.createTextNode(` helper: ${rule.name}`));

    // Process arguments for display
    if (rule.args && rule.args.length > 0) {
      root.appendChild(document.createTextNode(', args: ['));
      const argsContainer = document.createElement('span'); // Container for args text
      argsContainer.style.backgroundColor = 'transparent'; // Explicitly remove background
      argsContainer.style.color = 'inherit'; // Inherit text color from parent
      argsContainer.style.padding = '0'; // Reset padding
      argsContainer.style.margin = '0'; // Reset margin

      let isFirstArg = true;
      rule.args.forEach((arg) => {
        if (!isFirstArg) {
          argsContainer.appendChild(document.createTextNode(', '));
        }
        let argText = '(complex)';
        if (typeof arg === 'string' || typeof arg === 'number') {
          argText = arg;
        } else if (arg && arg.type === 'constant') {
          argText = arg.value;
        }
        argsContainer.appendChild(document.createTextNode(argText));
        isFirstArg = false;
      });
      root.appendChild(argsContainer);
      root.appendChild(document.createTextNode(']'));
    } else {
      root.appendChild(document.createTextNode(', args: []'));
    }

    // Keep the logic for rendering complex arguments below if they exist
    const hasComplexArgs = rule.args && rule.args.some(
      (arg) => arg && typeof arg === 'object' && arg.type && arg.type !== 'constant'
    );

    if (hasComplexArgs) {
      const argsContainer = document.createElement('div');
      argsContainer.style.marginLeft = '20px';

      rule.args.forEach((arg, i) => {
        if (arg && typeof arg === 'object' && arg.type && arg.type !== 'constant') {
          const argLabel = document.createElement('div');
          argLabel.textContent = `Arg ${i + 1}:`;
          argsContainer.appendChild(argLabel);

          const argTree = processChild(arg);
          argsContainer.appendChild(argTree);
        }
      });

      root.appendChild(argsContainer);
    }
    return root;
  }

  handleStateMethod(rule, context, options, processChild) {
    const root = this.createRuleRoot(rule, context, options);
    
    const label = document.createElement('div');
    label.classList.add('logic-label');
    label.textContent = `Type: ${rule.type}`;
    root.appendChild(label);

    // Process arguments for display
    let argsText = (rule.args || [])
      .map((arg) => {
        if (typeof arg === 'string' || typeof arg === 'number') {
          return arg;
        } else if (arg && arg.type === 'constant') {
          return arg.value;
        } else {
          return '(complex)';
        }
      })
      .join(', ');

    root.appendChild(document.createTextNode(` method: ${rule.method}, args: [${argsText}]`));

    // For complex arguments, render them in more detail
    const hasComplexArgs = rule.args && rule.args.some(
      (arg) => arg && typeof arg === 'object' && arg.type && arg.type !== 'constant'
    );

    if (hasComplexArgs) {
      const argsContainer = document.createElement('div');
      argsContainer.style.marginLeft = '20px';

      rule.args.forEach((arg, i) => {
        if (arg && typeof arg === 'object' && arg.type && arg.type !== 'constant') {
          const argLabel = document.createElement('div');
          argLabel.textContent = `Arg ${i + 1}:`;
          argsContainer.appendChild(argLabel);

          const argTree = processChild(arg);
          argsContainer.appendChild(argTree);
        }
      });

      root.appendChild(argsContainer);
    }
    return root;
  }

  handleAnd(rule, context, options, processChild) {
    const root = this.createRuleRoot(rule, context, options);
    
    const label = document.createElement('div');
    label.classList.add('logic-label');
    label.textContent = `Type: ${rule.type}`;
    root.appendChild(label);

    const conditionsContainer = document.createElement('div');
    conditionsContainer.classList.add('logic-conditions');
    conditionsContainer.style.marginLeft = '10px';

    rule.conditions.forEach((condition, index) => {
      const conditionLabel = document.createElement('div');
      conditionLabel.textContent = `Condition #${index + 1}:`;
      conditionsContainer.appendChild(conditionLabel);

      const conditionNode = processChild(condition);
      conditionsContainer.appendChild(conditionNode);
    });

    root.appendChild(conditionsContainer);
    return root;
  }

  handleOr(rule, context, options, processChild) {
    const root = this.createRuleRoot(rule, context, options);
    
    const label = document.createElement('div');
    label.classList.add('logic-label');
    label.textContent = `Type: ${rule.type}`;
    root.appendChild(label);

    const conditionsContainer = document.createElement('div');
    conditionsContainer.classList.add('logic-conditions');
    conditionsContainer.style.marginLeft = '10px';

    rule.conditions.forEach((condition, index) => {
      const conditionLabel = document.createElement('div');
      conditionLabel.textContent = `Condition #${index + 1}:`;
      conditionsContainer.appendChild(conditionLabel);

      const conditionNode = processChild(condition);
      conditionsContainer.appendChild(conditionNode);
    });

    root.appendChild(conditionsContainer);
    return root;
  }

  handleAttribute(rule, context, options, processChild) {
    const root = this.createRuleRoot(rule, context, options);
    
    const label = document.createElement('div');
    label.classList.add('logic-label');
    label.textContent = `Type: ${rule.type}`;
    root.appendChild(label);

    root.appendChild(document.createTextNode(` object.${rule.attr}`));
    // Recursively render the object
    const objectEl = document.createElement('div');
    objectEl.classList.add('attribute-object');
    objectEl.style.marginLeft = '10px';
    objectEl.appendChild(processChild(rule.object));
    root.appendChild(objectEl);
    return root;
  }

  handleSubscript(rule, context, options, processChild) {
    const root = this.createRuleRoot(rule, context, options);
    
    const label = document.createElement('div');
    label.classList.add('logic-label');
    label.textContent = `Type: ${rule.type}`;
    root.appendChild(label);

    root.appendChild(document.createTextNode(` array[index]`));
    // Create container for array and index
    const container = document.createElement('div');
    container.style.marginLeft = '10px';

    // Render array
    const arrayLabel = document.createElement('div');
    arrayLabel.textContent = 'Array:';
    container.appendChild(arrayLabel);

    const arrayEl = document.createElement('div');
    arrayEl.style.marginLeft = '10px';
    arrayEl.appendChild(processChild(rule.value));
    container.appendChild(arrayEl);

    // Render index
    const indexLabel = document.createElement('div');
    indexLabel.textContent = 'Index:';
    container.appendChild(indexLabel);

    const indexEl = document.createElement('div');
    indexEl.style.marginLeft = '10px';
    indexEl.appendChild(processChild(rule.index));
    container.appendChild(indexEl);

    root.appendChild(container);
    return root;
  }

  handleFunctionCall(rule, context, options, processChild) {
    const root = this.createRuleRoot(rule, context, options);
    
    const label = document.createElement('div');
    label.classList.add('logic-label');
    label.textContent = `Type: ${rule.type}`;
    root.appendChild(label);

    root.appendChild(document.createTextNode(' function call'));

    // Render function
    const functionLabel = document.createElement('div');
    functionLabel.textContent = 'Function:';
    functionLabel.style.marginLeft = '10px';
    root.appendChild(functionLabel);

    const functionEl = document.createElement('div');
    functionEl.style.marginLeft = '20px';
    functionEl.appendChild(processChild(rule.function));
    root.appendChild(functionEl);

    // Render arguments
    if (rule.args && rule.args.length > 0) {
      const argsLabel = document.createElement('div');
      argsLabel.textContent = 'Arguments:';
      argsLabel.style.marginLeft = '10px';
      root.appendChild(argsLabel);

      const argsList = document.createElement('ol');
      argsList.style.marginLeft = '20px';

      for (const arg of rule.args) {
        const argItem = document.createElement('li');
        argItem.appendChild(processChild(arg));
        argsList.appendChild(argItem);
      }

      root.appendChild(argsList);
    }
    return root;
  }

  handleCompare(rule, context, options, processChild) {
    const root = this.createRuleRoot(rule, context, options);
    
    const label = document.createElement('div');
    label.classList.add('logic-label');
    label.textContent = `Type: ${rule.type}`;
    root.appendChild(label);

    // Handle both 'compare' and 'comparison' type structures
    if (rule.op && rule.left !== undefined && rule.right !== undefined) {
      // New 'compare' structure
      const opText = rule.op || 'unknown';

      let leftText = '(complex)';
      if (typeof rule.left === 'string' || typeof rule.left === 'number') {
        leftText = rule.left;
      } else if (rule.left && rule.left.type === 'constant') {
        leftText = rule.left.value;
      }

      let rightText = '(complex)';
      if (typeof rule.right === 'string' || typeof rule.right === 'number') {
        rightText = rule.right;
      } else if (rule.right && rule.right.type === 'constant') {
        rightText = rule.right.value;
      }

      root.appendChild(document.createTextNode(` ${leftText} ${opText} ${rightText}`));

      // Show complex expressions if needed
      const hasComplexLeft = rule.left && typeof rule.left === 'object' && rule.left.type && rule.left.type !== 'constant';
      const hasComplexRight = rule.right && typeof rule.right === 'object' && rule.right.type && rule.right.type !== 'constant';

      if (hasComplexLeft || hasComplexRight) {
        const container = document.createElement('div');
        container.style.marginLeft = '20px';

        if (hasComplexLeft) {
          const leftLabel = document.createElement('div');
          leftLabel.textContent = 'Left:';
          container.appendChild(leftLabel);

          const leftEl = document.createElement('div');
          leftEl.style.marginLeft = '10px';
          leftEl.appendChild(processChild(rule.left));
          container.appendChild(leftEl);
        }

        if (hasComplexRight) {
          const rightLabel = document.createElement('div');
          rightLabel.textContent = 'Right:';
          container.appendChild(rightLabel);

          const rightEl = document.createElement('div');
          rightEl.style.marginLeft = '10px';
          rightEl.appendChild(processChild(rule.right));
          container.appendChild(rightEl);
        }

        root.appendChild(container);
      }
    } else {
      // Legacy 'comparison' structure - handle detailed comparison display
      const compareDetails = document.createElement('div');
      compareDetails.classList.add('logic-compare-details');
      compareDetails.style.marginLeft = '10px';

      const leftLabel = document.createElement('div');
      leftLabel.textContent = 'Left Operand:';
      compareDetails.appendChild(leftLabel);

      const leftNode = processChild(rule.left);
      leftNode.style.marginLeft = '10px';
      compareDetails.appendChild(leftNode);

      const opLabel = document.createElement('div');
      opLabel.textContent = `Operator: ${rule.op}`;
      compareDetails.appendChild(opLabel);

      const rightLabel = document.createElement('div');
      rightLabel.textContent = 'Right Operand:';
      compareDetails.appendChild(rightLabel);

      // Handle rendering the right side, which might be complex (e.g., a list)
      const rightNode = document.createElement('div');
      rightNode.style.marginLeft = '10px';

      if (rule.right && typeof rule.right === 'object') {
        if (rule.right.type === 'list') {
          rightNode.textContent = 'List: [';
          const listItems = document.createElement('div');
          listItems.style.marginLeft = '10px';
          rule.right.value.forEach((item, index) => {
            listItems.appendChild(processChild(item));
          });
          rightNode.appendChild(listItems);
          rightNode.appendChild(document.createTextNode(']'));
        } else {
          // Render other complex types recursively
          rightNode.appendChild(processChild(rule.right));
        }
      } else {
        // Render simple values directly
        rightNode.textContent = JSON.stringify(rule.right);
      }
      compareDetails.appendChild(rightNode);

      root.appendChild(compareDetails);
    }
    return root;
  }

  handleNot(rule, context, options, processChild) {
    const root = this.createRuleRoot(rule, context, options);
    
    const label = document.createElement('div');
    label.classList.add('logic-label');
    label.textContent = 'NOT';
    root.appendChild(label);

    const conditionContainer = document.createElement('div');
    conditionContainer.classList.add('logic-operands');
    const conditionNode = processChild(rule.operand || rule.condition);
    conditionContainer.appendChild(conditionNode);
    root.appendChild(conditionContainer);
    
    return root;
  }

  handleConditional(rule, context, options, processChild) {
    const root = this.createRuleRoot(rule, context, options);
    
    const label = document.createElement('div');
    label.classList.add('logic-label');
    label.textContent = 'IF-THEN-ELSE';
    root.appendChild(label);

    const container = document.createElement('div');
    container.style.marginLeft = '10px';
    
    // Condition
    const condLabel = document.createElement('div');
    condLabel.textContent = 'Condition:';
    container.appendChild(condLabel);
    const condEl = document.createElement('div');
    condEl.style.marginLeft = '10px';
    condEl.appendChild(processChild(rule.condition));
    container.appendChild(condEl);
    
    // Then branch
    const thenLabel = document.createElement('div');
    thenLabel.textContent = 'Then:';
    container.appendChild(thenLabel);
    const thenEl = document.createElement('div');
    thenEl.style.marginLeft = '10px';
    thenEl.appendChild(processChild(rule.then_expr));
    container.appendChild(thenEl);
    
    // Else branch (if exists)
    if (rule.else_expr !== undefined) {
      const elseLabel = document.createElement('div');
      elseLabel.textContent = 'Else:';
      container.appendChild(elseLabel);
      const elseEl = document.createElement('div');
      elseEl.style.marginLeft = '10px';
      elseEl.appendChild(processChild(rule.else_expr));
      container.appendChild(elseEl);
    }
    
    root.appendChild(container);
    return root;
  }

  handleBinaryOp(rule, context, options, processChild) {
    const root = this.createRuleRoot(rule, context, options);
    
    const label = document.createElement('div');
    label.classList.add('logic-label');
    label.textContent = `Binary Op: ${rule.op}`;
    root.appendChild(label);

    const container = document.createElement('div');
    container.classList.add('logic-operands');
    
    const leftNode = processChild(rule.left);
    container.appendChild(leftNode);
    
    const opText = document.createElement('span');
    opText.textContent = ` ${rule.op} `;
    opText.style.margin = '0 5px';
    container.appendChild(opText);
    
    const rightNode = processChild(rule.right);
    container.appendChild(rightNode);
    
    root.appendChild(container);
    return root;
  }

  handleList(rule, context, options, processChild) {
    const root = this.createRuleRoot(rule, context, options);
    
    const label = document.createElement('div');
    label.classList.add('logic-label');
    label.textContent = 'List';
    root.appendChild(label);

    const listContainer = document.createElement('div');
    listContainer.classList.add('logic-operands');
    listContainer.textContent = '[';
    
    (rule.elements || rule.items || []).forEach((element, index) => {
      if (index > 0) {
        listContainer.appendChild(document.createTextNode(', '));
      }
      const elementNode = processChild(element);
      listContainer.appendChild(elementNode);
    });
    
    listContainer.appendChild(document.createTextNode(']'));
    root.appendChild(listContainer);
    return root;
  }

  handleSettingCheck(rule, context, options, processChild) {
    const root = this.createRuleRoot(rule, context, options);
    
    const label = document.createElement('div');
    label.classList.add('logic-label');
    label.textContent = 'Setting Check';
    root.appendChild(label);

    const settingInfo = document.createElement('div');
    settingInfo.textContent = `Setting: ${rule.setting}`;
    if (rule.expected !== undefined) {
      settingInfo.textContent += ` = ${rule.expected}`;
    }
    root.appendChild(settingInfo);
    
    return root;
  }

  handleUnknown(rule, context, options, processChild) {
    const root = this.createRuleRoot(rule, context, options);
    
    const label = document.createElement('div');
    label.classList.add('logic-label');
    label.textContent = `Type: ${rule.type}`;
    root.appendChild(label);

    root.appendChild(document.createTextNode(' [unhandled rule type] '));
    return root;
  }

  // Methods for managing unknown evaluation counter
  resetUnknownEvaluationCount() {
    this.unknownEvaluationCount = 0;
  }

  logAndGetUnknownEvaluationCount(contextMessage = 'Logic tree rendering cycle') {
    return this.unknownEvaluationCount;
  }
}

// Create a singleton instance
export const renderingProcessor = new RenderingProcessor();