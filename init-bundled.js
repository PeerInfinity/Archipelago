// init-bundled.js - Entry point for bundled mode
// This file statically imports all modules so they get included in the bundle.
// The original init.js uses dynamic imports which don't work well with bundling.

// Import profiler first to capture page load timing
import { profiler, autoEnableFromConfig } from './modules/shared/profiler.js';

// Auto-enable profiling from URL param or localStorage
autoEnableFromConfig();

// Start page load timing immediately
profiler.start('pageLoad');
profiler.start('pageLoad > coreImports');

// Import logger first and make it globally available before other imports
import logger from './app/core/loggerService.js';

// Configure logger with basic settings early
logger.configure({
  defaultLevel: 'WARN',
  moduleLevels: {},
});

// Make logger globally available
window.logger = logger;

// Import core singletons/managers
import panelManagerInstance from './app/core/panelManager.js';
import eventBus from './app/core/eventBus.js';
import settingsManager from './app/core/settingsManager.js';
import { centralRegistry } from './app/core/centralRegistry.js';
import EventDispatcher from './app/core/eventDispatcher.js';

// Make eventBus and centralRegistry globally available
window.eventBus = eventBus;
window.centralRegistry = centralRegistry;

// Register frontend as publisher for events it publishes
centralRegistry.registerEventBusPublisher('core', 'app:fullModeDataLoadedFromStorage');
centralRegistry.registerEventBusPublisher('core', 'module:stateChanged');
centralRegistry.registerEventBusPublisher('core', 'module:loaded');
centralRegistry.registerEventBusPublisher('core', 'module:loadFailed');
centralRegistry.registerEventBusPublisher('core', 'app:modesJsonLoaded');
centralRegistry.registerEventBusPublisher('core', 'app:readyForUiDataLoad');
centralRegistry.registerEventBusPublisher('core', 'app:activeModeDetermined');
centralRegistry.registerEventBusPublisher('core', 'uiHostRegistry:hostStatusChanged');
centralRegistry.registerEventBusPublisher('core', 'ui:activatePanel');
centralRegistry.registerEventBusPublisher('core', 'settings:changed');
centralRegistry.registerEventBusPublisher('panelManager', 'ui:panelManuallyClosed');

// Import layout libraries
import { GoldenLayout } from './libs/golden-layout/js/esm/golden-layout.js';
import mobileLayoutManager from './app/core/mobileLayoutManager.js';

// Import the main initialization orchestrator
import { initializeApplication } from './app/initialization/index.js';

// Import file loading UI utilities
import { incrementFileCounter, addFileError } from './app/initialization/fileLoadingUI.js';

// ============================================================================
// STATIC MODULE IMPORTS - These get bundled instead of dynamically loaded
// ============================================================================
import * as modulesModule from './modules/modules/index.js';
import * as jsonModule from './modules/json/index.js';
import * as eventsModule from './modules/events/index.js';
import * as stateManagerModule from './modules/stateManager/index.js';
import * as clientModule from './modules/client/index.js';
import * as timerModule from './modules/timer/index.js';
import * as inventoryModule from './modules/inventory/index.js';
import * as editorCoreModule from './modules/editorCore/index.js';
import * as editorModule from './modules/editor/index.js';
import * as editorCodeMirror6Module from './modules/editorCodeMirror6/index.js';
import * as settingsModule from './modules/settings/index.js';
import * as optionsPanelModule from './modules/optionsPanel/index.js';
import * as commonUIModule from './modules/commonUI/index.js';
import * as locationsModule from './modules/locations/index.js';
import * as exitsModule from './modules/exits/index.js';
import * as pathAnalyzerModule from './modules/pathAnalyzer/index.js';
import * as pathAnalyzerPanelModule from './modules/pathAnalyzerPanel/index.js';
import * as regionsModule from './modules/regions/index.js';
import * as helpersModule from './modules/helpers/index.js';
import * as dungeonsModule from './modules/dungeons/index.js';
import * as regionGraphModule from './modules/regionGraph/index.js';
import * as discoveryModule from './modules/discovery/index.js';
import * as discoveryPanelModule from './modules/discoveryPanel/index.js';
import * as playerStateModule from './modules/playerState/index.js';
import * as playerStatePanelModule from './modules/playerStatePanel/index.js';
import * as loopsModule from './modules/loops/index.js';
import * as loopStatsModule from './modules/loopStats/index.js';
import * as loopsCostDebuggerModule from './modules/loopsCostDebugger/index.js';
import * as presetsModule from './modules/presets/index.js';
import * as spoilerTestModule from './modules/spoilerTest/index.js';
import * as sphereStateModule from './modules/sphereState/index.js';
import * as spoilerChecklistModule from './modules/spoilerChecklist/index.js';
import * as textAdventureModule from './modules/textAdventure/index.js';
import * as testsModule from './modules/tests/index.js';
import * as progressBarModule from './modules/progressBar/index.js';
import * as progressBarPanelModule from './modules/progressBarPanel/index.js';
import * as metaGameModule from './modules/metaGame/index.js';
import * as metaGamePanelModule from './modules/metaGamePanel/index.js';
import * as iframeAdapterModule from './modules/iframeAdapter/index.js';
import * as iframePanelModule from './modules/iframePanel/index.js';
import * as iframeManagerPanelModule from './modules/iframeManagerPanel/index.js';
import * as windowAdapterModule from './modules/windowAdapter/index.js';
import * as windowPanelModule from './modules/windowPanel/index.js';
import * as windowManagerPanelModule from './modules/windowManagerPanel/index.js';
import * as ruleConverterModule from './modules/ruleConverter/index.js';
import * as mazeGameDataPanelModule from './modules/mazeGameDataPanel/index.js';
import * as jtaGameDataPanelModule from './modules/jtaGameDataPanel/index.js';
import * as jtaCostDebuggerModule from './modules/jtaCostDebugger/index.js';
import * as proofQueueModule from './modules/proofQueue/index.js';
import * as proofGraphModule from './modules/proofGraph/index.js';
import * as jtaQueueEngineModule from './modules/jtaQueueEngine/index.js';
import * as jtaActionQueueModule from './modules/jtaActionQueue/index.js';

// ============================================================================
// STATIC TEST CASE IMPORTS - These get bundled and self-register on import
// ============================================================================
import './modules/tests/testCases/coreTests.js';
import './modules/tests/testCases/locationPanelTests.js';
import './modules/tests/testCases/exitPanelTests.js';
import './modules/tests/testCases/regionPanelTests.js';
import './modules/tests/testCases/regionGraphPanelTests.js';
import './modules/tests/testCases/loopsPanelTests.js';
import './modules/tests/testCases/eventsPanelTests.js';
import './modules/tests/testCases/pathAnalyzerTests.js';
import './modules/tests/testCases/settingsPanelTests.js';
import './modules/tests/testCases/JSONPanelTests.js';
import './modules/tests/testCases/progressBarTests.js';
import './modules/tests/testCases/metaGamePanelTests.js';
import './modules/tests/testCases/textAdventurePanelTests.js';
import './modules/tests/testCases/textAdventure-iframeTests.js';
import './modules/tests/testCases/textAdventure-windowTests.js';
import './modules/tests/testCases/iframe-baseTests.js';
import './modules/tests/testCases/window-baseTests.js';
import './modules/tests/testCases/timerTests.js';
import './modules/tests/testCases/multiclientTests.js';
import './modules/tests/testCases/spoilerTestPanelTests.js';

// Signal that test cases have been pre-imported
window.__BUNDLED_TEST_CASES__ = true;

// Map of pre-imported modules for the bundled loader
const BUNDLED_MODULES = {
  modules: modulesModule,
  json: jsonModule,
  events: eventsModule,
  stateManager: stateManagerModule,
  client: clientModule,
  timer: timerModule,
  inventory: inventoryModule,
  editorCore: editorCoreModule,
  editor: editorModule,
  editorCodeMirror6: editorCodeMirror6Module,
  settings: settingsModule,
  optionsPanel: optionsPanelModule,
  commonUI: commonUIModule,
  locations: locationsModule,
  exits: exitsModule,
  pathAnalyzer: pathAnalyzerModule,
  pathAnalyzerPanel: pathAnalyzerPanelModule,
  regions: regionsModule,
  helpers: helpersModule,
  dungeons: dungeonsModule,
  regionGraph: regionGraphModule,
  discovery: discoveryModule,
  discoveryPanel: discoveryPanelModule,
  playerState: playerStateModule,
  playerStatePanel: playerStatePanelModule,
  loops: loopsModule,
  loopStats: loopStatsModule,
  loopsCostDebugger: loopsCostDebuggerModule,
  presets: presetsModule,
  spoilerTest: spoilerTestModule,
  sphereState: sphereStateModule,
  spoilerChecklist: spoilerChecklistModule,
  textAdventure: textAdventureModule,
  tests: testsModule,
  progressBar: progressBarModule,
  progressBarPanel: progressBarPanelModule,
  metaGame: metaGameModule,
  metaGamePanel: metaGamePanelModule,
  iframeAdapter: iframeAdapterModule,
  iframePanel: iframePanelModule,
  iframeManagerPanel: iframeManagerPanelModule,
  windowAdapter: windowAdapterModule,
  windowPanel: windowPanelModule,
  windowManagerPanel: windowManagerPanelModule,
  ruleConverter: ruleConverterModule,
  mazeGameDataPanel: mazeGameDataPanelModule,
  jtaGameDataPanel: jtaGameDataPanelModule,
  jtaCostDebugger: jtaCostDebuggerModule,
  proofQueue: proofQueueModule,
  proofGraph: proofGraphModule,
  jtaQueueEngine: jtaQueueEngineModule,
  jtaActionQueue: jtaActionQueueModule,
};

// Make bundled modules available globally for the module loader
window.__BUNDLED_MODULES__ = BUNDLED_MODULES;

// End core imports timing
profiler.end('coreImports');

// Helper function for logging with fallback
function log(level, message, ...data) {
  const prefix = `[Init - ${level.toUpperCase()}]`;
  switch (level) {
    case 'error':
      console.error(prefix, message, ...data);
      break;
    case 'warn':
      console.warn(prefix, message, ...data);
      break;
    case 'info':
      console.info(prefix, message, ...data);
      break;
    case 'debug':
    case 'verbose':
      console.debug(prefix, message, ...data);
      break;
    default:
      console.log(prefix, message, ...data);
  }
}

/**
 * Fetches JSON from a URL and tracks file loading
 */
async function fetchJson(url, errorMessage) {
  const fileName = url.split('/').pop() || url;

  try {
    // Use cache: 'reload' to validate with server (allows 304 Not Modified)
    // Use cache: 'no-store' when ?nocache=1 is in URL (completely bypasses cache for testing)
    const noCache = new URLSearchParams(window.location.search).has('nocache');
    const response = await fetch(url, { cache: noCache ? 'no-store' : 'reload' });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    incrementFileCounter(fileName, logger);
    return result;
  } catch (error) {
    logger.error('init', `${errorMessage}: ${url}`, error);
    addFileError(fileName, logger);
    return null;
  }
}

// Start the initialization process
profiler.start('pageLoad > initializeApplication');
initializeApplication({
  logger,
  eventBus,
  settingsManager,
  centralRegistry,
  EventDispatcher,
  panelManagerInstance,
  mobileLayoutManager,
  GoldenLayout,
  fetchJson,
  log,
  profiler,
  bundledModules: BUNDLED_MODULES, // Pass pre-imported modules
}).then(() => {
  profiler.end('initializeApplication');
  profiler.end('pageLoad');
  if (profiler.enabled) {
    console.log(profiler.report());
  }
}).catch((error) => {
  console.error('[Init] CRITICAL: Application initialization failed:', error);
  log('error', 'Application initialization failed. Check console for details.', error);

  // Try to show error in loading screen
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'color: red; padding: 20px; text-align: center;';
    errorDiv.innerHTML = `
      <h2>Initialization Failed</h2>
      <p>${error.message || 'Unknown error'}</p>
      <p>Check the console for more details.</p>
    `;
    loadingScreen.appendChild(errorDiv);
  }
});
