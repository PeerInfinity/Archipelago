import eventBus from '../../app/core/eventBus.js';
import settingsManager from '../../app/core/settingsManager.js';
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import { evaluateRule } from '../shared/ruleEngine.js';
import { createStateSnapshotInterface } from '../shared/stateInterface.js';
import { getPlayerStateSingleton } from '../playerState/singleton.js';
import { PathFinder } from './pathfinder.js';
import { RegionGraphLayoutEditor } from './regionGraphLayoutEditor.js';
import { GraphDataManager } from './graphDataManager.js';
import { GraphInteractionManager } from './graphInteractionManager.js';
import { NavigationManager } from './navigationManager.js';
import { LayoutControlsManager } from './layoutControlsManager.js';
import { createUniversalLogger } from '../../app/core/universalLogger.js';

const logger = createUniversalLogger('regionGraph');

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
    this.dataManager = new GraphDataManager(this);
    this.interactionManager = new GraphInteractionManager(this);
    this.navigationManager = new NavigationManager(this);
    this.layoutControlsManager = new LayoutControlsManager(this);
    this.currentPath = [];
    this.regionPathCounts = new Map();
    this.layoutEditor = null;
    
    // Zoom-based visibility configuration
    this.zoomLevels = {
      hideAllLabels: 0.3,
      showRegionNames: 0.5,
      showRegionCounts: 0.8,
      showRegionEdgeLabels: 1.0,
      showLocationNodes: 1.5,
      showLocationLabels: 2.0
    };
    this.currentZoomLevel = 1.0;
    this.locationsVisible = false;
    this.locationsManuallyHidden = false;
    this.locationsManuallyShown = false;

    // Display settings
    this.showName = true;
    this.showLabel1 = false;
    this.showLabel2 = false;
    
    this.rootElement = document.createElement('div');
    this.rootElement.classList.add('region-graph-panel-container', 'panel-container');
    this.rootElement.style.width = '100%';
    this.rootElement.style.height = '100%';
    this.rootElement.style.position = 'relative';
    
    this.statusBar = document.createElement('div');
    this.statusBar.style.position = 'absolute';
    this.statusBar.style.bottom = '5px';
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
    this.controlPanel.style.left = '5px';
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
      logger.info('Received app:readyForUiDataLoad, starting initialization');
      this.loadCytoscape();
      eventBus.unsubscribe('app:readyForUiDataLoad', readyHandler);
    };
    eventBus.subscribe('app:readyForUiDataLoad', readyHandler, 'regionGraph');
    
    logger.debug('Constructor complete, waiting for app:readyForUiDataLoad event');
  }

  getRootElement() {
    return this.rootElement;
  }

  async loadDisplaySettings() {
    try {
      this.showName = await settingsManager.getSetting('moduleSettings.regionGraph.showName', true);
      this.showLabel1 = await settingsManager.getSetting('moduleSettings.regionGraph.showLabel1', false);
      this.showLabel2 = await settingsManager.getSetting('moduleSettings.regionGraph.showLabel2', false);
      logger.debug(`Loaded display settings: showName=${this.showName}, showLabel1=${this.showLabel1}, showLabel2=${this.showLabel2}`);
    } catch (error) {
      logger.error('Failed to load display settings:', error);
      this.showName = true;
      this.showLabel1 = false;
      this.showLabel2 = false;
    }
  }

  getRegionDisplayText(regionData, regionName) {
    const parts = [];
    const name = regionName || (typeof regionData === 'string' ? regionData : regionData?.name);

    if (this.showName && name) {
      parts.push(name.replace(/_/g, ' '));
    }

    if (this.showLabel1 && regionData?.label1) {
      parts.push(regionData.label1);
    }

    if (this.showLabel2 && regionData?.label2) {
      parts.push(regionData.label2);
    }

    // If nothing is enabled or no data available, default to name
    if (parts.length === 0 && name) {
      parts.push(name.replace(/_/g, ' '));
    }

    return parts.join('\n');
  }

  getLocationDisplayText(locationData) {
    const parts = [];

    if (this.showName && locationData?.name) {
      parts.push(locationData.name);
    }

    if (this.showLabel1 && locationData?.label1) {
      parts.push(locationData.label1);
    }

    if (this.showLabel2 && locationData?.label2) {
      parts.push(locationData.label2);
    }

    // If nothing is enabled or no data available, default to name
    if (parts.length === 0 && locationData?.name) {
      parts.push(locationData.name);
    }

    return parts.join('\n');
  }

  loadCytoscape() {
    logger.debug('loadCytoscape called');
    logger.verbose('Checking libraries', { cytoscape: !!window.cytoscape, coseBase: !!window.coseBase, cytoscapeFcose: !!window.cytoscapeFcose });
    
    if (window.cytoscape && window.coseBase && window.cytoscapeFcose) {
      logger.debug('All libraries already loaded, initializing graph');
      this.cytoscape = window.cytoscape;
      this.cytoscapeFcose = window.cytoscapeFcose;
      this.cytoscape.use(this.cytoscapeFcose(window.coseBase));
      this.initializeGraph();
    } else {
      logger.debug('Loading libraries dynamically');
      // Load Cytoscape.js first
      const script1 = document.createElement('script');
      script1.src = './libs/cytoscape/cytoscape.min.js';
      script1.onerror = (error) => {
        logger.error('Error loading cytoscape.min.js:', error);
        this.updateStatus('Error loading Cytoscape library');
      };
      script1.onload = () => {
        logger.debug('Cytoscape.js loaded');
        this.cytoscape = window.cytoscape;
        
        // Load layout-base dependency
        const script2 = document.createElement('script');
        script2.src = './libs/cytoscape/layout-base.js';
        script2.onload = () => {
          logger.debug('layout-base.js loaded');
          // Load cose-base dependency  
          const script3 = document.createElement('script');
          script3.src = './libs/cytoscape/cose-base.js';
          script3.onload = () => {
            logger.debug('cose-base.js loaded', { coseBase: !!window.coseBase });
            // Load FCose plugin
            const script4 = document.createElement('script');
            script4.src = './libs/cytoscape/cytoscape-fcose.js';
            script4.onload = () => {
              logger.debug('cytoscape-fcose.js loaded', { cytoscapeFcose: !!window.cytoscapeFcose });
              this.cytoscapeFcose = window.cytoscapeFcose;
              if (this.cytoscape && this.cytoscapeFcose && window.coseBase) {
                logger.debug('All libraries loaded, registering FCose plugin');
                try {
                  this.cytoscapeFcose(this.cytoscape);
                  logger.debug('FCose plugin registered successfully');
                } catch (error) {
                  logger.error('Error registering FCose plugin:', error);
                }
              } else {
                logger.warn('Missing libraries', { cytoscape: !!this.cytoscape, cytoscapeFcose: !!this.cytoscapeFcose, coseBase: !!window.coseBase });
              }
              logger.debug('Calling initializeGraph...');
              this.initializeGraph();
            };
            script4.onerror = (error) => logger.error('Error loading cytoscape-fcose.js:', error);
            document.head.appendChild(script4);
          };
          script3.onerror = (error) => logger.error('Error loading cose-base.js:', error);
          document.head.appendChild(script3);
        };
        script2.onerror = (error) => logger.error('Error loading layout-base.js:', error);
        document.head.appendChild(script2);
      };
      document.head.appendChild(script1);
    }
  }

  async initializeGraph() {
    logger.debug('initializeGraph called');

    // Load display settings
    await this.loadDisplaySettings();

    try {
      if (!this.cytoscape) {
        logger.error('Cytoscape not loaded');
        this.updateStatus('Error: Failed to load Cytoscape');
        return;
      }

    logger.debug('Creating Cytoscape instance');
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
            'opacity': 0.6
          }
        },
        {
          selector: 'edge[label]',
          style: {
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
        },
        // Location node styles
        {
          selector: '.location-node',
          style: {
            'width': 30,
            'height': 30,
            'label': 'data(label)',
            'color': '#fff',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '8px',
            'border-width': 2,
            'text-wrap': 'wrap',
            'text-max-width': '60px',
            'z-index': 15
          }
        },
        // Locations in accessible regions
        {
          selector: '.location-node.region-accessible.location-checked',
          style: {
            'background-color': '#000',
            'border-color': '#52b845'
          }
        },
        {
          selector: '.location-node.region-accessible.location-accessible',
          style: {
            'background-color': '#3a7a30',  // Darker shade of green
            'border-color': '#52b845'
          }
        },
        {
          selector: '.location-node.region-accessible.location-inaccessible',
          style: {
            'background-color': '#7a3030',  // Darker shade of red
            'border-color': '#a84444'
          }
        },
        // Locations in inaccessible regions
        {
          selector: '.location-node.region-inaccessible.location-accessible',
          style: {
            'background-color': '#8a701a',  // Darker shade of yellow
            'border-color': '#c9a227'
          }
        },
        {
          selector: '.location-node.region-inaccessible.location-inaccessible',
          style: {
            'background-color': '#5e5e5e',  // Darker shade of gray
            'border-color': '#8e8e8e',
            'opacity': 0.8
          }
        },
        {
          selector: '.location-node.region-inaccessible.location-checked',
          style: {
            'background-color': '#000',
            'border-color': '#a84444'
          }
        },
        // Region-to-location edge styles
        {
          selector: '.region-location-edge',
          style: {
            'width': 2,
            'line-color': '#666',
            'line-style': 'dotted',
            'opacity': 0.7,
            'target-arrow-shape': 'none',
            'z-index': 3,
            'label': ''  // Explicitly set no label for location edges
          }
        },
        {
          selector: 'edge.in-path.region-location-edge',
          style: {
            'line-color': '#6c5ce7',
            'line-style': 'dotted',
            'width': 4,
            'opacity': 1.0,
            'z-index': 10
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

    logger.debug('Cytoscape instance created successfully');
    this.setupControlPanel();
    this.interactionManager.setupEventHandlers();
    this.subscribeToEvents();
    this.interactionManager.setupZoomBasedVisibility(); // Setup zoom-based visibility
    this.graphInitialized = false; // Track if data has been loaded
    
    this.updateStatus('Graph initialized, waiting for data...');
    logger.info('Graph initialized, waiting for StateManager events');
    
    // Check if data is already available (in case we missed the initial events)
    this.checkAndLoadInitialData();
    } catch (error) {
      logger.error('Error in initializeGraph:', error);
      this.updateStatus('Error initializing graph: ' + error.message);
    }
  }

  setupControlPanel() {
    return this.layoutControlsManager.setupControlPanel();
  }


  setupEventHandlers() {
    return this.interactionManager.setupEventHandlers();
  }

  async loadCheckboxSettings() {
    return this.layoutControlsManager.loadCheckboxSettings();
  }
  
  async saveCheckboxSetting(checkboxId, settingKey, value) {
    return this.layoutControlsManager.saveCheckboxSetting(checkboxId, settingKey, value);
  }

  checkAndLoadInitialData() {
    logger.debug('Checking if initial data is already available...');
    
    // Load checkbox settings
    this.loadCheckboxSettings();
    
    // Small delay to ensure stateManager is fully initialized
    setTimeout(() => {
      try {
        const staticData = stateManager.getStaticData();
        const snapshot = stateManager.getLatestStateSnapshot();
        
        if (staticData && staticData.regions && snapshot && !this.graphInitialized) {
          logger.debug('Data already available, loading graph immediately');
          this.loadGraphData();
        } else {
          logger.debug('Data not yet available, will wait for events');
        }
      } catch (error) {
        logger.debug('Error checking initial data:', error);
        // Not a problem, will wait for events
      }
    }, 100);
  }
  
  subscribeToEvents() {
    logger.debug('Subscribing to events...');
    
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
        logger.info('Received stateManager:rulesLoaded, initializing graph data');
        if (this.cy) {
          this.loadGraphData();
        }
      }, 'regionGraph');
      
    // Subscribe to state ready event
    this.unsubscribeStateReady = eventBus.subscribe('stateManager:ready',
      () => {
        logger.info('Received stateManager:ready, ensuring graph is loaded');
        if (this.cy && !this.graphInitialized) {
          this.loadGraphData();
        }
      }, 'regionGraph');
  }

  async loadGraphData() {
    return this.dataManager.loadGraphData();
  }

  determineNodeInteriorColor(locationCounts, isReachable) {
    return this.dataManager.determineNodeInteriorColor(locationCounts, isReachable);
  }

  calculateLocationCounts(regionName, regionData) {
    return this.dataManager.calculateLocationCounts(regionName, regionData);
  }

  buildGraphFromRegions(regions, exits) {
    return this.dataManager.buildGraphFromRegions(regions, exits);
  }

  runLayout(force = false) {
    return this.layoutControlsManager.runLayout(force);
  }

  saveNodePositions() {
    return this.layoutControlsManager.saveNodePositions();
  }

  exportNodePositions() {
    return this.layoutControlsManager.exportNodePositions();
  }

  identifyHubNodes(threshold = 8) {
    return this.dataManager.identifyHubNodes(threshold);
  }

  autoApplyHubDetection() {
    return this.dataManager.autoApplyHubDetection();
  }

  onStateUpdate(data) {
    return this.dataManager.onStateUpdate(data);
  }

  highlightCurrentRegion(regionName) {
    return this.interactionManager.highlightCurrentRegion(regionName);
  }

  onPathUpdate(data) {
    return this.navigationManager.onPathUpdate(data);
  }
  
  highlightPathEdges() {
    return this.interactionManager.highlightPathEdges();
  }

  updatePlayerLocation(regionName) {
    return this.navigationManager.updatePlayerLocation(regionName);
  }

  getIncomingExitEdgePosition(targetRegionName, sourceRegionName, exitName) {
    return this.navigationManager.getIncomingExitEdgePosition(targetRegionName, sourceRegionName, exitName);
  }

  getCurrentPlayerLocation() {
    return this.navigationManager.getCurrentPlayerLocation();
  }

  attemptMovePlayerOneStepToRegion(targetRegion) {
    return this.navigationManager.attemptMovePlayerOneStepToRegion(targetRegion);
  }

  attemptMovePlayerDirectlyToRegion(targetRegion) {
    return this.navigationManager.attemptMovePlayerDirectlyToRegion(targetRegion);
  }

  addToPath(targetRegion, moveOnlyOneStep = false) {
    return this.navigationManager.addToPath(targetRegion, moveOnlyOneStep);
  }
  
  overwritePath(targetRegion, moveOnlyOneStep = false) {
    return this.navigationManager.overwritePath(targetRegion, moveOnlyOneStep);
  }
  
  setShowAllRegions(enabled) {
    return this.navigationManager.setShowAllRegions(enabled);
  }

  toggleControlPanel() {
    return this.layoutControlsManager.toggleControlPanel();
  }

  updateStatus(message) {
    if (this.statusBar) {
      this.statusBar.innerHTML = message;
    }
  }

  onPanelShow() {
    logger.debug('Panel shown', { hasCytoscape: !!this.cy });
    if (this.cy) {
      this.cy.resize();
      this.cy.fit(30);
    } else {
      logger.debug('Panel shown but no Cytoscape instance, checking if libraries are loaded...');
      logger.verbose('Library check', { cytoscape: !!window.cytoscape, coseBase: !!window.coseBase, cytoscapeFcose: !!window.cytoscapeFcose });
      // Try to initialize if libraries are now available but graph wasn't created yet
      if (window.cytoscape && window.coseBase && window.cytoscapeFcose) {
        logger.debug('Libraries are loaded, initializing now...');
        this.cytoscape = window.cytoscape;
        this.cytoscapeFcose = window.cytoscapeFcose;
        this.cytoscape.use(this.cytoscapeFcose(window.coseBase));
        this.initializeGraph();
      } else {
        logger.debug('Some libraries not loaded, waiting...');
      }
    }
  }

  onPanelResize() {
    if (this.cy) {
      this.cy.resize();
    }
  }

  // Zoom-based visibility methods
  setupZoomBasedVisibility() {
    return this.interactionManager.setupZoomBasedVisibility();
  }

  updateZoomBasedVisibility() {
    return this.interactionManager.updateZoomBasedVisibility();
  }

  updateLabelVisibility(zoom) {
    return this.interactionManager.updateLabelVisibility(zoom);
  }

  showAllLocationNodes() {
    return this.dataManager.showAllLocationNodes();
  }

  createLocationNodesForRegion(regionId) {
    return this.dataManager.createLocationNodesForRegion(regionId);
  }

  hideAllLocationNodes() {
    return this.dataManager.hideAllLocationNodes();
  }

  getLocationStatus(regionId, location) {
    return this.dataManager.getLocationStatus(regionId, location);
  }

  updateLocationNodePositions(regionId) {
    return this.dataManager.updateLocationNodePositions(regionId);
  }

  updateLocationNodeZOrder() {
    return this.dataManager.updateLocationNodeZOrder();
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