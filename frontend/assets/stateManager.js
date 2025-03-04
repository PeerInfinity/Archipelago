import { evaluateRule } from './ruleEngine.js';
import { ALTTPInventory } from './games/alttp/inventory.js';
import { ALTTPState } from './games/alttp/state.js';
import { ALTTPHelpers } from './games/alttp/helpers.js';

/**
 * Manages game state including inventory and reachable regions/locations.
 * Handles automatic collection of event items when their locations become accessible.
 * All state (including events) is tracked through the inventory system.
 */
export class StateManager {
  constructor() {
    // Core state storage
    this.inventory = new ALTTPInventory();
    this.state = new ALTTPState();
    this.helpers = new ALTTPHelpers();

    // Region and location data
    this.locations = []; // Flat array of all locations
    this.regions = {}; // Map of region name -> region data
    this.eventLocations = new Map(); // Map of location name -> event location data

    // Region reachability tracking
    this.knownReachableRegions = new Set();
    this.knownUnreachableRegions = new Set();
    this.previousReachable = new Set();
    this.cacheValid = false;

    // Game configuration
    this.mode = null;
    this.settings = null;
    this.startRegions = null;

    // Checked locations tracking
    this.checkedLocations = new Set();

    this._uiCallbacks = {};
  }

  /**
   * Initializes inventory with loaded game data
   */
  initializeInventory(items, progressionMapping, itemData) {
    // Create the inventory first
    this.inventory = new ALTTPInventory(items, progressionMapping, itemData);
  }

  registerUICallback(name, callback) {
    this._uiCallbacks[name] = callback;
  }

  notifyUI(eventType) {
    Object.values(this._uiCallbacks).forEach((callback) => {
      if (typeof callback === 'function') callback(eventType);
    });
  }

  clearInventory() {
    // When clearing, make sure we preserve the existing progression mapping and item data
    const progressionMapping = this.inventory.progressionMapping || {};
    const itemData = this.inventory.itemData || {};
    this.inventory = new ALTTPInventory([], progressionMapping, itemData);
    this.notifyUI('inventoryChanged');
  }

  clearState() {
    // When clearing state, preserve progression mapping and item data
    const progressionMapping = this.inventory.progressionMapping || {};
    const itemData = this.inventory.itemData || {};
    this.inventory = new ALTTPInventory([], progressionMapping, itemData);
    this.clearCheckedLocations();
    this.invalidateCache();
    this.notifyUI('inventoryChanged');
  }

  /**
   * Adds an item and notifies all registered callbacks
   */
  addItemToInventory(itemName) {
    if (this._batchMode) {
      // In batch mode, collect updates without triggering callbacks
      const currentCount =
        this._batchedUpdates.get(itemName) || this.inventory.count(itemName);
      this._batchedUpdates.set(itemName, currentCount + 1);
    } else {
      // Normal single-item mode
      this.inventory.addItem(itemName);

      // Process progressive items immediately regardless of region computation
      this._processProgressiveItem(itemName);

      this.notifyUI('inventoryChanged');
    }
  }

  /**
   * Helper method to process progressive item effects
   * This runs regardless of batch mode to ensure progressive items are handled correctly
   */
  _processProgressiveItem(itemName) {
    // No action needed here by default - this is just a hook for processing
    // Progressive items are automatically handled by the inventory.has() method
  }

  getItemCount(itemName) {
    const count = this.inventory.count(itemName);
    return count;
  }

  /**
   * Loads and processes region/location data from a JSON file
   */
  loadFromJSON(jsonData) {
    if (!jsonData.version || jsonData.version !== 3) {
      throw new Error('Invalid JSON format: requires version 3');
    }

    // Load region and location data
    this.regions = jsonData.regions['1'];
    const itemData = jsonData.items['1'];
    const groupData = jsonData.item_groups['1'];
    const progressionMapping = jsonData.progression_mapping['1'];

    // Update the inventory's progression mapping and item data if inventory exists
    if (this.inventory) {
      this.inventory.progressionMapping = progressionMapping;
      this.inventory.itemData = itemData;
      this.inventory.groupData = groupData;
    }

    // Process locations and events
    this.locations = [];
    this.eventLocations.clear();

    // Extract shop data from regions
    const shops = [];
    if (this.regions) {
      Object.values(this.regions).forEach((region) => {
        if (region.shop) {
          shops.push(region.shop);
        }

        // Process locations in this region
        region.locations.forEach((loc) => {
          const locationData = {
            ...loc,
            region: region.name,
            player: region.player,
          };
          this.locations.push(locationData);
          if (locationData.item && locationData.item.type === 'Event') {
            this.eventLocations.set(locationData.name, locationData);
          }
        });
      });
    }

    // Initialize the state object with settings and data
    // This avoids duplicating data in both stateManager and state
    if (this.state) {
      // Log the settings being passed to loadSettings
      console.log(
        'Settings being passed to loadSettings:',
        jsonData.settings?.['1']
      );

      // Pass the settings to the state for loading
      this.state.loadSettings(jsonData.settings?.['1']);

      // Pass shop data to the state
      this.state.loadShops(shops);

      // Store game mode in state, not in stateManager
      if (jsonData.mode?.['1']) {
        this.state.gameMode = jsonData.mode['1'];
      }

      // Store start regions in state
      if (jsonData.start_regions?.['1']?.default) {
        this.state.startRegions = jsonData.start_regions['1'].default;
      } else {
        this.state.startRegions = ['Menu'];
      }
    }

    this.invalidateCache();

    // Immediately compute reachable regions to collect initial events
    this.computeReachableRegions();
  }

  invalidateCache() {
    this.cacheValid = false;
    this.knownReachableRegions.clear();
    this.knownUnreachableRegions.clear();
  }

  /**
   * Core pathfinding logic: determines which regions are reachable
   * Also handles automatic collection of event items
   */
  computeReachableRegions() {
    // For custom inventories, don't use the cache
    const useCache = this.cacheValid;
    if (useCache) {
      return this.knownReachableRegions;
    }

    if (this._computing) {
      return this.knownReachableRegions;
    }

    // Only set computing flag for main inventory
    this._computing = true;

    // Create a local result set - only store in state if it's the main inventory
    let localReachable = new Set();
    let newEventCollected = true;

    try {
      while (newEventCollected) {
        newEventCollected = false;
        const reachableSet = this.runSingleBFS();

        // Auto-collect events if using main inventory
        for (const loc of this.eventLocations.values()) {
          if (reachableSet.has(loc.region)) {
            const canAccessLoc = evaluateRule(loc.access_rule);
            if (canAccessLoc && !this.inventory.has(loc.item.name)) {
              this.inventory.addItem(loc.item.name);
              newEventCollected = true;
              this.notifyUI('inventoryChanged');
            }
          }
        }

        localReachable = new Set([...localReachable, ...reachableSet]);
      }

      // Only update cache for main inventory
      this.knownReachableRegions = localReachable;
      this.knownUnreachableRegions = new Set(
        Object.keys(this.regions).filter((r) => !localReachable.has(r))
      );
      this.cacheValid = true;
    } finally {
      this._computing = false;
    }

    this.notifyUI('reachableRegionsComputed');
    return localReachable;
  }

  getStartRegions() {
    // Get start regions from state object if available, or use default
    if (this.state && this.state.startRegions) {
      return this.state.startRegions;
    }
    return ['Menu'];
  }

  /**
   * Single pass of breadth-first search to find reachable regions
   */
  runSingleBFS() {
    const start = this.getStartRegions();
    const reachable = new Set(start);
    const queue = [...start];
    const seenExits = new Set();
    while (queue.length > 0) {
      const currentRegionName = queue.shift();
      const currentRegion = this.regions[currentRegionName];
      if (!currentRegion) continue;
      for (const exit of currentRegion.exits || []) {
        const exitKey = `${currentRegionName}->${exit.name}`;
        if (seenExits.has(exitKey)) continue;
        seenExits.add(exitKey);
        if (!exit.connected_region) continue;
        if (exit.access_rule && !evaluateRule(exit.access_rule)) {
          continue;
        }
        const targetRegion = exit.connected_region;
        if (!reachable.has(targetRegion)) {
          reachable.add(targetRegion);
          queue.push(targetRegion);
        }
      }
      for (const entrance of currentRegion.entrances || []) {
        if (!entrance.connected_region) continue;
        if (reachable.has(entrance.connected_region)) continue;
        if (entrance.access_rule && !evaluateRule(entrance.access_rule)) {
          continue;
        }
        reachable.add(entrance.connected_region);
        queue.push(entrance.connected_region);
      }
    }
    return reachable;
  }

  /**
   * Determines if a region is reachable with the given inventory
   * @param {string} regionName - The name of the region to check
   * @return {boolean} - Whether the region is reachable
   */
  isRegionReachable(regionName) {
    const reachableRegions = this.computeReachableRegions();
    return reachableRegions.has(regionName);
  }

  /**
   * Determines if a location is accessible with the given inventory
   * @param {Object} location - The location to check
   * @return {boolean} - Whether the location is accessible
   */
  isLocationAccessible(location) {
    const reachableRegions = this.computeReachableRegions();
    if (!reachableRegions.has(location.region)) {
      return false;
    }

    // Simply return the rule evaluation result
    // Don't auto-collect events here since computeReachableRegions handles that
    return evaluateRule(location.access_rule);
  }

  getProcessedLocations(
    sorting = 'original',
    showReachable = true,
    showUnreachable = true
  ) {
    return this.locations
      .slice()
      .sort((a, b) => {
        if (sorting === 'accessibility') {
          const aAccessible = this.isLocationAccessible(a);
          const bAccessible = this.isLocationAccessible(b);
          return bAccessible - aAccessible;
        }
        return 0;
      })
      .filter((location) => {
        const isAccessible = this.isLocationAccessible(location);
        return (
          (isAccessible && showReachable) || (!isAccessible && showUnreachable)
        );
      });
  }

  getNewlyReachableLocations() {
    const currentReachable = new Set(
      this.locations
        .filter((loc) => this.isLocationAccessible(loc))
        .map((loc) => `${loc.player}-${loc.name}`)
    );
    const newlyReachable = new Set(
      [...currentReachable].filter((x) => !this.previousReachable.has(x))
    );
    this.previousReachable = currentReachable;
    return newlyReachable;
  }

  updateInventoryFromList(items) {
    // Clear existing inventory items
    Object.keys(this.inventory.items).forEach((key) => {
      this.inventory.items[key] = 0;
    });

    // Add each item from the list
    items.forEach((item) => {
      this.addItemToInventory(item);
    });

    // Invalidate cache since inventory changed
    this.invalidateCache();
  }

  /**
   * Initializes the inventory with a specific set of items for testing
   */
  initializeInventoryForTest(requiredItems = [], excludedItems = []) {
    // Preserve the current progression mapping and item data when clearing state
    this.clearState();

    // Begin batch updates - defer region computation until the end
    this.beginBatchUpdate(true);

    // First, if we have excludedItems, start with ALL items except those
    if (excludedItems?.length > 0) {
      Object.keys(this.inventory.itemData).forEach((itemName) => {
        if (
          !excludedItems.includes(itemName) &&
          !(
            itemName.includes('Bottle') && excludedItems.includes('AnyBottle')
          ) &&
          !this.inventory.itemData[itemName].event && // Skip event items
          this.inventory.itemData[itemName].type !== 'Event' // Additional check using type
        ) {
          this.addItemToInventory(itemName);

          // Process as event if applicable
          if (this.state?.processEventItem) {
            this.state.processEventItem(itemName);
          }
        }
      });
    }

    // Apply these updates to the inventory but don't recompute regions yet
    this.commitBatchUpdate();

    // Now that items are in the inventory, process excluded progressive items
    if (excludedItems?.length > 0) {
      excludedItems.forEach((excludedItem) => {
        if (this.inventory.isProgressiveBaseItem(excludedItem)) {
          const providedItems =
            this.inventory.getProgressiveProvidedItems(excludedItem);

          providedItems.forEach((providedItem) => {
            if (this.inventory.items.has(providedItem)) {
              this.inventory.items.set(providedItem, 0);
            }
          });
        }
      });
    }

    // Start second batch for required items
    this.beginBatchUpdate(true);

    // Add all required items
    requiredItems.forEach((itemName) => {
      this.addItemToInventory(itemName);

      // Process as event if applicable
      if (this.state?.processEventItem) {
        this.state.processEventItem(itemName);
      }
    });

    // Commit with region computation deferred
    this.commitBatchUpdate();

    // Make sure bombless_start flag is set
    if (this.state) {
      //this.state.setFlag('bombless_start');
    }

    // Now finally compute regions once at the end
    this.invalidateCache();
    this.computeReachableRegions();
  }

  isLocationChecked(locationName) {
    return this.checkedLocations.has(locationName);
  }

  checkLocation(locationName) {
    this.checkedLocations.add(locationName);
  }

  clearCheckedLocations() {
    this.checkedLocations.clear();
  }

  /**
   * Begins a batch update operation for adding multiple items efficiently.
   * This prevents UI updates until commitBatchUpdate is called.
   * @param {boolean} deferRegionComputation - If true, won't recompute regions during commit (default: true)
   */
  beginBatchUpdate(deferRegionComputation = true) {
    this._batchMode = true;
    this._deferRegionComputation = deferRegionComputation;
    this._batchedUpdates = new Map(); // store item -> count updates
  }

  /**
   * Commits all pending updates from a batch operation.
   * Triggers UI updates through callbacks and optionally updates region cache.
   */
  commitBatchUpdate() {
    if (!this._batchMode) return;

    // Apply all batched updates at once to inventory
    this._batchedUpdates.forEach((count, itemName) => {
      this.inventory.items.set(itemName, count);
    });

    // Clear inventory caches
    this.invalidateCache();

    // Only recompute regions if not deferred
    if (!this._deferRegionComputation) {
      this.computeReachableRegions();
    }

    this.notifyUI('inventoryChanged');

    this._batchMode = false;
    this._deferRegionComputation = false;
    this._batchedUpdates = new Map();
  }
}
