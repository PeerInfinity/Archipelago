// pathAnalyzerLogic.js
import { evaluateRule } from '../shared/ruleEngine.js';
// REMOVED: Global stateManager import
// import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import loopState from '../loops/loopStateSingleton.js';
import { createStateSnapshotInterface } from '../shared/stateInterface.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('pathAnalyzerLogic', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[pathAnalyzerLogic] ${message}`, ...data);
  }
}

/**
 * Core logic for path analysis, separated from UI concerns
 * Handles path finding, rule evaluation, and node categorization
 */
export class PathAnalyzerLogic {
  constructor(settings = {}) {
    this.debugMode = false;
    // Use settings or defaults
    this.maxPaths = settings.maxPaths || 100;
    this.maxAnalysisTimeMs = settings.maxAnalysisTimeMs || 10000;
  }

  /**
   * Sets the debug mode
   * @param {boolean} debug - Whether debug mode is enabled
   */
  setDebugMode(debug) {
    this.debugMode = debug;
  }

  /**
   * Finds a path from the starting region to the target region using only discovered regions in loop mode
   * @param {string} targetRegion - The region containing the location or exit to find a path to
   * @param {object} staticData - The cached static game data (regions, items, etc.)
   * @returns {Array<string>|null} - Array of region names in the path order, or null if no path found
   */
  findPathInLoopMode(targetRegion, staticData) {
    const startRegion = 'Menu'; // Always start from Menu in loop mode

    if (targetRegion === startRegion) {
      return [startRegion];
    }

    if (!loopState.isRegionDiscovered(targetRegion)) {
      return null;
    }

    // <<< ADDED: Check for regions data >>>
    const regionsData = staticData?.regions;
    if (!regionsData) {
      this._logDebug(
        'Cannot find path in loop mode: Static region data missing.'
      );
      return null;
    }

    const queue = [[startRegion]];
    const visited = new Set([startRegion]);

    while (queue.length > 0) {
      const path = queue.shift();
      const currentRegion = path[path.length - 1];

      if (currentRegion === targetRegion) {
        return path;
      }

      if (visited.size > this.maxPathFinderIterations) {
        this._logDebug(
          `Maximum iterations (${this.maxPathFinderIterations}) exceeded in findPathInLoopMode`
        );
        return null;
      }

      // Get the region data using the passed staticData
      const regionData = regionsData[currentRegion];
      if (!regionData || !regionData.exits) {
        continue;
      }

      for (const exit of regionData.exits) {
        const nextRegion = exit.connected_region;

        if (
          !nextRegion ||
          visited.has(nextRegion) ||
          !loopState.isRegionDiscovered(nextRegion)
        ) {
          continue;
        }

        if (!loopState.isExitDiscovered(currentRegion, exit.name)) {
          continue;
        }

        const newPath = [...path, nextRegion];
        visited.add(nextRegion);
        queue.push(newPath);
      }
    }

    return null;
  }

  /**
   * Finds paths to a region using DFS with callback support for iteration tracking
   * @param {string} targetRegion - The region to find paths to
   * @param {number} maxPaths - Maximum number of paths to find (optional, defaults to instance setting)
   * @param {object} snapshot - The current state snapshot.
   * @param {object} staticData - The cached static game data.
   * @param {function} iterationCallback - Optional callback to report iteration count
   * @returns {Array} - Array of paths to the target region
   */
  findPathsToRegionWithCallback(targetRegion, maxPaths = null, snapshot, staticData, iterationCallback = null) {
    return this._findPathsToRegionInternal(targetRegion, maxPaths, snapshot, staticData, iterationCallback);
  }

  /**
   * Finds paths to a region using DFS (not BFS as previously commented)
   * @param {string} targetRegion - The region to find paths to
   * @param {number} maxPaths - Maximum number of paths to find (optional, defaults to instance setting)
   * @param {object} snapshot - The current state snapshot.
   * @param {object} staticData - The cached static game data.
   * @returns {Array} - Array of paths to the target region
   */
  findPathsToRegion(targetRegion, maxPaths = null, snapshot, staticData) {
    return this._findPathsToRegionInternal(targetRegion, maxPaths, snapshot, staticData, null);
  }

  /**
   * Internal implementation of pathfinding with optional callback support
   * @param {string} targetRegion - The region to find paths to
   * @param {number} maxPaths - Maximum number of paths to find (optional, defaults to instance setting)
   * @param {object} snapshot - The current state snapshot.
   * @param {object} staticData - The cached static game data.
   * @param {function} iterationCallback - Optional callback to report iteration count
   * @returns {Array} - Array of paths to the target region
   * @private
   */
  _findPathsToRegionInternal(targetRegion, maxPaths = null, snapshot, staticData, iterationCallback) {
    // Use provided maxPaths or fall back to instance setting
    const effectiveMaxPaths = maxPaths !== null ? maxPaths : this.maxPaths;

    log(
      'info',
      `[PathAnalyzer] ENTRY: findPathsToRegion called with targetRegion=${targetRegion}, maxPaths=${effectiveMaxPaths}`
    );
    const paths = [];

    if (!snapshot || !staticData) {
      log('info', `[PathAnalyzer] EARLY EXIT: Missing snapshot or staticData`);
      this._logDebug(
        'findPathsToRegion: Missing snapshot or staticData. Cannot perform pathfinding.'
      );
      return paths;
    }

    log('info', `[PathAnalyzer] Creating snapshotInterface...`);
    const snapshotInterface = createStateSnapshotInterface(
      snapshot,
      staticData
    );
    if (!snapshotInterface) {
      log(
        'info',
        `[PathAnalyzer] EARLY EXIT: Failed to create snapshotInterface`
      );
      this._logDebug(
        'findPathsToRegion: Failed to create snapshotInterface. Cannot perform pathfinding.'
      );
      return paths;
    }

    log(
      'info',
      `[PathAnalyzer] Starting path analysis for region: ${targetRegion}`
    );
    log(
      'info',
      `[PathAnalyzer] Max paths: ${effectiveMaxPaths}, Max time: ${this.maxAnalysisTimeMs}ms`
    );

    let isTargetReachableInSnapshot = false;
    if (snapshot && snapshot.regionReachability) {
      const status = snapshot.regionReachability?.[targetRegion];
      isTargetReachableInSnapshot =
        status === true || status === 'reachable' || status === 'checked';
    }

    log(
      'info',
      `[PathAnalyzer] Target region ${targetRegion} reachable in snapshot: ${isTargetReachableInSnapshot}`
    );

    if (!isTargetReachableInSnapshot) {
      this._logDebug(
        `Target region ${targetRegion} is not reachable according to the latest snapshot`
      );
      // Continue trying to find paths anyway
    }

    let startRegions = staticData?.startRegions || ['Menu'];

    // Ensure startRegions is always an array
    if (!Array.isArray(startRegions)) {
      // If it's an object with a 'default' property, use that
      if (startRegions && typeof startRegions === 'object' && startRegions.default) {
        startRegions = startRegions.default;
      } else {
        // Otherwise fall back to Menu
        startRegions = ['Menu'];
      }
    }

    const regionsData = staticData?.regions;

    if (!regionsData) {
      this._logDebug(
        'Cannot find paths: Region data not available in static cache.'
      );
      return paths;
    }

    log('info', `[PathAnalyzer] Starting regions: ${startRegions.join(', ')}`);
    log(
      'info',
      `[PathAnalyzer] Total regions in data: ${Object.keys(regionsData).length}`
    );

    // Add iteration counter for tracking
    const iterationCounter = { count: 0 };

    // Add a global timeout to prevent hanging
    const startTime = Date.now();

    for (const startRegion of startRegions) {
      if (paths.length >= effectiveMaxPaths) break;

      // Check timeout
      if (Date.now() - startTime > this.maxAnalysisTimeMs) {
        log(
          'info',
          `[PathAnalyzer] Analysis timeout (${this.maxAnalysisTimeMs}ms) exceeded`
        );
        break;
      }

      log('info', `[PathAnalyzer] Starting DFS from region: ${startRegion}`);
      const pathsBefore = paths.length;

      this._findPathsDFS(
        startRegion,
        targetRegion,
        [startRegion], // start with the start region in the path like old version
        new Set([startRegion]), // use visited set like old version
        paths,
        effectiveMaxPaths,
        regionsData,
        snapshotInterface,
        startTime,
        iterationCounter,
        iterationCallback
      );

      const pathsAfter = paths.length;
      log(
        'info',
        `[PathAnalyzer] DFS from ${startRegion} completed. Paths found: ${
          pathsAfter - pathsBefore
        }`
      );
    }

    log(
      'info',
      `[PathAnalyzer] Path analysis completed. Total paths found: ${paths.length}`
    );
    log(
      'info',
      `[PathAnalyzer] RETURNING from findPathsToRegion with ${paths.length} paths`
    );
    return paths;
  }

  /**
   * Helper method for DFS path finding
   * @param {string} currentRegion
   * @param {string} targetRegion
   * @param {Array<string>} currentPath
   * @param {Set<string>} visited - Used for backtracking
   * @param {Array<Array<string>>} allPaths - Array to store found paths
   * @param {number} maxPaths
   * @param {object} regionsData - Static region data object
   * @param {object} snapshotInterface - The interface for rule evaluation.
   * @param {number} startTime - Start time for timeout checking
   * @param {object} iterationCounter - Counter object to track iterations
   * @param {function} iterationCallback - Optional callback to report iteration count
   * @private
   */
  _findPathsDFS(
    currentRegion,
    targetRegion,
    currentPath,
    visited,
    allPaths,
    maxPaths,
    regionsData,
    snapshotInterface,
    startTime,
    iterationCounter,
    iterationCallback
  ) {
    // Check if target reached - like old version, check if length > 1
    if (currentRegion === targetRegion && currentPath.length > 1) {
      allPaths.push([...currentPath]);
      log(
        'info',
        `[PathAnalyzer DFS] Found path to target! Path ${
          allPaths.length
        }: ${currentPath.join(' -> ')}`
      );
      return;
    }

    // Check limits
    if (allPaths.length >= maxPaths) return;

    // Increment iteration counter and call callback if provided
    iterationCounter.count++;
    if (iterationCallback && iterationCounter.count % 100 === 0) {
      iterationCallback(iterationCounter.count);
    }

    // Check timeout periodically (every 1000 recursive calls to avoid excessive checking)
    if (iterationCounter.count % 1000 === 0) {
      if (Date.now() - startTime > this.maxAnalysisTimeMs) {
        log(
          'info',
          `[PathAnalyzer DFS] Analysis timeout (${this.maxAnalysisTimeMs}ms) exceeded`
        );
        return;
      }
    }

    // Get region data
    const regionData = regionsData[currentRegion];
    if (!regionData) return;

    // Explore neighbors via exits - like old version
    for (const exit of regionData.exits || []) {
      const nextRegion = exit.connected_region;
      if (!nextRegion || visited.has(nextRegion)) continue;

      // MODIFIED: Like the old version, traverse ALL exits regardless of accessibility
      // This allows us to find non-viable paths that show why regions are unreachable
      
      // Add to visited and path, like old version
      visited.add(nextRegion);
      currentPath.push(nextRegion);
      
      // Recurse
      this._findPathsDFS(
        nextRegion,
        targetRegion,
        currentPath,
        visited,
        allPaths,
        maxPaths,
        regionsData,
        snapshotInterface,
        startTime,
        iterationCounter,
        iterationCallback
      );
      
      // Backtrack - like old version
      currentPath.pop();
      visited.delete(nextRegion);
      
      // Check if we hit max paths
      if (allPaths.length >= maxPaths) break;
    }
  }

  /**
   * Find all transitions in a path, including blocked and open transitions
   * @param {Array<string>} path - Array of region names
   * @param {object} snapshot - The current state snapshot.
   * @param {object} staticData - The cached static game data.
   * @param {object} snapshotInterface - The interface for rule evaluation.
   * @returns {Array<Object>} - Array of transition objects
   */
  findAllTransitions(path, snapshot, staticData, snapshotInterface) {
    const transitions = [];
    const regionsData = staticData?.regions;
    if (!regionsData || !snapshot || !snapshotInterface) {
      this._logDebug(
        'Cannot find transitions: Missing context (snapshot, staticData, or interface).'
      );
      return transitions;
    }

    for (let i = 0; i < path.length - 1; i++) {
      const fromRegion = path[i];
      const toRegion = path[i + 1];

      const fromRegionData = regionsData[fromRegion];
      if (!fromRegionData || !fromRegionData.exits) continue;

      const availableExits = fromRegionData.exits.filter(
        (e) => e.connected_region === toRegion
      );

      if (availableExits.length === 0) continue;

      this._logDebug(
        `Transition ${fromRegion} → ${toRegion}: Found ${availableExits.length} exits`
      );

      // Evaluate all exits using the snapshotInterface
      const evaluatedExits = availableExits.map((exit) => ({
        ...exit,
        isAccessible:
          !exit.access_rule || snapshotInterface.evaluateRule(exit.access_rule),
      }));

      const accessibleExits = evaluatedExits.filter(
        (exit) => exit.isAccessible
      );

      this._logDebug(
        `Transition ${fromRegion} → ${toRegion}: ${accessibleExits.length} accessible exits:`,
        accessibleExits.map((e) => e.name)
      );

      const transitionAccessible = accessibleExits.length > 0;

      // Check reachability using the snapshot
      const fromRegionStatus = snapshot.regionReachability?.[fromRegion];
      const toRegionStatus = snapshot.regionReachability?.[toRegion];
      const fromReachable =
        fromRegionStatus === true ||
        fromRegionStatus === 'reachable' ||
        fromRegionStatus === 'checked';
      const toReachable =
        toRegionStatus === true ||
        toRegionStatus === 'reachable' ||
        toRegionStatus === 'checked';

      transitions.push({
        fromRegion,
        toRegion,
        exits: evaluatedExits,
        isBlocking: fromReachable && !toReachable,
        transitionAccessible: transitionAccessible,
      });
    }

    this._logDebug('Path transitions debug:', transitions);

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
      return null;
    }

    this._logDebug(`DEBUG: Transition ${fromRegion} → ${toRegion}:`);
    this._logDebug(
      `  Marked as: ${
        transition.transitionAccessible ? 'ACCESSIBLE' : 'INACCESSIBLE'
      }`
    );
    this._logDebug(`  Exits count: ${transition.exits.length}`);

    transition.exits.forEach((exit, i) => {
      this._logDebug(
        `  Exit ${i + 1}/${transition.exits.length}: ${exit.name} - ${
          exit.isAccessible ? 'ACCESSIBLE' : 'INACCESSIBLE'
        }`
      );
    });

    return transition;
  }

  /**
   * Analyze all direct connections to a region
   * @param {string} regionName - The region to analyze
   * @param {object} staticData - The cached static game data.
   * @param {object} snapshotInterface - The interface for rule evaluation.
   * @returns {Object} - Analysis results containing node categories and region data
   */
  analyzeDirectConnections(regionName, staticData, snapshotInterface) {
    // --- ADDED: Log received staticData structure --- >
    this._logDebug(
      '[PathAnalyzerLogic DEBUG] analyzeDirectConnections entered.',
      {
        targetRegion: regionName,
        staticDataExists: !!staticData,
        staticDataType: typeof staticData,
        regionsExist: !!(staticData && staticData.regions),
        regionsType: typeof staticData?.regions,
        exitsExist: !!(staticData && staticData.exits),
        exitsType: typeof staticData?.exits,
        // Optionally log keys:
        // staticDataKeys: staticData ? Object.keys(staticData) : null,
        // regionKeys: staticData?.regions ? Object.keys(staticData.regions) : null,
        // exitKeys: staticData?.exits ? Object.keys(staticData.exits) : null
      }
    );
    // < --- END LOGGING --- >

    const allNodes = {
      primaryBlockers: [],
      secondaryBlockers: [],
      tertiaryBlockers: [],
      primaryRequirements: [],
      secondaryRequirements: [],
      tertiaryRequirements: [],
    };

    const regionsData = staticData?.regions;
    if (!regionsData || !snapshotInterface) {
      this._logDebug(
        'Cannot analyze connections: Missing staticData or snapshotInterface.'
      );
      return {
        nodes: allNodes,
        analysisData: { entrances: [], regionRules: [] },
      };
    }

    const regionData = regionsData[regionName];
    const analysisData = {
      entrances: [],
      regionRules: [],
    };

    // 1. Analyze region's own rules
    if (regionData?.region_rules?.length > 0) {
      regionData.region_rules.forEach((rule) => {
        if (!rule) return;
        analysisData.regionRules.push(rule);
        // Analyze nodes (pass interface)
        const nodeResults = this.analyzeRuleForNodes(rule, snapshotInterface);
        Object.keys(allNodes).forEach((key) =>
          allNodes[key].push(...nodeResults[key])
        );
      });
    }

    // 2. Analyze entrances to this region
    Object.entries(regionsData).forEach(
      ([otherRegionName, otherRegionData]) => {
        if (otherRegionName === regionName) return;

        if (otherRegionData.exits) {
          const entrances = otherRegionData.exits.filter(
            (exit) => exit.connected_region === regionName
          );

          if (entrances.length > 0) {
            entrances.forEach((exit) => {
              // Check if the exit connects TO the target region
              // --- ADDED LOGGING --- >
              if (exit.connected_region) {
                // Log only if connected_region exists
                const comparison = `Comparing ${otherRegionName}->${exit.name}'s connected_region ('${exit.connected_region}') to target ('${regionName}')`;
                if (exit.connected_region === regionName) {
                  this._logDebug(`${comparison} - MATCH FOUND!`);
                } else if (
                  exit.connected_region.toLowerCase() ===
                  regionName.toLowerCase()
                ) {
                  this._logDebug(
                    `${comparison} - Case-insensitive match found, but exact match failed.`
                  );
                } else {
                  // Only log non-matches if debug level is high, or for specific regions
                  // this._logDebug(`${comparison} - No match.`);
                }
              } else {
                // Log if an exit is missing connected_region
                this._logDebug(
                  `Exit ${otherRegionName}->${exit.name} is missing connected_region field.`
                );
              }
              // < --- END LOGGING --- >
              analysisData.entrances.push({
                fromRegion: otherRegionName,
                entrance: exit,
              });
              // Analyze nodes (pass interface)
              const nodeResults = this.analyzeRuleForNodes(
                exit.access_rule,
                snapshotInterface
              );
              Object.keys(allNodes).forEach((key) =>
                allNodes[key].push(...nodeResults[key])
              );
            });
          }
        }
      }
    );

    // Deduplicate nodes at the end
    Object.keys(allNodes).forEach((key) => {
      allNodes[key] = this.deduplicateNodes(allNodes[key]);
    });

    return {
      nodes: allNodes,
      analysisData: analysisData,
    };
  }

  /**
   * Finds a reliable canonical path using the same BFS approach as stateManager
   * @param {string} targetRegion - The target region to find a path to
   * @param {object} snapshot - The current state snapshot.
   * @param {object} staticData - The cached static game data.
   * @returns {Object|null} - Object containing the path and connection info, or null if no path exists
   */
  findCanonicalPath(targetRegion, snapshot, staticData) {
    // REWORKED: Cannot call worker's getPathToRegion.
    // This function needs a full BFS/pathfinding implementation here if needed.
    // For now, just check reachability based on snapshot and return null.
    this._logDebug(
      `findCanonicalPath called for ${targetRegion}. Note: Actual pathfinding here is disabled.`
    );

    let isTargetReachableInSnapshot = false;
    if (snapshot && snapshot.regionReachability) {
      const status = snapshot.regionReachability?.[targetRegion];
      isTargetReachableInSnapshot =
        status === true || status === 'reachable' || status === 'checked';
    }

    if (!isTargetReachableInSnapshot) {
      this._logDebug(
        `Target region ${targetRegion} not reachable in snapshot, cannot provide canonical path.`
      );
      return null;
    } else {
      this._logDebug(
        `Target region ${targetRegion} is reachable, but main-thread canonical pathfinding is not implemented.`
      );
      // TODO: Implement BFS pathfinding here if canonical path display is required.
      return null; // Return null until pathfinding is implemented here.
    }
  }

  /**
   * Extract categorized leaf nodes from a logic tree
   * This function now uses the rule data directly instead of DOM elements
   * @param {Object} rule - The rule object to analyze
   * @param {object} snapshotInterface - The interface for rule evaluation.
   * @return {Object} - Object containing the categorized node lists
   */
  analyzeRuleForNodes(rule, snapshotInterface) {
    const nodes = {
      primaryBlockers: [],
      secondaryBlockers: [],
      tertiaryBlockers: [],
      primaryRequirements: [],
      secondaryRequirements: [],
      tertiaryRequirements: [],
    };

    if (!rule || !snapshotInterface) return nodes;

    if (this.isLeafNodeType(rule.type)) {
      let evaluationResult;
      try {
        // Evaluate the rule using the provided interface as context
        evaluationResult = evaluateRule(rule, snapshotInterface);
      } catch (e) {
        this._logDebug(
          `Error evaluating rule in analyzeRuleForNodes: ${e}`,
          rule
        );
        return nodes;
      }

      const nodeData = this.extractNodeDataFromRule(rule, snapshotInterface);

      if (nodeData) {
        if (evaluationResult === false) {
          const hypotheticalResult = this.evaluateRuleWithOverride(
            rule,
            true,
            snapshotInterface
          );
          if (hypotheticalResult === true) {
            nodes.primaryBlockers.push(nodeData);
          } else {
            nodes.secondaryBlockers.push(nodeData);
          }
        } else if (evaluationResult === true) {
          const hypotheticalResult = this.evaluateRuleWithOverride(
            rule,
            false,
            snapshotInterface
          );
          if (hypotheticalResult === false) {
            nodes.primaryRequirements.push(nodeData);
          } else {
            nodes.secondaryRequirements.push(nodeData);
          }
        }
      }
    } else if (rule.type === 'and' || rule.type === 'or') {
      for (const condition of rule.conditions || []) {
        const childNodes = this.analyzeRuleForNodes(
          condition,
          snapshotInterface
        );
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
   * @param {object} snapshotInterface - The interface for rule evaluation.
   * @return {boolean|undefined} - The hypothetical rule evaluation result
   */
  evaluateRuleWithOverride(rule, overrideValue, snapshotInterface) {
    if (!snapshotInterface) return undefined;
    const overrides = new Map();
    const ruleId = JSON.stringify(rule);
    overrides.set(ruleId, overrideValue);
    return this.evaluateRuleWithOverrides(rule, overrides, snapshotInterface);
  }

  /**
   * Recursively evaluates a rule tree with specified overrides
   * @param {Object} rule - The rule tree to evaluate
   * @param {Map} overrides - Map of rule IDs to override values
   * @param {object} snapshotInterface - The interface for rule evaluation.
   * @return {boolean|undefined} - The evaluation result
   */
  evaluateRuleWithOverrides(rule, overrides, snapshotInterface) {
    if (!rule) return true;
    if (!snapshotInterface) return undefined;

    const ruleId = JSON.stringify(rule);
    if (overrides.has(ruleId)) {
      return overrides.get(ruleId);
    }

    switch (rule.type) {
      case 'constant':
        return rule.value;
      case 'item_check':
        return snapshotInterface.hasItem(rule.item);
      case 'count_check':
        return (
          (snapshotInterface.countItem(rule.item) || 0) >= (rule.count || 1)
        );
      case 'group_check':
        return (
          (snapshotInterface.countGroup(rule.group) || 0) >= (rule.count || 1)
        );
      case 'helper':
        return snapshotInterface.executeHelper(
          rule.name,
          ...(rule.args || []).map((arg) =>
            this.evaluateRuleWithOverrides(arg, overrides, snapshotInterface)
          )
        );
      case 'state_method':
        return snapshotInterface.executeStateManagerMethod(
          rule.method,
          ...(rule.args || []).map((arg) =>
            this.evaluateRuleWithOverrides(arg, overrides, snapshotInterface)
          )
        );
      case 'and':
        return (rule.conditions || []).every((condition) =>
          this.evaluateRuleWithOverrides(
            condition,
            overrides,
            snapshotInterface
          )
        );
      case 'or':
        return (rule.conditions || []).some((condition) =>
          this.evaluateRuleWithOverrides(
            condition,
            overrides,
            snapshotInterface
          )
        );
      case 'not': {
        const operandResult = this.evaluateRuleWithOverrides(
          rule.operand,
          overrides,
          snapshotInterface
        );
        return operandResult === undefined ? undefined : !operandResult;
      }
      default:
        return snapshotInterface.evaluateRule(rule);
    }
  }

  /**
   * Extract categorized nodes from a logic tree element
   * @param {HTMLElement} treeElement - The logic tree DOM element to analyze
   * @return {Object} - Object containing the categorized node lists
   * @deprecated Should operate on rule objects directly, not DOM.
   */
  extractCategorizedNodes(treeElement) {
    log(
      'warn',
      'extractCategorizedNodes (DOM based) is deprecated. Use analyzeRuleForNodes.'
    );
    // ... (existing potentially broken DOM logic) ...
    return {
      /* empty */
    };
  }

  /**
   * Extracts rule data from a DOM element
   * @param {HTMLElement} element - The DOM element
   * @param {string} nodeType - The type of node
   * @return {Object|null} - Rule object or null if extraction failed
   * @deprecated Should operate on rule objects directly, not DOM.
   */
  extractRuleFromElement(element, nodeType) {
    log('warn', 'extractRuleFromElement (DOM based) is deprecated.');
    // ... (existing potentially broken DOM logic) ...
    return null;
  }

  /**
   * Determines the type of a logic node from its DOM element
   * @param {HTMLElement} element - The DOM element representing a logic node
   * @return {string|null} - The type of the logic node or null if not found
   * @deprecated Should operate on rule objects directly, not DOM.
   */
  getNodeType(element) {
    log('warn', 'getNodeType (DOM based) is deprecated.');
    // ... (existing potentially broken DOM logic) ...
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
      'name',
      'attribute',
      'subscript',
      'value',
      'setting_check',
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
   * Extract data from a rule object for display
   * @param {Object} rule - The rule object
   * @param {object} snapshotInterface - The interface for rule evaluation.
   * @return {Object|null} - The extracted node data or null if extraction failed
   */
  extractNodeDataFromRule(rule, snapshotInterface) {
    if (!rule || !snapshotInterface) return null;

    const ruleResult = snapshotInterface.evaluateRule(rule);
    let displayColor;
    if (ruleResult === true) {
      displayColor = '#4caf50';
    } else if (ruleResult === false) {
      displayColor = '#f44336';
    } else {
      displayColor = '#9e9e9e';
    }

    switch (rule.type) {
      case 'constant':
        return {
          type: 'constant',
          value: rule.value,
          display: `Constant: ${rule.value}`,
          displayColor,
          identifier: `constant_${rule.value}`,
        };

      case 'item_check': {
        const itemName =
          typeof rule.item === 'string' ? rule.item : rule.item?.value;
        if (!itemName) return null;
        return {
          type: 'item_check',
          item: itemName,
          display: `Need item: ${itemName}`,
          displayColor,
          identifier: `item_${itemName}`,
        };
      }

      case 'count_check': {
        const itemName =
          typeof rule.item === 'string' ? rule.item : rule.item?.value;
        const count =
          typeof rule.count === 'number' ? rule.count : rule.count?.value || 1;
        if (!itemName) return null;
        return {
          type: 'count_check',
          item: itemName,
          count: count,
          display: `Need ${count}× ${itemName}`,
          displayColor,
          identifier: `count_${itemName}_${count}`,
        };
      }

      case 'group_check': {
        const groupName =
          typeof rule.group === 'string' ? rule.group : rule.group?.value;
        const count =
          typeof rule.count === 'number' ? rule.count : rule.count?.value || 1;
        if (!groupName) return null;
        return {
          type: 'group_check',
          group: groupName,
          count: count,
          display: `Need ${count} of group: ${groupName}`,
          displayColor,
          identifier: `group_${groupName}_${count}`,
        };
      }

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

      case 'setting_check': {
        const settingName =
          typeof rule.setting === 'string' ? rule.setting : rule.setting?.value;
        const settingValue =
          typeof rule.value === 'object' ? rule.value?.value : rule.value;
        if (!settingName) return null;
        return {
          type: 'setting_check',
          setting: settingName,
          value: settingValue,
          display: `Setting: ${settingName} == ${settingValue}`,
          displayColor,
          identifier: `setting_${settingName}_${settingValue}`,
        };
      }
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
      let identifier = node.identifier;

      if (
        (node.type === 'helper' || node.type === 'state_method') &&
        Array.isArray(node.args)
      ) {
        try {
          const argsString = JSON.stringify(
            node.args.map((arg) => {
              return arg && typeof arg === 'object'
                ? arg.value !== undefined
                  ? arg.value
                  : arg
                : arg;
            })
          );
          identifier = `${identifier}:${argsString}`;
        } catch (e) {
          log(
            'warn',
            'Failed to stringify args for deduplication:',
            node.args,
            e
          );
          identifier = `${identifier}:[${node.args.length} args]`;
        }
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
        try {
          const clonedData = JSON.parse(JSON.stringify(data));
          log('info', logMsg, clonedData);
        } catch (e) {
          log('info', logMsg, data);
        }
      } else {
        log('info', logMsg);
      }
    }
  }
}

export default PathAnalyzerLogic;
