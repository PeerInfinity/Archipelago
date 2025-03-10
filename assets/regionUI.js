// regionUI.js
import stateManager from './stateManagerSingleton.js';
import { evaluateRule } from './ruleEngine.js';
import { PathAnalyzerUI } from './pathAnalyzerUI.js';

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

    // Add colorblind symbol if colorblind mode is enabled
    if (this.colorblindMode) {
      const symbolSpan = document.createElement('span');
      symbolSpan.classList.add('colorblind-symbol');

      if (result) {
        symbolSpan.textContent = '✓ ';
        symbolSpan.classList.add('accessible');
      } else {
        symbolSpan.textContent = '✗ ';
        symbolSpan.classList.add('inaccessible');
      }

      root.insertBefore(symbolSpan, root.firstChild); // Insert at beginning
    }

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
   * Toggles colorblind mode and updates the UI
   */
  toggleColorblindMode() {
    this.colorblindMode = !this.colorblindMode;

    // Update the path analyzer's colorblind mode as well
    this.pathAnalyzer.setColorblindMode(this.colorblindMode);

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
}

export default RegionUI;
