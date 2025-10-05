// iframeManagerPanel module entry point
import { IframeManagerUI } from './iframeManagerUI.js';

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
const moduleId = 'iframeManagerPanel';

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
            default: [
                {
                    name: "Text Adventure (Standalone)",
                    url: "./modules/textAdventure-remote/index.html",
                    description: "Interactive text adventure running in iframe"
                }
            ],
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
    log('info', `[${moduleId} Module] Initializing with priority ${priorityIndex}...`);
    
    // Store API references
    moduleEventBus = initializationApi.getEventBus();
    
    log('info', `[${moduleId} Module] Initialization complete.`);
}

// Export eventBus for use by UI components
export { moduleEventBus };