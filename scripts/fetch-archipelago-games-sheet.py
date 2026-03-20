#!/usr/bin/env python3
"""
Fetch the latest Archipelago Games Sheet data from Google Sheets.

Downloads all sheets from the community-maintained spreadsheet:
https://docs.google.com/spreadsheets/d/1iuzDTOAvdoNe8Ne8i461qGNucg5OuEoF-Ikqs8aUQZw

Usage:
    python scripts/fetch-archipelago-games-sheet.py [--output-dir PATH]
"""

import argparse
import csv
import io
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


SPREADSHEET_ID = "1iuzDTOAvdoNe8Ne8i461qGNucg5OuEoF-Ikqs8aUQZw"
SPREADSHEET_URL = f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}"

# Sheet IDs discovered from the spreadsheet
SHEETS = {
    "playable_worlds": 58422002,
    "core_verified": 1675722515,
    "tools_and_meta": 857819707,
}


def fetch_sheet_csv(sheet_name: str, gid: int) -> str:
    """Fetch a sheet as CSV using Google's gviz API."""
    url = f"{SPREADSHEET_URL}/gviz/tq?tqx=out:csv&gid={gid}"
    print(f"Fetching {sheet_name}...")

    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            return response.read().decode("utf-8")
    except Exception as e:
        print(f"  Error fetching {sheet_name}: {e}")
        return ""


def parse_playable_worlds(csv_content: str) -> dict[str, list[dict]]:
    """Parse the playable worlds CSV into games organized by status."""
    games_by_status = {}

    reader = csv.reader(io.StringIO(csv_content))
    rows = list(reader)

    # Skip header rows (first 5 rows are headers/instructions)
    for row in rows[5:]:
        if len(row) >= 4 and row[0].strip() and row[0] not in ["Game", ""]:
            game = row[0].strip()
            status = row[1].strip() if len(row) > 1 else ""
            source = row[2].strip() if len(row) > 2 else ""
            notes = row[3].strip() if len(row) > 3 else ""

            if status and status not in ["Status"]:
                if status not in games_by_status:
                    games_by_status[status] = []
                games_by_status[status].append({
                    "game": game,
                    "source": source,
                    "notes": notes,
                })

    return games_by_status


def generate_readme(games_by_status: dict[str, list[dict]]) -> str:
    """Generate a markdown README summarizing the games."""
    lines = [
        "# Archipelago Games Sheet",
        f"Extracted from: {SPREADSHEET_URL}",
        f"Last updated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}",
        "",
        "## Files",
        "- `playable_worlds.csv` - Full list of playable worlds (APWorld Only, Merged, In Review, Stable, Unstable)",
        "- `core_verified.csv` - Games included with main Archipelago installation",
        "- `tools_and_meta.csv` - Tools, meta games, and hint games",
        "",
        "---",
        "",
        "# Playable Worlds Summary",
    ]

    status_order = ["APWorld Only", "Merged", "In Review", "Stable", "Unstable", "Broken in Main"]

    for status in status_order:
        if status in games_by_status:
            games = games_by_status[status]
            lines.append(f"\n## {status} ({len(games)} games)\n")
            lines.append("| Game | Notes |")
            lines.append("|------|-------|")

            for g in games:
                note = g["notes"].replace("\n", " ").replace("|", "/") if g["notes"] else ""
                if len(note) > 100:
                    note = note[:100] + "..."
                lines.append(f"| {g['game']} | {note} |")

    # Total count
    total = sum(len(games) for games in games_by_status.values())
    lines.append(f"\n---\n\n**Total Playable Worlds: {total}**\n")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Fetch the latest Archipelago Games Sheet data"
    )
    parser.add_argument(
        "--output-dir", "-o",
        type=Path,
        default=Path("docs/json/archipelago-games-sheet"),
        help="Output directory for downloaded files (default: docs/json/archipelago-games-sheet)",
    )
    args = parser.parse_args()

    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Downloading Archipelago Games Sheet...")
    print(f"Source: {SPREADSHEET_URL}")
    print(f"Output: {output_dir}/")
    print()

    # Fetch all sheets
    for sheet_name, gid in SHEETS.items():
        csv_content = fetch_sheet_csv(sheet_name, gid)
        if csv_content:
            output_file = output_dir / f"{sheet_name}.csv"
            output_file.write_text(csv_content)

            # Count lines (excluding empty)
            line_count = len([l for l in csv_content.splitlines() if l.strip()])
            print(f"  Saved {output_file} ({line_count} rows)")

    # Generate README from playable worlds
    playable_csv = (output_dir / "playable_worlds.csv").read_text()
    games_by_status = parse_playable_worlds(playable_csv)

    readme_content = generate_readme(games_by_status)
    readme_file = output_dir / "README.md"
    readme_file.write_text(readme_content)

    print()
    print("Summary:")
    for status, games in sorted(games_by_status.items(), key=lambda x: -len(x[1])):
        print(f"  {status}: {len(games)} games")

    total = sum(len(games) for games in games_by_status.values())
    print(f"\nTotal: {total} playable worlds")
    print(f"\nDone! Files saved to {output_dir}/")


if __name__ == "__main__":
    main()
