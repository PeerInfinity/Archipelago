// frontend/modules/timerPanel/index.js
import { TimerPanelUI } from './timerPanelUI.js';
import { centralRegistry } from '../../app/core/centralRegistry.js'; // For registering as a host
import eventBus from '../../app/core/eventBus.js'; // For listening to its own panel events

export const moduleInfo = {
  name: 'TimerPanel', // This is the moduleId
  title: 'Timer Display', // Title for the GoldenLayout panel tab
  description: 'A dedicated panel for displaying the Timer UI.',
};

// Define the UI component type it intends to host (must match Timer module's definition)
const HOSTED_UI_COMPONENT_TYPE = 'TimerProgressUI';

let thisModuleId = moduleInfo.name; // To be updated by initialize
let thisModuleLoadPriority = -1; // To be updated by initialize

/**
 * Registration function for the TimerPanel module.
 * @param {object} registrationApi - API provided by the initialization script.
 */
export function register(registrationApi) {
  console.log(`[${moduleInfo.name} Module] Registering...`);

  // Register TimerPanelUI as a GoldenLayout panel component
  registrationApi.registerPanelComponent(
    'timerPanel', // componentType for GoldenLayout
    TimerPanelUI // The class constructor for this panel's UI
  );

  // This module itself doesn't publish new global events or need specific settings schemas.
  // It will register as a host for the Timer's UI during its own panel's lifecycle.

  console.log(`[${moduleInfo.name} Module] Registration complete.`);
}

/**
 * Initialization function for the TimerPanel module.
 * @param {string} moduleId - The unique ID for this module.
 * @param {number} priorityIndex - The loading priority index.
 * @param {object} initializationApi - API provided by the initialization script.
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  thisModuleId = moduleId; // Store the actual moduleId assigned by the init system
  thisModuleLoadPriority = priorityIndex; // Store its load priority

  console.log(
    `[${thisModuleId} Module] Initializing with priority ${priorityIndex}...`
  );

  // No specific logic needed here for the module itself beyond panel registration.
  // The TimerPanelUI instance will handle registering itself as a host when it's created by GoldenLayout.

  console.log(`[${thisModuleId} Module] Initialization complete.`);

  return () => {
    // Cleanup function
    console.log(`[${thisModuleId} Module] Cleaning up...`);
    // If there were any module-level subscriptions or resources, clean them here.
  };
}

// Helper function for TimerPanelUI to get its module's load priority
// This is one way to pass context from module initialization to the panel UI instance.
export function getTimerPanelModuleLoadPriority() {
  return thisModuleLoadPriority;
}

// Helper function to get the module ID, useful for UI registration
export function getTimerPanelModuleId() {
  return thisModuleId;
}

// Helper function to get the component type it hosts
export function getHostedUIComponentType() {
  return HOSTED_UI_COMPONENT_TYPE;
}
