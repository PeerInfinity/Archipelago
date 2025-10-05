// Text Adventure Iframe Tests
// These tests are adapted from textAdventurePanelTests.js to work through the iframe system
import { registerTest } from '../testRegistry.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('textAdventure-iframeTests', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[textAdventure-iframeTests] ${message}`, ...data);
  }
}

// Helper function to load Adventure rules and set up iframe
async function loadAdventureRulesAndSetupIframe(testController, targetRegion = 'Menu') {
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
  
  // Step 3: Create iframe panel
  testController.log('Creating iframe panel...');
  testController.eventBus.publish('ui:activatePanel', { 
    panelId: 'iframePanel',
    config: { iframeName: 'textAdventure' }
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
  
  // Step 3.5: Set custom iframe name
  testController.log('Setting custom iframe name to "textAdventure"...');
  const iframePanelElement = document.querySelector('.iframe-panel-container');
  if (iframePanelElement && iframePanelElement.iframePanelUI) {
    iframePanelElement.iframePanelUI.setCustomIframeName('textAdventure');
  }
  
  // Step 4: Load iframe content
  testController.log('Loading text adventure iframe...');
  const iframeLoadedPromise = testController.waitForEvent('iframePanel:loaded', 10000);
  
  testController.eventBus.publish('iframe:loadUrl', {
    url: './modules/textAdventure-remote/index.html'
  }, 'tests');
  
  const iframeLoaded = await iframeLoadedPromise;
  testController.reportCondition('Iframe loaded successfully', !!iframeLoaded);
  
  // Step 5: Wait for iframe to establish connection
  testController.log('Waiting for iframe connection...');
  const iframeConnectedPromise = testController.waitForEvent('iframe:connected', 5000);
  
  const iframeConnected = await iframeConnectedPromise;
  testController.reportCondition('Iframe connected to adapter', !!iframeConnected);

  // Note: The iframe adapter automatically sends the current region to newly connected iframes,
  // so we don't need to manually sync it here anymore

  // Step 6: Wait for iframe UI to be ready
  await testController.pollForCondition(
    () => {
      const iframe = document.querySelector('.iframe-panel iframe');
      if (!iframe) return false;
      
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        const textArea = iframeDoc.querySelector('.text-adventure-display');
        return textArea !== null;
      } catch (error) {
        // Cross-origin access might be blocked
        return false;
      }
    },
    'Iframe text adventure UI to be ready',
    5000,
    500
  );
  testController.reportCondition('Iframe text adventure UI ready', true);

  // Step 7: Verify player positioning using playerStateSingleton
  const playerState = getPlayerStateSingleton();
  const finalRegion = playerState.getCurrentRegion();
  testController.log(`Final player positioned in region: ${finalRegion}`);
  testController.reportCondition(`Player positioned in ${targetRegion} region`,
    finalRegion === targetRegion);
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
      textArea: iframeDoc.querySelector('.text-adventure-display'),
      inputField: iframeDoc.querySelector('.text-adventure-input'),
      customDataSelect: iframeDoc.querySelector('.custom-data-select')
    };
  } catch (error) {
    // Cross-origin access might be blocked
    return null;
  }
}

// Helper function to send command to iframe
function sendCommandToIframe(command) {
  const elements = getIframeElements();
  if (!elements || !elements.inputField) {
    return false;
  }
  
  elements.inputField.value = command;
  const enterEvent = new elements.iframeDoc.defaultView.KeyboardEvent('keypress', { key: 'Enter' });
  elements.inputField.dispatchEvent(enterEvent);
  return true;
}

export async function textAdventureIframeBasicInitializationTest(testController) {
  try {
    testController.log('Starting textAdventureIframeBasicInitializationTest...');
    testController.reportCondition('Test started', true);

    // Setup iframe and load rules
    await loadAdventureRulesAndSetupIframe(testController, 'Menu');

    // Check iframe elements exist
    const elements = getIframeElements();
    testController.reportCondition('Iframe document accessible', elements !== null);
    
    if (elements) {
      testController.reportCondition('Text display area exists in iframe', elements.textArea !== null);
      testController.reportCondition('Input field exists in iframe', elements.inputField !== null);
      testController.reportCondition('Custom data dropdown exists in iframe', elements.customDataSelect !== null);
      
      // Check for rules loaded message in iframe - now with efficient polling, should be much faster
      if (elements.textArea) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Reduced back to 1s since polling should find rules within ~200-500ms
        const hasRulesMessage = elements.textArea.textContent.includes('Rules loaded! Your adventure begins');
        testController.reportCondition('Rules loaded message displayed in iframe', hasRulesMessage);
      }
      
      // Verify no "nowhere" message
      if (elements.textArea) {
        const hasNowhereMessage = elements.textArea.textContent.includes('You are nowhere');
        testController.reportCondition('No "nowhere" fallback message in iframe', !hasNowhereMessage);
      }
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in textAdventureIframeBasicInitializationTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

export async function textAdventureIframeCustomDataLoadingTest(testController) {
  try {
    testController.log('Starting textAdventureIframeCustomDataLoadingTest...');
    testController.reportCondition('Test started', true);

    // Setup iframe and load rules
    await loadAdventureRulesAndSetupIframe(testController, 'Menu');

    const elements = getIframeElements();
    testController.reportCondition('Iframe elements accessible', elements !== null);

    if (elements && elements.customDataSelect) {
      // Load custom data in iframe
      testController.log('Loading Adventure custom data in iframe...');

      elements.customDataSelect.value = 'adventure';
      const changeEvent = new elements.iframeDoc.defaultView.Event('change');
      elements.customDataSelect.dispatchEvent(changeEvent);
      testController.reportCondition('Adventure custom data selected in iframe', true);

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
        testController.reportCondition('Custom data loaded confirmation displayed in iframe', dataLoaded);

        // Note: The entrance message may not appear immediately after loading custom data
        // This is expected behavior - custom data loads but doesn't automatically redisplay region
        console.log(`[TEST DEBUG] Iframe text after custom data load:`, elements.textArea.textContent);
      }
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in textAdventureIframeCustomDataLoadingTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

export async function textAdventureIframeMovementCommandTest(testController) {
  try {
    testController.log('Starting textAdventureIframeMovementCommandTest...');
    testController.reportCondition('Test started', true);

    // Setup iframe and load rules
    await loadAdventureRulesAndSetupIframe(testController, 'Menu');

    const elements = getIframeElements();
    testController.reportCondition('Iframe elements accessible', elements !== null);

    if (elements) {
      // Load custom data first
      if (elements.customDataSelect) {
        elements.customDataSelect.value = 'adventure';
        const changeEvent = new elements.iframeDoc.defaultView.Event('change');
        elements.customDataSelect.dispatchEvent(changeEvent);
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Send move command to iframe
      testController.log('Sending "move GameStart" command to iframe...');
      const commandSent = sendCommandToIframe('move GameStart');
      testController.reportCondition('Move command sent to iframe', commandSent);

      if (commandSent) {
        // Wait for command to be processed
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check for movement response in iframe
        if (elements.textArea) {
          const hasUserInput = elements.textArea.textContent.includes('> move GameStart');
          testController.reportCondition('User input echoed in iframe display', hasUserInput);

          // Debug: Show what's actually in the iframe
          console.log('[TEST DEBUG] Iframe text after move command:', elements.textArea.textContent);

          const regionChangeMessageAppeared = (
            elements.textArea.textContent.includes('You travel through GameStart') ||
            elements.textArea.textContent.includes('You take your first brave steps') ||
            elements.textArea.textContent.includes('vast overworld') ||
            elements.textArea.textContent.includes('You are now in Overworld')
          );
          testController.reportCondition('Region change message displayed in iframe', regionChangeMessageAppeared);
        }
      }
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in textAdventureIframeMovementCommandTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

export async function textAdventureIframeLocationCheckCommandTest(testController) {
  try {
    testController.log('Starting textAdventureIframeLocationCheckCommandTest...');
    testController.reportCondition('Test started', true);

    // Setup iframe and load rules
    await loadAdventureRulesAndSetupIframe(testController, 'Menu');

    const elements = getIframeElements();
    testController.reportCondition('Iframe elements accessible', elements !== null);

    if (elements) {
      // Load custom data and move to Overworld first
      if (elements.customDataSelect) {
        elements.customDataSelect.value = 'adventure';
        const changeEvent = new elements.iframeDoc.defaultView.Event('change');
        elements.customDataSelect.dispatchEvent(changeEvent);
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Move to Overworld first
      sendCommandToIframe('move GameStart');
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Now check a location
      testController.log('Sending "check Blue Labyrinth 0" command to iframe...');
      
      // Listen for state change event
      let stateChangeReceived = false;
      const stateChangeHandler = (data) => {
        stateChangeReceived = true;
      };
      
      testController.eventBus.subscribe('stateManager:snapshotUpdated', stateChangeHandler, 'test-iframe');
      
      const commandSent = sendCommandToIframe('check Blue Labyrinth 0');
      testController.reportCondition('Location check command sent to iframe', commandSent);

      if (commandSent) {
        // Wait for state change event
        const eventReceived = await testController.pollForCondition(
          () => stateChangeReceived,
          'stateManager:snapshotUpdated event to be published',
          3000,
          200
        );
        testController.reportCondition('stateManager:snapshotUpdated event published', eventReceived);

        // Check for location check message in iframe
        if (elements.textArea) {
          const locationCheckMessageAppeared = (
            elements.textArea.textContent.includes('carefully search the Blue Labyrinth') ||
            elements.textArea.textContent.includes('You search Blue Labyrinth 0') ||
            elements.textArea.textContent.includes('Blue Labyrinth 0')
          );
          testController.reportCondition('Location check message displayed in iframe', locationCheckMessageAppeared);

          const hasCorrectItem = elements.textArea.textContent.includes('Left Difficulty Switch');
          testController.reportCondition('Found Left Difficulty Switch item in iframe', hasCorrectItem);

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
    testController.log(`Error in textAdventureIframeLocationCheckCommandTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

export async function textAdventureIframeLinkClickTest(testController) {
  try {
    testController.log('Starting textAdventureIframeLinkClickTest...');
    testController.reportCondition('Test started', true);

    // Setup iframe and load rules
    await loadAdventureRulesAndSetupIframe(testController, 'Menu');

    const elements = getIframeElements();
    testController.reportCondition('Iframe elements accessible', elements !== null);

    if (elements) {
      // Load custom data
      if (elements.customDataSelect) {
        elements.customDataSelect.value = 'adventure';
        const changeEvent = new elements.iframeDoc.defaultView.Event('change');
        elements.customDataSelect.dispatchEvent(changeEvent);
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Wait for display to show region content
      await testController.pollForCondition(
        () => {
          return elements.textArea && elements.textArea.textContent.includes('GameStart');
        },
        'Display to show region content with GameStart in iframe',
        3000,
        200
      );

      // Look for GameStart exit link in iframe
      testController.log('Looking for GameStart exit link in iframe...');
      
      const exitLinkFound = await testController.pollForCondition(
        () => {
          if (!elements.textArea) return false;
          const exitLinks = elements.textArea.querySelectorAll('.text-adventure-link[data-type="exit"]');
          return Array.from(exitLinks).some(link => {
            return link.getAttribute('data-target') === 'GameStart';
          });
        },
        'GameStart exit link to appear in iframe',
        5000,
        500
      );
      testController.reportCondition('GameStart exit link found in iframe', exitLinkFound);

      if (exitLinkFound && elements.textArea) {
        const gameStartLink = Array.from(elements.textArea.querySelectorAll('.text-adventure-link[data-type="exit"]'))
          .find(link => link.getAttribute('data-target') === 'GameStart');
        
        if (gameStartLink) {
          // Click the link in iframe
          gameStartLink.click();
          testController.reportCondition('GameStart exit link clicked in iframe', true);

          // Wait for region change in iframe
          const regionChanged = await testController.pollForCondition(
            () => {
              return elements.textArea && (
                elements.textArea.textContent.includes('You emerge into the vast overworld') ||
                elements.textArea.textContent.includes('vast overworld of Adventure') ||
                elements.textArea.textContent.includes('overworld of Adventure')
              );
            },
            'Region change to Overworld in iframe',
            3000,
            200
          );
          testController.reportCondition('Region changed to Overworld via link click in iframe', regionChanged);

          // Look for location link in iframe
          const locationLinkFound = await testController.pollForCondition(
            () => {
              if (!elements.textArea) return false;
              const locationLinks = elements.textArea.querySelectorAll('.text-adventure-link[data-type="location"]');
              return Array.from(locationLinks).some(link => 
                link.getAttribute('data-target') === 'Blue Labyrinth 0'
              );
            },
            'Blue Labyrinth 0 location link to appear in iframe',
            3000,
            200
          );
          testController.reportCondition('Blue Labyrinth 0 location link found in iframe', locationLinkFound);

          if (locationLinkFound) {
            const locationLink = Array.from(elements.textArea.querySelectorAll('.text-adventure-link[data-type="location"]'))
              .find(link => link.getAttribute('data-target') === 'Blue Labyrinth 0');
            
            if (locationLink) {
              locationLink.click();
              testController.reportCondition('Blue Labyrinth 0 location link clicked in iframe', true);

              // Wait for location check message in iframe
              const locationChecked = await testController.pollForCondition(
                () => {
                  return elements.textArea && elements.textArea.textContent.includes('Blue Labyrinth');
                },
                'Location check message to appear in iframe',
                3000,
                200
              );
              testController.reportCondition('Location check completed via link click in iframe', locationChecked);
            }
          }
        }
      }
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in textAdventureIframeLinkClickTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);  
  }
}

export async function textAdventureIframeConnectionTest(testController) {
  try {
    testController.log('Starting textAdventureIframeConnectionTest...');
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

    // Test loading iframe
    testController.log('Testing iframe loading...');
    const iframeLoadedPromise = testController.waitForEvent('iframePanel:loaded', 8000);
    
    testController.eventBus.publish('iframe:loadUrl', {
      url: './modules/textAdventure-remote/index.html'
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
    testController.log(`Error in textAdventureIframeConnectionTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

export async function textAdventureIframeManagerUITest(testController) {
  try {
    testController.log('Starting textAdventureIframeManagerUITest...');
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

    // Step 3: Create iframe manager panel
    testController.log('Creating iframe manager panel...');
    testController.eventBus.publish('ui:activatePanel', { panelId: 'iframeManagerPanel' }, 'tests');
    
    const managerPanelReady = await testController.pollForCondition(
      () => {
        const panel = document.querySelector('.iframe-manager-panel-container');
        return panel !== null;
      },
      'Iframe manager panel to appear',
      5000,
      200
    );
    testController.reportCondition('Iframe manager panel is active', managerPanelReady);

    // Step 4: Create iframe panel
    testController.log('Creating iframe panel...');
    testController.eventBus.publish('ui:activatePanel', { panelId: 'iframePanel' }, 'tests');
    
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

    // Step 5: Get references to iframe manager UI elements
    const managerPanel = document.querySelector('.iframe-manager-panel-container');
    const knownPagesSelect = managerPanel ? managerPanel.querySelector('.known-pages-select') : null;
    const loadButton = managerPanel ? managerPanel.querySelector('.load-button') : null;

    testController.reportCondition('Iframe manager known pages dropdown exists', knownPagesSelect !== null);
    testController.reportCondition('Iframe manager load button exists', loadButton !== null);

    if (!knownPagesSelect || !loadButton) {
      throw new Error('Required iframe manager UI elements not found');
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

    // Step 7: Click the "Load Iframe" button
    testController.log('Clicking "Load Iframe" button...');
    testController.log(`Button disabled state: ${loadButton.disabled}`);
    testController.log(`Current URL input value: ${managerPanel.querySelector('.url-input')?.value}`);
    
    const iframeLoadedPromise = testController.waitForEvent('iframePanel:loaded', 10000);
    
    // Also listen for the iframe:loadUrl event that should be published by the manager
    const loadUrlPromise = testController.waitForEvent('iframe:loadUrl', 5000);
    
    loadButton.click();
    testController.reportCondition('Load iframe button clicked', true);
    
    // Wait for the load URL event first
    try {
      const loadUrlEvent = await loadUrlPromise;
      testController.log('iframe:loadUrl event received:', loadUrlEvent);
      testController.reportCondition('iframe:loadUrl event published by manager', true);
    } catch (error) {
      testController.log('iframe:loadUrl event not received:', error.message);
      testController.reportCondition('iframe:loadUrl event published by manager', false);
    }

    // Step 8: Wait for iframe to load
    const iframeLoaded = await iframeLoadedPromise;
    testController.reportCondition('Iframe loaded successfully via UI', !!iframeLoaded);

    // Step 9: Wait for iframe to establish connection
    testController.log('Waiting for iframe connection...');
    const iframeConnectedPromise = testController.waitForEvent('iframe:connected', 5000);
    
    const iframeConnected = await iframeConnectedPromise;
    testController.reportCondition('Iframe connected to adapter via UI', !!iframeConnected);

    // Step 10: Wait for iframe UI to be ready and check basic elements
    await testController.pollForCondition(
      () => {
        const iframe = document.querySelector('.iframe-panel iframe');
        if (!iframe) return false;
        
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          const textArea = iframeDoc.querySelector('.text-adventure-display');
          return textArea !== null;
        } catch (error) {
          return false;
        }
      },
      'Iframe text adventure UI to be ready',
      5000,
      500
    );
    testController.reportCondition('Iframe text adventure UI ready via UI', true);

    // Step 11: Get final state and check all UI elements
    const elements = getIframeElements();
    testController.reportCondition('Iframe document accessible via UI', elements !== null);
    
    if (elements) {
      testController.reportCondition('Text display area exists in iframe via UI', elements.textArea !== null);
      testController.reportCondition('Input field exists in iframe via UI', elements.inputField !== null);
      testController.reportCondition('Custom data dropdown exists in iframe via UI', elements.customDataSelect !== null);
      
      // Check for rules loaded message in iframe - should be much faster now with polling
      if (elements.textArea) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Brief wait for UI to update
        const hasRulesMessage = elements.textArea.textContent.includes('Rules loaded! Your adventure begins');
        testController.reportCondition('Rules loaded message displayed in iframe via UI', hasRulesMessage);
      }
      
      // Verify no "nowhere" message
      if (elements.textArea) {
        const hasNowhereMessage = elements.textArea.textContent.includes('You are nowhere');
        testController.reportCondition('No "nowhere" fallback message in iframe via UI', !hasNowhereMessage);
      }
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Test failed with error: ${error.message}`, 'error');
    testController.reportCondition('Test completed without errors', false);
    await testController.completeTest(false);
  }
}

// Register all iframe tests

registerTest({
  id: 'test_textadventure_iframe_connection',
  name: 'Text Adventure Iframe Connection',
  description: 'Tests iframe adapter, panel creation, and connection establishment.',
  testFunction: textAdventureIframeConnectionTest,
  category: 'Text Adventure Iframe Tests',
  //enabled: true,
});

registerTest({
  id: 'test_textadventure_iframe_basic_initialization',
  name: 'Text Adventure Iframe Basic Initialization',
  description: 'Tests basic iframe panel initialization, rules loading, and initial display through iframe.',
  testFunction: textAdventureIframeBasicInitializationTest,
  category: 'Text Adventure Iframe Tests',
  //enabled: true,
});

registerTest({
  id: 'test_textadventure_iframe_custom_data_loading',
  name: 'Text Adventure Iframe Custom Data Loading',
  description: 'Tests loading and applying custom data files with Adventure-specific messages through iframe.',
  testFunction: textAdventureIframeCustomDataLoadingTest,
  category: 'Text Adventure Iframe Tests',
  //enabled: true,
});

registerTest({
  id: 'test_textadventure_iframe_movement_command',
  name: 'Text Adventure Iframe Movement Command',
  description: 'Tests text command movement ("move GameStart") and region changes through iframe.',
  testFunction: textAdventureIframeMovementCommandTest,
  category: 'Text Adventure Iframe Tests',
  //enabled: true,
});

registerTest({
  id: 'test_textadventure_iframe_location_check_command',
  name: 'Text Adventure Iframe Location Check Command',
  description: 'Tests location checking ("check Blue Labyrinth 0") and item discovery through iframe.',
  testFunction: textAdventureIframeLocationCheckCommandTest,
  category: 'Text Adventure Iframe Tests',
  //enabled: true,
});

registerTest({
  id: 'test_textadventure_iframe_link_click',
  name: 'Text Adventure Iframe Link Click',  
  description: 'Tests clicking on exit and location links for movement and checking through iframe.',
  testFunction: textAdventureIframeLinkClickTest,
  category: 'Text Adventure Iframe Tests',
  //enabled: true,
});

registerTest({
  id: 'test_textadventure_iframe_manager_ui',
  name: 'Text Adventure Iframe Manager UI Test',
  description: 'Tests using the iframe Manager panel UI to set up and load the text adventure iframe.',
  testFunction: textAdventureIframeManagerUITest,
  category: 'Text Adventure Iframe Tests',
  //enabled: true,
});