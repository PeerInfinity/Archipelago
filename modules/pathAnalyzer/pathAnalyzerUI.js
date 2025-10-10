// pathAnalyzerUI.js
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import { evaluateRule } from '../shared/ruleEngine.js';
import { PathAnalyzerLogic } from './pathAnalyzerLogic.js';
import commonUI from '../commonUI/index.js';
import settingsManager from '../../app/core/settingsManager.js';
import eventBus from '../../app/core/eventBus.js';
import loopState from '../loops/loopStateSingleton.js';
import { createStateSnapshotInterface } from '../shared/stateInterface.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('pathAnalyzerUI', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[pathAnalyzerUI] ${message}`, ...data);
  }
}

/**
 * Handles UI aspects of path analysis for regions in the game
 * Uses PathAnalyzerLogic for the core algorithmic operations
 */
export class PathAnalyzerUI {
  constructor(regionUI, pathAnalyzerSettings = null) {
    this.regionUI = regionUI;

    // If specific settings provided, use them; otherwise use defaults from settingsManager
    this.settings = pathAnalyzerSettings || this._getDefaultSettings();

    // Create the logic component with settings
    this.logic = new PathAnalyzerLogic(this.settings);

    // Track current analysis state
    this.currentRegionName = null;
    this.isAnalysisActive = false;
    this.currentAnalysisContainer = null;
    this.currentAnalysisButton = null;
    this.currentPathsCountSpan = null;

    // UI configuration options
    this.settingsUnsubscribe = null;
    this.subscribeToSettings();
  }

  /**
   * Get default path analyzer settings from settings manager
   * @returns {object} Settings object
   * @private
   */
  _getDefaultSettings() {
    try {
      const moduleSettings = settingsManager.getModuleSettings('pathAnalyzer');
      return {
        maxPaths: moduleSettings?.maxPaths || 100,
        maxAnalysisTimeMs: moduleSettings?.maxAnalysisTimeMs || 10000,
      };
    } catch (error) {
      log(
        'warn',
        'Failed to load pathAnalyzer settings, using defaults:',
        error
      );
      return {
        maxPaths: 100,
        maxAnalysisTimeMs: 10000,
      };
    }
  }

  /**
   * Update settings for this instance only
   * @param {object} newSettings - New settings to apply
   */
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.logic = new PathAnalyzerLogic(this.settings);
    log('info', 'PathAnalyzerUI settings updated:', this.settings);
  }

  /**
   * Save current settings as new defaults
   */
  saveSettingsAsDefaults() {
    try {
      // Update the settings in settingsManager
      const currentSettings =
        settingsManager.getModuleSettings('pathAnalyzer') || {};
      const newSettings = { ...currentSettings, ...this.settings };
      settingsManager.updateModuleSettings('pathAnalyzer', newSettings);
      log('info', 'PathAnalyzer settings saved as defaults:', newSettings);
    } catch (error) {
      log('error', 'Failed to save PathAnalyzer settings as defaults:', error);
    }
  }

  /**
   * Get current settings
   * @returns {object} Current settings
   */
  getSettings() {
    return { ...this.settings };
  }

  /**
   * Create settings UI controls
   * @param {HTMLElement} container - Container to add settings controls to
   * @param {string} regionName - The region being analyzed (optional)
   * @param {boolean} regionReadOnly - Whether the region field should be read-only
   * @returns {HTMLElement} Settings container element
   */
  createSettingsUI(container, regionName = null, regionReadOnly = false) {
    const settingsContainer = document.createElement('div');
    settingsContainer.className = 'path-analyzer-settings';
    settingsContainer.style.cssText = `
      background: #2a2a2a;
      border: 1px solid #555;
      border-radius: 4px;
      padding: 10px;
      margin-bottom: 15px;
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      align-items: center;
    `;

    const title = document.createElement('h4');
    title.textContent = 'Path Analysis Settings:';
    title.style.cssText = 'margin: 0; width: 100%; color: #e0e0e0;';
    settingsContainer.appendChild(title);

    // Region name setting (if provided)
    if (regionName) {
      const regionContainer = document.createElement('div');
      regionContainer.style.cssText =
        'display: flex; align-items: center; gap: 5px; width: 100%;';

      const regionLabel = document.createElement('label');
      regionLabel.textContent = 'Target Region:';
      regionLabel.style.cssText =
        'font-weight: bold; color: #e0e0e0; min-width: 100px;';

      const regionInput = document.createElement('input');
      regionInput.type = 'text';
      regionInput.value = regionName;
      regionInput.readOnly = regionReadOnly;
      regionInput.style.cssText = `
        flex: 1; 
        padding: 5px 10px; 
        border: 1px solid #555; 
        border-radius: 2px;
        background: ${regionReadOnly ? '#404040' : '#333'};
        color: ${regionReadOnly ? '#999' : '#e0e0e0'};
      `;
      regionInput.dataset.settingKey = 'regionName';

      regionContainer.appendChild(regionLabel);
      regionContainer.appendChild(regionInput);
      settingsContainer.appendChild(regionContainer);
    }

    // Create a row for Max Paths and Timeout settings (removing Max Iterations)
    const settingsRow = document.createElement('div');
    settingsRow.style.cssText = 'display: flex; align-items: center; gap: 20px; width: 100%;';

    // Max Paths setting
    const maxPathsContainer = document.createElement('div');
    maxPathsContainer.style.cssText = 'display: flex; align-items: center; gap: 5px;';

    const maxPathsLabel = document.createElement('label');
    maxPathsLabel.textContent = 'Max Paths:';
    maxPathsLabel.style.cssText = 'font-weight: bold; color: #e0e0e0; min-width: 80px;';

    const maxPathsInput = document.createElement('input');
    maxPathsInput.type = 'number';
    maxPathsInput.min = 1;
    maxPathsInput.max = 1000;
    maxPathsInput.step = 1;
    maxPathsInput.value = this.settings.maxPaths;
    maxPathsInput.style.cssText = 'width: 80px; padding: 2px 5px; border: 1px solid #555; border-radius: 2px; background: #333; color: #e0e0e0;';
    maxPathsInput.dataset.settingKey = 'maxPaths';

    // Timeout setting
    const timeoutContainer = document.createElement('div');
    timeoutContainer.style.cssText = 'display: flex; align-items: center; gap: 5px;';

    const timeoutLabel = document.createElement('label');
    timeoutLabel.textContent = 'Timeout (ms):';
    timeoutLabel.style.cssText = 'font-weight: bold; color: #e0e0e0; min-width: 80px;';

    const timeoutInput = document.createElement('input');
    timeoutInput.type = 'number';
    timeoutInput.min = 1000;
    timeoutInput.max = 30000;
    timeoutInput.step = 100;
    timeoutInput.value = this.settings.maxAnalysisTimeMs;
    timeoutInput.style.cssText = 'width: 80px; padding: 2px 5px; border: 1px solid #555; border-radius: 2px; background: #333; color: #e0e0e0;';
    timeoutInput.dataset.settingKey = 'maxAnalysisTimeMs';

    // Assemble the row
    maxPathsContainer.appendChild(maxPathsLabel);
    maxPathsContainer.appendChild(maxPathsInput);
    timeoutContainer.appendChild(timeoutLabel);
    timeoutContainer.appendChild(timeoutInput);
    settingsRow.appendChild(maxPathsContainer);
    settingsRow.appendChild(timeoutContainer);

    // Add change event listeners for both inputs
    [maxPathsInput, timeoutInput].forEach((input) => {
      input.addEventListener('change', () => {
        const newValue = parseInt(input.value, 10);
        const settingKey = input.dataset.settingKey;
        
        let min, max;
        if (settingKey === 'maxPaths') {
          min = 1; max = 1000;
        } else if (settingKey === 'maxAnalysisTimeMs') {
          min = 1000; max = 30000;
        }
        
        if (!isNaN(newValue) && newValue >= min && newValue <= max) {
          this.updateSettings({ [settingKey]: newValue });
        } else {
          // Reset to current value if invalid
          input.value = this.settings[settingKey];
        }
      });
    });

    settingsContainer.appendChild(settingsRow);

    // Add buttons container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText =
      'width: 100%; margin-top: 10px; display: flex; gap: 10px; flex-wrap: wrap;';

    // Apply button (only show if we have active analysis)
    if (this.isAnalysisActive && this.currentRegionName) {
      const applyButton = document.createElement('button');
      applyButton.textContent = 'Apply Settings';
      applyButton.className = 'button';
      applyButton.style.cssText =
        'padding: 5px 10px; font-size: 12px; background-color: #2196f3; color: white; border: 1px solid #2196f3; border-radius: 2px; cursor: pointer;';
      applyButton.addEventListener('click', () => {
        // Get the current region name from input if available
        const regionInput = settingsContainer.querySelector(
          'input[data-setting-key="regionName"]'
        );
        const targetRegion = regionInput
          ? regionInput.value.trim()
          : this.currentRegionName;

        if (targetRegion && this.currentAnalysisContainer) {
          log(
            'info',
            `[PathAnalyzerUI] Applying settings and re-analyzing region: ${targetRegion}`
          );
          this.currentRegionName = targetRegion;
          this.performPathAnalysis(
            targetRegion,
            this.currentAnalysisContainer,
            this.currentPathsCountSpan,
            this.currentAnalysisButton
          );
        }
      });
      buttonContainer.appendChild(applyButton);
    }

    // Save defaults button
    const saveButton = document.createElement('button');
    saveButton.textContent = 'Save as Defaults';
    saveButton.className = 'button';
    saveButton.style.cssText =
      'padding: 5px 10px; font-size: 12px; background-color: #444; color: #e0e0e0; border: 1px solid #666; border-radius: 2px; cursor: pointer;';
    saveButton.addEventListener('click', () => {
      this.saveSettingsAsDefaults();
      // Visual feedback
      const originalText = saveButton.textContent;
      const originalStyle = saveButton.style.backgroundColor;
      saveButton.textContent = 'Saved!';
      saveButton.style.backgroundColor = '#4caf50';
      setTimeout(() => {
        saveButton.textContent = originalText;
        saveButton.style.backgroundColor = originalStyle;
      }, 1500);
    });

    const resetButton = document.createElement('button');
    resetButton.textContent = 'Reset to Defaults';
    resetButton.className = 'button';
    resetButton.style.cssText =
      'padding: 5px 10px; font-size: 12px; background-color: #444; color: #e0e0e0; border: 1px solid #666; border-radius: 2px; cursor: pointer;';
    resetButton.addEventListener('click', () => {
      const defaultSettings = this._getDefaultSettings();
      this.updateSettings(defaultSettings);

      // Update all input fields
      settingsContainer
        .querySelectorAll('input[data-setting-key]')
        .forEach((input) => {
          const key = input.dataset.settingKey;
          if (key !== 'regionName' && defaultSettings[key] !== undefined) {
            input.value = defaultSettings[key];
          }
        });
    });

    buttonContainer.appendChild(saveButton);
    buttonContainer.appendChild(resetButton);
    settingsContainer.appendChild(buttonContainer);

    if (container) {
      container.appendChild(settingsContainer);
    }

    return settingsContainer;
  }

  subscribeToSettings() {
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
    }
    this.settingsUnsubscribe = eventBus.subscribe(
      'settings:changed',
      ({ key, value }) => {
        if (key === '*' || key.startsWith('colorblindMode')) {
          log('info', 'PathAnalyzerUI reacting to settings change:', key);
          const pathsContainer = document.querySelector(
            '.region-details-content .path-analysis-results'
          );
          if (pathsContainer && pathsContainer.style.display !== 'none') {
            this._updateColorblindIndicators();
          }
        }
      }
    , 'pathAnalyzer');
  }

  dispose() {
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
      this.settingsUnsubscribe = null;
    }
  }

  /**
   * Sets the debug mode for both UI and logic components
   * @param {boolean} debug - Whether debug mode is enabled
   */
  setDebugMode(debug) {
    this.logic.setDebugMode(debug);
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

        // Reset analysis state
        this.isAnalysisActive = false;
        this.currentRegionName = null;
        this.currentAnalysisContainer = null;
        this.currentAnalysisButton = null;
        this.currentPathsCountSpan = null;

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
        analyzePathsBtn
      );

      this._createPathToggleControls(pathsContainer);
    });
  }

  /**
   * Creates analysis status UI elements
   * @param {HTMLElement} container - Container to add status UI to
   * @returns {Object} Object containing status UI elements
   */
  createAnalysisStatusUI(container) {
    const statusContainer = document.createElement('div');
    statusContainer.className = 'path-analyzer-status';
    statusContainer.style.cssText = `
      background: #1e1e1e;
      border: 1px solid #444;
      border-radius: 4px;
      padding: 10px;
      margin-bottom: 15px;
      display: none;
    `;

    const statusTitle = document.createElement('h4');
    statusTitle.textContent = 'Path Analysis Status';
    statusTitle.style.cssText = 'margin: 0 0 8px 0; color: #e0e0e0; font-size: 14px;';

    const statusText = document.createElement('div');
    statusText.style.cssText = 'color: #ccc; font-size: 13px; margin-bottom: 5px;';
    statusText.textContent = 'Initializing path analysis...';

    const metricsText = document.createElement('div');
    metricsText.style.cssText = 'color: #4CAF50; font-size: 12px; font-family: monospace;';
    metricsText.textContent = '';

    statusContainer.appendChild(statusTitle);
    statusContainer.appendChild(statusText);
    statusContainer.appendChild(metricsText);
    container.appendChild(statusContainer);

    return {
      container: statusContainer,
      status: statusText,
      metrics: metricsText
    };
  }

  /**
   * Performs asynchronous pathfinding with metrics reporting
   * @param {string} regionName - Region to find paths to
   * @param {Object} snapshot - Current state snapshot
   * @param {Object} staticData - Static game data
   * @param {Object} snapshotInterface - Snapshot interface for rule evaluation
   * @param {Object} statusUI - Status UI elements
   * @returns {Promise<Array>} Promise resolving to found paths
   */
  async findPathsWithMetrics(regionName, snapshot, staticData, snapshotInterface, statusUI) {
    const startTime = Date.now();
    const maxTime = this.settings.maxAnalysisTimeMs;
    let iterationCount = 0;
    
    // Start the metrics timer
    const metricsTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const elapsedSeconds = (elapsed / 1000).toFixed(1);
      statusUI.metrics.textContent = `Elapsed: ${elapsedSeconds}s | Iterations: ${iterationCount.toLocaleString()}`;
    }, 100);

    try {
      // Create a callback to update iteration count
      const iterationCallback = (count) => {
        iterationCount = count;
      };

      // Call the actual pathfinding with a wrapper to handle timeout
      const result = await new Promise((resolve, reject) => {
        // Set up timeout
        const timeoutId = setTimeout(() => {
          const error = new Error('TIMEOUT');
          error.partialResults = []; // We don't have partial results in this implementation
          reject(error);
        }, maxTime);

        // Run pathfinding in chunks to allow UI updates
        const runPathfinding = () => {
          try {
            statusUI.status.textContent = 'Analyzing paths...';
            const foundPaths = this.logic.findPathsToRegionWithCallback(
              regionName,
              null, // Use default from settings
              snapshot,
              staticData,
              iterationCallback
            );
            
            clearTimeout(timeoutId);
            resolve(foundPaths);
          } catch (error) {
            clearTimeout(timeoutId);
            reject(error);
          }
        };

        // Start pathfinding on next tick to allow UI update
        setTimeout(runPathfinding, 10);
      });

      // Complete the metrics
      clearInterval(metricsTimer);
      const finalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      statusUI.status.textContent = `Analysis complete! Found ${result.length} paths`;
      statusUI.metrics.textContent = `Completed in ${finalElapsed}s | ${iterationCount.toLocaleString()} iterations`;

      return result;
    } catch (error) {
      clearInterval(metricsTimer);
      const finalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      statusUI.metrics.textContent = `Stopped at ${finalElapsed}s | ${iterationCount.toLocaleString()} iterations`;
      throw error;
    }
  }

  /**
   * Perform the actual path analysis and create UI elements to display the results
   * @param {string} regionName - Region name to analyze paths for
   * @param {HTMLElement} pathsContainer - Container to display paths in
   * @param {HTMLElement} pathsCountSpan - Element to display path counts
   * @param {HTMLElement} analyzePathsBtn - The button that triggered the analysis
   */
  async performPathAnalysis(
    regionName,
    pathsContainer,
    pathsCountSpan,
    analyzePathsBtn
  ) {
    // Track current analysis state
    this.currentRegionName = regionName;
    this.isAnalysisActive = true;
    this.currentAnalysisContainer = pathsContainer;
    this.currentAnalysisButton = analyzePathsBtn;
    this.currentPathsCountSpan = pathsCountSpan;

    pathsContainer.innerHTML = '';

    // PHASE 0: Add settings UI at the top with region name and readonly status
    const isFromRegionsPanel = this.regionUI !== null;
    this.createSettingsUI(pathsContainer, regionName, isFromRegionsPanel);

    // Add analysis status UI
    const statusUI = this.createAnalysisStatusUI(pathsContainer);

    // PHASE 1: Get current snapshot and static data
    const snapshot = stateManager.getLatestStateSnapshot();
    const staticData = stateManager.getStaticData();

    if (!snapshot || !staticData) {
      pathsContainer.innerHTML =
        '<div class="error-message">Error: Cannot perform path analysis - missing snapshot or static data.</div>';
      analyzePathsBtn.textContent = 'Analyze Paths';
      analyzePathsBtn.disabled = false;
      return;
    }

    // Check actual reachability using stateManager
    let isRegionActuallyReachable = false;
    if (snapshot && snapshot.regionReachability) {
      const status = snapshot.regionReachability?.[regionName];
      isRegionActuallyReachable =
        status === true || status === 'reachable' || status === 'checked';
    }

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

    // Create snapshot interface for rule evaluation
    const snapshotInterface = createStateSnapshotInterface(
      snapshot,
      staticData
    );
    if (!snapshotInterface) {
      pathsContainer.innerHTML =
        '<div class="error-message">Error: Cannot create snapshot interface for path analysis.</div>';
      analyzePathsBtn.textContent = 'Analyze Paths';
      analyzePathsBtn.disabled = false;
      return;
    }

    // PHASE 2: Perform path analysis with status tracking
    statusUI.container.style.display = 'block';
    statusUI.status.textContent = 'Starting path analysis...';
    
    log('info', `[PathAnalyzer] Starting async path analysis for "${regionName}"`);
    
    let allPaths = [];
    try {
      allPaths = await this.findPathsWithMetrics(
        regionName,
        snapshot,
        staticData,
        snapshotInterface,
        statusUI
      );
      
      log('info', `[PathAnalyzer] findPathsWithMetrics returned ${allPaths.length} paths for "${regionName}"`);
      if (allPaths.length > 0) {
        allPaths.forEach((path, index) => {
          log('info', `[PathAnalyzer] Path ${index + 1}: ${path.join(' → ')}`);
        });
      }
    } catch (error) {
      if (error.message === 'TIMEOUT') {
        statusUI.status.textContent = 'Analysis timed out - showing partial results';
        statusUI.status.style.color = '#ff9800';
        allPaths = error.partialResults || [];
        log('info', `[PathAnalyzer] Analysis timed out, got ${allPaths.length} partial paths`);
      } else {
        statusUI.status.textContent = 'Analysis failed: ' + error.message;
        statusUI.status.style.color = '#f44336';
        allPaths = [];
      }
    }
    
    // Keep status UI visible (don't hide it)

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
      log('info', `[PathAnalyzer] Processing ${allPaths.length} paths found by pathfinding algorithm`);
      
      // Process and analyze paths
      allPaths.forEach((path, pathIndex) => {
        log('info', `[PathAnalyzer] Processing path ${pathIndex + 1}/${allPaths.length}: ${path.join(' → ')}`);
        
        const transitions = this.logic.findAllTransitions(
          path,
          snapshot,
          staticData,
          snapshotInterface
        );
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

        log('info', `[PathAnalyzer] Path ${pathIndex + 1} viability: ${pathHasIssues ? 'NON-VIABLE' : 'VIABLE'}`);

        // Generate path element and add to container
        const pathEl = this._processPath(
          path,
          pathsDiv,
          allNodes,
          pathIndex,
          snapshot,
          staticData
        );

        // If this is a viable path, mark it specially
        if (!pathHasIssues) {
          pathEl.classList.add('viable-path');
          pathEl.style.borderLeft = '3px solid #4caf50';
        }

        log('info', `[PathAnalyzer] Appending path ${pathIndex + 1} element to DOM`);
        pathsDiv.appendChild(pathEl);
      });
      
      log('info', `[PathAnalyzer] Completed processing all ${allPaths.length} paths. Viable paths: ${accessiblePathCount}`);
    } else {
      // FIX: When no paths are found, analyze direct connections to show what's blocking access
      log('info', `[PathAnalyzer] No paths found for ${regionName}, analyzing direct connections to show requirements`);
      
      const directConnectionsResult = this.logic.analyzeDirectConnections(
        regionName,
        staticData,
        snapshotInterface
      );
      
      if (directConnectionsResult && directConnectionsResult.nodes) {
        // Merge the direct connections analysis into allNodes
        Object.keys(allNodes).forEach(key => {
          if (directConnectionsResult.nodes[key]) {
            allNodes[key].push(...directConnectionsResult.nodes[key]);
          }
        });
        
        log('info', `[PathAnalyzer] Added direct connection requirements for ${regionName}:`, directConnectionsResult.nodes);
      }
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
      // Find a canonical path using logic component with proper parameters
      const canonicalPathData = this.logic.findCanonicalPath(
        regionName,
        snapshot,
        staticData
      );

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
          const useColorblind = settingsManager.getSetting(
            'colorblindMode.pathAnalyzer',
            false
          );
          if (useColorblind) {
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

        // Insert canonical path before the paths container
        pathsContainer.insertBefore(canonicalPathContainer, pathsDiv);
      }
    }

    // Finally, display the compiled node lists
    this.displayCompiledList(allNodes, requirementsDiv);

    // Store results for Playwright/debugging after all UI updates
    const summaryResults = {
      paths: allPaths, // Add the actual paths
      totalPaths: allPaths.length,
      viablePaths: accessiblePathCount,
      isReachable: isRegionActuallyReachable,
      hasDiscrepancy: isRegionActuallyReachable && accessiblePathCount === 0,
      allNodes: allNodes, // Keep the aggregated nodes
    };
    this._storeAnalysisResults(regionName, summaryResults);

    // Append the main paths container
    pathsContainer.appendChild(pathsDiv);

    // Update path count display
    if (pathsCountSpan) {
      pathsCountSpan.textContent = `(${allPaths.length} path${
        allPaths.length !== 1 ? 's' : ''
      } found, ${accessiblePathCount} viable)`;
      pathsCountSpan.style.display = 'inline';
    }

    // Update button state
    analyzePathsBtn.textContent = 'Hide Paths';
    analyzePathsBtn.disabled = false;
  }

  /**
   * Process a single path and create its UI representation
   * @param {Array<string>} path - Array of region names in the path
   * @param {HTMLElement} pathsDiv - Container to add the path element to
   * @param {Object} allNodes - Object to collect node categorizations
   * @param {number} pathIndex - Index of the path
   * @param {Object} snapshot - The current state snapshot
   * @param {Object} staticData - The current static data
   * @returns {HTMLElement} - The processed path element
   */
  _processPath(path, pathsDiv, allNodes, pathIndex = 0, snapshot, staticData) {
    // Create path element
    const pathEl = document.createElement('div');
    pathEl.classList.add('path-container');
    pathEl.style.marginBottom = '20px';
    pathEl.style.border = '1px solid #ccc';
    pathEl.style.borderRadius = '4px';
    pathEl.style.padding = '10px';

    // Create path header with toggle functionality
    const pathHeader = document.createElement('div');
    pathHeader.classList.add('path-header');
    pathHeader.style.cursor = 'pointer';
    pathHeader.style.display = 'flex';
    pathHeader.style.alignItems = 'center';
    pathHeader.style.gap = '10px';

    // Add toggle indicator
    const toggleIndicator = document.createElement('span');
    toggleIndicator.textContent = '▼'; // Down arrow when expanded
    toggleIndicator.style.fontSize = '12px';
    toggleIndicator.style.color = '#666';
    pathHeader.appendChild(toggleIndicator);

    // Add path number
    const pathNumber = document.createElement('span');
    pathNumber.textContent = `Path ${pathIndex + 1}:`;
    pathNumber.style.fontWeight = 'bold';
    pathNumber.style.color = '#333';
    pathHeader.appendChild(pathNumber);

    // Create path text container
    const pathText = document.createElement('span');
    pathText.classList.add('path-text');

    // Create snapshot interface for rule evaluation
    const snapshotInterface = createStateSnapshotInterface(
      snapshot,
      staticData
    );
    if (!snapshotInterface) {
      log(
        'error',
        '[PathAnalyzerUI] Failed to create snapshot interface for path processing'
      );
      return pathEl;
    }

    // Analyze the transitions in this path using the logic component
    const transitions = this.logic.findAllTransitions(
      path,
      snapshot,
      staticData,
      snapshotInterface
    );

    // Call debug function for problematic transitions
    this.logic.debugTransition(transitions, path[0], path[path.length - 1]);

    // Create container for exit rules (this will be toggled)
    const exitRulesContainer = document.createElement('div');
    exitRulesContainer.classList.add('path-exit-rules');
    exitRulesContainer.style.display = 'block'; // Start expanded

    // Track if the path chain is unbroken so far
    let pathChainIntact = true;
    let lastAccessibleRegionIndex = -1;

    // Display the path regions
    path.forEach((region, index) => {
      // Check region's general accessibility from snapshot
      const regionAccessible =
        snapshot.regionReachability &&
        (snapshot.regionReachability?.[region] === true ||
          snapshot.regionReachability?.[region] === 'reachable' ||
          snapshot.regionReachability?.[region] === 'checked');

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

        // Check if ANY exit is accessible for this transition
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

      // Add colorblind symbol if needed
      const useColorblindPath = settingsManager.getSetting(
        'colorblindMode.pathAnalyzer',
        false
      );
      if (useColorblindPath) {
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

        // Color the arrow based on transition accessibility
        const arrowColor =
          transition && transition.transitionAccessible ? '#4caf50' : '#ff9800';

        const arrow = document.createElement('span');
        arrow.textContent = ' → ';
        arrow.style.color = arrowColor;
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

        // Color the transition header based on whether ANY exit is accessible
        const transitionColor = transition.transitionAccessible
          ? '#4caf50' // Green if ANY exit is accessible
          : '#f44336'; // Red if NO exits are accessible

        transitionHeader.style.color = transitionColor;

        // Count how many exits are accessible
        const accessibleExitCount = transition.exits.filter(
          (exit) =>
            !exit.access_rule ||
            evaluateRule(exit.access_rule, snapshotInterface)
        ).length;

        // Update text to make it clearer
        transitionHeader.innerHTML = `<span style="color: ${transitionColor};">Transition:</span> ${
          transition.fromRegion
        } → ${transition.toRegion} 
          <span style="color: ${transitionColor};">(${
          transition.transitionAccessible ? 'Accessible' : 'Blocked'
        })</span>`;

        // If multiple exits, add indicator with exits count
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
            !exit.access_rule ||
            evaluateRule(exit.access_rule, snapshotInterface);

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

          // Add rule visualization if there's a rule
          if (exit.access_rule) {
            const ruleContainer = document.createElement('div');
            ruleContainer.classList.add('path-exit-rule');
            ruleContainer.style.marginTop = '5px';

            const useColorblind = settingsManager.getSetting(
              'colorblindMode.pathAnalyzer',
              false
            );

            const ruleElement = commonUI.renderLogicTree(
              exit.access_rule,
              useColorblind,
              snapshotInterface
            );
            ruleContainer.appendChild(ruleElement);

            exitRuleContainer.appendChild(ruleContainer);

            // Analyze rule nodes for categorization
            const ruleNodes = this.logic.analyzeRuleForNodes(
              exit.access_rule,
              snapshotInterface
            );

            // Add nodes to appropriate categories (ruleNodes is an object with categorized arrays)
            if (ruleNodes && typeof ruleNodes === 'object') {
              Object.keys(allNodes).forEach((category) => {
                if (ruleNodes[category] && Array.isArray(ruleNodes[category])) {
                  allNodes[category].push(...ruleNodes[category]);
                }
              });
            }
          } else {
            // No rule means always accessible
            const noRuleDiv = document.createElement('div');
            noRuleDiv.textContent = 'No access rule (always accessible)';
            noRuleDiv.style.fontStyle = 'italic';
            noRuleDiv.style.color = '#4caf50';
            exitRuleContainer.appendChild(noRuleDiv);
          }

          exitsContainer.appendChild(exitRuleContainer);
        });

        exitRulesContainer.appendChild(exitsContainer);
      });
    }

    // Add exit rules container to path element
    pathEl.appendChild(exitRulesContainer);

    return pathEl;
  }

  /**
   * Analyzes direct connections to a region and displays the results
   * @param {string} regionName - The region to analyze
   * @param {HTMLElement} container - The container to add the analysis to
   * @param {Object} staticData - The static data to analyze
   * @param {Object} snapshotInterface - The snapshot interface to use
   */
  _analyzeDirectConnections(
    regionName,
    container,
    staticData,
    snapshotInterface
  ) {
    container.innerHTML = '<h4>Direct Connections & Rules:</h4>';

    // --- MOVED AND REFINED: Detailed logging for staticData --- >
    log(
      'info',
      '[PathAnalyzerUI DEBUG] Entered _analyzeDirectConnections. regionName:',
      regionName
    );
    log(
      'info',
      '[PathAnalyzerUI DEBUG] _analyzeDirectConnections - staticData (parameter) value:',
      staticData
    );
    log(
      'info',
      '[PathAnalyzerUI DEBUG] _analyzeDirectConnections - typeof staticData (parameter):',
      typeof staticData
    );

    if (staticData && typeof staticData === 'object') {
      log(
        'info',
        '[PathAnalyzerUI DEBUG] _analyzeDirectConnections - staticData.regions details:',
        {
          regionsPropertyExists: 'regions' in staticData,
          regionsPropertyType: typeof staticData.regions,
          regionsIsNull: staticData.regions === null,
        }
      );
    } else {
      log(
        'info',
        '[PathAnalyzerUI DEBUG] _analyzeDirectConnections - staticData is not a valid object or is null/undefined.'
      );
    }
    // < --- END MOVED AND REFINED --- >

    // Original robust check for staticData and staticData.regions still important
    if (!staticData || typeof staticData !== 'object' || staticData === null) {
      this._logDebug(
        'Error: staticData is not a valid object or is null/undefined. Unable to analyze direct connections.'
      );
      return;
    }

    const allNodes = {
      primaryBlockers: [],
      secondaryBlockers: [],
      tertiaryBlockers: [],
      primaryRequirements: [],
      secondaryRequirements: [],
      tertiaryRequirements: [],
    };

    // Get analysis data from the logic component
    const analysisResult = this.logic.analyzeDirectConnections(
      regionName,
      staticData,
      snapshotInterface
    );

    // Use the staticData parameter to get regionData, not the global stateManager
    const regionData = staticData.regions[regionName];

    // 1. Analyze entrances to this region
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
          const useColorblindForExit = this.colorblindMode; // Get the current colorblind state
          const ruleElement = commonUI.renderLogicTree(
            entrance.access_rule,
            useColorblindForExit,
            snapshotInterface
          );
          entranceDiv.appendChild(ruleElement);
          entrancesContainer.appendChild(entranceDiv);

          const nodeResults = this.logic.analyzeRuleForNodes(
            entrance.access_rule,
            snapshotInterface
          );

          // Aggregate nodes (ensure nodeResults is valid)
          if (nodeResults) {
            Object.keys(allNodes).forEach((key) => {
              // Check if nodeResults[key] exists and is an array before spreading
              if (nodeResults[key] && Array.isArray(nodeResults[key])) {
                allNodes[key].push(...nodeResults[key]);
              } else if (nodeResults[key] !== undefined) {
                log(
                  'warn',
                  `[PathUI] nodeResults[${key}] for entrance ${entrance.name} was not an array:`,
                  nodeResults[key]
                );
              }
            });
          }
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

    // Insert toggle controls at the beginning
    container.insertBefore(toggleContainer, container.firstChild);

    return toggleContainer;
  }

  /**
   * Helper method to create a display element with label text and colored value
   * @param {string} label - The label text (e.g., "Need item:")
   * @param {string} value - The value to display (e.g., "Moon Pearl")
   * @param {string} valueColor - The color for the value
   * @param {Object} node - The full node object for additional context
   * @returns {HTMLElement} - The created display element
   */
  _createNodeDisplay(label, value, valueColor, node = null) {
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

    // Add placeholder for location information that will be populated async
    const locationPlaceholder = document.createElement('span');
    locationPlaceholder.classList.add('location-info-placeholder');
    container.appendChild(locationPlaceholder);

    // Add location information for items if showLocationItems is enabled
    if (node && (node.type === 'item_check' || node.type === 'count_check')) {
      // Check if the setting is enabled (async but updates existing element)
      settingsManager.getSetting('moduleSettings.commonUI.showLocationItems', false).then(showLocationItems => {
        if (!showLocationItems) return;

        const itemName = node.item;

        // Get the current snapshot to find where this item is located
        const snapshot = stateManager.getLatestStateSnapshot();
        const staticData = stateManager.getStaticData();

        if (snapshot?.locationItems && staticData?.locations) {
          // Find ALL locations that have this item
          const locationInfos = [];
          for (const [locName, itemData] of Object.entries(snapshot.locationItems)) {
            if (itemData && itemData.name === itemName) {
              // Get the location's region from static data
              const locData = Object.values(staticData.locations).find(l => l.name === locName);
              if (locData) {
                locationInfos.push({
                  locationName: locName,
                  regionName: locData.region || locData.parent_region
                });
              }
            }
          }

          if (locationInfos.length > 0 && locationPlaceholder.parentNode) {
            // Clear the placeholder
            locationPlaceholder.innerHTML = '';

            const fromSpan = document.createElement('span');
            fromSpan.textContent = ' from ';
            fromSpan.style.color = '#e0e0e0';
            locationPlaceholder.appendChild(fromSpan);

            // Create clickable location links for all locations
            locationInfos.forEach((locationInfo, index) => {
              if (index > 0) {
                const separator = document.createElement('span');
                separator.textContent = index === locationInfos.length - 1 ? ' or ' : ', ';
                separator.style.color = '#e0e0e0';
                locationPlaceholder.appendChild(separator);
              }

              const locLink = commonUI.createLocationLink(
                locationInfo.locationName,
                locationInfo.regionName,
                false,  // Don't use colorblind mode for inline text
                snapshot
              );

              locationPlaceholder.appendChild(locLink);
            });

            // Debug: Log if links were created
            if (typeof window !== 'undefined' && window.logger) {
              window.logger.info('pathAnalyzerUI',
                `Created ${locationInfos.length} location links for item ${itemName}`);
            }
          }
        }
      });
    }

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
      log('error', 'Error formatting arguments:', e);
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
          sectionColor,
          node  // Pass the full node for additional context
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
   * Helper method to update colorblind indicators across the UI
   */
  _updateColorblindIndicators() {
    const useColorblind = settingsManager.getSetting(
      'colorblindMode.pathAnalyzer',
      false
    );

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
      if (useColorblind) {
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
          if (useColorblind) {
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
        useColorblind &&
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
   * Helper method to store analysis results for Playwright integration
   * @param {string} regionName - The region analyzed
   * @param {Object} results - The analysis results
   */
  _storeAnalysisResults(regionName, results) {
    // Store results in localStorage for Playwright to access
    const analysisResults = {
      regionName: regionName,
      timestamp: new Date().toISOString(),
      // Ensure all expected keys from summaryResults are present
      paths: results.paths || [], // Default to empty array if not present
      totalPaths: results.totalPaths !== undefined ? results.totalPaths : 0,
      viablePaths: results.viablePaths !== undefined ? results.viablePaths : 0,
      isReachable:
        results.isReachable !== undefined ? results.isReachable : false,
      hasDiscrepancy:
        results.hasDiscrepancy !== undefined ? results.hasDiscrepancy : false,
      allNodes: results.allNodes || {}, // Default to empty object
    };

    // Store individual result
    localStorage.setItem(
      `__pathAnalysis_${regionName}__`,
      JSON.stringify(analysisResults)
    );

    // Also maintain a list of all analyzed regions
    const existingResults = JSON.parse(
      localStorage.getItem('__pathAnalysisResults__') || '[]'
    );
    const updatedResults = existingResults.filter(
      (r) => r.regionName !== regionName
    );
    updatedResults.push(analysisResults);
    localStorage.setItem(
      '__pathAnalysisResults__',
      JSON.stringify(updatedResults)
    );

    log(
      'info',
      `[PathAnalyzerUI] Stored analysis results for ${regionName}:`,
      analysisResults
    );
  }
}
