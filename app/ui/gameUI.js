// gameUI.js - Updated to work directly with console client

import stateManager from '../core/stateManagerSingleton.js';
import { LocationUI } from './locationUI.js';
import { ExitUI } from './exitUI.js';
import { RegionUI } from './regionUI.js';
import { InventoryUI } from './inventoryUI.js';
import { TestCaseUI } from './testCaseUI.js';
import { LoopUI } from './loopUI.js';
import commonUI from './commonUI.js';
import { PresetUI } from './presetUI.js';
import connection from '../../client/core/connection.js';
import messageHandler from '../../client/core/messageHandler.js';
import eventBus from '../../app/core/eventBus.js';

export class GameUI {
  constructor() {
    // UI Managers
    this.locationUI = new LocationUI(this);
    this.exitUI = new ExitUI(this);
    this.regionUI = new RegionUI(this);
    this.inventoryUI = new InventoryUI(this);
    this.testCaseUI = new TestCaseUI(this);
    this.presetUI = new PresetUI(this);
    this.loopUI = new LoopUI(this);
    this.currentFileView = 'test-cases'; // Track which file view is active

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
    this.updateViewDisplay();

    // Initialize test case UI - fix for synchronous method
    try {
      const success = this.testCaseUI.initialize();
      if (!success) {
        console.error('Failed to initialize test cases');
      }
    } catch (error) {
      console.error('Failed to initialize test cases:', error);
    }
  }

  initializeUI(jsonData) {
    // Don't store duplicate data locally - stateManager should be the single source of truth
    const player1Items = jsonData.items['1'];
    const groups = jsonData.item_groups['1'];

    // Initialize view-specific UIs
    // Pass the items data for display purposes, but use stateManager for game state
    this.inventoryUI.initialize(player1Items, groups);

    // Have UI components get data from stateManager instead of passing jsonData
    this.locationUI.initialize();
    this.exitUI.initialize();
    this.regionUI.initialize();
    this.loopUI.initialize();
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

    // View toggle radio buttons
    document.querySelectorAll('input[name="view-mode"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.setViewMode(e.target.value);
        }
      });
    });

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
    stateManager.clearInventory();

    // Clear UI elements
    this.inventoryUI.clear();
    this.locationUI.clear();
    this.exitUI.clear();
    this.regionUI.clear();
  }

  updateViewDisplay() {
    const locationsContainer = document.getElementById('locations-grid');
    const exitsContainer = document.getElementById('exits-grid');
    const regionsContainer = document.getElementById('regions-panel');
    const loopPanel = document.getElementById('loop-panel');
    const filesPanel = document.getElementById('files-panel');

    if (!locationsContainer || !exitsContainer || !regionsContainer || !loopPanel || !filesPanel) {
      console.warn('Missing container elements for toggling views.');
      return;
    }

    // Toggle view containers
    locationsContainer.style.display = 'none';
    exitsContainer.style.display = 'none';
    regionsContainer.style.display = 'none';
    loopPanel.style.display = 'none';
    filesPanel.style.display = 'none';

    // Toggle control containers
    document.querySelector('.location-controls').style.display = 'none';
    document.querySelector('.exit-controls').style.display = 'none';
    document.querySelector('.region-controls').style.display = 'none';
    document.querySelector('.loop-controls').style.display = 'none';
    document.querySelector('.file-controls').style.display = 'none';

    switch (this.currentViewMode) {
      case 'locations':
        locationsContainer.style.display = 'grid';
        document.querySelector('.location-controls').style.display = 'flex';
        this.locationUI.update();
        break;
      case 'exits':
        exitsContainer.style.display = 'grid';
        document.querySelector('.exit-controls').style.display = 'flex';
        this.exitUI.update();
        break;
      case 'regions':
        regionsContainer.style.display = 'block';
        document.querySelector('.region-controls').style.display = 'flex';
        this.regionUI.update();
        break;
      case 'loop':
        loopPanel.style.display = 'block';
        document.querySelector('.loop-controls').style.display = 'flex';
        this.loopUI.renderLoopPanel();
        break;
      case 'files':
        filesPanel.style.display = 'block';
        document.querySelector('.file-controls').style.display = 'flex';
        this.updateFileViewDisplay();
        break;
    }
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

      this.clearExistingData();
      this.currentRules = jsonData; // Store current rules

      stateManager.initializeInventory(
        [], // Initial items
        jsonData.progression_mapping['1'],
        jsonData.items['1']
      );

      // Load the complete rules data into the state manager
      // This ensures settings are properly loaded into the state
      stateManager.loadFromJSON(jsonData);

      this.initializeUI(jsonData);

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
          this.currentRules = jsonData; // Store current rules

          stateManager.initializeInventory(
            [],
            jsonData.progression_mapping['1'],
            jsonData.items['1']
          );

          // Load the complete rules data into the state manager
          // This ensures settings are properly loaded into the state
          stateManager.loadFromJSON(jsonData);

          this.initializeUI(jsonData);

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

  setViewMode(mode) {
    this.currentViewMode = mode;
    this.updateViewDisplay();
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
    const testCasesPanel = document.getElementById('test-cases-panel');
    const presetsPanel = document.getElementById('presets-panel');

    if (!testCasesPanel || !presetsPanel) {
      console.warn('Missing file view containers.');
      return;
    }

    // Toggle between test cases and presets
    testCasesPanel.style.display =
      this.currentFileView === 'test-cases' ? 'block' : 'none';
    presetsPanel.style.display =
      this.currentFileView === 'presets' ? 'block' : 'none';

    // Initialize the appropriate UI if needed
    if (this.currentFileView === 'test-cases') {
      if (!this.testCaseUI.testCases && !this.testCaseUI.availableTestSets) {
        this.testCaseUI.initialize();
      }
    } else if (this.currentFileView === 'presets') {
      if (!this.presetUI.presets) {
        this.presetUI.initialize();
      }
    }
  }
}
