/**
 * CommandQueue Module
 *
 * Manages a queue of commands for the StateManager worker thread.
 *
 * Purpose:
 * - Queue incoming commands instead of processing immediately
 * - Enable command batching (future phase)
 * - Provide debugging visibility into command flow
 * - Improve reliability by controlling execution flow
 *
 * Data Flow:
 * 1. Commands arrive via postMessage → enqueued immediately
 * 2. Processing loop dequeues and executes commands in FIFO order
 * 3. Completed commands move to success/failure history
 * 4. Snapshots can be requested for debugging
 *
 * Phase 8: Minimal implementation (basic queue + monitoring)
 * Phase 9+: Automatic command batching
 */

/**
 * CommandQueue Class
 *
 * Manages a queue of pending commands and tracks their execution.
 */
export class CommandQueue {
  /**
   * @param {Object} options - Configuration options
   * @param {boolean} options.enabled - Enable/disable queue (for testing)
   * @param {number} options.maxHistorySize - Maximum history entries to keep
   * @param {boolean} options.debugMode - Enable debug logging
   */
  constructor(options = {}) {
    // Queue state
    this.commands = [];              // Array of pending commands (FIFO)
    this.processing = false;         // Is queue processor running?
    this.currentCommand = null;      // Currently executing command

    // History tracking (separate histories for success/failure)
    this.successHistory = [];        // Recently completed commands
    this.failureHistory = [];        // Recently failed commands
    this.maxHistorySize = options.maxHistorySize || 50;

    // Queue management
    this.nextQueueId = 1;            // Auto-incrementing queue ID

    // Configuration
    this.enabled = options.enabled !== false; // Default: enabled
    this.debugMode = options.debugMode || false;

    // Metrics tracking
    this.metrics = {
      totalEnqueued: 0,
      totalProcessed: 0,
      totalFailed: 0,
      peakQueueDepth: 0,     // Highest number of unprocessed entries
      commandTypeCounts: {}  // Count by command type
    };
  }

  /**
   * Enqueue a new command
   *
   * @param {string} command - Command name (e.g., 'addItemToInventory')
   * @param {number} queryId - Query ID for response matching
   * @param {Object} payload - Command payload
   * @returns {Object} Queue entry object with queueId
   */
  enqueue(command, queryId, payload) {
    const entry = {
      // From incoming message
      command: command,
      queryId: queryId,
      payload: payload,

      // Queue management
      queueId: this.nextQueueId++,
      status: 'pending',
      enqueuedAt: Date.now(),
      startedAt: null,
      completedAt: null,
      error: null
    };

    this.commands.push(entry);

    // Update metrics
    this.metrics.totalEnqueued++;
    this.metrics.commandTypeCounts[command] =
      (this.metrics.commandTypeCounts[command] || 0) + 1;

    // Update peak queue depth
    if (this.commands.length > this.metrics.peakQueueDepth) {
      this.metrics.peakQueueDepth = this.commands.length;
    }

    // Debug logging
    if (this.debugMode) {
      console.log(
        `[CommandQueue] Enqueued: ${command} (queueId: ${entry.queueId}, queue size: ${this.commands.length})`
      );
    }

    // Warning threshold: queue getting large
    if (this.commands.length > 100) {
      console.warn(
        `[CommandQueue] Queue size exceeds 100: ${this.commands.length} pending commands`
      );
    }

    return entry;
  }

  /**
   * Get next command to process
   * Marks command as 'processing' and sets startedAt timestamp
   *
   * @returns {Object|null} Next command entry, or null if queue empty
   */
  getNext() {
    if (this.commands.length === 0) {
      return null;
    }

    const cmd = this.commands[0]; // FIFO: get first command
    cmd.status = 'processing';
    cmd.startedAt = Date.now();
    this.currentCommand = cmd;

    // Check for long wait time
    const waitTime = cmd.startedAt - cmd.enqueuedAt;
    if (waitTime > 1000 && this.debugMode) {
      console.warn(
        `[CommandQueue] Command waited ${waitTime}ms in queue: ${cmd.command} (queueId: ${cmd.queueId})`
      );
    }

    if (this.debugMode) {
      console.log(
        `[CommandQueue] Processing: ${cmd.command} (queueId: ${cmd.queueId}, waited: ${waitTime}ms)`
      );
    }

    return cmd;
  }

  /**
   * Mark command as completed successfully
   * Moves command from queue to success history
   *
   * @param {number} queueId - Queue ID of completed command
   */
  markCompleted(queueId) {
    const cmd = this.currentCommand;

    if (!cmd || cmd.queueId !== queueId) {
      console.error(
        `[CommandQueue] markCompleted called with mismatched queueId: ${queueId} (current: ${cmd?.queueId})`
      );
      return;
    }

    // Update command status
    cmd.status = 'completed';
    cmd.completedAt = Date.now();

    // Remove from queue
    this.commands.shift();

    // Add to success history (circular buffer)
    this.successHistory.push(cmd);
    if (this.successHistory.length > this.maxHistorySize) {
      this.successHistory.shift();
    }

    // Update metrics
    this.metrics.totalProcessed++;

    // Clear current command
    this.currentCommand = null;

    // Debug logging
    if (this.debugMode) {
      const executionTime = cmd.completedAt - cmd.startedAt;
      console.log(
        `[CommandQueue] Completed: ${cmd.command} (queueId: ${cmd.queueId}, execution: ${executionTime}ms)`
      );
    }
  }

  /**
   * Mark command as failed
   * Moves command from queue to failure history
   *
   * @param {number} queueId - Queue ID of failed command
   * @param {Error|string} error - Error that caused failure
   */
  markFailed(queueId, error) {
    const cmd = this.currentCommand;

    if (!cmd || cmd.queueId !== queueId) {
      console.error(
        `[CommandQueue] markFailed called with mismatched queueId: ${queueId} (current: ${cmd?.queueId})`
      );
      return;
    }

    // Update command status
    cmd.status = 'failed';
    cmd.completedAt = Date.now();
    cmd.error = error instanceof Error ? error.message : String(error);

    // Remove from queue
    this.commands.shift();

    // Add to failure history (separate from success history)
    this.failureHistory.push(cmd);
    if (this.failureHistory.length > this.maxHistorySize) {
      this.failureHistory.shift();
    }

    // Update metrics
    this.metrics.totalFailed++;

    // Clear current command
    this.currentCommand = null;

    // Log error
    console.error(
      `[CommandQueue] Failed: ${cmd.command} (queueId: ${cmd.queueId}, error: ${cmd.error})`
    );
  }

  /**
   * Check if queue has pending commands
   *
   * @returns {boolean} True if queue has pending commands
   */
  hasPending() {
    return this.commands.length > 0;
  }

  /**
   * Get queue snapshot for debugging
   * Returns summary information about queue state
   *
   * @returns {Object} Queue snapshot
   */
  getSnapshot() {
    const now = Date.now();

    // Find oldest pending command
    let oldestPending = null;
    if (this.commands.length > 0) {
      const oldest = this.commands[0];
      oldestPending = {
        queueId: oldest.queueId,
        command: oldest.command,
        enqueuedAt: oldest.enqueuedAt,
        waitingMs: now - oldest.enqueuedAt
      };
    }

    // Current command info
    let currentCommandInfo = null;
    if (this.currentCommand) {
      currentCommandInfo = {
        queueId: this.currentCommand.queueId,
        command: this.currentCommand.command,
        enqueuedAt: this.currentCommand.enqueuedAt,
        startedAt: this.currentCommand.startedAt,
        elapsedMs: now - this.currentCommand.startedAt
      };
    }

    // Count commands by type in current queue
    const pendingCommandTypeCounts = {};
    for (const cmd of this.commands) {
      pendingCommandTypeCounts[cmd.command] =
        (pendingCommandTypeCounts[cmd.command] || 0) + 1;
    }

    // Recent history (last 5 successes, all failures)
    const recentSuccesses = this.successHistory.slice(-5).map(cmd => ({
      queueId: cmd.queueId,
      command: cmd.command,
      enqueuedAt: cmd.enqueuedAt,
      startedAt: cmd.startedAt,
      completedAt: cmd.completedAt,
      executionMs: cmd.completedAt - cmd.startedAt,
      totalMs: cmd.completedAt - cmd.enqueuedAt
    }));

    const recentFailures = this.failureHistory.slice(-10).map(cmd => ({
      queueId: cmd.queueId,
      command: cmd.command,
      enqueuedAt: cmd.enqueuedAt,
      startedAt: cmd.startedAt,
      completedAt: cmd.completedAt,
      error: cmd.error
    }));

    return {
      // Current state
      queueLength: this.commands.length,
      processing: this.processing,
      enabled: this.enabled,
      currentCommand: currentCommandInfo,

      // Queue contents
      pendingCommandTypeCounts: pendingCommandTypeCounts,
      oldestPendingCommand: oldestPending,

      // History
      successHistoryLength: this.successHistory.length,
      failureHistoryLength: this.failureHistory.length,
      recentSuccesses: recentSuccesses,
      recentFailures: recentFailures,

      // Cumulative metrics (total commands sent of each type)
      cumulativeCommandTypeCounts: { ...this.metrics.commandTypeCounts },

      // Metrics
      metrics: {
        totalEnqueued: this.metrics.totalEnqueued,
        totalProcessed: this.metrics.totalProcessed,
        totalFailed: this.metrics.totalFailed,
        peakQueueDepth: this.metrics.peakQueueDepth
      }
    };
  }

  /**
   * Clear all history (for testing)
   */
  clearHistory() {
    this.successHistory = [];
    this.failureHistory = [];

    if (this.debugMode) {
      console.log('[CommandQueue] History cleared');
    }
  }

  /**
   * Reset all metrics (for testing)
   */
  resetMetrics() {
    this.metrics = {
      totalEnqueued: 0,
      totalProcessed: 0,
      totalFailed: 0,
      peakQueueDepth: 0,
      commandTypeCounts: {}
    };

    if (this.debugMode) {
      console.log('[CommandQueue] Metrics reset');
    }
  }

  /**
   * Get queue statistics
   * @returns {Object} Statistics about queue performance
   */
  getStatistics() {
    const avgWaitTime = this.successHistory.length > 0
      ? this.successHistory.reduce((sum, cmd) =>
          sum + (cmd.startedAt - cmd.enqueuedAt), 0) / this.successHistory.length
      : 0;

    const avgExecutionTime = this.successHistory.length > 0
      ? this.successHistory.reduce((sum, cmd) =>
          sum + (cmd.completedAt - cmd.startedAt), 0) / this.successHistory.length
      : 0;

    return {
      averageWaitTimeMs: Math.round(avgWaitTime),
      averageExecutionTimeMs: Math.round(avgExecutionTime),
      successRate: this.metrics.totalProcessed > 0
        ? (this.metrics.totalProcessed / (this.metrics.totalProcessed + this.metrics.totalFailed)) * 100
        : 100,
      currentQueueDepth: this.commands.length,
      peakQueueDepth: this.metrics.peakQueueDepth
    };
  }
}
