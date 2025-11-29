// loopRenderer.js
import { createUniversalLogger } from '../../app/core/universalLogger.js';
import discoveryStateSingleton from '../discovery/singleton.js';
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import { createStateSnapshotInterface } from '../shared/stateInterface.js';

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

    // If queue is empty, show message
    if (actionQueue.length === 0) {
      regionsArea.innerHTML = '<div class="no-actions-message">No actions queued. Navigate to regions to queue actions.</div>';
      this.updateManaDisplay(loopState.currentMana, loopState.maxMana);
      this.updateCurrentActionDisplay(loopState.currentAction, loopState);
      return;
    }

    // Get snapshot and static data for rendering
    const snapshot = stateManager.getSnapshot();
    const staticData = stateManager.getStaticData();
    const snapshotInterface = createStateSnapshotInterface(snapshot, staticData);
    const currentActionIndex = loopState.currentActionIndex || 0;
    const useLoopColorblind = this.displaySettings.getColorblindMode();

    // Group actions by region
    const regionGroups = this.groupActionsByRegion(actionQueue);

    // Render each region block
    regionGroups.forEach((actions, regionName) => {
      const regionStaticData = staticData?.regions?.[regionName];
      if (!regionStaticData && regionName !== 'Menu') {
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
        currentActionIndex
      );

      if (regionBlock) {
        regionsArea.appendChild(regionBlock);
      }
    });

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
      const regionName = pathEntry.region;
      if (!regionGroups.has(regionName)) {
        regionGroups.set(regionName, []);
      }
      regionGroups.get(regionName).push({
        pathEntry,
        index,
        instanceNumber: pathEntry.instanceNumber || 0
      });
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

    // Add color classes based on percentage
    manaBar.classList.remove('mana-low', 'mana-medium', 'mana-high');
    if (percentage < 25) {
      manaBar.classList.add('mana-low');
    } else if (percentage < 75) {
      manaBar.classList.add('mana-medium');
    } else {
      manaBar.classList.add('mana-high');
    }

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
      actionContainer.innerHTML = `<div class="no-action-message">No action in progress</div>`;
      return;
    }

    // Calculate action cost and progress
    const actionCost = estimateActionCostFn(action);
    const manaCostSoFar = (action.progress / 100) * actionCost;
    const displayIndex = loopState.currentActionIndex + 1;
    const actionName = getActionDisplayNameFn(action);

    // Build HTML to match original implementation
    actionContainer.innerHTML = `
      <div class="current-action-label">
        <span>${actionName}</span>
        <span class="mana-cost">${Math.floor(manaCostSoFar)}/${actionCost} mana</span>
      </div>
      <div class="current-action-progress">
        <div class="current-action-progress-bar" style="width: ${action.progress}%"></div>
        <span class="current-action-value">Action ${displayIndex} of ${getActionQueueFn().length}, Progress: ${Math.floor(manaCostSoFar)} of ${actionCost} mana</span>
      </div>
    `;

    logger.debug(`Current action updated: ${actionName} - ${action.progress.toFixed(1)}%`);
  }

  /**
   * Show inactive message and hide active areas
   * @private
   */
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
}

export default LoopRenderer;
