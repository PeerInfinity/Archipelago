// discoveryPanelUI.js - UI component for discovery mode settings and state display

import { getModuleEventBus } from './index.js';
import settingsManager from '../../app/core/settingsManager.js';
import discoveryStateSingleton from '../discovery/singleton.js';
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import { debounce } from '../commonUI/index.js';

// Helper function for logging
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('discoveryPanelUI', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[discoveryPanelUI] ${message}`, ...data);
  }
}

export class DiscoveryPanelUI {
  constructor(container, componentState) {
    this.container = container;
    this.componentState = componentState;
    Object.defineProperty(this, 'eventBus', { get: () => getModuleEventBus(), configurable: true });
    this.rootElement = null;
    this.isInitialized = false;
    this.unsubscribeHandles = [];

    // Settings state (cached locally)
    this.settings = {
      enableDiscoveryMode: false,
      regionDiscoveryTrigger: 'onEnter',
      autoDiscoverLocations: false,
      autoDiscoverExits: false,
      undiscoveredDisplay: 'hidden',
      showDebugOptions: true,
      clickDiscoversLocation: true,
      clickDiscoversRegion: false,
      disableLocationCheckUI: false,
      showUndiscoveredDetails: false,
      showUndiscoveredRegionNames: false
    };

    // Section collapse state
    this.sectionsCollapsed = {
      regions: false,
      locations: false,
      exits: false
    };

    // Create and append root element
    this.getRootElement();
    if (this.rootElement) {
      this.container.element.appendChild(this.rootElement);
    }

    // Defer initialization until app is ready
    const readyHandler = () => {
      log('info', '[DiscoveryPanelUI] Received app:readyForUiDataLoad. Initializing panel.');
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
      this.rootElement.className = 'discovery-panel-root';

      // Add styles
      const style = document.createElement('style');
      style.textContent = `
        .discovery-panel-root {
          display: flex;
          flex-direction: column;
          height: 100%;
          background-color: #2d2d30;
          color: #e0e0e0;
          overflow: hidden;
          font-size: 13px;
        }
        .discovery-panel-content {
          flex-grow: 1;
          overflow-y: auto;
          padding: 0.5rem;
        }
        .discovery-section {
          margin-bottom: 1rem;
          padding: 0.5rem;
          background-color: #1e1e1e;
          border-radius: 4px;
        }
        .discovery-section-header {
          font-weight: bold;
          font-size: 1.1em;
          margin-bottom: 0.5rem;
          padding-bottom: 0.25rem;
          border-bottom: 1px solid #444;
          cursor: pointer;
          user-select: none;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .discovery-section-header:hover {
          color: #fff;
        }
        .discovery-section-toggle {
          font-size: 0.8em;
          color: #888;
        }
        .discovery-setting-group {
          margin-bottom: 0.75rem;
          padding-left: 0.5rem;
        }
        .discovery-setting-label {
          font-weight: bold;
          margin-bottom: 0.25rem;
          color: #b0b0b0;
        }
        .discovery-setting-description {
          font-size: 0.85em;
          color: #888;
          margin-bottom: 0.25rem;
          font-style: italic;
        }
        .discovery-radio-group {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          padding-left: 0.5rem;
        }
        .discovery-radio-option {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
        }
        .discovery-radio-option input[type="radio"] {
          cursor: pointer;
        }
        .discovery-radio-option label {
          cursor: pointer;
        }
        .discovery-checkbox-option {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          padding: 0.25rem 0;
        }
        .discovery-checkbox-option input[type="checkbox"] {
          cursor: pointer;
        }
        .discovery-checkbox-option label {
          cursor: pointer;
        }
        .discovery-item-list {
          max-height: 200px;
          overflow-y: auto;
          border: 1px solid #444;
          border-radius: 4px;
          padding: 0.25rem;
          background-color: #252526;
        }
        .discovery-item-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.25rem;
          border-radius: 2px;
        }
        .discovery-item-row:hover {
          background-color: #3d3d3d;
        }
        .discovery-item-checkbox {
          cursor: pointer;
        }
        .discovery-item-checkbox:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }
        .discovery-item-name {
          flex-grow: 1;
        }
        .discovery-item-name.discovered {
          color: #4CAF50;
        }
        .discovery-item-name.undiscovered {
          color: #888;
        }
        .discovery-item-name.start-region {
          color: #2196F3;
          font-weight: bold;
        }
        .discovery-exit-region-header {
          font-weight: bold;
          color: #b0b0b0;
          margin-top: 0.5rem;
          margin-bottom: 0.25rem;
          padding-left: 0.25rem;
          font-size: 0.9em;
        }
        .discovery-exit-region-header:first-child {
          margin-top: 0;
        }
        .discovery-actions {
          padding: 0.5rem;
          border-top: 1px solid #444;
          background-color: #252526;
          flex-shrink: 0;
        }
        .discovery-button {
          padding: 0.5rem 1rem;
          background-color: #0e639c;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.9em;
        }
        .discovery-button:hover {
          background-color: #1177bb;
        }
        .discovery-button.danger {
          background-color: #c42b1c;
        }
        .discovery-button.danger:hover {
          background-color: #d63e2f;
        }
        .discovery-stats {
          font-size: 0.85em;
          color: #888;
          margin-top: 0.25rem;
        }
        .discovery-empty-message {
          color: #888;
          font-style: italic;
          padding: 0.5rem;
        }
      `;
      this.rootElement.appendChild(style);

      // Create content container
      this.contentContainer = document.createElement('div');
      this.contentContainer.className = 'discovery-panel-content';
      this.rootElement.appendChild(this.contentContainer);

      // Create actions bar
      this.actionsBar = document.createElement('div');
      this.actionsBar.className = 'discovery-actions';
      this.rootElement.appendChild(this.actionsBar);
    }
    return this.rootElement;
  }

  async initialize() {
    if (this.isInitialized) {
      log('info', '[DiscoveryPanelUI] Already initialized.');
      return;
    }

    log('info', '[DiscoveryPanelUI] Initializing...');

    // Load initial settings
    await this.loadSettings();

    // Subscribe to events
    this.subscribeToEvents();

    // Mark initialized before buildUI so updateDataDisplay() doesn't bail out
    this.isInitialized = true;

    // Build the UI
    this.buildUI();
    log('info', '[DiscoveryPanelUI] Initialization complete.');
  }

  async loadSettings() {
    try {
      this.settings.enableDiscoveryMode = await settingsManager.getSetting(
        'moduleSettings.discovery.enableDiscoveryMode', false
      );
      this.settings.regionDiscoveryTrigger = await settingsManager.getSetting(
        'moduleSettings.discovery.regionDiscoveryTrigger', 'onEnter'
      );
      this.settings.autoDiscoverLocations = await settingsManager.getSetting(
        'moduleSettings.discovery.autoDiscoverLocations', false
      );
      this.settings.autoDiscoverExits = await settingsManager.getSetting(
        'moduleSettings.discovery.autoDiscoverExits', false
      );
      this.settings.undiscoveredDisplay = await settingsManager.getSetting(
        'moduleSettings.discovery.undiscoveredDisplay', 'hidden'
      );
      this.settings.showDebugOptions = await settingsManager.getSetting(
        'moduleSettings.discovery.showDebugOptions', true
      );
      this.settings.clickDiscoversLocation = await settingsManager.getSetting(
        'moduleSettings.discovery.clickDiscoversLocation', true
      );
      this.settings.clickDiscoversRegion = await settingsManager.getSetting(
        'moduleSettings.discovery.clickDiscoversRegion', false
      );
      this.settings.disableLocationCheckUI = await settingsManager.getSetting(
        'moduleSettings.discovery.disableLocationCheckUI', false
      );
      this.settings.showUndiscoveredDetails = await settingsManager.getSetting(
        'moduleSettings.discovery.showUndiscoveredDetails', false
      );
      this.settings.showUndiscoveredRegionNames = await settingsManager.getSetting(
        'moduleSettings.discovery.showUndiscoveredRegionNames', false
      );
      log('info', '[DiscoveryPanelUI] Settings loaded:', this.settings);
    } catch (error) {
      log('error', '[DiscoveryPanelUI] Error loading settings:', error);
    }
  }

  subscribeToEvents() {
    // Debounced update for discovery changes
    const debouncedUpdate = debounce(() => this.updateDataDisplay(), 100);

    // Subscribe to discovery state changes
    const discoveryChangedHandler = () => {
      log('info', '[DiscoveryPanelUI] Discovery changed, updating display');
      debouncedUpdate();
    };
    this.unsubscribeHandles.push(
      this.eventBus.subscribe('discovery:changed', discoveryChangedHandler)
    );

    // Subscribe to settings changes
    const settingsChangedHandler = async ({ key }) => {
      if (key === '*' || key.startsWith('moduleSettings.discovery')) {
        log('info', '[DiscoveryPanelUI] Settings changed, reloading');
        await this.loadSettings();
        this.updateSettingsDisplay();
      }
    };
    this.unsubscribeHandles.push(
      this.eventBus.subscribe('settings:changed', settingsChangedHandler)
    );

    // Subscribe to rules loaded to refresh data
    const rulesLoadedHandler = () => {
      log('info', '[DiscoveryPanelUI] Rules loaded, updating display');
      debouncedUpdate();
    };
    this.unsubscribeHandles.push(
      this.eventBus.subscribe('stateManager:rulesLoaded', rulesLoadedHandler)
    );
  }

  buildUI() {
    this.contentContainer.innerHTML = '';
    this.actionsBar.innerHTML = '';

    // Build settings section
    this.buildSettingsSection();

    // Build data display sections
    this.buildDataSections();

    // Build actions bar
    this.buildActionsBar();
  }

  buildSettingsSection() {
    const section = document.createElement('div');
    section.className = 'discovery-section';

    const header = document.createElement('div');
    header.className = 'discovery-section-header';
    header.innerHTML = '<span>Settings</span><span class="discovery-section-toggle"></span>';
    section.appendChild(header);

    const content = document.createElement('div');
    content.className = 'discovery-settings-content';

    // Enable Discovery Mode
    content.appendChild(this.createBooleanSetting(
      'enableDiscoveryMode',
      'Enable Discovery Mode',
      'When enabled, locations and exits are filtered to only show discovered items'
    ));

    // Region Discovery Trigger
    content.appendChild(this.createRadioSetting(
      'regionDiscoveryTrigger',
      'Region Discovery Trigger',
      'When should regions be marked as discovered?',
      [
        { value: 'onEnter', label: 'When the region is first entered' },
        { value: 'onExitDiscovered', label: 'When an exit leading to the region is discovered' }
      ]
    ));

    // Auto-discover Locations
    content.appendChild(this.createBooleanSetting(
      'autoDiscoverLocations',
      'Auto-discover Locations',
      'Automatically discover all locations when their region is discovered'
    ));

    // Auto-discover Exits
    content.appendChild(this.createBooleanSetting(
      'autoDiscoverExits',
      'Auto-discover Exits',
      'Automatically discover all exits when their region is discovered'
    ));

    // Undiscovered Display (for items in undiscovered regions)
    content.appendChild(this.createRadioSetting(
      'undiscoveredDisplay',
      'Items in Undiscovered Regions',
      'How should items in undiscovered regions be displayed?',
      [
        { value: 'hidden', label: 'Hide entirely' },
        { value: 'placeholder', label: 'Show as "???"' }
      ]
    ));

    // Show Undiscovered Region Names
    content.appendChild(this.createBooleanSetting(
      'showUndiscoveredRegionNames',
      'Show Undiscovered Region Names',
      'Show region names instead of "???" for undiscovered regions that have a discovered exit leading to them'
    ));

    // Click Discovers Region
    content.appendChild(this.createBooleanSetting(
      'clickDiscoversRegion',
      'Click Discovers Region',
      'Clicking an undiscovered region in the Region Graph or Regions panel discovers it'
    ));

    // Disable Location Check UI
    content.appendChild(this.createBooleanSetting(
      'disableLocationCheckUI',
      'Disable Location Check UI',
      'Prevent location check actions when clicking locations (useful for entrance shuffle exploration)'
    ));

    // Show Debug Options toggle
    content.appendChild(this.createBooleanSetting(
      'showDebugOptions',
      'Show Debug Options',
      'Show debug settings and discovery state lists below'
    ));

    section.appendChild(content);
    this.contentContainer.appendChild(section);
  }

  buildDebugSettingsSection() {
    const section = document.createElement('div');
    section.className = 'discovery-section discovery-debug-settings';
    section.id = 'discovery-debug-settings-section';

    const header = document.createElement('div');
    header.className = 'discovery-section-header';
    header.innerHTML = '<span>Debug Settings</span><span class="discovery-section-toggle"></span>';
    section.appendChild(header);

    const content = document.createElement('div');
    content.className = 'discovery-settings-content';

    // Click Discovers Location
    content.appendChild(this.createBooleanSetting(
      'clickDiscoversLocation',
      'Click Discovers Location',
      'When clicking an undiscovered location in the Locations panel, automatically discover it'
    ));

    // Show Undiscovered Details
    content.appendChild(this.createBooleanSetting(
      'showUndiscoveredDetails',
      'Show Undiscovered Details',
      'Show full details (region, rules, status) for undiscovered locations instead of minimal "???" info'
    ));

    section.appendChild(content);
    return section;
  }

  createBooleanSetting(settingKey, label, description) {
    const group = document.createElement('div');
    group.className = 'discovery-setting-group';

    const labelDiv = document.createElement('div');
    labelDiv.className = 'discovery-setting-label';
    labelDiv.textContent = label;
    group.appendChild(labelDiv);

    if (description) {
      const descDiv = document.createElement('div');
      descDiv.className = 'discovery-setting-description';
      descDiv.textContent = description;
      group.appendChild(descDiv);
    }

    const radioGroup = document.createElement('div');
    radioGroup.className = 'discovery-radio-group';

    // Yes option
    const yesOption = document.createElement('div');
    yesOption.className = 'discovery-radio-option';
    const yesInput = document.createElement('input');
    yesInput.type = 'radio';
    yesInput.name = `discovery-${settingKey}`;
    yesInput.id = `discovery-${settingKey}-yes`;
    yesInput.value = 'true';
    yesInput.checked = this.settings[settingKey] === true;
    yesInput.addEventListener('change', () => this.handleSettingChange(settingKey, true));
    const yesLabel = document.createElement('label');
    yesLabel.htmlFor = yesInput.id;
    yesLabel.textContent = 'Yes';
    yesOption.appendChild(yesInput);
    yesOption.appendChild(yesLabel);
    radioGroup.appendChild(yesOption);

    // No option
    const noOption = document.createElement('div');
    noOption.className = 'discovery-radio-option';
    const noInput = document.createElement('input');
    noInput.type = 'radio';
    noInput.name = `discovery-${settingKey}`;
    noInput.id = `discovery-${settingKey}-no`;
    noInput.value = 'false';
    noInput.checked = this.settings[settingKey] === false;
    noInput.addEventListener('change', () => this.handleSettingChange(settingKey, false));
    const noLabel = document.createElement('label');
    noLabel.htmlFor = noInput.id;
    noLabel.textContent = 'No';
    noOption.appendChild(noInput);
    noOption.appendChild(noLabel);
    radioGroup.appendChild(noOption);

    group.appendChild(radioGroup);
    return group;
  }

  createRadioSetting(settingKey, label, description, options) {
    const group = document.createElement('div');
    group.className = 'discovery-setting-group';

    const labelDiv = document.createElement('div');
    labelDiv.className = 'discovery-setting-label';
    labelDiv.textContent = label;
    group.appendChild(labelDiv);

    if (description) {
      const descDiv = document.createElement('div');
      descDiv.className = 'discovery-setting-description';
      descDiv.textContent = description;
      group.appendChild(descDiv);
    }

    const radioGroup = document.createElement('div');
    radioGroup.className = 'discovery-radio-group';

    for (const option of options) {
      const optionDiv = document.createElement('div');
      optionDiv.className = 'discovery-radio-option';

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `discovery-${settingKey}`;
      input.id = `discovery-${settingKey}-${option.value}`;
      input.value = option.value;
      input.checked = this.settings[settingKey] === option.value;
      input.addEventListener('change', () => this.handleSettingChange(settingKey, option.value));

      const inputLabel = document.createElement('label');
      inputLabel.htmlFor = input.id;
      inputLabel.textContent = option.label;

      optionDiv.appendChild(input);
      optionDiv.appendChild(inputLabel);
      radioGroup.appendChild(optionDiv);
    }

    group.appendChild(radioGroup);
    return group;
  }

  async handleSettingChange(settingKey, value) {
    log('info', `[DiscoveryPanelUI] Setting changed: ${settingKey} = ${value}`);
    this.settings[settingKey] = value;

    try {
      // Update the setting via settingsManager
      // The discovery module listens for settings:changed and will publish
      // discovery:modeChanged and discovery:settingsChanged events as needed
      await settingsManager.updateSetting(`moduleSettings.discovery.${settingKey}`, value);
    } catch (error) {
      log('error', `[DiscoveryPanelUI] Error updating setting ${settingKey}:`, error);
    }
  }

  buildDataSections() {
    // Create debug container to wrap debug settings and data sections
    this.debugContainer = document.createElement('div');
    this.debugContainer.id = 'discovery-debug-container';
    this.debugContainer.style.display = this.settings.showDebugOptions ? 'block' : 'none';
    this.contentContainer.appendChild(this.debugContainer);

    // Add debug settings section
    this.debugSettingsSection = this.buildDebugSettingsSection();
    this.debugContainer.appendChild(this.debugSettingsSection);

    // Regions section
    this.regionSection = this.createDataSection('Discovered Regions', 'regions');
    this.debugContainer.appendChild(this.regionSection);

    // Locations section
    this.locationSection = this.createDataSection('Discovered Locations', 'locations');
    this.debugContainer.appendChild(this.locationSection);

    // Exits section
    this.exitSection = this.createDataSection('Discovered Exits', 'exits');
    this.debugContainer.appendChild(this.exitSection);

    // Initial data population
    this.updateDataDisplay();
  }

  createDataSection(title, type) {
    const section = document.createElement('div');
    section.className = 'discovery-section';
    section.dataset.type = type;

    const header = document.createElement('div');
    header.className = 'discovery-section-header';
    header.innerHTML = `<span>${title}</span><span class="discovery-section-toggle">${this.sectionsCollapsed[type] ? '[+]' : '[-]'}</span>`;
    header.addEventListener('click', () => this.toggleSection(type, section));
    section.appendChild(header);

    const statsDiv = document.createElement('div');
    statsDiv.className = 'discovery-stats';
    section.appendChild(statsDiv);

    const content = document.createElement('div');
    content.className = 'discovery-item-list';
    content.style.display = this.sectionsCollapsed[type] ? 'none' : 'block';
    section.appendChild(content);

    return section;
  }

  toggleSection(type, sectionElement) {
    this.sectionsCollapsed[type] = !this.sectionsCollapsed[type];
    const content = sectionElement.querySelector('.discovery-item-list');
    const toggle = sectionElement.querySelector('.discovery-section-toggle');

    if (this.sectionsCollapsed[type]) {
      content.style.display = 'none';
      toggle.textContent = '[+]';
    } else {
      content.style.display = 'block';
      toggle.textContent = '[-]';
    }
  }

  updateDataDisplay() {
    if (!this.isInitialized) return;

    this.updateRegionsDisplay();
    this.updateLocationsDisplay();
    this.updateExitsDisplay();
  }

  updateRegionsDisplay() {
    if (!this.regionSection) return;

    const content = this.regionSection.querySelector('.discovery-item-list');
    const stats = this.regionSection.querySelector('.discovery-stats');
    content.innerHTML = '';

    const staticData = stateManager.getStaticData();
    if (!staticData || !staticData.regions) {
      content.innerHTML = '<div class="discovery-empty-message">No region data available</div>';
      stats.textContent = '';
      return;
    }

    const discoveredRegions = discoveryStateSingleton.getDiscoveredRegions();
    const startRegions = discoveryStateSingleton.getStartRegions();
    const allRegions = Array.from(staticData.regions.keys()).sort();

    stats.textContent = `${discoveredRegions.size} / ${allRegions.length} discovered`;

    for (const regionName of allRegions) {
      const isDiscovered = discoveredRegions.has(regionName);
      const isStartRegion = startRegions.includes(regionName);

      const row = document.createElement('div');
      row.className = 'discovery-item-row';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'discovery-item-checkbox';
      checkbox.checked = isDiscovered;
      checkbox.disabled = isStartRegion; // Can't undiscover start regions
      checkbox.title = isStartRegion ? 'Start regions cannot be undiscovered' : '';
      checkbox.addEventListener('change', () => {
        discoveryStateSingleton.toggleRegionDiscovery(regionName);
      });

      const nameSpan = document.createElement('span');
      nameSpan.className = 'discovery-item-name';
      nameSpan.textContent = regionName;
      if (isStartRegion) {
        nameSpan.classList.add('start-region');
        nameSpan.textContent += ' (start)';
      } else if (isDiscovered) {
        nameSpan.classList.add('discovered');
      } else {
        nameSpan.classList.add('undiscovered');
      }

      row.appendChild(checkbox);
      row.appendChild(nameSpan);
      content.appendChild(row);
    }
  }

  updateLocationsDisplay() {
    if (!this.locationSection) return;

    const content = this.locationSection.querySelector('.discovery-item-list');
    const stats = this.locationSection.querySelector('.discovery-stats');
    content.innerHTML = '';

    const staticData = stateManager.getStaticData();
    if (!staticData || !staticData.locations) {
      content.innerHTML = '<div class="discovery-empty-message">No location data available</div>';
      stats.textContent = '';
      return;
    }

    const discoveredLocations = discoveryStateSingleton.getDiscoveredLocations();
    const allLocations = Array.from(staticData.locations.keys()).sort();

    stats.textContent = `${discoveredLocations.size} / ${allLocations.length} discovered`;

    if (allLocations.length === 0) {
      content.innerHTML = '<div class="discovery-empty-message">No locations defined</div>';
      return;
    }

    for (const locationName of allLocations) {
      const isDiscovered = discoveredLocations.has(locationName);

      const row = document.createElement('div');
      row.className = 'discovery-item-row';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'discovery-item-checkbox';
      checkbox.checked = isDiscovered;
      checkbox.addEventListener('change', () => {
        discoveryStateSingleton.toggleLocationDiscovery(locationName);
      });

      const nameSpan = document.createElement('span');
      nameSpan.className = 'discovery-item-name';
      nameSpan.textContent = locationName;
      if (isDiscovered) {
        nameSpan.classList.add('discovered');
      } else {
        nameSpan.classList.add('undiscovered');
      }

      row.appendChild(checkbox);
      row.appendChild(nameSpan);
      content.appendChild(row);
    }
  }

  updateExitsDisplay() {
    if (!this.exitSection) return;

    const content = this.exitSection.querySelector('.discovery-item-list');
    const stats = this.exitSection.querySelector('.discovery-stats');
    content.innerHTML = '';

    const staticData = stateManager.getStaticData();
    if (!staticData || !staticData.regions) {
      content.innerHTML = '<div class="discovery-empty-message">No exit data available</div>';
      stats.textContent = '';
      return;
    }

    const discoveredExits = discoveryStateSingleton.getDiscoveredExits();

    // Count total exits and discovered exits
    let totalExits = 0;
    let discoveredCount = 0;

    // Group exits by region
    const regionNames = Array.from(staticData.regions.keys()).sort();

    for (const regionName of regionNames) {
      const region = staticData.regions.get(regionName);
      if (!region.exits || region.exits.length === 0) continue;

      const regionDiscoveredExits = discoveredExits.get(regionName) || new Set();

      // Create region header
      const regionHeader = document.createElement('div');
      regionHeader.className = 'discovery-exit-region-header';
      regionHeader.textContent = regionName;
      content.appendChild(regionHeader);

      // Add exits for this region
      for (const exit of region.exits) {
        totalExits++;
        const isDiscovered = regionDiscoveredExits.has(exit.name);
        if (isDiscovered) discoveredCount++;

        const row = document.createElement('div');
        row.className = 'discovery-item-row';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'discovery-item-checkbox';
        checkbox.checked = isDiscovered;
        checkbox.addEventListener('change', () => {
          discoveryStateSingleton.toggleExitDiscovery(regionName, exit.name);
        });

        const nameSpan = document.createElement('span');
        nameSpan.className = 'discovery-item-name';
        nameSpan.textContent = `${exit.name} -> ${exit.connected_region}`;
        if (isDiscovered) {
          nameSpan.classList.add('discovered');
        } else {
          nameSpan.classList.add('undiscovered');
        }

        row.appendChild(checkbox);
        row.appendChild(nameSpan);
        content.appendChild(row);
      }
    }

    stats.textContent = `${discoveredCount} / ${totalExits} discovered`;

    if (totalExits === 0) {
      content.innerHTML = '<div class="discovery-empty-message">No exits defined</div>';
    }
  }

  updateSettingsDisplay() {
    // Update radio button states to match current settings
    for (const [key, value] of Object.entries(this.settings)) {
      if (typeof value === 'boolean') {
        const yesInput = this.rootElement.querySelector(`#discovery-${key}-yes`);
        const noInput = this.rootElement.querySelector(`#discovery-${key}-no`);
        if (yesInput) yesInput.checked = value === true;
        if (noInput) noInput.checked = value === false;
      } else {
        const input = this.rootElement.querySelector(`#discovery-${key}-${value}`);
        if (input) input.checked = true;
      }
    }

    // Update debug container visibility
    if (this.debugContainer) {
      this.debugContainer.style.display = this.settings.showDebugOptions ? 'block' : 'none';
    }
  }

  buildActionsBar() {
    // Reset button
    const resetButton = document.createElement('button');
    resetButton.className = 'discovery-button danger';
    resetButton.textContent = 'Reset All Discoveries';
    resetButton.title = 'Clear all discoveries and reset to starting state';
    resetButton.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset all discoveries? This will clear all discovered regions, locations, and exits.')) {
        discoveryStateSingleton.clearDiscovery();
        log('info', '[DiscoveryPanelUI] Discoveries reset');
      }
    });
    this.actionsBar.appendChild(resetButton);
  }

  dispose() {
    log('info', '[DiscoveryPanelUI] Disposing...');

    // Unsubscribe from all events
    for (const unsubscribe of this.unsubscribeHandles) {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    }
    this.unsubscribeHandles = [];

    this.isInitialized = false;
  }
}

export default DiscoveryPanelUI;
