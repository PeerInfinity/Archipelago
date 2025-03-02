// regionUI.js
import stateManager from './stateManagerSingleton.js';
import { evaluateRule } from './ruleEngine.js';

export class RegionUI {
  constructor(gameUI) {
    this.gameUI = gameUI;
    this.regionData = {};

    /**
     * visitedRegions is an array of objects:
     * [{ name: 'Links House', expanded: true, uid: 0 }, ...]
     */
    this.visitedRegions = [];

    // A simple counter to give each visited region block a unique ID
    this.nextUID = 1;

    // If set to true, we'll show **all** regions, ignoring the visited chain
    this.showAll = false;

    this.attachEventListeners();
  }

  attachEventListeners() {
    const showAllRegionsCheckbox = document.getElementById('show-all-regions');
    if (showAllRegionsCheckbox) {
      showAllRegionsCheckbox.addEventListener('change', (e) => {
        this.showAll = e.target.checked;
        this.renderAllRegions();
      });
    }

    const expandCollapseAllButton = document.getElementById(
      'expand-collapse-all'
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

  initialize(regionData) {
    this.regionData = regionData;
    this.log(`RegionUI: Loaded ${Object.keys(regionData).length} regions.`);
    this.showStartRegion('Menu');
  }

  clear() {
    this.visitedRegions = [];
    this.nextUID = 1;
    const regionsContainer = document.getElementById('regions-panel');
    if (regionsContainer) {
      regionsContainer.innerHTML = '';
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
    if (!this.regionData[startRegionName]) {
      this.log(
        `Warning: start region ${startRegionName} not found in regionData.`
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
      Object.keys(this.regionData).forEach((regionName, index) => {
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
      Object.keys(this.regionData).forEach((regionName, index) => {
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
    const container = document.getElementById('regions-panel');
    if (!container) {
      this.log('No #regions-panel element found');
      return;
    }
    container.innerHTML = '';

    if (this.showAll) {
      // Show all regions ignoring path logic
      Object.keys(this.regionData).forEach((regionName, index) => {
        const rData = this.regionData[regionName];
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
        const rData = this.regionData[regionName];
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

  findPathsToRegion(targetRegion, maxPaths = 100) {
    const startRegions = stateManager.getStartRegions();
    const allPaths = [];

    for (const startRegion of startRegions) {
      if (allPaths.length >= maxPaths) break;
      this._findPathsDFS(
        startRegion,
        targetRegion,
        [startRegion],
        new Set([startRegion]),
        allPaths,
        maxPaths
      );
    }

    return allPaths;
  }

  _findPathsDFS(
    currentRegion,
    targetRegion,
    currentPath,
    visited,
    allPaths,
    maxPaths
  ) {
    if (currentRegion === targetRegion && currentPath.length > 1) {
      allPaths.push([...currentPath]);
      return;
    }

    if (allPaths.length >= maxPaths) return;

    const regionData = this.regionData[currentRegion];
    if (!regionData) return;

    for (const exit of regionData.exits || []) {
      const nextRegion = exit.connected_region;
      if (!nextRegion || visited.has(nextRegion)) continue;

      currentPath.push(nextRegion);
      visited.add(nextRegion);
      this._findPathsDFS(
        nextRegion,
        targetRegion,
        currentPath,
        visited,
        allPaths,
        maxPaths
      );
      currentPath.pop();
      visited.delete(nextRegion);
    }
  }

  createRegionLink(regionName) {
    const link = document.createElement('span');
    link.textContent = regionName;
    link.classList.add('region-link');
    link.dataset.region = regionName;
    link.title = `Click to view the ${regionName} region`;

    link.addEventListener('click', (e) => {
      e.stopPropagation();
      this.navigateToRegion(regionName);
    });

    return link;
  }
  /*
  createLocationLink(locationName, regionName) {
    const link = document.createElement('span');
    link.textContent = locationName;
    link.classList.add('location-link');
    link.dataset.location = locationName;
    link.dataset.region = regionName;
    link.title = `Click to view the ${regionName} region containing this location`;

    link.addEventListener('click', (e) => {
      e.stopPropagation();
      this.navigateToRegion(regionName);
    });

    return link;
  }
*/

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
    const showAllCheckbox = document.getElementById('show-all-regions');
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
    const link = document.createElement('span');
    link.textContent = locationName;
    link.classList.add('location-link');
    link.dataset.location = locationName;
    link.dataset.region = regionName;
    link.title = `Click to view ${locationName} in the ${regionName} region`;

    link.addEventListener('click', (e) => {
      e.stopPropagation();
      this.navigateToLocation(locationName, regionName);
    });

    return link;
  }

  // Update buildRegionBlock method to move the Show Paths button to the bottom
  // and implement the new path display functionality
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

    // Header
    const headerEl = document.createElement('div');
    headerEl.classList.add('region-header');
    const regionLabel = regionName + this._suffixIfDuplicate(regionName, uid);

    headerEl.innerHTML = `
    <span class="region-name" style="color: ${
      isAccessible ? 'inherit' : 'red'
    }">${regionLabel}</span>
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
          logicDiv.appendChild(this.renderLogicTree(rule));
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

          // Create wrapper for exit info
          const exitInfo = document.createElement('span');
          exitInfo.classList.add(colorClass);
          exitInfo.textContent = `${exit.name} → `;

          // Add connected region as a link if it exists
          if (exit.connected_region) {
            const regionLink = this.createRegionLink(exit.connected_region);
            regionLink.classList.add(colorClass);
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
          moveBtn.addEventListener('click', () => {
            if (canAccess && exit.connected_region) {
              this.moveToRegion(regionName, exit.connected_region);
            }
          });
          exitWrapper.appendChild(moveBtn);

          if (exit.access_rule) {
            const logicTreeDiv = document.createElement('div');
            logicTreeDiv.classList.add('logic-tree');
            logicTreeDiv.appendChild(this.renderLogicTree(exit.access_rule));
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

          // Create a location link instead of a simple span
          const locLink = this.createLocationLink(loc.name, regionName);
          locLink.classList.add(colorClass);
          locDiv.appendChild(locLink);

          // Add check button and check mark
          const checkBtn = document.createElement('button');
          checkBtn.classList.add('check-loc-btn');
          checkBtn.textContent = 'Check';
          checkBtn.style.display = isChecked ? 'none' : '';
          checkBtn.disabled = !canAccess;
          checkBtn.addEventListener('click', () => {
            if (canAccess && !isChecked && loc.item) {
              this.gameUI.inventoryUI.modifyItemCount(loc.item.name);
              stateManager.checkLocation(loc.name);
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
            logicTreeDiv.appendChild(this.renderLogicTree(loc.access_rule));
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
        <button class="show-paths-btn">Show Paths</button>
        <span class="paths-count" style="display: none;"></span>
        <button class="clear-paths-btn" style="display: none;">Clear Paths</button>
        <button class="show-exit-rules-btn" style="display: none;">Show Exit Rules</button>
      </div>
    `;
      detailEl.appendChild(pathsControlDiv);

      // Add the paths container
      const pathsContainer = document.createElement('div');
      pathsContainer.classList.add('region-paths');
      pathsContainer.style.display = 'none';
      detailEl.appendChild(pathsContainer);

      regionBlock.appendChild(detailEl);

      // Add Show Paths button functionality
      const showPathsBtn = pathsControlDiv.querySelector('.show-paths-btn');
      const clearPathsBtn = pathsControlDiv.querySelector('.clear-paths-btn');
      const showExitRulesBtn = pathsControlDiv.querySelector(
        '.show-exit-rules-btn'
      );
      const pathsCountSpan = pathsControlDiv.querySelector('.paths-count');
      let cachedPaths = null;
      let pathsShown = 0;
      let exitRulesVisible = false;

      showPathsBtn.addEventListener('click', () => {
        // First click, calculate all paths
        if (!cachedPaths) {
          // Calculate paths with a higher limit
          cachedPaths = this.findPathsToRegion(regionName, 101); // Get one extra to check if we have more than 100

          // Format the count display
          const totalPaths = cachedPaths.length;
          const countDisplay =
            totalPaths > 100 ? '100+' : totalPaths.toString();
          pathsCountSpan.textContent = `(0/${countDisplay})`;
          pathsCountSpan.style.display = 'inline';

          // Update button text and show Clear button
          showPathsBtn.textContent = 'Show More';
          clearPathsBtn.style.display = 'inline';
          showExitRulesBtn.style.display = 'inline';

          // Make the paths container visible and add header
          pathsContainer.style.display = 'block';
          pathsContainer.innerHTML = '<h4>Paths to this region:</h4>';

          // If we have more than 100 paths, trim the list
          if (cachedPaths.length > 100) {
            cachedPaths = cachedPaths.slice(0, 100);
          }
        }

        // Show up to 10 more paths
        const pathsToShow = Math.min(10, cachedPaths.length - pathsShown);
        for (let i = 0; i < pathsToShow; i++) {
          const path = cachedPaths[pathsShown + i];
          const pathEl = this.renderPath(path, pathsShown + i);
          pathsContainer.appendChild(pathEl);
        }

        // Update the count of displayed paths
        pathsShown += pathsToShow;

        // Update the paths count display
        const totalPaths =
          cachedPaths.length > 100 ? '100+' : cachedPaths.length.toString();
        pathsCountSpan.textContent = `(${pathsShown}/${totalPaths})`;

        // Disable the Show More button if we've shown all paths
        if (pathsShown >= cachedPaths.length) {
          showPathsBtn.disabled = true;
          showPathsBtn.textContent = 'All Paths Shown';
        }
      });

      // Clear paths button functionality
      clearPathsBtn.addEventListener('click', () => {
        // Hide and clear the paths container
        pathsContainer.style.display = 'none';
        pathsContainer.innerHTML = '';

        // Reset the buttons and counter
        pathsCountSpan.style.display = 'none';
        clearPathsBtn.style.display = 'none';
        showExitRulesBtn.style.display = 'none';
        showPathsBtn.textContent = 'Show Paths';
        showPathsBtn.disabled = false;

        // Reset the cached data
        cachedPaths = null;
        pathsShown = 0;
        exitRulesVisible = false;
      });

      // Show Exit Rules button functionality
      showExitRulesBtn.addEventListener('click', () => {
        exitRulesVisible = !exitRulesVisible;
        showExitRulesBtn.textContent = exitRulesVisible
          ? 'Hide Exit Rules'
          : 'Show Exit Rules';

        // Toggle visibility of all exit rule containers
        document
          .querySelectorAll('.path-exit-rule-container')
          .forEach((container) => {
            container.style.display = exitRulesVisible ? 'block' : 'none';
          });

        // Show/hide the Compile List button based on exitRulesVisible state
        compileListBtn.style.display = exitRulesVisible ? 'inline' : 'none';

        // Hide the compiled list container if we're hiding exit rules
        if (!exitRulesVisible) {
          const compiledListContainer = pathsContainer.querySelector(
            '.compiled-rules-list'
          );
          if (compiledListContainer) {
            compiledListContainer.style.display = 'none';
          }
        }
      });

      // Add Compile List button after the Show Exit Rules button
      const compileListBtn = document.createElement('button');
      compileListBtn.classList.add('compile-list-btn');
      compileListBtn.textContent = 'Compile List';
      compileListBtn.style.display = 'none';
      showExitRulesBtn.after(compileListBtn);

      // Compile List button functionality
      compileListBtn.addEventListener('click', () => {
        // Find all visible exit rule containers
        const exitRuleContainers = pathsContainer.querySelectorAll(
          '.path-exit-rule-container'
        );

        // Extract failing nodes from all visible containers
        const failingNodes = [];
        exitRuleContainers.forEach((container) => {
          if (container.style.display === 'block') {
            const ruleContainer = container.querySelector('.path-exit-rule');
            if (ruleContainer && ruleContainer.firstChild) {
              const failingNodesFromRule = this.extractFailingLeafNodes(
                ruleContainer.firstChild
              );
              failingNodes.push(...failingNodesFromRule);
            }
          }
        });

        // Deduplicate the failing nodes
        const uniqueFailingNodes = this.deduplicateFailingNodes(failingNodes);

        // Display the compiled list
        this.displayCompiledList(uniqueFailingNodes, pathsContainer);
      });
    }

    return regionBlock;
  }

  /**
   * Renders a path with support for showing exit rules
   * @param {Array} path - Array of region names in the path
   * @param {Number} pathIndex - Index of this path
   * @return {HTMLElement} - The path element
   */
  renderPath(path, pathIndex) {
    const pathEl = document.createElement('div');
    pathEl.classList.add('region-path');
    pathEl.dataset.pathIndex = pathIndex;

    // Create a path representation with colored region names
    const pathText = document.createElement('div');
    pathText.classList.add('path-regions');

    // Analyze the path to find transitions between accessible and inaccessible regions
    const transitionPoint = this.findAccessibilityTransition(path);

    path.forEach((region, index) => {
      // Check if the region is accessible
      const regionAccessible = stateManager.isRegionReachable(region);

      // Create a span for the region with the appropriate color
      const regionSpan = document.createElement('span');
      regionSpan.textContent = region;
      regionSpan.style.color = regionAccessible ? '#4caf50' : '#f44336';
      regionSpan.classList.add('region-link');
      regionSpan.dataset.region = region;
      regionSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        this.navigateToRegion(region);
      });

      // Add the region to the path
      pathText.appendChild(regionSpan);

      // Add an arrow between regions (except for the last one)
      if (index < path.length - 1) {
        const arrow = document.createElement('span');
        arrow.textContent = ' → ';
        pathText.appendChild(arrow);
      }
    });

    pathEl.appendChild(pathText);

    // Add exit rule container if there's a transition
    if (transitionPoint) {
      const { fromRegion, toRegion, exit } = transitionPoint;

      const exitRuleContainer = document.createElement('div');
      exitRuleContainer.classList.add('path-exit-rule-container');
      exitRuleContainer.style.display = 'none'; // Hidden by default

      // Create header showing which exit is blocked
      const exitHeader = document.createElement('div');
      exitHeader.classList.add('path-exit-header');
      exitHeader.innerHTML = `<strong>Blocked Exit:</strong> ${fromRegion} → ${exit.name} → ${toRegion}`;
      exitRuleContainer.appendChild(exitHeader);

      // Show the exit rule
      if (exit.access_rule) {
        const ruleContainer = document.createElement('div');
        ruleContainer.classList.add('path-exit-rule');
        ruleContainer.appendChild(this.renderLogicTree(exit.access_rule));
        exitRuleContainer.appendChild(ruleContainer);
      } else {
        exitRuleContainer.innerHTML +=
          '<div class="path-exit-rule">(No rule defined)</div>';
      }

      pathEl.appendChild(exitRuleContainer);
    }

    return pathEl;
  }

  /**
   * Finds the transition point between accessible and inaccessible regions in a path
   * @param {Array} path - Array of region names in the path
   * @return {Object|null} - Object containing the transition information or null if no transition
   */
  findAccessibilityTransition(path) {
    for (let i = 0; i < path.length - 1; i++) {
      const fromRegion = path[i];
      const toRegion = path[i + 1];

      const fromAccessible = stateManager.isRegionReachable(fromRegion);
      const toAccessible = stateManager.isRegionReachable(toRegion);

      // Found transition from accessible to inaccessible
      if (fromAccessible && !toAccessible) {
        // Find the exit from fromRegion to toRegion
        const fromRegionData = this.regionData[fromRegion];
        if (fromRegionData && fromRegionData.exits) {
          const exit = fromRegionData.exits.find(
            (e) => e.connected_region === toRegion
          );
          if (exit) {
            return { fromRegion, toRegion, exit };
          }
        }
      }
    }

    return null; // No transition found
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

  renderLogicTree(rule) {
    const root = document.createElement('div');
    root.classList.add('logic-node');

    if (!rule) {
      root.textContent = '(no rule)';
      return root;
    }

    const result = evaluateRule(rule);
    root.classList.toggle('pass', !!result);
    root.classList.toggle('fail', !result);

    const label = document.createElement('div');
    label.classList.add('logic-label');
    label.textContent = `Type: ${rule.type}`;
    root.appendChild(label);

    switch (rule.type) {
      case 'constant':
        root.appendChild(document.createTextNode(` value: ${rule.value}`));
        break;
      case 'item_check':
        root.appendChild(document.createTextNode(` item: ${rule.item}`));
        break;
      case 'count_check':
        root.appendChild(
          document.createTextNode(` ${rule.item} >= ${rule.count}`)
        );
        break;
      case 'group_check':
        root.appendChild(document.createTextNode(` group: ${rule.group}`));
        break;
      case 'helper':
        root.appendChild(
          document.createTextNode(
            ` helper: ${rule.name}, args: ${JSON.stringify(rule.args)}`
          )
        );
        break;
      case 'and':
      case 'or': {
        const ul = document.createElement('ul');
        rule.conditions.forEach((cond) => {
          const li = document.createElement('li');
          li.appendChild(this.renderLogicTree(cond));
          ul.appendChild(li);
        });
        root.appendChild(ul);
        break;
      }
      case 'state_method':
        root.appendChild(
          document.createTextNode(
            ` method: ${rule.method}, args: ${JSON.stringify(rule.args)}`
          )
        );
        break;
      default:
        root.appendChild(document.createTextNode(' [unhandled rule type] '));
    }
    return root;
  }

  /**
   * Extracts failing leaf nodes from a logic tree element
   * @param {HTMLElement} treeElement - The logic tree DOM element to analyze
   * @return {Array} - Array of failing leaf node information
   */
  extractFailingLeafNodes(treeElement) {
    const failingNodes = [];

    // Check if this is a failing node
    const isFailing = treeElement.classList.contains('fail');

    // Process based on node type
    if (isFailing) {
      const nodeType = this.getNodeType(treeElement);

      if (nodeType && this.isLeafNodeType(nodeType)) {
        // This is a failing leaf node, extract its data
        const nodeData = this.extractNodeData(treeElement, nodeType);
        if (nodeData) {
          failingNodes.push(nodeData);
        }
      } else {
        // For non-leaf nodes, recursively check children
        const childLists = treeElement.querySelectorAll('ul');
        childLists.forEach((ul) => {
          ul.querySelectorAll('li').forEach((li) => {
            if (li.firstChild) {
              const childFailingNodes = this.extractFailingLeafNodes(
                li.firstChild
              );
              failingNodes.push(...childFailingNodes);
            }
          });
        });
      }
    }

    return failingNodes;
  }

  /**
   * Determines the type of a logic node from its DOM element
   * @param {HTMLElement} element - The DOM element representing a logic node
   * @return {string|null} - The type of the logic node or null if not found
   */
  getNodeType(element) {
    const logicLabel = element.querySelector('.logic-label');
    if (logicLabel) {
      const typeMatch = logicLabel.textContent.match(/Type: (\w+)/);
      if (typeMatch && typeMatch[1]) {
        return typeMatch[1];
      }
    }
    return null;
  }

  /**
   * Checks if a node type is a leaf node type
   * @param {string} nodeType - The type of the logic node
   * @return {boolean} - True if it's a leaf node type, false otherwise
   */
  isLeafNodeType(nodeType) {
    return [
      'constant',
      'item_check',
      'count_check',
      'group_check',
      'helper',
      'state_method',
    ].includes(nodeType);
  }

  /**
   * Extracts data from a leaf node element based on its type
   * @param {HTMLElement} element - The DOM element representing a logic node
   * @param {string} nodeType - The type of the logic node
   * @return {Object|null} - The extracted node data or null if extraction failed
   */
  extractNodeData(element, nodeType) {
    const textContent = element.textContent;

    switch (nodeType) {
      case 'constant':
        const valueMatch = textContent.match(/value: (true|false)/i);
        if (valueMatch) {
          return {
            type: 'constant',
            value: valueMatch[1].toLowerCase() === 'true',
            display: `Constant: ${valueMatch[1]}`,
            identifier: `constant_${valueMatch[1]}`,
          };
        }
        break;

      case 'item_check':
        const itemMatch = textContent.match(/item: (.+?)($|\s)/);
        if (itemMatch) {
          return {
            type: 'item_check',
            item: itemMatch[1],
            display: `Missing item: ${itemMatch[1]}`,
            identifier: `item_${itemMatch[1]}`,
          };
        }
        break;

      case 'count_check':
        const countMatch = textContent.match(/(\w+) >= (\d+)/);
        if (countMatch) {
          return {
            type: 'count_check',
            item: countMatch[1],
            count: parseInt(countMatch[2], 10),
            display: `Need ${countMatch[2]}× ${countMatch[1]}`,
            identifier: `count_${countMatch[1]}_${countMatch[2]}`,
          };
        }
        break;

      case 'group_check':
        const groupMatch = textContent.match(/group: (.+?)($|\s)/);
        if (groupMatch) {
          return {
            type: 'group_check',
            group: groupMatch[1],
            display: `Missing group: ${groupMatch[1]}`,
            identifier: `group_${groupMatch[1]}`,
          };
        }
        break;

      case 'helper':
        const helperMatch = textContent.match(/helper: (.+?), args:/);
        if (helperMatch) {
          return {
            type: 'helper',
            name: helperMatch[1],
            display: `Helper function: ${helperMatch[1]} not satisfied`,
            identifier: `helper_${helperMatch[1]}`,
          };
        }
        break;

      case 'state_method':
        const methodMatch = textContent.match(/method: (.+?), args:/);
        if (methodMatch) {
          return {
            type: 'state_method',
            method: methodMatch[1],
            display: `State method: ${methodMatch[1]} not satisfied`,
            identifier: `method_${methodMatch[1]}`,
          };
        }
        break;
    }

    return null;
  }

  /**
   * Removes duplicate failing nodes
   * @param {Array} nodes - Array of failing node information
   * @return {Array} - Deduplicated array of failing nodes
   */
  deduplicateFailingNodes(nodes) {
    const uniqueNodes = [];
    const seenIdentifiers = new Set();

    nodes.forEach((node) => {
      if (!seenIdentifiers.has(node.identifier)) {
        seenIdentifiers.add(node.identifier);
        uniqueNodes.push(node);
      }
    });

    return uniqueNodes;
  }

  /**
   * Displays the compiled list of failing nodes
   * @param {Array} nodes - Array of failing node information to display
   * @param {HTMLElement} container - Container element to place the list
   */
  displayCompiledList(nodes, container) {
    // Check if the list already exists
    let compiledListContainer = container.querySelector('.compiled-rules-list');

    // If it doesn't exist, create it
    if (!compiledListContainer) {
      compiledListContainer = document.createElement('div');
      compiledListContainer.classList.add('compiled-rules-list');

      // Insert at the top of the paths container
      if (container.firstChild) {
        container.insertBefore(compiledListContainer, container.firstChild);
      } else {
        container.appendChild(compiledListContainer);
      }
    }

    // Clear the container and add the header
    compiledListContainer.innerHTML = '<h4>Blockers Preventing Access:</h4>';
    compiledListContainer.style.display = 'block';

    // If there are no failing nodes, show a message
    if (nodes.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.classList.add('compiled-rules-empty');
      emptyMessage.textContent =
        'No failing conditions found. This might be due to a region connection without a rule.';
      compiledListContainer.appendChild(emptyMessage);
      return;
    }

    // Create the list of failing nodes
    const failingList = document.createElement('ul');
    failingList.classList.add('compiled-rules-items');

    nodes.forEach((node) => {
      const listItem = document.createElement('li');
      listItem.classList.add('compiled-rule-item');
      listItem.textContent = node.display;

      // Add special class for item-related rules
      if (node.type === 'item_check' || node.type === 'count_check') {
        listItem.classList.add('item-related-rule');
      }

      failingList.appendChild(listItem);
    });

    compiledListContainer.appendChild(failingList);
  }
}

export default RegionUI;
