# Archipelago JSON Rules System

A system for exporting Archipelago's location access rules to JSON format, enabling web-based interfaces and tools.

## Components

### 1. JSON Rule Export

- Extracts game rules from Archipelago's Python codebase
- Converts rules to a standardized JSON format with region graph data
- Preserves helper functions rather than expanding them
- Generated alongside .archipelago files during game generation

### 2. Web Interfaces

#### Archipidle-json

A web interface extending the Archipidle client with rule-based location and region tracking:

- Load and interact with rules from your generated game
- Track inventory and available locations
- View regions, paths, and blocking conditions
- Integrates with existing Archipidle console features

[Try it live](https://peerinfinity.github.io/Archipelago/) | [User Guide](/docs/json/archipidle.md)

#### Rule Test Runner

A development tool for validating rule conversion:

- Runs the same test cases in JavaScript as in Python
- Verifies consistent behavior between backend and frontend
- Interactive test case execution and debugging

[Developer Guide](/docs/json/test-runner.md)

## Key Features

- **Complete region graph export** with entrances, exits, and metadata
- **Native JavaScript helper implementations** matching Python behavior
- **Interactive path discovery** to visualize routes between regions
- **Automatic event item collection** when locations become accessible
- **Progressive item support** with proper dependencies
- **Centralized state management** for consistent data access
- **Comprehensive testing infrastructure** with automated validation

## Architecture

```
exporter/                  # Backend rule extraction
  analyzer.py             # Rule function analysis using AST
  exporter.py             # Region graph and rule export
  games/                  # Game-specific helper handling

frontend/                  # Web interfaces
  assets/                 # Shared JavaScript modules
    ruleEngine.js         # Rule evaluation engine
    stateManager.js       # Game state tracking
    games/alttp/          # Game-specific implementations
      helpers.js          # ALTTP helper functions
      inventory.js        # Inventory management
      state.js            # Game state handling
    gameUI.js             # Main interface component
    locationUI.js         # Location view component
    regionUI.js           # Region view component
    testCaseUI.js         # Test case interface
  test_runner.html        # Developer testing interface
  index.html              # Archipidle-json interface
```

## For Users

### Getting Started

1. Generate your game normally through Archipelago
2. A rules.json file will be created alongside your .archipelago file
3. Open Archipidle-json in your browser
4. Click "Load JSON" and select your rules.json file
5. Use the interface to track your inventory and available locations

### Interface Views

- **Locations View**: Shows all game locations with accessibility status
- **Regions View**: Displays regions, exits, and paths with interactive navigation
- **Test Cases View**: For developers to verify rule behavior

See the [User Guide](/docs/json/archipidle.md) for detailed instructions.

## For Developers

### Rule Export System

- Analyzes Python rule functions using AST
- Preserves helper functions for JavaScript implementation
- Exports complete region graph with entrances, exits, and metadata
- Includes game mode, settings, and progression mapping

### Rule Evaluation

- JavaScript rule engine evaluates standardized rule format
- Native implementation of helper functions
- Breadth-first search for region traversal
- Event collection and path finding

### Testing Infrastructure

- Automated test execution using Playwright
- Comprehensive debug logging and trace capture
- Test result analysis and failure categorization
- Interactive test case execution from UI

See the [Developer Guide](/docs/json/development.md) and [Testing Guide](/docs/json/test-runner.md) for implementation details.

## Current Status

As of March 2025:

- Core system is functional with passing tests for Light World locations
- Helper-based architecture implemented and working
- Region traversal and path finding operational
- Interactive UI with multiple view modes
- Remaining work on additional helpers and console integration

See the [Development Update](/docs/json/development-update.md) for recent progress.

See the [Project Roadmap](/docs/json/project-roadmap.md) for future plans.

## Credits

Built on:

- [Archipelago](https://github.com/ArchipelagoMW/Archipelago) - Game randomizer and multiworld system
- [Archipidle](https://github.com/LegendaryLinux/archipidle-client) - Web client for Archipelago
