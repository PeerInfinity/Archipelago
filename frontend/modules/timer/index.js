// frontend/modules/timer/index.js
import { TimerLogic } from './timerLogic.js';
import { TimerUI } from './timerUI.js';
import { centralRegistry } from '../../app/core/centralRegistry.js';
import { stateManagerProxySingleton } from '../stateManager/index.js'; // For dependency injection
import eventBus from '../../app/core/eventBus.js'; // For dependency injection

export const moduleInfo = {
  name: 'Timer',
  description: 'Manages the location check timer and related UI elements.',
};

const TIMER_UI_COMPONENT_TYPE = 'TimerProgressUI'; // Ensure this is unique

let timerLogicInstance = null;
let timerUIInstance = null;
let dispatcher = null; // Stored from initializationApi
let moduleEventBus = null; // Stored from initializationApi
let hostStatusSubscription = null; // To store the unsubscribe handle

/**
 * Registration function for the Timer module.
 * @param {object} registrationApi - API provided by the initialization script.
 */
export function register(registrationApi) {
  console.log(`[Timer Module] Registering module: ${moduleInfo.name}`);

  // Public function for getting DOM element is removed.
  // registrationApi.registerPublicFunction('getTimerUIDOMElement', () => { ... });

  // Register events this module publishes
  registrationApi.registerEventBusPublisher(
    moduleInfo.name,
    'user:locationCheck'
  );
  registrationApi.registerEventBusPublisher(moduleInfo.name, 'timer:started');
  registrationApi.registerEventBusPublisher(moduleInfo.name, 'timer:stopped');
  registrationApi.registerEventBusPublisher(
    moduleInfo.name,
    'timer:progressUpdate'
  );
  registrationApi.registerEventBusPublisher(moduleInfo.name, 'ui:notification');

  // Register events this module subscribes to
  registrationApi.registerEventBusSubscriberIntent(
    moduleInfo.name,
    'loop:modeChanged'
  );
  registrationApi.registerEventBusSubscriberIntent(
    moduleInfo.name,
    'settings:changed'
  );
  registrationApi.registerEventBusSubscriberIntent(
    moduleInfo.name,
    'stateManager:snapshotUpdated'
  );
  registrationApi.registerEventBusSubscriberIntent(
    moduleInfo.name,
    'connection:open'
  );
  registrationApi.registerEventBusSubscriberIntent(
    moduleInfo.name,
    'connection:close'
  );
  registrationApi.registerEventBusSubscriberIntent(
    moduleInfo.name,
    'stateManager:rulesLoaded'
  );
  // New: Register intent to subscribe to host status changes
  registrationApi.registerEventBusSubscriberIntent(
    moduleInfo.name,
    'uiHostRegistry:hostStatusChanged'
  );

  console.log(`[${moduleInfo.name} Module] Registration complete.`);
}

function updateTimerUIHost() {
  if (
    !timerUIInstance ||
    typeof timerUIInstance.attachToHost !== 'function' ||
    typeof timerUIInstance.detachFromHost !== 'function'
  ) {
    console.warn(
      `[${moduleInfo.name} Module] Cannot update Timer UI host: TimerUI instance or its methods not ready.`
    );
    return;
  }

  const activeHosts = centralRegistry.getActiveUIHosts(TIMER_UI_COMPONENT_TYPE);
  console.log(
    `[${moduleInfo.name} Module] Found ${activeHosts.length} active host(s) for Timer UI (${TIMER_UI_COMPONENT_TYPE}).`
  );

  if (activeHosts.length === 0) {
    timerUIInstance.detachFromHost();
    console.log(
      `[${moduleInfo.name} Module] No active host for Timer UI. UI detached.`
    );
    return;
  }

  // getActiveUIHosts already sorts by priority descending. The first one is the winner.
  const chosenHost = activeHosts[0];
  console.log(
    `[${moduleInfo.name} Module] Chosen host for Timer UI: Module '${chosenHost.moduleId}' (Priority ${chosenHost.priority}). Attaching to placeholder:`,
    chosenHost.placeholder
  );
  timerUIInstance.attachToHost(chosenHost.placeholder);
}

/**
 * Initialization function for the Timer module.
 * @param {string} moduleId - The unique ID for this module.
 * @param {number} priorityIndex - The loading priority index.
 * @param {object} initializationApi - API provided by the initialization script.
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(
    `[${moduleInfo.name} Module] Initializing with priority ${priorityIndex}... (ID: ${moduleId})`
  );

  dispatcher = initializationApi.getDispatcher();
  console.log(
    '[Timer Module] dispatcher type from initializationApi:',
    typeof dispatcher,
    dispatcher
  );
  moduleEventBus = initializationApi.getEventBus();

  if (!dispatcher || !moduleEventBus) {
    console.error(
      `[${moduleInfo.name} Module] Critical error: Dispatcher or EventBus not available.`
    );
    return () => {}; // Return an empty cleanup function
  }

  try {
    timerLogicInstance = new TimerLogic({
      stateManager: stateManagerProxySingleton,
      eventBus: moduleEventBus,
      dispatcher: dispatcher,
      moduleName: moduleInfo.name, // Pass module name for logging
    });

    timerUIInstance = new TimerUI({
      timerLogic: timerLogicInstance,
      eventBus: moduleEventBus,
      moduleName: moduleInfo.name, // Pass module name for logging
    });

    if (
      timerLogicInstance &&
      typeof timerLogicInstance.initialize === 'function'
    ) {
      timerLogicInstance.initialize();
    } else {
      console.error(
        `[${moduleInfo.name} Module] timerLogicInstance or its initialize method is problematic.`
      );
    }

    if (timerUIInstance && typeof timerUIInstance.initialize === 'function') {
      timerUIInstance.initialize(); // This should prepare the DOM element but not attach it.

      // Subscribe to host status changes to update UI placement
      hostStatusSubscription = moduleEventBus.subscribe(
        'uiHostRegistry:hostStatusChanged',
        (data) => {
          // Check if the change is relevant to the Timer's UI type
          if (data && data.uiComponentType === TIMER_UI_COMPONENT_TYPE) {
            console.log(
              `[${moduleInfo.name} Module] Host status changed for ${TIMER_UI_COMPONENT_TYPE}. Re-evaluating host for Timer UI.`
            );
            updateTimerUIHost();
          }
        }
      );

      // Initial attempt to place the UI once everything is set up
      // This relies on hosts registering during their own init phase.
      // A more robust solution might involve an 'app:allModulesInitialized' event,
      // or ensuring init.js calls this after all modules init.
      // For now, if hosts are initialized before or concurrently, this should work.
      // A small delay could be a temporary workaround if race conditions occur often.
      setTimeout(updateTimerUIHost, 0); // Use setTimeout to allow other initializations to complete.
    } else {
      console.error(
        `[${moduleInfo.name} Module] timerUIInstance or its initialize method is problematic.`
      );
    }
  } catch (error) {
    console.error(
      `[${moduleInfo.name} Module] Error during instantiation or initialization of TimerLogic/TimerUI:`,
      error
    );
    // Ensure timerUIInstance is null if its instantiation failed
    timerUIInstance = null;
  }

  console.log(`[${moduleInfo.name} Module] Initialization complete.`);

  return () => {
    console.log(`[${moduleInfo.name} Module] Cleaning up...`);
    if (
      hostStatusSubscription &&
      typeof hostStatusSubscription.unsubscribe === 'function'
    ) {
      hostStatusSubscription.unsubscribe();
      hostStatusSubscription = null;
    }
    if (
      timerUIInstance &&
      typeof timerUIInstance.detachFromHost === 'function'
    ) {
      timerUIInstance.detachFromHost(); // Ensure UI is detached on module cleanup
    }
    if (
      timerLogicInstance &&
      typeof timerLogicInstance.dispose === 'function'
    ) {
      timerLogicInstance.dispose();
    }
    if (timerUIInstance && typeof timerUIInstance.dispose === 'function') {
      timerUIInstance.dispose();
    }
    timerLogicInstance = null;
    timerUIInstance = null;
    dispatcher = null;
    moduleEventBus = null;
  };
}

// No postInitialize needed for this module currently.
// export async function postInitialize(initializationApi) {}
