// loopRenderer.js
import { createUniversalLogger } from '../../app/core/universalLogger.js';
import discoveryStateSingleton from '../discovery/singleton.js';
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import { createSnapshotInterface } from '../shared/snapshotInterface.js';
import { analyzeQueue } from '../shared/queueAnalysis.js';
import { getCostDataManager } from './index.js';

const logger = createUniversalLogger('loopUI:Renderer');

/**
 * LoopRenderer
 *
 * Handles rendering of the loops panel UI.
 * Separates rendering logic from event handling and state management.
 *
 * Responsibilities:
 * - Orchestrate rendering of the entire panel
 * - Update mana display
 * - Update current action progress display
 * - Manage visibility of panel sections
 * - Group and organize actions for display
 */
export class LoopRenderer {
  constructor(expansionStateManager, displaySettingsManager, rootElement, buildRegionBlockFn, loopUI) {
    this.expansionState = expansionStateManager;
    this.displaySettings = displaySettingsManager;
    this.rootElement = rootElement;
    this.buildRegionBlockFn = buildRegionBlockFn; // Callback to build region blocks
    this.loopUI = loopUI; // Reference to LoopUI for accessing structureBuilt flag

    logger.debug('LoopRenderer constructed');
  }

  /**
   * Render the entire loop panel
   * @param {boolean} isLoopModeActive - Whether loop mode is active
   * @param {Array} actionQueue - Current action queue
   * @param {Object} loopState - Loop state instance
   */
  renderLoopPanel(isLoopModeActive, actionQueue, loopState) {
    logger.info(`Rendering panel. Active: ${isLoopModeActive}`);

    const container = this.rootElement;
    if (!container) {
      logger.error('Container rootElement not found');
      return;
    }

    // Check if cost data is loaded (takes priority over all other states)
    const costDataManager = getCostDataManager();
    if (costDataManager && !costDataManager.isLoaded()) {
      this._showNoCostDataMessage();
      return;
    }
    this._hideNoCostDataMessage();

    // Manage visibility based on loop mode
    if (!isLoopModeActive) {
      this._showInactiveMessage();
      return;
    } else {
      this._hideInactiveMessage();
    }

    // Get regions area
    const regionsArea = container.querySelector('#loop-regions-area');
    if (!regionsArea) {
      logger.error('Could not find #loop-regions-area');
      return;
    }

    // Get discovered regions
    const discoveredRegions = discoveryStateSingleton.discoveredRegions;
    if (!discoveredRegions || discoveredRegions.size === 0) {
      regionsArea.innerHTML = '<div class="no-regions-message">No regions discovered yet.</div>';
      this.updateManaDisplay(loopState.currentMana, loopState.maxMana);
      this.updateCurrentActionDisplay(loopState.currentAction, loopState);
      return;
    }

    // Clear regions area
    regionsArea.innerHTML = '';

    // Get snapshot and static data for rendering
    const snapshot = stateManager.getSnapshot();
    const staticData = stateManager.getStaticData();
    const snapshotInterface = createSnapshotInterface(snapshot, staticData);
    const currentActionIndex = loopState.currentActionIndex || 0;
    const useLoopColorblind = this.displaySettings.getColorblindMode();

    // Run queue analysis for predicted costs/remaining mana
    const analysis = analyzeQueue(actionQueue, loopState);
    this._lastAnalysis = analysis;

    // Group actions by region, ensuring the start region always has an entry
    const regionGroups = this.groupActionsByRegion(actionQueue);
    const startRegion = this.loopUI?.getPrimaryStartRegion?.();
    if (startRegion && !regionGroups.has(startRegion)) {
      regionGroups.set(startRegion, []);
      // Note: Do NOT auto-expand the start region here. The renderer should not
      // mutate expansion state during rendering, as it overrides user actions like
      // Collapse All and header click toggles. Initial expansion is handled by
      // toggleLoopMode() when loop mode is first entered.
    }

    // Check if compact view is active
    if (this._compactView) {
      this._renderCompactView(regionsArea, actionQueue, analysis);
    } else {
      // Render each region block (normal view)
      regionGroups.forEach((actions, regionName) => {
        const regionStaticData = staticData?.regions?.get(regionName);
        const isStartRegion = this.loopUI?.playerStateAPI?.isStartRegion?.(regionName);
        if (!regionStaticData && !isStartRegion) {
          logger.warn(`No static data found for region: ${regionName}`);
          return;
        }

        const isExpanded = this.expansionState.isRegionExpanded(regionName);

        // Delegate to callback for actual block construction
        const regionBlock = this.buildRegionBlockFn(
          regionName,
          regionStaticData,
          actions,
          snapshot,
          snapshotInterface,
          useLoopColorblind,
          isExpanded,
          currentActionIndex,
          analysis.entries
        );

        if (regionBlock) {
          regionsArea.appendChild(regionBlock);
        }
      });
    }

    // Update displays
    this.updateManaDisplay(loopState.currentMana, loopState.maxMana);
    this.updateCurrentActionDisplay(loopState.currentAction, loopState);

    // Update expand/collapse button
    this._updateExpandCollapseButton(regionGroups);

    logger.info('Panel rendered');
  }

  /**
   * Group actions by region
   * @param {Array} actionQueue - Action queue
   * @returns {Map} Map of regionName -> actions array
   */
  groupActionsByRegion(actionQueue) {
    const regionGroups = new Map();

    actionQueue.forEach((pathEntry, index) => {
      // For move actions, group under the source region (where we're moving FROM)
      // For other actions, group under the source region (where the action occurs)
      let groupRegion;
      if (pathEntry.type === 'regionMove') {
        groupRegion = pathEntry.sourceRegion || pathEntry.destinationRegion;
      } else {
        groupRegion = pathEntry.sourceRegion;
      }

      if (!regionGroups.has(groupRegion)) {
        regionGroups.set(groupRegion, []);
      }
      regionGroups.get(groupRegion).push({
        pathEntry,
        index,
        instanceNumber: pathEntry.instanceNumber || 0
      });

      // Ensure destination regions of moves also have a group entry,
      // so a region block is rendered for them (even if no actions exist there yet)
      if (pathEntry.type === 'regionMove' && pathEntry.destinationRegion &&
          !regionGroups.has(pathEntry.destinationRegion)) {
        regionGroups.set(pathEntry.destinationRegion, []);
      }
    });

    return regionGroups;
  }

  /**
   * Update mana display
   * @param {number} current - Current mana
   * @param {number} max - Max mana
   */
  updateManaDisplay(current, max) {
    // Guard: Don't try to update if structure isn't built yet
    if (!this.loopUI?.structureBuilt) {
      logger.debug('Skipping mana display update - structure not yet built');
      return;
    }

    const manaContainer = this.rootElement?.querySelector('.mana-container');
    if (!manaContainer) {
      logger.warn('Mana container not found');
      return;
    }

    const manaBar = manaContainer.querySelector('.mana-bar-fill');
    const manaText = manaContainer.querySelector('.mana-text');

    if (!manaBar || !manaText) {
      logger.warn('Mana bar or text element not found');
      return;
    }

    // Calculate percentage
    const percentage = max > 0 ? (current / max) * 100 : 0;

    // Update bar
    manaBar.style.width = `${percentage}%`;

    // Update text
    manaText.textContent = `${Math.floor(current)}/${Math.floor(max)}`;

    logger.debug(`Mana updated: ${current}/${max} (${percentage.toFixed(1)}%)`);
  }

  /**
   * Update current action display
   * Matches original implementation exactly
   * @param {Object|null} action - Current action or null
   * @param {Object} loopState - Loop state instance
   * @param {Function} getActionQueueFn - Callback to get action queue
   * @param {Function} estimateActionCostFn - Callback to estimate action cost
   * @param {Function} getActionDisplayNameFn - Callback to get action display name
   * @param {boolean} isLoopModeActive - Whether loop mode is active
   */
  updateCurrentActionDisplay(action, loopState, getActionQueueFn, estimateActionCostFn, getActionDisplayNameFn, isLoopModeActive) {
    const actionContainer = this.rootElement?.querySelector('#current-action-container');

    if (!actionContainer || !isLoopModeActive) {
      // Only update if active - clear if not active
      if (actionContainer) actionContainer.innerHTML = '';
      return;
    }

    if (!action) {
      actionContainer.innerHTML = `<div class="no-action-message">Queue ready</div>`;
      return;
    }

    // Calculate action cost and progress
    const actionCost = estimateActionCostFn(action);
    const manaCostSoFar = (action.progress / 100) * actionCost;
    const displayIndex = loopState.currentActionIndex + 1;
    const actionName = getActionDisplayNameFn(action);

    const queueLength = getActionQueueFn().length;
    actionContainer.innerHTML = `
      <div class="current-action-label">
        <span>Action ${displayIndex} of ${queueLength}: ${actionName}</span>
        <span class="mana-cost">Progress: ${Math.floor(manaCostSoFar)} of ${parseFloat(actionCost.toFixed(1))} mana</span>
      </div>
      <div class="current-action-progress">
        <div class="current-action-progress-bar" style="width: ${action.progress}%"></div>
      </div>
    `;

    logger.debug(`Current action updated: ${actionName} - ${action.progress.toFixed(1)}%`);
  }

  /**
   * Show inactive message and hide active areas
   * @private
   */
  /**
   * Show "no cost data" message with Generate/Accept buttons,
   * replacing the entire panel content.
   * @private
   */
  _showNoCostDataMessage() {
    const controls = this.rootElement.querySelector('.loop-controls');
    const fixedArea = this.rootElement.querySelector('#loop-fixed-area');
    const regionsArea = this.rootElement.querySelector('#loop-regions-area');

    if (controls) controls.style.display = 'none';
    if (fixedArea) fixedArea.style.display = 'none';
    if (regionsArea) regionsArea.style.display = 'none';

    // Don't recreate if already showing
    if (this.rootElement.querySelector('.loop-no-costs-message')) return;

    const msg = document.createElement('div');
    msg.className = 'loop-no-costs-message';
    msg.style.cssText = 'padding: 24px; text-align: center; color: #bbb; flex: 1;';
    msg.innerHTML = `
      <div style="font-size: 1.1em; margin-bottom: 12px; color: #e0e0e0;">
        No cost data loaded
      </div>
      <div style="margin-bottom: 16px; font-size: 0.9em; color: #999; line-height: 1.5;">
        Cost data determines mana costs for moving between regions and checking locations.<br>
        Generate costs from the sphere log, or accept default costs (regions: 50, locations: 100).
      </div>
      <div style="margin-bottom: 8px; font-size: 0.85em; color: #aaa; text-align: center;">
        Either button will automatically enter Loop mode. To exit later, expand the Controls section and click Exit Loop Mode.
      </div>
      <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
        <button id="loop-ui-generate-costs-inline" class="button" style="padding: 6px 16px;">Generate Costs</button>
        <button id="loop-ui-accept-defaults" class="button" style="padding: 6px 16px;">Accept Defaults</button>
      </div>
      <div id="loop-ui-cost-progress" style="display: none; margin-top: 12px;">
        <div style="margin-bottom: 4px; font-size: 0.85em; color: #aaa;">
          <span id="loop-ui-cost-progress-label">Generating...</span>
        </div>
        <div style="background: #333; border-radius: 3px; height: 6px; overflow: hidden;">
          <div id="loop-ui-cost-progress-bar" style="background: #6a6; height: 100%; width: 0%; transition: width 0.2s;"></div>
        </div>
      </div>
    `;

    // Insert after controls (or prepend if controls missing)
    if (controls) {
      controls.insertAdjacentElement('afterend', msg);
    } else {
      this.rootElement.prepend(msg);
    }

    // Wire up buttons via loopUI callbacks
    msg.querySelector('#loop-ui-generate-costs-inline')?.addEventListener('click', () => {
      this.loopUI?._handleGenerateCostsInline();
    });
    msg.querySelector('#loop-ui-accept-defaults')?.addEventListener('click', () => {
      this.loopUI?._handleAcceptDefaults();
    });
  }

  /**
   * Hide the "no cost data" message and restore normal panel content.
   * @private
   */
  _hideNoCostDataMessage() {
    const msg = this.rootElement.querySelector('.loop-no-costs-message');
    if (msg) msg.remove();

    const controls = this.rootElement.querySelector('.loop-controls');
    const fixedArea = this.rootElement.querySelector('#loop-fixed-area');
    const regionsArea = this.rootElement.querySelector('#loop-regions-area');

    if (controls) controls.style.display = '';
    if (fixedArea) fixedArea.style.display = '';
    if (regionsArea) regionsArea.style.display = '';
  }

  _showInactiveMessage() {
    const fixedArea = this.rootElement.querySelector('#loop-fixed-area');
    const regionsArea = this.rootElement.querySelector('#loop-regions-area');
    let inactiveMessage = this.rootElement.querySelector('.loop-inactive-message');

    if (fixedArea) fixedArea.style.display = 'none';
    if (regionsArea) regionsArea.style.display = 'none';

    if (!inactiveMessage) {
      inactiveMessage = document.createElement('div');
      inactiveMessage.className = 'loop-inactive-message';
      inactiveMessage.innerHTML = `
        <div>Loop Mode is not active. Click "Enter Loop Mode" to begin.</div>
        <style>
          .loop-inactive-message { padding: 20px; text-align: center; color: #888; font-style: italic; }
        </style>
      `;
      const topControls = this.rootElement.querySelector('.loop-controls');
      if (topControls) {
        topControls.insertAdjacentElement('afterend', inactiveMessage);
      } else {
        this.rootElement.prepend(inactiveMessage);
      }
    }
    inactiveMessage.style.display = 'block';
  }

  /**
   * Hide inactive message and show active areas
   * @private
   */
  _hideInactiveMessage() {
    const fixedArea = this.rootElement.querySelector('#loop-fixed-area');
    const regionsArea = this.rootElement.querySelector('#loop-regions-area');
    const inactiveMessage = this.rootElement.querySelector('.loop-inactive-message');

    if (fixedArea) fixedArea.style.display = 'block';
    if (regionsArea) regionsArea.style.display = 'block';
    if (inactiveMessage) inactiveMessage.style.display = 'none';
  }

  /**
   * Update expand/collapse button text
   * @param {Map} regionGroups - Region groups map
   * @private
   */
  _updateExpandCollapseButton(regionGroups) {
    const expandCollapseBtn = this.rootElement.querySelector('#loop-ui-expand-collapse-all');
    if (!expandCollapseBtn) return;

    const allExpanded = Array.from(regionGroups.keys()).every(
      regionName => this.expansionState.isRegionExpanded(regionName)
    );

    expandCollapseBtn.textContent = allExpanded ? 'Collapse All' : 'Expand All';
  }

  /**
   * Toggle compact view mode
   */
  toggleCompactView() {
    this._compactView = !this._compactView;
    return this._compactView;
  }

  /**
   * Get current compact view state
   */
  get isCompactView() {
    return !!this._compactView;
  }

  /**
   * Render the compact view — flat table of all actions
   * @param {HTMLElement} container - The regions area container
   * @param {Array} actionQueue - Full action queue
   * @param {Object} analysis - Queue analysis result
   * @private
   */
  _renderCompactView(container, actionQueue, analysis) {
    const table = document.createElement('div');
    table.className = 'loop-compact-table';

    // Header row
    const header = document.createElement('div');
    header.className = 'loop-compact-header';
    header.innerHTML = `
      <span class="loop-action-cancel-placeholder"></span>
      <span class="loop-action-index">#</span>
      <span class="loop-action-name">Action</span>
      <div class="loop-action-right-group">
        <span class="loop-action-cost">Cost</span>
        <span class="loop-action-remaining">Remaining</span>
        <span class="loop-action-time">Time</span>
        <span class="loop-action-status">Status</span>
      </div>
    `;
    table.appendChild(header);

    // Use the block builder to create entries (reuses same format as region view)
    const blockBuilder = this.loopUI?.loopBlockBuilder;
    if (blockBuilder) {
      for (const entry of analysis.entries) {
        // Find the original pathEntry from actionQueue
        const pathEntry = actionQueue[entry.index] || actionQueue.find(a => a.pathIndex === entry.pathIndex);
        if (!pathEntry) continue;

        const actionEl = blockBuilder.createActionEntry(pathEntry, entry.index, entry);
        if (actionEl) {
          table.appendChild(actionEl);
        }
      }
    }

    container.appendChild(table);
  }
}

export default LoopRenderer;
