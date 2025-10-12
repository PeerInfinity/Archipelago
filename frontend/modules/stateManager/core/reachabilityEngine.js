/**
 * StateManager Reachability Engine Module
 *
 * Handles all region/location reachability computations using BFS algorithm.
 * Extracted from stateManager.js to improve code organization and maintainability.
 *
 * DATA FLOW:
 * Input: Inventory state + region/location definitions
 *   - sm.inventory (current items)
 *   - sm.regions (region graph - currently Object, will become Map)
 *   - sm.locations (location list - currently Array, will become Map)
 *
 * Processing (BFS Algorithm):
 *   - Start from starting regions
 *   - Evaluate exit rules with current inventory
 *   - Track reachable regions via path map
 *   - Determine accessible locations
 *   - Handle indirect connections (regions affecting other regions' exits)
 *
 * Output: Reachability state
 *   - sm.knownReachableRegions (Set of region names)
 *   - sm.knownUnreachableRegions (Set of region names)
 *   - sm.path (Map of region -> {entrance, previousRegion})
 *   - Location accessibility (computed on-demand)
 *
 * ALGORITHM: Breadth-First Search (BFS)
 *   Mirrors Python's update_reachable_regions method
 *   - Initialize with start regions
 *   - Process blocked connections queue
 *   - Evaluate exit access rules
 *   - Add newly reachable regions to queue
 *   - Handle indirect connections (region dependencies)
 *   - Auto-collect event items (if enabled)
 *
 * PERFORMANCE NOTES:
 *   - Uses Sets for O(1) membership checks
 *   - Uses Maps for O(1) path lookups
 *   - Caching system to avoid redundant computation
 *   - Regions data structure will be converted to Map in this phase
 */

// Log function uses StateManager's logger via the 'sm' parameter

/**
 * Build indirect connections map similar to Python implementation
 * Identifies exits that depend on regions in their access rules
 *
 * INDIRECT CONNECTIONS:
 *   Some exits' access rules depend on whether other regions are reachable.
 *   For example, an exit might have a rule like: can_reach("Region Name")
 *   When "Region Name" becomes reachable, we need to re-evaluate all exits
 *   that depend on it.
 *
 * DATA STRUCTURE:
 *   Map<regionName, Set<exitName>>
 *   - Key: Region name that other exits depend on
 *   - Value: Set of exit names that should be re-evaluated when this region becomes reachable
 *
 * @param {Object} sm - StateManager instance
 */
export function buildIndirectConnections(sm) {
  sm.indirectConnections.clear();
  if (!sm.regions) return;

  // TODO PHASE 3: When regions becomes Map, use: sm.regions.values()
  Object.values(sm.regions).forEach((region) => {
    if (!region.exits) return;
    region.exits.forEach((exit) => {
      if (exit.rule) {
        const dependencies = findRegionDependencies(sm, exit.rule);
        dependencies.forEach((depRegionName) => {
          if (!sm.indirectConnections.has(depRegionName)) {
            sm.indirectConnections.set(depRegionName, new Set());
          }
          if (exit.name) {
            sm.indirectConnections.get(depRegionName).add(exit.name);
          }
        });
      }
    });
  });
}

/**
 * Find regions that a rule depends on through can_reach state methods
 *
 * Recursively analyzes a rule to identify all regions it references.
 * This is used to build the indirect connections map.
 *
 * @param {Object} sm - StateManager instance
 * @param {*} rule - Rule object to analyze (string, array, or object)
 * @returns {Set<string>} Set of region names this rule depends on
 */
export function findRegionDependencies(sm, rule) {
  const dependencies = new Set();
  if (!rule) return dependencies;

  if (typeof rule === 'string') {
    // TODO PHASE 3: When regions becomes Map, use: sm.regions.has(rule)
    if (sm.regions && sm.regions[rule]) {
      dependencies.add(rule);
    } else {
      // Check for helper function calls that might reference regions
      const match = rule.match(/@helper\/[^\(]+\(([^\)]+)\)/);
      if (match && match[1]) {
        const args = match[1].split(/,\s*/);
        args.forEach((arg) => {
          const cleanArg = arg.replace(/['"]/g, '');
          // TODO PHASE 3: When regions becomes Map, use: sm.regions.has(cleanArg)
          if (sm.regions && sm.regions[cleanArg]) {
            dependencies.add(cleanArg);
          }
        });
      }
    }
  } else if (Array.isArray(rule)) {
    // Recursively process array of rules (OR/AND logic)
    rule.forEach((subRule) => {
      findRegionDependencies(sm, subRule).forEach((dep) =>
        dependencies.add(dep)
      );
    });
  } else if (typeof rule === 'object') {
    // Recursively process object rules
    Object.values(rule).forEach((subRule) => {
      findRegionDependencies(sm, subRule).forEach((dep) =>
        dependencies.add(dep)
      );
    });
  }

  return dependencies;
}

/**
 * Invalidate the reachability cache
 *
 * Call this whenever inventory or state changes that could affect reachability.
 * Clears all cached reachability data to force recomputation on next access.
 *
 * @param {Object} sm - StateManager instance
 */
export function invalidateCache(sm) {
  sm.cacheValid = false;
  sm.knownReachableRegions.clear();
  sm.knownUnreachableRegions.clear();
  sm.path = new Map();
  sm.blockedConnections = new Set();
  sm._logDebug('[ReachabilityEngine] Cache invalidated.');
}

/**
 * Core pathfinding logic: determines which regions are reachable
 * Closely mirrors Python's update_reachable_regions method
 * Also handles automatic collection of event items
 *
 * BFS ALGORITHM FLOW:
 *   1. Check cache validity - return cached if valid
 *   2. Initialize with start regions
 *   3. Run BFS passes until no new regions found
 *   4. Auto-collect accessible event items (if enabled)
 *   5. Mark all other regions as unreachable
 *   6. Cache the results
 *
 * @param {Object} sm - StateManager instance
 * @returns {Set<string>} Set of reachable region names
 */
export function computeReachableRegions(sm) {
  // For custom inventories, don't use the cache
  const useCache = sm.cacheValid;
  if (useCache) {
    return sm.knownReachableRegions;
  }

  // Recursion protection
  if (sm._computing) {
    return sm.knownReachableRegions;
  }

  sm._computing = true;

  try {
    // Get start regions and initialize BFS
    const startRegions = getStartRegions(sm);

    // Safety check: ensure startRegions is an array
    if (!Array.isArray(startRegions)) {
      sm.logger.error('ReachabilityEngine', 'computeReachableRegions: startRegions is not an array:', typeof startRegions, startRegions);
      throw new Error(`startRegions must be an array, got ${typeof startRegions}`);
    }

    // Initialize path tracking
    sm.path.clear();
    sm.blockedConnections.clear();

    // Initialize reachable regions with start regions
    sm.knownReachableRegions = new Set(startRegions);

    // Add exits from start regions to blocked connections
    for (const startRegion of startRegions) {
      // TODO PHASE 3: When regions becomes Map, use: sm.regions.get(startRegion)
      const region = sm.regions[startRegion];
      if (region && region.exits) {
        // Add all exits from this region to blocked connections
        for (const exit of region.exits) {
          sm.blockedConnections.add({
            fromRegion: startRegion,
            exit: exit,
          });
        }
      }
    }

    // Start BFS process
    let continueSearching = true;
    let passCount = 0;

    while (continueSearching) {
      continueSearching = false;
      passCount++;

      // Process reachability with BFS
      const newlyReachable = runBFSPass(sm);
      if (newlyReachable) {
        continueSearching = true;
      }

      // Auto-collect events - MODIFIED: Make conditional
      let newEventCollected = false;
      if (sm.autoCollectEventsEnabled) {
        for (const loc of sm.eventLocations.values()) {
          if (sm.knownReachableRegions.has(loc.region)) {
            const canAccessLoc = isLocationAccessible(sm, loc);
            if (canAccessLoc && !sm._hasItem(loc.item.name)) {
              sm._addItemToInventory(loc.item.name, 1);
              sm.checkedLocations.add(loc.name);
              newEventCollected = true;
              continueSearching = true;
              sm._logDebug(
                `[ReachabilityEngine] Auto-collected event item: ${loc.item.name} from ${loc.name}`
              );
            }
          }
        }
      }

      // If no new regions or events were found, we're done
      if (!continueSearching) {
        break;
      }
    }

    // Finalize unreachable regions set
    // TODO PHASE 3: When regions becomes Map, use: Array.from(sm.regions.keys())
    sm.knownUnreachableRegions = new Set(
      Object.keys(sm.regions).filter(
        (region) => !sm.knownReachableRegions.has(region)
      )
    );

    sm.cacheValid = true;
  } finally {
    sm._computing = false;
  }

  return sm.knownReachableRegions;
}

/**
 * Run a single BFS pass to find reachable regions
 * Implements Python's _update_reachable_regions_auto_indirect_conditions approach
 *
 * BFS PASS ALGORITHM:
 *   1. Process all blocked connections in queue
 *   2. For each connection, check if exit is traversable
 *   3. If traversable, mark target region as reachable
 *   4. Add target region's exits to blocked connections queue
 *   5. Re-evaluate exits affected by indirect connections
 *   6. Repeat until no new connections found
 *
 * INDIRECT CONNECTIONS:
 *   When a region becomes reachable, some previously blocked exits might
 *   now be traversable (e.g., exits with can_reach rules). The indirect
 *   connections map tells us which exits to re-evaluate.
 *
 * @param {Object} sm - StateManager instance
 * @returns {boolean} True if new regions were found in this pass
 */
export function runBFSPass(sm) {
  let newRegionsFound = false;
  const passStartRegions = new Set(sm.knownReachableRegions);

  // Exactly match Python's nested loop structure
  let newConnection = true;
  while (newConnection) {
    newConnection = false;

    let queue = [...sm.blockedConnections];
    while (queue.length > 0) {
      const connection = queue.shift();
      const { fromRegion, exit } = connection;
      // Prioritize snake_case connected_region from JSON, fallback to camelCase if needed
      const targetRegion =
        exit.connected_region !== undefined
          ? exit.connected_region
          : exit.connectedRegion;

      // Skip if the target region is already reachable
      if (sm.knownReachableRegions.has(targetRegion)) {
        sm.blockedConnections.delete(connection);
        continue;
      }

      // Skip if the source region isn't reachable (important check)
      if (!sm.knownReachableRegions.has(fromRegion)) {
        continue;
      }

      // Check if exit is traversable using the *injected* evaluateRule engine
      const snapshotInterfaceContext = sm._createSelfSnapshotInterface();
      // Set parent_region context for exit evaluation - needs to be the region object, not just the name
      // TODO PHASE 3: When regions becomes Map, use: sm.regions.get(fromRegion)
      snapshotInterfaceContext.parent_region = sm.regions[fromRegion];
      // Set currentExit so get_entrance can detect self-references
      snapshotInterfaceContext.currentExit = exit.name;

      const ruleEvaluationResult = exit.access_rule
        ? sm.evaluateRuleFromEngine(
          exit.access_rule,
          snapshotInterfaceContext
        )
        : true; // No rule means true

      const canTraverse = !exit.access_rule || ruleEvaluationResult;

      if (canTraverse) {
        // Region is now reachable
        sm.knownReachableRegions.add(targetRegion);
        newRegionsFound = true;
        newConnection = true; // Signal that we found a new connection

        // Remove from blocked connections
        sm.blockedConnections.delete(connection);

        // Record the path taken to reach this region
        if (!sm.path.has(targetRegion)) {
          // Only set path if not already set
          sm.path.set(targetRegion, {
            name: targetRegion,
            entrance: exit.name,
            previousRegion: fromRegion,
          });
        }

        // Add all exits from the newly reachable region to blockedConnections (if not already processed)
        // TODO PHASE 3: When regions becomes Map, use: sm.regions.get(targetRegion)
        const region = sm.regions[targetRegion];
        if (region && region.exits) {
          for (const newExit of region.exits) {
            // Ensure the target of the new exit exists
            // TODO PHASE 3: When regions becomes Map, use: sm.regions.has(newExit.connected_region)
            if (
              newExit.connected_region &&
              sm.regions[newExit.connected_region]
            ) {
              const newConnObj = {
                fromRegion: targetRegion,
                exit: newExit,
              };
              // Avoid adding duplicates or exits leading to already reachable regions
              if (!sm.knownReachableRegions.has(newExit.connected_region)) {
                let alreadyBlocked = false;
                for (const blocked of sm.blockedConnections) {
                  if (
                    blocked.fromRegion === newConnObj.fromRegion &&
                    blocked.exit.name === newConnObj.exit.name
                  ) {
                    alreadyBlocked = true;
                    break;
                  }
                }
                if (!alreadyBlocked) {
                  sm.blockedConnections.add(newConnObj);
                  queue.push(newConnObj); // Add to the current pass queue
                }
              }
            }
          }
        }

        // Check for indirect connections affected by this region
        if (sm.indirectConnections.has(targetRegion)) {
          // Use the indirect connections structure which maps region -> set of EXIT NAMES
          const affectedExitNames =
            sm.indirectConnections.get(targetRegion);
          affectedExitNames.forEach((exitName) => {
            // Find the actual connection object in blockedConnections using the exit name
            for (const blockedConn of sm.blockedConnections) {
              if (blockedConn.exit.name === exitName) {
                // Re-add this connection to the queue to re-evaluate it,
                // but only if its source region is reachable.
                if (sm.knownReachableRegions.has(blockedConn.fromRegion)) {
                  queue.push(blockedConn);
                }
                break; // Found the connection, move to next affected exit name
              }
            }
          });
        }
      }
    }
    // Python equivalent: queue.extend(blocked_connections)
    // We've finished the current queue, next iteration will recheck all remaining blocked connections
    if (sm.debugMode && newConnection) {
      sm._logDebug(
        '[ReachabilityEngine] BFS pass: Found new regions/connections, rechecking blocked connections'
      );
    }
  }

  return newRegionsFound;
}

/**
 * Get the starting regions for BFS traversal
 *
 * Start regions are where the player begins. Usually "Menu" by default.
 * Can be configured per-game or per-seed.
 *
 * @param {Object} sm - StateManager instance
 * @returns {string[]} Array of starting region names
 */
export function getStartRegions(sm) {
  // Get start regions from startRegions property or use default
  // Ensure we always return an array
  if (Array.isArray(sm.startRegions)) {
    return sm.startRegions;
  }

  // Handle object format with 'default' and 'available' properties
  if (sm.startRegions && typeof sm.startRegions === 'object') {
    if (sm.startRegions.default && Array.isArray(sm.startRegions.default)) {
      return sm.startRegions.default;
    }
  }

  // Log unexpected values for debugging
  if (sm.startRegions !== null && sm.startRegions !== undefined) {
    sm._logDebug(`[ReachabilityEngine] Unexpected startRegions value: ${typeof sm.startRegions}`, sm.startRegions);
  }

  return ['Menu'];
}

/**
 * Determines if a region is reachable with the current inventory
 *
 * @param {Object} sm - StateManager instance
 * @param {string} regionName - The name of the region to check
 * @returns {boolean} Whether the region is reachable
 */
export function isRegionReachable(sm, regionName) {
  const reachableRegions = computeReachableRegions(sm);
  return reachableRegions.has(regionName);
}

/**
 * Determines if a location is accessible with the current inventory
 *
 * A location is accessible if:
 *   1. Its region is reachable
 *   2. Its access_rule evaluates to true (or no rule exists)
 *
 * @param {Object} sm - StateManager instance
 * @param {Object} location - The location object to check
 * @returns {boolean} Whether the location is accessible
 */
export function isLocationAccessible(sm, location) {
  // The check for serverProvidedUncheckedLocations was removed from here.
  // A location being unchecked by the server does not mean it's inaccessible by rules.

  // Recursion protection: if we're already computing reachable regions,
  // use the current state instead of triggering another computation
  const reachableRegions = sm._computing
    ? sm.knownReachableRegions
    : computeReachableRegions(sm);
  if (!reachableRegions.has(location.region)) {
    return false;
  }
  if (!location.access_rule) return true;

  // Use the *injected* evaluateRule engine
  try {
    const snapshotInterface = sm._createSelfSnapshotInterface();
    // Add the current location to the context so rules can access it
    snapshotInterface.currentLocation = location;
    snapshotInterface.location = location; // Also set as 'location' for resolveName()
    return sm.evaluateRuleFromEngine(
      location.access_rule,
      snapshotInterface
    );
  } catch (e) {
    sm.logger.error(
      'ReachabilityEngine',
      `Error evaluating internal rule for location ${location.name}:`,
      e,
      location.access_rule
    );
    return false;
  }
}

/**
 * Get processed locations with sorting and filtering
 *
 * @param {Object} sm - StateManager instance
 * @param {string} sorting - Sorting mode: 'original' or 'accessibility'
 * @param {boolean} showReachable - Include reachable locations
 * @param {boolean} showUnreachable - Include unreachable locations
 * @returns {Array} Filtered and sorted location array
 */
export function getProcessedLocations(sm, sorting = 'original', showReachable = true, showUnreachable = true) {
  // TODO PHASE 3: When locations becomes Map, use: Array.from(sm.locations.values())
  return sm.locations
    .slice()
    .sort((a, b) => {
      if (sorting === 'accessibility') {
        const aAccessible = isLocationAccessible(sm, a);
        const bAccessible = isLocationAccessible(sm, b);
        return bAccessible - aAccessible;
      }
      return 0;
    })
    .filter((location) => {
      const isAccessible = isLocationAccessible(sm, location);
      return (
        (isAccessible && showReachable) || (!isAccessible && showUnreachable)
      );
    });
}

/**
 * Get the path used to reach a region
 * Similar to Python's get_path method
 *
 * Builds the path by backtracking from the target region to start regions.
 * Each path segment shows: previous region → entrance → current region
 *
 * @param {Object} sm - StateManager instance
 * @param {string} regionName - Region to get path for
 * @returns {Array|null} Array of path segments, or null if not reachable
 */
export function getPathToRegion(sm, regionName) {
  if (!sm.knownReachableRegions.has(regionName)) {
    return null; // Region not reachable
  }

  // Build path by following previous regions
  const pathSegments = [];
  let currentRegion = regionName;

  while (currentRegion) {
    const pathEntry = sm.path.get(currentRegion);
    if (!pathEntry) break;

    // Add this segment
    pathSegments.unshift({
      from: pathEntry.previousRegion,
      entrance: pathEntry.entrance,
      to: currentRegion,
    });

    // Move to previous region
    currentRegion = pathEntry.previousRegion;
  }

  return pathSegments;
}

/**
 * Get all path info for debug/display purposes
 *
 * @param {Object} sm - StateManager instance
 * @returns {Object} Map of region names to their paths
 */
export function getAllPaths(sm) {
  const paths = {};

  for (const region of sm.knownReachableRegions) {
    paths[region] = getPathToRegion(sm, region);
  }

  return paths;
}

/**
 * Implementation of can_reach state method that mirrors Python
 *
 * Python equivalent: CollectionState.can_reach()
 * Checks if a region, location, or entrance can be reached.
 *
 * @param {Object} sm - StateManager instance
 * @param {string} target - Name of the region/location/entrance
 * @param {string} type - Type: 'Region', 'Location', or 'Entrance'
 * @param {number} player - Player number (must match sm.playerSlot)
 * @returns {boolean} True if target can be reached
 */
export function can_reach(sm, target, type = 'Region', player = 1) {
  // The context-aware state manager handles position-specific constraints correctly
  if (player !== sm.playerSlot) {
    sm._logDebug(`[ReachabilityEngine] can_reach check for wrong player (${player})`);
    return false;
  }

  if (type === 'Region') {
    return isRegionReachable(sm, target);
  } else if (type === 'Location') {
    // Find the location object
    // TODO PHASE 3: When locations becomes Map, use: sm.locations.get(target)
    const location = sm.locations.find((loc) => loc.name === target);
    return location && isLocationAccessible(sm, location);
  } else if (type === 'Entrance') {
    // Find the entrance across all regions
    // TODO PHASE 3: When regions becomes Map, use: for (const [regionName, regionData] of sm.regions.entries())
    for (const regionName in sm.regions) {
      const regionData = sm.regions[regionName];
      if (regionData.exits) {
        const exit = regionData.exits.find((e) => e.name === target);
        if (exit) {
          const snapshotInterface = sm._createSelfSnapshotInterface();
          // Set parent_region context for exit evaluation - needs to be the region object, not just the name
          // TODO PHASE 3: When regions becomes Map, use: sm.regions.get(regionName)
          snapshotInterface.parent_region = sm.regions[regionName];
          // Set currentExit so get_entrance can detect self-references
          snapshotInterface.currentExit = exit.name;
          return (
            isRegionReachable(sm, regionName) &&
            (!exit.access_rule ||
              sm.evaluateRuleFromEngine(
                exit.access_rule,
                snapshotInterface
              ))
          );
        }
      }
    }
    return false;
  }

  return false;
}

/**
 * Check if a region can be reached (Python CollectionState.can_reach_region equivalent)
 *
 * @param {Object} sm - StateManager instance
 * @param {string} region - Region name to check
 * @param {number} player - Player number (defaults to sm.playerSlot)
 * @returns {boolean} True if region is reachable
 */
export function can_reach_region(sm, region, player = null) {
  return can_reach(sm, region, 'Region', player || sm.playerSlot);
}
