import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import eventBus from '../../app/core/eventBus.js'; // ADDED: Static import
import { evaluateRule } from '../stateManager/ruleEngine.js'; // ADDED
import { createStateSnapshotInterface } from '../stateManager/stateManagerProxy.js'; // ADDED

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('testPlaythroughUI', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[testPlaythroughUI] ${message}`, ...data);
  }
}

export class TestPlaythroughUI {
  constructor(container, componentState) {
    // MODIFIED: GL constructor
    this.container = container; // ADDED
    this.componentState = componentState; // ADDED

    this.initialized = false;
    this.testPlaythroughsContainer = null;
    this.playthroughFiles = null;
    this.currentPlaythrough = null;
    this.logContainer = null;
    this.abortController = null; // To cancel ongoing tests
    this.playthroughsPanelContainer = null; // Cache container element
    this.viewChangeSubscription = null;
    this.eventBus = eventBus; // MODIFIED: Use statically imported eventBus
    this.rootElement = null; // Added

    // State for stepping through tests
    this.logEvents = null;
    this.currentLogIndex = 0;
    this.rulesLoaded = false;
    this.presetInfo = null;
    this.testStateInitialized = false;
    this.allPresetsData = null; // ADDED: To store fetched preset data

    // Create and append root element immediately
    this.getRootElement(); // This creates this.rootElement and sets this.testPlaythroughsContainer
    if (this.rootElement) {
      this.container.element.appendChild(this.rootElement);
    } else {
      log(
        'error',
        '[TestPlaythroughUI] Root element not created in constructor!'
      );
    }

    // Defer the rest of initialization
    const readyHandler = (eventPayload) => {
      log(
        'info',
        '[TestPlaythroughUI] Received app:readyForUiDataLoad. Initializing playthroughs.'
      );
      this.initialize();
      eventBus.unsubscribe('app:readyForUiDataLoad', readyHandler);
    };
    eventBus.subscribe('app:readyForUiDataLoad', readyHandler, 'testPlaythroughs');

    this.container.on('destroy', () => {
      // ADDED: Ensure cleanup
      this.dispose();
    });
  }

  getRootElement() {
    if (!this.rootElement) {
      this.rootElement = document.createElement('div');
      this.rootElement.id = 'test-playthroughs-panel';
      this.rootElement.classList.add('panel-container');
      this.rootElement.style.height = '100%';
      this.rootElement.style.overflowY = 'auto';
      // Add initial content
      this.rootElement.innerHTML = '<p>Loading playthroughs...</p>';
      // Store reference to this root element if needed internally, though
      // initialize will run after this is added to the DOM
      this.testPlaythroughsContainer = this.rootElement;
    }
    return this.rootElement;
  }

  async initialize() {
    // Ensure root element is created and reference stored
    // this.getRootElement(); // Already called in constructor

    if (!this.testPlaythroughsContainer) {
      log(
        'error',
        'Test Playthroughs panel container not found during initialization'
      );
      this.initialized = false;
      return false;
    }

    // Initialized is now set after async fetch completes
    this.initialized = false;
    this.testPlaythroughsContainer.innerHTML =
      '<p>Loading playthrough list...</p>'; // Reset content

    // --- EventBus Subscription (using statically imported eventBus) ---
    if (this.eventBus) {
      if (this.viewChangeSubscription) {
        this.viewChangeSubscription(); // This should be a function returned by eventBus.subscribe
      }
      this.viewChangeSubscription = this.eventBus.subscribe(
        'ui:fileViewChanged',
        (data) => {
          if (data.newView !== 'test-playthroughs') {
            log(
              'info',
              '[TestPlaythroughUI] View changed away, clearing display.'
            );
            this.clearDisplay();
          }
        }
      , 'testPlaythroughs');
    } else {
      log(
        'error',
        '[TestPlaythroughUI] eventBus not available for subscription.'
      );
    }
    // --- End Event Subscription ---

    try {
      const fetchPlaythroughs = fetch('./playthroughs/playthrough_files.json')
        .then((response) => {
          if (!response.ok)
            throw new Error(
              `HTTP error! status: ${response.status} fetching playthroughs`
            );
          return response.json();
        })
        .then((data) => {
          this.playthroughFiles = data;
          log(
            'info',
            '[TestPlaythroughUI] Playthrough files data loaded successfully.'
          );
          return true; // Indicate success for this fetch
        })
        .catch((error) => {
          log('error', 'Error loading playthrough_files.json:', error);
          if (this.testPlaythroughsContainer) {
            this.testPlaythroughsContainer.innerHTML = `<div class="error-message">Failed to load playthroughs: ${error.message}</div>`;
          }
          return false; // Indicate failure for this fetch
        });

      const fetchPresets = fetch('./presets/preset_files.json')
        .then((response) => {
          if (!response.ok)
            throw new Error(
              `HTTP error! status: ${response.status} fetching presets`
            );
          return response.json();
        })
        .then((data) => {
          this.allPresetsData = data;
          log('info', '[TestPlaythroughUI] Presets data loaded successfully.');
          return true; // Indicate success for this fetch
        })
        .catch((error) => {
          log('error', 'Error loading preset_files.json:', error);
          // Avoid overwriting playthrough error message if it occurred
          if (this.testPlaythroughsContainer && !this.playthroughFiles) {
            this.testPlaythroughsContainer.innerHTML = `<div class="error-message">Failed to load preset data: ${error.message}</div>`;
          }
          return false; // Indicate failure for this fetch
        });

      Promise.all([fetchPlaythroughs, fetchPresets]).then(
        ([playthroughsSuccess, presetsSuccess]) => {
          if (playthroughsSuccess && presetsSuccess) {
            this.initialized = true;
            this.renderPlaythroughList(); // Render list now that data is available
            log(
              'info',
              '[TestPlaythroughUI] Initialized successfully (playthroughs and presets).'
            );
          } else {
            this.initialized = false;
            log(
              'warn',
              '[TestPlaythroughUI] Initialization failed. Playthroughs loaded: ${playthroughsSuccess}, Presets loaded: ${presetsSuccess}.'
            );
            // Error messages are already shown by individual catches
            if (
              !this.testPlaythroughsContainer.querySelector('.error-message')
            ) {
              this.testPlaythroughsContainer.innerHTML =
                '<div class="error-message">Initialization failed. Check console for details.</div>'; // Generic fallback
            }
          }
        }
      );

      return true; // Indicate setup process has started
    } catch (error) {
      log('error', 'Error setting up playthrough files loading:', error);
      if (this.testPlaythroughsContainer) {
        this.testPlaythroughsContainer.innerHTML = `<div class="error-message">Error initializing playthroughs: ${error.message}</div>`;
      }
      this.initialized = false;
      return false;
    }
  }

  renderPlaythroughList() {
    // const container = document.getElementById('test-playthroughs-panel');
    const container = this.testPlaythroughsContainer;
    if (!container) return;

    // Clear previous state when returning to list
    this.clearTestState();

    let html = `
      <div class="playthrough-header">
        <h3>Select a Playthrough to Test</h3>
      </div>
      <div class="playthrough-list-container">
    `;

    // Add null check
    if (!this.playthroughFiles) {
      html += '<p>Loading playthrough list...</p>';
      log(
        'warn',
        'renderPlaythroughList called before playthroughFiles data was loaded.'
      );
    } else if (this.playthroughFiles.length === 0) {
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
    // const container = document.getElementById('test-playthroughs-panel');
    const container = this.testPlaythroughsContainer;
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
        log('error', 'Playthrough Test Prep Error:', error);
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
        log(
          'error',
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
        log(
          'error',
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
        // The worker should compute this after rules are loaded via loadRules command,
        // and the state will be available via snapshot for compareAccessibleLocations.
        await this.compareAccessibleLocations(
          event.accessible_locations,
          'Initial State'
        );
        break;

      case 'checked_location':
        if (event.location && event.location.name) {
          const locName = event.location.name;
          this.log('info', `Simulating check for location: "${locName}"`);

          // Get static data once to find the location details
          const staticData = stateManager.getStaticData();
          const locDef = staticData?.locations?.[locName];

          if (!locDef) {
            this.log(
              'error',
              `Location "${locName}" from log not found in current static data. Skipping check.`
            );
          } else {
            const currentSnapshot = await stateManager.getLatestStateSnapshot(); // Get current dynamic state
            if (!currentSnapshot) {
              this.log(
                'error',
                `Could not get snapshot to check accessibility for "${locName}"`
              );
              throw new Error(`Snapshot unavailable for ${locName} check`);
            }
            const snapshotInterface = createStateSnapshotInterface(
              currentSnapshot,
              staticData
            );
            if (!snapshotInterface) {
              this.log(
                'error',
                `Could not create snapshotInterface for "${locName}"`
              );
              throw new Error(
                `SnapshotInterface creation failed for ${locName} check`
              );
            }

            // Evaluate accessibility for locName
            const parentRegionName = locDef.parent_region || locDef.region;
            const parentRegionReachabilityStatus =
              currentSnapshot.regionReachability?.[parentRegionName];
            const isParentRegionEffectivelyReachable =
              parentRegionReachabilityStatus === 'reachable' ||
              parentRegionReachabilityStatus === 'checked';

            const locationAccessRule = locDef.access_rule;
            let locationRuleEvalResult = true;
            if (locationAccessRule) {
              locationRuleEvalResult = evaluateRule(
                locationAccessRule,
                snapshotInterface
              );
            }
            const wasAccessible =
              isParentRegionEffectivelyReachable &&
              locationRuleEvalResult === true;

            // Check if already checked using the snapshot
            const isChecked = currentSnapshot.checkedLocations?.includes(locName);

            if (!wasAccessible && !isChecked) {
              this.log(
                'error',
                `Log indicates checking "${locName}", but it was NOT accessible according to current logic!`
              );
              throw new Error(
                `Attempted to check inaccessible location: "${locName}"`
              );
            }

            // Check if location contains an item and add it
            // The item an item is at a location is part of static data, not dynamic state.
            const itemAtLocation = locDef.item; // Assuming item name is directly on locDef.item or locDef.item.name
            const itemName =
              typeof itemAtLocation === 'object'
                ? itemAtLocation.name
                : itemAtLocation;

            if (itemName && !isChecked) {
              this.log(
                'info',
                `Found item "${itemName}" at "${locName}". Adding to inventory.`
              );
              // addItemToInventory is an async command now
              await stateManager.addItemToInventory(itemName);
              // No direct boolean return to check; assume success or rely on stateManager:stateChanged event if needed for confirmation
              this.log(
                'info',
                `Item "${itemName}" sent to be added to inventory.`
              );
            }

            // Mark location as checked (async command)
            await stateManager.checkLocation(locName);
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
        await this.compareAccessibleLocations(
          event.accessible_locations,
          `State after event ${this.currentLogIndex + 1}`
        );
        break;

      default:
        this.log('info', `Skipping unhandled event type: ${event.event}`);
        break;
    }
  }

  findPresetForPlaythrough(playthroughInfo) {
    if (!this.allPresetsData) {
      this.log(
        'error',
        'Preset data (this.allPresetsData) not loaded. Ensure initialize ran successfully.'
      );
      return null;
    }

    const presetsData = this.allPresetsData; // Use the fetched data
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
    if (signal.aborted) {
      this.log('info', 'Rules loading aborted by signal early.');
      return false;
    }

    if (!this.allPresetsData) {
      this.log(
        'error',
        'Preset data (this.allPresetsData) not loaded. Cannot load rules.'
      );
      return false;
    }

    const presetsData = this.allPresetsData;
    const folderData = presetsData[gameId]?.folders?.[folderId];
    if (!folderData) {
      this.log(
        'error',
        `Preset folder data not found for gameId: ${gameId}, folderId: ${folderId}`
      );
      return false;
    }

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
      rulesFile = folderData.files.find((file) => file.endsWith('_rules.json'));
    }

    if (!rulesFile) {
      this.log(
        'error',
        `Could not find a suitable rules file in preset folder ${folderId}`
      );
      return false;
    }

    const filePath = `./presets/${gameId}/${folderId}/${rulesFile}`;
    this.log('info', `Fetching rules: ${filePath}`);

    try {
      const response = await fetch(filePath);
      if (signal.aborted) {
        this.log('info', 'Rules loading aborted by signal during fetch.');
        return false;
      }
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const rulesJsonData = await response.json();

      if (signal.aborted) {
        this.log('info', 'Rules loading aborted by signal after fetch.');
        return false;
      }

      // COMMAND: Send these specific rules to the worker
      // Ensure playerId is a string, and provide a playerName if available/needed by your stateManager.loadRules
      const effectivePlayerId = playerId ? String(playerId) : '1'; // Default to '1' if not provided
      const playerName =
        this.currentPlaythrough?.player_name || `Player${effectivePlayerId}`; // Get from playthrough or generate

      await stateManager.loadRules(rulesJsonData, {
        playerId: effectivePlayerId,
        playerName: playerName,
      });

      // Wait for worker to confirm rules are loaded and processed
      let unsub; // MODIFIED: Declare unsub outside the Promise executor
      const rulesLoadedConfirmation = await new Promise((resolve, reject) => {
        const timeoutDuration = 10000; // 10 seconds timeout for rules loading
        const timeoutId = setTimeout(() => {
          if (unsub) unsub(); // MODIFIED: Check if unsub is defined before calling
          this.log(
            'error',
            'Timeout waiting for StateManager worker to confirm preset rules loaded.'
          );
          reject(
            new Error(
              'Timeout waiting for StateManager worker to confirm preset rules loaded.'
            )
          );
        }, timeoutDuration);

        unsub = this.eventBus.subscribe(
          'stateManager:rulesLoaded',
          (eventPayload) => {
            clearTimeout(timeoutId);
            this.log(
              'info',
              `StateManager worker confirmed preset rules loaded for player ${effectivePlayerId}.`
            );
            unsub();
            resolve(true);
          }
        , 'testPlaythroughs');
      });

      if (!rulesLoadedConfirmation) {
        this.log(
          'error',
          'Failed to get confirmation for preset rules loading from worker.'
        );
        return false;
      }

      this.log(
        'info',
        `Preset rules for player ${effectivePlayerId} loaded into StateManager worker successfully.`
      );
      return true;
    } catch (error) {
      if (error.name === 'AbortError' || signal.aborted) {
        this.log('info', 'Rules loading aborted by error or signal.');
      } else {
        this.log(
          'error',
          `Failed to load or process rules file ${filePath}: ${error.message}`
        );
      }
      return false;
    }
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

  async compareAccessibleLocations(logAccessible, context) {
    const snapshot = await stateManager.getLatestStateSnapshot();
    const staticData = stateManager.getStaticData(); // ADDED: Get static data

    this.log('info', `[compareAccessibleLocations] Context: '${context}'`, {
      snapshot,
      staticData,
    });

    if (!snapshot) {
      this.log(
        'error',
        `[compareAccessibleLocations] Snapshot is null/undefined for context: ${context}`
      );
      throw new Error(
        `Snapshot invalid (null) during playthrough test at: ${context}`
      );
    }
    if (!staticData || !staticData.locations) {
      this.log(
        'error',
        `[compareAccessibleLocations] Static data or staticData.locations is null/undefined for context: ${context}`,
        { staticData }
      );
      throw new Error(
        `Static data invalid during playthrough test at: ${context}`
      );
    }
    // Snapshot itself does not directly contain all location definitions;
    // staticData.locations contains the definitions, snapshot contains dynamic state (flags, reachability).

    const stateAccessibleUnchecked = [];
    const snapshotInterface = createStateSnapshotInterface(
      snapshot,
      staticData
    ); // ADDED for rule evaluation

    if (!snapshotInterface) {
      this.log(
        'error',
        `[compareAccessibleLocations] Failed to create snapshotInterface for context: ${context}`
      );
      throw new Error(`SnapshotInterface creation failed at: ${context}`);
    }

    for (const locName in staticData.locations) {
      const locDef = staticData.locations[locName]; // Location Definition from staticData

      const isChecked = snapshot.checkedLocations?.includes(locName);
      if (isChecked) continue; // Skip checked locations

      // Determine accessibility based on snapshot and staticDef
      const parentRegionName = locDef.parent_region || locDef.region;
      const parentRegionReachabilityStatus =
        snapshot.regionReachability?.[parentRegionName];
      const isParentRegionEffectivelyReachable =
        parentRegionReachabilityStatus === 'reachable' ||
        parentRegionReachabilityStatus === 'checked';

      const locationAccessRule = locDef.access_rule;
      let locationRuleEvalResult = true; // Default to true if no rule
      if (locationAccessRule) {
        locationRuleEvalResult = evaluateRule(
          locationAccessRule,
          snapshotInterface
        );
      }
      const doesLocationRuleEffectivelyPass = locationRuleEvalResult === true;

      if (
        isParentRegionEffectivelyReachable &&
        doesLocationRuleEffectivelyPass
      ) {
        stateAccessibleUnchecked.push(locName);
      }
    }

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
      // log('info', "Log Accessible Set:", logAccessibleSet);
      // log('info', "State Accessible Set (Unchecked):", stateAccessibleSet);
      throw new Error(`State mismatch during playthrough test at: ${context}`);
    }
  }

  log(type, message, ...additionalData) {
    // Log to panel
    if (this.logContainer) {
      const entry = document.createElement('div');
      entry.classList.add('log-entry', `log-${type}`);
      const textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
      entry.textContent = textContent;
      // Consider if additionalData should be stringified or handled for panel display
      this.logContainer.appendChild(entry);
      this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }

    // Log to browser console (or global logger)
    // Map custom types to console methods if needed, e.g., 'step' or 'mismatch'
    let consoleMethodType = type;
    if (type === 'step' || type === 'mismatch' || type === 'state') {
      consoleMethodType = 'info'; // Or 'debug' or a specific style
    } else if (type === 'success') {
      consoleMethodType = 'info';
    }
    // Ensure type is a valid console method, defaulting to 'log'
    if (
      !['error', 'warn', 'info', 'debug', 'log'].includes(consoleMethodType)
    ) {
      consoleMethodType = 'log';
    }
    const consoleMethod = console[consoleMethodType] || console.log;
    consoleMethod(
      `[TestPlaythroughUI - ${type.toUpperCase()}] ${message}`,
      ...additionalData
    );
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

  dispose() {
    log('info', '[TestPlaythroughUI] Disposing...');
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    // Unsubscribe if the handle exists
    if (this.viewChangeSubscription) {
      this.viewChangeSubscription();
      this.viewChangeSubscription = null;
      log('info', '[TestPlaythroughUI] Unsubscribed from ui:fileViewChanged.');
    }
    this.clearTestState();
    this.updateStepInfo(); // Clear step info display
  }
}

// Add default export
export default TestPlaythroughUI;
