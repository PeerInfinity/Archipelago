// commonUI.js - Common UI functions that can be shared between components

import { evaluateRule } from '../core/ruleEngine.js';
import stateManager from '../core/stateManagerSingleton.js';
import eventBus from '../core/eventBus.js';

/**
 * A shared UI utility class that contains common functions for use across multiple components
 */
export class CommonUI {
  constructor() {
    // REMOVED internal state: this.colorblindMode = true;
  }

  /**
   * Renders a logic tree from a rule object
   * Enhanced version that supports colorblind mode and displays full rule details
   * @param {Object} rule - The rule object to render
   * @param {boolean} useColorblindMode - Whether to show colorblind indicators.
   * @returns {HTMLElement} - The rendered logic tree
   */
  renderLogicTree(rule, useColorblindMode) {
    const root = document.createElement('div');
    root.classList.add('logic-node');

    if (!rule) {
      root.textContent = '(no rule)';
      return root;
    }

    // Evaluate the rule first
    const result = evaluateRule(rule);
    root.classList.toggle('pass', !!result);
    root.classList.toggle('fail', !result);

    // Add colorblind symbol if enabled
    if (useColorblindMode) {
      const symbolSpan = document.createElement('span');
      symbolSpan.classList.add('colorblind-symbol');

      if (result) {
        symbolSpan.textContent = '✓ ';
        symbolSpan.classList.add('accessible');
      } else {
        symbolSpan.textContent = '✗ ';
        symbolSpan.classList.add('inaccessible');
      }

      root.appendChild(symbolSpan);
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
            this.renderLogicTree(rule.item, useColorblindMode)
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
          itemText = `(complex expression)`;
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
              this.renderLogicTree(rule.item, useColorblindMode)
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
              this.renderLogicTree(rule.count, useColorblindMode)
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
            this.renderLogicTree(rule.group, useColorblindMode)
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

              const argTree = this.renderLogicTree(arg, useColorblindMode);
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
          this.renderLogicTree(rule.object, useColorblindMode)
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
          this.renderLogicTree(rule.value, useColorblindMode)
        );
        container.appendChild(arrayEl);

        // Render index
        const indexLabel = document.createElement('div');
        indexLabel.textContent = 'Index:';
        container.appendChild(indexLabel);

        const indexEl = document.createElement('div');
        indexEl.style.marginLeft = '10px';
        indexEl.appendChild(
          this.renderLogicTree(rule.index, useColorblindMode)
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
          this.renderLogicTree(rule.function, useColorblindMode)
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
            argItem.appendChild(this.renderLogicTree(arg, useColorblindMode));
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
            useColorblindMode
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

              const argTree = this.renderLogicTree(arg, useColorblindMode);
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
              this.renderLogicTree(rule.left, useColorblindMode)
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
              this.renderLogicTree(rule.right, useColorblindMode)
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

        const leftNode = this.renderLogicTree(rule.left, useColorblindMode);
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
                this.renderLogicTree(item, useColorblindMode)
              );
            });
            rightNode.appendChild(listItems);
            rightNode.appendChild(document.createTextNode(']'));
          } else {
            // Render other complex types recursively
            rightNode.appendChild(
              this.renderLogicTree(rule.right, useColorblindMode)
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
          console.log('Unhandled rule type:', rule.type, rule);
        }
    }

    // Ensure the root element is always returned
    return root;
  }

  /**
   * Creates a region link element for use in UI components
   * @param {string} regionName - The name of the region to link to
   * @param {boolean} useColorblindMode - Whether to use colorblind indicators.
   * @returns {HTMLElement} - The created region link
   */
  createRegionLink(regionName, useColorblindMode) {
    const link = document.createElement('span');
    link.textContent = regionName;
    link.classList.add('region-link');
    link.dataset.region = regionName;
    link.title = `Click to view the ${regionName} region`;

    // Determine if region is reachable
    const isReachable = stateManager.isRegionReachable(regionName);

    // Set appropriate color
    link.style.color = isReachable ? 'inherit' : 'red';

    // Add colorblind symbol if enabled
    if (useColorblindMode) {
      const symbolSpan = document.createElement('span');
      symbolSpan.classList.add('colorblind-symbol');
      symbolSpan.textContent = isReachable ? ' ✓' : ' ✗';
      symbolSpan.classList.add(isReachable ? 'accessible' : 'inaccessible');
      link.appendChild(symbolSpan);
    }

    // Add click handler
    link.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent triggering parent listeners
      // Publish an event with the region name
      console.log(
        `[commonUI] Publishing ui:navigateToRegion for ${regionName}`
      );
      eventBus.publish('ui:navigateToRegion', { regionName: regionName });
    });

    return link;
  }

  /**
   * Creates a location link element for use in UI components
   * @param {string} locationName - The name of the location to link to
   * @param {string} regionName - The region containing this location
   * @param {boolean} useColorblindMode - Whether to use colorblind indicators.
   * @returns {HTMLElement} - The created location link
   */
  createLocationLink(locationName, regionName, useColorblindMode) {
    const link = document.createElement('span');
    link.textContent = locationName;
    link.classList.add('location-link');
    link.dataset.location = locationName;
    link.dataset.region = regionName;
    link.title = `Click to view ${locationName} in the ${regionName} region`;

    // Find the location data
    let locationData = null;
    for (const loc of stateManager.locations || []) {
      if (loc.name === locationName && loc.region === regionName) {
        locationData = loc;
        break;
      }
    }

    // Determine if location is accessible and checked
    const isAccessible =
      locationData && stateManager.isLocationAccessible(locationData);
    const isChecked =
      locationData && stateManager.isLocationChecked(locationData?.name);

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
      console.log(
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
const commonUI = new CommonUI();
export default commonUI;
