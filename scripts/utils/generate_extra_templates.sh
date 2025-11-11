#!/bin/bash

#python Generate.py --weights_file_path "Templates/A Link to the Past.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/A Link to the Past.yaml" --multi 1 --seed 2
python Generate.py --weights_file_path "Templates/A Link to the Past.yaml" --multi 1 --seed 3
#python Generate.py --weights_file_path "Templates/Adventure.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Adventure.yaml" --multi 1 --seed 2
python Generate.py --weights_file_path "Templates/Adventure.yaml" --multi 1 --seed 3
#python Generate.py --weights_file_path "Templates/A Short Hike.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/A Short Hike.yaml" --multi 1 --seed 2
python Generate.py --weights_file_path "Templates/A Short Hike.yaml" --multi 1 --seed 3
#python Generate.py --weights_file_path "Templates/A Hat in Time.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/A Hat in Time.yaml" --multi 1 --seed 2
python Generate.py --weights_file_path "Templates/A Hat in Time.yaml" --multi 1 --seed 3

#python Generate.py --weights_file_path "Templates/MathProof2p2e4.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/MathProof2p2e4.yaml" --multi 1 --seed 2
python Generate.py --weights_file_path "Templates/MathProof2p2e4.yaml" --multi 1 --seed 3
#python Generate.py --weights_file_path "Templates/ChocolateChipCookies.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/ChocolateChipCookies.yaml" --multi 1 --seed 2
python Generate.py --weights_file_path "Templates/ChocolateChipCookies.yaml" --multi 1 --seed 3
#python Generate.py --weights_file_path "Templates/WebDevJourney.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/WebDevJourney.yaml" --multi 1 --seed 2
python Generate.py --weights_file_path "Templates/WebDevJourney.yaml" --multi 1 --seed 3

#python Generate.py --weights_file_path "Templates/Metamath.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Metamath.yaml" --multi 1 --seed 2
python Generate.py --weights_file_path "Templates/Metamath.yaml" --multi 1 --seed 3

#cp "Players/Templates/Adventure.yaml" "Players/Templates/A Short Hike.yaml" Players/presets/Multiworld/

python Generate.py --player_files_path "Players/presets/Multiworld" --seed 1
python Generate.py --player_files_path "Players/presets/Multiworld" --seed 2
python Generate.py --player_files_path "Players/presets/Multiworld" --seed 3

#python scripts/build/pack_apworld.py metamath
#python scripts/build/pack_apworld.py mathadventure
#python scripts/build/pack_apworld.py bakingadventure
#python scripts/build/pack_apworld.py codingadventure

find frontend/presets -type d -empty -delete

#cp -r frontend/modules/shared frontend/modules/textAdventure-remote/
