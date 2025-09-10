import loopStateSingleton from './loopStateSingleton.js';
import { getLoopsModuleDispatcher, moduleInfo } from './index.js'; // Import the dispatcher getter and moduleInfo

// Track loop mode state
let isLoopModeActive = false;

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('loopEvents', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[loopEvents] ${message}`, ...data);
  }
}

/**
 * Initialize event handlers and subscribe to loop mode changes
 * Should be called when the module initializes
 * @param {EventBus} eventBus - The event bus instance
 */
export function initializeLoopEvents(eventBus) {
  if (!eventBus) {
    log('error', '[LoopEvents] Cannot initialize: EventBus not provided');
    return;
  }

  // Subscribe to loop mode changes from the UI
  eventBus.subscribe('loopUI:modeChanged', (data) => {
    if (data && typeof data.active === 'boolean') {
      isLoopModeActive = data.active;
      log('info', '[LoopEvents] Loop mode changed:', isLoopModeActive);
    }
  }, 'loops');
}

/**
 * Handles the 'user:locationCheck' event for the Loops module.
 * If loop mode is active, it queues the action.
 * Otherwise, it propagates the event up the chain.
 * @param {object} eventData - The data associated with the event.
 * @param {object} propagationOptions - Options related to event propagation.
 */
export function handleUserLocationCheckForLoops(eventData, propagationOptions) {
  log('info', 
    '[LoopsModule] handleUserLocationCheckForLoops received event:',
    eventData ? JSON.parse(JSON.stringify(eventData)) : 'undefined',
    'Propagation:',
    propagationOptions ? JSON.parse(JSON.stringify(propagationOptions)) : 'undefined'
  );
  const dispatcher = getLoopsModuleDispatcher(); // Get the dispatcher

  if (isLoopModeActive) {
    log('info', 
      '[LoopsModule] Handling user:locationCheck in Loop Mode.',
      eventData
    );
    
    // In the new architecture, we let the event continue up to playerState
    // playerState will handle adding the locationCheck to its path
    // Then loopState will read it from there when processing
    
    if (eventData.locationName) {
      // Let the event propagate up so playerState can handle it
      // playerState listens for user:locationCheck and adds it to the path
      if (dispatcher) {
        dispatcher.publishToNextModule(
          moduleInfo.name,
          'user:locationCheck',
          eventData,
          { direction: 'up' }
        );
        log('info', 
          '[LoopsModule] Loop mode active. Propagated user:locationCheck up to playerState.',
          eventData
        );
      } else {
        log('error', 
          '[LoopsModule] Dispatcher not available for propagation in loop mode.'
        );
      }
    } else {
      // Handle "check next available" logic for loop mode if applicable
      log('warn', 
        "[LoopsModule] 'check next available' logic not yet implemented in new architecture."
      );
    }
  } else {
    // Loop mode not active, propagate up normally
    if (dispatcher) {
      dispatcher.publishToNextModule(
        moduleInfo.name,
        'user:locationCheck',
        eventData,
        { direction: 'up' }
      );
      log('info', 
        '[LoopsModule] Loop mode not active. Propagated user:locationCheck up.',
        eventData
      );
    } else {
      log('error', 
        '[LoopsModule] Dispatcher not available for propagation when loop mode is inactive.'
      );
    }
  }
}

/**
 * Handles the 'user:itemCheck' event for the Loops module.
 * Currently just passes the event along since we don't have specific plans for Loops mode.
 * @param {object} eventData - The data associated with the event.
 * @param {object} propagationOptions - Options related to event propagation.
 */
export function handleUserItemCheckForLoops(eventData, propagationOptions) {
  log('info', 
    '[LoopsModule] handleUserItemCheckForLoops received event:',
    eventData ? JSON.parse(JSON.stringify(eventData)) : 'undefined',
    'Propagation:',
    propagationOptions ? JSON.parse(JSON.stringify(propagationOptions)) : 'undefined'
  );
  const dispatcher = getLoopsModuleDispatcher(); // Get the dispatcher

  // For now, Loops module just passes the event on unconditionally
  // In the future, this could handle item checking in loop mode
  log('info', 
    '[LoopsModule] Passing user:itemCheck event to next module.'
  );
  
  if (dispatcher) {
    // Propagation direction is 'up' as specified in registerDispatcherReceiver
    dispatcher.publishToNextModule(
      moduleInfo.name,
      'user:itemCheck',
      eventData,
      { direction: 'up' }
    );
    log('info', 
      '[LoopsModule] Propagated user:itemCheck up.',
      eventData
    );
  } else {
    log('error', 
      '[LoopsModule] Dispatcher not available for propagation of user:itemCheck.'
    );
  }
}
