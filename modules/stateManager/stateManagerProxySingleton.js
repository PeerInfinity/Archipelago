import StateManagerProxy from './stateManagerProxy.js';
// Import the actual eventBus instance
import eventBus from '../../app/core/eventBus.js'; // Corrected path

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('stateManagerProxySingleton', message, ...data);
  } else {
    // In worker context, only log ERROR and WARN levels to keep console clean
    if (level === 'error' || level === 'warn') {
      const consoleMethod =
        console[level === 'info' ? 'log' : level] || console.log;
      consoleMethod(`[stateManagerProxySingleton] ${message}`, ...data);
    }
  }
}

log('info', '[stateManagerProxySingleton] Creating singleton instance...');

// Pass the actual eventBus instance to the constructor
const stateManagerProxySingleton = new StateManagerProxy(eventBus);

// DEBUG: Expose to window for console debugging
if (typeof window !== 'undefined') {
  window.stateManagerProxy = stateManagerProxySingleton;
  log(
    'info',
    '[stateManagerProxySingleton] Exposed to window.stateManagerProxy for debugging'
  );
}

export default stateManagerProxySingleton;
