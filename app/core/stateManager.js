import { evaluateRule } from './ruleEngine.js';
import eventBus from './eventBus.js';
import { ALTTPInventory } from '../games/alttp/inventory.js';
import { ALTTPState } from '../games/alttp/state.js';
import { ALTTPHelpers } from '../games/alttp/helpers.js';

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

    // Player identification
    this.playerSlot = 1; // Default player slot to 1 for single-player/offline
    this.team = 0; // Default team

    // Region and location data
    this.locations = []; // Flat array of all locations
    this.regions = {}; // Map of region name -> region data
    this.eventLocations = new Map(); // Map of location name -> event location data

    // Enhance the indirectConnections to match Python implementation
    this.indirectConnections = new Map(); // Map of region name -> set of entrances affected by that region

    // Enhanced region reachability tracking with path context
    this.knownReachableRegions = new Set();
    this.knownUnreachableRegions = new Set();
    this.cacheValid = false;

    // Path tracking similar to Python implementation
    this.path = new Map(); // Map of region name -> {name, entrance, previousRegion}
    this.blockedConnections = new Set(); // Set of entrances that are currently blocked

    // Flag to prevent recursion during computation
    this._computing = false;

    // Game configuration
    this.mode = null;
    this.settings = null;
    this.startRegions = null;

    // Checked locations tracking
    this.checkedLocations = new Set();

    this._uiCallbacks = {};

    // Batch update support
    this._batchMode = false;
    this._deferRegionComputation = false;
    this._batchedUpdates = new Map();

    // Add debug mode flag
    this.debugMode = false; // Set to true to enable detailed logging

    // New maps for item and location IDs
    this.itemNameToId = {};
    this.locationNameToId = {};
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

    // Also emit to eventBus for ProgressUI
    try {
      if (eventBus) {
        eventBus.publish(`stateManager:${eventType}`, {});
      }
    } catch (e) {
      console.warn('Could not publish to eventBus:', e);
    }
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
    this.indirectConnections = new Map(); // Clear indirect connections
    this.invalidateCache();
    this.notifyUI('inventoryChanged');
  }

  /**
   * Adds an item and notifies all registered callbacks
   */
  addItemToInventory(itemName) {
    // Skip adding if we don't have valid item data for this item
    if (!this.inventory.itemData || !this.inventory.itemData[itemName]) {
      console.warn(`Attempted to add unknown item: ${itemName}`);
      return false;
    }

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

      // Invalidate cache and recompute after item add (if not batching)
      this.invalidateCache();
      this.computeReachableRegions();
    }

    return true;
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
   * @param {object} jsonData - The parsed JSON data.
   * @param {string} selectedPlayerId - The ID of the player whose data should be loaded.
   */
  loadFromJSON(jsonData, selectedPlayerId) {
    if (!jsonData.schema_version || jsonData.schema_version !== 3) {
      throw new Error('Invalid JSON format: requires schema version 3');
    }
    if (!selectedPlayerId) {
      throw new Error('loadFromJSON called without selectedPlayerId');
    }

    // Set the player slot based on selection
    this.playerSlot = parseInt(selectedPlayerId, 10);
    console.log(`StateManager playerSlot set to: ${this.playerSlot}`);

    // Load data for the selected player
    this.regions = jsonData.regions[selectedPlayerId];
    const itemData = jsonData.items[selectedPlayerId];
    const groupData = jsonData.item_groups[selectedPlayerId];
    const progressionMapping = jsonData.progression_mapping[selectedPlayerId];

    // NEW: Store the itempool counts if available for the selected player
    this.itempool_counts = jsonData.itempool_counts?.[selectedPlayerId] || null;

    // Debug logging for itempool_counts
    console.log('Loaded JSON data:', {
      hasItemPoolCounts: Boolean(jsonData.itempool_counts),
      itemPoolCountsKeys: jsonData.itempool_counts
        ? Object.keys(jsonData.itempool_counts)
        : [],
    });

    // Create a map of item names to IDs for fast lookup (using selected player's items)
    this.itemNameToId = {};
    if (itemData) {
      Object.entries(itemData).forEach(([itemName, data]) => {
        if (data.id !== undefined && data.id !== null) {
          this.itemNameToId[itemName] = data.id;
        }
      });
      console.log(`Loaded ${Object.keys(this.itemNameToId).length} item IDs`);

      // Debug: Print first 5 item ID entries
      const itemEntries = Object.entries(this.itemNameToId).slice(0, 5);
    }

    // Create a map of location names to IDs for fast lookup
    this.locationNameToId = {};

    // Update the inventory's progression mapping and item data if inventory exists
    if (this.inventory) {
      this.inventory.progressionMapping = progressionMapping;
      this.inventory.itemData = itemData;
      this.inventory.groupData = groupData;

      // Store item IDs directly on item data objects for easier access
      if (this.itemNameToId) {
        Object.entries(this.itemNameToId).forEach(([itemName, id]) => {
          if (this.inventory.itemData[itemName]) {
            this.inventory.itemData[itemName].id = id;
          }
        });
      }
    }

    // Process locations and events
    this.locations = [];
    this.eventLocations.clear();
    this.indirectConnections = new Map(); // Clear indirect connections

    // Build indirect connections map to match Python implementation
    // This maps regions to exits that depend on those regions in their access rules
    this.buildIndirectConnections();

    // Extract shop data from regions
    const shops = [];
    if (this.regions) {
      Object.values(this.regions).forEach((region) => {
        if (region.shop) {
          shops.push(region.shop);
        }

        // Process locations in this region
        region.locations.forEach((loc) => {
          // Directly add the region name to the original location object within the nested structure
          loc.region = region.name;

          const locationData = {
            ...loc,
            region: region.name, // This is now slightly redundant but harmless
            player: region.player,
          };

          // Location ID is already part of the location object from the backend
          // Just ensure it's included in the lookup map
          if (loc.id !== undefined && loc.id !== null) {
            this.locationNameToId[loc.name] = loc.id;
          }

          this.locations.push(locationData);
          if (locationData.item && locationData.item.type === 'Event') {
            this.eventLocations.set(locationData.name, locationData);
          }
        });
      });

      console.log(
        `Loaded ${Object.keys(this.locationNameToId).length} location IDs`
      );

      // Debug: Print first 5 location ID entries
      const locationEntries = Object.entries(this.locationNameToId).slice(0, 5);
    }

    // Initialize the state object with settings and data for the selected player
    if (this.state) {
      // Pass the settings for the selected player to the state for loading
      this.state.loadSettings(jsonData.settings?.[selectedPlayerId]);

      // Pass shop data (assuming shops might be player-specific or need filtering later)
      this.state.loadShops(shops);

      // Store game mode in state for the selected player
      if (jsonData.mode?.[selectedPlayerId]) {
        this.state.gameMode = jsonData.mode[selectedPlayerId];
      }

      // Store start regions in state for the selected player
      if (jsonData.start_regions?.[selectedPlayerId]?.default) {
        this.state.startRegions =
          jsonData.start_regions[selectedPlayerId].default;
      } else {
        // Default might need adjustment based on game logic if start regions differ per player
        this.state.startRegions = ['Menu'];
      }
    }

    // Process starting items after inventory is initialized
    const startingItems = jsonData.starting_items?.[selectedPlayerId] || [];
    if (startingItems && startingItems.length > 0) {
      console.log(
        `Adding ${startingItems.length} starting items for player ${selectedPlayerId}`
      );
      this.beginBatchUpdate(true); // Defer computation until after adding items
      startingItems.forEach((itemName) => {
        // Ensure the item exists in itemData before trying to add
        if (this.inventory.itemData && this.inventory.itemData[itemName]) {
          this.addItemToInventory(itemName);
        } else {
          console.warn(
            `Starting item '${itemName}' not found in itemData, skipping.`
          );
        }
      });
      this.commitBatchUpdate(); // Commit changes, this will trigger computation if deferred
    } else {
      // If no starting items, still need to ensure computation runs if it was deferred implicitly
      // However, commitBatchUpdate already handles this if we didn't start a batch.
      // If we *did* start a batch for other reasons (unlikely here), this ensures cleanup.
      if (this._batchMode) {
        this.commitBatchUpdate();
      }
    }

    this.invalidateCache();

    // Immediately compute reachable regions to collect initial events
    this.computeReachableRegions();

    // Add this line at the end of the method to enhance locations with shop data
    if (
      this.helpers &&
      typeof this.helpers.enhanceLocationsWithShopData === 'function'
    ) {
      this.helpers.enhanceLocationsWithShopData();
    }

    // Emit a specific event for JSON data load completion
    try {
      // Use setTimeout to ensure this event fires after returning from the method
      setTimeout(() => {
        if (eventBus) {
          console.log('Publishing stateManager:jsonDataLoaded event');
          eventBus.publish('stateManager:jsonDataLoaded', {});
          // Publish ready event immediately after data loaded event (within timeout)
          console.log('Publishing stateManager:ready event (delayed)');
          eventBus.publish('stateManager:ready', {
            playerSlot: this.playerSlot,
          });
        }
      }, 0);
    } catch (e) {
      console.warn('Could not publish jsonDataLoaded event:', e);
    }

    return true;
  }

  /**
   * Build indirect connections map similar to Python implementation
   * Identifies exits that depend on regions in their access rules
   */
  buildIndirectConnections() {
    // Analyze all exits to find indirect dependencies
    for (const regionName in this.regions) {
      const region = this.regions[regionName];

      // Skip if region has no exits
      if (!region.exits || !region.exits.length) continue;

      for (const exit of region.exits) {
        // Skip if no access rule
        if (!exit.access_rule) continue;

        // Analyze rule to find region dependencies
        const dependencies = this.findRegionDependencies(exit.access_rule);

        // Register dependencies
        for (const depRegion of dependencies) {
          if (!this.indirectConnections.has(depRegion)) {
            this.indirectConnections.set(depRegion, new Set());
          }
          this.indirectConnections.get(depRegion).add({
            fromRegion: regionName,
            exit: exit,
          });
        }
      }
    }

    if (this.debugMode) {
      console.log(
        'Built indirect connections map:',
        Object.fromEntries(
          [...this.indirectConnections].map(([k, v]) => [
            k,
            [...v].map((e) => `${e.fromRegion}->${e.exit.name}`),
          ])
        )
      );
    }
  }

  /**
   * Find regions that a rule depends on through can_reach state methods
   */
  findRegionDependencies(rule) {
    const dependencies = new Set();

    if (!rule) return dependencies;

    // Check for direct state_method can_reach
    if (
      rule.type === 'state_method' &&
      rule.method === 'can_reach' &&
      rule.args &&
      rule.args.length > 0 &&
      typeof rule.args[0] === 'string' &&
      rule.args[1] === 'Region'
    ) {
      dependencies.add(rule.args[0]);
    }

    // Check children recursively for composite rules
    if ((rule.type === 'and' || rule.type === 'or') && rule.conditions) {
      for (const condition of rule.conditions) {
        const childDeps = this.findRegionDependencies(condition);
        for (const dep of childDeps) {
          dependencies.add(dep);
        }
      }
    }

    return dependencies;
  }

  invalidateCache() {
    this.cacheValid = false;
    this.knownReachableRegions.clear();
    this.knownUnreachableRegions.clear();
    this.path.clear();
    this.blockedConnections.clear();
  }

  /**
   * Core pathfinding logic: determines which regions are reachable
   * Closely mirrors Python's update_reachable_regions method
   * Also handles automatic collection of event items
   */
  computeReachableRegions() {
    // For custom inventories, don't use the cache
    const useCache = this.cacheValid;
    if (useCache) {
      return this.knownReachableRegions;
    }

    // Recursion protection
    if (this._computing) {
      return this.knownReachableRegions;
    }

    this._computing = true;

    try {
      // Get start regions and initialize BFS
      const startRegions = this.getStartRegions();

      // Initialize path tracking
      this.path.clear();
      this.blockedConnections.clear();

      // Initialize reachable regions with start regions
      this.knownReachableRegions = new Set(startRegions);

      // Add exits from start regions to blocked connections
      for (const startRegion of startRegions) {
        const region = this.regions[startRegion];
        if (region && region.exits) {
          // Add all exits from this region to blocked connections
          for (const exit of region.exits) {
            this.blockedConnections.add({
              fromRegion: startRegion,
              exit: exit,
            });
          }
        }
      }

      // Start BFS process
      let newEventCollected = true;

      while (newEventCollected) {
        newEventCollected = false;

        // Process reachability with BFS
        const newlyReachable = this.runBFSPass();

        // Auto-collect events
        for (const loc of this.eventLocations.values()) {
          if (this.knownReachableRegions.has(loc.region)) {
            const canAccessLoc =
              !loc.access_rule || evaluateRule(loc.access_rule);
            if (canAccessLoc && !this.inventory.has(loc.item.name)) {
              // 1. Add the item to inventory
              this.inventory.addItem(loc.item.name);

              // 2. Mark location as checked LOCALLY only
              this.checkedLocations.add(loc.name);

              // 3. Set flags for UI refresh
              newEventCollected = true;

              // 4. Log for debugging
              if (this.debugMode) {
                console.log(
                  `Auto-collected event item: ${loc.item.name} from ${loc.name}`
                );
              }

              // 5. Notify UI of changes (both inventory and location)
              this.notifyUI('inventoryChanged');
              this.notifyUI('locationChecked');
            }
          }
        }

        // If any new regions or events were found, continue searching
        if (newlyReachable || newEventCollected) {
          continue;
        }

        // When no more progress is made, we're done
        break;
      }

      // Finalize unreachable regions set
      this.knownUnreachableRegions = new Set(
        Object.keys(this.regions).filter(
          (region) => !this.knownReachableRegions.has(region)
        )
      );

      this.cacheValid = true;
    } finally {
      this._computing = false;
    }

    this.notifyUI('reachableRegionsComputed');
    return this.knownReachableRegions;
  }

  /**
   * Run a single BFS pass to find reachable regions
   * Implements Python's _update_reachable_regions_auto_indirect_conditions approach
   */
  runBFSPass() {
    let newRegionsFound = false;

    // Exactly match Python's nested loop structure
    let newConnection = true;
    while (newConnection) {
      newConnection = false;

      let queue = [...this.blockedConnections];
      while (queue.length > 0) {
        const connection = queue.shift();
        const { fromRegion, exit } = connection;
        const targetRegion = exit.connected_region;

        // Skip if the target region is already reachable
        if (this.knownReachableRegions.has(targetRegion)) {
          this.blockedConnections.delete(connection);
          continue;
        }

        // Check if exit is traversable
        const canTraverse = !exit.access_rule || evaluateRule(exit.access_rule);

        if (canTraverse) {
          // Region is now reachable
          this.knownReachableRegions.add(targetRegion);
          newRegionsFound = true;
          newConnection = true; // Signal that we found a new connection

          // Remove from blocked connections
          this.blockedConnections.delete(connection);

          // Record the path taken to reach this region
          this.path.set(targetRegion, {
            name: targetRegion,
            entrance: exit.name,
            previousRegion: fromRegion,
          });

          // Add all exits from the newly reachable region
          const region = this.regions[targetRegion];
          if (region && region.exits) {
            for (const newExit of region.exits) {
              const newConnection = {
                fromRegion: targetRegion,
                exit: newExit,
              };
              this.blockedConnections.add(newConnection);
              queue.push(newConnection);
            }
          }

          // Check for indirect connections affected by this region
          if (this.indirectConnections.has(targetRegion)) {
            for (const indirectExit of this.indirectConnections.get(
              targetRegion
            )) {
              // Only process if the exit's source region is reachable
              if (this.knownReachableRegions.has(indirectExit.fromRegion)) {
                queue.push(indirectExit);
              }
            }
          }
        }
      }

      // Python equivalent: queue.extend(blocked_connections)
      // We've finished the current queue, next iteration will recheck all blocked connections
      if (this.debugMode && newConnection) {
        this._logDebug(
          'BFS pass: Found new regions, rechecking blocked connections'
        );
      }
    }

    return newRegionsFound;
  }

  /**
   * Evaluate a rule with awareness of the current path context
   * This is no longer needed with our new BFS approach, but kept for backwards
   * compatibility with the rest of the code
   */
  evaluateRuleWithPathContext(rule, context) {
    // Standard rule evaluation is now sufficient with our improved BFS
    return evaluateRule(rule);
  }

  getStartRegions() {
    // Get start regions from state object if available, or use default
    if (this.state && this.state.startRegions) {
      return this.state.startRegions;
    }
    return ['Menu'];
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
    return !location.access_rule || evaluateRule(location.access_rule);
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

  /**
   * Get the path used to reach a region
   * Similar to Python's get_path method
   */
  getPathToRegion(regionName) {
    if (!this.knownReachableRegions.has(regionName)) {
      return null; // Region not reachable
    }

    // Build path by following previous regions
    const pathSegments = [];
    let currentRegion = regionName;

    while (currentRegion) {
      const pathEntry = this.path.get(currentRegion);
      if (!pathEntry) break;

      // Add this segment
      pathSegments.unshift({
        from: pathEntry.previousRegion,
        entrance: pathEntry.entrance,
        to: currentRegion,
      });

      // Move to previous region
      currentRegion = pathEntry.previousRegion;
    }

    return pathSegments;
  }

  /**
   * Get all path info for debug/display purposes
   */
  getAllPaths() {
    const paths = {};

    for (const region of this.knownReachableRegions) {
      paths[region] = this.getPathToRegion(region);
    }

    return paths;
  }

  /**
   * Updates the inventory with multiple items at once
   */
  updateInventoryFromList(items) {
    this.beginBatchUpdate();
    items.forEach((item) => {
      this.addItemToInventory(item);
    });
    this.commitBatchUpdate();
  }

  /**
   * Initialize the inventory with a specific set of items for testing
   */
  initializeInventoryForTest(requiredItems = [], excludedItems = []) {
    this.clearState(); // Use clearState instead of clearInventory

    // Begin batch updates
    this.beginBatchUpdate(true);

    // Handle excludedItems by using itempool_counts
    if (excludedItems?.length > 0) {
      // Check if we have itempool_counts data directly on the stateManager
      if (this.itempool_counts) {
        //console.log(
        //  'Using itempool_counts data for test inventory:',
        //  this.itempool_counts
        //);

        // Process special maximum values first to ensure state is properly configured
        if (this.itempool_counts['__max_progressive_bottle']) {
          this.state.difficultyRequirements.progressive_bottle_limit =
            this.itempool_counts['__max_progressive_bottle'];
        }
        if (this.itempool_counts['__max_boss_heart_container']) {
          this.state.difficultyRequirements.boss_heart_container_limit =
            this.itempool_counts['__max_boss_heart_container'];
        }
        if (this.itempool_counts['__max_heart_piece']) {
          this.state.difficultyRequirements.heart_piece_limit =
            this.itempool_counts['__max_heart_piece'];
        }

        // Add items based on their counts from the pool
        Object.entries(this.itempool_counts).forEach(([itemName, count]) => {
          // Skip special max values that start with __
          if (itemName.startsWith('__')) return;

          // Skip excluded items
          if (excludedItems.includes(itemName)) return;

          // Skip bottles if AnyBottle is excluded
          if (
            itemName.includes('Bottle') &&
            excludedItems.includes('AnyBottle')
          )
            return;

          // Skip event items
          if (
            this.inventory.itemData[itemName]?.event ||
            this.inventory.itemData[itemName]?.type === 'Event'
          ) {
            return;
          }

          // Add the correct count of each item
          for (let i = 0; i < count; i++) {
            this.addItemToInventory(itemName);
          }
        });
      } else {
        console.warn(
          'No itempool_counts data available, falling back to default behavior'
        );
        // Fallback to original behavior if itempool_counts not available
        Object.keys(this.inventory.itemData).forEach((itemName) => {
          if (
            !excludedItems.includes(itemName) &&
            !(
              itemName.includes('Bottle') && excludedItems.includes('AnyBottle')
            ) &&
            !this.inventory.itemData[itemName].event &&
            this.inventory.itemData[itemName].type !== 'Event'
          ) {
            this.addItemToInventory(itemName);
          }
        });
      }
    }

    this.commitBatchUpdate();

    // Handle progressive items for exclusions
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

    // Add required items in second batch
    this.beginBatchUpdate(true);
    requiredItems.forEach((itemName) => {
      this.addItemToInventory(itemName);
      if (this.state?.processEventItem) {
        this.state.processEventItem(itemName);
      }
    });
    this.commitBatchUpdate();

    // Update regions and UI
    this.invalidateCache();
    this.computeReachableRegions();
    this.notifyUI('inventoryChanged');
  }

  /**
   * Check if a location has been marked as checked
   */
  isLocationChecked(locationName) {
    return this.checkedLocations.has(locationName);
  }

  /**
   * Mark a location as checked
   */
  checkLocation(locationName) {
    this.checkedLocations.add(locationName);
    this.notifyUI('locationChecked');

    // Also emit to eventBus for ProgressUI
    try {
      if (eventBus) {
        eventBus.publish(`stateManager:locationChecked`, {});
      }
    } catch (e) {
      console.warn('Could not publish to eventBus:', e);
    }
  }

  /**
   * Clear all checked locations
   */
  clearCheckedLocations() {
    this.checkedLocations.clear();
  }

  /**
   * Start a batch update to collect inventory changes without triggering UI updates
   * @param {boolean} deferRegionComputation - Whether to defer region computation until commit
   */
  beginBatchUpdate(deferRegionComputation = true) {
    this._batchMode = true;
    this._deferRegionComputation = deferRegionComputation;
    this._batchedUpdates = new Map();
  }

  /**
   * Commit a batch update and process all collected inventory changes
   */
  commitBatchUpdate() {
    if (!this._batchMode) {
      return; // Not in batch mode, nothing to do
    }

    // Process all batched updates
    for (const [itemName, count] of this._batchedUpdates.entries()) {
      const existingCount = this.inventory.count(itemName);
      const diff = count - existingCount;

      for (let i = 0; i < diff; i++) {
        this.inventory.addItem(itemName);
      }
    }

    this._batchMode = false;
    this._deferRegionComputation = false;
    this._batchedUpdates = new Map();

    // Invalidate and recompute after batch commit
    this.invalidateCache();
    this.computeReachableRegions(); // This will notify UI via 'reachableRegionsComputed'
  }

  /**
   * Log debug information during region accessibility calculations
   * @private
   */
  _logDebug(message, data = null) {
    if (this.debugMode) {
      const timestamp = new Date().toISOString().slice(11, 23); // Get time in HH:MM:SS.mmm format
      const logMsg = `[StateManager ${timestamp}] ${message}`;

      if (data !== null) {
        if (typeof data === 'object' && data !== null) {
          // For objects, provide more readable format
          if (data instanceof Set) {
            console.log(logMsg, [...data]);
          } else if (data instanceof Map) {
            console.log(logMsg, Object.fromEntries([...data]));
          } else {
            // For any other object
            console.log(logMsg, JSON.parse(JSON.stringify(data)));
          }
        } else {
          // For primitives
          console.log(logMsg, data);
        }
      } else {
        console.log(logMsg);
      }

      // In ultra verbose mode, also log stack trace for certain messages
      if (
        this.debugMode === 'ultra' &&
        (message.includes('reachable') || message.includes('path'))
      ) {
        console.trace(logMsg);
      }
    }
  }

  /**
   * Helper method to execute a state method by name
   */
  executeStateMethod(method, ...args) {
    // For consistency, we should check multiple places systematically

    // 1. Check if it's a direct method on stateManager
    if (typeof this[method] === 'function') {
      return this[method](...args);
    }

    // 2. Check special case for can_reach since it's commonly used
    if (method === 'can_reach' && args.length >= 1) {
      const targetName = args[0];
      const targetType = args[1] || 'Region';
      const player = args[2] || 1;
      return this.can_reach(targetName, targetType, player);
    }

    // 3. Look in helpers - handle both underscore and non-underscore versions
    // Some helper methods might be defined with leading underscores
    if (this.helpers) {
      // Try exact method name first
      if (typeof this.helpers[method] === 'function') {
        return this.helpers[method](...args);
      }

      // If method starts with underscore and no match found, try without underscore
      if (
        method.startsWith('_') &&
        typeof this.helpers[method.substring(1)] === 'function'
      ) {
        return this.helpers[method.substring(1)](...args);
      }

      // If method doesn't start with underscore, try with underscore
      if (
        !method.startsWith('_') &&
        typeof this.helpers['_' + method] === 'function'
      ) {
        return this.helpers['_' + method](...args);
      }
    }

    // 4. Check in state object if helpers didn't have the method
    if (this.state && typeof this.state[method] === 'function') {
      return this.state[method](...args);
    }

    // Log failure in debug mode
    if (this.debugMode) {
      console.log(`Unknown state method: ${method}`, {
        args: args,
        stateManagerHas: typeof this[method] === 'function',
        helpersHas: this.helpers
          ? typeof this.helpers[method] === 'function' ||
            (method.startsWith('_') &&
              typeof this.helpers[method.substring(1)] === 'function') ||
            (!method.startsWith('_') &&
              typeof this.helpers['_' + method] === 'function')
          : false,
        stateHas: this.state ? typeof this.state[method] === 'function' : false,
      });
    }

    return false;
  }

  /**
   * Implementation of can_reach state method that mirrors Python
   */
  can_reach(region, type = 'Region', player = 1) {
    // The context-aware state manager handles position-specific constraints correctly
    if (type === 'Region') {
      return this.isRegionReachable(region);
    } else if (type === 'Location') {
      // Find the location object
      const location = this.locations.find((loc) => loc.name === region);
      return location && this.isLocationAccessible(location);
    } else if (type === 'Entrance') {
      // Find the entrance across all regions
      for (const regionName in this.regions) {
        const regionData = this.regions[regionName];
        if (regionData.exits) {
          const exit = regionData.exits.find((e) => e.name === region);
          if (exit) {
            return (
              this.isRegionReachable(regionName) &&
              (!exit.access_rule || evaluateRule(exit.access_rule))
            );
          }
        }
      }
      return false;
    }

    return false;
  }

  /**
   * Set debug mode for detailed logging
   * @param {boolean|string} mode - true for basic debug, 'ultra' for verbose, false to disable
   */
  setDebugMode(mode) {
    this.debugMode = mode;
    this._logDebug(`Debug mode set to: ${mode}`);
  }

  /**
   * Debug specific critical regions to understand evaluation discrepancies
   */
  debugCriticalRegions() {
    // List of regions that are causing issues
    const criticalRegions = [
      'Pyramid Fairy',
      'Big Bomb Shop',
      'Inverted Big Bomb Shop',
    ];

    console.log('============ CRITICAL REGIONS DEBUG ============');

    // Log the current inventory state
    console.log('Current inventory:');
    const inventoryItems = [];
    this.inventory.items.forEach((count, item) => {
      if (count > 0) {
        inventoryItems.push(`${item} (${count})`);
      }
    });
    console.log(inventoryItems.join(', '));

    // Check each critical region
    criticalRegions.forEach((regionName) => {
      const region = this.regions[regionName];
      if (!region) {
        console.log(`Region "${regionName}" not found in loaded regions`);
        return;
      }

      console.log(`\nAnalyzing "${regionName}":`);
      console.log(
        `- Reachable according to stateManager: ${this.isRegionReachable(
          regionName
        )}`
      );

      // Check incoming paths
      console.log(`\nIncoming connections to ${regionName}:`);
      let hasIncomingPaths = false;

      Object.keys(this.regions).forEach((sourceRegionName) => {
        const sourceRegion = this.regions[sourceRegionName];
        if (!sourceRegion || !sourceRegion.exits) return;

        const connectingExits = sourceRegion.exits.filter(
          (exit) => exit.connected_region === regionName
        );

        if (connectingExits.length > 0) {
          hasIncomingPaths = true;
          const sourceReachable = this.isRegionReachable(sourceRegionName);
          console.log(
            `- From ${sourceRegionName} (${
              sourceReachable ? 'REACHABLE' : 'UNREACHABLE'
            }):`
          );

          connectingExits.forEach((exit) => {
            const exitAccessible =
              !exit.access_rule || evaluateRule(exit.access_rule);
            console.log(
              `  - Exit: ${exit.name} (${
                exitAccessible ? 'ACCESSIBLE' : 'BLOCKED'
              })`
            );

            if (exit.access_rule) {
              console.log(
                '    Rule:',
                JSON.stringify(exit.access_rule, null, 2)
              );
              this.debugRuleEvaluation(exit.access_rule);
            }
          });
        }
      });

      if (!hasIncomingPaths) {
        console.log('  No incoming paths found.');
      }

      // Check region's own rules if any
      if (region.region_rules && region.region_rules.length > 0) {
        console.log(
          `\n${regionName} has ${region.region_rules.length} region rules:`
        );
        region.region_rules.forEach((rule, i) => {
          const ruleResult = evaluateRule(rule);
          console.log(`- Rule #${i + 1}: ${ruleResult ? 'PASSES' : 'FAILS'}`);
          this.debugRuleEvaluation(rule);
        });
      }

      // Check path from stateManager
      const path = this.getPathToRegion(regionName);
      if (path && path.length > 0) {
        console.log(`\nPath found to ${regionName}:`);
        path.forEach((segment) => {
          console.log(
            `- ${segment.from} → ${segment.entrance} → ${segment.to}`
          );
        });
      } else {
        console.log(`\nNo path found to ${regionName}`);
      }
    });

    console.log('===============================================');
  }

  /**
   * Debug evaluation of a specific rule
   */
  debugRuleEvaluation(rule, depth = 0) {
    if (!rule) return;

    const indent = '    ' + '  '.repeat(depth);

    switch (rule.type) {
      case 'and':
      case 'or':
        console.log(
          `${indent}${rule.type.toUpperCase()} rule with ${
            rule.conditions.length
          } conditions`
        );
        let allResults = [];
        rule.conditions.forEach((condition, i) => {
          const result = evaluateRule(condition);
          allResults.push(result);
          console.log(
            `${indent}- Condition #${i + 1}: ${result ? 'PASS' : 'FAIL'}`
          );
          this.debugRuleEvaluation(condition, depth + 1);
        });

        if (rule.type === 'and') {
          console.log(
            `${indent}AND result: ${
              allResults.every((r) => r) ? 'PASS' : 'FAIL'
            }`
          );
        } else {
          console.log(
            `${indent}OR result: ${allResults.some((r) => r) ? 'PASS' : 'FAIL'}`
          );
        }
        break;

      case 'item_check':
        const hasItem = this.inventory.has(rule.item);
        console.log(
          `${indent}ITEM CHECK: ${rule.item} - ${hasItem ? 'HAVE' : 'MISSING'}`
        );
        break;

      case 'count_check':
        const count = this.inventory.count(rule.item);
        console.log(
          `${indent}COUNT CHECK: ${rule.item} (${count}) >= ${rule.count} - ${
            count >= rule.count ? 'PASS' : 'FAIL'
          }`
        );
        break;

      case 'helper':
        const helperResult = this.helpers.executeHelper(
          rule.name,
          ...(rule.args || [])
        );
        console.log(
          `${indent}HELPER: ${rule.name}(${JSON.stringify(rule.args)}) - ${
            helperResult ? 'PASS' : 'FAIL'
          }`
        );
        break;

      case 'state_method':
        const methodResult = this.helpers.executeStateMethod(
          rule.method,
          ...(rule.args || [])
        );
        console.log(
          `${indent}STATE METHOD: ${rule.method}(${JSON.stringify(
            rule.args
          )}) - ${methodResult ? 'PASS' : 'FAIL'}`
        );

        // Special debug for can_reach which is often the source of problems
        if (rule.method === 'can_reach' && rule.args && rule.args.length > 0) {
          const targetRegion = rule.args[0];
          const targetType = rule.args[1] || 'Region';

          if (targetType === 'Region') {
            console.log(
              `${indent}  -> Checking can_reach for region "${targetRegion}": ${
                this.isRegionReachable(targetRegion)
                  ? 'REACHABLE'
                  : 'UNREACHABLE'
              }`
            );
          }
        }
        break;

      default:
        console.log(
          `${indent}${rule.type} - ${evaluateRule(rule) ? 'PASS' : 'FAIL'}`
        );
    }
  }

  /**
   * Get an item ID from its name
   * @param {string} itemName - Name of the item
   * @returns {number|null} - The item ID or null if not found
   */
  getItemId(itemName) {
    return this.itemNameToId[itemName] ?? null;
  }

  /**
   * Get an item name from its ID
   * @param {number} itemId - ID of the item
   * @returns {string|null} - The item name or null if not found
   */
  getItemNameFromId(itemId) {
    // Look up name by ID
    for (const [name, id] of Object.entries(this.itemNameToId)) {
      if (id === itemId) {
        return name;
      }
    }
    return null;
  }

  /**
   * Get a location ID from its name
   * @param {string} locationName - Name of the location
   * @returns {number|null} - The location ID or null if not found
   */
  getLocationId(locationName) {
    return this.locationNameToId[locationName] ?? null;
  }

  /**
   * Get a location name from its ID
   * @param {number} locationId - ID of the location
   * @returns {string|null} - The location name or null if not found
   */
  getLocationNameFromId(locationId) {
    // Look up name by ID
    for (const [name, id] of Object.entries(this.locationNameToId)) {
      if (id === locationId) {
        return name;
      }
    }
    return null;
  }
}
