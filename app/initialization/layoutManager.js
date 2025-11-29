// layoutManager.js - Layout manager initialization (mobile vs desktop)
// Extracted from init.js lines 1385-1590

import { setupDesktopLayout } from '../layout/desktopLayout.js';
import { getModuleMetadata } from '../core/moduleMetadata.js';

/**
 * Initializes the appropriate layout manager based on device type
 *
 * This function:
 * 1. Detects device type (mobile vs desktop) via URL param or auto-detection
 * 2. Sets up either mobile or desktop layout
 * 3. Registers components appropriately
 * 4. Returns the layout manager instances
 *
 * ⚠️ CRITICAL: Returns layout manager instances that must be captured
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.GoldenLayout - Golden Layout constructor (required)
 * @param {Object} options.mobileLayoutManager - Mobile layout manager instance (required)
 * @param {Object} options.centralRegistry - Central registry instance (required)
 * @param {Object} options.panelManagerInstance - Panel manager instance (required)
 * @param {Object} options.settingsManager - Settings manager instance (required)
 * @param {Object} options.combinedModeData - Combined mode data (required)
 * @param {Object} options.layoutPresets - Layout presets object (required)
 * @param {Map} options.runtimeModuleStates - Runtime module states (required)
 * @param {Map} options.moduleInfoMap - Module info map (required)
 * @param {Map} options.importedModules - Imported modules map (required)
 * @param {Function} options.filterLayoutContent - Layout filter function (required)
 * @param {Function} options.hideLoadingScreen - Hide loading screen function (required)
 * @param {Function} options.getDefaultLayoutConfig - Get default layout config function (required)
 * @param {Object} options.logger - Logger instance (required)
 * @param {Function} options.log - Log function (required)
 * @throws {Error} If required parameters are missing
 * @returns {Promise<Object>} Object with layoutManagerInstance and goldenLayoutInstance
 * @returns {Object} return.layoutManagerInstance - The layout manager (mobile or desktop)
 * @returns {Object|null} return.goldenLayoutInstance - Golden Layout instance (null for mobile)
 * @returns {boolean} return.usesMobileLayout - Whether mobile layout was used
 */
export async function initializeLayoutManager(options) {
  // Validate required parameters
  validateLayoutManagerOptions(options);

  const {
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
    hideLoadingScreen,
    getDefaultLayoutConfig,
    logger,
    log,
  } = options;

  // Determine if we should use mobile or desktop layout
  const usesMobileLayout = determineLayoutMode(logger);

  // Get the layout container
  const layoutContainer = document.getElementById('goldenlayout-container');
  if (!layoutContainer) {
    throw new Error('Layout container element "goldenlayout-container" not found!');
  }

  let layoutManagerInstance = null;
  let goldenLayoutInstance = null;

  if (usesMobileLayout) {
    // Setup mobile layout
    const result = await setupMobileLayout({
      mobileLayoutManager,
      layoutContainer,
      centralRegistry,
      layoutPresets,
      moduleInfoMap,
      importedModules,
      logger,
    });
    layoutManagerInstance = result.layoutManagerInstance;
  } else {
    // Setup desktop layout
    const result = await setupDesktopLayout({
      layoutContainer,
      GoldenLayout,
      centralRegistry,
      panelManagerInstance,
      settingsManager,
      combinedModeData,
      runtimeModuleStates,
      getModuleIdFromComponentType: createGetModuleIdFromComponentType(centralRegistry),
      filterLayoutContent,
      hideLoadingScreen,
      getDefaultLayoutConfig,
      logger,
      log,
    });
    goldenLayoutInstance = result.goldenLayoutInstance;
    layoutManagerInstance = goldenLayoutInstance;
  }

  return {
    layoutManagerInstance,
    goldenLayoutInstance,
    usesMobileLayout,
  };
}

/**
 * Validates all required options
 * @private
 */
function validateLayoutManagerOptions(options) {
  if (!options) {
    throw new Error('initializeLayoutManager requires options object');
  }

  const required = [
    'GoldenLayout',
    'mobileLayoutManager',
    'centralRegistry',
    'panelManagerInstance',
    'settingsManager',
    'combinedModeData',
    'layoutPresets',
    'runtimeModuleStates',
    'moduleInfoMap',
    'importedModules',
    'filterLayoutContent',
    'hideLoadingScreen',
    'getDefaultLayoutConfig',
    'logger',
    'log',
  ];

  for (const param of required) {
    if (!options[param]) {
      throw new Error(`initializeLayoutManager requires options.${param}`);
    }
  }
}

/**
 * Determines whether to use mobile or desktop layout
 * @private
 */
function determineLayoutMode(logger) {
  const layoutUrlParams = new URLSearchParams(window.location.search);
  const forceLayout = layoutUrlParams.get('layout');

  if (forceLayout === 'mobile') {
    logger.info('init', 'Layout mode forced to MOBILE via URL parameter (?layout=mobile)');
    return true;
  } else if (forceLayout === 'desktop') {
    logger.info('init', 'Layout mode forced to DESKTOP via URL parameter (?layout=desktop)');
    return false;
  } else {
    // Auto-detect based on device
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const usesMobileLayout = isMobile || isTouchDevice;
    logger.info(
      'init',
      `Auto-detected device - Mobile: ${isMobile}, Touch: ${isTouchDevice}, Using mobile layout: ${usesMobileLayout}`
    );
    return usesMobileLayout;
  }
}

/**
 * Sets up mobile layout
 * @private
 */
async function setupMobileLayout(options) {
  const {
    mobileLayoutManager,
    layoutContainer,
    centralRegistry,
    layoutPresets,
    moduleInfoMap,
    importedModules,
    logger,
  } = options;

  logger.info('INIT_STEP', 'Mobile Layout Manager setup started');

  // Register components with Mobile Layout Manager
  centralRegistry
    .getAllPanelComponents()
    .forEach((factoryDetails, componentType) => {
      if (typeof factoryDetails.componentClass === 'function') {
        // Get module info from multiple sources
        const rawModuleInfo = factoryDetails.moduleInfo ||
                             factoryDetails.componentClass?.moduleInfo ||
                             moduleInfoMap.get(factoryDetails.moduleId) ||
                             importedModules.get(factoryDetails.moduleId)?.moduleInfo ||
                             {};

        // Use the centralized metadata helper to ensure complete module info
        const moduleInfo = getModuleMetadata(componentType, rawModuleInfo);

        // Priority: title first, then name, then componentType
        const title = moduleInfo.title ||
                     moduleInfo.name ||
                     componentType;

        // Register with mobile layout manager
        mobileLayoutManager.registerPanel(
          componentType,
          factoryDetails.componentClass,
          title,
          moduleInfo
        );

        logger.debug(
          'init',
          `Registered mobile panel: ${componentType} from module ${factoryDetails.moduleId}`
        );
      }
    });

  // Initialize the mobile layout manager
  mobileLayoutManager.initialize(layoutContainer, layoutPresets);
  logger.info('INIT_STEP', 'Mobile Layout Manager initialized with all components');

  // Add class to body to indicate mobile layout is active
  document.body.classList.add('mobile-layout-active');
  logger.info('init', 'Added mobile-layout-active class to body');

  return { layoutManagerInstance: mobileLayoutManager };
}

/**
 * Creates a function to get module ID from component type
 * @private
 */
function createGetModuleIdFromComponentType(centralRegistry) {
  return (componentType) => {
    const panelComponents = centralRegistry.getAllPanelComponents();
    const componentDetails = panelComponents.get(componentType);
    return componentDetails ? componentDetails.moduleId : null;
  };
}
