// UI Class for this module
import { RegionUI } from './regionUI.js';
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import { evaluateRule } from '../shared/ruleEngine.js';
import { createSnapshotInterface } from '../shared/snapshotInterface.js';
import eventBus from '../../app/core/eventBus.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('regionsModule', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[regionsModule] ${message}`, ...data);
  }
}

// --- Module Info ---
export const moduleInfo = {
  name: 'regions',
  title: 'Regions',
  componentType: 'regionsPanel',
  icon: '🗺️',
  column: 3, // Right column
  description: 'Regions display panel.',
};

// Store module-level references
export let moduleDispatcher = null; // Export the dispatcher
let moduleId = 'regions'; // Store module ID
let moduleUnsubscribeHandles = [];
let regionUIInstance = null; // Store reference to the UI instance
let _moduleEventBus = null;

export function getModuleEventBus() {
  if (_moduleEventBus) return _moduleEventBus;
  // Fallback wrapper before initialize() runs (e.g., GoldenLayout component creation)
  return {
    publish: (event, data) => eventBus.publish(event, data, 'regions'),
    subscribe: (event, callback) => eventBus.subscribe(event, callback, 'regions'),
    unsubscribe: (event, callback) => eventBus.unsubscribe(event, callback, 'regions'),
    publishAs: (event, data, source) => eventBus.publish(event, data, source),
    getAllPublishers: () => eventBus.getAllPublishers(),
    getAllSubscribers: () => eventBus.getAllSubscribers(),
    getAllPublishCounts: () => eventBus.getAllPublishCounts(),
  };
}

/**
 * Registration function for the Regions module.
 * Registers the panel component and event intentions.
 */
export function register(registrationApi) {
  log('info', `[${moduleId} Module] Registering...`);

  // Create a wrapper to capture the UI instance
  function RegionUIWrapper(container, componentState) {
    regionUIInstance = new RegionUI(container, componentState);
    return regionUIInstance;
  }

  // Register the panel component wrapper
  registrationApi.registerPanelComponent(
    'regionsPanel',
    RegionUIWrapper
  );

  // Register EventBus publisher intentions (used by RegionUI)
  registrationApi.registerEventBusPublisher('ui:navigateToRegion');
  registrationApi.registerEventBusPublisher('ui:navigateToLocation');
  registrationApi.registerEventBusPublisher('ui:navigateToDungeon');
  registrationApi.registerEventBusPublisher('ui:activatePanel');
  registrationApi.registerEventBusPublisher('playerState:trimPath');
  registrationApi.registerEventBusPublisher('ui:regionHeaderClicked');

  // Register Dispatcher sender intentions (used by RegionUI)
  registrationApi.registerDispatcherSender(
    'user:locationCheck',
    'bottom',
    'first'
  );
  
  registrationApi.registerDispatcherSender(
    'user:regionMove',
    'bottom',
    'first'
  );

  // Register dispatcher receiver for user:regionMove events
  registrationApi.registerDispatcherReceiver(
    moduleId,
    'user:regionMove',
    handleRegionMove,
    { direction: 'up', condition: 'unconditional', timing: 'immediate' }
  );

  // Register dispatcher receiver for user:exitClicked events
  // This is the default handler - it only runs if no other module (like loops) intercepted the event
  registrationApi.registerDispatcherReceiver(
    moduleId,
    'user:exitClicked',
    handleExitClicked,
    { direction: 'up', condition: 'unconditional', timing: 'immediate' }
  );

  // Register settings schema if needed
  // registrationApi.registerSettingsSchema(moduleId, { /* ... schema ... */ });
}

// Handler for user:regionMove events
function handleRegionMove(data, propagationOptions) {
  log('info', `[${moduleId} Module] Received user:regionMove event`, data);

  // Handle the region move by calling moveToRegion on the UI instance
  if (data && data.sourceRegion && data.targetRegion && regionUIInstance) {
    log('info', `[${moduleId} Module] Processing region move from ${data.sourceRegion} to ${data.targetRegion}`);
    regionUIInstance.moveToRegion(data.sourceRegion, data.targetRegion, data.sourceUID);
  } else if (!regionUIInstance) {
    log('warn', `[${moduleId} Module] Cannot process region move - UI instance not available`);
  }

  // Propagate the event to the next module (up direction)
  if (moduleDispatcher) {
    moduleDispatcher.publishToNextModule(
      moduleId,
      'user:regionMove',
      data,
      { direction: 'up' }
    );
  } else {
    log('error', `[${moduleId} Module] Dispatcher not available for propagation of user:regionMove event`);
  }
}

// Handler for user:exitClicked events (default handler)
// This performs the same action as clicking an exit in the Regions panel
function handleExitClicked(data, propagationOptions) {
  log('info', `[${moduleId} Module] Received user:exitClicked event`, data);

  const { exitName, sourceRegion, destinationRegion, accessRule } = data;

  if (!sourceRegion || !destinationRegion) {
    log('warn', `[${moduleId} Module] Cannot process exit click - missing source or destination region`);
    return;
  }

  // Check if the exit is traversable
  const snapshot = stateManager.getLatestStateSnapshot();
  const staticData = stateManager.getStaticData();

  if (!snapshot || !staticData) {
    log('warn', `[${moduleId} Module] Cannot determine traversability - no snapshot or static data`);
    return;
  }

  // Check parent region reachability
  const parentRegionStatus = snapshot.regionReachability?.[sourceRegion];
  const parentRegionReachable =
    parentRegionStatus === true ||
    parentRegionStatus === 'reachable' ||
    parentRegionStatus === 'checked';

  // Check connected region reachability
  const connectedRegionStatus = snapshot.regionReachability?.[destinationRegion];
  const connectedRegionReachable =
    connectedRegionStatus === true ||
    connectedRegionStatus === 'reachable' ||
    connectedRegionStatus === 'checked';

  // Evaluate access rule
  let rulePasses = true;
  if (accessRule) {
    try {
      const snapshotInterface = createSnapshotInterface(snapshot, staticData);
      rulePasses = evaluateRule(accessRule, snapshotInterface);
    } catch (e) {
      log('error', `[${moduleId} Module] Error evaluating rule for exit ${exitName}:`, e);
      rulePasses = false;
    }
  }

  const isTraversable = parentRegionReachable && rulePasses && connectedRegionReachable;

  if (!isTraversable) {
    log('info', `[${moduleId} Module] Exit ${exitName} is not traversable, skipping move action`);
    return;
  }

  // Check if "Show All Regions" mode is enabled
  const showAllCheckbox = document.querySelector('#show-all-regions');
  const showAllEnabled = showAllCheckbox && showAllCheckbox.checked;

  if (showAllEnabled) {
    // In "Show All" mode, navigate to the region instead of moving
    log('info', `[${moduleId} Module] Navigating to region: ${destinationRegion} (Show All mode)`);

    // First activate the regions panel if not already active
    _moduleEventBus.publish('ui:activatePanel', { panelId: 'regionsPanel' });

    // Then navigate to the target region
    _moduleEventBus.publish('ui:navigateToRegion', {
      regionName: destinationRegion
    });
  } else {
    // Normal mode - execute region move via dispatcher
    log('info', `[${moduleId} Module] Processing exit click: moving to ${destinationRegion} via ${exitName}`);

    // Get the actual current region from playerState
    import('../playerState/singleton.js').then(({ getPlayerStateSingleton }) => {
      const playerState = getPlayerStateSingleton();
      const currentRegion = playerState.getCurrentRegion();

      if (moduleDispatcher) {
        moduleDispatcher.publish('user:regionMove', {
          sourceRegion: currentRegion,
          sourceUID: null, // Exit panel doesn't have UID context
          targetRegion: destinationRegion,
          exitName: exitName,
          updatePath: true,
          source: 'regionsModule:exitClicked'
        });
        log('info', `[${moduleId} Module] Published user:regionMove from ${currentRegion} to ${destinationRegion} via ${exitName}`);
      } else {
        log('error', `[${moduleId} Module] Dispatcher not available for publishing user:regionMove`);
      }
    }).catch(error => {
      log('error', `[${moduleId} Module] Error importing playerState:`, error);
    });
  }

  // Note: We don't propagate user:exitClicked further - this is the terminal handler
}

/**
 * Initialization function for the Regions module.
 * Gets core APIs and sets up module-level subscriptions if any.
 */
export async function initialize(mId, priorityIndex, initializationApi) {
  moduleId = mId;
  log(
    'info',
    `[${moduleId} Module] Initializing with priority ${priorityIndex}...`
  );

  // Assign the dispatcher to the exported variable
  moduleDispatcher = initializationApi.getDispatcher();
  _moduleEventBus = initializationApi.getEventBus();

  // Example: Subscribe to something using the module-wide eventBus if needed later
  // const handle = moduleEventBus.subscribe('some:event', () => {}, 'moduleName');
  // moduleUnsubscribeHandles.push(handle);

  // If the module needs to perform async setup, do it here
  // await someAsyncSetup();

  log('info', `[${moduleId} Module] Initialization complete.`);

  // Return cleanup function if necessary
  return () => {
    log('info', `[${moduleId} Module] Cleaning up...`);
    moduleUnsubscribeHandles.forEach((unsubscribe) => unsubscribe());
    moduleUnsubscribeHandles = [];
    // Any other cleanup specific to this module's initialize phase
    moduleDispatcher = null; // Clear dispatcher reference
    _moduleEventBus = null;
  };
}

// Remove postInitialize function entirely
