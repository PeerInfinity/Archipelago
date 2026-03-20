// windowPanel module entry point
import { WindowPanelUI } from './windowPanelUI.js';
import eventBus from '../../app/core/eventBus.js';

// --- Module Info ---
export const moduleInfo = {
  name: 'windowPanel',
  title: 'Window Panel',
  componentType: 'windowPanel',
  icon: '🪟',
  column: 3, // Right column
  description: 'Window Panel display panel.',
};

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('windowPanel', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[windowPanel] ${message}`, ...data);
  }
}

// Store module-level references
let moduleEventBus = null;
let moduleId = 'windowPanel';

export async function register(registrationApi) {
    log('info', `[${moduleId} Module] Registering...`);

    // Register panel component for Golden Layout
    registrationApi.registerPanelComponent('windowPanel', WindowPanelUI);

    // Register EventBus publishers
    registrationApi.registerEventBusPublisher('windowPanel:opened');
    registrationApi.registerEventBusPublisher('windowPanel:closed');
    registrationApi.registerEventBusPublisher('windowPanel:connected');
    registrationApi.registerEventBusPublisher('windowPanel:error');

    // Register EventBus subscribers
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'window:loadUrl');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'window:close');

    // Register module settings schema
    registrationApi.registerSettingsSchema(moduleId, {
        defaultWindowFeatures: {
            type: 'string',
            default: 'width=800,height=600,scrollbars=yes,resizable=yes',
            description: 'Default window features'
        },
        connectionTimeout: {
            type: 'number',
            default: 30000,
            description: 'Timeout for window connection (ms)'
        }
    });

    log('info', `[${moduleId} Module] Registration complete.`);
}

export async function initialize(mId, priorityIndex, initializationApi) {
    moduleId = mId;
    log('info', `[${moduleId} Module] Initializing with priority ${priorityIndex}...`);

    // Store API references
    moduleEventBus = initializationApi.getEventBus();
    
    // Set up event subscriptions for window control
    if (moduleEventBus) {
        moduleEventBus.subscribe('window:loadUrl', (data) => {
            // This will be handled by the active windowPanel instance
            log('debug', 'Received window:loadUrl event', data);
        });

        moduleEventBus.subscribe('window:close', (data) => {
            // This will be handled by the active windowPanel instance
            log('debug', 'Received window:close event', data);
        });
    }
    
    log('info', `[${moduleId} Module] Initialization complete.`);
}

// Export eventBus getter for use by UI components
export function getModuleEventBus() {
  if (moduleEventBus) return moduleEventBus;
  // Fallback wrapper before initialize() runs (e.g., GoldenLayout component creation)
  return {
    publish: (event, data) => eventBus.publish(event, data, 'windowPanel'),
    subscribe: (event, callback) => eventBus.subscribe(event, callback, 'windowPanel'),
    unsubscribe: (event, callback) => eventBus.unsubscribe(event, callback, 'windowPanel'),
    publishAs: (event, data, source) => eventBus.publish(event, data, source),
    getAllPublishers: () => eventBus.getAllPublishers(),
    getAllSubscribers: () => eventBus.getAllSubscribers(),
    getAllPublishCounts: () => eventBus.getAllPublishCounts(),
  };
}