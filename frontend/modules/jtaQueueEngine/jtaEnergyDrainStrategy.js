// JTA energy drain strategy - what to do when queue finishes but energy remains

/**
 * Drain strategy enum
 * @enum {string}
 */
export const DrainStrategy = Object.freeze({
    MOST_DRAINING: 'mostDraining',
    HIGHEST_XP: 'highestXp',
    SPECIFIC_TASK: 'specificTask',
});

/**
 * Pick a drain task from the current zone's tasks based on the strategy.
 *
 * @param {string} strategy - DrainStrategy value
 * @param {object[]} tasks - Current zone task status objects from jta:taskStatus
 *   Each has: { id, name, type, progress, reps, maxReps, enabled }
 * @param {number} [specificTaskId] - Task ID for SPECIFIC_TASK strategy
 * @returns {number|null} Task definition ID to repeat, or null if none suitable
 */
export function pickDrainTask(strategy, tasks, specificTaskId) {
    if (!tasks || tasks.length === 0) return null;

    // Filter to enabled tasks, preferring non-completed and non-travel tasks
    // maxReps > 0 && reps >= maxReps = task fully completed this cycle
    // Type 1 = Travel — only use as fallback since they advance the zone
    const isCompleted = t => t.maxReps > 0 && t.reps >= t.maxReps;
    const enabled = tasks.filter(t => t.enabled);
    const incomplete = enabled.filter(t => !isCompleted(t));
    const pool = incomplete.length > 0 ? incomplete : enabled;
    const nonTravel = pool.filter(t => t.type !== 1);
    const available = nonTravel.length > 0 ? nonTravel : pool;

    if (available.length === 0) return null;

    switch (strategy) {
        case DrainStrategy.MOST_DRAINING:
            // Tasks with highest cost (costMult * zone_exponent) drain most energy per tick.
            // We don't have exact drain values here, but Boss tasks (type 4) drain the most.
            // As a heuristic, prefer Boss > Normal with high maxReps > others.
            // The simplest proxy: tasks with type 4 (Boss), then type 0 (Normal).
            {
                const bosses = available.filter(t => t.type === 4);
                if (bosses.length > 0) return bosses[0].id;
                return available[0].id;
            }

        case DrainStrategy.HIGHEST_XP:
            // Without exact XP rates, prefer tasks with highest maxReps
            // (more reps = more XP ticks), breaking ties by preferring non-mandatory
            {
                const sorted = [...available].sort((a, b) => b.maxReps - a.maxReps);
                return sorted[0].id;
            }

        case DrainStrategy.SPECIFIC_TASK:
            if (specificTaskId !== undefined) {
                const found = available.find(t => t.id === specificTaskId);
                if (found) return found.id;
            }
            // Fallback to first available
            return available[0]?.id ?? null;

        default:
            return available[0]?.id ?? null;
    }
}
