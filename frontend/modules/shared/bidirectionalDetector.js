/**
 * Bidirectional Exit Detection Utility
 *
 * Analyzes region connections to automatically determine whether to assume
 * bidirectional exits based on the structure of the world graph.
 *
 * Three detection modes:
 * 1. explicit_bidirectional: Most/all region pairs have explicit two-way exits
 * 2. assume_all_bidirectional: No explicit bidirectional pairs - assume all are bidirectional
 * 3. mixed_with_trapped: Some regions are "trapped" (have way in but no way out)
 */

/**
 * Analyzes a regions map to detect bidirectional exit configuration
 *
 * @param {Map|Object} regions - Map or object of region name -> region data
 *   Each region should have: { name, exits: [{ name, connected_region, access_rule }], locations: [] }
 * @param {Object} options - Detection options
 * @param {string} [options.menuRegionName] - Name of the start/menu region (expected to have no entrance). Auto-detected if not provided.
 * @param {number} [options.bidirectionalThreshold=0.5] - Ratio of bidirectional pairs to total edges needed to consider explicit
 * @returns {Object} Detection result
 *   - mode: 'explicit_bidirectional' | 'assume_all_bidirectional' | 'mixed_with_trapped'
 *   - assumeBidirectional: boolean - recommended value for assume_bidirectional_exits
 *   - stats: { totalEdges, bidirectionalPairs, unidirectionalExits, trappedRegions }
 *   - trappedRegions: string[] - regions with way in but no way out
 *   - recommendation: string - human-readable recommendation
 */
export function detectBidirectionalMode(regions, options = {}) {
  const {
    menuRegionName = null,
    bidirectionalThreshold = 0.5
  } = options;

  // Normalize input: support both Map and plain object
  const regionEntries = regions instanceof Map
    ? Array.from(regions.entries())
    : Object.entries(regions);

  // Build a quick lookup for regions
  const regionMap = new Map(regionEntries);

  // Track edges and their reverse existence
  const allExits = []; // { from, to, exitName }
  const regionsWithIncomingEdges = new Set();
  const regionsWithOutgoingEdges = new Set();

  // Collect all exits
  for (const [regionName, regionData] of regionEntries) {
    const exits = regionData.exits || [];
    for (const exit of exits) {
      const targetRegion = exit.connected_region;
      if (targetRegion && regionMap.has(targetRegion)) {
        allExits.push({
          from: regionName,
          to: targetRegion,
          exitName: exit.name
        });
        regionsWithOutgoingEdges.add(regionName);
        regionsWithIncomingEdges.add(targetRegion);
      }
    }
  }

  // Count bidirectional pairs (both A->B and B->A exist)
  const exitLookup = new Set(allExits.map(e => `${e.from}->${e.to}`));
  const bidirectionalPairs = new Set();
  const unidirectionalExits = [];

  for (const exit of allExits) {
    const reverseKey = `${exit.to}->${exit.from}`;
    const forwardKey = `${exit.from}->${exit.to}`;

    if (exitLookup.has(reverseKey)) {
      // This is part of a bidirectional pair
      // Use canonical ordering for the set key
      const pairKey = [exit.from, exit.to].sort().join('<->');
      bidirectionalPairs.add(pairKey);
    } else {
      unidirectionalExits.push(exit);
    }
  }

  // Calculate unique edges (treating A->B and B->A as the same edge)
  const uniqueEdges = new Set(
    allExits.map(e => [e.from, e.to].sort().join('<->'))
  );
  const totalUniqueEdges = uniqueEdges.size;

  // Find "trapped" regions: have way in but no way out
  // Menu is special: expected to have way out but no way in, and no locations
  const trappedRegions = [];
  const sourceOnlyRegions = []; // Have way out but no way in (like Menu)

  for (const [regionName, regionData] of regionEntries) {
    const hasWayIn = regionsWithIncomingEdges.has(regionName);
    const hasWayOut = regionsWithOutgoingEdges.has(regionName);
    const hasLocations = (regionData.locations || []).length > 0;

    // Check if this is the start/menu region or a start-like region
    // A start-like region has outgoing edges but no incoming edges and no locations
    const isMenuLike = (menuRegionName && regionName === menuRegionName) ||
      (!hasWayIn && hasWayOut && !hasLocations);

    if (hasWayIn && !hasWayOut) {
      // Has entrance but no exit - trapped region
      trappedRegions.push({
        name: regionName,
        hasLocations,
        incomingExits: allExits.filter(e => e.to === regionName).map(e => ({
          from: e.from,
          exitName: e.exitName
        }))
      });
    } else if (!hasWayIn && hasWayOut && !isMenuLike) {
      // Has exit but no entrance (and not Menu) - source-only region
      sourceOnlyRegions.push(regionName);
    }
  }

  // Calculate statistics
  const stats = {
    totalRegions: regionEntries.length,
    totalExits: allExits.length,
    totalUniqueEdges,
    bidirectionalPairs: bidirectionalPairs.size,
    unidirectionalExits: unidirectionalExits.length,
    trappedRegionCount: trappedRegions.length,
    sourceOnlyRegionCount: sourceOnlyRegions.length
  };

  // Calculate bidirectional ratio
  const bidirectionalRatio = totalUniqueEdges > 0
    ? bidirectionalPairs.size / totalUniqueEdges
    : 0;

  // Determine mode and recommendation
  let mode, assumeBidirectional, recommendation;

  if (totalUniqueEdges === 0) {
    // No edges at all
    mode = 'no_edges';
    assumeBidirectional = false;
    recommendation = 'No region connections found. Cannot determine bidirectionality.';
  } else if (bidirectionalPairs.size === totalUniqueEdges) {
    // All edges are explicitly bidirectional
    mode = 'explicit_bidirectional';
    assumeBidirectional = false;
    recommendation = `All ${totalUniqueEdges} connections are explicitly bidirectional. No assumption needed.`;
  } else if (bidirectionalPairs.size === 0) {
    // No explicit bidirectional pairs - likely should assume all are bidirectional
    if (trappedRegions.length > 0) {
      mode = 'assume_all_bidirectional';
      assumeBidirectional = true;
      recommendation = `No explicit bidirectional connections found, and ${trappedRegions.length} region(s) would be trapped. ` +
        `Recommend assuming all exits are bidirectional.`;
    } else {
      // No bidirectional pairs, but also no trapped regions
      // Could be intentional one-way design, but more likely should be bidirectional
      mode = 'assume_all_bidirectional';
      assumeBidirectional = true;
      recommendation = `No explicit bidirectional connections found among ${totalUniqueEdges} edges. ` +
        `Recommend assuming all exits are bidirectional.`;
    }
  } else if (trappedRegions.length > 0) {
    // Mixed case with trapped regions
    mode = 'mixed_with_trapped';
    assumeBidirectional = true; // Still recommend true to avoid trapping
    recommendation = `Mixed configuration: ${bidirectionalPairs.size} of ${totalUniqueEdges} connections are explicitly bidirectional, ` +
      `but ${trappedRegions.length} region(s) would be trapped without assumed bidirectionality. ` +
      `Recommend assuming bidirectional to prevent dead-ends.`;
  } else {
    // Mixed but no trapped regions - might be intentional one-way paths
    if (bidirectionalRatio >= bidirectionalThreshold) {
      mode = 'mostly_bidirectional';
      assumeBidirectional = false;
      recommendation = `${bidirectionalPairs.size} of ${totalUniqueEdges} connections (${(bidirectionalRatio * 100).toFixed(0)}%) ` +
        `are explicitly bidirectional. Remaining unidirectional exits appear intentional.`;
    } else {
      mode = 'mostly_unidirectional';
      assumeBidirectional = true;
      recommendation = `Only ${bidirectionalPairs.size} of ${totalUniqueEdges} connections are explicitly bidirectional. ` +
        `May want to assume bidirectional unless one-way paths are intentional.`;
    }
  }

  return {
    mode,
    assumeBidirectional,
    stats,
    bidirectionalRatio,
    trappedRegions,
    sourceOnlyRegions,
    unidirectionalExits: unidirectionalExits.map(e => ({
      from: e.from,
      to: e.to,
      exitName: e.exitName
    })),
    recommendation
  };
}

/**
 * Quick check for whether a specific region would be trapped
 *
 * @param {string} regionName - Name of the region to check
 * @param {Map|Object} regions - Map or object of region name -> region data
 * @returns {boolean} True if the region has incoming edges but no outgoing edges
 */
export function isRegionTrapped(regionName, regions) {
  const regionEntries = regions instanceof Map
    ? Array.from(regions.entries())
    : Object.entries(regions);

  const regionMap = new Map(regionEntries);
  const regionData = regionMap.get(regionName);

  if (!regionData) return false;

  // Check if region has any outgoing edges
  const hasOutgoing = (regionData.exits || []).some(
    exit => exit.connected_region && regionMap.has(exit.connected_region)
  );

  // Check if region has any incoming edges
  let hasIncoming = false;
  for (const [name, data] of regionEntries) {
    if (name !== regionName) {
      const exits = data.exits || [];
      if (exits.some(e => e.connected_region === regionName)) {
        hasIncoming = true;
        break;
      }
    }
  }

  return hasIncoming && !hasOutgoing;
}

/**
 * Get a list of exits that would need to be made bidirectional
 * to ensure no regions are trapped
 *
 * @param {Map|Object} regions - Map or object of region name -> region data
 * @returns {Array} List of exits that need reverse connections
 */
export function getRequiredBidirectionalExits(regions) {
  const result = detectBidirectionalMode(regions);

  if (result.trappedRegions.length === 0) {
    return [];
  }

  // For each trapped region, we need to add reverse exits for all incoming edges
  const requiredExits = [];

  for (const trapped of result.trappedRegions) {
    for (const incoming of trapped.incomingExits) {
      requiredExits.push({
        from: trapped.name,
        to: incoming.from,
        reason: `Reverse of "${incoming.exitName}" to prevent ${trapped.name} from being trapped`
      });
    }
  }

  return requiredExits;
}

export default {
  detectBidirectionalMode,
  isRegionTrapped,
  getRequiredBidirectionalExits
};
