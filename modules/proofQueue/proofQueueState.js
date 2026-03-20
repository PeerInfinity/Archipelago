/**
 * ProofQueueState — manages the proof step ordering queue for MetaMath Easy mode.
 *
 * Extends ProofQueueBaseState with:
 *   - addToQueue (pool-based placement with availability check)
 *   - autoFillQueue (topological sort of available steps)
 *   - getUnplacedSteps (available steps not in queue)
 */

import { ProofQueueBaseState } from '../proofShared/proofQueueBaseState.js';

export class ProofQueueState extends ProofQueueBaseState {
  // ─── Data Loading ──────────────────────────────────────────

  /**
   * Load proof structure from rules.json slot_data.
   * @param {Object} slotData - The slot_data object from rules.json
   * @param {Object} nameSubstitutions - The name_substitutions object from rules.json
   * @param {Object} [options] - World options (forwarded to _parseProofStructure)
   */
  loadFromSlotData(slotData, nameSubstitutions, options) {
    this.queue = [];
    this.availableSteps.clear();

    const success = this._parseProofStructure(slotData, nameSubstitutions, options);
    if (!success) return false;

    // Steps with no dependencies are always available to place
    this._updateAvailableSteps();

    this.isLoaded = true;
    return true;
  }

  // ─── Queue Operations ─────────────────────────────────────

  /**
   * Add a step to the end of the queue.
   * @param {number} stepIndex
   * @returns {boolean} Whether the step was added
   */
  addToQueue(stepIndex) {
    if (!this.steps.has(stepIndex)) return false;
    if (this.queue.includes(stepIndex)) return false;
    // Step must be available (item received or no-dep axiom)
    if (!this.availableSteps.has(stepIndex)) return false;

    this.queue.push(stepIndex);
    this._notifyQueueChanged();
    return true;
  }

  /**
   * Add all available steps to the queue in dependency-respecting order.
   * Steps already in queue are skipped.
   */
  autoFillQueue() {
    // Topological sort of available steps not yet in queue
    const toAdd = [...this.availableSteps].filter(idx => !this.queue.includes(idx));
    const sorted = this._topologicalSort(toAdd);
    for (const idx of sorted) {
      this.queue.push(idx);
    }
    if (sorted.length > 0) {
      this._notifyQueueChanged();
    }
  }

  // ─── Helpers ──────────────────────────────────────────────

  /**
   * Get steps not yet placed in the queue (available pool).
   * @returns {ProofStep[]}
   */
  getUnplacedSteps() {
    const inQueue = new Set(this.queue);
    return [...this.availableSteps]
      .filter(idx => !inQueue.has(idx))
      .map(idx => this.steps.get(idx))
      .filter(Boolean);
  }
}
