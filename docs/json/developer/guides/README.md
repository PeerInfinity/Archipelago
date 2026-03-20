# Developer Guides

This directory contains in-depth guides covering specific architectural components and development workflows for the Archipelago JSON Export Tools project.

## Core Architecture Guides

These guides explain the fundamental systems that power the web client:

- **[Module System](./module-system.md)**: Understanding how modules are loaded, registered, and initialized in the application
- **[Event System](./event-system.md)**: How modules communicate using the Event Bus and Event Dispatcher
- **[State Management](./state-management.md)**: The StateManager, Web Workers, and how game state flows through the application
- **[UI and Layout System](./ui-and-layout.md)**: Golden Layout integration and how to create UI panels
- **[Desktop and Mobile Layout](./desktop-and-mobile-layout.md)**: Device detection, desktop vs mobile layout modes, responsive breakpoints, and column navigation

## Development Guides

Practical guides for common development tasks:

- **[Creating Modules](./creating-modules.md)**: Step-by-step guide to building a new frontend module
- **[Testing Pipeline](./testing-pipeline.md)**: How the automated testing system validates game logic accuracy
- **[Test Results](./test-results.md)**: Understanding and generating test result reports
- **[Fuzzer Debugging](./fuzzer-debugging.md)**: Running the UT fuzzer and debugging logic mismatches

## Conversion Tools

Tools for converting between formats and generating code:

- **[Rule Format Converter](./format-converter.md)**: Bidirectional conversion between Archipelago-CC and Rule Builder JSON formats
- **[World Generator](./world-generator.md)**: Generate complete Archipelago world packages from JSON rules files

## Reference Documents

- **[Module Info Status](./module_info_status.md)**: Auto-generated report on module metadata completeness

## See Also

- **[System Architecture](../architecture.md)**: High-level overview of the entire project structure
- **[Reference Documentation](../reference/)**: Detailed technical references for specific subsystems
