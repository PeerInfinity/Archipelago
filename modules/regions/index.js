// UI Class for this module
import { RegionUI } from './regionUI.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('regionsModule', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[regionsModule] ${message}`, ...data);
  }
}

// --- Module Info (Optional) ---
// export const moduleInfo = {
//   name: 'Regions',
//   description: 'Regions display panel.',
// };

// Store module-level references
export let moduleDispatcher = null; // Export the dispatcher
let moduleId = 'regions'; // Store module ID
let moduleUnsubscribeHandles = [];
let regionUIInstance = null; // Store reference to the UI instance

/**
 * Registration function for the Regions module.
 * Registers the panel component and event intentions.
 */
export function register(registrationApi) {
  log('info', `[${moduleId} Module] Registering...`);

  // Create a wrapper to capture the UI instance
  function RegionUIWrapper(container, componentState) {
    regionUIInstance = new RegionUI(container, componentState);
    return regionUIInstance;
  }

  // Register the panel component wrapper
  registrationApi.registerPanelComponent(
    'regionsPanel',
    RegionUIWrapper
  );

  // Register EventBus publisher intentions (used by RegionUI)
  registrationApi.registerEventBusPublisher('ui:navigateToRegion');
  registrationApi.registerEventBusPublisher('ui:navigateToLocation');
  registrationApi.registerEventBusPublisher('ui:navigateToDungeon');
  registrationApi.registerEventBusPublisher('ui:activatePanel');

  // Register Dispatcher sender intentions (used by RegionUI)
  registrationApi.registerDispatcherSender(
    'user:checkLocationRequest',
    'bottom',
    'first'
  );
  
  registrationApi.registerDispatcherSender(
    'user:regionMove',
    'bottom',
    'first'
  );

  // Register dispatcher receiver for user:regionMove events
  registrationApi.registerDispatcherReceiver(
    moduleId,
    'user:regionMove',
    handleRegionMove,
    { direction: 'up', condition: 'unconditional', timing: 'immediate' }
  );

  // Register settings schema if needed
  // registrationApi.registerSettingsSchema(moduleId, { /* ... schema ... */ });
}

// Handler for user:regionMove events
function handleRegionMove(data, propagationOptions) {
  log('info', `[${moduleId} Module] Received user:regionMove event`, data);
  
  // Handle the region move by calling moveToRegion on the UI instance
  if (data && data.sourceRegion && data.targetRegion && regionUIInstance) {
    log('info', `[${moduleId} Module] Processing region move from ${data.sourceRegion} to ${data.targetRegion}`);
    regionUIInstance.moveToRegion(data.sourceRegion, data.targetRegion);
  } else if (!regionUIInstance) {
    log('warn', `[${moduleId} Module] Cannot process region move - UI instance not available`);
  }
  
  // Propagate the event to the next module (up direction)
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

/**
 * Initialization function for the Regions module.
 * Gets core APIs and sets up module-level subscriptions if any.
 */
export async function initialize(mId, priorityIndex, initializationApi) {
  moduleId = mId;
  log(
    'info',
    `[${moduleId} Module] Initializing with priority ${priorityIndex}...`
  );

  // Assign the dispatcher to the exported variable
  moduleDispatcher = initializationApi.getDispatcher();

  // Example: Subscribe to something using the module-wide eventBus if needed later
  // const handle = moduleEventBus.subscribe('some:event', () => {}, 'moduleName');
  // moduleUnsubscribeHandles.push(handle);

  // If the module needs to perform async setup, do it here
  // await someAsyncSetup();

  log('info', `[${moduleId} Module] Initialization complete.`);

  // Return cleanup function if necessary
  return () => {
    log('info', `[${moduleId} Module] Cleaning up...`);
    moduleUnsubscribeHandles.forEach((unsubscribe) => unsubscribe());
    moduleUnsubscribeHandles = [];
    // Any other cleanup specific to this module's initialize phase
    moduleDispatcher = null; // Clear dispatcher reference
  };
}

// Remove postInitialize function entirely
