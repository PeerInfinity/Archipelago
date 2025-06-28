// frontend/modules/tests/testController.js
import { stateManagerProxySingleton } from '../stateManager/index.js';
import { createStateSnapshotInterface } from '../stateManager/stateManagerProxy.js';

// --- TestController Class ---
export class TestController {
  constructor(testId, callbacks, eventBus) {
    if (
      !callbacks ||
      typeof callbacks.log !== 'function' ||
      typeof callbacks.reportCondition !== 'function' ||
      typeof callbacks.setTestStatus !== 'function' ||
      typeof callbacks.completeTest !== 'function'
    ) {
      throw new Error(
        'TestController: Missing required callbacks (log, reportCondition, setTestStatus, completeTest)'
      );
    }

    this.testId = testId;
    this.callbacks = callbacks; // { log, reportCondition, setTestStatus, completeTest }
    this.eventBus = eventBus; // Injected eventBus instance
    this.stateManager = stateManagerProxySingleton; // Direct import
  }

  log(message, type = 'info') {
    this.callbacks.log(this.testId, message, type);
  }

  reportCondition(description, passed) {
    this.log(`Condition: "${description}" - ${passed ? 'PASSED' : 'FAILED'}`);
    this.callbacks.reportCondition(
      this.testId,
      description,
      passed ? 'passed' : 'failed'
    );
  }

  async performAction(actionDetails) {
    const actionValue =
      actionDetails.payload ||
      actionDetails.itemName ||
      actionDetails.locationName ||
      actionDetails.selector;
    let detailsString =
      actionValue !== undefined && actionValue !== null
        ? String(actionValue)
        : '(no details)';
    if (typeof actionValue === 'object' && actionValue !== null) {
      try {
        detailsString = JSON.stringify(actionValue);
      } catch (e) {
        /* ignore */
      }
    }
    this.log(
      `Performing action: ${actionDetails.type}. Details: ${detailsString}`,
      'info'
    );

    // Ensure StateManager is ready for most actions
    if (
      actionDetails.type !== 'DISPATCH_EVENT' &&
      actionDetails.type !== 'SIMULATE_CLICK' &&
      // actionDetails.type !== 'LOAD_RULES_DATA' && // LOAD_RULES_DATA will use stateManager
      actionDetails.type !== 'GET_SETTING' &&
      actionDetails.type !== 'UPDATE_SETTING' &&
      actionDetails.type !== 'SIMULATE_SERVER_MESSAGE'
    ) {
      if (!this.stateManager) {
        const msg = 'StateManager (Proxy) not available for action.';
        this.log(msg, 'error');
        throw new Error(msg);
      }
      try {
        // ensureReady might need a slightly longer timeout for initial loads during tests
        await this.stateManager.ensureReady(5000);
      } catch (e) {
        const msg = `StateManager (Proxy) not ready for action: ${e.message}`;
        this.log(msg, 'error');
        throw new Error(msg);
      }
    }

    let result;

    switch (actionDetails.type) {
      case 'DISPATCH_EVENT':
        if (this.eventBus) {
          this.eventBus.publish(actionDetails.eventName, actionDetails.payload);
        } else {
          this.log(
            'Error: eventBus not available for DISPATCH_EVENT.',
            'error'
          );
        }
        return;

      case 'LOAD_RULES_DATA':
        if (
          this.stateManager &&
          typeof this.stateManager.loadRules === 'function'
        ) {
          this.log('Calling StateManager.loadRules...');
          try {
            const playerInfo = {
              playerId: actionDetails.playerId || '1',
              playerName:
                actionDetails.playerName ||
                `TestPlayer${actionDetails.playerId || '1'}`,
            };

            // Set up the event listener BEFORE calling loadRules to avoid race condition
            const rulesLoadedPromise = this.waitForEvent(
              'stateManager:rulesLoaded',
              5000
            );

            // loadRules is fire-and-forget to the worker, but it triggers rulesLoadedConfirmation.
            await this.stateManager.loadRules(
              actionDetails.payload,
              playerInfo
            );
            this.log('StateManager.loadRules command sent.');

            // Wait for the worker to process and confirm, which includes the first snapshot.
            await rulesLoadedPromise; // Use the pre-established promise
            this.log(
              'stateManager:rulesLoaded event received after LOAD_RULES_DATA.'
            );
          } catch (error) {
            this.log(
              `Error calling StateManager.loadRules or waiting for event: ${error.message}`,
              'error'
            );
            throw error;
          }
        } else {
          const errMsg =
            'StateManager proxy or its loadRules method not available.';
          this.log(errMsg, 'error');
          throw new Error(errMsg);
        }
        return; // This action is for setup

      case 'ADD_ITEM_TO_INVENTORY':
        if (this.stateManager && actionDetails.itemName) {
          // Set up the event listener BEFORE calling addItemToInventory to avoid race condition
          const snapshotUpdatedPromise = this.waitForEvent(
            'stateManager:snapshotUpdated',
            3000
          );

          // stateManager.addItemToInventory sends command to worker, worker sends snapshot back
          await this.stateManager.addItemToInventory(actionDetails.itemName);
          this.log(
            `Action ADD_ITEM_TO_INVENTORY for "${actionDetails.itemName}" sent.`
          );

          // Wait for the snapshot reflecting this change
          await snapshotUpdatedPromise; // Use the pre-established promise
          this.log(
            'stateManager:snapshotUpdated event received after ADD_ITEM_TO_INVENTORY.'
          );
        } else {
          throw new Error(
            'Missing itemName or StateManager for ADD_ITEM_TO_INVENTORY'
          );
        }
        return;

      case 'CHECK_LOCATION':
        if (this.stateManager && actionDetails.locationName) {
          // Set up the event listener BEFORE calling checkLocation to avoid race condition
          const snapshotUpdatedPromise = this.waitForEvent(
            'stateManager:snapshotUpdated',
            3000
          );

          await this.stateManager.checkLocation(actionDetails.locationName);
          this.log(
            `Action CHECK_LOCATION for "${actionDetails.locationName}" sent.`
          );

          await snapshotUpdatedPromise; // Use the pre-established promise
          this.log(
            'stateManager:snapshotUpdated event received after CHECK_LOCATION.'
          );
        } else {
          throw new Error(
            'Missing locationName or StateManager for CHECK_LOCATION'
          );
        }
        return;

      case 'GET_INVENTORY_ITEM_COUNT': {
        // This action reads state, assumes prior sync point (like awaited snapshotUpdated) has occurred.
        const snapshot = this.stateManager.getSnapshot(); // Reads proxy's uiCache
        if (snapshot && snapshot.inventory && actionDetails.itemName) {
          result = snapshot.inventory[actionDetails.itemName] || 0;
        } else {
          this.log(
            'Warning: Could not get item count, snapshot or inventory missing.',
            'warn'
          );
          result = 0;
        }
        break;
      }

      case 'IS_LOCATION_ACCESSIBLE': {
        // This action reads state, assumes prior sync point.
        const snapshot = this.stateManager.getSnapshot();
        const staticData = this.stateManager.getStaticData();
        if (snapshot && staticData && actionDetails.locationName) {
          const snapshotInterface = createStateSnapshotInterface(
            snapshot,
            staticData
          );
          let locData = staticData.locations[actionDetails.locationName];
          if (!locData && staticData.regions) {
            // Basic search in regions if not direct
            for (const regionKey in staticData.regions) {
              const region = staticData.regions[regionKey];
              if (region.locations && Array.isArray(region.locations)) {
                const foundLoc = region.locations.find(
                  (l) => l.name === actionDetails.locationName
                );
                if (foundLoc) {
                  locData = {
                    ...foundLoc,
                    parent_region: region.name || regionKey,
                  };
                  break;
                }
              }
            }
          }

          if (!locData) {
            this.log(
              `Location data for "${actionDetails.locationName}" not found in staticData or its regions.`,
              'warn'
            );
            result = false;
          } else {
            const regionToEvaluate = locData.parent_region || locData.region;
            if (!regionToEvaluate) {
              this.log(
                `Location "${actionDetails.locationName}" has no parent_region or region defined.`,
                'warn'
              );
              result = false;
            } else {
              const regionReachable =
                snapshotInterface.isRegionReachable(regionToEvaluate);
              if (!regionReachable) {
                this.log(
                  `Region '${regionToEvaluate}' for location '${actionDetails.locationName}' is NOT reachable.`,
                  'warn'
                );
                result = false;
              } else {
                result = snapshotInterface.evaluateRule(locData.access_rule);
              }
            }
          }
        } else {
          this.log(
            'Warning: Could not check location accessibility, context missing.',
            'warn'
          );
          result = false;
        }
        break;
      }

      case 'IS_REGION_REACHABLE': {
        const snapshot = this.stateManager.getSnapshot();
        if (snapshot && snapshot.reachability && actionDetails.regionName) {
          const status = snapshot.reachability[actionDetails.regionName];
          return (
            status === 'reachable' || status === 'checked' || status === true
          );
        }
        this.log(
          'Warning: Could not check region reachability, context missing.',
          'warn'
        );
        return false;
      }

      case 'AWAIT_WORKER_PING':
        if (
          this.stateManager &&
          typeof this.stateManager.pingWorker === 'function'
        ) {
          this.log(`Pinging worker with payload: ${actionDetails.payload}`);
          try {
            const pongPayload = await this.stateManager.pingWorker(
              actionDetails.payload,
              2000
            );
            this.log(`Received pong from worker with payload: ${pongPayload}`);
            return pongPayload;
          } catch (error) {
            this.log(`Error during worker ping: ${error.message}`, 'error');
            throw error;
          }
        } else {
          const errMsg =
            'StateManager proxy or pingWorker method not available.';
          this.log(errMsg, 'error');
          throw new Error(errMsg);
        }
      // break; // Unreachable code after throw/return

      case 'SIMULATE_CLICK':
        // After simulating click, if the click is expected to change state,
        // the test should then await 'stateManager:snapshotUpdated' if needed.
        // Or, the specific UI handler for the click might trigger a more specific event.
        // For now, SIMULATE_CLICK is fire-and-forget from controller's perspective.
        // The actual state change verification would come from subsequent GET_X or IS_X actions.
        if (actionDetails.selector) {
          const element = document.querySelector(actionDetails.selector);
          if (element) {
            element.click();
            this.log(`Clicked element: ${actionDetails.selector}`);
            // If this click is known to cause state changes processed by StateManager,
            // the test script might need to follow this with a waitForEvent('stateManager:snapshotUpdated')
          } else {
            this.log(
              `Element not found for click: ${actionDetails.selector}`,
              'error'
            );
            throw new Error(
              `Element not found for SIMULATE_CLICK: ${actionDetails.selector}`
            );
          }
        } else {
          throw new Error('Missing selector for SIMULATE_CLICK');
        }
        return; // Fire-and-forget

      case 'GET_SETTING':
        if (
          actionDetails.settingKey &&
          typeof actionDetails.settingKey === 'string'
        ) {
          const settingsManager = (
            await import('../../app/core/settingsManager.js')
          ).default;
          if (!settingsManager)
            throw new Error('settingsManager not found for GET_SETTING');
          return await settingsManager.getSetting(
            actionDetails.settingKey,
            actionDetails.defaultValue
          );
        }
        throw new Error('Missing settingKey for GET_SETTING');

      case 'UPDATE_SETTING':
        if (
          actionDetails.settingKey &&
          typeof actionDetails.settingKey === 'string' &&
          actionDetails.value !== undefined
        ) {
          const settingsManagerModule = await import(
            '../../app/core/settingsManager.js'
          );
          const settingsManager = settingsManagerModule.default;
          if (!settingsManager)
            throw new Error('settingsManager not found for UPDATE_SETTING');

          // Set up the event listener BEFORE calling updateSetting to avoid race condition
          const settingsChangedPromise = this.waitForEvent(
            'settings:changed',
            1000
          );

          await settingsManager.updateSetting(
            actionDetails.settingKey,
            actionDetails.value
          );

          // Wait for the settings:changed event to ensure the update has propagated
          await settingsChangedPromise; // Use the pre-established promise
          this.log(
            `settings:changed event received after UPDATE_SETTING for ${actionDetails.settingKey}.`
          );
          return;
        }
        throw new Error('Missing settingKey or value for UPDATE_SETTING');

      case 'SIMULATE_SERVER_MESSAGE':
        if (
          actionDetails.commandObject &&
          typeof actionDetails.commandObject === 'object'
        ) {
          const messageHandler = (
            await import('../client/core/messageHandler.js')
          ).default;
          if (!messageHandler)
            throw new Error(
              'MessageHandler not found for SIMULATE_SERVER_MESSAGE'
            );
          messageHandler.processMessage(actionDetails.commandObject);
          return; // Relies on events/pings for sync
        }
        throw new Error('Missing commandObject for SIMULATE_SERVER_MESSAGE');

      case 'IS_LOCATION_CHECKED': {
        const snapshot = this.stateManager.getSnapshot();
        if (snapshot && snapshot.checkedLocations && actionDetails.locationName) {
          result = snapshot.checkedLocations.includes(actionDetails.locationName);
        } else {
          this.log(
            'Warning: Could not determine if location is checked for IS_LOCATION_CHECKED.',
            'warn'
          );
          result = false;
        }
        break;
      }

      default:
        this.log(`Unknown action type: ${actionDetails.type}`, 'warn');
        return Promise.resolve();
    }

    return result;
  }

  waitForEvent(eventName, timeoutMilliseconds = 5000) {
    this.log(
      `Waiting for event: ${eventName} (timeout: ${timeoutMilliseconds}ms)`
    );
    this.callbacks.setTestStatus(this.testId, 'waiting_for_event', eventName);
    return new Promise((resolve, reject) => {
      if (!this.eventBus) {
        const msg = 'eventBus is not available in TestController';
        this.log(msg, 'error');
        reject(new Error(msg));
        return;
      }
      let timeoutId;
      const handler = (data) => {
        clearTimeout(timeoutId);
        // Ensure eventBus and unsubscribe are still valid before calling
        if (this.eventBus && typeof this.eventBus.unsubscribe === 'function') {
          this.eventBus.unsubscribe(eventName, handler);
        }
        this.log(`Event received: ${eventName}`);
        this.log(`Event data: ${JSON.stringify(data)}`, 'debug');
        this.callbacks.setTestStatus(this.testId, 'running');
        resolve(data);
      };
      timeoutId = setTimeout(() => {
        if (this.eventBus && typeof this.eventBus.unsubscribe === 'function') {
          this.eventBus.unsubscribe(eventName, handler);
        }
        const msg = `Timeout waiting for event ${eventName}`;
        this.log(msg, 'error');
        this.callbacks.setTestStatus(this.testId, 'failed');
        reject(new Error(msg));
      }, timeoutMilliseconds);

      if (this.eventBus && typeof this.eventBus.subscribe === 'function') {
        this.eventBus.subscribe(eventName, handler);
      } else {
        clearTimeout(timeoutId);
        const msg =
          'eventBus or its subscribe method is not available for waitForEvent';
        this.log(msg, 'error');
        reject(new Error(msg));
      }
    });
  }

  async loadConfiguration(/*filePath, type*/) {
    // This method might be better placed in the orchestrator (testLogic.js)
    // if it needs appInitializationApiInstance directly.
    // For now, assuming it's complex and might be refactored later or removed
    // if test setup data is loaded differently.
    this.log(
      'loadConfiguration is a placeholder in this refactor and should be re-evaluated.',
      'warn'
    );
    throw new Error(
      'loadConfiguration not fully implemented in TestController post-refactor.'
    );
  }

  async completeTest(overallPassStatus) {
    this.log(
      `Test completion signal: ${overallPassStatus ? 'PASSED' : 'FAILED'}`
    );
    // The status update and event emission will be handled by the callback
    this.callbacks.completeTest(this.testId, overallPassStatus);
  }

  // New method: pollForCondition
  async pollForCondition(checkFn, description, timeoutMs, intervalMs) {
    const logPrefix = this.testId ? `[${this.testId}] ` : '';
    this.log(
      `${logPrefix}Polling for condition: \"${description}\" (timeout: ${timeoutMs}ms, interval: ${intervalMs}ms)...`
    );
    const startTime = Date.now();

    return new Promise((resolve) => {
      const intervalId = setInterval(async () => {
        let conditionMet = false;
        try {
          conditionMet = await checkFn();
        } catch (e) {
          this.log(
            `${logPrefix}Error in checkFn for condition "${description}": ${e}`,
            'error'
          );
          // Continue polling until timeout
        }

        if (conditionMet) {
          clearInterval(intervalId);
          this.log(`${logPrefix}Condition met for: \"${description}\".`);
          resolve(true);
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(intervalId);
          this.log(
            `${logPrefix}Timeout polling for condition: \"${description}\".`,
            'warn'
          );
          resolve(false);
        }
      }, intervalMs);
    });
  }

  async pollForValue(checkFn, description, timeoutMs, intervalMs) {
    const logPrefix = this.testId ? `[${this.testId}] ` : '';
    this.log(
      `${logPrefix}Polling for value: \"${description}\" (timeout: ${timeoutMs}ms, interval: ${intervalMs}ms)...`
    );
    const startTime = Date.now();

    return new Promise((resolve) => {
      const intervalId = setInterval(async () => {
        let result = null;
        let errorOccurred = false;
        try {
          result = await checkFn();
        } catch (e) {
          this.log(
            `${logPrefix}Error in checkFn for value "${description}": ${e}`,
            'error'
          );
          errorOccurred = true;
        }

        // Resolve if a truthy result is found (and no error occurred)
        if (!errorOccurred && result) {
          clearInterval(intervalId);
          this.log(`${logPrefix}Value found for: \"${description}\".`);
          resolve(result);
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(intervalId);
          this.log(
            `${logPrefix}Timeout polling for value: \"${description}\".`,
            'warn'
          );
          resolve(null); // Resolve with null on timeout or if result remains null/falsy
        }
        // If errorOccurred or result is falsy, continue polling until timeout
      }, intervalMs);
    });
  }
}
