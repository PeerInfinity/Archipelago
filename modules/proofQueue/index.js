/**
 * Proof Queue module — MetaMath Easy mode / DepGraph connection tracker.
 *
 * Provides a panel where players arrange proof steps in dependency order.
 * Active when a game with proof_structure (MetaMath) or graph_structure (DepGraph) is loaded.
 */

import proofQueueState from './proofQueueStateSingleton.js';
import { ProofQueueUI, setModuleEventBus, setDispatcher } from './proofQueueUI.js';
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import {
  getPlayerWorld,
  hasStructureData,
  syncStateFromSnapshot,
  createLogger,
  initializeProofState,
} from '../proofShared/proofModuleHelpers.js';

// ─── Module Info ────────────────────────────────────────────

export const moduleInfo = {
  name: 'proofQueue',
  title: 'Proof Queue',
  componentType: 'proofQueuePanel',
  icon: '\u{1F9E0}', // brain emoji
  column: 3, // Right column
  description: 'Arrange MetaMath proof steps in dependency order.',
};

// ─── Module State ───────────────────────────────────────────

let _moduleEventBus = null;
let _dispatcher = null;
let _unsubscribeHandles = [];

const log = createLogger('proofQueue');

// ─── Registration ───────────────────────────────────────────

export function register(registrationApi) {
  log('info', 'Registering Proof Queue module...');

  // Load CSS
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.type = 'text/css';
  link.href = 'modules/proofQueue/proofQueue.css';
  document.head.appendChild(link);

  // Register the panel component
  registrationApi.registerPanelComponent('proofQueuePanel', ProofQueueUI);

  // We dispatch location checks
  registrationApi.registerDispatcherSender('user:locationCheck', 'bottom', 'first');

  // Events we subscribe to
  registrationApi.registerEventBusSubscriberIntent('stateManager:rulesLoaded');
  registrationApi.registerEventBusSubscriberIntent('stateManager:snapshotUpdated');
  registrationApi.registerEventBusSubscriberIntent('stateManager:inventoryChanged');
  registrationApi.registerEventBusSubscriberIntent('proofGraph:edgeDrawn');

  // Events we publish
  registrationApi.registerEventBusPublisher('proofQueue:stepChecked');
  registrationApi.registerEventBusPublisher('proofQueue:proofComplete');
  registrationApi.registerEventBusPublisher('proofQueue:queueChanged');
  registrationApi.registerEventBusPublisher('proofQueue:hypAssigned');

  // Public API
  registrationApi.registerPublicFunction(moduleInfo.name, 'getProofQueueState', () => proofQueueState);

  log('info', 'Registration complete.');
}

// ─── Initialization ─────────────────────────────────────────

export function initialize(moduleId, priorityIndex, initializationApi) {
  log('info', `Initializing with priority ${priorityIndex}...`);

  _moduleEventBus = initializationApi.getEventBus();
  _dispatcher = initializationApi.getDispatcher();

  // Pass references to UI module
  setModuleEventBus(_moduleEventBus);
  setDispatcher(_dispatcher);

  // Subscribe to events
  if (_moduleEventBus) {
    const subscribe = (eventName, handler) => {
      const unsub = _moduleEventBus.subscribe(eventName, handler);
      _unsubscribeHandles.push(unsub);
    };

    subscribe('stateManager:rulesLoaded', handleRulesLoaded);
    subscribe('stateManager:snapshotUpdated', handleSnapshotUpdated);
    subscribe('stateManager:inventoryChanged', handleInventoryChanged);
  }

  // Check if rules are already loaded (late initialization)
  const staticData = stateManager.getStaticData();
  if (hasStructureData(getPlayerWorld(staticData)?.slot_data)) {
    initializeProofState(proofQueueState, staticData, log, _wireEventBusPublishing);
  }

  log('info', 'Initialization complete.');

  // Return cleanup function
  return () => {
    log('info', 'Cleaning up...');
    _unsubscribeHandles.forEach(unsub => unsub());
    _unsubscribeHandles = [];
    _moduleEventBus = null;
    _dispatcher = null;
  };
}

// ─── Event Handlers ─────────────────────────────────────────

function handleRulesLoaded() {
  log('info', 'Received stateManager:rulesLoaded');
  const staticData = stateManager.getStaticData();
  if (!staticData) return;
  initializeProofState(proofQueueState, staticData, log, _wireEventBusPublishing);
}

function handleSnapshotUpdated(snapshotData) {
  if (!proofQueueState?.isLoaded) return;
  syncStateFromSnapshot(proofQueueState, snapshotData);
}

function handleInventoryChanged() {
  if (!proofQueueState?.isLoaded) return;
  syncStateFromSnapshot(proofQueueState);
}

// ─── Internal ───────────────────────────────────────────────

function _wireEventBusPublishing() {
  // Chain onto any existing callback (e.g. UI render) rather than overwriting
  const existingCb = proofQueueState.onQueueChanged;
  proofQueueState.onQueueChanged = () => {
    if (existingCb) existingCb();
    if (_moduleEventBus) {
      _moduleEventBus.publish('proofQueue:queueChanged', {
        queue: [...proofQueueState.queue],
        validation: proofQueueState.validateQueue(),
      });
    }
  };
}
