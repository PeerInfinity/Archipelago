// moduleLoader.js - Dynamic module loading and registration
// Extracted from init.js lines 1268-1338

import { profiler } from '../../modules/shared/profiler.js';

/**
 * Loads and registers all modules defined in the module configuration
 * Uses parallel loading for all modules simultaneously for best performance.
 *
 * ⚠️ CRITICAL: This function modifies the provided Maps (runtimeModuleStates, importedModules, moduleInfoMap).
 * These Maps are passed by reference and will be populated during execution.
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.modulesData - Module configuration data from module-configs/modules.json
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

  // Mark disabled modules
  for (const moduleId of modulesData.loadPriority) {
    const moduleDefinition = modulesData.moduleDefinitions[moduleId];
    if (moduleDefinition && !moduleDefinition.enabled) {
      logger.debug(
        'init',
        `Module ${moduleId} is defined but not enabled. Skipping.`
      );
      runtimeModuleStates.set(moduleId, { initialized: false, enabled: false });
    } else if (!moduleDefinition) {
      logger.warn(
        'init',
        `Module ${moduleId} listed in loadPriority but not found in moduleDefinitions. Skipping.`
      );
    }
  }

  logger.info('init', 'Starting module import and registration phase...');
  logger.info('INIT_STEP', 'Module import and registration phase started');

  profiler.start('moduleImportPhase');

  // Get all enabled modules
  const enabledModules = modulesData.loadPriority.filter(
    moduleId => modulesData.moduleDefinitions[moduleId]?.enabled
  );

  logger.info('init', `Loading ${enabledModules.length} modules in parallel`);

  // Load all modules in parallel
  const loadPromises = enabledModules.map(moduleId => {
    const moduleDefinition = modulesData.moduleDefinitions[moduleId];
    return loadSingleModule({
      moduleId,
      moduleDefinition,
      runtimeModuleStates,
      importedModules,
      moduleInfoMap,
      logger,
      incrementFileCounter,
      createRegistrationApi,
    });
  });

  // Wait for all modules to complete
  await Promise.all(loadPromises);

  profiler.end('moduleImportPhase');

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

  // Start timing for this specific module
  profiler.start(`moduleImport:${moduleId}`);

  try {
    // Check if module is pre-bundled (available via window.__BUNDLED_MODULES__)
    const bundledModules = typeof window !== 'undefined' && window.__BUNDLED_MODULES__;
    let moduleInstance;

    if (bundledModules && bundledModules[moduleId]) {
      // Use pre-bundled module
      moduleInstance = bundledModules[moduleId];
      logger.debug('init', `Using pre-bundled module: ${moduleId}`);
    } else {
      if (bundledModules) {
        // Running in bundled mode but this module is not in the bundle.
        // Its transitive imports (eventBus, settingsManager, etc.) will be loaded
        // as separate file-URL modules, creating different singleton instances from
        // the ones already in the bundle. This breaks event subscriptions and shared
        // state. Add this module to BUNDLED_MODULES in init-bundled.js to fix it.
        logger.warn(
          'init',
          `Module "${moduleId}" is enabled but missing from __BUNDLED_MODULES__. ` +
          `In bundled mode this causes duplicate singleton instances (eventBus, settingsManager, etc.) ` +
          `which breaks event subscriptions. Add it to init-bundled.js.`
        );
      }
      // Dynamically import the module
      // IMPORTANT: Resolve path relative to frontend root, not this file's location
      // Module paths in module-configs/modules.json are like "./modules/foo/index.js"
      // Use window.location.href (page URL) as base so this works in both bundled and
      // unbundled modes. Using import.meta.url breaks in bundled mode because the bundle
      // is at frontend/dist/bundle.js — two levels up lands at the repo root, not frontend/.
      const resolvedPath = new URL(moduleDefinition.path, window.location.href).href;
      moduleInstance = await import(resolvedPath);
      logger.debug('init', `Dynamically imported module: ${moduleId}`);
    }

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

    // End timing for this module (successful load)
    profiler.end(`moduleImport:${moduleId}`);
  } catch (error) {
    // End timing for this module (failed load)
    profiler.end(`moduleImport:${moduleId}`);
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
