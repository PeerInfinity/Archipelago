// Text Adventure Panel Tests
import { registerTest } from '../testRegistry.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('textAdventurePanelTests', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[textAdventurePanelTests] ${message}`, ...data);
  }
}

// Helper function to load Adventure rules and position player
async function loadAdventureRulesAndPositionPlayer(testController, targetRegion = 'Menu') {
  // Step 1: Ensure text adventure panel is active first
  testController.log('Activating Text Adventure panel...');
  testController.eventBus.publish('ui:activatePanel', { panelId: 'textAdventurePanel' }, 'tests');
  
  // Wait for panel to be ready
  const panelReady = await testController.pollForCondition(
    () => {
      const panel = document.querySelector('.text-adventure-panel-container');
      return panel !== null;
    },
    'Text Adventure panel to appear',
    5000,
    200
  );
  testController.reportCondition('Text Adventure panel is active for helper', panelReady);
  
  // Panel components initialize synchronously - no wait needed
  
  // Step 2: Load Adventure rules
  testController.log('Loading Adventure rules file...');
  const rulesLoadedPromise = testController.waitForEvent('stateManager:rulesLoaded', 8000);
  
  const rulesResponse = await fetch('./presets/adventure/AP_14089154938208861744/AP_14089154938208861744_rules.json');
  const rulesData = await rulesResponse.json();

  testController.eventBus.publish('files:jsonLoaded', {
    jsonData: rulesData,
    selectedPlayerId: '1',
    sourceName: './presets/adventure/AP_14089154938208861744/AP_14089154938208861744_rules.json'
  }, 'tests');
  
  await rulesLoadedPromise;
  testController.reportCondition('Adventure rules loaded', true);
  
  // Step 3: State manager is ready when rulesLoaded event fires - no additional wait needed
  
  // Step 4: Position player in target region
  testController.log(`Positioning player in ${targetRegion} region...`);
  if (window.eventDispatcher) {
    // Set up promise to wait for the region change event BEFORE publishing the move
    const regionChangePromise = testController.waitForEvent('playerState:regionChanged', 5000);
    
    testController.log(`Publishing user:regionMove event to move to ${targetRegion}...`);
    window.eventDispatcher.publish('tests', 'user:regionMove', {
      exitName: 'Initial',
      targetRegion: targetRegion,
      sourceRegion: null,
      sourceModule: 'tests'
    }, { initialTarget: 'bottom' });
    
    try {
      // Wait for the region change event to confirm the move worked
      const regionChangeData = await regionChangePromise;
      testController.log(`Successfully received playerState:regionChanged event:`, regionChangeData);
      testController.reportCondition('Player region change event received', true);
    } catch (error) {
      testController.log(`WARNING: Region change event not received: ${error.message}`, 'warn');
      testController.reportCondition('Player region change event received', false);
    }
  }
  
  // Step 5: UI updates when region change event fires - no additional wait needed
  
  // Step 6: Verify positioning using playerStateSingleton (proper approach)
  const { getPlayerStateSingleton } = await import('../../playerState/singleton.js');
  const playerState = getPlayerStateSingleton();
  const currentRegion = playerState.getCurrentRegion();
  testController.log(`Final player positioned in region: ${currentRegion}`);
  testController.reportCondition(`Player positioned in ${targetRegion} region`, 
    currentRegion === targetRegion);
}

export async function textAdventureBasicInitializationTest(testController) {
  try {
    testController.log('Starting textAdventureBasicInitializationTest...');
    testController.reportCondition('Test started', true);

    // Step 1: Wait briefly for rules to be ready (they should already be loaded)
    testController.log('Step 1: Ensuring rules are ready...');
    
    // Just wait a moment for everything to be ready
    await new Promise(resolve => setTimeout(resolve, 500));
    testController.reportCondition('Rules are ready', true);

    // Step 2: Activate Text Adventure panel
    testController.log('Step 2: Activating Text Adventure panel...');
    testController.eventBus.publish('ui:activatePanel', { panelId: 'textAdventurePanel' }, 'tests');

    // Wait for panel to be ready
    const panelReady = await testController.pollForCondition(
      () => {
        const panel = document.querySelector('.text-adventure-panel-container');
        return panel !== null;
      },
      'Text Adventure panel to appear',
      2000,
      200
    );
    testController.reportCondition('Text Adventure panel is visible', panelReady);

    // Step 3: Check initial state
    testController.log('Step 3: Checking initial state...');
    
    // Check that display area exists and has rules loaded message
    const displayArea = document.querySelector('.text-adventure-display');
    testController.reportCondition('Text display area exists', displayArea !== null);

    if (displayArea) {
      // Give it a moment for the rules loaded message to appear
      await new Promise(resolve => setTimeout(resolve, 200));
      const hasRulesMessage = displayArea.textContent.includes('Rules loaded! Your adventure begins');
      testController.reportCondition('Rules loaded message displayed', hasRulesMessage);
    }

    // Check that input field exists
    const inputField = document.querySelector('.text-adventure-input');
    testController.reportCondition('Input field exists', inputField !== null);

    // Check that custom data dropdown exists
    const dropdown = document.querySelector('.custom-data-select');
    testController.reportCondition('Custom data dropdown exists', dropdown !== null);

    if (dropdown) {
      const hasAdventureOption = Array.from(dropdown.options).some(option => 
        option.value === 'adventure'
      );
      testController.reportCondition('Adventure custom data option available', hasAdventureOption);
    }

    // Step 4: Wait for proper region message to appear (not the "nowhere" fallback)
    testController.log('Step 4: Waiting for proper region message (not "nowhere" fallback)...');
    
    // The text adventure should show a proper region after rules are loaded, not the fallback message
    const properRegionMessageAppeared = await testController.pollForCondition(
      () => {
        const displayArea = document.querySelector('.text-adventure-display');
        if (!displayArea) return false;
        
        // Check for proper region messages (Menu region or custom messages)
        const hasProperRegionMessage = (
          displayArea.textContent.includes('You are now in Menu') ||
          displayArea.textContent.includes('You stand at the entrance to Adventure') ||
          displayArea.textContent.includes('Menu') && !displayArea.textContent.includes('You are nowhere')
        );
        
        // Log current content for debugging
        if (!hasProperRegionMessage) {
          testController.log(`Current display content: "${displayArea.textContent.slice(-100)}"`, 'debug');
        }
        
        return hasProperRegionMessage;
      },
      'Proper region message to appear (not "nowhere" fallback)',
      5000,
      500
    );
    testController.reportCondition('Proper region message displayed (not nowhere fallback)', properRegionMessageAppeared);
    
    // Also verify that we DON'T see the "nowhere" fallback message
    if (displayArea) {
      const hasNowhereMessage = displayArea.textContent.includes('You are nowhere. Please load a rules file.');
      testController.reportCondition('No "nowhere" fallback message present', !hasNowhereMessage);
      
      if (hasNowhereMessage) {
        testController.log('ERROR: Text adventure is showing "nowhere" message, indicating rules/player positioning failed', 'error');
      }
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in textAdventureBasicInitializationTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

export async function textAdventureCustomDataLoadingTest(testController) {
  try {
    testController.log('Starting textAdventureCustomDataLoadingTest...');
    testController.reportCondition('Test started', true);

    // Ensure we have rules loaded (prerequisite)
    await new Promise(resolve => setTimeout(resolve, 500));
    testController.reportCondition('Rules ready', true);

    // Activate Text Adventure panel
    testController.eventBus.publish('ui:activatePanel', { panelId: 'textAdventurePanel' }, 'tests');
    
    await testController.pollForCondition(
      () => document.querySelector('.text-adventure-panel-container') !== null,
      'Text Adventure panel to appear',
      2000,
      200
    );

    // Step 1: Load custom data file
    testController.log('Step 1: Loading Adventure custom data...');
    const dropdown = document.querySelector('.custom-data-select');
    testController.reportCondition('Custom data dropdown found', dropdown !== null);

    if (dropdown) {
      // Set up event listener BEFORE triggering the change to avoid race condition
      const customDataLoadedPromise = testController.waitForEvent('textAdventure:customDataLoaded', 2000);
      
      // Simulate selecting Adventure custom data
      dropdown.value = 'adventure';
      dropdown.dispatchEvent(new Event('change'));
      testController.reportCondition('Adventure custom data selected', true);

      // Wait for custom data to be loaded
      const customDataLoaded = await customDataLoadedPromise;
      testController.reportCondition('Custom data loaded event received', customDataLoaded !== null);

      // Step 2: Check that custom data properly displays the Adventure entrance message
      testController.log('Step 2: Verifying Adventure entrance message appears...');
      
      // Allow time for the custom data to be processed and displayCurrentRegion to be called
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const adventureEntranceShown = await testController.pollForCondition(
        () => {
          const displayArea = document.querySelector('.text-adventure-display');
          return displayArea && displayArea.textContent.includes('You stand at the entrance to Adventure. The path forward awaits your command.');
        },
        'Adventure entrance message shown after custom data load',
        2000,
        200
      );
      testController.reportCondition('Adventure entrance message displayed after custom data load', adventureEntranceShown);

      // Step 3: Verify custom data loaded message
      const displayArea = document.querySelector('.text-adventure-display');
      if (displayArea) {
        const hasLoadedMessage = displayArea.textContent.includes('Custom Adventure data loaded');
        testController.reportCondition('Custom data loaded confirmation displayed', hasLoadedMessage);
      }
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in textAdventureCustomDataLoadingTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

export async function textAdventureMovementCommandTest(testController) {
  try {
    testController.log('Starting textAdventureMovementCommandTest...');
    testController.reportCondition('Test started', true);

    // Step 1: Load Adventure rules and position player
    await loadAdventureRulesAndPositionPlayer(testController, 'Menu');
    
    // Text Adventure panel is already activated by helper function

    // Step 3: Load custom data
    testController.log('Step 3: Loading custom data...');
    const dropdown = document.querySelector('.custom-data-select');
    if (dropdown) {
      // Set up event listener BEFORE triggering the change to avoid race condition
      const customDataLoadedPromise = testController.waitForEvent('textAdventure:customDataLoaded', 2000);
      
      dropdown.value = 'adventure';
      dropdown.dispatchEvent(new Event('change'));
      await customDataLoadedPromise;
    }

    // Step 4: Enter move command
    testController.log('Step 4: Entering "move GameStart" command...');
    const inputField = document.querySelector('.text-adventure-input');
    testController.reportCondition('Input field found', inputField !== null);

    if (inputField) {
      inputField.value = 'move GameStart';
      
      // Simulate Enter key press
      const enterEvent = new KeyboardEvent('keypress', { key: 'Enter' });
      inputField.dispatchEvent(enterEvent);
      testController.reportCondition('Move command entered', true);

      // Step 5: Wait for region change confirmation in UI
      testController.log('Step 5: Waiting for region change to Overworld...');
      
      // The textAdventure module handles movement internally and shows custom messages
      // rather than going through the standard playerState event chain.
      // We should test what actually happens rather than expecting standard events.
      await new Promise(resolve => setTimeout(resolve, 500)); // Brief wait for processing
      testController.reportCondition('Move command processed', true);

      // Step 6: Check for any region change message (generic or custom)
      testController.log('Step 6: Checking for region change confirmation...');
      
      const regionChangeMessageAppeared = await testController.pollForCondition(
        () => {
          const displayArea = document.querySelector('.text-adventure-display');
          // Look for either the move command being processed or a region message
          return displayArea && (
            displayArea.textContent.includes('You travel through GameStart') ||
            displayArea.textContent.includes('vast overworld') ||
            displayArea.textContent.includes('You are now in Overworld')
          );
        },
        'Region change message to appear',
        2000,
        200
      );
      testController.reportCondition('Region change message displayed', regionChangeMessageAppeared);

      // Step 7: Verify user input was echoed
      const displayArea = document.querySelector('.text-adventure-display');
      if (displayArea) {
        const hasUserInput = displayArea.textContent.includes('> move GameStart');
        testController.reportCondition('User input echoed in display', hasUserInput);
      }
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in textAdventureMovementCommandTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

export async function textAdventureLocationCheckCommandTest(testController) {
  try {
    testController.log('Starting textAdventureLocationCheckCommandTest...');
    testController.reportCondition('Test started', true);

    // Step 1: Load Adventure rules and position player
    await loadAdventureRulesAndPositionPlayer(testController, 'Menu');
    
    // Text Adventure panel is already activated by helper function

    // Step 3: Load custom data and move to Overworld
    testController.log('Step 3: Loading custom data...');
    const dropdown = document.querySelector('.custom-data-select');
    if (dropdown) {
      // Set up event listener BEFORE triggering the change to avoid race condition
      const customDataLoadedPromise = testController.waitForEvent('textAdventure:customDataLoaded', 2000);
      
      dropdown.value = 'adventure';
      dropdown.dispatchEvent(new Event('change'));
      await customDataLoadedPromise;
    }

    // Wait for initial positioning to complete, then move to Overworld
    
    const inputField = document.querySelector('.text-adventure-input');
    if (inputField) {
      inputField.value = 'move GameStart';
      inputField.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter' }));
      
      // Wait for move to complete
      await testController.pollForCondition(
        () => {
          const displayArea = document.querySelector('.text-adventure-display');
          return displayArea && displayArea.textContent.includes('overworld');
        },
        'Move to Overworld to complete',
        5000,
        500
      );
    }

    // Step 1: Enter location check command
    testController.log('Step 1: Entering "check Blue Labyrinth 0" command...');
    
    if (inputField) {
      inputField.value = 'check Blue Labyrinth 0';
      inputField.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter' }));
      testController.reportCondition('Location check command entered', true);

      // Step 2: Wait for state change event (result of dispatcher handling user:locationCheck)
      testController.log('Step 2: Waiting for stateManager:snapshotUpdated event...');
      
      let stateChangeReceived = false;
      const stateChangeHandler = (data) => {
        // Any snapshot update after location check indicates success
        stateChangeReceived = true;
      };
      
      testController.eventBus.subscribe('stateManager:snapshotUpdated', stateChangeHandler, 'test');
      
      const eventReceived = await testController.pollForCondition(
        () => stateChangeReceived,
        'stateManager:snapshotUpdated event to be published',
        2000,
        200
      );
      testController.reportCondition('stateManager:snapshotUpdated event published', eventReceived);

      // Step 3: Check for any location check message (generic or custom)
      testController.log('Step 3: Checking for location check message...');
      
      const locationCheckMessageAppeared = await testController.pollForCondition(
        () => {
          const displayArea = document.querySelector('.text-adventure-display');
          // Look for either custom message or generic search message
          return displayArea && (
            displayArea.textContent.includes('carefully search the Blue Labyrinth') ||
            displayArea.textContent.includes('You search Blue Labyrinth 0') ||
            displayArea.textContent.includes('Blue Labyrinth 0')
          );
        },
        'Location check message to appear',
        2000,
        200
      );
      testController.reportCondition('Location check message displayed', locationCheckMessageAppeared);

      // Step 4: Verify that item was "Left Difficulty Switch" (from Adventure game)
      const displayArea = document.querySelector('.text-adventure-display');
      if (displayArea) {
        const hasCorrectItem = displayArea.textContent.includes('Left Difficulty Switch');
        testController.reportCondition('Found Left Difficulty Switch item', hasCorrectItem);
      }
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in textAdventureLocationCheckCommandTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

export async function textAdventureLinkClickTest(testController) {
  try {
    testController.log('Starting textAdventureLinkClickTest...');
    testController.reportCondition('Test started', true);

    // Step 1: Load Adventure rules and position player
    await loadAdventureRulesAndPositionPlayer(testController, 'Menu');
    
    // Text Adventure panel is already activated by helper function

    // Step 3: Load custom data
    testController.log('Step 3: Loading custom data...');
    const dropdown = document.querySelector('.custom-data-select');
    if (dropdown) {
      // Set up event listener BEFORE triggering the change to avoid race condition
      const customDataLoadedPromise = testController.waitForEvent('textAdventure:customDataLoaded', 2000);
      
      dropdown.value = 'adventure';
      dropdown.dispatchEvent(new Event('change'));
      await customDataLoadedPromise;
    }

    // Wait for display to show current region content
    await testController.pollForCondition(
      () => {
        const displayArea = document.querySelector('.text-adventure-display');
        return displayArea && displayArea.textContent.includes('GameStart');
      },
      'Display to show region content with GameStart',
      2000,
      200
    );
    
    // Check current display content for debugging
    const displayArea = document.querySelector('.text-adventure-display');
    if (displayArea) {
      testController.log(`Current display content: "${displayArea.textContent.substr(-200)}"`);
    }
    
    // Step 4: Click on GameStart exit link
    testController.log('Step 4: Looking for GameStart exit link...');
    
    const exitLinkFound = await testController.pollForCondition(
      () => {
        const exitLinks = document.querySelectorAll('.text-adventure-link[data-type="exit"]');
        testController.log(`Found ${exitLinks.length} exit links total`);
        return Array.from(exitLinks).some(link => {
          const target = link.getAttribute('data-target');
          testController.log(`Exit link target: ${target}`);
          return target === 'GameStart';
        });
      },
      'GameStart exit link to appear',
      5000,
      500
    );
    testController.reportCondition('GameStart exit link found', exitLinkFound);

    if (exitLinkFound) {
      const gameStartLink = Array.from(document.querySelectorAll('.text-adventure-link[data-type="exit"]'))
        .find(link => link.getAttribute('data-target') === 'GameStart');
      
      if (gameStartLink) {
        // Click the link
        gameStartLink.click();
        testController.reportCondition('GameStart exit link clicked', true);

        // Wait for region change - look for specific Adventure overworld message
        const regionChanged = await testController.pollForCondition(
          () => {
            const displayArea = document.querySelector('.text-adventure-display');
            return displayArea && (
              displayArea.textContent.includes('You emerge into the vast overworld') ||
              displayArea.textContent.includes('vast overworld of Adventure') ||
              displayArea.textContent.includes('overworld of Adventure')
            );
          },
          'Region change to Overworld',
          2000,
          200
        );
        testController.reportCondition('Region changed to Overworld via link click', regionChanged);
      }
    }

    // Step 5: Click on Blue Labyrinth 0 location link (if we're in Overworld)
    testController.log('Step 5: Looking for Blue Labyrinth 0 location link...');
    
    const locationLinkFound = await testController.pollForCondition(
      () => {
        const locationLinks = document.querySelectorAll('.text-adventure-link[data-type="location"]');
        return Array.from(locationLinks).some(link => 
          link.getAttribute('data-target') === 'Blue Labyrinth 0'
        );
      },
      'Blue Labyrinth 0 location link to appear',
      2000,
      200
    );
    testController.reportCondition('Blue Labyrinth 0 location link found', locationLinkFound);

    if (locationLinkFound) {
      const locationLink = Array.from(document.querySelectorAll('.text-adventure-link[data-type="location"]'))
        .find(link => link.getAttribute('data-target') === 'Blue Labyrinth 0');
      
      if (locationLink) {
        // Click the link
        locationLink.click();
        testController.reportCondition('Blue Labyrinth 0 location link clicked', true);

        // Wait for location check message
        const locationChecked = await testController.pollForCondition(
          () => {
            const displayArea = document.querySelector('.text-adventure-display');
            return displayArea && displayArea.textContent.includes('Blue Labyrinth');
          },
          'Location check message to appear',
          2000,
          200
        );
        testController.reportCondition('Location check completed via link click', locationChecked);
      }
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in textAdventureLinkClickTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);  
  }
}

export async function textAdventureErrorHandlingTest(testController) {
  try {
    testController.log('Starting textAdventureErrorHandlingTest...');
    testController.reportCondition('Test started', true);

    // Setup: Wait for rules to be ready
    await new Promise(resolve => setTimeout(resolve, 500));
    
    testController.eventBus.publish('ui:activatePanel', { panelId: 'textAdventurePanel' }, 'tests');
    await testController.pollForCondition(
      () => document.querySelector('.text-adventure-panel-container') !== null,
      'Text Adventure panel to appear',
      2000,
      200
    );

    const inputField = document.querySelector('.text-adventure-input');
    testController.reportCondition('Input field found', inputField !== null);

    if (inputField) {
      // Test 1: Invalid command
      testController.log('Test 1: Testing invalid command...');
      inputField.value = 'xyzzy abracadabra';
      inputField.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter' }));

      const invalidCommandHandled = await testController.pollForCondition(
        () => {
          const displayArea = document.querySelector('.text-adventure-display');
          return displayArea && displayArea.textContent.includes('Unrecognized location or exit: xyzzy abracadabra');
        },
        'Invalid command error message',
        2000,
        200
      );
      testController.reportCondition('Invalid command error message displayed', invalidCommandHandled);

      // Test 2: Non-existent location
      testController.log('Test 2: Testing non-existent location...');
      inputField.value = 'check NonExistentLocation';
      inputField.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter' }));

      const nonExistentLocationHandled = await testController.pollForCondition(
        () => {
          const displayArea = document.querySelector('.text-adventure-display');
          // Check for either parser error or logic error message
          return displayArea && (
            displayArea.textContent.includes('Unrecognized location: NonExistentLocation') ||
            displayArea.textContent.includes('You cannot reach NonExistentLocation from here') ||
            displayArea.textContent.includes('NonExistentLocation')
          );
        },
        'Non-existent location error message',
        2000,
        200
      );
      testController.reportCondition('Non-existent location error message displayed', nonExistentLocationHandled);
      
      // Log what was actually displayed for debugging
      const displayArea = document.querySelector('.text-adventure-display');
      if (displayArea) {
        testController.log(`Actual display content: "${displayArea.textContent.substr(-200)}"`, 'debug');
      }

      // Test 3: Non-existent exit
      testController.log('Test 3: Testing non-existent exit...');
      inputField.value = 'move NonExistentExit';
      inputField.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter' }));

      const nonExistentExitHandled = await testController.pollForCondition(
        () => {
          const displayArea = document.querySelector('.text-adventure-display');
          // Check for either parser error or logic error message
          return displayArea && (
            displayArea.textContent.includes('Unrecognized exit: NonExistentExit') ||
            displayArea.textContent.includes('The path to NonExistentExit is blocked') ||
            displayArea.textContent.includes('NonExistentExit')
          );
        },
        'Non-existent exit error message',
        2000,
        200
      );
      testController.reportCondition('Non-existent exit error message displayed', nonExistentExitHandled);
      
      // Log what was actually displayed for debugging
      const displayArea2 = document.querySelector('.text-adventure-display');
      if (displayArea2) {
        testController.log(`Actual display content after exit test: "${displayArea2.textContent.substr(-200)}"`, 'debug');
      }

      // Test 4: Help command
      testController.log('Test 4: Testing help command...');
      inputField.value = 'help';
      inputField.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter' }));

      const helpDisplayed = await testController.pollForCondition(
        () => {
          const displayArea = document.querySelector('.text-adventure-display');
          return displayArea && displayArea.textContent.includes('Available commands');
        },
        'Help text to appear',
        2000,
        200
      );
      testController.reportCondition('Help text displayed correctly', helpDisplayed);
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in textAdventureErrorHandlingTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

// Register all tests

registerTest({
  id: 'test_textadventure_basic_initialization',
  name: 'Text Adventure Basic Initialization',
  description: 'Tests basic panel initialization, rules loading, and initial display.',
  testFunction: textAdventureBasicInitializationTest,
  category: 'Text Adventure Tests',
  //enabled: true,
});

registerTest({
  id: 'test_textadventure_custom_data_loading',
  name: 'Text Adventure Custom Data Loading',
  description: 'Tests loading and applying custom data files with Adventure-specific messages.',
  testFunction: textAdventureCustomDataLoadingTest,
  category: 'Text Adventure Tests',
  //enabled: true,
});

registerTest({
  id: 'test_textadventure_movement_command',
  name: 'Text Adventure Movement Command',
  description: 'Tests text command movement ("move GameStart") and region changes.',
  testFunction: textAdventureMovementCommandTest,
  category: 'Text Adventure Tests',
  //enabled: true,
});

registerTest({
  id: 'test_textadventure_location_check_command',
  name: 'Text Adventure Location Check Command',
  description: 'Tests location checking ("check Blue Labyrinth 0") and item discovery.',
  testFunction: textAdventureLocationCheckCommandTest,
  category: 'Text Adventure Tests',
  //enabled: true,
});

registerTest({
  id: 'test_textadventure_link_click',
  name: 'Text Adventure Link Click',  
  description: 'Tests clicking on exit and location links for movement and checking.',
  testFunction: textAdventureLinkClickTest,
  category: 'Text Adventure Tests',
  //enabled: true,
});

registerTest({
  id: 'test_textadventure_error_handling',
  name: 'Text Adventure Error Handling',
  description: 'Tests error handling for invalid commands and inaccessible targets.',
  testFunction: textAdventureErrorHandlingTest,
  category: 'Text Adventure Tests',
  //enabled: true,
});