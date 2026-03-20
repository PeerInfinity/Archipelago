/**
 * JTA Cost Debugger Module
 *
 * Step-through debugger for JTA cost generation via simulated playthrough.
 * Generates action queues step by step, assigning costs the first time
 * each task appears based on what the player can afford.
 */

import { JTACostDebuggerUI } from './jtaCostDebuggerUI.js';
import { JTACostPlanner } from './jtaCostPlanner.js';
import eventBus from '../../app/core/eventBus.js';

function log(level, message, ...data) {
    if (typeof window !== 'undefined' && window.logger) {
        window.logger[level]('jtaCostDebugger', message, ...data);
    } else {
        const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
        consoleMethod(`[jtaCostDebugger] ${message}`, ...data);
    }
}

// --- Module Info ---
export const moduleInfo = {
    name: 'jtaCostDebugger',
    title: 'JTA Cost Debugger',
    componentType: 'jtaCostDebuggerPanel',
    icon: '',
    column: 2,
    description: 'Step-through debugger for JTA cost generation via simulated playthrough.',
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
    link.href = 'modules/jtaCostDebugger/jtaCostDebugger.css';
    document.head.appendChild(link);

    // Register panel component
    registrationApi.registerPanelComponent('jtaCostDebuggerPanel', JTACostDebuggerUI);

    // Register public functions
    registrationApi.registerPublicFunction(moduleInfo.name, 'getCostPlanner', () => costPlannerInstance);
    registrationApi.registerPublicFunction(moduleInfo.name, 'getPlannedSteps', () =>
        costPlannerInstance?.getPlannedSteps() || []
    );
    registrationApi.registerPublicFunction(moduleInfo.name, 'getCostData', () =>
        costPlannerInstance?.getCostData() || null
    );

    // Register event publishers
    registrationApi.registerEventBusPublisher('jtaCostDebugger:planned');
    registrationApi.registerEventBusPublisher('jtaCostDebugger:reset');

    // Game communication events for real-game verification
    registrationApi.registerEventBusPublisher('jta:setInstantMode');
    registrationApi.registerEventBusPublisher('jta:performTaskInstant');
    registrationApi.registerEventBusPublisher('jta:getFullState');
    registrationApi.registerEventBusPublisher('jta:dismissGameOver');
    registrationApi.registerEventBusPublisher('jta:replaceGameData');
    registrationApi.registerEventBusPublisher('jta:pauseGameLoop');
    registrationApi.registerEventBusPublisher('jta:resumeGameLoop');
    registrationApi.registerEventBusPublisher('jta:saveGameState');
    registrationApi.registerEventBusPublisher('jta:restoreGameState');
    registrationApi.registerEventBusPublisher('jta:resetToFreshState');
    registrationApi.registerEventBusPublisher('jta:executeTaskReal');
    registrationApi.registerEventBusPublisher('jta:doHeadlessReset');

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

    costPlannerInstance = new JTACostPlanner();

    // Expose on window for console debugging
    if (typeof window !== 'undefined') {
        window.jtaCostPlanner = costPlannerInstance;
    }

    log('info', `[${thisModuleId}] Initialization complete.`);

    return () => {
        log('info', `[${thisModuleId}] Cleaning up...`);
        costPlannerInstance = null;
        moduleEventBus = null;
        moduleDispatcher = null;
        if (typeof window !== 'undefined') {
            delete window.jtaCostPlanner;
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
    return {
        publish: (event, data) => eventBus.publish(event, data, 'jtaCostDebugger'),
        subscribe: (event, callback) => eventBus.subscribe(event, callback, 'jtaCostDebugger'),
        unsubscribe: (event, callback) => eventBus.unsubscribe(event, callback, 'jtaCostDebugger'),
    };
}
