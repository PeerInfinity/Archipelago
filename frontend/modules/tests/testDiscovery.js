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

// List of test case files to import (this is the only manual part)
const TEST_CASE_FILES = [
  './testCases/coreTests.js',
  './testCases/stateManagementTests.js',
  './testCases/uiInteractionTests.js',
  './testCases/progressiveItemsTests.js',
  './testCases/settingsTests.js',
  './testCases/clientMessageTests.js',
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
    console.log('[TestDiscovery] Tests already discovered');
    return;
  }

  if (discoveryPromise) {
    console.log('[TestDiscovery] Discovery already in progress, waiting...');
    return discoveryPromise;
  }

  console.log('[TestDiscovery] Starting test discovery...');

  discoveryPromise = (async () => {
    const importPromises = TEST_CASE_FILES.map(async (file) => {
      try {
        console.log(`[TestDiscovery] Importing ${file}...`);
        await import(file);
        console.log(`[TestDiscovery] Successfully imported ${file}`);
      } catch (error) {
        console.error(`[TestDiscovery] Failed to import ${file}:`, error);
      }
    });

    await Promise.all(importPromises);

    discoveryComplete = true;

    const stats = getRegistryStats();
    console.log('[TestDiscovery] Test discovery complete:', stats);

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
    console.warn(
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
    console.warn(
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
    console.warn(
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
  console.log(
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
    console.log(`[TestDiscovery] Manually importing ${filePath}...`);
    await import(filePath);
    console.log(`[TestDiscovery] Successfully imported ${filePath}`);
  } catch (error) {
    console.error(`[TestDiscovery] Failed to import ${filePath}:`, error);
    throw error;
  }
}
