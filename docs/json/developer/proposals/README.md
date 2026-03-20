# Upstream Feature Proposals

This directory contains feature proposals for the upstream Archipelago project that would reduce the modifications needed in this fork.

## Proposals

### 1. [ROM-less Generation Mode](./skip-required-files-proposal.md)

**Status:** Draft

Proposes adding a `skip_required_files` setting that allows generation to proceed without ROM files. This would enable:
- CI/CD testing without ROM distribution
- Logic development and debugging
- Tool development and analytics

**Impact if accepted:** Provides the infrastructure for world authors to support ROM-less generation. Fork modifications to 11 world `__init__.py` files would become unnecessary as individual worlds opt in.

### 2. [Global Generation Hooks](./global-generation-hooks-proposal.md)

**Status:** Reference implementation in fork

Proposes a global hook registry that complements PR #5700's stage methods (`finalize_multiworld`, `pre_output`). Enables utilities that need to run across all worlds without requiring a player slot.

**Impact if accepted:** Provides a clean upstream mechanism for cross-world post-generation hooks.

## Implemented (Removed)

The following proposals have been implemented and their documents removed:

- **Generation Pipeline Hooks** — Superseded by the [Global Generation Hooks](./global-generation-hooks-proposal.md) proposal, which refines the idea in the context of PR #5700.
- **APWorld Settings Extension** — Concluded that the existing `settings_key` pattern already supports APWorld settings for hidden utility worlds. Fork settings have been moved from `GeneralOptions` to a `json_tools` namespace owned by `json_tools_installer`.
- **In-Memory World Builder** — The `JSONWorldBuilder` and supporting infrastructure (AST format parser, AST explain module, tracker integration) are fully implemented. See `world_generator/README.md` and `docs/json/developer/diffs/universal-tracker-modifications.md`.

## Current Fork Modifications

These proposals aim to eliminate the following modifications from the upstream. For detailed diffs, see the [diffs documentation](../diffs/README.md).

| File | Proposal | Diff File |
|------|----------|-----------|
| Main.py | Generation Hooks | [core-files.diff](../diffs/diff-files/core-files.diff) |
| BaseClasses.py | Generation Hooks | [core-files.diff](../diffs/diff-files/core-files.diff) |
| settings.py | ROM-less Generation | [core-files.diff](../diffs/diff-files/core-files.diff) |
| worlds/alttp/\_\_init\_\_.py | ROM-less Generation | [world-init-files.diff](../diffs/diff-files/world-init-files.diff) |
| worlds/dkc3/\_\_init\_\_.py | ROM-less Generation | [world-init-files.diff](../diffs/diff-files/world-init-files.diff) |
| worlds/smw/\_\_init\_\_.py | ROM-less Generation | [world-init-files.diff](../diffs/diff-files/world-init-files.diff) |
| (8 more world files) | ROM-less Generation | [world-init-files.diff](../diffs/diff-files/world-init-files.diff) |

For a complete overview of all repository changes, see [repository-changes.md](../diffs/repository-changes.md).

## Notes

- These proposals are designed to be minimal and non-breaking
- Each can be implemented independently
- The Generation Hooks proposal has higher priority for this project
- All are designed to benefit the broader Archipelago ecosystem
