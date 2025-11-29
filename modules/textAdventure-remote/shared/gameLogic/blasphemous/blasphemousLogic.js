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
    const status = snapshot?.regionReachability?.[regionName];
    return status === 'reachable' || status === 'checked';
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
    const hasFlaskRegion = doors.some(door => {
      const status = snapshot?.regionReachability?.[door];
      return status === 'reachable' || status === 'checked';
    });

    return hasFlaskRegion ? (snapshot?.inventory?.["Empty Bile Vessel"] || 0) : 0;
  },

  /**
   * Count quicksilver (requires reaching D01Z05S01[W])
   */
  quicksilver(snapshot, staticData) {
    const status = snapshot?.regionReachability?.["D01Z05S01[W]"];
    const canReach = status === 'reachable' || status === 'checked';
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
  has_boss_strength(snapshot, staticData, bossName) {
    // New unified calling convention: (snapshot, staticData, bossName)
    // executeHelper always passes (snapshot, staticData, ...evaluatedArgs)
    // For rules with args: [{"type": "constant", "value": "warden"}]
    // This becomes: has_boss_strength(snapshot, staticData, "warden")

    // Calculate player strength based on current upgrades
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

    // Default difficulty adjustment (assume normal difficulty = 1)
    // Without difficulty setting, use normal: bossStrength + 0 (no adjustment)
    const difficulty = staticData?.settings?.[snapshot.player]?.difficulty ?? 1;
    const adjustment = difficulty >= 2 ? -0.10 : (difficulty >= 1 ? 0 : 0.10);

    if (!bossName) {
      // No boss specified - check if player can beat the easiest bosses
      // Easiest bosses are warden (-0.10) and perpetua (-0.05)
      // Return true only if player strength >= 0 (after difficulty adjustment of +0.10 for easiest)
      // This means with 0 upgrades (playerStrength = 0), can beat bosses with threshold <= -0.10
      const easiestThreshold = -0.10; // warden's threshold
      return playerStrength >= (easiestThreshold + adjustment);
    }

    const bossStrength = bosses[bossName];
    if (bossStrength === undefined) {
      return false; // Unknown boss
    }

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
        const status = snapshot?.regionReachability?.[door];
        if (status === 'reachable' || status === 'checked') {
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
    return (
      this.has_boss_strength(snapshot, staticData, "amanecida") &&
      this.wallClimb(snapshot, staticData) &&
      this.can_reach_region(snapshot, staticData, "D01Z06S01[Santos]") &&
      this.can_reach_region(snapshot, staticData, "D02Z03S18[NW]") &&
      this.can_reach_region(snapshot, staticData, "D02Z02S03[NE]")
    );
  },

  can_beat_jondo_boss(snapshot, staticData) {
    return (
      this.has_boss_strength(snapshot, staticData, "amanecida") &&
      this.can_reach_region(snapshot, staticData, "D01Z06S01[Santos]") &&
      (
        this.can_reach_region(snapshot, staticData, "D20Z01S06[NE]") ||
        this.can_reach_region(snapshot, staticData, "D20Z01S04[W]")
      ) &&
      (
        this.can_reach_region(snapshot, staticData, "D03Z01S04[E]") ||
        this.can_reach_region(snapshot, staticData, "D03Z02S10[N]")
      )
    );
  },

  can_beat_patio_boss(snapshot, staticData) {
    return (
      this.has_boss_strength(snapshot, staticData, "amanecida") &&
      this.can_reach_region(snapshot, staticData, "D01Z06S01[Santos]") &&
      this.can_reach_region(snapshot, staticData, "D06Z01S02[W]") &&
      (
        this.can_reach_region(snapshot, staticData, "D04Z01S03[E]") ||
        this.can_reach_region(snapshot, staticData, "D04Z01S01[W]") ||
        this.can_reach_region(snapshot, staticData, "D06Z01S18[-Cherubs]")
      )
    );
  },

  can_beat_wall_boss(snapshot, staticData) {
    return (
      this.has_boss_strength(snapshot, staticData, "amanecida") &&
      this.can_reach_region(snapshot, staticData, "D01Z06S01[Santos]") &&
      this.can_reach_region(snapshot, staticData, "D09Z01S09[Cell24]") &&
      (
        this.can_reach_region(snapshot, staticData, "D09Z01S11[E]") ||
        this.can_reach_region(snapshot, staticData, "D06Z01S13[W]")
      )
    );
  },

  can_beat_hall_boss(snapshot, staticData) {
    return (
      this.has_boss_strength(snapshot, staticData, "laudes") &&
      (
        this.can_reach_region(snapshot, staticData, "D08Z01S02[NE]") ||
        this.can_reach_region(snapshot, staticData, "D08Z03S02[NW]")
      )
    );
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
    // Check if the gate has been opened from either side
    // The D01Z04S09[W] check creates a circular dependency, so we only check D01Z05S10[SE]
    // Once we can reach D01Z05S10[SE], the gate is considered open
    return this.can_reach_region(snapshot, staticData, "D01Z05S10[SE]");
  },

  /**
   * Check if Desecrated Cistern ladder is opened
   * The ladder can be opened from either side:
   * - From above (D01Z05S25[NE])
   * - From below (D01Z05S02[S])
   */
  openedDCLadder(snapshot, staticData) {
    return (
      this.can_reach_region(snapshot, staticData, "D01Z05S25[NE]") ||
      this.can_reach_region(snapshot, staticData, "D01Z05S02[S]")
    );
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
    const reachability = snapshot?.regionReachability || {};
    const isReachable = (region) => {
      const status = reachability[region];
      return status === 'reachable' || status === 'checked';
    };

    let count = 0;

    // First meeting
    if (isReachable("D03Z01S04[E]") || isReachable("D03Z02S10[N]")) {
      count = 1;

      // Second meeting
      if (isReachable("D17Z01S05[S]") || isReachable("D17BZ02S01[FrontR]")) {
        count = 2;

        // Third meeting
        if (isReachable("D01Z03S04[E]") || isReachable("D08Z01S01[W]")) {
          count = 3;

          // Fourth meeting
          if (isReachable("D04Z01S03[E]") || isReachable("D04Z02S01[W]") || isReachable("D06Z01S18[-Cherubs]")) {
            count = 4;

            // Fifth meeting - requires knots >= 1 AND limestones >= 3 AND reaching specific regions
            const hasKnots = this.knots(snapshot, staticData) >= 1;
            const hasLimestones = this.limestones(snapshot, staticData) >= 3;

            if (hasKnots && hasLimestones &&
                (isReachable("D04Z02S08[E]") || isReachable("D04BZ02S01[Redento]"))) {
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
   * Prayer helpers matching Python Rules.py
   */
  debla(snapshot, staticData) {
    return this.has(snapshot, staticData, "Debla of the Lights");
  },

  lorquiana(snapshot, staticData) {
    return this.has(snapshot, staticData, "Lorquiana");
  },

  zarabanda(snapshot, staticData) {
    return this.has(snapshot, staticData, "Zarabanda of the Safe Haven");
  },

  taranto(snapshot, staticData) {
    return this.has(snapshot, staticData, "Taranto to my Sister");
  },

  verdiales(snapshot, staticData) {
    return this.has(snapshot, staticData, "Verdiales of the Forsaken Hamlet");
  },

  cante(snapshot, staticData) {
    return this.has(snapshot, staticData, "Cante Jondo of the Three Sisters");
  },

  cantina(snapshot, staticData) {
    return this.has(snapshot, staticData, "Cantina of the Blue Rose");
  },

  tiento(snapshot, staticData) {
    return this.has(snapshot, staticData, "Tiento to my Sister");
  },

  aubade(snapshot, staticData) {
    return (
      this.has(snapshot, staticData, "Aubade of the Nameless Guardian") &&
      this.total_fervour(snapshot, staticData) >= 90
    );
  },

  tirana(snapshot, staticData) {
    return (
      this.has(snapshot, staticData, "Tirana of the Celestial Bastion") &&
      this.total_fervour(snapshot, staticData) >= 90
    );
  },

  ruby(snapshot, staticData) {
    return this.has(snapshot, staticData, "Cloistered Ruby");
  },

  pillar(snapshot, staticData) {
    return (
      this.debla(snapshot, staticData) ||
      this.taranto(snapshot, staticData) ||
      this.ruby(snapshot, staticData)
    );
  },

  any_small_prayer(snapshot, staticData) {
    return (
      this.debla(snapshot, staticData) ||
      this.lorquiana(snapshot, staticData) ||
      this.zarabanda(snapshot, staticData) ||
      this.taranto(snapshot, staticData) ||
      this.verdiales(snapshot, staticData) ||
      this.cante(snapshot, staticData) ||
      this.cantina(snapshot, staticData) ||
      this.tiento(snapshot, staticData) ||
      this.has(snapshot, staticData, "Campanillero to the Sons of the Aurora") ||
      this.has(snapshot, staticData, "Mirabras of the Return to Port") ||
      this.has(snapshot, staticData, "Romance to the Crimson Mist") ||
      this.has(snapshot, staticData, "Saeta Dolorosa") ||
      this.has(snapshot, staticData, "Seguiriya to your Eyes like Stars") ||
      this.has(snapshot, staticData, "Verdiales of the Forsaken Hamlet") ||
      this.has(snapshot, staticData, "Zambra to the Resplendent Crown")
    );
  },

  /**
   * Check if player can use any prayer
   */
  can_use_any_prayer(snapshot, staticData) {
    return (
      this.any_small_prayer(snapshot, staticData) ||
      this.tirana(snapshot, staticData) ||
      this.aubade(snapshot, staticData)
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
   * Count tentudia remains
   */
  tentudia_remains(snapshot, staticData) {
    // Count unique Tentudia's remains items in inventory
    let count = 0;
    const tentudiaItems = [
      "Tentudia's Carnal Remains",
      "Remains of Tentudia's Hair",
      "Tentudia's Skeletal Remains"
    ];
    for (const item of tentudiaItems) {
      if (this.has(snapshot, staticData, item)) {
        count++;
      }
    }
    return count;
  },

  /**
   * Count herbs for Tirso quest
   */
  herbs(snapshot, staticData) {
    // Count unique herbs given to Tirso
    let count = 0;
    const herbItems = [
      "Olive Seeds",
      "Dried Clove",
      "Bouquet of Thyme",
      "Sooty Garlic",
      "Incense Garlic",
      "Bouquet of Rosemary"
    ];
    for (const item of herbItems) {
      if (this.has(snapshot, staticData, item)) {
        count++;
      }
    }
    return count;
  },

  /**
   * Count bones collected
   */
  bones(snapshot, staticData) {
    // Count unique bone items (from Items.py bones group)
    let count = 0;
    const boneItems = [
      "Parietal bone of Lasser, the Inquisitor",
      "Jaw of Ashgan, the Inquisitor",
      "Cervical vertebra of Zicher, the Brewmaster",
      "Clavicle of Dalhuisen, the Schoolchild",
      "Sternum of Vitas, the Performer",
      "Ribs of Sabnock, the Guardian",
      "Vertebra of John, the Gambler",
      "Scapula of Carlos, the Executioner",
      "Humerus of McMittens, the Nurse",
      "Ulna of Koke, the Troubadour",
      "Radius of Helzer, the Poet",
      "Frontal of Martinus, the Ropemaker",
      "Metacarpus of Hodges, the Blacksmith",
      "Phalanx of Arthur, the Sailor",
      "Phalanx of Miriam, the Counsellor",
      "Phalanx of Brannon, the Gravedigger",
      "Coxal of June, the Prostitute",
      "Sacrum of the Dark Warlock",
      "Coccyx of Daniel, the Possessed",
      "Femur of Karpow, the Bounty Hunter",
      "Kneecap of Sebastien, the Puppeteer",
      "Tibia of Alsahli, the Mystic",
      "Fibula of Rysp, the Ranger",
      "Temporal of Joel, the Thief",
      "Metatarsus of Rikusyo, the Traveller",
      "Phalanx of Zeth, the Prisoner",
      "Phalanx of William, the Sceptic",
      "Phalanx of Aralcarim, the Archivist",
      "Occipital of Tequila, the Metalsmith",
      "Maxilla of Tarradax, the Cleric",
      "Nasal bone of Charles, the Artist",
      "Hyoid bone of Senex, the Beggar",
      "Vertebra of Lindquist, the Forger",
      "Trapezium of Jeremiah, the Hangman",
      "Trapezoid of Yeager, the Jeweller",
      "Capitate of Barock, the Herald",
      "Hamate of Vukelich, the Copyist",
      "Pisiform of Hernandez, the Explorer",
      "Triquetral of Luca, the Tailor",
      "Lunate of Keiya, the Butcher",
      "Scaphoid of Fierce, the Leper",
      "Anklebone of Weston, the Pilgrim",
      "Calcaneum of Persian, the Bandit",
      "Navicular of Kahnnyhoo, the Murderer"
    ];
    for (const item of boneItems) {
      if (this.has(snapshot, staticData, item)) {
        count++;
      }
    }
    return count;
  },

  /**
   * Count egg ceremony items
   * These are the three items needed for the egg ceremony
   */
  egg_items(snapshot, staticData) {
    // Count unique egg ceremony items
    let count = 0;
    const eggItems = [
      "Black Grieving Veil",
      "Melted Golden Coins",
      "Torn Bridal Ribbon"
    ];
    for (const item of eggItems) {
      if (this.has(snapshot, staticData, item)) {
        count++;
      }
    }
    return count;
  },

  /**
   * Count toe items (for Redento quest - limestones)
   * Python equivalent: state.count_group_unique("toe", self.player)
   */
  toes(snapshot, staticData) {
    // Count unique toe items in the "toe" group
    let count = 0;
    const toeItems = [
      "Little Toe made of Limestone",
      "Big Toe made of Limestone",
      "Fourth Toe made of Limestone"
    ];
    for (const item of toeItems) {
      if (this.has(snapshot, staticData, item)) {
        count++;
      }
    }
    return count;
  },

  /**
   * Count refuge marks
   */
  refuge_marks(snapshot, staticData) {
    // Count unique refuge marks
    let count = 0;
    const markItems = [
      "Mark of the Second Refuge",
      "Mark of the First Refuge",
      "Mark of the Third Refuge"
    ];
    for (const item of markItems) {
      if (this.has(snapshot, staticData, item)) {
        count++;
      }
    }
    return count;
  },

  /**
   * Count eye items (for Traitor quest)
   * Python equivalent: state.count_group_unique("eye", self.player)
   */
  eyes(snapshot, staticData) {
    // Count unique eye items in the "eye" group
    let count = 0;
    const eyeItems = [
      "Severed Right Eye of the Traitor",
      "Broken Left Eye of the Traitor"
    ];
    for (const item of eyeItems) {
      if (this.has(snapshot, staticData, item)) {
        count++;
      }
    }
    return count;
  },

  /**
   * Convert value to boolean
   */
  bool(snapshot, staticData, value) {
    return !!value;
  },

  /**
   * Check if enemy skips are allowed
   * Requires difficulty >= 2 and enemy_randomizer is false
   */
  enemy_skips_allowed(snapshot, staticData) {
    const difficulty = staticData?.settings?.[snapshot.player]?.difficulty ?? 1;
    const enemyRandomizer = staticData?.settings?.[snapshot.player]?.enemy_randomizer ?? false;
    return difficulty >= 2 && !enemyRandomizer;
  },

  /**
   * Alias for enemy_skips_allowed
   */
  enemySkipsAllowed(snapshot, staticData) {
    return this.enemy_skips_allowed(snapshot, staticData);
  },

  /**
   * Check if obscure skips are allowed
   * Requires difficulty >= 2
   */
  obscure_skips_allowed(snapshot, staticData) {
    const difficulty = staticData?.settings?.[snapshot.player]?.difficulty ?? 1;
    return difficulty >= 2;
  },

  /**
   * Alias for obscure_skips_allowed
   */
  obscureSkipsAllowed(snapshot, staticData) {
    return this.obscure_skips_allowed(snapshot, staticData);
  },

  /**
   * Check if precise skips are allowed
   * Requires difficulty >= 2
   */
  precise_skips_allowed(snapshot, staticData) {
    const difficulty = staticData?.settings?.[snapshot.player]?.difficulty ?? 1;
    return difficulty >= 2;
  },

  /**
   * Alias for precise_skips_allowed
   */
  preciseSkipsAllowed(snapshot, staticData) {
    return this.precise_skips_allowed(snapshot, staticData);
  },

  /**
   * Check if player has bronze key (Key of the Secular)
   */
  bronze_key(snapshot, staticData) {
    return this.has(snapshot, staticData, "Key of the Secular");
  },

  /**
   * Check if player has silver key (Key of the Scribe)
   */
  silver_key(snapshot, staticData) {
    return this.has(snapshot, staticData, "Key of the Scribe");
  },

  /**
   * Check if player has gold key (Key of the Inquisitor)
   */
  gold_key(snapshot, staticData) {
    return this.has(snapshot, staticData, "Key of the Inquisitor");
  },

  /**
   * Check if player has peaks key (Key of the High Peaks)
   */
  peaks_key(snapshot, staticData) {
    return this.has(snapshot, staticData, "Key of the High Peaks");
  },

  /**
   * Check if player has elder key
   */
  elder_key(snapshot, staticData) {
    return this.has(snapshot, staticData, "Key to the Chamber of the Eldest Brother");
  },

  /**
   * Check if player has wood key
   */
  wood_key(snapshot, staticData) {
    return this.has(snapshot, staticData, "Key Grown from Twisted Wood");
  },

  /**
   * Aliases for key helpers (matching Python string rules)
   */
  bronzeKey(snapshot, staticData) {
    return this.bronze_key(snapshot, staticData);
  },

  silverKey(snapshot, staticData) {
    return this.silver_key(snapshot, staticData);
  },

  goldKey(snapshot, staticData) {
    return this.gold_key(snapshot, staticData);
  },

  peaksKey(snapshot, staticData) {
    return this.peaks_key(snapshot, staticData);
  },

  elderKey(snapshot, staticData) {
    return this.elder_key(snapshot, staticData);
  },

  woodKey(snapshot, staticData) {
    return this.wood_key(snapshot, staticData);
  },

  /**
   * Count red wax beads
   */
  red_wax(snapshot, staticData) {
    return this.count(snapshot, staticData, "Bead of Red Wax");
  },

  /**
   * Count blue wax beads
   */
  blue_wax(snapshot, staticData) {
    return this.count(snapshot, staticData, "Bead of Blue Wax");
  },

  /**
   * Check if player has at least 1 blue wax bead
   */
  blueWax1(snapshot, staticData) {
    return this.blue_wax(snapshot, staticData) >= 1;
  },

  /**
   * Check if player has at least 3 blue wax beads
   */
  blueWax3(snapshot, staticData) {
    return this.blue_wax(snapshot, staticData) >= 3;
  },

  /**
   * Check if player has at least 1 red wax bead
   */
  redWax1(snapshot, staticData) {
    return this.red_wax(snapshot, staticData) >= 1;
  },

  /**
   * Check if player has at least 3 red wax beads
   */
  redWax3(snapshot, staticData) {
    return this.red_wax(snapshot, staticData) >= 3;
  },

  /**
   * Count ceremony items (egg items)
   * This counts the three items in the "egg" group needed for the egg ceremony
   * Python equivalent: state.count_group_unique("egg", self.player)
   */
  ceremony_items(snapshot, staticData) {
    // Delegate to egg_items() which has the correct implementation
    return this.egg_items(snapshot, staticData);
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

    return doors.filter(door => {
      const status = snapshot?.regionReachability?.[door];
      return status === 'reachable' || status === 'checked';
    }).length;
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
        const status = snapshot?.regionReachability?.[door];
        if (status === 'reachable' || status === 'checked') {
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

    return doors.filter(door => {
      const status = snapshot?.regionReachability?.[door];
      return status === 'reachable' || status === 'checked';
    }).length;
  },

  /**
   * Count enemies (placeholder - not sure what this counts)
   */
  enemy_count(snapshot, staticData) {
    // This would need the actual implementation from the Python code
    // For now return 0
    return 0;
  },

  /**
   * Check if player can perform water jump
   * Requires either Nail Uprooted from Dirt OR Purified Hand of the Nun (double jump)
   */
  canWaterJump(snapshot, staticData) {
    return (
      this.nail(snapshot, staticData) ||
      this.double_jump(snapshot, staticData)
    );
  },

  /**
   * Check if player can walk on roots (camelCase version for exported rules)
   */
  canWalkOnRoot(snapshot, staticData) {
    return this.root(snapshot, staticData);
  },

  /**
   * Check if player can perform air stall (camelCase version for exported rules)
   */
  canAirStall(snapshot, staticData) {
    return this.can_air_stall(snapshot, staticData);
  },

  /**
   * Count unique masks in inventory
   */
  masks(snapshot, staticData) {
    const maskItems = [
      "Deformed Mask of Orestes",
      "Mirrored Mask of Dolphos",
      "Embossed Mask of Crescente"
    ];
    return maskItems.filter(mask => this.has(snapshot, staticData, mask)).length;
  },

  /**
   * Check if player has at least 2 masks
   */
  masks2(snapshot, staticData) {
    return this.masks(snapshot, staticData) >= 2;
  },

  /**
   * Check if player has all 3 masks
   */
  masks3(snapshot, staticData) {
    return this.masks(snapshot, staticData) >= 3;
  },

  /**
   * Check if the Mother of Mothers ladder has been opened
   * The ladder is opened if any of these regions have been reached
   */
  openedMoMLadder(snapshot, staticData) {
    const regions = [
      "D04Z02S11[E]",
      "D04Z02S09[W]",
      "D06Z01S23[S]",
      "D04Z02S04[N]"
    ];

    const reachability = snapshot?.regionReachability || {};
    return regions.some(region => {
      const status = reachability[region];
      return status === 'reachable' || status === 'checked';
    });
  },

  /**
   * Check if the TSC gate has been opened
   * The gate is opened if either of these regions have been reached
   */
  openedTSCGate(snapshot, staticData) {
    const regions = [
      "D05Z02S06[SE]",
      "D05Z01S21[-Cherubs]"
    ];

    const reachability = snapshot?.regionReachability || {};
    return regions.some(region => {
      const status = reachability[region];
      return status === 'reachable' || status === 'checked';
    });
  },

  /**
   * Check if the AR ladder has been opened
   * The ladder is opened if any of these regions have been reached
   */
  openedARLadder(snapshot, staticData) {
    const regions = [
      "D06Z01S22[Sword]",
      "D06Z01S20[W]",
      "D04Z02S06[N]"
    ];

    const reachability = snapshot?.regionReachability || {};
    return regions.some(region => {
      const status = reachability[region];
      return status === 'reachable' || status === 'checked';
    });
  },

  /**
   * Count Child of Moonlight items (cherubs)
   */
  cherubs(snapshot, staticData) {
    return snapshot?.inventory?.["Child of Moonlight"] || 0;
  },

  /**
   * Check if player has at least 30 bones
   */
  bones30(snapshot, staticData) {
    return this.bones(snapshot, staticData) >= 30;
  },

  /**
   * Check if player has at least 3 holy wounds
   */
  holyWounds3(snapshot, staticData) {
    return this.holy_wounds(snapshot, staticData) >= 3;
  },

  /**
   * Check if player has the Golden Thimble Filled with Burning Oil
   */
  fullThimble(snapshot, staticData) {
    return this.has(snapshot, staticData, "Golden Thimble Filled with Burning Oil");
  },

  /**
   * Check if player has the Incomplete Scapular
   */
  scapular(snapshot, staticData) {
    return this.has(snapshot, staticData, "Incomplete Scapular");
  },

  /**
   * Count traitor eyes (eye items)
   */
  traitor_eyes(snapshot, staticData) {
    return this.eyes(snapshot, staticData);
  },

  /**
   * Count marks of refuge
   */
  marks_of_refuge(snapshot, staticData) {
    return this.refuge_marks(snapshot, staticData);
  },

  /**
   * Check if player can survive poison level 3
   * Requires lung OR (hard difficulty + tiento prayer + 120 fervour)
   */
  canSurvivePoison3(snapshot, staticData) {
    const hasLung = this.has(snapshot, staticData, "Silvered Lung of Dolphos");
    if (hasLung) return true;

    const settings = staticData?.settings || {};
    const difficulty = settings.difficulty || 0;
    const hasTiento = this.has(snapshot, staticData, "Tiento to your Thorned Hairs");
    const totalFervour = this.total_fervour(snapshot, staticData);

    return difficulty >= 2 && hasTiento && totalFervour >= 120;
  },

  /**
   * Check if redento has been met 5 times (requires accessing 5 redento regions)
   */
  redentoRooms5(snapshot, staticData) {
    return this.redento_rooms(snapshot, staticData) >= 5;
  },

  /**
   * Check if player can cross a 6-tile gap (requires double jump)
   */
  canCrossGap6(snapshot, staticData) {
    return this.double_jump(snapshot, staticData);
  },

  /**
   * Check if player can cross a 9-tile gap
   * Requires double jump + (dawn jump OR wheel + air stall)
   */
  canCrossGap9(snapshot, staticData) {
    const hasDoubleJump = this.double_jump(snapshot, staticData);
    if (!hasDoubleJump) return false;

    const hasDawnJump = this.can_dawn_jump(snapshot, staticData);
    if (hasDawnJump) return true;

    const hasWheel = this.wheel(snapshot, staticData);
    const hasAirStall = this.can_air_stall(snapshot, staticData);
    return hasWheel && hasAirStall;
  },

  /**
   * Check if player can perform enemy skips AND has double jump
   */
  EnemySkipsAndDoubleJump(snapshot, staticData) {
    return this.enemy_skips_allowed(snapshot, staticData) &&
           this.double_jump(snapshot, staticData);
  },

  /**
   * Check if DC gate (west) has been opened
   */
  openedDCGateW(snapshot, staticData) {
    const regions = [
      "D20Z01S04[E]",
      "D01Z05S23[W]"
    ];

    const reachability = snapshot?.regionReachability || {};
    return regions.some(region => {
      const status = reachability[region];
      return status === 'reachable' || status === 'checked';
    });
  },

  /**
   * Check if DC gate (east) has been opened
   */
  openedDCGateE(snapshot, staticData) {
    const regions = [
      "D01Z05S10[SE]",
      "D01Z04S09[W]"
    ];

    const reachability = snapshot?.regionReachability || {};
    return regions.some(region => {
      const status = reachability[region];
      return status === 'reachable' || status === 'checked';
    });
  },

  /**
   * Check if DC ladder has been opened
   */
  openedDCLadder(snapshot, staticData) {
    const regions = [
      "D01Z05S25[NE]",
      "D01Z05S02[S]"
    ];

    const reachability = snapshot?.regionReachability || {};
    return regions.some(region => {
      const status = reachability[region];
      return status === 'reachable' || status === 'checked';
    });
  },

  /**
   * Check if WOTW cave has been opened
   */
  openedWOTWCave(snapshot, staticData) {
    const regions = [
      "D02Z01S01[SW]",
      "D02Z01S08[E]",  // With wall climb
      "D02Z01S02[]"
    ];

    const reachability = snapshot?.regionReachability || {};

    // Check if first region is reachable
    if (reachability["D02Z01S01[SW]"] === 'reachable' ||
        reachability["D02Z01S01[SW]"] === 'checked') {
      return true;
    }

    // Check if third region is reachable
    if (reachability["D02Z01S02[]"] === 'reachable' ||
        reachability["D02Z01S02[]"] === 'checked') {
      return true;
    }

    // Check if second region is reachable AND has wall climb
    const hasWallClimb = this.wall_climb(snapshot, staticData);
    if (hasWallClimb &&
        (reachability["D02Z01S08[E]"] === 'reachable' ||
         reachability["D02Z01S08[E]"] === 'checked')) {
      return true;
    }

    return false;
  },

  /**
   * Check if Convent ladder has been opened
   */
  openedConventLadder(snapshot, staticData) {
    const regions = [
      "D02Z03S02[N]",
      "D02Z03S15[E]",
      "D02Z03S19[E]",
      "D02Z03S10[W]",
      "D02Z03S22[W]"
    ];

    const reachability = snapshot?.regionReachability || {};
    return regions.some(region => {
      const status = reachability[region];
      return status === 'reachable' || status === 'checked';
    });
  },

  /**
   * Check if BotTC statue has been broken
   */
  brokeBotTCStatue(snapshot, staticData) {
    const regions = [
      "D08Z03S03[W]",
      "D08Z02S03[W]"
    ];

    const reachability = snapshot?.regionReachability || {};
    return regions.some(region => {
      const status = reachability[region];
      return status === 'reachable' || status === 'checked';
    });
  },

  /**
   * Check if WotHP gate has been opened
   */
  openedWotHPGate(snapshot, staticData) {
    const regions = [
      "D09Z01S13[E]",
      "D09Z01S03[W]",
      "D09Z01S08[W]"
    ];

    const reachability = snapshot?.regionReachability || {};
    return regions.some(region => {
      const status = reachability[region];
      return status === 'reachable' || status === 'checked';
    });
  },

  /**
   * Check if BotSS ladder has been opened
   */
  openedBotssLadder(snapshot, staticData) {
    const regions = [
      "D17Z01S05[S]",
      "D17BZ02S01[FrontR]"
    ];

    const reachability = snapshot?.regionReachability || {};
    return regions.some(region => {
      const status = reachability[region];
      return status === 'reachable' || status === 'checked';
    });
  },

  // ==================== Quest/Item Helpers ====================

  /**
   * Check if player has the Petrified Bell (Jibrael quest)
   */
  bell(snapshot, staticData) {
    return this.has(snapshot, staticData, "Petrified Bell");
  },

  /**
   * Check if player has Boots of Pleading
   */
  boots(snapshot, staticData) {
    return this.has(snapshot, staticData, "Boots of Pleading");
  },

  /**
   * Check if player has Chalice of Inverted Verses
   */
  chalice(snapshot, staticData) {
    return this.has(snapshot, staticData, "Chalice of Inverted Verses");
  },

  /**
   * Check if player has Dried Flowers bathed in Tears
   */
  driedFlowers(snapshot, staticData) {
    return this.has(snapshot, staticData, "Dried Flowers bathed in Tears");
  },

  /**
   * Alias for driedFlowers (snake_case version)
   */
  dried_flowers(snapshot, staticData) {
    return this.driedFlowers(snapshot, staticData);
  },

  /**
   * Check if player has Egg of Deformity (individual egg, not ceremony items)
   */
  egg(snapshot, staticData) {
    return this.has(snapshot, staticData, "Egg of Deformity");
  },

  /**
   * Check if player has Empty Golden Thimble
   */
  emptyThimble(snapshot, staticData) {
    return this.has(snapshot, staticData, "Empty Golden Thimble");
  },

  /**
   * Alias for emptyThimble (snake_case version)
   */
  empty_thimble(snapshot, staticData) {
    return this.emptyThimble(snapshot, staticData);
  },

  /**
   * Check if player has Weight of True Guilt
   */
  guiltBead(snapshot, staticData) {
    return this.has(snapshot, staticData, "Weight of True Guilt");
  },

  /**
   * Alias for guiltBead (snake_case version)
   */
  guilt_bead(snapshot, staticData) {
    return this.guiltBead(snapshot, staticData);
  },

  /**
   * Check if player has Hatched Egg of Deformity
   */
  hatchedEgg(snapshot, staticData) {
    return this.has(snapshot, staticData, "Hatched Egg of Deformity");
  },

  /**
   * Alias for hatchedEgg (snake_case version)
   */
  hatched_egg(snapshot, staticData) {
    return this.hatchedEgg(snapshot, staticData);
  },

  /**
   * Check if player has Apodictic Heart of Mea Culpa (Crisanta quest)
   */
  trueHeart(snapshot, staticData) {
    return this.has(snapshot, staticData, "Apodictic Heart of Mea Culpa");
  },

  /**
   * Alias for trueHeart (snake_case version)
   */
  true_heart(snapshot, staticData) {
    return this.trueHeart(snapshot, staticData);
  },

  /**
   * Count Verses Spun from Gold
   */
  verses(snapshot, staticData) {
    return snapshot?.inventory?.["Verses Spun from Gold"] || 0;
  },

  /**
   * Check if player has 2+ Verses Spun from Gold
   */
  verses2(snapshot, staticData) {
    return this.verses(snapshot, staticData) >= 2;
  },

  /**
   * Check if player has 3+ Verses Spun from Gold
   */
  verses3(snapshot, staticData) {
    return this.verses(snapshot, staticData) >= 3;
  },

  /**
   * Check if player has 4+ Verses Spun from Gold
   */
  verses4(snapshot, staticData) {
    return this.verses(snapshot, staticData) >= 4;
  },

  /**
   * Check if player has Linen Cloth (LOTL quest)
   */
  cloth(snapshot, staticData) {
    return this.has(snapshot, staticData, "Linen Cloth");
  },

  /**
   * Check if player has Severed Hand (LOTL quest)
   */
  hand(snapshot, staticData) {
    return this.has(snapshot, staticData, "Severed Hand");
  },

  /**
   * Check if player has Cord of the True Burying
   */
  cord(snapshot, staticData) {
    return this.has(snapshot, staticData, "Cord of the True Burying");
  },

  // ==================== Item Count Helpers ====================

  /**
   * Count Knot of Rosary Rope items
   * Only counts if player can reach D17Z01S07[NW]
   */
  knots(snapshot, staticData) {
    const reachability = snapshot?.regionReachability || {};
    const canReachRegion = reachability["D17Z01S07[NW]"] === 'reachable' ||
                           reachability["D17Z01S07[NW]"] === 'checked';

    if (!canReachRegion) return 0;

    return snapshot?.inventory?.["Knot of Rosary Rope"] || 0;
  },

  /**
   * Count Limestone items (toe items for Redento quest)
   * This is an alias for the toe count
   */
  limestones(snapshot, staticData) {
    return this.toes(snapshot, staticData);
  },

  // ==================== Relic/Ability Helpers ====================

  /**
   * Check if player has Silvered Lung of Dolphos
   */
  lung(snapshot, staticData) {
    return this.has(snapshot, staticData, "Silvered Lung of Dolphos");
  },

  // ==================== Combat/Movement Ability Helpers ====================

  /**
   * Count Charged Skill items
   */
  charged(snapshot, staticData) {
    return snapshot?.inventory?.["Charged Skill"] || 0;
  },

  /**
   * Count Combo Skill items
   */
  combo(snapshot, staticData) {
    return snapshot?.inventory?.["Combo Skill"] || 0;
  },

  /**
   * Count Dive Skill items
   */
  dive(snapshot, staticData) {
    return snapshot?.inventory?.["Dive Skill"] || 0;
  },

  /**
   * Count Lunge Skill items
   */
  lunge(snapshot, staticData) {
    return snapshot?.inventory?.["Lunge Skill"] || 0;
  },

  /**
   * Check if player can beat the Legionary boss
   */
  canBeatLegionary(snapshot, staticData) {
    return this.has_boss_strength(snapshot, staticData, "legionary");
  },

  /**
   * Alias for canBeatLegionary (snake_case version)
   */
  can_beat_legionary(snapshot, staticData) {
    return this.canBeatLegionary(snapshot, staticData);
  },

  /**
   * Check if player can climb on root (requires root AND wall climb)
   */
  canClimbOnRoot(snapshot, staticData) {
    return this.root(snapshot, staticData) &&
           this.wall_climb(snapshot, staticData);
  },

  /**
   * Alias for canClimbOnRoot (snake_case version)
   */
  can_climb_on_root(snapshot, staticData) {
    return this.canClimbOnRoot(snapshot, staticData);
  },

  /**
   * Check if player can perform enemy upslash technique
   * Requires combo >= 2 AND enemy skips allowed
   */
  canEnemyUpslash(snapshot, staticData) {
    const comboCount = this.combo(snapshot, staticData);
    const enemySkipsOk = this.enemy_skips_allowed(snapshot, staticData);
    return comboCount >= 2 && enemySkipsOk;
  },

  /**
   * Alias for canEnemyUpslash (snake_case version)
   */
  can_enemy_upslash(snapshot, staticData) {
    return this.canEnemyUpslash(snapshot, staticData);
  },

  // ==================== Difficulty Skip Helpers ====================

  /**
   * Check if mourning skips are allowed (requires hard difficulty)
   */
  mourningSkipAllowed(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const difficulty = settings.difficulty || 0;
    return difficulty >= 2;
  },

  /**
   * Alias for mourningSkipAllowed (snake_case version)
   */
  mourning_skip_allowed(snapshot, staticData) {
    return this.mourningSkipAllowed(snapshot, staticData);
  },

  /**
   * Check if upwarp skips are allowed (requires hard difficulty)
   */
  upwarpSkipsAllowed(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const difficulty = settings.difficulty || 0;
    return difficulty >= 2;
  },

  /**
   * Alias for upwarpSkipsAllowed (snake_case version)
   */
  upwarp_skips_allowed(snapshot, staticData) {
    return this.upwarpSkipsAllowed(snapshot, staticData);
  },
};