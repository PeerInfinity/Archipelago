// pathAnalyzerUI.js
import { PathAnalyzerLogic } from './pathAnalyzerLogic.js';
import stateManager from './stateManagerSingleton.js';
import { evaluateRule } from './ruleEngine.js';
import commonUI from './commonUI.js';

/**
 * Handles UI aspects of path analysis for regions in the game
 * Uses PathAnalyzerLogic for the core algorithmic operations
 */
export class PathAnalyzerUI {
  constructor(regionUI) {
    this.regionUI = regionUI;

    // Create the logic component
    this.logic = new PathAnalyzerLogic();

    // UI configuration options
    this.colorblindMode = false;
  }

  /**
   * Sets the debug mode for both UI and logic components
   * @param {boolean} debug - Whether debug mode is enabled
   */
  setDebugMode(debug) {
    this.logic.setDebugMode(debug);
  }

  /**
   * Sets the colorblind mode
   * @param {boolean} mode - Whether colorblind mode is enabled
   */
  setColorblindMode(mode) {
    this.colorblindMode = mode;
    // Sync with commonUI
    commonUI.setColorblindMode(mode);
  }

  /**
   * Comprehensive handler for the Analyze Paths button with toggle controls
   * @param {HTMLButtonElement} analyzePathsBtn - The button that triggers analysis
   * @param {HTMLElement} pathsCountSpan - Element to display path counts
   * @param {HTMLElement} pathsContainer - Container to display paths in
   * @param {string} regionName - Region to analyze
   */
  setupAnalyzePathsButton(
    analyzePathsBtn,
    pathsCountSpan,
    pathsContainer,
    regionName
  ) {
    analyzePathsBtn.addEventListener('click', () => {
      // Clear existing analysis
      if (pathsContainer.style.display === 'block') {
        pathsContainer.style.display = 'none';
        pathsContainer.innerHTML = '';
        pathsCountSpan.style.display = 'none';
        analyzePathsBtn.textContent = 'Analyze Paths';

        const toggleContainer = document.querySelector('.path-toggle-controls');
        if (toggleContainer) toggleContainer.remove();

        return;
      }

      // Begin analysis
      analyzePathsBtn.textContent = 'Analyzing...';
      analyzePathsBtn.disabled = true;
      pathsContainer.style.display = 'block';

      /* PERFORMANCE WARNING - DISABLED
      // Add warning for potentially complex regions
      const regionData = stateManager.regions[regionName];
      if (regionData && Object.keys(stateManager.regions).length > 100) {
        const warningMessage = document.createElement('div');
        warningMessage.className = 'performance-warning';
        warningMessage.innerHTML = `
          <strong>⚠️ Performance Warning</strong>: This region is part of a complex world with many regions. 
          Path analysis may take longer than usual. Continue?
          <div class="warning-buttons">
            <button id="proceed-analysis" class="button">Proceed</button>
            <button id="cancel-analysis" class="button">Cancel</button>
          </div>
        `;

        pathsContainer.innerHTML = '';
        pathsContainer.appendChild(warningMessage);

        // Add event listeners for the warning buttons
        document
          .getElementById('proceed-analysis')
          .addEventListener('click', () => {
            // Continue with analysis, but with a lower path count limit
            this.performPathAnalysis(
              regionName,
              pathsContainer,
              pathsCountSpan,
              analyzePathsBtn,
              50
            ); // Lower max paths
          });

        document
          .getElementById('cancel-analysis')
          .addEventListener('click', () => {
            pathsContainer.style.display = 'none';
            pathsContainer.innerHTML = '';
            analyzePathsBtn.textContent = 'Analyze Paths';
            analyzePathsBtn.disabled = false;
          });

        return; // Exit early to show the warning first
      }
      END PERFORMANCE WARNING */

      // Normal case - proceed with analysis
      this.performPathAnalysis(
        regionName,
        pathsContainer,
        pathsCountSpan,
        analyzePathsBtn,
        100
      ); // Normal max paths
    });
  }

  /**
   * Perform the actual path analysis and create UI elements to display the results
   * @param {string} regionName - Region name to analyze paths for
   * @param {HTMLElement} pathsContainer - Container to display paths in
   * @param {HTMLElement} pathsCountSpan - Element to display path counts
   * @param {HTMLElement} analyzePathsBtn - The button that triggered the analysis
   * @param {number} maxPaths - Maximum number of paths to find
   */
  performPathAnalysis(
    regionName,
    pathsContainer,
    pathsCountSpan,
    analyzePathsBtn,
    maxPaths
  ) {
    pathsContainer.innerHTML = '';

    // PHASE 1: Check actual reachability using stateManager
    const isRegionActuallyReachable =
      stateManager.isRegionReachable(regionName);

    // Create the status indicator first - this will appear at the top
    const statusIndicator = document.createElement('div');
    statusIndicator.classList.add('region-status-indicator');
    statusIndicator.style.marginBottom = '15px';
    statusIndicator.style.padding = '10px';
    statusIndicator.style.borderRadius = '4px';

    // Create containers for analysis results
    const requirementsDiv = document.createElement('div');
    requirementsDiv.classList.add('compiled-results-container');
    requirementsDiv.id = 'path-summary-section';
    requirementsDiv.innerHTML = '<h4>Path Requirements Analysis:</h4>';

    const pathsDiv = document.createElement('div');
    pathsDiv.classList.add('path-regions-container');

    // PHASE 2: Perform traditional path analysis using the logic component
    const allPaths = this.logic.findPathsToRegion(regionName, maxPaths);

    // Track path statistics
    let accessiblePathCount = 0;
    let canonicalPath = null; // Will store the first viable path found

    // Process all paths as before
    const allNodes = {
      primaryBlockers: [],
      secondaryBlockers: [],
      tertiaryBlockers: [],
      primaryRequirements: [],
      secondaryRequirements: [],
      tertiaryRequirements: [],
    };

    if (allPaths.length > 0) {
      // Process and analyze paths
      allPaths.forEach((path, pathIndex) => {
        const transitions = this.logic.findAllTransitions(path);
        let pathHasIssues = false;

        // CRITICAL FIX: Check if this path is fully viable by ensuring every transition has at least one accessible exit
        for (const transition of transitions) {
          if (!transition.transitionAccessible) {
            pathHasIssues = true;
            break;
          }
        }

        if (!pathHasIssues) {
          accessiblePathCount++;
          if (!canonicalPath) {
            canonicalPath = path; // Store first viable path
          }
        }

        // Generate path element and add to container
        const pathEl = this._processPath(path, pathsDiv, allNodes, pathIndex);

        // If this is a viable path, mark it specially
        if (!pathHasIssues) {
          pathEl.classList.add('viable-path');
          pathEl.style.borderLeft = '3px solid #4caf50';
        }

        pathsDiv.appendChild(pathEl);
      });
    }

    // Set status indicator based on actual reachability and path analysis
    if (isRegionActuallyReachable) {
      if (accessiblePathCount > 0) {
        // Region is reachable and we found viable paths
        statusIndicator.style.backgroundColor = 'rgba(76, 175, 80, 0.2)';
        statusIndicator.style.border = '1px solid #4CAF50';
        statusIndicator.innerHTML = `
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-weight: bold; color: #4CAF50;">✓ Region Reachable</span>
            <span>This region is reachable with ${accessiblePathCount} viable path(s).</span>
          </div>
        `;
      } else {
        // Region is reachable but our path analysis didn't find viable paths
        statusIndicator.style.backgroundColor = 'rgba(255, 152, 0, 0.2)';
        statusIndicator.style.border = '1px solid #FF9800';
        statusIndicator.innerHTML = `
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-weight: bold; color: #FF9800;">⚠️ Algorithm Discrepancy</span>
            <span>This region is marked as reachable by stateManager, but no viable paths were found by path analysis. This suggests there may be special cases or complex rule interactions that the path finder doesn't handle correctly.</span>
          </div>
        `;
      }
    } else {
      // Region is not reachable
      statusIndicator.style.backgroundColor = 'rgba(244, 67, 54, 0.2)';
      statusIndicator.style.border = '1px solid #F44336';
      statusIndicator.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-weight: bold; color: #F44336;">✗ Region Unreachable</span>
          <span>This region is currently unreachable. Review the paths below to understand what's blocking access.</span>
        </div>
      `;
    }

    // Add all sections to the container
    pathsContainer.appendChild(statusIndicator);
    pathsContainer.appendChild(requirementsDiv);

    // Only show toggle controls if we found paths
    if (allPaths.length > 0) {
      // Add toggle controls for filtering paths
      const toggleContainer = this._createPathToggleControls(pathsContainer);
      pathsContainer.appendChild(toggleContainer);
    }

    // ADD CANONICAL PATH DISPLAY
    // If stateManager says region is reachable but we couldn't find viable paths,
    // display a canonical path derived from stateManager's internal data
    if (isRegionActuallyReachable && accessiblePathCount === 0) {
      // Find a canonical path using logic component
      const canonicalPathData = this.logic.findCanonicalPath(regionName);

      if (canonicalPathData && canonicalPathData.regions.length > 0) {
        // Create container for canonical path
        const canonicalPathContainer = document.createElement('div');
        canonicalPathContainer.classList.add('canonical-path-container');
        canonicalPathContainer.style.marginBottom = '20px';
        canonicalPathContainer.style.padding = '10px';
        canonicalPathContainer.style.backgroundColor = 'rgba(76, 175, 80, 0.1)';
        canonicalPathContainer.style.border = '1px solid #4CAF50';
        canonicalPathContainer.style.borderLeft = '4px solid #4CAF50';
        canonicalPathContainer.style.borderRadius = '4px';

        // Add a header
        const canonicalHeader = document.createElement('h4');
        canonicalHeader.textContent =
          'Canonical Path (derived from stateManager)';
        canonicalHeader.style.marginTop = '0';
        canonicalHeader.style.color = '#4CAF50';
        canonicalPathContainer.appendChild(canonicalHeader);

        // Create path visualization
        const pathDisplay = document.createElement('div');
        pathDisplay.classList.add('canonical-path-display');
        pathDisplay.style.marginBottom = '10px';

        // Add each region in the path with arrows between
        canonicalPathData.regions.forEach((region, index) => {
          // Create region link
          const regionLink = document.createElement('span');
          regionLink.textContent = region;
          regionLink.classList.add('region-link');
          regionLink.dataset.region = region;
          regionLink.style.color = '#4CAF50';
          regionLink.style.cursor = 'pointer';

          // Add event listener for navigation
          regionLink.addEventListener('click', (e) => {
            e.stopPropagation();
            this.regionUI.navigateToRegion(region);
          });

          // Add colorblind symbol if needed
          if (this.colorblindMode) {
            const symbolSpan = document.createElement('span');
            symbolSpan.classList.add('colorblind-symbol', 'accessible');
            symbolSpan.textContent = ' ✓';
            regionLink.appendChild(symbolSpan);
          }

          pathDisplay.appendChild(regionLink);

          // Add arrow if not the last item
          if (index < canonicalPathData.regions.length - 1) {
            const arrow = document.createElement('span');
            arrow.textContent = ' → ';
            arrow.style.color = '#4CAF50';
            pathDisplay.appendChild(arrow);
          }
        });

        canonicalPathContainer.appendChild(pathDisplay);

        // Add explanation
        const explanation = document.createElement('div');
        explanation.textContent =
          'This path shows a logically viable route to this region, determined by the stateManager.';
        explanation.style.fontStyle = 'italic';
        explanation.style.fontSize = '0.9em';
        explanation.style.color = '#666';
        canonicalPathContainer.appendChild(explanation);

        // Add connections details if available
        if (
          canonicalPathData.connections &&
          canonicalPathData.connections.length > 0
        ) {
          const connectionsHeader = document.createElement('div');
          connectionsHeader.textContent = 'Path Connections:';
          connectionsHeader.style.fontWeight = 'bold';
          connectionsHeader.style.marginTop = '10px';
          canonicalPathContainer.appendChild(connectionsHeader);

          const connectionsList = document.createElement('ul');
          connectionsList.style.marginTop = '5px';

          canonicalPathData.connections.forEach((connection) => {
            const item = document.createElement('li');
            item.textContent = `${connection.fromRegion} → ${connection.exit.name} → ${connection.toRegion}`;
            connectionsList.appendChild(item);
          });

          canonicalPathContainer.appendChild(connectionsList);
        }

        // Insert the canonical path at the top of the paths container
        pathsContainer.insertBefore(canonicalPathContainer, pathsDiv);
      }
    }

    // Add paths visualization
    pathsContainer.appendChild(pathsDiv);

    // Show empty message if no paths found
    if (allPaths.length === 0) {
      const noPathsMessage = document.createElement('div');
      noPathsMessage.classList.add('empty-message');
      noPathsMessage.innerHTML = `
        <p>No paths were found to this region. This could be due to:</p>
        <ul>
          <li>The region requires items or abilities we don't have</li>
          <li>The region has a non-standard access mechanism</li>
          <li>There's a bug in the path-finding algorithm</li>
        </ul>
      `;
      pathsDiv.appendChild(noPathsMessage);

      // Try to provide more details about why no paths were found
      this._analyzeDirectConnections(regionName, pathsDiv);
    }

    // Display paths count
    if (allPaths.length > 0) {
      pathsCountSpan.textContent = `(${allPaths.length} paths)`;
      pathsCountSpan.style.display = 'inline';
    }

    // Populate the requirements analysis section
    this.displayCompiledList(allNodes, requirementsDiv);

    // Only do this if we found at least one path
    if (allPaths.length > 0) {
      // Create show/hide all buttons
      const expandCollapseDiv = document.createElement('div');
      expandCollapseDiv.style.display = 'flex';
      expandCollapseDiv.style.justifyContent = 'flex-end';
      expandCollapseDiv.style.marginBottom = '10px';
      expandCollapseDiv.style.gap = '5px';

      const showAllBtn = document.createElement('button');
      showAllBtn.className = 'show-exit-rules-btn';
      showAllBtn.textContent = 'Show All Rules';
      showAllBtn.addEventListener('click', () => {
        document
          .querySelectorAll('.path-exit-rule-container')
          .forEach((container) => {
            container.style.display = 'block';
          });
      });

      const hideAllBtn = document.createElement('button');
      hideAllBtn.className = 'show-exit-rules-btn';
      hideAllBtn.textContent = 'Hide All Rules';
      hideAllBtn.addEventListener('click', () => {
        document
          .querySelectorAll('.path-exit-rule-container')
          .forEach((container) => {
            container.style.display = 'none';
          });
      });

      expandCollapseDiv.appendChild(showAllBtn);
      expandCollapseDiv.appendChild(hideAllBtn);
      pathsContainer.insertBefore(expandCollapseDiv, pathsDiv);
    }

    // Wait until the first paint to display sorted buttons to avoid layout thrashing
    requestAnimationFrame(() => {
      // Restore the button
      analyzePathsBtn.textContent = 'Clear Analysis';
      analyzePathsBtn.disabled = false;
    });
  }

  /**
   * Process a single path and create a visual representation
   * @param {Array} path - The path to process
   * @param {HTMLElement} pathsDiv - The container to add the path to
   * @param {Object} allNodes - Object to collect node categorizations
   * @param {number} pathIndex - Index of the path
   * @returns {HTMLElement} - The processed path element
   */
  _processPath(path, pathsDiv, allNodes, pathIndex = 0) {
    // Create path element
    const pathEl = document.createElement('div');
    pathEl.classList.add('region-path');
    pathEl.dataset.originalIndex = pathIndex.toString();
    pathEl.style.marginBottom = '10px';

    // Create the path visualization with collapsible header
    const pathHeader = document.createElement('div');
    pathHeader.classList.add('path-header');
    pathHeader.style.display = 'flex';
    pathHeader.style.alignItems = 'center';
    pathHeader.style.cursor = 'pointer';
    pathHeader.style.padding = '5px';
    pathHeader.style.borderRadius = '4px';
    pathHeader.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';

    // Add toggle indicator
    const toggleIndicator = document.createElement('span');
    toggleIndicator.classList.add('path-toggle-indicator');
    toggleIndicator.textContent = '▼'; // Down arrow for expanded
    toggleIndicator.style.marginRight = '8px';
    toggleIndicator.style.fontSize = '10px';
    toggleIndicator.style.transition = 'transform 0.2s';
    pathHeader.appendChild(toggleIndicator);

    // Create the path visualization
    const pathText = document.createElement('div');
    pathText.classList.add('path-regions');
    pathText.style.flex = '1';

    // Analyze the transitions in this path using the logic component
    const transitions = this.logic.findAllTransitions(path);

    // Call debug function for problematic transitions
    this.logic.debugTransition(transitions, 'Light World', 'East Dark World');
    this.logic.debugTransition(transitions, 'East Dark World', 'Pyramid Fairy');

    // Create container for exit rules (this will be toggled)
    const exitRulesContainer = document.createElement('div');
    exitRulesContainer.classList.add('path-exit-rules');
    exitRulesContainer.style.display = 'block'; // Start expanded

    // Track if the path chain is unbroken so far
    let pathChainIntact = true;
    let lastAccessibleRegionIndex = -1;

    // Display the path regions
    path.forEach((region, index) => {
      // Check region's general accessibility
      const regionAccessible = stateManager.isRegionReachable(region);

      // Determine color based on accessibility and path integrity
      let regionColor;

      if (!regionAccessible) {
        // Region is completely inaccessible: RED
        regionColor = '#f44336';
        pathChainIntact = false;
      } else if (index === 0) {
        // First region is accessible, start of path: GREEN
        regionColor = '#4caf50';
        lastAccessibleRegionIndex = 0;
      } else if (pathChainIntact) {
        // Find the transition between the previous region and this one
        const prevRegion = path[index - 1];
        const transition = transitions.find(
          (t) => t.fromRegion === prevRegion && t.toRegion === region
        );

        // FIX: Check if ANY exit is accessible for this transition
        if (transition && transition.transitionAccessible) {
          // This link in the chain works - region is accessible via this path: GREEN
          regionColor = '#4caf50';
          lastAccessibleRegionIndex = index;
        } else {
          // No accessible exits - region is accessible but not via this path: ORANGE
          regionColor = '#ff9800';
          pathChainIntact = false;
        }
      } else {
        // Previous link was broken - region is accessible but not via this path: ORANGE
        regionColor = '#ff9800';
      }

      // Create a span for the region with the appropriate color
      const regionSpan = document.createElement('span');
      regionSpan.textContent = region;
      regionSpan.style.color = regionColor;
      regionSpan.classList.add('region-link');
      regionSpan.dataset.region = region;

      // Add colorblind symbol if needed - FIX: Use correct accessibility status
      if (this.colorblindMode) {
        const symbolSpan = document.createElement('span');
        symbolSpan.classList.add('colorblind-symbol');

        if (regionColor === '#4caf50') {
          // Green - accessible
          symbolSpan.textContent = ' ✓';
          symbolSpan.classList.add('accessible');
        } else if (regionColor === '#f44336') {
          // Red - inaccessible
          symbolSpan.textContent = ' ✗';
          symbolSpan.classList.add('inaccessible');
        } else if (regionColor === '#ff9800') {
          // Orange - partial
          symbolSpan.textContent = ' ⚠';
          symbolSpan.classList.add('partial');
        }

        regionSpan.appendChild(symbolSpan);
      }

      regionSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        this.regionUI.navigateToRegion(region);
      });

      // Add the region to the path
      pathText.appendChild(regionSpan);

      // Add an arrow between regions (except for the last one)
      if (index < path.length - 1) {
        // Find the transition for this arrow
        const toRegion = path[index + 1];
        const transition = transitions.find(
          (t) => t.fromRegion === region && t.toRegion === toRegion
        );

        // FIX: Color the arrow based on transition accessibility
        const arrowColor =
          transition && transition.transitionAccessible ? '#4caf50' : '#ff9800';

        const arrow = document.createElement('span');
        arrow.textContent = ' → ';
        arrow.style.color = arrowColor; // FIX: Apply correct color to arrow
        pathText.appendChild(arrow);
      }
    });

    // Add path text to header
    pathHeader.appendChild(pathText);

    // Add click handler for toggling exit rules
    pathHeader.addEventListener('click', () => {
      const isExpanded = exitRulesContainer.style.display !== 'none';

      // Toggle visibility
      exitRulesContainer.style.display = isExpanded ? 'none' : 'block';

      // Update toggle indicator
      toggleIndicator.textContent = isExpanded ? '►' : '▼'; // Right arrow when collapsed, down when expanded
    });

    // Add header to path element
    pathEl.appendChild(pathHeader);

    // Add exit rule for transitions if any
    if (transitions.length > 0) {
      transitions.forEach((transition) => {
        // Create a header for this transition
        const transitionHeader = document.createElement('div');
        transitionHeader.classList.add('transition-header');
        transitionHeader.style.marginTop = '10px';
        transitionHeader.style.marginBottom = '5px';
        transitionHeader.style.fontWeight = 'bold';

        // FIX: Color the transition header based on whether ANY exit is accessible
        const transitionColor = transition.transitionAccessible
          ? '#4caf50' // Green if ANY exit is accessible
          : '#f44336'; // Red if NO exits are accessible

        transitionHeader.style.color = transitionColor;

        // Count how many exits are accessible
        const accessibleExitCount = transition.exits.filter(
          (exit) => !exit.access_rule || evaluateRule(exit.access_rule)
        ).length;

        // FIX: Update text to make it clearer, with "transition" in correct color
        transitionHeader.innerHTML = `<span style="color: ${transitionColor};">Transition:</span> ${
          transition.fromRegion
        } → ${transition.toRegion} 
          <span style="color: ${transitionColor};">(${
          transition.transitionAccessible ? 'Accessible' : 'Blocked'
        })</span>`;

        // FIX: If multiple exits, add indicator with exits count in WHITE color
        if (transition.exits.length > 1) {
          transitionHeader.innerHTML += ` <span style="color: #cecece; font-weight: normal;">
            [${accessibleExitCount}/${transition.exits.length} exits available]</span>`;
        }

        exitRulesContainer.appendChild(transitionHeader);

        // Create a container for multiple exits
        const exitsContainer = document.createElement('div');
        exitsContainer.classList.add('exits-container');
        exitsContainer.style.marginLeft = '20px';

        // Add each exit rule
        transition.exits.forEach((exit, exitIndex) => {
          const exitAccessible =
            !exit.access_rule || evaluateRule(exit.access_rule);

          // Create exit rule container
          const exitRuleContainer = document.createElement('div');
          exitRuleContainer.classList.add('path-exit-rule-container');
          exitRuleContainer.classList.add(
            exitAccessible ? 'passing-exit' : 'failing-exit'
          );
          exitRuleContainer.style.display = 'block';
          exitRuleContainer.style.marginTop = '5px';
          exitRuleContainer.style.marginBottom = '10px';
          exitRuleContainer.style.padding = '5px';
          exitRuleContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';

          // Set the border color based on rule evaluation
          exitRuleContainer.style.borderLeft = exitAccessible
            ? '3px solid #4caf50' // Green for accessible exits
            : '3px solid #f44336'; // Red for inaccessible exits

          // Create header for exit - include numbering if multiple exits
          const exitHeader = document.createElement('div');
          exitHeader.classList.add('path-exit-header');
          exitHeader.style.color = exitAccessible ? '#4caf50' : '#f44336';

          // Add exit numbering if multiple exits
          if (transition.exits.length > 1) {
            exitHeader.innerHTML = `<strong>Exit ${exitIndex + 1}/${
              transition.exits.length
            }:</strong> ${transition.fromRegion} → ${exit.name} → ${
              transition.toRegion
            }`;
          } else {
            exitHeader.innerHTML = `<strong>Exit:</strong> ${transition.fromRegion} → ${exit.name} → ${transition.toRegion}`;
          }

          exitRuleContainer.appendChild(exitHeader);

          // Show the exit rule if it exists
          if (exit.access_rule) {
            const ruleContainer = document.createElement('div');
            ruleContainer.classList.add('path-exit-rule');
            const ruleElement = commonUI.renderLogicTree(exit.access_rule);
            ruleContainer.appendChild(ruleElement);
            exitRuleContainer.appendChild(ruleContainer);

            // Analyze nodes from this exit for our categories
            const nodeResults = this.logic.extractCategorizedNodes(ruleElement);
            Object.keys(allNodes).forEach((key) => {
              allNodes[key].push(...nodeResults[key]);
            });
          }

          // Add to exits container
          exitsContainer.appendChild(exitRuleContainer);
        });

        // Add all exits to the main container
        exitRulesContainer.appendChild(exitsContainer);
      });
    }

    // Add exit rules container to path element
    pathEl.appendChild(exitRulesContainer);

    // FIX: If the entire path is viable, mark it visually
    if (pathChainIntact) {
      pathEl.classList.add('viable-path');
      pathEl.style.borderLeft = '3px solid #4caf50';
    }

    return pathEl;
  }

  /**
   * Analyzes direct connections to a region and displays the results
   * @param {string} regionName - The region to analyze
   * @param {HTMLElement} container - The container to add the analysis to
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

    // Get analysis data from the logic component
    const analysisResult = this.logic.analyzeDirectConnections(regionName);
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

        const ruleElement = commonUI.renderLogicTree(rule);
        ruleDiv.appendChild(ruleElement);
        rulesContainer.appendChild(ruleDiv);

        // Analyze nodes
        const nodeResults = this.logic.extractCategorizedNodes(ruleElement);
        Object.keys(allNodes).forEach((key) => {
          allNodes[key].push(...nodeResults[key]);
        });
      });
    }

    // 2. Analyze entrances to this region
    const entrancesContainer = document.createElement('div');
    entrancesContainer.innerHTML = '<h5>Entrances to this region:</h5>';
    let entranceCount = 0;

    // Process the entrance data from the analysis
    if (analysisResult.analysisData.entrances.length > 0) {
      analysisResult.analysisData.entrances.forEach(
        ({ fromRegion, entrance }) => {
          entranceCount++;

          const entranceDiv = document.createElement('div');
          entranceDiv.style.marginLeft = '20px';
          entranceDiv.style.marginBottom = '15px';

          // Create header for this entrance
          const header = document.createElement('div');
          header.innerHTML = `<strong>From ${fromRegion}:</strong> ${entrance.name}`;
          entranceDiv.appendChild(header);

          // Show the rule
          const ruleElement = commonUI.renderLogicTree(entrance.access_rule);
          entranceDiv.appendChild(ruleElement);
          entrancesContainer.appendChild(entranceDiv);

          // Analyze nodes
          const nodeResults = this.logic.extractCategorizedNodes(ruleElement);
          Object.keys(allNodes).forEach((key) => {
            allNodes[key].push(...nodeResults[key]);
          });
        }
      );
    }

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

  /**
   * Helper to create toggle controls for path display
   * @param {HTMLElement} container - The container to add controls to
   * @returns {HTMLElement} - The created toggle container
   */
  _createPathToggleControls(container) {
    // Add styles for colorblind mode symbols
    const colorblindStyles = document.createElement('style');
    colorblindStyles.textContent = `
      .colorblind-symbol {
        display: inline-block;
        margin-left: 4px;
        font-weight: bold;
      }
      
      .colorblind-symbol.accessible {
        color: #4caf50;
      }
      
      .colorblind-symbol.inaccessible {
        color: #f44336;
      }
      
      .colorblind-symbol.partial {
        color: #ff9800;
      }
      
      /* Style for logic tree colorblind symbols */
      .logic-node .colorblind-symbol {
        margin-right: 5px;
        margin-left: 0;
      }
    `;

    // Only add styles once
    if (
      !document.querySelector('style[data-colorblind-styles="logic-nodes"]')
    ) {
      colorblindStyles.setAttribute('data-colorblind-styles', 'logic-nodes');
      document.head.appendChild(colorblindStyles);
    }

    const toggleContainer = document.createElement('div');
    toggleContainer.classList.add('path-toggle-controls');
    toggleContainer.style.display = 'flex';
    toggleContainer.style.gap = '10px';
    toggleContainer.style.marginBottom = '15px';
    toggleContainer.style.flexWrap = 'wrap';

    // Define all toggle buttons
    const toggles = [
      {
        id: 'toggle-summary',
        initialText: 'Hide Summary',
        selector: '#path-summary-section',
        showText: 'Show Summary',
        hideText: 'Hide Summary',
      },
      {
        id: 'toggle-passing-exits',
        initialText: 'Hide Passing Exits',
        selector: '.passing-exit',
        showText: 'Show Passing Exits',
        hideText: 'Hide Passing Exits',
      },
      {
        id: 'toggle-failing-exits',
        initialText: 'Hide Failing Exits',
        selector: '.failing-exit',
        showText: 'Show Failing Exits',
        hideText: 'Hide Failing Exits',
      },
    ];

    // Create each toggle button
    toggles.forEach((toggle) => {
      const button = document.createElement('button');
      button.id = toggle.id;
      button.textContent = toggle.initialText;
      button.style.padding = '5px 10px';
      button.style.backgroundColor = '#333';
      button.style.color = '#fff';
      button.style.border = '1px solid #666';
      button.style.borderRadius = '4px';
      button.style.cursor = 'pointer';

      // Set up the toggle functionality
      let isHidden = false;
      button.addEventListener('click', () => {
        isHidden = !isHidden;
        button.textContent = isHidden ? toggle.showText : toggle.hideText;

        // Toggle visibility of the targeted elements
        const elements = document.querySelectorAll(toggle.selector);
        elements.forEach((el) => {
          el.style.display = isHidden ? 'none' : 'block';
        });
      });

      toggleContainer.appendChild(button);
    });

    // Add "Collapse All" button
    const collapseAllButton = document.createElement('button');
    collapseAllButton.id = 'toggle-collapse-all';
    collapseAllButton.textContent = 'Collapse All';
    collapseAllButton.style.padding = '5px 10px';
    collapseAllButton.style.backgroundColor = '#333';
    collapseAllButton.style.color = '#fff';
    collapseAllButton.style.border = '1px solid #666';
    collapseAllButton.style.borderRadius = '4px';
    collapseAllButton.style.cursor = 'pointer';

    let allCollapsed = false;
    collapseAllButton.addEventListener('click', () => {
      allCollapsed = !allCollapsed;
      collapseAllButton.textContent = allCollapsed
        ? 'Expand All'
        : 'Collapse All';

      // Get all path details containers including canonical path
      const detailsContainers = document.querySelectorAll(
        '.path-details, .path-exit-rules'
      );
      detailsContainers.forEach((container) => {
        container.style.display = allCollapsed ? 'none' : 'block';
      });

      // Update all toggle indicators including canonical path
      const indicators = document.querySelectorAll('.path-toggle-indicator');
      indicators.forEach((indicator) => {
        indicator.textContent = allCollapsed ? '►' : '▼';
      });
    });

    toggleContainer.appendChild(collapseAllButton);

    // Add colorblind mode toggle
    const colorblindModeToggle = document.createElement('button');
    colorblindModeToggle.id = 'toggle-colorblind-mode';
    colorblindModeToggle.textContent = this.colorblindMode
      ? 'Disable Colorblind Mode'
      : 'Enable Colorblind Mode';
    colorblindModeToggle.style.padding = '5px 10px';
    colorblindModeToggle.style.backgroundColor = this.colorblindMode
      ? '#7e57c2'
      : '#333';
    colorblindModeToggle.style.color = '#fff';
    colorblindModeToggle.style.border = '1px solid #666';
    colorblindModeToggle.style.borderRadius = '4px';
    colorblindModeToggle.style.cursor = 'pointer';

    colorblindModeToggle.addEventListener('click', () => {
      this.toggleColorblindMode();
      colorblindModeToggle.textContent = this.colorblindMode
        ? 'Disable Colorblind Mode'
        : 'Enable Colorblind Mode';
      colorblindModeToggle.style.backgroundColor = this.colorblindMode
        ? '#7e57c2'
        : '#333';
    });

    toggleContainer.appendChild(colorblindModeToggle);

    // Insert toggle controls at the beginning
    container.insertBefore(toggleContainer, container.firstChild);

    return toggleContainer;
  }

  /**
   * Helper method to create a display element with label text and colored value
   * @param {string} label - The label text (e.g., "Need item:")
   * @param {string} value - The value to display (e.g., "Moon Pearl")
   * @param {string} valueColor - The color for the value
   * @returns {HTMLElement} - The created display element
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

      // Create a proper event listener
      regionSpan.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.regionUI.navigateToRegion(text);
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

    // Deduplicate all node lists using the logic component
    const deduplicatedPrimaryBlockers =
      this.logic.deduplicateNodes(primaryBlockers);
    const deduplicatedSecondaryBlockers =
      this.logic.deduplicateNodes(secondaryBlockers);
    const deduplicatedTertiaryBlockers =
      this.logic.deduplicateNodes(tertiaryBlockers);
    const deduplicatedPrimaryRequirements =
      this.logic.deduplicateNodes(primaryRequirements);
    const deduplicatedSecondaryRequirements = this.logic.deduplicateNodes(
      secondaryRequirements
    );
    const deduplicatedTertiaryRequirements =
      this.logic.deduplicateNodes(tertiaryRequirements);

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

  /**
   * Displays a section of nodes in the compiled list
   * @param {HTMLElement} container - Container to add the section to
   * @param {Array} nodes - List of nodes to display
   * @param {string} title - Section title
   * @param {string} description - Section description
   * @param {string} sectionColor - Color for this section
   */
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

      // Create node display elements
      if (node.displayElement) {
        // If already have displayElement (legacy), use it
        item.appendChild(node.displayElement);
      } else {
        // Otherwise create new display based on node data and color
        const display = this._createNodeDisplay(
          this._getNodeDisplayLabel(node),
          this._getNodeDisplayValue(node),
          sectionColor
        );
        item.appendChild(display);
      }

      list.appendChild(item);
    });
    section.appendChild(list);

    container.appendChild(section);
  }

  /**
   * Get appropriate label for node display
   * @param {Object} node - Node data
   * @returns {string} - Label to display
   */
  _getNodeDisplayLabel(node) {
    switch (node.type) {
      case 'constant':
        return 'Constant:';
      case 'item_check':
        return 'Need item:';
      case 'count_check':
        return `Need ${node.count}×`;
      case 'group_check':
        return 'Need group:';
      case 'helper':
        return 'Helper function:';
      case 'state_method':
        return 'State method:';
      default:
        return 'Node:';
    }
  }

  /**
   * Get appropriate value for node display
   * @param {Object} node - Node data
   * @returns {string} - Value to display
   */
  _getNodeDisplayValue(node) {
    switch (node.type) {
      case 'constant':
        return node.value.toString();
      case 'item_check':
        return node.item;
      case 'count_check':
        return node.item;
      case 'group_check':
        return node.group;
      case 'helper':
        return node.name;
      case 'state_method':
        return node.method;
      default:
        return node.display || 'Unknown';
    }
  }

  /**
   * Toggles colorblind mode and updates the UI
   */
  toggleColorblindMode() {
    this.colorblindMode = !this.colorblindMode;
    this._updateColorblindIndicators();
  }

  /**
   * Updates colorblind indicators throughout the UI
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

    // Update exit rules
    document
      .querySelectorAll('.path-exit-rule-container')
      .forEach((container) => {
        const isPassing = container.classList.contains('passing-exit');
        const header = container.querySelector('.path-exit-header');

        if (header) {
          // Remove existing symbol
          const existingSymbol = header.querySelector('.colorblind-symbol');
          if (existingSymbol) existingSymbol.remove();

          // Add new symbol if needed
          if (this.colorblindMode) {
            const symbolSpan = document.createElement('span');
            symbolSpan.classList.add('colorblind-symbol');
            symbolSpan.textContent = isPassing ? ' ✓' : ' ✗';
            symbolSpan.classList.add(isPassing ? 'accessible' : 'inaccessible');
            header.appendChild(symbolSpan);
          }
        }
      });

    // Add this section to update logic nodes
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
