/**
 * CodeMirror 6 Entry Point
 *
 * Re-exports all needed CodeMirror 6 modules for bundling.
 */

// Core view
export {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
} from '@codemirror/view';

// Core state
export { EditorState, Compartment } from '@codemirror/state';

// JSON language support
export { json } from '@codemirror/lang-json';

// Language features (folding)
export {
  foldGutter,
  foldKeymap,
  foldAll,
  unfoldAll,
  foldCode,
  unfoldCode,
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
} from '@codemirror/language';

// Basic setup
export { basicSetup } from 'codemirror';

// Search
export { searchKeymap, highlightSelectionMatches } from '@codemirror/search';

// Theme
export { oneDark } from '@codemirror/theme-one-dark';

// Commands
export {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';

// Autocomplete (optional)
export { autocompletion, completionKeymap } from '@codemirror/autocomplete';
