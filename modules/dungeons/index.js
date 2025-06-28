import { DungeonUI } from './dungeonUI.js';

// Helper function for logging
function log(level, message, ...data) {
  if (window.logger) {
    window.logger[level]('DungeonsModule', message, ...data);
  } else {
    console.log(`[DungeonsModule] ${message}`, ...data);
  }
}

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

export function register(registrationApi) {
  dungeonsModule.register(registrationApi);
}

export function initialize(initializationApi) {
  dungeonsModule.initialize(initializationApi);
}
