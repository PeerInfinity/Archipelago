import { RegionGraphUI } from './regionGraphUI.js';

export const moduleInfo = {
  name: 'Region Graph',
  description: 'Interactive visualization of region connectivity graph with deterministic layout',
};

export function register(registrationApi) {
  console.log('[Region Graph Module] Registering...');
  
  registrationApi.registerPanelComponent('regionGraphPanel', RegionGraphUI);
  
  // Register as event publisher for the same events as region links
  registrationApi.registerEventBusPublisher('ui:activatePanel');
  registrationApi.registerEventBusPublisher('ui:navigateToRegion');
  registrationApi.registerEventBusPublisher('regionGraph:nodeSelected');
}

export function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(`[Region Graph Module] Initializing with ID: ${moduleId}`);
}

export function postInitialize(initializationApi) {
  console.log('[Region Graph Module] Post-initialization complete');
}