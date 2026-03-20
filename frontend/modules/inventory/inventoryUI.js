import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import connection from '../client/core/connection.js';
import messageHandler from '../client/core/messageHandler.js';
import { getDispatcher, getModuleEventBus } from './index.js';


// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('inventoryUI', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[inventoryUI] ${message}`, ...data);
  }
}

export class InventoryUI {
  // Add constants for special groups
  static SPECIAL_GROUPS = {
    EVENTS: 'Events',
  };

  constructor(container, componentState) {
    this.container = container;
    this.componentState = componentState;
    Object.defineProperty(this, 'eventBus', { get: () => getModuleEventBus(), configurable: true });
    this.itemData = null;
    this.groupNames = [];
    this.showUnowned = false;
    this.showCategories = false;
    this.sortAlphabetically = false;
    this.rootElement = null;
    this.groupedContainer = null;
    this.flatContainer = null;
    this.unsubscribeHandles = [];
    this.isInitialized = false;
    this.showName = true; // Cache showName setting
    this.showLabel1 = false; // Cache showLabel1 setting
    this.showLabel2 = false; // Cache showLabel2 setting

    this._createBaseUI();

    const readyHandler = async (eventPayload) => {
      log('info', 
        '[InventoryUI app:readyForUiDataLoad] Received. Setting up base UI and event listeners.'
      );
      this.attachEventBusListeners();
      this.dispatcher = getDispatcher(); // Get dispatcher here
      this.isInitialized = true;
      log('info', 
        '[InventoryUI app:readyForUiDataLoad] Base setup complete. Awaiting StateManager readiness.'
      );
      this.eventBus.unsubscribe('app:readyForUiDataLoad', readyHandler);
    };
    this.eventBus.subscribe('app:readyForUiDataLoad', readyHandler);

    // If the app is already initialized (e.g., this panel was created after a layout reload
    // via goldenLayoutInstance.loadLayout()), app:readyForUiDataLoad will never fire again.
    // In that case, initialize immediately with existing static data.
    const existingStaticData = stateManager.getStaticData();
    if (existingStaticData?.items && existingStaticData?.groups) {
      this.attachEventBusListeners();
      this.dispatcher = getDispatcher();
      this.isInitialized = true;
      this.eventBus.unsubscribe('app:readyForUiDataLoad', readyHandler);
      this.itemData = existingStaticData.items;
      this.groupNames = Array.isArray(existingStaticData.groups)
        ? existingStaticData.groups
        : Object.keys(existingStaticData.groups || {});
      this.initializeUI(this.itemData, this.groupNames);
      this.updateDisplay();
    }

    this.container.on('destroy', () => {
      this.destroy();
    });
  }

  _createBaseUI() {
    this.rootElement = this.createRootElement();
    this.groupedContainer = this.rootElement.querySelector('#inventory-groups');
    this.flatContainer = this.rootElement.querySelector('#inventory-flat');
    this.attachControlEventListeners();
    this.container.element.appendChild(this.rootElement);
  }

  createRootElement() {
    const element = document.createElement('div');
    element.classList.add('inventory-panel-container', 'panel-container');
    element.style.display = 'flex';
    element.style.flexDirection = 'column';
    element.style.height = '100%';
    element.style.overflow = 'hidden';

    element.innerHTML = `
        <div class="inventory-header" style="flex-shrink: 0;">
          <h2>Inventory</h2>
          <!-- Expand button might need separate logic if needed outside GL -->
        </div>
        <div class="inventory-controls" style="flex-shrink: 0;">
          <div class="checkbox-container">
            <input type="checkbox" id="show-unowned" />
            <label for="show-unowned">Show unowned items</label>
          </div>
          <div class="checkbox-container">
            <input type="checkbox" id="show-categories" />
            <label for="show-categories">Show categories</label>
          </div>
          <div class="checkbox-container">
            <input type="checkbox" id="sort-alphabetically" />
            <label for="sort-alphabetically">Sort alphabetically</label>
          </div>
        </div>
        <div id="inventory-groups" class="inventory-content" style="flex-grow: 1; overflow-y: auto;">
          <!-- Populated by JS -->
        </div>
        <div id="inventory-flat" class="inventory-content" style="display: none; flex-grow: 1; overflow-y: auto;">
          <!-- Populated by JS -->
        </div>
        `;
    return element;
  }

  getRootElement() {
    return this.rootElement;
  }

  initializeUI(itemData, groupNames) {
    this.itemData = itemData || {};
    this.groupNames = Array.isArray(groupNames) ? groupNames : [];

    if (!this.rootElement) {
      log('warn', 
        '[InventoryUI] initializeUI called before rootElement is ready.'
      );
      return;
    }

    const groupedContainer = this.groupedContainer;
    const flatContainer = this.flatContainer;
    groupedContainer.innerHTML = '';
    flatContainer.innerHTML = '';
    const flatGroup = document.createElement('div');
    flatGroup.className = 'inventory-group';
    const flatItems = document.createElement('div');
    flatItems.className = 'inventory-items';
    flatGroup.appendChild(flatItems);
    flatContainer.appendChild(flatGroup);

    const sortedGroupNames = [...this.groupNames].sort((a, b) => {
      // "Everything" category should always appear first
      if (a === 'Everything') return -1;
      if (b === 'Everything') return 1;
      return a.localeCompare(b);
    });

    sortedGroupNames.forEach((groupName) => {
      // Skip "Everything" in the grouped view — the flat view already serves this purpose
      if (groupName === 'Everything') return;

      const groupItems = Object.entries(this.itemData).filter(
        ([_, data]) =>
          data.groups && data.groups.includes(groupName) && !data.event
      );

      if (this.sortAlphabetically) {
        groupItems.sort(([a], [b]) => a.localeCompare(b));
      }

      if (groupItems.length > 0) {
        this.createGroupDiv(groupedContainer, groupName, groupItems);
      }
    });

    const eventItems = Object.entries(this.itemData).filter(
      ([_, data]) => data.event
    );

    if (this.sortAlphabetically) {
      eventItems.sort(([a], [b]) => a.localeCompare(b));
    }

    if (eventItems.length > 0) {
      this.createGroupDiv(
        groupedContainer,
        InventoryUI.SPECIAL_GROUPS.EVENTS,
        eventItems
      );
    }

    const addedToFlat = new Set();
    let flatItemsList = Object.entries(this.itemData);
    if (this.sortAlphabetically) {
      flatItemsList.sort(([a], [b]) => a.localeCompare(b));
    }
    flatItemsList.forEach(([name, _]) => {
      if (!addedToFlat.has(name)) {
        this.createItemDiv(flatItems, name);
        addedToFlat.add(name);
      }
    });

    this.attachItemEventListeners();
    this.updateDisplay();
  }

  createItemDiv(container, name) {
    const itemContainer = document.createElement('div');
    itemContainer.className = 'item-container';

    // Get item data for label1 and label2
    const itemData = this.itemData[name] || name;

    // Get display elements
    const displayElements = this.getItemDisplayElements(itemData);

    // Create the button HTML with display text
    const displayText = displayElements.map(el => el.text).join('<br>');

    itemContainer.innerHTML = `
      <button
        class="item-button"
        data-item="${name}"
        title="${name}${itemData.label1 ? '\nLabel: ' + itemData.label1 : ''}${itemData.label2 ? '\nExpression: ' + itemData.label2 : ''}"
      >
        ${displayText}
      </button>
    `;
    container.appendChild(itemContainer);
  }

  updateDisplay() {
    if (!this.rootElement || !this.itemData) {
      log('warn', 
        '[InventoryUI updateDisplay] Called before initialization or itemData is missing.'
      );
      return;
    }

    const snapshotData = stateManager.getLatestStateSnapshot();
    const inventoryCounts = snapshotData?.inventory || {};

    Object.keys(this.itemData).forEach((itemName) => {
      const count = inventoryCounts[itemName] || 0;
      const itemElements = this.rootElement.querySelectorAll(
        `.item-button[data-item="${itemName}"]`
      );
      itemElements.forEach((itemElement) => {
        itemElement.classList.toggle('active', count > 0);
        const container = itemElement.closest('.item-container');
        this.createOrUpdateCountBadge(container, count);
      });
    });

    const groupedContainer = this.groupedContainer;
    const flatContainer = this.flatContainer;

    if (this.showCategories) {
      flatContainer.style.display = 'none';
      groupedContainer.style.display = '';
      this.updateVisibility(groupedContainer);
    } else {
      groupedContainer.style.display = 'none';
      flatContainer.style.display = '';
      this.updateVisibility(flatContainer);
    }
  }

  updateVisibility(container) {
    const groups = container.querySelectorAll('.inventory-group');
    groups.forEach((group) => {
      const items = group.querySelectorAll('.item-container');
      let visibleItems = 0;

      items.forEach((itemContainer) => {
        const button = itemContainer.querySelector('.item-button');
        if (!button) return;
        const isOwned = button.classList.contains('active');

        if (!this.showUnowned && !isOwned) {
          itemContainer.style.display = 'none';
        } else {
          itemContainer.style.display = '';
          visibleItems++;
        }
      });

      if (this.showCategories) {
        group.style.display = visibleItems > 0 ? '' : 'none';
      }
    });
  }

  createGroupDiv(container, groupName, items) {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'inventory-group';
    groupDiv.innerHTML = `<h3>${groupName}</h3>`;

    const itemsDiv = document.createElement('div');
    itemsDiv.className = 'inventory-items';

    items.forEach(([name, _]) => {
      this.createItemDiv(itemsDiv, name);
    });

    groupDiv.appendChild(itemsDiv);
    container.appendChild(groupDiv);
  }

  attachItemEventListeners() {
    this.rootElement.querySelectorAll('.item-button').forEach((button) => {
      button.addEventListener('click', (event) => {
        const itemName = button.dataset.item;
        this.handleItemClick(itemName, event.shiftKey);
      });
    });
  }

  handleItemClick(itemName, isShiftPressed = false) {
    if (!itemName) {
      log('warn', '[InventoryUI] handleItemClick called with invalid itemName');
      return;
    }

    if (!this.dispatcher) {
      log('error', '[InventoryUI] Dispatcher not available in handleItemClick. Cannot send item check request.');
      return;
    }

    log('info', `[InventoryUI] Clicked on item: ${itemName}, Shift pressed: ${isShiftPressed}`);

    // Create event payload similar to location click
    const payload = {
      itemName: itemName,
      isShiftPressed: isShiftPressed,
      originator: 'InventoryItemClick',
      originalDOMEvent: true,
    };

    // Send event through dispatcher system starting from bottom (same as location clicks)
    this.dispatcher.publish('user:itemCheck', payload, {
      initialTarget: 'bottom',
    });

    log('info', `[InventoryUI] Published user:itemCheck event for item: ${itemName}`);
  }

  attachControlEventListeners() {
    const showUnownedCheckbox = this.rootElement.querySelector('#show-unowned');
    const showCategoriesCheckbox =
      this.rootElement.querySelector('#show-categories');
    const sortAlphabeticallyCheckbox = this.rootElement.querySelector(
      '#sort-alphabetically'
    );

    showUnownedCheckbox.addEventListener('change', (event) => {
      this.showUnowned = event.target.checked;
      this.updateDisplay();
    });

    showCategoriesCheckbox.addEventListener('change', (event) => {
      this.showCategories = event.target.checked;
      this.updateDisplay();
    });

    sortAlphabeticallyCheckbox.addEventListener('change', (event) => {
      this.sortAlphabetically = event.target.checked;
      if (this.itemData && this.groupNames) {
        this.initializeUI(this.itemData, this.groupNames);
      } else {
        log('warn', 
          '[InventoryUI] Cannot re-sort: State or rules not available.'
        );
      }
    });
  }

  async loadDisplaySettings() {
    try {
      const settingsManager = await import('../../app/core/settingsManager.js').then(m => m.default);
      this.showName = await settingsManager.getSetting('moduleSettings.inventory.showName', true);
      this.showLabel1 = await settingsManager.getSetting('moduleSettings.inventory.showLabel1', false);
      this.showLabel2 = await settingsManager.getSetting('moduleSettings.inventory.showLabel2', false);
      this.useSubstitutedNames = await settingsManager.getSetting('generalSettings.useSubstitutedNames', true);
      log('debug', `[InventoryUI] Loaded display settings: showName=${this.showName}, showLabel1=${this.showLabel1}, showLabel2=${this.showLabel2}, useSubstitutedNames=${this.useSubstitutedNames}`);
    } catch (error) {
      log('error', '[InventoryUI] Failed to load display settings:', error);
      this.showName = true;
      this.showLabel1 = false;
      this.showLabel2 = false;
      this.useSubstitutedNames = true;
    }
  }

  getItemDisplayElements(itemData) {
    // Build array of display elements based on enabled settings
    const elements = [];

    const rawName = typeof itemData === 'string' ? itemData : (itemData.name || itemData);
    const name = (this.useSubstitutedNames && itemData && itemData.displayName) ? itemData.displayName : rawName;

    if (this.showName && name) {
      elements.push({ type: 'name', text: name });
    }

    if (this.showLabel1 && itemData && itemData.label1) {
      elements.push({ type: 'label1', text: itemData.label1 });
    }

    if (this.showLabel2 && itemData && itemData.label2) {
      elements.push({ type: 'label2', text: itemData.label2 });
    }

    // If nothing is enabled or no data available, default to name
    if (elements.length === 0) {
      elements.push({ type: 'name', text: name || 'Unknown' });
    }

    return elements;
  }

  attachEventBusListeners() {
    this.destroy();

    // Load display settings
    this.loadDisplaySettings();

    const subscribe = (eventName, handler) => {
      log('info', `[InventoryUI] Subscribing to ${eventName}`);
      const unsubscribe = this.eventBus.subscribe(eventName, handler.bind(this));
      this.unsubscribeHandles.push(unsubscribe);
    };

    const handleReady = async () => {
      log('info', '[InventoryUI] Received stateManager:ready event.');
      if (!this.isInitialized) {
        log('warn', 
          '[InventoryUI stateManager:ready] Panel base not yet initialized by app:readyForUiDataLoad. This is unexpected.'
        );
      }

      if (!this.itemData || !this.groupNames || this.groupNames.length === 0) {
        log('warn', 
          '[InventoryUI stateManager:ready] Item/group data not available. Attempting to fetch/initialize now as a fallback.'
        );
        const staticData = stateManager.getStaticData();
        if (staticData && staticData.items && staticData.groups) {
          this.itemData = staticData.items;
          this.groupNames = Array.isArray(staticData.groups)
            ? staticData.groups
            : Object.keys(staticData.groups || {});

          if (this.itemData && this.groupNames) {
            this.initializeUI(this.itemData, this.groupNames);
            log('info', 
              '[InventoryUI stateManager:ready] Fallback static data fetch and initializeUI complete.'
            );
          } else {
            log('error', 
              '[InventoryUI stateManager:ready] Fallback fetch for static data failed. Inventory may not display correctly.'
            );
            this.displayError('Failed to load inventory structure.');
            return;
          }
        } else {
          log('error', 
            '[InventoryUI stateManager:ready] Static data not available from proxy for fallback. Inventory may not display correctly.'
          );
          this.displayError('Inventory structure data missing.');
          return;
        }
      }

      log('info', 
        '[InventoryUI stateManager:ready] Triggering initial full display update.'
      );
      this.updateDisplay();
    };
    subscribe('stateManager:ready', handleReady);

    subscribe('stateManager:snapshotUpdated', this._handleSnapshotUpdated);
    subscribe('stateManager:inventoryChanged', this._handleInventoryChanged);
    subscribe('stateManager:rulesLoaded', this._handleRulesLoaded);

    // Subscribe to settings changes
    subscribe('settings:changed', async ({ key, value }) => {
      if (key === '*' || key.startsWith('moduleSettings.inventory.showName') ||
          key.startsWith('moduleSettings.inventory.showLabel1') ||
          key.startsWith('moduleSettings.inventory.showLabel2') ||
          key.startsWith('generalSettings.useSubstitutedNames')) {
        log('info', `[InventoryUI] Display settings changed (${key}), reloading...`);
        await this.loadDisplaySettings();
        // Re-render the inventory with new display settings
        if (this.itemData && this.groupNames) {
          this.initializeUI(this.itemData, this.groupNames);
        }
      }
    });

    subscribe('loop:modeChanged', (isLoopMode) => {
      if (this.isInitialized && this.itemData) this.updateDisplay();
    });

    log('info', '[InventoryUI] EventBus listeners attached.');
  }

  _handleSnapshotUpdated(snapshotData) {
    if (this.isInitialized && this.itemData) {
      if (snapshotData) {
        this.updateDisplay();
      } else {
        log('warn',
          '[InventoryUI] snapshotUpdated event received null snapshotData?'
        );
      }
    }
  }

  _handleInventoryChanged() {
    log('info',
      '[InventoryUI] stateManager:inventoryChanged received. Triggering display update.'
    );
    if (this.isInitialized && this.itemData) {
      this.updateDisplay();
    }
  }

  async _handleRulesLoaded(eventData) {
    log('info', 
      '[InventoryUI] Received stateManager:rulesLoaded event. Fetching static item/group data and initializing UI structure.'
    );
    if (!this.isInitialized) {
      log('warn', 
        '[InventoryUI rulesLoaded] Panel not yet initialized by app:readyForUiDataLoad. Static data might not be processed correctly if base UI setup is missing.'
      );
      return;
    }

    try {
      const staticData = stateManager.getStaticData();
      if (staticData && staticData.items && staticData.groups) {
        this.itemData = staticData.items;
        this.groupNames = Array.isArray(staticData.groups)
          ? staticData.groups
          : Object.keys(staticData.groups || {});

        log('info', 
          `[InventoryUI rulesLoaded] Successfully loaded items and group names from static data cache. Item count: ${
            Object.keys(this.itemData || {}).length
          }, Group count: ${this.groupNames.length}`
        );

        this.initializeUI(this.itemData, this.groupNames);
        log('info', 
          '[InventoryUI rulesLoaded] UI structure initialized with static data.'
        );
      } else {
        log('error', 
          '[InventoryUI rulesLoaded] Static item or group data missing from StateManager. Cannot initialize inventory structure.'
        );
        this.displayError('Failed to load inventory item definitions.');
        this.itemData = null;
        this.groupNames = [];
      }
    } catch (error) {
      log('error', 
        '[InventoryUI rulesLoaded] Error processing static data:',
        error
      );
      this.displayError('Error initializing inventory structure.');
      this.itemData = null;
      this.groupNames = [];
    }
  }

  destroy() {
    log('info', '[InventoryUI] Destroying listeners...');
    this.unsubscribeHandles.forEach((unsubscribe) => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
    this.unsubscribeHandles = [];
    log('info', '[InventoryUI] Listeners destroyed.');
  }

  createOrUpdateCountBadge(container, count) {
    if (!container) return;

    let countBadge = container.querySelector('.count-badge');
    if (!countBadge) {
      countBadge = document.createElement('div');
      countBadge.className = 'count-badge';
      container.appendChild(countBadge);
    }

    if (count > 1) {
      countBadge.textContent = count;
      countBadge.style.display = 'flex';
    } else {
      countBadge.style.display = 'none';
    }
  }

  modifyItemCount(itemName, isShiftPressed = false) {
    if (!stateManager) {
      log('error', 
        '[InventoryUI] StateManager proxy not available for modifyItemCount'
      );
      return;
    }
    if (isShiftPressed) {
      log('warn', 
        '[InventoryUI] Shift-click (remove item) not yet implemented via worker command.'
      );
    } else {
      stateManager.addItemToInventory(itemName);
    }
  }

  clear() {
    this.itemData = null;
    this.groupNames = [];
    if (this.groupedContainer) this.groupedContainer.innerHTML = '';
    if (this.flatContainer) this.flatContainer.innerHTML = '';
  }

  initialize() {}

  async syncWithState() {
    log('info', 
      '[InventoryUI syncWithState] Called. Note: Primary init relies on event flow.'
    );

    const staticData = stateManager.getStaticData();
    let itemDataChanged = false;

    if (staticData && staticData.items) {
      if (
        !this.itemData ||
        Object.keys(this.itemData).length !==
          Object.keys(staticData.items).length
      ) {
        this.itemData = staticData.items;
        itemDataChanged = true;
        log('info', '[InventoryUI syncWithState] Updated this.itemData.');
      }
    } else {
      log('warn', 
        '[InventoryUI syncWithState] Static item data not available from StateManager.'
      );
    }

    if (staticData && staticData.groups) {
      const newGroupNames = Array.isArray(staticData.groups)
        ? staticData.groups
        : Object.keys(staticData.groups || {});
      if (
        !this.groupNames ||
        this.groupNames.length !== newGroupNames.length ||
        !this.groupNames.every((g, i) => g === newGroupNames[i])
      ) {
        this.groupNames = newGroupNames;
        itemDataChanged = true;
        log('info', '[InventoryUI syncWithState] Updated this.groupNames.');
      }
    } else {
      log('warn', 
        '[InventoryUI syncWithState] Static group data not available from StateManager.'
      );
    }

    if (itemDataChanged) {
      log('info', 
        '[InventoryUI syncWithState] Item or group structure changed, re-initializing UI structure.'
      );
      this.initializeUI(this.itemData, this.groupNames);
    }

    this.updateDisplay();
    log('info', '[InventoryUI syncWithState] UpdateDisplay called at the end.');
  }

  displayError(message) {
    if (this.rootElement) {
      let errorContainer = this.rootElement.querySelector(
        '.inventory-error-message'
      );
      if (!errorContainer) {
        errorContainer = document.createElement('div');
        errorContainer.className =
          'inventory-error-message panel-error-message';
        this.rootElement.prepend(errorContainer);
      }
      errorContainer.textContent = message;
      const grid = this.rootElement.querySelector('#inventory-grid');
      if (grid) grid.style.display = 'none';
    }
  }
}
