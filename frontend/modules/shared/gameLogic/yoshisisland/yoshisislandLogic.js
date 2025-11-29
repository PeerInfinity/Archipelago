/**
 * Yoshi's Island game logic functions
 * Translates Python YoshiLogic class methods to JavaScript
 */

/**
 * Get the game logic difficulty level from settings
 * @param {Object} staticData - Static game data
 * @returns {string} 'Easy', 'Normal', or 'Hard'
 */
function getGameLogic(staticData) {
  const settings = staticData?.settings?.[1];
  const stageLogic = settings?.StageLogic ?? 0;

  if (stageLogic === 0) { // option_strict
    return 'Easy';
  } else if (stageLogic === 1) { // option_loose
    return 'Normal';
  } else { // option_expert
    return 'Hard';
  }
}

/**
 * Check if middle rings are available from the start
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
function getMidringStart(staticData) {
  const settings = staticData?.settings?.[1];
  const shuffleMidrings = settings?.ShuffleMiddleRings ?? false;
  return !shuffleMidrings; // midring_start = not shuffle_midrings
}

/**
 * Check if clouds are always visible
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
function getCloudsAlwaysVisible(staticData) {
  const settings = staticData?.settings?.[1];
  const hiddenObjectVis = settings?.HiddenObjectVisibility ?? 1;
  return hiddenObjectVis >= 2; // option_clouds_only = 2
}

/**
 * Check if consumable logic is enabled
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
function getConsumableLogic(staticData) {
  const settings = staticData?.settings?.[1];
  const itemLogic = settings?.ItemLogic ?? false;
  return !itemLogic; // consumable_logic = not item_logic
}

/**
 * Get the Bowser door mode
 * @param {Object} staticData - Static game data
 * @returns {number}
 */
function getBowserDoor(staticData) {
  const settings = staticData?.settings?.[1];
  let bowserDoor = settings?.BowserDoorMode ?? 0;
  // Python logic: if bowser_door == 4, set it to 3
  if (bowserDoor === 4) {
    bowserDoor = 3;
  }
  return bowserDoor;
}

/**
 * Get Luigi pieces required
 * @param {Object} staticData - Static game data
 * @returns {number}
 */
function getLuigiPieces(staticData) {
  const settings = staticData?.settings?.[1];
  return settings?.LuigiPiecesRequired ?? 25;
}

/**
 * Get castle clear condition
 * @param {Object} staticData - Static game data
 * @returns {number}
 */
function getCastleClearCondition(staticData) {
  const settings = staticData?.settings?.[1];
  return settings?.CastleClearCondition ?? 0;
}

/**
 * Get castle open condition
 * @param {Object} staticData - Static game data
 * @returns {number}
 */
function getCastleOpenCondition(staticData) {
  const settings = staticData?.settings?.[1];
  return settings?.CastleOpenCondition ?? 0;
}

/**
 * Check if player has item (helper for internal use)
 * @param {Object} snapshot - Canonical state snapshot
 * @param {string} itemName - Name of the item
 * @returns {boolean}
 */
function hasItem(snapshot, itemName) {
  if (!snapshot?.inventory) return false;
  return (snapshot.inventory[itemName] || 0) > 0;
}

/**
 * Count items (helper for internal use)
 * @param {Object} snapshot - Canonical state snapshot
 * @param {string} itemName - Name of the item
 * @returns {number}
 */
function countItem(snapshot, itemName) {
  if (!snapshot?.inventory) return 0;
  return snapshot.inventory[itemName] || 0;
}

/**
 * Check if player has middle ring access
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function has_midring(snapshot, staticData) {
  const midringStart = getMidringStart(staticData);
  return midringStart || hasItem(snapshot, 'Middle Ring');
}

/**
 * Check if player has reconstituted Luigi
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function reconstitute_luigi(snapshot, staticData) {
  const luigiPieces = getLuigiPieces(staticData);
  return countItem(snapshot, 'Piece of Luigi') >= luigiPieces;
}

/**
 * Check if player has bandit bonus items
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function bandit_bonus(snapshot, staticData) {
  return hasItem(snapshot, 'Bandit Consumables') || hasItem(snapshot, 'Bandit Watermelons');
}

/**
 * Check if player has item bonus
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function item_bonus(snapshot, staticData) {
  return hasItem(snapshot, 'Bonus Consumables');
}

/**
 * Check if player has combat item consumables
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function combat_item(snapshot, staticData) {
  const consumableLogic = getConsumableLogic(staticData);
  if (!consumableLogic) {
    return false;
  }

  const gameLogic = getGameLogic(staticData);
  if (gameLogic === 'Easy') {
    return item_bonus(snapshot, staticData);
  } else {
    return bandit_bonus(snapshot, staticData) || item_bonus(snapshot, staticData);
  }
}

/**
 * Check if player has melon consumables
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function melon_item(snapshot, staticData) {
  const consumableLogic = getConsumableLogic(staticData);
  if (!consumableLogic) {
    return false;
  }

  const gameLogic = getGameLogic(staticData);
  if (gameLogic === 'Easy') {
    return item_bonus(snapshot, staticData);
  } else {
    return hasItem(snapshot, 'Bandit Watermelons') || item_bonus(snapshot, staticData);
  }
}

/**
 * Check default visibility
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function default_vis(snapshot, staticData) {
  return getCloudsAlwaysVisible(staticData);
}

/**
 * Check if player can see clouds
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function cansee_clouds(snapshot, staticData) {
  const gameLogic = getGameLogic(staticData);
  if (gameLogic !== 'Easy') {
    return true;
  } else {
    return default_vis(snapshot, staticData) ||
           hasItem(snapshot, 'Secret Lens') ||
           combat_item(snapshot, staticData);
  }
}

/**
 * Check Bowser door 1 requirements
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function bowserdoor_1(snapshot, staticData) {
  const gameLogic = getGameLogic(staticData);
  if (gameLogic === 'Easy') {
    return hasItem(snapshot, 'Egg Plant') &&
           hasItem(snapshot, '! Switch') &&
           countItem(snapshot, 'Egg Capacity Upgrade') >= 2;
  } else if (gameLogic === 'Normal') {
    return hasItem(snapshot, 'Egg Plant') &&
           countItem(snapshot, 'Egg Capacity Upgrade') >= 1;
  } else {
    return hasItem(snapshot, 'Egg Plant');
  }
}

/**
 * Check Bowser door 2 requirements
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function bowserdoor_2(snapshot, staticData) {
  const gameLogic = getGameLogic(staticData);
  if (gameLogic === 'Easy') {
    return ((countItem(snapshot, 'Egg Capacity Upgrade') >= 3 && hasItem(snapshot, 'Egg Plant')) ||
            combat_item(snapshot, staticData)) &&
           hasItem(snapshot, 'Key');
  } else if (gameLogic === 'Normal') {
    return ((countItem(snapshot, 'Egg Capacity Upgrade') >= 2 && hasItem(snapshot, 'Egg Plant')) ||
            combat_item(snapshot, staticData)) &&
           hasItem(snapshot, 'Key');
  } else {
    return ((countItem(snapshot, 'Egg Capacity Upgrade') >= 1 && hasItem(snapshot, 'Egg Plant')) ||
            combat_item(snapshot, staticData)) &&
           hasItem(snapshot, 'Key');
  }
}

/**
 * Check Bowser door 3 requirements
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function bowserdoor_3(snapshot, staticData) {
  return true; // Always accessible
}

/**
 * Check Bowser door 4 requirements
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function bowserdoor_4(snapshot, staticData) {
  return true; // Always accessible
}

/**
 * Check if player can access 1-4 Clear (exit to boss room)
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _14Clear(snapshot, staticData) {
  // All difficulty levels require Spring Ball and Key
  return hasItem(snapshot, 'Spring Ball') && hasItem(snapshot, 'Key');
}

/**
 * Check if player can access 1-7 Game (Gather Coins/Bandit Game)
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _17Game(snapshot, staticData) {
  // All difficulty levels require Key
  return hasItem(snapshot, 'Key');
}

/**
 * Check if player can access 4-7 Game (Gather Coins/Bandit Game)
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _47Game(snapshot, staticData) {
  // All difficulty levels require Key and Large Spring Ball
  return hasItem(snapshot, 'Key') && hasItem(snapshot, 'Large Spring Ball');
}

/**
 * Check if player can access 3-4 Clear (exit to boss room)
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _34Clear(snapshot, staticData) {
  const gameLogic = getGameLogic(staticData);
  if (gameLogic === 'Easy') {
    return hasItem(snapshot, 'Dashed Platform');
  } else if (gameLogic === 'Normal') {
    return hasItem(snapshot, 'Dashed Platform') || has_midring(snapshot, staticData);
  } else { // Hard
    return true;
  }
}

/**
 * Check if player can beat Prince Froggy boss
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _34Boss(snapshot, staticData) {
  const gameLogic = getGameLogic(staticData);
  if (gameLogic === 'Easy') {
    return hasItem(snapshot, 'Giant Eggs');
  } else { // Normal or Hard
    return true;
  }
}

/**
 * Check if player can fight Prince Froggy boss
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _34CanFightBoss(snapshot, staticData) {
  // To fight the boss, you need to reach the boss room and beat the boss
  return _34Clear(snapshot, staticData) && _34Boss(snapshot, staticData);
}

/**
 * Check if player can access 3-8 Clear (exit to boss room)
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _38Clear(snapshot, staticData) {
  const gameLogic = getGameLogic(staticData);
  if (gameLogic === 'Easy') {
    return countItem(snapshot, 'Egg Capacity Upgrade') >= 3 || combat_item(snapshot, staticData);
  } else if (gameLogic === 'Normal') {
    return countItem(snapshot, 'Egg Capacity Upgrade') >= 1 || combat_item(snapshot, staticData);
  } else { // Hard
    return true;
  }
}

/**
 * Check if player can beat Naval Piranha boss
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _38Boss(snapshot, staticData) {
  // All difficulty levels: always true
  return true;
}

/**
 * Check if player can fight Naval Piranha boss
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _38CanFightBoss(snapshot, staticData) {
  // To fight the boss, you need to reach the boss room and beat the boss
  return _38Clear(snapshot, staticData) && _38Boss(snapshot, staticData);
}

/**
 * Check if player can access 5-4 Clear (exit to boss room)
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _54Clear(snapshot, staticData) {
  const gameLogic = getGameLogic(staticData);
  if (gameLogic === 'Easy' || gameLogic === 'Normal') {
    return hasItem(snapshot, 'Dashed Stairs') &&
           hasItem(snapshot, 'Platform Ghost') &&
           hasItem(snapshot, 'Dashed Platform');
  } else { // Hard
    return hasItem(snapshot, 'Dashed Stairs') &&
           hasItem(snapshot, 'Platform Ghost');
  }
}

/**
 * Check if player can beat Sluggy The Unshaven boss
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _54Boss(snapshot, staticData) {
  const gameLogic = getGameLogic(staticData);
  if (gameLogic === 'Easy') {
    return countItem(snapshot, 'Egg Capacity Upgrade') >= 2 && hasItem(snapshot, 'Egg Plant');
  } else if (gameLogic === 'Normal') {
    return (countItem(snapshot, 'Egg Capacity Upgrade') >= 1 && hasItem(snapshot, 'Egg Plant')) ||
           (countItem(snapshot, 'Egg Capacity Upgrade') >= 5 && has_midring(snapshot, staticData));
  } else { // Hard
    return hasItem(snapshot, 'Egg Plant') ||
           (countItem(snapshot, 'Egg Capacity Upgrade') >= 3 && has_midring(snapshot, staticData));
  }
}

/**
 * Check if player can fight Sluggy The Unshaven boss
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _54CanFightBoss(snapshot, staticData) {
  // To fight the boss, you need to reach the boss room and beat the boss
  return _54Clear(snapshot, staticData) && _54Boss(snapshot, staticData);
}

/**
 * Check if player can access 1-8 Clear (exit to boss room)
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _18Clear(snapshot, staticData) {
  // All difficulty levels require Key and Arrow Wheel
  return hasItem(snapshot, 'Key') && hasItem(snapshot, 'Arrow Wheel');
}

/**
 * Check if player can beat Salvo The Slime boss
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _18Boss(snapshot, staticData) {
  // All difficulty levels: always true
  return true;
}

/**
 * Check if player can fight Salvo The Slime boss
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _18CanFightBoss(snapshot, staticData) {
  // To fight the boss, you need to reach the boss room and beat the boss
  return _18Clear(snapshot, staticData) && _18Boss(snapshot, staticData);
}

/**
 * Check if player can access 5-8 Clear (exit to boss room)
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _58Clear(snapshot, staticData) {
  // All difficulty levels require Arrow Wheel and Large Spring Ball
  return hasItem(snapshot, 'Arrow Wheel') && hasItem(snapshot, 'Large Spring Ball');
}

/**
 * Check if player can beat Raphael The Raven boss
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _58Boss(snapshot, staticData) {
  // All difficulty levels: always true
  return true;
}

/**
 * Check if player can fight Raphael The Raven boss
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _58CanFightBoss(snapshot, staticData) {
  // To fight the boss, you need to reach the boss room and beat the boss
  return _58Clear(snapshot, staticData) && _58Boss(snapshot, staticData);
}

/**
 * Check if player can access 2-4 Clear (exit to boss room)
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _24Clear(snapshot, staticData) {
  const gameLogic = getGameLogic(staticData);
  if (gameLogic === 'Easy') {
    return hasItem(snapshot, '! Switch') && hasItem(snapshot, 'Key') && hasItem(snapshot, 'Dashed Stairs');
  } else if (gameLogic === 'Normal') {
    return hasItem(snapshot, '! Switch') && hasItem(snapshot, 'Dashed Stairs');
  } else { // Hard
    return hasItem(snapshot, '! Switch');
  }
}

/**
 * Check if player can beat Bigger Boo boss
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _24Boss(snapshot, staticData) {
  // All difficulty levels: always true
  return true;
}

/**
 * Check if player can fight Bigger Boo boss
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _24CanFightBoss(snapshot, staticData) {
  // To fight the boss, you need to reach the boss room and beat the boss
  return _24Clear(snapshot, staticData) && _24Boss(snapshot, staticData);
}

/**
 * Check if player can access 2-6 Game (Gather Coins/Bandit Game)
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _26Game(snapshot, staticData) {
  // All difficulty levels require Large Spring Ball and Key
  return hasItem(snapshot, 'Large Spring Ball') && hasItem(snapshot, 'Key');
}

/**
 * Check if player can access 2-7 Game (Gather Coins/Bandit Game)
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _27Game(snapshot, staticData) {
  // All difficulty levels require Key
  return hasItem(snapshot, 'Key');
}

/**
 * Check if player can access 2-8 Clear (exit to boss room)
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _28Clear(snapshot, staticData) {
  const gameLogic = getGameLogic(staticData);
  if (gameLogic === 'Easy') {
    return hasItem(snapshot, 'Arrow Wheel') && hasItem(snapshot, 'Key') && countItem(snapshot, 'Egg Capacity Upgrade') >= 1;
  } else { // Normal or Hard
    return hasItem(snapshot, 'Arrow Wheel') && hasItem(snapshot, 'Key');
  }
}

/**
 * Check if player can beat Roger The Ghost boss
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _28Boss(snapshot, staticData) {
  // All difficulty levels: always true
  return true;
}

/**
 * Check if player can fight Roger The Ghost boss
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _28CanFightBoss(snapshot, staticData) {
  // To fight the boss, you need to reach the boss room and beat the boss
  return _28Clear(snapshot, staticData) && _28Boss(snapshot, staticData);
}

/**
 * Check if player can access 4-8 Clear (exit to boss room)
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _48Clear(snapshot, staticData) {
  const gameLogic = getGameLogic(staticData);
  if (gameLogic === 'Easy' || gameLogic === 'Normal') {
    return hasItem(snapshot, 'Dashed Stairs') &&
           hasItem(snapshot, 'Vanishing Arrow Wheel') &&
           hasItem(snapshot, 'Key') &&
           hasItem(snapshot, 'Large Spring Ball');
  } else { // Hard
    return hasItem(snapshot, 'Key') && hasItem(snapshot, 'Large Spring Ball');
  }
}

/**
 * Check if player can beat Hookbill The Koopa boss
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _48Boss(snapshot, staticData) {
  const gameLogic = getGameLogic(staticData);
  if (gameLogic === 'Easy') {
    return countItem(snapshot, 'Egg Capacity Upgrade') >= 3;
  } else if (gameLogic === 'Normal') {
    return countItem(snapshot, 'Egg Capacity Upgrade') >= 2;
  } else { // Hard
    return countItem(snapshot, 'Egg Capacity Upgrade') >= 1;
  }
}

/**
 * Check if player can fight Hookbill The Koopa boss
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _48CanFightBoss(snapshot, staticData) {
  // To fight the boss, you need to reach the boss room and beat the boss
  return _48Clear(snapshot, staticData) && _48Boss(snapshot, staticData);
}

/**
 * Check if player can beat Burt The Bashful boss
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _14Boss(snapshot, staticData) {
  const gameLogic = getGameLogic(staticData);
  if (gameLogic === 'Easy' || gameLogic === 'Normal') {
    return hasItem(snapshot, 'Egg Plant');
  } else { // Hard
    return countItem(snapshot, 'Egg Capacity Upgrade') >= 5 || hasItem(snapshot, 'Egg Plant');
  }
}

/**
 * Check if player can fight Burt The Bashful boss
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _14CanFightBoss(snapshot, staticData) {
  return _14Clear(snapshot, staticData) && _14Boss(snapshot, staticData);
}

/**
 * Check if player can access 1-3 Game
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _13Game(snapshot, staticData) {
  return hasItem(snapshot, 'Key');
}

/**
 * Check if player can access 2-1 Game
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _21Game(snapshot, staticData) {
  return hasItem(snapshot, 'Poochy') && hasItem(snapshot, 'Large Spring Ball') && hasItem(snapshot, 'Key');
}

/**
 * Check if player can access 2-3 Game
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _23Game(snapshot, staticData) {
  return hasItem(snapshot, 'Mole Tank Morph') && hasItem(snapshot, 'Key');
}

/**
 * Check if player can access 3-2 Game
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _32Game(snapshot, staticData) {
  const gameLogic = getGameLogic(staticData);
  if (gameLogic === 'Easy') {
    return hasItem(snapshot, 'Dashed Stairs') && hasItem(snapshot, 'Spring Ball') && hasItem(snapshot, 'Key');
  } else { // Normal or Hard
    return hasItem(snapshot, 'Dashed Stairs') && hasItem(snapshot, 'Key');
  }
}

/**
 * Check if player can access 3-7 Game
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _37Game(snapshot, staticData) {
  const gameLogic = getGameLogic(staticData);
  if (gameLogic === 'Easy') {
    return hasItem(snapshot, 'Key') && hasItem(snapshot, 'Large Spring Ball');
  } else { // Normal or Hard
    return hasItem(snapshot, 'Key');
  }
}

/**
 * Check if player can access 4-2 Game
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _42Game(snapshot, staticData) {
  const gameLogic = getGameLogic(staticData);
  if (gameLogic === 'Easy' || gameLogic === 'Normal') {
    return hasItem(snapshot, 'Large Spring Ball') && hasItem(snapshot, 'Key');
  } else { // Hard
    return hasItem(snapshot, 'Key');
  }
}

/**
 * Check if player can access 4-4 Clear (exit to boss room)
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _44Clear(snapshot, staticData) {
  const gameLogic = getGameLogic(staticData);
  const baseItems = hasItem(snapshot, 'Dashed Stairs') &&
                    hasItem(snapshot, 'Vanishing Arrow Wheel') &&
                    hasItem(snapshot, 'Arrow Wheel') &&
                    hasItem(snapshot, 'Bucket') &&
                    hasItem(snapshot, 'Key');

  if (gameLogic === 'Easy') {
    return baseItems && (countItem(snapshot, 'Egg Capacity Upgrade') >= 1 || combat_item(snapshot, staticData));
  } else { // Normal or Hard
    return baseItems;
  }
}

/**
 * Check if player can beat Marching Milde boss
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _44Boss(snapshot, staticData) {
  return true;
}

/**
 * Check if player can fight Marching Milde boss
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _44CanFightBoss(snapshot, staticData) {
  return _44Clear(snapshot, staticData) && _44Boss(snapshot, staticData);
}

/**
 * Check if player can access 4-6 Game
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _46Game(snapshot, staticData) {
  return hasItem(snapshot, 'Key') && hasItem(snapshot, 'Large Spring Ball');
}

/**
 * Check if player can access 5-1 Game
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _51Game(snapshot, staticData) {
  return hasItem(snapshot, 'Key');
}

/**
 * Check if player can access 6-1 Game
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _61Game(snapshot, staticData) {
  const gameLogic = getGameLogic(staticData);
  if (gameLogic === 'Easy' || gameLogic === 'Normal') {
    return hasItem(snapshot, 'Dashed Platform') && hasItem(snapshot, 'Key') && hasItem(snapshot, 'Beanstalk');
  } else { // Hard
    return hasItem(snapshot, 'Key');
  }
}

/**
 * Check if player can access 6-4 Clear (exit to boss room)
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _64Clear(snapshot, staticData) {
  const gameLogic = getGameLogic(staticData);
  if (gameLogic === 'Easy') {
    return hasItem(snapshot, 'Spring Ball') &&
           hasItem(snapshot, 'Large Spring Ball') &&
           hasItem(snapshot, 'Egg Plant') &&
           hasItem(snapshot, 'Key') &&
           (countItem(snapshot, 'Egg Capacity Upgrade') >= 3 || combat_item(snapshot, staticData));
  } else if (gameLogic === 'Normal') {
    return hasItem(snapshot, 'Large Spring Ball') &&
           hasItem(snapshot, 'Egg Plant') &&
           hasItem(snapshot, 'Key') &&
           (countItem(snapshot, 'Egg Capacity Upgrade') >= 2 || combat_item(snapshot, staticData));
  } else { // Hard
    return hasItem(snapshot, 'Egg Plant') &&
           hasItem(snapshot, 'Key') &&
           (countItem(snapshot, 'Egg Capacity Upgrade') >= 1 || combat_item(snapshot, staticData));
  }
}

/**
 * Check if player can beat Tap-Tap The Red Nose boss
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _64Boss(snapshot, staticData) {
  const gameLogic = getGameLogic(staticData);
  if (gameLogic === 'Easy' || gameLogic === 'Normal') {
    return hasItem(snapshot, 'Egg Plant');
  } else { // Hard
    return true;
  }
}

/**
 * Check if player can fight Tap-Tap The Red Nose boss
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _64CanFightBoss(snapshot, staticData) {
  return _64Clear(snapshot, staticData) && _64Boss(snapshot, staticData);
}

/**
 * Check if player can access 6-7 Game
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _67Game(snapshot, staticData) {
  return hasItem(snapshot, 'Key');
}

/**
 * Check Bowser door route requirements for 6-8
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _68Route(snapshot, staticData) {
  const bowserDoor = getBowserDoor(staticData);
  if (bowserDoor === 0) {
    return true;
  } else if (bowserDoor === 1) {
    return bowserdoor_1(snapshot, staticData);
  } else if (bowserDoor === 2) {
    return bowserdoor_2(snapshot, staticData);
  } else { // bowserDoor === 3 or 4
    return true;
  }
}

/**
 * Check Bowser door collectible route requirements for 6-8
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _68CollectibleRoute(snapshot, staticData) {
  const bowserDoor = getBowserDoor(staticData);
  if (bowserDoor === 0) {
    return true;
  } else if (bowserDoor === 1) {
    return bowserdoor_1(snapshot, staticData);
  } else if (bowserDoor === 2) {
    return bowserdoor_2(snapshot, staticData);
  } else if (bowserDoor === 3 || bowserDoor === 4) {
    return true;
  } else if (bowserDoor === 5) {
    return bowserdoor_1(snapshot, staticData);
  } else {
    return true;
  }
}

/**
 * Check if player can access 6-8 Clear
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function _68Clear(snapshot, staticData) {
  const gameLogic = getGameLogic(staticData);
  if (gameLogic === 'Easy' || gameLogic === 'Normal') {
    return hasItem(snapshot, 'Helicopter Morph') &&
           hasItem(snapshot, 'Egg Plant') &&
           hasItem(snapshot, 'Giant Eggs') &&
           _68Route(snapshot, staticData);
  } else { // Hard
    return hasItem(snapshot, 'Helicopter Morph') &&
           hasItem(snapshot, 'Giant Eggs') &&
           _68Route(snapshot, staticData);
  }
}

/**
 * Check if player has cleared enough bosses to access the castle
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function castle_clear(snapshot, staticData) {
  const bossUnlock = getCastleClearCondition(staticData);
  return countItem(snapshot, 'Boss Clear') >= bossUnlock;
}

/**
 * Check if player can access the castle
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function castle_access(snapshot, staticData) {
  const castleUnlock = getCastleOpenCondition(staticData);
  return countItem(snapshot, 'Boss Clear') >= castleUnlock;
}

// Helper functions object for registration
export const helperFunctions = {
  has_midring,
  reconstitute_luigi,
  bandit_bonus,
  item_bonus,
  combat_item,
  melon_item,
  default_vis,
  cansee_clouds,
  bowserdoor_1,
  bowserdoor_2,
  bowserdoor_3,
  bowserdoor_4,
  _13Game,
  _14Clear,
  _14Boss,
  _14CanFightBoss,
  _17Game,
  _18Clear,
  _18Boss,
  _18CanFightBoss,
  _21Game,
  _23Game,
  _24Clear,
  _24Boss,
  _24CanFightBoss,
  _26Game,
  _27Game,
  _28Clear,
  _28Boss,
  _28CanFightBoss,
  _32Game,
  _34Clear,
  _34Boss,
  _34CanFightBoss,
  _37Game,
  _38Clear,
  _38Boss,
  _38CanFightBoss,
  _42Game,
  _44Clear,
  _44Boss,
  _44CanFightBoss,
  _46Game,
  _47Game,
  _48Clear,
  _48Boss,
  _48CanFightBoss,
  _51Game,
  _54Clear,
  _54Boss,
  _54CanFightBoss,
  _58Clear,
  _58Boss,
  _58CanFightBoss,
  _61Game,
  _64Clear,
  _64Boss,
  _64CanFightBoss,
  _67Game,
  _68Route,
  _68CollectibleRoute,
  _68Clear,
  castle_clear,
  castle_access,
};
