import { createPlayerStateSingleton, getPlayerStateSingleton } from './singleton.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('playerState', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[playerState] ${message}`, ...data);
  }
}

// Store module-level references
let moduleDispatcher = null;
const moduleId = 'playerState';

export async function register(registrationApi) {
    // Register dispatcher receivers for events
    registrationApi.registerDispatcherReceiver(
        moduleId,
        'state:rulesLoaded',
        handleRulesLoaded
    );
    
    registrationApi.registerDispatcherReceiver(
        moduleId,
        'user:regionMove',
        handleRegionMove,
        { direction: 'up', condition: 'unconditional', timing: 'immediate' }
    );

    // Export public functions
    registrationApi.registerPublicFunction(moduleId, 'getCurrentRegion', () => {
        const playerState = getPlayerStateSingleton();
        return playerState.getCurrentRegion();
    });

    registrationApi.registerPublicFunction(moduleId, 'getState', () => {
        const playerState = getPlayerStateSingleton();
        return playerState;
    });
}

export async function initialize(mId, priorityIndex, initializationApi) {
    log('info', `[${moduleId} Module] Initializing with priority ${priorityIndex}...`);
    
    // Store the dispatcher reference
    moduleDispatcher = initializationApi.getDispatcher();
    
    // Create the singleton instance
    const eventBus = initializationApi.getEventBus();
    createPlayerStateSingleton(eventBus);
    
    log('info', `[${moduleId} Module] Initialization complete.`);
}

function handleRulesLoaded(data, propagationOptions) {
    log('info', `[${moduleId} Module] Received state:rulesLoaded event`);
    
    const playerState = getPlayerStateSingleton();
    playerState.reset();
    
    // Propagate event to the next module (up direction)
    if (moduleDispatcher) {
        moduleDispatcher.publishToNextModule(
            moduleId,
            'state:rulesLoaded',
            data,
            { direction: 'up' }
        );
    } else {
        log('error', `[${moduleId} Module] Dispatcher not available for propagation of state:rulesLoaded event`);
    }
}

function handleRegionMove(data, propagationOptions) {
    log('info', `[${moduleId} Module] Received user:regionMove event`, data);
    
    const playerState = getPlayerStateSingleton();
    if (data && data.targetRegion) {
        playerState.setCurrentRegion(data.targetRegion);
    }
    
    // Propagate event to the next module (up direction)
    if (moduleDispatcher) {
        moduleDispatcher.publishToNextModule(
            moduleId,
            'user:regionMove',
            data,
            { direction: 'up' }
        );
    } else {
        log('error', `[${moduleId} Module] Dispatcher not available for propagation of user:regionMove event`);
    }
}