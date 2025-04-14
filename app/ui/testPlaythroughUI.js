import stateManager from '../core/stateManagerSingleton.js';

export class TestPlaythroughUI {
  constructor(gameUI) {
    this.gameUI = gameUI;
    this.playthroughFiles = null;
    this.currentPlaythrough = null;
    this.logContainer = null;
    this.abortController = null; // To cancel ongoing tests

    // State for stepping through tests
    this.logEvents = null;
    this.currentLogIndex = 0;
    this.rulesLoaded = false;
    this.presetInfo = null;
    this.testStateInitialized = false;
  }

  initialize() {
    console.log('Initializing TestPlaythroughUI');
    const container = document.getElementById('test-playthroughs-panel');
    if (!container) {
      console.error('Test Playthroughs panel container not found');
      return false;
    }
    container.innerHTML = '<p>Loading playthrough list...</p>';

    try {
      const loadJSON = (url) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, false);
        xhr.send();
        if (xhr.status === 200) {
          return JSON.parse(xhr.responseText);
        } else {
          throw new Error(`Failed to load ${url}: ${xhr.status}`);
        }
      };

      this.playthroughFiles = loadJSON('./playthroughs/playthrough_files.json');
      console.log('Loaded playthrough files:', this.playthroughFiles);

      this.renderPlaythroughList(); // Initial view
      return true;
    } catch (error) {
      console.error('Error loading playthrough files data:', error);
      container.innerHTML = `<div class="error-message">Failed to load playthroughs: ${error.message}</div>`;
      return false;
    }
  }

  renderPlaythroughList() {
    const container = document.getElementById('test-playthroughs-panel');
    if (!container) return;

    // Clear previous state when returning to list
    this.clearTestState();

    let html = `
      <div class="playthrough-header">
        <h3>Select a Playthrough to Test</h3>
      </div>
      <div class="playthrough-list-container">
    `;

    if (!this.playthroughFiles || this.playthroughFiles.length === 0) {
      html +=
        '<p>No playthrough files found in playthroughs/playthrough_files.json</p>';
    } else {
      this.playthroughFiles.forEach((playthrough, index) => {
        html += `
          <div class="playthrough-item">
            <span class="playthrough-name">${this.escapeHtml(
              playthrough.filename
            )}</span>
            <span class="playthrough-details">(${this.escapeHtml(
              playthrough.game
            )} - P${playthrough.player_id} - Seed: ${playthrough.seed})</span>
            <button class="button select-playthrough" data-index="${index}">Select</button>
          </div>
        `;
      });
    }

    html += `</div>`;
    // Styles moved to renderResultsView or CSS file for better organization

    container.innerHTML = html;

    // Add event listeners for the "Select" buttons
    container.querySelectorAll('.select-playthrough').forEach((button) => {
      button.addEventListener('click', () => {
        const index = parseInt(button.getAttribute('data-index'), 10);
        this.currentPlaythrough = this.playthroughFiles[index];
        this.renderResultsView(); // Show the results view for the selected playthrough
      });
    });
  }

  renderResultsView() {
    const container = document.getElementById('test-playthroughs-panel');
    if (!container || !this.currentPlaythrough) return;

    container.innerHTML = `
        <div class="playthrough-results-header">
            <button id="back-to-playthrough-list" class="button back-button">← Back to List</button>
            <h4>Testing: ${this.escapeHtml(
              this.currentPlaythrough.filename
            )}</h4>
            <div class="playthrough-controls">
                <button id="run-full-test" class="button">Run Full Test</button>
                <button id="step-test" class="button">Step Test</button>
                <span id="test-step-info"></span>
            </div>
        </div>
        <div id="playthrough-log-output" class="playthrough-log-output">
            <!-- Log messages will appear here -->
        </div>
        <style>
            .playthrough-results-header { margin-bottom: 1rem; border-bottom: 1px solid #444; padding-bottom: 1rem;}
            .playthrough-results-header h4 { margin: 0.5rem 0; }
            .playthrough-controls { display: flex; gap: 0.5rem; align-items: center; margin-top: 0.5rem; }
            #test-step-info { margin-left: 1rem; font-size: 0.9em; color: #aaa; }
            .playthrough-list-container { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
            .playthrough-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; background: rgba(0,0,0,0.1); border-radius: 4px; flex-wrap: wrap; }
            .playthrough-name { font-weight: bold; flex-grow: 1; }
            .playthrough-details { font-size: 0.9em; color: #aaa; }
            .playthrough-log-output {
              height: 400px; /* Adjust as needed */
              overflow-y: auto;
              background-color: #1a1a1a;
              border: 1px solid #444;
              border-radius: 4px;
              padding: 0.5rem;
              font-family: monospace;
              font-size: 0.9em;
              color: #ccc;
              white-space: pre-wrap; /* Keep line breaks */
            }
            .log-entry { margin-bottom: 0.25rem; border-bottom: 1px solid #333; padding-bottom: 0.25rem; }
            .log-entry:last-child { border-bottom: none; }
            .log-error { color: #f44336; font-weight: bold; }
            .log-success { color: #4caf50; font-weight: bold; }
            .log-info { color: #aaa; }
            .log-step { color: #ffc107; }
            .log-state { color: #2196f3; }
            .log-mismatch { background-color: rgba(244, 67, 54, 0.2); padding: 2px 4px; border-radius: 3px; }
            .back-button { margin-right: 1rem; background-color: #444; }
            .back-button:hover { background-color: #555; }
         </style>
     `;

    this.logContainer = container.querySelector('#playthrough-log-output'); // Store reference

    // Add event listeners for the results view buttons
    document
      .getElementById('back-to-playthrough-list')
      .addEventListener('click', () => {
        this.renderPlaythroughList();
      });
    document.getElementById('run-full-test').addEventListener('click', () => {
      this.runFullPlaythroughTest();
    });
    document.getElementById('step-test').addEventListener('click', () => {
      this.stepPlaythroughTest();
    });
  }

  async preparePlaythroughTest() {
    if (this.testStateInitialized) return true; // Already prepared

    if (!this.logContainer) return false;
    this.logContainer.innerHTML = ''; // Clear logs for new preparation

    // Abort previous test if running
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    this.log('info', `Preparing test for: ${this.currentPlaythrough.filename}`);

    try {
      // --- 1. Find Corresponding Preset ---
      this.log('step', '1. Finding matching preset...');
      this.presetInfo = this.findPresetForPlaythrough(this.currentPlaythrough);
      if (!this.presetInfo) {
        throw new Error(
          `No matching preset found for game "${this.currentPlaythrough.game}" and seed "${this.currentPlaythrough.seed}". Check presets/preset_files.json.`
        );
      }
      this.log(
        'success',
        `Found preset: Game "${this.presetInfo.gameId}", Folder "${this.presetInfo.folderId}"`
      );

      // --- 2. Load Preset Rules ---
      this.log('step', '2. Loading preset rules...');
      this.rulesLoaded = await this.loadPresetRules(
        this.presetInfo.gameId,
        this.presetInfo.folderId,
        this.currentPlaythrough.player_id.toString(),
        signal
      );
      if (!this.rulesLoaded) {
        // Error already logged in loadPresetRules
        return false;
      }
      this.log('success', 'Preset rules loaded successfully.');

      // --- 3. Load Playthrough Log ---
      this.log('step', '3. Loading playthrough log file...');
      const logFilePath = `./playthroughs/${this.currentPlaythrough.filename}`;
      this.logEvents = await this.loadLogFile(logFilePath, signal);
      if (!this.logEvents) {
        // Error already logged in loadLogFile
        return false;
      }
      this.log('success', `Loaded ${this.logEvents.length} events from log.`);

      this.currentLogIndex = 0;
      this.testStateInitialized = true;
      this.updateStepInfo();
      this.log('info', 'Preparation complete. Ready to run or step.');
      return true;
    } catch (error) {
      if (error.name === 'AbortError') {
        this.log('info', 'Test preparation aborted.');
      } else {
        this.log('error', `Test preparation failed: ${error.message}`);
        console.error('Playthrough Test Prep Error:', error);
      }
      this.clearTestState(); // Clean up on error
      return false;
    }
  }

  async runFullPlaythroughTest() {
    const prepared = await this.preparePlaythroughTest();
    if (!prepared) return;

    if (!this.logEvents) {
      this.log('error', 'No log events loaded.');
      return;
    }

    this.log('step', '4. Processing all log events...');
    const runButton = document.getElementById('run-full-test');
    const stepButton = document.getElementById('step-test');
    if (runButton) runButton.disabled = true;
    if (stepButton) stepButton.disabled = true;

    try {
      while (this.currentLogIndex < this.logEvents.length) {
        if (this.abortController.signal.aborted)
          throw new DOMException('Aborted', 'AbortError');
        await this.processSingleEvent(this.logEvents[this.currentLogIndex]);
        this.currentLogIndex++;
        this.updateStepInfo();
        // Add a small delay to allow UI updates and prevent blocking
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      // --- 5. Final Result ---
      if (!this.abortController.signal.aborted) {
        this.log(
          'success',
          'Playthrough test completed successfully. All states matched.'
        );
      } else {
        this.log('info', 'Playthrough test aborted.');
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        this.log('info', 'Playthrough test aborted.');
      } else {
        this.log(
          'error',
          `Test failed at step ${this.currentLogIndex + 1}: ${error.message}`
        );
        console.error(
          `Playthrough Test Error at step ${this.currentLogIndex + 1}:`,
          error
        );
      }
    } finally {
      if (runButton) runButton.disabled = false;
      if (stepButton) stepButton.disabled = false;
      // Don't reset abort controller here, allow stepping after failure/abort
    }
  }

  async stepPlaythroughTest() {
    const prepared = await this.preparePlaythroughTest();
    if (!prepared) return;

    if (!this.logEvents) {
      this.log('error', 'No log events loaded.');
      return;
    }

    if (this.currentLogIndex >= this.logEvents.length) {
      this.log('info', 'End of log file reached.');
      return;
    }

    const runButton = document.getElementById('run-full-test');
    const stepButton = document.getElementById('step-test');
    if (runButton) runButton.disabled = true;
    if (stepButton) stepButton.disabled = true;

    try {
      await this.processSingleEvent(this.logEvents[this.currentLogIndex]);
      this.currentLogIndex++;
      this.updateStepInfo();

      if (this.currentLogIndex >= this.logEvents.length) {
        this.log(
          'success',
          'Playthrough test completed successfully (stepped to end).'
        );
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        this.log('info', 'Playthrough step aborted.');
      } else {
        this.log(
          'error',
          `Test failed at step ${this.currentLogIndex + 1}: ${error.message}`
        );
        console.error(
          `Playthrough Test Error at step ${this.currentLogIndex + 1}:`,
          error
        );
      }
    } finally {
      if (runButton) runButton.disabled = false;
      if (stepButton) stepButton.disabled = false;
    }
  }

  updateStepInfo() {
    const stepInfoEl = document.getElementById('test-step-info');
    if (stepInfoEl && this.logEvents) {
      stepInfoEl.textContent = `(Step ${this.currentLogIndex} / ${this.logEvents.length})`;
    } else if (stepInfoEl) {
      stepInfoEl.textContent = '';
    }
  }

  async processSingleEvent(event) {
    // This function now only processes a single event
    if (!event) return;

    this.log(
      'step',
      `--- Processing Event ${this.currentLogIndex + 1}/${
        this.logEvents.length
      }: ${event.event} ---`
    );

    switch (event.event) {
      case 'connected':
        this.log(
          'info',
          `Player ${event.player_name} (ID: ${event.player_id}) connected. Seed: ${event.seed_name}`
        );
        break;

      case 'initial_state':
        this.log('state', 'Comparing initial state...');
        stateManager.computeReachableRegions(); // Ensure initial compute after load
        this.compareAccessibleLocations(
          event.accessible_locations,
          'Initial State'
        );
        break;

      case 'checked_location':
        if (event.location && event.location.name) {
          const locName = event.location.name;
          this.log('info', `Simulating check for location: "${locName}"`);

          const locData = stateManager.locations.find(
            (l) => l.name === locName
          );

          if (!locData) {
            this.log(
              'error',
              `Location "${locName}" from log not found in current rules. Skipping check.`
            );
          } else {
            const wasAccessible = stateManager.isLocationAccessible(locData);
            if (!wasAccessible && !stateManager.isLocationChecked(locName)) {
              this.log(
                'error',
                `Log indicates checking "${locName}", but it was NOT accessible according to current logic!`
              );
              throw new Error(
                `Attempted to check inaccessible location: "${locName}"`
              );
            }

            if (locData.item && !stateManager.isLocationChecked(locName)) {
              this.log(
                'info',
                `Found item "${locData.item.name}" at "${locName}". Adding to inventory.`
              );
              const itemAdded = stateManager.addItemToInventory(
                locData.item.name
              );
              if (!itemAdded) {
                this.log(
                  'warn',
                  `Could not add item "${locData.item.name}" (possibly unknown). State might be inaccurate.`
                );
              }
            }

            stateManager.checkLocation(locName);
            this.log('info', `Location "${locName}" marked as checked.`);
          }
        } else {
          this.log(
            'error',
            `Invalid 'checked_location' event structure: ${JSON.stringify(
              event
            )}`
          );
        }
        break;

      case 'state_update':
        this.log('state', 'Comparing state after update...');
        // stateManager computation is triggered by addItemToInventory or should be up-to-date
        this.compareAccessibleLocations(
          event.accessible_locations,
          `State after event ${this.currentLogIndex + 1}`
        );
        break;

      default:
        this.log('info', `Skipping unhandled event type: ${event.event}`);
    }
  }

  findPresetForPlaythrough(playthroughInfo) {
    // Needs access to presetUI's loaded presets or load it itself
    // For simplicity, let's assume presetUI is available via gameUI
    if (!this.gameUI.presetUI || !this.gameUI.presetUI.presets) {
      this.log(
        'error',
        'Preset data not available. Ensure Presets tab was loaded.'
      );
      return null;
    }

    const presetsData = this.gameUI.presetUI.presets;
    const gameId = Object.keys(presetsData).find(
      (gid) => presetsData[gid].name === playthroughInfo.game
    );

    if (!gameId) {
      this.log(
        'error',
        `Preset game ID not found for game: ${playthroughInfo.game}`
      );
      return null;
    }

    const gameData = presetsData[gameId];

    // --- Modified Logic ---
    const folderId = Object.keys(gameData.folders).find((fid) => {
      const match = fid.match(/AP_(\d+)$/); // Look for AP_ followed by digits at the end
      if (match && match[1]) {
        // Compare the extracted number (as string) with the playthrough seed (as string)
        return match[1] === playthroughInfo.seed.toString();
      }
      // If the folder name doesn't match the AP_ pattern, skip it for this matching logic
      return false;
    });
    // --- End Modified Logic ---

    if (!folderId) {
      this.log(
        'error',
        `Preset folder not found for game ${gameId} and seed ${playthroughInfo.seed} (matching AP_number in folder name)`
      );
      return null;
    }

    return { gameId, folderId };
  }

  async loadPresetRules(gameId, folderId, playerId, signal) {
    // Reuse logic from PresetUI.loadRulesFile but make it async and check signal
    return new Promise((resolve, reject) => {
      if (signal.aborted)
        return reject(new DOMException('Aborted', 'AbortError'));

      const presetsData = this.gameUI.presetUI.presets;
      const folderData = presetsData[gameId]?.folders?.[folderId];
      if (!folderData) return reject(new Error('Preset folder data not found'));

      let rulesFile = null;
      if (playerId && gameId === 'multiworld') {
        rulesFile = folderData.files.find((file) =>
          file.endsWith(`_P${playerId}_rules.json`)
        );
        if (!rulesFile) {
          rulesFile = folderData.files.find((file) =>
            file.endsWith('_rules.json')
          );
          if (rulesFile)
            this.log(
              'info',
              `Player-specific rules file not found for P${playerId}, using default rules.json`
            );
        }
      } else {
        rulesFile = folderData.files.find((file) =>
          file.endsWith('_rules.json')
        );
      }

      if (!rulesFile) {
        return reject(
          new Error(
            `Could not find a suitable rules file in preset folder ${folderId}`
          )
        );
      }

      const filePath = `./presets/${gameId}/${folderId}/${rulesFile}`;
      this.log('info', `Fetching rules: ${filePath}`);

      fetch(filePath)
        .then((response) => {
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
          if (!response.ok)
            throw new Error(`HTTP error! status: ${response.status}`);
          return response.json();
        })
        .then((jsonData) => {
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

          try {
            // Clear existing data and load the new rules
            this.gameUI.clearExistingData();
            this.gameUI.currentRules = jsonData; // Track current rules

            // Use stateManager directly
            stateManager.initializeInventory(
              [], // Start with empty inventory for preset load
              jsonData.progression_mapping?.[playerId],
              jsonData.items?.[playerId],
              jsonData.item_groups?.[playerId] // Pass group data too
            );

            // Load settings, shops, starting items etc. via stateManager
            stateManager.loadFromJSON(jsonData, playerId);

            // Initialize the main UI (regions, locations etc.) - Crucial for inventoryUI setup
            this.gameUI.initializeUI(jsonData, playerId);

            this.log(
              'info',
              `Rules loaded for player ${playerId}. StateManager initialized.`
            );
            resolve(true);
          } catch (initError) {
            reject(
              new Error(
                `Error initializing stateManager/UI: ${initError.message}`
              )
            );
          }
        })
        .catch((error) => {
          if (error.name === 'AbortError') {
            this.log('info', 'Rules loading aborted.');
            resolve(false); // Resolve false if aborted cleanly
          } else {
            this.log(
              'error',
              `Failed to load or process rules file ${filePath}: ${error.message}`
            );
            reject(error); // Propagate other errors
          }
        });
    });
  }

  async loadLogFile(filePath, signal) {
    return new Promise((resolve, reject) => {
      fetch(filePath)
        .then((response) => {
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
          if (!response.ok)
            throw new Error(`HTTP error! status: ${response.status}`);
          return response.text();
        })
        .then((text) => {
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
          try {
            const lines = text.trim().split('\n');
            const events = lines.map((line) => JSON.parse(line));
            resolve(events);
          } catch (parseError) {
            reject(
              new Error(
                `Failed to parse log file ${filePath}: ${parseError.message}`
              )
            );
          }
        })
        .catch((error) => {
          if (error.name === 'AbortError') {
            this.log('info', 'Log file loading aborted.');
            resolve(null); // Resolve null if aborted cleanly
          } else {
            this.log(
              'error',
              `Failed to load log file ${filePath}: ${error.message}`
            );
            reject(error); // Propagate other errors
          }
        });
    });
  }

  compareAccessibleLocations(logAccessible, context) {
    // Get reachable but unchecked locations from stateManager
    const stateAccessibleUnchecked = stateManager
      .getProcessedLocations(undefined, true, false) // Get only reachable locations
      .filter((loc) => !stateManager.isLocationChecked(loc.name)) // Filter out checked locations
      .map((loc) => loc.name);

    const stateAccessibleSet = new Set(stateAccessibleUnchecked);
    const logAccessibleSet = new Set(logAccessible.map((loc) => loc.name));

    const missingFromState = [...logAccessibleSet].filter(
      (name) => !stateAccessibleSet.has(name)
    );
    const extraInState = [...stateAccessibleSet].filter(
      (name) => !logAccessibleSet.has(name)
    );

    if (missingFromState.length === 0 && extraInState.length === 0) {
      this.log(
        'success',
        `State match OK for: ${context}. (${stateAccessibleSet.size} accessible & unchecked)`
      );
    } else {
      this.log('error', `STATE MISMATCH found for: ${context}`);
      if (missingFromState.length > 0) {
        this.log(
          'mismatch',
          ` > Locations accessible in LOG but NOT in STATE (or checked): ${missingFromState.join(
            ', '
          )}`
        );
      }
      if (extraInState.length > 0) {
        this.log(
          'mismatch',
          ` > Locations accessible in STATE (and unchecked) but NOT in LOG: ${extraInState.join(
            ', '
          )}`
        );
      }
      // Optionally provide more details, e.g., log the full sets
      // console.log("Log Accessible Set:", logAccessibleSet);
      // console.log("State Accessible Set (Unchecked):", stateAccessibleSet);
      throw new Error(`State mismatch during playthrough test at: ${context}`);
    }
  }

  log(type, message) {
    if (!this.logContainer) return;

    const entry = document.createElement('div');
    entry.classList.add('log-entry', `log-${type}`);
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    this.logContainer.appendChild(entry);

    // Auto-scroll to bottom
    this.logContainer.scrollTop = this.logContainer.scrollHeight;
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

  clearDisplay() {
    // Called when switching away from the 'Files' tab or 'Test Playthroughs' sub-tab
    this.clearTestState();
    // Abort any ongoing test/preparation
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    // Optionally clear the container if needed, but renderPlaythroughList handles it
    // const container = document.getElementById('test-playthroughs-panel');
    // if (container) container.innerHTML = '';
  }

  clearTestState() {
    // Reset state variables used for stepping/running a test
    this.logEvents = null;
    this.currentLogIndex = 0;
    this.rulesLoaded = false;
    this.presetInfo = null;
    this.testStateInitialized = false;
    this.currentPlaythrough = null; // Clear selected playthrough
    if (this.logContainer) {
      // Clear previous logs when resetting state or going back to list
      this.logContainer.innerHTML = '';
    }
    this.updateStepInfo(); // Clear step info display
  }
}

export default TestPlaythroughUI;
