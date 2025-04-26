import PresetUI from './presetUI.js';
import TestCaseUI from './testCaseUI.js';
import TestPlaythroughUI from './testPlaythroughUI.js';
import eventBus from '../../app/core/eventBus.js';
// Assuming stateManager is accessible or passed if needed for file loading
// import stateManager from '../../app/stateManager.js';

export default class FilesUI {
  constructor() {
    this.currentFileView = 'presets'; // Default view
    this.presetUI = new PresetUI();
    this.testCaseUI = new TestCaseUI();
    this.testPlaythroughUI = new TestPlaythroughUI();
    this.filesPanelContainer = null; // Will be set by GoldenLayout

    // Listen for loop mode changes to disable/enable file views
    eventBus.subscribe(
      'loopMode:changed',
      this.handleLoopModeChange.bind(this)
    );
  }

  /**
   * Returns the root DOM element for the files panel.
   * Called by Golden Layout to create the panel's content.
   */
  getRootElement() {
    const element = document.createElement('div');
    element.classList.add('files-panel-container', 'panel-container');
    element.style.display = 'flex';
    element.style.flexDirection = 'column';
    element.style.height = '100%';
    element.style.overflow = 'hidden'; // Prevent double scrollbars
    element.style.color = '#cecece'; // Ensure text color
    element.style.backgroundColor = '#2d2d2d'; // Ensure background

    element.innerHTML = `
      <div class="control-group file-controls" style="padding: 0.5rem; border-bottom: 1px solid #666; flex-shrink: 0; display: flex; align-items: center; gap: 1rem;">
            <label style="display: inline-flex; align-items: center;">
              <input
                type="radio"
                name="file-view-mode"
                value="presets"
                checked
                style="margin-right: 0.3em;"
              />
              Presets
            </label>
            <label style="display: inline-flex; align-items: center;">
              <input type="radio" name="file-view-mode" value="test-cases" style="margin-right: 0.3em;" />
              Test Cases
            </label>
            <label style="display: inline-flex; align-items: center;">
              <input
                type="radio"
                name="file-view-mode"
                value="test-playthroughs"
                style="margin-right: 0.3em;"
              />
              Test Playthroughs
            </label>
            <!-- Add Spacer -->
            <div style="flex-grow: 1;"></div>
            <!-- Add File Input and Button -->
            <input type="file" id="json-upload-input" accept=".json" style="display: none;" />
            <label for="json-upload-input" class="button" style="margin: 0;">Load JSON</label>
       </div>
       <div id="files-panel-content" style="flex-grow: 1; overflow-y: auto;">
          <div id="test-cases-panel" style="height: 100%; display: none;">
            <!-- Populated by testCaseUI.js -->
            <div id="test-cases-list"></div>
          </div>
          <div id="presets-panel" style="display: block; height: 100%;">
            <!-- Populated by presetUI.js -->
            <div id="presets-list"></div>
          </div>
          <div id="test-playthroughs-panel" style="display: none; height: 100%;">
            <!-- Populated by testPlaythroughUI.js -->
          </div>
       </div>
       <div class="loop-mode-files-notice" style="display: none; padding: 10px; text-align: center; color: #888; font-style: italic; flex-shrink: 0;">
         File views are disabled in Loop Mode.
       </div>
    `;
    return element;
  }

  /**
   * Called by the PanelManager wrapper after the element is created and added to the DOM.
   * Attaches event listeners and initializes the view.
   * @param {HTMLElement} containerElement - The root element returned by getRootElement().
   */
  buildInitialStructure(containerElement) {
    console.log(
      '[FilesUI] buildInitialStructure called with container:',
      containerElement
    );

    this.filesPanelContainer = containerElement; // Store the reference

    // Attach listener for file view mode change
    const fileViewRadios = this.filesPanelContainer.querySelectorAll(
      'input[name="file-view-mode"]'
    );
    console.log('[FilesUI] Found radio buttons:', fileViewRadios.length);

    fileViewRadios.forEach((radio) => {
      // Use a clean listener attachment
      radio.addEventListener('change', this._handleFileViewChange.bind(this));
    });

    // Attach listener for the JSON Upload button
    const jsonUploadInput =
      this.filesPanelContainer.querySelector('#json-upload-input');
    if (jsonUploadInput) {
      // No need to clone/replace if attaching for the first time
      jsonUploadInput.addEventListener(
        'change',
        this.handleFileUpload.bind(this)
      );
      console.log('[FilesUI] Attached listener to #json-upload-input');
    } else {
      console.warn(
        '[FilesUI] Could not find #json-upload-input to attach listener.'
      );
    }

    // Initialize all child UIs with the container
    const filesContentArea = this.filesPanelContainer.querySelector(
      '#files-panel-content'
    );
    if (filesContentArea) {
      this.presetUI.initialize(filesContentArea);
      this.testCaseUI.initialize(filesContentArea);
      this.testPlaythroughUI.initialize(filesContentArea);
      console.log(
        '[FilesUI] Initialized child UI components with content area reference'
      );
    } else {
      console.error(
        '[FilesUI] Could not find #files-panel-content to initialize child UIs'
      );
    }

    // Initial render of the default file view
    this.updateFileViewDisplay();
    console.log('[FilesUI] Initial view display updated');

    // Check initial loop mode state (in case it's already active)
    // Assuming loopUIInstance is globally accessible or we get the state differently
    if (window.loopUIInstance) {
      this.handleLoopModeChange(window.loopUIInstance.isLoopModeActive);
    }

    console.log('[FilesUI] buildInitialStructure complete');
  }

  /**
   * @param {string} mode - The new file view mode ('presets', 'test-cases', 'test-playthroughs')
   */
  setFileViewMode(mode) {
    if (mode === this.currentFileView) return; // No change

    // Publish event BEFORE updating the view mode internally
    eventBus.publish('ui:fileViewChanged', {
      newView: mode,
      oldView: this.currentFileView,
    });

    this.currentFileView = mode;
    this.updateFileViewDisplay();
  }

  updateFileViewDisplay() {
    if (!this.filesPanelContainer) {
      console.warn(
        '[FilesUI] updateFileViewDisplay: filesPanelContainer is not set'
      );
      return;
    }

    const filesContentArea = this.filesPanelContainer.querySelector(
      '#files-panel-content'
    );
    if (!filesContentArea) {
      console.warn(
        '[FilesUI] updateFileViewDisplay: files-panel-content not found'
      );
      return;
    }

    const testCasesPanel = filesContentArea.querySelector('#test-cases-panel');
    const presetsPanel = filesContentArea.querySelector('#presets-panel');
    const testPlaythroughsPanel = filesContentArea.querySelector(
      '#test-playthroughs-panel'
    );

    if (!testCasesPanel || !presetsPanel || !testPlaythroughsPanel) {
      console.warn('[FilesUI] Missing file view containers.');
      console.log('testCasesPanel:', testCasesPanel);
      console.log('presetsPanel:', presetsPanel);
      console.log('testPlaythroughsPanel:', testPlaythroughsPanel);
      return;
    }

    console.log(
      '[FilesUI] Updating display for current view:',
      this.currentFileView
    );

    // Toggle between file views
    testCasesPanel.style.display = 'none';
    presetsPanel.style.display = 'none';
    testPlaythroughsPanel.style.display = 'none';

    // Get loop mode state directly from the loopUI instance if available
    const isLoopModeActive = window.loopUIInstance?.isLoopModeActive || false;

    if (!isLoopModeActive) {
      // Show the selected panel and initialize if needed
      if (this.currentFileView === 'presets') {
        presetsPanel.style.display = 'block';
        // Use the container provided by initialize() for the component
        const presetsList = presetsPanel.querySelector('#presets-list');
        console.log('[FilesUI] Presets list element:', presetsList);

        if (!presetsList?.hasChildNodes()) {
          console.log('[FilesUI] Initializing presetUI');
          this.presetUI.initialize(presetsList);
        } else {
          console.log(
            '[FilesUI] presetsList already has child nodes, skipping initialization'
          );
        }
      } else if (this.currentFileView === 'test-cases') {
        testCasesPanel.style.display = 'block';
        // Use the container provided by initialize() for the component
        const testCasesList = testCasesPanel.querySelector('#test-cases-list');
        console.log('[FilesUI] Test cases list element:', testCasesList);

        if (!testCasesList?.hasChildNodes()) {
          console.log('[FilesUI] Initializing testCaseUI');
          this.testCaseUI.initialize(testCasesList);
        } else {
          console.log(
            '[FilesUI] testCasesList already has child nodes, skipping initialization'
          );
        }
      } else if (this.currentFileView === 'test-playthroughs') {
        testPlaythroughsPanel.style.display = 'block';
        // TestPlaythroughUI might manage its own container creation within the panel
        const playthroughList = testPlaythroughsPanel.querySelector(
          '.playthrough-list-container'
        );
        console.log('[FilesUI] Playthrough list element:', playthroughList);

        if (!playthroughList?.hasChildNodes()) {
          console.log('[FilesUI] Initializing testPlaythroughUI');
          this.testPlaythroughUI.initialize(testPlaythroughsPanel); // Pass the panel itself
        } else {
          console.log(
            '[FilesUI] playthroughList already has child nodes, skipping initialization'
          );
        }
      }
    } else {
      console.log('[FilesUI] Loop mode active, hiding file views');
    }
  }

  // Helper handler for file view change
  _handleFileViewChange(e) {
    if (e.target.checked) {
      this.setFileViewMode(e.target.value);
    }
  }

  // --- Handle JSON File Upload ---
  handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Consider where clearExistingData should be called - maybe before loading?
    // this.clearExistingData(); // Needs access to other UI elements/stateManager

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonData = JSON.parse(e.target.result);

        // Publish the raw data for the editor or other listeners
        eventBus.publish('editor:loadJsonData', {
          source: `File Upload: ${file.name}`,
          data: jsonData,
        });

        // --- Player Selection Logic (Consider abstracting or moving) ---
        // This logic seems tightly coupled with the overall game state,
        // not just the Files UI. It might be better handled by a
        // central controller that listens for the file load event.
        // For now, keep it here but acknowledge it might need relocation.

        let selectedPlayerId = null;
        const playerIds = Object.keys(jsonData.player_names || {});
        let playerIdFromFilename = null;

        const filenameMatch = file.name.match(/_P(\d+)_rules\.json$/);
        if (filenameMatch && filenameMatch[1]) {
          const potentialId = filenameMatch[1];
          if (jsonData.player_names && jsonData.player_names[potentialId]) {
            playerIdFromFilename = potentialId;
          }
        }

        if (playerIdFromFilename) {
          selectedPlayerId = playerIdFromFilename;
        } else if (playerIds.length === 0) {
          throw new Error('No players found in the JSON data.');
        } else if (playerIds.length === 1) {
          selectedPlayerId = playerIds[0];
        } else {
          const playerOptions = playerIds
            .map((id) => `${id}: ${jsonData.player_names[id]}`)
            .join('\\n');
          const choice = prompt(
            `Multiple players found. Please enter the ID of the player to load:\\n${playerOptions}`
          );
          if (choice && jsonData.player_names[choice]) {
            selectedPlayerId = choice;
          } else {
            throw new Error('Invalid player selection or prompt cancelled.');
          }
        }
        // --- End Player Selection Logic ---

        // Publish an event with the processed data and selected player
        // Let the main application logic handle state updates.
        eventBus.publish('files:jsonLoaded', {
          fileName: file.name,
          jsonData: jsonData,
          selectedPlayerId: selectedPlayerId,
        });

        // Optional: Show success in console if available
        if (window.consoleManager) {
          window.consoleManager.print(
            `Loaded ${file.name} for player ${selectedPlayerId}`,
            'success'
          );
        }
      } catch (error) {
        console.error('Error parsing JSON file:', error);
        if (window.consoleManager) {
          window.consoleManager.print(
            `Error parsing JSON file: ${error.message}`,
            'error'
          );
        }
        // Maybe publish an error event?
        eventBus.publish('files:jsonLoadError', {
          error: error,
          fileName: file.name,
        });
      }
    };
    reader.onerror = (error) => {
      console.error('Error reading file:', error);
      if (window.consoleManager) {
        window.consoleManager.print(
          `Error reading file: ${error.message}`,
          'error'
        );
      }
      eventBus.publish('files:jsonLoadError', {
        error: error,
        fileName: file.name,
      });
    };
    reader.readAsText(file);
  }

  // --- Handle Loop Mode Change ---
  handleLoopModeChange(isActive) {
    console.log(`[FilesUI] Handling loop mode change. Active: ${isActive}`);
    if (!this.filesPanelContainer) return;

    const fileViewRadios = this.filesPanelContainer.querySelectorAll(
      'input[name="file-view-mode"]'
    );
    const fileViewControls =
      this.filesPanelContainer.querySelector('.file-controls');
    const filesContent = this.filesPanelContainer.querySelector(
      '#files-panel-content'
    );
    const loopNotice = this.filesPanelContainer.querySelector(
      '.loop-mode-files-notice'
    );

    if (fileViewControls) {
      fileViewControls.style.display = isActive ? 'none' : 'flex';
    }
    if (filesContent) {
      filesContent.style.display = isActive ? 'none' : 'block';
    }
    if (loopNotice) {
      loopNotice.style.display = isActive ? 'block' : 'none';
    }

    if (fileViewRadios) {
      fileViewRadios.forEach((radio) => {
        radio.disabled = isActive;
        // Optionally visually grey them out - handled by hiding parent
        const label = radio.closest('label');
        if (label) {
          label.style.opacity = isActive ? 0.5 : 1;
          label.style.pointerEvents = isActive ? 'none' : 'auto';
        }
      });
    }

    // If exiting loop mode, ensure the correct view is displayed
    if (!isActive) {
      this.updateFileViewDisplay();
    } else {
      // Ensure all content panels are hidden when entering loop mode
      const testCasesPanel = filesContent?.querySelector('#test-cases-panel');
      const presetsPanel = filesContent?.querySelector('#presets-panel');
      const testPlaythroughsPanel = filesContent?.querySelector(
        '#test-playthroughs-panel'
      );
      if (testCasesPanel) testCasesPanel.style.display = 'none';
      if (presetsPanel) presetsPanel.style.display = 'none';
      if (testPlaythroughsPanel) testPlaythroughsPanel.style.display = 'none';
    }
  }

  // If needed, add methods to interact with the child UI components,
  // e.g., to refresh their content based on external events.
  // refreshPresets() { this.presetUI.refresh(); }
  // etc.
}
