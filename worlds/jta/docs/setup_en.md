# Journey to Ascension Setup Guide

## Required Software

- [Archipelago](https://archipelago.gg/downloads) (0.6.0+)
- [Node.js](https://nodejs.org/) (v14 or later) - required for cost adjustment

## Installing Node.js

The cost adjustment algorithm runs as a Node.js script. You need Node.js installed to generate
adjusted costs for your randomized seed.

### Windows

Download the installer from [nodejs.org](https://nodejs.org/) (LTS recommended) and run it.
Node.js will be added to your PATH automatically.

### macOS

Using Homebrew:

```
brew install node
```

Or download the installer from [nodejs.org](https://nodejs.org/).

### Linux (Ubuntu/Debian)

```
sudo apt update
sudo apt install nodejs npm
```

Or use [nvm](https://github.com/nvm-sh/nvm) for version management:

```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install --lts
```

### Verify Installation

```
node --version
```

You should see a version number like `v20.x.x` or later.

## Generating a Seed

1. Place your YAML configuration in the `Players/Templates/` directory
2. Run seed generation:
   ```
   python Generate.py --weights_file_path "Templates/Journey to Ascension.yaml" --multi 1 --seed <number>
   ```
3. If **Auto Cost Adjust** is enabled (the default), the cost adjustment algorithm runs
   automatically after generation. The adjusted costs file is included in the output.

## Cost Adjustment

The cost adjustment algorithm modifies task costs so the randomized seed is completable
within a target difficulty level. There are three ways to run it:

### Automatic (during generation)

If **Auto Cost Adjust** is enabled (the default) and Node.js is installed, cost
adjustment runs automatically after seed generation. The adjusted costs file is
included in the output alongside the randomized game data.

### From the Frontend (no Node.js needed)

Open the JTA Game Data panel in the frontend and expand the **Cost Adjustment** section.
Click **Run Cost Adjustment** to run the algorithm entirely in the browser. From there
you can:
- **Apply to Game** to send the adjusted costs to the running game
- **Download Costs JSON** to save the adjusted file

You can also use the **Game Data Loading** section to load the randomized game data
or previously adjusted costs from the preset directory, or upload a JSON file.

### From the Command Line

```
node scripts/jta/cost-adjust.js \
  --gamedata frontend/presets/jta/AP_<SEED>/AP_<SEED>_P1_Player1_gamedata.json \
  --spherelog frontend/presets/jta/AP_<SEED>/AP_<SEED>_sphere_log.jsonl \
  --output frontend/presets/jta/AP_<SEED>/AP_<SEED>_P1_Player1_costs.json \
  --resets-per-sphere 5 \
  --player 1
```

Add `--verbose` to see adjustment details for each task.
Requires Node.js v14 or later.

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| Goal Zone | 15 | Which zone the player must reach to win |
| Free Zones | 1 | Zones at start requiring zero perks |
| Starting Perks | 0 | Number of perks granted at start |
| Resets Per Sphere | 5 | Target grinding between perk unlocks (higher = harder) |
| Auto Cost Adjust | on | Run cost adjustment automatically after generation |
