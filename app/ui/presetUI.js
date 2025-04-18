import stateManager from '../core/stateManagerSingleton.js';
import eventBus from '../core/eventBus.js';

export class PresetUI {
  constructor(gameUI) {
    this.gameUI = gameUI;
    this.presets = null;
    this.currentGame = null;
    this.currentPreset = null;
    this.currentPlayer = null;
    this.initialized = false;
    this.presetsListContainer = null;
  }

  initialize() {
    // Find the container within the live files panel DOM element stored in gameUI
    this.presetsListContainer =
      window.gameUI?.filesPanelContainer?.querySelector('#presets-list');

    if (!this.presetsListContainer) {
      console.error(
        'PresetUI: Could not find #presets-list container within gameUI.filesPanelContainer during initialization.'
      );
      this.initialized = false;
      return false;
    }

    this.initialized = true; // Set initialized flag early if container found

    try {
      // Load the preset_files.json which contains the list of available presets
      const loadJSON = (url) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, false); // false makes it synchronous
        xhr.send();
        if (xhr.status === 200) {
          return JSON.parse(xhr.responseText);
        } else {
          throw new Error(`Failed to load ${url}: ${xhr.status}`);
        }
      };

      // Load the list of available presets
      this.presets = loadJSON('./presets/preset_files.json');

      // Render the games list
      this.renderGamesList();
      return true; // Return true from try block
    } catch (error) {
      console.error('Error loading presets data:', error);

      const container = this.presetsListContainer;
      if (container) {
        container.innerHTML = `
          <div class="error-message">
            <h3>Error Loading Presets</h3>
            <p>${error.message}</p>
            <p>Make sure the preset_files.json file exists in the presets directory.</p>
          </div>
        `;
      }
      this.initialized = false; // Reset on error
      return false; // Return false from catch block
    }
  }

  renderGamesList() {
    const container = this.presetsListContainer;
    if (!container) {
      console.error('Presets list container not found for renderGamesList');
      return;
    }

    if (!this.presets) {
      container.innerHTML = '<p>Loading preset list...</p>';
      console.warn('renderGamesList called before presets data was loaded.');
      return;
    }

    // Create a header
    let html = `
      <div class="preset-header">
        <h3>Select a Game Preset</h3>
      </div>
      <div class="presets-container">
    `;

    // Process each game
    Object.entries(this.presets).forEach(([gameId, gameData]) => {
      // Create a section for each game
      html += `
        <div class="game-row">
          <h4 class="game-name">${this.escapeHtml(gameData.name)}</h4>
      `;

      if (gameId === 'multiworld') {
        // Special layout for multiworld
        html += `<div class="multiworld-seeds">`;
        Object.entries(gameData.folders).forEach(([folderId, folderData]) => {
          html += `<div class="multiworld-seed-block">`;
          html += `<span class="seed-number">Seed: ${this.escapeHtml(
            folderData.seed
          )}</span>`;
          html += `<div class="seed-players">`;
          folderData.games.forEach((playerGame) => {
            html += `
              <div class="player-info">
                <button class="preset-player-button"
                        data-game="${this.escapeHtml(gameId)}"
                        data-folder="${this.escapeHtml(folderId)}"
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
      } else {
        // Standard layout for single-player games
        html += `<div class="game-presets">`;
        Object.entries(gameData.folders).forEach(([folderId, folderData]) => {
          html += `
            <button class="preset-button"
                    data-game="${this.escapeHtml(gameId)}"
                    data-folder="${this.escapeHtml(folderId)}"
                    title="${this.escapeHtml(
                      folderData.description || `Seed ${folderData.seed}`
                    )}">
              ${this.escapeHtml(folderData.seed)}
            </button>
          `;
        });
        html += `</div>`; // Close game-presets
      }

      // Close the game section
      html += `
        </div>
      `;
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
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 16px;
        }
        .game-name {
          margin: 0;
          color: #ddd;
          min-width: 200px;
        }
        .game-presets {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
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
      </style>
    `;

    // Set the HTML content
    container.innerHTML = html;

    // Add event listeners to the preset buttons (both standard and player)
    const buttons = container.querySelectorAll(
      '.preset-button, .preset-player-button'
    );
    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const gameId = button.getAttribute('data-game');
        const folderId = button.getAttribute('data-folder');
        const playerId = button.getAttribute('data-player'); // Will be null for standard buttons

        if (playerId) {
          console.log(
            `Loading preset ${folderId} from game ${gameId} for player ${playerId}`
          );
          this.currentGame = gameId;
          this.currentPreset = folderId;
          this.currentPlayer = playerId; // Store current player
          this.loadPreset(gameId, folderId, playerId);
        } else {
          console.log(`Loading preset ${folderId} from game ${gameId}`);
          this.currentGame = gameId;
          this.currentPreset = folderId;
          this.currentPlayer = null; // Clear current player
          this.loadPreset(gameId, folderId); // No player ID for standard presets
        }
      });
    });
  }

  loadPreset(gameId, folderId, playerId = null) {
    this.currentGame = gameId;
    this.currentPreset = folderId;
    this.currentPlayer = playerId;

    const container = this.presetsListContainer;
    if (!container) return;

    try {
      const gameData = this.presets[gameId];
      const folderData = gameData.folders[folderId];

      // Build the HTML for the preset details
      let headerTitle = `${this.escapeHtml(gameData.name)} - Preset`;
      if (playerId && gameId === 'multiworld') {
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
        const filePath = `./presets/${gameId}/${folderId}/${file}`;
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
            this.loadRulesFile(gameId, folderId, file, playerId);
          }
        });
      });

      // Automatically load the rules.json file for this preset/player
      let rulesFile = null;
      if (playerId && gameId === 'multiworld') {
        rulesFile = folderData.files.find((file) =>
          file.endsWith(`_P${playerId}_rules.json`)
        );
        if (!rulesFile) {
          // Fallback to default rules.json if player-specific not found
          rulesFile = folderData.files.find((file) =>
            file.endsWith('_rules.json')
          );
          if (rulesFile) {
            console.warn(
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
          console.warn(
            `Could not determine player ID for preset ${folderId}, defaulting to '1'.`
          );
        }

        this.loadRulesFile(gameId, folderId, rulesFile, effectivePlayerId);
      } else {
        console.warn(
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
      console.error('Error displaying preset:', error);
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

  loadRulesFile(gameId, folderId, rulesFile, playerId = '1') {
    try {
      // Publish event BEFORE doing anything else
      eventBus.publish('preset:rulesLoading', {
        gameId,
        folderId,
        rulesFile,
        playerId,
      });

      const filePath = `./presets/${gameId}/${folderId}/${rulesFile}`;
      console.log(`Loading rules file: ${filePath}`);

      // Show loading status
      const statusElement = document.getElementById('preset-status');
      if (statusElement) {
        statusElement.innerHTML = '<p>Loading rules file...</p>';
      }

      // Use synchronous XMLHttpRequest to load the rules
      const xhr = new XMLHttpRequest();
      xhr.open('GET', filePath, false); // false makes it synchronous
      xhr.send();

      if (xhr.status !== 200) {
        throw new Error(`Failed to load ${filePath}: ${xhr.status}`);
      }

      const jsonData = JSON.parse(xhr.responseText);

      // <<< Emit event to editor >>>
      eventBus.publish('editor:loadJsonData', {
        source: `Preset: ${filePath}`,
        data: jsonData,
      });
      // <<< End emit event >>>

      // Store the newly loaded rules data
      this.gameUI.currentRules = jsonData;

      // Initialize inventory with the new rules and starting items
      // For presets, we usually start with an empty inventory unless specified
      const startingItems = jsonData.starting_inventory || [];
      stateManager.initializeInventory(
        startingItems,
        jsonData.progression_mapping[playerId],
        jsonData.items[playerId]
      );

      // Load the complete rules data into the state manager, passing the selected player ID
      stateManager.loadFromJSON(jsonData, playerId);

      // --- Explicitly Initialize InventoryUI ---
      // InventoryUI needs the raw item and group structure from the JSON
      const playerItems = jsonData.items[playerId];
      const groups = jsonData.item_groups ? jsonData.item_groups[playerId] : {}; // Handle missing item_groups
      if (playerItems && this.gameUI.inventoryUI) {
        this.gameUI.inventoryUI.initialize(playerItems, groups || {}); // Pass empty object if groups are null/undefined
      } else {
        console.warn(
          '[PresetUI] Could not initialize InventoryUI - playerItems missing or inventoryUI instance not found.'
        );
      }
      // --- End InventoryUI Init ---

      // Explicitly compute reachability after loading new state and initializing inventory UI
      stateManager.computeReachableRegions();

      // Display success message
      if (statusElement) {
        statusElement.innerHTML = `
          <div class="success-message">
            <p>✓ Preset rules loaded successfully!</p>
            <p>You can now go to the Locations or Regions view to explore the game.</p>
          </div>
        `;
      }

      // Trigger rules:loaded event to enable offline play
      eventBus.publish('rules:loaded', {});

      // Re-enable control buttons if needed (though rules:loaded might handle this elsewhere)
      this.gameUI._enableControlButtons();
    } catch (error) {
      console.error('Error loading rules file:', error);

      // Update status
      const statusElement = document.getElementById('preset-status');
      if (statusElement) {
        statusElement.innerHTML = `
          <div class="error-message">
            <p>Error loading rules: ${error.message}</p>
          </div>
        `;
      }
    }
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

export default PresetUI;
