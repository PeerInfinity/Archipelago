import { PlayerStatePanelUI } from './playerStatePanelUI.js';
import eventBus from '../../app/core/eventBus.js';

// --- Module Info ---
export const moduleInfo = {
  name: 'playerStatePanel',
  title: 'Player State',
  componentType: 'playerStatePanel',
  icon: '👤',
  column: 2, // Middle column
  description: 'Player State display panel.',
};

let _moduleEventBus = null;

export function getModuleEventBus() {
  if (_moduleEventBus) return _moduleEventBus;
  // Fallback wrapper before initialize() runs (e.g., GoldenLayout component creation)
  return {
    publish: (event, data) => eventBus.publish(event, data, 'playerStatePanel'),
    subscribe: (event, callback) => eventBus.subscribe(event, callback, 'playerStatePanel'),
    unsubscribe: (event, callback) => eventBus.unsubscribe(event, callback, 'playerStatePanel'),
    publishAs: (event, data, source) => eventBus.publish(event, data, source),
    getAllPublishers: () => eventBus.getAllPublishers(),
    getAllSubscribers: () => eventBus.getAllSubscribers(),
    getAllPublishCounts: () => eventBus.getAllPublishCounts(),
  };
}

export async function register(registrationApi) {
    // Register the panel component
    registrationApi.registerPanelComponent('playerStatePanel', PlayerStatePanelUI);
}

export function initialize(moduleId, priorityIndex, initializationApi) {
  _moduleEventBus = initializationApi.getEventBus();

  return () => {
    _moduleEventBus = null;
  };
}