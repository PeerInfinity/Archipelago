// textAdventure module entry point
import { TextAdventureUI } from './textAdventureUI.js';

// --- Module Info ---
export const moduleInfo = {
  name: 'textAdventure',
  title: 'Text Adventure',
  componentType: 'textAdventurePanel',
  icon: '📖',
  column: 3, // Right column
  description: 'Text Adventure display panel.',
};

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('textAdventure', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[textAdventure] ${message}`, ...data);
  }
}

// Store module-level references
let moduleDispatcher = null;
let moduleEventBus = null;
const moduleId = 'textAdventure';

// Module instances are now managed directly by their classes

export async function register(registrationApi) {
    log('info', `[${moduleId} Module] Registering...`);

    // Register panel component for Golden Layout
    registrationApi.registerPanelComponent('textAdventurePanel', TextAdventureUI);

    registrationApi.registerEventBusPublisher('textAdventure:historyCleared');

    // Note: stateManager events are published via eventBus, not dispatcher
    // So we don't register dispatcher receivers for these events

    registrationApi.registerDispatcherReceiver(
        moduleId,
        'user:regionMove',
        handleRegionMove,
        { direction: 'up', condition: 'unconditional', timing: 'immediate' }
    );

    registrationApi.registerDispatcherReceiver(
        moduleId,
        'user:locationCheck',
        handleLocationCheck,
        { direction: 'up', condition: 'unconditional', timing: 'immediate' }
    );

    // Register dispatcher senders for events we publish
    registrationApi.registerDispatcherSender('user:regionMove', 'down', 'first');
    registrationApi.registerDispatcherSender('user:locationCheck', 'down', 'first');
    
    // Register EventBus publishers
    registrationApi.registerEventBusPublisher('textAdventure:messageAdded');
    registrationApi.registerEventBusPublisher('textAdventure:customDataLoaded');

    // Register module settings schema
    registrationApi.registerSettingsSchema(moduleId, {
        messageHistoryLimit: {
            type: 'number',
            default: 10,
            description: 'Maximum number of messages to keep in history'
        },
        enableDiscoveryMode: {
            type: 'boolean',
            default: false,
            description: 'Enable discovery mode for text adventure'
        }
    });

    log('info', `[${moduleId} Module] Registration complete.`);
}

export async function initialize(mId, priorityIndex, initializationApi) {
    log('info', `[${moduleId} Module] Initializing with priority ${priorityIndex}...`);
    
    // Store API references
    moduleDispatcher = initializationApi.getDispatcher();
    moduleEventBus = initializationApi.getEventBus();
    
    log('info', `[${moduleId} Module] Initialization complete.`);
}

// Event handlers for dispatcher events (user actions)

function handleRegionMove(data, propagationOptions) {
    log('info', `[${moduleId} Module] Received user:regionMove event`, data);
    
    // Propagate event to the next module
    if (moduleDispatcher) {
        moduleDispatcher.publishToNextModule(
            moduleId,
            'user:regionMove',
            data,
            { direction: 'up' }
        );
    }
}

function handleLocationCheck(data, propagationOptions) {
    log('info', `[${moduleId} Module] Received user:locationCheck event`, data);
    
    // Propagate event to the next module
    if (moduleDispatcher) {
        moduleDispatcher.publishToNextModule(
            moduleId,
            'user:locationCheck',
            data,
            { direction: 'up' }
        );
    }
}

// Export dispatcher for use by UI components
export { moduleDispatcher };