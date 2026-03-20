import { HelperUI } from './helperUI.js';
import eventBus from '../../app/core/eventBus.js';

// Helper function for logging
function log(level, message, ...data) {
  if (window.logger) {
    window.logger[level]('HelpersModule', message, ...data);
  } else {
    console.log(`[HelpersModule] ${message}`, ...data);
  }
}

// --- Module Info ---
export const moduleInfo = {
  name: 'helpers',
  title: 'Helpers',
  componentType: 'helpersPanel',
  icon: 'fn',
  column: 3, // Right column
  description: 'Helper functions display panel.',
};

let _moduleEventBus = null;

export function getModuleEventBus() {
  if (_moduleEventBus) return _moduleEventBus;
  // Fallback wrapper before initialize() runs (e.g., GoldenLayout component creation)
  return {
    publish: (event, data) => eventBus.publish(event, data, 'helpers'),
    subscribe: (event, callback) => eventBus.subscribe(event, callback, 'helpers'),
    unsubscribe: (event, callback) => eventBus.unsubscribe(event, callback, 'helpers'),
    publishAs: (event, data, source) => eventBus.publish(event, data, source),
    getAllPublishers: () => eventBus.getAllPublishers(),
    getAllSubscribers: () => eventBus.getAllSubscribers(),
    getAllPublishCounts: () => eventBus.getAllPublishCounts(),
  };
}

class HelpersModule {
  constructor() {
    this.ui = null;
    log('info', 'Helpers module instance created.');
  }

  register(registrationApi) {
    registrationApi.registerPanelComponent(
      'helpersPanel',
      HelperUI // Pass the class constructor itself
    );

    // Register EventBus subscriber intentions
    registrationApi.registerEventBusSubscriberIntent(
      'stateManager:snapshotUpdated'
    );
    registrationApi.registerEventBusSubscriberIntent('stateManager:ready');
    registrationApi.registerEventBusSubscriberIntent(
      'stateManager:rulesLoaded'
    );
    registrationApi.registerEventBusSubscriberIntent('settings:changed');

    log('info', 'HelperUI panel component registered.');
  }

  initialize(initializationApi) {
    log('info', 'Helpers module initialized.');
  }
}

const helpersModule = new HelpersModule();

export function register(registrationApi) {
  helpersModule.register(registrationApi);
}

export function initialize(moduleId, priorityIndex, initializationApi) {
  _moduleEventBus = initializationApi.getEventBus();
  helpersModule.initialize(initializationApi);
}
