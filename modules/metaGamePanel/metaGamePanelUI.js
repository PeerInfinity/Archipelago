import { createUniversalLogger } from '../../app/core/universalLogger.js';

export class MetaGamePanelUI {
  constructor(container, componentState, componentType) {
    this.container = container;
    this.componentState = componentState;
    this.componentType = componentType;
    this.rootElement = null;
    this.eventBus = null;
    this.metaGameAPI = null;
    this.logger = createUniversalLogger('metaGamePanel');
    
    this.currentConfiguration = '';
    this.currentJSFileContent = '';
    this.configurationDropdown = null;
    this.jsonDataTextarea = null;
    this.statusElement = null;
    
    // Available preset configurations
    this.presetConfigurations = [
      {
        name: 'Progress Bar Test',
        path: './configs/progressBarTest.js'
      }
      // Future configurations can be added here
    ];
    
    this.createUI();
    
    // Store reference to this instance on the DOM element for later access
    this.rootElement.__uiInstance = this;
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
          box-sizing: border-box;
          overflow: hidden;
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
        
        .metagame-dropdown-section {
          margin-bottom: 15px;
        }
        
        .metagame-dropdown-section label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
        }
        
        .metagame-dropdown {
          width: 80%;
          padding: 5px;
          border: 1px solid #555;
          border-radius: 3px;
          background-color: #2d2d2d;
          color: #e0e0e0;
        }
        
        .metagame-view-js-btn {
          margin-left: 10px;
          padding: 5px 15px;
          background-color: #6c757d;
          color: white;
          border: none;
          border-radius: 3px;
          cursor: pointer;
        }
        
        .metagame-view-js-btn:hover {
          background-color: #545b62;
        }
        
        .metagame-view-js-btn:disabled {
          background-color: #ccc;
          cursor: not-allowed;
        }
        
        .metagame-config-section {
          flex: 1;
          display: flex;
          flex-direction: column;
          margin-bottom: 0;
          min-height: 0;
          overflow: hidden;
        }
        
        .metagame-json-section {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
        }
        
        .metagame-json-section label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
          flex-shrink: 0;
        }
        
        .metagame-json-textarea {
          flex: 1;
          width: 100%;
          min-height: 0;
          padding: 8px;
          border: 1px solid #555;
          border-radius: 3px;
          font-family: 'Courier New', monospace;
          font-size: 12px;
          white-space: pre;
          overflow: auto;
          box-sizing: border-box;
          background-color: #1e1e1e;
          color: #e0e0e0;
          resize: none;
        }
        
        .metagame-actions {
          margin-top: 10px;
          text-align: right;
          flex-shrink: 0;
          padding-bottom: 5px;
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
        <p>Select and configure metaGame module behavior</p>
      </div>
      
      <div class="metagame-dropdown-section">
        <label for="metagame-config-dropdown">Select Configuration:</label>
        <select id="metagame-config-dropdown" class="metagame-dropdown">
          <option value="">-- Select a configuration --</option>
          ${this.presetConfigurations.map(config => 
            `<option value="${config.path}">${config.name}</option>`
          ).join('')}
        </select>
        <button class="metagame-view-js-btn" id="metagame-view-js-btn" disabled>View js file contents</button>
      </div>
      
      <div class="metagame-config-section">
        <div class="metagame-json-section">
          <label for="metagame-json-data">JSON Configuration Data (editable):</label>
          <textarea id="metagame-json-data" 
                    class="metagame-json-textarea" 
                    placeholder="Select a configuration above to load JSON data for editing..."></textarea>
        </div>
      </div>
      
      <div class="metagame-actions">
        <button class="metagame-apply-btn" id="metagame-apply-btn" disabled>Apply JSON Configuration</button>
        <button class="metagame-clear-btn" id="metagame-clear-btn">Clear</button>
      </div>
      
      <div class="metagame-status" id="metagame-status" style="display: none;"></div>
    `;
    
    // Get references to UI elements
    this.configurationDropdown = this.rootElement.querySelector('#metagame-config-dropdown');
    this.jsonDataTextarea = this.rootElement.querySelector('#metagame-json-data');
    this.statusElement = this.rootElement.querySelector('#metagame-status');
    
    // Set up event listeners
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    const viewJsBtn = this.rootElement.querySelector('#metagame-view-js-btn');
    const applyBtn = this.rootElement.querySelector('#metagame-apply-btn');
    const clearBtn = this.rootElement.querySelector('#metagame-clear-btn');
    
    // Configuration dropdown change handler
    this.configurationDropdown.addEventListener('change', () => this.handleConfigurationSelection());
    
    // Button event handlers
    viewJsBtn.addEventListener('click', () => this.handleViewJSFile());
    applyBtn.addEventListener('click', () => this.handleApplyJSONConfiguration());
    clearBtn.addEventListener('click', () => this.handleClearConfiguration());
  }
  
  async handleConfigurationSelection() {
    const selectedPath = this.configurationDropdown.value;
    
    
    if (!selectedPath) {
      // No configuration selected - reset everything
      this.currentConfiguration = '';
      this.currentJSFileContent = '';
      this.jsonDataTextarea.value = '';
      this.jsonDataTextarea.placeholder = 'Select a configuration above to load JSON data for editing...';
      
      // Disable buttons
      const viewJsBtn = this.rootElement.querySelector('#metagame-view-js-btn');
      const applyBtn = this.rootElement.querySelector('#metagame-apply-btn');
      viewJsBtn.disabled = true;
      applyBtn.disabled = true;
      
      this.hideStatus();
      return;
    }
    
    try {
      this.showStatus('Loading configuration...', 'info');
      
      if (!this.metaGameAPI) {
        throw new Error('MetaGame API not available');
      }
      
      // Load the configuration through metaGameAPI
      const result = await this.metaGameAPI.loadConfiguration(selectedPath);
      
      if (!result.success) {
        throw new Error('Failed to load configuration through metaGame API');
      }
      
      // Store the current configuration info
      this.currentConfiguration = selectedPath;
      
      // Load the JS file content for viewing
      // Convert the relative path to an absolute path from the frontend root
      const jsFilePath = selectedPath.startsWith('./configs/') 
        ? `./modules/metaGame/configs/${selectedPath.substring('./configs/'.length)}`
        : selectedPath;
      
      
      const response = await fetch(jsFilePath);
      if (!response.ok) {
        throw new Error(`Failed to fetch JS file: ${response.status} ${response.statusText}`);
      }
      this.currentJSFileContent = await response.text();
      
      // Extract and display JSON configuration data
      if (result.configuration) {
        this.jsonDataTextarea.value = JSON.stringify(result.configuration, null, 2);
        this.jsonDataTextarea.placeholder = '';
      } else {
        this.jsonDataTextarea.value = '{}';
      }
      
      // Enable buttons
      const viewJsBtn = this.rootElement.querySelector('#metagame-view-js-btn');
      const applyBtn = this.rootElement.querySelector('#metagame-apply-btn');
      viewJsBtn.disabled = false;
      applyBtn.disabled = false;
      
      this.showStatus(`Configuration loaded: ${selectedPath}`, 'success');
      
    } catch (error) {
      this.showStatus(`Failed to load configuration: ${error.message}`, 'error');
      
      // Reset on error
      this.currentConfiguration = '';
      this.currentJSFileContent = '';
      this.jsonDataTextarea.value = '';
      
      const viewJsBtn = this.rootElement.querySelector('#metagame-view-js-btn');
      const applyBtn = this.rootElement.querySelector('#metagame-apply-btn');
      viewJsBtn.disabled = true;
      applyBtn.disabled = true;
      
      this.logger.error('Failed to load configuration:', error);
    }
  }
  
  handleViewJSFile() {
    if (!this.currentJSFileContent) {
      this.showStatus('No JS file content available', 'error');
      return;
    }
    
    try {
      // Send the JS file content to the Editor panel
      if (this.eventBus) {
        this.eventBus.publish('metaGame:jsFileContent', {
          content: this.currentJSFileContent,
          filePath: this.currentConfiguration,
          activatePanel: true
        }, 'metaGamePanel');
        
        this.showStatus('JS file content sent to Editor panel', 'success');
      } else {
        throw new Error('EventBus not available');
      }
      
    } catch (error) {
      this.showStatus(`Failed to view JS file: ${error.message}`, 'error');
      
      this.logger.error('Failed to view JS file:', error);
    }
  }
  
  async handleApplyJSONConfiguration() {
    if (!this.currentConfiguration) {
      this.showStatus('No configuration loaded', 'error');
      return;
    }
    
    try {
      this.showStatus('Applying JSON configuration...', 'info');
      
      // Parse the JSON data from the textarea
      const jsonText = this.jsonDataTextarea.value.trim();
      if (!jsonText) {
        throw new Error('No JSON data to apply');
      }
      
      let jsonData;
      try {
        jsonData = JSON.parse(jsonText);
      } catch (parseError) {
        throw new Error(`Invalid JSON: ${parseError.message}`);
      }
      
      // Apply the JSON configuration to the metaGame module
      if (!this.metaGameAPI || !this.metaGameAPI.updateJSONConfiguration) {
        throw new Error('MetaGame API updateJSONConfiguration not available');
      }
      
      await this.metaGameAPI.updateJSONConfiguration(jsonData);
      
      this.showStatus('JSON configuration applied successfully!', 'success');
      
      if (this.eventBus) {
        this.eventBus.publish('metaGamePanel:jsonConfigurationApplied', {
          filePath: this.currentConfiguration,
          jsonData: jsonData
        }, 'metaGamePanel');
      }
      
    } catch (error) {
      this.showStatus(`Failed to apply JSON configuration: ${error.message}`, 'error');
      
      this.logger.error('Failed to apply JSON configuration:', error);
    }
  }
  
  handleClearConfiguration() {
    // Reset dropdown to default selection
    this.configurationDropdown.value = '';
    
    // Clear data
    this.currentConfiguration = '';
    this.currentJSFileContent = '';
    this.jsonDataTextarea.value = '';
    this.jsonDataTextarea.placeholder = 'Select a configuration above to load JSON data for editing...';
    
    // Disable buttons
    const viewJsBtn = this.rootElement.querySelector('#metagame-view-js-btn');
    const applyBtn = this.rootElement.querySelector('#metagame-apply-btn');
    viewJsBtn.disabled = true;
    applyBtn.disabled = true;
    
    this.hideStatus();
    
    this.logger.info('Configuration cleared');
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
    this.logger.debug('onMount called');
    
    // Initialize APIs when mounted
    if (this.initializeAPIs) {
      this.logger.debug('Calling initializeAPIs');
      this.initializeAPIs();
    } else {
      this.logger.debug('initializeAPIs not available');
    }
    
    this.logger.debug('APIs after onMount:', {
      metaGameAPI: !!this.metaGameAPI,
      eventBus: !!this.eventBus
    });
    
    this.logger.info('MetaGamePanel UI mounted');
  }
  
  onUnmount() {
    this.logger.info('MetaGamePanel UI unmounted');
  }
  
  // Set API references from the parent module
  setAPIs(eventBus, metaGameAPI) {
    this.eventBus = eventBus;
    this.metaGameAPI = metaGameAPI;
    
    this.logger.debug('APIs set for MetaGamePanel UI');
  }
}