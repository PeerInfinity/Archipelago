// frontend/assets/games/alttp/inventory.js
import { GameInventory } from '../../helpers/index.js';

export class ALTTPInventory extends GameInventory {
  constructor(
    items = [],
    excludeItems = [],
    progressionMapping = {},
    itemData = {},
    debugLog = null
  ) {
    super(items, excludeItems, progressionMapping, itemData, debugLog);
    this.initializeInventory(items);
  }

  initializeInventory(items) {
    this.log({
      message: 'Initializing inventory',
      items: items,
      excludeItems: Array.from(this.excludeSet),
      progressionMapping: this.progressionMapping,
    });

    // Process each initial item and handle events
    for (const item of items) {
      this.addItem(item);
      // Also process events for these items
      if (this.state) {
        this.state.processEventItem(item);
      }
    }
  }

  getItemState(itemName) {
    return {
      directCount: this.items.get(itemName) || 0,
      isExcluded: this.excludeSet.has(itemName),
      progressiveInfo: this.getProgressiveItemInfo(itemName),
      itemData: this.itemData[itemName],
      // Include event state for this item
      isEvent: this.state?.hasEvent(itemName) || false,
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

  has(itemName) {
    this.log({
      message: 'Checking has() for item',
      item: itemName,
      inventory: Array.from(this.items.entries()),
      excludeSet: Array.from(this.excludeSet),
    });

    if (this.excludeSet.has(itemName)) {
      this.log(`${itemName} is excluded`);
      return false;
    }

    // Check if it's an event first
    if (this.state?.hasEvent(itemName)) {
      this.log(`${itemName} is an event and is active`);
      return true;
    }

    // Direct check
    if (this.items.has(itemName)) {
      this.log(`Direct item check for ${itemName}: true`);
      return true;
    }

    // Progressive item check
    this.log(`Checking progressive mappings for ${itemName}`);
    const progressiveInfo = this.getProgressiveItemInfo(itemName);
    for (const [baseItem, progression] of Object.entries(
      this.progressionMapping
    )) {
      const baseCount = this.items.get(baseItem) || 0;
      this.log(`Checking ${baseItem}: base count = ${baseCount}`);
      this.log(`Progression data: ${JSON.stringify(progression)}`);

      const targetLevel =
        progression.items.findIndex((i) => i.name === itemName) + 1;
      this.log(`Target level for ${itemName}: ${targetLevel}`);

      if (targetLevel > 0 && baseCount >= targetLevel) {
        this.log(
          `Progressive match found: ${baseItem} count ${baseCount} >= level ${targetLevel}`
        );
        return true;
      }
    }

    this.log({
      message: `No match found for ${itemName}`,
      progressiveInfo,
    });
    return false;
  }

  addItem(item) {
    if (!this.excludeSet.has(item)) {
      // Update item count
      const count = (this.items.get(item) || 0) + 1;
      this.items.set(item, count);
      this.log(`Added item ${item}, new count: ${count}`);

      // Process event if applicable
      if (this.state) {
        this.state.processEventItem(item);
      }
    }
  }

  count(itemName) {
    if (this.excludeSet.has(itemName)) {
      this.log(`Count for ${itemName}: 0 (excluded)`);
      return 0;
    }

    const directCount = this.items.get(itemName) || 0;
    const progressiveInfo = this.getProgressiveItemInfo(itemName);

    this.log({
      message: `Count check for ${itemName}`,
      directCount,
      progressiveInfo,
    });

    return directCount;
  }

  countGroup(groupName) {
    if (this.excludeSet.has('Any' + groupName)) {
      this.log(`Group ${groupName} excluded by Any${groupName}`);
      return 0;
    }

    let count = 0;
    const groupMembers = [];

    this.items.forEach((itemCount, itemName) => {
      const itemInfo = this.itemData[itemName];
      if (itemInfo && itemInfo.groups.includes(groupName)) {
        count += itemCount;
        groupMembers.push({ item: itemName, count: itemCount });
      }
    });

    this.log({
      message: `Group ${groupName} count: ${count}`,
      members: groupMembers,
    });

    return count;
  }
}
