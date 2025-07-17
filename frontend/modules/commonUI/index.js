console.log('[commonUI] index.js file loaded!');

import {
  renderLogicTree,
  debounce,
  setColorblindMode,
  createRegionLink,
  createLocationLink,
  applyColorblindClass,
  resetUnknownEvaluationCounter,
  logAndGetUnknownEvaluationCounter,
  setEventBus,
} from './commonUI.js';
import { stateManagerProxySingleton } from '../stateManager/index.js';

// --- Module Info ---
export const moduleInfo = {
  name: 'CommonUI',
  description: 'Provides shared UI utility functions and components.',
};

// --- Module Scope Variables ---
let _moduleEventBus = null;
let _moduleDispatcher = null;

// --- Module Registration ---
export function register(registrationApi) {
  console.log('[commonUI] register() function called!');
  
  // Register events that commonUI publishes
  console.log('[commonUI] Registering ui:activatePanel');
  registrationApi.registerEventBusPublisher('ui:activatePanel');
  
  console.log('[commonUI] Registering ui:navigateToRegion');
  registrationApi.registerEventBusPublisher('ui:navigateToRegion');
  
  console.log('[commonUI] Registering ui:navigateToLocation');
  registrationApi.registerEventBusPublisher('ui:navigateToLocation');
  
  console.log('[commonUI] register() function completed!');
}

// --- Module Initialization ---
export async function initialize(moduleId, priorityIndex, initializationApi) {
  // Store APIs for use by commonUI functions
  _moduleEventBus = initializationApi.getEventBus();
  _moduleDispatcher = initializationApi.getDispatcher();

  // Inject eventBus into commonUI.js so it can publish events
  setEventBus(_moduleEventBus);

  // Return cleanup function
  return () => {
    setEventBus(null); // Clear eventBus reference
    _moduleEventBus = null;
    _moduleDispatcher = null;
  };
}

// Re-export the imported functions
export {
  renderLogicTree,
  debounce,
  setColorblindMode,
  createRegionLink,
  createLocationLink,
  applyColorblindClass,
  resetUnknownEvaluationCounter,
  logAndGetUnknownEvaluationCounter,
};

// Provide a default export object containing all functions for convenience,
// matching the previous structure consumers might expect.
// IMPORTANT: Include module lifecycle functions for init.js
export default {
  // Module lifecycle functions
  moduleInfo,
  register,
  initialize,
  
  // Utility functions
  renderLogicTree,
  debounce,
  setColorblindMode,
  createRegionLink,
  createLocationLink,
  applyColorblindClass,
  resetUnknownEvaluationCounter,
  logAndGetUnknownEvaluationCounter,
};
