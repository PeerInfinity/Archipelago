// iframeManagerPanel module entry point
import { IframeManagerUI } from './iframeManagerUI.js';
import eventBus from '../../app/core/eventBus.js';
import { knownIframePages } from '../../app/config/knownIframePages.js';

// --- Module Info ---
export const moduleInfo = {
  name: 'iframeManagerPanel',
  title: 'Iframe Manager',
  componentType: 'iframeManagerPanel',
  icon: '🖼️',
  column: 2, // Middle column
  description: 'Iframe Manager display panel.',
};

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('iframeManagerPanel', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[iframeManagerPanel] ${message}`, ...data);
  }
}

// Store module-level references
let moduleEventBus = null;
let moduleId = 'iframeManagerPanel';

export async function register(registrationApi) {
    log('info', `[${moduleId} Module] Registering...`);

    // Register panel component for Golden Layout
    registrationApi.registerPanelComponent('iframeManagerPanel', IframeManagerUI);

    // Register EventBus publishers
    registrationApi.registerEventBusPublisher('iframe:loadUrl');
    registrationApi.registerEventBusPublisher('iframe:unload');
    registrationApi.registerEventBusPublisher('iframeManager:urlChanged');

    // Register EventBus subscribers
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'iframePanel:loaded');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'iframePanel:unloaded');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'iframePanel:error');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'iframe:connected');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'iframe:disconnected');

    // Register module settings schema
    registrationApi.registerSettingsSchema(moduleId, {
        knownPages: {
            type: 'array',
            default: knownIframePages.map(({ name, url, description }) => ({ name, url, description })),
            description: 'List of known iframe applications'
        },
        allowCustomUrls: {
            type: 'boolean',
            default: true,
            description: 'Allow users to enter custom URLs'
        }
    });

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
    publish: (event, data) => eventBus.publish(event, data, 'iframeManagerPanel'),
    subscribe: (event, callback) => eventBus.subscribe(event, callback, 'iframeManagerPanel'),
    unsubscribe: (event, callback) => eventBus.unsubscribe(event, callback, 'iframeManagerPanel'),
    publishAs: (event, data, source) => eventBus.publish(event, data, source),
    getAllPublishers: () => eventBus.getAllPublishers(),
    getAllSubscribers: () => eventBus.getAllSubscribers(),
    getAllPublishCounts: () => eventBus.getAllPublishCounts(),
  };
}