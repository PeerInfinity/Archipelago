import eventBus from '../../app/core/eventBus.js';
import settingsManager from '../../app/core/settingsManager.js';
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import { evaluateRule } from '../shared/ruleEngine.js';
import { createStateSnapshotInterface } from '../shared/stateInterface.js';
import { createUniversalLogger } from '../../app/core/universalLogger.js';

const logger = createUniversalLogger('regionGraph');

/**
 * GraphInteractionManager - Handles all user interactions with the graph
 */
export class GraphInteractionManager {
  constructor(ui) {
    this.ui = ui;
  }

  setupEventHandlers() {
    this.ui.cy.on('tap', 'node', (evt) => {
      const node = evt.target;

      // Skip if this is the player node
      if (node.hasClass('player')) {
        return;
      }

      // Handle location node clicks
      if (node.hasClass('location-node')) {
        this.handleLocationNodeClick(node);
        return; // Don't process as region node
      }

      // Handle region node clicks
      this.handleRegionNodeClick(node);
    });

    this.ui.cy.on('layoutstop', () => {
      this.ui.isLayoutRunning = false;

      // Wait for the animation to complete before saving positions and positioning player
      // Animation duration is 1000ms as defined in runLayout
      setTimeout(() => {
        this.ui.saveNodePositions();
        this.ui.updateStatus('Layout complete');

        // Position the player after layout animation is complete (for initial load)
        if (this.ui.initialPlayerRegion && !this.ui.cy.getElementById('player').length) {
          logger.debug(`Positioning player after layout animation at ${this.ui.initialPlayerRegion}`);
          this.ui.updatePlayerLocation(this.ui.initialPlayerRegion);
          this.ui.initialPlayerRegion = null; // Clear it so we don't reposition on subsequent layouts
        }
      }, 200); // Add small buffer to ensure animation is complete
    });

    // Update location nodes when region nodes are dragged
    this.ui.cy.on('drag', 'node.region', (evt) => {
      const regionNode = evt.target;
      if (!regionNode.hasClass('player') && !regionNode.hasClass('location-node')) {
        // Update positions during drag
        this.ui.updateLocationNodePositions(regionNode.id());
      }
    });

    // Also update on dragfree (end of drag) to ensure final positions are correct
    this.ui.cy.on('dragfree', 'node.region', (evt) => {
      const regionNode = evt.target;
      if (!regionNode.hasClass('player') && !regionNode.hasClass('location-node')) {
        this.ui.updateLocationNodePositions(regionNode.id());
      }
    });

    const resetButton = this.ui.controlPanel.querySelector('#resetView');
    if (resetButton) {
      resetButton.addEventListener('click', () => {
        this.ui.cy.fit(30);
      });
    }

    const relayoutButton = this.ui.controlPanel.querySelector('#relayout');
    if (relayoutButton) {
      relayoutButton.addEventListener('click', () => {
        this.ui.runLayout(true);
      });
    }

    const exportButton = this.ui.controlPanel.querySelector('#exportPositions');
    if (exportButton) {
      exportButton.addEventListener('click', () => {
        this.ui.exportNodePositions();
      });
    }

    const controlsHeader = this.ui.controlPanel.querySelector('#controlsHeader');
    if (controlsHeader) {
      controlsHeader.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.ui.toggleControlPanel();
      });
    }

    // Handle location visibility override checkboxes
    const forceShowLocationsCheckbox = this.ui.controlPanel.querySelector('#forceShowLocations');
    const forceHideLocationsCheckbox = this.ui.controlPanel.querySelector('#forceHideLocations');

    if (forceShowLocationsCheckbox && forceHideLocationsCheckbox) {
      forceShowLocationsCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          forceHideLocationsCheckbox.checked = false;
          this.ui.saveCheckboxSetting('#forceHideLocations', 'regionGraph.forceHideLocations', false);
          this.ui.locationsManuallyShown = true;
          this.ui.locationsManuallyHidden = false;
        } else {
          this.ui.locationsManuallyShown = false;
        }
        this.ui.saveCheckboxSetting('#forceShowLocations', 'regionGraph.forceShowLocations', e.target.checked);
        this.updateZoomBasedVisibility();
      });

      forceHideLocationsCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          forceShowLocationsCheckbox.checked = false;
          this.ui.saveCheckboxSetting('#forceShowLocations', 'regionGraph.forceShowLocations', false);
          this.ui.locationsManuallyHidden = true;
          this.ui.locationsManuallyShown = false;
        } else {
          this.ui.locationsManuallyHidden = false;
        }
        this.ui.saveCheckboxSetting('#forceHideLocations', 'regionGraph.forceHideLocations', e.target.checked);
        this.updateZoomBasedVisibility();
      });
    }

    // Make "Add to path" and "Overwrite path" mutually exclusive
    const addToPathCheckbox = this.ui.controlPanel.querySelector('#addToPath');
    const overwritePathCheckbox = this.ui.controlPanel.querySelector('#overwritePath');

    if (addToPathCheckbox && overwritePathCheckbox) {
      addToPathCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          overwritePathCheckbox.checked = false;
          this.ui.saveCheckboxSetting('#overwritePath', 'regionGraph.overwritePath', false);
        }
        this.ui.saveCheckboxSetting('#addToPath', 'regionGraph.addToPath', e.target.checked);
      });

      overwritePathCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          addToPathCheckbox.checked = false;
          this.ui.saveCheckboxSetting('#addToPath', 'regionGraph.addToPath', false);
        }
        this.ui.saveCheckboxSetting('#overwritePath', 'regionGraph.overwritePath', e.target.checked);
      });
    }

    // Make "Move player one step" and "Move player directly" mutually exclusive
    const moveOneStepCheckbox = this.ui.controlPanel.querySelector('#movePlayerOneStep');
    const moveDirectlyCheckbox = this.ui.controlPanel.querySelector('#movePlayerDirectly');

    if (moveOneStepCheckbox && moveDirectlyCheckbox) {
      moveOneStepCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          moveDirectlyCheckbox.checked = false;
          this.ui.saveCheckboxSetting('#movePlayerDirectly', 'regionGraph.movePlayerDirectly', false);
        }
        this.ui.saveCheckboxSetting('#movePlayerOneStep', 'regionGraph.movePlayerOneStep', e.target.checked);
      });

      moveDirectlyCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          moveOneStepCheckbox.checked = false;
          this.ui.saveCheckboxSetting('#movePlayerOneStep', 'regionGraph.movePlayerOneStep', false);
        }
        this.ui.saveCheckboxSetting('#movePlayerDirectly', 'regionGraph.movePlayerDirectly', e.target.checked);
      });
    }

    // Handle the "Show region in panel" checkbox
    const showRegionInPanelCheckbox = this.ui.controlPanel.querySelector('#showRegionInPanel');
    if (showRegionInPanelCheckbox) {
      showRegionInPanelCheckbox.addEventListener('change', (e) => {
        this.ui.saveCheckboxSetting('#showRegionInPanel', 'regionGraph.showRegionInPanel', e.target.checked);
      });
    }

    // Handle the "Add locations to path" checkbox
    const addLocationsToPathCheckbox = this.ui.controlPanel.querySelector('#addLocationsToPath');
    if (addLocationsToPathCheckbox) {
      addLocationsToPathCheckbox.addEventListener('change', (e) => {
        this.ui.saveCheckboxSetting('#addLocationsToPath', 'regionGraph.addLocationsToPath', e.target.checked);
      });
    }

    const checkAllLocationsInRegionCheckbox = this.ui.controlPanel.querySelector('#checkAllLocationsInRegion');
    if (checkAllLocationsInRegionCheckbox) {
      checkAllLocationsInRegionCheckbox.addEventListener('change', (e) => {
        this.ui.saveCheckboxSetting('#checkAllLocationsInRegion', 'regionGraph.checkAllLocationsInRegion', e.target.checked);
      });
    }
  }

  handleLocationNodeClick(node) {
    const locationName = node.data('locationName') || node.data('label');
    const parentRegion = node.data('parentRegion');

    logger.debug(`Location node clicked: ${locationName} in ${parentRegion}`);

    // Check which actions are enabled via checkboxes (same logic as region nodes)
    const movePlayerOneStepCheckbox = this.ui.controlPanel.querySelector('#movePlayerOneStep');
    const movePlayerDirectlyCheckbox = this.ui.controlPanel.querySelector('#movePlayerDirectly');
    const showRegionCheckbox = this.ui.controlPanel.querySelector('#showRegionInPanel');
    const addToPathCheckbox = this.ui.controlPanel.querySelector('#addToPath');
    const overwritePathCheckbox = this.ui.controlPanel.querySelector('#overwritePath');

    // Check if we should add to path (use settings)
    settingsManager.getSetting('regionGraph.addLocationsToPath', false).then(shouldAddToPath => {
      if (shouldAddToPath) {
        logger.debug(`Adding location ${locationName} to path in region ${parentRegion}`);

        // First, navigate to the region using the same logic as region node clicks
        if (addToPathCheckbox && addToPathCheckbox.checked) {
          this.ui.addToPath(parentRegion, movePlayerOneStepCheckbox && movePlayerOneStepCheckbox.checked);
        } else if (overwritePathCheckbox && overwritePathCheckbox.checked) {
          this.ui.overwritePath(parentRegion, movePlayerOneStepCheckbox && movePlayerOneStepCheckbox.checked);
        } else {
          // Neither path option is checked - handle move player options
          if (movePlayerOneStepCheckbox && movePlayerOneStepCheckbox.checked) {
            this.ui.attemptMovePlayerOneStepToRegion(parentRegion);
          }
          if (movePlayerDirectlyCheckbox && movePlayerDirectlyCheckbox.checked) {
            this.ui.attemptMovePlayerDirectlyToRegion(parentRegion);
          }
        }

        // Then add the location check to the path
        import('../playerState/singleton.js').then(({ getPlayerStateSingleton }) => {
          const playerState = getPlayerStateSingleton();
          playerState.addLocationCheck(locationName, parentRegion);
          logger.debug(`Added location ${locationName} to player path`);
          // The path update will automatically trigger highlightPathEdges via the event system
        }).catch(error => {
          logger.error('Error adding location to path:', error);
        });
      } else {
        // Original behavior - dispatch location check event
        this.dispatchLocationCheckEvent(locationName, parentRegion);
      }
    }).catch(error => {
      logger.error('Error getting setting:', error);
      // Fallback to original behavior
      this.dispatchLocationCheckEvent(locationName, parentRegion);
    });
  }

  dispatchLocationCheckEvent(locationName, parentRegion) {
    import('./index.js').then(({ moduleDispatcher }) => {
      const payload = {
        locationName: locationName,
        regionName: parentRegion,
        originator: 'RegionGraphCheck',
        originalDOMEvent: true,
      };

      if (moduleDispatcher) {
        moduleDispatcher.publish('user:locationCheck', payload, {
          initialTarget: 'bottom',
        });
        logger.debug('Dispatched user:locationCheck', payload);
      } else {
        logger.error('moduleDispatcher not available to handle location check.');
      }
    }).catch(error => {
      logger.error('Error importing moduleDispatcher:', error);
    });
  }

  handleRegionNodeClick(node) {
    const regionName = node.id(); // Node ID is the region name

    this.ui.selectedNode = regionName;

    logger.debug(`Node clicked: ${regionName}`);

    // Update visual selection
    this.ui.cy.$('node').removeClass('selected');
    node.addClass('selected');

    // Publish the custom regionGraph event for any other listeners
    eventBus.publish('regionGraph:nodeSelected', {
      nodeId: regionName,
      data: node.data()
    }, 'regionGraph');

    // Check which actions are enabled via checkboxes
    const movePlayerOneStepCheckbox = this.ui.controlPanel.querySelector('#movePlayerOneStep');
    const movePlayerDirectlyCheckbox = this.ui.controlPanel.querySelector('#movePlayerDirectly');
    const showRegionCheckbox = this.ui.controlPanel.querySelector('#showRegionInPanel');
    const addToPathCheckbox = this.ui.controlPanel.querySelector('#addToPath');
    const overwritePathCheckbox = this.ui.controlPanel.querySelector('#overwritePath');

    // Handle path modifications (Add to path or Overwrite path)
    if (addToPathCheckbox && addToPathCheckbox.checked) {
      this.ui.addToPath(regionName, movePlayerOneStepCheckbox && movePlayerOneStepCheckbox.checked);
    } else if (overwritePathCheckbox && overwritePathCheckbox.checked) {
      this.ui.overwritePath(regionName, movePlayerOneStepCheckbox && movePlayerOneStepCheckbox.checked);
    } else {
      // Neither path option is checked - handle move player options
      // Move player one step towards region (if enabled)
      if (movePlayerOneStepCheckbox && movePlayerOneStepCheckbox.checked) {
        this.ui.attemptMovePlayerOneStepToRegion(regionName);
      }

      // Move player directly to region (if enabled)
      if (movePlayerDirectlyCheckbox && movePlayerDirectlyCheckbox.checked) {
        this.ui.attemptMovePlayerDirectlyToRegion(regionName);
      }
    }

    // Show region in Regions panel (if enabled)
    if (showRegionCheckbox && showRegionCheckbox.checked) {
      // Control "Show All Regions" based on path modification checkboxes
      const shouldShowAll = !(addToPathCheckbox?.checked || overwritePathCheckbox?.checked);
      this.ui.setShowAllRegions(shouldShowAll);

      // Activate the regions panel
      eventBus.publish('ui:activatePanel', { panelId: 'regionsPanel' }, 'regionGraph');
      logger.debug('Published ui:activatePanel for regionsPanel');

      // Navigate to the region
      eventBus.publish('ui:navigateToRegion', { regionName: regionName }, 'regionGraph');
      logger.debug(`Published ui:navigateToRegion for ${regionName}`);
    }

    // Check all locations in region (if enabled)
    const checkAllLocationsCheckbox = this.ui.controlPanel.querySelector('#checkAllLocationsInRegion');
    if (checkAllLocationsCheckbox && checkAllLocationsCheckbox.checked) {
      this.checkAllLocationsInRegion(regionName);
    }
  }

  checkAllLocationsInRegion(regionName) {
    // Get locations in this region
    const staticData = stateManager.getStaticData();
    const regionData = staticData?.regions?.[regionName];

    if (regionData && regionData.locations && regionData.locations.length > 0) {
      // Get current state to check which locations are accessible
      const snapshot = stateManager.getLatestStateSnapshot();
      const snapshotInterface = createStateSnapshotInterface(snapshot, staticData);
      const checkedLocations = new Set(snapshot.checkedLocations || []);

      // Check each location that is accessible and not already checked
      import('./index.js').then(({ moduleDispatcher }) => {
        let locationsChecked = 0;

        regionData.locations.forEach(location => {
          // Skip if already checked
          if (checkedLocations.has(location.name)) {
            return;
          }

          // Check if location is accessible
          const isAccessible = location.requires ?
            evaluateRule(location.requires, snapshotInterface) : true;

          if (isAccessible) {
            // Dispatch location check event
            const payload = {
              locationName: location.name,
              regionName: regionName,
              originator: 'RegionGraphBulkCheck',
              originalDOMEvent: true,
            };

            if (moduleDispatcher) {
              moduleDispatcher.publish('user:locationCheck', payload, {
                initialTarget: 'bottom',
              });
              locationsChecked++;
              logger.debug('Dispatched user:locationCheck for bulk check', payload);
            }
          }
        });

        if (locationsChecked > 0) {
          logger.debug(`Checked ${locationsChecked} accessible locations in ${regionName}`);
        }
      }).catch(error => {
        logger.error('Error importing moduleDispatcher for bulk location check:', error);
      });
    }
  }

  highlightCurrentRegion(regionName) {
    if (!this.ui.cy) return;

    this.ui.cy.nodes().removeClass('current');

    const node = this.ui.cy.getElementById(regionName);
    if (node && node.length > 0) {
      node.addClass('current');
    }
  }

  highlightPathEdges() {
    if (!this.ui.cy) return;

    // Remove existing path highlighting from edges
    this.ui.cy.edges().removeClass('in-path');

    // Get the full path including location checks from playerState
    import('../playerState/singleton.js').then(({ getPlayerStateSingleton }) => {
      const playerState = getPlayerStateSingleton();
      const fullPath = playerState.getPath();

      if (!fullPath || fullPath.length < 1) return;

      // Highlight edges between consecutive regions in the path (regionMove entries)
      for (let i = 0; i < this.ui.currentPath.length - 1; i++) {
        const source = this.ui.currentPath[i].region;
        const target = this.ui.currentPath[i + 1].region;

        // Find edge between source and target (consider both directions)
        const edge = this.ui.cy.edges(`[source="${source}"][target="${target}"], [source="${target}"][target="${source}"]`);
        if (edge && edge.length > 0) {
          edge.addClass('in-path');
        }
      }

      // Also highlight edges to checked locations in the path (only if location nodes are visible)
      if (this.ui.locationsVisible) {
        fullPath.forEach(entry => {
          if (entry.type === 'locationCheck') {
            const locationNodeId = `loc_${entry.region}_${entry.locationName}`;
            const locationNode = this.ui.cy.getElementById(locationNodeId);

            if (locationNode && locationNode.length > 0) {
              // Highlight the edge from region to location
              const edge = this.ui.cy.edges(`[source="${entry.region}"][target="${locationNodeId}"]`);
              if (edge && edge.length > 0) {
                edge.addClass('in-path');
              }
            }
          }
        });
      }
    }).catch(error => {
      logger.error('Error getting path for edge highlighting:', error);
    });
  }

  setupZoomBasedVisibility() {
    // Initialize zoom tracking
    this.ui.currentZoomLevel = this.ui.cy.zoom();
    this.ui.locationsVisible = false;

    // Listen to zoom/pan events
    this.ui.cy.on('zoom pan', () => {
      this.updateZoomBasedVisibility();
      this.ui.updateLocationNodeZOrder();
    });

    // Also update z-order when viewport changes
    this.ui.cy.on('viewport', () => {
      this.ui.updateLocationNodeZOrder();
    });
  }

  updateZoomBasedVisibility() {
    const zoom = this.ui.cy.zoom();
    const prevZoom = this.ui.currentZoomLevel;
    this.ui.currentZoomLevel = zoom;

    // Handle location node visibility (check manual overrides)
    if (this.ui.locationsManuallyShown) {
      if (!this.ui.locationsVisible) {
        this.ui.showAllLocationNodes();
        this.ui.locationsVisible = true;
      }
    } else if (this.ui.locationsManuallyHidden) {
      if (this.ui.locationsVisible) {
        this.ui.hideAllLocationNodes();
        this.ui.locationsVisible = false;
      }
    } else {
      // Normal zoom-based visibility
      if (zoom >= this.ui.zoomLevels.showLocationNodes && !this.ui.locationsVisible) {
        this.ui.showAllLocationNodes();
        this.ui.locationsVisible = true;
      } else if (zoom < this.ui.zoomLevels.showLocationNodes && this.ui.locationsVisible) {
        this.ui.hideAllLocationNodes();
        this.ui.locationsVisible = false;
      }
    }

    // Update label visibility based on zoom and manual overrides
    this.updateLabelVisibility(zoom);
  }

  updateLabelVisibility(zoom) {
    // Check if locations are manually shown - if so, show their labels at same zoom as region labels
    const forceShowLocationLabels = this.ui.locationsManuallyShown;

    // Update visibility of labels based on zoom level
    if (zoom < this.ui.zoomLevels.hideAllLabels) {
      // Hide all labels
      this.ui.cy.style()
        .selector('node').style('label', '')
        .selector('edge').style('label', '')
        .update();
    } else if (zoom < this.ui.zoomLevels.showRegionNames) {
      // Still hide all labels
      this.ui.cy.style()
        .selector('node').style('label', '')
        .selector('edge').style('label', '')
        .update();
    } else if (zoom < this.ui.zoomLevels.showRegionCounts) {
      // Show only region names, no counts
      const staticData = stateManager.getStaticData();
      this.ui.cy.nodes().forEach(node => {
        if (!node.hasClass('location-node') && !node.hasClass('player')) {
          const regionName = node.data('regionName') || node.id();
          const regionData = staticData?.regions?.[regionName];
          const displayText = regionData ? this.ui.getRegionDisplayText(regionData) : regionName.replace(/_/g, ' ');
          node.data('label', displayText);
        }
      });
      // Apply the labels and hide edge labels
      // Show location labels if forced (at same zoom as region labels)
      this.ui.cy.style()
        .selector('node.region').style('label', 'data(label)')
        .selector('.location-node').style('label', forceShowLocationLabels ? 'data(label)' : '')
        .selector('edge').style('label', '')
        .update();
    } else if (zoom < this.ui.zoomLevels.showRegionEdgeLabels) {
      // Show region names with counts
      this.updateRegionLabelsWithCounts();
      // Show location labels if forced (at same zoom as region labels)
      this.ui.cy.style()
        .selector('node.region').style('label', 'data(label)')
        .selector('.location-node').style('label', forceShowLocationLabels ? 'data(label)' : '')
        .selector('edge').style('label', '')
        .update();
    } else if (zoom < this.ui.zoomLevels.showLocationNodes) {
      // Show region nodes with counts and edge labels
      this.updateRegionLabelsWithCounts();
      // Apply all labels except location nodes (unless forced)
      this.ui.cy.style()
        .selector('node.region').style('label', 'data(label)')
        .selector('node.player').style('label', 'data(label)')
        .selector('.location-node').style('label', forceShowLocationLabels ? 'data(label)' : '')
        .selector('edge[label]').style('label', 'data(label)')
        .selector('.region-location-edge').style('label', '')
        .update();
    } else if (zoom < this.ui.zoomLevels.showLocationLabels) {
      // Show everything except location labels
      this.updateRegionLabelsWithCounts();
      this.ui.cy.style()
        .selector('node.region').style('label', 'data(label)')
        .selector('node.player').style('label', 'data(label)')
        .selector('.location-node').style('label', forceShowLocationLabels ? 'data(label)' : '')
        .selector('edge[label]').style('label', 'data(label)')
        .selector('.region-location-edge').style('label', '')
        .update();
    } else {
      // Show everything including location labels
      this.updateRegionLabelsWithCounts();
      this.ui.cy.style()
        .selector('node.region').style('label', 'data(label)')
        .selector('node.player').style('label', 'data(label)')
        .selector('.location-node').style('label', 'data(label)')
        .selector('edge[label]').style('label', 'data(label)')
        .selector('.region-location-edge').style('label', '')
        .update();
    }

    // Reapply path highlighting after any style updates that might have reset it
    this.highlightPathEdges();
  }

  updateRegionLabelsWithCounts() {
    const staticData = stateManager.getStaticData();
    this.ui.cy.nodes().forEach(node => {
      if (!node.hasClass('location-node') && !node.hasClass('player')) {
        const regionName = node.data('regionName') || node.id();
        const regionData = staticData?.regions?.[regionName];
        const locationCounts = node.data('locationCounts');
        if (locationCounts && locationCounts.total > 0) {
          const displayText = regionData ? this.ui.getRegionDisplayText(regionData) : regionName.replace(/_/g, ' ');
          const countLabel = `${locationCounts.checked}, ${locationCounts.accessible}, ${locationCounts.inaccessible} / ${locationCounts.total}`;
          node.data('label', `${displayText}\n${countLabel}`);
        } else {
          const displayText = regionData ? this.ui.getRegionDisplayText(regionData) : regionName.replace(/_/g, ' ');
          node.data('label', displayText);
        }
      }
    });
  }
}