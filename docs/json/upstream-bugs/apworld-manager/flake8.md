# APWorld Manager: flake8 F821 errors

## Source

- **Package**: `worlds/apworld_manager/`
- **Upstream**: [silasary/Archipelago](https://github.com/silasary/Archipelago) releases
- **Version affected**: v0.0.22 (and earlier)
- **File**: `md_app.py`

## Issue

`md_app.py` references Kivy classes (`TabbedPanel`, `TabbedPanelItem`, `App`, `RecycleView`) without importing them. These are conditionally available at runtime when Kivy is installed, but flake8 reports them as undefined names:

```
worlds/apworld_manager/md_app.py:89:34: F821 undefined name 'TabbedPanel'
worlds/apworld_manager/md_app.py:95:26: F821 undefined name 'TabbedPanelItem'
worlds/apworld_manager/md_app.py:124:32: F821 undefined name 'App'
worlds/apworld_manager/md_app.py:135:14: F821 undefined name 'RecycleView'
worlds/apworld_manager/md_app.py:140:23: F821 undefined name 'RecycleView'
```

## Impact

None for CI. `apworld_manager` is in `.gitignore` so it is never included in commits or diffs. The `analyze-modified-files` workflow only checks files present in the diff.

## Fix

Upstream would need to add the missing imports or use `# noqa: F821` annotations. Not worth patching locally since the file is overwritten on updates.
