// locationManager.js
import { evaluateRule } from './ruleEngine.js';

export class LocationManager {
  constructor() {
    this.locations = [];
    this.regions = {};
    this.previousReachable = new Set();
    this.mode = null;
    this.settings = null;
    this.startRegions = null;
    this.eventLocations = new Map(); // name -> location
  }

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

    // Convert region-based locations into a flat array
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

        // If location's item is type 'Event', store it for easy reference
        if (locationData.item && locationData.item.type === 'Event') {
          this.eventLocations.set(locationData.name, locationData);
        }
      });
    });
  }

  computeReachableRegions(inventory) {
    let newEventCollected = true;
    let finalReachableRegions = new Set();

    // Repeat BFS until stable
    while (newEventCollected) {
      newEventCollected = false;

      // 1. Run a single BFS pass
      const reachableSet = this.runSingleBFS(inventory);

      // 2. Check all event locations that are in reachable regions
      for (const loc of this.eventLocations.values()) {
        if (reachableSet.has(loc.region)) {
          const canAccessLoc = evaluateRule(loc.access_rule, inventory);
          if (canAccessLoc) {
            const eventName = loc.item.name;
            // If we haven't already collected this event
            if (!inventory.state.hasEvent(eventName)) {
              // Mark it as collected
              inventory.state.setEvent(eventName);
              console.log(`Collected event item: ${eventName}`);

              // We need another pass, because collecting an event
              // can unlock new regions or conditions
              newEventCollected = true;
            }
          }
        }
      }

      finalReachableRegions = reachableSet;
    }

    // Return the final stable set of reachable regions
    return finalReachableRegions;
  }

  runSingleBFS(inventory) {
    const start = this.getStartRegions();
    const reachable = new Set(start);
    const queue = [...start];
    const seenExits = new Set();

    while (queue.length > 0) {
      const currentRegionName = queue.shift();
      const currentRegion = this.regions[currentRegionName];

      if (!currentRegion) continue;

      // Process exits from this region
      for (const exit of currentRegion.exits || []) {
        const exitKey = `${currentRegionName}->${exit.name}`;
        if (seenExits.has(exitKey)) continue;
        seenExits.add(exitKey);

        if (!exit.connected_region) continue;

        // Check if exit can be used
        if (exit.access_rule && !evaluateRule(exit.access_rule, inventory)) {
          continue;
        }

        const targetRegion = exit.connected_region;
        if (!reachable.has(targetRegion)) {
          reachable.add(targetRegion);
          queue.push(targetRegion);
        }
      }

      // Also consider region entrances (some logic uses them)
      for (const entrance of currentRegion.entrances || []) {
        // If the entrance leads to a region that isn't visited
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

  getStartRegions() {
    if (this.startRegions && this.startRegions.default) {
      return this.startRegions.default;
    }
    return ['Menu', 'Links House'];
  }

  isRegionReachable(regionName, inventory) {
    const reachableRegions = this.computeReachableRegions(inventory);
    return reachableRegions.has(regionName);
  }

  isLocationAccessible(location, inventory) {
    // Check if the region is reachable
    const reachableRegions = this.computeReachableRegions(inventory);
    if (!reachableRegions.has(location.region)) {
      return false;
    }

    // Check location's access rule
    const ruleResult = evaluateRule(location.access_rule, inventory);

    // Handle event collection if location is accessible
    if (
      ruleResult &&
      location.item?.type === 'Event' &&
      !inventory.state.hasEvent(location.item.name)
    ) {
      inventory.state.setEvent(location.item.name);
    }

    return ruleResult;
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
