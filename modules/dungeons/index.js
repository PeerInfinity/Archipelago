import { DungeonUI } from './dungeonUI.js';
import eventBus from '../../app/core/eventBus.js';

// Helper function for logging
function log(level, message, ...data) {
  if (window.logger) {
    window.logger[level]('DungeonsModule', message, ...data);
  } else {
    console.log(`[DungeonsModule] ${message}`, ...data);
  }
}

// --- Module Info ---
export const moduleInfo = {
  name: 'dungeons',
  title: 'Dungeons',
  componentType: 'dungeonsPanel',
  icon: '🏰',
  column: 3, // Right column
  description: 'Dungeons display panel.',
};

class DungeonsModule {
  constructor() {
    this.ui = null;
    log('info', 'Dungeons module instance created.');
  }

  register(registrationApi) {
    registrationApi.registerPanelComponent(
      'dungeonsPanel',
      DungeonUI // Pass the class constructor itself
    );

    // Register EventBus subscriber intentions
    registrationApi.registerEventBusSubscriberIntent('ui:navigateToDungeon');
    registrationApi.registerEventBusSubscriberIntent(
      'stateManager:snapshotUpdated'
    );
    registrationApi.registerEventBusSubscriberIntent('stateManager:ready');
    registrationApi.registerEventBusSubscriberIntent(
      'stateManager:rulesLoaded'
    );
    registrationApi.registerEventBusSubscriberIntent('settings:changed');

    log('info', 'DungeonUI panel component registered.');
  }

  initialize(initializationApi) {
    log('info', 'Dungeons module initialized.');
    // No complex initialization needed for this module at this time
  }
}

const dungeonsModule = new DungeonsModule();

let _moduleEventBus = null;

export function getModuleEventBus() {
  if (_moduleEventBus) return _moduleEventBus;
  // Fallback wrapper before initialize() runs (e.g., GoldenLayout component creation)
  return {
    publish: (event, data) => eventBus.publish(event, data, 'dungeons'),
    subscribe: (event, callback) => eventBus.subscribe(event, callback, 'dungeons'),
    unsubscribe: (event, callback) => eventBus.unsubscribe(event, callback, 'dungeons'),
    publishAs: (event, data, source) => eventBus.publish(event, data, source),
    getAllPublishers: () => eventBus.getAllPublishers(),
    getAllSubscribers: () => eventBus.getAllSubscribers(),
    getAllPublishCounts: () => eventBus.getAllPublishCounts(),
  };
}

export function register(registrationApi) {
  dungeonsModule.register(registrationApi);
}

export function initialize(moduleId, priorityIndex, initializationApi) {
  _moduleEventBus = initializationApi.getEventBus();
  dungeonsModule.initialize(initializationApi);
}
