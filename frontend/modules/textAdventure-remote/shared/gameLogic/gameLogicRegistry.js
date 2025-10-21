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
 * - **Main Thread**: Used by stateInterface.js for helper function selection
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
 *     ├─> Calls createStateSnapshotInterface(snapshot, staticData)
 *     │
 *   Output: Need SnapshotInterface with helper execution capability
 *   ↓
 * stateInterface.js - createStateSnapshotInterface():
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
 * stateInterface.js:
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
 * **SUPPORTED GAMES**:
 * - A Link to the Past (ALTTP)
 * - A Hat in Time (AHIT)
 * - Aquaria
 * - ArchipIDLE
 * - Blasphemous
 * - Bomb Rush Cyberfunk
 * - Celeste 64
 * - Civilization VI
 * - Castlevania - Circle of the Moon
 * - DLCQuest
 * - Hollow Knight
 * - Hylics 2
 * - Inscryption
 * - Kingdom Hearts
 * - Pokemon Red and Blue
 * - Generic (fallback)
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
 * @see stateInterface.js - Uses this for helper function selection (both threads)
 * @see stateManager/core/initialization.js - Uses this for StateManager setup (worker)
 * @see ruleEngine.js - Calls helpers returned by this registry
 */

// Import all game logic modules
import * as alttpLogic from './alttp/alttpLogic.js';
import { alttpStateModule } from './alttp/alttpLogic.js';
import * as genericLogic from './generic/genericLogic.js';
import * as ahitLogic from './ahit/ahitLogic.js';
import { ahitStateModule } from './ahit/ahitLogic.js';
import * as aquariaLogic from './aquaria/aquariaLogic.js';
import * as archipidleLogic from './archipidle/archipidleLogic.js';
import { archipidleStateModule } from './archipidle/archipidleLogic.js';
import * as blasphemousLogic from './blasphemous/blasphemousLogic.js';
import { blasphemousStateModule } from './blasphemous/blasphemousLogic.js';
import { helperFunctions as bombRushCyberfunkHelperFunctions } from './bomb_rush_cyberfunk/bombRushCyberfunkLogic.js';
import * as celeste64Logic from './celeste64/celeste64Logic.js';
import { celeste64StateModule } from './celeste64/celeste64Logic.js';
import * as civ6Logic from './civ_6/civ6Logic.js';
import { civ6StateModule } from './civ_6/civ6Logic.js';
import { helperFunctions as cvcotmHelperFunctions } from './cvcotm/cvcotmLogic.js';
import * as dlcquestLogic from './dlcquest/dlcquestLogic.js';
import { dlcquestStateModule } from './dlcquest/dlcquestLogic.js';
import * as hkLogic from './hk/hkLogic.js';
import { hkStateModule } from './hk/hkLogic.js';
import * as hylics2Logic from './hylics_2/hylics2Logic.js';
import { hylics2StateModule } from './hylics_2/hylics2Logic.js';
import * as inscryptionLogic from './inscryption/inscryptionLogic.js';
import { inscryptionStateModule } from './inscryption/inscryptionLogic.js';
import { kh1Logic } from './kh1/kh1Logic.js';
import * as pokemon_rbLogic from './pokemon_rb/pokemon_rbLogic.js';
import { pokemon_rbStateModule } from './pokemon_rb/pokemon_rbLogic.js';

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
  'Aquaria': {
    logicModule: genericLogic.genericStateModule,
    helperFunctions: aquariaLogic.helperFunctions,
    worldClasses: ['AquariaWorld'],
    aliases: ['Aquaria']
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
  'Celeste 64': {
    logicModule: celeste64Logic.celeste64StateModule,
    helperFunctions: celeste64Logic.helperFunctions,
    worldClasses: ['Celeste64World'],
    aliases: ['Celeste 64', 'Celeste64']
  },
  'Civilization VI': {
    logicModule: civ6Logic.civ6StateModule,
    helperFunctions: civ6Logic.helperFunctions,
    worldClasses: ['CivVIWorld'],
    aliases: ['Civilization VI', 'Civ VI', 'Civ6']
  },
  'Castlevania - Circle of the Moon': {
    logicModule: genericLogic.genericStateModule,
    helperFunctions: cvcotmHelperFunctions,
    worldClasses: ['CVCotMWorld'],
    aliases: ['Castlevania - Circle of the Moon', 'CvCotM', 'cvcotm']
  },
  'DLCQuest': {
    logicModule: dlcquestLogic.dlcquestStateModule,
    helperFunctions: dlcquestLogic.helperFunctions,
    worldClasses: ['DLCqworld'],
    aliases: ['DLCQuest', 'DLC Quest']
  },
  'Hollow Knight': {
    logicModule: hkLogic.hkStateModule,
    helperFunctions: hkLogic.helperFunctions,
    worldClasses: ['HKWorld'],
    aliases: ['Hollow Knight', 'HK']
  },
  'Hylics 2': {
    logicModule: hylics2Logic.hylics2StateModule,
    helperFunctions: hylics2Logic.helperFunctions,
    worldClasses: ['Hylics2World'],
    aliases: ['Hylics 2', 'Hylics2']
  },
  'Inscryption': {
    logicModule: inscryptionLogic.inscryptionStateModule,
    helperFunctions: inscryptionLogic.helperFunctions,
    worldClasses: ['InscryptionWorld'],
    aliases: ['Inscryption']
  },
  'Kingdom Hearts': {
    logicModule: genericLogic.genericStateModule,
    helperFunctions: kh1Logic,
    worldClasses: ['KH1World'],
    aliases: ['Kingdom Hearts', 'KH1', 'Kingdom Hearts 1']
  },
  'Pokemon Red and Blue': {
    logicModule: pokemon_rbLogic.pokemon_rbStateModule,
    helperFunctions: pokemon_rbLogic.helperFunctions,
    worldClasses: ['PokemonRedBlueWorld'],
    aliases: ['Pokemon Red and Blue', 'Pokemon RB', 'pokemon_rb']
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