#!/usr/bin/env python3
"""
Generate a vanilla ALTTP seed with monkey patches applied.

Installs the vanilla patches (bottle fix, uncle weapon fix, pool adjustment,
dungeon item skip, key logic fix, silver bow fix), runs Generate.py with the
vanilla-full YAML template and plando enabled, then uninstalls patches.

This produces actual output files (presets, spoiler logs, etc.) unlike
test_vanilla_patches.py which uses --skip_output for verification only.

Usage:
    python scripts/vanilla-alttp/generate_vanilla_alttp.py --seed 1
"""

import argparse
import importlib.util
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))
os.chdir(PROJECT_DIR)
sys.path.insert(0, PROJECT_DIR)

# Must be done before any Archipelago imports
sys.modules['ModuleUpdate'] = type(sys)('ModuleUpdate')
sys.modules['ModuleUpdate'].update = lambda *a, **kw: None
sys.modules['ModuleUpdate'].requirements_files = {}

# Import vanilla_patches from the hyphenated directory
spec = importlib.util.spec_from_file_location(
    'vanilla_patches',
    os.path.join(SCRIPT_DIR, 'vanilla_patches.py')
)
vanilla_patches = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vanilla_patches)


def main():
    parser = argparse.ArgumentParser(description='Generate a vanilla ALTTP seed with monkey patches')
    parser.add_argument('--seed', type=int, default=1, help='Seed number to generate')
    args = parser.parse_args()

    import settings as Settings
    Settings.no_gui = True

    vanilla_patches.install()
    try:
        from Generate import mystery_argparse, main as generate_main
        from Main import main as main_main

        parsed_args = mystery_argparse(
            ['--weights_file_path', 'Templates/A Link to the Past - vanilla-full.yaml',
             '--multi', '1', '--seed', str(args.seed),
             '--plando', 'bosses, connections, texts, items']
        )
        erargs, seed = generate_main(parsed_args)

        # Mark the ALTTP world class as vanilla so the exporter adds the _v
        # suffix to the preset directory (avoids overwriting the randomized seed 1 preset)
        from worlds.alttp import ALTTPWorld
        ALTTPWorld.is_vanilla = True

        # Tell the exporter to cap key counts in the exported rules.json.
        # The runtime patch (in vanilla_patches.py) caps key counts when
        # _lttp_has_key is called, but the exporter reads the AST of rule
        # lambdas where the original counts are hardcoded, so it needs its
        # own patch data.
        ALTTPWorld.export_rule_patches = {
            'cap_key_counts': {
                'Small Key (Desert Palace)': 1,
                'Small Key (Palace of Darkness)': 5,
                'Small Key (Swamp Palace)': 4,
                'Small Key (Ganons Tower)': 4,
            },
        }

        main_main(erargs, seed=seed)
    finally:
        # Clean up: remove is_vanilla, export patches, and uninstall patches
        try:
            from worlds.alttp import ALTTPWorld
            if hasattr(ALTTPWorld, 'is_vanilla'):
                del ALTTPWorld.is_vanilla
            if hasattr(ALTTPWorld, 'export_rule_patches'):
                del ALTTPWorld.export_rule_patches
        except ImportError:
            pass
        vanilla_patches.uninstall()

    print(f"Vanilla ALTTP seed {args.seed} generated successfully.")


if __name__ == '__main__':
    main()
