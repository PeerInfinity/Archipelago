# Diff Files from Upstream

This directory contains diff files showing changes made to this repository compared to the upstream Archipelago repository. The diffs are generated against upstream commit `fb45a2f8` (March 20, 2026, Archipelago 0.6.7).

## Available Diff Files

### 1. `diff-files/core-files.diff` (41 lines)
Changes to the main Archipelago core files:
- **settings.py** - `skip_required_files` global, `Group.__getattribute__` bypass for missing ROM paths, and early extraction from host.yaml `json_tools` section

This is the only core file modification. All other core files (`BaseClasses.py`, `Main.py`, `Utils.py`, `CommonClient.py`, `Launcher.py`) now match upstream exactly. JSON export and sphere logging are handled entirely by monkey patches at runtime.

### 2. `diff-files/config-files.diff` (413 lines)
Changes to configuration and repository setup files:
- **.gitattributes** - Git attribute configurations (merge strategy for .gitignore and README.md)
- **.github/workflows/codeql-analysis.yml** - Code analysis workflow modifications (explicit permissions for forks)
- **.gitignore** - Ignore patterns for project-specific files (extensive additions)
- **pytest.ini** - Added `test_json` to testpaths for fork-specific test modules
- **README.md** - Project documentation

These files configure the development environment and CI/CD pipeline. Note: `requirements.txt` matches upstream exactly.

### 3. `diff-files/alttp-bunny-rules.diff` (25 lines)
Bug fixes for ALttP's `set_bunny_rules()` function:
- **worlds/alttp/Rules.py** - Fixed Python late binding bug in superbunny path lambdas (pre-compute `path_rule` outside lambda, use default argument binding)

These bugs caused superbunny access rules to capture the wrong loop variable in glitch modes with entrance shuffle. For full details, see [ALttP Bunny Rules Bug Documentation](../../upstream-bugs/alttp/bunny-rules.md).

### 4. `diff-files/world-minor-fixes.diff` (44 lines)
Minor fixes to upstream world files that improve output consistency or fix UT tracking bugs:
- **worlds/lufia2ac/Options.py** - Changed `Boss.extra_options` from `set(random_groups)` to `list(random_groups)` so that `enumerate()` in `AssembleCustomizableChoices.__new__` assigns stable integer keys to the random group names. Without this, set iteration order is non-deterministic, causing the `boss` option's `name_lookup` to map different integers to different group names on each run, producing inconsistent JSON export output.
- **worlds/landstalker/Hints.py** - Changed `list(set(hint_texts))` to `sorted(set(hint_texts))` so that deduplication produces a stable ordering before the seeded `random.shuffle`. Without this, the set iteration order is non-deterministic, causing different hints to be assigned to different Foxy NPCs on each run even with the same seed.
- **worlds/shapez/__init__.py** - Removed forced `early_balancer_tunnel_and_trash = 0` override during UT regeneration. The override made UT more permissive than the server by removing balancer/tunnel/trash requirements from region transitions when the player's YAML had them set to `3_buildings` or `5_buildings`.

### 5. `diff-files/test-files.diff` (62 lines)
Changes to upstream test files for fork compatibility:
- **test/general/test_implemented.py** - Added "The Messenger" and "Overcooked! 2" to `excluded_games` in `test_slot_data` to prevent flaky fill failures caused by tight access rules at certain random seeds.
- **test/general/test_items.py** - Added `DLCQuest` coins to item exclusion dict; added logic to propagate exclusions from base games to WorldGen variant worlds (e.g., "A Link to the Past WorldGen" inherits "A Link to the Past" exclusions).
- **test/general/test_reachability.py** - Added `shapez` "Achievements needing a MAM" to unreachable regions; added same WorldGen variant propagation logic as test_items.py.

### 6. `diff-files/test-rule-builder-fork.diff` (635 lines)
Fork-only additions to the upstream Rule Builder test file:
- **test/general/test_rule_builder.py** - Added ~600 lines of evaluation tests for fork-only rule types: CountItem, CountFromList, CountGroup, Compare, Arithmetic, MinValue, MaxValue, WeightedSum, UniqueCount, OptionValue, EntranceAccessRuleCall, and ASTRule. These tests are appended after the existing upstream tests.

### 7. `diff-files/world-init-files.diff` (424 lines)
Changes to world implementation initialization files to support `skip_required_files` mode:
- **worlds/alttp/__init__.py** - A Link to the Past
- **worlds/dkc3/__init__.py** - Donkey Kong Country 3
- **worlds/ff1/__init__.py** - Final Fantasy I
- **worlds/lufia2ac/__init__.py** - Lufia II Ancient Cave
- **worlds/mmbn3/__init__.py** - Mega Man Battle Network 3
- **worlds/oot/__init__.py** - Ocarina of Time
- **worlds/smw/__init__.py** - Super Mario World
- **worlds/soe/__init__.py** - Secret of Evermore
- **worlds/tloz/__init__.py** - The Legend of Zelda
- **worlds/yoshisisland/__init__.py** - Yoshi's Island

These modifications allow world generation to proceed without ROM files when `skip_required_files` is enabled, enabling JSON export for games without requiring their base ROMs. The romless world patches import `check_rom_available` from `worlds.RomlessUtils` (a new file in this repository).

### 8. Rule Builder Modifications (documented separately)
Changes to the Rule Builder module (`rule_builder/`), which exists in upstream since PR #5048 was merged:
- **rule_builder/__init__.py** - Upstream: empty file (0 bytes). Fork: 165 lines with full API exports for all rule types, AST format support, pathfinding tools, and documentation
- **rule_builder/rules.py** - Upstream: 1,822 lines. Fork: 4,219 lines (+2,397 lines). Adds `RuleWorldMixin`, `RuleBuilderLogicMixin`, and 15 new rule types for AST format support

These changes are not included in the `.diff` files because of their size. Instead, they are documented in:
- **[fork-vs-upstream-rule-builder.md](./rule-builder/fork-vs-upstream-rule-builder.md)** - Detailed API comparison table
- **[rule-builder-modifications.md](./rule-builder/rule-builder-modifications.md)** - Overview of all modifications and new modules
- **[upstream-rule-builder-changes.md](./rule-builder/upstream-rule-builder-changes.md)** - Upstream Rule Builder evolution between fork base and current target

Note: `rule_builder/cached_world.py` and `rule_builder/options.py` are **unmodified** from upstream.

## How to Use These Diffs

### Viewing Changes
```bash
# View a diff file
less docs/json/developer/diffs/diff-files/core-files.diff

# Or with syntax highlighting
git diff --no-index /dev/null docs/json/developer/diffs/diff-files/core-files.diff
```

### Applying Changes
To apply these changes to a fresh upstream checkout:
```bash
# From repository root
git apply docs/json/developer/diffs/diff-files/core-files.diff
git apply docs/json/developer/diffs/diff-files/config-files.diff
git apply docs/json/developer/diffs/diff-files/world-minor-fixes.diff
git apply docs/json/developer/diffs/diff-files/world-init-files.diff
# Also copy worlds/RomlessUtils.py (needed by world-init-files patches)
```

## Notes

- These diffs are generated against upstream commit `fb45a2f8` (Archipelago 0.6.7)
- Total lines changed across diff files: 1,644 lines (41 + 413 + 25 + 44 + 62 + 635 + 424)
- Additionally, 2 files are modified but documented separately (rule_builder/__init__.py, rule_builder/rules.py)
- These diffs only include modifications to existing files that also exist in upstream
- New files and new directories are not included in these diffs
- For categorized file lists, see [file-lists/](./file-lists/):
  - [New Directories](./file-lists/new-directories.md) ([annotated](./file-lists/new-directories-annotated.md)) — directories in fork but not upstream
  - [New Files in Existing Dirs](./file-lists/new-files-in-existing-dirs.md) ([annotated](./file-lists/new-files-in-existing-dirs-annotated.md)) — files added to dirs that exist upstream
  - [Changed Files](./file-lists/changed-files.md) ([annotated](./file-lists/changed-files-annotated.md)) — files modified from upstream versions
  - [Deleted Files](./file-lists/deleted-files.md) ([annotated](./file-lists/deleted-files-annotated.md)) — files removed from upstream dirs
  - [Deleted Directories](./file-lists/deleted-directories.md) ([annotated](./file-lists/deleted-directories-annotated.md)) — directories entirely removed
- For a complete overview of all changes, see [repository-changes.md](./repository-changes.md)

## When to Use These Diffs

**Contributing to upstream Archipelago or maintaining your own clean fork:** Fork the [main ArchipelagoMW repository](https://github.com/ArchipelagoMW/Archipelago), copy the new directories from this repository, and apply these diffs.

**Contributing to this project (Archipelago-CC):** You don't need these diffs. Just clone or fork normally. The commit history contains large files which will increase clone size, but won't affect your work.

## Alternative: JSON Tools Installer APWorld

If you just want to **use** the JSON Tools with an existing Archipelago installation (rather than maintaining a fork), there's an easier option: the **JSON Tools Installer APWorld**.

### What It Does

The JSON Tools Installer is a packaged APWorld that automatically:
- Downloads the JSON Tools suite (exporter, rule builder, world generator, frontend)
- Patches your Archipelago core files with backup/restore capability
- Integrates with the Archipelago Launcher (adds GUI components)
- Detects your AP version and applies compatible patches

### Quick Start

1. Download [`json_tools_installer.apworld`](https://github.com/PeerInfinity/Archipelago-CC/raw/main/apworlds/json_tools_installer.apworld)
2. Place it in your Archipelago `custom_worlds/` directory (create it if it doesn't exist)
3. Restart the Launcher
4. Use the new "JSON Tools Installer" component in the Launcher

For full setup instructions (including cloning Archipelago from source), see the [JSON Tools Installer README](../../../../worlds/json_tools_installer/README.md).

Or via command line:
```bash
# Install stable version
python -m worlds.json_tools_installer install

# Install development version with all components
python -m worlds.json_tools_installer install --version dev --all

# Check status
python -m worlds.json_tools_installer status
```

### Components Available

| Component | Description | Default |
|-----------|-------------|---------|
| `exporter` | Export game logic to JSON format | Yes |
| `rule_builder` | Build access rules from JSON definitions | Yes |
| `world_generator` | Generate world packages from JSON rules | Yes |
| `frontend` | Web UI for viewing game logic (excludes presets) | Yes |
| `presets` | Pre-generated game data (~75MB, requires frontend) | No |
| `docs` | JSON Tools documentation | Yes |
| `scripts` | Utility scripts for testing and setup | Yes |
| `romless_patches` | Patched world files for generation without ROMs | Yes |

### Version Sources

- **Stable**: `PeerInfinity/Archipelago` @ `JSONExport` branch
- **Development**: `PeerInfinity/Archipelago-CC` @ `main` branch

### When to Use the Installer vs Diffs

| Use Case | Recommended Approach |
|----------|---------------------|
| End user wanting JSON export features | JSON Tools Installer |
| Maintaining your own fork of Archipelago | Apply diffs manually |
| Contributing to upstream Archipelago | Apply diffs manually |
| Development/testing on vanilla AP | JSON Tools Installer |
| CI/CD pipelines | Either (installer supports CLI) |

For full documentation, see [worlds/json_tools_installer/README.md](../../../../worlds/json_tools_installer/README.md).

## Generation Commands

### Diff Files

The `.diff` files in `diff-files/` were created using:
```bash
diff -u --label a/[file] --label b/[file] ~/CC/Archipelago-vanilla/[file] [file] > [output.diff]
```
Where `~/CC/Archipelago-vanilla/` is a clean clone of upstream at commit `fb45a2f8`. The `--label` flags produce clean `a/`/`b/` relative paths (standard git diff format) instead of absolute paths.

### File Lists

The file lists in `file-lists/` were generated using:
```bash
python scripts/docs/generate-file-diff-lists.py
```
This compares the current fork against the `upstream` remote's `main` branch using git diff. Run with `--help` for options.

## Related Documentation

- **[repository-changes.md](./repository-changes.md)** - Complete overview of all changes from upstream
- **[fuzzer-modifications.md](./fuzzer-modifications.md)** - Changes made to the Archipelago fuzzer
- **[universal-tracker-modifications.md](./universal-tracker-modifications.md)** - Changes made to Universal Tracker
- **[rule-builder-modifications.md](./rule-builder/rule-builder-modifications.md)** - Changes made to Rule Builder
- **[JSON Tools Installer](../../../../worlds/json_tools_installer/README.md)** - APWorld for automated installation on vanilla Archipelago
- **[Main README](../../../../README.md)** - Project overview and getting started guide
