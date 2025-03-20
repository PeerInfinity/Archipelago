// init.js - Initialization script to load the application

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

    // Import GameUI class and create an instance
    const gameUIModule = await import('./app/ui/gameUI.js');
    const GameUI = gameUIModule.GameUI;

    // Create and initialize the GameUI instance
    const gameUI = new GameUI();

    // Make gameUI available globally
    window.gameUI = gameUI;
    console.log('GameUI instance created and initialized');

    // Import client app last to ensure UI is ready first
    const clientAppModule = await import('./client/app.js');
    window.APP = clientAppModule.default;
    console.log('Client app loaded');
  } catch (error) {
    console.error('Error during application initialization:', error);
  }

  // Add a delayed check to verify initialization
  setTimeout(() => {
    console.log('=== Initialization Status Check ===');
    console.log('gameUI instance exists:', !!window.gameUI);
    console.log('stateManager instance exists:', !!window.stateManager);

    if (window.gameUI) {
      console.log(
        'GameUI initialized with view mode:',
        window.gameUI.currentViewMode
      );
      console.log('GameUI has inventory UI:', !!window.gameUI.inventoryUI);
      console.log('GameUI has location UI:', !!window.gameUI.locationUI);
    }

    if (window.stateManager) {
      console.log(
        'StateManager has inventory:',
        !!window.stateManager.inventory
      );
      console.log(
        'StateManager has regions:',
        !!window.stateManager.regions?.length
      );
      console.log(
        'StateManager has locations:',
        !!window.stateManager.locations?.length
      );
    }
  }, 1000);
});
