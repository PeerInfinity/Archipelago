// frontend/modules/tests/testCases/coreTests.js

import { registerTest } from '../testRegistry.js';

export async function simpleEventTest(testController) {
  try {
    testController.log('Starting simpleEventTest...');
    testController.reportCondition('Test started', true);

    setTimeout(() => {
      console.log(
        '[Test Case - simpleEventTest] Publishing custom:testEventAfterDelay'
      );
      // Assuming testController.eventBus is the correct eventBus instance
      testController.eventBus.publish('custom:testEventAfterDelay', {
        detail: 'Event Fired!',
      });
    }, 1000);

    testController.log('Waiting for custom:testEventAfterDelay...');
    const eventData = await testController.waitForEvent(
      'custom:testEventAfterDelay',
      2000
    );

    let passCondition = eventData && eventData.detail === 'Event Fired!';
    testController.reportCondition(
      'custom:testEventAfterDelay received correctly',
      passCondition
    );
    await testController.completeTest(passCondition);
  } catch (error) {
    testController.log(`Error in simpleEventTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

export async function superQuickTest(testController) {
  console.log('[superQuickTest] STARTED - function entry point');
  try {
    console.log('[superQuickTest] About to call testController.log...');
    testController.log('Starting superQuickTest...');
    console.log('[superQuickTest] About to call reportCondition...');
    testController.reportCondition('Super quick test started', true);
    console.log('[superQuickTest] About to do math...');
    // Simulate some quick synchronous operations
    let x = 1 + 1;
    if (x !== 2) {
      console.log('[superQuickTest] Math failed!');
      testController.reportCondition('Basic math failed (1+1!=2)', false);
      await testController.completeTest(false);
      return;
    }
    console.log('[superQuickTest] Math passed, reporting...');
    testController.reportCondition('Basic math passed (1+1=2)', true);
    testController.reportCondition(
      'Super quick test finished successfully',
      true
    );
    console.log('[superQuickTest] About to call completeTest(true)...');
    await testController.completeTest(true);
    console.log('[superQuickTest] COMPLETED successfully');
  } catch (error) {
    console.log('[superQuickTest] CAUGHT ERROR:', error);
    testController.log(`Error in superQuickTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

// Self-register tests
registerTest({
  id: 'test_1_simple_event',
  name: 'Test Simple Event Wait',
  description:
    'Checks if waitForEvent correctly pauses and resumes on a custom event.',
  testFunction: simpleEventTest,
  category: 'Core',
  enabled: false,
  order: 0,
});

registerTest({
  id: 'test_4_super_quick',
  name: 'Super Quick Test',
  description: 'A test that completes almost instantly.',
  testFunction: superQuickTest,
  category: 'Core',
  enabled: true,
  order: 1,
});
