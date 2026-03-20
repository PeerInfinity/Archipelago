/**
 * Game Logic Registry - Thread-Agnostic Game Detection and Logic Selection
 *
 * This module provides centralized game detection and logic module selection that works
 * identically in both the web worker thread (StateManager) and main thread (UI components).
 * It eliminates duplicate game detection code and ensures consistent helper function usage.
 *
 * **THREAD-AGNOSTIC DESIGN**:
 * This file runs in BOTH thread contexts without modification:
 * - **Worker Thread**: Used by StateManager during initialization and rule evaluation
 * - **Main Thread**: Used by snapshotInterface.js for helper function selection
 *
 * The key to thread-agnostic design:
 * - Pure functional exports - no side effects
 * - No DOM or Worker-specific APIs
 * - Static registry - no runtime state
 * - All imports resolved at load time
 *
 * **DATA FLOW - WORKER THREAD PATH**:
 *
 * StateManager Initialization [worker thread]:
 *   Input: JSON rules loaded, need to initialize game logic
 *   ↓
 * initialization.js - loadFromJSON():
 *   Processing:
 *     ├─> Parses jsonData.settings[playerId] to get game name
 *     ├─> Calls initializeGameLogic(sm, jsonData, selectedPlayerId)
 *     │
 *   Output: Need to select appropriate game logic module
 *   ↓
 * initialization.js - initializeGameLogic():
 *   Processing:
 *     ├─> Extract game name from settings or rules
 *     │     └─> gameName = gameSettingsFromFile.game || sm.rules?.game_name || 'UnknownGame'
 *     ├─> Call getGameLogic(gameName) [THIS FILE]
 *     │
 *   Output: Request game logic for detected game
 *   ↓
 * getGameLogic(gameName) [THIS FILE] (worker thread):
 *   Input:
 *     └─> gameName: 'A Link to the Past' (or other game name)
 *
 *   Processing:
 *     ├─> Lookup in GAME_REGISTRY['A Link to the Past']
 *     │     └─> Found: {
 *     │           logicModule: alttpStateModule,
 *     │           helperFunctions: alttpLogic.helperFunctions,
 *     │           worldClasses: ['ALTTPWorld'],
 *     │           aliases: ['A Link to the Past', 'ALTTP']
 *     │         }
 *     ├─> Return logic configuration
 *     │
 *   Output:
 *     └─> { logicModule, helperFunctions }
 *   ↓
 * initialization.js:
 *   Processing:
 *     ├─> sm.logicModule = logic.logicModule
 *     ├─> sm.helperFunctions = logic.helperFunctions
 *     ├─> sm.gameStateModule = sm.logicModule.initializeState()
 *     │
 *   Output: StateManager configured with game-specific logic
 *   ↓
 * StateManager Runtime:
 *   - Uses sm.helperFunctions for rule evaluation
 *   - Helper functions called with signature: (snapshot, staticData, ...args)
 *
 * **DATA FLOW - MAIN THREAD PATH**:
 *
 * UI Component Initialization [main thread]:
 *   Input: LocationUI needs to evaluate rules on cached snapshots
 *   ↓
 * LocationUI.updateLocationDisplay():
 *   Processing:
 *     ├─> Gets cached snapshot from proxy
 *     ├─> Gets cached staticData from proxy
 *     ├─> Calls createSnapshotInterface(snapshot, staticData)
 *     │
 *   Output: Need SnapshotInterface with helper execution capability
 *   ↓
 * snapshotInterface.js - createSnapshotInterface():
 *   Processing:
 *     ├─> Detects game name from staticData
 *     │     └─> const gameName = staticData?.game_name || snapshot?.game
 *     ├─> Calls getGameLogic(gameName) [THIS FILE]
 *     │
 *   Output: Request game logic for detected game
 *   ↓
 * getGameLogic(gameName) [THIS FILE] (main thread):
 *   Input:
 *     └─> gameName: 'A Link to the Past'
 *
 *   Processing:
 *     ├─> Lookup in GAME_REGISTRY['A Link to the Past']
 *     │     └─> SAME registry as worker thread!
 *     ├─> Return logic configuration
 *     │
 *   Output:
 *     └─> { logicModule, helperFunctions }
 *           └─> SAME helper functions as worker thread!
 *   ↓
 * snapshotInterface.js:
 *   Processing:
 *     ├─> Creates interface with executeHelper() method
 *     │     └─> executeHelper(name, ...args) {
 *     │           const selectedHelpers = getHelperFunctions(gameName);
 *     │           return selectedHelpers[name](snapshot, staticData, ...args);
 *     │         }
 *     ├─> Returns SnapshotInterface
 *     │
 *   Output: Interface ready for rule evaluation
 *   ↓
 * LocationUI:
 *   Processing:
 *     ├─> Calls evaluateRule(location.access_rule, snapshotInterface)
 *     ├─> Rule engine calls snapshotInterface.executeHelper('has', 'Progressive Sword')
 *     ├─> Interface calls helperFunctions.has(snapshot, staticData, 'Progressive Sword')
 *     │     └─> Uses CACHED snapshot data from proxy
 *     │
 *   Output: boolean result used for UI rendering
 *
 * **KEY DIFFERENCE BETWEEN PATHS**:
 *
 * Worker Thread:
 *   ├─> Called once during StateManager initialization
 *   ├─> Stores helper functions on StateManager instance
 *   ├─> Helper functions operate on live state data
 *   └─> Used for state computation and updates
 *
 * Main Thread:
 *   ├─> Called every time SnapshotInterface is created
 *   ├─> Gets fresh reference to helper functions each time
 *   ├─> Helper functions operate on cached snapshot data
 *   └─> Used for read-only UI rendering
 *
 * IMPORTANT: Both paths use THE SAME helper function implementations!
 *
 * **GAME REGISTRY STRUCTURE**:
 * ```javascript
 * const GAME_REGISTRY = {
 *   'Game Name': {
 *     logicModule: gameStateModule,      // State management (worker only)
 *     helperFunctions: { has, count, ... }, // Rule evaluation (both threads)
 *     worldClasses: ['WorldClassName'],  // Archipelago world class names
 *     aliases: ['Full Name', 'Abbrev']   // Alternative names for detection
 *   }
 * }
 * ```
 *
 * **GAME DETECTION FLOW**:
 *
 * determineGameName({ gameName, settings, worldClass }):
 *   Priority order:
 *     1. Direct gameName from rules.json (most reliable)
 *     2. settings.game field
 *     3. Detection from worldClass via detectGameFromWorldClass()
 *     4. Fallback to 'Generic'
 *
 * detectGameFromWorldClass(worldClass):
 *   Input: 'ALTTPWorld' (from Archipelago data)
 *   Processing:
 *     ├─> Lookup in WORLD_CLASS_MAPPING['ALTTPWorld']
 *     │     └─> Returns 'A Link to the Past'
 *     ├─> If not found, check aliases for partial matches
 *     │
 *   Output: Detected game name or 'Generic'
 *
 * **GAMES WITH CUSTOM LOGIC**:
 * - Bomb Rush Cyberfunk
 * - Jak and Daxter: The Precursor Legacy
 * - Lingo
 * - Pokemon Red and Blue
 * - Pokemon Emerald
 * - Secret of Evermore
 * - SMZ3
 * - Starcraft 2
 * - Stardew Valley
 * - Super Metroid
 * - Yacht Dice
 * - Yu-Gi-Oh! 2006
 * - Generic (fallback for all other games)
 *
 * **HELPER FUNCTION SIGNATURE**:
 * All helper functions follow the standardized signature:
 *   helperFunction(snapshot, staticData, ...args)
 *
 * - snapshot: Current game state (inventory, flags, events, reachability)
 * - staticData: Static game data (items, regions, locations, settings)
 * - ...args: Rule-specific arguments from JSON
 *
 * Example:
 *   has(snapshot, staticData, itemName) {
 *     // Check flags
 *     if (snapshot.flags?.includes(itemName)) return true;
 *     // Check inventory
 *     return (snapshot.inventory[itemName] || 0) > 0;
 *   }
 *
 * **ARCHITECTURE NOTES**:
 * - Static registry built at module load time
 * - No runtime configuration or state changes
 * - World class mapping auto-generated from registry
 * - Fallback to Generic for unknown games
 * - Helper functions are pure - no side effects
 * - Thread-safe by design (no shared mutable state)
 *
 * @module shared/gameLogic/gameLogicRegistry
 * @see snapshotInterface.js - Uses this for helper function selection (both threads)
 * @see stateManager/core/initialization.js - Uses this for StateManager setup (worker)
 * @see ruleEngine.js - Calls helpers returned by this registry
 */

// Game logic modules - only games with custom JavaScript helpers are imported
import * as genericLogic from './generic/genericLogic.js';
import { helperFunctions as bombRushCyberfunkHelperFunctions } from './bomb_rush_cyberfunk/bomb_rush_cyberfunkLogic.js';
import * as jakanddaxterLogic from './jakanddaxter/jakanddaxterLogic.js';
import { helperFunctions as lingoHelperFunctions } from './lingo/lingoLogic.js';
import * as pokemon_rbLogic from './pokemon_rb/pokemon_rbLogic.js';
import * as pokemon_emeraldLogic from './pokemon_emerald/pokemon_emeraldLogic.js';
import * as soeLogic from './soe/soeLogic.js';
import * as smz3Logic from './smz3/smz3Logic.js';
import * as sc2Logic from './sc2/sc2Logic.js';
import { helperFunctions as smHelperFunctions, smStateModule } from './sm/smLogic.js';
import * as stardewValleyLogic from './stardew_valley/stardew_valleyLogic.js';
import * as yachtdiceLogic from './yachtdice/yachtdiceLogic.js';
import * as yugioh06Logic from './yugioh06/yugioh06Logic.js';

/**
 * Registry of games with custom JavaScript logic modules.
 * Games without custom helpers use the generic fallback automatically.
 */
const GAME_REGISTRY = {
  'Bomb Rush Cyberfunk': {
    logicModule: genericLogic.genericStateModule,
    helperFunctions: bombRushCyberfunkHelperFunctions,
    worldClasses: ['BombRushCyberfunkWorld'],
    aliases: ['Bomb Rush Cyberfunk', 'BRC']
  },
  'Jak and Daxter: The Precursor Legacy': {
    logicModule: genericLogic.genericStateModule,
    helperFunctions: jakanddaxterLogic.helperFunctions,
    worldClasses: ['JakAndDaxterWorld'],
    aliases: ['Jak and Daxter: The Precursor Legacy', 'Jak and Daxter']
  },
  'Pokemon Red and Blue': {
    logicModule: pokemon_rbLogic.pokemon_rbStateModule,
    helperFunctions: pokemon_rbLogic.helperFunctions,
    worldClasses: ['PokemonRedBlueWorld'],
    aliases: ['Pokemon Red and Blue', 'Pokemon RB', 'pokemon_rb']
  },
  'Pokemon Emerald': {
    logicModule: pokemon_emeraldLogic.pokemon_emeraldStateModule,
    helperFunctions: pokemon_emeraldLogic.helperFunctions,
    worldClasses: ['PokemonEmeraldWorld'],
    aliases: ['Pokemon Emerald', 'pokemon_emerald']
  },
  'Lingo': {
    logicModule: genericLogic.genericStateModule,
    helperFunctions: lingoHelperFunctions,
    worldClasses: ['LingoWorld'],
    aliases: ['Lingo']
  },
  'Starcraft 2': {
    logicModule: genericLogic.genericStateModule,
    helperFunctions: sc2Logic.helperFunctions,
    helperPrefixes: sc2Logic.helperPrefixes,
    helpersWithOptionalArgs: sc2Logic.helpersWithOptionalArgs,
    wrapState: sc2Logic.wrapState,
    worldClasses: ['SC2World'],
    aliases: ['Starcraft 2', 'SC2', 'StarCraft 2', 'StarCraft II']
  },
  'Secret of Evermore': {
    logicModule: genericLogic.genericStateModule,
    helperFunctions: soeLogic.helperFunctions,
    worldClasses: ['SoEWorld'],
    aliases: ['Secret of Evermore', 'SOE', 'soe']
  },
  'Stardew Valley': {
    logicModule: stardewValleyLogic.stardewValleyStateModule,
    helperFunctions: stardewValleyLogic.helperFunctions,
    worldClasses: ['StardewValleyWorld'],
    aliases: ['Stardew Valley', 'SDV', 'stardew_valley']
  },
  'SMZ3': {
    logicModule: genericLogic.genericStateModule,
    helperFunctions: smz3Logic,
    worldClasses: ['SMZ3World'],
    aliases: ['SMZ3', 'Super Metroid and A Link to the Past Combo Randomizer']
  },
  'Super Metroid': {
    logicModule: smStateModule, // Using SM-specific state module with smbm support
    helperFunctions: smHelperFunctions,
    worldClasses: ['SMWorld'],
    aliases: ['Super Metroid', 'SM']
  },
  'Yacht Dice': {
    logicModule: yachtdiceLogic.yachtdiceStateModule,
    helperFunctions: yachtdiceLogic.helperFunctions,
    worldClasses: ['YachtDiceWorld'],
    aliases: ['Yacht Dice', 'yacht_dice']
  },
  'Yu-Gi-Oh! 2006': {
    logicModule: genericLogic.genericStateModule, // Using generic state module
    helperFunctions: yugioh06Logic.helperFunctions,
    worldClasses: ['Yugioh06World'],
    aliases: ['Yu-Gi-Oh! 2006', 'yugioh06']
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
 * @returns {Object} Object containing logicModule, helperFunctions, and optional constants
 */
export function getGameLogic(gameName) {
  let config = GAME_REGISTRY[gameName];

  // Try to find config for " WorldGen" suffixed game names (e.g., "DLCQuest WorldGen" -> "DLCQuest")
  if (!config && gameName && gameName.endsWith(' WorldGen')) {
    const baseGameName = gameName.slice(0, -9); // Remove " WorldGen" suffix
    config = GAME_REGISTRY[baseGameName];
  }

  if (!config) {
    // Fallback to Generic for unknown games
    return {
      logicModule: GAME_REGISTRY['Generic'].logicModule,
      helperFunctions: GAME_REGISTRY['Generic'].helperFunctions,
      stateMethods: GAME_REGISTRY['Generic'].stateMethods,
      stateModule: GAME_REGISTRY['Generic'].logicModule,
      constants: GAME_REGISTRY['Generic'].constants,
      wrapState: GAME_REGISTRY['Generic'].wrapState
    };
  }

  return {
    logicModule: config.logicModule,
    // Fallback to generic helpers if none specified - base helpers like has/count are always needed
    helperFunctions: config.helperFunctions || GAME_REGISTRY['Generic'].helperFunctions,
    helpersWithOptionalArgs: config.helpersWithOptionalArgs,
    stateMethods: config.stateMethods,
    stateModule: config.logicModule, // Expose stateModule for hooks
    constants: config.constants,
    wrapState: config.wrapState
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
  if (GAME_REGISTRY.hasOwnProperty(gameName)) {
    return true;
  }
  // Also check for " WorldGen" suffixed game names (e.g., "DLCQuest WorldGen" -> "DLCQuest")
  if (gameName && gameName.endsWith(' WorldGen')) {
    const baseGameName = gameName.slice(0, -9); // Remove " WorldGen" suffix
    return GAME_REGISTRY.hasOwnProperty(baseGameName);
  }
  return false;
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
 * @returns {Object} Object containing logicModule, helperFunctions, constants, and detectedGame
 */
export function initializeGameLogic({ gameName, settings, worldClass }) {
  const detectedGame = determineGameName({ gameName, settings, worldClass });
  const logic = getGameLogic(detectedGame);

  return {
    logicModule: logic.logicModule,
    helperFunctions: logic.helperFunctions,
    constants: logic.constants,
    detectedGame: detectedGame
  };
}