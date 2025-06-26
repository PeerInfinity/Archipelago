// frontend/modules/timer/index.js
import { TimerLogic } from './timerLogic.js';
import { TimerUI } from './timerUI.js';
import { stateManagerProxySingleton } from '../stateManager/index.js'; // For dependency injection
import eventBus from '../../app/core/eventBus.js'; // For dependency injection


// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('timerModule', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[timerModule] ${message}`, ...data);
  }
}

export const moduleInfo = {
  name: 'Timer',
  description: 'Manages the location check timer and related UI elements.',
};

let timerLogicInstance = null;
let timerUIInstance = null;
let dispatcher = null; // Stored from initializationApi
let moduleEventBus = null; // Stored from initializationApi

/**
 * Registration function for the Timer module.
 * @param {object} registrationApi - API provided by the initialization script.
 */
export function register(registrationApi) {
  log('info', `[Timer Module] Registering module: ${moduleInfo.name}`);

  // Register public functions for UI attachment
  registrationApi.registerPublicFunction(
    moduleInfo.name,
    'attachTimerToHost',
    (placeholderElement) => {
      if (
        timerUIInstance &&
        typeof timerUIInstance.attachToHost === 'function'
      ) {
        log('info', 
          `[Timer Module] attachTimerToHost called with placeholder:`,
          placeholderElement
        );
        timerUIInstance.attachToHost(placeholderElement);
      } else {
        log('error', 
          '[Timer Module] attachTimerToHost called but TimerUI instance or method not ready.'
        );
      }
    }
  );

  registrationApi.registerPublicFunction(
    moduleInfo.name,
    'detachTimerFromHost',
    () => {
      if (
        timerUIInstance &&
        typeof timerUIInstance.detachFromHost === 'function'
      ) {
        log('info', `[Timer Module] detachTimerFromHost called.`);
        timerUIInstance.detachFromHost();
      } else {
        log('error', 
          '[Timer Module] detachTimerFromHost called but TimerUI instance or method not ready.'
        );
      }
    }
  );

  registrationApi.registerPublicFunction(
    moduleInfo.name,
    'setCheckDelay',
    (minSeconds, maxSeconds = null) => {
      if (
        timerLogicInstance &&
        typeof timerLogicInstance.setCheckDelay === 'function'
      ) {
        log('info', 
          `[Timer Module] setCheckDelay called with min=${minSeconds}, max=${maxSeconds}`
        );
        timerLogicInstance.setCheckDelay(minSeconds, maxSeconds);
        return true;
      } else {
        log('error', 
          '[Timer Module] setCheckDelay called but TimerLogic instance or method not ready.'
        );
        return false;
      }
    }
  );

  // Register events this module publishes
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

  // ADDED: Declare that this module sends 'user:locationCheck' via the dispatcher
  registrationApi.registerDispatcherSender('user:locationCheck', {
    initialTarget: 'bottom',
  });

  log('info', `[${moduleInfo.name} Module] Registration complete.`);
}

/**
 * Initialization function for the Timer module.
 * @param {string} moduleId - The unique ID for this module.
 * @param {number} priorityIndex - The loading priority index.
 * @param {object} initializationApi - API provided by the initialization script.
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  log('info', 
    `[${moduleInfo.name} Module] Initializing with priority ${priorityIndex}... (ID: ${moduleId})`
  );

  dispatcher = initializationApi.getDispatcher();
  log('info', 
    '[Timer Module] dispatcher type from initializationApi:',
    typeof dispatcher,
    dispatcher
  );
  moduleEventBus = initializationApi.getEventBus();

  if (!dispatcher || !moduleEventBus) {
    log('error', 
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
      log('error', 
        `[${moduleInfo.name} Module] timerLogicInstance or its initialize method is problematic.`
      );
    }

    if (timerUIInstance && typeof timerUIInstance.initialize === 'function') {
      timerUIInstance.initialize(); // This should prepare the DOM element but not attach it.
    } else {
      log('error', 
        `[${moduleInfo.name} Module] timerUIInstance or its initialize method is problematic.`
      );
    }
  } catch (error) {
    log('error', 
      `[${moduleInfo.name} Module] Error during instantiation or initialization of TimerLogic/TimerUI:`,
      error
    );
    // Ensure timerUIInstance is null if its instantiation failed
    timerUIInstance = null;
  }

  log('info', `[${moduleInfo.name} Module] Initialization complete.`);

  return () => {
    log('info', `[${moduleInfo.name} Module] Cleaning up...`);
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
