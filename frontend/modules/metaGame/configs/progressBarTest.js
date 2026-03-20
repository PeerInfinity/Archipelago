// progressBarTest.js - MetaGame Configuration for Progress Bar Testing

import { ResolvedItemConfig, ResolvedStackItemConfig, ItemType, SizeUnitEnum }
  from '../../../libs/golden-layout/js/esm/golden-layout.js';
import discoveryStateSingleton from '../../discovery/singleton.js';
import settingsManager from '../../../app/core/settingsManager.js';

/**
 * Move the progressBarPanel into its own Golden Layout stack above the middle-stack.
 *
 * Uses GL v2's internal tree manipulation (the same code path as drag-and-drop)
 * to operate on live layout items without destroying/recreating any components.
 */
let _moveCompleted = false;

function findItemById(item, id) {
  if (item.id === id) return item;
  if (item.contentItems) {
    for (const child of item.contentItems) {
      const found = findItemById(child, id);
      if (found) return found;
    }
  }
  return null;
}

function moveProgressBarToOwnStack(logger) {
  if (_moveCompleted) {
    logger.info('progressBarTest', 'moveProgressBarToOwnStack already completed, skipping');
    return;
  }

  const gl = window.goldenLayoutInstance;
  if (!gl || !gl.root) {
    logger.warn('progressBarTest', 'Cannot restructure layout: GoldenLayout not available');
    return;
  }

  logger.info('progressBarTest', 'Moving progressBarPanel to its own stack above middle-stack...');

  // Step 1: Find middle-stack in the live layout tree
  const middleStack = findItemById(gl.root, 'middle-stack');
  if (!middleStack) {
    logger.warn('progressBarTest', 'Could not find middle-stack in layout');
    return;
  }

  // Step 2: Find the progressBarPanel ComponentItem in middle-stack
  let progressBarComponent = null;
  for (const child of middleStack.contentItems) {
    if (child.componentType === 'progressBarPanel') {
      progressBarComponent = child;
      break;
    }
  }
  if (!progressBarComponent) {
    logger.warn('progressBarTest', 'Could not find progressBarPanel in middle-stack');
    return;
  }

  const parentRow = middleStack.parent;
  if (!parentRow) {
    logger.warn('progressBarTest', 'middle-stack has no parent');
    return;
  }

  // Step 3: Remove progressBarPanel from middle-stack (keepChild=true preserves the instance)
  middleStack.removeChild(progressBarComponent, true);

  // Step 4: Create a new Stack and add the component to it
  // Following GL's own Stack.onDrop pattern (golden-layout.js lines 6140-6144)
  const stackConfig = ResolvedStackItemConfig.createDefault();
  const progressBarStack = gl.createAndInitContentItem(stackConfig, middleStack);
  progressBarStack.addChild(progressBarComponent);

  // Step 5: Create a new Column to hold progressBarStack + middleStack
  // Following GL's onDrop pattern for vertical drops (golden-layout.js lines 6175-6185)
  const columnConfig = ResolvedItemConfig.createDefault(ItemType.column);
  const newColumn = gl.createContentItem(columnConfig, parentRow);

  // Step 6: Replace middleStack with newColumn in the parent row
  // RowOrColumn.replaceChild inherits the size automatically
  parentRow.replaceChild(middleStack, newColumn);

  // Step 7: Add children to the column (suspendResize=true to defer layout)
  newColumn.addChild(progressBarStack, 0, true);   // top position
  newColumn.addChild(middleStack, undefined, true); // bottom position

  // Step 8: Size progress bar stack to fit one progress bar (~75px: tab header + bar)
  // GL only supports percent sizes, so calculate from the parent's actual pixel height
  const parentHeight = newColumn.element.clientHeight;
  const progressBarPixels = 67;
  const progressBarPercent = parentHeight > 0
    ? Math.min((progressBarPixels / parentHeight) * 100, 30)
    : 15;
  progressBarStack.size = progressBarPercent;
  progressBarStack.sizeUnit = SizeUnitEnum.Percent;
  middleStack.size = 100 - progressBarPercent;
  middleStack.sizeUnit = SizeUnitEnum.Percent;

  // Step 9: Trigger layout recalculation
  newColumn.updateSize(false);

  // Step 10: Restore metaGamePanel as the active tab in middle-stack
  // (removeChild auto-selected a different tab when progressBarPanel was removed)
  const metaGameComponent = middleStack.contentItems.find(
    child => child.componentType === 'metaGamePanel'
  );
  if (metaGameComponent) {
    middleStack.setActiveComponentItem(metaGameComponent, false);
  }

  _moveCompleted = true;
  logger.info('progressBarTest', 'progressBarPanel moved to own stack successfully');
}

export async function initializeMetaGame({ eventBus, dispatcher, logger, progressBarAPI, initializationApi }) {
  logger.info('progressBarTest', 'Initializing progress bar test configuration...');

  try {
    // Step 1: Activate the Progress Bar panel (layout is already configured)
    eventBus.registerPublisher('ui:activatePanel');
    eventBus.publish('ui:activatePanel', { panelId: 'progressBarPanel' });

    // Step 2: Hide the default UI content (header, buttons, info text)
    eventBus.registerPublisher('progressBarPanel:hideUIContent');
    eventBus.publish('progressBarPanel:hideUIContent', {});

    // Step 3: Move progressBarPanel into its own stack above middle-stack
    moveProgressBarToOwnStack(logger);

    // Step 4: Enable discovery mode so regions are discovered on first visit
    await settingsManager.updateSetting('moduleSettings.discovery.enableDiscoveryMode', true);
    await settingsManager.updateSetting('moduleSettings.discovery.regionDiscoveryTrigger', 'onEnter');
    await settingsManager.updateSetting('moduleSettings.discovery.autoDiscoverLocations', true);
    await settingsManager.updateSetting('moduleSettings.discovery.autoDiscoverExits', true);
    logger.info('progressBarTest', 'Discovery mode enabled with onEnter trigger, auto-discover locations and exits');

    // Progress bars are created on-demand by the createProgressBar actions
    // in metaGameConfiguration when user:regionMove / user:locationCheck fire.

    logger.info('progressBarTest', 'Progress bar test configuration initialized successfully');

  } catch (error) {
    logger.error('progressBarTest', 'Failed to initialize progress bar test configuration:', error);
    throw error;
  }
}

// Configuration object that defines the event handling behavior
export const metaGameConfiguration = {
  eventDispatcher: {
    'user:regionMove': {
      // Only show the progress bar when moving to an undiscovered region
      condition: (eventData) => {
        const target = eventData.targetRegion || eventData.region;
        return target && !discoveryStateSingleton.isRegionDiscovered(target);
      },
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
