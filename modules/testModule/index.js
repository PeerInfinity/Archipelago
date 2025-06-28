import { TestPanelUI } from './testPanelUI.js';


// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('testModule', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[testModule] ${message}`, ...data);
  }
}

export const moduleInfo = {
  name: 'Test Module',
  description: 'A simple panel loaded dynamically.',
};

/**
 * Registration function for the TestModule.
 */
export function register(registrationApi) {
  log('info', '[TestModule] Registering...');
  registrationApi.registerPanelComponent('testPanel', TestPanelUI);
}

/**
 * Initialization function for the TestModule.
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  log('info', 
    `[TestModule] Initializing module: ${moduleId} (Priority ${priorityIndex})`
  );
  // No complex initialization needed for this test module
}

/**
 * Post-initialization function for the TestModule.
 */
export async function postInitialize(initializationApi) {
  log('info', '[TestModule] Post-initializing...');
  // No complex post-initialization needed
}

log('info', '[TestModule] index.js loaded'); // Log to confirm script execution
