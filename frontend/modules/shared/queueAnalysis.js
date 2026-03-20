/**
 * Shared Queue Analysis Module
 *
 * Core cost calculation and queue analysis logic used by both the Loops panel
 * and the Loop Stats panel. Extracted from loopStats/queueAnalyzer.js for reuse.
 */

import {
  proposedLinearReduction,
  proposedLinearFinalCost,
} from '../loops/xpFormulas.js';
import { getCostDataManager } from '../loops/index.js';

/** Maximum characters for truncated action names */
export const ACTION_NAME_MAX_CHARS = 30;

/** Fallback base costs when no cost data is loaded */
export const BASE_COSTS = {
  customAction: 50,
  locationCheck: 100,
  regionMove: 50,
};

/**
 * Get base cost for an action, using costDataManager when available
 * @param {Object} action - The action to calculate cost for
 * @returns {number} Base mana cost
 */
export function getBaseCost(action) {
  const costDataManager = getCostDataManager();

  if (costDataManager?.isLoaded()) {
    switch (action.type) {
      case 'regionMove':
        return costDataManager.getRegionCost(action.sourceRegion);
      case 'locationCheck':
        return costDataManager.getLocationCost(action.locationName);
      case 'customAction':
        return costDataManager.getRegionCost(action.sourceRegion) * 2;
      default:
        return 50;
    }
  }

  return BASE_COSTS[action.type] || 50;
}

/**
 * Calculate the mana cost of an action
 * @param {Object} action - The action to calculate cost for
 * @param {Object} loopState - The loop state for XP data
 * @returns {Object} Cost breakdown: { baseCost, levelDiscount, itemPenalties, finalCost, level }
 */
export function calculateActionCost(action, loopState) {
  const baseCost = getBaseCost(action);

  let levelDiscount = 0;
  let finalCost = baseCost;
  let level = 0;

  // Apply region XP reduction if applicable
  const actionRegion = action.sourceRegion;
  if (actionRegion && loopState) {
    const xpData = loopState.getRegionXP(actionRegion);
    level = xpData?.level || 0;

    finalCost = proposedLinearFinalCost(baseCost, level);
    levelDiscount = baseCost - finalCost;
  }

  return {
    baseCost,
    levelDiscount,
    itemPenalties: [], // Future: Phase 3 implementation
    finalCost,
    level,
  };
}

/**
 * Get a display name for an action
 * @param {Object} action - The action
 * @returns {string} Display name
 */
export function getActionDescription(action) {
  switch (action.type) {
    case 'customAction':
      return `Explore: ${action.sourceRegion}`;
    case 'locationCheck':
      return `Check: ${action.locationName}`;
    case 'regionMove': {
      const dest = action.destinationRegion;
      const via = action.exitUsed ? ` via ${action.exitUsed}` : '';
      return `Move: ${dest}${via}`;
    }
    default:
      return `${action.type}: ${action.sourceRegion || action.destinationRegion || 'Unknown'}`;
  }
}

/**
 * Truncate a string for narrow display
 * @param {string} str - String to truncate
 * @param {number} maxLen - Maximum length
 * @returns {string} Truncated string
 */
export function truncateDescription(str, maxLen = ACTION_NAME_MAX_CHARS) {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 1) + '…';
}

/**
 * Calculate predicted real time for an action in seconds
 * Based on loopState tick formula: progressIncrement = (deltaTime / 1000) * (20 / actionCost)
 * So total time = actionCost * 5 / gameSpeed
 * @param {number} actionCost - The mana cost of the action
 * @param {number} gameSpeed - Current game speed multiplier
 * @returns {number} Predicted time in seconds
 */
export function predictedTimeSeconds(actionCost, gameSpeed) {
  if (gameSpeed === Infinity || gameSpeed <= 0 || actionCost <= 0) return 0;
  return (actionCost * 5) / gameSpeed;
}

/**
 * Format time for display
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time string
 */
export function formatTime(seconds) {
  if (seconds <= 0) return '0s';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}m ${secs}s`;
}

/**
 * Get CSS class for mana remaining color coding
 * @param {number} remaining - Mana remaining
 * @param {number} max - Maximum mana
 * @returns {string} CSS class name
 */
export function manaColorClass(remaining, max) {
  if (remaining < 0) return 'loop-mana-insufficient';
  const pct = max > 0 ? remaining / max : 0;
  if (pct > 0.5) return 'loop-mana-good';
  if (pct > 0.1) return 'loop-mana-warn';
  return 'loop-mana-low';
}

/**
 * @typedef {Object} ActionAnalysis
 * @property {number} index - Position in the queue
 * @property {number} pathIndex - Path index for tracking
 * @property {string} type - Action type
 * @property {string} description - Full description
 * @property {string} truncatedDescription - Truncated for display
 * @property {string} sourceRegion - Source region (current region for locationCheck/customAction, origin for regionMove)
 * @property {string} destinationRegion - Destination region (only for regionMove)
 * @property {number} baseCost - Base mana cost
 * @property {number} levelDiscount - XP level reduction
 * @property {number} finalCost - Actual mana cost
 * @property {number} manaBeforeAction - Mana before this action
 * @property {number} manaAfterAction - Mana after this action (predicted)
 * @property {number} predictedTime - Predicted real time in seconds
 * @property {boolean} hasInsufficientMana - Will run out of mana
 * @property {boolean} isCompleted - Action is already completed
 * @property {number} progress - Current progress (0-100)
 * @property {string} status - 'pending', 'active', or 'completed'
 */

/**
 * @typedef {Object} QueueAnalysis
 * @property {ActionAnalysis[]} entries - Analysis for each action
 * @property {number} totalCost - Sum of all action costs
 * @property {number} finalMana - Predicted mana after all actions
 * @property {number} startingMana - Mana at start of analysis
 * @property {number} maxMana - Maximum mana capacity
 * @property {number} timestamp - When analysis was performed
 */

/**
 * Analyze the action queue and calculate costs for each action
 * @param {Array} actionQueue - Array of actions from loopState
 * @param {Object} loopState - The loop state instance
 * @returns {QueueAnalysis} Analysis result
 */
export function analyzeQueue(actionQueue, loopState) {
  if (!actionQueue || !loopState) {
    return {
      entries: [],
      totalCost: 0,
      finalMana: 0,
      startingMana: 0,
      maxMana: 100,
      timestamp: Date.now(),
    };
  }

  const maxMana = loopState.maxMana;
  const gameSpeed = loopState.gameSpeed || 10;
  const startingMana = maxMana;
  let currentMana = startingMana;
  let totalCost = 0;
  const entries = [];

  // Determine active action
  const currentActionIndex = loopState.currentActionIndex || 0;
  const isProcessing = loopState.isProcessing || false;

  for (let i = 0; i < actionQueue.length; i++) {
    const action = actionQueue[i];

    // Calculate cost breakdown
    const costData = calculateActionCost(action, loopState);

    // Get description
    const description = getActionDescription(action);
    const truncatedDescription = truncateDescription(description);

    // Calculate mana before/after
    const manaBeforeAction = currentMana;

    // Determine status
    let status = 'pending';
    if (action.completed) {
      status = 'completed';
    } else if (i === currentActionIndex && isProcessing) {
      status = 'active';
    }

    // Mana after action: always deduct full cost so downstream values are stable
    const manaAfterAction = manaBeforeAction - costData.finalCost;

    totalCost += costData.finalCost;
    currentMana = manaAfterAction;

    // Calculate predicted time
    const time = predictedTimeSeconds(costData.finalCost, gameSpeed);

    entries.push({
      index: i,
      pathIndex: action.pathIndex,
      type: action.type,
      description,
      truncatedDescription,
      sourceRegion: action.sourceRegion,
      destinationRegion: action.destinationRegion,
      locationName: action.locationName,

      // Cost breakdown
      baseCost: costData.baseCost,
      levelDiscount: costData.levelDiscount,
      level: costData.level,
      itemPenalties: costData.itemPenalties,
      finalCost: costData.finalCost,

      // Mana tracking
      manaBeforeAction,
      manaAfterAction,

      // Time
      predictedTime: time,

      // Status
      status,
      isDoubledCost: costData.itemPenalties.length > 0,
      hasInsufficientMana: manaAfterAction < 0,
      isCompleted: action.completed || false,
      progress: action.progress || 0,
    });
  }

  return {
    entries,
    totalCost,
    finalMana: currentMana,
    startingMana,
    maxMana,
    timestamp: Date.now(),
  };
}
