/**
 * Cost Planner - Pure computation engine for cost generation debugging
 *
 * Plans cost generation steps from a sphere log WITHOUT executing them.
 * Each step represents one action queue (one loop with one mana budget).
 *
 * Algorithm per sphere entry:
 *   1. Find path from start to target location's region
 *   2. Assign uniform moveCosts to uncosted regions in path
 *   3. EXPLORE phase: Plan loops to fully explore each unvisited region
 *      - Each explore discovers ONE location or exit
 *      - Explore cost = 2x region moveCost (discounted by level)
 *   4. CHECK phase: Assign location cost = floor(currentMana), check location
 *
 * Move cost model: cost to move = SOURCE region's moveCost (discounted).
 * Start region has moveCost 0, so leaving it is always free.
 */

import {
  proposedLinearFinalCost,
  levelFromXP,
  calculateXPGain,
} from '../loops/xpFormulas.js';
import { centralRegistry } from '../../app/core/centralRegistry.js';
import { DEFAULT_PLAYER_ID } from '../shared/playerIdUtils.js';

// =========================================================================
// SimulatedState
// =========================================================================

class SimulatedState {
  constructor(startRegion, maxMana, staticData) {
    this.currentMana = maxMana;
    this.maxMana = maxMana;
    this.regionXP = new Map();
    this.exploredRegions = new Set();
    this.discoveredLocations = new Map();
    this.discoveredExits = new Map();
    this.checkedLocations = new Set();
    this.assignedRegionCosts = new Map();
    this.assignedLocationCosts = new Map();

    // Build region contents from static data
    this.regionContents = new Map();
    if (staticData?.regions) {
      for (const [name, data] of staticData.regions.entries()) {
        this.regionContents.set(name, {
          locations: (data.locations || []).map(l => l.name),
          exits: (data.exits || []).map(e =>
            e.name || e.exit_name || `${name} -> ${e.connected_region}`
          ),
        });
      }
    }

    // Start region: cost 0, fully explored
    if (startRegion) {
      this.assignedRegionCosts.set(startRegion, { moveCost: 0 });
      this._markFullyExplored(startRegion);
    }
  }

  _markFullyExplored(regionName) {
    const contents = this.regionContents.get(regionName);
    if (contents) {
      this.discoveredLocations.set(regionName, new Set(contents.locations));
      this.discoveredExits.set(regionName, new Set(contents.exits));
    }
    this.exploredRegions.add(regionName);
  }

  isRegionFullyExplored(regionName) {
    return this.exploredRegions.has(regionName);
  }

  getDiscoveredCount(regionName) {
    const locs = this.discoveredLocations.get(regionName)?.size || 0;
    const exits = this.discoveredExits.get(regionName)?.size || 0;
    return locs + exits;
  }

  getTotalDiscoverables(regionName) {
    const contents = this.regionContents.get(regionName);
    if (!contents) return 0;
    return contents.locations.length + contents.exits.length;
  }

  getUndiscoveredCount(regionName) {
    return this.getTotalDiscoverables(regionName) - this.getDiscoveredCount(regionName);
  }

  /** Discover the next undiscovered location or exit. Returns { type, name } or null. */
  discoverNext(regionName) {
    const contents = this.regionContents.get(regionName);
    if (!contents) return null;

    const discoveredLocs = this.discoveredLocations.get(regionName) || new Set();
    const discoveredExits = this.discoveredExits.get(regionName) || new Set();

    for (const loc of contents.locations) {
      if (!discoveredLocs.has(loc)) {
        discoveredLocs.add(loc);
        this.discoveredLocations.set(regionName, discoveredLocs);
        if (this.getUndiscoveredCount(regionName) === 0) {
          this.exploredRegions.add(regionName);
        }
        return { type: 'location', name: loc };
      }
    }
    for (const exit of contents.exits) {
      if (!discoveredExits.has(exit)) {
        discoveredExits.add(exit);
        this.discoveredExits.set(regionName, discoveredExits);
        if (this.getUndiscoveredCount(regionName) === 0) {
          this.exploredRegions.add(regionName);
        }
        return { type: 'exit', name: exit };
      }
    }
    return null;
  }

  snapshot() {
    return {
      currentMana: this.currentMana,
      maxMana: this.maxMana,
      regionXP: new Map(
        [...this.regionXP.entries()].map(([k, v]) => [k, { ...v }])
      ),
      exploredRegions: new Set(this.exploredRegions),
      discoveredLocations: new Map(
        [...this.discoveredLocations.entries()].map(([k, v]) => [k, new Set(v)])
      ),
      discoveredExits: new Map(
        [...this.discoveredExits.entries()].map(([k, v]) => [k, new Set(v)])
      ),
      checkedLocations: new Set(this.checkedLocations),
      assignedRegionCosts: new Map(
        [...this.assignedRegionCosts.entries()].map(([k, v]) => [k, { ...v }])
      ),
      assignedLocationCosts: new Map(this.assignedLocationCosts),
    };
  }

  resetManaToMax() { this.currentMana = this.maxMana; }
  deductMana(amount) { this.currentMana -= amount; }

  getRegionXP(regionName) {
    return this.regionXP.get(regionName) || { xp: 0, level: 0 };
  }

  addXP(regionName, amount) {
    const current = this.getRegionXP(regionName);
    const newXP = current.xp + amount;
    const newLevel = levelFromXP(newXP);
    this.regionXP.set(regionName, { xp: newXP, level: newLevel });
  }

  getRegionCost(regionName) {
    return this.assignedRegionCosts.get(regionName)?.moveCost ?? null;
  }

  getLocationCost(locationName) {
    return this.assignedLocationCosts.get(locationName) ?? null;
  }
}

// =========================================================================
// CostPlanner
// =========================================================================

export class CostPlanner {
  constructor({ stateManager, eventBus }) {
    this.stateManager = stateManager;
    this.eventBus = eventBus || null;

    this._simState = null;
    this._entries = [];
    this._plannedSteps = [];
    this._startRegion = null;
    this._adjacencyMap = null;
    this._isLoaded = false;

    // State machine
    this._currentEntryIndex = 0;
    this._currentEntry = null;
    this._phase = null;               // 'EXPLORE' or 'CHECK'
    this._currentPath = null;
    this._regionsToExplore = [];
    this._currentExploreRegionIdx = 0;
    this._pendingCostAssignments = []; // Cost assignments for next step's reasoning
    this._defaultsAssigned = false;
    this._skippedEventEntries = 0;    // Count of event locations skipped (auto-collected)

    // Verification mode
    this._mode = 'plan';              // 'plan' or 'verify'
    this._loadedCostData = null;      // Cost data to verify against
  }

  loadSphereLog(sphereLog) {
    this._entries = this._extractLocationEntries(sphereLog);
    this._plannedSteps = [];
    this._currentEntryIndex = 0;
    this._currentEntry = null;
    this._phase = null;
    this._mode = 'plan';
    this._loadedCostData = null;
    this._defaultsAssigned = false;
    this._skippedEventEntries = 0;

    // Get start region from snapshot (proxy doesn't expose getStartRegions)
    const snapshot = this.stateManager.getLatestStateSnapshot?.();
    const startRegions = snapshot?.startRegions || [];
    this._startRegion = (Array.isArray(startRegions) ? startRegions[0] : null)
      || this._getFirstRegion();

    this._adjacencyMap = this._buildStaticAdjacencyMap();

    const staticData = this.stateManager.getStaticData();
    this._simState = new SimulatedState(this._startRegion, 100, staticData);
    this._isLoaded = true;

    return {
      entryCount: this._entries.length,
      startRegion: this._startRegion,
    };
  }

  /**
   * Load sphere log in verification mode.
   * Uses provided cost data for all mana calculations instead of generating costs.
   * Each step compares loaded costs against what the formula would have assigned.
   * @param {Array} sphereLog - Raw sphere log data
   * @param {Object} costData - Cost data to verify (from costDataManager)
   * @returns {Object} Load result
   */
  loadSphereLogForVerification(sphereLog, costData) {
    const result = this.loadSphereLog(sphereLog);
    this._mode = 'verify';
    this._loadedCostData = costData;

    // In verify mode, pre-load ALL region costs from the cost data into simState
    // so mana calculations use the loaded costs throughout
    if (costData?.regions) {
      for (const [regionName, data] of Object.entries(costData.regions)) {
        if (!this._simState.assignedRegionCosts.has(regionName)) {
          this._simState.assignedRegionCosts.set(regionName, { moveCost: data.moveCost });
        }
      }
    }

    return result;
  }

  /** @returns {'plan'|'verify'} Current operating mode */
  getMode() { return this._mode; }

  /**
   * Plan one action queue (one loop). Returns StepReasoning or null if done.
   */
  planNextStep() {
    if (!this._isLoaded) return null;

    // Start a new sphere entry if needed (skip entries with missing locations/paths)
    while (!this._currentEntry) {
      if (this._currentEntryIndex >= this._entries.length) {
        // All entries done — assign defaults if not yet done (skip in verify mode)
        if (!this._defaultsAssigned) {
          if (this._mode === 'verify') {
            this._defaultsAssigned = true;
            return null;
          }
          return this._planDefaultsStep();
        }
        return null;
      }
      this._beginEntry(this._entries[this._currentEntryIndex]);
    }

    let step;
    if (this._phase === 'EXPLORE') {
      step = this._planExploreLoop();
    } else if (this._phase === 'CHECK') {
      step = this._planCheckLoop();
    }

    if (step) {
      this._plannedSteps.push(step);
      this.eventBus?.publish('loopsCostDebugger:stepPlanned', {
        step,
        stepIndex: step.stepIndex,
      });
    }

    return step;
  }

  /**
   * Plan all remaining steps for the current sphere entry.
   * That means all EXPLORE loops plus the final CHECK loop.
   */
  planCurrentSphere() {
    if (!this._isLoaded || this.isComplete()) return [];

    const newSteps = [];
    let guard = 1000;

    while (guard-- > 0) {
      const step = this.planNextStep();
      if (!step) break;
      newSteps.push(step);
      // CHECK is always the last step for a sphere entry
      if (step.phase === 'CHECK') break;
    }

    return newSteps;
  }

  planAll() {
    const newSteps = [];
    let guard = 10000;
    while (guard-- > 0) {
      const step = this.planNextStep();
      if (!step) break;
      newSteps.push(step);
    }

    this.eventBus?.publish('loopsCostDebugger:allPlanned', {
      steps: this._plannedSteps,
      total: this._entries.length,
    });

    return newSteps;
  }

  reset() {
    if (!this._isLoaded) return;

    this._plannedSteps = [];
    this._currentEntryIndex = 0;
    this._currentEntry = null;
    this._phase = null;
    this._currentPath = null;
    this._regionsToExplore = [];
    this._pendingCostAssignments = [];
    this._defaultsAssigned = false;

    const staticData = this.stateManager.getStaticData();
    this._simState = new SimulatedState(this._startRegion, 100, staticData);

    // Re-apply loaded costs in verify mode
    if (this._mode === 'verify' && this._loadedCostData?.regions) {
      for (const [regionName, data] of Object.entries(this._loadedCostData.regions)) {
        if (!this._simState.assignedRegionCosts.has(regionName)) {
          this._simState.assignedRegionCosts.set(regionName, { moveCost: data.moveCost });
        }
      }
      // Reset verify tracking
      this._simState._verifyAssigned = new Set();
    }

    this.eventBus?.publish('loopsCostDebugger:reset', {});
  }

  getPlannedSteps() { return this._plannedSteps; }
  getCurrentStepIndex() { return this._plannedSteps.length; }
  getTotalEntries() { return this._entries.length; }
  getSkippedEventEntries() { return this._skippedEventEntries; }
  isComplete() {
    const entriesDone = this._currentEntryIndex >= this._entries.length && !this._currentEntry;
    return entriesDone && (this._defaultsAssigned || this._mode === 'verify');
  }
  isLoaded() { return this._isLoaded; }
  getSimulatedState() { return this._simState?.snapshot() || null; }

  /**
   * Get aggregate verification statistics across all planned steps.
   * Only meaningful in verify mode.
   */
  getVerificationSummary() {
    if (this._mode !== 'verify') return null;

    const comparisons = [];
    let manaDeficitCount = 0;
    let totalRegionDelta = 0;
    let totalLocationDelta = 0;
    let regionCompareCount = 0;
    let locationCompareCount = 0;

    for (const step of this._plannedSteps) {
      if (step.simulatedResults.manaRemaining < 0) manaDeficitCount++;

      for (const ca of (step.costAssignments || [])) {
        if (!ca.verification) continue;
        const v = ca.verification;
        const absDelta = Math.abs(v.delta);
        const pct = v.simulatedCost > 0 ? (absDelta / v.simulatedCost * 100) : 0;

        comparisons.push({ ...ca, deltaPct: pct });

        if (ca.type === 'region') {
          totalRegionDelta += absDelta;
          regionCompareCount++;
        } else {
          totalLocationDelta += absDelta;
          locationCompareCount++;
        }
      }
    }

    const avgRegionDelta = regionCompareCount > 0 ? totalRegionDelta / regionCompareCount : 0;
    const avgLocationDelta = locationCompareCount > 0 ? totalLocationDelta / locationCompareCount : 0;
    const exactMatches = comparisons.filter(c => c.verification.delta === 0).length;
    const closeMatches = comparisons.filter(c => Math.abs(c.verification.delta) <= 5 && c.verification.delta !== 0).length;
    const farMatches = comparisons.filter(c => Math.abs(c.verification.delta) > 5).length;

    return {
      totalComparisons: comparisons.length,
      exactMatches,
      closeMatches,
      farMatches,
      avgRegionDelta,
      avgLocationDelta,
      manaDeficitCount,
      comparisons,
    };
  }

  getCostData() {
    if (!this._simState) return null;
    const costs = {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      generatedFrom: 'loopsCostDebugger',
      regions: {},
      locations: {},
      defaultRegionCost: 50,
      defaultLocationCost: 100,
    };
    for (const [region, data] of this._simState.assignedRegionCosts) {
      costs.regions[region] = { moveCost: data.moveCost };
    }
    for (const [location, cost] of this._simState.assignedLocationCosts) {
      costs.locations[location] = cost;
    }

    // If defaults haven't been assigned via planning yet, do it now
    if (!this._defaultsAssigned) {
      this._assignDefaultCosts(costs);
    }

    return costs;
  }

  /**
   * Assign costs to regions and locations not visited during planning.
   *
   * Regions: BFS flood-fill from costed regions through the adjacency graph.
   * Each uncosted region gets the cost of its nearest costed neighbor.
   *
   * Locations: Use their containing region's moveCost × 2, matching the
   * explore cost ratio. Falls back to defaultLocationCost.
   */
  _assignDefaultCosts(costs) {
    const staticData = this.stateManager.getStaticData();
    if (!staticData) return;

    // --- Assign uncosted regions using highest costed neighbor ---
    if (staticData.regions && this._adjacencyMap) {
      // Build full (bidirectional) neighbor set per region
      const allNeighbors = new Map();
      for (const regionName of staticData.regions.keys()) {
        allNeighbors.set(regionName, new Set());
      }
      for (const [regionName, neighbors] of this._adjacencyMap.entries()) {
        for (const neighbor of neighbors) {
          if (!allNeighbors.has(regionName)) allNeighbors.set(regionName, new Set());
          if (!allNeighbors.has(neighbor.region)) allNeighbors.set(neighbor.region, new Set());
          allNeighbors.get(regionName).add(neighbor.region);
          allNeighbors.get(neighbor.region).add(regionName);
        }
      }

      // Iteratively assign: each pass assigns uncosted regions that have
      // at least one costed neighbor, using the highest neighbor cost.
      // Repeat until no more assignments are made.
      let changed = true;
      while (changed) {
        changed = false;
        for (const regionName of staticData.regions.keys()) {
          if (costs.regions[regionName]) continue;

          let highestCost = 0;
          for (const neighborName of (allNeighbors.get(regionName) || [])) {
            const neighborCost = costs.regions[neighborName]?.moveCost;
            if (neighborCost != null && neighborCost > highestCost) {
              highestCost = neighborCost;
            }
          }

          if (highestCost > 0) {
            costs.regions[regionName] = { moveCost: highestCost };
            changed = true;
          }
        }
      }

      // Any remaining disconnected regions get the default
      for (const regionName of staticData.regions.keys()) {
        if (!costs.regions[regionName]) {
          costs.regions[regionName] = { moveCost: costs.defaultRegionCost };
        }
      }
    }

    // --- Assign uncosted locations based on their region's cost ---
    if (staticData.locations) {
      for (const [locationName, locData] of staticData.locations.entries()) {
        if (costs.locations[locationName] != null) continue;
        // Skip event locations — they are auto-collected for free
        if (staticData.eventLocations?.[locationName]) continue;

        const regionName = locData.parent_region || locData.region;
        const regionCost = costs.regions[regionName]?.moveCost ?? costs.defaultRegionCost;
        // Location cost ~ 2× region cost, matching explore cost ratio
        costs.locations[locationName] = Math.max(1, regionCost * 2);
      }
    }
  }

  // =========================================================================
  // State machine
  // =========================================================================

  _beginEntry(entry) {
    // Phantom entry: no location to check, just apply mana boost from received items
    if (!entry.locationName) {
      if (entry.itemsReceived > 0) {
        this._simState.maxMana += entry.itemsReceived * 10;
        this._simState.resetManaToMax();
      }
      this._currentEntryIndex++;
      return;
    }

    const staticData = this.stateManager.getStaticData();
    const locationData = staticData?.locations?.get(entry.locationName);
    const targetRegion = locationData?.parent_region || locationData?.region || null;
    entry._targetRegion = targetRegion;

    if (!targetRegion) {
      // Location not in this game's static data (belongs to another player) — skip
      // but still apply any mana boost from items received
      if (entry.itemsReceived > 0) {
        this._simState.maxMana += entry.itemsReceived * 10;
        this._simState.resetManaToMax();
      }
      this._currentEntryIndex++;
      return;
    }

    // Skip auto-collected locations — event locations (item has event flag) and
    // local item locations (id: null/0, e.g. dungeon prizes, activation spots)
    // are auto-collected for free when their region is accessible, so no action
    // queue is needed. Still update sim state so max mana reflects items received.
    const isAutoCollected = staticData?.eventLocations?.[entry.locationName]
      || locationData?.id === null || locationData?.id === 0;
    if (isAutoCollected) {
      this._simState.checkedLocations.add(entry.locationName);
      if (entry.itemsReceived > 0) {
        this._simState.maxMana += entry.itemsReceived * 10;
        this._simState.resetManaToMax();
      }
      this._skippedEventEntries++;
      this._currentEntryIndex++;
      return;
    }

    const pathResult = this._findPath(this._startRegion, targetRegion);
    if (!pathResult) {
      this._currentEntryIndex++;
      return;
    }

    this._currentEntry = entry;
    this._currentPath = pathResult;

    // Get non-start regions in path
    const pathRegions = pathResult.steps
      .map(s => s.region)
      .filter(r => r !== this._startRegion);

    // NOTE: Region costs are NOT assigned here. They are assigned just-in-time
    // during each loop, after path traversal costs are deducted, so the formula
    // uses the actual remaining mana rather than max mana.
    this._pendingCostAssignments = [];

    // Identify regions needing exploration (in path order)
    this._regionsToExplore = pathRegions.filter(r =>
      !this._simState.isRegionFullyExplored(r)
    );
    this._currentExploreRegionIdx = 0;

    this._phase = this._regionsToExplore.length > 0 ? 'EXPLORE' : 'CHECK';
  }

  _advanceToNextEntry() {
    this._currentEntryIndex++;
    this._currentEntry = null;
    this._phase = null;
    this._currentPath = null;
    this._regionsToExplore = [];
    this._pendingCostAssignments = [];
  }

  // =========================================================================
  // Explore loop: discover locations/exits in a region
  // =========================================================================

  _planExploreLoop() {
    const entry = this._currentEntry;
    const exploreRegion = this._regionsToExplore[this._currentExploreRegionIdx];
    const stateBefore = this._simState.snapshot();
    const notes = [];
    const costAssignments = [];

    let manaRemaining = this._simState.currentMana;
    const queue = [];
    const xpGained = {};

    // Traverse path to reach the explore region.
    // Move cost = SOURCE region's moveCost (discounted by source's level).
    const pathSteps = this._currentPath.steps;
    const exploreIdx = pathSteps.findIndex(s => s.region === exploreRegion);

    for (let i = 0; i < exploreIdx; i++) {
      const fromRegion = pathSteps[i].region;
      const toRegion = pathSteps[i + 1].region;

      const regionCost = this._simState.getRegionCost(fromRegion) || 0;
      const regionXP = this._simState.getRegionXP(fromRegion);
      const moveCost = proposedLinearFinalCost(regionCost, regionXP.level);

      queue.push({
        type: 'move', from: fromRegion, to: toRegion,
        exitUsed: pathSteps[i + 1].exitUsed,
        baseCost: regionCost, level: regionXP.level, cost: moveCost,
      });
      manaRemaining -= moveCost;

      if (moveCost > 0) {
        const xp = calculateXPGain('regionMove', moveCost);
        xpGained[fromRegion] = (xpGained[fromRegion] || 0) + xp;
        this._simState.addXP(fromRegion, xp);
      }
    }

    // Assign cost to explore region just-in-time (after traversal costs deducted)
    if (this._mode === 'verify') {
      // In verify mode, region cost was pre-loaded. Compute what formula would have assigned.
      // Only compare once per region (first encounter).
      if (!this._simState._verifyAssigned) this._simState._verifyAssigned = new Set();
      if (!this._simState._verifyAssigned.has(exploreRegion)) {
        const loadedCost = this._simState.getRegionCost(exploreRegion) || 0;
        const fullPathRegions = this._currentPath.steps.map(s => s.region);
        const uncostedRemaining = fullPathRegions.filter(r =>
          r !== this._startRegion && !this._simState._verifyAssigned.has(r)
        ).length || 1;
        const simulatedCost = Math.max(1, Math.floor(manaRemaining / 2 / uncostedRemaining));

        this._simState._verifyAssigned.add(exploreRegion);

        costAssignments.push({
          type: 'region', name: exploreRegion,
          cost: loadedCost,
          formula: `loaded: ${loadedCost} (formula would assign: ${simulatedCost})`,
          verification: { loadedCost, simulatedCost, delta: loadedCost - simulatedCost },
        });
      }
    } else if (this._simState.getRegionCost(exploreRegion) === null) {
      // Count uncosted regions remaining in the full path (from here onward)
      const fullPathRegions = this._currentPath.steps.map(s => s.region);
      const uncostedRemaining = fullPathRegions.filter(r =>
        r !== this._startRegion && this._simState.getRegionCost(r) === null
      ).length;

      const cost = Math.max(1, Math.floor(manaRemaining / 2 / uncostedRemaining));
      const formula = `max(1, floor(${fmtNum(manaRemaining)} / 2 / ${uncostedRemaining})) = ${cost}`;

      this._simState.assignedRegionCosts.set(exploreRegion, { moveCost: cost });
      costAssignments.push({ type: 'region', name: exploreRegion, cost, formula });
    }

    // Explore actions until mana runs out
    const discoveries = [];
    const regionCost = this._simState.getRegionCost(exploreRegion) || 10;

    while (manaRemaining > 0 && this._simState.getUndiscoveredCount(exploreRegion) > 0) {
      const regionXP = this._simState.getRegionXP(exploreRegion);
      const exploreCost = proposedLinearFinalCost(regionCost * 2, regionXP.level);

      if (manaRemaining < exploreCost) {
        notes.push(`Not enough mana for next explore (need ${fmtNum(exploreCost)}, have ${fmtNum(manaRemaining)})`);
        break;
      }

      const discovered = this._simState.discoverNext(exploreRegion);
      if (!discovered) break;

      queue.push({
        type: 'explore', region: exploreRegion,
        discovered,
        baseCost: regionCost * 2, level: regionXP.level, cost: exploreCost,
      });
      manaRemaining -= exploreCost;
      discoveries.push(discovered);

      const xp = calculateXPGain('customAction', exploreCost);
      xpGained[exploreRegion] = (xpGained[exploreRegion] || 0) + xp;
      this._simState.addXP(exploreRegion, xp);
    }

    if (discoveries.length === 0) {
      notes.push('No explores completed - path traversal consumed all available mana');
    }

    const manaConsumed = stateBefore.currentMana - manaRemaining;

    // Explore progress
    const discoveredCount = this._simState.getDiscoveredCount(exploreRegion);
    const totalDiscoverables = this._simState.getTotalDiscoverables(exploreRegion);

    // Check if region is fully explored
    if (this._simState.isRegionFullyExplored(exploreRegion)) {
      notes.push(`${exploreRegion} fully explored! (${totalDiscoverables}/${totalDiscoverables})`);
      this._currentExploreRegionIdx++;

      if (this._currentExploreRegionIdx >= this._regionsToExplore.length) {
        this._phase = 'CHECK';
        notes.push('All regions in path explored. Ready for location check.');
      }
    } else {
      notes.push(`${exploreRegion}: ${discoveredCount}/${totalDiscoverables} discovered`);
    }

    // Reset mana for next loop
    this._simState.resetManaToMax();

    return {
      stepIndex: this._plannedSteps.length,
      sphereIndex: entry.sphereIndex,
      sphereEntryIndex: this._currentEntryIndex,
      phase: 'EXPLORE',
      mode: this._mode,
      locationName: entry.locationName,
      targetRegion: exploreRegion,
      stateBefore,
      path: {
        from: this._startRegion,
        to: exploreRegion,
        steps: pathSteps.slice(0, exploreIdx + 1),
      },
      costAssignments,
      queue,
      discoveries,
      exploreProgress: {
        discovered: discoveredCount,
        total: totalDiscoverables,
        remaining: totalDiscoverables - discoveredCount,
      },
      simulatedResults: {
        manaConsumed,
        manaRemaining,
        xpGained,
      },
      stateAfter: this._simState.snapshot(),
      notes,
    };
  }

  // =========================================================================
  // Check loop: move to location and check it
  // =========================================================================

  _planCheckLoop() {
    const entry = this._currentEntry;
    const targetRegion = entry._targetRegion;
    const stateBefore = this._simState.snapshot();
    const notes = [];
    const costAssignments = [];

    let manaRemaining = this._simState.currentMana;
    const queue = [];
    const xpGained = {};

    // Traverse path to target region.
    // Move cost = SOURCE region's moveCost.
    const pathSteps = this._currentPath.steps;
    for (let i = 0; i < pathSteps.length - 1; i++) {
      const fromRegion = pathSteps[i].region;
      const toRegion = pathSteps[i + 1].region;

      const regionCost = this._simState.getRegionCost(fromRegion) || 0;
      const regionXP = this._simState.getRegionXP(fromRegion);
      const moveCost = proposedLinearFinalCost(regionCost, regionXP.level);

      queue.push({
        type: 'move', from: fromRegion, to: toRegion,
        exitUsed: pathSteps[i + 1].exitUsed,
        baseCost: regionCost, level: regionXP.level, cost: moveCost,
      });
      manaRemaining -= moveCost;

      if (moveCost > 0) {
        const xp = calculateXPGain('regionMove', moveCost);
        xpGained[fromRegion] = (xpGained[fromRegion] || 0) + xp;
        this._simState.addXP(fromRegion, xp);
      }
    }

    // Assign location cost after traversal
    let locationCost;
    if (this._mode === 'verify') {
      // Use loaded cost, compare against what formula would have assigned
      locationCost = this._loadedCostData?.locations?.[entry.locationName] ?? Math.max(1, Math.floor(manaRemaining));
      const simulatedCost = Math.max(1, Math.floor(manaRemaining));
      this._simState.assignedLocationCosts.set(entry.locationName, locationCost);
      costAssignments.push({
        type: 'location', name: entry.locationName,
        cost: locationCost,
        formula: `loaded: ${locationCost} (formula would assign: ${simulatedCost})`,
        verification: { loadedCost: locationCost, simulatedCost, delta: locationCost - simulatedCost },
      });
    } else {
      locationCost = Math.max(1, Math.floor(manaRemaining));
      const locationFormula = `max(1, floor(${fmtNum(manaRemaining)})) = ${locationCost}`;
      this._simState.assignedLocationCosts.set(entry.locationName, locationCost);
      costAssignments.push({
        type: 'location', name: entry.locationName,
        cost: locationCost, formula: locationFormula,
      });
    }

    // Check location
    const regionXP = this._simState.getRegionXP(targetRegion);
    const checkCost = proposedLinearFinalCost(locationCost, regionXP.level);

    queue.push({
      type: 'locationCheck',
      location: entry.locationName, region: targetRegion,
      baseCost: locationCost, level: regionXP.level, cost: checkCost,
    });
    manaRemaining -= checkCost;

    const locXP = calculateXPGain('locationCheck', checkCost);
    xpGained[targetRegion] = (xpGained[targetRegion] || 0) + locXP;
    this._simState.addXP(targetRegion, locXP);

    const manaConsumed = stateBefore.currentMana - manaRemaining;

    if (manaRemaining < 0) {
      notes.push(`Mana deficit: ${fmtNum(Math.abs(manaRemaining))} (consumed ${fmtNum(manaConsumed)} with ${fmtNum(stateBefore.currentMana)} available)`);
    }

    this._simState.checkedLocations.add(entry.locationName);
    // Mana boost from items received (may be 0 if item went to another player)
    if (entry.itemsReceived > 0) {
      this._simState.maxMana += entry.itemsReceived * 10;
    }
    this._simState.resetManaToMax();

    // Advance to next sphere entry
    this._advanceToNextEntry();

    return {
      stepIndex: this._plannedSteps.length,
      sphereIndex: entry.sphereIndex,
      sphereEntryIndex: this._currentEntryIndex - 1,
      phase: 'CHECK',
      mode: this._mode,
      locationName: entry.locationName,
      targetRegion,
      stateBefore,
      path: {
        from: this._startRegion,
        to: targetRegion,
        steps: pathSteps,
      },
      costAssignments,
      queue,
      simulatedResults: {
        manaConsumed,
        manaRemaining,
        xpGained,
      },
      stateAfter: this._simState.snapshot(),
      notes,
    };
  }

  // =========================================================================
  // Defaults step: assign costs to unvisited regions/locations
  // =========================================================================

  _planDefaultsStep() {
    const stateBefore = this._simState.snapshot();
    const costAssignments = [];

    // Build a temporary costs object with current assignments
    const currentCosts = { regions: {}, locations: {}, defaultRegionCost: 50, defaultLocationCost: 100 };
    for (const [region, data] of this._simState.assignedRegionCosts) {
      currentCosts.regions[region] = { moveCost: data.moveCost };
    }
    for (const [location, cost] of this._simState.assignedLocationCosts) {
      currentCosts.locations[location] = cost;
    }

    // Run the default assignment logic on the temp object
    this._assignDefaultCosts(currentCosts);

    // Record new region assignments and apply to simState
    for (const [regionName, data] of Object.entries(currentCosts.regions)) {
      if (!this._simState.assignedRegionCosts.has(regionName)) {
        this._simState.assignedRegionCosts.set(regionName, { moveCost: data.moveCost });
        costAssignments.push({
          type: 'region', name: regionName, cost: data.moveCost,
          formula: `highest neighbor cost or default (${currentCosts.defaultRegionCost})`,
        });
      }
    }

    // Assign uncosted locations and apply to simState
    const staticData = this.stateManager.getStaticData();
    if (staticData?.locations) {
      for (const [locationName, locData] of staticData.locations.entries()) {
        if (this._simState.assignedLocationCosts.has(locationName)) continue;
        // Skip event locations — they are auto-collected for free
        if (staticData.eventLocations?.[locationName]) continue;
        const regionName = locData.parent_region || locData.region;
        const regionCost = currentCosts.regions[regionName]?.moveCost ?? currentCosts.defaultRegionCost;
        const locationCost = Math.max(1, regionCost * 2);
        this._simState.assignedLocationCosts.set(locationName, locationCost);
        costAssignments.push({
          type: 'location', name: locationName, cost: locationCost,
          formula: `region cost (${regionCost}) × 2`,
        });
      }
    }

    this._defaultsAssigned = true;

    const notes = [];
    const regionCount = costAssignments.filter(a => a.type === 'region').length;
    const locationCount = costAssignments.filter(a => a.type === 'location').length;
    if (regionCount > 0) notes.push(`Assigned default costs to ${regionCount} unvisited regions`);
    if (locationCount > 0) notes.push(`Assigned default costs to ${locationCount} unvisited locations`);
    if (costAssignments.length === 0) notes.push('All regions and locations already have costs assigned');

    const step = {
      stepIndex: this._plannedSteps.length,
      sphereIndex: null,
      sphereEntryIndex: null,
      phase: 'DEFAULTS',
      locationName: null,
      targetRegion: null,
      stateBefore,
      path: null,
      costAssignments,
      queue: [],
      simulatedResults: { manaConsumed: 0, manaRemaining: 0, xpGained: {} },
      stateAfter: this._simState.snapshot(),
      notes,
    };

    this._plannedSteps.push(step);
    this.eventBus?.publish('loopsCostDebugger:stepPlanned', { step, stepIndex: step.stepIndex });
    return step;
  }

  // =========================================================================
  // Sphere log parsing
  // =========================================================================

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
          // Distribute items received across the locations in this sphere;
          // grant all on the last location so mana boost happens after all checks
          itemsReceived: (i === sphereLocations.length - 1) ? itemsReceived : 0,
        });
      }

      // If this player received items but checked no locations in this sphere
      // (items came from other players), create a phantom entry for the mana boost
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

  // =========================================================================
  // Pathfinding (simplified BFS on static topology)
  // =========================================================================

  _buildStaticAdjacencyMap() {
    const staticData = this.stateManager.getStaticData();
    if (!staticData?.regions) return new Map();

    const adjacency = new Map();
    for (const regionName of staticData.regions.keys()) {
      adjacency.set(regionName, []);
    }

    for (const [regionName, regionData] of staticData.regions.entries()) {
      if (!regionData.exits) continue;
      for (const exit of regionData.exits) {
        const target = exit.connected_region;
        if (!adjacency.has(target)) {
          adjacency.set(target, []);
        }
        adjacency.get(regionName).push({
          region: target,
          exitName: exit.name || exit.exit_name || `${regionName} -> ${target}`,
        });
      }
    }

    return adjacency;
  }

  _findPath(from, to) {
    if (!this._adjacencyMap) return null;
    if (from === to) {
      return { steps: [{ region: from, exitUsed: null }], length: 0 };
    }

    const queue = [{ region: from, path: [{ region: from, exitUsed: null }] }];
    const visited = new Set([from]);

    while (queue.length > 0) {
      const { region, path } = queue.shift();
      const neighbors = this._adjacencyMap.get(region) || [];

      for (const neighbor of neighbors) {
        if (visited.has(neighbor.region)) continue;
        visited.add(neighbor.region);

        const newPath = [...path, { region: neighbor.region, exitUsed: neighbor.exitName }];

        if (neighbor.region === to) {
          return { steps: newPath, length: newPath.length - 1 };
        }

        queue.push({ region: neighbor.region, path: newPath });
      }
    }

    return null;
  }

  _getFirstRegion() {
    const staticData = this.stateManager.getStaticData();
    if (staticData?.regions?.size > 0) {
      return staticData.regions.keys().next().value;
    }
    return null;
  }
}

function fmtNum(n) {
  if (n === null || n === undefined) return '?';
  return Number(n).toFixed(1);
}

export default CostPlanner;
