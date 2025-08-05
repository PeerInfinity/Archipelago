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
let moduleRegistrationApi = null;
const moduleId = 'iframeAdapter';

export async function register(registrationApi) {
    log('info', `[${moduleId} Module] Registering...`);

    // Store registration API for dynamic publisher registration
    moduleRegistrationApi = registrationApi;

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

/**
 * Function to dynamically register EventBus publishers for iframes
 * @param {string} publisherId - The publisher ID to register
 * @param {string} eventName - The event name to register
 */
function registerDynamicPublisher(publisherId, eventName) {
    if (moduleRegistrationApi) {
        try {
            moduleRegistrationApi.registerEventBusPublisher(eventName, publisherId);
            log('debug', `Dynamically registered publisher ${publisherId} for event ${eventName}`);
        } catch (error) {
            // If registration fails (e.g., already registered), log but don't fail
            log('debug', `Publisher registration for ${publisherId}:${eventName} already exists or failed:`, error);
        }
    } else {
        log('warn', 'Cannot register dynamic publisher - registration API not available');
    }
}

export async function initialize(mId, priorityIndex, initializationApi) {
    log('info', `[${moduleId} Module] Initializing with priority ${priorityIndex}...`);
    
    // Store API references
    moduleEventBus = initializationApi.getEventBus();
    moduleDispatcher = initializationApi.getDispatcher();
    
    try {
        // Create the adapter core instance
        log('debug', 'Creating IframeAdapterCore instance...');
        adapterCore = new IframeAdapterCore(moduleEventBus, moduleDispatcher, registerDynamicPublisher);
        log('debug', 'IframeAdapterCore instance created successfully');
        
        // Subscribe to logger configuration updates to sync with iframes
        if (moduleEventBus) {
            moduleEventBus.subscribe('logger:configurationUpdated', (loggingConfig) => {
                log('debug', 'Received logger configuration update, broadcasting to iframes');
                adapterCore.broadcastLogConfigUpdate(loggingConfig);
            }, moduleId);
        }
        
        // Make adapter core available globally for iframe panels
        if (typeof window !== 'undefined') {
            window.iframeAdapterCore = adapterCore;
            log('debug', 'IframeAdapterCore made available globally');
        }
    } catch (error) {
        log('error', 'Error creating IframeAdapterCore:', error);
        throw error;
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