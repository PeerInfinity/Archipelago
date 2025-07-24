import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import connection from '../client/core/connection.js';
import messageHandler from '../client/core/messageHandler.js';
import eventBus from '../../app/core/eventBus.js';
import { getDispatcher } from './index.js';


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
    this.itemData = null;
    this.groupNames = [];
    this.hideUnowned = true;
    this.hideCategories = false;
    this.sortAlphabetically = false;
    this.rootElement = null;
    this.groupedContainer = null;
    this.flatContainer = null;
    this.unsubscribeHandles = [];
    this.isInitialized = false;

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
      eventBus.unsubscribe('app:readyForUiDataLoad', readyHandler);
    };
    eventBus.subscribe('app:readyForUiDataLoad', readyHandler, 'inventory');

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
          <label>
            <input type="checkbox" id="hide-unowned" checked />
            Hide unowned items
          </label>
          <div class="checkbox-container">
            <input type="checkbox" id="hide-categories" />
            <label for="hide-categories">Hide categories</label>
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

    const sortedGroupNames = [...this.groupNames].sort((a, b) =>
      a.localeCompare(b)
    );

    sortedGroupNames.forEach((groupName) => {
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
    itemContainer.innerHTML = `
      <button 
        class="item-button" 
        data-item="${name}"
        title="${name}"
      >
        ${name}
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

    if (this.hideCategories) {
      groupedContainer.style.display = 'none';
      flatContainer.style.display = '';
      this.updateVisibility(flatContainer);
    } else {
      flatContainer.style.display = 'none';
      groupedContainer.style.display = '';
      this.updateVisibility(groupedContainer);
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

        if (this.hideUnowned && !isOwned) {
          itemContainer.style.display = 'none';
        } else {
          itemContainer.style.display = '';
          visibleItems++;
        }
      });

      if (!this.hideCategories) {
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
    const hideUnownedCheckbox = this.rootElement.querySelector('#hide-unowned');
    const hideCategoriesCheckbox =
      this.rootElement.querySelector('#hide-categories');
    const sortAlphabeticallyCheckbox = this.rootElement.querySelector(
      '#sort-alphabetically'
    );

    hideUnownedCheckbox.addEventListener('change', (event) => {
      this.hideUnowned = event.target.checked;
      this.updateDisplay();
    });

    hideCategoriesCheckbox.addEventListener('change', (event) => {
      this.hideCategories = event.target.checked;
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

  attachEventBusListeners() {
    this.destroy();

    const subscribe = (eventName, handler) => {
      log('info', `[InventoryUI] Subscribing to ${eventName}`);
      const unsubscribe = eventBus.subscribe(eventName, handler.bind(this), 'inventory');
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

    subscribe('loop:modeChanged', (isLoopMode) => {
      if (this.isInitialized) this.updateDisplay();
    });

    log('info', '[InventoryUI] EventBus listeners attached.');
  }

  _handleSnapshotUpdated(snapshotData) {
    if (this.isInitialized) {
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
    if (this.isInitialized) {
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
