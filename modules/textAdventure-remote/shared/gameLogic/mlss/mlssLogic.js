/**
 * Mario & Luigi Superstar Saga helper functions
 * Translated from worlds/mlss/StateLogic.py
 */

/**
 * Check if player has an item, handling progressive items
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data including progressionMapping
 * @param {string} itemName - Name of the item to check
 * @returns {boolean} True if player has the item
 */
export function has(snapshot, staticData, itemName) {
  // First check if it's in flags (events, checked locations, etc.)
  if (snapshot.flags && snapshot.flags.includes(itemName)) {
    return true;
  }

  // Also check state.events
  if (snapshot.events && snapshot.events.includes(itemName)) {
    return true;
  }

  // Check inventory
  if (!snapshot.inventory) return false;

  // Direct item check
  if ((snapshot.inventory[itemName] || 0) > 0) {
    return true;
  }

  // Check progressive items
  if (staticData && staticData.progressionMapping) {
    for (const [progressiveBase, progression] of Object.entries(staticData.progressionMapping)) {
      const baseCount = snapshot.inventory[progressiveBase] || 0;
      if (baseCount > 0 && progression && progression.items) {
        for (const upgrade of progression.items) {
          if (baseCount >= upgrade.level) {
            if (upgrade.name === itemName ||
                (upgrade.provides && upgrade.provides.includes(itemName))) {
              return true;
            }
          }
        }
      }
    }
  }

  return false;
}

/**
 * Count how many of an item the player has
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {string} itemName - Name of the item to count
 * @returns {number} Number of items
 */
export function count(snapshot, staticData, itemName) {
  if (!snapshot.inventory) return 0;
  return snapshot.inventory[itemName] || 0;
}

/**
 * Check if region is reachable
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {string} regionName - Name of the region
 * @returns {boolean} True if region is reachable
 */
export function can_reach(snapshot, staticData, regionName) {
  if (!snapshot.regionReachability) return false;
  return snapshot.regionReachability[regionName] === 'reachable';
}

// StateLogic helper functions from worlds/mlss/StateLogic.py

export function canDig(snapshot, staticData) {
  return has(snapshot, staticData, "Green Goblet") && has(snapshot, staticData, "Hammers");
}

export function canMini(snapshot, staticData) {
  return has(snapshot, staticData, "Red Goblet") && has(snapshot, staticData, "Hammers");
}

export function canDash(snapshot, staticData) {
  return has(snapshot, staticData, "Red Pearl Bean") && has(snapshot, staticData, "Firebrand");
}

export function canCrash(snapshot, staticData) {
  return has(snapshot, staticData, "Green Pearl Bean") && has(snapshot, staticData, "Thunderhand");
}

export function hammers(snapshot, staticData) {
  return has(snapshot, staticData, "Hammers");
}

export function super_(snapshot, staticData) {
  return count(snapshot, staticData, "Hammers") >= 2;
}

export function ultra(snapshot, staticData) {
  return count(snapshot, staticData, "Hammers") >= 3;
}

export function fruits(snapshot, staticData) {
  return (
    has(snapshot, staticData, "Red Chuckola Fruit") &&
    has(snapshot, staticData, "Purple Chuckola Fruit") &&
    has(snapshot, staticData, "White Chuckola Fruit")
  );
}

export function pieces(snapshot, staticData) {
  return (
    has(snapshot, staticData, "Beanstar Piece 1") &&
    has(snapshot, staticData, "Beanstar Piece 2") &&
    has(snapshot, staticData, "Beanstar Piece 3") &&
    has(snapshot, staticData, "Beanstar Piece 4")
  );
}

export function neon(snapshot, staticData) {
  return (
    has(snapshot, staticData, "Blue Neon Egg") &&
    has(snapshot, staticData, "Red Neon Egg") &&
    has(snapshot, staticData, "Green Neon Egg") &&
    has(snapshot, staticData, "Yellow Neon Egg") &&
    has(snapshot, staticData, "Purple Neon Egg") &&
    has(snapshot, staticData, "Orange Neon Egg") &&
    has(snapshot, staticData, "Azure Neon Egg")
  );
}

export function spangle(snapshot, staticData) {
  return has(snapshot, staticData, "Spangle");
}

export function rose(snapshot, staticData) {
  return has(snapshot, staticData, "Peasley's Rose");
}

export function brooch(snapshot, staticData) {
  return has(snapshot, staticData, "Beanbean Brooch");
}

export function thunder(snapshot, staticData) {
  return has(snapshot, staticData, "Thunderhand");
}

export function fire(snapshot, staticData) {
  return has(snapshot, staticData, "Firebrand");
}

export function dressBeanstar(snapshot, staticData) {
  return has(snapshot, staticData, "Peach's Extra Dress") && has(snapshot, staticData, "Fake Beanstar");
}

export function membership(snapshot, staticData) {
  return has(snapshot, staticData, "Membership Card");
}

export function winkle(snapshot, staticData) {
  return has(snapshot, staticData, "Winkle Card");
}

export function beanFruit(snapshot, staticData) {
  return (
    has(snapshot, staticData, "Bean Fruit 1") &&
    has(snapshot, staticData, "Bean Fruit 2") &&
    has(snapshot, staticData, "Bean Fruit 3") &&
    has(snapshot, staticData, "Bean Fruit 4") &&
    has(snapshot, staticData, "Bean Fruit 5") &&
    has(snapshot, staticData, "Bean Fruit 6") &&
    has(snapshot, staticData, "Bean Fruit 7")
  );
}

export function surfable(snapshot, staticData) {
  return ultra(snapshot, staticData) && (
    (canDig(snapshot, staticData) && canMini(snapshot, staticData)) ||
    (membership(snapshot, staticData) && fire(snapshot, staticData))
  );
}

export function postJokes(snapshot, staticData, goal) {
  // goal is 0 for 'vanilla', 1 for 'emblem_hunt' based on Options.py
  if (goal === 0) { // Logic for beating jokes end without beanstar emblems
    return (
      surfable(snapshot, staticData) &&
      canDig(snapshot, staticData) &&
      dressBeanstar(snapshot, staticData) &&
      pieces(snapshot, staticData) &&
      fruits(snapshot, staticData) &&
      brooch(snapshot, staticData) &&
      rose(snapshot, staticData) &&
      canDash(snapshot, staticData)
    );
  } else { // Logic for beating jokes end with beanstar emblems
    return (
      surfable(snapshot, staticData) &&
      canDig(snapshot, staticData) &&
      canDash(snapshot, staticData)
    );
  }
}

export function teehee(snapshot, staticData) {
  return super_(snapshot, staticData) || canDash(snapshot, staticData);
}

export function castleTown(snapshot, staticData) {
  return fruits(snapshot, staticData) && brooch(snapshot, staticData);
}

export function fungitown(snapshot, staticData) {
  return (
    castleTown(snapshot, staticData) &&
    thunder(snapshot, staticData) &&
    rose(snapshot, staticData) &&
    (super_(snapshot, staticData) || canDash(snapshot, staticData))
  );
}

export function piranha_shop(snapshot, staticData) {
  return can_reach(snapshot, staticData, "Shop Mom Piranha Flag");
}

export function fungitown_shop(snapshot, staticData) {
  return can_reach(snapshot, staticData, "Shop Enter Fungitown Flag");
}

export function star_shop(snapshot, staticData) {
  return can_reach(snapshot, staticData, "Shop Beanstar Complete Flag");
}

export function birdo_shop(snapshot, staticData) {
  return can_reach(snapshot, staticData, "Shop Birdo Flag");
}

export function fungitown_birdo_shop(snapshot, staticData) {
  return can_reach(snapshot, staticData, "Fungitown Shop Birdo Flag");
}

export function soul(snapshot, staticData) {
  return (
    ultra(snapshot, staticData) &&
    canMini(snapshot, staticData) &&
    canDig(snapshot, staticData) &&
    canDash(snapshot, staticData) &&
    canCrash(snapshot, staticData)
  );
}

/**
 * Mario & Luigi Superstar Saga state management module
 */
export const mlssStateModule = {
  /**
   * Initializes a new, empty MLSS game state.
   */
  initializeState() {
    return {
      flags: [], // Checked locations
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
   * Process special event items if any
   */
  processEventItem(gameState, itemName) {
    return null; // No special event processing for MLSS
  },

  /**
   * Returns the MLSS state properties for a snapshot.
   */
  getStateForSnapshot(gameState) {
    return {
      flags: gameState.flags || [],
      events: gameState.events || [],
    };
  },
};

/**
 * MLSS helper functions registry
 */
export const helperFunctions = {
  has,
  count,
  can_reach,
  canDig,
  canMini,
  canDash,
  canCrash,
  hammers,
  super: super_,  // 'super' is a reserved keyword in JavaScript
  ultra,
  fruits,
  pieces,
  neon,
  spangle,
  rose,
  brooch,
  thunder,
  fire,
  dressBeanstar,
  membership,
  winkle,
  beanFruit,
  surfable,
  postJokes,
  teehee,
  castleTown,
  fungitown,
  piranha_shop,
  fungitown_shop,
  star_shop,
  birdo_shop,
  fungitown_birdo_shop,
  soul,
};
