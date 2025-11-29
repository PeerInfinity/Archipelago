/**
 * Ocarina of Time game logic functions
 * Thread-agnostic pure functions for OOT rule evaluation
 */

/**
 * OOT state management module
 */
export const ootStateModule = {
  /**
   * Initialize OOT game state
   */
  initializeState() {
    return {
      flags: [],
      events: [],
      age: null, // 'child' or 'adult'
    };
  },

  /**
   * Load settings into game state
   */
  loadSettings(gameState, settings) {
    // Initialize age based on starting_age setting
    const startingAge = settings?.starting_age || 'child';
    return {
      ...gameState,
      age: startingAge,
    };
  },

  /**
   * Process event items
   */
  processEventItem(gameState, itemName) {
    return null;
  },

  /**
   * Get state for snapshot
   */
  getStateForSnapshot(gameState) {
    return {
      flags: gameState.flags || [],
      events: gameState.events || [],
      age: gameState.age,
    };
  },
};

/**
 * Parse and evaluate OOT's custom rule DSL
 *
 * This is the critical helper that allows the frontend to evaluate OOT rules
 * that were exported as DSL strings.
 *
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @param {string} ruleString - OOT DSL rule string
 * @returns {boolean} True if rule is satisfied
 */
function parse_oot_rule(snapshot, staticData, ruleString) {
  if (!ruleString || typeof ruleString !== 'string') {
    return true;
  }

  // Handle simple constants
  if (ruleString === 'True') return true;
  if (ruleString === 'False') return false;

  // For complex rules, we need to parse and evaluate the DSL
  // This is a simplified implementation - will expand as needed

  try {
    // Create evaluation context with helper functions
    const context = createEvaluationContext(snapshot, staticData);

    // Parse and evaluate the rule string
    return evaluateRuleString(ruleString, context);
  } catch (error) {
    console.warn(`[OOT] Failed to parse rule: ${ruleString}`, error);
    return false; // Fail safe - location not accessible if rule can't be parsed
  }
}

/**
 * Create evaluation context with all helper functions and data
 */
function createEvaluationContext(snapshot, staticData) {
  const settings = staticData?.settings?.[1] || {};

  // Create context object and store in variable so helper functions can reference it
  const context = {
    snapshot,
    staticData,
    settings,

    // Item check function
    hasItem: (itemName) => {
      // Convert underscores to spaces for item names
      const normalizedName = itemName.replace(/_/g, ' ');
      return (snapshot?.inventory?.[normalizedName] || 0) > 0;
    },

    // Event check function
    hasEvent: (eventName) => {
      return (snapshot?.events || []).includes(eventName);
    },

    // Age checks
    is_adult: () => snapshot?.age === 'adult',
    is_child: () => snapshot?.age === 'child',
    is_starting_age: () => {
      const startingAge = settings?.starting_age || 'child';
      return snapshot?.age === startingAge;
    },

    // Time of day checks (placeholder - need to implement properly)
    at_night: () => true, // TODO: Implement time of day logic
    at_day: () => true,
    at_dampe: () => true,
    at_dampe_time: () => true, // Alias for at_dampe

    // Helper to get item count
    countItem: (itemName) => {
      const normalizedName = itemName.replace(/_/g, ' ');
      return snapshot?.inventory?.[normalizedName] || 0;
    },

    // Helper to check group
    hasGroup: (groupName) => {
      // Check if player has any item from this group
      const items = staticData?.items?.[1] || {};
      for (const [itemName, itemData] of Object.entries(items)) {
        if (itemData.groups && itemData.groups.includes(groupName)) {
          if ((snapshot?.inventory?.[itemName] || 0) > 0) {
            return true;
          }
        }
      }
      return false;
    },

    // Explosives helpers
    has_bombchus: () => {
      const buyBombchu = context.hasItem('Buy_Bombchu_5') || context.hasItem('Buy_Bombchu_10') ||
                         context.hasItem('Buy_Bombchu_20') || context.hasItem('Bombchu_Drop');
      const bombchusInLogic = settings?.bombchus_in_logic || false;
      const hasBombBag = context.hasItem('Bomb_Bag');
      return buyBombchu && (bombchusInLogic || hasBombBag);
    },
    has_explosives: () => {
      const bombchusInLogic = settings?.bombchus_in_logic || false;
      return context.hasItem('Bombs') || (bombchusInLogic && context.has_bombchus());
    },
    can_blast_or_smash: () => {
      return context.has_explosives() || (context.is_adult() && context.hasItem('Megaton_Hammer'));
    },

    // Combat and interaction helpers
    can_break_crate: () => {
      const canBonk = true; // Simplified - deadly_bonks logic not fully implemented
      return canBonk || context.can_blast_or_smash();
    },
    can_cut_shrubs: () => {
      return context.is_adult() || context.hasItem('Sticks') || context.hasItem('Kokiri_Sword') ||
             context.hasItem('Boomerang') || context.has_explosives();
    },
    can_dive: () => {
      return context.hasItem('Progressive_Scale');
    },

    // Bottle helper
    has_bottle: () => {
      return context.hasGroup('logic_bottles');
    },

    // Bean and bug helpers
    can_plant_bean: () => {
      const plantBeans = settings?.plant_beans || false;
      if (plantBeans) return true;
      // Check if child and has beans
      if (!context.is_child()) return false;
      return context.hasItem('Magic_Bean_Pack') || context.hasItem('Buy_Magic_Bean') ||
             context.countItem('Magic_Bean') >= 10;
    },
    can_plant_bugs: () => {
      return context.is_child() && (context.hasItem('Bugs') || context.hasItem('Buy_Bottle_Bug'));
    },

    // Grotto helpers
    can_open_bomb_grotto: () => {
      const logicGrottosWithoutAgony = settings?.logic_grottos_without_agony || false;
      return context.can_blast_or_smash() && (context.hasItem('Stone_of_Agony') || logicGrottosWithoutAgony);
    },
    can_open_storm_grotto: () => {
      const logicGrottosWithoutAgony = settings?.logic_grottos_without_agony || false;
      const canPlaySOS = context.hasItem('Ocarina') && context.hasItem('Song_of_Storms');
      return canPlaySOS && (context.hasItem('Stone_of_Agony') || logicGrottosWithoutAgony);
    },

    // Fairy summon helpers
    can_summon_gossip_fairy: () => {
      if (!context.hasItem('Ocarina')) return false;
      return context.hasItem('Zeldas_Lullaby') || context.hasItem('Eponas_Song') ||
             context.hasItem('Song_of_Time') || context.hasItem('Suns_Song');
    },
    can_summon_gossip_fairy_without_suns: () => {
      if (!context.hasItem('Ocarina')) return false;
      return context.hasItem('Zeldas_Lullaby') || context.hasItem('Eponas_Song') ||
             context.hasItem('Song_of_Time');
    },

    // Epona helper
    can_ride_epona: () => {
      if (!context.is_adult() || !context.hasItem('Epona')) return false;
      const canPlayEponasSong = context.hasItem('Ocarina') && context.hasItem('Eponas_Song');
      return canPlayEponasSong; // Simplified - skipping is_glitched and can_hover
    },

    // Bridge and LACS helpers (simplified - full logic is complex)
    can_build_rainbow_bridge: () => {
      const bridge = settings?.bridge || 'vanilla';
      if (bridge === 'open') return true;
      // Simplified - just check for open bridge
      // Full implementation would check medallions, stones, etc.
      return false;
    },
    can_trigger_lacs: () => {
      const lacsCondition = settings?.lacs_condition || 'vanilla';
      // Simplified - full implementation would check condition requirements
      return false;
    },
    can_finish_GerudoFortress: () => {
      const gerudoFortress = settings?.gerudo_fortress || 'normal';
      // Simplified - check if gerudo fortress is set to something other than normal/fast
      return gerudoFortress !== 'normal' && gerudoFortress !== 'fast';
    },

    // Setting checks
    shuffle_dungeon_entrances: () => {
      return settings?.shuffle_dungeon_entrances || false;
    },
    entrance_shuffle: () => {
      return settings?.entrance_shuffle || false;
    },
    dodongos_cavern_shortcuts: () => {
      const dungeonShortcuts = settings?.dungeon_shortcuts || [];
      return dungeonShortcuts.includes('Dodongos Cavern');
    },

    // Logic trick helpers - check if trick is enabled in settings
    logic_visible_collisions: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Visible Collision');
    },
    logic_kakariko_rooftop_gs: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Kakariko Rooftop GS');
    },
    logic_man_on_roof: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Man on Roof');
    },
    logic_mido_backflip: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Mido Backflip');
    },
    logic_dmt_climb_hovers: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('DMT Climb with Hover Boots');
    },
    logic_adult_kokiri_gs: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Adult Kokiri GS');
    },
    logic_lab_diving: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Lab Diving');
    },
    logic_windmill_poh: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Windmill PoH');
    },
    logic_graveyard_poh: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Graveyard PoH');
    },
    logic_zora_river_lower: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Zora River Lower');
    },
    logic_link_goron_dins: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Link Goron Dins');
    },
    logic_lab_wall_gs: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Lab Wall GS');
    },
    logic_kakariko_tower_gs: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Kakariko Tower GS');
    },
    logic_beehives_bombchus: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Beehives with Bombchus');
    },
    logic_grottos_without_agony: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Grottos without Stone of Agony');
    },

    // Additional helpers from LogicHelpers.json

    // can_leave_forest: open_forest != 'closed' or is_adult or is_glitched or Deku_Tree_Clear
    can_leave_forest: () => {
      const openForest = settings?.open_forest || 'closed';
      if (openForest !== 'closed') return true;
      if (context.is_adult()) return true;
      if (context.is_glitched()) return true;
      // Check for Deku_Tree_Clear event
      return context.hasEvent('Deku_Tree_Clear');
    },

    // has_shield: (is_adult and Hylian_Shield) or (is_child and Deku_Shield)
    // Where Hylian_Shield = Buy_Hylian_Shield and Deku_Shield = Buy_Deku_Shield or Deku_Shield_Drop
    has_shield: () => {
      if (context.is_adult()) {
        // Adult needs Hylian_Shield (alias for Buy_Hylian_Shield)
        return context.hasItem('Buy_Hylian_Shield');
      }
      if (context.is_child()) {
        // Child needs Deku_Shield (alias for Buy_Deku_Shield or Deku_Shield_Drop)
        return context.hasItem('Buy_Deku_Shield') || context.hasItem('Deku_Shield_Drop');
      }
      return false;
    },

    // can_shield: (is_adult and (Hylian_Shield or Mirror_Shield)) or (is_child and Deku_Shield)
    // Where Hylian_Shield = Buy_Hylian_Shield and Deku_Shield = Buy_Deku_Shield or Deku_Shield_Drop
    can_shield: () => {
      if (context.is_adult()) {
        // Adult needs Hylian_Shield (Buy_Hylian_Shield) OR Mirror_Shield
        return context.hasItem('Buy_Hylian_Shield') || context.hasItem('Mirror_Shield');
      }
      if (context.is_child()) {
        // Child needs Deku_Shield (Buy_Deku_Shield or Deku_Shield_Drop)
        return context.hasItem('Buy_Deku_Shield') || context.hasItem('Deku_Shield_Drop');
      }
      return false;
    },

    // deku_tree_shortcuts: 'Deku Tree' in dungeon_shortcuts
    deku_tree_shortcuts: () => {
      const dungeonShortcuts = settings?.dungeon_shortcuts || [];
      return Array.isArray(dungeonShortcuts) && dungeonShortcuts.includes('Deku Tree');
    },

    // is_glitched: logic_rules != 'glitchless'
    is_glitched: () => {
      const logicRules = settings?.logic_rules || 'glitchless';
      return logicRules !== 'glitchless';
    },

    // can_child_attack: is_child and (Slingshot or Boomerang or Sticks or Kokiri_Sword or has_explosives or can_use(Dins_Fire))
    can_child_attack: () => {
      if (!context.is_child()) return false;
      return context.hasItem('Slingshot') || context.hasItem('Boomerang') ||
             context.hasItem('Sticks') || context.hasItem('Buy_Deku_Stick_1') || context.hasItem('Deku_Stick_Drop') ||
             context.hasItem('Kokiri_Sword') || context.has_explosives() ||
             (context.hasItem('Dins_Fire') && context.hasItem('Magic_Meter'));
    },

    // can_child_damage: is_child and (Slingshot or Sticks or Kokiri_Sword or has_explosives or can_use(Dins_Fire))
    can_child_damage: () => {
      if (!context.is_child()) return false;
      return context.hasItem('Slingshot') ||
             context.hasItem('Sticks') || context.hasItem('Buy_Deku_Stick_1') || context.hasItem('Deku_Stick_Drop') ||
             context.hasItem('Kokiri_Sword') || context.has_explosives() ||
             (context.hasItem('Dins_Fire') && context.hasItem('Magic_Meter'));
    },

    // can_stun_deku: is_adult or (Slingshot or Boomerang or Sticks or Kokiri_Sword or has_explosives or can_use(Dins_Fire) or Nuts or Deku_Shield)
    can_stun_deku: () => {
      if (context.is_adult()) return true;
      return context.hasItem('Slingshot') || context.hasItem('Boomerang') ||
             context.hasItem('Sticks') || context.hasItem('Buy_Deku_Stick_1') || context.hasItem('Deku_Stick_Drop') ||
             context.hasItem('Kokiri_Sword') || context.has_explosives() ||
             (context.hasItem('Dins_Fire') && context.hasItem('Magic_Meter')) ||
             context.hasItem('Nuts') || context.hasItem('Buy_Deku_Nut_5') || context.hasItem('Buy_Deku_Nut_10') ||
             context.hasItem('Deku_Nut_Drop') ||
             context.hasItem('Deku_Shield') || context.hasItem('Buy_Deku_Shield') || context.hasItem('Deku_Shield_Drop');
    },

    // has_all_stones: Kokiri_Emerald and Goron_Ruby and Zora_Sapphire
    has_all_stones: () => {
      return context.hasItem('Kokiri_Emerald') &&
             context.hasItem('Goron_Ruby') &&
             context.hasItem('Zora_Sapphire');
    },

    // has_all_medallions: Forest_Medallion and Fire_Medallion and Water_Medallion and Shadow_Medallion and Spirit_Medallion and Light_Medallion
    has_all_medallions: () => {
      return context.hasItem('Forest_Medallion') &&
             context.hasItem('Fire_Medallion') &&
             context.hasItem('Water_Medallion') &&
             context.hasItem('Shadow_Medallion') &&
             context.hasItem('Spirit_Medallion') &&
             context.hasItem('Light_Medallion');
    },

    // can_break_upper_beehive: can_use(Boomerang) or can_use(Hookshot) or (logic_beehives_bombchus and has_bombchus)
    can_break_upper_beehive: () => {
      // can_use(Boomerang) - child only
      const canUseBoomerang = context.is_child() && context.hasItem('Boomerang');
      // can_use(Hookshot) - adult only
      const canUseHookshot = context.is_adult() && context.hasItem('Progressive_Hookshot');
      const beehiveTrick = context.logic_beehives_bombchus() && context.has_bombchus();
      return canUseBoomerang || canUseHookshot || beehiveTrick;
    },

    // can_break_lower_beehive: can_use(Boomerang) or can_use(Hookshot) or Bombs or (logic_beehives_bombchus and has_bombchus)
    can_break_lower_beehive: () => {
      // can_use(Boomerang) - child only
      const canUseBoomerang = context.is_child() && context.hasItem('Boomerang');
      // can_use(Hookshot) - adult only
      const canUseHookshot = context.is_adult() && context.hasItem('Progressive_Hookshot');
      const hasBombs = context.hasItem('Bomb_Bag');
      const beehiveTrick = context.logic_beehives_bombchus() && context.has_bombchus();
      return canUseBoomerang || canUseHookshot || hasBombs || beehiveTrick;
    },

    // can_bonk: deadly_bonks != 'ohko' or Fairy or can_use(Nayrus_Love)
    can_bonk: () => {
      const deadlyBonks = settings?.deadly_bonks || 'none';
      if (deadlyBonks !== 'ohko') return true;
      // If deadly bonks is OHKO, need Fairy or Nayru's Love
      if (context.hasItem('Fairy') || context.hasItem('Buy_Fairys_Spirit')) return true;
      // can_use(Nayrus_Love) - need the spell and magic meter
      return context.hasItem('Nayrus_Love') && context.hasItem('Magic_Meter');
    },

    // found_bombchus helper (from LogicHelpers.json)
    found_bombchus: () => {
      const bombchusInLogic = settings?.bombchus_in_logic || false;
      if (bombchusInLogic) {
        // Check for any bombchu items
        return context.hasItem('Bombchus') || context.hasItem('Bombchus_5') ||
               context.hasItem('Bombchus_10') || context.hasItem('Bombchus_20');
      } else {
        // Just need bomb bag
        return context.hasItem('Bomb_Bag');
      }
    },

    // Fire source helpers
    has_fire_source: () => {
      // can_use(Dins_Fire) or can_use(Fire_Arrows)
      const canUseDinsFire = context.hasItem('Dins_Fire') && context.hasItem('Magic_Meter');
      const canUseFireArrows = context.is_adult() && context.hasItem('Fire_Arrows') && context.hasItem('Bow');
      return canUseDinsFire || canUseFireArrows;
    },
    has_fire_source_with_torch: () => {
      // has_fire_source or (is_child and Sticks)
      if (context.has_fire_source()) return true;
      if (!context.is_child()) return false;
      return context.hasItem('Sticks') || context.hasItem('Buy_Deku_Stick_1') || context.hasItem('Deku_Stick_Drop');
    },

    // Combat helpers
    can_use_projectile: () => {
      // has_explosives or (is_adult and (Bow or Hookshot)) or (is_child and (Slingshot or Boomerang))
      if (context.has_explosives()) return true;
      if (context.is_adult()) {
        return context.hasItem('Bow') || context.hasItem('Progressive_Hookshot');
      }
      if (context.is_child()) {
        return context.hasItem('Slingshot') || context.hasItem('Boomerang');
      }
      return false;
    },
    can_jumpslash: () => {
      // is_adult or Sticks or Kokiri_Sword
      if (context.is_adult()) return true;
      return context.hasItem('Sticks') || context.hasItem('Buy_Deku_Stick_1') || context.hasItem('Deku_Stick_Drop') ||
             context.hasItem('Kokiri_Sword');
    },
    can_take_damage: () => {
      // damage_multiplier != 'ohko' or Fairy or can_use(Nayrus_Love)
      const damageMultiplier = settings?.damage_multiplier || 'normal';
      if (damageMultiplier !== 'ohko') return true;
      if (context.hasItem('Fairy') || context.hasItem('Buy_Fairys_Spirit')) return true;
      return context.hasItem('Nayrus_Love') && context.hasItem('Magic_Meter');
    },
    can_break_heated_crate: () => {
      // deadly_bonks != 'ohko' or (Fairy and (can_use(Goron_Tunic) or damage_multiplier != 'ohko')) or can_use(Nayrus_Love) or can_blast_or_smash
      const deadlyBonks = settings?.deadly_bonks || 'none';
      if (deadlyBonks !== 'ohko') return true;

      const hasFairy = context.hasItem('Fairy') || context.hasItem('Buy_Fairys_Spirit');
      const canUseGoronTunic = context.hasItem('Goron_Tunic') || context.hasItem('Buy_Goron_Tunic');
      const damageMultiplier = settings?.damage_multiplier || 'normal';
      if (hasFairy && (canUseGoronTunic || damageMultiplier !== 'ohko')) return true;

      const canUseNayrusLove = context.hasItem('Nayrus_Love') && context.hasItem('Magic_Meter');
      if (canUseNayrusLove) return true;

      return context.can_blast_or_smash();
    },
    can_break_upper_beehive_child: () => {
      // Simplified - child can break upper beehive with slingshot or boomerang
      if (!context.is_child()) return false;
      return context.hasItem('Slingshot') || context.hasItem('Boomerang');
    },

    // Dungeon shortcuts
    king_dodongo_shortcuts: () => {
      // region_has_shortcuts('King Dodongo Boss Room')
      // This would need access to region shortcuts, for now check if dungeon shortcuts is enabled
      const dungeonShortcuts = settings?.dungeon_shortcuts || [];
      return Array.isArray(dungeonShortcuts) && dungeonShortcuts.includes('Dodongos Cavern');
    },
    spirit_temple_shortcuts: () => {
      // 'Spirit Temple' in dungeon_shortcuts
      const dungeonShortcuts = settings?.dungeon_shortcuts || [];
      return Array.isArray(dungeonShortcuts) && dungeonShortcuts.includes('Spirit Temple');
    },

    // Time of day helpers
    had_night_start: () => {
      // Check if started at night - for now, simplified
      const startingTime = settings?.starting_time_of_day || 'day';
      return startingTime === 'night' || startingTime === 'dampe';
    },

    // Logic trick helpers - all follow same pattern: check if trick is in logic_tricks setting
    logic_gerudo_kitchen: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Gerudo Kitchen');
    },
    logic_child_dampe_race_poh: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Child Dampe Race PoH');
    },
    logic_dmt_bombable: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('DMT Bombable');
    },
    logic_goron_city_leftmost: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Goron City Leftmost');
    },
    logic_castle_storms_gs: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Castle Storms GS');
    },
    logic_deku_basement_gs: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Deku Basement GS');
    },
    logic_deku_b1_webs_with_bow: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Deku B1 Webs with Bow');
    },
    logic_deku_b1_skip: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Deku B1 Skip');
    },
    logic_dc_scarecrow_gs: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('DC Scarecrow GS');
    },
    logic_dc_scrub_room: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('DC Scrub Room');
    },
    logic_forest_first_gs: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Forest First GS');
    },
    logic_forest_outdoor_east_gs: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Forest Outdoor East GS');
    },
    logic_fire_scarecrow: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Fire Scarecrow');
    },
    logic_water_central_gs_fw: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Water Central GS FW');
    },
    logic_water_central_gs_irons: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Water Central GS Irons');
    },
    logic_water_falling_platform_gs_boomerang: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Water Falling Platform GS Boomerang');
    },
    logic_water_falling_platform_gs_hookshot: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Water Falling Platform GS Hookshot');
    },
    logic_water_river_gs: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Water River GS');
    },
    logic_shadow_bongo: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Shadow Bongo Bongo');
    },
    logic_shadow_umbrella: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Shadow Umbrella');
    },
    logic_shadow_umbrella_gs: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Shadow Umbrella GS');
    },
    logic_spirit_lobby_gs: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Spirit Lobby GS');
    },
    logic_spirit_map_chest: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Spirit Map Chest');
    },
    logic_spirit_sun_chest: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Spirit Sun Chest');
    },
    logic_ice_block_gs: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Ice Block GS');
    },
    logic_lens_castle: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Lens of Truth Castle');
    },
    logic_lens_spirit: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Lens of Truth Spirit');
    },
    logic_fewer_tunic_requirements: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Fewer Tunic Requirements');
    },
    logic_child_rolling_with_strength: () => {
      const tricks = settings?.logic_tricks || [];
      return Array.isArray(tricks) && tricks.includes('Child Rolling with Strength');
    },
  };

  return context;
}

/**
 * Evaluate an OOT rule string
 *
 * This implements a simple recursive descent parser for OOT's DSL
 *
 * @param {string} ruleString - Rule string to evaluate
 * @param {Object} context - Evaluation context
 * @returns {boolean} Evaluation result
 */
function evaluateRuleString(ruleString, context) {
  // Trim whitespace
  ruleString = ruleString.trim();

  // Handle constants
  if (ruleString === 'True') return true;
  if (ruleString === 'False') return false;

  // Handle OR operator (lowest precedence)
  if (ruleString.includes(' or ')) {
    const parts = splitByOperator(ruleString, ' or ');
    // Only recurse if we actually split the string
    if (parts.length > 1) {
      return parts.some(part => evaluateRuleString(part, context));
    }
    // If no split happened, continue to other checks
  }

  // Handle AND operator
  if (ruleString.includes(' and ')) {
    const parts = splitByOperator(ruleString, ' and ');
    // Only recurse if we actually split the string
    if (parts.length > 1) {
      return parts.every(part => evaluateRuleString(part, context));
    }
    // If no split happened, continue to other checks
  }

  // Handle NOT operator
  if (ruleString.startsWith('not ')) {
    const innerRule = ruleString.substring(4).trim();
    return !evaluateRuleString(innerRule, context);
  }

  // Handle parentheses
  if (ruleString.startsWith('(') && ruleString.endsWith(')')) {
    const inner = ruleString.substring(1, ruleString.length - 1);
    return evaluateRuleString(inner, context);
  }

  // Handle quoted event names
  if (ruleString.startsWith("'") && ruleString.endsWith("'")) {
    const eventName = ruleString.substring(1, ruleString.length - 1);
    return context.hasEvent(eventName);
  }

  // Handle function calls like can_play(Song_Name)
  const funcMatch = ruleString.match(/^(\w+)\(([^)]+)\)$/);
  if (funcMatch) {
    const [, funcName, argString] = funcMatch;
    return evaluateFunctionCall(funcName, argString, context);
  }

  // Handle age checks
  if (ruleString === 'is_adult') return context.is_adult();
  if (ruleString === 'is_child') return context.is_child();
  if (ruleString === 'is_starting_age') return context.is_starting_age();

  // Handle time of day
  if (ruleString === 'at_night') return context.at_night();
  if (ruleString === 'at_day') return context.at_day();
  if (ruleString === 'at_dampe') return context.at_dampe();

  // Handle setting checks (e.g., "open_forest == 'open'")
  if (ruleString.includes('==') || ruleString.includes('!=')) {
    return evaluateComparison(ruleString, context);
  }

  // Handle item count checks (e.g., "Progressive_Scale, 2" or "(Gold_Skulltula_Token, bridge_tokens)")
  const countMatch = ruleString.match(/^\(?([A-Z][a-zA-Z0-9_]*)\s*,\s*(\w+)\)?$/);
  if (countMatch) {
    const [, itemName, countStr] = countMatch;
    // countStr could be a number or a setting name
    let requiredCount;
    if (/^\d+$/.test(countStr)) {
      requiredCount = parseInt(countStr, 10);
    } else {
      // It's a setting reference
      requiredCount = context.settings[countStr] || 0;
    }
    return context.countItem(itemName) >= requiredCount;
  }

  // Handle item aliases from LogicHelpers.json
  // These aliases need to be expanded before checking inventory
  const itemAliases = {
    'Hookshot': 'Progressive_Hookshot',
    'Longshot': '(Progressive_Hookshot, 2)',
    'Silver_Gauntlets': '(Progressive_Strength_Upgrade, 2)',
    'Golden_Gauntlets': '(Progressive_Strength_Upgrade, 3)',
    'Scarecrow': 'Progressive_Hookshot and can_play(Scarecrow_Song)',
    'Distant_Scarecrow': '(Progressive_Hookshot, 2) and can_play(Scarecrow_Song)',
    'Goron_Tunic': "'Goron Tunic' or Buy_Goron_Tunic",
    'Zora_Tunic': "'Zora Tunic' or Buy_Zora_Tunic",
    'Bombs': 'Bomb_Bag',
    'Deku_Shield': 'Buy_Deku_Shield or Deku_Shield_Drop',
    'Hylian_Shield': 'Buy_Hylian_Shield',
    'Nuts': 'Buy_Deku_Nut_5 or Buy_Deku_Nut_10 or Deku_Nut_Drop',
    'Sticks': 'Buy_Deku_Stick_1 or Deku_Stick_Drop',
    'Bugs': "'Bugs' or Buy_Bottle_Bug",
    'Blue_Fire': "'Blue Fire' or Buy_Blue_Fire",
    'Fish': "'Fish' or Buy_Fish",
    'Fairy': "'Fairy' or Buy_Fairys_Spirit",
    'Big_Poe': "'Big Poe'",
  };

  // Check if this is an aliased item
  if (itemAliases[ruleString]) {
    // Recursively evaluate the alias definition
    return evaluateRuleString(itemAliases[ruleString], context);
  }

  // Handle simple item names (with underscores)
  // If it looks like an item name (starts with capital), check inventory
  if (/^[A-Z][a-zA-Z0-9_]*$/.test(ruleString)) {
    return context.hasItem(ruleString);
  }

  // Handle helper-like identifiers (lowercase with underscores, like can_plant_bean)
  // These are OOT-specific helpers that we may have implemented
  if (/^[a-z][a-z0-9_]*$/.test(ruleString)) {
    // Check if this helper exists in our context
    if (typeof context[ruleString] === 'function') {
      return context[ruleString]();
    }
    // Unknown helper - log and return false
    console.warn(`[OOT] Unknown helper: ${ruleString}`);
    return false;
  }

  // Default: treat as a simple identifier and check if it's an item or setting
  const normalizedName = ruleString.replace(/_/g, ' ');
  if (context.snapshot?.inventory?.[normalizedName]) {
    return context.snapshot.inventory[normalizedName] > 0;
  }

  // Unknown rule - log and return false
  console.warn(`[OOT] Unknown rule pattern: ${ruleString}`);
  return false;
}

/**
 * Split a string by an operator, respecting parentheses and quotes
 */
function splitByOperator(str, operator) {
  const parts = [];
  let current = '';
  let parenDepth = 0;
  let inQuotes = false;
  let i = 0;

  while (i < str.length) {
    const char = str[i];

    // Track quote state
    if (char === "'" && (i === 0 || str[i-1] !== '\\')) {
      inQuotes = !inQuotes;
      current += char;
      i++;
      continue;
    }

    if (!inQuotes) {
      // Track parenthesis depth
      if (char === '(') parenDepth++;
      if (char === ')') parenDepth--;

      // Check if we're at the operator (only split at depth 0)
      if (parenDepth === 0 && str.substring(i, i + operator.length) === operator) {
        parts.push(current.trim());
        current = '';
        i += operator.length;
        continue;
      }
    }

    current += char;
    i++;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  // If no split occurred, return array with original string
  if (parts.length === 0) {
    return [str];
  }

  return parts;
}

/**
 * Evaluate a function call like can_play(Song_Name)
 */
function evaluateFunctionCall(funcName, argString, context) {
  const arg = argString.trim();

  switch (funcName) {
    case 'can_play':
      // Check if player has the song (convert underscores to spaces)
      const songName = arg.replace(/_/g, ' ');
      return context.hasItem(songName);

    case 'can_use':
      // Check if player can use an item
      const itemName = arg.replace(/_/g, ' ');
      return context.hasItem(itemName);

    case 'here':
      // Evaluate a helper in the current region context
      // For now, just recursively evaluate the argument
      return evaluateRuleString(arg, context);

    case 'at':
      // Check if at a specific location
      // This is context-dependent, for now return true
      return true;

    default:
      console.warn(`[OOT] Unknown function: ${funcName}`);
      return false;
  }
}

/**
 * Evaluate a comparison expression
 */
function evaluateComparison(ruleString, context) {
  const eqMatch = ruleString.match(/^(.+?)\s*==\s*(.+)$/);
  if (eqMatch) {
    const [, left, right] = eqMatch;
    const leftVal = getComparisonValue(left.trim(), context);
    const rightVal = getComparisonValue(right.trim(), context);
    return leftVal === rightVal;
  }

  const neqMatch = ruleString.match(/^(.+?)\s*!=\s*(.+)$/);
  if (neqMatch) {
    const [, left, right] = neqMatch;
    const leftVal = getComparisonValue(left.trim(), context);
    const rightVal = getComparisonValue(right.trim(), context);
    return leftVal !== rightVal;
  }

  return false;
}

/**
 * Get value for comparison
 */
function getComparisonValue(str, context) {
  // Handle quoted strings
  if (str.startsWith("'") && str.endsWith("'")) {
    return str.substring(1, str.length - 1);
  }

  // Handle numbers
  if (/^\d+$/.test(str)) {
    return parseInt(str, 10);
  }

  // Handle booleans
  if (str === 'True') return true;
  if (str === 'False') return false;

  // Handle setting references
  if (context.settings && str in context.settings) {
    return context.settings[str];
  }

  // Return as string
  return str;
}

/**
 * Parse and evaluate Python-style rule strings (from Subrule AST unparsing)
 *
 * Converts Python code like "state.has('Item', player)" back to evaluation
 *
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @param {string} pythonRuleString - Python code string from ast.unparse()
 * @returns {boolean} Evaluation result
 */
function parse_oot_python_rule(snapshot, staticData, pythonRuleString) {
  if (!pythonRuleString || typeof pythonRuleString !== 'string') {
    return false;
  }

  // Handle AST dump format (fallback for Python < 3.9)
  if (pythonRuleString.startsWith('__ast_dump__:')) {
    console.warn('[OOT] Cannot evaluate AST dump format, returning false:', pythonRuleString.substring(0, 100));
    return false;
  }

  try {
    // Create evaluation context with helper functions
    const context = createEvaluationContext(snapshot, staticData);

    // Convert Python code to JavaScript and evaluate it
    // Simple transformations:
    // - state.has('Item', player) -> context.hasItem('Item')
    // - state.has_any(...) -> context.hasGroup(...)
    // - is_adult, is_child -> direct context calls

    // For now, we'll try to extract the core logic from common patterns
    let jsCode = pythonRuleString;

    // Replace state.has('ItemName', player) with context.hasItem('ItemName')
    jsCode = jsCode.replace(/state\.has\('([^']+)',\s*player\)/g, "context.hasItem('$1')");
    jsCode = jsCode.replace(/state\.has\("([^"]+)",\s*player\)/g, 'context.hasItem("$1")');

    // Replace state.has_all(...) patterns
    jsCode = jsCode.replace(/state\.has_all\(/g, 'context.hasAllItems(');

    // Replace state.has_any(...) patterns
    jsCode = jsCode.replace(/state\.has_any\(/g, 'context.hasAnyItem(');

    // Replace standalone references to helpers (is_adult, is_child, etc.)
    // These might appear as just the identifier in the Python code
    jsCode = jsCode.replace(/\bis_adult\b/g, 'context.is_adult()');
    jsCode = jsCode.replace(/\bis_child\b/g, 'context.is_child()');
    jsCode = jsCode.replace(/\bat_night\b/g, 'context.at_night()');
    jsCode = jsCode.replace(/\bat_day\b/g, 'context.at_day()');

    // Replace 'and' and 'or' with JavaScript equivalents
    jsCode = jsCode.replace(/\band\b/g, '&&');
    jsCode = jsCode.replace(/\bor\b/g, '||');
    jsCode = jsCode.replace(/\bnot\b/g, '!');

    // Replace True/False with JavaScript equivalents
    jsCode = jsCode.replace(/\bTrue\b/g, 'true');
    jsCode = jsCode.replace(/\bFalse\b/g, 'false');

    // Evaluate the transformed JavaScript code
    const result = eval(jsCode);
    return !!result;

  } catch (error) {
    console.warn(`[OOT] Failed to parse Python rule: ${pythonRuleString}`, error);
    return false; // Fail safe - location not accessible if rule can't be parsed
  }
}

/**
 * Helper functions exported to the registry
 */
export const helperFunctions = {
  /**
   * Parse and evaluate OOT rule DSL
   */
  parse_oot_rule,

  /**
   * Parse and evaluate Python-style rules from Subrules
   */
  parse_oot_python_rule,

  /**
   * Standard has() helper for backward compatibility
   */
  has(snapshot, staticData, itemName) {
    const normalizedName = itemName.replace(/_/g, ' ');
    return (snapshot?.inventory?.[normalizedName] || 0) > 0;
  },

  /**
   * Standard count() helper
   */
  count(snapshot, staticData, itemName) {
    const normalizedName = itemName.replace(/_/g, ' ');
    return snapshot?.inventory?.[normalizedName] || 0;
  },
};
