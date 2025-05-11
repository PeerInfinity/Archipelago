import settingsManager from '../../app/core/settingsManager.js'; // <<< Import Settings Manager
import eventBus from '../../app/core/eventBus.js'; // ADDED: Import eventBus

class SettingsUI {
  constructor(container, componentState) {
    // MODIFIED: GL constructor
    console.log('SettingsUI instance created');
    this.container = container; // ADDED
    this.componentState = componentState; // ADDED

    this.rootElement = document.createElement('div');
    this.rootElement.classList.add('settings-panel-content', 'panel-container'); // Add classes for styling
    this.rootElement.style.width = '100%';
    this.rootElement.style.height = '100%';
    this.rootElement.style.overflow = 'auto'; // Ensure content can scroll if needed

    // Container for the json-editor instance
    this.editorContainer = document.createElement('div');
    this.editorContainer.style.width = '100%'; // Let the editor manage its height within
    this.editorContainer.style.minHeight = '300px'; // Example min height
    this.rootElement.appendChild(this.editorContainer);

    this.container.element.appendChild(this.rootElement); // ADDED: Append to GL container

    this.editor = null;
    this.isInitialized = false;
    this.currentSchema = null; // Store schema if needed
    this.currentData = {}; // Store data

    // Defer full initialization until app is ready
    const readyHandler = (eventPayload) => {
      console.log(
        '[SettingsUI] Received app:readyForUiDataLoad. Initializing editor.'
      );
      this.initialize(); // This will create the JSONEditor instance
      eventBus.unsubscribe('app:readyForUiDataLoad', readyHandler);
    };
    eventBus.subscribe('app:readyForUiDataLoad', readyHandler);

    this.container.on('destroy', () => {
      // ADDED: Ensure cleanup
      this.onPanelDestroy();
    });
  }

  getRootElement() {
    return this.rootElement;
  }

  initialize() {
    if (!this.isInitialized) {
      console.log('Initializing SettingsUI...');
      this.initializeEditor();
      this.isInitialized = true;
    } else {
      console.log('SettingsUI already initialized.');
      // Potentially refresh if needed when re-opened
      if (this.editor) {
        this.editor.setValue(this.currentData);
      }
    }
  }

  initializeEditor() {
    if (typeof JSONEditor === 'undefined') {
      console.error(
        'JSONEditor library not found. Ensure it is loaded globally.'
      );
      this.editorContainer.innerHTML =
        '<p style="color: red;">Error: JSONEditor library not loaded.</p>';
      return;
    }

    if (this.editor) {
      console.log(
        'Settings editor already exists. Destroying previous instance.'
      );
      this.destroyEditor();
    }

    console.log('Creating json-editor instance...');
    try {
      // Get current settings from manager
      this.currentData = settingsManager.getSettings();

      // Define a schema based on the settings structure
      // This could be generated dynamically, but hardcode for now
      this.currentSchema = {
        title: 'Application Settings',
        type: 'object',
        properties: {
          colorblindMode: {
            title: 'Colorblind Mode Toggles',
            type: 'object',
            properties: {
              regions: {
                type: 'boolean',
                title: 'Regions Panel',
                default: true,
                format: 'checkbox',
              },
              locations: {
                type: 'boolean',
                title: 'Locations Panel',
                default: true,
                format: 'checkbox',
              },
              exits: {
                type: 'boolean',
                title: 'Exits Panel',
                default: true,
                format: 'checkbox',
              },
              loops: {
                type: 'boolean',
                title: 'Loops Panel',
                default: true,
                format: 'checkbox',
              },
              pathAnalyzer: {
                title: 'Path Analyzer',
                type: 'boolean',
                format: 'checkbox',
                default: false,
              },
              // Add other areas as needed
            },
            required: [
              'regions',
              'locations',
              'exits',
              'loops',
              'pathAnalyzer',
            ],
          },
          // Add other top-level settings here
        },
        required: ['colorblindMode'],
      };

      const settings = {
        theme: 'bootstrap4',
        iconlib: 'fontawesome5',
        schema: this.currentSchema,
        startval: this.currentData,
        // Ensure keys aren't added/removed if not in schema?
        // no_additional_properties: true, // Might be too strict initially
        // remove_empty_properties: false, // Keep structure
      };

      this.editor = new JSONEditor(this.editorContainer, settings);

      this.editor.on('change', () => {
        if (this.editor) {
          try {
            const updatedValue = this.editor.getValue();
            // Update the entire settings object in the manager
            settingsManager.updateSettings(updatedValue);
            // Update local copy AFTER saving to manager
            this.currentData = settingsManager.getSettings();
          } catch (e) {
            console.error(
              'Error getting/updating value from settings editor:',
              e
            );
          }
        }
      });

      console.log('json-editor instance created successfully.');
    } catch (error) {
      console.error('Failed to initialize JSONEditor (json-editor):', error);
      this.editorContainer.innerHTML = `<p style="color: red;">Error loading Settings Editor: ${error.message}. Check console.</p>`;
      this.editor = null; // Ensure editor is null on error
    }
  }

  // Basic implementation, json-editor might resize itself
  onPanelResize(width, height) {
    console.log(`SettingsUI resized to ${width}x${height}`);
    // You might trigger a resize/refresh on the editor if needed
  }

  destroyEditor() {
    if (this.editor && typeof this.editor.destroy === 'function') {
      console.log('Destroying json-editor instance.');
      this.editor.destroy();
      this.editor = null;
    }
    // Clear the container
    while (this.editorContainer.firstChild) {
      this.editorContainer.removeChild(this.editorContainer.firstChild);
    }
  }

  onPanelDestroy() {
    console.log('SettingsUI destroyed');
    this.destroyEditor();
    this.isInitialized = false;
  }

  dispose() {
    console.log('Disposing SettingsUI...');
    this.onPanelDestroy();
  }

  // --- Methods to interact with the editor ---
  setData(newData, newSchema = null) {
    console.log('SettingsUI setData called.');
    // This method might become less relevant if editor always loads from settingsManager
    // Or could be used to force-reload from settingsManager if needed
    this.currentData = settingsManager.getSettings();
    if (this.editor) {
      console.log('Reloading settings editor data from settingsManager...');
      try {
        this.editor.setValue(this.currentData);
      } catch (e) {
        console.error('Error setting value in settings editor:', e);
      }
    } else {
      console.log('Settings editor not initialized yet. Will load on init.');
      if (this.isInitialized) {
        this.initializeEditor();
      }
    }
  }

  getData() {
    // Should probably return data from the source of truth
    return settingsManager.getSettings();
  }
}

export default SettingsUI;
