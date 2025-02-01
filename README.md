# Archipelago JSON Rules System

A system for exporting Archipelago's location access rules to JSON format, enabling web-based interfaces and tools.

## Components

### 1. JSON Rule Export
- Automatically extracts game rules from Archipelago's Python codebase
- Converts rules to a standardized JSON format
- Generated alongside .archipelago files during game generation

### 2. Web Interfaces

#### Archipidle-json
A web interface extending the Archipidle client with rule-based location tracking:
- Load and interact with rules from your generated game
- Track inventory and available locations
- Integrates with existing Archipidle console features

[Try it live](https://peerinfinity.github.io/Archipelago/) | [User Guide](/docs/json/archipidle.md)

#### Rule Test Runner
A development tool for validating rule conversion:
- Runs the same test cases in JavaScript as in Python
- Verifies consistent behavior between backend and frontend
- Used for development and testing

[Developer Guide](/docs/json/test-runner.md)

## Architecture
```
worlds/generic/RuleParser/  # Backend rule extraction
frontend/                   # Web interfaces
  assets/                  # Shared JavaScript modules
  test_runner.html        # Developer testing interface
  index.html             # Archipidle-json interface
```

## For Users
- Generate your game normally through Archipelago
- A rules.json file will be created alongside your .archipelago file
- Open Archipidle-json in your browser
- Load your rules.json file to start tracking

See the [User Guide](/docs/json/archipidle.md) for detailed instructions.

## For Developers
- The rule export system converts Python rule functions to JSON
- A test runner validates consistent behavior
- New interfaces can be built using the exported JSON format

See the [Developer Guide](/docs/json/test-runner.md) for implementation details.

## Credits

Built on:
- [Archipelago](https://github.com/ArchipelagoMW/Archipelago) - Game randomizer and multiworld system
- [Archipidle](https://github.com/LegendaryLinux/archipidle-client) - Web client for Archipelago
