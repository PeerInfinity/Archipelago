# Upstream Bugs

This directory documents bugs discovered in the upstream Archipelago repository during development and testing of this fork. These bugs exist in the official Archipelago codebase and may or may not have been reported or fixed upstream.

## Bug Index

### A Link to the Past (ALttP)

| Bug | Status | Description |
|-----|--------|-------------|
| [Bunny Rules](./alttp/bunny-rules.md) | Fixed in fork | Superbunny path rules always evaluate to True due to missing invocation and late binding bugs |

### Satisfactory

| Bug | Status | Description |
|-----|--------|-------------|
| [Belt Speed Dead Code](./satisfactory/belt-speed-dead-code.md) | Workaround in fork | Belt speed rule callable never invoked with `(state)`, always evaluates truthy |

### APWorld Manager

| Bug | Status | Description |
|-----|--------|-------------|
| [flake8 F821 Errors](./apworld-manager/flake8.md) | Upstream | `md_app.py` references Kivy classes without importing them |

### Landstalker

| Bug | Status | Description |
|-----|--------|-------------|
| [Memory Leak](./landstalker-memory-leak.md) | False alarm | Initially thought to be upstream bug, but was fork-specific (exporter called `fill_slot_data` after cleanup) |

## Document Types

For each bug, we maintain up to three types of documentation:

| Type | Purpose | Example |
|------|---------|---------|
| **Technical doc** | Detailed analysis for developers | [bunny-rules.md](./alttp/bunny-rules.md) |
| **Bug report** | Formatted for upstream submission | [bunny-rules-bug-report.md](./alttp/bunny-rules-bug-report.md) |
| **Diff file** | Patch to fix the bug | [alttp-bunny-rules.diff](../developer/diffs/diff-files/alttp-bunny-rules.diff) |

## Related Documentation

- [Diffs from Upstream](../developer/diffs/README.md) - Patch files for all upstream modifications
- [Fuzz Tests](../developer/tests/test-fuzz.md) - Testing methodology that discovered several bugs
- [Repository Changes](../developer/diffs/repository-changes.md) - Complete list of changes from upstream
