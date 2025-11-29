#!/bin/bash

python Generate.py --weights_file_path "Templates/A Link to the Past.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/A Link to the Past.yaml" --multi 1 --seed 2
python Generate.py --weights_file_path "Templates/A Link to the Past.yaml" --multi 1 --seed 3
python Generate.py --weights_file_path "Templates/Adventure.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Adventure.yaml" --multi 1 --seed 2
python Generate.py --weights_file_path "Templates/Adventure.yaml" --multi 1 --seed 3
python Generate.py --weights_file_path "Templates/A Short Hike.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/A Short Hike.yaml" --multi 1 --seed 2
python Generate.py --weights_file_path "Templates/A Short Hike.yaml" --multi 1 --seed 3
python Generate.py --weights_file_path "Templates/A Hat in Time.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/A Hat in Time.yaml" --multi 1 --seed 2
python Generate.py --weights_file_path "Templates/A Hat in Time.yaml" --multi 1 --seed 3

rm -rf Players/presets/Multiworld/
mkdir -p Players/presets/Multiworld/
cp Players/Templates/*.yaml Players/presets/Multiworld/
rm -f Players/presets/Multiworld/"Archipelago.yaml" \
      Players/presets/Multiworld/"Final Fantasy.yaml" \
      Players/presets/Multiworld/"Hollow Knight.yaml" \
      Players/presets/Multiworld/"Ocarina of Time.yaml" \
      Players/presets/Multiworld/"Sudoku.yaml" \
      Players/presets/Multiworld/"SMZ3.yaml" \
      Players/presets/Multiworld/"Zillion.yaml"

python Generate.py --player_files_path "Players/presets/Multiworld" --seed 1

rm -rf Players/presets/Multiworld/
mkdir -p Players/presets/Multiworld/
cp "Players/Templates/A Hat in Time.yaml" "Players/Templates/A Link to the Past.yaml" "Players/Templates/Adventure.yaml" "Players/Templates/A Short Hike.yaml" Players/presets/Multiworld/

python Generate.py --player_files_path "Players/presets/Multiworld" --seed 2

rm -rf Players/presets/Multiworld/
mkdir -p Players/presets/Multiworld/
cp "Players/Templates/Adventure.yaml" "Players/Templates/A Short Hike.yaml" Players/presets/Multiworld/

python Generate.py --player_files_path "Players/presets/Multiworld" --seed 3

python Generate.py --weights_file_path "Templates/Aquaria.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/ArchipIDLE.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Blasphemous.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Bomb Rush Cyberfunk.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Bumper Stickers.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Castlevania 64.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Castlevania - Circle of the Moon.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Celeste 64.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/ChecksFinder.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Civilization VI.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Dark Souls III.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/DLCQuest.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Donkey Kong Country 3.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/DOOM 1993.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/DOOM II.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Factorio.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Faxanadu.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Final Fantasy Mystic Quest.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Heretic.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Hylics 2.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Inscryption.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Jak and Daxter The Precursor Legacy.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Kingdom Hearts.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Kingdom Hearts 2.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Kirby's Dream Land 3.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Landstalker - The Treasures of King Nole.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Lingo.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Links Awakening DX.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Lufia II Ancient Cave.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Mario & Luigi Superstar Saga.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Mega Man 2.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/MegaMan Battle Network 3.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Meritous.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Muse Dash.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Noita.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Old School Runescape.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Overcooked! 2.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Paint.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Pokemon Emerald.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Pokemon Red and Blue.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Raft.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Risk of Rain 2.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Saving Princess.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Secret of Evermore.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/shapez.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Shivers.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/SMZ3.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Sonic Adventure 2 Battle.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Starcraft 2.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Stardew Valley.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Subnautica.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Super Mario 64.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Super Mario Land 2.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Super Mario World.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Super Metroid.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Terraria.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/The Legend of Zelda.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/The Messenger.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/The Wind Waker.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/The Witness.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Timespinner.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/TUNIC.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Undertale.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/VVVVVV.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Wargroove.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Yacht Dice.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Yoshi's Island.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Yu-Gi-Oh! 2006.yaml" --multi 1 --seed 1

python Generate.py --weights_file_path "Templates/MathProof2p2e4.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/MathProof2p2e4.yaml" --multi 1 --seed 2
python Generate.py --weights_file_path "Templates/MathProof2p2e4.yaml" --multi 1 --seed 3
python Generate.py --weights_file_path "Templates/ChocolateChipCookies.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/ChocolateChipCookies.yaml" --multi 1 --seed 2
python Generate.py --weights_file_path "Templates/ChocolateChipCookies.yaml" --multi 1 --seed 3
python Generate.py --weights_file_path "Templates/WebDevJourney.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/WebDevJourney.yaml" --multi 1 --seed 2
python Generate.py --weights_file_path "Templates/WebDevJourney.yaml" --multi 1 --seed 3

python Generate.py --weights_file_path "Templates/Metamath.yaml" --multi 1 --seed 1
python Generate.py --weights_file_path "Templates/Metamath.yaml" --multi 1 --seed 2
python Generate.py --weights_file_path "Templates/Metamath.yaml" --multi 1 --seed 3

#python scripts/build/pack_apworld.py metamath
#python scripts/build/pack_apworld.py mathadventure
#python scripts/build/pack_apworld.py bakingadventure
#python scripts/build/pack_apworld.py codingadventure

#remove empty preset directories
find frontend/presets -type d -empty -delete

#cp -r frontend/modules/shared frontend/modules/textAdventure-remote/
