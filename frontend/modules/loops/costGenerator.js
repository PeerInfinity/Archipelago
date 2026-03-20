/**
 * Cost Generator for Loop Mode
 *
 * Generates per-region and per-location mana costs by running an actual
 * playthrough of the sphere log using the real loop game mechanics.
 *
 * The algorithm:
 * 1. Start at start region with max mana, costs initialized to defaults
 * 2. For each sphere log entry (location to check):
 *    a. Find path from start region to target location
 *    b. For each region in path without a cost:
 *       - Calculate cost = floor(currentMana / 2 / uncostedRegionsRemaining)
 *       - Assign to costDataManager BEFORE queuing the action
 *    c. For the location (if no cost assigned):
 *       - Calculate cost = floor(currentMana / 2)
 *       - Assign to costDataManager BEFORE queuing the action
 *    d. Queue actions via dispatcher/playerStateAPI
 *    e. Process through actual loop game mechanics
 *    f. Wait for completion, reset loop
 * 3. Assign default costs to any remaining unvisited regions/locations
 * 4. Output costs.json
 */

import { createUniversalLogger } from '../../app/core/universalLogger.js';
import { centralRegistry } from '../../app/core/centralRegistry.js';
import { DEFAULT_PLAYER_ID } from '../shared/playerIdUtils.js';

const logger = createUniversalLogger('costGenerator');

/**
 * CostGenerator class
 * Generates mana costs by running actual loop game mechanics
 */
export class CostGenerator {
  constructor(dependencies) {
    this.loopState = dependencies.loopState;
    this.stateManager = dependencies.stateManager;
    this.pathFinder = dependencies.pathFinder;
    this.eventBus = dependencies.eventBus;
    this.costDataManager = dependencies.costDataManager;
    this.dispatcher = dependencies.dispatcher;
    this.playerStateAPI = dependencies.playerStateAPI;

    // Generation state
    this.isGenerating = false;
    this.isCancelled = false;

    // Progress tracking
    this.totalEntries = 0;
    this.processedEntries = 0;

    // Track what we've assigned costs to
    this.assignedRegions = new Set();
    this.assignedLocations = new Set();
  }

  /**
   * Generate cost data from sphere log using actual game mechanics
   * @param {Array} sphereLog - Parsed sphere log entries
   * @param {string} sourceFileName - Name of the source file for metadata
   * @returns {Object} Generated cost data
   */
  async generate(sphereLog, sourceFileName = null) {
    if (this.isGenerating) {
      throw new Error('Generation already in progress');
    }

    this.isGenerating = true;
    this.isCancelled = false;
    this.assignedRegions = new Set();
    this.assignedLocations = new Set();

    logger.info('Starting cost generation with actual game mechanics...');

    try {
      // Save current loop state for restoration
      const savedState = this._saveLoopState();

      // Get start region
      const resolvedStartRegions = this.stateManager.getStartRegions?.() || [];
      const startRegion = resolvedStartRegions[0] || this._getFirstRegionFromStaticData();

      // Initialize cost data with defaults
      const costs = {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        generatedFrom: sourceFileName,
        regions: {
          [startRegion]: { moveCost: 0 },
        },
        locations: {},
        defaultRegionCost: 50,
        defaultLocationCost: 10,
      };

      // Mark start region as assigned
      this.assignedRegions.add(startRegion);

      // Load initial costs into costDataManager
      this.costDataManager.setCostData(costs, 'generation-in-progress');
      logger.info(`Using start region: ${startRegion}`);

      // Configure loop state for generation
      this._configureLoopStateForGeneration();

      // Filter to state_update entries with sphere_locations
      const locationEntries = this._extractLocationEntries(sphereLog);
      this.totalEntries = locationEntries.length;
      this.processedEntries = 0;

      logger.info(`Processing ${this.totalEntries} location entries...`);

      // Process each location in sphere order
      for (const entry of locationEntries) {
        if (this.isCancelled) {
          logger.info('Generation cancelled');
          break;
        }

        await this._processLocationEntry(entry, costs, startRegion);
        this.processedEntries++;

        // Publish progress
        this.eventBus?.publish('costGenerator:progress', {
          processed: this.processedEntries,
          total: this.totalEntries,
          percent: Math.floor((this.processedEntries / this.totalEntries) * 100),
        });
      }

      // Assign default costs to unvisited regions/locations
      this._assignDefaultCosts(costs);

      // Update costDataManager with final costs
      this.costDataManager.setCostData(costs, sourceFileName || 'generated');

      // Restore original loop state
      this._restoreLoopState(savedState);

      logger.info('Cost generation complete');
      logger.info(`Generated costs for ${Object.keys(costs.regions).length} regions and ${Object.keys(costs.locations).length} locations`);

      return costs;
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * Cancel ongoing generation
   */
  cancel() {
    if (this.isGenerating) {
      this.isCancelled = true;
      logger.info('Cancellation requested');
    }
  }

  /**
   * Get current progress
   * @returns {Object} Progress info
   */
  getProgress() {
    return {
      isGenerating: this.isGenerating,
      processed: this.processedEntries,
      total: this.totalEntries,
      percent: this.totalEntries > 0
        ? Math.floor((this.processedEntries / this.totalEntries) * 100)
        : 0,
    };
  }

  /**
   * Extract location entries from sphere log
   * @param {Array} sphereLog - Raw sphere log
   * @returns {Array} Flattened list of {sphereIndex, locationName, newRegions}
   */
  _extractLocationEntries(sphereLog) {
    const entries = [];
    const playerId = this._getCurrentPlayerId();

    for (const logEntry of sphereLog) {
      if (logEntry.type !== 'state_update') continue;

      const playerData = logEntry.player_data?.[playerId];
      if (!playerData) continue;

      const sphereLocations = playerData.sphere_locations || [];
      const newRegions = playerData.new_accessible_regions || [];

      // Count items received by this player in this sphere (from any source)
      const baseItems = playerData.new_inventory_details?.base_items || {};
      const itemsReceived = Object.values(baseItems).reduce((sum, count) => sum + count, 0);

      for (let i = 0; i < sphereLocations.length; i++) {
        entries.push({
          sphereIndex: logEntry.sphere_index,
          locationName: sphereLocations[i],
          newAccessibleRegions: newRegions,
          // Grant items received on the last location in the sphere
          itemsReceived: (i === sphereLocations.length - 1) ? itemsReceived : 0,
        });
      }

      // Items received without checking any locations (from other players)
      if (sphereLocations.length === 0 && itemsReceived > 0) {
        entries.push({
          sphereIndex: logEntry.sphere_index,
          locationName: null,
          newAccessibleRegions: newRegions,
          itemsReceived,
        });
      }
    }

    return entries;
  }

  _getCurrentPlayerId() {
    const getIdFn = centralRegistry.getPublicFunction('sphereState', 'getCurrentPlayerId');
    const id = getIdFn?.();
    return id ? String(id) : DEFAULT_PLAYER_ID;
  }

  /**
   * Process a single location entry using actual game mechanics
   * @param {Object} entry - Location entry to process
   * @param {Object} costs - Cost data being built
   * @param {string} startRegion - Starting region for paths
   */
  async _processLocationEntry(entry, costs, startRegion) {
    const { locationName } = entry;

    // Phantom entry: no location to check, just apply mana boost from received items
    if (!locationName) {
      if (entry.itemsReceived > 0) {
        this.loopState.maxMana += entry.itemsReceived * 10;
        this.loopState.currentMana = this.loopState.maxMana;
        logger.debug(`Mana boost from received items: +${entry.itemsReceived * 10} (now ${this.loopState.maxMana})`);
      }
      return;
    }

    // Get location's region from static data
    const staticData = this.stateManager.getStaticData();
    const locationData = staticData?.locations?.get(locationName);

    if (!locationData) {
      // Location not in this game's static data (belongs to another player) — skip
      // but still apply any mana boost from items received
      if (entry.itemsReceived > 0) {
        this.loopState.maxMana += entry.itemsReceived * 10;
        this.loopState.currentMana = this.loopState.maxMana;
      }
      logger.debug(`Skipping location not in this game: ${locationName}`);
      return;
    }

    const targetRegion = locationData.parent_region || locationData.region;
    if (!targetRegion) {
      logger.warn(`No region found for location: ${locationName}`);
      return;
    }

    logger.debug(`Processing: ${locationName} in ${targetRegion}`);

    // Clear the current queue - trim path back to start region
    this.playerStateAPI.trimPath?.(startRegion, 1);

    // Find path from start region to target region
    const path = this.pathFinder.findPathWithExits(startRegion, targetRegion);

    if (!path) {
      logger.warn(`No path found to ${targetRegion} for ${locationName}`);
      return;
    }

    // Identify regions in path without costs
    const uncostedRegions = path.steps
      .map(step => step.region)
      .filter(region => !this.assignedRegions.has(region));

    // Calculate and assign costs to uncosted regions BEFORE queuing
    if (uncostedRegions.length > 0) {
      const manaForRegions = this.loopState.currentMana / 2;
      let remainingUncosted = uncostedRegions.length;

      for (const region of uncostedRegions) {
        const costPerRegion = Math.floor(manaForRegions / remainingUncosted);
        costs.regions[region] = {
          moveCost: Math.max(1, costPerRegion), // Minimum cost of 1
        };
        this.assignedRegions.add(region);
        remainingUncosted--;

        logger.debug(`Assigned region cost: ${region} = ${costPerRegion} (mana: ${this.loopState.currentMana})`);
      }

      // Update costDataManager so the costs are used when actions run
      this.costDataManager.setCostData(costs, 'generation-in-progress');
    }

    // Calculate and assign location cost BEFORE queuing (use half of remaining mana)
    if (!this.assignedLocations.has(locationName)) {
      const locationCost = Math.floor(this.loopState.currentMana / 2);
      costs.locations[locationName] = Math.max(1, locationCost);
      this.assignedLocations.add(locationName);

      logger.debug(`Assigned location cost: ${locationName} = ${locationCost} (mana: ${this.loopState.currentMana})`);

      // Update costDataManager
      this.costDataManager.setCostData(costs, 'generation-in-progress');
    }

    // Queue the path actions using proper user:regionMove events
    let previousRegion = startRegion;
    for (let i = 1; i < path.steps.length; i++) {
      const step = path.steps[i];
      this.dispatcher.publish('loops', 'user:regionMove', {
        sourceRegion: previousRegion,
        targetRegion: step.region,
        exitName: step.exitUsed,
        updatePath: true,
      }, { initialTarget: 'bottom' });
      previousRegion = step.region;
    }

    // Add the location check at the end
    this.playerStateAPI.addLocationCheck?.(locationName, targetRegion);

    // Start processing if not already started
    if (!this.loopState.isProcessing) {
      this.loopState.startProcessing();
    }

    // Wait for the location to be checked
    await this._waitForLocationCheck(locationName);

    // Apply mana boost from items received in this sphere
    if (entry.itemsReceived > 0) {
      this.loopState.maxMana += entry.itemsReceived * 10;
      logger.debug(`Mana boost from received items: +${entry.itemsReceived * 10} (now ${this.loopState.maxMana})`);
    }

    // Reset loop for next entry (refill mana to maxMana, reset action progress)
    this.loopState._resetLoop?.();
    // Unpause after reset
    this.loopState.setPaused(false);

    // Small delay between iterations for stability
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  /**
   * Wait for a location to be checked
   * @param {string} locationName - Location to wait for
   * @returns {Promise<boolean>} True if checked, false if timeout
   */
  async _waitForLocationCheck(locationName) {
    return new Promise((resolve) => {
      let timeout;
      const handler = (data) => {
        const snapshot = data?.snapshot || this.stateManager.getLatestStateSnapshot();
        const isNowChecked = snapshot?.checkedLocations?.includes(locationName);

        if (isNowChecked) {
          clearTimeout(timeout);
          this.eventBus.unsubscribe('stateManager:snapshotUpdated', handler);
          resolve(true);
        }
      };

      this.eventBus.subscribe('stateManager:snapshotUpdated', handler);

      // Safety timeout (5 seconds per location in instant mode should be plenty)
      timeout = setTimeout(() => {
        this.eventBus.unsubscribe('stateManager:snapshotUpdated', handler);
        logger.warn(`Timeout waiting for ${locationName} to be checked`);
        resolve(false);
      }, 5000);
    });
  }

  /**
   * Assign default costs to unvisited regions/locations
   * @param {Object} costs - Cost data being built
   */
  _assignDefaultCosts(costs) {
    const staticData = this.stateManager.getStaticData();

    if (!staticData) return;

    // Find uncosted regions and use highest neighbor cost
    if (staticData.regions) {
      for (const [regionName, regionData] of staticData.regions.entries()) {
        if (!this.assignedRegions.has(regionName)) {
          const neighborCost = this._getHighestNeighborCost(regionName, regionData, costs);
          costs.regions[regionName] = {
            moveCost: neighborCost || costs.defaultRegionCost,
          };
          logger.debug(`Assigned default region cost: ${regionName} = ${neighborCost || costs.defaultRegionCost}`);
        }
      }
    }

    // Find uncosted locations and use highest existing location cost
    if (staticData.locations) {
      const existingCosts = Object.values(costs.locations);
      const maxLocationCost = existingCosts.length > 0
        ? Math.max(costs.defaultLocationCost, ...existingCosts)
        : costs.defaultLocationCost;

      for (const [locationName] of staticData.locations.entries()) {
        if (!this.assignedLocations.has(locationName)) {
          costs.locations[locationName] = maxLocationCost;
        }
      }
    }
  }

  /**
   * Get highest cost of neighboring regions
   * @param {string} regionName - Region to check
   * @param {Object} regionData - Region data with exits
   * @param {Object} costs - Current cost data
   * @returns {number} Highest neighbor cost
   */
  _getHighestNeighborCost(regionName, regionData, costs) {
    let highestCost = 0;

    if (regionData.exits) {
      for (const exit of regionData.exits) {
        const neighborRegion = exit.connected_region;
        const neighborCost = costs.regions[neighborRegion]?.moveCost;
        if (neighborCost && neighborCost > highestCost) {
          highestCost = neighborCost;
        }
      }
    }

    return highestCost;
  }

  /**
   * Configure loop state for generation mode
   */
  _configureLoopStateForGeneration() {
    // Reset mana to max
    this.loopState.currentMana = this.loopState.maxMana;

    // Clear XP (fresh simulation)
    this.loopState.regionXP = new Map();

    // Enable instant mode and no-mana-depletion-reset
    this.loopState.setInstantMode(true);
    this.loopState.setNoManaDepletionReset(true);

    // Unpause
    this.loopState.setPaused(false);

    logger.info('Loop state configured for generation (instant mode, no mana reset)');
  }

  /**
   * Save current loop state for restoration
   * @returns {Object} Saved state
   */
  _saveLoopState() {
    return {
      currentMana: this.loopState.currentMana,
      maxMana: this.loopState.maxMana,
      regionXP: new Map(this.loopState.regionXP),
      isPaused: this.loopState.isPaused,
      isProcessing: this.loopState.isProcessing,
      instantMode: this.loopState.instantMode,
      noManaDepletionReset: this.loopState.noManaDepletionReset,
      gameSpeed: this.loopState.gameSpeed,
    };
  }

  /**
   * Restore saved loop state
   * @param {Object} savedState - State to restore
   */
  _restoreLoopState(savedState) {
    this.loopState.currentMana = savedState.currentMana;
    this.loopState.maxMana = savedState.maxMana;
    this.loopState.regionXP = savedState.regionXP;
    this.loopState.isPaused = savedState.isPaused;
    this.loopState.isProcessing = savedState.isProcessing;
    this.loopState.setInstantMode(savedState.instantMode);
    this.loopState.setNoManaDepletionReset(savedState.noManaDepletionReset);
    this.loopState.setGameSpeed(savedState.gameSpeed);

    // Stop any ongoing processing
    this.loopState.stopProcessing?.();

    logger.info('Loop state restored');
  }

  /**
   * Export costs to JSON string
   * @returns {string} JSON string
   */
  exportToJSON() {
    const costs = this.costDataManager.getCostData();
    return JSON.stringify(costs, null, 2);
  }

  /**
   * Get the generated costs
   * @returns {Object} Cost data
   */
  getCosts() {
    return this.costDataManager.getCostData();
  }

  /**
   * Get the first region from static data as a fallback start region
   * @returns {string|null} First region name or null
   */
  _getFirstRegionFromStaticData() {
    const staticData = this.stateManager.getStaticData();
    if (staticData?.regions?.size > 0) {
      return staticData.regions.keys().next().value;
    }
    return null;
  }
}

export default CostGenerator;
