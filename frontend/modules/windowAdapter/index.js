// windowAdapter module entry point
import { WindowAdapterCore } from './windowAdapterCore.js';

// --- Module Info ---
export const moduleInfo = {
  name: 'windowAdapter',
  description: 'Adapter for window-based module communication and integration.',
};

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('windowAdapter', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[windowAdapter] ${message}`, ...data);
  }
}

// Store module-level references
let moduleEventBus = null;
let moduleDispatcher = null;
let adapterCore = null;
let moduleRegistrationApi = null;
const moduleId = 'windowAdapter';

export async function register(registrationApi) {
    log('info', `[${moduleId} Module] Registering...`);

    // Store registration API for dynamic publisher registration
    moduleRegistrationApi = registrationApi;

    // Register EventBus publishers for window communication
    registrationApi.registerEventBusPublisher('window:connected');
    registrationApi.registerEventBusPublisher('window:disconnected');
    registrationApi.registerEventBusPublisher('window:error');
    registrationApi.registerEventBusPublisher('window:messageReceived');
    registrationApi.registerEventBusPublisher('window:loadUrl');
    registrationApi.registerEventBusPublisher('window:close');

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
        maxWindows: {
            type: 'number',
            default: 1,
            description: 'Maximum number of concurrent windows (future)'
        },
        connectionTimeout: {
            type: 'number',
            default: 5000,
            description: 'Timeout for window connection establishment (ms)'
        },
        heartbeatInterval: {
            type: 'number',
            default: 30000,
            description: 'Interval for window heartbeat checks (ms)'
        }
    });

    log('info', `[${moduleId} Module] Registration complete.`);
}

/**
 * Function to dynamically register EventBus publishers for windows
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
        log('debug', 'Creating WindowAdapterCore instance...');
        adapterCore = new WindowAdapterCore(moduleEventBus, moduleDispatcher, registerDynamicPublisher);
        log('debug', 'WindowAdapterCore instance created successfully');
        
        // Subscribe to logger configuration updates to sync with windows
        if (moduleEventBus) {
            moduleEventBus.subscribe('logger:configurationUpdated', (loggingConfig) => {
                log('debug', 'Received logger configuration update, broadcasting to windows');
                adapterCore.broadcastLogConfigUpdate(loggingConfig);
            }, moduleId);
        }
        
        // Make adapter core available globally for window panels
        if (typeof window !== 'undefined') {
            window.windowAdapterCore = adapterCore;
            log('debug', 'WindowAdapterCore made available globally');
        }
    } catch (error) {
        log('error', 'Error creating WindowAdapterCore:', error);
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