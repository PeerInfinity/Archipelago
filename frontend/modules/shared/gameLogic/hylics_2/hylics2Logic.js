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
function has(snapshot, staticData, itemName, count = 1) {
  // Check flags (events, checked locations, etc.)
  if (snapshot.flags && snapshot.flags.includes(itemName)) {
    return true;
  }
  
  // Check events
  if (snapshot.events && snapshot.events.includes(itemName)) {
    return true;
  }
  
  // Check inventory
  if (!snapshot.inventory) return false;
  
  const itemCount = snapshot.inventory[itemName] || 0;
  return itemCount >= count;
}

/**
 * Helper functions for Hylics 2 game logic
 */
export const helperFunctions = {
  /**
   * Check if the player has the Upper House Key
   */
  upper_house_key: (snapshot, staticData, itemName) => {
    return has(snapshot, staticData, "UPPER HOUSE KEY");
  },

  /**
   * Check if the player has the Clicker
   */
  clicker: (snapshot, staticData, itemName) => {
    return has(snapshot, staticData, "CLICKER");
  },

  /**
   * Check if the player has all 3 Sage Tokens
   */
  all_tokens: (snapshot, staticData, itemName) => {
    return has(snapshot, staticData, "SAGE TOKEN", 3);
  },

  /**
   * Check if the player has Pneumatophore (for Air Dash ability)
   */
  air_dash: (snapshot, staticData, itemName) => {
    return has(snapshot, staticData, "PNEUMATOPHORE");
  },

  /**
   * Check if the player has the Dock Key (for airship access)
   */
  airship: (snapshot, staticData, itemName) => {
    return has(snapshot, staticData, "DOCK KEY");
  },

  /**
   * Check if the player has the Jail Key
   */
  jail_key: (snapshot, staticData, itemName) => {
    return has(snapshot, staticData, "JAIL KEY");
  },

  /**
   * Check if the player has the Paddle
   */
  paddle: (snapshot, staticData, itemName) => {
    return has(snapshot, staticData, "PADDLE");
  },

  /**
   * Check if the player has the Worm Room Key
   */
  worm_room_key: (snapshot, staticData, itemName) => {
    return has(snapshot, staticData, "WORM ROOM KEY");
  },

  /**
   * Check if the player has the Bridge Key
   */
  bridge_key: (snapshot, staticData, itemName) => {
    return has(snapshot, staticData, "BRIDGE KEY");
  },

  /**
   * Check if the player has the Upper Chamber Key
   */
  upper_chamber_key: (snapshot, staticData, itemName) => {
    return has(snapshot, staticData, "UPPER CHAMBER KEY");
  },

  /**
   * Check if the player has the Vessel Room Key
   */
  vessel_room_key: (snapshot, staticData, itemName) => {
    return has(snapshot, staticData, "VESSEL ROOM KEY");
  },

  /**
   * Check if the player has the House Key
   */
  house_key: (snapshot, staticData, itemName) => {
    return has(snapshot, staticData, "HOUSE KEY");
  },

  /**
   * Check if the player has the Cave Key
   */
  cave_key: (snapshot, staticData, itemName) => {
    return has(snapshot, staticData, "CAVE KEY");
  },

  /**
   * Check if the player has Skull Bomb
   */
  skull_bomb: (snapshot, staticData, itemName) => {
    return has(snapshot, staticData, "SKULL BOMB");
  },

  /**
   * Check if the player has the Tower Key
   */
  tower_key: (snapshot, staticData, itemName) => {
    return has(snapshot, staticData, "TOWER KEY");
  },

  /**
   * Check if the player has the Deep Key
   */
  deep_key: (snapshot, staticData, itemName) => {
    return has(snapshot, staticData, "DEEP KEY");
  },

  /**
   * Check if the player has Charge Up
   */
  charge_up: (snapshot, staticData, itemName) => {
    return has(snapshot, staticData, "CHARGE UP");
  },

  /**
   * Check if the player has the Paper Cup
   */
  paper_cup: (snapshot, staticData, itemName) => {
    return has(snapshot, staticData, "PAPER CUP");
  },

  /**
   * Check if the player has Pongorma
   */
  party_1: (snapshot, staticData, itemName) => {
    return has(snapshot, staticData, "PONGORMA");
  },

  /**
   * Check if the player has Dedusmuln
   */
  party_2: (snapshot, staticData, itemName) => {
    return has(snapshot, staticData, "DEDUSMULN");
  },

  /**
   * Check if the player has Somsnosa
   */
  party_3: (snapshot, staticData, itemName) => {
    return has(snapshot, staticData, "SOMSNOSA");
  },

  /**
   * Check if the player can enter Arcade 2
   * Requires both Pneumatophore (for Air Dash) AND Dock Key (for airship)
   */
  enter_arcade2: (snapshot, staticData, itemName) => {
    return has(snapshot, staticData, "PNEUMATOPHORE") && 
           has(snapshot, staticData, "DOCK KEY");
  },

  /**
   * Check if the player can enter Wormpod
   * Requires Dock Key (for airship), Worm Room Key, and Paddle
   */
  enter_wormpod: (snapshot, staticData, itemName) => {
    return has(snapshot, staticData, "DOCK KEY") && 
           has(snapshot, staticData, "WORM ROOM KEY") && 
           has(snapshot, staticData, "PADDLE");
  },

  /**
   * Check if the player can enter Sage Ship
   * Requires Skull Bomb, Dock Key (for airship), and Paddle
   */
  enter_sageship: (snapshot, staticData, itemName) => {
    return has(snapshot, staticData, "SKULL BOMB") && 
           has(snapshot, staticData, "DOCK KEY") && 
           has(snapshot, staticData, "PADDLE");
  },

  /**
   * Check if the player can enter Foglast
   * Same requirements as enter_wormpod (Dock Key, Worm Room Key, and Paddle)
   */
  enter_foglast: (snapshot, staticData, itemName) => {
    return has(snapshot, staticData, "DOCK KEY") && 
           has(snapshot, staticData, "WORM ROOM KEY") && 
           has(snapshot, staticData, "PADDLE");
  },

  /**
   * Check if the player can enter Hylemxylem
   * Requires Pneumatophore (for Air Dash), enter_foglast requirements, and Bridge Key
   */
  enter_hylemxylem: (snapshot, staticData, itemName) => {
    return has(snapshot, staticData, "PNEUMATOPHORE") && 
           has(snapshot, staticData, "DOCK KEY") && 
           has(snapshot, staticData, "WORM ROOM KEY") && 
           has(snapshot, staticData, "PADDLE") &&
           has(snapshot, staticData, "BRIDGE KEY");
  },
};