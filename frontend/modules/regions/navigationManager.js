// navigationManager.js
import { createUniversalLogger } from '../../app/core/universalLogger.js';

const logger = createUniversalLogger('regionUI:Navigation');

/**
 * NavigationManager
 *
 * Manages navigation path data and navigation actions for the regions panel.
 * Provides helper methods for path manipulation, navigation, and computing visible regions.
 *
 * Data Flow:
 * 1. updateFromPlayerStatePath() - Receives path from playerState, converts to internal format
 * 2. computeVisiblePath() - Handles path truncation for very long paths
 * 3. Navigation actions - navigateToRegion, navigateToLocation publish events
 * 4. Path queries - getCurrentRegion, getPathLength, etc.
 */
export class NavigationManager {
  constructor(eventBus) {
    this.eventBus = eventBus;

    logger.debug('NavigationManager constructed');
  }

  /**
   * Compute visible path with truncation for very long paths
   * @param {Array} fullPath - Full navigation path
   * @param {number} totalRegions - Total number of regions in the game
   * @returns {Array} Visible path (potentially truncated)
   */
  computeVisiblePath(fullPath, totalRegions) {
    const pathTooLong = fullPath.length > (totalRegions * 2);
    if (!pathTooLong) {
      return fullPath;
    }

    // Truncated view with skip indicator
    const n = totalRegions;
    const firstN = fullPath.slice(0, n);
    const lastN = fullPath.slice(-n);
    const skippedCount = fullPath.length - (2 * n);

    const result = [...firstN];

    if (skippedCount > 0) {
      result.push({
        isSkipIndicator: true,
        skippedCount,
        name: `... ${skippedCount} regions skipped ...`
      });
    }

    // Filter out duplicates from lastN
    const lastNFiltered = lastN.filter(entry =>
      !firstN.some(first =>
        first.name === entry.name &&
        first.uid === entry.uid
      )
    );

    result.push(...lastNFiltered);

    logger.debug(`Path truncated: ${fullPath.length} -> ${result.length} regions`);
    return result;
  }

  /**
   * Compute regions to render based on current settings
   * @param {Array} visitedRegions - Current visited regions array
   * @param {boolean} showAll - Show all regions mode
   * @param {boolean} showPaths - Show full path or just last region
   * @param {Object} staticData - Static game data
   * @param {Object} snapshot - Current state snapshot
   * @param {string} navigationTarget - Target region for navigation (optional)
   * @returns {Array} Array of region objects to render
   */
  computeRegionsToRender(visitedRegions, showAll, showPaths, staticData, snapshot, navigationTarget = null) {
    let regionsToRender = [];

    if (showAll) {
      // Show all regions from static data
      regionsToRender = Array.from(staticData.regions.keys()).map((name) => ({
        name,
        isVisited: false,
        uid: `all_${name}`,
        mode: 'showAll',
        isReachable:
          snapshot.regionReachability?.[name] === true ||
          snapshot.regionReachability?.[name] === 'reachable' ||
          snapshot.regionReachability?.[name] === 'checked',
      }));
    } else if (showPaths) {
      // Show full path (with truncation if needed)
      const totalRegions = staticData.regions.size;
      const visiblePath = this.computeVisiblePath(visitedRegions, totalRegions);

      regionsToRender = visiblePath.map((vr) => {
        if (vr.isSkipIndicator) {
          return {
            name: vr.name,
            isVisited: true,
            uid: 'skip_indicator',
            mode: 'navigation',
            isReachable: true,
            isSkipIndicator: true,
            skippedCount: vr.skippedCount
          };
        }

        return {
          name: vr.name,
          isVisited: true,
          uid: vr.uid,
          mode: 'navigation',
          instanceNumber: vr.instanceNumber,
          exitUsed: vr.exitUsed,
          isReachable:
            snapshot.regionReachability?.[vr.name] === true ||
            snapshot.regionReachability?.[vr.name] === 'reachable' ||
            snapshot.regionReachability?.[vr.name] === 'checked',
        };
      });
    } else {
      // Show only last region
      if (visitedRegions.length > 0) {
        const lastRegion = visitedRegions[visitedRegions.length - 1];
        regionsToRender = [{
          name: lastRegion.name,
          isVisited: true,
          uid: lastRegion.uid,
          mode: 'navigation',
          instanceNumber: lastRegion.instanceNumber,
          exitUsed: lastRegion.exitUsed,
          isReachable:
            snapshot.regionReachability?.[lastRegion.name] === true ||
            snapshot.regionReachability?.[lastRegion.name] === 'reachable' ||
            snapshot.regionReachability?.[lastRegion.name] === 'checked',
        }];
      }
    }

    logger.debug(`Computed ${regionsToRender.length} regions to render (showAll: ${showAll}, showPaths: ${showPaths})`);
    return regionsToRender;
  }

  /**
   * Navigate to a specific region
   * Publishes ui:navigateToRegion event (handled by regionUI to enable Show All if needed)
   * @param {string} regionName - The region to navigate to
   */
  navigateToRegion(regionName) {
    logger.info(`Navigating to region: ${regionName}`);
    if (this.eventBus) {
      this.eventBus.publish('ui:navigateToRegion', { regionName }, 'regions');
    }
  }

  /**
   * Navigate to a specific location in a region
   * Publishes ui:navigateToLocation event
   * @param {string} locationName - The location to navigate to
   * @param {string} regionName - The region containing the location
   */
  navigateToLocation(locationName, regionName) {
    logger.info(`Navigating to location: ${locationName} in ${regionName}`);
    if (this.eventBus) {
      this.eventBus.publish('ui:navigateToLocation', { locationName, regionName }, 'regions');
    }
  }

  /**
   * Request to move to a region (for forward navigation)
   * For backward navigation (clicking on earlier region in path), use trimPathAtRegion instead
   * @param {string} oldRegionName - Current region
   * @param {string} newRegionName - Target region
   * @param {number} sourceInstanceNumber - Instance number of source region (optional)
   */
  moveToRegion(oldRegionName, newRegionName, sourceInstanceNumber = null) {
    logger.info(`Move request: ${oldRegionName} -> ${newRegionName}`);
    if (this.eventBus) {
      this.eventBus.publish('user:regionMove', {
        sourceRegion: oldRegionName,
        targetRegion: newRegionName,
        sourceInstanceNumber
      }, 'regions');
    }
  }

  /**
   * Trim path at a specific region (for backward navigation)
   * @param {string} regionName - Region to trim at
   * @param {number} instanceNumber - Instance number of the region
   */
  trimPathAtRegion(regionName, instanceNumber) {
    logger.info(`Trimming path at: ${regionName} instance ${instanceNumber}`);
    if (this.eventBus) {
      this.eventBus.publish('playerState:trimPath', {
        regionName,
        instanceNumber
      }, 'regions');
    }
  }

  /**
   * Get the current (last) region from visited regions
   * @param {Array} visitedRegions - Current visited regions array
   * @returns {Object|null} Last region or null if empty
   */
  getCurrentRegion(visitedRegions) {
    if (!visitedRegions || visitedRegions.length === 0) {
      return null;
    }
    return visitedRegions[visitedRegions.length - 1];
  }

  /**
   * Get the path length
   * @param {Array} visitedRegions - Current visited regions array
   * @returns {number} Number of regions in path
   */
  getPathLength(visitedRegions) {
    return visitedRegions ? visitedRegions.length : 0;
  }

  /**
   * Check if a region is in the current path
   * @param {Array} visitedRegions - Current visited regions array
   * @param {string} regionName - Region name to check
   * @returns {boolean} True if region is in path
   */
  isRegionInPath(visitedRegions, regionName) {
    if (!visitedRegions) return false;
    return visitedRegions.some(r => r.name === regionName);
  }

  /**
   * Find the index of a region in the path by UID
   * @param {Array} visitedRegions - Current visited regions array
   * @param {number} uid - UID to search for
   * @returns {number} Index or -1 if not found
   */
  findRegionIndexByUID(visitedRegions, uid) {
    if (!visitedRegions) return -1;
    return visitedRegions.findIndex(r => r.uid === uid);
  }
}

export default NavigationManager;
