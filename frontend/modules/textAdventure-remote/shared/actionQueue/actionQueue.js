// ActionQueue - ordered list of actions with cursor, status tracking, and serialization
import { ActionState, generateEntryId } from './actionTypes.js';

export class ActionQueue {
    /** @type {import('./actionTypes.js').QueueEntry[]} */
    #entries = [];

    /** @type {Map<string, import('./actionTypes.js').ActionStatus>} */
    #statuses = new Map();

    /** @type {number} Index of the currently executing entry */
    #cursor = 0;

    /** @type {boolean} */
    #running = false;

    /** @type {object|null} Serialized snapshot for single-level undo */
    #lastSnapshot = null;

    /**
     * @returns {import('./actionTypes.js').QueueEntry[]} Shallow copy of entries
     */
    getEntries() {
        return [...this.#entries];
    }

    /**
     * @returns {number}
     */
    get length() {
        return this.#entries.length;
    }

    /**
     * @returns {number}
     */
    get cursor() {
        return this.#cursor;
    }

    /**
     * @returns {boolean}
     */
    get running() {
        return this.#running;
    }

    set running(value) {
        this.#running = !!value;
    }

    /**
     * Get the entry currently under the cursor, or null if queue is exhausted
     * @returns {import('./actionTypes.js').QueueEntry|null}
     */
    currentEntry() {
        if (this.#cursor >= this.#entries.length) return null;
        return this.#entries[this.#cursor];
    }

    /**
     * Add an entry to the end (or optionally at a specific index) of the queue
     * @param {Partial<import('./actionTypes.js').QueueEntry>} entry
     * @param {number} [atIndex] - Optional insertion index
     * @returns {import('./actionTypes.js').QueueEntry} The created entry
     */
    add(entry, atIndex) {
        this.recordLast();
        const full = {
            entryId: entry.entryId || generateEntryId(),
            actionType: entry.actionType,
            actionId: entry.actionId,
            label: entry.label || '',
            group: entry.group || '',
            zoneId: entry.zoneId,
            loops: entry.loops ?? 1,
            disabled: entry.disabled ?? false,
        };
        if (atIndex !== undefined && atIndex >= 0 && atIndex <= this.#entries.length) {
            this.#entries.splice(atIndex, 0, full);
        } else {
            this.#entries.push(full);
        }
        this.#statuses.set(full.entryId, {
            entryId: full.entryId,
            state: ActionState.PENDING,
            loopsCompleted: 0,
        });
        return full;
    }

    /**
     * Remove an entry by entryId
     * @param {string} entryId
     * @returns {boolean}
     */
    remove(entryId) {
        this.recordLast();
        const idx = this.#entries.findIndex(e => e.entryId === entryId);
        if (idx === -1) return false;
        this.#entries.splice(idx, 1);
        this.#statuses.delete(entryId);
        // Adjust cursor if needed
        if (idx < this.#cursor) {
            this.#cursor--;
        }
        return true;
    }

    /**
     * Move an entry from one index to another
     * @param {number} fromIndex
     * @param {number} toIndex
     */
    reorder(fromIndex, toIndex) {
        this.recordLast();
        if (fromIndex < 0 || fromIndex >= this.#entries.length) return;
        if (toIndex < 0 || toIndex >= this.#entries.length) return;
        const [entry] = this.#entries.splice(fromIndex, 1);
        this.#entries.splice(toIndex, 0, entry);
    }

    /**
     * Update properties of an entry by entryId
     * @param {string} entryId
     * @param {Partial<import('./actionTypes.js').QueueEntry>} changes
     * @returns {boolean}
     */
    updateEntry(entryId, changes) {
        this.recordLast();
        const entry = this.#entries.find(e => e.entryId === entryId);
        if (!entry) return false;
        if (changes.loops !== undefined) entry.loops = changes.loops;
        if (changes.disabled !== undefined) entry.disabled = changes.disabled;
        if (changes.label !== undefined) entry.label = changes.label;
        if (changes.group !== undefined) entry.group = changes.group;
        return true;
    }

    /**
     * Get the status of an entry
     * @param {string} entryId
     * @returns {import('./actionTypes.js').ActionStatus|undefined}
     */
    getStatus(entryId) {
        return this.#statuses.get(entryId);
    }

    /**
     * Update the status of the current entry
     * @param {string} entryId
     * @param {Partial<import('./actionTypes.js').ActionStatus>} update
     */
    updateStatus(entryId, update) {
        const status = this.#statuses.get(entryId);
        if (!status) return;
        Object.assign(status, update);
    }

    /**
     * Advance the cursor to the next non-disabled entry.
     * Marks skipped disabled entries.
     * @returns {import('./actionTypes.js').QueueEntry|null} Next entry, or null if exhausted
     */
    advance() {
        this.#cursor++;
        while (this.#cursor < this.#entries.length) {
            const entry = this.#entries[this.#cursor];
            if (!entry.disabled) {
                return entry;
            }
            this.updateStatus(entry.entryId, { state: ActionState.SKIPPED });
            this.#cursor++;
        }
        return null;
    }

    /**
     * Reset the queue: move cursor to 0, reset all statuses to PENDING
     */
    reset() {
        this.#cursor = 0;
        this.#running = false;
        for (const status of this.#statuses.values()) {
            status.state = ActionState.PENDING;
            status.loopsCompleted = 0;
            status.error = undefined;
        }
        // Skip initial disabled entries
        if (this.#entries.length > 0 && this.#entries[0].disabled) {
            this.updateStatus(this.#entries[0].entryId, { state: ActionState.SKIPPED });
            this.advance();
        }
    }

    /**
     * Clear all entries and statuses
     */
    clear() {
        this.recordLast();
        this.#entries = [];
        this.#statuses.clear();
        this.#cursor = 0;
        this.#running = false;
    }

    /**
     * Check if the queue is exhausted (cursor past end)
     * @returns {boolean}
     */
    isExhausted() {
        return this.#cursor >= this.#entries.length;
    }

    /**
     * Serialize to a plain object for storage
     * @returns {object}
     */
    serialize() {
        return {
            entries: this.#entries.map(e => ({ ...e })),
        };
    }

    /**
     * Load from serialized data (does not record undo snapshot)
     * @param {object} data
     */
    deserialize(data) {
        this.#entries = [];
        this.#statuses.clear();
        this.#cursor = 0;
        this.#running = false;
        if (data && Array.isArray(data.entries)) {
            for (const entry of data.entries) {
                const full = {
                    entryId: entry.entryId || generateEntryId(),
                    actionType: entry.actionType,
                    actionId: entry.actionId,
                    label: entry.label || '',
                    group: entry.group || '',
                    zoneId: entry.zoneId,
                    loops: entry.loops ?? 1,
                    disabled: entry.disabled ?? false,
                };
                this.#entries.push(full);
                this.#statuses.set(full.entryId, {
                    entryId: full.entryId,
                    state: ActionState.PENDING,
                    loopsCompleted: 0,
                });
            }
        }
    }

    /**
     * Snapshot the current state for single-level undo.
     * Called automatically before mutating operations.
     */
    recordLast() {
        this.#lastSnapshot = {
            entries: this.#entries.map(e => ({ ...e })),
        };
    }

    /**
     * Undo the last mutation. Toggles: calling twice restores the state before undo.
     * @returns {boolean} True if undo was performed
     */
    undoLast() {
        if (!this.#lastSnapshot) return false;
        const current = {
            entries: this.#entries.map(e => ({ ...e })),
        };
        // Restore without triggering recordLast (use internal deserialize)
        this.#entries = [];
        this.#statuses.clear();
        this.#cursor = 0;
        this.#running = false;
        for (const entry of this.#lastSnapshot.entries) {
            const full = {
                entryId: entry.entryId || generateEntryId(),
                actionType: entry.actionType,
                actionId: entry.actionId,
                label: entry.label || '',
                group: entry.group || '',
                zoneId: entry.zoneId,
                loops: entry.loops ?? 1,
                disabled: entry.disabled ?? false,
            };
            this.#entries.push(full);
            this.#statuses.set(full.entryId, {
                entryId: full.entryId,
                state: ActionState.PENDING,
                loopsCompleted: 0,
            });
        }
        this.#lastSnapshot = current; // swap so undo toggles
        return true;
    }

    /**
     * Find the index of an entry by entryId
     * @param {string} entryId
     * @returns {number} Index, or -1 if not found
     */
    findIndex(entryId) {
        return this.#entries.findIndex(e => e.entryId === entryId);
    }
}
