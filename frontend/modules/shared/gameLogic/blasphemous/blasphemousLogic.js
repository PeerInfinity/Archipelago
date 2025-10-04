/**
 * Blasphemous state management module for game-specific logic.
 */
export const blasphemousStateModule = {
  /**
   * Initializes a new Blasphemous game state.
   */
  initializeState() {
    return {
      flags: [], // Checked locations and game-specific flags
      events: [], // Event items
      regions: [], // Accessible regions
      relics: [], // Collected relics
      keys: [], // Collected keys  
      prayers: [], // Learned prayers
      beads: [], // Rosary beads
      abilities: [], // Movement abilities
    };
  },

  /**
   * Loads settings into the game state.
   */
  loadSettings(gameState, settings) {
    return { ...gameState, ...settings };
  },

  /**
   * Processes Blasphemous-specific event items.
   */
  processEventItem(gameState, itemName) {
    return null; // No special event processing needed for now
  },

  /**
   * Returns the Blasphemous state properties for a snapshot.
   */
  getStateForSnapshot(gameState) {
    return {
      flags: gameState.flags || [],
      events: gameState.events || [],
      regions: gameState.regions || [],
      relics: gameState.relics || [],
      keys: gameState.keys || [],
      prayers: gameState.prayers || [],
      beads: gameState.beads || [],
      abilities: gameState.abilities || [],
    };
  },
};

/**
 * Blasphemous helper functions that match the Python Rules.py helper methods.
 */
export const helperFunctions = {
  /**
   * Check if the player has an item (Blasphemous implementation)
   */
  has(snapshot, staticData, itemName) {
    return !!(snapshot?.inventory && snapshot.inventory[itemName] > 0);
  },

  /**
   * Count how many of an item the player has
   */
  count(snapshot, staticData, itemName) {
    return snapshot?.inventory?.[itemName] || 0;
  },

  // Relic helper functions (matching Python Rules.py)
  
  /**
   * Check if player has Blood Perpetuated in Sand relic
   */
  blood(state, staticData) {
    return this.has(snapshot, staticData, "Blood Perpetuated in Sand");
  },

  /**
   * Check if player has Three Gnarled Tongues relic
   */
  root(state, staticData) {
    return this.has(snapshot, staticData, "Three Gnarled Tongues");
  },

  /**
   * Check if player has Linen of Golden Thread relic
   */
  linen(state, staticData) {
    return this.has(snapshot, staticData, "Linen of Golden Thread");
  },

  /**
   * Check if player has Nail Uprooted from Dirt relic
   */
  nail(state, staticData) {
    return this.has(snapshot, staticData, "Nail Uprooted from Dirt");
  },

  /**
   * Check if player has Shroud of Dreamt Sins relic
   */
  shroud(state, staticData) {
    return this.has(snapshot, staticData, "Shroud of Dreamt Sins");
  },

  // Key helper functions

  /**
   * Check if player has Bronze Key
   */
  bronze_key(state, staticData) {
    return this.has(snapshot, staticData, "Bronze Key");
  },

  /**
   * Check if player has Silver Key
   */
  silver_key(state, staticData) {
    return this.has(snapshot, staticData, "Silver Key");
  },

  /**
   * Check if player has Gold Key
   */
  gold_key(state, staticData) {
    return this.has(snapshot, staticData, "Gold Key");
  },

  /**
   * Check if player has Penitent Key
   */
  penitent_key(state, staticData) {
    return this.has(snapshot, staticData, "Penitent Key");
  },

  /**
   * Check if player has Elder Key
   */
  elder_key(state, staticData) {
    return this.has(snapshot, staticData, "Elder Key");
  },

  // Movement/ability helper functions

  /**
   * Check if player can climb walls
   */
  can_climb(state, staticData) {
    return this.has(snapshot, staticData, "Wall Climb Ability");
  },

  /**
   * Check if player can use dive laser attack
   */
  can_dive_laser(state, staticData) {
    return this.has(snapshot, staticData, "Dive Laser Ability");
  },

  /**
   * Check if player can air dash
   */
  can_air_dash(state, staticData) {
    return this.has(snapshot, staticData, "Air Dash Ability");
  },

  /**
   * Check if player can break holes in walls
   */
  can_break_holes(state, staticData) {
    return this.has(snapshot, staticData, "Break Holes Ability");
  },

  /**
   * Check if player can survive poison
   */
  can_survive_poison(state, staticData) {
    return this.has(snapshot, staticData, "Poison Immunity");
  },

  /**
   * Check if player can walk on roots
   */
  can_walk_on_root(state, staticData) {
    return this.has(snapshot, staticData, "Root Walking Ability");
  },

  // Boss defeat checks (placeholder implementations)
  
  /**
   * Check if player can defeat a boss (generic)
   */
  can_defeat_boss(snapshot, staticData, bossName) {
    // For now, assume always true - this would need specific boss logic
    return true;
  },

  // Region accessibility helpers
  
  /**
   * Check if player can reach a specific region
   */
  can_reach_region(snapshot, staticData, regionName) {
    return snapshot?.regions?.includes(regionName) || false;
  },

  // Generic helper for any item requirement
  has_item(snapshot, staticData, itemName) {
    return this.has(snapshot, staticData, itemName);
  },

  // Prayer helpers
  has_prayer(snapshot, staticData, prayerName) {
    return this.has(snapshot, staticData, prayerName);
  },

  // Rosary bead helpers
  has_bead(snapshot, staticData, beadName) {
    return this.has(snapshot, staticData, beadName);
  },

  /**
   * Count available flasks (requires reaching specific regions)
   */
  flasks(state, staticData) {
    const doors = [
      "D01Z05S05[SW]",
      "D02Z02S04[W]",
      "D03Z02S08[W]",
      "D03Z03S04[SW]",
      "D04Z02S13[W]",
      "D05Z01S08[NW]",
      "D20Z01S07[NE]"
    ];

    // Check if any flask region is reachable
    const hasFlaskRegion = doors.some(door =>
      snapshot?.regions?.includes(door) || false
    );

    return hasFlaskRegion ? (snapshot?.inventory?.["Empty Bile Vessel"] || 0) : 0;
  },

  /**
   * Count quicksilver (requires reaching D01Z05S01[W])
   */
  quicksilver(state, staticData) {
    const canReach = snapshot?.regions?.includes("D01Z05S01[W]") || false;
    return canReach ? (snapshot?.inventory?.["Quicksilver"] || 0) : 0;
  },

  /**
   * Check if player has boss-beating strength
   * Based on life, sword, fervour, flasks, and quicksilver upgrades
   *
   * Helper function signature: (state, worldOrBossName, bossNameOrStaticData, staticData)
   * - When called with 1 arg from rules: (state, 'world', "warden", staticData)
   * - worldOrBossName will be 'world' (unused)
   * - bossNameOrStaticData will be the actual boss name
   */
  has_boss_strength(state, worldOrBossName, bossNameOrStaticData, staticData) {
    // The boss name is in the third parameter when called from the rule engine
    const bossName = bossNameOrStaticData;

    if (!bossName) {
      return false; // No boss specified
    }

    const life = snapshot?.inventory?.["Life Upgrade"] || 0;
    const sword = snapshot?.inventory?.["Mea Culpa Upgrade"] || 0;
    const fervour = snapshot?.inventory?.["Fervour Upgrade"] || 0;
    const flasks = this.flasks(state, staticData);
    const quicksilver = this.quicksilver(state, staticData);

    // Calculate player strength (normalized 0-1 scale)
    const playerStrength = (
      Math.min(6, life) * 0.25 / 6 +
      Math.min(7, sword) * 0.25 / 7 +
      Math.min(6, fervour) * 0.20 / 6 +
      Math.min(8, flasks) * 0.15 / 8 +
      Math.min(5, quicksilver) * 0.15 / 5
    );

    // Boss strength thresholds
    const bosses = {
      "warden": -0.10,
      "ten-piedad": 0.05,
      "charred-visage": 0.20,
      "tres-angustias": 0.15,
      "esdras": 0.25,
      "melquiades": 0.25,
      "exposito": 0.30,
      "quirce": 0.35,
      "crisanta": 0.50,
      "isidora": 0.70,
      "sierpes": 0.70,
      "amanecida": 0.60,
      "laudes": 0.60,
      "perpetua": -0.05,
      "legionary": 0.20
    };

    const bossStrength = bosses[bossName];
    if (bossStrength === undefined) {
      return false; // Unknown boss
    }

    // Default difficulty adjustment (assume normal difficulty = 1)
    // Without difficulty setting, use normal: bossStrength + 0 (no adjustment)
    const difficulty = staticData?.settings?.[snapshot.player]?.difficulty ?? 1;
    const adjustment = difficulty >= 2 ? -0.10 : (difficulty >= 1 ? 0 : 0.10);

    return playerStrength >= (bossStrength + adjustment);
  },

  /**
   * Count Amanecida rooms defeated
   */
  amanecida_rooms(state, staticData) {
    let total = 0;
    if (this.can_beat_graveyard_boss(state, staticData)) total++;
    if (this.can_beat_jondo_boss(state, staticData)) total++;
    if (this.can_beat_patio_boss(state, staticData)) total++;
    if (this.can_beat_wall_boss(state, staticData)) total++;
    return total;
  },

  /**
   * Count chalice rooms accessible
   */
  chalice_rooms(state, staticData) {
    const doorGroups = [
      ["D03Z01S02[E]", "D01Z05S02[W]", "D20Z01S03[N]"],
      ["D05Z01S11[SE]", "D05Z02S02[NW]"],
      ["D09Z01S09[E]", "D09Z01S10[W]", "D09Z01S08[SE]", "D09Z01S02[SW]"]
    ];

    let total = 0;
    for (const subDoors of doorGroups) {
      for (const door of subDoors) {
        if (snapshot?.regions?.includes(door)) {
          total++;
          break; // Only count one door per group
        }
      }
    }
    return total;
  },

  /**
   * Boss defeat helpers - delegate to has_boss_strength
   */
  can_beat_brotherhood_boss(state, staticData) {
    return this.has_boss_strength(snapshot, staticData, "warden");
  },

  can_beat_mercy_boss(state, staticData) {
    return this.has_boss_strength(snapshot, staticData, "ten-piedad");
  },

  can_beat_convent_boss(state, staticData) {
    return this.has_boss_strength(snapshot, staticData, "charred-visage");
  },

  can_beat_grievance_boss(state, staticData) {
    return this.has_boss_strength(snapshot, staticData, "tres-angustias");
  },

  can_beat_bridge_boss(state, staticData) {
    return this.has_boss_strength(snapshot, staticData, "esdras");
  },

  can_beat_mothers_boss(state, staticData) {
    return this.has_boss_strength(snapshot, staticData, "melquiades");
  },

  can_beat_canvases_boss(state, staticData) {
    return this.has_boss_strength(snapshot, staticData, "exposito");
  },

  can_beat_prison_boss(state, staticData) {
    return this.has_boss_strength(snapshot, staticData, "quirce");
  },

  can_beat_rooftops_boss(state, staticData) {
    return this.has_boss_strength(snapshot, staticData, "crisanta");
  },

  can_beat_ossuary_boss(state, staticData) {
    return this.has_boss_strength(snapshot, staticData, "isidora");
  },

  can_beat_mourning_boss(state, staticData) {
    return this.has_boss_strength(snapshot, staticData, "sierpes");
  },

  can_beat_graveyard_boss(state, staticData) {
    return this.has_boss_strength(snapshot, staticData, "amanecida");
  },

  can_beat_jondo_boss(state, staticData) {
    return this.has_boss_strength(snapshot, staticData, "amanecida");
  },

  can_beat_patio_boss(state, staticData) {
    return this.has_boss_strength(snapshot, staticData, "amanecida");
  },

  can_beat_wall_boss(state, staticData) {
    return this.has_boss_strength(snapshot, staticData, "amanecida");
  },

  can_beat_hall_boss(state, staticData) {
    return this.has_boss_strength(snapshot, staticData, "laudes");
  },

  canBeatBrotherhoodBoss(state, staticData) {
    return this.can_beat_brotherhood_boss(state, staticData);
  },
};