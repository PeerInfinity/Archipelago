# Overview: What Is This?

The Archipelago JSON Export Tools project provides an advanced tracker for [Archipelago](https://archipelago.gg/) multiworld randomizer games.

**Try the Live Demo:** Either the **[Latest Stable Version](https://peerinfinity.github.io/Archipelago/)** or the **[Latest Development Version](https://peerinfinity.github.io/Archipelago-CC/)**

## What Does It Do?

This application connects to an Archipelago server and tracks your game state in real-time. When you receive items or check locations in your game, the tracker updates automatically. Key features include:

- **Logic-Aware Tracking:** See which locations are accessible with your current items, color-coded by accessibility status.
- **Visual Rule Trees:** Explore the specific rules for any location or exit to understand exactly what's required.
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

To use the tracker with your own multiworld games, you'll need to run a local setup that generates the required `rules.json` files.

### Setup

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
