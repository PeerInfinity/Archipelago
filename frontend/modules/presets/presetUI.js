import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import { getModuleEventBus } from './index.js';
import { DEFAULT_PLAYER_ID } from '../shared/playerIdUtils.js';


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
    Object.defineProperty(this, 'eventBus', { get: () => getModuleEventBus(), configurable: true });

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
      this.eventBus.unsubscribe('app:readyForUiDataLoad', readyHandler);
    };
    this.eventBus.subscribe('app:readyForUiDataLoad', readyHandler);

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
      // Use cache: 'reload' to validate with server (allows 304 Not Modified)
      // Use cache: 'no-store' when ?nocache=1 is in URL (completely bypasses cache for testing)
      const noCache = new URLSearchParams(window.location.search).has('nocache');
      fetch('./presets/preset_files.json', { cache: noCache ? 'no-store' : 'reload' })
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
          log('warn', 'Presets data not available (this is OK if presets directory is empty):', error.message);
          this.presets = {};
          this.renderGamesList();
          this.initialized = true;
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
        <input type="file" id="json-file-input" accept=".json,.archipelago" style="display: none;" />
        <button id="load-json-button" class="button" style="margin-left: 10px;">Load File</button>
      </div>
      <div class="presets-container">
        <div class="game-row game-row-header">
          <div class="game-name-header">Game</div>
          <div class="game-presets-header">Seeds</div>
          <div class="test-headers">
            <span class="test-header" title="Minimal Spoiler Test">MS</span>
            <span class="test-header" title="Full Spoiler Test">FS</span>
            <span class="test-header" title="Multi-client Test">MC</span>
            <span class="test-header" title="Multi-world Test">MW</span>
            <span class="test-header" title="Spoiler Fuzz Test">SF</span>
          </div>
        </div>
    `;

    // Group preset directories by display name so that variants sharing the same
    // game name (e.g. "alttp" and "alttp_vanilla", both named "A Link to the Past")
    // appear as a single row. Seeds from vanilla directories get a V badge.
    // Each group tracks: primaryGameData (for test results), seeds[], hasMultiworld.
    const nameGroups = new Map();

    Object.entries(this.presets).forEach(([gameDirectory, gameData]) => {
      if (gameDirectory === 'metadata') return;

      const name = gameData.name;
      if (!nameGroups.has(name)) {
        nameGroups.set(name, { primaryGameData: gameData, seeds: [], hasMultiworld: false });
      }
      const group = nameGroups.get(name);

      if (gameDirectory === 'multiworld') {
        group.hasMultiworld = true;
        group.primaryGameData = gameData;
      } else {
        // Prefer the directory that has test_results for the test badge.
        if (gameData.test_results) {
          group.primaryGameData = gameData;
        }
      }

      Object.entries(gameData.folders || {}).forEach(([seedName, folderData]) => {
        group.seeds.push({ gameDirectory, seedName, folderData });
      });
    });

    // Render each name group as one game-row
    nameGroups.forEach((group, name) => {
      const { primaryGameData, seeds, hasMultiworld } = group;

      html += `<div class="game-row">`;

      if (hasMultiworld) {
        // Multiworld: game-name is a direct child of game-row (closed immediately after)
        html += `<h4 class="game-name">${this.escapeHtml(name)}</h4>`;
        html += `</div>`; // Close the inline game-row
        html += `<div class="multiworld-container">`;
        html += `<div class="multiworld-seeds">`;
        seeds.forEach(({ gameDirectory, seedName, folderData }) => {
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
        // Flat layout: game-name first (top-left), seed buttons flow naturally,
        // test badges last with margin-left:auto (bottom-right)
        html += `<h4 class="game-name">${this.escapeHtml(name)}</h4>`;
        seeds.forEach(({ gameDirectory, seedName, folderData }) => {
          const isVanilla = !!folderData.is_vanilla;
          const vanillaBadge = isVanilla
            ? `<span class="placement-badge placement-vanilla" title="Vanilla placement">V</span>`
            : '';
          html += `
            <button class="preset-button"
                    data-game-directory="${this.escapeHtml(gameDirectory)}"
                    data-seed-name="${this.escapeHtml(seedName)}"
                    title="${this.escapeHtml(
                      folderData.label || `Seed ${folderData.seed}${isVanilla ? ' (vanilla)' : ''}`
                    )}">
              ${this.escapeHtml(folderData.label || folderData.seed)}${vanillaBadge}
            </button>
          `;
        });
        html += this.renderTestResultBadge(primaryGameData);
      }

      if (!hasMultiworld) {
        html += `</div>`; // Close game-row
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
          gap: 4px;
          margin-top: 16px;
        }
        .game-row {
          background-color: rgba(0, 0, 0, 0.1);
          border-radius: 8px;
          padding: 16px;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
        }
        .game-name {
          margin: 0;
          color: #ddd;
          min-width: 200px;
          flex-shrink: 0;
        }
        .game-row-header {
          background-color: rgba(0, 0, 0, 0.3);
          border-bottom: 2px solid rgba(255, 255, 255, 0.2);
          padding: 8px 16px;
          font-weight: 600;
          color: #aaa;
          font-size: 0.85em;
          flex-wrap: nowrap;
        }
        .game-name-header {
          min-width: 200px;
          flex-shrink: 0;
        }
        .game-presets-header {
          flex: 1;
          text-align: center;
        }
        .test-headers {
          display: flex;
          gap: 4px;
          flex-shrink: 0;
        }
        .test-header {
          width: 24px;
          text-align: center;
          cursor: help;
        }
        .test-badges-container {
          display: flex;
          gap: 4px;
          flex-shrink: 0;
          margin-left: auto;
        }
        .test-badge-mini {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 4px;
          cursor: help;
        }
        .test-badge-mini.test-badge-passed {
          background-color: rgba(76, 175, 80, 0.2);
          border: 1px solid rgba(76, 175, 80, 0.5);
          color: #a5d6a7;
        }
        .test-badge-mini.test-badge-failed {
          background-color: rgba(244, 67, 54, 0.2);
          border: 1px solid rgba(244, 67, 54, 0.5);
          color: #ef9a9a;
        }
        .test-badge-mini.test-badge-unknown {
          background-color: rgba(158, 158, 158, 0.2);
          border: 1px solid rgba(158, 158, 158, 0.5);
          color: #bdbdbd;
        }
        .test-icon-mini {
          font-size: 0.9em;
        }
        .game-presets {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          flex: 1 1 auto;
          align-items: center;
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
        .placement-badge {
          display: inline-block;
          font-size: 0.65em;
          font-weight: 700;
          padding: 1px 4px;
          border-radius: 3px;
          margin-left: 6px;
          vertical-align: middle;
          line-height: 1;
        }
        .placement-vanilla {
          background-color: rgba(156, 39, 176, 0.3);
          border: 1px solid rgba(156, 39, 176, 0.6);
          color: #ce93d8;
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
          // Check if file is an .archipelago file (zip format)
          if (file.name.endsWith('.archipelago')) {
            this.loadArchipelagoFile(file);
          } else {
            // Regular JSON file handling
            const reader = new FileReader();
            reader.onload = (e) => {
              try {
                const jsonData = JSON.parse(e.target.result);
                this.displayLoadedJsonFileDetails(jsonData, file.name);
              } catch (err) {
                log('error', 'Error parsing JSON file:', err);
                this.eventBus.publish('ui:notification', {
                  type: 'error',
                  message: `Error parsing ${file.name}: ${err.message}`,
                });
              }
            };
            reader.onerror = (err) => {
              log('error', 'Error reading file:', err);
              this.eventBus.publish('ui:notification', {
                type: 'error',
                message: `Error reading ${file.name}.`,
              });
            };
            reader.readAsText(file);
          }
        }
      });
    }

    // Add event listeners to the preset buttons (both standard and player)
    const buttons = container.querySelectorAll(
      '.preset-button, .preset-player-button'
    );
    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        // Save scroll position so we can restore it when navigating back
        this._savedScrollTop = this.presetsListContainer ? this.presetsListContainer.scrollTop : 0;

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

    // Restore scroll position if returning from a preset detail view
    if (this._savedScrollTop && this.presetsListContainer) {
      requestAnimationFrame(() => {
        this.presetsListContainer.scrollTop = this._savedScrollTop;
      });
    }
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
      const playerId = DEFAULT_PLAYER_ID; // Default or determine from JSON if possible (e.g., if not multiworld)
      // We need a way to call the core logic of loadRulesFile without assuming a preset structure.
      // This might involve refactoring parts of loadRulesFile or creating a new shared method.
      log('info', 
        `Attempting to process ${fileName} as rules file for Player ${playerId}`
      );
      // Directly call the processing logic, adapting from loadRulesFile
      this.processManuallyLoadedRules(jsonData, fileName, playerId);
    }
  }

  async processManuallyLoadedRules(rulesData, fileName, playerId = DEFAULT_PLAYER_ID) {
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
      this.eventBus.publish('files:jsonLoaded', {
        jsonData: rulesData,
        selectedPlayerId: playerId,
        sourceName: `userLoaded:${fileName}` // Prefix to indicate manually loaded file
      });

      this.eventBus.publish('ui:notification', {
        type: 'success',
        message: `Loaded ${fileName} for Player ${playerId}`,
      });

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

      this.eventBus.publish('rules:loaded', {});
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

  /**
   * Loads JSZip library dynamically if not already loaded
   * @returns {Promise<JSZip>} The JSZip constructor
   */
  async loadJSZip() {
    if (window.JSZip) {
      return window.JSZip;
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = './libs/jszip/jszip.min.js';
      script.onload = () => {
        if (window.JSZip) {
          log('info', 'JSZip library loaded successfully');
          resolve(window.JSZip);
        } else {
          reject(new Error('JSZip failed to initialize'));
        }
      };
      script.onerror = () => {
        reject(new Error('Failed to load JSZip library'));
      };
      document.head.appendChild(script);
    });
  }

  /**
   * Load and extract rules.json from an .archipelago file (zip format)
   * @param {File} file - The .archipelago file to process
   */
  async loadArchipelagoFile(file) {
    log('info', `Loading .archipelago file: ${file.name}`);

    try {
      // Load JSZip library
      const JSZip = await this.loadJSZip();

      // Read the file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();

      // Load the zip content
      const zip = await JSZip.loadAsync(arrayBuffer);

      // Find the rules.json file in the archive
      // It could be at the root or in a subdirectory, and may have different naming patterns
      let rulesFile = null;
      let rulesFileName = null;

      // Search for files ending with _rules.json or rules.json
      for (const [filename, zipEntry] of Object.entries(zip.files)) {
        if (!zipEntry.dir && (filename.endsWith('_rules.json') || filename === 'rules.json')) {
          rulesFile = zipEntry;
          rulesFileName = filename;
          log('info', `Found rules file in archive: ${filename}`);
          break;
        }
      }

      if (!rulesFile) {
        // If no rules file found, list the contents for debugging
        const fileList = Object.keys(zip.files).filter(f => !zip.files[f].dir);
        log('warn', 'No rules.json file found in archive. Contents:', fileList);
        throw new Error(`No rules.json file found in ${file.name}. Archive contains: ${fileList.join(', ')}`);
      }

      // Extract the rules.json content
      const rulesContent = await rulesFile.async('string');
      const jsonData = JSON.parse(rulesContent);

      log('info', `Successfully extracted ${rulesFileName} from ${file.name}`);

      // Process the extracted rules.json using existing method
      this.displayLoadedJsonFileDetails(jsonData, `${file.name} → ${rulesFileName}`);

    } catch (err) {
      log('error', 'Error loading .archipelago file:', err);
      this.eventBus.publish('ui:notification', {
        type: 'error',
        message: `Error loading ${file.name}: ${err.message}`,
      });
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

  async loadRulesFile(gameDirectory, seedName, rulesFile, playerId = DEFAULT_PLAYER_ID) {
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
      this.eventBus.publish('files:jsonLoaded', {
        jsonData: rulesData,
        selectedPlayerId: playerId,
        sourceName: fullPath
      });

      // Publish success notification
      this.eventBus.publish('ui:notification', {
        type: 'success',
        message: `Loaded ${rulesFile} for Player ${playerId}`,
      });

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
      this.eventBus.publish('rules:loaded', {});

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
    const testResults = gameData.test_results;

    // Define the five test types with their labels and full names for tooltips
    const testTypes = [
      { key: 'minimal_spoiler', fullName: 'Minimal Spoiler Test' },
      { key: 'full_spoiler', fullName: 'Full Spoiler Test' },
      { key: 'multiclient', fullName: 'Multi-client Test' },
      { key: 'multiworld', fullName: 'Multi-world Test' },
      { key: 'spoiler_fuzz', fullName: 'Spoiler Fuzz Test' },
    ];

    // Build badges for each test type
    const badges = testTypes.map(testType => {
      const result = testResults ? testResults[testType.key] : null;
      return this.renderSingleTestBadge(result, testType.fullName);
    }).join('');

    return `<div class="test-badges-container">${badges}</div>`;
  }

  renderSingleTestBadge(result, fullName) {
    let icon = '❓';
    let badgeClass = 'test-badge-unknown';
    let tooltipContent = `${fullName}: No data`;

    if (result) {
      if (result.passed) {
        icon = '✅';
        badgeClass = 'test-badge-passed';
        tooltipContent = `${fullName}: Passed`;
      } else {
        icon = '❌';
        badgeClass = 'test-badge-failed';
        tooltipContent = `${fullName}: Failed`;
      }

      // Add seed/player count info to tooltip if available
      if (result.total_seeds !== undefined && result.total_seeds > 1) {
        tooltipContent += `\nSeeds: ${result.seeds_passed}/${result.total_seeds} passed`;
        if (result.first_failure_seed) {
          tooltipContent += `\nFirst failure: Seed ${result.first_failure_seed}`;
        }
      }
      if (result.first_failure_player) {
        tooltipContent += `\nFirst failure: Player ${result.first_failure_player}`;
      }
      if (result.total_locations !== undefined) {
        tooltipContent += `\nLocations: ${result.locations_checked}/${result.total_locations} checked`;
      }
      // Add fuzz test run info to tooltip if available
      if (result.total_runs !== undefined) {
        tooltipContent += `\nRuns: ${result.runs_passed}/${result.total_runs} passed`;
        if (result.runs_failed > 0 && result.failure_types) {
          tooltipContent += `\nFailures: ${result.failure_types}`;
        }
      }
    }

    return `
      <div class="test-badge-mini ${badgeClass}" title="${this.escapeHtml(tooltipContent)}">
        <span class="test-icon-mini">${icon}</span>
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
