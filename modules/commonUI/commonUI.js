// commonUI.js - Common UI functions that can be shared between components

import { evaluateRule } from '../stateManager/ruleEngine.js';
// Import the function directly from its source file
import { createStateSnapshotInterface } from '../stateManager/stateManagerProxy.js';
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import eventBus from '../../app/core/eventBus.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('commonUI', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[commonUI] ${message}`, ...data);
  }
}

/**
 * A shared UI utility class that contains common functions for use across multiple components
 */
class CommonUI {
  constructor() {
    // REMOVED internal state: this.colorblindMode = true;
    // Add state for colorblind mode, managed via setColorblindMode
    this._colorblindMode = false; // Default to false
    this.unknownEvaluationCount = 0; // Counter for undefined evaluations
  }

  // Add a method to set colorblind mode externally
  setColorblindMode(isEnabled) {
    log('info', `[CommonUI] Setting colorblind mode: ${isEnabled}`);
    this._colorblindMode = !!isEnabled;
  }

  // Method to reset the unknown evaluation counter
  resetUnknownEvaluationCount() {
    this.unknownEvaluationCount = 0;
  }

  // Method to log and get the current unknown evaluation count
  logAndGetUnknownEvaluationCount(
    contextMessage = 'Logic tree rendering cycle'
  ) {
    //log('info',
    //  `[CommonUI] ${contextMessage}: Encountered ${this.unknownEvaluationCount} unresolved rule evaluations (undefined).`
    //);
    return this.unknownEvaluationCount;
  }

  /**
   * Renders a logic tree from a rule object
   * Enhanced version that supports colorblind mode and displays full rule details
   * @param {Object} rule - The rule object to render
   * @param {boolean} useColorblindMode - Whether to show colorblind indicators.
   * @param {object} stateSnapshotInterface - The interface providing state access methods.
   * @returns {HTMLElement} - The rendered logic tree
   */
  renderLogicTree(rule, useColorblindMode, stateSnapshotInterface) {
    const root = document.createElement('div');
    root.classList.add('logic-node');

    if (!rule) {
      root.textContent = '(no rule)';
      root.classList.add('logic-node-unknown'); // Treat no rule as unknown
      return root;
    }

    // Determine if we should use the instance's colorblind setting or the passed one
    const useColorblind = useColorblindMode ?? this._colorblindMode;

    // Evaluate the rule using the provided interface
    let evaluationResult; // Can be true, false, or undefined

    if (stateSnapshotInterface) {
      try {
        evaluationResult = evaluateRule(rule, stateSnapshotInterface);
      } catch (e) {
        log('error', 'Error evaluating rule in renderLogicTree:', e, rule);
        evaluationResult = undefined; // Treat error as unknown
      }
    } else {
      log(
        'warn',
        'renderLogicTree called without stateSnapshotInterface. Rule evaluation might be inaccurate.'
      );
      evaluationResult = undefined; // No interface means unknown
    }

    const isValueNode =
      rule.type === 'constant' || rule.type === 'name' || rule.type === 'value';

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

    const label = document.createElement('div');
    label.classList.add('logic-label');
    label.textContent = `Type: ${rule.type}`;
    root.appendChild(label);

    switch (rule.type) {
      case 'constant':
        root.appendChild(document.createTextNode(` value: ${rule.value}`));
        break;

      case 'item_check': {
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
          itemExpr.appendChild(
            this.renderLogicTree(
              rule.item,
              useColorblind,
              stateSnapshotInterface
            )
          );
          root.appendChild(itemExpr);
        }

        root.appendChild(document.createTextNode(` item: ${itemText}`));
        break;
      }

      case 'count_check': {
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

        root.appendChild(
          document.createTextNode(` ${itemText} >= ${countText}`)
        );

        // Add visualization for complex expressions
        const hasComplexItem =
          rule.item && typeof rule.item === 'object' && rule.item.type;
        const hasComplexCount =
          rule.count && typeof rule.count === 'object' && rule.count.type;

        if (hasComplexItem || hasComplexCount) {
          const exprsContainer = document.createElement('div');
          exprsContainer.style.marginLeft = '10px';

          if (hasComplexItem) {
            const itemLabel = document.createElement('div');
            itemLabel.textContent = 'Item Expression:';
            exprsContainer.appendChild(itemLabel);

            const itemExpr = document.createElement('div');
            itemExpr.style.marginLeft = '10px';
            itemExpr.appendChild(
              this.renderLogicTree(
                rule.item,
                useColorblind,
                stateSnapshotInterface
              )
            );
            exprsContainer.appendChild(itemExpr);
          }

          if (hasComplexCount) {
            const countLabel = document.createElement('div');
            countLabel.textContent = 'Count Expression:';
            exprsContainer.appendChild(countLabel);

            const countExpr = document.createElement('div');
            countExpr.style.marginLeft = '10px';
            countExpr.appendChild(
              this.renderLogicTree(
                rule.count,
                useColorblind,
                stateSnapshotInterface
              )
            );
            exprsContainer.appendChild(countExpr);
          }

          root.appendChild(exprsContainer);
        }
        break;
      }

      case 'group_check': {
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
          groupExpr.appendChild(
            this.renderLogicTree(
              rule.group,
              useColorblind,
              stateSnapshotInterface
            )
          );
          root.appendChild(groupExpr);
        }

        root.appendChild(document.createTextNode(` group: ${groupText}`));
        break;
      }

      case 'helper': {
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
        const hasComplexArgs =
          rule.args &&
          rule.args.some(
            (arg) =>
              arg &&
              typeof arg === 'object' &&
              arg.type &&
              arg.type !== 'constant'
          );

        if (hasComplexArgs) {
          const argsContainer = document.createElement('div');
          argsContainer.style.marginLeft = '20px';

          rule.args.forEach((arg, i) => {
            if (
              arg &&
              typeof arg === 'object' &&
              arg.type &&
              arg.type !== 'constant'
            ) {
              const argLabel = document.createElement('div');
              argLabel.textContent = `Arg ${i + 1}:`;
              argsContainer.appendChild(argLabel);

              const argTree = this.renderLogicTree(
                arg,
                useColorblind,
                stateSnapshotInterface
              );
              argsContainer.appendChild(argTree);
            }
          });

          root.appendChild(argsContainer);
        }
        break;
      }

      case 'attribute': {
        root.appendChild(document.createTextNode(` object.${rule.attr}`));
        // Recursively render the object
        const objectEl = document.createElement('div');
        objectEl.classList.add('attribute-object');
        objectEl.style.marginLeft = '10px';
        objectEl.appendChild(
          this.renderLogicTree(
            rule.object,
            useColorblind,
            stateSnapshotInterface
          )
        );
        root.appendChild(objectEl);
        break;
      }

      case 'subscript': {
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
        arrayEl.appendChild(
          this.renderLogicTree(
            rule.value,
            useColorblind,
            stateSnapshotInterface
          )
        );
        container.appendChild(arrayEl);

        // Render index
        const indexLabel = document.createElement('div');
        indexLabel.textContent = 'Index:';
        container.appendChild(indexLabel);

        const indexEl = document.createElement('div');
        indexEl.style.marginLeft = '10px';
        indexEl.appendChild(
          this.renderLogicTree(
            rule.index,
            useColorblind,
            stateSnapshotInterface
          )
        );
        container.appendChild(indexEl);

        root.appendChild(container);
        break;
      }

      case 'function_call': {
        root.appendChild(document.createTextNode(' function call'));

        // Render function
        const functionLabel = document.createElement('div');
        functionLabel.textContent = 'Function:';
        functionLabel.style.marginLeft = '10px';
        root.appendChild(functionLabel);

        const functionEl = document.createElement('div');
        functionEl.style.marginLeft = '20px';
        functionEl.appendChild(
          this.renderLogicTree(
            rule.function,
            useColorblind,
            stateSnapshotInterface
          )
        );
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
            argItem.appendChild(
              this.renderLogicTree(arg, useColorblind, stateSnapshotInterface)
            );
            argsList.appendChild(argItem);
          }

          root.appendChild(argsList);
        }
        break;
      }

      case 'name': {
        root.appendChild(document.createTextNode(` variable: ${rule.name}`));
        break;
      }

      case 'and':
      case 'or': {
        const conditionsContainer = document.createElement('div');
        conditionsContainer.classList.add('logic-conditions');
        conditionsContainer.style.marginLeft = '10px';

        rule.conditions.forEach((condition, index) => {
          const conditionLabel = document.createElement('div');
          conditionLabel.textContent = `Condition #${index + 1}:`;
          conditionsContainer.appendChild(conditionLabel);

          const conditionNode = this.renderLogicTree(
            condition,
            useColorblind,
            stateSnapshotInterface
          );
          conditionsContainer.appendChild(conditionNode);
        });

        root.appendChild(conditionsContainer);
        break;
      }

      case 'state_method': {
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

        root.appendChild(
          document.createTextNode(
            ` method: ${rule.method}, args: [${argsText}]`
          )
        );

        // For complex arguments, render them in more detail
        const hasComplexArgs =
          rule.args &&
          rule.args.some(
            (arg) =>
              arg &&
              typeof arg === 'object' &&
              arg.type &&
              arg.type !== 'constant'
          );

        if (hasComplexArgs) {
          const argsContainer = document.createElement('div');
          argsContainer.style.marginLeft = '20px';

          rule.args.forEach((arg, i) => {
            if (
              arg &&
              typeof arg === 'object' &&
              arg.type &&
              arg.type !== 'constant'
            ) {
              const argLabel = document.createElement('div');
              argLabel.textContent = `Arg ${i + 1}:`;
              argsContainer.appendChild(argLabel);

              const argTree = this.renderLogicTree(
                arg,
                useColorblind,
                stateSnapshotInterface
              );
              argsContainer.appendChild(argTree);
            }
          });

          root.appendChild(argsContainer);
        }
        break;
      }

      case 'comparison': {
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

        root.appendChild(
          document.createTextNode(` ${leftText} ${opText} ${rightText}`)
        );

        // Show complex expressions if needed
        const hasComplexLeft =
          rule.left &&
          typeof rule.left === 'object' &&
          rule.left.type &&
          rule.left.type !== 'constant';
        const hasComplexRight =
          rule.right &&
          typeof rule.right === 'object' &&
          rule.right.type &&
          rule.right.type !== 'constant';

        if (hasComplexLeft || hasComplexRight) {
          const container = document.createElement('div');
          container.style.marginLeft = '20px';

          if (hasComplexLeft) {
            const leftLabel = document.createElement('div');
            leftLabel.textContent = 'Left:';
            container.appendChild(leftLabel);

            const leftEl = document.createElement('div');
            leftEl.style.marginLeft = '10px';
            leftEl.appendChild(
              this.renderLogicTree(
                rule.left,
                useColorblind,
                stateSnapshotInterface
              )
            );
            container.appendChild(leftEl);
          }

          if (hasComplexRight) {
            const rightLabel = document.createElement('div');
            rightLabel.textContent = 'Right:';
            container.appendChild(rightLabel);

            const rightEl = document.createElement('div');
            rightEl.style.marginLeft = '10px';
            rightEl.appendChild(
              this.renderLogicTree(
                rule.right,
                useColorblind,
                stateSnapshotInterface
              )
            );
            container.appendChild(rightEl);
          }

          root.appendChild(container);
        }
        break;
      }

      case 'compare': {
        const compareDetails = document.createElement('div');
        compareDetails.classList.add('logic-compare-details');
        compareDetails.style.marginLeft = '10px';

        const leftLabel = document.createElement('div');
        leftLabel.textContent = 'Left Operand:';
        compareDetails.appendChild(leftLabel);

        const leftNode = this.renderLogicTree(
          rule.left,
          useColorblind,
          stateSnapshotInterface
        );
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
              listItems.appendChild(
                this.renderLogicTree(
                  item,
                  useColorblind,
                  stateSnapshotInterface
                )
              );
            });
            rightNode.appendChild(listItems);
            rightNode.appendChild(document.createTextNode(']'));
          } else {
            // Render other complex types recursively
            rightNode.appendChild(
              this.renderLogicTree(
                rule.right,
                useColorblind,
                stateSnapshotInterface
              )
            );
          }
        } else {
          // Render simple values directly
          rightNode.textContent = JSON.stringify(rule.right);
        }
        compareDetails.appendChild(rightNode);

        root.appendChild(compareDetails);
        break;
      }

      default:
        root.appendChild(document.createTextNode(' [unhandled rule type] '));
        // For debugging, output the complete rule
        if (stateManager.debugMode) {
          log('info', 'Unhandled rule type:', rule.type, rule);
        }
    }

    // Ensure the root element is always returned
    return root;
  }

  /**
   * Creates a region link element for use in UI components
   * @param {string} regionName - The name of the region to link to
   * @param {boolean} useColorblindMode - Whether to use colorblind indicators.
   * @param {object} snapshot - The current state snapshot containing reachability info.
   * @returns {HTMLElement} - The created region link
   */
  createRegionLink(regionName, useColorblindMode, snapshot) {
    const link = document.createElement('span');
    link.textContent = regionName;
    link.classList.add('region-link');
    link.dataset.region = regionName;
    link.title = `Click to view the ${regionName} region`;

    // Determine region accessibility status from regionReachability
    const rawStatus = snapshot?.regionReachability?.[regionName];
    let displayStatus; // Will be true (accessible), false (inaccessible), or undefined (unknown)

    if (
      rawStatus === 'reachable' ||
      rawStatus === 'checked' ||
      rawStatus === true
    ) {
      displayStatus = true;
    } else if (rawStatus === undefined) {
      displayStatus = undefined; // Explicitly undefined if not in snapshot or snapshot missing
    } else {
      // Covers: false, 'unreachable', 'locked', or any other string not explicitly 'reachable' or 'checked'
      displayStatus = false;
    }

    // Set appropriate color and class
    link.classList.remove('accessible', 'inaccessible', 'unknown-reachability'); // Clear previous classes
    if (displayStatus === true) {
      link.style.color = 'inherit'; // Or a specific green, e.g., from CSS variables
      link.classList.add('accessible');
    } else if (displayStatus === false) {
      link.style.color = 'red'; // Consistent with other inaccessible elements
      link.classList.add('inaccessible');
    } else {
      // displayStatus is undefined
      link.style.color = '#808080'; // Gray for unknown
      link.classList.add('unknown-reachability'); // Use a specific class for unknown
    }

    // Add colorblind symbol if enabled
    if (useColorblindMode) {
      // Remove existing symbol if any, to prevent duplicates on re-renders
      const existingSymbol = link.querySelector('.colorblind-symbol');
      if (existingSymbol) {
        existingSymbol.remove();
      }

      const symbolSpan = document.createElement('span');
      symbolSpan.classList.add('colorblind-symbol');

      if (displayStatus === true) {
        symbolSpan.textContent = ' ✓';
        symbolSpan.classList.add('accessible');
      } else if (displayStatus === false) {
        symbolSpan.textContent = ' ✗';
        symbolSpan.classList.add('inaccessible');
      } else {
        // displayStatus is undefined
        symbolSpan.textContent = ' ?';
        symbolSpan.classList.add('unknown');
      }
      link.appendChild(symbolSpan);
    }

    // Add click handler
    link.addEventListener('click', (e) => {
      log(
        'info',
        `[commonUI] Click listener ON REGION LINK for "${regionName}" in commonUI.js has FIRED.`
      ); // NEW TOP-LEVEL DEBUG LOG
      e.stopPropagation(); // Prevent event from bubbling to parent elements

      // Publish panel activation first
      eventBus.publish('ui:activatePanel', { panelId: 'regionsPanel' });
      log('info', `[commonUI] Published ui:activatePanel for regionsPanel.`);

      // Then publish navigation
      eventBus.publish('ui:navigateToRegion', { regionName: regionName });
      log(
        'info',
        `[commonUI] Published ui:navigateToRegion for ${regionName}.`
      ); // Changed from "SUCCESSFULLY PUBLISHED" for clarity
    });

    return link;
  }

  /**
   * Creates a location link element for use in UI components
   * @param {string} locationName - The name of the location to link to
   * @param {string} regionName - The region containing this location
   * @param {boolean} useColorblindMode - Whether to use colorblind indicators.
   * @param {object} snapshot - The current state snapshot containing location/reachability info.
   * @returns {HTMLElement} - The created location link
   */
  createLocationLink(locationName, regionName, useColorblindMode, snapshot) {
    const link = document.createElement('span');
    link.textContent = locationName;
    link.classList.add('location-link');
    link.dataset.location = locationName;
    link.dataset.region = regionName;
    link.title = `Click to view ${locationName} in the ${regionName} region`;

    // Find the location data FROM THE SNAPSHOT
    let locationData = null;
    for (const loc of snapshot?.locations || []) {
      if (loc.name === locationName && loc.region === regionName) {
        locationData = loc;
        break;
      }
    }

    // Determine if location is accessible and checked FROM THE SNAPSHOT
    const isAccessible = locationData?.isAccessible === true;
    const checkedLocations = new Set(snapshot?.checkedLocations || []);
    const isChecked = checkedLocations.has(locationName);

    // Set appropriate class
    if (isChecked) {
      link.classList.add('checked-loc');
    } else if (isAccessible) {
      link.classList.add('accessible');
    } else {
      link.classList.add('inaccessible');
    }

    // Add colorblind symbol if enabled
    if (useColorblindMode) {
      const symbolSpan = document.createElement('span');
      symbolSpan.classList.add('colorblind-symbol');

      if (isAccessible) {
        symbolSpan.textContent = ' ✓';
        symbolSpan.classList.add('accessible');
      } else {
        symbolSpan.textContent = ' ✗';
        symbolSpan.classList.add('inaccessible');
      }

      link.appendChild(symbolSpan);
    }

    // Add click handler
    link.addEventListener('click', (e) => {
      e.stopPropagation();
      // Publish an event with location and region names
      log(
        'info',
        `[commonUI] Publishing ui:navigateToLocation for ${locationName} in ${regionName}`
      );
      eventBus.publish('ui:navigateToLocation', {
        locationName: locationName,
        regionName: regionName,
      });
    });

    return link;
  }

  /**
   * Toggles the 'colorblind-mode' class on an element.
   * @param {HTMLElement} element - The element to toggle the class on.
   * @param {boolean} isEnabled - Whether colorblind mode is enabled for this context.
   */
  applyColorblindClass(element, isEnabled) {
    if (element) {
      element.classList.toggle('colorblind-mode', !!isEnabled);
    }
  }
}

// Create a singleton instance
const commonUIInstance = new CommonUI(); // Rename instance for clarity

// --- Export bound methods as named constants ---
export const renderLogicTree =
  commonUIInstance.renderLogicTree.bind(commonUIInstance);
export const setColorblindMode =
  commonUIInstance.setColorblindMode.bind(commonUIInstance);
export const createRegionLink =
  commonUIInstance.createRegionLink.bind(commonUIInstance);
export const createLocationLink =
  commonUIInstance.createLocationLink.bind(commonUIInstance);
export const applyColorblindClass =
  commonUIInstance.applyColorblindClass.bind(commonUIInstance);
export const resetUnknownEvaluationCounter =
  commonUIInstance.resetUnknownEvaluationCount.bind(commonUIInstance);
export const logAndGetUnknownEvaluationCounter =
  commonUIInstance.logAndGetUnknownEvaluationCount.bind(commonUIInstance);

// Also keep the default export of the instance for potential compatibility
export default commonUIInstance;

// --- Utility Functions ---

/**
 * Debounce function: Limits the rate at which a function can fire.
 * @param {Function} func The function to debounce.
 * @param {number} wait The number of millisconds to delay.
 * @param {boole
a n} immediate If true, trigger the function on the leading edge instead of the trailing.
 *
  @returns {Function} The debounced function.
 */
export function debounce(func, wait, immediate = false) {
  let timeout;
  return function executedFunction(...args) {
    const context = this;
    const later = function () {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
}
