# Archipidle JSON Client

A web client for [Archipelago](https://github.com/ArchipelagoMW/Archipelago) with enhanced location tracking using JSON rules. This is a fork of [archipidle-client](https://github.com/LegendaryLinux/archipidle-client) that adds support for loading and processing location access rules from Archipelago's JSON export.

## Features

- All original Archipidle features:
  - Connect to Archipelago servers
  - Track game progress
  - Manage inventory
  - Console interface
  
- New JSON rule integration:
  - Load rules exported from your Archipelago game
  - Track available and locked locations
  - Real-time location updates as you collect items
  - Visual indication of newly available locations
  - Sort and filter locations by status
  - Detailed rule inspection for each location

## Getting Started

### Quick Start
1. Generate your game using the [JSONExport branch](https://github.com/PeerInfinity/Archipelago/tree/JSONExport) of Archipelago
2. Find your generated files:
   - `.archipelago` file (game data)
   - `rules.json` file (location access rules)
3. Visit the [Archipidle JSON Client](https://peerinfinity.github.io/archipidle-client/)
4. Click "Load JSON" and select your `rules.json` file
5. Connect to your Archipelago server as normal

### Interface Overview

The interface combines classic Archipidle features with new location tracking:

- Left: Inventory management
  - Items organized by category
  - Click to add/remove items
  - Automatic location updates
  
- Center: Archipidle console
  - Server connection
  - Command input
  - Game progress
  
- Right: Location tracking
  - Sort and filter options
  - Location status indicators
  - Rule inspection
  - Progress visualization

## Development

This client is part of a larger system for using Archipelago's location access rules in web interfaces:

- Backend: [Archipelago JSONExport Branch](https://github.com/PeerInfinity/Archipelago/tree/JSONExport)
  - Exports game rules to JSON
  - Generates test cases
  - Maintains rule consistency

- Frontend (this repository):
  - Rule evaluation engine
  - Location tracking interface
  - Integration with Archipidle

### Local Development

1. Clone the repository
2. Install dependencies (if any)
3. Start a local server
4. Open `public/index.html` in your browser

## Credits

This project builds on:
- [Archipidle](https://github.com/LegendaryLinux/archipidle-client) - Original web client
- [Archipelago](https://github.com/ArchipelagoMW/Archipelago) - Game randomizer