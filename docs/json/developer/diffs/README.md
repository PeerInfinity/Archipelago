# Diff Files from Upstream

This directory contains diff files showing changes made to this repository compared to the upstream Archipelago repository at commit `886cc68051f23d6049f8d846379b193aa0415e24` (November 29, 2025, version 0.6.5-rc1).

## Available Diff Files

### 1. `core-files.diff` (151 lines)
Changes to the main Archipelago core files:
- **BaseClasses.py** - Core data structures and sphere logging modifications
- **Main.py** - Main generation logic, vanilla placement trigger, and workflow changes
- **settings.py** - Configuration settings

These are the most significant changes that affect core Archipelago functionality.

### 2. `config-files.diff` (123 lines)
Changes to configuration and repository setup files:
- **.gitattributes** - Git attribute configurations
- **.github/workflows/codeql-analysis.yml** - Code analysis workflow modifications
- **.gitignore** - Ignore patterns for project-specific files
- **ModuleUpdate.py** - Module update logic changes
- **pytest.ini** - Test configuration
- **requirements.txt** - Python dependency modifications

These files configure the development environment and CI/CD pipeline.

### 3. `world-init-files.diff` (435 lines)
Changes to world implementation initialization files:
- **worlds/alttp/__init__.py** - A Link to the Past
- **worlds/apsudoku/__init__.py** - AP Sudoku
- **worlds/dkc3/__init__.py** - Donkey Kong Country 3
- **worlds/ff1/__init__.py** - Final Fantasy I
- **worlds/lufia2ac/__init__.py** - Lufia II Ancient Cave
- **worlds/mmbn3/__init__.py** - Mega Man Battle Network 3
- **worlds/oot/__init__.py** - Ocarina of Time
- **worlds/smw/__init__.py** - Super Mario World
- **worlds/soe/__init__.py** - Secret of Evermore
- **worlds/tloz/__init__.py** - The Legend of Zelda
- **worlds/yoshisisland/__init__.py** - Yoshi's Island

These modifications customize world implementations for specific features or fixes.

## How to Use These Diffs

### Viewing Changes
```bash
# View a diff file
less docs/json/developer/diffs/core-files.diff

# Or with syntax highlighting
git diff --no-index /dev/null docs/json/developer/diffs/core-files.diff
```

### Applying Changes
To apply these changes to a fresh upstream checkout:
```bash
# From repository root
git apply docs/json/developer/diffs/core-files.diff
git apply docs/json/developer/diffs/config-files.diff
git apply docs/json/developer/diffs/world-init-files.diff
```

### Reviewing Specific Files
To see changes for a specific file:
```bash
# Example: View just BaseClasses.py changes
grep -A 999999 "diff --git a/BaseClasses.py" docs/json/developer/diffs/core-files.diff | \
  grep -B 999999 "^diff --git" | head -n -1
```

## Notes

- These diffs were generated on 2025-11-29 against upstream commit `886cc68051f23d6049f8d846379b193aa0415e24`
- Total lines changed across all diffs: 709 lines (151 + 123 + 435)
- These diffs only include modifications to existing files that also exist in upstream
- New files and new directories are not included in these diffs
- For a complete list of all changes, see [repository-changes.md](./repository-changes.md)

## When to Use These Diffs

**Contributing to upstream Archipelago or maintaining your own clean fork:** Fork the [main ArchipelagoMW repository](https://github.com/ArchipelagoMW/Archipelago), copy the new directories from this repository, and apply these diffs.

**Contributing to this project (Archipelago-CC):** You don't need these diffs. Just clone or fork normally. The commit history contains large files which will increase clone size, but won't affect your work.

## Diff Generation Command

These diffs were created using:
```bash
git diff 886cc68051f23d6049f8d846379b193aa0415e24 HEAD -- [files...] > [output.diff]
```

## Related Documentation

- **[repository-changes.md](./repository-changes.md)** - Complete overview of all changes from upstream
