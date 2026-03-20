# Overview: What Is This?

The Archipelago JSON Export Tools project provides an advanced tracker for [Archipelago](https://archipelago.gg/) multiworld randomizer games. Archipelago is an open-source framework that connects multiple single-player games into one cooperative multiplayer experience, where items from one game can be found in another player's game.

**Ready to get started?** See the **[Quick Start Guide](./quick-start.md)** for step-by-step instructions.

**Try the Live Demo:** Either the **[Latest Stable Version](https://peerinfinity.github.io/Archipelago/)** or the **[Latest Development Version](https://peerinfinity.github.io/Archipelago-CC/)**

## What Does It Do?

This application connects to an Archipelago server and tracks your game state in real-time. When you receive items or check locations in your game, the tracker updates automatically. Key features include:

- **Logic-Aware Tracking:** See which locations are accessible with your current items, color-coded by accessibility status.
- **Visual Rule Trees:** Explore the specific rules for any location or exit to understand exactly what's required.
- **Region Graph:** Interactive graph visualization showing how all regions are connected, with color coding for reachability and location status.
- **Discovery Mode:** Regions and exits are gradually revealed as you explore them, instead of shown all at once — useful for entrance shuffle seeds.
- **Path Analysis:** Determine what items you need to reach a new region.
- **Customizable Interface:** Drag, drop, stack, and resize panels to create your ideal workspace.

## Game Compatibility

The tracker currently has full logic support for the majority of official Archipelago games with default settings. Compatibility testing is ongoing, with work continuing on edge cases and non-default configurations.

For the current compatibility status of each game, see the [Test Results Summary](../developer/test-results/test-results-summary.md).

## Quick Demo

The [live demo](https://peerinfinity.github.io/Archipelago/) includes preset files for each supported game. To explore:

1. Open the demo
2. Find the **Presets** panel
3. Select any game from the dropdown
4. The preset includes links to download the `.archipelago` file and other generation outputs

This lets you explore the interface and see how the logic tracking works without setting anything up locally.

## Using the Tracker with Your Own Games

To use the tracker with your own multiworld games, you need the JSON export tools installed so that seed generation produces `rules.json` files. There are two ways to set this up.

### Option 1: JSON Tools Installer (Recommended)

If you already have [Archipelago](https://github.com/ArchipelagoMW/Archipelago/releases) installed, the JSON Tools Installer is the easiest way to get started. It's a `.apworld` package that adds JSON export capabilities to your existing Archipelago installation — no need to clone a separate repository.

1. Download the [`json_tools_installer.apworld`](https://github.com/PeerInfinity/Archipelago-CC/raw/main/apworlds/json_tools_installer.apworld) file
2. Place it in your Archipelago `custom_worlds/` directory
3. Launch Archipelago — three new entries appear in the Launcher:
   - **JSON Tools Installer** — Install or update the JSON Tools components
   - **JSON Tools Status** — Check what's installed and your current configuration
   - **JSON Tools Scripts** — Run utility scripts for setup and testing
4. Open **JSON Tools Installer** and click Install

The installer downloads the exporter, frontend, and other components directly from GitHub. It supports both a stable and a development version, and lets you choose which components to install. Once installed, JSON export runs automatically during seed generation via runtime hooks — no modifications to your Archipelago source files are required.

### Option 2: Clone the Repository

For full access to the source code, or if you want to contribute to development, you can clone the repository directly.

**Which repository should I use?** Clone `PeerInfinity/Archipelago` (shown below) for a clean setup. The `-CC` variant is for active development with Claude Code. See [Tips & Tricks](./tips-and-tricks.md#which-repository-should-i-use) for details.

```bash
# Clone the repository
git clone -b JSONExport https://github.com/PeerInfinity/Archipelago.git archipelago-json
cd archipelago-json

# Run the automated setup script
python scripts/setup/setup_dev_environment.py
```

For detailed setup instructions, see the [Developer Getting Started Guide](../developer/getting-started.md).

### Generating Games

Once set up, run the multiworld generation process as normal using your YAML configuration files. When generation completes, a preset entry is automatically created in the `frontend/presets/` directory containing the `rules.json` file for that multiworld.

### Running the Tracker

1. Start the Archipelago server with your generated `.archipelago` file
2. Start the local web server:
   ```bash
   python -m http.server 8000
   ```
3. Open the tracker at: `http://localhost:8000/frontend/`
4. In the **Console** panel, connect to your Archipelago server

### URL Parameters

You can also connect automatically using URL parameters:

```
http://localhost:8000/frontend/?game=adventure&seed=1&autoConnect=true&server=ws://localhost:38281&playerName=Player1
```

## Universal Tracker Integration

This project also includes an enhanced version of [Universal Tracker](https://github.com/FarisTheAncient/Archipelago) with three tracking modes that automatically select the best one for each game. This improves tracking accuracy for games with randomized logic (entrance shuffle, random starting locations, etc.) and adds `/explain` support for understanding why locations are or aren't accessible. See the [Universal Tracker Enhancements](../features/universal-tracker.md) overview for details.

## Game Modes

Beyond standard tracking, the frontend supports several alternate game modes:

- **[Loops](../features/loops.md):** An incremental/idle game mode where you queue actions, spend mana, and earn XP across loops to optimize your way through the randomizer.
- **[Maze Metagame](../features/maze-metagame.md):** Layers A-Mazing-Idle on top of tracking — solve mazes before you can check locations or move to new regions.
- **Text Adventure:** Play through the randomizer as a text-based adventure game.

## New APWorlds

This project includes several custom Archipelago worlds:

- **[MetaMath](../../worlds/metamath/docs/README.md):** Turns mathematical proofs from the MetaMath database into playable Archipelago worlds. Each proof step is a location, each proven statement is an item.
- **[DepGraph](../features/depgraph.md):** Converts any directed acyclic graph (tech trees, skill trees, to-do lists) into a playable world.
- **[Journey to Ascension](../../worlds/jta/docs/en_Journey%20to%20Ascension.md):** Archipelago integration for the incremental/idle game, with automatic cost rebalancing for randomized perk placement. [Demo](https://peerinfinity.github.io/Archipelago-CC/?mode=jta)

## How Synchronization Works

Once connected to an Archipelago server:

- **Locations** checked on the server appear as checked in all tracker panels
- **Items** received on the server appear in your inventory
- **Accessibility** updates in real-time as your inventory changes

Some panels include buttons to manually check locations, which sends the check command to the server. This is primarily for testing purposes.

## What's Next?

This tracker is under active development. The core tracking functionality is working, with additional features in progress. See the [Project Roadmap](../project-roadmap.md) for planned features and current priorities.

## Further Reading

- **[Quick Start Guide](./quick-start.md):** Step-by-step instructions for basic usage
- **[Standard Client Guide](./standard-client.md):** Detailed guide to all tracking features
- **[Tips & Tricks](./tips-and-tricks.md):** Console commands, shortcuts, and FAQs
- **[Features Index](../features/README.md):** Overview of all major features including developer tools
