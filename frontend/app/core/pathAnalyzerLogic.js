// pathAnalyzerLogic.js
import { evaluateRule } from './ruleEngine.js';
import stateManager from './stateManagerSingleton.js';

/**
 * Core logic for path analysis, separated from UI concerns
 * Handles path finding, rule evaluation, and node categorization
 */
export class PathAnalyzerLogic {
  constructor() {
    // Configure maximum iterations for path finding to prevent UI freezes
    this.maxPathFinderIterations = 10000;
    this.debugMode = false;
  }

  /**
   * Sets the debug mode
   * @param {boolean} debug - Whether debug mode is enabled
   */
  setDebugMode(debug) {
    this.debugMode = debug;
  }

  /**
   * Finds paths to a region using BFS
   * @param {string} targetRegion - The region to find paths to
   * @param {number} maxPaths - Maximum number of paths to find
   * @returns {Array} - Array of paths to the target region
   */
  findPathsToRegion(targetRegion, maxPaths = 100) {
    const paths = [];

    // Use stateManager's computeReachableRegions to check if the target is reachable at all
    const reachableRegions = stateManager.computeReachableRegions();

    if (!reachableRegions.has(targetRegion)) {
      this._logDebug(
        `Target region ${targetRegion} is not reachable according to stateManager`
      );
      // Still attempt to find paths, which might reveal why it's unreachable
    }

    const startRegions = stateManager.getStartRegions();

    for (const startRegion of startRegions) {
      if (paths.length >= maxPaths) break;
      this._findPathsDFS(
        startRegion,
        targetRegion,
        [startRegion],
        new Set([startRegion]),
        paths,
        maxPaths
      );
    }

    return paths;
  }

  /**
   * Helper method for DFS path finding
   * @private
   */
  _findPathsDFS(
    currentRegion,
    targetRegion,
    currentPath,
    visited,
    allPaths,
    maxPaths
  ) {
    if (currentRegion === targetRegion && currentPath.length > 1) {
      allPaths.push([...currentPath]);
      return;
    }

    if (allPaths.length >= maxPaths) return;

    const regionData = stateManager.regions[currentRegion];
    if (!regionData) return;

    for (const exit of regionData.exits || []) {
      const nextRegion = exit.connected_region;
      if (!nextRegion || visited.has(nextRegion)) continue;

      visited.add(nextRegion);
      currentPath.push(nextRegion);
      this._findPathsDFS(
        nextRegion,
        targetRegion,
        currentPath,
        visited,
        allPaths,
        maxPaths
      );
      currentPath.pop();
      visited.delete(nextRegion);
    }
  }

  /**
   * Find all transitions in a path, including blocked and open transitions
   * @param {Array<string>} path - Array of region names
   * @returns {Array<Object>} - Array of transition objects
   */
  findAllTransitions(path) {
    const transitions = [];

    for (let i = 0; i < path.length - 1; i++) {
      const fromRegion = path[i];
      const toRegion = path[i + 1];

      // Get the region data
      const fromRegionData = stateManager.regions[fromRegion];
      if (!fromRegionData || !fromRegionData.exits) continue;

      // Find ALL exits that connect these regions
      const availableExits = fromRegionData.exits.filter(
        (e) => e.connected_region === toRegion
      );

      if (availableExits.length === 0) continue;

      // Log what we found for debugging
      this._logDebug(
        `Transition ${fromRegion} → ${toRegion}: Found ${availableExits.length} exits`
      );

      // Evaluate all exits to determine if ANY are accessible
      const accessibleExits = availableExits.filter(
        (exit) => !exit.access_rule || evaluateRule(exit.access_rule)
      );

      // Log the accessible exits
      this._logDebug(
        `Transition ${fromRegion} → ${toRegion}: ${accessibleExits.length} accessible exits:`,
        accessibleExits.map((e) => e.name)
      );

      // The transition is accessible if ANY exit is accessible
      const transitionAccessible = accessibleExits.length > 0;

      // Add this transition to our list
      transitions.push({
        fromRegion,
        toRegion,
        exits: availableExits,
        isBlocking:
          stateManager.isRegionReachable(fromRegion) &&
          !stateManager.isRegionReachable(toRegion),
        // The transition is accessible if ANY exit is accessible
        transitionAccessible: transitionAccessible,
      });
    }

    // Debug logging for transitions
    this._logDebug('Path transitions debug:');
    transitions.forEach((t) => {
      this._logDebug(
        `Transition ${t.fromRegion} → ${t.toRegion}:`,
        `Accessible: ${t.transitionAccessible}, ` +
          `Exits: ${t.exits.length}, ` +
          `Accessible exits: ${
            t.exits.filter((e) => !e.access_rule || evaluateRule(e.access_rule))
              .length
          }`
      );
    });

    return transitions;
  }

  /**
   * Debug a specific transition between two regions
   * @param {Array<Object>} transitions - List of transitions
   * @param {string} fromRegion - Starting region name
   * @param {string} toRegion - Destination region name
   * @returns {Object|null} - The transition object if found
   */
  debugTransition(transitions, fromRegion, toRegion) {
    const transition = transitions.find(
      (t) => t.fromRegion === fromRegion && t.toRegion === toRegion
    );

    if (!transition) {
      this._logDebug(
        `DEBUG: No transition found from ${fromRegion} to ${toRegion}`
      );
      return;
    }

    this._logDebug(`DEBUG: Transition ${fromRegion} → ${toRegion}:`);
    this._logDebug(
      `  Marked as: ${
        transition.transitionAccessible ? 'ACCESSIBLE' : 'INACCESSIBLE'
      }`
    );
    this._logDebug(`  Exits count: ${transition.exits.length}`);

    transition.exits.forEach((exit, i) => {
      const accessible = !exit.access_rule || evaluateRule(exit.access_rule);
      this._logDebug(
        `  Exit ${i + 1}/${transition.exits.length}: ${exit.name} - ${
          accessible ? 'ACCESSIBLE' : 'INACCESSIBLE'
        }`
      );
    });

    return transition;
  }

  /**
   * Analyze all direct connections to a region
   * @param {string} regionName - The region to analyze
   * @returns {Object} - Analysis results containing node categories and region data
   */
  analyzeDirectConnections(regionName) {
    const allNodes = {
      primaryBlockers: [],
      secondaryBlockers: [],
      tertiaryBlockers: [],
      primaryRequirements: [],
      secondaryRequirements: [],
      tertiaryRequirements: [],
    };

    const regionData = stateManager.regions[regionName];
    const analysisData = {
      entrances: [],
      regionRules: [],
    };

    // 1. Analyze region's own rules
    if (regionData?.region_rules?.length > 0) {
      regionData.region_rules.forEach((rule) => {
        if (!rule) return;

        analysisData.regionRules.push(rule);
      });
    }

    // 2. Analyze entrances to this region
    Object.entries(stateManager.regions).forEach(
      ([otherRegionName, otherRegionData]) => {
        if (otherRegionName === regionName) return;

        if (otherRegionData.exits) {
          const entrances = otherRegionData.exits.filter(
            (exit) => exit.connected_region === regionName && exit.access_rule
          );

          if (entrances.length > 0) {
            entrances.forEach((entrance) => {
              analysisData.entrances.push({
                fromRegion: otherRegionName,
                entrance: entrance,
              });
            });
          }
        }
      }
    );

    return {
      nodes: allNodes,
      analysisData: analysisData,
    };
  }

  /**
   * Finds a reliable canonical path using the same BFS approach as stateManager
   * @param {string} targetRegion - The target region to find a path to
   * @returns {Object|null} - Object containing the path and connection info, or null if no path exists
   */
  findCanonicalPath(targetRegion) {
    // First check if the region is reachable according to stateManager
    const reachableRegions = stateManager.computeReachableRegions();
    if (!reachableRegions.has(targetRegion)) {
      return null; // Target isn't reachable according to stateManager
    }

    // Get the path directly from stateManager
    const pathSegments = stateManager.getPathToRegion(targetRegion);
    if (!pathSegments || !pathSegments.length) {
      return null;
    }

    // Convert to our path format
    const regions = [pathSegments[0].from];
    const connections = [];

    pathSegments.forEach((segment) => {
      regions.push(segment.to);

      // Build connection info
      const fromRegionData = stateManager.regions[segment.from];
      if (fromRegionData && fromRegionData.exits) {
        const exit = fromRegionData.exits.find(
          (e) => e.name === segment.entrance
        );

        if (exit) {
          connections.push({
            fromRegion: segment.from,
            toRegion: segment.to,
            exit: {
              type: 'exit',
              name: exit.name,
              fromRegion: segment.from,
              toRegion: segment.to,
              rule: exit.access_rule,
              accessible: true, // Must be accessible since we're using it in our path
            },
          });
        }
      }
    });

    return {
      regions: regions,
      connections: connections,
    };
  }

  /**
   * Extract categorized leaf nodes from a logic tree
   * This function now uses the rule data directly instead of DOM elements
   * @param {Object} rule - The rule object to analyze
   * @return {Object} - Object containing the categorized node lists
   */
  analyzeRuleForNodes(rule) {
    // Initialize result categories
    const nodes = {
      primaryBlockers: [],
      secondaryBlockers: [],
      tertiaryBlockers: [],
      primaryRequirements: [],
      secondaryRequirements: [],
      tertiaryRequirements: [],
    };

    if (!rule) return nodes;

    // Base case: this is a leaf rule
    if (this.isLeafNodeType(rule.type)) {
      const ruleResult = evaluateRule(rule);

      // Create node data based on the rule
      const nodeData = this.extractNodeDataFromRule(rule);

      if (nodeData) {
        // Categorize the node based on its importance to the overall rule
        if (!ruleResult) {
          // If the rule fails, is it a primary blocker?
          const hypotheticalResult = this.evaluateRuleWithOverride(rule, true);

          if (hypotheticalResult) {
            // Tree would pass if this node passed - Primary blocker
            nodes.primaryBlockers.push(nodeData);
          } else {
            // Tree would still fail - Secondary blocker
            nodes.secondaryBlockers.push(nodeData);
          }
        } else {
          // If the rule passes, is it a primary requirement?
          const hypotheticalResult = this.evaluateRuleWithOverride(rule, false);

          if (!hypotheticalResult) {
            // Tree would fail if this node failed - Primary requirement
            nodes.primaryRequirements.push(nodeData);
          } else {
            // Tree would still pass - Secondary requirement
            nodes.secondaryRequirements.push(nodeData);
          }
        }
      }
    }
    // Recursive case: handle composite rules (AND/OR)
    else if (rule.type === 'and' || rule.type === 'or') {
      // Process each condition
      for (const condition of rule.conditions || []) {
        const childNodes = this.analyzeRuleForNodes(condition);

        // Merge child nodes into result
        Object.keys(nodes).forEach((key) => {
          nodes[key].push(...childNodes[key]);
        });
      }
    }

    return nodes;
  }

  /**
   * Evaluates what the rule result would be if a specific rule's value was flipped
   * @param {Object} rule - The rule to evaluate
   * @param {boolean} overrideValue - The override value for this rule
   * @return {boolean} - The hypothetical rule evaluation result
   */
  evaluateRuleWithOverride(rule, overrideValue) {
    // Create a simple map for the overrides
    const overrides = new Map();
    const ruleId = JSON.stringify(rule);
    overrides.set(ruleId, overrideValue);

    // Evaluate with the override
    return this.evaluateRuleWithOverrides(rule, overrides);
  }

  /**
   * Recursively evaluates a rule tree with specified overrides
   * @param {Object} rule - The rule tree to evaluate
   * @param {Map} overrides - Map of rule IDs to override values
   * @return {boolean} - The evaluation result
   */
  evaluateRuleWithOverrides(rule, overrides) {
    if (!rule) return true;

    // Check if this specific rule has an override
    const ruleId = JSON.stringify(rule);
    if (overrides.has(ruleId)) {
      return overrides.get(ruleId);
    }

    // If no override, evaluate based on rule type
    switch (rule.type) {
      case 'constant':
        return rule.value;

      case 'item_check':
        return stateManager.inventory.has(rule.item);

      case 'count_check':
        return stateManager.inventory.count(rule.item) >= (rule.count || 1);

      case 'group_check':
        return (
          stateManager.inventory.countGroup(rule.group) >= (rule.count || 1)
        );

      case 'helper':
        if (
          stateManager.helpers &&
          typeof stateManager.helpers.executeHelper === 'function'
        ) {
          return stateManager.helpers.executeHelper(
            rule.name,
            ...(rule.args || [])
          );
        }
        return false;

      case 'and':
        // For AND rules, all conditions must be true
        return rule.conditions.every((condition) =>
          this.evaluateRuleWithOverrides(condition, overrides)
        );

      case 'or':
        // For OR rules, at least one condition must be true
        return rule.conditions.some((condition) =>
          this.evaluateRuleWithOverrides(condition, overrides)
        );

      case 'state_method':
        if (
          stateManager.helpers &&
          typeof stateManager.helpers.executeStateMethod === 'function'
        ) {
          return stateManager.helpers.executeStateMethod(
            rule.method,
            ...(rule.args || [])
          );
        }
        return false;

      default:
        return false;
    }
  }

  /**
   * Extract categorized nodes from a logic tree element
   * @param {HTMLElement} treeElement - The logic tree DOM element to analyze
   * @return {Object} - Object containing the categorized node lists
   */
  extractCategorizedNodes(treeElement) {
    // Initialize result categories with the six categories
    const nodes = {
      primaryBlockers: [],
      secondaryBlockers: [],
      tertiaryBlockers: [],
      primaryRequirements: [],
      secondaryRequirements: [],
      tertiaryRequirements: [],
    };

    // For non-leaf nodes, recursively check children
    const childLists = treeElement.querySelectorAll('ul');
    childLists.forEach((ul) => {
      ul.querySelectorAll('li').forEach((li) => {
        if (li.firstChild) {
          const childResults = this.extractCategorizedNodes(li.firstChild);
          // Merge results
          Object.keys(nodes).forEach((key) => {
            nodes[key].push(...childResults[key]);
          });
        }
      });
    });

    // Check if this is a leaf node that we can analyze
    const nodeType = this.getNodeType(treeElement);
    if (nodeType && this.isLeafNodeType(nodeType)) {
      // Extract the rule data from the DOM element
      const rule = this.extractRuleFromElement(treeElement, nodeType);
      if (rule) {
        // Get the node data
        const nodeData = this.extractNodeDataFromRule(rule);

        if (nodeData) {
          // Check the actual rule evaluation result
          const ruleResult = evaluateRule(rule);

          // Check visual UI state for comparison
          const visualStatePass = treeElement.classList.contains('pass');
          const visualStateFail = treeElement.classList.contains('fail');

          // Log discrepancies between visual state and actual evaluation
          if (
            (ruleResult && visualStateFail) ||
            (!ruleResult && visualStatePass)
          ) {
            this._logDebug(`Discrepancy in rule evaluation:`, {
              ruleType: nodeType,
              rule: rule,
              actualResult: ruleResult,
              visualState: visualStatePass ? 'pass' : 'fail',
            });
          }

          // Use actual rule evaluation result, not visual state
          if (!ruleResult) {
            // If rule fails, determine if it's a primary blocker
            const hypotheticalResult = this.evaluateRuleWithOverride(
              rule,
              true
            );

            if (hypotheticalResult) {
              // Tree would pass if this node passed - Primary blocker
              nodes.primaryBlockers.push(nodeData);
            } else {
              // Tree would still fail - Secondary blocker
              nodes.secondaryBlockers.push(nodeData);
            }
          } else {
            // If rule passes, determine if it's a primary requirement
            const hypotheticalResult = this.evaluateRuleWithOverride(
              rule,
              false
            );

            if (!hypotheticalResult) {
              // Tree would fail if this node failed - Primary requirement
              nodes.primaryRequirements.push(nodeData);
            } else {
              // Tree would still pass - Secondary requirement
              nodes.secondaryRequirements.push(nodeData);
            }
          }
        }
      }
    }

    return nodes;
  }

  /**
   * Extracts rule data from a DOM element
   * @param {HTMLElement} element - The DOM element
   * @param {string} nodeType - The type of node
   * @return {Object|null} - Rule object or null if extraction failed
   */
  extractRuleFromElement(element, nodeType) {
    const textContent = element.textContent;

    switch (nodeType) {
      case 'constant':
        const valueMatch = textContent.match(/value: (true|false)/i);
        if (valueMatch) {
          return {
            type: 'constant',
            value: valueMatch[1].toLowerCase() === 'true',
          };
        }
        break;

      case 'item_check':
        const itemMatch = textContent.match(
          /item: ([^,]+?)($|\s(?:Type:|helper:|method:|group:))/
        );
        if (itemMatch) {
          return {
            type: 'item_check',
            item: itemMatch[1].trim(),
          };
        }
        break;

      case 'count_check':
        const countMatch = textContent.match(/(\w+) >= (\d+)/);
        if (countMatch) {
          return {
            type: 'count_check',
            item: countMatch[1],
            count: parseInt(countMatch[2], 10),
          };
        }
        break;

      case 'group_check':
        const groupMatch = textContent.match(
          /group: ([^,]+?)($|\s(?:Type:|helper:|method:|item:))/
        );
        if (groupMatch) {
          return {
            type: 'group_check',
            group: groupMatch[1].trim(),
          };
        }
        break;

      case 'helper':
        const helperMatch = textContent.match(
          /helper: ([^,]+?), args: (\[.*\]|\{.*\}|".*?"|null|\d+)/
        );
        if (helperMatch) {
          const helperName = helperMatch[1].trim();
          let helperArgs = [];
          try {
            // Try to parse the arguments as JSON
            const argsText = helperMatch[2].trim();
            if (argsText && argsText !== 'null' && argsText !== '[]') {
              helperArgs = JSON.parse(argsText);
            }
          } catch (e) {
            this._logDebug(
              `Error parsing helper args: ${e.message}`,
              helperMatch[2]
            );
          }
          return {
            type: 'helper',
            name: helperName,
            args: helperArgs,
          };
        }
        break;

      case 'state_method':
        const methodMatch = textContent.match(
          /method: ([^,]+?), args: (\[.*\]|\{.*\}|".*?"|null|\d+)/
        );
        if (methodMatch) {
          const methodName = methodMatch[1].trim();
          let methodArgs = [];
          try {
            // Try to parse the arguments as JSON
            const argsText = methodMatch[2].trim();
            if (argsText && argsText !== 'null' && argsText !== '[]') {
              methodArgs = JSON.parse(argsText);
            }
          } catch (e) {
            this._logDebug(
              `Error parsing method args: ${e.message}`,
              methodMatch[2]
            );
          }
          return {
            type: 'state_method',
            method: methodName,
            args: methodArgs,
          };
        }
        break;
    }

    return null;
  }

  /**
   * Determines the type of a logic node from its DOM element
   * @param {HTMLElement} element - The DOM element representing a logic node
   * @return {string|null} - The type of the logic node or null if not found
   */
  getNodeType(element) {
    const logicLabel = element.querySelector('.logic-label');
    if (logicLabel) {
      const typeMatch = logicLabel.textContent.match(/Type: (\w+)/);
      if (typeMatch && typeMatch[1]) {
        return typeMatch[1];
      }
    }
    return null;
  }

  /**
   * Checks if a node type is a leaf node type
   * @param {string} nodeType - The type of the logic node
   * @return {boolean} - True if it's a leaf node type, false otherwise
   */
  isLeafNodeType(nodeType) {
    return [
      'constant',
      'item_check',
      'count_check',
      'group_check',
      'helper',
      'state_method',
    ].includes(nodeType);
  }

  /**
   * Alias for isLeafNodeType for backward compatibility
   * @param {string} nodeType - The type of the logic node
   * @return {boolean} - True if it's a leaf node type, false otherwise
   */
  isLeafRuleType(nodeType) {
    return this.isLeafNodeType(nodeType);
  }

  /**
   * Extract data from a rule object
   * @param {Object} rule - The rule object
   * @return {Object|null} - The extracted node data or null if extraction failed
   */
  extractNodeDataFromRule(rule) {
    if (!rule) return null;

    // Default display color based on rule evaluation
    const ruleResult = evaluateRule(rule);
    const displayColor = ruleResult ? '#4caf50' : '#f44336';

    switch (rule.type) {
      case 'constant':
        return {
          type: 'constant',
          value: rule.value,
          display: `Constant: ${rule.value}`,
          displayColor,
          identifier: `constant_${rule.value}`,
        };

      case 'item_check':
        return {
          type: 'item_check',
          item: rule.item,
          display: `Need item: ${rule.item}`,
          displayColor,
          identifier: `item_${rule.item}`,
        };

      case 'count_check':
        return {
          type: 'count_check',
          item: rule.item,
          count: rule.count || 1,
          display: `Need ${rule.count || 1}× ${rule.item}`,
          displayColor,
          identifier: `count_${rule.item}_${rule.count || 1}`,
        };

      case 'group_check':
        return {
          type: 'group_check',
          group: rule.group,
          display: `Need group: ${rule.group}`,
          displayColor,
          identifier: `group_${rule.group}`,
        };

      case 'helper':
        return {
          type: 'helper',
          name: rule.name,
          args: rule.args || [],
          display: `Helper function: ${rule.name}`,
          displayColor,
          identifier: `helper_${rule.name}`,
        };

      case 'state_method':
        return {
          type: 'state_method',
          method: rule.method,
          args: rule.args || [],
          display: `State method: ${rule.method}`,
          displayColor,
          identifier: `method_${rule.method}`,
        };
    }

    return null;
  }

  /**
   * Deduplicates a list of nodes, treating functions with different args as unique
   * @param {Array} nodes - List of nodes to deduplicate
   * @return {Array} - Deduplicated list
   */
  deduplicateNodes(nodes) {
    const uniqueNodes = [];
    const seenIdentifiers = new Set();

    nodes.forEach((node) => {
      // Create an identifier that includes function arguments if present
      let identifier = node.identifier;

      // If this is a helper node or state_method node with args, include them in the identifier
      if (
        (node.type === 'helper' || node.type === 'state_method') &&
        node.args
      ) {
        // Use a consistent string representation of the args
        const argsString =
          typeof node.args === 'string' ? node.args : JSON.stringify(node.args);

        identifier = `${identifier}:${argsString}`;
      }

      if (!seenIdentifiers.has(identifier)) {
        seenIdentifiers.add(identifier);
        uniqueNodes.push(node);
      }
    });

    return uniqueNodes;
  }

  /**
   * Log debug information if debug mode is enabled
   * @param {string} message - The message to log
   * @param {any} data - Optional data to log
   * @private
   */
  _logDebug(message, data = null) {
    if (this.debugMode) {
      const logMsg = `[PathAnalyzerLogic] ${message}`;
      if (data !== null) {
        console.log(logMsg, data);
      } else {
        console.log(logMsg);
      }
    }
  }
}

export default PathAnalyzerLogic;
