// client/core/gameState.js
import Config from './config.js';
import eventBus from './eventBus.js';
import connection from './connection.js';
import messageHandler from './messageHandler.js';

export class GameState {
  constructor() {
    // Private variables
    this.gameInterval = null;
    this.progressBar = null;
    this.itemCounter = null;
    this.gameComplete = false;
    this.immediateItems = 0;

    // Game progress tracking
    this.startTime = 0;
    this.endTime = 0;
  }

  initialize() {
    // Reset game state
    if (this.gameInterval) {
      clearInterval(this.gameInterval);
      this.gameInterval = null;
    }

    this.gameComplete = false;
    this.immediateItems = 0;

    // Get UI references
    this.progressBar = document.getElementById('progress-bar');
    this.itemCounter = document.getElementById('checks-sent');

    // Reset UI
    if (this.progressBar) {
      this.progressBar.setAttribute('value', '0');
    }

    if (this.itemCounter) {
      this.itemCounter.innerText = '0';
    }

    // Wire up the begin button
    const controlButton = document.getElementById('control-button');
    if (controlButton) {
      controlButton.removeEventListener('click', this.begin.bind(this));
      controlButton.addEventListener('click', this.begin.bind(this));
    }

    console.log('GameState module initialized');
  }

  begin() {
    // Get references to UI elements if not already cached
    this.progressBar =
      this.progressBar || document.getElementById('progress-bar');
    this.itemCounter =
      this.itemCounter || document.getElementById('checks-sent');

    // Disable the "Begin!" button
    const controlButton = document.getElementById('control-button');
    if (controlButton) {
      controlButton.setAttribute('disabled', 'disabled');
    }

    // Get missing locations from message handler
    const missingLocations = messageHandler.getMissingLocations();

    // ID of the next location to be sent
    let currentLocation = parseInt(missingLocations[0], 10);

    // Progress tracking data
    this.startTime = new Date().getTime();
    this.endTime = this.startTime + Math.floor(Math.random() * 30000 + 30000);

    if (this.progressBar) {
      this.progressBar.setAttribute(
        'max',
        (this.endTime - this.startTime).toString()
      );
    }

    // Update item counter
    if (this.itemCounter) {
      this.itemCounter.innerText = (200 - missingLocations.length).toString();
    }

    // If all checks have already been sent, fill the progress bar and do nothing else
    if (missingLocations.length === 0) {
      if (this.progressBar) {
        this.progressBar.setAttribute('max', '30000');
        this.progressBar.setAttribute('value', '30000');
      }
      return;
    }

    this.gameInterval = setInterval(() => {
      // If the last item has been sent, send the victory condition and stop the interval
      if (
        currentLocation >
        parseInt(missingLocations[missingLocations.length - 1], 10)
      ) {
        if (connection.isConnected()) {
          connection.send(
            JSON.stringify([
              {
                cmd: 'StatusUpdate',
                status: Config.CLIENT_STATUS.CLIENT_GOAL,
              },
            ])
          );
        }

        clearInterval(this.gameInterval);
        this.gameInterval = null;
        this.gameComplete = true;

        if (this.progressBar) {
          this.progressBar.setAttribute('max', '30000');
          this.progressBar.setAttribute('value', '30000');
        }

        eventBus.publish('game:complete', {});
        return;
      }

      // Update current time
      const currentTime = new Date().getTime();

      // If the item timer has expired or there are immediate items waiting, send the current location check
      if (this.immediateItems > 0 || currentTime >= this.endTime) {
        if (this.immediateItems > 0) {
          --this.immediateItems;
        }

        // Send location check
        messageHandler.sendLocationChecks([currentLocation]);

        // Update the item counters
        if (this.itemCounter) {
          this.itemCounter.innerText = (
            parseInt(this.itemCounter.innerText, 10) + 1
          ).toString();
        }

        currentLocation++;

        // Update timers
        this.startTime = currentTime;
        this.endTime = currentTime + Math.floor(Math.random() * 30000 + 30000);

        // Update progress bar maximum
        if (this.progressBar) {
          this.progressBar.setAttribute(
            'max',
            (this.endTime - this.startTime).toString()
          );
        }

        // Notify about check sent
        eventBus.publish('game:checkSent', { location: currentLocation - 1 });
      }

      // Update the progress bar value
      if (this.progressBar) {
        this.progressBar.setAttribute(
          'value',
          (
            this.endTime -
            this.startTime -
            (this.endTime - currentTime)
          ).toString()
        );
      }
    }, 1000);
  }

  stop() {
    if (this.gameInterval) {
      clearInterval(this.gameInterval);
      this.gameInterval = null;
    }

    // Reset UI
    if (this.progressBar) {
      this.progressBar.setAttribute('value', '0');
    }
  }

  isRunning() {
    return this.gameInterval !== null;
  }

  isComplete() {
    return this.gameComplete;
  }

  addImmediateItem() {
    this.immediateItems++;
  }
}

// Create and export a singleton instance
export const gameState = new GameState();

// Export as default for convenience
export default gameState;
