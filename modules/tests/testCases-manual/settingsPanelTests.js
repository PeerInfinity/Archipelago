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
 * Test that verifies the Apply button provides proper feedback
 * for both successful and failed applications.
 */
export async function testSettingsApplyButtonFeedback(testController) {
  const testRunId = `apply-feedback-test-${Date.now()}`;
  
  try {
    testController.log(`[${testRunId}] Starting Settings Apply button feedback test...`);
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
    
    // Wait for settings UI to initialize
    let textAreaElement = null;
    let applyButton = null;
    if (!(await testController.pollForCondition(
      () => {
        textAreaElement = settingsPanelElement.querySelector('.settings-textarea');
        applyButton = settingsPanelElement.querySelector('button');
        return textAreaElement !== null && applyButton !== null && textAreaElement.value.length > 0;
      },
      'Settings UI to initialize',
      3000,
      250
    ))) {
      throw new Error('Settings UI not fully initialized');
    }
    testController.reportCondition('Settings UI initialized', true);
    
    // Test successful application
    const originalSettings = textAreaElement.value;
    const originalButtonText = applyButton.textContent;
    
    // Make a small valid change
    const validSettings = JSON.parse(originalSettings);
    validSettings.generalSettings.testProperty = 'test-value';
    textAreaElement.value = JSON.stringify(validSettings, null, 2);
    
    applyButton.click();
    
    // Wait for success feedback
    if (!(await testController.pollForCondition(
      () => {
        return applyButton.textContent === 'Applied!';
      },
      'Success feedback to appear',
      2000,
      100
    ))) {
      throw new Error('Success feedback not received');
    }
    testController.reportCondition('Success feedback appears', true);
    
    // Wait for feedback to reset
    if (!(await testController.pollForCondition(
      () => {
        return applyButton.textContent === originalButtonText;
      },
      'Button text to reset',
      2000,
      100
    ))) {
      throw new Error('Button text did not reset after success');
    }
    testController.reportCondition('Button text resets after success', true);
    
    // Test error feedback with invalid JSON
    textAreaElement.value = '{ invalid json syntax';
    applyButton.click();
    
    // Wait for error feedback
    if (!(await testController.pollForCondition(
      () => {
        return applyButton.textContent === 'Error!';
      },
      'Error feedback to appear',
      2000,
      100
    ))) {
      throw new Error('Error feedback not received');
    }
    testController.reportCondition('Error feedback appears', true);
    
    // Wait for feedback to reset
    if (!(await testController.pollForCondition(
      () => {
        return applyButton.textContent === originalButtonText;
      },
      'Button text to reset after error',
      3000,
      100
    ))) {
      throw new Error('Button text did not reset after error');
    }
    testController.reportCondition('Button text resets after error', true);
    
    // Restore original settings
    textAreaElement.value = originalSettings;
    applyButton.click();
    
    testController.log(`[${testRunId}] Settings Apply button feedback test completed successfully`);
    await testController.completeTest(true);
    
  } catch (error) {
    log('error', 'Settings Apply button feedback test failed:', error);
    testController.log(`[${testRunId}] Test failed: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

// Register the tests

registerTest({
  id: 'test_settings_apply_button_feedback',
  name: 'Settings Panel - Apply Button Feedback',
  description: 'Tests that the Apply button provides proper feedback for both success and error cases',
  category: 'Settings Panel',
  //enabled: true,
  testFunction: testSettingsApplyButtonFeedback
});