/**
 * Automatic test discovery system
 * Dynamically imports all test case files to trigger self-registration
 */

import {
  getAllRegisteredTests,
  getAllRegisteredCategories,
  getAllTestFunctions,
  getRegistryStats,
} from './testRegistry.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('testDiscovery', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[testDiscovery] ${message}`, ...data);
  }
}

// List of test case files to import (this is the only manual part)
const TEST_CASE_FILES = [
  './testCases/coreTests.js',
  './testCases/locationPanelTests.js',
  './testCases/exitPanelTests.js',
  './testCases/regionPanelTests.js',
  './testCases/eventsPanelTests.js',
  './testCases/pathAnalyzerTests.js',
  './testCases/settingsPanelTests.js',
  './testCases/JSONPanelTests.js',
  './testCases/testSpoilersPanelTests.js',
];

let discoveryComplete = false;
let discoveryPromise = null;

/**
 * Discover and import all test files
 * This triggers their self-registration
 * @returns {Promise<void>}
 */
export async function discoverTests() {
  if (discoveryComplete) {
    log('info', '[TestDiscovery] Tests already discovered');
    return;
  }

  if (discoveryPromise) {
    log('info', '[TestDiscovery] Discovery already in progress, waiting...');
    return discoveryPromise;
  }

  log('info', '[TestDiscovery] Starting test discovery...');

  discoveryPromise = (async () => {
    // Import files sequentially to maintain order from TEST_CASE_FILES array
    for (const file of TEST_CASE_FILES) {
      try {
        log('info', `[TestDiscovery] Importing ${file}...`);
        await import(file);
        log('info', `[TestDiscovery] Successfully imported ${file}`);
      } catch (error) {
        log('error', `[TestDiscovery] Failed to import ${file}:`, error);
      }
    }

    discoveryComplete = true;

    const stats = getRegistryStats();
    log('info', '[TestDiscovery] Test discovery complete:', stats);

    return stats;
  })();

  return discoveryPromise;
}

/**
 * Get all discovered tests (after discovery is complete)
 * @returns {Array} Array of test definitions
 */
export function getDiscoveredTests() {
  if (!discoveryComplete) {
    log(
      'warn',
      '[TestDiscovery] Tests not yet discovered. Call discoverTests() first.'
    );
    return [];
  }

  return getAllRegisteredTests();
}

/**
 * Get all discovered categories (after discovery is complete)
 * @returns {Object} Categories object
 */
export function getDiscoveredCategories() {
  if (!discoveryComplete) {
    log(
      'warn',
      '[TestDiscovery] Tests not yet discovered. Call discoverTests() first.'
    );
    return {};
  }

  return getAllRegisteredCategories();
}

/**
 * Get all test functions (after discovery is complete)
 * @returns {Object} Object with functionName as key and function as value
 */
export function getDiscoveredTestFunctions() {
  if (!discoveryComplete) {
    log(
      'warn',
      '[TestDiscovery] Tests not yet discovered. Call discoverTests() first.'
    );
    return {};
  }

  return getAllTestFunctions();
}

/**
 * Check if discovery is complete
 * @returns {boolean}
 */
export function isDiscoveryComplete() {
  return discoveryComplete;
}

/**
 * Force rediscovery (mainly for development/testing)
 */
export function forceRediscovery() {
  discoveryComplete = false;
  discoveryPromise = null;
  log(
    'info',
    '[TestDiscovery] Forced rediscovery - next discoverTests() call will reimport files'
  );
}

/**
 * Manual test file registration
 * Allows adding test files without modifying this file
 * @param {string} filePath - Relative path to test file
 */
export async function registerTestFile(filePath) {
  try {
    log('info', `[TestDiscovery] Manually importing ${filePath}...`);
    await import(filePath);
    log('info', `[TestDiscovery] Successfully imported ${filePath}`);
  } catch (error) {
    log('error', `[TestDiscovery] Failed to import ${filePath}:`, error);
    throw error;
  }
}
