/**
 * JTA Cost Debugger Panel UI
 *
 * GoldenLayout panel component that displays step-by-step
 * JTA cost generation via simulated playthrough.
 * Each step = one action queue (one energy budget / reset).
 */

import { getCostPlanner, getModuleEventBus } from './index.js';
import { centralRegistry } from '../../app/core/centralRegistry.js';

function log(level, message, ...data) {
    if (typeof window !== 'undefined' && window.logger) {
        window.logger[level]('jtaCostDebuggerUI', message, ...data);
    } else {
        const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
        consoleMethod(`[jtaCostDebuggerUI] ${message}`, ...data);
    }
}

/**
 * JTACostDebuggerUI - GoldenLayout panel component
 */
export class JTACostDebuggerUI {
    constructor(container, componentState) {
        this.container = container;
        this.componentState = componentState;
        Object.defineProperty(this, 'eventBus', {
            get: () => getModuleEventBus(),
            configurable: true,
        });

        this.selectedStepIndex = -1;
        this.subscriptions = [];
        this._gameData = null;
        this._sphereLogContent = null;
        this._lastResult = null;

        this.rootElement = this._createRootElement();
        this.container.element.appendChild(this.rootElement);

        this.container.on('destroy', () => this._onDestroy());

        log('info', 'JTACostDebuggerUI initialized');
    }

    getRootElement() {
        return this.rootElement;
    }

    // =========================================================================
    // DOM Creation
    // =========================================================================

    _createRootElement() {
        const el = document.createElement('div');
        el.className = 'jta-cd-panel';

        el.innerHTML = `
            <div class="jta-cd-controls">
                <button class="jta-cd-btn-load" title="Load game data and sphere log">Load Data</button>
                <button class="jta-cd-btn-plan" disabled title="Run cost generation">Generate Costs</button>
                <button class="jta-cd-btn-verify" disabled title="Verify costs by re-running simulation">Verify</button>
                <button class="jta-cd-btn-step-verify" disabled title="Step-by-step verify: annotate each step with actual vs planned">Step Verify</button>
                <button class="jta-cd-btn-game-verify" disabled title="Verify using real game engine via instant mode">Game Verify</button>
                <button class="jta-cd-btn-apply" disabled title="Apply generated costs to game">Apply</button>
                <button class="jta-cd-btn-download" disabled title="Download cost data as JSON">Download</button>
                <button class="jta-cd-btn-reset" disabled title="Reset planner">Reset</button>
            </div>
            <details class="jta-cd-settings-details" open>
                <summary class="jta-cd-settings-summary">Settings</summary>
                <div class="jta-cd-settings">
                    <label title="Attempts for regular tasks">
                        Normal: <input type="number" class="jta-cd-normal-attempts" value="2" min="1" max="20">
                    </label>
                    <label title="Attempts for perk unlock tasks">
                        Perks: <input type="number" class="jta-cd-perk-attempts" value="5" min="1" max="20">
                    </label>
                    <label title="Attempts for boss tasks">
                        Bosses: <input type="number" class="jta-cd-boss-attempts" value="5" min="1" max="20">
                    </label>
                    <label title="Attempts for traversal (mandatory/travel) tasks">
                        Travel: <input type="number" class="jta-cd-traversal-attempts" value="5" min="1" max="20">
                    </label>
                    <label title="Adjust xpMult on grinding tasks to hit exact attempt counts">
                        <input type="checkbox" class="jta-cd-adjust-xp"> Adjust XP
                    </label>
                    <label title="Two-pass: first pass finds xpMult adjustments, second pass re-solves with those values baked in">
                        <input type="checkbox" class="jta-cd-two-pass"> Two-Pass
                    </label>
                    <label title="Capture binary search solver debug data for step detail view">
                        <input type="checkbox" class="jta-cd-solver-debug"> Solver Debug
                    </label>
                </div>
            </details>
            <div class="jta-cd-status-bar"><span class="jta-cd-status">No data loaded</span></div>
            <div class="jta-cd-step-list-container">
                <div class="jta-cd-step-list">
                    <div class="jta-cd-step-list-empty">Click "Load Data" to load game data and sphere log.</div>
                </div>
            </div>
            <div class="jta-cd-resize-handle"></div>
            <div class="jta-cd-detail-container" style="height: 300px;">
                <div class="jta-cd-detail-empty">Select a step to view details</div>
            </div>
            <div class="jta-cd-summary">
                <span class="jta-cd-summary-item">
                    <span class="jta-cd-summary-label">Steps:</span>
                    <span class="jta-cd-summary-value jta-cd-summary-steps">0</span>
                </span>
                <span class="jta-cd-summary-item">
                    <span class="jta-cd-summary-label">Tasks Costed:</span>
                    <span class="jta-cd-summary-value jta-cd-summary-costed">0</span>
                </span>
                <span class="jta-cd-summary-item">
                    <span class="jta-cd-summary-label">Spheres:</span>
                    <span class="jta-cd-summary-value jta-cd-summary-spheres">0</span>
                </span>
            </div>
        `;

        this._attachControlListeners(el);
        this._attachResizeHandle(el);

        return el;
    }

    _attachControlListeners(el) {
        el.querySelector('.jta-cd-btn-load').addEventListener('click', () => this._handleLoad());
        el.querySelector('.jta-cd-btn-plan').addEventListener('click', () => this._handlePlan());
        el.querySelector('.jta-cd-btn-verify').addEventListener('click', () => this._handleVerify());
        el.querySelector('.jta-cd-btn-step-verify').addEventListener('click', () => this._handleStepVerify());
        el.querySelector('.jta-cd-btn-game-verify').addEventListener('click', () => this._handleGameVerify());
        el.querySelector('.jta-cd-btn-apply').addEventListener('click', () => this._handleApply());
        el.querySelector('.jta-cd-btn-download').addEventListener('click', () => this._handleDownload());
        el.querySelector('.jta-cd-btn-reset').addEventListener('click', () => this._handleReset());

        // Adjust XP and Two-Pass are mutually exclusive
        const adjustXpCb = el.querySelector('.jta-cd-adjust-xp');
        const twoPassCb = el.querySelector('.jta-cd-two-pass');
        adjustXpCb.addEventListener('change', () => {
            if (adjustXpCb.checked) twoPassCb.checked = false;
        });
        twoPassCb.addEventListener('change', () => {
            if (twoPassCb.checked) adjustXpCb.checked = false;
        });
    }

    _attachResizeHandle(el) {
        const handle = el.querySelector('.jta-cd-resize-handle');
        const detailContainer = el.querySelector('.jta-cd-detail-container');
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
    // Handlers
    // =========================================================================

    async _handleLoad() {
        this._setStatus('Discovering JTA preset...');

        try {
            // Load directly from JTA preset (same pattern as jtaGameDataPanel)
            const resp = await fetch('presets/preset_files.json');
            const index = await resp.json();
            const jta = index.jta;
            if (!jta || !jta.folders) {
                this._setStatus('No JTA preset found in preset_files.json');
                return;
            }

            const folderName = Object.keys(jta.folders)[0];
            if (!folderName) {
                this._setStatus('No JTA preset folder found');
                return;
            }

            const folder = jta.folders[folderName];
            const basePath = `presets/jta/${folderName}`;

            const gamedataFile = folder.files.find(f => f.endsWith('_gamedata.json'));
            const sphereLogFile = folder.files.find(f => f.endsWith('_sphere_log.jsonl'));

            if (!gamedataFile) {
                this._setStatus('No gamedata file found in JTA preset');
                return;
            }
            if (!sphereLogFile) {
                this._setStatus('No sphere log found in JTA preset');
                return;
            }

            this._setStatus('Loading game data and sphere log...');

            const [gamedataResp, sphereLogResp] = await Promise.all([
                fetch(`${basePath}/${gamedataFile}`),
                fetch(`${basePath}/${sphereLogFile}`),
            ]);

            if (!gamedataResp.ok) throw new Error(`Failed to load gamedata: HTTP ${gamedataResp.status}`);
            if (!sphereLogResp.ok) throw new Error(`Failed to load sphere log: HTTP ${sphereLogResp.status}`);

            this._gameData = await gamedataResp.json();
            this._sphereLogContent = await sphereLogResp.text();

            this._setStatus(`Data loaded from ${folderName}. Click "Generate Costs" to begin.`);
            this.rootElement.querySelector('.jta-cd-btn-plan').disabled = false;
            this.rootElement.querySelector('.jta-cd-btn-reset').disabled = false;
        } catch (err) {
            log('error', 'Failed to load data', err);
            this._setStatus(`Error: ${err.message}`);
        }
    }

    _handlePlan() {
        if (!this._gameData || !this._sphereLogContent) {
            this._setStatus('No data loaded.');
            return;
        }

        const planner = getCostPlanner();
        if (!planner) {
            this._setStatus('Cost planner not available.');
            return;
        }

        // Read settings from UI
        const twoPass = this.rootElement.querySelector('.jta-cd-two-pass')?.checked || false;
        const settings = {
            normalAttempts: parseInt(this.rootElement.querySelector('.jta-cd-normal-attempts').value) || 2,
            perkAttempts: parseInt(this.rootElement.querySelector('.jta-cd-perk-attempts').value) || 5,
            bossAttempts: parseInt(this.rootElement.querySelector('.jta-cd-boss-attempts').value) || 5,
            traversalAttempts: parseInt(this.rootElement.querySelector('.jta-cd-traversal-attempts').value) || 5,
            adjustXpMult: twoPass || (this.rootElement.querySelector('.jta-cd-adjust-xp')?.checked || false),
            captureSolverDebug: this.rootElement.querySelector('.jta-cd-solver-debug')?.checked || false,
        };

        const passLabel = twoPass ? 'Pass 1' : 'Generating';
        this._setStatus(`${passLabel}: starting...`);

        // Helper to yield to browser for UI updates
        const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 0));

        // Run async so progress updates render
        (async () => {
            try {
                await yieldToUI();

                const progressCallback = ({ sphereNum, totalSpheres, stepsGenerated, tasksCosted }) => {
                    this._setStatus(`${passLabel}: sphere ${sphereNum}/${totalSpheres}, ${stepsGenerated} steps, ${tasksCosted} tasks...`);
                };

                let result = await planner.planCostsAsync(this._gameData, this._sphereLogContent, settings, progressCallback);

                // Track which game data the final pass used (for verification)
                this._verifyGameData = this._gameData;

                // Two-pass: collect xpMult adjustments, bake into game data, re-solve
                if (twoPass) {
                    const xpMultOverrides = new Map();
                    for (const step of result.steps) {
                        const xa = step.costAssignment?.xpAdjustments;
                        if (!xa) continue;
                        for (const adj of xa) {
                            xpMultOverrides.set(adj.taskName, adj.newXpMult);
                        }
                    }

                    if (xpMultOverrides.size > 0) {
                        this._setStatus(`Pass 2: re-solving with ${xpMultOverrides.size} baked xpMult values...`);
                        await yieldToUI();

                        const pass2GameData = JSON.parse(JSON.stringify(this._gameData));
                        for (const zone of pass2GameData.zones) {
                            for (const task of zone.tasks) {
                                if (xpMultOverrides.has(task.name)) {
                                    task.xpMult = xpMultOverrides.get(task.name);
                                }
                            }
                        }
                        const pass2Settings = { ...settings, adjustXpMult: false };
                        const pass2Planner = getCostPlanner();
                        result = await pass2Planner.planCostsAsync(pass2GameData, this._sphereLogContent, pass2Settings,
                            ({ sphereNum, totalSpheres, stepsGenerated, tasksCosted }) => {
                                this._setStatus(`Pass 2: sphere ${sphereNum}/${totalSpheres}, ${stepsGenerated} steps, ${tasksCosted} tasks...`);
                            }
                        );
                        this._verifyGameData = pass2GameData;
                    }
                }

                this._lastResult = result;
                this._renderStepList(result.steps);
                this._updateSummary(result);
                const passInfo = twoPass ? ' (two-pass)' : '';
                this._setStatus(`Done${passInfo}: ${result.steps.length} steps, ${result.assignedCosts.size} tasks costed.`);
                this.rootElement.querySelector('.jta-cd-btn-verify').disabled = false;
                this.rootElement.querySelector('.jta-cd-btn-step-verify').disabled = false;
                this.rootElement.querySelector('.jta-cd-btn-game-verify').disabled = false;
                this.rootElement.querySelector('.jta-cd-btn-apply').disabled = false;
                this.rootElement.querySelector('.jta-cd-btn-download').disabled = false;

                this.eventBus.publish('jtaCostDebugger:planned', { result });
            } catch (err) {
                log('error', 'Cost generation failed', err);
                this._setStatus(`Error: ${err.message}`);
            }
        })();
    }

    _handleVerify() {
        if (!this._lastResult || !this._gameData || !this._sphereLogContent) {
            this._setStatus('Generate costs first before verifying.');
            return;
        }

        const planner = getCostPlanner();
        if (!planner) {
            this._setStatus('Cost planner not available.');
            return;
        }

        this._setStatus('Verifying costs...');

        setTimeout(() => {
            try {
                const result = planner.verifyCosts(
                    this._verifyGameData || this._gameData, this._sphereLogContent,
                    this._lastResult.assignedCosts
                );

                const { comparison } = result;
                const matched = comparison.filter(c => c.match).length;
                const mismatched = comparison.filter(c => !c.match);
                const total = comparison.length;

                this._setStatus(
                    `Verify: ${matched}/${total} tasks match. ` +
                    (mismatched.length > 0
                        ? `${mismatched.length} mismatches.`
                        : 'All match!')
                );

                this._renderVerifyResults(result);
            } catch (err) {
                log('error', 'Verification failed', err);
                this._setStatus(`Verify error: ${err.message}`);
            }
        }, 50);
    }

    _renderVerifyResults(result) {
        const detailEl = this.rootElement.querySelector('.jta-cd-detail-container');
        const { comparison, verifySteps } = result;

        let html = `<div class="jta-cd-detail">`;
        html += `<div class="jta-cd-detail-header"><strong>Verification Results</strong> | ${verifySteps.length} steps simulated</div>`;

        // Summary
        const matched = comparison.filter(c => c.match).length;
        const close = comparison.filter(c => !c.match && Math.abs(c.delta) <= 1).length;
        const far = comparison.filter(c => !c.match && Math.abs(c.delta) > 1).length;
        html += `<div style="margin: 6px 0;">
            <span class="jta-cd-completed">${matched} exact</span> |
            <span style="color: #d4a050;">${close} off by 1</span> |
            <span style="color: #d07070;">${far} off by 2+</span>
        </div>`;

        // Comparison table
        html += `<div class="jta-cd-detail-section">
            <div class="jta-cd-detail-section-title">Per-Task Comparison</div>
            <table class="jta-cd-queue-table">
                <thead><tr>
                    <th>Task</th><th>Cat</th><th>Zone</th>
                    <th>costMult</th><th>Planned</th><th>Actual</th><th>Delta</th>
                </tr></thead><tbody>`;

        for (const c of comparison) {
            const deltaClass = c.match ? 'jta-cd-completed'
                : Math.abs(c.delta) <= 1 ? '' : 'jta-cd-cannot-afford';
            const deltaStr = c.delta === 0 ? '0' : (c.delta > 0 ? `+${c.delta}` : `${c.delta}`);
            html += `<tr class="${deltaClass}">
                <td>${this._truncate(c.taskName, 30)}</td>
                <td>${c.category}</td>
                <td>${c.zoneId ?? '?'}</td>
                <td>${c.costMult.toFixed(4)}</td>
                <td>${c.plannedAttempts}</td>
                <td>${c.actualAttempts}</td>
                <td style="font-weight: bold;">${deltaStr}</td>
            </tr>`;
        }

        html += `</tbody></table></div>`;

        // Mismatches detail
        const mismatches = comparison.filter(c => !c.match);
        if (mismatches.length > 0) {
            html += `<div class="jta-cd-detail-section">
                <div class="jta-cd-detail-section-title">Mismatches</div>
                <ul class="jta-cd-notes">`;
            for (const c of mismatches) {
                html += `<li>${c.taskName} (${c.category}): planned ${c.plannedAttempts}, actual ${c.actualAttempts} (delta ${c.delta > 0 ? '+' : ''}${c.delta})</li>`;
            }
            html += `</ul></div>`;
        }

        html += `</div>`;
        detailEl.innerHTML = html;
    }

    _handleStepVerify() {
        if (!this._lastResult || !this._gameData || !this._sphereLogContent) {
            this._setStatus('Generate costs first before verifying.');
            return;
        }

        const planner = getCostPlanner();
        if (!planner) {
            this._setStatus('Cost planner not available.');
            return;
        }

        this._setStatus('Running step verification...');

        setTimeout(() => {
            try {
                const { annotatedSteps, summary } = planner.stepVerify(
                    this._verifyGameData || this._gameData, this._sphereLogContent
                );

                // Re-render step list with verification indicators
                this._renderStepList(annotatedSteps);
                this._setStatus(
                    `Step Verify: ${summary.stepsMatched}/${summary.totalPlannedSteps} match, ` +
                    `${summary.energyMismatches} energy mismatches, ` +
                    `${summary.totalVerifySteps} verify steps`
                );
            } catch (err) {
                log('error', 'Step verification failed', err);
                this._setStatus(`Step verify error: ${err.message}`);
            }
        }, 50);
    }

    async _handleGameVerify() {
        if (!this._lastResult || !this._gameData) {
            this._setStatus('Generate costs first before game verification.');
            return;
        }

        const planner = getCostPlanner();
        if (!planner) {
            this._setStatus('Cost planner not available.');
            return;
        }

        this._setStatus('Game Verify: enabling instant mode...');

        try {
            const gameData = this._lastResult.adjustedData;
            console.log('[GameVerify] Starting real-game verification...');
            const { annotatedSteps, summary } = await planner.realGameVerify(
                this.eventBus,
                gameData,
                ({ step, total, taskName }) => {
                    if (step % 50 === 0) {
                        console.log(`[GameVerify] Step ${step}/${total}: ${taskName}`);
                        this._setStatus(`Game Verify: step ${step}/${total} (${taskName})...`);
                    }
                }
            );

            console.log('[GameVerify] Complete:', JSON.stringify(summary));
            this._renderStepList(annotatedSteps);
            this._setStatus(
                `Game Verify: ${summary.stepsMatched}/${summary.totalPlannedSteps} match, ` +
                `${summary.energyMismatches} energy mismatches`
            );
        } catch (err) {
            console.error('[GameVerify] Failed:', err);
            log('error', 'Game verification failed', err);
            this._setStatus(`Game verify error: ${err.message}`);
        }
    }

    _handleApply() {
        if (!this._lastResult) return;

        try {
            this.eventBus.publish('jta:replaceGameData', this._lastResult.adjustedData);
            this._setStatus('Costs applied to game.');
        } catch (err) {
            log('error', 'Failed to apply costs', err);
            this._setStatus(`Error applying costs: ${err.message}`);
        }
    }

    _handleDownload() {
        if (!this._lastResult) return;

        const data = JSON.stringify(this._lastResult.costData, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'jta_costs_debugger.json';
        a.click();
        URL.revokeObjectURL(url);
        this._setStatus('Cost data downloaded.');
    }

    _handleReset() {
        const planner = getCostPlanner();
        if (planner) planner.reset();

        this._lastResult = null;
        this._verifyGameData = null;
        this.selectedStepIndex = -1;
        this._gameData = null;
        this._sphereLogContent = null;

        const stepList = this.rootElement.querySelector('.jta-cd-step-list');
        stepList.innerHTML = '<div class="jta-cd-step-list-empty">Click "Load Data" to load game data and sphere log.</div>';

        const detail = this.rootElement.querySelector('.jta-cd-detail-container');
        detail.innerHTML = '<div class="jta-cd-detail-empty">Select a step to view details</div>';

        this.rootElement.querySelector('.jta-cd-btn-plan').disabled = true;
        this.rootElement.querySelector('.jta-cd-btn-apply').disabled = true;
        this.rootElement.querySelector('.jta-cd-btn-download').disabled = true;

        this._updateSummary(null);
        this._setStatus('No data loaded');

        this.eventBus.publish('jtaCostDebugger:reset', {});
    }

    // =========================================================================
    // Rendering
    // =========================================================================

    _setStatus(text) {
        const el = this.rootElement.querySelector('.jta-cd-status');
        if (el) el.textContent = text;
    }

    _updateSummary(result) {
        const stepsEl = this.rootElement.querySelector('.jta-cd-summary-steps');
        const costedEl = this.rootElement.querySelector('.jta-cd-summary-costed');
        const spheresEl = this.rootElement.querySelector('.jta-cd-summary-spheres');

        if (!result) {
            if (stepsEl) stepsEl.textContent = '0';
            if (costedEl) costedEl.textContent = '0';
            if (spheresEl) spheresEl.textContent = '0';
            return;
        }

        if (stepsEl) stepsEl.textContent = result.steps.length;
        if (costedEl) costedEl.textContent = result.assignedCosts.size;
        if (spheresEl) {
            const spheres = new Set(result.steps.map(s => s.sphereIndex));
            spheresEl.textContent = spheres.size;
        }
    }

    _renderStepList(steps) {
        const listEl = this.rootElement.querySelector('.jta-cd-step-list');
        listEl.innerHTML = '';

        for (const step of steps) {
            const row = document.createElement('div');
            row.className = 'jta-cd-step-row';
            if ((step.displayIndex ?? step.stepIndex) === this.selectedStepIndex) {
                row.classList.add('jta-cd-step-selected');
            }

            const badge = this._getCategoryBadge(step.targetCategory);
            const statusIcon = step.targetCompleted ? '\u2713' : '\u2717';
            const statusClass = step.targetCompleted ? 'jta-cd-completed' : 'jta-cd-incomplete';

            // Verification indicator (supports both Step Verify and Game Verify)
            let verifyIndicator = '';
            const vData = step.verification || step.realGameVerification;
            if (vData) {
                const ok = (vData.focusMatch ?? true) && vData.completedMatch && Math.abs(vData.energyDelta) <= 1;
                const cls = ok ? 'jta-cd-completed' : Math.abs(vData.energyDelta) <= 5 ? '' : 'jta-cd-cannot-afford';
                const delta = vData.energyDelta >= 0 ? `+${vData.energyDelta.toFixed(0)}` : vData.energyDelta.toFixed(0);
                const label = step.realGameVerification ? 'Game' : 'Sim';
                verifyIndicator = `<span class="jta-cd-step-cost ${cls}" title="${label} verify energy delta">${ok ? '\u2714' : '\u0394'}${delta}</span>`;
            }

            const displayNum = step.displayIndex ?? step.stepIndex;
            const stepId = step.displayIndex ?? step.stepIndex;
            if (step.substep) {
                row.classList.add('jta-cd-substep-row');
            }

            row.innerHTML = `
                <span class="jta-cd-step-num">${displayNum}</span>
                <span class="jta-cd-step-badge ${badge.cssClass}">${badge.label}</span>
                <span class="jta-cd-step-target" title="${step.targetTask}">${step.targetTask}</span>
                <span class="jta-cd-step-attempt">A${step.attemptNumber}/${step.targetAttempts}</span>
                <span class="jta-cd-step-status ${statusClass}">${statusIcon}</span>
                <span class="jta-cd-step-sphere">S${step.sphereIndex}</span>
                <span class="jta-cd-step-cost">${step.costAssignment ? `<span title="costMult=${step.costAssignment.costMult.toFixed(4)}">C:${step.costAssignment.costMult.toFixed(2)}</span>` : ''}</span>
                <span>${verifyIndicator}</span>
            `;

            row.addEventListener('click', () => {
                this.selectedStepIndex = stepId;
                this._renderStepList(steps);
                this._renderStepDetail(step);
            });

            listEl.appendChild(row);
        }
    }

    _getCategoryBadge(category) {
        switch (category) {
            case 'perk': return { label: 'PERK', cssClass: 'jta-cd-badge-perk' };
            case 'boss': return { label: 'BOSS', cssClass: 'jta-cd-badge-boss' };
            case 'traversal': return { label: 'TRAV', cssClass: 'jta-cd-badge-trav' };
            case 'normal': return { label: 'NORM', cssClass: 'jta-cd-badge-norm' };
            default: return { label: '???', cssClass: '' };
        }
    }

    _renderStepDetail(step) {
        const detailEl = this.rootElement.querySelector('.jta-cd-detail-container');

        let html = `<div class="jta-cd-detail">`;

        // Header
        const headerLabel = step.substep
            ? `<strong>Substep ${step.displayIndex}</strong> | Solver iteration ${step.substepIteration}, inner attempt ${step.substepNumber}`
            : `<strong>Step ${step.stepIndex}</strong>`;
        html += `
            <div class="jta-cd-detail-header">
                ${headerLabel} | Sphere ${step.sphereIndex} |
                Target: <em>${step.targetTask}</em> (${step.targetCategory}) |
                Attempt ${step.attemptNumber}/${step.targetAttempts} |
                ${step.targetCompleted ? '<span class="jta-cd-completed">COMPLETED</span>' : '<span class="jta-cd-incomplete">NOT COMPLETED</span>'}
            </div>
        `;

        // Energy summary
        html += `
            <div class="jta-cd-detail-energy">
                Energy: ${step.energyBudget.toFixed(1)} budget |
                ${step.energyUsed.toFixed(1)} used |
                ${step.energyRemaining.toFixed(1)} remaining
            </div>
        `;

        // Cost assignment
        if (step.costAssignment) {
            const ca = step.costAssignment;
            html += `
                <div class="jta-cd-detail-section">
                    <div class="jta-cd-detail-section-title">Cost Assignment</div>
                    <table class="jta-cd-table">
                        <tr><td>Task</td><td>${ca.taskName}</td></tr>
                        <tr><td>Zone</td><td>${ca.zoneName} (${ca.zoneId})</td></tr>
                        <tr><td>Category</td><td>${ca.category}</td></tr>
                        <tr><td>costMult</td><td>${ca.costMult.toFixed(6)}</td></tr>
                        <tr><td>xpMult</td><td>${ca.xpMult.toFixed(4)}</td></tr>
                        <tr><td>Target Attempts</td><td>${ca.targetAttempts}</td></tr>
                        <tr><td>Energy Available</td><td>${ca.energyAvailable.toFixed(2)}</td></tr>
                        <tr><td>Formula</td><td>${ca.formula}</td></tr>
                        <tr><td>Cost Scale</td><td>${ca.costScale?.toFixed(2) ?? '1.00'} (${ca.category})</td></tr>
                        <tr><td>Pre-scale costMult</td><td>${ca.preSolvedCostMult?.toFixed(6) ?? '-'}</td></tr>
                    </table>
                    ${ca.xpAdjustments && ca.xpAdjustments.length > 0 ? (() => {
                        const mult = ca.xpAdjustments[0].multiplier;
                        const dir = mult > 1 ? 'increased' : 'reduced';
                        let xpHtml = `<details class="jta-cd-xp-adjust-details" style="margin-top: 6px;">
                            <summary style="cursor:pointer; color:#d4a64a;">${ca.xpAdjustments.length} tasks xpMult ${dir} by x${mult.toFixed(4)}</summary>
                            <table class="jta-cd-queue-table" style="margin-top: 4px;">
                                <thead><tr><th>Task</th><th>Original</th><th>Adjusted</th></tr></thead>
                                <tbody>`;
                        for (const adj of ca.xpAdjustments) {
                            xpHtml += `<tr><td>${adj.taskName}</td><td>${adj.origXpMult.toFixed(4)}</td><td>${adj.newXpMult.toFixed(4)}</td></tr>`;
                        }
                        xpHtml += `</tbody></table></details>`;
                        return xpHtml;
                    })() : ''}
                </div>
            `;

            // Solver debug (collapsible)
            if (ca.solverDebug && ca.solverDebug.length > 0) {
                html += `
                    <div class="jta-cd-detail-section">
                        <details class="jta-cd-solver-debug-details">
                            <summary class="jta-cd-detail-section-title">Solver Debug (${ca.solverDebug.length} entries)</summary>
                            ${this._renderSolverDebug(ca.solverDebug, step.stepIndex)}
                        </details>
                    </div>
                `;
            }
        }

        // Grind plan
        if (step.grindPlan) {
            const gp = step.grindPlan;
            const targetSkillsStr = gp.targetSkills?.join(', ') || 'none';
            const affordStr = gp.targetAffordable ? ' (target affordable, grinding skipped)' : '';
            html += `
                <div class="jta-cd-detail-section">
                    <div class="jta-cd-detail-section-title">XP Grinding Plan (${gp.tasksSelected}/${gp.candidatesConsidered} tasks, budget: ${gp.budget.toFixed(1)}${affordStr})</div>
                    <div style="margin-bottom: 4px; color: #999;">Target skills: ${targetSkillsStr}</div>
            `;
            if (gp.tasks.length > 0) {
                html += `<table class="jta-cd-queue-table">
                        <thead><tr>
                            <th>Task</th><th>Zone</th><th>Skills</th>
                            <th>Cost</th><th>XP</th><th>XP/E</th><th>Eff.</th><th>Rel</th><th>Sel</th>
                        </tr></thead><tbody>`;
                for (const gt of gp.tasks) {
                    const selClass = gt.selected ? 'jta-cd-completed' : 'jta-cd-skipped';
                    const relIcon = gt.trainsTargetSkill ? '\u2713' : '';
                    html += `<tr class="${selClass}">
                        <td>${this._truncate(gt.taskName, 25)}</td>
                        <td>${gt.zoneName || ''}</td>
                        <td>${gt.skills.join(', ')}</td>
                        <td>${gt.cost.toFixed(1)}</td>
                        <td>${gt.xp.toFixed(0)}</td>
                        <td>${gt.xpPerEnergy.toFixed(1)}</td>
                        <td>${gt.effectiveXpPerEnergy?.toFixed(1) ?? '-'}</td>
                        <td>${relIcon}</td>
                        <td>${gt.selected ? '\u2713' : ''}</td>
                    </tr>`;
                }
                html += `</tbody></table>`;
            }
            html += `</div>`;
        }

        // Action queue
        html += `
            <div class="jta-cd-detail-section">
                <div class="jta-cd-detail-section-title">Action Queue (${step.queue.length} entries)</div>
                <table class="jta-cd-queue-table">
                    <thead>
                        <tr>
                            <th>Task</th>
                            <th>Zone</th>
                            <th>Type</th>
                            <th>Status</th>
                            <th>Energy Before</th>
                            <th>Cost</th>
                            <th>Energy After</th>
                            <th>XP</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        for (const entry of step.queue) {
            const statusClass = entry.status === 'completed' ? 'jta-cd-completed'
                : entry.status === 'cannot_afford' ? 'jta-cd-cannot-afford'
                : 'jta-cd-skipped';
            html += `
                <tr class="${statusClass}">
                    <td title="${entry.taskName}">${this._truncate(entry.taskName, 30)}</td>
                    <td>${entry.zoneName || ''}</td>
                    <td>${entry.type}</td>
                    <td>${entry.status}</td>
                    <td>${entry.energyBefore?.toFixed(1) ?? '-'}</td>
                    <td>${entry.energyCost?.toFixed(1) ?? '-'}</td>
                    <td>${entry.energyAfter?.toFixed(1) ?? '-'}</td>
                    <td>${entry.xpGained?.toFixed(0) ?? '-'}</td>
                </tr>
            `;
        }

        html += `</tbody></table></div>`;

        // State before/after
        html += `
            <div class="jta-cd-detail-section">
                <div class="jta-cd-detail-section-title">State</div>
                <div class="jta-cd-state-compare">
                    <div class="jta-cd-state-col">
                        <strong>Before</strong>
                        ${this._renderState(step.stateBefore)}
                    </div>
                    <div class="jta-cd-state-col">
                        <strong>After</strong>
                        ${this._renderState(step.stateAfter)}
                    </div>
                </div>
            </div>
        `;

        // Verification data (added by Step Verify or Game Verify)
        const verifyData = step.verification || step.realGameVerification;
        if (verifyData) {
            const v = verifyData;
            const isGameVerify = !!step.realGameVerification;
            const focusColor = v.focusMatch ? 'jta-cd-completed' : 'jta-cd-cannot-afford';
            const complColor = v.completedMatch ? 'jta-cd-completed' : 'jta-cd-cannot-afford';
            const eDelta = v.energyDelta;
            const eDeltaStr = eDelta >= 0 ? `+${eDelta.toFixed(1)}` : eDelta.toFixed(1);
            const eDeltaColor = Math.abs(eDelta) <= 1 ? 'jta-cd-completed'
                : Math.abs(eDelta) <= 5 ? '' : 'jta-cd-cannot-afford';

            const verifyLabel = isGameVerify ? 'Game Verification' : `Verification (Step ${v.verifyStepIndex})`;
            html += `
                <div class="jta-cd-detail-section">
                    <div class="jta-cd-detail-section-title">${verifyLabel}</div>
                    <table class="jta-cd-table">
                        ${v.focusMatch !== undefined ? `<tr><td>Focus Match</td><td class="${focusColor}">${v.focusMatch ? 'Yes' : `No (actual: ${v.focusTask})`}</td></tr>` : ''}
                        <tr><td>Completed Match</td><td class="${complColor}">${v.completedMatch ? 'Yes' : `No (actual: ${v.completed})`}</td></tr>
                        <tr><td>Verify Energy</td><td>${v.energyBudget?.toFixed(1) ?? '?'} budget${v.energyUsed != null ? ` | ${v.energyUsed.toFixed(1)} used` : ''} | ${v.energyRemaining?.toFixed(1) ?? '?'} remaining</td></tr>
                        <tr><td>Energy Delta</td><td class="${eDeltaColor}">${eDeltaStr} (verify - planned)</td></tr>
                    </table>
                </div>
            `;

            // Queue comparison table
            if (v.queueComparison && v.queueComparison.length > 0) {
                html += `
                    <div class="jta-cd-detail-section">
                        <div class="jta-cd-detail-section-title">Queue Comparison (Planned vs Actual)</div>
                        <table class="jta-cd-queue-table">
                            <thead><tr>
                                <th>Task</th>
                                <th>Plan Status</th><th>Plan Cost</th>
                                <th>Actual Status</th><th>Actual Cost</th>
                                <th>Delta</th>
                            </tr></thead><tbody>
                `;

                for (const qc of v.queueComparison) {
                    const statusOk = qc.statusMatch ? 'jta-cd-completed' : 'jta-cd-cannot-afford';
                    const deltaStr = qc.delta !== null
                        ? (Math.abs(qc.delta) < 0.05 ? '0' : qc.delta.toFixed(1))
                        : '-';
                    const deltaClass = qc.delta !== null && Math.abs(qc.delta) > 1 ? 'jta-cd-cannot-afford' : '';
                    html += `<tr>
                        <td>${this._truncate(qc.taskName, 25)}</td>
                        <td>${qc.planned?.status ?? '-'}</td>
                        <td>${qc.planned?.energyCost?.toFixed(1) ?? '-'}</td>
                        <td class="${statusOk}">${qc.actual?.status ?? '-'}</td>
                        <td>${qc.actual?.energyCost?.toFixed(1) ?? '-'}</td>
                        <td class="${deltaClass}">${deltaStr}</td>
                    </tr>`;
                }

                html += `</tbody></table></div>`;
            }

            // State comparison
            html += `
                <div class="jta-cd-detail-section">
                    <div class="jta-cd-detail-section-title">Verify State</div>
                    <div class="jta-cd-state-compare">
                        <div class="jta-cd-state-col">
                            <strong>Verify Before</strong>
                            ${this._renderState(v.stateBefore)}
                        </div>
                        <div class="jta-cd-state-col">
                            <strong>Verify After</strong>
                            ${this._renderState(v.stateAfter)}
                        </div>
                    </div>
                </div>
            `;
        }

        // Notes
        if (step.notes && step.notes.length > 0) {
            html += `
                <div class="jta-cd-detail-section">
                    <div class="jta-cd-detail-section-title">Notes</div>
                    <ul class="jta-cd-notes">
                        ${step.notes.map(n => `<li>${n}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        html += `</div>`;
        detailEl.innerHTML = html;

        // Attach expand-iteration button handlers
        for (const btn of detailEl.querySelectorAll('.jta-cd-btn-expand-iter')) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const stepIdx = parseInt(btn.dataset.step);
                const iter = parseInt(btn.dataset.iter);
                const phase = parseInt(btn.dataset.phase);
                this._handleExpandIteration(stepIdx, iter, phase);
            });
        }
    }

    _handleExpandIteration(stepIndex, iteration, phase) {
        const planner = getCostPlanner();
        if (!planner || !this._gameData || !this._sphereLogContent) return;

        // Read current settings from UI
        const settings = {
            normalAttempts: parseInt(this.rootElement.querySelector('.jta-cd-normal-attempts').value) || 1,
            perkAttempts: parseInt(this.rootElement.querySelector('.jta-cd-perk-attempts').value) || 5,
            bossAttempts: parseInt(this.rootElement.querySelector('.jta-cd-boss-attempts').value) || 5,
            traversalAttempts: parseInt(this.rootElement.querySelector('.jta-cd-traversal-attempts').value) || 5,
            adjustXpMult: this.rootElement.querySelector('.jta-cd-adjust-xp')?.checked || false,
            captureSolverDebug: true,
        };

        this._setStatus(`Expanding step ${stepIndex}, iteration ${iteration}...`);

        setTimeout(() => {
            try {
                const result = planner.planCostsWithExpansion(
                    this._gameData, this._sphereLogContent, settings,
                    stepIndex, iteration, phase
                );
                this._lastResult = result;
                this._renderStepList(result.steps);
                this._updateSummary(result);

                // Select the first substep
                const firstSubstep = result.steps.find(s => s.substep && s.stepIndex === stepIndex);
                if (firstSubstep) {
                    this.selectedStepIndex = firstSubstep.displayIndex;
                    this._renderStepList(result.steps);
                    this._renderStepDetail(firstSubstep);
                }

                this._setStatus(`Expanded: step ${stepIndex}, solver iteration ${iteration} (phase ${phase})`);
            } catch (err) {
                log('error', 'Expansion failed:', err);
                this._setStatus(`Error: ${err.message}`);
            }
        }, 10);
    }

    _renderSolverDebug(solverDebug, stepIndex) {
        let html = '';

        // Energy solver entries
        const energyEntries = solverDebug.filter(e => e.type?.startsWith('energy_'));
        if (energyEntries.length > 0) {
            const approx = energyEntries.find(e => e.type === 'energy_initial_approx');
            const result = energyEntries.find(e => e.type === 'energy_result');
            const iters = energyEntries.filter(e => e.type === 'energy_iteration');

            html += `<div style="margin-bottom: 8px;">
                <strong>Energy Solver</strong>`;
            if (approx) {
                html += `<div style="color:#999; margin:2px 0;">Initial approx: costMult=${approx.approxCostMult.toFixed(6)}, actualCost=${approx.actualCost.toFixed(2)}, target=${approx.target.toFixed(2)}</div>`;
                html += `<div style="color:#999; margin:2px 0;">targetEnergy=${approx.targetEnergy.toFixed(2)}, margin=${approx.margin}, progress=${approx.progress.toFixed(4)}, drain=${approx.drain.toFixed(4)}, maxReps=${approx.maxReps}</div>`;
            }
            if (iters.length > 0) {
                html += `<table class="jta-cd-queue-table">
                    <thead><tr><th>Iter</th><th>lo</th><th>hi</th><th>mid</th><th>actualCost</th><th>target</th><th>Decision</th></tr></thead>
                    <tbody>`;
                for (const e of iters) {
                    html += `<tr>
                        <td>${e.iteration}</td><td>${e.lo.toFixed(6)}</td><td>${e.hi.toFixed(6)}</td>
                        <td>${e.mid.toFixed(6)}</td><td>${e.actualCost.toFixed(4)}</td>
                        <td>${e.target.toFixed(4)}</td><td>${e.decision}</td>
                    </tr>`;
                }
                html += `</tbody></table>`;
            }
            if (result) {
                html += `<div style="color:#6cba6c; margin:2px 0;">Result: costMult=${result.finalCostMult.toFixed(6)} (${result.totalIterations} iterations)</div>`;
            }
            html += `</div>`;
        }

        // Phase 1: attempts solver
        const phase1 = solverDebug.filter(e => e.type === 'attempts_phase1');
        const phase1Result = solverDebug.find(e => e.type === 'attempts_phase1_result');
        if (phase1.length > 0) {
            html += `<div style="margin-bottom: 8px;">
                <strong>Phase 1: costMult binary search (target: ${phase1Result?.targetAttempts ?? '?'} attempts)</strong>
                <table class="jta-cd-queue-table">
                    <thead><tr><th>Iter</th><th>costMult</th><th>Attempts</th><th>Best</th><th>Best Att.</th><th>Decision</th><th></th></tr></thead>
                    <tbody>`;
            for (const e of phase1) {
                html += `<tr>
                    <td>${e.iteration}</td><td>${e.candidateCost.toFixed(4)}</td>
                    <td>${e.attempts}</td><td>${e.bestCost?.toFixed(4) ?? '-'}</td>
                    <td>${e.bestAttempts}</td><td>${e.decision}</td>
                    <td><button class="jta-cd-btn-expand-iter" data-step="${stepIndex}" data-iter="${e.iteration}" data-phase="1" title="Show inner simulation substeps">\u25B6</button></td>
                </tr>`;
            }
            html += `</tbody></table>`;
            if (phase1Result) {
                html += `<div style="color:#6cba6c; margin:2px 0;">Result: costMult=${phase1Result.finalCostMult.toFixed(6)}, bestAttempts=${phase1Result.bestAttempts}/${phase1Result.targetAttempts}</div>`;
            }
            html += `</div>`;
        }

        // Phase 2/3: xpMult solver
        const separator = solverDebug.find(e => e.type === 'phase_separator');
        const phase2 = solverDebug.filter(e => e.type === 'attempts_phase2');
        const phase3 = solverDebug.filter(e => e.type === 'attempts_phase3');
        const xpPhaseEntries = phase3.length > 0 ? phase3 : phase2;
        if (xpPhaseEntries.length > 0) {
            const phaseNum = phase3.length > 0 ? 3 : 2;
            const direction = phase3.length > 0 ? 'increase XP to reduce attempts' : 'reduce XP to increase attempts';
            const extra = separator?.attemptsAtFloor !== undefined ? `, attempts at floor=${separator.attemptsAtFloor}` : '';
            html += `<div style="margin-bottom: 8px;">
                <strong>Phase ${phaseNum}: xpMult binary search &mdash; ${direction} (${separator?.taskCount ?? '?'} tasks${extra})</strong>
                <table class="jta-cd-queue-table">
                    <thead><tr><th>Iter</th><th>xpMult</th><th>Attempts</th><th>Best xpMult</th><th>Decision</th><th></th></tr></thead>
                    <tbody>`;
            for (const e of xpPhaseEntries) {
                html += `<tr>
                    <td>${e.iteration}</td><td>${e.xpMultiplier.toFixed(6)}</td>
                    <td>${e.attempts}</td><td>${e.bestXpMult?.toFixed(6) ?? '-'}</td>
                    <td>${e.decision}</td>
                    <td><button class="jta-cd-btn-expand-iter" data-step="${stepIndex}" data-iter="${e.iteration}" data-phase="${phaseNum}" title="Show inner simulation substeps">\u25B6</button></td>
                </tr>`;
            }
            html += `</tbody></table></div>`;
        }

        return html || '<div style="color:#999;">No solver debug data</div>';
    }

    _renderState(state) {
        if (!state) return '<em>N/A</em>';
        const skills = Object.entries(state.skillLevels || {})
            .filter(([, v]) => v > 0)
            .map(([k, v]) => `${k}:${v}`)
            .join(', ');
        return `
            <div>MaxEnergy: ${state.maxEnergy?.toFixed(1) ?? '?'}</div>
            <div>HighestZone: ${state.highestZone ?? '?'}</div>
            <div>Perks: ${state.perks?.length ?? 0}</div>
            <div>Skills: ${skills || 'none'}</div>
        `;
    }

    _truncate(str, maxLen) {
        if (!str) return '';
        return str.length > maxLen ? str.substring(0, maxLen - 1) + '\u2026' : str;
    }

    // =========================================================================
    // Cleanup
    // =========================================================================

    _onDestroy() {
        for (const unsub of this.subscriptions) {
            if (typeof unsub === 'function') unsub();
        }
        this.subscriptions = [];
    }
}
