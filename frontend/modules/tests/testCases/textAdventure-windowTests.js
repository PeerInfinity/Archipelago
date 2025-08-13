// Text Adventure Window Tests
// These tests are adapted from textAdventure-iframeTests.js to work through the window adapter system
import { registerTest } from '../testRegistry.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('textAdventure-windowTests', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[textAdventure-windowTests] ${message}`, ...data);
  }
}

// Helper function to load Adventure rules and set up window
async function loadAdventureRulesAndSetupWindow(testController, targetRegion = 'Menu') {
  // Step 1: Load Adventure rules in main app first
  testController.log('Loading Adventure rules file in main app...');
  const rulesLoadedPromise = testController.waitForEvent('stateManager:rulesLoaded', 8000);
  
  const rulesResponse = await fetch('./presets/adventure/AP_14089154938208861744/AP_14089154938208861744_rules.json');
  const rulesData = await rulesResponse.json();
  
  testController.eventBus.publish('files:jsonLoaded', {
    fileName: 'AP_14089154938208861744_rules.json',
    jsonData: rulesData,
    selectedPlayerId: '1'
  }, 'tests');
  
  await rulesLoadedPromise;
  testController.reportCondition('Adventure rules loaded in main app', true);
  
  // Step 2: Position player in target region in main app
  testController.log(`Positioning player in ${targetRegion} region in main app...`);
  if (window.eventDispatcher) {
    const regionChangePromise = testController.waitForEvent('playerState:regionChanged', 5000);
    
    testController.log(`Publishing user:regionMove event to move to ${targetRegion}...`);
    window.eventDispatcher.publish('tests', 'user:regionMove', {
      exitName: 'Initial',
      targetRegion: targetRegion,
      sourceRegion: null,
      sourceModule: 'tests'
    }, { initialTarget: 'bottom' });
    
    try {
      const regionChangeData = await regionChangePromise;
      testController.log(`Successfully received playerState:regionChanged event:`, regionChangeData);
      testController.reportCondition('Player region change event received', true);
    } catch (error) {
      testController.log(`WARNING: Region change event not received: ${error.message}`, 'warn');
      testController.reportCondition('Player region change event received', false);
    }
  }
  
  // Step 3: Create window panel
  testController.log('Creating window panel...');
  testController.eventBus.publish('ui:activatePanel', { 
    panelId: 'windowPanel',
    config: { windowName: 'textAdventure-window' }
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
  
  // Step 3.5: Set custom window name
  testController.log('Setting custom window name to "textAdventure-window"...');
  const windowPanelElement = document.querySelector('.window-panel-container');
  if (windowPanelElement && windowPanelElement.windowPanelUI) {
    windowPanelElement.windowPanelUI.setCustomWindowName('textAdventure-window');
  }
  
  // Step 4: Open window content
  testController.log('Opening text adventure window...');
  const windowOpenedPromise = testController.waitForEvent('windowPanel:opened', 10000);
  
  testController.eventBus.publish('window:loadUrl', {
    url: './modules/textAdventure-window/index.html?heartbeatInterval=3000'
  }, 'tests');
  
  const windowOpened = await windowOpenedPromise;
  testController.reportCondition('Window opened successfully', !!windowOpened);
  
  // Step 5: Wait for window to establish connection
  testController.log('Waiting for window connection...');
  const windowConnectedPromise = testController.waitForEvent('window:connected', 5000);
  
  const windowConnected = await windowConnectedPromise;
  testController.reportCondition('Window connected to adapter', !!windowConnected);
  
  // Step 6: Verify player positioning using playerStateSingleton
  const { getPlayerStateSingleton } = await import('../../playerState/singleton.js');
  const playerState = getPlayerStateSingleton();
  const currentRegion = playerState.getCurrentRegion();
  testController.log(`Final player positioned in region: ${currentRegion}`);
  testController.reportCondition(`Player positioned in ${targetRegion} region`, 
    currentRegion === targetRegion);
}

// Note: We cannot directly access separate window DOM like iframes due to cross-window restrictions
// So assertions will be focused on connection events and main app effects from commands

// Helper function to send command to window via eventBus
function sendCommandToWindow(command) {
  const windowPanelElement = document.querySelector('.window-panel-container');
  if (!windowPanelElement || !windowPanelElement.windowPanelUI) return false;
  // We cannot inject into remote window input field; instead we publish appropriate events through dispatcher
  // But the window Text Adventure listens to eventBus and dispatcher; user input is local to the window.
  // For testing, we simulate by publishing the same dispatcher events the window would publish.
  if (command.startsWith('move ')) {
    const exitName = command.slice(5);
    window.eventDispatcher.publish('tests', 'user:regionMove', {
      exitName,
      targetRegion: null,
      sourceRegion: null,
      sourceModule: 'tests'
    }, { initialTarget: 'bottom' });
    return true;
  }
  if (command.startsWith('check ')) {
    const locationName = command.slice(6);
    window.eventDispatcher.publish('tests', 'user:locationCheck', {
      locationName,
      sourceModule: 'tests'
    }, { initialTarget: 'bottom' });
    return true;
  }
  return false;
}

export async function textAdventureWindowBasicInitializationTest(testController) {
  try {
    testController.log('Starting textAdventureWindowBasicInitializationTest...');
    testController.reportCondition('Test started', true);

    // Setup window and load rules
    await loadAdventureRulesAndSetupWindow(testController, 'Menu');

    // Verify window panel shows connected
    const windowPanel = document.querySelector('.window-panel-container');
    testController.reportCondition('Window panel exists', windowPanel !== null);

    // Confirm connection status text shows connected
    const connectionStatusValue = windowPanel?.querySelector('.connection-status-value');
    if (connectionStatusValue) {
      const statusText = connectionStatusValue.textContent;
      testController.reportCondition('Connection status shows connected', statusText === 'Connected');
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in textAdventureWindowBasicInitializationTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

export async function textAdventureWindowMovementCommandTest(testController) {
  try {
    testController.log('Starting textAdventureWindowMovementCommandTest...');
    testController.reportCondition('Test started', true);

    // Setup window and load rules
    await loadAdventureRulesAndSetupWindow(testController, 'Menu');

    // Wait for window opened event explicitly if not already handled
    const windowOpenedPromise = testController.waitForEvent('windowPanel:opened', 10000);
    // Trigger open again to ensure the event fires in this test scope (idempotent if already open)
    testController.eventBus.publish('window:loadUrl', {
      url: './modules/textAdventure-window/index.html?heartbeatInterval=3000'
    }, 'tests');
    await windowOpenedPromise;
    testController.reportCondition('Window opened (movement test)', true);

    // Wait for connection
    const windowConnectedPromise = testController.waitForEvent('window:connected', 5000);
    const windowConnected = await windowConnectedPromise;
    testController.reportCondition('Window connected (movement test)', !!windowConnected);

    // Simulate move command by publishing dispatcher event after window is ready
    const movePublished = sendCommandToWindow('move North');
    testController.reportCondition('Move command published to dispatcher', movePublished);

    // Wait for a region change
    const regionChanged = await testController.waitForEvent('playerState:regionChanged', 5000);
    testController.reportCondition('Region change received after move command', !!regionChanged);

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in textAdventureWindowMovementCommandTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

export async function textAdventureWindowLocationCheckCommandTest(testController) {
  try {
    testController.log('Starting textAdventureWindowLocationCheckCommandTest...');
    testController.reportCondition('Test started', true);

    await loadAdventureRulesAndSetupWindow(testController, 'Menu');

    // Simulate check command by publishing dispatcher event
    const checkPublished = sendCommandToWindow('check A Chest');
    testController.reportCondition('Check command published to dispatcher', checkPublished);

    // Expect a snapshotUpdated event soon after
    const snapshotUpdated = await testController.waitForEvent('stateManager:snapshotUpdated', 5000);
    testController.reportCondition('State snapshot updated after check command', !!snapshotUpdated);

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in textAdventureWindowLocationCheckCommandTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

export async function textAdventureWindowErrorHandlingTest(testController) {
  try {
    testController.log('Starting textAdventureWindowErrorHandlingTest...');
    testController.reportCondition('Test started', true);

    // Setup window and load rules
    await loadAdventureRulesAndSetupWindow(testController, 'Menu');

    // Ensure window is opened and connected
    const windowOpenedPromise = testController.waitForEvent('windowPanel:opened', 10000);
    testController.eventBus.publish('window:loadUrl', {
      url: './modules/textAdventure-window/index.html?heartbeatInterval=3000'
    }, 'tests');
    await windowOpenedPromise;
    testController.reportCondition('Window opened (error test)', true);

    const windowConnectedPromise = testController.waitForEvent('window:connected', 5000);
    const windowConnected = await windowConnectedPromise;
    testController.reportCondition('Window connected (error test)', !!windowConnected);

    // Publish an invalid move to ensure no crash and no regionChanged
    const movePublished = sendCommandToWindow('move NonexistentExit');
    testController.reportCondition('Invalid move published', movePublished);
    
    // Wait briefly to see that no region change occurs
    const regionChangePromise = testController.waitForEvent('playerState:regionChanged', 1500);
    let gotRegionChange = false;
    try {
      await regionChangePromise;
      gotRegionChange = true;
    } catch (e) {
      gotRegionChange = false;
    }
    testController.reportCondition('No region change occurred for invalid exit', !gotRegionChange);

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in textAdventureWindowErrorHandlingTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

// Register tests
registerTest({
  id: 'test_textadventure_window_basic_initialization',
  name: 'Text Adventure Window Basic Initialization',
  testFunction: textAdventureWindowBasicInitializationTest,
  category: 'Text Adventure Window Tests'
});

registerTest({
  id: 'test_textadventure_window_movement_command',
  name: 'Text Adventure Window Movement Command',
  testFunction: textAdventureWindowMovementCommandTest,
  category: 'Text Adventure Window Tests'
});

registerTest({
  id: 'test_textadventure_window_location_check_command',
  name: 'Text Adventure Window Location Check Command',
  testFunction: textAdventureWindowLocationCheckCommandTest,
  category: 'Text Adventure Window Tests'
});

registerTest({
  id: 'test_textadventure_window_error_handling',
  name: 'Text Adventure Window Error Handling',
  testFunction: textAdventureWindowErrorHandlingTest,
  category: 'Text Adventure Window Tests'
});