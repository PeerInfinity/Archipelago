/**
 * ProofGraphState — manages the graph construction puzzle for MetaMath Medium mode.
 *
 * Extends ProofBaseState with edge-drawing mechanics:
 *   - The player sees all proof step nodes but no edges
 *   - They must draw edges between nodes to reconstruct the dependency graph
 *   - Correct edges stick; incorrect edges are rejected
 *   - When all incoming dependency edges for a step are correctly drawn,
 *     the step's location check becomes available
 */

import { ProofBaseState } from '../proofShared/proofBaseState.js';

export class ProofGraphState extends ProofBaseState {
  constructor() {
    super();

    /**
     * Correct dependency edges in the proof.
     * Key: "source->target:slot" (e.g. "1->3:0" means step 1 fills slot 0 of step 3)
     * Value: { source: number, target: number, slot: number }
     * @type {Map<string, {source: number, target: number, slot: number}>}
     */
    this.correctEdges = new Map();

    /**
     * Edges the player has successfully drawn.
     * Same key format as correctEdges.
     * @type {Set<string>}
     */
    this.drawnEdges = new Set();

    /** @type {number} Total number of incorrect edge attempts */
    this.incorrectAttempts = 0;

    // ─── Callbacks ────────────────────────────────────────
    /** @type {Function|null} Called when an edge is correctly drawn */
    this.onEdgeDrawn = null;
    /** @type {Function|null} Called when an edge attempt is rejected */
    this.onEdgeRejected = null;
    /** @type {Function|null} Called when a step becomes fully connected */
    this.onStepCompleted = null;
    /** @type {Function|null} Called when puzzle state changes */
    this.onStateChanged = null;
  }

  // ─── Data Loading ──────────────────────────────────────────

  /**
   * Load proof structure from rules.json slot_data.
   * @param {Object} slotData
   * @param {Object} [nameSubstitutions]
   * @param {Object} [options] - World options (forwarded to _parseProofStructure)
   */
  loadFromSlotData(slotData, nameSubstitutions, options) {
    this.correctEdges.clear();
    this.drawnEdges.clear();
    this.incorrectAttempts = 0;

    const success = this._parseProofStructure(slotData, nameSubstitutions, options);
    if (!success) return false;

    // Build correct edges from parsed step dependencies (one per slot)
    for (const [index, step] of this.steps) {
      for (let slot = 0; slot < step.dependencies.length; slot++) {
        const dep = step.dependencies[slot];
        const edgeKey = `${dep}->${index}:${slot}`;
        this.correctEdges.set(edgeKey, { source: dep, target: index, slot });
      }
    }

    this.isLoaded = true;
    return true;
  }

  // ─── Edge Drawing ─────────────────────────────────────────

  /**
   * Attempt to draw an edge from source to target.
   * An edge is correct if `source` is a dependency of `target` in the proof.
   *
   * @param {number} sourceIndex - The dependency step
   * @param {number} targetIndex - The step that depends on source
   * @returns {{success: boolean, reason?: string}}
   */
  tryDrawEdge(sourceIndex, targetIndex) {
    // Can't draw self-loops
    if (sourceIndex === targetIndex) {
      return { success: false, reason: 'self-loop' };
    }

    // Both steps must exist
    if (!this.steps.has(sourceIndex) || !this.steps.has(targetIndex)) {
      return { success: false, reason: 'invalid-step' };
    }

    // Find the first unfilled slot matching this source→target pair
    let matchedKey = null;
    let matchedEdge = null;
    for (const [key, edge] of this.correctEdges) {
      if (edge.source === sourceIndex && edge.target === targetIndex && !this.drawnEdges.has(key)) {
        matchedKey = key;
        matchedEdge = edge;
        break;
      }
    }

    if (matchedKey) {
      this.drawnEdges.add(matchedKey);

      if (this.onEdgeDrawn) {
        this.onEdgeDrawn(sourceIndex, targetIndex, matchedEdge.slot);
      }

      // Check if target step is now fully connected
      if (this._isStepFullyConnected(targetIndex)) {
        if (this.onStepCompleted) {
          this.onStepCompleted(targetIndex);
        }
      }

      if (this.onStateChanged) this.onStateChanged();
      return { success: true, slot: matchedEdge.slot };
    }

    // No unfilled slot — either all drawn or not a valid dependency
    if (this.hasUnfilledSlot(sourceIndex, targetIndex) === false &&
        this._hasAnySlot(sourceIndex, targetIndex)) {
      return { success: false, reason: 'already-drawn' };
    }

    // Wrong edge
    this.incorrectAttempts++;
    if (this.onEdgeRejected) {
      this.onEdgeRejected(sourceIndex, targetIndex);
    }
    return { success: false, reason: 'incorrect' };
  }

  // ─── Query Methods ────────────────────────────────────────

  /**
   * Check if all incoming dependency edges for a step have been drawn.
   * Steps with no dependencies are always fully connected.
   */
  _isStepFullyConnected(stepIndex) {
    const step = this.steps.get(stepIndex);
    if (!step) return false;
    if (step.dependencies.length === 0) return true;

    // Every slot must be filled
    return step.dependencies.every((dep, slot) => {
      const edgeKey = `${dep}->${stepIndex}:${slot}`;
      return this.drawnEdges.has(edgeKey);
    });
  }

  /**
   * Check if a step's location is checkable.
   * A step is checkable if:
   *   - All its dependency edges have been correctly drawn
   *   - Dependencies are satisfied per entranceRuleMode
   *   - Its location hasn't been checked yet
   */
  isStepCheckable(stepIndex) {
    const step = this.steps.get(stepIndex);
    if (!step) return false;
    if (this.checkedLocations.has(step.locationName)) return false;
    if (!this._isStepFullyConnected(stepIndex)) return false;

    return this._areDepsSatisfied(step);
  }

  /**
   * Get all steps that have no dependencies (axioms/definitions).
   * These are automatically "complete" from the start.
   */
  getAxiomSteps() {
    return [...this.steps.values()].filter(s => s.dependencies.length === 0);
  }

  /**
   * Get the set of step indices that should be visible in the graph.
   * A step is visible if its dependencies are satisfied per entranceRuleMode.
   * @returns {Set<number>}
   */
  getVisibleSteps() {
    const visible = new Set();
    for (const [index, step] of this.steps) {
      if (this._areDepsSatisfied(step)) {
        visible.add(index);
      }
    }
    return visible;
  }

  /**
   * Get the number of correct edges still needed.
   */
  getRemainingEdgeCount() {
    return this.correctEdges.size - this.drawnEdges.size;
  }

  /**
   * Get the total number of correct edges.
   */
  getTotalEdgeCount() {
    return this.correctEdges.size;
  }

  /**
   * Check if all edges have been drawn.
   */
  isAllEdgesDrawn() {
    return this.drawnEdges.size === this.correctEdges.size;
  }

  /**
   * Auto-draw all incoming edges for checked steps that aren't already drawn.
   * @returns {Array<{source: number, target: number, slot: number, edgeKey: string}>}
   *   List of newly drawn edges.
   */
  autoDrawEdgesForCheckedSteps() {
    const newlyDrawn = [];
    for (const [index, step] of this.steps) {
      if (!this.checkedLocations.has(step.locationName)) continue;
      for (let slot = 0; slot < step.dependencies.length; slot++) {
        const dep = step.dependencies[slot];
        const edgeKey = `${dep}->${index}:${slot}`;
        if (!this.drawnEdges.has(edgeKey)) {
          this.drawnEdges.add(edgeKey);
          newlyDrawn.push({ source: dep, target: index, slot, edgeKey });
        }
      }
    }
    return newlyDrawn;
  }

  /**
   * Get edges already drawn for a specific target step (one per filled slot).
   * @returns {number[]} Source indices of drawn incoming edges
   */
  getDrawnDependenciesFor(stepIndex) {
    const step = this.steps.get(stepIndex);
    if (!step) return [];
    const drawn = [];
    for (let slot = 0; slot < step.dependencies.length; slot++) {
      const dep = step.dependencies[slot];
      if (this.drawnEdges.has(`${dep}->${stepIndex}:${slot}`)) {
        drawn.push(dep);
      }
    }
    return drawn;
  }

  /**
   * Get the count of missing edges for a step.
   */
  getMissingEdgeCount(stepIndex) {
    const step = this.steps.get(stepIndex);
    if (!step) return 0;
    return step.dependencies.length - this.getDrawnDependenciesFor(stepIndex).length;
  }

  /**
   * Check if there's an unfilled slot for a source→target pair.
   */
  hasUnfilledSlot(sourceIndex, targetIndex) {
    for (const [key, edge] of this.correctEdges) {
      if (edge.source === sourceIndex && edge.target === targetIndex && !this.drawnEdges.has(key)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if any correct edge slot exists for source→target (regardless of filled state).
   * @private
   */
  _hasAnySlot(sourceIndex, targetIndex) {
    for (const [, edge] of this.correctEdges) {
      if (edge.source === sourceIndex && edge.target === targetIndex) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get a map of filled slots for a step: slot → sourceIndex.
   */
  getDrawnSlotsFor(stepIndex) {
    const step = this.steps.get(stepIndex);
    if (!step) return new Map();
    const slots = new Map();
    for (let slot = 0; slot < step.dependencies.length; slot++) {
      const dep = step.dependencies[slot];
      if (this.drawnEdges.has(`${dep}->${stepIndex}:${slot}`)) {
        slots.set(slot, dep);
      }
    }
    return slots;
  }
}
