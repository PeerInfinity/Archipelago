import loopStateSingleton from './loopStateSingleton.js';
import { getLoopsModuleDispatcher, moduleInfo } from './index.js'; // Import the dispatcher getter and moduleInfo

/**
 * Handles the 'user:locationCheck' event for the Loops module.
 * If loop mode is active, it queues the action.
 * Otherwise, it propagates the event up the chain.
 * @param {object} eventData - The data associated with the event.
 * @param {object} propagationOptions - Options related to event propagation.
 */
export function handleUserLocationCheckForLoops(eventData, propagationOptions) {
  console.log(
    '[LoopsModule] handleUserLocationCheckForLoops received event:',
    JSON.parse(JSON.stringify(eventData)),
    'Propagation:',
    JSON.parse(JSON.stringify(propagationOptions))
  );
  const dispatcher = getLoopsModuleDispatcher(); // Get the dispatcher

  if (loopStateSingleton.isLoopModeActive) {
    console.log(
      '[LoopsModule] Handling user:locationCheck in Loop Mode.',
      eventData
    );
    // Logic to queue 'Check Location' or 'Explore' action based on eventData.locationName
    if (eventData.locationName) {
      // Ensure queueAction (or a more specific method like queueCheckLocationAction) exists and is called correctly
      if (typeof loopStateSingleton.queueAction === 'function') {
        loopStateSingleton.queueAction({
          type: 'checkLocation',
          locationName: eventData.locationName,
          regionName: eventData.regionName,
          // pass other relevant data from eventData if needed by the queue action
        });
      } else if (
        typeof loopStateSingleton.queueCheckLocationAction === 'function'
      ) {
        // Fallback to queueCheckLocationAction if queueAction is not generic enough or available
        loopStateSingleton.queueCheckLocationAction(
          eventData.regionName,
          eventData.locationName
        );
      } else {
        console.error(
          '[LoopsModule] No method available on loopStateSingleton to queue location check.'
        );
      }
    } else {
      // Handle "check next available" logic for loop mode if applicable
      // This might involve a specific method on loopStateSingleton
      if (
        typeof loopStateSingleton.determineAndQueueNextLoopAction === 'function'
      ) {
        loopStateSingleton.determineAndQueueNextLoopAction();
      } else {
        console.warn(
          "[LoopsModule] 'check next available' requested in loop mode, but no handler method (determineAndQueueNextLoopAction) found on loopStateSingleton."
        );
      }
    }
    // Event handled locally, do not propagate further up from here based on typical conditional logic.
    // If propagation is desired even when handled, the dispatcher logic here would need to change.
  } else {
    // Loop mode not active, propagate up.
    if (dispatcher) {
      // Propagation direction is 'up' as specified in registerDispatcherReceiver
      dispatcher.publishToNextModule(
        moduleInfo.name,
        'user:locationCheck',
        eventData,
        { direction: 'up' }
      );
      console.log(
        '[LoopsModule] Loop mode not active. Propagated user:locationCheck up.',
        eventData
      );
    } else {
      console.error(
        '[LoopsModule] Dispatcher not available for propagation when loop mode is inactive.'
      );
    }
  }
}
