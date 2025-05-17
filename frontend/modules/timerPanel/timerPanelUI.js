// frontend/modules/timerPanel/timerPanelUI.js
import { centralRegistry } from '../../app/core/centralRegistry.js';
import eventBus from '../../app/core/eventBus.js';
// Import helper from its own index.js to get module context
import {
  getTimerPanelModuleLoadPriority,
  getTimerPanelModuleId,
  getHostedUIComponentType,
} from './index.js';

const TIMER_UI_COMPONENT_TYPE = 'TimerProgressUI';

export class TimerPanelUI {
  constructor(container, componentState, componentType) {
    console.log('[TimerPanelUI] Constructor called.');
    this.container = container; // GoldenLayout container
    this.componentState = componentState;
    this.rootElement = document.createElement('div');
    this.rootElement.className = 'timer-panel-ui-container panel-container'; // Basic styling
    this.rootElement.style.width = '100%';
    this.rootElement.style.height = '100%';
    this.rootElement.style.overflow = 'auto'; // Allow scrolling if content overflows
    this.rootElement.style.padding = '5px'; // Some padding so hosted UI isn't edge-to-edge
    this.rootElement.style.boxSizing = 'border-box';

    // This div is the placeholder where the Timer module's UI will be injected.
    this.timerHostPlaceholder = document.createElement('div');
    this.timerHostPlaceholder.id = `timer-ui-host-in-${getTimerPanelModuleId()}`; // Unique ID
    this.timerHostPlaceholder.style.width = '100%';
    this.timerHostPlaceholder.style.height = '100%';
    this.rootElement.appendChild(this.timerHostPlaceholder);

    this.container.element.appendChild(this.rootElement);

    this.moduleId = componentType || 'TimerPanel'; // Use componentType as moduleId, fallback for safety
    this.hostedComponentType = getHostedUIComponentType();
    this.isHostActive = false; // Track current active state
    this.moduleStateChangeHandler =
      this._handleSelfModuleStateChange.bind(this); // For event bus

    // Lifecycle listeners
    this.container.on('open', this._handlePanelOpen.bind(this));
    this.container.on('show', this._handlePanelShow.bind(this)); // For when tab is selected
    this.container.on('hide', this._handlePanelHide.bind(this)); // For when tab is deselected
    this.container.on('destroy', this._handlePanelDestroy.bind(this));

    // Subscribe to its own module's state change
    eventBus.subscribe('module:stateChanged', this.moduleStateChangeHandler);
    centralRegistry.registerEventBusSubscriberIntent(
      this.moduleId,
      'module:stateChanged'
    );

    console.log(`[TimerPanelUI for ${this.moduleId}] Panel UI created.`);
  }

  getRootElement() {
    return this.rootElement;
  }

  _handlePanelOpen() {
    // This is called when GoldenLayout first creates the panel component.
    console.log(
      `[TimerPanelUI for ${this.moduleId}] Panel opened (or created). Scheduling host registration.`
    );
    // Defer registration to allow the module's initialize() to set the correct priority.
    setTimeout(() => {
      console.log(
        `[TimerPanelUI for ${this.moduleId}] Executing deferred host registration from _handlePanelOpen.`
      );
      this._registerAsHost(true); // Assuming it should be active if opened.
      // The 'show' event will also call this if the tab becomes active later.
    }, 0);
  }

  _handlePanelShow() {
    // This is called when the panel's tab becomes visible.
    console.log(
      `[TimerPanelUI for ${this.moduleId}] Panel shown (tab selected). Ensuring host status is active.`
    );
    this._registerAsHost(true); // Re-affirm active status
  }

  _handlePanelHide() {
    // This is called when the panel's tab is no longer visible.
    console.log(
      `[TimerPanelUI for ${this.moduleId}] Panel hidden (tab deselected). Setting host status to inactive.`
    );
    centralRegistry.setUIHostActive(
      this.hostedComponentType,
      this.moduleId,
      false
    );
  }

  _handlePanelDestroy() {
    // This is called when GoldenLayout destroys the panel component.
    console.log(
      `[TimerPanelUI for ${this.moduleId}] Panel destroyed. Setting host status to inactive.`
    );
    centralRegistry.setUIHostActive(
      this.hostedComponentType,
      this.moduleId,
      false
    );
    // Further cleanup of this.rootElement etc., is handled by GoldenLayout.
    // Unregister as host if it was active or registered
    centralRegistry.unregisterUIHost(TIMER_UI_COMPONENT_TYPE, this.moduleId);
    eventBus.unsubscribe('module:stateChanged', this.moduleStateChangeHandler); // Unsubscribe
    // Any other cleanup
    this.timerHostPlaceholder = null;
  }

  _registerAsHost(isActive) {
    if (!this.timerHostPlaceholder) {
      console.error(
        `[TimerPanelUI for ${this.moduleId}] Timer host placeholder not found. Cannot register as host.`
      );
      return;
    }

    const loadPriority = getTimerPanelModuleLoadPriority();

    if (loadPriority === -1 || typeof loadPriority === 'undefined') {
      console.warn(
        `[TimerPanelUI for ${this.moduleId}] Module load priority is default (-1) or undefined. Value: ${loadPriority}. Host registration might be using a non-optimal priority.`
      );
      // If loadPriority is indeed problematic, consider defaulting or logging an error
      // For now, we'll let it proceed with the potentially incorrect priority to observe behavior.
    }

    centralRegistry.registerUIHost(
      this.hostedComponentType,
      this.moduleId,
      this.timerHostPlaceholder,
      loadPriority
    );
    this.isHostActive = isActive; // Update tracked state
    console.log(
      `[TimerPanelUI for ${this.moduleId}] Host registration attempt. Module: ${
        this.moduleId
      }, Type: ${TIMER_UI_COMPONENT_TYPE}, Placeholder: ${
        this.timerHostPlaceholder ? 'exists' : 'null'
      }, Priority: ${loadPriority}, Requested Active: ${isActive}`
    );
    centralRegistry.setUIHostActive(
      TIMER_UI_COMPONENT_TYPE,
      this.moduleId,
      isActive
    );
  }

  _handleSelfModuleStateChange({ moduleId, enabled }) {
    if (moduleId === this.moduleId) {
      console.log(
        `[TimerPanelUI for ${this.moduleId}] Received self module:stateChanged. Module: ${moduleId}, Enabled: ${enabled}`
      );
      // If the module is being disabled, ensure its host registration is set to inactive.
      // If it's being enabled, and the panel is currently visible (which it should be if GL hasn't hidden it),
      // then it should re-assert its active host status.
      // The `_handlePanelShow` or `_handlePanelOpen` would typically make it active.
      // If the panel is hidden, `_handlePanelHide` would have made it inactive.
      // So, if module is enabled, and panel is shown, it will become active.
      // If module is disabled, it must become inactive regardless of panel visibility.
      if (enabled) {
        // If module is re-enabled, it should attempt to become an active host.
        // GoldenLayout's 'show' and 'hide' events will then manage its active status
        // based on tab visibility.
        console.log(
          `[TimerPanelUI for ${this.moduleId}] Module re-enabled. Setting host to active.`
        );
        this._registerAsHost(true);
      } else {
        // Module disabled, explicitly set host to inactive.
        console.log(
          `[TimerPanelUI for ${this.moduleId}] Module disabled. Setting host to inactive.`
        );
        this._registerAsHost(false);
      }
    }
  }

  // Optional: If this panel needed its own internal initialization beyond DOM creation.
  // initialize() {
  //   console.log(`[TimerPanelUI for ${this.moduleId}] Initialize method called (if needed).`);
  // }

  // Optional: If this panel needed specific destruction logic.
  // destroy() {
  //   console.log(`[TimerPanelUI for ${this.moduleId}] Destroy method called (if needed).`);
  // }
}
