// Main entry point for window-base module
import { WindowClient } from './windowClient.js';
import { createSharedLogger, initializeWindowLogger } from './shared/sharedLogger.js';
import { MessageTypes } from '../windowAdapter/communicationProtocol.js';

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

// Track heartbeat count
let heartbeatCount = 0;

/**
 * Create status display
 */
function createStatusDisplay() {
    const appContainer = document.getElementById('appContainer');
    
    const statusPanel = document.createElement('div');
    statusPanel.className = 'status-panel';
    
    const statusContent = document.createElement('div');
    statusContent.className = 'status-content';
    
    statusContent.innerHTML = `
        <h2>Window Base Module</h2>
        <div class="status-item">
            <span class="status-label">Connection Status:</span>
            <span class="status-value" id="connectionStatusValue">Connected</span>
        </div>
        <div class="status-item">
            <span class="status-label">Heartbeats Sent:</span>
            <span class="heartbeat-count" id="heartbeatCounter">0</span>
        </div>
    `;
    
    statusPanel.appendChild(statusContent);
    appContainer.appendChild(statusPanel);
}

/**
 * Update heartbeat counter
 */
function updateHeartbeatCounter() {
    heartbeatCount++;
    const counter = document.getElementById('heartbeatCounter');
    if (counter) {
        counter.textContent = heartbeatCount.toString();
    }
}

/**
 * Update connection status display
 */
function updateConnectionStatusDisplay(status) {
    const statusValue = document.getElementById('connectionStatusValue');
    if (statusValue) {
        statusValue.textContent = status;
    }
}

/**
 * Initialize the standalone window base module
 */
async function initializeStandalone() {
    try {
        logger.info('Initializing window base module...');
        
        // Note: We're no longer in an iframe, so we don't need to check for iframe context
        // Instead, we're running in a separate browser window
        
        updateConnectionStatus('Connecting to main application...');
        
        // Create window client
        const windowClient = new WindowClient();
        
        // Override sendToParent to count heartbeat sends
        const originalSendToParent = windowClient.sendToParent.bind(windowClient);
        windowClient.sendToParent = function(type, data) {
            originalSendToParent(type, data);
            if (type === MessageTypes.HEARTBEAT) {
                updateHeartbeatCounter();
            }
        };
        
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
        
        // Create status display
        createStatusDisplay();
        updateConnectionStatusDisplay('Connected');
        
        // Show the application
        showApp();
        
        // Update status to show we're ready
        updateConnectionStatus('Ready - Window Base loaded', 'connected');
        
        logger.info('Window base module initialized successfully');
        
    } catch (error) {
        logger.error('Failed to initialize window base module:', error);
        showError(`Failed to connect: ${error.message}`);
    }
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeStandalone);
} else {
    initializeStandalone();
}