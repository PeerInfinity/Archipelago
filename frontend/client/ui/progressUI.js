// client/ui/progressUI.js
import eventBus from '../core/eventBus.js';
import locationManager from '../core/locationManager.js';
import gameState from '../core/gameState.js';

export class ProgressUI {
  static progressBar = null;
  static checksCounter = null;
  static controlButton = null;
  static quickCheckButton = null;

  static initialize() {
    // Get UI elements
    this.progressBar = document.getElementById('progress-bar');
    this.checksCounter = document.getElementById('checks-sent');
    this.controlButton = document.getElementById('control-button');
    this.quickCheckButton = document.getElementById('quick-check-button');

    if (!this.progressBar || !this.checksCounter) {
      console.error('Progress UI elements not found');
      return;
    }

    // Reset UI state
    this.progressBar.setAttribute('value', '0');
    this.checksCounter.innerText = '0';

    if (this.controlButton) {
      this.controlButton.setAttribute('disabled', 'disabled');
      this.controlButton.addEventListener('click', () => {
        gameState.begin();
      });
    }

    if (this.quickCheckButton) {
      this.quickCheckButton.setAttribute('disabled', 'disabled');
      this.quickCheckButton.addEventListener('click', () => {
        locationManager.checkQuickLocation();
      });
    }

    // Subscribe to events
    this._setupEventListeners();

    console.log('ProgressUI module initialized');
  }

  static _setupEventListeners() {
    // Subscribe to connection events
    eventBus.subscribe('game:connected', () => {
      if (this.controlButton) {
        this.controlButton.removeAttribute('disabled');
      }

      if (this.quickCheckButton) {
        this.quickCheckButton.removeAttribute('disabled');
      }

      this.updateProgress();
    });

    // Subscribe to location check events
    eventBus.subscribe('game:locationChecked', () => {
      this.updateProgress();
    });

    // Subscribe to game completion
    eventBus.subscribe('game:complete', () => {
      this.setComplete();
    });
  }

  static updateProgress() {
    if (!this.checksCounter) return;

    const checkedCount = locationManager.getCompletedLocationsCount();
    const totalCount = locationManager.getTotalLocationsCount();

    this.checksCounter.innerText = `${checkedCount}`;

    // If we're displaying a total count, add that
    if (totalCount > 0) {
      this.checksCounter.innerText += ` / ${totalCount}`;
    }
  }

  static setProgress(value, max) {
    if (this.progressBar) {
      this.progressBar.setAttribute('max', max.toString());
      this.progressBar.setAttribute('value', value.toString());
    }
  }

  static setComplete() {
    if (this.progressBar) {
      this.progressBar.setAttribute('max', '100');
      this.progressBar.setAttribute('value', '100');
    }

    if (this.controlButton) {
      this.controlButton.setAttribute('disabled', 'disabled');
    }

    eventBus.publish('progress:complete', {});
  }

  static enableControls(enable) {
    if (this.controlButton) {
      if (enable) {
        this.controlButton.removeAttribute('disabled');
      } else {
        this.controlButton.setAttribute('disabled', 'disabled');
      }
    }

    if (this.quickCheckButton) {
      if (enable) {
        this.quickCheckButton.removeAttribute('disabled');
      } else {
        this.quickCheckButton.setAttribute('disabled', 'disabled');
      }
    }
  }
}

// No singleton needed as we're using a static class
export default ProgressUI;
