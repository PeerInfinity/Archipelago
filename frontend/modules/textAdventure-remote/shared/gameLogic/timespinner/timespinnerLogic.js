/**
 * Timespinner state management and helper functions
 * Based on worlds/timespinner/LogicExtensions.py
 */

export const timespinnerStateModule = {
  /**
   * Initializes Timespinner game state with required flags and settings
   */
  initializeState() {
    return {
      flags: [],
      events: [],
      // Timespinner-specific flags from options
      flag_specific_keycards: false,
      flag_eye_spy: false,
      flag_unchained_keys: false,
      flag_prism_break: false,
      // Precalculated weights for warp beacon unlocks
      pyramid_keys_unlock: null,
      present_keys_unlock: null,
      past_keys_unlock: null,
      time_keys_unlock: null,
    };
  },

  /**
   * Loads Timespinner-specific settings into the game state
   */
  loadSettings(gameState, settings) {
    // Settings are loaded from rules.json
    // The logic flags and precalculated weights should be in settings
    return {
      ...gameState,
      flag_specific_keycards: settings.specific_keycards || false,
      flag_eye_spy: settings.eye_spy || false,
      flag_unchained_keys: settings.unchained_keys || false,
      flag_prism_break: settings.prism_break || false,
      pyramid_keys_unlock: settings.pyramid_keys_unlock || null,
      present_keys_unlock: settings.present_keys_unlock || null,
      past_keys_unlock: settings.past_keys_unlock || null,
      time_keys_unlock: settings.time_keys_unlock || null,
    };
  },

  /**
   * Process Timespinner event items
   */
  processEventItem(gameState, itemName) {
    // Add event items to the events array
    // Event items like "Killed Maw", "Killed Twins", "Killed Aelana" need to be tracked
    // for helpers like can_kill_all_3_bosses to work correctly

    // Only process items that start with "Killed" (Timespinner's event naming convention)
    if (!itemName || !itemName.startsWith('Killed')) {
      return gameState; // Not an event item, no change
    }

    const currentEvents = gameState.events || [];
    if (!currentEvents.includes(itemName)) {
      return {
        ...gameState,
        events: [...currentEvents, itemName],
      };
    }
    // Event already exists, no change
    return gameState;
  },

  /**
   * Returns the Timespinner state properties for a snapshot
   */
  getStateForSnapshot(gameState) {
    return {
      flags: gameState.flags || [],
      events: gameState.events || [],
      flag_specific_keycards: gameState.flag_specific_keycards || false,
      flag_eye_spy: gameState.flag_eye_spy || false,
      flag_unchained_keys: gameState.flag_unchained_keys || false,
      flag_prism_break: gameState.flag_prism_break || false,
      pyramid_keys_unlock: gameState.pyramid_keys_unlock || null,
      present_keys_unlock: gameState.present_keys_unlock || null,
      past_keys_unlock: gameState.past_keys_unlock || null,
      time_keys_unlock: gameState.time_keys_unlock || null,
    };
  },
};

/**
 * Timespinner helper functions
 * Implements the logic from worlds/timespinner/LogicExtensions.py
 */
export const helperFunctions = {
  /**
   * Check if player has timestop ability
   * Requires: Timespinner Wheel, Succubus Hairpin, Lightwall, or Celestial Sash
   */
  has_timestop(snapshot, staticData) {
    const inventory = snapshot?.inventory || {};
    return !!(
      inventory['Timespinner Wheel'] > 0 ||
      inventory['Succubus Hairpin'] > 0 ||
      inventory['Lightwall'] > 0 ||
      inventory['Celestial Sash'] > 0
    );
  },

  /**
   * Check if player has double jump ability
   * Requires: Succubus Hairpin, Lightwall, or Celestial Sash
   */
  has_doublejump(snapshot, staticData) {
    const inventory = snapshot?.inventory || {};
    return !!(
      inventory['Succubus Hairpin'] > 0 ||
      inventory['Lightwall'] > 0 ||
      inventory['Celestial Sash'] > 0
    );
  },

  /**
   * Check if player has forward dash + double jump
   * Requires: upward dash OR (Talaria Attachment + double jump)
   */
  has_forwarddash_doublejump(snapshot, staticData) {
    const inventory = snapshot?.inventory || {};
    return (
      this.has_upwarddash(snapshot, staticData) ||
      (inventory['Talaria Attachment'] > 0 && this.has_doublejump(snapshot, staticData))
    );
  },

  /**
   * Check if player has double jump from NPC timestop
   * Requires: upward dash OR (Timespinner Wheel + double jump)
   */
  has_doublejump_of_npc(snapshot, staticData) {
    const inventory = snapshot?.inventory || {};
    return (
      this.has_upwarddash(snapshot, staticData) ||
      (inventory['Timespinner Wheel'] > 0 && this.has_doublejump(snapshot, staticData))
    );
  },

  /**
   * Check if player has fast jump on NPC
   * Requires: Timespinner Wheel + Talaria Attachment
   */
  has_fastjump_on_npc(snapshot, staticData) {
    const inventory = snapshot?.inventory || {};
    return !!(inventory['Timespinner Wheel'] > 0 && inventory['Talaria Attachment'] > 0);
  },

  /**
   * Check if player has multiple small jumps on NPC
   * Requires: Timespinner Wheel OR upward dash
   */
  has_multiple_small_jumps_of_npc(snapshot, staticData) {
    const inventory = snapshot?.inventory || {};
    return !!(inventory['Timespinner Wheel'] > 0 || this.has_upwarddash(snapshot, staticData));
  },

  /**
   * Check if player has upward dash
   * Requires: Lightwall or Celestial Sash
   */
  has_upwarddash(snapshot, staticData) {
    const inventory = snapshot?.inventory || {};
    return !!(inventory['Lightwall'] > 0 || inventory['Celestial Sash'] > 0);
  },

  /**
   * Check if player has fire ability
   * Requires: Fire Orb, Infernal Flames, Pyro Ring, or Djinn Inferno
   */
  has_fire(snapshot, staticData) {
    const inventory = snapshot?.inventory || {};
    return !!(
      inventory['Fire Orb'] > 0 ||
      inventory['Infernal Flames'] > 0 ||
      inventory['Pyro Ring'] > 0 ||
      inventory['Djinn Inferno'] > 0
    );
  },

  /**
   * Check if player has pink ability (for royal roadblock)
   * Requires: Plasma Orb, Plasma Geyser, or Royal Ring
   */
  has_pink(snapshot, staticData) {
    const inventory = snapshot?.inventory || {};
    return !!(
      inventory['Plasma Orb'] > 0 ||
      inventory['Plasma Geyser'] > 0 ||
      inventory['Royal Ring'] > 0
    );
  },

  /**
   * Check if player has Security Keycard A
   */
  has_keycard_A(snapshot, staticData) {
    const inventory = snapshot?.inventory || {};
    return !!(inventory['Security Keycard A'] > 0);
  },

  /**
   * Check if player has Security Keycard B (or A if not specific)
   */
  has_keycard_B(snapshot, staticData) {
    const inventory = snapshot?.inventory || {};
    const flag_specific = snapshot?.flag_specific_keycards || false;

    if (flag_specific) {
      return !!(inventory['Security Keycard B'] > 0);
    } else {
      return !!(
        inventory['Security Keycard A'] > 0 ||
        inventory['Security Keycard B'] > 0
      );
    }
  },

  /**
   * Check if player has Security Keycard C (or A/B if not specific)
   */
  has_keycard_C(snapshot, staticData) {
    const inventory = snapshot?.inventory || {};
    const flag_specific = snapshot?.flag_specific_keycards || false;

    if (flag_specific) {
      return !!(inventory['Security Keycard C'] > 0);
    } else {
      return !!(
        inventory['Security Keycard A'] > 0 ||
        inventory['Security Keycard B'] > 0 ||
        inventory['Security Keycard C'] > 0
      );
    }
  },

  /**
   * Check if player has Security Keycard D (or A/B/C if not specific)
   */
  has_keycard_D(snapshot, staticData) {
    const inventory = snapshot?.inventory || {};
    const flag_specific = snapshot?.flag_specific_keycards || false;

    if (flag_specific) {
      return !!(inventory['Security Keycard D'] > 0);
    } else {
      return !!(
        inventory['Security Keycard A'] > 0 ||
        inventory['Security Keycard B'] > 0 ||
        inventory['Security Keycard C'] > 0 ||
        inventory['Security Keycard D'] > 0
      );
    }
  },

  /**
   * Check if player can break walls
   * Requires: Oculus Ring if eye_spy is enabled, otherwise always true
   */
  can_break_walls(snapshot, staticData) {
    const flag_eye_spy = snapshot?.flag_eye_spy || false;
    if (flag_eye_spy) {
      const inventory = snapshot?.inventory || {};
      return !!(inventory['Oculus Ring'] > 0);
    }
    return true;
  },

  /**
   * Check if player can kill all 3 bosses
   * Requires: Laser Access M/I/A if prism_break, otherwise Killed Maw/Twins/Aelana events
   */
  can_kill_all_3_bosses(snapshot, staticData) {
    const flag_prism_break = snapshot?.flag_prism_break || false;
    const inventory = snapshot?.inventory || {};
    const events = snapshot?.events || [];

    if (flag_prism_break) {
      return !!(
        inventory['Laser Access M'] > 0 &&
        inventory['Laser Access I'] > 0 &&
        inventory['Laser Access A'] > 0
      );
    } else {
      return (
        events.includes('Killed Maw') &&
        events.includes('Killed Twins') &&
        events.includes('Killed Aelana')
      );
    }
  },

  /**
   * Check if player has teleport ability
   * Requires: Twin Pyramid Key if not unchained_keys, otherwise always available
   */
  has_teleport(snapshot, staticData) {
    const flag_unchained = snapshot?.flag_unchained_keys || false;
    if (flag_unchained) {
      return true;
    }
    const inventory = snapshot?.inventory || {};
    return !!(inventory['Twin Pyramid Key'] > 0);
  },

  /**
   * Check if player can teleport to a specific gate
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data
   * @param {string} era - "Present", "Past", or "Time"
   * @param {string} gate - Gate name (e.g., "GateLakeDesolation")
   * @returns {boolean} True if player can teleport to the specified gate
   */
  can_teleport_to(snapshot, staticData, era, gate) {
    const flag_unchained = snapshot?.flag_unchained_keys || false;
    const inventory = snapshot?.inventory || {};

    if (!flag_unchained) {
      // When using Twin Pyramid Key, check if this is the unlocked gate
      const pyramid_keys_unlock = snapshot?.pyramid_keys_unlock || null;
      return pyramid_keys_unlock === gate;
    }

    // With unchained keys, check era-specific beacon and gate
    if (era === 'Present') {
      const present_unlock = snapshot?.present_keys_unlock || null;
      return present_unlock === gate && inventory['Modern Warp Beacon'] > 0;
    } else if (era === 'Past') {
      const past_unlock = snapshot?.past_keys_unlock || null;
      return past_unlock === gate && inventory['Timeworn Warp Beacon'] > 0;
    } else if (era === 'Time') {
      const time_unlock = snapshot?.time_keys_unlock || null;
      return time_unlock === gate && inventory['Mysterious Warp Beacon'] > 0;
    }

    return false;
  },
};
