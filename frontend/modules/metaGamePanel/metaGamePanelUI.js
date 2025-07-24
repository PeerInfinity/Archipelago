export class MetaGamePanelUI {
  constructor(container, componentState, componentType) {
    this.container = container;
    this.componentState = componentState;
    this.componentType = componentType;
    this.rootElement = null;
    this.eventBus = null;
    this.logger = null;
    this.metaGameAPI = null;
    
    this.currentConfiguration = '';
    this.filePathInput = null;
    this.configurationTextarea = null;
    this.statusElement = null;
    
    this.createUI();
  }
  
  createUI() {
    this.rootElement = document.createElement('div');
    this.rootElement.className = 'metagame-panel';
    
    // Add CSS styles
    const styles = `
      <style>
        .metagame-panel {
          padding: 10px;
          height: 100%;
          display: flex;
          flex-direction: column;
          font-family: Arial, sans-serif;
        }
        
        .metagame-header {
          margin-bottom: 10px;
          padding-bottom: 10px;
          border-bottom: 1px solid #ccc;
        }
        
        .metagame-header h3 {
          margin: 0 0 10px 0;
          color: #333;
        }
        
        .metagame-file-section {
          margin-bottom: 15px;
        }
        
        .metagame-file-section label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
        }
        
        .metagame-file-input {
          width: 70%;
          padding: 5px;
          border: 1px solid #ccc;
          border-radius: 3px;
        }
        
        .metagame-load-btn {
          margin-left: 10px;
          padding: 5px 15px;
          background-color: #007cba;
          color: white;
          border: none;
          border-radius: 3px;
          cursor: pointer;
        }
        
        .metagame-load-btn:hover {
          background-color: #005a87;
        }
        
        .metagame-load-btn:disabled {
          background-color: #ccc;
          cursor: not-allowed;
        }
        
        .metagame-config-section {
          flex: 1;
          display: flex;
          flex-direction: column;
          margin-bottom: 15px;
        }
        
        .metagame-config-section label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
        }
        
        .metagame-config-textarea {
          flex: 1;
          min-height: 200px;
          padding: 8px;
          border: 1px solid #ccc;
          border-radius: 3px;
          font-family: 'Courier New', monospace;
          font-size: 12px;
          white-space: pre;
          overflow: auto;
        }
        
        .metagame-actions {
          margin-top: 10px;
          text-align: right;
        }
        
        .metagame-apply-btn {
          padding: 8px 20px;
          background-color: #28a745;
          color: white;
          border: none;
          border-radius: 3px;
          cursor: pointer;
          margin-right: 10px;
        }
        
        .metagame-apply-btn:hover {
          background-color: #218838;
        }
        
        .metagame-apply-btn:disabled {
          background-color: #ccc;
          cursor: not-allowed;
        }
        
        .metagame-clear-btn {
          padding: 8px 20px;
          background-color: #dc3545;
          color: white;
          border: none;
          border-radius: 3px;
          cursor: pointer;
        }
        
        .metagame-clear-btn:hover {
          background-color: #c82333;
        }
        
        .metagame-status {
          margin-top: 10px;
          padding: 8px;
          border-radius: 3px;
          font-size: 12px;
        }
        
        .metagame-status.success {
          background-color: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }
        
        .metagame-status.error {
          background-color: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }
        
        .metagame-status.info {
          background-color: #d1ecf1;
          color: #0c5460;
          border: 1px solid #bee5eb;
        }
      </style>
    `;
    
    this.rootElement.innerHTML = styles + `
      <div class="metagame-header">
        <h3>MetaGame Configuration</h3>
        <p>Load and configure metaGame module behavior</p>
      </div>
      
      <div class="metagame-file-section">
        <label for="metagame-file-path">Configuration File Path:</label>
        <input type="text" 
               id="metagame-file-path" 
               class="metagame-file-input" 
               placeholder="./progressBarTest.js"
               value="">
        <button class="metagame-load-btn" id="metagame-load-btn">Load</button>
      </div>
      
      <div class="metagame-config-section">
        <label for="metagame-config">Configuration (Read-only after loading):</label>
        <textarea id="metagame-config" 
                  class="metagame-config-textarea" 
                  placeholder="Configuration will appear here after loading a file..."
                  readonly></textarea>
      </div>
      
      <div class="metagame-actions">
        <button class="metagame-apply-btn" id="metagame-apply-btn" disabled>Apply Configuration</button>
        <button class="metagame-clear-btn" id="metagame-clear-btn">Clear</button>
      </div>
      
      <div class="metagame-status" id="metagame-status" style="display: none;"></div>
    `;
    
    // Get references to UI elements
    this.filePathInput = this.rootElement.querySelector('#metagame-file-path');
    this.configurationTextarea = this.rootElement.querySelector('#metagame-config');
    this.statusElement = this.rootElement.querySelector('#metagame-status');
    
    // Set up event listeners
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    const loadBtn = this.rootElement.querySelector('#metagame-load-btn');
    const applyBtn = this.rootElement.querySelector('#metagame-apply-btn');
    const clearBtn = this.rootElement.querySelector('#metagame-clear-btn');
    
    loadBtn.addEventListener('click', () => this.handleLoadFile());
    applyBtn.addEventListener('click', () => this.handleApplyConfiguration());
    clearBtn.addEventListener('click', () => this.handleClearConfiguration());
    
    // Allow Enter key in file path input to trigger load
    this.filePathInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.handleLoadFile();
      }
    });
  }
  
  async handleLoadFile() {
    const filePath = this.filePathInput.value.trim();
    if (!filePath) {
      this.showStatus('Please enter a file path', 'error');
      return;
    }
    
    try {
      this.showStatus('Loading configuration file...', 'info');
      
      // Load the file to preview its content
      const response = await fetch(filePath);
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
      }
      
      const fileContent = await response.text();
      this.configurationTextarea.value = fileContent;
      this.currentConfiguration = filePath;
      
      // Enable the apply button
      const applyBtn = this.rootElement.querySelector('#metagame-apply-btn');
      applyBtn.disabled = false;
      
      this.showStatus(`Configuration loaded from: ${filePath}`, 'success');
      
    } catch (error) {
      this.showStatus(`Failed to load configuration: ${error.message}`, 'error');
      if (this.logger) {
        this.logger.error('metaGamePanel', 'Failed to load configuration file:', error);
      }
    }
  }
  
  async handleApplyConfiguration() {
    if (!this.currentConfiguration) {
      this.showStatus('No configuration loaded', 'error');
      return;
    }
    
    try {
      this.showStatus('Applying configuration...', 'info');
      
      if (!this.metaGameAPI) {
        throw new Error('MetaGame API not available');
      }
      
      // Apply the configuration through the metaGame module
      const result = await this.metaGameAPI.loadConfiguration(this.currentConfiguration);
      
      if (result.success) {
        this.showStatus('Configuration applied successfully!', 'success');
        
        if (this.eventBus) {
          this.eventBus.publish('metaGamePanel:configurationApplied', {
            filePath: this.currentConfiguration,
            configuration: result.configuration
          }, 'metaGamePanel');
        }
      } else {
        throw new Error('Configuration application failed');
      }
      
    } catch (error) {
      this.showStatus(`Failed to apply configuration: ${error.message}`, 'error');
      
      if (this.logger) {
        this.logger.error('metaGamePanel', 'Failed to apply configuration:', error);
      }
      
      if (this.eventBus) {
        this.eventBus.publish('metaGamePanel:error', {
          error: error.message,
          action: 'applyConfiguration'
        }, 'metaGamePanel');
      }
    }
  }
  
  handleClearConfiguration() {
    this.filePathInput.value = '';
    this.configurationTextarea.value = '';
    this.currentConfiguration = '';
    
    const applyBtn = this.rootElement.querySelector('#metagame-apply-btn');
    applyBtn.disabled = true;
    
    this.hideStatus();
    
    if (this.logger) {
      this.logger.info('metaGamePanel', 'Configuration cleared');
    }
  }
  
  showStatus(message, type) {
    this.statusElement.textContent = message;
    this.statusElement.className = `metagame-status ${type}`;
    this.statusElement.style.display = 'block';
    
    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
      setTimeout(() => {
        this.hideStatus();
      }, 5000);
    }
  }
  
  hideStatus() {
    this.statusElement.style.display = 'none';
  }
  
  getRootElement() {
    return this.rootElement;
  }
  
  onMount(container, componentState) {
    // Initialize APIs when mounted
    if (this.initializeAPIs) {
      this.initializeAPIs();
    }
    
    if (this.logger) {
      this.logger.info('metaGamePanel', 'MetaGamePanel UI mounted');
    }
  }
  
  onUnmount() {
    if (this.logger) {
      this.logger.info('metaGamePanel', 'MetaGamePanel UI unmounted');
    }
  }
  
  // Set API references from the parent module
  setAPIs(eventBus, logger, metaGameAPI) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.metaGameAPI = metaGameAPI;
    
    if (this.logger) {
      this.logger.debug('metaGamePanel', 'APIs set for MetaGamePanel UI');
    }
  }
}