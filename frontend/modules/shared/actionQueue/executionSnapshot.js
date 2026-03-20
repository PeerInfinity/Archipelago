// ExecutionSnapshot - frozen copy of a queue for execution, with runtime state tracking
// The "current list" in the dual-queue pattern (next list = ActionQueue, current list = this)
import { ActionState } from './actionTypes.js';

/**
 * @typedef {object} RuntimeStatus
 * @property {string} entryId
 * @property {ActionState} state
 * @property {number} loopsCompleted
 * @property {string} [error]
 * @property {number} [energyBefore] - Energy when entry started
 * @property {number} [energyAfter] - Energy when entry completed
 * @property {number} [actualEnergyCost] - energyBefore - energyAfter
 * @property {object} [skillsBefore] - { skillId: fractionalLevel }
 * @property {object} [actualSkillGains] - { skillId: { name, gained } }
 * @property {number} [startTime] - Date.now() when started
 * @property {number} [endTime] - Date.now() when completed
 * @property {number} [actualTimeMs] - endTime - startTime
 */

export class ExecutionSnapshot {
    /** @type {import('./actionTypes.js').QueueEntry[]} */
    #entries = [];

    /** @type {Map<string, RuntimeStatus>} */
    #statuses = new Map();

    /** @type {number} */
    #cursor = 0;

    /** @type {boolean} */
    #running = false;

    /** @type {Map<string, object>|null} Predictions frozen at execution start */
    #frozenPredictions = null;

    /**
     * Create a snapshot from an ActionQueue's current entries
     * @param {import('./actionQueue.js').ActionQueue} queue
     */
    static fromQueue(queue) {
        const snapshot = new ExecutionSnapshot();
        for (const entry of queue.getEntries()) {
            if (entry.disabled) continue; // skip disabled entries entirely
            snapshot.#entries.push({ ...entry });
            snapshot.#statuses.set(entry.entryId, {
                entryId: entry.entryId,
                state: ActionState.PENDING,
                loopsCompleted: 0,
            });
        }
        return snapshot;
    }

    /**
     * Append entries from the queue that aren't already in the snapshot.
     * Preserves completed/skipped/failed state of existing entries.
     * @param {import('./actionQueue.js').ActionQueue} queue
     */
    appendFromQueue(queue) {
        const existingIds = new Set(this.#entries.map(e => e.entryId));
        for (const entry of queue.getEntries()) {
            if (entry.disabled) continue;
            if (existingIds.has(entry.entryId)) continue;
            this.#entries.push({ ...entry });
            this.#statuses.set(entry.entryId, {
                entryId: entry.entryId,
                state: ActionState.PENDING,
                loopsCompleted: 0,
            });
        }
    }

    /** @returns {import('./actionTypes.js').QueueEntry[]} */
    getEntries() {
        return [...this.#entries];
    }

    /** @returns {number} */
    get length() {
        return this.#entries.length;
    }

    /** @returns {number} */
    get cursor() {
        return this.#cursor;
    }

    /** @returns {boolean} */
    get running() {
        return this.#running;
    }

    set running(value) {
        this.#running = !!value;
    }

    /** @returns {Map<string, object>|null} */
    get frozenPredictions() { return this.#frozenPredictions; }

    /** @param {Map<string, object>|null} preds */
    set frozenPredictions(preds) { this.#frozenPredictions = preds; }

    /**
     * @returns {import('./actionTypes.js').QueueEntry|null}
     */
    currentEntry() {
        if (this.#cursor >= this.#entries.length) return null;
        return this.#entries[this.#cursor];
    }

    /**
     * @param {string} entryId
     * @returns {RuntimeStatus|undefined}
     */
    getStatus(entryId) {
        return this.#statuses.get(entryId);
    }

    /**
     * @param {string} entryId
     * @param {Partial<RuntimeStatus>} update
     */
    updateStatus(entryId, update) {
        const status = this.#statuses.get(entryId);
        if (!status) return;
        Object.assign(status, update);
    }

    /**
     * Advance cursor to the next entry (all disabled entries were already filtered out)
     * @returns {import('./actionTypes.js').QueueEntry|null}
     */
    advance() {
        this.#cursor++;
        if (this.#cursor < this.#entries.length) {
            return this.#entries[this.#cursor];
        }
        return null;
    }

    /**
     * Reset to beginning
     */
    reset() {
        this.#cursor = 0;
        this.#running = false;
        for (const status of this.#statuses.values()) {
            status.state = ActionState.PENDING;
            status.loopsCompleted = 0;
            status.error = undefined;
        }
    }

    /** @returns {boolean} */
    isExhausted() {
        return this.#cursor >= this.#entries.length;
    }
}
