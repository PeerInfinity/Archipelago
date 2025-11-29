// moduleLoader.js - Dynamic module loading and registration
// Extracted from init.js lines 1268-1338

/**
 * Loads and registers all modules defined in the module configuration
 *
 * ⚠️ CRITICAL: This function modifies the provided Maps (runtimeModuleStates, importedModules, moduleInfoMap).
 * These Maps are passed by reference and will be populated during execution.
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.modulesData - Module configuration data from modules.json
 * @param {Array} options.modulesData.loadPriority - Array of module IDs in load order
 * @param {Object} options.modulesData.moduleDefinitions - Object mapping module IDs to definitions
 * @param {Map} options.runtimeModuleStates - Map to store runtime module states (will be populated)
 * @param {Map} options.importedModules - Map to store imported module instances (will be populated)
 * @param {Map} options.moduleInfoMap - Map to store module metadata (will be populated)
 * @param {Object} options.logger - Logger instance (required)
 * @param {Function} options.incrementFileCounter - Function to increment file loading counter
 * @param {Function} options.createRegistrationApi - Function to create registration API for modules
 *   This should be a wrapper function with signature: (moduleId, moduleInstance) => registrationApi
 *   The orchestrator should bind dependencies (centralRegistry, moduleInfoMap, logger) before passing.
 * @throws {Error} If required parameters are missing
 * @returns {Promise<void>}
 */
export async function loadModules(options) {
  // Validate required parameters
  if (!options) {
    throw new Error('loadModules requires options object');
  }

  const {
    modulesData,
    runtimeModuleStates,
    importedModules,
    moduleInfoMap,
    logger,
    incrementFileCounter,
    createRegistrationApi,
  } = options;

  // Validate critical parameters
  if (!modulesData) {
    throw new Error('loadModules requires options.modulesData');
  }
  if (!modulesData.loadPriority || !Array.isArray(modulesData.loadPriority)) {
    throw new Error('loadModules requires options.modulesData.loadPriority (array)');
  }
  if (!modulesData.moduleDefinitions || typeof modulesData.moduleDefinitions !== 'object') {
    throw new Error('loadModules requires options.modulesData.moduleDefinitions (object)');
  }
  if (!runtimeModuleStates || !(runtimeModuleStates instanceof Map)) {
    throw new Error('loadModules requires options.runtimeModuleStates (Map)');
  }
  if (!importedModules || !(importedModules instanceof Map)) {
    throw new Error('loadModules requires options.importedModules (Map)');
  }
  if (!moduleInfoMap || !(moduleInfoMap instanceof Map)) {
    throw new Error('loadModules requires options.moduleInfoMap (Map)');
  }
  if (!logger) {
    throw new Error('loadModules requires options.logger');
  }
  if (!incrementFileCounter || typeof incrementFileCounter !== 'function') {
    throw new Error('loadModules requires options.incrementFileCounter (function)');
  }
  if (!createRegistrationApi || typeof createRegistrationApi !== 'function') {
    throw new Error('loadModules requires options.createRegistrationApi (function)');
  }

  // Clear existing maps
  runtimeModuleStates.clear();
  importedModules.clear();

  logger.info('init', 'Starting module import and registration phase...');
  logger.info('INIT_STEP', 'Module import and registration phase started');

  // Iterate through modules in priority order
  for (const moduleId of modulesData.loadPriority) {
    const moduleDefinition = modulesData.moduleDefinitions[moduleId];

    if (moduleDefinition && moduleDefinition.enabled) {
      await loadSingleModule({
        moduleId,
        moduleDefinition,
        runtimeModuleStates,
        importedModules,
        moduleInfoMap,
        logger,
        incrementFileCounter,
        createRegistrationApi,
      });
    } else if (moduleDefinition && !moduleDefinition.enabled) {
      logger.debug(
        'init',
        `Module ${moduleId} is defined but not enabled. Skipping.`
      );
      runtimeModuleStates.set(moduleId, { initialized: false, enabled: false });
    } else {
      logger.warn(
        'init',
        `Module ${moduleId} listed in loadPriority but not found in moduleDefinitions. Skipping.`
      );
    }
  }

  logger.info('init', 'Module import and registration phase complete.');
  logger.info('INIT_STEP', 'Module import and registration phase completed');
}

/**
 * Loads a single module - imports it and calls its register function
 *
 * @private
 */
async function loadSingleModule(options) {
  const {
    moduleId,
    moduleDefinition,
    runtimeModuleStates,
    importedModules,
    moduleInfoMap,
    logger,
    incrementFileCounter,
    createRegistrationApi,
  } = options;

  logger.debug(
    'init',
    `Processing module: ${moduleId} from ${moduleDefinition.path}`
  );

  // Mark as enabled but not yet initialized
  runtimeModuleStates.set(moduleId, { initialized: false, enabled: true });

  try {
    // Dynamically import the module
    // IMPORTANT: Resolve path relative to frontend root, not this file's location
    // Module paths in modules.json are like "./modules/foo/index.js"
    // From this file's location (app/initialization/), we need to go up to frontend root
    const resolvedPath = new URL(moduleDefinition.path, new URL('../../', import.meta.url)).href;
    const moduleInstance = await import(resolvedPath);
    const moduleFileName = moduleDefinition.path.split('/').pop() || moduleDefinition.path;
    incrementFileCounter(`${moduleId} (${moduleFileName})`);

    // Get the actual module object (handle default exports)
    const actualModuleObject = moduleInstance.default || moduleInstance;
    importedModules.set(moduleId, actualModuleObject);

    // Store moduleInfo separately if it exists
    if (actualModuleObject?.moduleInfo) {
      moduleInfoMap.set(moduleId, actualModuleObject.moduleInfo);
      logger.debug('init', `Stored moduleInfo for ${moduleId}`, actualModuleObject.moduleInfo);
    }

    logger.debug('init', `Dynamically imported module: ${moduleId}`);

    // Call the module's register function if it exists
    if (actualModuleObject && typeof actualModuleObject.register === 'function') {
      // Note: createRegistrationApi is passed from the orchestrator and already has
      // all necessary dependencies (centralRegistry, moduleInfoMap, logger) bound to it
      const registrationApi = createRegistrationApi(
        moduleId,
        actualModuleObject
      );
      logger.debug('init', `Registering module: ${moduleId}`);
      await actualModuleObject.register(registrationApi);
    } else {
      logger.debug(
        'init',
        `Module ${moduleId} does not have a register function.`
      );
    }
  } catch (error) {
    logger.error(
      'init',
      `Error importing or registering module ${moduleId}:`,
      error
    );
    // Disable the module on error
    if (runtimeModuleStates.has(moduleId)) {
      runtimeModuleStates.get(moduleId).enabled = false;
    }
  }
}
