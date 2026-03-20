/**
 * Loop Stats Panel UI
 *
 * Displays detailed action queue analysis, showing mana costs
 * and predicted remaining mana for each action.
 */

import { getModuleEventBus } from './index.js';
import { queueAnalyzer } from './queueAnalyzer.js';
import loopStateSingleton from '../loops/loopStateSingleton.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('loopStatsUI', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[loopStatsUI] ${message}`, ...data);
  }
}

/**
 * LoopStatsUI class
 * GoldenLayout panel component for displaying loop statistics
 */
export class LoopStatsUI {
  constructor(container, componentState) {
    this.container = container;
    this.componentState = componentState;
    Object.defineProperty(this, 'eventBus', { get: () => getModuleEventBus(), configurable: true });

    // Display settings
    this.showManaCost = false;
    this.showRemainingMana = true;

    // Expansion state for action rows
    this.expandedRows = new Set();

    // Clean analysis from the start of the current loop (before mana is spent)
    this._loopStartAnalysis = null;

    // Reference to loopState singleton
    this.loopState = loopStateSingleton;

    // Event subscriptions
    this.subscriptions = [];

    // Create root element
    this.rootElement = this._createRootElement();
    this.container.element.appendChild(this.rootElement);

    // Subscribe to events
    this._subscribeToEvents();

    // Set up container destroy handler
    this.container.on('destroy', () => {
      this._onDestroy();
    });

    log('info', 'LoopStatsUI initialized');
  }

  getRootElement() {
    return this.rootElement;
  }

  /**
   * Set the loopState reference
   * @param {Object} loopState - The loopState singleton
   */
  setLoopState(loopState) {
    this.loopState = loopState;
    log('info', 'LoopStatsUI: loopState set');
    this._renderPanel();
  }

  /**
   * Create the root DOM element
   * @returns {HTMLElement} Root element
   */
  _createRootElement() {
    const element = document.createElement('div');
    element.classList.add('loop-stats-panel-container', 'panel-container');
    element.style.cssText = 'display: flex; flex-direction: column; height: 100%; overflow: hidden;';

    element.innerHTML = `
      <div class="loop-stats-tabs" style="display: flex; border-bottom: 1px solid #666; padding: 0.5rem; flex-shrink: 0;">
        <button class="loop-stats-tab active" data-tab="mana-costs">Mana Costs</button>
        <button class="loop-stats-tab" data-tab="inventory" disabled>Inventory</button>
      </div>
      <div class="loop-stats-options" style="padding: 0.5rem; border-bottom: 1px solid #444; flex-shrink: 0;">
        <label style="margin-right: 1rem; cursor: pointer;">
          <input type="checkbox" id="loop-stats-show-cost" ${this.showManaCost ? 'checked' : ''}>
          Show mana cost
        </label>
        <label style="cursor: pointer;">
          <input type="checkbox" id="loop-stats-show-remaining" ${this.showRemainingMana ? 'checked' : ''}>
          Show remaining mana
        </label>
      </div>
      <div class="loop-stats-header" style="display: grid; grid-template-columns: 1fr 60px 60px; padding: 0.5rem; background: #333; border-bottom: 1px solid #666; flex-shrink: 0;">
        <span style="font-weight: bold;">Action</span>
        <span style="font-weight: bold; text-align: right;">Prev</span>
        <span style="font-weight: bold; text-align: right;">Curr</span>
      </div>
      <div class="loop-stats-content" style="flex: 1; overflow-y: auto; min-height: 0;">
        <div class="loop-stats-list" id="loop-stats-list">
          <div class="loop-stats-empty" style="padding: 1rem; text-align: center; color: #888;">
            No actions in queue
          </div>
        </div>
      </div>
      <div class="loop-stats-summary" style="padding: 0.5rem; border-top: 1px solid #666; background: #2a2a2a; flex-shrink: 0;">
        <div style="display: flex; justify-content: space-between;">
          <span>Total Cost:</span>
          <span id="loop-stats-total-cost">0</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Final Mana:</span>
          <span id="loop-stats-final-mana">0 / 0</span>
        </div>
      </div>
    `;

    // Attach option listeners
    this._attachOptionListeners(element);

    // Attach tab listeners
    this._attachTabListeners(element);

    return element;
  }

  /**
   * Attach event listeners for display options
   * @param {HTMLElement} element - Root element
   */
  _attachOptionListeners(element) {
    const showCostCheckbox = element.querySelector('#loop-stats-show-cost');
    const showRemainingCheckbox = element.querySelector('#loop-stats-show-remaining');

    if (showCostCheckbox) {
      showCostCheckbox.addEventListener('change', (e) => {
        this.showManaCost = e.target.checked;
        this._renderPanel();
      });
    }

    if (showRemainingCheckbox) {
      showRemainingCheckbox.addEventListener('change', (e) => {
        this.showRemainingMana = e.target.checked;
        this._renderPanel();
      });
    }
  }

  /**
   * Attach event listeners for tabs
   * @param {HTMLElement} element - Root element
   */
  _attachTabListeners(element) {
    const tabs = element.querySelectorAll('.loop-stats-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        if (e.target.disabled) return;

        tabs.forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');

        // Future: Switch tab content
        log('info', 'Tab clicked:', e.target.dataset.tab);
      });
    });
  }

  /**
   * Subscribe to eventBus events
   */
  _subscribeToEvents() {
    const subscribe = (eventName, handler) => {
      const unsubscribe = this.eventBus.subscribe(eventName, handler.bind(this));
      this.subscriptions.push(unsubscribe);
    };

    // Re-analyze when queue updates
    subscribe('loopState:queueUpdated', this._handleQueueUpdated);

    // Re-analyze when mana changes
    subscribe('loopState:manaChanged', this._handleManaChanged);

    // Archive analysis on loop reset
    subscribe('loopState:loopReset', this._handleLoopReset);

    // Re-analyze when XP changes (affects costs)
    subscribe('loopState:xpChanged', this._handleXPChanged);

    // Handle action progress for real-time updates
    subscribe('loopState:progressUpdated', this._handleProgressUpdated);

    log('info', 'LoopStatsUI: Subscribed to events');
  }

  /**
   * Handle queue updated event
   * @param {Object} data - Event data with queue
   */
  _handleQueueUpdated(data) {
    log('info', 'LoopStatsUI: Queue updated, re-rendering');
    this._renderPanel();
  }

  /**
   * Handle mana changed event
   * @param {Object} data - Event data with current/max mana
   */
  _handleManaChanged(data) {
    // Only re-render summary for mana changes
    this._updateSummary();
  }

  /**
   * Handle loop reset event
   */
  _handleLoopReset() {
    log('info', 'LoopStatsUI: Loop reset, archiving start-of-loop analysis');
    // Archive the start-of-loop snapshot as "previous" for comparison.
    // This has clean predictions (full mana, no completed actions) rather than
    // the end-of-loop state where mana is depleted and all values are near zero.
    if (this._loopStartAnalysis) {
      queueAnalyzer.previousAnalysis = this._loopStartAnalysis;
    }
    // Re-render with the freshly reset state
    this._renderPanel();
    // Capture this fresh analysis as the start of the new loop
    this._loopStartAnalysis = queueAnalyzer.currentAnalysis;
  }

  /**
   * Handle XP changed event
   * @param {Object} data - Event data with region and xpData
   */
  _handleXPChanged(data) {
    // XP changes affect cost calculations, re-render
    this._renderPanel();
  }

  /**
   * Handle progress updated event
   * @param {Object} data - Event data with action progress
   */
  _handleProgressUpdated(data) {
    // Update progress display without full re-render
    if (data.action) {
      this._updateActionProgress(data.action);
    }
  }

  /**
   * Render the full panel
   */
  _renderPanel() {
    if (!this.loopState) {
      log('warn', 'LoopStatsUI: Cannot render - loopState not set');
      return;
    }

    const actionQueue = this.loopState.getActionQueue();
    const analysis = queueAnalyzer.analyze(actionQueue, this.loopState);
    const previousAnalysis = queueAnalyzer.getPreviousAnalysis();

    // Capture start-of-loop analysis on first render with actions
    if (!this._loopStartAnalysis && analysis.entries.length > 0) {
      this._loopStartAnalysis = analysis;
    }

    this._renderActionList(analysis, previousAnalysis);
    this._updateSummary(analysis);
  }

  /**
   * Render the action list
   * @param {Object} analysis - Current analysis
   * @param {Object} previousAnalysis - Previous loop analysis
   */
  _renderActionList(analysis, previousAnalysis) {
    const listContainer = this.rootElement.querySelector('#loop-stats-list');
    if (!listContainer) return;

    if (!analysis || analysis.entries.length === 0) {
      listContainer.innerHTML = `
        <div class="loop-stats-empty" style="padding: 1rem; text-align: center; color: #888;">
          No actions in queue
        </div>
      `;
      return;
    }

    const html = analysis.entries.map(entry => {
      const prevEntry = previousAnalysis?.entries?.find(e => e.index === entry.index);
      const isExpanded = this.expandedRows.has(entry.index);

      return this._renderActionRow(entry, prevEntry, isExpanded);
    }).join('');

    listContainer.innerHTML = html;

    // Attach click handlers for expansion
    this._attachRowClickHandlers(listContainer);
  }

  /**
   * Render a single action row
   * @param {Object} entry - Current analysis entry
   * @param {Object} prevEntry - Previous analysis entry (optional)
   * @param {boolean} isExpanded - Whether row is expanded
   * @returns {string} HTML string
   */
  _renderActionRow(entry, prevEntry, isExpanded) {
    // Format data columns based on display options
    let prevValue = '—';
    let currValue = '—';

    if (this.showManaCost && this.showRemainingMana) {
      prevValue = prevEntry ? `${prevEntry.finalCost.toFixed(1)} / ${prevEntry.manaAfterAction.toFixed(1)}` : '—';
      currValue = `${entry.finalCost.toFixed(1)} / ${entry.manaAfterAction.toFixed(1)}`;
    } else if (this.showManaCost) {
      prevValue = prevEntry ? `${prevEntry.finalCost.toFixed(1)}` : '—';
      currValue = `${entry.finalCost.toFixed(1)}`;
    } else if (this.showRemainingMana) {
      prevValue = prevEntry ? `${prevEntry.manaAfterAction.toFixed(1)}` : '—';
      currValue = `${entry.manaAfterAction.toFixed(1)}`;
    }

    // Status classes
    const statusClass = entry.hasInsufficientMana ? 'insufficient-mana' :
                       entry.isDoubledCost ? 'doubled-cost' :
                       entry.isCompleted ? 'completed' : '';

    const progressClass = entry.progress > 0 && entry.progress < 100 ? 'in-progress' : '';

    // Expansion indicator
    const expandIndicator = isExpanded ? '▾' : '▸';

    // Build row HTML
    let html = `
      <div class="loop-stats-row ${statusClass} ${progressClass}"
           data-index="${entry.index}"
           style="display: grid; grid-template-columns: 1fr 60px 60px; padding: 0.5rem; border-bottom: 1px solid #333; cursor: pointer;">
        <span class="loop-stats-action" title="${entry.description}">
          <span class="expand-indicator">${expandIndicator}</span>
          ${entry.truncatedDescription}
        </span>
        <span class="loop-stats-prev" style="text-align: right;">${prevValue}</span>
        <span class="loop-stats-curr" style="text-align: right;">${currValue}</span>
      </div>
    `;

    // Add expanded details if expanded
    if (isExpanded) {
      html += `
        <div class="loop-stats-details" style="padding: 0.5rem 1rem; background: #1a1a1a; border-bottom: 1px solid #333;">
          <div style="display: grid; grid-template-columns: 1fr auto; gap: 0.25rem;">
            <span>Base cost:</span>
            <span>${entry.baseCost.toFixed(1)}</span>
            <span>Level ${entry.level} discount:</span>
            <span>-${entry.levelDiscount.toFixed(1)}</span>
            ${entry.itemPenalties.length > 0 ? entry.itemPenalties.map(p => `
              <span>Missing ${p.item} (L${p.level}):</span>
              <span>+${p.penalty.toFixed(1)}</span>
            `).join('') : ''}
            <span style="font-weight: bold;">Final cost:</span>
            <span style="font-weight: bold;">${entry.finalCost.toFixed(1)}</span>
            <span style="border-top: 1px solid #444; padding-top: 0.25rem;">Remaining:</span>
            <span style="border-top: 1px solid #444; padding-top: 0.25rem; ${entry.hasInsufficientMana ? 'color: #ff6666;' : ''}">${entry.manaAfterAction.toFixed(1)}</span>
          </div>
        </div>
      `;
    }

    return html;
  }

  /**
   * Attach click handlers for row expansion
   * @param {HTMLElement} listContainer - List container element
   */
  _attachRowClickHandlers(listContainer) {
    const rows = listContainer.querySelectorAll('.loop-stats-row');
    rows.forEach(row => {
      row.addEventListener('click', () => {
        const index = parseInt(row.dataset.index, 10);
        if (this.expandedRows.has(index)) {
          this.expandedRows.delete(index);
        } else {
          this.expandedRows.add(index);
        }
        this._renderPanel();
      });
    });
  }

  /**
   * Update the summary section
   * @param {Object} analysis - Analysis data (optional, will fetch if not provided)
   */
  _updateSummary(analysis) {
    if (!analysis && this.loopState) {
      const actionQueue = this.loopState.getActionQueue();
      analysis = queueAnalyzer.analyze(actionQueue, this.loopState);
    }

    if (!analysis) return;

    const totalCostEl = this.rootElement.querySelector('#loop-stats-total-cost');
    const finalManaEl = this.rootElement.querySelector('#loop-stats-final-mana');

    if (totalCostEl) {
      totalCostEl.textContent = `${analysis.totalCost.toFixed(1)}`;
    }

    if (finalManaEl) {
      const manaColor = analysis.finalMana < 0 ? '#ff6666' : '#66ff66';
      finalManaEl.innerHTML = `<span style="color: ${manaColor}">${analysis.finalMana.toFixed(1)}</span> / ${analysis.maxMana.toFixed(1)}`;
    }
  }

  /**
   * Update progress for a specific action
   * @param {Object} action - Action with progress
   */
  _updateActionProgress(action) {
    // Find the row for this action and update its visual progress
    const row = this.rootElement.querySelector(`.loop-stats-row[data-index="${action.pathIndex}"]`);
    if (row) {
      if (action.progress > 0 && action.progress < 100) {
        row.classList.add('in-progress');
      } else {
        row.classList.remove('in-progress');
      }
    }
  }

  /**
   * Get the current analysis data (for testing)
   * @returns {Object} Current analysis
   */
  getAnalysis() {
    return queueAnalyzer.getCurrentAnalysis();
  }

  /**
   * Get the queue analyzer instance (for testing)
   * @returns {QueueAnalyzer} Queue analyzer
   */
  getQueueAnalyzer() {
    return queueAnalyzer;
  }

  /**
   * Cleanup on destroy
   */
  _onDestroy() {
    log('info', 'LoopStatsUI: Destroying');

    // Unsubscribe from all events
    this.subscriptions.forEach(unsubscribe => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
    this.subscriptions = [];

    // Clear state
    this.expandedRows.clear();
    this.loopState = null;
  }
}

export default LoopStatsUI;
