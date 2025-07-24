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

    const eventBusModule = await import('../../../app/core/eventBus.js');
    const eventBus = eventBusModule.default;

    // Step 1: Activate the Settings panel first
    testController.log(`[${testRunId}] Activating Settings panel...`);
    eventBus.publish('ui:activatePanel', { panelId: 'settingsPanel' }, 'tests');
    await new Promise((resolve) => setTimeout(resolve, 1500)); // wait for panel to fully init
    
    // Wait for the settings panel to appear in DOM
    let settingsPanelElement = null;
    if (!(await testController.pollForCondition(
      () => {
        settingsPanelElement = document.querySelector('.settings-panel-content');
        return settingsPanelElement !== null;
      },
      'Settings panel DOM element',
      5000,
      250
    ))) {
      throw new Error('Settings panel not found in DOM');
    }
    testController.reportCondition('Settings panel found in DOM', true);
    
    // Wait for settings textarea to initialize
    let textAreaElement = null;
    if (!(await testController.pollForCondition(
      () => {
        textAreaElement = settingsPanelElement.querySelector('.settings-textarea');
        return textAreaElement !== null;
      },
      'Settings textarea to initialize',
      3000,
      250
    ))) {
      throw new Error('Settings textarea not found');
    }
    testController.reportCondition('Settings textarea found', true);

    // Step 2: Enable colorblind mode for regions
    testController.log(`[${testRunId}] Enabling colorblind mode for regions...`);
    
    let settingsText = textAreaElement.value;
    if (!settingsText.includes('colorblindMode')) {
      throw new Error('colorblindMode settings not found in settings JSON');
    }
    
    // Enable colorblind mode for regions only (simplify test)
    let updatedSettings = settingsText.replace(/"regions":\s*false/g, '"regions": true');
    
    if (updatedSettings === settingsText) {
      throw new Error('Failed to update colorblind regions setting to true');
    }
    
    textAreaElement.value = updatedSettings;
    testController.reportCondition('Colorblind regions setting updated to true', true);
    
    // Apply the settings
    const applyButton = settingsPanelElement.querySelector('button');
    if (!applyButton) {
      throw new Error('Apply button not found in Settings panel');
    }
    
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
    eventBus.publish('ui:activatePanel', { panelId: 'regionsPanel' }, 'tests');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
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
    eventBus.publish('ui:activatePanel', { panelId: 'settingsPanel' }, 'tests');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    const disabledSettings = textAreaElement.value.replace(/"regions":\s*true/g, '"regions": false');
    
    if (disabledSettings === textAreaElement.value) {
      throw new Error('Failed to update colorblind regions setting to false');
    }
    
    textAreaElement.value = disabledSettings;
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
    eventBus.publish('ui:activatePanel', { panelId: 'regionsPanel' }, 'tests');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
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

    // Activate the Settings panel
    testController.log(`[${testRunId}] Activating Settings panel...`);
    const eventBusModule = await import('../../../app/core/eventBus.js');
    const eventBus = eventBusModule.default;
    eventBus.publish('ui:activatePanel', { panelId: 'settingsPanel' }, 'tests');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    // Wait for the settings panel to appear in DOM
    let settingsPanelElement = null;
    if (!(await testController.pollForCondition(
      () => {
        settingsPanelElement = document.querySelector('.settings-panel-content');
        return settingsPanelElement !== null;
      },
      'Settings panel DOM element',
      5000,
      250
    ))) {
      throw new Error('Settings panel not found in DOM');
    }
    testController.reportCondition('Settings panel found in DOM', true);
    
    // Wait for settings textarea to initialize
    let textAreaElement = null;
    if (!(await testController.pollForCondition(
      () => {
        textAreaElement = settingsPanelElement.querySelector('.settings-textarea');
        return textAreaElement !== null && textAreaElement.value.length > 0;
      },
      'Settings textarea to initialize with content',
      3000,
      250
    ))) {
      throw new Error('Settings textarea not found or empty');
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

