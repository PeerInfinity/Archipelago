import { RegionGraphUI } from './regionGraphUI.js';
import { createUniversalLogger } from '../../app/core/universalLogger.js';
import eventBus from '../../app/core/eventBus.js';

const logger = createUniversalLogger('regionGraph');

export const moduleInfo = {
  name: 'regionGraph',
  title: 'Region Graph',
  componentType: 'regionGraphPanel',
  icon: '🌐',
  column: 2, // Middle column,
  description: 'Interactive visualization of region connectivity graph with deterministic layout',
};

// Store module-level references
export let moduleDispatcher = null; // Export the dispatcher
let moduleId = 'regionGraph'; // Store module ID
let _moduleEventBus = null;

export function getModuleEventBus() {
  if (_moduleEventBus) return _moduleEventBus;
  // Fallback wrapper before initialize() runs (e.g., GoldenLayout component creation)
  return {
    publish: (event, data) => eventBus.publish(event, data, 'regionGraph'),
    subscribe: (event, callback) => eventBus.subscribe(event, callback, 'regionGraph'),
    unsubscribe: (event, callback) => eventBus.unsubscribe(event, callback, 'regionGraph'),
    publishAs: (event, data, source) => eventBus.publish(event, data, source),
    getAllPublishers: () => eventBus.getAllPublishers(),
    getAllSubscribers: () => eventBus.getAllSubscribers(),
    getAllPublishCounts: () => eventBus.getAllPublishCounts(),
  };
}

export function register(registrationApi) {
  logger.info('Module registering...');
  
  registrationApi.registerPanelComponent('regionGraphPanel', RegionGraphUI);
  
  // Register as event publisher for the same events as region links
  registrationApi.registerEventBusPublisher('ui:activatePanel');
  registrationApi.registerEventBusPublisher('ui:navigateToRegion');
  registrationApi.registerDispatcherSender('user:regionMove', 'bottom', 'first');
  registrationApi.registerDispatcherSender('user:locationCheck', 'bottom', 'first');
  registrationApi.registerEventBusPublisher('regionGraph:nodeSelected');
}

export function initialize(mId, priorityIndex, initializationApi) {
  logger.info(`Module initializing with ID: ${mId}`);
  
  // Store the dispatcher reference
  moduleDispatcher = initializationApi.getDispatcher();
  _moduleEventBus = initializationApi.getEventBus();
  moduleId = mId;
}

export function postInitialize(initializationApi) {
  logger.info('Post-initialization complete');
}