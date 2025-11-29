// modeConfigResolver.js - Load and resolve modes.json configuration
// Extracted from init.js lines 592-638

/**
 * Loads the modes configuration from modes.json
 *
 * ⚠️ CRITICAL: This function RETURNS the modes config instead of setting a global.
 * The calling code MUST capture and use the return value:
 *
 * @example
 * // CORRECT:
 * const modesConfig = await loadModesConfiguration(fetchJson, logger);
 *
 * // INCORRECT (will lose config):
 * await loadModesConfiguration(fetchJson, logger); // ❌ Return value ignored!
 *
 * @param {Function} fetchJson - Function to fetch JSON files (required)
 * @param {Object} logger - Logger instance (required)
 * @returns {Promise<Object>} The modes configuration object (never null - returns default fallback on error)
 * @throws {Error} If required parameters are missing
 */
export async function loadModesConfiguration(fetchJson, logger) {
  if (!fetchJson || typeof fetchJson !== 'function') {
    throw new Error('loadModesConfiguration requires fetchJson function parameter');
  }
  if (!logger) {
    throw new Error('loadModesConfiguration requires logger parameter');
  }

  logger.info('init', 'Loading modes configuration (modes.json)...');
  try {
    const modesFileContent = await fetchJson(
      './modes.json',
      'Error loading modes.json'
    );
    if (modesFileContent) {
      logger.info('init', 'Successfully loaded and parsed modes.json.');
      return modesFileContent;
    } else {
      logger.error(
        'init',
        'modes.json could not be loaded or is empty. Proceeding with minimal default mode config.'
      );
      return getDefaultModesConfig();
    }
  } catch (error) {
    logger.error(
      'init',
      'Critical error loading modes.json. Using hardcoded fallback.',
      error
    );
    return getDefaultModesConfig();
  }
}

/**
 * Returns a minimal fallback modes configuration
 *
 * @returns {Object} Default modes configuration
 */
function getDefaultModesConfig() {
  return {
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
