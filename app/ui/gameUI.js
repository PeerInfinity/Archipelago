// gameUI.js - Updated to work directly with console client

import stateManager from '../core/stateManagerSingleton.js';
import { LocationUI } from './locationUI.js';
import { ExitUI } from './exitUI.js';
import { RegionUI } from './regionUI.js';
import { InventoryUI } from './inventoryUI.js';
import { TestCaseUI } from './testCaseUI.js';
import { TestPlaythroughUI } from './testPlaythroughUI.js';
import { LoopUI } from './loopUI.js';
import commonUI from './commonUI.js';
import { PresetUI } from './presetUI.js';
import connection from '../../client/core/connection.js';
import messageHandler from '../../client/core/messageHandler.js';
import eventBus from '../../app/core/eventBus.js';
import loopState from '../core/loop/loopState.js'; // Make sure loopState is imported if not already

export class GameUI {
  constructor() {
    // UI Managers
    this.locationUI = new LocationUI(this);
    this.exitUI = new ExitUI(this);
    this.regionUI = new RegionUI(this);
    this.inventoryUI = new InventoryUI(this);
    this.testCaseUI = new TestCaseUI(this);
    this.testPlaythroughUI = new TestPlaythroughUI(this);
    this.presetUI = new PresetUI(this);
    this.loopUI = new LoopUI(this);
    this.currentFileView = 'presets'; // Track which file view is active
    this.filesPanelContainer = null; // Store reference to the live container
    this.mainConsoleElement = null; // Store reference for deferred init
    this.mainConsoleInputElement = null; // Store reference for deferred init

    // Initialize commonUI colorblind mode
    commonUI.setColorblindMode(true); // Enable colorblind mode by default

    // Register with stateManager for UI updates
    stateManager.registerUICallback('gameUI', (eventType) => {
      if (eventType === 'inventoryChanged') {
        this.inventoryUI?.syncWithState();
      } else if (eventType === 'reachableRegionsComputed') {
        this.locationUI?.syncWithState();
        this.exitUI?.syncWithState();
        this.regionUI?.update();
        if (this.currentViewMode === 'loop') {
          this.loopUI?.renderLoopPanel();
        }
      }
    });

    // Game state
    this.currentViewMode = 'locations';
    this.debugMode = false;
    this.currentRules = null; // Track current rules data

    // Initialize tracking set for user clicked items
    window._userClickedItems = new Set();

    // Initialize UI
    this.attachEventListeners();
    this.loadDefaultRules();

    // Initialize test case UI - MOVED to init.js after container exists
    /*
    try {
      const success = this.testCaseUI.initialize();
      if (!success) {
        console.error('Failed to initialize test cases');
      }
    } catch (error) {
      console.error('Failed to initialize test cases:', error);
    }
    */
  }

  initializeUI(jsonData, selectedPlayerId) {
    // Don't store duplicate data locally - stateManager should be the single source of truth
    if (!selectedPlayerId) {
      console.error('InitializeUI called without selectedPlayerId');
      return;
    }
    const playerItems = jsonData.items[selectedPlayerId];
    const groups = jsonData.item_groups[selectedPlayerId];

    // Initialize view-specific UIs
    this.inventoryUI.initialize(playerItems, groups);

    // Have UI components get data from stateManager instead of passing jsonData
    this.locationUI.initialize();
    this.exitUI.initialize();
    this.regionUI.initialize();
  }

  attachEventListeners() {
    // Initialize collapsible center column
    this.initializeCollapsibleCenter();

    // File upload
    const jsonUpload = document.getElementById('json-upload');
    if (jsonUpload) {
      jsonUpload.addEventListener('change', (e) => this.handleFileUpload(e));
    }

    // Debug toggle
    const debugToggle = document.getElementById('debug-toggle');
    if (debugToggle) {
      debugToggle.addEventListener('click', () => {
        this.debugMode = !this.debugMode;
        debugToggle.textContent = this.debugMode ? 'Hide Debug' : 'Show Debug';

        // Set debug mode on stateManager
        stateManager.setDebugMode?.(this.debugMode);

        // Set debug mode on pathAnalyzer too
        if (this.regionUI && this.regionUI.pathAnalyzer) {
          this.regionUI.pathAnalyzer.setDebugMode(this.debugMode);
        }
      });
    }

    // File view toggle radio buttons
    document
      .querySelectorAll('input[name="file-view-mode"]')
      .forEach((radio) => {
        radio.addEventListener('change', (e) => {
          if (e.target.checked) {
            this.setFileViewMode(e.target.value);
          }
        });
      });
  }

  clearExistingData() {
    // Use the more comprehensive clearState instead of just clearInventory
    stateManager.clearState();

    // Clear UI elements
    this.inventoryUI.clear();
    this.locationUI.clear();
    this.exitUI.clear();
    this.regionUI.clear();
  }

  loadDefaultRules() {
    try {
      // Use synchronous XMLHttpRequest
      const xhr = new XMLHttpRequest();
      xhr.open('GET', './default_rules.json', false); // false makes it synchronous
      xhr.send();

      if (xhr.status !== 200) {
        throw new Error(`HTTP error! status: ${xhr.status}`);
      }

      const jsonData = JSON.parse(xhr.responseText);

      // === Player Selection Logic ===
      let selectedPlayerId = null;
      const playerIds = Object.keys(jsonData.player_names || {});

      if (playerIds.length === 0) {
        throw new Error('No players found in the JSON data.');
      } else if (playerIds.length === 1) {
        selectedPlayerId = playerIds[0];
        console.log(`Auto-selected single player ID: ${selectedPlayerId}`);
      } else {
        // Prompt user to select a player (simple prompt for now)
        const playerOptions = playerIds
          .map((id) => `${id}: ${jsonData.player_names[id]}`)
          .join('\n');
        const choice = prompt(
          `Multiple players found. Please enter the ID of the player to load:\n${playerOptions}`
        );

        if (choice && jsonData.player_names[choice]) {
          selectedPlayerId = choice;
          console.log(`User selected player ID: ${selectedPlayerId}`);
        } else {
          throw new Error('Invalid player selection or prompt cancelled.');
        }
      }
      // === End Player Selection Logic ===

      this.clearExistingData();
      this.currentRules = jsonData; // Store current rules

      // Use selectedPlayerId for loading
      stateManager.initializeInventory(
        [], // Initial items
        jsonData.progression_mapping[selectedPlayerId],
        jsonData.items[selectedPlayerId]
      );

      // Load the complete rules data into the state manager, passing the selected player ID
      stateManager.loadFromJSON(jsonData, selectedPlayerId);

      this.initializeUI(jsonData, selectedPlayerId);

      // Directly update the progress UI
      try {
        import('../../client/ui/progressUI.js').then((module) => {
          const ProgressUI = module.default;
          console.log('Directly updating progress UI after JSON load');
          ProgressUI.updateProgress();
        });
      } catch (error) {
        console.error('Error directly updating progress UI:', error);
      }

      if (window.consoleManager) {
        window.consoleManager.print(
          'Successfully loaded default rules',
          'success'
        );
      }

      // Trigger rules:loaded event to enable offline play
      eventBus.publish('rules:loaded', {});

      // Directly enable the control buttons
      this._enableControlButtons();
    } catch (error) {
      console.error('Error loading default rules:', error);
      if (window.consoleManager) {
        window.consoleManager.print(
          `Error loading default rules: ${error.message}`,
          'error'
        );
      }
    }
  }

  // Helper method to directly enable control buttons
  _enableControlButtons() {
    // Enable the Begin! button
    const controlButton = document.getElementById('control-button');
    if (controlButton) {
      controlButton.removeAttribute('disabled');
    }

    // Enable the Quick Check button
    const quickCheckButton = document.getElementById('quick-check-button');
    if (quickCheckButton) {
      quickCheckButton.removeAttribute('disabled');
    }
  }

  handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      this.clearExistingData();

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const jsonData = JSON.parse(e.target.result);

          // === Player Selection Logic ===
          let selectedPlayerId = null;
          const playerIds = Object.keys(jsonData.player_names || {});
          let playerIdFromFilename = null;

          // Try to extract player ID from filename
          const filenameMatch = file.name.match(/_P(\d+)_rules\.json$/);
          if (filenameMatch && filenameMatch[1]) {
            const potentialId = filenameMatch[1];
            if (jsonData.player_names && jsonData.player_names[potentialId]) {
              playerIdFromFilename = potentialId;
              console.log(
                `Determined player ID from filename: ${playerIdFromFilename}`
              );
            } else {
              console.warn(
                `Player ID ${potentialId} from filename not found in JSON data. Falling back to prompt/auto-select.`
              );
            }
          }

          if (playerIdFromFilename) {
            selectedPlayerId = playerIdFromFilename;
          } else if (playerIds.length === 0) {
            throw new Error('No players found in the JSON data.');
          } else if (playerIds.length === 1) {
            selectedPlayerId = playerIds[0];
            console.log(`Auto-selected single player ID: ${selectedPlayerId}`);
          } else {
            // Prompt user to select a player (simple prompt for now)
            const playerOptions = playerIds
              .map((id) => `${id}: ${jsonData.player_names[id]}`)
              .join('\n');
            const choice = prompt(
              `Multiple players found. Please enter the ID of the player to load:\n${playerOptions}`
            );

            if (choice && jsonData.player_names[choice]) {
              selectedPlayerId = choice;
              console.log(`User selected player ID: ${selectedPlayerId}`);
            } else {
              throw new Error('Invalid player selection or prompt cancelled.');
            }
          }
          // === End Player Selection Logic ===

          this.clearExistingData(); // Moved clear after selection
          this.currentRules = jsonData; // Store current rules

          // Use selectedPlayerId for loading
          stateManager.initializeInventory(
            [],
            jsonData.progression_mapping[selectedPlayerId],
            jsonData.items[selectedPlayerId]
          );

          // Load the complete rules data into the state manager, passing the selected player ID
          stateManager.loadFromJSON(jsonData, selectedPlayerId);

          this.initializeUI(jsonData, selectedPlayerId);

          // Directly update the progress UI
          try {
            import('../../client/ui/progressUI.js').then((module) => {
              const ProgressUI = module.default;
              console.log('Directly updating progress UI after JSON load');
              ProgressUI.updateProgress();
            });
          } catch (error) {
            console.error('Error directly updating progress UI:', error);
          }

          if (window.consoleManager) {
            window.consoleManager.print(
              'Successfully loaded game data',
              'success'
            );
          }

          // Trigger rules:loaded event to enable offline play
          eventBus.publish('rules:loaded', {});

          // Directly enable the control buttons
          this._enableControlButtons();
        } catch (error) {
          console.error('Error parsing JSON file:', error);
          if (window.consoleManager) {
            window.consoleManager.print(
              `Error parsing JSON file: ${error.message}`,
              'error'
            );
          }
        }
      };
      reader.readAsText(file);
    } catch (error) {
      console.error('Error handling file upload:', error);
      if (window.consoleManager) {
        window.consoleManager.print(
          `Error handling file upload: ${error.message}`,
          'error'
        );
      }
    }
  }

  /**
   * Initialize collapse/expand functionality for the center column
   */
  initializeCollapsibleCenter() {
    const collapseBtn = document.getElementById('main-content-collapse-btn');
    const expandBtn = document.getElementById('main-content-expand-btn');
    const mainContent = document.getElementById('main-content');
    const inventoryHeader = document.querySelector('.sidebar-header');

    if (collapseBtn && expandBtn && mainContent && inventoryHeader) {
      // Initial state: hide the expand button
      expandBtn.style.display = 'none';

      // Setup event listeners
      collapseBtn.addEventListener('click', () => {
        mainContent.classList.add('collapsed');
        expandBtn.style.display = 'flex';
      });

      expandBtn.addEventListener('click', () => {
        mainContent.classList.remove('collapsed');
        expandBtn.style.display = 'none';
      });

      // Auto-collapse for small screens (mobile)
      const checkWindowSize = () => {
        if (window.innerWidth <= 1480) {
          // Auto-collapse on small screens
          if (!mainContent.classList.contains('collapsed')) {
            mainContent.classList.add('collapsed');
            expandBtn.style.display = 'flex';
          }
        }
      };

      // Check on initial load
      checkWindowSize();

      // Check when window is resized
      window.addEventListener('resize', checkWindowSize);
    }
  }

  setFileViewMode(mode) {
    this.currentFileView = mode;
    this.updateFileViewDisplay();
  }

  updateFileViewDisplay() {
    // Use the stored DOM container reference
    const filesContentArea = this.filesPanelContainer?.querySelector(
      '#files-panel-content'
    );

    if (!filesContentArea) {
      console.warn('Files panel content area not found for updating view.');
      return;
    }

    const testCasesPanel = filesContentArea.querySelector('#test-cases-panel');
    const presetsPanel = filesContentArea.querySelector('#presets-panel');
    const testPlaythroughsPanel = filesContentArea.querySelector(
      '#test-playthroughs-panel'
    );

    if (!testCasesPanel || !presetsPanel || !testPlaythroughsPanel) {
      console.warn('Missing file view containers.');
      return;
    }

    // Toggle between file views
    testCasesPanel.style.display = 'none';
    presetsPanel.style.display = 'none';
    testPlaythroughsPanel.style.display = 'none';

    // Clear displays of inactive test UIs only if they were initialized
    if (this.currentFileView !== 'test-cases' && this.testCaseUI?.initialized) {
      this.testCaseUI.clearTestData();
    }
    if (
      this.currentFileView !== 'test-playthroughs' &&
      this.testPlaythroughUI?.initialized
    ) {
      this.testPlaythroughUI.clearDisplay();
    }

    // Only initialize if Loop Mode is NOT active
    const isLoopModeActive = window.loopUIInstance?.isLoopModeActive;
    if (!isLoopModeActive) {
      // Show the selected panel and initialize if needed
      if (this.currentFileView === 'presets') {
        presetsPanel.style.display = 'block';
        // Initialize presetUI only if it hasn't been initialized or if its container is empty
        if (
          !this.presetUI.initialized ||
          !presetsPanel.querySelector('#presets-list')?.hasChildNodes()
        ) {
          this.presetUI.initialize();
          this.presetUI.initialized = true; // Add a flag to track initialization
        }
      } else if (this.currentFileView === 'test-cases') {
        testCasesPanel.style.display = 'block';
        // Initialize testCaseUI only if it hasn't been initialized or if its container is empty
        if (
          !this.testCaseUI.initialized ||
          !testCasesPanel.querySelector('#test-cases-list')?.hasChildNodes()
        ) {
          this.testCaseUI.initialize();
          this.testCaseUI.initialized = true; // Add a flag
        }
      } else if (this.currentFileView === 'test-playthroughs') {
        testPlaythroughsPanel.style.display = 'block';
        // Initialize testPlaythroughUI only if it hasn't been initialized or if its container is empty
        if (
          !this.testPlaythroughUI.initialized ||
          !testPlaythroughsPanel.querySelector('.playthrough-list-container')
        ) {
          // Check for specific content
          this.testPlaythroughUI.initialize();
          this.testPlaythroughUI.initialized = true; // Add a flag
        }
      }
    } else {
      // If loop mode is active, ensure all file panels remain hidden
      presetsPanel.style.display = 'none';
      testCasesPanel.style.display = 'none';
      testPlaythroughsPanel.style.display = 'none';
    }
  }

  registerConsoleCommands() {
    if (!window.consoleManager) return;

    const commands = {
      item: {
        description: 'Toggle an item in your inventory',
        usage: 'item <name>',
        handler: (args) => {
          const itemName = args.join(' ');
          if (
            this.inventoryUI.itemData &&
            this.inventoryUI.itemData[itemName]
          ) {
            this.inventoryUI.modifyItemCount(itemName);
            return `Toggled ${itemName}`;
          } else {
            return `Item "${itemName}" not found`;
          }
        },
      },
      items: {
        description: 'List all available items',
        usage: 'items',
        handler: () => {
          if (!this.inventoryUI.itemData) return 'No items loaded';
          return Object.entries(this.inventoryUI.itemData)
            .map(([name, data]) => `${name} (${data.groups.join(', ')})`)
            .join('\n');
        },
      },
      clear: {
        description: 'Clear all items from inventory',
        usage: 'clear',
        handler: () => {
          this.clearExistingData();
          return 'Inventory cleared';
        },
      },
    };

    Object.entries(commands).forEach(([name, command]) => {
      window.consoleManager.registerCommand(name, command);
    });
  }

  // Creates the main DOM structure for the main content panel
  getMainContentRootElement() {
    const element = document.createElement('div');
    element.classList.add('main-content-panel-container', 'panel-container');
    element.style.display = 'flex';
    element.style.flexDirection = 'column';
    element.style.height = '100%';
    element.style.overflow = 'hidden';
    element.style.padding = '1em'; // Add padding back
    element.style.color = '#cecece'; // Ensure text color
    element.style.backgroundColor = '#2d2d2d'; // Ensure background

    // Recreate the structure from index.html
    element.innerHTML = `
        <!-- <div id="main-content-collapse-btn" title="Collapse Center Column">◀</div> Collapse button removed, GL handles resizing -->
        <h2 id="header-text" style="text-align: center; margin: 0 0 1em 0;">J S O N &nbsp; W e b &nbsp; C l i e n t</h2>

        <div id="status-bar" style="display: flex; justify-content: space-between; margin-bottom: 1em; flex-shrink: 0;">
          <div>
            AP Server: <span id="server-status" class="red">Not Connected</span>
          </div>
          <div>
            <label for="server-address">Server Address:</label>
            <input id="server-address" value="ws://localhost:38281" />
          </div>
        </div>

        <div id="progress-container" style="text-align: center; margin-bottom: 1em; flex-shrink: 0;">
          <h3 id="progress-container-header" style="margin-bottom: 0;">Location Check Progress</h3>
          <progress id="progress-bar" value="0" max="30000" style="width: 100%;"></progress>
          <span id="checks-sent">Checked: 0</span><br />
          <div class="button-container" style="display: flex; gap: 10px; margin-top: 10px;">
            <button id="control-button" class="button" disabled="disabled" style="flex: 1;">Begin!</button>
            <button id="quick-check-button" class="button" disabled="disabled" style="flex: 1;">
              Quick Check
            </button>
          </div>
        </div>

        <div id="console" style="border: 1px solid #666; border-radius: 4px; flex-grow: 1; overflow-y: auto; margin-bottom: 1em; background-color: #1a1a1a;">
          <!-- Populated by JS -->
        </div>

        <div id="command-wrapper" style="display: flex; flex-shrink: 0;">
          <label for="console-input"></label>
          <input
            id="console-input"
            style="flex-grow: 1;"
            placeholder="Enter a command here, then press enter."
          />
        </div>
    `;
    return element;
  }

  // Attaches listeners and populates content within the main panel's root element
  initializeMainContentElements(containerElement) {
    // Get the underlying DOM element
    const rootElement = containerElement[0];

    // Find elements within the DOM element
    this.mainConsoleElement = rootElement.querySelector('#console'); // Store reference
    this.mainConsoleInputElement = rootElement.querySelector('#console-input'); // Store reference

    // Keep listener attachment logic
    const controlButton = containerElement.find('#control-button');
    const quickCheckButton = containerElement.find('#quick-check-button');
    const serverAddressInput = containerElement.find('#server-address');

    if (controlButton.length && window.APP) {
      controlButton
        .off('click')
        .on('click', () => window.APP.toggleConnection());
    }
    if (quickCheckButton.length && window.messageHandler) {
      quickCheckButton
        .off('click')
        .on('click', () => window.messageHandler.sendQuickCheck());
    }
    if (serverAddressInput.length && window.APP) {
      serverAddressInput
        .off('change')
        .on('change', () =>
          window.APP.updateServerAddress(serverAddressInput.val())
        );
    }

    // Keep ProgressUI initialization
    try {
      import('../../client/ui/progressUI.js').then((module) => {
        const ProgressUI = module.default;
        ProgressUI.initializeWithin(rootElement);
        ProgressUI.updateProgress();
      });
    } catch (error) {
      console.error('Error initializing progress UI within main panel:', error);
    }
  }

  // Method to be called after client/app.js initializes ConsoleUI
  activateConsole() {
    console.log('[GameUI] activateConsole called. Checking prerequisites...');
    if (
      window.ConsoleManager &&
      this.mainConsoleElement &&
      this.mainConsoleInputElement
    ) {
      console.log(
        '[GameUI] ConsoleManager and elements found. Initializing ConsoleManager...'
      );
      window.consoleManager = new window.ConsoleManager(
        this.mainConsoleElement,
        this.mainConsoleInputElement,
        window.APP // Assuming APP is available globally
      );
      this.registerConsoleCommands();
      console.log(
        '[GameUI] ConsoleManager initialized and commands registered.'
      );
    } else {
      console.warn('[GameUI] activateConsole prerequisites not met:', {
        hasConsoleManager: !!window.ConsoleManager,
        hasConsoleElement: !!this.mainConsoleElement,
        hasInputElement: !!this.mainConsoleInputElement,
      });
    }
  }

  // Creates the main DOM structure for the files panel
  getFilesPanelRootElement() {
    const element = document.createElement('div');
    element.classList.add('files-panel-container', 'panel-container');
    element.style.display = 'flex';
    element.style.flexDirection = 'column';
    element.style.height = '100%';
    element.style.overflow = 'hidden';

    element.innerHTML = `
      <div class="control-group file-controls" style="padding: 0.5rem; border-bottom: 1px solid #666; flex-shrink: 0;">
            <label>
              <input
                type="radio"
                name="file-view-mode"
                value="presets"
                checked
              />
              Presets
            </label>
            <label>
              <input type="radio" name="file-view-mode" value="test-cases" />
              Test Cases
            </label>
            <label>
              <input
                type="radio"
                name="file-view-mode"
                value="test-playthroughs"
              />
              Test Playthroughs
            </label>
       </div>
       <div id="files-panel-content" style="flex-grow: 1; overflow-y: auto;">
          <div id="test-cases-panel" style="height: 100%;">
            <div id="test-cases-list"></div>
          </div>
          <div id="presets-panel" style="display: none; height: 100%;">
            <div id="presets-list"></div>
          </div>
          <div id="test-playthroughs-panel" style="display: none; height: 100%;">
            <!-- Populated by testPlaythroughUI.js -->
          </div>
       </div>
    `;
    return element;
  }

  // Attaches listeners and sets up content for the files panel
  initializeFilesPanelElements(containerElement) {
    // Get the underlying DOM element
    const rootElement = containerElement[0];
    if (!rootElement) {
      console.error('Could not get DOM element from filesPanel container');
      return;
    }

    // Store the reference to the live DOM container
    this.filesPanelContainer = rootElement;

    // Use the DOM element for querySelectorAll
    const fileViewRadios = rootElement.querySelectorAll(
      'input[name="file-view-mode"]'
    );
    fileViewRadios.forEach((radio) => {
      // Clear existing listeners before adding new ones
      radio.removeEventListener('change', this._handleFileViewChange);
      radio.addEventListener('change', this._handleFileViewChange.bind(this));
    });

    // Initial render of the default file view
    this.updateFileViewDisplay();
  }

  // Helper handler for file view change
  _handleFileViewChange(e) {
    if (e.target.checked) {
      this.setFileViewMode(e.target.value);
    }
  }
}
