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
    this.helpers = new ALTTPHelpers(this);

    // Injected dependencies
    this.eventBus = null;

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

    console.log('[StateManager Class] Instance created.'); // Log instance creation
  }

  /**
   * Sets the event bus instance dependency.
   * @param {object} eventBusInstance - The application's event bus.
   */
  setEventBus(eventBusInstance) {
    console.log('[StateManager Class] Setting EventBus instance...');
    this.eventBus = eventBusInstance;
  }

  /**
   * Initializes inventory with loaded game data
   */
  initializeInventory(items, progressionMapping, itemData) {
    this.inventory = new ALTTPInventory(items, progressionMapping, itemData);
    this.itemData = itemData; // Store for convenience
    // Do not publish here, wait for full rules load
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
      if (this.eventBus) {
        this.eventBus.publish(`stateManager:${eventType}`, {});
      }
    } catch (e) {
      console.warn('Could not publish to eventBus:', e);
    }
  }

  clearInventory() {
    const progressionMapping = this.inventory.progressionMapping || {};
    const itemData = this.inventory.itemData || {};
    const groupData = this.inventory.groupData || {};
    this.inventory = new ALTTPInventory([], progressionMapping, itemData);
    this.inventory.groupData = groupData;
    this.itemData = itemData;
    this.groupData = groupData;
    this._logDebug('[StateManager Class] Inventory cleared.');
    this.invalidateCache();
    this.computeReachableRegions(); // Recompute first
    this._publishEvent('inventoryChanged'); // Publish after recompute
  }

  clearState() {
    const progressionMapping = this.inventory.progressionMapping || {};
    const itemData = this.inventory.itemData || {};
    const groupData = this.inventory.groupData || {};
    this.inventory = new ALTTPInventory([], progressionMapping, itemData);
    this.inventory.groupData = groupData;
    this.itemData = itemData;
    this.groupData = groupData;
    this.state = new ALTTPState();
    this.clearCheckedLocations(); // This calls _publishEvent('checkedLocationsCleared')
    this.indirectConnections = new Map();
    this.invalidateCache();
    this._logDebug('[StateManager Class] Full state cleared.');
    this._publishEvent('inventoryChanged'); // Publish inventory change after state clear
  }

  /**
   * Adds an item and notifies all registered callbacks
   */
  addItemToInventory(itemName) {
    if (!this.itemData || !this.itemData[itemName]) {
      console.warn(
        `[StateManager Class] Attempted to add unknown item: ${itemName}`
      );
      return false;
    }
    if (this._batchMode) {
      const currentCount =
        this._batchedUpdates.get(itemName) || this.inventory.count(itemName);
      this._batchedUpdates.set(itemName, currentCount + 1);
    } else {
      this.inventory.addItem(itemName);
      this._logDebug(`[StateManager Class] Added item: ${itemName}`);
      this.invalidateCache();
      this.computeReachableRegions(); // Recompute first
      this._publishEvent('inventoryChanged'); // Publish after recompute
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
    this._logDebug(
      `[StateManager Class] Loading JSON for player ${selectedPlayerId}...`
    );
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
    const playerData = {
      regions: jsonData.regions?.[selectedPlayerId],
      itemData: jsonData.items?.[selectedPlayerId],
      groupData: jsonData.item_groups?.[selectedPlayerId],
      progressionMapping: jsonData.progression_mapping?.[selectedPlayerId],
      itempoolCounts: jsonData.itempool_counts?.[selectedPlayerId],
      settings: jsonData.settings?.[selectedPlayerId],
      startRegions: jsonData.start_regions?.[selectedPlayerId],
      mode: jsonData.mode?.[selectedPlayerId],
    };

    if (
      !playerData.regions ||
      !playerData.itemData ||
      !playerData.groupData ||
      !playerData.progressionMapping ||
      !playerData.settings
    ) {
      throw new Error('Invalid player data format');
    }

    this.regions = playerData.regions;
    this.itemData = playerData.itemData;
    this.groupData = playerData.groupData;
    this.settings = playerData.settings;
    this.startRegions = playerData.startRegions;
    this.mode = playerData.mode;
    this.itempool_counts = playerData.itempoolCounts;

    // Create a map of item names to IDs for fast lookup (using selected player's items)
    this.itemNameToId = {};
    if (this.itemData) {
      Object.entries(this.itemData).forEach(([itemName, data]) => {
        if (data.id !== undefined && data.id !== null) {
          this.itemNameToId[itemName] = data.id;
          if (this.inventory.itemData[itemName]) {
            this.inventory.itemData[itemName].id = data.id;
          }
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
      this.inventory.progressionMapping = this.progressionMapping;
      this.inventory.itemData = this.itemData;
      this.inventory.groupData = this.groupData;

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
      this.state.loadSettings(this.settings);

      // Pass shop data (assuming shops might be player-specific or need filtering later)
      this.state.loadShops(shops);

      // Store game mode in state for the selected player
      if (this.mode) {
        this.state.gameMode = this.mode;
      }

      // Store start regions in state for the selected player
      if (this.startRegions && this.startRegions.length > 0) {
        this.state.startRegions = [...this.startRegions];
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
        if (this.eventBus) {
          console.log('Publishing stateManager:jsonDataLoaded event');
          this.eventBus.publish('stateManager:jsonDataLoaded', {});
          // Publish ready event immediately after data loaded event (within timeout)
          console.log('Publishing stateManager:ready event (delayed)');
          this.eventBus.publish('stateManager:ready', {
            playerSlot: this.playerSlot,
          });
        }
      }, 0);
    } catch (e) {
      console.warn('Could not publish jsonDataLoaded event:', e);
    }

    this._logDebug('[StateManager Class] Finished processing JSON load.');

    // Publish rulesLoaded *after* processing and initial computation
    this._publishEvent('rulesLoaded', {
      source: 'jsonData',
      selectedPlayerId: selectedPlayerId,
      rules: {
        items: this.itemData,
        groups: this.groupData,
      },
    });

    // Notify listeners that the core data structure is loaded
    this._publishEvent('jsonDataLoaded');

    // Notify that the manager is ready (potentially after a short delay)
    setTimeout(() => {
      if (this.eventBus) {
        console.log('Publishing stateManager:ready event');
        this.eventBus.publish('stateManager:ready', {
          playerSlot: this.playerSlot,
        });
      }
    }, 0);

    return true;
  }

  /**
   * Build indirect connections map similar to Python implementation
   * Identifies exits that depend on regions in their access rules
   */
  buildIndirectConnections() {
    this.indirectConnections.clear();
    if (!this.regions) return;
    Object.values(this.regions).forEach((region) => {
      region.exits.forEach((exit) => {
        if (exit.rule) {
          const dependencies = this.findRegionDependencies(exit.rule);
          dependencies.forEach((depRegionName) => {
            if (!this.indirectConnections.has(depRegionName)) {
              this.indirectConnections.set(depRegionName, new Set());
            }
            if (exit.name) {
              this.indirectConnections.get(depRegionName).add(exit.name);
            }
          });
        }
      });
    });
  }

  /**
   * Find regions that a rule depends on through can_reach state methods
   */
  findRegionDependencies(rule) {
    const dependencies = new Set();
    if (!rule) return dependencies;
    if (typeof rule === 'string') {
      if (this.regions && this.regions[rule]) {
        dependencies.add(rule);
      } else {
        const match = rule.match(/@helper\/[^\(]+\(([^\)]+)\)/);
        if (match && match[1]) {
          const args = match[1].split(/,\s*/);
          args.forEach((arg) => {
            const cleanArg = arg.replace(/['"]/g, '');
            if (this.regions && this.regions[cleanArg]) {
              dependencies.add(cleanArg);
            }
          });
        }
      }
    } else if (Array.isArray(rule)) {
      rule.forEach((subRule) => {
        this.findRegionDependencies(subRule).forEach((dep) =>
          dependencies.add(dep)
        );
      });
    } else if (typeof rule === 'object') {
      Object.values(rule).forEach((subRule) => {
        this.findRegionDependencies(subRule).forEach((dep) =>
          dependencies.add(dep)
        );
      });
    }
    return dependencies;
  }

  invalidateCache() {
    this.cacheValid = false;
    this.knownReachableRegions.clear();
    this.knownUnreachableRegions.clear();
    this.path = new Map();
    this.blockedConnections = new Set();
    this._logDebug('[StateManager Instance] Cache invalidated.');
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

    // this.notifyUI('reachableRegionsComputed'); // Removed redundant call
    this._publishEvent('regionsComputed', {
      knownReachableRegions: this.knownReachableRegions,
    }); // Publish event here with data
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
        const targetRegion = exit.connected_region; // Use connected_region consistently

        // Skip if the target region is already reachable
        if (this.knownReachableRegions.has(targetRegion)) {
          this.blockedConnections.delete(connection);
          continue;
        }

        // Skip if the source region isn't reachable (important check)
        if (!this.knownReachableRegions.has(fromRegion)) {
          continue;
        }

        // Check if exit is traversable using evaluateRule
        const canTraverse = !exit.access_rule || evaluateRule(exit.access_rule);

        if (canTraverse) {
          // Region is now reachable
          this.knownReachableRegions.add(targetRegion);
          newRegionsFound = true;
          newConnection = true; // Signal that we found a new connection

          // Remove from blocked connections
          this.blockedConnections.delete(connection);

          // Record the path taken to reach this region
          if (!this.path.has(targetRegion)) {
            // Only set path if not already set
            this.path.set(targetRegion, {
              name: targetRegion,
              entrance: exit.name,
              previousRegion: fromRegion,
            });
          }

          // Add all exits from the newly reachable region to blockedConnections (if not already processed)
          const region = this.regions[targetRegion];
          if (region && region.exits) {
            for (const newExit of region.exits) {
              // Ensure the target of the new exit exists
              if (
                newExit.connected_region &&
                this.regions[newExit.connected_region]
              ) {
                const newConnObj = {
                  fromRegion: targetRegion,
                  exit: newExit,
                };
                // Avoid adding duplicates or exits leading to already reachable regions
                if (!this.knownReachableRegions.has(newExit.connected_region)) {
                  let alreadyBlocked = false;
                  for (const blocked of this.blockedConnections) {
                    if (
                      blocked.fromRegion === newConnObj.fromRegion &&
                      blocked.exit.name === newConnObj.exit.name
                    ) {
                      alreadyBlocked = true;
                      break;
                    }
                  }
                  if (!alreadyBlocked) {
                    this.blockedConnections.add(newConnObj);
                    queue.push(newConnObj); // Add to the current pass queue
                  }
                }
              }
            }
          }

          // Check for indirect connections affected by this region
          if (this.indirectConnections.has(targetRegion)) {
            // Use the indirect connections structure which maps region -> set of EXIT NAMES
            const affectedExitNames =
              this.indirectConnections.get(targetRegion);
            affectedExitNames.forEach((exitName) => {
              // Find the actual connection object in blockedConnections using the exit name
              for (const blockedConn of this.blockedConnections) {
                if (blockedConn.exit.name === exitName) {
                  // Re-add this connection to the queue to re-evaluate it,
                  // but only if its source region is reachable.
                  if (this.knownReachableRegions.has(blockedConn.fromRegion)) {
                    queue.push(blockedConn);
                  }
                  break; // Found the connection, move to next affected exit name
                }
              }
            });
          }
        }
      }
      // Python equivalent: queue.extend(blocked_connections)
      // We've finished the current queue, next iteration will recheck all remaining blocked connections
      if (this.debugMode && newConnection) {
        this._logDebug(
          'BFS pass: Found new regions/connections, rechecking blocked connections'
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
    if (!this.checkedLocations.has(locationName)) {
      this.checkedLocations.add(locationName);
      this._logDebug(`[StateManager Class] Checked location: ${locationName}`);
      const location = this.locations.find((loc) => loc.name === locationName);
      // Publish event AFTER adding to the set
      this._publishEvent('locationChecked', {
        locationName: locationName,
        regionName: location?.region,
      });
    }
  }

  /**
   * Clear all checked locations
   */
  clearCheckedLocations() {
    if (this.checkedLocations.size > 0) {
      this.checkedLocations.clear();
      this._logDebug('[StateManager Class] Cleared checked locations.');
      // Publish event AFTER clearing
      this._publishEvent('checkedLocationsCleared');
    }
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

    this._logDebug('[StateManager Class] Committing batch update...');
    this._batchMode = false;
    let inventoryChanged = false;

    // Process all batched updates
    for (const [itemName, count] of this._batchedUpdates.entries()) {
      const existingCount = this.inventory.count(itemName);
      const diff = count - existingCount;

      if (diff > 0) {
        for (let i = 0; i < diff; i++) {
          this.inventory.addItem(itemName);
        }
        inventoryChanged = true;
      } else if (diff < 0) {
        console.warn(`Batch commit needs inventory.removeItem for ${itemName}`);
      }
    }

    this._batchedUpdates.clear();

    if (inventoryChanged) {
      this._logDebug('Inventory changed during batch update.');
      this.invalidateCache();
    }
    if (!this._deferRegionComputation || inventoryChanged) {
      this._logDebug('Recomputing regions after batch commit.');
      this.computeReachableRegions(); // Recompute regions first
    }
    // Publish inventoryChanged *after* recomputation, only if it actually changed
    if (inventoryChanged) {
      this._publishEvent('inventoryChanged');
    }
    this._logDebug('[StateManager Class] Batch update committed.');
  }

  /**
   * Log debug information during region accessibility calculations
   * @private
   */
  _logDebug(message, data = null) {
    if (this.debugMode) {
      if (data) {
        try {
          const clonedData = JSON.parse(JSON.stringify(data));
          console.debug(message, clonedData);
        } catch (e) {
          console.debug(message, '[Could not clone data]', data);
        }
      } else {
        console.debug(message);
      }
    }
  }

  /**
   * Notifies listeners via the event bus.
   */
  _publishEvent(eventType, eventData = {}) {
    // Publish state changes to the event bus if available
    if (this.eventBus) {
      try {
        this.eventBus.publish(`stateManager:${eventType}`, eventData);
        this._logDebug(`[StateManager Class] Published ${eventType} event.`);
      } catch (error) {
        console.error(
          `[StateManager Class] Error publishing ${eventType} event:`,
          error
        );
      }
    } else {
      console.warn(
        `[StateManager Class] Event bus not available to publish ${eventType}.`
      );
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
    if (player !== this.playerSlot) {
      this._logDebug(`can_reach check for wrong player (${player})`);
      return false;
    }
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
