import stateManager from '../core/stateManagerSingleton.js';
import connection from '../../client/core/connection.js';
import messageHandler from '../../client/core/messageHandler.js';

export class InventoryUI {
  // Add constants for special groups
  static SPECIAL_GROUPS = {
    EVERYTHING: 'Everything',
    EVENTS: 'Events',
  };

  constructor(gameUI) {
    this.gameUI = gameUI;
    this.itemData = null;
    this.hideUnowned = true;
    this.hideCategories = false;
    this.sortAlphabetically = false;
    this.rootElement = this.createRootElement();
    this.groupedContainer = this.rootElement.querySelector('#inventory-groups');
    this.flatContainer = this.rootElement.querySelector('#inventory-flat');
    this.attachEventListeners();
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

  initialize(itemData, groups) {
    this.itemData = itemData;
    this.initializeUI(itemData, groups);
  }

  restoreItemStates() {
    Object.entries(this.itemData).forEach(([name, _]) => {
      const count = stateManager.getItemCount(name);
      if (count > 0) {
        const buttons = document.querySelectorAll(`[data-item="${name}"]`);
        buttons.forEach((button) => {
          button.classList.add('active');
          const container = button.closest('.item-container');
          if (count > 1) {
            let countBadge = container.querySelector('.count-badge');
            if (!countBadge) {
              countBadge = document.createElement('div');
              countBadge.className = 'count-badge';
              container.appendChild(countBadge);
            }
            countBadge.textContent = count;
            countBadge.style.display = 'flex';
          }
        });
      }
    });
  }

  initializeUI(itemData, groups) {
    this.itemData = itemData; // Store item data for re-sorting/filtering

    // --- NEW: Add fallback check for groups ---
    if (!groups || typeof groups !== 'object' || Array.isArray(groups)) {
      console.warn(
        "[InventoryUI] Invalid 'groups' data received in initializeUI. Defaulting to empty object.",
        groups
      );
      groups = {}; // Use empty object as fallback
    }
    // --- END NEW CHECK ---

    const groupedContainer = this.groupedContainer;
    const flatContainer = this.flatContainer;
    groupedContainer.innerHTML = ''; // Clear previous groups
    flatContainer.innerHTML = '';
    const flatGroup = document.createElement('div');
    flatGroup.className = 'inventory-group';
    const flatItems = document.createElement('div');
    flatItems.className = 'inventory-items';
    flatGroup.appendChild(flatItems);
    flatContainer.appendChild(flatGroup);

    // --- Use Object.keys on the validated groups object ---
    const groupNames = Object.keys(groups);

    // Sort group names, ensuring "Everything" is always first as it contains all items
    const sortedGroupNames = groupNames.sort((a, b) => {
      if (a === InventoryUI.SPECIAL_GROUPS.EVERYTHING) return -1;
      if (b === InventoryUI.SPECIAL_GROUPS.EVERYTHING) return 1;
      // Use the group definition from the `groups` object for sorting if needed, otherwise localeCompare
      const nameA = groups[a]?.name || a;
      const nameB = groups[b]?.name || b;
      return nameA.localeCompare(nameB);
    });

    // Handle regular item groups using sortedGroupNames
    sortedGroupNames.forEach((groupKey) => {
      // Find items belonging to this groupKey based on itemData's groups array
      const groupItems = Object.entries(itemData).filter(
        ([_, data]) =>
          data.groups && data.groups.includes(groupKey) && !data.event
      );

      if (this.sortAlphabetically) {
        groupItems.sort(([a], [b]) => a.localeCompare(b));
      }

      if (groupItems.length > 0) {
        // Use the group's display name if available, otherwise the key
        const displayGroupName = groups[groupKey]?.name || groupKey;
        this.createGroupDiv(groupedContainer, displayGroupName, groupItems);
      }
    });

    // Handle event items
    const eventItems = Object.entries(itemData).filter(
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

    // Create flat view with unique items
    const addedToFlat = new Set();
    let flatItemsList = Object.entries(itemData);
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
    this.restoreItemStates();
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
    if (!this.itemData) return;

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

      items.forEach((container) => {
        const button = container.querySelector('.item-button');
        const isOwned = button.classList.contains('active');

        if (this.hideUnowned && !isOwned) {
          container.style.display = 'none';
        } else {
          container.style.display = '';
          visibleItems++;
        }
      });

      // Only hide the group if we're in grouped mode and there are no visible items
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

  attachEventListeners() {
    const hideUnownedCheckbox = this.rootElement.querySelector('#hide-unowned');
    const hideCategoriesCheckbox =
      this.rootElement.querySelector('#hide-categories');
    const sortAlphabeticallyCheckbox = this.rootElement.querySelector(
      '#sort-alphabetically'
    );

    if (hideUnownedCheckbox) {
      hideUnownedCheckbox.addEventListener('change', (e) => {
        this.hideUnowned = e.target.checked;
        this.updateDisplay();
      });
    }

    if (hideCategoriesCheckbox) {
      hideCategoriesCheckbox.addEventListener('change', (e) => {
        this.hideCategories = e.target.checked;
        this.updateDisplay();
      });
    }

    if (sortAlphabeticallyCheckbox) {
      sortAlphabeticallyCheckbox.addEventListener('change', (e) => {
        this.sortAlphabetically = e.target.checked;
        if (this.itemData) {
          const groups = [
            ...new Set(
              Object.values(this.itemData).flatMap((data) => data.groups)
            ),
          ];
          this.initializeUI(this.itemData, groups);
        }
      });
    }
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
    if (!connection.isConnected() || isShiftPressed) {
      // For removing items or when not connected, use local logic
      if (isShiftPressed) {
        // Remove the item
        if (stateManager.inventory && stateManager.inventory.removeItem) {
          stateManager.inventory.removeItem(itemName);
          // Update UI
          this.syncWithState();
          if (window.consoleManager) {
            window.consoleManager.print(`Removed item: ${itemName}`, 'info');
          }
        }
      } else {
        // Add item locally
        stateManager.addItemToInventory(itemName);
        // Update UI
        this.syncWithState();
        if (window.consoleManager) {
          window.consoleManager.print(`Added item: ${itemName}`, 'info');
        }
      }
    } else {
      // For adding items when connected to server:
      // 1. Mark this item as clicked by user to prevent double-processing
      window._userClickedItems.add(itemName);
      // 2. Update the inventory locally
      stateManager.addItemToInventory(itemName);
      // 3. Update UI
      this.syncWithState();
      // 4. Send to server via messageHandler
      messageHandler.sendMessage(`!getitem ${itemName}`);
      // 5. Remove from tracking after a delay
      setTimeout(() => {
        window._userClickedItems.delete(itemName);
      }, 5000);
      if (window.consoleManager) {
        window.consoleManager.print(`Sent item request: ${itemName}`, 'info');
      }
    }
  }

  clear() {
    this.itemData = null;
    document.querySelectorAll('.item-button').forEach((button) => {
      button.classList.remove('active');
      const countBadge = button
        .closest('.item-container')
        ?.querySelector('.count-badge');
      if (countBadge) {
        countBadge.style.display = 'none';
      }
    });

    // Clear both containers
    const groupedContainer = this.groupedContainer;
    const flatContainer = this.flatContainer;
    if (groupedContainer) groupedContainer.innerHTML = '';
    if (flatContainer) flatContainer.innerHTML = '';
  }

  // Add method to sync UI with state
  syncWithState() {
    // combine all quiet sync logic here:
    // read item states from stateManager in one pass
    // update button classes and count badges
    // do not individually call handleEventCollection

    document.querySelectorAll('.item-button').forEach((button) => {
      const itemName = button.dataset.item;
      const count = stateManager.getItemCount(itemName);
      const container = button.closest('.item-container');

      if (button && container) {
        // Add null check for both button and container
        button.classList.toggle('active', count > 0);
        this.createOrUpdateCountBadge(container, count);
      }
    });

    // Update display for this UI component only (this handles group visibility and group colorblind class)
    this.updateDisplay();
  }
}
