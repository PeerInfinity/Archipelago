// frontend/modules/testModule/testPanelUI.js


// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('testPanelUI', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[testPanelUI] ${message}`, ...data);
  }
}

export class TestPanelUI {
  constructor(container, componentState) {
    log('info', '[TestPanelUI] Constructor called.');
    this.container = container; // Golden Layout container
    this.rootElement = document.createElement('div');
    this.rootElement.style.padding = '15px';
    this.rootElement.style.height = '100%';
    this.rootElement.style.overflow = 'auto';
    this.rootElement.innerHTML = `<h2>Test Panel Content</h2>
      <p>This panel was loaded dynamically as an external module.</p>
      <p>Module ID should be based on the path provided.</p>
      <p>Component State:</p>
      <pre>${JSON.stringify(componentState, null, 2)}</pre>`;

    // Set title for the panel tab
    this.container.setTitle('Test Module Panel');

    // Attach lifecycle listeners (optional but good practice)
    this._setupLifecycleListeners();
  }

  // Method required by PanelManager to get the root DOM element
  getRootElement() {
    log('info', '[TestPanelUI] getRootElement called.');
    return this.rootElement;
  }

  // Optional: Method called when panel is opened/shown
  initialize() {
    log('info', '[TestPanelUI] initialize (panel opened/shown).');
  }

  // Optional: Method called when panel is destroyed
  destroy() {
    log('info', '[TestPanelUI] destroy called.');
    // Cleanup logic here (e.g., remove event listeners)
  }

  _setupLifecycleListeners() {
    this.container.on('open', () => this.initialize());
    this.container.on('destroy', () => this.destroy());
    log('info', '[TestPanelUI] Lifecycle listeners set up.');
  }
}

log('info', '[TestPanelUI] testPanelUI.js loaded');
