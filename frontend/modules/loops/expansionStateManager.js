// expansionStateManager.js
import { createUniversalLogger } from '../../app/core/universalLogger.js';

const logger = createUniversalLogger('loopUI:ExpansionState');

/**
 * ExpansionStateManager
 *
 * Manages expansion state for region blocks and action blocks in the loops panel.
 *
 * Data Flow:
 * 1. User clicks region header → toggleRegion() → Update expandedRegions Set
 * 2. User clicks action block → toggleAction() → Update expandedActions Set
 * 3. Expand/Collapse All → Update all entries in expandedRegions Set
 * 4. Rendering → isRegionExpanded() / isActionExpanded() query the Sets
 *
 * State Storage:
 * - expandedRegions: Set<regionName> - Tracks which regions are expanded
 * - expandedActions: Set<actionId> - Tracks which action blocks are expanded
 */
export class ExpansionStateManager {
  constructor() {
    // Track expansion state
    this.expandedRegions = new Set();
    this.expandedActions = new Set();

    logger.debug('ExpansionStateManager constructed');
  }

  /**
   * Check if a region is expanded
   * @param {string} regionName - The region name
   * @returns {boolean} True if expanded, false if collapsed
   */
  isRegionExpanded(regionName) {
    return this.expandedRegions.has(regionName);
  }

  /**
   * Check if an action block is expanded
   * @param {string} actionId - The action ID
   * @returns {boolean} True if expanded, false if collapsed
   */
  isActionExpanded(actionId) {
    return this.expandedActions.has(actionId);
  }

  /**
   * Set expansion state for a region
   * @param {string} regionName - The region name
   * @param {boolean} expanded - True to expand, false to collapse
   */
  setRegionExpanded(regionName, expanded) {
    if (expanded) {
      this.expandedRegions.add(regionName);
    } else {
      this.expandedRegions.delete(regionName);
    }
    logger.debug(`Set region expansion for ${regionName}: ${expanded}`);
  }

  /**
   * Set expansion state for an action block
   * @param {string} actionId - The action ID
   * @param {boolean} expanded - True to expand, false to collapse
   */
  setActionExpanded(actionId, expanded) {
    if (expanded) {
      this.expandedActions.add(actionId);
    } else {
      this.expandedActions.delete(actionId);
    }
    logger.debug(`Set action expansion for ${actionId}: ${expanded}`);
  }

  /**
   * Toggle expansion state for a region
   * @param {string} regionName - The region name
   * @returns {boolean} New expansion state
   */
  toggleRegion(regionName) {
    const wasExpanded = this.expandedRegions.has(regionName);
    if (wasExpanded) {
      this.expandedRegions.delete(regionName);
    } else {
      this.expandedRegions.add(regionName);
    }
    logger.debug(`Toggled region expansion for ${regionName}: ${!wasExpanded}`);
    return !wasExpanded;
  }

  /**
   * Toggle expansion state for an action block
   * @param {string} actionId - The action ID
   * @returns {boolean} New expansion state
   */
  toggleAction(actionId) {
    const wasExpanded = this.expandedActions.has(actionId);
    if (wasExpanded) {
      this.expandedActions.delete(actionId);
    } else {
      this.expandedActions.add(actionId);
    }
    logger.debug(`Toggled action expansion for ${actionId}: ${!wasExpanded}`);
    return !wasExpanded;
  }

  /**
   * Expand all regions
   * @param {Array<string>} regionNames - Array of region names to expand
   */
  expandAll(regionNames) {
    regionNames.forEach(name => {
      this.expandedRegions.add(name);
    });
    logger.debug(`Expanded all ${regionNames.length} regions`);
  }

  /**
   * Collapse all regions
   */
  collapseAll() {
    this.expandedRegions.clear();
    logger.debug('Collapsed all regions');
  }

  /**
   * Clear all expansion state (regions and actions)
   * Used when panel is reset or cleared
   */
  clear() {
    this.expandedRegions.clear();
    this.expandedActions.clear();
    logger.debug('Cleared all expansion state');
  }

  /**
   * Get expansion state for debugging
   * @returns {Object} Object with regions and actions state
   */
  getDebugState() {
    return {
      regions: Array.from(this.expandedRegions),
      actions: Array.from(this.expandedActions)
    };
  }
}

export default ExpansionStateManager;
