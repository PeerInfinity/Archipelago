# Repository Changes from Upstream

This document tracks the differences between this repository and the upstream Archipelago repository.

**Upstream commit:** `16d5b453a79c7ef869e20c1e27b3cf4192b037b3` (Core: require setuptools>=75 #5346)
**Upstream date:** August 19, 2025 17:35:50 UTC
**Upstream version:** 0.6.4
**Last updated:** 2025-11-13

## Summary

- **Modified files:** 21
- **New top-level directories:** 11
- **New files in existing directories:** 4
- **Total new files:** 1,046
- **Total changes:** 1,068

**For detailed line-by-line changes:** See the **[Diff Files README](./README.md)** for complete diff outputs of all modifications.

---

## New Top-Level Directories

The following directories are new in this repository and did not exist in the upstream commit:

1. `CC` - Claude Code scripts and utilities
2. `apworlds` - AP world files
3. `docs/json` - JSON documentation system
4. `exporter` - Export functionality
5. `frontend` - Frontend application
6. `scripts` - Additional scripts
7. `tests` - Test files
8. `worlds/bakingadventure` - Baking Adventure world
9. `worlds/codingadventure` - Coding Adventure world
10. `worlds/mathadventure` - Math Adventure world
11. `worlds/metamath` - Metamath world

---

## New Files in Existing Directories

These files were added to directories that already existed in the upstream commit:

```
.github/workflows/deploy-gh-pages.yml
.github/workflows/test-individual.yml
.github/workflows/test-templates.yml
```

Note: `worlds/alttp/VanillaPlacement.py` was originally created as a new file but has been moved to `scripts/vanilla-alttp/VanillaPlacement.py` for organizational purposes. It must be moved back to `worlds/alttp/` to function.

---

## Modified Files

The following 21 files have been modified from the upstream version:

```
.gitattributes
.github/workflows/codeql-analysis.yml
.gitignore
BaseClasses.py
Main.py
ModuleUpdate.py
README.md
pytest.ini
requirements.txt
settings.py
worlds/alttp/__init__.py
worlds/apsudoku/__init__.py
worlds/dkc3/__init__.py
worlds/ff1/__init__.py
worlds/lufia2ac/__init__.py
worlds/mmbn3/__init__.py
worlds/oot/__init__.py
worlds/smw/__init__.py
worlds/soe/__init__.py
worlds/tloz/__init__.py
worlds/yoshisisland/__init__.py
```

---

## Key Modifications

### Core Files
- **BaseClasses.py** - Modified for JSON export functionality and sphere logging
- **Main.py** - Enhanced with additional features and vanilla placement trigger
- **ModuleUpdate.py** - Removed pkg_resources deprecation warning suppression
- **settings.py** - Configuration changes
- **requirements.txt** - Dependency updates

### World Implementations
Modified world implementations include:
- A Link to the Past (alttp)
- AP Sudoku (apsudoku)
- Donkey Kong Country 3 (dkc3)
- Final Fantasy I (ff1)
- Lufia II Ancient Cave (lufia2ac)
- Mega Man Battle Network 3 (mmbn3)
- Ocarina of Time (oot)
- Super Mario World (smw)
- Secret of Evermore (soe)
- The Legend of Zelda (tloz)
- Yoshi's Island (yoshisisland)

### Configuration Files
- **.gitignore** - Added patterns for project-specific files
- **.gitattributes** - Repository attribute configurations
- **pytest.ini** - Test configuration
- **README.md** - Documentation updates

### GitHub Workflows
- **codeql-analysis.yml** - Modified code analysis workflow
- **deploy-gh-pages.yml** - New deployment workflow
- **test-individual.yml** - Individual test workflow
- **test-templates.yml** - Template testing workflow

---

## Notes

- This repository extends the upstream Archipelago with custom functionality including:
  - JSON export capabilities
  - Frontend application
  - Game-specific exporters
  - Claude Code integration scripts
  - Additional world implementations (Adventure-themed games)
  - Enhanced documentation system

- The merge from upstream was performed on August 20, 2025, capturing the state of Archipelago version 0.6.4

- Most changes are additions rather than modifications, with only 21 files modified from upstream

- The majority of the 1,046 new files are contained within the new directory structures (CC, frontend, exporter, docs/json, etc.)

---

**Generated:** 2025-11-13
**Base commit:** 16d5b453a79c7ef869e20c1e27b3cf4192b037b3
**Merge commit:** a675f1d97b98b6241061477a4bbe7250bea609e6
