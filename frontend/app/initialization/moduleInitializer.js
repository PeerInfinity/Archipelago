// moduleInitializer.js - Module initialization and post-initialization
// Extracted from init.js lines 340-481, 1935-2003

/**
 * Initializes all enabled modules by calling their initialize() method
 *
 * @param {Object} options - Configuration options
 * @param {Array} options.loadPriority - Array of module IDs in initialization order (required)
 * @param {Map} options.importedModules - Map of imported module instances (required)
 * @param {Map} options.runtimeModuleStates - Map of runtime module states (required)
 * @param {Function} options.createInitializationApi - Function to create initialization API (required)
 * @param {Object} options.logger - Logger instance (required)
 * @throws {Error} If required parameters are missing
 * @returns {Promise<void>}
 */
export async function initializeModules(options) {
  // Validate required parameters
  if (!options) {
    throw new Error('initializeModules requires options object');
  }

  const {
    loadPriority,
    importedModules,
    runtimeModuleStates,
    createInitializationApi,
    logger,
  } = options;

  if (!loadPriority || !Array.isArray(loadPriority)) {
    throw new Error('initializeModules requires options.loadPriority (array)');
  }
  if (!importedModules || !(importedModules instanceof Map)) {
    throw new Error('initializeModules requires options.importedModules (Map)');
  }
  if (!runtimeModuleStates || !(runtimeModuleStates instanceof Map)) {
    throw new Error('initializeModules requires options.runtimeModuleStates (Map)');
  }
  if (!createInitializationApi || typeof createInitializationApi !== 'function') {
    throw new Error('initializeModules requires options.createInitializationApi (function)');
  }
  if (!logger) {
    throw new Error('initializeModules requires options.logger');
  }

  // Filter to only enabled modules
  const enabledModules = loadPriority.filter(
    (moduleId) => runtimeModuleStates.get(moduleId)?.enabled
  );

  logger.info(
    'init',
    `Starting initialization of ${enabledModules.length} modules...`
  );
  logger.info(
    'INIT_STEP',
    `Module initialization phase started (${enabledModules.length} modules)`
  );

  // Initialize modules in priority order
  for (const moduleId of loadPriority) {
    if (runtimeModuleStates.get(moduleId)?.enabled) {
      await initializeSingleModule({
        moduleId,
        index: loadPriority.indexOf(moduleId),
        importedModules,
        runtimeModuleStates,
        createInitializationApi,
        logger,
      });
    }
  }

  logger.info(
    'init',
    `Completed initialization of ${enabledModules.length} modules.`
  );
  logger.info(
    'INIT_STEP',
    `Module initialization phase completed (${enabledModules.length} modules)`
  );
}

/**
 * Post-initializes all enabled modules by calling their postInitialize() method
 *
 * Post-initialization happens after all modules are initialized and allows modules
 * to perform setup that depends on other modules being ready.
 *
 * @param {Object} options - Configuration options
 * @param {Array} options.loadPriority - Array of module IDs in initialization order (required)
 * @param {Map} options.importedModules - Map of imported module instances (required)
 * @param {Map} options.runtimeModuleStates - Map of runtime module states (required)
 * @param {Function} options.createInitializationApi - Function to create initialization API (required)
 * @param {Object} options.combinedModeData - Combined mode data (G_combinedModeData) (required)
 * @param {Object} options.logger - Logger instance (required)
 * @param {Function} options.log - Log function for console output (required)
 * @throws {Error} If required parameters are missing
 * @returns {Promise<void>}
 */
export async function postInitializeModules(options) {
  // Validate required parameters
  if (!options) {
    throw new Error('postInitializeModules requires options object');
  }

  const {
    loadPriority,
    importedModules,
    runtimeModuleStates,
    createInitializationApi,
    combinedModeData,
    logger,
    log,
  } = options;

  if (!loadPriority || !Array.isArray(loadPriority)) {
    throw new Error('postInitializeModules requires options.loadPriority (array)');
  }
  if (!importedModules || !(importedModules instanceof Map)) {
    throw new Error('postInitializeModules requires options.importedModules (Map)');
  }
  if (!runtimeModuleStates || !(runtimeModuleStates instanceof Map)) {
    throw new Error('postInitializeModules requires options.runtimeModuleStates (Map)');
  }
  if (!createInitializationApi || typeof createInitializationApi !== 'function') {
    throw new Error('postInitializeModules requires options.createInitializationApi (function)');
  }
  if (!combinedModeData) {
    throw new Error('postInitializeModules requires options.combinedModeData');
  }
  if (!logger) {
    throw new Error('postInitializeModules requires options.logger');
  }
  if (!log || typeof log !== 'function') {
    throw new Error('postInitializeModules requires options.log (function)');
  }

  // Filter to modules that have postInitialize function
  const modulesWithPostInit = loadPriority.filter((moduleId) => {
    const moduleState = runtimeModuleStates.get(moduleId);
    if (!moduleState?.enabled) return false;

    const moduleInstance = importedModules.get(moduleId);
    return moduleInstance && typeof moduleInstance.postInitialize === 'function';
  });

  logger.info(
    'init',
    `Starting post-initialization of ${modulesWithPostInit.length} modules...`
  );
  logger.info(
    'INIT_STEP',
    `Module post-initialization phase started (${modulesWithPostInit.length} modules)`
  );

  // Post-initialize modules in priority order
  for (const moduleId of loadPriority) {
    if (runtimeModuleStates.get(moduleId)?.enabled) {
      await postInitializeSingleModule({
        moduleId,
        importedModules,
        runtimeModuleStates,
        createInitializationApi,
        combinedModeData,
        logger,
        log,
      });
    }
  }

  logger.info(
    'init',
    `Completed post-initialization of ${modulesWithPostInit.length} modules.`
  );
  logger.info(
    'INIT_STEP',
    `Module post-initialization phase completed (${modulesWithPostInit.length} modules)`
  );
}

/**
 * Initializes a single module
 *
 * This function is used both during initial app load and when dynamically
 * enabling modules via the module manager API.
 *
 * @param {Object} options - Configuration options
 * @param {string} options.moduleId - ID of the module to initialize
 * @param {number} options.index - Load priority index
 * @param {Map} options.importedModules - Map of imported modules
 * @param {Map} options.runtimeModuleStates - Map of runtime module states
 * @param {Function} options.createInitializationApi - Function to create initialization API
 * @param {Object} options.logger - Logger instance
 * @returns {Promise<void>}
 */
export async function initializeSingleModule(options) {
  const {
    moduleId,
    index,
    importedModules,
    runtimeModuleStates,
    createInitializationApi,
    logger,
  } = options;

  const moduleInstance = importedModules.get(moduleId);

  if (moduleInstance && typeof moduleInstance.initialize === 'function') {
    const api = createInitializationApi(moduleId);
    try {
      logger.info(
        'init',
        `Initializing module: ${moduleId} (Priority ${index})`
      );
      logger.info(
        'TASK_LIFECYCLE',
        `Starting initialization of module: ${moduleId}`
      );
      await moduleInstance.initialize(moduleId, index, api);
      runtimeModuleStates.get(moduleId).initialized = true;
      logger.info(
        'TASK_LIFECYCLE',
        `Completed initialization of module: ${moduleId}`
      );
      logger.debug('init', `Initialized module: ${moduleId}`);
    } catch (error) {
      logger.error(
        'init',
        `Error during initialization of module: ${moduleId}`,
        error
      );
      runtimeModuleStates.get(moduleId).enabled = false;
    }
  } else if (moduleInstance) {
    // Module exists but no initialize function
    runtimeModuleStates.get(moduleId).initialized = true;
  }
}

/**
 * Post-initializes a single module with mode-specific configuration
 *
 * This function is used both during initial app load and when dynamically
 * enabling modules via the module manager API.
 *
 * @param {Object} options - Configuration options
 * @param {string} options.moduleId - ID of the module to post-initialize
 * @param {Map} options.importedModules - Map of imported modules
 * @param {Map} options.runtimeModuleStates - Map of runtime module states
 * @param {Function} options.createInitializationApi - Function to create initialization API
 * @param {Object} options.combinedModeData - Combined mode data
 * @param {Object} options.logger - Logger instance
 * @param {Function} options.log - Log function
 * @returns {Promise<void>}
 */
export async function postInitializeSingleModule(options) {
  const {
    moduleId,
    importedModules,
    runtimeModuleStates,
    createInitializationApi,
    combinedModeData,
    logger,
    log,
  } = options;

  const moduleInstance = importedModules.get(moduleId);

  if (moduleInstance && typeof moduleInstance.postInitialize === 'function') {
    const api = createInitializationApi(moduleId);
    const genericModuleSpecificConfig =
      combinedModeData.module_configs?.[moduleId] || {};

    let configForPostInitialize = genericModuleSpecificConfig;

    // Special handling for StateManager
    if (moduleId === 'stateManager') {
      configForPostInitialize = prepareStateManagerConfig(
        genericModuleSpecificConfig,
        combinedModeData,
        log
      );
    }

    try {
      logger.info('init', `Post-initializing module: ${moduleId}`);

      if (moduleId === 'stateManager') {
        log(
          'info',
          '[Init _postInitializeSingleModule] EXACT configForPostInitialize BEING PASSED to stateManager.postInitialize:',
          JSON.parse(JSON.stringify(configForPostInitialize))
        );
      }

      await moduleInstance.postInitialize(api, configForPostInitialize);
    } catch (error) {
      logger.error(
        'init',
        `Error during post-initialization of module: ${moduleId}`,
        error
      );
      runtimeModuleStates.get(moduleId).enabled = false;
    }
  }
}

/**
 * Prepares special configuration for StateManager module
 * @private
 */
function prepareStateManagerConfig(genericModuleSpecificConfig, combinedModeData, log) {
  log(
    'debug',
    '[Init _postInitializeSingleModule] Original genericModuleSpecificConfig FOR stateManager:',
    JSON.parse(JSON.stringify(genericModuleSpecificConfig))
  );

  const smConfig = {};

  if (combinedModeData && combinedModeData.rulesConfig) {
    smConfig.rulesConfig = combinedModeData.rulesConfig;

    if (
      combinedModeData.dataSources &&
      combinedModeData.dataSources.rulesConfig &&
      (combinedModeData.dataSources.rulesConfig.source === 'file' ||
       combinedModeData.dataSources.rulesConfig.source === 'urlOverride' ||
       combinedModeData.dataSources.rulesConfig.source === 'fallback') &&
      typeof combinedModeData.dataSources.rulesConfig.details === 'string'
    ) {
      let pathPrefix;
      if (combinedModeData.dataSources.rulesConfig.source === 'file') {
        pathPrefix = 'Loaded from file: ';
      } else if (combinedModeData.dataSources.rulesConfig.source === 'urlOverride') {
        pathPrefix = 'Loaded from URL parameter override: ';
      } else if (combinedModeData.dataSources.rulesConfig.source === 'fallback') {
        pathPrefix = 'Loaded from "default" mode (fallback): ';
      }

      if (combinedModeData.dataSources.rulesConfig.details.startsWith(pathPrefix)) {
        smConfig.sourceName =
          combinedModeData.dataSources.rulesConfig.details.substring(
            pathPrefix.length
          );
        log(
          'info',
          `[Init _postInitializeSingleModule] Derived sourceName for StateManager: ${smConfig.sourceName} (source: ${combinedModeData.dataSources.rulesConfig.source})`
        );
      } else {
        log(
          'warn',
          '[Init _postInitializeSingleModule] Could not derive sourceName for StateManager from dataSources.rulesConfig.details:',
          combinedModeData.dataSources.rulesConfig.details
        );
      }
    } else {
      // Check if data was loaded from localStorage - this is expected behavior
      const isFromLocalStorage = combinedModeData.dataSources?.rulesConfig?.source === 'localStorage';
      log(
        isFromLocalStorage ? 'info' : 'warn',
        '[Init _postInitializeSingleModule] dataSources.rulesConfig not found or not in expected format for StateManager sourceName.' +
        (isFromLocalStorage ? ' (Data loaded from localStorage)' : '')
      );
    }
  } else {
    log(
      'warn',
      '[Init _postInitializeSingleModule] combinedModeData.rulesConfig not found for StateManager.'
    );
  }

  // If smConfig was populated with rulesConfig, use it
  if (smConfig.rulesConfig) {
    return smConfig;
  } else {
    log(
      'warn',
      '[Init _postInitializeSingleModule] StateManager will receive potentially empty config as rulesConfig was not found in combinedModeData.'
    );
    return genericModuleSpecificConfig;
  }
}
