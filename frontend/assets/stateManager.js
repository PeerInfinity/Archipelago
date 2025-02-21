import { evaluateRule } from './ruleEngine.js';
import { ALTTPInventory } from './games/alttp/inventory.js';

/**
 * Manages game state including inventory and reachable regions/locations.
 * Handles automatic collection of event items when their locations become accessible.
 * All state (including events) is tracked through the inventory system.
 */
export class StateManager {
  constructor() {
    // Core state storage
    this.inventory = new ALTTPInventory();

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
  }

  /**
   * Initializes inventory with loaded game data
   */
  initializeInventory(items, excludeItems, progressionMapping, itemData) {
    this.inventory = new ALTTPInventory(
      items,
      excludeItems,
      progressionMapping,
      itemData
    );
  }

  clearInventory() {
    this.inventory = new ALTTPInventory();
  }

  clearState() {
    this.inventory = new ALTTPInventory();
    this.invalidateCache();
  }

  addItemToInventory(itemName) {
    this.inventory.addItem(itemName);
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
    this.regions = jsonData.regions['1'];
    this.itemData = jsonData.items['1'];
    this.groupData = jsonData.item_groups['1'];
    this.progressionMapping = jsonData.progression_mapping['1'];
    this.mode = jsonData.mode?.['1'];
    this.settings = jsonData.settings?.['1'];
    this.startRegions = jsonData.start_regions?.['1'];
    this.locations = [];
    this.eventLocations.clear();
    Object.values(this.regions).forEach((region) => {
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
    this.invalidateCache();
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
  computeReachableRegions(inventory) {
    if (this.cacheValid) {
      return this.knownReachableRegions;
    }

    let finalReachableRegions = new Set(this.knownReachableRegions);
    let newEventCollected = true;

    // Keep checking regions until no new events are collected
    while (newEventCollected) {
      newEventCollected = false;
      const reachableSet = this.runSingleBFS(inventory);

      // Auto-collect events in reachable locations
      for (const loc of this.eventLocations.values()) {
        if (reachableSet.has(loc.region)) {
          const canAccessLoc = evaluateRule(loc.access_rule, inventory);
          if (canAccessLoc && !inventory.has(loc.item.name)) {
            this.addItemToInventory(loc.item.name);
            console.log(`Collected event item: ${loc.item.name}`);
            newEventCollected = true;
          }
        }
      }

      finalReachableRegions = new Set([
        ...finalReachableRegions,
        ...reachableSet,
      ]);
    }

    // Cache results
    this.knownReachableRegions = finalReachableRegions;
    this.knownUnreachableRegions = new Set(
      Object.keys(this.regions).filter(
        (region) => !finalReachableRegions.has(region)
      )
    );
    this.cacheValid = true;

    return finalReachableRegions;
  }

  getStartRegions() {
    // Return an array of start region names, default to 'Menu'
    if (!this.startRegions || !Array.isArray(this.startRegions)) {
      return ['Menu'];
    }
    return this.startRegions;
  }

  /**
   * Single pass of breadth-first search to find reachable regions
   */
  runSingleBFS(inventory) {
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
        if (exit.access_rule && !evaluateRule(exit.access_rule, inventory)) {
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
        if (
          entrance.access_rule &&
          !evaluateRule(entrance.access_rule, inventory)
        ) {
          continue;
        }
        reachable.add(entrance.connected_region);
        queue.push(entrance.connected_region);
      }
    }
    return reachable;
  }

  isRegionReachable(regionName, inventory) {
    const reachableRegions = this.computeReachableRegions(inventory);
    return reachableRegions.has(regionName);
  }

  isLocationAccessible(location, inventory) {
    const reachableRegions = this.computeReachableRegions(inventory);
    if (!reachableRegions.has(location.region)) {
      return false;
    }

    // Simply return the rule evaluation result
    // Don't auto-collect events here since computeReachableRegions handles that
    return evaluateRule(location.access_rule, inventory);
  }

  getProcessedLocations(
    inventory,
    sorting = 'original',
    showReachable = true,
    showUnreachable = true
  ) {
    return this.locations
      .slice()
      .sort((a, b) => {
        if (sorting === 'accessibility') {
          const aAccessible = this.isLocationAccessible(a, inventory);
          const bAccessible = this.isLocationAccessible(b, inventory);
          return bAccessible - aAccessible;
        }
        return 0;
      })
      .filter((location) => {
        const isAccessible = this.isLocationAccessible(location, inventory);
        return (
          (isAccessible && showReachable) || (!isAccessible && showUnreachable)
        );
      });
  }

  getNewlyReachableLocations(inventory) {
    const currentReachable = new Set(
      this.locations
        .filter((loc) => this.isLocationAccessible(loc, inventory))
        .map((loc) => `${loc.player}-${loc.name}`)
    );
    const newlyReachable = new Set(
      [...currentReachable].filter((x) => !this.previousReachable.has(x))
    );
    this.previousReachable = currentReachable;
    return newlyReachable;
  }
}
