// frontend/modules/client/core/sharedState.js
// Holds flags used internally by client core modules to coordinate state,
// avoiding the use of the global window object.

export const sharedClientState = {
  processingBatchItems: false, // Flag used by messageHandler
  userClickedItems: new Set(), // Set used by messageHandler and timerState
  pendingLocationChecks: new Set(), // Set used by messageHandler
};
