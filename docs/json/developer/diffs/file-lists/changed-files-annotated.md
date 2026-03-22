# Changed Files (Annotated)

Files modified from their upstream versions (commit `fb45a2f8`).

## Root Directory (5 files)

- `.gitattributes`

  Added `merge=ours` strategy for `.gitignore` and `README.md` to preserve fork versions during upstream merges.

  [Diff](../diff-files/config-files.diff)

- `.gitignore`

  Added patterns for fork-specific files: JSDoc output, frontend presets, test results, node_modules, worldgen output, and disabled worlds.

  [Diff](../diff-files/config-files.diff)

- `README.md`

  Replaced upstream README with fork-specific documentation describing the JSON Export Tools project and web client demo.

  [Diff](../diff-files/config-files.diff)

- `pytest.ini`

  Added `test_json` to pytest test discovery paths for fork-specific test modules.

- `settings.py`

  Added `skip_required_files` global, `Group.__getattribute__` bypass for missing ROM paths, and early extraction from host.yaml `json_tools` section.

  [Diff](../diff-files/core-files.diff) | [Skip Required Files Proposal](../../proposals/skip-required-files-proposal.md)

## `.github/workflows/` (1 files)

- `.github/workflows/codeql-analysis.yml`

  Added explicit `security-events`, `actions`, and `contents` permissions for safer fork operation.

  [Diff](../diff-files/config-files.diff)

## `rule_builder/` (2 files)

- `rule_builder/__init__.py`

  Full API exports for all rule types, AST format support, pathfinding tools, and documentation. Upstream file is empty.

  [Rule Builder README](../../../../../rule_builder/README.md) | [Fork vs Upstream Comparison](../rule-builder/fork-vs-upstream-rule-builder.md)

- `rule_builder/rules.py`

  Extended from 1,822 to 4,224 lines. Adds RuleWorldMixin, RuleBuilderLogicMixin, and 15 new rule types for AST format support.

  [Rule Builder Modifications](../rule-builder/rule-builder-modifications.md) | [Fork vs Upstream Comparison](../rule-builder/fork-vs-upstream-rule-builder.md)

## `test/general/` (4 files)

- `test/general/test_implemented.py`

  Added 'The Messenger' and 'Overcooked! 2' to excluded_games in test_slot_data to prevent flaky fill failures caused by upstream worlds with tight access rules at certain random seeds.

- `test/general/test_items.py`

  Added DLCQuest coin exclusion and logic to propagate item exclusions from base games to WorldGen variant worlds.

- `test/general/test_reachability.py`

  Added shapez unreachable region and logic to propagate unreachable regions from base games to WorldGen variant worlds.

- `test/general/test_rule_builder.py`

  Added ~600 lines of evaluation tests for fork-only Rule Builder rule types: CountItem, CountFromList, Compare, Arithmetic, MinValue, MaxValue, WeightedSum, and more.

  [Rule Builder Modifications](../rule-builder/rule-builder-modifications.md)

## `worlds/alttp/` (2 files)

- `worlds/alttp/Rules.py`

  Fixed Python late binding bug in superbunny path lambdas that caused rules to always evaluate to True.

  [ALttP Bunny Rules Bug](../../../upstream-bugs/alttp/bunny-rules.md) | [Diff](../diff-files/alttp-bunny-rules.diff)

- `worlds/alttp/__init__.py`

  Added `check_rom_available()` to skip ROM generation when `skip_required_files` is enabled.

  [Diff](../diff-files/world-init-files.diff) | [Skip Required Files Proposal](../../proposals/skip-required-files-proposal.md)

## `worlds/dkc3/` (1 files)

- `worlds/dkc3/__init__.py`

  Added `check_rom_available()` to skip ROM generation when `skip_required_files` is enabled.

  [Diff](../diff-files/world-init-files.diff)

## `worlds/ff1/` (1 files)

- `worlds/ff1/__init__.py`

  Added skip_required_files support to allow generation without key items.

  [Diff](../diff-files/world-init-files.diff)

## `worlds/landstalker/` (1 files)

- `worlds/landstalker/Hints.py`

  Changed `list(set(...))` to `sorted(set(...))` for deterministic hint ordering before seeded shuffle.

  [Diff](../diff-files/world-minor-fixes.diff)

## `worlds/lufia2ac/` (2 files)

- `worlds/lufia2ac/Options.py`

  Changed `set(random_groups)` to `list(random_groups)` so `enumerate()` assigns stable integer keys for deterministic JSON export.

  [Diff](../diff-files/world-minor-fixes.diff)

- `worlds/lufia2ac/__init__.py`

  Added `check_rom_available()` to skip ROM generation when `skip_required_files` is enabled.

  [Diff](../diff-files/world-init-files.diff)

## `worlds/mmbn3/` (1 files)

- `worlds/mmbn3/__init__.py`

  Added `check_rom_available()` to skip ROM generation when `skip_required_files` is enabled.

  [Diff](../diff-files/world-init-files.diff)

## `worlds/oot/` (1 files)

- `worlds/oot/__init__.py`

  Added `check_rom_available()` to skip ROM generation when `skip_required_files` is enabled.

  [Diff](../diff-files/world-init-files.diff)

## `worlds/smw/` (1 files)

- `worlds/smw/__init__.py`

  Added `check_rom_available()` to skip ROM generation when `skip_required_files` is enabled.

  [Diff](../diff-files/world-init-files.diff)

## `worlds/soe/` (1 files)

- `worlds/soe/__init__.py`

  Added `check_rom_available()` to skip ROM generation when `skip_required_files` is enabled.

  [Diff](../diff-files/world-init-files.diff)

## `worlds/tloz/` (1 files)

- `worlds/tloz/__init__.py`

  Added `check_rom_available()` to skip ROM generation when `skip_required_files` is enabled.

  [Diff](../diff-files/world-init-files.diff)

## `worlds/yoshisisland/` (1 files)

- `worlds/yoshisisland/__init__.py`

  Added `check_rom_available()` to skip ROM generation when `skip_required_files` is enabled.

  [Diff](../diff-files/world-init-files.diff)

---

**Total:** 25 changed files
