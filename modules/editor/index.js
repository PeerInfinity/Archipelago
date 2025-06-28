// UI Class for this module
import EditorUI from './editorUI.js';


// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('editorModule', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[editorModule] ${message}`, ...data);
  }
}

// --- Module Info ---
export const moduleInfo = {
  name: 'Plain Text Editor',
  description: 'Text Editor panel.',
};

/**
 * Registration function for the Editor module.
 * Registers the editor panel component.
 */
export function register(registrationApi) {
  log('info', '[Editor Module] Registering...');
  registrationApi.registerPanelComponent('editorPanel', EditorUI);
}
