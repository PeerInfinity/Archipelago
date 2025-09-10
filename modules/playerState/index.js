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
    
    registrationApi.registerDispatcherReceiver(
        moduleId,
        'user:locationCheck',
        handleLocationCheck,
        { direction: 'up', condition: 'unconditional', timing: 'immediate' }
    );
    
    registrationApi.registerDispatcherReceiver(
        moduleId,
        'user:customAction',
        handleCustomAction,
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
    
    registrationApi.registerPublicFunction(moduleId, 'trimPath', (regionName, instanceNumber) => {
        const playerState = getPlayerStateSingleton();
        return playerState.trimPath(regionName, instanceNumber);
    });
    
    registrationApi.registerPublicFunction(moduleId, 'addLocationCheck', (locationName, regionName) => {
        const playerState = getPlayerStateSingleton();
        return playerState.addLocationCheck(locationName, regionName);
    });
    
    registrationApi.registerPublicFunction(moduleId, 'addCustomAction', (actionName, params) => {
        const playerState = getPlayerStateSingleton();
        return playerState.addCustomAction(actionName, params);
    });
    
    registrationApi.registerPublicFunction(moduleId, 'insertLocationCheckAt', (locationName, targetRegionName, targetInstanceNumber, locationRegionName) => {
        const playerState = getPlayerStateSingleton();
        return playerState.insertLocationCheckAt(locationName, targetRegionName, targetInstanceNumber, locationRegionName);
    });
    
    registrationApi.registerPublicFunction(moduleId, 'insertCustomActionAt', (actionName, targetRegionName, targetInstanceNumber, params) => {
        const playerState = getPlayerStateSingleton();
        return playerState.insertCustomActionAt(actionName, targetRegionName, targetInstanceNumber, params);
    });
    
    registrationApi.registerPublicFunction(moduleId, 'removeLocationCheckAt', (locationName, targetRegionName, targetInstanceNumber) => {
        const playerState = getPlayerStateSingleton();
        return playerState.removeLocationCheckAt(locationName, targetRegionName, targetInstanceNumber);
    });
    
    registrationApi.registerPublicFunction(moduleId, 'removeCustomActionAt', (actionName, targetRegionName, targetInstanceNumber) => {
        const playerState = getPlayerStateSingleton();
        return playerState.removeCustomActionAt(actionName, targetRegionName, targetInstanceNumber);
    });
    
    registrationApi.registerPublicFunction(moduleId, 'clearActionsAt', (targetRegionName, targetInstanceNumber) => {
        const playerState = getPlayerStateSingleton();
        return playerState.clearActionsAt(targetRegionName, targetInstanceNumber);
    });
    
    registrationApi.registerPublicFunction(moduleId, 'removeAllActionsOfType', (actionType, specificName) => {
        const playerState = getPlayerStateSingleton();
        return playerState.removeAllActionsOfType(actionType, specificName);
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
        // Check if path should be updated (default: true)
        const shouldUpdatePath = data.updatePath !== false;
        log('info', `[${moduleId} Module] Path update enabled: ${shouldUpdatePath}`);
        
        if (shouldUpdatePath) {
            // Update path with exit information BEFORE updating current region
            // This allows updatePath to properly detect the current vs target region
            playerState.updatePath(
                data.targetRegion,
                data.exitName || null,
                data.sourceRegion || null
            );
        }
        
        // Always update current region
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

function handleLocationCheck(data, propagationOptions) {
    log('info', `[${moduleId} Module] Received user:locationCheck event`, data);
    
    const playerState = getPlayerStateSingleton();
    if (data && data.locationName) {
        playerState.addLocationCheck(data.locationName, data.regionName);
    }
    
    // Propagate event to the next module (up direction)
    if (moduleDispatcher) {
        moduleDispatcher.publishToNextModule(
            moduleId,
            'user:locationCheck',
            data,
            { direction: 'up' }
        );
    } else {
        log('error', `[${moduleId} Module] Dispatcher not available for propagation of user:locationCheck event`);
    }
}

function handleCustomAction(data, propagationOptions) {
    log('info', `[${moduleId} Module] Received user:customAction event`, data);
    
    const playerState = getPlayerStateSingleton();
    if (data && data.actionName) {
        playerState.addCustomAction(data.actionName, data.params || {});
    }
    
    // Propagate event to the next module (up direction)
    if (moduleDispatcher) {
        moduleDispatcher.publishToNextModule(
            moduleId,
            'user:customAction',
            data,
            { direction: 'up' }
        );
    } else {
        log('error', `[${moduleId} Module] Dispatcher not available for propagation of user:customAction event`);
    }
}