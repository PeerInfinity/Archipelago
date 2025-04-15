// regionUI.js
import stateManager from '../core/stateManagerSingleton.js';
import { evaluateRule } from '../core/ruleEngine.js';
import { PathAnalyzerUI } from './pathAnalyzerUI.js';
import commonUI from './commonUI.js';
import messageHandler from '../../client/core/messageHandler.js';
import loopState from '../core/loop/loopState.js';

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
          uid
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
          uid
        );
        container.appendChild(regionBlock);
      }
    }
  }

  createRegionLink(regionName) {
    return commonUI.createRegionLink(
      regionName,
      this.colorblindMode,
      (regionName, e) => {
        e.stopPropagation();
        this.navigateToRegion(regionName);
      }
    );
  }

  /**
   * Navigate to a specific region in the regions panel
   * @param {string} regionName - The name of the region to navigate to
   */
  navigateToRegion(regionName) {
    // Switch to the regions view
    this.gameUI.setViewMode('regions');

    // Important: Set the radio button for regions view
    document.querySelector(
      'input[name="view-mode"][value="regions"]'
    ).checked = true;

    // Enable "Show all regions" if it's not already enabled
    const showAllCheckbox = this.rootElement.querySelector('#show-all-regions');
    if (showAllCheckbox && !showAllCheckbox.checked) {
      showAllCheckbox.checked = true;
      this.showAll = true;
      this.renderAllRegions();
    }

    // Wait for the rendering to complete, then scroll to the region
    setTimeout(() => {
      const regionElement = document.querySelector(
        `.region-block[data-region="${regionName}"]`
      );
      if (regionElement) {
        // Expand the region if it's collapsed
        if (!regionElement.classList.contains('expanded')) {
          const uid = regionElement.dataset.uid;
          this.toggleRegionByUID(uid);
        }

        // Scroll the region into view
        regionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Highlight the region briefly
        regionElement.classList.add('highlight-region');
        setTimeout(() => {
          regionElement.classList.remove('highlight-region');
        }, 2000);
      }
    }, 100);
  }

  /**
   * Navigate to a specific location in a region
   * @param {string} locationName - The name of the location
   * @param {string} regionName - The name of the region containing the location
   */
  navigateToLocation(locationName, regionName) {
    // First navigate to the region
    this.navigateToRegion(regionName);

    // Then wait a bit longer and try to find and scroll to the location
    setTimeout(() => {
      const locationElement = document.querySelector(
        `.region-block[data-region="${regionName}"] .location-wrapper:has(span[data-location="${locationName}"])`
      );
      if (locationElement) {
        locationElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        locationElement.classList.add('highlight-location');
        setTimeout(() => {
          locationElement.classList.remove('highlight-location');
        }, 2000);
      }
    }, 300);
  }

  /**
   * Create a clickable link for a location name
   * @param {string} locationName - The name of the location
   * @param {string} regionName - The region containing this location
   * @returns {HTMLElement} - A clickable span element
   */
  createLocationLink(locationName, regionName) {
    return commonUI.createLocationLink(
      locationName,
      regionName,
      this.colorblindMode,
      (locationName, regionName, e) => {
        e.stopPropagation();
        this.navigateToLocation(locationName, regionName);
      }
    );
  }

  buildRegionBlock(rData, regionName, expanded, uid) {
    // Outer container
    const regionBlock = document.createElement('div');
    regionBlock.classList.add('region-block');
    regionBlock.dataset.uid = uid;
    regionBlock.dataset.region = regionName;
    regionBlock.classList.add(expanded ? 'expanded' : 'collapsed');

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
          logicDiv.appendChild(commonUI.renderLogicTree(rule));
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
              commonUI.renderLogicTree(exit.access_rule)
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
            logicTreeDiv.appendChild(commonUI.renderLogicTree(loc.access_rule));
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
    // Update all region link indicators
    document.querySelectorAll('.region-link').forEach((link) => {
      // Remove any existing colorblind symbols
      const existingSymbol = link.querySelector('.colorblind-symbol');
      if (existingSymbol) existingSymbol.remove();

      // Get the region name and check if it's reachable
      const regionName = link.dataset.region;
      if (!regionName) return;

      const isReachable = stateManager.isRegionReachable(regionName);

      // Add colorblind symbol if needed
      if (this.colorblindMode) {
        const symbolSpan = document.createElement('span');
        symbolSpan.classList.add('colorblind-symbol');
        symbolSpan.textContent = isReachable ? ' ✓' : ' ✗';
        symbolSpan.classList.add(isReachable ? 'accessible' : 'inaccessible');
        link.appendChild(symbolSpan);
      }
    });

    // Update logic nodes
    document.querySelectorAll('.logic-node').forEach((node) => {
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
    // Only process locally if there's an item
    if (location.item) {
      console.log(`Processing location check locally: ${location.name}`);
      this.gameUI.inventoryUI.modifyItemCount(location.item.name);
      stateManager.checkLocation(location.name);
    }
  }
}

export default RegionUI;
