/**
 * Tests for PlayerState and PlayerStatePanel modules
 */

import { registerTest } from '../testRegistry.js';

export function testPlayerStateInitialRegion(testController) {
  testController.log('Testing PlayerState initial region...');
  
  const playerState = testController.centralRegistry.getPublicFunction('playerState', 'getState')();
  const currentRegion = playerState.getCurrentRegion();
  
  testController.reportCondition(
    'Initial region should be Menu',
    currentRegion === 'Menu',
    `Current region: ${currentRegion}`
  );
  
  testController.completeTest();
}

export async function testPlayerStateRegionUpdate(testController) {
  testController.log('Testing PlayerState region update via user:regionMove event...');
  
  const playerState = testController.centralRegistry.getPublicFunction('playerState', 'getState')();
  const initialRegion = playerState.getCurrentRegion();
  
  testController.reportCondition(
    'Initial region should be Menu',
    initialRegion === 'Menu',
    `Initial region: ${initialRegion}`
  );
  
  // Dispatch a user:regionMove event
  testController.eventDispatcher.dispatch('user:regionMove', {
    sourceRegion: 'Menu',
    targetRegion: 'Links House',
    exitName: 'To House'
  }, 'bottom');
  
  // Wait a bit for event processing
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const newRegion = playerState.getCurrentRegion();
  testController.reportCondition(
    'Region should update to Links House',
    newRegion === 'Links House',
    `New region: ${newRegion}`
  );
  
  testController.completeTest();
}

export async function testPlayerStateResetOnRulesLoaded(testController) {
  testController.log('Testing PlayerState reset on rules loaded...');
  
  const playerState = testController.centralRegistry.getPublicFunction('playerState', 'getState')();
  
  // Move to a different region first
  testController.eventDispatcher.dispatch('user:regionMove', {
    sourceRegion: 'Menu',
    targetRegion: 'Links House',
    exitName: 'To House'
  }, 'bottom');
  
  await testController.waitForTimeout(100);
  
  const movedRegion = playerState.getCurrentRegion();
  testController.reportCondition(
    'Should be in Links House before reset',
    movedRegion === 'Links House',
    `Current region: ${movedRegion}`
  );
  
  // Dispatch state:rulesLoaded event
  testController.eventDispatcher.dispatch('state:rulesLoaded', {}, 'bottom');
  
  await testController.waitForTimeout(100);
  
  const resetRegion = playerState.getCurrentRegion();
  testController.reportCondition(
    'Region should reset to Menu',
    resetRegion === 'Menu',
    `Reset region: ${resetRegion}`
  );
  
  testController.completeTest();
}

export async function testPlayerStateEventPublishing(testController) {
  testController.log('Testing PlayerState event publishing...');
  
  const playerState = testController.centralRegistry.getPublicFunction('playerState', 'getState')();
  let eventReceived = false;
  let eventData = null;
  
  // Subscribe to playerState:regionChanged event
  const unsubscribe = testController.eventBus.subscribe('playerState:regionChanged', (data) => {
    eventReceived = true;
    eventData = data;
  }, 'tests');
  
  // Trigger a region change
  testController.eventDispatcher.dispatch('user:regionMove', {
    sourceRegion: 'Menu',
    targetRegion: 'Links House',
    exitName: 'To House'
  }, 'bottom');
  
  await testController.waitForTimeout(100);
  
  testController.reportCondition(
    'playerState:regionChanged event should be received',
    eventReceived,
    `Event received: ${eventReceived}`
  );
  
  testController.reportCondition(
    'Event should contain correct data',
    eventData && eventData.oldRegion === 'Menu' && eventData.newRegion === 'Links House',
    `Event data: ${JSON.stringify(eventData)}`
  );
  
  // Cleanup
  unsubscribe();
  
  testController.completeTest();
}

export async function testPlayerStatePanelDisplay(testController) {
  testController.log('Testing PlayerStatePanel display...');
  
  // Check if panel exists
  const panelElement = document.querySelector('.player-state-panel');
  testController.reportCondition(
    'PlayerStatePanel should exist in DOM',
    panelElement !== null,
    `Panel found: ${panelElement !== null}`
  );
  
  if (panelElement) {
    const regionDisplay = panelElement.querySelector('.region-name');
    testController.reportCondition(
      'Region display element should exist',
      regionDisplay !== null,
      `Region display found: ${regionDisplay !== null}`
    );
    
    if (regionDisplay) {
      const displayedRegion = regionDisplay.textContent;
      testController.reportCondition(
        'Should display current region',
        displayedRegion === 'Menu' || displayedRegion === 'Links House',
        `Displayed region: ${displayedRegion}`
      );
    }
  }
  
  testController.completeTest();
}

export async function testPlayerStatePanelUpdate(testController) {
  testController.log('Testing PlayerStatePanel updates on region change...');
  
  const panelElement = document.querySelector('.player-state-panel');
  if (!panelElement) {
    testController.reportCondition(
      'PlayerStatePanel should exist',
      false,
      'Panel not found in DOM'
    );
    testController.completeTest();
    return;
  }
  
  const regionDisplay = panelElement.querySelector('.region-name');
  const initialRegion = regionDisplay ? regionDisplay.textContent : '';
  
  // Trigger a region change
  testController.eventDispatcher.dispatch('user:regionMove', {
    sourceRegion: 'Menu',
    targetRegion: 'Links House',
    exitName: 'To House'
  }, 'bottom');
  
  await new Promise(resolve => setTimeout(resolve, 200));
  
  const updatedRegion = regionDisplay ? regionDisplay.textContent : '';
  testController.reportCondition(
    'Panel should update to show new region',
    updatedRegion === 'Links House',
    `Initial: ${initialRegion}, Updated: ${updatedRegion}`
  );
  
  // Reset to Menu
  testController.eventDispatcher.dispatch('state:rulesLoaded', {}, 'bottom');
  
  testController.completeTest();
}

// Register all tests
registerTest({
  id: 'test_playerstate_initial_region',
  name: 'PlayerState Initial Region',
  category: 'Player State',
  testFunction: testPlayerStateInitialRegion,
  //enabled: true,
  description: 'Tests that PlayerState initializes with Menu as the current region.'
});

registerTest({
  id: 'test_playerstate_region_update',
  name: 'PlayerState Region Update',
  category: 'Player State',
  testFunction: testPlayerStateRegionUpdate,
  //enabled: true,
  description: 'Tests that PlayerState updates region via user:regionMove events.'
});

registerTest({
  id: 'test_playerstate_reset_on_rules',
  name: 'PlayerState Reset on Rules Loaded',
  category: 'Player State',
  testFunction: testPlayerStateResetOnRulesLoaded,
  //enabled: true,
  description: 'Tests that PlayerState resets to Menu when rules are loaded.'
});

registerTest({
  id: 'test_playerstate_event_publishing',
  name: 'PlayerState Event Publishing',
  category: 'Player State',
  testFunction: testPlayerStateEventPublishing,
  //enabled: true,
  description: 'Tests that PlayerState publishes playerState:regionChanged events.'
});

registerTest({
  id: 'test_playerstatepanel_display',
  name: 'PlayerStatePanel Display',
  category: 'Player State',
  testFunction: testPlayerStatePanelDisplay,
  //enabled: true,
  description: 'Tests that PlayerStatePanel displays in the DOM.'
});

registerTest({
  id: 'test_playerstatepanel_update',
  name: 'PlayerStatePanel Update',
  category: 'Player State',
  testFunction: testPlayerStatePanelUpdate,
  //enabled: true,
  description: 'Tests that PlayerStatePanel updates when region changes.'
});