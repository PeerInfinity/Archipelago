// jtaArchipelago module entry point
// Bridges JTA game events (perk task completions) to Archipelago location checks,
// and Archipelago received items to JTA perk grants.

import { JTAArchipelagoLogic } from './jtaArchipelagoLogic.js';
import eventBus from '../../app/core/eventBus.js';

// --- Module Info ---
export const moduleInfo = {
  name: 'jtaArchipelago',
  title: 'JTA Archipelago Bridge',
  componentType: null, // No UI panel
  icon: '',
  description: 'Bridges JTA game events to Archipelago location checks and item grants.',
};

function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('jtaArchipelago', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[jtaArchipelago] ${message}`, ...data);
  }
}

let moduleEventBus = null;
let moduleDispatcher = null;
let logicInstance = null;
const moduleId = 'jtaArchipelago';

export async function register(registrationApi) {
  log('info', `[${moduleId}] Registering...`);

  // Dispatcher: this module sends location checks upward
  registrationApi.registerDispatcherSender('user:locationCheck', 'bottom', 'first');

  // EventBus publishers
  registrationApi.registerEventBusPublisher('jta:grantPerks');
  registrationApi.registerEventBusPublisher('jta:requestGameDefs');

  // EventBus subscribers
  registrationApi.registerEventBusSubscriberIntent(moduleId, 'jta:perkTaskCompleted');
  registrationApi.registerEventBusSubscriberIntent(moduleId, 'jta:perkChanged');
  registrationApi.registerEventBusSubscriberIntent(moduleId, 'jta:gameDefsSnapshot');
  registrationApi.registerEventBusSubscriberIntent(moduleId, 'jta:perksGranted');
  registrationApi.registerEventBusSubscriberIntent(moduleId, 'game:connected');
  registrationApi.registerEventBusSubscriberIntent(moduleId, 'game:itemsReceived');
  registrationApi.registerEventBusSubscriberIntent(moduleId, 'iframe:connected');

  log('info', `[${moduleId}] Registration complete.`);
}

export async function initialize(mId, priorityIndex, initializationApi) {
  log('info', `[${moduleId}] Initializing with priority ${priorityIndex}...`);

  moduleEventBus = initializationApi.getEventBus();
  moduleDispatcher = initializationApi.getDispatcher();

  logicInstance = new JTAArchipelagoLogic(moduleEventBus, moduleDispatcher);
  logicInstance.initialize();

  log('info', `[${moduleId}] Initialization complete.`);
}

// Export eventBus getter for consistency with other modules
export function getModuleEventBus() {
  if (moduleEventBus) return moduleEventBus;
  return {
    publish: (event, data) => eventBus.publish(event, data, moduleId),
    subscribe: (event, callback) => eventBus.subscribe(event, callback, moduleId),
    unsubscribe: (event, callback) => eventBus.unsubscribe(event, callback, moduleId),
  };
}
