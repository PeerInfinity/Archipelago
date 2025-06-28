// frontend/modules/timerPanel/timerPanelUI.js
// import { centralRegistry } from '../../app/core/centralRegistry.js'; // REMOVED - No longer used for timer hosting
import eventBus from '../../app/core/eventBus.js'; // Keep for 'module:stateChanged' if still used for other purposes
import { centralRegistry } from '../../app/core/centralRegistry.js'; // RE-ADD import
// Import helper from its own index.js to get module context
import {
  // getTimerPanelModuleLoadPriority, // REMOVED
  getTimerPanelModuleId,
  // getHostedUIComponentType, // REMOVED
  setTimerPanelUIInstance, // ADDED
  getModuleDispatcher, // ADDED
  getModuleEventBus, // ADDED
} from './index.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('timerPanelUI', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[timerPanelUI] ${message}`, ...data);
  }
}

// const TIMER_UI_COMPONENT_TYPE = 'TimerProgressUI'; // REMOVED - No longer needed for this class

export class TimerPanelUI {
  constructor(container, componentState, componentType) {
    this.moduleId = componentType || getTimerPanelModuleId();
    log('info', `[TimerPanelUI for ${this.moduleId}] Constructor called.`);
    setTimerPanelUIInstance(this); // ADDED - Register instance with module's index.js
    this.container = container;
    this.componentState = componentState;

    this.rootElement = document.createElement('div');
    this.rootElement.className = 'timer-panel-ui-container panel-container';
    this.rootElement.style.width = '100%';
    this.rootElement.style.height = '100%';
    this.rootElement.style.overflow = 'auto';
    this.rootElement.style.padding = '5px';
    this.rootElement.style.boxSizing = 'border-box';
    this.rootElement.innerHTML = '';

    this.timerHostPlaceholder = document.createElement('div');
    this.timerHostPlaceholder.id = `timer-ui-host-in-${
      this.moduleId
    }-${Date.now()}`;
    this.timerHostPlaceholder.style.width = '100%';
    // this.timerHostPlaceholder.style.height = 'calc(100% - 30px)'; // Example, adjust as needed
    this.timerHostPlaceholder.style.height = '100%';
    this.timerHostPlaceholder.innerHTML = '';
    this.rootElement.appendChild(this.timerHostPlaceholder);

    // this.hostedComponentType = getHostedUIComponentType(); // REMOVED
    // this.isHostActive = false; // REMOVED
    this.moduleStateChangeHandler =
      this._handleSelfModuleStateChange.bind(this);

    this.container.on('open', this._handlePanelOpen.bind(this));
    this.container.on('show', this._handlePanelShow.bind(this));
    this.container.on('hide', this._handlePanelHide.bind(this));
    this.container.on('destroy', this._handlePanelDestroy.bind(this));

    // This subscription might still be relevant if the panel needs to react to its own module being disabled/enabled
    // for reasons other than timer hosting. If not, it can be removed.
    // For now, keep it, but its logic in _handleSelfModuleStateChange will change.
    eventBus.subscribe('module:stateChanged', this.moduleStateChangeHandler);
    // centralRegistry.registerEventBusSubscriberIntent(this.moduleId, 'module:stateChanged'); // This was likely for the old system; remove if not broadly used

    log(
      'info',
      `[TimerPanelUI for ${this.moduleId}] Panel UI instance created. Placeholder ready.`
    );
  }

  getRootElement() {
    return this.rootElement;
  }

  onMount(glContainer, componentState) {
    log(
      'info',
      `[TimerPanelUI for ${this.moduleId}] onMount CALLED. Panel ready.`
    );
    // OLD LOGIC REMOVED
    // if (this.container && this.container.isVisible) {
    //   this._registerAsHost(true);
    // } else {
    //   this._registerAsHost(false);
    // }
    // New logic: The panel is now ready. If a rehome is needed, system:rehomeTimerUI event will handle it.
  }

  onUnmount() {
    log('info', `[TimerPanelUI for ${this.moduleId}] onUnmount CALLED.`);
    setTimerPanelUIInstance(null); // Clear instance on unmount/destroy
    // OLD LOGIC REMOVED
    // this._cleanupHostRegistration();

    if (this.moduleStateChangeHandler) {
      eventBus.unsubscribe(
        'module:stateChanged',
        this.moduleStateChangeHandler
      );
      this.moduleStateChangeHandler = null;
    }
    if (
      this.timerHostPlaceholder &&
      this.timerHostPlaceholder.parentNode === this.rootElement
    ) {
      this.rootElement.removeChild(this.timerHostPlaceholder);
    }
    this.timerHostPlaceholder = null;
  }

  _handlePanelOpen() {
    log(
      'info',
      `[TimerPanelUI for ${this.moduleId}] GoldenLayout 'open' event.`
    );
    // OLD LOGIC REMOVED
    // if (this.container && this.container.isVisible) {
    //   this._registerAsHost(true);
    // }
    // New: Panel is open and potentially visible. It will respond to rehome events.
  }

  _handlePanelShow() {
    log(
      'info',
      `[TimerPanelUI for ${this.moduleId}] GoldenLayout 'show' event. Panel tab selected.`
    );
    // OLD LOGIC REMOVED
    // this._registerAsHost(true);
    // New: Panel is shown. It will respond to rehome events.
    // If it becoming visible *should* trigger a rehome, then an event needs to be dispatched.
    // For now, it just becomes a potential candidate.
  }

  _handlePanelHide() {
    log(
      'info',
      `[TimerPanelUI for ${this.moduleId}] GoldenLayout 'hide' event. Panel tab deselected.`
    );
    // OLD LOGIC REMOVED
    // centralRegistry.setUIHostActive(this.hostedComponentType, this.moduleId, false);
    // New: If this panel was hosting, and is now hidden, TimerUI might need rehoming.
    // This could be a trigger to dispatch 'system:rehomeTimerUI'.
    // For now, this panel just notes it's hidden. The next 'system:rehomeTimerUI' will skip it if not visible.
    // If it *was* hosting the timer, and it's hidden, a `system:rehomeTimerUI` should be dispatched
    // by something (e.g. init.js listening to a generic panel hide event, or this module itself).
    // The user plan stated: "The destruction of a host panel will naturally lead to the Timer UI being detached.
    // The next system:rehomeTimerUI dispatch ... will find a new home."
    // Hiding is not destruction, but makes it non-viable.
    // For now, let's stick to this panel only reacting to rehome events.
  }

  _handlePanelDestroy() {
    log(
      'info',
      `[TimerPanelUI for ${this.moduleId}] GoldenLayout 'destroy' event. Calling onUnmount.`
    );
    this.onUnmount(); // onUnmount now includes setTimerPanelUIInstance(null)

    // ADDED: Notify that this panel was manually closed, so ModuleManager can update state
    const bus = getModuleEventBus();
    if (bus && typeof bus.publish === 'function') {
      log(
        'info',
        `[TimerPanelUI for ${this.moduleId}] Panel destroyed, publishing ui:panelManuallyClosed.`
      );
      bus.publish('ui:panelManuallyClosed', { moduleId: this.moduleId });
    } else {
      log(
        'warn',
        `[TimerPanelUI for ${this.moduleId}] Could not get eventBus or publish function to send ui:panelManuallyClosed.`
      );
    }

    // Dispatch rehome event for TimerUI
    const dispatcher = getModuleDispatcher();
    if (dispatcher && typeof dispatcher.publish === 'function') {
      log(
        'info',
        `[TimerPanelUI for ${this.moduleId}] Panel destroyed, dispatching system:rehomeTimerUI.`
      );
      // Use setTimeout to ensure this dispatch happens after current call stack (including GL destroy) unwinds
      setTimeout(() => {
        dispatcher.publish(
          'system:rehomeTimerUI', // Event name
          {}, // Event data
          { initialTarget: 'top' } // Dispatch options
        );
      }, 0);
    } else {
      log(
        'warn',
        `[TimerPanelUI for ${this.moduleId}] Could not get dispatcher or publish function to rehome TimerUI on panel destroy.`
      );
    }
  }

  // _cleanupHostRegistration() // ENTIRELY REMOVED
  // _registerAsHost(isActive) // ENTIRELY REMOVED

  _handleSelfModuleStateChange({ moduleId, enabled }) {
    if (moduleId === this.moduleId) {
      log(
        'info',
        `[TimerPanelUI for ${this.moduleId}] Received self module:stateChanged. Module: ${moduleId}, Enabled: ${enabled}`
      );
      // OLD LOGIC REMOVED
      // if (enabled) {
      //   if (this.container && this.container.isVisible) { this._registerAsHost(true); }
      // } else {
      //   this._registerAsHost(false);
      // }
      // New logic: If module is disabled, it's unlikely to be a viable host.
      // If it was hosting, this change in state should probably trigger a rehome event.
      // For now, this panel simply acknowledges its state change.
      // If it was hosting TimerUI and this module is disabled, it might need to dispatch system:rehomeTimerUI
      // if (this.timerHostPlaceholder && this.timerHostPlaceholder.contains(timerInstance.domElement) && !enabled) {
      //    this.dispatcher.publish('system:rehomeTimerUI', {}, { initialTarget: 'top' });
      // }
      // This requires having access to dispatcher and knowing if it's currently hosting.
      // For simplicity of this step, let's assume an external mechanism triggers rehome if needed.
    }
  }

  // --- New Timer Hosting Logic --- //
  handleRehomeTimerUI(eventData, propagationOptions, dispatcher) {
    // Added dispatcher parameter
    const panelIdForLog =
      this.container?.config?.id || this.container?.id || this.moduleId;
    log(
      'info',
      `[TimerPanelUI - ${panelIdForLog}] handleRehomeTimerUI called.`
    );
    let isViableHost = false;

    if (
      this.container &&
      this.container.element &&
      this.timerHostPlaceholder &&
      document.body.contains(this.timerHostPlaceholder)
    ) {
      isViableHost = true;
      if (
        typeof this.container.isVisible === 'boolean' &&
        !this.container.isVisible
      ) {
        isViableHost = false;
        log(
          'info',
          `[TimerPanelUI - ${panelIdForLog}] Panel container reports not visible.`
        );
      }
    } else {
      if (!this.container || !this.container.element)
        log(
          'info',
          `[TimerPanelUI - ${panelIdForLog}] Container or container.element missing.`
        );
      if (!this.timerHostPlaceholder)
        log(
          'info',
          `[TimerPanelUI - ${panelIdForLog}] Timer host placeholder not found.`
        );
      else if (
        this.timerHostPlaceholder &&
        !document.body.contains(this.timerHostPlaceholder)
      ) {
        log(
          'info',
          `[TimerPanelUI - ${panelIdForLog}] Timer host placeholder found but not in document body.`
        );
      }
    }

    if (isViableHost) {
      log(
        'info',
        `[TimerPanelUI - ${panelIdForLog}] Is a viable host. Attempting to attach TimerUI.`
      );
      if (
        centralRegistry &&
        typeof centralRegistry.getPublicFunction === 'function'
      ) {
        const attachFn = centralRegistry.getPublicFunction(
          'Timer',
          'attachTimerToHost'
        );
        if (attachFn && typeof attachFn === 'function') {
          try {
            attachFn(this.timerHostPlaceholder);
            log(
              'info',
              `[TimerPanelUI - ${panelIdForLog}] TimerUI attach function called. Propagation stopped.`
            );
          } catch (e) {
            log(
              'error',
              `[TimerPanelUI - ${panelIdForLog}] Error calling attachFn for TimerUI:`,
              e
            );
            isViableHost = false;
          }
        } else {
          log(
            'error',
            `[TimerPanelUI - ${panelIdForLog}] Could not get 'attachTimerToHost' function from Timer module, or it's not a function. Function received:`,
            attachFn
          );
          isViableHost = false;
        }
      } else {
        log(
          'error',
          `[TimerPanelUI - ${panelIdForLog}] centralRegistry or centralRegistry.getPublicFunction not available.`
        );
        isViableHost = false;
      }
    }

    if (!isViableHost) {
      log(
        'info',
        `[TimerPanelUI - ${panelIdForLog}] Not a viable host or attach failed. Attempting to propagate event.`
      );
      // Explicitly propagate if this panel isn't hosting
      if (dispatcher && typeof dispatcher.publishToNextModule === 'function') {
        dispatcher.publishToNextModule(
          this.moduleId,
          'system:rehomeTimerUI',
          eventData, // Original event data
          { direction: 'up' } // CORRECTED: 'up' to go to lower index (higher actual priority)
        );
        log(
          'info',
          `[TimerPanelUI - ${panelIdForLog}] Called publishToNextModule for system:rehomeTimerUI (direction: up).`
        );
      } else {
        log(
          'warn',
          `[TimerPanelUI - ${panelIdForLog}] Could not propagate system:rehomeTimerUI: dispatcher or publishToNextModule missing.`
        );
      }
    }
  }
}
