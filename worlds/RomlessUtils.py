"""
Utility helpers for ROM-less world patches.

This module provides ``check_rom_available()`` so that romless world patches
can import it without depending on fork-only additions to ``Utils.py``.

The function mirrors the logic in ``Utils.check_rom_available()`` from the
Archipelago-CC fork and is installed alongside the romless world patches by
the JSON Tools installer.
"""

import logging
import os


def check_rom_available(rom_path: str, game_name: str) -> bool:
    """Check whether a required ROM file is available for generation.

    Returns ``True`` if the file exists at *rom_path*.  If the file is missing
    and ``skip_required_files`` is set in host.yaml, logs a warning and returns
    ``False`` so the caller can skip ROM-dependent steps.  If the file is
    missing and ``skip_required_files`` is not set, raises ``FileNotFoundError``.

    Typical usage in ``stage_assert_generate``::

        if not check_rom_available(get_base_rom_path(), cls.game):
            return  # ROM missing but skip_required_files is set; skip ROM checks

    Typical usage in ``generate_output``::

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
