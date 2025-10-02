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
  has(state, itemName, staticData) {
    return !!(state?.inventory && state.inventory[itemName] > 0);
  },

  /**
   * Count how many of an item the player has
   */
  count(state, itemName, staticData) {
    return state?.inventory?.[itemName] || 0;
  },

  // Relic helper functions (matching Python Rules.py)
  
  /**
   * Check if player has Blood Perpetuated in Sand relic
   */
  blood(state, staticData) {
    return this.has(state, "Blood Perpetuated in Sand", staticData);
  },

  /**
   * Check if player has Three Gnarled Tongues relic
   */
  root(state, staticData) {
    return this.has(state, "Three Gnarled Tongues", staticData);
  },

  /**
   * Check if player has Linen of Golden Thread relic
   */
  linen(state, staticData) {
    return this.has(state, "Linen of Golden Thread", staticData);
  },

  /**
   * Check if player has Nail Uprooted from Dirt relic
   */
  nail(state, staticData) {
    return this.has(state, "Nail Uprooted from Dirt", staticData);
  },

  /**
   * Check if player has Shroud of Dreamt Sins relic
   */
  shroud(state, staticData) {
    return this.has(state, "Shroud of Dreamt Sins", staticData);
  },

  // Key helper functions

  /**
   * Check if player has Bronze Key
   */
  bronze_key(state, staticData) {
    return this.has(state, "Bronze Key", staticData);
  },

  /**
   * Check if player has Silver Key
   */
  silver_key(state, staticData) {
    return this.has(state, "Silver Key", staticData);
  },

  /**
   * Check if player has Gold Key
   */
  gold_key(state, staticData) {
    return this.has(state, "Gold Key", staticData);
  },

  /**
   * Check if player has Penitent Key
   */
  penitent_key(state, staticData) {
    return this.has(state, "Penitent Key", staticData);
  },

  /**
   * Check if player has Elder Key
   */
  elder_key(state, staticData) {
    return this.has(state, "Elder Key", staticData);
  },

  // Movement/ability helper functions

  /**
   * Check if player can climb walls
   */
  can_climb(state, staticData) {
    return this.has(state, "Wall Climb Ability", staticData);
  },

  /**
   * Check if player can use dive laser attack
   */
  can_dive_laser(state, staticData) {
    return this.has(state, "Dive Laser Ability", staticData);
  },

  /**
   * Check if player can air dash
   */
  can_air_dash(state, staticData) {
    return this.has(state, "Air Dash Ability", staticData);
  },

  /**
   * Check if player can break holes in walls
   */
  can_break_holes(state, staticData) {
    return this.has(state, "Break Holes Ability", staticData);
  },

  /**
   * Check if player can survive poison
   */
  can_survive_poison(state, staticData) {
    return this.has(state, "Poison Immunity", staticData);
  },

  /**
   * Check if player can walk on roots
   */
  can_walk_on_root(state, staticData) {
    return this.has(state, "Root Walking Ability", staticData);
  },

  // Boss defeat checks (placeholder implementations)
  
  /**
   * Check if player can defeat a boss (generic)
   */
  can_defeat_boss(state, bossName, staticData) {
    // For now, assume always true - this would need specific boss logic
    return true;
  },

  // Region accessibility helpers
  
  /**
   * Check if player can reach a specific region
   */
  can_reach_region(state, regionName, staticData) {
    return state?.regions?.includes(regionName) || false;
  },

  // Generic helper for any item requirement
  has_item(state, itemName, staticData) {
    return this.has(state, itemName, staticData);
  },

  // Prayer helpers
  has_prayer(state, prayerName, staticData) {
    return this.has(state, prayerName, staticData);
  },

  // Rosary bead helpers  
  has_bead(state, beadName, staticData) {
    return this.has(state, beadName, staticData);
  },
};