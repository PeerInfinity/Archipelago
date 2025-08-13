// Main entry point for window-based text adventure
import { WindowClient } from '../window-base/windowClient.js';
import { 
    StateManagerProxy, 
    EventBusProxy, 
    ModuleDispatcherProxy,
    PlayerStateProxy,
    DiscoveryStateProxy 
} from './mockDependencies.js';
import { WindowTextAdventureStandalone } from './windowTextAdventureStandalone.js';
import { createSharedLogger, initializeWindowLogger } from '../window-base/shared/sharedLogger.js';

// Initialize window logger with conservative defaults
// The main thread will send the actual configuration via postMessage
initializeWindowLogger({
    defaultLevel: 'WARN',
    categoryLevels: {
        // Start with WARN level, will be updated when main thread sends config
    }
});

// Create logger for this module
const logger = createSharedLogger('standalone');

/**
 * Update connection status in UI
 * @param {string} status - Status message
 * @param {string} type - Status type ('connecting', 'connected', 'error')
 */
function updateConnectionStatus(status, type = 'connecting') {
    const statusElement = document.getElementById('connectionStatus');
    if (statusElement) {
        statusElement.textContent = status;
        statusElement.className = `connection-status ${type}`;
    }
}

/**
 * Show error state
 * @param {string} errorMessage - Error message to display
 */
function showError(errorMessage) {
    const appContainer = document.getElementById('appContainer');
    const errorContainer = document.getElementById('errorContainer');
    
    if (appContainer) {
        appContainer.style.display = 'none';
    }
    
    if (errorContainer) {
        errorContainer.style.display = 'flex';
        
        // Update error message if provided
        if (errorMessage) {
            const errorMessageElement = errorContainer.querySelector('.error-message p');
            if (errorMessageElement) {
                errorMessageElement.textContent = errorMessage;
            }
        }
    }
    
    updateConnectionStatus('Connection failed', 'error');
}

/**
 * Show application state
 */
function showApp() {
    const appContainer = document.getElementById('appContainer');
    const errorContainer = document.getElementById('errorContainer');
    
    if (appContainer) {
        appContainer.style.display = 'flex';
    }
    
    if (errorContainer) {
        errorContainer.style.display = 'none';
    }
}

/**
 * Initialize the window-based text adventure
 */
async function initializeStandalone() {
    try {
        logger.info('Initializing window-based text adventure...');
        
        updateConnectionStatus('Connecting to main application...');
        
        // Create window client
        const windowClient = new WindowClient();
        
        // Add delay for Firefox compatibility
        const userAgent = navigator.userAgent.toLowerCase();
        const isFirefox = userAgent.includes('firefox');
        if (isFirefox) {
            logger.info('Firefox detected, adding connection delay...');
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Attempt to connect
        const connected = await windowClient.connect();
        
        if (!connected) {
            throw new Error('Failed to establish connection');
        }
        
        updateConnectionStatus('Connected successfully', 'connected');
        logger.info('Connection established');
        
        // Create proxies
        const stateManagerProxy = new StateManagerProxy(windowClient);
        const eventBusProxy = new EventBusProxy(windowClient);
        const moduleDispatcherProxy = new ModuleDispatcherProxy(windowClient);
        const playerStateProxy = new PlayerStateProxy(windowClient);
        const discoveryStateProxy = new DiscoveryStateProxy(windowClient);
        
        // Make proxies available globally (similar to the main app)
        window.stateManagerProxySingleton = stateManagerProxy;
        window.windowEventBus = eventBusProxy;
        window.windowModuleDispatcher = moduleDispatcherProxy;
        window.windowPlayerState = playerStateProxy;
        window.windowDiscoveryState = discoveryStateProxy;
        window.windowClient = windowClient;
        
        // Wait a brief moment for initial data to arrive
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Create and initialize the text adventure
        const appContainer = document.getElementById('appContainer');
        const textAdventure = new WindowTextAdventureStandalone(
            appContainer, 
            {
                stateManager: stateManagerProxy,
                eventBus: eventBusProxy,
                moduleDispatcher: moduleDispatcherProxy,
                playerState: playerStateProxy,
                discoveryState: discoveryStateProxy,
                windowClient: windowClient
            }
        );
        
        // Show the application
        showApp();
        
        // Update status to show we're ready
        updateConnectionStatus('Ready - Text Adventure loaded', 'connected');
        
        logger.info('Window-based text adventure initialized successfully');
        
    } catch (error) {
        logger.error('Failed to initialize window-based text adventure:', error);
        showError(`Failed to connect: ${error.message}`);
    }
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeStandalone);
} else {
    initializeStandalone();
}