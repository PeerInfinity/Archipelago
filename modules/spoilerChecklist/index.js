// frontend/modules/spoilerChecklist/index.js

import { SpoilerChecklistUI } from './spoilerChecklistUI.js';

// Helper function for logging
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('spoilerChecklistModule', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[spoilerChecklistModule] ${message}`, ...data);
  }
}

// --- Module Info ---
export const moduleInfo = {
  name: 'spoilerChecklist',
  title: 'Spoiler Checklist',
  componentType: 'spoilerChecklistPanel',
  icon: '📋',
  column: 2, // Middle column
  description: 'Displays sphere log data as an interactive checklist.',
};

/**
 * Registration function for the spoilerChecklist module.
 * @param {object} registrationApi - API provided by the initialization script.
 */
export function register(registrationApi) {
  log('info', '[spoilerChecklist Module] Registering...');

  // Register the panel component
  registrationApi.registerPanelComponent('spoilerChecklistPanel', SpoilerChecklistUI);

  // Declare that this module sends 'user:locationCheck' via the dispatcher
  // (We use the locations module's dispatcher, so we don't need to register as sender)

  log('info', '[spoilerChecklist Module] Registration complete.');
}

/**
 * Initialization function for the spoilerChecklist module.
 * @param {string} moduleId - The unique ID for this module.
 * @param {number} priorityIndex - The loading priority index.
 * @param {object} initializationApi - API provided by the initialization script.
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  log('info', `[${moduleId} Module] Initializing with priority ${priorityIndex}...`);

  // No specific initialization needed beyond panel registration

  log('info', `[${moduleId} Module] Initialization complete.`);
}