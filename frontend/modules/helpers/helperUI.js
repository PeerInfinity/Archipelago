import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import commonUI, { renderLogicTree } from '../commonUI/index.js';
import { getModuleEventBus } from './index.js';
import settingsManager from '../../app/core/settingsManager.js';
import { debounce } from '../commonUI/index.js';
import { createSnapshotInterface } from '../shared/snapshotInterface.js';
import { evaluateRule } from '../shared/ruleEngine.js';
import { DEFAULT_PLAYER_ID } from '../shared/playerIdUtils.js';

function log(level, message, ...data) {
  if (window.logger) {
    window.logger[level]('HelperUI', message, ...data);
  } else {
    console.log(`[HelperUI] ${message}`, ...data);
  }
}

export class HelperUI {
  constructor(container, componentState) {
    this.container = container;
    this.componentState = componentState;
    this.unsubscribeHandles = [];
    this.isInitialized = false;
    Object.defineProperty(this, 'eventBus', { get: () => getModuleEventBus(), configurable: true });
    this.helperStates = {}; // Track expanded/collapsed state and parameter values
    this.exampleArgs = null; // Cache of example arguments found in helper calls

    this.rootElement = this.createRootElement();
    this.helpersContainer = this.rootElement.querySelector(
      '#helper-details-container'
    );
    this.container.element.appendChild(this.rootElement);

    this.attachEventListeners();
    this._subscribeToEvents();

    this.container.on('destroy', () => {
      this.onPanelDestroy();
    });
  }

  _subscribeToEvents() {
    const debouncedUpdate = debounce(() => {
      if (this.isInitialized) {
        this.update();
      }
    }, 50);

    const readyHandler = async () => {
      this.isInitialized = true;
      try {
        this.colorblindSettings = await settingsManager.getSetting('colorblindMode.helpers', false);
      } catch (error) {
        log('error', 'Error loading colorblind settings:', error);
        this.colorblindSettings = false;
      }
      this.update();
      this.eventBus.unsubscribe('stateManager:ready', readyHandler);
    };

    const settingsHandler = async ({ key, value }) => {
      if (key === '*' || key.startsWith('colorblindMode.helpers')) {
        try {
          this.colorblindSettings = await settingsManager.getSetting('colorblindMode.helpers', false);
        } catch (error) {
          log('error', 'Error loading colorblind settings during update:', error);
          this.colorblindSettings = false;
        }
        if (this.isInitialized) debouncedUpdate();
      }
    };

    this.eventBus.subscribe('settings:changed', settingsHandler);
    this.eventBus.subscribe('stateManager:ready', readyHandler);
    this.eventBus.subscribe('stateManager:snapshotUpdated', debouncedUpdate);
    this.eventBus.subscribe('stateManager:rulesLoaded', () => this.update());

    // Store handlers for cleanup
    this.unsubscribeHandles.push(
      () => this.eventBus.unsubscribe('settings:changed', settingsHandler),
      () => this.eventBus.unsubscribe('stateManager:snapshotUpdated', debouncedUpdate)
    );
  }

  onPanelDestroy() {
    this.unsubscribeHandles.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeHandles = [];
  }

  getRootElement() {
    return this.rootElement;
  }

  createRootElement() {
    const element = document.createElement('div');
    element.classList.add('helpers-panel-container', 'panel-container');
    element.style.display = 'flex';
    element.style.flexDirection = 'column';
    element.style.height = '100%';
    element.style.overflow = 'hidden';

    element.innerHTML = `
      <div class="control-group helper-controls" style="padding: 0.5rem; border-bottom: 1px solid #666; flex-shrink: 0;">
        <input type="search" id="helper-search" placeholder="Search helpers..." style="margin-right: 10px;">
        <button id="expand-collapse-all">Expand All</button>
      </div>
      <div id="helper-details-container" style="flex-grow: 1; overflow-y: auto; padding: 0.5rem;"></div>
    `;
    return element;
  }

  attachEventListeners() {
    const searchInput = this.rootElement.querySelector('#helper-search');
    if (searchInput) {
      searchInput.addEventListener(
        'input',
        debounce(() => this.update(), 250)
      );
    }

    const expandCollapseAllButton = this.rootElement.querySelector(
      '#expand-collapse-all'
    );
    if (expandCollapseAllButton) {
      expandCollapseAllButton.addEventListener('click', () => {
        const isExpand = expandCollapseAllButton.textContent === 'Expand All';
        expandCollapseAllButton.textContent = isExpand
          ? 'Collapse All'
          : 'Expand All';

        const staticData = stateManager.getStaticData();
        const playerId = this._getPlayerId();
        const helpers = staticData?.helpers?.[playerId];

        if (helpers) {
          const exampleArgs = this._findExampleArgs(staticData);
          Object.keys(helpers).forEach((helperName) => {
            if (!this.helperStates[helperName]) {
              // Initialize helper state with default parameter values
              const helperDef = helpers[helperName];
              const paramValues = {};
              if (helperDef.params) {
                const helperExamples = exampleArgs[helperName] || [];
                for (let i = 0; i < helperDef.params.length; i++) {
                  const paramName = helperDef.params[i];
                  if (helperDef.defaults && helperDef.defaults[paramName] !== undefined) {
                    paramValues[paramName] = helperDef.defaults[paramName];
                  } else if (helperExamples[i] !== undefined) {
                    paramValues[paramName] = helperExamples[i];
                  }
                }
              }
              this.helperStates[helperName] = { expanded: false, paramValues };
            }
            this.helperStates[helperName].expanded = isExpand;
          });
        }
        this.update();
      });
    }
  }

  _getPlayerId() {
    const staticData = stateManager.getStaticData();
    const snapshot = stateManager.getLatestStateSnapshot();
    return String(
      snapshot?.player?.id ||
      snapshot?.player?.slot ||
      staticData?.playerId ||
      DEFAULT_PLAYER_ID
    );
  }

  /**
   * Find example arguments for helpers by scanning helper calls throughout the rules data.
   * Returns a map of helper name -> array of example constant values for each parameter.
   * Supports both AST format and simplified Rule Builder format.
   */
  _findExampleArgs(staticData) {
    if (this.exampleArgs !== null) {
      return this.exampleArgs;
    }

    this.exampleArgs = {};

    /**
     * Extract constant value from an argument in either format:
     * - AST format: { type: "constant", value: X }
     * - Rule Builder format: { rule: "Constant", args: { value: X } }
     */
    const extractConstantValue = (arg) => {
      if (!arg || typeof arg !== 'object') return undefined;

      // AST format
      if (arg.type === 'constant' && arg.value !== undefined) {
        return arg.value;
      }

      // Rule Builder format
      if (arg.rule === 'Constant' && arg.args?.value !== undefined) {
        return arg.args.value;
      }

      return undefined;
    };

    const findHelperCalls = (obj) => {
      if (!obj || typeof obj !== 'object') return;

      let helperName = null;
      let args = null;

      // AST format: { type: "helper", name: "helper_name", args: [...] }
      if (obj.type === 'helper' && obj.name && Array.isArray(obj.args) && obj.args.length > 0) {
        helperName = obj.name;
        args = obj.args;
      }
      // Rule Builder format: { rule: "helper_name", args: [...], _original_ast_type: "helper" }
      else if (obj.rule && obj._original_ast_type?.endsWith('helper') && Array.isArray(obj.args) && obj.args.length > 0) {
        helperName = obj.rule;
        args = obj.args;
      }

      if (helperName && args && !this.exampleArgs[helperName]) {
        // Extract constant values from args
        const exampleValues = args.map(extractConstantValue);
        // Only store if at least one arg is a constant
        if (exampleValues.some(v => v !== undefined)) {
          this.exampleArgs[helperName] = exampleValues;
        }
      }

      // Recursively search
      if (Array.isArray(obj)) {
        for (const item of obj) {
          findHelperCalls(item);
        }
      } else {
        for (const value of Object.values(obj)) {
          findHelperCalls(value);
        }
      }
    };

    // Search through regions, locations, helpers, and other rule data
    findHelperCalls(staticData.regions);
    findHelperCalls(staticData.locations);
    findHelperCalls(staticData.helpers);
    findHelperCalls(staticData.dungeons);

    return this.exampleArgs;
  }

  update() {
    if (!this.isInitialized) {
      log('info', 'HelperUI not initialized, skipping update.');
      return;
    }
    this.renderAllHelpers();
  }

  renderAllHelpers() {
    const staticData = stateManager.getStaticData();
    const snapshot = stateManager.getLatestStateSnapshot();

    if (!staticData || !staticData.helpers || !snapshot) {
      this.helpersContainer.innerHTML = '<p>Loading helper data...</p>';
      return;
    }

    const playerId = this._getPlayerId();
    const helpers = staticData.helpers[playerId];

    if (!helpers || Object.keys(helpers).length === 0) {
      this.helpersContainer.innerHTML = '<p>No helpers defined for this game.</p>';
      return;
    }

    const snapshotInterface = createSnapshotInterface(
      snapshot,
      staticData
    );
    this.helpersContainer.innerHTML = '';

    const searchTerm = this.rootElement
      .querySelector('#helper-search')
      .value.toLowerCase();

    const helperNames = Object.keys(helpers)
      .filter((name) => name.toLowerCase().includes(searchTerm))
      .sort();

    // Find example args from helper calls in the rules data
    const exampleArgs = this._findExampleArgs(staticData);

    for (const helperName of helperNames) {
      const helperDef = helpers[helperName];
      if (!this.helperStates[helperName]) {
        // Initialize helper state with default parameter values
        const paramValues = {};
        if (helperDef.params) {
          const helperExamples = exampleArgs[helperName] || [];
          for (let i = 0; i < helperDef.params.length; i++) {
            const paramName = helperDef.params[i];
            // First check explicit defaults
            if (helperDef.defaults && helperDef.defaults[paramName] !== undefined) {
              paramValues[paramName] = helperDef.defaults[paramName];
            }
            // Then check example args from calls in the rules
            else if (helperExamples[i] !== undefined) {
              paramValues[paramName] = helperExamples[i];
            }
          }
        }
        this.helperStates[helperName] = { expanded: false, paramValues };
      }
      const helperBlock = this.buildHelperBlock(
        helperName,
        helpers[helperName],
        snapshot,
        snapshotInterface
      );
      this.helpersContainer.appendChild(helperBlock);
    }
  }

  /**
   * Get the helper's body and parameters
   */
  _getHelperStructure(helperDef) {
    if (helperDef.params) {
      // Helper with parameters
      return {
        params: helperDef.params,
        defaults: helperDef.defaults || {},
        body: helperDef.body
      };
    } else {
      // Helper without parameters - the definition IS the body
      return {
        params: [],
        defaults: {},
        body: helperDef
      };
    }
  }

  /**
   * Build the arguments array for helper evaluation based on current param values
   */
  _buildHelperArgs(helperName, structure) {
    const state = this.helperStates[helperName];
    const args = [];

    for (const paramName of structure.params) {
      let value;
      if (state.paramValues.hasOwnProperty(paramName)) {
        value = state.paramValues[paramName];
      } else if (structure.defaults.hasOwnProperty(paramName)) {
        value = structure.defaults[paramName];
      } else {
        // No value and no default - use null
        value = null;
      }

      // Wrap value as a constant for the rule engine
      args.push({ type: 'constant', value: value });
    }

    return args;
  }

  /**
   * Check if any required parameters are missing (null/undefined)
   */
  _hasMissingParams(args) {
    return args.some(arg => arg.type === 'constant' && (arg.value === null || arg.value === undefined));
  }

  /**
   * Evaluate a helper with the given arguments
   */
  _evaluateHelper(helperName, args, snapshotInterface) {
    // Check for missing required parameters
    if (this._hasMissingParams(args)) {
      return { success: false, error: 'missing required parameters', isMissingParams: true };
    }

    try {
      const helperRule = {
        type: 'helper',
        name: helperName,
        args: args
      };

      const result = evaluateRule(helperRule, snapshotInterface);
      return { success: true, value: result };
    } catch (error) {
      log('error', `Error evaluating helper ${helperName}:`, error);
      return { success: false, error: error.message };
    }
  }

  buildHelperBlock(helperName, helperDef, snapshot, snapshotInterface) {
    const helperState = this.helperStates[helperName];
    const expanded = helperState.expanded;
    const structure = this._getHelperStructure(helperDef);

    // Evaluate the helper with current parameter values
    const args = this._buildHelperArgs(helperName, structure);
    const evalResult = this._evaluateHelper(helperName, args, snapshotInterface);

    // Outer container
    const block = document.createElement('div');
    block.classList.add('region-block'); // Reuse region-block styling
    block.classList.add(expanded ? 'expanded' : 'collapsed');
    block.dataset.helper = helperName;

    // Determine status styling based on evaluation result
    let statusClass = '';
    let statusText = '';

    if (!evalResult.success) {
      if (evalResult.isMissingParams) {
        statusClass = 'unknown';
        statusText = 'needs params';
      } else {
        statusClass = 'error';
        statusText = 'error';
      }
    } else if (evalResult.value === true) {
      statusClass = 'accessible';
      statusText = 'true';
    } else if (evalResult.value === false) {
      statusClass = 'inaccessible';
      statusText = 'false';
    } else {
      // Non-boolean result (e.g., a number)
      statusClass = '';
      statusText = String(evalResult.value);
    }

    // Header
    const header = document.createElement('div');
    header.classList.add('region-header');

    const hasParams = structure.params.length > 0;
    const paramsHint = hasParams ? ` (${structure.params.length} params)` : '';

    header.innerHTML = `
      <span class="region-name" title="${helperName}">${helperName}</span>
      <span class="region-status ${statusClass}">${statusText}${paramsHint}</span>
      <button class="collapse-btn">${expanded ? 'Collapse' : 'Expand'}</button>
    `;

    // Apply colorblind mode if enabled
    if (this.colorblindSettings && statusClass) {
      const statusSpan = header.querySelector('.region-status');
      if (statusSpan) {
        statusSpan.classList.add('colorblind-mode');
      }
    }

    // Header click listener
    header.addEventListener('click', (e) => {
      if (e.target.classList.contains('collapse-btn')) {
        e.stopPropagation();
      }
      helperState.expanded = !helperState.expanded;
      this.update();
    });

    block.appendChild(header);

    // Content container
    const content = document.createElement('div');
    content.classList.add('region-content');
    content.style.display = expanded ? 'block' : 'none';

    if (expanded) {
      // Parameters section (if helper has params)
      if (hasParams) {
        const paramsContainer = document.createElement('div');
        paramsContainer.style.marginBottom = '10px';
        paramsContainer.innerHTML = '<h4>Parameters</h4>';

        const paramsForm = document.createElement('div');
        paramsForm.classList.add('helper-params-form');
        paramsForm.style.display = 'flex';
        paramsForm.style.flexDirection = 'column';
        paramsForm.style.gap = '5px';

        for (const paramName of structure.params) {
          const paramRow = document.createElement('div');
          paramRow.style.display = 'flex';
          paramRow.style.alignItems = 'center';
          paramRow.style.gap = '10px';

          const label = document.createElement('label');
          label.textContent = `${paramName}:`;
          label.style.minWidth = '120px';
          label.style.fontFamily = 'monospace';

          const defaultValue = structure.defaults[paramName];
          const currentValue = helperState.paramValues.hasOwnProperty(paramName)
            ? helperState.paramValues[paramName]
            : defaultValue;

          let input;

          if (typeof defaultValue === 'boolean' || typeof currentValue === 'boolean') {
            // Boolean parameter - use checkbox
            input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = currentValue === true;
            input.dataset.paramName = paramName;
            input.dataset.helperName = helperName;
            input.addEventListener('change', (e) => {
              this.helperStates[helperName].paramValues[paramName] = e.target.checked;
              this.update();
            });
          } else if (typeof defaultValue === 'number' || typeof currentValue === 'number') {
            // Number parameter - use number input
            input = document.createElement('input');
            input.type = 'number';
            input.value = currentValue !== undefined && currentValue !== null ? currentValue : '';
            input.style.width = '80px';
            input.dataset.paramName = paramName;
            input.dataset.helperName = helperName;
            input.addEventListener('change', (e) => {
              const val = e.target.value === '' ? null : Number(e.target.value);
              this.helperStates[helperName].paramValues[paramName] = val;
              this.update();
            });
          } else {
            // String or other - use text input
            input = document.createElement('input');
            input.type = 'text';
            input.value = currentValue !== undefined && currentValue !== null ? String(currentValue) : '';
            input.style.width = '150px';
            input.dataset.paramName = paramName;
            input.dataset.helperName = helperName;
            input.addEventListener('change', (e) => {
              this.helperStates[helperName].paramValues[paramName] = e.target.value;
              this.update();
            });
          }

          paramRow.appendChild(label);
          paramRow.appendChild(input);

          // Show default value hint
          if (defaultValue !== undefined) {
            const hint = document.createElement('span');
            hint.style.color = '#888';
            hint.style.fontSize = '0.85em';
            hint.textContent = `(default: ${JSON.stringify(defaultValue)})`;
            paramRow.appendChild(hint);
          }

          paramsForm.appendChild(paramRow);
        }

        paramsContainer.appendChild(paramsForm);
        content.appendChild(paramsContainer);
      }

      // Result section
      const resultContainer = document.createElement('div');
      resultContainer.style.marginBottom = '10px';
      resultContainer.innerHTML = '<h4>Result</h4>';

      const resultDisplay = document.createElement('div');
      resultDisplay.style.padding = '5px 10px';
      resultDisplay.style.borderRadius = '4px';
      resultDisplay.style.fontFamily = 'monospace';

      if (!evalResult.success) {
        if (evalResult.isMissingParams) {
          resultDisplay.style.backgroundColor = '#3a3a3a';
          resultDisplay.style.color = '#aaaaaa';
          resultDisplay.textContent = 'Cannot evaluate: set required parameters above';
        } else {
          resultDisplay.style.backgroundColor = '#5a3030';
          resultDisplay.style.color = '#ff9999';
          resultDisplay.textContent = `Error: ${evalResult.error}`;
        }
      } else if (evalResult.value === true) {
        resultDisplay.style.backgroundColor = this.colorblindSettings ? '#1a3a5c' : '#2a5a2a';
        resultDisplay.style.color = this.colorblindSettings ? '#6cb4ff' : '#90ee90';
        resultDisplay.textContent = 'true';
      } else if (evalResult.value === false) {
        resultDisplay.style.backgroundColor = this.colorblindSettings ? '#4a3a1a' : '#5a2a2a';
        resultDisplay.style.color = this.colorblindSettings ? '#ffcc66' : '#ff9090';
        resultDisplay.textContent = 'false';
      } else {
        resultDisplay.style.backgroundColor = '#3a3a5a';
        resultDisplay.style.color = '#c0c0ff';
        resultDisplay.textContent = JSON.stringify(evalResult.value);
      }

      resultContainer.appendChild(resultDisplay);
      content.appendChild(resultContainer);

      // Rule tree section
      const ruleContainer = document.createElement('div');
      ruleContainer.innerHTML = '<h4>Implementation</h4>';

      const ruleDiv = document.createElement('div');
      ruleDiv.classList.add('logic-tree');

      if (structure.body) {
        const ruleTree = renderLogicTree(
          structure.body,
          this.colorblindSettings,
          snapshotInterface
        );
        ruleDiv.appendChild(ruleTree);
      } else {
        ruleDiv.innerHTML = '<em>No implementation body found</em>';
      }

      ruleContainer.appendChild(ruleDiv);
      content.appendChild(ruleContainer);
    }

    block.appendChild(content);
    return block;
  }
}
