// frontend/modules/tests/index.js
import { TestUI } from './testUI.js';
import { testLogic } from './testLogic.js';
import eventBus from '../../app/core/eventBus.js'; // Assuming global eventBus

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('testsModule', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[testsModule] ${message}`, ...data);
  }
}

export const moduleInfo = {
  name: 'tests',
  title: 'Tests', // Title for the panel in GoldenLayout
  description: 'Automated application feature testing.',
};

let appInitializationApi = null;

/**
 * Registration function for the Tests module.
 * @param {object} registrationApi - API provided by the initialization script.
 */
export function register(registrationApi) {
  log('info', '[Tests Module] Registering...');

  registrationApi.registerPanelComponent('testsPanel', TestUI);

  registrationApi.registerJsonDataHandler('testsConfig', {
    displayName: 'Tests Configuration',
    defaultChecked: true,
    requiresReload: false, // Test list, enabled states can be updated live. Auto-start applies on next load.
    getSaveDataFunction: async () => {
      log('info', '[Tests Module] getSaveDataFunction called for testsConfig');
      return testLogic.getSavableState();
    },
    applyLoadedDataFunction: async (data) => {
      log(
        'info',
        '[Tests Module] applyLoadedDataFunction called for testsConfig with:',
        data
      );
      log(
        'info',
        '[Tests Module] data.autoStartTestsOnLoad:',
        data?.autoStartTestsOnLoad
      );
      await testLogic.applyLoadedState(data);

      // Debug: Check if auto-start was set
      log(
        'info',
        '[Tests Module] After applyLoadedState (awaited), shouldAutoStartTests():',
        testLogic.shouldAutoStartTests()
      );

      // Optionally, trigger a UI refresh if the panel might already be open
      eventBus.publish('test:listUpdated', {
        tests: await testLogic.getTests(),
      });
    },
  });

  log('info', '[Tests Module] Registration complete.');
}

/**
 * Initialization function for the Tests module.
 * @param {string} moduleId - The unique ID for this module.
 * @param {number} priorityIndex - The loading priority index.
 * @param {object} initializationApi - API provided by the initialization script.
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  log('info', `[Tests Module] Initializing with priority ${priorityIndex}...`);
  appInitializationApi = initializationApi;

  // Pass the initializationApi to testLogic so it can use moduleManager etc.
  testLogic.setInitializationApi(appInitializationApi);
  testLogic.setEventBus(eventBus); // Pass eventBus to testLogic

  // Listen for the app to be fully ready for basic setup
  eventBus.subscribe('app:readyForUiDataLoad', () => {
    log('info', '[Tests Module] app:readyForUiDataLoad received.');

    // Debug: Check current mode
    const currentMode =
      window.G_currentActiveMode ||
      localStorage.getItem('archipelagoToolSuite_lastActiveMode') ||
      'unknown';
    log('info', '[Tests Module] Current application mode:', currentMode);
  });

  // Listen for when test loaded state is fully applied (including auto-start check)
  eventBus.subscribe('test:loadedStateApplied', (eventData) => {
    log('info', '[Tests Module] test:loadedStateApplied received:', eventData);
    log(
      'info',
      '[Tests Module] Auto-start handling is now done by testLogic.applyLoadedState()'
    );
  });

  // Subscribe to test log messages to pipe them to the main logger
  eventBus.subscribe('test:logAdded', (logData) => {
    if (window.logger && typeof window.logger.log === 'function') {
      const { testId, message, type } = logData;
      const category = `TestRunner/${testId}`;
      // Ensure type is a valid logger method, default to 'info'
      const logLevel =
        type && typeof window.logger[type] === 'function' ? type : 'info';
      window.logger[logLevel](category, message);
    } else {
      // Fallback if logger isn't fully available, though unlikely if module logger works
      const consoleFallback = console[type] || console.log;
      consoleFallback(
        `[TestRunner/${logData.testId}] (${logData.type || 'info'}):`,
        logData.message
      );
    }
  });

  log('info', '[Tests Module] Initialization complete.');
}

// Function to allow testLogic.js to get the main initialization API if needed later
// (though direct passing during testLogic.initialize is preferred for now)
export function getAppInitializationApi() {
  return appInitializationApi;
}
