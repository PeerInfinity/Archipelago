import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import { createSnapshotInterface } from '../shared/snapshotInterface.js';
import { getPlayerStateSingleton } from '../playerState/singleton.js';
import { getRegionMovesFromPath } from '../shared/pathUtils.js';
import { createUniversalLogger } from '../../app/core/universalLogger.js';
import discoveryStateSingleton from '../discovery/singleton.js';

const logger = createUniversalLogger('regionGraph');

/**
 * NavigationManager - Handles movement and pathfinding
 */
export class NavigationManager {
  constructor(ui) {
    this.ui = ui;
  }

  /**
   * Get the primary start region from stateManager, with fallback
   * @returns {string} The primary start region name
   */
  getPrimaryStartRegion() {
    const startRegions = stateManager.getStartRegions?.();
    if (Array.isArray(startRegions) && startRegions.length > 0) {
      return startRegions[0];
    }
    // Fallback: use the first region from static data
    const staticData = stateManager.getStaticData?.();
    if (staticData && staticData.regions && staticData.regions.size > 0) {
      return staticData.regions.keys().next().value;
    }
    return null;
  }

  /**
   * Check if a region is a start region
   * @param {string} regionName - The region to check
   * @returns {boolean} Whether the region is a start region
   */
  isStartRegion(regionName) {
    const startRegions = stateManager.getStartRegions?.() || [];
    return startRegions.includes(regionName);
  }

  onPathUpdate(data) {
    if (!data || !data.path) return;

    logger.debug(`Path updated with ${data.path.length} entries`);

    // Store the path data (filter for only regionMove entries)
    this.ui.currentPath = getRegionMovesFromPath(data.path);
    this.ui.regionPathCounts = data.regionCounts || new Map();
    logger.debug(`Filtered to ${this.ui.currentPath.length} region moves`);

    // Update node labels to include path counts
    if (this.ui.cy) {
      this.ui.cy.nodes().forEach(node => {
        // Skip location nodes and player nodes - only update region nodes
        if (node.hasClass('location-node') || node.hasClass('player')) {
          return;
        }

        const regionName = node.id();
        const count = this.ui.regionPathCounts.get(regionName) || 0;

        // In discovery mode, undiscovered regions show ??? or name depending on setting
        const isDiscoveryModeActive = this.ui.isDiscoveryModeActive || false;
        const showUndiscoveredNames = this.ui.discoverySettings?.showUndiscoveredRegionNames || false;
        if (isDiscoveryModeActive && !discoveryStateSingleton.isRegionDiscovered(regionName)) {
          if (showUndiscoveredNames && !node.hasClass('discovery-hidden')) {
            const staticData = stateManager.getStaticData();
            const regionData = staticData?.regions?.get(regionName);
            node.data('label', regionData ? this.ui.getRegionDisplayText(regionData) : regionName.replace(/_/g, ' '));
          } else {
            node.data('label', '???');
          }
          node.removeClass('in-path path-single path-multiple');
        } else {
          // Update the label to include count if region is in path
          const staticData = stateManager.getStaticData();
          const regionData = staticData?.regions?.get(regionName);
          const baseText = regionData ? this.ui.getRegionDisplayText(regionData) : regionName.replace(/_/g, ' ');

          if (count > 0) {
            node.data('label', `${baseText} (${count})`);
            node.addClass('in-path');

            // Add different classes based on count for visual distinction
            if (count === 1) {
              node.removeClass('path-multiple');
              node.addClass('path-single');
            } else {
              node.removeClass('path-single');
              node.addClass('path-multiple');
            }
          } else {
            node.data('label', baseText);
            node.removeClass('in-path path-single path-multiple');
          }
        }
      });

      // Highlight edges in the path
      this.ui.highlightPathEdges();

      // Update player position now that we have path data
      // Only update immediately if no layout is running, otherwise it will be handled by layoutstop
      if (!this.ui.isLayoutRunning) {
        const currentPlayerRegion = this.getCurrentPlayerLocation();
        if (currentPlayerRegion) {
          this.updatePlayerLocation(currentPlayerRegion);
        }
      } else {
        // Store the region for positioning after layout completes
        this.ui.initialPlayerRegion = this.getCurrentPlayerLocation();
        logger.debug('Deferring player positioning until layout completes');
      }
    }
  }

  updatePlayerLocation(regionName) {
    if (!this.ui.cy) return;

    logger.debug(`Updating player location to: ${regionName}`, { currentPath: this.ui.currentPath });

    // Remove existing player node
    this.ui.cy.remove('#player');

    // Find the target region node
    const regionNode = this.ui.cy.getElementById(regionName);
    if (!regionNode || regionNode.length === 0) {
      // Region may not exist yet (e.g. placeholder before rules load) or in this graph
      const staticData = stateManager.getStaticData?.();
      const existsInStaticData = staticData?.regions?.has(regionName);
      const logLevel = (!existsInStaticData || !this.ui.graphInitialized || this.isStartRegion(regionName)) ? 'debug' : 'warn';
      logger[logLevel](`Region node not found: ${regionName}`);
      return;
    }

    // Get the position of the region node
    const regionPos = regionNode.position();
    logger.verbose(`${regionName} node position`, { regionPos });
    let playerPos = { x: regionPos.x + 30, y: regionPos.y - 30 }; // Default offset position
    logger.verbose('Default player position', { playerPos });

    // Check if player is at the end of the path and should be positioned at exit edge
    // Always use default positioning for start regions
    if (!this.isStartRegion(regionName) && this.ui.currentPath && this.ui.currentPath.length > 0) {
      const lastPathEntry = this.ui.currentPath[this.ui.currentPath.length - 1];
      logger.verbose('Last path entry', { lastPathEntry });

      // If player's current region is the last region in path AND we have exit info
      if (lastPathEntry.destinationRegion === regionName && lastPathEntry.exitUsed) {
        // Find the previous region in the path to determine the incoming edge
        const previousRegion = this.ui.currentPath.length > 1 ?
          this.ui.currentPath[this.ui.currentPath.length - 2].destinationRegion : null;

        logger.verbose(`Previous region in path: ${previousRegion}`);

        if (previousRegion) {
          // Get edge position for the incoming exit
          const exitEdgePos = this.getIncomingExitEdgePosition(regionName, previousRegion, lastPathEntry.exitUsed);

          if (exitEdgePos) {
            playerPos = exitEdgePos;
            logger.verbose('Using exit edge position for player', { playerPos });
          }
        }
      }
    }

    // Add player node at the determined position
    this.ui.cy.add({
      group: 'nodes',
      data: {
        id: 'player',
        label: '👤'
      },
      position: playerPos,
      classes: 'player'
    });

    // Lock the player node to prevent dragging
    this.ui.cy.getElementById('player').lock();

    logger.debug(`Player node added at ${regionName}`, { playerPos });

    // Also highlight the current region
    this.ui.highlightCurrentRegion(regionName);
  }

  getIncomingExitEdgePosition(targetRegionName, sourceRegionName, exitName) {
    // Find the edge that corresponds to the incoming connection
    const sourceNode = this.ui.cy.getElementById(sourceRegionName);
    const targetNode = this.ui.cy.getElementById(targetRegionName);

    if (!sourceNode || sourceNode.length === 0 || !targetNode || targetNode.length === 0) {
      return null;
    }

    // Look for edges between these two regions (in either direction)
    const allEdges = this.ui.cy.edges();

    for (let i = 0; i < allEdges.length; i++) {
      const edge = allEdges[i];
      const edgeData = edge.data();
      const edgeSource = edge.source().id();
      const edgeTarget = edge.target().id();

      // Check if this edge connects our source and target regions
      const isCorrectConnection = (edgeSource === sourceRegionName && edgeTarget === targetRegionName) ||
        (edgeSource === targetRegionName && edgeTarget === sourceRegionName);

      if (isCorrectConnection) {
        // Check if this edge corresponds to the exit we're looking for
        const hasCorrectExitName = edgeData.exitName === exitName ||
          edgeData.forwardExitName === exitName ||
          edgeData.reverseExitName === exitName ||
          (edgeData.label && edgeData.label.includes(exitName));

        if (hasCorrectExitName) {
          const sourcePos = sourceNode.position();
          const targetPos = targetNode.position();

          // Calculate a position along the edge, closer to the target (85% from source to target)
          const t = 0.85;
          const edgePos = {
            x: sourcePos.x + (targetPos.x - sourcePos.x) * t,
            y: sourcePos.y + (targetPos.y - sourcePos.y) * t
          };

          return edgePos;
        }
      }
    }

    // If we couldn't find the specific exit edge, return null to use default positioning
    return null;
  }

  getCurrentPlayerLocation() {
    try {
      const playerState = getPlayerStateSingleton();
      return playerState ? playerState.getCurrentRegion() : null;
    } catch (error) {
      logger.warn('Error getting player location:', error);
      return null;
    }
  }

  attemptMovePlayerOneStepToRegion(targetRegion) {
    const currentPlayerRegion = this.getCurrentPlayerLocation();

    if (!currentPlayerRegion) {
      logger.warn('Cannot determine current player location');
      return;
    }

    if (currentPlayerRegion === targetRegion) {
      logger.debug(`Player is already in target region: ${targetRegion}`);
      return;
    }

    // Find path to target region
    logger.debug(`Finding path from ${currentPlayerRegion} to ${targetRegion}`);
    const path = this.ui.pathFinder.findPath(currentPlayerRegion, targetRegion);

    if (!path || path.length === 0) {
      logger.warn(`No accessible path found from ${currentPlayerRegion} to ${targetRegion}`);
      // Show a brief status message
      this.ui.updateStatus(`No path to ${targetRegion}`);
      setTimeout(() => {
        if (this.ui.cy) {
          const nodeCount = this.ui.cy.nodes().length;
          const edgeCount = this.ui.cy.edges().length;
          this.ui.updateStatus(`Loaded ${nodeCount} regions, ${edgeCount} connections`);
        }
      }, 2000);
      return;
    }

    if (!path.nextExit) {
      logger.warn('Path found but no next exit determined');
      return;
    }

    logger.info('Moving player via path', { steps: path.steps, nextExit: path.nextExit });

    // Execute the first step of the path using moduleDispatcher
    import('./index.js').then(({ moduleDispatcher }) => {
      if (moduleDispatcher) {
        moduleDispatcher.publish('user:regionMove', {
          sourceRegion: currentPlayerRegion,
          sourceUID: undefined, // No specific UID for graph-based moves
          targetRegion: path.steps[1], // Next region in path
          exitName: path.nextExit,
          updatePath: false,
          source: 'regionGraph-oneStep'
        }, 'bottom');
        logger.debug(`Published user:regionMove via dispatcher from ${currentPlayerRegion} to ${path.steps[1]}`);
      } else {
        logger.warn('moduleDispatcher not available for publishing user:regionMove');
      }
    });

    // Show path info in status
    if (path.length === 1) {
      this.ui.updateStatus(`Moving to ${targetRegion}`);
    } else {
      this.ui.updateStatus(`Moving to ${targetRegion} (${path.length} steps via ${path.steps[1]})`);
    }
  }

  attemptMovePlayerDirectlyToRegion(targetRegion) {
    const currentPlayerRegion = this.getCurrentPlayerLocation();

    if (!currentPlayerRegion) {
      logger.warn('Cannot determine current player location');
      return;
    }

    if (currentPlayerRegion === targetRegion) {
      logger.debug(`Player is already in target region: ${targetRegion}`);
      return;
    }

    // Find path to target region
    logger.debug(`Finding direct path from ${currentPlayerRegion} to ${targetRegion}`);
    const path = this.ui.pathFinder.findPath(currentPlayerRegion, targetRegion);

    if (!path || path.length === 0) {
      logger.warn(`No accessible path found from ${currentPlayerRegion} to ${targetRegion}`);
      // Show a brief status message
      this.ui.updateStatus(`No path to ${targetRegion}`);
      setTimeout(() => {
        if (this.ui.cy) {
          const nodeCount = this.ui.cy.nodes().length;
          const edgeCount = this.ui.cy.edges().length;
          this.ui.updateStatus(`Loaded ${nodeCount} regions, ${edgeCount} connections`);
        }
      }, 2000);
      return;
    }

    // For direct movement, we want the final step of the path
    const finalSourceRegion = path.steps[path.steps.length - 2]; // Second to last region

    // Get the adjacency map to find the final exit name
    const staticData = this.ui.pathFinder.stateManager.getStaticData();
    const snapshot = this.ui.pathFinder.stateManager.getLatestStateSnapshot();
    const snapshotInterface = createSnapshotInterface(snapshot, staticData);
    const adjacencyMap = this.ui.pathFinder.buildAccessibilityMap(staticData, snapshot, snapshotInterface);

    const finalExitName = this.ui.pathFinder.findExitBetweenRegions(
      finalSourceRegion,
      targetRegion,
      adjacencyMap
    );

    if (!finalExitName) {
      logger.warn('Could not determine final exit name for direct move');
      return;
    }

    logger.info(`Moving player directly to ${targetRegion} via final exit: ${finalExitName}`);

    // Execute the final step of the path directly
    import('./index.js').then(({ moduleDispatcher }) => {
      if (moduleDispatcher) {
        moduleDispatcher.publish('user:regionMove', {
          sourceRegion: finalSourceRegion,
          sourceUID: undefined, // No specific UID for graph-based moves
          targetRegion: targetRegion,
          exitName: finalExitName,
          updatePath: false,
          source: 'regionGraph-direct'
        }, 'bottom');
        logger.debug(`Published direct user:regionMove via dispatcher from ${finalSourceRegion} to ${targetRegion}`);
      } else {
        logger.warn('moduleDispatcher not available for publishing user:regionMove');
      }
    });

    // Show path info in status
    if (path.length === 1) {
      this.ui.updateStatus(`Moving directly to ${targetRegion}`);
    } else {
      this.ui.updateStatus(`Moving directly to ${targetRegion} (skipping ${path.length - 1} steps)`);
    }
  }

  addToPath(targetRegion, moveOnlyOneStep = false) {
    // Get the current path from playerState
    const playerState = getPlayerStateSingleton();
    const currentPath = playerState.getPath();

    if (!currentPath || currentPath.length === 0) {
      logger.warn('No current path to add to');
      this.ui.updateStatus(`No existing path`);
      return;
    }

    // Start from the last region in the current path
    const startRegion = currentPath[currentPath.length - 1].destinationRegion;

    if (startRegion === targetRegion) {
      logger.debug(`Target region ${targetRegion} is already at end of path`);
      return;
    }

    // Find path from current end to target
    logger.debug(`Finding path from ${startRegion} to ${targetRegion}`);
    const path = this.ui.pathFinder.findPath(startRegion, targetRegion);

    if (!path || path.length === 0) {
      logger.warn(`No accessible path found from ${startRegion} to ${targetRegion}`);
      this.ui.updateStatus(`No path from ${startRegion} to ${targetRegion}`);
      return;
    }

    // Disable "Show All Regions" before executing moves
    this.setShowAllRegions(false);

    // Execute the path by sending user:regionMove events
    // Skip the first region in the path (it's our starting point)
    const stepsToExecute = moveOnlyOneStep ? [path.steps[1]] : path.steps.slice(1);

    logger.info(`Adding to path: ${stepsToExecute.join(' → ')}`);

    // Build adjacency map for finding exits
    const staticData = stateManager.getStaticData();
    const snapshot = stateManager.getLatestStateSnapshot();
    const snapshotInterface = createSnapshotInterface(snapshot, staticData);
    const adjacencyMap = this.ui.pathFinder.buildAccessibilityMap(staticData, snapshot, snapshotInterface);

    stepsToExecute.forEach((stepRegion, index) => {
      // Find the exit to use for this step
      const sourceRegion = index === 0 ? startRegion : stepsToExecute[index - 1];
      const exitName = this.ui.pathFinder.findExitBetweenRegions(
        sourceRegion,
        stepRegion,
        adjacencyMap
      );

      // Manually update the path since we disabled automatic path updates
      playerState.updatePath(stepRegion, exitName, sourceRegion);

      // Import and use moduleDispatcher to send the event
      import('./index.js').then(({ moduleDispatcher }) => {
        if (moduleDispatcher) {
          moduleDispatcher.publish('user:regionMove', {
            sourceRegion: sourceRegion,
            targetRegion: stepRegion,
            exitName: exitName,
            updatePath: false,
            source: 'regionGraph-addToPath'
          }, 'bottom');
          logger.debug(`Published user:regionMove from ${sourceRegion} to ${stepRegion}`);
        }
      });
    });

    this.ui.updateStatus(`Added ${stepsToExecute.length} region(s) to path`);
  }

  overwritePath(targetRegion, moveOnlyOneStep = false) {
    // Get the start region from stateManager
    const startRegion = this.getPrimaryStartRegion();

    // First, set player to start region and reset the path
    logger.debug(`Resetting player to ${startRegion} and clearing path`);
    const playerState = getPlayerStateSingleton();

    // Set current region to start region first
    playerState.setCurrentRegion(startRegion);

    // Then trim the path (this will reset path to just start region)
    playerState.trimPath(startRegion, 1);

    // Disable "Show All Regions" before executing moves
    this.setShowAllRegions(false);

    if (startRegion === targetRegion) {
      logger.debug(`Target region is ${startRegion}, path already reset`);
      return;
    }

    logger.debug(`Finding path from ${startRegion} to ${targetRegion}`);
    const path = this.ui.pathFinder.findPath(startRegion, targetRegion);

    if (!path || path.length === 0) {
      logger.warn(`No accessible path found from ${startRegion} to ${targetRegion}`);
      this.ui.updateStatus(`No path from ${startRegion} to ${targetRegion}`);
      return;
    }

    // Execute the path by sending user:regionMove events
    // Skip the first region in the path (start region)
    const stepsToExecute = moveOnlyOneStep ? [path.steps[1]] : path.steps.slice(1);

    logger.info(`Creating new path: ${startRegion} → ${stepsToExecute.join(' → ')}`);

    // Build adjacency map for finding exits
    const staticData = stateManager.getStaticData();
    const snapshot = stateManager.getLatestStateSnapshot();
    const snapshotInterface = createSnapshotInterface(snapshot, staticData);
    const adjacencyMap = this.ui.pathFinder.buildAccessibilityMap(staticData, snapshot, snapshotInterface);

    stepsToExecute.forEach((stepRegion, index) => {
      // Find the exit to use for this step
      const sourceRegion = index === 0 ? startRegion : stepsToExecute[index - 1];
      const exitName = this.ui.pathFinder.findExitBetweenRegions(
        sourceRegion,
        stepRegion,
        adjacencyMap
      );

      // Manually update the path since we disabled automatic path updates
      playerState.updatePath(stepRegion, exitName, sourceRegion);

      // Import and use moduleDispatcher to send the event
      import('./index.js').then(({ moduleDispatcher }) => {
        if (moduleDispatcher) {
          moduleDispatcher.publish('user:regionMove', {
            sourceRegion: sourceRegion,
            targetRegion: stepRegion,
            exitName: exitName,
            updatePath: false,
            source: 'regionGraph-overwritePath'
          }, 'bottom');
          logger.debug(`Published user:regionMove from ${sourceRegion} to ${stepRegion}`);
        }
      });
    });

    this.ui.updateStatus(`Created path: ${startRegion} → ${targetRegion} (${stepsToExecute.length} steps)`);
  }

  setShowAllRegions(enabled) {
    // Find the "Show All Regions" checkbox in the Regions panel and set its state
    const showAllCheckbox = document.querySelector('#show-all-regions');
    if (showAllCheckbox && showAllCheckbox.checked !== enabled) {
      showAllCheckbox.checked = enabled;
      // Trigger change event to update the regions display
      showAllCheckbox.dispatchEvent(new Event('change'));
      logger.debug(`Set "Show All Regions" to ${enabled}`);
    }
  }
}