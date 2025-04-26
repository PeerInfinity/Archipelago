// gameUI.js - Updated to work directly with console client

import { stateManager } from '../../modules/stateManager/index.js';
import { LocationUI } from '../../modules/locations/locationUI.js';
import { ExitUI } from '../../modules/exits/exitUI.js';
import { RegionUI } from '../../modules/regions/regionUI.js';
import { InventoryUI } from '../../modules/inventory/inventoryUI.js';
import { LoopUI } from '../../modules/loops/loopUI.js';
import eventBus from '../core/eventBus.js';

export class GameUI {
  constructor() {
    // UI Managers
    this.locationUI = new LocationUI(this);
    this.exitUI = new ExitUI(this);
    this.regionUI = new RegionUI(this);
    this.inventoryUI = new InventoryUI(this);
    this.loopUI = new LoopUI(this);
    this.mainConsoleElement = null; // Store reference for deferred init
    this.mainConsoleInputElement = null; // Store reference for deferred init

    // Initialize commonUI colorblind mode - REMOVED: SettingsManager handles this
    // commonUI.setColorblindMode(true);

    // Register with stateManager for UI updates
    stateManager.registerUICallback('gameUI', (eventType) => {
      if (eventType === 'inventoryChanged') {
        this.inventoryUI?.syncWithState();
      } else if (eventType === 'reachableRegionsComputed') {
        this.locationUI?.syncWithState();
        this.exitUI?.syncWithState();
        this.regionUI?.update();
        // Removed direct call to loopUI render
        // if (this.currentViewMode === 'loop') {
        //   this.loopUI?.renderLoopPanel();
        // }
      }
    });

    // Add listener for preset loading start
    eventBus.subscribe('preset:rulesLoading', (data) => {
      console.log(
        '[GameUI] Received preset:rulesLoading event. Clearing existing data.'
      );
      this.clearExistingData(); // Call the cleanup method
    });

    // Listen for loop mode changes
    eventBus.subscribe('loopUI:modeChanged', (data) => {
      console.log(
        `[GameUI] Received loopUI:modeChanged event. Active: ${data.active}`
      );
      this.handleLoopModeChange(data.active);
    });

    // Game state
    this.currentViewMode = 'locations'; // This might be less relevant with Golden Layout managing visibility
    this.debugMode = false;
    this.currentRules = null; // Track current rules data

    // Initialize tracking set for user clicked items
    window._userClickedItems = new Set();

    // Initialize UI
    this.attachEventListeners(); // Attach listeners for global controls if any remain
    this.loadDefaultRules();

    // Initialize test case UI - MOVED to init.js after container exists
    /*
    try {
      const success = this.testCaseUI.initialize();
      if (!success) {
        console.error('Failed to initialize test cases');
      }
    } catch (error) {
      console.error('Failed to initialize test cases:', error);
    }
    */
  }

  initializeUI(jsonData, selectedPlayerId) {
    // Don't store duplicate data locally - stateManager should be the single source of truth
    if (!selectedPlayerId) {
      console.error('InitializeUI called without selectedPlayerId');
      return;
    }
    // Ensure items and item_groups exist for the selected player
    const playerItems = jsonData.items?.[selectedPlayerId] || {};
    const playerGroups = jsonData.item_groups?.[selectedPlayerId];

    // --- NEW: Add check and fallback for groups ---
    let groups = {}; // Default to empty object
    if (
      playerGroups &&
      typeof playerGroups === 'object' &&
      !Array.isArray(playerGroups)
    ) {
      // Check if it's a non-null object (expected format)
      groups = playerGroups;
    } else if (playerGroups) {
      // Log a warning if it exists but isn't the expected object type
      console.warn(
        `[GameUI] Expected item_groups for player ${selectedPlayerId} to be an object, but got:`,
        typeof playerGroups,
        '. Using empty groups instead.'
      );
    }
    // --- END NEW CHECK ---

    // Initialize view-specific UIs
    // Pass the potentially defaulted groups object
    this.inventoryUI.initialize(playerItems, groups);

    // Have UI components get data from stateManager instead of passing jsonData
    this.locationUI.initialize();
    this.exitUI.initialize();
    this.regionUI.initialize();
    // LoopUI initialization might happen via PanelManager now
    // this.loopUI.initialize();
  }

  attachEventListeners() {
    // Initialize collapsible center column (If this is still relevant outside GL)
    // this.initializeCollapsibleCenter();

    // Debug toggle (If this exists outside a specific panel)
    const debugToggle = document.getElementById('debug-toggle');
    if (debugToggle) {
      debugToggle.addEventListener('click', () => {
        this.debugMode = !this.debugMode;
        debugToggle.textContent = this.debugMode ? 'Hide Debug' : 'Show Debug';
        stateManager.setDebugMode?.(this.debugMode);
        if (this.regionUI && this.regionUI.pathAnalyzer) {
          this.regionUI.pathAnalyzer.setDebugMode(this.debugMode);
        }
      });
    }

    // File view toggle radio buttons (These are now inside the Files Panel, handled there)
    // Removed commented out block
  }

  clearExistingData() {
    // Use the more comprehensive clearState instead of just clearInventory
    stateManager.clearState();

    // Clear UI elements (These might need checking if they exist before clearing)
    this.inventoryUI?.clear();
    this.locationUI?.clear();
    this.exitUI?.clear();
    this.regionUI?.clear();
    // LoopUI clear might be handled internally or via panel lifecycle
    // this.loopUI?.clear();
  }

  loadDefaultRules() {
    try {
      // Use synchronous XMLHttpRequest
      const xhr = new XMLHttpRequest();
      xhr.open('GET', './default_rules.json', false); // false makes it synchronous
      xhr.send();

      if (xhr.status !== 200) {
        throw new Error(`HTTP error! status: ${xhr.status}`);
      }

      const jsonData = JSON.parse(xhr.responseText);

      // === Player Selection Logic ===
      let selectedPlayerId = null;
      const playerIds = Object.keys(jsonData.player_names || {});

      if (playerIds.length === 0) {
        throw new Error('No players found in the JSON data.');
      } else if (playerIds.length === 1) {
        selectedPlayerId = playerIds[0];
        console.log(`Auto-selected single player ID: ${selectedPlayerId}`);
      } else {
        // Prompt user to select a player (simple prompt for now)
        const playerOptions = playerIds
          .map((id) => `${id}: ${jsonData.player_names[id]}`)
          .join('\n');
        const choice = prompt(
          `Multiple players found. Please enter the ID of the player to load:\n${playerOptions}`
        );

        if (choice && jsonData.player_names[choice]) {
          selectedPlayerId = choice;
          console.log(`User selected player ID: ${selectedPlayerId}`);
        } else {
          throw new Error('Invalid player selection or prompt cancelled.');
        }
      }
      // === End Player Selection Logic ===

      this.clearExistingData();
      this.currentRules = jsonData; // Store current rules

      // Use selectedPlayerId for loading
      stateManager.initializeInventory(
        [], // Initial items
        jsonData.progression_mapping[selectedPlayerId],
        jsonData.items[selectedPlayerId]
      );

      // Load the complete rules data into the state manager, passing the selected player ID
      stateManager.loadFromJSON(jsonData, selectedPlayerId);

      this.initializeUI(jsonData, selectedPlayerId);

      // Directly update the progress UI
      try {
        import('../../client/ui/progressUI.js').then((module) => {
          const ProgressUI = module.default;
          console.log('Directly updating progress UI after JSON load');
          ProgressUI.updateProgress();
        });
      } catch (error) {
        console.error('Error directly updating progress UI:', error);
      }

      if (window.consoleManager) {
        window.consoleManager.print(
          'Successfully loaded default rules',
          'success'
        );
      }

      // Trigger rules:loaded event to enable offline play
      eventBus.publish('rules:loaded', {});
    } catch (error) {
      console.error('Failed to load default rules:', error);
      // Display error to the user (e.g., using consoleManager or a UI element)
      if (window.consoleManager) {
        window.consoleManager.print(
          `Error loading default rules: ${error.message}`,
          'error'
        );
      }
    }
  }

  _enableControlButtons() {
    // Implementation depends on whether control buttons are globally managed or panel-specific
    // E.g., document.querySelectorAll('.control-button').forEach(btn => btn.disabled = false);
    console.log('[GameUI] Enabling control buttons (if applicable).');
  }

  registerConsoleCommands() {
    if (window.consoleManager) {
      // Command to show current game state
      window.consoleManager.registerCommand(
        'state',
        'Show current game state.',
        () => {
          const currentState = stateManager.getStateForPlayer(
            stateManager.selectedPlayerId
          );
          window.consoleManager.print(
            JSON.stringify(currentState, null, 2),
            'info'
          );
        }
      );

      // Command to list reachable locations
      window.consoleManager.registerCommand(
        'reachable',
        'List reachable locations.',
        () => {
          const reachable = stateManager
            .getPathAnalyzer()
            ?.getReachableLocations();
          window.consoleManager.print(
            `Reachable locations: ${reachable?.join(', ') || 'None'}`,
            'info'
          );
        }
      );

      // Command to list inventory items
      window.consoleManager.registerCommand(
        'inventory',
        'List current inventory items.',
        () => {
          const inventory = stateManager.getCurrentInventory();
          window.consoleManager.print(
            `Inventory: ${inventory.join(', ') || 'Empty'}`,
            'info'
          );
        }
      );

      // Command to toggle debug mode
      window.consoleManager.registerCommand(
        'debug',
        'Toggle debug mode.',
        () => {
          this.debugMode = !this.debugMode;
          stateManager.setDebugMode?.(this.debugMode);
          if (this.regionUI && this.regionUI.pathAnalyzer) {
            this.regionUI.pathAnalyzer.setDebugMode(this.debugMode);
          }
          window.consoleManager.print(
            `Debug mode ${this.debugMode ? 'enabled' : 'disabled'}.`,
            'info'
          );
        }
      );

      // You can add more commands here as needed
      console.log('[GameUI] Registered console commands.');
    } else {
      console.warn(
        '[GameUI] Console Manager not found. Cannot register commands.'
      );
    }
  }

  // --- Main Content Initialization ---

  // This method is now intended to be called by the LayoutManager
  // when the main content panel is created and ready.
  initializeMainContentElements(containerElement) {
    if (!containerElement) {
      console.error(
        '[GameUI] Container element not provided for main content initialization.'
      );
      return;
    }
    console.log(
      '[GameUI] Initializing main content elements within:',
      containerElement
    );

    // Find the console elements within the provided container
    this.mainConsoleElement = containerElement.querySelector('#main-console');
    this.mainConsoleInputElement = containerElement.querySelector(
      '#main-console-input'
    );

    if (!this.mainConsoleElement || !this.mainConsoleInputElement) {
      console.error(
        '[GameUI] Could not find main console elements within the container.'
      );
      return;
    }

    // Attach console input listener
    this.mainConsoleInputElement.addEventListener('keydown', (e) => {
      if (
        e.key === 'Enter' &&
        this.mainConsoleInputElement.value.trim() !== ''
      ) {
        const command = this.mainConsoleInputElement.value.trim();
        this.mainConsoleInputElement.value = ''; // Clear input
        // Pass the command to the console manager if it exists
        if (window.consoleManager) {
          window.consoleManager.executeCommand(command);
        } else {
          // Basic handling if console manager isn't ready/available
          const outputArea =
            this.mainConsoleElement.querySelector('.console-output') ||
            this.mainConsoleElement;
          const p = document.createElement('p');
          p.textContent = `> ${command}`;
          outputArea.appendChild(p);
          const response = document.createElement('p');
          response.textContent = 'Console Manager not available.';
          response.style.color = 'red';
          outputArea.appendChild(response);
          outputArea.scrollTop = outputArea.scrollHeight; // Scroll to bottom
        }
      }
    });

    console.log('[GameUI] Main console input listener attached.');

    // Now that the console elements are known, register commands
    this.registerConsoleCommands();

    // Activate console history (assuming consoleManager handles this now)
    if (window.consoleManager) {
      window.consoleManager.activateHistory(this.mainConsoleInputElement);
      // Print initial welcome message via consoleManager
      window.consoleManager.print(
        'Welcome! Type "help" for available commands.',
        'system'
      );
    } else {
      // Fallback if console manager isn't ready
      const outputArea =
        this.mainConsoleElement.querySelector('.console-output') ||
        this.mainConsoleElement;
      const p = document.createElement('p');
      p.textContent = 'Welcome! Console commands may be limited.';
      p.style.fontStyle = 'italic';
      outputArea.appendChild(p);
      outputArea.scrollTop = outputArea.scrollHeight; // Scroll to bottom
    }
  }

  // --- Loop Mode Handling ---

  handleLoopModeChange(isActive) {
    console.log(`[GameUI] handleLoopModeChange called. isActive: ${isActive}`);
    // Only manage visibility if the panels are directly managed by GameUI
    // With GoldenLayout, visibility is handled by the layout config/state.
    // We might need to update the layout config or trigger layout updates here
    // if loop mode requires rearranging panels, but not simple showing/hiding.

    // Example: If loop mode requires specific panels to be visible,
    // we could potentially interact with the layout manager here.
    // window.layoutManager.setLoopModeLayout(isActive); // Hypothetical

    // Removed direct manipulation of filesPanelContainer visibility
    // Removed call to updateFileViewDisplay
  }
}
