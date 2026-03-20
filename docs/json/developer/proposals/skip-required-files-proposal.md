# Upstream Proposal: ROM-less Generation via `skip_required_files`

## Summary

Add a `skip_required_files` setting to `GeneralOptions` and a `check_rom_available()` helper that together allow seed generation to proceed when ROM files are absent. ROM patching is skipped; all other artifacts (multidata, spoiler log, slot data) are produced normally. World maintainers can opt in by using the helper in their `stage_assert_generate` and `generate_output` methods. A `Group.__getattribute__` override in `settings.py` also suppresses errors when required file paths don't exist.

This is a proposal for the upstream [Archipelago](https://github.com/ArchipelagoMW/Archipelago) repository. A working reference implementation exists in [this fork](https://github.com/PeerInfinity/Archipelago-CC).

---

## Motivation

Currently, generating a multiworld requires ROM files for every ROM-based game in the seed. This creates friction for several legitimate use cases:

### 1. Automated Testing & CI/CD

- ROMs cannot be committed to repositories (legal concerns)
- CI runners don't have access to user ROM collections
- Tests must either skip ROM-based games entirely or mock file existence

### 2. Logic Development & Debugging

- Developers may not own every game's ROM
- Logic testing doesn't require actual ROM patching
- Faster iteration when ROM processing is skipped

### 3. Third-Party Tool Development

- Trackers and analyzers that need location/item/logic data but not a playable ROM
- Tools that study item distributions across seeds
- Any tool that works with multidata but not with patched ROM files

### 4. WebHost Dry Runs

- Validate YAML configurations before committing to a full generation
- Check for option conflicts and verify item/location counts

---

## Proposed Changes

### 1. `skip_required_files` setting in `GeneralOptions` (`settings.py`)

```python
class GeneralOptions(Group):
    # ... existing options ...

    skip_required_files: bool = False
```

And a matching module-level global that is updated when settings load:

```python
# Module-level global (allows worlds to import it directly without get_settings())
skip_required_files = False

# In Settings.__init__(), before self.update() triggers Path resolution:
global skip_required_files
skip_required_files = res.general_options.skip_required_files
```

The module-level global avoids repeated `get_settings()` calls and makes the import in world files simple and direct. It must be synced early in `Settings.__init__()`, before `self.update()` triggers `Path` resolution — otherwise the `Group.__getattribute__` override (see below) wouldn't have the correct value when settings paths are first accessed.

### 2. `Group.__getattribute__` override in `settings.py`

When `skip_required_files` is enabled and a settings `Path` attribute doesn't exist on disk, the normal behavior is to raise an error. The override converts this into a warning, allowing generation to continue:

```python
class Group:
    def __getattribute__(self, item):
        # ... existing resolution logic ...
        if skip_required_files:
            import warnings
            warnings.warn(f"{attr} does not exist, but {self.__class__.__name__}.{item} "
                          f"is required. Continuing anyway as skip_required_files is set.")
            return attr
        # ... existing error logic ...
```

This is necessary because some worlds access settings paths during import or early initialization, before `check_rom_available()` is ever called.

### 3. `check_rom_available()` helper in `Utils.py`

```python
def check_rom_available(rom_path: str, game_name: str) -> bool:
    """Check whether a required ROM file is available for generation.

    Returns True if the file exists at rom_path.  If the file is missing
    and skip_required_files is set in host.yaml, logs a warning and returns
    False so the caller can skip ROM-dependent steps.  If the file is
    missing and skip_required_files is not set, raises FileNotFoundError.

    Typical usage in stage_assert_generate::

        if not check_rom_available(get_base_rom_path(), cls.game):
            return  # ROM missing but skip_required_files is set; skip ROM checks

    Typical usage in generate_output::

        if not check_rom_available(get_base_rom_path(), self.game):
            self.rom_name = b"GAME_ROM_NOT_GENERATED"
            self.rom_name_available_event.set()
            return
    """
    if os.path.exists(rom_path):
        return True
    from settings import skip_required_files
    if skip_required_files:
        logging.getLogger(game_name).warning(
            "Required file not found at %s, skipping ROM generation as skip_required_files is set.", rom_path
        )
        return False
    raise FileNotFoundError(rom_path)
```

### 4. World adoption pattern

World maintainers update two methods in their `__init__.py`. The helper handles all three cases (ROM present, ROM missing with skip, ROM missing without skip), so each call site is one line:

**`stage_assert_generate`** — allow generation to proceed without the ROM:

```python
@classmethod
def stage_assert_generate(cls, multiworld: MultiWorld):
    if not check_rom_available(get_base_rom_path(), cls.game):
        return  # ROM missing, skip_required_files is set; skip ROM-dependent checks
    # ... rest of assert logic (enemizer checks, etc.) ...
```

**`generate_output`** — skip ROM patching and set a placeholder:

```python
def generate_output(self, output_directory: str):
    if not check_rom_available(get_base_rom_path(), self.game):
        self.rom_name = "GAME_ROM_NOT_GENERATED"  # each world uses its own prefix
        self.rom_name_available_event.set()
        return
    # ... normal ROM patching ...
```

Each world uses a game-specific placeholder name (e.g. `"ALTTP_ROM_NOT_GENERATED"`, `"SMW_ROM_NOT_GENERATED"`). The type varies by world — most use `str`, though some use `bytes` or `bytearray` to match their existing `rom_name` type.

**`modify_multidata`** — guard against the placeholder (only needed for worlds that override `modify_multidata` to add a `connect_name` entry):

```python
def modify_multidata(self, multidata: dict):
    self.rom_name_available_event.wait()
    if getattr(self, "rom_name", None) == "GAME_ROM_NOT_GENERATED":
        return  # Don't add connect_name for a ROM that wasn't generated
    # ... normal connect_name logic ...
```

---

## Behavior When Enabled

| Artifact | Behavior |
|----------|----------|
| Multidata | Generated normally |
| Spoiler log | Generated normally |
| Slot data | Generated normally |
| Patched ROMs | **Skipped** with warning logged |
| ROM `connect_name` entries | Omitted (no placeholder in multidata) |
| Final ZIP | Contains all non-ROM files |

---

## Implementation Strategy

### Phase 1: Core Infrastructure (single PR)

1. Add `skip_required_files: bool = False` to `GeneralOptions` in `settings.py`
2. Add the module-level global and sync it early in `Settings.__init__()`
3. Add the `Group.__getattribute__` override to suppress missing-path errors when enabled
4. Add `check_rom_available()` to `Utils.py`
5. Document the feature in the world API docs

This phase has no visible effect on any game — it is purely additive infrastructure.

### Phase 2: Update Core-Team Worlds

Apply the pattern to worlds maintained by the core team.

**ROM-based worlds** — use `check_rom_available` to skip ROM patching:

| World | Methods to update |
|-------|-------------------|
| A Link to the Past | `stage_assert_generate`, `generate_output`, `modify_multidata` |
| Ocarina of Time | `stage_assert_generate`, `generate_output`, `modify_multidata` |
| Super Mario World | `stage_assert_generate`, `generate_output` |
| Donkey Kong Country 3 | `stage_assert_generate`, `generate_output` |
| Yoshi's Island | `stage_assert_generate`, `generate_output` |
| The Legend of Zelda | `stage_assert_generate`, `generate_output` |
| Lufia II Ancient Cave | `stage_assert_generate`, `generate_output` |
| Mega Man Battle Network 3 | `stage_assert_generate`, `generate_output` |
| Secret of Evermore | `stage_assert_generate`, `generate_output` |

Note: OOT uses a try/except pattern around `Rom()` rather than a direct `os.path.exists` check, so its update is slightly different from the others — it wraps the exception handler rather than using `check_rom_available` directly.

**Non-ROM worlds** — use `skip_required_files` to bypass other prerequisites:

| World | Usage |
|-------|-------|
| APSudoku | Skip generation prerequisites when setting is enabled |
| FF1 | Allow generation without key items when setting is enabled |

These are not ROM-based but benefit from the same setting to allow generation to proceed in CI/testing environments.

### Phase 3: Community Adoption

Announce the helper in release notes and world development docs. Because the feature is opt-in and purely additive, world maintainers can adopt it at their own pace. Worlds that don't implement the check continue to fail on missing ROMs — the current, expected behavior.

---

## Backward Compatibility

- **Opt-in**: Disabled by default (`false` in host.yaml)
- **Additive**: No change to behavior when disabled
- **Gradual**: Worlds can adopt the pattern independently; non-adopting worlds are unaffected

---

## Security Considerations

- The setting lives in `host.yaml` (local, user-controlled)
- It is not a game option and cannot be set by players in YAML configs
- WebHost deployments should not enable this for production generation

---

## Alternatives Considered

### Mock ROM Files

Create empty/stub ROM files for testing.

**Problems:** Still requires per-game setup. May cause unexpected behavior in ROM patching code. Hard to maintain across updates.

### Game-Specific Test Modes

Each game implements its own "test mode" flag.

**Problems:** Duplicates effort across 90+ games with inconsistent implementations. No unified solution for CI pipelines.

### Separate "Logic-Only" Generation Path

A completely separate code path for testing.

**Problems:** Massive code duplication. Drift between test and production paths. Much larger maintenance burden.

---

## Reference Implementation

This fork has a fully working implementation covering 11 worlds (9 ROM-based + 2 non-ROM). The changes to upstream files are:

- `settings.py`: ~6 lines (module-level global + early extraction in `Settings.__init__` + `Group.__getattribute__` check)
- `worlds/RomlessUtils.py`: ~20 lines (`check_rom_available` function)
- Per world: ~10 lines replaced by 3–4 lines using the helper

**Note:** The fork's implementation differs from this proposal in several ways, to minimize fork divergence:

- **Setting namespace:** The fork places `skip_required_files` under the `json_tools` namespace (owned by the `json_tools_installer` APWorld) rather than in `GeneralOptions`. For upstream, `GeneralOptions` is the more natural home since the setting is not specific to JSON tools.
- **Module-level global sync:** The fork syncs via early extraction from raw YAML in `Settings.__init__()`, before `self.update()` triggers any `Path` resolution.
- **Helper location:** The fork places `check_rom_available()` in `worlds/RomlessUtils.py` rather than `Utils.py`, to avoid modifying a core upstream file. For upstream, `Utils.py` is the more natural home.

See [core-files.diff](../diffs/diff-files/core-files.diff) for the exact `settings.py` changes and [world-init-files.diff](../diffs/diff-files/world-init-files.diff) for the world-level changes.
