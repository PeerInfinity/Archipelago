import {
  createJSONEditor,
  expandAll,
} from '../../libs/vanilla-jsoneditor/standalone.js';
// Enable Dark theme CSS - REMOVED Import, will be loaded via <link> tag in HTML
// import '../../libs/vanilla-jsoneditor/themes/jse-theme-dark.css';
import eventBus from '../../app/core/eventBus.js'; // <<< Import eventBus
// REMOVE Import the function to get pending data
// import { getPendingJsonDataAndClear } from './index.js';
// Import the function to set the module instance
import { setEditorInstance } from './index.js';


// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('vanillaJsonEditorUI', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[vanillaJsonEditorUI] ${message}`, ...data);
  }
}

class EditorUI {
  constructor() {
    log('info', 'EditorUI instance created');
    this.rootElement = document.createElement('div');
    this.rootElement.classList.add('editor-panel-content'); // Add a class for styling if needed
    this.rootElement.classList.add('jse-theme-dark');
    this.rootElement.style.width = '100%'; // Ensure it fills container width
    this.rootElement.style.height = '100%'; // Ensure it fills container height
    this.editor = null;
    this.isInitialized = false; // Track initialization state
    this.unsubscribeHandle = null; // Store unsubscribe function

    // Initial content (can be updated later)
    this.content = {
      json: {
        greeting: 'Hello World',
        value: 123,
      },
      text: undefined,
    };

    // Register this instance with the module logic
    setEditorInstance(this);
  }

  getRootElement() {
    return this.rootElement;
  }

  // Called when the panel is first opened or shown
  initialize() {
    if (!this.isInitialized) {
      log('info', 'Initializing EditorUI...');
      this.initializeEditor();
      this.subscribeToEvents(); // Subscribe to events on first init
      this.isInitialized = true;

      // REMOVE Check for and load pending data received before initialization
      /*
      const pendingData = getPendingJsonDataAndClear();
      if (pendingData) {
        log('info', '[EditorUI] Loading pending JSON data received before init...');
        this.loadJsonData(pendingData);
      }
      */
    } else {
      log('info', 'EditorUI already initialized.');
      // Potentially refresh or reload content if needed when re-opened
      if (this.editor) {
        this.editor.set(this.content);
        this.editor.expand((path) => true); // Expand all nodes
      }
    }
  }

  // Subscribe to relevant EventBus events
  subscribeToEvents() {
    if (this.unsubscribeHandle) {
      log('warn', 
        'EditorUI already subscribed to events. Unsubscribing previous first.'
      );
      this.unsubscribeHandle();
    }
    log('info', "EditorUI subscribing to 'editor:loadJsonData'");
    this.unsubscribeHandle = eventBus.subscribe(
      'editor:loadJsonData',
      (payload) => {
        if (!payload || !payload.data) {
          log('warn', 
            "EditorUI received invalid payload for 'editor:loadJsonData'",
            payload
          );
          return;
        }
        log('info', 
          `EditorUI received JSON data from: ${payload.source || 'unknown'}`
        );
        // Wrap the data in the format expected by vanilla-jsoneditor's setContent
        this.setContent({ json: payload.data });
      }
    , 'editor');
  }

  // Unsubscribe from EventBus events
  unsubscribeFromEvents() {
    if (this.unsubscribeHandle) {
      log('info', 'EditorUI unsubscribing from events.');
      this.unsubscribeHandle();
      this.unsubscribeHandle = null;
    }
  }

  initializeEditor() {
    if (this.editor) {
      log('info', 'Editor already exists. Destroying previous instance.');
      this.destroyEditor(); // Clean up existing editor if any
    }
    log('info', 'Creating vanilla-jsoneditor instance...');
    try {
      this.editor = createJSONEditor({
        target: this.rootElement,
        props: {
          content: this.content,
          onChange: (
            updatedContent,
            previousContent,
            { contentErrors, patchResult }
          ) => {
            // Handle content changes
            log('info', 'Editor content changed:', updatedContent);
            this.content = updatedContent;
            // You might want to dispatch an event or update state elsewhere
          },
          // Add other vanilla-jsoneditor options as needed
          // mainMenuBar: true,
          navigationBar: false, // Keep UI simple for now
          statusBar: false,
          // readOnly: false,
          mode: 'text', // Changed back to text mode
        },
      });
      log('info', 'vanilla-jsoneditor instance created successfully.');
    } catch (error) {
      log('error', 'Failed to initialize JSONEditor:', error);
      this.rootElement.textContent =
        'Error loading JSON Editor. Check console.';
    }
  }

  // Called when the panel container is resized
  onPanelResize(width, height) {
    log('info', `EditorUI resized to ${width}x${height}`);
    // vanilla-jsoneditor might handle resize automatically, but
    // you can add manual resize logic here if needed.
    // this.rootElement.style.width = `${width}px`;
    // this.rootElement.style.height = `${height}px`;
    // if (this.editor && typeof this.editor.refresh === 'function') {
    //     this.editor.refresh(); // Or other resize methods if available
    // }
  }

  destroyEditor() {
    if (this.editor && typeof this.editor.destroy === 'function') {
      log('info', 'Destroying vanilla-jsoneditor instance.');
      this.editor.destroy();
      this.editor = null;
    }
    // Clear the container
    while (this.rootElement.firstChild) {
      this.rootElement.removeChild(this.rootElement.firstChild);
    }
  }

  // Called when the panel is about to be destroyed by Golden Layout
  onPanelDestroy() {
    log('info', 'EditorUI destroyed');
    this.destroyEditor();
    this.unsubscribeFromEvents(); // <<< Unsubscribe on destroy
    this.isInitialized = false;
  }

  // Optional: General cleanup method
  dispose() {
    log('info', 'Disposing EditorUI...');
    this.onPanelDestroy(); // Call destroy logic
    // Any other cleanup specific to EditorUI itself
  }

  // Method to load JSON data into the editor
  loadJsonData(jsonData) {
    if (!jsonData) {
      log('warn', 
        '[EditorUI] loadJsonData called with null or undefined data.'
      );
      return;
    }
    log('info', '[EditorUI] Loading JSON data into editor...');
    this.setContent({ json: jsonData });
    // Optionally expand nodes after setting content - REMOVED for text mode
    // if (this.editor) {
    //   this.editor.expand((path) => true);
    // }
  }

  // --- Example methods to interact with the editor ---
  setContent(newContent) {
    this.content = newContent;
    if (this.editor) {
      log('info', 'Setting editor content:', newContent);
      this.editor.set(this.content);
    } else {
      log('info', 
        'Editor not initialized yet. Content will be set on initialization.'
      );
    }
  }

  getContent() {
    if (this.editor) {
      return this.editor.get();
    }
    return this.content; // Return stored content if editor isn't ready
  }
}

export default EditorUI;
