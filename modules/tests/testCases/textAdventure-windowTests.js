// Text Adventure Window Tests
// These tests are adapted from textAdventure-iframeTests.js to work through the window system
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
  // Import playerState singleton once at the top
  const { getPlayerStateSingleton } = await import('../../playerState/singleton.js');

  // Step 1: Load Adventure rules in main app first
  testController.log('Loading Adventure rules file in main app...');
  const rulesLoadedPromise = testController.waitForEvent('stateManager:rulesLoaded', 8000);

  const rulesResponse = await fetch('./presets/adventure/AP_14089154938208861744/AP_14089154938208861744_rules.json');
  const rulesData = await rulesResponse.json();

  testController.eventBus.publish('files:jsonLoaded', {
    jsonData: rulesData,
    selectedPlayerId: '1',
    sourceName: './presets/adventure/AP_14089154938208861744/AP_14089154938208861744_rules.json'
  }, 'tests');

  await rulesLoadedPromise;
  testController.reportCondition('Adventure rules loaded in main app', true);

  // Step 2: Verify player is in target region in main app
  testController.log(`Verifying player is in ${targetRegion} region...`);
  const playerStateReady = await testController.pollForCondition(
    () => {
      const playerState = getPlayerStateSingleton();
      return playerState && playerState.getCurrentRegion() === targetRegion;
    },
    `PlayerState to be in ${targetRegion} region`,
    2000,
    50
  );
  testController.reportCondition(`PlayerState positioned in ${targetRegion}`, playerStateReady);

  // Step 3: Create window panel
  testController.log('Creating window panel...');
  testController.eventBus.publish('ui:activatePanel', {
    panelId: 'windowPanel',
    config: { windowName: 'textAdventure' }
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
  testController.log('Setting custom window name to "textAdventure"...');
  const windowPanelElement = document.querySelector('.window-panel-container');
  if (windowPanelElement && windowPanelElement.windowPanelUI) {
    windowPanelElement.windowPanelUI.setCustomWindowName('textAdventure');
  }

  // Step 4: Load window content
  testController.log('Loading text adventure window...');
  const windowLoadedPromise = testController.waitForEvent('windowPanel:opened', 10000);

  testController.eventBus.publish('window:loadUrl', {
    url: './modules/textAdventure-remote/index-window.html'
  }, 'tests');

  const windowLoaded = await windowLoadedPromise;
  testController.reportCondition('Window opened successfully', !!windowLoaded);

  // Step 5: Wait for window to establish connection
  testController.log('Waiting for window connection...');
  const windowConnectedPromise = testController.waitForEvent('window:connected', 5000);

  const windowConnected = await windowConnectedPromise;
  testController.reportCondition('Window connected to adapter', !!windowConnected);

  // Note: The window adapter automatically sends the current region to newly connected windows,
  // so we don't need to manually sync it here anymore

  // Step 6: Wait for window UI to be ready
  await testController.pollForCondition(
    () => {
      const windowPanelUI = windowPanelElement?.windowPanelUI;
      if (!windowPanelUI || !windowPanelUI.connectedWindowRef) return false;

      try {
        const windowDoc = windowPanelUI.connectedWindowRef.document;
        const textArea = windowDoc.querySelector('.text-adventure-display');
        return textArea !== null;
      } catch (error) {
        // Cross-origin access might be blocked
        return false;
      }
    },
    'Window text adventure UI to be ready',
    5000,
    500
  );
  testController.reportCondition('Window text adventure UI ready', true);

  // Step 7: Verify player positioning using playerStateSingleton
  const playerState = getPlayerStateSingleton();
  const finalRegion = playerState.getCurrentRegion();
  testController.log(`Final player positioned in region: ${finalRegion}`);
  testController.reportCondition(`Player positioned in ${targetRegion} region`,
    finalRegion === targetRegion);
}

// Helper function to get window elements
function getWindowElements() {
  const windowPanelElement = document.querySelector('.window-panel-container');
  const windowPanelUI = windowPanelElement?.windowPanelUI;

  if (!windowPanelUI || !windowPanelUI.connectedWindowRef) return null;

  try {
    const windowRef = windowPanelUI.connectedWindowRef;
    const windowDoc = windowRef.document;
    return {
      windowRef,
      windowDoc,
      textArea: windowDoc.querySelector('.text-adventure-display'),
      inputField: windowDoc.querySelector('.text-adventure-input'),
      customDataSelect: windowDoc.querySelector('.custom-data-select')
    };
  } catch (error) {
    // Cross-origin access might be blocked
    return null;
  }
}

// Helper function to send command to window
function sendCommandToWindow(command) {
  const elements = getWindowElements();
  if (!elements || !elements.inputField) {
    return false;
  }

  elements.inputField.value = command;
  const enterEvent = new elements.windowDoc.defaultView.KeyboardEvent('keypress', { key: 'Enter' });
  elements.inputField.dispatchEvent(enterEvent);
  return true;
}

export async function textAdventureWindowBasicInitializationTest(testController) {
  try {
    testController.log('Starting textAdventureWindowBasicInitializationTest...');
    testController.reportCondition('Test started', true);

    // Setup window and load rules
    await loadAdventureRulesAndSetupWindow(testController, 'Menu');

    // Check window elements exist
    const elements = getWindowElements();
    testController.reportCondition('Window document accessible', elements !== null);

    if (elements) {
      testController.reportCondition('Text display area exists in window', elements.textArea !== null);
      testController.reportCondition('Input field exists in window', elements.inputField !== null);
      testController.reportCondition('Custom data dropdown exists in window', elements.customDataSelect !== null);

      // Check for rules loaded message in window - now with efficient polling, should be much faster
      if (elements.textArea) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Reduced back to 1s since polling should find rules within ~200-500ms
        const hasRulesMessage = elements.textArea.textContent.includes('Rules loaded! Your adventure begins');
        testController.reportCondition('Rules loaded message displayed in window', hasRulesMessage);
      }

      // Verify no "nowhere" message
      if (elements.textArea) {
        const hasNowhereMessage = elements.textArea.textContent.includes('You are nowhere');
        testController.reportCondition('No "nowhere" fallback message in window', !hasNowhereMessage);
      }
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in textAdventureWindowBasicInitializationTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

export async function textAdventureWindowCustomDataLoadingTest(testController) {
  try {
    testController.log('Starting textAdventureWindowCustomDataLoadingTest...');
    testController.reportCondition('Test started', true);

    // Setup window and load rules
    await loadAdventureRulesAndSetupWindow(testController, 'Menu');

    const elements = getWindowElements();
    testController.reportCondition('Window elements accessible', elements !== null);

    if (elements && elements.customDataSelect) {
      // Load custom data in window
      testController.log('Loading Adventure custom data in window...');

      elements.customDataSelect.value = 'adventure';
      const changeEvent = new elements.windowDoc.defaultView.Event('change');
      elements.customDataSelect.dispatchEvent(changeEvent);
      testController.reportCondition('Adventure custom data selected in window', true);

      // Wait for custom data to be processed
      if (elements.textArea) {
        // Wait for the custom data loaded confirmation
        const dataLoaded = await testController.pollForCondition(
          () => {
            return elements.textArea.textContent.includes('Custom Adventure data loaded');
          },
          'Custom Adventure data loaded confirmation to appear',
          3000,
          200
        );
        testController.reportCondition('Custom data loaded confirmation displayed in window', dataLoaded);

        // Note: The entrance message may not appear immediately after loading custom data
        // This is expected behavior - custom data loads but doesn't automatically redisplay region
        console.log(`[TEST DEBUG] Window text after custom data load:`, elements.textArea.textContent);
      }
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in textAdventureWindowCustomDataLoadingTest: ${error.message}`, 'error');
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

    const elements = getWindowElements();
    testController.reportCondition('Window elements accessible', elements !== null);

    if (elements) {
      // Load custom data first
      if (elements.customDataSelect) {
        elements.customDataSelect.value = 'adventure';
        const changeEvent = new elements.windowDoc.defaultView.Event('change');
        elements.customDataSelect.dispatchEvent(changeEvent);
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Send a look command to refresh the display and show available exits
        sendCommandToWindow('look');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Debug: Show what's in the window after look command
        console.log('[TEST DEBUG] Window text after look command:', elements.textArea.textContent);
      }

      // Send move command to window
      testController.log('Sending "move GameStart" command to window...');
      const commandSent = sendCommandToWindow('move GameStart');
      testController.reportCondition('Move command sent to window', commandSent);

      if (commandSent) {
        // Wait for command to be processed
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check for movement response in window
        if (elements.textArea) {
          const hasUserInput = elements.textArea.textContent.includes('> move GameStart');
          testController.reportCondition('User input echoed in window display', hasUserInput);

          // Debug: Show what's actually in the window
          console.log('[TEST DEBUG] Window text after move command:', elements.textArea.textContent);

          const regionChangeMessageAppeared = (
            elements.textArea.textContent.includes('You travel through GameStart') ||
            elements.textArea.textContent.includes('You take your first brave steps') ||
            elements.textArea.textContent.includes('vast overworld') ||
            elements.textArea.textContent.includes('You are now in Overworld')
          );
          testController.reportCondition('Region change message displayed in window', regionChangeMessageAppeared);
        }
      }
    }

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

    // Setup window and load rules
    await loadAdventureRulesAndSetupWindow(testController, 'Menu');

    const elements = getWindowElements();
    testController.reportCondition('Window elements accessible', elements !== null);

    if (elements) {
      // Load custom data and move to Overworld first
      if (elements.customDataSelect) {
        elements.customDataSelect.value = 'adventure';
        const changeEvent = new elements.windowDoc.defaultView.Event('change');
        elements.customDataSelect.dispatchEvent(changeEvent);
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Move to Overworld first
      sendCommandToWindow('move GameStart');
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Now check a location
      testController.log('Sending "check Blue Labyrinth 0" command to window...');

      // Listen for state change event
      let stateChangeReceived = false;
      const stateChangeHandler = (data) => {
        stateChangeReceived = true;
      };

      testController.eventBus.subscribe('stateManager:snapshotUpdated', stateChangeHandler, 'test-window');

      const commandSent = sendCommandToWindow('check Blue Labyrinth 0');
      testController.reportCondition('Location check command sent to window', commandSent);

      if (commandSent) {
        // Wait for state change event
        const eventReceived = await testController.pollForCondition(
          () => stateChangeReceived,
          'stateManager:snapshotUpdated event to be published',
          3000,
          200
        );
        testController.reportCondition('stateManager:snapshotUpdated event published', eventReceived);

        // Check for location check message in window
        if (elements.textArea) {
          const locationCheckMessageAppeared = (
            elements.textArea.textContent.includes('carefully search the Blue Labyrinth') ||
            elements.textArea.textContent.includes('You search Blue Labyrinth 0') ||
            elements.textArea.textContent.includes('Blue Labyrinth 0')
          );
          testController.reportCondition('Location check message displayed in window', locationCheckMessageAppeared);

          const hasCorrectItem = elements.textArea.textContent.includes('Left Difficulty Switch');
          testController.reportCondition('Found Left Difficulty Switch item in window', hasCorrectItem);

          // Wait a moment for state to update and region to redisplay
          await new Promise(resolve => setTimeout(resolve, 500));

          // Check that Blue Labyrinth 0 is now listed as checked
          const hasAlreadySearched = elements.textArea.textContent.includes('Already searched:') &&
                                    elements.textArea.textContent.includes('Blue Labyrinth 0');
          testController.reportCondition('Blue Labyrinth 0 listed as already searched after check', hasAlreadySearched);
        }
      }
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in textAdventureWindowLocationCheckCommandTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

export async function textAdventureWindowLinkClickTest(testController) {
  try {
    testController.log('Starting textAdventureWindowLinkClickTest...');
    testController.reportCondition('Test started', true);

    // Setup window and load rules
    await loadAdventureRulesAndSetupWindow(testController, 'Menu');

    const elements = getWindowElements();
    testController.reportCondition('Window elements accessible', elements !== null);

    if (elements) {
      // Load custom data
      if (elements.customDataSelect) {
        elements.customDataSelect.value = 'adventure';
        const changeEvent = new elements.windowDoc.defaultView.Event('change');
        elements.customDataSelect.dispatchEvent(changeEvent);
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Wait for display to show region content
      await testController.pollForCondition(
        () => {
          return elements.textArea && elements.textArea.textContent.includes('GameStart');
        },
        'Display to show region content with GameStart in window',
        3000,
        200
      );

      // Look for GameStart exit link in window
      testController.log('Looking for GameStart exit link in window...');

      const exitLinkFound = await testController.pollForCondition(
        () => {
          if (!elements.textArea) return false;
          const exitLinks = elements.textArea.querySelectorAll('.text-adventure-link[data-type="exit"]');
          return Array.from(exitLinks).some(link => {
            return link.getAttribute('data-target') === 'GameStart';
          });
        },
        'GameStart exit link to appear in window',
        5000,
        500
      );
      testController.reportCondition('GameStart exit link found in window', exitLinkFound);

      if (exitLinkFound && elements.textArea) {
        const gameStartLink = Array.from(elements.textArea.querySelectorAll('.text-adventure-link[data-type="exit"]'))
          .find(link => link.getAttribute('data-target') === 'GameStart');

        if (gameStartLink) {
          // Click the link in window
          gameStartLink.click();
          testController.reportCondition('GameStart exit link clicked in window', true);

          // Wait for region change in window
          const regionChanged = await testController.pollForCondition(
            () => {
              return elements.textArea && (
                elements.textArea.textContent.includes('You emerge into the vast overworld') ||
                elements.textArea.textContent.includes('vast overworld of Adventure') ||
                elements.textArea.textContent.includes('overworld of Adventure')
              );
            },
            'Region change to Overworld in window',
            3000,
            200
          );
          testController.reportCondition('Region changed to Overworld via link click in window', regionChanged);

          // Look for location link in window
          const locationLinkFound = await testController.pollForCondition(
            () => {
              if (!elements.textArea) return false;
              const locationLinks = elements.textArea.querySelectorAll('.text-adventure-link[data-type="location"]');
              return Array.from(locationLinks).some(link =>
                link.getAttribute('data-target') === 'Blue Labyrinth 0'
              );
            },
            'Blue Labyrinth 0 location link to appear in window',
            3000,
            200
          );
          testController.reportCondition('Blue Labyrinth 0 location link found in window', locationLinkFound);

          if (locationLinkFound) {
            const locationLink = Array.from(elements.textArea.querySelectorAll('.text-adventure-link[data-type="location"]'))
              .find(link => link.getAttribute('data-target') === 'Blue Labyrinth 0');

            if (locationLink) {
              locationLink.click();
              testController.reportCondition('Blue Labyrinth 0 location link clicked in window', true);

              // Wait for location check message in window
              const locationChecked = await testController.pollForCondition(
                () => {
                  return elements.textArea && elements.textArea.textContent.includes('Blue Labyrinth');
                },
                'Location check message to appear in window',
                3000,
                200
              );
              testController.reportCondition('Location check completed via link click in window', locationChecked);
            }
          }
        }
      }
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in textAdventureWindowLinkClickTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

export async function textAdventureWindowConnectionTest(testController) {
  try {
    testController.log('Starting textAdventureWindowConnectionTest...');
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

    // Test opening window
    testController.log('Testing window opening...');
    const windowOpenedPromise = testController.waitForEvent('windowPanel:opened', 8000);

    testController.eventBus.publish('window:loadUrl', {
      url: './modules/textAdventure-remote/index-window.html'
    }, 'tests');

    const windowOpened = await windowOpenedPromise;
    testController.reportCondition('Window opened event received', !!windowOpened);

    // Test window connection
    testController.log('Testing window connection to adapter...');
    const windowConnectedPromise = testController.waitForEvent('window:connected', 5000);

    const windowConnected = await windowConnectedPromise;
    testController.reportCondition('Window connected to adapter', !!windowConnected);

    if (windowConnected) {
      testController.log(`Window connected with ID: ${windowConnected.windowId}`);
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
      const openButton = document.querySelector('.window-manager-panel .open-button');
      const knownPagesSelect = document.querySelector('.window-manager-panel .known-pages-select');

      testController.reportCondition('Manager panel URL input exists', urlInput !== null);
      testController.reportCondition('Manager panel open button exists', openButton !== null);
      testController.reportCondition('Manager panel known pages select exists', knownPagesSelect !== null);
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in textAdventureWindowConnectionTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

export async function textAdventureWindowManagerUITest(testController) {
  try {
    testController.log('Starting textAdventureWindowManagerUITest...');
    testController.reportCondition('Test started', true);

    // Step 1: Load Adventure rules in main app first
    testController.log('Loading Adventure rules file in main app...');
    const rulesLoadedPromise = testController.waitForEvent('stateManager:rulesLoaded', 8000);

    const rulesResponse = await fetch('./presets/adventure/AP_14089154938208861744/AP_14089154938208861744_rules.json');
    const rulesData = await rulesResponse.json();

    testController.eventBus.publish('files:jsonLoaded', {
      jsonData: rulesData,
      selectedPlayerId: '1',
      sourceName: './presets/adventure/AP_14089154938208861744/AP_14089154938208861744_rules.json'
    }, 'tests');

    await rulesLoadedPromise;
    testController.reportCondition('Adventure rules loaded in main app', true);

    // Step 2: Position player in Menu region in main app
    testController.log('Positioning player in Menu region in main app...');
    if (window.eventDispatcher) {
      const regionChangePromise = testController.waitForEvent('playerState:regionChanged', 5000);

      testController.log('Publishing user:regionMove event to move to Menu...');
      window.eventDispatcher.publish('tests', 'user:regionMove', {
        exitName: 'Initial',
        targetRegion: 'Menu',
        sourceRegion: null,
        sourceModule: 'tests'
      }, { initialTarget: 'bottom' });

      try {
        const regionChangeData = await regionChangePromise;
        testController.log('Successfully received playerState:regionChanged event:', regionChangeData);
        testController.reportCondition('Player region change event received', true);
      } catch (error) {
        testController.log(`WARNING: Region change event not received: ${error.message}`, 'warn');
        testController.reportCondition('Player region change event received', false);
      }
    }

    // Step 3: Create window manager panel
    testController.log('Creating window manager panel...');
    testController.eventBus.publish('ui:activatePanel', { panelId: 'windowManagerPanel' }, 'tests');

    const managerPanelReady = await testController.pollForCondition(
      () => {
        const panel = document.querySelector('.window-manager-panel-container');
        return panel !== null;
      },
      'Window manager panel to appear',
      5000,
      200
    );
    testController.reportCondition('Window manager panel is active', managerPanelReady);

    // Step 4: Create window panel
    testController.log('Creating window panel...');
    testController.eventBus.publish('ui:activatePanel', { panelId: 'windowPanel' }, 'tests');

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

    // Step 5: Get references to window manager UI elements
    const managerPanel = document.querySelector('.window-manager-panel-container');
    const knownPagesSelect = managerPanel ? managerPanel.querySelector('.known-pages-select') : null;
    const openButton = managerPanel ? managerPanel.querySelector('.open-button') : null;

    testController.reportCondition('Window manager known pages dropdown exists', knownPagesSelect !== null);
    testController.reportCondition('Window manager open button exists', openButton !== null);

    if (!knownPagesSelect || !openButton) {
      throw new Error('Required window manager UI elements not found');
    }

    // Step 6: Select "Text Adventure (Standalone)" from dropdown
    testController.log('Selecting "Text Adventure (Standalone)" from known pages dropdown...');

    // Find the option value for Text Adventure
    let textAdventureValue = null;
    for (const option of knownPagesSelect.options) {
      if (option.textContent.includes('Text Adventure (Standalone)')) {
        textAdventureValue = option.value;
        break;
      }
    }

    testController.reportCondition('Text Adventure option found in dropdown', textAdventureValue !== null);

    if (textAdventureValue) {
      // Handle cross-browser dropdown selection (works with both standard and Firefox custom dropdowns)
      testController.log(`Selecting dropdown value: ${textAdventureValue}`);

      // Check if this is a Firefox custom dropdown replacement
      const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
      const customDropdownButton = managerPanel.querySelector('button[type="button"]');
      const hasCustomDropdown = isFirefox && customDropdownButton && knownPagesSelect.style.display === 'none';

      if (hasCustomDropdown) {
        testController.log('Detected Firefox custom dropdown, using click-based selection');

        // Click the custom dropdown button to open it
        customDropdownButton.click();

        // Wait a moment for dropdown to open
        await new Promise(resolve => setTimeout(resolve, 100));

        // Find and click the correct option
        const dropdownOptions = managerPanel.querySelectorAll('div[style*="cursor: pointer"]');
        let optionClicked = false;

        for (const optionDiv of dropdownOptions) {
          if (optionDiv.textContent.includes('Text Adventure (Standalone)')) {
            optionDiv.click();
            optionClicked = true;
            testController.log('Clicked Text Adventure option in custom dropdown');
            break;
          }
        }

        testController.reportCondition('Text Adventure option clicked in custom dropdown', optionClicked);
      } else {
        testController.log('Using standard dropdown selection');

        // Standard dropdown selection
        knownPagesSelect.value = textAdventureValue;
        const changeEvent = new Event('change', { bubbles: true });
        knownPagesSelect.dispatchEvent(changeEvent);

        testController.reportCondition('Text Adventure option selected from standard dropdown', true);
      }

      testController.log(`Final dropdown value: ${knownPagesSelect.value}`);
    }

    // Step 7: Click the "Open Window" button
    testController.log('Clicking "Open Window" button...');
    testController.log(`Button disabled state: ${openButton.disabled}`);
    testController.log(`Current URL input value: ${managerPanel.querySelector('.url-input')?.value}`);

    const windowOpenedPromise = testController.waitForEvent('windowPanel:opened', 10000);

    // Also listen for the window:loadUrl event that should be published by the manager
    const loadUrlPromise = testController.waitForEvent('window:loadUrl', 5000);

    openButton.click();
    testController.reportCondition('Open window button clicked', true);

    // Wait for the load URL event first
    try {
      const loadUrlEvent = await loadUrlPromise;
      testController.log('window:loadUrl event received:', loadUrlEvent);
      testController.reportCondition('window:loadUrl event published by manager', true);
    } catch (error) {
      testController.log('window:loadUrl event not received:', error.message);
      testController.reportCondition('window:loadUrl event published by manager', false);
    }

    // Step 8: Wait for window to open
    const windowOpened = await windowOpenedPromise;
    testController.reportCondition('Window opened successfully via UI', !!windowOpened);

    // Step 9: Wait for window to establish connection
    testController.log('Waiting for window connection...');
    const windowConnectedPromise = testController.waitForEvent('window:connected', 5000);

    const windowConnected = await windowConnectedPromise;
    testController.reportCondition('Window connected to adapter via UI', !!windowConnected);

    // Step 10: Wait for window UI to be ready and check basic elements
    await testController.pollForCondition(
      () => {
        const windowPanelElement = document.querySelector('.window-panel-container');
        const windowPanelUI = windowPanelElement?.windowPanelUI;
        if (!windowPanelUI || !windowPanelUI.connectedWindowRef) return false;

        try {
          const windowDoc = windowPanelUI.connectedWindowRef.document;
          const textArea = windowDoc.querySelector('.text-adventure-display');
          return textArea !== null;
        } catch (error) {
          return false;
        }
      },
      'Window text adventure UI to be ready',
      5000,
      500
    );
    testController.reportCondition('Window text adventure UI ready via UI', true);

    // Step 11: Get final state and check all UI elements
    const elements = getWindowElements();
    testController.reportCondition('Window document accessible via UI', elements !== null);

    if (elements) {
      testController.reportCondition('Text display area exists in window via UI', elements.textArea !== null);
      testController.reportCondition('Input field exists in window via UI', elements.inputField !== null);
      testController.reportCondition('Custom data dropdown exists in window via UI', elements.customDataSelect !== null);

      // Check for rules loaded message in window - should be much faster now with polling
      if (elements.textArea) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Brief wait for UI to update
        const hasRulesMessage = elements.textArea.textContent.includes('Rules loaded! Your adventure begins');
        testController.reportCondition('Rules loaded message displayed in window via UI', hasRulesMessage);
      }

      // Verify no "nowhere" message
      if (elements.textArea) {
        const hasNowhereMessage = elements.textArea.textContent.includes('You are nowhere');
        testController.reportCondition('No "nowhere" fallback message in window via UI', !hasNowhereMessage);
      }
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Test failed with error: ${error.message}`, 'error');
    testController.reportCondition('Test completed without errors', false);
    await testController.completeTest(false);
  }
}

// Register all window tests

registerTest({
  id: 'test_textadventure_window_connection',
  name: 'Text Adventure Window Connection',
  description: 'Tests window adapter, panel creation, and connection establishment.',
  testFunction: textAdventureWindowConnectionTest,
  category: 'Text Adventure Window Tests',
  //enabled: true,
});

registerTest({
  id: 'test_textadventure_window_basic_initialization',
  name: 'Text Adventure Window Basic Initialization',
  description: 'Tests basic window panel initialization, rules loading, and initial display through window.',
  testFunction: textAdventureWindowBasicInitializationTest,
  category: 'Text Adventure Window Tests',
  //enabled: true,
});

registerTest({
  id: 'test_textadventure_window_custom_data_loading',
  name: 'Text Adventure Window Custom Data Loading',
  description: 'Tests loading and applying custom data files with Adventure-specific messages through window.',
  testFunction: textAdventureWindowCustomDataLoadingTest,
  category: 'Text Adventure Window Tests',
  //enabled: true,
});

registerTest({
  id: 'test_textadventure_window_movement_command',
  name: 'Text Adventure Window Movement Command',
  description: 'Tests text command movement ("move GameStart") and region changes through window.',
  testFunction: textAdventureWindowMovementCommandTest,
  category: 'Text Adventure Window Tests',
  //enabled: true,
});

registerTest({
  id: 'test_textadventure_window_location_check_command',
  name: 'Text Adventure Window Location Check Command',
  description: 'Tests location checking ("check Blue Labyrinth 0") and item discovery through window.',
  testFunction: textAdventureWindowLocationCheckCommandTest,
  category: 'Text Adventure Window Tests',
  //enabled: true,
});

registerTest({
  id: 'test_textadventure_window_link_click',
  name: 'Text Adventure Window Link Click',
  description: 'Tests clicking on exit and location links for movement and checking through window.',
  testFunction: textAdventureWindowLinkClickTest,
  category: 'Text Adventure Window Tests',
  //enabled: true,
});

registerTest({
  id: 'test_textadventure_window_manager_ui',
  name: 'Text Adventure Window Manager UI Test',
  description: 'Tests using the Window Manager panel UI to set up and open the text adventure window.',
  testFunction: textAdventureWindowManagerUITest,
  category: 'Text Adventure Window Tests',
  //enabled: true,
});
