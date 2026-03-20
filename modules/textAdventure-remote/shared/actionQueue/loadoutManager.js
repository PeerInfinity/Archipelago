// LoadoutManager - save/load/rename multiple named queues with localStorage persistence
import { ActionQueue } from './actionQueue.js';

const DEFAULT_LOADOUT_NAME = 'Default';

export class LoadoutManager {
    /** @type {string} localStorage key prefix */
    #storageKey;

    /** @type {{name: string, data: object}[]} */
    #loadouts = [];

    /** @type {number} */
    #activeIndex = 0;

    /**
     * @param {string} storageKey - localStorage key for persistence (e.g., 'jta-action-loadouts')
     */
    constructor(storageKey) {
        this.#storageKey = storageKey;
        this.load();
    }

    /**
     * @returns {{name: string, data: object}[]}
     */
    getLoadouts() {
        return this.#loadouts.map(l => ({ name: l.name, data: l.data }));
    }

    /**
     * @returns {number}
     */
    get activeIndex() {
        return this.#activeIndex;
    }

    /**
     * @returns {string}
     */
    get activeName() {
        return this.#loadouts[this.#activeIndex]?.name || DEFAULT_LOADOUT_NAME;
    }

    /**
     * @returns {number}
     */
    get count() {
        return this.#loadouts.length;
    }

    /**
     * Save the current queue state to the active loadout
     * @param {ActionQueue} queue
     */
    saveActive(queue) {
        if (this.#loadouts.length === 0) {
            this.#loadouts.push({ name: DEFAULT_LOADOUT_NAME, data: {} });
        }
        this.#loadouts[this.#activeIndex].data = queue.serialize();
        this.#persist();
    }

    /**
     * Load the active loadout into a queue
     * @param {ActionQueue} queue
     */
    loadActive(queue) {
        if (this.#loadouts.length === 0) return;
        const data = this.#loadouts[this.#activeIndex]?.data;
        if (data) {
            queue.deserialize(data);
        }
    }

    /**
     * Switch to a different loadout by index
     * @param {number} index
     * @param {ActionQueue} queue - Queue to load into
     */
    switchTo(index, queue) {
        if (index < 0 || index >= this.#loadouts.length) return;
        this.#activeIndex = index;
        this.loadActive(queue);
        this.#persist();
    }

    /**
     * Get sequencing config for a loadout
     * @param {number} index
     * @returns {{ repeatCount: number, nextLoadout: number }} repeatCount 0 = infinite, nextLoadout -1 = stop
     */
    getSequencing(index) {
        const loadout = this.#loadouts[index];
        return {
            repeatCount: loadout?.repeatCount ?? 1,
            nextLoadout: loadout?.nextLoadout ?? -1,
        };
    }

    /**
     * Get strategy config for a loadout
     * @param {number} index
     * @returns {object|null} Strategy config or null for manual loadouts
     */
    getStrategy(index) {
        return this.#loadouts[index]?.strategy || null;
    }

    /**
     * Set strategy config for a loadout
     * @param {number} index
     * @param {object|null} strategy
     */
    setStrategy(index, strategy) {
        if (index < 0 || index >= this.#loadouts.length) return;
        this.#loadouts[index].strategy = strategy || null;
        this.#persist();
    }

    /**
     * Check if a loadout is strategy-backed (auto-generated)
     * @param {number} index
     * @returns {boolean}
     */
    isStrategyBacked(index) {
        return !!this.#loadouts[index]?.strategy;
    }

    /**
     * Update sequencing config for a loadout
     * @param {number} index
     * @param {{ repeatCount?: number, nextLoadout?: number }} config
     */
    updateSequencing(index, config) {
        if (index < 0 || index >= this.#loadouts.length) return;
        if (config.repeatCount !== undefined) this.#loadouts[index].repeatCount = config.repeatCount;
        if (config.nextLoadout !== undefined) this.#loadouts[index].nextLoadout = config.nextLoadout;
        this.#persist();
    }

    /**
     * Create a new empty loadout and switch to it
     * @param {string} [name]
     * @param {ActionQueue} [queue]
     * @param {object} [options] - { strategy, repeatCount, nextLoadout }
     * @returns {number} Index of new loadout
     */
    create(name, queue, options = {}) {
        const loadoutName = name || `Loadout ${this.#loadouts.length + 1}`;
        this.#loadouts.push({
            name: loadoutName,
            data: {},
            repeatCount: options.repeatCount ?? 1,
            nextLoadout: options.nextLoadout ?? -1,
            strategy: options.strategy || null,
        });
        const idx = this.#loadouts.length - 1;
        if (queue) {
            this.#activeIndex = idx;
            queue.clear();
        }
        this.#persist();
        return idx;
    }

    /**
     * Rename a loadout
     * @param {number} index
     * @param {string} name
     */
    rename(index, name) {
        if (index < 0 || index >= this.#loadouts.length) return;
        this.#loadouts[index].name = name;
        this.#persist();
    }

    /**
     * Delete a loadout by index
     * @param {number} index
     * @returns {boolean}
     */
    delete(index) {
        if (this.#loadouts.length <= 1) return false; // Keep at least one
        if (index < 0 || index >= this.#loadouts.length) return false;
        this.#loadouts.splice(index, 1);
        if (this.#activeIndex >= this.#loadouts.length) {
            this.#activeIndex = this.#loadouts.length - 1;
        }
        this.#persist();
        return true;
    }

    /**
     * Load all loadouts from localStorage
     */
    load() {
        try {
            const raw = localStorage.getItem(this.#storageKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                this.#loadouts = parsed.loadouts || [];
                this.#activeIndex = parsed.activeIndex || 0;
                if (this.#activeIndex >= this.#loadouts.length) {
                    this.#activeIndex = 0;
                }
            }
        } catch (e) {
            console.warn(`[LoadoutManager] Failed to load from localStorage:`, e);
        }
        if (this.#loadouts.length === 0) {
            this.#loadouts.push({ name: DEFAULT_LOADOUT_NAME, data: {} });
            this.#activeIndex = 0;
        }
    }

    /** Persist to localStorage */
    #persist() {
        try {
            localStorage.setItem(this.#storageKey, JSON.stringify({
                loadouts: this.#loadouts,
                activeIndex: this.#activeIndex,
            }));
        } catch (e) {
            console.warn(`[LoadoutManager] Failed to persist:`, e);
        }
    }
}
