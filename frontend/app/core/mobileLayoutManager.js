// frontend/app/core/mobileLayoutManager.js
// Mobile-specific layout manager for touch-friendly panel navigation

import eventBus from './eventBus.js';
import { centralRegistry } from './centralRegistry.js';

// Helper function for logging
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('mobileLayoutManager', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[mobileLayoutManager] ${message}`, ...data);
  }
}

class MobileLayoutManager {
  constructor() {
    this.panels = new Map(); // Map<componentType, { factory, instance, title, element }>
    this.activePanel = null;
    this.container = null;
    this.tabBar = null;
    this.contentArea = null;
    this.isInitialized = false;
    this.appIsReady = false; // Track if app is ready for UI data load
    this.stateManagerReady = false; // Track if state manager is ready
    this.rulesLoaded = false; // Track if rules are loaded
    this.layoutPresets = null; // Store layout presets for panel ordering
    this.panelOrder = []; // Store the desired panel order

    // Dynamic column system properties
    this.currentColumn = 0; // Current active column index
    this.columnPanels = []; // Panels for each column (dynamically sized)
    this.columnActivePanels = []; // Remember active panel for each column
    this.navigationButtons = null; // Container for left/right navigation buttons
    this.columnCount = 0; // Number of columns (determined from layout)

    log('info', 'MobileLayoutManager instance created');

    // Listen for app ready event
    eventBus.subscribe('app:readyForUiDataLoad', () => {
      this.appIsReady = true;
      log('info', 'MobileLayoutManager: App is ready for UI data load');
    }, 'mobileLayoutManager');

    // Listen for stateManager ready event
    eventBus.subscribe('stateManager:ready', () => {
      this.stateManagerReady = true;
      log('info', 'MobileLayoutManager: StateManager is ready');
    }, 'mobileLayoutManager');

    // Listen for rules loaded event
    eventBus.subscribe('stateManager:rulesLoaded', () => {
      this.rulesLoaded = true;
      log('info', 'MobileLayoutManager: Rules loaded');
    }, 'mobileLayoutManager');
  }

  /**
   * Initialize the mobile layout manager
   * @param {HTMLElement} container - The container element for mobile layout
   * @param {Object} layoutPresets - Layout presets configuration
   */
  initialize(container, layoutPresets = null) {
    if (this.isInitialized) {
      log('warn', 'MobileLayoutManager already initialized');
      return;
    }

    this.container = container;
    this.layoutPresets = layoutPresets;
    this.setupMobileLayout();
    this.attachEventListeners();
    this.isInitialized = true;

    log('info', 'MobileLayoutManager initialized');

    // Determine panel order from layout presets
    this.determinePanelOrder();

    // Don't set column yet - let createAllPanelsSync determine it based on which panel will be shown
    // Initially set to 0, will be updated when first panel is shown
    this.currentColumn = 0;

    // Create all panels immediately to match desktop behavior
    // Panels will subscribe to events in their constructors
    this.createAllPanelsSync();
  }


  /**
   * Determine panel order from layout presets and organize by column
   */
  determinePanelOrder() {
    const orderedPanels = [];
    this.columnPanels = []; // Reset column panels
    this.columnActivePanels = []; // Reset active panels

    // Try to get panel order from default preset in layout_presets.json
    if (this.layoutPresets && this.layoutPresets.default) {
      const defaultLayout = this.layoutPresets.default;
      if (defaultLayout.root && defaultLayout.root.content) {
        // Determine number of columns from the layout
        this.columnCount = defaultLayout.root.content.length;

        // Initialize arrays for the detected number of columns
        for (let i = 0; i < this.columnCount; i++) {
          this.columnPanels[i] = [];
          this.columnActivePanels[i] = null;
        }

        // Extract panels from each column
        defaultLayout.root.content.forEach((column, columnIndex) => {
          if (column.content && Array.isArray(column.content)) {
            column.content.forEach(panel => {
              if (panel.componentType) {
                orderedPanels.push(panel.componentType);
                this.columnPanels[columnIndex].push(panel.componentType);
              }
            });
          }
        });
      }
    }

    // If no columns were detected, create a default single column
    if (this.columnCount === 0) {
      this.columnCount = 1;
      this.columnPanels = [[]];
      this.columnActivePanels = [null];
    }

    // Add any panels not in the layout presets to the middle column (or first if only one)
    const middleColumn = Math.floor(this.columnCount / 2);
    for (const componentType of this.panels.keys()) {
      if (!orderedPanels.includes(componentType)) {
        orderedPanels.push(componentType);
        this.columnPanels[middleColumn].push(componentType);
      }
    }

    this.panelOrder = orderedPanels;
    log('info', `Detected ${this.columnCount} columns from layout`);
    log('info', 'Panel order determined:', this.panelOrder);
    log('info', 'Column panels:', this.columnPanels);
  }

  /**
   * Create tabs for all registered panels
   */
  createAllTabs() {
    log('info', 'Creating tabs for current column panels...');

    // Clear existing tabs
    if (this.tabBar) {
      this.tabBar.innerHTML = '';
    }

    // Make sure we have valid column panels
    if (!this.columnPanels[this.currentColumn]) {
      log('warn', `No panels found for column ${this.currentColumn}`);
      return;
    }

    // Create tabs only for panels in the current column
    const currentColumnPanels = this.columnPanels[this.currentColumn];
    for (const componentType of currentColumnPanels) {
      if (this.panels.has(componentType)) {
        this.createTab(componentType);
      }
    }

    log('info', `Created ${currentColumnPanels.length} tabs for column ${this.currentColumn}`);

    // Update navigation button states
    this.updateNavigationButtons();
  }

  /**
   * Setup the mobile layout structure
   */
  setupMobileLayout() {
    // Clear existing content
    this.container.innerHTML = '';
    this.container.className = 'mobile-layout-container';

    // Create content area
    this.contentArea = document.createElement('div');
    this.contentArea.className = 'mobile-panel-content';
    this.container.appendChild(this.contentArea);

    // Create navigation and tab bar container
    const bottomBar = document.createElement('div');
    bottomBar.className = 'mobile-bottom-bar';

    // Create left navigation button
    const leftNavBtn = document.createElement('button');
    leftNavBtn.className = 'mobile-nav-btn mobile-nav-left';
    leftNavBtn.innerHTML = '◀';
    leftNavBtn.addEventListener('click', () => this.navigateColumn(-1));

    // Create tab bar
    this.tabBar = document.createElement('div');
    this.tabBar.className = 'mobile-tab-bar';

    // Create right navigation button
    const rightNavBtn = document.createElement('button');
    rightNavBtn.className = 'mobile-nav-btn mobile-nav-right';
    rightNavBtn.innerHTML = '▶';
    rightNavBtn.addEventListener('click', () => this.navigateColumn(1));

    // Append elements to bottom bar
    bottomBar.appendChild(leftNavBtn);
    bottomBar.appendChild(this.tabBar);
    bottomBar.appendChild(rightNavBtn);

    this.container.appendChild(bottomBar);

    // Store navigation buttons reference
    this.navigationButtons = { left: leftNavBtn, right: rightNavBtn };
  }

  /**
   * Create all registered panels synchronously
   * This matches desktop behavior where panels are created during layout loading
   */
  createAllPanelsSync() {
    log('info', 'Creating all panels synchronously to match desktop loading sequence...');

    // Create all panels immediately, matching Golden Layout's behavior
    for (const [componentType, panel] of this.panels) {
      if (!panel.instance) {
        this.createPanelInstance(componentType);
      }
    }

    // Set initial active panels for each column (first panel in each column)
    for (let i = 0; i < this.columnCount; i++) {
      if (this.columnPanels[i].length > 0) {
        this.columnActivePanels[i] = this.columnPanels[i][0];
      }
    }

    // Show the first panel from the middle column by default
    const firstMiddlePanel = this.getFirstMiddleColumnPanel();
    if (firstMiddlePanel) {
      this.showPanel(firstMiddlePanel);
    } else {
      // Fallback to first panel if no middle column panels found
      const firstPanel = this.panelOrder.length > 0 ? this.panelOrder[0] : Array.from(this.panels.keys())[0];
      if (firstPanel) {
        this.showPanel(firstPanel);
      }
    }

    log('info', `All ${this.panels.size} panels created successfully`);
  }

  /**
   * Get the first panel from the middle column based on layout presets
   * @returns {string|null} The componentType of the first middle column panel
   */
  getFirstMiddleColumnPanel() {
    if (this.layoutPresets && this.layoutPresets.default) {
      const defaultLayout = this.layoutPresets.default;
      if (defaultLayout.root && defaultLayout.root.content && defaultLayout.root.content.length > 0) {
        // Find the middle column dynamically
        const middleIndex = Math.floor(defaultLayout.root.content.length / 2);
        const middleColumn = defaultLayout.root.content[middleIndex];
        if (middleColumn && middleColumn.content && middleColumn.content.length > 0) {
          const firstPanel = middleColumn.content[0];
          if (firstPanel.componentType && this.panels.has(firstPanel.componentType)) {
            return firstPanel.componentType;
          }
        }
      }
    }
    return null;
  }

  /**
   * Legacy async method kept for compatibility
   * @deprecated Use createAllPanelsSync instead
   */
  async createAllPanels() {
    log('warn', 'createAllPanels (async) called - this is deprecated, panels should already be created');
    // Panels should already be created by createAllPanelsSync in initialize()
    // This method is kept for compatibility but shouldn't be needed
    return Promise.resolve();
  }

  /**
   * Register a panel component
   * @param {string} componentType - The component type identifier
   * @param {Function} componentFactory - The component factory function
   * @param {string} title - Display title for the panel
   * @param {Object} moduleInfo - Additional module information (icon, column, etc.)
   */
  registerPanel(componentType, componentFactory, title, moduleInfo = {}) {
    log('info', `Registering panel: ${componentType} (${title})`);

    this.panels.set(componentType, {
      factory: componentFactory,
      instance: null,
      title: title || componentType,
      icon: moduleInfo.icon,
      column: moduleInfo.column || 0,
      tabElement: null
    });

    // Tabs will be created later when initialize() is called
  }

  /**
   * Create a tab for a panel
   * @param {string} componentType - The component type identifier
   */
  createTab(componentType) {
    const panel = this.panels.get(componentType);
    if (!panel || !this.tabBar) return;

    const tab = document.createElement('div');
    tab.className = 'mobile-tab';
    tab.dataset.componentType = componentType;

    // Create tab content with icon and label
    tab.innerHTML = `
      <div class="mobile-tab-icon">${this.getIconForPanel(componentType)}</div>
      <div class="mobile-tab-label">${panel.title}</div>
    `;

    tab.addEventListener('click', () => {
      this.showPanel(componentType);
    });

    panel.tabElement = tab;
    this.tabBar.appendChild(tab);
  }

  /**
   * Get icon for panel type
   * @param {string} componentType - The component type
   * @returns {string} Icon HTML or emoji
   */
  getIconForPanel(componentType) {
    const panel = this.panels.get(componentType);

    // First priority: use icon from moduleInfo if provided
    if (panel && panel.icon) {
      return panel.icon;
    }

    // Second priority: use first letter of title
    if (panel && panel.title) {
      const firstLetter = panel.title.charAt(0).toUpperCase();
      return `<span style="font-weight: bold; font-size: 1.2em;">${firstLetter}</span>`;
    }

    // Fallback: generic icon
    return '📱';
  }

  /**
   * Navigate to a different column
   * @param {number} direction - Direction to navigate (-1 for left, 1 for right)
   */
  navigateColumn(direction) {
    const newColumn = this.currentColumn + direction;

    // Check bounds dynamically based on column count
    if (newColumn < 0 || newColumn >= this.columnCount) {
      return;
    }

    // Check if new column has panels
    if (this.columnPanels[newColumn].length === 0) {
      return;
    }

    // Switch to the new column
    this.currentColumn = newColumn;

    // Refresh tabs for the new column
    this.createAllTabs();

    // Show the remembered active panel for this column
    const activePanelForColumn = this.columnActivePanels[this.currentColumn];
    if (activePanelForColumn) {
      this.showPanel(activePanelForColumn);
    } else {
      // If no active panel remembered, show the first panel in the column
      const firstPanelInColumn = this.columnPanels[this.currentColumn][0];
      if (firstPanelInColumn) {
        this.showPanel(firstPanelInColumn);
      }
    }

    log('info', `Navigated to column ${this.currentColumn}`);
  }

  /**
   * Update navigation button states based on current column
   */
  updateNavigationButtons() {
    if (!this.navigationButtons) return;

    // Disable left button if at leftmost column or no panels in left column
    const canGoLeft = this.currentColumn > 0 &&
                       this.columnPanels[this.currentColumn - 1].length > 0;
    this.navigationButtons.left.disabled = !canGoLeft;
    this.navigationButtons.left.style.opacity = canGoLeft ? '1' : '0.3';

    // Disable right button if at rightmost column or no panels in right column
    const canGoRight = this.currentColumn < this.columnCount - 1 &&
                        this.columnPanels[this.currentColumn + 1].length > 0;
    this.navigationButtons.right.disabled = !canGoRight;
    this.navigationButtons.right.style.opacity = canGoRight ? '1' : '0.3';
  }

  /**
   * Show a specific panel
   * @param {string} componentType - The component type to show
   */
  showPanel(componentType) {
    const panel = this.panels.get(componentType);
    if (!panel) {
      log('warn', `Panel not found: ${componentType}`);
      return;
    }

    // Determine which column this panel belongs to
    let panelColumn = -1;
    for (let i = 0; i < this.columnCount; i++) {
      if (this.columnPanels[i].includes(componentType)) {
        panelColumn = i;
        break;
      }
    }

    // ALWAYS update to the panel's column to keep selector in sync
    if (panelColumn !== -1) {
      const columnChanged = (panelColumn !== this.currentColumn);
      this.currentColumn = panelColumn;

      // Create or refresh tabs if needed
      // Check if tabs exist at all (first time) or if column changed
      const needsTabUpdate = !this.tabBar.children.length || columnChanged;
      if (needsTabUpdate) {
        this.createAllTabs();
      }
    }

    // Hide all panels
    this.panels.forEach((p, type) => {
      if (p.element) {
        p.element.style.display = 'none';
      }
    });

    // Show the selected panel
    if (panel.element) {
      panel.element.style.display = 'block';

      // Notify the panel it's being shown (some panels might need to refresh)
      if (panel.instance) {
        if (typeof panel.instance.onShow === 'function') {
          panel.instance.onShow();
        }

        // If panel has a refresh method, call it
        if (typeof panel.instance.refresh === 'function') {
          panel.instance.refresh();
        }
      }
    } else if (!panel.instance) {
      // Fallback: Create panel if it wasn't created yet (shouldn't happen with createAllPanels)
      log('warn', `Panel ${componentType} not pre-created, creating now...`);
      this.createPanelInstance(componentType);
      if (panel.element) {
        panel.element.style.display = 'block';
      }
    }

    // Update active state
    this.activePanel = componentType;

    // Remember the active panel for this column
    if (panelColumn !== -1) {
      this.columnActivePanels[panelColumn] = componentType;
    }

    // Update tab bar active state
    this.updateTabBarState();

    // Emit panel activation event
    eventBus.publish('ui:panelActivated', {
      componentType,
      isMobile: true
    }, 'mobileLayoutManager');
  }

  /**
   * Create a single panel instance (helper method)
   * @param {string} componentType - The component type to create
   */
  createPanelInstance(componentType) {
    const panel = this.panels.get(componentType);
    if (!panel || panel.instance) return;

    try {
      const panelContainer = document.createElement('div');
      panelContainer.className = 'mobile-panel-instance';
      panelContainer.style.display = 'none';
      panelContainer.dataset.componentType = componentType;

      const mockContainer = {
        element: panelContainer,
        width: this.contentArea.clientWidth,
        height: this.contentArea.clientHeight,
        on: (event, handler) => {
          if (event === 'destroy') {
            panelContainer.addEventListener('destroy', handler);
          }
        },
        emit: (event) => {
          panelContainer.dispatchEvent(new CustomEvent(event));
        }
      };

      const componentState = {
        isMobile: true,
        componentType: componentType
      };

      // Create the panel instance - this matches Golden Layout's behavior
      // The panel constructor will set up event subscriptions
      const uiProvider = new panel.factory(mockContainer, componentState, componentType);

      if (uiProvider && typeof uiProvider.getRootElement === 'function') {
        const rootElement = uiProvider.getRootElement();
        if (rootElement instanceof HTMLElement) {
          panelContainer.appendChild(rootElement);
          this.contentArea.appendChild(panelContainer);

          panel.instance = uiProvider;
          panel.element = panelContainer;

          // Call onMount if it exists - this matches Golden Layout behavior
          if (typeof uiProvider.onMount === 'function') {
            uiProvider.onMount(mockContainer, componentState);
          }

          // Panels will initialize themselves when they receive app:readyForUiDataLoad event

          log('info', `Panel created and ready for events: ${componentType}`);
        }
      }
    } catch (error) {
      log('error', `Error creating panel ${componentType}:`, error);
    }
  }

  /**
   * Update tab bar to show active panel
   */
  updateTabBarState() {
    this.panels.forEach((panel, type) => {
      if (panel.tabElement) {
        if (type === this.activePanel) {
          panel.tabElement.classList.add('active');
          // Scroll the active tab into view
          this.scrollTabIntoView(panel.tabElement);
        } else {
          panel.tabElement.classList.remove('active');
        }
      }
    });
  }

  /**
   * Scroll a tab element into view smoothly
   * @param {HTMLElement} tabElement - The tab element to scroll into view
   */
  scrollTabIntoView(tabElement) {
    if (!tabElement || !this.tabBar) return;

    const tabBarRect = this.tabBar.getBoundingClientRect();
    const tabRect = tabElement.getBoundingClientRect();

    // Check if tab is fully visible
    const isFullyVisible =
      tabRect.left >= tabBarRect.left &&
      tabRect.right <= tabBarRect.right;

    if (!isFullyVisible) {
      // Calculate scroll position to center the tab if possible
      const scrollLeft = tabElement.offsetLeft - (tabBarRect.width / 2) + (tabRect.width / 2);

      this.tabBar.scrollTo({
        left: Math.max(0, scrollLeft),
        behavior: 'smooth'
      });
    }
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Listen for panel activation requests
    eventBus.subscribe('ui:activatePanel', (payload) => {
      if (payload && payload.panelId) {
        this.showPanel(payload.panelId);
      }
    }, 'mobileLayoutManager');

    // Listen for orientation changes
    window.addEventListener('orientationchange', () => {
      this.handleOrientationChange();
    });
  }

  /**
   * Handle device orientation changes
   */
  handleOrientationChange() {
    // Refresh current panel layout if needed
    if (this.activePanel) {
      const panel = this.panels.get(this.activePanel);
      if (panel && panel.instance && typeof panel.instance.onResize === 'function') {
        setTimeout(() => {
          panel.instance.onResize();
        }, 100);
      }
    }
  }

  /**
   * Activate a specific panel by type
   * @param {string} componentType - The component type to activate
   */
  activatePanel(componentType) {
    this.showPanel(componentType);
  }

  /**
   * Get all registered panels
   * @returns {Array} Array of panel info objects
   */
  getAllPanels() {
    return Array.from(this.panels.entries()).map(([type, panel]) => ({
      componentType: type,
      title: panel.title,
      hasInstance: !!panel.instance,
      isActive: type === this.activePanel
    }));
  }

  /**
   * Destroy a panel instance
   * @param {string} componentType - The component type to destroy
   */
  destroyPanel(componentType) {
    const panel = this.panels.get(componentType);
    if (panel && panel.instance) {
      // Emit destroy event
      this.contentArea.dispatchEvent(new CustomEvent('destroy'));

      // Clear instance
      panel.instance = null;

      // If this was the active panel, show another one
      if (this.activePanel === componentType) {
        const otherPanels = Array.from(this.panels.keys()).filter(t => t !== componentType);
        if (otherPanels.length > 0) {
          this.showPanel(otherPanels[0]);
        }
      }
    }
  }

  /**
   * Check if layout manager is in mobile mode
   * @returns {boolean} Always true for mobile layout manager
   */
  isMobile() {
    return true;
  }
}

// Export singleton instance
const mobileLayoutManager = new MobileLayoutManager();
export default mobileLayoutManager;