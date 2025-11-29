// frontend/modules/timer/timerLogic.js
import { Config } from '../client/core/config.js'; // Assuming Config might be needed for defaults
import { createStateSnapshotInterface } from '../shared/stateInterface.js'; // For evaluating rules


// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('timerLogic', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[timerLogic] ${message}`, ...data);
  }
}

/**
 * Determines if a location is an "event location" that should be auto-collected.
 * Event locations are those whose items have event=true in the item data.
 *
 * This is different from locations with id=null, which in Archipelago just means
 * the location is not reported to the multiworld server. For example, DLCQuest's
 * coin pickup locations have id=null but should be manually checkable because
 * their items have event=false.
 *
 * @param {Object} loc - The location object
 * @param {Object} itemData - Map or object of item name -> item data
 * @returns {boolean} True if this is an event location (auto-collected)
 */
function isEventLocation(loc, itemData) {
  if (!loc.item || !loc.item.name) {
    return false;
  }

  const fullItemData = itemData instanceof Map
    ? itemData.get(loc.item.name)
    : itemData[loc.item.name];

  return fullItemData && fullItemData.event === true;
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

    this.minCheckDelay = 0; //30; // Default minimum delay in seconds
    this.maxCheckDelay = 0; //60; // Default maximum delay in seconds
    this.gameInterval = null;
    this.startTime = 0;
    this.endTime = 0;
    this.isLoopModeActive = false; // Internal state to track loop mode for pausing timer
    this.unsubscribeHandles = [];

    // Track locations we've attempted to check during this timer session
    // This prevents duplicate check attempts before state updates
    this.attemptedChecks = new Set();

    // Track fallback delay state for zero-delay mode
    // When delay is 0 and no locations are available, we switch to 0.1s delay
    // for up to 10 cycles to give other code time to catch up
    this.isInFallbackDelay = false;
    this.fallbackCycleCount = 0;
    this.maxFallbackCycles = 50;

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
        // For now, loop mode exiting doesn't auto-restart the timer. User has to click "Begin" again.
        log('info', '[TimerLogic] Loop mode deactivated.');
      }
    };
    const unsubLoopMode = this.eventBus.subscribe(
      'loop:modeChanged',
      loopModeHandler
      , 'timer');
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
      }, 'timer');
      return;
    }

    if (this.isRunning()) {
      this.stop();
      return;
    }

    // Clear attempted checks tracking when starting a new timer session
    this.attemptedChecks.clear();
    log('info', '[TimerLogic] Cleared attempted checks tracking for new session');

    // Reset fallback delay state for new timer session
    this.isInFallbackDelay = false;
    this.fallbackCycleCount = 0;

    const rangeMs = (this.maxCheckDelay - this.minCheckDelay) * 1000;
    const baseMs = this.minCheckDelay * 1000;
    const initialDelay = Math.floor(Math.random() * rangeMs + baseMs);

    this.startTime = Date.now();
    this.endTime = this.startTime + initialDelay;

    this.eventBus.publish('timer:started', {
      startTime: this.startTime,
      endTime: this.endTime,
    }, 'timer');
    this.eventBus.publish('timer:progressUpdate', {
      value: 0,
      max: this.endTime - this.startTime,
    }, 'timer');

    // Use faster interval when delay is 0 for immediate checking
    const intervalMs = (this.minCheckDelay === 0 && this.maxCheckDelay === 0)
      ? 10  // Fast mode: check every 10ms when delay is 0
      : (Config.TIMER_INTERVAL_MS || 200); // Normal mode: 200ms for smooth progress bar

    this.gameInterval = setInterval(async () => {
      if (this.isLoopModeActive) {
        // Double check in case mode changes during interval
        this.stop();
        return;
      }

      const currentTime = Date.now();
      const elapsed = currentTime - this.startTime;
      const totalDuration = this.endTime - this.startTime;

      // Only publish progress updates in normal mode (not when delay is 0)
      if (intervalMs > 10) {
        this.eventBus.publish('timer:progressUpdate', {
          value: elapsed,
          max: totalDuration,
        }, 'timer');
      }

      if (currentTime >= this.endTime) {

        // Get snapshot once and reuse it
        const snapshotInterface = await this._getSnapshotInterface();
        let allChecked = false;
        let checkDispatched = false;

        if (snapshotInterface) {
          const { snapshot, staticData } = snapshotInterface;

          // First check if all locations are already complete BEFORE dispatching
          if (staticData && staticData.locations) {
            // staticData.locations is always a Map after initialization
            const locationsArray = Array.from(staticData.locations.values());

            // Get list of manually-checkable locations (exclude event locations)
            // Event locations are determined by the item's event flag, NOT by location.id
            // Locations with id=null may still be manually checkable (e.g., DLCQuest coin pickups)
            const manuallyCheckableLocations = locationsArray.filter(
              loc => !isEventLocation(loc, staticData.items)
            );
            const totalCheckable = manuallyCheckableLocations.length;

            // Count only manually-checkable locations that have been checked
            const checkedSet = new Set(snapshot.checkedLocations || []);
            const checkedManualLocations = manuallyCheckableLocations.filter(
              loc => checkedSet.has(loc.name)
            ).length;

            allChecked = (checkedManualLocations >= totalCheckable);

            log('debug',
              `[TimerLogic] Location check progress: ${checkedManualLocations}/${totalCheckable} manually-checkable locations checked`
            );
          }

          // Only try to dispatch if not all checked yet
          if (!allChecked) {
            // Determine and dispatch next location check using the same snapshot
            checkDispatched = await this._determineAndDispatchNextLocationCheckWithSnapshot(
              snapshotInterface
            );
          }
        }

        if (allChecked) {
          log('info', '[TimerLogic] All manually-checkable locations checked. Stopping timer immediately...');

          // Stop the timer immediately (this clears the interval and publishes timer:stopped)
          this.stop();

          // Do a final ping in the background to catch any remaining event locations
          // This doesn't block the timer from stopping
          (async () => {
            try {
              log('info', '[TimerLogic] Pinging worker...');
              await this.stateManager.pingWorker('timer_final_recalculate', 5000);

              // Wait a bit for snapshot updates to propagate
              await new Promise(resolve => setTimeout(resolve, 500));

              log('info', '[TimerLogic] Final recalculation and ping complete.');
            } catch (error) {
              log('error', '[TimerLogic] Error during final recalculation:', error);
            }
          })();
        } else if (!checkDispatched) {
          // No location was dispatched - check if all manually-checkable locations are done
          // before entering fallback mode

          // Re-check if all locations are complete (in case they were just checked)
          let stillHaveUncheckedLocations = false;
          if (snapshotInterface) {
            const { snapshot, staticData } = snapshotInterface;
            if (staticData && staticData.locations) {
              // staticData.locations is always a Map after initialization
              const locationsArray = Array.from(staticData.locations.values());

              // Use item's event flag to determine manually-checkable locations
              const manuallyCheckableLocations = locationsArray.filter(
                loc => !isEventLocation(loc, staticData.items)
              );
              const checkedSet = new Set(snapshot.checkedLocations || []);
              const checkedManualLocations = manuallyCheckableLocations.filter(
                loc => checkedSet.has(loc.name)
              ).length;

              stillHaveUncheckedLocations = (checkedManualLocations < manuallyCheckableLocations.length);
            }
          }

          // Only enter fallback mode if there are still unchecked locations
          if (!stillHaveUncheckedLocations) {
            log('info', '[TimerLogic] All manually-checkable locations checked. Stopping timer.');
            this.stop();
          } else {
            // Still have unchecked locations - check if we're in zero-delay mode and should use fallback delay
            const isZeroDelayMode = (this.minCheckDelay === 0 && this.maxCheckDelay === 0);

          if (isZeroDelayMode && !this.isInFallbackDelay) {
            // Enter fallback delay mode: switch to 0.1s delay for up to 10 cycles
            log('info', '[TimerLogic] No accessible locations found in zero-delay mode. Entering fallback delay mode (0.1s) to allow other code to catch up.');
            this.isInFallbackDelay = true;
            this.fallbackCycleCount = 0;

            // Set next check with 0.1s delay
            const fallbackDelayMs = 100; // 0.1 seconds
            this.startTime = Date.now();
            this.endTime = this.startTime + fallbackDelayMs;
            this.eventBus.publish('timer:started', {
              startTime: this.startTime,
              endTime: this.endTime,
            }, 'timer');
          } else if (isZeroDelayMode && this.isInFallbackDelay) {
            // Already in fallback mode, increment cycle count
            this.fallbackCycleCount++;

            if (this.fallbackCycleCount >= this.maxFallbackCycles) {
              // Reached max fallback cycles, stop timer
              log('info', `[TimerLogic] No accessible locations found after ${this.maxFallbackCycles} fallback cycles. Stopping timer.`);
              this.isInFallbackDelay = false;
              this.fallbackCycleCount = 0;
              this.stop();
            } else {
              // Continue fallback delay for another cycle
              log('info', `[TimerLogic] Fallback cycle ${this.fallbackCycleCount}/${this.maxFallbackCycles}: No accessible locations yet, continuing with 0.1s delay.`);
              const fallbackDelayMs = 100; // 0.1 seconds
              this.startTime = Date.now();
              this.endTime = this.startTime + fallbackDelayMs;
              this.eventBus.publish('timer:started', {
                startTime: this.startTime,
                endTime: this.endTime,
              }, 'timer');
            }
          } else {
            // Not in zero-delay mode, just stop
            log('info', '[TimerLogic] No accessible locations found. Stopping timer.');
            this.stop();
            }
          }
        } else {
          // Successfully dispatched a check, continue the timer
          // This allows waiting for items from the server to unlock new locations

          // Check if we were in fallback delay mode and found a location
          const isZeroDelayMode = (this.minCheckDelay === 0 && this.maxCheckDelay === 0);
          if (isZeroDelayMode && this.isInFallbackDelay) {
            // Exit fallback mode - we found locations, return to zero delay
            log('info', '[TimerLogic] Location found during fallback mode. Returning to zero-delay mode.');
            this.isInFallbackDelay = false;
            this.fallbackCycleCount = 0;
          }

          const nextDelay = Math.floor(Math.random() * rangeMs + baseMs);
          this.startTime = Date.now();
          this.endTime = this.startTime + nextDelay;
          this.eventBus.publish('timer:started', {
            startTime: this.startTime,
            endTime: this.endTime,
          }, 'timer');
          // Only send progress update in normal mode
          if (intervalMs > 10) {
            this.eventBus.publish('timer:progressUpdate', {
              value: 0,
              max: this.endTime - this.startTime,
            }, 'timer');
          }
        }
      }
    }, intervalMs);

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

    this.eventBus.publish('timer:stopped', {}, 'timer');
    // Publish a final progress update to reset the bar visually
    this.eventBus.publish('timer:progressUpdate', {
      value: 0,
      max: lastEndTime - lastStartTime || 1,
    }, 'timer');
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

    return this._determineAndDispatchNextLocationCheckWithSnapshot(snapshotInterface);
  }

  async _determineAndDispatchNextLocationCheckWithSnapshot(snapshotInterface) {
    const { snapshot, staticData } = snapshotInterface; // Destructure for convenience

    if (!staticData || !staticData.locations) {
      log('warn',
        '[TimerLogic] Static location data not available for checking.'
      );
      return false;
    }

    // staticData.locations is always a Map after initialization
    const locationsArray = Array.from(staticData.locations.values());

    let locationToCheck = null;
    let uncheckedCount = 0;
    let inaccessibleCount = 0;
    let skippedEventCount = 0;
    let skippedAlreadyAttemptedCount = 0;

    for (const loc of locationsArray) {
      const isChecked = snapshot.checkedLocations?.includes(loc.name);
      if (isChecked) continue;

      // Skip event locations (determined by item's event flag, not location.id)
      // Locations with id=null may still be manually checkable (e.g., DLCQuest coin pickups)
      if (isEventLocation(loc, staticData.items)) {
        skippedEventCount++;
        continue;
      }

      // Skip locations we've already attempted to check in this session
      // This prevents duplicate sends before the state updates
      if (this.attemptedChecks.has(loc.name)) {
        skippedAlreadyAttemptedCount++;
        continue;
      }

      uncheckedCount++;

      // Use snapshotInterface for all evaluations
      const isAccessible = snapshotInterface.isLocationAccessible(loc.name);

      if (isAccessible) {
        // isLocationAccessible already considers parent region reachability internally
        locationToCheck = loc;
        break;
      } else {
        inaccessibleCount++;
      }
    }

    if (locationToCheck) {
      // Mark this location as attempted before dispatching
      this.attemptedChecks.add(locationToCheck.name);
      log('info',
        `[TimerLogic] Auto-found location to check: ${locationToCheck.name} (tracked in attempted checks)`
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
      if (skippedAlreadyAttemptedCount > 0) {
        log('info',
          `[TimerLogic] No new reachable locations: ${uncheckedCount} unchecked manually-checkable locations, ` +
          `${inaccessibleCount} inaccessible, ${skippedEventCount} event locations skipped, ` +
          `${skippedAlreadyAttemptedCount} already attempted (waiting for state update)`
        );
      } else {
        // No accessible locations found - trigger recalculation to ensure we haven't missed any event locations
        log('info',
          `[TimerLogic] No accessible locations found (${uncheckedCount} unchecked, ${inaccessibleCount} inaccessible). ` +
          `Pinging worker to check for newly accessible event locations...`
        );

        try {
          // Ping to ensure the worker has finished processing and sent the updated snapshot
          log('debug', '[TimerLogic] Pinging worker to ensure snapshot is updated...');
          await this.stateManager.pingWorker('timer_recalculate_check', 5000);

          // Get the updated snapshot after recalculation
          const updatedSnapshotInterface = await this._getSnapshotInterface();
          if (!updatedSnapshotInterface) {
            log('warn', '[TimerLogic] Could not get updated snapshot after recalculation');
            this.eventBus.publish('ui:notification', {
              message: 'All available locations checked by timer.',
              type: 'info',
            }, 'timer');
            return false;
          }

          const { snapshot: updatedSnapshot, staticData: updatedStaticData } = updatedSnapshotInterface;

          // Check again for accessible locations in the updated snapshot
          // staticData.locations is always a Map after initialization
          const locationsArrayUpdated = Array.from(updatedStaticData.locations.values());

          let newLocationToCheck = null;
          for (const loc of locationsArrayUpdated) {
            const isChecked = updatedSnapshot.checkedLocations?.includes(loc.name);
            if (isChecked) continue;

            // Skip event locations (determined by item's event flag)
            if (isEventLocation(loc, updatedStaticData.items)) continue;
            if (this.attemptedChecks.has(loc.name)) continue;

            const isAccessible = updatedSnapshotInterface.isLocationAccessible(loc.name);
            if (isAccessible) {
              newLocationToCheck = loc;
              break;
            }
          }

          if (newLocationToCheck) {
            // Found a newly accessible location after recalculation!
            this.attemptedChecks.add(newLocationToCheck.name);
            log('info',
              `[TimerLogic] Found newly accessible location after recalculation: ${newLocationToCheck.name}`
            );
            this.dispatcher.publish(
              'user:locationCheck',
              {
                locationName: newLocationToCheck.name,
                regionName: newLocationToCheck.region || newLocationToCheck.parent_region,
                originator: 'TimerModuleAuto',
                originalDOMEvent: false,
              },
              { initialTarget: 'bottom' }
            );
            return true;
          } else {
            log('info', '[TimerLogic] No new accessible locations found after recalculation');
            this.eventBus.publish('ui:notification', {
              message: 'All available locations checked by timer.',
              type: 'info',
            }, 'timer');
          }
        } catch (error) {
          log('error', '[TimerLogic] Error during accessibility recalculation:', error);
          this.eventBus.publish('ui:notification', {
            message: 'All available locations checked by timer.',
            type: 'info',
          }, 'timer');
        }
      }
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
      }, 'timer');
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
      }, 'timer');
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

    // staticData.locations is always a Map after initialization
    const locationsArray = Array.from(staticData.locations.values());

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
      }, 'timer');
      return true;
    } else {
      log('info',
        '[TimerLogic QuickCheck] No accessible, un-checked location found.'
      );
      this.eventBus.publish('ui:notification', {
        message: 'Quick Check: No new accessible locations found.',
        type: 'info',
      }, 'timer');
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
      }, 'timer');
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
