#!/usr/bin/env python3
"""
Generate APWorld spreadsheet mapping from CSV data and apworld files.

This script reads:
- Spreadsheet CSV from docs/json/archipelago-games-sheet/playable_worlds.csv
- APWorld files from custom_worlds/ and custom_worlds_disabled/

And produces:
- scripts/data/apworld-spreadsheet-mapping.json

Usage:
    python scripts/generate_apworld_mapping.py
    python scripts/generate_apworld_mapping.py --fetch  # Fetch latest spreadsheet first
    python scripts/generate_apworld_mapping.py --dry-run  # Preview without writing
"""

import argparse
import csv
import io
import json
import re
import urllib.request
import zipfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR / "data"
SPREADSHEET_CSV = Path("docs/json/archipelago-games-sheet/playable_worlds.csv")
OUTPUT_FILE = DATA_DIR / "apworld-spreadsheet-mapping.json"

# Google Sheets gviz API
SPREADSHEET_ID = "1iuzDTOAvdoNe8Ne8i461qGNucg5OuEoF-Ikqs8aUQZw"
PLAYABLE_WORLDS_GID = 58422002

# Manual mappings for games that can't be automatically matched
MANUAL_MAPPINGS = {
    # Spreadsheet name -> apworld_id
    "Donkey Kong Country 2: Diddy's Kong Quest": "dkc2",
    "Mega Man X": "mmx",
    "Mega Man X2": "mmx2",
    "Mega Man X3": "mmx3",
    "The Legend of Zelda": "tloz",
    "A Link to the Past": "alttp",
    "Links Awakening DX": "ladx",
    "Ocarina of Time": "oot",
    "The Wind Waker": "tww",
    "SMZ3": "smz3",
    "Super Metroid": "sm",
    "Pokemon Red and Blue": "pokemon_rb",
    "Pokemon Emerald": "pokemon_emerald",
    "Starcraft 2": "sc2",
    "Kingdom Hearts 2": "kh2",
    "Risk of Rain 2": "ror2",
    "Sonic Adventure 2 Battle": "sa2b",
    "DOOM 1993": "doom_1993",
    "DOOM II": "doom_ii",
    "Yu-Gi-Oh! 2006": "yugioh06",
    "Kirby's Dream Land 3": "kdl3",
    "MegaMan Battle Network 3": "mmbn3",
    "Mario & Luigi Superstar Saga": "mlss",
    "Castlevania - Circle of the Moon": "cotm",
    "Castlevania 64": "cv64",
    "The Messenger": "messenger",
    "The Witness": "witness",
    "A Hat in Time": "ahit",
    "A Short Hike": "shorthike",
    "Jak and Daxter: The Precursor Legacy": "jakanddaxter",
    "Final Fantasy Mystic Quest": "ffmq",
    "Lufia II Ancient Cave": "lufia2ac",
    "Secret of Evermore": "soe",
    "Yoshi's Island": "yoshisisland",
    "Super Mario Land 2: The Golden Coins": "sml2",
    "Celeste (Open World)": "celeste",
    "Old School Runescape": "osrs",
    "Choo-Choo Charles": "choochoocharles",
}


def normalize_name(name: str) -> str:
    """Normalize a game name for matching."""
    # Convert to lowercase
    name = name.lower()
    # Remove special characters, keep alphanumeric and spaces
    name = re.sub(r"[^a-z0-9\s]", "", name)
    # Replace spaces with underscores
    name = re.sub(r"\s+", "_", name.strip())
    return name


def fetch_spreadsheet_csv() -> str:
    """Fetch latest spreadsheet data from Google Sheets."""
    url = f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/gviz/tq?tqx=out:csv&gid={PLAYABLE_WORLDS_GID}"
    print(f"Fetching spreadsheet from Google Sheets...")
    with urllib.request.urlopen(url, timeout=30) as response:
        return response.read().decode("utf-8")


def parse_spreadsheet_csv(csv_content: str) -> list[dict]:
    """Parse the playable worlds CSV into a list of games."""
    games = []
    reader = csv.reader(io.StringIO(csv_content))
    rows = list(reader)

    # Skip header rows (first 5 rows)
    for row in rows[5:]:
        if len(row) >= 2 and row[0].strip() and row[0] not in ["Game", ""]:
            game_name = row[0].strip()
            status = row[1].strip() if len(row) > 1 else ""

            if status and status not in ["Status"]:
                games.append({
                    "spreadsheet_name": game_name,
                    "status": status,
                    "normalized": normalize_name(game_name),
                })

    return games


def get_apworld_metadata(apworld_path: Path) -> dict | None:
    """Extract metadata from an apworld file."""
    try:
        with zipfile.ZipFile(apworld_path) as zf:
            for name in zf.namelist():
                if name.endswith("archipelago.json"):
                    data = json.loads(zf.read(name))
                    return {
                        "apworld_id": apworld_path.stem,
                        "apworld_filename": apworld_path.name,
                        "apworld_game": data.get("game"),
                        "normalized_game": normalize_name(data.get("game", "")),
                        "normalized_id": normalize_name(apworld_path.stem),
                    }
    except Exception as e:
        print(f"  Warning: Could not read {apworld_path.name}: {e}")
    return None


def scan_apworlds(directories: list[Path]) -> list[dict]:
    """Scan directories for apworld files and extract metadata."""
    apworlds = []
    for directory in directories:
        if not directory.exists():
            continue
        for apworld_path in sorted(directory.glob("*.apworld")):
            metadata = get_apworld_metadata(apworld_path)
            if metadata:
                metadata["location"] = directory.name
                apworlds.append(metadata)
    return apworlds


def match_games_to_apworlds(
    games: list[dict],
    apworlds: list[dict],
    manual_mappings: dict[str, str],
) -> tuple[dict, list, list]:
    """Match spreadsheet games to apworld files."""
    matched = {}
    unmatched_games = []

    # Build lookup tables
    apworld_by_id = {a["apworld_id"]: a for a in apworlds}
    apworld_by_game = {a["apworld_game"]: a for a in apworlds if a["apworld_game"]}
    apworld_by_norm_game = {a["normalized_game"]: a for a in apworlds if a["normalized_game"]}
    apworld_by_norm_id = {a["normalized_id"]: a for a in apworlds}

    used_apworlds = set()

    for game in games:
        spreadsheet_name = game["spreadsheet_name"]
        normalized = game["normalized"]
        status = game["status"]

        apworld = None
        match_method = None

        # 1. Check manual mapping first
        if spreadsheet_name in manual_mappings:
            apworld_id = manual_mappings[spreadsheet_name]
            if apworld_id in apworld_by_id:
                apworld = apworld_by_id[apworld_id]
                match_method = "manual"

        # 2. Exact game title match
        if not apworld and spreadsheet_name in apworld_by_game:
            apworld = apworld_by_game[spreadsheet_name]
            match_method = "exact_title"

        # 3. Normalized game title match
        if not apworld and normalized in apworld_by_norm_game:
            apworld = apworld_by_norm_game[normalized]
            match_method = "normalized_title"

        # 4. Normalized ID match
        if not apworld and normalized in apworld_by_norm_id:
            apworld = apworld_by_norm_id[normalized]
            match_method = "normalized_id"

        if apworld:
            matched[spreadsheet_name] = {
                "apworld_id": apworld["apworld_id"],
                "apworld_filename": apworld["apworld_filename"],
                "apworld_game": apworld["apworld_game"],
                "status": status,
                "match_method": match_method,
            }
            used_apworlds.add(apworld["apworld_id"])
        else:
            unmatched_games.append(game)

    # Find unmatched apworlds
    unmatched_apworlds = [
        a for a in apworlds
        if a["apworld_id"] not in used_apworlds
    ]

    return matched, unmatched_games, unmatched_apworlds


def main():
    parser = argparse.ArgumentParser(
        description="Generate APWorld spreadsheet mapping from CSV and apworld files"
    )
    parser.add_argument(
        "--fetch",
        action="store_true",
        help="Fetch latest spreadsheet data from Google Sheets first",
    )
    parser.add_argument(
        "--csv",
        type=Path,
        default=SPREADSHEET_CSV,
        help=f"Path to spreadsheet CSV (default: {SPREADSHEET_CSV})",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=OUTPUT_FILE,
        help=f"Output path for mapping JSON (default: {OUTPUT_FILE})",
    )
    parser.add_argument(
        "--custom-worlds",
        type=Path,
        default=Path("custom_worlds"),
        help="Path to custom_worlds directory",
    )
    parser.add_argument(
        "--disabled-dir",
        type=Path,
        default=Path("custom_worlds_disabled"),
        help="Path to disabled apworlds directory",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview results without writing output file",
    )
    args = parser.parse_args()

    # Get spreadsheet data
    if args.fetch:
        csv_content = fetch_spreadsheet_csv()
        # Optionally save the fetched CSV
        args.csv.parent.mkdir(parents=True, exist_ok=True)
        args.csv.write_text(csv_content)
        print(f"Saved to {args.csv}")
    else:
        if not args.csv.exists():
            print(f"Error: CSV file not found: {args.csv}")
            print("Run with --fetch to download from Google Sheets")
            return 1
        csv_content = args.csv.read_text()

    # Parse spreadsheet
    print(f"Parsing spreadsheet CSV...")
    games = parse_spreadsheet_csv(csv_content)
    print(f"  Found {len(games)} games in spreadsheet")

    # Scan apworlds
    print(f"Scanning apworld directories...")
    apworlds = scan_apworlds([args.custom_worlds, args.disabled_dir])
    print(f"  Found {len(apworlds)} apworld files")

    # Match games to apworlds
    print(f"Matching games to apworlds...")
    matched, unmatched_games, unmatched_apworlds = match_games_to_apworlds(
        games, apworlds, MANUAL_MAPPINGS
    )

    # Get currently disabled apworlds
    disabled_apworlds = [
        a["apworld_id"] for a in apworlds
        if a.get("location") == "custom_worlds_disabled"
    ]

    # Build output
    output = {
        "description": "Mapping between spreadsheet game names and apworld IDs",
        "matched": matched,
        "unmatched_spreadsheet": unmatched_games,
        "unmatched_apworlds": [
            {
                "apworld_id": a["apworld_id"],
                "apworld_game": a["apworld_game"],
                "location": a["location"],
            }
            for a in unmatched_apworlds
        ],
        "currently_disabled": sorted(disabled_apworlds),
    }

    # Print summary
    print(f"\n=== Summary ===")
    print(f"Matched: {len(matched)}")
    print(f"Unmatched spreadsheet games: {len(unmatched_games)}")
    print(f"Unmatched apworlds: {len(unmatched_apworlds)}")
    print(f"Currently disabled: {len(disabled_apworlds)}")

    # Match methods breakdown
    methods = {}
    for info in matched.values():
        m = info["match_method"]
        methods[m] = methods.get(m, 0) + 1
    print(f"\nMatch methods:")
    for method, count in sorted(methods.items()):
        print(f"  {method}: {count}")

    # Status breakdown
    statuses = {}
    for info in matched.values():
        s = info["status"]
        statuses[s] = statuses.get(s, 0) + 1
    print(f"\nMatched by status:")
    for status, count in sorted(statuses.items(), key=lambda x: -x[1]):
        print(f"  {status}: {count}")

    if args.dry_run:
        print(f"\n[DRY RUN] Would write to: {args.output}")
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with open(args.output, "w") as f:
            json.dump(output, f, indent=2)
        print(f"\nWritten to: {args.output}")

    return 0


if __name__ == "__main__":
    exit(main())
