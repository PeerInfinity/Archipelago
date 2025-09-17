/**
 * Module metadata definitions
 * This provides a centralized location for module information,
 * ensuring consistency across desktop and mobile layouts.
 *
 * LOAD ORDER / PRIORITY:
 * This metadata serves as a FALLBACK. The system looks for module info in this order:
 * 1. factoryDetails.moduleInfo (from central registry)
 * 2. factoryDetails.componentClass?.moduleInfo (attached to factory function)
 * 3. moduleInfoMap (stored when module is imported)
 * 4. importedModules.get(moduleId)?.moduleInfo (from imported module instance)
 * 5. THIS FILE (moduleMetadata) as the final fallback
 *
 * If module info is found from sources 1-4, those values take precedence.
 * However, if critical fields (title, icon) are missing from the actual module info,
 * this metadata fills in those gaps.
 *
 * This design ensures modules can define their own metadata (preferred),
 * but guarantees reliable fallbacks for mobile browsers where ES6 module
 * exports may not be accessible.
 */

export const moduleMetadata = {
  // Left column modules
  inventoryPanel: {
    title: 'Inventory',
    icon: '🎒',
    name: 'inventory',
    column: 1
  },
  jsonPanel: {
    title: 'JSON',
    icon: '📄',
    name: 'json',
    column: 1
  },
  modulesPanel: {
    title: 'Modules',
    icon: '📦',
    name: 'modules',
    column: 1
  },
  testsPanel: {
    title: 'Tests',
    icon: '✅',
    name: 'tests',
    column: 1
  },
  eventsPanel: {
    title: 'Events',
    icon: '📡',
    name: 'events',
    column: 1
  },

  // Middle column modules
  regionGraphPanel: {
    title: 'Region Graph',
    icon: '🌐',
    name: 'regionGraph',
    column: 2
  },
  clientPanel: {
    title: 'Console',
    icon: '💻',
    name: 'client',
    column: 2
  },
  timerPanel: {
    title: 'Timer Panel',
    icon: '⏱️',
    name: 'timerPanel',
    column: 2
  },
  pathAnalyzerPanel: {
    title: 'Path Analyzer',
    icon: '🛤️',
    name: 'pathAnalyzer',
    column: 2
  },
  presetsPanel: {
    title: 'Presets',
    icon: '⚙️',
    name: 'presets',
    column: 2
  },
  testSpoilersPanel: {
    title: 'Test Spoilers',
    icon: '🔍',
    name: 'testSpoilers',
    column: 2
  },
  editorPanel: {
    title: 'Editor',
    icon: '✏️',
    name: 'editor',
    column: 2
  },
  settingsPanel: {
    title: 'Settings',
    icon: '⚙️',
    name: 'settings',
    column: 2
  },
  playerStatePanel: {
    title: 'Player State',
    icon: '👤',
    name: 'playerState',
    column: 2
  },
  progressBarPanel: {
    title: 'Progress Bars',
    icon: '📊',
    name: 'progressBar',
    column: 2
  },
  metaGamePanel: {
    title: 'Meta Game',
    icon: '🎯',
    name: 'metaGame',
    column: 2
  },
  iframeManagerPanel: {
    title: 'Iframe Manager',
    icon: '🖼️',
    name: 'iframeManager',
    column: 2
  },
  windowManagerPanel: {
    title: 'Window Manager',
    icon: '🪟',
    name: 'windowManager',
    column: 2
  },

  // Right column modules
  regionsPanel: {
    title: 'Regions',
    icon: '🗺️',
    name: 'regions',
    column: 3
  },
  locationsPanel: {
    title: 'Locations',
    icon: '📍',
    name: 'locations',
    column: 3
  },
  exitsPanel: {
    title: 'Exits',
    icon: '🚪',
    name: 'exits',
    column: 3
  },
  dungeonsPanel: {
    title: 'Dungeons',
    icon: '🏰',
    name: 'dungeons',
    column: 3
  },
  loopsPanel: {
    title: 'Loops',
    icon: '🔄',
    name: 'loops',
    column: 3
  },
  textAdventurePanel: {
    title: 'Text Adventure',
    icon: '📖',
    name: 'textAdventure',
    column: 3
  },
  iframePanel: {
    title: 'Iframe Panel',
    icon: '🖼️',
    name: 'iframe',
    column: 3
  },
  windowPanel: {
    title: 'Window Panel',
    icon: '🪟',
    name: 'window',
    column: 3
  }
};

/**
 * Get module metadata with fallback
 * @param {string} componentType - The component type
 * @param {Object} existingInfo - Existing module info to merge with
 * @returns {Object} Complete module info
 */
export function getModuleMetadata(componentType, existingInfo = {}) {
  const metadata = moduleMetadata[componentType] || {};

  // Merge metadata with existing info, preferring existing values
  return {
    ...metadata,
    ...existingInfo,
    // Ensure critical fields are present
    title: existingInfo.title || metadata.title || componentType,
    icon: existingInfo.icon || metadata.icon,
    name: existingInfo.name || metadata.name || componentType
  };
}