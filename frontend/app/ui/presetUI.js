import stateManager from '../core/stateManagerSingleton.js';

export class PresetUI {
  constructor(gameUI) {
    this.gameUI = gameUI;
    this.presets = null;
    this.currentGame = null;
    this.currentPreset = null;
  }

  initialize() {
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
      return true;
    } catch (error) {
      console.error('Error loading presets data:', error);

      const container = document.getElementById('presets-list');
      if (container) {
        container.innerHTML = `
          <div class="error-message">
            <h3>Error Loading Presets</h3>
            <p>${error.message}</p>
            <p>Make sure the preset_files.json file exists in the presets directory.</p>
          </div>
        `;
      }

      return false;
    }
  }

  renderGamesList() {
    const container = document.getElementById('presets-list');
    if (!container) {
      console.error('Presets list container not found');
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
          <div class="game-presets">
      `;

      // Add numbered buttons for each preset folder
      let presetNumber = 1;
      Object.entries(gameData.folders).forEach(([folderId, folderData]) => {
        html += `
          <button class="preset-button" 
                  data-game="${this.escapeHtml(gameId)}" 
                  data-folder="${this.escapeHtml(folderId)}"
                  title="${this.escapeHtml(folderData.description)}">
            ${presetNumber}
          </button>
        `;
        presetNumber++;
      });

      // Close the game section
      html += `
          </div>
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
          align-items: center;
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
      </style>
    `;

    // Set the HTML content
    container.innerHTML = html;

    // Add event listeners to the preset buttons
    const buttons = container.querySelectorAll('.preset-button');
    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const gameId = button.getAttribute('data-game');
        const folderId = button.getAttribute('data-folder');
        console.log(`Loading preset ${folderId} from game ${gameId}`);
        this.currentGame = gameId;
        this.currentPreset = folderId;
        this.loadPreset(gameId, folderId);
      });
    });
  }

  loadPreset(gameId, folderId) {
    try {
      const container = document.getElementById('presets-list');
      if (!container) {
        console.error('Presets list container not found');
        return;
      }

      const gameData = this.presets[gameId];
      const folderData = gameData.folders[folderId];

      // Build the HTML for the preset details
      let html = `
        <button class="back-button" id="back-to-presets">← Back to Games</button>
        <div class="preset-info">
          <h3>${this.escapeHtml(gameData.name)} - Preset</h3>
          <p>${this.escapeHtml(folderData.description)}</p>
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
            this.loadRulesFile(gameId, folderId, file);
          }
        });
      });

      // Automatically load the rules.json file for this preset
      const rulesFile = folderData.files.find((file) =>
        file.endsWith('_rules.json')
      );
      if (rulesFile) {
        this.loadRulesFile(gameId, folderId, rulesFile);
      }
    } catch (error) {
      console.error('Error displaying preset:', error);
      const container = document.getElementById('presets-list');
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

  loadRulesFile(gameId, folderId, rulesFile) {
    try {
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

      // Clear existing data and load the new rules
      this.gameUI.clearExistingData();
      this.gameUI.currentRules = jsonData; // Track current rules

      // Initialize inventory and load rules data into stateManager
      stateManager.initializeInventory(
        [], // Initial items
        jsonData.progression_mapping['1'],
        jsonData.items['1']
      );

      stateManager.loadFromJSON(jsonData);

      // Initialize the UI
      this.gameUI.initializeUI(jsonData);

      console.log('Successfully loaded preset rules');

      // Update status
      if (statusElement) {
        statusElement.innerHTML = `
          <div class="success-message">
            <p>✓ Preset rules loaded successfully!</p>
            <p>You can now go to the Locations or Regions view to explore the game.</p>
          </div>
        `;
      }
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
