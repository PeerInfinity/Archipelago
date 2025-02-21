// frontend/assets/helpers/index.js

// Base class for game-specific helper implementations
export class GameHelpers {
  constructor(inventory) {
    // Remove state parameter
    this.inventory = inventory;
    this.debug = inventory?.debug;
  }

  log(message) {
    if (this.debug?.log) {
      this.debug.log(message);
    }
  }

  // Helper method to execute a helper function by name
  executeHelper(name, ...args) {
    if (typeof this[name] !== 'function') {
      this.log(`Unknown helper function: ${name}`);
      return false;
    }
    const result = this[name](...args);
    this.log(`Helper ${name}(${args.join(', ')}) returned ${result}`);
    return result;
  }
}

// Base class for game-specific inventory management
export class GameInventory {
  constructor(
    items = [],
    excludeItems = [],
    progressionMapping = {},
    itemData = {},
    debugLog = null
  ) {
    this.items = new Map();
    this.excludeSet = new Set(excludeItems);
    this.progressionMapping = progressionMapping;
    this.itemData = itemData;

    // Properly set up debug object if debugLog is provided
    this.debug = debugLog
      ? {
          log: (msg) => {
            if (typeof msg === 'object') {
              debugLog.log(JSON.stringify(msg));
            } else {
              debugLog.log(msg);
            }
          },
        }
      : null;

    for (const item of items) {
      this.addItem(item);
    }
  }

  log(message) {
    if (this.debug?.log) {
      this.debug.log(message);
    }
  }

  addItem(item) {
    if (!this.excludeSet.has(item)) {
      const count = (this.items.get(item) || 0) + 1;
      this.items.set(item, count);
      this.log(`Added item ${item}, new count: ${count}`);
    }
  }

  has(itemName) {
    if (this.excludeSet.has(itemName)) {
      this.log(`${itemName} is excluded`);
      return false;
    }
    const hasItem = this.items.has(itemName);
    this.log(`Checking for ${itemName}: ${hasItem}`);
    return hasItem;
  }

  count(itemName) {
    if (this.excludeSet.has(itemName)) {
      return 0;
    }
    const count = this.items.get(itemName) || 0;
    this.log(`Count of ${itemName}: ${count}`);
    return count;
  }
}
