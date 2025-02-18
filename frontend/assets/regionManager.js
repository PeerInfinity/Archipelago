// regionManager.js

import { evaluateRule } from './ruleEngine.js';

/**
 * Manages region data, expansions, and logic display.
 */
export class RegionManager {
  constructor(logger) {
    /**
     * All region data, keyed by region.name
     * Populated from your JSON's `regions[1]`
     */
    this.regionData = {};

    /**
     * Keeps track of the current chain of "visited" regions in the UI.
     * The first region is the player's starting region (expanded),
     * and others are added if the user clicks an exit to move there.
     */
    this.visitedRegions = [];

    /**
     * For debug logging (optional).
     */
    this.logger = logger;

    /**
     * If partial updates are desired, store some state that indicates
     * whether we are mid-update, etc.
     */
    this.isUpdating = false;

    /**
     * For demonstration, we poll for interface updates at up to ~10 fps
     * if something is changed. You can adjust to your preference.
     */
    this.updateInterval = 100; // ms per chunk
    this.lastUpdateTime = 0;
  }

  /**
   * Loads the region data from your exported JSON, e.g., rulesData.regions['1'].
   */
  loadFromJSON(regionJson) {
    this.regionData = regionJson;
    // Optionally do any preprocessing (like BFS, adjacency, etc.) if needed
    this.log(
      `RegionManager: Loaded ${Object.keys(regionJson).length} regions.`
    );
  }

  /**
   * Log helper
   */
  log(msg) {
    if (this.logger) {
      this.logger.log(msg);
    } else {
      console.log(msg);
    }
  }

  /**
   * Initialize UI for a single start region (expanded).
   * This is typically called once when the game loads.
   */
  showStartRegion(startRegionName) {
    if (!this.regionData[startRegionName]) {
      this.log(
        `Warning: start region ${startRegionName} not found in regionData.`
      );
      return;
    }
    // Mark the visitedRegions chain. The first region is expanded by default.
    this.visitedRegions = [
      {
        name: startRegionName,
        expanded: true,
      },
    ];
    // Trigger an initial UI render
    this.renderAllRegions();
  }

  /**
   * Called whenever we want to “move” to a new region from an exit.
   * In the first version, we do this instantly (no queue).
   *
   * oldRegionName: the region we’re leaving
   * newRegionName: the region we’re going to
   */
  moveToRegion(oldRegionName, newRegionName) {
    // Collapse the old region
    const visited = this.visitedRegions.find((r) => r.name === oldRegionName);
    if (visited) {
      visited.expanded = false;
    }

    // Add new region block below the old one
    if (!this.regionData[newRegionName]) {
      this.log(`Warning: cannot move to unknown region ${newRegionName}`);
      return;
    }

    // Insert the new region in visited chain
    this.visitedRegions.push({
      name: newRegionName,
      expanded: true,
    });

    // Re-render
    this.renderAllRegions();
  }

  /**
   * Toggle collapse/expand for an existing region block
   */
  toggleRegion(regionName) {
    const visited = this.visitedRegions.find((r) => r.name === regionName);
    if (!visited) return;

    visited.expanded = !visited.expanded;
    this.renderAllRegions();
  }

  /**
   * Re-renders the region UI in a container. This is the main function
   * that draws the chain of visited region blocks.
   */
  renderAllRegions() {
    const container = document.getElementById('regions-panel');
    if (!container) {
      this.log('No #regions-panel element found');
      return;
    }
    container.innerHTML = ''; // Clear existing content

    this.visitedRegions.forEach((regionObj) => {
      const rName = regionObj.name;
      const isExpanded = regionObj.expanded;
      const rData = this.regionData[rName];

      // Create outer block
      const regionBlock = document.createElement('div');
      regionBlock.classList.add('region-block');
      if (isExpanded) {
        regionBlock.classList.add('expanded');
      } else {
        regionBlock.classList.add('collapsed');
      }

      // Header area
      const headerEl = document.createElement('div');
      headerEl.classList.add('region-header');
      headerEl.innerHTML = `
        <span class="region-name">${rName}</span>
        <button class="collapse-btn">${
          isExpanded ? 'Collapse' : 'Expand'
        }</button>
      `;
      regionBlock.appendChild(headerEl);

      // Expand/collapse button
      headerEl.querySelector('.collapse-btn').addEventListener('click', () => {
        this.toggleRegion(rName);
      });

      if (isExpanded) {
        // Detailed info
        const detailEl = document.createElement('div');
        detailEl.classList.add('region-details');

        // Basic region info: e.g. is_light_world, dungeon, etc.
        detailEl.innerHTML += `
          <div><strong>Light world?</strong> ${rData.is_light_world}</div>
          <div><strong>Dark world?</strong> ${rData.is_dark_world}</div>
        `;

        // Show region-level rules (like region_data.region_rules, if you have them)
        if (rData.region_rules && rData.region_rules.length > 0) {
          const regionRulesContainer = document.createElement('div');
          regionRulesContainer.classList.add('region-rules-container');
          regionRulesContainer.innerHTML = `<h4>Region Rules</h4>`;
          rData.region_rules.forEach((rule, idx) => {
            const ruleDiv = document.createElement('div');
            ruleDiv.classList.add('logic-tree');
            ruleDiv.innerHTML = `<strong>Rule #${idx + 1}</strong>`;
            ruleDiv.appendChild(this.renderLogicTree(rule));
            regionRulesContainer.appendChild(ruleDiv);
          });
          detailEl.appendChild(regionRulesContainer);
        }

        // Show exits
        if (rData.exits && rData.exits.length > 0) {
          const exitsContainer = document.createElement('div');
          exitsContainer.classList.add('region-exits-container');
          exitsContainer.innerHTML = `<h4>Exits</h4>`;

          rData.exits.forEach((exit) => {
            const exitWrapper = document.createElement('div');
            exitWrapper.classList.add('exit-wrapper');

            // Evaluate rule to see if exit is accessible
            const canAccess = evaluateRule(
              exit.access_rule,
              window.gameUI?.inventory
            );
            const colorClass = canAccess ? 'accessible' : 'inaccessible';

            exitWrapper.innerHTML = `
              <span class="${colorClass}">
                ${exit.name} --> ${exit.connected_region ?? '(none)'}
              </span>
              <button class="move-btn" ${canAccess ? '' : 'disabled'}>
                Move
              </button>
            `;

            // The logic tree for debugging
            if (exit.access_rule) {
              const logicTreeDiv = document.createElement('div');
              logicTreeDiv.classList.add('logic-tree');
              logicTreeDiv.appendChild(this.renderLogicTree(exit.access_rule));
              exitWrapper.appendChild(logicTreeDiv);
            }

            // Move button
            exitWrapper
              .querySelector('.move-btn')
              .addEventListener('click', () => {
                if (canAccess && exit.connected_region) {
                  // In first version: immediate switch
                  this.moveToRegion(rName, exit.connected_region);
                }
              });

            exitsContainer.appendChild(exitWrapper);
          });

          detailEl.appendChild(exitsContainer);
        }

        // Show locations
        if (rData.locations && rData.locations.length > 0) {
          const locsContainer = document.createElement('div');
          locsContainer.classList.add('region-locations-container');
          locsContainer.innerHTML = `<h4>Locations</h4>`;

          rData.locations.forEach((loc) => {
            const locDiv = document.createElement('div');
            locDiv.classList.add('location-wrapper');
            // Evaluate location rule
            const canAccess = evaluateRule(
              loc.access_rule,
              window.gameUI?.inventory
            );
            const colorClass = canAccess ? 'accessible' : 'inaccessible';
            locDiv.innerHTML = `
              <span class="${colorClass}">${loc.name}</span>
              <button class="check-loc-btn" ${canAccess ? '' : 'disabled'}>
                Check
              </button>
            `;

            // For debugging, show location rule
            if (loc.access_rule) {
              const logicTreeDiv = document.createElement('div');
              logicTreeDiv.classList.add('logic-tree');
              logicTreeDiv.appendChild(this.renderLogicTree(loc.access_rule));
              locDiv.appendChild(logicTreeDiv);
            }

            // “Check location” immediate action
            locDiv
              .querySelector('.check-loc-btn')
              .addEventListener('click', () => {
                if (canAccess) {
                  // In first version, we immediately do the location check,
                  // add the item to inventory if present, etc.
                  this.log(`Checked location: ${loc.name}`);
                  if (loc.item) {
                    // If there's an item, pick it up
                    window.gameUI?.toggleItem(loc.item.name);
                  }
                  // Possibly mark the location as “found” or “collected”
                  // ... or do other logic as you prefer
                }
              });

            locsContainer.appendChild(locDiv);
          });

          detailEl.appendChild(locsContainer);
        }

        regionBlock.appendChild(detailEl);
      }

      // Append regionBlock to container
      container.appendChild(regionBlock);
    });
  }

  /**
   * Renders a fully expanded logic tree for debug.
   * Returns an HTML element representing the rule’s structure.
   */
  renderLogicTree(rule) {
    const root = document.createElement('div');
    root.classList.add('logic-node');

    if (!rule) {
      root.textContent = '(no rule)';
      return root;
    }

    // Evaluate pass/fail for coloring
    const result = evaluateRule(rule, window.gameUI?.inventory);
    root.classList.toggle('pass', !!result);
    root.classList.toggle('fail', !result);

    // Basic label
    const label = document.createElement('div');
    label.classList.add('logic-label');
    label.textContent = `Type: ${rule.type}`;
    root.appendChild(label);

    // Show details depending on rule.type
    switch (rule.type) {
      case 'constant':
        root.appendChild(document.createTextNode(` Value: ${rule.value}`));
        break;
      case 'item_check':
        root.appendChild(document.createTextNode(` Item: ${rule.item}`));
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
        const condList = document.createElement('ul');
        rule.conditions.forEach((cond) => {
          const li = document.createElement('li');
          li.appendChild(this.renderLogicTree(cond));
          condList.appendChild(li);
        });
        root.appendChild(condList);
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
        root.appendChild(document.createTextNode(` [unhandled rule type] `));
        break;
    }
    return root;
  }
}
