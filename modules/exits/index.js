// UI Class for this module
import { ExitUI } from './exitUI.js';


// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('exitsModule', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[exitsModule] ${message}`, ...data);
  }
}

// --- Module Info ---
export const moduleInfo = {
  name: 'Exits',
  description: 'Exits display panel.',
};

/**
 * Registration function for the Exits module.
 * Registers the exits panel component.
 */
export function register(registrationApi) {
  log('info', '[Exits Module] Registering...');

  // Register the panel component class constructor
  registrationApi.registerPanelComponent('exitsPanel', ExitUI);

  // Register settings schema if needed
  // No specific settings schema for Exits registration.
}
