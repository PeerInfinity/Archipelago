/**
 * Progress Bar Tests
 * Tests for the progressBar and progressBarPanel modules
 */

import eventBus from '../../../app/core/eventBus.js';
import { registerTest } from '../testRegistry.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('progressBarTests', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[progressBarTests] ${message}`, ...data);
  }
}

// Test: Progress Bar 5-Second Timer Test
export async function testProgressBarTimer(testController) {
  const testId = 'progress-bar-timer-test';
  let completionReceived = false;
  let completionPayload = null;
  let completionHandler = null;
  
  try {
    testController.log('Starting progress bar 5-second timer test');
    testController.reportCondition('Timer test started', true);
  
    // Get the Progress Bar panel main area element
    testController.log('Looking for progressBarPanel...');
    
    // First, try to activate the progressBarPanel
    testController.eventBus.publish('ui:activatePanel', { panelId: 'progressBarPanel' }, 'tests');
    
    // Wait for panel to be ready
    const panelReady = await testController.pollForCondition(
      () => {
        const panel = document.querySelector('.progress-bar-panel');
        return panel && panel.querySelector('.progress-bar-panel-main');
      },
      'Progress Bar panel ready',
      5000,
      250
    );
    
    if (!panelReady) {
      throw new Error('Progress Bar panel could not be activated or found');
    }
    
    const mainAreaElement = document.querySelector('.progress-bar-panel-main');
    if (!mainAreaElement) {
      throw new Error('Could not find Progress Bar panel main area element');
    }
    
    // Set up completion event listener
    completionHandler = (payload) => {
      testController.log('Received completion event with payload:', payload);
      completionReceived = true;
      completionPayload = payload;
    };
    
    eventBus.subscribe('test:progressBarComplete', completionHandler, 'tests');
  
    // Send progressBar:create event with test specifications
    testController.log('Creating progress bar with 5-second timer');
    
    eventBus.publish('progressBar:create', {
      id: testId,
      targetElement: mainAreaElement,
      mode: 'timer',
      duration: 5000, // 5 seconds
      text: 'Progress bar test: ',
      startEvent: 'test:progressBarStart',
      completionEvent: 'test:progressBarComplete',
      completionPayload: 'progress complete',
      autoCleanup: 'none' // Keep visible for verification
    }, 'tests');
    
    // Wait a moment for progress bar to be created
    await testController.pollForCondition(
      () => mainAreaElement.querySelector(`[data-progress-id="${testId}"]`) !== null,
      'Progress bar element created',
      2000
    );
    
    testController.log('Progress bar created, sending start event');
    
    // Send the start event
    eventBus.publish('test:progressBarStart', {}, 'tests');
    
    // Wait for completion event (with some buffer time)
    testController.log('Waiting for progress bar to complete (5+ seconds)...');
    
    await testController.pollForCondition(
      () => completionReceived,
      'Progress bar completion event received',
      7000 // 7 seconds to allow for 5-second timer plus buffer
    );
    
    // Verify the completion payload
    if (completionPayload !== 'progress complete') {
      throw new Error(`Expected completion payload "progress complete", got: ${completionPayload}`);
    }
    
    testController.log('✓ Progress bar completed with correct payload');
    
    // Verify progress bar element still exists (autoCleanup: 'none')
    const progressBarElement = mainAreaElement.querySelector(`[data-progress-id="${testId}"]`);
    if (!progressBarElement) {
      throw new Error('Progress bar element was removed but autoCleanup was set to "none"');
    }
    
    // Verify progress bar shows completion state
    const progressElement = progressBarElement.querySelector('.progress-bar-element');
    const textElement = progressBarElement.querySelector('.progress-bar-text');
    
    if (progressElement.value !== progressElement.max) {
      throw new Error(`Progress bar not at 100% completion. Value: ${progressElement.value}, Max: ${progressElement.max}`);
    }
    
    if (!textElement.textContent.includes('Complete')) {
      throw new Error(`Progress bar text does not indicate completion. Text: "${textElement.textContent}"`);
    }
    
    testController.log('✓ Progress bar visual state verified');
    
    // Clean up the test progress bar
    eventBus.publish('progressBar:destroy', { id: testId }, 'tests');
    
    await testController.pollForCondition(
      () => mainAreaElement.querySelector(`[data-progress-id="${testId}"]`) === null,
      'Progress bar destroyed after test',
      1000
    );
    
    testController.log('✓ Test progress bar cleaned up');
    
    testController.reportCondition('All timer test conditions passed', true);
    log('info', '[testProgressBarTimer] COMPLETED successfully');
    await testController.completeTest(true);
    
  } catch (error) {
    log('error', '[testProgressBarTimer] CAUGHT ERROR:', error);
    testController.log(`Error in testProgressBarTimer: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  } finally {
    // Clean up event subscription
    if (completionHandler) {
      eventBus.unsubscribe('test:progressBarComplete', completionHandler);
    }
  }
}

// Test: Progress Bar Event Mode Test
export async function testProgressBarEventMode(testController) {
  const testId = 'progress-bar-event-test';
  let completionReceived = false;
  let completionPayload = null;
  let completionHandler = null;
  
  try {
    testController.log('Starting progress bar event mode test');
    testController.reportCondition('Event mode test started', true);
  
    // Get the Progress Bar panel main area element
    testController.log('Looking for progressBarPanel...');
    
    // First, try to activate the progressBarPanel
    testController.eventBus.publish('ui:activatePanel', { panelId: 'progressBarPanel' }, 'tests');
    
    // Wait for panel to be ready
    const panelReady = await testController.pollForCondition(
      () => {
        const panel = document.querySelector('.progress-bar-panel');
        return panel && panel.querySelector('.progress-bar-panel-main');
      },
      'Progress Bar panel ready',
      5000,
      250
    );
    
    if (!panelReady) {
      throw new Error('Progress Bar panel could not be activated or found');
    }
    
    const mainAreaElement = document.querySelector('.progress-bar-panel-main');
    if (!mainAreaElement) {
      throw new Error('Could not find Progress Bar panel main area element');
    }
    
    // Set up completion event listener
    completionHandler = (payload) => {
      testController.log('Received completion event with payload:', payload);
      completionReceived = true;
      completionPayload = payload;
    };
    
    eventBus.subscribe('test:eventProgressComplete', completionHandler, 'tests');
  
    // Create event-driven progress bar
    testController.log('Creating progress bar with event mode');
    
    eventBus.publish('progressBar:create', {
      id: testId,
      targetElement: mainAreaElement,
      mode: 'event',
      updateEvent: 'test:progressUpdate',
      text: 'Event-driven progress: ',
      startEvent: 'test:eventProgressStart',
      completionEvent: 'test:eventProgressComplete',
      completionPayload: 'event progress complete',
      autoCleanup: 'none'
    }, 'tests');
    
    // Wait for progress bar to be created
    await testController.pollForCondition(
      () => mainAreaElement.querySelector(`[data-progress-id="${testId}"]`) !== null,
      'Event progress bar element created',
      2000
    );
    
    // Start the progress bar
    eventBus.publish('test:eventProgressStart', {}, 'tests');
    
    // Send progress updates
    testController.log('Sending progress updates...');
    
    for (let i = 0; i <= 100; i += 20) {
      eventBus.publish('test:progressUpdate', {
        id: testId,
        value: i,
        max: 100,
        text: `Event-driven progress: ${i}%`
      }, 'tests');
      
      // Small delay between updates
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Wait for completion
    await testController.pollForCondition(
      () => completionReceived,
      'Event progress bar completion received',
      3000
    );
    
    // Verify completion payload
    if (completionPayload !== 'event progress complete') {
      throw new Error(`Expected completion payload "event progress complete", got: ${completionPayload}`);
    }
    
    testController.log('✓ Event progress bar completed with correct payload');
    
    // Clean up
    eventBus.publish('progressBar:destroy', { id: testId }, 'tests');
    
    await testController.pollForCondition(
      () => mainAreaElement.querySelector(`[data-progress-id="${testId}"]`) === null,
      'Event progress bar destroyed after test',
      1000
    );
    
    testController.reportCondition('All event mode test conditions passed', true);
    log('info', '[testProgressBarEventMode] COMPLETED successfully');
    await testController.completeTest(true);
    
  } catch (error) {
    log('error', '[testProgressBarEventMode] CAUGHT ERROR:', error);
    testController.log(`Error in testProgressBarEventMode: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  } finally {
    if (completionHandler) {
      eventBus.unsubscribe('test:eventProgressComplete', completionHandler);
    }
  }
}

// Test: Progress Bar Show/Hide Commands
export async function testProgressBarCommands(testController) {
  const testId = 'progress-bar-commands-test';
  
  try {
    testController.log('Starting progress bar show/hide commands test');
    testController.reportCondition('Commands test started', true);
  
  // Get the Progress Bar panel main area element
  testController.log('Looking for progressBarPanel...');
  
  // First, try to activate the progressBarPanel
  testController.eventBus.publish('ui:activatePanel', { panelId: 'progressBarPanel' }, 'tests');
  
  // Wait for panel to be ready
  const panelReady = await testController.pollForCondition(
    () => {
      const panel = document.querySelector('.progress-bar-panel');
      return panel && panel.querySelector('.progress-bar-panel-main');
    },
    'Progress Bar panel ready',
    5000,
    250
  );
  
  if (!panelReady) {
    throw new Error('Progress Bar panel could not be activated or found');
  }
  
  const mainAreaElement = document.querySelector('.progress-bar-panel-main');
  if (!mainAreaElement) {
    throw new Error('Could not find Progress Bar panel main area element');
  }
  
    // Create progress bar
    eventBus.publish('progressBar:create', {
      id: testId,
      targetElement: mainAreaElement,
      mode: 'timer',
      duration: 10000, // Long duration so we can test commands
      text: 'Command test progress bar',
      startEvent: 'test:commandsStart',
      autoCleanup: 'none'
    }, 'tests');
    
    // Wait for creation
    await testController.pollForCondition(
      () => mainAreaElement.querySelector(`[data-progress-id="${testId}"]`) !== null,
      'Commands test progress bar created',
      2000
    );
    
    const progressBarElement = mainAreaElement.querySelector(`[data-progress-id="${testId}"]`);
    
    // Start progress bar
    eventBus.publish('test:commandsStart', {}, 'tests');
    
    // Test hide command
    testController.log('Testing hide command');
    eventBus.publish('progressBar:hide', { id: testId }, 'tests');
    
    await testController.pollForCondition(
      () => progressBarElement.style.display === 'none',
      'Progress bar hidden',
      1000
    );
    
    testController.log('✓ Progress bar successfully hidden');
    
    // Test show command
    testController.log('Testing show command');
    eventBus.publish('progressBar:show', { id: testId }, 'tests');
    
    await testController.pollForCondition(
      () => progressBarElement.style.display !== 'none',
      'Progress bar shown',
      1000
    );
    
    testController.log('✓ Progress bar successfully shown');
    
    // Test destroy command
    testController.log('Testing destroy command');
    eventBus.publish('progressBar:destroy', { id: testId }, 'tests');
    
    await testController.pollForCondition(
      () => mainAreaElement.querySelector(`[data-progress-id="${testId}"]`) === null,
      'Progress bar destroyed',
      1000
    );
    
    testController.log('✓ Progress bar successfully destroyed');
    
    testController.reportCondition('All commands test conditions passed', true);
    log('info', '[testProgressBarCommands] COMPLETED successfully');
    await testController.completeTest(true);
    
  } catch (error) {
    log('error', '[testProgressBarCommands] CAUGHT ERROR:', error);
    testController.log(`Error in testProgressBarCommands: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    // Clean up on error
    eventBus.publish('progressBar:destroy', { id: testId }, 'tests');
    await testController.completeTest(false);
  }
}

// Self-register tests

registerTest({
  id: 'test_progress_bar_timer',
  name: 'Progress Bar Timer Test',
  description: 'Tests 5-second timer progress bar with start event and completion event validation',
  testFunction: testProgressBarTimer,
  category: 'Progress Bar',
  //enabled: false,
  //order: 0,
});

registerTest({
  id: 'test_progress_bar_event_mode',
  name: 'Progress Bar Event Mode Test',
  description: 'Tests event-driven progress bar with manual progress updates',
  testFunction: testProgressBarEventMode,
  category: 'Progress Bar',
  //enabled: false,
  //order: 1,
});

registerTest({
  id: 'test_progress_bar_commands',
  name: 'Progress Bar Commands Test',
  description: 'Tests show, hide, and destroy commands for progress bars',
  testFunction: testProgressBarCommands,
  category: 'Progress Bar',
  //enabled: false,
  //order: 2,
});