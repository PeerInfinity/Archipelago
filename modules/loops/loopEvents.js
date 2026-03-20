import loopStateSingleton from './loopStateSingleton.js';
import { getLoopsModuleDispatcher, moduleInfo, getPlayerStateAPI, getPathFinder } from './index.js'; // Import the dispatcher getter, moduleInfo, and playerState API
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
 * Build a sequence of region moves from a path array.
 * @param {string[]} path - Array of region names from pathfinder
 * @returns {Array|null} Array of move objects, or null on failure
 */
function buildMoveSequence(path) {
  const moves = [];
  for (let i = 0; i < path.length - 1; i++) {
    const fromRegion = path[i];
    const toRegion = path[i + 1];

    const regionData = stateManager.getStaticData()?.regions?.get(fromRegion);
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
      return null;
    }
  }
  return moves;
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
  });

  // Note: user:exitClicked is now handled via dispatcher (handleUserExitClickedForLoops)
}

/**
 * Handles the 'user:locationCheck' event for the Loops module.
 * If loop mode is active, it queues the action.
 * Otherwise, it propagates the event up the chain.
 * @param {object} eventData - The data associated with the event.
 * @param {object} propagationOptions - Options related to event propagation.
 */
export function handleUserLocationCheckForLoops(eventData, propagationOptions) {
  const dispatcher = getLoopsModuleDispatcher();

  // When loop mode is NOT active, just propagate
  if (!isLoopModeActive) {
    if (dispatcher) {
      dispatcher.publishToNextModule(moduleInfo.name, 'user:locationCheck', eventData, { direction: 'up' });
    }
    return;
  }

  // --- Loop mode is active: intercept all location clicks ---
  const locationName = eventData?.locationName;
  const regionName = eventData?.regionName;
  if (!locationName || !regionName) {
    log('warn', '[LoopsModule] Missing locationName or regionName in event data');
    return;
  }

  const isLocationDiscovered = discoveryStateSingleton.isLocationDiscovered(locationName);
  const isRegionDiscovered = discoveryStateSingleton.isRegionDiscovered(regionName);

  if (!isRegionDiscovered) {
    log('info', `[LoopsModule] Region ${regionName} not discovered, ignoring click`);
    return;
  }

  const playerStateAPI = getPlayerStateAPI();
  if (!playerStateAPI) {
    log('error', '[LoopsModule] PlayerState API not available');
    return;
  }

  const pathFinder = getPathFinder();
  if (!pathFinder) {
    log('error', '[LoopsModule] PathFinder not available');
    return;
  }

  const path = pathFinder.findDiscoveredPath(regionName, discoveryStateSingleton);
  if (!path) {
    log('error', `[LoopsModule] Cannot find path to ${regionName}`);
    if (window.consoleManager) {
      window.consoleManager.print(`Cannot find a path to ${regionName} in discovery mode.`, 'error');
    }
    return;
  }

  log('info', `[LoopsModule] Found path to region: ${path.join(' -> ')}`);

  // Clear the current queue before building new one
  loopStateSingleton.resetQueue();

  // Build move sequence along the path
  const moves = buildMoveSequence(path);
  if (!moves) return; // buildMoveSequence logs on failure

  // Publish move events (path to target region)
  if (dispatcher && moves.length > 0) {
    moves.forEach((move) => {
      dispatcher.publish('user:regionMove', {
        sourceRegion: move.sourceRegion,
        targetRegion: move.targetRegion,
        exitUsed: move.exitUsed
      });
    });
  }

  if (isLocationDiscovered) {
    // Discovered location: queue a location check
    if (playerStateAPI.addLocationCheck) {
      playerStateAPI.addLocationCheck(locationName, regionName);
      log('info', `[LoopsModule] Added location check for ${locationName}`);
    }
  } else {
    // Undiscovered location: queue an explore action
    if (playerStateAPI.addCustomAction) {
      playerStateAPI.addCustomAction('explore', {
        regionName: regionName,
        repeatExplore: true
      });
      log('info', `[LoopsModule] Added explore action for ${regionName}`);
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
 * Handles the 'user:exitClicked' event from the Exits module via dispatcher.
 * When loop mode is active, intercepts the event and builds a path to the exit.
 * When loop mode is not active, propagates to the next handler (regions module).
 * @param {object} eventData - The exit click data
 * @param {object} propagationOptions - Options related to event propagation
 */
export function handleUserExitClickedForLoops(eventData, propagationOptions) {
  log('info', '[LoopEvents] Received user:exitClicked event:', eventData);

  const dispatcher = getLoopsModuleDispatcher();

  // If loop mode is NOT active, propagate to next handler (regions module will handle it)
  if (!isLoopModeActive) {
    log('info', '[LoopEvents] Loop mode not active, propagating to next handler');
    if (dispatcher) {
      dispatcher.publishToNextModule(
        moduleInfo.name,
        'user:exitClicked',
        eventData,
        { direction: 'up' }
      );
    } else {
      log('error', '[LoopEvents] Dispatcher not available for propagation');
    }
    return;
  }

  // Loop mode IS active - intercept and handle the event (don't propagate)
  log('info', '[LoopEvents] Loop mode active, intercepting exit click');

  const { exitName, sourceRegion, destinationRegion, isDiscovered } = eventData;

  const playerStateAPI = getPlayerStateAPI();
  if (!playerStateAPI) {
    log('error', '[LoopEvents] PlayerState API not available');
    return;
  }

  const pathFinder = getPathFinder();
  if (!pathFinder) {
    log('error', '[LoopEvents] PathFinder not available');
    return;
  }

  const path = pathFinder.findDiscoveredPath(sourceRegion, discoveryStateSingleton);
  if (!path) {
    log('error', `[LoopEvents] Cannot find path to ${sourceRegion}`);
    if (window.consoleManager) {
      window.consoleManager.print(`Cannot find a path to ${sourceRegion} in discovery mode.`, 'error');
    }
    return;
  }

  log('info', `[LoopEvents] Found path to exit: ${path.join(' -> ')}`);

  // Clear the current queue before building new one
  loopStateSingleton.resetQueue();

  // Build the path moves to the source region
  const moves = buildMoveSequence(path);
  if (!moves) return;

  // If exit is discovered, add the final move through it
  if (isDiscovered) {
    moves.push({
      type: 'regionMove',
      sourceRegion: sourceRegion,
      targetRegion: destinationRegion,
      exitUsed: exitName
    });
  }

  // Publish all the region move events
  const loopDispatcher = getLoopsModuleDispatcher();
  if (loopDispatcher && moves.length > 0) {
    moves.forEach((move) => {
      loopDispatcher.publish('user:regionMove', {
        sourceRegion: move.sourceRegion,
        targetRegion: move.targetRegion,
        exitUsed: move.exitUsed
      });
    });
  }

  // Add explore action if exit is undiscovered
  if (!isDiscovered) {
    if (playerStateAPI.addCustomAction) {
      playerStateAPI.addCustomAction('explore', {
        regionName: sourceRegion,
        repeatExplore: true
      });
      log('info', `[LoopEvents] Added explore action for ${sourceRegion}`);
    }
  }
}
