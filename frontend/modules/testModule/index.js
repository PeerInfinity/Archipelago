import { TestPanelUI } from './testPanelUI.js';

export const moduleInfo = {
  name: 'Test Module',
  description: 'A simple panel loaded dynamically.',
};

/**
 * Registration function for the TestModule.
 */
export function register(registrationApi) {
  console.log('[TestModule] Registering...');
  registrationApi.registerPanelComponent('testPanel', TestPanelUI);
}

/**
 * Initialization function for the TestModule.
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(
    `[TestModule] Initializing module: ${moduleId} (Priority ${priorityIndex})`
  );
  // No complex initialization needed for this test module
}

/**
 * Post-initialization function for the TestModule.
 */
export async function postInitialize(initializationApi) {
  console.log('[TestModule] Post-initializing...');
  // No complex post-initialization needed
}

console.log('[TestModule] index.js loaded'); // Log to confirm script execution
