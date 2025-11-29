# Archipelago JSON Export Tools - Documentation

This is the official documentation for the Archipelago JSON Export Tools and its associated web client. This documentation provides comprehensive guides for both users of the application and developers looking to contribute or understand its architecture.

This project is a fork of the main Archipelago project that focuses on two key areas:

1.  A Python-based system to export a game's logic (location access rules, region connections, item data) into a standardized JSON format.
2.  A modular, feature-rich web client that consumes this JSON to provide advanced tracking, accessibility analysis, and other tools.

**Try the Live Demo:** Either the **[Latest Stable Version](https://peerinfinity.github.io/Archipelago/)** or the **[Latest Development Version](https://peerinfinity.github.io/Archipelago-CC/)**

For the main project overview and credits, please see the [README.md at the project root](../../README.md).

## Documentation Sections

This documentation is organized into the following main sections:

### 1. User Guides

This section is for anyone who wants to use the JSON Web Client to play or track their Archipelago games. These guides cover the application's features from a user's perspective.

- **[Overview: What Is This?](./user/overview.md)**: Start here if you're new. Learn what this project does, see game compatibility, and understand how to use the tracker.
- **[Quick Start Guide](./user/quick-start.md)**: A fast-paced introduction to getting the client running.
- **[Standard Client Guide](./user/standard-client.md)**: A detailed guide on using the client for tracking, checking accessibility, and connecting to a multiworld server.
- **[Tips & Tricks](./user/tips-and-tricks.md)**: A collection of useful notes, console commands, and frequently asked questions.

### 2. Developer Documentation

This section is for developers who want to understand, modify, or contribute to the project. It covers the project's architecture, development setup, and core concepts.

- **[Getting Started for Developers](./developer/getting-started.md)**: Your first stop for setting up a local development environment.
- **[System Architecture](./developer/architecture.md)**: A high-level overview of the modular frontend and Python backend systems.
- **[Developer Guides](./developer/guides/README.md)**: In-depth guides on specific architectural components like the State Manager, Module System, and Event System.
- **[Reference](./developer/reference/README.md)**: Detailed reference material, such as the Logging System guide.
- **[Diffs from Upstream](./developer/diffs/README.md)**: Line-by-line changes from the upstream Archipelago repository.
- **[Project Roadmap](./project-roadmap.md)**: Development priorities and future plans for the project.
- **[Test Results](./developer/test-results/)**: Automated test results for all game templates:
  - [Test Results Summary](./developer/test-results/test-results-summary.md): Combined overview of all test types
  - [Minimal Spoiler Test Results](./developer/test-results/test-results-spoilers-minimal.md): Tests with advancement items only
  - [Full Spoiler Test Results](./developer/test-results/test-results-spoilers-full.md): Tests with all locations
  - [Multiclient Test Results](./developer/test-results/test-results-multiclient.md): Tests in multiclient mode

### 3. Module Reference

This section provides detailed, auto-generated, or manually written documentation for each individual frontend module. It is an essential technical reference for understanding the specific responsibilities and interactions of each component in the application.

- **[Module Index](./modules/README.md)**: An overview and index of all documented frontend modules.
