# Journey to Ascension

**[Live demo](https://peerinfinity.github.io/Archipelago-CC/?mode=jta)**

## What is Journey to Ascension?

[Journey to Ascension](https://github.com/meneth/journey-to-ascension/) is an incremental/idle game where you progress through 27 zones by completing tasks, leveling skills, and collecting perks. Each zone has tasks that consume energy; when your energy runs out, you reset and start the zone over — but your skills and perks carry forward, letting you push further each time.

This APWorld randomizes the game for [Archipelago](https://archipelago.gg/) multiworld. Perks that would normally be earned from specific tasks are shuffled into the Archipelago item pool and distributed across all players in the multiworld. When you complete a perk task in-game, you send out whatever item was placed at that location — it might be your own perk, or another player's item. The perks you need to progress may come from other players' worlds.

## How It Plays

The game runs in the browser, embedded in the Archipelago-CC web frontend via an iframe. You can play it manually or use the action queue system to automate runs. As you complete tasks and receive perks from the multiworld, you push into higher zones.

A **post-generation cost adjustment** algorithm ensures every randomized seed is completable. Because perk placement is shuffled, the difficulty curve of the original game no longer applies — a late-game perk might end up on an early task or vice versa. The cost adjuster modifies task costs and XP multipliers based on the actual perk placement order, so the game remains balanced regardless of the shuffle.

## What is the goal?

Reach the configured goal zone (default: zone 15). Once you reach it, your game is complete and any remaining items in your world become accessible to other players.

The scope of randomization scales with the goal: only perks on tasks in zones before the goal zone are shuffled. A goal of 15 randomizes roughly 25-30 perks; a goal of 27 (the full game) randomizes around 40.

## Where is the options page?

The [player options page for this game](../player-options) contains all the options you need to configure and export a config file. Key options include the goal zone, number of free starting zones, starting perks, difficulty (resets per sphere), and cost generation mode.

## Further Reading

- [Setup Guide](setup_en.md) — Installation, seed generation, and cost adjustment methods
- [Simulator Documentation](../../../frontend/modules/jta-randomizer/SIMULATOR.md) — How the JTA game simulator works
