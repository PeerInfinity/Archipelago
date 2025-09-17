// commonUI.js - Common UI functions that can be shared between components

import { evaluateRule } from '../shared/ruleEngine.js';
// Import the function directly from its source file
import { createStateSnapshotInterface } from '../shared/stateInterface.js';
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import settingsManager from '../../app/core/settingsManager.js';
import eventBusCore from '../../app/core/eventBus.js';
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

    if (!snapshot?.locationItems || !staticData?.locations) {
      return null;
    }

    // Find all locations that have this item
    const locationInfos = [];
    for (const [locName, itemData] of Object.entries(snapshot.locationItems)) {
      if (itemData && itemData.name === itemName) {
        // Get the location's region from static data
        const locData = Object.values(staticData.locations).find(l => l.name === locName);
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
        // Display helper name with expand/collapse button
        root.appendChild(document.createTextNode(` helper: ${rule.name}`));

        // Add expand/collapse button for helper code
        const expandBtn = document.createElement('button');
        expandBtn.textContent = '[+]';
        expandBtn.style.marginLeft = '8px';
        expandBtn.style.fontSize = '12px';
        expandBtn.style.padding = '0 4px';
        expandBtn.style.cursor = 'pointer';
        expandBtn.style.border = '1px solid #666';
        expandBtn.style.backgroundColor = '#333';
        expandBtn.style.color = '#ccc';
        expandBtn.title = 'Show helper function code';

        // Container for the helper code (initially hidden)
        const codeContainer = document.createElement('div');
        codeContainer.style.display = 'none';
        codeContainer.style.marginTop = '8px';
        codeContainer.style.marginLeft = '20px';
        codeContainer.style.padding = '8px';
        codeContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
        codeContainer.style.border = '1px solid #444';
        codeContainer.style.borderRadius = '4px';
        codeContainer.style.fontFamily = 'monospace';
        codeContainer.style.fontSize = '12px';
        codeContainer.style.whiteSpace = 'pre-wrap';
        codeContainer.style.overflowX = 'auto';

        let isExpanded = false;
        let codeLoaded = false;

        expandBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          isExpanded = !isExpanded;

          if (isExpanded) {
            expandBtn.textContent = '[-]';
            expandBtn.title = 'Hide helper function code';
            codeContainer.style.display = 'block';

            // Load code if not already loaded
            if (!codeLoaded) {
              codeContainer.textContent = 'Loading...';

              try {
                // Get static data to determine game directory
                const staticData = stateManager.getStaticData();
                const gameDir = staticData?.game_directory;

                if (!gameDir) {
                  throw new Error('Game directory not found in static data');
                }

                // Construct the path to the helper file
                const helperPath = `/frontend/modules/shared/gameLogic/${gameDir}/${gameDir}Logic.js`;

                // Fetch the helper file
                const response = await fetch(helperPath);
                if (!response.ok) {
                  throw new Error(`Failed to load helper file: ${response.status}`);
                }

                const helperCode = await response.text();

                // Extract the specific helper function
                const helperFunctionCode = this._extractHelperFunction(helperCode, rule.name);

                if (helperFunctionCode) {
                  // Create a container for the formatted code
                  codeContainer.innerHTML = '';

                  // Always format the code to highlight item names
                  const formattedCode = await this._formatHelperCode(helperFunctionCode, stateSnapshotInterface);
                  codeContainer.appendChild(formattedCode);

                  codeLoaded = true;
                } else {
                  codeContainer.textContent = `Helper function '${rule.name}' not found in ${helperPath}`;
                }
              } catch (error) {
                log('error', `Failed to load helper function: ${error.message}`);
                codeContainer.textContent = `Error loading helper: ${error.message}`;
              }
            }
          } else {
            expandBtn.textContent = '[+]';
            expandBtn.title = 'Show helper function code';
            codeContainer.style.display = 'none';
          }
        });

        root.appendChild(expandBtn);

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

        // Add the code container to the root
        root.appendChild(codeContainer);
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

      if (!eventBus) {
        log('error', '[commonUI] eventBus not available - cannot publish events');
        return;
      }

      // Publish panel activation first
      eventBus.publish('ui:activatePanel', { panelId: 'regionsPanel' }, 'commonUI');
      log('info', `[commonUI] Published ui:activatePanel for regionsPanel.`);

      // Then publish navigation
      eventBus.publish('ui:navigateToRegion', { regionName: regionName }, 'commonUI');
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

      // Use injected eventBus if available, otherwise fall back to imported eventBusCore
      const activeEventBus = eventBus || eventBusCore;

      if (!activeEventBus) {
        log('error', '[commonUI] No eventBus available - cannot publish events. Location: ' + locationName);
        return;
      }

      // First activate the Regions panel
      activeEventBus.publish('ui:activatePanel', { panelId: 'regionsPanel' }, 'commonUI');
      log('info', `[commonUI] Published ui:activatePanel for regionsPanel.`);

      // Then publish navigation to the location
      log(
        'info',
        `[commonUI] Publishing ui:navigateToLocation for ${locationName} in ${regionName}`
      );
      activeEventBus.publish('ui:navigateToLocation', {
        locationName: locationName,
        regionName: regionName,
      }, 'commonUI');
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
