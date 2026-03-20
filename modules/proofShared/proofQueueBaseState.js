/**
 * ProofQueueBaseState — shared base for states that manage an ordered proof queue.
 *
 * Extends ProofBaseState with:
 *   - Ordered queue of proof step indices
 *   - Available steps tracking (item received or no-dep axiom)
 *   - Queue validation (dependencies must appear earlier)
 *   - Queue manipulation (add, remove, move, clear)
 *   - Topological sort helper
 *
 * Used by: ProofQueueState (Easy mode)
 */

import { ProofBaseState } from './proofBaseState.js';

export class ProofQueueBaseState extends ProofBaseState {
  constructor() {
    super();

    /** @type {number[]} Ordered queue of step indices (the player's arrangement) */
    this.queue = [];

    /** @type {Set<number>} Steps available to place (item received or no-dep starting step) */
    this.availableSteps = new Set();

    /** @type {Function|null} Callback when queue changes */
    this.onQueueChanged = null;

    /** @type {Function|null} Callback when available steps change */
    this.onAvailableChanged = null;
  }

  // ─── Queue Operations ─────────────────────────────────────

  /**
   * Remove a step from the queue and return it to the available pool.
   * Only allowed if the step's location hasn't been checked yet.
   * @param {number} stepIndex
   * @returns {boolean}
   */
  removeFromQueue(stepIndex) {
    const step = this.steps.get(stepIndex);
    if (!step) return false;
    // Can't remove already-checked steps
    if (this.checkedLocations.has(step.locationName)) return false;

    const idx = this.queue.indexOf(stepIndex);
    if (idx === -1) return false;

    this.queue.splice(idx, 1);
    this._notifyQueueChanged();
    return true;
  }

  /**
   * Move a step within the queue.
   * Only non-checked steps can be moved.
   * @param {number} fromIdx - Queue array index (not step index)
   * @param {number} toIdx - Queue array index (not step index)
   * @returns {boolean}
   */
  moveInQueue(fromIdx, toIdx) {
    if (fromIdx < 0 || fromIdx >= this.queue.length) return false;
    if (toIdx < 0 || toIdx >= this.queue.length) return false;
    if (fromIdx === toIdx) return false;

    const stepIndex = this.queue[fromIdx];
    const step = this.steps.get(stepIndex);
    if (!step) return false;
    // Can't move already-checked steps
    if (this.checkedLocations.has(step.locationName)) return false;

    // Remove and reinsert
    this.queue.splice(fromIdx, 1);
    this.queue.splice(toIdx, 0, stepIndex);
    this._notifyQueueChanged();
    return true;
  }

  /**
   * Clear all non-checked steps from the queue.
   */
  clearUncheckedFromQueue() {
    this.queue = this.queue.filter(idx => {
      const step = this.steps.get(idx);
      return step && this.checkedLocations.has(step.locationName);
    });
    this._notifyQueueChanged();
  }

  // ─── Validation ───────────────────────────────────────────

  /**
   * Validate the queue and return status for each position.
   * A step is "valid" if all its dependencies appear earlier in the queue.
   * A step is "checkable" if it's valid AND its location hasn't been checked yet.
   * @returns {Array<{stepIndex: number, valid: boolean, checkable: boolean, missingDeps: number[], alreadyChecked: boolean}>}
   */
  validateQueue() {
    const result = [];
    const seenInQueue = new Set();

    for (let i = 0; i < this.queue.length; i++) {
      const stepIndex = this.queue[i];
      const step = this.steps.get(stepIndex);
      if (!step) continue;

      const missingDeps = step.dependencies.filter(dep => !seenInQueue.has(dep));
      const valid = missingDeps.length === 0;
      const alreadyChecked = this.checkedLocations.has(step.locationName);
      const checkable = valid && !alreadyChecked;

      result.push({ stepIndex, valid, checkable, missingDeps, alreadyChecked });
      seenInQueue.add(stepIndex);
    }

    return result;
  }

  /**
   * Get the next checkable step in the queue (first valid unchecked step).
   * @returns {number|null} Step index, or null if none
   */
  getNextCheckableStep() {
    const validation = this.validateQueue();
    for (const entry of validation) {
      if (entry.checkable) return entry.stepIndex;
    }
    return null;
  }

  /**
   * Get all steps in the queue with their validation status.
   * @returns {Array<{step: ProofStep, valid: boolean, checkable: boolean, missingDeps: number[], alreadyChecked: boolean}>}
   */
  getQueueWithStatus() {
    const validation = this.validateQueue();
    return validation.map(entry => ({
      step: this.steps.get(entry.stepIndex),
      ...entry,
    }));
  }

  // ─── Available Steps ──────────────────────────────────────

  /**
   * Recalculate which steps are available to place.
   * A step is available if its dependencies are satisfied per entranceRuleMode.
   * @protected
   */
  _updateAvailableSteps() {
    const prev = new Set(this.availableSteps);
    this.availableSteps.clear();

    for (const [index, step] of this.steps) {
      if (this._areDepsSatisfied(step)) {
        this.availableSteps.add(index);
      }
    }

    // Notify if changed
    const changed = this.availableSteps.size !== prev.size ||
      [...this.availableSteps].some(idx => !prev.has(idx));
    if (changed && this.onAvailableChanged) {
      this.onAvailableChanged();
    }
  }

  /** @override */
  _onInventoryChanged() {
    this._updateAvailableSteps();
  }

  /** @override */
  _onLocationChecked() {
    this._updateAvailableSteps();
  }

  // ─── Helpers ──────────────────────────────────────────────

  /**
   * Topological sort of step indices, respecting dependencies.
   * @param {number[]} indices
   * @returns {number[]}
   * @protected
   */
  _topologicalSort(indices) {
    const indexSet = new Set(indices);
    const visited = new Set();
    const result = [];

    const visit = (idx) => {
      if (visited.has(idx)) return;
      visited.add(idx);
      const step = this.steps.get(idx);
      if (step) {
        for (const dep of step.dependencies) {
          if (indexSet.has(dep)) {
            visit(dep);
          }
        }
      }
      result.push(idx);
    };

    for (const idx of indices) {
      visit(idx);
    }

    return result;
  }

  /** @protected */
  _notifyQueueChanged() {
    if (this.onQueueChanged) {
      this.onQueueChanged();
    }
  }
}
