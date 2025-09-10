// init.js - Initialization script for the modular frontend

// Import logger first and make it globally available before other imports
import logger from './app/core/loggerService.js';

// Configure logger with basic settings early to reduce noise during module imports
logger.configure({
  defaultLevel: 'WARN',
  moduleLevels: {}, // No modules at INFO; all default to WARN
});

// Make logger globally available for modules that import during this phase
window.logger = logger;

// Core Singletons/Managers (imported after logger is available)
import panelManagerInstance from './app/core/panelManager.js';
import eventBus from './app/core/eventBus.js';
import settingsManager from './app/core/settingsManager.js';
import { centralRegistry } from './app/core/centralRegistry.js';
import EventDispatcher from './app/core/eventDispatcher.js';
import { loadAndMergeJsonFiles, getConfigPaths, hasMultiplePaths } from './utils/settingsMerger.js';

// Make eventBus and centralRegistry globally available for cross-module communication
window.eventBus = eventBus;
window.centralRegistry = centralRegistry;

// Register frontend as publisher for events it publishes
centralRegistry.registerEventBusPublisher('core', 'app:fullModeDataLoadedFromStorage');
centralRegistry.registerEventBusPublisher('core', 'module:stateChanged');
centralRegistry.registerEventBusPublisher('core', 'app:modesJsonLoaded');
centralRegistry.registerEventBusPublisher('core', 'app:readyForUiDataLoad');
centralRegistry.registerEventBusPublisher('core', 'app:activeModeDetermined');
centralRegistry.registerEventBusPublisher('core', 'uiHostRegistry:hostStatusChanged');
centralRegistry.registerEventBusPublisher('core', 'ui:activatePanel');
centralRegistry.registerEventBusPublisher('core', 'settings:changed');

import { GoldenLayout } from './libs/golden-layout/js/esm/golden-layout.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  const prefix = `[Init - ${level.toUpperCase()}]`;
  switch (level) {
    case 'error':
      console.error(prefix, message, ...data);
      break;
    case 'warn':
      console.warn(prefix, message, ...data);
      break;
    case 'info':
      console.info(prefix, message, ...data);
      break;
    case 'debug':
      // For init.js, let's make debug also quite visible if needed, or map to log
      console.debug(prefix, message, ...data); // Or console.log
      break;
    case 'verbose':
      console.debug(prefix, message, ...data); // Or console.log for verbose as well
      break;
    default:
      console.log(prefix, message, ...data);
  }
}

// Note: stateManagerProxySingleton will be imported dynamically later to avoid early logging

// --- Mode Management Globals ---
let G_currentActiveMode = 'default';
let G_modesConfig = null; // To store the loaded modes.json
let G_combinedModeData = {}; // To store aggregated data for the current mode
const G_LOCAL_STORAGE_MODE_PREFIX = 'archipelagoToolSuite_modeData_';
const G_LOCAL_STORAGE_LAST_ACTIVE_MODE_KEY =
  'archipelagoToolSuite_lastActiveMode';
let G_skipLocalStorageLoad = false; // Flag to skip localStorage loading if ?reset=true
// --- End Mode Management Globals ---

// GoldenLayout (assuming it's loaded globally via script tag)
// declare const goldenLayout: any; // Removed TypeScript declaration

let layoutPresets = {};
const importedModules = new Map(); // Map<moduleId, moduleObject>
let dispatcher = null;
let moduleManagerApi = {}; // Define placeholder for the API object

// Keep track of runtime module state
const runtimeModuleStates = new Map(); // Map<moduleId, { initialized: boolean, enabled: boolean }>

// --- Helper Functions ---

async function fetchJson(url, errorMessage) {
  // Extract filename from URL for display
  const fileName = url.split('/').pop() || url;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    incrementFileCounter(fileName); // Increment counter with filename on successful load
    return result;
  } catch (error) {
    logger.error('init', `${errorMessage}: ${url}`, error);
    addFileError(fileName); // Add error to file list
    return null; // Return null to indicate failure
  }
}

function getDefaultLayoutConfig() {
  // Define a fallback default layout configuration
  logger.warn('init', 'Using hardcoded default layout configuration.');
  return {
    settings: {
      showPopoutIcon: false,
    },
    root: {
      type: 'row',
      content: [
        {
          type: 'stack', // Combine into one stack for default
          width: 100,
          content: [
            {
              type: 'component',
              componentType: 'jsonPanel',
              title: 'JSON',
            },
            {
              type: 'component',
              componentType: 'modulesPanel',
              title: 'Modules',
            },
          ],
        },
      ],
    },
  };
}

// +++ Add helper function to check layout config validity +++
function isValidLayoutObject(layoutConfig) {
  if (!layoutConfig || typeof layoutConfig !== 'object') return false;
  if (layoutConfig.root) return true; // Direct GL config object
  // Check if it's a preset collection (has at least one key that is a valid GL config object)
  for (const key in layoutConfig) {
    if (
      Object.prototype.hasOwnProperty.call(layoutConfig, key) &&
      layoutConfig[key] &&
      typeof layoutConfig[key] === 'object' &&
      layoutConfig[key].root
    ) {
      return true; // Found a valid preset within the collection
    }
  }
  return false; // Not a direct config and not a valid preset collection
}
// +++ End helper function +++

// +++ Add the missing loadLayoutConfiguration function +++
async function loadLayoutConfiguration(
  layoutInstance,
  activeLayoutId,
  customConfig
) {
  let chosenLayoutConfig = null;

  if (activeLayoutId === 'custom' && customConfig) {
    logger.info('init', 'Active layout is custom.');
    chosenLayoutConfig = customConfig;
  } else if (
    typeof activeLayoutId === 'string' &&
    layoutPresets[activeLayoutId]
  ) {
    logger.info('init', `Active layout is preset: ${activeLayoutId}`);
    chosenLayoutConfig = layoutPresets[activeLayoutId];
  } else {
    logger.info(
      'init',
      `Active layout '${activeLayoutId}' not found or invalid, trying custom config.`
    );
    // Fallback to custom config if available, otherwise use hardcoded default
    chosenLayoutConfig = customConfig || getDefaultLayoutConfig();
    if (!customConfig) {
      logger.info('init', 'No custom layout found, using hardcoded default.');
    }
  }

  // If after all checks, we still don't have a config, use the hardcoded default
  if (!chosenLayoutConfig) {
    logger.warn(
      'init',
      'No valid layout configuration determined, falling back to hardcoded default.'
    );
    chosenLayoutConfig = getDefaultLayoutConfig();
  }

  // Load the chosen layout
  logger.info('init', 'Loading layout configuration into Golden Layout...');
  // Assuming V2 loadLayout. Adjust if needed for V1 'load'.
  layoutInstance.loadLayout(chosenLayoutConfig);
}
// +++ End restored function +++

// --- Helper function to create the standard Initialization API ---
function createInitializationApi(moduleId) {
  // Note: dispatcher and centralRegistry need to be available in the outer scope
  logger.debug('init', `Creating API for module: ${moduleId}`);
  // logger.debug('init', 'settingsManager:', settingsManager); // Reduce log noise
  // logger.debug('init', 'dispatcher:', dispatcher); // Reduce log noise

  return {
    getModuleSettings: async () => settingsManager.getModuleSettings(moduleId),
    getDispatcher: () => ({
      publish: (eventName, data, options = {}) => {
        // Check if this module is enabled as a sender for this event
        const dispatcherSenders = centralRegistry.getAllDispatcherSenders();
        const sendersForEvent = dispatcherSenders.get(eventName) || [];
        const senderInfo = sendersForEvent.find(s => s.moduleId === moduleId);
        
        if (senderInfo && senderInfo.enabled === false) {
          logger.debug('init', `Module ${moduleId} is disabled as sender for event ${eventName}, skipping publish`);
          return;
        }
        
        return dispatcher.publish(moduleId, eventName, data, options);
      },
      publishToNextModule: dispatcher.publishToNextModule.bind(dispatcher),
    }),
    getEventBus: () => eventBus,
    getLogger: () => logger,
    getModuleFunction: (targetModuleId, functionName) => {
      return centralRegistry.getPublicFunction(targetModuleId, functionName);
    },
    getModuleManager: () => moduleManagerApi, // Provide the manager API itself
    getAllSettings: async () => {
      // logger.debug('init', `${moduleId} calling getAllSettings...`); // Reduce log noise
      try {
        const allSettings = await settingsManager.getSettings();
        // logger.debug('init',
        //   `${moduleId} received allSettings:`,
        //   allSettings
        // );
        return allSettings;
      } catch (error) {
        logger.error(
          'init',
          `Error in getAllSettings called by ${moduleId}:`,
          error
        );
        throw error; // Re-throw the error so the module still fails
      }
    },
    // getSingleton: (name) => { /* Decide how to provide singletons */ },
  };
}

// Helper function for registration API creation (used in main registration and dynamic load)
function createRegistrationApi(moduleId, moduleInstance) {
  return {
    registerPanelComponent: (componentType, componentFactory) => {
      centralRegistry.registerPanelComponent(
        moduleId,
        componentType,
        componentFactory
      );
    },
    // Keep old one for compatibility
    // registerEventHandler: (eventName, handlerFunction) => {
    //   centralRegistry.registerEventHandler(
    //     moduleId,
    //     eventName,
    //     handlerFunction.bind(moduleInstance) // Ensure correct 'this'
    //   );
    // },
    // New detailed receiver registration
    registerDispatcherReceiver: (
      moduleIdFromCall, // This is moduleInfo.name from the module (e.g., 'Client') - we'll ignore this or use for validation
      eventNameFromCall, // This is the actual event name (e.g., 'user:locationCheck')
      handlerFunctionFromCall, // This is the handler function
      propagationDetailsFromCall // This is the propagation details
    ) => {
      centralRegistry.registerDispatcherReceiver(
        moduleId, // Use moduleId from the closure (e.g. 'client' from modules.json)
        eventNameFromCall, // Pass the event name from the call
        handlerFunctionFromCall, // Pass the handler function
        propagationDetailsFromCall // Pass the propagation details
      );
    },
    // New sender registration
    registerDispatcherSender: (eventName, direction, target) => {
      centralRegistry.registerDispatcherSender(
        moduleId,
        eventName,
        direction,
        target
      );
    },
    // New EventBus publisher registration
    registerEventBusPublisher: (eventName) => {
      centralRegistry.registerEventBusPublisher(moduleId, eventName);
    },
    // New EventBus subscriber registration (for tracking intent only)
    registerEventBusSubscriberIntent: (eventName) => {
      // This function is primarily for tracking/validation purposes.
      // The actual subscription happens within the module's UI component.
      centralRegistry.registerEventBusSubscriberIntent(moduleId, eventName);
    },
    registerSettingsSchema: (schemaSnippet) => {
      centralRegistry.registerSettingsSchema(moduleId, schemaSnippet);
    },
    registerPublicFunction: (idProvidedByModule, functionName, functionRef) => {
      // idProvidedByModule is what the module passes as its identifier for the function (e.g., moduleInfo.name like "Timer")
      // functionName is the actual name of the function (e.g., "attachTimerToHost")
      // functionRef is the function callback itself
      centralRegistry.registerPublicFunction(
        idProvidedByModule, // Use the identifier provided by the module for the function map key
        functionName,
        functionRef
      );
    },
    registerJsonDataHandler: (dataKey, handlerObject) => {
      centralRegistry.registerJsonDataHandler(moduleId, dataKey, handlerObject);
    },
  };
}

// --- Helper function to initialize a single module ---
async function _initializeSingleModule(moduleId, index) {
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
      runtimeModuleStates.get(moduleId).initialized = true; // Mark as initialized
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
      // Potentially mark as failed?
      runtimeModuleStates.get(moduleId).enabled = false; // Disable on error
    }
  } else if (moduleInstance) {
    // Module exists but no initialize function
    runtimeModuleStates.get(moduleId).initialized = true; // Still mark runtime state
  }
}

// --- Helper function to post-initialize a single module ---
async function _postInitializeSingleModule(moduleId) {
  const moduleInstance = importedModules.get(moduleId);
  if (moduleInstance && typeof moduleInstance.postInitialize === 'function') {
    const api = createInitializationApi(moduleId);
    const genericModuleSpecificConfig =
      window.G_combinedModeData.module_configs?.[moduleId] || {};

    let configForPostInitialize = genericModuleSpecificConfig; // Default for other modules

    // Existing diagnostic log - ensure it captures the state accurately
    if (moduleId === 'stateManager') {
      log(
        'debug',
        '[Init _postInitializeSingleModule] Original genericModuleSpecificConfig FOR stateManager (from G_combinedModeData.module_configs.stateManager):',
        JSON.parse(JSON.stringify(genericModuleSpecificConfig)) // Log a deep copy
      );

      // Construct the specific configuration for StateManager
      const smConfig = {};
      if (window.G_combinedModeData && window.G_combinedModeData.rulesConfig) {
        smConfig.rulesConfig = window.G_combinedModeData.rulesConfig;
        if (
          window.G_combinedModeData.dataSources &&
          window.G_combinedModeData.dataSources.rulesConfig &&
          (window.G_combinedModeData.dataSources.rulesConfig.source === 'file' ||
           window.G_combinedModeData.dataSources.rulesConfig.source === 'urlOverride') &&
          typeof window.G_combinedModeData.dataSources.rulesConfig.details ===
            'string'
        ) {
          let pathPrefix, sourceName;
          if (window.G_combinedModeData.dataSources.rulesConfig.source === 'file') {
            pathPrefix = 'Loaded from file: ';
          } else if (window.G_combinedModeData.dataSources.rulesConfig.source === 'urlOverride') {
            pathPrefix = 'Loaded from URL parameter override: ';
          }
          
          if (
            window.G_combinedModeData.dataSources.rulesConfig.details.startsWith(
              pathPrefix
            )
          ) {
            smConfig.sourceName =
              window.G_combinedModeData.dataSources.rulesConfig.details.substring(
                pathPrefix.length
              );
            log(
              'info',
              `[Init _postInitializeSingleModule] Derived sourceName for StateManager: ${smConfig.sourceName} (source: ${window.G_combinedModeData.dataSources.rulesConfig.source})`
            );
          } else {
            log(
              'warn',
              '[Init _postInitializeSingleModule] Could not derive sourceName for StateManager from dataSources.rulesConfig.details:',
              window.G_combinedModeData.dataSources.rulesConfig.details
            );
          }
        } else {
          log(
            'warn',
            '[Init _postInitializeSingleModule] dataSources.rulesConfig not found or not in expected format for StateManager sourceName.'
          );
        }
      } else {
        log(
          'warn',
          '[Init _postInitializeSingleModule] window.G_combinedModeData.rulesConfig not found for StateManager.'
        );
      }

      // If smConfig was populated with rulesConfig, use it.
      // This prioritizes the globally loaded rulesConfig over any potentially empty module_configs.stateManager.
      if (smConfig.rulesConfig) {
        configForPostInitialize = smConfig;
      } else {
        log(
          'warn',
          '[Init _postInitializeSingleModule] StateManager will receive potentially empty config as rulesConfig was not found in G_combinedModeData.'
        );
      }
    }

    try {
      logger.info('init', `Post-initializing module: ${moduleId}`);
      // Special handling for stateManager postInitialize to pass mode-specific data
      if (moduleId === 'stateManager') {
        log(
          'info',
          '[Init _postInitializeSingleModule] EXACT configForPostInitialize BEING PASSED to stateManager.postInitialize:',
          JSON.parse(JSON.stringify(configForPostInitialize)) // Log the exact object being passed
        );
        // Pass the prepared configForPostInitialize
        await moduleInstance.postInitialize(api, configForPostInitialize);
      } else if (moduleInstance.postInitialize) {
        await moduleInstance.postInitialize(api, configForPostInitialize); // Pass configForPostInitialize to other modules too
      }
    } catch (error) {
      logger.error(
        'init',
        `Error during post-initialization of module: ${moduleId}`,
        error
      );
      // Potentially mark as failed and disable?
      runtimeModuleStates.get(moduleId).enabled = false;
    }
  }
}

// --- Mode Management Functions ---
async function determineActiveMode() {
  logger.info('init', 'Determining active mode...');
  const urlParams = new URLSearchParams(window.location.search);
  const explicitMode = urlParams.get('mode'); // Get explicitMode first

  // Case 1: ?mode=reset (special reset keyword)
  if (explicitMode === 'reset') {
    logger.info(
      'init',
      '"?mode=reset" detected. Applying reset: loading "default" files, clearing last active mode and "default" mode data.'
    );
    G_currentActiveMode = 'default';
    G_skipLocalStorageLoad = true; // Ensure we load files, not from a potentially stored "reset" mode
    try {
      localStorage.removeItem(G_LOCAL_STORAGE_LAST_ACTIVE_MODE_KEY);
      localStorage.removeItem(G_LOCAL_STORAGE_MODE_PREFIX + 'default'); // Clear default mode's saved data specifically
      logger.info(
        'init',
        'Cleared last active mode and "default" mode data from localStorage for mode=reset.'
      );
    } catch (e) {
      logger.error('init', 'Error clearing localStorage during mode=reset:', e);
    }
    return; // Exit early: "default" is set for loading, "reset" is not saved as lastActiveMode
  }

  // Case 2: ?reset=true (generic reset flag, possibly with ?mode=someOtherMode)
  // explicitMode here is NOT 'reset' due to the check above.
  const resetFlag = urlParams.get('reset') === 'true';
  if (resetFlag) {
    const modeToLoadDefaultsFor = explicitMode || 'default';
    logger.info(
      'init',
      `"?reset=true" detected. Applying reset: loading "${modeToLoadDefaultsFor}" files, clearing last active mode and data for "${modeToLoadDefaultsFor}".`
    );
    G_currentActiveMode = modeToLoadDefaultsFor;
    G_skipLocalStorageLoad = true;
    try {
      localStorage.removeItem(G_LOCAL_STORAGE_LAST_ACTIVE_MODE_KEY);
      // Clear data for the specific mode being reset TO
      localStorage.removeItem(
        G_LOCAL_STORAGE_MODE_PREFIX + modeToLoadDefaultsFor
      );
      logger.info(
        'init',
        `Cleared last active mode and "${modeToLoadDefaultsFor}" mode data from localStorage for reset=true.`
      );
    } catch (e) {
      logger.error(
        'init',
        `Error clearing localStorage for mode "${modeToLoadDefaultsFor}" during reset=true:`,
        e
      );
    }
    return; // Exit early: modeToLoadDefaultsFor is set for loading, not saved as lastActiveMode immediately.
  }

  // Case 3: Standard mode determination (no "mode=reset" and no "reset=true")
  // At this point, explicitMode is not "reset", and resetFlag is false.
  if (explicitMode) {
    logger.info('init', `Mode specified in URL: "${explicitMode}".`);
    // Validate that the mode exists in modes.json (G_modesConfig will be loaded after this)
    // We'll defer validation until after loadModesConfiguration() is called
    G_currentActiveMode = explicitMode;
  } else {
    try {
      const lastActiveMode = localStorage.getItem(
        G_LOCAL_STORAGE_LAST_ACTIVE_MODE_KEY
      );
      if (lastActiveMode) {
        logger.info(
          'init',
          `Loaded last active mode from localStorage: "${lastActiveMode}".`
        );
        G_currentActiveMode = lastActiveMode;
      } else {
        logger.info(
          'init',
          'No last active mode in localStorage. Using default: "default".'
        );
        G_currentActiveMode = 'default'; // Default if nothing else is found
      }
    } catch (e) {
      logger.error(
        'init',
        'Error reading last active mode from localStorage. Using default.',
        e
      );
      G_currentActiveMode = 'default';
    }
  }

  // Save the determined mode as the last active mode for the next session
  // This block is only reached if it's not a reset scenario (i.e., didn't return early)
  try {
    localStorage.setItem(
      G_LOCAL_STORAGE_LAST_ACTIVE_MODE_KEY,
      G_currentActiveMode
    );
    logger.info(
      'init',
      `Saved current active mode to localStorage: "${G_currentActiveMode}".`
    );
  } catch (e) {
    logger.error('init', 'Error saving last active mode to localStorage.', e);
  }
}

async function loadModesConfiguration() {
  logger.info('init', 'Loading modes configuration (modes.json)...');
  try {
    const modesFileContent = await fetchJson(
      './modes.json',
      'Error loading modes.json'
    );
    if (modesFileContent) {
      G_modesConfig = modesFileContent;
      logger.info('init', 'Successfully loaded and parsed modes.json.');
    } else {
      logger.error(
        'init',
        'modes.json could not be loaded or is empty. Proceeding with minimal default mode config.'
      );
      G_modesConfig = {
        default: {
          moduleConfig: { path: './modules.json', enabled: true },
          rulesConfig: {
            path: './presets/alttp/AP_14089154938208861744/AP_14089154938208861744_rules.json',
            enabled: true,
          },
          layoutConfig: { path: './layout_presets.json', enabled: true },
          userSettings: { path: './settings.json', enabled: true },
        },
      };
    }
  } catch (error) {
    logger.error(
      'init',
      'Critical error loading modes.json. Using hardcoded fallback.',
      error
    );
    G_modesConfig = {
      // Fallback to a minimal default if fetchJson itself throws for modes.json
      default: {
        moduleConfig: { path: './modules.json', enabled: true },
        rulesConfig: {
          path: './presets/alttp/AP_14089154938208861744/AP_14089154938208861744_rules.json',
          enabled: true,
        },
        layoutConfig: { path: './layout_presets.json', enabled: true },
        userSettings: { path: './settings.json', enabled: true },
      },
    };
  }
}

async function loadCombinedModeData(urlParams) {
  log('info', '[Init] loadCombinedModeData started'); // ADDED FOR TRACING
  let baseCombinedData = {};
  const dataSources = {}; // To track the origin of each config piece

  if (!G_skipLocalStorageLoad) {
    try {
      const storedData = localStorage.getItem(
        `${G_LOCAL_STORAGE_MODE_PREFIX}${G_currentActiveMode}`
      );
      if (storedData) {
        baseCombinedData = JSON.parse(storedData);
        // Record that this data came from localStorage
        Object.keys(baseCombinedData).forEach((key) => {
          if (key !== 'dataSources') {
            // Don't track the dataSources field itself
            dataSources[key] = {
              source: 'localStorage',
              timestamp: new Date().toISOString(),
              details: `Loaded from localStorage key: ${G_LOCAL_STORAGE_MODE_PREFIX}${G_currentActiveMode}`,
            };
          }
        });
        logger.info(
          'init',
          `Successfully set baseCombinedData for mode "${G_currentActiveMode}" from localStorage.`
        );
      } else {
        logger.info(
          'init',
          `No data for mode "${G_currentActiveMode}" in localStorage. Will load all configs from files.`
        );
      }
    } catch (error) {
      logger.error(
        'init',
        `Error reading or parsing mode data from localStorage for "${G_currentActiveMode}":`,
        error
      );
      baseCombinedData = {}; // Reset on error
    }
  } else {
    logger.info(
      'init',
      'Skipping localStorage load for mode data as per G_skipLocalStorageLoad.'
    );
  }

  // Ensure modeName is correctly set in baseCombinedData, prioritizing the current active mode
  baseCombinedData.modeName = G_currentActiveMode;

  // Check for URL parameter override for rules file
  let rulesOverride = urlParams.get('rules');
  
  // Check for game and seed parameters as an alternative way to specify rules
  const gameParam = urlParams.get('game');
  const seedParam = urlParams.get('seed') || '1'; // Default seed is 1
  
  // If game parameter is provided and no rules parameter, look up the rules file
  if (gameParam && !rulesOverride) {
    try {
      // Load preset_files.json to find matching game and seed
      const presetFiles = await fetchJson(
        './presets/preset_files.json',
        'Error loading preset_files.json for game/seed lookup'
      );
      
      if (presetFiles) {
        // Find the game entry (check both root keys and name fields)
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
          let rulesFile = null;
          
          for (const [folderName, folderData] of Object.entries(gameEntry.folders)) {
            if (folderData.seed && String(folderData.seed) === String(seedParam)) {
              // Look for rules.json file in the files array
              if (folderData.files && Array.isArray(folderData.files)) {
                const rulesFileName = folderData.files.find(file => file.endsWith('_rules.json'));
                if (rulesFileName) {
                  rulesFile = `./presets/${gameKey}/${folderName}/${rulesFileName}`;
                  break;
                }
              }
            }
          }
          
          if (rulesFile) {
            rulesOverride = rulesFile;
            logger.info(
              'init',
              `Rules file determined from game="${gameParam}" and seed="${seedParam}": ${rulesFile}`
            );
          } else {
            logger.warn(
              'init',
              `No rules file found for game="${gameParam}" with seed="${seedParam}"`
            );
          }
        } else {
          logger.warn(
            'init',
            `Game "${gameParam}" not found in preset_files.json`
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
  
  // If the rules parameter starts with "./frontend/", remove that prefix
  if (rulesOverride && rulesOverride.startsWith('./frontend/')) {
    rulesOverride = './' + rulesOverride.substring('./frontend/'.length);
    logger.info(
      'init',
      `Removed './frontend/' prefix from rules parameter. New path: ${rulesOverride}`
    );
  }

  // --- New logic to iterate over all config keys defined in modes.json for the current mode ---
  const currentModeFileConfigs = G_modesConfig?.[G_currentActiveMode];
  if (currentModeFileConfigs) {
    for (const configKey in currentModeFileConfigs) {
      if (
        Object.prototype.hasOwnProperty.call(currentModeFileConfigs, configKey)
      ) {
        const configEntry = currentModeFileConfigs[configKey];
        // Ensure it's an object with a 'path' or 'paths' and is 'enabled' (or enabled is not specified, defaulting to true)
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

          // Only load from file if not present in baseCombinedData (from localStorage) or if localStorage load was skipped
          if (
            G_skipLocalStorageLoad ||
            !baseCombinedData.hasOwnProperty(configKey) ||
            !baseCombinedData[configKey] ||  // Also load if key exists but value is null/undefined/falsey from LS
            (configKey === 'rulesConfig' && rulesOverride) // Always reload rulesConfig if URL override is present
          ) {
            logger.info(
              'init',
              `${configKey} for "${G_currentActiveMode}" is missing or invalid in baseCombinedData. Attempting to load from files.`
            );
            
            let fetchedData = null;
            
            // Check if we have multiple paths to merge
            if (pathsToLoad.length > 1) {
              // Load and merge multiple files
              fetchedData = await loadAndMergeJsonFiles(
                pathsToLoad,
                fetchJson,
                (msg) => logger.info('init', msg)
              );
            } else if (pathsToLoad.length === 1) {
              // Single file load (existing behavior)
              fetchedData = await fetchJson(
                pathsToLoad[0],
                `Error loading ${configKey} from file`
              );
            }
            
            if (fetchedData) {
              baseCombinedData[configKey] = fetchedData;

              dataSources[configKey] = {
                source: rulesOverride && configKey === 'rulesConfig' ? 'urlOverride' : 'file',
                timestamp: new Date().toISOString(),
                details: rulesOverride && configKey === 'rulesConfig' 
                  ? `Loaded from URL parameter override: ${pathsToLoad[0]}`
                  : pathsToLoad.length > 1
                    ? `Merged from ${pathsToLoad.length} files: ${pathsToLoad.join(', ')}`
                    : `Loaded from file: ${pathsToLoad[0]}`,
              };

              logger.info(
                'init',
                `Loaded ${configKey} for "${G_currentActiveMode}" from ${pathsToLoad.length} file(s).`
              );
            } else {
              logger.warn(
                'init',
                `Failed to load ${configKey} from ${pathsToLoad.join(', ')}. It will be missing unless defaults are applied later.`
              );
              // Ensure the key exists with null if fetch failed, to prevent re-attempts if not desired
              if (!baseCombinedData.hasOwnProperty(configKey)) {
                baseCombinedData[configKey] = null;
                dataSources[configKey] = {
                  source: 'error',
                  timestamp: new Date().toISOString(),
                  details: `Failed to load from file(s): ${pathsToLoad.join(', ')}`,
                };
              }
            }
          } else {
            logger.info(
              'init',
              `Using ${configKey} for "${G_currentActiveMode}" from localStorage.`
            );
          }
        }
      }
    }
  } else {
    logger.warn(
      'init',
      `No file configurations found in modes.json for mode "${G_currentActiveMode}".`
    );
  }

  // Special handling for layoutConfig (as it's used by GoldenLayout setup later)
  // This ensures layoutPresets is populated even if layoutConfig comes from localStorage
  if (baseCombinedData.layoutConfig) {
    if (isValidLayoutObject(baseCombinedData.layoutConfig)) {
      layoutPresets = baseCombinedData.layoutConfig; // If it's a collection of presets
      logger.info(
        'init',
        'layoutPresets populated from combined data (either localStorage or file).'
      );
    } else {
      logger.warn(
        'init',
        'layoutConfig in combined data is not a valid layout object or preset collection.'
      );
      // If it's not a valid collection, but might be a single layout, try to make it a default preset
      layoutPresets = { default: baseCombinedData.layoutConfig };
    }
  } else {
    logger.warn(
      'init',
      'No layoutConfig found in combined data. GoldenLayout might use hardcoded defaults.'
    );
    layoutPresets = { default: getDefaultLayoutConfig() }; // Fallback
    dataSources.layoutConfig = {
      source: 'default',
      timestamp: new Date().toISOString(),
      details: 'Using hardcoded default layout configuration',
    };
  }

  // Prepare module_configs within baseCombinedData before it's finalized into G_combinedModeData
  if (!baseCombinedData.module_configs) {
    baseCombinedData.module_configs = {};
  }

  // ADDED LOGGING BEFORE MODIFICATION ATTEMPT
  //log(
  //  'info',
  //  '[Init] stateManager module_config BEFORE sourceName logic (exists?): ' +
  //    (baseCombinedData.module_configs?.stateManager ? 'yes' : 'no') +
  //    ', sourceName: ' +
  //    (baseCombinedData.module_configs?.stateManager?.sourceName || 'undefined')
  //);
  //log(
  //  'info',
  //  '[Init] baseCombinedData.dataSources.rulesConfig.source (stale check): ' + // Clarified this log refers to potentially stale data
  //    (baseCombinedData.dataSources?.rulesConfig?.source || 'undefined')
  //);
  //log(
  //  'info',
  //  '[Init] local dataSources.rulesConfig.source (live check): ' + // Log the relevant part of the local dataSources
  //    (dataSources.rulesConfig?.source || 'undefined') +
  //    ', details: ' +
  //    (dataSources.rulesConfig?.details || 'undefined')
  //);

  // Ensure StateManager gets the correct source name if its rulesConfig is being set by the mode
  // Handle both file loads and URL parameter overrides
  if (dataSources.rulesConfig) {
    let sourcePath = null;
    
    // Extract the source path based on how the rules were loaded
    if (dataSources.rulesConfig.source === 'file') {
      // Extract path from "Loaded from file: <path>" format
      const match = dataSources.rulesConfig.details.match(/^Loaded from file: (.+)$/);
      if (match) {
        sourcePath = match[1];
      }
    } else if (dataSources.rulesConfig.source === 'urlOverride') {
      // Extract path from "Loaded from URL parameter override: <path>" format
      const match = dataSources.rulesConfig.details.match(/^Loaded from URL parameter override: (.+)$/);
      if (match) {
        sourcePath = match[1];
      }
    }
    
    // Set up StateManager config if we have a valid source path
    if (sourcePath) {
      if (!baseCombinedData.module_configs.stateManager) {
        baseCombinedData.module_configs.stateManager = {
          rulesConfig: baseCombinedData.rulesConfig, // Explicitly pass the top-level rules
          sourceName: sourcePath, // Set the correct sourceName from the actual path used
        };
        log(
          'info',
          `[Init] Created stateManager module_config with sourceName: ${sourcePath} (source: ${dataSources.rulesConfig.source})`
        );
      } else if (
        baseCombinedData.module_configs.stateManager.rulesConfig && // If stateManager already has rules defined in its module_config
        !baseCombinedData.module_configs.stateManager.sourceName && // And no sourceName is set
        !baseCombinedData.module_configs.stateManager.id // And no id is set (further indicating it's not from a specific preset for SM)
      ) {
        // Update the existing StateManager config with the correct sourceName
        baseCombinedData.module_configs.stateManager.sourceName = sourcePath;
        log(
          'info',
          `[Init] Updated stateManager module_config with sourceName: ${sourcePath} (source: ${dataSources.rulesConfig.source})`
        );
      }
    } else {
      log(
        'warn',
        `[Init] Could not extract source path from rulesConfig dataSources details: ${dataSources.rulesConfig.details}`
      );
    }
  }

  // ADDED LOGGING AFTER MODIFICATION ATTEMPT
  //log(
  //  'info',
  //  '[Init] stateManager module_config AFTER sourceName logic (exists?): ' +
  //    (baseCombinedData.module_configs?.stateManager ? 'yes' : 'no') +
  //    ', sourceName: ' +
  //    (baseCombinedData.module_configs?.stateManager?.sourceName || 'undefined')
  //);

  // Add the dataSources to the combined data
  baseCombinedData.dataSources = dataSources;

  G_combinedModeData = baseCombinedData;
  logger.debug(
    'init',
    'Final G_combinedModeData after potential merging:',
    JSON.parse(JSON.stringify(G_combinedModeData)) // Log a deep copy to avoid circular issues in console
  );
}

// --- File loading counter and list ---
let filesLoadedCount = 0;
const loadedFilesList = [];

function updateFileCounter() {
  const counterElement = document.getElementById('files-loaded-count');
  if (counterElement) {
    counterElement.textContent = filesLoadedCount;
  }
}

function addFileToList(fileName, status = 'success') {
  const fileListContainer = document.getElementById('file-list-container');
  if (fileListContainer) {
    const fileEntry = document.createElement('div');
    fileEntry.className = `file-entry ${status}`;
    fileEntry.textContent = fileName;
    fileListContainer.appendChild(fileEntry);
    
    // Auto-scroll to bottom to show newest entries
    fileListContainer.scrollTop = fileListContainer.scrollHeight;
  }
  
  // Also track in array for potential future use
  loadedFilesList.push({ fileName, status, timestamp: new Date() });
}

function incrementFileCounter(fileName = 'Unknown file') {
  filesLoadedCount++;
  updateFileCounter();
  addFileToList(fileName, 'success');
  logger.debug('init', `Files loaded: ${filesLoadedCount} - Latest: ${fileName}`);
}

function addFileError(fileName) {
  addFileToList(`❌ ${fileName}`, 'error');
  logger.debug('init', `File load error: ${fileName}`);
}

// --- Helper function to hide loading screen ---
function hideLoadingScreen() {
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) {
    loadingScreen.classList.add('hidden');
    logger.info('init', 'Loading screen hidden');
  }
}

// --- Main Initialization Logic ---
async function main() {
  logger.info('init', 'Starting main initialization...');

  // Get URL parameters early so they're available throughout the function
  const urlParams = new URLSearchParams(window.location.search);

  // --- Make sure DOM is ready ---
  if (document.readyState === 'loading') {
    logger.info('init', 'Document is loading, deferring main execution.');
    document.addEventListener('DOMContentLoaded', main);
    return;
  }
  logger.info('init', 'DOM content fully loaded and parsed.');

  // Determine active mode first
  await determineActiveMode();
  logger.info(
    'init',
    `Effective active mode for this session: "${G_currentActiveMode}"`
  );
  logger.debug(
    'init',
    `Skip localStorage load for mode data: ${G_skipLocalStorageLoad}`
  );

  // Load modes.json configuration
  await loadModesConfiguration();

  // Validate that the current active mode exists in modes.json
  if (!G_modesConfig[G_currentActiveMode]) {
    logger.warn(
      'init',
      `Mode "${G_currentActiveMode}" not found in modes.json. Falling back to "default" mode.`
    );
    
    // Check if the mode was from localStorage and clear it
    if (!urlParams.get('mode')) {
      try {
        localStorage.removeItem(G_LOCAL_STORAGE_LAST_ACTIVE_MODE_KEY);
        logger.info('init', 'Cleared invalid mode from localStorage.');
      } catch (e) {
        logger.error('init', 'Error clearing invalid mode from localStorage:', e);
      }
    }
    
    G_currentActiveMode = 'default';
    
    // Save the corrected mode to localStorage
    try {
      localStorage.setItem(G_LOCAL_STORAGE_LAST_ACTIVE_MODE_KEY, G_currentActiveMode);
      logger.info('init', 'Saved corrected mode to localStorage: "default".');
    } catch (e) {
      logger.error('init', 'Error saving corrected mode to localStorage:', e);
    }
  }

  // Load all data for the current mode (from localStorage or defaults)
  await loadCombinedModeData(urlParams);

  // Initialize settings manager with mode-specific settings
  if (G_combinedModeData.userSettings) {
    // Assuming settingsManager has a method like setInitialSettings or can be adapted.
    // This is a placeholder for actual integration with settingsManager's API.
    logger.debug(
      'init',
      'G_combinedModeData.userSettings BEFORE calling setInitialSettings:',
      JSON.parse(JSON.stringify(G_combinedModeData.userSettings))
    );
    if (typeof settingsManager.setInitialSettings === 'function') {
      settingsManager.setInitialSettings(G_combinedModeData.userSettings);
      logger.info(
        'init',
        'Passed mode-specific settings to settingsManager via setInitialSettings.'
      );
    } else {
      // Fallback: Attempt to directly use the settings for initialization if ensureLoaded handles it.
      // This depends on settingsManager.ensureLoaded() being able to use pre-loaded settings.
      // We might need to modify settingsManager to accept G_combinedModeData.userSettings directly.
      logger.warn(
        'init',
        'settingsManager.setInitialSettings not found. Ensure settingsManager.ensureLoaded() can use pre-configured settings if G_combinedModeData.userSettings is to be effective immediately.'
      );
    }
  }
  // ensureLoaded might use the settings provided above, or load its defaults if none were provided/applicable.
  await settingsManager.ensureLoaded();

  // Reconfigure logger with full settings from settingsManager
  try {
    const allSettings = await settingsManager.getSettings();
    logger.configure(allSettings);
    logger.info('init', 'Logger reconfigured with full settings');
    logger.info('init', 'settingsManager initialization process completed.');
  } catch (error) {
    // Use console.error here since logger might not be configured yet
    log('error', '[Init] Error reconfiguring logger:', error);
    logger.info('init', 'settingsManager initialization process completed.');
    // Continue initialization even if logger configuration fails
  }

  // Use module configuration from combined data
  const modulesData = G_combinedModeData.moduleConfig;
  if (
    !modulesData ||
    !modulesData.moduleDefinitions ||
    !modulesData.loadPriority
  ) {
    logger.error(
      'init',
      'CRITICAL: Module configuration is missing, malformed, or incomplete. Expected moduleDefinitions (as an object of modules) and loadPriority. Halting.',
      modulesData
    );
    return;
  }
  logger.debug(
    'init',
    'Using module configuration from combined mode data.',
    modulesData
  );

  // --- Dynamically Import and Register Modules ---
  logger.info('init', 'Starting module import and registration phase...');
  logger.info('INIT_STEP', 'Module import and registration phase started');
  runtimeModuleStates.clear();
  importedModules.clear();

  for (const moduleId of modulesData.loadPriority) {
    const moduleDefinition = modulesData.moduleDefinitions[moduleId];
    if (moduleDefinition && moduleDefinition.enabled) {
      logger.debug(
        'init',
        `Processing module: ${moduleId} from ${moduleDefinition.path}`
      );
      runtimeModuleStates.set(moduleId, { initialized: false, enabled: true });
      try {
        const moduleInstance = await import(moduleDefinition.path);
        const moduleFileName = moduleDefinition.path.split('/').pop() || moduleDefinition.path;
        incrementFileCounter(`${moduleId} (${moduleFileName})`); // Increment counter for module import
        importedModules.set(moduleId, moduleInstance.default || moduleInstance);
        logger.debug('init', `Dynamically imported module: ${moduleId}`);

        const actualModuleObject = moduleInstance.default || moduleInstance;
        if (
          actualModuleObject &&
          typeof actualModuleObject.register === 'function'
        ) {
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
        if (runtimeModuleStates.has(moduleId)) {
          runtimeModuleStates.get(moduleId).enabled = false;
        }
      }
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

  // --- Apply G_combinedModeData to registered modules and publish for editor ---
  if (G_combinedModeData) {
    const jsonDataHandlers = centralRegistry.getAllJsonDataHandlers();
    logger.debug(
      'init',
      `Found ${jsonDataHandlers.size} JSON data handlers in centralRegistry for data application.`
    );
    for (const [dataKey, handler] of jsonDataHandlers) {
      if (G_combinedModeData.hasOwnProperty(dataKey)) {
        if (typeof handler.applyLoadedDataFunction === 'function') {
          logger.debug(
            'init',
            `Applying data for key: ${dataKey} to its module.`
          );
          try {
            handler.applyLoadedDataFunction(G_combinedModeData[dataKey]);
          } catch (e) {
            logger.error('init', `Error applying data for ${dataKey}:`, e);
          }
        } else {
          logger.warn(
            'init',
            `Handler for ${dataKey} (module: ${handler.moduleId}) is missing or has invalid applyLoadedDataFunction.`
          );
        }
      } else {
        // Optional: logger.debug('init', `G_combinedModeData does not have key: ${dataKey}, skipping application for this handler.`);
      }
    }

    eventBus.publish('app:fullModeDataLoadedFromStorage', {
      modeData: G_combinedModeData,
    }, 'core');
    logger.debug(
      'init',
      'Published app:fullModeDataLoadedFromStorage with G_combinedModeData.'
    );
  } else {
    logger.warn(
      'init',
      'G_combinedModeData was not available for data application and event publish.'
    );
  }
  // --- End Data Application and Event Publish ---

  // --- Initialize Golden Layout ---
  logger.info('INIT_STEP', 'Golden Layout initialization started');
  const layoutContainer = document.getElementById('goldenlayout-container');
  if (!layoutContainer) {
    logger.error('init', 'Golden Layout container not found!');
    return;
  }
  const goldenLayoutInstance = new GoldenLayout(layoutContainer);
  goldenLayoutInstance.resizeWithContainerAutomatically = true;

  // After all modules have registered their panel components with centralRegistry:
  centralRegistry
    .getAllPanelComponents()
    .forEach((factoryDetails, componentType) => {
      if (typeof factoryDetails.componentClass === 'function') {
        // Wrap the direct class constructor in a factory function that Golden Layout expects,
        // which it will call with new internally, or expects us to call new.
        // The standard V2 pattern is GL calls this factory with (container, componentState).
        goldenLayoutInstance.registerComponentFactoryFunction(
          componentType,
          (container, componentState) => {
            // We instantiate the class here, passing the Golden Layout container and any state.
            // Modules should ensure their registered componentClass is a constructor.
            logger.debug(
              'init',
              `Creating component ${componentType} for module ${factoryDetails.moduleId}`
            );
            try {
              // Assuming the constructor is like: new UIClass(container, componentState, componentType?)
              // The third argument (componentType) is optional, added for potential context within the component.
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
                  `UI provider for ${componentType} is invalid or missing getRootElement method. Provider:`,
                  uiProvider
                );
                throw new Error(
                  'UI provider is invalid or missing getRootElement method.'
                );
              }

              const rootElement = uiProvider.getRootElement();
              if (!rootElement || !(rootElement instanceof HTMLElement)) {
                logger.error(
                  'init',
                  `uiProvider.getRootElement() for ${componentType} did not return a valid HTMLElement. Got:`,
                  rootElement
                );
                throw new Error(
                  'UI did not return a valid root DOM element from getRootElement().'
                );
              }

              // Clear the container's element and append the new root element
              container.element.innerHTML = ''; // Clear any previous content (like loading/error messages)
              container.element.append(rootElement);
              logger.debug(
                'init',
                `Appended rootElement to container for ${componentType}.`
              );

              // Call onMount if it exists, now that the element is in the DOM via the container
              if (typeof uiProvider.onMount === 'function') {
                logger.debug(
                  'init',
                  `Calling uiProvider.onMount for ${componentType}...`
                );
                uiProvider.onMount(container, componentState); // Pass GL container and state
              } else {
                logger.debug(
                  'init',
                  `uiProvider.onMount is not a function for ${componentType}.`
                );
              }

              // GoldenLayout V2 doesn't strictly need a return from the factory
              // if the container.element is populated directly, which we've done.
              // Not returning uiProvider to be consistent with PanelManager's WrapperComponent.
            } catch (e) {
              log(
                'error',
                `[Init GL Factory] Error instantiating component ${componentType}:`,
                e
              );
              // Optionally, return a default error component UI to GL container
              container.element.innerHTML = `<div style="color: red; padding: 10px;">Error creating component: ${componentType}. ${e.message}</div>`;
              // We must not let the error propagate uncaught from here, or GL might break.
              // Golden Layout doesn't strictly require a return value from the factory if the class constructor handles the container directly.
            }
          }
        );
        logger.debug(
          'init',
          `Registered component factory wrapper for: ${componentType} from module ${factoryDetails.moduleId}`
        );
      } else {
        logger.error(
          'init',
          `Component factory for ${componentType} from module ${factoryDetails.moduleId} is not a function!`
        );
      }
    });

  // Helper function to get module ID from componentType
  const getModuleIdFromComponentType = (componentType) => {
    const panelComponents = centralRegistry.getAllPanelComponents();
    const componentDetails = panelComponents.get(componentType);
    return componentDetails ? componentDetails.moduleId : null;
  };

  // --- Function to filter layout content based on enabled modules ---
  function filterLayoutContent(content, isModuleEnabledFunc, getModuleIdFunc) {
    if (!Array.isArray(content)) {
      logger.warn(
        'init',
        'filterLayoutContent called with non-array content:',
        content
      );
      return content; // Should be an array, but handle gracefully
    }

    logger.debug(
      'init',
      '[filterLayoutContent] Starting to process content array of length:',
      content.length,
      JSON.stringify(content)
    );

    return content
      .map((item) => {
        if (!item || typeof item !== 'object') {
          logger.warn(
            'init',
            '[filterLayoutContent] Encountered invalid item:',
            item
          );
          return item; // Skip invalid items
        }
        logger.debug(
          'init',
          `[filterLayoutContent] Processing item: ${item.type} - ${
            item.title || item.componentType
          }`
        );

        if (item.type === 'component') {
          const moduleId = getModuleIdFunc(item.componentType);
          logger.debug(
            'init',
            `[filterLayoutContent] Item is component. Type: ${item.componentType}, Derived ModuleId: ${moduleId}`
          );

          // If moduleId is null (componentType not registered) OR if the module is found but not enabled, filter out.
          if (!moduleId || (moduleId && !isModuleEnabledFunc(moduleId))) {
            if (!moduleId) {
              logger.info(
                'init',
                `[filterLayoutContent] Filtering out component '${item.componentType}' because no module registered it (likely the owning module is disabled).`
              );
            } else {
              // This case is when moduleId is found, but isModuleEnabledFunc(moduleId) is false
              logger.info(
                'init',
                `[filterLayoutContent] Filtering out component '${item.componentType}' (module '${moduleId}') because module is disabled.`
              );
            }
            return null; // Remove component
          }
          // If moduleId is found AND module is enabled, keep it.
          // (No specific logging here, as keeping it is the default path if not filtered above)
        }
        // If item has its own content (e.g., stack, row, column), recursively filter it
        if (item.content && Array.isArray(item.content)) {
          logger.debug(
            'init',
            `[filterLayoutContent] Item '${item.type} - ${
              item.title || 'N/A'
            }' has children. Recursively filtering its content of length ${
              item.content.length
            }`
          );
          item.content = filterLayoutContent(
            item.content,
            isModuleEnabledFunc,
            getModuleIdFunc
          );
          logger.debug(
            'init',
            `[filterLayoutContent] Item '${item.type} - ${
              item.title || 'N/A'
            }' children filtered. New content length: ${item.content.length}`
          );
          // If a container item (stack, row, column) becomes empty after filtering, remove it
          if (
            item.content.length === 0 &&
            (item.type === 'stack' ||
              item.type === 'row' ||
              item.type === 'column')
          ) {
            logger.info(
              'init',
              `[filterLayoutContent] Filtering out empty container '${
                item.type
              }' (originally titled '${
                item.title || 'N/A'
              }') after its children were removed.`
            );
            return null;
          }
        }
        return item;
      })
      .filter((item) => item !== null); // Remove null entries
  }

  // --- Load Layout ---
  if (
    G_combinedModeData.layoutConfig &&
    typeof G_combinedModeData.layoutConfig === 'object'
  ) {
    logger.info(
      'init',
      'Attempting to load layout directly from G_combinedModeData.layoutConfig.'
    );
    try {
      // If layoutConfig is a preset collection (like layout_presets.json), select the active one.
      let layoutToLoad = G_combinedModeData.layoutConfig;
      const activeLayoutIdFromSettings = await settingsManager.getSetting(
        'activeLayout',
        'default'
      );
      if (G_combinedModeData.layoutConfig[activeLayoutIdFromSettings]) {
        // Check if it's a preset collection and ID exists
        logger.info(
          'init',
          `Using layout preset '${activeLayoutIdFromSettings}' from layoutConfig.`
        );
        layoutToLoad =
          G_combinedModeData.layoutConfig[activeLayoutIdFromSettings];
      } else if (
        activeLayoutIdFromSettings === 'custom' &&
        G_combinedModeData.layoutConfig.custom
      ) {
        logger.info('init', 'Using custom layout from layoutConfig.');
        layoutToLoad = G_combinedModeData.layoutConfig.custom;
      }

      // --- Filter the layoutToLoad based on enabled modules ---
      const isModuleEnabledFuncForLayout = (moduleId) => {
        const moduleState = runtimeModuleStates.get(moduleId);
        // Default to true if not in runtimeModuleStates, though it should be.
        // Consider a module enabled if it's present and not explicitly set to enabled: false.
        return moduleState ? moduleState.enabled !== false : true;
      };

      logger.debug(
        'init',
        'Full layoutToLoad BEFORE filtering:',
        JSON.stringify(layoutToLoad)
      );

      if (layoutToLoad && layoutToLoad.root && layoutToLoad.root.content) {
        logger.info(
          'init',
          'Filtering layout configuration (root.content) based on enabled modules...'
        );
        layoutToLoad.root.content = filterLayoutContent(
          layoutToLoad.root.content,
          isModuleEnabledFuncForLayout,
          getModuleIdFromComponentType
        );
        logger.info('init', 'Layout configuration (root.content) filtered.');
      } else if (layoutToLoad && Array.isArray(layoutToLoad.content)) {
        // Handle cases where layoutToLoad directly has a 'content' array (e.g. root is an array of items)
        logger.info(
          'init',
          'Filtering layout configuration (direct content array) based on enabled modules...'
        );
        layoutToLoad.content = filterLayoutContent(
          layoutToLoad.content,
          isModuleEnabledFuncForLayout,
          getModuleIdFromComponentType
        );
        logger.info(
          'init',
          'Layout configuration (direct content array) filtered.'
        );
      } else {
        logger.warn(
          'init',
          'LayoutToLoad does not have a recognized structure for filtering (root.content or direct content array). Skipping filtering.',
          layoutToLoad
        );
      }

      logger.debug(
        'init',
        'Full layoutToLoad AFTER filtering:',
        JSON.stringify(layoutToLoad)
      );

      // IMPORTANT: PanelManager must be initialized AFTER GoldenLayout has processed the layout
      // and created all initial components. The 'initialised' event is crucial.
      // log('info',
      //   '[Init DEBUG] About to call goldenLayoutInstance.loadLayout. Layout to load:',
      //   JSON.stringify(layoutToLoad)
      // );
      try {
        // Keep event listeners for diagnostics - Commenting out the verbose ones
        goldenLayoutInstance.on('started', () => {
          // Hide loading screen when Golden Layout starts
          hideLoadingScreen();
          
          // log('info',
          //   '[Init DEBUG] GoldenLayout "started" EVENT HANDLER ENTERED (PanelManager init no longer solely relies on this)'
          // );
          // If this event DOES fire, PanelManager might be re-initialized if it wasn't fully ready before.
          // This could be okay if PanelManager.initialize() is idempotent.
          if (!panelManagerInstance.isInitialized) {
            logger.info(
              'init',
              '"started" event: PanelManager not yet initialized, calling initialize.'
            ); // Kept as info
            panelManagerInstance.initialize(goldenLayoutInstance, null);
          } else {
            // logger.debug('init',
            //   '"started" event: PanelManager already initialized.'
            // );
          }
        });

        goldenLayoutInstance.on('initialised', () => {
          // log('info',
          //   '[Init DEBUG] GoldenLayout "initialised" (alternative) EVENT HANDLER ENTERED (PanelManager init no longer solely relies on this)'
          // );
          if (!panelManagerInstance.isInitialized) {
            logger.info(
              'init',
              '"initialised" event: PanelManager not yet initialized, calling initialize.'
            ); // Kept as info
            panelManagerInstance.initialize(goldenLayoutInstance, null);
          } else {
            // logger.debug('init',
            //   '"initialised" event: PanelManager already initialized.'
            // );
          }
        });
        // goldenLayoutInstance.on('itemCreated', (item) => {
        //   log('info',
        //     '[Init DEBUG] GoldenLayout "itemCreated" event:',
        //     item.componentType || item.type,
        //     item.id
        //   );
        // });
        // goldenLayoutInstance.on('stackCreated', (stack) => {
        //   log('info', '[Init DEBUG] GoldenLayout "stackCreated" event:', stack);
        // });
        // goldenLayoutInstance.on('rowCreated', (row) => {
        //   log('info', '[Init DEBUG] GoldenLayout "rowCreated" event:', row);
        // });
        // goldenLayoutInstance.on('columnCreated', (column) => {
        //   log('info',
        //     '[Init DEBUG] GoldenLayout "columnCreated" event:',
        //     column
        //   );
        // });

        goldenLayoutInstance.loadLayout(layoutToLoad);
        // log('info',
        //   '[Init DEBUG] goldenLayoutInstance.loadLayout call completed.'
        // );

        // Attempt to initialize PanelManager here, after loadLayout has been called
        // log('info',
        //   '[Init DEBUG] Attempting to initialize PanelManager immediately after loadLayout.'
        // );
        // log('info',
        //   '[Init DEBUG] goldenLayoutInstance before PanelManager init:',
        //   goldenLayoutInstance
        // );
        // if (goldenLayoutInstance && goldenLayoutInstance.root) {
        //   log('info',
        //     '[Init DEBUG] goldenLayoutInstance.root IS present before PanelManager init. ContentItems length:',
        //     goldenLayoutInstance.root.contentItems?.length
        //   );
        // } else {
        //   log('warn',
        //     '[Init DEBUG] goldenLayoutInstance.root IS NOT present before PanelManager init.'
        //   );
        // }
        panelManagerInstance.initialize(goldenLayoutInstance, null); // gameUIInstance is null
      } catch (loadLayoutError) {
        logger.error(
          'init',
          'CRITICAL ERROR during goldenLayoutInstance.loadLayout call or immediate PanelManager init:', // Kept as error
          loadLayoutError,
          loadLayoutError.stack
        );
      }
    } catch (error) {
      logger.error(
        'init',
        'Error loading layout from G_combinedModeData.layoutConfig. Falling back to default.',
        error
      );
      goldenLayoutInstance.loadLayout(getDefaultLayoutConfig()); // Fallback
    }
  } else {
    logger.warn(
      'init',
      'No valid layoutConfig found in G_combinedModeData. Attempting to use settings or default (old fallback path).'
    );
    const activeLayoutId =
      (await settingsManager.getSetting('activeLayout')) || 'default';
    await loadLayoutConfiguration(goldenLayoutInstance, activeLayoutId, null); // Pass null for customConfig as it should come from G_combinedModeData
  }

  logger.info('INIT_STEP', 'Golden Layout initialization completed');

  // --- Initialize Event Dispatcher ---
  logger.info('init', 'Initializing Event Dispatcher...');
  const getHandlersFunc = () => centralRegistry.getAllDispatcherHandlers();
  const getLoadPriorityFunc = () => modulesData?.loadPriority || [];
  const isModuleEnabledFunc = (moduleId) => {
    const moduleState = runtimeModuleStates.get(moduleId);
    return moduleState ? moduleState.enabled !== false : true;
  };
  try {
    dispatcher = new EventDispatcher(
      getHandlersFunc,
      getLoadPriorityFunc,
      isModuleEnabledFunc
    );
    // Make dispatcher globally available for counter access
    window.eventDispatcher = dispatcher;
    logger.info('init', 'Event Dispatcher initialized successfully.');
  } catch (error) {
    logger.error(
      'init',
      'CRITICAL: Failed to initialize Event Dispatcher!',
      error
    );
  }

  // Make G_combinedModeData globally available for modules that might need it
  // during their initialization or post-initialization phases, and before app:readyForUiDataLoad.
  window.G_combinedModeData = G_combinedModeData;
  logger.debug('init', 'window.G_combinedModeData has been set globally.');

  // --- Initialize Modules (Call .initialize() on each) ---
  const enabledModules = modulesData.loadPriority
    ? modulesData.loadPriority.filter(
        (moduleId) => runtimeModuleStates.get(moduleId)?.enabled
      )
    : [];

  logger.info(
    'init',
    `Starting initialization of ${enabledModules.length} modules...`
  );
  logger.info(
    'INIT_STEP',
    `Module initialization phase started (${enabledModules.length} modules)`
  );

  if (modulesData.loadPriority && Array.isArray(modulesData.loadPriority)) {
    for (const moduleId of modulesData.loadPriority) {
      if (runtimeModuleStates.get(moduleId)?.enabled) {
        // Check if module is enabled
        await _initializeSingleModule(
          moduleId,
          modulesData.loadPriority.indexOf(moduleId)
        );
      }
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

  // --- Post-Initialize Modules (Call .postInitialize() on each) ---
  const modulesWithPostInit = enabledModules.filter((moduleId) => {
    const moduleInstance = importedModules.get(moduleId);
    return (
      moduleInstance && typeof moduleInstance.postInitialize === 'function'
    );
  });

  logger.info(
    'init',
    `Starting post-initialization of ${modulesWithPostInit.length} modules...`
  );
  logger.info(
    'INIT_STEP',
    `Module post-initialization phase started (${modulesWithPostInit.length} modules)`
  );

  if (modulesData.loadPriority && Array.isArray(modulesData.loadPriority)) {
    for (const moduleId of modulesData.loadPriority) {
      if (runtimeModuleStates.get(moduleId)?.enabled) {
        // Check if module is enabled
        await _postInitializeSingleModule(moduleId);
      }
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

  // --- Finalize Module Manager API ---
  // Populate the moduleManagerApi with its methods now that modules are loaded and runtime states exist.
  // This assumes moduleManagerApi is an empty object initially and we add properties to it.
  moduleManagerApi.enableModule = async (moduleId) => {
    const state = runtimeModuleStates.get(moduleId);
    const moduleDefinition =
      G_combinedModeData.moduleConfig?.moduleDefinitions?.[moduleId];

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
        const moduleInstance = await import(moduleDefinition.path);
        const moduleFileName = moduleDefinition.path.split('/').pop() || moduleDefinition.path;
        incrementFileCounter(`${moduleId} (${moduleFileName})`); // Increment counter for dynamic module import
        actualModuleObject = moduleInstance.default || moduleInstance; // Assign here
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

          // --- BEGIN NEW CODE: Register components with Golden Layout ---
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
            logger.error(
              'init',
              '[Dynamic Enable] window.goldenLayoutInstance not available to register new components.'
            );
          }
          // --- END NEW CODE ---
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
      actualModuleObject = importedModules.get(moduleId); // Get existing module object
    }

    if (state) {
      state.enabled = true;
    } else {
      runtimeModuleStates.set(moduleId, { initialized: false, enabled: true });
    }
    logger.info('init', `Enabling module: ${moduleId}`);

    try {
      const loadPriorityArray =
        G_combinedModeData.moduleConfig?.loadPriority || [];
      let originalIndex = loadPriorityArray.indexOf(moduleId);
      if (originalIndex === -1) {
        // Module might be entirely new (not in original loadPriority) if dynamically added post-initial load.
        // Or it was disabled initially. In either case, find its definition.
        const moduleDef =
          G_combinedModeData.moduleConfig?.moduleDefinitions?.[moduleId];
        if (moduleDef && typeof moduleDef.loadPriority === 'number') {
          originalIndex = moduleDef.loadPriority; // Use priority from its definition if available
          logger.info(
            'init',
            `Using loadPriority ${originalIndex} from module definition for ${moduleId}.`
          );
        } else {
          logger.warn(
            'init',
            `Could not find original load priority index for ${moduleId} (might be a dynamically added/enabled module without explicit priority in definition). Using -1.`
          );
          originalIndex = -1;
        }
      }

      logger.debug(
        'init',
        `Calling _initializeSingleModule for ${moduleId} with index ${originalIndex}`
      );
      await _initializeSingleModule(moduleId, originalIndex);

      // Use actualModuleObject obtained earlier
      if (
        actualModuleObject &&
        typeof actualModuleObject.postInitialize === 'function'
      ) {
        logger.debug('init', `Calling postInitialize for ${moduleId}`);
        await _postInitializeSingleModule(moduleId);
      }

      const componentType = centralRegistry.getComponentTypeForModule(moduleId);
      // Use actualModuleObject for moduleInfo
      const titleFromInfo =
        actualModuleObject?.moduleInfo?.name ||
        actualModuleObject?.moduleInfo?.title;
      const panelTitle = titleFromInfo || moduleId;

      if (componentType && panelManagerInstance) {
        logger.debug(
          'init',
          `Re-adding panel for ${moduleId}. Type: ${componentType}, Title: ${panelTitle}`
        );
        await panelManagerInstance.createPanelForComponent(
          componentType,
          panelTitle
        );
        logger.debug(
          'init',
          `Panel for ${moduleId} should have been re-added/focused.`
        );
      } else {
        if (!componentType) {
          logger.warn(
            'init',
            `Cannot re-add panel for ${moduleId}: No componentType found in centralRegistry. Module might not have a UI or failed registration.`
          );
        }
        if (!panelManagerInstance) {
          logger.warn(
            'init',
            `Cannot re-add panel for ${moduleId}: panelManagerInstance (imported) not available.`
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

    // ADDED: Dispatch rehome event after enabling a module and its panel is potentially ready
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
  moduleManagerApi.disableModule = async (moduleId) => {
    logger.info('init', `Attempted to disable ${moduleId}`);
    const moduleState = runtimeModuleStates.get(moduleId);
    if (moduleState) {
      moduleState.enabled = false;
      eventBus.publish('module:stateChanged', {
        moduleId,
        enabled: false,
      }, 'core'); // Ensure consistent payload

      // Get componentType from centralRegistry
      const componentType = centralRegistry.getComponentTypeForModule(moduleId);
      let panelActionTaken = false; // Flag to track if panel was affected
      if (componentType) {
        logger.debug(
          'init',
          `Closing panel for disabled module ${moduleId} (Component Type: ${componentType})`
        );

        // --- BEGIN DIAGNOSTIC LOGS (modified) ---
        // log('info',
        //   '[ModuleManagerAPI DEBUG] Inspecting panelManagerInstance before call:'
        // );
        // log('info',
        //   '[ModuleManagerAPI DEBUG] typeof panelManagerInstance:',
        //   typeof panelManagerInstance
        // );
        // if (panelManagerInstance) {
        //   log('info',
        //     '[ModuleManagerAPI DEBUG] panelManagerInstance content:',
        //     panelManagerInstance
        //   );
        //   if (
        //     typeof panelManagerInstance.destroyPanelByComponentType ===
        //     'function'
        //   ) {
        //     log('info',
        //       '[ModuleManagerAPI DEBUG] panelManagerInstance.destroyPanelByComponentType IS a function.'
        //     );
        //     log('info',
        //       '[ModuleManagerAPI DEBUG] Source code of panelManagerInstance.destroyPanelByComponentType:'
        //     );
        //     log('info',
        //       panelManagerInstance.destroyPanelByComponentType.toString()
        //     );
        //   } else {
        //     log('error',
        //       '[ModuleManagerAPI DEBUG] panelManagerInstance.destroyPanelByComponentType IS NOT a function. Type:',
        //       typeof panelManagerInstance.destroyPanelByComponentType
        //     );
        //   }
        // } else {
        //   log('error',
        //     '[ModuleManagerAPI DEBUG] panelManagerInstance (imported) IS UNDEFINED OR NULL.'
        //   );
        // }
        // --- END DIAGNOSTIC LOGS ---

        if (
          panelManagerInstance &&
          typeof panelManagerInstance.destroyPanelByComponentType === 'function'
        ) {
          panelManagerInstance.destroyPanelByComponentType(componentType);
          panelActionTaken = true; // Panel destruction was attempted
        } else {
          logger.error(
            'init',
            'CRITICAL: Cannot call destroyPanelByComponentType - panelManagerInstance (imported) or the method is invalid.'
          );
        }
      } else {
        logger.warn(
          'init',
          `Module ${moduleId} has no registered panel component type. Cannot close panel.`
        );
      }

      // ADDED: Dispatch rehome event if module was disabled (especially if its panel was closed)
      // Dispatch regardless of panelActionTaken for now, as disabling a non-UI module could theoretically affect hosting viability
      // in a more complex system, though not directly in our current TimerUI case.
      // Keeping it simple: if a module is disabled, re-evaluate timer hosting.
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

      // TODO: Call module's uninitialize if it exists?
      // This needs careful consideration regarding state and re-initialization.
      // if (importedModules[moduleId] && typeof importedModules[moduleId].uninitialize === 'function') {
      //   try {
      //     await importedModules[moduleId].uninitialize();
      //     log('info', `[ModuleManagerAPI] Uninitialized module: ${moduleId}`);
      //   } catch (error) {
      //     log('error', `[ModuleManagerAPI] Error uninitializing module ${moduleId}:`, error);
      //   }
      // }
    }
  };
  moduleManagerApi.getModuleState = (moduleId) =>
    runtimeModuleStates.get(moduleId);
  moduleManagerApi.getAllModuleStates = () => {
    const states = {};
    for (const [moduleId, state] of runtimeModuleStates.entries()) {
      const moduleInstance = importedModules.get(moduleId);
      states[moduleId] = {
        ...state, // { initialized, enabled }
        definition: moduleInstance?.moduleInfo || {
          name: moduleId,
          description:
            'Definition N/A - Module not fully loaded or moduleInfo missing.',
        },
        // path: moduleInstance?.path || 'N/A', // Path might not be readily available here
        // isExternal: moduleInstance?.isExternal || false // isExternal might not be readily available here
      };
    }
    return states;
  };
  moduleManagerApi.getLoadPriority = () =>
    G_combinedModeData.moduleConfig?.loadPriority || [];
  moduleManagerApi.getModuleManagerApi = () => moduleManagerApi; // Provide itself
  // Add other methods as needed: getCurrentLoadPriority, etc.
  moduleManagerApi.getCurrentLoadPriority = async () => {
    // Made async to match EventsUI expectation
    return G_combinedModeData.moduleConfig?.loadPriority || [];
  };

  logger.info('init', 'ModuleManagerAPI populated.');

  // ADDED: Listen for panels being closed manually to disable their modules
  eventBus.subscribe('ui:panelManuallyClosed', ({ moduleId }) => {
    if (!moduleId) return;

    const moduleState = runtimeModuleStates.get(moduleId);
    // Only disable if it's currently considered enabled by the module manager
    if (moduleState && moduleState.enabled !== false) {
      // Check if it's not already marked as disabled
      logger.debug(
        'init',
        `Received event for moduleId: ${moduleId}. ` +
          `Panel closed by user. Updating module state to disabled.`
      );
      moduleState.enabled = false;
      eventBus.publish('module:stateChanged', { moduleId, enabled: false }, 'core');
      // The panel is already destroyed by GoldenLayout.
      // The rehome dispatch is handled by the panel's own destroy/dispose handler.
      // No need to call moduleManagerApi.disableModule() here, as that would try to destroy the panel again.
    } else if (moduleState && moduleState.enabled === false) {
      logger.debug(
        'init',
        `Module ${moduleId} was already marked as disabled. No state change needed.`
      );
    } else {
      // Catches moduleState being null or undefined
      logger.warn(
        'init',
        `Runtime state for module ${moduleId} not found. Cannot update state.`
      );
    }
  }, 'core');

  // Publish an event indicating that the modes.json has been loaded and processed
  // This allows modules that depend on mode configurations (e.g., for UI elements)
  if (G_modesConfig) {
    logger.info('init', 'Publishing app:modesJsonLoaded event.');
    eventBus.publish('app:modesJsonLoaded', { modesConfig: G_modesConfig }, 'core');
  } else {
    logger.warn(
      'init',
      'G_modesConfig not available when attempting to publish app:modesJsonLoaded. This might indicate an issue.'
    );
    // Still publish, but with a potentially empty or default config if G_modesConfig was truly not set
    eventBus.publish('app:modesJsonLoaded', {
      modesConfig: G_modesConfig || {},
    }, 'core');
  }

  // Make G_combinedModeData globally available BEFORE app:readyForUiDataLoad
  // so UI components can access it directly during their initialization if needed.
  window.G_combinedModeData = G_combinedModeData;
  logger.debug('init', 'window.G_combinedModeData has been set.');

  // Signal that core systems are up, modules are initialized,
  // and UI components can now safely fetch initial data (like from StateManager)
  logger.info('init', 'Publishing app:readyForUiDataLoad event...');
  eventBus.publish('app:readyForUiDataLoad', {
    getModuleManager: () => moduleManagerApi,
  }, 'core');

  // ADDED: Dispatch initial timer rehoming event
  // This is done with a timeout to allow app:readyForUiDataLoad handlers (e.g., UI panel creation)
  // to complete their immediate synchronous setup before the rehoming logic runs.
  setTimeout(() => {
    if (dispatcher) {
      // Ensure dispatcher is initialized (should be by now)
      logger.debug('init', 'Dispatching initial system:rehomeTimerUI event.');
      dispatcher.publish(
        'core', // Origin module ID
        'system:rehomeTimerUI', // Event name
        {}, // Event data (empty for now, can be extended if needed)
        { initialTarget: 'top' } // Dispatch options: start from highest priority module
      );
    } else {
      logger.error(
        'init',
        'Cannot dispatch system:rehomeTimerUI, dispatcher not available.'
      );
    }
  }, 0); // Zero timeout defers to the next event loop tick

  // Make other core instances globally available for debugging (optional)
  window.G_currentActiveMode = G_currentActiveMode;
  window.G_modesConfig = G_modesConfig;
  window.settingsManager = settingsManager;
  window.eventBus = eventBus;
  window.panelManager = panelManagerInstance;
  window.goldenLayoutInstance = goldenLayoutInstance;
  window.moduleManagerApi = moduleManagerApi;

  logger.info('init', 'Modular application initialization complete.');

  // Fallback: Hide loading screen after initialization is complete if it's still visible
  // This ensures the loading screen disappears even if Golden Layout events don't fire
  setTimeout(() => {
    hideLoadingScreen();
  }, 500);

  // After all modules are ready and UI might be listening,
  // publish the final active mode.
  logger.info(
    'init',
    `Publishing app:activeModeDetermined with mode: ${G_currentActiveMode}`
  );
  eventBus.publish('app:activeModeDetermined', {
    activeMode: G_currentActiveMode,
  }, 'core');

  // Check for panel URL parameter to activate a specific panel after everything is loaded
  const panelParam = urlParams.get('panel');
  if (panelParam) {
    // Use a timeout to ensure all event handlers have processed and panels are ready
    setTimeout(() => {
      logger.info('init', `Activating panel from URL parameter: ${panelParam}`);
      
      // Try to activate the panel using panelManager
      if (panelManagerInstance && typeof panelManagerInstance.activatePanel === 'function') {
        panelManagerInstance.activatePanel(panelParam);
        logger.info('init', `Panel activation request sent for: ${panelParam}`);
      } else {
        // Fallback: publish the activation event
        logger.info('init', `Using event bus to activate panel: ${panelParam}`);
        eventBus.publish('ui:activatePanel', { panelId: panelParam }, 'core');
      }
    }, 1500); // 1.5 second delay to ensure all initialization is complete
  }

  // Attach a global listener for files:jsonLoaded to update rules in StateManager
  eventBus.subscribe('files:jsonLoaded', async (eventData) => {
    logger.info(
      'init',
      'files:jsonLoaded event RECEIVED. Full eventData:',
      JSON.parse(JSON.stringify(eventData)) // Log a deep copy
    );
    if (
      eventData &&
      eventData.jsonData &&
      eventData.selectedPlayerId !== undefined
    ) {
      logger.info(
        'init',
        `files:jsonLoaded: Valid data. jsonData keys: ${Object.keys(
          eventData.jsonData
        ).join(', ')}, PlayerID: ${
          eventData.selectedPlayerId
        }. Calling stateManager.loadRules.`
      );
      try {
        G_combinedModeData.rulesConfig = eventData.jsonData;
        logger.info(
          'init',
          'files:jsonLoaded: G_combinedModeData.rulesConfig updated.'
        );

        const playerInfo = eventData.playerInfo || {
          playerName: `Player${eventData.selectedPlayerId}`,
        };

        // Dynamic import to avoid early logging during module import
        const { stateManagerProxySingleton } = await import(
          './modules/stateManager/index.js'
        );
        incrementFileCounter('stateManager (index.js)'); // Increment counter for state manager import
        await stateManagerProxySingleton.loadRules(
          eventData.jsonData,
          {
            playerId: String(eventData.selectedPlayerId),
            playerName: playerInfo.playerName,
          },
          eventData.source || eventData.filename || 'userLoadedFile'
        ); // Pass source, fallback to filename or generic
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

// Start the initialization process
main();
