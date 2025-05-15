export class GameInventory {
  constructor(playerSlot, settings, logger) {
    this.playerSlot = playerSlot;
    this.settings = settings || {};
    this.items = new Map(); // itemName -> count
    this.logger =
      logger ||
      ((msg, context) => console.log(`[${context || 'GameInventory'}] ${msg}`));

    if (this.logger && typeof this.logger === 'function') {
      this.logger('Instance created for player: ' + this.playerSlot);
    } else {
      // Fallback if logger is not a function for some reason
      console.log(
        `[GameInventory Fallback] Instance created for player: ${this.playerSlot}`
      );
    }
  }

  addItem(itemName, count = 1) {
    if (!itemName) {
      this.logger('addItem called with null or undefined itemName.', 'Warning');
      return;
    }
    const currentCount = this.items.get(itemName) || 0;
    this.items.set(itemName, currentCount + count);
    this.logger(
      `Added ${count} of ${itemName}. New total: ${this.items.get(itemName)}`
    );
  }

  removeItem(itemName, count = 1) {
    if (!itemName) {
      this.logger(
        'removeItem called with null or undefined itemName.',
        'Warning'
      );
      return;
    }
    const currentCount = this.items.get(itemName) || 0;
    const newCount = Math.max(0, currentCount - count);
    if (newCount === 0) {
      this.items.delete(itemName);
      this.logger(
        `Removed ${count} of ${itemName}. Item removed from inventory.`
      );
    } else {
      this.items.set(itemName, newCount);
      this.logger(`Removed ${count} of ${itemName}. New total: ${newCount}`);
    }
  }

  has(itemName) {
    if (!itemName) return false;
    const has = this.items.has(itemName) && this.items.get(itemName) > 0;
    // this.logger(`has Check: ${itemName} - ${has}`); // Can be verbose
    return has;
  }

  count(itemName) {
    if (!itemName) return 0;
    const count = this.items.get(itemName) || 0;
    // this.logger(`count Check: ${itemName} - ${count}`); // Can be verbose
    return count;
  }

  getInventory() {
    // Returns a copy of the items map for snapshots or display
    return new Map(this.items);
  }

  setInventory(itemsMap) {
    // Sets the inventory from a map, useful for loading state
    this.items = new Map(itemsMap);
    this.logger(
      'Inventory set from provided map. Item count: ' + this.items.size
    );
  }

  reset() {
    this.items.clear();
    this.logger('Inventory reset.');
  }

  // Placeholder for groupData, ALTTPInventory uses this.
  // Base class can have it, specific inventories can choose to use it or not.
  get groupData() {
    return this._groupData || [];
  }

  set groupData(data) {
    this._groupData = data;
    this.logger('groupData set.');
  }

  // Placeholder for itemData, ALTTPInventory uses this.
  get itemData() {
    return this._itemData || {};
  }

  set itemData(data) {
    this._itemData = data;
    this.logger('itemData set.');
  }

  // Placeholder for progressionMapping
  get progressionMapping() {
    return this._progressionMapping || {};
  }

  set progressionMapping(data) {
    this._progressionMapping = data;
    this.logger('progressionMapping set.');
  }

  // Add other common methods that ALTTPInventory might have and could be generic,
  // for example, countGroup, isProgressiveBaseItem etc., if they can be generalized
  // or provided with base implementations. For now, keeping it to what AdventureInventory had.
}
