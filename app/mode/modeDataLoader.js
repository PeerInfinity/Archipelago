// modeDataLoader.js - Load combined mode data from localStorage or files
// Extracted from init.js lines 640-1097

import { LOCAL_STORAGE_MODE_PREFIX } from './modeManager.js';
import { loadAndMergeJsonFiles, getConfigPaths } from '../../utils/settingsMerger.js';

/**
 * Loads combined mode data from localStorage or config files
 *
 * ⚠️ CRITICAL: This function RETURNS the combined mode data instead of setting a global.
 * The calling code MUST capture and use the return values:
 *
 * @example
 * // CORRECT:
 * const { combinedModeData, layoutPresets } = await loadCombinedModeData(options);
 *
 * // INCORRECT (will lose all mode data):
 * await loadCombinedModeData(options); // ❌ Return values ignored!
 *
 * @param {Object} options - Configuration options
 * @param {URLSearchParams} options.urlParams - URL search parameters (required)
 * @param {Object} options.modesConfig - The modes configuration (from modes.json) (required)
 * @param {string} options.currentActiveMode - The current active mode (required)
 * @param {boolean} options.skipLocalStorageLoad - Whether to skip localStorage loading (required)
 * @param {Function} options.fetchJson - Function to fetch JSON files (required)
 * @param {Function} options.log - Log function for console output (required)
 * @param {Object} options.logger - Logger instance (required)
 * @param {Function} options.isValidLayoutObject - Function to validate layout objects (required)
 * @param {Function} options.getDefaultLayoutConfig - Function to get default layout config (required)
 * @returns {Promise<Object>} Object containing combinedModeData and layoutPresets
 * @returns {Object} return.combinedModeData - The combined mode data with dataSources tracking
 * @returns {Object} return.layoutPresets - The layout presets extracted from layoutConfig
 * @throws {Error} If required parameters are missing
 */
export async function loadCombinedModeData(options) {
  // Validate required parameters
  if (!options) {
    throw new Error('loadCombinedModeData requires options object');
  }

  const {
    urlParams,
    modesConfig,
    currentActiveMode,
    skipLocalStorageLoad,
    fetchJson,
    log,
    logger,
    isValidLayoutObject,
    getDefaultLayoutConfig,
  } = options;

  // Validate critical parameters
  if (!urlParams) throw new Error('loadCombinedModeData requires options.urlParams');
  if (!modesConfig) throw new Error('loadCombinedModeData requires options.modesConfig');
  if (!currentActiveMode) throw new Error('loadCombinedModeData requires options.currentActiveMode');
  if (typeof skipLocalStorageLoad !== 'boolean') throw new Error('loadCombinedModeData requires options.skipLocalStorageLoad (boolean)');
  if (!fetchJson || typeof fetchJson !== 'function') throw new Error('loadCombinedModeData requires options.fetchJson (function)');
  if (!log || typeof log !== 'function') throw new Error('loadCombinedModeData requires options.log (function)');
  if (!logger) throw new Error('loadCombinedModeData requires options.logger');
  if (!isValidLayoutObject || typeof isValidLayoutObject !== 'function') throw new Error('loadCombinedModeData requires options.isValidLayoutObject (function)');
  if (!getDefaultLayoutConfig || typeof getDefaultLayoutConfig !== 'function') throw new Error('loadCombinedModeData requires options.getDefaultLayoutConfig (function)');

  log('info', '[Init] loadCombinedModeData started');
  let baseCombinedData = {};
  const dataSources = {}; // To track the origin of each config piece

  // Load from localStorage if allowed
  if (!skipLocalStorageLoad) {
    try {
      const storedData = localStorage.getItem(
        `${LOCAL_STORAGE_MODE_PREFIX}${currentActiveMode}`
      );
      if (storedData) {
        baseCombinedData = JSON.parse(storedData);
        // Record that this data came from localStorage
        Object.keys(baseCombinedData).forEach((key) => {
          if (key !== 'dataSources') {
            dataSources[key] = {
              source: 'localStorage',
              timestamp: new Date().toISOString(),
              details: `Loaded from localStorage key: ${LOCAL_STORAGE_MODE_PREFIX}${currentActiveMode}`,
            };
          }
        });
        logger.info(
          'init',
          `Successfully set baseCombinedData for mode "${currentActiveMode}" from localStorage.`
        );
      } else {
        logger.info(
          'init',
          `No data for mode "${currentActiveMode}" in localStorage. Will load all configs from files.`
        );
      }
    } catch (error) {
      logger.error(
        'init',
        `Error reading or parsing mode data from localStorage for "${currentActiveMode}":`,
        error
      );
      baseCombinedData = {}; // Reset on error
    }
  } else {
    logger.info(
      'init',
      'Skipping localStorage load for mode data as per skipLocalStorageLoad flag.'
    );
  }

  // Ensure modeName is correctly set in baseCombinedData
  baseCombinedData.modeName = currentActiveMode;

  // Handle rules override from URL parameters
  const { rulesOverride, playerId } = await resolveRulesOverride(urlParams, fetchJson, logger);

  // Store playerId for later use by stateManager initialization
  if (playerId !== null) {
    baseCombinedData.playerId = playerId;
    logger.info('init', `Player ID from URL parameter: ${playerId}`);
  }

  // Load config files for the current mode
  const currentModeFileConfigs = modesConfig?.[currentActiveMode];
  const defaultModeFileConfigs = modesConfig?.['default'];

  // Collect all unique config keys from both current mode and default mode
  const allConfigKeys = new Set();
  if (currentModeFileConfigs) {
    Object.keys(currentModeFileConfigs).forEach(key => allConfigKeys.add(key));
  }
  if (defaultModeFileConfigs) {
    Object.keys(defaultModeFileConfigs).forEach(key => allConfigKeys.add(key));
  }

  if (allConfigKeys.size > 0) {
    for (const configKey of allConfigKeys) {
      await loadConfigKey({
        configKey,
        currentModeFileConfigs,
        defaultModeFileConfigs,
        currentActiveMode,
        baseCombinedData,
        dataSources,
        rulesOverride,
        skipLocalStorageLoad,
        fetchJson,
        logger,
      });
    }
  } else {
    logger.warn(
      'init',
      `No file configurations found in modes.json for mode "${currentActiveMode}" or "default".`
    );
  }

  // Special handling for layoutConfig
  let layoutPresets = await handleLayoutConfig({
    baseCombinedData,
    dataSources,
    isValidLayoutObject,
    getDefaultLayoutConfig,
    logger,
  });

  // Prepare module_configs for StateManager
  prepareStateManagerConfig(baseCombinedData, dataSources, log);

  // Add the dataSources to the combined data
  baseCombinedData.dataSources = dataSources;

  logger.debug(
    'init',
    'Final combined mode data after potential merging:',
    JSON.parse(JSON.stringify(baseCombinedData))
  );

  return { combinedModeData: baseCombinedData, layoutPresets };
}

/**
 * Resolves rules override from URL parameters
 * @returns {Object} Object with rulesOverride and playerId properties
 */
async function resolveRulesOverride(urlParams, fetchJson, logger) {
  let rulesOverride = urlParams.get('rules');

  // Check for game and seed parameters as an alternative way to specify rules
  const gameParam = urlParams.get('game');
  const seedParam = urlParams.get('seed') || '1'; // Default seed is 1
  const playerParam = urlParams.get('player'); // Player number or name for multiworld

  // If game parameter is provided and no rules parameter, look up the rules file
  if (gameParam && !rulesOverride) {
    try {
      const presetFiles = await fetchJson(
        './presets/preset_files.json',
        'Error loading preset_files.json for game/seed lookup'
      );

      if (presetFiles) {
        const rulesFile = findRulesFileFromGameSeed(presetFiles, gameParam, seedParam, playerParam, logger);
        if (rulesFile) {
          rulesOverride = rulesFile;
          const playerInfo = playerParam ? ` player="${playerParam}"` : '';
          logger.info(
            'init',
            `Rules file determined from game="${gameParam}" seed="${seedParam}"${playerInfo}: ${rulesFile}`
          );
        }
      }
    } catch (error) {
      logger.error(
        'init',
        `Error loading preset_files.json for game/seed lookup:`,
        error
      );
    }
  }

  // Remove './frontend/' prefix if present
  if (rulesOverride && rulesOverride.startsWith('./frontend/')) {
    rulesOverride = './' + rulesOverride.substring('./frontend/'.length);
    logger.info(
      'init',
      `Removed './frontend/' prefix from rules parameter. New path: ${rulesOverride}`
    );
  }

  // Return both rulesOverride and playerId for use by stateManager initialization
  return {
    rulesOverride,
    playerId: playerParam ? parseInt(playerParam, 10) : null
  };
}

/**
 * Finds rules file from preset_files.json based on game and seed
 *
 * For multiworld games (game="multiworld"):
 *   - If playerParam is provided: returns the player-specific rules file (e.g., AP_seed_P1_rules.json)
 *   - If playerParam is not provided: returns the combined multiworld rules file (e.g., AP_seed_rules.json)
 *
 * For single-player games:
 *   - Returns the standard rules file (e.g., AP_seed_rules.json)
 *   - playerParam is ignored for non-multiworld games
 */
function findRulesFileFromGameSeed(presetFiles, gameParam, seedParam, playerParam, logger) {
  let gameEntry = null;
  let gameKey = null;

  // First check if gameParam matches a root key directly
  if (presetFiles[gameParam]) {
    gameEntry = presetFiles[gameParam];
    gameKey = gameParam;
  } else {
    // Search through all entries to find matching name
    for (const [key, entry] of Object.entries(presetFiles)) {
      if (entry.name && entry.name.toLowerCase() === gameParam.toLowerCase()) {
        gameEntry = entry;
        gameKey = key;
        break;
      }
    }
  }

  if (gameEntry && gameEntry.folders) {
    // Find the folder with matching seed number
    for (const [folderName, folderData] of Object.entries(gameEntry.folders)) {
      if (folderData.seed && String(folderData.seed) === String(seedParam)) {
        // Check if this is a multiworld seed (has games array)
        const isMultiworld = folderData.games && Array.isArray(folderData.games) && folderData.games.length > 1;

        if (folderData.files && Array.isArray(folderData.files)) {
          let rulesFileName = null;

          if (isMultiworld && playerParam) {
            // For multiworld with player specified, find player-specific rules file
            // playerParam can be player number (e.g., "1") or player name (e.g., "Player1")
            const playerNumber = parseInt(playerParam);
            const isPlayerNumber = !isNaN(playerNumber) && String(playerNumber) === playerParam;

            if (isPlayerNumber) {
              // Look for _P{number}_rules.json
              rulesFileName = folderData.files.find(file =>
                file.includes(`_P${playerParam}_rules.json`)
              );
            } else {
              // Look for player by name in games array, then find their rules file
              const playerInfo = folderData.games.find(g =>
                g.name && g.name.toLowerCase() === playerParam.toLowerCase()
              );
              if (playerInfo && playerInfo.player) {
                rulesFileName = folderData.files.find(file =>
                  file.includes(`_P${playerInfo.player}_rules.json`)
                );
              }
            }

            if (!rulesFileName) {
              logger.warn(
                'init',
                `No player-specific rules file found for game="${gameParam}" seed="${seedParam}" player="${playerParam}"`
              );
              return null;
            }
          } else {
            // For non-multiworld or multiworld without player specified, find standard rules file
            // Standard rules file ends with _rules.json but doesn't have _P{number}_ in the name
            rulesFileName = folderData.files.find(file =>
              file.endsWith('_rules.json') && !file.includes('_P')
            );
          }

          if (rulesFileName) {
            return `./presets/${gameKey}/${folderName}/${rulesFileName}`;
          }
        }
      }
    }

    const playerInfo = playerParam ? ` player="${playerParam}"` : '';
    logger.warn(
      'init',
      `No rules file found for game="${gameParam}" with seed="${seedParam}"${playerInfo}`
    );
  } else {
    logger.warn(
      'init',
      `Game "${gameParam}" not found in preset_files.json`
    );
  }

  return null;
}

/**
 * Loads a single config key from mode configuration
 */
async function loadConfigKey(params) {
  const {
    configKey,
    currentModeFileConfigs,
    defaultModeFileConfigs,
    currentActiveMode,
    baseCombinedData,
    dataSources,
    rulesOverride,
    skipLocalStorageLoad,
    fetchJson,
    logger,
  } = params;

  // Determine which config entry to use (current mode or fallback to default)
  let configEntry = null;
  let usingFallback = false;

  if (
    currentModeFileConfigs &&
    Object.prototype.hasOwnProperty.call(currentModeFileConfigs, configKey)
  ) {
    configEntry = currentModeFileConfigs[configKey];
  } else if (
    defaultModeFileConfigs &&
    Object.prototype.hasOwnProperty.call(defaultModeFileConfigs, configKey)
  ) {
    configEntry = defaultModeFileConfigs[configKey];
    usingFallback = true;
    logger.info(
      'init',
      `${configKey} not found in mode "${currentActiveMode}", falling back to "default" mode.`
    );
  }

  if (
    configEntry &&
    typeof configEntry === 'object' &&
    (configEntry.path || configEntry.paths) &&
    (typeof configEntry.enabled === 'undefined' || configEntry.enabled)
  ) {
    // Get paths to load (supports both single path and multiple paths)
    let pathsToLoad = getConfigPaths(configEntry);

    // Apply rules URL parameter override if this is rulesConfig
    if (configKey === 'rulesConfig' && rulesOverride) {
      pathsToLoad = [rulesOverride];
      logger.info(
        'init',
        `Rules file path overridden by URL parameter: ${rulesOverride}`
      );
    }

    // Only load from file if not present in baseCombinedData or if needed
    const shouldLoad = (
      skipLocalStorageLoad ||
      !baseCombinedData.hasOwnProperty(configKey) ||
      !baseCombinedData[configKey] ||
      (configKey === 'rulesConfig' && rulesOverride)
    );

    if (shouldLoad) {
      logger.info(
        'init',
        `${configKey} for "${currentActiveMode}" is missing or invalid in baseCombinedData. Attempting to load from files.`
      );

      const fetchedData = await loadConfigFiles(pathsToLoad, configKey, fetchJson, logger);

      if (fetchedData) {
        baseCombinedData[configKey] = fetchedData;
        dataSources[configKey] = createDataSource(
          configKey,
          pathsToLoad,
          rulesOverride,
          usingFallback
        );
        logger.info(
          'init',
          `Loaded ${configKey} for "${currentActiveMode}" from ${pathsToLoad.length} file(s).`
        );
      } else {
        // Try fallback to default mode
        await attemptFallbackLoad({
          configKey,
          defaultModeFileConfigs,
          usingFallback,
          pathsToLoad,
          baseCombinedData,
          dataSources,
          fetchJson,
          logger,
        });
      }
    } else {
      logger.info(
        'init',
        `Using ${configKey} for "${currentActiveMode}" from localStorage.`
      );
    }
  }
}

/**
 * Loads config files (single or multiple with merging)
 */
async function loadConfigFiles(pathsToLoad, configKey, fetchJson, logger) {
  if (pathsToLoad.length > 1) {
    return await loadAndMergeJsonFiles(
      pathsToLoad,
      fetchJson,
      (msg) => logger.info('init', msg)
    );
  } else if (pathsToLoad.length === 1) {
    return await fetchJson(
      pathsToLoad[0],
      `Error loading ${configKey} from file`
    );
  }
  return null;
}

/**
 * Creates a data source tracking object
 */
function createDataSource(configKey, pathsToLoad, rulesOverride, usingFallback) {
  return {
    source: rulesOverride && configKey === 'rulesConfig' ? 'urlOverride' : (usingFallback ? 'fallback' : 'file'),
    timestamp: new Date().toISOString(),
    details: rulesOverride && configKey === 'rulesConfig'
      ? `Loaded from URL parameter override: ${pathsToLoad[0]}`
      : usingFallback
        ? `Loaded from "default" mode (fallback): ${pathsToLoad.join(', ')}`
        : pathsToLoad.length > 1
          ? `Merged from ${pathsToLoad.length} files: ${pathsToLoad.join(', ')}`
          : `Loaded from file: ${pathsToLoad[0]}`,
  };
}

/**
 * Attempts to fallback to default mode if primary load fails
 */
async function attemptFallbackLoad(params) {
  const {
    configKey,
    defaultModeFileConfigs,
    usingFallback,
    pathsToLoad,
    baseCombinedData,
    dataSources,
    fetchJson,
    logger,
  } = params;

  if (!usingFallback && defaultModeFileConfigs && defaultModeFileConfigs[configKey]) {
    logger.error(
      'init',
      `Failed to load ${configKey} from ${pathsToLoad.join(', ')}. Attempting fallback to "default" mode.`
    );

    const defaultConfigEntry = defaultModeFileConfigs[configKey];
    if (
      defaultConfigEntry &&
      typeof defaultConfigEntry === 'object' &&
      (defaultConfigEntry.path || defaultConfigEntry.paths) &&
      (typeof defaultConfigEntry.enabled === 'undefined' || defaultConfigEntry.enabled)
    ) {
      const defaultPathsToLoad = getConfigPaths(defaultConfigEntry);
      const defaultFetchedData = await loadConfigFiles(defaultPathsToLoad, configKey, fetchJson, logger);

      if (defaultFetchedData) {
        baseCombinedData[configKey] = defaultFetchedData;
        dataSources[configKey] = {
          source: 'fallback',
          timestamp: new Date().toISOString(),
          details: `Loaded from "default" mode after primary load failed: ${defaultPathsToLoad.join(', ')}`,
        };
        logger.info(
          'init',
          `Successfully loaded ${configKey} from "default" mode as fallback.`
        );
        return;
      }
    }

    // Both primary and fallback failed
    logger.warn(
      'init',
      `Failed to load ${configKey} from both current mode and default mode. It will be missing.`
    );
    if (!baseCombinedData.hasOwnProperty(configKey)) {
      baseCombinedData[configKey] = null;
      dataSources[configKey] = {
        source: 'error',
        timestamp: new Date().toISOString(),
        details: `Failed to load from both current mode and default mode`,
      };
    }
  } else {
    logger.warn(
      'init',
      `Failed to load ${configKey} from ${pathsToLoad.join(', ')}. ${usingFallback ? 'Already using default mode, no further fallback available.' : 'It will be missing unless defaults are applied later.'}`
    );
    if (!baseCombinedData.hasOwnProperty(configKey)) {
      baseCombinedData[configKey] = null;
      dataSources[configKey] = {
        source: 'error',
        timestamp: new Date().toISOString(),
        details: `Failed to load from file(s): ${pathsToLoad.join(', ')}`,
      };
    }
  }
}

/**
 * Handles layout configuration and prepares layoutPresets
 */
async function handleLayoutConfig(params) {
  const {
    baseCombinedData,
    dataSources,
    isValidLayoutObject,
    getDefaultLayoutConfig,
    logger,
  } = params;

  let layoutPresets = {};

  if (baseCombinedData.layoutConfig) {
    if (isValidLayoutObject(baseCombinedData.layoutConfig)) {
      layoutPresets = baseCombinedData.layoutConfig;
      logger.info(
        'init',
        'layoutPresets populated from combined data (either localStorage or file).'
      );
    } else {
      logger.warn(
        'init',
        'layoutConfig in combined data is not a valid layout object or preset collection.'
      );
      layoutPresets = { default: baseCombinedData.layoutConfig };
    }
  } else {
    logger.warn(
      'init',
      'No layoutConfig found in combined data. GoldenLayout might use hardcoded defaults.'
    );
    layoutPresets = { default: getDefaultLayoutConfig() };
    dataSources.layoutConfig = {
      source: 'default',
      timestamp: new Date().toISOString(),
      details: 'Using hardcoded default layout configuration',
    };
  }

  return layoutPresets;
}

/**
 * Prepares StateManager module config with source name
 */
function prepareStateManagerConfig(baseCombinedData, dataSources, log) {
  if (!baseCombinedData.module_configs) {
    baseCombinedData.module_configs = {};
  }

  // Ensure StateManager gets the correct source name if its rulesConfig is being set
  if (dataSources.rulesConfig) {
    let sourcePath = null;

    // Extract the source path based on how the rules were loaded
    if (dataSources.rulesConfig.source === 'file') {
      const match = dataSources.rulesConfig.details.match(/^Loaded from file: (.+)$/);
      if (match) {
        sourcePath = match[1];
      }
    } else if (dataSources.rulesConfig.source === 'urlOverride') {
      const match = dataSources.rulesConfig.details.match(/^Loaded from URL parameter override: (.+)$/);
      if (match) {
        sourcePath = match[1];
      }
    } else if (dataSources.rulesConfig.source === 'fallback') {
      const match = dataSources.rulesConfig.details.match(/^Loaded from "default" mode \(fallback\): (.+)$/);
      if (match) {
        sourcePath = match[1];
      }
    }

    // Set up StateManager config if we have a valid source path
    if (sourcePath) {
      if (!baseCombinedData.module_configs.stateManager) {
        baseCombinedData.module_configs.stateManager = {
          rulesConfig: baseCombinedData.rulesConfig,
          sourceName: sourcePath,
        };
        // Add playerId if it was provided via URL parameter
        if (baseCombinedData.playerId !== undefined) {
          baseCombinedData.module_configs.stateManager.playerId = baseCombinedData.playerId;
          log(
            'info',
            `[Init] Created stateManager module_config with sourceName: ${sourcePath}, playerId: ${baseCombinedData.playerId} (source: ${dataSources.rulesConfig.source})`
          );
        } else {
          log(
            'info',
            `[Init] Created stateManager module_config with sourceName: ${sourcePath} (source: ${dataSources.rulesConfig.source})`
          );
        }
      } else if (
        baseCombinedData.module_configs.stateManager.rulesConfig &&
        !baseCombinedData.module_configs.stateManager.sourceName &&
        !baseCombinedData.module_configs.stateManager.id
      ) {
        baseCombinedData.module_configs.stateManager.sourceName = sourcePath;
        // Add playerId if it was provided via URL parameter and not already set
        if (baseCombinedData.playerId !== undefined && baseCombinedData.module_configs.stateManager.playerId === undefined) {
          baseCombinedData.module_configs.stateManager.playerId = baseCombinedData.playerId;
          log(
            'info',
            `[Init] Updated stateManager module_config with sourceName: ${sourcePath}, playerId: ${baseCombinedData.playerId} (source: ${dataSources.rulesConfig.source})`
          );
        } else {
          log(
            'info',
            `[Init] Updated stateManager module_config with sourceName: ${sourcePath} (source: ${dataSources.rulesConfig.source})`
          );
        }
      }
    } else {
      log(
        'info',
        `[Init] Could not extract source path from rulesConfig dataSources details: ${dataSources.rulesConfig.details}`
      );
    }
  }
}
