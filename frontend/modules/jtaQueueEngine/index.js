// jtaQueueEngine module entry point — headless engine for JTA action queue
import { JTAQueueEngine } from './jtaQueueEngine.js';
import eventBus from '../../app/core/eventBus.js';

export const moduleInfo = {
    name: 'jtaQueueEngine',
    title: 'JTA Queue Engine',
    description: 'Headless engine for JTA action queue execution, strategy, and predictions.',
};

function log(level, message, ...data) {
    if (typeof window !== 'undefined' && window.logger) {
        window.logger[level]('jtaQueueEngine', message, ...data);
    } else {
        const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
        consoleMethod(`[jtaQueueEngine] ${message}`, ...data);
    }
}

let engine = null;
let moduleEventBus = null;

export async function register(registrationApi) {
    log('info', 'Registering...');

    // Publishers — commands sent to the iframe
    registrationApi.registerEventBusPublisher('jta:clickTask');
    registrationApi.registerEventBusPublisher('jta:clickItem');
    registrationApi.registerEventBusPublisher('jta:doPrestige');
    registrationApi.registerEventBusPublisher('jta:requestTaskStatus');
    registrationApi.registerEventBusPublisher('jta:requestGameDefs');
    registrationApi.registerEventBusPublisher('jta:dismissGameOver');
    registrationApi.registerEventBusPublisher('jta:requestDetailedState');

    // Subscribers — responses from the iframe + lifecycle
    const id = 'jtaQueueEngine';
    registrationApi.registerEventBusSubscriberIntent(id, 'jta:taskClicked');
    registrationApi.registerEventBusSubscriberIntent(id, 'jta:itemClicked');
    registrationApi.registerEventBusSubscriberIntent(id, 'jta:prestigeDone');
    registrationApi.registerEventBusSubscriberIntent(id, 'jta:taskStatus');
    registrationApi.registerEventBusSubscriberIntent(id, 'jta:gameDefsSnapshot');
    registrationApi.registerEventBusSubscriberIntent(id, 'jta:energyDepleted');
    registrationApi.registerEventBusSubscriberIntent(id, 'jta:gameOverDismissed');
    registrationApi.registerEventBusSubscriberIntent(id, 'jta:detailedStateSnapshot');
    registrationApi.registerEventBusSubscriberIntent(id, 'iframe:connected');
    registrationApi.registerEventBusSubscriberIntent(id, 'iframe:disconnected');

    log('info', 'Registration complete.');
}

export async function initialize(mId, priorityIndex, initializationApi) {
    log('info', `Initializing with priority ${priorityIndex}...`);
    moduleEventBus = initializationApi.getEventBus();

    engine = new JTAQueueEngine(moduleEventBus, mId);
    engine.initialize();

    log('info', 'Initialization complete.');
}

/** @returns {JTAQueueEngine|null} */
export function getEngine() { return engine; }

/**
 * Get the module eventBus (with fallback for early access before initialize).
 * Used by the UI panel for any direct eventBus needs.
 */
export function getModuleEventBus() {
    if (moduleEventBus) return moduleEventBus;
    return {
        publish: (event, data) => eventBus.publish(event, data, 'jtaQueueEngine'),
        subscribe: (event, callback) => eventBus.subscribe(event, callback, 'jtaQueueEngine'),
        unsubscribe: (event, callback) => eventBus.unsubscribe(event, callback, 'jtaQueueEngine'),
    };
}

// Re-exports for backward compatibility and convenience
export { createQueueEntry } from './jtaActionDefs.js';
export function getQueue() { return engine?.queue; }
export function getLoadoutManager() { return engine?.loadoutManager; }
export function getExecutor() { return engine?.executor; }
export function getCatalog() { return engine?.catalog; }
