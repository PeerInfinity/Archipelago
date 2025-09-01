import eventBus from '../../app/core/eventBus.js';
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import { evaluateRule } from '../shared/ruleEngine.js';
import { createStateSnapshotInterface } from '../shared/stateInterface.js';
import { getPlayerStateSingleton } from '../playerState/singleton.js';
import { PathFinder } from './pathfinder.js';
import { RegionGraphLayoutEditor } from './regionGraphLayoutEditor.js';

export class RegionGraphUI {
  constructor(container, componentState) {
    this.container = container;
    this.componentState = componentState;
    this.cy = null;
    this.cytoscape = null;
    this.cytoscapeFcose = null;
    this.currentLayout = null;
    this.selectedNode = null;
    this.nodePositions = new Map();
    this.isLayoutRunning = false;
    this.pathFinder = new PathFinder(stateManager);
    this.currentPath = [];
    this.regionPathCounts = new Map();
    this.layoutEditor = null;
    
    this.rootElement = document.createElement('div');
    this.rootElement.classList.add('region-graph-panel-container', 'panel-container');
    this.rootElement.style.width = '100%';
    this.rootElement.style.height = '100%';
    this.rootElement.style.position = 'relative';
    
    this.statusBar = document.createElement('div');
    this.statusBar.style.position = 'absolute';
    this.statusBar.style.top = '5px';
    this.statusBar.style.left = '5px';
    this.statusBar.style.background = 'rgba(0, 0, 0, 0.7)';
    this.statusBar.style.color = 'white';
    this.statusBar.style.padding = '5px 10px';
    this.statusBar.style.borderRadius = '3px';
    this.statusBar.style.fontSize = '12px';
    this.statusBar.style.zIndex = '1000';
    this.statusBar.innerHTML = 'Loading graph...';
    
    this.graphContainer = document.createElement('div');
    this.graphContainer.id = 'cy-' + Math.random().toString(36).substr(2, 9);
    this.graphContainer.style.width = '100%';
    this.graphContainer.style.height = '100%';
    
    this.controlPanel = document.createElement('div');
    this.controlPanel.style.position = 'absolute';
    this.controlPanel.style.top = '5px';
    this.controlPanel.style.right = '5px';
    this.controlPanel.style.background = 'rgba(0, 0, 0, 0.7)';
    this.controlPanel.style.padding = '5px';
    this.controlPanel.style.borderRadius = '3px';
    this.controlPanel.style.zIndex = '1000';
    this.controlPanel.style.color = 'white';
    this.controlPanel.style.fontSize = '12px';
    this.controlPanel.style.minWidth = '200px';
    this.controlPanel.style.maxWidth = '400px';
    this.controlPanel.innerHTML = '';
    
    this.rootElement.appendChild(this.statusBar);
    this.rootElement.appendChild(this.controlPanel);
    this.rootElement.appendChild(this.graphContainer);
    this.container.element.appendChild(this.rootElement);
    
    this.container.on('show', () => this.onPanelShow());
    this.container.on('resize', () => this.onPanelResize());
    this.container.on('destroy', () => this.destroy());
    
    // Use event-driven initialization like Regions module
    const readyHandler = () => {
      console.log('[RegionGraphUI] Received app:readyForUiDataLoad, starting initialization');
      this.loadCytoscape();
      eventBus.unsubscribe('app:readyForUiDataLoad', readyHandler);
    };
    eventBus.subscribe('app:readyForUiDataLoad', readyHandler, 'regionGraph');
    
    console.log('[RegionGraphUI] Constructor complete, waiting for app:readyForUiDataLoad event');
  }

  getRootElement() {
    return this.rootElement;
  }

  loadCytoscape() {
    console.log('[RegionGraphUI] loadCytoscape called');
    console.log('[RegionGraphUI] Checking libraries - cytoscape:', !!window.cytoscape, 'coseBase:', !!window.coseBase, 'cytoscapeFcose:', !!window.cytoscapeFcose);
    
    if (window.cytoscape && window.coseBase && window.cytoscapeFcose) {
      console.log('[RegionGraphUI] All libraries already loaded, initializing graph');
      this.cytoscape = window.cytoscape;
      this.cytoscapeFcose = window.cytoscapeFcose;
      this.cytoscape.use(this.cytoscapeFcose(window.coseBase));
      this.initializeGraph();
    } else {
      console.log('[RegionGraphUI] Loading libraries dynamically');
      // Load Cytoscape.js first
      const script1 = document.createElement('script');
      script1.src = './libs/cytoscape/cytoscape.min.js';
      script1.onerror = (error) => {
        console.error('[RegionGraphUI] Error loading cytoscape.min.js:', error);
        this.updateStatus('Error loading Cytoscape library');
      };
      script1.onload = () => {
        console.log('[RegionGraphUI] Cytoscape.js loaded');
        this.cytoscape = window.cytoscape;
        
        // Load layout-base dependency
        const script2 = document.createElement('script');
        script2.src = './libs/cytoscape/layout-base.js';
        script2.onload = () => {
          console.log('[RegionGraphUI] layout-base.js loaded');
          // Load cose-base dependency  
          const script3 = document.createElement('script');
          script3.src = './libs/cytoscape/cose-base.js';
          script3.onload = () => {
            console.log('[RegionGraphUI] cose-base.js loaded, window.coseBase:', !!window.coseBase);
            // Load FCose plugin
            const script4 = document.createElement('script');
            script4.src = './libs/cytoscape/cytoscape-fcose.js';
            script4.onload = () => {
              console.log('[RegionGraphUI] cytoscape-fcose.js loaded, window.cytoscapeFcose:', !!window.cytoscapeFcose);
              this.cytoscapeFcose = window.cytoscapeFcose;
              if (this.cytoscape && this.cytoscapeFcose && window.coseBase) {
                console.log('[RegionGraphUI] All libraries loaded, registering FCose plugin');
                try {
                  this.cytoscape.use(this.cytoscapeFcose(window.coseBase));
                  console.log('[RegionGraphUI] FCose plugin registered successfully');
                } catch (error) {
                  console.error('[RegionGraphUI] Error registering FCose plugin:', error);
                }
              } else {
                console.warn('[RegionGraphUI] Missing libraries:', 'cytoscape:', !!this.cytoscape, 'cytoscapeFcose:', !!this.cytoscapeFcose, 'coseBase:', !!window.coseBase);
              }
              console.log('[RegionGraphUI] Calling initializeGraph...');
              this.initializeGraph();
            };
            script4.onerror = (error) => console.error('[RegionGraphUI] Error loading cytoscape-fcose.js:', error);
            document.head.appendChild(script4);
          };
          script3.onerror = (error) => console.error('[RegionGraphUI] Error loading cose-base.js:', error);
          document.head.appendChild(script3);
        };
        script2.onerror = (error) => console.error('[RegionGraphUI] Error loading layout-base.js:', error);
        document.head.appendChild(script2);
      };
      document.head.appendChild(script1);
    }
  }

  initializeGraph() {
    console.log('[RegionGraphUI] initializeGraph called');
    try {
      if (!this.cytoscape) {
        console.error('[RegionGraphUI] Cytoscape not loaded');
        this.updateStatus('Error: Failed to load Cytoscape');
        return;
      }

    console.log('[RegionGraphUI] Creating Cytoscape instance');
    this.cy = this.cytoscape({
      container: this.graphContainer,
      
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#666',
            'label': 'data(label)',
            'color': '#fff',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '10px',
            'width': 60,
            'height': 45,
            'border-width': 2,
            'border-color': '#333',
            'text-wrap': 'wrap',
            'text-max-width': '100px',
            'z-index': 10
          }
        },
        {
          selector: 'node.inaccessible',
          style: {
            'background-color': '#8e8e8e',
            'border-color': '#555',
            'opacity': 0.6
          }
        },
        {
          selector: 'node.accessible',
          style: {
            'border-color': '#52b845'
          }
        },
        {
          selector: 'node.all-accessible',
          style: {
            'background-color': '#4a7c59'
          }
        },
        {
          selector: 'node.mixed-locations',
          style: {
            'background-color': '#c9a227'
          }
        },
        {
          selector: 'node.all-inaccessible',
          style: {
            'background-color': '#a84444'
          }
        },
        {
          selector: 'node.completed',
          style: {
            'background-color': '#000',
            'border-color': '#52b845',
            'border-width': 3
          }
        },
        {
          selector: 'node.in-path',
          style: {
            'border-color': '#6c5ce7',
            'border-width': 4
          }
        },
        {
          selector: 'node.path-single',
          style: {
            'border-color': '#6c5ce7',
            'border-width': 4
          }
        },
        {
          selector: 'node.path-multiple',
          style: {
            'border-color': '#a29bfe',
            'border-width': 6,
            'font-weight': 'bold'
          }
        },
        {
          selector: 'node.player',
          style: {
            'background-color': '#4169e1',
            'border-color': '#ffffff',
            'border-width': 3,
            'width': 20,
            'height': 20,
            'z-index': 1000
          }
        },
        {
          selector: 'node.current',
          style: {
            'border-color': '#ffd93d',
            'border-width': 4,
            'width': 70,
            'height': 55
          }
        },
        {
          selector: 'node.hub',
          style: {
            'width': 80,
            'height': 60,
            'font-size': '12px',
            'border-width': 3,
            'z-index': 5
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-color': '#ff0000',
            'border-width': 4
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#666',
            'target-arrow-color': '#666',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'z-index': 5,
            'opacity': 0.6,
            'label': 'data(label)',
            'color': '#fff',
            'text-background-color': '#000',
            'text-background-opacity': 0.8,
            'text-background-padding': '2px',
            'text-background-shape': 'roundrectangle',
            'font-size': '9px',
            'font-weight': 'bold',
            'text-wrap': 'wrap',
            'text-max-width': '80px',
            'edge-text-rotation': 'none',
            'text-margin-y': '-2px'
          }
        },
        {
          selector: 'edge.bidirectional',
          style: {
            'source-arrow-shape': 'triangle',
            'source-arrow-color': '#666'
          }
        },
        {
          selector: 'edge.inaccessible',
          style: {
            'line-color': '#8e8e8e',
            'target-arrow-color': '#8e8e8e',
            'width': 1,
            'opacity': 0.3
          }
        },
        {
          selector: 'edge.inaccessible.bidirectional',
          style: {
            'source-arrow-color': '#8e8e8e'
          }
        },
        {
          selector: 'edge.accessible',
          style: {
            'line-color': '#52b845',
            'target-arrow-color': '#52b845',
            'width': 3,
            'opacity': 0.8
          }
        },
        {
          selector: 'edge.accessible.bidirectional',
          style: {
            'source-arrow-color': '#52b845'
          }
        },
        {
          selector: 'edge.in-path',
          style: {
            'line-color': '#6c5ce7',
            'target-arrow-color': '#6c5ce7',
            'width': 5,
            'opacity': 1.0,
            'z-index': 10
          }
        },
        {
          selector: 'edge.in-path.bidirectional',
          style: {
            'source-arrow-color': '#6c5ce7'
          }
        },
        {
          selector: 'edge.hub-edge',
          style: {
            'line-style': 'dotted',
            'opacity': 0.3,
            'width': 1,
            'curve-style': 'unbundled-bezier',
            'control-point-distances': [40],
            'control-point-weights': [0.5],
            'z-index': 1
          }
        },
        {
          selector: 'edge.hub-edge.hidden',
          style: {
            'display': 'none'
          }
        }
      ],
      
      layout: {
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
      }
    });

    console.log('[RegionGraphUI] Cytoscape instance created successfully');
    this.setupControlPanel();
    this.setupEventHandlers();
    this.subscribeToEvents();
    this.graphInitialized = false; // Track if data has been loaded
    
    this.updateStatus('Graph initialized, waiting for data...');
    console.log('[RegionGraphUI] Graph initialized, waiting for StateManager events');
    
    // Check if data is already available (in case we missed the initial events)
    this.checkAndLoadInitialData();
    } catch (error) {
      console.error('[RegionGraphUI] Error in initializeGraph:', error);
      this.updateStatus('Error initializing graph: ' + error.message);
    }
  }

  setupControlPanel() {
    // Create hybrid control panel with both existing controls and layout editor
    this.controlPanel.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
        <span style="font-weight: bold;">Controls</span>
        <button id="toggleControls" style="background: none; border: 1px solid #555; color: white; padding: 2px 6px; font-size: 10px; cursor: pointer; border-radius: 2px;">−</button>
      </div>
      <div id="controlsContent">
        <div style="margin-bottom: 10px;">
          <button id="resetView" style="margin: 2px; padding: 4px 8px;">Reset View</button>
          <button id="relayout" style="margin: 2px; padding: 4px 8px;">Re-layout</button>
          <button id="exportPositions" style="margin: 2px; padding: 4px 8px;">Export Positions</button>
        </div>
        <div id="layoutEditorContainer"></div>
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
        </div>
      </div>
    `;
    
    // Initialize layout editor
    const layoutEditorContainer = this.controlPanel.querySelector('#layoutEditorContainer');
    if (layoutEditorContainer) {
      this.layoutEditor = new RegionGraphLayoutEditor(this.cy, this.controlPanel);
      layoutEditorContainer.innerHTML = this.layoutEditor.createEditorHTML();
      this.layoutEditor.setupEventHandlers(this);
    }
  }

  setupEventHandlers() {
    this.cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const regionName = node.id(); // Node ID is the region name
      
      // Skip if this is the player node
      if (node.hasClass('player')) {
        return;
      }
      
      this.selectedNode = regionName;
      
      console.log(`[RegionGraphUI] Node clicked: ${regionName}`);
      
      // Update visual selection
      this.cy.$('node').removeClass('selected');
      node.addClass('selected');
      
      // Publish the custom regionGraph event for any other listeners
      eventBus.publish('regionGraph:nodeSelected', {
        nodeId: regionName,
        data: node.data()
      }, 'regionGraph');
      
      // Check which actions are enabled via checkboxes
      const movePlayerOneStepCheckbox = this.controlPanel.querySelector('#movePlayerOneStep');
      const movePlayerDirectlyCheckbox = this.controlPanel.querySelector('#movePlayerDirectly');
      const showRegionCheckbox = this.controlPanel.querySelector('#showRegionInPanel');
      const addToPathCheckbox = this.controlPanel.querySelector('#addToPath');
      const overwritePathCheckbox = this.controlPanel.querySelector('#overwritePath');
      
      // Handle path modifications (Add to path or Overwrite path)
      if (addToPathCheckbox && addToPathCheckbox.checked) {
        this.addToPath(regionName, movePlayerOneStepCheckbox && movePlayerOneStepCheckbox.checked);
      } else if (overwritePathCheckbox && overwritePathCheckbox.checked) {
        this.overwritePath(regionName, movePlayerOneStepCheckbox && movePlayerOneStepCheckbox.checked);
      } else {
        // Neither path option is checked - handle move player options
        // Move player one step towards region (if enabled)
        if (movePlayerOneStepCheckbox && movePlayerOneStepCheckbox.checked) {
          this.attemptMovePlayerOneStepToRegion(regionName);
        }
        
        // Move player directly to region (if enabled)
        if (movePlayerDirectlyCheckbox && movePlayerDirectlyCheckbox.checked) {
          this.attemptMovePlayerDirectlyToRegion(regionName);
        }
      }
      
      // Show region in Regions panel (if enabled)
      if (showRegionCheckbox && showRegionCheckbox.checked) {
        // Control "Show All Regions" based on path modification checkboxes
        const shouldShowAll = !(addToPathCheckbox?.checked || overwritePathCheckbox?.checked);
        this.setShowAllRegions(shouldShowAll);
        
        // Activate the regions panel
        eventBus.publish('ui:activatePanel', { panelId: 'regionsPanel' }, 'regionGraph');
        console.log(`[RegionGraphUI] Published ui:activatePanel for regionsPanel`);
        
        // Navigate to the region
        eventBus.publish('ui:navigateToRegion', { regionName: regionName }, 'regionGraph');
        console.log(`[RegionGraphUI] Published ui:navigateToRegion for ${regionName}`);
      }
    });

    this.cy.on('layoutstop', () => {
      this.isLayoutRunning = false;
      this.saveNodePositions();
      this.updateStatus('Layout complete');
    });

    const resetButton = this.controlPanel.querySelector('#resetView');
    if (resetButton) {
      resetButton.addEventListener('click', () => {
        this.cy.fit(30);
      });
    }

    const relayoutButton = this.controlPanel.querySelector('#relayout');
    if (relayoutButton) {
      relayoutButton.addEventListener('click', () => {
        this.runLayout(true);
      });
    }

    const exportButton = this.controlPanel.querySelector('#exportPositions');
    if (exportButton) {
      exportButton.addEventListener('click', () => {
        this.exportNodePositions();
      });
    }

    const toggleButton = this.controlPanel.querySelector('#toggleControls');
    if (toggleButton) {
      toggleButton.addEventListener('click', () => {
        this.toggleControlPanel();
      });
    }
    
    // Make "Add to path" and "Overwrite path" mutually exclusive
    const addToPathCheckbox = this.controlPanel.querySelector('#addToPath');
    const overwritePathCheckbox = this.controlPanel.querySelector('#overwritePath');
    
    if (addToPathCheckbox && overwritePathCheckbox) {
      addToPathCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          overwritePathCheckbox.checked = false;
        }
      });
      
      overwritePathCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          addToPathCheckbox.checked = false;
        }
      });
    }
    
    // Make "Move player one step" and "Move player directly" mutually exclusive
    const moveOneStepCheckbox = this.controlPanel.querySelector('#movePlayerOneStep');
    const moveDirectlyCheckbox = this.controlPanel.querySelector('#movePlayerDirectly');
    
    if (moveOneStepCheckbox && moveDirectlyCheckbox) {
      moveOneStepCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          moveDirectlyCheckbox.checked = false;
        }
      });
      
      moveDirectlyCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          moveOneStepCheckbox.checked = false;
        }
      });
    }
  }

  checkAndLoadInitialData() {
    console.log('[RegionGraphUI] Checking if initial data is already available...');
    
    // Small delay to ensure stateManager is fully initialized
    setTimeout(() => {
      try {
        const staticData = stateManager.getStaticData();
        const snapshot = stateManager.getLatestStateSnapshot();
        
        if (staticData && staticData.regions && snapshot && !this.graphInitialized) {
          console.log('[RegionGraphUI] Data already available, loading graph immediately');
          this.loadGraphData();
        } else {
          console.log('[RegionGraphUI] Data not yet available, will wait for events');
        }
      } catch (error) {
        console.log('[RegionGraphUI] Error checking initial data:', error);
        // Not a problem, will wait for events
      }
    }, 100);
  }
  
  subscribeToEvents() {
    console.log('[RegionGraphUI] Subscribing to events...');
    
    // Clear any existing subscriptions
    if (this.unsubscribeStateUpdate) this.unsubscribeStateUpdate();
    if (this.unsubscribeRegionChange) this.unsubscribeRegionChange();
    if (this.unsubscribeRulesLoaded) this.unsubscribeRulesLoaded();
    if (this.unsubscribeStateReady) this.unsubscribeStateReady();
    
    // Subscribe to state updates
    this.unsubscribeStateUpdate = eventBus.subscribe('stateManager:snapshotUpdated', 
      (data) => this.onStateUpdate(data), 'regionGraph');
    
    this.unsubscribeRegionChange = eventBus.subscribe('playerState:regionChanged',
      (data) => this.updatePlayerLocation(data.newRegion), 'regionGraph');
    
    // Subscribe to path updates to track the full path
    this.unsubscribePathUpdate = eventBus.subscribe('playerState:pathUpdated',
      (data) => this.onPathUpdate(data), 'regionGraph');
      
    // Subscribe to rules loaded event (like Regions module)
    this.unsubscribeRulesLoaded = eventBus.subscribe('stateManager:rulesLoaded', 
      (event) => {
        console.log('[RegionGraphUI] Received stateManager:rulesLoaded, initializing graph data');
        if (this.cy) {
          this.loadGraphData();
        }
      }, 'regionGraph');
      
    // Subscribe to state ready event
    this.unsubscribeStateReady = eventBus.subscribe('stateManager:ready',
      () => {
        console.log('[RegionGraphUI] Received stateManager:ready, ensuring graph is loaded');
        if (this.cy && !this.graphInitialized) {
          this.loadGraphData();
        }
      }, 'regionGraph');
  }

  async loadGraphData() {
    console.log('[RegionGraphUI] loadGraphData called');
    try {
      console.log('[RegionGraphUI] Getting state data...');
      const staticData = stateManager.getStaticData();
      const snapshot = stateManager.getLatestStateSnapshot();
      
      console.log('[RegionGraphUI] staticData:', staticData);
      console.log('[RegionGraphUI] snapshot:', snapshot);
      
      if (!staticData?.regions || !snapshot) {
        console.warn('[RegionGraphUI] Missing data - staticData.regions:', !!staticData?.regions, 'snapshot:', !!snapshot);
        this.updateStatus('No region data available');
        return;
      }

      console.log('[RegionGraphUI] Building graph from regions:', Object.keys(staticData.regions).length);
      this.buildGraphFromRegions(staticData.regions, staticData.exits);
      this.graphInitialized = true; // Mark as successfully loaded
    } catch (error) {
      console.error('[RegionGraphUI] Error loading graph data:', error);
      this.updateStatus('Error loading graph data');
    }
  }

  determineNodeInteriorColor(locationCounts, isReachable) {
    // Black if all locations are checked OR if region has no locations
    if (locationCounts.allChecked || locationCounts.total === 0) {
      return 'completed';
    }
    
    // Only apply interior colors if region is accessible and has unchecked locations
    if (!isReachable || !locationCounts.hasUnchecked) {
      return null; // Use default color
    }
    
    // Green if all unchecked locations are accessible
    if (locationCounts.hasAccessible && !locationCounts.hasInaccessible) {
      return 'all-accessible';
    }
    
    // Yellow if has both accessible and inaccessible unchecked locations
    if (locationCounts.hasAccessible && locationCounts.hasInaccessible) {
      return 'mixed-locations';
    }
    
    // Red if all unchecked locations are inaccessible
    if (!locationCounts.hasAccessible && locationCounts.hasInaccessible) {
      return 'all-inaccessible';
    }
    
    return null; // Default color
  }

  calculateLocationCounts(regionName, regionData) {
    const snapshot = stateManager.getLatestStateSnapshot();
    const staticData = stateManager.getStaticData();
    
    if (!snapshot || !staticData) {
      return { checked: 0, accessible: 0, inaccessible: 0, total: 0 };
    }

    const snapshotInterface = createStateSnapshotInterface(snapshot, staticData);
    const locations = regionData.locations || [];
    const checkedLocations = new Set(snapshot.checkedLocations || []);
    
    let checked = 0;
    let accessible = 0;
    let inaccessible = 0;
    
    const regionIsReachable = snapshot.regionReachability?.[regionName] === true ||
                             snapshot.regionReachability?.[regionName] === 'reachable' ||
                             snapshot.regionReachability?.[regionName] === 'checked';

    for (const location of locations) {
      const isChecked = checkedLocations.has(location.name);
      
      if (isChecked) {
        checked++;
      } else {
        // Evaluate location accessibility
        let locationAccessible = regionIsReachable; // Location needs region to be reachable first
        
        if (location.access_rule && regionIsReachable) {
          try {
            locationAccessible = evaluateRule(location.access_rule, snapshotInterface);
          } catch (e) {
            console.warn(`[RegionGraphUI] Error evaluating location rule for ${location.name}:`, e);
            locationAccessible = false;
          }
        }
        
        if (locationAccessible) {
          accessible++;
        } else {
          inaccessible++;
        }
      }
    }
    
    return {
      checked,
      accessible, 
      inaccessible,
      total: locations.length,
      hasAccessible: accessible > 0,
      hasInaccessible: inaccessible > 0,
      hasUnchecked: (accessible + inaccessible) > 0,
      allChecked: checked === locations.length && locations.length > 0,
      hasLocations: locations.length > 0
    };
  }

  buildGraphFromRegions(regions, exits) {
    console.log('[RegionGraphUI] buildGraphFromRegions called with:', Object.keys(regions || {}).length, 'regions');
    if (!regions || Object.keys(regions).length === 0) {
      console.warn('[RegionGraphUI] No regions to display');
      this.updateStatus('No regions to display');
      return;
    }

    const elements = {
      nodes: [],
      edges: []
    };

    // Check if bidirectional exits are assumed from game settings
    const staticData = stateManager.getStaticData();
    const assumeBidirectional = staticData?.options?.assume_bidirectional_exits === true;
    console.log('[RegionGraphUI] assume_bidirectional_exits:', assumeBidirectional);

    // Create nodes for each region with location counts
    for (const [regionName, regionData] of Object.entries(regions)) {
      // Calculate location counts
      const locationCounts = this.calculateLocationCounts(regionName, regionData);
      
      // Create label with region name and location counts
      const regionLabel = regionName.replace(/_/g, ' ');
      const countLabel = `${locationCounts.checked}, ${locationCounts.accessible}, ${locationCounts.inaccessible} / ${locationCounts.total}`;
      const fullLabel = `${regionLabel}\n${countLabel}`;
      
      elements.nodes.push({
        data: {
          id: regionName,
          label: fullLabel,
          regionName: regionName,
          locationCounts: locationCounts
        },
        position: this.nodePositions.get(regionName) || { x: Math.random() * 500, y: Math.random() * 500 }
      });
    }

    // Track all exits for directionality analysis
    const exitMap = new Map(); // key: "fromRegion->toRegion", value: exitData
    const processedEdges = new Set();

    // Collect all exits from region definitions
    for (const [regionName, regionData] of Object.entries(regions)) {
      if (regionData.exits && regionData.exits.length > 0) {
        for (const exitDef of regionData.exits) {
          const fromRegion = regionName;
          const toRegion = exitDef.connected_region;
          
          if (fromRegion && toRegion && regions[fromRegion] && regions[toRegion]) {
            const exitKey = `${fromRegion}->${toRegion}`;
            exitMap.set(exitKey, {
              fromRegion,
              toRegion,
              exitName: exitDef.name,
              accessRule: exitDef.access_rule
            });
          }
        }
      }
    }

    // Also collect exits from static exits data if available (legacy support)
    if (exits) {
      for (const [exitName, exitData] of Object.entries(exits)) {
        const fromRegion = exitData.parentRegion;
        const toRegion = exitData.connectedRegion;
        
        if (fromRegion && toRegion && regions[fromRegion] && regions[toRegion]) {
          const exitKey = `${fromRegion}->${toRegion}`;
          if (!exitMap.has(exitKey)) {
            exitMap.set(exitKey, {
              fromRegion,
              toRegion,
              exitName: exitName,
              accessRule: exitData.access_rule
            });
          }
        }
      }
    }

    // Create edges with directionality analysis
    for (const [exitKey, exitData] of exitMap.entries()) {
      const { fromRegion, toRegion, exitName, accessRule } = exitData;
      const reverseExitKey = `${toRegion}->${fromRegion}`;
      const forwardEdgeId = `${fromRegion}-${toRegion}`;
      const reverseEdgeId = `${toRegion}-${fromRegion}`;
      
      // Skip if we've already processed this edge pair
      if (processedEdges.has(forwardEdgeId) || processedEdges.has(reverseEdgeId)) {
        continue;
      }

      // Determine if the connection is bidirectional
      const hasReverseExit = exitMap.has(reverseExitKey);
      const isBidirectional = assumeBidirectional || hasReverseExit;

      // Use the lexicographically smaller region as source for consistency
      const isForwardDirection = fromRegion < toRegion;
      const edgeSource = isForwardDirection ? fromRegion : toRegion;
      const edgeTarget = isForwardDirection ? toRegion : fromRegion;
      const edgeId = `${edgeSource}-${edgeTarget}`;

      // Get the primary exit (in the direction of the edge)
      const primaryExit = isForwardDirection ? exitData : exitMap.get(reverseExitKey);
      const reverseExit = isForwardDirection ? exitMap.get(reverseExitKey) : exitData;

      // Create label for edge - handle bidirectional edges with different exit names
      let edgeLabel = '';
      if (isBidirectional && primaryExit && reverseExit && primaryExit.exitName !== reverseExit.exitName) {
        // Different exit names for each direction
        edgeLabel = `${primaryExit.exitName} / ${reverseExit.exitName}`;
      } else if (primaryExit) {
        edgeLabel = primaryExit.exitName;
      } else if (reverseExit) {
        edgeLabel = reverseExit.exitName;
      }

      // Create edge data
      const edgeData = {
        id: edgeId,
        source: edgeSource,
        target: edgeTarget,
        label: edgeLabel,
        exitName: primaryExit ? primaryExit.exitName : (reverseExit ? reverseExit.exitName : ''),
        accessRule: primaryExit ? primaryExit.accessRule : (reverseExit ? reverseExit.accessRule : null),
        isBidirectional: isBidirectional,
        hasForwardExit: isForwardDirection ? true : hasReverseExit,
        hasReverseExit: isForwardDirection ? hasReverseExit : true,
        forwardExitRule: isForwardDirection ? accessRule : (reverseExit ? reverseExit.accessRule : null),
        reverseExitRule: isForwardDirection ? (reverseExit ? reverseExit.accessRule : null) : accessRule,
        forwardExitName: isForwardDirection ? exitData.exitName : (reverseExit ? reverseExit.exitName : ''),
        reverseExitName: isForwardDirection ? (reverseExit ? reverseExit.exitName : '') : exitData.exitName
      };

      elements.edges.push({ data: edgeData });
      processedEdges.add(edgeId);
      processedEdges.add(reverseEdgeId); // Mark both directions as processed
    }

    this.cy.elements().remove();
    this.cy.add(elements);

    // Auto-apply hub detection if enabled
    this.autoApplyHubDetection();

    if (this.nodePositions.size === 0 || this.nodePositions.size !== elements.nodes.length) {
      this.runLayout(false);
    } else {
      this.cy.fit(30);
    }

    // Apply initial accessibility coloring
    const snapshot = stateManager.getLatestStateSnapshot();
    if (snapshot) {
      this.onStateUpdate({ snapshot });
    }

    // Initialize player location
    const currentPlayerRegion = this.getCurrentPlayerLocation();
    if (currentPlayerRegion) {
      this.updatePlayerLocation(currentPlayerRegion);
    }

    this.updateStatus(`Loaded ${elements.nodes.length} regions, ${elements.edges.length} connections`);
  }

  runLayout(force = false) {
    if (this.isLayoutRunning) {
      console.log('[RegionGraphUI] Layout already running');
      return;
    }

    const savedPositions = !force && this.nodePositions.size > 0;
    
    if (savedPositions) {
      this.cy.nodes().forEach(node => {
        const pos = this.nodePositions.get(node.id());
        if (pos) {
          node.position(pos);
        }
      });
      this.cy.fit(30);
      return;
    }

    this.isLayoutRunning = true;
    this.updateStatus('Running layout...');

    const layoutOptions = {
      name: 'fcose',
      quality: 'proof',
      randomize: false,
      animate: true,
      animationDuration: 1000,
      fit: true,
      padding: 70,
      nodeDimensionsIncludeLabels: true,
      uniformNodeDimensions: false,
      packComponents: true,
      
      nodeRepulsion: 15000,
      idealEdgeLength: 150,
      edgeElasticity: 0.45,
      nestingFactor: 0.1,
      gravity: 0.25,
      numIter: 2500,
      tile: true,
      tilingPaddingVertical: 20,
      tilingPaddingHorizontal: 20,
      gravityRangeCompound: 1.5,
      gravityCompound: 1.0,
      gravityRange: 3.8,
      initialEnergyOnIncremental: 0.5
    };

    this.currentLayout = this.cy.layout(layoutOptions);
    this.currentLayout.run();
  }

  saveNodePositions() {
    this.nodePositions.clear();
    this.cy.nodes().forEach(node => {
      this.nodePositions.set(node.id(), {
        x: node.position('x'),
        y: node.position('y')
      });
    });
  }

  exportNodePositions() {
    const positions = {};
    this.cy.nodes().forEach(node => {
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
    
    this.updateStatus('Positions exported to file');
  }

  identifyHubNodes(threshold = 8) {
    const hubNodes = [];
    
    this.cy.nodes().forEach(node => {
      // Skip player node
      if (node.hasClass('player')) {
        return;
      }
      
      const degree = node.degree();
      if (degree >= threshold) {
        hubNodes.push({
          id: node.id(),
          degree: degree
        });
        node.addClass('hub');
      } else {
        node.removeClass('hub');
      }
    });
    
    // Mark edges connected to hubs
    this.cy.edges().forEach(edge => {
      const sourceIsHub = edge.source().hasClass('hub');
      const targetIsHub = edge.target().hasClass('hub');
      if (sourceIsHub || targetIsHub) {
        edge.addClass('hub-edge');
      } else {
        edge.removeClass('hub-edge');
      }
    });
    
    console.log(`[RegionGraphUI] Identified ${hubNodes.length} hub nodes with degree >= ${threshold}`);
    return hubNodes;
  }

  autoApplyHubDetection() {
    if (!this.layoutEditor) return;
    
    const autoApplyCheckbox = this.controlPanel.querySelector('#autoApplyHubs');
    if (autoApplyCheckbox && autoApplyCheckbox.checked) {
      const thresholdInput = this.controlPanel.querySelector('#hubThreshold');
      const threshold = parseInt(thresholdInput?.value || 8);
      const hubNodes = this.identifyHubNodes(threshold);
      console.log(`[RegionGraphUI] Auto-applied hub detection: ${hubNodes.length} hubs found with threshold ${threshold}`);
    }
  }

  onStateUpdate(data) {
    if (!this.cy) return;
    
    const snapshot = data.snapshot;
    if (!snapshot) return;

    const staticData = stateManager.getStaticData();
    if (!staticData) return;

    // Create snapshot interface for rule evaluation
    const snapshotInterface = createStateSnapshotInterface(snapshot, staticData);
    if (!snapshotInterface) return;

    // Update node colors based on region accessibility and location status
    this.cy.nodes().forEach(node => {
      const regionName = node.id();
      const regionData = staticData.regions[regionName];
      
      // Skip player node
      if (node.hasClass('player')) {
        return;
      }
      
      const isReachable = snapshot.regionReachability?.[regionName] === true ||
                         snapshot.regionReachability?.[regionName] === 'reachable' ||
                         snapshot.regionReachability?.[regionName] === 'checked';
      const isVisited = snapshot.visitedRegions && 
                       snapshot.visitedRegions.includes(regionName);
      
      // Recalculate location counts for updated state
      const locationCounts = this.calculateLocationCounts(regionName, regionData);
      
      // Update node label with new counts
      const regionLabel = regionName.replace(/_/g, ' ');
      const countLabel = `${locationCounts.checked}, ${locationCounts.accessible}, ${locationCounts.inaccessible} / ${locationCounts.total}`;
      const fullLabel = `${regionLabel}\n${countLabel}`;
      node.data('label', fullLabel);
      node.data('locationCounts', locationCounts);
      
      // Clear all classes
      node.removeClass('accessible inaccessible completed all-accessible mixed-locations all-inaccessible');
      
      // Apply base accessibility class
      if (isReachable) {
        node.addClass('accessible');
      } else {
        node.addClass('inaccessible');
        return; // Don't apply interior colors for inaccessible regions
      }
      
      // Determine and apply interior color based on location status
      const interiorColorClass = this.determineNodeInteriorColor(locationCounts, isReachable);
      if (interiorColorClass) {
        node.addClass(interiorColorClass);
      }
    });

    // Update edge colors based on exit accessibility and directionality
    this.cy.edges().forEach(edge => {
      const sourceRegion = edge.source().id();
      const targetRegion = edge.target().id();
      const edgeData = edge.data();
      const isBidirectional = edgeData.isBidirectional;
      const forwardExitRule = edgeData.forwardExitRule;
      const reverseExitRule = edgeData.reverseExitRule;
      
      // Check if regions are reachable
      const sourceReachable = snapshot.regionReachability?.[sourceRegion] === true ||
                             snapshot.regionReachability?.[sourceRegion] === 'reachable' ||
                             snapshot.regionReachability?.[sourceRegion] === 'checked';

      const targetReachable = snapshot.regionReachability?.[targetRegion] === true ||
                             snapshot.regionReachability?.[targetRegion] === 'reachable' ||
                             snapshot.regionReachability?.[targetRegion] === 'checked';
      
      // Evaluate exit accessibility for both directions
      let forwardAccessible = true;
      let reverseAccessible = true;
      
      if (forwardExitRule) {
        try {
          forwardAccessible = evaluateRule(forwardExitRule, snapshotInterface);
        } catch (e) {
          console.warn(`[RegionGraphUI] Error evaluating forward exit rule for edge ${edge.id()}:`, e);
          forwardAccessible = false;
        }
      }
      
      if (reverseExitRule && isBidirectional) {
        try {
          reverseAccessible = evaluateRule(reverseExitRule, snapshotInterface);
        } catch (e) {
          console.warn(`[RegionGraphUI] Error evaluating reverse exit rule for edge ${edge.id()}:`, e);
          reverseAccessible = false;
        }
      }
      
      // Clear all classes
      edge.removeClass('accessible inaccessible bidirectional');
      
      // Add bidirectional class if applicable
      if (isBidirectional) {
        edge.addClass('bidirectional');
      }
      
      // Determine edge state based on accessibility
      // For bidirectional edges, consider both directions
      let isTraversable;
      if (isBidirectional) {
        // Bidirectional: accessible if either direction is traversable
        const forwardTraversable = sourceReachable && forwardAccessible;
        const reverseTraversable = targetReachable && reverseAccessible;
        isTraversable = forwardTraversable || reverseTraversable;
      } else {
        // Unidirectional: only forward direction matters
        isTraversable = sourceReachable && forwardAccessible;
      }
      
      if (isTraversable) {
        edge.addClass('accessible');
      } else {
        edge.addClass('inaccessible');
      }
    });
  }

  highlightCurrentRegion(regionName) {
    if (!this.cy) return;
    
    this.cy.nodes().removeClass('current');
    
    const node = this.cy.getElementById(regionName);
    if (node && node.length > 0) {
      node.addClass('current');
    }
  }

  onPathUpdate(data) {
    if (!data || !data.path) return;
    
    console.log(`[RegionGraphUI] Path updated with ${data.path.length} regions`);
    
    // Store the path data
    this.currentPath = data.path;
    this.regionPathCounts = data.regionCounts || new Map();
    
    // Update node labels to include path counts
    if (this.cy) {
      this.cy.nodes().forEach(node => {
        const regionName = node.id();
        const count = this.regionPathCounts.get(regionName) || 0;
        
        // Update the label to include count if region is in path
        if (count > 0) {
          node.data('label', `${regionName} (${count})`);
          node.addClass('in-path');
          
          // Add different classes based on count for visual distinction
          if (count === 1) {
            node.removeClass('path-multiple');
            node.addClass('path-single');
          } else {
            node.removeClass('path-single');
            node.addClass('path-multiple');
          }
        } else {
          node.data('label', regionName);
          node.removeClass('in-path path-single path-multiple');
        }
      });
      
      // Highlight edges in the path
      this.highlightPathEdges();
    }
  }
  
  highlightPathEdges() {
    if (!this.cy || !this.currentPath || this.currentPath.length < 2) return;
    
    // Remove existing path highlighting from edges
    this.cy.edges().removeClass('in-path');
    
    // Highlight edges between consecutive regions in the path
    for (let i = 0; i < this.currentPath.length - 1; i++) {
      const source = this.currentPath[i].region;
      const target = this.currentPath[i + 1].region;
      
      // Find edge between source and target (consider both directions)
      const edge = this.cy.edges(`[source="${source}"][target="${target}"], [source="${target}"][target="${source}"]`);
      if (edge && edge.length > 0) {
        edge.addClass('in-path');
      }
    }
  }

  updatePlayerLocation(regionName) {
    if (!this.cy) return;
    
    console.log(`[RegionGraphUI] Updating player location to: ${regionName}`);
    
    // Remove existing player node
    this.cy.remove('#player');
    
    // Find the target region node
    const regionNode = this.cy.getElementById(regionName);
    if (!regionNode || regionNode.length === 0) {
      console.warn(`[RegionGraphUI] Region node not found: ${regionName}`);
      return;
    }
    
    // Get the position of the region node
    const regionPos = regionNode.position();
    
    // Add player node at the region's position with a slight offset
    this.cy.add({
      data: {
        id: 'player',
        label: 'Player'
      },
      position: {
        x: regionPos.x + 30,
        y: regionPos.y - 30
      },
      classes: 'player'
    });
    
    // Also highlight the current region
    this.highlightCurrentRegion(regionName);
  }

  getCurrentPlayerLocation() {
    try {
      const playerState = getPlayerStateSingleton();
      return playerState ? playerState.getCurrentRegion() : null;
    } catch (error) {
      console.warn('[RegionGraphUI] Error getting player location:', error);
      return null;
    }
  }

  attemptMovePlayerOneStepToRegion(targetRegion) {
    const currentPlayerRegion = this.getCurrentPlayerLocation();
    
    if (!currentPlayerRegion) {
      console.warn(`[RegionGraphUI] Cannot determine current player location`);
      return;
    }

    if (currentPlayerRegion === targetRegion) {
      console.log(`[RegionGraphUI] Player is already in target region: ${targetRegion}`);
      return;
    }

    // Find path to target region
    console.log(`[RegionGraphUI] Finding path from ${currentPlayerRegion} to ${targetRegion}`);
    const path = this.pathFinder.findPath(currentPlayerRegion, targetRegion);
    
    if (!path || path.length === 0) {
      console.warn(`[RegionGraphUI] No accessible path found from ${currentPlayerRegion} to ${targetRegion}`);
      // Show a brief status message
      this.updateStatus(`No path to ${targetRegion}`);
      setTimeout(() => {
        if (this.cy) {
          const nodeCount = this.cy.nodes().length;
          const edgeCount = this.cy.edges().length;
          this.updateStatus(`Loaded ${nodeCount} regions, ${edgeCount} connections`);
        }
      }, 2000);
      return;
    }

    if (!path.nextExit) {
      console.warn(`[RegionGraphUI] Path found but no next exit determined`);
      return;
    }

    console.log(`[RegionGraphUI] Moving player via path:`, path.steps, `using exit: ${path.nextExit}`);
    
    // Execute the first step of the path using moduleDispatcher
    import('./index.js').then(({ moduleDispatcher }) => {
      if (moduleDispatcher) {
        moduleDispatcher.publish('user:regionMove', {
          sourceRegion: currentPlayerRegion,
          sourceUID: undefined, // No specific UID for graph-based moves
          targetRegion: path.steps[1], // Next region in path
          exitName: path.nextExit,
          updatePath: false,
          source: 'regionGraph-oneStep'
        }, 'bottom');
        console.log(`[RegionGraphUI] Published user:regionMove via dispatcher from ${currentPlayerRegion} to ${path.steps[1]}`);
      } else {
        console.warn('[RegionGraphUI] moduleDispatcher not available for publishing user:regionMove');
      }
    });
    
    // Show path info in status
    if (path.length === 1) {
      this.updateStatus(`Moving to ${targetRegion}`);
    } else {
      this.updateStatus(`Moving to ${targetRegion} (${path.length} steps via ${path.steps[1]})`);
    }
  }

  attemptMovePlayerDirectlyToRegion(targetRegion) {
    const currentPlayerRegion = this.getCurrentPlayerLocation();
    
    if (!currentPlayerRegion) {
      console.warn(`[RegionGraphUI] Cannot determine current player location`);
      return;
    }

    if (currentPlayerRegion === targetRegion) {
      console.log(`[RegionGraphUI] Player is already in target region: ${targetRegion}`);
      return;
    }

    // Find path to target region
    console.log(`[RegionGraphUI] Finding direct path from ${currentPlayerRegion} to ${targetRegion}`);
    const path = this.pathFinder.findPath(currentPlayerRegion, targetRegion);
    
    if (!path || path.length === 0) {
      console.warn(`[RegionGraphUI] No accessible path found from ${currentPlayerRegion} to ${targetRegion}`);
      // Show a brief status message
      this.updateStatus(`No path to ${targetRegion}`);
      setTimeout(() => {
        if (this.cy) {
          const nodeCount = this.cy.nodes().length;
          const edgeCount = this.cy.edges().length;
          this.updateStatus(`Loaded ${nodeCount} regions, ${edgeCount} connections`);
        }
      }, 2000);
      return;
    }

    // For direct movement, we want the final step of the path
    const finalSourceRegion = path.steps[path.steps.length - 2]; // Second to last region
    
    // Get the adjacency map to find the final exit name
    const staticData = this.pathFinder.stateManager.getStaticData();
    const snapshot = this.pathFinder.stateManager.getLatestStateSnapshot();
    const snapshotInterface = createStateSnapshotInterface(snapshot, staticData);
    const adjacencyMap = this.pathFinder.buildAccessibilityMap(staticData, snapshot, snapshotInterface);
    
    const finalExitName = this.pathFinder.findExitBetweenRegions(
      finalSourceRegion, 
      targetRegion, 
      adjacencyMap
    );

    if (!finalExitName) {
      console.warn(`[RegionGraphUI] Could not determine final exit name for direct move`);
      return;
    }

    console.log(`[RegionGraphUI] Moving player directly to ${targetRegion} via final exit: ${finalExitName}`);
    
    // Execute the final step of the path directly
    import('./index.js').then(({ moduleDispatcher }) => {
      if (moduleDispatcher) {
        moduleDispatcher.publish('user:regionMove', {
          sourceRegion: finalSourceRegion,
          sourceUID: undefined, // No specific UID for graph-based moves
          targetRegion: targetRegion,
          exitName: finalExitName,
          updatePath: false,
          source: 'regionGraph-direct'
        }, 'bottom');
        console.log(`[RegionGraphUI] Published direct user:regionMove via dispatcher from ${finalSourceRegion} to ${targetRegion}`);
      } else {
        console.warn('[RegionGraphUI] moduleDispatcher not available for publishing user:regionMove');
      }
    });
    
    // Show path info in status
    if (path.length === 1) {
      this.updateStatus(`Moving directly to ${targetRegion}`);
    } else {
      this.updateStatus(`Moving directly to ${targetRegion} (skipping ${path.length - 1} steps)`);
    }
  }

  addToPath(targetRegion, moveOnlyOneStep = false) {
    // Get the current path from playerState
    const playerState = getPlayerStateSingleton();
    const currentPath = playerState.getPath();
    
    if (!currentPath || currentPath.length === 0) {
      console.warn(`[RegionGraphUI] No current path to add to`);
      this.updateStatus(`No existing path`);
      return;
    }
    
    // Start from the last region in the current path
    const startRegion = currentPath[currentPath.length - 1].region;
    
    if (startRegion === targetRegion) {
      console.log(`[RegionGraphUI] Target region ${targetRegion} is already at end of path`);
      return;
    }
    
    // Find path from current end to target
    console.log(`[RegionGraphUI] Finding path from ${startRegion} to ${targetRegion}`);
    const path = this.pathFinder.findPath(startRegion, targetRegion);
    
    if (!path || path.length === 0) {
      console.warn(`[RegionGraphUI] No accessible path found from ${startRegion} to ${targetRegion}`);
      this.updateStatus(`No path from ${startRegion} to ${targetRegion}`);
      return;
    }
    
    // Disable "Show All Regions" before executing moves
    this.setShowAllRegions(false);
    
    // Execute the path by sending user:regionMove events
    // Skip the first region in the path (it's our starting point)
    const stepsToExecute = moveOnlyOneStep ? [path.steps[1]] : path.steps.slice(1);
    
    console.log(`[RegionGraphUI] Adding to path: ${stepsToExecute.join(' → ')}`);
    
    // Build adjacency map for finding exits
    const staticData = stateManager.getStaticData();
    const snapshot = stateManager.getLatestStateSnapshot();
    const snapshotInterface = createStateSnapshotInterface(snapshot, staticData);
    const adjacencyMap = this.pathFinder.buildAccessibilityMap(staticData, snapshot, snapshotInterface);
    
    stepsToExecute.forEach((stepRegion, index) => {
      // Find the exit to use for this step
      const sourceRegion = index === 0 ? startRegion : stepsToExecute[index - 1];
      const exitName = this.pathFinder.findExitBetweenRegions(
        sourceRegion,
        stepRegion,
        adjacencyMap
      );
      
      // Manually update the path since we disabled automatic path updates
      playerState.updatePath(stepRegion, exitName, sourceRegion);
      
      // Import and use moduleDispatcher to send the event
      import('./index.js').then(({ moduleDispatcher }) => {
        if (moduleDispatcher) {
          moduleDispatcher.publish('user:regionMove', {
            sourceRegion: sourceRegion,
            targetRegion: stepRegion,
            exitName: exitName,
            updatePath: false,
            source: 'regionGraph-addToPath'
          }, 'bottom');
          console.log(`[RegionGraphUI] Published user:regionMove from ${sourceRegion} to ${stepRegion}`);
        }
      });
    });
    
    this.updateStatus(`Added ${stepsToExecute.length} region(s) to path`);
  }
  
  overwritePath(targetRegion, moveOnlyOneStep = false) {
    // First, set player to Menu and reset the path
    console.log(`[RegionGraphUI] Resetting player to Menu and clearing path`);
    const playerState = getPlayerStateSingleton();
    
    // Set current region to Menu first
    playerState.setCurrentRegion('Menu');
    
    // Then trim the path (this will reset path to just Menu)
    playerState.trimPath('Menu', 1);
    
    // Disable "Show All Regions" before executing moves
    this.setShowAllRegions(false);
    
    // Find path from Menu to target
    const startRegion = 'Menu';
    
    if (startRegion === targetRegion) {
      console.log(`[RegionGraphUI] Target region is Menu, path already reset`);
      return;
    }
    
    console.log(`[RegionGraphUI] Finding path from ${startRegion} to ${targetRegion}`);
    const path = this.pathFinder.findPath(startRegion, targetRegion);
    
    if (!path || path.length === 0) {
      console.warn(`[RegionGraphUI] No accessible path found from ${startRegion} to ${targetRegion}`);
      this.updateStatus(`No path from Menu to ${targetRegion}`);
      return;
    }
    
    // Execute the path by sending user:regionMove events
    // Skip the first region in the path (Menu)
    const stepsToExecute = moveOnlyOneStep ? [path.steps[1]] : path.steps.slice(1);
    
    console.log(`[RegionGraphUI] Creating new path: Menu → ${stepsToExecute.join(' → ')}`);
    
    // Build adjacency map for finding exits
    const staticData = stateManager.getStaticData();
    const snapshot = stateManager.getLatestStateSnapshot();
    const snapshotInterface = createStateSnapshotInterface(snapshot, staticData);
    const adjacencyMap = this.pathFinder.buildAccessibilityMap(staticData, snapshot, snapshotInterface);
    
    stepsToExecute.forEach((stepRegion, index) => {
      // Find the exit to use for this step
      const sourceRegion = index === 0 ? startRegion : stepsToExecute[index - 1];
      const exitName = this.pathFinder.findExitBetweenRegions(
        sourceRegion,
        stepRegion,
        adjacencyMap
      );
      
      // Manually update the path since we disabled automatic path updates
      playerState.updatePath(stepRegion, exitName, sourceRegion);
      
      // Import and use moduleDispatcher to send the event
      import('./index.js').then(({ moduleDispatcher }) => {
        if (moduleDispatcher) {
          moduleDispatcher.publish('user:regionMove', {
            sourceRegion: sourceRegion,
            targetRegion: stepRegion,
            exitName: exitName,
            updatePath: false,
            source: 'regionGraph-overwritePath'
          }, 'bottom');
          console.log(`[RegionGraphUI] Published user:regionMove from ${sourceRegion} to ${stepRegion}`);
        }
      });
    });
    
    this.updateStatus(`Created path: Menu → ${targetRegion} (${stepsToExecute.length} steps)`);
  }
  
  setShowAllRegions(enabled) {
    // Find the "Show All Regions" checkbox in the Regions panel and set its state
    const showAllCheckbox = document.querySelector('#show-all-regions');
    if (showAllCheckbox && showAllCheckbox.checked !== enabled) {
      showAllCheckbox.checked = enabled;
      // Trigger change event to update the regions display
      showAllCheckbox.dispatchEvent(new Event('change'));
      console.log(`[RegionGraphUI] Set "Show All Regions" to ${enabled}`);
    }
  }

  toggleControlPanel() {
    const controlsContent = this.controlPanel.querySelector('#controlsContent');
    const toggleButton = this.controlPanel.querySelector('#toggleControls');
    
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

  updateStatus(message) {
    if (this.statusBar) {
      this.statusBar.innerHTML = message;
    }
  }

  onPanelShow() {
    console.log('[RegionGraphUI] Panel shown, cy:', !!this.cy);
    if (this.cy) {
      this.cy.resize();
      this.cy.fit(30);
    } else {
      console.log('[RegionGraphUI] Panel shown but no Cytoscape instance, checking if libraries are loaded...');
      console.log('[RegionGraphUI] Library check - cytoscape:', !!window.cytoscape, 'coseBase:', !!window.coseBase, 'cytoscapeFcose:', !!window.cytoscapeFcose);
      // Try to initialize if libraries are now available but graph wasn't created yet
      if (window.cytoscape && window.coseBase && window.cytoscapeFcose) {
        console.log('[RegionGraphUI] Libraries are loaded, initializing now...');
        this.cytoscape = window.cytoscape;
        this.cytoscapeFcose = window.cytoscapeFcose;
        this.cytoscape.use(this.cytoscapeFcose(window.coseBase));
        this.initializeGraph();
      } else {
        console.log('[RegionGraphUI] Some libraries not loaded, waiting...');
      }
    }
  }

  onPanelResize() {
    if (this.cy) {
      this.cy.resize();
    }
  }

  destroy() {
    if (this.unsubscribeStateUpdate) {
      this.unsubscribeStateUpdate();
    }
    if (this.unsubscribeRegionChange) {
      this.unsubscribeRegionChange();
    }
    if (this.unsubscribePathUpdate) {
      this.unsubscribePathUpdate();
    }
    if (this.unsubscribeRulesLoaded) {
      this.unsubscribeRulesLoaded();
    }
    if (this.unsubscribeStateReady) {
      this.unsubscribeStateReady();
    }
    if (this.cy) {
      this.cy.destroy();
    }
  }
}