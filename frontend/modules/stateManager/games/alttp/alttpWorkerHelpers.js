import { GameWorkerHelpers } from '../../helpers/gameWorkerHelpers.js';

export class ALTTPWorkerHelpers extends GameWorkerHelpers {
  constructor(manager) {
    super(manager);
    // console.log('[ALTTPWorkerHelpers] Initialized.');
    // ALTTP-specific entities can be initialized here if needed directly on the helper
    this.entities = {
      old_man: {
        // This logic now uses the inherited _isLocationAccessible
        can_reach: () => this._isLocationAccessible('Old Man'),
      },
      // Add other ALTTP-specific entities/objects that rules might refer to by name
    };
  }

  is_not_bunny(region) {
    if (this._hasItem('Moon Pearl')) {
      return true;
    }
    const regionData =
      typeof region === 'string' ? this._getRegionData(region) : region;
    if (!regionData) {
      // In worker context, if region data is not found, it implies something is wrong
      // or the rule is malformed for this context. Defaulting to true might be too lenient.
      // Consider if this case should be an error or a specific false if region is mandatory.
      // For now, matching old ALTTPHelpers general tendency to be permissive in worker if data missing.
      console.warn(
        `[ALTTPWorkerHelpers] is_not_bunny: Region data not found for region:`,
        region
      );
      return true;
    }
    const gameMode = this._getGameMode();
    const isInverted = gameMode === 'inverted';
    // Ensure regionData has the expected properties
    if (
      typeof regionData.is_dark_world !== 'boolean' ||
      typeof regionData.is_light_world !== 'boolean'
    ) {
      console.warn(
        `[ALTTPWorkerHelpers] is_not_bunny: Region data for ${
          regionData.name || region
        } missing is_dark_world/is_light_world properties.`
      );
      return true; // Or false, depending on desired strictness for malformed region data in worker
    }
    return isInverted ? regionData.is_dark_world : regionData.is_light_world;
  }

  // Forward declaration or placeholder if can_buy is complex and defined later
  // For now, assuming it will be available on this class when can_use_bombs is called.
  // If can_buy is also being migrated now, ensure its worker version is defined.
  can_buy(item) {
    const shops = this._getShops() || [];
    for (const shop of shops) {
      if (!shop.region_name) continue;
      if (!this._isRegionReachable(shop.region_name)) {
        continue;
      }
      if (shop.inventory) {
        for (const shopItem of shop.inventory) {
          // Python has shop.has(item), JS equivalent based on old code: check max !== 0
          if (shopItem.item === item && shopItem.max !== 0) {
            return true;
          }
        }
      }
    }
    // ALTTP-specific fallback
    if (item === 'Single Arrow') {
      return this._isRegionReachable('Kakariko Shop');
    }
    return false;
  }

  can_use_bombs() {
    const bombless = this._hasFlag('bombless_start');
    const shuffleUpgrades = this._getSetting('shuffle_capacity_upgrades');

    // Start with base bomb count
    let bombs = bombless ? 0 : 10;

    // Add bomb upgrades
    bombs += this._countItem('Bomb Upgrade (+5)') * 5;
    bombs += this._countItem('Bomb Upgrade (+10)') * 10;
    bombs += this._countItem('Bomb Upgrade (50)') * 50;

    // Bomb Upgrade (+5) beyond the 6th gives +10 (Python logic)
    const upgrade5Count = this._countItem('Bomb Upgrade (+5)');
    bombs += Math.max(0, (upgrade5Count - 6) * 10);

    // If capacity upgrades are NOT shuffled and we have Capacity Upgrade Shop, add 40
    if (!shuffleUpgrades && this._hasItem('Capacity Upgrade Shop')) {
      bombs += 40;
    }

    return bombs >= 1; // Need at least 1 bomb to use bombs
  }

  can_bomb_clip(region) {
    return (
      this.can_use_bombs() &&
      this.is_not_bunny(region) &&
      this._hasItem('Pegasus Boots')
    );
  }

  can_buy_unlimited(item) {
    const shops = this._getShops() || []; // _getShops() is from GameWorkerHelpers
    for (const shop of shops) {
      if (!shop.region_name) continue; // Skip shops without a region defined

      // Check if shop region is reachable
      if (!this._isRegionReachable(shop.region_name)) {
        continue;
      }

      if (shop.inventory) {
        for (const shopItem of shop.inventory) {
          // In ALTTP, unlimited often means max is 0 or a very high number (e.g., > 99 based on old JS)
          // Python has shop.has_unlimited(item)
          // We need to inspect how shop items are structured to check for "unlimited"
          // Assuming shopItem.max === 0 or a similar indicator for unlimited for now.
          if (
            shopItem.item === item &&
            (shopItem.max === 0 || shopItem.max > 99)
          ) {
            return true;
          }
        }
      }
    }
    // ALTTP-specific fallback for potions
    if (item === 'Green Potion' || item === 'Blue Potion') {
      return this._isRegionReachable('Potion Shop');
    }
    return false;
  }

  can_hold_arrows(quantity = 0) {
    if (this._getSetting('shuffle_capacity_upgrades')) {
      if (quantity === 0) {
        return true;
      }

      let arrows = 30; // Default starting capacity. TODO: check if this can vary by settings

      if (this._hasItem('Arrow Upgrade (70)')) {
        arrows = 70;
      } else {
        arrows += this._countItem('Arrow Upgrade (+5)') * 5;
        arrows += this._countItem('Arrow Upgrade (+10)') * 10;

        // ALTTP specific: Arrow Upgrade (+5) beyond the 6th gives +10
        // This logic was present in the original helpers-old.js
        const arrowUpgrade5Count = this._countItem('Arrow Upgrade (+5)');
        const extraUpgrades = Math.max(0, arrowUpgrade5Count - 6);
        arrows += extraUpgrades * 10; // Each extra +5 effectively becomes a +10 in total contribution past the 6th
      }
      return Math.min(70, arrows) >= quantity; // Max 70 arrows in ALTTP
    }

    // Default case - non-shuffled capacity
    return (
      quantity <= 30 || this._hasItem('Capacity Upgrade Shop') // TODO: Verify 'Capacity Upgrade Shop' is the correct item name
    );
  }

  can_shoot_arrows(count = 0) {
    const hasBow = this._hasItem('Bow') || this._hasItem('Silver Bow');

    if (!hasBow) return false;

    // Check retro bow flag or setting
    // Prioritize gameSettings for retro_bow, then state flags if defined.
    let isRetroBow = this._getSetting('retro_bow');
    if (isRetroBow === undefined) {
      // if not in gameSettings, check state flags
      isRetroBow = this._hasFlag('retro_bow');
    }

    if (isRetroBow) {
      // In retro bow mode, arrows are consumed if you can buy them.
      // hasBow is already true here.
      return this.can_buy('Single Arrow');
    }

    // Standard arrow logic: has bow and can hold enough arrows.
    return this.can_hold_arrows(count);
  }

  has_triforce_pieces() {
    // Get required count from state.treasureHuntRequired
    const requiredCount = this._getStateValue('treasureHuntRequired');
    // Assuming if treasureHuntRequired is not set, it defaults to a value (e.g. 0 or a game default)
    // For worker, if it's critical and missing, it might be an error. Let's assume it's available or defaults.
    // If requiredCount could be undefined/null from _getStateValue and that's an issue, add handling.

    const triforceCount = this._countItem('Triforce Piece');
    const powerStarCount = this._countItem('Power Star'); // Assuming Power Star is an ALTTP item

    return triforceCount + powerStarCount >= (requiredCount || 0); // Default required to 0 if not found
  }

  has_crystals(count) {
    const requiredCount = count === undefined ? 7 : count; // Default to 7 if count is not provided
    return this._countItemGroup('Crystals') >= requiredCount;
  }

  can_lift_rocks() {
    return this._hasItem('Power Glove') || this._hasItem('Titans Mitts');
  }

  can_lift_heavy_rocks() {
    return this._hasItem('Titans Mitts');
  }

  bottle_count() {
    const bottleLimitPath = 'difficultyRequirements.progressive_bottle_limit';
    const bottleLimit = this._getStateValue(bottleLimitPath) || 4; // Default to 4 if not set
    return Math.min(bottleLimit, this._countItemGroup('Bottles'));
  }

  heart_count() {
    const bossHeartLimitPath =
      'difficultyRequirements.boss_heart_container_limit';
    const heartPieceLimitPath = 'difficultyRequirements.heart_piece_limit';

    // Provide defaults if these settings are not found, common for flexible settings
    const bossHeartLimit =
      this._getStateValue(bossHeartLimitPath) === undefined
        ? 20
        : this._getStateValue(bossHeartLimitPath);
    const heartPieceLimit =
      this._getStateValue(heartPieceLimitPath) === undefined
        ? 80
        : this._getStateValue(heartPieceLimitPath);

    const bossHearts = Math.min(
      this._countItem('Boss Heart Container'),
      bossHeartLimit
    );
    const sanctuaryHearts = this._countItem('Sanctuary Heart Container');
    const pieceHearts = Math.floor(
      Math.min(this._countItem('Piece of Heart'), heartPieceLimit) / 4
    );

    return bossHearts + sanctuaryHearts + pieceHearts + 3; // Starting 3 hearts
  }

  has_hearts(count) {
    return this.heart_count() >= count;
  }

  can_extend_magic(smallmagic = 16, fullrefill = false) {
    let basemagic = 8;
    if (this._hasItem('Magic Upgrade (1/4)')) {
      basemagic = 32;
    } else if (this._hasItem('Magic Upgrade (1/2)')) {
      basemagic = 16;
    }

    if (
      this.can_buy_unlimited('Green Potion') ||
      this.can_buy_unlimited('Blue Potion')
    ) {
      const numBottles = this.bottle_count();
      const functionality = this._getSetting('item_functionality') || 'normal';

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
    return (
      this._hasItem('Progressive Sword') ||
      this._hasItem('Fighters Sword') ||
      this._hasItem('Master Sword') ||
      this._hasItem('Tempered Sword') ||
      this._hasItem('Golden Sword')
    );
  }

  can_bomb_or_bonk() {
    // In ALTTP, bonking is usually associated with Pegasus Boots dash
    return this.can_use_bombs() || this._hasItem('Pegasus Boots');
  }

  can_activate_crystal_switch() {
    // Based on original logic, assuming direct item checks or existing helpers suffice
    return (
      this.can_use_bombs() ||
      this._hasItem('Boots') || // Pegasus Boots for bonking
      this.has_sword() ||
      this._hasItem('Hammer') ||
      this.can_shoot_arrows() || // Implies bow
      this._hasItem('Fire Rod') ||
      this._hasItem('Ice Rod') ||
      this._hasItem('Cane of Somaria') ||
      this._hasItem('Cane of Byrna')
    );
  }

  can_kill_most_things(count = 5) {
    // Count represents number of distinct killing methods available
    let methods = 0;
    if (this.has_sword()) methods++;
    if (this._hasItem('Hammer')) methods++;
    if (this.can_shoot_arrows()) methods++; // Bow and arrows
    if (this.can_use_bombs()) methods++;
    // Rods and Canes are often considered killing methods too
    if (this._hasItem('Fire Rod')) methods++;
    if (this._hasItem('Ice Rod')) methods++;
    if (this._hasItem('Cane of Somaria')) methods++; // Depending on game/settings, Somaria can kill
    if (this._hasItem('Cane of Byrna')) methods++; // Byrna definitely can

    return methods >= count;
  }

  can_get_good_bee() {
    // "Good Bee" or Golden Bee is usually caught with net, implies having a bottle too.
    // is_not_bunny is often a prerequisite for actions in certain regions.
    // The original logic checked for region, but here we assume if the action is possible generally.
    // If region context becomes important, it needs to be passed.
    return (
      this._hasItem('Bug Catching Net') &&
      this._hasItem('Bottle') && // Or countGroup('Bottles') > 0
      this.is_not_bunny(null) // Pass null or a generic region if is_not_bunny needs one but context is general
      // TODO: Review if is_not_bunny(null) is the correct approach or if region needs to be passed.
      // For now, assuming it will default to a behavior similar to not being in a specific restrictive region.
    );
  }

  can_retrieve_tablet() {
    const isSwordless = this._hasFlag('swordless');
    if (isSwordless) {
      return this._hasItem('Book of Mudora') && this._hasItem('Hammer');
    }
    return this._hasItem('Book of Mudora') && this.has_beam_sword();
  }

  has_beam_sword() {
    // Original logic just checked for MS, TS, GS. It did not account for full health requirement.
    // Assuming this helper is about possessing a sword *capable* of beams, not if beams are currently active.
    return (
      this._hasItem('Master Sword') ||
      this._hasItem('Tempered Sword') ||
      this._hasItem('Golden Sword')
    );
  }

  has_melee_weapon() {
    return this.has_sword() || this._hasItem('Hammer');
  }

  has_fire_source() {
    return this._hasItem('Fire Rod') || this._hasItem('Lamp');
  }

  can_melt_things() {
    // Typically for melting ice, e.g., Ice Palace.
    // Fire Rod is primary. Bombos with a sword is an alternative.
    return (
      this._hasItem('Fire Rod') || (this._hasItem('Bombos') && this.has_sword()) // Bombos Medallion and any sword
    );
  }

  has_misery_mire_medallion() {
    const requiredMedallionName = this._getSetting('mm_medallion'); // e.g., 'Bombos', 'Ether', 'Quake'
    if (!requiredMedallionName || requiredMedallionName === 'Unknown') {
      // If the setting is not defined or explicitly unknown, it implies no specific medallion is required,
      // or the logic should be handled by the rule engine based on this outcome.
      // For a direct check, if no medallion is set, it might mean it can't be satisfied by item check alone.
      // However, ALTTP typically defaults or requires one. Let's assume if not set, it's like not having the req.
      // Alternatively, this could return true if the game logic implies no medallion needed if setting is 'None' or similar.
      // Based on Python: `state.has(state.multiworld.worlds[player].required_medallions[0], player)`
      // This implies the setting *must* point to a valid item name. If not, it's effectively false.
      return false;
    }
    return this._hasItem(requiredMedallionName);
  }

  has_turtle_rock_medallion() {
    const requiredMedallionName = this._getSetting('tr_medallion'); // e.g., 'Bombos', 'Ether', 'Quake'
    if (!requiredMedallionName || requiredMedallionName === 'Unknown') {
      return false; // Similar logic to Misery Mire: if not set to a specific item, cannot satisfy by item check.
    }
    return this._hasItem(requiredMedallionName);
  }

  can_boots_clip_lw() {
    const hasBoots = this._hasItem('Pegasus Boots');
    if (!hasBoots) return false;

    const gameMode = this._getGameMode();
    if (gameMode === 'inverted') {
      return this._hasItem('Moon Pearl');
    }
    return true; // Boots are enough in standard light world
  }

  can_boots_clip_dw() {
    const hasBoots = this._hasItem('Pegasus Boots');
    if (!hasBoots) return false;

    const gameMode = this._getGameMode();
    if (gameMode !== 'inverted') {
      // Standard or other modes entering DW
      return this._hasItem('Moon Pearl');
    }
    return true; // Boots are enough in inverted dark world (which is like light world)
  }

  can_get_glitched_speed_dw() {
    if (!this._hasItem('Pegasus Boots')) return false;
    if (!(this._hasItem('Hookshot') || this.has_sword())) return false;

    const gameMode = this._getGameMode();
    if (gameMode !== 'inverted') {
      // Standard or other modes in DW
      if (!this._hasItem('Moon Pearl')) return false;
    }
    return true;
  }

  _has_specific_key_count(keyName, requiredCount = 1) {
    // This helper assumes the context is for the current player managed by StateManager.
    // The base _countItem should correctly use the current player's inventory.
    const currentCount = this._countItem(keyName);
    return currentCount >= requiredCount;
  }

  location_item_name(locationName) {
    // Assumes StateManager (this.manager) has a method to get the item at a location.
    // This method should return an object like { name: 'Item Name', player: 1 } or null/undefined.
    const itemInfo = this.manager.getLocationItem(locationName);
    if (
      itemInfo &&
      typeof itemInfo.name === 'string' &&
      typeof itemInfo.player === 'number'
    ) {
      return [itemInfo.name, itemInfo.player];
    }
    // console.warn(`[ALTTPWorkerHelpers] location_item_name: Location ${locationName} not found or no item info.`);
    return null; // Consistent with old helper's return for not found
  }

  basement_key_rule() {
    const keyRatItemTuple = this.location_item_name(
      'Sewers - Key Rat Key Drop'
    );
    let keyRatHasKey = false;
    if (
      keyRatItemTuple &&
      Array.isArray(keyRatItemTuple) &&
      keyRatItemTuple.length === 2
    ) {
      keyRatHasKey =
        keyRatItemTuple[0] === 'Small Key (Hyrule Castle)' &&
        keyRatItemTuple[1] === this.manager.player;
      // Assuming player 1 or current player. this.manager.player should give current player ID for worker.
    }

    const requiredKeys = keyRatHasKey ? 2 : 3;
    return this._has_specific_key_count(
      'Small Key (Hyrule Castle)',
      requiredKeys
    );
  }

  item_name_in_location_names(item, arg2, arg3) {
    let player;
    let location_name_player_pairs;

    // Determine player and location_name_player_pairs based on arguments
    if (Array.isArray(arg2) && arg3 === undefined) {
      location_name_player_pairs = arg2;
      player = this.manager.playerSlot; // Use playerSlot from StateManager instance
    } else {
      player = typeof arg2 === 'number' ? arg2 : this.manager.playerSlot;
      location_name_player_pairs = arg3;
    }

    if (typeof item !== 'string' || !item) {
      console.warn(
        '[ALTTPWorkerHelpers item_name_in_location_names] Invalid item name provided.',
        item
      );
      return false;
    }

    if (!Array.isArray(location_name_player_pairs)) {
      console.warn(
        '[ALTTPWorkerHelpers item_name_in_location_names] location_name_player_pairs is not an array.',
        location_name_player_pairs
      );
      return false;
    }

    for (const pair of location_name_player_pairs) {
      if (
        !Array.isArray(pair) ||
        pair.length !== 2 ||
        typeof pair[0] !== 'string'
      ) {
        // console.warn('[ALTTPWorkerHelpers item_name_in_location_names] Invalid pair in list:', pair);
        continue;
      }
      const [locName, locPlayerIgnored] = pair; // locPlayerIgnored as per original JS logic

      const itemAtLocation = this.location_item_name(locName); // Array [itemName, itemOwnerPlayer]

      if (
        itemAtLocation &&
        itemAtLocation[0] === item &&
        itemAtLocation[1] === player
      ) {
        return true;
      }
    }
    return false;
  }

  cross_peg_bridge() {
    return this._hasItem('Hammer') && this._hasItem('Moon Pearl');
  }

  has_any(items) {
    if (!Array.isArray(items)) {
      // console.warn('[ALTTPWorkerHelpers has_any] Items argument is not an array:', items);
      return false;
    }
    for (const item of items) {
      if (typeof item !== 'string') {
        // console.warn('[ALTTPWorkerHelpers has_any] Invalid item name in list:', item);
        continue;
      }
      // _countItem implicitly uses the current player context from this.manager
      if (this._countItem(item) > 0) {
        return true;
      }
    }
    return false;
  }

  GanonDefeatRule() {
    const isSwordless = this._hasFlag('swordless');

    if (isSwordless) {
      return (
        this._hasItem('Hammer') &&
        this.has_fire_source() &&
        this._hasItem('Silver Bow') &&
        this.can_shoot_arrows()
      );
    }

    const canHurt = this.has_beam_sword(); // Checks for Master Sword or better
    const common = canHurt && this.has_fire_source();

    const glitchesRequired = this._getSetting(
      'glitches_required',
      'no_glitches'
    ); // Default to no_glitches

    if (glitchesRequired !== 'no_glitches') {
      // With glitches, more options are available
      return (
        common &&
        (this._hasItem('Tempered Sword') ||
          this._hasItem('Golden Sword') ||
          (this._hasItem('Silver Bow') && this.can_shoot_arrows()) ||
          this._hasItem('Lamp') || // Lamp can light torches
          this.can_extend_magic(12)) // For lighting torches with Fire Rod (if Lamp not available for this check)
      );
    } else {
      // No glitches: requires Silver Bow and arrows specifically
      return common && this._hasItem('Silver Bow') && this.can_shoot_arrows();
    }
  }

  // ALTTP-specific worker helper methods will go here.
  // Example:
  // someALTTPWorkerSpecificMethod() {
  //   return this.manager.someALTTPSpecificProperty;
  // }
}
