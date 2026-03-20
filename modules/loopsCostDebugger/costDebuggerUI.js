/**
 * Cost Debugger Panel UI
 *
 * GoldenLayout panel component that displays step-by-step
 * cost generation reasoning. Each step = one action queue (one loop).
 */

import { getCostPlanner, getModuleEventBus, getSphereLog } from './index.js';
import stateManagerProxySingleton from '../stateManager/stateManagerProxySingleton.js';
import { centralRegistry } from '../../app/core/centralRegistry.js';

function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('loopsCostDebuggerUI', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[loopsCostDebuggerUI] ${message}`, ...data);
  }
}

/**
 * CostDebuggerUI - GoldenLayout panel component
 */
export class CostDebuggerUI {
  constructor(container, componentState) {
    this.container = container;
    this.componentState = componentState;
    Object.defineProperty(this, 'eventBus', {
      get: () => getModuleEventBus(),
      configurable: true,
    });

    this.selectedStepIndex = -1;
    this.subscriptions = [];
    this.isVerifying = false;
    this.verificationResults = [];
    this._verifyCancelled = false;

    this.rootElement = this._createRootElement();
    this.container.element.appendChild(this.rootElement);

    this._subscribeToEvents();

    this.container.on('destroy', () => this._onDestroy());

    log('info', 'CostDebuggerUI initialized');
  }

  getRootElement() {
    return this.rootElement;
  }

  // =========================================================================
  // DOM Creation
  // =========================================================================

  _createRootElement() {
    const el = document.createElement('div');
    el.className = 'cost-debugger-panel';

    el.innerHTML = `
      <div class="cd-controls">
        <button class="cd-btn-load" title="Load sphere log data">Load</button>
        <button class="cd-btn-verify" title="Verify loaded cost data against sphere log">Verify</button>
        <button class="cd-btn-plan-step" disabled title="Plan next action queue">Plan Step</button>
        <button class="cd-btn-plan-sphere" disabled title="Plan remaining steps for current sphere entry">Plan Sphere</button>
        <button class="cd-btn-plan-all" disabled title="Plan all remaining steps">Plan All</button>
        <button class="cd-btn-reset" disabled title="Reset to initial state">Reset</button>
      </div>
      <div class="cd-status-bar"><span class="cd-status">No sphere log loaded</span></div>
      <div class="cd-step-list-container">
        <div class="cd-step-list">
          <div class="cd-step-list-empty">Click "Load" to load sphere log data, then "Plan Step" to begin.</div>
        </div>
      </div>
      <div class="cd-resize-handle"></div>
      <div class="cd-detail-container" style="height: 250px;">
        <div class="cd-detail-empty">Select a step to view details</div>
      </div>
      <div class="cd-summary">
        <span class="cd-summary-item">
          <span class="cd-summary-label">Loops:</span>
          <span class="cd-summary-value cd-summary-steps">0</span>
        </span>
        <span class="cd-summary-item">
          <span class="cd-summary-label">Entries:</span>
          <span class="cd-summary-value cd-summary-entries">0 / 0</span>
        </span>
        <span class="cd-summary-item">
          <span class="cd-summary-label">Regions:</span>
          <span class="cd-summary-value cd-summary-regions">0</span>
        </span>
        <span class="cd-summary-item">
          <span class="cd-summary-label">Locations:</span>
          <span class="cd-summary-value cd-summary-locations">0</span>
        </span>
      </div>
    `;

    this._attachControlListeners(el);
    this._attachResizeHandle(el);

    return el;
  }

  _attachControlListeners(el) {
    el.querySelector('.cd-btn-load').addEventListener('click', () => this._handleLoad());
    el.querySelector('.cd-btn-verify').addEventListener('click', () => this._handleVerify());
    el.querySelector('.cd-btn-plan-step').addEventListener('click', () => this._handlePlanStep());
    el.querySelector('.cd-btn-plan-sphere').addEventListener('click', () => this._handlePlanSphere());
    el.querySelector('.cd-btn-plan-all').addEventListener('click', () => this._handlePlanAll());
    el.querySelector('.cd-btn-reset').addEventListener('click', () => this._handleReset());
  }

  _attachResizeHandle(el) {
    const handle = el.querySelector('.cd-resize-handle');
    const detailContainer = el.querySelector('.cd-detail-container');
    let startY = 0;
    let startHeight = 0;

    const onMouseMove = (e) => {
      const delta = startY - e.clientY;
      detailContainer.style.height = Math.max(100, startHeight + delta) + 'px';
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    handle.addEventListener('mousedown', (e) => {
      startY = e.clientY;
      startHeight = detailContainer.offsetHeight;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    });
  }

  // =========================================================================
  // Event Subscriptions
  // =========================================================================

  _subscribeToEvents() {
    const subscribe = (eventName, handler) => {
      const unsub = this.eventBus.subscribe(eventName, handler.bind(this));
      this.subscriptions.push(unsub);
    };

    subscribe('loopsCostDebugger:stepPlanned', this._handleStepPlannedEvent);
    subscribe('loopsCostDebugger:allPlanned', this._handleAllPlannedEvent);
    subscribe('loopsCostDebugger:reset', this._handleResetEvent);
  }

  _handleStepPlannedEvent(data) {
    this.selectedStepIndex = data.stepIndex;
    this._refreshStepList();
    this._updateSummary();
    this._updateStatus();
    this._updateButtons();
    this._refreshDetailView();
    this._scrollToStep(data.stepIndex);
  }

  _handleAllPlannedEvent() {
    this._refreshStepList();
    this._updateSummary();
    this._updateStatus();
    this._updateButtons();
  }

  _handleResetEvent() {
    this.selectedStepIndex = -1;
    this._refreshStepList();
    this._refreshDetailView();
    this._updateSummary();
    this._updateStatus();
    this._updateButtons();
  }

  // =========================================================================
  // Button Handlers
  // =========================================================================

  _handleLoad() {
    const planner = getCostPlanner();
    if (!planner) {
      log('warn', 'CostPlanner not available');
      return;
    }

    const sphereLog = getSphereLog();
    if (!sphereLog || sphereLog.length === 0) {
      this._setStatus('No sphere log available. Load a game with sphere data first.');
      return;
    }

    const result = planner.loadSphereLog(sphereLog);
    log('info', `Loaded sphere log: ${result.entryCount} entries, start region: ${result.startRegion}`);

    this.verificationResults = [];
    this.selectedStepIndex = -1;
    this._refreshStepList();
    this._refreshDetailView();
    this._updateSummary();
    this._updateStatus();
    this._updateButtons();
  }

  async _handleVerify() {
    const planner = getCostPlanner();
    if (!planner) {
      log('warn', 'CostPlanner not available');
      return;
    }

    const steps = planner.getPlannedSteps();
    if (steps.length === 0) {
      this._setStatus('No steps planned. Click Load, then Plan All first.');
      return;
    }

    // Get game APIs via centralRegistry
    const getLoopState = window.centralRegistry?.getPublicFunction?.('loops', 'getLoopState');
    const getPlayerState = window.centralRegistry?.getPublicFunction?.('playerState', 'getState');
    const loopState = getLoopState?.();
    const playerState = getPlayerState?.();

    if (!loopState || !playerState) {
      this._setStatus('Game APIs not available. Ensure loops and playerState modules are loaded.');
      return;
    }

    // Initialize verification state
    this.isVerifying = true;
    this.verificationResults = [];
    this._verifyCancelled = false;
    this._updateButtons();

    // Save current settings to restore after verification
    const savedInstantMode = loopState.instantMode;
    const savedNoManaReset = loopState.noManaDepletionReset;
    const savedAutoRestart = loopState.autoRestartQueue;

    try {
      // Reset game state for a fresh playthrough
      loopState.resetForNewRules();
      playerState.reset();

      // Get start region
      const startRegion = playerState.getCurrentRegion();

      // Configure loopState for verification
      loopState.setAutoRestartQueue(false);
      loopState.setInstantMode(true);
      loopState.setNoManaDepletionReset(true);

      // Get cross-player item grant for multiworld support.
      // In multiworld, checkLocation skips items belonging to other players.
      // We grant those items before checking locations that require them.
      const grantItemsUpToSphere = centralRegistry.getPublicFunction('sphereState', 'grantItemsUpToSphere');
      let lastGrantedSphere = null;

      // Filter to executable steps (skip DEFAULTS)
      const executableSteps = steps.filter(s => s.phase !== 'DEFAULTS');

      for (let i = 0; i < executableSteps.length; i++) {
        if (this._verifyCancelled) break;

        const step = executableSteps[i];

        // Grant cross-player items for all spheres up to this step's sphere.
        if (grantItemsUpToSphere && step.sphereIndex !== lastGrantedSphere) {
          const result = await grantItemsUpToSphere(step.sphereIndex);
          if (result.grantedCount > 0) {
            log('info', `[Verify] Granted ${result.grantedCount} cross-player items up to sphere ${step.sphereIndex}`);
            // Let the snapshot cascade settle before proceeding
            await new Promise(r => setTimeout(r, 50));
          }
          lastGrantedSphere = step.sphereIndex;
        }
        const label = step.phase === 'EXPLORE' ? step.targetRegion : step.locationName;
        this._setStatus(`Verifying ${i + 1}/${executableSteps.length}: ${step.phase} ${label || ''}`);

        // Record XP state before
        const xpBefore = new Map();
        for (const [region, data] of loopState.regionXP) {
          xpBefore.set(region, { ...data });
        }

        // Reset mana for this loop (simulate loop reset between steps)
        loopState.currentMana = loopState.maxMana;
        loopState.manaDebt = 0;
        loopState.resetManaDebt();
        const manaAtStart = loopState.currentMana;
        const maxManaAtStart = loopState.maxMana;

        // Execute queue actions directly, awaiting each checkLocation to avoid
        // flooding the worker. loopState.startProcessing() fires all actions in
        // one frame (instant mode), which overwhelms the worker command queue.
        await this._executeStepDirect(loopState, step.queue);

        // Record state after
        const manaAfter = loopState.currentMana;
        const maxManaAfter = loopState.maxMana;
        const actualManaConsumed = manaAtStart - manaAfter + loopState.manaDebt;

        // Calculate XP gained (use totalXP to account for level-up resets)
        const xpGained = {};
        for (const [region, afterData] of loopState.regionXP) {
          const beforeData = xpBefore.get(region);
          const xpDelta = totalXP(afterData) - totalXP(beforeData);
          if (xpDelta > 0) xpGained[region] = xpDelta;
        }

        // Store result
        this.verificationResults.push({
          stepIndex: step.stepIndex,
          phase: step.phase,
          completed: true,
          actual: {
            manaAtStart,
            maxManaAtStart,
            manaConsumed: actualManaConsumed,
            manaRemaining: manaAfter,
            maxManaAfter,
            manaDebt: loopState.manaDebt,
            xpGained,
          },
          predicted: {
            manaConsumed: step.simulatedResults.manaConsumed,
            manaRemaining: step.simulatedResults.manaRemaining,
            maxMana: step.stateAfter.maxMana,
          },
        });

        // Update UI after each step
        this.selectedStepIndex = step.stepIndex;
        this._refreshStepList();
        this._refreshDetailView();
        this._updateSummary();

        // Yield to browser to allow UI updates
        await new Promise(r => setTimeout(r, 0));
      }

      // Final status
      const tolerance = 5;
      const matched = this.verificationResults.filter(r =>
        Math.abs(r.actual.manaConsumed - r.predicted.manaConsumed) <= tolerance
      ).length;
      this._setStatus(`Verification complete: ${executableSteps.length} steps, ${matched}/${this.verificationResults.length} within tolerance`);

    } catch (error) {
      console.error('[CostDebuggerUI] Verification error:', error);
      this._setStatus(`Verification error: ${error.message}`);
    } finally {
      // Restore loopState settings
      loopState.setInstantMode(savedInstantMode);
      loopState.setNoManaDepletionReset(savedNoManaReset);
      loopState.setAutoRestartQueue(savedAutoRestart);
      loopState.manaDebt = 0;

      this.isVerifying = false;
      this._updateButtons();
      this._updateSummary();
    }
  }

  _handlePlanStep() {
    const planner = getCostPlanner();
    if (!planner || !planner.isLoaded() || planner.isComplete()) return;
    planner.planNextStep();
  }

  _handlePlanSphere() {
    const planner = getCostPlanner();
    if (!planner || !planner.isLoaded() || planner.isComplete()) return;
    planner.planCurrentSphere();
  }

  _handlePlanAll() {
    const planner = getCostPlanner();
    if (!planner || !planner.isLoaded() || planner.isComplete()) return;
    planner.planAll();
  }

  _handleReset() {
    const planner = getCostPlanner();
    if (!planner || !planner.isLoaded()) return;
    planner.reset();
    this.verificationResults = [];
  }

  /**
   * Convert a CostPlanner step queue to playerState path format
   */
  _convertQueueToPath(stepQueue) {
    const path = [];
    const instanceCounts = new Map();

    for (const action of stepQueue) {
      if (action.type === 'move') {
        const instNum = (instanceCounts.get(action.to) || 0) + 1;
        instanceCounts.set(action.to, instNum);
        path.push({
          type: 'regionMove',
          sourceRegion: action.from,
          destinationRegion: action.to,
          exitUsed: action.exitUsed || null,
          instanceNumber: instNum,
        });
      } else if (action.type === 'explore') {
        const instNum = instanceCounts.get(action.region) || 1;
        path.push({
          type: 'customAction',
          actionName: 'explore',
          params: {},
          sourceRegion: action.region,
          instanceNumber: instNum,
        });
      } else if (action.type === 'locationCheck') {
        const instNum = instanceCounts.get(action.region) || 1;
        path.push({
          type: 'locationCheck',
          locationName: action.location,
          sourceRegion: action.region,
          instanceNumber: instNum,
        });
      }
    }

    return path;
  }

  /**
   * Execute a queue through the real game engine and wait for completion
   */
  _executeQueue(loopState) {
    return new Promise((resolve, reject) => {
      const queue = loopState.getActionQueue();
      if (queue.length === 0) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        unsub();
        reject(new Error('Queue execution timed out after 30s'));
      }, 30000);

      const unsub = this.eventBus.subscribe('loopState:queueCompleted', () => {
        clearTimeout(timeout);
        unsub();
        resolve();
      });

      loopState.startProcessing();
    });
  }

  /**
   * Execute a step's action queue directly, bypassing loopState.startProcessing().
   * Processes actions sequentially, awaiting each checkLocation so the worker
   * is never flooded. Updates loopState mana/XP to match what _processFrame does.
   */
  async _executeStepDirect(loopState, stepQueue) {
    for (const action of stepQueue) {
      // Calculate mana cost (same as loopState._processFrame in instant mode)
      const actionCost = loopState._calculateActionCost({
        type: action.type === 'locationCheck' ? 'locationCheck'
            : action.type === 'move' ? 'regionMove'
            : 'customAction',
        sourceRegion: action.region || action.from,
        destinationRegion: action.to,
        locationName: action.location,
        exitUsed: action.exitUsed,
      });

      // Deduct mana
      const newMana = loopState.currentMana - actionCost;
      if (newMana < 0 && loopState.noManaDepletionReset) {
        loopState.manaDebt = Math.max(loopState.manaDebt, Math.abs(newMana));
        loopState.currentMana = newMana;
      } else {
        loopState.currentMana = Math.max(0, newMana);
      }

      // XP gain (1 XP per mana spent, same as loopState)
      const sourceRegion = action.region || action.from;
      if (sourceRegion) {
        loopState.addRegionXP(sourceRegion, actionCost);
      }

      // For locationCheck, await the worker to avoid flooding
      if (action.type === 'locationCheck' && action.location) {
        try {
          await stateManagerProxySingleton.checkLocation(action.location);
        } catch (e) {
          log('warn', `[Verify] checkLocation failed: ${action.location}: ${e.message}`);
        }
      }
    }
  }

  // =========================================================================
  // Rendering
  // =========================================================================

  _setStatus(text) {
    const statusEl = this.rootElement.querySelector('.cd-status');
    if (statusEl) statusEl.textContent = text;
  }

  _updateStatus() {
    if (this.isVerifying) return; // Status managed by verify loop
    const planner = getCostPlanner();
    if (!planner || !planner.isLoaded()) {
      this._setStatus('No sphere log loaded');
      return;
    }
    const steps = planner.getPlannedSteps().length;
    const entries = planner.getTotalEntries() - (planner.getSkippedEventEntries() || 0);

    if (this.verificationResults.length > 0) {
      const tolerance = 5;
      const matched = this.verificationResults.filter(r =>
        Math.abs(r.actual.manaConsumed - r.predicted.manaConsumed) <= tolerance
      ).length;
      this._setStatus(`Verified: ${this.verificationResults.length} steps, ${matched}/${this.verificationResults.length} within tolerance`);
    } else if (planner.isComplete()) {
      this._setStatus(`Complete: ${steps} loops, ${entries} entries`);
    } else {
      this._setStatus(`${steps} loops planned`);
    }
  }

  _updateButtons() {
    const planner = getCostPlanner();
    const loaded = planner?.isLoaded() || false;
    const complete = planner?.isComplete() || false;
    const hasSteps = (planner?.getPlannedSteps().length || 0) > 0;

    const btnLoad = this.rootElement.querySelector('.cd-btn-load');
    const btnVerify = this.rootElement.querySelector('.cd-btn-verify');
    const btnPlanStep = this.rootElement.querySelector('.cd-btn-plan-step');
    const btnPlanSphere = this.rootElement.querySelector('.cd-btn-plan-sphere');
    const btnPlanAll = this.rootElement.querySelector('.cd-btn-plan-all');
    const btnReset = this.rootElement.querySelector('.cd-btn-reset');

    if (this.isVerifying) {
      if (btnLoad) btnLoad.disabled = true;
      if (btnVerify) btnVerify.disabled = true;
      if (btnPlanStep) btnPlanStep.disabled = true;
      if (btnPlanSphere) btnPlanSphere.disabled = true;
      if (btnPlanAll) btnPlanAll.disabled = true;
      if (btnReset) btnReset.disabled = true;
      return;
    }

    if (btnLoad) btnLoad.disabled = false;
    if (btnVerify) btnVerify.disabled = !hasSteps;
    if (btnPlanStep) btnPlanStep.disabled = !loaded || complete;
    if (btnPlanSphere) btnPlanSphere.disabled = !loaded || complete;
    if (btnPlanAll) btnPlanAll.disabled = !loaded || complete;
    if (btnReset) btnReset.disabled = !loaded || !hasSteps;
  }

  _updateSummary() {
    const planner = getCostPlanner();
    const steps = planner?.getPlannedSteps() || [];
    const totalEntries = planner?.getTotalEntries() || 0;
    const skippedEvents = planner?.getSkippedEventEntries() || 0;

    const stepsEl = this.rootElement.querySelector('.cd-summary-steps');
    const entriesEl = this.rootElement.querySelector('.cd-summary-entries');
    const regionsEl = this.rootElement.querySelector('.cd-summary-regions');
    const locationsEl = this.rootElement.querySelector('.cd-summary-locations');

    if (stepsEl) stepsEl.textContent = String(steps.length);

    // Count completed sphere entries (CHECK steps), excluding skipped event locations
    const checkableEntries = totalEntries - skippedEvents;
    const completedEntries = steps.filter(s => s.phase === 'CHECK').length;
    if (entriesEl) entriesEl.textContent = `${completedEntries} / ${checkableEntries}`;

    // Update labels and values based on mode
    const regionsLabel = this.rootElement.querySelector('.cd-summary-regions')?.previousElementSibling;
    const locationsLabel = this.rootElement.querySelector('.cd-summary-locations')?.previousElementSibling;

    if (this.verificationResults.length > 0) {
      // Verification summary
      if (regionsLabel) regionsLabel.textContent = 'Matched:';
      if (locationsLabel) locationsLabel.textContent = 'Max \u0394:';

      const tolerance = 5;
      const matched = this.verificationResults.filter(r =>
        Math.abs(r.actual.manaConsumed - r.predicted.manaConsumed) <= tolerance
      ).length;
      if (regionsEl) regionsEl.textContent = `${matched}/${this.verificationResults.length}`;

      const maxDelta = this.verificationResults.length > 0
        ? Math.max(...this.verificationResults.map(r =>
            Math.abs(r.actual.manaConsumed - r.predicted.manaConsumed)
          ))
        : 0;
      if (locationsEl) locationsEl.textContent = maxDelta.toFixed(1);
    } else {
      if (regionsLabel) regionsLabel.textContent = 'Regions:';
      if (locationsLabel) locationsLabel.textContent = 'Locations:';
      const costData = planner?.getCostData();
      if (regionsEl) regionsEl.textContent = costData ? Object.keys(costData.regions).length : '0';
      if (locationsEl) locationsEl.textContent = costData ? Object.keys(costData.locations).length : '0';
    }
  }

  _refreshStepList() {
    const listEl = this.rootElement.querySelector('.cd-step-list');
    if (!listEl) return;

    const planner = getCostPlanner();
    const steps = planner?.getPlannedSteps() || [];

    if (steps.length === 0) {
      let msg;
      if (planner?.isLoaded()) {
        msg = 'Sphere log loaded. Click "Plan Step" to begin.';
      } else {
        msg = 'Click "Load" to plan costs, or "Verify" to verify after planning.';
      }
      listEl.innerHTML = `<div class="cd-step-list-empty">${msg}</div>`;
      return;
    }

    listEl.innerHTML = steps.map(step => {
      const selected = step.stepIndex === this.selectedStepIndex ? ' cd-selected' : '';
      const hasDeficit = step.simulatedResults.manaRemaining < 0;
      const hasWarning = step.notes.some(n => !n.includes('fully explored') && !n.includes('discovered') && !n.includes('Ready'));
      const warnClass = hasDeficit ? ' cd-has-error' : hasWarning ? ' cd-has-warning' : '';

      let phaseBadge, detail, truncName, sphereLabel;

      if (step.phase === 'DEFAULTS') {
        phaseBadge = '<span class="cd-phase-badge cd-phase-defaults">DEF</span>';
        const count = step.costAssignments.length;
        detail = `<span class="cd-step-new-costs">${count} assigned</span>`;
        truncName = 'Default Costs';
        sphereLabel = '';
      } else {
        phaseBadge = step.phase === 'EXPLORE'
          ? '<span class="cd-phase-badge cd-phase-explore">EXP</span>'
          : '<span class="cd-phase-badge cd-phase-check">CHK</span>';
        detail = '';
        if (step.phase === 'EXPLORE' && step.exploreProgress) {
          const p = step.exploreProgress;
          detail = `<span class="cd-step-progress">${p.discovered}/${p.total}</span>`;
        } else if (step.phase === 'CHECK') {
          const locAssignment = step.costAssignments.find(a => a.type === 'location');
          if (step.mode === 'verify' && locAssignment?.verification) {
            const v = locAssignment.verification;
            const deltaClass = v.delta === 0 ? 'cd-verify-exact' : Math.abs(v.delta) <= 5 ? 'cd-verify-close' : 'cd-verify-far';
            const sign = v.delta > 0 ? '+' : '';
            detail = `<span class="${deltaClass}">${sign}${v.delta}</span>`;
          } else {
            detail = `<span class="cd-step-new-costs">cost=${locAssignment?.cost || '?'}</span>`;
          }
        }
        truncName = step.phase === 'EXPLORE'
          ? truncate(step.targetRegion, 24)
          : truncate(step.locationName, 24);
        sphereLabel = `S${step.sphereIndex}`;
      }

      // Override detail with verification result if available
      const vResult = this.verificationResults.find(r => r.stepIndex === step.stepIndex);
      if (vResult) {
        const delta = vResult.actual.manaConsumed - vResult.predicted.manaConsumed;
        const absD = Math.abs(delta);
        const cls = absD <= 1 ? 'cd-verify-exact' : absD <= 5 ? 'cd-verify-close' : 'cd-verify-far';
        const sign = delta > 0 ? '+' : '';
        detail = `<span class="${cls}">\u0394${sign}${delta.toFixed(1)}</span>`;
      }

      return `
        <div class="cd-step-row${selected}${warnClass}" data-index="${step.stepIndex}">
          <span class="cd-step-index">${step.stepIndex + 1}</span>
          <span class="cd-step-sphere">${sphereLabel}</span>
          ${phaseBadge}
          <span class="cd-step-name" title="${escapeHtml(step.phase === 'DEFAULTS' ? 'Default Costs' : (step.phase === 'EXPLORE' ? step.targetRegion : step.locationName))}">${escapeHtml(truncName)}</span>
          <span class="cd-step-summary">${detail}</span>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.cd-step-row').forEach(row => {
      row.addEventListener('click', () => {
        this.selectedStepIndex = parseInt(row.dataset.index, 10);
        this._refreshStepList();
        this._refreshDetailView();
      });
    });
  }

  _scrollToStep(stepIndex) {
    const row = this.rootElement.querySelector(`.cd-step-row[data-index="${stepIndex}"]`);
    if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  _refreshDetailView() {
    const container = this.rootElement.querySelector('.cd-detail-container');
    if (!container) return;

    const planner = getCostPlanner();
    const steps = planner?.getPlannedSteps() || [];
    const step = steps[this.selectedStepIndex];

    if (!step) {
      container.innerHTML = '<div class="cd-detail-empty">Select a step to view details</div>';
      return;
    }

    container.innerHTML = `<div class="cd-detail-inner">${this._renderStepDetail(step)}</div>`;
  }

  // =========================================================================
  // Detail Rendering
  // =========================================================================

  _renderStepDetail(step) {
    const sections = [];
    const pad = (str, len) => String(str).padEnd(len);
    const rpad = (str, len) => String(str).padStart(len);
    const pre = (html) => `<pre style="margin:0; font-size:inherit; font-family:inherit; white-space:pre;">${html}</pre>`;

    // Header
    const modePrefix = step.mode === 'verify' ? 'Verify ' : '';
    if (step.phase === 'DEFAULTS') {
      sections.push(`<div class="cd-reason-header">Step ${step.stepIndex + 1} [Defaults]: Assign costs to unvisited regions &amp; locations</div>`);
    } else {
      const phaseLabel = step.phase === 'EXPLORE' ? 'Explore' : 'Check';
      const target = step.phase === 'EXPLORE' ? step.targetRegion : step.locationName;
      sections.push(`<div class="cd-reason-header">${modePrefix}Step ${step.stepIndex + 1} [${phaseLabel}]: ${escapeHtml(target)}</div>`);

      // Sphere entry context
      const entryIdx = step.sphereEntryIndex != null ? step.sphereEntryIndex + 1 : '?';
      const planner = getCostPlanner();
      const totalEntries = (planner?.getTotalEntries() || 0) - (planner?.getSkippedEventEntries() || 0);
      sections.push(`<div class="cd-reason-subheader">Sphere entry ${entryIdx}/${totalEntries || '?'} (sphere ${step.sphereIndex}): ${escapeHtml(step.locationName)}</div>`);
    }

    // State before
    const s = step.stateBefore;
    const xpParts = [];
    if (s.regionXP) {
      for (const [region, data] of s.regionXP) {
        if (data.level > 0) xpParts.push(`${region}:L${data.level}`);
      }
    }
    sections.push(`<div class="cd-reason-section"><div class="cd-reason-label">State Before</div><div class="cd-reason-grid">` +
      `<span>Mana: ${fmtMana(s.currentMana)} / ${fmtMana(s.maxMana)}</span>` +
      `<span>Explored: ${s.exploredRegions.size} regions | Checked: ${s.checkedLocations.size} locations</span>` +
      (xpParts.length > 0 ? `<span>XP Levels: ${xpParts.join(', ')}</span>` : '') +
      `</div></div>`);

    // Path
    if (step.path && step.path.steps.length > 0) {
      const pathStr = step.path.steps.map(s => s.region).join(' \u2192 ');
      sections.push(`<div class="cd-reason-section"><div class="cd-reason-label">Path (${step.path.steps.length - 1} steps)</div><div class="cd-reason-grid">` +
        `<span>${escapeHtml(pathStr)}</span>` +
        `</div></div>`);
    }

    // Explore Progress (EXPLORE phase only)
    if (step.phase === 'EXPLORE' && step.exploreProgress) {
      const p = step.exploreProgress;
      const barLen = 20;
      const filled = Math.round((p.discovered / p.total) * barLen);
      const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barLen - filled);
      sections.push(`<div class="cd-reason-section"><div class="cd-reason-label">Explore Progress: ${step.targetRegion}</div><div class="cd-reason-grid">` +
        `<span>[${bar}] ${p.discovered} / ${p.total} (${p.remaining} remaining)</span>` +
        (step.discoveries && step.discoveries.length > 0
          ? `<span>Discovered this loop: ${step.discoveries.map(d => `${d.name} (${d.type})`).join(', ')}</span>`
          : '') +
        `</div></div>`);
    }

    // Cost Assignments
    if (step.costAssignments && step.costAssignments.length > 0) {
      const NW = 28;
      const rows = [];

      if (step.mode === 'verify') {
        rows.push(`${pad('Target', NW)} ${rpad('Type', 8)} ${rpad('Loaded', 8)} ${rpad('Simulated', 10)} ${rpad('Delta', 8)}`);
        rows.push('\u2500'.repeat(NW + 38));

        for (const ca of step.costAssignments) {
          const name = truncate(ca.name, NW - 2);
          const typeLabel = ca.type === 'region' ? 'region' : 'location';
          const v = ca.verification;
          if (v) {
            const cls = v.delta === 0 ? 'cd-verify-exact' : Math.abs(v.delta) <= 5 ? 'cd-verify-close' : 'cd-verify-far';
            const sign = v.delta > 0 ? '+' : '';
            rows.push(`<span class="${cls}">\u2713 ${pad(name, NW)} ${rpad(typeLabel, 8)} ${rpad(v.loadedCost, 8)} ${rpad(v.simulatedCost, 10)} ${rpad(sign + v.delta, 8)}</span>`);
          } else {
            rows.push(`<span class="cd-reason-new">\u2713 ${pad(name, NW)} ${rpad(typeLabel, 8)} ${rpad(ca.cost, 8)}</span>`);
          }
        }

        sections.push(`<div class="cd-reason-section"><div class="cd-reason-label">Cost Verification (${step.costAssignments.length})</div>${pre(rows.join('\n'))}</div>`);
      } else {
        rows.push(`${pad('Target', NW)} ${rpad('Type', 8)} ${rpad('Cost', 6)}  Formula`);
        rows.push('\u2500'.repeat(NW + 50));

        for (const ca of step.costAssignments) {
          const cls = 'cd-reason-new';
          const name = truncate(ca.name, NW - 2);
          const typeLabel = ca.type === 'region' ? 'region' : 'location';
          rows.push(`<span class="${cls}">\u2713 ${pad(name, NW)} ${rpad(typeLabel, 8)} ${rpad(ca.cost, 6)}  ${ca.formula}</span>`);
        }

        sections.push(`<div class="cd-reason-section"><div class="cd-reason-label">Cost Assignments (${step.costAssignments.length})</div>${pre(rows.join('\n'))}</div>`);
      }
    }

    // Simulated Queue
    if (step.queue.length > 0) {
      const NW = 28;
      const rows = [];
      rows.push(`${pad('Action', 12)} ${pad('Target', NW)} ${rpad('Base', 6)} ${rpad('Lvl', 4)} ${rpad('Cost', 8)}`);
      rows.push('\u2500'.repeat(NW + 34));

      let runningMana = step.stateBefore.currentMana;
      for (const q of step.queue) {
        let actionLabel, targetStr;
        if (q.type === 'explore') {
          actionLabel = 'Explore';
          const discType = q.discovered ? ` (${q.discovered.type})` : '';
          targetStr = q.discovered ? q.discovered.name + discType : q.region;
        } else if (q.type === 'move') {
          actionLabel = 'Move';
          targetStr = `${q.from} \u2192 ${q.to}`;
        } else {
          actionLabel = 'Check';
          targetStr = q.location || '?';
        }

        const truncTarget = truncate(targetStr, NW);
        runningMana -= q.cost;
        const manaClass = runningMana < 0 ? 'cd-reason-mana-deficit'
          : runningMana < step.stateBefore.maxMana * 0.2 ? 'cd-reason-mana-low'
          : '';

        const costStr = q.cost.toFixed(1);
        const remaining = `\u2192 ${runningMana.toFixed(1)}`;
        rows.push(`${pad(actionLabel, 12)} ${pad(truncTarget, NW)} ${rpad(q.baseCost.toFixed(0), 6)} ${rpad('L' + q.level, 4)} <span class="${manaClass}">${rpad(costStr, 8)} ${remaining}</span>`);
      }

      sections.push(`<div class="cd-reason-section"><div class="cd-reason-label">Action Queue (${step.queue.length} actions)</div>${pre(rows.join('\n'))}</div>`);
    }

    // Results
    const r = step.simulatedResults;
    const manaClass = r.manaRemaining < 0 ? 'cd-reason-mana-deficit'
      : r.manaRemaining < step.stateBefore.maxMana * 0.2 ? 'cd-reason-mana-low'
      : 'cd-reason-mana-ok';

    const xpEntries = Object.entries(r.xpGained);
    const xpStr = xpEntries.length > 0
      ? xpEntries.map(([region, xp]) => `${region}: +${xp.toFixed(1)}`).join(', ')
      : 'none';

    sections.push(`<div class="cd-reason-section"><div class="cd-reason-label">Results</div><div class="cd-reason-grid">` +
      `<span>Mana consumed: ${r.manaConsumed.toFixed(1)}</span>` +
      `<span>Mana remaining: <span class="${manaClass}">${r.manaRemaining.toFixed(1)}</span> (then reset to ${step.stateAfter.maxMana.toFixed(1)})</span>` +
      `<span>XP gained: ${xpStr}</span>` +
      `</div></div>`);

    // Notes
    if (step.notes.length > 0) {
      const noteRows = step.notes.map(n => {
        const cls = n.includes('deficit') || n.includes('No path') || n.includes('No explores')
          ? 'cd-reason-error'
          : n.includes('fully explored') || n.includes('Ready')
            ? 'cd-reason-success'
            : 'cd-reason-warning';
        return `<span class="${cls}">${escapeHtml(n)}</span>`;
      }).join('');
      sections.push(`<div class="cd-reason-section"><div class="cd-reason-label">Notes</div><div class="cd-reason-grid">${noteRows}</div></div>`);
    }

    // Verification Results (if available)
    const vResult = this.verificationResults.find(r => r.stepIndex === step.stepIndex);
    if (vResult) {
      const NW = 20;
      const vRows = [];
      vRows.push(`${pad('Metric', NW)} ${rpad('Predicted', 10)} ${rpad('Actual', 10)} ${rpad('Delta', 8)}`);
      vRows.push('\u2500'.repeat(NW + 32));

      const manaD = vResult.actual.manaConsumed - vResult.predicted.manaConsumed;
      const manaCls = Math.abs(manaD) <= 1 ? 'cd-verify-exact' : Math.abs(manaD) <= 5 ? 'cd-verify-close' : 'cd-verify-far';
      vRows.push(`<span class="${manaCls}">${pad('Mana Consumed', NW)} ${rpad(vResult.predicted.manaConsumed.toFixed(1), 10)} ${rpad(vResult.actual.manaConsumed.toFixed(1), 10)} ${rpad((manaD > 0 ? '+' : '') + manaD.toFixed(1), 8)}</span>`);

      const remD = vResult.actual.manaRemaining - vResult.predicted.manaRemaining;
      const remCls = Math.abs(remD) <= 1 ? 'cd-verify-exact' : Math.abs(remD) <= 5 ? 'cd-verify-close' : 'cd-verify-far';
      vRows.push(`<span class="${remCls}">${pad('Mana Remaining', NW)} ${rpad(vResult.predicted.manaRemaining.toFixed(1), 10)} ${rpad(vResult.actual.manaRemaining.toFixed(1), 10)} ${rpad((remD > 0 ? '+' : '') + remD.toFixed(1), 8)}</span>`);

      const maxD = vResult.actual.maxManaAfter - vResult.predicted.maxMana;
      const maxCls = Math.abs(maxD) <= 1 ? 'cd-verify-exact' : Math.abs(maxD) <= 5 ? 'cd-verify-close' : 'cd-verify-far';
      vRows.push(`<span class="${maxCls}">${pad('Max Mana (after)', NW)} ${rpad(vResult.predicted.maxMana.toFixed(1), 10)} ${rpad(vResult.actual.maxManaAfter.toFixed(1), 10)} ${rpad((maxD > 0 ? '+' : '') + maxD.toFixed(1), 8)}</span>`);

      if (vResult.actual.manaDebt > 0) {
        vRows.push(`<span class="cd-verify-far">${pad('Mana Debt', NW)} ${rpad('-', 10)} ${rpad(vResult.actual.manaDebt.toFixed(1), 10)}</span>`);
      }

      // XP comparison
      const allRegions = new Set([
        ...Object.keys(step.simulatedResults.xpGained),
        ...Object.keys(vResult.actual.xpGained)
      ]);
      if (allRegions.size > 0) {
        vRows.push('');
        vRows.push(`${pad('XP Region', NW)} ${rpad('Predicted', 10)} ${rpad('Actual', 10)} ${rpad('Delta', 8)}`);
        for (const region of allRegions) {
          const predXP = step.simulatedResults.xpGained[region] || 0;
          const actXP = vResult.actual.xpGained[region] || 0;
          const d = actXP - predXP;
          const cls = Math.abs(d) <= 1 ? 'cd-verify-exact' : Math.abs(d) <= 5 ? 'cd-verify-close' : 'cd-verify-far';
          vRows.push(`<span class="${cls}">${pad(truncate(region, NW - 2), NW)} ${rpad(predXP.toFixed(1), 10)} ${rpad(actXP.toFixed(1), 10)} ${rpad((d > 0 ? '+' : '') + d.toFixed(1), 8)}</span>`);
        }
      }

      sections.push(`<div class="cd-reason-section"><div class="cd-reason-label">Verification: Actual vs Predicted</div>${pre(vRows.join('\n'))}</div>`);
    }

    return sections.join('');
  }

  // =========================================================================
  // Cleanup
  // =========================================================================

  _onDestroy() {
    this.subscriptions.forEach(unsub => {
      if (typeof unsub === 'function') unsub();
    });
    this.subscriptions = [];
    log('info', 'CostDebuggerUI destroyed');
  }
}

// =========================================================================
// Helpers
// =========================================================================

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtMana(n) {
  if (n === null || n === undefined) return '?';
  return Number(n).toFixed(1);
}

function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen - 1) + '\u2026' : str;
}

function totalXP(data) {
  if (!data) return 0;
  return 10 * data.level * data.level + 90 * data.level + data.xp;
}

export default CostDebuggerUI;
