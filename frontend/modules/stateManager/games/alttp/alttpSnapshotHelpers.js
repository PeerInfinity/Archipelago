import { GameSnapshotHelpers } from '../../helpers/gameSnapshotHelpers.js';

export class ALTTPSnapshotHelpers extends GameSnapshotHelpers {
  constructor(snapshotInterface) {
    super(snapshotInterface);
    // console.log('[ALTTPSnapshotHelpers] Initialized.');
    // ALTTP-specific entities that are resolvable via snapshot data
    // These entities would provide methods that use this.snapshot internally.
    this.entities = {
      old_man: {
        // This logic now uses the inherited _isLocationAccessible
        can_reach: () => this._isLocationAccessible('Old Man'), // Returns true/false/undefined
      },
      // Add other ALTTP-specific entities if they can be meaningfully represented in snapshot context
    };
  }

  is_not_bunny(region) {
    const hasMoonPearl = this._hasItem('Moon Pearl');
    if (hasMoonPearl === true) return true;
    // If Moon Pearl status is unknown, we can't be sure, but if it's definitively false, proceed.
    if (hasMoonPearl === undefined) return undefined;

    const regionData =
      typeof region === 'string' ? this._getRegionData(region) : region;
    if (regionData === undefined || regionData === null) {
      // Check for null as well, as _getRegionData might return that
      // console.warn('[ALTTPSnapshotHelpers] is_not_bunny: Region data undefined or null.');
      return undefined; // Cannot determine without region data
    }

    const gameMode = this._getGameMode();
    if (gameMode === undefined) {
      // console.warn('[ALTTPSnapshotHelpers] is_not_bunny: Game mode undefined.');
      return undefined; // Critical info missing
    }

    const isInverted = gameMode === 'inverted';

    // regionData from snapshot.getRegionData should be from staticData,
    // so is_dark_world/is_light_world should be present if the static data is correct.
    // If they are missing, it implies an issue with staticData or regionData structure.
    if (
      typeof regionData.is_dark_world !== 'boolean' ||
      typeof regionData.is_light_world !== 'boolean'
    ) {
      console.warn(
        `[ALTTPSnapshotHelpers] is_not_bunny: Region data for ${
          regionData.name || 'region'
        } missing is_dark_world/is_light_world boolean properties. Data:`,
        regionData
      );
      return undefined; // Data is malformed or missing critical properties
    }

    return isInverted ? regionData.is_dark_world : regionData.is_light_world;
  }

  // Placeholder for can_buy for snapshot context
  can_buy(item) {
    // This needs to be fully implemented considering snapshot limitations.
    // It would involve checking this.snapshot for shop data and region reachability.
    // For now, return undefined as its full logic is complex for snapshot.
    // console.warn('[ALTTPSnapshotHelpers] can_buy() is a placeholder and returns undefined.');
    return undefined;
  }

  can_use_bombs() {
    const bombless = this._hasFlag('bombless_start');
    if (bombless === undefined) return undefined;

    const shuffleUpgrades = this._getSetting('shuffle_capacity_upgrades');
    if (shuffleUpgrades === undefined) return undefined;

    // Start with base bomb count
    let bombs = bombless ? 0 : 10;

    // Add bomb upgrades
    const upgrade5Count = this._countItem('Bomb Upgrade (+5)');
    const upgrade10Count = this._countItem('Bomb Upgrade (+10)');
    const upgrade50Count = this._countItem('Bomb Upgrade (50)');

    if (
      upgrade5Count === undefined ||
      upgrade10Count === undefined ||
      upgrade50Count === undefined
    ) {
      return undefined;
    }

    bombs += upgrade5Count * 5;
    bombs += upgrade10Count * 10;
    bombs += upgrade50Count * 50;

    // Bomb Upgrade (+5) beyond the 6th gives +10 (Python logic)
    bombs += Math.max(0, (upgrade5Count - 6) * 10);

    // If capacity upgrades are NOT shuffled and we have Capacity Upgrade Shop, add 40
    if (!shuffleUpgrades) {
      const hasCapacityShop = this._hasItem('Capacity Upgrade Shop');
      if (hasCapacityShop === undefined) return undefined;
      if (hasCapacityShop) {
        bombs += 40;
      }
    }

    return bombs >= 1; // Need at least 1 bomb to use bombs
  }

  can_bomb_clip(region) {
    const canUseBombsResult = this.can_use_bombs();
    if (canUseBombsResult === false) return false;

    const isNotBunnyResult = this.is_not_bunny(region);
    if (isNotBunnyResult === false) return false;

    const hasBootsResult = this._hasItem('Pegasus Boots');
    if (hasBootsResult === false) return false;

    if (
      canUseBombsResult === undefined ||
      isNotBunnyResult === undefined ||
      hasBootsResult === undefined
    ) {
      return undefined;
    }
    return true; // All conditions were true
  }

  can_buy_unlimited(item) {
    const shops = this._getShops(); // From GameSnapshotHelpers, uses this.snapshot
    if (shops === undefined) return undefined; // Cannot determine if shop data is unknown

    let potentiallyBuyable = false;
    let anyShopStatusUnknown = false;

    for (const shop of shops || []) {
      if (!shop.region_name) continue;

      const regionReachable = this._isRegionReachable(shop.region_name);
      if (regionReachable === false) continue; // Shop not reachable
      if (regionReachable === undefined) {
        anyShopStatusUnknown = true;
        continue; // Don't know if this shop is reachable, but others might be definitively
      }
      // If regionReachable is true, proceed to check inventory
      if (shop.inventory) {
        for (const shopItem of shop.inventory) {
          if (
            shopItem.item === item &&
            (shopItem.max === 0 || shopItem.max > 99)
          ) {
            potentiallyBuyable = true; // Found it in a reachable shop
            // We can return true if we find one definitive way to buy,
            // unless a later part of logic depends on checking ALL shops.
            // For can_buy_unlimited, finding one is enough.
            return true;
          }
        }
      }
    }

    // ALTTP-specific fallback for potions
    if (item === 'Green Potion' || item === 'Blue Potion') {
      const potionShopReachable = this._isRegionReachable('Potion Shop');
      if (potionShopReachable === true) return true;
      if (potionShopReachable === undefined) anyShopStatusUnknown = true;
      // If potionShopReachable is false, this path doesn't make it true.
    }

    if (potentiallyBuyable) return true; // Should have been caught by early return, but for safety.
    if (anyShopStatusUnknown) return undefined; // No definitive yes, but some shops were unknown
    return false; // No unlimited buy found, and all reachable shops checked
  }

  // ALTTP-specific snapshot helper methods will go here.
  // Example:
  // someALTTPSnapshotSpecificMethod() {
  //   const setting = this._getSetting('some_alttp_setting');
  //   if (setting === undefined) return undefined;
  //   return setting === 'expected_value';
  // }

  can_hold_arrows(quantity = 0) {
    const shuffleUpgrades = this._getSetting('shuffle_capacity_upgrades');
    if (shuffleUpgrades === undefined) return undefined;

    if (shuffleUpgrades) {
      if (quantity === 0) return true;

      let arrows = 30; // Default. Consider if this can vary based on snapshot-available settings.

      const hasArrowUpgrade70 = this._hasItem('Arrow Upgrade (70)');
      if (hasArrowUpgrade70 === undefined) return undefined;
      if (hasArrowUpgrade70 === true) {
        arrows = 70;
      } else {
        const arrowUpgrade5Count = this._countItem('Arrow Upgrade (+5)');
        if (arrowUpgrade5Count === undefined) return undefined;

        const arrowUpgrade10Count = this._countItem('Arrow Upgrade (+10)');
        if (arrowUpgrade10Count === undefined) return undefined;

        arrows += arrowUpgrade5Count * 5;
        arrows += arrowUpgrade10Count * 10;

        const extraUpgrades = Math.max(0, arrowUpgrade5Count - 6);
        arrows += extraUpgrades * 10;
      }
      return Math.min(70, arrows) >= quantity;
    } else {
      // Default case - non-shuffled capacity
      if (quantity <= 30) return true; // Can always hold up to 30 (base capacity)

      const hasCapacityUpgrade = this._hasItem('Capacity Upgrade Shop');
      if (hasCapacityUpgrade === undefined) return undefined;
      return hasCapacityUpgrade; // True if has upgrade, false otherwise.
    }
  }

  can_shoot_arrows(count = 0) {
    const hasBow = this._hasItem('Bow');
    const hasSilverBow = this._hasItem('Silver Bow');

    if (hasBow === undefined || hasSilverBow === undefined) return undefined;
    if (hasBow === false && hasSilverBow === false) return false;
    // At least one bow is present or its status is unknown (if one is true, this path is skipped)

    let isRetroBowSetting = this._getSetting('retro_bow');
    let isRetroBowFlag = this._hasFlag('retro_bow');

    if (isRetroBowSetting === undefined && isRetroBowFlag === undefined)
      return undefined;

    const isRetroBow =
      isRetroBowSetting === true ||
      (isRetroBowSetting === undefined && isRetroBowFlag === true);

    if (isRetroBow) {
      // If retro bow status is definitively true
      const canBuySingleArrow = this.can_buy('Single Arrow');
      if (canBuySingleArrow === undefined) return undefined;
      return canBuySingleArrow; // True if can buy, false otherwise
    }
    // If isRetroBow is false (or not definitively true and we fell through)
    if (
      isRetroBowSetting === false ||
      (isRetroBowSetting === undefined && isRetroBowFlag === false)
    ) {
      return this.can_hold_arrows(count); // This will propagate undefined if necessary
    }

    // If retro bow status itself is unknown (e.g. setting is undefined AND flag is undefined)
    // This case should have been caught by the (isRetroBowSetting === undefined && isRetroBowFlag === undefined) check earlier
    // but as a fallback, if somehow isRetroBow is not strictly true/false:
    return undefined;
  }

  has_triforce_pieces() {
    const requiredCount = this._getStateValue('treasureHuntRequired');
    if (requiredCount === undefined) return undefined; // Critical state value missing

    const triforceCount = this._countItem('Triforce Piece');
    if (triforceCount === undefined) return undefined;

    const powerStarCount = this._countItem('Power Star');
    if (powerStarCount === undefined) return undefined;

    // If requiredCount is null (but not undefined), treat as 0 or handle as per game logic for snapshot.
    // Original worker logic defaulted to 0 if null/undefined. For snapshot, if it's null, let's use 0.
    return (
      triforceCount + powerStarCount >=
      (requiredCount === null ? 0 : requiredCount)
    );
  }

  has_crystals(count) {
    const requiredCount = count === undefined ? 7 : count;
    const crystalCount = this._countGroup('Crystals');
    if (crystalCount === undefined) return undefined;
    return crystalCount >= requiredCount;
  }

  can_lift_rocks() {
    const hasPowerGlove = this._hasItem('Power Glove');
    const hasTitansMitts = this._hasItem('Titans Mitts');

    if (hasPowerGlove === true || hasTitansMitts === true) return true;
    if (hasPowerGlove === undefined || hasTitansMitts === undefined)
      return undefined;
    return false; // Both are definitively false
  }

  can_lift_heavy_rocks() {
    const hasTitansMitts = this._hasItem('Titans Mitts');
    // This directly returns true, false, or undefined based on _hasItem result.
    return hasTitansMitts;
  }

  bottle_count() {
    const bottleLimitPath = 'difficultyRequirements.progressive_bottle_limit';
    let bottleLimit = this._getStateValue(bottleLimitPath);
    if (bottleLimit === undefined) return undefined; // Needs to be defined for snapshot
    if (bottleLimit === null) bottleLimit = 4; // Default if explicitly null

    const bottleItemGroupCount = this._countGroup('Bottles');
    if (bottleItemGroupCount === undefined) return undefined;

    return Math.min(bottleLimit, bottleItemGroupCount);
  }

  heart_count() {
    const bossHeartLimitPath =
      'difficultyRequirements.boss_heart_container_limit';
    const heartPieceLimitPath = 'difficultyRequirements.heart_piece_limit';

    let bossHeartLimit = this._getStateValue(bossHeartLimitPath);
    if (bossHeartLimit === undefined) return undefined;
    if (bossHeartLimit === null) bossHeartLimit = 20; // Default if explicitly null

    let heartPieceLimit = this._getStateValue(heartPieceLimitPath);
    if (heartPieceLimit === undefined) return undefined;
    if (heartPieceLimit === null) heartPieceLimit = 80; // Default if explicitly null

    const bossHeartItemCount = this._countItem('Boss Heart Container');
    if (bossHeartItemCount === undefined) return undefined;

    const sanctuaryHeartItemCount = this._countItem(
      'Sanctuary Heart Container'
    );
    if (sanctuaryHeartItemCount === undefined) return undefined;

    const pieceOfHeartItemCount = this._countItem('Piece of Heart');
    if (pieceOfHeartItemCount === undefined) return undefined;

    const bossHearts = Math.min(bossHeartItemCount, bossHeartLimit);
    const sanctuaryHearts = sanctuaryHeartItemCount;
    const pieceHearts = Math.floor(
      Math.min(pieceOfHeartItemCount, heartPieceLimit) / 4
    );

    return bossHearts + sanctuaryHearts + pieceHearts + 3;
  }

  has_hearts(count) {
    const currentHeartCount = this.heart_count();
    if (currentHeartCount === undefined) return undefined;
    return currentHeartCount >= count;
  }

  can_extend_magic(smallmagic = 16, fullrefill = false) {
    let basemagic = 8;
    const magicUpgrade1_4 = this._hasItem('Magic Upgrade (1/4)');
    const magicUpgrade1_2 = this._hasItem('Magic Upgrade (1/2)');

    if (magicUpgrade1_4 === undefined || magicUpgrade1_2 === undefined)
      return undefined;

    if (magicUpgrade1_4 === true) {
      basemagic = 32;
    } else if (magicUpgrade1_2 === true) {
      basemagic = 16;
    }
    // If both are false, basemagic remains 8. If any is undefined, we already returned.

    const canBuyGreen = this.can_buy_unlimited('Green Potion');
    const canBuyBlue = this.can_buy_unlimited('Blue Potion');

    // If we can't determine if potions are buyable, and they are needed, result is undefined.
    // However, if even one is true, the condition (canBuyGreen || canBuyBlue) is true.
    // If both are false, it's false. If one is true and other undef, it's true.
    // If one is false and other undef, it's undef.
    // If both are undef, it's undef.
    let canAccessPotions;
    if (canBuyGreen === true || canBuyBlue === true) {
      canAccessPotions = true;
    } else if (canBuyGreen === undefined || canBuyBlue === undefined) {
      return undefined; // Cannot definitively say true, and one is unknown
    } else {
      canAccessPotions = false; // Both are definitively false
    }

    if (canAccessPotions) {
      const numBottles = this.bottle_count();
      if (numBottles === undefined) return undefined;

      const functionalitySetting = this._getSetting('item_functionality');
      if (functionalitySetting === undefined) return undefined;
      const functionality = functionalitySetting || 'normal'; // Default to normal if null

      if (functionality === 'hard' && !fullrefill) {
        basemagic += Math.floor(basemagic * 0.5 * numBottles);
      } else if (functionality === 'expert' && !fullrefill) {
        basemagic += Math.floor(basemagic * 0.25 * numBottles);
      } else {
        basemagic += basemagic * numBottles;
      }
    }
    return basemagic >= smallmagic;
  }

  has_sword() {
    const progressive = this._hasItem('Progressive Sword');
    const fighter = this._hasItem('Fighters Sword');
    const master = this._hasItem('Master Sword');
    const tempered = this._hasItem('Tempered Sword');
    const golden = this._hasItem('Golden Sword');

    if (
      progressive === true ||
      fighter === true ||
      master === true ||
      tempered === true ||
      golden === true
    ) {
      return true;
    }
    if (
      progressive === undefined ||
      fighter === undefined ||
      master === undefined ||
      tempered === undefined ||
      golden === undefined
    ) {
      return undefined;
    }
    return false; // All are definitively false
  }

  can_bomb_or_bonk() {
    const canUseBombsResult = this.can_use_bombs();
    const hasPegasusBoots = this._hasItem('Pegasus Boots');

    if (canUseBombsResult === true || hasPegasusBoots === true) return true;
    if (canUseBombsResult === undefined || hasPegasusBoots === undefined)
      return undefined;
    return false; // Both are definitively false
  }

  can_activate_crystal_switch() {
    const options = [
      this.can_use_bombs(),
      this._hasItem('Boots'), // Assuming 'Boots' is Pegasus Boots for bonking
      this.has_sword(),
      this._hasItem('Hammer'),
      this.can_shoot_arrows(),
      this._hasItem('Fire Rod'),
      this._hasItem('Ice Rod'),
      this._hasItem('Cane of Somaria'),
      this._hasItem('Cane of Byrna'),
    ];

    if (options.some((opt) => opt === true)) return true;
    if (options.some((opt) => opt === undefined)) return undefined;
    return false; // All options are definitively false
  }

  can_kill_most_things(count = 5) {
    const methodResults = [
      this.has_sword(),
      this._hasItem('Hammer'),
      this.can_shoot_arrows(),
      this.can_use_bombs(),
      this._hasItem('Fire Rod'),
      this._hasItem('Ice Rod'),
      this._hasItem('Cane of Somaria'),
      this._hasItem('Cane of Byrna'),
    ];

    let undefinedCount = 0;
    let trueCount = 0;

    for (const result of methodResults) {
      if (result === true) {
        trueCount++;
      } else if (result === undefined) {
        undefinedCount++;
      }
    }

    if (trueCount >= count) return true;
    // If we haven't met the count, but adding unknowns *could* meet it, then it's undefined
    if (trueCount + undefinedCount >= count) return undefined;
    // Otherwise, it's definitively false
    return false;
  }

  can_get_good_bee() {
    // For snapshot, is_not_bunny requires a valid region name or object.
    // Passing null will likely result in `is_not_bunny` returning undefined.
    // If a rule uses this without a region context, it will be unknown.
    // This is acceptable; the rule should provide region if needed for definitive answer.
    const isNotBunnyResult = this.is_not_bunny(null);
    const hasNet = this._hasItem('Bug Catching Net');
    const hasBottle = this._hasItem('Bottle'); // or this._countItemGroup('Bottles') > 0, simplified for now

    if (isNotBunnyResult === false || hasNet === false || hasBottle === false)
      return false;
    if (
      isNotBunnyResult === undefined ||
      hasNet === undefined ||
      hasBottle === undefined
    )
      return undefined;
    return true; // All are definitively true
  }

  can_retrieve_tablet() {
    const isSwordless = this._hasFlag('swordless');
    if (isSwordless === undefined) return undefined;

    const hasBook = this._hasItem('Book of Mudora');
    if (hasBook === false) return false;
    if (hasBook === undefined) return undefined;

    if (isSwordless) {
      const hasHammer = this._hasItem('Hammer');
      if (hasHammer === undefined) return undefined;
      return hasHammer;
    }

    const hasBeamSword = this.has_beam_sword();
    if (hasBeamSword === undefined) return undefined;
    return hasBeamSword;
  }

  has_beam_sword() {
    const hasMaster = this._hasItem('Master Sword');
    const hasTempered = this._hasItem('Tempered Sword');
    const hasGolden = this._hasItem('Golden Sword');

    if (hasMaster === true || hasTempered === true || hasGolden === true)
      return true;
    if (
      hasMaster === undefined ||
      hasTempered === undefined ||
      hasGolden === undefined
    )
      return undefined;
    return false;
  }

  has_melee_weapon() {
    const hasSwordResult = this.has_sword();
    const hasHammer = this._hasItem('Hammer');

    if (hasSwordResult === true || hasHammer === true) return true;
    if (hasSwordResult === undefined || hasHammer === undefined)
      return undefined;
    return false;
  }

  has_fire_source() {
    const hasFireRod = this._hasItem('Fire Rod');
    const hasLamp = this._hasItem('Lamp');

    if (hasFireRod === true || hasLamp === true) return true;
    if (hasFireRod === undefined || hasLamp === undefined) return undefined;
    return false;
  }

  can_melt_things() {
    const hasFireRod = this._hasItem('Fire Rod');
    if (hasFireRod === true) return true;
    // If Fire Rod is definitively false or undefined, check Bombos path

    const hasBombos = this._hasItem('Bombos');
    const hasSwordResult = this.has_sword();

    // Bombos path: (hasBombos && hasSwordResult)
    // If hasFireRod is true, we don't reach here.
    // If hasFireRod is false:
    //   - If (hasBombos === true && hasSwordResult === true), return true.
    //   - If (hasBombos === false || hasSwordResult === false) and no undefineds in this path, return false.
    //   - If any of (hasBombos, hasSwordResult) for this path is undefined, return undefined.
    // If hasFireRod is undefined:
    //   - We must also consider the Bombos path status to determine final undefined.
    //   - If Bombos path is true: result is true (either FireRod or Bombos path works)
    //   - If Bombos path is false: result is undefined (FireRod unknown, Bombos false)
    //   - If Bombos path is undefined: result is undefined (FireRod unknown, Bombos unknown)

    if (hasFireRod === undefined) {
      // Fire rod status is unknown. If Bombos path is definitively true, then overall true.
      if (hasBombos === true && hasSwordResult === true) return true;
      return undefined; // Otherwise, overall result is unknown due to Fire Rod.
    }

    // At this point, hasFireRod is definitively false.
    if (hasBombos === false || hasSwordResult === false) return false;
    if (hasBombos === undefined || hasSwordResult === undefined)
      return undefined;
    return true; // Both Bombos and Sword are true, and Fire Rod was false.
  }

  has_misery_mire_medallion() {
    const requiredMedallionName = this._getSetting('mm_medallion');

    if (requiredMedallionName === undefined) return undefined; // Setting itself is unknown
    if (!requiredMedallionName || requiredMedallionName === 'Unknown') {
      // Setting is known, but indicates no specific medallion or an unusable value.
      return false;
    }
    // Setting has a specific medallion name, check if we have it.
    return this._hasItem(requiredMedallionName); // Propagates true/false/undefined from _hasItem
  }

  has_turtle_rock_medallion() {
    const requiredMedallionName = this._getSetting('tr_medallion');

    if (requiredMedallionName === undefined) return undefined; // Setting itself is unknown
    if (!requiredMedallionName || requiredMedallionName === 'Unknown') {
      return false;
    }
    return this._hasItem(requiredMedallionName); // Propagates true/false/undefined from _hasItem
  }

  can_boots_clip_lw() {
    const hasBoots = this._hasItem('Pegasus Boots');
    if (hasBoots === false) return false;
    // If hasBoots is true or undefined, proceed

    const gameMode = this._getGameMode();
    if (gameMode === undefined) return undefined; // Cannot determine if gameMode is unknown

    if (gameMode === 'inverted') {
      const hasPearl = this._hasItem('Moon Pearl');
      if (hasBoots === undefined || hasPearl === undefined) return undefined;
      return hasBoots && hasPearl; // Returns true if both true, false if pearl is false (boots true)
    }
    // Not inverted: boots status (true/undefined) is the result
    return hasBoots;
  }

  can_boots_clip_dw() {
    const hasBoots = this._hasItem('Pegasus Boots');
    if (hasBoots === false) return false;
    // If hasBoots is true or undefined, proceed

    const gameMode = this._getGameMode();
    if (gameMode === undefined) return undefined;

    if (gameMode !== 'inverted') {
      // Standard or other modes entering DW
      const hasPearl = this._hasItem('Moon Pearl');
      if (hasBoots === undefined || hasPearl === undefined) return undefined;
      return hasBoots && hasPearl;
    }
    // Inverted mode: boots status (true/undefined) is the result
    return hasBoots;
  }

  can_get_glitched_speed_dw() {
    const hasBoots = this._hasItem('Pegasus Boots');
    if (hasBoots === false) return false;

    const hasHookshot = this._hasItem('Hookshot');
    const hasSwordResult = this.has_sword();

    let hasHookshotOrSword;
    if (hasHookshot === true || hasSwordResult === true) {
      hasHookshotOrSword = true;
    } else if (hasHookshot === undefined || hasSwordResult === undefined) {
      hasHookshotOrSword = undefined;
    } else {
      hasHookshotOrSword = false;
    }

    if (hasHookshotOrSword === false) return false;
    // At this point, hasBoots is true/undefined, and hasHookshotOrSword is true/undefined

    const gameMode = this._getGameMode();
    if (gameMode === undefined) return undefined;

    if (gameMode !== 'inverted') {
      // Standard or other modes in DW
      const hasPearl = this._hasItem('Moon Pearl');
      if (hasPearl === false) return false;
      // If any of (hasBoots, hasHookshotOrSword, hasPearl) is undefined, return undefined
      if (
        hasBoots === undefined ||
        hasHookshotOrSword === undefined ||
        hasPearl === undefined
      )
        return undefined;
      return true; // All conditions met and are true
    } else {
      // Inverted mode: Moon Pearl not required
      if (hasBoots === undefined || hasHookshotOrSword === undefined)
        return undefined;
      return true; // Boots and (Hookshot or Sword) are true
    }
  }

  _has_specific_key_count(keyName, requiredCount = 1) {
    const currentCount = this._countItem(keyName);
    if (currentCount === undefined) return undefined;
    return currentCount >= requiredCount;
  }

  location_item_name(locationName) {
    // This will call _getLocationItem on GameSnapshotHelpers, which then calls
    // this.snapshot.getLocationItem(locationName) (defined in stateManagerProxy.js interface)
    const itemInfo = this._getLocationItem(locationName);
    if (itemInfo === undefined) return undefined; // Data not available in snapshot
    if (itemInfo === null) return null; // Location known, but no item / explicitly null by underlying method

    // Expect itemInfo to be [itemName, playerNumber] or conform to { name, player }
    // The old helper returned [name, player]. Let's stick to that for consistency from this helper.
    if (Array.isArray(itemInfo) && itemInfo.length === 2) {
      return itemInfo;
    }
    if (
      itemInfo &&
      typeof itemInfo.name === 'string' &&
      typeof itemInfo.player === 'number'
    ) {
      return [itemInfo.name, itemInfo.player];
    }
    // console.warn('[ALTTPSnapshotHelpers] location_item_name: Unexpected itemInfo format or null.', itemInfo);
    return undefined; // Data format issue or truly not found
  }

  item_name_in_location_names(item, arg2, arg3) {
    let player;
    let location_name_player_pairs;

    // Determine player and location_name_player_pairs based on arguments
    const currentPlayerSlot = this._getPlayerSlot(); // Get snapshot's current player slot
    if (
      currentPlayerSlot === undefined &&
      typeof arg2 !== 'number' &&
      Array.isArray(arg2) &&
      arg3 === undefined
    ) {
      // Player slot is unknown and cannot be determined from args, so result is unknown
      // console.warn('[ALTTPSnapshotHelpers item_name_in_location_names] Player slot unknown and not provided.');
      return undefined;
    }

    if (Array.isArray(arg2) && arg3 === undefined) {
      location_name_player_pairs = arg2;
      player = currentPlayerSlot; // Default to snapshot's player if not overridden
    } else {
      player = typeof arg2 === 'number' ? arg2 : currentPlayerSlot;
      location_name_player_pairs = arg3;
    }

    if (player === undefined) {
      // Final check if player could not be resolved
      // console.warn('[ALTTPSnapshotHelpers item_name_in_location_names] Player could not be resolved.');
      return undefined;
    }

    if (typeof item !== 'string' || !item) {
      // console.warn('[ALTTPSnapshotHelpers item_name_in_location_names] Invalid item name provided.', item);
      return false; // Or undefined, but false seems more aligned if item name is fundamentally wrong
    }

    if (!Array.isArray(location_name_player_pairs)) {
      // console.warn('[ALTTPSnapshotHelpers item_name_in_location_names] location_name_player_pairs is not an array.', location_name_player_pairs);
      return false; // Or undefined
    }

    let anyLocationItemUnknown = false;
    for (const pair of location_name_player_pairs) {
      if (
        !Array.isArray(pair) ||
        pair.length !== 2 ||
        typeof pair[0] !== 'string'
      ) {
        // console.warn('[ALTTPSnapshotHelpers item_name_in_location_names] Invalid pair in list:', pair);
        continue;
      }
      const [locName, locPlayerIgnored] = pair;

      const itemAtLocation = this.location_item_name(locName); // Returns [name, ownerPlayer] or null or undefined

      if (itemAtLocation === undefined) {
        anyLocationItemUnknown = true; // One of the locations has an unknown item, result might be undefined
        continue; // Can't make a decision for this one, but others might be true
      }

      if (itemAtLocation === null) {
        // Location known, no item, so this one isn't a match.
        continue;
      }

      // itemAtLocation is [itemName, itemOwnerPlayer]
      if (itemAtLocation[0] === item && itemAtLocation[1] === player) {
        return true; // Found a definitive match
      }
    }

    if (anyLocationItemUnknown) {
      return undefined; // No definitive true found, and at least one location item was unknown
    }
    return false; // No match found, and all location items were known (not undefined)
  }

  has_any(items) {
    if (!Array.isArray(items)) {
      // console.warn('[ALTTPSnapshotHelpers has_any] Items argument is not an array:', items);
      return false; // Or undefined, but non-array input is likely a rule-writer error.
    }

    let anyItemStatusUnknown = false;
    for (const item of items) {
      if (typeof item !== 'string') {
        // console.warn('[ALTTPSnapshotHelpers has_any] Invalid item name in list:', item);
        continue;
      }
      const count = this._countItem(item);
      if (count === undefined) {
        anyItemStatusUnknown = true;
        // Don't return undefined yet; another item might be definitively true.
        continue;
      }
      if (count > 0) {
        return true; // Found one, definitively true.
      }
    }

    if (anyItemStatusUnknown) {
      return undefined; // No item was definitively possessed, and at least one item's status was unknown.
    }
    return false; // All items checked, none possessed, and all counts were known (not undefined).
  }

  GanonDefeatRule() {
    const isSwordless = this._hasFlag('swordless');
    if (isSwordless === undefined) return undefined;

    if (isSwordless === true) {
      const hasHammer = this._hasItem('Hammer');
      const hasFireSourceResult = this.has_fire_source();
      const hasSilverBow = this._hasItem('Silver Bow');
      const canShootArrowsResult = this.can_shoot_arrows();

      if (
        hasHammer === false ||
        hasFireSourceResult === false ||
        hasSilverBow === false ||
        canShootArrowsResult === false
      )
        return false;
      if (
        hasHammer === undefined ||
        hasFireSourceResult === undefined ||
        hasSilverBow === undefined ||
        canShootArrowsResult === undefined
      )
        return undefined;
      return true; // All true
    }

    // Swordless is definitively false
    const canHurt = this.has_beam_sword();
    const hasFireSource = this.has_fire_source();

    if (canHurt === undefined || hasFireSource === undefined) return undefined;
    if (canHurt === false || hasFireSource === false) return false;
    // const common = true at this point, or we would have returned.

    const glitchesRequiredSetting = this._getSetting('glitches_required');
    if (glitchesRequiredSetting === undefined) return undefined;
    const glitchesRequired = glitchesRequiredSetting || 'no_glitches'; // Default if null

    if (glitchesRequired !== 'no_glitches') {
      const hasTempered = this._hasItem('Tempered Sword');
      const hasGolden = this._hasItem('Golden Sword');
      const hasSilverBow = this._hasItem('Silver Bow');
      const canShoot = this.can_shoot_arrows();
      const hasLamp = this._hasItem('Lamp');
      const canExtend = this.can_extend_magic(12);

      const silverBowPath = hasSilverBow === true && canShoot === true;
      const silverBowPathUndefined =
        hasSilverBow === undefined || canShoot === undefined;

      if (
        hasTempered === true ||
        hasGolden === true ||
        silverBowPath ||
        hasLamp === true ||
        canExtend === true
      )
        return true;

      if (
        hasTempered === undefined ||
        hasGolden === undefined ||
        silverBowPathUndefined ||
        hasLamp === undefined ||
        canExtend === undefined
      )
        return undefined;

      return false; // All paths are definitively false
    } else {
      // No glitches
      const hasSilverBow = this._hasItem('Silver Bow');
      const canShoot = this.can_shoot_arrows();

      if (hasSilverBow === false || canShoot === false) return false;
      if (hasSilverBow === undefined || canShoot === undefined)
        return undefined;
      return true; // Both true (and common was true)
    }
  }

  basement_key_rule() {
    const keyRatItemTuple = this.location_item_name(
      'Sewers - Key Rat Key Drop'
    );

    if (keyRatItemTuple === undefined) return undefined; // Cannot determine if location item is unknown

    let keyRatHasKey = false;
    if (keyRatItemTuple === null) {
      // Location known, but no item. So, Key Rat does not have the key.
      keyRatHasKey = false;
    } else if (Array.isArray(keyRatItemTuple) && keyRatItemTuple.length === 2) {
      // Assuming player 1 for snapshot context, or get current player if available on snapshot.
      // this._getPlayerSlot() might be suitable if the rule is always for the current UI player.
      const currentPlayerSlot = this._getPlayerSlot() || 1; // Default to 1 if not available
      keyRatHasKey =
        keyRatItemTuple[0] === 'Small Key (Hyrule Castle)' &&
        keyRatItemTuple[1] === currentPlayerSlot;
    } else {
      // Unexpected format from location_item_name, treat as unknown for safety
      return undefined;
    }

    const requiredKeys = keyRatHasKey ? 2 : 3;
    return this._has_specific_key_count(
      'Small Key (Hyrule Castle)',
      requiredKeys
    );
    // This will propagate undefined if _has_specific_key_count returns undefined.
  }

  cross_peg_bridge() {
    const hasHammer = this._hasItem('Hammer');
    const hasPearl = this._hasItem('Moon Pearl');

    if (hasHammer === false || hasPearl === false) return false;
    if (hasHammer === undefined || hasPearl === undefined) return undefined;
    return true; // Both are true
  }
}
