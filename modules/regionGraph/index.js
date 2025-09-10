import { RegionGraphUI } from './regionGraphUI.js';
import { createUniversalLogger } from '../../app/core/universalLogger.js';

const logger = createUniversalLogger('regionGraph');

export const moduleInfo = {
  name: 'Region Graph',
  description: 'Interactive visualization of region connectivity graph with deterministic layout',
};

// Store module-level references
export let moduleDispatcher = null; // Export the dispatcher
let moduleId = 'regionGraph'; // Store module ID

export function register(registrationApi) {
  logger.info('Module registering...');
  
  registrationApi.registerPanelComponent('regionGraphPanel', RegionGraphUI);
  
  // Register as event publisher for the same events as region links
  registrationApi.registerEventBusPublisher('ui:activatePanel');
  registrationApi.registerEventBusPublisher('ui:navigateToRegion');
  registrationApi.registerEventBusPublisher('user:regionMove');
  registrationApi.registerEventBusPublisher('user:locationCheck');
  registrationApi.registerEventBusPublisher('regionGraph:nodeSelected');
}

export function initialize(mId, priorityIndex, initializationApi) {
  logger.info(`Module initializing with ID: ${mId}`);
  
  // Store the dispatcher reference
  moduleDispatcher = initializationApi.getDispatcher();
  moduleId = mId;
}

export function postInitialize(initializationApi) {
  logger.info('Post-initialization complete');
}