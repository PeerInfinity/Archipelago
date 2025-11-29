// layoutLoader.js - Layout configuration utilities
// Extracted from init.js lines 111-204

/**
 * Returns a hardcoded default layout configuration as fallback
 *
 * @param {Object} logger - Logger instance (optional, but recommended)
 * @returns {Object} Default Golden Layout configuration
 */
export function getDefaultLayoutConfig(logger) {
  if (!logger) {
    console.warn('[layoutLoader] Logger not provided to getDefaultLayoutConfig. Using hardcoded default layout configuration.');
  } else {
    logger.warn('init', 'Using hardcoded default layout configuration.');
  }
  return {
    settings: {
      showPopoutIcon: false,
    },
    root: {
      type: 'row',
      content: [
        {
          type: 'stack',
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

/**
 * Validates whether a layout object is valid for Golden Layout
 *
 * @param {*} layoutConfig - The layout configuration to validate
 * @returns {boolean} True if valid, false otherwise
 */
export function isValidLayoutObject(layoutConfig) {
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

/**
 * Loads a layout configuration into a Golden Layout instance
 *
 * @param {Object} layoutInstance - The Golden Layout instance
 * @param {string} activeLayoutId - The ID of the layout to load ('default', 'custom', or preset name)
 * @param {Object} customConfig - Custom layout configuration (if activeLayoutId is 'custom')
 * @param {Object} layoutPresets - Object containing layout presets
 * @param {Object} logger - Logger instance (required)
 * @throws {Error} If required parameters are missing
 */
export async function loadLayoutConfiguration(
  layoutInstance,
  activeLayoutId,
  customConfig,
  layoutPresets,
  logger
) {
  if (!layoutInstance) {
    throw new Error('loadLayoutConfiguration requires layoutInstance parameter');
  }
  if (!logger) {
    throw new Error('loadLayoutConfiguration requires logger parameter');
  }
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
    chosenLayoutConfig = customConfig || getDefaultLayoutConfig(logger);
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
    chosenLayoutConfig = getDefaultLayoutConfig(logger);
  }

  // Load the chosen layout
  logger.info('init', 'Loading layout configuration into Golden Layout...');
  layoutInstance.loadLayout(chosenLayoutConfig);
}
