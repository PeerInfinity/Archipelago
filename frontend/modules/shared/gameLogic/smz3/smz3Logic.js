/**
 * @module gameLogic/smz3/smz3Logic
 * @description Thread-agnostic SMZ3 game logic functions
 *
 * SMZ3 (Super Metroid & A Link to the Past Crossover) combines logic from both games.
 * The game uses the TotalSMZ3 library with custom Region.CanEnter() implementations.
 *
 * These pure functions operate on a canonical state snapshot and return results
 * without modifying the state. All helper functions follow the standardized signature:
 *
 * `(snapshot, staticData, ...args) => boolean | number | any`
 *
 * **DATA FLOW:**
 *
 * Input: Canonical state snapshot + static game data
 * - snapshot: { inventory, flags, events, player, regionReachability, evaluateRule }
 * - staticData: { settings, progressionMapping, regions, locations, items }
 *
 * Processing: Pure functional logic evaluation
 * - No state mutation
 * - Thread-safe execution
 * - Deterministic results
 *
 * Output: Boolean, number, or structured data based on function purpose
 */

// Import ALTTP helper functions for progressive item handling
import { has as alttpHas, count as alttpCount } from '../alttp/alttpLogic.js';

/**
 * Helper function to check if player has an item.
 * Uses ALTTP's has() function which handles progressive items via progressionMapping.
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static data with progressionMapping
 * @param {string} itemName - Name of the item
 * @returns {boolean} True if player has the item
 */
function hasItem(snapshot, staticData, itemName) {
  return alttpHas(snapshot, staticData, itemName);
}

/**
 * Helper function to get item count.
 * Uses ALTTP's count() function which handles progressive items via progressionMapping.
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static data with progressionMapping
 * @param {string} itemName - Name of the item
 * @returns {number} Count of the item
 */
function getItemCount(snapshot, staticData, itemName) {
  return alttpCount(snapshot, staticData, itemName);
}

// Export generic has/count functions for use by snapshot interface
export { hasItem as has, getItemCount as count };

// ====================
// ALTTP Helper Functions
// ====================

/**
 * Check if player can lift light objects (requires Power Glove).
 * Python: def CanLiftLight(self): return self.Glove
 * Note: Uses ProgressiveGlove >= 1
 */
export function smz3_CanLiftLight(snapshot, staticData) {
  return hasItem(snapshot, staticData, 'ProgressiveGlove');
}

/**
 * Check if player can lift heavy objects (requires Titans Mitts).
 * Python: def CanLiftHeavy(self): return self.Mitt
 * Note: Uses ProgressiveGlove >= 2
 */
export function smz3_CanLiftHeavy(snapshot, staticData) {
  return getItemCount(snapshot, staticData, 'ProgressiveGlove') >= 2;
}

/**
 * Check if player can light torches (Lamp or Fire Rod).
 * Python: def CanLightTorches(self): return self.Firerod or self.Lamp
 */
export function smz3_CanLightTorches(snapshot, staticData) {
  return hasItem(snapshot, staticData, 'Firerod') || hasItem(snapshot, staticData, 'Lamp');
}

/**
 * Check if player can melt Freezors (Fire Rod or Bombos + Sword).
 * Python: def CanMeltFreezors(self): return self.Firerod or self.Bombos and self.Sword
 */
export function smz3_CanMeltFreezors(snapshot, staticData) {
  return hasItem(snapshot, staticData, 'Firerod') ||
         (hasItem(snapshot, staticData, 'Bombos') && hasItem(snapshot, staticData, 'ProgressiveSword'));
}

/**
 * Check if player can extend magic (Half Magic and/or Bottle).
 * Python: def CanExtendMagic(self, bars:int = 2): return (2 if self.HalfMagic else 1) * (2 if self.Bottle else 1) >= bars
 *
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static data
 * @param {number} bars - Number of bars required (default 2)
 */
export function smz3_CanExtendMagic(snapshot, staticData, bars = 2) {
  const halfMagicMultiplier = hasItem(snapshot, staticData, 'HalfMagic') ? 2 : 1;
  const bottleMultiplier = hasItem(snapshot, staticData, 'Bottle') ? 2 : 1;
  return halfMagicMultiplier * bottleMultiplier >= bars;
}

/**
 * Check if player can kill many enemies (various weapons).
 * Python: def CanKillManyEnemies(self):
 *     return self.Sword or self.Hammer or self.Bow or self.Firerod or \
 *            self.Somaria or self.Byrna and self.CanExtendMagic()
 */
export function smz3_CanKillManyEnemies(snapshot, staticData) {
  return hasItem(snapshot, staticData, 'ProgressiveSword') ||
         hasItem(snapshot, staticData, 'Hammer') ||
         hasItem(snapshot, staticData, 'Bow') ||
         hasItem(snapshot, staticData, 'Firerod') ||
         hasItem(snapshot, staticData, 'Somaria') ||
         (hasItem(snapshot, staticData, 'Byrna') && smz3_CanExtendMagic(snapshot, staticData, 2));
}

/**
 * Check if player can beat dungeon bosses (has appropriate weapons).
 * This is a generic helper that covers requirements for all dungeon bosses.
 * Most bosses can be beaten with: Sword, Hammer, Bow, Firerod, Icerod, Byrna, or Somaria
 * Python (from DesertPalace): def CanBeatBoss(self, items: Progression):
 *     return items.Sword or items.Hammer or items.Bow or \
 *            items.Firerod or items.Icerod or \
 *            items.Byrna or items.Somaria
 */
export function smz3_CanBeatBoss(snapshot, staticData) {
  return hasItem(snapshot, staticData, 'ProgressiveSword') ||
         hasItem(snapshot, staticData, 'Hammer') ||
         hasItem(snapshot, staticData, 'Bow') ||
         hasItem(snapshot, staticData, 'Firerod') ||
         hasItem(snapshot, staticData, 'Icerod') ||
         hasItem(snapshot, staticData, 'Byrna') ||
         hasItem(snapshot, staticData, 'Somaria');
}

/**
 * Check if player can beat Armos Knights (Eastern Palace boss).
 * Python (from EasternPalace): def CanBeatBoss(self, items: Progression):
 *     return items.Sword or items.Hammer or items.Bow or \
 *            items.Firerod or items.Icerod or \
 *            items.Byrna or items.Somaria
 * Same as generic CanBeatBoss.
 */
export function smz3_CanBeatArmos(snapshot, staticData) {
  return smz3_CanBeatBoss(snapshot, staticData);
}

/**
 * Check if player can beat Moldorm (Tower of Hera boss).
 * Python (from TowerOfHera): def CanBeatBoss(self, items: Progression):
 *     return items.Sword or items.Hammer
 * Requires either Sword or Hammer (more restrictive than generic).
 */
export function smz3_CanBeatMoldorm(snapshot, staticData) {
  return hasItem(snapshot, staticData, 'ProgressiveSword') ||
         hasItem(snapshot, staticData, 'Hammer');
}

// ====================
// Ganon's Tower Navigation Helpers
// ====================

/**
 * Check if player can access the left side of Ganon's Tower.
 * Python (from GanonsTower):
 * def LeftSide(self, items: Progression, locations: List[Location]):
 *     return items.Hammer and items.Hookshot and items.KeyGT >= (3 if any(l.ItemIs(ItemType.BigKeyGT, self.world) for l in locations) else 4)
 *
 * Requires:
 * - Hammer AND Hookshot
 * - 3 KeyGT if any location in the list contains BigKeyGT, otherwise 4 KeyGT
 *
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static data
 * @param {Array} locations - List of location objects to check
 */
export function smz3_LeftSide(snapshot, staticData, locations) {
  const hasHammer = hasItem(snapshot, staticData, 'Hammer');
  const hasHookshot = hasItem(snapshot, staticData, 'Hookshot');

  if (!hasHammer || !hasHookshot) {
    return false;
  }

  // Check if any location in the list contains BigKeyGT
  let anyContainsBigKeyGT = false;
  if (locations && Array.isArray(locations)) {
    for (const loc of locations) {
      if (loc && loc.ItemIs && loc.ItemIs('BigKeyGT')) {
        anyContainsBigKeyGT = true;
        break;
      }
    }
  }

  const requiredKeys = anyContainsBigKeyGT ? 3 : 4;
  const keyCount = getItemCount(snapshot, staticData, 'KeyGT');

  return keyCount >= requiredKeys;
}

/**
 * Check if player can access the right side of Ganon's Tower.
 * Python (from GanonsTower):
 * def RightSide(self, items: Progression, locations: List[Location]):
 *     return items.Somaria and items.Firerod and items.KeyGT >= (3 if any(l.ItemIs(ItemType.BigKeyGT, self.world) for l in locations) else 4)
 *
 * Requires:
 * - Somaria AND Firerod
 * - 3 KeyGT if any location in the list contains BigKeyGT, otherwise 4 KeyGT
 *
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static data
 * @param {Array} locations - List of location objects to check
 */
export function smz3_RightSide(snapshot, staticData, locations) {
  const hasSomaria = hasItem(snapshot, staticData, 'Somaria');
  const hasFirerod = hasItem(snapshot, staticData, 'Firerod');

  if (!hasSomaria || !hasFirerod) {
    return false;
  }

  // Check if any location in the list contains BigKeyGT
  let anyContainsBigKeyGT = false;
  if (locations && Array.isArray(locations)) {
    for (const loc of locations) {
      if (loc && loc.ItemIs && loc.ItemIs('BigKeyGT')) {
        anyContainsBigKeyGT = true;
        break;
      }
    }
  }

  const requiredKeys = anyContainsBigKeyGT ? 3 : 4;
  const keyCount = getItemCount(snapshot, staticData, 'KeyGT');

  return keyCount >= requiredKeys;
}

// ====================
// Super Metroid Helper Functions
// ====================

/**
 * Check if player can infinite bomb jump (Morph Ball + Bombs).
 * Python: def CanIbj(self): return self.Morph and self.Bombs
 */
export function smz3_CanIbj(snapshot, staticData) {
  return hasItem(snapshot, staticData, 'Morph') && hasItem(snapshot, staticData, 'Bombs');
}

/**
 * Check if player can fly (Space Jump or IBJ).
 * Python: def CanFly(self): return self.SpaceJump or self.CanIbj()
 */
export function smz3_CanFly(snapshot, staticData) {
  return hasItem(snapshot, staticData, 'SpaceJump') || smz3_CanIbj(snapshot, staticData);
}

/**
 * Check if player can use Power Bombs (Morph Ball + Power Bomb).
 * Python: def CanUsePowerBombs(self): return self.Morph and self.PowerBomb
 */
export function smz3_CanUsePowerBombs(snapshot, staticData) {
  return hasItem(snapshot, staticData, 'Morph') && hasItem(snapshot, staticData, 'PowerBomb');
}

/**
 * Check if player can pass bomb passages (Morph Ball + (Bombs or Power Bomb)).
 * Python: def CanPassBombPassages(self): return self.Morph and (self.Bombs or self.PowerBomb)
 */
export function smz3_CanPassBombPassages(snapshot, staticData) {
  return hasItem(snapshot, staticData, 'Morph') &&
         (hasItem(snapshot, staticData, 'Bombs') || hasItem(snapshot, staticData, 'PowerBomb'));
}

/**
 * Check if player can destroy bomb walls (CanPassBombPassages or Screw Attack).
 * Python: def CanDestroyBombWalls(self): return self.CanPassBombPassages() or self.ScrewAttack
 */
export function smz3_CanDestroyBombWalls(snapshot, staticData) {
  return smz3_CanPassBombPassages(snapshot, staticData) || hasItem(snapshot, staticData, 'ScrewAttack');
}

/**
 * Check if player can spring ball jump (Morph Ball + Spring Ball).
 * Python: def CanSpringBallJump(self): return self.Morph and self.SpringBall
 */
export function smz3_CanSpringBallJump(snapshot, staticData) {
  return hasItem(snapshot, staticData, 'Morph') && hasItem(snapshot, staticData, 'SpringBall');
}

/**
 * Check if player can survive heat (Varia Suit or 5+ Energy Reserves).
 * Python: def CanHellRun(self): return self.Varia or self.HasEnergyReserves(5)
 */
export function smz3_CanHellRun(snapshot, staticData) {
  return hasItem(snapshot, staticData, 'Varia') || smz3_HasEnergyReserves(snapshot, staticData, 5);
}

/**
 * Check if player has sufficient energy reserves (E-Tanks + Reserve Tanks).
 * Python: def HasEnergyReserves(self, amount: int): return (self.ETank + self.ReserveTank) >= amount
 *
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static data
 * @param {number} amount - Required number of tanks
 */
export function smz3_HasEnergyReserves(snapshot, staticData, amount) {
  const eTanks = getItemCount(snapshot, staticData, 'ETank');
  const reserveTanks = getItemCount(snapshot, staticData, 'ReserveTank');
  return (eTanks + reserveTanks) >= amount;
}

/**
 * Check if player can open red doors (Missile or Super Missile).
 * Python: def CanOpenRedDoors(self): return self.Missile or self.Super
 */
export function smz3_CanOpenRedDoors(snapshot, staticData) {
  return hasItem(snapshot, staticData, 'Missile') || hasItem(snapshot, staticData, 'Super');
}

/**
 * Check if player can access Crocomire area.
 * Python: def CanAccessCrocomire(self): return self.CardNorfairBoss if self.Config.Keysanity else self.Super
 *
 * Note: For non-keysanity mode (default), just requires Super Missile.
 * For keysanity mode, would require CardNorfairBoss instead.
 */
export function smz3_CanAccessCrocomire(snapshot, staticData) {
  // TODO: Check keysanity setting from staticData.settings if needed
  // For now, assuming non-keysanity mode (standard SMZ3)
  return hasItem(snapshot, staticData, 'Super');
}

/**
 * Check if player can unlock Wrecked Ship.
 * Python: def CanUnlockShip(self): return self.CardWreckedShipBoss and self.CanPassBombPassages()
 */
export function smz3_CanUnlockShip(snapshot, staticData) {
  return hasItem(snapshot, staticData, 'CardWreckedShipBoss') && smz3_CanPassBombPassages(snapshot, staticData);
}

/**
 * Check if player can enter and leave the Gauntlet area.
 * Python (Normal): items.CardCrateriaL1 and items.Morph and (items.CanFly() or items.SpeedBooster) and
 *                  (items.CanIbj() or items.CanUsePowerBombs() and items.TwoPowerBombs or items.ScrewAttack)
 * Python (Hard): items.CardCrateriaL1 and (items.Morph and (items.Bombs or items.TwoPowerBombs) or
 *                items.ScrewAttack or items.SpeedBooster and items.CanUsePowerBombs() and items.HasEnergyReserves(2))
 *
 * Note: TwoPowerBombs means having at least 2 Power Bombs
 * Using Normal logic for now.
 */
export function smz3_CanEnterAndLeaveGauntlet(snapshot, staticData) {
  // Normal logic implementation
  const hasCardCrateriaL1 = hasItem(snapshot, staticData, 'CardCrateriaL1');
  const hasMorph = hasItem(snapshot, staticData, 'Morph');
  const canFlyOrSpeed = smz3_CanFly(snapshot, staticData) || hasItem(snapshot, staticData, 'SpeedBooster');

  // Check if player has at least 2 Power Bombs
  const hasTwoPowerBombs = getItemCount(snapshot, staticData, 'PowerBomb') >= 2;

  const canEscape = smz3_CanIbj(snapshot, staticData) ||
                    (smz3_CanUsePowerBombs(snapshot, staticData) && hasTwoPowerBombs) ||
                    hasItem(snapshot, staticData, 'ScrewAttack');

  return hasCardCrateriaL1 && hasMorph && canFlyOrSpeed && canEscape;
}

// ====================
// Portal Access Functions
// ====================

/**
 * Check if player can access Death Mountain portal.
 * Python: def CanAccessDeathMountainPortal(self):
 *     return (self.CanDestroyBombWalls() or self.SpeedBooster) and self.Super and self.Morph
 */
export function smz3_CanAccessDeathMountainPortal(snapshot, staticData) {
  return (smz3_CanDestroyBombWalls(snapshot, staticData) || hasItem(snapshot, staticData, 'SpeedBooster')) &&
         hasItem(snapshot, staticData, 'Super') &&
         hasItem(snapshot, staticData, 'Morph');
}

/**
 * Check if player can access Dark World portal.
 * Python: def CanAccessDarkWorldPortal(self, config: Config):
 *     if (config.SMLogic == SMLogic.Normal):
 *         return self.CardMaridiaL1 and self.CardMaridiaL2 and self.CanUsePowerBombs() and self.Super and self.Gravity and self.SpeedBooster
 *     else:
 *         return self.CardMaridiaL1 and self.CardMaridiaL2 and self.CanUsePowerBombs() and self.Super and \
 *             (self.Charge or self.Super and self.Missile) and \
 *             (self.Gravity or self.HiJump and self.Ice and self.Grapple) and \
 *             (self.Ice or self.Gravity and self.SpeedBooster)
 *
 * Note: Using simplified logic for now (Normal mode requirements)
 */
export function smz3_CanAccessDarkWorldPortal(snapshot, staticData) {
  // Simplified implementation (Normal logic)
  return hasItem(snapshot, staticData, 'CardMaridiaL1') &&
         hasItem(snapshot, staticData, 'CardMaridiaL2') &&
         smz3_CanUsePowerBombs(snapshot, staticData) &&
         hasItem(snapshot, staticData, 'Super') &&
         hasItem(snapshot, staticData, 'Gravity') &&
         hasItem(snapshot, staticData, 'SpeedBooster');
}

/**
 * Check if player can access Misery Mire portal.
 * Python: def CanAccessMiseryMirePortal(self, config: Config):
 *     if (config.SMLogic == SMLogic.Normal):
 *         return (self.CardNorfairL2 or (self.SpeedBooster and self.Wave)) and self.Varia and self.Super and self.Gravity and self.SpaceJump and self.CanUsePowerBombs()
 *     else:
 *         return (self.CardNorfairL2 or self.SpeedBooster) and self.Varia and self.Super and \
 *                (self.CanFly() or self.HiJump or self.SpeedBooster or self.CanSpringBallJump() or self.Ice) \
 *                and (self.Gravity or self.HiJump) and self.CanUsePowerBombs()
 *
 * Note: Using simplified logic for now (Normal mode requirements)
 */
export function smz3_CanAccessMiseryMirePortal(snapshot, staticData) {
  // Simplified implementation (Normal logic)
  const hasCardNorfairL2 = hasItem(snapshot, staticData, 'CardNorfairL2');
  const hasSpeedBooster = hasItem(snapshot, staticData, 'SpeedBooster');
  const hasWave = hasItem(snapshot, staticData, 'Wave');
  const hasVaria = hasItem(snapshot, staticData, 'Varia');
  const hasSuper = hasItem(snapshot, staticData, 'Super');
  const hasGravity = hasItem(snapshot, staticData, 'Gravity');
  const hasSpaceJump = hasItem(snapshot, staticData, 'SpaceJump');
  const canUsePowerBombs = smz3_CanUsePowerBombs(snapshot, staticData);

  const pathA = hasCardNorfairL2 || (hasSpeedBooster && hasWave);
  const result = pathA && hasVaria && hasSuper && hasGravity && hasSpaceJump && canUsePowerBombs;

  return result;
}

/**
 * Check if player can access Norfair Upper portal.
 * Python: def CanAccessNorfairUpperPortal(self):
 *     return self.Flute or self.CanLiftLight() and self.Lamp
 */
export function smz3_CanAccessNorfairUpperPortal(snapshot, staticData) {
  return hasItem(snapshot, staticData, 'Flute') ||
         (smz3_CanLiftLight(snapshot, staticData) && hasItem(snapshot, staticData, 'Lamp'));
}

/**
 * Check if player can access Norfair Lower portal.
 * Python: def CanAccessNorfairLowerPortal(self):
 *     return self.Flute and self.CanLiftHeavy()
 */
export function smz3_CanAccessNorfairLowerPortal(snapshot, staticData) {
  return hasItem(snapshot, staticData, 'Flute') && smz3_CanLiftHeavy(snapshot, staticData);
}

/**
 * Check if player can access Maridia portal.
 * Python: def CanAccessMaridiaPortal(self, world):
 *     from .Region import RewardType
 *     if (world.Config.SMLogic == SMLogic.Normal):
 *         return self.MoonPearl and self.Flippers and \
 *                self.Gravity and self.Morph and \
 *                (world.CanAcquire(self, RewardType.Agahnim) or self.Hammer and self.CanLiftLight() or self.CanLiftHeavy())
 *     else:
 *         return self.MoonPearl and self.Flippers and \
 *                (self.CanSpringBallJump() or self.HiJump or self.Gravity) and self.Morph and \
 *                (world.CanAcquire(self, RewardType.Agahnim) or self.Hammer and self.CanLiftLight() or self.CanLiftHeavy())
 *
 * Note: Using Normal mode requirements.
 */
export function smz3_CanAccessMaridiaPortal(snapshot, staticData) {
  // RewardType.Agahnim = 1 (Castle Tower reward type)
  const REWARD_AGAHNIM = 1;

  return hasItem(snapshot, staticData, 'MoonPearl') &&
         hasItem(snapshot, staticData, 'Flippers') &&
         hasItem(snapshot, staticData, 'Gravity') &&
         hasItem(snapshot, staticData, 'Morph') &&
         (smz3_CanAcquire(snapshot, staticData, REWARD_AGAHNIM) ||
          hasItem(snapshot, staticData, 'Hammer') && smz3_CanLiftLight(snapshot, staticData) ||
          smz3_CanLiftHeavy(snapshot, staticData));
}

/**
 * Check if player can use keys without wasting them before accessible locations.
 * Python: def CanNotWasteKeysBeforeAccessible(self, items: Progression, locations: List[Location]):
 *     return self.world.ForwardSearch or not items.BigKeyIP or any(l.ItemIs(ItemType.BigKeyIP, self.world) for l in locations)
 *
 * This function prevents wasting small keys on doors that don't lead to the big key
 * when the player already has the big key. Returns true if:
 * 1. ForwardSearch is True (always true in Archipelago's fill), OR
 * 2. Player does NOT have the dungeon's big key (so no risk of wasting), OR
 * 3. Any of the locations in the list contains the big key
 *
 * Since ForwardSearch is always true in Archipelago, this function always returns true.
 *
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static data
 * @param {Array} locations - List of location objects to check
 */
export function smz3_CanNotWasteKeysBeforeAccessible(snapshot, staticData, locations) {
  // ForwardSearch is always true in Archipelago's fill algorithm,
  // so this function always returns true.
  // This is intentional as the Archipelago fill guarantees the world is beatable.
  return true;
}

/**
 * Check if player can reach the Aqueduct area in Maridia.
 * Python (Normal): items.CardMaridiaL1 and (items.CanFly() or items.SpeedBooster or items.Grapple) \
 *                  or items.CardMaridiaL2 and items.CanAccessMaridiaPortal(self.world)
 * Python (Hard): items.CardMaridiaL1 and (items.Gravity or items.HiJump and (items.Ice or items.CanSpringBallJump()) and items.Grapple) \
 *                or items.CardMaridiaL2 and items.CanAccessMaridiaPortal(self.world)
 *
 * Using Normal logic for now.
 */
export function smz3_CanReachAqueduct(snapshot, staticData) {
  // Route 1: Through Maridia with L1 card and movement ability
  const route1 = hasItem(snapshot, staticData, 'CardMaridiaL1') &&
                 (smz3_CanFly(snapshot, staticData) ||
                  hasItem(snapshot, staticData, 'SpeedBooster') ||
                  hasItem(snapshot, staticData, 'Grapple'));

  // Route 2: Through Maridia portal with L2 card
  const route2 = hasItem(snapshot, staticData, 'CardMaridiaL2') &&
                 smz3_CanAccessMaridiaPortal(snapshot, staticData);

  return route1 || route2;
}

/**
 * Check if player can defeat Botwoon (mini-boss in Maridia).
 * Python (Normal): items.SpeedBooster or items.CanAccessMaridiaPortal(self.world)
 * Python (Hard): items.Ice or items.SpeedBooster and items.Gravity or items.CanAccessMaridiaPortal(self.world)
 *
 * Using Normal logic for now.
 */
export function smz3_CanDefeatBotwoon(snapshot, staticData) {
  return hasItem(snapshot, staticData, 'SpeedBooster') || smz3_CanAccessMaridiaPortal(snapshot, staticData);
}

/**
 * Check if player can defeat Draygon (boss in Maridia).
 * Python (Normal): (items.CardMaridiaL1 and items.CardMaridiaL2 and self.CanDefeatBotwoon(items) or
 *                   items.CanAccessMaridiaPortal(self.world)
 *                  ) and items.CardMaridiaBoss and items.Gravity and (items.SpeedBooster and items.HiJump or items.CanFly())
 * Python (Hard): (items.CardMaridiaL1 and items.CardMaridiaL2 and self.CanDefeatBotwoon(items) or
 *                 items.CanAccessMaridiaPortal(self.world)
 *                ) and items.CardMaridiaBoss and items.Gravity
 *
 * Using Normal logic for now.
 */
export function smz3_CanDefeatDraygon(snapshot, staticData) {
  // Can reach Draygon either through Maridia (defeating Botwoon) or via portal
  const canReachDraygon = (hasItem(snapshot, staticData, 'CardMaridiaL1') &&
                           hasItem(snapshot, staticData, 'CardMaridiaL2') &&
                           smz3_CanDefeatBotwoon(snapshot, staticData)) ||
                          smz3_CanAccessMaridiaPortal(snapshot, staticData);

  // Must have boss card, gravity, and movement capability
  const canDefeatDraygon = hasItem(snapshot, staticData, 'CardMaridiaBoss') &&
                           hasItem(snapshot, staticData, 'Gravity') &&
                           ((hasItem(snapshot, staticData, 'SpeedBooster') && hasItem(snapshot, staticData, 'HiJump')) ||
                            smz3_CanFly(snapshot, staticData));

  return canReachDraygon && canDefeatDraygon;
}

/**
 * Check if player can exit Norfair Lower East region.
 * This is specific to the Norfair Lower East region and determines if the player
 * can escape back to upper areas.
 *
 * Python (from TotalSMZ3/Regions/SuperMetroid/NorfairLower/East.py):
 * def CanExit(self, items:Progression):
 *     if self.Logic == SMLogic.Normal:
 *         # Bubble Mountain route
 *         return items.Morph and (items.CardNorfairL2 or (
 *             # Volcano Room and Blue Gate
 *             items.Gravity) and items.Wave and (
 *             # Spikey Acid Snakes and Croc Escape
 *             items.Grapple or items.SpaceJump))
 *     else:
 *         # Vanilla LN Escape (Hard mode has more options)
 *         return (items.Morph and (items.CardNorfairL2 or
 *                 (items.Missile or items.Super or items.Wave) and
 *                 (items.SpeedBooster or items.CanFly() or items.Grapple or items.HiJump and
 *                 (items.CanSpringBallJump() or items.Ice))) or
 *             # Reverse Amphitheater
 *             items.HasEnergyReserves(5))
 *
 * Note: Using Normal logic for now (simplified implementation)
 */
export function smz3_CanExit(snapshot, staticData) {
  // Normal mode logic for exiting Norfair Lower East
  const hasMorph = hasItem(snapshot, staticData, 'Morph');
  const hasCardNorfairL2 = hasItem(snapshot, staticData, 'CardNorfairL2');

  // Bubble Mountain route (simple exit with card)
  if (hasMorph && hasCardNorfairL2) {
    return true;
  }

  // Alternative route: Volcano Room and Blue Gate
  const hasGravity = hasItem(snapshot, staticData, 'Gravity');
  const hasWave = hasItem(snapshot, staticData, 'Wave');
  const hasGrapple = hasItem(snapshot, staticData, 'Grapple');
  const hasSpaceJump = hasItem(snapshot, staticData, 'SpaceJump');

  // Morph + Gravity + Wave + (Grapple OR SpaceJump)
  return hasMorph &&
         hasGravity &&
         hasWave &&
         (hasGrapple || hasSpaceJump);
}

// ====================
// Reward/Dungeon Completion Functions
// ====================

/**
 * Get a location object by name to check properties like what item is placed there.
 * Python: def GetLocation(location_name: str): return world.get_location(location_name)
 *
 * This returns an object with an ItemIs method that checks if a specific item type is placed at the location.
 *
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static data (contains locations)
 * @param {string} locationName - The name of the location to get
 * @returns {Object} An object with ItemIs method
 */
export function smz3_GetLocation(snapshot, staticData, locationName) {
  // Find the location in staticData
  let foundLocation = null;

  if (staticData.regions) {
    const regionsToSearch = staticData.regions instanceof Map ?
      Array.from(staticData.regions.values()) :
      Object.values(staticData.regions);

    for (const region of regionsToSearch) {
      if (region.locations) {
        foundLocation = region.locations.find(loc => loc.name === locationName);
        if (foundLocation) break;
      }
    }
  }

  // Return an object with ItemIs method
  return {
    ItemIs: (itemType, world) => {
      if (!foundLocation || !foundLocation.item) {
        return false;
      }
      // Check if the item at this location matches the requested type
      return foundLocation.item.name === itemType;
    }
  };
}

/**
 * Check if player can acquire a specific reward (pendant/crystal/boss token).
 * Python: def CanAcquire(self, items: Item.Progression, reward: Region.RewardType):
 *     return next(iter([region for region in self.Regions if isinstance(region, Region.IReward) and region.Reward == reward])).CanComplete(items)
 *
 * This function finds the dungeon/region that has the specified reward and checks if
 * that region can be completed (boss defeated).
 *
 * Reward types (bit flags):
 * - Agahnim = 1
 * - PendantGreen = 2
 * - PendantNonGreen = 4
 * - CrystalBlue = 8
 * - CrystalRed = 16
 * - BossTokenKraid = 32
 * - BossTokenPhantoon = 64
 * - BossTokenDraygon = 128
 * - BossTokenRidley = 256
 *
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static data (contains settings with reward_regions)
 * @param {number} rewardType - The reward type value to check for
 */
export function smz3_CanAcquire(snapshot, staticData, rewardType) {
  // Get player slot - snapshot.player can be either a number or an object with slot property
  const playerSlot = String(typeof snapshot.player === 'object' ? snapshot.player.slot : snapshot.player);

  // Get the reward_regions mapping from settings
  const settings = staticData.settings?.[playerSlot] || {};
  const rewardRegions = settings.reward_regions || {};

  // Boss location mapping: maps region name to boss location name
  // Note: Some regions (like Castle Tower) don't have a specific boss location
  // and use Can Complete based on other requirements
  const bossLocations = {
    'Castle Tower': null,  // No boss location - completion based on CanEnter + items
    'Eastern Palace': 'Eastern Palace - Armos Knights',
    'Desert Palace': 'Desert Palace - Lanmolas',
    'Tower of Hera': 'Tower of Hera - Moldorm',
    'Palace of Darkness': 'Palace of Darkness - Helmasaur King',
    'Swamp Palace': 'Swamp Palace - Arrghus',
    'Skull Woods': 'Skull Woods - Mothula',
    'Thieves\' Town': 'Thieves\' Town - Blind',
    'Ice Palace': 'Ice Palace - Kholdstare',
    'Misery Mire': 'Misery Mire - Vitreous',
    'Turtle Rock': 'Turtle Rock - Trinexx',
    'Brinstar Kraid': 'Energy Tank, Kraid',
    'Wrecked Ship': null,  // No specific Phantoon location - completion based on other requirements
    'Maridia Inner': 'Missile (Draygon)',
    'Norfair Lower East': 'Energy Tank, Ridley'
  };

  // Find the region that has the specified reward
  for (const [regionName, rewardInfo] of Object.entries(rewardRegions)) {
    if (rewardInfo.reward_type === rewardType) {
      // Found the region with this reward
      const bossLocationName = bossLocations[regionName];

      if (!bossLocationName) {

        // Implement CanComplete logic for regions without boss locations
        if (regionName === 'Castle Tower') {
          // Castle Tower (Agahnim) CanComplete requirements:
          // CanEnter: CanKillManyEnemies() && (Cape || MasterSword)
          // And: Lamp && KeyCT >= 2 && Sword

          const canKillManyEnemies = smz3_CanKillManyEnemies(snapshot, staticData);
          const hasCapeOrMasterSword = hasItem(snapshot, staticData, 'Cape') || getItemCount(snapshot, staticData, 'ProgressiveSword') >= 2;
          const canEnter = canKillManyEnemies && hasCapeOrMasterSword;

          const hasLamp = hasItem(snapshot, staticData, 'Lamp');
          const hasEnoughKeys = getItemCount(snapshot, staticData, 'KeyCT') >= 2;
          const hasSword = hasItem(snapshot, staticData, 'ProgressiveSword');

          const canComplete = canEnter && hasLamp && hasEnoughKeys && hasSword;

          return canComplete;
        } else if (regionName === 'Wrecked Ship') {
          // Wrecked Ship CanComplete: CanEnter && CanUnlockShip
          // CanUnlockShip: CardWreckedShipBoss && CanPassBombPassages
          // For now, we'll implement a simplified version
          // TODO: Implement full CanEnter logic for Wrecked Ship
          const hasCard = hasItem(snapshot, staticData, 'CardWreckedShipBoss');
          const canPassBomb = smz3_CanPassBombPassages(snapshot, staticData);
          const canUnlockShip = hasCard && canPassBomb;

          // Simplified CanEnter check - requires Super at minimum
          const hasSuper = hasItem(snapshot, staticData, 'Super');

          const canComplete = hasSuper && canUnlockShip;

          return canComplete;
        }

        return false;
      }

      // Use checkRegionCompletion which properly handles both region accessibility
      // and boss location access rules
      return checkRegionCompletion(snapshot, staticData, regionName);
    }
  }

  return false;
}

/**
 * Check if player can acquire ALL rewards of a specific type(s).
 * Python: def CanAcquireAll(self, items, rewardsMask):
 *     return all(region.CanComplete(items) for region in self.rewardLookup[rewardsMask.value])
 *
 * The rewardType parameter is a bit mask that can include multiple reward types:
 * - PendantGreen = 2
 * - PendantNonGreen = 4
 * - Both Pendants = 6 (2 | 4)
 * - CrystalRed = 16
 * - etc.
 *
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static data (contains settings with reward_regions)
 * @param {number} rewardType - The reward type mask to check for
 */
export function smz3_CanAcquireAll(snapshot, staticData, rewardType) {
  // Get player slot
  const playerSlot = String(typeof snapshot.player === 'object' ? snapshot.player.slot : snapshot.player);

  // Get the reward_regions mapping from settings
  const settings = staticData.settings?.[playerSlot] || {};
  const rewardRegions = settings.reward_regions || {};

  // Find all regions that have rewards matching ANY bit in the mask
  const matchingRegions = [];
  for (const [regionName, rewardInfo] of Object.entries(rewardRegions)) {
    // Check if this region's reward type matches any bit in the mask
    if ((rewardInfo.reward_type & rewardType) !== 0) {
      matchingRegions.push({ name: regionName, rewardType: rewardInfo.reward_type });
    }
  }

  // If no regions match, return false (can't acquire what doesn't exist)
  if (matchingRegions.length === 0) {
    return false;
  }

  // Check if ALL matching regions can be completed
  // NOTE: We need to check each unique region, not call CanAcquire with the reward type,
  // because multiple regions may have the same reward type (e.g., two non-green pendants).
  for (const region of matchingRegions) {
    // Instead of calling CanAcquire (which finds the FIRST region with a reward type),
    // we need to check THIS specific region's boss location directly.
    const canCompleteRegion = checkRegionCompletion(snapshot, staticData, region.name);
    if (!canCompleteRegion) {
      return false;
    }
  }

  return true;
}

/**
 * Check if player can acquire AT LEAST a certain number of rewards of a specific type(s).
 * Python: def CanAcquireAtLeast(self, amount, items, rewardsMask):
 *     return len([region for region in self.rewardLookup[rewardsMask.value] if region.CanComplete(items)]) >= amount
 *
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static data (contains settings with reward_regions)
 * @param {number} amount - Minimum number of regions to complete
 * @param {number} rewardType - The reward type mask to check for
 */
export function smz3_CanAcquireAtLeast(snapshot, staticData, amount, rewardType) {
  // Get player slot
  const playerSlot = String(typeof snapshot.player === 'object' ? snapshot.player.slot : snapshot.player);

  // Get the reward_regions mapping from settings
  const settings = staticData.settings?.[playerSlot] || {};
  const rewardRegions = settings.reward_regions || {};

  // Find all regions that have rewards matching ANY bit in the mask
  const matchingRegions = [];
  for (const [regionName, rewardInfo] of Object.entries(rewardRegions)) {
    // Check if this region's reward type matches any bit in the mask
    if ((rewardInfo.reward_type & rewardType) !== 0) {
      matchingRegions.push({ name: regionName, rewardType: rewardInfo.reward_type });
    }
  }

  // Count how many of these regions can be completed
  let completableCount = 0;
  for (const region of matchingRegions) {
    const canCompleteRegion = checkRegionCompletion(snapshot, staticData, region.name);
    if (canCompleteRegion) {
      completableCount++;
    }
  }

  return completableCount >= amount;
}

/**
 * Simple rule evaluator for use within helper functions.
 * Handles basic rule types without needing snapshot.evaluateRule().
 * @param {Object} rule - The rule to evaluate
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static data
 * @returns {boolean} Result of rule evaluation
 */
function evaluateSimpleRule(rule, snapshot, staticData) {
  if (!rule) return true; // null/undefined rules are always true

  switch (rule.type) {
    case 'constant':
      return !!rule.value;

    case 'conditional':
      // Handle conditional (ternary) expressions: test ? if_true : if_false
      if (!rule.test) {
        console.warn('[evaluateSimpleRule] conditional rule missing test');
        return false;
      }
      const testResult = evaluateSimpleRule(rule.test, snapshot, staticData);
      if (testResult) {
        return rule.if_true ? evaluateSimpleRule(rule.if_true, snapshot, staticData) : true;
      } else {
        return rule.if_false ? evaluateSimpleRule(rule.if_false, snapshot, staticData) : false;
      }

    case 'item_check':
      return hasItem(snapshot, staticData, rule.item);

    case 'and':
      if (!rule.conditions || !Array.isArray(rule.conditions)) {
        return true;
      }
      // All conditions must be true
      return rule.conditions.every(cond => evaluateSimpleRule(cond, snapshot, staticData));

    case 'or':
      if (!rule.conditions || !Array.isArray(rule.conditions)) {
        return false;
      }
      // At least one condition must be true
      return rule.conditions.some(cond => evaluateSimpleRule(cond, snapshot, staticData));

    case 'not':
      if (!rule.condition) {
        return true;
      }
      return !evaluateSimpleRule(rule.condition, snapshot, staticData);

    case 'region_check':
      // Check if region is reachable
      const regionName = typeof rule.region === 'string' ? rule.region : rule.region?.value;
      return snapshot.regionReachability?.[regionName] === true;

    case 'binary_op':
      // Handle arithmetic operations like +, -, *, /, %
      if (!rule.left || !rule.right || !rule.op) {
        console.warn('[evaluateSimpleRule] Invalid binary_op rule, missing left/right/op');
        return 0;
      }

      // Evaluate left and right sides
      const leftVal = evaluateSimpleRule(rule.left, snapshot, staticData);
      const rightVal = evaluateSimpleRule(rule.right, snapshot, staticData);

      // Perform the operation
      switch (rule.op) {
        case '+': return leftVal + rightVal;
        case '-': return leftVal - rightVal;
        case '*': return leftVal * rightVal;
        case '/': return rightVal !== 0 ? Math.floor(leftVal / rightVal) : 0;
        case '%': return rightVal !== 0 ? leftVal % rightVal : 0;
        default:
          console.warn(`[evaluateSimpleRule] Unknown binary operator '${rule.op}'`);
          return 0;
      }

    case 'compare':
      // Handle comparison operations like >= , <=, ==, !=, >, <
      if (!rule.left || !rule.right || !rule.op) {
        console.warn('[evaluateSimpleRule] Invalid compare rule, missing left/right/op');
        return false;
      }

      // Evaluate left and right sides
      let leftValue;
      if (rule.left.type === 'item_check') {
        leftValue = getItemCount(snapshot, staticData, rule.left.item);
      } else {
        leftValue = evaluateSimpleRule(rule.left, snapshot, staticData);
      }

      let rightValue;
      if (rule.right.type === 'constant') {
        rightValue = rule.right.value;
      } else {
        rightValue = evaluateSimpleRule(rule.right, snapshot, staticData);
      }

      // Perform comparison
      switch (rule.op) {
        case '>=': return leftValue >= rightValue;
        case '<=': return leftValue <= rightValue;
        case '>': return leftValue > rightValue;
        case '<': return leftValue < rightValue;
        case '==': return leftValue == rightValue;
        case '!=': return leftValue != rightValue;
        default:
          console.warn(`[evaluateSimpleRule] Unknown comparison operator '${rule.op}'`);
          return false;
      }

    case 'helper':
      // Try to call the helper function
      const helperName = rule.name;
      const args = rule.args || [];

      // Evaluate arguments recursively
      const evaluatedArgs = args.map(arg => {
        if (arg && typeof arg === 'object' && arg.type) {
          // If it's a rule, evaluate it
          return evaluateSimpleRule(arg, snapshot, staticData);
        }
        return arg;
      });

      // Call the helper function by name
      // Check if the helper exists in the global scope (it's exported from this module)
      if (typeof global !== 'undefined' && typeof global[helperName] === 'function') {
        return global[helperName](snapshot, staticData, ...evaluatedArgs);
      }

      // Try window scope (browser)
      if (typeof window !== 'undefined' && typeof window[helperName] === 'function') {
        return window[helperName](snapshot, staticData, ...evaluatedArgs);
      }

      // Try calling it directly if it's defined in this module
      // We need to handle special cases for the helpers defined in this file
      switch (helperName) {
        case 'smz3_CanAcquire':
          return smz3_CanAcquire(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanAcquireAll':
          return smz3_CanAcquireAll(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanAcquireAtLeast':
          return smz3_CanAcquireAtLeast(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanLiftLight':
          return smz3_CanLiftLight(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanLiftHeavy':
          return smz3_CanLiftHeavy(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanKillManyEnemies':
          return smz3_CanKillManyEnemies(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanBeatBoss':
          return smz3_CanBeatBoss(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanLightTorches':
          return smz3_CanLightTorches(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanMeltFreezors':
          return smz3_CanMeltFreezors(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanExtendMagic':
          return smz3_CanExtendMagic(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanIbj':
          return smz3_CanIbj(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanFly':
          return smz3_CanFly(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanUsePowerBombs':
          return smz3_CanUsePowerBombs(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanPassBombPassages':
          return smz3_CanPassBombPassages(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanDestroyBombWalls':
          return smz3_CanDestroyBombWalls(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanSpringBallJump':
          return smz3_CanSpringBallJump(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanHellRun':
          return smz3_CanHellRun(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_HasEnergyReserves':
          return smz3_HasEnergyReserves(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanOpenRedDoors':
          return smz3_CanOpenRedDoors(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanAccessCrocomire':
          return smz3_CanAccessCrocomire(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanUnlockShip':
          return smz3_CanUnlockShip(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanEnterAndLeaveGauntlet':
          return smz3_CanEnterAndLeaveGauntlet(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanAccessDeathMountainPortal':
          return smz3_CanAccessDeathMountainPortal(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanAccessDarkWorldPortal':
          return smz3_CanAccessDarkWorldPortal(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanAccessMiseryMirePortal':
          return smz3_CanAccessMiseryMirePortal(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanAccessNorfairUpperPortal':
          return smz3_CanAccessNorfairUpperPortal(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanAccessNorfairLowerPortal':
          return smz3_CanAccessNorfairLowerPortal(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanAccessMaridiaPortal':
          return smz3_CanAccessMaridiaPortal(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanReachAqueduct':
          return smz3_CanReachAqueduct(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanDefeatBotwoon':
          return smz3_CanDefeatBotwoon(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanDefeatDraygon':
          return smz3_CanDefeatDraygon(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanExit':
          return smz3_CanExit(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_GetLocation':
          return smz3_GetLocation(snapshot, staticData, ...evaluatedArgs);
        // Boss-specific helpers
        case 'smz3_CanBeatArmos':
          return smz3_CanBeatArmos(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanBeatMoldorm':
          return smz3_CanBeatMoldorm(snapshot, staticData, ...evaluatedArgs);
        // Ganon's Tower navigation helpers
        case 'smz3_LeftSide':
          return smz3_LeftSide(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_RightSide':
          return smz3_RightSide(snapshot, staticData, ...evaluatedArgs);
        case 'smz3_CanNotWasteKeysBeforeAccessible':
          return smz3_CanNotWasteKeysBeforeAccessible(snapshot, staticData, ...evaluatedArgs);
        default:
          console.warn(`[evaluateSimpleRule] Unknown helper '${helperName}', returning false`);
          return false;
      }

    case 'function_call':
      // Handle function calls, which can be attribute access (e.g., state.CanAcquireAtLeast)
      if (!rule.function) {
        console.warn('[evaluateSimpleRule] function_call rule missing function property');
        return false;
      }

      // Check if it's an attribute access
      if (rule.function.type === 'attribute') {
        const attrName = rule.function.attr;
        const args = rule.args || [];

        // Evaluate arguments
        const evaluatedArgs = args.map(arg => {
          if (arg && typeof arg === 'object' && arg.type) {
            return evaluateSimpleRule(arg, snapshot, staticData);
          }
          return arg;
        });

        // Map attribute names to helper function names
        const functionName = `smz3_${attrName}`;

        // Call the helper function
        switch (functionName) {
          case 'smz3_CanAcquireAtLeast':
            return smz3_CanAcquireAtLeast(snapshot, staticData, ...evaluatedArgs);
          case 'smz3_CanAcquireAll':
            return smz3_CanAcquireAll(snapshot, staticData, ...evaluatedArgs);
          case 'smz3_CanAcquire':
            return smz3_CanAcquire(snapshot, staticData, ...evaluatedArgs);
          default:
            console.warn(`[evaluateSimpleRule] Unknown function_call attribute '${attrName}', returning false`);
            return false;
        }
      } else {
        console.warn(`[evaluateSimpleRule] function_call with unsupported function type '${rule.function.type}'`);
        return false;
      }

    default:
      console.warn(`[evaluateSimpleRule] Unknown rule type '${rule.type}', returning false`);
      return false;
  }
}

/**
 * Internal helper to check if a specific region can be completed.
 * A region can be completed if its boss location is accessible.
 * We check the snapshot's locationAccessibility to avoid circular dependencies
 * during reachability calculation.
 */
function checkRegionCompletion(snapshot, staticData, regionName) {
  // Boss location mapping: maps region name to boss location name
  const bossLocations = {
    'Castle Tower': null,  // No boss location - completion based on CanEnter + items
    'Eastern Palace': 'Eastern Palace - Armos Knights',
    'Desert Palace': 'Desert Palace - Lanmolas',
    'Tower of Hera': 'Tower of Hera - Moldorm',
    'Palace of Darkness': 'Palace of Darkness - Helmasaur King',
    'Swamp Palace': 'Swamp Palace - Arrghus',
    'Skull Woods': 'Skull Woods - Mothula',
    'Thieves\' Town': 'Thieves\' Town - Blind',
    'Ice Palace': 'Ice Palace - Kholdstare',
    'Misery Mire': 'Misery Mire - Vitreous',
    'Turtle Rock': 'Turtle Rock - Trinexx',
    'Brinstar Kraid': 'Energy Tank, Kraid',
    'Wrecked Ship': null,  // No specific Phantoon location - completion based on other requirements
    'Maridia Inner': 'Missile (Draygon)',
    'Norfair Lower East': 'Energy Tank, Ridley'
  };

  const bossLocationName = bossLocations[regionName];

  if (!bossLocationName) {
    // Implement CanComplete logic for regions without boss locations
    if (regionName === 'Castle Tower') {
      // Castle Tower (Agahnim) CanComplete requirements:
      // CanEnter: CanKillManyEnemies() && (Cape || MasterSword)
      // And: Lamp && KeyCT >= 2 && Sword

      const canKillManyEnemies = smz3_CanKillManyEnemies(snapshot, staticData);
      const hasCapeOrMasterSword = hasItem(snapshot, staticData, 'Cape') || getItemCount(snapshot, staticData, 'ProgressiveSword') >= 2;
      const canEnter = canKillManyEnemies && hasCapeOrMasterSword;

      const hasLamp = hasItem(snapshot, staticData, 'Lamp');
      const hasEnoughKeys = getItemCount(snapshot, staticData, 'KeyCT') >= 2;
      const hasSword = hasItem(snapshot, staticData, 'ProgressiveSword');

      const canComplete = canEnter && hasLamp && hasEnoughKeys && hasSword;

      return canComplete;
    } else if (regionName === 'Wrecked Ship') {
      // Wrecked Ship CanComplete: CanEnter && CanUnlockShip
      // CanUnlockShip: CardWreckedShipBoss && CanPassBombPassages
      const hasCard = hasItem(snapshot, staticData, 'CardWreckedShipBoss');
      const canPassBomb = smz3_CanPassBombPassages(snapshot, staticData);
      const canUnlockShip = hasCard && canPassBomb;

      // Simplified CanEnter check - requires Super at minimum
      const hasSuper = hasItem(snapshot, staticData, 'Super');

      const canComplete = hasSuper && canUnlockShip;

      return canComplete;
    }

    return false;
  }

  // Find the boss location in staticData
  let bossLocation = null;
  const regionsToSearch = staticData.regions instanceof Map ?
    Array.from(staticData.regions.values()) :
    Object.values(staticData.regions);

  for (const region of regionsToSearch) {
    if (region.locations) {
      bossLocation = region.locations.find(loc => loc.name === bossLocationName);
      if (bossLocation) {
        break;
      }
    }
  }

  if (!bossLocation) {
    return false;
  }

  // Check if the boss location is accessible using the precomputed locationAccessibility
  // This avoids circular dependencies during reachability calculation
  if (snapshot.locationAccessibility) {
    const isAccessible = snapshot.locationAccessibility[bossLocationName] === true;
    return isAccessible;
  }

  // Fallback: if locationAccessibility isn't available, we need to check both:
  // 1. The region is accessible (can enter)
  // 2. The boss location's access rule passes (can access boss within region)

  // First check if the region is accessible via regionReachability
  // Only reject if regionReachability explicitly has this region set to false/unreachable
  // If the region isn't in regionReachability at all, we fall through to access rule evaluation
  // Note: regionReachability values can be true, 'reachable', false, or 'unreachable'
  if (snapshot.regionReachability && snapshot.regionReachability.hasOwnProperty(regionName)) {
    const regionStatus = snapshot.regionReachability[regionName];
    const isRegionAccessible = regionStatus === true || regionStatus === 'reachable';
    if (!isRegionAccessible) {
      return false;
    }
  }

  // Now check the boss location's access rule
  if (bossLocation.access_rule) {
    const result = evaluateSimpleRule(bossLocation.access_rule, snapshot, staticData);
    return result;
  }

  // No access rule means always accessible (if region is accessible)
  return true;
}
