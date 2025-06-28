// frontend/modules/timerPanel/index.js
import { TimerPanelUI } from './timerPanelUI.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('timerPanelModule', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[timerPanelModule] ${message}`, ...data);
  }
}

// import { centralRegistry } from '../../app/core/centralRegistry.js'; // No longer needed for host registration logic here
// import eventBus from '../../app/core/eventBus.js'; // TimerPanelUI will handle its own eventBus needs

export const moduleInfo = {
  name: 'TimerPanel', // This is the moduleId
  title: 'Timer Display', // Title for the GoldenLayout panel tab
  description: 'A dedicated panel for displaying the Timer UI.',
};

// Define the UI component type it intends to host (must match Timer module's definition)
const HOSTED_UI_COMPONENT_TYPE = 'TimerProgressUI';

let thisModuleId = moduleInfo.name; // To be updated by initialize
// let thisModuleLoadPriority = -1; // To be updated by initialize // REMOVED
let timerPanelUIInstance = null; // Added to hold the UI instance
let moduleDispatcher = null; // Added to hold the dispatcher instance
let moduleEventBus = null; // ADDED: To hold the event bus instance

/**
 * Registration function for the TimerPanel module.
 * @param {object} registrationApi - API provided by the initialization script.
 */
export function register(registrationApi) {
  log('info', `[${moduleInfo.name} Module] Registering...`);

  // Register TimerPanelUI as a GoldenLayout panel component
  registrationApi.registerPanelComponent(
    'timerPanel', // componentType for GoldenLayout
    TimerPanelUI // The class constructor for this panel's UI
  );

  // Register dispatcher receiver for system:rehomeTimerUI
  registrationApi.registerDispatcherReceiver(
    moduleInfo.name,
    'system:rehomeTimerUI',
    (eventData, propagationOptions) => {
      if (
        timerPanelUIInstance &&
        typeof timerPanelUIInstance.handleRehomeTimerUI === 'function'
      ) {
        timerPanelUIInstance.handleRehomeTimerUI(
          eventData,
          propagationOptions,
          moduleDispatcher
        );
      } else {
        log('warn', 
          `[${moduleInfo.name} Module] TimerPanelUI instance not available or handleRehomeTimerUI method missing for event system:rehomeTimerUI. Attempting to propagate.`
        );
        // Explicitly propagate if this module's UI cannot handle the event
        if (
          moduleDispatcher &&
          typeof moduleDispatcher.publishToNextModule === 'function'
        ) {
          moduleDispatcher.publishToNextModule(
            thisModuleId, // or moduleInfo.name, which should be the same as thisModuleId after init
            'system:rehomeTimerUI',
            eventData,
            { direction: 'up' } // CORRECTED: 'up' to go to lower index (higher actual priority)
          );
          log('info', 
            `[${moduleInfo.name} Module] Called publishToNextModule for system:rehomeTimerUI (direction: up) because instance was unavailable.`
          );
        } else {
          log('error', 
            `[${moduleInfo.name} Module] Could not propagate system:rehomeTimerUI: moduleDispatcher or publishToNextModule missing.`
          );
        }
      }
    }
  );

  // This module itself doesn't publish new global events or need specific settings schemas.
  // It will register as a host for the Timer's UI during its own panel's lifecycle.

  log('info', `[${moduleInfo.name} Module] Registration complete.`);
}

/**
 * Initialization function for the TimerPanel module.
 * @param {string} moduleId - The unique ID for this module.
 * @param {number} priorityIndex - The loading priority index.
 * @param {object} initializationApi - API provided by the initialization script.
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  thisModuleId = moduleId; // Store the actual moduleId assigned by the init system
  // thisModuleLoadPriority = priorityIndex; // Store its load priority // REMOVED
  moduleDispatcher = initializationApi.getDispatcher(); // Store dispatcher instance
  moduleEventBus = initializationApi.getEventBus(); // ADDED: Store event bus instance

  log('info', 
    `[${thisModuleId} Module] Initializing with priority ${priorityIndex}...`
  );

  // No specific logic needed here for the module itself beyond panel registration.
  // The TimerPanelUI instance will handle registering itself as a host when it's created by GoldenLayout.

  log('info', `[${thisModuleId} Module] Initialization complete.`);

  return () => {
    // Cleanup function
    log('info', `[${thisModuleId} Module] Cleaning up...`);
    // If there were any module-level subscriptions or resources, clean them here.
    timerPanelUIInstance = null; // Reset instance on cleanup
    moduleDispatcher = null; // Reset dispatcher on cleanup
    moduleEventBus = null; // ADDED: Reset event bus on cleanup
  };
}

// Helper function for TimerPanelUI to get its module's load priority
// This is one way to pass context from module initialization to the panel UI instance.
// export function getTimerPanelModuleLoadPriority() { // REMOVED
//   return thisModuleLoadPriority; // REMOVED
// } // REMOVED

// Helper function for TimerPanelUI to set its instance
export function setTimerPanelUIInstance(instance) {
  timerPanelUIInstance = instance;
  log('info', `[${thisModuleId} Module] TimerPanelUI instance set.`);
}

// Helper function to get the module ID, useful for UI registration
export function getTimerPanelModuleId() {
  return thisModuleId;
}

// Helper function to get the component type it hosts
export function getHostedUIComponentType() {
  return HOSTED_UI_COMPONENT_TYPE;
}

// ADDED: Helper function to get the module's dispatcher instance
export function getModuleDispatcher() {
  return moduleDispatcher;
}

// ADDED: Helper function to get the module's event bus instance
export function getModuleEventBus() {
  return moduleEventBus;
}
