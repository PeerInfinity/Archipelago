// index.js - Main initialization orchestrator
// Orchestrates the entire application initialization flow
// Extracted and refactored from init.js main() function (lines 1148-2610)

import { profiler } from '../../modules/shared/profiler.js';
import { resolveIframeUrl } from '../config/knownIframePages.js';
import { resolveMetaGamePath } from '../config/knownMetaGames.js';

// Delay (ms) between panel activation and iframe/metagame loading
const IFRAME_LOAD_DELAY_MS = 500;

// Import mode management
import { determineActiveMode } from '../mode/modeManager.js';
import { loadModesConfiguration } from '../mode/modeConfigResolver.js';
import { loadCombinedModeData } from '../mode/modeDataLoader.js';

// Import module lifecycle
import { loadModules } from './moduleLoader.js';
import {
  initializeModules,
  postInitializeModules,
  initializeSingleModule,
  postInitializeSingleModule,
} from './moduleInitializer.js';

// Import layout management
import { initializeLayoutManager } from './layoutManager.js';

// Import API factories
import {
  createInitializationApi as createInitializationApiRaw,
  createRegistrationApi as createRegistrationApiRaw,
} from './apiFactory.js';

// Import utilities
import { incrementFileCounter, hideLoadingScreen } from './fileLoadingUI.js';
import { isValidLayoutObject } from '../layout/layoutLoader.js';
import { filterLayoutContent } from '../layout/layoutFilter.js';
import { getDefaultLayoutConfig } from '../layout/layoutLoader.js';

/**
 * Main application initialization function
 *
 * This orchestrates the entire initialization sequence:
 * 1. Wait for DOM ready
 * 2. Determine active mode
 * 3. Load mode configuration
 * 4. Load combined mode data
 * 5. Initialize settings manager
 * 6. Load and register modules
 * 7. Initialize layout manager
 * 8. Initialize event dispatcher
 * 9. Initialize and post-initialize modules
 * 10. Create module manager API
 * 11. Publish initialization events
 * 12. Set up global references
 *
 * @param {Object} dependencies - Core dependencies (globals from main init.js)
 * @param {Object} dependencies.logger - Logger instance
 * @param {Object} dependencies.eventBus - Event bus instance
 * @param {Object} dependencies.settingsManager - Settings manager instance
 * @param {Object} dependencies.centralRegistry - Central registry instance
 * @param {Function} dependencies.EventDispatcher - Event dispatcher constructor
 * @param {Object} dependencies.panelManagerInstance - Panel manager instance
 * @param {Object} dependencies.mobileLayoutManager - Mobile layout manager instance
 * @param {Object} dependencies.GoldenLayout - Golden Layout constructor
 * @param {Function} dependencies.fetchJson - JSON fetching function
 * @param {Function} dependencies.log - Console log function
 * @throws {Error} If initialization fails
 * @returns {Promise<void>}
 */
export async function initializeApplication(dependencies) {
  const {
    logger,
    eventBus,
    settingsManager,
    centralRegistry,
    EventDispatcher,
    panelManagerInstance,
    mobileLayoutManager,
    GoldenLayout,
    fetchJson,
    log,
  } = dependencies;

  logger.info('init', 'Starting main initialization...');

  // Get URL parameters early
  const urlParams = new URLSearchParams(window.location.search);

  // --- Wait for DOM Ready ---
  if (document.readyState === 'loading') {
    logger.info('init', 'Document is loading, deferring main execution.');
    return new Promise((resolve) => {
      document.addEventListener('DOMContentLoaded', async () => {
        await initializeApplication(dependencies);
        resolve();
      });
    });
  }
  logger.info('init', 'DOM content fully loaded and parsed.');

  // --- Phase 1: Mode Determination ---
  profiler.start('phase1:modeDetermination');
  const { currentActiveMode, skipLocalStorageLoad } = await determineActiveMode(logger);
  profiler.end('phase1:modeDetermination');
  logger.info(
    'init',
    `Effective active mode for this session: "${currentActiveMode}"`
  );
  logger.debug(
    'init',
    `Skip localStorage load for mode data: ${skipLocalStorageLoad}`
  );

  // --- Phase 2: Load Modes Configuration ---
  profiler.start('phase2:loadModesConfig');
  const modesConfig = await loadModesConfiguration(fetchJson, logger);
  profiler.end('phase2:loadModesConfig');

  // Check if the current active mode exists in modes.json.
  // If not, file-based configs will automatically fall back to the "default" mode entry
  // in modeDataLoader.js, but localStorage data for the requested mode is still loaded.
  const validatedMode = currentActiveMode;
  if (!modesConfig[currentActiveMode]) {
    logger.info(
      'init',
      `Mode "${currentActiveMode}" not found in modes.json. File configs will use "default" mode as fallback; localStorage data for "${currentActiveMode}" will still be loaded.`
    );
  }

  // --- Phase 3: Load Combined Mode Data ---
  profiler.start('phase3:loadCombinedModeData');
  const { combinedModeData, layoutPresets } = await loadCombinedModeData({
    urlParams,
    modesConfig,
    currentActiveMode: validatedMode,
    skipLocalStorageLoad,
    fetchJson,
    log,
    logger,
    isValidLayoutObject,
    getDefaultLayoutConfig: () => getDefaultLayoutConfig(logger),
  });
  profiler.end('phase3:loadCombinedModeData');

  // --- Phase 4: Initialize Settings Manager ---
  profiler.start('phase4:settingsManager');
  if (combinedModeData.userSettings) {
    logger.debug(
      'init',
      'combinedModeData.userSettings BEFORE calling setInitialSettings:',
      JSON.parse(JSON.stringify(combinedModeData.userSettings))
    );
    if (typeof settingsManager.setInitialSettings === 'function') {
      settingsManager.setInitialSettings(combinedModeData.userSettings);
      logger.info(
        'init',
        'Passed mode-specific settings to settingsManager via setInitialSettings.'
      );
    } else {
      logger.warn(
        'init',
        'settingsManager.setInitialSettings not found.'
      );
    }
  }
  await settingsManager.ensureLoaded();

  // Reconfigure logger with full settings
  try {
    const allSettings = await settingsManager.getSettings();
    logger.configure(allSettings);
    logger.info('init', 'Logger reconfigured with full settings');
    logger.info('init', 'settingsManager initialization process completed.');
  } catch (error) {
    log('error', '[Init] Error reconfiguring logger:', error);
  }
  profiler.end('phase4:settingsManager');

  // --- Phase 5: Load and Register Modules ---
  profiler.start('phase5:loadModules');
  const modulesData = combinedModeData.moduleConfig;
  if (
    !modulesData ||
    !modulesData.moduleDefinitions ||
    !modulesData.loadPriority
  ) {
    logger.error(
      'init',
      'CRITICAL: Module configuration is missing, malformed, or incomplete.',
      modulesData
    );
    throw new Error('Module configuration is invalid');
  }

  logger.debug(
    'init',
    'Using module configuration from combined mode data.',
    modulesData
  );

  // Create maps for module tracking
  const runtimeModuleStates = new Map();
  const importedModules = new Map();
  const moduleInfoMap = new Map();

  // CRITICAL: Declare moduleManagerApi as empty object FIRST
  // This will be populated later but needs to exist for forward references
  let moduleManagerApi = {};

  // Create API factory wrappers with dependencies bound
  const createInitializationApiWrapper = (moduleId) => {
    // Module manager API will be populated later
    return createInitializationApiRaw(moduleId, {
      settingsManager,
      dispatcher: null, // Will be set after dispatcher is created
      centralRegistry,
      eventBus,
      logger,
      moduleManagerApi, // Forward reference (object exists but empty initially)
    });
  };

  const createRegistrationApiWrapper = (moduleId, moduleInstance) => {
    return createRegistrationApiRaw(moduleId, moduleInstance, {
      centralRegistry,
      moduleInfoMap,
      logger,
    });
  };

  // Load modules
  await loadModules({
    modulesData,
    runtimeModuleStates,
    importedModules,
    moduleInfoMap,
    logger,
    incrementFileCounter: (fileName) => incrementFileCounter(fileName, logger),
    createRegistrationApi: createRegistrationApiWrapper,
  });
  profiler.end('phase5:loadModules');

  // --- Phase 6: Apply Data to Registered Modules ---
  profiler.start('phase6:applyDataToModules');
  if (combinedModeData) {
    const jsonDataHandlers = centralRegistry.getAllJsonDataHandlers();
    logger.debug(
      'init',
      `Found ${jsonDataHandlers.size} JSON data handlers for data application.`
    );
    for (const [dataKey, handler] of jsonDataHandlers) {
      if (combinedModeData.hasOwnProperty(dataKey)) {
        if (typeof handler.applyLoadedDataFunction === 'function') {
          logger.debug(
            'init',
            `Applying data for key: ${dataKey} to its module.`
          );
          try {
            handler.applyLoadedDataFunction(combinedModeData[dataKey]);
          } catch (e) {
            logger.error('init', `Error applying data for ${dataKey}:`, e);
          }
        }
      }
    }

    eventBus.publish('app:fullModeDataLoadedFromStorage', {
      modeData: combinedModeData,
    }, 'core');
    logger.debug(
      'init',
      'Published app:fullModeDataLoadedFromStorage with combinedModeData.'
    );
  }
  profiler.end('phase6:applyDataToModules');

  // --- Phase 7: Initialize Layout Manager ---
  profiler.start('phase7:layoutManager');
  const {
    layoutManagerInstance,
    goldenLayoutInstance,
    usesMobileLayout,
  } = await initializeLayoutManager({
    GoldenLayout,
    mobileLayoutManager,
    centralRegistry,
    panelManagerInstance,
    settingsManager,
    combinedModeData,
    layoutPresets,
    runtimeModuleStates,
    moduleInfoMap,
    importedModules,
    filterLayoutContent,
    hideLoadingScreen: () => hideLoadingScreen(logger),
    getDefaultLayoutConfig: () => getDefaultLayoutConfig(logger),
    logger,
    log,
  });
  profiler.end('phase7:layoutManager');

  // --- Phase 8: Initialize Event Dispatcher ---
  profiler.start('phase8:eventDispatcher');
  logger.info('init', 'Initializing Event Dispatcher...');
  const getHandlersFunc = () => centralRegistry.getAllDispatcherHandlers();
  const getLoadPriorityFunc = () => modulesData?.loadPriority || [];
  const isModuleEnabledFunc = (moduleId) => {
    const moduleState = runtimeModuleStates.get(moduleId);
    return moduleState ? moduleState.enabled !== false : true;
  };

  let dispatcher;
  try {
    dispatcher = new EventDispatcher(
      getHandlersFunc,
      getLoadPriorityFunc,
      isModuleEnabledFunc
    );
    window.eventDispatcher = dispatcher;
    logger.info('init', 'Event Dispatcher initialized successfully.');
  } catch (error) {
    logger.error(
      'init',
      'CRITICAL: Failed to initialize Event Dispatcher!',
      error
    );
    throw error;
  }

  // Update the initialization API wrapper to include dispatcher
  const createInitializationApiWithDispatcher = (moduleId) => {
    return createInitializationApiRaw(moduleId, {
      settingsManager,
      dispatcher,
      centralRegistry,
      eventBus,
      logger,
      moduleManagerApi,
    });
  };

  profiler.end('phase8:eventDispatcher');

  // Make combinedModeData globally available
  window.G_combinedModeData = combinedModeData;
  logger.debug('init', 'window.G_combinedModeData has been set.');

  // --- Phase 9: Initialize Modules ---
  profiler.start('phase9:initializeModules');
  await initializeModules({
    loadPriority: modulesData.loadPriority,
    importedModules,
    runtimeModuleStates,
    createInitializationApi: createInitializationApiWithDispatcher,
    logger,
  });
  profiler.end('phase9:initializeModules');

  // --- Phase 10: Post-Initialize Modules ---
  profiler.start('phase10:postInitializeModules');
  await postInitializeModules({
    loadPriority: modulesData.loadPriority,
    importedModules,
    runtimeModuleStates,
    createInitializationApi: createInitializationApiWithDispatcher,
    combinedModeData,
    logger,
    log,
  });
  profiler.end('phase10:postInitializeModules');

  // --- Phase 11: Create Module Manager API ---
  profiler.start('phase11:createModuleManagerApi');
  // CRITICAL: Assign to existing moduleManagerApi object (not const)
  // This populates the object that was forward-referenced during module loading
  Object.assign(moduleManagerApi, createModuleManagerApi({
    runtimeModuleStates,
    importedModules,
    combinedModeData,
    centralRegistry,
    panelManagerInstance,
    eventBus,
    logger,
    dispatcher, // Add dispatcher for consistent access
    log, // Add log function instead of hardcoding console.log
    incrementFileCounter: (fileName) => incrementFileCounter(fileName, logger),
    createRegistrationApi: createRegistrationApiWrapper,
    createInitializationApi: createInitializationApiWithDispatcher,
  }));
  profiler.end('phase11:createModuleManagerApi');

  logger.info('init', 'ModuleManagerAPI populated.');

  // Listen for panels being closed manually
  eventBus.subscribe('ui:panelManuallyClosed', ({ moduleId }) => {
    if (!moduleId) return;
    const moduleState = runtimeModuleStates.get(moduleId);
    if (!moduleState || moduleState.enabled === false) return;

    // Defer all logic to the next event loop tick so GL can finish removing the panel from its
    // tree (including _contentItems.splice). This ensures the multi-instance remaining-count check
    // and destroyPanelByComponentType both see the updated tree state.
    setTimeout(() => {
      // Re-check: a concurrent close of another instance may have already disabled the module.
      if (moduleState.enabled === false) return;

      // For modules that allow multiple instances, only mark as disabled
      // when the last instance is closed (i.e., no more panels of this type remain).
      const moduleInstance = importedModules.get(moduleId);
      if (moduleInstance?.moduleInfo?.allowMultipleInstances) {
        const componentType = centralRegistry.getComponentTypeForModule(moduleId);
        if (componentType && panelManagerInstance?.goldenLayout?.root) {
          const remaining = [];
          function findComponents(item) {
            if (item.isComponent && item.componentType === componentType) {
              remaining.push(item);
            } else if (item.contentItems) {
              item.contentItems.forEach(findComponents);
            }
          }
          findComponents(panelManagerInstance.goldenLayout.root);
          if (remaining.length > 0) {
            logger.debug(
              'init',
              `Panel closed for multi-instance module ${moduleId}, but ${remaining.length} instance(s) remain. Staying enabled.`
            );
            return;
          }
        }
      }

      logger.debug('init', `Panel closed by user for ${moduleId}. Disabling module.`);
      // skipPanelDestroy: panel is already gone, no need to find and remove it.
      moduleManagerApi.disableModule(moduleId, { skipPanelDestroy: true });
    }, 0);
  }, 'core');

  // Listen for external module load requests
  eventBus.subscribe('module:loadExternalRequest', async ({ moduleId, modulePath }) => {
    logger.info('init', `Loading external module: ${moduleId} from ${modulePath}`);

    // Create a temporary module definition so enableModule can find it
    if (!combinedModeData.moduleConfig.moduleDefinitions[moduleId]) {
      combinedModeData.moduleConfig.moduleDefinitions[moduleId] = {
        path: modulePath,
        enabled: true,
        isExternal: true,
      };
      // Add to load priority at the end
      if (!combinedModeData.moduleConfig.loadPriority.includes(moduleId)) {
        combinedModeData.moduleConfig.loadPriority.push(moduleId);
      }
    }

    try {
      await moduleManagerApi.enableModule(moduleId);
      eventBus.publish('module:loaded', { moduleId }, 'core');
    } catch (error) {
      logger.error('init', `Failed to load external module ${moduleId}:`, error);
      eventBus.publish('module:loadFailed', {
        moduleId,
        path: modulePath,
        error: error.message,
      }, 'core');
    }
  }, 'core');

  // --- Phase 12: Publish Initialization Events ---
  if (modesConfig) {
    logger.info('init', 'Publishing app:modesJsonLoaded event.');
    eventBus.publish('app:modesJsonLoaded', { modesConfig }, 'core');
  }

  logger.info('init', 'Publishing app:readyForUiDataLoad event...');
  eventBus.publish('app:readyForUiDataLoad', {
    getModuleManager: () => moduleManagerApi,
  }, 'core');

  // Hide loading screen for mobile layout
  if (usesMobileLayout) {
    hideLoadingScreen(logger);
  }

  // Dispatch initial timer rehoming event
  setTimeout(() => {
    if (dispatcher) {
      logger.debug('init', 'Dispatching initial system:rehomeTimerUI event.');
      dispatcher.publish(
        'core',
        'system:rehomeTimerUI',
        {},
        { initialTarget: 'top' }
      );
    }
  }, 0);

  // --- Phase 13: Set Global References ---
  window.G_currentActiveMode = validatedMode;
  window.G_modesConfig = modesConfig;
  window.settingsManager = settingsManager;
  window.eventBus = eventBus;
  window.panelManager = panelManagerInstance;
  window.goldenLayoutInstance = goldenLayoutInstance;
  window.moduleManagerApi = moduleManagerApi;

  logger.info('init', 'Modular application initialization complete.');

  // Fallback to hide loading screen
  setTimeout(() => {
    hideLoadingScreen(logger);
  }, 500);

  // Publish active mode determined
  logger.info(
    'init',
    `Publishing app:activeModeDetermined with mode: ${validatedMode}`
  );
  eventBus.publish('app:activeModeDetermined', {
    activeMode: validatedMode,
  }, 'core');

  // Handle panel URL parameter (comma-separated to activate one panel per stack)
  // Uses event bus so both desktop PanelManager and MobileLayoutManager can respond
  const panelParam = urlParams.get('focusPanel');
  const iframeParam = urlParams.get('iframe');
  const metagameParam = urlParams.get('metagame');
  const useWindowParam = urlParams.get('useWindow');
  // ?movePanel=componentType:stackId,... — move panels to specific stacks before activating
  const moveParam = urlParams.get('movePanel');

  // Support iframeAutoLoad from mode settings (e.g., settings-jta.json)
  let effectiveIframeParam = iframeParam;
  if (!effectiveIframeParam) {
    try {
      const allSettings = await settingsManager.getSettings();
      if (allSettings.iframeAutoLoad) {
        effectiveIframeParam = allSettings.iframeAutoLoad;
        logger.info('init', `iframeAutoLoad from settings: "${effectiveIframeParam}"`);
      }
    } catch (e) {
      logger.warn('init', 'Error reading iframeAutoLoad setting:', e);
    }
  }

  if (moveParam) {
    eventBus.registerPublisher('ui:movePanel', 'core');
  }
  if (effectiveIframeParam) {
    if (useWindowParam) {
      eventBus.registerPublisher('window:loadUrl', 'core');
    } else {
      eventBus.registerPublisher('iframe:loadUrl', 'core');
    }
  }
  if (metagameParam) {
    eventBus.registerPublisher('metaGame:loadFromUrl', 'core');
  }
  if (panelParam || effectiveIframeParam || metagameParam || moveParam) {
    const activatePanelsAndAutoLoad = () => {
      // Handle ?move= parameter first (before panel activation)
      if (moveParam) {
        const movePairs = moveParam.split(',').map(s => s.trim()).filter(Boolean);
        logger.info('init', `Moving panels from URL parameter: ${movePairs.join(', ')}`);

        for (const pair of movePairs) {
          const [componentType, targetStackId] = pair.split(':').map(s => s.trim());
          if (componentType && targetStackId) {
            logger.info('init', `Publishing panel move: ${componentType} -> ${targetStackId}`);
            eventBus.publish('ui:movePanel', { componentType, targetStackId }, 'core');
          } else {
            logger.warn('init', `Invalid move pair (expected "componentType:stackId"): "${pair}"`);
          }
        }
      }

      if (panelParam) {
        const panelIds = panelParam.split(',').map(s => s.trim()).filter(Boolean);
        logger.info('init', `Activating panels from URL parameter: ${panelIds.join(', ')}`);

        for (const panelId of panelIds) {
          logger.info('init', `Publishing panel activation for: ${panelId}`);
          eventBus.publish('ui:activatePanel', { panelId }, 'core');
        }
      }

      // Handle iframe/window auto-load: from ?iframe= URL parameter or iframeAutoLoad setting
      // When ?useWindow=1 is present, redirect to window adapter instead
      if (effectiveIframeParam) {
        const resolvedUrl = resolveIframeUrl(effectiveIframeParam);
        if (resolvedUrl) {
          setTimeout(() => {
            if (useWindowParam) {
              logger.info('init', `Loading in window (useWindow=1): ${effectiveIframeParam} -> ${resolvedUrl}`);
              eventBus.publish('window:loadUrl', { url: resolvedUrl }, 'core');
              // Activate window panel instead of iframe panel
              eventBus.publish('ui:activatePanel', { panelId: 'windowPanel' }, 'core');
            } else {
              logger.info('init', `Loading iframe: ${effectiveIframeParam} -> ${resolvedUrl}`);
              eventBus.publish('iframe:loadUrl', { url: resolvedUrl }, 'core');
            }
          }, IFRAME_LOAD_DELAY_MS);
        } else {
          logger.warn('init', `Could not resolve iframe URL: ${effectiveIframeParam}`);
        }
      }

      // Handle ?metagame= parameter: resolve shortname and load after panels settle
      if (metagameParam) {
        const resolvedPath = resolveMetaGamePath(metagameParam);
        if (resolvedPath) {
          setTimeout(() => {
            logger.info('init', `Loading metagame from URL parameter: ${metagameParam} -> ${resolvedPath}`);
            eventBus.publish('metaGame:loadFromUrl', { path: resolvedPath }, 'core');
          }, IFRAME_LOAD_DELAY_MS);
        } else {
          logger.warn('init', `Could not resolve metagame URL parameter: ${metagameParam}`);
        }
      }
    };

    // Wait for panelManager to be initialized before activating panels
    if (panelManagerInstance.isInitialized) {
      activatePanelsAndAutoLoad();
    } else {
      eventBus.subscribe('panelManager:initialized', () => {
        activatePanelsAndAutoLoad();
      }, 'core');
    }
  }

  // Handle ?loadModule= parameter: load external module(s) by URL
  const loadModuleParams = urlParams.getAll('loadModule');
  if (loadModuleParams.length > 0) {
    eventBus.registerPublisher('module:loadExternalRequest', 'core');
    const loadExternalModules = () => {
      for (const modulePath of loadModuleParams) {
        const trimmed = modulePath.trim();
        if (!trimmed) continue;
        const sanitizedPath = trimmed.replace(/[^a-zA-Z0-9]/g, '_');
        const moduleId = `external_${sanitizedPath}_url`;
        logger.info('init', `Loading external module from URL parameter: ${trimmed}`);
        eventBus.publish('module:loadExternalRequest', { moduleId, modulePath: trimmed }, 'core');
      }
    };

    // Wait for panelManager to be initialized before loading external modules
    if (panelManagerInstance.isInitialized) {
      loadExternalModules();
    } else {
      eventBus.subscribe('panelManager:initialized', () => {
        loadExternalModules();
      }, 'core');
    }
  }

  // Subscribe to files:jsonLoaded event
  eventBus.subscribe('files:jsonLoaded', async (eventData) => {
    logger.info(
      'init',
      'files:jsonLoaded event RECEIVED.',
      JSON.parse(JSON.stringify(eventData))
    );
    if (
      eventData &&
      eventData.jsonData &&
      eventData.selectedPlayerId !== undefined
    ) {
      logger.info(
        'init',
        `files:jsonLoaded: Valid data. Calling stateManager.loadRules.`
      );
      try {
        combinedModeData.rulesConfig = eventData.jsonData;
        logger.info(
          'init',
          'files:jsonLoaded: G_combinedModeData.rulesConfig updated.'
        );

        const playerInfo = eventData.playerInfo || {
          playerName: `Player${eventData.selectedPlayerId}`,
        };

        const { stateManagerProxySingleton } = await import(
          '../../modules/stateManager/index.js'
        );
        incrementFileCounter('stateManager (index.js)', logger);
        await stateManagerProxySingleton.loadRules(
          eventData.jsonData,
          {
            playerId: String(eventData.selectedPlayerId),
            playerName: playerInfo.playerName,
          },
          eventData.sourceName || eventData.filename || eventData.source || 'userLoadedFile'
        );
        logger.info(
          'init',
          'files:jsonLoaded: stateManagerProxySingleton.loadRules call COMPLETED.'
        );
      } catch (error) {
        logger.error('init', 'Error handling files:jsonLoaded event:', error);
      }
    }
  }, 'core');
}

/**
 * Creates the module manager API
 *
 * This API provides functions to dynamically enable/disable modules at runtime.
 * The enable/disable operations handle:
 * - Dynamic module import and registration
 * - Component registration with Golden Layout (desktop) or Mobile Layout Manager
 * - Module initialization and post-initialization
 * - Panel creation and destruction
 * - State synchronization via eventBus
 *
 * @private
 */
function createModuleManagerApi(options) {
  const {
    runtimeModuleStates,
    importedModules,
    combinedModeData,
    centralRegistry,
    panelManagerInstance,
    eventBus,
    logger,
    dispatcher,
    log,
    incrementFileCounter,
    createRegistrationApi,
    createInitializationApi,
  } = options;

  const api = {};

  /**
   * Enables a module that was previously disabled or not loaded
   *
   * This will:
   * 1. Load and register the module if not already loaded
   * 2. Register components with Golden Layout if applicable
   * 3. Initialize and post-initialize the module
   * 4. Create and activate the module's panel
   * 5. Publish state change events
   */
  api.enableModule = async (moduleId) => {
    const state = runtimeModuleStates.get(moduleId);
    const moduleDefinition =
      combinedModeData.moduleConfig?.moduleDefinitions?.[moduleId];

    if (!moduleDefinition) {
      logger.error(
        'init',
        `enableModule: No module definition found for module ${moduleId}. Cannot enable.`
      );
      return;
    }

    if (state && state.enabled) {
      logger.info('init', `Module ${moduleId} is already enabled.`);
      const componentType = centralRegistry.getComponentTypeForModule(moduleId);
      if (componentType && panelManagerInstance) {
        panelManagerInstance.activatePanel(componentType);
      }
      return;
    }

    let actualModuleObject; // Declare here to be accessible later

    // Ensure module is loaded and registered if it wasn't initially
    if (!importedModules.has(moduleId)) {
      logger.info(
        'init',
        `Module ${moduleId} was not previously imported. Importing and registering now.`
      );
      try {
        // IMPORTANT: Resolve path relative to frontend root
        // Module paths in module-configs/modules.json are like "./modules/foo/index.js"
        // Use window.location.href (page URL) as base so this works in both bundled and
        // unbundled modes. Using import.meta.url breaks in bundled mode because the bundle
        // is at frontend/dist/bundle.js — two levels up lands at the repo root, not frontend/.
        const resolvedPath = new URL(moduleDefinition.path, window.location.href).href;
        const moduleInstance = await import(resolvedPath);
        const moduleFileName = moduleDefinition.path.split('/').pop() || moduleDefinition.path;
        incrementFileCounter(`${moduleId} (${moduleFileName})`);
        actualModuleObject = moduleInstance.default || moduleInstance;
        importedModules.set(moduleId, actualModuleObject);
        logger.debug(
          'init',
          `Dynamically imported module for enabling: ${moduleId}`
        );

        if (
          actualModuleObject &&
          typeof actualModuleObject.register === 'function'
        ) {
          const registrationApi = createRegistrationApi(
            moduleId,
            actualModuleObject
          );
          logger.debug(
            'init',
            `Registering dynamically loaded module: ${moduleId}`
          );
          await actualModuleObject.register(registrationApi);
          logger.info('init', `Module ${moduleId} dynamically registered.`);

          // Register components with Golden Layout (desktop only)
          if (window.goldenLayoutInstance) {
            centralRegistry
              .getAllPanelComponents()
              .forEach((factoryDetails, componentType) => {
                if (factoryDetails.moduleId === moduleId) {
                  // Only process components from the current module
                  if (typeof factoryDetails.componentClass === 'function') {
                    window.goldenLayoutInstance.registerComponentFactoryFunction(
                      componentType,
                      (container, componentState) => {
                        logger.debug(
                          'init',
                          `[Dynamic Enable] Creating component ${componentType} for module ${factoryDetails.moduleId}`
                        );
                        try {
                          const uiProvider = new factoryDetails.componentClass(
                            container,
                            componentState,
                            componentType
                          );
                          if (
                            !uiProvider ||
                            typeof uiProvider.getRootElement !== 'function'
                          ) {
                            logger.error(
                              'init',
                              `[Dynamic Enable] UI provider for ${componentType} is invalid.`
                            );
                            throw new Error(
                              'UI provider is invalid or missing getRootElement method.'
                            );
                          }
                          const rootElement = uiProvider.getRootElement();
                          if (
                            !rootElement ||
                            !(rootElement instanceof HTMLElement)
                          ) {
                            logger.error(
                              'init',
                              `[Dynamic Enable] uiProvider.getRootElement() for ${componentType} did not return valid HTMLElement.`
                            );
                            throw new Error(
                              'UI did not return a valid root DOM element.'
                            );
                          }
                          container.element.innerHTML = '';
                          container.element.append(rootElement);
                          if (typeof uiProvider.onMount === 'function') {
                            uiProvider.onMount(container, componentState);
                          }
                        } catch (e) {
                          logger.error(
                            'init',
                            `[Dynamic Enable] Error instantiating component ${componentType}:`,
                            e
                          );
                          container.element.innerHTML = `<div style="color: red; padding: 10px;">Error creating component: ${componentType}. ${e.message}</div>`;
                        }
                      }
                    );
                    logger.info(
                      'init',
                      `[Dynamic Enable] Registered component factory with Golden Layout for: ${componentType} from module ${moduleId}`
                    );
                  } else {
                    logger.error(
                      'init',
                      `[Dynamic Enable] Component factory for ${componentType} from module ${moduleId} is not a function!`
                    );
                  }
                }
              });
          } else {
            logger.debug(
              'init',
              '[Dynamic Enable] window.goldenLayoutInstance not available (likely mobile layout).'
            );
          }
        } else {
          logger.debug(
            'init',
            `Dynamically loaded module ${moduleId} does not have a register function.`
          );
        }
      } catch (error) {
        logger.error(
          'init',
          `Error importing or registering module ${moduleId} during enableModule:`,
          error
        );
        if (state) state.enabled = false;
        runtimeModuleStates.set(moduleId, {
          initialized: false,
          enabled: false,
        });
        eventBus.publish('module:stateChanged', { moduleId, enabled: false }, 'core');
        return;
      }
    } else {
      actualModuleObject = importedModules.get(moduleId);
    }

    if (state) {
      state.enabled = true;
    } else {
      runtimeModuleStates.set(moduleId, { initialized: false, enabled: true });
    }
    logger.info('init', `Enabling module: ${moduleId}`);

    try {
      const loadPriorityArray =
        combinedModeData.moduleConfig?.loadPriority || [];
      let originalIndex = loadPriorityArray.indexOf(moduleId);
      if (originalIndex === -1) {
        // Module might be entirely new (not in original loadPriority)
        const moduleDef =
          combinedModeData.moduleConfig?.moduleDefinitions?.[moduleId];
        if (moduleDef && typeof moduleDef.loadPriority === 'number') {
          originalIndex = moduleDef.loadPriority;
          logger.info(
            'init',
            `Using loadPriority ${originalIndex} from module definition for ${moduleId}.`
          );
        } else {
          logger.warn(
            'init',
            `Could not find original load priority index for ${moduleId}. Using -1.`
          );
          originalIndex = -1;
        }
      }

      logger.debug(
        'init',
        `Calling initializeSingleModule for ${moduleId} with index ${originalIndex}`
      );
      await initializeSingleModule({
        moduleId,
        index: originalIndex,
        importedModules,
        runtimeModuleStates,
        createInitializationApi,
        logger,
      });

      // Call postInitialize if it exists
      if (
        actualModuleObject &&
        typeof actualModuleObject.postInitialize === 'function'
      ) {
        logger.debug('init', `Calling postInitializeSingleModule for ${moduleId}`);
        await postInitializeSingleModule({
          moduleId,
          importedModules,
          runtimeModuleStates,
          createInitializationApi,
          combinedModeData,
          logger,
          log, // Use the log function from options
        });
      }

      const componentType = centralRegistry.getComponentTypeForModule(moduleId);
      const titleFromInfo =
        actualModuleObject?.moduleInfo?.title ||
        actualModuleObject?.moduleInfo?.name;
      const panelTitle = titleFromInfo || moduleId;
      const targetColumn = actualModuleObject?.moduleInfo?.column || null;

      if (componentType && panelManagerInstance) {
        logger.debug(
          'init',
          `Re-adding panel for ${moduleId}. Type: ${componentType}, Title: ${panelTitle}, Column: ${targetColumn}`
        );
        await panelManagerInstance.createPanelForComponent(
          componentType,
          panelTitle,
          targetColumn
        );
        logger.debug(
          'init',
          `Panel for ${moduleId} should have been re-added/focused.`
        );
      } else {
        if (!componentType) {
          logger.warn(
            'init',
            `Cannot re-add panel for ${moduleId}: No componentType found. Module might not have a UI.`
          );
        }
        if (!panelManagerInstance) {
          logger.warn(
            'init',
            `Cannot re-add panel for ${moduleId}: panelManagerInstance not available.`
          );
        }
      }
    } catch (error) {
      logger.error(
        'init',
        `Error during enabling or re-adding panel for ${moduleId}:`,
        error
      );
      // Revert enabled state on error
      const currentState = runtimeModuleStates.get(moduleId);
      if (currentState) currentState.enabled = false;
      eventBus.publish('module:stateChanged', { moduleId, enabled: false }, 'core');
      return;
    }

    eventBus.publish('module:stateChanged', { moduleId, enabled: true }, 'core');

    // Dispatch rehome event after enabling (if dispatcher is available)
    if (dispatcher) {
      logger.debug(
        'init',
        `Module ${moduleId} enabled, dispatching system:rehomeTimerUI.`
      );
      setTimeout(() => {
        dispatcher.publish(
          'core',
          'system:rehomeTimerUI',
          {},
          { initialTarget: 'top' }
        );
      }, 0);
    }
  };

  /**
   * Disables a module that is currently enabled
   *
   * This will:
   * 1. Set the module state to disabled
   * 2. Close/destroy the module's panel
   * 3. Publish state change events
   * 4. Dispatch rehome events
   *
   * Note: Does NOT uninitialize the module or remove it from memory
   */
  api.disableModule = async (moduleId, { skipPanelDestroy = false } = {}) => {
    logger.info('init', `Attempted to disable ${moduleId}`);
    const moduleState = runtimeModuleStates.get(moduleId);
    if (moduleState) {
      moduleState.enabled = false;
      eventBus.publish('module:stateChanged', {
        moduleId,
        enabled: false,
      }, 'core');

      // Get componentType from centralRegistry
      const componentType = centralRegistry.getComponentTypeForModule(moduleId);
      const moduleInstance = importedModules.get(moduleId);
      const allowsMultiple = moduleInstance?.moduleInfo?.allowMultipleInstances;
      let panelActionTaken = false;
      if (skipPanelDestroy) {
        // Panel already closed by the user — no need to destroy it programmatically.
      } else if (componentType) {
        logger.debug(
          'init',
          `Closing panel(s) for disabled module ${moduleId} (Component Type: ${componentType}, multiple: ${!!allowsMultiple})`
        );

        if (
          panelManagerInstance &&
          typeof panelManagerInstance.destroyPanelByComponentType === 'function'
        ) {
          if (allowsMultiple && typeof panelManagerInstance.destroyAllPanelsByComponentType === 'function') {
            panelManagerInstance.destroyAllPanelsByComponentType(componentType);
          } else {
            panelManagerInstance.destroyPanelByComponentType(componentType);
          }
          panelActionTaken = true;
        } else {
          logger.error(
            'init',
            'CRITICAL: Cannot call destroyPanelByComponentType - panelManagerInstance or method is invalid.'
          );
        }
      } else {
        logger.warn(
          'init',
          `Module ${moduleId} has no registered panel component type. Cannot close panel.`
        );
      }

      // Dispatch rehome event after disabling
      if (dispatcher) {
        logger.debug(
          'init',
          `Module ${moduleId} disabled (panel action taken: ${panelActionTaken}), dispatching system:rehomeTimerUI.`
        );
        setTimeout(() => {
          dispatcher.publish(
            'core',
            'system:rehomeTimerUI',
            {},
            { initialTarget: 'top' }
          );
        }, 0);
      }
    }
  };

  api.getModuleState = (moduleId) => {
    return runtimeModuleStates.get(moduleId) || { initialized: false, enabled: false };
  };

  api.getAllModuleStates = () => {
    const states = {};
    for (const [moduleId, state] of runtimeModuleStates.entries()) {
      const moduleInstance = importedModules.get(moduleId);
      states[moduleId] = {
        ...state, // { initialized, enabled }
        definition: moduleInstance?.moduleInfo || {
          name: moduleId,
          title: moduleId,
          description:
            'Definition N/A - Module not fully loaded or moduleInfo missing.',
        },
      };
    }
    return states;
  };

  api.getLoadPriority = () => combinedModeData.moduleConfig?.loadPriority || [];

  api.getCurrentLoadPriority = async () => {
    return combinedModeData.moduleConfig?.loadPriority || [];
  };

  api.getModuleManagerApi = () => api;

  /**
   * Creates an additional panel instance for a module that supports multiple instances.
   * @param {string} moduleId - The module to create an instance for.
   * @param {object} instanceState - Optional state passed to the component (e.g., { title: "Map View" }).
   * @returns {object|null} The created panel item, or null if not supported.
   */
  api.createPanelInstance = async (moduleId, instanceState = {}) => {
    const moduleState = runtimeModuleStates.get(moduleId);
    if (!moduleState || !moduleState.enabled) {
      logger.warn('init', `Cannot create instance: module ${moduleId} is not enabled.`);
      return null;
    }

    const componentType = centralRegistry.getComponentTypeForModule(moduleId);
    const moduleInstance = importedModules.get(moduleId);
    const moduleInfoObj = moduleInstance?.moduleInfo;

    if (!moduleInfoObj?.allowMultipleInstances) {
      logger.warn('init', `Module ${moduleId} does not support multiple instances.`);
      return null;
    }

    if (!componentType || !panelManagerInstance) {
      logger.error('init', `Cannot create instance: missing componentType or panelManager.`);
      return null;
    }

    // Determine title: explicit > auto-numbered > default
    let title = instanceState.title;
    if (!title) {
      // Count existing instances to generate a number
      const stacks = [];
      function findComponents(item) {
        if (item.isComponent && item.componentType === componentType) {
          stacks.push(item);
        } else if (item.contentItems) {
          item.contentItems.forEach(findComponents);
        }
      }
      if (panelManagerInstance.goldenLayout?.root?.contentItems) {
        findComponents(panelManagerInstance.goldenLayout.root);
      }
      const instanceNumber = stacks.length + 1;
      const baseTitle = moduleInfoObj.title || moduleId;
      title = instanceNumber > 1 ? `${baseTitle} ${instanceNumber}` : baseTitle;
    }

    const column = instanceState.column || moduleInfoObj.column || null;
    return panelManagerInstance.createAdditionalInstance(componentType, title, column, instanceState);
  };

  return api;
}
