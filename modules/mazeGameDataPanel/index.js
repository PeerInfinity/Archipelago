// mazeGameDataPanel module entry point
import { MazeGameDataPanelUI } from './mazeGameDataPanelUI.js';
import eventBus from '../../app/core/eventBus.js';

// --- Module Info ---
export const moduleInfo = {
  name: 'mazeGameDataPanel',
  title: 'Maze Game Data',
  componentType: 'mazeGameDataPanel',
  icon: '',
  column: 2,
  description: 'View and control A-Mazing-Idle game data.',
};

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('mazeGameDataPanel', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[mazeGameDataPanel] ${message}`, ...data);
  }
}

// Store module-level references
let moduleEventBus = null;
let moduleId = 'mazeGameDataPanel';

export async function register(registrationApi) {
    log('info', `[${moduleId} Module] Registering...`);

    // Register panel component for Golden Layout
    registrationApi.registerPanelComponent('mazeGameDataPanel', MazeGameDataPanelUI);

    // Register EventBus publishers
    registrationApi.registerEventBusPublisher('amazingIdle:exportSave');
    registrationApi.registerEventBusPublisher('amazingIdle:importSave');
    registrationApi.registerEventBusPublisher('amazingIdle:injectPoints');
    registrationApi.registerEventBusPublisher('amazingIdle:setBiome');
    registrationApi.registerEventBusPublisher('amazingIdle:newMaze');
    registrationApi.registerEventBusPublisher('amazingIdle:disableBiomeCheck');
    registrationApi.registerEventBusPublisher('iframe:loadUrl');

    // Register EventBus subscribers
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'iframe:connected');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'iframe:disconnected');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'iframePanel:loaded');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'iframePanel:unloaded');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'amazingIdle:saveExported');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'amazingIdle:mazeCompleted');

    log('info', `[${moduleId} Module] Registration complete.`);
}

export async function initialize(mId, priorityIndex, initializationApi) {
    moduleId = mId;
    log('info', `[${moduleId} Module] Initializing with priority ${priorityIndex}...`);

    // Store API references
    moduleEventBus = initializationApi.getEventBus();

    log('info', `[${moduleId} Module] Initialization complete.`);
}

// Export eventBus getter for use by UI components
export function getModuleEventBus() {
  if (moduleEventBus) return moduleEventBus;
  // Fallback wrapper before initialize() runs (e.g., GoldenLayout component creation)
  return {
    publish: (event, data) => eventBus.publish(event, data, 'mazeGameDataPanel'),
    subscribe: (event, callback) => eventBus.subscribe(event, callback, 'mazeGameDataPanel'),
    unsubscribe: (event, callback) => eventBus.unsubscribe(event, callback, 'mazeGameDataPanel'),
    publishAs: (event, data, source) => eventBus.publish(event, data, source),
    getAllPublishers: () => eventBus.getAllPublishers(),
    getAllSubscribers: () => eventBus.getAllSubscribers(),
    getAllPublishCounts: () => eventBus.getAllPublishCounts(),
  };
}
