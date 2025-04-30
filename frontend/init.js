// init.js - Initialization script for the modular frontend

// Core Singletons/Managers
import panelManagerInstance from './app/core/panelManagerSingleton.js';
import eventBus from './app/core/eventBus.js';
import settingsManager from './app/core/settingsManager.js';
import centralRegistry from './app/core/centralRegistry.js';
import EventDispatcher from './app/core/eventDispatcher.js';
import { GoldenLayout } from './libs/golden-layout/js/esm/golden-layout.js';

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
              componentType: 'clientPanel', // Uses mainContentPanel factory
              title: 'Client',
            },
            {
              type: 'component',
              componentType: 'optionsPanel', // Placeholder
              title: 'Options',
            },
          ],
        },
      ],
    },
  };
}

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
    getSettings: async () => settingsManager.getModuleSettings(moduleId),
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
      eventName,
      handlerFunction,
      propagationDetails
    ) => {
      centralRegistry.registerDispatcherReceiver(
        moduleId,
        eventName,
        handlerFunction.bind(moduleInstance), // Ensure correct 'this'
        propagationDetails
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
    // New EventBus subscriber registration (for tracking, actual subscribe is separate)
    registerEventBusSubscriber: (eventName, callback) => {
      centralRegistry.registerEventBusSubscriber(
        moduleId,
        eventName,
        callback.bind(moduleInstance) // Ensure correct 'this'
      );
    },
    registerSettingsSchema: (schemaSnippet) => {
      centralRegistry.registerSettingsSchema(moduleId, schemaSnippet);
    },
    registerPublicFunction: (functionName, functionRef) => {
      centralRegistry.registerPublicFunction(
        moduleId,
        functionName,
        functionRef
      );
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
      await moduleInstance.postInitialize(api);
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

// --- Main Initialization Logic ---
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Init] Initializing modular application...');

  // Make core instances globally available for debugging (optional)
  window.settingsManager = settingsManager;
  window.eventBus = eventBus;
  window.panelManager = panelManagerInstance;
  window.centralRegistry = centralRegistry; // Expose registry for debug

  let modulesData = null;

  try {
    // --- 1. Load Configuration Files ---
    console.log('[Init] Loading configuration...');
    modulesData = await fetchJson(
      '/frontend/modules.json',
      'Failed to load modules configuration'
    );
    if (
      !modulesData ||
      !modulesData.moduleDefinitions ||
      !modulesData.loadPriority
    ) {
      throw new Error('modules.json is missing, malformed, or empty.');
    }

    // Settings are loaded asynchronously by the manager itself
    await settingsManager.ensureLoaded();
    console.log('[Init] Settings loaded via settingsManager.');

    // Load layout presets (optional)
    layoutPresets =
      (await fetchJson(
        '/frontend/layout_presets.json',
        'Failed to load layout presets (optional)'
      )) || {};

    // --- 2. Import All Defined Modules ---
    console.log('[Init] Importing defined modules...');
    const importPromises = Object.entries(modulesData.moduleDefinitions).map(
      async ([id, definition]) => {
        try {
          const module = await import(definition.path);
          importedModules.set(id, module);
          console.log(`[Init] Successfully imported module: ${id}`);

          // --- Store Module Info and Create Runtime State ---
          const definitionFromJson = modulesData.moduleDefinitions[id]; // Get original definition
          const info = module.moduleInfo || {};
          const title = info.name || definitionFromJson.title || id; // Use info.name, fallback to definition.title (if exists), then id
          const description =
            info.description ||
            definitionFromJson.description ||
            'No description provided'; // Use info.desc, fallback to definition.desc (if exists), then default

          // Create runtime state entry HERE, after import
          runtimeModuleStates.set(id, {
            initialized: false,
            enabled: definitionFromJson.enabled || false, // Use enabled flag from definition
            isExternal: false,
            definition: {
              // Store detailed definition info
              path: definitionFromJson.path,
              title: title, // Store calculated title
              description: description, // Store calculated description
              enabled: definitionFromJson.enabled || false, // Store original enabled flag
              // Add other definition properties if needed
            },
          });
          // --- End Store Module Info ---
        } catch (error) {
          console.error(
            `[Init] Failed to import module: ${id} from ${definition.path}`,
            error
          );
          // Decide how to handle failed imports - skip registration/initialization?
          // For now, we just log the error. The module won't be in importedModules.
        }
      }
    );
    await Promise.all(importPromises);
    console.log(
      `[Init] Finished importing modules. ${importedModules.size} loaded.`
    );

    // --- 3. Instantiate Event Dispatcher ---
    // Define helper functions for the dispatcher BEFORE constructing it
    const getHandlersFunc = () => centralRegistry.getAllDispatcherHandlers(); // Get map from registry
    const getLoadPriorityFunc = () => modulesData.loadPriority; // Get array from config
    const isModuleEnabledFunc = (moduleId) => {
      const state = runtimeModuleStates.get(moduleId);
      return state ? state.enabled : false; // Check runtime state
    };

    // Construct the dispatcher with the required functions
    dispatcher = new EventDispatcher(
      getHandlersFunc,
      getLoadPriorityFunc,
      isModuleEnabledFunc
    );
    window.dispatcher = dispatcher; // Expose for debugging
    // console.log('[Init] EventDispatcher instantiated.'); // Log happens inside constructor/init now
    // --- Remove Old Initialization Logic for Dispatcher ---

    // --- 4. Registration Phase --- (Registry populated here)
    console.log('[Init] Starting module registration phase...');
    for (const [moduleId, module] of importedModules.entries()) {
      if (typeof module.register === 'function') {
        // Create the registration API specific to this module using the helper
        const registrationApi = createRegistrationApi(moduleId, module);
        try {
          console.log(`[Init] Registering module: ${moduleId}`);
          module.register(registrationApi);
        } catch (error) {
          console.error(
            `[Init] Error during registration of module: ${moduleId}`,
            error
          );
        }
      }
    }
    console.log('[Init] Module registration phase complete.');
    console.log('[Registry Snapshot]', {
      panels: Array.from(centralRegistry.panelComponents.keys()),
      events: Array.from(centralRegistry.dispatcherHandlers.keys()), // Updated to use dispatcherHandlers
      schemas: Array.from(centralRegistry.settingsSchemas.keys()),
      functions: Array.from(centralRegistry.publicFunctions.keys()),
    });

    // --- Define the Module Manager API --- (Needs access to modulesData, importedModules, etc.)
    moduleManagerApi = {
      // Provide access to raw data (use carefully)
      _getRawModulesData: () => modulesData,
      _getRawImportedModules: () => importedModules,
      _getRawRegistry: () => centralRegistry,
      _getRawDispatcher: () => dispatcher,

      // Provide access to current state information
      getAllModuleStates: async () => {
        const states = {};
        for (const [id, runtimeState] of runtimeModuleStates.entries()) {
          if (runtimeState && runtimeState.definition) {
            states[id] = {
              enabled: runtimeState.enabled,
              initialized: runtimeState.initialized,
              definition: runtimeState.definition,
              isExternal: runtimeState.isExternal || false,
            };
          } else {
            console.warn(
              `[ModuleManager API] Missing runtime state or definition for module ID: ${id}`
            );
          }
        }
        return states;
      },
      getCurrentLoadPriority: async () => {
        // TODO: Allow runtime modification of priority?
        return modulesData.loadPriority;
      },

      // --- Module Management Functions ---
      enableModule: async (moduleId) => {
        const definition = modulesData.moduleDefinitions[moduleId];
        if (!definition || !importedModules.has(moduleId)) {
          console.error(
            `ModuleManager: Cannot enable unknown or failed-import module: ${moduleId}`
          );
          return;
        }
        const runtimeState = runtimeModuleStates.get(moduleId);
        if (runtimeState?.enabled) {
          console.log(`ModuleManager: Module ${moduleId} is already enabled.`);
          return; // Already enabled
        }

        console.log(`ModuleManager: Enabling module ${moduleId}...`);
        runtimeState.enabled = true;

        // Initialize and Post-Initialize if needed
        if (!runtimeState.initialized) {
          console.log(
            `ModuleManager: Performing first-time initialization for ${moduleId}...`
          );
          const priorityIndex = modulesData.loadPriority.indexOf(moduleId);
          await _initializeSingleModule(moduleId, priorityIndex);
          // Check if initialization failed (helper sets enabled to false on error)
          if (!runtimeState.enabled) {
            console.error(
              `ModuleManager: Initialization failed for ${moduleId}. Aborting enable.`
            );
            return;
          }
          await _postInitializeSingleModule(moduleId);
          // Check if post-initialization failed
          if (!runtimeState.enabled) {
            console.error(
              `ModuleManager: Post-initialization failed for ${moduleId}. Aborting enable.`
            );
            return;
          }
        } else {
          console.log(
            `ModuleManager: Module ${moduleId} was previously initialized. Skipping init steps.`
          );
          // Potentially re-run postInitialize if needed? For now, no.
        }

        // --- Create Panel (Delayed) ---
        const componentType =
          centralRegistry.getComponentTypeForModule(moduleId);
        if (componentType) {
          // --- Get preferred title for the panel ---
          const definition = runtimeState.definition; // Get the stored definition
          const panelTitle = definition?.title || moduleId; // Use stored title, fallback to ID

          setTimeout(() => {
            console.log(
              `ModuleManager: Requesting panel creation (delayed) for ${componentType} with title \'${panelTitle}\'`
            );
            if (panelManagerInstance) {
              panelManagerInstance.createPanelForComponent(
                componentType,
                panelTitle // Use the retrieved or fallback title
              );
            } else {
              console.error(
                'ModuleManager: PanelManager instance not available for panel creation.'
              );
            }
          }, 500); // Increased delay to 500ms
        }
        // --- End Create Panel ---

        // TODO: Update EventDispatcher handlers (add handlers for this module)
        console.log(`ModuleManager: Module ${moduleId} enabled.`);
        eventBus.publish('module:stateChanged', { moduleId, isEnabled: true }); // Notify UI
      },
      disableModule: async (moduleId) => {
        if (moduleId === 'stateManager' || moduleId === 'modules') {
          console.warn(
            `ModuleManager: Cannot disable core module: ${moduleId}`
          );
          return;
        }
        const definition = modulesData.moduleDefinitions[moduleId];
        if (!definition) {
          console.error(
            `ModuleManager: Cannot disable unknown module: ${moduleId}`
          );
          return;
        }
        const runtimeState = runtimeModuleStates.get(moduleId);
        if (!runtimeState?.enabled) {
          console.log(`ModuleManager: Module ${moduleId} is already disabled.`);
          return; // Already disabled
        }

        console.log(`ModuleManager: Disabling module ${moduleId}...`);
        runtimeState.enabled = false;

        // --- Destroy Panel First ---
        const componentType =
          centralRegistry.getComponentTypeForModule(moduleId);
        if (componentType) {
          console.log(
            `ModuleManager: Requesting panel destruction for ${componentType}`
          );
          if (panelManagerInstance) {
            panelManagerInstance.destroyPanelByComponentType(componentType);
          } else {
            console.error(
              'ModuleManager: PanelManager instance not available for panel destruction.'
            );
          }
        } // No else needed, module might not have a panel
        // --- End Destroy Panel ---

        // Call uninitialize if available
        const moduleInstance = importedModules.get(moduleId);
        if (
          moduleInstance &&
          typeof moduleInstance.uninitialize === 'function'
        ) {
          try {
            console.log(
              `ModuleManager: Calling uninitialize() for ${moduleId}`
            );
            await moduleInstance.uninitialize();
            // TODO: Update EventDispatcher handlers for removed listeners
          } catch (error) {
            console.error(
              `ModuleManager: Error uninitializing module ${moduleId}:`,
              error
            );
            // Should we revert enabled state? Probably not, it's likely broken.
          }
        }

        // TODO: Update EventDispatcher handlers (remove handlers for this module)
        console.log(`ModuleManager: Module ${moduleId} disabled.`);
        eventBus.publish('module:stateChanged', { moduleId, isEnabled: false }); // Notify UI
      },
      changeModulePriority: async (id, direction) => {
        console.warn(
          `ModuleManager: changeModulePriority(${id}, ${direction}) - Not implemented`
        );
      },
    };
    window.moduleManagerApi = moduleManagerApi; // Expose for debugging

    // Register the 'modules' module as the publisher of state change events
    centralRegistry.registerEventBusPublisher('modules', 'module:stateChanged');

    // --- 5. Initialization Phase --- (Use helper function)
    console.log(
      '[Init] Starting module initialization phase (in priority order)...'
    );
    const { loadPriority } = modulesData;
    for (let i = 0; i < loadPriority.length; i++) {
      const moduleId = loadPriority[i];
      const definition = modulesData.moduleDefinitions[moduleId];

      if (definition?.enabled && importedModules.has(moduleId)) {
        // Use the helper function
        await _initializeSingleModule(moduleId, i);
      } else if (definition?.enabled && !importedModules.has(moduleId)) {
        console.warn(
          `[Init] Module ${moduleId} is enabled but failed to import. Skipping initialization.`
        );
      }
    }
    console.log('[Init] Module initialization phase complete.');

    // --- 5b. Post-Initialization Phase --- (Use helper function)
    console.log(
      '[Init] Starting module post-initialization phase (in priority order)...'
    );
    for (let i = 0; i < loadPriority.length; i++) {
      const moduleId = loadPriority[i];
      const definition = modulesData.moduleDefinitions[moduleId];

      // Only run post-init if the module is currently enabled (it might have failed init)
      const runtimeState = runtimeModuleStates.get(moduleId);
      if (runtimeState?.enabled && importedModules.has(moduleId)) {
        // Use the helper function
        await _postInitializeSingleModule(moduleId);
      }
    }
    console.log('[Init] Module post-initialization phase complete.');

    // --- Notify that all modules are post-initialized ---
    console.log('[Init] Publishing init:postInitComplete on eventBus...');
    eventBus.publish('init:postInitComplete');
    // --------------------------------------------------

    // --- 6. Golden Layout Setup ---
    console.log('[Init] Setting up Golden Layout...');
    const containerElement = document.getElementById('goldenlayout-container');
    if (!containerElement) {
      throw new Error('[Init] Golden Layout container element not found!');
    }

    // Check if GoldenLayout global exists // REMOVED Check - Using import now
    /*
    if (typeof goldenLayout === 'undefined' || !goldenLayout?.GoldenLayout) {
      throw new Error(
        '[Init] GoldenLayout script not loaded or GoldenLayout class not found on window.'
      );
    }
    */

    // Instantiate Golden Layout - V2 Style - Use imported class
    const layout = new GoldenLayout(containerElement);
    window.goldenLayoutInstance = layout; // Make global for debugging
    console.log('[Init] Golden Layout instance created.');

    // Create a minimal mock GameUI instance that provides what panelManager needs
    const mockGameUI = {
      // Add minimal properties/methods needed by panelManager
      // This mock replaces the older GameUI class since we're modularizing
      filesPanelContainer: document.getElementById('goldenlayout-container'),
      clearExistingData: () =>
        console.log('[MockGameUI] clearExistingData called'),
      initializeUI: () => console.log('[MockGameUI] initializeUI called'),
      _enableControlButtons: () =>
        console.log('[MockGameUI] _enableControlButtons called'),
      // Add any other methods that modules might call on gameUI
    };

    // Make mockGameUI globally available for legacy code
    window.gameUI = mockGameUI;

    // Initialize PanelManager with the layout instance and mock GameUI
    panelManagerInstance.initialize(layout, mockGameUI);
    console.log('[Init] PanelManager initialized with mock GameUI.');

    // --- Helper function to create the getter with correct scope ---
    const createUiInstanceGetter = (factoryObject) => {
      // factoryObject is expected to be { moduleId, componentClass }
      const componentClass = factoryObject.componentClass;
      return (container, componentState) => {
        // This function now closes over the 'componentClass' retrieved from the factoryObject
        if (typeof componentClass !== 'function') {
          console.error(
            'Error: captured componentClass is not a function!',
            componentClass,
            'Original factory object:',
            factoryObject
          );
          throw new TypeError('Invalid component class provided.');
        }
        return new componentClass(container, componentState);
      };
    };

    // Register components discovered during module registration via PanelManager
    if (centralRegistry.panelComponents.size === 0) {
      console.warn('[Init] No panel components were registered by modules.');
    } else {
      centralRegistry.panelComponents.forEach((componentFactory, name) => {
        // --- Adapt the component factory for PanelManager ---
        // Create the getter using the helper function to ensure correct closure
        const uiInstanceGetter = createUiInstanceGetter(componentFactory);

        // Register with PanelManager using the correctly formatted getter
        panelManagerInstance.registerPanelComponent(name, uiInstanceGetter);
        console.log(
          `[Init] Registering panel component '${name}' with Golden Layout via PanelManager.`
        );
        // --- Handle Aliases (Specific case for clientPanel -> mainContentPanel) ---
        if (name === 'mainContentPanel') {
          try {
            console.log(
              `[Init] Attempting to register alias: clientPanel using mainContentPanel factory`
            );
            // Use the same helper to create the getter function for the alias
            const aliasInstanceGetter =
              createUiInstanceGetter(componentFactory);
            panelManagerInstance.registerPanelComponent(
              'clientPanel',
              aliasInstanceGetter // Pass the new getter for the alias
            );
            console.log(
              `[Init] Successfully registered alias 'clientPanel' via PanelManager using same factory.`
            );
          } catch (registerError) {
            if (
              registerError instanceof Error &&
              registerError.message.toLowerCase().includes('already registered')
            ) {
              console.log(
                `[Init] Alias 'clientPanel' component constructor was already registered.`
              );
            } else {
              console.error(
                "[Init] Error registering alias 'clientPanel' for 'mainContentPanel':",
                registerError
              );
            }
          }
        }
      });
    }

    // *** REMOVE Direct testPanel registration HERE ***
    /*
    try {
      console.log(
        "[Init] Attempting to register dummy 'testPanel' DIRECTLY with Golden Layout."
      );
      try {
        layout.registerComponentConstructor(
          'testPanel',
          function (container, componentState) {
            // Simple direct implementation for testing
            container.element.innerHTML =
              '<h2>Test Panel Content (Direct Reg)</h2>';
            container.element.style.padding = '10px';
          }
        );
        console.log(
          "[Init] Successfully registered dummy 'testPanel' component constructor directly."
        );
      } catch (registerError) {
        if (
          registerError instanceof Error &&
          registerError.message.toLowerCase().includes('already registered')
        ) {
          console.log(
            "[Init] Dummy 'testPanel' component constructor was already directly registered."
          );
        } else {
          console.error(
            "[Init] Unexpected error registering dummy 'testPanel' directly:",
            registerError
          );
        }
      }
    } catch (e) {
      console.error(
        "[Init] General error during dummy 'testPanel' direct registration block:",
        e
      );
    }
    */
    // *** End REMOVED Direct testPanel registration ***

    console.log(
      '[Init] Golden Layout instance created and components registered.'
    );

    // --- Make API globally available BEFORE layout load ---
    window.moduleManagerApi = moduleManagerApi;
    console.log('[Init] Module Manager API assigned to window.');

    // Determine and load the layout configuration
    const activeLayoutId = await settingsManager.getActiveLayoutIdentifier();
    const customLayoutConfig = await settingsManager.getCustomLayoutConfig();

    await loadLayoutConfiguration(layout, activeLayoutId, customLayoutConfig);
    console.log('[Init] Golden Layout configuration loaded.');

    console.log('[Init] Application initialization sequence complete.');
    // --- Publish the init:complete event ---
    eventBus.publish('init:complete');
    console.log("[Init] Published 'init:complete' event.");

    // --- Listener for Dynamic Module Loading ---
    eventBus.subscribe(
      'module:loadExternalRequest',
      async ({ moduleId, modulePath }) => {
        console.log(
          `[Init] Received module:loadExternalRequest for ${moduleId} from ${modulePath}`
        );
        try {
          // 1. Dynamically import the module
          const module = await import(modulePath);
          console.log(
            `[Init] Successfully imported external module: ${moduleId}`
          );

          // Add to internal tracking
          importedModules.set(moduleId, module);
          // --- Store Module Info for External Module ---
          const info = module.moduleInfo || {};
          const title = info.name || moduleId; // Use info.name, fallback to generated moduleId
          const description = info.description || 'Dynamically loaded module';

          runtimeModuleStates.set(moduleId, {
            initialized: false,
            enabled: false, // Start disabled, enableModule will handle init
            isExternal: true, // Mark as external
            definition: {
              // Create a definition using extracted/fallback info
              path: modulePath,
              title: title,
              description: description,
              enabled: false, // Initial state before explicit enable
            },
          });
          // --- End Store Module Info ---

          // Add to modulesData structure (or update if managing dynamically)
          modulesData.moduleDefinitions[moduleId] =
            runtimeModuleStates.get(moduleId).definition;
          modulesData.loadPriority.push(moduleId); // Add to end of priority list

          // 2. Register the module
          if (typeof module.register === 'function') {
            // Use the helper function to create the registration API
            const registrationApi = createRegistrationApi(moduleId, module);
            console.log(`[Init] Registering external module: ${moduleId}`);
            module.register(registrationApi);

            // **Re-register components with PanelManager**
            // Since the registry changed, tell PanelManager about any *new* components
            const componentType =
              centralRegistry.getComponentTypeForModule(moduleId);
            if (componentType) {
              const componentFactory =
                centralRegistry.panelComponents.get(componentType);
              if (componentFactory) {
                const uiInstanceGetter =
                  createUiInstanceGetter(componentFactory);
                console.log(
                  `[Init] Registering new panel component '${componentType}' with Golden Layout via PanelManager.`
                );
                panelManagerInstance.registerPanelComponent(
                  componentType,
                  uiInstanceGetter
                );
              } else {
                console.warn(
                  `[Init] Could not find factory for new component ${componentType} in registry.`
                );
              }
            }
          } else {
            console.warn(
              `[Init] External module ${moduleId} has no register function.`
            );
          }

          // 3. Enable the module (this should handle initialization)
          console.log(`[Init] Enabling external module: ${moduleId}`);
          await moduleManagerApi.enableModule(moduleId); // Use the existing API

          // 4. Notify success
          console.log(
            `[Init] External module ${moduleId} loaded and enabled successfully.`
          );
          eventBus.publish('module:loaded', { moduleId }); // Notify ModulesPanel
        } catch (error) {
          console.error(
            `[Init] Failed to load or initialize external module ${moduleId} from ${modulePath}:`,
            error
          );
          // Clean up partial state if needed
          importedModules.delete(moduleId);
          runtimeModuleStates.delete(moduleId);
          delete modulesData.moduleDefinitions[moduleId];
          modulesData.loadPriority = modulesData.loadPriority.filter(
            (id) => id !== moduleId
          );
          // Notify failure
          eventBus.publish('module:loadFailed', {
            moduleId,
            modulePath,
            error,
          });
        }
      }
    );
    console.log("[Init] Listener added for 'module:loadExternalRequest'.");

    // Optional: Trigger event indicating app is ready (if different from init:complete)
    // eventBus.publish('app:ready');
  } catch (error) {
    console.error('--- FATAL INITIALIZATION ERROR ---', error);
    // Display a user-friendly error message on the page?
    const errorElement = document.getElementById('init-error-message');
    if (errorElement) {
      errorElement.textContent = `Application failed to initialize: ${error.message}. Check console for details.`;
      errorElement.style.display = 'block';
    }
    // Hide loading indicator if it exists
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
      loadingIndicator.style.display = 'none';
    }
  }
});
