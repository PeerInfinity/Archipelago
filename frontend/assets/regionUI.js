// regionUI.js
import stateManager from './stateManagerSingleton.js';
import { evaluateRule } from './ruleEngine.js';

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

  initialize() {
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
    const container = document.getElementById('regions-panel');
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

    const regionData = stateManager.regions[currentRegion];
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

      // Set up the single unified button handler
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

  /**
   * Comprehensive handler for the Analyze Paths button
   * This replaces the separate Show Paths, Show Exit Rules, and Compile List functionality
   */
  setupAnalyzePathsButton(
    analyzePathsBtn,
    pathsCountSpan,
    pathsContainer,
    regionName
  ) {
    analyzePathsBtn.addEventListener('click', () => {
      // First: Is the paths container already showing analysis?
      if (pathsContainer.style.display === 'block') {
        // If already showing, clear and hide
        pathsContainer.style.display = 'none';
        pathsContainer.innerHTML = '';
        pathsCountSpan.style.display = 'none';
        analyzePathsBtn.textContent = 'Analyze Paths';
        return;
      }

      // Begin analysis
      analyzePathsBtn.textContent = 'Analyzing...';
      analyzePathsBtn.disabled = true;

      // Make sure paths container is visible
      pathsContainer.style.display = 'block';

      // 1. Find all paths to this region directly from stateManager
      const MAX_PATHS = 100;
      const allPaths = this.findPathsToRegion(regionName, MAX_PATHS);
      console.log(`Found ${allPaths.length} paths to region ${regionName}`);

      if (allPaths.length === 0) {
        // No paths found - show message and try analyzing direct connections
        pathsContainer.innerHTML =
          '<h4>Path Analysis Results:</h4><p>No paths found to this region. Analyzing direct connections...</p>';
        this._analyzeDirectConnections(regionName, pathsContainer);
        analyzePathsBtn.textContent = 'Clear Analysis';
        analyzePathsBtn.disabled = false;
        return;
      }

      // 2. Create categories for node analysis
      const allNodes = {
        primaryBlockers: [],
        secondaryBlockers: [],
        tertiaryBlockers: [],
        primaryRequirements: [],
        secondaryRequirements: [],
        tertiaryRequirements: [],
      };

      // 3. Create section for the requirement analysis
      const requirementsDiv = document.createElement('div');
      requirementsDiv.classList.add('compiled-results-container');
      requirementsDiv.innerHTML = '<h4>Path Requirements Analysis:</h4>';

      // 4. Display paths with their transitions
      const pathsDiv = document.createElement('div');
      pathsDiv.innerHTML = '<h4>Paths to this region:</h4>';

      // Show path count
      const countDisplay =
        allPaths.length >= MAX_PATHS
          ? `${MAX_PATHS}+`
          : allPaths.length.toString();
      pathsCountSpan.textContent = `(${allPaths.length} paths found)`;
      pathsCountSpan.style.display = 'inline';

      // Process each path - both for display and analysis
      allPaths.forEach((path, pathIndex) => {
        // Create path element
        const pathEl = document.createElement('div');
        pathEl.classList.add('region-path');
        pathEl.style.marginBottom = '10px';

        // Create the path visualization
        const pathText = document.createElement('div');
        pathText.classList.add('path-regions');

        // Analyze the transitions in this path
        const transitions = this._findAllTransitions(path);

        // Display the path regions
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

        // Add exit rule for transitions if any
        if (transitions.length > 0) {
          transitions.forEach((transition) => {
            if (!transition.exit.access_rule) return;

            // Create exit rule container
            const exitRuleContainer = document.createElement('div');
            exitRuleContainer.classList.add('path-exit-rule-container');
            exitRuleContainer.style.display = 'block'; // Always show by default
            exitRuleContainer.style.marginLeft = '20px';
            exitRuleContainer.style.marginTop = '5px';
            exitRuleContainer.style.marginBottom = '10px';
            exitRuleContainer.style.padding = '5px';
            exitRuleContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
            exitRuleContainer.style.borderLeft = '3px solid #f44336';

            // Create header for exit
            const exitHeader = document.createElement('div');
            exitHeader.classList.add('path-exit-header');
            exitHeader.innerHTML = `<strong>${
              transition.isBlocking ? 'Blocked Exit' : 'Exit'
            }:</strong> ${transition.fromRegion} → ${transition.exit.name} → ${
              transition.toRegion
            }`;
            exitRuleContainer.appendChild(exitHeader);

            // Show the exit rule
            const ruleContainer = document.createElement('div');
            ruleContainer.classList.add('path-exit-rule');

            // Create a DOM representation of the rule for both display and analysis
            const ruleElement = this.renderLogicTree(
              transition.exit.access_rule
            );
            ruleContainer.appendChild(ruleElement);
            exitRuleContainer.appendChild(ruleContainer);

            // Add to path element
            pathEl.appendChild(exitRuleContainer);

            // Analyze rules from this transition for our categories
            const nodeResults = this.extractCategorizedNodes(ruleElement);
            Object.keys(allNodes).forEach((key) => {
              allNodes[key].push(...nodeResults[key]);
            });
          });
        }

        // Add path to paths container
        pathsDiv.appendChild(pathEl);
      });

      // 5. Display the node categorization results
      this.displayCompiledList(allNodes, requirementsDiv);

      // 6. Add both sections to the container in the right order - requirements first
      pathsContainer.innerHTML = '';
      pathsContainer.appendChild(requirementsDiv);
      pathsContainer.appendChild(pathsDiv);

      // 7. Done analyzing - update button
      analyzePathsBtn.textContent = 'Clear Analysis';
      analyzePathsBtn.disabled = false;
    });
  }

  /**
   * Find all transitions in a path, including blocked and open transitions
   * @param {Array<string>} path - Array of region names
   * @returns {Array<Object>} - Array of transition objects
   */
  _findAllTransitions(path) {
    const transitions = [];

    for (let i = 0; i < path.length - 1; i++) {
      const fromRegion = path[i];
      const toRegion = path[i + 1];

      const fromAccessible = stateManager.isRegionReachable(fromRegion);
      const toAccessible = stateManager.isRegionReachable(toRegion);

      // Get the exit that connects these regions
      const fromRegionData = stateManager.regions[fromRegion];
      if (!fromRegionData || !fromRegionData.exits) continue;

      const exit = fromRegionData.exits.find(
        (e) => e.connected_region === toRegion
      );
      if (!exit) continue;

      // Add this transition to our list
      transitions.push({
        fromRegion,
        toRegion,
        exit,
        isBlocking: fromAccessible && !toAccessible,
      });
    }

    return transitions;
  }

  /**
   * Fallback analysis when no paths are found
   * @param {string} regionName - The region to analyze
   * @param {HTMLElement} container - Container to add results to
   */
  _analyzeDirectConnections(regionName, container) {
    const allNodes = {
      primaryBlockers: [],
      secondaryBlockers: [],
      tertiaryBlockers: [],
      primaryRequirements: [],
      secondaryRequirements: [],
      tertiaryRequirements: [],
    };

    const regionData = stateManager.regions[regionName];

    // 1. Analyze region's own rules
    if (regionData?.region_rules?.length > 0) {
      const rulesContainer = document.createElement('div');
      rulesContainer.innerHTML = '<h5>Region Rules:</h5>';
      container.appendChild(rulesContainer);

      regionData.region_rules.forEach((rule, idx) => {
        if (!rule) return;

        const ruleDiv = document.createElement('div');
        ruleDiv.style.marginLeft = '20px';
        ruleDiv.style.marginBottom = '10px';

        const ruleElement = this.renderLogicTree(rule);
        ruleDiv.appendChild(ruleElement);
        rulesContainer.appendChild(ruleDiv);

        // Analyze nodes
        const nodeResults = this.extractCategorizedNodes(ruleElement);
        Object.keys(allNodes).forEach((key) => {
          allNodes[key].push(...nodeResults[key]);
        });
      });
    }

    // 2. Analyze entrances to this region
    const entrancesContainer = document.createElement('div');
    entrancesContainer.innerHTML = '<h5>Entrances to this region:</h5>';
    let entranceCount = 0;

    Object.entries(stateManager.regions).forEach(
      ([otherRegionName, otherRegionData]) => {
        if (otherRegionName === regionName) return;

        if (otherRegionData.exits) {
          const entrances = otherRegionData.exits.filter(
            (exit) => exit.connected_region === regionName && exit.access_rule
          );

          if (entrances.length > 0) {
            entrances.forEach((entrance) => {
              entranceCount++;

              const entranceDiv = document.createElement('div');
              entranceDiv.style.marginLeft = '20px';
              entranceDiv.style.marginBottom = '15px';

              // Create header for this entrance
              const header = document.createElement('div');
              header.innerHTML = `<strong>From ${otherRegionName}:</strong> ${entrance.name}`;
              entranceDiv.appendChild(header);

              // Show the rule
              const ruleElement = this.renderLogicTree(entrance.access_rule);
              entranceDiv.appendChild(ruleElement);
              entrancesContainer.appendChild(entranceDiv);

              // Analyze nodes
              const nodeResults = this.extractCategorizedNodes(ruleElement);
              Object.keys(allNodes).forEach((key) => {
                allNodes[key].push(...nodeResults[key]);
              });
            });
          }
        }
      }
    );

    if (entranceCount > 0) {
      container.appendChild(entrancesContainer);
    } else {
      entrancesContainer.innerHTML += '<p>No entrances with rules found.</p>';
      container.appendChild(entrancesContainer);
    }

    // 3. Display requirement analysis
    const requirementsDiv = document.createElement('div');
    requirementsDiv.classList.add('compiled-results-container');
    requirementsDiv.innerHTML = '<h4>Requirements Analysis:</h4>';
    this.displayCompiledList(allNodes, requirementsDiv);

    // Insert requirements at the top
    container.insertBefore(requirementsDiv, container.firstChild);
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
   * Extract categorized leaf nodes from a logic tree element
   * @param {HTMLElement} treeElement - The logic tree DOM element to analyze
   * @return {Object} - Object containing the categorized node lists
   */
  extractCategorizedNodes(treeElement) {
    // Initialize result categories with the six new categories
    const nodes = {
      primaryBlockers: [],
      secondaryBlockers: [],
      tertiaryBlockers: [],
      primaryRequirements: [],
      secondaryRequirements: [],
      tertiaryRequirements: [],
    };

    // Check if this is a failing or passing node
    const isFailing = treeElement.classList.contains('fail');
    const isPassing = treeElement.classList.contains('pass');

    // Get the current tree evaluation result
    const treeEvaluationResult = isPassing;

    // Process based on node type
    const nodeType = this.getNodeType(treeElement);

    if (nodeType && this.isLeafNodeType(nodeType)) {
      // This is a leaf node, extract its data
      const nodeData = this.extractNodeData(treeElement, nodeType);

      if (nodeData) {
        // Categorize the node based on the new algorithm
        if (isFailing) {
          if (treeEvaluationResult) {
            // Tree already passes despite this node's failure - Tertiary blocker
            nodes.tertiaryBlockers.push(nodeData);
          } else {
            // Calculate what would happen if this node passed instead
            const hypotheticalResult = this.evaluateTreeWithNodeFlipped(
              treeElement,
              true
            );

            if (hypotheticalResult) {
              // Tree would pass if this node passed - Primary blocker
              nodes.primaryBlockers.push(nodeData);
            } else {
              // Tree would still fail - Secondary blocker
              nodes.secondaryBlockers.push(nodeData);
            }
          }
        } else if (isPassing) {
          if (!treeEvaluationResult) {
            // Tree already fails despite this node's passing - Tertiary requirement
            nodes.tertiaryRequirements.push(nodeData);
          } else {
            // Calculate what would happen if this node failed instead
            const hypotheticalResult = this.evaluateTreeWithNodeFlipped(
              treeElement,
              false
            );

            if (!hypotheticalResult) {
              // Tree would fail if this node failed - Primary requirement
              nodes.primaryRequirements.push(nodeData);
            } else {
              // Tree would still pass - Secondary requirement
              nodes.secondaryRequirements.push(nodeData);
            }
          }
        }
      }
    } else {
      // For non-leaf nodes, recursively check children
      const childLists = treeElement.querySelectorAll('ul');
      childLists.forEach((ul) => {
        ul.querySelectorAll('li').forEach((li) => {
          if (li.firstChild) {
            const childResults = this.extractCategorizedNodes(li.firstChild);
            // Merge results
            Object.keys(nodes).forEach((key) => {
              nodes[key].push(...childResults[key]);
            });
          }
        });
      });
    }

    return nodes;
  }

  /**
   * Evaluates what the tree result would be if a specific node's value was flipped
   * @param {HTMLElement} nodeElement - The node to flip
   * @param {boolean} newValue - The new value to assume for this node
   * @return {boolean} - The hypothetical tree evaluation result
   */
  evaluateTreeWithNodeFlipped(nodeElement, newValue) {
    // Find the root node of the tree
    let root = nodeElement;
    let parent = root.parentElement;

    while (parent) {
      if (
        parent.classList &&
        (parent.classList.contains('logic-tree') || parent.tagName === 'BODY')
      ) {
        break;
      }
      if (
        parent.classList &&
        (parent.classList.contains('pass') || parent.classList.contains('fail'))
      ) {
        root = parent;
      }
      parent = parent.parentElement;
    }

    // Now simulate evaluation with the flipped node
    return this.simulateEvaluation(root, nodeElement, newValue);
  }

  /**
   * Simulates rule evaluation with a specific node's value flipped
   * @param {HTMLElement} currentNode - Current node in the tree traversal
   * @param {HTMLElement} targetNode - The node to flip
   * @param {boolean} newTargetValue - The new value for the target node
   * @return {boolean} - The simulated evaluation result
   */
  simulateEvaluation(currentNode, targetNode, newTargetValue) {
    // If this is the target node, return the flipped value
    if (currentNode === targetNode) {
      return newTargetValue;
    }

    // Otherwise, evaluate based on the node type
    const nodeType = this.getNodeType(currentNode);
    if (!nodeType) return false;

    switch (nodeType) {
      case 'constant':
      case 'item_check':
      case 'count_check':
      case 'group_check':
      case 'helper':
      case 'state_method':
        // For leaf nodes, return their actual value unless they're the target
        return currentNode.classList.contains('pass');

      case 'and': {
        // For AND nodes, check all children - all must be true
        const childResults = [];
        const childLists = currentNode.querySelectorAll('ul');
        childLists.forEach((ul) => {
          ul.querySelectorAll('li').forEach((li) => {
            if (li.firstChild) {
              childResults.push(
                this.simulateEvaluation(
                  li.firstChild,
                  targetNode,
                  newTargetValue
                )
              );
            }
          });
        });
        return childResults.every(Boolean);
      }

      case 'or': {
        // For OR nodes, check all children - at least one must be true
        const childResults = [];
        const childLists = currentNode.querySelectorAll('ul');
        childLists.forEach((ul) => {
          ul.querySelectorAll('li').forEach((li) => {
            if (li.firstChild) {
              childResults.push(
                this.simulateEvaluation(
                  li.firstChild,
                  targetNode,
                  newTargetValue
                )
              );
            }
          });
        });
        return childResults.some(Boolean);
      }

      default:
        return false;
    }
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
   * Deduplicates a list of nodes, treating functions with different args as unique
   * @param {Array} nodes - List of nodes to deduplicate
   * @return {Array} - Deduplicated list
   */
  deduplicateNodes(nodes) {
    const uniqueNodes = [];
    const seenIdentifiers = new Set();

    nodes.forEach((node) => {
      // Create an identifier that includes function arguments if present
      let identifier = node.identifier;

      // If this is a helper node or state_method node with args, include them in the identifier
      if (
        (node.type === 'helper' || node.type === 'state_method') &&
        node.args
      ) {
        // Use a consistent string representation of the args
        const argsString =
          typeof node.args === 'string' ? node.args : JSON.stringify(node.args);

        identifier = `${identifier}:${argsString}`;
      }

      if (!seenIdentifiers.has(identifier)) {
        seenIdentifiers.add(identifier);
        uniqueNodes.push(node);
      }
    });

    return uniqueNodes;
  }

  /**
   * Extract data from nodes, ensuring function arguments are properly captured
   */
  extractNodeData(element, nodeType) {
    const textContent = element.textContent;
    const isFailing = element.classList.contains('fail');
    // Default display color - red for failing nodes, green for passing nodes
    const displayColor = isFailing ? '#f44336' : '#4caf50';

    switch (nodeType) {
      case 'constant':
        const valueMatch = textContent.match(/value: (true|false)/i);
        if (valueMatch) {
          return {
            type: 'constant',
            value: valueMatch[1].toLowerCase() === 'true',
            display: `Constant: ${valueMatch[1]}`,
            displayElement: this._createNodeDisplay(
              'Constant:',
              valueMatch[1],
              displayColor
            ),
            identifier: `constant_${valueMatch[1]}`,
          };
        }
        break;

      case 'item_check':
        const itemMatch = textContent.match(
          /item: ([^,]+?)($|\s(?:Type:|helper:|method:|group:))/
        );
        if (itemMatch) {
          const itemName = itemMatch[1].trim();
          return {
            type: 'item_check',
            item: itemName,
            display: `Need item: ${itemName}`,
            displayElement: this._createNodeDisplay(
              'Need item:',
              itemName,
              displayColor
            ),
            identifier: `item_${itemName}`,
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
            displayElement: this._createNodeDisplay(
              `Need ${countMatch[2]}×`,
              countMatch[1],
              displayColor
            ),
            identifier: `count_${countMatch[1]}_${countMatch[2]}`,
          };
        }
        break;

      case 'group_check':
        const groupMatch = textContent.match(
          /group: ([^,]+?)($|\s(?:Type:|helper:|method:|item:))/
        );
        if (groupMatch) {
          const groupName = groupMatch[1].trim();
          return {
            type: 'group_check',
            group: groupName,
            display: `Need group: ${groupName}`,
            displayElement: this._createNodeDisplay(
              'Need group:',
              groupName,
              displayColor
            ),
            identifier: `group_${groupName}`,
          };
        }
        break;

      case 'helper':
        // Extract both the helper name and its arguments
        const helperMatch = textContent.match(
          /helper: ([^,]+?), args: (\[.*\]|\{.*\}|".*?"|null|\d+)/
        );
        if (helperMatch) {
          const helperName = helperMatch[1].trim();
          const helperArgs = helperMatch[2].trim();

          // Create the base display text and element with colored function name
          const displayElement = this._createNodeDisplay(
            'Helper function:',
            helperName,
            displayColor
          );

          // Add formatted arguments (as DOM elements)
          const argsElement = this.formatArguments(helperArgs);
          if (argsElement) {
            displayElement.appendChild(argsElement);
          }

          return {
            type: 'helper',
            name: helperName,
            args: helperArgs, // Save raw args string for deduplication
            display:
              `Helper function: ${helperName}` + (argsElement ? ' (...)' : ''),
            displayElement: displayElement,
            identifier: `helper_${helperName}`, // Base identifier, args handled in deduplication
          };
        }
        break;

      case 'state_method':
        // Extract both the method name and its arguments
        const methodMatch = textContent.match(
          /method: ([^,]+?), args: (\[.*\]|\{.*\}|".*?"|null|\d+)/
        );
        if (methodMatch) {
          const methodName = methodMatch[1].trim();
          const methodArgs = methodMatch[2].trim();

          // Create the base display text and element with colored method name
          const displayElement = this._createNodeDisplay(
            'State method:',
            methodName,
            displayColor
          );

          // Add formatted arguments (as DOM elements)
          const argsElement = this.formatArguments(methodArgs);
          if (argsElement) {
            displayElement.appendChild(argsElement);
          }

          return {
            type: 'state_method',
            method: methodName,
            args: methodArgs, // Save raw args string for deduplication
            display:
              `State method: ${methodName}` + (argsElement ? ' (...)' : ''),
            displayElement: displayElement,
            identifier: `method_${methodName}`, // Base identifier, args handled in deduplication
          };
        }
        break;
    }

    return null;
  }

  /**
   * Create a display element with label text and colored value
   * @param {string} label - The label text (e.g., "Need item:")
   * @param {string} value - The value to display (e.g., "Moon Pearl")
   * @param {string} valueColor - The color for the value
   * @returns {HTMLElement} - The created display element
   * @private
   */
  _createNodeDisplay(label, value, valueColor) {
    const container = document.createElement('span');

    // Add the label in white color
    const labelSpan = document.createElement('span');
    labelSpan.textContent = `${label} `;
    labelSpan.style.color = '#e0e0e0'; // White-ish color for labels
    container.appendChild(labelSpan);

    // Add the value with the specified color
    const valueSpan = document.createElement('span');
    valueSpan.textContent = value;
    valueSpan.style.color = valueColor;
    container.appendChild(valueSpan);

    return container;
  }

  /**
   * Format arguments for display in a user-friendly way
   * @param {String} argsString - JSON string of arguments
   * @return {HTMLElement|null} - DOM element containing formatted arguments or null if no args
   */
  formatArguments(argsString) {
    try {
      // Handle empty args
      if (argsString === '[]' || argsString === '{}') {
        return null;
      }

      // Try to parse the JSON
      let args;
      try {
        args = JSON.parse(argsString);
      } catch (e) {
        // If parsing fails, return a simple text node with the raw string
        const span = document.createElement('span');
        span.textContent = ` (${argsString})`;
        span.style.color = '#e0e0e0'; // Light gray color for better visibility
        return span;
      }

      // Create a container for the arguments
      const container = document.createElement('span');
      container.textContent = ' (';
      container.style.color = '#e0e0e0'; // Light gray color for better visibility

      if (Array.isArray(args)) {
        if (args.length === 0) return null;

        // Process each argument
        args.forEach((arg, index) => {
          if (index > 0) {
            const comma = document.createTextNode(', ');
            container.appendChild(comma);
          }

          // Check if the argument is a potential region name (string)
          if (typeof arg === 'string') {
            this._appendPossibleRegionLink(container, arg);
          } else {
            // For non-string values, use appropriate colors
            const textNode = document.createTextNode(JSON.stringify(arg));
            const span = document.createElement('span');

            // Color code based on value type
            if (typeof arg === 'number') {
              span.style.color = '#ffcf40'; // Gold color for numbers
            } else if (typeof arg === 'boolean') {
              span.style.color = arg ? '#80c080' : '#c08080'; // Green for true, red for false
            } else {
              span.style.color = '#c0c0ff'; // Light blue for other types
            }

            span.appendChild(textNode);
            container.appendChild(span);
          }
        });
      } else if (typeof args === 'object' && args !== null) {
        const entries = Object.entries(args);
        if (entries.length === 0) return null;

        // Process each key-value pair
        entries.forEach(([key, value], index) => {
          if (index > 0) {
            const comma = document.createTextNode(', ');
            container.appendChild(comma);
          }

          // Add the key with a specific color
          const keyNode = document.createTextNode(`${key}: `);
          const keySpan = document.createElement('span');
          keySpan.style.color = '#a0a0a0'; // Gray for keys
          keySpan.appendChild(keyNode);
          container.appendChild(keySpan);

          // Check if the value is a potential region name (string)
          if (typeof value === 'string') {
            this._appendPossibleRegionLink(container, value);
          } else {
            // For non-string values, use appropriate colors
            const textNode = document.createTextNode(JSON.stringify(value));
            const span = document.createElement('span');

            // Color code based on value type
            if (typeof value === 'number') {
              span.style.color = '#ffcf40'; // Gold color for numbers
            } else if (typeof value === 'boolean') {
              span.style.color = value ? '#80c080' : '#c08080'; // Green for true, red for false
            } else {
              span.style.color = '#c0c0ff'; // Light blue for other types
            }

            span.appendChild(textNode);
            container.appendChild(span);
          }
        });
      } else {
        // For primitive values
        if (typeof args === 'string') {
          this._appendPossibleRegionLink(container, args);
        } else {
          const textNode = document.createTextNode(args);
          const span = document.createElement('span');

          // Color code based on value type
          if (typeof args === 'number') {
            span.style.color = '#ffcf40'; // Gold color for numbers
          } else if (typeof args === 'boolean') {
            span.style.color = args ? '#80c080' : '#c08080'; // Green for true, red for false
          } else {
            span.style.color = '#c0c0ff'; // Light blue for other types
          }

          span.appendChild(textNode);
          container.appendChild(span);
        }
      }

      // Add closing parenthesis
      container.appendChild(document.createTextNode(')'));

      return container;
    } catch (e) {
      // If any error occurs in formatting, return a simple text node
      console.error('Error formatting arguments:', e);
      const span = document.createElement('span');
      span.textContent = ` (${argsString})`;
      span.style.color = '#e0e0e0'; // Light gray color for better visibility
      return span;
    }
  }

  /**
   * Helper function to check if a string is a region name and create a link if it is
   * @param {HTMLElement} container - The container to append to
   * @param {string} text - The text to check
   * @private
   */
  _appendPossibleRegionLink(container, text) {
    // Get the list of all known regions from stateManager.regions (not getRegions)
    const allRegions = Object.keys(stateManager.regions || {});

    // Check if the text matches a known region name
    if (allRegions.includes(text)) {
      // Check accessibility for color coding
      const regionAccessible = stateManager.isRegionReachable(text);

      // Create a span with appropriate styling
      const regionSpan = document.createElement('span');
      regionSpan.textContent = text;
      regionSpan.classList.add('region-link');
      regionSpan.dataset.region = text;
      regionSpan.style.color = regionAccessible ? '#4caf50' : '#f44336';
      regionSpan.style.cursor = 'pointer';
      regionSpan.style.textDecoration = 'underline';
      regionSpan.title = `Click to view the ${text} region`;

      // Store a reference to this (RegionUI instance)
      const self = this;

      // Create a proper event listener
      regionSpan.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();

        // Find the closest region-container to get the RegionUI instance
        const regionContainer = document.querySelector('.regions-container');
        if (regionContainer && regionContainer._regionUI) {
          regionContainer._regionUI.navigateToRegion(text);
        } else if (window.regionUI) {
          // Try global regionUI if available
          window.regionUI.navigateToRegion(text);
        } else if (self && typeof self.navigateToRegion === 'function') {
          // Try this instance if available
          self.navigateToRegion(text);
        } else {
          console.error('Could not find RegionUI instance to navigate');
        }

        return false;
      });

      container.appendChild(regionSpan);
    } else {
      // Not a region, use an appropriate color for string values
      const textNode = document.createTextNode(text);
      const span = document.createElement('span');
      span.style.color = '#c0ffff'; // Cyan color for strings
      span.appendChild(textNode);
      container.appendChild(span);
    }
  }

  /**
   * Checks if a node is in an OR branch
   * @param {HTMLElement} element - The element to check
   * @return {boolean} - True if the node is in an OR branch
   */
  isInOrBranch(element) {
    // Check parent nodes for an OR operator
    let current = element;
    while (current) {
      // Go up to the li if we're on a div
      if (current.tagName !== 'LI') {
        current = current.parentElement;
        continue;
      }

      // Check if the parent ul is under an OR node
      const parentUl = current.parentElement;
      if (parentUl && parentUl.tagName === 'UL') {
        const orNode = parentUl.parentElement;
        if (orNode) {
          const nodeType = this.getNodeType(orNode);
          if (nodeType === 'or') {
            return true;
          }
        }
      }

      current = current.parentElement;
    }

    return false;
  }

  /**
   * Checks if the node has any passing siblings
   * @param {HTMLElement} element - The element to check
   * @return {boolean} - True if the node has passing siblings
   */
  hasPassingSibling(element) {
    // Find the parent li element
    let currentElement = element;
    while (currentElement && currentElement.tagName !== 'LI') {
      currentElement = currentElement.parentElement;
    }

    if (!currentElement) return false;

    // Get the parent ul
    const parentUl = currentElement.parentElement;
    if (!parentUl) return false;

    // Check if any siblings have a passing class
    const siblings = parentUl.querySelectorAll('li > div.logic-node');
    for (const sibling of siblings) {
      if (sibling !== element && sibling.classList.contains('pass')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks if the node is the only failing node in its context
   * @param {HTMLElement} element - The element to check
   * @return {boolean} - True if the node is a solo blocker
   */
  isSoloBlocker(element) {
    // Find the topmost parent with the 'fail' class
    let current = element;
    let parent = current.parentElement;
    while (parent) {
      // Go up until we find a node with pass class or reach the top
      if (parent.classList && parent.classList.contains('pass')) {
        break;
      }

      if (parent.classList && parent.classList.contains('fail')) {
        current = parent;
      }

      parent = parent.parentElement;
    }

    // Now count the number of failing leaf nodes in this subtree
    const failingLeafNodes = this.countFailingLeafNodes(current);
    return failingLeafNodes === 1;
  }

  /**
   * Counts the number of failing leaf nodes in a tree
   * @param {HTMLElement} element - The root element to check
   * @return {number} - The count of failing leaf nodes
   */
  countFailingLeafNodes(element) {
    let count = 0;

    // Check if this is a failing leaf node
    if (element.classList.contains('fail')) {
      const nodeType = this.getNodeType(element);
      if (nodeType && this.isLeafNodeType(nodeType)) {
        return 1;
      }
    }

    // Recursively check children
    const childLists = element.querySelectorAll('ul');
    childLists.forEach((ul) => {
      ul.querySelectorAll('li').forEach((li) => {
        if (li.firstChild) {
          count += this.countFailingLeafNodes(li.firstChild);
        }
      });
    });

    return count;
  }

  /**
   * Checks if a passing node is critical (if it failed, would the tree fail?)
   * @param {HTMLElement} element - The element to check
   * @return {boolean} - True if the node is critical
   */
  isNodeCritical(element) {
    // For leaf nodes in AND branches, they're critical
    // For leaf nodes in OR branches with no other passing siblings, they're critical

    if (this.isInOrBranch(element)) {
      // In OR branch - critical only if no other siblings pass
      return !this.hasPassingSibling(element);
    } else {
      // In AND branch or root - critical by default
      return true;
    }
  }

  /**
   * Displays the compiled lists of nodes categorized by type
   * @param {Object} nodeLists - Object containing the categorized node lists
   * @param {HTMLElement} container - Container element to place the list
   */
  displayCompiledList(nodeLists, container) {
    // Clear any existing content
    container.innerHTML = '';

    // Add overall container with styling
    const listContainer = document.createElement('div');
    listContainer.classList.add('compiled-rules-list');
    listContainer.style.margin = '10px 0';
    listContainer.style.padding = '10px';
    listContainer.style.backgroundColor = '#2a2a2a';
    listContainer.style.borderRadius = '5px';
    listContainer.style.border = '1px solid #444';

    const {
      primaryBlockers,
      secondaryBlockers,
      tertiaryBlockers,
      primaryRequirements,
      secondaryRequirements,
      tertiaryRequirements,
    } = nodeLists;

    console.log('Node counts:', {
      primaryBlockers: primaryBlockers.length,
      secondaryBlockers: secondaryBlockers.length,
      tertiaryBlockers: tertiaryBlockers.length,
      primaryRequirements: primaryRequirements.length,
      secondaryRequirements: secondaryRequirements.length,
      tertiaryRequirements: tertiaryRequirements.length,
    });

    // Deduplicate all node lists
    const deduplicatedPrimaryBlockers = this.deduplicateNodes(primaryBlockers);
    const deduplicatedSecondaryBlockers =
      this.deduplicateNodes(secondaryBlockers);
    const deduplicatedTertiaryBlockers =
      this.deduplicateNodes(tertiaryBlockers);
    const deduplicatedPrimaryRequirements =
      this.deduplicateNodes(primaryRequirements);
    const deduplicatedSecondaryRequirements = this.deduplicateNodes(
      secondaryRequirements
    );
    const deduplicatedTertiaryRequirements =
      this.deduplicateNodes(tertiaryRequirements);

    console.log('After deduplication:', {
      primaryBlockers: deduplicatedPrimaryBlockers.length,
      secondaryBlockers: deduplicatedSecondaryBlockers.length,
      tertiaryBlockers: deduplicatedTertiaryBlockers.length,
      primaryRequirements: deduplicatedPrimaryRequirements.length,
      secondaryRequirements: deduplicatedSecondaryRequirements.length,
      tertiaryRequirements: deduplicatedTertiaryRequirements.length,
    });

    // Create sections for each node list with descriptive titles
    this._createNodeListSection(
      listContainer,
      deduplicatedPrimaryBlockers,
      'Primary Blockers',
      'These items directly block access. Acquiring them would unblock the path.',
      '#f44336' // Red color for blockers
    );

    this._createNodeListSection(
      listContainer,
      deduplicatedSecondaryBlockers,
      'Secondary Blockers',
      'These items are failing but are not the only blockers on their paths.',
      '#ff9800' // Orange color for secondary blockers
    );

    this._createNodeListSection(
      listContainer,
      deduplicatedTertiaryBlockers,
      'Tertiary Blockers',
      'These items are failing but do not affect path accessibility.',
      '#ffeb3b' // Yellow color for tertiary blockers
    );

    this._createNodeListSection(
      listContainer,
      deduplicatedPrimaryRequirements,
      'Primary Requirements',
      'These items are critical for access. Removing them would block the path.',
      '#4caf50' // Green color for requirements
    );

    this._createNodeListSection(
      listContainer,
      deduplicatedSecondaryRequirements,
      'Secondary Requirements',
      'These items are helping but are not critical. Other items could substitute.',
      '#2196f3' // Blue color for secondary requirements
    );

    this._createNodeListSection(
      listContainer,
      deduplicatedTertiaryRequirements,
      'Tertiary Requirements',
      'These items are satisfied but not affecting path accessibility.',
      '#9e9e9e' // Gray color for tertiary requirements
    );

    // If all sections are empty, show a message
    if (
      deduplicatedPrimaryBlockers.length === 0 &&
      deduplicatedSecondaryBlockers.length === 0 &&
      deduplicatedTertiaryBlockers.length === 0 &&
      deduplicatedPrimaryRequirements.length === 0 &&
      deduplicatedSecondaryRequirements.length === 0 &&
      deduplicatedTertiaryRequirements.length === 0
    ) {
      const emptyMsg = document.createElement('div');
      emptyMsg.textContent = 'No requirements found for this region.';
      emptyMsg.classList.add('empty-list-message');
      emptyMsg.style.padding = '10px';
      emptyMsg.style.fontStyle = 'italic';
      emptyMsg.style.color = '#aaa';
      emptyMsg.style.textAlign = 'center';
      listContainer.appendChild(emptyMsg);
    }

    container.appendChild(listContainer);
  }

  _createNodeListSection(container, nodes, title, description, sectionColor) {
    if (nodes.length === 0) return;

    const section = document.createElement('div');
    section.classList.add('node-list-section');
    section.style.margin = '10px 0';
    section.style.padding = '10px';
    section.style.backgroundColor = '#333';
    section.style.borderRadius = '4px';
    section.style.border = '1px solid #444';

    const header = document.createElement('h3');
    header.textContent = `${title} (${nodes.length})`;
    header.style.margin = '0 0 8px 0';
    header.style.fontSize = '16px';
    header.style.fontWeight = 'bold';
    header.style.color = '#fff';
    section.appendChild(header);

    const desc = document.createElement('p');
    desc.textContent = description;
    desc.classList.add('section-description');
    desc.style.margin = '0 0 10px 0';
    desc.style.fontSize = '13px';
    desc.style.color = '#aaa';
    section.appendChild(desc);

    const list = document.createElement('ul');
    list.style.margin = '8px 0';
    list.style.paddingLeft = '25px';
    list.style.listStyleType = 'disc';

    nodes.forEach((node) => {
      const item = document.createElement('li');
      item.style.margin = '4px 0';

      // Use displayElement if available, otherwise use display text
      if (node.displayElement) {
        // Clone the element and customize based on section
        const clonedElement = node.displayElement.cloneNode(true);

        // Find all value spans (the second child of each container)
        const valueSpans = clonedElement.querySelectorAll('span:nth-child(2)');
        valueSpans.forEach((span) => {
          // Override the color based on the section
          span.style.color = sectionColor;
        });

        item.appendChild(clonedElement);
      } else {
        item.textContent = node.display;
        item.style.color = sectionColor;
      }

      list.appendChild(item);
    });
    section.appendChild(list);

    container.appendChild(section);
  }
}

export default RegionUI;
