/**
 * Centralized game logic registry
 * This module handles game detection and logic module selection to eliminate
 * duplicate code throughout the state manager
 */

// Import all game logic modules
import * as alttpLogic from './alttp/alttpLogic.js';
import { alttpStateModule } from './alttp/alttpLogic.js';
import * as genericLogic from './generic/genericLogic.js';
import * as ahitLogic from './ahit/ahitLogic.js';
import { ahitStateModule } from './ahit/ahitLogic.js';
import * as archipidleLogic from './archipidle/archipidleLogic.js';
import { archipidleStateModule } from './archipidle/archipidleLogic.js';
import * as blasphemousLogic from './blasphemous/blasphemousLogic.js';
import { blasphemousStateModule } from './blasphemous/blasphemousLogic.js';
import { helperFunctions as bombRushCyberfunkHelperFunctions } from './bomb_rush_cyberfunk/bombRushCyberfunkLogic.js';

/**
 * Registry of all supported games and their logic modules
 */
const GAME_REGISTRY = {
  'A Link to the Past': {
    logicModule: alttpLogic.alttpStateModule,
    helperFunctions: alttpLogic.helperFunctions,
    worldClasses: ['ALTTPWorld'],
    aliases: ['A Link to the Past', 'ALTTP']
  },
  'A Hat in Time': {
    logicModule: ahitLogic.ahitStateModule,
    helperFunctions: ahitLogic.helperFunctions,
    worldClasses: ['HatInTimeWorld'],
    aliases: ['A Hat in Time', 'AHIT']
  },
  'ArchipIDLE': {
    logicModule: archipidleLogic.archipidleStateModule,
    helperFunctions: archipidleLogic.helperFunctions,
    worldClasses: ['ArchipIDLEWorld'],
    aliases: ['ArchipIDLE']
  },
  'Blasphemous': {
    logicModule: blasphemousLogic.blasphemousStateModule,
    helperFunctions: blasphemousLogic.helperFunctions,
    worldClasses: ['BlasphemousWorld'],
    aliases: ['Blasphemous']
  },
  'Bomb Rush Cyberfunk': {
    logicModule: genericLogic.genericStateModule, // Using generic for now
    helperFunctions: bombRushCyberfunkHelperFunctions,
    worldClasses: ['BombRushCyberfunkWorld'],
    aliases: ['Bomb Rush Cyberfunk', 'BRC']
  },
  // Add more games here as they're implemented
  'Generic': {
    logicModule: genericLogic.genericStateModule,
    helperFunctions: genericLogic.helperFunctions,
    worldClasses: [],
    aliases: ['Generic', 'Unknown']
  }
};

/**
 * World class to game name mapping for automatic detection
 */
const WORLD_CLASS_MAPPING = {};

// Build world class mapping from registry
for (const [gameName, config] of Object.entries(GAME_REGISTRY)) {
  for (const worldClass of config.worldClasses) {
    WORLD_CLASS_MAPPING[worldClass] = gameName;
  }
}

/**
 * Detect game name from world class
 * @param {string} worldClass - The world class from Archipelago data
 * @returns {string} The detected game name or 'Generic' as fallback
 */
export function detectGameFromWorldClass(worldClass) {
  if (!worldClass) {
    return 'Generic';
  }

  // Direct mapping
  if (WORLD_CLASS_MAPPING[worldClass]) {
    return WORLD_CLASS_MAPPING[worldClass];
  }

  // Fallback: check if world class contains any game names
  for (const [gameName, config] of Object.entries(GAME_REGISTRY)) {
    for (const alias of config.aliases) {
      if (worldClass.includes(alias)) {
        return gameName;
      }
    }
  }

  return 'Generic';
}

/**
 * Get logic configuration for a game
 * @param {string} gameName - The name of the game
 * @returns {Object} Object containing logicModule and helperFunctions
 */
export function getGameLogic(gameName) {
  const config = GAME_REGISTRY[gameName];
  
  if (!config) {
    // Fallback to Generic for unknown games
    return {
      logicModule: GAME_REGISTRY['Generic'].logicModule,
      helperFunctions: GAME_REGISTRY['Generic'].helperFunctions
    };
  }

  return {
    logicModule: config.logicModule,
    helperFunctions: config.helperFunctions
  };
}

/**
 * Get all supported game names
 * @returns {string[]} Array of supported game names
 */
export function getSupportedGames() {
  return Object.keys(GAME_REGISTRY).filter(name => name !== 'Generic');
}

/**
 * Check if a game is supported
 * @param {string} gameName - The name of the game to check
 * @returns {boolean} True if the game is supported
 */
export function isGameSupported(gameName) {
  return GAME_REGISTRY.hasOwnProperty(gameName);
}

/**
 * Determine game name from various sources
 * @param {Object} options - Detection options
 * @param {string} options.gameName - Direct game name from rules
 * @param {Object} options.settings - Game settings object
 * @param {string} options.worldClass - World class from Archipelago data
 * @returns {string} The determined game name
 */
export function determineGameName({ gameName, settings, worldClass }) {
  // Priority order:
  // 1. Direct gameName from rules (most reliable)
  // 2. Settings.game
  // 3. Detection from world class
  // 4. Fallback to Generic

  // Check for direct gameName first (from rules.json)
  if (gameName && isGameSupported(gameName)) {
    return gameName;
  }

  // Check for direct settings.game
  if (settings && settings.game && isGameSupported(settings.game)) {
    return settings.game;
  }

  // Check for nested player settings structure (e.g., settings["1"].game)
  // TODO - check if this even happens
  if (settings && typeof settings === 'object') {
    for (const playerId in settings) {
      const playerSettings = settings[playerId];
      if (playerSettings && typeof playerSettings === 'object' &&
          playerSettings.game && isGameSupported(playerSettings.game)) {
        return playerSettings.game;
      }
    }
  }

  if (worldClass) {
    const detected = detectGameFromWorldClass(worldClass);
    if (detected !== 'Generic') {
      return detected;
    }
  }

  return 'Generic';
}

/**
 * Initialize game logic for state manager
 * This is the main function that state manager should call
 * @param {Object} options - Initialization options
 * @param {string} options.gameName - Direct game name from rules
 * @param {Object} options.settings - Game settings object
 * @param {string} options.worldClass - World class from Archipelago data
 * @returns {Object} Object containing logicModule, helperFunctions, and detectedGame
 */
export function initializeGameLogic({ gameName, settings, worldClass }) {
  const detectedGame = determineGameName({ gameName, settings, worldClass });
  const logic = getGameLogic(detectedGame);

  return {
    logicModule: logic.logicModule,
    helperFunctions: logic.helperFunctions,
    detectedGame: detectedGame
  };
}