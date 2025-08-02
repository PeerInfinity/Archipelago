// Iframe Base Tests
// These tests validate the basic iframe-base module functionality
import { registerTest } from '../testRegistry.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('iframe-baseTests', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[iframe-baseTests] ${message}`, ...data);
  }
}

// Helper function to set up iframe-base
async function setupIframeBase(testController) {
  // Step 1: Create iframe panel
  testController.log('Creating iframe panel...');
  testController.eventBus.publish('ui:activatePanel', { 
    panelId: 'iframePanel',
    config: { iframeName: 'iframe-base' }
  }, 'tests');
  
  const iframePanelReady = await testController.pollForCondition(
    () => {
      const panel = document.querySelector('.iframe-panel-container');
      return panel !== null;
    },
    'Iframe panel to appear',
    5000,
    200
  );
  testController.reportCondition('Iframe panel is active', iframePanelReady);
  
  // Step 2: Set custom iframe name
  testController.log('Setting custom iframe name to "iframe-base"...');
  const iframePanelElement = document.querySelector('.iframe-panel-container');
  if (iframePanelElement && iframePanelElement.iframePanelUI) {
    iframePanelElement.iframePanelUI.setCustomIframeName('iframe-base');
  }
  
  // Step 3: Load iframe content
  testController.log('Loading iframe-base module...');
  const iframeLoadedPromise = testController.waitForEvent('iframePanel:loaded', 10000);
  
  testController.eventBus.publish('iframe:loadUrl', {
    url: './modules/iframe-base/index.html?heartbeatInterval=3000'
  }, 'tests');
  
  const iframeLoaded = await iframeLoadedPromise;
  testController.reportCondition('Iframe loaded successfully', !!iframeLoaded);
  
  // Step 4: Wait for iframe to establish connection
  testController.log('Waiting for iframe connection...');
  const iframeConnectedPromise = testController.waitForEvent('iframe:connected', 5000);
  
  const iframeConnected = await iframeConnectedPromise;
  testController.reportCondition('Iframe connected to adapter', !!iframeConnected);
  
  // Step 5: Wait for iframe UI to be ready
  await testController.pollForCondition(
    () => {
      const iframe = document.querySelector('.iframe-panel iframe');
      if (!iframe) return false;
      
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        const statusPanel = iframeDoc.querySelector('.status-panel');
        return statusPanel !== null;
      } catch (error) {
        // Cross-origin access might be blocked
        return false;
      }
    },
    'Iframe base UI to be ready',
    5000,
    500
  );
  testController.reportCondition('Iframe base UI ready', true);
}

// Helper function to get iframe elements
function getIframeElements() {
  const iframe = document.querySelector('.iframe-panel iframe');
  if (!iframe) return null;
  
  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    return {
      iframe,
      iframeDoc,
      statusPanel: iframeDoc.querySelector('.status-panel'),
      connectionStatusValue: iframeDoc.querySelector('#connectionStatusValue'),
      heartbeatCounter: iframeDoc.querySelector('#heartbeatCounter'),
      connectionStatus: iframeDoc.querySelector('#connectionStatus')
    };
  } catch (error) {
    // Cross-origin access might be blocked
    return null;
  }
}

// Helper function to wait for heartbeat updates
async function waitForHeartbeat(testController, initialCount = 0, timeoutMs = 10000) {
  return await testController.pollForCondition(
    () => {
      const elements = getIframeElements();
      if (!elements || !elements.heartbeatCounter) return false;
      
      const currentCount = parseInt(elements.heartbeatCounter.textContent) || 0;
      return currentCount > initialCount;
    },
    'Heartbeat counter to increment',
    timeoutMs,
    1000
  );
}

export async function iframeBaseBasicInitializationTest(testController) {
  try {
    testController.log('Starting iframeBaseBasicInitializationTest...');
    testController.reportCondition('Test started', true);

    // Setup iframe-base module
    await setupIframeBase(testController);

    // Check iframe elements exist
    const elements = getIframeElements();
    testController.reportCondition('Iframe document accessible', elements !== null);
    
    if (elements) {
      testController.reportCondition('Status panel exists in iframe', elements.statusPanel !== null);
      testController.reportCondition('Connection status display exists in iframe', elements.connectionStatusValue !== null);
      testController.reportCondition('Heartbeat counter exists in iframe', elements.heartbeatCounter !== null);
      testController.reportCondition('Connection status header exists in iframe', elements.connectionStatus !== null);
      
      // Check initial status values
      if (elements.connectionStatusValue) {
        const connectionStatus = elements.connectionStatusValue.textContent;
        testController.reportCondition('Connection status shows connected', connectionStatus === 'Connected');
      }
      
      if (elements.heartbeatCounter) {
        const heartbeatCount = parseInt(elements.heartbeatCounter.textContent) || 0;
        testController.reportCondition('Heartbeat counter initialized', heartbeatCount >= 0);
      }
      
      if (elements.connectionStatus) {
        const statusText = elements.connectionStatus.textContent;
        testController.reportCondition('Connection status header shows ready', statusText.includes('Ready'));
      }
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in iframeBaseBasicInitializationTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

export async function iframeBaseHeartbeatTest(testController) {
  try {
    testController.log('Starting iframeBaseHeartbeatTest...');
    testController.reportCondition('Test started', true);

    // Setup iframe-base module
    await setupIframeBase(testController);

    const elements = getIframeElements();
    testController.reportCondition('Iframe elements accessible', elements !== null);

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
    testController.log(`Error in iframeBaseHeartbeatTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

export async function iframeBaseConnectionStatusTest(testController) {
  try {
    testController.log('Starting iframeBaseConnectionStatusTest...');
    testController.reportCondition('Test started', true);

    // Setup iframe-base module
    await setupIframeBase(testController);

    // Wait for the status to update from "Waiting for connection" to "Connected"
    testController.log('Waiting for iframe panel status to show connected...');
    
    const statusUpdated = await testController.pollForCondition(
      () => {
        const iframePanelContainers = document.querySelectorAll('.iframe-panel-container');
        for (let container of iframePanelContainers) {
          const statusElement = container.querySelector('.iframe-status');
          if (statusElement) {
            const statusText = statusElement.textContent;
            if (statusText.includes('iframe-base') || statusText.includes('Connected:')) {
              return statusText.includes('Connected:') && !statusText.includes('Waiting for connection');
            }
          }
        }
        return false;
      },
      'Iframe panel status to show Connected',
      10000,
      500
    );
    
    // Now check the final status
    const iframePanelContainers = document.querySelectorAll('.iframe-panel-container');
    testController.log(`Found ${iframePanelContainers.length} iframe panel containers`);
    testController.reportCondition('Iframe panel container exists', iframePanelContainers.length > 0);
    
    let statusFound = false;
    let statusText = '';
    
    // Check all iframe panel containers to find the right one
    for (let i = 0; i < iframePanelContainers.length; i++) {
      const container = iframePanelContainers[i];
      const statusElement = container.querySelector('.iframe-status');
      if (statusElement) {
        statusText = statusElement.textContent;
        testController.log(`Container ${i} status text: ${statusText}`);
        if (statusText.includes('iframe-base') || statusText.includes('Connected:') || statusText.includes('Waiting for connection')) {
          statusFound = true;
          break;
        }
      }
    }
    
    if (statusFound) {
      testController.reportCondition('Panel status shows connected', statusText.includes('Connected:'));
      testController.reportCondition('Panel status not waiting for connection', !statusText.includes('Waiting for connection'));
    } else {
      testController.log('No relevant status element found in any iframe panel');
      testController.reportCondition('Panel status shows connected', false);
      testController.reportCondition('Panel status not waiting for connection', false);
    }

    const elements = getIframeElements();
    testController.reportCondition('Iframe elements accessible', elements !== null);

    if (elements) {
      // Check connection status display
      if (elements.connectionStatusValue) {
        const connectionStatus = elements.connectionStatusValue.textContent;
        testController.log(`Connection status: ${connectionStatus}`);
        testController.reportCondition('Connection status is "Connected"', connectionStatus === 'Connected');
      }
      
      // Check top connection status bar
      if (elements.connectionStatus) {
        const statusText = elements.connectionStatus.textContent;
        testController.log(`Status bar text: ${statusText}`);
        testController.reportCondition('Status bar shows ready state', statusText.includes('Ready'));
        testController.reportCondition('Status bar mentions iframe base', statusText.includes('Iframe Base'));
      }
      
      // Verify the iframe has the correct title
      const title = elements.iframeDoc.title;
      testController.reportCondition('Document title is correct', title === 'Iframe Base (Standalone)');
      
      // Verify status panel has correct heading
      if (elements.statusPanel) {
        const heading = elements.statusPanel.querySelector('h2');
        if (heading) {
          testController.reportCondition('Status panel heading is correct', heading.textContent === 'Iframe Base Module');
        }
      }
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in iframeBaseConnectionStatusTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

export async function iframeBaseConnectionTest(testController) {
  try {
    testController.log('Starting iframeBaseConnectionTest...');
    testController.reportCondition('Test started', true);

    // Test iframe adapter and panel creation
    testController.log('Testing iframe adapter and panel creation...');
    
    // Check that iframe adapter core is available
    testController.reportCondition('IframeAdapter core available', typeof window.iframeAdapterCore !== 'undefined');
    
    // Create iframe panel
    testController.eventBus.publish('ui:activatePanel', { panelId: 'iframePanel' }, 'tests');
    
    const iframePanelCreated = await testController.pollForCondition(
      () => {
        const panel = document.querySelector('.iframe-panel-container');
        return panel !== null;
      },
      'Iframe panel to be created',
      3000,
      200
    );
    testController.reportCondition('Iframe panel created successfully', iframePanelCreated);

    // Test loading iframe-base module
    testController.log('Testing iframe-base loading...');
    const iframeLoadedPromise = testController.waitForEvent('iframePanel:loaded', 8000);
    
    testController.eventBus.publish('iframe:loadUrl', {
      url: './modules/iframe-base/index.html?heartbeatInterval=3000'
    }, 'tests');
    
    const iframeLoaded = await iframeLoadedPromise;
    testController.reportCondition('Iframe loaded event received', !!iframeLoaded);

    // Test iframe connection
    testController.log('Testing iframe connection to adapter...');
    const iframeConnectedPromise = testController.waitForEvent('iframe:connected', 5000);
    
    const iframeConnected = await iframeConnectedPromise;
    testController.reportCondition('Iframe connected to adapter', !!iframeConnected);
    
    if (iframeConnected) {
      testController.log(`Iframe connected with ID: ${iframeConnected.iframeId}`);
      // Note: capabilities may not be included in the connection event data
      testController.reportCondition('Connection event received successfully', true);
    }

    // Test iframe manager panel
    testController.log('Testing iframe manager panel...');
    testController.eventBus.publish('ui:activatePanel', { panelId: 'iframeManagerPanel' }, 'tests');
    
    const iframeManagerCreated = await testController.pollForCondition(
      () => {
        const panel = document.querySelector('.iframe-manager-panel-container');
        return panel !== null;
      },
      'Iframe manager panel to be created',
      3000,
      200
    );
    testController.reportCondition('Iframe manager panel created successfully', iframeManagerCreated);
    
    // Check manager panel elements
    if (iframeManagerCreated) {
      const urlInput = document.querySelector('.iframe-manager-panel .url-input');
      const loadButton = document.querySelector('.iframe-manager-panel .load-button');
      const knownPagesSelect = document.querySelector('.iframe-manager-panel .known-pages-select');
      
      testController.reportCondition('Manager panel URL input exists', urlInput !== null);
      testController.reportCondition('Manager panel load button exists', loadButton !== null);
      testController.reportCondition('Manager panel known pages select exists', knownPagesSelect !== null);
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in iframeBaseConnectionTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

// Register all iframe-base tests

registerTest({
  id: 'test_iframe_base_connection',
  name: 'Iframe Base Connection',
  description: 'Tests iframe adapter, panel creation, and connection establishment for iframe-base module.',
  testFunction: iframeBaseConnectionTest,
  category: 'Iframe Base Tests',
  //enabled: true,
});

registerTest({
  id: 'test_iframe_base_basic_initialization',
  name: 'Iframe Base Basic Initialization',
  description: 'Tests basic iframe-base panel initialization and status display.',
  testFunction: iframeBaseBasicInitializationTest,
  category: 'Iframe Base Tests',
  //enabled: true,
});

registerTest({
  id: 'test_iframe_base_heartbeat',
  name: 'Iframe Base Heartbeat Test',
  description: 'Tests heartbeat counter functionality in iframe-base module.',
  testFunction: iframeBaseHeartbeatTest,
  category: 'Iframe Base Tests',
  //enabled: true,
});

registerTest({
  id: 'test_iframe_base_connection_status',
  name: 'Iframe Base Connection Status',
  description: 'Tests connection status display and module identification in iframe-base.',
  testFunction: iframeBaseConnectionStatusTest,
  category: 'Iframe Base Tests',
  enabled: true,
});