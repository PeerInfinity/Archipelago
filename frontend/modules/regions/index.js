// UI Class for this module
import { RegionUI } from './regionUI.js';

// --- Module Info (Optional) ---
// export const moduleInfo = {
//   name: 'Regions',
//   description: 'Regions display panel.',
// };

// Store module-level references
let moduleEventBus = null;
export let moduleDispatcher = null; // Export the dispatcher
let moduleId = 'regions'; // Store module ID
let moduleUnsubscribeHandles = [];

/**
 * Registration function for the Regions module.
 * Registers the panel component and event intentions.
 */
export function register(registrationApi) {
  console.log(`[${moduleId} Module] Registering...`);

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
    registrationApi.registerEventBusSubscriber(moduleId, eventName);
  });

  // Register EventBus publisher intentions (used by RegionUI)
  registrationApi.registerEventBusPublisher(moduleId, 'ui:navigateToRegion');
  registrationApi.registerEventBusPublisher(moduleId, 'ui:navigateToLocation');

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
  moduleId = mId; // Update module ID from init
  console.log(
    `[${moduleId} Module] Initializing with priority ${priorityIndex}...`
  );

  // Get necessary APIs and store them for potential module-level use
  // and for the panel factory closure
  moduleEventBus = initializationApi.getEventBus();
  moduleDispatcher = initializationApi.getDispatcher();
  // const settings = initializationApi.getModuleSettings();
  // const publicFunc = initializationApi.getModuleFunction;

  // Clean up previous module-level subscriptions if re-initializing
  moduleUnsubscribeHandles.forEach((unsubscribe) => unsubscribe());
  moduleUnsubscribeHandles = [];

  // --- Setup Module-Level Subscriptions Here (if needed) ---
  // Example: If the module itself needs to react globally, not just the UI instance
  // const handleGlobalEvent = (data) => { console.log(`[${moduleId}] Global event received:`, data); };
  // const unsubscribe = moduleEventBus.subscribe('some:globalEvent', handleGlobalEvent);
  // moduleUnsubscribeHandles.push(unsubscribe);
  // --------------------------------------------------------

  if (!moduleDispatcher) {
    console.error(
      `[${moduleId} Module] Failed to get Dispatcher during initialization! Location checks will fail.`
    );
  }

  console.log(`[${moduleId} Module] Initialization complete.`);
}

// Remove postInitialize function entirely
