import { TestCaseUI } from './testCaseUI.js';

// --- Module Info ---
export const moduleInfo = {
  name: 'testCases',
  title: 'Test Cases', // Title for the panel
  description: 'Provides UI for loading and running test cases.',
};

// --- Module Scope Variables ---
// let testCaseUIInstance = null;
// let moduleEventBus = null;

/**
 * Registration function for the TestCases module.
 * Registers the panel component and declares event intentions.
 * @param {object} registrationApi - API provided by the initialization script.
 */
export function register(registrationApi) {
  console.log('[TestCases Module] Registering...');

  // Register the panel component
  registrationApi.registerPanelComponent('testCasesPanel', TestCaseUI);

  // Declare events published by TestCaseUI
  registrationApi.registerEventBusPublisher(moduleInfo.name, 'ui:notification');

  // Declare events subscribed to by TestCaseUI
  // Note: The actual subscription logic remains within TestCaseUI.initialize
  // due to how PanelManager instantiates components.
  registrationApi.registerEventBusSubscriberIntent(
    moduleInfo.name,
    'ui:fileViewChanged'
  );

  console.log('[TestCases Module] Registration complete.');
}

/**
 * Initialization function for the TestCases module.
 * Currently minimal.
 * @param {string} moduleId - The unique ID for this module ('testCases').
 * @param {number} priorityIndex - The loading priority index.
 * @param {object} initializationApi - API provided by the initialization script.
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(
    `[TestCases Module] Initializing with priority ${priorityIndex}...`
  );

  // moduleEventBus = initializationApi.getEventBus();
  // No dependency injection into TestCaseUI needed via this function for now.

  console.log('[TestCases Module] Initialization complete.');

  return null; // No cleanup needed
}

// No postInitialize needed
