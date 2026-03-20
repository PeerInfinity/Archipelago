# Developer Reference Documentation

This directory contains detailed technical reference material for specific subsystems and features of the Archipelago JSON Export Tools project.

## Core Systems

- **[State Snapshots](./state-snapshots.md)**: Complete reference for StateManager snapshot structure and static data
- **[Logging System](./logging-system.md)**: Comprehensive guide to the structured logging system
- **[URL Parameters](./url-parameters.md)**: All supported URL parameters for configuring the web client
- **[Rule Types Reference](./rule-types-reference.md)**: Complete catalog of all rule types supported by the rule system

## Exporter Internals

- **[Handler Configuration](./handler-configuration.md)**: Complete reference for all `BaseGameExportHandler` class attributes
- **[State Method Transformations](./state-method-transformations.md)**: How Python `state.has()`, `state.can_reach()`, etc. become JSON rules
- **[Closure Function Analyzer](./closure-function-analyzer.md)**: Architecture of the closure/captured-function analyzer
- **[Binary Operation Optimizations](./binary-op-optimizations.md)**: Compile-time list and collection optimizations

## Project Information

- **[Repository Changes](./repository-changes.md)**: Overview of changes made to the Archipelago codebase for this fork
  - See also: **[Diff Files](../diffs/)** for detailed line-by-line changes

## Game-Specific References

- **[A Link to the Past Specific Data](./alttp-specific-data.md)**: ALTTP-specific data structures, helper functions, and implementation details

## See Also

- **[Developer Guides](../guides/)**: In-depth guides on architectural components
- **[System Architecture](../architecture.md)**: High-level overview of the project structure
