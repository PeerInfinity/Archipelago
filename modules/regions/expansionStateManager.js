// expansionStateManager.js
import { createUniversalLogger } from '../../app/core/universalLogger.js';

const logger = createUniversalLogger('regionUI:ExpansionState');

/**
 * ExpansionStateManager
 *
 * Manages expansion state for region blocks in both "Show All" and navigation modes.
 * Each mode maintains its own separate expansion state, which is preserved when switching modes.
 *
 * Data Flow:
 * 1. User clicks region header → toggleExpanded() → Update appropriate Map
 * 2. Mode switch → No state is lost, each mode remembers its expansion state
 * 3. Expand/Collapse All → Update all entries in current mode's Map
 * 4. Rendering → isExpanded() queries appropriate Map based on mode
 *
 * State Storage:
 * - showAllExpansion: Map<regionName, boolean> - For "Show All" mode
 * - navigationExpansion: Map<"regionName-instanceNumber", boolean> - For navigation mode
 */
export class ExpansionStateManager {
  constructor() {
    // Separate tracking for each mode
    this.showAllExpansion = new Map(); // regionName → boolean (for "Show All" mode)
    this.navigationExpansion = new Map(); // "regionName-instanceNumber" → boolean (for navigation mode)

    logger.debug('ExpansionStateManager constructed');
  }

  /**
   * Check if a region is expanded
   * @param {string} regionName - The region name
   * @param {string} mode - 'showAll' or 'navigation'
   * @param {number|null} instanceNumber - Instance number (required for navigation mode)
   * @returns {boolean} True if expanded, false if collapsed
   */
  isExpanded(regionName, mode, instanceNumber = null) {
    if (mode === 'showAll') {
      return this.showAllExpansion.get(regionName) ?? false;
    } else {
      // Navigation mode
      if (instanceNumber === null) {
        logger.warn(`isExpanded called in navigation mode without instanceNumber for region: ${regionName}`);
        return false;
      }
      const key = `${regionName}-${instanceNumber}`;
      return this.navigationExpansion.get(key) ?? false;
    }
  }

  /**
   * Set expansion state for a region
   * @param {string} regionName - The region name
   * @param {boolean} expanded - True to expand, false to collapse
   * @param {string} mode - 'showAll' or 'navigation'
   * @param {number|null} instanceNumber - Instance number (required for navigation mode)
   */
  setExpanded(regionName, expanded, mode, instanceNumber = null) {
    if (mode === 'showAll') {
      this.showAllExpansion.set(regionName, expanded);
      logger.debug(`Set expansion for ${regionName} (showAll mode): ${expanded}`);
    } else {
      // Navigation mode
      if (instanceNumber === null) {
        logger.warn(`setExpanded called in navigation mode without instanceNumber for region: ${regionName}`);
        return;
      }
      const key = `${regionName}-${instanceNumber}`;
      this.navigationExpansion.set(key, expanded);
      logger.debug(`Set expansion for ${key} (navigation mode): ${expanded}`);
    }
  }

  /**
   * Toggle expansion state for a region
   * @param {string} regionName - The region name
   * @param {string} mode - 'showAll' or 'navigation'
   * @param {number|null} instanceNumber - Instance number (required for navigation mode)
   */
  toggleExpanded(regionName, mode, instanceNumber = null) {
    const currentState = this.isExpanded(regionName, mode, instanceNumber);
    this.setExpanded(regionName, !currentState, mode, instanceNumber);
    logger.debug(`Toggled expansion for ${regionName}: ${!currentState}`);
  }

  /**
   * Expand all regions in the current mode
   * @param {Array<string>} regionNames - Array of region names
   * @param {string} mode - 'showAll' or 'navigation'
   * @param {Map<string, number>|null} instanceNumbers - Map of regionName → instanceNumber (for navigation mode)
   */
  expandAll(regionNames, mode, instanceNumbers = null) {
    if (mode === 'showAll') {
      regionNames.forEach(name => {
        this.showAllExpansion.set(name, true);
      });
      logger.debug(`Expanded all ${regionNames.length} regions in showAll mode`);
    } else {
      // Navigation mode - need instance numbers
      if (!instanceNumbers) {
        logger.warn('expandAll called in navigation mode without instanceNumbers');
        return;
      }
      regionNames.forEach(name => {
        const instanceNumber = instanceNumbers.get(name);
        if (instanceNumber !== undefined) {
          const key = `${name}-${instanceNumber}`;
          this.navigationExpansion.set(key, true);
        }
      });
      logger.debug(`Expanded all ${regionNames.length} regions in navigation mode`);
    }
  }

  /**
   * Collapse all regions in the current mode
   * @param {Array<string>} regionNames - Array of region names
   * @param {string} mode - 'showAll' or 'navigation'
   * @param {Map<string, number>|null} instanceNumbers - Map of regionName → instanceNumber (for navigation mode)
   */
  collapseAll(regionNames, mode, instanceNumbers = null) {
    if (mode === 'showAll') {
      regionNames.forEach(name => {
        this.showAllExpansion.set(name, false);
      });
      logger.debug(`Collapsed all ${regionNames.length} regions in showAll mode`);
    } else {
      // Navigation mode - need instance numbers
      if (!instanceNumbers) {
        logger.warn('collapseAll called in navigation mode without instanceNumbers');
        return;
      }
      regionNames.forEach(name => {
        const instanceNumber = instanceNumbers.get(name);
        if (instanceNumber !== undefined) {
          const key = `${name}-${instanceNumber}`;
          this.navigationExpansion.set(key, false);
        }
      });
      logger.debug(`Collapsed all ${regionNames.length} regions in navigation mode`);
    }
  }

  /**
   * Clear navigation expansion state
   * Used when rules are reloaded or navigation path is reset
   */
  clearNavigationExpansion() {
    this.navigationExpansion.clear();
    logger.debug('Cleared navigation expansion state');
  }

  /**
   * Clear "Show All" expansion state
   * Used when rules are reloaded
   */
  clearShowAllExpansion() {
    this.showAllExpansion.clear();
    logger.debug('Cleared showAll expansion state');
  }

  /**
   * Clear all expansion state (both modes)
   * Used when rules are reloaded
   */
  clearAll() {
    this.navigationExpansion.clear();
    this.showAllExpansion.clear();
    logger.debug('Cleared all expansion state');
  }

  /**
   * Get expansion state for debugging
   * @returns {Object} Object with showAll and navigation state
   */
  getDebugState() {
    return {
      showAll: Object.fromEntries(this.showAllExpansion),
      navigation: Object.fromEntries(this.navigationExpansion)
    };
  }
}

export default ExpansionStateManager;
