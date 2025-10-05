import { evaluateRule } from '../shared/ruleEngine.js';
import { createStateSnapshotInterface } from '../shared/stateInterface.js';
import { createUniversalLogger } from '../../app/core/universalLogger.js';

const logger = createUniversalLogger('regionGraph');

/**
 * PathFinder - Utility for finding paths between regions
 */
export class PathFinder {
  constructor(stateManager) {
    this.stateManager = stateManager;
  }

  /**
   * Find the shortest accessible path from source to target region
   * @param {string} sourceRegion - Starting region
   * @param {string} targetRegion - Destination region
   * @returns {Object|null} Path object with steps and next exit, or null if no path found
   */
  findPath(sourceRegion, targetRegion) {
    if (!sourceRegion || !targetRegion) {
      return null;
    }

    if (sourceRegion === targetRegion) {
      return {
        steps: [sourceRegion],
        nextExit: null,
        length: 0
      };
    }

    const staticData = this.stateManager.getStaticData();
    const snapshot = this.stateManager.getLatestStateSnapshot();
    
    if (!staticData || !snapshot || !staticData.regions) {
      return null;
    }

    const snapshotInterface = createStateSnapshotInterface(snapshot, staticData);
    if (!snapshotInterface) {
      return null;
    }

    // Build adjacency map of accessible connections
    const adjacencyMap = this.buildAccessibilityMap(staticData, snapshot, snapshotInterface);
    
    // Use BFS to find shortest path
    return this.breadthFirstSearch(sourceRegion, targetRegion, adjacencyMap);
  }

  /**
   * Build a map of accessible connections between regions
   * @param {Object} staticData - Static game data
   * @param {Object} snapshot - Current game state
   * @param {Object} snapshotInterface - Interface for rule evaluation
   * @returns {Map} Map of region -> array of {region, exitName} connections
   */
  buildAccessibilityMap(staticData, snapshot, snapshotInterface) {
    const adjacencyMap = new Map();
    const playerSettings = staticData?.settings ? Object.values(staticData.settings)[0] : null;
    const assumeBidirectional = playerSettings?.assume_bidirectional_exits === true;

    // Initialize map
    for (const regionName of Object.keys(staticData.regions)) {
      adjacencyMap.set(regionName, []);
    }

    // Check each region's exits
    for (const [regionName, regionData] of Object.entries(staticData.regions)) {
      const regionReachable = this.isRegionReachable(regionName, snapshot);
      
      if (!regionReachable || !regionData.exits) {
        continue;
      }

      for (const exit of regionData.exits) {
        const targetRegion = exit.connected_region;
        
        // Check if target region exists
        if (!staticData.regions[targetRegion]) {
          continue;
        }

        // Check if target region is reachable
        const targetReachable = this.isRegionReachable(targetRegion, snapshot);
        if (!targetReachable) {
          continue;
        }

        // Evaluate exit accessibility
        let exitAccessible = true;
        if (exit.access_rule) {
          try {
            exitAccessible = evaluateRule(exit.access_rule, snapshotInterface);
          } catch (e) {
            logger.warn(`Error evaluating exit rule for ${exit.name}:`, e);
            exitAccessible = false;
          }
        }

        if (exitAccessible) {
          adjacencyMap.get(regionName).push({
            region: targetRegion,
            exitName: exit.name
          });

          // Add reverse connection if bidirectional is assumed
          if (assumeBidirectional) {
            // Look for the reverse exit name, or use the same name
            let reverseExitName = exit.name;
            const reverseExit = staticData.regions[targetRegion]?.exits?.find(
              e => e.connected_region === regionName
            );
            if (reverseExit) {
              reverseExitName = reverseExit.name;
            }

            adjacencyMap.get(targetRegion).push({
              region: regionName,
              exitName: reverseExitName
            });
          }
        }
      }
    }

    return adjacencyMap;
  }

  /**
   * Check if a region is reachable according to the current state
   * @param {string} regionName - Region to check
   * @param {Object} snapshot - Current game state
   * @returns {boolean} True if region is reachable
   */
  isRegionReachable(regionName, snapshot) {
    return snapshot.regionReachability?.[regionName] === true ||
           snapshot.regionReachability?.[regionName] === 'reachable' ||
           snapshot.regionReachability?.[regionName] === 'checked';
  }

  /**
   * Breadth-first search to find shortest path
   * @param {string} start - Starting region
   * @param {string} target - Target region
   * @param {Map} adjacencyMap - Map of accessible connections
   * @returns {Object|null} Path object or null if no path found
   */
  breadthFirstSearch(start, target, adjacencyMap) {
    const queue = [{ region: start, path: [start], exitName: null }];
    const visited = new Set([start]);

    while (queue.length > 0) {
      const { region, path, exitName } = queue.shift();

      if (region === target) {
        return {
          steps: path,
          nextExit: path.length > 1 ? this.findExitBetweenRegions(path[0], path[1], adjacencyMap) : null,
          length: path.length - 1
        };
      }

      const connections = adjacencyMap.get(region) || [];
      for (const connection of connections) {
        if (!visited.has(connection.region)) {
          visited.add(connection.region);
          queue.push({
            region: connection.region,
            path: [...path, connection.region],
            exitName: connection.exitName
          });
        }
      }
    }

    return null; // No path found
  }

  /**
   * Find the exit name between two adjacent regions
   * @param {string} fromRegion - Source region
   * @param {string} toRegion - Destination region
   * @param {Map} adjacencyMap - Map of accessible connections
   * @returns {string|null} Exit name or null if not found
   */
  findExitBetweenRegions(fromRegion, toRegion, adjacencyMap) {
    const connections = adjacencyMap.get(fromRegion) || [];
    const connection = connections.find(conn => conn.region === toRegion);
    return connection ? connection.exitName : null;
  }

  /**
   * Get all accessible regions from a given starting region
   * @param {string} sourceRegion - Starting region
   * @returns {Array} Array of accessible region names
   */
  getAccessibleRegions(sourceRegion) {
    const staticData = this.stateManager.getStaticData();
    const snapshot = this.stateManager.getLatestStateSnapshot();
    
    if (!staticData || !snapshot || !staticData.regions) {
      return [];
    }

    const snapshotInterface = createStateSnapshotInterface(snapshot, staticData);
    if (!snapshotInterface) {
      return [];
    }

    const adjacencyMap = this.buildAccessibilityMap(staticData, snapshot, snapshotInterface);
    const accessible = new Set();
    const queue = [sourceRegion];
    const visited = new Set([sourceRegion]);

    while (queue.length > 0) {
      const region = queue.shift();
      accessible.add(region);

      const connections = adjacencyMap.get(region) || [];
      for (const connection of connections) {
        if (!visited.has(connection.region)) {
          visited.add(connection.region);
          queue.push(connection.region);
        }
      }
    }

    return Array.from(accessible);
  }
}