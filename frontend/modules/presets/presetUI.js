import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import eventBus from '../../app/core/eventBus.js';


// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('presetUI', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[presetUI] ${message}`, ...data);
  }
}

export class PresetUI {
  constructor(container, componentState) {
    this.container = container;
    this.componentState = componentState;

    this.presets = null;
    this.currentPlayer = null;
    this.initialized = false;
    this.presetsListContainer = null;
    this.rootElement = null;

    // Create and append root element immediately in constructor to have a target for GL
    this.getRootElement();
    if (this.rootElement) {
      this.container.element.appendChild(this.rootElement);
    } else {
      log('error', '[PresetUI] Root element not created in constructor!');
    }

    // Defer the rest of initialization (fetching data, rendering)
    const readyHandler = (eventPayload) => {
      log('info',
        '[PresetUI] Received app:readyForUiDataLoad. Initializing presets.'
      );
      this.initialize();
      eventBus.unsubscribe('app:readyForUiDataLoad', readyHandler);
    };
    eventBus.subscribe('app:readyForUiDataLoad', readyHandler, 'presets');

    this.container.on('destroy', () => {
      this.onPanelDestroy();
    });
  }

  getRootElement() {
    if (!this.rootElement) {
      this.rootElement = document.createElement('div');
      this.rootElement.id = 'presets-panel';
      this.rootElement.classList.add('panel-container');
      this.rootElement.style.height = '100%';
      this.rootElement.style.overflowY = 'auto';
      this.rootElement.innerHTML =
        '<div id="presets-list">Loading presets...</div>';
      this.presetsListContainer =
        this.rootElement.querySelector('#presets-list');
    }
    return this.rootElement;
  }

  initialize(/* container removed, uses rootElement */) {
    this.getRootElement();

    if (!this.presetsListContainer) {
      log('error',
        'PresetUI: Could not find #presets-list container during initialization.'
      );
      this.initialized = false;
      return false;
    }

    this.initialized = false;

    try {
      fetch('./presets/preset_files.json')
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json();
        })
        .then((data) => {
          this.presets = data;
          this.renderGamesList();
          this.initialized = true;
          log('info', '[PresetUI] Initialized successfully.');
        })
        .catch((error) => {
          log('error', 'Error loading presets data:', error);
          if (this.presetsListContainer) {
            this.presetsListContainer.innerHTML = `
              <div class="error-message">
                <h3>Error Loading Presets</h3>
                <p>${error.message}</p>
                <p>Make sure the preset_files.json file exists in the presets directory.</p>
              </div>
            `;
          }
          this.initialized = false;
        });

      return true;
    } catch (error) {
      log('error', 'Error setting up presets data loading:', error);
      if (this.presetsListContainer) {
        this.presetsListContainer.innerHTML = `
          <div class="error-message">
            <h3>Error Initializing Presets</h3>
            <p>${error.message}</p>
          </div>
        `;
      }
      this.initialized = false;
      return false;
    }
  }

  onPanelDestroy() {
    log('info', '[PresetUI] Panel destroyed. Cleaning up if necessary.');
    this.initialized = false;
    this.presets = null;
    if (this.presetsListContainer) {
      this.presetsListContainer.innerHTML = '';
    }
  }

  renderGamesList() {
    const container = this.presetsListContainer;
    if (!container) {
      log('error', 'Presets list container not found for renderGamesList');
      return;
    }

    if (!this.presets) {
      container.innerHTML = '<p>Loading preset list...</p>';
      log('warn', 'renderGamesList called before presets data was loaded.');
      return;
    }

    // Create a header
    let html = `
      <div class="preset-header">
        <h3>Select a Game Preset</h3>
        <input type="file" id="json-file-input" accept=".json" style="display: none;" />
        <button id="load-json-button" class="button" style="margin-left: 10px;">Load JSON File</button>
      </div>
      <div class="presets-container">
    `;

    // Process each game
    Object.entries(this.presets).forEach(([gameDirectory, gameData]) => {
      // Skip metadata entry
      if (gameDirectory === 'metadata') return;
      
      // Create a section for each game
      html += `
        <div class="game-row">
          <h4 class="game-name">${this.escapeHtml(gameData.name)}</h4>
      `;

      if (gameDirectory === 'multiworld') {
        // Special layout for multiworld - block format
        html += `</div>`; // Close the inline game-row
        html += `<div class="multiworld-container">`;
        html += `<div class="multiworld-seeds">`;
        Object.entries(gameData.folders).forEach(([seedName, folderData]) => {
          html += `<div class="multiworld-seed-block">`;
          html += `<span class="seed-number">Seed: ${this.escapeHtml(
            folderData.seed
          )}</span>`;
          html += `<div class="seed-players">`;
          folderData.games.forEach((playerGame) => {
            html += `
              <div class="player-info">
                <button class="preset-player-button"
                        data-game-directory="${this.escapeHtml(gameDirectory)}"
                        data-seed-name="${this.escapeHtml(seedName)}"
                        data-player="${this.escapeHtml(playerGame.player)}"
                        title="Load Player ${this.escapeHtml(
                          playerGame.player
                        )} (${this.escapeHtml(playerGame.name)})">
                  P${this.escapeHtml(playerGame.player)}
                </button>
                <span class="player-details">${this.escapeHtml(
                  playerGame.name
                )} (${this.escapeHtml(playerGame.game)})</span>
              </div>
            `;
          });
          html += `</div></div>`; // Close seed-players and multiworld-seed-block
        });
        html += `</div>`; // Close multiworld-seeds
        html += `</div>`; // Close multiworld-container
        // Don't add the closing </div> here since we already closed the game-row
      } else {
        // Standard layout for single-player games
        html += `<div class="game-presets">`;
        Object.entries(gameData.folders).forEach(([seedName, folderData]) => {
          html += `
            <button class="preset-button"
                    data-game-directory="${this.escapeHtml(gameDirectory)}"
                    data-seed-name="${this.escapeHtml(seedName)}"
                    title="${this.escapeHtml(
                      folderData.description || `Seed ${folderData.seed}`
                    )}">
              ${this.escapeHtml(folderData.seed)}
            </button>
          `;
        });
        html += `</div>`; // Close game-presets
        // Add test badge for single-player games
        html += this.renderTestResultBadge(gameData);
      }

      // Close the game section (only for non-multiworld)
      if (gameDirectory !== 'multiworld') {
        html += `
          </div>
        `;
      }
    });

    // Close the container
    html += '</div>';

    // Add styles for the presets selector
    html += `
      <style>
        .presets-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
          margin-top: 16px;
        }
        .game-row {
          background-color: rgba(0, 0, 0, 0.1);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 16px;
          justify-content: space-between;
        }
        .game-name {
          margin: 0;
          color: #ddd;
          min-width: 200px;
          flex-shrink: 0;
        }
        .test-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 0.85em;
          font-weight: 500;
          white-space: nowrap;
          cursor: help;
          flex-shrink: 0;
        }
        .test-badge-passed {
          background-color: rgba(76, 175, 80, 0.2);
          border: 1px solid rgba(76, 175, 80, 0.5);
          color: #a5d6a7;
        }
        .test-badge-failed {
          background-color: rgba(244, 67, 54, 0.2);
          border: 1px solid rgba(244, 67, 54, 0.5);
          color: #ef9a9a;
        }
        .test-badge-unknown {
          background-color: rgba(158, 158, 158, 0.2);
          border: 1px solid rgba(158, 158, 158, 0.5);
          color: #bdbdbd;
        }
        .test-icon {
          font-size: 1.1em;
        }
        .test-details {
          display: flex;
          flex-direction: column;
          gap: 2px;
          line-height: 1.2;
        }
        .test-status {
          font-weight: 600;
        }
        .test-progress, .test-errors {
          font-size: 0.9em;
          opacity: 0.8;
        }
        .game-presets {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          flex: 1;
          justify-content: center;
        }
        .preset-button {
          background-color: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: white;
          cursor: pointer;
          padding: 10px 15px;
          text-align: center;
          transition: background-color 0.2s;
        }
        .preset-button:hover {
          background-color: rgba(0, 0, 0, 0.5);
        }
        .preset-info {
          background-color: rgba(0, 0, 0, 0.1);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 16px;
        }
        .preset-files {
          margin-top: 16px;
        }
        .file-links-container {
          background-color: #111;
          border-radius: 6px;
          padding: 12px;
          margin-top: 10px;
          border: 1px solid #333;
        }
        .preset-file-link {
          display: block;
          margin: 8px 0;
          color: #4da6ff;
          text-decoration: underline;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
        }
        .preset-file-link:hover {
          color: #80c3ff;
          background-color: #222;
        }
        .back-button {
          background-color: #444;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          margin-bottom: 16px;
        }
        .back-button:hover {
          background-color: #555;
        }
        .error-message {
          background-color: rgba(244, 67, 54, 0.1);
          border-left: 3px solid #f44336;
          padding: 16px;
          border-radius: 4px;
          margin-top: 16px;
        }
        .success-message {
          background-color: rgba(76, 175, 80, 0.1);
          border-left: 3px solid #4CAF50;
          padding: 8px 16px;
          border-radius: 4px;
          margin: 8px 0;
        }
        .multiworld-seeds {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
        }
        .multiworld-seed-block {
          background-color: rgba(0, 0, 0, 0.2);
          padding: 10px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .seed-number {
          font-weight: bold;
          color: #ccc;
          margin-bottom: 8px;
          display: block;
        }
        .seed-players {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .player-info {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .preset-player-button {
          background-color: rgba(50, 100, 150, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          color: white;
          cursor: pointer;
          padding: 5px 10px;
          text-align: center;
          transition: background-color 0.2s;
          min-width: 40px;
        }
        .preset-player-button:hover {
          background-color: rgba(70, 120, 170, 0.9);
        }
        .player-details {
          font-size: 0.9em;
          color: #bbb;
        }
        .multiworld-container {
          background-color: rgba(0, 0, 0, 0.1);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 16px;
        }
      </style>
    `;

    // Set the HTML content
    container.innerHTML = html;

    // Add event listener for the new Load JSON File button
    const loadJsonButton = container.querySelector('#load-json-button');
    const jsonFileInput = container.querySelector('#json-file-input');

    if (loadJsonButton && jsonFileInput) {
      loadJsonButton.addEventListener('click', () => {
        jsonFileInput.click(); // Trigger file input when button is clicked
      });

      jsonFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              const jsonData = JSON.parse(e.target.result);
              this.displayLoadedJsonFileDetails(jsonData, file.name);
            } catch (err) {
              log('error', 'Error parsing JSON file:', err);
              eventBus.publish('ui:notification', {
                type: 'error',
                message: `Error parsing ${file.name}: ${err.message}`,
              }, 'presets');
            }
          };
          reader.onerror = (err) => {
            log('error', 'Error reading file:', err);
            eventBus.publish('ui:notification', {
              type: 'error',
              message: `Error reading ${file.name}.`,
            }, 'presets');
          };
          reader.readAsText(file);
        }
      });
    }

    // Add event listeners to the preset buttons (both standard and player)
    const buttons = container.querySelectorAll(
      '.preset-button, .preset-player-button'
    );
    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const gameDirectory = button.getAttribute('data-game-directory');
        const seedName = button.getAttribute('data-seed-name');
        const playerId = button.getAttribute('data-player'); // Will be null for standard buttons

        if (playerId) {
          log('info',
            `Loading preset ${seedName} from game ${gameDirectory} for player ${playerId}`
          );
          this.currentGameDirectory = gameDirectory;
          this.currentSeedName = seedName;
          this.currentPlayer = playerId; // Store current player
          this.loadPreset(gameDirectory, seedName, playerId);
        } else {
          log('info', `Loading preset ${seedName} from game ${gameDirectory}`);
          this.currentGameDirectory = gameDirectory;
          this.currentSeedName = seedName;
          this.currentPlayer = null; // Clear current player
          this.loadPreset(gameDirectory, seedName); // No player ID for standard presets
        }
      });
    });
  }

  displayLoadedJsonFileDetails(jsonData, fileName) {
    log('info', 
      `Displaying details for manually loaded JSON file: ${fileName}`,
      jsonData
    );
    const container = this.presetsListContainer;
    if (!container) return;

    // For now, this is a placeholder. We will implement the details view in the next step.
    // It should be similar to loadPreset but adapt for a local file.
    let html = `
      <button class="back-button" id="back-to-presets">← Back to Games</button>
      <div class="preset-info">
        <h3>Loaded: ${this.escapeHtml(fileName)}</h3>
        <p>This file was loaded manually from your computer.</p>
        <div id="preset-status"></div>
        <pre style="max-height: 300px; overflow: auto; background: #111; padding: 10px; border-radius: 4px;">${this.escapeHtml(
          JSON.stringify(jsonData, null, 2)
        )}</pre>
      </div>
    `;
    container.innerHTML = html;

    const backButton = container.querySelector('#back-to-presets');
    if (backButton) {
      backButton.addEventListener('click', () => {
        this.renderGamesList();
      });
    }

    // TODO: Determine playerId and call loadRulesFile (or similar logic)
    // For now, let's assume player 1 for simplicity if it's a rules file.
    if (
      fileName.endsWith('_rules.json') ||
      confirm(
        'Is this a rules.json file for a game? Defaulting to Player 1 if so.'
      )
    ) {
      // This is a rough way to check, ideally jsonData structure would be validated.
      const playerId = '1'; // Default or determine from JSON if possible (e.g., if not multiworld)
      // We need a way to call the core logic of loadRulesFile without assuming a preset structure.
      // This might involve refactoring parts of loadRulesFile or creating a new shared method.
      log('info', 
        `Attempting to process ${fileName} as rules file for Player ${playerId}`
      );
      // Directly call the processing logic, adapting from loadRulesFile
      this.processManuallyLoadedRules(jsonData, fileName, playerId);
    }
  }

  async processManuallyLoadedRules(rulesData, fileName, playerId = '1') {
    log('info', 
      `Processing manually loaded rules: ${fileName} for player ${playerId}`
    );
    try {
      if (this.componentState) {
        this.componentState.currentRules = rulesData;
        this.componentState.currentGameName = rulesData.game_name || 'unknown_game'; // Try to get game name from JSON
        this.componentState.currentPlayerId = playerId;
      } else {
        log('warn', 
          '[PresetUI] processManuallyLoadedRules: this.componentState is undefined.'
        );
      }

      log('info', 
        `Manually loaded rules processed for ${
          rulesData.game || 'unknown_game'
        }, player ${playerId}. Publishing files:jsonLoaded.`
      );
      eventBus.publish('files:jsonLoaded', {
        jsonData: rulesData,
        selectedPlayerId: playerId,
        sourceName: `userLoaded:${fileName}` // Prefix to indicate manually loaded file
      }, 'presets');

      eventBus.publish('ui:notification', {
        type: 'success',
        message: `Loaded ${fileName} for Player ${playerId}`,
      }, 'presets');

      const statusElement = document.getElementById('preset-status');
      if (statusElement) {
        statusElement.innerHTML = `
          <div class="success-message">
            <p>✓ ${this.escapeHtml(
              fileName
            )} loaded and processed successfully!</p>
            <p>Game systems should update shortly based on this data.</p>
          </div>
        `;
      }

      eventBus.publish('rules:loaded', {}, 'presets');
    } catch (error) {
      log('error', 'Error processing manually loaded rules file:', error);
      const statusElement = document.getElementById('preset-status');
      if (statusElement) {
        statusElement.innerHTML = `
          <div class="error-message">
            <p>Error processing ${this.escapeHtml(fileName)}: ${
          error.message
        }</p>
          </div>
        `;
      }
    }
  }

  loadPreset(gameDirectory, seedName, playerId = null) {
    this.currentGameDirectory = gameDirectory;
    this.currentSeedName = seedName;
    this.currentPlayer = playerId;

    const container = this.presetsListContainer;
    if (!container) return;

    try {
      const gameData = this.presets[gameDirectory];
      const folderData = gameData.folders[seedName];

      // Build the HTML for the preset details
      let headerTitle = `${this.escapeHtml(gameData.name)} - Preset`;
      if (playerId && gameDirectory === 'multiworld') {
        const playerInfo = folderData.games.find((p) => p.player == playerId);
        if (playerInfo) {
          headerTitle = `Multiworld Seed ${this.escapeHtml(
            folderData.seed
          )} - Player ${playerId} (${this.escapeHtml(playerInfo.name)})`;
        } else {
          headerTitle = `Multiworld Seed ${this.escapeHtml(
            folderData.seed
          )} - Player ${playerId}`;
        }
      } else {
        headerTitle = `${this.escapeHtml(
          gameData.name
        )} - Seed ${this.escapeHtml(folderData.seed)}`;
      }

      let html = `
        <button class="back-button" id="back-to-presets">← Back to Games</button>
        <div class="preset-info">
          <h3>${headerTitle}</h3>
          <p>${this.escapeHtml(folderData.description || 'Multiworld Seed')}</p>
          <div class="preset-files">
            <h4>Files:</h4>
            <div class="file-links-container" style="background-color: #111 !important; border: 1px solid #333; border-radius: 6px; padding: 12px; margin-top: 10px;">
      `;

      // Add links for each file
      folderData.files.forEach((file) => {
        const filePath = `./presets/${gameDirectory}/${seedName}/${file}`;
        html += `
          <a class="preset-file-link" href="${filePath}" target="_blank" data-file="${file}">${file}</a><br/>
        `;
      });

      html += `</div>`;

      html += `
          </div>
          <div id="preset-status"></div>
        </div>
      `;

      // Set the HTML content
      container.innerHTML = html;

      // Add event listener for the back button
      const backButton = container.querySelector('#back-to-presets');
      if (backButton) {
        backButton.addEventListener('click', () => {
          this.renderGamesList();
        });
      }

      // Add event listeners for the file links
      const fileLinks = container.querySelectorAll('.preset-file-link');
      fileLinks.forEach((link) => {
        link.addEventListener('click', (e) => {
          const file = link.getAttribute('data-file');

          // If this is a rules.json file, load it into the game
          if (file.endsWith('_rules.json')) {
            e.preventDefault(); // Prevent opening in a new tab
            this.loadRulesFile(gameDirectory, seedName, file, playerId);
          }
        });
      });

      // Automatically load the rules.json file for this preset/player
      let rulesFile = null;
      if (playerId && gameDirectory === 'multiworld') {
        rulesFile = folderData.files.find((file) =>
          file.endsWith(`_P${playerId}_rules.json`)
        );
        if (!rulesFile) {
          // Fallback to default rules.json if player-specific not found
          rulesFile = folderData.files.find((file) =>
            file.endsWith('_rules.json')
          );
          if (rulesFile) {
            log('warn', 
              `Player-specific rules file not found for P${playerId}, falling back to default rules.json`
            );
          }
        }
      } else {
        // Find standard rules file for single player presets
        rulesFile = folderData.files.find((file) =>
          file.endsWith('_rules.json')
        );
      }

      if (rulesFile) {
        // Determine the correct player ID
        let effectivePlayerId = '1'; // Default safety fallback

        if (playerId) {
          // If playerId was passed (multiworld), use it directly
          effectivePlayerId = playerId;
        } else if (folderData.games && folderData.games.length > 0) {
          // If it's a standard preset, get the player ID from the first entry in the games array
          // Ensure it's converted to a string if stateManager expects strings
          effectivePlayerId = folderData.games[0].player.toString();
        } else {
          // Log a warning if we can't find the player ID even for a standard preset
          log('warn', 
            `Could not determine player ID for preset ${folderId}, defaulting to '1'.`
          );
        }

        this.loadRulesFile(gameDirectory, seedName, rulesFile, effectivePlayerId);
      } else {
        log('warn', 
          'No suitable rules.json file found for automatic loading.'
        );
        const statusElement = document.getElementById('preset-status');
        if (statusElement) {
          statusElement.innerHTML = `
            <div class="error-message">
              <p>Could not find a rules file to automatically load.</p>
            </div>
          `;
        }
      }
    } catch (error) {
      log('error', 'Error displaying preset:', error);
      const container = this.presetsListContainer;
      if (container) {
        container.innerHTML = `
          <div class="error-message">
            <h3>Error Loading Preset</h3>
            <p>${error.message}</p>
            <button id="back-to-presets" class="back-button">Back to Games</button>
          </div>
        `;

        // Add event listener for the back button
        const backButton = container.querySelector('#back-to-presets');
        if (backButton) {
          backButton.addEventListener('click', () => {
            this.renderGamesList();
          });
        }
      }
    }
  }

  async loadRulesFile(gameDirectory, seedName, rulesFile, playerId = '1') {
    const fullPath = `./presets/${gameDirectory}/${seedName}/${rulesFile}`;
    log('info', `Loading rules file: ${fullPath}`);
    try {
      const response = await fetch(fullPath);
      if (!response.ok) {
        throw new Error(
          `Failed to load rules file ${fullPath}: ${response.status} ${response.statusText}`
        );
      }
      const rulesData = await response.json();

      // Ensure componentState exists before trying to set properties on it
      if (this.componentState) {
        this.componentState.currentRules = rulesData;
        this.componentState.currentGameDirectory = gameDirectory;
        this.componentState.currentPlayerId = playerId; // Store the determined player ID
      } else {
        // If componentState is not available, these assignments would fail.
        // Log a warning, as this might indicate an issue with panel state management.
        log('warn', 
          '[PresetUI] loadRulesFile: this.componentState is undefined. Cannot store currentRules, currentGameDirectory, or currentPlayerId. This might be normal if the panel was just created and no state has been saved yet, or it could indicate an issue with GoldenLayout state persistence for this component.'
        );
        // As a fallback, we can store these on the instance if needed for immediate use,
        // but they won't be persisted by GoldenLayout.
        // this.currentRules_fallback = rulesData;
        // this.currentGameDirectory_fallback = gameDirectory;
        // this.currentPlayerId_fallback = playerId;
      }

      log('info',
        `Rules loaded for ${gameDirectory}, player ${playerId}. Publishing files:jsonLoaded.`
      );
      eventBus.publish('files:jsonLoaded', {
        jsonData: rulesData,
        selectedPlayerId: playerId,
        sourceName: fullPath
      }, 'presets');

      // Publish success notification
      eventBus.publish('ui:notification', {
        type: 'success',
        message: `Loaded ${rulesFile} for Player ${playerId}`,
      }, 'presets');

      // Temporarily comment out direct calls to stateManager, as the new flow
      // via files:jsonLoaded -> proxy.loadRules -> worker.loadRules (which calls loadFromJSON & initializeInventory)
      // should handle this.

      // const startingItems = rulesData.starting_inventory || [];
      // stateManager.initializeInventory(
      //   startingItems,
      //   rulesData.progression_mapping[playerId],
      //   rulesData.items[playerId]
      // );

      // stateManager.loadFromJSON(rulesData, playerId);

      // --- Explicitly Initialize InventoryUI ---
      // This is likely redundant if InventoryUI handles its own re-initialization
      // based on stateManager:rulesLoaded or stateManager:ready events.
      // const playerItems = rulesData.items[playerId];
      // const groups = rulesData.item_groups
      //   ? rulesData.item_groups[playerId]
      //   : {}; // Handle missing item_groups
      // if (playerItems && this.gameUI.inventoryUI) {
      //   this.gameUI.inventoryUI.initialize(playerItems, groups || {}); // Pass empty object if groups are null/undefined
      // } else {
      //   log('warn', 
      //     '[PresetUI] Could not initialize InventoryUI - playerItems missing or this.gameUI.inventoryUI instance not found.'
      //   );
      // }
      // --- End InventoryUI Init ---

      // Explicitly compute reachability after loading new state and initializing inventory UI
      // This should now be handled internally by the StateManager worker after processing new rules.
      // stateManager.computeReachableRegions();

      // Count game elements for display
      let regionCount = 0;
      let locationCount = 0;
      let exitCount = 0;
      let itemCount = 0;
      
      // Count regions, their exits, and locations (data is organized by player ID)
      if (rulesData.regions) {
        // Iterate through each player's regions
        for (const playerRegions of Object.values(rulesData.regions)) {
          if (typeof playerRegions === 'object') {
            regionCount += Object.keys(playerRegions).length;
            // Count exits and locations within each region
            for (const region of Object.values(playerRegions)) {
              if (region.exits && Array.isArray(region.exits)) {
                exitCount += region.exits.length;
              }
              if (region.locations && Array.isArray(region.locations)) {
                locationCount += region.locations.length;
              }
            }
          }
        }
      }
      
      // Count items (organized by player ID)
      if (rulesData.items) {
        for (const playerItems of Object.values(rulesData.items)) {
          if (typeof playerItems === 'object') {
            itemCount += Object.keys(playerItems).length;
          }
        }
      }
      
      // Count progressive items if they exist (also organized by player ID)
      if (rulesData.progressive_items) {
        for (const playerProgItems of Object.values(rulesData.progressive_items)) {
          if (typeof playerProgItems === 'object') {
            itemCount += Object.keys(playerProgItems).length;
          }
        }
      }

      // Display success message with counts
      const statusElement = document.getElementById('preset-status');
      if (statusElement) {
        statusElement.innerHTML = `
          <div class="success-message">
            <p>✓ Preset rules loaded successfully!</p>
            <p style="margin: 8px 0; font-size: 0.9em; color: #a0a0a0;">
              Loaded: ${regionCount} regions, ${locationCount} locations, ${exitCount} exits, ${itemCount} items
            </p>
            <p>You can now go to the Locations or Regions view to explore the game.</p>
          </div>
        `;
      }

      // Trigger rules:loaded event to enable offline play
      eventBus.publish('rules:loaded', {}, 'presets');

      // Re-enable control buttons if needed (though rules:loaded might handle this elsewhere)
      // This is likely a remnant of an older architecture and this.gameUI is not defined here.
      // Control button states should be managed by their respective modules.
      // this.gameUI._enableControlButtons();
    } catch (error) {
      log('error', 'Error loading rules file:', error);
      const statusElement = document.getElementById('preset-status');
      if (statusElement) {
        statusElement.innerHTML = `
          <div class="error-message">
            <p>Error loading rules file: ${error.message}</p>
          </div>
        `;
      }
    }
  }

  renderTestResultBadge(gameData) {
    let testResult = gameData.test_result;
    if (!testResult) {
      return '<div class="test-badge test-badge-unknown">No Test Data</div>';
    }

    // Handle multiple test results - pick first failure or first pass
    if (Array.isArray(testResult)) {
      // Look for the first failure
      const firstFailure = testResult.find(result => result.status && result.status.toLowerCase() === 'failed');
      if (firstFailure) {
        testResult = firstFailure;
      } else {
        // No failures found, use the first pass (or first result if none passed)
        const firstPass = testResult.find(result => result.status && result.status.toLowerCase() === 'passed');
        testResult = firstPass || testResult[0];
      }
      
      // If still no valid result, return unknown
      if (!testResult) {
        return '<div class="test-badge test-badge-unknown">No Test Data</div>';
      }
    }

    const status = testResult.status || 'unknown';
    const seedRangeInfo = testResult.seed_range_info;
    
    let badgeClass = 'test-badge-unknown';
    let statusText = 'Unknown';
    let statusIcon = '❓';

    // Check if this is seed range data
    if (seedRangeInfo) {
      // Handle seed range results
      if (status.toLowerCase() === 'passed') {
        badgeClass = 'test-badge-passed';
        statusText = `Passed seeds ${seedRangeInfo.seed_range}`;
        statusIcon = '✅';
      } else if (status.toLowerCase() === 'failed') {
        badgeClass = 'test-badge-failed';
        if (seedRangeInfo.first_failure_seed) {
          statusText = `Failed seed ${seedRangeInfo.first_failure_seed}`;
        } else {
          statusText = `Failed (${seedRangeInfo.seeds_failed}/${seedRangeInfo.total_seeds_tested})`;
        }
        statusIcon = '❌';
      }
    } else {
      // Handle single seed results (original logic)
      switch (status.toLowerCase()) {
        case 'passed':
          badgeClass = 'test-badge-passed';
          statusText = 'Passed';
          statusIcon = '✅';
          break;
        case 'failed':
          badgeClass = 'test-badge-failed';
          statusText = 'Failed';
          statusIcon = '❌';
          break;
        default:
          statusText = 'Unknown';
          statusIcon = '❓';
      }
    }

    // Build detailed tooltip content
    let tooltipContent = `Status: ${statusText}`;
    
    // Add seed range specific info to tooltip
    if (seedRangeInfo) {
      tooltipContent += `\nSeed Range: ${seedRangeInfo.seed_range}`;
      tooltipContent += `\nSeeds Passed: ${seedRangeInfo.seeds_passed}/${seedRangeInfo.total_seeds_tested}`;
      if (seedRangeInfo.consecutive_passes_before_failure > 0) {
        tooltipContent += `\nConsecutive Passes: ${seedRangeInfo.consecutive_passes_before_failure}`;
      }
      if (seedRangeInfo.first_failure_seed) {
        tooltipContent += `\nFirst Failure: Seed ${seedRangeInfo.first_failure_seed}`;
      }
    }
    
    if (testResult.generation_errors > 0) {
      tooltipContent += `\nGeneration Errors: ${testResult.generation_errors}`;
    }
    if (testResult.generation_warnings > 0) {
      tooltipContent += `\nGeneration Warnings: ${testResult.generation_warnings}`;
    }
    if (testResult.max_spheres > 0) {
      tooltipContent += `\nProgress: ${testResult.sphere_reached}/${testResult.max_spheres} spheres (${testResult.progress_percent}%)`;
    }
    if (testResult.has_custom_exporter) {
      tooltipContent += `\nCustom Exporter: Yes`;
    }
    if (testResult.has_custom_game_logic) {
      tooltipContent += `\nCustom Game Logic: Yes`;
    }

    // Build the badge display content
    let badgeDisplayText = statusText;
    let progressDisplay = '';
    let errorDisplay = '';
    
    // For seed ranges, show cleaner format
    if (seedRangeInfo) {
      if (status.toLowerCase() === 'passed') {
        badgeDisplayText = 'Passed';
        progressDisplay = `<div class="test-progress">Seeds ${seedRangeInfo.seed_range}</div>`;
      } else if (status.toLowerCase() === 'failed') {
        badgeDisplayText = 'Failed';
        if (seedRangeInfo.first_failure_seed) {
          progressDisplay = `<div class="test-progress">Seed ${seedRangeInfo.first_failure_seed}</div>`;
        } else {
          // Fallback if no first_failure_seed is specified
          progressDisplay = `<div class="test-progress">${seedRangeInfo.seeds_failed} failed</div>`;
        }
      }
    } else {
      // Single seed display (original)
      badgeDisplayText = statusText;
      if (testResult.max_spheres > 0) {
        progressDisplay = `<div class="test-progress">${testResult.sphere_reached}/${testResult.max_spheres}</div>`;
      }
    }
    
    if (testResult.generation_errors > 0) {
      errorDisplay = `<div class="test-errors">${testResult.generation_errors} errors</div>`;
    }

    return `
      <div class="test-badge ${badgeClass}" title="${this.escapeHtml(tooltipContent)}">
        <span class="test-icon">${statusIcon}</span>
        <div class="test-details">
          <div class="test-status">${badgeDisplayText}</div>
          ${progressDisplay}
          ${errorDisplay}
        </div>
      </div>
    `;
  }

  escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return unsafe
      .toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Add default export
export default PresetUI;
