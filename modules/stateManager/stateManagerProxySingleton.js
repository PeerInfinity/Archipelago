/**
 * State Manager Proxy Singleton
 *
 * Creates and exports a singleton instance of StateManagerProxy for use throughout
 * the application. This ensures a single point of communication with the StateManager
 * web worker.
 *
 * **DATA FLOW**:
 *
 * Singleton Creation:
 *   Input: eventBus instance (application event system)
 *   Processing:
 *     ├─> Import StateManagerProxy class
 *     ├─> Import main thread eventBus
 *     ├─> Instantiate new StateManagerProxy(eventBus)
 *     ├─> Proxy constructor initializes worker
 *   Output: Singleton proxy instance
 *     ├─> Worker thread created and ready
 *     ├─> Event forwarding established
 *     ├─> Window.stateManagerProxy available for debugging
 *
 * Usage Pattern:
 *   ```javascript
 *   import stateManagerProxySingleton from './stateManagerProxySingleton.js';
 *
 *   // All modules use the same proxy instance
 *   await stateManagerProxySingleton.loadRules(rulesData, playerInfo);
 *   const snapshot = stateManagerProxySingleton.getSnapshot();
 *   await stateManagerProxySingleton.addItemToInventory('Progressive Sword');
 *   ```
 *
 * **Architecture Notes**:
 * - Singleton pattern ensures one worker, one proxy
 * - Proxy automatically created on first import
 * - Worker initialized when proxy is constructed
 * - EventBus injected for worker→main thread communication
 * - Exposed to window.stateManagerProxy for console debugging
 *
 * @module stateManager/singleton
 * @see StateManagerProxy
 */

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

/**
 * Singleton instance of StateManagerProxy
 * @type {StateManagerProxy}
 */
export default stateManagerProxySingleton;
