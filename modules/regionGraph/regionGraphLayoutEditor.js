import { createUniversalLogger } from '../../app/core/universalLogger.js';

const logger = createUniversalLogger('regionGraph');

export class RegionGraphLayoutEditor {
  constructor(cy, controlPanel) {
    this.cy = cy;
    this.controlPanel = controlPanel;
    this.isLayoutRunning = false;
    this.currentLayout = null;
    
    this.layoutPresets = {
      'fcose-default': {
        name: 'fcose',
        quality: 'proof',
        randomize: false,
        animate: true,
        animationDuration: 1000,
        fit: true,
        padding: 70,
        nodeDimensionsIncludeLabels: true,
        nodeRepulsion: 15000,
        idealEdgeLength: 150,
        edgeElasticity: 0.45,
        gravity: 0.25,
        numIter: 2500
      },
      'fcose-hub': {
        name: 'fcose',
        quality: 'proof',
        randomize: false,
        animate: true,
        animationDuration: 1000,
        fit: true,
        padding: 100,
        nodeDimensionsIncludeLabels: true,
        nodeRepulsion: 35000,
        idealEdgeLength: 250,
        edgeElasticity: 0.1,
        gravity: 0.15,
        numIter: 3000
      },
      'hierarchical': {
        name: 'breadthfirst',
        directed: false,
        padding: 50,
        spacingFactor: 1.5,
        avoidOverlap: true,
        nodeDimensionsIncludeLabels: true,
        animate: true,
        animationDuration: 1000,
        maximal: false,
        grid: false,
        circle: false
      },
      'concentric': {
        name: 'concentric',
        fit: true,
        padding: 50,
        animate: true,
        animationDuration: 1000,
        avoidOverlap: true,
        nodeDimensionsIncludeLabels: true,
        spacingFactor: 1.5,
        startAngle: 3 * Math.PI / 2,
        sweep: 2 * Math.PI,
        clockwise: true,
        equidistant: false
      },
      'circle': {
        name: 'circle',
        fit: true,
        padding: 50,
        animate: true,
        animationDuration: 1000,
        avoidOverlap: true,
        nodeDimensionsIncludeLabels: true,
        spacingFactor: 1.2,
        radius: null,
        startAngle: 3 * Math.PI / 2,
        sweep: undefined,
        clockwise: true
      },
      'cose': {
        name: 'cose',
        randomize: false,
        animate: true,
        animationDuration: 1000,
        fit: true,
        padding: 50,
        nodeRepulsion: 400000,
        nodeOverlap: 10,
        idealEdgeLength: 100,
        edgeElasticity: 100,
        nestingFactor: 5,
        gravity: 80,
        numIter: 1000,
        componentSpacing: 100
      },
      'grid': {
        name: 'grid',
        fit: true,
        padding: 50,
        animate: true,
        animationDuration: 1000,
        avoidOverlap: true,
        nodeDimensionsIncludeLabels: true,
        spacingFactor: 1.5,
        condense: false,
        rows: undefined,
        cols: undefined
      },
      'hierarchical-auto': {
        name: 'breadthfirst',
        directed: false,
        padding: 50,
        spacingFactor: 1.5,
        avoidOverlap: true,
        nodeDimensionsIncludeLabels: true,
        animate: true,
        animationDuration: 1000,
        maximal: false,
        grid: false,
        circle: false,
        roots: null // Will be determined dynamically
      },
      'concentric-hub': {
        name: 'concentric',
        fit: true,
        padding: 50,
        animate: true,
        animationDuration: 1000,
        avoidOverlap: true,
        nodeDimensionsIncludeLabels: true,
        spacingFactor: 2,
        startAngle: 3 * Math.PI / 2,
        sweep: 2 * Math.PI,
        clockwise: true,
        equidistant: false,
        concentric: null // Will be set dynamically based on hub detection
      }
    };
  }

  createEditorHTML() {
    return `
      <style>
        .region-graph-layout-editor button {
          margin: 2px;
          padding: 4px 8px;
          background: #444;
          color: #fff;
          border: 1px solid #666;
          border-radius: 3px;
          cursor: pointer;
          font-size: 11px;
        }
        .region-graph-layout-editor button:hover {
          background: #555;
        }
        .region-graph-layout-editor select {
          margin: 2px;
          padding: 4px;
          background: #444;
          color: #fff;
          border: 1px solid #666;
          border-radius: 3px;
          font-size: 11px;
        }
        .region-graph-layout-editor textarea {
          width: 100%;
          height: 150px;
          margin-top: 5px;
          padding: 5px;
          background: #2a2a2a;
          color: #0f0;
          border: 1px solid #666;
          border-radius: 3px;
          font-family: 'Courier New', monospace;
          font-size: 10px;
          resize: vertical;
        }
        .region-graph-layout-editor .section {
          margin-bottom: 8px;
          padding-bottom: 8px;
          border-bottom: 1px solid #444;
        }
        .region-graph-layout-editor .error {
          color: #ff6666;
          margin-top: 3px;
          font-size: 10px;
        }
        .region-graph-layout-editor .success {
          color: #66ff66;
          margin-top: 3px;
          font-size: 10px;
        }
        .region-graph-layout-editor .collapsed {
          display: none;
        }
        .region-graph-layout-editor label {
          display: block;
          margin-bottom: 3px;
          font-weight: bold;
        }
      </style>
      <div class="region-graph-layout-editor">
        <div class="section">
          <button id="toggleHubEdges">Toggle Hub Edges</button>
          <button id="detectHubs">Detect Hub Nodes</button>
          <button id="toggleEditor">Show Layout Editor</button>
        </div>
        
        <div id="layoutEditor" class="collapsed">
          <div class="section">
            <label>Hub Detection:</label>
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
              <span style="font-size: 11px;">Threshold:</span>
              <input type="number" id="hubThreshold" value="8" min="2" max="20" style="width: 50px; padding: 2px; background: #444; color: #fff; border: 1px solid #666; border-radius: 3px;">
              <button id="applyHubThreshold" style="padding: 2px 6px; font-size: 10px;">Apply</button>
              <label style="margin-left: 8px; font-weight: normal; font-size: 10px;">
                <input type="checkbox" id="autoApplyHubs" checked style="margin-right: 3px;">
                Auto-Apply
              </label>
            </div>
            <label style="display: block; margin-top: 5px; font-weight: normal;">
              <input type="checkbox" id="autoApplyPreset" checked style="margin-right: 5px;">
              Auto-apply preset on selection
            </label>
          </div>
          <div class="section">
            <label>Layout Preset:</label>
            <select id="layoutPreset" style="width: 100%;">
              <option value="cose" selected>COSE (Classic) - Default</option>
              <option value="fcose-default">Force-Directed</option>
              <option value="fcose-hub">Force-Directed (Hub Optimized)</option>
              <option value="hierarchical">Hierarchical</option>
              <option value="hierarchical-auto">Hierarchical (Auto-Root)</option>
              <option value="concentric">Concentric Circles</option>
              <option value="concentric-hub">Concentric (Hub-Based)</option>
              <option value="circle">Circle</option>
              <option value="grid">Grid</option>
              <option value="custom">Custom JSON</option>
            </select>
          </div>
          
          <div class="section">
            <label>Layout Settings (JSON):</label>
            <textarea id="layoutJson" placeholder="Enter custom layout JSON here..."></textarea>
            <div id="jsonError" class="error"></div>
            <div id="jsonSuccess" class="success"></div>
          </div>
          
          <div class="section">
            <button id="applyLayout">Apply Layout</button>
            <button id="validateJson">Validate JSON</button>
            <button id="formatJson">Format JSON</button>
            <button id="copyJson">Copy JSON</button>
          </div>
        </div>
      </div>
    `;
  }

  setupEventHandlers(regionGraphUI) {
    const controls = {
      toggleHubEdges: this.controlPanel.querySelector('#toggleHubEdges'),
      detectHubs: this.controlPanel.querySelector('#detectHubs'),
      toggleEditor: this.controlPanel.querySelector('#toggleEditor'),
      hubThreshold: this.controlPanel.querySelector('#hubThreshold'),
      applyHubThreshold: this.controlPanel.querySelector('#applyHubThreshold'),
      autoApplyHubs: this.controlPanel.querySelector('#autoApplyHubs'),
      autoApplyPreset: this.controlPanel.querySelector('#autoApplyPreset'),
      layoutPreset: this.controlPanel.querySelector('#layoutPreset'),
      layoutJson: this.controlPanel.querySelector('#layoutJson'),
      applyLayout: this.controlPanel.querySelector('#applyLayout'),
      validateJson: this.controlPanel.querySelector('#validateJson'),
      formatJson: this.controlPanel.querySelector('#formatJson'),
      copyJson: this.controlPanel.querySelector('#copyJson'),
      jsonError: this.controlPanel.querySelector('#jsonError'),
      jsonSuccess: this.controlPanel.querySelector('#jsonSuccess'),
      layoutEditor: this.controlPanel.querySelector('#layoutEditor')
    };

    if (controls.toggleHubEdges) {
      controls.toggleHubEdges.addEventListener('click', () => {
        const hubEdges = this.cy.$('.hub-edge');
        if (hubEdges.length === 0) {
          const threshold = parseInt(controls.hubThreshold?.value || 8);
          regionGraphUI.identifyHubNodes(threshold);
        } else {
          if (hubEdges.hasClass('hidden')) {
            hubEdges.removeClass('hidden');
            controls.toggleHubEdges.textContent = 'Hide Hub Edges';
          } else {
            hubEdges.addClass('hidden');
            controls.toggleHubEdges.textContent = 'Show Hub Edges';
          }
        }
      });
    }

    if (controls.detectHubs) {
      controls.detectHubs.addEventListener('click', () => {
        const threshold = parseInt(controls.hubThreshold?.value || 8);
        const hubNodes = regionGraphUI.identifyHubNodes(threshold);
        regionGraphUI.updateStatus(`Detected ${hubNodes.length} hub nodes (degree >= ${threshold})`);
      });
    }

    if (controls.applyHubThreshold) {
      controls.applyHubThreshold.addEventListener('click', () => {
        const threshold = parseInt(controls.hubThreshold?.value || 8);
        const hubNodes = regionGraphUI.identifyHubNodes(threshold);
        regionGraphUI.updateStatus(`Applied hub threshold: ${hubNodes.length} hubs found`);
      });
    }

    // Auto-apply hub detection when threshold changes
    if (controls.hubThreshold && controls.autoApplyHubs) {
      controls.hubThreshold.addEventListener('input', () => {
        if (controls.autoApplyHubs.checked) {
          const threshold = parseInt(controls.hubThreshold.value || 8);
          const hubNodes = regionGraphUI.identifyHubNodes(threshold);
          regionGraphUI.updateStatus(`Auto-applied hub threshold: ${hubNodes.length} hubs found`);
        }
      });
    }

    if (controls.toggleEditor) {
      controls.toggleEditor.addEventListener('click', () => {
        if (controls.layoutEditor.classList.contains('collapsed')) {
          controls.layoutEditor.classList.remove('collapsed');
          controls.toggleEditor.textContent = 'Hide Layout Editor';
          const currentPreset = controls.layoutPreset.value;
          if (currentPreset !== 'custom') {
            this.loadPresetIntoEditor(currentPreset);
          }
        } else {
          controls.layoutEditor.classList.add('collapsed');
          controls.toggleEditor.textContent = 'Show Layout Editor';
        }
      });
    }

    if (controls.layoutPreset) {
      controls.layoutPreset.addEventListener('change', (e) => {
        const preset = e.target.value;
        if (preset !== 'custom') {
          this.loadPresetIntoEditor(preset);
        } else {
          controls.layoutJson.value = JSON.stringify({
            name: 'fcose',
          }, null, 2);
        }
        this.clearJsonMessages();
        
        // Auto-apply layout if enabled
        if (controls.autoApplyPreset && controls.autoApplyPreset.checked) {
          // Small delay to allow JSON to be loaded into editor
          setTimeout(() => {
            this.applyLayoutFromJson(regionGraphUI);
          }, 100);
        }
      });
    }


    if (controls.applyLayout) {
      controls.applyLayout.addEventListener('click', () => {
        this.applyLayoutFromJson(regionGraphUI);
      });
    }

    if (controls.validateJson) {
      controls.validateJson.addEventListener('click', () => {
        this.validateLayoutJson();
      });
    }

    if (controls.formatJson) {
      controls.formatJson.addEventListener('click', () => {
        this.formatLayoutJson();
      });
    }

    if (controls.copyJson) {
      controls.copyJson.addEventListener('click', () => {
        const jsonText = controls.layoutJson.value;
        navigator.clipboard.writeText(jsonText).then(() => {
          this.showJsonSuccess('JSON copied to clipboard!');
        }).catch(err => {
          this.showJsonError('Failed to copy: ' + err.message);
        });
      });
    }

    if (controls.layoutJson) {
      let validateTimeout;
      controls.layoutJson.addEventListener('input', () => {
        clearTimeout(validateTimeout);
        validateTimeout = setTimeout(() => {
          this.validateLayoutJson(true);
        }, 500);
      });
    }
  }

  loadPresetIntoEditor(presetName) {
    let preset = this.layoutPresets[presetName];
    if (preset) {
      // Create a copy to avoid modifying the original preset
      preset = JSON.parse(JSON.stringify(preset));
      
      // Special handling for dynamic presets
      if (presetName === 'hierarchical-auto') {
        // Add a note about auto-detection
        preset._comment = "Auto-detects root node (Light World or highest degree)";
      } else if (presetName === 'concentric-hub') {
        // Add a note about hub-based layout
        preset._comment = "Uses hub detection to organize nodes in concentric circles";
        preset.hubThreshold = parseInt(this.controlPanel.querySelector('#hubThreshold')?.value || 8);
      }
      
      const jsonText = JSON.stringify(preset, null, 2);
      const jsonTextarea = this.controlPanel.querySelector('#layoutJson');
      if (jsonTextarea) {
        jsonTextarea.value = jsonText;
        this.clearJsonMessages();
      }
    }
  }

  validateLayoutJson(silent = false) {
    const jsonTextarea = this.controlPanel.querySelector('#layoutJson');
    const jsonText = jsonTextarea.value.trim();
    
    if (!jsonText) {
      if (!silent) this.showJsonError('Please enter layout settings');
      return false;
    }

    try {
      const layoutOptions = JSON.parse(jsonText);
      
      if (!layoutOptions.name) {
        if (!silent) this.showJsonError('Missing required field: "name"');
        return false;
      }

      const validLayouts = ['fcose', 'cose', 'breadthfirst', 'circle', 'concentric', 'grid', 'random', 'preset', 'cola', 'cose-bilkent'];
      if (!validLayouts.includes(layoutOptions.name)) {
        if (!silent) this.showJsonError(`Invalid layout name: "${layoutOptions.name}". Valid options: ${validLayouts.join(', ')}`);
        return false;
      }

      if (!silent) this.showJsonSuccess('Valid JSON!');
      return true;
    } catch (e) {
      if (!silent) this.showJsonError('Invalid JSON: ' + e.message);
      return false;
    }
  }

  formatLayoutJson() {
    const jsonTextarea = this.controlPanel.querySelector('#layoutJson');
    const jsonText = jsonTextarea.value.trim();
    
    try {
      const layoutOptions = JSON.parse(jsonText);
      const formatted = JSON.stringify(layoutOptions, null, 2);
      jsonTextarea.value = formatted;
      this.showJsonSuccess('JSON formatted!');
    } catch (e) {
      this.showJsonError('Cannot format invalid JSON: ' + e.message);
    }
  }

  applyLayoutFromJson(regionGraphUI) {
    const jsonTextarea = this.controlPanel.querySelector('#layoutJson');
    const jsonText = jsonTextarea.value.trim();
    
    if (!this.validateLayoutJson()) {
      return;
    }

    try {
      const layoutOptions = JSON.parse(jsonText);
      
      if (!layoutOptions.animate) layoutOptions.animate = true;
      if (!layoutOptions.animationDuration) layoutOptions.animationDuration = 1000;
      if (!layoutOptions.fit) layoutOptions.fit = true;
      if (!layoutOptions.padding) layoutOptions.padding = 50;
      
      // Handle auto-root detection for hierarchical layouts
      if (layoutOptions.name === 'breadthfirst' && !layoutOptions.roots) {
        // First check for Light World node
        let rootNode = this.cy.$('#Light_World, #light_world, #LightWorld, #light-world');
        if (rootNode.length === 0) {
          // Find node with highest degree
          let maxDegree = 0;
          this.cy.nodes().forEach(node => {
            if (!node.hasClass('player')) {
              const degree = node.degree();
              if (degree > maxDegree) {
                maxDegree = degree;
                rootNode = node;
              }
            }
          });
        }
        if (rootNode && rootNode.length > 0) {
          layoutOptions.roots = rootNode;
        }
      }

      // Handle hub-based concentric layout
      if (layoutOptions.name === 'concentric' && !layoutOptions.concentric) {
        const hubThreshold = parseInt(this.controlPanel.querySelector('#hubThreshold')?.value || 8);
        const hubNodes = regionGraphUI.identifyHubNodes(hubThreshold);
        const hubIds = new Set(hubNodes.map(h => h.id));
        
        layoutOptions.concentric = function(node) {
          if (node.hasClass('player')) return 0;
          if (hubIds.has(node.id())) return 10; // Hubs in center
          const connectedToHub = node.neighborhood('node').some(n => hubIds.has(n.id()));
          if (connectedToHub) return 5; // Connected to hub
          return 1; // Everything else on outer ring
        };
        
        layoutOptions.levelWidth = function(nodes) {
          return 1;
        };
      }

      this.processLayoutFunctions(layoutOptions);

      this.isLayoutRunning = true;
      regionGraphUI.updateStatus('Running custom layout...');
      
      this.currentLayout = this.cy.layout(layoutOptions);
      this.currentLayout.run();
      
      this.showJsonSuccess('Layout applied successfully!');
      
      this.layoutPresets['custom'] = layoutOptions;
      
    } catch (e) {
      this.showJsonError('Failed to apply layout: ' + e.message);
      logger.error('Layout error:', e);
    }
  }

  processLayoutFunctions(layoutOptions) {
    if (layoutOptions.name === 'fcose') {
      if (layoutOptions.nodeRepulsionHub) {
        const hubRepulsion = layoutOptions.nodeRepulsionHub;
        const normalRepulsion = layoutOptions.nodeRepulsion || 4500;
        layoutOptions.nodeRepulsion = (node) => {
          return node.hasClass('hub') ? hubRepulsion : normalRepulsion;
        };
        delete layoutOptions.nodeRepulsionHub;
      }
      
      if (layoutOptions.idealEdgeLengthHub) {
        const hubLength = layoutOptions.idealEdgeLengthHub;
        const normalLength = layoutOptions.idealEdgeLength || 50;
        layoutOptions.idealEdgeLength = (edge) => {
          return edge.hasClass('hub-edge') ? hubLength : normalLength;
        };
        delete layoutOptions.idealEdgeLengthHub;
      }
      
      if (layoutOptions.edgeElasticityHub) {
        const hubElasticity = layoutOptions.edgeElasticityHub;
        const normalElasticity = layoutOptions.edgeElasticity || 0.45;
        layoutOptions.edgeElasticity = (edge) => {
          return edge.hasClass('hub-edge') ? hubElasticity : normalElasticity;
        };
        delete layoutOptions.edgeElasticityHub;
      }
    }
    
    if (layoutOptions.name === 'concentric' && layoutOptions.concentricLevels) {
      const levels = layoutOptions.concentricLevels;
      layoutOptions.concentric = (node) => {
        if (node.hasClass('hub')) return levels.hub || 3;
        const connectedToHub = node.neighborhood('node').some(n => n.hasClass('hub'));
        if (connectedToHub) return levels.connected || 2;
        return levels.other || 1;
      };
      delete layoutOptions.concentricLevels;
    }
  }

  showJsonError(message) {
    const errorDiv = this.controlPanel.querySelector('#jsonError');
    const successDiv = this.controlPanel.querySelector('#jsonSuccess');
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.style.display = 'block';
    }
    if (successDiv) {
      successDiv.style.display = 'none';
    }
  }

  showJsonSuccess(message) {
    const errorDiv = this.controlPanel.querySelector('#jsonError');
    const successDiv = this.controlPanel.querySelector('#jsonSuccess');
    if (successDiv) {
      successDiv.textContent = message;
      successDiv.style.display = 'block';
    }
    if (errorDiv) {
      errorDiv.style.display = 'none';
    }
  }

  clearJsonMessages() {
    const errorDiv = this.controlPanel.querySelector('#jsonError');
    const successDiv = this.controlPanel.querySelector('#jsonSuccess');
    if (errorDiv) errorDiv.style.display = 'none';
    if (successDiv) successDiv.style.display = 'none';
  }
}