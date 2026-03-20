/**
 * CodeMirror 6 Imports
 *
 * Re-exports from the local bundled CodeMirror 6 library.
 */

export {
  // Core view
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,

  // Core state
  EditorState,
  Compartment,

  // JSON language support
  json,

  // Language features (folding)
  foldGutter,
  foldKeymap,
  foldAll,
  unfoldAll,
  foldCode,
  unfoldCode,
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,

  // Basic setup
  basicSetup,

  // Search
  searchKeymap,
  highlightSelectionMatches,

  // Theme
  oneDark,

  // Commands
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,

  // Autocomplete
  autocompletion,
  completionKeymap,
} from '../../libs/codemirror6/codemirror6-bundle.js';
