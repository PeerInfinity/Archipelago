/**
 * Proof Graph module — MetaMath Medium mode / DepGraph connection puzzle.
 *
 * Provides a Cytoscape graph where players reconstruct the dependency
 * structure by drawing edges between nodes using edgehandles.
 * Active when a game with proof_structure (MetaMath) or graph_structure (DepGraph) is loaded.
 */

import proofGraphState from './proofGraphStateSingleton.js';
import { ProofGraphUI, setModuleEventBus, setDispatcher } from './proofGraphUI.js';
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
  name: 'proofGraph',
  title: 'Proof Graph',
  componentType: 'proofGraphPanel',
  icon: '\u{1F517}', // link emoji
  column: 3,
  description: 'Reconstruct proof dependency edges in a graph puzzle.',
};

// ─── Module State ───────────────────────────────────────────

let _moduleEventBus = null;
let _dispatcher = null;
let _unsubscribeHandles = [];

const log = createLogger('proofGraph');

// ─── Registration ───────────────────────────────────────────

export function register(registrationApi) {
  log('info', 'Registering Proof Graph module...');

  // Load CSS
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.type = 'text/css';
  link.href = 'modules/proofGraph/proofGraph.css';
  document.head.appendChild(link);

  // Register panel component
  registrationApi.registerPanelComponent('proofGraphPanel', ProofGraphUI);

  // Dispatcher: we send location checks
  registrationApi.registerDispatcherSender('user:locationCheck', 'bottom', 'first');

  // Events we subscribe to
  registrationApi.registerEventBusSubscriberIntent('stateManager:rulesLoaded');
  registrationApi.registerEventBusSubscriberIntent('stateManager:snapshotUpdated');
  registrationApi.registerEventBusSubscriberIntent('stateManager:inventoryChanged');
  registrationApi.registerEventBusSubscriberIntent('proofQueue:hypAssigned');

  // Events we publish
  registrationApi.registerEventBusPublisher('proofGraph:edgeDrawn');
  registrationApi.registerEventBusPublisher('proofGraph:edgeRejected');
  registrationApi.registerEventBusPublisher('proofGraph:stepCompleted');
  registrationApi.registerEventBusPublisher('proofGraph:proofComplete');

  // Public API
  registrationApi.registerPublicFunction(moduleInfo.name, 'getProofGraphState', () => proofGraphState);

  log('info', 'Registration complete.');
}

// ─── Initialization ─────────────────────────────────────────

export function initialize(moduleId, priorityIndex, initializationApi) {
  log('info', `Initializing with priority ${priorityIndex}...`);

  _moduleEventBus = initializationApi.getEventBus();
  _dispatcher = initializationApi.getDispatcher();

  // Pass references to UI
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

  // Check if rules already loaded
  const staticData = stateManager.getStaticData();
  if (hasStructureData(getPlayerWorld(staticData)?.slot_data)) {
    initializeProofState(proofGraphState, staticData, log, _wireEventBusPublishing);
  }

  log('info', 'Initialization complete.');

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
  if (staticData) initializeProofState(proofGraphState, staticData, log, _wireEventBusPublishing);
}

function handleSnapshotUpdated(snapshotData) {
  if (!proofGraphState?.isLoaded) return;
  syncStateFromSnapshot(proofGraphState, snapshotData);
}

function handleInventoryChanged() {
  if (!proofGraphState?.isLoaded) return;
  syncStateFromSnapshot(proofGraphState);
}

// ─── Internal ───────────────────────────────────────────────

function _wireEventBusPublishing() {
  // Chain onto any existing callbacks (e.g. UI render) rather than overwriting
  const existingEdgeDrawn = proofGraphState.onEdgeDrawn;
  proofGraphState.onEdgeDrawn = (source, target, slot) => {
    if (existingEdgeDrawn) existingEdgeDrawn(source, target, slot);
    if (_moduleEventBus) {
      _moduleEventBus.publish('proofGraph:edgeDrawn', { source, target, slot });
    }
  };

  const existingEdgeRejected = proofGraphState.onEdgeRejected;
  proofGraphState.onEdgeRejected = (source, target) => {
    if (existingEdgeRejected) existingEdgeRejected(source, target);
    if (_moduleEventBus) {
      _moduleEventBus.publish('proofGraph:edgeRejected', { source, target });
    }
  };

  const existingStepCompleted = proofGraphState.onStepCompleted;
  proofGraphState.onStepCompleted = (stepIndex) => {
    if (existingStepCompleted) existingStepCompleted(stepIndex);
    if (_moduleEventBus) {
      _moduleEventBus.publish('proofGraph:stepCompleted', { stepIndex });
    }
  };
}
