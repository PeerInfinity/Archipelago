// gameUI.js

import { LocationUI } from './locationUI.js';
import { RegionUI } from './regionUI.js';
import { InventoryUI } from './inventoryUI.js';
import stateManager from './stateManagerSingleton.js';
import { TestCaseUI } from './testCaseUI.js';

export class GameUI {
  constructor() {
    // UI Managers
    this.locationUI = new LocationUI(this);
    this.regionUI = new RegionUI(this);
    this.inventoryUI = new InventoryUI(this);
    this.testCaseUI = new TestCaseUI(this);

    // Register with stateManager for UI updates
    stateManager.registerUICallback('gameUI', (eventType) => {
      if (eventType === 'inventoryChanged') {
        this.inventoryUI?.syncWithState();
      } else if (eventType === 'reachableRegionsComputed') {
        this.locationUI?.syncWithState();
        this.regionUI?.update();
      }
    });

    // Game state
    this.currentViewMode = 'locations';
    this.debugMode = false;
    this.regions = {};
    this.mode = null;
    this.settings = null;
    this.startRegions = null;
    this.currentRules = null; // Track current rules data

    // Initialize UI
    this.attachEventListeners();
    if (window.consoleManager) {
      this.registerConsoleCommands();
    }
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
    // Store complete data
    this.regions = jsonData.regions['1'];
    this.mode = jsonData.mode?.['1'];
    this.settings = jsonData.settings?.['1'];
    this.startRegions = jsonData.start_regions?.['1'];

    const player1Items = jsonData.items['1'];
    const groups = jsonData.item_groups['1'];

    // Initialize view-specific UIs
    this.inventoryUI.initialize(player1Items, groups);
    this.locationUI.initialize(jsonData);
    this.regionUI.initialize(jsonData.regions['1']);
  }

  attachEventListeners() {
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
  }

  clearExistingData() {
    stateManager.clearInventory();

    // Clear UI elements
    this.inventoryUI.clear();
    this.locationUI.clear();
    this.regionUI.clear();
  }

  updateViewDisplay() {
    const locationsContainer = document.getElementById('locations-grid');
    const regionsContainer = document.getElementById('regions-panel');
    const testCasesContainer = document.getElementById('test-cases-panel');

    if (!locationsContainer || !regionsContainer || !testCasesContainer) {
      console.warn('Missing container elements for toggling views.');
      return;
    }

    // Toggle view containers
    locationsContainer.style.display = 'none';
    regionsContainer.style.display = 'none';
    testCasesContainer.style.display = 'none';

    switch (this.currentViewMode) {
      case 'locations':
        locationsContainer.style.display = 'grid';
        document.querySelector('.location-controls').style.display = 'flex';
        document.querySelector('.region-controls').style.display = 'none';
        this.locationUI.update();
        break;
      case 'regions':
        regionsContainer.style.display = 'block';
        document.querySelector('.location-controls').style.display = 'none';
        document.querySelector('.region-controls').style.display = 'flex';
        this.regionUI.update();
        break;
      case 'test-cases':
        testCasesContainer.style.display = 'block';
        document.querySelector('.location-controls').style.display = 'none';
        document.querySelector('.region-controls').style.display = 'none';
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

      this.initializeUI(jsonData);

      if (window.consoleManager) {
        window.consoleManager.print(
          'Successfully loaded default rules',
          'success'
        );
      }
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

          this.initializeUI(jsonData);

          if (window.consoleManager) {
            window.consoleManager.print(
              'Successfully loaded game data',
              'success'
            );
          }
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
}

// Initialize and expose to window for event handlers
window.gameUI = new GameUI();

export default GameUI;
