/**
 * Empty Game Logic Registry - Generic-only version for text adventure remote
 *
 * This is a minimal version of gameLogicRegistry.js that only provides generic
 * fallback logic without any game-specific JavaScript helpers. All games will
 * use the generic helpers (has, count, location_item_name).
 *
 * @module shared/gameLogic/gameLogicRegistry
 */

// Only import generic logic - no game-specific helpers
import * as genericLogic from './generic/genericLogic.js';

/**
 * Empty registry - all games use generic fallback
 */
const GAME_REGISTRY = {
  'Generic': {
    logicModule: genericLogic.genericStateModule,
    helperFunctions: genericLogic.helperFunctions,
    worldClasses: [],
    aliases: ['Generic', 'Unknown']
  }
};

/**
 * Empty world class mapping
 */
const WORLD_CLASS_MAPPING = {};

/**
 * Detect game name from world class - always returns Generic
 * @param {string} worldClass - The world class from Archipelago data
 * @returns {string} Always returns 'Generic'
 */
export function detectGameFromWorldClass(worldClass) {
  return 'Generic';
}

/**
 * Get logic configuration for a game - always returns generic
 * @param {string} gameName - The name of the game
 * @returns {Object} Object containing logicModule, helperFunctions
 */
export function getGameLogic(gameName) {
  return {
    logicModule: GAME_REGISTRY['Generic'].logicModule,
    helperFunctions: GAME_REGISTRY['Generic'].helperFunctions,
    stateMethods: GAME_REGISTRY['Generic'].stateMethods,
    stateModule: GAME_REGISTRY['Generic'].logicModule,
    constants: GAME_REGISTRY['Generic'].constants,
    wrapState: GAME_REGISTRY['Generic'].wrapState
  };
}

/**
 * Get all supported game names - returns empty for this version
 * @returns {string[]} Empty array
 */
export function getSupportedGames() {
  return [];
}

/**
 * Check if a game is supported - always returns false (use generic)
 * @param {string} gameName - The name of the game to check
 * @returns {boolean} Always false
 */
export function isGameSupported(gameName) {
  return false;
}

/**
 * Determine game name from various sources - always returns Generic
 * @param {Object} options - Detection options
 * @returns {string} Always returns 'Generic'
 */
export function determineGameName({ gameName, settings, worldClass }) {
  return 'Generic';
}

/**
 * Initialize game logic for state manager - always returns generic
 * @param {Object} options - Initialization options
 * @returns {Object} Generic logic configuration
 */
export function initializeGameLogic({ gameName, settings, worldClass }) {
  const logic = getGameLogic('Generic');

  return {
    logicModule: logic.logicModule,
    helperFunctions: logic.helperFunctions,
    constants: logic.constants,
    detectedGame: 'Generic'
  };
}
