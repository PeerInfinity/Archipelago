// regionUI.js
import stateManager from '../core/stateManagerSingleton.js';
import { evaluateRule } from '../core/ruleEngine.js';
import { PathAnalyzerUI } from './pathAnalyzerUI.js';
import commonUI from './commonUI.js';
import messageHandler from '../../client/core/messageHandler.js';
import loopState from '../core/loop/loopStateSingleton.js';
import settingsManager from '../core/settingsManager.js';
import eventBus from '../core/eventBus.js';

export class RegionUI {
  constructor(gameUI) {
    this.gameUI = gameUI;

    /**
     * visitedRegions is an array of objects:
     * [{ name: 'Links House', expanded: true, uid: 0 }, ...]
     */
    this.visitedRegions = [];

    // A simple counter to give each visited region block a unique ID
    this.nextUID = 1;

    // If set to true, we'll show **all** regions, ignoring the visited chain
    this.showAll = false;

    // Add colorblind mode property
    this.colorblindMode = false;

    // Create the path analyzer
    this.pathAnalyzer = new PathAnalyzerUI(this);
    this.rootElement = this.createRootElement();
    this.regionsContainer = this.rootElement.querySelector(
      '#regions-panel-content'
    );

    this.attachEventListeners();
    this.settingsUnsubscribe = null;
    this.subscribeToSettings();
  }

  subscribeToSettings() {
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
    }
    this.settingsUnsubscribe = eventBus.subscribe(
      'settings:changed',
      ({ key, value }) => {
        if (key === '*' || key.startsWith('colorblindMode.regions')) {
          console.log('RegionUI reacting to settings change:', key);
          this.update();
        }
      }
    );
  }

  onPanelDestroy() {
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
      this.settingsUnsubscribe = null;
    }
    this.pathAnalyzer?.dispose?.();
  }

  dispose() {
    this.onPanelDestroy();
  }

  createRootElement() {
    const element = document.createElement('div');
    element.classList.add('regions-panel-container', 'panel-container');
    element.style.display = 'flex';
    element.style.flexDirection = 'column';
    element.style.height = '100%';
    element.style.overflow = 'hidden';

    element.innerHTML = `
      <div class="control-group region-controls" style="padding: 0.5rem; border-bottom: 1px solid #666; flex-shrink: 0;">
        <label>
          <input type="checkbox" id="show-all-regions" />
          Show All Regions
        </label>
        <button id="expand-collapse-all">Expand All</button>
      </div>
      <div id="regions-panel-content" style="flex-grow: 1; overflow-y: auto;">
        <!-- Region blocks are injected here -->
      </div>
    `;
    return element;
  }

  getRootElement() {
    return this.rootElement;
  }

  attachEventListeners() {
    const showAllRegionsCheckbox =
      this.rootElement.querySelector('#show-all-regions');
    if (showAllRegionsCheckbox) {
      showAllRegionsCheckbox.addEventListener('change', (e) => {
        this.showAll = e.target.checked;
        this.renderAllRegions();
      });
    }

    const expandCollapseAllButton = this.rootElement.querySelector(
      '#expand-collapse-all'
    );
    if (expandCollapseAllButton) {
      expandCollapseAllButton.addEventListener('click', () => {
        if (expandCollapseAllButton.textContent === 'Expand All') {
          this.expandAllRegions();
          expandCollapseAllButton.textContent = 'Collapse All';
        } else {
          this.collapseAllRegions();
          expandCollapseAllButton.textContent = 'Expand All';
        }
      });
    }
  }

  initialize() {
    this.clear();
    this.showStartRegion('Menu');

    // Add CSS styles for multiple exits
    const styles = document.createElement('style');
    styles.innerHTML = `
      .transition-header {
        padding: 5px;
        margin-top: 10px;
        margin-bottom: 5px;
        border-radius: 4px;
        background-color: rgba(0, 0, 0, 0.2);
      }
      
      .path-exit-rule-container {
        position: relative;
      }
      
      .path-exit-rule-container::before {
        content: "";
        position: absolute;
        top: 0;
        left: -10px;
        width: 10px;
        height: 50%;
        border-bottom: 1px solid #555;
        border-left: 1px solid #555;
      }
      
      .path-exit-rule-container:first-of-type::before {
        display: none;
      }
    `;
    document.head.appendChild(styles);
  }

  clear() {
    this.visitedRegions = [];
    this.nextUID = 1;
    if (this.regionsContainer) {
      this.regionsContainer.innerHTML = '';
    }
  }

  update() {
    this.renderAllRegions();
  }

  log(msg) {
    if (window.consoleManager) {
      window.consoleManager.print(msg, 'info');
    } else {
      console.log(msg);
    }
  }

  showStartRegion(startRegionName) {
    if (!stateManager.regions[startRegionName]) {
      this.log(
        `Warning: start region ${startRegionName} not found in stateManager.regions.`
      );
      return;
    }
    this.visitedRegions = [
      {
        name: startRegionName,
        expanded: true,
        uid: this.nextUID++,
      },
    ];
    this.renderAllRegions();
  }

  moveToRegion(oldRegionName, newRegionName) {
    // 1. find the index of oldRegionName in visited array
    const oldIndex = this.visitedRegions.findIndex(
      (r) => r.name === oldRegionName
    );
    if (oldIndex < 0) {
      this.log(
        `Can't find oldRegionName ${oldRegionName} in visited. Not removing anything.`
      );
      return;
    }

    // 2. remove everything after oldIndex
    this.visitedRegions.splice(oldIndex + 1);

    // 3. collapse the old region block
    this.visitedRegions[oldIndex].expanded = false;

    // 4. Add the new region block (expanded)
    const newBlock = {
      name: newRegionName,
      expanded: true,
      uid: this.nextUID++,
    };
    this.visitedRegions.push(newBlock);

    this.renderAllRegions();
  }

  toggleRegionByUID(uid) {
    const block = this.visitedRegions.find((r) => r.uid === uid);
    if (!block) return;
    block.expanded = !block.expanded;
    this.renderAllRegions();
  }

  expandAllRegions() {
    if (this.showAll) {
      Object.keys(stateManager.regions).forEach((regionName, index) => {
        const uid = `all_${index}`;
        const regionObj = this.visitedRegions.find((r) => r.uid === uid);
        if (regionObj) {
          regionObj.expanded = true;
        } else {
          this.visitedRegions.push({
            name: regionName,
            expanded: true,
            uid: uid,
          });
        }
      });
    } else {
      this.visitedRegions.forEach((region) => {
        region.expanded = true;
      });
    }
    this.renderAllRegions();
  }

  collapseAllRegions() {
    if (this.showAll) {
      Object.keys(stateManager.regions).forEach((regionName, index) => {
        const uid = `all_${index}`;
        const regionObj = this.visitedRegions.find((r) => r.uid === uid);
        if (regionObj) {
          regionObj.expanded = false;
        } else {
          this.visitedRegions.push({
            name: regionName,
            expanded: false,
            uid: uid,
          });
        }
      });
    } else {
      this.visitedRegions.forEach((region) => {
        region.expanded = false;
      });
    }
    this.renderAllRegions();
  }

  renderAllRegions() {
    const container = this.regionsContainer;
    if (!container) {
      this.log('No #regions-panel element found');
      return;
    }
    container.innerHTML = '';

    // Get setting once for the panel
    const useRegionColorblind = settingsManager.getSetting(
      'colorblindMode.regions',
      true
    );

    if (this.showAll) {
      // Show all regions ignoring path logic
      Object.keys(stateManager.regions).forEach((regionName, index) => {
        const rData = stateManager.regions[regionName];
        const uid = `all_${index}`; // or any stable unique key
        const regionObj = this.visitedRegions.find((r) => r.uid === uid);
        const expanded = regionObj ? regionObj.expanded : true; // expand all by default
        const regionBlock = this.buildRegionBlock(
          rData,
          regionName,
          expanded,
          uid,
          useRegionColorblind
        );
        container.appendChild(regionBlock);
      });
    } else {
      // Normal visited chain
      for (const regionObj of this.visitedRegions) {
        const { name: regionName, expanded, uid } = regionObj;
        const rData = stateManager.regions[regionName];
        if (!rData) continue;
        const regionBlock = this.buildRegionBlock(
          rData,
          regionName,
          expanded,
          uid,
          useRegionColorblind
        );
        container.appendChild(regionBlock);
      }
    }
  }

  createRegionLink(regionName) {
    // Just call commonUI directly, which now handles event publishing
    return commonUI.createRegionLink(regionName, this.colorblindMode);
  }

  /**
   * Navigates to a specific region within the regions panel.
   * Ensures the region block is visible, expanded, scrolls it into view, and highlights it.
   * @param {string} regionName - The name of the region to navigate to.
   */
  navigateToRegion(regionName) {
    console.log(`[RegionUI] Navigating to region: ${regionName}`);

    if (!this.regionsContainer) {
      console.error('[RegionUI] regionsContainer not found, cannot navigate.');
      return;
    }

    // Ensure the correct view is rendered based on current state
    // (showAll state is handled by renderAllRegions)
    this.renderAllRegions(); // Re-render if needed to ensure the element exists

    // Find the region block using its data attribute within the panel
    // Note: We query within this.regionsContainer specifically
    let regionBlock = this.regionsContainer.querySelector(
      `.region-block[data-region="${regionName}"]`
    );

    // If block not found, maybe it's because "Show All" is off?
    if (!regionBlock && !this.showAll) {
      console.log(
        `[RegionUI] Block for ${regionName} not found and Show All is off. Checking checkbox...`
      );
      const showAllCheckbox =
        this.rootElement.querySelector('#show-all-regions');
      if (showAllCheckbox) {
        showAllCheckbox.checked = true;
        this.showAll = true;
        this.renderAllRegions(); // Re-render with all regions visible
        // Try finding the block again
        regionBlock = this.regionsContainer.querySelector(
          `.region-block[data-region="${regionName}"]`
        );
        if (regionBlock) {
          console.log(
            `[RegionUI] Found region block for ${regionName} after enabling Show All.`
          );
        }
      } else {
        console.warn(
          '[RegionUI] Could not find #show-all-regions checkbox to enable it.'
        );
      }
    }

    if (regionBlock) {
      console.log(`[RegionUI] Found region block for ${regionName}`);
      const uidString = regionBlock.dataset.uid;

      // Use uidString to check if it's a 'visited' region (numeric UID) or 'all' region
      const isVisitedRegion = uidString && !isNaN(parseInt(uidString, 10));
      const isExpanded = regionBlock.classList.contains('expanded');

      // Only try to expand visited regions by UID, 'all' regions are handled by showAll
      if (!isExpanded && isVisitedRegion) {
        const uid = parseInt(uidString, 10);
        console.log(
          `[RegionUI] Visited region ${regionName} (uid: ${uid}) is collapsed, expanding...`
        );
        // Find the corresponding object in visitedRegions to set expanded state
        const regionData = this.visitedRegions.find((r) => r.uid === uid);
        if (regionData) {
          regionData.expanded = true;
          this.renderAllRegions(); // Re-render to reflect expansion
          // Re-query the element after re-render
          const newRegionBlock = this.regionsContainer.querySelector(
            `.region-block[data-region="${regionName}"][data-uid="${uid}"]`
          );
          if (newRegionBlock) {
            regionBlock = newRegionBlock; // Update reference if found
          } else {
            console.error(
              '[RegionUI] Region block lost after expansion re-render.'
            );
          }
        }
      }

      // Scroll the region block into view
      console.log(`[RegionUI] Scrolling ${regionName} into view...`);
      regionBlock.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest', // Use 'nearest' to minimize scrolling
      });

      // Add a temporary highlight class
      regionBlock.classList.add('highlight-region');
      setTimeout(() => {
        regionBlock.classList.remove('highlight-region');
      }, 1500); // Highlight for 1.5 seconds
    } else {
      console.warn(`[RegionUI] Could not find region block for ${regionName}.`);
      // Optionally, temporarily enable 'showAll' and try again?
      // Or display a message to the user?
    }
  }

  /**
   * Navigate to a specific location in a region
   * @param {string} locationName - The name of the location
   * @param {string} regionName - The name of the region containing the location
   */
  navigateToLocation(locationName, regionName) {
    console.log(
      `[RegionUI] Navigating to location: ${locationName} in ${regionName}`
    );

    // Ensure the region block itself is visible first (might require expanding)
    // We assume navigateToRegion was already called or the region is visible.
    const regionBlock = this.regionsContainer.querySelector(
      `.region-block[data-region="${regionName}"]`
    );

    if (!regionBlock) {
      console.warn(
        `[RegionUI] Cannot navigate to location ${locationName}. Parent region block ${regionName} not found or not rendered.`
      );
      // Attempt to force the region to be visible, similar to navigateToRegion
      this.navigateToRegion(regionName); // Call navigateToRegion to handle visibility
      // Retry finding the location after a delay to allow rendering
      setTimeout(() => this.navigateToLocation(locationName, regionName), 200);
      return;
    }

    // Ensure the region is expanded if it's a visited region
    if (regionBlock.classList.contains('collapsed')) {
      const uidString = regionBlock.dataset.uid;
      const isVisitedRegion = uidString && !isNaN(parseInt(uidString, 10));
      if (isVisitedRegion) {
        console.log(
          `[RegionUI] Expanding region ${regionName} to find location ${locationName}.`
        );
        this.toggleRegionByUID(parseInt(uidString, 10));
        // Retry after a delay to allow re-render
        setTimeout(
          () => this.navigateToLocation(locationName, regionName),
          200
        );
        return;
      }
    }

    // Now try to find and scroll to the location within the visible region block
    // Use a more specific selector targeting the location link within the wrapper
    const locationElement = regionBlock.querySelector(
      `.location-wrapper .location-link[data-location="${locationName}"]`
    );
    if (locationElement) {
      console.log(`[RegionUI] Scrolling to location ${locationName}.`);
      locationElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Highlight the parent wrapper for better visibility
      const wrapper = locationElement.closest('.location-wrapper');
      if (wrapper) {
        wrapper.classList.add('highlight-location');
        setTimeout(() => {
          wrapper.classList.remove('highlight-location');
        }, 2000);
      }
    } else {
      console.warn(
        `[RegionUI] Could not find location element for ${locationName} within region ${regionName}.`
      );
    }
  }

  /**
   * Create a clickable link for a location name
   * @param {string} locationName - The name of the location
   * @param {string} regionName - The region containing this location
   * @returns {HTMLElement} - A clickable span element
   */
  createLocationLink(locationName, regionName) {
    // Just call commonUI directly, which now handles event publishing
    return commonUI.createLocationLink(
      locationName,
      regionName,
      this.colorblindMode
    );
  }

  buildRegionBlock(rData, regionName, expanded, uid, useColorblind) {
    // Outer container
    const regionBlock = document.createElement('div');
    regionBlock.classList.add('region-block');
    regionBlock.dataset.uid = uid;
    regionBlock.dataset.region = regionName;
    regionBlock.classList.add(expanded ? 'expanded' : 'collapsed');
    regionBlock.classList.toggle('colorblind-mode', useColorblind);

    // Check if we have a valid inventory before evaluating rules
    const inventory = stateManager?.inventory;
    if (!inventory) {
      return document.createElement('div'); // Return empty div if no inventory
    }

    const isAccessible = stateManager.isRegionReachable(regionName);

    // Check if Loop Mode is active
    const isLoopModeActive = window.loopUIInstance?.isLoopModeActive;

    // In Loop Mode, only show discovered regions
    if (isLoopModeActive && !loopState.isRegionDiscovered(regionName)) {
      return document.createElement('div'); // Return empty div for undiscovered regions
    }

    // Header
    const headerEl = document.createElement('div');
    headerEl.classList.add('region-header');
    const regionLabel = regionName + this._suffixIfDuplicate(regionName, uid);

    headerEl.innerHTML = `
    <span class="region-name" style="color: ${
      isAccessible ? 'inherit' : 'red'
    }">${regionLabel}${
      this.colorblindMode
        ? `<span class="colorblind-symbol ${
            isAccessible ? 'accessible' : 'inaccessible'
          }">
        ${isAccessible ? ' ✓' : ' ✗'}
      </span>`
        : ''
    }</span>
    <button class="collapse-btn">${expanded ? 'Collapse' : 'Expand'}</button>
  `;
    regionBlock.appendChild(headerEl);

    // Collapse button event listener
    headerEl.querySelector('.collapse-btn').addEventListener('click', () => {
      this.toggleRegionByUID(uid);
    });

    if (expanded) {
      const detailEl = document.createElement('div');
      detailEl.classList.add('region-details');

      detailEl.innerHTML += `
      <div><strong>Light world?</strong> ${rData.is_light_world}</div>
      <div><strong>Dark world?</strong> ${rData.is_dark_world}</div>
    `;

      // Region rules
      if (rData.region_rules?.length > 0) {
        const rrContainer = document.createElement('div');
        rrContainer.innerHTML = '<h4>Region Rules</h4>';
        rData.region_rules.forEach((rule, idx) => {
          const logicDiv = document.createElement('div');
          logicDiv.classList.add('logic-tree');
          logicDiv.innerHTML = `<strong>Rule #${idx + 1}:</strong>`;
          logicDiv.appendChild(commonUI.renderLogicTree(rule, useColorblind));
          rrContainer.appendChild(logicDiv);
        });
        detailEl.appendChild(rrContainer);
      }

      // Exits
      if (rData.exits?.length > 0) {
        const exitsContainer = document.createElement('div');
        exitsContainer.classList.add('region-exits-container');
        exitsContainer.innerHTML = '<h4>Exits</h4>';

        rData.exits.forEach((exit) => {
          const exitWrapper = document.createElement('div');
          exitWrapper.classList.add('exit-wrapper');

          // Remove inventory parameter
          const canAccess = evaluateRule(exit.access_rule);
          const colorClass = canAccess ? 'accessible' : 'inaccessible';

          // In Loop Mode, check if the exit is discovered
          let isDiscovered = true;
          const showExplored =
            document.getElementById('show-explored')?.checked ?? true;

          if (isLoopModeActive) {
            isDiscovered = loopState.isExitDiscovered(regionName, exit.name);
            // Skip this exit if it's not discovered and we're not showing explored
            if (!isDiscovered && !showExplored) {
              return; // Using 'return' here inside forEach callback instead of 'continue'
            }
          }

          // Create wrapper for exit info
          const exitInfo = document.createElement('span');
          exitInfo.classList.add(colorClass);

          // In Loop Mode, show ??? for undiscovered exits
          const exitName =
            isLoopModeActive && !isDiscovered ? '???' : exit.name;
          exitInfo.textContent = `${exitName} → `;

          if (!isDiscovered) {
            exitInfo.classList.add('undiscovered-exit');
          }

          // Add connected region as a link if it exists
          if (exit.connected_region) {
            let connectedRegionName = exit.connected_region;

            // In Loop Mode, check if the connected region is discovered
            if (isLoopModeActive) {
              const isConnectedRegionDiscovered = loopState.isRegionDiscovered(
                exit.connected_region
              );
              if (!isConnectedRegionDiscovered) {
                connectedRegionName = '???';
              }
            }

            const regionLink = this.createRegionLink(connectedRegionName);
            regionLink.dataset.realRegion = exit.connected_region; // Store the real region name
            regionLink.classList.add(colorClass);

            if (
              isLoopModeActive &&
              !loopState.isRegionDiscovered(exit.connected_region)
            ) {
              regionLink.classList.add('undiscovered-region');
            }

            exitInfo.appendChild(regionLink);
          } else {
            exitInfo.textContent += '(none)';
          }

          exitWrapper.appendChild(exitInfo);

          // Add move button
          const moveBtn = document.createElement('button');
          moveBtn.classList.add('move-btn');
          moveBtn.textContent = 'Move';
          moveBtn.disabled = !(canAccess && exit.connected_region);

          // In Loop Mode, disable the button for undiscovered exits
          if (isLoopModeActive && !isDiscovered) {
            moveBtn.disabled = true;
          }

          moveBtn.addEventListener('click', () => {
            if (canAccess && exit.connected_region) {
              this.moveToRegion(regionName, exit.connected_region);
            }
          });
          exitWrapper.appendChild(moveBtn);

          if (exit.access_rule) {
            const logicTreeDiv = document.createElement('div');
            logicTreeDiv.classList.add('logic-tree');
            logicTreeDiv.appendChild(
              commonUI.renderLogicTree(exit.access_rule, useColorblind)
            );
            exitWrapper.appendChild(logicTreeDiv);
          }

          exitsContainer.appendChild(exitWrapper);
        });

        detailEl.appendChild(exitsContainer);
      }

      // Locations
      if (rData.locations?.length > 0) {
        const locContainer = document.createElement('div');
        locContainer.classList.add('region-locations-container');
        locContainer.innerHTML = '<h4>Locations</h4>';

        rData.locations.forEach((loc) => {
          const locDiv = document.createElement('div');
          locDiv.classList.add('location-wrapper');

          // Remove inventory parameter
          const canAccess = evaluateRule(loc.access_rule);
          const isChecked = stateManager.isLocationChecked(loc.name);
          const colorClass = isChecked
            ? 'checked-loc'
            : canAccess
            ? 'accessible'
            : 'inaccessible';

          // In Loop Mode, check if the location is discovered
          let isDiscovered = true;
          const showExplored =
            document.getElementById('show-explored')?.checked ?? true;

          if (isLoopModeActive) {
            isDiscovered = loopState.isLocationDiscovered(loc.name);
            if (!isDiscovered && !showExplored) {
              return; // Skip this location if it's not discovered and we're not showing explored
            }
          }

          // Create a location link instead of a simple span
          const locationName =
            isLoopModeActive && !isDiscovered ? '???' : loc.name;
          const locLink = this.createLocationLink(locationName, regionName);
          locLink.dataset.realName = loc.name; // Store the real location name
          locLink.classList.add(colorClass);

          if (isLoopModeActive && !isDiscovered) {
            locLink.classList.add('undiscovered-location');
          }

          locDiv.appendChild(locLink);

          // Add check button and check mark
          const checkBtn = document.createElement('button');
          checkBtn.classList.add('check-loc-btn');
          checkBtn.textContent = 'Check';
          checkBtn.style.display = isChecked ? 'none' : '';
          checkBtn.disabled = !canAccess;

          // In Loop Mode, disable the button for undiscovered locations
          if (isLoopModeActive && !isDiscovered) {
            checkBtn.disabled = true;
          }

          checkBtn.addEventListener('click', async () => {
            if (canAccess && !isChecked) {
              try {
                // Use the already imported messageHandler
                if (
                  messageHandler &&
                  typeof messageHandler.checkLocation === 'function'
                ) {
                  // This will handle server communication and prevent duplicates
                  await messageHandler.checkLocation(loc);
                } else {
                  // Fallback to original behavior if messageHandler not available
                  this._handleLocalCheck(loc);
                }
              } catch (error) {
                console.error('Error checking location:', error);
                // Fallback to original behavior on error
                this._handleLocalCheck(loc);
              }

              // Always update the UI after checking
              this.renderAllRegions();
            }
          });
          locDiv.appendChild(checkBtn);

          if (isChecked) {
            const checkMark = document.createElement('span');
            checkMark.classList.add('check-mark');
            checkMark.textContent = '✓';
            locDiv.appendChild(checkMark);
          }

          if (loc.access_rule) {
            const logicTreeDiv = document.createElement('div');
            logicTreeDiv.classList.add('logic-tree');
            logicTreeDiv.appendChild(
              commonUI.renderLogicTree(loc.access_rule, useColorblind)
            );
            locDiv.appendChild(logicTreeDiv);
          }

          locContainer.appendChild(locDiv);
        });

        detailEl.appendChild(locContainer);
      }

      // Add Show Paths button at the bottom of the region details
      const pathsControlDiv = document.createElement('div');
      pathsControlDiv.classList.add('paths-control');
      pathsControlDiv.innerHTML = `
      <div class="paths-buttons">
        <button class="analyze-paths-btn">Analyze Paths</button>
        <span class="paths-count" style="display: none;"></span>
      </div>
    `;
      detailEl.appendChild(pathsControlDiv);

      // Add the paths container
      const pathsContainer = document.createElement('div');
      pathsContainer.classList.add('region-paths');
      pathsContainer.style.display = 'none';
      detailEl.appendChild(pathsContainer);

      // Comprehensive "Analyze Paths" button functionality
      const analyzePathsBtn =
        pathsControlDiv.querySelector('.analyze-paths-btn');
      const pathsCountSpan = pathsControlDiv.querySelector('.paths-count');

      // Set up the path analysis button using the PathAnalyzerUI
      this.setupAnalyzePathsButton(
        analyzePathsBtn,
        pathsCountSpan,
        pathsContainer,
        regionName
      );

      // Append detailEl to regionBlock
      regionBlock.appendChild(detailEl);
    }

    return regionBlock;
  }

  setupAnalyzePathsButton(
    analyzePathsBtn,
    pathsCountSpan,
    pathsContainer,
    regionName
  ) {
    // Delegate to PathAnalyzerUI
    this.pathAnalyzer.setupAnalyzePathsButton(
      analyzePathsBtn,
      pathsCountSpan,
      pathsContainer,
      regionName
    );
  }

  _suffixIfDuplicate(regionName, uid) {
    // count how many times regionName appears in visited, up to this uid
    const countSoFar = this.visitedRegions.filter(
      (r) => r.name === regionName && r.uid <= uid
    ).length;
    // if it's the first occurrence, return ''
    // if it's the second, return ' (2)', etc.
    return countSoFar > 1 ? ` (${countSoFar})` : '';
  }

  /**
   * Toggles colorblind mode and updates the UI
   */
  toggleColorblindMode() {
    this.colorblindMode = !this.colorblindMode;

    // Update the path analyzer's colorblind mode as well
    this.pathAnalyzer.setColorblindMode(this.colorblindMode);

    // Sync with commonUI
    commonUI.setColorblindMode(this.colorblindMode);

    // Update colorblind indicators in the UI
    this._updateColorblindIndicators();
  }

  /**
   * Helper method to update colorblind indicators across the UI
   */
  _updateColorblindIndicators() {
    // Update all region link indicators (This logic is now handled by commonUI.createRegionLink)
    /* // Old implementation commented out
     this.rootElement.querySelectorAll('.region-link').forEach((link) => {
        // ... (symbol update logic) ...
     });
    */

    // Update logic nodes within this panel
    this.rootElement.querySelectorAll('.logic-node').forEach((node) => {
      const isPassing = node.classList.contains('pass');

      // Remove existing symbol
      const existingSymbol = node.querySelector('.colorblind-symbol');
      if (existingSymbol) existingSymbol.remove();

      // Add new symbol if needed
      if (
        this.colorblindMode &&
        (node.classList.contains('pass') || node.classList.contains('fail'))
      ) {
        const symbolSpan = document.createElement('span');
        symbolSpan.classList.add('colorblind-symbol');
        symbolSpan.textContent = isPassing ? ' ✓' : ' ✗';
        symbolSpan.classList.add(isPassing ? 'accessible' : 'inaccessible');
        node.insertBefore(symbolSpan, node.firstChild); // Insert at beginning
      }
    });
  }

  /**
   * Helper method to handle location checks locally when messageHandler is unavailable
   * @param {Object} location - The location object to check
   * @private
   */
  _handleLocalCheck(location) {
    console.log(
      `[RegionUI] Routing local check for ${location.name} (ID: ${location.id}) through MessageHandler`
    );
    // Use the globally accessible messageHandler instance
    const handler = window.messageHandler || messageHandler;
    handler.checkLocation(location).catch((error) => {
      console.error(
        `[RegionUI] Error calling messageHandler.checkLocation:`,
        error
      );
      // Optional: Display an error message to the user
    });
  }
}

export default RegionUI;
