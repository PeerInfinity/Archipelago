// regionBlockBuilder.js
import { evaluateRule } from '../shared/ruleEngine.js';
import { createStateSnapshotInterface } from '../shared/stateInterface.js';
import { renderLogicTree } from '../commonUI/index.js';
import commonUI from '../commonUI/index.js';
import loopStateSingleton from '../loops/loopStateSingleton.js';
import { stateManagerProxySingleton } from '../stateManager/index.js';

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
    staticData
  ) {
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
    this.addPathAnalysisSection(contentEl, regionName);

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
    
    // Find all entrances to this region
    const entrances = [];
    for (const [sourceRegionName, sourceRegionData] of Object.entries(staticData.regions)) {
      if (sourceRegionData.exits) {
        for (const exit of sourceRegionData.exits) {
          if (exit.connected_region === regionName) {
            entrances.push({
              sourceRegion: sourceRegionName,
              exitName: exit.name,
              accessRule: exit.access_rule
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
        
        // Create clickable region link
        const regionLink = commonUI.createRegionLink(
          entrance.sourceRegion,
          useColorblind,
          snapshot
        );
        li.appendChild(regionLink);
        
        li.appendChild(document.createTextNode(` - ${entrance.exitName}`));
        
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
        
        // Apply classes based on accessibility
        li.classList.toggle('accessible', isTraversable);
        li.classList.toggle('inaccessible', !isTraversable);
        
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
        const exitNameDisplay =
          isLoopModeActive && !isExitDiscovered ? '???' : exitDef.name;
        li.appendChild(document.createTextNode(`${exitNameDisplay} → `));
        li.appendChild(
          commonUI.createRegionLink(
            connectedRegionName,
            useColorblind,
            snapshot
          )
        );

        // Add move button
        const moveBtn = this.createMoveButton(
          regionName,
          uid,
          connectedRegionName,
          exitDef.name,
          isTraversable,
          isLoopModeActive,
          isExitDiscovered
        );
        li.appendChild(moveBtn);

        // Apply classes
        li.classList.toggle('accessible', isTraversable);
        li.classList.toggle('inaccessible', !isTraversable);
        li.classList.toggle(
          'undiscovered',
          isLoopModeActive && !isExitDiscovered
        );

        // Render logic tree for the exit rule
        if (exitDef.access_rule) {
          const logicTreeElement = renderLogicTree(
            exitDef.access_rule,
            useColorblind,
            snapshotInterface
          );
          const ruleDiv = document.createElement('div');
          ruleDiv.style.marginLeft = '1rem';
          ruleDiv.innerHTML = `Rule: ${logicTreeElement.outerHTML}`;
          li.appendChild(ruleDiv);
        }

        exitsList.appendChild(li);
      });
    } else {
      exitsList.innerHTML = '<li>No exits defined.</li>';
    }
    contentEl.appendChild(exitsList);
  }

  /**
   * Creates a move button for exits
   */
  createMoveButton(
    regionName,
    uid,
    connectedRegionName,
    exitName,
    isTraversable,
    isLoopModeActive,
    isExitDiscovered
  ) {
    const moveBtn = document.createElement('button');
    moveBtn.classList.add('move-btn');
    moveBtn.textContent = 'Move';
    moveBtn.disabled =
      !isTraversable ||
      !connectedRegionName ||
      (isLoopModeActive && !isExitDiscovered);
    moveBtn.style.marginLeft = '10px';

    moveBtn.addEventListener('click', () => {
      if (!moveBtn.disabled) {
        // Import moduleDispatcher from regionUI's module
        import('./index.js').then(({ moduleDispatcher }) => {
          if (moduleDispatcher) {
            moduleDispatcher.publish('user:regionMove', {
              sourceRegion: regionName,
              sourceUID: uid,
              targetRegion: connectedRegionName,
              exitName: exitName
            }, 'bottom');
          } else {
            log('warn', 'moduleDispatcher not available for publishing user:regionMove');
          }
        });
      }
    });

    return moveBtn;
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
        const locationNameDisplay =
          isLoopModeActive && !isLocationDiscovered ? '???' : locationDef.name;
        
        const locLink = document.createElement('span');
        locLink.textContent = locationNameDisplay;
        locLink.classList.add('location-link');
        locLink.dataset.location = locationDef.name;
        locLink.dataset.region = regionName;
        li.appendChild(locLink);

        // Add check button
        const checkBtn = this.createCheckButton(
          locationDef,
          regionName,
          locAccessible,
          locChecked,
          isLoopModeActive,
          isLocationDiscovered
        );
        li.appendChild(checkBtn);

        if (locChecked) {
          const checkMark = document.createElement('span');
          checkMark.classList.add('check-mark');
          checkMark.textContent = ' ✓';
          li.appendChild(checkMark);
        }

        // Apply classes
        li.classList.toggle('accessible', locAccessible && !locChecked);
        li.classList.toggle('inaccessible', !locAccessible);
        li.classList.toggle('checked-location', locChecked);
        li.classList.toggle(
          'undiscovered',
          isLoopModeActive && !isLocationDiscovered
        );

        // Render logic tree for the location rule
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
          ruleDiv.style.marginLeft = '1rem';
          ruleDiv.innerHTML = `Rule: ${logicTreeElement.outerHTML}`;
          li.appendChild(ruleDiv);
        }

        locationsList.appendChild(li);
      });
    } else {
      locationsList.innerHTML = '<li>No locations defined.</li>';
    }
    contentEl.appendChild(locationsList);
  }

  /**
   * Creates a check button for locations
   */
  createCheckButton(
    locationDef,
    regionName,
    locAccessible,
    locChecked,
    isLoopModeActive,
    isLocationDiscovered
  ) {
    const checkBtn = document.createElement('button');
    checkBtn.classList.add('check-loc-btn');
    checkBtn.textContent = 'Check';
    checkBtn.style.display = locChecked ? 'none' : 'inline-block';
    checkBtn.disabled = !locAccessible || locChecked;
    if (isLoopModeActive && !isLocationDiscovered) checkBtn.disabled = true;

    checkBtn.addEventListener('click', async () => {
      if (locAccessible && !locChecked) {
        try {
          log(
            'info',
            `[CheckBtn] Clicked on location: ${locationDef.name}, Region: ${regionName}`
          );

          // Import moduleDispatcher from regionUI's module
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
        } catch (error) {
          log(
            'error',
            `Error checking location ${locationDef.name}:`,
            error
          );
        }
      }
    });

    return checkBtn;
  }

  /**
   * Adds path analysis section to the content element
   */
  addPathAnalysisSection(contentEl, regionName) {
    const pathsControlDiv = document.createElement('div');
    pathsControlDiv.classList.add('paths-control');
    pathsControlDiv.style.marginTop = '1rem';
    pathsControlDiv.innerHTML = `
      <div class="paths-buttons">
        <button class="analyze-paths-btn">Analyze Paths</button>
        <span class="paths-count" style="display: none;"></span>
      </div>
    `;
    contentEl.appendChild(pathsControlDiv);

    const pathsContainer = document.createElement('div');
    pathsContainer.classList.add('region-paths');
    pathsContainer.style.display = 'none';
    contentEl.appendChild(pathsContainer);

    // Setup the button using the PathAnalyzerUI instance
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