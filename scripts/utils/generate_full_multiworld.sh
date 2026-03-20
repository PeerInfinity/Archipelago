#!/bin/bash

rm -rf Players/presets/Multiworld/
mkdir -p Players/presets/Multiworld/
cp Players/Templates/*.yaml Players/presets/Multiworld/

#Exclude list:
rm -f Players/presets/Multiworld/"Archipelago.yaml" \
      Players/presets/Multiworld/"Final Fantasy.yaml" \
      Players/presets/Multiworld/"Hollow Knight.yaml" \
      Players/presets/Multiworld/"Ocarina of Time.yaml" \
      Players/presets/Multiworld/"Sudoku.yaml" \
      Players/presets/Multiworld/"Universal Tracker.yaml" \
      Players/presets/Multiworld/"Zillion.yaml"

#Currently failing games:
rm -f Players/presets/Multiworld/"Blasphemous.yaml" \
      Players/presets/Multiworld/"Kingdom Hearts.yaml" \
      Players/presets/Multiworld/"SMZ3.yaml" \
      Players/presets/Multiworld/"Stardew Valley.yaml" \
      Players/presets/Multiworld/"Super Metroid.yaml"

python Generate.py --player_files_path "Players/presets/Multiworld" --seed 1

rm -rf Players/presets/Multiworld/
