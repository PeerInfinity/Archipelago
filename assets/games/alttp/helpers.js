import { GameHelpers } from '../../helpers/index.js';
import stateManager from '../../stateManagerSingleton.js';

export class ALTTPHelpers extends GameHelpers {
  // Following the same order as StateHelpers.py

  is_not_bunny(region) {
    if (stateManager.inventory.has('Moon Pearl')) {
      return true;
    }

    const isInverted = stateManager.state.gameMode === 'inverted';
    return isInverted ? region.is_dark_world : region.is_light_world;
  }

  can_bomb_clip(region) {
    return (
      this.can_use_bombs() &&
      this.is_not_bunny(region) &&
      stateManager.inventory.has('Pegasus Boots')
    );
  }

  can_buy_unlimited(item) {
    // This function checks if any accessible shop has an unlimited quantity of the item
    const shops = stateManager.state.shops || [];

    // Check all shops for unlimited items
    for (const shop of shops) {
      // Skip shops that can't be reached
      const shopRegion = shop.region_name;
      if (!shopRegion || !stateManager.isRegionReachable(shopRegion)) {
        continue;
      }

      // Check inventory for this item
      if (shop.inventory) {
        for (const shopItem of shop.inventory) {
          if (
            shopItem.item === item &&
            (shopItem.max === 0 || shopItem.max > 99)
          ) {
            return true;
          }
        }
      }
    }

    // Fallback to checking for the item availability in hardcoded shops
    if (item === 'Green Potion' || item === 'Blue Potion') {
      return stateManager.isRegionReachable('Potion Shop');
    }

    return false;
  }

  can_buy(item) {
    // This function checks if any accessible shop has the item in stock
    const shops = stateManager.state.shops || [];

    // Check all shops for the item
    for (const shop of shops) {
      // Skip shops that can't be reached
      const shopRegion = shop.region_name;
      if (!shopRegion || !stateManager.isRegionReachable(shopRegion)) {
        continue;
      }

      // Check inventory for this item
      if (shop.inventory) {
        for (const shopItem of shop.inventory) {
          if (shopItem.item === item && shopItem.max !== 0) {
            return true;
          }
        }
      }
    }

    // Fallback logic for specific items
    if (item === 'Single Arrow') {
      return stateManager.isRegionReachable('Kakariko Shop');
    }

    return false;
  }

  can_shoot_arrows(count = 0) {
    const hasBow =
      stateManager.inventory.has('Bow') ||
      stateManager.inventory.has('Silver Bow');

    if (!hasBow) return false;

    // Check retro bow flag or setting
    if (
      stateManager.state?.hasFlag('retro_bow') ||
      stateManager.state?.gameSettings?.retro_bow
    ) {
      return hasBow && this.can_buy('Single Arrow');
    }

    return hasBow && this.can_hold_arrows(count);
  }

  has_triforce_pieces() {
    // Get required count from state
    const requiredCount = stateManager.state.treasureHuntRequired;

    const triforceCount = stateManager.inventory.count('Triforce Piece');
    const powerStarCount = stateManager.inventory.count('Power Star');

    return triforceCount + powerStarCount >= requiredCount;
  }

  has_crystals(count) {
    return stateManager.inventory.countGroup('Crystals') >= count;
  }

  can_lift_rocks() {
    if (!stateManager.inventory) {
      console.error('Inventory is undefined in can_lift_rocks!', {
        helperInstance: this,
        stackTrace: new Error().stack,
      });
      return false;
    }

    const result =
      stateManager.inventory.has('Power Glove') ||
      stateManager.inventory.has('Titans Mitts');

    return result;
  }

  can_lift_heavy_rocks() {
    const result = stateManager.inventory.has('Titans Mitts');

    return result;
  }

  bottle_count() {
    // Get the progressive bottle limit from state
    const bottleLimit =
      stateManager.state.difficultyRequirements.progressive_bottle_limit;
    return Math.min(bottleLimit, stateManager.inventory.countGroup('Bottles'));
  }

  has_hearts(count) {
    return this.heart_count() >= count;
  }

  heart_count() {
    // Get difficulty requirements from state
    const bossHeartLimit =
      stateManager.state.difficultyRequirements.boss_heart_container_limit;
    const heartPieceLimit =
      stateManager.state.difficultyRequirements.heart_piece_limit;

    const bossHearts = Math.min(
      stateManager.inventory.count('Boss Heart Container'),
      bossHeartLimit
    );

    const sanctuaryHearts = stateManager.inventory.count(
      'Sanctuary Heart Container'
    );

    const pieceHearts =
      Math.min(
        stateManager.inventory.count('Piece of Heart'),
        heartPieceLimit
      ) / 4;

    // Starting hearts (3)
    return bossHearts + sanctuaryHearts + pieceHearts + 3;
  }

  can_extend_magic(smallmagic = 16, fullrefill = false) {
    // Calculate base magic capacity
    let basemagic = 8;
    if (stateManager.inventory.has('Magic Upgrade (1/4)')) {
      basemagic = 32;
    } else if (stateManager.inventory.has('Magic Upgrade (1/2)')) {
      basemagic = 16;
    }

    // Add magic from potions if available
    if (
      this.can_buy_unlimited('Green Potion') ||
      this.can_buy_unlimited('Blue Potion')
    ) {
      const bottleCount = this.bottle_count();
      const functionality =
        stateManager.state.gameSettings.item_functionality || 'normal';

      if (functionality === 'hard' && !fullrefill) {
        basemagic += Math.floor(basemagic * 0.5 * bottleCount);
      } else if (functionality === 'expert' && !fullrefill) {
        basemagic += Math.floor(basemagic * 0.25 * bottleCount);
      } else {
        basemagic += basemagic * bottleCount;
      }
    }

    return basemagic >= smallmagic;
  }

  can_hold_arrows(quantity = 0) {
    if (stateManager.state.gameSettings.shuffle_capacity_upgrades) {
      if (quantity === 0) {
        return true;
      }

      let arrows = 30;

      if (stateManager.inventory.has('Arrow Upgrade (70)')) {
        arrows = 70;
      } else {
        // Add +5 upgrades
        arrows += stateManager.inventory.count('Arrow Upgrade (+5)') * 5;

        // Add +10 upgrades
        arrows += stateManager.inventory.count('Arrow Upgrade (+10)') * 10;

        // Arrow Upgrade (+5) beyond the 6th gives +10
        const extraUpgrades = Math.max(
          0,
          stateManager.inventory.count('Arrow Upgrade (+5)') - 6
        );
        arrows += extraUpgrades * 10;
      }

      return Math.min(70, arrows) >= quantity;
    }

    // Default case - non-shuffled capacity
    return (
      quantity <= 30 || stateManager.inventory.has('Capacity Upgrade Shop')
    );
  }

  can_use_bombs(count = 1) {
    const bombless = stateManager.state.hasFlag('bombless_start');
    let bombs = bombless ? 0 : 10;

    const plus5Count = stateManager.inventory.count('Bomb Upgrade (+5)');
    const plus10Count = stateManager.inventory.count('Bomb Upgrade (+10)');
    const plus50Count = stateManager.inventory.count('Bomb Upgrade (50)');

    bombs += plus5Count * 5;
    bombs += plus10Count * 10;
    bombs += plus50Count * 50;

    if (plus5Count > 6) {
      const bonusBombs = (plus5Count - 6) * 10;
      bombs += bonusBombs;
    }

    return bombs >= Math.min(count, 50);
  }

  can_bomb_or_bonk() {
    return stateManager.inventory.has('Pegasus Boots') || this.can_use_bombs();
  }

  can_activate_crystal_switch() {
    return (
      this.has_melee_weapon() ||
      this.can_use_bombs() ||
      this.can_shoot_arrows() ||
      stateManager.inventory.has('Hookshot') ||
      stateManager.inventory.has('Cane of Somaria') ||
      stateManager.inventory.has('Cane of Byrna') ||
      stateManager.inventory.has('Fire Rod') ||
      stateManager.inventory.has('Ice Rod') ||
      stateManager.inventory.has('Blue Boomerang') ||
      stateManager.inventory.has('Red Boomerang')
    );
  }

  can_kill_most_things(count = 5) {
    return (
      this.has_melee_weapon() ||
      stateManager.inventory.has('Cane of Somaria') ||
      (stateManager.inventory.has('Cane of Byrna') &&
        (count < 6 || this.can_extend_magic())) ||
      this.can_shoot_arrows() ||
      stateManager.inventory.has('Fire Rod') ||
      this.can_use_bombs(count * 4)
    );
  }

  can_get_good_bee() {
    // Check if the Good Bee Cave region is accessible
    const caveAccessible = stateManager.isRegionReachable('Good Bee Cave');

    return (
      stateManager.inventory.countGroup('Bottles') > 0 &&
      stateManager.inventory.has('Bug Catching Net') &&
      (stateManager.inventory.has('Pegasus Boots') ||
        (this.has_sword() && stateManager.inventory.has('Quake'))) &&
      caveAccessible &&
      this.is_not_bunny({ is_light_world: true, is_dark_world: false }) // Assuming Good Bee Cave is in light world
    );
  }

  can_retrieve_tablet() {
    const hasBookOfMudora = stateManager.inventory.has('Book of Mudora');

    if (!hasBookOfMudora) {
      return false;
    }

    // Check if we have beam sword OR (swordless mode AND hammer)
    const hasSword = this.has_beam_sword();
    const isSwordlessMode = stateManager.state.hasFlag('swordless');
    const hasHammer = stateManager.inventory.has('Hammer');

    return hasSword || (isSwordlessMode && hasHammer);
  }

  has_sword() {
    return (
      stateManager.inventory.has('Fighter Sword') ||
      stateManager.inventory.has('Master Sword') ||
      stateManager.inventory.has('Tempered Sword') ||
      stateManager.inventory.has('Golden Sword')
    );
  }

  has_beam_sword() {
    return (
      stateManager.inventory.has('Master Sword') ||
      stateManager.inventory.has('Tempered Sword') ||
      stateManager.inventory.has('Golden Sword')
    );
  }

  has_melee_weapon() {
    return this.has_sword() || stateManager.inventory.has('Hammer');
  }

  has_fire_source() {
    return (
      stateManager.inventory.has('Fire Rod') ||
      stateManager.inventory.has('Lamp')
    );
  }

  can_melt_things() {
    return (
      stateManager.inventory.has('Fire Rod') ||
      (stateManager.inventory.has('Bombos') &&
        (stateManager.state.hasFlag('swordless') || this.has_sword()))
    );
  }

  has_misery_mire_medallion() {
    // Get the specific medallion from state
    const medallion =
      stateManager.state.gameSettings.misery_mire_medallion ||
      stateManager.state.requiredMedallions[0] ||
      'Ether';
    return stateManager.inventory.has(medallion);
  }

  has_turtle_rock_medallion() {
    // Get the specific medallion from state
    const medallion =
      stateManager.state.gameSettings.turtle_rock_medallion ||
      stateManager.state.requiredMedallions[1] ||
      'Quake';
    return stateManager.inventory.has(medallion);
  }

  can_boots_clip_lw() {
    if (stateManager.state.gameMode === 'inverted') {
      return (
        stateManager.inventory.has('Pegasus Boots') &&
        stateManager.inventory.has('Moon Pearl')
      );
    }
    return stateManager.inventory.has('Pegasus Boots');
  }

  can_boots_clip_dw() {
    if (stateManager.state.gameMode !== 'inverted') {
      return (
        stateManager.inventory.has('Pegasus Boots') &&
        stateManager.inventory.has('Moon Pearl')
      );
    }
    return stateManager.inventory.has('Pegasus Boots');
  }

  can_get_glitched_speed_dw() {
    const hasRequiredItems = [
      stateManager.inventory.has('Pegasus Boots'),
      stateManager.inventory.has('Hookshot') || this.has_sword(),
    ];

    if (stateManager.state.gameMode !== 'inverted') {
      hasRequiredItems.push(stateManager.inventory.has('Moon Pearl'));
    }

    return hasRequiredItems.every(Boolean);
  }

  // And now the helpers from worlds/alttp/Rules.py

  item_name_in_location_names(item) {
    // Placeholder.  Todo - copy the logic from Rules.py
    return true;
  }

  location() {
    // Placeholder.  Todo - figure out what the logic should be
    return true;
  }

  player() {
    // Placeholder.  Todo - figure out what the logic should be
    return false;
  }

  old_man() {
    // Placeholder.  Todo - copy the logic from Rules.py
    return stateManager.isLocationAccessible('Old Man');
  }

  basement_key_rule() {
    // Placeholder.  Todo - copy the logic from Rules.py
    return true;
  }

  cross_peg_bridge() {
    // Placeholder.  Todo - copy the logic from Rules.py
    return true;
  }

  any() {
    // Placeholder.  Todo - copy the logic from Rules.py
    return true;
  }

  add_rule() {
    // Placeholder.  Todo - copy the logic from Rules.py
    return false;
  }

  // And now the state_methods:

  can_reach(region, type = 'Region', player = 1) {
    // The context-aware state manager handles position-specific constraints correctly
    if (type === 'Region') {
      return stateManager.isRegionReachable(region);
    } else if (type === 'Location') {
      // Find the location object
      const location = stateManager.locations.find(
        (loc) => loc.name === region
      );
      return location && stateManager.isLocationAccessible(location);
    }

    return false;
  }

  /*
    def can_reach(self,
                  spot: Union[Location, Entrance, Region, str],
                  resolution_hint: Optional[str] = None,
                  player: Optional[int] = None) -> bool:
        if isinstance(spot, str):
            assert isinstance(player, int), "can_reach: player is required if spot is str"
            # try to resolve a name
            if resolution_hint == 'Location':
                return self.can_reach_location(spot, player)
            elif resolution_hint == 'Entrance':
                return self.can_reach_entrance(spot, player)
            else:
                # default to Region
                return self.can_reach_region(spot, player)
        return spot.can_reach(self)

    def can_reach_location(self, spot: str, player: int) -> bool:
        return self.multiworld.get_location(spot, player).can_reach(self)

    def can_reach_entrance(self, spot: str, player: int) -> bool:
        return self.multiworld.get_entrance(spot, player).can_reach(self)

    def can_reach_region(self, spot: str, player: int) -> bool:
        return self.multiworld.get_region(spot, player).can_reach(self)

  */

  _lttp_has_key(key, player, count) {
    // Untested
    return stateManager.inventory.count(key) >= count;
  }

  multiworld() {
    // Placeholder!
    return true;
  }

  has_any(item, playerId) {
    // Placeholder!
    return true;

    /*
    // Handle case where item is a constant object
    const itemName =
      typeof item === 'object' && item.type === 'constant' ? item.value : item;

    // Convert player to numeric ID if it's a string like "player"
    const player =
      playerId === 'player' ? stateManager.playerSlot : parseInt(playerId, 10);

    // Check if the player has the item in their inventory
    if (stateManager.inventory) {
      const count = stateManager.inventory.count(itemName, player);
      return count > 0;
    }

    return false;
    */
  }
}
