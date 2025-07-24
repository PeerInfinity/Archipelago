import eventBus from '../../app/core/eventBus.js';
import { PathAnalyzerUI } from '../pathAnalyzer/pathAnalyzerUI.js';
import {
  getPathAnalyzerPanelModuleId,
  setPathAnalyzerPanelUIInstance,
  getModuleDispatcher,
  getModuleEventBus,
} from './index.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('pathAnalyzerPanelUI', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[pathAnalyzerPanelUI] ${message}`, ...data);
  }
}

export class PathAnalyzerPanelUI {
  constructor(container, componentState, componentType) {
    this.moduleId = componentType || getPathAnalyzerPanelModuleId();
    log(
      'info',
      `[PathAnalyzerPanelUI for ${this.moduleId}] Constructor called.`
    );
    setPathAnalyzerPanelUIInstance(this);

    this.container = container;
    this.componentState = componentState;

    this.rootElement = document.createElement('div');
    this.rootElement.className =
      'path-analyzer-panel-ui-container panel-container';
    this.rootElement.id = 'path-analyzer-panel-container';
    this.rootElement.style.cssText = `
      width: 100%;
      height: 100%;
      overflow: auto;
      padding: 10px;
      box-sizing: border-box;
      background: #1e1e1e;
      color: #e0e0e0;
    `;

    // Create the PathAnalyzerUI instance with default settings
    this.pathAnalyzer = new PathAnalyzerUI(null); // No regionUI parent

    this.moduleStateChangeHandler =
      this._handleSelfModuleStateChange.bind(this);

    this.container.on('open', this._handlePanelOpen.bind(this));
    this.container.on('show', this._handlePanelShow.bind(this));
    this.container.on('hide', this._handlePanelHide.bind(this));
    this.container.on('destroy', this._handlePanelDestroy.bind(this));

    eventBus.subscribe('module:stateChanged', this.moduleStateChangeHandler, 'pathAnalyzerPanel');

    this._createUI();

    log(
      'info',
      `[PathAnalyzerPanelUI for ${this.moduleId}] Panel UI instance created.`
    );
  }

  _createUI() {
    const title = document.createElement('h3');
    title.textContent = 'Path Analyzer';
    title.style.cssText =
      'margin: 0 0 15px 0; color: #e0e0e0; border-bottom: 2px solid #555; padding-bottom: 5px;';
    this.rootElement.appendChild(title);

    const description = document.createElement('p');
    description.textContent =
      'Enter a region name to analyze paths and requirements. This is a standalone version with configurable settings.';
    description.style.cssText =
      'margin: 0 0 15px 0; color: #b0b0b0; font-size: 14px;';
    this.rootElement.appendChild(description);

    // Create region input section
    const inputSection = document.createElement('div');
    inputSection.style.cssText =
      'margin-bottom: 15px; display: flex; gap: 10px; align-items: center;';

    const regionLabel = document.createElement('label');
    regionLabel.textContent = 'Region Name:';
    regionLabel.style.cssText = 'font-weight: bold; color: #e0e0e0;';

    this.regionInput = document.createElement('input');
    this.regionInput.type = 'text';
    this.regionInput.placeholder = 'e.g., "Lost Woods"';
    this.regionInput.dataset.testid = 'path-analyzer-region-input';
    this.regionInput.style.cssText =
      'padding: 5px 10px; border: 1px solid #555; border-radius: 4px; flex: 1; max-width: 200px; background: #333; color: #e0e0e0;';

    this.analyzeButton = document.createElement('button');
    this.analyzeButton.textContent = 'Analyze Paths';
    this.analyzeButton.className = 'button';
    this.analyzeButton.dataset.testid = 'path-analyzer-analyze-button';
    this.analyzeButton.style.cssText =
      'padding: 5px 15px; background-color: #4caf50; color: white; border: 1px solid #4caf50; border-radius: 4px; cursor: pointer;';

    inputSection.appendChild(regionLabel);
    inputSection.appendChild(this.regionInput);
    inputSection.appendChild(this.analyzeButton);
    this.rootElement.appendChild(inputSection);

    // Create results container
    this.resultsContainer = document.createElement('div');
    this.resultsContainer.className = 'path-analysis-results';
    this.resultsContainer.style.cssText =
      'border: 1px solid #555; border-radius: 4px; padding: 10px; min-height: 100px; background: #2a2a2a; color: #e0e0e0;';
    this.resultsContainer.innerHTML =
      '<p style="color: #b0b0b0; margin: 0;">Enter a region name and click "Analyze Paths" to begin analysis.</p>';
    this.rootElement.appendChild(this.resultsContainer);

    // Create a fake paths count span for compatibility
    this.pathsCountSpan = document.createElement('span');
    this.pathsCountSpan.style.display = 'none';

    // Set up event listeners
    this.analyzeButton.addEventListener('click', () => this._performAnalysis());
    this.regionInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this._performAnalysis();
      }
    });
  }

  _performAnalysis() {
    const regionName = this.regionInput.value.trim();
    if (!regionName) {
      this.resultsContainer.innerHTML =
        '<p style="color: #ff6b6b; margin: 0;">Please enter a region name.</p>';
      return;
    }

    log(
      'info',
      `[PathAnalyzerPanelUI] Starting analysis for region: ${regionName}`
    );

    // Clear previous results and show analyzing state
    this.resultsContainer.innerHTML = '';
    this.analyzeButton.textContent = 'Analyzing...';
    this.analyzeButton.disabled = true;

    // Update the region input to be readonly during analysis to avoid confusion
    this.regionInput.readOnly = true;
    this.regionInput.style.backgroundColor = '#404040';

    // Directly call the performPathAnalysis method
    setTimeout(() => {
      try {
        this.pathAnalyzer.performPathAnalysis(
          regionName,
          this.resultsContainer,
          this.pathsCountSpan,
          this.analyzeButton
        );

        // Re-enable the region input after analysis starts
        this.regionInput.readOnly = false;
        this.regionInput.style.backgroundColor = '#333';
      } catch (error) {
        log('error', `[PathAnalyzerPanelUI] Analysis failed:`, error);
        this.resultsContainer.innerHTML = `<p style="color: #ff6b6b; margin: 0;">Analysis failed: ${error.message}</p>`;
        this.analyzeButton.textContent = 'Analyze Paths';
        this.analyzeButton.disabled = false;
        this.regionInput.readOnly = false;
        this.regionInput.style.backgroundColor = '#333';
      }
    }, 100); // Small delay to allow UI to update
  }

  getRootElement() {
    return this.rootElement;
  }

  onMount(glContainer, componentState) {
    log(
      'info',
      `[PathAnalyzerPanelUI for ${this.moduleId}] onMount CALLED. Panel ready.`
    );
  }

  onUnmount() {
    log('info', `[PathAnalyzerPanelUI for ${this.moduleId}] onUnmount CALLED.`);
    setPathAnalyzerPanelUIInstance(null);

    if (this.moduleStateChangeHandler) {
      eventBus.unsubscribe(
        'module:stateChanged',
        this.moduleStateChangeHandler
      );
      this.moduleStateChangeHandler = null;
    }

    if (this.pathAnalyzer) {
      this.pathAnalyzer.dispose();
      this.pathAnalyzer = null;
    }
  }

  _handlePanelOpen() {
    log(
      'info',
      `[PathAnalyzerPanelUI for ${this.moduleId}] GoldenLayout 'open' event.`
    );
  }

  _handlePanelShow() {
    log(
      'info',
      `[PathAnalyzerPanelUI for ${this.moduleId}] GoldenLayout 'show' event.`
    );
  }

  _handlePanelHide() {
    log(
      'info',
      `[PathAnalyzerPanelUI for ${this.moduleId}] GoldenLayout 'hide' event.`
    );
  }

  _handlePanelDestroy() {
    log(
      'info',
      `[PathAnalyzerPanelUI for ${this.moduleId}] GoldenLayout 'destroy' event.`
    );
    this.onUnmount();

    // Notify that this panel was manually closed
    const bus = getModuleEventBus();
    if (bus && typeof bus.publish === 'function') {
      log(
        'info',
        `[PathAnalyzerPanelUI for ${this.moduleId}] Panel destroyed, publishing ui:panelManuallyClosed.`
      );
      bus.publish('ui:panelManuallyClosed', { moduleId: this.moduleId });
    }
  }

  _handleSelfModuleStateChange({ moduleId, enabled }) {
    if (moduleId === this.moduleId) {
      log(
        'info',
        `[PathAnalyzerPanelUI] Module state changed: ${moduleId} -> ${
          enabled ? 'enabled' : 'disabled'
        }`
      );
    }
  }
}
