# User Guide TODO

User-friendly guides still to be written. See the corresponding technical reference in [developer/modules/](../../developer/modules/) for each.

## Done

- [JSON Panel](./json.md)
- [Editor Panel](./editor.md) (covers both textarea and CodeMirror 6 editors)
- [Dungeons](./dungeons.md) — Dungeon bosses and defeat rules
- [Discovery Panel](./discoveryPanel.md) — Discovery mode settings and discovered items
- [Events Inspector](./events.md) — Debug panel for event bus inspection
- [Exits](./exits.md) — Region exits and accessibility status
- [Helpers](./helpers.md) — Game helper functions with live evaluation
- [Inventory](./inventory.md) — Player item inventory
- [Locations](./locations.md) — Game locations and accessibility status
- [MetaGame Panel](./metaGamePanel.md) — Loading and managing MetaGame configurations
- [Modules](./modules.md) — Viewing and managing loaded frontend modules
- [Path Analyzer Panel](./pathAnalyzerPanel.md) — Path analysis tool
- [Player State Panel](./playerStatePanel.md) — Player's current state (e.g. current region)
- [Presets](./presets.md) — Loading pre-configured game files
- [Progress Bar Panel](./progressBarPanel.md) — Progress bar UI host panel
- [Region Graph](./regionGraph.md) — Interactive region connectivity visualization
- [Regions](./regions.md) — Game world organized by regions
- [Settings](./settings.md) — Application settings
- [Spoiler Checklist](./spoilerChecklist.md) — Sphere log progression checklist
- [Spoiler Test](./spoilerTest.md) — Game logic validation against spoiler log
- [Text Adventure](./textAdventure.md) — Text-based game world interface
- [Timer Panel](./timerPanel.md) — Automated location checking timer
- [Iframe Panel](./iframePanel.md) — Generic iframe host panel
- [Iframe Manager Panel](./iframeManagerPanel.md) — Loading content into iframe panels
- [Window Panel](./windowPanel.md) — Status display for a connected browser window
- [Window Manager Panel](./windowManagerPanel.md) — Opening and managing separate windows
- [Proof Queue](./proofQueue.md) — Table-based proof interface for MetaMath games
- [Proof Graph](./proofGraph.md) — Visual graph of proof dependencies for MetaMath games

## Core Service Modules

Background modules that power the UI panels — useful for users who want to understand what's happening behind the scenes.

- [ ] stateManager.md — Game state, logic evaluation, and accessibility
- [ ] client.md — WebSocket connection to the Archipelago server
- [ ] timer.md — Automated location checking timer logic
- [ ] discovery.md — Discovered state tracking for Archipelago Loops
- [ ] sphereState.md — Sphere log data and progression tracking
- [ ] metaGame.md — Scripted/tutorial experience orchestration

## Utility Modules

Lower priority — primarily useful to developers.

- [ ] commonUI.md
- [ ] editorCore.md
- [ ] iframe-base.md
- [ ] iframeAdapter.md
- [ ] pathAnalyzer.md
- [ ] playerState.md
- [ ] progressBar.md
- [ ] shared.md
- [ ] window-base.md
- [ ] windowAdapter.md
