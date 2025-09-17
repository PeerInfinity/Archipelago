import loopStateSingleton from './loopStateSingleton.js';
import { getLoopsModuleDispatcher, moduleInfo, getPlayerStateAPI } from './index.js'; // Import the dispatcher getter, moduleInfo, and playerState API
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import discoveryStateSingleton from '../discovery/singleton.js';

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

  // Subscribe to exit click events from the Exits module
  eventBus.subscribe('user:exitClicked', (eventData) => {
    handleUserExitClicked(eventBus, eventData);
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

/**
 * Handles the 'user:exitClicked' event from the Exits module.
 * When loop mode is active, builds a path to the exit and publishes region move events.
 * @param {EventBus} eventBus - The event bus instance
 * @param {object} eventData - The exit click data
 */
function handleUserExitClicked(eventBus, eventData) {
  log('info', '[LoopEvents] Received user:exitClicked event:', eventData);

  // Only process if loop mode is active
  if (!isLoopModeActive) {
    log('info', '[LoopEvents] Loop mode not active, ignoring exit click');
    return;
  }

  const { exitName, sourceRegion, destinationRegion, isDiscovered } = eventData;

  // Get the playerState API
  const playerStateAPI = getPlayerStateAPI();
  if (!playerStateAPI) {
    log('error', '[LoopEvents] PlayerState API not available');
    return;
  }

  // Get current player region
  const currentRegion = playerStateAPI.getCurrentRegion();
  if (!currentRegion) {
    log('error', '[LoopEvents] Could not get current player region');
    return;
  }

  log('info', `[LoopEvents] Processing exit click from ${sourceRegion} to ${destinationRegion}, current region: ${currentRegion}`);

  // Import and use path analyzer to find path to the exit's source region
  import('../pathAnalyzer/pathAnalyzerLogic.js').then((module) => {
    const PathAnalyzerLogic = module.PathAnalyzerLogic;
    const pathAnalyzer = new PathAnalyzerLogic();

    // Find path from current region to the region containing the exit
    const path = pathAnalyzer.findPathInLoopMode(sourceRegion);

    if (!path) {
      log('error', `[LoopEvents] Cannot find path from ${currentRegion} to ${sourceRegion}`);
      if (window.consoleManager) {
        window.consoleManager.print(`Cannot find a path to ${sourceRegion} in discovery mode.`, 'error');
      }
      return;
    }

    log('info', `[LoopEvents] Found path to exit: ${path.join(' -> ')}`);

    // Build the sequence of moves
    const moves = [];

    // First, navigate to the source region if not already there
    for (let i = 0; i < path.length - 1; i++) {
      const fromRegion = path[i];
      const toRegion = path[i + 1];

      // Find the exit that connects these regions
      const instance = stateManager.instance;
      const regionData = instance?.regions[fromRegion];
      const exitToUse = regionData?.exits?.find(
        (e) =>
          e.connected_region === toRegion &&
          discoveryStateSingleton.isExitDiscovered(fromRegion, e.name)
      );

      if (exitToUse) {
        moves.push({
          type: 'regionMove',
          sourceRegion: fromRegion,
          targetRegion: toRegion,
          exitUsed: exitToUse.name
        });
      } else {
        log('warn', `[LoopEvents] Could not find discovered exit from ${fromRegion} to ${toRegion}`);
        // Stop here if we can't find a valid path
        return;
      }
    }

    // Handle the final action based on whether the exit is discovered
    if (!isDiscovered) {
      // Exit is undiscovered - need to explore the source region
      log('info', `[LoopEvents] Exit ${exitName} is undiscovered, adding explore action for ${sourceRegion}`);

      // Add explore custom action
      const exploreAction = {
        type: 'explore',
        regionName: sourceRegion,
        repeatExplore: true // Set repeat explore for undiscovered exits
      };

      // Use playerState API to add the explore action
      if (playerStateAPI.addCustomAction) {
        playerStateAPI.addCustomAction(exploreAction);
        log('info', `[LoopEvents] Added explore action for ${sourceRegion}`);
      } else {
        log('error', '[LoopEvents] addCustomAction not available in playerState API');
      }
    } else {
      // Exit is discovered - add final move through the clicked exit
      moves.push({
        type: 'regionMove',
        sourceRegion: sourceRegion,
        targetRegion: destinationRegion,
        exitUsed: exitName
      });
    }

    // Publish all the region move events
    const dispatcher = getLoopsModuleDispatcher();
    if (dispatcher && moves.length > 0) {
      moves.forEach((move, index) => {
        log('info', `[LoopEvents] Publishing user:regionMove ${index + 1}/${moves.length}: ${move.sourceRegion} -> ${move.targetRegion}`);

        // Publish via dispatcher (like regionGraph does)
        dispatcher.publish('user:regionMove', {
          sourceRegion: move.sourceRegion,
          targetRegion: move.targetRegion,
          exitUsed: move.exitUsed
        });
      });
    } else if (moves.length === 0 && !isDiscovered) {
      // We only added an explore action, no moves needed
      log('info', '[LoopEvents] No moves needed, only explore action was added');
    } else {
      log('error', '[LoopEvents] Dispatcher not available or no moves to publish');
    }
  }).catch((error) => {
    log('error', '[LoopEvents] Failed to load path analyzer:', error);
  });
}
