// frontend/modules/timerPanel/timerPanelUI.js
import { centralRegistry } from '../../app/core/centralRegistry.js';
// Import helper from its own index.js to get module context
import {
  getTimerPanelModuleLoadPriority,
  getTimerPanelModuleId,
  getHostedUIComponentType,
} from './index.js';

export class TimerPanelUI {
  constructor(container, componentState) {
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

    this.moduleId = getTimerPanelModuleId();
    this.hostedComponentType = getHostedUIComponentType();

    // Lifecycle listeners
    this.container.on('open', this._handlePanelOpen.bind(this));
    this.container.on('show', this._handlePanelShow.bind(this)); // For when tab is selected
    this.container.on('hide', this._handlePanelHide.bind(this)); // For when tab is deselected
    this.container.on('destroy', this._handlePanelDestroy.bind(this));

    console.log(`[TimerPanelUI for ${this.moduleId}] Panel UI created.`);
  }

  getRootElement() {
    return this.rootElement;
  }

  _handlePanelOpen() {
    // This is called when GoldenLayout first creates the panel component.
    console.log(
      `[TimerPanelUI for ${this.moduleId}] Panel opened (or created). Registering as host.`
    );
    this._registerAsHost(true);
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
  }

  _registerAsHost(isActive) {
    if (!this.timerHostPlaceholder) {
      console.error(
        `[TimerPanelUI for ${this.moduleId}] Timer host placeholder not found. Cannot register as host.`
      );
      return;
    }

    const loadPriority = getTimerPanelModuleLoadPriority();
    if (loadPriority === -1) {
      console.warn(
        `[TimerPanelUI for ${this.moduleId}] Module load priority not set. Host registration might be incomplete.`
      );
    }

    centralRegistry.registerUIHost(
      this.hostedComponentType,
      this.moduleId,
      this.timerHostPlaceholder,
      loadPriority
    );
    centralRegistry.setUIHostActive(
      this.hostedComponentType,
      this.moduleId,
      isActive
    );
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
