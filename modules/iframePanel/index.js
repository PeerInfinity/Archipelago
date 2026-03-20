// iframePanel module entry point
import { IframePanelUI } from './iframePanelUI.js';
import eventBus from '../../app/core/eventBus.js';

// --- Module Info ---
export const moduleInfo = {
  name: 'iframePanel',
  title: 'Iframe Panel',
  componentType: 'iframePanel',
  icon: '🖼️',
  column: 3, // Right column
  description: 'Iframe Panel display panel.',
  allowMultipleInstances: true,
};

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('iframePanel', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[iframePanel] ${message}`, ...data);
  }
}

// Store module-level references
let moduleEventBus = null;
let moduleId = 'iframePanel';

export async function register(registrationApi) {
    log('info', `[${moduleId} Module] Registering...`);

    // Register panel component for Golden Layout
    registrationApi.registerPanelComponent('iframePanel', IframePanelUI);

    // Register EventBus publishers
    registrationApi.registerEventBusPublisher('iframePanel:loaded');
    registrationApi.registerEventBusPublisher('iframePanel:unloaded');
    registrationApi.registerEventBusPublisher('iframePanel:error');

    // Register EventBus subscribers
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'iframe:loadUrl');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'iframe:unload');

    // Register module settings schema
    registrationApi.registerSettingsSchema(moduleId, {
        defaultSandbox: {
            type: 'string',
            default: 'allow-scripts allow-same-origin allow-forms',
            description: 'Default iframe sandbox attributes'
        },
        loadTimeout: {
            type: 'number',
            default: 30000,
            description: 'Timeout for iframe loading (ms)'
        }
    });

    log('info', `[${moduleId} Module] Registration complete.`);
}

export async function initialize(mId, priorityIndex, initializationApi) {
    moduleId = mId;
    log('info', `[${moduleId} Module] Initializing with priority ${priorityIndex}...`);

    // Store API references
    moduleEventBus = initializationApi.getEventBus();
    
    // Set up event subscriptions for iframe control
    if (moduleEventBus) {
        moduleEventBus.subscribe('iframe:loadUrl', (data) => {
            // This will be handled by the active iframePanel instance
            log('debug', 'Received iframe:loadUrl event', data);
        });

        moduleEventBus.subscribe('iframe:unload', (data) => {
            // This will be handled by the active iframePanel instance
            log('debug', 'Received iframe:unload event', data);
        });
    }
    
    log('info', `[${moduleId} Module] Initialization complete.`);
}

// Export eventBus getter for use by UI components
export function getModuleEventBus() {
  if (moduleEventBus) return moduleEventBus;
  // Fallback wrapper before initialize() runs (e.g., GoldenLayout component creation)
  return {
    publish: (event, data) => eventBus.publish(event, data, 'iframePanel'),
    subscribe: (event, callback) => eventBus.subscribe(event, callback, 'iframePanel'),
    unsubscribe: (event, callback) => eventBus.unsubscribe(event, callback, 'iframePanel'),
    publishAs: (event, data, source) => eventBus.publish(event, data, source),
    getAllPublishers: () => eventBus.getAllPublishers(),
    getAllSubscribers: () => eventBus.getAllSubscribers(),
    getAllPublishCounts: () => eventBus.getAllPublishCounts(),
  };
}