// Queue display panel - dual queue: current list (execution snapshot) + next list (editable queue)
// Per-action controls and drag-and-drop on the next list
import { ActionState } from '../shared/actionQueue/actionTypes.js';

/**
 * Generate a subtle tint color from a group name (zone name).
 * Uses HSL with fixed low saturation/lightness for dark theme.
 */
/**
 * Format energy value for display.
 */
function fmtEnergy(value) {
    if (Math.abs(value) >= 1e6) return (value / 1e6).toFixed(1) + 'M';
    if (Math.abs(value) >= 1e3) return (value / 1e3).toFixed(1) + 'K';
    return Math.round(value).toLocaleString();
}

function truncLabel(name, max) {
    return name.length > max ? name.substring(0, max - 1) + '…' : name;
}

/**
 * Get CSS color class for remaining energy relative to max.
 */
function energyColorClass(remaining, max) {
    if (remaining < 0) return 'aq-pred-insufficient';
    const pct = max > 0 ? remaining / max : 0;
    if (pct > 0.5) return 'aq-pred-good';
    if (pct > 0.1) return 'aq-pred-warn';
    return 'aq-pred-low';
}

function groupTint(group) {
    if (!group) return '';
    let hash = 0;
    for (let i = 0; i < group.length; i++) {
        hash = ((hash << 5) - hash + group.charCodeAt(i)) | 0;
    }
    const hue = ((hash % 360) + 360) % 360;
    return `hsla(${hue}, 40%, 50%, 0.08)`;
}

export class JTAQueuePanelUI {
    /** @type {HTMLElement} */
    #container;

    /** @type {import('../shared/actionQueue/actionQueue.js').ActionQueue|null} */
    #queue = null;

    /** @type {import('../shared/actionQueue/executionSnapshot.js').ExecutionSnapshot|null} */
    #snapshot = null;

    /** @type {Function|null} */
    #onQueueChanged = null;

    /** @type {number} Amount to add/remove per click */
    #addAmount = 1;

    /** @type {string|null} entryId being dragged */
    #dragSourceId = null;

    /** @type {Map<string, object>|null} entryId -> prediction */
    #predictions = null;

    /** @type {boolean} */
    #showActuals = false;

    /** @type {boolean} */
    #showComparison = false;

    constructor(container) {
        this.#container = container;
        this.#render();
    }

    /**
     * Bind to a queue for display
     * @param {import('../shared/actionQueue/actionQueue.js').ActionQueue} queue
     * @param {Function} [onQueueChanged] - Called when queue is modified by UI
     */
    bind(queue, onQueueChanged) {
        this.#queue = queue;
        this.#onQueueChanged = onQueueChanged || null;
        this.refresh();
    }

    /**
     * Set the execution snapshot for current list display
     * @param {import('../shared/actionQueue/executionSnapshot.js').ExecutionSnapshot|null} snapshot
     */
    setSnapshot(snapshot) {
        this.#snapshot = snapshot;
        this.refresh();
    }

    /**
     * Set predictions for next list display
     * @param {Map<string, object>|null} predictions - entryId -> prediction
     */
    setPredictions(predictions) {
        this.#predictions = predictions;
        this.#refreshNextList();
    }

    /**
     * Set display options for debug features
     * @param {{ showActuals?: boolean, showComparison?: boolean }} options
     */
    setDisplayOptions(options) {
        this.#showActuals = options.showActuals ?? false;
        this.#showComparison = options.showComparison ?? false;
        this.refresh();
    }

    /** Refresh the display */
    refresh() {
        this.#refreshCurrentList();
        this.#refreshComparison();
        this.#refreshNextList();
    }

    /** Render the current list (execution snapshot, read-only) */
    #refreshCurrentList() {
        const section = this.#container.querySelector('.aq-current-section');
        if (!section) return;

        if (!this.#snapshot || this.#snapshot.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        const list = section.querySelector('.aq-current-list');
        if (!list) return;

        const entries = this.#snapshot.getEntries();
        const cursor = this.#snapshot.cursor;

        list.innerHTML = entries.map((entry, idx) => {
            const status = this.#snapshot.getStatus(entry.entryId);
            const state = status ? status.state : '';
            const stateClass = status ? `aq-state-${state}` : '';
            const isCurrent = idx === cursor && this.#snapshot.running;
            const currentClass = isCurrent ? 'aq-current' : '';

            const loopsCompleted = status ? (status.loopsCompleted || 0) : 0;
            const loopsTotal = entry.loops;
            const loopDisplay = loopsTotal > 1 ? `${loopsCompleted}/${loopsTotal}` : '';

            // Progress bar width (for completed loops within a multi-loop action)
            let progressPct = 0;
            if (state === ActionState.COMPLETED) {
                progressPct = 100;
            } else if (state === ActionState.ACTIVE && loopsTotal > 1) {
                progressPct = (loopsCompleted / loopsTotal) * 100;
            } else if (state === ActionState.ACTIVE) {
                progressPct = 50; // indeterminate-ish for single-loop active
            }

            // Actuals display (when enabled and entry has data)
            let actualsHtml = '';
            if (this.#showActuals && status) {
                const parts = [];
                if (status.actualEnergyCost !== undefined) {
                    const costSign = status.actualEnergyCost >= 0 ? '-' : '+';
                    parts.push(`<span class="aq-actual-cost">${costSign}${fmtEnergy(Math.abs(status.actualEnergyCost))}</span>`);
                }
                if (status.energyAfter !== undefined) {
                    parts.push(`<span class="aq-actual-remaining">${fmtEnergy(status.energyAfter)}</span>`);
                }
                let skillInner = '';
                if (status.actualSkillGains && Object.keys(status.actualSkillGains).length > 0) {
                    const skillParts = Object.values(status.actualSkillGains).map(g =>
                        `<span class="aq-actual-skill">+${g.gained.toFixed(1)} ${g.name.slice(0, 3)}</span>`
                    );
                    skillInner = skillParts.join(' ');
                }
                parts.push(`<span class="aq-actual-skills">${skillInner}</span>`);
                if (status.actualTimeMs !== undefined) {
                    parts.push(`<span class="aq-actual-time">${(status.actualTimeMs / 1000).toFixed(1)}s</span>`);
                }
                if (parts.length > 0) {
                    actualsHtml = `<span class="aq-actuals">${parts.join(' ')}</span>`;
                }
            }

            // Build tooltip text
            const tipParts = [`${entry.label} (${entry.actionType})`];
            if (loopsTotal > 1) tipParts.push(`Loops: ${loopsCompleted}/${loopsTotal}`);
            tipParts.push(`State: ${state || 'pending'}`);
            if (status?.error) tipParts.push(`Error: ${status.error}`);
            if (this.#showActuals && status) {
                if (status.actualEnergyCost !== undefined) {
                    tipParts.push(`Energy: -${fmtEnergy(Math.abs(status.actualEnergyCost))} → ${fmtEnergy(status.energyAfter ?? 0)} remaining`);
                }
                if (status.actualSkillGains) {
                    for (const g of Object.values(status.actualSkillGains)) {
                        tipParts.push(`${g.name}: +${g.gained.toFixed(1)} levels`);
                    }
                }
                if (status.actualTimeMs !== undefined) {
                    tipParts.push(`Time: ${(status.actualTimeMs / 1000).toFixed(1)}s`);
                }
            }
            const tooltip = tipParts.join('\n');

            const zoneNum = entry.zoneId !== undefined ? String(entry.zoneId + 1) : '';
            const nameCol = truncLabel(entry.label, 20);

            return `<div class="aq-current-entry ${stateClass} ${currentClass}" title="${tooltip.replace(/"/g, '&quot;')}">
                <div class="aq-progress-bar" style="width: ${progressPct}%"></div>
                <span class="aq-entry-index">${idx + 1}</span>
                <span class="aq-col-zone">${zoneNum}</span>
                <span class="aq-col-name">${nameCol}</span>
                ${actualsHtml}
                <span class="aq-current-loops">${loopDisplay}</span>
                <span class="aq-entry-state">${state}</span>
            </div>`;
        }).join('');
    }

    /** Render the comparison table (predicted vs actual, debug) */
    #refreshComparison() {
        const section = this.#container.querySelector('.aq-comparison-section');
        if (!section) return;

        if (!this.#showComparison || !this.#snapshot) {
            section.style.display = 'none';
            return;
        }

        const frozenPreds = this.#snapshot.frozenPredictions;
        if (!frozenPreds || frozenPreds.size === 0) {
            section.style.display = 'none';
            return;
        }

        const entries = this.#snapshot.getEntries();
        const rows = entries.map(entry => {
            const status = this.#snapshot.getStatus(entry.entryId);
            const pred = frozenPreds.get(entry.entryId);
            if (!status || !pred) return null;
            if (status.state !== ActionState.COMPLETED && status.state !== ActionState.FAILED) return null;

            const predCost = pred.energyCost;
            const actCost = status.actualEnergyCost ?? null;
            const deltaCost = (actCost !== null) ? actCost - predCost : null;

            // Skill comparison
            const predSkills = pred.skillGains || {};
            const actSkills = status.actualSkillGains || {};
            const allSkillIds = new Set([
                ...Object.keys(predSkills).map(Number),
                ...Object.keys(actSkills).map(Number),
            ]);

            const skillComps = [];
            for (const sid of allSkillIds) {
                const p = predSkills[sid];
                const a = actSkills[sid];
                const pVal = p ? p.gained : 0;
                const aVal = a ? a.gained : 0;
                const name = (p || a).name.slice(0, 3);
                const delta = aVal - pVal;
                skillComps.push({ name, pred: pVal, actual: aVal, delta });
            }

            return { entry, predCost, actCost, deltaCost, skillComps };
        }).filter(Boolean);

        if (rows.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = '';
        const body = section.querySelector('.aq-comparison-body');

        body.innerHTML = `<table class="aq-comp-table">
            <thead><tr>
                <th>Entry</th>
                <th>Pred E</th>
                <th>Act E</th>
                <th>\u0394E</th>
                <th>Skills</th>
            </tr></thead>
            <tbody>${rows.map(r => {
                const deltaClass = r.deltaCost === null ? '' :
                    Math.abs(r.deltaCost) < 0.5 ? 'aq-comp-exact' :
                    r.deltaCost > 0 ? 'aq-comp-worse' : 'aq-comp-better';

                const skillsHtml = r.skillComps.map(s => {
                    const dSign = s.delta >= 0 ? '+' : '';
                    return `${s.name}: ${s.pred.toFixed(1)}\u2192${s.actual.toFixed(1)} (${dSign}${s.delta.toFixed(1)})`;
                }).join(', ');

                return `<tr>
                    <td>${r.entry.label}</td>
                    <td>${fmtEnergy(r.predCost)}</td>
                    <td>${r.actCost !== null ? fmtEnergy(r.actCost) : '\u2014'}</td>
                    <td class="${deltaClass}">${r.deltaCost !== null ? (r.deltaCost > 0 ? '+' : '') + fmtEnergy(r.deltaCost) : '\u2014'}</td>
                    <td class="aq-comp-skills">${skillsHtml || '\u2014'}</td>
                </tr>`;
            }).join('')}</tbody>
        </table>`;
    }

    /** Render the next list (editable queue with controls) */
    #refreshNextList() {
        const list = this.#container.querySelector('.aq-next-list');
        if (!list || !this.#queue) return;

        const entries = this.#queue.getEntries();
        if (entries.length === 0) {
            list.innerHTML = '<div class="aq-empty">Queue is empty. Add actions from the Actions panel.</div>';
            return;
        }

        list.innerHTML = entries.map((entry, idx) => {
            const disabledClass = entry.disabled ? 'aq-disabled' : '';
            const loopText = entry.loops > 1 ? ` x${entry.loops}` : '';
            const tint = groupTint(entry.group);
            const tintStyle = tint ? `background: ${tint};` : '';

            // Prediction display
            let predHtml = '';
            let predTooltip = '';
            const pred = this.#predictions?.get(entry.entryId);
            if (pred && !entry.disabled) {
                const costSign = pred.energyCost >= 0 ? '-' : '+';
                const costAbs = Math.abs(pred.energyCost);
                const remainClass = energyColorClass(pred.energyRemaining, pred.energyRemaining + pred.energyCost);
                const insufficientClass = !pred.canComplete ? 'aq-pred-insufficient' : '';

                // Skill gains inline (compact: "+2.3 Com +1.0 Str")
                let skillInner = '';
                if (pred.skillGains && Object.keys(pred.skillGains).length > 0) {
                    const parts = Object.values(pred.skillGains).map(g =>
                        `<span class="aq-pred-skill">+${g.gained.toFixed(1)} ${g.name.slice(0, 3)}</span>`
                    );
                    skillInner = parts.join(' ');
                }
                const skillHtml = `<span class="aq-pred-skills">${skillInner}</span>`;

                predHtml = `<span class="aq-prediction ${insufficientClass}">
                    <span class="aq-pred-cost">${costSign}${fmtEnergy(costAbs)}</span>
                    <span class="aq-pred-remaining ${remainClass}">${fmtEnergy(pred.energyRemaining)}</span>
                    ${skillHtml}
                </span>`;

                // Detailed tooltip
                const tipParts = [`Energy: ${costSign}${fmtEnergy(costAbs)} → ${fmtEnergy(pred.energyRemaining)} remaining`];
                if (pred.skillGains) {
                    for (const g of Object.values(pred.skillGains)) {
                        tipParts.push(`${g.name}: +${g.gained.toFixed(1)} levels`);
                    }
                }
                if (pred.note) tipParts.push(pred.note);
                predTooltip = tipParts.join('\n');
            }

            const titleAttr = predTooltip ? ` title="${predTooltip.replace(/"/g, '&quot;')}"` : '';
            const zoneNum = entry.zoneId !== undefined ? String(entry.zoneId + 1) : '';
            const nameCol = truncLabel(entry.label, 20) + loopText;

            return `<div class="aq-entry ${disabledClass}" data-entry-id="${entry.entryId}" data-index="${idx}" draggable="true" style="${tintStyle}"${titleAttr}>
                <span class="aq-entry-index">${idx + 1}</span>
                <span class="aq-col-zone">${zoneNum}</span>
                <span class="aq-col-name">${nameCol}</span>
                ${predHtml}
                <div class="aq-entry-buttons">
                    <button class="aq-btn aq-btn-up" data-action="up" title="Move up">&uarr;</button>
                    <button class="aq-btn aq-btn-down" data-action="down" title="Move down">&darr;</button>
                    <button class="aq-btn aq-btn-plus" data-action="plus" title="Add loops (+${this.#addAmount})">+</button>
                    <button class="aq-btn aq-btn-minus" data-action="minus" title="Remove loops (-${this.#addAmount})">&minus;</button>
                    <button class="aq-btn aq-btn-disable" data-action="disable" title="${entry.disabled ? 'Enable' : 'Disable'}">${entry.disabled ? '&#x25cb;' : '&#x2298;'}</button>
                    <button class="aq-btn aq-btn-remove" data-action="remove" title="Remove">&times;</button>
                </div>
            </div>`;
        }).join('');
    }

    /** @private */
    #render() {
        this.#container.innerHTML = `
            <div class="aq-queue-panel">
                <details class="aq-current-section" style="display: none; margin-bottom: 6px;" open>
                    <summary class="aq-section-header" style="cursor: pointer; user-select: none;"><strong>Current</strong></summary>
                    <div class="aq-current-list"></div>
                </details>
                <div class="aq-comparison-section" style="display: none; margin-bottom: 6px; border-bottom: 1px solid #444; padding-bottom: 6px;">
                    <div class="aq-section-header"><strong>Predicted vs Actual</strong></div>
                    <div class="aq-comparison-body"></div>
                </div>
                <details class="aq-next-section" open>
                    <summary class="aq-next-header" style="cursor: pointer; user-select: none; display: flex; align-items: center; gap: 6px;">
                        <strong>Next</strong>
                        <span class="aq-amount-selector" style="margin-left: auto; display: inline-flex; align-items: center; gap: 2px;">
                            <span class="aq-amount-label">&plusmn;</span>
                            <button class="aq-amount-btn aq-amount-active" data-amount="1">1</button>
                            <button class="aq-amount-btn" data-amount="5">5</button>
                            <button class="aq-amount-btn" data-amount="10">10</button>
                            <input type="number" class="aq-amount-input" min="1" max="999999" value="" placeholder="#" title="Custom loop amount" style="width: 40px; background: #333; color: #ccc; border: 1px solid #555; border-radius: 3px; padding: 1px 3px; font-size: 0.75em;">
                        </span>
                    </summary>
                    <div class="aq-next-list" style="padding-bottom: 8px;"></div>
                </details>
            </div>
        `;

        this.#setupAmountSelector();
        this.#setupNextListEvents();
    }

    #setupAmountSelector() {
        const amountSelector = this.#container.querySelector('.aq-amount-selector');

        // Prevent clicks on amount controls from toggling the parent <details>/<summary>
        amountSelector.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        amountSelector.addEventListener('click', (e) => {
            const btn = e.target.closest('.aq-amount-btn');
            if (!btn) return;
            this.#addAmount = parseInt(btn.dataset.amount, 10);
            amountSelector.querySelectorAll('.aq-amount-btn').forEach(b => b.classList.remove('aq-amount-active'));
            btn.classList.add('aq-amount-active');
            amountSelector.querySelector('.aq-amount-input').value = '';
            this.refresh();
        });

        amountSelector.querySelector('.aq-amount-input').addEventListener('change', (e) => {
            const val = parseInt(e.target.value, 10);
            if (val > 0) {
                this.#addAmount = val;
                amountSelector.querySelectorAll('.aq-amount-btn').forEach(b => b.classList.remove('aq-amount-active'));
                this.refresh();
            }
        });
    }

    #setupNextListEvents() {
        const list = this.#container.querySelector('.aq-next-list');

        // Delegated click handler for all entry buttons
        list.addEventListener('click', (e) => {
            const btn = e.target.closest('.aq-btn');
            if (!btn || !this.#queue) return;

            const entryEl = btn.closest('.aq-entry');
            if (!entryEl) return;
            const entryId = entryEl.dataset.entryId;
            const idx = parseInt(entryEl.dataset.index, 10);
            const action = btn.dataset.action;

            switch (action) {
                case 'up':
                    if (idx > 0) {
                        this.#queue.reorder(idx, idx - 1);
                        this.#notifyChanged();
                    }
                    break;
                case 'down':
                    if (idx < this.#queue.length - 1) {
                        this.#queue.reorder(idx, idx + 1);
                        this.#notifyChanged();
                    }
                    break;
                case 'plus': {
                    const entries = this.#queue.getEntries();
                    const entry = entries[idx];
                    if (entry) {
                        const newLoops = Math.min(entry.loops + this.#addAmount, 1e12);
                        this.#queue.updateEntry(entryId, { loops: newLoops });
                        this.#notifyChanged();
                    }
                    break;
                }
                case 'minus': {
                    const entries = this.#queue.getEntries();
                    const entry = entries[idx];
                    if (entry) {
                        const newLoops = Math.max(entry.loops - this.#addAmount, 1);
                        this.#queue.updateEntry(entryId, { loops: newLoops });
                        this.#notifyChanged();
                    }
                    break;
                }
                case 'disable': {
                    const entries = this.#queue.getEntries();
                    const entry = entries[idx];
                    if (entry) {
                        this.#queue.updateEntry(entryId, { disabled: !entry.disabled });
                        this.#notifyChanged();
                    }
                    break;
                }
                case 'remove':
                    this.#queue.remove(entryId);
                    this.#notifyChanged();
                    break;
            }
        });

        // Drag-and-drop
        list.addEventListener('dragstart', (e) => {
            const entryEl = e.target.closest('.aq-entry');
            if (!entryEl) return;
            this.#dragSourceId = entryEl.dataset.entryId;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', entryEl.dataset.entryId);
            entryEl.classList.add('aq-dragging');
        });

        list.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const entryEl = e.target.closest('.aq-entry');
            list.querySelectorAll('.aq-drag-over').forEach(el => el.classList.remove('aq-drag-over'));
            if (entryEl && entryEl.dataset.entryId !== this.#dragSourceId) {
                entryEl.classList.add('aq-drag-over');
            }
        });

        list.addEventListener('dragleave', (e) => {
            const entryEl = e.target.closest('.aq-entry');
            if (entryEl) entryEl.classList.remove('aq-drag-over');
        });

        list.addEventListener('drop', (e) => {
            e.preventDefault();
            list.querySelectorAll('.aq-drag-over').forEach(el => el.classList.remove('aq-drag-over'));
            if (!this.#queue) return;

            const targetEl = e.target.closest('.aq-entry');
            if (!targetEl) return;
            const targetIndex = parseInt(targetEl.dataset.index, 10);

            // Check for external drag from actions panel
            const actionData = e.dataTransfer.getData('application/aq-action');
            if (actionData) {
                try {
                    const parsed = JSON.parse(actionData);
                    if (parsed && parsed.actionType && this.#onExternalDrop) {
                        this.#onExternalDrop(parsed, targetIndex);
                    }
                } catch (err) { /* ignore */ }
                return;
            }

            // Internal reorder
            if (this.#dragSourceId) {
                const fromIndex = this.#queue.findIndex(this.#dragSourceId);
                if (fromIndex !== -1 && fromIndex !== targetIndex) {
                    this.#queue.reorder(fromIndex, targetIndex);
                    this.#notifyChanged();
                }
            }
        });

        list.addEventListener('dragend', () => {
            this.#dragSourceId = null;
            list.querySelectorAll('.aq-dragging').forEach(el => el.classList.remove('aq-dragging'));
            list.querySelectorAll('.aq-drag-over').forEach(el => el.classList.remove('aq-drag-over'));
        });
    }

    /** @type {Function|null} */
    #onExternalDrop = null;

    /**
     * Set a handler for when an action is dragged from the actions panel onto the queue
     * @param {Function} handler - (catalogEntry, targetIndex) => void
     */
    set onExternalDrop(handler) {
        this.#onExternalDrop = handler;
    }

    #notifyChanged() {
        this.refresh();
        if (this.#onQueueChanged) this.#onQueueChanged();
    }
}
