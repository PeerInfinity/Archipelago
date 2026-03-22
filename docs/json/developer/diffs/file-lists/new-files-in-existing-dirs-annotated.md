# New Files in Existing Directories (Annotated)

Files added to directories that already existed in upstream commit `fb45a2f8`.

## Root Directory (9 files)

- `CLAUDE.md`

  Quick reference for Claude Code with common commands, key concepts, and project conventions.

- `fuzz.py`

  Archipelago fuzzer for random YAML generation testing, adapted from Eijebong's Archipelago-fuzzer.

  [Fuzzer Modifications](../fuzzer-modifications.md)

- `jsdoc.json`

  JSDoc configuration for generating API documentation from frontend module source code.

- `json_tools_config.json`

  JSON Tools Installer configuration tracking installation state, sources, patches, and export settings.

- `json_tools_installer_requirements.json`

  Version check manifest for JSON Tools Installer dependency compatibility.

- `package-lock.json`

  Node.js dependency lock file for reproducible installations.

- `package.json`

  Node.js project manifest with scripts for spoiler testing, E2E tests, dev server, and documentation generation.

- `playwright.config.js`

  Playwright E2E test configuration targeting frontend spoiler and regression tests.

- `vitest.config.js`

  Vitest unit test configuration for frontend JavaScript testing with coverage reporting.

## `.github/workflows/` (13 files)

- `.github/workflows/README.md`

  Documentation index for all CI/CD workflows in the fork.

- `.github/workflows/deploy-gh-pages.yml`

  Deploys generated documentation and frontend to GitHub Pages.

- `.github/workflows/generate-presets.yml`

  Exports rules JSON from all game templates via seed generation.

- `.github/workflows/test-all-sequential.yml`

  Runs all seed generation tests sequentially.

- `.github/workflows/test-multiworld-ut-fuzz.yml`

  Fuzz tests for multiworld Universal Tracker scenarios.

- `.github/workflows/test-spoiler-fuzz-single-game.yml`

  Spoiler fuzz testing for a single specified game.

- `.github/workflows/test-spoiler-fuzz.yml`

  Full spoiler fuzz testing across all games.

- `.github/workflows/test-templates.yml`

  Tests all game template seed generations.

- `.github/workflows/test-ut-fuzz-single-game.yml`

  Universal Tracker fuzz testing for a single specified game.

- `.github/workflows/test-ut-fuzz.yml`

  Full Universal Tracker fuzz testing across all games.

- `.github/workflows/test-world-generator-single.yml`

  Tests world generator on a single specified game.

- `.github/workflows/test-world-generator.yml`

  Tests world generator across all games.

- `.github/workflows/unittests_json.yml`

  Runs JSON-related unit tests via npm/Vitest.

## `rule_builder/` (5 files)

- `rule_builder/README.md`

  Documentation for the Rule Builder module: declarative rule definitions with JSON serialization support.

  [Rule Builder README](../../../../../rule_builder/README.md)

- `rule_builder/_ast_utils.py`

  Shared AST parsing utilities for converting between AST constant wrappers and primitive values.

  [Rule Builder Modifications](../rule-builder/rule-builder-modifications.md)

- `rule_builder/ast_explain.py`

  Generates human-readable explanations of AST format rules, compatible with Archipelago's printJSON system.

  [Rule Builder Modifications](../rule-builder/rule-builder-modifications.md)

- `rule_builder/ast_format.py`

  Native AST format parser that converts exported JSON rules directly to Rule Builder objects.

  [Rule Builder Modifications](../rule-builder/rule-builder-modifications.md)

- `rule_builder/pathfinding.py`

  Pathfinding tools for region accessibility analysis via entrance chains and hypothetical item checks.

  [Rule Builder Modifications](../rule-builder/rule-builder-modifications.md)

## `test/general/` (1 files)

- `test/general/test_schema_validation.py`

  Tests that validate all exported rules.json files against the JSON schema.

  [Rules Schema](../../../../../frontend/schema/rules.schema.json)

## `worlds/` (1 files)

- `worlds/RomlessUtils.py`

  Helper module providing `check_rom_available()` for skip_required_files support.

  [Skip Required Files Proposal](../../proposals/skip-required-files-proposal.md)

---

**Total:** 29 new files in existing directories
