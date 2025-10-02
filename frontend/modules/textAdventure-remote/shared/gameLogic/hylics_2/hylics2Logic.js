/**
 * Hylics 2 game logic module
 */

/**
 * State management for Hylics 2
 */
export const hylics2StateModule = {
  /**
   * Initializes a new, empty Hylics 2 game state.
   */
  initializeState() {
    return {
      flags: [], // Checked locations and game-specific flags
      events: [], // Event items
    };
  },

  /**
   * Loads settings into the game state.
   */
  loadSettings(gameState, settings) {
    return { ...gameState }; 
  },

  /**
   * Process special event items if any.
   */
  processEventItem(gameState, itemName) {
    return null; // Return null to indicate no state change
  },

  /**
   * Returns the state properties for a snapshot.
   */
  getStateForSnapshot(gameState) {
    return {
      flags: gameState.flags || [],
      events: gameState.events || [],
    };
  },
};

/**
 * Helper function to check if the player has an item
 */
function has(state, itemName, count = 1) {
  // Check flags (events, checked locations, etc.)
  if (state.flags && state.flags.includes(itemName)) {
    return true;
  }
  
  // Check events
  if (state.events && state.events.includes(itemName)) {
    return true;
  }
  
  // Check inventory
  if (!state.inventory) return false;
  
  const itemCount = state.inventory[itemName] || 0;
  return itemCount >= count;
}

/**
 * Helper functions for Hylics 2 game logic
 */
export const helperFunctions = {
  /**
   * Check if the player has the Upper House Key
   */
  upper_house_key: (state, world, itemName, staticData) => {
    return has(state, "UPPER HOUSE KEY");
  },

  /**
   * Check if the player has the Clicker
   */
  clicker: (state, world, itemName, staticData) => {
    return has(state, "CLICKER");
  },

  /**
   * Check if the player has all 3 Sage Tokens
   */
  all_tokens: (state, world, itemName, staticData) => {
    return has(state, "SAGE TOKEN", 3);
  },

  /**
   * Check if the player has Pneumatophore (for Air Dash ability)
   */
  air_dash: (state, world, itemName, staticData) => {
    return has(state, "PNEUMATOPHORE");
  },

  /**
   * Check if the player has the Dock Key (for airship access)
   */
  airship: (state, world, itemName, staticData) => {
    return has(state, "DOCK KEY");
  },

  /**
   * Check if the player has the Jail Key
   */
  jail_key: (state, world, itemName, staticData) => {
    return has(state, "JAIL KEY");
  },

  /**
   * Check if the player has the Paddle
   */
  paddle: (state, world, itemName, staticData) => {
    return has(state, "PADDLE");
  },

  /**
   * Check if the player has the Worm Room Key
   */
  worm_room_key: (state, world, itemName, staticData) => {
    return has(state, "WORM ROOM KEY");
  },

  /**
   * Check if the player has the Bridge Key
   */
  bridge_key: (state, world, itemName, staticData) => {
    return has(state, "BRIDGE KEY");
  },

  /**
   * Check if the player has the Upper Chamber Key
   */
  upper_chamber_key: (state, world, itemName, staticData) => {
    return has(state, "UPPER CHAMBER KEY");
  },

  /**
   * Check if the player has the Vessel Room Key
   */
  vessel_room_key: (state, world, itemName, staticData) => {
    return has(state, "VESSEL ROOM KEY");
  },

  /**
   * Check if the player has the House Key
   */
  house_key: (state, world, itemName, staticData) => {
    return has(state, "HOUSE KEY");
  },

  /**
   * Check if the player has the Cave Key
   */
  cave_key: (state, world, itemName, staticData) => {
    return has(state, "CAVE KEY");
  },

  /**
   * Check if the player has Skull Bomb
   */
  skull_bomb: (state, world, itemName, staticData) => {
    return has(state, "SKULL BOMB");
  },

  /**
   * Check if the player has the Tower Key
   */
  tower_key: (state, world, itemName, staticData) => {
    return has(state, "TOWER KEY");
  },

  /**
   * Check if the player has the Deep Key
   */
  deep_key: (state, world, itemName, staticData) => {
    return has(state, "DEEP KEY");
  },

  /**
   * Check if the player has Charge Up
   */
  charge_up: (state, world, itemName, staticData) => {
    return has(state, "CHARGE UP");
  },

  /**
   * Check if the player has the Paper Cup
   */
  paper_cup: (state, world, itemName, staticData) => {
    return has(state, "PAPER CUP");
  },

  /**
   * Check if the player has Pongorma
   */
  party_1: (state, world, itemName, staticData) => {
    return has(state, "PONGORMA");
  },

  /**
   * Check if the player has Dedusmuln
   */
  party_2: (state, world, itemName, staticData) => {
    return has(state, "DEDUSMULN");
  },

  /**
   * Check if the player has Somsnosa
   */
  party_3: (state, world, itemName, staticData) => {
    return has(state, "SOMSNOSA");
  },

  /**
   * Check if the player can enter Arcade 2
   * Requires both Pneumatophore (for Air Dash) AND Dock Key (for airship)
   */
  enter_arcade2: (state, world, itemName, staticData) => {
    return has(state, "PNEUMATOPHORE") && 
           has(state, "DOCK KEY");
  },

  /**
   * Check if the player can enter Wormpod
   * Requires Dock Key (for airship), Worm Room Key, and Paddle
   */
  enter_wormpod: (state, world, itemName, staticData) => {
    return has(state, "DOCK KEY") && 
           has(state, "WORM ROOM KEY") && 
           has(state, "PADDLE");
  },

  /**
   * Check if the player can enter Sage Ship
   * Requires Skull Bomb, Dock Key (for airship), and Paddle
   */
  enter_sageship: (state, world, itemName, staticData) => {
    return has(state, "SKULL BOMB") && 
           has(state, "DOCK KEY") && 
           has(state, "PADDLE");
  },

  /**
   * Check if the player can enter Foglast
   * Same requirements as enter_wormpod (Dock Key, Worm Room Key, and Paddle)
   */
  enter_foglast: (state, world, itemName, staticData) => {
    return has(state, "DOCK KEY") && 
           has(state, "WORM ROOM KEY") && 
           has(state, "PADDLE");
  },

  /**
   * Check if the player can enter Hylemxylem
   * Requires Pneumatophore (for Air Dash), enter_foglast requirements, and Bridge Key
   */
  enter_hylemxylem: (state, world, itemName, staticData) => {
    return has(state, "PNEUMATOPHORE") && 
           has(state, "DOCK KEY") && 
           has(state, "WORM ROOM KEY") && 
           has(state, "PADDLE") &&
           has(state, "BRIDGE KEY");
  },
};