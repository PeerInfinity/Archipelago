// iframePanel module entry point
import { IframePanelUI } from './iframePanelUI.js';

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
const moduleId = 'iframePanel';

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
    log('info', `[${moduleId} Module] Initializing with priority ${priorityIndex}...`);
    
    // Store API references
    moduleEventBus = initializationApi.getEventBus();
    
    // Set up event subscriptions for iframe control
    if (moduleEventBus) {
        moduleEventBus.subscribe('iframe:loadUrl', (data) => {
            // This will be handled by the active iframePanel instance
            log('debug', 'Received iframe:loadUrl event', data);
        }, moduleId);

        moduleEventBus.subscribe('iframe:unload', (data) => {
            // This will be handled by the active iframePanel instance
            log('debug', 'Received iframe:unload event', data);
        }, moduleId);
    }
    
    log('info', `[${moduleId} Module] Initialization complete.`);
}

// Export eventBus for use by UI components
export { moduleEventBus };