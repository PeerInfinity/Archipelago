import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import connection from '../client/core/connection.js';
import messageHandler from '../client/core/messageHandler.js';
import eventBus from '../../app/core/eventBus.js';

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
      console.log(
        '[InventoryUI app:readyForUiDataLoad] Received. Proactively fetching data.'
      );
      try {
        await this.syncWithState();
        this.isInitialized = true;
        console.log(
          '[InventoryUI app:readyForUiDataLoad] Data fetched and isInitialized set. Calling updateDisplay and attaching event bus listeners.'
        );
        this.updateDisplay();
        this.attachEventBusListeners();
      } catch (error) {
        console.error(
          '[InventoryUI app:readyForUiDataLoad] Error during initial data sync or setup:',
          error
        );
        this.displayError(
          'Failed to load inventory data. Please try refreshing.'
        );
      } finally {
        eventBus.unsubscribe('app:readyForUiDataLoad', readyHandler);
      }
    };
    eventBus.subscribe('app:readyForUiDataLoad', readyHandler);

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
        <div class="sidebar-header" style="flex-shrink: 0;">
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
        <div id="inventory-groups" class="sidebar-content" style="flex-grow: 1; overflow-y: auto;">
          <!-- Populated by JS -->
        </div>
        <div id="inventory-flat" class="sidebar-content" style="display: none; flex-grow: 1; overflow-y: auto;">
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
      console.warn(
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
      console.warn(
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
        this.modifyItemCount(itemName, event.shiftKey);
      });
    });
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
        console.warn(
          '[InventoryUI] Cannot re-sort: State or rules not available.'
        );
      }
    });
  }

  attachEventBusListeners() {
    console.log('[InventoryUI] Subscribing instance to EventBus events...');
    this.unsubscribeHandles.forEach((u) => u());
    this.unsubscribeHandles = [];

    if (!eventBus) {
      console.error('[InventoryUI] EventBus not available for subscriptions.');
      return;
    }

    const subscribe = (eventName, handler) => {
      console.log(`[InventoryUI] Subscribing to ${eventName}`);
      const unsubscribe = eventBus.subscribe(eventName, handler);
      this.unsubscribeHandles.push(unsubscribe);
    };

    const handleReady = async () => {
      console.log('[InventoryUI] Received stateManager:ready event.');
      if (!this.isInitialized) {
        console.log(
          '[InventoryUI stateManager:ready] UI not yet initialized by app:readyForUiDataLoad. Performing full sync and setup now.'
        );
        try {
          await this.syncWithState();
          this.isInitialized = true;
          this.updateDisplay();
          console.log(
            '[InventoryUI stateManager:ready] Fallback sync and render complete.'
          );
        } catch (error) {
          console.error(
            '[InventoryUI stateManager:ready] Error during fallback data sync or setup:',
            error
          );
          this.displayError('Failed to load inventory data on ready.');
        }
      } else {
        console.log(
          '[InventoryUI stateManager:ready] UI already initialized. Triggering updateDisplay.'
        );
        this.updateDisplay();
      }
    };
    subscribe('stateManager:ready', handleReady);

    subscribe(
      'stateManager:snapshotUpdated',
      this._handleSnapshotUpdated.bind(this)
    );
    subscribe(
      'stateManager:inventoryChanged',
      this._handleInventoryChanged.bind(this)
    );
    subscribe('stateManager:rulesLoaded', this._handleRulesLoaded.bind(this));
  }

  _handleSnapshotUpdated(snapshotData) {
    if (this.isInitialized) {
      if (snapshotData) {
        this.updateDisplay();
      } else {
        console.warn(
          '[InventoryUI] snapshotUpdated event received null snapshotData?'
        );
      }
    }
  }

  _handleInventoryChanged() {
    if (this.isInitialized) {
      this.updateDisplay();
    }
  }

  async _handleRulesLoaded(eventData) {
    console.log(
      '[InventoryUI] Received stateManager:rulesLoaded event. Syncing state.'
    );
    await this.syncWithState();
  }

  destroy() {
    console.log('[InventoryUI] Destroying listeners...');
    this.unsubscribeHandles.forEach((unsubscribe) => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
    this.unsubscribeHandles = [];
    console.log('[InventoryUI] Listeners destroyed.');
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
      console.error(
        '[InventoryUI] StateManager proxy not available for modifyItemCount'
      );
      return;
    }
    if (isShiftPressed) {
      console.warn(
        '[InventoryUI] Shift-click (remove item) not yet implemented via worker command.'
      );
    } else {
      stateManager.addItemToInventory(itemName);
    }
  }

  clear() {
    if (this.groupedContainer) this.groupedContainer.innerHTML = '';
    if (this.flatContainer) this.flatContainer.innerHTML = '';
    this.itemData = null;
    this.groupNames = [];
    console.log('[InventoryUI] Cleared UI elements and data.');
  }

  initialize() {
    console.log('[InventoryUI] initialize() called. Clearing previous state.');
    this.clear();
  }

  async syncWithState() {
    console.log('[InventoryUI] Attempting to sync with stateManager...');
    try {
      const staticData = stateManager.getStaticData();

      console.log(
        '[InventoryUI] Raw staticData.groups received in syncWithState:',
        staticData && staticData.groups
          ? JSON.parse(JSON.stringify(staticData.groups))
          : 'undefined'
      );

      if (!staticData || !staticData.items) {
        console.error(
          '[InventoryUI] Item data is missing in static data cache. Cannot initialize.'
        );
        this.isInitialized = false;
        return;
      }

      this.itemData = staticData.items || {};

      if (staticData.groups && Array.isArray(staticData.groups)) {
        this.groupNames = staticData.groups;
        console.log(
          '[InventoryUI] Successfully assigned groupNames directly from staticData.groups (array): ',
          JSON.parse(JSON.stringify(this.groupNames))
        );
      } else {
        console.warn(
          '[InventoryUI] staticData.groups is not an array as expected. Defaulting to empty groups. Received:',
          staticData.groups
        );
        this.groupNames = [];
      }

      console.log(
        '[InventoryUI] Successfully loaded items and group names from static data cache.',
        {
          itemCount: Object.keys(this.itemData).length,
          groupCount: this.groupNames.length,
        }
      );

      this.initializeUI(this.itemData, this.groupNames);

      const snapshotData = stateManager.getLatestStateSnapshot();
      if (snapshotData && snapshotData.inventory) {
        this._handleSnapshotUpdated(snapshotData);
      } else {
        console.warn(
          '[InventoryUI] No initial snapshot data found to apply item counts.'
        );
        this.updateDisplay();
      }

      this.isInitialized = true;
      console.log('[InventoryUI] Sync with state complete and UI initialized.');
    } catch (error) {
      console.error('[InventoryUI] Error during syncWithState:', error);
      this.displayError(
        `Error initializing inventory: ${error.message}. Check console.`
      );
      this.itemData = {};
      this.groupNames = [];
      this.initializeUI(this.itemData, this.groupNames);
      this.updateDisplay();
    }
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
