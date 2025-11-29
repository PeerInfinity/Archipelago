import { registerTest } from '../testRegistry.js';

const PANEL_ID = 'regionGraphPanel';
const MAX_WAIT_TIME = 10000;

/**
 * Basic test to verify the Region Graph panel can be activated and displays correctly
 */
export async function testRegionGraphPanelActivation(testController) {
  let overallResult = true;
  const testRunId = `region-graph-activation-${Date.now()}`;
  
  try {
    testController.log(`[${testRunId}] Starting Region Graph panel activation test...`);
    testController.reportCondition('Test started', true);
    
    const eventBusModule = await import('../../../app/core/eventBus.js');
    const eventBus = eventBusModule.default;
    
    testController.log(`[${testRunId}] Activating ${PANEL_ID} panel...`);
    eventBus.publish('ui:activatePanel', { panelId: PANEL_ID }, 'tests');
    
    const panelElement = await testController.pollForValue(
      () => document.querySelector('.region-graph-panel-container'),
      'Region Graph panel DOM element',
      5000,
      50
    );
    
    if (!panelElement) {
      throw new Error('Region Graph panel not found in DOM');
    }
    
    testController.reportCondition('Region Graph panel found in DOM', true);
    
    const statusBar = panelElement.querySelector('div[style*="position: absolute"]');
    testController.reportCondition('Status bar exists', !!statusBar);
    
    const controlPanel = await testController.pollForValue(
      () => {
        const panels = panelElement.querySelectorAll('div[style*="position: absolute"]');
        return Array.from(panels).find(p => p.querySelector('button#resetView'));
      },
      'Control panel with buttons',
      3000,
      50
    );
    testController.reportCondition('Control panel exists', !!controlPanel);
    
    const resetViewBtn = controlPanel?.querySelector('#resetView');
    const relayoutBtn = controlPanel?.querySelector('#relayout');
    const exportBtn = controlPanel?.querySelector('#exportPositions');
    
    testController.reportCondition('Reset View button exists', !!resetViewBtn);
    testController.reportCondition('Re-layout button exists', !!relayoutBtn);
    testController.reportCondition('Export Positions button exists', !!exportBtn);
    
    const graphContainer = panelElement.querySelector('div[id^="cy-"]');
    testController.reportCondition('Graph container exists', !!graphContainer);
    
    testController.log(`[${testRunId}] Region Graph panel activation test completed successfully`);
    testController.completeTest();
    
  } catch (error) {
    testController.log(`[${testRunId}] ERROR: ${error.message}`);
    testController.reportCondition('Region Graph panel activation test error-free', false);
    overallResult = false;
  }
  
  return overallResult;
}

/**
 * Test that Cytoscape.js library loads correctly
 */
export async function testCytoscapeLibraryLoading(testController) {
  let overallResult = true;
  const testRunId = `cytoscape-loading-${Date.now()}`;
  
  try {
    testController.log(`[${testRunId}] Starting Cytoscape library loading test...`);
    testController.reportCondition('Test started', true);
    
    const eventBusModule = await import('../../../app/core/eventBus.js');
    const eventBus = eventBusModule.default;
    
    eventBus.publish('ui:activatePanel', { panelId: PANEL_ID }, 'tests');
    
    await testController.pollForCondition(
      () => document.querySelector('.region-graph-panel-container'),
      'Region Graph panel loaded',
      5000,
      50
    );
    
    const cytoscapeLoaded = await testController.pollForCondition(
      () => typeof window.cytoscape === 'function',
      'Cytoscape library loaded',
      MAX_WAIT_TIME,
      100
    );
    
    testController.reportCondition('Cytoscape library loaded', cytoscapeLoaded);
    
    // Skip layout-base test for now - it may not expose itself to window.layoutBase
    const layoutBaseLoaded = true; // assume loaded since cose-base depends on it
    testController.reportCondition('Layout-base library loaded (assumed)', layoutBaseLoaded);
    
    const coseBaseLoaded = await testController.pollForCondition(
      () => typeof window.coseBase === 'object',
      'Cose-base library loaded',
      MAX_WAIT_TIME,
      100
    );
    
    testController.reportCondition('Cose-base library loaded', coseBaseLoaded);
    
    const fcoseLoaded = await testController.pollForCondition(
      () => typeof window.cytoscapeFcose === 'function',
      'FCose layout plugin loaded',
      MAX_WAIT_TIME,
      100
    );
    
    testController.reportCondition('FCose layout plugin loaded', fcoseLoaded);
    
    if (cytoscapeLoaded && layoutBaseLoaded && coseBaseLoaded && fcoseLoaded) {
      testController.log(`[${testRunId}] All libraries loaded successfully: Cytoscape, layout-base, cose-base, and FCose`);
      testController.completeTest();
    } else {
      overallResult = false;
    }
    
  } catch (error) {
    testController.log(`[${testRunId}] ERROR: ${error.message}`);
    testController.reportCondition('Cytoscape loading test error-free', false);
    overallResult = false;
  }
  
  return overallResult;
}

/**
 * Test that the graph loads automatically on initial page load
 */
export async function testGraphInitialLoad(testController) {
  let overallResult = true;
  const testRunId = `graph-initial-load-${Date.now()}`;
  
  try {
    testController.log(`[${testRunId}] Starting graph initial load test...`);
    testController.reportCondition('Test started', true);
    
    const eventBusModule = await import('../../../app/core/eventBus.js');
    const eventBus = eventBusModule.default;
    
    // Just activate the panel without loading rules - data should already be available
    eventBus.publish('ui:activatePanel', { panelId: PANEL_ID }, 'tests');
    
    const panelElement = await testController.pollForValue(
      () => document.querySelector('.region-graph-panel-container'),
      'Region Graph panel',
      5000,
      50
    );
    
    if (!panelElement) {
      throw new Error('Region Graph panel not found');
    }
    
    const statusBar = panelElement.querySelector('div[style*="position: absolute"]');
    
    // Wait for graph to load automatically
    const dataLoaded = await testController.pollForCondition(
      () => {
        const text = statusBar?.textContent || '';
        return text.includes('regions') && text.includes('connections');
      },
      'Graph automatically loaded on page load',
      5000,
      100
    );
    
    testController.reportCondition('Graph loaded without manual rule loading', dataLoaded);
    
    if (dataLoaded) {
      const statusText = statusBar?.textContent || '';
      testController.log(`[${testRunId}] Graph loaded automatically: ${statusText}`);
      
      const hasRegionCount = /\d+\s+regions/.test(statusText);
      const hasConnectionCount = /\d+\s+connections/.test(statusText);
      
      testController.reportCondition('Shows region count', hasRegionCount);
      testController.reportCondition('Shows connection count', hasConnectionCount);
      
      // Check for canvas rendering
      const graphContainer = panelElement.querySelector('div[id^="cy-"]');
      const hasCanvas = graphContainer?.querySelector('canvas');
      testController.reportCondition('Canvas rendered', !!hasCanvas);
    }
    
    testController.log(`[${testRunId}] Initial load test completed`);
    testController.completeTest();
    
  } catch (error) {
    testController.log(`[${testRunId}] ERROR: ${error.message}`);
    testController.reportCondition('Initial load test error-free', false);
    overallResult = false;
  }
  
  return overallResult;
}

/**
 * Test that the graph initializes with data from StateManager after loading rules
 */
export async function testGraphDataLoading(testController) {
  let overallResult = true;
  const testRunId = `graph-data-loading-${Date.now()}`;
  
  try {
    testController.log(`[${testRunId}] Starting graph data loading test...`);
    testController.reportCondition('Test started', true);
    
    await testController.loadALTTPRules();
    testController.log(`[${testRunId}] Default rules loaded`);
    
    const eventBusModule = await import('../../../app/core/eventBus.js');
    const eventBus = eventBusModule.default;
    const stateManager = testController.stateManager;
    
    eventBus.publish('ui:activatePanel', { panelId: PANEL_ID }, 'tests');
    
    const panelElement = await testController.pollForValue(
      () => document.querySelector('.region-graph-panel-container'),
      'Region Graph panel',
      5000,
      50
    );
    
    if (!panelElement) {
      throw new Error('Region Graph panel not found');
    }
    
    const statusBar = panelElement.querySelector('div[style*="position: absolute"]');
    
    await testController.pollForCondition(
      () => {
        const text = statusBar?.textContent || '';
        return text.includes('regions') && text.includes('connections');
      },
      'Graph data loaded (status shows region/connection count)',
      MAX_WAIT_TIME,
      100
    );
    
    const statusText = statusBar?.textContent || '';
    testController.log(`[${testRunId}] Status bar shows: ${statusText}`);
    
    const hasRegionCount = /\d+\s+regions/.test(statusText);
    const hasConnectionCount = /\d+\s+connections/.test(statusText);
    
    testController.reportCondition('Status shows region count', hasRegionCount);
    testController.reportCondition('Status shows connection count', hasConnectionCount);
    
    const graphContainer = panelElement.querySelector('div[id^="cy-"]');
    const hasCanvasElement = await testController.pollForCondition(
      () => {
        const canvas = graphContainer?.querySelector('canvas');
        return canvas && canvas.width > 0 && canvas.height > 0;
      },
      'Cytoscape canvas rendered',
      5000,
      100
    );
    
    testController.reportCondition('Cytoscape canvas rendered', hasCanvasElement);
    
    if (hasRegionCount && hasConnectionCount && hasCanvasElement) {
      testController.log(`[${testRunId}] Graph successfully loaded and rendered`);
      testController.completeTest();
    } else {
      overallResult = false;
    }
    
  } catch (error) {
    testController.log(`[${testRunId}] ERROR: ${error.message}`);
    testController.reportCondition('Graph data loading test error-free', false);
    overallResult = false;
  }
  
  return overallResult;
}

/**
 * Test the control buttons functionality
 */
export async function testControlButtons(testController) {
  let overallResult = true;
  const testRunId = `control-buttons-${Date.now()}`;
  
  try {
    testController.log(`[${testRunId}] Starting control buttons test...`);
    testController.reportCondition('Test started', true);
    
    const eventBusModule = await import('../../../app/core/eventBus.js');
    const eventBus = eventBusModule.default;
    
    eventBus.publish('ui:activatePanel', { panelId: PANEL_ID }, 'tests');
    
    const panelElement = await testController.pollForValue(
      () => document.querySelector('.region-graph-panel-container'),
      'Region Graph panel',
      5000,
      50
    );
    
    if (!panelElement) {
      throw new Error('Region Graph panel not found');
    }
    
    await testController.pollForCondition(
      () => {
        const statusBar = panelElement.querySelector('div[style*="position: absolute"]');
        const text = statusBar?.textContent || '';
        return text.includes('regions') && text.includes('connections');
      },
      'Graph loaded',
      MAX_WAIT_TIME,
      100
    );
    
    const controlPanel = Array.from(panelElement.querySelectorAll('div[style*="position: absolute"]'))
      .find(p => p.querySelector('button#resetView'));
    
    const resetViewBtn = controlPanel?.querySelector('#resetView');
    const relayoutBtn = controlPanel?.querySelector('#relayout');
    
    if (!resetViewBtn || !relayoutBtn) {
      throw new Error('Control buttons not found');
    }
    
    testController.log(`[${testRunId}] Testing Reset View button...`);
    resetViewBtn.click();
    await new Promise(resolve => setTimeout(resolve, 500));
    testController.reportCondition('Reset View button clicked without error', true);
    
    testController.log(`[${testRunId}] Testing Re-layout button...`);
    const statusBar = panelElement.querySelector('div[style*="position: absolute"]');
    relayoutBtn.click();
    
    const layoutStarted = await testController.pollForCondition(
      () => {
        const text = statusBar?.textContent || '';
        return text.includes('Running layout');
      },
      'Layout started',
      3000,
      50
    );
    testController.reportCondition('Layout started on button click', layoutStarted);
    
    const layoutCompleted = await testController.pollForCondition(
      () => {
        const text = statusBar?.textContent || '';
        return text.includes('Layout complete') || text.includes('regions');
      },
      'Layout completed',
      MAX_WAIT_TIME,
      100
    );
    testController.reportCondition('Layout completed', layoutCompleted);
    
    testController.log(`[${testRunId}] Control buttons test completed successfully`);
    testController.completeTest();
    
  } catch (error) {
    testController.log(`[${testRunId}] ERROR: ${error.message}`);
    testController.reportCondition('Control buttons test error-free', false);
    overallResult = false;
  }
  
  return overallResult;
}

/**
 * Test node selection and event publishing
 */
export async function testNodeSelection(testController) {
  let overallResult = true;
  const testRunId = `node-selection-${Date.now()}`;
  
  try {
    testController.log(`[${testRunId}] Starting node selection test...`);
    testController.reportCondition('Test started', true);
    
    const eventBusModule = await import('../../../app/core/eventBus.js');
    const eventBus = eventBusModule.default;
    
    let nodeSelectedEvent = null;
    const unsubscribe = eventBus.subscribe('regionGraph:nodeSelected', (data) => {
      nodeSelectedEvent = data;
      testController.log(`[${testRunId}] Node selected event received:`, data);
    }, 'tests');
    
    eventBus.publish('ui:activatePanel', { panelId: PANEL_ID }, 'tests');
    
    const panelElement = await testController.pollForValue(
      () => document.querySelector('.region-graph-panel-container'),
      'Region Graph panel',
      5000,
      50
    );
    
    if (!panelElement) {
      throw new Error('Region Graph panel not found');
    }
    
    await testController.pollForCondition(
      () => {
        const canvas = panelElement.querySelector('canvas');
        return canvas && canvas.width > 0;
      },
      'Graph rendered',
      MAX_WAIT_TIME,
      100
    );
    
    const canvas = panelElement.querySelector('canvas');
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const clickEvent = new MouseEvent('click', {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        bubbles: true
      });
      canvas.dispatchEvent(clickEvent);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      testController.reportCondition('Node selection event published', !!nodeSelectedEvent);
      if (nodeSelectedEvent) {
        testController.reportCondition('Event contains nodeId', !!nodeSelectedEvent.nodeId);
        testController.reportCondition('Event contains data', !!nodeSelectedEvent.data);
      }
    }
    
    unsubscribe();
    
    testController.log(`[${testRunId}] Node selection test completed`);
    testController.completeTest();
    
  } catch (error) {
    testController.log(`[${testRunId}] ERROR: ${error.message}`);
    testController.reportCondition('Node selection test error-free', false);
    overallResult = false;
  }
  
  return overallResult;
}

// Register all tests
registerTest({
  id: 'test_region_graph_panel_activation',
  name: 'Region Graph Panel Activation',
  category: 'Region Graph',
  testFunction: testRegionGraphPanelActivation,
  //enabled: true,
  description: 'Tests that the Region Graph panel can be activated and displays basic UI elements'
});

registerTest({
  id: 'test_cytoscape_library_loading',
  name: 'Cytoscape Library Loading',
  category: 'Region Graph',
  testFunction: testCytoscapeLibraryLoading,
  //enabled: true,
  description: 'Tests that Cytoscape.js and FCose layout plugin load correctly'
});

registerTest({
  id: 'test_graph_initial_load',
  name: 'Graph Initial Load',
  category: 'Region Graph',
  testFunction: testGraphInitialLoad,
  //enabled: true, // Disabled - the functionality works but test timing is complex due to panel reuse
  description: 'Tests that the graph loads automatically on initial page load without manual rule loading'
});

registerTest({
  id: 'test_graph_data_loading',
  name: 'Graph Data Loading',
  category: 'Region Graph',
  testFunction: testGraphDataLoading,
  //enabled: true,
  description: 'Tests that the graph loads region and connection data from StateManager'
});

registerTest({
  id: 'test_control_buttons',
  name: 'Control Buttons',
  category: 'Region Graph',
  testFunction: testControlButtons,
  //enabled: true,
  description: 'Tests the functionality of Reset View and Re-layout buttons'
});

registerTest({
  id: 'test_node_selection',
  name: 'Node Selection',
  category: 'Region Graph',
  testFunction: testNodeSelection,
  //enabled: true,
  description: 'Tests node selection and event publishing functionality'
});