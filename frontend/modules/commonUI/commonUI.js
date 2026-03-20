// commonUI.js - Common UI functions that can be shared between components

import { evaluateRule } from '../shared/ruleEngine.js';
// Import the function directly from its source file
import { createSnapshotInterface } from '../shared/snapshotInterface.js';
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import settingsManager from '../../app/core/settingsManager.js';
// eventBus will be injected during module initialization
let eventBus = null;

// Function to set the eventBus (called during module initialization)
export function setEventBus(injectedEventBus) {
  eventBus = injectedEventBus;
}

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
   * Helper method to create location info elements for an item
   * @param {string} itemName - The name of the item to find locations for
   * @param {object} snapshot - The current state snapshot (optional, will fetch if not provided)
   * @returns {HTMLElement|null} - Element containing location links or null if no locations found
   */
  _createItemLocationInfo(itemName, snapshot = null) {
    // Get snapshot and static data if not provided
    if (!snapshot) {
      snapshot = stateManager.getLatestStateSnapshot();
    }
    const staticData = stateManager.getStaticData();

    if (!staticData?.locationItems || !staticData?.locations) {
      return null;
    }

    // Find all locations that have this item
    // Use Map methods
    const locationInfos = [];
    for (const [locName, itemData] of staticData.locationItems.entries()) {
      if (itemData && itemData.name === itemName) {
        // Get the location's region from static data
        const locData = staticData.locations.get(locName);
        if (locData) {
          locationInfos.push({
            locationName: locName,
            regionName: locData.region || locData.parent_region
          });
        }
      }
    }

    if (locationInfos.length === 0) {
      return null;
    }

    // Create container for location info
    const container = document.createElement('span');
    container.style.fontSize = '0.9em';
    container.style.fontStyle = 'italic';

    const fromText = document.createElement('span');
    fromText.textContent = ' (from ';
    fromText.style.color = '#999';
    container.appendChild(fromText);

    // Add all location links
    locationInfos.forEach((locationInfo, index) => {
      if (index > 0) {
        const separator = document.createElement('span');
        separator.textContent = index === locationInfos.length - 1 ? ' or ' : ', ';
        separator.style.color = '#999';
        container.appendChild(separator);
      }

      const locLink = this.createLocationLink(
        locationInfo.locationName,
        locationInfo.regionName,
        false,  // Don't use colorblind mode for inline text
        snapshot
      );
      container.appendChild(locLink);
    });

    const closeParen = document.createElement('span');
    closeParen.textContent = ')';
    closeParen.style.color = '#999';
    container.appendChild(closeParen);

    return container;
  }

  /**
   * Extracts a specific helper function from the helper file code
   * @param {string} fileContent - The full content of the helper file
   * @param {string} functionName - The name of the helper function to extract
   * @returns {string|null} - The extracted function code or null if not found
   */
  _extractHelperFunction(fileContent, functionName) {
    // Try to find the function definition
    // Look for patterns like: functionName(args) { ... } or functionName: function(args) { ... }

    // Pattern 1: Regular function declaration
    const funcPattern1 = new RegExp(
      `function\\s+${functionName}\\s*\\([^)]*\\)\\s*\\{`,
      'g'
    );

    // Pattern 2: Method in an object
    const funcPattern2 = new RegExp(
      `${functionName}\\s*:\\s*function\\s*\\([^)]*\\)\\s*\\{`,
      'g'
    );

    // Pattern 3: Arrow function
    const funcPattern3 = new RegExp(
      `(?:const|let|var)\\s+${functionName}\\s*=\\s*\\([^)]*\\)\\s*=>\\s*\\{`,
      'g'
    );

    // Pattern 4: Method shorthand in object
    const funcPattern4 = new RegExp(
      `${functionName}\\s*\\([^)]*\\)\\s*\\{`,
      'g'
    );

    let match = null;
    let startIndex = -1;

    // Try each pattern
    for (const pattern of [funcPattern1, funcPattern2, funcPattern3, funcPattern4]) {
      pattern.lastIndex = 0; // Reset regex
      match = pattern.exec(fileContent);
      if (match) {
        startIndex = match.index;
        break;
      }
    }

    if (startIndex === -1) {
      return null;
    }

    // Extract the function body by counting braces
    let braceCount = 0;
    let inString = false;
    let stringChar = null;
    let escaped = false;
    let functionEnd = startIndex;

    for (let i = startIndex; i < fileContent.length; i++) {
      const char = fileContent[i];
      const prevChar = i > 0 ? fileContent[i - 1] : '';

      // Handle string literals
      if (!escaped && (char === '"' || char === "'" || char === '`')) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
          stringChar = null;
        }
      }

      // Handle escape characters
      escaped = !escaped && prevChar === '\\';

      // Count braces only outside of strings
      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            functionEnd = i + 1;
            break;
          }
        }
      }
    }

    return fileContent.substring(startIndex, functionEnd);
  }

  /**
   * Formats helper function code with item highlighting and location links
   * @param {string} code - The helper function code
   * @param {object} stateSnapshotInterface - Interface for state evaluation
   * @returns {HTMLElement} - Formatted code element
   */
  async _formatHelperCode(code, stateSnapshotInterface) {
    const container = document.createElement('pre');
    container.style.margin = '0';
    container.style.whiteSpace = 'pre-wrap';
    container.style.wordWrap = 'break-word';

    // Get snapshot and static data
    const snapshot = stateSnapshotInterface?._snapshot || stateManager.getLatestStateSnapshot();
    const staticData = stateManager.getStaticData();

    if (!snapshot || !staticData?.items) {
      container.textContent = code;
      return container;
    }

    // Get all item names from static data
    const itemNames = Object.keys(staticData.items);

    // Check if showLocationItems is enabled
    const showLocationItems = await settingsManager.getSetting('moduleSettings.commonUI.showLocationItems', false);

    // Create a regex pattern to match item names in quotes
    // Match items in single quotes, double quotes, or as identifiers
    const itemPatterns = itemNames.map(name => {
      // Escape special regex characters in item names
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return escaped;
    });

    if (itemPatterns.length === 0) {
      container.textContent = code;
      return container;
    }

    // Create regex to match items in quotes or as identifiers
    const itemRegex = new RegExp(
      `(['"])(${itemPatterns.join('|')})\\1|\\b(${itemPatterns.join('|')})\\b`,
      'g'
    );

    let lastIndex = 0;
    let match;

    while ((match = itemRegex.exec(code)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        const textNode = document.createTextNode(code.substring(lastIndex, match.index));
        container.appendChild(textNode);
      }

      // Get the matched item name (could be from group 2 or 3)
      const itemName = match[2] || match[3];
      const fullMatch = match[0];

      // Check if this item has a count in inventory
      const itemCount = snapshot.inventory?.[itemName] || 0;
      const hasItem = itemCount > 0;

      // Create a span for the item
      const itemSpan = document.createElement('span');
      itemSpan.textContent = fullMatch;
      itemSpan.style.fontWeight = 'bold';

      // Apply color based on whether player has the item
      if (hasItem) {
        itemSpan.style.color = '#00ff00'; // Green if player has item
        itemSpan.title = `You have ${itemCount} ${itemName}`;
      } else {
        itemSpan.style.color = '#ff9999'; // Light red if player doesn't have item
        itemSpan.title = `You need ${itemName}`;
      }

      container.appendChild(itemSpan);

      // Add expandable location info if enabled and item not yet obtained
      if (showLocationItems && !hasItem) {
        const locationInfo = this._createItemLocationInfo(itemName, snapshot);
        if (locationInfo) {
          // Create an expand button
          const expandBtn = document.createElement('button');
          expandBtn.textContent = '[+]';
          expandBtn.style.marginLeft = '4px';
          expandBtn.style.fontSize = '10px';
          expandBtn.style.padding = '0 2px';
          expandBtn.style.cursor = 'pointer';
          expandBtn.style.border = '1px solid #666';
          expandBtn.style.backgroundColor = '#333';
          expandBtn.style.color = '#ccc';
          expandBtn.title = `Show where to find ${itemName}`;

          // Create container for location info
          const locationContainer = document.createElement('span');
          locationContainer.style.display = 'none';
          locationContainer.style.fontSize = '0.9em';
          locationContainer.appendChild(locationInfo);

          let isExpanded = false;
          expandBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isExpanded = !isExpanded;
            if (isExpanded) {
              expandBtn.textContent = '[-]';
              expandBtn.title = `Hide location info for ${itemName}`;
              locationContainer.style.display = 'inline';
            } else {
              expandBtn.textContent = '[+]';
              expandBtn.title = `Show where to find ${itemName}`;
              locationContainer.style.display = 'none';
            }
          });

          container.appendChild(expandBtn);
          container.appendChild(locationContainer);
        }
      }

      lastIndex = match.index + fullMatch.length;
    }

    // Add any remaining text after the last match
    if (lastIndex < code.length) {
      const textNode = document.createTextNode(code.substring(lastIndex));
      container.appendChild(textNode);
    }

    return container;
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

    // Statement-type rules that only make sense inside a block context
    // These should not be evaluated in isolation as they require local scope
    const statementOnlyTypes = new Set([
      'assign', 'return', 'break', 'continue',
      'for_range', 'for_iter', 'while_loop', 'if_statement'
    ]);

    if (statementOnlyTypes.has(rule.type)) {
      // Don't try to evaluate statement-only rules - they need block context
      evaluationResult = undefined;
    } else if (stateSnapshotInterface) {
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

    // Detect Rule Builder format: has 'rule' key but no 'type' key
    if (rule.rule && !rule.type) {
      return this._renderRuleBuilderTree(rule, useColorblind, stateSnapshotInterface, evaluationResult, root);
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
        let itemName = null;
        if (typeof rule.item === 'string') {
          itemText = rule.item;
          itemName = rule.item;
        } else if (rule.item && rule.item.type === 'constant') {
          itemText = rule.item.value;
          itemName = rule.item.value;
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

        // Add location info if showLocationItems is enabled and we have a simple item name
        if (itemName && typeof itemName === 'string') {
          // Create a placeholder for location info that will be filled async
          const locationPlaceholder = document.createElement('span');
          locationPlaceholder.classList.add('location-info-placeholder');
          locationPlaceholder.dataset.itemName = itemName;
          root.appendChild(locationPlaceholder);

          // Check if setting is enabled (async)
          settingsManager.getSetting('moduleSettings.commonUI.showLocationItems', false).then(showLocationItems => {
            if (showLocationItems && locationPlaceholder.parentNode) {
              // Get the CURRENT snapshot at the time of rendering, not the one from closure
              const currentSnapshot = stateSnapshotInterface?._snapshot || stateManager.getLatestStateSnapshot();
              const locationInfo = this._createItemLocationInfo(itemName, currentSnapshot);
              if (locationInfo) {
                // Replace the placeholder with the actual location info
                locationPlaceholder.replaceWith(locationInfo);
              } else {
                // Remove placeholder if no location info
                locationPlaceholder.remove();
              }
            } else {
              // Remove placeholder if setting is disabled
              if (locationPlaceholder.parentNode) {
                locationPlaceholder.remove();
              }
            }
          });
        }
        break;
      }

      case 'count_check': {
        let itemText = '';
        let itemName = null;
        let countText = rule.count || 1;

        if (typeof rule.item === 'string') {
          itemText = rule.item;
          itemName = rule.item;
        } else if (rule.item && rule.item.type === 'constant') {
          itemText = rule.item.value;
          itemName = rule.item.value;
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

        // Add location info if showLocationItems is enabled and we have a simple item name
        if (itemName && typeof itemName === 'string') {
          // Create a placeholder for location info that will be filled async
          const locationPlaceholder = document.createElement('span');
          locationPlaceholder.classList.add('location-info-placeholder');
          locationPlaceholder.dataset.itemName = itemName;
          root.appendChild(locationPlaceholder);

          // Check if setting is enabled (async)
          settingsManager.getSetting('moduleSettings.commonUI.showLocationItems', false).then(showLocationItems => {
            if (showLocationItems && locationPlaceholder.parentNode) {
              // Get the CURRENT snapshot at the time of rendering, not the one from closure
              const currentSnapshot = stateSnapshotInterface?._snapshot || stateManager.getLatestStateSnapshot();
              const locationInfo = this._createItemLocationInfo(itemName, currentSnapshot);
              if (locationInfo) {
                // Replace the placeholder with the actual location info
                locationPlaceholder.replaceWith(locationInfo);
              } else {
                // Remove placeholder if no location info
                locationPlaceholder.remove();
              }
            } else {
              // Remove placeholder if setting is disabled
              if (locationPlaceholder.parentNode) {
                locationPlaceholder.remove();
              }
            }
          });
        }

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

        // Process arguments for display first (before expand button)
        if (rule.args && rule.args.length > 0) {
          root.appendChild(document.createTextNode('('));
          const argsContainer = document.createElement('span');
          argsContainer.style.backgroundColor = 'transparent';
          argsContainer.style.color = 'inherit';
          argsContainer.style.padding = '0';
          argsContainer.style.margin = '0';

          let isFirstArg = true;
          rule.args.forEach((arg) => {
            if (!isFirstArg) {
              argsContainer.appendChild(document.createTextNode(', '));
            }
            let argText = '(complex)';
            if (typeof arg === 'string' || typeof arg === 'number') {
              argText = String(arg);
            } else if (arg && arg.type === 'constant') {
              argText = String(arg.value);
            }
            argsContainer.appendChild(document.createTextNode(argText));
            isFirstArg = false;
          });
          root.appendChild(argsContainer);
          root.appendChild(document.createTextNode(')'));
        } else {
          root.appendChild(document.createTextNode('()'));
        }

        // Try to look up helper definition from static data (rules.json) first
        let helperDef = null;
        if (stateSnapshotInterface && typeof stateSnapshotInterface.getStaticData === 'function') {
          const staticData = stateSnapshotInterface.getStaticData();
          if (staticData?.helpers) {
            // helpers is keyed by player ID, try common player IDs
            const playerIds = ['1', '0', 1, 0];
            for (const pid of playerIds) {
              if (staticData.helpers[pid]?.[rule.name]) {
                helperDef = staticData.helpers[pid][rule.name];
                break;
              }
            }
          }
        }

        // Only add expand/collapse button if we have a helper definition
        if (helperDef) {
          const bodyContainer = document.createElement('div');
          bodyContainer.style.marginLeft = '10px';
          bodyContainer.style.marginTop = '4px';

          const expandBtn = document.createElement('button');
          expandBtn.textContent = '[+] Show helper body';
          expandBtn.style.fontSize = '12px';
          expandBtn.style.padding = '0 4px';
          expandBtn.style.cursor = 'pointer';
          expandBtn.style.border = '1px solid #666';
          expandBtn.style.backgroundColor = '#333';
          expandBtn.style.color = '#ccc';

          let isExpanded = false;
          const bodyTreeContainer = document.createElement('div');
          bodyTreeContainer.style.display = 'none';
          bodyTreeContainer.style.marginTop = '4px';

          expandBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isExpanded = !isExpanded;
            if (isExpanded) {
              expandBtn.textContent = '[-] Hide helper body';
              bodyTreeContainer.style.display = 'block';
              // Render body on first expand
              if (bodyTreeContainer.children.length === 0) {
                // Helper definition can be in different formats:
                // 1. { body: {...}, params: [...] } - parameterized helper
                // 2. { type: 'or', conditions: [...] } - direct rule
                // 3. { statements: [...], type: 'block' } - block
                const bodyRule = helperDef.body || helperDef;
                bodyTreeContainer.appendChild(
                  this.renderLogicTree(bodyRule, useColorblind, stateSnapshotInterface)
                );
              }
            } else {
              expandBtn.textContent = '[+] Show helper body';
              bodyTreeContainer.style.display = 'none';
            }
          });

          bodyContainer.appendChild(expandBtn);
          bodyContainer.appendChild(bodyTreeContainer);
          root.appendChild(bodyContainer);
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

      case 'conditional': {
        const conditionalDetails = document.createElement('div');
        conditionalDetails.classList.add('logic-conditional-details');
        conditionalDetails.style.marginLeft = '10px';

        const testLabel = document.createElement('div');
        testLabel.textContent = 'Test Condition:';
        conditionalDetails.appendChild(testLabel);

        const testNode = document.createElement('div');
        testNode.style.marginLeft = '10px';
        testNode.appendChild(
          this.renderLogicTree(
            rule.test,
            useColorblind,
            stateSnapshotInterface
          )
        );
        conditionalDetails.appendChild(testNode);

        const trueLabel = document.createElement('div');
        trueLabel.textContent = 'If True:';
        conditionalDetails.appendChild(trueLabel);

        const trueNode = document.createElement('div');
        trueNode.style.marginLeft = '10px';
        trueNode.appendChild(
          this.renderLogicTree(
            rule.if_true,
            useColorblind,
            stateSnapshotInterface
          )
        );
        conditionalDetails.appendChild(trueNode);

        if (rule.if_false !== undefined) {
          const falseLabel = document.createElement('div');
          falseLabel.textContent = 'If False:';
          conditionalDetails.appendChild(falseLabel);

          if (rule.if_false === null) {
            const falseNode = document.createElement('div');
            falseNode.style.marginLeft = '10px';
            falseNode.textContent = 'null (evaluates to true - no additional requirements)';
            conditionalDetails.appendChild(falseNode);
          } else {
            const falseNode = document.createElement('div');
            falseNode.style.marginLeft = '10px';
            falseNode.appendChild(
              this.renderLogicTree(
                rule.if_false,
                useColorblind,
                stateSnapshotInterface
              )
            );
            conditionalDetails.appendChild(falseNode);
          }
        }

        root.appendChild(conditionalDetails);
        break;
      }

      case 'binary_op': {
        const opText = rule.op || 'unknown';
        root.appendChild(document.createTextNode(`Binary Operation: ${opText}`));

        const binaryDetails = document.createElement('div');
        binaryDetails.classList.add('logic-binary-details');
        binaryDetails.style.marginLeft = '10px';

        const leftLabel = document.createElement('div');
        leftLabel.textContent = 'Left Operand:';
        binaryDetails.appendChild(leftLabel);

        const leftNode = document.createElement('div');
        leftNode.style.marginLeft = '10px';
        leftNode.appendChild(
          this.renderLogicTree(
            rule.left,
            useColorblind,
            stateSnapshotInterface
          )
        );
        binaryDetails.appendChild(leftNode);

        const rightLabel = document.createElement('div');
        rightLabel.textContent = 'Right Operand:';
        binaryDetails.appendChild(rightLabel);

        const rightNode = document.createElement('div');
        rightNode.style.marginLeft = '10px';
        rightNode.appendChild(
          this.renderLogicTree(
            rule.right,
            useColorblind,
            stateSnapshotInterface
          )
        );
        binaryDetails.appendChild(rightNode);

        root.appendChild(binaryDetails);
        break;
      }

      case 'not': {
        root.appendChild(document.createTextNode(' (logical NOT)'));
        // 'not' can use either 'operand' or 'condition' field
        const innerRule = rule.operand || rule.condition;
        if (innerRule) {
          const innerContainer = document.createElement('div');
          innerContainer.style.marginLeft = '10px';
          innerContainer.appendChild(
            this.renderLogicTree(innerRule, useColorblind, stateSnapshotInterface)
          );
          root.appendChild(innerContainer);
        }
        break;
      }

      case 'negate': {
        root.appendChild(document.createTextNode(' (unary minus)'));
        if (rule.operand) {
          const operandContainer = document.createElement('div');
          operandContainer.style.marginLeft = '10px';
          operandContainer.appendChild(
            this.renderLogicTree(rule.operand, useColorblind, stateSnapshotInterface)
          );
          root.appendChild(operandContainer);
        }
        break;
      }

      case 'block': {
        root.appendChild(document.createTextNode(' (code block)'));
        if (rule.statements && rule.statements.length > 0) {
          const statementsContainer = document.createElement('div');
          statementsContainer.style.marginLeft = '10px';
          rule.statements.forEach((stmt, index) => {
            const stmtLabel = document.createElement('div');
            stmtLabel.textContent = `Statement #${index + 1}:`;
            statementsContainer.appendChild(stmtLabel);
            statementsContainer.appendChild(
              this.renderLogicTree(stmt, useColorblind, stateSnapshotInterface)
            );
          });
          root.appendChild(statementsContainer);
        }
        break;
      }

      case 'assign': {
        const varName = rule.var || '?';
        const op = rule.op || '=';
        root.appendChild(document.createTextNode(` ${varName} ${op}`));
        if (rule.value) {
          const valueContainer = document.createElement('div');
          valueContainer.style.marginLeft = '10px';
          valueContainer.appendChild(
            this.renderLogicTree(rule.value, useColorblind, stateSnapshotInterface)
          );
          root.appendChild(valueContainer);
        }
        break;
      }

      case 'return': {
        root.appendChild(document.createTextNode(' return'));
        if (rule.value) {
          const valueContainer = document.createElement('div');
          valueContainer.style.marginLeft = '10px';
          valueContainer.appendChild(
            this.renderLogicTree(rule.value, useColorblind, stateSnapshotInterface)
          );
          root.appendChild(valueContainer);
        }
        break;
      }

      case 'for_range': {
        const varName = rule.var || 'i';
        root.appendChild(document.createTextNode(` for ${varName} in range(...)`));

        const forDetails = document.createElement('div');
        forDetails.style.marginLeft = '10px';

        // Show range parameters
        if (rule.start) {
          const startLabel = document.createElement('div');
          startLabel.textContent = 'Start:';
          forDetails.appendChild(startLabel);
          const startNode = document.createElement('div');
          startNode.style.marginLeft = '10px';
          startNode.appendChild(
            this.renderLogicTree(rule.start, useColorblind, stateSnapshotInterface)
          );
          forDetails.appendChild(startNode);
        }

        if (rule.end) {
          const endLabel = document.createElement('div');
          endLabel.textContent = 'End:';
          forDetails.appendChild(endLabel);
          const endNode = document.createElement('div');
          endNode.style.marginLeft = '10px';
          endNode.appendChild(
            this.renderLogicTree(rule.end, useColorblind, stateSnapshotInterface)
          );
          forDetails.appendChild(endNode);
        }

        if (rule.step) {
          const stepLabel = document.createElement('div');
          stepLabel.textContent = 'Step:';
          forDetails.appendChild(stepLabel);
          const stepNode = document.createElement('div');
          stepNode.style.marginLeft = '10px';
          stepNode.appendChild(
            this.renderLogicTree(rule.step, useColorblind, stateSnapshotInterface)
          );
          forDetails.appendChild(stepNode);
        }

        // Show body
        if (rule.body && rule.body.length > 0) {
          const bodyLabel = document.createElement('div');
          bodyLabel.textContent = 'Body:';
          forDetails.appendChild(bodyLabel);
          rule.body.forEach((stmt, index) => {
            const stmtNode = document.createElement('div');
            stmtNode.style.marginLeft = '10px';
            stmtNode.appendChild(
              this.renderLogicTree(stmt, useColorblind, stateSnapshotInterface)
            );
            forDetails.appendChild(stmtNode);
          });
        }

        root.appendChild(forDetails);
        break;
      }

      case 'for_iter': {
        const varName = rule.var || 'item';
        root.appendChild(document.createTextNode(` for ${varName} in ...`));

        const forDetails = document.createElement('div');
        forDetails.style.marginLeft = '10px';

        // Show iterable
        if (rule.iterable) {
          const iterLabel = document.createElement('div');
          iterLabel.textContent = 'Iterable:';
          forDetails.appendChild(iterLabel);
          const iterNode = document.createElement('div');
          iterNode.style.marginLeft = '10px';
          iterNode.appendChild(
            this.renderLogicTree(rule.iterable, useColorblind, stateSnapshotInterface)
          );
          forDetails.appendChild(iterNode);
        }

        // Show body
        if (rule.body && rule.body.length > 0) {
          const bodyLabel = document.createElement('div');
          bodyLabel.textContent = 'Body:';
          forDetails.appendChild(bodyLabel);
          rule.body.forEach((stmt) => {
            const stmtNode = document.createElement('div');
            stmtNode.style.marginLeft = '10px';
            stmtNode.appendChild(
              this.renderLogicTree(stmt, useColorblind, stateSnapshotInterface)
            );
            forDetails.appendChild(stmtNode);
          });
        }

        root.appendChild(forDetails);
        break;
      }

      case 'while_loop': {
        root.appendChild(document.createTextNode(' while ...'));

        const whileDetails = document.createElement('div');
        whileDetails.style.marginLeft = '10px';

        if (rule.condition) {
          const condLabel = document.createElement('div');
          condLabel.textContent = 'Condition:';
          whileDetails.appendChild(condLabel);
          const condNode = document.createElement('div');
          condNode.style.marginLeft = '10px';
          condNode.appendChild(
            this.renderLogicTree(rule.condition, useColorblind, stateSnapshotInterface)
          );
          whileDetails.appendChild(condNode);
        }

        if (rule.body && rule.body.length > 0) {
          const bodyLabel = document.createElement('div');
          bodyLabel.textContent = 'Body:';
          whileDetails.appendChild(bodyLabel);
          rule.body.forEach((stmt) => {
            const stmtNode = document.createElement('div');
            stmtNode.style.marginLeft = '10px';
            stmtNode.appendChild(
              this.renderLogicTree(stmt, useColorblind, stateSnapshotInterface)
            );
            whileDetails.appendChild(stmtNode);
          });
        }

        root.appendChild(whileDetails);
        break;
      }

      case 'if_statement': {
        root.appendChild(document.createTextNode(' if ...'));

        const ifDetails = document.createElement('div');
        ifDetails.style.marginLeft = '10px';

        if (rule.condition) {
          const condLabel = document.createElement('div');
          condLabel.textContent = 'Condition:';
          ifDetails.appendChild(condLabel);
          const condNode = document.createElement('div');
          condNode.style.marginLeft = '10px';
          condNode.appendChild(
            this.renderLogicTree(rule.condition, useColorblind, stateSnapshotInterface)
          );
          ifDetails.appendChild(condNode);
        }

        if (rule.body && rule.body.length > 0) {
          const bodyLabel = document.createElement('div');
          bodyLabel.textContent = 'Then:';
          ifDetails.appendChild(bodyLabel);
          rule.body.forEach((stmt) => {
            const stmtNode = document.createElement('div');
            stmtNode.style.marginLeft = '10px';
            stmtNode.appendChild(
              this.renderLogicTree(stmt, useColorblind, stateSnapshotInterface)
            );
            ifDetails.appendChild(stmtNode);
          });
        }

        if (rule.orelse && rule.orelse.length > 0) {
          const elseLabel = document.createElement('div');
          elseLabel.textContent = 'Else:';
          ifDetails.appendChild(elseLabel);
          rule.orelse.forEach((stmt) => {
            const stmtNode = document.createElement('div');
            stmtNode.style.marginLeft = '10px';
            stmtNode.appendChild(
              this.renderLogicTree(stmt, useColorblind, stateSnapshotInterface)
            );
            ifDetails.appendChild(stmtNode);
          });
        }

        root.appendChild(ifDetails);
        break;
      }

      case 'break': {
        root.appendChild(document.createTextNode(' break'));
        break;
      }

      case 'continue': {
        root.appendChild(document.createTextNode(' continue'));
        break;
      }

      case 'setting_value': {
        const settingName = rule.setting || '?';
        root.appendChild(document.createTextNode(` setting: ${settingName}`));
        break;
      }

      case 'setting_check': {
        const settingName = rule.setting || '?';
        const value = rule.value;
        root.appendChild(document.createTextNode(` setting: ${settingName} == ${JSON.stringify(value)}`));
        break;
      }

      case 'can_reach': {
        const regionName = typeof rule.region === 'string' ? rule.region : '(complex)';
        root.appendChild(document.createTextNode(` can_reach region: ${regionName}`));
        if (rule.region && typeof rule.region === 'object') {
          const regionContainer = document.createElement('div');
          regionContainer.style.marginLeft = '10px';
          regionContainer.appendChild(
            this.renderLogicTree(rule.region, useColorblind, stateSnapshotInterface)
          );
          root.appendChild(regionContainer);
        }
        break;
      }

      case 'region_check': {
        const regionName = typeof rule.region === 'string' ? rule.region : '(complex)';
        root.appendChild(document.createTextNode(` region: ${regionName}`));
        if (rule.region && typeof rule.region === 'object') {
          const regionContainer = document.createElement('div');
          regionContainer.style.marginLeft = '10px';
          regionContainer.appendChild(
            this.renderLogicTree(rule.region, useColorblind, stateSnapshotInterface)
          );
          root.appendChild(regionContainer);
        }
        break;
      }

      case 'location_check': {
        const locationName = typeof rule.location === 'string' ? rule.location : '(complex)';
        root.appendChild(document.createTextNode(` location: ${locationName}`));
        if (rule.location && typeof rule.location === 'object') {
          const locationContainer = document.createElement('div');
          locationContainer.style.marginLeft = '10px';
          locationContainer.appendChild(
            this.renderLogicTree(rule.location, useColorblind, stateSnapshotInterface)
          );
          root.appendChild(locationContainer);
        }
        break;
      }

      case 'location_rule_ref': {
        const locationName = typeof rule.location === 'string' ? rule.location : '(complex)';
        root.appendChild(document.createTextNode(` location rule: ${locationName}`));
        break;
      }

      case 'can_reach_entrance': {
        const entranceName = typeof rule.entrance === 'string' ? rule.entrance : '(complex)';
        root.appendChild(document.createTextNode(` can_reach entrance: ${entranceName}`));
        if (rule.entrance && typeof rule.entrance === 'object') {
          const entranceContainer = document.createElement('div');
          entranceContainer.style.marginLeft = '10px';
          entranceContainer.appendChild(
            this.renderLogicTree(rule.entrance, useColorblind, stateSnapshotInterface)
          );
          root.appendChild(entranceContainer);
        }
        break;
      }

      case 'region_reference': {
        const regionName = typeof rule.region === 'string' ? rule.region : '(complex)';
        root.appendChild(document.createTextNode(` region ref: ${regionName}`));
        break;
      }

      case 'region_attribute': {
        const regionName = typeof rule.region === 'string' ? rule.region : '(complex)';
        const attr = rule.attr || '?';
        root.appendChild(document.createTextNode(` ${regionName}.${attr}`));
        break;
      }

      case 'list': {
        const values = rule.value || [];
        if (values.length === 0) {
          root.appendChild(document.createTextNode(' []'));
        } else if (values.length <= 5) {
          root.appendChild(document.createTextNode(' ['));
          const listContainer = document.createElement('div');
          listContainer.style.marginLeft = '10px';
          values.forEach((item, index) => {
            const itemNode = document.createElement('div');
            itemNode.appendChild(
              this.renderLogicTree(item, useColorblind, stateSnapshotInterface)
            );
            if (index < values.length - 1) {
              itemNode.appendChild(document.createTextNode(','));
            }
            listContainer.appendChild(itemNode);
          });
          root.appendChild(listContainer);
          root.appendChild(document.createTextNode(']'));
        } else {
          root.appendChild(document.createTextNode(` [${values.length} items]`));
        }
        break;
      }

      case 'tuple': {
        const values = rule.value || rule.elements || [];
        root.appendChild(document.createTextNode(` (${values.length} elements)`));
        if (values.length > 0 && values.length <= 5) {
          const tupleContainer = document.createElement('div');
          tupleContainer.style.marginLeft = '10px';
          values.forEach((item) => {
            const itemNode = document.createElement('div');
            itemNode.appendChild(
              this.renderLogicTree(item, useColorblind, stateSnapshotInterface)
            );
            tupleContainer.appendChild(itemNode);
          });
          root.appendChild(tupleContainer);
        }
        break;
      }

      case 'set': {
        const elements = rule.elements || [];
        root.appendChild(document.createTextNode(` {${elements.length} elements}`));
        break;
      }

      case 'count_item': {
        const itemName = typeof rule.item === 'string' ? rule.item : '(complex)';
        root.appendChild(document.createTextNode(` count(${itemName})`));
        if (rule.item && typeof rule.item === 'object') {
          const itemContainer = document.createElement('div');
          itemContainer.style.marginLeft = '10px';
          itemContainer.appendChild(
            this.renderLogicTree(rule.item, useColorblind, stateSnapshotInterface)
          );
          root.appendChild(itemContainer);
        }
        break;
      }

      case 'group_count': {
        const groupName = typeof rule.group === 'string' ? rule.group : '(complex)';
        root.appendChild(document.createTextNode(` group_count(${groupName})`));
        break;
      }

      case 'prog_item_count': {
        const itemName = typeof rule.item === 'string' ? rule.item : '(complex)';
        root.appendChild(document.createTextNode(` prog_item_count(${itemName})`));
        break;
      }

      case 'counts': {
        const items = rule.items || [];
        const count = rule.count || 1;
        root.appendChild(document.createTextNode(` counts(${items.length} items) >= ${count}`));
        if (items.length > 0 && items.length <= 10) {
          const itemsContainer = document.createElement('div');
          itemsContainer.style.marginLeft = '10px';
          items.forEach((item) => {
            const itemNode = document.createElement('div');
            if (typeof item === 'string') {
              itemNode.textContent = `- ${item}`;
            } else {
              itemNode.appendChild(
                this.renderLogicTree(item, useColorblind, stateSnapshotInterface)
              );
            }
            itemsContainer.appendChild(itemNode);
          });
          root.appendChild(itemsContainer);
        }
        break;
      }

      case 'all_of':
      case 'any_of': {
        const isAll = rule.type === 'all_of';
        root.appendChild(document.createTextNode(` ${isAll ? 'all' : 'any'} of ...`));

        const detailsContainer = document.createElement('div');
        detailsContainer.style.marginLeft = '10px';

        if (rule.iterator_info) {
          const iterLabel = document.createElement('div');
          iterLabel.textContent = 'Iterator:';
          detailsContainer.appendChild(iterLabel);
          const iterNode = document.createElement('div');
          iterNode.style.marginLeft = '10px';
          iterNode.appendChild(
            this.renderLogicTree(rule.iterator_info, useColorblind, stateSnapshotInterface)
          );
          detailsContainer.appendChild(iterNode);
        }

        if (rule.element_rule) {
          const elemLabel = document.createElement('div');
          elemLabel.textContent = 'Element Rule:';
          detailsContainer.appendChild(elemLabel);
          const elemNode = document.createElement('div');
          elemNode.style.marginLeft = '10px';
          elemNode.appendChild(
            this.renderLogicTree(rule.element_rule, useColorblind, stateSnapshotInterface)
          );
          detailsContainer.appendChild(elemNode);
        }

        root.appendChild(detailsContainer);
        break;
      }

      case 'sum_of': {
        root.appendChild(document.createTextNode(' sum of ...'));

        const sumDetails = document.createElement('div');
        sumDetails.style.marginLeft = '10px';

        if (rule.iterator_info) {
          const iterLabel = document.createElement('div');
          iterLabel.textContent = 'Iterator:';
          sumDetails.appendChild(iterLabel);
          const iterNode = document.createElement('div');
          iterNode.style.marginLeft = '10px';
          iterNode.appendChild(
            this.renderLogicTree(rule.iterator_info, useColorblind, stateSnapshotInterface)
          );
          sumDetails.appendChild(iterNode);
        }

        if (rule.element_rule) {
          const elemLabel = document.createElement('div');
          elemLabel.textContent = 'Element Expression:';
          sumDetails.appendChild(elemLabel);
          const elemNode = document.createElement('div');
          elemNode.style.marginLeft = '10px';
          elemNode.appendChild(
            this.renderLogicTree(rule.element_rule, useColorblind, stateSnapshotInterface)
          );
          sumDetails.appendChild(elemNode);
        }

        root.appendChild(sumDetails);
        break;
      }

      case 'count_true':
      case 'weighted_count_true': {
        const isWeighted = rule.type === 'weighted_count_true';
        root.appendChild(document.createTextNode(` ${isWeighted ? 'weighted_' : ''}count_true`));

        if (rule.conditions && rule.conditions.length > 0) {
          const condContainer = document.createElement('div');
          condContainer.style.marginLeft = '10px';
          rule.conditions.forEach((cond, index) => {
            const condLabel = document.createElement('div');
            condLabel.textContent = `Condition #${index + 1}:`;
            condContainer.appendChild(condLabel);
            condContainer.appendChild(
              this.renderLogicTree(cond, useColorblind, stateSnapshotInterface)
            );
          });
          root.appendChild(condContainer);
        }
        break;
      }

      case 'min':
      case 'max':
      case 'sum': {
        root.appendChild(document.createTextNode(` ${rule.type}(...)`));
        if (rule.args && rule.args.length > 0) {
          const argsContainer = document.createElement('div');
          argsContainer.style.marginLeft = '10px';
          rule.args.forEach((arg) => {
            const argNode = document.createElement('div');
            argNode.appendChild(
              this.renderLogicTree(arg, useColorblind, stateSnapshotInterface)
            );
            argsContainer.appendChild(argNode);
          });
          root.appendChild(argsContainer);
        }
        break;
      }

      case 'f_string': {
        root.appendChild(document.createTextNode(' f"..."'));
        if (rule.parts && rule.parts.length > 0) {
          const partsContainer = document.createElement('div');
          partsContainer.style.marginLeft = '10px';
          rule.parts.forEach((part, index) => {
            const partNode = document.createElement('div');
            partNode.appendChild(document.createTextNode(`Part ${index + 1}: `));
            partNode.appendChild(
              this.renderLogicTree(part, useColorblind, stateSnapshotInterface)
            );
            partsContainer.appendChild(partNode);
          });
          root.appendChild(partsContainer);
        }
        break;
      }

      case 'player_id': {
        root.appendChild(document.createTextNode(' (player ID)'));
        break;
      }

      case 'capability': {
        const capName = rule.capability || '?';
        root.appendChild(document.createTextNode(` capability: ${capName}`));
        break;
      }

      case 'placement_lookup': {
        const locationName = typeof rule.location === 'string' ? rule.location : '(complex)';
        root.appendChild(document.createTextNode(` placement at: ${locationName}`));
        break;
      }

      case 'placement_search': {
        root.appendChild(document.createTextNode(' placement_search'));
        const searchDetails = document.createElement('div');
        searchDetails.style.marginLeft = '10px';

        if (rule.item) {
          const itemLabel = document.createElement('div');
          itemLabel.textContent = `Item: ${typeof rule.item === 'string' ? rule.item : '(complex)'}`;
          searchDetails.appendChild(itemLabel);
        }

        if (rule.player !== undefined) {
          const playerLabel = document.createElement('div');
          playerLabel.textContent = `Player: ${rule.player}`;
          searchDetails.appendChild(playerLabel);
        }

        if (rule.locations && rule.locations.length > 0) {
          const locsLabel = document.createElement('div');
          locsLabel.textContent = `Locations: ${rule.locations.length} entries`;
          searchDetails.appendChild(locsLabel);
        }

        root.appendChild(searchDetails);
        break;
      }

      case 'comprehension_details': {
        root.appendChild(document.createTextNode(' (comprehension)'));
        const compDetails = document.createElement('div');
        compDetails.style.marginLeft = '10px';

        if (rule.target) {
          const targetLabel = document.createElement('div');
          targetLabel.textContent = 'Target:';
          compDetails.appendChild(targetLabel);
          compDetails.appendChild(
            this.renderLogicTree(rule.target, useColorblind, stateSnapshotInterface)
          );
        }

        if (rule.iterator) {
          const iterLabel = document.createElement('div');
          iterLabel.textContent = 'Iterator:';
          compDetails.appendChild(iterLabel);
          compDetails.appendChild(
            this.renderLogicTree(rule.iterator, useColorblind, stateSnapshotInterface)
          );
        }

        root.appendChild(compDetails);
        break;
      }

      case 'world_reference': {
        root.appendChild(document.createTextNode(' (world reference)'));
        break;
      }

      case 'generator_expression': {
        root.appendChild(document.createTextNode(' (generator expression)'));
        break;
      }

      case 'lambda': {
        root.appendChild(document.createTextNode(' lambda'));
        if (rule.body) {
          const bodyContainer = document.createElement('div');
          bodyContainer.style.marginLeft = '10px';
          bodyContainer.appendChild(
            this.renderLogicTree(rule.body, useColorblind, stateSnapshotInterface)
          );
          root.appendChild(bodyContainer);
        }
        break;
      }

      case 'slice': {
        root.appendChild(document.createTextNode(' [start:stop:step]'));
        break;
      }

      case 'method_call': {
        const methodName = rule.method || '?';
        root.appendChild(document.createTextNode(` .${methodName}(...)`));

        if (rule.object) {
          const objContainer = document.createElement('div');
          objContainer.style.marginLeft = '10px';
          objContainer.textContent = 'Object:';
          const objNode = document.createElement('div');
          objNode.style.marginLeft = '10px';
          objNode.appendChild(
            this.renderLogicTree(rule.object, useColorblind, stateSnapshotInterface)
          );
          objContainer.appendChild(objNode);
          root.appendChild(objContainer);
        }

        if (rule.args && rule.args.length > 0) {
          const argsContainer = document.createElement('div');
          argsContainer.style.marginLeft = '10px';
          argsContainer.textContent = 'Args:';
          rule.args.forEach((arg) => {
            const argNode = document.createElement('div');
            argNode.style.marginLeft = '10px';
            argNode.appendChild(
              this.renderLogicTree(arg, useColorblind, stateSnapshotInterface)
            );
            argsContainer.appendChild(argNode);
          });
          root.appendChild(argsContainer);
        }
        break;
      }

      case 'total_items_count': {
        root.appendChild(document.createTextNode(' (total items count)'));
        break;
      }

      case 'locations_checked': {
        root.appendChild(document.createTextNode(' (locations checked)'));
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
   * Renders a logic tree from a Rule Builder format rule object
   * @param {Object} rule - The Rule Builder format rule object
   * @param {boolean} useColorblind - Whether to show colorblind indicators
   * @param {object} stateSnapshotInterface - The interface providing state access methods
   * @param {*} evaluationResult - Pre-computed evaluation result (true, false, or undefined)
   * @param {HTMLElement} root - The root element to append to
   * @returns {HTMLElement} - The rendered logic tree
   * @private
   */
  _renderRuleBuilderTree(rule, useColorblind, stateSnapshotInterface, evaluationResult, root) {
    const ruleName = rule.rule;
    const args = rule.args || {};
    const children = rule.children || [];
    const child = rule.child;

    // Rule Builder rules are typically boolean-like (not value nodes)
    const isValueNode = ruleName === 'Count' || ruleName === 'CountItem' || ruleName === 'Arithmetic' || ruleName === 'MinValue';

    // Apply pass/fail styling
    if (evaluationResult === undefined) {
      this.unknownEvaluationCount++;
      root.classList.add('logic-node-unknown');
    } else if (!isValueNode) {
      if (evaluationResult === true) {
        root.classList.add('pass');
      } else if (evaluationResult === false) {
        root.classList.add('fail');
      } else {
        root.classList.add('logic-node-unknown');
      }
    }

    // Add colorblind symbol if enabled
    if (useColorblind) {
      const symbolSpan = document.createElement('span');
      symbolSpan.classList.add('colorblind-symbol');

      if (evaluationResult === undefined) {
        symbolSpan.textContent = '? ';
        symbolSpan.classList.add('unknown');
        root.appendChild(symbolSpan);
      } else if (!isValueNode) {
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

    // Create label
    const label = document.createElement('div');
    label.classList.add('logic-label');
    label.textContent = `Rule: ${ruleName}`;
    root.appendChild(label);

    // Handle each Rule Builder type
    switch (ruleName) {
      // Boolean literals
      case 'True_':
        root.appendChild(document.createTextNode(' (always true)'));
        break;

      case 'False_':
        root.appendChild(document.createTextNode(' (always false)'));
        break;

      // Constant value (from converted AST format)
      case 'Constant':
        root.appendChild(document.createTextNode(` value: ${args.value}`));
        break;

      // Item check: Has(item_name, count)
      case 'Has': {
        const itemName = args.item_name;
        const count = args.count ?? 1;
        root.appendChild(document.createTextNode(` item: ${itemName}`));
        if (count > 1) {
          root.appendChild(document.createTextNode(` (need ${count})`));
        }
        break;
      }

      // HasAll: all items required
      case 'HasAll': {
        const items = args.items || args.item_names || [];
        root.appendChild(document.createTextNode(` all of: [${items.join(', ')}]`));
        break;
      }

      // HasAny: any item required
      case 'HasAny': {
        const items = args.items || args.item_names || [];
        root.appendChild(document.createTextNode(` any of: [${items.join(', ')}]`));
        break;
      }

      // HasAllCounts: items with specific counts
      case 'HasAllCounts': {
        const itemCounts = args.items || args.item_counts || {};
        const countsList = Object.entries(itemCounts).map(([item, count]) => `${item}×${count}`).join(', ');
        root.appendChild(document.createTextNode(` all with counts: [${countsList}]`));
        break;
      }

      // HasAnyCount: any item with specific count
      case 'HasAnyCount': {
        const itemCounts = args.items || args.item_counts || {};
        const countsList = Object.entries(itemCounts).map(([item, count]) => `${item}×${count}`).join(', ');
        root.appendChild(document.createTextNode(` any with count: [${countsList}]`));
        break;
      }

      // HasFromList: N items from list
      case 'HasFromList': {
        const items = args.items || args.item_names || [];
        const count = args.count ?? 1;
        root.appendChild(document.createTextNode(` ${count} from: [${items.join(', ')}]`));
        break;
      }

      // HasFromListUnique: N unique items from list
      case 'HasFromListUnique': {
        const items = args.items || args.item_names || [];
        const count = args.count ?? 1;
        root.appendChild(document.createTextNode(` ${count} unique from: [${items.join(', ')}]`));
        break;
      }

      // HasGroup: items from group
      case 'HasGroup': {
        const groupName = args.group || args.item_name_group;
        const count = args.count ?? 1;
        root.appendChild(document.createTextNode(` group: ${groupName}`));
        if (count > 1) {
          root.appendChild(document.createTextNode(` (need ${count})`));
        }
        break;
      }

      // HasGroupUnique: unique items from group
      case 'HasGroupUnique': {
        const groupName = args.group || args.item_name_group;
        const count = args.count ?? 1;
        root.appendChild(document.createTextNode(` unique from group: ${groupName}`));
        if (count > 1) {
          root.appendChild(document.createTextNode(` (need ${count})`));
        }
        break;
      }

      // Composite: And
      case 'And': {
        const conditionsContainer = document.createElement('div');
        conditionsContainer.classList.add('logic-conditions');
        conditionsContainer.style.marginLeft = '10px';

        if (children.length === 0) {
          root.appendChild(document.createTextNode(' (empty - always true)'));
        } else {
          children.forEach((childRule, index) => {
            const conditionLabel = document.createElement('div');
            conditionLabel.textContent = `Condition #${index + 1}:`;
            conditionsContainer.appendChild(conditionLabel);

            conditionsContainer.appendChild(
              this.renderLogicTree(childRule, useColorblind, stateSnapshotInterface)
            );
          });
          root.appendChild(conditionsContainer);
        }
        break;
      }

      // Composite: Or
      case 'Or': {
        const conditionsContainer = document.createElement('div');
        conditionsContainer.classList.add('logic-conditions');
        conditionsContainer.style.marginLeft = '10px';

        if (children.length === 0) {
          root.appendChild(document.createTextNode(' (empty - always false)'));
        } else {
          children.forEach((childRule, index) => {
            const conditionLabel = document.createElement('div');
            conditionLabel.textContent = `Option #${index + 1}:`;
            conditionsContainer.appendChild(conditionLabel);

            conditionsContainer.appendChild(
              this.renderLogicTree(childRule, useColorblind, stateSnapshotInterface)
            );
          });
          root.appendChild(conditionsContainer);
        }
        break;
      }

      // Wrapper: Not
      case 'Not': {
        root.appendChild(document.createTextNode(' (negation)'));
        if (child) {
          const childContainer = document.createElement('div');
          childContainer.style.marginLeft = '10px';
          childContainer.appendChild(
            this.renderLogicTree(child, useColorblind, stateSnapshotInterface)
          );
          root.appendChild(childContainer);
        }
        break;
      }

      // Conditional
      case 'Conditional': {
        const conditionalDetails = document.createElement('div');
        conditionalDetails.classList.add('logic-conditional-details');
        conditionalDetails.style.marginLeft = '10px';

        if (args.test) {
          const testLabel = document.createElement('div');
          testLabel.textContent = 'Test Condition:';
          conditionalDetails.appendChild(testLabel);

          const testNode = document.createElement('div');
          testNode.style.marginLeft = '10px';
          testNode.appendChild(
            this.renderLogicTree(args.test, useColorblind, stateSnapshotInterface)
          );
          conditionalDetails.appendChild(testNode);
        }

        if (args.if_true) {
          const trueLabel = document.createElement('div');
          trueLabel.textContent = 'If True:';
          conditionalDetails.appendChild(trueLabel);

          const trueNode = document.createElement('div');
          trueNode.style.marginLeft = '10px';
          trueNode.appendChild(
            this.renderLogicTree(args.if_true, useColorblind, stateSnapshotInterface)
          );
          conditionalDetails.appendChild(trueNode);
        }

        if (args.if_false) {
          const falseLabel = document.createElement('div');
          falseLabel.textContent = 'If False:';
          conditionalDetails.appendChild(falseLabel);

          const falseNode = document.createElement('div');
          falseNode.style.marginLeft = '10px';
          falseNode.appendChild(
            this.renderLogicTree(args.if_false, useColorblind, stateSnapshotInterface)
          );
          conditionalDetails.appendChild(falseNode);
        }

        root.appendChild(conditionalDetails);
        break;
      }

      // Filtered wrapper
      case 'Filtered': {
        const options = rule.options || [];
        if (options.length > 0) {
          root.appendChild(document.createTextNode(` options: [${options.join(', ')}]`));
        }
        if (child) {
          const childContainer = document.createElement('div');
          childContainer.style.marginLeft = '10px';
          childContainer.appendChild(
            this.renderLogicTree(child, useColorblind, stateSnapshotInterface)
          );
          root.appendChild(childContainer);
        }
        break;
      }

      // Reachability: CanReachRegion
      case 'CanReachRegion': {
        const regionName = args.region_name;
        root.appendChild(document.createTextNode(` region: ${regionName}`));
        break;
      }

      // Reachability: CanReachLocation
      case 'CanReachLocation': {
        const locationName = args.location_name;
        root.appendChild(document.createTextNode(` location: ${locationName}`));
        break;
      }

      // Reachability: CanReachEntrance
      case 'CanReachEntrance': {
        const entranceName = args.entrance_name;
        root.appendChild(document.createTextNode(` entrance: ${entranceName}`));
        break;
      }

      // HelperCall
      case 'HelperCall': {
        const helperName = args.helper_name;
        const helperArgs = args.args || [];
        // Update the label to show as helper instead of Rule: HelperCall
        label.textContent = `helper: ${helperName}`;

        if (helperArgs.length > 0) {
          const argsText = helperArgs.map(arg => {
            if (typeof arg === 'string' || typeof arg === 'number') {
              return arg;
            } else if (arg && arg.type === 'constant') {
              return arg.value;
            } else if (arg && arg.rule) {
              return `(${arg.rule})`;
            } else {
              return '(complex)';
            }
          }).join(', ');
          root.appendChild(document.createTextNode(`, args: [${argsText}]`));
        }

        // If body_data is present, show it can be expanded
        const bodyData = args.body_data;
        if (bodyData) {
          const bodyContainer = document.createElement('div');
          bodyContainer.style.marginLeft = '10px';
          bodyContainer.style.marginTop = '4px';

          const expandBtn = document.createElement('button');
          expandBtn.textContent = '[+] Show body';
          expandBtn.style.fontSize = '12px';
          expandBtn.style.padding = '0 4px';
          expandBtn.style.cursor = 'pointer';
          expandBtn.style.border = '1px solid #666';
          expandBtn.style.backgroundColor = '#333';
          expandBtn.style.color = '#ccc';

          let isExpanded = false;
          const bodyTreeContainer = document.createElement('div');
          bodyTreeContainer.style.display = 'none';
          bodyTreeContainer.style.marginTop = '4px';

          expandBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isExpanded = !isExpanded;
            if (isExpanded) {
              expandBtn.textContent = '[-] Hide body';
              bodyTreeContainer.style.display = 'block';
              // Render body on first expand
              if (bodyTreeContainer.children.length === 0) {
                const bodyRule = bodyData.body || bodyData;
                bodyTreeContainer.appendChild(
                  this.renderLogicTree(bodyRule, useColorblind, stateSnapshotInterface)
                );
              }
            } else {
              expandBtn.textContent = '[+] Show body';
              bodyTreeContainer.style.display = 'none';
            }
          });

          bodyContainer.appendChild(expandBtn);
          bodyContainer.appendChild(bodyTreeContainer);
          root.appendChild(bodyContainer);
        }
        break;
      }

      // Compare
      case 'Compare': {
        const op = args.op || '==';
        root.appendChild(document.createTextNode(` (${op})`));

        const compareDetails = document.createElement('div');
        compareDetails.classList.add('logic-compare-details');
        compareDetails.style.marginLeft = '10px';

        if (args.left) {
          const leftLabel = document.createElement('div');
          leftLabel.textContent = 'Left Operand:';
          compareDetails.appendChild(leftLabel);

          const leftNode = document.createElement('div');
          leftNode.style.marginLeft = '10px';
          leftNode.appendChild(
            this.renderLogicTree(args.left, useColorblind, stateSnapshotInterface)
          );
          compareDetails.appendChild(leftNode);
        }

        const opLabel = document.createElement('div');
        opLabel.textContent = `Operator: ${op}`;
        compareDetails.appendChild(opLabel);

        if (args.right !== undefined) {
          const rightLabel = document.createElement('div');
          rightLabel.textContent = 'Right Operand:';
          compareDetails.appendChild(rightLabel);

          const rightNode = document.createElement('div');
          rightNode.style.marginLeft = '10px';
          if (args.right && typeof args.right === 'object' && (args.right.type || args.right.rule)) {
            rightNode.appendChild(
              this.renderLogicTree(args.right, useColorblind, stateSnapshotInterface)
            );
          } else {
            rightNode.textContent = JSON.stringify(args.right);
          }
          compareDetails.appendChild(rightNode);
        }

        root.appendChild(compareDetails);
        break;
      }

      // Arithmetic
      case 'Arithmetic': {
        const op = args.op || '+';
        root.appendChild(document.createTextNode(` (${op})`));

        const arithmeticDetails = document.createElement('div');
        arithmeticDetails.classList.add('logic-arithmetic-details');
        arithmeticDetails.style.marginLeft = '10px';

        if (args.left) {
          const leftLabel = document.createElement('div');
          leftLabel.textContent = 'Left Operand:';
          arithmeticDetails.appendChild(leftLabel);

          const leftNode = document.createElement('div');
          leftNode.style.marginLeft = '10px';
          leftNode.appendChild(
            this.renderLogicTree(args.left, useColorblind, stateSnapshotInterface)
          );
          arithmeticDetails.appendChild(leftNode);
        }

        if (args.right !== undefined) {
          const rightLabel = document.createElement('div');
          rightLabel.textContent = 'Right Operand:';
          arithmeticDetails.appendChild(rightLabel);

          const rightNode = document.createElement('div');
          rightNode.style.marginLeft = '10px';
          if (args.right && typeof args.right === 'object' && (args.right.type || args.right.rule)) {
            rightNode.appendChild(
              this.renderLogicTree(args.right, useColorblind, stateSnapshotInterface)
            );
          } else {
            rightNode.textContent = JSON.stringify(args.right);
          }
          arithmeticDetails.appendChild(rightNode);
        }

        root.appendChild(arithmeticDetails);
        break;
      }

      // MinValue
      case 'MinValue': {
        root.appendChild(document.createTextNode(' min()'));

        const minDetails = document.createElement('div');
        minDetails.style.marginLeft = '10px';

        if (args.left) {
          const leftLabel = document.createElement('div');
          leftLabel.textContent = 'Value 1:';
          minDetails.appendChild(leftLabel);

          const leftNode = document.createElement('div');
          leftNode.style.marginLeft = '10px';
          leftNode.appendChild(
            this.renderLogicTree(args.left, useColorblind, stateSnapshotInterface)
          );
          minDetails.appendChild(leftNode);
        }

        if (args.right !== undefined) {
          const rightLabel = document.createElement('div');
          rightLabel.textContent = 'Value 2:';
          minDetails.appendChild(rightLabel);

          const rightNode = document.createElement('div');
          rightNode.style.marginLeft = '10px';
          if (args.right && typeof args.right === 'object' && (args.right.type || args.right.rule)) {
            rightNode.appendChild(
              this.renderLogicTree(args.right, useColorblind, stateSnapshotInterface)
            );
          } else {
            rightNode.textContent = JSON.stringify(args.right);
          }
          minDetails.appendChild(rightNode);
        }

        root.appendChild(minDetails);
        break;
      }

      // Count/CountItem
      case 'Count':
      case 'CountItem': {
        const itemName = args.item_name;
        root.appendChild(document.createTextNode(` count of: ${itemName}`));
        break;
      }

      // ASTRule wrapper - contains AST format in body_data
      case 'ASTRule': {
        const bodyData = args.body_data;
        if (bodyData) {
          root.appendChild(document.createTextNode(' (AST wrapper)'));
          const bodyContainer = document.createElement('div');
          bodyContainer.style.marginLeft = '10px';
          bodyContainer.appendChild(
            this.renderLogicTree(bodyData, useColorblind, stateSnapshotInterface)
          );
          root.appendChild(bodyContainer);
        } else {
          root.appendChild(document.createTextNode(' (empty AST wrapper)'));
        }
        break;
      }

      // AST_region_check: region reachability check
      case 'AST_region_check': {
        const regionName = args.region;
        root.appendChild(document.createTextNode(` region: ${regionName}`));
        break;
      }

      // AST_location_rule_ref: location rule reference
      case 'AST_location_rule_ref': {
        const locationName = args.location;
        root.appendChild(document.createTextNode(` location: ${locationName}`));
        break;
      }

      // AST_setting_value: setting value lookup
      case 'AST_setting_value': {
        const settingName = args.setting || args.name;
        root.appendChild(document.createTextNode(` setting: ${settingName}`));
        break;
      }

      // AST_prog_item_count: progressive item count
      case 'AST_prog_item_count': {
        const itemName = args.item;
        root.appendChild(document.createTextNode(` count of: ${itemName}`));
        break;
      }

      // AST_count_item: count item
      case 'AST_count_item': {
        const itemName = args.item;
        root.appendChild(document.createTextNode(` count of: ${itemName}`));
        break;
      }

      // AST_function_call: complex function call
      case 'AST_function_call': {
        root.appendChild(document.createTextNode(' (function call)'));
        // Show the function and args if present
        const funcDetails = document.createElement('div');
        funcDetails.style.marginLeft = '10px';
        if (args.function) {
          const funcLabel = document.createElement('div');
          funcLabel.textContent = 'Function:';
          funcDetails.appendChild(funcLabel);
          funcDetails.appendChild(
            this.renderLogicTree(args.function, useColorblind, stateSnapshotInterface)
          );
        }
        if (args.args && args.args.length > 0) {
          const argsLabel = document.createElement('div');
          argsLabel.textContent = 'Arguments:';
          funcDetails.appendChild(argsLabel);
          args.args.forEach((arg, index) => {
            const argContainer = document.createElement('div');
            argContainer.style.marginLeft = '10px';
            argContainer.appendChild(
              this.renderLogicTree(arg, useColorblind, stateSnapshotInterface)
            );
            funcDetails.appendChild(argContainer);
          });
        }
        root.appendChild(funcDetails);
        break;
      }

      // AST_comparison: comparison operation
      case 'AST_comparison': {
        const op = args.op || '==';
        root.appendChild(document.createTextNode(` (${op})`));
        const compDetails = document.createElement('div');
        compDetails.style.marginLeft = '10px';
        if (args.left) {
          const leftLabel = document.createElement('div');
          leftLabel.textContent = 'Left:';
          compDetails.appendChild(leftLabel);
          compDetails.appendChild(
            this.renderLogicTree(args.left, useColorblind, stateSnapshotInterface)
          );
        }
        if (args.right) {
          const rightLabel = document.createElement('div');
          rightLabel.textContent = 'Right:';
          compDetails.appendChild(rightLabel);
          compDetails.appendChild(
            this.renderLogicTree(args.right, useColorblind, stateSnapshotInterface)
          );
        }
        root.appendChild(compDetails);
        break;
      }

      // AST_block: code block
      case 'AST_block': {
        root.appendChild(document.createTextNode(' (block)'));
        if (args.body && args.body.length > 0) {
          const blockDetails = document.createElement('div');
          blockDetails.style.marginLeft = '10px';
          args.body.forEach((stmt, index) => {
            blockDetails.appendChild(
              this.renderLogicTree(stmt, useColorblind, stateSnapshotInterface)
            );
          });
          root.appendChild(blockDetails);
        }
        break;
      }

      // AST_placement_search: placement search
      case 'AST_placement_search': {
        root.appendChild(document.createTextNode(' (placement search)'));
        break;
      }

      // AST_placement_lookup: placement lookup
      case 'AST_placement_lookup': {
        root.appendChild(document.createTextNode(' (placement lookup)'));
        break;
      }

      // List: list/array value
      case 'List': {
        const values = args.value || [];
        if (values.length <= 3) {
          // Show inline for short lists
          const valuesText = values.map(v => {
            if (v && v.rule === 'Constant') {
              return v.args?.value;
            }
            return '...';
          }).join(', ');
          root.appendChild(document.createTextNode(` [${valuesText}]`));
        } else {
          root.appendChild(document.createTextNode(` [${values.length} items]`));
        }
        break;
      }

      // Name: variable/name reference
      case 'Name': {
        const name = args.name;
        root.appendChild(document.createTextNode(` ${name}`));
        break;
      }

      // Attribute: attribute access
      case 'Attribute': {
        const attr = args.attr;
        root.appendChild(document.createTextNode(` .${attr}`));
        if (args.object) {
          const objContainer = document.createElement('div');
          objContainer.style.marginLeft = '10px';
          objContainer.appendChild(
            this.renderLogicTree(args.object, useColorblind, stateSnapshotInterface)
          );
          root.appendChild(objContainer);
        }
        break;
      }

      // StateMethod: state method call
      case 'StateMethod': {
        const method = args.method;
        root.appendChild(document.createTextNode(` .${method}()`));
        if (args.args && args.args.length > 0) {
          const argsContainer = document.createElement('div');
          argsContainer.style.marginLeft = '10px';
          args.args.forEach(arg => {
            argsContainer.appendChild(
              this.renderLogicTree(arg, useColorblind, stateSnapshotInterface)
            );
          });
          root.appendChild(argsContainer);
        }
        break;
      }

      // Tuple: tuple value
      case 'Tuple': {
        const values = args.value || [];
        root.appendChild(document.createTextNode(` (${values.length} elements)`));
        break;
      }

      // CountGroup: count items in group
      case 'CountGroup': {
        const groupName = args.group;
        root.appendChild(document.createTextNode(` count group: ${groupName}`));
        break;
      }

      // CountGroupUnique: count unique items in group
      case 'CountGroupUnique': {
        const groupName = args.group;
        root.appendChild(document.createTextNode(` count unique in group: ${groupName}`));
        break;
      }

      // SettingValue: get setting value
      case 'SettingValue': {
        const settingName = args.setting;
        root.appendChild(document.createTextNode(` setting: ${settingName}`));
        break;
      }

      // ItemCheck: item check (fallback from converter)
      case 'ItemCheck': {
        const item = args.item;
        const count = args.count ?? 1;
        root.appendChild(document.createTextNode(` item: ${typeof item === 'string' ? item : '(complex)'}`));
        if (count > 1) {
          root.appendChild(document.createTextNode(` (need ${count})`));
        }
        break;
      }

      // Unknown Rule Builder type - likely a converted helper call
      default: {
        // Check if this is a converted helper rule
        // _original_ast_type can be in args or at rule level depending on export format
        // _converted_from_ast is always at rule level
        if (args._original_ast_type?.endsWith('helper') || rule._original_ast_type?.endsWith('helper') || rule._converted_from_ast) {
          // This is a helper call converted from AST format
          // Update the label to show as helper instead of Rule: helper_name
          label.textContent = `helper: ${ruleName}`;
          // Display args if present
          // New simplified format: rule.args is an array directly
          // Old nested format: rule.args.args is the array
          const helperArgs = Array.isArray(rule.args) ? rule.args : (args.args || []);
          if (helperArgs.length > 0) {
            const argsText = helperArgs.map(arg => {
              if (typeof arg === 'string' || typeof arg === 'number') {
                return arg;
              } else if (arg && arg.type === 'constant') {
                return arg.value;
              } else if (arg && arg.rule === 'Constant') {
                return arg.args?.value;
              } else if (arg && arg.rule) {
                return `(${arg.rule})`;
              } else if (Array.isArray(arg)) {
                return `[${arg.length} items]`;
              } else {
                return '(complex)';
              }
            }).join(', ');
            root.appendChild(document.createTextNode(`(${argsText})`));
          } else {
            root.appendChild(document.createTextNode('()'));
          }

          // Try to look up helper definition from static data for expand/collapse
          let helperDef = null;
          if (stateSnapshotInterface && typeof stateSnapshotInterface.getStaticData === 'function') {
            const staticData = stateSnapshotInterface.getStaticData();
            if (staticData?.helpers) {
              // helpers is keyed by player ID, try common player IDs
              const playerIds = ['1', '0', 1, 0];
              for (const pid of playerIds) {
                if (staticData.helpers[pid]?.[ruleName]) {
                  helperDef = staticData.helpers[pid][ruleName];
                  break;
                }
              }
            }
          }

          // If we found a helper definition, add expand/collapse button
          if (helperDef) {
            const bodyContainer = document.createElement('div');
            bodyContainer.style.marginLeft = '10px';
            bodyContainer.style.marginTop = '4px';

            const expandBtn = document.createElement('button');
            expandBtn.textContent = '[+] Show helper body';
            expandBtn.style.fontSize = '12px';
            expandBtn.style.padding = '0 4px';
            expandBtn.style.cursor = 'pointer';
            expandBtn.style.border = '1px solid #666';
            expandBtn.style.backgroundColor = '#333';
            expandBtn.style.color = '#ccc';

            let isExpanded = false;
            const bodyTreeContainer = document.createElement('div');
            bodyTreeContainer.style.display = 'none';
            bodyTreeContainer.style.marginTop = '4px';

            expandBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              isExpanded = !isExpanded;
              if (isExpanded) {
                expandBtn.textContent = '[-] Hide helper body';
                bodyTreeContainer.style.display = 'block';
                // Render body on first expand
                if (bodyTreeContainer.children.length === 0) {
                  // Helper definition can be in different formats:
                  // 1. { body: {...}, params: [...] } - parameterized helper
                  // 2. { type: 'or', conditions: [...] } - direct rule
                  // 3. { statements: [...], type: 'block' } - block
                  const bodyRule = helperDef.body || helperDef;
                  bodyTreeContainer.appendChild(
                    this.renderLogicTree(bodyRule, useColorblind, stateSnapshotInterface)
                  );
                }
              } else {
                expandBtn.textContent = '[+] Show helper body';
                bodyTreeContainer.style.display = 'none';
              }
            });

            bodyContainer.appendChild(expandBtn);
            bodyContainer.appendChild(bodyTreeContainer);
            root.appendChild(bodyContainer);
          }
        } else {
          root.appendChild(document.createTextNode(' [unhandled Rule Builder type]'));
          // Show args if any
          if (Object.keys(args).length > 0) {
            const argsText = JSON.stringify(args);
            if (argsText.length < 100) {
              root.appendChild(document.createTextNode(` args: ${argsText}`));
            }
          }
        }
        // Show children if any
        if (children.length > 0) {
          const childrenContainer = document.createElement('div');
          childrenContainer.style.marginLeft = '10px';
          children.forEach((childRule, index) => {
            const childLabel = document.createElement('div');
            childLabel.textContent = `Child #${index + 1}:`;
            childrenContainer.appendChild(childLabel);
            childrenContainer.appendChild(
              this.renderLogicTree(childRule, useColorblind, stateSnapshotInterface)
            );
          });
          root.appendChild(childrenContainer);
        }
        // Show child if present
        if (child) {
          const childContainer = document.createElement('div');
          childContainer.style.marginLeft = '10px';
          childContainer.appendChild(
            this.renderLogicTree(child, useColorblind, stateSnapshotInterface)
          );
          root.appendChild(childContainer);
        }
        if (!args._original_ast_type && !rule._original_ast_type && !rule._converted_from_ast) {
          log('debug', `[commonUI] Unhandled Rule Builder type: ${ruleName}`, rule);
        }
      }
    }

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

      if (!eventBus) {
        log('error', '[commonUI] eventBus not available - cannot publish events');
        return;
      }

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

    // Get location accessibility from locationReachability in the snapshot
    const locationReachability = snapshot?.locationReachability?.[locationName];
    const isLocationAccessible = locationReachability === 'reachable' || locationReachability === true;

    // Check if location is checked
    const checkedLocations = new Set(snapshot?.checkedLocations || []);
    const isChecked = checkedLocations.has(locationName);

    // Check if the region is accessible
    const regionStatus = snapshot?.regionReachability?.[regionName];
    const isRegionAccessible = (
      regionStatus === 'reachable' ||
      regionStatus === 'checked' ||
      regionStatus === true
    );

    // Location is only truly accessible if both location AND region are accessible
    const isFullyAccessible = isLocationAccessible && isRegionAccessible;

    // Set appropriate class based on accessibility state
    if (isChecked) {
      link.classList.add('checked-loc');
    } else if (isFullyAccessible) {
      link.classList.add('accessible');
    } else if (isLocationAccessible && !isRegionAccessible) {
      link.classList.add('accessible-but-unreachable');
    } else {
      link.classList.add('inaccessible');
    }

    // Add colorblind symbol if enabled
    if (useColorblindMode) {
      const symbolSpan = document.createElement('span');
      symbolSpan.classList.add('colorblind-symbol');

      if (isFullyAccessible) {
        symbolSpan.textContent = ' ✓';
        symbolSpan.classList.add('accessible');
      } else if (isLocationAccessible && !isRegionAccessible) {
        symbolSpan.textContent = ' ⚠';
        symbolSpan.classList.add('accessible-but-unreachable');
      } else {
        symbolSpan.textContent = ' ✗';
        symbolSpan.classList.add('inaccessible');
      }

      link.appendChild(symbolSpan);
    }

    // Add click handler
    link.addEventListener('click', (e) => {
      e.stopPropagation();

      if (!eventBus) {
        log('error', '[commonUI] No eventBus available - cannot publish events. Location: ' + locationName);
        return;
      }

      // First activate the Regions panel
      eventBus.publish('ui:activatePanel', { panelId: 'regionsPanel' });
      log('info', `[commonUI] Published ui:activatePanel for regionsPanel.`);

      // Then publish navigation to the location
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
 * Setup cross-browser dropdown event handling
 * This fixes Firefox issues where dropdown selection doesn't fire standard events
 * Further testing reveals that this fix is only necessary when running in Firefox in WSL.
 * @param {HTMLSelectElement} selectElement - The dropdown element
 * @param {Function} onSelectionChange - Callback when selection changes (receives the selected value)
 */
export function setupCrossBrowserDropdown(selectElement, onSelectionChange) {
  let lastValue = selectElement.value;
  
  log('info', 'Setting up cross-browser dropdown event handling');
  
  // Check if we're in Firefox
  const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
  
  if (isFirefox) {
    log('info', 'Firefox detected - using alternative dropdown handling');
    
    // For Firefox, replace the problematic select with click-based option handling
    const createFirefoxDropdownWorkaround = () => {
      // Create a custom dropdown that works reliably in Firefox
      const wrapper = document.createElement('div');
      wrapper.style.position = 'relative';
      wrapper.style.display = 'inline-block';
      wrapper.style.width = '100%';
      
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = selectElement.options[selectElement.selectedIndex]?.textContent || 'Select...';
      button.style.width = '100%';
      button.style.padding = '8px';
      button.style.border = '1px solid #555';
      button.style.borderRadius = '4px';
      button.style.background = '#2d2d30';
      button.style.color = '#cccccc';
      button.style.textAlign = 'left';
      button.style.cursor = 'pointer';
      
      const dropdown = document.createElement('div');
      dropdown.style.position = 'absolute';
      dropdown.style.top = '100%';
      dropdown.style.left = '0';
      dropdown.style.right = '0';
      dropdown.style.background = '#2d2d30';
      dropdown.style.border = '1px solid #555';
      dropdown.style.borderTop = 'none';
      dropdown.style.borderRadius = '0 0 4px 4px';
      dropdown.style.display = 'none';
      dropdown.style.zIndex = '1000';
      dropdown.style.maxHeight = '200px';
      dropdown.style.overflowY = 'auto';
      
      // Function to rebuild dropdown options
      const rebuildOptions = () => {
        dropdown.innerHTML = ''; // Clear existing options
        
        Array.from(selectElement.options).forEach((option, index) => {
          const optionDiv = document.createElement('div');
          optionDiv.textContent = option.textContent;
          optionDiv.style.padding = '8px';
          optionDiv.style.cursor = 'pointer';
          optionDiv.style.borderBottom = '1px solid #444';
          
          optionDiv.addEventListener('mouseover', () => {
            optionDiv.style.background = '#404040';
          });
          
          optionDiv.addEventListener('mouseout', () => {
            optionDiv.style.background = 'transparent';
          });
          
          optionDiv.addEventListener('click', () => {
            // Update the original select element
            selectElement.selectedIndex = index;
            selectElement.value = option.value;
            
            // Update button text
            button.textContent = option.textContent;
            
            // Hide dropdown
            dropdown.style.display = 'none';
            
            // Trigger callback
            if (option.value !== lastValue) {
              lastValue = option.value;
              log('info', `Firefox workaround: Selected "${option.value}"`);
              onSelectionChange(option.value);
            }
          });
          
          dropdown.appendChild(optionDiv);
        });
        
        // Update button text to reflect current selection
        if (selectElement.selectedIndex >= 0) {
          button.textContent = selectElement.options[selectElement.selectedIndex].textContent;
        }
      };
      
      // Initial population
      rebuildOptions();
      
      // Watch for changes to the original select element
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            log('info', 'Firefox: Detected changes to select options, rebuilding dropdown');
            rebuildOptions();
          }
        });
      });
      
      observer.observe(selectElement, {
        childList: true,
        subtree: true
      });
      
      button.addEventListener('click', () => {
        const isVisible = dropdown.style.display === 'block';
        dropdown.style.display = isVisible ? 'none' : 'block';
      });
      
      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
          dropdown.style.display = 'none';
        }
      });
      
      wrapper.appendChild(button);
      wrapper.appendChild(dropdown);
      
      // Replace the original select
      selectElement.style.display = 'none';
      selectElement.parentNode.insertBefore(wrapper, selectElement);
    };
    
    createFirefoxDropdownWorkaround();
    
  } else {
    // Standard events for non-Firefox browsers
    selectElement.addEventListener('change', (e) => {
      log('info', `Dropdown change event: "${e.target.value}" (was "${lastValue}")`);
      if (e.target.value !== lastValue) {
        lastValue = e.target.value;
        onSelectionChange(e.target.value);
      }
    });
    
    selectElement.addEventListener('input', (e) => {
      log('info', `Dropdown input event: "${e.target.value}" (was "${lastValue}")`);
      if (e.target.value !== lastValue) {
        lastValue = e.target.value;
        onSelectionChange(e.target.value);
      }
    });
  }
}

/**
 * Debounce function: Limits the rate at which a function can fire.
 * @param {Function} func The function to debounce.
 * @param {number} wait The number of millisconds to delay.
 * @param {boolean} immediate If true, trigger the function on the leading edge instead of the trailing.
 * @returns {Function} The debounced function.
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
