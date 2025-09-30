// spoilerChecklistUI.js - UI component for sphere log checklist

import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import { evaluateRule } from '../shared/ruleEngine.js';
import { createStateSnapshotInterface } from '../shared/stateInterface.js';
import commonUI, { debounce } from '../commonUI/index.js';
import eventBus from '../../app/core/eventBus.js';
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
    this.isInitialized = false;
    this.sphereState = null; // Will be injected via public function
    this.dispatcher = null; // Will get from locations module

    // Create and append root element
    this.getRootElement();
    if (this.rootElement) {
      this.container.element.appendChild(this.rootElement);
    }

    // Defer initialization
    const readyHandler = (eventPayload) => {
      log('info', '[SpoilerChecklistUI] Received app:readyForUiDataLoad. Initializing checklist.');
      this.initialize();
      eventBus.unsubscribe('app:readyForUiDataLoad', readyHandler);
    };
    eventBus.subscribe('app:readyForUiDataLoad', readyHandler, 'spoilerChecklist');

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
        .location-checkbox {
          cursor: pointer;
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
      `;
      this.rootElement.appendChild(controls);

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
        getCurrentSphere: () => sphereStateInstance.getCurrentSphere(),
        getCurrentIntegerSphere: () => sphereStateInstance.getCurrentIntegerSphere(),
        getCurrentFractionalSphere: () => sphereStateInstance.getCurrentFractionalSphere(),
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
    } catch (error) {
      log('error', 'Error loading settings:', error);
    }

    // Subscribe to events
    eventBus.subscribe('stateManager:snapshotUpdated', debounce(() => this.updateDisplay(), 50), 'spoilerChecklist');
    eventBus.subscribe('sphereState:dataLoaded', () => this.updateDisplay(), 'spoilerChecklist');
    eventBus.subscribe('sphereState:currentSphereChanged', () => this.updateDisplay(), 'spoilerChecklist');
    eventBus.subscribe('settings:changed', async ({ key }) => {
      if (key === '*' || key.startsWith('moduleSettings.commonUI.showLocationItems')) {
        this.showLocationItems = await settingsManager.getSetting('moduleSettings.commonUI.showLocationItems', false);
        this.updateDisplay();
      }
    }, 'spoilerChecklist');

    this.isInitialized = true;
    log('info', '[SpoilerChecklistUI] Initialization complete.');

    // Initial render
    this.updateDisplay();
  }

  dispose() {
    log('info', '[SpoilerChecklistUI] Disposing...');
    // Event bus subscriptions are automatically cleaned up by panel destroy
  }

  updateDisplay() {
    if (!this.isInitialized || !this.sphereState) {
      return;
    }

    log('info', '[SpoilerChecklistUI] Updating display...');

    const sphereData = this.sphereState.getSphereData();
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
    const snapshotInterface = createStateSnapshotInterface(snapshot, staticData);
    const checkedLocations = new Set(snapshot.checkedLocations || []);

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
      const section = this.renderIntegerSphere(intSphere, spheres, currentSphere, checkedLocations, snapshot, staticData, snapshotInterface);
      this.checklistContainer.appendChild(section);
    }

    log('info', `[SpoilerChecklistUI] Rendered ${integerSpheres.size} integer spheres`);
  }

  renderIntegerSphere(intSphere, spheres, currentSphere, checkedLocations, snapshot, staticData, snapshotInterface) {
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
    const checkmark = isAllComplete ? '✓ ' : '□ ';
    heading.textContent = `${checkmark}Sphere ${intSphere}`;
    section.appendChild(heading);

    // Render fractional spheres
    for (const sphere of spheres) {
      if (sphere.fractionalSphere === 0 && spheres.length === 1) {
        // Only fractional sphere, render locations directly
        this.renderLocations(section, sphere, checkedLocations, snapshot, staticData, snapshotInterface, 1);
      } else {
        // Multiple fractional spheres, render with subheading
        const subsection = this.renderFractionalSphere(sphere, currentSphere, checkedLocations, snapshot, staticData, snapshotInterface);
        section.appendChild(subsection);
      }
    }

    return section;
  }

  renderFractionalSphere(sphere, currentSphere, checkedLocations, snapshot, staticData, snapshotInterface) {
    const subsection = document.createElement('div');

    // Subheading
    const subheading = document.createElement('div');
    subheading.className = 'sphere-subheading';
    const isComplete = sphere.locations.every(loc => checkedLocations.has(loc));
    const isCurrent = currentSphere &&
      currentSphere.integerSphere === sphere.integerSphere &&
      currentSphere.fractionalSphere === sphere.fractionalSphere;

    const checkmark = isComplete ? '✓ ' : (isCurrent ? '⊡ ' : '□ ');
    subheading.textContent = `${checkmark}Sphere ${sphere.sphereIndex}`;

    // Apply background color for current fractional
    if (isCurrent && !isComplete) {
      subheading.style.backgroundColor = 'rgba(76, 175, 80, 0.1)';
    } else if (isComplete) {
      subheading.style.backgroundColor = '#1e1e1e';
    }

    subsection.appendChild(subheading);

    // Render locations
    this.renderLocations(subsection, sphere, checkedLocations, snapshot, staticData, snapshotInterface, 2);

    return subsection;
  }

  renderLocations(container, sphere, checkedLocations, snapshot, staticData, snapshotInterface, indentLevel) {
    for (const locationName of sphere.locations) {
      const locationData = Object.values(staticData.locations || {}).find(l => l.name === locationName);
      if (!locationData) {
        log('warn', `Location not found in static data: ${locationName}`);
        continue;
      }

      const row = this.renderLocationRow(locationName, locationData, checkedLocations, snapshot, staticData, snapshotInterface);
      container.appendChild(row);
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
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleLocationClick(locationName, locationData.region || locationData.parent_region);
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

    locationSpan.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleLocationClick(locationName, locationData.region || locationData.parent_region);
    });
    row.appendChild(locationSpan);

    // Item name (optional)
    if (this.showItemColumn) {
      const itemSpan = document.createElement('span');
      itemSpan.className = 'location-item';

      const showItem = this.showLocationItems || isChecked;
      if (showItem) {
        const itemAtLocation = snapshot.locationItems?.[locationName];
        if (itemAtLocation && itemAtLocation.name) {
          itemSpan.textContent = itemAtLocation.name;
        }
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