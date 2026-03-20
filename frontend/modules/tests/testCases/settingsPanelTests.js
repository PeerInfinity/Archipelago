// settingsPanelTests.js - Tests for the Settings panel functionality

import { registerTest } from '../testRegistry.js';

// Helper function for logging
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('settingsPanelTests', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[settingsPanelTests] ${message}`, ...data);
  }
}

/**
 * Helper: Activate the Options panel and navigate to the Settings (JSON) sub-view.
 * Returns { optionsPanelElement, textAreaElement, applyButton }.
 * Handles the case where the panel may already be showing the settings sub-view.
 */
async function activateSettingsJsonView(testController) {
  testController.eventBus.publish('ui:activatePanel', { panelId: 'optionsPanel' });

  let optionsPanelElement = null;
  if (!(await testController.pollForCondition(
    () => {
      optionsPanelElement = document.querySelector('.options-panel-root');
      return optionsPanelElement !== null;
    },
    'Options panel DOM element',
    5000,
    250
  ))) {
    throw new Error('Options panel not found in DOM');
  }

  // If the textarea is already visible (panel still on settings sub-view), skip nav card click
  let textAreaElement = optionsPanelElement.querySelector('.options-json-textarea');
  if (!textAreaElement) {
    // Navigate from home view: wait for nav card, then click it
    let settingsCard = null;
    if (!(await testController.pollForCondition(
      () => {
        settingsCard = Array.from(optionsPanelElement.querySelectorAll('.options-nav-card'))
          .find(el => el.textContent.includes('Settings (JSON)'));
        return !!settingsCard;
      },
      'Settings (JSON) nav card',
      5000,
      250
    ))) {
      throw new Error('Settings (JSON) nav card not found in Options panel');
    }
    settingsCard.click();

    // Wait for the textarea to appear after clicking the card
    if (!(await testController.pollForCondition(
      () => {
        textAreaElement = optionsPanelElement.querySelector('.options-json-textarea');
        return textAreaElement !== null;
      },
      'Settings textarea to initialize',
      3000,
      250
    ))) {
      throw new Error('Settings textarea not found');
    }
  }

  const applyButton = optionsPanelElement.querySelector('.options-json-apply-btn');
  if (!applyButton) {
    throw new Error('Apply button not found in Settings panel');
  }

  return { optionsPanelElement, textAreaElement, applyButton };
}

/**
 * Test that verifies the Settings panel can be used to enable and disable
 * colorblind mode for the Regions panel, and that the changes are reflected
 * in the Regions panel display.
 */
export async function testColorblindModeToggleInRegionsViaSettings(testController) {
  log('info', 'Starting colorblind mode toggle test via Settings panel');
  const testRunId = `colorblind-toggle-test-${Date.now()}`;
  
  try {
    testController.log(`[${testRunId}] Starting colorblind mode toggle test...`);
    testController.reportCondition('Test started', true);

    // Step 1: Activate the Options panel and navigate to the Settings (JSON) sub-view
    testController.log(`[${testRunId}] Activating Options panel...`);
    const { optionsPanelElement, textAreaElement, applyButton } = await activateSettingsJsonView(testController);
    testController.reportCondition('Settings textarea found', true);

    // Step 2: Enable colorblind mode for regions
    testController.log(`[${testRunId}] Enabling colorblind mode for regions...`);

    let settingsText = textAreaElement.value;
    let settingsObj;

    try {
      settingsObj = JSON.parse(settingsText);
    } catch (e) {
      throw new Error(`Settings text is not valid JSON: ${e.message}`);
    }

    if (!settingsObj.colorblindMode) {
      throw new Error('colorblindMode settings not found in settings JSON');
    }

    // Enable colorblind mode for regions only (simplify test)
    settingsObj.colorblindMode.regions = true;

    textAreaElement.value = JSON.stringify(settingsObj, null, 2);
    testController.reportCondition('Colorblind regions setting updated to true', true);
    
    applyButton.click();
    
    // Wait for the settings to be applied
    if (!(await testController.pollForCondition(
      () => {
        return applyButton.textContent === 'Applied!' || applyButton.textContent === 'Apply';
      },
      'Apply button feedback',
      2000,
      100
    ))) {
      throw new Error('Apply button feedback not received');
    }
    testController.reportCondition('Settings applied successfully', true);

    // Step 3: Test Regions panel colorblind mode
    testController.log(`[${testRunId}] Testing Regions panel colorblind mode...`);
    testController.eventBus.publish('ui:activatePanel', { panelId: 'regionsPanel' });

    let regionsPanelElement = null;
    if (!(await testController.pollForCondition(
      () => {
        regionsPanelElement = document.querySelector('.regions-panel-container');
        return regionsPanelElement !== null;
      },
      'Regions panel DOM element',
      5000,
      250
    ))) {
      throw new Error('Regions panel not found in DOM');
    }

    // Check for colorblind symbol in Menu region
    if (!(await testController.pollForCondition(
      () => {
        const regionBlocks = regionsPanelElement.querySelectorAll('.region-block');
        for (const block of regionBlocks) {
          const regionNameElement = block.querySelector('.region-name');
          if (regionNameElement && regionNameElement.textContent.trim() === 'Menu') {
            const colorblindSymbol = block.querySelector('.colorblind-symbol');
            return colorblindSymbol !== null;
          }
        }
        return false;
      },
      'Colorblind symbol in Regions panel',
      5000,
      250
    ))) {
      throw new Error('Colorblind symbol not found in Menu region');
    }
    testController.reportCondition('Regions panel colorblind mode active', true);

    // Step 4: Disable colorblind mode for regions
    testController.log(`[${testRunId}] Disabling colorblind mode for regions...`);
    testController.eventBus.publish('ui:activatePanel', { panelId: 'optionsPanel' });

    // Parse the settings again to ensure we're working with current state
    try {
      settingsObj = JSON.parse(textAreaElement.value);
    } catch (e) {
      throw new Error(`Settings text is not valid JSON after apply: ${e.message}`);
    }

    // Disable colorblind mode for regions
    settingsObj.colorblindMode.regions = false;

    textAreaElement.value = JSON.stringify(settingsObj, null, 2);
    testController.reportCondition('Colorblind regions setting updated to false', true);
    
    applyButton.click();
    
    // Wait for the settings to be applied
    if (!(await testController.pollForCondition(
      () => {
        return applyButton.textContent === 'Applied!' || applyButton.textContent === 'Apply';
      },
      'Apply button feedback for disable',
      2000,
      100
    ))) {
      throw new Error('Apply button feedback not received for disable');
    }
    testController.reportCondition('Disable settings applied successfully', true);

    // Step 5: Verify colorblind mode is disabled in Regions panel
    testController.log(`[${testRunId}] Verifying colorblind mode disabled in Regions panel...`);
    testController.eventBus.publish('ui:activatePanel', { panelId: 'regionsPanel' });

    if (!(await testController.pollForCondition(
      () => {
        const regionBlocks = regionsPanelElement.querySelectorAll('.region-block');
        for (const block of regionBlocks) {
          const regionNameElement = block.querySelector('.region-name');
          if (regionNameElement && regionNameElement.textContent.trim() === 'Menu') {
            const colorblindSymbol = block.querySelector('.colorblind-symbol');
            return colorblindSymbol === null;
          }
        }
        return false;
      },
      'Colorblind symbol removed from Regions panel',
      5000,
      250
    ))) {
      throw new Error('Colorblind symbol still present in Menu region');
    }
    testController.reportCondition('Regions panel colorblind mode disabled', true);
    
    testController.log(`[${testRunId}] Colorblind mode toggle test completed successfully`);
    await testController.completeTest(true);
    
  } catch (error) {
    log('error', 'Colorblind mode toggle test failed:', error);
    testController.log(`[${testRunId}] Test failed: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

/**
 * Test that verifies the Settings panel loads current settings correctly
 * and displays them in JSON format.
 */
export async function testSettingsPanelLoadsCurrentSettings(testController) {
  const testRunId = `settings-load-test-${Date.now()}`;
  
  try {
    testController.log(`[${testRunId}] Starting Settings panel load test...`);
    testController.reportCondition('Test started', true);

    // Activate the Options panel and navigate to Settings (JSON) sub-view
    testController.log(`[${testRunId}] Activating Options panel...`);
    const { textAreaElement } = await activateSettingsJsonView(testController);

    // Wait for textarea to have content
    if (!(await testController.pollForCondition(
      () => textAreaElement.value.length > 0,
      'Settings textarea to have content',
      3000,
      250
    ))) {
      throw new Error('Settings textarea is empty');
    }
    testController.reportCondition('Settings textarea found with content', true);
    
    const settingsText = textAreaElement.value;
    
    // Verify it's valid JSON
    let parsedSettings;
    try {
      parsedSettings = JSON.parse(settingsText);
    } catch (parseError) {
      throw new Error(`Settings text is not valid JSON: ${parseError.message}`);
    }
    testController.reportCondition('Settings text is valid JSON', true);
    
    // Verify it contains expected top-level properties
    const expectedProperties = ['generalSettings', 'moduleSettings', 'colorblindMode'];
    for (const prop of expectedProperties) {
      if (!(prop in parsedSettings)) {
        throw new Error(`Expected property '${prop}' not found in settings`);
      }
    }
    testController.reportCondition('Settings contain expected properties', true);
    
    testController.log(`[${testRunId}] Settings panel load test completed successfully`);
    await testController.completeTest(true);
    
  } catch (error) {
    log('error', 'Settings panel load test failed:', error);
    testController.log(`[${testRunId}] Test failed: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}


// Register the tests
registerTest({
  id: 'test_settings_colorblind_mode_toggle',
  name: 'Settings Panel - Colorblind Mode Toggle',
  description: 'Tests enabling and disabling colorblind mode for regions via the Settings panel',
  category: 'Settings Panel',
  //enabled: false,
  testFunction: testColorblindModeToggleInRegionsViaSettings
});

registerTest({
  id: 'test_settings_panel_loads_current_settings',
  name: 'Settings Panel - Load Current Settings',
  description: 'Verifies that the Settings panel loads and displays current settings correctly',
  category: 'Settings Panel',
  //enabled: false,
  testFunction: testSettingsPanelLoadsCurrentSettings
});

