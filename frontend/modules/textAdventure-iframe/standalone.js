// Main entry point for standalone text adventure
import { IframeClient } from './iframeClient.js';
import { 
    StateManagerProxy, 
    EventBusProxy, 
    ModuleDispatcherProxy,
    PlayerStateProxy,
    DiscoveryStateProxy 
} from './mockDependencies.js';
import { TextAdventureStandalone } from './textAdventureStandalone.js';

// Helper function for logging
function log(level, message, ...data) {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[standalone] ${message}`, ...data);
}

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
 * Initialize the standalone text adventure
 */
async function initializeStandalone() {
    try {
        log('info', 'Initializing standalone text adventure...');
        
        updateConnectionStatus('Connecting to main application...');
        
        // Create iframe client
        const iframeClient = new IframeClient();
        
        // Attempt to connect
        const connected = await iframeClient.connect();
        
        if (!connected) {
            throw new Error('Failed to establish connection');
        }
        
        updateConnectionStatus('Connected successfully', 'connected');
        log('info', 'Connection established');
        
        // Create mock dependencies
        const stateManagerProxy = new StateManagerProxy(iframeClient);
        const eventBusProxy = new EventBusProxy(iframeClient);
        const moduleDispatcherProxy = new ModuleDispatcherProxy(iframeClient);
        const playerStateProxy = new PlayerStateProxy(iframeClient);
        const discoveryStateProxy = new DiscoveryStateProxy(iframeClient);
        
        // Make proxies available globally (similar to the main app)
        window.stateManagerProxySingleton = stateManagerProxy;
        window.iframeEventBus = eventBusProxy;
        window.iframeModuleDispatcher = moduleDispatcherProxy;
        window.iframePlayerState = playerStateProxy;
        window.iframeDiscoveryState = discoveryStateProxy;
        window.iframeClient = iframeClient;
        
        // Wait a moment for static data to arrive
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Create and initialize the text adventure
        const appContainer = document.getElementById('appContainer');
        const textAdventure = new TextAdventureStandalone(
            appContainer, 
            {
                stateManager: stateManagerProxy,
                eventBus: eventBusProxy,
                moduleDispatcher: moduleDispatcherProxy,
                playerState: playerStateProxy,
                discoveryState: discoveryStateProxy,
                iframeClient: iframeClient
            }
        );
        
        // Show the application
        showApp();
        
        // Update status to show we're ready
        updateConnectionStatus('Ready - Text Adventure loaded', 'connected');
        
        log('info', 'Standalone text adventure initialized successfully');
        
    } catch (error) {
        log('error', 'Failed to initialize standalone text adventure:', error);
        showError(`Failed to connect: ${error.message}`);
    }
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeStandalone);
} else {
    initializeStandalone();
}