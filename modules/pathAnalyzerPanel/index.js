import { PathAnalyzerPanelUI } from './pathAnalyzerPanelUI.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('pathAnalyzerPanelModule', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[pathAnalyzerPanelModule] ${message}`, ...data);
  }
}

export const moduleInfo = {
  name: 'PathAnalyzerPanel',
  title: 'Path Analyzer',
  description:
    'A dedicated panel for path analysis with configurable settings.',
};

let thisModuleId = moduleInfo.name;
let pathAnalyzerPanelUIInstance = null;
let moduleDispatcher = null;
let moduleEventBus = null;

/**
 * Registration function for the PathAnalyzerPanel module.
 * @param {object} registrationApi - API provided by the initialization script.
 */
export function register(registrationApi) {
  log('info', `[${moduleInfo.name} Module] Registering...`);

  // Register PathAnalyzerPanelUI as a GoldenLayout panel component
  registrationApi.registerPanelComponent(
    'pathAnalyzerPanel', // componentType for GoldenLayout
    PathAnalyzerPanelUI // The class constructor for this panel's UI
  );

  log('info', `[${moduleInfo.name} Module] Registration complete.`);
}

/**
 * Initialization function for the PathAnalyzerPanel module.
 * @param {string} moduleId - The unique ID for this module.
 * @param {number} priorityIndex - The loading priority index.
 * @param {object} initializationApi - API provided by the initialization script.
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  thisModuleId = moduleId;
  moduleDispatcher = initializationApi.getDispatcher();
  moduleEventBus = initializationApi.getEventBus();

  log(
    'info',
    `[${thisModuleId} Module] Initializing with priority ${priorityIndex}...`
  );

  log('info', `[${thisModuleId} Module] Initialization complete.`);

  return () => {
    // Cleanup function
    log('info', `[${thisModuleId} Module] Cleaning up...`);
    pathAnalyzerPanelUIInstance = null;
    moduleDispatcher = null;
    moduleEventBus = null;
  };
}

// Helper function for PathAnalyzerPanelUI to set its instance
export function setPathAnalyzerPanelUIInstance(instance) {
  pathAnalyzerPanelUIInstance = instance;
  log('info', `[${thisModuleId} Module] PathAnalyzerPanelUI instance set.`);
}

// Helper function to get the module ID
export function getPathAnalyzerPanelModuleId() {
  return thisModuleId;
}

// Helper function to get the module's dispatcher instance
export function getModuleDispatcher() {
  return moduleDispatcher;
}

// Helper function to get the module's event bus instance
export function getModuleEventBus() {
  return moduleEventBus;
}
