// Game-agnostic action queue types and enums

/**
 * State of a queue entry during execution
 * @enum {string}
 */
export const ActionState = Object.freeze({
    PENDING: 'pending',
    ACTIVE: 'active',
    COMPLETED: 'completed',
    FAILED: 'failed',
    SKIPPED: 'skipped',
});

/**
 * @typedef {object} QueueEntry
 * @property {string} entryId - Unique stable ID for drag-and-drop identity
 * @property {string} actionType - String from game-specific action type enum
 * @property {string|number} actionId - Game-specific identifier (task ID, item type, etc.)
 * @property {string} label - Display name
 * @property {string} [group] - Optional grouping (zone name, item category)
 * @property {number} loops - Number of times to perform (default 1)
 * @property {boolean} disabled - Skip this entry when executing
 */

/**
 * @typedef {object} ActionStatus
 * @property {string} entryId - Matches QueueEntry.entryId
 * @property {ActionState} state - Current state
 * @property {number} loopsCompleted - How many loops finished so far
 * @property {string} [error] - Error message if failed
 */

let nextEntryId = 1;

/**
 * Generate a unique entry ID
 * @returns {string}
 */
export function generateEntryId() {
    return `aq_${Date.now()}_${nextEntryId++}`;
}
