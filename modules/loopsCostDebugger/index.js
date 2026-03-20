/**
 * Loops Cost Debugger Module
 *
 * Step-through debugger for the Loops cost generation algorithm.
 * Plans cost generation steps from a sphere log and displays
 * detailed reasoning for each step.
 */

import { CostDebuggerUI } from './costDebuggerUI.js';
import { CostPlanner } from './costPlanner.js';
import stateManagerProxySingleton from '../stateManager/stateManagerProxySingleton.js';
import eventBus from '../../app/core/eventBus.js';
import { centralRegistry } from '../../app/core/centralRegistry.js';
import { DEFAULT_PLAYER_ID } from '../shared/playerIdUtils.js';

function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('loopsCostDebugger', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[loopsCostDebugger] ${message}`, ...data);
  }
}

// --- Module Info ---
export const moduleInfo = {
  name: 'loopsCostDebugger',
  title: 'Loops Cost Debugger',
  componentType: 'loopsCostDebuggerPanel',
  icon: '',
  column: 1,
  description: 'Step-through debugger for Loops cost generation algorithm.',
};

// Module-level references
let thisModuleId = moduleInfo.name;
let moduleEventBus = null;
let moduleDispatcher = null;
let costPlannerInstance = null;

/**
 * Registration function
 */
export function register(registrationApi) {
  log('info', `[${moduleInfo.name}] Registering...`);

  // Load CSS
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.type = 'text/css';
  link.href = 'modules/loopsCostDebugger/costDebugger.css';
  document.head.appendChild(link);

  // Register panel component
  registrationApi.registerPanelComponent('loopsCostDebuggerPanel', CostDebuggerUI);

  // Register public functions
  registrationApi.registerPublicFunction(moduleInfo.name, 'getCostPlanner', () => costPlannerInstance);
  registrationApi.registerPublicFunction(moduleInfo.name, 'getPlannedSteps', () =>
    costPlannerInstance?.getPlannedSteps() || []
  );
  registrationApi.registerPublicFunction(moduleInfo.name, 'getCostData', () =>
    costPlannerInstance?.getCostData() || null
  );
  registrationApi.registerPublicFunction(moduleInfo.name, 'getSphereLog', getSphereLog);

  // Register event publishers
  registrationApi.registerEventBusPublisher('loopsCostDebugger:stepPlanned');
  registrationApi.registerEventBusPublisher('loopsCostDebugger:allPlanned');
  registrationApi.registerEventBusPublisher('loopsCostDebugger:reset');

  log('info', `[${moduleInfo.name}] Registration complete.`);
}

/**
 * Initialization function
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  thisModuleId = moduleId;
  moduleEventBus = initializationApi.getEventBus();
  moduleDispatcher = initializationApi.getDispatcher();

  log('info', `[${thisModuleId}] Initializing...`);

  // Create cost planner
  costPlannerInstance = new CostPlanner({
    stateManager: stateManagerProxySingleton,
    eventBus: moduleEventBus,
  });

  // Expose on window for console debugging
  if (typeof window !== 'undefined') {
    window.costPlanner = costPlannerInstance;
  }

  log('info', `[${thisModuleId}] Initialization complete.`);

  return () => {
    log('info', `[${thisModuleId}] Cleaning up...`);
    costPlannerInstance = null;
    moduleEventBus = null;
    moduleDispatcher = null;
    if (typeof window !== 'undefined') {
      delete window.costPlanner;
    }
  };
}

// =========================================================================
// Exports for UI component
// =========================================================================

export function getCostPlanner() {
  return costPlannerInstance;
}

export function getModuleEventBus() {
  if (moduleEventBus) return moduleEventBus;
  // Fallback wrapper before initialize() runs
  return {
    publish: (event, data) => eventBus.publish(event, data, 'loopsCostDebugger'),
    subscribe: (event, callback) => eventBus.subscribe(event, callback, 'loopsCostDebugger'),
    unsubscribe: (event, callback) => eventBus.unsubscribe(event, callback, 'loopsCostDebugger'),
  };
}

/**
 * Get sphere log data from multiple sources.
 * Mirrors the pattern used by loopUI._handleGenerateCostsClick().
 * @returns {Array|null} Sphere log entries in raw JSONL format
 */
export function getSphereLog() {
  // Try 1: From stateManager snapshot (may have raw JSONL data)
  const snapshot = stateManagerProxySingleton?.getLatestStateSnapshot?.();
  if (snapshot?.sphereLog && Array.isArray(snapshot.sphereLog) && snapshot.sphereLog.length > 0) {
    return snapshot.sphereLog;
  }

  // Try 2: Get parsed sphere data and convert to raw format
  const getSphereData = centralRegistry.getPublicFunction('sphereState', 'getSphereData');
  if (getSphereData) {
    const sphereData = getSphereData();
    if (sphereData && Array.isArray(sphereData) && sphereData.length > 0) {
      const getIdFn = centralRegistry.getPublicFunction('sphereState', 'getCurrentPlayerId');
      const playerId = getIdFn?.() || DEFAULT_PLAYER_ID;
      // sphereData.inventoryDetails is CUMULATIVE (accumulated by sphereState).
      // Convert to incremental deltas to match the raw JSONL new_inventory_details format.
      let previousBaseItems = {};
      return sphereData.map((sphere) => {
        const currentBaseItems = sphere.inventoryDetails?.base_items || {};

        // Compute incremental delta from cumulative
        const deltaItems = {};
        for (const [item, count] of Object.entries(currentBaseItems)) {
          const prev = previousBaseItems[item] || 0;
          if (count > prev) {
            deltaItems[item] = count - prev;
          }
        }
        previousBaseItems = { ...currentBaseItems };

        const hasNewItems = Object.keys(deltaItems).length > 0;
        return {
          type: 'state_update',
          sphere_index: sphere.sphereIndex ?? sphere.integerSphere ?? 0,
          player_data: {
            [String(playerId)]: {
              sphere_locations: sphere.locations || [],
              new_accessible_regions: sphere.accessibleRegions || [],
              new_inventory_details: hasNewItems ? { base_items: deltaItems } : {},
            },
          },
        };
      });
    }
  }

  return null;
}
