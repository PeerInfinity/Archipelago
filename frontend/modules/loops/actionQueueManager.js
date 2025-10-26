// actionQueueManager.js
import { createUniversalLogger } from '../../app/core/universalLogger.js';

const logger = createUniversalLogger('loopUI:ActionQueue');

/**
 * ActionQueueManager
 *
 * Manages the action queue by translating PlayerState path to loop action objects.
 * Tracks progress and completion state for each action.
 *
 * Data Flow:
 * 1. PlayerState maintains the path (sequence of path entries)
 * 2. ActionQueueManager maps path entries to action objects for UI/processing
 * 3. Progress and completion tracked separately via Maps/Sets
 * 4. Queue modifications delegate to PlayerState API
 *
 * Responsibilities:
 * - Map PlayerState path to action queue
 * - Track action progress (0-100)
 * - Track action completion status
 * - Provide queue manipulation methods
 */
export class ActionQueueManager {
  constructor(playerStateAPI) {
    this.playerStateAPI = playerStateAPI;

    // Progress and completion tracking
    this.actionProgress = new Map(); // pathIndex -> progress (0-100)
    this.actionCompleted = new Set(); // Set of completed path indices

    logger.debug('ActionQueueManager constructed');
  }

  /**
   * Get the current action queue from playerState path
   * Maps path entries to action objects for processing
   * @returns {Array} Array of action objects
   */
  getActionQueue() {
    if (!this.playerStateAPI || !this.playerStateAPI.getPath) {
      return [];
    }

    const path = this.playerStateAPI.getPath();
    const actions = [];

    path.forEach((entry, index) => {
      let action = null;

      if (entry.type === 'regionMove') {
        action = {
          id: `action-${index}`,
          type: 'moveToRegion',
          regionName: entry.region,
          region: entry.region,
          exitUsed: entry.exitUsed || null,
          instanceNumber: entry.instanceNumber,
          pathIndex: index,
        };
      } else if (entry.type === 'locationCheck') {
        action = {
          id: `action-${index}`,
          type: 'checkLocation',
          locationName: entry.locationName,
          regionName: entry.region,
          region: entry.region,
          instanceNumber: entry.instanceNumber,
          pathIndex: index,
        };
      } else if (entry.type === 'customAction' && entry.actionName === 'explore') {
        action = {
          id: `action-${index}`,
          type: 'explore',
          regionName: entry.region,
          region: entry.region,
          repeat: entry.metadata?.repeat || false,
          instanceNumber: entry.instanceNumber,
          pathIndex: index,
        };
      }
      // Add other custom actions as needed

      if (action) {
        // Add progress and completion status from our tracking
        action.progress = this.actionProgress.get(index) || 0;
        action.completed = this.actionCompleted.has(index);
        actions.push(action);
      }
    });

    return actions;
  }

  /**
   * Queue an explore action
   * @param {string} regionName - The region to explore
   * @param {boolean} repeat - Whether this is a repeating explore action
   */
  queueExploreAction(regionName, repeat = false) {
    if (!this.playerStateAPI || !this.playerStateAPI.addCustomAction) {
      logger.error('Cannot queue explore action: playerStateAPI not available');
      return false;
    }

    this.playerStateAPI.addCustomAction('explore', { repeat });
    logger.debug(`Queued explore action for ${regionName}, repeat: ${repeat}`);
    return true;
  }

  /**
   * Queue a location check action
   * @param {string} locationName - The location to check
   * @param {string} regionName - The region containing the location
   */
  queueLocationCheck(locationName, regionName) {
    if (!this.playerStateAPI || !this.playerStateAPI.addLocationCheck) {
      logger.error('Cannot queue location check: playerStateAPI not available');
      return false;
    }

    this.playerStateAPI.addLocationCheck(locationName, regionName);
    logger.debug(`Queued location check for ${locationName} in ${regionName}`);
    return true;
  }

  /**
   * Remove an action from the queue
   * @param {number} actionIndex - Index in the action queue
   * @returns {boolean} True if removed successfully
   */
  removeAction(actionIndex) {
    if (!this.playerStateAPI) {
      logger.error('Cannot remove action: playerStateAPI not available');
      return false;
    }

    const queue = this.getActionQueue();
    if (actionIndex < 0 || actionIndex >= queue.length) {
      logger.warn(`Invalid action index for removal: ${actionIndex}`);
      return false;
    }

    const actionToRemove = queue[actionIndex];

    // Remove from playerState based on action type
    if (actionToRemove.type === 'checkLocation') {
      this.playerStateAPI.removeLocationCheckAt(
        actionToRemove.locationName,
        actionToRemove.regionName,
        actionToRemove.instanceNumber
      );
    } else if (actionToRemove.type === 'explore') {
      this.playerStateAPI.removeCustomActionAt(
        'explore',
        actionToRemove.regionName,
        actionToRemove.instanceNumber,
        actionToRemove.metadata
      );
    } else {
      logger.warn(`Cannot remove action of type ${actionToRemove.type}`);
      return false;
    }

    // Clean up our tracking data
    if (actionToRemove.pathIndex !== undefined) {
      this.actionProgress.delete(actionToRemove.pathIndex);
      this.actionCompleted.delete(actionToRemove.pathIndex);
    }

    logger.debug(`Removed action at index ${actionIndex}`);
    return true;
  }

  /**
   * Clear all actions from the queue
   */
  clearQueue() {
    if (!this.playerStateAPI) {
      logger.error('Cannot clear queue: playerStateAPI not available');
      return;
    }

    // Clear tracking
    this.actionProgress.clear();
    this.actionCompleted.clear();

    // Remove all location checks and custom actions from the path
    this.playerStateAPI.removeAllActionsOfType('locationCheck');
    this.playerStateAPI.removeAllActionsOfType('customAction');

    logger.debug('Cleared action queue');
  }

  /**
   * Clear all explore actions from the queue
   * @returns {number} Number of actions removed
   */
  clearExploreActions() {
    if (!this.playerStateAPI) {
      logger.error('Cannot clear explore actions: playerStateAPI not available');
      return 0;
    }

    const removedCount = this.playerStateAPI.removeAllActionsOfType('customAction', 'explore');

    // Note: We could clean up tracking for removed actions, but since path indices
    // change after removal, we let getActionQueue handle missing progress

    logger.debug(`Cleared ${removedCount} explore actions`);
    return removedCount;
  }

  /**
   * Get progress for an action
   * @param {number} pathIndex - Index in the path
   * @returns {number} Progress (0-100)
   */
  getProgress(pathIndex) {
    return this.actionProgress.get(pathIndex) || 0;
  }

  /**
   * Set progress for an action
   * @param {number} pathIndex - Index in the path
   * @param {number} progress - Progress value (0-100)
   */
  setProgress(pathIndex, progress) {
    this.actionProgress.set(pathIndex, progress);
  }

  /**
   * Mark an action as completed
   * @param {number} pathIndex - Index in the path
   */
  markCompleted(pathIndex) {
    this.actionCompleted.add(pathIndex);
    this.actionProgress.set(pathIndex, 100);
  }

  /**
   * Check if an action is completed
   * @param {number} pathIndex - Index in the path
   * @returns {boolean} True if completed
   */
  isCompleted(pathIndex) {
    return this.actionCompleted.has(pathIndex);
  }

  /**
   * Reset all progress tracking
   * Clears both progress and completion tracking
   */
  resetProgress() {
    this.actionProgress.clear();
    this.actionCompleted.clear();
    logger.debug('Reset all progress tracking');
  }

  /**
   * Get state for persistence
   * @returns {Object} Serializable state object
   */
  getState() {
    return {
      actionProgress: Array.from(this.actionProgress.entries()),
      actionCompleted: Array.from(this.actionCompleted),
    };
  }

  /**
   * Load state from persistence
   * @param {Object} state - State object to load
   */
  loadState(state) {
    if (state.actionProgress) {
      this.actionProgress = new Map(state.actionProgress);
    }
    if (state.actionCompleted) {
      this.actionCompleted = new Set(state.actionCompleted);
    }
    logger.debug('Loaded state from persistence');
  }

  /**
   * Get debug information
   * @returns {Object} Debug information
   */
  getDebugInfo() {
    const queue = this.getActionQueue();
    return {
      queueLength: queue.length,
      trackedProgress: this.actionProgress.size,
      completedActions: this.actionCompleted.size,
      queue: queue.map(a => ({
        type: a.type,
        region: a.regionName,
        progress: a.progress,
        completed: a.completed
      }))
    };
  }
}

export default ActionQueueManager;
