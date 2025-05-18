// init.js - Initialization script for the modular frontend

// Core Singletons/Managers
import panelManagerInstance from './app/core/panelManager.js';
import eventBus from './app/core/eventBus.js';
import settingsManager from './app/core/settingsManager.js';
import { centralRegistry } from './app/core/centralRegistry.js';
import EventDispatcher from './app/core/eventDispatcher.js';
import { GoldenLayout } from './libs/golden-layout/js/esm/golden-layout.js';
import { stateManagerProxySingleton } from './modules/stateManager/index.js';

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
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`${errorMessage}: ${url}`, error);
    return null; // Return null to indicate failure
  }
}

function getDefaultLayoutConfig() {
  // Define a fallback default layout configuration
  console.warn('Using hardcoded default layout configuration.');
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
    console.log('[Init] Active layout is custom.');
    chosenLayoutConfig = customConfig;
  } else if (
    typeof activeLayoutId === 'string' &&
    layoutPresets[activeLayoutId]
  ) {
    console.log(`[Init] Active layout is preset: ${activeLayoutId}`);
    chosenLayoutConfig = layoutPresets[activeLayoutId];
  } else {
    console.log(
      `[Init] Active layout '${activeLayoutId}' not found or invalid, trying custom config.`
    );
    // Fallback to custom config if available, otherwise use hardcoded default
    chosenLayoutConfig = customConfig || getDefaultLayoutConfig();
    if (!customConfig) {
      console.log('[Init] No custom layout found, using hardcoded default.');
    }
  }

  // If after all checks, we still don't have a config, use the hardcoded default
  if (!chosenLayoutConfig) {
    console.warn(
      '[Init] No valid layout configuration determined, falling back to hardcoded default.'
    );
    chosenLayoutConfig = getDefaultLayoutConfig();
  }

  // Load the chosen layout
  console.log('[Init] Loading layout configuration into Golden Layout...');
  // Assuming V2 loadLayout. Adjust if needed for V1 'load'.
  layoutInstance.loadLayout(chosenLayoutConfig);
}
// +++ End restored function +++

// --- Helper function to create the standard Initialization API ---
function createInitializationApi(moduleId) {
  // Note: dispatcher and centralRegistry need to be available in the outer scope
  console.log(`[API Factory] Creating API for module: ${moduleId}`);
  // console.log('[API Factory] settingsManager:', settingsManager); // Reduce log noise
  // console.log('[API Factory] dispatcher:', dispatcher); // Reduce log noise

  return {
    getModuleSettings: async () => settingsManager.getModuleSettings(moduleId),
    getDispatcher: () => ({
      publish: dispatcher.publish.bind(dispatcher),
      publishToNextModule: dispatcher.publishToNextModule.bind(dispatcher),
    }),
    getEventBus: () => eventBus,
    getModuleFunction: (targetModuleId, functionName) => {
      return centralRegistry.getPublicFunction(targetModuleId, functionName);
    },
    getModuleManager: () => moduleManagerApi, // Provide the manager API itself
    getAllSettings: async () => {
      // console.log(`[API Factory] ${moduleId} calling getAllSettings...`); // Reduce log noise
      try {
        const allSettings = await settingsManager.getSettings();
        // console.log(
        //   `[API Factory] ${moduleId} received allSettings:`,
        //   allSettings
        // );
        return allSettings;
      } catch (error) {
        console.error(
          `[API Factory] Error in getAllSettings called by ${moduleId}:`,
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
      console.log(
        `[Init Helper] Initializing module: ${moduleId} (Priority ${index})`
      );
      await moduleInstance.initialize(moduleId, index, api);
      runtimeModuleStates.get(moduleId).initialized = true; // Mark as initialized
    } catch (error) {
      console.error(
        `[Init Helper] Error during initialization of module: ${moduleId}`,
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
    try {
      console.log(`[Init Helper] Post-initializing module: ${moduleId}`);
      // Special handling for stateManager postInitialize to pass mode-specific data
      if (moduleId === 'stateManager') {
        const resolvedSettings = await settingsManager.getSettings();
        const smInitialConfig = {
          rulesConfig: G_combinedModeData.rulesConfig,
          playerId: G_combinedModeData.userSettings.playerId || '1',
          settings: resolvedSettings,
        };
        console.log(
          '[Init Helper] Passing smInitialConfig to stateManager.postInitialize:',
          smInitialConfig
        );
        await moduleInstance.postInitialize(api, smInitialConfig);
      } else if (moduleInstance.postInitialize) {
        await moduleInstance.postInitialize(api); // Other modules get just the api
      }
    } catch (error) {
      console.error(
        `[Init Helper] Error during post-initialization of module: ${moduleId}`,
        error
      );
      // Potentially mark as failed and disable?
      runtimeModuleStates.get(moduleId).enabled = false;
    }
  }
}

// --- Mode Management Functions ---
async function determineActiveMode() {
  console.log('[Init] Determining active mode...');
  const urlParams = new URLSearchParams(window.location.search);
  const explicitMode = urlParams.get('mode'); // Get explicitMode first

  // Case 1: ?mode=reset (special reset keyword)
  if (explicitMode === 'reset') {
    console.log(
      '[Init] "?mode=reset" detected. Applying reset: loading "default" files, clearing last active mode and "default" mode data.'
    );
    G_currentActiveMode = 'default';
    G_skipLocalStorageLoad = true; // Ensure we load files, not from a potentially stored "reset" mode
    try {
      localStorage.removeItem(G_LOCAL_STORAGE_LAST_ACTIVE_MODE_KEY);
      localStorage.removeItem(G_LOCAL_STORAGE_MODE_PREFIX + 'default'); // Clear default mode's saved data specifically
      console.log(
        '[Init] Cleared last active mode and "default" mode data from localStorage for mode=reset.'
      );
    } catch (e) {
      console.error('[Init] Error clearing localStorage during mode=reset:', e);
    }
    return; // Exit early: "default" is set for loading, "reset" is not saved as lastActiveMode
  }

  // Case 2: ?reset=true (generic reset flag, possibly with ?mode=someOtherMode)
  // explicitMode here is NOT 'reset' due to the check above.
  const resetFlag = urlParams.get('reset') === 'true';
  if (resetFlag) {
    const modeToLoadDefaultsFor = explicitMode || 'default';
    console.log(
      `[Init] "?reset=true" detected. Applying reset: loading "${modeToLoadDefaultsFor}" files, clearing last active mode and data for "${modeToLoadDefaultsFor}".`
    );
    G_currentActiveMode = modeToLoadDefaultsFor;
    G_skipLocalStorageLoad = true;
    try {
      localStorage.removeItem(G_LOCAL_STORAGE_LAST_ACTIVE_MODE_KEY);
      // Clear data for the specific mode being reset TO
      localStorage.removeItem(
        G_LOCAL_STORAGE_MODE_PREFIX + modeToLoadDefaultsFor
      );
      console.log(
        `[Init] Cleared last active mode and "${modeToLoadDefaultsFor}" mode data from localStorage for reset=true.`
      );
    } catch (e) {
      console.error(
        `[Init] Error clearing localStorage for mode "${modeToLoadDefaultsFor}" during reset=true:`,
        e
      );
    }
    return; // Exit early: modeToLoadDefaultsFor is set for loading, not saved as lastActiveMode immediately.
  }

  // Case 3: Standard mode determination (no "mode=reset" and no "reset=true")
  // At this point, explicitMode is not "reset", and resetFlag is false.
  if (explicitMode) {
    console.log(`[Init] Mode specified in URL: "${explicitMode}".`);
    G_currentActiveMode = explicitMode;
  } else {
    try {
      const lastActiveMode = localStorage.getItem(
        G_LOCAL_STORAGE_LAST_ACTIVE_MODE_KEY
      );
      if (lastActiveMode) {
        console.log(
          `[Init] Loaded last active mode from localStorage: "${lastActiveMode}".`
        );
        G_currentActiveMode = lastActiveMode;
      } else {
        console.log(
          '[Init] No last active mode in localStorage. Using default: "default".'
        );
        G_currentActiveMode = 'default'; // Default if nothing else is found
      }
    } catch (e) {
      console.error(
        '[Init] Error reading last active mode from localStorage. Using default.',
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
    console.log(
      `[Init] Saved current active mode to localStorage: "${G_currentActiveMode}".`
    );
  } catch (e) {
    console.error('[Init] Error saving last active mode to localStorage.', e);
  }
}

async function loadModesConfiguration() {
  console.log('[Init] Loading modes configuration (modes.json)...');
  try {
    const modesFileContent = await fetchJson(
      './modes.json',
      'Error loading modes.json'
    );
    if (modesFileContent) {
      G_modesConfig = modesFileContent;
      console.log('[Init] Successfully loaded and parsed modes.json.');
    } else {
      console.error(
        '[Init] modes.json could not be loaded or is empty. Proceeding with minimal default mode config.'
      );
      G_modesConfig = {
        default: {
          moduleConfig: { path: './modules.json', enabled: true },
          rulesConfig: { path: './default_rules.json', enabled: true },
          layoutConfig: { path: './layout_presets.json', enabled: true },
          userSettings: { path: './settings.json', enabled: true },
        },
      };
    }
  } catch (error) {
    console.error(
      '[Init] Critical error loading modes.json. Using hardcoded fallback.',
      error
    );
    G_modesConfig = {
      // Fallback to a minimal default if fetchJson itself throws for modes.json
      default: {
        moduleConfig: { path: './modules.json', enabled: true },
        rulesConfig: { path: './default_rules.json', enabled: true },
        layoutConfig: { path: './layout_presets.json', enabled: true },
        userSettings: { path: './settings.json', enabled: true },
      },
    };
  }
}

async function loadCombinedModeData() {
  console.log(
    `[Init] Loading combined data for mode: "${G_currentActiveMode}". Skip localStorage: ${G_skipLocalStorageLoad}`
  );

  let baseCombinedData = { modeName: G_currentActiveMode };

  // --- Step 1: Load Base from LocalStorage (if applicable) ---
  if (!G_skipLocalStorageLoad) {
    try {
      const storedModeDataString = localStorage.getItem(
        G_LOCAL_STORAGE_MODE_PREFIX + G_currentActiveMode
      );
      if (storedModeDataString) {
        const parsedData = JSON.parse(storedModeDataString);
        if (
          parsedData &&
          typeof parsedData === 'object' &&
          parsedData.modeName === G_currentActiveMode
        ) {
          baseCombinedData = parsedData; // Use this as the base
          console.log(
            `[Init] Successfully set baseCombinedData for mode "${G_currentActiveMode}" from localStorage.`
          );
        } else if (parsedData && parsedData.modeName !== G_currentActiveMode) {
          console.warn(
            `[Init] Mode name in localStorage data ("${parsedData.modeName}") does not match current active mode ("${G_currentActiveMode}"). Will load all configs from files.`
          );
          baseCombinedData = { modeName: G_currentActiveMode }; // Reset to ensure file loading for all parts
        } else {
          console.warn(
            `[Init] Data for mode "${G_currentActiveMode}" in localStorage was invalid. Will load all configs from files.`
          );
          baseCombinedData = { modeName: G_currentActiveMode }; // Reset
        }
      } else {
        console.log(
          `[Init] No data for mode "${G_currentActiveMode}" in localStorage. Will load all configs from files.`
        );
      }
    } catch (e) {
      console.error(
        `[Init] Error reading/parsing localStorage for "${G_currentActiveMode}". Will load all configs from files.`,
        e
      );
      baseCombinedData = { modeName: G_currentActiveMode }; // Reset
    }
  }

  // --- Step 2: Define Core Keys and Handlers ---
  const coreConfigKeys = [
    'moduleConfig',
    'rulesConfig',
    'layoutConfig',
    'userSettings',
  ];
  const hardcodedFilePaths = {
    moduleConfig: './modules.json',
    rulesConfig: './default_rules.json',
    layoutConfig: './layout_presets.json',
    userSettings: './settings.json',
  };
  // Get registered module data handlers
  const registeredHandlers = centralRegistry.getAllJsonDataHandlers();
  const allDataKeys = [...coreConfigKeys, ...registeredHandlers.keys()];

  // --- Step 3: Layered Loading for Each Data Key ---
  const getConfigPath = (mode, key) => G_modesConfig[mode]?.[key]?.path;
  let loadedAnyFile = false;
  let usedDefaultPathsForAllFileLoads = true; // Assume true initially if we load any file

  for (const dataKey of allDataKeys) {
    // Check validity: layoutConfig needs special check, others just need to exist.
    const isLayout = dataKey === 'layoutConfig';
    const isValidInBase = isLayout
      ? isValidLayoutObject(baseCombinedData[dataKey])
      : baseCombinedData[dataKey] !== undefined;

    if (isValidInBase) {
      console.log(
        `[Init] Using ${dataKey} for "${G_currentActiveMode}" from initially loaded/parsed baseCombinedData.`
      );
      // If we use any data from localStorage, not all file loads could have been default paths
      if (baseCombinedData.savedTimestamp) {
        // Check if base came from localStorage
        usedDefaultPathsForAllFileLoads = false;
      }
      continue; // Already have a good value
    }

    // --- Attempt to load from files ---
    loadedAnyFile = true;
    console.log(
      `[Init] ${dataKey} for "${G_currentActiveMode}" is missing or invalid in baseCombinedData. Attempting to load from files.`
    );

    let valueToSet = undefined; // Use undefined to clearly signal not loaded
    let path;
    let loadedFromSpecificModeFile = false;

    // Layer 1: Try current mode from modes.json
    path = getConfigPath(G_currentActiveMode, dataKey);
    if (path) {
      valueToSet = await fetchJson(
        path,
        `Error loading ${dataKey} for mode ${G_currentActiveMode} from ${path}`
      );
      if (valueToSet !== undefined) {
        console.log(
          `[Init] Loaded ${dataKey} for "${G_currentActiveMode}" from file: ${path}.`
        );
        loadedFromSpecificModeFile = true;
        usedDefaultPathsForAllFileLoads = false; // Loaded from specific mode file
      }
    }

    // Layer 2: Try 'default' mode from modes.json if not found for current mode
    if (valueToSet === undefined && G_currentActiveMode !== 'default') {
      path = getConfigPath('default', dataKey);
      if (path) {
        valueToSet = await fetchJson(
          path,
          `Error loading ${dataKey} for default mode from ${path}`
        );
        if (valueToSet !== undefined) {
          console.log(
            `[Init] Loaded ${dataKey} using 'default' mode's file path: ${path}.`
          );
          // usedDefaultPathsForAllFileLoads remains true if this is the first file load path hit
        }
      }
    }

    // Layer 3: Try hardcoded file path if still not found (only for core keys)
    if (valueToSet === undefined && coreConfigKeys.includes(dataKey)) {
      path = hardcodedFilePaths[dataKey];
      if (path) {
        valueToSet = await fetchJson(
          path,
          `Error loading ${dataKey} from hardcoded default path ${path}`
        );
        if (valueToSet !== undefined) {
          console.log(
            `[Init] Loaded ${dataKey} using hardcoded file path: ${path}.`
          );
          // usedDefaultPathsForAllFileLoads remains true if this is the first file load path hit
        }
      }
    }

    // Final assignment and critical error logging
    if (valueToSet !== undefined) {
      baseCombinedData[dataKey] = valueToSet;
    } else {
      // Only critical for core keys? Module data might be optional.
      const isCritical = coreConfigKeys.includes(dataKey);
      const logLevel = isCritical ? 'error' : 'warn'; // Use warn for non-core data
      console[logLevel](
        `[Init] ${
          isCritical ? 'CRITICAL: ' : ''
        }Failed to load ${dataKey} for "${G_currentActiveMode}" after all fallbacks.`
      );
      // Provide default only for layoutConfig if critical, otherwise null/undefined
      baseCombinedData[dataKey] =
        isLayout && isCritical ? getDefaultLayoutConfig() : null;
    }
  }

  // --- Step 4: Final Adjustments and Assignment ---
  // Adjust G_currentActiveMode if G_currentActiveMode is not 'default', was not found in modes.json,
  // and we loaded at least one file, and all files loaded came from default paths (not specific mode paths).
  if (
    G_currentActiveMode !== 'default' &&
    !G_modesConfig[G_currentActiveMode] &&
    loadedAnyFile &&
    usedDefaultPathsForAllFileLoads
  ) {
    console.warn(
      `[Init] Mode "${G_currentActiveMode}" was not in modes.json and all file configurations were sourced from default paths. Switching active mode to "default".`
    );
    G_currentActiveMode = 'default';
    baseCombinedData.modeName = 'default'; // Ensure modeName in the object is also updated
  }

  G_combinedModeData = baseCombinedData;
  console.log(
    '[Init] Final G_combinedModeData after potential merging:',
    JSON.parse(JSON.stringify(G_combinedModeData)) // Log a deep copy for safety
  );

  // Critical config check
  if (
    G_combinedModeData.layoutConfig &&
    typeof G_combinedModeData.layoutConfig === 'object' &&
    !isValidLayoutObject(G_combinedModeData.layoutConfig)
  ) {
    console.error(
      '[Init] CRITICAL: layoutConfig is not a valid layout object or preset collection. Cannot load essential configs.'
    );
    G_combinedModeData.moduleConfig = null;
    G_combinedModeData.rulesConfig = null;
    G_combinedModeData.layoutConfig = null;
    G_combinedModeData.userSettings = null;
    return;
  }
}
// --- End Mode Management Functions ---

// --- Main Initialization Logic ---
async function main() {
  console.log('[Init] Starting main initialization...');

  // --- Make sure DOM is ready ---
  if (document.readyState === 'loading') {
    console.log('[Init] Document is loading, deferring main execution.');
    document.addEventListener('DOMContentLoaded', main);
    return;
  }
  console.log('[Init] DOM content fully loaded and parsed.');

  // Determine active mode first
  await determineActiveMode();
  console.log(
    `[Init] Effective active mode for this session: "${G_currentActiveMode}"`
  );
  console.log(
    `[Init] Skip localStorage load for mode data: ${G_skipLocalStorageLoad}`
  );

  // Load modes.json configuration
  await loadModesConfiguration();

  // Load all data for the current mode (from localStorage or defaults)
  await loadCombinedModeData();

  // Initialize settings manager with mode-specific settings
  if (G_combinedModeData.userSettings) {
    // Assuming settingsManager has a method like setInitialSettings or can be adapted.
    // This is a placeholder for actual integration with settingsManager's API.
    console.log(
      '[Init] G_combinedModeData.userSettings BEFORE calling setInitialSettings:',
      JSON.parse(JSON.stringify(G_combinedModeData.userSettings))
    );
    if (typeof settingsManager.setInitialSettings === 'function') {
      settingsManager.setInitialSettings(G_combinedModeData.userSettings);
      console.log(
        '[Init] Passed mode-specific settings to settingsManager via setInitialSettings.'
      );
    } else {
      // Fallback: Attempt to directly use the settings for initialization if ensureLoaded handles it.
      // This depends on settingsManager.ensureLoaded() being able to use pre-loaded settings.
      // We might need to modify settingsManager to accept G_combinedModeData.userSettings directly.
      console.warn(
        '[Init] settingsManager.setInitialSettings not found. Ensure settingsManager.ensureLoaded() can use pre-configured settings if G_combinedModeData.userSettings is to be effective immediately.'
      );
    }
  }
  // ensureLoaded might use the settings provided above, or load its defaults if none were provided/applicable.
  await settingsManager.ensureLoaded();
  console.log('[Init] settingsManager initialization process completed.');

  // Use module configuration from combined data
  const modulesData = G_combinedModeData.moduleConfig;
  if (
    !modulesData ||
    !modulesData.moduleDefinitions ||
    !modulesData.loadPriority
  ) {
    console.error(
      '[Init] CRITICAL: Module configuration is missing, malformed, or incomplete. Expected moduleDefinitions (as an object of modules) and loadPriority. Halting.',
      modulesData
    );
    return;
  }
  console.log(
    '[Init] Using module configuration from combined mode data.',
    modulesData
  );

  // --- Dynamically Import and Register Modules ---
  console.log('[Init] Starting module import and registration phase...');
  runtimeModuleStates.clear();
  importedModules.clear();

  for (const moduleId of modulesData.loadPriority) {
    const moduleDefinition = modulesData.moduleDefinitions[moduleId];
    if (moduleDefinition && moduleDefinition.enabled) {
      console.log(
        `[Init] Processing module: ${moduleId} from ${moduleDefinition.path}`
      );
      runtimeModuleStates.set(moduleId, { initialized: false, enabled: true });
      try {
        const moduleInstance = await import(moduleDefinition.path);
        importedModules.set(moduleId, moduleInstance.default || moduleInstance);
        console.log(`[Init] Dynamically imported module: ${moduleId}`);

        const actualModuleObject = moduleInstance.default || moduleInstance;
        if (
          actualModuleObject &&
          typeof actualModuleObject.register === 'function'
        ) {
          const registrationApi = createRegistrationApi(
            moduleId,
            actualModuleObject
          );
          console.log(`[Init] Registering module: ${moduleId}`);
          await actualModuleObject.register(registrationApi);
        } else {
          console.log(
            `[Init] Module ${moduleId} does not have a register function.`
          );
        }
      } catch (error) {
        console.error(
          `[Init] Error importing or registering module ${moduleId}:`,
          error
        );
        if (runtimeModuleStates.has(moduleId)) {
          runtimeModuleStates.get(moduleId).enabled = false;
        }
      }
    } else if (moduleDefinition && !moduleDefinition.enabled) {
      console.log(
        `[Init] Module ${moduleId} is defined but not enabled. Skipping.`
      );
      runtimeModuleStates.set(moduleId, { initialized: false, enabled: false });
    } else {
      console.warn(
        `[Init] Module ${moduleId} listed in loadPriority but not found in moduleDefinitions. Skipping.`
      );
    }
  }
  console.log('[Init] Module import and registration phase complete.');

  // --- Initialize Golden Layout ---
  const layoutContainer = document.getElementById('goldenlayout-container');
  if (!layoutContainer) {
    console.error('[Init] Golden Layout container not found!');
    return;
  }
  const goldenLayoutInstance = new GoldenLayout(layoutContainer);

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
            console.log(
              `[Init GL Factory] Creating component ${componentType} for module ${factoryDetails.moduleId}`
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
                console.error(
                  `[Init GL Factory for ${componentType}] UI provider is invalid or missing getRootElement method. Provider:`,
                  uiProvider
                );
                throw new Error(
                  'UI provider is invalid or missing getRootElement method.'
                );
              }

              const rootElement = uiProvider.getRootElement();
              if (!rootElement || !(rootElement instanceof HTMLElement)) {
                console.error(
                  `[Init GL Factory for ${componentType}] uiProvider.getRootElement() did not return a valid HTMLElement. Got:`,
                  rootElement
                );
                throw new Error(
                  'UI did not return a valid root DOM element from getRootElement().'
                );
              }

              // Clear the container's element and append the new root element
              container.element.innerHTML = ''; // Clear any previous content (like loading/error messages)
              container.element.append(rootElement);
              console.log(
                `[Init GL Factory for ${componentType}] Appended rootElement to container.element.`
              );

              // Call onMount if it exists, now that the element is in the DOM via the container
              if (typeof uiProvider.onMount === 'function') {
                console.log(
                  `[Init GL Factory for ${componentType}] Calling uiProvider.onMount...`
                );
                uiProvider.onMount(container, componentState); // Pass GL container and state
              } else {
                console.log(
                  `[Init GL Factory for ${componentType}] uiProvider.onMount is not a function.`
                );
              }

              // GoldenLayout V2 doesn't strictly need a return from the factory
              // if the container.element is populated directly, which we've done.
              // Not returning uiProvider to be consistent with PanelManager's WrapperComponent.
            } catch (e) {
              console.error(
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
        console.log(
          `[Init] Registered component factory wrapper for: ${componentType} from module ${factoryDetails.moduleId}`
        );
      } else {
        console.error(
          `[Init] Component factory for ${componentType} from module ${factoryDetails.moduleId} is not a function!`
        );
      }
    });

  // --- Load Layout ---
  if (
    G_combinedModeData.layoutConfig &&
    typeof G_combinedModeData.layoutConfig === 'object'
  ) {
    console.log(
      '[Init] Attempting to load layout directly from G_combinedModeData.layoutConfig.'
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
        console.log(
          `[Init] Using layout preset '${activeLayoutIdFromSettings}' from layoutConfig.`
        );
        layoutToLoad =
          G_combinedModeData.layoutConfig[activeLayoutIdFromSettings];
      } else if (
        activeLayoutIdFromSettings === 'custom' &&
        G_combinedModeData.layoutConfig.custom
      ) {
        console.log('[Init] Using custom layout from layoutConfig.');
        layoutToLoad = G_combinedModeData.layoutConfig.custom;
      }

      // IMPORTANT: PanelManager must be initialized AFTER GoldenLayout has processed the layout
      // and created all initial components. The 'initialised' event is crucial.
      // console.log(
      //   '[Init DEBUG] About to call goldenLayoutInstance.loadLayout. Layout to load:',
      //   JSON.stringify(layoutToLoad)
      // );
      try {
        // Keep event listeners for diagnostics - Commenting out the verbose ones
        goldenLayoutInstance.on('started', () => {
          // console.log(
          //   '[Init DEBUG] GoldenLayout "started" EVENT HANDLER ENTERED (PanelManager init no longer solely relies on this)'
          // );
          // If this event DOES fire, PanelManager might be re-initialized if it wasn't fully ready before.
          // This could be okay if PanelManager.initialize() is idempotent.
          if (!panelManagerInstance.isInitialized) {
            console.log(
              '[Init] "started" event: PanelManager not yet initialized, calling initialize.'
            ); // Kept as info
            panelManagerInstance.initialize(goldenLayoutInstance, null);
          } else {
            // console.log(
            //   '[Init DEBUG] "started" event: PanelManager already initialized.'
            // );
          }
        });

        goldenLayoutInstance.on('initialised', () => {
          // console.log(
          //   '[Init DEBUG] GoldenLayout "initialised" (alternative) EVENT HANDLER ENTERED (PanelManager init no longer solely relies on this)'
          // );
          if (!panelManagerInstance.isInitialized) {
            console.log(
              '[Init] "initialised" event: PanelManager not yet initialized, calling initialize.'
            ); // Kept as info
            panelManagerInstance.initialize(goldenLayoutInstance, null);
          } else {
            // console.log(
            //   '[Init DEBUG] "initialised" event: PanelManager already initialized.'
            // );
          }
        });
        // goldenLayoutInstance.on('itemCreated', (item) => {
        //   console.log(
        //     '[Init DEBUG] GoldenLayout "itemCreated" event:',
        //     item.componentType || item.type,
        //     item.id
        //   );
        // });
        // goldenLayoutInstance.on('stackCreated', (stack) => {
        //   console.log('[Init DEBUG] GoldenLayout "stackCreated" event:', stack);
        // });
        // goldenLayoutInstance.on('rowCreated', (row) => {
        //   console.log('[Init DEBUG] GoldenLayout "rowCreated" event:', row);
        // });
        // goldenLayoutInstance.on('columnCreated', (column) => {
        //   console.log(
        //     '[Init DEBUG] GoldenLayout "columnCreated" event:',
        //     column
        //   );
        // });

        goldenLayoutInstance.loadLayout(layoutToLoad);
        // console.log(
        //   '[Init DEBUG] goldenLayoutInstance.loadLayout call completed.'
        // );

        // Attempt to initialize PanelManager here, after loadLayout has been called
        // console.log(
        //   '[Init DEBUG] Attempting to initialize PanelManager immediately after loadLayout.'
        // );
        // console.log(
        //   '[Init DEBUG] goldenLayoutInstance before PanelManager init:',
        //   goldenLayoutInstance
        // );
        // if (goldenLayoutInstance && goldenLayoutInstance.root) {
        //   console.log(
        //     '[Init DEBUG] goldenLayoutInstance.root IS present before PanelManager init. ContentItems length:',
        //     goldenLayoutInstance.root.contentItems?.length
        //   );
        // } else {
        //   console.warn(
        //     '[Init DEBUG] goldenLayoutInstance.root IS NOT present before PanelManager init.'
        //   );
        // }
        panelManagerInstance.initialize(goldenLayoutInstance, null); // gameUIInstance is null
      } catch (loadLayoutError) {
        console.error(
          '[Init] CRITICAL ERROR during goldenLayoutInstance.loadLayout call or immediate PanelManager init:', // Kept as error
          loadLayoutError,
          loadLayoutError.stack
        );
      }
    } catch (error) {
      console.error(
        '[Init] Error loading layout from G_combinedModeData.layoutConfig. Falling back to default.',
        error
      );
      goldenLayoutInstance.loadLayout(getDefaultLayoutConfig()); // Fallback
    }
  } else {
    console.warn(
      '[Init] No valid layoutConfig found in G_combinedModeData. Attempting to use settings or default (old fallback path).'
    );
    const activeLayoutId =
      (await settingsManager.getSetting('activeLayout')) || 'default';
    await loadLayoutConfiguration(goldenLayoutInstance, activeLayoutId, null); // Pass null for customConfig as it should come from G_combinedModeData
  }

  // --- Initialize Event Dispatcher ---
  console.log('[Init] Initializing Event Dispatcher...');
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
    console.log('[Init] Event Dispatcher initialized successfully.');
  } catch (error) {
    console.error(
      '[Init] CRITICAL: Failed to initialize Event Dispatcher!',
      error
    );
  }

  // --- Initialize Modules (Call .initialize() on each) ---
  console.log('[Init] Starting module initialization phase...');
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
  console.log('[Init] Module initialization phase complete.');

  // --- Post-Initialize Modules (Call .postInitialize() on each) ---
  console.log('[Init] Starting module post-initialization phase...');
  if (modulesData.loadPriority && Array.isArray(modulesData.loadPriority)) {
    for (const moduleId of modulesData.loadPriority) {
      if (runtimeModuleStates.get(moduleId)?.enabled) {
        // Check if module is enabled
        await _postInitializeSingleModule(moduleId);
      }
    }
  }
  console.log('[Init] Module post-initialization phase complete.');

  // --- Finalize Module Manager API ---
  // Populate the moduleManagerApi with its methods now that modules are loaded and runtime states exist.
  // This assumes moduleManagerApi is an empty object initially and we add properties to it.
  moduleManagerApi.enableModule = async (moduleId) => {
    const state = runtimeModuleStates.get(moduleId);
    if (state && state.enabled) {
      console.log(`[ModuleManagerAPI] Module ${moduleId} is already enabled.`);
      // Optionally, ensure its panel is visible if it was just hidden
      const componentType = centralRegistry.getComponentTypeForModule(moduleId);
      if (componentType && panelManagerInstance) {
        // This part is tricky: GL might not have a simple "ensure visible if exists"
        // We might try to activate it, or if createPanelForComponent is idempotent, call it.
        // For now, if already enabled, we assume it might just need its panel focused.
        // console.log(`[ModuleManagerAPI] Attempting to activate panel for already enabled module ${moduleId}`);
        panelManagerInstance.activatePanel(componentType);
      }
      return;
    }

    if (state) {
      state.enabled = true;
      console.log(`[ModuleManagerAPI] Enabling module: ${moduleId}`);

      try {
        // 1. Re-initialize the module
        // We need to find its original load priority index if _initializeSingleModule requires it.
        // Or, adapt _initializeSingleModule to not strictly need an index if it's just for logging.
        const moduleDefinition =
          G_combinedModeData.moduleConfig?.moduleDefinitions?.[moduleId];
        const loadPriorityArray =
          G_combinedModeData.moduleConfig?.loadPriority || [];
        let originalIndex = loadPriorityArray.indexOf(moduleId);
        if (originalIndex === -1) {
          console.warn(
            `[ModuleManagerAPI] Could not find original load priority index for ${moduleId}. Using -1.`
          );
          originalIndex = -1; // Or some default.
        }

        console.log(
          `[ModuleManagerAPI] Calling _initializeSingleModule for ${moduleId} with index ${originalIndex}`
        );
        await _initializeSingleModule(moduleId, originalIndex);

        // 2. Re-run postInitialize if it exists for the module
        const moduleInstance = importedModules.get(moduleId);
        if (
          moduleInstance &&
          typeof moduleInstance.postInitialize === 'function'
        ) {
          console.log(
            `[ModuleManagerAPI] Calling postInitialize for ${moduleId}`
          );
          await _postInitializeSingleModule(moduleId); // _postInitializeSingleModule uses createInitializationApi internally
        }

        // 3. Re-add the panel to Golden Layout
        const componentType =
          centralRegistry.getComponentTypeForModule(moduleId);
        const titleFromInfo =
          moduleInstance?.moduleInfo?.name || moduleInstance?.moduleInfo?.title;
        const panelTitle = titleFromInfo || moduleId;

        if (componentType && panelManagerInstance) {
          console.log(
            `[ModuleManagerAPI] Re-adding panel for ${moduleId}. Type: ${componentType}, Title: ${panelTitle}`
          );
          // createPanelForComponent will add it if not present, or potentially show/focus if it is.
          // The behavior depends on panelManager's implementation.
          await panelManagerInstance.createPanelForComponent(
            componentType,
            panelTitle
          );
          console.log(
            `[ModuleManagerAPI] Panel for ${moduleId} should have been re-added/focused.`
          );
        } else {
          if (!componentType) {
            console.warn(
              `[ModuleManagerAPI] Cannot re-add panel for ${moduleId}: No componentType found in centralRegistry.`
            );
          }
          if (!panelManagerInstance) {
            console.warn(
              `[ModuleManagerAPI] Cannot re-add panel for ${moduleId}: panelManagerInstance (imported) not available.`
            );
          }
        }
      } catch (error) {
        console.error(
          `[ModuleManagerAPI] Error during enabling or re-adding panel for ${moduleId}:`,
          error
        );
        state.enabled = false; // Revert enabled state on error
        // Optionally, publish module:stateChanged with enabled: false here
        // eventBus.publish('module:stateChanged', { moduleId, enabled: false });
        // return; // Stop further processing for this module
      }
    } else {
      console.error(
        `[ModuleManagerAPI] enableModule: No runtime state found for module ${moduleId}. Cannot enable.`
      );
    }

    eventBus.publish('module:stateChanged', { moduleId, enabled: true });

    // ADDED: Dispatch rehome event after enabling a module and its panel is potentially ready
    if (dispatcher) {
      console.log(
        `[ModuleManagerAPI] Module ${moduleId} enabled, dispatching system:rehomeTimerUI.`
      );
      setTimeout(() => {
        dispatcher.publish(
          'system:rehomeTimerUI',
          {},
          { initialTarget: 'top' }
        );
      }, 0);
    }
  };
  moduleManagerApi.disableModule = async (moduleId) => {
    console.log(`[ModuleManagerAPI] Attempted to disable ${moduleId}`);
    const moduleState = runtimeModuleStates.get(moduleId);
    if (moduleState) {
      moduleState.enabled = false;
      eventBus.publish('module:stateChanged', {
        moduleId,
        enabled: false,
      }); // Ensure consistent payload

      // Get componentType from centralRegistry
      const componentType = centralRegistry.getComponentTypeForModule(moduleId);
      let panelActionTaken = false; // Flag to track if panel was affected
      if (componentType) {
        console.log(
          `[ModuleManagerAPI] Closing panel for disabled module ${moduleId} (Component Type: ${componentType})`
        );

        // --- BEGIN DIAGNOSTIC LOGS (modified) ---
        // console.log(
        //   '[ModuleManagerAPI DEBUG] Inspecting panelManagerInstance before call:'
        // );
        // console.log(
        //   '[ModuleManagerAPI DEBUG] typeof panelManagerInstance:',
        //   typeof panelManagerInstance
        // );
        // if (panelManagerInstance) {
        //   console.log(
        //     '[ModuleManagerAPI DEBUG] panelManagerInstance content:',
        //     panelManagerInstance
        //   );
        //   if (
        //     typeof panelManagerInstance.destroyPanelByComponentType ===
        //     'function'
        //   ) {
        //     console.log(
        //       '[ModuleManagerAPI DEBUG] panelManagerInstance.destroyPanelByComponentType IS a function.'
        //     );
        //     console.log(
        //       '[ModuleManagerAPI DEBUG] Source code of panelManagerInstance.destroyPanelByComponentType:'
        //     );
        //     console.log(
        //       panelManagerInstance.destroyPanelByComponentType.toString()
        //     );
        //   } else {
        //     console.error(
        //       '[ModuleManagerAPI DEBUG] panelManagerInstance.destroyPanelByComponentType IS NOT a function. Type:',
        //       typeof panelManagerInstance.destroyPanelByComponentType
        //     );
        //   }
        // } else {
        //   console.error(
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
          console.error(
            '[ModuleManagerAPI] CRITICAL: Cannot call destroyPanelByComponentType - panelManagerInstance (imported) or the method is invalid.'
          );
        }
      } else {
        console.warn(
          `[ModuleManagerAPI] Module ${moduleId} has no registered panel component type. Cannot close panel.`
        );
      }

      // ADDED: Dispatch rehome event if module was disabled (especially if its panel was closed)
      // Dispatch regardless of panelActionTaken for now, as disabling a non-UI module could theoretically affect hosting viability
      // in a more complex system, though not directly in our current TimerUI case.
      // Keeping it simple: if a module is disabled, re-evaluate timer hosting.
      if (dispatcher) {
        console.log(
          `[ModuleManagerAPI] Module ${moduleId} disabled (panel action taken: ${panelActionTaken}), dispatching system:rehomeTimerUI.`
        );
        setTimeout(() => {
          dispatcher.publish(
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
      //     console.log(`[ModuleManagerAPI] Uninitialized module: ${moduleId}`);
      //   } catch (error) {
      //     console.error(`[ModuleManagerAPI] Error uninitializing module ${moduleId}:`, error);
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

  console.log('[Init] ModuleManagerAPI populated.');

  // ADDED: Listen for panels being closed manually to disable their modules
  eventBus.subscribe('ui:panelManuallyClosed', ({ moduleId }) => {
    if (!moduleId) return;

    const moduleState = runtimeModuleStates.get(moduleId);
    // Only disable if it's currently considered enabled by the module manager
    if (moduleState && moduleState.enabled !== false) {
      // Check if it's not already marked as disabled
      console.log(
        `[Init - ui:panelManuallyClosed] Received event for moduleId: ${moduleId}. ` +
          `Panel closed by user. Updating module state to disabled.`
      );
      moduleState.enabled = false;
      eventBus.publish('module:stateChanged', { moduleId, enabled: false });
      // The panel is already destroyed by GoldenLayout.
      // The rehome dispatch is handled by the panel's own destroy/dispose handler.
      // No need to call moduleManagerApi.disableModule() here, as that would try to destroy the panel again.
    } else if (moduleState && moduleState.enabled === false) {
      console.log(
        `[Init - ui:panelManuallyClosed] Module ${moduleId} was already marked as disabled. No state change needed.`
      );
    } else {
      // Catches moduleState being null or undefined
      console.warn(
        `[Init - ui:panelManuallyClosed] Runtime state for module ${moduleId} not found. Cannot update state.`
      );
    }
  });

  // Publish an event indicating that the modes.json has been loaded and processed
  // This allows modules that depend on mode configurations (e.g., for UI elements)
  if (G_modesConfig) {
    console.log('[Init] Publishing app:modesJsonLoaded event.');
    eventBus.publish('app:modesJsonLoaded', { modesConfig: G_modesConfig });
  } else {
    console.warn(
      '[Init] G_modesConfig not available when attempting to publish app:modesJsonLoaded. This might indicate an issue.'
    );
    // Still publish, but with a potentially empty or default config if G_modesConfig was truly not set
    eventBus.publish('app:modesJsonLoaded', {
      modesConfig: G_modesConfig || {},
    });
  }

  // Signal that core systems are up, modules are initialized,
  // and UI components can now safely fetch initial data (like from StateManager)
  console.log('[Init] Publishing app:readyForUiDataLoad event...');
  eventBus.publish('app:readyForUiDataLoad', {
    getModuleManager: () => moduleManagerApi,
  });

  // ADDED: Dispatch initial timer rehoming event
  // This is done with a timeout to allow app:readyForUiDataLoad handlers (e.g., UI panel creation)
  // to complete their immediate synchronous setup before the rehoming logic runs.
  setTimeout(() => {
    if (dispatcher) {
      // Ensure dispatcher is initialized (should be by now)
      console.log('[Init.js] Dispatching initial system:rehomeTimerUI event.');
      dispatcher.publish(
        'system:rehomeTimerUI', // Event name
        {}, // Event data (empty for now, can be extended if needed)
        { initialTarget: 'top' } // Dispatch options: start from highest priority module
      );
    } else {
      console.error(
        '[Init.js] Cannot dispatch system:rehomeTimerUI, dispatcher not available.'
      );
    }
  }, 0); // Zero timeout defers to the next event loop tick

  // Make core instances globally available for debugging (optional)
  window.G_currentActiveMode = G_currentActiveMode;
  window.G_modesConfig = G_modesConfig;
  window.G_combinedModeData = G_combinedModeData;
  window.settingsManager = settingsManager;
  window.eventBus = eventBus;
  window.panelManager = panelManagerInstance;
  window.centralRegistry = centralRegistry;
  window.goldenLayoutInstance = goldenLayoutInstance;
  window.moduleManagerApi = moduleManagerApi;

  console.log('[Init] Modular application initialization complete.');

  // After all modules are ready and UI might be listening,
  // publish the final active mode.
  console.log(
    `[Init] Publishing app:activeModeDetermined with mode: ${G_currentActiveMode}`
  );
  eventBus.publish('app:activeModeDetermined', {
    activeMode: G_currentActiveMode,
  });

  // Attach a global listener for files:jsonLoaded to update rules in StateManager
  eventBus.subscribe('files:jsonLoaded', async (eventData) => {
    console.log(
      '[Init] files:jsonLoaded event RECEIVED. Full eventData:',
      JSON.parse(JSON.stringify(eventData)) // Log a deep copy
    );
    if (
      eventData &&
      eventData.jsonData &&
      eventData.selectedPlayerId !== undefined
    ) {
      console.log(
        `[Init] files:jsonLoaded: Valid data. jsonData keys: ${Object.keys(
          eventData.jsonData
        ).join(', ')}, PlayerID: ${
          eventData.selectedPlayerId
        }. Calling stateManager.loadRules.`
      );
      try {
        G_combinedModeData.rulesConfig = eventData.jsonData;
        console.log(
          '[Init] files:jsonLoaded: G_combinedModeData.rulesConfig updated.'
        );

        const playerInfo = eventData.playerInfo || {
          playerName: `Player${eventData.selectedPlayerId}`,
        };

        await stateManagerProxySingleton.loadRules(eventData.jsonData, {
          playerId: String(eventData.selectedPlayerId),
          playerName: playerInfo.playerName,
        });
        console.log(
          '[Init] files:jsonLoaded: stateManagerProxySingleton.loadRules call COMPLETED.'
        );
      } catch (error) {
        console.error('[Init] Error handling files:jsonLoaded event:', error);
      }
    }
  });
}

// Start the initialization process
main();
