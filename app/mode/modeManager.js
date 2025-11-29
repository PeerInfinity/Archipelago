// modeManager.js - Mode determination and management
// Extracted from init.js lines 484-590

// Constants for localStorage keys
const LOCAL_STORAGE_MODE_PREFIX = 'archipelagoToolSuite_modeData_';
const LOCAL_STORAGE_LAST_ACTIVE_MODE_KEY = 'archipelagoToolSuite_lastActiveMode';

/**
 * Determines the active mode based on URL parameters and localStorage
 *
 * ⚠️ CRITICAL: This function RETURNS state instead of setting globals.
 * The calling code MUST capture and use the return values:
 *
 * @example
 * // CORRECT:
 * const { currentActiveMode, skipLocalStorageLoad } = await determineActiveMode(logger);
 *
 * // INCORRECT (will lose state):
 * await determineActiveMode(logger); // ❌ Return values ignored!
 *
 * @param {Object} logger - Logger instance (required)
 * @returns {Promise<Object>} Object with currentActiveMode and skipLocalStorageLoad
 * @returns {string} return.currentActiveMode - The determined active mode
 * @returns {boolean} return.skipLocalStorageLoad - Whether to skip localStorage loading
 * @throws {Error} If logger parameter is missing
 */
export async function determineActiveMode(logger) {
  if (!logger) {
    throw new Error('determineActiveMode requires logger parameter');
  }

  logger.info('init', 'Determining active mode...');
  const urlParams = new URLSearchParams(window.location.search);
  const explicitMode = urlParams.get('mode'); // Get explicitMode first

  let currentActiveMode = 'default';
  let skipLocalStorageLoad = false;

  // Case 1: ?mode=reset (special reset keyword)
  if (explicitMode === 'reset') {
    logger.info(
      'init',
      '"?mode=reset" detected. Applying reset: loading "default" files, clearing last active mode and "default" mode data.'
    );
    currentActiveMode = 'default';
    skipLocalStorageLoad = true; // Ensure we load files, not from a potentially stored "reset" mode
    try {
      localStorage.removeItem(LOCAL_STORAGE_LAST_ACTIVE_MODE_KEY);
      localStorage.removeItem(LOCAL_STORAGE_MODE_PREFIX + 'default'); // Clear default mode's saved data specifically
      logger.info(
        'init',
        'Cleared last active mode and "default" mode data from localStorage for mode=reset.'
      );
    } catch (e) {
      logger.error('init', 'Error clearing localStorage during mode=reset:', e);
    }
    return { currentActiveMode, skipLocalStorageLoad }; // Exit early: "default" is set for loading, "reset" is not saved as lastActiveMode
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
    currentActiveMode = modeToLoadDefaultsFor;
    skipLocalStorageLoad = true;
    try {
      localStorage.removeItem(LOCAL_STORAGE_LAST_ACTIVE_MODE_KEY);
      // Clear data for the specific mode being reset TO
      localStorage.removeItem(LOCAL_STORAGE_MODE_PREFIX + modeToLoadDefaultsFor);
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
    return { currentActiveMode, skipLocalStorageLoad }; // Exit early: modeToLoadDefaultsFor is set for loading, not saved as lastActiveMode immediately.
  }

  // Case 3: Standard mode determination (no "mode=reset" and no "reset=true")
  // At this point, explicitMode is not "reset", and resetFlag is false.
  if (explicitMode) {
    logger.info('init', `Mode specified in URL: "${explicitMode}".`);
    // Validate that the mode exists in modes.json (G_modesConfig will be loaded after this)
    // We'll defer validation until after loadModesConfiguration() is called
    currentActiveMode = explicitMode;
  } else {
    try {
      const lastActiveMode = localStorage.getItem(LOCAL_STORAGE_LAST_ACTIVE_MODE_KEY);
      if (lastActiveMode) {
        logger.info(
          'init',
          `Loaded last active mode from localStorage: "${lastActiveMode}".`
        );
        currentActiveMode = lastActiveMode;
      } else {
        logger.info(
          'init',
          'No last active mode in localStorage. Using default: "default".'
        );
        currentActiveMode = 'default'; // Default if nothing else is found
      }
    } catch (e) {
      logger.error(
        'init',
        'Error reading last active mode from localStorage. Using default.',
        e
      );
      currentActiveMode = 'default';
    }
  }

  // Save the determined mode as the last active mode for the next session
  // This block is only reached if it's not a reset scenario (i.e., didn't return early)
  try {
    localStorage.setItem(LOCAL_STORAGE_LAST_ACTIVE_MODE_KEY, currentActiveMode);
    logger.info(
      'init',
      `Saved current active mode to localStorage: "${currentActiveMode}".`
    );
  } catch (e) {
    logger.error('init', 'Error saving last active mode to localStorage.', e);
  }

  return { currentActiveMode, skipLocalStorageLoad };
}

/**
 * Exports the localStorage constants for use in other modules
 */
export { LOCAL_STORAGE_MODE_PREFIX, LOCAL_STORAGE_LAST_ACTIVE_MODE_KEY };
