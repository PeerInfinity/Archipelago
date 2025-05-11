import eventBus from '../../app/core/eventBus.js'; // <<< Import eventBus
// REMOVED: Unnecessary import
// import { setEditorInstance } from './index.js';

class EditorUI {
  constructor(container, componentState) {
    console.log('EditorUI instance created with Textarea');
    this.container = container;
    this.componentState = componentState;

    this.rootElement = document.createElement('div');
    this.rootElement.classList.add('editor-panel-content'); // Add a class for styling if needed
    this.rootElement.style.width = '100%'; // Ensure it fills container width
    this.rootElement.style.height = '100%'; // Ensure it fills container height
    this.rootElement.style.display = 'flex'; // Use flex to make textarea fill space
    this.rootElement.style.flexDirection = 'column';

    this.textAreaElement = null; // Will hold the <textarea>
    this.isInitialized = false; // Track initialization state
    this.unsubscribeHandle = null; // Store unsubscribe function
    this._handleTextAreaInput = this._handleTextAreaInput.bind(this); // Bind listener method

    // Initial content - Storing as text now
    this.content = {
      text: '{\n  "greeting": "Hello World",\n  "value": 123\n}',
    };

    this.container.element.appendChild(this.rootElement);

    // Defer full initialization until app is ready
    const readyHandler = (eventPayload) => {
      console.log(
        '[EditorUI] Received app:readyForUiDataLoad. Initializing editor.'
      );
      this.initialize(); // This will create the textarea and subscribe to data events
      eventBus.unsubscribe('app:readyForUiDataLoad', readyHandler);
    };
    eventBus.subscribe('app:readyForUiDataLoad', readyHandler);

    this.container.on('destroy', () => {
      this.onPanelDestroy();
    });
  }

  getRootElement() {
    return this.rootElement;
  }

  // Called when the panel is first opened or shown
  initialize() {
    if (!this.isInitialized) {
      console.log('Initializing EditorUI (Textarea)...');
      this.initializeEditor();
      this.subscribeToEvents(); // Subscribe to events on first init
      this.isInitialized = true;
    } else {
      console.log('EditorUI (Textarea) already initialized.');
      // Potentially refresh or reload content if needed when re-opened
      // Ensure the textarea has the current content if the panel was hidden/reshown
      if (this.textAreaElement) {
        this.setContent(this.content);
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
      this.unsubscribeHandle = null; // Ensure it's reset
    }

    console.log("EditorUI subscribing to 'stateManager:rawJsonDataLoaded'");
    this.unsubscribeHandle = eventBus.subscribe(
      'stateManager:rawJsonDataLoaded', // <-- Subscribe to correct event
      (eventData) => {
        if (!eventData || !eventData.rawJsonData) {
          // <-- Check for rawJsonData
          console.warn(
            "EditorUI received invalid payload for 'stateManager:rawJsonDataLoaded'",
            eventData
          );
          return;
        }
        console.log(
          `EditorUI received raw rules data from: ${
            eventData.source || 'unknown'
          }`
        );
        // Pass the raw JSON object directly to loadJsonData
        this.loadJsonData(eventData.rawJsonData);
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

  // Bound method to handle textarea input events
  _handleTextAreaInput(event) {
    this.content = { text: event.target.value };
    // Optional: Dispatch an event if other modules need to know about changes immediately
    // eventBus.publish('editor:contentChanged', { text: this.content.text });
  }

  initializeEditor() {
    if (this.textAreaElement) {
      console.log('Textarea already exists. Destroying previous instance.');
      this.destroyEditor(); // Clean up existing editor if any
    }
    console.log('Creating <textarea> element...');
    try {
      this.textAreaElement = document.createElement('textarea');
      this.textAreaElement.value = this.content.text || '';
      this.textAreaElement.style.width = '100%';
      this.textAreaElement.style.height = '100%';
      this.textAreaElement.style.border = 'none'; // Optional: basic styling
      this.textAreaElement.style.resize = 'none';
      this.textAreaElement.style.flexGrow = '1'; // Make textarea fill flex container
      // --- ADDED: Dark theme colors ---
      this.textAreaElement.style.backgroundColor = '#000000'; // Black background
      this.textAreaElement.style.color = '#FFFFFF'; // White text
      // --- END ADDED ---
      // Add specific class for textarea styling if needed
      this.textAreaElement.classList.add('editor-textarea');

      // Add event listener for input changes
      this.textAreaElement.addEventListener('input', this._handleTextAreaInput);

      // Append to the root element
      this.rootElement.appendChild(this.textAreaElement);

      console.log('<textarea> element created and attached successfully.');
    } catch (error) {
      console.error('Failed to initialize Textarea:', error);
      this.rootElement.textContent = 'Error loading Textarea.';
      this.textAreaElement = null;
    }
  }

  // Called when the panel container is resized
  onPanelResize(width, height) {
    console.log(`EditorUI (Textarea) resized to ${width}x${height}`);
    // Textarea with 100% width/height and flex layout should resize automatically.
    // No specific action needed here unless manual adjustments are required.
  }

  destroyEditor() {
    if (this.textAreaElement) {
      console.log('Destroying <textarea> instance.');
      // Remove event listener
      this.textAreaElement.removeEventListener(
        'input',
        this._handleTextAreaInput
      );

      // Remove element from DOM
      if (this.textAreaElement.parentNode === this.rootElement) {
        this.rootElement.removeChild(this.textAreaElement);
      }
      this.textAreaElement = null;
    }
  }

  // Called when the panel is about to be destroyed by Golden Layout
  onPanelDestroy() {
    console.log('EditorUI (Textarea) destroyed');
    this.destroyEditor();
    this.unsubscribeFromEvents(); // <<< Unsubscribe on destroy
    this.isInitialized = false;
  }

  // Optional: General cleanup method
  dispose() {
    console.log('Disposing EditorUI (Textarea)...');
    this.onPanelDestroy(); // Call destroy logic
    // Any other cleanup specific to EditorUI itself
  }

  // Method to load JSON data into the editor (textarea)
  loadJsonData(jsonData) {
    if (jsonData === null || typeof jsonData === 'undefined') {
      console.warn(
        '[EditorUI] loadJsonData called with null or undefined data.'
      );
      // Optionally set empty content or keep existing
      this.setContent({ text: '' });
      return;
    }
    console.log('[EditorUI] Loading JSON data into textarea...');
    try {
      const textData = JSON.stringify(jsonData, null, 2); // Pretty print
      this.setContent({ text: textData });
    } catch (error) {
      console.error(
        'Error stringifying JSON data for textarea:',
        error,
        jsonData
      );
      // Fallback: Display raw data as string if stringify fails
      this.setContent({ text: String(jsonData) });
    }
  }

  // --- Methods to interact with the editor (textarea) ---
  setContent(newContent) {
    // Expect newContent in { text: "..." } or { json: ... } format
    let textToSet = '';
    if (newContent && typeof newContent.text === 'string') {
      textToSet = newContent.text;
    } else if (newContent && typeof newContent.json !== 'undefined') {
      console.log(
        '[EditorUI] Received JSON content, stringifying for textarea...'
      );
      try {
        textToSet = JSON.stringify(newContent.json, null, 2);
      } catch (error) {
        console.error(
          '[EditorUI] Error stringifying JSON in setContent:',
          error
        );
        textToSet = '[Error displaying JSON]';
      }
    } else if (newContent) {
      // Handle direct string or other types by converting
      textToSet = String(newContent);
    } else {
      console.warn(
        '[EditorUI] setContent called with invalid/empty content:',
        newContent
      );
      // Keep textToSet as '' (empty string)
    }

    this.content = { text: textToSet }; // Update internal state

    if (this.textAreaElement) {
      console.log('Setting textarea content.');
      this.textAreaElement.value = this.content.text;
    } else {
      console.log(
        'Textarea not initialized yet. Content will be set on initialization.'
      );
    }
  }

  getContent() {
    if (this.textAreaElement) {
      // Always update internal state just before returning, in case user typed
      this.content = { text: this.textAreaElement.value };
      return this.content; // Return content in the { text: "..." } format
    }
    // Return stored content if textarea isn't ready
    return this.content;
  }
}

export default EditorUI;
