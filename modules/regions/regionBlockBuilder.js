// regionBlockBuilder.js
import { evaluateRule } from '../shared/ruleEngine.js';
import { createSnapshotInterface } from '../shared/snapshotInterface.js';
import { renderLogicTree } from '../commonUI/index.js';
import commonUI from '../commonUI/index.js';
import discoveryStateSingleton from '../discovery/singleton.js';
import { stateManagerProxySingleton } from '../stateManager/index.js';
import settingsManager from '../../app/core/settingsManager.js';
import { getModuleEventBus } from './index.js';

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
    Object.defineProperty(this, 'eventBus', { get: () => getModuleEventBus(), configurable: true });
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
    isSkipIndicator = false,
    sectionOrder = 'entrances-exits-locations',
    discoverySettings = null,
    navigationContext = null
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
      // Not 'Show All', rely on visitedRegions for UID lookup
      // Note: expansion state comes from currentExpandedState (via ExpansionStateManager),
      // NOT from visitedEntry.expanded which is stale and not kept in sync.
      if (visitedEntry && visitedEntry.uid === currentUid) {
        uid = visitedEntry.uid;
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

    // Add background color based on accessibility
    if (!regionIsReachable) {
      // Slightly reddish gray for inaccessible regions
      regionBlock.style.backgroundColor = 'rgba(70, 50, 50, 0.3)'; // Reddish-gray with transparency
    }

    // Check if Discovery Mode is active
    const isDiscoveryModeActive = this.regionUI.isDiscoveryModeActive || false;
    const settings = discoverySettings || this.regionUI.discoverySettings || {
      undiscoveredDisplay: 'hidden',
      clickDiscoversLocation: true,
      showUndiscoveredDetails: false
    };

    // In Discovery Mode, handle undiscovered regions based on settings
    const isRegionDiscovered = discoveryStateSingleton.isRegionDiscovered(regionName);
    if (isDiscoveryModeActive && !isRegionDiscovered) {
      if (settings.undiscoveredDisplay === 'hidden') {
        // Check if Show Undiscovered is enabled
        const showUndiscoveredCheckbox = this.regionUI.rootElement?.querySelector('#region-show-undiscovered');
        const showUndiscovered = showUndiscoveredCheckbox?.checked ?? true;

        if (!showUndiscovered) {
          return null; // Hide undiscovered regions
        }
      }
      // If undiscoveredDisplay is 'placeholder' or showUndiscovered is checked, continue to render as placeholder
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
      isComplete,
      regionStaticData,
      isDiscoveryModeActive,
      isRegionDiscovered,
      settings
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
      isDiscoveryModeActive,
      sectionOrder,
      isRegionDiscovered,
      settings,
      navigationContext
    );

    // Append header and content
    regionBlock.appendChild(headerEl);
    regionBlock.appendChild(contentEl);

    // Add event listeners
    this.attachEventListeners(headerEl, uid, regionName);

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
    isComplete,
    regionStaticData,
    isDiscoveryModeActive = false,
    isRegionDiscovered = true,
    discoverySettings = {}
  ) {
    const headerEl = document.createElement('div');
    headerEl.classList.add('region-header');

    // Check if we should show placeholder for undiscovered region
    const showAsPlaceholder = isDiscoveryModeActive && !isRegionDiscovered;
    const showFullDetails = discoverySettings.showUndiscoveredDetails ?? false;

    // Create container for region text lines
    const regionTextContainer = document.createElement('span');
    regionTextContainer.className = 'region-text-container';
    regionTextContainer.style.display = 'inline-flex';
    regionTextContainer.style.flexDirection = 'column';
    regionTextContainer.style.gap = '2px';

    if (showAsPlaceholder && !showFullDetails) {
      // Show placeholder text for undiscovered region
      const lineSpan = document.createElement('span');
      lineSpan.className = 'region-name region-placeholder';
      lineSpan.textContent = '???';
      lineSpan.style.fontStyle = 'italic';
      lineSpan.style.color = '#888';
      regionTextContainer.appendChild(lineSpan);
      regionTextContainer.title = 'Undiscovered region';
    } else {
      // Get display elements from regionUI
      const displayElements = this.regionUI.getRegionDisplayElements(regionStaticData || regionName);

      // Add each display element as a separate line
      const suffix = this._suffixIfDuplicate(regionName, uid);
      displayElements.forEach((element, index) => {
        const lineSpan = document.createElement('span');
        lineSpan.className = `region-${element.type}`;
        // Only add suffix to the first line
        lineSpan.textContent = index === 0 ? element.text + suffix : element.text;
        regionTextContainer.appendChild(lineSpan);
      });
    }

    headerEl.appendChild(regionTextContainer);

    // Add status
    const statusSpan = document.createElement('span');
    statusSpan.className = 'region-status';
    statusSpan.textContent = `(${checkedLocationsCount}/${totalLocations})`;
    headerEl.appendChild(statusSpan);

    // Add colorblind symbol if needed
    if (useColorblind) {
      const colorblindSpan = document.createElement('span');
      colorblindSpan.className = `colorblind-symbol ${regionIsReachable ? 'accessible' : 'inaccessible'}`;
      colorblindSpan.textContent = regionIsReachable ? '✓' : '✗';
      headerEl.appendChild(colorblindSpan);
    }

    // Add expand/collapse indicator arrow
    const expandIndicator = document.createElement('span');
    expandIndicator.className = 'region-expand-indicator';
    expandIndicator.textContent = expanded ? '\u25BC' : '\u25B6';
    headerEl.appendChild(expandIndicator);

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
    isDiscoveryModeActive,
    sectionOrder = 'entrances-exits-locations',
    isRegionDiscovered = true,
    discoverySettings = {},
    navigationContext = null
  ) {
    const contentEl = document.createElement('div');
    contentEl.classList.add('region-content');
    contentEl.style.display = expanded ? 'block' : 'none';

    // Add world type info
    this.addWorldTypeInfo(contentEl, regionStaticData);

    // Add dungeon info
    this.addDungeonInfo(contentEl, regionName);

    // Parse the section order and add sections in the specified order
    const sections = sectionOrder.split('-');

    for (const section of sections) {
      switch (section) {
        case 'entrances':
          this.addEntrances(contentEl, regionName, staticData, snapshot, snapshotInterface, useColorblind, navigationContext, isDiscoveryModeActive, discoverySettings);
          break;
        case 'exits':
          this.addExits(
            contentEl,
            regionName,
            regionStaticData,
            snapshot,
            snapshotInterface,
            regionIsReachable,
            useColorblind,
            uid,
            isDiscoveryModeActive,
            isRegionDiscovered,
            discoverySettings,
            navigationContext
          );
          break;
        case 'locations':
          this.addLocations(
            contentEl,
            regionName,
            regionStaticData,
            snapshot,
            snapshotInterface,
            regionIsReachable,
            useColorblind,
            isDiscoveryModeActive,
            staticData,
            isRegionDiscovered,
            discoverySettings
          );
          break;
      }
    }

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
   * Creates a circular badge with a right-pointing arrow image.
   * Used to indicate which entrance/exit was used on the navigation path.
   * @returns {HTMLElement} The badge element
   */
  createPathUsedBadge() {
    const badge = document.createElement('span');
    badge.classList.add('path-used-badge');
    badge.title = 'Used on current path';
    const img = document.createElement('img');
    // Inline SVG data URI: right-pointing arrow
    img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23FFC107'%3E%3Cpath d='M4 12h13.17l-4.88-4.88a1 1 0 1 1 1.42-1.42l6.59 6.59a.5.5 0 0 1 0 .71l-6.59 6.59a1 1 0 0 1-1.42-1.42L17.17 13H4a1 1 0 0 1 0-2z'/%3E%3C/svg%3E";
    img.alt = '→';
    badge.appendChild(img);
    return badge;
  }

  /**
   * Adds entrances list to the content element
   */
  addEntrances(contentEl, regionName, staticData, snapshot, snapshotInterface, useColorblind, navigationContext = null, isDiscoveryModeActive = false, discoverySettings = {}) {
    const entrancesList = document.createElement('ul');
    entrancesList.classList.add('region-entrances-list');
    
    // Check if bidirectional exits are assumed from game settings (with auto-detection)
    const bidirectionalSetting = stateManagerProxySingleton.getEffectiveBidirectionalSetting();
    const assumeBidirectional = bidirectionalSetting.assumeBidirectional;
    
    // Find all entrances to this region
    const entrances = [];
    // staticData.regions is a Map, so use entries() or forEach()
    for (const [sourceRegionName, sourceRegionData] of staticData.regions.entries()) {
      if (sourceRegionData.exits) {
        for (const exit of sourceRegionData.exits) {
          if (exit.connected_region === regionName) {
            // Check if there's a return path (bidirectional)
            let returnExit = null;
            let isBidirectional = assumeBidirectional;

            // Use Map.get() instead of bracket notation
            const currentRegionData = staticData.regions.get(regionName);
            if (!assumeBidirectional && currentRegionData?.exits) {
              // Look for an exit from current region back to source
              returnExit = currentRegionData.exits.find(
                e => e.connected_region === sourceRegionName
              );
              isBidirectional = !!returnExit;
            } else if (assumeBidirectional && currentRegionData?.exits) {
              // Even with assume_bidirectional, we need to find the return exit for move functionality
              returnExit = currentRegionData.exits.find(
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
      entrancesHeader.classList.add('region-entrances-header');
      contentEl.appendChild(entrancesHeader);
      
      entrances.forEach((entrance) => {
        const li = document.createElement('li');
        li.classList.add('entrance-item');

        // Create a wrapper div for the entire clickable area
        const entranceWrapper = document.createElement('div');
        entranceWrapper.classList.add('entrance-wrapper');

        // Check if this entrance was used on the navigation path
        const isPathUsedEntrance = navigationContext?.exitUsed &&
          entrance.exitName === navigationContext.exitUsed;
        if (isPathUsedEntrance) {
          entranceWrapper.classList.add('path-used');
        }

        // Create a header row for entrance info and status
        const headerRow = document.createElement('div');
        headerRow.style.display = 'flex';
        headerRow.style.justifyContent = 'space-between';
        headerRow.style.alignItems = 'center';
        headerRow.style.gap = '8px';

        // Add path-used badge on left side if this entrance was used
        if (isPathUsedEntrance) {
          headerRow.insertBefore(this.createPathUsedBadge(), headerRow.firstChild);
        }

        // Create entrance info span with discovery checks
        const entranceInfo = document.createElement('span');
        entranceInfo.style.flex = '1';
        const showFullDetails = discoverySettings.showUndiscoveredDetails ?? false;
        const sourceRegionDiscovered = discoveryStateSingleton.isRegionDiscovered(entrance.sourceRegion);
        const sourceExitDiscovered = discoveryStateSingleton.isExitDiscovered(entrance.sourceRegion, entrance.exitName);
        const hideSourceName = isDiscoveryModeActive && !sourceRegionDiscovered && !showFullDetails;
        const hideExitName = isDiscoveryModeActive && (!sourceRegionDiscovered || !sourceExitDiscovered) && !showFullDetails;

        if (hideSourceName) {
          const placeholderSpan = document.createElement('span');
          placeholderSpan.textContent = '???';
          placeholderSpan.style.fontStyle = 'italic';
          placeholderSpan.style.opacity = '0.6';
          entranceInfo.appendChild(placeholderSpan);
        } else {
          const regionLink = commonUI.createRegionLink(
            entrance.sourceRegion,
            useColorblind,
            snapshot
          );
          entranceInfo.appendChild(regionLink);
        }
        const exitNameDisplay = hideExitName ? '???' : entrance.exitName;
        entranceInfo.appendChild(document.createTextNode(` - ${exitNameDisplay}`));
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
        
        // Apply border color based on status (path-used overrides)
        if (isPathUsedEntrance) {
          entranceWrapper.style.borderColor = '#FFC107';
          entranceWrapper.style.backgroundColor = 'rgba(255, 193, 7, 0.12)';
        } else if (!entrance.isBidirectional) {
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
              this.eventBus.publish('ui:activatePanel', { panelId: 'regionsPanel' });
              this.eventBus.publish('ui:navigateToRegion', {
                regionName: entrance.sourceRegion
              });
              log('info', `[Entrance Block] Navigating to region: ${entrance.sourceRegion} (Show All mode)`);
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
        const entranceUndiscovered = isDiscoveryModeActive && (!sourceRegionDiscovered || !sourceExitDiscovered);
        li.classList.toggle('accessible', isTraversable);
        li.classList.toggle('inaccessible', !isTraversable);
        li.classList.toggle('bidirectional', entrance.isBidirectional);
        li.classList.toggle('undiscovered', entranceUndiscovered);

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
    isDiscoveryModeActive,
    isRegionDiscovered = true,
    discoverySettings = {},
    navigationContext = null
  ) {
    const exitsHeader = document.createElement('h4');
    exitsHeader.textContent = 'Exits:';
    exitsHeader.classList.add('region-exits-header');
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

        // Discovery mode discovery check
        const isExitDiscovered = discoveryStateSingleton.isExitDiscovered(regionName, exitDef.name);

        // Determine if this exit should be shown as a placeholder
        let showAsPlaceholder = false;
        if (isDiscoveryModeActive) {
          if (!isRegionDiscovered) {
            // Region is undiscovered - respect undiscoveredDisplay setting
            if (discoverySettings.undiscoveredDisplay === 'hidden') {
              // Check if Show Undiscovered is enabled
              const showUndiscoveredCheckbox = this.regionUI.rootElement?.querySelector('#region-show-undiscovered');
              const showUndiscovered = showUndiscoveredCheckbox?.checked ?? true;
              if (!showUndiscovered) {
                return; // Skip this exit entirely (using forEach, so return continues to next)
              }
            }
            showAsPlaceholder = true;
          } else if (!isExitDiscovered) {
            // Region is discovered but exit is not
            showAsPlaceholder = true;
          }
        }

        const li = document.createElement('li');
        li.classList.add('exit-item');
        const showFullDetails = discoverySettings.showUndiscoveredDetails ?? false;
        const exitNameDisplay = showAsPlaceholder && !showFullDetails ? '???' : exitDef.name;

        // Check if this exit was used on the navigation path
        const isPathUsedExit = navigationContext?.exitUsedFromHere &&
          exitDef.name === navigationContext.exitUsedFromHere;

        // Create a wrapper div for the entire clickable area
        const exitWrapper = document.createElement('div');
        exitWrapper.classList.add('exit-wrapper');
        if (isPathUsedExit) {
          exitWrapper.classList.add('path-used');
        }

        // Create a header row for exit info and status
        const headerRow = document.createElement('div');
        headerRow.style.display = 'flex';
        headerRow.style.justifyContent = 'space-between';
        headerRow.style.alignItems = 'center';
        headerRow.style.gap = '8px';

        // Create exit info span
        const exitInfo = document.createElement('span');
        exitInfo.style.flex = '1';
        exitInfo.appendChild(document.createTextNode(`${exitNameDisplay} → `));
        // Hide connected region name if exit is placeholder or connected region is undiscovered
        const connectedRegionDiscovered = discoveryStateSingleton.isRegionDiscovered(connectedRegionName);
        const hideConnectedName = showAsPlaceholder || (isDiscoveryModeActive && !connectedRegionDiscovered && !showFullDetails);
        if (hideConnectedName) {
          const placeholderSpan = document.createElement('span');
          placeholderSpan.textContent = '???';
          placeholderSpan.style.fontStyle = 'italic';
          placeholderSpan.style.opacity = '0.6';
          exitInfo.appendChild(placeholderSpan);
        } else {
          exitInfo.appendChild(
            commonUI.createRegionLink(
              connectedRegionName,
              useColorblind,
              snapshot
            )
          );
        }
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

        // Add path-used badge on right side if this exit was used
        if (isPathUsedExit) {
          headerRow.appendChild(this.createPathUsedBadge());
        }

        exitWrapper.appendChild(headerRow);

        // Apply classes and styling
        li.classList.toggle('accessible', isTraversable);
        li.classList.toggle('inaccessible', !isTraversable);
        li.classList.toggle('undiscovered', showAsPlaceholder);

        // Apply border color based on status (path-used overrides)
        if (isPathUsedExit) {
          exitWrapper.style.borderColor = '#FFC107';
          exitWrapper.style.backgroundColor = 'rgba(255, 193, 7, 0.12)';
        } else if (isTraversable) {
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
        exitWrapper.style.cursor = isTraversable && connectedRegionName && !showAsPlaceholder ? 'pointer' : 'default';
        exitWrapper.style.display = 'block';
        exitWrapper.style.transition = 'all 0.2s ease';
        
        // Add hover effect for traversable exits
        if (isTraversable && connectedRegionName && !showAsPlaceholder) {
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
                // First activate the regions panel if not already active
                this.eventBus.publish('ui:activatePanel', { panelId: 'regionsPanel' });

                // Then navigate to the target region
                this.eventBus.publish('ui:navigateToRegion', {
                  regionName: connectedRegionName
                });

                log('info', `[Exit Block] Navigating to region: ${connectedRegionName} (Show All mode)`);
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
          ruleDiv.classList.add('logic-rule-container');
          ruleDiv.style.marginTop = '8px';
          ruleDiv.style.paddingTop = '8px';
          ruleDiv.style.borderTop = '1px solid rgba(128, 128, 128, 0.3)';

          // Add "Rule: " text and append the logic tree element directly (not as innerHTML)
          const ruleLabel = document.createTextNode('Rule: ');
          ruleDiv.appendChild(ruleLabel);
          ruleDiv.appendChild(logicTreeElement);

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
    isDiscoveryModeActive,
    staticData,
    isRegionDiscovered = true,
    discoverySettings = {}
  ) {
    const locationsHeader = document.createElement('h4');
    locationsHeader.textContent = 'Locations:';
    locationsHeader.classList.add('region-locations-header');
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

        // Discovery mode discovery check
        const isLocationDiscovered = discoveryStateSingleton.isLocationDiscovered(locationDef.name);

        // Determine if this location should be shown as a placeholder
        let showAsPlaceholder = false;
        if (isDiscoveryModeActive) {
          if (!isRegionDiscovered) {
            // Region is undiscovered - respect undiscoveredDisplay setting
            if (discoverySettings.undiscoveredDisplay === 'hidden') {
              // Check if Show Undiscovered is enabled
              const showUndiscoveredCheckbox = this.regionUI.rootElement?.querySelector('#region-show-undiscovered');
              const showUndiscovered = showUndiscoveredCheckbox?.checked ?? true;
              if (!showUndiscovered) {
                return; // Skip this location entirely (using forEach, so return continues to next)
              }
            }
            showAsPlaceholder = true;
          } else if (!isLocationDiscovered) {
            // Region is discovered but location is not
            showAsPlaceholder = true;
          }
        }

        const li = document.createElement('li');
        li.classList.add('location-item');
        li.dataset.locationName = locationDef.name; // Add data attribute for easy targeting
        const showFullDetails = discoverySettings.showUndiscoveredDetails ?? false;
        const useSubNames = this.regionUI?.displaySettings?.getSetting('useSubstitutedNames') ?? true;
        const locationDisplayName = (useSubNames && locationDef.displayName) ? locationDef.displayName : locationDef.name;
        const locationNameDisplay = showAsPlaceholder && !showFullDetails ? '???' : locationDisplayName;
        
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

        // Add item name if showLocationItems is enabled
        settingsManager.getSetting('moduleSettings.commonUI.showLocationItems', false).then(showItems => {
          if (showItems && staticData?.locationItems) {
            const itemAtLocation = staticData.locationItems.get(locationDef.name);
            if (itemAtLocation && itemAtLocation.name) {
              const itemSpan = document.createElement('span');
              itemSpan.classList.add('location-item-info');
              itemSpan.style.marginLeft = '8px';
              itemSpan.style.fontStyle = 'italic';
              itemSpan.style.fontSize = '0.9em';
              itemSpan.style.color = '#888';
              const useSubNamesForItem = this.regionUI?.displaySettings?.getSetting('useSubstitutedNames') ?? true;
              const itemDisplayName = (useSubNamesForItem && itemAtLocation.displayName) ? itemAtLocation.displayName : itemAtLocation.name;
              itemSpan.textContent = `(${itemDisplayName}`;
              if (itemAtLocation.player) {
                itemSpan.textContent += ` - P${itemAtLocation.player}`;
              }
              itemSpan.textContent += ')';
              // Insert after the locLink in headerRow
              locLink.parentNode.insertBefore(itemSpan, locLink.nextSibling);
            }
          }
        });

        // Check if location is queued in the path (only if the setting is enabled)
        settingsManager.getSetting('moduleSettings.regionGraph.addLocationsToPath', false).then(addToPathEnabled => {
          if (addToPathEnabled) {
            import('../playerState/singleton.js').then(({ getPlayerStateSingleton }) => {
              try {
                const playerState = getPlayerStateSingleton();
                const fullPath = playerState.getPath();
                const isQueued = fullPath.some(entry => 
                  entry.type === 'locationCheck' && 
                  entry.locationName === locationDef.name &&
                  entry.sourceRegion === regionName
                );
                
                // Update status if queued (need to update after initial render)
                if (isQueued && statusIndicator) {
                  if (locChecked) {
                    statusIndicator.textContent = 'Checked, Queued';
                    statusIndicator.className = 'location-status status-checked status-queued';
                  } else if (locAccessible) {
                    statusIndicator.textContent = 'Queued';
                    statusIndicator.className = 'location-status status-queued';
                  }
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
        li.classList.toggle('undiscovered', showAsPlaceholder);
        
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
        if (locAccessible && !locChecked && !showAsPlaceholder) {
          locationWrapper.addEventListener('click', async () => {
            try {
              log(
                'info',
                `[LocationWrapper] Clicked on location: ${locationDef.name}, Region: ${regionName}`
              );

              // Check if we should add to path (use same setting as regionGraph)
              const shouldAddToPath = await settingsManager.getSetting('moduleSettings.regionGraph.addLocationsToPath', false);
              
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
          const locationContextInterface = createSnapshotInterface(
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
          ruleDiv.classList.add('logic-rule-container');
          ruleDiv.style.marginTop = '8px';
          ruleDiv.style.paddingTop = '8px';
          ruleDiv.style.borderTop = '1px solid rgba(128, 128, 128, 0.3)';

          // Add "Rule: " text and append the logic tree element directly (not as innerHTML)
          const ruleLabel = document.createTextNode('Rule: ');
          ruleDiv.appendChild(ruleLabel);
          ruleDiv.appendChild(logicTreeElement);

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
  attachEventListeners(headerEl, uid, regionName) {
    // Header click listener - entire header is clickable to toggle expand/collapse
    headerEl.addEventListener('click', () => {
      // Publish click event for Discovery module to handle
      this.eventBus.publish('ui:regionHeaderClicked', { regionName });

      this.regionUI.toggleRegionByUID(uid);
    });
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
          if (entry.type === 'regionMove' && entry.destinationRegion === regionName) {
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

      this.eventBus.publish('ui:activatePanel', { panelId: 'dungeonsPanel' });
      log('info', `Published ui:activatePanel for dungeonsPanel.`);

      this.eventBus.publish('ui:navigateToDungeon', {
        dungeonName: dungeonName,
        sourcePanel: 'regions',
      });
      log(
        'info',
        `Published ui:navigateToDungeon for ${dungeonName}.`
      );
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