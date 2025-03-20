// client/ui/progressUI.js - Modified to work directly with stateManager
import eventBus from '../core/eventBus.js';
import locationManager from '../core/locationManager.js';
import { gameState } from '../core/gameState.js';

export class ProgressUI {
  static progressBar = null;
  static checksCounter = null;
  static controlButton = null;
  static quickCheckButton = null;
  static stateManager = null;

  /**
   * Get the stateManager instance dynamically
   * @returns {Promise<Object>} - The stateManager instance or null
   */
  static async _getStateManager() {
    if (this.stateManager) {
      return this.stateManager;
    }

    try {
      const module = await import('../../app/core/stateManagerSingleton.js');
      this.stateManager = module.default;
      return this.stateManager;
    } catch (error) {
      console.error('Error loading stateManager:', error);
      return null;
    }
  }

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

      // Remove any existing event listeners to prevent duplicates
      this.controlButton.replaceWith(this.controlButton.cloneNode(true));

      // Get fresh reference after replacement
      this.controlButton = document.getElementById('control-button');

      // Add click event listener with proper toggle logic
      this.controlButton.addEventListener('click', (event) => {
        event.preventDefault();
        console.log(
          'Control button clicked, running state:',
          gameState.isRunning()
        );

        if (gameState.isRunning()) {
          console.log('Stopping timer...');
          gameState.stop();
        } else {
          console.log('Starting timer...');
          gameState.begin();
        }
      });
    }

    if (this.quickCheckButton) {
      this.quickCheckButton.setAttribute('disabled', 'disabled');

      // Remove any existing event listeners to prevent duplicates
      this.quickCheckButton.replaceWith(this.quickCheckButton.cloneNode(true));

      // Get fresh reference after replacement
      this.quickCheckButton = document.getElementById('quick-check-button');

      this.quickCheckButton.addEventListener('click', () => {
        gameState.checkQuickLocation();
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

    // Subscribe to inventory change events from stateManager
    eventBus.subscribe('stateManager:locationChecked', () => {
      this.updateProgress();
    });

    // Subscribe to game completion
    eventBus.subscribe('game:complete', () => {
      this.setComplete();
    });
  }

  static async updateProgress() {
    if (!this.checksCounter) return;

    const stateManager = await this._getStateManager();
    if (!stateManager) return;

    // Get counts directly from stateManager
    const checkedCount = stateManager.checkedLocations?.size || 0;
    const totalCount = stateManager.locations?.length || 0;

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
