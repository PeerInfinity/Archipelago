import { ALTTPState } from './state.js';

// frontend/app/games/alttp/inventory.js

export class ALTTPInventory {
  constructor(items = [], progressionMapping = {}, itemData = {}) {
    this.items = new Map();
    this.progressionMapping = progressionMapping;
    this.itemData = itemData;

    // Initialize all items to 0
    if (itemData) {
      Object.keys(itemData).forEach((itemName) => {
        this.items.set(itemName, 0);
      });
    }

    // Add initial items if any
    items.forEach((itemName) => {
      this.addItem(itemName);
    });
  }

  addItem(itemName) {
    const currentCount = this.items.get(itemName) || 0;
    this.items.set(itemName, currentCount + 1);
  }

  removeItem(itemName) {
    // Decrease direct count if present
    const currentCount = this.items.get(itemName) || 0;
    if (currentCount > 0) {
      this.items.set(itemName, currentCount - 1);
      return true;
    }
    return false;
  }

  // Helper method to check if an item is a progressive base item
  isProgressiveBaseItem(itemName) {
    return this.progressionMapping && !!this.progressionMapping[itemName];
  }

  // Helper method to get all items provided by a progressive item at any level
  getProgressiveProvidedItems(baseItemName) {
    if (!this.progressionMapping || !this.progressionMapping[baseItemName]) {
      return [];
    }

    const providedItems = [];
    const progression = this.progressionMapping[baseItemName];

    for (const upgrade of progression.items || []) {
      if (upgrade.name) {
        providedItems.push(upgrade.name);
      }
      if (upgrade.provides) {
        providedItems.push(...upgrade.provides);
      }
    }

    return providedItems;
  }

  has(itemName) {
    if (this.items.get(itemName) > 0) {
      return true;
    }

    // Check progressive items
    if (this.progressionMapping) {
      for (const [baseItem, progression] of Object.entries(
        this.progressionMapping
      )) {
        const baseCount = this.items.get(baseItem) || 0;
        for (const upgrade of progression.items) {
          if (
            (upgrade.name === itemName ||
              upgrade.provides?.includes(itemName)) &&
            baseCount >= upgrade.level
          ) {
            return true;
          }
        }
      }
    }

    return false;
  }

  has_any(itemList) {
    if (!Array.isArray(itemList)) {
      return false;
    }

    return itemList.some((itemName) => this.has(itemName));
  }

  getItemState(itemName) {
    return {
      directCount: this.items.get(itemName) || 0,
      progressiveInfo: this.getProgressiveItemInfo(itemName),
      itemData: this.itemData[itemName],
    };
  }

  getProgressiveItemInfo(itemName) {
    const progressiveInfo = {};

    for (const [baseItem, progression] of Object.entries(
      this.progressionMapping
    )) {
      const baseCount = this.items.get(baseItem) || 0;
      const relevantUpgrades = progression.items.filter(
        (upgrade) =>
          upgrade.name === itemName || upgrade.provides?.includes(itemName)
      );

      if (relevantUpgrades.length > 0) {
        progressiveInfo[baseItem] = {
          currentCount: baseCount,
          upgrades: relevantUpgrades,
          provides: relevantUpgrades.some(
            (upgrade) => baseCount >= upgrade.level
          ),
        };
      }
    }

    return progressiveInfo;
  }

  count(itemName) {
    const directCount = this.items.get(itemName) || 0;
    return directCount;
  }

  countGroup(groupName) {
    let count = 0;
    this.items.forEach((itemCount, itemName) => {
      const itemInfo = this.itemData[itemName];
      // Only count items that have group data and belong to the specified group
      if (itemInfo?.groups?.includes(groupName)) {
        count += itemCount;
      }
    });
    return count;
  }
}
