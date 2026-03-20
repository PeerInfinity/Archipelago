// optionsPanelUI.js - Hub panel combining Options, Settings (JSON), and Discovery

import { getModuleEventBus } from './index.js';
import settingsManager from '../../app/core/settingsManager.js';
import { DiscoveryPanelUI } from '../discoveryPanel/discoveryPanelUI.js';

// Helper function for logging
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('optionsPanelUI', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[optionsPanelUI] ${message}`, ...data);
  }
}

/**
 * Lightweight container adapter that mimics the Golden Layout container interface.
 * Used to embed sub-panel UI classes (like DiscoveryPanelUI) inside the hub.
 */
class SubPanelContainer {
  constructor(element) {
    this.element = element;
    this._handlers = {};
  }
  on(event, callback) {
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(callback);
  }
  destroy() {
    const handlers = this._handlers['destroy'] || [];
    for (const cb of handlers) cb();
    this._handlers = {};
  }
}

export class OptionsPanelUI {
  constructor(container, componentState) {
    this.container = container;
    this.componentState = componentState;
    Object.defineProperty(this, 'eventBus', { get: () => getModuleEventBus(), configurable: true });
    this.rootElement = null;
    this.isInitialized = false;
    this.unsubscribeHandles = [];

    // Current view: 'home', 'options', 'settings', 'discovery'
    this.currentView = 'home';

    // Sub-panel instances for cleanup
    this.discoveryPanel = null;
    this.discoveryContainer = null;

    // Settings JSON editor references
    this.textAreaElement = null;
    this.applyButton = null;

    // Options sub-view settings state (cached locally)
    this.settings = {
      layoutMode: 'auto',
      showLocationItems: true,
      colorblindRegions: false,
      colorblindLocations: false,
      colorblindExits: false,
      colorblindDungeons: false,
      colorblindLoops: false,
      playerName: 'Player1',
      defaultServer: 'ws://localhost:38281',
      autoSaveMode: false,
      autoLoadMode: false,
      logLevel: 'WARN',
      inventoryShowName: true,
      inventoryShowLabel1: true,
      inventoryShowLabel2: true,
      useSubstitutedNames: true,
    };

    // Section collapse state for options sub-view
    this.sectionsCollapsed = {
      advanced: true,
    };

    // Create and append root element
    this.getRootElement();
    if (this.rootElement) {
      this.container.element.appendChild(this.rootElement);
    }

    // Defer initialization until app is ready
    const readyHandler = () => {
      log('info', '[OptionsPanelUI] Received app:readyForUiDataLoad. Initializing panel.');
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
      this.rootElement.className = 'options-panel-root';

      const style = document.createElement('style');
      style.textContent = `
        .options-panel-root {
          display: flex;
          flex-direction: column;
          height: 100%;
          background-color: #2d2d30;
          color: #e0e0e0;
          overflow: hidden;
          font-size: 13px;
        }
        .options-panel-content {
          flex-grow: 1;
          overflow-y: auto;
          padding: 0.5rem;
        }

        /* --- Home view --- */
        .options-home-actions {
          display: flex;
          gap: 0.5rem;
          padding: 0.4rem 0.5rem;
          background-color: #1e1e1e;
          border-bottom: 1px solid #444;
          flex-shrink: 0;
        }
        .options-home-btn {
          padding: 0.4rem 0.75rem;
          background-color: #0e639c;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.85em;
        }
        .options-home-btn:hover {
          background-color: #1177bb;
        }
        .options-home-btn.danger {
          background-color: #c42b1c;
        }
        .options-home-btn.danger:hover {
          background-color: #d63e2f;
        }
        .options-nav-card {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          margin-bottom: 0.5rem;
          background-color: #1e1e1e;
          border: 1px solid #444;
          border-radius: 6px;
          cursor: pointer;
          transition: border-color 0.15s, background-color 0.15s;
        }
        .options-nav-card:hover {
          background-color: #252526;
          border-color: #0e639c;
        }
        .options-nav-icon {
          font-size: 1.5em;
          flex-shrink: 0;
          width: 2em;
          text-align: center;
        }
        .options-nav-info {
          flex-grow: 1;
        }
        .options-nav-title {
          font-weight: bold;
          font-size: 1.05em;
          margin-bottom: 0.15rem;
        }
        .options-nav-desc {
          font-size: 0.85em;
          color: #888;
        }
        .options-nav-arrow {
          color: #888;
          font-size: 1.2em;
        }

        /* --- Sub-view header (Back button) --- */
        .options-subview-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem;
          background-color: #252526;
          border-bottom: 1px solid #444;
          flex-shrink: 0;
        }
        .options-back-btn {
          padding: 0.3rem 0.6rem;
          background-color: #3c3c3c;
          color: #e0e0e0;
          border: 1px solid #555;
          border-radius: 3px;
          cursor: pointer;
          font-size: 0.85em;
        }
        .options-back-btn:hover {
          background-color: #4c4c4c;
          border-color: #777;
        }
        .options-subview-title {
          font-weight: bold;
          font-size: 1.05em;
        }

        /* --- Options sub-view --- */
        .options-section {
          margin-bottom: 1rem;
          padding: 0.5rem;
          background-color: #1e1e1e;
          border-radius: 4px;
        }
        .options-section-header {
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
        .options-section-header:hover {
          color: #fff;
        }
        .options-section-toggle {
          font-size: 0.8em;
          color: #888;
        }
        .options-setting-group {
          margin-bottom: 0.75rem;
          padding-left: 0.5rem;
        }
        .options-setting-label {
          font-weight: bold;
          margin-bottom: 0.25rem;
          color: #b0b0b0;
        }
        .options-setting-description {
          font-size: 0.85em;
          color: #888;
          margin-bottom: 0.25rem;
          font-style: italic;
        }
        .options-radio-group {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          padding-left: 0.5rem;
        }
        .options-radio-option {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
        }
        .options-radio-option input[type="radio"] {
          cursor: pointer;
        }
        .options-radio-option label {
          cursor: pointer;
        }
        .options-text-input {
          width: calc(100% - 1rem);
          padding: 0.35rem 0.5rem;
          margin-left: 0.5rem;
          background-color: #3c3c3c;
          color: #e0e0e0;
          border: 1px solid #555;
          border-radius: 3px;
          font-size: 13px;
          font-family: inherit;
        }
        .options-text-input:focus {
          outline: none;
          border-color: #0e639c;
        }
        .options-section-content.collapsed {
          display: none;
        }

        /* --- Settings JSON sub-view --- */
        .options-json-controls {
          padding: 5px;
          background-color: #222;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-shrink: 0;
        }
        .options-json-apply-btn {
          padding: 5px 10px;
          cursor: pointer;
        }
        .options-json-title {
          color: #fff;
          font-size: 0.85em;
        }
        .options-json-textarea {
          width: 100%;
          flex-grow: 1;
          border: none;
          resize: none;
          background-color: #000;
          color: #fff;
          font-family: monospace;
          font-size: 12px;
        }

        /* --- Sub-view container (fills remaining space) --- */
        .options-subview-body {
          flex-grow: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
      `;
      this.rootElement.appendChild(style);

      // Create persistent action bar (Save / Reset)
      this.actionBar = document.createElement('div');
      this.actionBar.className = 'options-home-actions';

      const jsonBtn = document.createElement('button');
      jsonBtn.className = 'options-home-btn';
      jsonBtn.textContent = 'JSON Data';
      jsonBtn.addEventListener('click', () => {
        this.eventBus.publish('ui:activatePanel', { panelId: 'jsonPanel' });
      });
      this.actionBar.appendChild(jsonBtn);

      const resetBtn = document.createElement('button');
      resetBtn.className = 'options-home-btn danger';
      resetBtn.textContent = 'Reset to Defaults';
      resetBtn.addEventListener('click', () => this.handleResetToDefaults(resetBtn));
      this.actionBar.appendChild(resetBtn);

      this.rootElement.appendChild(this.actionBar);

      // Create content container
      this.contentContainer = document.createElement('div');
      this.contentContainer.className = 'options-panel-content';
      this.rootElement.appendChild(this.contentContainer);
    }
    return this.rootElement;
  }

  async initialize() {
    if (this.isInitialized) {
      log('info', '[OptionsPanelUI] Already initialized.');
      return;
    }

    log('info', '[OptionsPanelUI] Initializing...');

    await this.loadSettings();
    this.subscribeToEvents();
    this.showHome();

    this.isInitialized = true;
    log('info', '[OptionsPanelUI] Initialization complete.');
  }

  // ========================================================================
  // Settings loading (for Options sub-view)
  // ========================================================================

  async loadSettings() {
    try {
      this.settings.layoutMode = await settingsManager.getSetting('generalSettings.layoutMode', 'auto');
      this.settings.showLocationItems = await settingsManager.getSetting('moduleSettings.commonUI.showLocationItems', true);
      this.settings.colorblindRegions = await settingsManager.getSetting('colorblindMode.regions', false);
      this.settings.colorblindLocations = await settingsManager.getSetting('colorblindMode.locations', false);
      this.settings.colorblindExits = await settingsManager.getSetting('colorblindMode.exits', false);
      this.settings.colorblindDungeons = await settingsManager.getSetting('colorblindMode.dungeons', false);
      this.settings.colorblindLoops = await settingsManager.getSetting('colorblindMode.loops', false);
      this.settings.playerName = await settingsManager.getSetting('playerName', 'Player1');
      this.settings.defaultServer = await settingsManager.getSetting('moduleSettings.client.defaultServer', 'ws://localhost:38281');
      this.settings.autoSaveMode = await settingsManager.getSetting('generalSettings.autoSaveMode', false);
      this.settings.autoLoadMode = await settingsManager.getSetting('generalSettings.autoLoadMode', false);
      this.settings.logLevel = await settingsManager.getSetting('logging.defaultLevel', 'WARN');
      this.settings.inventoryShowName = await settingsManager.getSetting('moduleSettings.inventory.showName', true);
      this.settings.inventoryShowLabel1 = await settingsManager.getSetting('moduleSettings.inventory.showLabel1', true);
      this.settings.inventoryShowLabel2 = await settingsManager.getSetting('moduleSettings.inventory.showLabel2', true);
      this.settings.useSubstitutedNames = await settingsManager.getSetting('generalSettings.useSubstitutedNames', true);
    } catch (error) {
      log('error', '[OptionsPanelUI] Error loading settings:', error);
    }
  }

  subscribeToEvents() {
    const settingsChangedHandler = async ({ key }) => {
      if (this.currentView === 'options' && (
        key === '*' ||
        key.startsWith('generalSettings') ||
        key.startsWith('colorblindMode') ||
        key.startsWith('moduleSettings.commonUI') ||
        key.startsWith('moduleSettings.client') ||
        key.startsWith('moduleSettings.inventory') ||
        key.startsWith('logging') ||
        key === 'playerName'
      )) {
        await this.loadSettings();
        this.updateOptionsDisplay();
      }
    };
    this.unsubscribeHandles.push(
      this.eventBus.subscribe('settings:changed', settingsChangedHandler)
    );

    const moduleStateHandler = () => {
      if (this.currentView === 'home') {
        this.showHome();
      }
    };
    this.unsubscribeHandles.push(
      this.eventBus.subscribe('module:stateChanged', moduleStateHandler)
    );
  }

  // ========================================================================
  // Navigation
  // ========================================================================

  showHome() {
    this.currentView = 'home';
    this.clearContent();

    // Navigation cards
    const allCards = [
      {
        icon: '\u2699',
        title: 'Options',
        desc: 'Layout, colorblind mode, connection, and other general settings',
        view: 'options',
      },
      {
        icon: '{ }',
        title: 'Settings (JSON)',
        desc: 'View and edit the raw settings JSON directly',
        view: 'settings',
      },
      {
        icon: '\uD83D\uDD0D',
        title: 'Discovery',
        desc: 'Discovery mode settings and discovered items display',
        view: 'discovery',
        requiresModule: 'discovery',
      },
    ];

    // Filter out cards whose required module is not loaded
    const registry = window.centralRegistry;
    const cards = allCards.filter(card => {
      if (!card.requiresModule) return true;
      return registry && registry.settingsSchemas.has(card.requiresModule);
    });

    for (const card of cards) {
      const el = document.createElement('div');
      el.className = 'options-nav-card';
      el.addEventListener('click', () => this.navigateTo(card.view));

      el.innerHTML = `
        <span class="options-nav-icon">${card.icon}</span>
        <div class="options-nav-info">
          <div class="options-nav-title">${card.title}</div>
          <div class="options-nav-desc">${card.desc}</div>
        </div>
        <span class="options-nav-arrow">\u203A</span>
      `;

      this.contentContainer.appendChild(el);
    }
  }

  navigateTo(view) {
    switch (view) {
      case 'options': this.showOptionsView(); break;
      case 'settings': this.showSettingsView(); break;
      case 'discovery': this.showDiscoveryView(); break;
      default: this.showHome(); break;
    }
  }

  createSubviewHeader(title) {
    const header = document.createElement('div');
    header.className = 'options-subview-header';

    const backBtn = document.createElement('button');
    backBtn.className = 'options-back-btn';
    backBtn.textContent = '\u2190 Back';
    backBtn.addEventListener('click', () => this.showHome());
    header.appendChild(backBtn);

    const titleEl = document.createElement('span');
    titleEl.className = 'options-subview-title';
    titleEl.textContent = title;
    header.appendChild(titleEl);

    return header;
  }

  // ========================================================================
  // Options sub-view
  // ========================================================================

  async showOptionsView() {
    this.currentView = 'options';
    this.clearContent();

    // Insert header before the scrollable content area
    const header = this.createSubviewHeader('Options');
    this.rootElement.insertBefore(header, this.contentContainer);

    await this.loadSettings();
    this.buildOptionsUI();
  }

  buildOptionsUI() {
    this.contentContainer.innerHTML = '';

    this.buildLayoutSection();
    this.buildColorblindSection();
    this.buildConnectionSection();
    this.buildModePersistenceSection();
    this.buildAdvancedSection();
  }

  buildLayoutSection() {
    const section = this.createSection('Layout & Display');
    const content = document.createElement('div');
    content.className = 'options-section-content';

    content.appendChild(this.createRadioSetting('layoutMode', 'Layout Mode',
      'Controls which layout is used. Requires page reload to take effect.',
      [
        { value: 'auto', label: 'Auto (detect device)' },
        { value: 'desktop', label: 'Desktop' },
        { value: 'mobile', label: 'Mobile' },
      ]
    ));
    content.appendChild(this.createBooleanSetting('showLocationItems',
      'Show Location Items', 'Show item names alongside locations'));
    content.appendChild(this.createBooleanSetting('useSubstitutedNames',
      'Use Substituted Names', 'Show meaningful display names instead of generic internal names (e.g. MetaMath)'));

    section.appendChild(content);
    this.contentContainer.appendChild(section);
  }

  buildColorblindSection() {
    const section = this.createSection('Colorblind Mode');
    const content = document.createElement('div');
    content.className = 'options-section-content';

    content.appendChild(this.createBooleanSetting('colorblindRegions', 'Regions', 'Enable colorblind-friendly display for regions'));
    content.appendChild(this.createBooleanSetting('colorblindLocations', 'Locations', 'Enable colorblind-friendly display for locations'));
    content.appendChild(this.createBooleanSetting('colorblindExits', 'Exits', 'Enable colorblind-friendly display for exits'));
    content.appendChild(this.createBooleanSetting('colorblindDungeons', 'Dungeons', 'Enable colorblind-friendly display for dungeons'));
    content.appendChild(this.createBooleanSetting('colorblindLoops', 'Loops', 'Enable colorblind-friendly display for loops'));

    section.appendChild(content);
    this.contentContainer.appendChild(section);
  }

  buildConnectionSection() {
    const section = this.createSection('Connection');
    const content = document.createElement('div');
    content.className = 'options-section-content';

    content.appendChild(this.createTextSetting('playerName', 'Player Name', 'Name displayed in-game and used for client hello'));
    content.appendChild(this.createTextSetting('defaultServer', 'Default Server', 'WebSocket server address for the Archipelago client'));

    section.appendChild(content);
    this.contentContainer.appendChild(section);
  }

  buildModePersistenceSection() {
    const section = this.createSection('Mode Persistence');
    const content = document.createElement('div');
    content.className = 'options-section-content';

    content.appendChild(this.createBooleanSetting('autoSaveMode', 'Auto-save Mode', 'Automatically save mode state on changes'));
    content.appendChild(this.createBooleanSetting('autoLoadMode', 'Auto-load Mode', 'Automatically load saved mode state on startup'));

    section.appendChild(content);
    this.contentContainer.appendChild(section);
  }

  buildAdvancedSection() {
    const section = this.createSection('Advanced', true);
    const content = document.createElement('div');
    content.className = 'options-section-content';
    if (this.sectionsCollapsed.advanced) {
      content.classList.add('collapsed');
    }

    content.appendChild(this.createRadioSetting('logLevel', 'Log Level',
      'Default logging level for all modules',
      [
        { value: 'ERROR', label: 'ERROR' },
        { value: 'WARN', label: 'WARN' },
        { value: 'INFO', label: 'INFO' },
        { value: 'DEBUG', label: 'DEBUG' },
      ]
    ));
    content.appendChild(this.createBooleanSetting('inventoryShowName', 'Inventory: Show Name', 'Show item names in the inventory panel'));
    content.appendChild(this.createBooleanSetting('inventoryShowLabel1', 'Inventory: Show Label 1', 'Show the first label column in inventory'));
    content.appendChild(this.createBooleanSetting('inventoryShowLabel2', 'Inventory: Show Label 2', 'Show the second label column in inventory'));

    section.appendChild(content);
    this.contentContainer.appendChild(section);
  }

  // ========================================================================
  // Settings (JSON) sub-view
  // ========================================================================

  async showSettingsView() {
    this.currentView = 'settings';
    this.clearContent();

    // Insert header before the scrollable content area
    const header = this.createSubviewHeader('Settings (JSON)');
    this.rootElement.insertBefore(header, this.contentContainer);

    // Make contentContainer a flex column so textarea fills space
    this.contentContainer.style.overflow = 'hidden';
    this.contentContainer.style.display = 'flex';
    this.contentContainer.style.flexDirection = 'column';
    this.contentContainer.style.padding = '0';

    // Controls bar
    const controls = document.createElement('div');
    controls.className = 'options-json-controls';

    this.applyButton = document.createElement('button');
    this.applyButton.className = 'options-json-apply-btn';
    this.applyButton.textContent = 'Apply';
    this.applyButton.addEventListener('click', () => this.handleJsonApply());
    controls.appendChild(this.applyButton);

    const title = document.createElement('span');
    title.className = 'options-json-title';
    title.textContent = 'Ctrl+Enter to apply';
    controls.appendChild(title);

    this.contentContainer.appendChild(controls);

    // Textarea
    this.textAreaElement = document.createElement('textarea');
    this.textAreaElement.className = 'options-json-textarea';
    this.textAreaElement.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        this.handleJsonApply();
      }
    });
    this.contentContainer.appendChild(this.textAreaElement);

    // Load current settings into editor
    try {
      const currentSettings = await settingsManager.getSettings();
      this.textAreaElement.value = JSON.stringify(currentSettings, null, 2);
    } catch (error) {
      this.textAreaElement.value = 'Error loading settings';
    }
  }

  async handleJsonApply() {
    if (!this.textAreaElement || !this.applyButton) return;

    try {
      const newSettings = JSON.parse(this.textAreaElement.value);
      await settingsManager.updateSettings(newSettings);

      this.applyButton.textContent = 'Applied!';
      this.applyButton.style.backgroundColor = '#4CAF50';
      setTimeout(() => {
        if (this.applyButton) {
          this.applyButton.textContent = 'Apply';
          this.applyButton.style.backgroundColor = '';
        }
      }, 1000);
    } catch (error) {
      log('error', 'Error applying settings:', error);
      this.applyButton.textContent = 'Error!';
      this.applyButton.style.backgroundColor = '#f44336';
      setTimeout(() => {
        if (this.applyButton) {
          this.applyButton.textContent = 'Apply';
          this.applyButton.style.backgroundColor = '';
        }
      }, 2000);
      alert(`Error applying settings: ${error.message}`);
    }
  }

  teardownSettingsEditor() {
    this.textAreaElement = null;
    this.applyButton = null;
  }

  // ========================================================================
  // Discovery sub-view
  // ========================================================================

  showDiscoveryView() {
    this.currentView = 'discovery';
    this.clearContent();

    // Insert header before the scrollable content area
    const header = this.createSubviewHeader('Discovery');
    this.rootElement.insertBefore(header, this.contentContainer);

    // Make contentContainer fill space for the embedded panel
    this.contentContainer.style.overflow = 'hidden';
    this.contentContainer.style.padding = '0';

    // Create a wrapper element for the discovery panel
    const wrapper = document.createElement('div');
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    this.contentContainer.appendChild(wrapper);

    // Create the adapter container and instantiate DiscoveryPanelUI
    this.discoveryContainer = new SubPanelContainer(wrapper);
    this.discoveryPanel = new DiscoveryPanelUI(this.discoveryContainer, {});

    // The app is already ready, so the deferred init event won't fire.
    // Call initialize() directly.
    this.discoveryPanel.initialize();
  }

  teardownDiscoveryPanel() {
    if (this.discoveryContainer) {
      this.discoveryContainer.destroy();
      this.discoveryContainer = null;
    }
    this.discoveryPanel = null;
  }

  // ========================================================================
  // Home action handlers
  // ========================================================================

  async handleResetToDefaults(btn) {
    if (!confirm('Reset all settings to defaults? This will discard any in-memory changes.')) return;

    await settingsManager.resetToDefaults();
    const origText = btn.textContent;
    btn.textContent = 'Reset!';
    btn.style.backgroundColor = '#4CAF50';
    setTimeout(() => {
      btn.textContent = origText;
      btn.style.backgroundColor = '';
    }, 1500);
  }

  // ========================================================================
  // Options sub-view: control helpers
  // ========================================================================

  createSection(title, collapsible = false) {
    const section = document.createElement('div');
    section.className = 'options-section';

    const header = document.createElement('div');
    header.className = 'options-section-header';

    const titleSpan = document.createElement('span');
    titleSpan.textContent = title;
    header.appendChild(titleSpan);

    if (collapsible) {
      const toggleSpan = document.createElement('span');
      toggleSpan.className = 'options-section-toggle';
      const sectionKey = title.toLowerCase().replace(/[^a-z]/g, '');
      toggleSpan.textContent = this.sectionsCollapsed[sectionKey] ? '[+]' : '[-]';
      header.appendChild(toggleSpan);

      header.addEventListener('click', () => {
        this.sectionsCollapsed[sectionKey] = !this.sectionsCollapsed[sectionKey];
        toggleSpan.textContent = this.sectionsCollapsed[sectionKey] ? '[+]' : '[-]';
        const content = section.querySelector('.options-section-content');
        if (content) {
          content.classList.toggle('collapsed', this.sectionsCollapsed[sectionKey]);
        }
      });
    }

    section.appendChild(header);
    return section;
  }

  createBooleanSetting(settingKey, label, description) {
    const group = document.createElement('div');
    group.className = 'options-setting-group';
    group.dataset.settingKey = settingKey;

    const labelDiv = document.createElement('div');
    labelDiv.className = 'options-setting-label';
    labelDiv.textContent = label;
    group.appendChild(labelDiv);

    if (description) {
      const descDiv = document.createElement('div');
      descDiv.className = 'options-setting-description';
      descDiv.textContent = description;
      group.appendChild(descDiv);
    }

    const radioGroup = document.createElement('div');
    radioGroup.className = 'options-radio-group';

    const yesOption = document.createElement('div');
    yesOption.className = 'options-radio-option';
    const yesInput = document.createElement('input');
    yesInput.type = 'radio';
    yesInput.name = `options-${settingKey}`;
    yesInput.id = `options-${settingKey}-yes`;
    yesInput.value = 'true';
    yesInput.checked = this.settings[settingKey] === true;
    yesInput.addEventListener('change', () => this.handleSettingChange(settingKey, true));
    const yesLabel = document.createElement('label');
    yesLabel.htmlFor = yesInput.id;
    yesLabel.textContent = 'Yes';
    yesOption.appendChild(yesInput);
    yesOption.appendChild(yesLabel);
    radioGroup.appendChild(yesOption);

    const noOption = document.createElement('div');
    noOption.className = 'options-radio-option';
    const noInput = document.createElement('input');
    noInput.type = 'radio';
    noInput.name = `options-${settingKey}`;
    noInput.id = `options-${settingKey}-no`;
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
    group.className = 'options-setting-group';
    group.dataset.settingKey = settingKey;

    const labelDiv = document.createElement('div');
    labelDiv.className = 'options-setting-label';
    labelDiv.textContent = label;
    group.appendChild(labelDiv);

    if (description) {
      const descDiv = document.createElement('div');
      descDiv.className = 'options-setting-description';
      descDiv.textContent = description;
      group.appendChild(descDiv);
    }

    const radioGroup = document.createElement('div');
    radioGroup.className = 'options-radio-group';

    for (const option of options) {
      const optionDiv = document.createElement('div');
      optionDiv.className = 'options-radio-option';

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `options-${settingKey}`;
      input.id = `options-${settingKey}-${option.value}`;
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

  createTextSetting(settingKey, label, description) {
    const group = document.createElement('div');
    group.className = 'options-setting-group';
    group.dataset.settingKey = settingKey;

    const labelDiv = document.createElement('div');
    labelDiv.className = 'options-setting-label';
    labelDiv.textContent = label;
    group.appendChild(labelDiv);

    if (description) {
      const descDiv = document.createElement('div');
      descDiv.className = 'options-setting-description';
      descDiv.textContent = description;
      group.appendChild(descDiv);
    }

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'options-text-input';
    input.id = `options-${settingKey}`;
    input.value = this.settings[settingKey] || '';

    let debounceTimer = null;
    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.handleSettingChange(settingKey, input.value);
      }, 500);
    });

    input.addEventListener('blur', () => {
      clearTimeout(debounceTimer);
      if (input.value !== this.settings[settingKey]) {
        this.handleSettingChange(settingKey, input.value);
      }
    });

    group.appendChild(input);
    return group;
  }

  // ========================================================================
  // Options sub-view: setting change handler
  // ========================================================================

  getSettingPath(settingKey) {
    const pathMap = {
      layoutMode: 'generalSettings.layoutMode',
      showLocationItems: 'moduleSettings.commonUI.showLocationItems',
      colorblindRegions: 'colorblindMode.regions',
      colorblindLocations: 'colorblindMode.locations',
      colorblindExits: 'colorblindMode.exits',
      colorblindDungeons: 'colorblindMode.dungeons',
      colorblindLoops: 'colorblindMode.loops',
      playerName: 'playerName',
      defaultServer: 'moduleSettings.client.defaultServer',
      autoSaveMode: 'generalSettings.autoSaveMode',
      autoLoadMode: 'generalSettings.autoLoadMode',
      logLevel: 'logging.defaultLevel',
      inventoryShowName: 'moduleSettings.inventory.showName',
      inventoryShowLabel1: 'moduleSettings.inventory.showLabel1',
      inventoryShowLabel2: 'moduleSettings.inventory.showLabel2',
      useSubstitutedNames: 'generalSettings.useSubstitutedNames',
    };
    return pathMap[settingKey];
  }

  async handleSettingChange(settingKey, value) {
    log('info', `[OptionsPanelUI] Setting changed: ${settingKey} = ${value}`);
    this.settings[settingKey] = value;

    try {
      const path = this.getSettingPath(settingKey);
      if (path) {
        await settingsManager.updateSetting(path, value);
      } else {
        log('error', `[OptionsPanelUI] Unknown setting key: ${settingKey}`);
      }
    } catch (error) {
      log('error', `[OptionsPanelUI] Error updating setting ${settingKey}:`, error);
    }
  }

  updateOptionsDisplay() {
    if (!this.contentContainer || this.currentView !== 'options') return;

    for (const [key, value] of Object.entries(this.settings)) {
      const group = this.contentContainer.querySelector(`[data-setting-key="${key}"]`);
      if (!group) continue;

      const textInput = group.querySelector('.options-text-input');
      if (textInput) {
        if (textInput !== document.activeElement) {
          textInput.value = value || '';
        }
        continue;
      }

      const radios = group.querySelectorAll('input[type="radio"]');
      for (const radio of radios) {
        if (typeof value === 'boolean') {
          radio.checked = radio.value === String(value);
        } else {
          radio.checked = radio.value === value;
        }
      }
    }
  }

  // ========================================================================
  // Cleanup
  // ========================================================================

  clearContent() {
    this.teardownDiscoveryPanel();
    this.teardownSettingsEditor();

    // Remove any sub-view header that was inserted before the content container
    const existingHeader = this.rootElement.querySelector('.options-subview-header');
    if (existingHeader) {
      existingHeader.remove();
    }

    this.contentContainer.innerHTML = '';
    this.contentContainer.style.overflow = '';
    this.contentContainer.style.display = '';
    this.contentContainer.style.flexDirection = '';
    this.contentContainer.style.padding = '';
  }

  dispose() {
    this.teardownDiscoveryPanel();
    this.teardownSettingsEditor();

    for (const unsub of this.unsubscribeHandles) {
      if (typeof unsub === 'function') {
        unsub();
      }
    }
    this.unsubscribeHandles = [];
    this.isInitialized = false;
  }
}
