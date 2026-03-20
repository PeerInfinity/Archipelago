# Editor CodeMirror6 Module

**Module ID:** `editorCodeMirror6`

**Purpose:** Provides a CodeMirror 6 based JSON editor panel with syntax highlighting, code folding, and bracket matching. Used for viewing and editing game rules and application data.

## Key Files

- `frontend/modules/editorCodeMirror6/index.js` - Module entry point and registration
- `frontend/modules/editorCodeMirror6/codeMirror6UI.js` - Editor UI component
- `frontend/modules/editorCodeMirror6/codemirror6Imports.js` - CodeMirror library imports

## Responsibilities

- **JSON Editing:** Full-featured JSON editor with syntax highlighting
- **Content Source Selection:** Dropdown to switch between different data sources
- **Auto-Update:** Optional automatic refresh of dynamic content
- **Code Folding:** Collapse/expand JSON structure sections
- **Apply Changes:** The green **Apply** button (or Ctrl+Enter) applies edits back to the running application. For `dataForExport` mode, this uses the shared `applyLoadedData()` utility from `frontend/utils/dataApplicator.js`, which handles rules, settings, layout (applied live), and registered module data.

## Events Published

| Event | Data | Description |
|-------|------|-------------|
| `files:jsonLoaded` | File data | Published when applying rules changes |
| `editor:metaGameConfigApply` | Configuration | Published when applying metaGame config |
| `editor:snapshotApply` | Snapshot data | Published when applying snapshot edits |

## Events Subscribed To

| Event | Handler |
|-------|---------|
| `app:readyForUiDataLoad` | Initializes editor when app is ready |

## Public Functions

This module does not register public functions. It is a UI panel component.

## Dependencies & Interactions

- **`editorCore`:** Uses `editorDataService` for content management
- **`dataApplicator`:** Uses the shared `applyLoadedData()` utility for applying export data
- **`settingsManager`:** Gets configuration settings
- **`eventBus`:** Subscribes to app ready events
- **CodeMirror 6:** External library for editor functionality

## CodeMirror Features

- **Syntax Highlighting:** JSON language support with color coding
- **Line Numbers:** Numbered lines with active line highlighting
- **Code Folding:** Fold gutter with collapse/expand all buttons
- **Bracket Matching:** Highlights matching brackets
- **Search:** Built-in search with keyboard shortcuts
- **History:** Undo/redo support
- **Theme:** oneDark theme for dark mode
- **Read-Only Mode:** Dynamic switching based on content source

## UI Controls

### Source Dropdown

Select content source to view/edit:
- Active Rules JSON
- Latest Snapshot
- Static Data
- Command Queue Status
- Loaded Mode Data
- Data for Export

### Action Buttons

- **Update Now:** Manually refresh content
- **Apply:** Apply edits to application (green button, when supported)
- **Fold All / Unfold All:** Control JSON structure visibility

### Auto-Update Checkbox

Enable/disable automatic content refresh for dynamic sources.

## Performance

- Performance thresholds for large files
- Efficient update mechanisms via Compartment reconfiguration
- Lazy initialization of CodeMirror instance
