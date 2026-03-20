/**
 * Editor Configuration
 *
 * Default configuration for editor modules.
 * These settings can be overridden by individual editor implementations.
 */

export const defaultConfig = {
  // CodeMirror features (used by CodeMirror implementations)
  lineNumbers: true,
  syntaxHighlighting: true,
  folding: true,
  foldOnLoad: false, // Start with all sections collapsed
  bracketMatching: true,
  autoComplete: false, // Disabled by default for performance

  // Performance thresholds
  largeFileThreshold: 1024 * 1024, // 1 MB
  disableOnLargeFile: ['syntaxHighlighting', 'bracketMatching', 'autoComplete'],

  // UI options
  showSourceDropdown: true,
  showAutoUpdateCheckbox: true,
  showUpdateNowButton: true,
};

/**
 * Content source definitions
 */
export const defaultContentSources = {
  rules: {
    text: '{\n  "greeting": "Hello World from rules",\n  "value": 123\n}',
    loaded: false,
    name: 'Active Rules JSON',
  },
  localStorageMode: {
    text: '{\n  "message": "No LocalStorage data loaded yet."\n}',
    loaded: false,
    name: 'Loaded Mode Data',
  },
  dataForExport: {
    text: '{\n  "message": "No export data loaded yet."\n}',
    loaded: false,
    name: 'Data for Export',
  },
  metaGameJsFile: {
    text: '// No metaGame JavaScript file loaded yet',
    loaded: false,
    name: 'metaGame js file',
  },
  latestSnapshot: {
    text: '{\n  "message": "No snapshot data available yet."\n}',
    loaded: false,
    name: 'Latest Snapshot',
  },
  staticData: {
    text: '{\n  "message": "No static data available yet."\n}',
    loaded: false,
    name: 'Static Data',
  },
  commandQueue: {
    text: '{\n  "message": "No command queue data available yet."\n}',
    loaded: false,
    name: 'Command Queue Status',
  },
};

export default defaultConfig;
