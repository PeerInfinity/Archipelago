/**
 * XP formulas for the Archipelago Loops incremental game
 * Based on formulas from various idle games including Idle Loops, Stuck in Time, and Increlution
 */

// Linear progression (5% per level)
export function proposedLinearReduction(level) {
  return 1 + level * 0.05;
}

// Calculate final cost with proposed linear reduction
export function proposedLinearFinalCost(baseCost, level) {
  return baseCost / proposedLinearReduction(level);
}

// Calculate level from total XP (linear formula)
export function levelFromXP(xp) {
  // With 100 XP for level 1, and +20 XP per level
  // Level 1: 100 XP
  // Level 2: 100 + 120 = 220 XP
  // Level 3: 220 + 140 = 360 XP
  // Formula: xp = 100 * level + 20 * (level * (level - 1) / 2)

  // Simplify to quadratic formula: 10*level^2 + 90*level
  // Solve for level: level = (-90 + sqrt(8100 + 40*xp)) / 20

  return Math.floor((-90 + Math.sqrt(8100 + 40 * xp)) / 20);
}

// Calculate total XP needed for a specific level
export function totalXPForLevel(level) {
  // Simplified formula: 10*level^2 + 90*level
  return 10 * level * level + 90 * level;
}

// Calculate XP needed for the next level
export function xpForNextLevel(level) {
  // Linear progression: 100 + (level * 20)
  return 100 + level * 20;
}

// Calculate XP gained from performing an action
export function calculateXPGain(actionType, baseCost, isFirstTime = false) {
  // Base XP is proportional to the mana cost
  let baseXP = baseCost * 0.1;

  // Bonus for first time completing the action in current loop
  if (isFirstTime) {
    baseXP *= 3;
  }

  // Different action types provide different amounts of XP
  switch (actionType) {
    case 'explore':
      return baseXP * 1.2; // Exploration gives more XP
    case 'checkLocation':
      return baseXP * 1.5; // Checking locations gives even more XP
    case 'moveToRegion':
      return baseXP * 0.8; // Movement gives less XP
    default:
      return baseXP;
  }
}

// Other utility functions from the formulas list
export function idleLoopsCostReduction(statLevel) {
  return 1 + statLevel / 100;
}

export function idleLoopsFinalCost(baseCost, statLevel) {
  return baseCost / idleLoopsCostReduction(statLevel);
}
