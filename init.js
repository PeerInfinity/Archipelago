// init.js - Slim initialization entry point for the modular frontend
// Refactored from 2,600+ lines to ~100 lines
// Original backed up as init.js.backup

// Import profiler first to capture page load timing
import { profiler, autoEnableFromConfig } from './modules/shared/profiler.js';

// Auto-enable profiling from URL param or localStorage
autoEnableFromConfig();

// Start page load timing immediately
profiler.start('pageLoad');
profiler.start('pageLoad > coreImports');

// Import logger first and make it globally available before other imports
import logger from './app/core/loggerService.js';

// Configure logger with basic settings early
logger.configure({
  defaultLevel: 'WARN',
  moduleLevels: {},
});

// Apply any URL-based logging parameters (e.g., ?log=DEBUG, ?logcat=StateManager:DEBUG)
logger.applyUrlParameters();

// Make logger globally available
window.logger = logger;

// Import core singletons/managers
import panelManagerInstance from './app/core/panelManager.js';
import eventBus from './app/core/eventBus.js';
import settingsManager from './app/core/settingsManager.js';
import { centralRegistry } from './app/core/centralRegistry.js';
import EventDispatcher from './app/core/eventDispatcher.js';

// Make eventBus and centralRegistry globally available
window.eventBus = eventBus;
window.centralRegistry = centralRegistry;

// Register frontend as publisher for events it publishes
centralRegistry.registerEventBusPublisher('core', 'app:fullModeDataLoadedFromStorage');
centralRegistry.registerEventBusPublisher('core', 'module:stateChanged');
centralRegistry.registerEventBusPublisher('core', 'module:loaded');
centralRegistry.registerEventBusPublisher('core', 'module:loadFailed');
centralRegistry.registerEventBusPublisher('core', 'app:modesJsonLoaded');
centralRegistry.registerEventBusPublisher('core', 'app:readyForUiDataLoad');
centralRegistry.registerEventBusPublisher('core', 'app:activeModeDetermined');
centralRegistry.registerEventBusPublisher('core', 'uiHostRegistry:hostStatusChanged');
centralRegistry.registerEventBusPublisher('core', 'ui:activatePanel');
centralRegistry.registerEventBusPublisher('core', 'settings:changed');
centralRegistry.registerEventBusPublisher('panelManager', 'ui:panelManuallyClosed');

// Import layout libraries
import { GoldenLayout } from './libs/golden-layout/js/esm/golden-layout.js';
import mobileLayoutManager from './app/core/mobileLayoutManager.js';

// Import the main initialization orchestrator
import { initializeApplication } from './app/initialization/index.js';

// Import file loading UI utilities
import { incrementFileCounter, addFileError } from './app/initialization/fileLoadingUI.js';

// End core imports timing
profiler.end('coreImports');

// Helper function for logging with fallback
function log(level, message, ...data) {
  const prefix = `[Init - ${level.toUpperCase()}]`;
  switch (level) {
    case 'error':
      console.error(prefix, message, ...data);
      break;
    case 'warn':
      console.warn(prefix, message, ...data);
      break;
    case 'info':
      console.info(prefix, message, ...data);
      break;
    case 'debug':
    case 'verbose':
      console.debug(prefix, message, ...data);
      break;
    default:
      console.log(prefix, message, ...data);
  }
}

/**
 * Fetches JSON from a URL and tracks file loading
 */
async function fetchJson(url, errorMessage, { logLevel = 'error' } = {}) {
  const fileName = url.split('/').pop() || url;

  try {
    // Use cache: 'reload' to validate with server (allows 304 Not Modified)
    // Use cache: 'no-store' when ?nocache=1 is in URL (completely bypasses cache for testing)
    const noCache = new URLSearchParams(window.location.search).has('nocache');
    const response = await fetch(url, { cache: noCache ? 'no-store' : 'reload' });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    incrementFileCounter(fileName, logger);
    return result;
  } catch (error) {
    const logFn = logger[logLevel] || logger.error;
    logFn.call(logger, 'init', `${errorMessage}: ${url}`, error);
    addFileError(fileName, logger);
    return null;
  }
}

// Start the initialization process
profiler.start('pageLoad > initializeApplication');
initializeApplication({
  logger,
  eventBus,
  settingsManager,
  centralRegistry,
  EventDispatcher,
  panelManagerInstance,
  mobileLayoutManager,
  GoldenLayout,
  fetchJson,
  log,
  profiler,
}).then(() => {
  profiler.end('initializeApplication');
  profiler.end('pageLoad');
  if (profiler.enabled) {
    console.log(profiler.report());
  }
}).catch((error) => {
  console.error('[Init] CRITICAL: Application initialization failed:', error);
  log('error', 'Application initialization failed. Check console for details.', error);

  // Try to show error in loading screen
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'color: red; padding: 20px; text-align: center;';
    errorDiv.innerHTML = `
      <h2>Initialization Failed</h2>
      <p>${error.message || 'Unknown error'}</p>
      <p>Check the console for more details.</p>
    `;
    loadingScreen.appendChild(errorDiv);
  }
});
