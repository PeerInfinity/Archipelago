/**
 * Queue Analyzer for Loop Stats Panel
 *
 * Wraps the shared queue analysis module with loopStats-specific features:
 * previous/current analysis comparison and caching.
 */

import {
  calculateActionCost,
  getActionDescription,
  truncateDescription,
  analyzeQueue,
} from '../shared/queueAnalysis.js';

// Re-export shared functions for backwards compatibility
export { calculateActionCost, getActionDescription, truncateDescription };

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('queueAnalyzer', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[queueAnalyzer] ${message}`, ...data);
  }
}

/**
 * QueueAnalyzer class
 * Wraps shared analysis with prev/curr comparison and caching
 */
export class QueueAnalyzer {
  constructor() {
    // Previous loop analysis for comparison
    this.previousAnalysis = null;

    // Current analysis cache
    this.currentAnalysis = null;

    // Fallback base costs for each action type
    this.baseCosts = {
      customAction: 50,
      locationCheck: 100,
      regionMove: 50,
    };
  }

  /**
   * Get base cost for an action type
   * @param {string} actionType - The type of action
   * @returns {number} Base mana cost
   */
  getBaseCost(actionType) {
    return this.baseCosts[actionType] || 50;
  }

  /**
   * Calculate the mana cost of an action (delegates to shared module)
   */
  calculateActionCost(action, loopState) {
    return calculateActionCost(action, loopState);
  }

  /**
   * Get a display name for an action (delegates to shared module)
   */
  getActionDescription(action) {
    return getActionDescription(action);
  }

  /**
   * Truncate a string for narrow display (delegates to shared module)
   */
  truncateDescription(str, maxLen = 20) {
    return truncateDescription(str, maxLen);
  }

  /**
   * Analyze the action queue and calculate costs (delegates to shared module)
   * @param {Array} actionQueue - Array of actions from loopState
   * @param {Object} loopState - The loop state instance
   * @returns {Object} Analysis result
   */
  analyze(actionQueue, loopState) {
    const analysis = analyzeQueue(actionQueue, loopState);

    // Cache current analysis
    this.currentAnalysis = analysis;

    return analysis;
  }

  /**
   * Archive current analysis as previous (called on loop reset)
   */
  archiveCurrentAnalysis() {
    if (this.currentAnalysis) {
      this.previousAnalysis = { ...this.currentAnalysis };
      log('info', 'Archived current analysis as previous');
    }
  }

  /**
   * Get the previous loop analysis for comparison
   * @returns {Object|null} Previous analysis or null
   */
  getPreviousAnalysis() {
    return this.previousAnalysis;
  }

  /**
   * Get the current cached analysis
   * @returns {Object|null} Current analysis or null
   */
  getCurrentAnalysis() {
    return this.currentAnalysis;
  }

  /**
   * Clear all cached analysis data
   */
  clearCache() {
    this.currentAnalysis = null;
    this.previousAnalysis = null;
  }

  /**
   * Get a comparison of current vs previous analysis for an action
   * @param {number} index - Action index
   * @returns {Object|null} Comparison data or null
   */
  getComparison(index) {
    if (!this.currentAnalysis || !this.previousAnalysis) {
      return null;
    }

    const current = this.currentAnalysis.entries.find(e => e.index === index);
    const previous = this.previousAnalysis.entries.find(e => e.index === index);

    if (!current) return null;

    return {
      current,
      previous: previous || null,
      manaChanged: previous ? current.manaAfterAction !== previous.manaAfterAction : false,
      costChanged: previous ? current.finalCost !== previous.finalCost : false,
    };
  }

  /**
   * Get serializable state for persistence/testing
   * @returns {Object} Serializable state
   */
  getSerializableState() {
    return {
      currentAnalysis: this.currentAnalysis,
      previousAnalysis: this.previousAnalysis,
      baseCosts: { ...this.baseCosts },
    };
  }
}

// Export singleton instance for convenience
export const queueAnalyzer = new QueueAnalyzer();
export default queueAnalyzer;
