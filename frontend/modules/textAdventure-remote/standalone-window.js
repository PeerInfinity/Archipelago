// Main entry point for standalone text adventure (separate window version)
import { WindowClient } from '../window-base/windowClient.js';
import { TextAdventureStandalone } from './textAdventureStandalone.js';
import { createSharedLogger, initializeIframeLogger } from './shared/sharedLogger.js';

// Initialize logger with conservative defaults
// The main thread will send the actual configuration via postMessage
// Note: We use initializeIframeLogger for window context too - it handles both
initializeIframeLogger({
    defaultLevel: 'WARN',
    categoryLevels: {
        // Start with WARN level, will be updated when main thread sends config
    }
});

// Create logger for this module
const logger = createSharedLogger('standalone-window');

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
 * Initialize the standalone text adventure in a separate window
 */
async function initializeStandalone() {
    try {
        logger.info('Initializing standalone text adventure in separate window...');

        updateConnectionStatus('Connecting to main application...');

        // Create window client
        const windowClient = new WindowClient();

        // Attempt to connect
        const connected = await windowClient.connect();

        if (!connected) {
            throw new Error('Failed to establish connection');
        }

        updateConnectionStatus('Connected successfully', 'connected');
        logger.info('Connection established');

        // Make client available globally for debugging
        window.windowClient = windowClient;

        // Wait a brief moment for initial data to arrive
        await new Promise(resolve => setTimeout(resolve, 200));

        // Create and initialize the text adventure
        // TextAdventureStandalone now creates its own dependency wrappers from the client
        const appContainer = document.getElementById('appContainer');
        const textAdventure = new TextAdventureStandalone(appContainer, windowClient);

        // Show the application
        showApp();

        // Update status to show we're ready
        updateConnectionStatus('Ready - Text Adventure loaded', 'connected');

        logger.info('Standalone text adventure initialized successfully in separate window');

    } catch (error) {
        logger.error('Failed to initialize standalone text adventure:', error);
        showError(`Failed to connect: ${error.message}`);
    }
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeStandalone);
} else {
    initializeStandalone();
}
