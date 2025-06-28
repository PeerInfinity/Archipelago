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
// let moduleEventBus = null; // Removed unused variable
export let moduleDispatcher = null; // Export the dispatcher
let moduleId = 'regions'; // Store module ID
let moduleUnsubscribeHandles = [];

/**
 * Registration function for the Regions module.
 * Registers the panel component and event intentions.
 */
export function register(registrationApi) {
  log('info', `[${moduleId} Module] Registering...`);

  // Register the panel component CLASS directly
  registrationApi.registerPanelComponent(
    'regionsPanel',
    RegionUI // Pass the class constructor itself
  );

  // Register EventBus subscriber intentions
  const eventsToSubscribe = [
    'stateManager:inventoryChanged',
    'stateManager:regionsComputed',
    'stateManager:locationChecked',
    'stateManager:checkedLocationsCleared',
    'loop:stateChanged',
    'loop:actionCompleted',
    'loop:discoveryChanged',
    'loop:modeChanged',
    'settings:changed', // For colorblind mode etc. within RegionUI
  ];
  eventsToSubscribe.forEach((eventName) => {
    registrationApi.registerEventBusSubscriberIntent(eventName);
  });

  // Register EventBus publisher intentions (used by RegionUI)
  registrationApi.registerEventBusPublisher(moduleId, 'ui:navigateToRegion');
  registrationApi.registerEventBusPublisher(moduleId, 'ui:navigateToLocation');
  registrationApi.registerEventBusPublisher(moduleId, 'ui:navigateToDungeon');
  registrationApi.registerEventBusPublisher(moduleId, 'ui:activatePanel');

  // Register Dispatcher sender intentions (used by RegionUI)
  registrationApi.registerDispatcherSender(
    moduleId,
    'user:checkLocationRequest',
    'bottom',
    'first'
  );

  // Register settings schema if needed
  // registrationApi.registerSettingsSchema(moduleId, { /* ... schema ... */ });
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

  // moduleEventBus = initializationApi.getEventBus(); // Removed unused assignment
  // Assign the dispatcher to the exported variable
  moduleDispatcher = initializationApi.getDispatcher();

  // Example: Subscribe to something using the module-wide eventBus if needed later
  // const handle = moduleEventBus.subscribe('some:event', () => {});
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
