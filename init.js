// init.js - Initialization script to load the application
// import GoldenLayout from 'golden-layout'; // REMOVE this line - rely on global from script tag
import panelManagerInstance from './app/core/panelManagerSingleton.js'; // Import the singleton
import eventBus from './app/core/eventBus.js'; // Import EventBus

// Initialize key modules in order
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Initializing application...');

  try {
    // First, import the stateManager to ensure it's loaded first
    const stateManagerModule = await import(
      './app/core/stateManagerSingleton.js'
    );
    const stateManager = stateManagerModule.default;

    // Make stateManager available globally for debugging
    window.stateManager = stateManager;
    console.log('StateManager loaded and made global');

    // --- Set up event listener BEFORE GameUI instantiation ---
    eventBus.subscribe('stateManager:ready', (data) => {
      console.log('=== StateManager Ready - Final Status Check ===');
      console.log('gameUI instance exists:', !!window.gameUI);
      console.log('stateManager instance exists:', !!window.stateManager);
      console.log(
        'Golden Layout instance exists:',
        !!window.goldenLayoutInstance
      );

      if (window.gameUI) {
        console.log(
          'GameUI initialized with view mode:',
          window.gameUI.currentViewMode
        );
        console.log('GameUI has inventory UI:', !!window.gameUI.inventoryUI);
        console.log('GameUI has location UI:', !!window.gameUI.locationUI);
        console.log(
          'GameUI main console element found:',
          !!window.gameUI.mainConsoleElement
        );
        console.log(
          'GameUI main console input found:',
          !!window.gameUI.mainConsoleInputElement
        );
      }

      if (window.stateManager) {
        console.log(
          'StateManager has inventory:',
          !!window.stateManager.inventory
        );
        console.log(
          'StateManager has regions:',
          !!window.stateManager.regions &&
            Object.keys(window.stateManager.regions).length > 0
        );
        console.log(
          'StateManager has locations:',
          !!window.stateManager.locations?.length
        );
      }
      // Add a check for ConsoleManager too, though it might init slightly later
      console.log('window.consoleManager exists:', !!window.consoleManager);
    });

    // Import GameUI class and create an instance (This will trigger loadFromJSON and the 'ready' event)
    const gameUIModule = await import('./app/ui/gameUI.js');
    const GameUI = gameUIModule.GameUI;
    const gameUI = new GameUI();
    window.gameUI = gameUI;
    console.log('GameUI instance created');

    // === Golden Layout Setup ===
    const containerElement = document.getElementById('goldenlayout-container');
    if (!containerElement) {
      throw new Error('Golden Layout container element not found!');
    }

    // Define the initial layout configuration
    const config = {
      settings: {
        showPopoutIcon: false, // Disable popout icon for simplicity initially
      },
      content: [
        {
          type: 'row',
          content: [
            {
              // Left Column (Inventory)
              type: 'component',
              componentName: 'inventoryPanel',
              title: 'Inventory',
              width: 20, // Percentage width
            },
            {
              // Middle Column (Main Content)
              type: 'component',
              componentName: 'mainContentPanel',
              title: 'Console & Status',
              width: 30,
            },
            {
              // Right Column (Stack of views)
              type: 'stack',
              width: 50,
              content: [
                {
                  type: 'component',
                  componentName: 'locationsPanel',
                  title: 'Locations',
                },
                {
                  type: 'component',
                  componentName: 'exitsPanel',
                  title: 'Exits',
                },
                {
                  type: 'component',
                  componentName: 'regionsPanel',
                  title: 'Regions',
                },
                {
                  type: 'component',
                  componentName: 'loopsPanel',
                  title: 'Loops',
                },
                {
                  type: 'component',
                  componentName: 'filesPanel',
                  title: 'Files',
                },
              ],
            },
          ],
        },
      ],
    };

    // Instantiate Golden Layout
    const layout = new GoldenLayout(config, containerElement);

    // Make layout instance globally available if needed for debugging
    window.goldenLayoutInstance = layout;
    console.log('Golden Layout initialized');

    // --- Initialize PanelManager ---
    panelManagerInstance.initialize(layout, gameUI);
    window.panelManager = panelManagerInstance; // Make PanelManager global
    console.log('PanelManager initialized and assigned to window');

    // --- Register components via PanelManager ---
    panelManagerInstance.registerPanelComponent(
      'inventoryPanel',
      () => gameUI.inventoryUI
    );
    panelManagerInstance.registerPanelComponent('mainContentPanel', () => ({
      getRootElement: () => gameUI.getMainContentRootElement(),
      initializeElements: (containerElement) =>
        gameUI.initializeMainContentElements(containerElement),
    }));
    panelManagerInstance.registerPanelComponent(
      'locationsPanel',
      () => gameUI.locationUI
    );
    panelManagerInstance.registerPanelComponent(
      'exitsPanel',
      () => gameUI.exitUI
    );
    panelManagerInstance.registerPanelComponent(
      'regionsPanel',
      () => gameUI.regionUI
    );
    panelManagerInstance.registerPanelComponent(
      'loopsPanel',
      () => gameUI.loopUI
    );
    panelManagerInstance.registerPanelComponent('filesPanel', () => ({
      getRootElement: () => gameUI.getFilesPanelRootElement(),
      initializeElements: (containerElement) =>
        gameUI.initializeFilesPanelElements(containerElement),
    }));

    // Initialize the layout
    layout.init();
    console.log('Golden Layout initialized');

    // Import client app last to ensure UI is ready first
    const clientAppModule = await import('./client/app.js');
    window.APP = clientAppModule.default;
    console.log('Client app loaded');

    // No longer need URL param logic for view mode - Golden Layout handles active tab state
  } catch (error) {
    console.error('Error during application initialization:', error);
  }
});
