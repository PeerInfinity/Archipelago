# Archipidle JSON Client

A web client for [Archipelago](https://github.com/ArchipelagoMW/Archipelago) with enhanced location tracking using JSON rules. This is a fork of [archipidle-client](https://github.com/LegendaryLinux/archipidle-client) that adds support for loading and processing location access rules from Archipelago's JSON export.

## Features

- All original Archipidle features:
  - Connect to Archipelago servers
  - Track game progress
  - Manage inventory
  - Console interface
- Enhanced JSON rule integration:
  - Load rules exported from your Archipelago game
  - Track available and locked locations
  - Interactive region exploration with path discovery
  - Visualize routes and identify blocking conditions
  - Real-time updates as you collect items
  - Visual indication of newly available locations
  - Sort and filter locations by status
  - Detailed rule inspection

## Getting Started

### Quick Start

1. Generate your game using the [JSONExport branch](https://github.com/PeerInfinity/Archipelago/tree/JSONExport) of Archipelago
2. Find your generated files:
   - `.archipelago` file (game data)
   - `rules.json` file (location access rules)
3. Visit the [Archipidle JSON Client](https://peerinfinity.github.io/Archipelago/)
4. Click "Load JSON" and select your `rules.json` file
5. Connect to your Archipelago server as normal

### Interface Overview

The interface combines classic Archipidle features with advanced location and region tracking:

- Left: Inventory management
  - Items organized by category
  - Click to add items (SHIFT+click to remove)
  - Multiple clicks track item count
  - Toggle categorization and sorting options
- Center: Archipidle console
  - Server connection
  - Command input
  - Game progress tracking
  - Location check timer
- Right: Location and region tracking
  - Three view modes:
    - **Locations**: Grid view of all game locations
    - **Regions**: Interactive map of game regions with paths
    - **Test Cases**: For development and verification
  - Sort and filter options
  - Interactive navigation between regions and locations
  - Path discovery and visualization
  - Rule inspection for debugging

## Key Features

### Interactive Region Exploration

- View complete region graph with exits and entrances
- Find and visualize paths to any region
- Identify exactly which items or conditions are blocking progression
- Navigate through the game world with interactive region links

### Location Tracking

- Real-time updates as your inventory changes
- Color-coded status indicators (available, locked, checked)
- Highlight newly available locations
- Detailed rule inspection to understand requirements

### Inventory Management

- Categorized item display with count badges
- Progressive item support (swords, gloves, etc.)
- Options to hide unowned items and categories
- Automatic event item collection

### Rule Visualization

- Examine the complete logic tree for any location
- See which conditions are passing or failing
- Consolidated view of blocking requirements
- Debug information for developers

## Development

This client is part of a larger system for using Archipelago's location access rules in web interfaces:

- Backend components:

  - Rule export system using AST analysis
  - Region graph generation
  - Helper function preservation
  - Test case generation

- Frontend components:
  - Rule evaluation engine
  - State management system
  - Helper function implementation
  - Interactive UI components
  - Testing infrastructure

### Architecture

The frontend uses a modular architecture:

- `stateManager.js`: Centralized state handling
- `ruleEngine.js`: Rule evaluation system
- Game-specific modules:
  - `helpers.js`: Native implementations of game helpers
  - `inventory.js`: Inventory tracking with progressive items
  - `state.js`: Game state and flags
- UI components:
  - `gameUI.js`: Main interface coordination
  - `locationUI.js`: Location view management
  - `regionUI.js`: Region view with path discovery
  - `inventoryUI.js`: Inventory display and interaction
  - `testCaseUI.js`: Test case execution

## Credits

This project builds on:

- [Archipidle](https://github.com/LegendaryLinux/archipidle-client) - Original web client
- [Archipelago](https://github.com/ArchipelagoMW/Archipelago) - Game randomizer system
