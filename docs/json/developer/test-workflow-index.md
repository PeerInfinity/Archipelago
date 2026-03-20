# Test Script to Workflow Index

Maps every test script and validation tool to the GitHub Actions workflow(s) that run it. Scripts marked **No workflow** are candidates for new workflow coverage.

**Repository:** [PeerInfinity/Archipelago-CC](https://github.com/PeerInfinity/Archipelago-CC)
**Workflows:** [Actions tab](https://github.com/PeerInfinity/Archipelago-CC/actions)

---

## Workflows Summary

| Workflow | File | Trigger | Description |
|----------|------|---------|-------------|
| Unit Tests | `unittests.yml` | push, PR | Python pytest (`pytest -n auto`) |
| JavaScript Unit Tests | `unittests_json.yml` | push, PR, dispatch | JS Vitest (`npm run test:unit`) |
| Test ALTTP & Regression | `test-templates.yml` | push (main), PR | Spoiler test + frontend regression |
| Test All Templates (Sequential) | `test-all-sequential.yml` | dispatch | Comprehensive: spoilers, multiclient, multiworld (original/worldgen/apworld) |
| Test UT Fuzzer | `test-ut-fuzz.yml` | dispatch | UT fuzz across all modes, 10-way parallel split |
| Test UT Fuzzer (Single Game) | `test-ut-fuzz-single-game.yml` | dispatch | Single-game UT fuzz |
| Test Spoiler Fuzzer | `test-spoiler-fuzz.yml` | dispatch | Spoiler fuzz, 10-way parallel split |
| Test Spoiler Fuzzer (Single Game) | `test-spoiler-fuzz-single-game.yml` | dispatch | Single-game spoiler fuzz |
| Test Multiworld UT Fuzz | `test-multiworld-ut-fuzz.yml` | dispatch | Multiworld incremental assembly UT fuzz |
| Test World Generator | `test-world-generator.yml` | dispatch | WorldGen round-trip, 10-way parallel split |
| Test World Generator (Single Job) | `test-world-generator-single.yml` | dispatch | Single-job WorldGen test |
| Generate Presets | `generate-presets.yml` | dispatch | Generate all presets, worldgen worlds, multiworld |

---

## Test Script Coverage

### Python Test Scripts (scripts/test/)

| Script | Workflow(s) | Notes |
|--------|-------------|-------|
| `test-all-templates.py` | `test-templates.yml`, `test-all-sequential.yml` | Invokes `npm test` internally for spoiler tests |
| `test-all-ut-fuzz.py` | `test-ut-fuzz.yml`, `test-ut-fuzz-single-game.yml` | Invokes `fuzz.py` internally |
| `test-all-spoiler-fuzz.py` | `test-spoiler-fuzz.yml`, `test-spoiler-fuzz-single-game.yml` | Invokes `Generate.py` + `npm test` internally |
| `test-multiworld-ut-fuzz.py` | `test-multiworld-ut-fuzz.yml` | Invokes `fuzz.py` internally |
| `test-world-generator.py` | `test-world-generator.yml`, `test-world-generator-single.yml` | Invokes world generator + optionally `npm test` |
| `combine-test-results.py` | `test-world-generator.yml` | Called in combine-results job |
| `run_multiclient_test.py` | `test-all-sequential.yml` | Called for multiclient test phase |
| `compare_rules_json.py` | `test-world-generator.yml` | Called internally by `test-world-generator.py` |
| `test-json-world-builder.py` | **No workflow** | JSON world builder round-trip test |
| `test_ast_format_parsing.py` | **No workflow** | AST format rule parsing validation |
| `compare-pickle-json-export.py` | **No workflow** | Diagnostic: pickle vs JSON export comparison |
| `test-ut-bounce-protocol.py` | **No workflow** | Requires live server + UT client |
| `export-pickle-to-json.py` | **No workflow** | Utility: pickle to JSON conversion |
| `generate-tracking-mode-config.py` | **No workflow** | Utility: generate tracking mode config |
| `TestDriverClient.py` | **No workflow** | Test driver for UT bounce protocol |

### JavaScript Test Scripts (scripts/test/)

| Script | Workflow(s) | Notes |
|--------|-------------|-------|
| `run-tests.js` | `test-templates.yml`, `test-all-sequential.yml` | Called via `npm test` |
| `analyze-test-results.js` | **No workflow** | Post-hoc analysis of Playwright results |
| `test-health-check.js` | **No workflow** | Environment sanity check |
| `test-seed-range.js` | **No workflow** | Seed range generation test |
| `test-bidirectional-detection.js` | **No workflow** | Exit bidirectionality validation |

### Framework Test Runners

| Framework | Command | Workflow(s) | Notes |
|-----------|---------|-------------|-------|
| pytest | `pytest` | `unittests.yml` | push/PR trigger |
| Vitest | `npm run test:unit` | `unittests_json.yml` | push/PR trigger |
| Vitest benchmarks | `npm run bench` | **No workflow** | Performance benchmarks |
| Playwright (spoilers) | `npm test -- --mode=test-spoilers` | `test-templates.yml` + others | Invoked indirectly by Python test scripts |
| Playwright (regression) | `npm test -- --mode=test-regression` | `test-templates.yml` | push/PR trigger |
| Playwright (multiclient) | `npm run test:multiclient` | `test-all-sequential.yml` | dispatch only |
| Health check | `npm run test:health` | **No workflow** | |
| Full suite | `npm run test:full-suite` | **No workflow** | Compound: health + tests + analysis |

### Documentation Sync/Validation Scripts (scripts/docs/)

| Script | Workflow(s) | Notes |
|--------|-------------|-------|
| `sync-rule-docs.py` | **No workflow** | Rule types documentation coverage |
| `sync-rule-tests.py` | **No workflow** | Rule types test coverage |
| `sync-script-docs.py` | **No workflow** | Script documentation coverage |
| `find_orphaned_docs.py` | **No workflow** | Document reachability check |
| `generate-file-diff-lists.py` | **No workflow** | Fork vs upstream diff generation |

### Documentation Generation Scripts (scripts/docs/)

These generate markdown reports from test result data. Most are called by workflow combine jobs.

| Script | Workflow(s) | Notes |
|--------|-------------|-------|
| `generate-test-chart.py` | `test-templates.yml` | Called internally by `test-all-templates.py -p` |
| `generate_ut_fuzz_chart.py` | `test-ut-fuzz.yml`, `test-ut-fuzz-single-game.yml` | Called in combine job |
| `generate_spoiler_fuzz_chart.py` | `test-spoiler-fuzz.yml`, `test-spoiler-fuzz-single-game.yml` | Called in combine job |
| `generate_fuzz_summary_chart.py` | `test-spoiler-fuzz.yml`, `test-spoiler-fuzz-single-game.yml` | Called in combine job |
| `generate_multiworld_ut_fuzz_chart.py` | `test-multiworld-ut-fuzz.yml` | Called in combine job |
| `generate-world-generator-report.py` | `test-world-generator.yml` | Called in combine job |
| `compare_ut_fuzz_results.py` | `test-ut-fuzz.yml` | Called in combine job |
| `compare_ut_fuzz_vs_worldgen.py` | **No workflow** | Manual comparison tool |
| `generate-all-docs.py` | **No workflow** | Master doc generation (runs all above) |
| `generate-freshness-report.py` | **No workflow** | Freshness + doc sync status report |
| `update-preset-files.py` | `generate-presets.yml` | Called in preset generation |

---

## Scripts Not Covered by Any Workflow

### Validation tests (good candidates for a workflow)

| Script | What it checks | Setup required |
|--------|---------------|----------------|
| `scripts/test/test_ast_format_parsing.py` | AST format rule parsing against actual preset data | None (reads existing presets) |
| `scripts/test/test-json-world-builder.py` | JSONWorldBuilder can load and build worlds from JSON | None (reads existing presets) |
| `scripts/test/test-bidirectional-detection.js` | Exit bidirectionality detection in presets | None (reads existing presets) |
| `scripts/docs/sync-rule-docs.py` | All implemented rule types are documented | None |
| `scripts/docs/sync-rule-tests.py` | All implemented rule types have tests | None |
| `scripts/docs/sync-script-docs.py` | All scripts are documented in READMEs | None |
| `scripts/docs/find_orphaned_docs.py` | All markdown files are reachable from entry points | None |
| `scripts/docs/generate-freshness-report.py` | Test result freshness + doc sync status | None |

### Benchmarks

| Script | What it checks | Setup required |
|--------|---------------|----------------|
| `npm run bench` | JS rule engine performance | None |

### Diagnostic/utility tools (less suitable for CI)

| Script | What it checks | Setup required |
|--------|---------------|----------------|
| `scripts/test/compare-pickle-json-export.py` | Pickle vs JSON export parity | Specific game + seed |
| `scripts/test/test-ut-bounce-protocol.py` | UT bounce protocol communication | Running AP server + UT client |
| `scripts/test/TestDriverClient.py` | Test driver for bounce protocol | Running AP server + UT client |
| `scripts/test/export-pickle-to-json.py` | Pickle to JSON conversion | Specific pickle file |
| `scripts/test/generate-tracking-mode-config.py` | Generate tracking mode config | Test result data |
| `scripts/test/analyze-test-results.js` | Analyze Playwright JSON report | Existing test report |
| `scripts/test/test-health-check.js` | Environment sanity (server, browser deps) | Running dev server |
| `scripts/test/test-seed-range.js` | Seed range generation | Running dev server |
| `scripts/docs/compare_ut_fuzz_vs_worldgen.py` | UT fuzz vs worldgen comparison | Existing test results |
| `scripts/docs/generate-file-diff-lists.py` | Fork vs upstream file diffs | Git upstream remote |
| `scripts/docs/generate-all-docs.py` | Run all doc generators | Existing test results |

---

## Indirect Invocation Chains

Some scripts are invoked indirectly by other scripts, not directly by workflows:

```
test-all-templates.py
  └─→ npm test (Playwright spoiler tests)
  └─→ generate-test-chart.py (with -p flag)

test-all-spoiler-fuzz.py
  └─→ Generate.py (seed generation)
  └─→ npm test (Playwright spoiler tests)

test-world-generator.py
  └─→ world_generator (world generation)
  └─→ npm test (optional spoiler tests)
  └─→ combine-test-results.py
  └─→ compare_rules_json.py

test-all-ut-fuzz.py / test-multiworld-ut-fuzz.py
  └─→ fuzz.py (Archipelago fuzzer)

generate-freshness-report.py
  └─→ sync-rule-docs.py --json
  └─→ sync-rule-tests.py --json
  └─→ sync-script-docs.py --json
  └─→ find_orphaned_docs.py --json
```
