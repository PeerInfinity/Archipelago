// frontend/modules/timer/timerLogic.js
import { Config } from '../client/core/config.js'; // Assuming Config might be needed for defaults
import { createStateSnapshotInterface } from '../stateManager/stateManagerProxy.js'; // For evaluating rules


// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('timerLogic', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[timerLogic] ${message}`, ...data);
  }
}

export class TimerLogic {
  constructor(dependencies) {
    if (
      !dependencies ||
      !dependencies.stateManager ||
      !dependencies.eventBus ||
      !dependencies.dispatcher
    ) {
      throw new Error(
        '[TimerLogic] Missing required dependencies (stateManager, eventBus, dispatcher).'
      );
    }
    this.stateManager = dependencies.stateManager; // This is stateManagerProxySingleton
    this.eventBus = dependencies.eventBus;
    this.dispatcher = dependencies.dispatcher;
    log('info', 
      '[TimerLogic Constructor] Received dispatcher:',
      typeof this.dispatcher,
      this.dispatcher
    );

    this.minCheckDelay = 5; //30; // Default minimum delay in seconds
    this.maxCheckDelay = 5; //60; // Default maximum delay in seconds
    this.gameInterval = null;
    this.startTime = 0;
    this.endTime = 0;
    this.isLoopModeActive = false; // Internal state to track loop mode for pausing timer
    this.unsubscribeHandles = [];

    log('info', '[TimerLogic] Instance created.');
  }

  initialize() {
    log('info', '[TimerLogic] Initializing...');
    this.stop(); // Ensure timer is stopped initially
    // TODO: Load minCheckDelay/maxCheckDelay from settings if they become configurable
    // For now, using defaults.

    // Subscribe to loop:modeChanged to pause/resume the timer
    const loopModeHandler = (data) => {
      this.isLoopModeActive = data.active;
      if (this.isLoopModeActive && this.isRunning()) {
        log('info', '[TimerLogic] Loop mode activated, pausing timer.');
        this.stop(); // Stop the timer, but don't reset its visual progress entirely (UI might keep last state)
        // Or, we can let the UI clear the progress bar via timer:stopped event.
      } else if (!this.isLoopModeActive && !this.isRunning()) {
        // Potentially auto-restart timer if it was paused due to loop mode.
        // This might need more nuanced logic (e.g., only restart if it was running before loop mode)
        // For now, loop mode exiting doesn't auto-restart the timer. User has to click "Begin!" again.
        log('info', '[TimerLogic] Loop mode deactivated.');
      }
    };
    const unsubLoopMode = this.eventBus.subscribe(
      'loop:modeChanged',
      loopModeHandler
    );
    this.unsubscribeHandles.push(unsubLoopMode);

    // TODO: Add listener for settings:changed if delays become configurable
  }

  isRunning() {
    return this.gameInterval !== null;
  }

  begin() {
    if (this.isLoopModeActive) {
      log('info', '[TimerLogic] Cannot start timer, Loop Mode is active.');
      this.eventBus.publish('ui:notification', {
        message: 'Timer disabled while Loop Mode is active.',
        type: 'warn',
      });
      return;
    }

    if (this.isRunning()) {
      this.stop();
      return;
    }

    const rangeMs = (this.maxCheckDelay - this.minCheckDelay) * 1000;
    const baseMs = this.minCheckDelay * 1000;
    const initialDelay = Math.floor(Math.random() * rangeMs + baseMs);

    this.startTime = Date.now();
    this.endTime = this.startTime + initialDelay;

    this.eventBus.publish('timer:started', {
      startTime: this.startTime,
      endTime: this.endTime,
    });
    this.eventBus.publish('timer:progressUpdate', {
      value: 0,
      max: this.endTime - this.startTime,
    });

    this.gameInterval = setInterval(async () => {
      if (this.isLoopModeActive) {
        // Double check in case mode changes during interval
        this.stop();
        return;
      }

      const currentTime = Date.now();
      const elapsed = currentTime - this.startTime;
      const totalDuration = this.endTime - this.startTime;

      this.eventBus.publish('timer:progressUpdate', {
        value: elapsed,
        max: totalDuration,
      });

      if (currentTime >= this.endTime) {
        const checkDispatched =
          await this._determineAndDispatchNextLocationCheck();
        // TODO: Add gameComplete check if that state is managed elsewhere
        if (!checkDispatched /* || this.gameComplete */) {
          this.stop();
        } else {
          const nextDelay = Math.floor(Math.random() * rangeMs + baseMs);
          this.startTime = Date.now();
          this.endTime = this.startTime + nextDelay;
          this.eventBus.publish('timer:started', {
            startTime: this.startTime,
            endTime: this.endTime,
          });
          this.eventBus.publish('timer:progressUpdate', {
            value: 0,
            max: this.endTime - this.startTime,
          });
        }
      }
    }, Config.TIMER_INTERVAL_MS || 200); // Check more frequently for smoother bar

    log('info', '[TimerLogic] Timer started.');
  }

  stop() {
    if (!this.isRunning()) {
      return;
    }
    clearInterval(this.gameInterval);
    this.gameInterval = null;
    const lastStartTime = this.startTime; // Keep for potential UI update
    const lastEndTime = this.endTime;
    this.startTime = 0;
    this.endTime = 0;

    this.eventBus.publish('timer:stopped', {});
    // Publish a final progress update to reset the bar visually
    this.eventBus.publish('timer:progressUpdate', {
      value: 0,
      max: lastEndTime - lastStartTime || 1,
    });
    log('info', '[TimerLogic] Timer stopped.');
  }

  async _getSnapshotInterface() {
    if (!this.stateManager) {
      log('error', '[TimerLogic] StateManager (Proxy) not available.');
      return null;
    }
    try {
      await this.stateManager.ensureReady();
      const snapshot = this.stateManager.getSnapshot();
      const staticData = this.stateManager.getStaticData();

      if (!snapshot || !staticData) {
        log('warn', 
          '[TimerLogic] Snapshot or static data not available for creating interface.'
        );
        return null;
      }
      const snapshotInterface = createStateSnapshotInterface(
        snapshot,
        staticData
      );
      if (!snapshotInterface) {
        log('error', '[TimerLogic] Failed to create snapshotInterface.');
        return null;
      }
      return snapshotInterface;
    } catch (error) {
      log('error', '[TimerLogic] Error creating snapshot interface:', error);
      return null;
    }
  }

  async _determineAndDispatchNextLocationCheck() {
    log('info', 
      '[TimerLogic] Determining next location to check automatically...'
    );
    const snapshotInterface = await this._getSnapshotInterface();
    if (!snapshotInterface) return false;

    const { snapshot, staticData } = snapshotInterface; // Destructure for convenience

    if (!staticData || !staticData.locations) {
      log('warn', 
        '[TimerLogic] Static location data not available for checking.'
      );
      return false;
    }

    const locationsArray = Array.isArray(staticData.locations)
      ? staticData.locations
      : Object.values(staticData.locations);

    let locationToCheck = null;
    for (const loc of locationsArray) {
      const isChecked = snapshot.checkedLocations?.includes(loc.name);
      if (isChecked) continue;

      // Use snapshotInterface for all evaluations
      const isAccessible = snapshotInterface.isLocationAccessible(loc.name);

      if (isAccessible) {
        // isLocationAccessible already considers parent region reachability internally
        locationToCheck = loc;
        break;
      }
    }

    if (locationToCheck) {
      log('info', 
        `[TimerLogic] Auto-found location to check: ${locationToCheck.name}`
      );
      this.dispatcher.publish(
        'user:locationCheck',
        {
          locationName: locationToCheck.name,
          regionName: locationToCheck.region || locationToCheck.parent_region,
          originator: 'TimerModuleAuto', // Differentiate from QuickCheck
          originalDOMEvent: false,
        },
        { initialTarget: 'bottom' }
      );
      return true;
    } else {
      log('info', 
        '[TimerLogic] No reachable and unchecked locations found for auto-check.'
      );
      this.eventBus.publish('ui:notification', {
        message: 'All available locations checked by timer.',
        type: 'info',
      });
      return false;
    }
  }

  async determineAndDispatchQuickCheck() {
    log('info', '[TimerLogic] Processing Quick Check...');
    const snapshotInterface = await this._getSnapshotInterface();
    if (!snapshotInterface) {
      this.eventBus.publish('ui:notification', {
        message: 'State not ready for Quick Check.',
        type: 'error',
      });
      return false;
    }

    const { snapshot, staticData } = snapshotInterface; // Destructure

    if (!staticData || !staticData.locations || !staticData.regions) {
      log('warn', 
        '[TimerLogic QuickCheck] Snapshot or static data not available.'
      );
      this.eventBus.publish('ui:notification', {
        message: 'Static data not ready for Quick Check.',
        type: 'error',
      });
      return false;
    }

    // Example: Using getDifficultyRequirements from the snapshotInterface
    // const difficultyReqs = snapshotInterface.getDifficultyRequirements ? snapshotInterface.getDifficultyRequirements() : null;
    // log('info', '[TimerLogic QuickCheck] Difficulty Requirements (via interface):', difficultyReqs);

    // Logic for Quick Check:
    // 1. Find the "next" most logical un-checked location.
    // This could be a sophisticated algorithm or a simple one.
    // For now, let's try to find any accessible, un-checked location.
    // If multiple, maybe prioritize based on region exploration, or just take the first.

    const locationsArray = Array.isArray(staticData.locations)
      ? staticData.locations
      : Object.values(staticData.locations);

    let quickCheckTarget = null;

    for (const loc of locationsArray) {
      const isChecked = snapshot.checkedLocations?.includes(loc.name);
      if (isChecked) continue;

      // Use snapshotInterface for all evaluations
      const isAccessible = snapshotInterface.isLocationAccessible(loc.name);

      if (isAccessible) {
        quickCheckTarget = loc;
        break; // Found one
      }
    }

    if (quickCheckTarget) {
      log('info', 
        `[TimerLogic QuickCheck] Dispatching check for: ${quickCheckTarget.name}`
      );
      this.dispatcher.publish(
        'user:locationCheck',
        {
          locationName: quickCheckTarget.name,
          regionName: quickCheckTarget.region || quickCheckTarget.parent_region,
          originator: 'TimerModuleQuickCheck',
          originalDOMEvent: false, // This was triggered by a button, but not a direct location click
        },
        { initialTarget: 'bottom' }
      );
      this.eventBus.publish('ui:notification', {
        message: `Quick Check: Sent ${quickCheckTarget.name}.`,
        type: 'success',
        duration: 3000,
      });
      return true;
    } else {
      log('info', 
        '[TimerLogic QuickCheck] No accessible, un-checked location found.'
      );
      this.eventBus.publish('ui:notification', {
        message: 'Quick Check: No new accessible locations found.',
        type: 'info',
      });
      return false;
    }
  }

  setCheckDelay(minSeconds, maxSeconds = null) {
    const newMin = parseInt(minSeconds, 10);
    const newMax = maxSeconds !== null ? parseInt(maxSeconds, 10) : newMin; // If no max, set to min

    if (isNaN(newMin) || newMin <= 0) {
      log('warn', '[TimerLogic] Invalid minimum check delay provided.');
      return;
    }
    if (isNaN(newMax) || newMax < newMin) {
      log('warn', '[TimerLogic] Invalid maximum check delay provided.');
      return;
    }

    this.minCheckDelay = newMin;
    this.maxCheckDelay = newMax;
    log('info', 
      `[TimerLogic] Check delay updated: ${this.minCheckDelay}s - ${this.maxCheckDelay}s`
    );

    // If timer is running, restart it with new delay logic
    // (This might be too disruptive, consider if just next interval should use new delay)
    if (this.isRunning()) {
      this.stop();
      // Decide if it should auto-begin. For now, let's not, to avoid surprising users.
      // this.begin();
      this.eventBus.publish('ui:notification', {
        message: 'Timer delay updated. Restart timer to apply.',
        type: 'info',
      });
    }
  }

  dispose() {
    log('info', '[TimerLogic] Disposing...');
    this.stop();
    this.unsubscribeHandles.forEach((unsub) => {
      if (typeof unsub === 'function') {
        unsub();
      }
    });
    this.unsubscribeHandles = [];
    log('info', '[TimerLogic] Disposed.');
  }
}
