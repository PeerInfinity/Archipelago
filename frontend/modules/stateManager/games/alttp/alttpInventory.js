import { ALTTPState } from './alttpState.js';

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
    // Check if the item being added is a base progressive item
    if (this.isProgressiveBaseItem(itemName)) {
      // If it is, just increment the count of the base progressive item itself.
      // The `has()` and `count()` methods will use this count along with
      // `progressionMapping` to determine what actual items are possessed.
      const currentCount = this.items.get(itemName) || 0;
      const itemDef = this.itemData ? this.itemData[itemName] : null;
      const maxCount = itemDef ? itemDef.max_count : Infinity;

      if (currentCount < maxCount) {
        this.items.set(itemName, currentCount + 1);
      } else {
        // This is expected behavior during test setup when populating base inventory
        // Only log as debug info, not a warning
        console.debug(
          `[ALTTPInventory] Max count (${maxCount}) for progressive item ${itemName} reached. Current count: ${currentCount}`
        );
      }
    } else {
      // If it's not a progressive base item, handle it as a normal item.
      // This also handles adding specific tiers of progressive items if they were directly given.
      const currentCount = this.items.get(itemName) || 0;
      const itemDef = this.itemData ? this.itemData[itemName] : null;
      const maxCount = itemDef ? itemDef.max_count : Infinity;
      // For non-progressive items, or specific progressive tiers, check their individual max_count.
      // This part of logic might need refinement if specific tiers (e.g. "Fighter Sword") given directly
      // should not exceed 1, while the base "Progressive Sword" can go up to 4.
      // For now, assume direct adds also respect their own max_count.
      if (currentCount < maxCount) {
        this.items.set(itemName, currentCount + 1);
      } else {
        // Optionally log or handle max count reached for normal item
        // console.warn(`[ALTTPInventory] Max count for item ${itemName} reached.`);
      }
    }
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
    // If the item itself is a base progressive item, return its direct count.
    if (this.isProgressiveBaseItem(itemName)) {
      return this.items.get(itemName) || 0;
    }

    // Check if itemName is a specific tier of any progressive item we hold.
    if (this.progressionMapping) {
      for (const [baseItem, progression] of Object.entries(
        this.progressionMapping
      )) {
        const baseItemCount = this.items.get(baseItem) || 0;
        if (baseItemCount > 0) {
          // Only proceed if we have the base progressive item
          for (const upgrade of progression.items) {
            // Check if the requested itemName matches an upgrade's name or is provided by an upgrade
            if (
              upgrade.name === itemName ||
              upgrade.provides?.includes(itemName)
            ) {
              // If we have enough of the base item to have reached this upgrade level
              if (baseItemCount >= upgrade.level) {
                return 1; // Each specific tier of a progressive item is counted as 1 if possessed
              }
            }
          }
        }
      }
    }

    // If not a progressive base item itself, and not a currently possessed tier of a progressive item,
    // return its direct count (e.g., for normal items or if a tier was somehow added directly).
    return this.items.get(itemName) || 0;
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
