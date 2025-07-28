// iframeAdapter module entry point
import { IframeAdapterCore } from './iframeAdapterCore.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('iframeAdapter', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[iframeAdapter] ${message}`, ...data);
  }
}

// Store module-level references
let moduleEventBus = null;
let moduleDispatcher = null;
let adapterCore = null;
const moduleId = 'iframeAdapter';

export async function register(registrationApi) {
    log('info', `[${moduleId} Module] Registering...`);

    // Register EventBus publishers for iframe communication
    registrationApi.registerEventBusPublisher('iframe:connected');
    registrationApi.registerEventBusPublisher('iframe:disconnected');
    registrationApi.registerEventBusPublisher('iframe:error');
    registrationApi.registerEventBusPublisher('iframe:messageReceived');

    // Register EventBus subscribers - we need to listen to all events to bridge them
    registrationApi.registerEventBusSubscriberIntent(moduleId, '*'); // Listen to all events

    // Register dispatcher receivers to listen to all dispatcher events
    registrationApi.registerDispatcherReceiver(
        moduleId,
        '*', // Listen to all events
        handleDispatcherEvent,
        { direction: 'both', condition: 'unconditional', timing: 'immediate' }
    );

    // Register module settings schema
    registrationApi.registerSettingsSchema(moduleId, {
        maxIframes: {
            type: 'number',
            default: 1,
            description: 'Maximum number of concurrent iframes (future)'
        },
        connectionTimeout: {
            type: 'number',
            default: 5000,
            description: 'Timeout for iframe connection establishment (ms)'
        },
        heartbeatInterval: {
            type: 'number',
            default: 30000,
            description: 'Interval for iframe heartbeat checks (ms)'
        }
    });

    log('info', `[${moduleId} Module] Registration complete.`);
}

export async function initialize(mId, priorityIndex, initializationApi) {
    log('info', `[${moduleId} Module] Initializing with priority ${priorityIndex}...`);
    
    // Store API references
    moduleEventBus = initializationApi.getEventBus();
    moduleDispatcher = initializationApi.getDispatcher();
    
    // Create the adapter core instance
    adapterCore = new IframeAdapterCore(moduleEventBus, moduleDispatcher);
    
    // Make adapter core available globally for iframe panels
    if (typeof window !== 'undefined') {
        window.iframeAdapterCore = adapterCore;
    }
    
    log('info', `[${moduleId} Module] Initialization complete.`);
}

// Event handler for dispatcher events
function handleDispatcherEvent(data, propagationOptions) {
    if (adapterCore) {
        // Forward all dispatcher events to the adapter core for potential bridging
        adapterCore.handleDispatcherEvent(data, propagationOptions);
    }
}

// Export adapter core for use by other modules
export { adapterCore };