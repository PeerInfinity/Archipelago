// desktopLayout.js - Desktop Golden Layout setup and configuration
// Extracted from init.js lines 1423-1902

/**
 * Sets up Golden Layout for desktop mode
 *
 * This function:
 * 1. Creates Golden Layout instance
 * 2. Registers all panel components
 * 3. Filters layout by enabled modules
 * 4. Loads the layout configuration
 * 5. Initializes PanelManager
 *
 * @param {Object} options - Configuration options
 * @param {HTMLElement} options.layoutContainer - The DOM container for Golden Layout (required)
 * @param {Object} options.GoldenLayout - Golden Layout constructor (required)
 * @param {Object} options.centralRegistry - Central registry instance (required)
 * @param {Object} options.panelManagerInstance - Panel manager instance (required)
 * @param {Object} options.settingsManager - Settings manager instance (required)
 * @param {Object} options.combinedModeData - Combined mode data (G_combinedModeData) (required)
 * @param {Map} options.runtimeModuleStates - Map of runtime module states (required)
 * @param {Function} options.getModuleIdFromComponentType - Function to get module ID from component type (required)
 * @param {Function} options.filterLayoutContent - Function to filter layout content (required)
 * @param {Function} options.hideLoadingScreen - Function to hide loading screen (required)
 * @param {Function} options.getDefaultLayoutConfig - Function to get default layout config (required)
 * @param {Object} options.logger - Logger instance (required)
 * @param {Function} options.log - Log function for console output (required)
 * @throws {Error} If required parameters are missing
 * @returns {Promise<Object>} Object with goldenLayoutInstance
 */
export async function setupDesktopLayout(options) {
  // Validate all required parameters
  validateDesktopLayoutOptions(options);

  const {
    layoutContainer,
    GoldenLayout,
    centralRegistry,
    panelManagerInstance,
    settingsManager,
    combinedModeData,
    runtimeModuleStates,
    getModuleIdFromComponentType,
    filterLayoutContent,
    hideLoadingScreen,
    getDefaultLayoutConfig,
    logger,
    log,
  } = options;

  logger.info('INIT_STEP', 'Golden Layout initialization started');

  // Create Golden Layout instance
  const goldenLayoutInstance = new GoldenLayout(layoutContainer);
  goldenLayoutInstance.resizeWithContainerAutomatically = true;

  // Add class to body to indicate desktop layout is active
  document.body.classList.add('desktop-layout-active');
  logger.info('init', 'Added desktop-layout-active class to body');

  // Register components with Golden Layout
  registerPanelComponents({
    goldenLayoutInstance,
    centralRegistry,
    logger,
    log,
  });

  // Load and filter layout configuration
  await loadDesktopLayoutConfig({
    goldenLayoutInstance,
    panelManagerInstance,
    settingsManager,
    combinedModeData,
    runtimeModuleStates,
    getModuleIdFromComponentType,
    filterLayoutContent,
    hideLoadingScreen,
    getDefaultLayoutConfig,
    logger,
    log,
  });

  logger.info('INIT_STEP', 'Golden Layout initialization completed');

  return { goldenLayoutInstance };
}

/**
 * Validates all required options for desktop layout setup
 * @private
 */
function validateDesktopLayoutOptions(options) {
  if (!options) {
    throw new Error('setupDesktopLayout requires options object');
  }

  const required = [
    'layoutContainer',
    'GoldenLayout',
    'centralRegistry',
    'panelManagerInstance',
    'settingsManager',
    'combinedModeData',
    'runtimeModuleStates',
    'getModuleIdFromComponentType',
    'filterLayoutContent',
    'hideLoadingScreen',
    'getDefaultLayoutConfig',
    'logger',
    'log',
  ];

  for (const param of required) {
    if (!options[param]) {
      throw new Error(`setupDesktopLayout requires options.${param}`);
    }
  }
}

/**
 * Registers all panel components with Golden Layout
 * @private
 */
function registerPanelComponents(options) {
  const { goldenLayoutInstance, centralRegistry, logger, log } = options;

  centralRegistry
    .getAllPanelComponents()
    .forEach((factoryDetails, componentType) => {
      if (typeof factoryDetails.componentClass === 'function') {
        goldenLayoutInstance.registerComponentFactoryFunction(
          componentType,
          createGoldenLayoutComponentFactory(
            componentType,
            factoryDetails,
            logger,
            log
          )
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
}

/**
 * Creates a factory function for Golden Layout component instantiation
 * @private
 */
function createGoldenLayoutComponentFactory(componentType, factoryDetails, logger, log) {
  return (container, componentState) => {
    logger.debug(
      'init',
      `Creating component ${componentType} for module ${factoryDetails.moduleId}`
    );

    try {
      // Instantiate the component class
      const uiProvider = new factoryDetails.componentClass(
        container,
        componentState,
        componentType
      );

      // Validate the UI provider
      if (!uiProvider || typeof uiProvider.getRootElement !== 'function') {
        logger.error(
          'init',
          `UI provider for ${componentType} is invalid or missing getRootElement method. Provider:`,
          uiProvider
        );
        throw new Error(
          'UI provider is invalid or missing getRootElement method.'
        );
      }

      // Get and validate the root element
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

      // Add the root element to the container
      container.element.innerHTML = '';
      container.element.append(rootElement);
      logger.debug(
        'init',
        `Appended rootElement to container for ${componentType}.`
      );

      // Call onMount if it exists
      if (typeof uiProvider.onMount === 'function') {
        logger.debug(
          'init',
          `Calling uiProvider.onMount for ${componentType}...`
        );
        uiProvider.onMount(container, componentState);
      } else {
        logger.debug(
          'init',
          `uiProvider.onMount is not a function for ${componentType}.`
        );
      }
    } catch (e) {
      log(
        'error',
        `[Init GL Factory] Error instantiating component ${componentType}:`,
        e
      );
      // Show error UI in the container
      container.element.innerHTML = `<div style="color: red; padding: 10px;">Error creating component: ${componentType}. ${e.message}</div>`;
    }
  };
}

/**
 * Loads and filters the desktop layout configuration
 * @private
 */
async function loadDesktopLayoutConfig(options) {
  const {
    goldenLayoutInstance,
    panelManagerInstance,
    settingsManager,
    combinedModeData,
    runtimeModuleStates,
    getModuleIdFromComponentType,
    filterLayoutContent,
    hideLoadingScreen,
    getDefaultLayoutConfig,
    logger,
    log,
  } = options;

  if (
    !combinedModeData.layoutConfig ||
    typeof combinedModeData.layoutConfig !== 'object'
  ) {
    logger.warn(
      'init',
      'No valid layoutConfig found in combinedModeData. Using hardcoded default.'
    );
    try {
      goldenLayoutInstance.loadLayout(getDefaultLayoutConfig());
      panelManagerInstance.initialize(goldenLayoutInstance, null);
    } catch (error) {
      logger.error('init', 'Error loading default layout:', error);
    }
    return;
  }

  logger.info(
    'init',
    'Attempting to load layout directly from combinedModeData.layoutConfig.'
  );

  try {
    // Select the active layout
    let layoutToLoad = combinedModeData.layoutConfig;
    const activeLayoutIdFromSettings = await settingsManager.getSetting(
      'activeLayout',
      'default'
    );

    if (combinedModeData.layoutConfig[activeLayoutIdFromSettings]) {
      logger.info(
        'init',
        `Using layout preset '${activeLayoutIdFromSettings}' from layoutConfig.`
      );
      layoutToLoad = combinedModeData.layoutConfig[activeLayoutIdFromSettings];
    } else if (
      activeLayoutIdFromSettings === 'custom' &&
      combinedModeData.layoutConfig.custom
    ) {
      logger.info('init', 'Using custom layout from layoutConfig.');
      layoutToLoad = combinedModeData.layoutConfig.custom;
    }

    // Filter the layout based on enabled modules
    const isModuleEnabledFunc = (moduleId) => {
      const moduleState = runtimeModuleStates.get(moduleId);
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
        isModuleEnabledFunc,
        getModuleIdFromComponentType,
        logger
      );
      logger.info('init', 'Layout configuration (root.content) filtered.');
    } else if (layoutToLoad && Array.isArray(layoutToLoad.content)) {
      logger.info(
        'init',
        'Filtering layout configuration (direct content array) based on enabled modules...'
      );
      layoutToLoad.content = filterLayoutContent(
        layoutToLoad.content,
        isModuleEnabledFunc,
        getModuleIdFromComponentType,
        logger
      );
      logger.info(
        'init',
        'Layout configuration (direct content array) filtered.'
      );
    } else {
      logger.warn(
        'init',
        'LayoutToLoad does not have a recognized structure for filtering. Skipping filtering.',
        layoutToLoad
      );
    }

    logger.debug(
      'init',
      'Full layoutToLoad AFTER filtering:',
      JSON.stringify(layoutToLoad)
    );

    // Set up event listeners
    setupGoldenLayoutEvents(
      goldenLayoutInstance,
      panelManagerInstance,
      hideLoadingScreen,
      logger
    );

    // Load the layout
    goldenLayoutInstance.loadLayout(layoutToLoad);

    // Initialize PanelManager
    panelManagerInstance.initialize(goldenLayoutInstance, null);
  } catch (error) {
    logger.error(
      'init',
      'Error loading layout from combinedModeData.layoutConfig. Falling back to default.',
      error
    );
    try {
      goldenLayoutInstance.loadLayout(getDefaultLayoutConfig());
      panelManagerInstance.initialize(goldenLayoutInstance, null);
    } catch (fallbackError) {
      logger.error('init', 'Error loading fallback default layout:', fallbackError);
    }
  }
}

/**
 * Sets up Golden Layout event listeners
 * @private
 */
function setupGoldenLayoutEvents(
  goldenLayoutInstance,
  panelManagerInstance,
  hideLoadingScreen,
  logger
) {
  goldenLayoutInstance.on('started', () => {
    hideLoadingScreen(logger);

    if (!panelManagerInstance.isInitialized) {
      logger.info(
        'init',
        '"started" event: PanelManager not yet initialized, calling initialize.'
      );
      panelManagerInstance.initialize(goldenLayoutInstance, null);
    }
  });

  goldenLayoutInstance.on('initialised', () => {
    if (!panelManagerInstance.isInitialized) {
      logger.info(
        'init',
        '"initialised" event: PanelManager not yet initialized, calling initialize.'
      );
      panelManagerInstance.initialize(goldenLayoutInstance, null);
    }
  });
}
