// spoilerChecklistUI.js - UI component for sphere log checklist

import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import { evaluateRule } from '../shared/ruleEngine.js';
import { createSnapshotInterface } from '../shared/snapshotInterface.js';
import commonUI, { debounce } from '../commonUI/index.js';
import { getModuleEventBus, getCrossPlayerItemSync } from './index.js';
import { compareSphereIndex } from './crossPlayerItemSync.js';
import settingsManager from '../../app/core/settingsManager.js';

// Helper function for logging
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('spoilerChecklistUI', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[spoilerChecklistUI] ${message}`, ...data);
  }
}

export class SpoilerChecklistUI {
  constructor(container, componentState) {
    this.container = container;
    this.componentState = componentState;
    this.rootElement = null;
    this.checklistContainer = null;
    this.showRegionColumn = true;
    this.showItemColumn = true;
    this.showLocationItems = false; // From settings
    this.simulateReceivedItems = false; // Cross-player item sync checkbox
    this.isInitialized = false;
    this.sphereState = null; // Will be injected via public function
    this.dispatcher = null; // Will get from locations module
    this.currentPlayerId = null; // Current player ID for multiworld support
    this.syncStatusLine = null; // Status line element for sync info
    Object.defineProperty(this, 'eventBus', { get: () => getModuleEventBus(), configurable: true });

    // Create and append root element
    this.getRootElement();
    if (this.rootElement) {
      this.container.element.appendChild(this.rootElement);
    }

    // Defer initialization
    const readyHandler = (eventPayload) => {
      log('info', '[SpoilerChecklistUI] Received app:readyForUiDataLoad. Initializing checklist.');
      this.initialize();
      this.eventBus.unsubscribe('app:readyForUiDataLoad', readyHandler);
    };
    this.eventBus.subscribe('app:readyForUiDataLoad', readyHandler);

    this.container.on('destroy', () => {
      this.dispose();
    });
  }

  getRootElement() {
    if (!this.rootElement) {
      this.rootElement = document.createElement('div');
      this.rootElement.className = 'spoiler-checklist-root';

      // Add styles
      const style = document.createElement('style');
      style.textContent = `
        .spoiler-checklist-root {
          display: flex;
          flex-direction: column;
          height: 100%;
          background-color: #2d2d30;
          color: #e0e0e0;
          overflow: hidden;
        }
        .spoiler-checklist-controls {
          padding: 0.5rem;
          border-bottom: 1px solid #666;
          flex-shrink: 0;
        }
        .spoiler-checklist-controls label {
          margin-right: 15px;
          cursor: pointer;
        }
        .spoiler-checklist-container {
          flex-grow: 1;
          overflow-y: auto;
          padding: 0.5rem;
        }
        .sphere-section {
          margin-bottom: 1rem;
          padding: 0.5rem;
          border-radius: 4px;
        }
        .sphere-section-completed {
          background-color: #1e1e1e;
        }
        .sphere-section-current {
          background-color: #2d3d2d;
        }
        .sphere-section-future {
          background-color: #3d2d2d;
        }
        .sphere-heading {
          font-weight: bold;
          font-size: 1.1em;
          margin-bottom: 0.5rem;
          cursor: pointer;
          user-select: none;
        }
        .sphere-subheading {
          font-weight: bold;
          margin-top: 0.5rem;
          margin-bottom: 0.25rem;
          margin-left: 1rem;
          cursor: pointer;
          user-select: none;
        }
        .location-row {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 0.5rem;
          padding: 0.25rem 0;
          margin-left: 2rem;
          align-items: center;
        }
        .location-row.with-region {
          grid-template-columns: auto auto 1fr auto;
        }
        .cross-player-location-row {
          opacity: 0.5;
          font-style: italic;
        }
        .cross-player-location-row.cross-player-received {
          opacity: 0.8;
        }
        .cross-player-location-row.cross-player-gives-to-current {
          opacity: 1;
          font-style: normal;
        }
        .cross-player-gives-to-current .cross-player-location {
          color: #fff;
        }
        .cross-player-gives-to-current .location-item {
          color: #4CAF50;
        }
        .cross-player-location {
          cursor: default;
          color: #888;
        }
        .cross-player-location:hover {
          text-decoration: none;
        }
        .cross-player-region {
          color: #9C27B0;
          font-weight: bold;
        }
        .location-checkbox {
          cursor: pointer;
        }
        .location-checkbox:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }
        .location-name {
          cursor: pointer;
          text-decoration: none;
        }
        .location-name:hover {
          text-decoration: underline;
        }
        .region-link {
          cursor: pointer;
          text-decoration: none;
        }
        .region-link:hover {
          text-decoration: underline;
        }
        .location-item {
          font-style: italic;
          color: #aaa;
        }
        .cross-player-item {
          color: #9C27B0;
          font-weight: bold;
        }
        .cross-player-item::after {
          content: " ➜";
          font-size: 0.9em;
        }
        .location-name-green {
          color: #4CAF50;
        }
        .location-name-red {
          color: #f44336;
        }
        .location-name-yellow {
          color: #FFC107;
        }
        .location-name-orange {
          color: #FF9800;
        }
        .region-accessible {
          color: #4CAF50;
        }
        .region-inaccessible {
          color: #f44336;
        }
        .spoiler-checklist-sync-status {
          padding: 0.25rem 0.5rem;
          border-bottom: 1px solid #666;
          font-size: 0.85em;
          color: #aaa;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .spoiler-checklist-sync-status .sync-btn {
          padding: 0.15rem 0.5rem;
          font-size: 0.85em;
          cursor: pointer;
          background: #3c3c3c;
          border: 1px solid #666;
          color: #e0e0e0;
          border-radius: 3px;
        }
        .spoiler-checklist-sync-status .sync-btn:hover {
          background: #4c4c4c;
        }
      `;
      this.rootElement.appendChild(style);

      // Create controls
      const controls = document.createElement('div');
      controls.className = 'spoiler-checklist-controls';
      controls.innerHTML = `
        <label>
          <input type="checkbox" id="show-region-column" checked />
          Show Region Column
        </label>
        <label>
          <input type="checkbox" id="show-item-column" checked />
          Show Item Column
        </label>
        <label>
          <input type="checkbox" id="simulate-received-items" />
          Simulate Received Items
        </label>
      `;
      this.rootElement.appendChild(controls);

      // Sync status line (hidden until enabled)
      this.syncStatusLine = document.createElement('div');
      this.syncStatusLine.className = 'spoiler-checklist-sync-status';
      this.syncStatusLine.style.display = 'none';
      this.rootElement.appendChild(this.syncStatusLine);

      // Create checklist container
      this.checklistContainer = document.createElement('div');
      this.checklistContainer.className = 'spoiler-checklist-container';
      this.rootElement.appendChild(this.checklistContainer);

      // Attach control listeners
      this.rootElement.querySelector('#show-region-column').addEventListener('change', (e) => {
        this.showRegionColumn = e.target.checked;
        this.updateDisplay();
      });

      this.rootElement.querySelector('#show-item-column').addEventListener('change', (e) => {
        this.showItemColumn = e.target.checked;
        this.updateDisplay();
      });

      this.rootElement.querySelector('#simulate-received-items').addEventListener('change', (e) => {
        this.simulateReceivedItems = e.target.checked;
        settingsManager.updateSetting('moduleSettings.spoilerChecklist.simulateReceivedItems', e.target.checked);
        this._updateSyncStatusLine();
        if (e.target.checked) {
          this._syncReceivedItems();
        }
      });
    }
    return this.rootElement;
  }

  async initialize() {
    log('info', '[SpoilerChecklistUI] Initializing...');

    // Get sphereState singleton directly
    try {
      const { getSphereStateSingleton } = await import('../sphereState/singleton.js');
      const sphereStateInstance = getSphereStateSingleton();
      if (!sphereStateInstance) {
        log('error', 'sphereState singleton not available');
        return;
      }
      // Create a wrapper object that mimics the public API
      this.sphereState = {
        getSphereData: () => sphereStateInstance.getSphereData(),
        getMultiworldSphereData: () => sphereStateInstance.getMultiworldSphereData(),
        getPerSphereReceivedItems: () => sphereStateInstance.getPerSphereReceivedItems(),
        getCurrentSphere: () => sphereStateInstance.getCurrentSphere(),
        getCurrentIntegerSphere: () => sphereStateInstance.getCurrentIntegerSphere(),
        getCurrentFractionalSphere: () => sphereStateInstance.getCurrentFractionalSphere(),
        getCurrentPlayerId: () => sphereStateInstance.currentPlayerId,
      };
    } catch (error) {
      log('error', 'Failed to get sphereState:', error);
      return;
    }

    // Get dispatcher from locations module
    try {
      const locationsModule = await import('../locations/index.js');
      this.dispatcher = locationsModule.getDispatcher();
    } catch (error) {
      log('warn', 'Failed to get dispatcher from locations module:', error);
    }

    // Load settings
    try {
      this.showLocationItems = await settingsManager.getSetting('moduleSettings.commonUI.showLocationItems', false);
      this.simulateReceivedItems = await settingsManager.getSetting('moduleSettings.spoilerChecklist.simulateReceivedItems', false);
      const simCheckbox = this.rootElement.querySelector('#simulate-received-items');
      if (simCheckbox) simCheckbox.checked = this.simulateReceivedItems;
    } catch (error) {
      log('error', 'Error loading settings:', error);
    }

    // Get current player ID from static data
    this._updateCurrentPlayerId();

    // Subscribe to events
    this.eventBus.subscribe('stateManager:snapshotUpdated', debounce(() => {
      this.updateDisplay();
      this._maybeSyncReceivedItems();
    }, 50));
    this.eventBus.subscribe('sphereState:dataLoaded', () => this.updateDisplay());
    this.eventBus.subscribe('sphereState:currentSphereChanged', () => this.updateDisplay());
    this.eventBus.subscribe('stateManager:rulesLoaded', () => {
      this._updateCurrentPlayerId();
      this.updateDisplay();
    });
    this.eventBus.subscribe('settings:changed', async ({ key }) => {
      if (key === '*' || key.startsWith('moduleSettings.commonUI.showLocationItems')) {
        this.showLocationItems = await settingsManager.getSetting('moduleSettings.commonUI.showLocationItems', false);
        this.updateDisplay();
      }
    });

    this.isInitialized = true;
    log('info', '[SpoilerChecklistUI] Initialization complete.');

    // Initial render
    this.updateDisplay();
  }

  /**
   * Sync received items if the checkbox is enabled and checked locations changed.
   */
  _maybeSyncReceivedItems() {
    if (!this.simulateReceivedItems) return;
    if (this._isSyncing) return;

    const snapshot = stateManager.getLatestStateSnapshot();
    if (!snapshot) return;

    const sync = getCrossPlayerItemSync();
    const checkedCount = (snapshot.checkedLocations || []).length;
    if (!sync.hasCheckedLocationsChanged(checkedCount)) return;

    this._syncReceivedItems();
  }

  /**
   * Execute a sync and update the status line.
   * Guarded against concurrent calls.
   */
  async _syncReceivedItems() {
    if (this._isSyncing) return;
    this._isSyncing = true;
    const sync = getCrossPlayerItemSync();
    try {
      const result = await sync.sync();
      this._updateSyncStatusLine();
      this.updateDisplay();
      if (result.grantedCount > 0) {
        this.eventBus.publish('spoilerChecklist:itemsSynced', result);
      }
    } catch (error) {
      log('error', 'Sync failed:', error);
    } finally {
      this._isSyncing = false;
    }
  }

  /**
   * Update the sync status line display.
   */
  _updateSyncStatusLine() {
    if (!this.syncStatusLine) return;

    if (!this.simulateReceivedItems) {
      this.syncStatusLine.style.display = 'none';
      return;
    }

    const sync = getCrossPlayerItemSync();
    const result = sync.getLastSyncResult();
    this.syncStatusLine.style.display = 'flex';

    if (!result) {
      this.syncStatusLine.innerHTML = `
        <span>No sync yet</span>
        <button class="sync-btn" id="sync-now-btn">Sync Now</button>
      `;
    } else {
      const frontierText = result.frontierSphere
        ? `Frontier: ${result.frontierSphere}`
        : 'All locations checked';
      this.syncStatusLine.innerHTML = `
        <span>${result.totalCrossPlayerItems} cross-player items through frontier | ${frontierText}</span>
        <button class="sync-btn" id="sync-now-btn">Sync Now</button>
      `;
    }

    const syncBtn = this.syncStatusLine.querySelector('#sync-now-btn');
    if (syncBtn) {
      syncBtn.addEventListener('click', () => this._syncReceivedItems());
    }
  }

  dispose() {
    log('info', '[SpoilerChecklistUI] Disposing...');
    // Event bus subscriptions are automatically cleaned up by panel destroy
  }

  /**
   * Update the current player ID from static data
   * For multiworld games, this identifies which player's perspective we're viewing
   * @private
   */
  _updateCurrentPlayerId() {
    const staticData = stateManager.getStaticData();
    if (!staticData) {
      this.currentPlayerId = null;
      return;
    }

    // Try to get player ID from game_info (multiworld format)
    if (staticData.game_info) {
      const gameInfoKeys = Object.keys(staticData.game_info);
      if (gameInfoKeys.length === 1) {
        this.currentPlayerId = gameInfoKeys[0];
        log('info', `Detected multiworld player ID: ${this.currentPlayerId}`);
        return;
      }
    }

    // Fallback to player field or first player from player_names
    if (staticData.player) {
      this.currentPlayerId = String(staticData.player);
    } else if (staticData.player_names) {
      const playerIds = Object.keys(staticData.player_names);
      if (playerIds.length > 0) {
        this.currentPlayerId = playerIds[0];
      }
    }

    log('info', `Current player ID: ${this.currentPlayerId || 'unknown'}`);
  }

  updateDisplay() {
    if (!this.isInitialized || !this.sphereState) {
      return;
    }

    log('info', '[SpoilerChecklistUI] Updating display...');

    const sphereData = this.sphereState.getMultiworldSphereData();
    const currentSphere = this.sphereState.getCurrentSphere();
    const snapshot = stateManager.getLatestStateSnapshot();
    const staticData = stateManager.getStaticData();

    if (!sphereData || !sphereData.length) {
      this.checklistContainer.innerHTML = '<p>No sphere log data available.</p>';
      return;
    }

    if (!snapshot || !staticData) {
      this.checklistContainer.innerHTML = '<p>Waiting for game state...</p>';
      return;
    }

    // Create snapshot interface for rule evaluation
    const snapshotInterface = createSnapshotInterface(snapshot, staticData);
    const checkedLocations = new Set(snapshot.checkedLocations || []);

    // Compute frontier for cross-player item visual state
    let frontierSphere = null;
    if (this.simulateReceivedItems) {
      const sync = getCrossPlayerItemSync();
      frontierSphere = sync.findFrontierSphere(checkedLocations);
    }

    // Get per-sphere received items for the current player (for cross-player row display)
    const receivedItemsBySphere = this.sphereState.getPerSphereReceivedItems();

    // Clear container
    this.checklistContainer.innerHTML = '';

    // Group spheres by integer sphere
    const integerSpheres = new Map();
    for (const sphere of sphereData) {
      if (!integerSpheres.has(sphere.integerSphere)) {
        integerSpheres.set(sphere.integerSphere, []);
      }
      integerSpheres.get(sphere.integerSphere).push(sphere);
    }

    // Render each integer sphere
    for (const [intSphere, spheres] of integerSpheres) {
      const section = this.renderIntegerSphere(intSphere, spheres, currentSphere, checkedLocations, snapshot, staticData, snapshotInterface, frontierSphere, receivedItemsBySphere);
      this.checklistContainer.appendChild(section);
    }

    log('info', `[SpoilerChecklistUI] Rendered ${integerSpheres.size} integer spheres`);
  }

  renderIntegerSphere(intSphere, spheres, currentSphere, checkedLocations, snapshot, staticData, snapshotInterface, frontierSphere, receivedItemsBySphere) {
    const section = document.createElement('div');
    section.className = 'sphere-section';

    // Determine section status
    const isAllComplete = spheres.every(s => s.locations.every(loc => checkedLocations.has(loc)));
    const isCurrent = currentSphere && currentSphere.integerSphere === intSphere;
    const isFuture = currentSphere && intSphere > currentSphere.integerSphere;

    if (isAllComplete) {
      section.classList.add('sphere-section-completed');
    } else if (isCurrent) {
      section.classList.add('sphere-section-current');
    } else if (isFuture) {
      section.classList.add('sphere-section-future');
    }

    // Heading
    const heading = document.createElement('div');
    heading.className = 'sphere-heading';
    heading.textContent = `Sphere ${intSphere}`;
    section.appendChild(heading);

    // Render fractional spheres
    for (const sphere of spheres) {
      if (sphere.fractionalSphere === 0 && spheres.length === 1) {
        // Only fractional sphere, render locations directly
        this.renderLocations(section, sphere, checkedLocations, snapshot, staticData, snapshotInterface, 1, frontierSphere, receivedItemsBySphere);
      } else {
        // Multiple fractional spheres, render with subheading
        const subsection = this.renderFractionalSphere(sphere, currentSphere, checkedLocations, snapshot, staticData, snapshotInterface, frontierSphere, receivedItemsBySphere);
        section.appendChild(subsection);
      }
    }

    return section;
  }

  renderFractionalSphere(sphere, currentSphere, checkedLocations, snapshot, staticData, snapshotInterface, frontierSphere, receivedItemsBySphere) {
    const subsection = document.createElement('div');

    // Subheading
    const subheading = document.createElement('div');
    subheading.className = 'sphere-subheading';
    const isComplete = sphere.locations.every(loc => checkedLocations.has(loc));
    const isCurrent = currentSphere &&
      currentSphere.integerSphere === sphere.integerSphere &&
      currentSphere.fractionalSphere === sphere.fractionalSphere;

    subheading.textContent = `Sphere ${sphere.sphereIndex}`;

    // Apply background color for current fractional
    if (isCurrent && !isComplete) {
      subheading.style.backgroundColor = 'rgba(76, 175, 80, 0.1)';
    } else if (isComplete) {
      subheading.style.backgroundColor = '#1e1e1e';
    }

    subsection.appendChild(subheading);

    // Render locations
    this.renderLocations(subsection, sphere, checkedLocations, snapshot, staticData, snapshotInterface, 2, frontierSphere, receivedItemsBySphere);

    return subsection;
  }

  renderLocations(container, sphere, checkedLocations, snapshot, staticData, snapshotInterface, indentLevel, frontierSphere, receivedItemsBySphere) {
    // Render current player's locations
    for (const locationName of sphere.locations) {
      // Use Map.get() instead of Object.values().find()
      const locationData = staticData.locations?.get(locationName);
      if (!locationData) {
        log('warn', `Location not found in static data: ${locationName}`);
        continue;
      }

      const row = this.renderLocationRow(locationName, locationData, checkedLocations, snapshot, staticData, snapshotInterface);
      container.appendChild(row);
    }

    // Render cross-player locations (from other players' worlds)
    if (sphere.allPlayersLocations && this.currentPlayerId) {
      // Determine if this sphere's cross-player items have been "received"
      // (i.e., this sphere is before the frontier)
      const isReceived = frontierSphere != null
        ? compareSphereIndex(sphere.sphereIndex, frontierSphere) < 0
        : frontierSphere === null && this.simulateReceivedItems; // null frontier = all checked

      // Get items the current player receives in this sphere
      const receivedItems = receivedItemsBySphere?.get(sphere.sphereIndex)?.base_items || null;

      for (const [playerId, locations] of Object.entries(sphere.allPlayersLocations)) {
        // Skip current player's locations (already rendered above)
        if (playerId === this.currentPlayerId) {
          continue;
        }

        // Render each cross-player location
        for (const locationName of locations) {
          const row = this.renderCrossPlayerLocationRow(locationName, playerId, staticData, isReceived, receivedItems);
          container.appendChild(row);
        }
      }
    }
  }

  renderLocationRow(locationName, locationData, checkedLocations, snapshot, staticData, snapshotInterface) {
    const row = document.createElement('div');
    row.className = 'location-row';
    if (this.showRegionColumn) {
      row.classList.add('with-region');
    }

    const isChecked = checkedLocations.has(locationName);

    // Checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'location-checkbox';
    checkbox.checked = isChecked;
    checkbox.disabled = isChecked;
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!isChecked) {
        this.handleLocationClick(locationName, locationData.region || locationData.parent_region);
      }
    });
    row.appendChild(checkbox);

    // Region name (optional)
    if (this.showRegionColumn) {
      const regionName = locationData.parent_region || locationData.region;
      const regionSpan = commonUI.createRegionLink(regionName, false, snapshot);
      row.appendChild(regionSpan);
    }

    // Location name
    const locationSpan = document.createElement('span');
    locationSpan.className = 'location-name';
    locationSpan.textContent = locationName;

    // Color code based on accessibility (same logic as locationUI)
    const detailedStatus = this.getLocationDetailedStatus(locationData, snapshot, snapshotInterface);
    if (detailedStatus === 'fully_reachable') {
      locationSpan.classList.add('location-name-green');
    } else if (detailedStatus === 'location_rule_passes_region_fails') {
      locationSpan.classList.add('location-name-orange');
    } else if (detailedStatus === 'region_accessible_location_rule_fails') {
      locationSpan.classList.add('location-name-yellow');
    } else if (detailedStatus === 'fully_unreachable') {
      locationSpan.classList.add('location-name-red');
    }

    if (!isChecked) {
      locationSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleLocationClick(locationName, locationData.region || locationData.parent_region);
      });
    }
    row.appendChild(locationSpan);

    // Item name (optional)
    if (this.showItemColumn) {
      const itemSpan = document.createElement('span');
      itemSpan.className = 'location-item';

      const showItem = this.showLocationItems || isChecked;
      if (showItem) {
        // Use Map.get() instead of bracket notation
        const itemAtLocation = staticData.locationItems?.get(locationName);
        if (itemAtLocation && itemAtLocation.name) {
          itemSpan.textContent = itemAtLocation.name;

          // Check if item is for a different player (multiworld)
          if (this.currentPlayerId && itemAtLocation.player) {
            const itemPlayerId = String(itemAtLocation.player);
            if (itemPlayerId !== this.currentPlayerId) {
              itemSpan.classList.add('cross-player-item');
              itemSpan.title = `Item for Player ${itemPlayerId}`;
            }
          }
        }
      }

      row.appendChild(itemSpan);
    }

    return row;
  }

  /**
   * Render a location row for a cross-player location (from another player's world)
   * @param {string} locationName - Name of the location
   * @param {string} playerId - ID of the player who owns this location
   * @param {object} staticData - Static game data
   * @param {boolean} isReceived - Whether this sphere's items have been "received" (before frontier)
   * @param {object|null} receivedItems - Items current player receives in this sphere ({itemName: count}), or null
   * @returns {HTMLElement} The row element
   */
  renderCrossPlayerLocationRow(locationName, playerId, staticData, isReceived = false, receivedItems = null) {
    // If the current player receives items in this sphere, show at full brightness
    const hasItemForCurrentPlayer = receivedItems && Object.keys(receivedItems).length > 0;

    const row = document.createElement('div');
    row.className = 'location-row cross-player-location-row';
    if (hasItemForCurrentPlayer) row.classList.add('cross-player-gives-to-current');
    if (isReceived) row.classList.add('cross-player-received');
    if (this.showRegionColumn) {
      row.classList.add('with-region');
    }

    if (hasItemForCurrentPlayer) {
      // Disabled checkbox showing received state for items destined for current player
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'location-checkbox';
      checkbox.disabled = true;
      checkbox.checked = isReceived;
      row.appendChild(checkbox);
    } else {
      // Spacer to keep grid alignment
      const spacer = document.createElement('span');
      row.appendChild(spacer);
    }

    // Region/Player name column
    if (this.showRegionColumn) {
      const playerSpan = document.createElement('span');
      playerSpan.className = 'region-link cross-player-region';
      const playerName = staticData.player_names?.[playerId] || `Player ${playerId}`;
      playerSpan.textContent = playerName;
      playerSpan.title = `Location in ${playerName}'s world`;
      row.appendChild(playerSpan);
    }

    // Location name (plain text, not interactive)
    const locationSpan = document.createElement('span');
    locationSpan.className = 'location-name cross-player-location';
    locationSpan.textContent = locationName;
    locationSpan.title = `Location in ${staticData.player_names?.[playerId] || `Player ${playerId}`}'s world`;
    row.appendChild(locationSpan);

    // Item name — show items the current player receives in this sphere
    if (this.showItemColumn) {
      const itemSpan = document.createElement('span');
      itemSpan.className = 'location-item';

      if (hasItemForCurrentPlayer) {
        const itemNames = Object.entries(receivedItems)
          .map(([name, count]) => count > 1 ? `${name} x${count}` : name)
          .join(', ');
        itemSpan.textContent = itemNames;
      }

      row.appendChild(itemSpan);
    }

    return row;
  }

  getLocationDetailedStatus(location, snapshot, snapshotInterface) {
    const isChecked = snapshot?.checkedLocations?.includes(location.name);
    if (isChecked) return 'checked';

    const parentRegionName = location.parent_region || location.region;
    const parentRegionStatus = snapshot?.regionReachability?.[parentRegionName];
    const isRegionReachable =
      parentRegionStatus === 'reachable' ||
      parentRegionStatus === 'checked';

    const locationRule = location.access_rule;
    const ruleResult = locationRule ? evaluateRule(locationRule, snapshotInterface) : true;
    const isLocationRulePassing = ruleResult === true;

    if (isRegionReachable && isLocationRulePassing) return 'fully_reachable';
    if (!isRegionReachable && isLocationRulePassing) return 'location_rule_passes_region_fails';
    if (isRegionReachable && !isLocationRulePassing) return 'region_accessible_location_rule_fails';
    return 'fully_unreachable';
  }

  handleLocationClick(locationName, regionName) {
    if (!this.dispatcher) {
      log('error', 'Dispatcher not available, cannot handle location click');
      return;
    }

    log('info', `Location clicked: ${locationName}`);

    const payload = {
      locationName,
      regionName,
      originator: 'SpoilerChecklistClick'
    };

    this.dispatcher.publish('user:locationCheck', payload, {
      initialTarget: 'bottom'
    });
  }
}

export default SpoilerChecklistUI;