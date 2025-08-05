// progressBarTest.js - MetaGame Configuration for Progress Bar Testing

export async function initializeMetaGame({ eventBus, dispatcher, logger, progressBarAPI, initializationApi }) {
  logger.info('progressBarTest', 'Initializing progress bar test configuration...');
  
  try {
    // Step 1: Activate the Progress Bar panel (layout is already configured)
    eventBus.registerPublisher('ui:activatePanel', 'progressBarTest');
    eventBus.publish('ui:activatePanel', { panelId: 'progressBarPanel' }, 'progressBarTest');
    
    // Step 2: Hide the default UI content (header, buttons, info text)
    eventBus.registerPublisher('progressBarPanel:hideUIContent', 'progressBarTest');
    eventBus.publish('progressBarPanel:hideUIContent', {}, 'progressBarTest');
    
    // Step 3: Create the two named progress bars
    await createProgressBars(progressBarAPI);
    
    logger.info('progressBarTest', 'Progress bar test configuration initialized successfully');
    
  } catch (error) {
    logger.error('progressBarTest', 'Failed to initialize progress bar test configuration:', error);
    throw error;
  }
}

async function createProgressBars(progressBarAPI) {
  // Wait a moment for the layout to settle
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Get the progress bar panel container
  const targetElement = getProgressBarTargetElement();
  
  if (!targetElement) {
    throw new Error('Progress bar target element not found');
  }
  
  // Create regionMoveBar
  progressBarAPI.create({
    id: 'regionMoveBar',
    targetElement: targetElement,
    mode: 'timer',
    duration: 2000, // 2 seconds
    text: 'Moving to [region name]',
    startEvent: 'metaGame:regionMoveBarStart',
    completionEvent: 'metaGame:regionMoveBarComplete',
    autoCleanup: 'hide',
    eventSource: 'eventBus'
  });
  
  // Create locationCheckBar
  progressBarAPI.create({
    id: 'locationCheckBar',
    targetElement: targetElement,
    mode: 'timer',
    duration: 4000, // 4 seconds
    text: 'Checking location [location name]',
    startEvent: 'metaGame:locationCheckBarStart',
    completionEvent: 'metaGame:locationCheckBarComplete',
    autoCleanup: 'hide',
    eventSource: 'eventBus'
  });
  
  // Initially hide both progress bars
  progressBarAPI.hide('regionMoveBar');
  progressBarAPI.hide('locationCheckBar');
  
  console.log('Progress bars regionMoveBar and locationCheckBar created');
}

function getProgressBarTargetElement() {
  // Try to find the progress bar panel
  const progressBarPanel = document.querySelector('.progress-bar-panel-main');
  if (progressBarPanel) {
    return progressBarPanel;
  }
  
  // Try alternative selectors
  const alternativeSelectors = [
    '.progress-bar-panel',
    '#progress-bar-panel-component .lm_content',
    '[data-panel-id="progressBarPanel"] .lm_content'
  ];
  
  for (const selector of alternativeSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      return element;
    }
  }
  
  console.warn('Progress bar target element not found');
  return null;
}

// Configuration object that defines the event handling behavior
export const metaGameConfiguration = {
  eventDispatcher: {
    'user:regionMove': {
      actions: [
        {
          type: 'hideProgressBar',
          progressBarId: 'locationCheckBar'
        },
        {
          type: 'createProgressBar',
          progressBarId: 'regionMoveBar',
          config: {
            mode: 'timer',
            duration: 2000,
            text: 'Moving to [region name]',
            completionActions: [
              {
                type: 'forwardEvent',
                eventName: 'user:regionMove',
                direction: 'up'
              }
            ]
          }
        }
      ],
      stopPropagation: true
    },
    
    'user:locationCheck': {
      actions: [
        {
          type: 'hideProgressBar',
          progressBarId: 'regionMoveBar'
        },
        {
          type: 'createProgressBar',
          progressBarId: 'locationCheckBar',
          config: {
            mode: 'timer',
            duration: 4000,
            text: 'Checking location [location name]',
            completionActions: [
              {
                type: 'forwardEvent',
                eventName: 'user:locationCheck',
                direction: 'up'
              }
            ]
          }
        }
      ],
      stopPropagation: true
    }
  },
  
  eventBus: {
    // No eventBus configuration needed for this test
  }
};