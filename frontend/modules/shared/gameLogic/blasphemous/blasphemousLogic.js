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
  blood(snapshot, staticData) {
    return this.has(snapshot, staticData, "Blood Perpetuated in Sand");
  },

  /**
   * Check if player has Three Gnarled Tongues relic
   */
  root(snapshot, staticData) {
    return this.has(snapshot, staticData, "Three Gnarled Tongues");
  },

  /**
   * Check if player has Linen of Golden Thread relic
   */
  linen(snapshot, staticData) {
    return this.has(snapshot, staticData, "Linen of Golden Thread");
  },

  /**
   * Check if player has Nail Uprooted from Dirt relic
   */
  nail(snapshot, staticData) {
    return this.has(snapshot, staticData, "Nail Uprooted from Dirt");
  },

  /**
   * Check if player has Shroud of Dreamt Sins relic
   */
  shroud(snapshot, staticData) {
    return this.has(snapshot, staticData, "Shroud of Dreamt Sins");
  },

  // Key helper functions

  /**
   * Check if player has Bronze Key
   */
  bronze_key(snapshot, staticData) {
    return this.has(snapshot, staticData, "Bronze Key");
  },

  /**
   * Check if player has Silver Key
   */
  silver_key(snapshot, staticData) {
    return this.has(snapshot, staticData, "Silver Key");
  },

  /**
   * Check if player has Gold Key
   */
  gold_key(snapshot, staticData) {
    return this.has(snapshot, staticData, "Gold Key");
  },

  /**
   * Check if player has Penitent Key
   */
  penitent_key(snapshot, staticData) {
    return this.has(snapshot, staticData, "Penitent Key");
  },

  /**
   * Check if player has Elder Key
   */
  elder_key(snapshot, staticData) {
    return this.has(snapshot, staticData, "Elder Key");
  },

  // Movement/ability helper functions

  /**
   * Check if player can climb walls
   */
  can_climb(snapshot, staticData) {
    return this.has(snapshot, staticData, "Wall Climb Ability");
  },

  /**
   * Check if player can use dive laser attack
   */
  can_dive_laser(snapshot, staticData) {
    return this.has(snapshot, staticData, "Dive Laser Ability");
  },

  /**
   * Check if player can air dash
   */
  can_air_dash(snapshot, staticData) {
    return this.has(snapshot, staticData, "Air Dash Ability");
  },

  /**
   * Check if player can break holes in walls
   */
  can_break_holes(snapshot, staticData) {
    return this.has(snapshot, staticData, "Break Holes Ability");
  },

  /**
   * Check if player can survive poison
   */
  can_survive_poison(snapshot, staticData) {
    return this.has(snapshot, staticData, "Poison Immunity");
  },

  /**
   * Check if player can walk on roots
   */
  can_walk_on_root(snapshot, staticData) {
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
  flasks(snapshot, staticData) {
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
  quicksilver(snapshot, staticData) {
    const canReach = snapshot?.regions?.includes("D01Z05S01[W]") || false;
    return canReach ? (snapshot?.inventory?.["Quicksilver"] || 0) : 0;
  },

  /**
   * Check if player has boss-beating strength
   * Based on life, sword, fervour, flasks, and quicksilver upgrades
   *
   * Helper function signature: (snapshot, worldOrBossName, bossNameOrStaticData, staticData)
   * - When called with 1 arg from rules: (snapshot, 'world', "warden", staticData)
   * - worldOrBossName will be 'world' (unused)
   * - bossNameOrStaticData will be the actual boss name
   */
  has_boss_strength(snapshot, worldOrBossName, bossNameOrStaticData, staticData) {
    // The boss name is in the third parameter when called from the rule engine
    const bossName = bossNameOrStaticData;

    if (!bossName) {
      return false; // No boss specified
    }

    const life = snapshot?.inventory?.["Life Upgrade"] || 0;
    const sword = snapshot?.inventory?.["Mea Culpa Upgrade"] || 0;
    const fervour = snapshot?.inventory?.["Fervour Upgrade"] || 0;
    const flasks = this.flasks(snapshot, staticData);
    const quicksilver = this.quicksilver(snapshot, staticData);

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
  amanecida_rooms(snapshot, staticData) {
    let total = 0;
    if (this.can_beat_graveyard_boss(snapshot, staticData)) total++;
    if (this.can_beat_jondo_boss(snapshot, staticData)) total++;
    if (this.can_beat_patio_boss(snapshot, staticData)) total++;
    if (this.can_beat_wall_boss(snapshot, staticData)) total++;
    return total;
  },

  /**
   * Count chalice rooms accessible
   */
  chalice_rooms(snapshot, staticData) {
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
  can_beat_brotherhood_boss(snapshot, staticData) {
    return this.has_boss_strength(snapshot, staticData, "warden");
  },

  can_beat_mercy_boss(snapshot, staticData) {
    return this.has_boss_strength(snapshot, staticData, "ten-piedad");
  },

  can_beat_convent_boss(snapshot, staticData) {
    return this.has_boss_strength(snapshot, staticData, "charred-visage");
  },

  can_beat_grievance_boss(snapshot, staticData) {
    return this.has_boss_strength(snapshot, staticData, "tres-angustias");
  },

  can_beat_bridge_boss(snapshot, staticData) {
    return this.has_boss_strength(snapshot, staticData, "esdras");
  },

  can_beat_mothers_boss(snapshot, staticData) {
    return this.has_boss_strength(snapshot, staticData, "melquiades");
  },

  can_beat_canvases_boss(snapshot, staticData) {
    return this.has_boss_strength(snapshot, staticData, "exposito");
  },

  can_beat_prison_boss(snapshot, staticData) {
    return this.has_boss_strength(snapshot, staticData, "quirce");
  },

  can_beat_rooftops_boss(snapshot, staticData) {
    return this.has_boss_strength(snapshot, staticData, "crisanta");
  },

  can_beat_ossuary_boss(snapshot, staticData) {
    return this.has_boss_strength(snapshot, staticData, "isidora");
  },

  can_beat_mourning_boss(snapshot, staticData) {
    return this.has_boss_strength(snapshot, staticData, "sierpes");
  },

  can_beat_graveyard_boss(snapshot, staticData) {
    return this.has_boss_strength(snapshot, staticData, "amanecida");
  },

  can_beat_jondo_boss(snapshot, staticData) {
    return this.has_boss_strength(snapshot, staticData, "amanecida");
  },

  can_beat_patio_boss(snapshot, staticData) {
    return this.has_boss_strength(snapshot, staticData, "amanecida");
  },

  can_beat_wall_boss(snapshot, staticData) {
    return this.has_boss_strength(snapshot, staticData, "amanecida");
  },

  can_beat_hall_boss(snapshot, staticData) {
    return this.has_boss_strength(snapshot, staticData, "laudes");
  },

  canBeatBrotherhoodBoss(snapshot, staticData) {
    return this.can_beat_brotherhood_boss(snapshot, staticData);
  },

  // Missing helper functions from error log

  /**
   * Check if player can perform wall climb
   */
  wallClimb(snapshot, staticData) {
    return this.can_climb(snapshot, staticData);
  },

  /**
   * Check if player has double jump ability
   */
  doubleJump(snapshot, staticData) {
    return this.has(snapshot, staticData, "Double Jump Ability");
  },

  /**
   * Check if player can cross gap of size 2
   */
  canCrossGap2(snapshot, staticData) {
    return this.can_air_dash(snapshot, staticData);
  },

  /**
   * Check if player can cross gap of size 3
   */
  canCrossGap3(snapshot, staticData) {
    return this.can_air_dash(snapshot, staticData) && this.doubleJump(snapshot, staticData);
  },

  /**
   * Check if player has Lorquiana relic
   */
  lorquiana(snapshot, staticData) {
    return this.has(snapshot, staticData, "Incomplete Scapular");
  },

  /**
   * Check if player has charged beam ability
   */
  chargeBeam(snapshot, staticData) {
    return this.has(snapshot, staticData, "Charge Beam Ability");
  },

  /**
   * Check if player has ranged attack
   */
  rangedAttack(snapshot, staticData) {
    return this.has(snapshot, staticData, "Ranged Attack");
  },

  /**
   * Check if player rode the Graveyard of the Peaks elevator
   */
  rodeGotPElevator(snapshot, staticData) {
    return this.can_reach_region(snapshot, staticData, "D02Z02S04[W]");
  },

  /**
   * Check if Desecrated Cistern gate W is opened
   */
  openedDCGateW(snapshot, staticData) {
    return this.has(snapshot, staticData, "DC Gate W");
  },

  /**
   * Check if Desecrated Cistern gate E is opened
   */
  openedDCGateE(snapshot, staticData) {
    return this.has(snapshot, staticData, "DC Gate E");
  },

  /**
   * Check if Desecrated Cistern ladder is opened
   */
  openedDCLadder(snapshot, staticData) {
    return this.has(snapshot, staticData, "DC Ladder");
  },

  /**
   * Check if Wasteland of the Buried Churches gate is opened
   */
  openedWotBCGate(snapshot, staticData) {
    return this.has(snapshot, staticData, "WotBC Gate");
  },

  /**
   * Check if Brotherhood of the Silent Sorrow gate is opened
   */
  openedBotSSGate(snapshot, staticData) {
    return this.has(snapshot, staticData, "BotSS Gate");
  },

  /**
   * Check if Mourning and Havoc gate is opened
   */
  openedMaHGate(snapshot, staticData) {
    return this.has(snapshot, staticData, "MaH Gate");
  },

  /**
   * Check if Archcathedral Rooftops gate is opened
   */
  openedARGate(snapshot, staticData) {
    return this.has(snapshot, staticData, "AR Gate");
  },

  /**
   * Check if Jondo gate is opened
   */
  openedJondoGate(snapshot, staticData) {
    return this.has(snapshot, staticData, "Jondo Gate");
  },

  /**
   * Check if Library gate is opened
   */
  openedLibraryGate(snapshot, staticData) {
    return this.has(snapshot, staticData, "Library Gate");
  },

  /**
   * Check if Patio gate is opened
   */
  openedPatioGate(snapshot, staticData) {
    return this.has(snapshot, staticData, "Patio Gate");
  },

  /**
   * Check if Mother of Mothers gate is opened
   */
  openedMoMGate(snapshot, staticData) {
    return this.has(snapshot, staticData, "MoM Gate");
  },

  /**
   * Check if player can beat Perpetua boss
   */
  canBeatPerpetua(snapshot, staticData) {
    return this.has_boss_strength(snapshot, staticData, "perpetua");
  },

  /**
   * Check if western Jondo bell is broken
   */
  brokeJondoBellW(snapshot, staticData) {
    return this.has(snapshot, staticData, "Jondo Bell W");
  },

  /**
   * Check if eastern Jondo bell is broken
   */
  brokeJondoBellE(snapshot, staticData) {
    return this.has(snapshot, staticData, "Jondo Bell E");
  },

  /**
   * Check if player has double jump ability (Purified Hand of the Nun)
   */
  double_jump(snapshot, staticData) {
    return this.has(snapshot, staticData, "Purified Hand of the Nun");
  },

  /**
   * Check if player has dash ability
   */
  dash(snapshot, staticData) {
    return this.has(snapshot, staticData, "Dash Ability");
  },

  /**
   * Check if player has Dawn Heart
   */
  dawn_heart(snapshot, staticData) {
    return this.has(snapshot, staticData, "Brilliant Heart of Dawn");
  },

  /**
   * Check if player can perform dawn jump
   * Requires Dawn Heart + Dash + difficulty >= 1
   */
  can_dawn_jump(snapshot, staticData) {
    const difficulty = staticData?.settings?.[snapshot.player]?.difficulty ?? 1;
    return (
      this.dawn_heart(snapshot, staticData) &&
      this.dash(snapshot, staticData) &&
      difficulty >= 1
    );
  },

  /**
   * Count ranged skills
   */
  ranged(snapshot, staticData) {
    return snapshot?.inventory?.["Ranged Skill"] || 0;
  },

  /**
   * Check if player can perform air stall
   * Requires ranged > 0 + difficulty >= 1
   */
  can_air_stall(snapshot, staticData) {
    const difficulty = staticData?.settings?.[snapshot.player]?.difficulty ?? 1;
    return (
      this.ranged(snapshot, staticData) > 0 &&
      difficulty >= 1
    );
  },

  /**
   * Count Redento rooms visited
   */
  redento_rooms(snapshot, staticData) {
    const regions = snapshot?.regions || [];
    let count = 0;

    // First meeting
    if (regions.includes("D03Z01S04[E]") || regions.includes("D03Z02S10[N]")) {
      count = 1;

      // Second meeting
      if (regions.includes("D17Z01S05[S]") || regions.includes("D17BZ02S01[FrontR]")) {
        count = 2;

        // Third meeting
        if (regions.includes("D01Z03S04[E]") || regions.includes("D08Z01S01[W]")) {
          count = 3;

          // Fourth meeting
          if (regions.includes("D04Z01S03[E]") || regions.includes("D04Z02S01[W]")) {
            count = 4;

            // Fifth meeting (assuming there's more to the pattern)
            if (regions.includes("D05Z02S12[E]") || regions.includes("D09Z01S01[E]")) {
              count = 5;
            }
          }
        }
      }
    }

    return count;
  },

  /**
   * Check if player has reached 3+ Redento rooms
   */
  redentoRooms3(snapshot, staticData) {
    return this.redento_rooms(snapshot, staticData) >= 3;
  },

  /**
   * Check if player can perform gap cross 3 (intermediate gap)
   */
  can_cross_gap_3(snapshot, staticData) {
    return (
      this.double_jump(snapshot, staticData) ||
      this.can_dawn_jump(snapshot, staticData) ||
      (this.wheel(snapshot, staticData) && this.can_air_stall(snapshot, staticData))
    );
  },

  /**
   * Check if player can perform gap cross 5 (large gap)
   */
  can_cross_gap_5(snapshot, staticData) {
    return (
      this.double_jump(snapshot, staticData) ||
      (this.can_dawn_jump(snapshot, staticData) && this.can_air_stall(snapshot, staticData))
    );
  },

  /**
   * Check if player has the Wheel relic
   */
  wheel(snapshot, staticData) {
    return this.has(snapshot, staticData, "The Young Mason's Wheel");
  },

  /**
   * Check if enemy skips are allowed
   */
  enemy_skips_allowed(snapshot, staticData) {
    const difficulty = staticData?.settings?.[snapshot.player]?.difficulty ?? 1;
    const enemyRandomizer = staticData?.settings?.[snapshot.player]?.enemy_randomizer ?? false;
    return difficulty >= 2 && !enemyRandomizer;
  },

  /**
   * Check if player can enemy bounce
   */
  can_enemy_bounce(snapshot, staticData) {
    return this.enemy_skips_allowed(snapshot, staticData);
  },

  /**
   * Check if player can use any prayer
   */
  can_use_any_prayer(snapshot, staticData) {
    return (
      this.has(snapshot, staticData, "Debla of the Lights") ||
      this.has(snapshot, staticData, "Taranto to my Sister") ||
      this.has(snapshot, staticData, "Verdiales of the Forsaken Hamlet") ||
      this.has(snapshot, staticData, "Zarabanda of the Safe Haven") ||
      this.has(snapshot, staticData, "Tirana") ||
      this.has(snapshot, staticData, "Aubade")
    );
  },

  /**
   * Count total fervour
   */
  total_fervour(snapshot, staticData) {
    const fervourUpgrades = Math.min(6, snapshot?.inventory?.["Fervour Upgrade"] || 0);
    const blueWax = Math.min(3, snapshot?.inventory?.["Bead of Blue Wax"] || 0);
    return 60 + (20 * fervourUpgrades) + (10 * blueWax);
  },

  /**
   * Count holy wounds
   */
  holy_wounds(snapshot, staticData) {
    // Count unique holy wounds in inventory
    let count = 0;
    const wounds = [
      "Holy Wound of Abnegation",
      "Holy Wound of Attrition",
      "Holy Wound of Compunction",
      "Holy Wound of Contrition"
    ];
    for (const wound of wounds) {
      if (this.has(snapshot, staticData, wound)) {
        count++;
      }
    }
    return count;
  },

  /**
   * Count masks
   */
  masks(snapshot, staticData) {
    // Count unique masks in inventory
    let count = 0;
    const maskItems = [
      "Embossed Mask of Crescente",
      "Deformed Mask of Orestes",
      "Mirrored Mask of Dolphos"
    ];
    for (const mask of maskItems) {
      if (this.has(snapshot, staticData, mask)) {
        count++;
      }
    }
    return count;
  },

  /**
   * Count ceremony items (egg items)
   */
  ceremony_items(snapshot, staticData) {
    // Count unique egg ceremony items
    let count = 0;
    const eggItems = [
      "Egg of Deformity"
      // Add other egg items if they exist
    ];
    for (const egg of eggItems) {
      if (this.has(snapshot, staticData, egg)) {
        count++;
      }
    }
    return count;
  },

  /**
   * Check if wall climb ability is available
   */
  wall_climb(snapshot, staticData) {
    return this.has(snapshot, staticData, "Wall Climb Ability");
  },

  /**
   * Count guilt rooms accessible
   */
  guilt_rooms(snapshot, staticData) {
    const doors = [
      "D01Z04S01[NE]",
      "D02Z02S11[W]",
      "D03Z03S02[NE]",
      "D04Z02S02[SE]",
      "D05Z01S05[NE]",
      "D09Z01S05[W]",
      "D17Z01S04[W]"
    ];

    return doors.filter(door =>
      snapshot?.regions?.includes(door) || false
    ).length;
  },

  /**
   * Count sword rooms accessible
   */
  sword_rooms(snapshot, staticData) {
    const doorGroups = [
      ["D01Z02S07[E]", "D01Z02S02[SW]"],
      ["D20Z01S04[E]", "D01Z05S23[W]"],
      ["D02Z03S02[NE]"],
      ["D04Z02S21[NE]"],
      ["D05Z01S21[NW]"],
      ["D06Z01S15[NE]"],
      ["D17Z01S07[SW]"]
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
   * Count Miriam rooms accessible
   */
  miriam_rooms(snapshot, staticData) {
    const doors = [
      "D02Z03S07[NWW]",
      "D03Z03S07[NW]",
      "D04Z04S01[E]",
      "D05Z01S06[W]",
      "D06Z01S17[E]"
    ];

    return doors.filter(door =>
      snapshot?.regions?.includes(door) || false
    ).length;
  },

  /**
   * Count enemies (placeholder - not sure what this counts)
   */
  enemy_count(snapshot, staticData) {
    // This would need the actual implementation from the Python code
    // For now return 0
    return 0;
  },
};