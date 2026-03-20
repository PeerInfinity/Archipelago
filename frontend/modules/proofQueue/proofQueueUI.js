/**
 * ProofQueueUI — GoldenLayout panel for the MetaMath Easy mode proof queue.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  Proof Queue: 2p2e4                                     │  header
 *   ├──────────────────────────────────────────────────────────┤
 *   │  [Fill all] [Clear]  ☐ Auto-fill  [Check Next] ☐ Auto   │  toolbar row 1
 *   │  ☐ Show details & links                                 │  toolbar row 2
 *   ├──────────────────────────────────────────────────────────┤
 *   │  PROVEN STEPS                                           │  proven section
 *   │  Theorem 2p2e4: |- ( 2 + 2 ) = 4                       │
 *   │  Step │ Hyp │ Ref      │ Expression            │ Type   │
 *   │  1    │     │ 2cn      │ |- 2 e. CC            │ Thm    │
 *   │                                           Q.E.D.        │
 *   ├──────────────────────────────────────────────────────────┤
 *   │  AVAILABLE STEPS (chips)                                │  working area
 *   │  [df-2] [df-3] [df-4]                                   │
 *   ├──────────────────────────────────────────────────────────┤
 *   │  QUEUE (unchecked only)                                 │
 *   │  Step │ Hyp │ Ref    │ Expression        │ Type │ ×     │
 *   │  4    │     │ df-2   │ |- 2 = (1+1)      │ Def  │ ×     │
 *   ├──────────────────────────────────────────────────────────┤
 *   │  3/10 proved | 2 in queue | 3 available                 │  status
 *   └──────────────────────────────────────────────────────────┘
 */

import {
  createEventBusGetter,
  createLogger,
  hasProofStructure,
  getStructureType,
  syncStateFromSnapshot,
  ensureStateLoaded,
  dispatchLocationCheck,
} from '../proofShared/proofUIHelpers.js';
import proofQueueState from './proofQueueStateSingleton.js';

// Module-level references set by index.js
let _moduleEventBus = null;
let _dispatcher = null;

export function setModuleEventBus(bus) { _moduleEventBus = bus; }
export function setDispatcher(dispatcher) { _dispatcher = dispatcher; }

const getEventBus = createEventBusGetter('proofQueue', () => _moduleEventBus);
const log = createLogger('proofQueueUI');

export class ProofQueueUI {
  /**
   * @param {Object} container - GoldenLayout container
   * @param {Object} componentState - GoldenLayout component state
   */
  constructor(container, componentState) {
    this.container = container;
    this.componentState = componentState;
    this.rootElement = null;
    this.unsubscribeHandles = [];
    this.isInitialized = false;

    // DOM references
    this._headerEl = null;
    this._toolbarEl = null;
    this._statusEl = null;

    // New DOM references for proof table layout
    this._provenSectionEl = null;
    this._theoremHeaderEl = null;
    this._provenBodyEl = null;
    this._qedEl = null;
    this._workingAreaEl = null;
    this._queueBodyEl = null;

    // Checkbox references
    this._cbAutoCheck = null;
    this._cbShowDetails = null;

    // Proven step ordering
    this._provenOrder = [];

    // Drag state
    this._draggedIndex = null;
    this._dragOverIndex = null;

    // Track in-flight check to prevent double-clicks
    this._checkingStep = null;

    // Difficulty settings
    this._selectDifficulty = null;
    this._difficultyDescEl = null;
    this._hypInputState = new Map();   // stepIndex → Map<depIndex, string>
    this._checkCooldownUntil = 0;
    this._checkCooldownTimer = null;

    // Click-to-assign: step index of "held" proven step
    this._selectedProvenStep = null;

    // stepIndex → proven row number map (rebuilt each render)
    this._stepToRow = new Map();

    this._createBaseUI();
    this._setupLifecycle();
  }

  getRootElement() {
    return this.rootElement;
  }

  /**
   * Whether we're displaying a graph (DepGraph) vs proof (MetaMath).
   * Uses state if loaded, falls back to static data detection.
   * @returns {boolean}
   */
  _isGraphMode() {
    if (proofQueueState?.structureType) return proofQueueState.structureType === 'graph';
    return getStructureType() === 'graph';
  }

  // ─── Step Classification ─────────────────────────────────

  /**
   * Classify a proof step label into type category.
   * @param {string} label - Step label (e.g. "ax-1cn", "df-2", "2cn")
   * @returns {{type: string, abbrev: string, cssClass: string}}
   */
  static _classifyStep(label) {
    if (label.startsWith('ax-')) {
      return { type: 'Axiom', abbrev: 'Ax', cssClass: 'pq-type-axiom' };
    }
    if (label.startsWith('df-')) {
      return { type: 'Definition', abbrev: 'Def', cssClass: 'pq-type-def' };
    }
    return { type: 'Theorem', abbrev: 'Thm', cssClass: 'pq-type-thm' };
  }

  // ─── Base UI Construction ────────────────────────────────

  _createBaseUI() {
    this.rootElement = document.createElement('div');
    this.rootElement.className = 'proof-queue-panel';

    // Header
    this._headerEl = document.createElement('div');
    this._headerEl.className = 'pq-header';
    this._headerEl.textContent = this._isGraphMode() ? 'Connection Tracker' : 'Proof Queue';
    this.rootElement.appendChild(this._headerEl);

    // Toolbar (single row)
    this._toolbarEl = document.createElement('div');
    this._toolbarEl.className = 'pq-toolbar';

    const row1 = document.createElement('div');
    row1.className = 'pq-toolbar-row';

    // Difficulty selector
    this._diffLabel = document.createElement('span');
    this._diffLabel.className = 'pq-checkbox-label';
    this._diffLabel.textContent = this._isGraphMode() ? 'Deps:' : 'Hyp:';
    row1.appendChild(this._diffLabel);

    this._selectDifficulty = document.createElement('select');
    this._selectDifficulty.className = 'pq-select-difficulty';
    for (const [val, text] of [['trivial','Trivial'],['easy','Easy'],['medium','Medium'],['hard','Hard']]) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = text;
      if (val === 'easy') opt.selected = true;
      this._selectDifficulty.appendChild(opt);
    }
    row1.appendChild(this._selectDifficulty);

    this._difficultyDescEl = document.createElement('span');
    this._difficultyDescEl.className = 'pq-difficulty-desc';
    row1.appendChild(this._difficultyDescEl);
    this._updateDifficultyDesc();

    // Show details, Auto-check, Check Next
    row1.insertAdjacentHTML('beforeend', `
      <label class="pq-checkbox-label" style="margin-left:auto"><input type="checkbox" class="pq-cb-showdetails"> Show details</label>
      <label class="pq-checkbox-label"><input type="checkbox" class="pq-cb-autocheck"> Auto-check</label>
      <button class="pq-btn pq-btn-check" title="Check the next valid step">Check Next</button>
    `);

    this._toolbarEl.appendChild(row1);

    this.rootElement.appendChild(this._toolbarEl);

    // Cache checkbox references
    this._cbAutoCheck = this._toolbarEl.querySelector('.pq-cb-autocheck');
    this._cbShowDetails = this._toolbarEl.querySelector('.pq-cb-showdetails');

    // ─── Proven Section ──────────────────────────────────
    this._provenSectionEl = document.createElement('div');
    this._provenSectionEl.className = 'pq-proven-section';
    this._provenSectionEl.style.display = 'none';

    // Section label
    this._provenLabelEl = document.createElement('div');
    this._provenLabelEl.className = 'pq-section-label';
    this._provenLabelEl.textContent = this._isGraphMode() ? 'Completed Nodes' : 'Proven Steps';
    this._provenSectionEl.appendChild(this._provenLabelEl);

    // Theorem header
    this._theoremHeaderEl = document.createElement('div');
    this._theoremHeaderEl.className = 'pq-theorem-header';
    this._provenSectionEl.appendChild(this._theoremHeaderEl);

    // Proven table
    const provenTable = document.createElement('table');
    provenTable.className = 'pq-proven-table';
    const provenThead = document.createElement('thead');
    const hypLabel = this._isGraphMode() ? 'Deps' : 'Hyp';
    provenThead.innerHTML = `<tr>
      <th class="pq-col-step">Step</th>
      <th class="pq-col-hyp">${hypLabel}</th>
      <th class="pq-col-ref">Ref</th>
      <th class="pq-col-expr">Expression</th>
      <th class="pq-col-type">Type</th>
    </tr>`;
    this._provenHypTh = provenThead.querySelector('.pq-col-hyp');
    provenTable.appendChild(provenThead);
    this._provenBodyEl = document.createElement('tbody');
    provenTable.appendChild(this._provenBodyEl);
    this._provenSectionEl.appendChild(provenTable);

    // QED
    this._qedEl = document.createElement('div');
    this._qedEl.className = 'pq-qed';
    this._qedEl.style.display = 'none';
    this._provenSectionEl.appendChild(this._qedEl);

    this.rootElement.appendChild(this._provenSectionEl);

    // ─── Working Area ────────────────────────────────────
    this._workingAreaEl = document.createElement('div');
    this._workingAreaEl.className = 'pq-working-area';

    // Queue section (table-based)
    const queueSection = document.createElement('div');
    queueSection.className = 'pq-section pq-queue-section';
    const queueLabel = document.createElement('div');
    queueLabel.className = 'pq-section-label';
    queueLabel.textContent = 'Queue';
    queueSection.appendChild(queueLabel);

    const queueTable = document.createElement('table');
    queueTable.className = 'pq-queue-table';
    const queueThead = document.createElement('thead');
    queueThead.innerHTML = `<tr>
      <th class="pq-col-step">Step</th>
      <th class="pq-col-hyp">${hypLabel}</th>
      <th class="pq-col-ref">Ref</th>
      <th class="pq-col-expr">Expression</th>
      <th class="pq-col-type">Type</th>
    </tr>`;
    this._queueHypTh = queueThead.querySelector('.pq-col-hyp');
    queueTable.appendChild(queueThead);
    this._queueBodyEl = document.createElement('tbody');
    queueTable.appendChild(this._queueBodyEl);
    queueSection.appendChild(queueTable);
    this._workingAreaEl.appendChild(queueSection);

    this.rootElement.appendChild(this._workingAreaEl);

    // Status bar
    this._statusEl = document.createElement('div');
    this._statusEl.className = 'pq-status';
    this._statusEl.textContent = 'Load a game to begin.';
    this.rootElement.appendChild(this._statusEl);

    // ─── Wire toolbar handlers ───────────────────────────
    this._toolbarEl.querySelector('.pq-btn-check').addEventListener('click', () => this._onCheckNext());
    this._cbShowDetails.addEventListener('change', () => this.render());
    this._cbAutoCheck.addEventListener('change', () => {
      if (this._cbAutoCheck.checked) this._tryAutoCheck();
    });
    this._selectDifficulty.addEventListener('change', () => {
      this._onDifficultyChanged();
      this.render();
    });

    // Show empty state
    this._showEmptyState();
  }

  _showEmptyState() {
    this._queueBodyEl.innerHTML = '';
    this._provenBodyEl.innerHTML = '';
    this._provenSectionEl.style.display = 'none';
    this._qedEl.style.display = 'none';
    this._workingAreaEl.style.display = '';
    this._toolbarEl.style.display = 'none';
    this.rootElement.classList.remove('pq-complete');
  }

  // ─── Lifecycle ────────────────────────────────────────────

  _setupLifecycle() {
    Object.defineProperty(this, 'eventBus', {
      get: () => getEventBus(),
      configurable: true,
    });

    this._attachListeners();
    this.container.on('destroy', () => this.destroy());
  }

  _attachListeners() {
    this.destroy(); // Clear old

    const subscribe = (eventName, handler) => {
      const unsub = this.eventBus.subscribe(eventName, handler.bind(this));
      this.unsubscribeHandles.push(unsub);
    };

    subscribe('stateManager:rulesLoaded', this._handleRulesLoaded);
    subscribe('stateManager:snapshotUpdated', this._handleSnapshotUpdated);
    subscribe('stateManager:inventoryChanged', this._handleInventoryChanged);
    subscribe('proofGraph:edgeDrawn', this._handleEdgeDrawn);
  }

  destroy() {
    this.unsubscribeHandles.forEach(unsub => {
      if (typeof unsub === 'function') unsub();
    });
    this.unsubscribeHandles = [];
    if (this._checkCooldownTimer) {
      clearInterval(this._checkCooldownTimer);
      this._checkCooldownTimer = null;
    }
  }

  /**
   * Wire the singleton state's callbacks to trigger UI re-renders.
   */
  _wireStateCallbacks() {
    // Keep existing onQueueChanged from index.js (which publishes events),
    // but also render. Chain them.
    const existingQueueCb = proofQueueState.onQueueChanged;
    proofQueueState.onQueueChanged = () => {
      if (existingQueueCb) existingQueueCb();
      this.render();
    };
    proofQueueState.onAvailableChanged = () => {
      // Auto-add newly available steps to the queue
      proofQueueState.autoFillQueue();
      this.render();
    };
  }

  // ─── Event Handlers ───────────────────────────────────────

  _handleRulesLoaded() {
    log('info', 'Rules loaded, checking for proof structure');

    if (!hasProofStructure()) {
      log('info', 'No graph structure — hiding queue');
      this._showEmptyState();
      this._statusEl.textContent = 'No graph structure found.';
      return;
    }

    // Force reload from new rules data (ensureStateLoaded skips if already loaded)
    proofQueueState.isLoaded = false;
    this._hypInputState.clear();
    this._selectedProvenStep = null;
    ensureStateLoaded(proofQueueState);

    if (proofQueueState && proofQueueState.isLoaded) {
      this._wireStateCallbacks();
      syncStateFromSnapshot(proofQueueState);
      proofQueueState.autoFillQueue();
      this.render();
    }
  }

  _handleSnapshotUpdated(snapshotData) {
    if (!proofQueueState?.isLoaded) return;
    syncStateFromSnapshot(proofQueueState, snapshotData);
    this._checkingStep = null; // Clear in-flight guard after snapshot sync
    this.render();
  }

  _handleInventoryChanged() {
    if (!proofQueueState?.isLoaded) return;
    syncStateFromSnapshot(proofQueueState);
    this._checkingStep = null;
    this.render();
  }

  /**
   * Handle a correct edge draw from the Proof Graph (Easy mode sync).
   * Auto-fills the corresponding hyp input in the queue.
   */
  _handleEdgeDrawn({ source, target, slot }) {
    if (this._getDifficulty() !== 'easy') return;
    if (!proofQueueState?.isLoaded) return;
    if (slot === undefined || slot === null) return;

    const step = proofQueueState.steps.get(target);
    if (!step) return;

    // Compute the correct row number for the source step
    const rowNum = this._stepToRow?.get(source);
    if (rowNum === undefined) return;

    // Initialize hyp input state if needed
    if (!this._hypInputState.has(target)) {
      this._hypInputState.set(target, new Map());
    }
    const entries = this._hypInputState.get(target);

    // Only fill if this slot isn't already correctly filled
    const currentVal = (entries.get(slot) || '').trim();
    if (currentVal === String(rowNum)) return;

    entries.set(slot, String(rowNum));
    this.render();

    // Trigger auto-check if all hyps now correct
    if (this._isHypCorrectForStep(target)) {
      if (this._cbAutoCheck && this._cbAutoCheck.checked) {
        requestAnimationFrame(() => this._tryAutoCheck());
      }
    }
  }

  // ─── Proven Order ──────────────────────────────────────────

  /**
   * Rebuild the proven step order: starting statements first (sorted by index),
   * then checked queue steps in queue order.
   */
  _updateProvenOrder() {
    this._provenOrder = [];

    const checkedSet = proofQueueState.checkedLocations;
    const queueWithStatus = proofQueueState.getQueueWithStatus();

    // Collect starting statements (checked but not in queue)
    const inQueue = new Set(proofQueueState.queue);
    const startingSteps = [];
    for (const [index, step] of proofQueueState.steps) {
      if (checkedSet.has(step.locationName) && !inQueue.has(index)) {
        startingSteps.push(index);
      }
    }
    startingSteps.sort((a, b) => a - b);
    this._provenOrder.push(...startingSteps);

    // Then checked queue steps in queue order
    for (const entry of queueWithStatus) {
      if (entry.alreadyChecked) {
        this._provenOrder.push(entry.stepIndex);
      }
    }
  }

  // ─── Formatting Helpers ────────────────────────────────────

  /**
   * Format dependencies as proven table row numbers.
   * @param {number[]} dependencies - Step indices this step depends on
   * @param {Map<number, number>} stepToRow - Map of step index → proven row number
   * @returns {string}
   */
  _formatHyp(dependencies, stepToRow) {
    if (dependencies.length === 0) return '';
    return dependencies.map(depIdx => {
      const row = stepToRow.get(depIdx);
      return row !== undefined ? String(row) : '?';
    }).join(',');
  }

  /**
   * Format dependencies for queue rows (original step indices).
   * @param {number[]} dependencies
   * @returns {string}
   */
  _formatHypForQueue(dependencies) {
    if (dependencies.length === 0) return '';
    return dependencies.map(d => String(d)).join(',');
  }

  // ─── Difficulty Helpers ──────────────────────────────────────

  _getDifficulty() {
    return this._selectDifficulty ? this._selectDifficulty.value : 'trivial';
  }

  _updateDifficultyDesc() {
    if (!this._difficultyDescEl) return;
    const isGraph = this._isGraphMode();
    const refWord = isGraph ? 'dep refs' : 'hyp refs';
    const stepWord = isGraph ? 'completed nodes' : 'proven steps';
    const descs = {
      trivial: isGraph ? 'Dep values auto-filled' : 'Hyp values auto-filled',
      easy: `Assign ${refWord} by typing or clicking ${stepWord} (default)`,
      medium: `Assign ${refWord}; all lock when node is complete`,
      hard: `Assign ${refWord}; wrong answer = 5s cooldown`,
    };
    this._difficultyDescEl.textContent = descs[this._getDifficulty()] || '';
  }

  _onDifficultyChanged() {
    this._updateDifficultyDesc();
    this._selectedProvenStep = null;
    if (this._getDifficulty() === 'trivial') {
      this._hypInputState.clear();
    }
    // Clear any active cooldown
    if (this._checkCooldownTimer) {
      clearInterval(this._checkCooldownTimer);
      this._checkCooldownTimer = null;
    }
    this._checkCooldownUntil = 0;
    const btn = this._toolbarEl.querySelector('.pq-btn-check');
    if (btn) {
      btn.classList.remove('pq-btn-cooldown');
      btn.disabled = false;
      btn.textContent = 'Check Next';
    }
  }

  _onProvenRowClick(stepIndex) {
    this._selectedProvenStep = (this._selectedProvenStep === stepIndex) ? null : stepIndex;
    this.render();
  }

  /**
   * True if all hyp entries for a step match the correct dep indices.
   * Vacuously true for steps with no dependencies.
   */
  _isHypCorrectForStep(stepIndex) {
    const step = proofQueueState.steps.get(stepIndex);
    if (!step || step.dependencies.length === 0) return true;
    const entries = this._hypInputState.get(stepIndex);
    if (!entries) return false;
    for (let i = 0; i < step.dependencies.length; i++) {
      if (!this._isHypEntryCorrect(stepIndex, i)) return false;
    }
    return true;
  }

  _isHypEntryCorrect(stepIndex, depIndex) {
    const step = proofQueueState.steps.get(stepIndex);
    if (!step) return false;
    const entries = this._hypInputState.get(stepIndex);
    if (!entries) return false;
    const val = (entries.get(depIndex) || '').trim();
    const depStepIndex = step.dependencies[depIndex];
    const rowNum = this._stepToRow?.get(depStepIndex);
    if (rowNum === undefined) return false;
    return val === String(rowNum);
  }

  /**
   * Render the Hyp cell content based on current difficulty.
   */
  _renderHypCell(tdHyp, step) {
    const diff = this._getDifficulty();

    if (step.dependencies.length === 0) return;

    if (diff === 'trivial') {
      tdHyp.textContent = this._formatHyp(step.dependencies, this._stepToRow);
      return;
    }

    // Ensure _hypInputState has entries for this step
    if (!this._hypInputState.has(step.index)) {
      this._hypInputState.set(step.index, new Map());
    }
    const entries = this._hypInputState.get(step.index);
    for (let i = 0; i < step.dependencies.length; i++) {
      if (!entries.has(i)) entries.set(i, '');
    }

    const allCorrect = this._isHypCorrectForStep(step.index);

    for (let i = 0; i < step.dependencies.length; i++) {
      if (i > 0) {
        const comma = document.createElement('span');
        comma.className = 'pq-hyp-comma';
        comma.textContent = ',';
        tdHyp.appendChild(comma);
      }

      const correct = this._isHypEntryCorrect(step.index, i);

      // Determine if this entry should be locked (shown as plain text)
      let locked = false;
      if (diff === 'easy' && correct) locked = true;
      if (diff === 'medium' && allCorrect) locked = true;
      // hard: never locked in queue (stays as input until checked/proven)

      if (locked) {
        const span = document.createElement('span');
        span.className = 'pq-hyp-locked';
        span.textContent = String(this._stepToRow.get(step.dependencies[i]) ?? step.dependencies[i]);
        tdHyp.appendChild(span);
      } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'pq-hyp-input';
        input.size = 3;
        input.maxLength = 4;
        input.dataset.stepIndex = step.index;
        input.dataset.depIndex = i;
        input.value = entries.get(i) || '';
        input.addEventListener('input', (e) => {
          this._onHypInput(step.index, i, e.target.value);
        });
        input.addEventListener('focus', () => {
          if (this._selectedProvenStep !== null) {
            const rowNum = this._stepToRow?.get(this._selectedProvenStep);
            const val = String(rowNum ?? this._selectedProvenStep);
            input.value = val;
            this._onHypInput(step.index, i, val);
            this._selectedProvenStep = null;
            this.rootElement.classList.remove('pq-has-selection');
          }
        });
        tdHyp.appendChild(input);
      }
    }
  }

  _onHypInput(stepIndex, depIndex, value) {
    if (!this._hypInputState.has(stepIndex)) {
      this._hypInputState.set(stepIndex, new Map());
    }
    this._hypInputState.get(stepIndex).set(depIndex, value);

    const diff = this._getDifficulty();
    if (diff === 'easy' && this._isHypEntryCorrect(stepIndex, depIndex)) {
      // Publish hyp assignment for cross-panel sync
      const step = proofQueueState.steps.get(stepIndex);
      if (step && this.eventBus) {
        const sourceStepIndex = step.dependencies[depIndex];
        this.eventBus.publish('proofQueue:hypAssigned', {
          source: sourceStepIndex,
          target: stepIndex,
          slot: depIndex,
        });
      }
      this.render();
    } else if (diff === 'medium' && this._isHypCorrectForStep(stepIndex)) {
      this.render();
    }
    // For easy/medium: also trigger auto-check if all hyps now correct
    if (diff !== 'hard' && this._isHypCorrectForStep(stepIndex)) {
      if (this._cbAutoCheck && this._cbAutoCheck.checked) {
        requestAnimationFrame(() => this._tryAutoCheck());
      }
    }
  }

  _activateCheckCooldown() {
    this._checkCooldownUntil = Date.now() + 5000;
    const btn = this._toolbarEl.querySelector('.pq-btn-check');
    if (!btn) return;

    btn.disabled = true;
    btn.classList.add('pq-btn-cooldown');

    // Flash incorrect inputs
    this._queueBodyEl.querySelectorAll('.pq-hyp-input').forEach(input => {
      const si = Number(input.dataset.stepIndex);
      const di = Number(input.dataset.depIndex);
      if (!this._isHypEntryCorrect(si, di)) {
        input.classList.add('pq-hyp-incorrect');
        setTimeout(() => input.classList.remove('pq-hyp-incorrect'), 1000);
      }
    });

    const update = () => {
      const remaining = Math.max(0, this._checkCooldownUntil - Date.now());
      if (remaining <= 0) {
        clearInterval(this._checkCooldownTimer);
        this._checkCooldownTimer = null;
        btn.disabled = false;
        btn.classList.remove('pq-btn-cooldown');
        btn.textContent = 'Check Next';
        return;
      }
      btn.textContent = `Check Next (${Math.ceil(remaining / 1000)}s)`;
    };
    update();
    this._checkCooldownTimer = setInterval(update, 250);
  }

  // ─── Rendering ────────────────────────────────────────────

  render() {
    if (!proofQueueState?.isLoaded) {
      this._showEmptyState();
      return;
    }

    // Show toolbar
    this._toolbarEl.style.display = '';

    // Update header
    const isGraph = this._isGraphMode();
    if (proofQueueState.theoremName) {
      this._headerEl.textContent = isGraph
        ? `Connection Tracker: ${proofQueueState.theoremName}`
        : `Proof Queue: ${proofQueueState.theoremName}`;
    } else {
      this._headerEl.textContent = isGraph ? 'Connection Tracker' : 'Proof Queue';
    }

    // Rebuild proven order
    this._updateProvenOrder();

    // Render proven table
    this._renderProvenTable();

    const complete = proofQueueState.isProofComplete();

    if (complete) {
      // Hide working area, show only proven table + QED
      this._workingAreaEl.style.display = 'none';
      this.rootElement.classList.add('pq-complete');
    } else {
      // Show working area
      this._workingAreaEl.style.display = '';
      this.rootElement.classList.remove('pq-complete');
      this._renderQueue();
    }

    this._renderStatus();

    // Toggle selection class for CSS pulse animation
    this.rootElement.classList.toggle('pq-has-selection', this._selectedProvenStep !== null);

    // Auto-check cascade
    if (this._cbAutoCheck && this._cbAutoCheck.checked) {
      requestAnimationFrame(() => this._tryAutoCheck());
    }
  }

  _renderProvenTable() {
    this._provenBodyEl.innerHTML = '';

    if (this._provenOrder.length === 0) {
      this._provenSectionEl.style.display = 'none';
      this._qedEl.style.display = 'none';
      return;
    }

    this._provenSectionEl.style.display = '';

    const isGraph = this._isGraphMode();

    // Update labels based on mode
    if (this._provenLabelEl) {
      this._provenLabelEl.textContent = isGraph ? 'Completed Nodes' : 'Proven Steps';
    }
    const hypLabel = isGraph ? 'Deps' : 'Hyp';
    if (this._provenHypTh) this._provenHypTh.textContent = hypLabel;
    if (this._queueHypTh) this._queueHypTh.textContent = hypLabel;
    if (this._diffLabel) this._diffLabel.textContent = isGraph ? 'Deps:' : 'Hyp:';

    // Show theorem/title header (prefer instantiated expression for concrete values)
    const goalStep = proofQueueState.steps.get(proofQueueState.goalStepIndex);
    if (goalStep) {
      const name = proofQueueState.theoremName || goalStep.label;
      const goalExpr = goalStep.instantiatedExpression || goalStep.expression;
      this._theoremHeaderEl.innerHTML = '';
      if (isGraph) {
        // Graph mode: plain title without "Theorem" prefix or link
        this._theoremHeaderEl.appendChild(document.createTextNode(`${name}: ${goalExpr}`));
      } else {
        // Proof mode: "Theorem" prefix with MetaMath link
        this._theoremHeaderEl.appendChild(document.createTextNode('Theorem '));
        const link = document.createElement('a');
        link.className = 'pq-ref-link';
        link.href = `https://us.metamath.org/mpeuni/${name}.html`;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = name;
        this._theoremHeaderEl.appendChild(link);
        this._theoremHeaderEl.appendChild(document.createTextNode(`: ${goalExpr}`));
      }
    }

    // Build stepIndex → row number map (shared with queue rendering)
    this._stepToRow = new Map();
    for (let i = 0; i < this._provenOrder.length; i++) {
      this._stepToRow.set(this._provenOrder[i], i + 1);
    }

    const showDetails = this._cbShowDetails && this._cbShowDetails.checked;
    const isComplete = proofQueueState.isProofComplete();
    const diff = this._getDifficulty();
    const isNonTrivial = diff !== 'trivial';

    for (let i = 0; i < this._provenOrder.length; i++) {
      const stepIndex = this._provenOrder[i];
      const step = proofQueueState.steps.get(stepIndex);
      if (!step) continue;

      const tr = document.createElement('tr');
      tr.className = 'pq-proven-row';

      // Highlight the goal step
      if (stepIndex === proofQueueState.goalStepIndex) {
        tr.classList.add('pq-proven-goal');
      }

      // Click-to-assign: selectable rows in non-trivial modes
      if (isNonTrivial) {
        tr.classList.add('pq-proven-selectable');
        if (stepIndex === this._selectedProvenStep) {
          tr.classList.add('pq-proven-selected');
        }
        tr.addEventListener('click', () => this._onProvenRowClick(stepIndex));
      }

      const classification = ProofQueueUI._classifyStep(step.label);

      // Step column
      const tdStep = document.createElement('td');
      tdStep.className = 'pq-col-step';
      tdStep.textContent = String(i + 1);
      tr.appendChild(tdStep);

      // Hyp column
      const tdHyp = document.createElement('td');
      tdHyp.className = 'pq-col-hyp';
      tdHyp.textContent = this._formatHyp(step.dependencies, this._stepToRow);
      tr.appendChild(tdHyp);

      // Ref column (linked for proof mode, plain text for graph mode)
      const tdRef = document.createElement('td');
      tdRef.className = 'pq-col-ref';
      if (isGraph) {
        tdRef.textContent = step.label;
      } else {
        const refLink = document.createElement('a');
        refLink.className = 'pq-ref-link';
        refLink.href = `https://us.metamath.org/mpeuni/${step.label}.html`;
        refLink.target = '_blank';
        refLink.rel = 'noopener';
        refLink.textContent = step.label;
        tdRef.appendChild(refLink);
      }
      tr.appendChild(tdRef);

      // Expression column (prefer instantiated expression for concrete values)
      const tdExpr = document.createElement('td');
      tdExpr.className = 'pq-col-expr';
      tdExpr.textContent = step.instantiatedExpression || step.expression;
      if (showDetails) {
        tdExpr.style.whiteSpace = 'normal';
        // Show non-instantiated expression when it differs from instantiated
        if (step.instantiatedExpression && step.expression !== step.instantiatedExpression) {
          const generic = document.createElement('div');
          generic.className = 'pq-generic-expr';
          generic.textContent = step.expression;
          tdExpr.appendChild(generic);
        }
        if (step.fullText) {
          const detail = document.createElement('div');
          detail.className = 'pq-detail-text';
          detail.textContent = step.fullText;
          tdExpr.appendChild(detail);
        }
      }
      tr.appendChild(tdExpr);

      // Type column (hidden in graph mode)
      const tdType = document.createElement('td');
      tdType.className = 'pq-col-type';
      if (isGraph) {
        tdType.textContent = 'Node';
      } else {
        const badge = document.createElement('span');
        badge.className = `pq-type-badge ${classification.cssClass}`;
        badge.textContent = classification.abbrev;
        badge.title = classification.type;
        tdType.appendChild(badge);
      }
      tr.appendChild(tdType);

      this._provenBodyEl.appendChild(tr);
    }

    // Show/hide completion marker
    if (isComplete) {
      this._qedEl.innerHTML = '';
      if (isGraph) {
        // Graph mode: simple completion text
        this._qedEl.appendChild(document.createTextNode('Complete'));
      } else {
        // Proof mode: Q.E.D. with theorem link
        this._qedEl.appendChild(document.createTextNode('Q.E.D.'));
        const name = proofQueueState.theoremName;
        if (name) {
          const sep = document.createTextNode(' \u2014 ');
          const link = document.createElement('a');
          link.className = 'pq-ref-link';
          link.href = `https://us.metamath.org/mpeuni/${name}.html`;
          link.target = '_blank';
          link.rel = 'noopener';
          link.textContent = name;
          this._qedEl.appendChild(sep);
          this._qedEl.appendChild(link);
        }
      }
      this._qedEl.style.display = '';
    } else {
      this._qedEl.style.display = 'none';
    }
  }

  _renderQueue() {
    // Focus preservation: capture focused hyp input before clearing
    let focusInfo = null;
    const focused = this._queueBodyEl.querySelector('.pq-hyp-input:focus');
    if (focused) {
      focusInfo = {
        stepIndex: focused.dataset.stepIndex,
        depIndex: focused.dataset.depIndex,
        selStart: focused.selectionStart,
        selEnd: focused.selectionEnd,
      };
    }

    this._queueBodyEl.innerHTML = '';

    const queueWithStatus = proofQueueState.getQueueWithStatus();
    // Only show unchecked entries
    const unchecked = [];
    for (let i = 0; i < queueWithStatus.length; i++) {
      const entry = queueWithStatus[i];
      if (!entry.alreadyChecked) {
        unchecked.push({ ...entry, originalIndex: i });
      }
    }

    if (unchecked.length === 0) {
      // Show empty in a row spanning all columns
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.className = 'pq-empty';
      td.textContent = 'Click steps above to add them to the queue';
      tr.appendChild(td);
      this._queueBodyEl.appendChild(tr);
      return;
    }

    const showDetails = this._cbShowDetails && this._cbShowDetails.checked;
    const isGraph = this._isGraphMode();

    for (const entry of unchecked) {
      const { step, valid, checkable, missingDeps, originalIndex } = entry;
      if (!step) continue;

      const tr = document.createElement('tr');
      tr.className = 'pq-queue-row';
      tr.dataset.queueIndex = originalIndex;
      tr.dataset.stepIndex = step.index;

      // Status classes (non-trivial: also require correct hyps for checkable)
      const diff = this._getDifficulty();
      const hypReady = diff === 'trivial' || step.dependencies.length === 0 || this._isHypCorrectForStep(step.index);
      if (checkable && hypReady) {
        tr.classList.add('pq-checkable');
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', () => this._checkQueueStep(step.index));
      } else if (!valid) {
        tr.classList.add('pq-invalid');
      } else {
        tr.classList.add('pq-valid');
      }

      // Drag
      tr.draggable = true;
      tr.addEventListener('dragstart', (e) => this._onDragStart(e, originalIndex));
      tr.addEventListener('dragend', (e) => this._onDragEnd(e));
      tr.addEventListener('dragover', (e) => this._onDragOver(e, originalIndex));
      tr.addEventListener('drop', (e) => this._onDrop(e, originalIndex));

      const classification = ProofQueueUI._classifyStep(step.label);

      // Step column (empty — row number assigned when proven)
      const tdStep = document.createElement('td');
      tdStep.className = 'pq-col-step';
      tr.appendChild(tdStep);

      // Hyp column (difficulty-aware)
      const tdHyp = document.createElement('td');
      tdHyp.className = 'pq-col-hyp';
      this._renderHypCell(tdHyp, step);
      tr.appendChild(tdHyp);

      // Ref column (linked for proof mode, plain text for graph mode)
      const tdRef = document.createElement('td');
      tdRef.className = 'pq-col-ref';
      if (isGraph) {
        tdRef.textContent = step.label;
      } else {
        const refLink = document.createElement('a');
        refLink.className = 'pq-ref-link';
        refLink.href = `https://us.metamath.org/mpeuni/${step.label}.html`;
        refLink.target = '_blank';
        refLink.rel = 'noopener';
        refLink.textContent = step.label;
        tdRef.appendChild(refLink);
      }
      tr.appendChild(tdRef);

      // Expression column (generic in working area)
      const tdExpr = document.createElement('td');
      tdExpr.className = 'pq-col-expr';
      tdExpr.textContent = step.expression;
      if (showDetails && step.fullText) {
        const detail = document.createElement('div');
        detail.className = 'pq-detail-text';
        detail.textContent = step.fullText;
        tdExpr.appendChild(detail);
        tdExpr.style.whiteSpace = 'normal';
      }
      // Missing deps hint inside expression cell
      if (!valid && missingDeps.length > 0) {
        const depInfo = document.createElement('div');
        depInfo.className = 'pq-row-deps';
        depInfo.textContent = 'Needs: ' + missingDeps.map(d => proofQueueState.steps.get(d)?.label || `#${d}`).join(', ');
        tdExpr.appendChild(depInfo);
      }
      tr.appendChild(tdExpr);

      // Type column (hidden in graph mode)
      const tdType = document.createElement('td');
      tdType.className = 'pq-col-type';
      if (isGraph) {
        tdType.textContent = 'Node';
      } else {
        const badge = document.createElement('span');
        badge.className = `pq-type-badge ${classification.cssClass}`;
        badge.textContent = classification.abbrev;
        badge.title = classification.type;
        tdType.appendChild(badge);
      }
      tr.appendChild(tdType);

      this._queueBodyEl.appendChild(tr);
    }

    // Restore focus to hyp input if it was focused before re-render
    if (focusInfo) {
      const sel = `.pq-hyp-input[data-step-index="${focusInfo.stepIndex}"][data-dep-index="${focusInfo.depIndex}"]`;
      const el = this._queueBodyEl.querySelector(sel);
      if (el) {
        el.focus();
        try { el.setSelectionRange(focusInfo.selStart, focusInfo.selEnd); } catch (_) {}
      }
    }
  }

  _renderStatus() {
    if (!proofQueueState) return;

    const isGraph = this._isGraphMode();

    if (proofQueueState.isProofComplete()) {
      this._statusEl.textContent = isGraph ? 'Solution complete!' : 'Proof complete!';
      this._statusEl.className = 'pq-status pq-status-complete';
      return;
    }

    const total = proofQueueState.steps.size;
    const proved = this._provenOrder.length;

    // Count only unchecked queue entries
    const queueWithStatus = proofQueueState.getQueueWithStatus();
    const inQueue = queueWithStatus.filter(e => !e.alreadyChecked).length;

    const verb = isGraph ? 'completed' : 'proved';
    this._statusEl.textContent = `${proved}/${total} ${verb} | ${inQueue} in queue`;
    this._statusEl.className = 'pq-status';
  }

  // ─── Auto Check ────────────────────────────────────────────

  /**
   * If auto-check is enabled and no check is in-flight, check the next step.
   * Deferred via requestAnimationFrame to avoid blocking renders.
   * The cascade works: check completes → snapshot update → render() → auto-check again.
   */
  _tryAutoCheck() {
    if (!this._cbAutoCheck || !this._cbAutoCheck.checked) return;
    if (this._checkCooldownUntil > Date.now()) return;
    if (this._checkingStep !== null) return;
    if (!proofQueueState || !_dispatcher) return;
    if (proofQueueState.isProofComplete()) return;

    const nextStep = proofQueueState.getNextCheckableStep();
    if (nextStep === null) return;

    const step = proofQueueState.steps.get(nextStep);
    if (!step) return;

    // Hyp validation gate — silently wait until hyps are correct
    const diff = this._getDifficulty();
    if (diff !== 'trivial' && step.dependencies.length > 0) {
      if (!this._isHypCorrectForStep(nextStep)) return;
    }

    this._checkingStep = nextStep;

    dispatchLocationCheck(step, proofQueueState, _dispatcher, 'ProofQueueCheck', log, () => {
      this._checkingStep = null;
      this.render();
    });
  }

  // ─── Drag and Drop ────────────────────────────────────────

  _onDragStart(e, queueIndex) {
    this._draggedIndex = queueIndex;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(queueIndex));
    // Add visual feedback after a tick
    requestAnimationFrame(() => {
      const row = this._queueBodyEl.querySelector(`tr[data-queue-index="${queueIndex}"]`);
      if (row) row.classList.add('pq-dragging');
    });
  }

  _onDragEnd(e) {
    this._draggedIndex = null;
    this._dragOverIndex = null;
    // Remove all drag styling
    this._queueBodyEl.querySelectorAll('.pq-dragging, .pq-drag-over').forEach(el => {
      el.classList.remove('pq-dragging', 'pq-drag-over');
    });
  }

  _onDragOver(e, queueIndex) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (this._dragOverIndex !== queueIndex) {
      // Remove old highlight
      this._queueBodyEl.querySelectorAll('.pq-drag-over').forEach(el => {
        el.classList.remove('pq-drag-over');
      });
      this._dragOverIndex = queueIndex;
      const row = this._queueBodyEl.querySelector(`tr[data-queue-index="${queueIndex}"]`);
      if (row) row.classList.add('pq-drag-over');
    }
  }

  _onDrop(e, toIndex) {
    e.preventDefault();
    const fromIndex = this._draggedIndex;
    if (fromIndex === null || fromIndex === toIndex) return;
    proofQueueState.moveInQueue(fromIndex, toIndex);
  }

  // ─── Toolbar Actions ──────────────────────────────────────

  _onCheckNext() {
    if (!proofQueueState || !_dispatcher) return;

    // Cooldown gate (hard mode)
    if (this._checkCooldownUntil > Date.now()) return;

    // Prevent double-clicks while a check is in-flight
    if (this._checkingStep !== null) {
      log('info', 'Check already in progress, ignoring');
      return;
    }

    const nextStep = proofQueueState.getNextCheckableStep();
    if (nextStep === null) {
      log('info', 'No checkable step available');
      return;
    }

    const step = proofQueueState.steps.get(nextStep);
    if (!step) return;

    // Hyp validation gate (non-trivial difficulties)
    const diff = this._getDifficulty();
    if (diff !== 'trivial' && step.dependencies.length > 0) {
      if (!this._isHypCorrectForStep(nextStep)) {
        if (diff === 'hard') this._activateCheckCooldown();
        return;
      }
    }

    // Mark step as in-flight; cleared when snapshot sync updates checked locations
    this._checkingStep = nextStep;

    dispatchLocationCheck(step, proofQueueState, _dispatcher, 'ProofQueueCheck', log, () => {
      this._checkingStep = null;
      this.render();
    });
  }

  _checkQueueStep(stepIndex) {
    if (!proofQueueState || !_dispatcher) return;
    if (this._checkingStep !== null) return;

    const step = proofQueueState.steps.get(stepIndex);
    if (!step) return;

    this._checkingStep = stepIndex;

    dispatchLocationCheck(step, proofQueueState, _dispatcher, 'ProofQueueCheck', log, () => {
      this._checkingStep = null;
      this.render();
    });
  }
}
