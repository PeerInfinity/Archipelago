/**
 * Loop Stats Module
 *
 * Provides a panel for displaying detailed action queue analysis,
 * showing mana costs and predicted remaining mana for the loop mode.
 */

import { LoopStatsUI } from './loopStatsUI.js';
import { queueAnalyzer } from './queueAnalyzer.js';
import loopStateSingleton from '../loops/loopStateSingleton.js';
import eventBus from '../../app/core/eventBus.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('loopStatsModule', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[loopStatsModule] ${message}`, ...data);
  }
}

// --- Module Info ---
export const moduleInfo = {
  name: 'loopStats',
  title: 'Loop Stats',
  componentType: 'loopStatsPanel',
  icon: '📊',
  column: 1, // Left column (narrow width design)
  description: 'Detailed action queue analysis with mana cost predictions.',
};

// Store module references
let thisModuleId = moduleInfo.name;
let loopStatsUIInstance = null;
let moduleEventBus = null;
let moduleDispatcher = null;

/**
 * Registration function for the Loop Stats module.
 * @param {object} registrationApi - API provided by the initialization script.
 */
export function register(registrationApi) {
  log('info', `[${moduleInfo.name} Module] Registering...`);

  // Dynamically load module CSS
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.type = 'text/css';
  link.href = 'modules/loopStats/loopStats.css';
  document.head.appendChild(link);
  log('info', `[${moduleInfo.name} Module] CSS loaded`);

  // Register LoopStatsUI as a GoldenLayout panel component
  registrationApi.registerPanelComponent(
    'loopStatsPanel',
    LoopStatsUI
  );

  // Register public functions for external access (e.g., tests)
  registrationApi.registerPublicFunction(moduleInfo.name, 'getQueueAnalyzer', () => {
    return queueAnalyzer;
  });

  registrationApi.registerPublicFunction(moduleInfo.name, 'getAnalysis', () => {
    return queueAnalyzer.getCurrentAnalysis();
  });

  registrationApi.registerPublicFunction(moduleInfo.name, 'getPreviousAnalysis', () => {
    return queueAnalyzer.getPreviousAnalysis();
  });

  registrationApi.registerPublicFunction(moduleInfo.name, 'analyzeQueue', (actionQueue, loopState) => {
    return queueAnalyzer.analyze(actionQueue, loopState || loopStateSingleton);
  });

  registrationApi.registerPublicFunction(moduleInfo.name, 'getSerializableState', () => {
    return queueAnalyzer.getSerializableState();
  });

  // Register events that loopStats publishes
  registrationApi.registerEventBusPublisher('loopStats:analysisUpdated');

  // Register settings schema
  registrationApi.registerSettingsSchema({
    type: 'object',
    properties: {
      showManaCost: {
        type: 'boolean',
        default: false,
        label: 'Show Mana Cost',
      },
      showRemainingMana: {
        type: 'boolean',
        default: true,
        label: 'Show Remaining Mana',
      },
    },
  });

  log('info', `[${moduleInfo.name} Module] Registration complete.`);
}

/**
 * Initialization function for the Loop Stats module.
 * @param {string} moduleId - The unique ID for this module.
 * @param {number} priorityIndex - The loading priority index.
 * @param {object} initializationApi - API provided by the initialization script.
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  thisModuleId = moduleId;
  moduleEventBus = initializationApi.getEventBus();
  moduleDispatcher = initializationApi.getDispatcher();

  log('info', `[${thisModuleId} Module] Initializing with priority ${priorityIndex}...`);

  log('info', `[${thisModuleId} Module] Initialization complete.`);

  // Return cleanup function
  return () => {
    log('info', `[${thisModuleId} Module] Cleaning up...`);
    loopStatsUIInstance = null;
    moduleEventBus = null;
    moduleDispatcher = null;
  };
}

// Helper function for LoopStatsUI to set its instance
export function setLoopStatsUIInstance(instance) {
  loopStatsUIInstance = instance;
  log('info', `[${thisModuleId} Module] LoopStatsUI instance set.`);
}

// Helper function to get the module ID
export function getLoopStatsModuleId() {
  return thisModuleId;
}

// Helper function to get the module's dispatcher instance
export function getModuleDispatcher() {
  return moduleDispatcher;
}

// Helper function to get the module's event bus instance
export function getModuleEventBus() {
  if (moduleEventBus) return moduleEventBus;
  // Fallback wrapper before initialize() runs (e.g., GoldenLayout component creation)
  return {
    publish: (event, data) => eventBus.publish(event, data, 'loopStats'),
    subscribe: (event, callback) => eventBus.subscribe(event, callback, 'loopStats'),
    unsubscribe: (event, callback) => eventBus.unsubscribe(event, callback, 'loopStats'),
    publishAs: (event, data, source) => eventBus.publish(event, data, source),
    getAllPublishers: () => eventBus.getAllPublishers(),
    getAllSubscribers: () => eventBus.getAllSubscribers(),
    getAllPublishCounts: () => eventBus.getAllPublishCounts(),
  };
}

// Helper function to get the queue analyzer
export function getQueueAnalyzer() {
  return queueAnalyzer;
}
