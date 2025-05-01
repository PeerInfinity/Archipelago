// regionUI.js
import { stateManagerSingleton } from '../stateManager/index.js';
import { evaluateRule } from '../stateManager/ruleEngine.js';
import { PathAnalyzerUI } from '../pathAnalyzer/index.js';
import commonUI from '../commonUI/index.js';
import messageHandler from '../client/core/messageHandler.js';
import loopStateSingleton from '../loops/loopStateSingleton.js';
import settingsManager from '../../app/core/settingsManager.js';
import eventBus from '../../app/core/eventBus.js';
import { debounce } from '../commonUI/index.js';
// Import the exported dispatcher from the module's index
import { moduleDispatcher } from './index.js';

export class RegionUI {
  constructor() {
    // Add instance property for unsubscribe handles
    this.unsubscribeHandles = [];

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

    // Subscribe to necessary events when the instance is created
    this._subscribeToEvents();

    this.attachEventListeners();
  }

  _subscribeToEvents() {
    console.log('[RegionUI] Subscribing instance to EventBus events...');
    if (!eventBus) {
      console.error('[RegionUI] EventBus not available for subscriptions.');
      return;
    }

    // Debounced update function
    const debouncedUpdate = debounce(() => {
      console.log('[RegionUI] Debounced update triggered.');
      this.update();
    }, 50); // 50ms debounce

    const subscribe = (eventName, handler) => {
      console.log(`[RegionUI] Subscribing to ${eventName}`);
      const unsubscribe = eventBus.subscribe(eventName, handler);
      this.unsubscribeHandles.push(unsubscribe);
    };

    // Specific handler for rules loaded to set initial state
    const rulesLoadedHandler = (data) => {
      console.log(`[RegionUI] Event received: stateManager:rulesLoaded`, data);
      // Attempt to show the start region first
      this.showStartRegion('Menu');
      // Then trigger a general update (debounced)
      debouncedUpdate();
    };

    // Wrap handlers with logging and use debounced update
    const updateHandler = (eventData) => {
      console.log(
        `[RegionUI] Event received, triggering debounced update. Event: ${eventData.eventName}`,
        eventData
      );
      debouncedUpdate();
    };

    const settingsHandler = ({ key, value }) => {
      if (key === '*' || key.startsWith('colorblindMode.regions')) {
        console.log(
          `[RegionUI] Settings changed (${key}), triggering debounced update.`
        );
        debouncedUpdate();
      }
    };

    // Subscribe to state changes that affect region display
    subscribe('stateManager:inventoryChanged', (data) =>
      updateHandler({ eventName: 'stateManager:inventoryChanged', data })
    );
    subscribe('stateManager:regionsComputed', (data) =>
      updateHandler({ eventName: 'stateManager:regionsComputed', data })
    );
    subscribe('stateManager:locationChecked', (data) =>
      updateHandler({ eventName: 'stateManager:locationChecked', data })
    );
    subscribe('stateManager:checkedLocationsCleared', (data) =>
      updateHandler({ eventName: 'stateManager:checkedLocationsCleared', data })
    );
    // Use specific handler for rulesLoaded
    subscribe('stateManager:rulesLoaded', rulesLoadedHandler);

    // Subscribe to loop state changes
    subscribe('loop:stateChanged', (data) =>
      updateHandler({ eventName: 'loop:stateChanged', data })
    );
    subscribe('loop:actionCompleted', (data) =>
      updateHandler({ eventName: 'loop:actionCompleted', data })
    );
    subscribe('loop:discoveryChanged', (data) =>
      updateHandler({ eventName: 'loop:discoveryChanged', data })
    );
    subscribe('loop:modeChanged', (data) =>
      updateHandler({ eventName: 'loop:modeChanged', data })
    );

    // Subscribe to settings changes
    subscribe('settings:changed', settingsHandler);

    console.log('[RegionUI] Event subscriptions complete.');
  }

  onPanelDestroy() {
    console.log('[RegionUI] Cleaning up subscriptions...');
    this.unsubscribeHandles.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeHandles = []; // Clear handles
    this.pathAnalyzer?.dispose?.();
    console.log('[RegionUI] Cleanup complete.');
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
    console.log('[RegionUI] Initialized (cleared container).');
  }

  clear() {
    this.visitedRegions = [];
    this.nextUID = 1;
    if (this.regionsContainer) {
      this.regionsContainer.innerHTML = '';
    }
  }

  update() {
    console.log('[RegionUI] update() called, calling renderAllRegions().');
    this.renderAllRegions();
  }

  showStartRegion(startRegionName) {
    // Ensure instance and regions are available before proceeding
    if (
      !stateManagerSingleton.instance ||
      !stateManagerSingleton.instance.regions ||
      !stateManagerSingleton.instance.regions[startRegionName]
    ) {
      console.warn(
        `[RegionUI] Warning: start region ${startRegionName} not found or state not ready.`
      );
      return false; // Indicate failure
    }
    console.log(`[RegionUI] Setting start region: ${startRegionName}`);
    this.visitedRegions = [
      {
        name: startRegionName,
        expanded: true,
        uid: this.nextUID++,
      },
    ];
    // Don't call renderAllRegions here, let the calling context handle it
    // this.renderAllRegions();
    return true; // Indicate success
  }

  moveToRegion(oldRegionName, newRegionName) {
    // 1. find the index of oldRegionName in visited array
    const oldIndex = this.visitedRegions.findIndex(
      (r) => r.name === oldRegionName
    );
    if (oldIndex < 0) {
      console.warn(
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
      if (
        !stateManagerSingleton.instance ||
        !stateManagerSingleton.instance.regions
      ) {
        console.warn(
          '[RegionUI] StateManager instance or regions not ready in expandAllRegions'
        );
        return;
      }
      Object.keys(stateManagerSingleton.instance.regions).forEach(
        (regionName, index) => {
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
        }
      );
    } else {
      this.visitedRegions.forEach((region) => {
        region.expanded = true;
      });
    }
    this.renderAllRegions();
  }

  collapseAllRegions() {
    if (this.showAll) {
      if (
        !stateManagerSingleton.instance ||
        !stateManagerSingleton.instance.regions
      ) {
        console.warn(
          '[RegionUI] StateManager instance or regions not ready in collapseAllRegions'
        );
        return;
      }
      Object.keys(stateManagerSingleton.instance.regions).forEach(
        (regionName, index) => {
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
        }
      );
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
      console.warn('[RegionUI] No #regions-panel-content element found');
      return;
    }
    container.innerHTML = '';

    // Get setting once for the panel
    const useRegionColorblind = settingsManager.getSetting(
      'colorblindMode.regions',
      true
    );

    const allRegionData = stateManagerSingleton.instance.regions;
    if (!allRegionData) {
      console.log(
        '[RegionUI] Region data not yet available in stateManagerSingleton.instance during renderAllRegions.'
      );
      container.innerHTML =
        '<div class="loading-message">Loading region data...</div>';
      return;
    }

    console.log(
      `[RegionUI] Rendering regions. ShowAll: ${this.showAll}, Visited Count: ${this.visitedRegions.length}`
    );

    if (this.showAll) {
      Object.keys(allRegionData).forEach((regionName, index) => {
        const rData = allRegionData[regionName];
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
        if (regionBlock) {
          container.appendChild(regionBlock);
        }
      });
    } else {
      // If visitedRegions is empty AND region data is available, try setting the start region
      if (this.visitedRegions.length === 0) {
        console.log(
          '[RegionUI] No visited regions, attempting to show start region.'
        );
        const success = this.showStartRegion('Menu'); // Try to set start region
        if (success) {
          // If successful, re-render immediately with the new visitedRegions list
          console.log('[RegionUI] Start region set, re-rendering...');
          // We need to re-query container/data as this is a recursive call essentially
          const currentContainer = this.regionsContainer;
          const currentData = stateManagerSingleton.instance.regions;
          if (currentContainer && currentData) {
            currentContainer.innerHTML = ''; // Clear loading message
            this.visitedRegions.forEach((regionObj) => {
              const rData = currentData[regionObj.name];
              if (rData) {
                const regionBlock = this.buildRegionBlock(
                  rData,
                  regionObj.name,
                  regionObj.expanded,
                  regionObj.uid,
                  settingsManager.getSetting('colorblindMode.regions', true)
                );
                if (regionBlock) {
                  currentContainer.appendChild(regionBlock);
                }
              }
            });
          }
        }
        // Whether success or failure, return here to avoid rendering empty list below
        return;
      }
      // Render existing visited regions
      for (const regionObj of this.visitedRegions) {
        const rData = allRegionData[regionObj.name];
        if (!rData) {
          continue;
        }
        const regionBlock = this.buildRegionBlock(
          rData,
          regionObj.name,
          regionObj.expanded,
          regionObj.uid,
          settingsManager.getSetting('colorblindMode.regions', true) // Get setting again
        );
        if (regionBlock) {
          container.appendChild(regionBlock);
        }
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
    if (!this.regionsContainer) {
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
          return;
        }
      } else {
        return;
      }
    }

    if (regionBlock) {
      const uidString = regionBlock.dataset.uid;

      // Use uidString to check if it's a 'visited' region (numeric UID) or 'all' region
      const isVisitedRegion = uidString && !isNaN(parseInt(uidString, 10));
      const isExpanded = regionBlock.classList.contains('expanded');

      // Only try to expand visited regions by UID, 'all' regions are handled by showAll
      if (!isExpanded && isVisitedRegion) {
        const uid = parseInt(uidString, 10);
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
          }
        }
      }

      // Scroll the region block into view
      regionBlock.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest', // Use 'nearest' to minimize scrolling
      });

      // Add a temporary highlight class
      regionBlock.classList.add('highlight-region');
      setTimeout(() => {
        regionBlock.classList.remove('highlight-region');
      }, 1500); // Highlight for 1.5 seconds
    }
  }

  /**
   * Navigate to a specific location in a region
   * @param {string} locationName - The name of the location
   * @param {string} regionName - The name of the region containing the location
   */
  navigateToLocation(locationName, regionName) {
    const regionBlock = this.regionsContainer.querySelector(
      `.region-block[data-region="${regionName}"]`
    );

    if (!regionBlock) {
      this.navigateToRegion(regionName); // Call navigateToRegion to handle visibility
      setTimeout(() => this.navigateToLocation(locationName, regionName), 200);
      return;
    }

    // Ensure the region is expanded if it's a visited region
    if (regionBlock.classList.contains('collapsed')) {
      const uidString = regionBlock.dataset.uid;
      const isVisitedRegion = uidString && !isNaN(parseInt(uidString, 10));
      if (isVisitedRegion) {
        this.toggleRegionByUID(parseInt(uidString, 10));
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
      locationElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Highlight the parent wrapper for better visibility
      const wrapper = locationElement.closest('.location-wrapper');
      if (wrapper) {
        wrapper.classList.add('highlight-location');
        setTimeout(() => {
          wrapper.classList.remove('highlight-location');
        }, 2000);
      }
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
    const inventory = stateManagerSingleton?.instance?.inventory;
    if (!inventory) {
      return document.createElement('div'); // Return empty div if no inventory
    }

    const isAccessible =
      stateManagerSingleton.instance.isRegionReachable(regionName);

    // Check if Loop Mode is active
    const isLoopModeActive = loopStateSingleton.isLoopModeActive;

    // In Loop Mode, only show discovered regions
    if (
      isLoopModeActive &&
      !loopStateSingleton.isRegionDiscovered(regionName)
    ) {
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
            isDiscovered = loopStateSingleton.isExitDiscovered(
              regionName,
              exit.name
            );
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
              const isConnectedRegionDiscovered =
                loopStateSingleton.isRegionDiscovered(exit.connected_region);
              if (!isConnectedRegionDiscovered) {
                connectedRegionName = '???';
              }
            }

            const regionLink = this.createRegionLink(connectedRegionName);
            regionLink.dataset.realRegion = exit.connected_region; // Store the real region name
            regionLink.classList.add(colorClass);

            if (
              isLoopModeActive &&
              !loopStateSingleton.isRegionDiscovered(exit.connected_region)
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
          const isChecked = stateManagerSingleton.instance.isLocationChecked(
            loc.name
          );
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
            isDiscovered = loopStateSingleton.isLocationDiscovered(loc.name);
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
    // Check if the location is actually checkable
    if (location.access_rule && !evaluateRule(location.access_rule)) {
      return; // Don't check locations that aren't accessible
    }

    console.log(
      `RegionUI: Handling local check for location: ${location.name} in ${location.regionName}`
    );

    // Use the imported moduleDispatcher directly
    if (moduleDispatcher) {
      moduleDispatcher.publish('user:checkLocationRequest', {
        locationName: location.name,
        regionName: location.regionName,
      });
    } else {
      console.error(
        '[RegionUI] Cannot publish user:checkLocationRequest: moduleDispatcher is not available.'
      );
    }
  }
}

export default RegionUI;
