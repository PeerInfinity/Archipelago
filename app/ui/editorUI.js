import {
  createJSONEditor,
  expandAll,
} from '../../libs/vanilla-jsoneditor/standalone.js';
// Enable Dark theme CSS - REMOVED Import, will be loaded via <link> tag in HTML
// import '../../libs/vanilla-jsoneditor/themes/jse-theme-dark.css';
import eventBus from '../core/eventBus.js'; // <<< Import eventBus

class EditorUI {
  constructor() {
    console.log('EditorUI instance created');
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
  }

  getRootElement() {
    return this.rootElement;
  }

  // Called when the panel is first opened or shown
  initialize() {
    if (!this.isInitialized) {
      console.log('Initializing EditorUI...');
      this.initializeEditor();
      this.subscribeToEvents(); // Subscribe to events on first init
      this.isInitialized = true;
    } else {
      console.log('EditorUI already initialized.');
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
      console.warn(
        'EditorUI already subscribed to events. Unsubscribing previous first.'
      );
      this.unsubscribeHandle();
    }
    console.log("EditorUI subscribing to 'editor:loadJsonData'");
    this.unsubscribeHandle = eventBus.subscribe(
      'editor:loadJsonData',
      (payload) => {
        if (!payload || !payload.data) {
          console.warn(
            "EditorUI received invalid payload for 'editor:loadJsonData'",
            payload
          );
          return;
        }
        console.log(
          `EditorUI received JSON data from: ${payload.source || 'unknown'}`
        );
        // Wrap the data in the format expected by vanilla-jsoneditor's setContent
        this.setContent({ json: payload.data });
      }
    );
  }

  // Unsubscribe from EventBus events
  unsubscribeFromEvents() {
    if (this.unsubscribeHandle) {
      console.log('EditorUI unsubscribing from events.');
      this.unsubscribeHandle();
      this.unsubscribeHandle = null;
    }
  }

  initializeEditor() {
    if (this.editor) {
      console.log('Editor already exists. Destroying previous instance.');
      this.destroyEditor(); // Clean up existing editor if any
    }
    console.log('Creating vanilla-jsoneditor instance...');
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
            console.log('Editor content changed:', updatedContent);
            this.content = updatedContent;
            // You might want to dispatch an event or update state elsewhere
          },
          // Add other vanilla-jsoneditor options as needed
          // mainMenuBar: true,
          navigationBar: false, // Keep UI simple for now
          statusBar: false,
          // readOnly: false,
          mode: 'text', // Changed default mode to text
        },
      });
      console.log('vanilla-jsoneditor instance created successfully.');
    } catch (error) {
      console.error('Failed to initialize JSONEditor:', error);
      this.rootElement.textContent =
        'Error loading JSON Editor. Check console.';
    }
  }

  // Called when the panel container is resized
  onPanelResize(width, height) {
    console.log(`EditorUI resized to ${width}x${height}`);
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
      console.log('Destroying vanilla-jsoneditor instance.');
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
    console.log('EditorUI destroyed');
    this.destroyEditor();
    this.unsubscribeFromEvents(); // <<< Unsubscribe on destroy
    this.isInitialized = false;
  }

  // Optional: General cleanup method
  dispose() {
    console.log('Disposing EditorUI...');
    this.onPanelDestroy(); // Call destroy logic
    // Any other cleanup specific to EditorUI itself
  }

  // --- Example methods to interact with the editor ---
  setContent(newContent) {
    this.content = newContent;
    if (this.editor) {
      console.log('Setting editor content:', newContent);
      this.editor.set(this.content);
    } else {
      console.log(
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
