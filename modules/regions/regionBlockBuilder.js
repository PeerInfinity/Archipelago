// regionBlockBuilder.js
import { evaluateRule } from '../shared/ruleEngine.js';
import { createStateSnapshotInterface } from '../shared/stateInterface.js';
import { renderLogicTree } from '../commonUI/index.js';
import commonUI from '../commonUI/index.js';
import loopStateSingleton from '../loops/loopStateSingleton.js';
import { stateManagerProxySingleton } from '../stateManager/index.js';
import settingsManager from '../../app/core/settingsManager.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('regionBlockBuilder', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[regionBlockBuilder] ${message}`, ...data);
  }
}

/**
 * RegionBlockBuilder class handles the creation of region block DOM elements
 */
export class RegionBlockBuilder {
  constructor(regionUI) {
    this.regionUI = regionUI;
  }

  /**
   * Builds a complete region block DOM element
   * @param {string} regionName - Name of the region
   * @param {Object} regionStaticData - Static data for the region
   * @param {Object} snapshot - Current state snapshot
   * @param {Object} snapshotInterface - Snapshot interface for rule evaluation
   * @param {boolean} regionIsReachable - Whether the region is reachable
   * @param {boolean} useColorblind - Whether to use colorblind mode
   * @param {string|number} currentUid - Unique identifier for this region instance
   * @param {boolean} currentExpandedState - Whether the region should be expanded
   * @param {Object} staticData - All static data (for entrance lookup)
   * @returns {HTMLElement|null} The region block element or null if skipped
   */
  buildRegionBlock(
    regionName,
    regionStaticData,
    snapshot,
    snapshotInterface,
    regionIsReachable,
    useColorblind,
    currentUid,
    currentExpandedState,
    staticData,
    isSkipIndicator = false
  ) {
    // Handle skip indicator specially
    if (isSkipIndicator || currentUid === 'skip_indicator') {
      const skipBlock = document.createElement('div');
      skipBlock.classList.add('region-block', 'skip-indicator');
      skipBlock.dataset.uid = 'skip_indicator';
      skipBlock.style.textAlign = 'center';
      skipBlock.style.fontStyle = 'italic';
      skipBlock.style.color = '#888';
      skipBlock.style.padding = '10px';
      skipBlock.style.margin = '5px 0';
      skipBlock.style.border = '1px dashed #666';
      skipBlock.style.backgroundColor = 'rgba(128, 128, 128, 0.1)';
      skipBlock.textContent = regionName; // This will be "... X regions skipped ..."
      return skipBlock;
    }

    // Determine expansion state and UID
    let uid = currentUid;
    let expanded =
      currentExpandedState !== undefined ? currentExpandedState : false;

    // Find the visited entry by UID first (for specific instances), then fall back to name lookup
    const visitedEntry = this.regionUI.visitedRegions.find(
      (vr) => vr.uid === currentUid
    ) || this.regionUI.visitedRegions.find(
      (vr) => vr.name === regionName && !currentUid
    );

    if (this.regionUI.showAll) {
      // For 'Show All', UIDs might be like 'all_RegionName'. Expansion state comes from regionInfo.expanded.
    } else {
      // Not 'Show All', rely on visitedRegions for state if an entry exists
      if (visitedEntry && visitedEntry.uid === currentUid) {
        uid = visitedEntry.uid;
        expanded = visitedEntry.expanded;
      } else if (!uid) {
        uid = this.regionUI.nextUID++;
        // Add to visitedRegions if not already there and we are managing it (not showAll)
        if (!this.regionUI.visitedRegions.find((r) => r.name === regionName)) {
          this.regionUI.visitedRegions.push({
            name: regionName,
            expanded: expanded,
            uid: uid,
          });
          log(
            'info',
            `[RegionBlockBuilder] Added '${regionName}' to visitedRegions with UID ${uid}.`
          );
        }
      }
    }

    // Create outer container
    const regionBlock = document.createElement('div');
    regionBlock.classList.add('region-block');
    regionBlock.dataset.uid = uid;
    regionBlock.dataset.region = regionName;
    regionBlock.classList.add(expanded ? 'expanded' : 'collapsed');
    regionBlock.classList.toggle('colorblind-mode', useColorblind);

    // Check if Loop Mode is active
    const isLoopModeActive = loopStateSingleton.isLoopModeActive;

    // In Loop Mode, skip rendering if undiscovered
    if (
      isLoopModeActive &&
      !loopStateSingleton.isRegionDiscovered(regionName)
    ) {
      if (regionName === 'Menu') {
        log(
          'warn',
          '[RegionBlockBuilder] Menu region is considered undiscovered in loop mode. Returning null.'
        );
      }
      return null;
    }

    // Determine completion status
    let totalLocations = regionStaticData.locations?.length || 0;
    let checkedLocationsCount = 0;
    if (regionStaticData.locations && snapshot.checkedLocations) {
      const checkedSet = new Set(snapshot.checkedLocations);
      checkedLocationsCount = regionStaticData.locations.filter((loc) =>
        checkedSet.has(loc.name)
      ).length;
    }
    const isComplete =
      totalLocations > 0 && checkedLocationsCount === totalLocations;

    // Build header
    const headerEl = this.buildHeader(
      regionName,
      uid,
      checkedLocationsCount,
      totalLocations,
      regionIsReachable,
      useColorblind,
      expanded,
      isComplete
    );

    // Build content
    const contentEl = this.buildContent(
      regionName,
      regionStaticData,
      snapshot,
      snapshotInterface,
      regionIsReachable,
      useColorblind,
      uid,
      expanded,
      staticData,
      isLoopModeActive
    );

    // Append header and content
    regionBlock.appendChild(headerEl);
    regionBlock.appendChild(contentEl);

    // Add event listeners
    this.attachEventListeners(headerEl, uid);

    return regionBlock;
  }

  /**
   * Builds the header element for a region block
   */
  buildHeader(
    regionName,
    uid,
    checkedLocationsCount,
    totalLocations,
    regionIsReachable,
    useColorblind,
    expanded,
    isComplete
  ) {
    const headerEl = document.createElement('div');
    headerEl.classList.add('region-header');
    const regionLabel = regionName + this._suffixIfDuplicate(regionName, uid);

    headerEl.innerHTML = `
      <span class="region-name" title="${regionName}">${regionLabel}</span>
      <span class="region-status">(${checkedLocationsCount}/${totalLocations})</span>
      ${
        useColorblind
          ? `<span class="colorblind-symbol ${
              regionIsReachable ? 'accessible' : 'inaccessible'
            }">${regionIsReachable ? '✓' : '✗'}</span>`
          : ''
      }
      <button class="collapse-btn">${
        expanded ? 'Collapse' : 'Expand'
      }</button>
    `;

    // Add accessibility classes to header
    headerEl.classList.toggle('accessible', regionIsReachable);
    headerEl.classList.toggle('inaccessible', !regionIsReachable);
    headerEl.classList.toggle('completed-region', isComplete);

    return headerEl;
  }

  /**
   * Builds the content element for a region block
   */
  buildContent(
    regionName,
    regionStaticData,
    snapshot,
    snapshotInterface,
    regionIsReachable,
    useColorblind,
    uid,
    expanded,
    staticData,
    isLoopModeActive
  ) {
    const contentEl = document.createElement('div');
    contentEl.classList.add('region-content');
    contentEl.style.display = expanded ? 'block' : 'none';

    // Add world type info
    this.addWorldTypeInfo(contentEl, regionStaticData);

    // Add dungeon info
    this.addDungeonInfo(contentEl, regionName);

    // Add region rules
    this.addRegionRules(contentEl, regionStaticData, useColorblind, snapshotInterface);

    // Add entrances
    this.addEntrances(contentEl, regionName, staticData, snapshot, snapshotInterface, useColorblind);

    // Add exits
    this.addExits(
      contentEl,
      regionName,
      regionStaticData,
      snapshot,
      snapshotInterface,
      regionIsReachable,
      useColorblind,
      uid,
      isLoopModeActive
    );

    // Add locations
    this.addLocations(
      contentEl,
      regionName,
      regionStaticData,
      snapshot,
      snapshotInterface,
      regionIsReachable,
      useColorblind,
      isLoopModeActive
    );

    // Add path analysis section
    this.addPathAnalysisSection(contentEl, regionName, uid);

    return contentEl;
  }

  /**
   * Adds world type information to the content element
   */
  addWorldTypeInfo(contentEl, regionStaticData) {
    const isLight = regionStaticData.is_light_world === true;
    const isDark = regionStaticData.is_dark_world === true;
    if (isLight || isDark) {
      const worldDiv = document.createElement('div');
      let worldText = '';
      if (isLight && isDark) {
        worldText =
          '<strong style="color: red;">Error: Both Light and Dark World!</strong>';
      } else if (isLight) {
        worldText = 'Light World';
      } else {
        worldText = 'Dark World';
      }
      worldDiv.innerHTML = worldText;
      contentEl.prepend(worldDiv);
    }
  }

  /**
   * Adds dungeon information to the content element
   */
  addDungeonInfo(contentEl, regionName) {
    const dungeonData = this.findDungeonForRegion(regionName);
    if (dungeonData) {
      const dungeonDiv = document.createElement('div');
      dungeonDiv.innerHTML = '<strong>Dungeon:</strong> ';
      const dungeonLink = this.createDungeonLink(dungeonData.name);
      dungeonDiv.appendChild(dungeonLink);
      contentEl.appendChild(dungeonDiv);
    }
  }

  /**
   * Adds region rules to the content element
   */
  addRegionRules(contentEl, regionStaticData, useColorblind, snapshotInterface) {
    if (
      regionStaticData.region_rules &&
      regionStaticData.region_rules.length > 0
    ) {
      const rrContainer = document.createElement('div');
      rrContainer.innerHTML = '<h4>Region Rules</h4>';
      regionStaticData.region_rules.forEach((rule, idx) => {
        const logicDiv = document.createElement('div');
        logicDiv.classList.add('logic-tree');
        logicDiv.innerHTML = `<strong>Rule #${idx + 1}:</strong>`;
        logicDiv.appendChild(
          renderLogicTree(rule, useColorblind, snapshotInterface)
        );
        rrContainer.appendChild(logicDiv);
      });
      contentEl.appendChild(rrContainer);
    }
  }

  /**
   * Adds entrances list to the content element
   */
  addEntrances(contentEl, regionName, staticData, snapshot, snapshotInterface, useColorblind) {
    const entrancesList = document.createElement('ul');
    entrancesList.classList.add('region-entrances-list');
    
    // Check if bidirectional exits are assumed from game settings
    const assumeBidirectional = staticData?.options?.assume_bidirectional_exits === true;
    
    // Find all entrances to this region
    const entrances = [];
    for (const [sourceRegionName, sourceRegionData] of Object.entries(staticData.regions)) {
      if (sourceRegionData.exits) {
        for (const exit of sourceRegionData.exits) {
          if (exit.connected_region === regionName) {
            // Check if there's a return path (bidirectional)
            let returnExit = null;
            let isBidirectional = assumeBidirectional;
            
            if (!assumeBidirectional && staticData.regions[regionName]?.exits) {
              // Look for an exit from current region back to source
              returnExit = staticData.regions[regionName].exits.find(
                e => e.connected_region === sourceRegionName
              );
              isBidirectional = !!returnExit;
            } else if (assumeBidirectional && staticData.regions[regionName]?.exits) {
              // Even with assume_bidirectional, we need to find the return exit for move functionality
              returnExit = staticData.regions[regionName].exits.find(
                e => e.connected_region === sourceRegionName
              );
            }
            
            entrances.push({
              sourceRegion: sourceRegionName,
              exitName: exit.name,
              accessRule: exit.access_rule,
              isBidirectional: isBidirectional,
              returnExit: returnExit
            });
          }
        }
      }
    }
    
    if (entrances.length > 0) {
      const entrancesHeader = document.createElement('h4');
      entrancesHeader.textContent = 'Entrances:';
      contentEl.appendChild(entrancesHeader);
      
      entrances.forEach((entrance) => {
        const li = document.createElement('li');
        li.classList.add('entrance-item');
        
        // Create a wrapper div for the entire clickable area
        const entranceWrapper = document.createElement('div');
        entranceWrapper.classList.add('entrance-wrapper');
        
        // Create a header row for entrance info and status
        const headerRow = document.createElement('div');
        headerRow.style.display = 'flex';
        headerRow.style.justifyContent = 'space-between';
        headerRow.style.alignItems = 'center';
        
        // Create entrance info span
        const entranceInfo = document.createElement('span');
        const regionLink = commonUI.createRegionLink(
          entrance.sourceRegion,
          useColorblind,
          snapshot
        );
        entranceInfo.appendChild(regionLink);
        entranceInfo.appendChild(document.createTextNode(` - ${entrance.exitName}`));
        headerRow.appendChild(entranceInfo);
        
        // Evaluate entrance accessibility
        let entranceAccessible = true;
        if (entrance.accessRule) {
          try {
            entranceAccessible = evaluateRule(
              entrance.accessRule,
              snapshotInterface
            );
          } catch (e) {
            log(
              'error',
              `Error evaluating entrance rule for ${entrance.exitName} from ${entrance.sourceRegion}:`,
              e
            );
            entranceAccessible = false;
          }
        }
        
        // Check if source region is reachable
        const sourceRegionReachable =
          snapshot.regionReachability?.[entrance.sourceRegion] === true ||
          snapshot.regionReachability?.[entrance.sourceRegion] === 'reachable' ||
          snapshot.regionReachability?.[entrance.sourceRegion] === 'checked';
          
        const isTraversable = sourceRegionReachable && entranceAccessible;
        
        // Evaluate return exit accessibility if bidirectional
        let returnExitAccessible = true;
        if (entrance.isBidirectional && entrance.returnExit?.access_rule) {
          try {
            returnExitAccessible = evaluateRule(
              entrance.returnExit.access_rule,
              snapshotInterface
            );
          } catch (e) {
            log(
              'error',
              `Error evaluating return exit rule for ${entrance.returnExit.name}:`,
              e
            );
            returnExitAccessible = false;
          }
        }
        
        const isFullyTraversable = isTraversable && returnExitAccessible;
        const isClickable = entrance.isBidirectional && isFullyTraversable;
        
        // Add status indicator
        const statusIndicator = document.createElement('span');
        statusIndicator.classList.add('entrance-status');
        if (!entrance.isBidirectional) {
          statusIndicator.textContent = 'One-way';
          statusIndicator.classList.add('status-oneway');
        } else if (isFullyTraversable) {
          statusIndicator.textContent = 'Available';
          statusIndicator.classList.add('status-available');
        } else {
          statusIndicator.textContent = 'Blocked';
          statusIndicator.classList.add('status-blocked');
        }
        headerRow.appendChild(statusIndicator);
        entranceWrapper.appendChild(headerRow);
        
        // Apply border color based on status
        if (!entrance.isBidirectional) {
          // Gray border for unidirectional entrances
          entranceWrapper.style.borderColor = '#888';
          entranceWrapper.style.backgroundColor = 'rgba(136, 136, 136, 0.1)';
        } else if (isFullyTraversable) {
          // Green border for bidirectional and traversable
          entranceWrapper.style.borderColor = '#4CAF50';
          entranceWrapper.style.backgroundColor = 'rgba(76, 175, 80, 0.1)';
        } else {
          // Red border for bidirectional but blocked
          entranceWrapper.style.borderColor = '#f44336';
          entranceWrapper.style.backgroundColor = 'rgba(244, 67, 54, 0.1)';
        }
        
        // Style the wrapper
        entranceWrapper.style.border = '2px solid';
        entranceWrapper.style.borderRadius = '4px';
        entranceWrapper.style.padding = '8px 12px';
        entranceWrapper.style.margin = '4px 0';
        entranceWrapper.style.cursor = isClickable ? 'pointer' : 'default';
        entranceWrapper.style.display = 'block';
        entranceWrapper.style.transition = 'all 0.2s ease';
        
        // Add hover effect and click handler for clickable entrances
        if (isClickable) {
          entranceWrapper.addEventListener('mouseenter', () => {
            entranceWrapper.style.transform = 'translateX(4px)';
            entranceWrapper.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
          });
          entranceWrapper.addEventListener('mouseleave', () => {
            entranceWrapper.style.transform = 'translateX(0)';
            entranceWrapper.style.boxShadow = 'none';
          });
          
          // Make entire wrapper clickable for bidirectional entrances
          entranceWrapper.addEventListener('click', (e) => {
            // Don't trigger if clicking on the region link
            if (e.target.classList.contains('region-link')) {
              return;
            }
            
            // Check if "Show All Regions" is enabled
            const showAllCheckbox = document.querySelector('#show-all-regions');
            const showAllEnabled = showAllCheckbox && showAllCheckbox.checked;
            
            if (showAllEnabled) {
              // In "Show All" mode, navigate to the source region
              import('../../app/core/eventBus.js').then(({ default: eventBus }) => {
                eventBus.publish('ui:activatePanel', { panelId: 'regionsPanel' }, 'regions');
                eventBus.publish('ui:navigateToRegion', {
                  regionName: entrance.sourceRegion
                }, 'regions');
                log('info', `[Entrance Block] Navigating to region: ${entrance.sourceRegion} (Show All mode)`);
              });
            } else {
              // Normal mode - execute region move to source region
              // We need to get the UID for this region block
              const regionBlock = entranceWrapper.closest('.region-block');
              const uid = regionBlock ? regionBlock.dataset.uid : undefined;
              
              import('./index.js').then(({ moduleDispatcher }) => {
                if (moduleDispatcher) {
                  moduleDispatcher.publish('user:regionMove', {
                    sourceRegion: regionName,
                    sourceUID: uid,
                    targetRegion: entrance.sourceRegion,
                    exitName: entrance.returnExit ? entrance.returnExit.name : entrance.exitName
                  }, 'bottom');
                  log('info', `[Entrance Block] Moving from ${regionName} to ${entrance.sourceRegion}`);
                } else {
                  log('warn', 'moduleDispatcher not available for publishing user:regionMove');
                }
              });
            }
          });
        }
        
        // Apply classes based on status
        li.classList.toggle('accessible', isTraversable);
        li.classList.toggle('inaccessible', !isTraversable);
        li.classList.toggle('bidirectional', entrance.isBidirectional);
        
        li.appendChild(entranceWrapper);
        entrancesList.appendChild(li);
      });
      
      contentEl.appendChild(entrancesList);
    }
  }

  /**
   * Adds exits list to the content element
   */
  addExits(
    contentEl,
    regionName,
    regionStaticData,
    snapshot,
    snapshotInterface,
    regionIsReachable,
    useColorblind,
    uid,
    isLoopModeActive
  ) {
    const exitsHeader = document.createElement('h4');
    exitsHeader.textContent = 'Exits:';
    contentEl.appendChild(exitsHeader);
    
    const exitsList = document.createElement('ul');
    exitsList.classList.add('region-exits-list');
    
    if (regionStaticData.exits && regionStaticData.exits.length > 0) {
      regionStaticData.exits.forEach((exitDef) => {
        // Determine exit accessibility
        let exitAccessible = true;
        if (exitDef.access_rule) {
          try {
            exitAccessible = evaluateRule(
              exitDef.access_rule,
              snapshotInterface
            );
          } catch (e) {
            log(
              'error',
              `Error evaluating exit rule for ${exitDef.name} in ${regionName}:`,
              e
            );
            exitAccessible = false;
          }
        }
        
        const connectedRegionName = exitDef.connected_region;
        const connectedRegionReachable =
          snapshot.regionReachability?.[connectedRegionName] === true ||
          snapshot.regionReachability?.[connectedRegionName] === 'reachable' ||
          snapshot.regionReachability?.[connectedRegionName] === 'checked';
        const isTraversable =
          regionIsReachable && exitAccessible && connectedRegionReachable;

        // Loop mode discovery check
        const isExitDiscovered =
          !isLoopModeActive ||
          loopStateSingleton.isExitDiscovered(regionName, exitDef.name);

        const li = document.createElement('li');
        li.classList.add('exit-item');
        const exitNameDisplay =
          isLoopModeActive && !isExitDiscovered ? '???' : exitDef.name;
        
        // Create a wrapper div for the entire clickable area
        const exitWrapper = document.createElement('div');
        exitWrapper.classList.add('exit-wrapper');
        
        // Create a header row for exit info and status
        const headerRow = document.createElement('div');
        headerRow.style.display = 'flex';
        headerRow.style.justifyContent = 'space-between';
        headerRow.style.alignItems = 'center';
        
        // Create exit info span
        const exitInfo = document.createElement('span');
        exitInfo.appendChild(document.createTextNode(`${exitNameDisplay} → `));
        exitInfo.appendChild(
          commonUI.createRegionLink(
            connectedRegionName,
            useColorblind,
            snapshot
          )
        );
        headerRow.appendChild(exitInfo);
        
        // Add status indicator
        const statusIndicator = document.createElement('span');
        statusIndicator.classList.add('exit-status');
        if (isTraversable) {
          statusIndicator.textContent = 'Available';
          statusIndicator.classList.add('status-available');
        } else {
          statusIndicator.textContent = 'Blocked';
          statusIndicator.classList.add('status-blocked');
        }
        headerRow.appendChild(statusIndicator);
        exitWrapper.appendChild(headerRow);

        // Apply classes and styling
        li.classList.toggle('accessible', isTraversable);
        li.classList.toggle('inaccessible', !isTraversable);
        li.classList.toggle(
          'undiscovered',
          isLoopModeActive && !isExitDiscovered
        );
        
        // Apply border color based on status
        if (isTraversable) {
          exitWrapper.style.borderColor = '#4CAF50';
          exitWrapper.style.backgroundColor = 'rgba(76, 175, 80, 0.1)';
        } else {
          exitWrapper.style.borderColor = '#f44336';
          exitWrapper.style.backgroundColor = 'rgba(244, 67, 54, 0.1)';
        }
        
        // Style the wrapper
        exitWrapper.style.border = '2px solid';
        exitWrapper.style.borderRadius = '4px';
        exitWrapper.style.padding = '8px 12px';
        exitWrapper.style.margin = '4px 0';
        exitWrapper.style.cursor = isTraversable && connectedRegionName && (!isLoopModeActive || isExitDiscovered) ? 'pointer' : 'default';
        exitWrapper.style.display = 'block';
        exitWrapper.style.transition = 'all 0.2s ease';
        
        // Add hover effect for traversable exits
        if (isTraversable && connectedRegionName && (!isLoopModeActive || isExitDiscovered)) {
          exitWrapper.addEventListener('mouseenter', () => {
            exitWrapper.style.transform = 'translateX(4px)';
            exitWrapper.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
          });
          exitWrapper.addEventListener('mouseleave', () => {
            exitWrapper.style.transform = 'translateX(0)';
            exitWrapper.style.boxShadow = 'none';
          });
          
          // Make entire wrapper clickable
          exitWrapper.addEventListener('click', (e) => {
            // Don't trigger if clicking on the region link
            if (e.target.classList.contains('region-link')) {
              return;
            }
            
            if (isTraversable && connectedRegionName) {
              // Check if "Show All Regions" is enabled
              const showAllCheckbox = document.querySelector('#show-all-regions');
              const showAllEnabled = showAllCheckbox && showAllCheckbox.checked;
              
              if (showAllEnabled) {
                // In "Show All" mode, navigate to the region instead of moving
                import('../../app/core/eventBus.js').then(({ default: eventBus }) => {
                  // First activate the regions panel if not already active
                  eventBus.publish('ui:activatePanel', { panelId: 'regionsPanel' }, 'regions');
                  
                  // Then navigate to the target region
                  eventBus.publish('ui:navigateToRegion', {
                    regionName: connectedRegionName
                  }, 'regions');
                  
                  log('info', `[Exit Block] Navigating to region: ${connectedRegionName} (Show All mode)`);
                });
              } else {
                // Normal mode - execute region move
                // Import playerState to get current region instead of assuming regionName is current
                Promise.all([
                  import('./index.js'),
                  import('../playerState/singleton.js')
                ]).then(([{ moduleDispatcher }, { getPlayerStateSingleton }]) => {
                  if (moduleDispatcher) {
                    // Get the actual current region from playerState
                    const playerState = getPlayerStateSingleton();
                    const currentRegion = playerState.getCurrentRegion();
                    
                    moduleDispatcher.publish('user:regionMove', {
                      sourceRegion: currentRegion,
                      sourceUID: uid,
                      targetRegion: connectedRegionName,
                      exitName: exitDef.name,
                      updatePath: true,
                      source: 'regionBlockBuilder'
                    }, 'bottom');
                    log('info', `[Exit Block] Moving from ${currentRegion} to ${connectedRegionName} via ${exitDef.name} (exit click)`);
                  } else {
                    log('warn', 'moduleDispatcher not available for publishing user:regionMove');
                  }
                }).catch(error => {
                  log('error', 'Error importing modules for region move:', error);
                });
              }
            }
          });
        }

        // Render logic tree for the exit rule inside the wrapper
        if (exitDef.access_rule) {
          const logicTreeElement = renderLogicTree(
            exitDef.access_rule,
            useColorblind,
            snapshotInterface
          );
          const ruleDiv = document.createElement('div');
          ruleDiv.style.marginTop = '8px';
          ruleDiv.style.paddingTop = '8px';
          ruleDiv.style.borderTop = '1px solid rgba(128, 128, 128, 0.3)';
          ruleDiv.innerHTML = `Rule: ${logicTreeElement.outerHTML}`;
          exitWrapper.appendChild(ruleDiv);
        }

        li.appendChild(exitWrapper);
        exitsList.appendChild(li);
      });
    } else {
      exitsList.innerHTML = '<li>No exits defined.</li>';
    }
    contentEl.appendChild(exitsList);
  }


  /**
   * Adds locations list to the content element
   */
  addLocations(
    contentEl,
    regionName,
    regionStaticData,
    snapshot,
    snapshotInterface,
    regionIsReachable,
    useColorblind,
    isLoopModeActive
  ) {
    const locationsHeader = document.createElement('h4');
    locationsHeader.textContent = 'Locations:';
    contentEl.appendChild(locationsHeader);
    
    const locationsList = document.createElement('ul');
    locationsList.classList.add('region-locations-list');
    
    if (regionStaticData.locations && regionStaticData.locations.length > 0) {
      regionStaticData.locations.forEach((locationDef) => {
        // Determine accessibility
        let locAccessible = true;
        if (locationDef.access_rule) {
          try {
            locAccessible = evaluateRule(
              locationDef.access_rule,
              snapshotInterface
            );
          } catch (e) {
            log(
              'error',
              `Error evaluating location rule for ${locationDef.name} in ${regionName}:`,
              e
            );
            locAccessible = false;
          }
        }
        locAccessible = regionIsReachable && locAccessible;

        const locChecked = snapshot.checkedLocations?.includes(locationDef.name) ?? false;

        // Loop mode discovery check
        const isLocationDiscovered =
          !isLoopModeActive ||
          loopStateSingleton.isLocationDiscovered(locationDef.name);

        const li = document.createElement('li');
        li.classList.add('location-item');
        const locationNameDisplay =
          isLoopModeActive && !isLocationDiscovered ? '???' : locationDef.name;
        
        // Create a wrapper div for the entire clickable area
        const locationWrapper = document.createElement('div');
        locationWrapper.classList.add('location-wrapper');
        
        // Create a header row for name and status
        const headerRow = document.createElement('div');
        headerRow.style.display = 'flex';
        headerRow.style.justifyContent = 'space-between';
        headerRow.style.alignItems = 'center';
        
        const locLink = document.createElement('span');
        locLink.textContent = locationNameDisplay;
        locLink.classList.add('location-link');
        locLink.dataset.location = locationDef.name;
        locLink.dataset.region = regionName;
        headerRow.appendChild(locLink);

        // Check if location is queued in the path (only if the setting is enabled)
        settingsManager.getSetting('regionGraph.addLocationsToPath', false).then(addToPathEnabled => {
          if (addToPathEnabled) {
            import('../playerState/singleton.js').then(({ getPlayerStateSingleton }) => {
              try {
                const playerState = getPlayerStateSingleton();
                const fullPath = playerState.getPath();
                const isQueued = fullPath.some(entry => 
                  entry.type === 'locationCheck' && 
                  entry.locationName === locationDef.name &&
                  entry.region === regionName
                );
                
                // Update status if queued (need to update after initial render)
                if (isQueued && statusIndicator && !locChecked && locAccessible) {
                  statusIndicator.textContent = 'Queued';
                  statusIndicator.className = 'location-status status-queued';
                }
              } catch (error) {
                // Ignore error
              }
            }).catch(() => {
              // Ignore import error
            });
          }
        }).catch(() => {
          // Ignore settings error
        });
        
        // Add status indicator
        const statusIndicator = document.createElement('span');
        statusIndicator.classList.add('location-status');
        if (locChecked) {
          statusIndicator.textContent = 'Checked';
          statusIndicator.classList.add('status-checked');
        } else if (locAccessible) {
          statusIndicator.textContent = 'Available';
          statusIndicator.classList.add('status-available');
        } else {
          statusIndicator.textContent = 'Locked';
          statusIndicator.classList.add('status-locked');
        }
        headerRow.appendChild(statusIndicator);
        locationWrapper.appendChild(headerRow);

        // Apply classes and styling
        li.classList.toggle('accessible', locAccessible && !locChecked);
        li.classList.toggle('inaccessible', !locAccessible);
        li.classList.toggle('checked-location', locChecked);
        li.classList.toggle(
          'undiscovered',
          isLoopModeActive && !isLocationDiscovered
        );
        
        // Apply border color based on status
        if (locChecked) {
          locationWrapper.style.borderColor = '#000';
          locationWrapper.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
        } else if (locAccessible) {
          locationWrapper.style.borderColor = '#4CAF50';
          locationWrapper.style.backgroundColor = 'rgba(76, 175, 80, 0.1)';
        } else {
          locationWrapper.style.borderColor = '#f44336';
          locationWrapper.style.backgroundColor = 'rgba(244, 67, 54, 0.1)';
        }
        
        // Style the wrapper
        locationWrapper.style.border = '2px solid';
        locationWrapper.style.borderRadius = '4px';
        locationWrapper.style.padding = '8px 12px';
        locationWrapper.style.margin = '4px 0';
        locationWrapper.style.cursor = locAccessible && !locChecked ? 'pointer' : 'default';
        locationWrapper.style.display = 'block';
        locationWrapper.style.transition = 'all 0.2s ease';
        
        // Add hover effect for clickable items
        if (locAccessible && !locChecked) {
          locationWrapper.addEventListener('mouseenter', () => {
            locationWrapper.style.transform = 'translateX(4px)';
            locationWrapper.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
          });
          locationWrapper.addEventListener('mouseleave', () => {
            locationWrapper.style.transform = 'translateX(0)';
            locationWrapper.style.boxShadow = 'none';
          });
        }
        
        // Make entire wrapper clickable if location is accessible and not checked
        if (locAccessible && !locChecked && (!isLoopModeActive || isLocationDiscovered)) {
          locationWrapper.addEventListener('click', async () => {
            try {
              log(
                'info',
                `[LocationWrapper] Clicked on location: ${locationDef.name}, Region: ${regionName}`
              );

              // Check if we should add to path (use same setting as regionGraph)
              const shouldAddToPath = await settingsManager.getSetting('regionGraph.addLocationsToPath', false);
              
              if (shouldAddToPath) {
                // Add location check to path
                log('info', `Adding location ${locationDef.name} to path`);
                const { getPlayerStateSingleton } = await import('../playerState/singleton.js');
                const playerState = getPlayerStateSingleton();
                playerState.addLocationCheck(locationDef.name, regionName);
                log('info', `Added location ${locationDef.name} to player path`);
              } else {
                // Original behavior - dispatch location check event
                const { moduleDispatcher } = await import('./index.js');
                
                const payload = {
                  locationName: locationDef.name,
                  regionName: locationDef.region || regionName,
                  originator: 'RegionPanelCheck',
                  originalDOMEvent: true,
                };

                if (moduleDispatcher) {
                  moduleDispatcher.publish('user:locationCheck', payload, {
                    initialTarget: 'bottom',
                  });
                  log('info', 'Dispatched user:locationCheck', payload);
                } else {
                  log(
                    'error',
                    'Dispatcher not available to handle location check.'
                  );
                }
              }
            } catch (error) {
              log(
                'error',
                `Error checking location ${locationDef.name}:`,
                error
              );
            }
          });
        }
        
        // Render logic tree for the location rule inside the wrapper
        if (locationDef.access_rule) {
          const locationContextInterface = createStateSnapshotInterface(
            snapshot,
            stateManagerProxySingleton.getStaticData(),
            { location: locationDef }
          );
          const logicTreeElement = renderLogicTree(
            locationDef.access_rule,
            useColorblind,
            locationContextInterface
          );
          const ruleDiv = document.createElement('div');
          ruleDiv.style.marginTop = '8px';
          ruleDiv.style.paddingTop = '8px';
          ruleDiv.style.borderTop = '1px solid rgba(128, 128, 128, 0.3)';
          ruleDiv.innerHTML = `Rule: ${logicTreeElement.outerHTML}`;
          locationWrapper.appendChild(ruleDiv);
        }

        li.appendChild(locationWrapper);
        locationsList.appendChild(li);
      });
    } else {
      locationsList.innerHTML = '<li>No locations defined.</li>';
    }
    contentEl.appendChild(locationsList);
  }


  /**
   * Adds path analysis section to the content element
   */
  addPathAnalysisSection(contentEl, regionName, uid) {
    const pathsControlDiv = document.createElement('div');
    pathsControlDiv.classList.add('paths-control');
    pathsControlDiv.style.marginTop = '1rem';
    pathsControlDiv.innerHTML = `
      <div class="paths-buttons">
        <button class="analyze-paths-btn">Analyze Paths</button>
        <button class="trim-path-btn">Trim Path</button>
        <span class="paths-count" style="display: none;"></span>
      </div>
    `;
    contentEl.appendChild(pathsControlDiv);

    const pathsContainer = document.createElement('div');
    pathsContainer.classList.add('region-paths');
    pathsContainer.style.display = 'none';
    contentEl.appendChild(pathsContainer);

    // Setup the analyze paths button using the PathAnalyzerUI instance
    const analyzePathsBtn = pathsControlDiv.querySelector('.analyze-paths-btn');
    const pathsCountSpan = pathsControlDiv.querySelector('.paths-count');
    if (analyzePathsBtn && pathsCountSpan && this.regionUI.pathAnalyzer) {
      this.regionUI.setupAnalyzePathsButton(
        analyzePathsBtn,
        pathsCountSpan,
        pathsContainer,
        regionName
      );
    } else {
      log(
        'warn',
        'Could not set up path analysis button for region:',
        regionName
      );
    }

    // Setup the trim path button
    const trimPathBtn = pathsControlDiv.querySelector('.trim-path-btn');
    if (trimPathBtn) {
      this.setupTrimPathButton(trimPathBtn, regionName, uid);
    }
  }

  /**
   * Attaches event listeners to the header element
   */
  attachEventListeners(headerEl, uid) {
    // Header click listener
    headerEl.addEventListener('click', (e) => {
      if (e.target.classList.contains('collapse-btn')) {
        e.stopPropagation();
      }
      this.regionUI.toggleRegionByUID(uid);
    });

    // Collapse button listener
    const collapseBtn = headerEl.querySelector('.collapse-btn');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.regionUI.toggleRegionByUID(uid);
      });
    }
  }

  /**
   * Helper to generate suffix for duplicate region names
   */
  _suffixIfDuplicate(regionName, uid) {
    const countSoFar = this.regionUI.visitedRegions.filter(
      (r) => r.name === regionName && r.uid <= uid
    ).length;
    return countSoFar > 1 ? ` (${countSoFar})` : '';
  }

  /**
   * Sets up the trim path button event listener
   */
  setupTrimPathButton(trimPathBtn, regionName, uid) {
    trimPathBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      log('info', `Trim path button clicked for region: ${regionName}, UID: ${uid}`);

      // Import playerState singleton to perform the path trimming
      import('../playerState/singleton.js').then(({ getPlayerStateSingleton }) => {
        const playerState = getPlayerStateSingleton();
        
        // Find this region instance in the current path to determine instance number
        const currentPath = playerState.getPath();
        let instanceNumber = 1;
        let found = false;
        
        for (let i = 0; i < currentPath.length; i++) {
          const entry = currentPath[i];
          // Only consider regionMove entries
          if (entry.type === 'regionMove' && entry.region === regionName) {
            // Check if this matches our specific instance (by UID if available)
            if (uid && this.regionUI && this.regionUI.visitedRegions) {
              const visitedRegion = this.regionUI.visitedRegions.find(vr => vr.uid == uid);
              if (visitedRegion && visitedRegion.instanceNumber) {
                instanceNumber = visitedRegion.instanceNumber;
                found = true;
                break;
              }
            }
            // If we can't match by UID, assume it's the last occurrence of this region in the path
            instanceNumber = entry.instanceNumber;
            found = true;
          }
        }
        
        if (!found) {
          log('warn', `Could not find region ${regionName} in current path for trimming`);
          return;
        }

        log('info', `Trimming path at ${regionName}, instance ${instanceNumber}`);
        
        // Set player to this region without updating path, then trim
        playerState.setCurrentRegion(regionName);
        playerState.trimPath(regionName, instanceNumber);
        
        log('info', `Path trimmed successfully to ${regionName}`);
      }).catch(error => {
        log('error', 'Error setting up trim path functionality:', error);
      });
    });
  }

  /**
   * Helper function to find which dungeon a region belongs to
   */
  findDungeonForRegion(regionName) {
    const staticData = stateManagerProxySingleton.getStaticData();
    if (!staticData || !staticData.dungeons) {
      return null;
    }

    for (const dungeonData of Object.values(staticData.dungeons)) {
      if (dungeonData.regions && dungeonData.regions.includes(regionName)) {
        return dungeonData;
      }
    }
    return null;
  }

  /**
   * Creates a clickable link to navigate to a specific dungeon
   */
  createDungeonLink(dungeonName) {
    const link = document.createElement('a');
    link.href = '#';
    link.textContent = dungeonName;
    link.classList.add('dungeon-link');
    link.style.color = '#4CAF50';
    link.style.textDecoration = 'none';
    link.style.fontWeight = 'bold';

    link.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      log('info', `Dungeon link clicked for: ${dungeonName}`);

      // Import eventBus dynamically to avoid circular dependencies
      import('../../app/core/eventBus.js').then(({ default: eventBus }) => {
        eventBus.publish('ui:activatePanel', { panelId: 'dungeonsPanel' }, 'regions');
        log('info', `Published ui:activatePanel for dungeonsPanel.`);

        eventBus.publish('ui:navigateToDungeon', {
          dungeonName: dungeonName,
          sourcePanel: 'regions',
        }, 'regions');
        log(
          'info',
          `Published ui:navigateToDungeon for ${dungeonName}.`
        );
      });
    });

    // Add hover effect
    link.addEventListener('mouseenter', () => {
      link.style.textDecoration = 'underline';
    });
    link.addEventListener('mouseleave', () => {
      link.style.textDecoration = 'none';
    });

    return link;
  }
}

export default RegionBlockBuilder;