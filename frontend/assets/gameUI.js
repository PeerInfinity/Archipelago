// gameUI.js

import { LocationUI } from './locationUI.js';
import { RegionUI } from './regionUI.js';
import stateManager from './stateManagerSingleton.js';

export class GameUI {
  constructor() {
    // UI Managers
    this.locationUI = new LocationUI(this);
    this.regionUI = new RegionUI(this);

    // Game state
    this.currentViewMode = 'locations';
    this.debugMode = false;
    this.itemData = null;
    this.regions = {};
    this.mode = null;
    this.settings = null;
    this.startRegions = null;

    // Initialize UI
    this.attachEventListeners();
    if (window.consoleManager) {
      this.registerConsoleCommands();
    }
    this.loadDefaultRules();
    this.updateViewDisplay();
  }

  initializeUI(jsonData) {
    // Store complete data
    this.regions = jsonData.regions['1'];
    this.mode = jsonData.mode?.['1'];
    this.settings = jsonData.settings?.['1'];
    this.startRegions = jsonData.start_regions?.['1'];

    const player1Items = jsonData.items['1'];
    const groups = jsonData.item_groups['1'];
    this.itemData = player1Items;

    // Initialize inventory UI
    this.initializeInventoryUI(player1Items, groups);

    // Initialize view-specific UIs
    this.locationUI.initialize(jsonData);
    this.regionUI.initialize(jsonData.regions['1']);
  }

  initializeInventoryUI(itemData, groups) {
    const inventoryContainer = document.getElementById('inventory-groups');
    inventoryContainer.innerHTML = '';

    groups.sort();

    groups.forEach((group) => {
      const groupItems = Object.entries(itemData)
        .filter(([_, data]) => data.groups.includes(group))
        .sort(([a], [b]) => a.localeCompare(b));

      const groupDiv = document.createElement('div');
      groupDiv.className = 'inventory-group';
      groupDiv.innerHTML = `
                <h3>${group}</h3>
                <div class="inventory-items">
                    ${groupItems
                      .map(
                        ([name, data]) => `
                        <div class="item-container">
                            <button 
                                class="item-button" 
                                data-item="${name}"
                                title="${name}"
                                data-advancement="${data.advancement}"
                                data-priority="${data.priority}"
                                data-useful="${data.useful}"
                            >
                                ${name}
                            </button>
                        </div>
                    `
                      )
                      .join('')}
                </div>
            `;
      inventoryContainer.appendChild(groupDiv);
    });

    this.attachItemEventListeners();
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

  attachItemEventListeners() {
    document.querySelectorAll('.item-button').forEach((button) => {
      button.addEventListener('click', () => {
        const itemName = button.dataset.item;
        this.toggleItem(itemName);
      });
    });
  }

  toggleItem(itemName) {
    if (!this.itemData || !this.itemData[itemName]) return;

    const currentCount = stateManager.getItemCount(itemName);

    const buttons = document.querySelectorAll(`[data-item="${itemName}"]`);
    const containers = Array.from(buttons).map((button) =>
      button.closest('.item-container')
    );

    stateManager.addItemToInventory(itemName);

    buttons.forEach((button) => button.classList.add('active'));

    containers.forEach((container) => {
      let countBadge = container.querySelector('.count-badge');
      if (!countBadge) {
        countBadge = document.createElement('div');
        countBadge.className = 'count-badge';
        container.appendChild(countBadge);
      }

      if (currentCount + 1 > 1) {
        countBadge.textContent = currentCount + 1;
        countBadge.style.display = 'flex';
      } else {
        countBadge.style.display = 'none';
      }
    });

    if (window.consoleManager) {
      window.consoleManager.print(
        `${itemName} count: ${currentCount + 1}`,
        'info'
      );
    }

    locationManager.invalidateCache(); // Invalidate cache when an item is added
    this.updateViewDisplay();
  }

  async loadDefaultRules() {
    try {
      const response = await fetch('./default_rules.json');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const jsonData = await response.json();

      this.clearExistingData();

      stateManager.initializeInventory(
        [], // Initial items
        [], // Excluded items
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

  setViewMode(mode) {
    this.currentViewMode = mode;
    this.updateViewDisplay();
  }

  clearExistingData() {
    stateManager.clearInventory();

    // Clear UI elements
    document.querySelectorAll('.item-button').forEach((button) => {
      button.classList.remove('active');
      const countBadge = button
        .closest('.item-container')
        ?.querySelector('.count-badge');
      if (countBadge) {
        countBadge.style.display = 'none';
      }
    });

    // Clear UI containers
    ['inventory-groups', 'locations-grid', 'regions-panel'].forEach((id) => {
      const container = document.getElementById(id);
      if (container) container.innerHTML = '';
    });

    // Clear view-specific data
    this.locationUI.clear();
    this.regionUI.clear();
  }

  updateViewDisplay() {
    const locationsContainer = document.getElementById('locations-grid');
    const regionsContainer = document.getElementById('regions-panel');

    if (!locationsContainer || !regionsContainer) {
      console.warn('Missing container elements for toggling views.');
      return;
    }

    // Toggle view containers
    if (this.currentViewMode === 'locations') {
      locationsContainer.style.display = 'grid';
      regionsContainer.style.display = 'none';

      // Show location controls, hide region controls
      document.querySelector('.location-controls').style.display = 'flex';
      document.querySelector('.region-controls').style.display = 'none';

      this.locationUI.update();
    } else {
      locationsContainer.style.display = 'none';
      regionsContainer.style.display = 'block';

      // Show region controls, hide location controls
      document.querySelector('.location-controls').style.display = 'none';
      document.querySelector('.region-controls').style.display = 'flex';

      this.regionUI.update();
    }
  }

  async handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      this.clearExistingData();

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const jsonData = JSON.parse(e.target.result);

          stateManager.initializeInventory(
            [],
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

  registerConsoleCommands() {
    const commands = {
      item: {
        description: 'Toggle an item in your inventory',
        usage: 'item <name>',
        handler: (args) => {
          const itemName = args.join(' ');
          if (this.itemData && this.itemData[itemName]) {
            this.toggleItem(itemName);
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
          if (!this.itemData) return 'No items loaded';
          return Object.entries(this.itemData)
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
