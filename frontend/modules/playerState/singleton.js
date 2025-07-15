import { PlayerState } from './state.js';

let instance = null;

export function createPlayerStateSingleton(eventBus) {
    if (!instance) {
        instance = new PlayerState(eventBus);
    }
    return instance;
}

export function getPlayerStateSingleton() {
    if (!instance) {
        throw new Error('PlayerState singleton not initialized. Call createPlayerStateSingleton first.');
    }
    return instance;
}