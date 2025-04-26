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
              componentType: 'clientPanel', // Placeholder - adjust as modules register
              title: 'Client',
            },
            {
              type: 'component',
              componentType: 'stateManagerPanel', // Placeholder
              title: 'State',
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

// --- Main Initialization Logic ---
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Init] Initializing modular application...');

  // Make core instances globally available for debugging (optional)
  window.settingsManager = settingsManager;
  window.eventBus = eventBus;
  window.panelManager = panelManagerInstance;
  window.centralRegistry = centralRegistry; // Expose registry for debug

  let modulesData = null;
  let layoutPresets = {};
  const importedModules = new Map(); // Map<moduleId, moduleObject>
  let dispatcher = null;

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

    // Initialize runtime state for all defined modules based on initial config
    for (const moduleId in modulesData.moduleDefinitions) {
      const isEnabled =
        modulesData.moduleDefinitions[moduleId]?.enabled || false;
      // Ensure not to overwrite if already set (though unlikely here)
      if (!runtimeModuleStates.has(moduleId)) {
        runtimeModuleStates.set(moduleId, {
          initialized: false,
          enabled: isEnabled,
        });
      }
    }
    console.log(
      '[Init] Initialized runtime module states based on modules.json'
    );

    // --- 3. Instantiate Event Dispatcher ---
    dispatcher = new EventDispatcher(); // New way: Construct first
    window.dispatcher = dispatcher; // Expose for debugging
    // console.log('[Init] EventDispatcher instantiated.'); // Log happens inside constructor/init now

    // --- 4. Registration Phase --- (Registry populated here)
    console.log('[Init] Starting module registration phase...');
    for (const [moduleId, module] of importedModules.entries()) {
      if (typeof module.register === 'function') {
        // Create the registration API specific to this module
        const registrationApi = {
          registerPanelComponent: (componentType, componentFactory) => {
            centralRegistry.registerPanelComponent(
              moduleId,
              componentType,
              componentFactory
            );
          },
          registerEventHandler: (eventName, handlerFunction) => {
            centralRegistry.registerEventHandler(
              moduleId,
              eventName,
              handlerFunction.bind(module)
            ); // Ensure correct 'this' if needed
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
      events: Array.from(centralRegistry.eventHandlers.keys()),
      schemas: Array.from(centralRegistry.settingsSchemas.keys()),
      functions: Array.from(centralRegistry.publicFunctions.keys()),
    });

    // --- 4b. Initialize Event Dispatcher --- (Initialize AFTER registry is populated)
    console.log(
      '[Init] Initializing EventDispatcher with registered handlers...'
    );
    try {
      dispatcher.initialize(modulesData, centralRegistry.eventHandlers);
    } catch (error) {
      console.error('[Init] Failed to initialize EventDispatcher:', error);
      // Potentially throw or handle this error more gracefully
      throw error; // Stop initialization if dispatcher fails
    }

    // --- 5. Initialization Phase --- (Dispatcher is now ready)
    console.log(
      '[Init] Starting module initialization phase (in priority order)...'
    );
    const { loadPriority } = modulesData;
    for (let i = 0; i < loadPriority.length; i++) {
      const moduleId = loadPriority[i];
      const definition = modulesData.moduleDefinitions[moduleId];
      const moduleInstance = importedModules.get(moduleId);

      if (
        definition?.enabled &&
        moduleInstance &&
        typeof moduleInstance.initialize === 'function'
      ) {
        // Create the initialization API for this module
        const initializationApi = {
          getSettings: async () => settingsManager.getModuleSettings(moduleId),
          getDispatcher: () => ({
            publish: dispatcher.publish.bind(dispatcher),
            publishToPredecessors:
              dispatcher.publishToPredecessors.bind(dispatcher),
          }),
          getEventBus: () => eventBus, // Provide direct access to eventBus for non-priority events
          getModuleFunction: (targetModuleId, functionName) => {
            return centralRegistry.getPublicFunction(
              targetModuleId,
              functionName
            );
          },
          // Add the new Module Manager API provider function
          getModuleManager: () => ({
            // Provide access to raw data (use carefully)
            _getRawModulesData: () => modulesData,
            _getRawImportedModules: () => importedModules,
            _getRawRegistry: () => centralRegistry,
            _getRawDispatcher: () => dispatcher,

            // Provide access to current state information
            getAllModuleStates: async () => {
              const states = {};
              for (const id in modulesData.moduleDefinitions) {
                const definition = modulesData.moduleDefinitions[id];
                const runtimeState = runtimeModuleStates.get(id) || {
                  enabled: false,
                }; // Get runtime state
                states[id] = {
                  enabled: runtimeState.enabled, // Use runtime state here
                  definition: definition,
                };
              }
              return states;
            },
            getCurrentLoadPriority: async () => {
              return modulesData.loadPriority;
            },

            // --- Module Management Functions (Mirroring implementation from above) ---
            enableModule: async (moduleId) => {
              if (
                !modulesData.moduleDefinitions[moduleId] ||
                !importedModules.has(moduleId)
              ) {
                console.error(
                  `ModuleManager: Cannot enable unknown or failed-import module: ${moduleId}`
                );
                return;
              }
              const runtimeState = runtimeModuleStates.get(moduleId);
              if (runtimeState?.enabled) {
                console.log(
                  `ModuleManager: Module ${moduleId} is already enabled.`
                );
                return;
              }
              console.log(`ModuleManager: Enabling module ${moduleId}...`);
              runtimeState.enabled = true;
              if (!runtimeState.initialized) {
                const moduleInstance = importedModules.get(moduleId);
                if (typeof moduleInstance.initialize === 'function') {
                  try {
                    const priorityIndex =
                      modulesData.loadPriority.indexOf(moduleId);
                    const api = {
                      getSettings: async () =>
                        settingsManager.getModuleSettings(moduleId),
                      getDispatcher: () => ({
                        publish: dispatcher.publish.bind(dispatcher),
                        publishToPredecessors:
                          dispatcher.publishToPredecessors.bind(dispatcher),
                      }),
                      getEventBus: () => eventBus,
                      getModuleFunction: (targetModuleId, functionName) =>
                        centralRegistry.getPublicFunction(
                          targetModuleId,
                          functionName
                        ),
                      getModuleManager: () => {
                        /* Avoid recursion */
                      },
                    };
                    await moduleInstance.initialize(
                      moduleId,
                      priorityIndex,
                      api
                    );
                    runtimeState.initialized = true;

                    // --- Create Panel (Delayed) ---
                    const componentType =
                      centralRegistry.getComponentTypeForModule(moduleId);
                    if (componentType) {
                      const definition =
                        modulesData.moduleDefinitions[moduleId];
                      // Delay slightly
                      setTimeout(() => {
                        console.log(
                          `ModuleManager (post-init API): Requesting panel creation (delayed) for ${componentType}`
                        );
                        if (panelManagerInstance) {
                          panelManagerInstance.createPanelForComponent(
                            componentType,
                            definition.title || moduleId
                          );
                        } else {
                          console.error(
                            'ModuleManager (post-init API): PanelManager instance not available for panel creation.'
                          );
                        }
                      }, 100);
                    } // No else needed
                    // --- End Create Panel ---

                    // TODO: Update EventDispatcher handlers
                  } catch (error) {
                    console.error(
                      `ModuleManager: Error initializing module ${moduleId} during enable:`,
                      error
                    );
                    runtimeState.enabled = false;
                  }
                } else {
                  runtimeState.initialized = true;
                }
              }
              console.log(`ModuleManager: Module ${moduleId} enabled.`);
              eventBus.publish('module:stateChanged', {
                moduleId,
                isEnabled: true,
              });
            },
            disableModule: async (moduleId) => {
              if (moduleId === 'stateManager' || moduleId === 'modules') {
                console.warn(
                  `ModuleManager: Cannot disable core module: ${moduleId}`
                );
                return;
              }
              if (!modulesData.moduleDefinitions[moduleId]) {
                console.error(
                  `ModuleManager: Cannot disable unknown module: ${moduleId}`
                );
                return;
              }
              const runtimeState = runtimeModuleStates.get(moduleId);
              if (!runtimeState?.enabled) {
                console.log(
                  `ModuleManager: Module ${moduleId} is already disabled.`
                );
                return;
              }
              console.log(`ModuleManager: Disabling module ${moduleId}...`);
              runtimeState.enabled = false;

              // --- Destroy Panel First ---
              const componentType =
                centralRegistry.getComponentTypeForModule(moduleId);
              if (componentType) {
                console.log(
                  `ModuleManager (post-init API): Requesting panel destruction for ${componentType}`
                );
                if (panelManagerInstance) {
                  panelManagerInstance.destroyPanelByComponentType(
                    componentType
                  );
                } else {
                  console.error(
                    'ModuleManager (post-init API): PanelManager instance not available for panel destruction.'
                  );
                }
              } // No else needed
              // --- End Destroy Panel ---

              // Call uninitialize if available
              const moduleInstance = importedModules.get(moduleId);
              if (
                moduleInstance &&
                typeof moduleInstance.uninitialize === 'function'
              ) {
                try {
                  await moduleInstance.uninitialize();
                } catch (error) {
                  console.error(
                    `ModuleManager: Error uninitializing module ${moduleId}:`,
                    error
                  );
                }
              }
              console.log(`ModuleManager: Module ${moduleId} disabled.`);
              eventBus.publish('module:stateChanged', {
                moduleId,
                isEnabled: false,
              });
            },
            changeModulePriority: async (id, direction) => {
              console.warn(
                `ModuleManager: changeModulePriority(${id}, ${direction}) - Not implemented`
              );
            },
          }),
          // getSingleton: (name) => { /* Decide how to provide singletons */ },
        };

        try {
          console.log(
            `[Init] Initializing module: ${moduleId} (Priority ${i})`
          );
          // Module initialization can be async if needed
          await moduleInstance.initialize(moduleId, i, initializationApi);
        } catch (error) {
          console.error(
            `[Init] Error during initialization of module: ${moduleId}`,
            error
          );
        }
      } else if (definition?.enabled && !moduleInstance) {
        console.warn(
          `[Init] Module ${moduleId} is enabled but failed to import. Skipping initialization.`
        );
      } else if (
        definition?.enabled &&
        moduleInstance &&
        typeof moduleInstance.initialize !== 'function'
      ) {
        console.log(
          `[Init] Enabled module ${moduleId} has no initialize function. Skipping.`
        );
      }
    }
    console.log('[Init] Module initialization phase complete.');

    // --- 5b. Post-Initialization Phase ---
    console.log(
      '[Init] Starting module post-initialization phase (in priority order)...'
    );
    for (let i = 0; i < loadPriority.length; i++) {
      const moduleId = loadPriority[i];
      const definition = modulesData.moduleDefinitions[moduleId];
      const moduleInstance = importedModules.get(moduleId);

      if (
        definition?.enabled &&
        moduleInstance &&
        typeof moduleInstance.postInitialize === 'function'
      ) {
        // Reuse the same initialization API structure
        const initializationApi = {
          getSettings: async () => settingsManager.getModuleSettings(moduleId),
          getDispatcher: () => ({
            publish: dispatcher.publish.bind(dispatcher),
            publishToPredecessors:
              dispatcher.publishToPredecessors.bind(dispatcher),
          }),
          getEventBus: () => eventBus,
          getModuleFunction: (targetModuleId, functionName) => {
            return centralRegistry.getPublicFunction(
              targetModuleId,
              functionName
            );
          },
          // getSingleton: (name) => { /* Decide how to provide singletons */ },
        };

        try {
          console.log(
            `[Init] Post-initializing module: ${moduleId} (Priority ${i})`
          );
          // Post-initialization can also be async
          await moduleInstance.postInitialize(initializationApi);
        } catch (error) {
          console.error(
            `[Init] Error during post-initialization of module: ${moduleId}`,
            error
          );
        }
      } else if (
        definition?.enabled &&
        moduleInstance &&
        typeof moduleInstance.postInitialize !== 'function'
      ) {
        // console.log(
        //   `[Init] Enabled module ${moduleId} has no postInitialize function. Skipping.`
        // );
      }
    }
    console.log('[Init] Module post-initialization phase complete.');

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

    // Register components discovered during module registration
    if (centralRegistry.panelComponents.size === 0) {
      console.warn('[Init] No panel components were registered by any module!');
    }

    // Track which components we've already registered to avoid duplicates
    const registeredComponents = new Set();

    for (const componentType of centralRegistry.panelComponents.keys()) {
      const factory = centralRegistry.panelComponents.get(componentType);
      if (!factory) continue; // Skip if factory is missing

      try {
        // Register the component with Golden Layout via PanelManager
        console.log(
          `[Init] Registering panel component '${componentType}' with Golden Layout via PanelManager.`
        );

        // ONLY call PanelManager's registration, which handles GL registration internally
        panelManagerInstance.registerPanelComponent(componentType, factory);

        // Mark as registered conceptually in init.js
        registeredComponents.add(componentType);

        // Remove the redundant direct registration and the inner try-catch for PanelManager
        /*
        layout.registerComponentConstructor(
          componentType,
          function (container, componentState) {
            console.log(
              `[GL Direct] Creating component '${componentType}' for container:`, container.element.id
            );

            try {
              // Call the factory provided by the module
              const uiProvider = factory(container, componentState);

              // Store reference to the UI provider on the wrapper
              this.uiProvider = uiProvider;

              // Store unsubscribe handles for cleanup
              this.unsubscribeHandles = [];

              // Add container event handlers
              container.on('destroy', () => {
                console.log(
                  `[GL Direct] Destroying component '${componentType}'`
                );
                if (
                  this.uiProvider &&
                  typeof this.uiProvider.dispose === 'function'
                ) {
                  this.uiProvider.dispose();
                }

                if (
                  this.unsubscribeHandles &&
                  this.unsubscribeHandles.length > 0
                ) {
                  this.unsubscribeHandles.forEach((unsubscribe) => {
                    try {
                      unsubscribe();
                    } catch (e) { 
                      // ignore 
                    }
                  });
                }
              });

              // Add the UI provider to the panelManager's map for compatibility
              try {
                panelManagerInstance.addMapping(container, uiProvider);
              } catch (error) {
                console.warn(
                  `[GL Direct] Error adding mapping to panelManager: ${error.message}`
                );
              }

              // Return what Golden Layout expects - if component has an element, use it
              if (uiProvider && uiProvider.element) {
                return uiProvider;
              }

              // Otherwise just return the container element
              return { element: container.element };
            } catch (error) {
              console.error(
                `[GL Direct] Error creating component '${componentType}':`,
                error
              );
              return { element: container.element };
            }
          }
        );

        // Mark as registered
        registeredComponents.add(componentType);

        // Also register with PanelManager for backwards compatibility
        // But don't throw errors if it fails (might be already registered there)
        try {
          panelManagerInstance.registerPanelComponent(componentType, factory);
        } catch (error) {
          console.warn(
            `[Init] Error registering '${componentType}' with PanelManager (non-fatal): ${error.message}`
          );
        }
        */
      } catch (error) {
        // Handle component already registered errors gracefully (this might now catch errors from the PanelManager registration)
        if (error.message && error.message.includes('already registered')) {
          console.warn(
            `[Init] Component '${componentType}' already registered (via PanelManager?), skipping.`
          );
          registeredComponents.add(componentType); // Still mark as conceptually registered
        } else {
          console.error(
            `[Init] Error registering component '${componentType}' via PanelManager:`,
            error
          );
        }
      }
    }

    // Check for filesPanel specifically - IF IT'S NOT using the new module pattern
    // We need to ensure the files module IS actually registering its panel component via the API
    // Let's comment out this special handling for now and see if the normal registration works.
    /*
    if (!registeredComponents.has('filesPanel')) {
      console.log('[Init] Registering filesPanel component specially');

      try {
        // Get the Files module if it was imported
        const filesModule = importedModules.get('files');

        if (filesModule && filesModule.FilesUI) { // Check if FilesUI export exists
          // Use PanelManager to register it, similar to other components
          panelManagerInstance.registerPanelComponent(
            'filesPanel',
            () => {
              console.log('[GL Direct] Creating filesPanel component (special case)');
              const filesUI = new filesModule.FilesUI();
              // Assuming FilesUI constructor doesn't need container/state
              // and initialize is called separately if needed after DOM attachment
              return filesUI; // Return the instance for PanelManager to handle
            }
          );
          registeredComponents.add('filesPanel');
          console.log('[Init] Successfully registered filesPanel component via PanelManager (special case)');

        } else {
          console.warn(
            '[Init] Files module not imported or FilesUI class missing, cannot register filesPanel component'
          );
        }
      } catch (error) {
        console.error('[Init] Error registering filesPanel component specially:', error);
      }
    }
    */

    // Register component aliases for backward compatibility
    try {
      // If mainContentPanel exists but clientPanel doesn't, create an alias
      if (
        registeredComponents.has('mainContentPanel') &&
        !registeredComponents.has('clientPanel')
      ) {
        console.log('[Init] Creating alias: clientPanel → mainContentPanel');

        // Get the factory for mainContentPanel
        const mainContentFactory =
          centralRegistry.panelComponents.get('mainContentPanel');

        if (mainContentFactory) {
          // Register clientPanel with the same factory
          layout.registerComponentConstructor(
            'clientPanel',
            function (container, componentState) {
              console.log('[GL Direct] Creating component alias: clientPanel');

              try {
                // Create the component using the mainContent factory
                const uiProvider = mainContentFactory(
                  container,
                  componentState
                );

                // Store reference to the UI provider on the wrapper
                this.uiProvider = uiProvider;

                // Store unsubscribe handles for cleanup
                this.unsubscribeHandles = [];

                // Add container event handlers
                container.on('destroy', () => {
                  console.log(
                    '[GL Direct] Destroying component alias: clientPanel'
                  );
                  if (
                    this.uiProvider &&
                    typeof this.uiProvider.dispose === 'function'
                  ) {
                    this.uiProvider.dispose();
                  }

                  if (
                    this.unsubscribeHandles &&
                    this.unsubscribeHandles.length > 0
                  ) {
                    this.unsubscribeHandles.forEach((unsubscribe) => {
                      try {
                        unsubscribe();
                      } catch (e) {
                        /* ignore */
                      }
                    });
                  }
                });

                // Add the UI provider to the panelManager's map for compatibility
                try {
                  panelManagerInstance.addMapping(container, uiProvider);
                } catch (error) {
                  console.warn(
                    `[GL Direct] Error adding mapping to panelManager: ${error.message}`
                  );
                }

                // Return what Golden Layout expects
                if (uiProvider && uiProvider.element) {
                  return uiProvider;
                }

                return { element: container.element };
              } catch (error) {
                console.error(
                  '[GL Direct] Error creating component alias: clientPanel',
                  error
                );
                return { element: container.element };
              }
            }
          );

          // Mark as registered
          registeredComponents.add('clientPanel');
          console.log('[Init] Successfully registered clientPanel alias');
        }
      }
    } catch (error) {
      console.error('[Init] Error registering component alias:', error);
    }

    // Determine the layout configuration to load
    let chosenLayoutConfig = null;
    const activeLayoutId = await settingsManager.getActiveLayoutIdentifier();

    if (activeLayoutId === null) {
      console.log('[Init] Active layout is custom.');
      chosenLayoutConfig = await settingsManager.getCustomLayoutConfig();
    } else if (
      typeof activeLayoutId === 'string' &&
      layoutPresets[activeLayoutId]
    ) {
      console.log(`[Init] Active layout is preset: ${activeLayoutId}`);
      chosenLayoutConfig = layoutPresets[activeLayoutId];
    } else {
      console.log(
        `[Init] Active layout '${activeLayoutId}' not found or invalid, using default.`
      );
      // Fallback to custom config if available, otherwise use hardcoded default
      chosenLayoutConfig =
        (await settingsManager.getCustomLayoutConfig()) ||
        getDefaultLayoutConfig();
      if (!(await settingsManager.getCustomLayoutConfig())) {
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
    layout.loadLayout(chosenLayoutConfig);
    console.log('[Init] Golden Layout configuration loaded.');

    console.log('[Init] Application initialization sequence complete.');
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
