// frontend/modules/tests/testCases/settingsTests.js

import { registerTest } from '../testRegistry.js';

export async function themeSettingTest(testController) {
  let overallResult = true;
  try {
    testController.log('Starting themeSettingTest...');
    testController.reportCondition('Test started', true);

    const settingKey = 'generalSettings.theme';
    const initialTheme = await testController.performAction({
      type: 'GET_SETTING',
      settingKey,
    });
    testController.log(`Initial theme: ${initialTheme}`);

    const newTheme = initialTheme === 'dark' ? 'light' : 'dark';
    await testController.performAction({
      type: 'UPDATE_SETTING',
      settingKey,
      value: newTheme,
    });
    testController.reportCondition(
      `Attempted to update theme to ${newTheme}`,
      true
    );

    // Wait for settings:changed event
    testController.log("Waiting for 'settings:changed' event...");
    const eventData = await testController.waitForEvent(
      'settings:changed',
      2000
    );

    if (
      !eventData ||
      eventData.key !== settingKey ||
      eventData.value !== newTheme
    ) {
      testController.reportCondition(
        `'settings:changed' event error or data mismatch. Event: ${JSON.stringify(
          eventData
        )}`,
        false
      );
      overallResult = false;
    } else {
      testController.reportCondition(
        `'settings:changed' event received for theme`,
        true
      );
    }

    const updatedTheme = await testController.performAction({
      type: 'GET_SETTING',
      settingKey,
    });
    testController.log(`Theme after update: ${updatedTheme}`);
    if (updatedTheme === newTheme) {
      testController.reportCondition(
        'Theme successfully updated and retrieved',
        true
      );
    } else {
      testController.reportCondition(
        `Theme update verification failed. Expected ${newTheme}, got ${updatedTheme}`,
        false
      );
      overallResult = false;
    }

    // Revert to initial theme
    await testController.performAction({
      type: 'UPDATE_SETTING',
      settingKey,
      value: initialTheme,
    });
    await testController.waitForEvent('settings:changed', 1000); // Wait for revert to process
    testController.log(`Theme reverted to ${initialTheme}`);
  } catch (error) {
    testController.log(`Error in themeSettingTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    overallResult = false;
  } finally {
    await testController.completeTest(overallResult);
  }
}

// Self-register tests
registerTest({
  id: 'test_theme_setting',
  name: 'Theme Setting Test',
  description:
    'Tests updating theme settings and verifying the settings:changed event and persistence.',
  testFunction: themeSettingTest,
  category: 'Settings',
  enabled: false,
  order: 0,
});
