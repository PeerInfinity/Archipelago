// loopBlockBuilder.js
// Builds region blocks for the loops panel following the same pattern as the Regions module
// A region block shows both the queued actions and the region details (locations/exits)

import loopState from './loopStateSingleton.js';
import { evaluateRule } from '../shared/ruleEngine.js';
import { getLoopsModuleDispatcher } from './index.js';

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
    currentActionIndex
  ) {
    // Create outer container
    const regionBlock = document.createElement('div');
    regionBlock.className = 'loop-region-block';
    regionBlock.dataset.region = regionName;
    regionBlock.classList.add(isExpanded ? 'expanded' : 'collapsed');

    // Check if this is the initial Menu (starting position)
    const isInitialMenu = regionName === 'Menu' &&
                         actions.length === 1 &&
                         actions[0].index === 0 &&
                         actions[0].pathEntry.type === 'regionMove' &&
                         !actions[0].pathEntry.exitUsed;

    // Build header
    const headerEl = this.buildHeader(regionName, isExpanded, isInitialMenu);
    regionBlock.appendChild(headerEl);

    // Add special action block for initial Menu
    if (isInitialMenu) {
      const actionBlock = this.buildInitialMenuBlock();
      regionBlock.appendChild(actionBlock);
    }

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
      isInitialMenu
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
   * @param {boolean} isInitialMenu - Whether this is the initial Menu
   * @returns {HTMLElement} The header element
   */
  buildHeader(regionName, isExpanded, isInitialMenu) {
    const headerEl = document.createElement('div');
    headerEl.className = 'loop-region-header';

    if (isInitialMenu) {
      // Simple header for initial Menu
      headerEl.innerHTML = `
        <span class="loop-region-name">Menu</span>
        <span class="loop-expand-indicator">${isExpanded ? '▼' : '▶'}</span>
      `;
    } else {
      // Calculate XP data for the region
      const xpData = loopState.getRegionXP(regionName);
      const speedBonus = xpData.level * 5;

      headerEl.innerHTML = `
        <span class="loop-region-name">${regionName}</span>
        <span class="region-xp">Level ${xpData.level} (+${speedBonus}% efficiency)</span>
        <span class="loop-expand-indicator">${isExpanded ? '▼' : '▶'}</span>
      `;
    }

    return headerEl;
  }

  /**
   * Builds a special action block for the initial Menu starting position
   * @returns {HTMLElement} The initial menu action block
   */
  buildInitialMenuBlock() {
    const actionBlock = document.createElement('div');
    actionBlock.className = 'loop-action-block';

    const titleEl = document.createElement('div');
    titleEl.className = 'action-title';
    titleEl.textContent = 'Starting Region: Menu';
    actionBlock.appendChild(titleEl);

    return actionBlock;
  }

  /**
   * Builds the content element for a region block
   * @param {string} regionName - Name of the region
   * @param {Object} regionStaticData - Static data for the region
   * @param {Array} actions - Array of actions for this region
   * @param {Object} snapshot - Current state snapshot
   * @param {Object} snapshotInterface - Snapshot interface
   * @param {boolean} useColorblind - Whether to use colorblind mode
   * @param {boolean} isExpanded - Whether the region is expanded
   * @param {number} currentActionIndex - Index of current action
   * @param {boolean} isInitialMenu - Whether this is the initial Menu
   * @returns {HTMLElement} The content element
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
    isInitialMenu
  ) {
    const contentEl = document.createElement('div');
    contentEl.className = 'loop-region-content';

    // Add actions container (always visible, even when collapsed)
    // Skip for initial Menu since we already added the special display
    if (!isInitialMenu && actions.length > 0) {
      this.addActions(contentEl, actions, currentActionIndex);
    }

    // If expanded, add region details (locations, exits, explore button)
    if (isExpanded) {
      const detailsEl = document.createElement('div');
      detailsEl.className = 'loop-region-details';

      // Add explore button if in loop mode
      if (this.loopUI.isLoopModeActive) {
        this.addExploreButton(detailsEl, regionName);
      }

      // Add locations if any
      if (regionStaticData?.locations && regionStaticData.locations.length > 0) {
        this.addLocations(
          detailsEl,
          regionName,
          regionStaticData,
          snapshot,
          snapshotInterface,
          useColorblind
        );
      }

      // Add exits if any
      if (regionStaticData?.exits && regionStaticData.exits.length > 0) {
        this.addExits(
          detailsEl,
          regionName,
          regionStaticData,
          snapshot,
          snapshotInterface,
          useColorblind
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
  addActions(contentEl, actions, currentActionIndex) {
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'region-actions-container';

    actions.forEach(({pathEntry, index}) => {
      const isCurrentAction = index === currentActionIndex && loopState.isProcessing;
      const actionEl = this.createActionBlockElement(pathEntry, index, isCurrentAction);
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

    detailsEl.appendChild(exploreContainer);
  }

  /**
   * Adds locations list to the details element
   * @param {HTMLElement} detailsEl - Details element to add to
   * @param {string} regionName - Name of the region
   * @param {Object} regionStaticData - Static data for the region
   * @param {Object} snapshot - Current state snapshot
   * @param {Object} snapshotInterface - Snapshot interface
   * @param {boolean} useColorblind - Whether to use colorblind mode
   */
  addLocations(
    detailsEl,
    regionName,
    regionStaticData,
    snapshot,
    snapshotInterface,
    useColorblind
  ) {
    const locationsContainer = document.createElement('div');
    locationsContainer.className = 'loop-region-locations-container';
    locationsContainer.innerHTML = '<h4>Locations</h4>';

    const locationsList = document.createElement('div');
    locationsList.className = 'locations-list';

    regionStaticData.locations.forEach(location => {
      const locationEl = this.createLocationElement(
        location,
        regionName,
        snapshot,
        snapshotInterface,
        useColorblind
      );
      if (locationEl) {
        locationsList.appendChild(locationEl);
      }
    });

    locationsContainer.appendChild(locationsList);
    detailsEl.appendChild(locationsContainer);
  }

  /**
   * Adds exits list to the details element
   * @param {HTMLElement} detailsEl - Details element to add to
   * @param {string} regionName - Name of the region
   * @param {Object} regionStaticData - Static data for the region
   * @param {Object} snapshot - Current state snapshot
   * @param {Object} snapshotInterface - Snapshot interface
   * @param {boolean} useColorblind - Whether to use colorblind mode
   */
  addExits(
    detailsEl,
    regionName,
    regionStaticData,
    snapshot,
    snapshotInterface,
    useColorblind
  ) {
    const exitsContainer = document.createElement('div');
    exitsContainer.className = 'loop-region-exits-container';
    exitsContainer.innerHTML = '<h4>Exits</h4>';

    const exitsList = document.createElement('div');
    exitsList.className = 'exits-list';

    regionStaticData.exits.forEach(exit => {
      const exitEl = this.createExitElement(
        exit,
        regionName,
        snapshot,
        snapshotInterface,
        useColorblind
      );
      if (exitEl) {
        exitsList.appendChild(exitEl);
      }
    });

    exitsContainer.appendChild(exitsList);
    detailsEl.appendChild(exitsContainer);
  }

  /**
   * Creates an action block element for display in the region
   * @param {Object} pathEntry - The path entry object
   * @param {number} index - The index in the action queue
   * @param {boolean} isCurrentAction - Whether this is the currently executing action
   * @returns {HTMLElement} The action block element
   */
  createActionBlockElement(pathEntry, index, isCurrentAction) {
    const actionDiv = document.createElement('div');
    actionDiv.className = 'region-action-block';
    actionDiv.dataset.actionIndex = index;

    if (isCurrentAction) {
      actionDiv.classList.add('current-action');
    }

    // Determine action type and create appropriate display
    let actionText = '';
    let manaCost = 0;

    if (pathEntry.type === 'regionMove') {
      actionText = `Move to ${pathEntry.region}`;
      if (pathEntry.exitUsed) {
        actionText += ` via ${pathEntry.exitUsed}`;
      }
      manaCost = loopState._calculateActionCost({type: 'moveToRegion', destinationRegion: pathEntry.region});
    } else if (pathEntry.type === 'locationCheck') {
      actionText = `Check: ${pathEntry.locationName}`;
      manaCost = loopState._calculateActionCost({type: 'checkLocation', locationName: pathEntry.locationName});
    } else if (pathEntry.type === 'customAction') {
      if (pathEntry.actionName === 'explore') {
        actionText = 'Explore Region';
        manaCost = loopState._calculateActionCost({type: 'explore', regionName: pathEntry.region});
      } else {
        actionText = `Action: ${pathEntry.actionName}`;
      }
    }

    // Create content
    actionDiv.innerHTML = `
      <span class="action-text">${actionText}</span>
      <span class="action-mana">-${manaCost} Mana</span>
      <button class="remove-action-btn" data-index="${index}">×</button>
    `;

    // Add progress bar if this is the current action
    if (isCurrentAction && loopState.actionProgress) {
      const progress = loopState.actionProgress.get(index) || 0;
      const progressBar = document.createElement('div');
      progressBar.className = 'action-progress-bar';
      progressBar.innerHTML = `
        <div class="progress-fill" style="width: ${progress}%"></div>
      `;
      actionDiv.appendChild(progressBar);
    }

    // Add remove button handler
    const removeBtn = actionDiv.querySelector('.remove-action-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeActionAtIndex(index);
      });
    }

    return actionDiv;
  }

  /**
   * Creates a location element with clickable functionality
   * @param {Object} location - The location data
   * @param {string} regionName - The region name
   * @param {Object} snapshot - Current state snapshot
   * @param {Object} snapshotInterface - Snapshot interface
   * @param {boolean} useColorblind - Whether to use colorblind mode
   * @returns {HTMLElement} The location element
   */
  createLocationElement(location, regionName, snapshot, snapshotInterface, useColorblind) {
    const locationEl = document.createElement('div');
    locationEl.className = 'location-item clickable';

    // Check if location is accessible
    const isAccessible = location.requires ?
      evaluateRule(location.requires, snapshotInterface) : true;

    // Check if location has been checked
    const isChecked = snapshot?.checked_locations?.includes(location.name) || false;

    // Apply appropriate styling
    if (isChecked) {
      locationEl.classList.add('checked');
    } else if (isAccessible) {
      locationEl.classList.add('accessible');
    } else {
      locationEl.classList.add('inaccessible');
    }

    if (useColorblind) {
      locationEl.classList.add('colorblind');
    }

    locationEl.innerHTML = `
      <span class="location-name">${location.name}</span>
      ${isChecked ? '<span class="check-mark">✓</span>' : ''}
    `;

    // Make clickable to queue location check
    locationEl.addEventListener('click', () => {
      if (this.loopUI.playerStateAPI?.addLocationCheck) {
        this.loopUI.playerStateAPI.addLocationCheck(location.name, regionName);
        this.loopUI.renderLoopPanel();
      }
    });

    return locationEl;
  }

  /**
   * Creates an exit element with clickable functionality
   * @param {Object} exit - The exit data
   * @param {string} regionName - The region name
   * @param {Object} snapshot - Current state snapshot
   * @param {Object} snapshotInterface - Snapshot interface
   * @param {boolean} useColorblind - Whether to use colorblind mode
   * @returns {HTMLElement} The exit element
   */
  createExitElement(exit, regionName, snapshot, snapshotInterface, useColorblind) {
    const exitEl = document.createElement('div');
    exitEl.className = 'exit-item clickable';

    // Check if exit is accessible
    const isAccessible = exit.requires ?
      evaluateRule(exit.requires, snapshotInterface) : true;

    // Apply appropriate styling
    if (isAccessible) {
      exitEl.classList.add('accessible');
    } else {
      exitEl.classList.add('inaccessible');
    }

    if (useColorblind) {
      exitEl.classList.add('colorblind');
    }

    exitEl.innerHTML = `
      <span class="exit-name">${exit.name} → ${exit.connected_region}</span>
    `;

    // Make clickable to trigger region move
    exitEl.addEventListener('click', () => {
      // Publish region move event via EventDispatcher (not EventBus)
      const dispatcher = getLoopsModuleDispatcher();
      if (dispatcher) {
        dispatcher.publish('loops', 'user:regionMove', {
          sourceRegion: regionName,
          targetRegion: exit.connected_region,
          exitName: exit.name
        }, { initialTarget: 'bottom' });
      } else {
        log('error', 'Dispatcher not available for publishing user:regionMove');
      }
      this.loopUI.renderLoopPanel();
    });

    return exitEl;
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
