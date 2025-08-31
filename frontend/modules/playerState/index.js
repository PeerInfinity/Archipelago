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
        'user:regionMove',
        handleRegionMove,
        { direction: 'up', condition: 'unconditional', timing: 'immediate' }
    );
    
    registrationApi.registerDispatcherReceiver(
        moduleId,
        'playerState:trimPath',
        handleTrimPath,
        { direction: 'up', condition: 'unconditional', timing: 'immediate' }
    );

    // Register event publishers
    registrationApi.registerEventBusPublisher('playerState:regionChanged');
    registrationApi.registerEventBusPublisher('playerState:pathUpdated');

    // Export public functions
    registrationApi.registerPublicFunction(moduleId, 'getCurrentRegion', () => {
        const playerState = getPlayerStateSingleton();
        return playerState.getCurrentRegion();
    });

    registrationApi.registerPublicFunction(moduleId, 'getState', () => {
        const playerState = getPlayerStateSingleton();
        return playerState;
    });
    
    registrationApi.registerPublicFunction(moduleId, 'getPath', () => {
        const playerState = getPlayerStateSingleton();
        return playerState.getPath();
    });
    
    registrationApi.registerPublicFunction(moduleId, 'getRegionCounts', () => {
        const playerState = getPlayerStateSingleton();
        return playerState.getRegionCounts();
    });
    
    registrationApi.registerPublicFunction(moduleId, 'setAllowLoops', (allowLoops) => {
        const playerState = getPlayerStateSingleton();
        return playerState.setAllowLoops(allowLoops);
    });
    
    registrationApi.registerPublicFunction(moduleId, 'getAllowLoops', () => {
        const playerState = getPlayerStateSingleton();
        return playerState.getAllowLoops();
    });
}

export async function initialize(mId, priorityIndex, initializationApi) {
    log('info', `[${moduleId} Module] Initializing with priority ${priorityIndex}...`);
    
    // Store the dispatcher reference
    moduleDispatcher = initializationApi.getDispatcher();
    
    // Create the singleton instance
    const eventBus = initializationApi.getEventBus();
    createPlayerStateSingleton(eventBus);
    
    // Subscribe to stateManager:rulesLoaded via eventBus (not dispatcher)
    if (eventBus) {
        eventBus.subscribe('stateManager:rulesLoaded', handleRulesLoaded, moduleId);
        log('info', `[${moduleId} Module] Subscribed to stateManager:rulesLoaded via eventBus`);
    }
    
    log('info', `[${moduleId} Module] Initialization complete.`);
}

function handleRulesLoaded(data, propagationOptions) {
    log('info', `[${moduleId} Module] Received stateManager:rulesLoaded event`);
    
    const playerState = getPlayerStateSingleton();
    playerState.reset();
    
    // Propagate event to the next module (up direction)
    if (moduleDispatcher) {
        moduleDispatcher.publishToNextModule(
            moduleId,
            'stateManager:rulesLoaded',
            data,
            { direction: 'up' }
        );
    } else {
        log('error', `[${moduleId} Module] Dispatcher not available for propagation of stateManager:rulesLoaded event`);
    }
}

function handleRegionMove(data, propagationOptions) {
    log('info', `[${moduleId} Module] Received user:regionMove event`, data);
    
    const playerState = getPlayerStateSingleton();
    const currentRegionBefore = playerState.getCurrentRegion();
    log('info', `[${moduleId} Module] Current region before processing: ${currentRegionBefore}`);
    
    if (data && data.targetRegion) {
        // Update path with exit information BEFORE updating current region
        // This allows updatePath to properly detect the current vs target region
        playerState.updatePath(
            data.targetRegion,
            data.exitName || null,
            data.sourceRegion || null
        );
        
        // Then update current region
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

function handleTrimPath(data, propagationOptions) {
    log('info', `[${moduleId} Module] Received playerState:trimPath event`, data);
    
    const playerState = getPlayerStateSingleton();
    const regionName = data?.regionName || 'Menu';
    const instanceNumber = data?.instanceNumber || 1;
    
    playerState.trimPath(regionName, instanceNumber);
    
    // Propagate event to the next module (up direction)
    if (moduleDispatcher) {
        moduleDispatcher.publishToNextModule(
            moduleId,
            'playerState:trimPath',
            data,
            { direction: 'up' }
        );
    } else {
        log('error', `[${moduleId} Module] Dispatcher not available for propagation of playerState:trimPath event`);
    }
}