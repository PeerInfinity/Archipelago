// loopBlockBuilder.js
// Builds region blocks for the loops panel following the same pattern as the Regions module
// A region block shows queued actions and compact region details (exits/locations)

import loopState from './loopStateSingleton.js';
import { evaluateRule } from '../shared/ruleEngine.js';
import { getLoopsModuleDispatcher, getCostDataManager } from './index.js';
import { stateManagerProxySingleton } from '../stateManager/index.js';
import discoveryStateSingleton from '../discovery/singleton.js';
import {
  manaColorClass,
  formatTime,
} from '../shared/queueAnalysis.js';
import { proposedLinearFinalCost } from './xpFormulas.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('loopBlockBuilder', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[loopBlockBuilder] ${message}`, ...data);
  }
}

/**
 * LoopBlockBuilder class handles the creation of region block DOM elements for the loops panel
 * Follows the same architectural pattern as RegionBlockBuilder in the Regions module
 */
export class LoopBlockBuilder {
  constructor(loopUI) {
    this.loopUI = loopUI;
  }

  /**
   * Builds a complete region block DOM element
   * @param {string} regionName - Name of the region
   * @param {Object} regionStaticData - Static data for the region
   * @param {Array} actions - Array of actions for this region
   * @param {Object} snapshot - Current state snapshot
   * @param {Object} snapshotInterface - Snapshot interface for rule evaluation
   * @param {boolean} useColorblind - Whether to use colorblind mode
   * @param {boolean} isExpanded - Whether the region is expanded
   * @param {number} currentActionIndex - Index of the current action being processed
   * @returns {HTMLElement} The region block element
   */
  buildRegionBlock(
    regionName,
    regionStaticData,
    actions,
    snapshot,
    snapshotInterface,
    useColorblind,
    isExpanded,
    currentActionIndex,
    analysisEntries = null
  ) {
    // Create outer container
    const regionBlock = document.createElement('div');
    regionBlock.className = 'loop-region-block';
    regionBlock.dataset.region = regionName;
    regionBlock.classList.add(isExpanded ? 'expanded' : 'collapsed');

    // Build header
    const headerEl = this.buildHeader(regionName, isExpanded);
    regionBlock.appendChild(headerEl);

    // Build content (contains actions and region details)
    const contentEl = this.buildContent(
      regionName,
      regionStaticData,
      actions,
      snapshot,
      snapshotInterface,
      useColorblind,
      isExpanded,
      currentActionIndex,
      analysisEntries
    );
    regionBlock.appendChild(contentEl);

    // Attach event listeners
    this.attachEventListeners(headerEl, regionName);

    return regionBlock;
  }

  /**
   * Builds the header element for a region block
   * @param {string} regionName - Name of the region
   * @param {boolean} isExpanded - Whether the region is expanded
   * @returns {HTMLElement} The header element
   */
  buildHeader(regionName, isExpanded) {
    const headerEl = document.createElement('div');
    headerEl.className = 'loop-region-header';

    // Determine display name based on discovery state
    const isDiscoveryModeActive = this.loopUI.isDiscoveryModeActive || false;
    const discoverySettings = this.loopUI.discoverySettings || {};
    const isRegionDiscovered = discoveryStateSingleton.isRegionDiscovered(regionName);
    const showFullDetails = discoverySettings.showUndiscoveredDetails ?? false;
    const showRegionNames = discoverySettings.showUndiscoveredRegionNames ?? false;

    const showAsPlaceholder = isDiscoveryModeActive && !isRegionDiscovered;
    const displayName = (showAsPlaceholder && !showFullDetails && !showRegionNames) ? '???' : regionName;

    // Calculate XP data for the region
    const xpData = loopState.getRegionXP(regionName);
    const speedBonus = xpData.level * 5;
    const xpProgress = xpData.xpForNextLevel > 0 ? (xpData.xp / xpData.xpForNextLevel) * 100 : 0;

    headerEl.innerHTML = `
      <span class="loop-expand-indicator" style="margin-right: 8px;">${isExpanded ? '▼' : '▶'}</span>
      <span class="loop-region-name" style="flex: 1;">${displayName}</span>
      <span class="region-xp-level" style="margin-left: 12px;">Level ${xpData.level}</span>
      <span class="region-xp-efficiency" style="margin-left: 8px; color: #8c8;">+${speedBonus}%</span>
      <div class="region-header-xp-bar-container">
        <div class="region-header-xp-bar" style="width: ${xpProgress}%"></div>
        <span class="region-header-xp-text">${Math.floor(xpData.xp)} / ${xpData.xpForNextLevel} XP</span>
      </div>
    `;

    if (showAsPlaceholder) {
      headerEl.classList.add('undiscovered');
    }

    return headerEl;
  }

  /**
   * Builds the content element for a region block
   * Renders actions (always visible), then region details when expanded
   * using configurable section ordering (entrances-exits-locations)
   */
  buildContent(
    regionName,
    regionStaticData,
    actions,
    snapshot,
    snapshotInterface,
    useColorblind,
    isExpanded,
    currentActionIndex,
    analysisEntries = null
  ) {
    const contentEl = document.createElement('div');
    contentEl.className = 'loop-region-content';

    // Add actions container (always visible, even when collapsed)
    if (actions.length > 0) {
      this.addActions(contentEl, actions, currentActionIndex, analysisEntries);
    }

    // If expanded, add region details (exits, locations, explore button)
    if (isExpanded) {
      const detailsEl = document.createElement('div');
      detailsEl.className = 'loop-region-details';

      // Compute region reachability from snapshot
      const regionReachability = snapshot?.regionReachability?.[regionName];
      const regionIsReachable = regionReachability === true ||
        regionReachability === 'reachable' ||
        regionReachability === 'checked';

      const staticData = stateManagerProxySingleton.getStaticData();

      // Add explore button if in loop mode (but not for start regions, which are already fully explored)
      const isStartRegion = this.loopUI.playerStateAPI?.isStartRegion?.(regionName) ?? false;
      if (this.loopUI.isLoopModeActive && !isStartRegion) {
        this.addExploreButton(detailsEl, regionName);
      }

      // Compact display: exits then locations (no entrances)
      if (regionStaticData?.exits && regionStaticData.exits.length > 0) {
        this.addExits(
          detailsEl,
          regionName,
          regionStaticData,
          snapshot,
          snapshotInterface,
          regionIsReachable,
          useColorblind
        );
      }
      if (regionStaticData?.locations && regionStaticData.locations.length > 0) {
        this.addLocations(
          detailsEl,
          regionName,
          regionStaticData,
          snapshot,
          snapshotInterface,
          regionIsReachable,
          useColorblind,
          staticData
        );
      }

      contentEl.appendChild(detailsEl);
    }

    return contentEl;
  }

  /**
   * Adds the actions container to the content element
   * @param {HTMLElement} contentEl - Content element to add to
   * @param {Array} actions - Array of actions
   * @param {number} currentActionIndex - Index of current action
   */
  addActions(contentEl, actions, currentActionIndex, analysisEntries = null) {
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'region-actions-container';

    actions.forEach(({pathEntry, index}) => {
      // Find corresponding analysis entry
      const analysisEntry = analysisEntries
        ? analysisEntries.find(e => e.index === index || e.pathIndex === pathEntry.pathIndex)
        : null;
      const actionEl = this.createActionEntry(pathEntry, index, analysisEntry);
      if (actionEl) {
        actionsContainer.appendChild(actionEl);
      }
    });

    contentEl.appendChild(actionsContainer);
  }

  /**
   * Adds the explore button to the details element
   * @param {HTMLElement} detailsEl - Details element to add to
   * @param {string} regionName - Name of the region
   */
  addExploreButton(detailsEl, regionName) {
    const exploreContainer = document.createElement('div');
    exploreContainer.className = 'region-explore-container';

    const exploreBtn = document.createElement('button');
    exploreBtn.className = 'explore-btn';
    exploreBtn.textContent = 'Explore Region';
    exploreBtn.addEventListener('click', () => {
      this.queueExploreAction(regionName);
    });
    exploreContainer.appendChild(exploreBtn);

    const repeatLabel = document.createElement('label');
    repeatLabel.className = 'repeat-explore-label';

    const repeatCheckbox = document.createElement('input');
    repeatCheckbox.type = 'checkbox';
    repeatCheckbox.className = 'repeat-explore-checkbox';
    repeatCheckbox.checked = loopState.getRepeatExplore(regionName);
    repeatCheckbox.addEventListener('change', () => {
      loopState.setRepeatExplore(regionName, repeatCheckbox.checked);
    });
    repeatLabel.appendChild(repeatCheckbox);
    repeatLabel.appendChild(document.createTextNode(' Repeat'));
    exploreContainer.appendChild(repeatLabel);

    // Explore mana cost — placed after repeat checkbox to align with cost column
    const exploreCostSpan = document.createElement('span');
    exploreCostSpan.className = 'compact-item-cost';
    const exploreCostDataManager = getCostDataManager();
    const exploreRegionCost = exploreCostDataManager?.isLoaded()
      ? exploreCostDataManager.getRegionCost(regionName)
      : 50;
    const exploreBaseCost = exploreRegionCost * 2;
    const exploreXpData = loopState.getRegionXP(regionName);
    const exploreFinalCost = proposedLinearFinalCost(exploreBaseCost, exploreXpData.level);
    exploreCostSpan.textContent = exploreFinalCost.toFixed(1);
    exploreContainer.appendChild(exploreCostSpan);

    // Spacer to match the status column width in compact-item rows
    const statusSpacer = document.createElement('span');
    statusSpacer.className = 'compact-item-status';
    exploreContainer.appendChild(statusSpacer);

    detailsEl.appendChild(exploreContainer);
  }

  /**
   * Adds compact exits list to the details element
   * Shows a single line per exit: name → destination + status
   */
  addExits(
    detailsEl,
    regionName,
    regionStaticData,
    snapshot,
    snapshotInterface,
    regionIsReachable,
    useColorblind
  ) {
    const isDiscoveryModeActive = this.loopUI.isDiscoveryModeActive || false;
    const discoverySettings = this.loopUI.discoverySettings || {};
    const isRegionDiscovered = discoveryStateSingleton.isRegionDiscovered(regionName);
    const showFullDetails = discoverySettings.showUndiscoveredDetails ?? false;

    const exitsHeader = document.createElement('h4');
    exitsHeader.textContent = 'Exits:';
    exitsHeader.classList.add('region-exits-header');
    detailsEl.appendChild(exitsHeader);

    const exitsList = document.createElement('ul');
    exitsList.classList.add('region-exits-list', 'compact-list');

    regionStaticData.exits.forEach((exitDef) => {
      // Discovery: determine if this exit should be shown as a placeholder
      const isExitDiscovered = discoveryStateSingleton.isExitDiscovered(regionName, exitDef.name);
      let showAsPlaceholder = false;
      if (isDiscoveryModeActive) {
        if (!isRegionDiscovered) {
          showAsPlaceholder = true;
        } else if (!isExitDiscovered) {
          showAsPlaceholder = true;
        }
      }

      // Evaluate exit accessibility
      let exitAccessible = true;
      if (exitDef.access_rule) {
        try {
          exitAccessible = evaluateRule(exitDef.access_rule, snapshotInterface);
        } catch (e) {
          log('error', `Error evaluating exit rule for ${exitDef.name} in ${regionName}:`, e);
          exitAccessible = false;
        }
      }

      const connectedRegionName = exitDef.connected_region;
      const connectedReachability = snapshot?.regionReachability?.[connectedRegionName];
      const connectedRegionReachable =
        connectedReachability === true ||
        connectedReachability === 'reachable' ||
        connectedReachability === 'checked';
      const isTraversable = regionIsReachable && exitAccessible && connectedRegionReachable;

      const li = document.createElement('li');
      li.className = `compact-item ${isTraversable ? 'compact-available' : 'compact-blocked'}`;
      if (showAsPlaceholder) {
        li.classList.add('undiscovered');
      }

      // Exit name and destination (show ??? if undiscovered)
      const exitNameDisplay = showAsPlaceholder && !showFullDetails ? '???' : exitDef.name;
      const destDisplay = showAsPlaceholder && !showFullDetails ? '???' : connectedRegionName;
      const nameSpan = document.createElement('span');
      nameSpan.className = 'compact-item-name';
      nameSpan.textContent = `${exitNameDisplay} \u2192 ${destDisplay}`;
      li.appendChild(nameSpan);

      // Mana cost
      const costSpan = document.createElement('span');
      costSpan.className = 'compact-item-cost';
      const costDataManager = getCostDataManager();
      const moveBaseCost = costDataManager?.isLoaded()
        ? costDataManager.getRegionCost(regionName)
        : 50;
      const xpData = loopState.getRegionXP(regionName);
      const moveFinalCost = proposedLinearFinalCost(moveBaseCost, xpData.level);
      costSpan.textContent = moveFinalCost.toFixed(1);
      li.appendChild(costSpan);

      // Status badge
      const statusSpan = document.createElement('span');
      statusSpan.className = `compact-item-status ${isTraversable ? 'status-available' : 'status-blocked'}`;
      statusSpan.textContent = isTraversable ? 'Available' : 'Blocked';
      li.appendChild(statusSpan);

      // Click handler for traversable exits (disabled for placeholders)
      if (isTraversable && connectedRegionName && !showAsPlaceholder) {
        li.style.cursor = 'pointer';
        li.addEventListener('click', (e) => {
          if (e.target.classList.contains('region-link')) return;
          const dispatcher = getLoopsModuleDispatcher();
          if (dispatcher) {
            const currentRegion = this.loopUI.playerStateAPI?.getCurrentRegion?.() || regionName;
            dispatcher.publish('user:regionMove', {
              sourceRegion: currentRegion,
              targetRegion: connectedRegionName,
              exitName: exitDef.name,
              updatePath: true,
              source: 'loopBlockBuilder'
            }, 'bottom');
          }
          this.loopUI.navigateToRegion(connectedRegionName);
        });
      }

      exitsList.appendChild(li);
    });

    detailsEl.appendChild(exitsList);
  }

  /**
   * Adds compact locations list to the details element
   * Shows a single line per location: name + status
   */
  addLocations(
    detailsEl,
    regionName,
    regionStaticData,
    snapshot,
    snapshotInterface,
    regionIsReachable,
    useColorblind,
    staticData
  ) {
    const isDiscoveryModeActive = this.loopUI.isDiscoveryModeActive || false;
    const discoverySettings = this.loopUI.discoverySettings || {};
    const isRegionDiscovered = discoveryStateSingleton.isRegionDiscovered(regionName);
    const showFullDetails = discoverySettings.showUndiscoveredDetails ?? false;
    const disableLocationCheckUI = discoverySettings.disableLocationCheckUI ?? false;

    const locationsHeader = document.createElement('h4');
    locationsHeader.textContent = 'Locations:';
    locationsHeader.classList.add('region-locations-header');
    detailsEl.appendChild(locationsHeader);

    const locationsList = document.createElement('ul');
    locationsList.classList.add('region-locations-list', 'compact-list');

    regionStaticData.locations.forEach((locationDef) => {
      // Discovery: determine if this location should be shown as a placeholder
      const isLocationDiscovered = discoveryStateSingleton.isLocationDiscovered(locationDef.name);
      let showAsPlaceholder = false;
      if (isDiscoveryModeActive) {
        if (!isRegionDiscovered) {
          showAsPlaceholder = true;
        } else if (!isLocationDiscovered) {
          showAsPlaceholder = true;
        }
      }

      // Evaluate location accessibility
      let locAccessible = true;
      if (locationDef.access_rule) {
        try {
          locAccessible = evaluateRule(locationDef.access_rule, snapshotInterface);
        } catch (e) {
          log('error', `Error evaluating location rule for ${locationDef.name}:`, e);
          locAccessible = false;
        }
      }
      locAccessible = regionIsReachable && locAccessible;

      const locChecked = snapshot?.checkedLocations?.includes(locationDef.name) ?? false;

      const li = document.createElement('li');
      let statusClass, statusText;
      if (locChecked) {
        statusClass = 'compact-checked';
        statusText = 'Checked';
      } else if (locAccessible) {
        statusClass = 'compact-available';
        statusText = 'Available';
      } else {
        statusClass = 'compact-blocked';
        statusText = 'Locked';
      }
      li.className = `compact-item ${statusClass}`;
      if (showAsPlaceholder) {
        li.classList.add('undiscovered');
      }

      // Location name (show ??? if undiscovered)
      const locationNameDisplay = showAsPlaceholder && !showFullDetails ? '???' : locationDef.name;
      const nameSpan = document.createElement('span');
      nameSpan.className = 'compact-item-name';
      nameSpan.textContent = locationNameDisplay;
      li.appendChild(nameSpan);

      // Mana cost
      const costSpan = document.createElement('span');
      costSpan.className = 'compact-item-cost';
      const locCostDataManager = getCostDataManager();
      const locBaseCost = locCostDataManager?.isLoaded()
        ? locCostDataManager.getLocationCost(locationDef.name)
        : 100;
      const locXpData = loopState.getRegionXP(regionName);
      const locFinalCost = proposedLinearFinalCost(locBaseCost, locXpData.level);
      costSpan.textContent = locFinalCost.toFixed(1);
      li.appendChild(costSpan);

      // Status badge
      const statusSpan = document.createElement('span');
      statusSpan.className = `compact-item-status status-${statusText.toLowerCase()}`;
      statusSpan.textContent = statusText;
      li.appendChild(statusSpan);

      // Click handler - queue location check (disabled for placeholders and already-checked locations)
      // Note: disableLocationCheckUI is intentionally NOT checked here — it controls the
      // Regions panel, but the Loops panel always allows queuing location checks.
      if (locAccessible && !locChecked && !showAsPlaceholder) {
        li.style.cursor = 'pointer';
        li.addEventListener('click', () => {
          if (this.loopUI.playerStateAPI?.addLocationCheck) {
            this.loopUI.playerStateAPI.addLocationCheck(locationDef.name, regionName);
            this.loopUI.renderLoopPanel();
          }
        });
      }

      locationsList.appendChild(li);
    });

    detailsEl.appendChild(locationsList);
  }

  /**
   * Creates an action block element for display in the region
   * @param {Object} pathEntry - The path entry object
   * @param {number} index - The index in the action queue
   * @param {boolean} isCurrentAction - Whether this is the currently executing action
   * @returns {HTMLElement} The action block element
   */
  /**
   * Creates a JTA-style action entry element for display in the region
   * Format: [✕] # name cost remaining time status
   * With a progress bar background for active/completed actions
   * @param {Object} pathEntry - The path entry object
   * @param {number} index - The index in the action queue (global)
   * @param {Object|null} analysisEntry - Analysis data from shared queueAnalysis
   * @returns {HTMLElement} The action entry element
   */
  createActionEntry(pathEntry, index, analysisEntry) {
    const actionDiv = document.createElement('div');
    actionDiv.className = 'loop-action-entry';
    actionDiv.dataset.actionIndex = index;

    // Determine status
    const isCurrentAction = index === (loopState.currentActionIndex || 0) && loopState.isProcessing;
    const isCompleted = pathEntry.completed || false;
    let status = 'pending';
    if (isCompleted) status = 'completed';
    else if (isCurrentAction) status = 'active';

    actionDiv.classList.add(`state-${status}`);

    // Progress bar width
    let progressPct = 0;
    if (isCompleted) {
      progressPct = 100;
    } else if (isCurrentAction) {
      progressPct = pathEntry.progress || 0;
    }

    // Get data from analysis or calculate fallback
    let actionName, manaCost, manaRemaining, timeStr;
    const maxMana = loopState.maxMana || 100;

    if (analysisEntry) {
      actionName = analysisEntry.description;
      manaCost = analysisEntry.finalCost;
      manaRemaining = analysisEntry.manaAfterAction;
      timeStr = formatTime(analysisEntry.predictedTime);
    } else {
      // Fallback: calculate locally
      let fullName = '';
      if (pathEntry.type === 'regionMove') {
        const via = pathEntry.exitUsed ? ` via ${pathEntry.exitUsed}` : '';
        fullName = `Move: ${pathEntry.destinationRegion}${via}`;
      } else if (pathEntry.type === 'locationCheck') {
        fullName = `Check: ${pathEntry.locationName}`;
      } else if (pathEntry.type === 'customAction') {
        fullName = `Explore: ${pathEntry.sourceRegion}`;
      } else {
        fullName = `${pathEntry.type}`;
      }
      actionName = fullName;
      manaCost = loopState._calculateActionCost(pathEntry);
      manaRemaining = null; // Can't calculate without full analysis
      timeStr = '';
    }

    // Display number (1-indexed)
    const displayIndex = index + 1;

    // Format cost
    const costStr = manaCost.toFixed(1);

    // Format remaining
    let remainingStr = '';
    let remainingClass = '';
    if (manaRemaining !== null) {
      remainingStr = manaRemaining.toFixed(1);
      remainingClass = manaColorClass(manaRemaining, maxMana);
    }

    // Build the entry HTML
    actionDiv.innerHTML = `
      <div class="loop-action-progress-bar" style="width: ${progressPct}%"></div>
      <button class="loop-action-cancel" data-index="${index}">✕</button>
      <span class="loop-action-index">${displayIndex}</span>
      <span class="loop-action-name" title="${actionName}">${actionName}</span>
      <div class="loop-action-right-group">
        <span class="loop-action-cost">-${costStr}</span>
        <span class="loop-action-remaining ${remainingClass}">${remainingStr}</span>
        <span class="loop-action-time">${timeStr}</span>
        <span class="loop-action-status status-${status}">${status}</span>
      </div>
    `;

    // Add cancel button handler
    const cancelBtn = actionDiv.querySelector('.loop-action-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeActionAtIndex(index);
      });
    }

    return actionDiv;
  }

  /**
   * Legacy method - delegates to createActionEntry
   * @deprecated Use createActionEntry instead
   */
  createActionBlockElement(pathEntry, index, isCurrentAction) {
    return this.createActionEntry(pathEntry, index, null);
  }

  /**
   * Attaches event listeners to the header element
   * @param {HTMLElement} headerEl - Header element
   * @param {string} regionName - Name of the region
   */
  attachEventListeners(headerEl, regionName) {
    // Header click listener for expand/collapse
    headerEl.addEventListener('click', (e) => {
      this.loopUI.toggleRegionExpanded(regionName);
    });
  }

  /**
   * Queues an explore action for a region
   * @param {string} regionName - The region to explore
   */
  queueExploreAction(regionName) {
    if (this.loopUI.playerStateAPI?.addCustomAction) {
      this.loopUI.playerStateAPI.addCustomAction('explore', { regionName });
      this.loopUI.renderLoopPanel();
    }
  }

  /**
   * Removes an action at a specific index
   * @param {number} index - The index to remove
   */
  removeActionAtIndex(index) {
    // Delegate to loopUI's implementation
    if (this.loopUI._removeActionAtIndex) {
      this.loopUI._removeActionAtIndex(index);
    }
  }
}

export default LoopBlockBuilder;
