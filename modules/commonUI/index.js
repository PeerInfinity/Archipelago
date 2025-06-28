import {
  renderLogicTree,
  debounce,
  setColorblindMode,
  createRegionLink,
  createLocationLink,
  applyColorblindClass,
  resetUnknownEvaluationCounter,
  logAndGetUnknownEvaluationCounter,
} from './commonUI.js';
import { stateManagerProxySingleton } from '../stateManager/index.js';

// --- Module Info ---
export const moduleInfo = {
  name: 'CommonUI',
  description: 'Provides shared UI utility functions and components.',
};

// No registration, initialization, or post-initialization needed for this utility module.

// Re-export the imported functions and the locally defined one
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
export default {
  renderLogicTree,
  debounce,
  setColorblindMode,
  createRegionLink,
  createLocationLink,
  applyColorblindClass,
  resetUnknownEvaluationCounter,
  logAndGetUnknownEvaluationCounter,
};
