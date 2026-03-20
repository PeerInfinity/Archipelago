# Helpers Module

**Module ID:** `helpers`

**Purpose:** Displays game helper functions in an interactive panel, allowing users to see helper definitions, parameters, and evaluation results against current game state.

## Key Files

- `frontend/modules/helpers/index.js` - Module entry point and registration
- `frontend/modules/helpers/helperUI.js` - Panel UI component

## Responsibilities

- **Helper Display:** Renders all game helpers from static data with search filtering
- **Parameter Input:** Provides input fields for helper parameters (boolean, number, string types)
- **Live Evaluation:** Evaluates helpers against current game state with user-provided arguments
- **Example Discovery:** Scans rules to find example parameter values for helpers
- **Logic Tree Display:** Shows helper evaluation results as expandable logic trees

## Events Published

This module does not publish any events.

## Events Subscribed To

| Event | Handler |
|-------|---------|
| `stateManager:snapshotUpdated` | Updates helper evaluation when game state changes |
| `stateManager:ready` | Initializes on app startup |
| `stateManager:rulesLoaded` | Updates when new rules are loaded |
| `settings:changed` | Updates colorblind mode settings |

## Public Functions

This module does not register public functions. It is a UI panel component.

## Dependencies & Interactions

- **`stateManager`:** Gets game snapshots and static data for helper definitions
- **`ruleEngine`:** Evaluates helper rules via `evaluateRule()`
- **`snapshotInterface`:** Creates snapshot interface via `createSnapshotInterface()`
- **`commonUI`:** Renders logic trees via `renderLogicTree()`
- **`settingsManager`:** Gets colorblind mode and other display settings
- **`eventBus`:** Subscribes to state and settings events

## UI Features

### Helper List

- Expandable blocks for each helper function
- Search/filter by helper name
- Shows parameter count and types

### Parameter Input

- **Boolean:** Checkbox toggle
- **Number:** Numeric input field
- **String:** Text input field with example values dropdown

### Evaluation Display

- Shows current evaluation result (true/false)
- Expandable logic tree showing rule structure
- Color-coded based on accessibility
