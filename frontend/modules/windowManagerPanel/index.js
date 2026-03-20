// windowManagerPanel module entry point
import { WindowManagerUI } from './windowManagerUI.js';
import eventBus from '../../app/core/eventBus.js';

// --- Module Info ---
export const moduleInfo = {
  name: 'windowManagerPanel',
  title: 'Window Manager',
  componentType: 'windowManagerPanel',
  icon: '🪟',
  column: 2, // Middle column
  description: 'Window Manager display panel.',
};

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('windowManagerPanel', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[windowManagerPanel] ${message}`, ...data);
  }
}

// Store module-level references
let moduleEventBus = null;
let moduleId = 'windowManagerPanel';

export async function register(registrationApi) {
    log('info', `[${moduleId} Module] Registering...`);

    // Register panel component for Golden Layout
    registrationApi.registerPanelComponent('windowManagerPanel', WindowManagerUI);

    // Register EventBus publishers
    registrationApi.registerEventBusPublisher('window:loadUrl');
    registrationApi.registerEventBusPublisher('window:close');
    registrationApi.registerEventBusPublisher('windowManager:urlChanged');

    // Register EventBus subscribers
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'windowPanel:opened');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'windowPanel:closed');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'windowPanel:connected');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'windowPanel:error');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'window:connected');
    registrationApi.registerEventBusSubscriberIntent(moduleId, 'window:disconnected');

    // Register module settings schema
    registrationApi.registerSettingsSchema(moduleId, {
        knownPages: {
            type: 'array',
            default: [
                {
                    name: "Text Adventure (Standalone)",
                    url: "./modules/textAdventure-remote/index-window.html",
                    description: "Interactive text adventure running in separate window"
                },
                {
                    name: "Window Base",
                    url: "./modules/window-base/index.html",
                    description: "Basic window module showing connection status and heartbeat"
                }
            ],
            description: 'List of known window applications'
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
    publish: (event, data) => eventBus.publish(event, data, 'windowManagerPanel'),
    subscribe: (event, callback) => eventBus.subscribe(event, callback, 'windowManagerPanel'),
    unsubscribe: (event, callback) => eventBus.unsubscribe(event, callback, 'windowManagerPanel'),
    publishAs: (event, data, source) => eventBus.publish(event, data, source),
    getAllPublishers: () => eventBus.getAllPublishers(),
    getAllSubscribers: () => eventBus.getAllSubscribers(),
    getAllPublishCounts: () => eventBus.getAllPublishCounts(),
  };
}