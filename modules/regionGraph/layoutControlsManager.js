import { RegionGraphLayoutEditor } from './regionGraphLayoutEditor.js';
import settingsManager from '../../app/core/settingsManager.js';
import { createUniversalLogger } from '../../app/core/universalLogger.js';

const logger = createUniversalLogger('regionGraph');

export class LayoutControlsManager {
  constructor(ui) {
    this.ui = ui;
  }

  setupControlPanel() {
    // Create hybrid control panel with both existing controls and layout editor
    this.ui.controlPanel.innerHTML = `
      <div id="controlsHeader" style="display: flex; align-items: center; margin-bottom: 5px; cursor: pointer; user-select: none;">
        <button id="toggleControls" style="background: none; border: 1px solid #555; color: white; padding: 2px 6px; font-size: 10px; cursor: pointer; border-radius: 2px; margin-right: 8px; pointer-events: none;">+</button>
        <span style="font-weight: bold; pointer-events: none;">Controls</span>
      </div>
      <div id="controlsContent" style="display: none;">
        <div style="margin-bottom: 10px;">
          <button id="resetView" style="margin: 2px; padding: 4px 8px;">Reset View</button>
          <button id="relayout" style="margin: 2px; padding: 4px 8px;">Re-layout</button>
          <button id="exportPositions" style="margin: 2px; padding: 4px 8px;">Export Positions</button>
        </div>
        <div id="layoutEditorContainer"></div>
        <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #555;">
          <div style="font-weight: bold; margin-bottom: 5px;">Location Visibility:</div>
          <label style="display: block; margin: 3px 0; cursor: pointer;">
            <input type="checkbox" id="forceShowLocations" style="margin-right: 5px;">
            Always show locations (override zoom)
          </label>
          <label style="display: block; margin: 3px 0; cursor: pointer;">
            <input type="checkbox" id="forceHideLocations" style="margin-right: 5px;">
            Always hide locations (override zoom)
          </label>
        </div>
        <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #555;">
          <div style="font-weight: bold; margin-bottom: 5px;">On Region Node Click:</div>
          <label style="display: block; margin: 3px 0; cursor: pointer;">
            <input type="checkbox" id="movePlayerOneStep" style="margin-right: 5px;">
            Move player one step towards region
          </label>
          <label style="display: block; margin: 3px 0; cursor: pointer;">
            <input type="checkbox" id="movePlayerDirectly" style="margin-right: 5px;" checked>
            Move player directly to region
          </label>
          <label style="display: block; margin: 3px 0; cursor: pointer;">
            <input type="checkbox" id="showRegionInPanel" style="margin-right: 5px;" checked>
            Show region in Regions panel
          </label>
          <label style="display: block; margin: 3px 0; cursor: pointer;">
            <input type="checkbox" id="addToPath" style="margin-right: 5px;" checked>
            Add to path
          </label>
          <label style="display: block; margin: 3px 0; cursor: pointer;">
            <input type="checkbox" id="overwritePath" style="margin-right: 5px;">
            Overwrite path
          </label>
          <label style="display: block; margin: 3px 0; cursor: pointer;">
            <input type="checkbox" id="addLocationsToPath" style="margin-right: 5px;">
            Add locations to path
          </label>
          <label style="display: block; margin: 3px 0; cursor: pointer;">
            <input type="checkbox" id="checkAllLocationsInRegion" style="margin-right: 5px;">
            Check all locations in region
          </label>
        </div>
      </div>
    `;

    // Initialize layout editor
    const layoutEditorContainer = this.ui.controlPanel.querySelector('#layoutEditorContainer');
    if (layoutEditorContainer) {
      this.ui.layoutEditor = new RegionGraphLayoutEditor(this.ui.cy, this.ui.controlPanel);
      layoutEditorContainer.innerHTML = this.ui.layoutEditor.createEditorHTML();
      this.ui.layoutEditor.setupEventHandlers(this.ui);
    }
  }

  async loadCheckboxSettings() {
    // Load checkbox states from settings
    const checkboxes = [
      { id: '#forceShowLocations', setting: 'regionGraph.forceShowLocations', default: false },
      { id: '#forceHideLocations', setting: 'regionGraph.forceHideLocations', default: false },
      { id: '#movePlayerOneStep', setting: 'regionGraph.movePlayerOneStep', default: false },
      { id: '#movePlayerDirectly', setting: 'regionGraph.movePlayerDirectly', default: true },
      { id: '#showRegionInPanel', setting: 'regionGraph.showRegionInPanel', default: true },
      { id: '#addToPath', setting: 'regionGraph.addToPath', default: true },
      { id: '#overwritePath', setting: 'regionGraph.overwritePath', default: false },
      { id: '#addLocationsToPath', setting: 'regionGraph.addLocationsToPath', default: false },
      { id: '#checkAllLocationsInRegion', setting: 'regionGraph.checkAllLocationsInRegion', default: false }
    ];

    for (const checkbox of checkboxes) {
      const element = this.ui.controlPanel.querySelector(checkbox.id);
      if (element) {
        try {
          const value = await settingsManager.getSetting(checkbox.setting, checkbox.default);
          element.checked = value;
        } catch (error) {
          logger.warn(`Failed to load setting ${checkbox.setting}:`, error);
          element.checked = checkbox.default;
        }
      }
    }
  }

  async saveCheckboxSetting(checkboxId, settingKey, value) {
    try {
      // Ensure the regionGraph settings section exists
      const currentSettings = await settingsManager.getSettings();
      if (!currentSettings.regionGraph) {
        await settingsManager.updateSetting('regionGraph', {});
      }

      // Now update the specific setting
      await settingsManager.updateSetting(settingKey, value);
    } catch (error) {
      logger.warn(`Failed to save setting ${settingKey}:`, error);
    }
  }

  toggleControlPanel() {
    const controlsContent = this.ui.controlPanel.querySelector('#controlsContent');
    const toggleButton = this.ui.controlPanel.querySelector('#toggleControls');

    if (!controlsContent || !toggleButton) return;

    const isVisible = controlsContent.style.display !== 'none';

    if (isVisible) {
      // Collapse
      controlsContent.style.display = 'none';
      toggleButton.textContent = '+';
      toggleButton.title = 'Expand controls';
    } else {
      // Expand
      controlsContent.style.display = 'block';
      toggleButton.textContent = '−';
      toggleButton.title = 'Collapse controls';
    }
  }

  runLayout(force = false) {
    if (this.ui.isLayoutRunning) {
      logger.debug('Layout already running');
      return;
    }

    const savedPositions = !force && this.ui.nodePositions.size > 0;

    if (savedPositions) {
      this.ui.cy.nodes().forEach(node => {
        const pos = this.ui.nodePositions.get(node.id());
        if (pos) {
          node.position(pos);
        }
      });
      this.ui.cy.fit(30);

      // Position the player if this is initial load and no layout will run
      if (this.ui.initialPlayerRegion && !this.ui.cy.getElementById('player').length) {
        logger.debug(`Positioning player with saved positions at ${this.ui.initialPlayerRegion}`);
        this.ui.updatePlayerLocation(this.ui.initialPlayerRegion);
        this.ui.initialPlayerRegion = null;
      }

      return;
    }

    this.ui.isLayoutRunning = true;
    this.ui.updateStatus('Running layout...');

    // Use the same COSE settings as the preset in layoutEditor
    const layoutOptions = {
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
    };

    this.ui.currentLayout = this.ui.cy.layout(layoutOptions);
    this.ui.currentLayout.run();
  }

  saveNodePositions() {
    this.ui.nodePositions.clear();
    this.ui.cy.nodes().forEach(node => {
      this.ui.nodePositions.set(node.id(), {
        x: node.position('x'),
        y: node.position('y')
      });
    });
  }

  exportNodePositions() {
    const positions = {};
    this.ui.cy.nodes().forEach(node => {
      positions[node.id()] = {
        x: Math.round(node.position('x')),
        y: Math.round(node.position('y'))
      };
    });

    const dataStr = JSON.stringify(positions, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'region-graph-positions.json';
    link.click();
    URL.revokeObjectURL(url);

    this.ui.updateStatus('Positions exported to file');
  }
}