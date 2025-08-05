// Window Base Tests
// These tests validate the basic window-base module functionality
import { registerTest } from '../testRegistry.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('window-baseTests', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[window-baseTests] ${message}`, ...data);
  }
}

// Helper function to set up window-base
async function setupWindowBase(testController) {
  // Step 1: Create window panel
  testController.log('Creating window panel...');
  testController.eventBus.publish('ui:activatePanel', { 
    panelId: 'windowPanel',
    config: { windowName: 'window-base' }
  }, 'tests');
  
  const windowPanelReady = await testController.pollForCondition(
    () => {
      const panel = document.querySelector('.window-panel-container');
      return panel !== null;
    },
    'Window panel to appear',
    5000,
    200
  );
  testController.reportCondition('Window panel is active', windowPanelReady);
  
  // Step 2: Set custom window name
  testController.log('Setting custom window name to "window-base"...');
  const windowPanelElement = document.querySelector('.window-panel-container');
  if (windowPanelElement && windowPanelElement.windowPanelUI) {
    windowPanelElement.windowPanelUI.setCustomWindowName('window-base');
  }
  
  // Step 3: Open window content
  testController.log('Opening window-base module...');
  const windowOpenedPromise = testController.waitForEvent('windowPanel:opened', 10000);
  
  testController.eventBus.publish('window:loadUrl', {
    url: './modules/window-base/index.html?heartbeatInterval=3000'
  }, 'tests');
  
  const windowOpened = await windowOpenedPromise;
  testController.reportCondition('Window opened successfully', !!windowOpened);
  
  // Step 4: Wait for window to establish connection
  testController.log('Waiting for window connection...');
  const windowConnectedPromise = testController.waitForEvent('window:connected', 5000);
  
  const windowConnected = await windowConnectedPromise;
  testController.reportCondition('Window connected to adapter', !!windowConnected);
  
  // Step 5: Wait for window panel UI to show connection status
  await testController.pollForCondition(
    () => {
      const windowPanel = document.querySelector('.window-panel-container');
      if (!windowPanel) return false;
      
      const connectionStatusElement = windowPanel.querySelector('.connection-status-value');
      if (!connectionStatusElement) return false;
      
      return connectionStatusElement.textContent === 'Connected';
    },
    'Window panel to show connection status',
    5000,
    500
  );
  testController.reportCondition('Window panel shows connection status', true);
}

// Helper function to get window panel elements
function getWindowPanelElements() {
  const windowPanel = document.querySelector('.window-panel-container');
  if (!windowPanel) return null;
  
  return {
    windowPanel,
    connectionStatusValue: windowPanel.querySelector('.connection-status-value'),
    heartbeatCounter: windowPanel.querySelector('.heartbeat-count-value'),
    windowInfo: windowPanel.querySelector('.window-info-value')
  };
}

// Helper function to wait for heartbeat updates
async function waitForHeartbeat(testController, initialCount = 0, timeoutMs = 10000) {
  return await testController.pollForCondition(
    () => {
      const elements = getWindowPanelElements();
      if (!elements || !elements.heartbeatCounter) return false;
      
      const currentCount = parseInt(elements.heartbeatCounter.textContent) || 0;
      return currentCount > initialCount;
    },
    'Heartbeat counter to increment',
    timeoutMs,
    1000
  );
}

export async function windowBaseBasicInitializationTest(testController) {
  try {
    testController.log('Starting windowBaseBasicInitializationTest...');
    testController.reportCondition('Test started', true);

    // Setup window-base module
    await setupWindowBase(testController);

    // Check window panel elements exist
    const elements = getWindowPanelElements();
    testController.reportCondition('Window panel accessible', elements !== null);
    
    if (elements) {
      testController.reportCondition('Connection status display exists in panel', elements.connectionStatusValue !== null);
      testController.reportCondition('Heartbeat counter exists in panel', elements.heartbeatCounter !== null);
      testController.reportCondition('Window info display exists in panel', elements.windowInfo !== null);
      
      // Check initial status values
      if (elements.connectionStatusValue) {
        const connectionStatus = elements.connectionStatusValue.textContent;
        testController.reportCondition('Connection status shows connected', connectionStatus === 'Connected');
      }
      
      if (elements.heartbeatCounter) {
        const heartbeatCount = parseInt(elements.heartbeatCounter.textContent) || 0;
        testController.reportCondition('Heartbeat counter initialized', heartbeatCount >= 0);
      }
      
      if (elements.windowInfo) {
        const windowInfo = elements.windowInfo.textContent;
        testController.reportCondition('Window info shows window ID', windowInfo && windowInfo.length > 0);
      }
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in windowBaseBasicInitializationTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

export async function windowBaseHeartbeatTest(testController) {
  try {
    testController.log('Starting windowBaseHeartbeatTest...');
    testController.reportCondition('Test started', true);

    // Setup window-base module
    await setupWindowBase(testController);

    const elements = getWindowPanelElements();
    testController.reportCondition('Window panel elements accessible', elements !== null);

    if (elements && elements.heartbeatCounter) {
      // Get initial heartbeat count
      const initialCount = parseInt(elements.heartbeatCounter.textContent) || 0;
      testController.log(`Initial heartbeat count: ${initialCount}`);
      testController.reportCondition('Initial heartbeat count retrieved', true);

      // Wait for heartbeat to increment (heartbeats are sent every 3 seconds for testing)
      testController.log('Waiting for heartbeat counter to increment...');
      const heartbeatReceived = await waitForHeartbeat(testController, initialCount, 10000);
      testController.reportCondition('Heartbeat counter incremented', heartbeatReceived);
      
      if (heartbeatReceived) {
        const newCount = parseInt(elements.heartbeatCounter.textContent) || 0;
        testController.log(`New heartbeat count: ${newCount}`);
        testController.reportCondition('Heartbeat count increased correctly', newCount > initialCount);
      }
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in windowBaseHeartbeatTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

export async function windowBaseConnectionStatusTest(testController) {
  try {
    testController.log('Starting windowBaseConnectionStatusTest...');
    testController.reportCondition('Test started', true);

    // Setup window-base module
    await setupWindowBase(testController);

    // Wait for the status to update from "Waiting for connection" to "Connected"
    testController.log('Waiting for window panel status to show connected...');
    
    const statusUpdated = await testController.pollForCondition(
      () => {
        const windowPanelContainers = document.querySelectorAll('.window-panel-container');
        for (let container of windowPanelContainers) {
          const statusElement = container.querySelector('.window-status');
          if (statusElement) {
            const statusText = statusElement.textContent;
            if (statusText.includes('window-base') || statusText.includes('Connected')) {
              return statusText.includes('Connected') && !statusText.includes('Waiting for connection');
            }
          }
        }
        return false;
      },
      'Window panel status to show Connected',
      10000,
      500
    );
    
    // Now check the final status
    const windowPanelContainers = document.querySelectorAll('.window-panel-container');
    testController.log(`Found ${windowPanelContainers.length} window panel containers`);
    testController.reportCondition('Window panel container exists', windowPanelContainers.length > 0);
    
    let statusFound = false;
    let statusText = '';
    
    // Check all window panel containers to find the right one
    for (let i = 0; i < windowPanelContainers.length; i++) {
      const container = windowPanelContainers[i];
      const statusElement = container.querySelector('.window-status');
      if (statusElement) {
        statusText = statusElement.textContent;
        testController.log(`Container ${i} status text: ${statusText}`);
        if (statusText.includes('window-base') || statusText.includes('Connected') || statusText.includes('Waiting for connection')) {
          statusFound = true;
          break;
        }
      }
    }
    
    if (statusFound) {
      testController.reportCondition('Panel status shows connected', statusText.includes('Connected'));
      testController.reportCondition('Panel status not waiting for connection', !statusText.includes('Waiting for connection'));
    } else {
      testController.log('No relevant status element found in any window panel');
      testController.reportCondition('Panel status shows connected', false);
      testController.reportCondition('Panel status not waiting for connection', false);
    }

    const elements = getWindowPanelElements();
    testController.reportCondition('Window panel elements accessible', elements !== null);

    if (elements) {
      // Check connection status display
      if (elements.connectionStatusValue) {
        const connectionStatus = elements.connectionStatusValue.textContent;
        testController.log(`Connection status: ${connectionStatus}`);
        testController.reportCondition('Connection status is "Connected"', connectionStatus === 'Connected');
      }
      
      // Check window info display
      if (elements.windowInfo) {
        const windowInfo = elements.windowInfo.textContent;
        testController.log(`Window info: ${windowInfo}`);
        testController.reportCondition('Window info shows window ID', windowInfo && windowInfo.length > 0);
      }
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in windowBaseConnectionStatusTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

export async function windowBaseConnectionTest(testController) {
  try {
    testController.log('Starting windowBaseConnectionTest...');
    testController.reportCondition('Test started', true);

    // Test window adapter and panel creation
    testController.log('Testing window adapter and panel creation...');
    
    // Check that window adapter core is available
    testController.reportCondition('WindowAdapter core available', typeof window.windowAdapterCore !== 'undefined');
    
    // Create window panel
    testController.eventBus.publish('ui:activatePanel', { panelId: 'windowPanel' }, 'tests');
    
    const windowPanelCreated = await testController.pollForCondition(
      () => {
        const panel = document.querySelector('.window-panel-container');
        return panel !== null;
      },
      'Window panel to be created',
      3000,
      200
    );
    testController.reportCondition('Window panel created successfully', windowPanelCreated);

    // Test loading window-base module
    testController.log('Testing window-base loading...');
    const windowLoadedPromise = testController.waitForEvent('windowPanel:opened', 8000);
    
    testController.eventBus.publish('window:loadUrl', {
      url: './modules/window-base/index.html?heartbeatInterval=3000'
    }, 'tests');
    
    const windowLoaded = await windowLoadedPromise;
    testController.reportCondition('Window loaded event received', !!windowLoaded);

    // Test window connection
    testController.log('Testing window connection to adapter...');
    const windowConnectedPromise = testController.waitForEvent('window:connected', 5000);
    
    const windowConnected = await windowConnectedPromise;
    testController.reportCondition('Window connected to adapter', !!windowConnected);
    
    if (windowConnected) {
      testController.log(`Window connected with ID: ${windowConnected.windowId}`);
      testController.reportCondition('Connection event received successfully', true);
    }

    // Test window manager panel
    testController.log('Testing window manager panel...');
    testController.eventBus.publish('ui:activatePanel', { panelId: 'windowManagerPanel' }, 'tests');
    
    const windowManagerCreated = await testController.pollForCondition(
      () => {
        const panel = document.querySelector('.window-manager-panel-container');
        return panel !== null;
      },
      'Window manager panel to be created',
      3000,
      200
    );
    testController.reportCondition('Window manager panel created successfully', windowManagerCreated);
    
    // Check manager panel elements
    if (windowManagerCreated) {
      const urlInput = document.querySelector('.window-manager-panel .url-input');
      const loadButton = document.querySelector('.window-manager-panel .load-button');
      const knownPagesSelect = document.querySelector('.window-manager-panel .known-pages-select');
      
      testController.reportCondition('Manager panel URL input exists', urlInput !== null);
      testController.reportCondition('Manager panel load button exists', loadButton !== null);
      testController.reportCondition('Manager panel known pages select exists', knownPagesSelect !== null);
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in windowBaseConnectionTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

// These iframe functions are not used in window-base tests

// Register all window-base tests

registerTest({
  id: 'test_window_base_connection',
  name: 'Window Base Connection',
  description: 'Tests window adapter, panel creation, and connection establishment for window-base module.',
  testFunction: windowBaseConnectionTest,
  category: 'Window Base Tests',
  enabled: false,
});

registerTest({
  id: 'test_window_base_basic_initialization',
  name: 'Window Base Basic Initialization',
  description: 'Tests basic window-base panel initialization and status display.',
  testFunction: windowBaseBasicInitializationTest,
  category: 'Window Base Tests',
  enabled: false,
});

registerTest({
  id: 'test_window_base_heartbeat',
  name: 'Window Base Heartbeat Test',
  description: 'Tests heartbeat counter functionality in window-base module.',
  testFunction: windowBaseHeartbeatTest,
  category: 'Window Base Tests',
  enabled: false,
});

registerTest({
  id: 'test_window_base_connection_status',
  name: 'Window Base Connection Status',
  description: 'Tests connection status display and module identification in window-base.',
  testFunction: windowBaseConnectionStatusTest,
  category: 'Window Base Tests',
  enabled: false,
});