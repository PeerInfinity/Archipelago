import stateManager from './stateManagerSingleton.js';

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
    this.attachEventListeners();
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
    // Create grouped view
    const groupedContainer = document.getElementById('inventory-groups');
    groupedContainer.innerHTML = '';

    // Create flat view container
    const flatContainer = document.getElementById('inventory-flat');
    flatContainer.innerHTML = '';
    const flatGroup = document.createElement('div');
    flatGroup.className = 'inventory-group';
    const flatItems = document.createElement('div');
    flatItems.className = 'inventory-items';
    flatGroup.appendChild(flatItems);
    flatContainer.appendChild(flatGroup);

    // Sort groups, ensuring "Everything" is always first as it contains all items
    const sortedGroups = [...groups].sort((a, b) => {
      if (a === InventoryUI.SPECIAL_GROUPS.EVERYTHING) return -1;
      if (b === InventoryUI.SPECIAL_GROUPS.EVERYTHING) return 1;
      return a.localeCompare(b);
    });

    // Handle regular item groups
    sortedGroups.forEach((group) => {
      const groupItems = Object.entries(itemData).filter(
        ([_, data]) => data.groups.includes(group) && !data.event
      );

      if (this.sortAlphabetically) {
        groupItems.sort(([a], [b]) => a.localeCompare(b));
      }

      if (groupItems.length > 0) {
        this.createGroupDiv(groupedContainer, group, groupItems);
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

    const groupedContainer = document.getElementById('inventory-groups');
    const flatContainer = document.getElementById('inventory-flat');

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
    document.querySelectorAll('.item-button').forEach((button) => {
      button.addEventListener('click', (event) => {
        const itemName = button.dataset.item;
        this.modifyItemCount(itemName, event.shiftKey);
      });
    });
  }

  attachEventListeners() {
    const hideUnownedCheckbox = document.getElementById('hide-unowned');
    const hideCategoriesCheckbox = document.getElementById('hide-categories');
    const sortAlphabeticallyCheckbox = document.getElementById(
      'sort-alphabetically'
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
    if (!this.itemData || !this.itemData[itemName]) return;

    const currentCount = stateManager.getItemCount(itemName);
    const buttons = document.querySelectorAll(`[data-item="${itemName}"]`);
    const containers = Array.from(buttons)
      .map((button) => button.closest('.item-container'))
      .filter((container) => container !== null);

    if (isShiftPressed) {
      // Subtract item if shift is pressed and count is positive
      if (currentCount > 0) {
        // Use the proper remove method to handle progressive items
        if (stateManager.inventory) {
          // Remove the item using our new method
          stateManager.inventory.removeItem(itemName);

          const newCount = stateManager.getItemCount(itemName);

          // Update UI elements
          if (newCount === 0) {
            buttons.forEach((button) => button.classList.remove('active'));
          }

          containers.forEach((container) =>
            this.createOrUpdateCountBadge(container, newCount)
          );

          if (window.consoleManager) {
            window.consoleManager.print(
              `${itemName} count: ${newCount}`,
              'info'
            );
          }
        }
      }
    } else {
      // Original behavior: add item
      stateManager.addItemToInventory(itemName);
      buttons.forEach((button) => button.classList.add('active'));
      containers.forEach((container) =>
        this.createOrUpdateCountBadge(container, currentCount + 1)
      );

      if (window.consoleManager) {
        window.consoleManager.print(
          `${itemName} count: ${currentCount + 1}`,
          'info'
        );
      }
    }

    stateManager.invalidateCache();
    this.syncWithState(); // This will now update all UI components
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
    const groupedContainer = document.getElementById('inventory-groups');
    const flatContainer = document.getElementById('inventory-flat');
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

    // Update display for all UI components
    this.updateDisplay();
    this.gameUI.locationUI?.syncWithState();
    this.gameUI.regionUI?.update();
  }
}
