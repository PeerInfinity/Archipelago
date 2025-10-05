import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import { evaluateRule } from '../shared/ruleEngine.js';
import { createStateSnapshotInterface } from '../shared/stateInterface.js';
import { getPlayerStateSingleton } from '../playerState/singleton.js';
import { createUniversalLogger } from '../../app/core/universalLogger.js';

const logger = createUniversalLogger('regionGraph');

/**
 * GraphDataManager - Handles graph data structure and visual updates
 */
export class GraphDataManager {
  constructor(ui) {
    this.ui = ui;
  }

  async loadGraphData() {
    logger.debug('loadGraphData called');
    try {
      logger.debug('Getting state data...');
      const staticData = stateManager.getStaticData();
      const snapshot = stateManager.getLatestStateSnapshot();

      logger.verbose('State data loaded', { staticData, snapshot });

      if (!staticData?.regions || !snapshot) {
        logger.warn('Missing data', { hasRegions: !!staticData?.regions, hasSnapshot: !!snapshot });
        this.ui.updateStatus('No region data available');
        return;
      }

      // Check if this is a reload after rules have already been loaded once
      const isReload = this.ui.graphInitialized;

      logger.info('Building graph from regions', { count: Object.keys(staticData.regions).length });
      this.buildGraphFromRegions(staticData.regions, staticData.exits);
      this.ui.graphInitialized = true; // Mark as successfully loaded

      // Force a re-layout when loading new rules
      if (isReload && this.ui.cy) {
        logger.info('New rules loaded, triggering automatic re-layout');
        this.ui.runLayout(true);
      }
    } catch (error) {
      logger.error('Error loading graph data:', error);
      this.ui.updateStatus('Error loading graph data');
    }
  }

  determineNodeInteriorColor(locationCounts, isReachable) {
    // Black if all locations are checked OR if region has no locations
    if (locationCounts.allChecked || locationCounts.total === 0) {
      return 'completed';
    }

    // Only apply interior colors if region is accessible and has unchecked locations
    if (!isReachable || !locationCounts.hasUnchecked) {
      return null; // Use default color
    }

    // Green if all unchecked locations are accessible
    if (locationCounts.hasAccessible && !locationCounts.hasInaccessible) {
      return 'all-accessible';
    }

    // Yellow if has both accessible and inaccessible unchecked locations
    if (locationCounts.hasAccessible && locationCounts.hasInaccessible) {
      return 'mixed-locations';
    }

    // Red if all unchecked locations are inaccessible
    if (!locationCounts.hasAccessible && locationCounts.hasInaccessible) {
      return 'all-inaccessible';
    }

    return null; // Default color
  }

  calculateLocationCounts(regionName, regionData) {
    const snapshot = stateManager.getLatestStateSnapshot();
    const staticData = stateManager.getStaticData();

    if (!snapshot || !staticData) {
      return { checked: 0, accessible: 0, inaccessible: 0, total: 0 };
    }

    const snapshotInterface = createStateSnapshotInterface(snapshot, staticData);
    const locations = regionData.locations || [];
    const checkedLocations = new Set(snapshot.checkedLocations || []);

    let checked = 0;
    let accessible = 0;
    let inaccessible = 0;

    const regionIsReachable = snapshot.regionReachability?.[regionName] === true ||
                             snapshot.regionReachability?.[regionName] === 'reachable' ||
                             snapshot.regionReachability?.[regionName] === 'checked';

    for (const location of locations) {
      const isChecked = checkedLocations.has(location.name);

      if (isChecked) {
        checked++;
      } else {
        // Evaluate location accessibility
        let locationAccessible = regionIsReachable; // Location needs region to be reachable first

        if (location.access_rule && regionIsReachable) {
          try {
            locationAccessible = evaluateRule(location.access_rule, snapshotInterface);
          } catch (e) {
            logger.warn(`Error evaluating location rule for ${location.name}:`, e);
            locationAccessible = false;
          }
        }

        if (locationAccessible) {
          accessible++;
        } else {
          inaccessible++;
        }
      }
    }

    return {
      checked,
      accessible,
      inaccessible,
      total: locations.length,
      hasAccessible: accessible > 0,
      hasInaccessible: inaccessible > 0,
      hasUnchecked: (accessible + inaccessible) > 0,
      allChecked: checked === locations.length && locations.length > 0,
      hasLocations: locations.length > 0
    };
  }

  buildGraphFromRegions(regions, exits) {
    logger.debug('buildGraphFromRegions called', { regionCount: Object.keys(regions || {}).length });
    if (!regions || Object.keys(regions).length === 0) {
      logger.warn('No regions to display');
      this.ui.updateStatus('No regions to display');
      return;
    }

    const elements = {
      nodes: [],
      edges: []
    };

    // Check if bidirectional exits are assumed from game settings
    const staticData = stateManager.getStaticData();
    const playerSettings = staticData?.settings ? Object.values(staticData.settings)[0] : null;
    const assumeBidirectional = playerSettings?.assume_bidirectional_exits === true;
    logger.debug('Exit configuration', { assumeBidirectional });

    // Create nodes for each region with location counts
    for (const [regionName, regionData] of Object.entries(regions)) {
      // Calculate location counts
      const locationCounts = this.calculateLocationCounts(regionName, regionData);

      // Get display text based on settings
      const displayText = this.ui.getRegionDisplayText(regionData);

      // Add location counts if there are locations
      const countLabel = `${locationCounts.checked}, ${locationCounts.accessible}, ${locationCounts.inaccessible} / ${locationCounts.total}`;
      const fullLabel = locationCounts.total > 0 ? `${displayText}\n${countLabel}` : displayText;

      elements.nodes.push({
        data: {
          id: regionName,
          label: fullLabel,
          regionName: regionName,
          locationCounts: locationCounts
        },
        position: this.ui.nodePositions.get(regionName) || { x: Math.random() * 500, y: Math.random() * 500 },
        classes: 'region'
      });
    }

    // Track all exits for directionality analysis
    const exitMap = new Map(); // key: "fromRegion->toRegion", value: exitData
    const processedEdges = new Set();

    // Collect all exits from region definitions
    for (const [regionName, regionData] of Object.entries(regions)) {
      if (regionData.exits && regionData.exits.length > 0) {
        for (const exitDef of regionData.exits) {
          const fromRegion = regionName;
          const toRegion = exitDef.connected_region;

          if (fromRegion && toRegion && regions[fromRegion] && regions[toRegion]) {
            const exitKey = `${fromRegion}->${toRegion}`;
            exitMap.set(exitKey, {
              fromRegion,
              toRegion,
              exitName: exitDef.name,
              accessRule: exitDef.access_rule
            });
          }
        }
      }
    }

    // Also collect exits from static exits data if available (legacy support)
    if (exits) {
      for (const [exitName, exitData] of Object.entries(exits)) {
        const fromRegion = exitData.parentRegion;
        const toRegion = exitData.connectedRegion;

        if (fromRegion && toRegion && regions[fromRegion] && regions[toRegion]) {
          const exitKey = `${fromRegion}->${toRegion}`;
          if (!exitMap.has(exitKey)) {
            exitMap.set(exitKey, {
              fromRegion,
              toRegion,
              exitName: exitName,
              accessRule: exitData.access_rule
            });
          }
        }
      }
    }

    // Create edges with directionality analysis
    for (const [exitKey, exitData] of exitMap.entries()) {
      const { fromRegion, toRegion, exitName, accessRule } = exitData;
      const reverseExitKey = `${toRegion}->${fromRegion}`;
      const forwardEdgeId = `${fromRegion}-${toRegion}`;
      const reverseEdgeId = `${toRegion}-${fromRegion}`;

      // Skip if we've already processed this edge pair
      if (processedEdges.has(forwardEdgeId) || processedEdges.has(reverseEdgeId)) {
        continue;
      }

      // Determine if the connection is bidirectional
      const hasReverseExit = exitMap.has(reverseExitKey);
      const isBidirectional = assumeBidirectional || hasReverseExit;

      // Use the lexicographically smaller region as source for consistency
      const isForwardDirection = fromRegion < toRegion;
      const edgeSource = isForwardDirection ? fromRegion : toRegion;
      const edgeTarget = isForwardDirection ? toRegion : fromRegion;
      const edgeId = `${edgeSource}-${edgeTarget}`;

      // Get the primary exit (in the direction of the edge)
      const primaryExit = isForwardDirection ? exitData : exitMap.get(reverseExitKey);
      const reverseExit = isForwardDirection ? exitMap.get(reverseExitKey) : exitData;

      // Create label for edge - handle bidirectional edges with different exit names
      let edgeLabel = '';
      if (isBidirectional && primaryExit && reverseExit && primaryExit.exitName !== reverseExit.exitName) {
        // Different exit names for each direction
        edgeLabel = `${primaryExit.exitName} / ${reverseExit.exitName}`;
      } else if (primaryExit) {
        edgeLabel = primaryExit.exitName;
      } else if (reverseExit) {
        edgeLabel = reverseExit.exitName;
      }

      // Create edge data
      const edgeData = {
        id: edgeId,
        source: edgeSource,
        target: edgeTarget,
        label: edgeLabel,
        exitName: primaryExit ? primaryExit.exitName : (reverseExit ? reverseExit.exitName : ''),
        accessRule: primaryExit ? primaryExit.accessRule : (reverseExit ? reverseExit.accessRule : null),
        isBidirectional: isBidirectional,
        hasForwardExit: isForwardDirection ? true : hasReverseExit,
        hasReverseExit: isForwardDirection ? hasReverseExit : true,
        forwardExitRule: isForwardDirection ? accessRule : (reverseExit ? reverseExit.accessRule : null),
        reverseExitRule: isForwardDirection ? (reverseExit ? reverseExit.accessRule : null) : accessRule,
        forwardExitName: isForwardDirection ? exitData.exitName : (reverseExit ? reverseExit.exitName : ''),
        reverseExitName: isForwardDirection ? (reverseExit ? reverseExit.exitName : '') : exitData.exitName
      };

      elements.edges.push({ data: edgeData });
      processedEdges.add(edgeId);
      processedEdges.add(reverseEdgeId); // Mark both directions as processed
    }

    this.ui.cy.elements().remove();
    this.ui.cy.add(elements);

    // Auto-apply hub detection if enabled
    this.autoApplyHubDetection();

    if (this.ui.nodePositions.size === 0 || this.ui.nodePositions.size !== elements.nodes.length) {
      this.ui.runLayout(false);
    } else {
      this.ui.cy.fit(30);
    }

    // Apply initial accessibility coloring
    const snapshot = stateManager.getLatestStateSnapshot();
    if (snapshot) {
      this.onStateUpdate({ snapshot });
    }

    // Store the current player region for later positioning after layout
    this.ui.initialPlayerRegion = this.ui.getCurrentPlayerLocation();

    // Try to get initial path data
    try {
      const playerState = getPlayerStateSingleton();
      if (playerState) {
        const path = playerState.getPath();
        if (path && path.length > 0) {
          // Filter for only regionMove entries
          this.ui.currentPath = path.filter(entry => entry.type === 'regionMove');
          logger.debug(`Loaded initial path with ${this.ui.currentPath.length} regions`);
        }
      }
    } catch (error) {
      logger.debug('Error getting initial path data:', error);
    }

    this.ui.updateStatus(`Loaded ${elements.nodes.length} regions, ${elements.edges.length} connections`);
  }

  identifyHubNodes(threshold = 8) {
    const hubNodes = [];

    this.ui.cy.nodes().forEach(node => {
      // Skip player node
      if (node.hasClass('player')) {
        return;
      }

      const degree = node.degree();
      if (degree >= threshold) {
        hubNodes.push({
          id: node.id(),
          degree: degree
        });
        node.addClass('hub');
      } else {
        node.removeClass('hub');
      }
    });

    // Mark edges connected to hubs
    this.ui.cy.edges().forEach(edge => {
      const sourceIsHub = edge.source().hasClass('hub');
      const targetIsHub = edge.target().hasClass('hub');
      if (sourceIsHub || targetIsHub) {
        edge.addClass('hub-edge');
      } else {
        edge.removeClass('hub-edge');
      }
    });

    logger.debug(`Identified ${hubNodes.length} hub nodes with degree >= ${threshold}`);
    return hubNodes;
  }

  autoApplyHubDetection() {
    if (!this.ui.layoutEditor) return;

    const autoApplyCheckbox = this.ui.controlPanel.querySelector('#autoApplyHubs');
    if (autoApplyCheckbox && autoApplyCheckbox.checked) {
      const thresholdInput = this.ui.controlPanel.querySelector('#hubThreshold');
      const threshold = parseInt(thresholdInput?.value || 8);
      const hubNodes = this.identifyHubNodes(threshold);
      logger.info(`Auto-applied hub detection: ${hubNodes.length} hubs found with threshold ${threshold}`);
    }
  }

  onStateUpdate(data) {
    if (!this.ui.cy) return;

    const snapshot = data.snapshot;
    if (!snapshot) return;

    const staticData = stateManager.getStaticData();
    if (!staticData) return;

    // Create snapshot interface for rule evaluation
    const snapshotInterface = createStateSnapshotInterface(snapshot, staticData);
    if (!snapshotInterface) return;

    // Update node colors based on region accessibility and location status
    this.ui.cy.nodes().forEach(node => {
      const regionName = node.id();

      // Skip player node
      if (node.hasClass('player')) {
        return;
      }

      // Handle location nodes separately
      if (node.hasClass('location-node')) {
        const parentRegion = node.data('parentRegion');
        const locationName = node.data('locationName') || node.data('label');
        const regionData = staticData.regions[parentRegion];

        if (regionData && regionData.locations) {
          const location = regionData.locations.find(loc => loc.name === locationName);
          if (location) {
            const locationStatus = this.getLocationStatus(parentRegion, location);
            const parentNode = this.ui.cy.getElementById(parentRegion);
            const regionIsAccessible = parentNode.hasClass('accessible');
            const regionAccessClass = regionIsAccessible ? 'region-accessible' : 'region-inaccessible';

            // Update location node classes
            node.removeClass('location-checked location-accessible location-inaccessible region-accessible region-inaccessible');
            node.addClass(`${regionAccessClass} location-${locationStatus}`);
          }
        }
        return;
      }

      // Handle region nodes
      const regionData = staticData.regions[regionName];

      const isReachable = snapshot.regionReachability?.[regionName] === true ||
                         snapshot.regionReachability?.[regionName] === 'reachable' ||
                         snapshot.regionReachability?.[regionName] === 'checked';
      const isVisited = snapshot.visitedRegions &&
                       snapshot.visitedRegions.includes(regionName);

      // Recalculate location counts for updated state
      const locationCounts = this.calculateLocationCounts(regionName, regionData);

      // Get display text based on settings
      const displayText = this.ui.getRegionDisplayText(regionData);

      // Add location counts if there are locations
      const countLabel = `${locationCounts.checked}, ${locationCounts.accessible}, ${locationCounts.inaccessible} / ${locationCounts.total}`;
      const fullLabel = locationCounts.total > 0 ? `${displayText}\n${countLabel}` : displayText;
      node.data('label', fullLabel);
      node.data('locationCounts', locationCounts);

      // Clear all classes
      node.removeClass('accessible inaccessible completed all-accessible mixed-locations all-inaccessible');

      // Apply base accessibility class
      if (isReachable) {
        node.addClass('accessible');
      } else {
        node.addClass('inaccessible');
        return; // Don't apply interior colors for inaccessible regions
      }

      // Determine and apply interior color based on location status
      const interiorColorClass = this.determineNodeInteriorColor(locationCounts, isReachable);
      if (interiorColorClass) {
        node.addClass(interiorColorClass);
      }
    });

    // Update edge colors based on exit accessibility and directionality
    this.ui.cy.edges().forEach(edge => {
      const sourceRegion = edge.source().id();
      const targetRegion = edge.target().id();
      const edgeData = edge.data();
      const isBidirectional = edgeData.isBidirectional;
      const forwardExitRule = edgeData.forwardExitRule;
      const reverseExitRule = edgeData.reverseExitRule;

      // Check if regions are reachable
      const sourceReachable = snapshot.regionReachability?.[sourceRegion] === true ||
                             snapshot.regionReachability?.[sourceRegion] === 'reachable' ||
                             snapshot.regionReachability?.[sourceRegion] === 'checked';

      const targetReachable = snapshot.regionReachability?.[targetRegion] === true ||
                             snapshot.regionReachability?.[targetRegion] === 'reachable' ||
                             snapshot.regionReachability?.[targetRegion] === 'checked';

      // Evaluate exit accessibility for both directions
      let forwardAccessible = true;
      let reverseAccessible = true;

      if (forwardExitRule) {
        try {
          forwardAccessible = evaluateRule(forwardExitRule, snapshotInterface);
        } catch (e) {
          logger.warn(`Error evaluating forward exit rule for edge ${edge.id()}:`, e);
          forwardAccessible = false;
        }
      }

      if (reverseExitRule && isBidirectional) {
        try {
          reverseAccessible = evaluateRule(reverseExitRule, snapshotInterface);
        } catch (e) {
          logger.warn(`Error evaluating reverse exit rule for edge ${edge.id()}:`, e);
          reverseAccessible = false;
        }
      }

      // Clear all classes
      edge.removeClass('accessible inaccessible bidirectional');

      // Add bidirectional class if applicable
      if (isBidirectional) {
        edge.addClass('bidirectional');
      }

      // Determine edge state based on accessibility
      // For bidirectional edges, consider both directions
      let isTraversable;
      if (isBidirectional) {
        // Bidirectional: accessible if either direction is traversable
        const forwardTraversable = sourceReachable && forwardAccessible;
        const reverseTraversable = targetReachable && reverseAccessible;
        isTraversable = forwardTraversable || reverseTraversable;
      } else {
        // Unidirectional: only forward direction matters
        isTraversable = sourceReachable && forwardAccessible;
      }

      if (isTraversable) {
        edge.addClass('accessible');
      } else {
        edge.addClass('inaccessible');
      }
    });
  }

  showAllLocationNodes() {
    // Don't proceed if manually hidden
    if (this.ui.locationsManuallyHidden) return;

    const elementsToAdd = [];

    this.ui.cy.nodes('.region').forEach(region => {
      if (!region.hasClass('player') && !region.hasClass('location-node')) {
        const elements = this.createLocationNodesForRegion(region.id());
        elementsToAdd.push(...elements);
      }
    });

    // Batch add all location nodes
    if (elementsToAdd.length > 0) {
      this.ui.cy.add(elementsToAdd);

      // Lock positions
      this.ui.cy.nodes('.location-node').lock();

      // Update z-order based on distance from viewport center
      this.updateLocationNodeZOrder();
    }
  }

  createLocationNodesForRegion(regionId) {
    const region = this.ui.cy.getElementById(regionId);
    const staticData = stateManager.getStaticData();
    const regionData = staticData?.regions?.[regionId];

    if (!regionData) return [];

    const locations = regionData.locations || [];

    if (locations.length === 0) return [];

    const elements = [];
    const pos = region.position();
    const radius = 80 + (Math.sqrt(locations.length) * 15);

    // Check if region is accessible
    const regionIsAccessible = region.hasClass('accessible');
    const regionAccessClass = regionIsAccessible ? 'region-accessible' : 'region-inaccessible';

    locations.forEach((location, i) => {
      const angle = (2 * Math.PI * i) / locations.length - Math.PI/2;
      const locationStatus = this.getLocationStatus(regionId, location);

      // Get display text for location
      const displayText = this.ui.getLocationDisplayText(location);

      elements.push({
        group: 'nodes',
        data: {
          id: `loc_${regionId}_${location.name}`,
          label: displayText,
          locationName: location.name,
          parentRegion: regionId,
          isLocation: true,
          locked: true
        },
        position: {
          x: pos.x + radius * Math.cos(angle),
          y: pos.y + radius * Math.sin(angle)
        },
        classes: `location-node ${regionAccessClass} location-${locationStatus}`
      });

      elements.push({
        group: 'edges',
        data: {
          id: `edge_${regionId}_${location.name}`,
          source: regionId,
          target: `loc_${regionId}_${location.name}`
        },
        classes: 'region-location-edge'
      });
    });

    return elements;
  }

  hideAllLocationNodes() {
    this.ui.cy.remove('.location-node');
    this.ui.cy.remove('.region-location-edge');
  }

  getLocationStatus(regionId, location) {
    // Returns 'checked', 'accessible', or 'inaccessible'
    const snapshot = stateManager.getLatestStateSnapshot();
    const staticData = stateManager.getStaticData();

    if (!snapshot || !staticData) return 'inaccessible';

    const checkedLocations = new Set(snapshot.checkedLocations || []);

    if (checkedLocations.has(location.name)) {
      return 'checked';
    }

    // Check if region is accessible first
    const regionIsReachable = snapshot.regionReachability?.[regionId] === true ||
                             snapshot.regionReachability?.[regionId] === 'reachable' ||
                             snapshot.regionReachability?.[regionId] === 'checked';

    if (!regionIsReachable) {
      return 'inaccessible';
    }

    // Evaluate location accessibility using existing rule engine
    const snapshotInterface = createStateSnapshotInterface(snapshot, staticData);
    let locationAccessible = true;

    if (location.access_rule) {
      try {
        locationAccessible = evaluateRule(location.access_rule, snapshotInterface);
      } catch (e) {
        logger.warn(`Error evaluating location rule for ${location.name}:`, e);
        locationAccessible = false;
      }
    }

    return locationAccessible ? 'accessible' : 'inaccessible';
  }

  updateLocationNodePositions(regionId) {
    // Update location node positions when a region is moved
    const region = this.ui.cy.getElementById(regionId);
    if (!region || region.length === 0) return;

    const pos = region.position();
    const staticData = stateManager.getStaticData();
    const regionData = staticData?.regions?.[regionId];

    if (!regionData) return;

    const locations = regionData.locations || [];
    if (locations.length === 0) return;

    const radius = 80 + (Math.sqrt(locations.length) * 15);

    locations.forEach((location, i) => {
      const angle = (2 * Math.PI * i) / locations.length - Math.PI/2;
      const locationNode = this.ui.cy.getElementById(`loc_${regionId}_${location.name}`);

      if (locationNode && locationNode.length > 0) {
        // Unlock, update position, and re-lock
        locationNode.unlock();
        locationNode.position({
          x: pos.x + radius * Math.cos(angle),
          y: pos.y + radius * Math.sin(angle)
        });
        locationNode.lock();
      }
    });
  }

  updateLocationNodeZOrder() {
    // Update z-index of location nodes based on distance from viewport center
    if (!this.ui.cy || !this.ui.locationsVisible) return;

    const extent = this.ui.cy.extent();
    const centerX = (extent.x1 + extent.x2) / 2;
    const centerY = (extent.y1 + extent.y2) / 2;

    // Calculate distance for each region and sort
    const regionDistances = [];
    this.ui.cy.nodes('.region').forEach(region => {
      if (!region.hasClass('player') && !region.hasClass('location-node')) {
        const pos = region.position();
        const distance = Math.sqrt(Math.pow(pos.x - centerX, 2) + Math.pow(pos.y - centerY, 2));
        regionDistances.push({
          regionId: region.id(),
          distance: distance
        });
      }
    });

    // Sort by distance (closest first)
    regionDistances.sort((a, b) => a.distance - b.distance);

    // Update z-index for location nodes and edges
    // Base z-index starts at 100 for furthest, increases for closer regions
    const maxZIndex = 1000;
    const minZIndex = 100;
    const zIndexRange = maxZIndex - minZIndex;

    regionDistances.forEach((item, index) => {
      const zIndex = maxZIndex - Math.floor((index / regionDistances.length) * zIndexRange);

      // Update all location nodes for this region
      this.ui.cy.nodes(`[parentRegion="${item.regionId}"]`).forEach(locationNode => {
        locationNode.style('z-index', zIndex);
      });

      // Update edges from this region to its locations
      this.ui.cy.edges(`[source="${item.regionId}"].region-location-edge`).forEach(edge => {
        edge.style('z-index', zIndex - 1); // Edges slightly below their nodes
      });
    });
  }
}