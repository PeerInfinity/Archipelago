// loopRegionBlockBuilder.js
import { evaluateRule } from '../shared/ruleEngine.js';
import { createStateSnapshotInterface } from '../shared/stateInterface.js';
import { renderLogicTree } from '../commonUI/index.js';
import commonUI from '../commonUI/index.js';
import loopStateSingleton from './loopStateSingleton.js';
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import discoveryStateSingleton from '../discovery/singleton.js';
import settingsManager from '../../app/core/settingsManager.js';
import {
  levelFromXP,
  xpForNextLevel,
  proposedLinearFinalCost,
  proposedLinearReduction,
} from './xpFormulas.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('loopRegionBlockBuilder', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[loopRegionBlockBuilder] ${message}`, ...data);
  }
}

/**
 * LoopRegionBlockBuilder class handles the creation of region block DOM elements for the loops panel
 * This is based on the regionBlockBuilder but adapted for loop mode functionality
 */
export class LoopRegionBlockBuilder {
  constructor(loopUI) {
    this.loopUI = loopUI;
  }

  /**
   * Builds a path entry block for the loops panel
   * @param {Object} pathEntry - Entry from playerState path
   * @param {number} pathIndex - Index in the path array
   * @param {Object} regionStaticData - Static data for the region
   * @param {Object} snapshot - Current state snapshot
   * @param {Object} snapshotInterface - Snapshot interface for rule evaluation
   * @param {boolean} useColorblind - Whether to use colorblind mode
   * @param {boolean} isExpanded - Whether the block should be expanded
   * @param {boolean} isCurrentAction - Whether this is the currently executing action
   * @returns {HTMLElement} The action block element
   */
  buildActionBlock(
    pathEntry,
    pathIndex,
    regionStaticData,
    snapshot,
    snapshotInterface,
    useColorblind,
    isExpanded,
    isCurrentAction
  ) {
    const actionBlock = document.createElement('div');
    actionBlock.className = 'loop-action-block';
    actionBlock.dataset.pathIndex = pathIndex;
    actionBlock.dataset.actionType = pathEntry.type;
    
    if (isCurrentAction) {
      actionBlock.classList.add('current-action');
    }
    
    if (useColorblind) {
      actionBlock.classList.add('colorblind-mode');
    }

    // Build header based on action type
    const header = this.buildActionHeader(pathEntry, pathIndex, isExpanded);
    actionBlock.appendChild(header);

    // Build content based on action type and expansion state
    if (isExpanded) {
      const content = this.buildActionContent(
        pathEntry,
        pathIndex,
        regionStaticData,
        snapshot,
        snapshotInterface,
        useColorblind
      );
      if (content) {
        actionBlock.appendChild(content);
      }
    }

    // Add progress indicator if this is current action
    if (isCurrentAction) {
      const progressBar = this.buildProgressBar(pathEntry, pathIndex);
      actionBlock.appendChild(progressBar);
    }

    return actionBlock;
  }

  /**
   * Builds the header for an action block
   * @param {Object} pathEntry - The path entry
   * @param {number} pathIndex - Index in the path
   * @param {boolean} isExpanded - Whether the block is expanded
   * @returns {HTMLElement} The header element
   */
  buildActionHeader(pathEntry, pathIndex, isExpanded) {
    const header = document.createElement('div');
    header.className = 'action-header';
    
    // Create expand/collapse button
    const expandBtn = document.createElement('button');
    expandBtn.className = 'expand-btn';
    expandBtn.textContent = isExpanded ? '▼' : '▶';
    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.loopUI.toggleActionExpanded(pathIndex);
    });
    header.appendChild(expandBtn);

    // Create title based on action type
    const title = document.createElement('span');
    title.className = 'action-title';
    
    switch (pathEntry.type) {
      case 'regionMove':
        // Special case for the initial Menu entry
        if (pathIndex === 0 && pathEntry.region === 'Menu' && !pathEntry.exitUsed) {
          title.textContent = `Starting Region: ${pathEntry.region}`;
        } else {
          title.textContent = `Move to ${pathEntry.region}`;
          if (pathEntry.exitUsed) {
            title.textContent += ` (via ${pathEntry.exitUsed})`;
          }
        }
        break;
      case 'locationCheck':
        title.textContent = `Check: ${pathEntry.locationName}`;
        break;
      case 'customAction':
        if (pathEntry.actionName === 'explore') {
          title.textContent = `Explore ${pathEntry.region}`;
        } else {
          title.textContent = `${pathEntry.actionName} in ${pathEntry.region}`;
        }
        break;
      default:
        title.textContent = 'Unknown Action';
    }
    
    header.appendChild(title);

    // Add instance number if applicable
    if (pathEntry.instanceNumber > 1) {
      const instanceBadge = document.createElement('span');
      instanceBadge.className = 'instance-badge';
      instanceBadge.textContent = `#${pathEntry.instanceNumber}`;
      header.appendChild(instanceBadge);
    }

    // Add mana cost display (but not for the initial starting position)
    if (!(pathIndex === 0 && pathEntry.type === 'regionMove' && pathEntry.region === 'Menu' && !pathEntry.exitUsed)) {
      const manaCost = this.calculateManaCost(pathEntry, pathIndex);
      if (manaCost > 0) {
        const costDisplay = document.createElement('span');
        costDisplay.className = 'mana-cost';
        costDisplay.textContent = `${manaCost} mana`;
        header.appendChild(costDisplay);
      }
    }

    // Add remove button (but not for the initial starting position)
    if (!(pathIndex === 0 && pathEntry.type === 'regionMove' && pathEntry.region === 'Menu' && !pathEntry.exitUsed)) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-action-btn';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.loopUI.removeActionAtIndex(pathIndex);
      });
      header.appendChild(removeBtn);
    }

    return header;
  }

  /**
   * Builds the content for an expanded action block
   * @param {Object} pathEntry - The path entry
   * @param {number} pathIndex - Index in the path
   * @param {Object} regionStaticData - Static data for the region
   * @param {Object} snapshot - Current state snapshot
   * @param {Object} snapshotInterface - Snapshot interface
   * @param {boolean} useColorblind - Whether to use colorblind mode
   * @returns {HTMLElement|null} The content element or null
   */
  buildActionContent(
    pathEntry,
    pathIndex,
    regionStaticData,
    snapshot,
    snapshotInterface,
    useColorblind
  ) {
    const content = document.createElement('div');
    content.className = 'action-content';

    switch (pathEntry.type) {
      case 'regionMove':
        // Show region info and available actions
        this.addRegionMoveContent(content, pathEntry, regionStaticData);
        break;
      case 'locationCheck':
        // Show location details
        this.addLocationCheckContent(content, pathEntry, regionStaticData, snapshotInterface);
        break;
      case 'customAction':
        // Show custom action details
        this.addCustomActionContent(content, pathEntry);
        break;
    }

    // Add buttons to queue additional actions at this point
    this.addActionButtons(content, pathEntry, pathIndex);

    return content;
  }

  /**
   * Adds content for a region move action
   */
  addRegionMoveContent(content, pathEntry, regionStaticData) {
    // Show XP info for the region
    const xpData = loopStateSingleton.getRegionXP(pathEntry.region);
    if (xpData) {
      const xpInfo = document.createElement('div');
      xpInfo.className = 'region-xp-info';
      const speedBonus = xpData.level * 5;
      xpInfo.innerHTML = `
        <div>Level ${xpData.level} (${Math.floor(xpData.xp)}/${xpData.xpForNextLevel} XP)</div>
        <div class="efficiency-bonus">+${speedBonus}% efficiency</div>
      `;
      content.appendChild(xpInfo);
    }

    // Show available locations in this region
    if (regionStaticData && regionStaticData.locations) {
      const locationsDiv = document.createElement('div');
      locationsDiv.className = 'available-locations';
      locationsDiv.innerHTML = '<div class="section-title">Locations:</div>';
      
      const locationsList = document.createElement('div');
      locationsList.className = 'locations-list';
      
      regionStaticData.locations.forEach(location => {
        const isDiscovered = discoveryStateSingleton.isLocationDiscovered(location.name);
        if (isDiscovered) {
          const locBtn = document.createElement('button');
          locBtn.className = 'location-button';
          locBtn.textContent = location.name;
          locBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.loopUI.insertLocationCheckAt(location.name, pathEntry.region, pathEntry.instanceNumber);
          });
          locationsList.appendChild(locBtn);
        }
      });
      
      locationsDiv.appendChild(locationsList);
      content.appendChild(locationsDiv);
    }
  }

  /**
   * Adds content for a location check action
   */
  addLocationCheckContent(content, pathEntry, regionStaticData, snapshotInterface) {
    const locationDiv = document.createElement('div');
    locationDiv.className = 'location-info';
    
    // Find the location data
    const location = regionStaticData?.locations?.find(
      loc => loc.name === pathEntry.locationName
    );
    
    if (location) {
      // Show item if known
      if (location.item) {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'location-item';
        itemDiv.textContent = `Item: ${location.item}`;
        locationDiv.appendChild(itemDiv);
      }
      
      // Show access rule if any
      if (location.access_rule) {
        const ruleDiv = document.createElement('div');
        ruleDiv.className = 'location-rule';
        const canAccess = evaluateRule(location.access_rule, snapshotInterface);
        ruleDiv.innerHTML = `
          <div class="rule-status ${canAccess ? 'accessible' : 'blocked'}">
            ${canAccess ? '✓ Accessible' : '✗ Blocked'}
          </div>
        `;
        locationDiv.appendChild(ruleDiv);
      }
    }
    
    content.appendChild(locationDiv);
  }

  /**
   * Adds content for a custom action
   */
  addCustomActionContent(content, pathEntry) {
    const actionDiv = document.createElement('div');
    actionDiv.className = 'custom-action-info';
    
    if (pathEntry.actionName === 'explore') {
      // Show explore settings
      const exploreSettings = document.createElement('div');
      exploreSettings.className = 'explore-settings';
      
      // Add repeat checkbox
      const repeatLabel = document.createElement('label');
      repeatLabel.className = 'checkbox-label';
      
      const repeatCheckbox = document.createElement('input');
      repeatCheckbox.type = 'checkbox';
      repeatCheckbox.checked = pathEntry.params?.repeat || false;
      repeatCheckbox.addEventListener('change', (e) => {
        this.loopUI.updateCustomActionParams(
          pathEntry.pathIndex,
          { ...pathEntry.params, repeat: e.target.checked }
        );
      });
      
      repeatLabel.appendChild(repeatCheckbox);
      repeatLabel.appendChild(document.createTextNode(' Repeat until out of mana'));
      exploreSettings.appendChild(repeatLabel);
      
      actionDiv.appendChild(exploreSettings);
    }
    
    content.appendChild(actionDiv);
  }

  /**
   * Adds action buttons to queue additional actions at this point
   */
  addActionButtons(content, pathEntry, pathIndex) {
    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'action-buttons';
    
    // Add explore button if this is a region move
    if (pathEntry.type === 'regionMove') {
      const exploreBtn = document.createElement('button');
      exploreBtn.className = 'queue-action-btn';
      exploreBtn.textContent = 'Queue Explore';
      exploreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.loopUI.insertCustomActionAt(
          'explore',
          pathEntry.region,
          pathEntry.instanceNumber,
          { repeat: false }
        );
      });
      buttonsDiv.appendChild(exploreBtn);
    }
    
    content.appendChild(buttonsDiv);
  }

  /**
   * Builds a progress bar for the current action
   */
  buildProgressBar(pathEntry, pathIndex) {
    const progressContainer = document.createElement('div');
    progressContainer.className = 'action-progress-container';
    
    const progressBar = document.createElement('div');
    progressBar.className = 'action-progress-bar';
    
    const progressFill = document.createElement('div');
    progressFill.className = 'action-progress-fill';
    progressFill.style.width = '0%';
    progressFill.dataset.pathIndex = pathIndex;
    
    progressBar.appendChild(progressFill);
    progressContainer.appendChild(progressBar);
    
    // Add progress text
    const progressText = document.createElement('div');
    progressText.className = 'action-progress-text';
    progressText.textContent = '0%';
    progressContainer.appendChild(progressText);
    
    return progressContainer;
  }

  /**
   * Calculates the mana cost for an action
   */
  calculateManaCost(pathEntry, pathIndex) {
    // Get base costs
    let baseCost = 10; // Default cost
    
    switch (pathEntry.type) {
      case 'regionMove':
        baseCost = 5;
        break;
      case 'locationCheck':
        baseCost = 15;
        break;
      case 'customAction':
        if (pathEntry.actionName === 'explore') {
          baseCost = 20;
        }
        break;
    }
    
    // Apply XP reduction if applicable
    if (pathEntry.region) {
      const xpData = loopStateSingleton.getRegionXP(pathEntry.region);
      if (xpData && xpData.level > 0) {
        const reduction = proposedLinearReduction(xpData.level);
        baseCost = Math.ceil(baseCost * (1 - reduction));
      }
    }
    
    return baseCost;
  }

  /**
   * Updates the progress display for an action
   */
  updateActionProgress(pathIndex, progress) {
    const progressFill = document.querySelector(`.action-progress-fill[data-path-index="${pathIndex}"]`);
    if (progressFill) {
      progressFill.style.width = `${progress}%`;
      
      const progressText = progressFill.parentElement.parentElement.querySelector('.action-progress-text');
      if (progressText) {
        progressText.textContent = `${Math.floor(progress)}%`;
      }
    }
  }
}