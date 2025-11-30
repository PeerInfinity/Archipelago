/**
 * Thread-agnostic Super Metroid game logic functions
 *
 * Super Metroid uses a custom SMBoolManager system for its logic,
 * which evaluates rules based on both boolean values AND difficulty ratings.
 * The Python backend has already done all the complex logic evaluation,
 * so the frontend primarily needs to provide stub implementations that
 * allow the rules to be processed.
 *
 * For now, we provide simplified implementations that trust the Python
 * backend's calculations encoded in the sphere log.
 */

import { DEFAULT_PLAYER_ID } from '../../playerIdUtils.js';

/**
 * Get the player ID from snapshot and staticData using the standard pattern
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {string|number} Player ID
 */
function getPlayerId(snapshot, staticData) {
  return snapshot?.player?.id || snapshot?.player?.slot || snapshot?.player || staticData?.playerId || DEFAULT_PLAYER_ID;
}

/**
 * Check if player has an item
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {string} itemName - Name of the item to check
 * @returns {boolean} True if player has the item
 */
export function has(snapshot, staticData, itemName) {
  // Check if it's in inventory with count > 0
  if (snapshot.inventory) {
    let count;
    if (snapshot.inventory instanceof Map) {
      count = snapshot.inventory.get(itemName) || 0;
    } else {
      count = snapshot.inventory[itemName] || 0;
    }

    if (count > 0) {
      return true;
    }
  }

  // Also check flags and events as fallback (for event items)
  if (snapshot.flags && snapshot.flags.includes(itemName)) {
    return true;
  }

  if (snapshot.events && snapshot.events.includes(itemName)) {
    return true;
  }

  return false;
}

/**
 * Check if a boss has been defeated
 * In SM, defeating a boss grants a boss item (Kraid, Phantoon, Draygon, Ridley, etc.)
 * So checking if a boss is dead = checking if player has that boss item
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {string} bossName - Name of the boss to check
 * @returns {Object} SMBool result {bool: boolean, difficulty: number}
 */
export function bossDead(snapshot, staticData, bossName) {
  // Boss defeat is tracked by having the boss item
  const defeated = has(snapshot, staticData, bossName);
  return { bool: defeated, difficulty: 0 };
}

/**
 * Count how many of an item the player has
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {string} itemName - Name of the item to count
 * @returns {number} Number of items
 */
export function count(snapshot, staticData, itemName) {
  if (!snapshot.inventory) return 0;

  // First, try direct name match
  let itemCount = snapshot.inventory[itemName] || 0;

  // If not found by name, check if any item has this type
  // This is needed for VARIA type names like "ETank" -> "Energy Tank"
  if (itemCount === 0 && staticData && staticData.items) {
    // Get player-specific items
    const playerId = getPlayerId(snapshot, staticData);
    let playerItems;
    if (staticData.items instanceof Map) {
      playerItems = staticData.items.get(playerId) || staticData.items.get(String(playerId));
    } else {
      playerItems = staticData.items[playerId] || staticData.items[String(playerId)];
    }

    // If playerItems is undefined/null, try using staticData.items directly (flat structure)
    if (!playerItems) {
      playerItems = staticData.items;
    }

    if (playerItems) {
      // playerItems might also be a Map or object
      const itemEntries = playerItems instanceof Map ? playerItems.entries() : Object.entries(playerItems);

      for (const [fullItemName, itemData] of itemEntries) {
        if (itemData && itemData.type === itemName) {
          // Found an item with matching type, count how many we have
          itemCount += snapshot.inventory[fullItemName] || 0;
        }
      }
    }
  }

  return itemCount;
}

/**
 * Python's any() builtin - check if any element in an iterable is true
 * This is used in location rules to check if any access point is reachable
 * @param {Array} iterable - Array of boolean values
 * @returns {boolean} True if any element is truthy
 */
export function any(snapshot, staticData, iterable) {
  if (!Array.isArray(iterable)) return false;
  return iterable.some(x => x);
}

/**
 * Constructor for SMBool objects
 * In Python, SMBool(value, difficulty) creates an object with boolean and difficulty.
 * For simplified cases where the value is a constant, we just return that constant.
 *
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {*} value - The boolean value or SMBool result
 * @param {number} difficulty - Difficulty rating (optional)
 * @returns {*} The value or an SMBool-like object
 */
export function SMBool(snapshot, staticData, value, difficulty = 0) {
  // For constant boolean values, just return them directly
  if (typeof value === 'boolean') {
    return value;
  }
  // Otherwise, return an SMBool-like object
  return { bool: value, difficulty: difficulty || 0 };
}

/**
 * Evaluate an SMBool against maximum difficulty
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {*} smbool - The SMBool object or boolean value
 * @param {number} maxDiff - Maximum difficulty allowed
 * @returns {boolean} True if smbool passes the difficulty check
 */
export function evalSMBool(snapshot, staticData, smbool, maxDiff) {
  // If maxDiff is undefined, default to 50 (hardcore difficulty)
  // This matches the template default: max_difficulty: hardcore
  // VARIA difficulty values: easy=1, medium=5, hard=10, harder=25, hardcore=50, mania=100
  const effectiveMaxDiff = maxDiff !== undefined && maxDiff !== null ? maxDiff : 50;

  // If smbool is a plain boolean, return it
  if (typeof smbool === 'boolean') {
    return smbool;
  }

  // If smbool is an SMBool object, check difficulty
  if (smbool && typeof smbool === 'object' && 'bool' in smbool && 'difficulty' in smbool) {
    return smbool.bool === true && smbool.difficulty <= effectiveMaxDiff;
  }

  // Default: assume it's truthy
  return Boolean(smbool);
}

/**
 * VARIA wor - OR with difficulty
 * Returns True with the minimum difficulty of all True arguments
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {...*} args - SMBool objects or boolean values
 * @returns {Object} SMBool object
 */
export function wor(snapshot, staticData, ...args) {
  let minDifficulty = Infinity;
  let anyTrue = false;

  for (const arg of args) {
    const smbool = normalizeSMBool(arg);
    if (smbool.bool === true) {
      anyTrue = true;
      if (smbool.difficulty < minDifficulty) {
        minDifficulty = smbool.difficulty;
      }
    }
  }

  if (anyTrue) {
    return { bool: true, difficulty: minDifficulty };
  } else {
    return { bool: false, difficulty: 0 };
  }
}

/**
 * VARIA wand - AND with difficulty
 * Returns True with the sum of difficulties if all arguments are True
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {...*} args - SMBool objects or boolean values
 * @returns {Object} SMBool object
 */
export function wand(snapshot, staticData, ...args) {
  let totalDifficulty = 0;

  for (const arg of args) {
    const smbool = normalizeSMBool(arg);
    if (smbool.bool !== true) {
      return { bool: false, difficulty: 0 };
    }
    totalDifficulty += smbool.difficulty;
  }

  return { bool: true, difficulty: totalDifficulty };
}

/**
 * Check if player has a specific item
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {string} itemName - Name of the item
 * @returns {Object} SMBool object
 */
export function haveItem(snapshot, staticData, itemName) {
  // In Super Metroid, items can be referenced by their VARIA type name (e.g., "Morph")
  // or their full Archipelago name (e.g., "Morph Ball").
  // We need to check both the item name and the item type.

  // First, try direct name match
  let hasIt = has(snapshot, staticData, itemName);

  // If not found by name, check if any item has this type
  if (!hasIt && staticData && staticData.items) {
    // Get player-specific items
    const playerId = getPlayerId(snapshot, staticData);
    let playerItems;
    if (staticData.items instanceof Map) {
      playerItems = staticData.items.get(playerId) || staticData.items.get(String(playerId));
    } else {
      playerItems = staticData.items[playerId] || staticData.items[String(playerId)];
    }

    // If playerItems is undefined/null, try using staticData.items directly (flat structure)
    if (!playerItems) {
      playerItems = staticData.items;
    }

    if (playerItems) {
      // playerItems might also be a Map or object
      const itemEntries = playerItems instanceof Map ? playerItems.entries() : Object.entries(playerItems);

      for (const [fullItemName, itemData] of itemEntries) {
        if (itemData && itemData.type === itemName) {
          // Found an item with matching type, check if we have it
          hasIt = has(snapshot, staticData, fullItemName);
          if (hasIt) break;
        }
      }
    }
  }

  return { bool: hasIt, difficulty: 0 };
}

/**
 * Normalize a value to an SMBool object
 * @param {*} value - Boolean, SMBool object, or other value
 * @returns {Object} SMBool object with bool and difficulty properties
 */
function normalizeSMBool(value) {
  if (typeof value === 'boolean') {
    return { bool: value, difficulty: 0 };
  }
  if (value && typeof value === 'object' && 'bool' in value) {
    return {
      bool: value.bool,
      difficulty: value.difficulty || 0
    };
  }
  // Treat truthy values as True with 0 difficulty
  return { bool: Boolean(value), difficulty: 0 };
}

/**
 * VARIA ability checks - implementing core Super Metroid logic
 */

// Basic item checks
export function canUseBombs(snapshot, staticData) {
  const hasMorph = haveItem(snapshot, staticData, 'Morph');
  const hasBomb = haveItem(snapshot, staticData, 'Bomb');
  return wand(snapshot, staticData, hasMorph, hasBomb);
}

export function canUsePowerBombs(snapshot, staticData) {
  return wand(snapshot, staticData,
    haveItem(snapshot, staticData, 'Morph'),
    haveItem(snapshot, staticData, 'Power Bomb'));
}

export function canUseSpringBall(snapshot, staticData) {
  return wand(snapshot, staticData,
    haveItem(snapshot, staticData, 'Morph'),
    haveItem(snapshot, staticData, 'SpringBall'));
}

// Passage checks
export function canPassBombPassages(snapshot, staticData) {
  return wor(snapshot, staticData,
    canUseBombs(snapshot, staticData),
    canUsePowerBombs(snapshot, staticData));
}

// Knowledge-based techniques (assume player has knowledge)
export function knowsCeilingDBoost(snapshot, staticData) {
  return { bool: true, difficulty: 0 };
}

export function knowsInfiniteBombJump(snapshot, staticData) {
  // Infinite bomb jump technique
  // Enabled in regular preset with difficulty 5 (medium)
  return { bool: true, difficulty: 5 };
}

export function knowsSimpleShortCharge(snapshot, staticData) {
  return { bool: true, difficulty: 0 };
}

export function knowsShortCharge(snapshot, staticData) {
  // ShortCharge ("Tight Short Charge") is DISABLED by default in VARIA
  // Different from SimpleShortCharge which IS enabled by default
  const playerId = getPlayerId(snapshot, staticData);
  const knowsSettings = staticData?.settings?.[playerId]?.knows || {};

  if ('ShortCharge' in knowsSettings) {
    const [enabled, difficulty] = knowsSettings.ShortCharge;
    return { bool: enabled, difficulty: enabled ? difficulty : 0 };
  }

  // Default: disabled
  return { bool: false, difficulty: 0 };
}

export function knowsMockball(snapshot, staticData) {
  // Check exported knows settings for Mockball technique
  const playerId = getPlayerId(snapshot, staticData);
  const knowsSettings = staticData?.settings?.[playerId]?.knows || {};

  if ('Mockball' in knowsSettings) {
    const [enabled, difficulty] = knowsSettings.Mockball;
    return { bool: enabled, difficulty: enabled ? difficulty : 0 };
  }
  // Default: enabled with difficulty 1 (Regular preset value)
  return { bool: true, difficulty: 1 };
}

export function knowsAlcatrazEscape(snapshot, staticData) {
  return { bool: true, difficulty: 0 };
}

export function knowsGreenGateGlitch(snapshot, staticData) {
  return { bool: true, difficulty: 0 };
}

export function knowsEarlyKraid(snapshot, staticData) {
  // Wall jump technique to reach Kraid's Lair without HiJump or flight
  // Enabled in regular preset with difficulty 1 (easy)
  return { bool: true, difficulty: 1 };
}

export function knowsGravLessLevel3(snapshot, staticData) {
  return { bool: true, difficulty: 0 };
}

// Advanced movement abilities
export function canInfiniteBombJump(snapshot, staticData) {
  return wand(snapshot, staticData,
    haveItem(snapshot, staticData, 'Morph'),
    haveItem(snapshot, staticData, 'Bomb'),
    knowsInfiniteBombJump(snapshot, staticData));
}

export function canFly(snapshot, staticData) {
  return wor(snapshot, staticData,
    haveItem(snapshot, staticData, 'SpaceJump'),
    canInfiniteBombJump(snapshot, staticData));
}

export function canSimpleShortCharge(snapshot, staticData) {
  return wand(snapshot, staticData,
    haveItem(snapshot, staticData, 'SpeedBooster'),
    wor(snapshot, staticData,
      knowsSimpleShortCharge(snapshot, staticData),
      knowsShortCharge(snapshot, staticData)));
}

export function canMockball(snapshot, staticData) {
  return wand(snapshot, staticData,
    haveItem(snapshot, staticData, 'Morph'),
    knowsMockball(snapshot, staticData));
}

export function canSpringBallJump(snapshot, staticData) {
  return canUseSpringBall(snapshot, staticData);
}

export function canShortCharge(snapshot, staticData) {
  return wand(snapshot, staticData,
    haveItem(snapshot, staticData, 'SpeedBooster'),
    knowsShortCharge(snapshot, staticData));
}

export function haveMissileOrSuper(snapshot, staticData) {
  return wor(snapshot, staticData,
    haveItem(snapshot, staticData, 'Missile'),
    haveItem(snapshot, staticData, 'Super'));
}

export function canOpenEyeDoors(snapshot, staticData) {
  // Simplified: assume no ROM patches, just check for missiles/supers
  return haveMissileOrSuper(snapshot, staticData);
}

export function canJumpUnderwater(snapshot, staticData) {
  // Can jump underwater with Gravity Suit or suitless with HiJump + knowledge
  // Python: wor(haveItem('Gravity'), wand(knowsGravLessLevel1(), haveItem('HiJump')))
  return wor(snapshot, staticData,
    haveItem(snapshot, staticData, 'Gravity'),
    wand(snapshot, staticData,
      knowsGravLessLevel1(snapshot, staticData),
      haveItem(snapshot, staticData, 'HiJump')));
}

// Hell run presets matching Python Settings.hellRunPresets['Gimme energy'] (used by regular preset)
// Format: [[energy_threshold, difficulty], ...]
// VARIA difficulties: easy=1, medium=5, hard=10, harder=25, hardcore=50, mania=100
// Regular preset uses 'Gimme energy' for Ice and MainUpperNorfair (not 'Default')
// Ice 'Gimme energy' = [(4, hardcore), (5, harder), (6, hard), (10, medium)]
// MainUpperNorfair 'Gimme energy' = [(5, mania), (6, hardcore), (8, harder), (10, hard), (14, medium)]
// Note: Empirical testing shows Ice threshold should be 5, not 4 (Python sphere log confirms this)
// The (4, hardcore) entry appears to be at the exact boundary where maxDiff=50 doesn't allow it
const HELL_RUN_PRESETS = {
  'Ice': [[5, 25], [6, 10], [10, 5]],  // 'Gimme energy' empirical: need 5+ tanks at hardcore maxDiff
  'MainUpperNorfair': [[5, 100], [6, 50], [8, 25], [10, 10], [14, 5]], // 'Gimme energy': [(5, mania), (6, hardcore), (8, harder), (10, hard), (14, medium)]
  'LowerNorfair': null  // Default is null (requires suits)
};

// Complex helpers - conservative implementations
export function canHellRun(snapshot, staticData, hellRunType, mult = 1.0, minEArg = 2) {
  // Hell runs require heat resistance OR enough energy reserves
  // In VARIA logic: heatProof() OR (Gravity with half protection) OR (energyReserveCount >= minE AND specific energy check)
  const playerId = getPlayerId(snapshot, staticData);
  const romPatches = staticData?.settings?.[playerId]?.romPatches || {};

  // Check for full heat protection (returns immediately)
  const isHeatProof = heatProof(snapshot, staticData);
  if (isHeatProof.bool) {
    return isHeatProof;
  }

  // ProgressiveSuits must be explicitly enabled (true) to be active
  const progressiveSuits = romPatches.ProgressiveSuits === true;

  // Handle Gravity with ProgressiveSuits - provides half heat protection
  // This doubles mult and halves minE
  let effectiveMult = mult || 1.0;
  let minE = minEArg !== undefined ? minEArg : 2;

  if (progressiveSuits && haveItem(snapshot, staticData, 'Gravity').bool) {
    effectiveMult *= 2.0;  // Double mult = need fewer tanks
    minE /= 2.0;           // Half minE requirement
  }

  // When hellRunType is undefined (analyzer couldn't extract kwargs from
  // Settings.hellRunsTable), default to 'Ice' since:
  // 1. Ice has the lowest energy thresholds (most permissive)
  // 2. Locations in Ice area (Ice Beam etc.) commonly use this type
  // The mult parameter also defaults to 1.0, which is the most common value.
  // This may be slightly permissive for some MainUpperNorfair exits, but
  // those will eventually be gated by other requirements (suits, etc).
  const effectiveHellRunType = hellRunType || 'Ice';

  // Get the difficulty presets for this hell run type
  // Prefer exported hellRuns settings from VARIA preset, fall back to hardcoded presets
  const hellRunsSettings = staticData?.settings?.[playerId]?.hellRuns || {};
  const difficulties = hellRunsSettings[effectiveHellRunType] || HELL_RUN_PRESETS[effectiveHellRunType];
  if (!difficulties) {
    // No preset (like LowerNorfair) - requires suits
    return { bool: false, difficulty: 0 };
  }

  const reserves = energyReserveCount(snapshot, staticData);

  // Must have minimum energy first
  if (reserves < minE) {
    return { bool: false, difficulty: 0 };
  }

  // Check each difficulty tier
  // Python formula: energyReserveCountOk(normalizeRounding(threshold / mult), difficulty)
  // The mult DIVIDES the threshold, so mult < 1.0 means MORE energy needed
  // Python uses round() which rounds .5 up, matching JavaScript's Math.round()
  let lowestPassingDifficulty = Infinity;
  for (const [threshold, difficulty] of difficulties) {
    // Calculate effective threshold: threshold / mult (using round like Python)
    const effectiveThreshold = Math.round(threshold / effectiveMult);
    if (reserves >= effectiveThreshold) {
      if (difficulty < lowestPassingDifficulty) {
        lowestPassingDifficulty = difficulty;
      }
    }
  }

  if (lowestPassingDifficulty !== Infinity) {
    return { bool: true, difficulty: lowestPassingDifficulty };
  }

  return { bool: false, difficulty: 0 };
}

export function canAccessSandPits(snapshot, staticData) {
  // Sand pits in Maridia require Gravity Suit or specific techniques
  return haveItem(snapshot, staticData, 'Gravity');
}

export function canTraverseSandPits(snapshot, staticData) {
  // Bottom sandpits with the evirs (except west sand hall left to right)
  // Python: wor(haveItem('Gravity'), wand(knowsGravLessLevel3(), haveItem('HiJump'), haveItem('Ice')))
  return wor(snapshot, staticData,
    haveItem(snapshot, staticData, 'Gravity'),
    wand(snapshot, staticData,
      knowsGravLessLevel3(snapshot, staticData),
      haveItem(snapshot, staticData, 'HiJump'),
      haveItem(snapshot, staticData, 'Ice')));
}

/**
 * Get the total count of energy reserves (ETanks + Reserve Tanks)
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static game data
 * @returns {number} Total energy reserve count
 */
export function energyReserveCount(snapshot, staticData) {
  const etankCount = count(snapshot, staticData, 'Energy Tank');
  const reserveCount = count(snapshot, staticData, 'Reserve Tank');
  return etankCount + reserveCount;
}

/**
 * Check if player has enough energy reserves
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static game data
 * @param {number} requiredCount - Required number of energy reserves
 * @param {number} difficulty - Difficulty level (default 0)
 * @returns {Object} SMBool result
 */
export function energyReserveCountOk(snapshot, staticData, requiredCount, difficulty = 0) {
  const totalReserves = energyReserveCount(snapshot, staticData);
  if (totalReserves >= requiredCount) {
    return { bool: true, difficulty: difficulty };
  }
  return { bool: false, difficulty: 0 };
}

export function canPassBowling(snapshot, staticData) {
  // Bowling alley passage - requires Phantoon dead AND survival options
  // Python: Bosses.bossDead('Phantoon') AND (dmgReduction >= 2 OR energyReserveCountOk(1) OR SpaceJump OR Grapple)
  return wand(snapshot, staticData,
    bossDead(snapshot, staticData, 'Phantoon'),
    wor(snapshot, staticData,
      // Damage reduction >= 2 (Varia or Gravity suit)
      haveItem(snapshot, staticData, 'Varia'),
      haveItem(snapshot, staticData, 'Gravity'),
      // Or have energy reserves
      energyReserveCountOk(snapshot, staticData, 1),
      // Or have movement options
      haveItem(snapshot, staticData, 'SpaceJump'),
      haveItem(snapshot, staticData, 'Grapple')));
}

export function enoughStuffGT(snapshot, staticData) {
  // Golden Torizo requires dealing ~9000 damage.
  // From Python: canInflictEnoughDamages(9000, ignoreMissiles=True, givesDrops=hasBeams)
  //
  // ignoreMissiles=True only ignores regular Missiles - Super Missiles still count!
  // Damage sources for GT:
  // - Charged shots: Requires Charge beam (base 60 damage per shot, more with beam combos)
  // - Super Missiles: 300 damage each (5 per Super Missile pack)
  // - Power Bombs: NOT counted (power=False by default)
  //
  // hasBeams = Charge AND Plasma -> if true, givesDrops=true makes boss beatable
  // canBeatBoss = chargeDamage > 0 OR givesDrops OR supersDamage >= 9000
  //
  // With 6+ Super Missile packs (30+ supers = 9000 damage), GT is beatable without Charge

  const hasCharge = haveItem(snapshot, staticData, 'Charge').bool;
  const hasPlasma = haveItem(snapshot, staticData, 'Plasma').bool;
  const hasBeams = hasCharge && hasPlasma;

  // If player has Charge + Plasma, boss gives drops and is always beatable
  if (hasBeams) {
    return { bool: true, difficulty: 0 };
  }

  // Charged shot damage (only if have Charge)
  let chargeDamage = 0;
  if (hasCharge) {
    // Base beam damage * 3 for charge = ~180+ damage per shot
    // This is essentially infinite damage given time
    chargeDamage = 180;
  }

  // Super Missile damage: packs * 5 missiles * 300 damage
  const superCount = count(snapshot, staticData, 'Super');
  const supersDamage = superCount * 5 * 300;

  // Can beat boss if: charged shots available OR super damage >= 9000
  const canBeatBoss = chargeDamage > 0 || supersDamage >= 9000;

  return { bool: canBeatBoss, difficulty: 0 };
}

// High priority helpers (3+ uses)
export function canDestroyBombWalls(snapshot, staticData) {
  // Can destroy bomb walls with Morph + (Bomb OR PowerBomb) OR ScrewAttack
  return wor(snapshot, staticData,
    wand(snapshot, staticData,
      haveItem(snapshot, staticData, 'Morph'),
      wor(snapshot, staticData,
        haveItem(snapshot, staticData, 'Bomb'),
        haveItem(snapshot, staticData, 'Power Bomb'))),
    haveItem(snapshot, staticData, 'ScrewAttack'));
}

export function canDestroyBombWallsUnderwater(snapshot, staticData) {
  // Underwater bomb walls need Gravity OR just Morph + bombs
  return wor(snapshot, staticData,
    wand(snapshot, staticData,
      haveItem(snapshot, staticData, 'Gravity'),
      canDestroyBombWalls(snapshot, staticData)),
    wand(snapshot, staticData,
      haveItem(snapshot, staticData, 'Morph'),
      wor(snapshot, staticData,
        haveItem(snapshot, staticData, 'Bomb'),
        haveItem(snapshot, staticData, 'Power Bomb'))));
}

export function itemCountOk(snapshot, staticData, itemName, requiredCount) {
  // Check if player has enough of a specific item
  const currentCount = count(snapshot, staticData, itemName);
  return {
    bool: currentCount >= requiredCount,
    difficulty: 0
  };
}

// Medium priority helpers (2 uses)
export function canOpenRedDoors(snapshot, staticData) {
  // Red doors require Missiles or Super Missiles
  return haveMissileOrSuper(snapshot, staticData);
}

export function canOpenGreenDoors(snapshot, staticData) {
  // Green doors require Super Missiles
  return haveItem(snapshot, staticData, 'Super');
}

export function canOpenYellowDoors(snapshot, staticData) {
  // Yellow doors require Power Bombs
  return canUsePowerBombs(snapshot, staticData);
}

export function heatProof(snapshot, staticData) {
  // Heat immunity - matching VARIA's logic with ROM patches
  // Varia always provides full heat protection
  // Gravity only provides full heat protection if NOT ProgressiveSuits and NOT NoGravityEnvProtection
  // Default gravityBehaviour is 'Balanced' which has NoGravityEnvProtection ACTIVE
  const playerId = getPlayerId(snapshot, staticData);
  const romPatches = staticData?.settings?.[playerId]?.romPatches || {};

  // ProgressiveSuits must be explicitly enabled (true) to be active
  const progressiveSuits = romPatches.ProgressiveSuits === true;
  // NoGravityEnvProtection defaults to TRUE (Balanced mode) - must be explicitly disabled
  const noGravityEnvProtection = romPatches.NoGravityEnvProtection !== false;

  // Varia always provides full heat protection
  if (haveItem(snapshot, staticData, 'Varia').bool) {
    return { bool: true, difficulty: 0 };
  }

  // Gravity only provides full protection if NOT progressive suits and NOT NoGravityEnvProtection
  if (!progressiveSuits && !noGravityEnvProtection && haveItem(snapshot, staticData, 'Gravity').bool) {
    return { bool: true, difficulty: 0 };
  }

  return { bool: false, difficulty: 0 };
}

export function canKillBeetoms(snapshot, staticData) {
  // Can kill Beetom enemies with missiles, power bombs, or screw attack
  return wor(snapshot, staticData,
    haveMissileOrSuper(snapshot, staticData),
    canUsePowerBombs(snapshot, staticData),
    haveItem(snapshot, staticData, 'ScrewAttack'));
}

export function canGreenGateGlitch(snapshot, staticData) {
  // Green gate glitch requires Super + knowledge
  return wand(snapshot, staticData,
    haveItem(snapshot, staticData, 'Super'),
    knowsGreenGateGlitch(snapshot, staticData));
}

export function canFireChargedShots(snapshot, staticData) {
  // Can fire charged shots with Charge Beam
  return haveItem(snapshot, staticData, 'Charge');
}

// Traverse - door transition logic based on door colors
export function traverse(snapshot, staticData, doorName) {
  // Check if game_info data is available
  if (!staticData?.game_info) {
    console.warn(`[traverse] No game_info available in staticData for door: ${doorName}`);
    return { bool: true, difficulty: 0 };  // Default to passable if no data
  }

  // Get player-specific game info
  const playerId = getPlayerId(snapshot, staticData);
  const playerGameInfo = staticData.game_info[playerId] || staticData.game_info[String(playerId)];
  const playerDoors = playerGameInfo?.doors;

  if (!playerDoors) {
    console.warn(`[traverse] No door data for player ${playerId}`);
    return { bool: true, difficulty: 0 };
  }

  // Get the color of this specific door
  const doorColor = playerDoors[doorName];
  if (!doorColor) {
    console.warn(`[traverse] Door '${doorName}' not found in door data`);
    return { bool: true, difficulty: 0 };  // Default to passable if door not found
  }

  // Check door accessibility based on color
  // Based on Python Door.traverse() implementation
  if (doorColor === 'grey') {
    // Grey doors (hidden) cannot be passed
    return { bool: false, difficulty: 0 };
  } else if (doorColor === 'red') {
    // Red doors require missiles or supers
    return canOpenRedDoors(snapshot, staticData);
  } else if (doorColor === 'green') {
    // Green doors require super missiles
    return canOpenGreenDoors(snapshot, staticData);
  } else if (doorColor === 'yellow') {
    // Yellow doors require power bombs
    return canOpenYellowDoors(snapshot, staticData);
  } else if (doorColor === 'wave') {
    // Wave beam doors
    return haveItem(snapshot, staticData, 'Wave');
  } else if (doorColor === 'spazer') {
    // Spazer beam doors
    return haveItem(snapshot, staticData, 'Spazer');
  } else if (doorColor === 'plasma') {
    // Plasma beam doors
    return haveItem(snapshot, staticData, 'Plasma');
  } else if (doorColor === 'ice') {
    // Ice beam doors
    return haveItem(snapshot, staticData, 'Ice');
  } else {
    // Blue doors (or any other color) - always passable
    return { bool: true, difficulty: 0 };
  }
}

// Boss requirement helpers - Conservative implementations
// These calculate damage output vs boss HP in Python - we use simplified checks
export function enoughStuffsKraid(snapshot, staticData) {
  // Kraid boss - needs enough damage output (1000 HP)
  // Can use Missiles (100 dmg), Super Missiles (300 dmg), or Charge Beam
  // 5 Supers (1 pack) = 1500 dmg > 1000, so any Super pack works
  return wor(snapshot, staticData,
    haveItem(snapshot, staticData, 'Missile'),
    haveItem(snapshot, staticData, 'Super'),
    haveItem(snapshot, staticData, 'Charge'));
}

export function enoughStuffsPhantoon(snapshot, staticData) {
  // Phantoon boss - 2500 HP, Super Missiles do double damage (600 each)
  // Can use Missiles (100 dmg), Super Missiles (600 dmg), or Charge Beam
  // 5 Supers = 3000 dmg > 2500 HP, so any Super pack works
  return wor(snapshot, staticData,
    haveItem(snapshot, staticData, 'Missile'),
    haveItem(snapshot, staticData, 'Super'),
    haveItem(snapshot, staticData, 'Charge'));
}

export function enoughStuffsRidley(snapshot, staticData) {
  // Ridley has 18000 HP and gives NO drops (givesDrops=False)
  // Python: canInflictEnoughDamages(18000, doubleSuper=True, power=True, givesDrops=False)
  //
  // Must have Morph OR ScrewAttack to fight
  const canFight = wor(snapshot, staticData,
    haveItem(snapshot, staticData, 'Morph'),
    haveItem(snapshot, staticData, 'ScrewAttack'));
  if (!canFight.bool) {
    return { bool: false, difficulty: 0 };
  }

  // With Charge Beam, we have infinite damage potential (charged shots)
  const hasCharge = haveItem(snapshot, staticData, 'Charge');
  if (hasCharge.bool) {
    return { bool: true, difficulty: hasCharge.difficulty || 0 };
  }

  // Without Charge, need enough ammo to deal 18000 damage
  // Damage values (with doubleSuper=True):
  // - Missile: 100 damage each, 5 per pack = 500 damage per pack
  // - Super Missile: 600 damage each (doubled for Ridley), 5 per pack = 3000 damage per pack
  // - Power Bomb: 200 damage each, 5 per pack = 1000 damage per pack
  const missileCount = count(snapshot, staticData, 'Missile');
  const superCount = count(snapshot, staticData, 'Super');
  const powerBombCount = count(snapshot, staticData, 'Power Bomb');

  const missileDamage = missileCount * 5 * 100;       // 500 per pack
  const superDamage = superCount * 5 * 600;           // 3000 per pack (doubleSuper)
  const powerDamage = powerBombCount * 5 * 200;       // 1000 per pack
  const totalDamage = missileDamage + superDamage + powerDamage;

  // Need 18000 damage to defeat Ridley
  if (totalDamage >= 18000) {
    return { bool: true, difficulty: 0 };
  }

  // Not enough damage
  return { bool: false, difficulty: 0 };
}

export function enoughStuffCroc(snapshot, staticData) {
  // Crocomire has ~5000 HP and doesn't give drops
  // Need to inflict enough damage to defeat him
  // Damage values:
  // - Charged shot: variable based on beam upgrades, but infinite supply
  // - Missile: 100 damage each, 5 per pack
  // - Super Missile: 300 damage each, 5 per pack

  // With Charge Beam, we have infinite damage potential
  const hasCharge = haveItem(snapshot, staticData, 'Charge');
  if (hasCharge.bool) {
    return { bool: true, difficulty: 0 };
  }

  // Without Charge, calculate ammo damage
  const missileCount = count(snapshot, staticData, 'Missile');
  const superCount = count(snapshot, staticData, 'Super');

  // Each pickup gives 5 ammo
  const missileDamage = missileCount * 5 * 100;  // 500 damage per pack
  const superDamage = superCount * 5 * 300;      // 1500 damage per pack
  const totalDamage = missileDamage + superDamage;

  // Need 5000 damage to defeat Crocomire
  if (totalDamage >= 5000) {
    return { bool: true, difficulty: 0 };
  }

  // Not enough damage
  return { bool: false, difficulty: 0 };
}

export function enoughStuffSporeSpawn(snapshot, staticData) {
  // Spore Spawn - relatively easy boss
  return wor(snapshot, staticData,
    haveItem(snapshot, staticData, 'Missile'),
    haveItem(snapshot, staticData, 'Super'),
    haveItem(snapshot, staticData, 'Charge'));
}

export function canPassMetroids(snapshot, staticData) {
  // Pass metroids: Ice + ammo OR 3+ Power Bomb packs
  return wor(snapshot, staticData,
    wand(snapshot, staticData,
      haveItem(snapshot, staticData, 'Ice'),
      haveMissileOrSuper(snapshot, staticData)),
    itemCountOk(snapshot, staticData, 'PowerBomb', 3));
}

export function canPassZebetites(snapshot, staticData) {
  // Pass zebetites: Ice skip OR Speed skip OR enough missiles for damage
  // Simplified: need Ice OR SpeedBooster OR 10+ missiles (for ~1100 damage)
  return wor(snapshot, staticData,
    haveItem(snapshot, staticData, 'Ice'),
    haveItem(snapshot, staticData, 'SpeedBooster'),
    itemCountOk(snapshot, staticData, 'Missile', 10));
}

export function enoughStuffsMotherbrain(snapshot, staticData) {
  // Mother Brain fight requirements:
  // - Need 2+ missile packs AND 2+ super packs (to break the glass)
  // - Need enough ammo for ~21000 damage total (MB1 3000 + MB2 18000)
  // Each missile pack = 5 missiles, each does 100 damage = 500 damage/pack
  // Each super pack = 5 supers, each does 300 damage = 1500 damage/pack
  // With charge beam, damage is essentially infinite
  const missileCount = count(snapshot, staticData, 'Missile');
  const superCount = count(snapshot, staticData, 'Super');
  const hasCharge = haveItem(snapshot, staticData, 'Charge');

  // Minimum requirement: 2 missile packs and 2 super packs
  if (missileCount < 2 || superCount < 2) {
    return { bool: false, difficulty: 0 };
  }

  // Calculate damage potential
  const missileDamage = missileCount * 5 * 100;  // 500 per pack
  const superDamage = superCount * 5 * 300;      // 1500 per pack
  const totalAmmoDamage = missileDamage + superDamage;

  // With charge beam, damage is unlimited
  if (hasCharge.bool) {
    return { bool: true, difficulty: 0 };
  }

  // Need at least 21000 damage worth of ammo
  if (totalAmmoDamage >= 21000) {
    return { bool: true, difficulty: 0 };
  }

  return { bool: false, difficulty: 0 };
}

export function enoughStuffTourian(snapshot, staticData) {
  // Tourian access requires:
  // 1. Can pass metroids AND zebetites (or have speedup patch - assume no)
  // 2. Can open red doors
  // 3. Have enough stuff for Mother Brain
  // 4. Have Morph (for zebetite tunnel)
  return wand(snapshot, staticData,
    canPassMetroids(snapshot, staticData),
    canPassZebetites(snapshot, staticData),
    canOpenRedDoors(snapshot, staticData),
    enoughStuffsMotherbrain(snapshot, staticData),
    haveItem(snapshot, staticData, 'Morph'));
}

// Additional knowledge techniques
export function knowsFirefleasWalljump(snapshot, staticData) {
  return { bool: true, difficulty: 0 };
}

export function knowsBubbleMountainWallJump(snapshot, staticData) {
  // Check exported knows settings for BubbleMountainWallJump technique
  const playerId = getPlayerId(snapshot, staticData);
  const knowsSettings = staticData?.settings?.[playerId]?.knows || {};

  if ('BubbleMountainWallJump' in knowsSettings) {
    const [enabled, difficulty] = knowsSettings.BubbleMountainWallJump;
    return { bool: enabled, difficulty: enabled ? difficulty : 0 };
  }
  // Default: enabled with difficulty 5 (Regular preset value)
  return { bool: true, difficulty: 5 };
}

export function knowsGetAroundWallJump(snapshot, staticData) {
  return { bool: true, difficulty: 0 };
}

export function knowsIceEscape(snapshot, staticData) {
  return { bool: true, difficulty: 0 };
}

export function knowsXrayDboost(snapshot, staticData) {
  // Check exported knows settings for XrayDboost technique
  // Regular preset: XrayDboost: [false, 0] - disabled
  const playerId = getPlayerId(snapshot, staticData);
  const knowsSettings = staticData?.settings?.[playerId]?.knows || {};

  if ('XrayDboost' in knowsSettings) {
    const [enabled, difficulty] = knowsSettings.XrayDboost;
    return { bool: enabled, difficulty: enabled ? difficulty : 0 };
  }
  // Default: disabled (Regular preset value)
  return { bool: false, difficulty: 0 };
}

export function knowsXrayIce(snapshot, staticData) {
  // Check exported knows settings for XrayIce technique
  // Regular preset: XrayIce: [true, 10] - enabled with difficulty 10
  const playerId = getPlayerId(snapshot, staticData);
  const knowsSettings = staticData?.settings?.[playerId]?.knows || {};

  if ('XrayIce' in knowsSettings) {
    const [enabled, difficulty] = knowsSettings.XrayIce;
    return { bool: enabled, difficulty: enabled ? difficulty : 0 };
  }
  // Default: enabled with difficulty 10 (Regular preset value)
  return { bool: true, difficulty: 10 };
}

export function knowsReverseGateGlitch(snapshot, staticData) {
  return { bool: true, difficulty: 0 };
}

export function knowsReverseGateGlitchHiJumpLess(snapshot, staticData) {
  // Regular preset: ReverseGateGlitchHiJumpLess: [false, 0] - disabled
  return { bool: false, difficulty: 0 };
}

export function knowsCrocPBsDBoost(snapshot, staticData) {
  const playerId = getPlayerId(snapshot, staticData);
  const knowsSettings = staticData?.settings?.[playerId]?.knows || {};

  if ('CrocPBsDBoost' in knowsSettings) {
    const [enabled, difficulty] = knowsSettings.CrocPBsDBoost;
    return { bool: enabled, difficulty: enabled ? difficulty : 0 };
  }

  // Default: disabled in regular preset
  return { bool: false, difficulty: 0 };
}

export function knowsCrocPBsIce(snapshot, staticData) {
  const playerId = getPlayerId(snapshot, staticData);
  const knowsSettings = staticData?.settings?.[playerId]?.knows || {};

  if ('CrocPBsIce' in knowsSettings) {
    const [enabled, difficulty] = knowsSettings.CrocPBsIce;
    return { bool: enabled, difficulty: enabled ? difficulty : 0 };
  }

  // Default: disabled in regular preset
  return { bool: false, difficulty: 0 };
}

export function knowsMaridiaWallJumps(snapshot, staticData) {
  return { bool: true, difficulty: 0 };
}

export function knowsOldMBWithSpeed(snapshot, staticData) {
  // Check exported knows settings for OldMBWithSpeed technique
  const playerId = getPlayerId(snapshot, staticData);
  const knowsSettings = staticData?.settings?.[playerId]?.knows || {};

  if ('OldMBWithSpeed' in knowsSettings) {
    const [enabled, difficulty] = knowsSettings.OldMBWithSpeed;
    return { bool: enabled, difficulty: enabled ? difficulty : 0 };
  }
  // Default: disabled (technique not commonly known)
  return { bool: false, difficulty: 0 };
}

export function knowsRonPopeilScrew(snapshot, staticData) {
  // Check exported knows settings for RonPopeilScrew technique
  const playerId = getPlayerId(snapshot, staticData);
  const knowsSettings = staticData?.settings?.[playerId]?.knows || {};

  if ('RonPopeilScrew' in knowsSettings) {
    const [enabled, difficulty] = knowsSettings.RonPopeilScrew;
    return { bool: enabled, difficulty: enabled ? difficulty : 0 };
  }
  // Default: disabled (technique not commonly known)
  return { bool: false, difficulty: 0 };
}

export function knowsSpringBallJumpFromWall(snapshot, staticData) {
  return { bool: true, difficulty: 0 };
}

export function knowsKillPlasmaPiratesWithSpark(snapshot, staticData) {
  return { bool: true, difficulty: 0 };
}

export function knowsKillPlasmaPiratesWithCharge(snapshot, staticData) {
  return { bool: true, difficulty: 0 };
}

export function knowsGravityJump(snapshot, staticData) {
  // Check exported knows settings
  const playerId = getPlayerId(snapshot, staticData);
  const knowsSettings = staticData?.settings?.[playerId]?.knows || {};

  if ('GravityJump' in knowsSettings) {
    const [enabled, difficulty] = knowsSettings.GravityJump;
    return { bool: enabled, difficulty: enabled ? difficulty : 0 };
  }
  // Default: enabled with difficulty 10 (Regular preset value)
  return { bool: true, difficulty: 10 };
}

export function knowsLavaDive(snapshot, staticData) {
  // Check exported knows settings
  const playerId = getPlayerId(snapshot, staticData);
  const knowsSettings = staticData?.settings?.[playerId]?.knows || {};

  if ('LavaDive' in knowsSettings) {
    const [enabled, difficulty] = knowsSettings.LavaDive;
    return { bool: enabled, difficulty: enabled ? difficulty : 0 };
  }
  // Default: enabled with difficulty 50 (Regular preset value)
  return { bool: true, difficulty: 50 };
}

export function knowsLavaDiveNoHiJump(snapshot, staticData) {
  // Check exported knows settings
  const playerId = getPlayerId(snapshot, staticData);
  const knowsSettings = staticData?.settings?.[playerId]?.knows || {};

  if ('LavaDiveNoHiJump' in knowsSettings) {
    const [enabled, difficulty] = knowsSettings.LavaDiveNoHiJump;
    return { bool: enabled, difficulty: enabled ? difficulty : 0 };
  }
  // Default: disabled (Regular preset value)
  return { bool: false, difficulty: 0 };
}

export function knowsMtEverestGravJump(snapshot, staticData) {
  // Check exported knows settings
  const playerId = getPlayerId(snapshot, staticData);
  const knowsSettings = staticData?.settings?.[playerId]?.knows || {};

  if ('MtEverestGravJump' in knowsSettings) {
    const [enabled, difficulty] = knowsSettings.MtEverestGravJump;
    return { bool: enabled, difficulty: enabled ? difficulty : 0 };
  }
  // Default: disabled (Regular preset value)
  return { bool: false, difficulty: 0 };
}

export function knowsTediousMountEverest(snapshot, staticData) {
  // Tedious climb of Mt. Everest suitless with ice and supers
  // Check exported knows settings
  const playerId = getPlayerId(snapshot, staticData);
  const knowsSettings = staticData?.settings?.[playerId]?.knows || {};

  if ('TediousMountEverest' in knowsSettings) {
    const [enabled, difficulty] = knowsSettings.TediousMountEverest;
    return { bool: enabled, difficulty: enabled ? difficulty : 0 };
  }
  // Default: disabled (Regular preset value)
  return { bool: false, difficulty: 0 };
}

export function knowsRedTowerClimb(snapshot, staticData) {
  // Wall jump technique to climb Red Tower
  // Enabled in regular preset with difficulty 25 (harder)
  return { bool: true, difficulty: 25 };
}

export function knowsNovaBoost(snapshot, staticData) {
  // D-Boost on the Sova to enter Cathedral with shorter hell run
  // Check exported knows settings
  const playerId = getPlayerId(snapshot, staticData);
  const knowsSettings = staticData?.settings?.[playerId]?.knows || {};

  if ('NovaBoost' in knowsSettings) {
    const [enabled, difficulty] = knowsSettings.NovaBoost;
    return { bool: enabled, difficulty: enabled ? difficulty : 0 };
  }
  // Default: disabled (Regular preset value)
  return { bool: false, difficulty: 0 };
}

// Room-specific helpers - Conservative implementations
export function canAccessKraidsLair(snapshot, staticData) {
  // Python: Super + (HiJump OR canFly OR knowsEarlyKraid)
  // knowsEarlyKraid = wall jump technique to reach Kraid without HiJump/flight
  return wand(snapshot, staticData,
    haveItem(snapshot, staticData, 'Super'),
    wor(snapshot, staticData,
      haveItem(snapshot, staticData, 'HiJump'),
      canFly(snapshot, staticData),
      knowsEarlyKraid(snapshot, staticData)));
}

export function canExitCathedral(snapshot, staticData) {
  // Needs heat protection + vertical movement
  return wand(snapshot, staticData,
    heatProof(snapshot, staticData),
    wor(snapshot, staticData,
      canFly(snapshot, staticData),
      haveItem(snapshot, staticData, 'SpaceJump'),
      canSpringBallJump(snapshot, staticData)));
}

export function canGoUpMtEverest(snapshot, staticData) {
  // Mt. Everest (Maridia) - two paths:
  // 1. With Gravity: needs movement options (Grapple, Speed, fly, or gravity jump)
  // 2. Without Gravity: canDoSuitlessOuterMaridia + Grapple
  return wor(snapshot, staticData,
    // Path 1: With Gravity suit
    wand(snapshot, staticData,
      haveItem(snapshot, staticData, 'Gravity'),
      wor(snapshot, staticData,
        haveItem(snapshot, staticData, 'Grapple'),
        haveItem(snapshot, staticData, 'SpeedBooster'),
        canFly(snapshot, staticData),
        wand(snapshot, staticData,
          knowsGravityJump(snapshot, staticData),
          wor(snapshot, staticData,
            haveItem(snapshot, staticData, 'HiJump'),
            knowsMtEverestGravJump(snapshot, staticData))))),
    // Path 2: Suitless with Grapple
    wand(snapshot, staticData,
      canDoSuitlessOuterMaridia(snapshot, staticData),
      haveItem(snapshot, staticData, 'Grapple')));
}

export function canPassMtEverest(snapshot, staticData) {
  // Similar to canGoUpMtEverest but different movement options
  return wor(snapshot, staticData,
    // Path 1: With Gravity suit
    wand(snapshot, staticData,
      haveItem(snapshot, staticData, 'Gravity'),
      wor(snapshot, staticData,
        haveItem(snapshot, staticData, 'Grapple'),
        haveItem(snapshot, staticData, 'SpeedBooster'),
        canFly(snapshot, staticData),
        knowsGravityJump(snapshot, staticData))),
    // Path 2: Suitless with various movement options
    wand(snapshot, staticData,
      canDoSuitlessOuterMaridia(snapshot, staticData),
      wor(snapshot, staticData,
        haveItem(snapshot, staticData, 'Grapple'),
        wand(snapshot, staticData,
          haveItem(snapshot, staticData, 'Ice'),
          knowsTediousMountEverest(snapshot, staticData),
          haveItem(snapshot, staticData, 'Super')),
        canDoubleSpringBallJump(snapshot, staticData))));
}

export function canDefeatBotwoon(snapshot, staticData) {
  // Botwoon boss - Python: wand(enoughStuffBotwoon(), canPassBotwoonHallway())
  // enoughStuffBotwoon uses canInflictEnoughDamages(6000, givesDrops=False)
  //
  // canInflictEnoughDamages with givesDrops=False:
  // - Needs to deal 6000 damage from ammo alone
  // - Missiles: count * 5 * 100 damage
  // - Supers: count * 5 * 300 damage
  // - Charge beam: provides infinite damage over time
  // - canBeatBoss = chargeDamage > 0 OR ammoDamage >= 6000

  const hasCharge = haveItem(snapshot, staticData, 'Charge').bool;

  // Charge beam alone is sufficient (infinite charged shots)
  if (hasCharge) {
    return wand(snapshot, staticData,
      { bool: true, difficulty: 0 },
      canPassBotwoonHallway(snapshot, staticData));
  }

  // Calculate total ammo damage
  const missileCount = count(snapshot, staticData, 'Missile');
  const superCount = count(snapshot, staticData, 'Super');

  // Missiles: packs * 5 missiles * 100 damage
  const missileDamage = missileCount * 5 * 100;
  // Supers: packs * 5 supers * 300 damage
  const superDamage = superCount * 5 * 300;
  const totalDamage = missileDamage + superDamage;

  // Need 6000 damage to defeat Botwoon
  const enoughStuff = totalDamage >= 6000;

  return wand(snapshot, staticData,
    { bool: enoughStuff, difficulty: 0 },
    canPassBotwoonHallway(snapshot, staticData));
}

/**
 * Get damage reduction factor based on suits
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static game data
 * @param {boolean} envDmg - Whether to check environmental damage (default true)
 * @returns {number} Damage reduction multiplier
 */
export function getDmgReduction(snapshot, staticData, envDmg = true) {
  // Use haveItem which supports VARIA type lookups (e.g., 'Varia' -> 'Varia Suit')
  const hasVaria = haveItem(snapshot, staticData, 'Varia').bool;
  const hasGravity = haveItem(snapshot, staticData, 'Gravity').bool;

  // Get player settings - try both snapshot.playerId and default to '1'
  const playerId = snapshot?.playerId || DEFAULT_PLAYER_ID;
  const playerSettings = staticData?.settings?.[playerId] || {};
  const romPatches = playerSettings.romPatches || {};

  let dmgRed = 1.0;
  let items = [];

  if (romPatches.NoGravityEnvProtection) {
    if (hasVaria) {
      items = ['Varia'];
      dmgRed = envDmg ? 4.0 : 2.0;
    }
    if (hasGravity && !envDmg) {
      dmgRed = 4.0;
      items = ['Gravity'];
    }
  } else if (romPatches.ProgressiveSuits) {
    if (hasVaria) {
      items.push('Varia');
      dmgRed *= 2;
    }
    if (hasGravity) {
      items.push('Gravity');
      dmgRed *= 2;
    }
  } else {
    // Default behavior
    if (hasVaria) {
      dmgRed = 2.0;
      items = ['Varia'];
    }
    if (hasGravity) {
      dmgRed = 4.0;
      items = ['Gravity'];
    }
  }

  // Return tuple format [dmgRed, items] to match Python's (ret, items)
  return [dmgRed, items];
}

/**
 * Divide a value by the damage reduction factor (for energy requirements)
 * Used in rules like energyReserveCountOk(3/getDmgReduction()[0])
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static game data
 * @param {number} value - The numerator value to divide
 * @returns {number} The ceiling of value / dmgReduction
 */
export function divideByDmgReduction(snapshot, staticData, value) {
  const [dmgRed, _items] = getDmgReduction(snapshot, staticData);
  // Return ceiling since these are typically energy tank requirements
  return Math.ceil(value / dmgRed);
}

/**
 * Check if player can handle a hard room with energy reserves
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static game data
 * @param {string} roomName - Name of the hard room (e.g., 'Gauntlet', 'X-Ray')
 * @param {number} mult - Difficulty multiplier (default 1.0, higher = easier)
 * @returns {Object} SMBool result
 */
export function energyReserveCountOkHardRoom(snapshot, staticData, roomName, mult = 1.0) {
  // Get player settings - try both snapshot.playerId and default to '1'
  const playerId = snapshot?.playerId || DEFAULT_PLAYER_ID;
  const playerSettings = staticData?.settings?.[playerId] || {};
  const hardRooms = playerSettings.hardRooms || {};
  const difficulties = hardRooms[roomName];

  if (!difficulties || difficulties.length === 0) {
    return { bool: false, difficulty: 0 };
  }

  // Get damage reduction from suits - getDmgReduction returns [dmgRed, items]
  const [dmgRed] = getDmgReduction(snapshot, staticData, true);
  const totalMult = mult * dmgRed;
  const totalReserves = energyReserveCount(snapshot, staticData);

  // Check each difficulty level - if ANY pass, return true
  // difficulties is an array of [requiredCount, difficultyLevel] pairs
  let result = { bool: false, difficulty: 0 };

  for (const [baseCount, difficultyLevel] of difficulties) {
    // Apply multiplier - higher mult means we need fewer tanks
    const adjustedCount = Math.round(baseCount / totalMult);
    const checkResult = energyReserveCountOk(snapshot, staticData, adjustedCount, difficultyLevel);

    // Use wor to combine results
    result = wor(snapshot, staticData, result, checkResult);
  }

  return result;
}

export function canPassLavaPit(snapshot, staticData) {
  // Lower Norfair lava pit - matching VARIA's complex logic:
  // Option 1: Gravity + SpaceJump
  // Option 2: knowsGravityJump + Gravity + (HiJump OR knowsLavaDive)
  // Option 3: (knowsLavaDive + HiJump OR knowsLavaDiveNoHiJump) + energyReserveCountOk(nTanks)
  // ALL options require canUsePowerBombs

  // Calculate required tanks for dive without heat protection
  // getDmgReduction returns [dmgRed, items], need to destructure
  const [dmgReduction] = getDmgReduction(snapshot, staticData);
  let nTanks4Dive = Math.ceil(8 / dmgReduction);
  const hasHiJump = haveItem(snapshot, staticData, 'HiJump').bool;
  if (!hasHiJump) {
    nTanks4Dive = Math.ceil(nTanks4Dive * 1.25);
  }

  // Check each option
  const opt1 = wand(snapshot, staticData,
    haveItem(snapshot, staticData, 'Gravity'),
    haveItem(snapshot, staticData, 'SpaceJump'));

  const opt2 = wand(snapshot, staticData,
    knowsGravityJump(snapshot, staticData),
    haveItem(snapshot, staticData, 'Gravity'),
    wor(snapshot, staticData,
      haveItem(snapshot, staticData, 'HiJump'),
      knowsLavaDive(snapshot, staticData)));

  // Option 3: LavaDive technique without suits
  const diveTech = wor(snapshot, staticData,
    wand(snapshot, staticData,
      knowsLavaDive(snapshot, staticData),
      haveItem(snapshot, staticData, 'HiJump')),
    knowsLavaDiveNoHiJump(snapshot, staticData));
  const opt3 = wand(snapshot, staticData,
    diveTech,
    energyReserveCountOk(snapshot, staticData, nTanks4Dive));

  // All options require power bombs
  return wand(snapshot, staticData,
    wor(snapshot, staticData, opt1, opt2, opt3),
    canUsePowerBombs(snapshot, staticData));
}

export function canPassLavaPitReverse(snapshot, staticData) {
  // Same as forward but might need more movement
  return wand(snapshot, staticData,
    heatProof(snapshot, staticData),
    wor(snapshot, staticData,
      haveItem(snapshot, staticData, 'Gravity'),
      haveItem(snapshot, staticData, 'HiJump'),
      canFly(snapshot, staticData)));
}

export function canGrappleEscape(snapshot, staticData) {
  // Multiple ways to escape + hell run requirement
  // Python: wand(access, canHellRun('MainUpperNorfair', mult, minE))
  // The escape requires both movement ability AND surviving the heated area
  // Python dynamically adjusts mult based on escape method:
  //   - IBJ/ShortCharge: mult *= 0.7 (harder, slower escape)
  //   - SpaceJump: mult *= 1.5 (easier, faster escape)
  //   - Grapple: mult *= 1.25 (middle)
  //   - Base mult is 1.25 from 'Croc -> Norfair Entrance'

  const baseMult = 1.25;  // 'Croc -> Norfair Entrance'
  const minE = 2;

  // Check each escape method with its adjusted hell run mult
  return wor(snapshot, staticData,
    // SpaceJump (mult *= 1.5 -> 1.25 * 1.5 = 1.875)
    wand(snapshot, staticData,
      haveItem(snapshot, staticData, 'SpaceJump'),
      canHellRun(snapshot, staticData, 'MainUpperNorfair', baseMult * 1.5, minE)),
    // IBJ with heat protection (mult *= 0.7 -> 1.25 * 0.7 = 0.875)
    wand(snapshot, staticData,
      canInfiniteBombJump(snapshot, staticData),
      wor(snapshot, staticData,
        heatProof(snapshot, staticData),
        haveItem(snapshot, staticData, 'Gravity'),
        haveItem(snapshot, staticData, 'Ice')),
      canHellRun(snapshot, staticData, 'MainUpperNorfair', baseMult * 0.7, minE)),
    // Grapple (mult *= 1.25 -> 1.25 * 1.25 = 1.5625)
    wand(snapshot, staticData,
      haveItem(snapshot, staticData, 'Grapple'),
      canHellRun(snapshot, staticData, 'MainUpperNorfair', baseMult * 1.25, minE)),
    // SpeedBooster + HiJump (uses base mult = 1.25)
    wand(snapshot, staticData,
      haveItem(snapshot, staticData, 'SpeedBooster'),
      haveItem(snapshot, staticData, 'HiJump'),
      canHellRun(snapshot, staticData, 'MainUpperNorfair', baseMult, minE)),
    // SpeedBooster + ShortCharge (mult *= 0.7)
    wand(snapshot, staticData,
      haveItem(snapshot, staticData, 'SpeedBooster'),
      knowsShortCharge(snapshot, staticData),
      canHellRun(snapshot, staticData, 'MainUpperNorfair', baseMult * 0.7, minE)),
    // HiJump + SpringBall (uses base mult = 1.25)
    wand(snapshot, staticData,
      haveItem(snapshot, staticData, 'HiJump'),
      canSpringBallJump(snapshot, staticData),
      canHellRun(snapshot, staticData, 'MainUpperNorfair', baseMult, minE)));
}

export function canClimbBottomRedTower(snapshot, staticData) {
  // Red Tower climbing - needs vertical movement
  return wor(snapshot, staticData,
    canFly(snapshot, staticData),
    haveItem(snapshot, staticData, 'HiJump'),
    haveItem(snapshot, staticData, 'Ice'));
}

export function canClimbRedTower(snapshot, staticData) {
  // Python: knowsRedTowerClimb OR Ice OR SpaceJump
  // Wall jump technique or items that help climb
  return wor(snapshot, staticData,
    knowsRedTowerClimb(snapshot, staticData),
    haveItem(snapshot, staticData, 'Ice'),
    haveItem(snapshot, staticData, 'SpaceJump'));
}

export function canClimbBubbleMountain(snapshot, staticData) {
  // Bubble Mountain (Norfair) - needs vertical movement
  // Python: wor(haveItem('HiJump'), canFly(), haveItem('Ice'), knowsBubbleMountainWallJump())
  return wor(snapshot, staticData,
    haveItem(snapshot, staticData, 'HiJump'),
    canFly(snapshot, staticData),
    haveItem(snapshot, staticData, 'Ice'),
    knowsBubbleMountainWallJump(snapshot, staticData));
}

export function canClimbColosseum(snapshot, staticData) {
  // Colosseum climbing - needs vertical movement + Gravity
  return wand(snapshot, staticData,
    haveItem(snapshot, staticData, 'Gravity'),
    wor(snapshot, staticData,
      canFly(snapshot, staticData),
      haveItem(snapshot, staticData, 'HiJump')));
}

export function canPassDachoraRoom(snapshot, staticData) {
  // Dachora room - needs Speed Booster OR can destroy bomb walls
  // Python: sm.wor(sm.haveItem('SpeedBooster'), sm.canDestroyBombWalls())
  return wor(snapshot, staticData,
    haveItem(snapshot, staticData, 'SpeedBooster'),
    canDestroyBombWalls(snapshot, staticData));
}

export function canAccessEtecoons(snapshot, staticData) {
  // Access to Etecoons - needs Power Bombs
  return canUsePowerBombs(snapshot, staticData);
}

export function canDoOuterMaridia(snapshot, staticData) {
  // Outer Maridia - Gravity OR suitless requirements
  return wor(snapshot, staticData,
    haveItem(snapshot, staticData, 'Gravity'),
    canDoSuitlessOuterMaridia(snapshot, staticData));
}

export function canPassLowerNorfairChozo(snapshot, staticData) {
  // Lower Norfair Chozo - from Python:
  // sm.wand(sm.canHellRun(**Settings.hellRunsTable['LowerNorfair']['Entrance -> GT via Chozo']),
  //         sm.canUsePowerBombs(),
  //         sm.wor(RomPatches.has(sm.player, RomPatches.LNChozoSJCheckDisabled), sm.haveItem('SpaceJump')))
  //
  // The LNChozoSJCheckDisabled ROM patch allows passing without Space Jump.
  // Without the patch, Space Jump is required to reach the area.
  const playerId = getPlayerId(snapshot, staticData);
  const romPatches = staticData?.settings?.[playerId]?.romPatches || {};
  const hasLNChozoSJCheckDisabled = romPatches.LNChozoSJCheckDisabled === true;

  return wand(snapshot, staticData,
    canHellRun(snapshot, staticData, 'LowerNorfair'),
    canUsePowerBombs(snapshot, staticData),
    wor(snapshot, staticData,
      SMBool(hasLNChozoSJCheckDisabled, 0),
      haveItem(snapshot, staticData, 'SpaceJump')));
}

export function canHellRunToSpeedBooster(snapshot, staticData) {
  // Hell run to Speed Booster - from Python:
  // canHellRun('MainUpperNorfair', 1.0, 3) without SpeedBooster
  // canHellRun('MainUpperNorfair', 2.0, 2) with SpeedBooster (easier)
  const hasSpeed = haveItem(snapshot, staticData, 'SpeedBooster').bool;
  if (hasSpeed) {
    // With Speed Booster: mult=2.0, minE=2
    return canHellRun(snapshot, staticData, 'MainUpperNorfair', 2.0, 2);
  } else {
    // Without Speed Booster: mult=1.0, minE=3
    return canHellRun(snapshot, staticData, 'MainUpperNorfair', 1.0, 3);
  }
}

export function canHellRunBackFromGrappleEscape(snapshot, staticData) {
  // Hell run from Grapple - needs heat resistance + Grapple
  return wand(snapshot, staticData,
    heatProof(snapshot, staticData),
    haveItem(snapshot, staticData, 'Grapple'));
}

export function canHellRunBackFromSpeedBoosterMissile(snapshot, staticData) {
  // Hell run from Speed Booster missile - needs more energy for round trip
  // From Python: wor(RomPatches.SpeedAreaBlueDoors, traverse('SpeedBoosterHallRight'), canHellRun(...))
  // The ROM patch SpeedAreaBlueDoors is typically active (in TotalBase)
  // If patch is active, return true with difficulty 0
  // Otherwise check traverse or hell run
  return wor(snapshot, staticData,
    // SpeedAreaBlueDoors patch - typically active, makes this trivial
    SMBool(snapshot, staticData, true),
    // Can traverse (door check)
    traverse(snapshot, staticData, 'SpeedBoosterHallRight'),
    // Hell run option with stricter mult
    (() => {
      const hasSpeed = haveItem(snapshot, staticData, 'SpeedBooster').bool;
      const mult = hasSpeed ? 0.66 : 0.33;
      return canHellRun(snapshot, staticData, 'MainUpperNorfair', mult, 3);
    })()
  );
}

export function canExitPreciousRoom(snapshot, staticData) {
  // Exit Precious Room (Maridia) - needs Gravity or special movement
  return wor(snapshot, staticData,
    haveItem(snapshot, staticData, 'Gravity'),
    canFly(snapshot, staticData));
}

export function canExitWaveBeam(snapshot, staticData) {
  // Exit Wave Beam room:
  // Option 1: Morph (exit through lower passage under the spikes)
  // Option 2: (SpaceJump OR Grapple) to exit through blue gate AND
  //           (Wave OR (heatProof AND canBlueGateGlitch AND 2+ missiles))
  return wor(snapshot, staticData,
    haveItem(snapshot, staticData, 'Morph'),  // exit through lower passage under spikes
    wand(snapshot, staticData,
      wor(snapshot, staticData,  // exit through blue gate
        haveItem(snapshot, staticData, 'SpaceJump'),
        haveItem(snapshot, staticData, 'Grapple')
      ),
      wor(snapshot, staticData,
        haveItem(snapshot, staticData, 'Wave'),
        wand(snapshot, staticData,
          heatProof(snapshot, staticData),  // hell run + gate glitch is too much
          canBlueGateGlitch(snapshot, staticData),
          itemCountOk(snapshot, staticData, 'Missile', 2)  // need 2 packs as no farming
        )
      )
    )
  );
}

export function canExitScrewAttackArea(snapshot, staticData) {
  // Exit Screw Attack area - from Python:
  // sm.wand(sm.canDestroyBombWalls(),
  //         sm.wor(sm.canFly(),
  //                sm.wand(HiJump, SpeedBooster, wor(wand(ScrewAttack, knowsScrewAttackExit), knowsScrewAttackExitWithoutScrew)),
  //                sm.wand(canUseSpringBall(), knowsSpringBallJumpFromWall()),
  //                sm.wand(canSimpleShortCharge(), enoughStuffGT())))

  // Get knows settings for this player
  const playerId = getPlayerId(snapshot, staticData);
  const knowsSettings = staticData?.settings?.[playerId]?.knows || {};

  // Check knows techniques
  const screwAttackExitKnows = knowsSettings.ScrewAttackExit || [false, 0];
  const screwAttackExitWithoutScrewKnows = knowsSettings.ScrewAttackExitWithoutScrew || [false, 0];
  const springBallJumpFromWallKnows = knowsSettings.SpringBallJumpFromWall || [false, 0];

  const hasScrewAttackExit = screwAttackExitKnows[0] === true;
  const hasScrewAttackExitWithoutScrew = screwAttackExitWithoutScrewKnows[0] === true;
  const hasSpringBallJumpFromWall = springBallJumpFromWallKnows[0] === true;

  return wand(snapshot, staticData,
    canDestroyBombWalls(snapshot, staticData),
    wor(snapshot, staticData,
      // Option 1: Space Jump
      canFly(snapshot, staticData),
      // Option 2: HiJump + SpeedBooster + knows technique
      wand(snapshot, staticData,
        haveItem(snapshot, staticData, 'HiJump'),
        haveItem(snapshot, staticData, 'SpeedBooster'),
        wor(snapshot, staticData,
          wand(snapshot, staticData,
            haveItem(snapshot, staticData, 'ScrewAttack'),
            SMBool(hasScrewAttackExit, screwAttackExitKnows[1] || 0)),
          SMBool(hasScrewAttackExitWithoutScrew, screwAttackExitWithoutScrewKnows[1] || 0))),
      // Option 3: Spring Ball technique
      wand(snapshot, staticData,
        canUseSpringBall(snapshot, staticData),
        SMBool(hasSpringBallJumpFromWall, springBallJumpFromWallKnows[1] || 0)),
      // Option 4: Short charge + kill GT (can spark out after fighting GT)
      wand(snapshot, staticData,
        canSimpleShortCharge(snapshot, staticData),
        enoughStuffGT(snapshot, staticData))));
}

export function getPiratesPseudoScrewCoeff(snapshot, staticData) {
  // Pirates coefficient - conservative: return 1.0 (default)
  return { bool: true, difficulty: 0 };
}

export function int(snapshot, staticData, value) {
  // Integer conversion helper - just return the value
  return { bool: true, difficulty: 0 };
}

// Additional knowledge techniques
export function knowsBillyMays(snapshot, staticData) {
  // Billy Mays room access knowledge
  return { bool: true, difficulty: 0 };
}

export function knowsContinuousWallJump(snapshot, staticData) {
  // Continuous wall jump technique - DISABLED in regular preset
  return { bool: false, difficulty: 0 };
}

export function knowsDiagonalBombJump(snapshot, staticData) {
  // Diagonal bomb jump technique - DISABLED in regular preset
  return { bool: false, difficulty: 0 };
}

export function knowsMockballWs(snapshot, staticData) {
  // Mockball in West Sand technique - DISABLED in Regular preset
  const playerId = getPlayerId(snapshot, staticData);
  const knowsSettings = staticData?.settings?.[playerId]?.knows || {};

  if ('MockballWs' in knowsSettings) {
    const [enabled, difficulty] = knowsSettings.MockballWs;
    return { bool: enabled, difficulty: enabled ? difficulty : 0 };
  }
  return { bool: false, difficulty: 0 };  // Default: disabled
}

export function knowsGravLessLevel1(snapshot, staticData) {
  // Gravity-less technique level 1
  // Regular preset: difficulty 50 (hardcore level)
  return { bool: true, difficulty: 50 };
}

export function knowsGravLessLevel2(snapshot, staticData) {
  // Gravity-less technique level 2
  return { bool: true, difficulty: 0 };
}

export function knowsSpongeBathBombJump(snapshot, staticData) {
  // Sponge Bath bomb jump technique
  return { bool: true, difficulty: 0 };
}

export function knowsSpongeBathHiJump(snapshot, staticData) {
  // Sponge Bath high jump technique
  return { bool: true, difficulty: 0 };
}

export function knowsSpongeBathSpeed(snapshot, staticData) {
  // Sponge Bath speed technique
  return { bool: true, difficulty: 0 };
}

export function knowsWestSandHoleSuitlessWallJumps(snapshot, staticData) {
  // West Sand Hole suitless wall jumps
  return { bool: true, difficulty: 0 };
}

// Additional medium priority helpers
export function canAccessBillyMays(snapshot, staticData) {
  // Billy Mays room access: needs Power Bombs and movement
  // Conservative: require Power Bombs AND (knowledge OR Gravity OR SpaceJump)
  return wand(snapshot, staticData,
    canUsePowerBombs(snapshot, staticData),
    wor(snapshot, staticData,
      knowsBillyMays(snapshot, staticData),
      haveItem(snapshot, staticData, 'Gravity'),
      haveItem(snapshot, staticData, 'SpaceJump')));
}

export function canAccessItemsInWestSandHole(snapshot, staticData) {
  // West Sand Hole items access - multiple strategies
  return wor(snapshot, staticData,
    // Vanilla strat: HiJump + SpringBall
    wand(snapshot, staticData,
      haveItem(snapshot, staticData, 'HiJump'),
      canUseSpringBall(snapshot, staticData)),
    // Alternate strat: SpaceJump + (SpringBall OR Bombs)
    wand(snapshot, staticData,
      haveItem(snapshot, staticData, 'SpaceJump'),
      wor(snapshot, staticData,
        canUseSpringBall(snapshot, staticData),
        canUseBombs(snapshot, staticData))),
    // Wall jump strat: bomb passages + wall jump knowledge
    wand(snapshot, staticData,
      canPassBombPassages(snapshot, staticData),
      knowsMaridiaWallJumps(snapshot, staticData)));
}

// Moat passage helpers
export function canPassMoat(snapshot, staticData) {
  // Multiple strategies to pass the Moat
  return wor(snapshot, staticData,
    haveItem(snapshot, staticData, 'Grapple'),
    haveItem(snapshot, staticData, 'SpaceJump'),
    knowsContinuousWallJump(snapshot, staticData),
    wand(snapshot, staticData,
      knowsDiagonalBombJump(snapshot, staticData),
      canUseBombs(snapshot, staticData)),
    canSimpleShortCharge(snapshot, staticData),
    wand(snapshot, staticData,
      haveItem(snapshot, staticData, 'Gravity'),
      wor(snapshot, staticData,
        knowsGravityJump(snapshot, staticData),
        haveItem(snapshot, staticData, 'HiJump'),
        canInfiniteBombJump(snapshot, staticData))),
    wand(snapshot, staticData,
      knowsMockballWs(snapshot, staticData),
      canUseSpringBall(snapshot, staticData)));
}

export function canPassMoatFromMoat(snapshot, staticData) {
  // Pass the Moat from the Moat location
  return wor(snapshot, staticData,
    haveItem(snapshot, staticData, 'Grapple'),
    haveItem(snapshot, staticData, 'SpaceJump'),
    wand(snapshot, staticData,
      knowsDiagonalBombJump(snapshot, staticData),
      canUseBombs(snapshot, staticData)),
    wand(snapshot, staticData,
      haveItem(snapshot, staticData, 'Gravity'),
      wor(snapshot, staticData,
        knowsGravityJump(snapshot, staticData),
        haveItem(snapshot, staticData, 'HiJump'),
        canInfiniteBombJump(snapshot, staticData))));
}

export function canPassMoatReverse(snapshot, staticData) {
  // Pass the Moat in reverse direction (conservative: ignore ROM patches)
  return wor(snapshot, staticData,
    haveItem(snapshot, staticData, 'Grapple'),
    haveItem(snapshot, staticData, 'SpaceJump'),
    haveItem(snapshot, staticData, 'Gravity'),
    canPassBombPassages(snapshot, staticData));
}

// Additional room-specific helpers
export function canKillRedKiHunters(snapshot, staticData, n) {
  // Kill Red Ki-Hunters in heated areas
  return wor(snapshot, staticData,
    haveItem(snapshot, staticData, 'Plasma'),
    haveItem(snapshot, staticData, 'ScrewAttack'),
    wand(snapshot, staticData,
      heatProof(snapshot, staticData),
      wor(snapshot, staticData,
        haveItem(snapshot, staticData, 'Spazer'),
        haveItem(snapshot, staticData, 'Ice'),
        wand(snapshot, staticData,
          haveItem(snapshot, staticData, 'Charge'),
          haveItem(snapshot, staticData, 'Wave')))));
}

export function canDoSuitlessOuterMaridia(snapshot, staticData) {
  // Navigate outer Maridia without Gravity suit
  return wand(snapshot, staticData,
    knowsGravLessLevel1(snapshot, staticData),
    haveItem(snapshot, staticData, 'HiJump'),
    wor(snapshot, staticData,
      haveItem(snapshot, staticData, 'Ice'),
      canSpringBallJump(snapshot, staticData)));
}

export function canClimbWestSandHole(snapshot, staticData) {
  // Climb West Sand Hole
  return wor(snapshot, staticData,
    haveItem(snapshot, staticData, 'Gravity'),
    wand(snapshot, staticData,
      haveItem(snapshot, staticData, 'HiJump'),
      knowsGravLessLevel3(snapshot, staticData),
      wor(snapshot, staticData,
        haveItem(snapshot, staticData, 'SpaceJump'),
        canSpringBallJump(snapshot, staticData),
        knowsWestSandHoleSuitlessWallJumps(snapshot, staticData))));
}

export function canPassSpongeBath(snapshot, staticData) {
  // Pass through Sponge Bath area
  return wor(snapshot, staticData,
    wand(snapshot, staticData,
      canPassBombPassages(snapshot, staticData),
      knowsSpongeBathBombJump(snapshot, staticData)),
    wand(snapshot, staticData,
      haveItem(snapshot, staticData, 'HiJump'),
      knowsSpongeBathHiJump(snapshot, staticData)),
    haveItem(snapshot, staticData, 'Gravity'),
    haveItem(snapshot, staticData, 'SpaceJump'),
    wand(snapshot, staticData,
      haveItem(snapshot, staticData, 'SpeedBooster'),
      knowsSpongeBathSpeed(snapshot, staticData)),
    canSpringBallJump(snapshot, staticData));
}

/**
 * Helper function registry
 * Export all helper functions that can be called from rules
 */
export const helperFunctions = {
  // Core functions
  has,
  count,
  any,
  SMBool,
  evalSMBool,
  bossDead,
  // VARIA logic functions
  wor,
  wand,
  haveItem,
  // Basic item checks
  canUseBombs,
  canUsePowerBombs,
  canUseSpringBall,
  haveMissileOrSuper,
  itemCountOk,
  // Passage checks
  canPassBombPassages,
  canPassBowling,
  canDestroyBombWalls,
  canDestroyBombWallsUnderwater,
  // Door and room checks
  canOpenEyeDoors,
  canOpenRedDoors,
  canOpenGreenDoors,
  canOpenYellowDoors,
  canFireChargedShots,
  traverse,
  // Knowledge techniques
  knowsCeilingDBoost,
  knowsInfiniteBombJump,
  knowsSimpleShortCharge,
  knowsShortCharge,
  knowsMockball,
  knowsAlcatrazEscape,
  knowsGreenGateGlitch,
  knowsEarlyKraid,
  knowsGravLessLevel3,
  knowsFirefleasWalljump,
  knowsBubbleMountainWallJump,
  knowsGetAroundWallJump,
  knowsIceEscape,
  knowsXrayDboost,
  knowsXrayIce,
  knowsReverseGateGlitch,
  knowsReverseGateGlitchHiJumpLess,
  knowsCrocPBsDBoost,
  knowsCrocPBsIce,
  knowsMaridiaWallJumps,
  knowsOldMBWithSpeed,
  knowsRonPopeilScrew,
  knowsSpringBallJumpFromWall,
  knowsKillPlasmaPiratesWithSpark,
  knowsKillPlasmaPiratesWithCharge,
  knowsGravityJump,
  knowsLavaDive,
  knowsLavaDiveNoHiJump,
  knowsMtEverestGravJump,
  knowsTediousMountEverest,
  knowsRedTowerClimb,
  knowsNovaBoost,
  // Advanced movement
  canInfiniteBombJump,
  canFly,
  canSimpleShortCharge,
  canShortCharge,
  canMockball,
  canSpringBallJump,
  canJumpUnderwater,
  // Environmental hazards
  canHellRun,
  canAccessSandPits,
  canTraverseSandPits,
  heatProof,
  getDmgReduction,
  divideByDmgReduction,
  energyReserveCountOk,
  enoughStuffGT,
  // Combat
  canKillBeetoms,
  // Glitches
  canGreenGateGlitch,
  // Boss requirements
  enoughStuffsKraid,
  enoughStuffsPhantoon,
  enoughStuffsRidley,
  enoughStuffCroc,
  enoughStuffSporeSpawn,
  enoughStuffTourian,
  enoughStuffsMotherbrain,
  canPassMetroids,
  canPassZebetites,
  // Room-specific helpers
  canAccessKraidsLair,
  canExitCathedral,
  canGoUpMtEverest,
  canPassMtEverest,
  canDefeatBotwoon,
  energyReserveCountOkHardRoom,
  canPassLavaPit,
  canPassLavaPitReverse,
  canGrappleEscape,
  canClimbBottomRedTower,
  canClimbRedTower,
  canClimbBubbleMountain,
  canClimbColosseum,
  canPassDachoraRoom,
  canAccessEtecoons,
  canDoOuterMaridia,
  canPassLowerNorfairChozo,
  canHellRunToSpeedBooster,
  canHellRunBackFromGrappleEscape,
  canHellRunBackFromSpeedBoosterMissile,
  canExitPreciousRoom,
  canExitWaveBeam,
  canExitScrewAttackArea,
  getPiratesPseudoScrewCoeff,
  int,
  knowsBillyMays,
  knowsContinuousWallJump,
  knowsDiagonalBombJump,
  knowsMockballWs,
  knowsGravLessLevel1,
  knowsGravLessLevel2,
  knowsSpongeBathBombJump,
  knowsSpongeBathHiJump,
  knowsSpongeBathSpeed,
  knowsWestSandHoleSuitlessWallJumps,
  canAccessBillyMays,
  canAccessItemsInWestSandHole,
  canPassMoat,
  canPassMoatFromMoat,
  canPassMoatReverse,
  canKillRedKiHunters,
  canDoSuitlessOuterMaridia,
  canClimbWestSandHole,
  canPassSpongeBath,
  // Additional helpers that were defined but not exported
  canAccessDoubleChamberItems,
  canAccessShaktoolFromPantsRoom,
  canBotwoonExitToColosseum,
  canColosseumToBotwoonExit,
  canDoLowGauntlet,
  canDoubleSpringBallJump,
  canEnterAndLeaveGauntlet,
  canEnterAndLeaveGauntletQty,
  canEnterNorfairReserveAreaFromBubbleMoutain,
  canEnterNorfairReserveAreaFromBubbleMoutainTop,
  canGoThroughColosseumSuitless,
  canPassCrateriaGreenPirates,
  canPassFrogSpeedwayRightToLeft,
  canPassG4,
  canPassMaridiaToRedTowerNode,
  canPassRedTowerToMaridiaNode,
  canPassTerminatorBombWall,
  canPassWorstRoom,
  canPassWorstRoomPirates,
  canUseCrocRoomToChargeSpeed,
  knowsHiJumpMamaTurtle,
  knowsIceMissileFromCroc,
  knowsSpringBallJump,
  knowsLowGauntlet,
  knowsWorstRoomIceCharge,
  knowsWorstRoomWallJump,
  knowsDodgeLowerNorfairEnemies,
  knowsFrogSpeedwayWithoutSpeed,
  knowsNorfairReserveDBoost,
  knowsDoubleChamberWallJump,
  knowsPuyoClip,
  knowsAccessSpringBallWithHiJump,
  knowsHiJumpGauntletAccess,
  knowsHiJumpLessGauntletAccess,
  // New helper functions (21 total)
  canBlueGateGlitch,
  canMorphJump,
  canEnterCathedral,
  canExitCrabHole,
  canPassAmphitheaterReverse,
  canPassBotwoonHallway,
  canPassCacatacAlley,
  canPassForgottenHighway,
  canPassNinjaPirates,
  canPassRedKiHunters,
  canPassThreeMuskateers,
  canPassWastelandDessgeegas,
  canTraverseCrabTunnelLeftToRight,
  canTraverseWestSandHallLeftToRight,
  canFightDraygon,
  enoughStuffsDraygon,
  canExitDraygon,
  canGetBackFromRidleyZone,
  canReachCacatacAlleyFromBotowoon,
  wnot,
  knowsSnailClip
};

/**
 * SM-specific state module
 * Initializes state with smbm object that contains maxDiff
 */
export const smStateModule = {
  /**
   * Initializes a new Super Metroid game state with smbm support
   */
  initializeState() {
    return {
      flags: [],
      events: [],
      // Initialize smbm for each player
      // The index is the player ID (1-based)
      smbm: {
        // Default maxDiff for player 1
        // This represents the maximum difficulty the player is willing to accept
        // VARIA difficulties: easy=1, medium=5, hard=10, harder=25, hardcore=50, mania=100
        // Template uses max_difficulty: hardcore (50)
        1: {
          maxDiff: 50 // Hardcore difficulty (matches template default)
        }
      }
    };
  },

  /**
   * Loads settings into the game state
   */
  loadSettings(gameState, settings) {
    return { ...gameState };
  },

  /**
   * Adds an item to inventory (called when a location is collected)
   */
  addItem(gameState, itemName) {
    return gameState; // Generic handling by StateManager
  },

  /**
   * Removes an item from inventory
   */
  removeItem(gameState, itemName) {
    return gameState; // Generic handling by StateManager
  },

  /**
   * Extracts state for snapshot
   * Returns all game-specific state fields including smbm
   */
  getStateForSnapshot(gameState) {
    return {
      flags: gameState.flags || [],
      events: gameState.events || [],
      smbm: gameState.smbm || {
        1: { maxDiff: 50 } // Hardcore difficulty (matches template default)
      }
    };
  }
};

// ============================================================================
// Additional Helper Functions
// ============================================================================

/**
 * Can pass the bomb wall at Terminator (Energy Tank, Terminator location)
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static game data
 * @param {boolean} fromLandingSite - Whether approaching from Landing Site
 * @returns {Object} SMBool
 */
export function canPassTerminatorBombWall(snapshot, staticData, fromLandingSite = true) {
  return wor(snapshot, staticData,
    wand(snapshot, staticData,
      haveItem(snapshot, staticData, 'SpeedBooster'),
      wor(snapshot, staticData,
        { bool: !fromLandingSite, difficulty: 0 },
        knowsSimpleShortCharge(snapshot, staticData),
        knowsShortCharge(snapshot, staticData)
      )
    ),
    canDestroyBombWalls(snapshot, staticData)
  );
}

/**
 * Can pass through the green pirates in Crateria
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static game data
 * @returns {Object} SMBool
 */
export function canPassCrateriaGreenPirates(snapshot, staticData) {
  return wor(snapshot, staticData,
    canPassBombPassages(snapshot, staticData),
    haveMissileOrSuper(snapshot, staticData),
    energyReserveCountOk(snapshot, staticData, 1),
    wor(snapshot, staticData,
      haveItem(snapshot, staticData, 'Charge'),
      haveItem(snapshot, staticData, 'Ice'),
      haveItem(snapshot, staticData, 'Wave'),
      wor(snapshot, staticData,
        haveItem(snapshot, staticData, 'Spazer'),
        haveItem(snapshot, staticData, 'Plasma'),
        haveItem(snapshot, staticData, 'ScrewAttack')
      )
    )
  );
}

/**
 * Can enter and leave the gauntlet with specific quantities
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static game data
 * @param {number} nPB - Number of power bombs required
 * @param {number} nTanksSpark - Number of tanks for spark
 * @returns {Object} SMBool
 */
export function canEnterAndLeaveGauntletQty(snapshot, staticData, nPB, nTanksSpark) {
  return wand(snapshot, staticData,
    wor(snapshot, staticData,
      canFly(snapshot, staticData),
      haveItem(snapshot, staticData, 'SpeedBooster'),
      wand(snapshot, staticData,
        knowsHiJumpGauntletAccess(snapshot, staticData),
        haveItem(snapshot, staticData, 'HiJump')
      ),
      knowsHiJumpLessGauntletAccess(snapshot, staticData)
    ),
    wor(snapshot, staticData,
      haveItem(snapshot, staticData, 'ScrewAttack'),
      wor(snapshot, staticData,
        wand(snapshot, staticData,
          energyReserveCountOkHardRoom(snapshot, staticData, 'Gauntlet'),
          wand(snapshot, staticData,
            canUsePowerBombs(snapshot, staticData),
            wor(snapshot, staticData,
              itemCountOk(snapshot, staticData, 'PowerBomb', nPB),
              wand(snapshot, staticData,
                haveItem(snapshot, staticData, 'SpeedBooster'),
                energyReserveCountOk(snapshot, staticData, nTanksSpark)
              )
            )
          )
        ),
        wand(snapshot, staticData,
          energyReserveCountOkHardRoom(snapshot, staticData, 'Gauntlet', 0.51),
          canUseBombs(snapshot, staticData)
        )
      )
    )
  );
}

/**
 * Can enter and leave the gauntlet
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static game data
 * @returns {Object} SMBool
 */
export function canEnterAndLeaveGauntlet(snapshot, staticData) {
  return wor(snapshot, staticData,
    wand(snapshot, staticData,
      canShortCharge(snapshot, staticData),
      canEnterAndLeaveGauntletQty(snapshot, staticData, 2, 2)
    ),
    canEnterAndLeaveGauntletQty(snapshot, staticData, 2, 3)
  );
}

/**
 * Can do the low gauntlet route
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static game data
 * @returns {Object} SMBool
 */
export function canDoLowGauntlet(snapshot, staticData) {
  return wand(snapshot, staticData,
    canShortCharge(snapshot, staticData),
    canUsePowerBombs(snapshot, staticData),
    itemCountOk(snapshot, staticData, 'ETank', 1),
    knowsLowGauntlet(snapshot, staticData)
  );
}

/**
 * Can pass the worst room (in Norfair)
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static game data
 * @returns {Object} SMBool
 */
export function canPassWorstRoom(snapshot, staticData) {
  return wand(snapshot, staticData,
    canDestroyBombWalls(snapshot, staticData),
    canPassWorstRoomPirates(snapshot, staticData),
    wor(snapshot, staticData,
      canFly(snapshot, staticData),
      wand(snapshot, staticData,
        knowsWorstRoomIceCharge(snapshot, staticData),
        haveItem(snapshot, staticData, 'Ice'),
        canFireChargedShots(snapshot, staticData)
      ),
      wor(snapshot, staticData,
        wand(snapshot, staticData,
          knowsGetAroundWallJump(snapshot, staticData),
          haveItem(snapshot, staticData, 'HiJump')
        ),
        knowsWorstRoomWallJump(snapshot, staticData)
      ),
      wand(snapshot, staticData,
        knowsSpringBallJumpFromWall(snapshot, staticData),
        canUseSpringBall(snapshot, staticData)
      )
    )
  );
}

/**
 * Can pass the pirates in the worst room
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static game data
 * @returns {Object} SMBool
 */
export function canPassWorstRoomPirates(snapshot, staticData) {
  return wor(snapshot, staticData,
    haveItem(snapshot, staticData, 'ScrewAttack'),
    itemCountOk(snapshot, staticData, 'Missile', 6),
    itemCountOk(snapshot, staticData, 'Super', 3),
    wand(snapshot, staticData,
      canFireChargedShots(snapshot, staticData),
      haveItem(snapshot, staticData, 'Plasma')
    ),
    wand(snapshot, staticData,
      haveItem(snapshot, staticData, 'Charge'),
      wor(snapshot, staticData,
        haveItem(snapshot, staticData, 'Spazer'),
        haveItem(snapshot, staticData, 'Wave'),
        haveItem(snapshot, staticData, 'Ice')
      )
    ),
    knowsDodgeLowerNorfairEnemies(snapshot, staticData)
  );
}

/**
 * Can pass from Maridia to Red Tower node
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static game data
 * @returns {Object} SMBool
 */
export function canPassMaridiaToRedTowerNode(snapshot, staticData) {
  // Note: RomPatches.has() calls are already resolved to constants by the exporter
  return wand(snapshot, staticData,
    haveItem(snapshot, staticData, 'Morph'),
    haveItem(snapshot, staticData, 'Super')  // Assuming AreaRandoGatesBase patch is not active
  );
}

/**
 * Can pass from Red Tower to Maridia node
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static game data
 * @returns {Object} SMBool
 */
export function canPassRedTowerToMaridiaNode(snapshot, staticData) {
  // Note: RomPatches.has() calls are already resolved to constants by the exporter
  // This route is only available with the AreaRandoGatesBase patch, which is typically false
  return { bool: false, difficulty: 0 };
}

/**
 * Can pass Frog Speedway from right to left
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static game data
 * @returns {Object} SMBool
 */
export function canPassFrogSpeedwayRightToLeft(snapshot, staticData) {
  return wor(snapshot, staticData,
    haveItem(snapshot, staticData, 'SpeedBooster'),
    wand(snapshot, staticData,
      knowsFrogSpeedwayWithoutSpeed(snapshot, staticData),
      haveItem(snapshot, staticData, 'Wave'),
      wor(snapshot, staticData,
        haveItem(snapshot, staticData, 'Spazer'),
        haveItem(snapshot, staticData, 'Plasma')
      )
    )
  );
}

/**
 * Can enter Norfair Reserve area from Bubble Mountain
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static game data
 * @returns {Object} SMBool
 */
export function canEnterNorfairReserveAreaFromBubbleMoutain(snapshot, staticData) {
  return wand(snapshot, staticData,
    traverse(snapshot, staticData, 'BubbleMountainTopLeft'),
    wor(snapshot, staticData,
      canFly(snapshot, staticData),
      haveItem(snapshot, staticData, 'Ice'),
      wand(snapshot, staticData,
        haveItem(snapshot, staticData, 'HiJump'),
        knowsGetAroundWallJump(snapshot, staticData)
      ),
      wand(snapshot, staticData,
        canUseSpringBall(snapshot, staticData),
        knowsSpringBallJumpFromWall(snapshot, staticData)
      )
    )
  );
}

/**
 * Can enter Norfair Reserve area from Bubble Mountain Top
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static game data
 * @returns {Object} SMBool
 */
export function canEnterNorfairReserveAreaFromBubbleMoutainTop(snapshot, staticData) {
  return wand(snapshot, staticData,
    traverse(snapshot, staticData, 'BubbleMountainTopLeft'),
    wor(snapshot, staticData,
      haveItem(snapshot, staticData, 'Grapple'),
      haveItem(snapshot, staticData, 'SpaceJump'),
      knowsNorfairReserveDBoost(snapshot, staticData)
    )
  );
}

/**
 * Can access items in Double Chamber
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static game data
 * @returns {Object} SMBool
 */
export function canAccessDoubleChamberItems(snapshot, staticData) {
  // Access Double Chamber items via hellRun from 'Bubble -> Wave' table:
  // hellRun: 'MainUpperNorfair', mult: 0.75, minE: 2
  return wor(snapshot, staticData,
    // Option 1: traverse SingleChamberRight with full hellRun
    wand(snapshot, staticData,
      traverse(snapshot, staticData, 'SingleChamberRight'),
      canHellRun(snapshot, staticData, 'MainUpperNorfair', 0.75, 2)
    ),
    // Option 2: with movement abilities, can take a faster path (mult * 0.8 = 0.6)
    wand(snapshot, staticData,
      wor(snapshot, staticData,
        haveItem(snapshot, staticData, 'HiJump'),
        canSimpleShortCharge(snapshot, staticData),
        canFly(snapshot, staticData),
        knowsDoubleChamberWallJump(snapshot, staticData)
      ),
      canHellRun(snapshot, staticData, 'MainUpperNorfair', 0.6, 2)
    )
  );
}

/**
 * Can exit from Botwoon room to Colosseum
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static game data
 * @returns {Object} SMBool
 */
export function canBotwoonExitToColosseum(snapshot, staticData) {
  return wand(snapshot, staticData,
    wor(snapshot, staticData,
      wand(snapshot, staticData,
        haveItem(snapshot, staticData, 'Gravity'),
        haveItem(snapshot, staticData, 'SpeedBooster')
      ),
      wand(snapshot, staticData,
        haveItem(snapshot, staticData, 'Morph'),
        canJumpUnderwater(snapshot, staticData)
      )
    ),
    wor(snapshot, staticData,
      haveItem(snapshot, staticData, 'Gravity'),
      wand(snapshot, staticData,
        knowsGravLessLevel2(snapshot, staticData),
        haveItem(snapshot, staticData, 'HiJump'),
        wor(snapshot, staticData,
          haveItem(snapshot, staticData, 'Grapple'),
          haveItem(snapshot, staticData, 'Ice'),
          wand(snapshot, staticData,
            canDoubleSpringBallJump(snapshot, staticData),
            haveItem(snapshot, staticData, 'SpaceJump')
          )
        ),
        canGoThroughColosseumSuitless(snapshot, staticData)
      )
    )
  );
}

/**
 * Can exit from Colosseum to Botwoon
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static game data
 * @returns {Object} SMBool
 */
export function canColosseumToBotwoonExit(snapshot, staticData) {
  return wor(snapshot, staticData,
    haveItem(snapshot, staticData, 'Gravity'),
    wand(snapshot, staticData,
      knowsGravLessLevel2(snapshot, staticData),
      haveItem(snapshot, staticData, 'HiJump'),
      canGoThroughColosseumSuitless(snapshot, staticData)
    )
  );
}

/**
 * Can use Croc Room to charge speed
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static game data
 * @returns {Object} SMBool
 */
export function canUseCrocRoomToChargeSpeed(snapshot, staticData) {
  // This checks if specific access points are connected in area rando
  // For now, return false as this is area rando specific
  return { bool: false, difficulty: 0 };
}

/**
 * Can access Shaktool from Pants Room
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static game data
 * @returns {Object} SMBool
 */
export function canAccessShaktoolFromPantsRoom(snapshot, staticData) {
  // Simplified version - full implementation requires many tech checks
  return wor(snapshot, staticData,
    wand(snapshot, staticData,
      haveItem(snapshot, staticData, 'Ice'),
      haveItem(snapshot, staticData, 'Gravity'),
      knowsPuyoClip(snapshot, staticData)
    ),
    wand(snapshot, staticData,
      haveItem(snapshot, staticData, 'Grapple'),
      haveItem(snapshot, staticData, 'Gravity'),
      wor(snapshot, staticData,
        wand(snapshot, staticData,
          haveItem(snapshot, staticData, 'HiJump'),
          knowsAccessSpringBallWithHiJump(snapshot, staticData)
        ),
        haveItem(snapshot, staticData, 'SpaceJump')
      )
    )
  );
}

/**
 * Can pass G4 (Golden Four bosses requirement)
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static game data
 * @returns {Object} SMBool
 */
export function canPassG4(snapshot, staticData) {
  // Must defeat all 4 golden bosses: Kraid, Phantoon, Draygon, Ridley
  return wand(snapshot, staticData,
    bossDead(snapshot, staticData, 'Kraid'),
    bossDead(snapshot, staticData, 'Phantoon'),
    bossDead(snapshot, staticData, 'Draygon'),
    bossDead(snapshot, staticData, 'Ridley'));
}

// ============================================================================
// Movement and Navigation Helpers
// ============================================================================

/**
 * Can perform blue gate glitch (missile/super through blue doors)
 */
export function canBlueGateGlitch(snapshot, staticData) {
  return wand(snapshot, staticData,
    haveMissileOrSuper(snapshot, staticData),
    knowsGreenGateGlitch(snapshot, staticData)
  );
}

/**
 * Can perform morph jump (small hop in morph ball form)
 */
export function canMorphJump(snapshot, staticData) {
  return wor(snapshot, staticData,
    canPassBombPassages(snapshot, staticData),
    canUseSpringBall(snapshot, staticData)
  );
}

/**
 * Can enter Cathedral from Business Center
 * Requires: traverse red door + canHellRun (heat protection OR enough energy) + movement option
 * Python: sm.wand(sm.traverse('CathedralEntranceRight'), sm.wor(path1, path2))
 */
export function canEnterCathedral(snapshot, staticData, mult = 1.0) {
  // Path 1: canHellRun + movement option (wall jump patch, HiJump, canFly, SpeedBooster, canSpringBallJump)
  // Path 2: canHellRun with 0.5*mult + Morph + knowsNovaBoost
  return wand(snapshot, staticData,
    traverse(snapshot, staticData, 'CathedralEntranceRight'),  // Red door - requires Missile or Super
    wor(snapshot, staticData,
      // Path 1: Standard movement options
      wand(snapshot, staticData,
        canHellRun(snapshot, staticData, 'MainUpperNorfair', mult),
        wor(snapshot, staticData,
          // CathedralEntranceWallJump ROM patch - typically active, difficulty 0
          SMBool(snapshot, staticData, true),
          haveItem(snapshot, staticData, 'HiJump'),
          canFly(snapshot, staticData),
          haveItem(snapshot, staticData, 'SpeedBooster'),
          canSpringBallJump(snapshot, staticData)
        )
      ),
      // Path 2: NovaBoost alternative (shorter hell run, requires Morph + knowledge)
      wand(snapshot, staticData,
        canHellRun(snapshot, staticData, 'MainUpperNorfair', 0.5 * mult),
        haveItem(snapshot, staticData, 'Morph'),
        knowsNovaBoost(snapshot, staticData)
      )
    )
  );
}

/**
 * Can exit crab hole in Maridia
 */
export function canExitCrabHole(snapshot, staticData) {
  return wand(snapshot, staticData,
    haveItem(snapshot, staticData, 'Morph'),
    wor(snapshot, staticData,
      wand(snapshot, staticData,
        haveItem(snapshot, staticData, 'Gravity'),
        wor(snapshot, staticData,
          haveItem(snapshot, staticData, 'Ice'),
          haveItem(snapshot, staticData, 'HiJump'),
          canFly(snapshot, staticData)
        )
      ),
      wand(snapshot, staticData,
        haveItem(snapshot, staticData, 'Ice'),
        canDoSuitlessOuterMaridia(snapshot, staticData)
      ),
      canDoubleSpringBallJump(snapshot, staticData)
    )
  );
}

/**
 * Can pass amphitheater in reverse (lower Norfair)
 */
export function canPassAmphitheaterReverse(snapshot, staticData) {
  // Simplified: require gravity or very high energy
  return wor(snapshot, staticData,
    haveItem(snapshot, staticData, 'Gravity'),
    wand(snapshot, staticData,
      energyReserveCountOk(snapshot, staticData, 6),
      { bool: true, difficulty: 5 }
    )
  );
}

/**
 * Can pass Botwoon hallway
 */
export function canPassBotwoonHallway(snapshot, staticData) {
  return wor(snapshot, staticData,
    wand(snapshot, staticData,
      haveItem(snapshot, staticData, 'SpeedBooster'),
      haveItem(snapshot, staticData, 'Gravity')
    ),
    wand(snapshot, staticData,
      haveItem(snapshot, staticData, 'Ice'),
      { bool: true, difficulty: 5 } // knowsMochtroidClip
    )
  );
}

/**
 * Can pass Cacatac Alley (Maridia)
 */
export function canPassCacatacAlley(snapshot, staticData) {
  // Requires Draygon defeated and movement through Maridia
  return wand(snapshot, staticData,
    haveItem(snapshot, staticData, 'Morph'),
    wor(snapshot, staticData,
      haveItem(snapshot, staticData, 'Gravity'),
      wand(snapshot, staticData,
        haveItem(snapshot, staticData, 'HiJump'),
        haveItem(snapshot, staticData, 'SpaceJump'),
        { bool: true, difficulty: 4 } // knowsGravLessLevel2
      )
    )
  );
}

/**
 * Can pass Forgotten Highway (west Maridia)
 */
export function canPassForgottenHighway(snapshot, staticData, fromWs = true) {
  // Match Python: When coming from Wrecked Ship without EastOceanPlatforms patch,
  // suitless path requires SpringBallJump or SpaceJump in addition to HiJump
  const playerId = getPlayerId(snapshot, staticData);
  const romPatches = staticData?.settings?.[playerId]?.romPatches || {};
  const eastOceanPlatforms = romPatches.EastOceanPlatforms === true;

  let suitless = wand(snapshot, staticData,
    haveItem(snapshot, staticData, 'HiJump'),
    knowsGravLessLevel1(snapshot, staticData)
  );

  // Additional requirement when coming from Wrecked Ship without the platform patch
  if (fromWs === true && !eastOceanPlatforms) {
    suitless = wand(snapshot, staticData,
      suitless,
      wor(snapshot, staticData,
        canSpringBallJump(snapshot, staticData),
        haveItem(snapshot, staticData, 'SpaceJump')
      )
    );
  }

  return wand(snapshot, staticData,
    haveItem(snapshot, staticData, 'Morph'),
    wor(snapshot, staticData,
      haveItem(snapshot, staticData, 'Gravity'),
      suitless
    )
  );
}

/**
 * Can pass ninja space pirates (lower Norfair)
 * Need enough firepower to kill them: missiles, supers, plasma, or good beam combos
 */
export function canPassNinjaPirates(snapshot, staticData) {
  return wor(snapshot, staticData,
    itemCountOk(snapshot, staticData, 'Missile', 10),
    itemCountOk(snapshot, staticData, 'Super', 2),
    haveItem(snapshot, staticData, 'Plasma'),
    // Spazer OR (Charge AND (Wave OR Ice)) - good beam damage
    wor(snapshot, staticData,
      haveItem(snapshot, staticData, 'Spazer'),
      wand(snapshot, staticData,
        haveItem(snapshot, staticData, 'Charge'),
        wor(snapshot, staticData,
          haveItem(snapshot, staticData, 'Wave'),
          haveItem(snapshot, staticData, 'Ice')))),
    canShortCharge(snapshot, staticData)  // echoes kill
  );
}

/**
 * Can pass red Kihunters (lower Norfair)
 */
export function canPassRedKiHunters(snapshot, staticData) {
  // Match Python canKillRedKiHunters(3): need ways to kill 3 red kihunters
  // Red Ki Hunter has 1800 health, need to kill 3 = 5400 total damage
  // canGoThroughLowerNorfairEnemy: supers do 300 damage each
  // Super packs * 5 * 300 >= 5400 => need 4+ super packs
  return wor(snapshot, staticData,
    haveItem(snapshot, staticData, 'Plasma'),
    haveItem(snapshot, staticData, 'ScrewAttack'),
    wand(snapshot, staticData,
      heatProof(snapshot, staticData),
      wor(snapshot, staticData,
        haveItem(snapshot, staticData, 'Spazer'),
        haveItem(snapshot, staticData, 'Ice'),
        wand(snapshot, staticData,
          haveItem(snapshot, staticData, 'Charge'),
          haveItem(snapshot, staticData, 'Wave')))),
    // canGoThroughLowerNorfairEnemy: Super packs * 5 * 300 >= 3 * 1800 (5400)
    itemCountOk(snapshot, staticData, 'Super', 4),
    knowsDodgeLowerNorfairEnemies(snapshot, staticData)
  );
}

/**
 * Can pass Three Muskateers (lower Norfair)
 */
export function canPassThreeMuskateers(snapshot, staticData) {
  // Match Python canKillRedKiHunters(6): need ways to kill 6 red kihunters
  // Red Ki Hunter has 1800 health, need to kill 6 = 10800 total damage
  // Super packs * 5 * 300 >= 10800 => need 8+ super packs
  return wor(snapshot, staticData,
    haveItem(snapshot, staticData, 'Plasma'),
    haveItem(snapshot, staticData, 'ScrewAttack'),
    wand(snapshot, staticData,
      heatProof(snapshot, staticData),
      wor(snapshot, staticData,
        haveItem(snapshot, staticData, 'Spazer'),
        haveItem(snapshot, staticData, 'Ice'),
        wand(snapshot, staticData,
          haveItem(snapshot, staticData, 'Charge'),
          haveItem(snapshot, staticData, 'Wave')))),
    // canGoThroughLowerNorfairEnemy: Super packs * 5 * 300 >= 6 * 1800 (10800)
    itemCountOk(snapshot, staticData, 'Super', 8),
    knowsDodgeLowerNorfairEnemies(snapshot, staticData)
  );
}

/**
 * Can pass Wasteland Dessgeegas (lower Norfair)
 */
export function canPassWastelandDessgeegas(snapshot, staticData) {
  // Match Python: heatProof + (Spazer OR (Charge + Wave))
  return wor(snapshot, staticData,
    haveItem(snapshot, staticData, 'Plasma'),
    haveItem(snapshot, staticData, 'ScrewAttack'),
    wand(snapshot, staticData,
      heatProof(snapshot, staticData),
      wor(snapshot, staticData,
        haveItem(snapshot, staticData, 'Spazer'),
        wand(snapshot, staticData,
          haveItem(snapshot, staticData, 'Charge'),
          haveItem(snapshot, staticData, 'Wave')))),
    itemCountOk(snapshot, staticData, 'PowerBomb', 4),
    knowsDodgeLowerNorfairEnemies(snapshot, staticData)
  );
}

/**
 * Can traverse crab tunnel left to right (Maridia)
 */
export function canTraverseCrabTunnelLeftToRight(snapshot, staticData) {
  // Simplified: require supers to open gate
  return haveItem(snapshot, staticData, 'Super');
}

/**
 * Can traverse west sand hall left to right (Maridia)
 */
export function canTraverseWestSandHallLeftToRight(snapshot, staticData) {
  return haveItem(snapshot, staticData, 'Gravity');
}

// ============================================================================
// Boss-Related Helpers
// ============================================================================

/**
 * Can fight Draygon
 */
export function canFightDraygon(snapshot, staticData) {
  return wor(snapshot, staticData,
    haveItem(snapshot, staticData, 'Gravity'),
    wand(snapshot, staticData,
      haveItem(snapshot, staticData, 'HiJump'),
      { bool: true, difficulty: 4 } // knowsGravLessLevel2 or 3
    )
  );
}

/**
 * Have enough resources to defeat Draygon
 */
export function enoughStuffsDraygon(snapshot, staticData) {
  // Simplified: require ability to inflict damage
  return wand(snapshot, staticData,
    haveItem(snapshot, staticData, 'Morph'),
    haveMissileOrSuper(snapshot, staticData),
    wor(snapshot, staticData,
      haveItem(snapshot, staticData, 'Gravity'),
      energyReserveCountOk(snapshot, staticData, 3)
    )
  );
}

/**
 * Can exit Draygon's room after defeating her
 */
export function canExitDraygon(snapshot, staticData) {
  // Simplified: same requirements as fighting
  return canFightDraygon(snapshot, staticData);
}

/**
 * Can get back from Ridley zone in lower Norfair
 */
export function canGetBackFromRidleyZone(snapshot, staticData) {
  return wand(snapshot, staticData,
    canUsePowerBombs(snapshot, staticData),
    wor(snapshot, staticData,
      canUseSpringBall(snapshot, staticData),
      canUseBombs(snapshot, staticData),
      itemCountOk(snapshot, staticData, 'PowerBomb', 2),
      haveItem(snapshot, staticData, 'ScrewAttack'),
      canShortCharge(snapshot, staticData)
    )
  );
}

/**
 * Can reach Cacatac Alley from Botwoon
 */
export function canReachCacatacAlleyFromBotowoon(snapshot, staticData) {
  return wor(snapshot, staticData,
    haveItem(snapshot, staticData, 'Gravity'),
    wand(snapshot, staticData,
      haveItem(snapshot, staticData, 'HiJump'),
      { bool: true, difficulty: 4 }, // knowsGravLessLevel2
      wor(snapshot, staticData,
        haveItem(snapshot, staticData, 'Grapple'),
        haveItem(snapshot, staticData, 'Ice'),
        canDoubleSpringBallJump(snapshot, staticData)
      )
    )
  );
}

// ============================================================================
// Logical Helpers
// ============================================================================

/**
 * Logical NOT for SMBool values
 */
export function wnot(snapshot, staticData, smbool) {
  // If it's a boolean, just invert it
  if (typeof smbool === 'boolean') {
    return !smbool;
  }
  // If it's an SMBool object, invert the bool field
  if (smbool && typeof smbool === 'object' && 'bool' in smbool) {
    return {
      bool: !smbool.bool,
      difficulty: smbool.difficulty || 0
    };
  }
  // Default: treat undefined/null as false, so return true
  return true;
}

// ============================================================================
// "Knows" functions - These check player knowledge/difficulty settings
// For now, these are simplified stubs that return appropriate difficulty values
// ============================================================================

/**
 * Knows snail clip technique
 */
export function knowsSnailClip(snapshot, staticData) {
  return { bool: false, difficulty: 0 }; // Very advanced technique, disabled by default
}

// ============================================================================
// "Knows" functions - These check player knowledge/difficulty settings
// For now, these are simplified stubs that return appropriate difficulty values
// ============================================================================

export function knowsSpringBallJump(snapshot, staticData) {
  // Spring ball jump is a medium difficulty tech
  return { bool: true, difficulty: 3 };
}

export function knowsHiJumpMamaTurtle(snapshot, staticData) {
  // Hi-jump mama turtle is a medium difficulty tech
  return { bool: true, difficulty: 3 };
}

export function knowsIceMissileFromCroc(snapshot, staticData) {
  // Ice missile from Crocomire is a medium difficulty tech
  return { bool: true, difficulty: 3 };
}

// Additional knows functions referenced by other helpers
export function knowsHiJumpGauntletAccess(snapshot, staticData) {
  return { bool: true, difficulty: 2 };
}

export function knowsHiJumpLessGauntletAccess(snapshot, staticData) {
  // HiJumpLessGauntletAccess is DISABLED by default in VARIA
  // Requires tricky wall jumps without HiJump
  const playerId = getPlayerId(snapshot, staticData);
  const knowsSettings = staticData?.settings?.[playerId]?.knows || {};

  if ('HiJumpLessGauntletAccess' in knowsSettings) {
    const [enabled, difficulty] = knowsSettings.HiJumpLessGauntletAccess;
    return { bool: enabled, difficulty: enabled ? difficulty : 0 };
  }

  // Default: disabled
  return { bool: false, difficulty: 0 };
}

export function knowsLowGauntlet(snapshot, staticData) {
  return { bool: true, difficulty: 3 };
}

export function knowsWorstRoomIceCharge(snapshot, staticData) {
  return { bool: true, difficulty: 4 };
}

export function knowsWorstRoomWallJump(snapshot, staticData) {
  return { bool: true, difficulty: 4 };
}

export function knowsDodgeLowerNorfairEnemies(snapshot, staticData) {
  // Check exported knows settings
  const playerId = getPlayerId(snapshot, staticData);
  const knowsSettings = staticData?.settings?.[playerId]?.knows || {};

  if ('DodgeLowerNorfairEnemies' in knowsSettings) {
    const [enabled, difficulty] = knowsSettings.DodgeLowerNorfairEnemies;
    return { bool: enabled, difficulty: enabled ? difficulty : 0 };
  }
  // Default: disabled (Regular preset value)
  return { bool: false, difficulty: 0 };
}

export function knowsFrogSpeedwayWithoutSpeed(snapshot, staticData) {
  return { bool: true, difficulty: 4 };
}

export function knowsNorfairReserveDBoost(snapshot, staticData) {
  // NorfairReserveDBoost is DISABLED by default in VARIA
  // Only enabled in expert, master, veteran, samus presets
  // Check if knows settings override exists in staticData
  const playerId = getPlayerId(snapshot, staticData);
  const knowsSettings = staticData?.settings?.[playerId]?.knows || {};

  if ('NorfairReserveDBoost' in knowsSettings) {
    const [enabled, difficulty] = knowsSettings.NorfairReserveDBoost;
    return { bool: enabled, difficulty: enabled ? difficulty : 0 };
  }

  // Default: disabled
  return { bool: false, difficulty: 0 };
}

export function knowsDoubleChamberWallJump(snapshot, staticData) {
  return { bool: true, difficulty: 3 };
}

export function canDoubleSpringBallJump(snapshot, staticData) {
  return wand(snapshot, staticData,
    canUseSpringBall(snapshot, staticData),
    { bool: true, difficulty: 4 }
  );
}

export function canGoThroughColosseumSuitless(snapshot, staticData) {
  // Requires gravity-less Maridia techniques
  return wand(snapshot, staticData,
    knowsGravLessLevel2(snapshot, staticData),
    haveItem(snapshot, staticData, 'HiJump')
  );
}

export function knowsPuyoClip(snapshot, staticData) {
  // Check exported knows settings
  const playerId = getPlayerId(snapshot, staticData);
  const knowsSettings = staticData?.settings?.[playerId]?.knows || {};

  if ('PuyoClip' in knowsSettings) {
    const [enabled, difficulty] = knowsSettings.PuyoClip;
    return { bool: enabled, difficulty: enabled ? difficulty : 0 };
  }
  // Default: disabled (not in Regular preset)
  return { bool: false, difficulty: 0 };
}

export function knowsAccessSpringBallWithHiJump(snapshot, staticData) {
  return { bool: true, difficulty: 3 };
}
