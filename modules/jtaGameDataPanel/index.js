// jtaGameDataPanel module entry point
import { JTAGameDataPanelUI } from './jtaGameDataPanelUI.js';
import eventBus from '../../app/core/eventBus.js';

// --- Module Info ---
export const moduleInfo = {
  name: 'jtaGameDataPanel',
  title: 'JTA Game Data',
  componentType: 'jtaGameDataPanel',
  icon: '',
  column: 2,
  description: 'View and control Journey to Ascension game data.',
};

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('jtaGameDataPanel', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[jtaGameDataPanel] ${message}`, ...data);
  }
}

// Store module-level references
let moduleEventBus = null;
let moduleId = 'jtaGameDataPanel';

export async function register(registrationApi) {
    log('info', `[${moduleId} Module] Registering...`);

    // Register panel component for Golden Layout
    registrationApi.registerPanelComponent('jtaGameDataPanel', JTAGameDataPanelUI);

    // Register EventBus publishers
    registrationApi.registerEventBusPublisher('jta:exportSave');
    registrationApi.registerEventBusPublisher('jta:importSave');
    registrationApi.registerEventBusPublisher('jta:requestState');
    registrationApi.registerEventBusPublisher('jta:requestDetailedState');
    registrationApi.registerEventBusPublisher('jta:requestGameDefs');
    registrationApi.registerEventBusPublisher('jta:replaceGameData');
    registrationApi.registerEventBusPublisher('iframe:loadUrl');

    // Register EventBus subscribers
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'iframe:connected');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'iframe:disconnected');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'iframePanel:loaded');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'iframePanel:unloaded');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'jta:saveExported');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'jta:stateSnapshot');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'jta:detailedStateSnapshot');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'jta:zoneChanged');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'jta:energyReset');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'jta:prestige');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'jta:perkChanged');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'jta:perkTaskCompleted');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'jta:perksGranted');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'jta:taskClicked');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'jta:itemClicked');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'jta:prestigeDone');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'jta:taskStatus');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'jta:gameDefsSnapshot');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'files:jsonLoaded');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'jta:gameDataReplaced');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'jta:energyDepleted');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'jta:gameOverDismissed');

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
    publish: (event, data) => eventBus.publish(event, data, 'jtaGameDataPanel'),
    subscribe: (event, callback) => eventBus.subscribe(event, callback, 'jtaGameDataPanel'),
    unsubscribe: (event, callback) => eventBus.unsubscribe(event, callback, 'jtaGameDataPanel'),
    publishAs: (event, data, source) => eventBus.publish(event, data, source),
    getAllPublishers: () => eventBus.getAllPublishers(),
    getAllSubscribers: () => eventBus.getAllSubscribers(),
    getAllPublishCounts: () => eventBus.getAllPublishCounts(),
  };
}
