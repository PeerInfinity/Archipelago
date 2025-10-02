// Main entry point for standalone text adventure (iframe version)
import { IframeClient } from '../iframe-base/iframeClient.js';
import { TextAdventureStandalone } from './textAdventureStandalone.js';
import { createSharedLogger, initializeIframeLogger } from './shared/sharedLogger.js';

// Initialize iframe logger with conservative defaults
// The main thread will send the actual configuration via postMessage
initializeIframeLogger({
    defaultLevel: 'WARN',
    categoryLevels: {
        // Start with WARN level, will be updated when main thread sends config
    }
});

// Create logger for this module
const logger = createSharedLogger('standalone');

// Debug: Log that this file is loading
console.log('=== standalone.js module loaded ===');

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
        console.log('[standalone] initializeStandalone called');
        logger.info('Initializing standalone text adventure...');

        // Check if we're running inside an iframe panel (parent has iframe status)
        const isInIframePanel = window.self !== window.top;
        if (isInIframePanel) {
            // Add class to hide internal status bar since parent shows it
            document.body.classList.add('iframe-embedded');
        }

        updateConnectionStatus('Connecting to main application...');
        console.log('[standalone] Connecting...');

        // Create iframe client
        const iframeClient = new IframeClient();
        console.log('[standalone] IframeClient created');

        // Attempt to connect
        const connected = await iframeClient.connect();
        console.log('[standalone] Connected:', connected);

        if (!connected) {
            throw new Error('Failed to establish connection');
        }

        updateConnectionStatus('Connected successfully', 'connected');
        console.log('[standalone] Connection successful');
        logger.info('Connection established');

        // Make client available globally for debugging
        window.iframeClient = iframeClient;

        // Wait a brief moment for initial data to arrive
        console.log('[standalone] Waiting for initial data...');
        await new Promise(resolve => setTimeout(resolve, 200));
        console.log('[standalone] Wait complete');

        // Create and initialize the text adventure
        // TextAdventureStandalone now creates its own dependency wrappers from the client
        const appContainer = document.getElementById('appContainer');
        console.log('[standalone] appContainer:', appContainer);

        try {
            console.log('[standalone] Creating TextAdventureStandalone...');
            const textAdventure = new TextAdventureStandalone(appContainer, iframeClient);
            console.log('[standalone] TextAdventureStandalone created:', textAdventure);
            logger.info('TextAdventureStandalone created successfully');

            // Notify adapter that we're fully initialized and ready to receive events
            iframeClient.notifyAppReady();
            console.log('[standalone] Notified adapter that app is ready');
        } catch (err) {
            console.error('[standalone] Error creating TextAdventureStandalone:', err);
            logger.error('Error creating TextAdventureStandalone:', err);
            // Show error in UI
            const errorMsg = `Failed to initialize: ${err.message}\n${err.stack}`;
            if (appContainer) {
                appContainer.innerHTML = `<pre style="color: red; padding: 10px;">${errorMsg}</pre>`;
            }
            throw err;
        }

        // Show the application
        showApp();
        
        // Update status to show we're ready
        updateConnectionStatus('Ready - Text Adventure loaded', 'connected');
        
        logger.info('Standalone text adventure initialized successfully');
        
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