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
   */
  initialize(container) {
    if (this.isInitialized) {
      log('warn', 'MobileLayoutManager already initialized');
      return;
    }

    this.container = container;
    this.setupMobileLayout();
    this.attachEventListeners();
    this.isInitialized = true;

    log('info', 'MobileLayoutManager initialized');

    // Create tabs for all registered panels now that tabBar exists
    this.createAllTabs();

    // Create all panels immediately to match desktop behavior
    // Panels will subscribe to events in their constructors
    this.createAllPanelsSync();
  }


  /**
   * Create tabs for all registered panels
   */
  createAllTabs() {
    log('info', 'Creating tabs for all registered panels...');
    for (const [componentType, panel] of this.panels) {
      this.createTab(componentType);
    }
    log('info', `Created ${this.panels.size} tabs`);
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

    // Create tab bar
    this.tabBar = document.createElement('div');
    this.tabBar.className = 'mobile-tab-bar';
    this.container.appendChild(this.tabBar);

    // No swipe gestures - removed to prevent accidental panel switches
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

    // Show the first panel by default
    const firstPanel = Array.from(this.panels.keys())[0];
    if (firstPanel) {
      this.showPanel(firstPanel);
    }

    log('info', `All ${this.panels.size} panels created successfully`);
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
   */
  registerPanel(componentType, componentFactory, title) {
    log('info', `Registering panel: ${componentType} (${title})`);

    this.panels.set(componentType, {
      factory: componentFactory,
      instance: null,
      title: title || componentType,
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
   * Get icon for panel type (can be customized)
   * @param {string} componentType - The component type
   * @returns {string} Icon HTML or emoji
   */
  getIconForPanel(componentType) {
    const icons = {
      'loopsPanel': '🔄',
      'jsonPanel': '📄',
      'inventoryPanel': '🎒',
      'locationsPanel': '📍',
      'testsPanel': '✅',
      'modulesPanel': '📦',
      'clientPanel': '🎮',
      'editorPanel': '✏️',
      'timerPanel': '⏱️',
      'pathAnalyzerPanel': '🛤️',
      'presetsPanel': '⚙️'
    };
    return icons[componentType] || '📱';
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

          // DO NOT call initialize() here - panels will initialize themselves
          // when they receive app:readyForUiDataLoad event, exactly like desktop mode
          // The panels are now created and listening for events

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