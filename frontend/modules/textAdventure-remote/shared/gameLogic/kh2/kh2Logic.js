/**
 * Kingdom Hearts 2 helper functions for game-specific logic.
 */

// Auto form mappings
const AUTO_FORM_MAP = {
  'Final Form': 'Auto Final',
  'Master Form': 'Auto Master',
  'Limit Form': 'Auto Limit',
  'Wisdom Form': 'Auto Wisdom',
  'Valor Form': 'Auto Valor'
};

// List of all drive forms
const DRIVE_FORMS = ['Valor Form', 'Wisdom Form', 'Limit Form', 'Master Form', 'Final Form'];

// List of visit locking items (2VisitLocking from worlds/kh2/Items.py:569-584)
// Note: Ice Cream appears twice in the Python list, so we include it twice here
const VISIT_LOCKING_ITEMS = [
  'Disney Castle Key',
  'Battlefields of War',
  'Sword of the Ancestor',
  "Beast's Claw",
  'Bone Fist',
  'Proud Fang',
  'Skill and Crossbones',
  'Scimitar',
  'Membership Card',
  'Ice Cream',
  'Way to the Dawn',
  'Identity Disk',
  'Ice Cream',  // Appears twice in Python list (Items.py:579 and 582)
  "Namine Sketches"
];

// Data Xaldin fight requirements (from worlds/kh2/Logic.py:204-245)
const EASY_DATA_XALDIN = {
  'Fire Element': 3,
  'Air Combo Plus': 2,
  'Finishing Plus': 1,
  'Guard': 1,
  'Reflect Element': 3,
  'Donald Flare Force': 1,
  'Donald Fantasia': 1,
  'High Jump': 3,
  'Aerial Dodge': 3,
  'Glide': 3,
  'Magnet Element': 1,
  'Horizontal Slash': 1,
  'Aerial Dive': 1,
  'Aerial Spiral': 1,
  'Berserk Charge': 1
};

const NORMAL_DATA_XALDIN = {
  'Fire Element': 3,
  'Finishing Plus': 1,
  'Guard': 1,
  'Reflect Element': 3,
  'Donald Flare Force': 1,
  'Donald Fantasia': 1,
  'High Jump': 3,
  'Aerial Dodge': 3,
  'Glide': 3,
  'Magnet Element': 1,
  'Horizontal Slash': 1,
  'Aerial Dive': 1,
  'Aerial Spiral': 1
};

const HARD_DATA_XALDIN = {
  'Fire Element': 2,
  'Finishing Plus': 1,
  'Guard': 1,
  'High Jump': 2,
  'Aerial Dodge': 2,
  'Glide': 2,
  'Magnet Element': 1,
  'Aerial Dive': 1
};

// Party limit items (from worlds/kh2/Logic.py:35-40)
const PARTY_LIMIT = [
  'Donald Fantasia',
  'Donald Flare Force',
  'Teamwork',
  'Tornado Fusion'
];

// Gap closer abilities (from worlds/kh2/Logic.py:9-12)
const GAP_CLOSER = [
  'Slide Dash',
  'Flash Step'
];

// Ground finisher abilities (from worlds/kh2/Logic.py:30-34)
const GROUND_FINISHER = [
  'Guard Break',
  'Explosion',
  'Finishing Leap'
];

// Donald limit items (from worlds/kh2/Logic.py:41-44)
const DONALD_LIMIT = [
  'Donald Fantasia',
  'Donald Flare Force'
];

// Data Axel fight requirements (from worlds/kh2/Logic.py:455-485)
const EASY_DATA_AXEL = {
  'Guard': 1,
  'Reflect Element': 3,
  'Slide Dash': 1,
  'Flash Step': 1,
  'Guard Break': 1,
  'Explosion': 1,
  'Dodge Roll': 3,
  'Finishing Plus': 1,
  'Second Chance': 1,
  'Once More': 1,
  'Blizzard Element': 3
};

const NORMAL_DATA_AXEL = {
  'Guard': 1,
  'Reflect Element': 2,
  'Slide Dash': 1,
  'Flash Step': 1,
  'Guard Break': 1,
  'Explosion': 1,
  'Dodge Roll': 3,
  'Finishing Plus': 1,
  'Blizzard Element': 3
};

const HARD_DATA_AXEL = {
  'Guard': 1,
  'Reflect Element': 1,
  'Dodge Roll': 2,
  'Finishing Plus': 1,
  'Blizzard Element': 2
};

export const helperFunctions = {
  /**
   * Check if player has unlocked a specific form level.
   * This is the main entry point for form level checks.
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @param {string} formName - Name of the form (e.g., "Master Form")
   * @param {number} levelRequired - Level requirement (0-based)
   * @param {boolean} fightLogic - Whether this is for fight logic (default: false)
   * @returns {boolean} True if player can access this form level
   */
  form_list_unlock(snapshot, staticData, formName, levelRequired = 0, fightLogic = false) {
    // Check if player has the form itself (or auto variant if AutoFormLogic is enabled)
    const hasForm = helperFunctions.has_form_access(snapshot, staticData, formName, fightLogic);

    if (!hasForm) {
      return false;
    }

    // Check if player has enough total forms for the level requirement
    return helperFunctions.get_form_level_requirement(snapshot, staticData, levelRequired);
  },

  /**
   * Check if player has access to a specific form (including auto form variants).
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @param {string} formName - Name of the form
   * @param {boolean} fightLogic - Whether this is for fight logic
   * @returns {boolean} True if player has access to the form
   */
  has_form_access(snapshot, staticData, formName, fightLogic = false) {
    // Player needs the form itself
    if (!snapshot?.inventory?.[formName]) {
      return false;
    }

    // If AutoFormLogic is disabled or this is for fight logic, just check the form itself
    const settings = staticData?.settings || {};
    const autoFormLogic = settings.AutoFormLogic ?? false;

    if (!autoFormLogic || fightLogic) {
      return true;
    }

    // AutoFormLogic is enabled - check for auto form variants
    // Special case: Master Form also requires Drive Converter
    if (formName === 'Master Form') {
      const hasDriveConverter = snapshot?.inventory?.['Drive Converter'] > 0;
      if (!hasDriveConverter) {
        return true; // No auto form available without Drive Converter
      }
    }

    // Check if player has Second Chance (required for auto forms)
    const hasSecondChance = snapshot?.inventory?.['Second Chance'] > 0;
    if (!hasSecondChance) {
      return true; // Can't use auto forms without Second Chance
    }

    // Player can use either the regular form or the auto form
    const autoFormName = AUTO_FORM_MAP[formName];
    if (autoFormName && snapshot?.inventory?.[autoFormName] > 0) {
      return true;
    }

    return true; // Has the regular form
  },

  /**
   * Check if player has enough total forms for a given level requirement.
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @param {number} amount - Minimum number of forms required
   * @returns {boolean} True if player has enough forms
   */
  get_form_level_requirement(snapshot, staticData, amount) {
    const settings = staticData?.settings || {};
    const finalFormLogic = settings.FinalFormLogic ?? 1; // Default: light_and_darkness

    let formsAvailable = 0;
    let formList = [...DRIVE_FORMS]; // Copy the array

    // Handle Final Form based on FinalFormLogic setting
    if (finalFormLogic !== 0) { // not "no_light_and_darkness"
      if (finalFormLogic === 1) { // "light_and_darkness"
        // Check if player has Light and Darkness and any form
        const hasLightDarkness = snapshot?.inventory?.['Light & Darkness'] > 0;
        const hasAnyForm = formList.some(form => snapshot?.inventory?.[form] > 0);

        if (hasLightDarkness && hasAnyForm) {
          formsAvailable += 1;
          // Remove Final Form from the list so it's not counted again
          formList = formList.filter(f => f !== 'Final Form');
        }
      } else { // finalFormLogic === 2, "just_a_form"
        // Remove Final Form from counting
        formList = formList.filter(f => f !== 'Final Form');

        // Check if player has any non-Final form
        const hasAnyOtherForm = formList.some(form => snapshot?.inventory?.[form] > 0);
        if (hasAnyOtherForm) {
          formsAvailable += 1;
        }
      }
    }

    // Count all forms the player has
    for (const form of formList) {
      if (snapshot?.inventory?.[form] > 0) {
        formsAvailable += 1;
      }
    }

    return formsAvailable >= amount;
  },

  /**
   * Check if Simulated Twilight Town is unlocked.
   * Based on worlds/kh2/Rules.py:58-59
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @param {number} amount - Required count of Namine Sketches
   * @returns {boolean} True if player has the required amount of Namine Sketches
   */
  stt_unlocked(snapshot, staticData, amount) {
    const count = snapshot?.inventory?.["Namine Sketches"] || 0;
    return count >= amount;
  },

  /**
   * Check if Land of Dragons is unlocked.
   * Based on worlds/kh2/Rules.py:37-38
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @param {number} amount - Required count of Sword of the Ancestor
   * @returns {boolean} True if player has the required amount of Sword of the Ancestor
   */
  lod_unlocked(snapshot, staticData, amount) {
    const count = snapshot?.inventory?.["Sword of the Ancestor"] || 0;
    return count >= amount;
  },

  /**
   * Check if Olympus Coliseum is unlocked.
   * Based on worlds/kh2/Rules.py:40-41
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @param {number} amount - Required count of Battlefields of War
   * @returns {boolean} True if player has the required amount of Battlefields of War
   */
  oc_unlocked(snapshot, staticData, amount) {
    const count = snapshot?.inventory?.["Battlefields of War"] || 0;
    return count >= amount;
  },

  /**
   * Check if The World That Never Was is unlocked.
   * Based on worlds/kh2/Rules.py:43-44
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @param {number} amount - Required count of Way to the Dawn
   * @returns {boolean} True if player has the required amount of Way to the Dawn
   */
  twtnw_unlocked(snapshot, staticData, amount) {
    const count = snapshot?.inventory?.["Way to the Dawn"] || 0;
    return count >= amount;
  },

  /**
   * Check if level locking is unlocked.
   * Based on worlds/kh2/Rules.py:85-88
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @param {number} amount - Required total count of visit locking items
   * @returns {boolean} True if player has enough visit locking items or Promise Charm
   */
  level_locking_unlock(snapshot, staticData, amount) {
    const settings = staticData?.settings || {};

    // Check if Promise Charm option is enabled and player has Promise Charm
    // Note: The Promise_Charm setting is not currently exported in rules.json
    // For now, we'll check if the setting exists and if the player has the item
    if (settings.Promise_Charm && snapshot?.inventory?.['Promise Charm'] > 0) {
      return true;
    }

    // Count all visit locking items
    let totalCount = 0;
    for (const itemName of VISIT_LOCKING_ITEMS) {
      totalCount += snapshot?.inventory?.[itemName] || 0;
    }

    return totalCount >= amount;
  },

  /**
   * Check if Twilight Thorn region is accessible.
   * Based on worlds/kh2/Rules.py:1052-1053
   * This is a static method that always returns true.
   *
   * @returns {boolean} Always returns true
   */
  get_twilight_thorn_rules() {
    return true;
  },

  /**
   * Check if Axel 1 region is accessible.
   * Based on worlds/kh2/Rules.py:1056-1057
   * This is a static method that always returns true.
   *
   * @returns {boolean} Always returns true
   */
  get_axel_one_rules() {
    return true;
  },

  /**
   * Check if Axel 2 region is accessible.
   * Based on worlds/kh2/Rules.py:1060-1061
   * This is a static method that always returns true.
   *
   * @returns {boolean} Always returns true
   */
  get_axel_two_rules() {
    return true;
  },

  /**
   * Check if Halloween Town is unlocked.
   * Based on worlds/kh2/Rules.py:46-47
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @param {number} amount - Required count of Bone Fist
   * @returns {boolean} True if player has the required amount of Bone Fist
   */
  ht_unlocked(snapshot, staticData, amount) {
    const count = snapshot?.inventory?.["Bone Fist"] || 0;
    return count >= amount;
  },

  /**
   * Check if Twilight Town is unlocked.
   * Based on worlds/kh2/Rules.py:49-50
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @param {number} amount - Required count of Ice Cream
   * @returns {boolean} True if player has the required amount of Ice Cream
   */
  tt_unlocked(snapshot, staticData, amount) {
    const count = snapshot?.inventory?.["Ice Cream"] || 0;
    return count >= amount;
  },

  /**
   * Check if Port Royal is unlocked.
   * Based on worlds/kh2/Rules.py:52-53
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @param {number} amount - Required count of Skill and Crossbones
   * @returns {boolean} True if player has the required amount of Skill and Crossbones
   */
  pr_unlocked(snapshot, staticData, amount) {
    const count = snapshot?.inventory?.["Skill and Crossbones"] || 0;
    return count >= amount;
  },

  /**
   * Check if Space Paranoids is unlocked.
   * Based on worlds/kh2/Rules.py:55-56
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @param {number} amount - Required count of Identity Disk
   * @returns {boolean} True if player has the required amount of Identity Disk
   */
  sp_unlocked(snapshot, staticData, amount) {
    const count = snapshot?.inventory?.["Identity Disk"] || 0;
    return count >= amount;
  },

  /**
   * Check if Disney Castle is unlocked.
   * Based on worlds/kh2/Rules.py:61-62
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @param {number} amount - Required count of Disney Castle Key
   * @returns {boolean} True if player has the required amount of Disney Castle Key
   */
  dc_unlocked(snapshot, staticData, amount) {
    const count = snapshot?.inventory?.["Disney Castle Key"] || 0;
    return count >= amount;
  },

  /**
   * Check if Hollow Bastion is unlocked.
   * Based on worlds/kh2/Rules.py:64-65
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @param {number} amount - Required count of Membership Card
   * @returns {boolean} True if player has the required amount of Membership Card
   */
  hb_unlocked(snapshot, staticData, amount) {
    const count = snapshot?.inventory?.["Membership Card"] || 0;
    return count >= amount;
  },

  /**
   * Check if Pride Lands is unlocked.
   * Based on worlds/kh2/Rules.py:67-68
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @param {number} amount - Required count of Proud Fang
   * @returns {boolean} True if player has the required amount of Proud Fang
   */
  pl_unlocked(snapshot, staticData, amount) {
    const count = snapshot?.inventory?.["Proud Fang"] || 0;
    return count >= amount;
  },

  /**
   * Check if Agrabah is unlocked.
   * Based on worlds/kh2/Rules.py:70-71
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @param {number} amount - Required count of Scimitar
   * @returns {boolean} True if player has the required amount of Scimitar
   */
  ag_unlocked(snapshot, staticData, amount) {
    const count = snapshot?.inventory?.["Scimitar"] || 0;
    return count >= amount;
  },

  /**
   * Check if Beast's Castle is unlocked.
   * Based on worlds/kh2/Rules.py:73-74
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @param {number} amount - Required count of Beast's Claw
   * @returns {boolean} True if player has the required amount of Beast's Claw
   */
  bc_unlocked(snapshot, staticData, amount) {
    const count = snapshot?.inventory?.["Beast's Claw"] || 0;
    return count >= amount;
  },

  /**
   * Check if Atlantica 3 is unlocked.
   * Based on worlds/kh2/Rules.py:76-77
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player has 2 or more Magnet Element
   */
  at_three_unlocked(snapshot, staticData) {
    const count = snapshot?.inventory?.["Magnet Element"] || 0;
    return count >= 2;
  },

  /**
   * Check if Atlantica 4 is unlocked.
   * Based on worlds/kh2/Rules.py:79-80
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player has 3 or more Thunder Element
   */
  at_four_unlocked(snapshot, staticData) {
    const count = snapshot?.inventory?.["Thunder Element"] || 0;
    return count >= 3;
  },

  /**
   * Check if Hundred Acre Wood is unlocked.
   * Based on worlds/kh2/Rules.py:82-83
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @param {number} amount - Required count of Torn Page
   * @returns {boolean} True if player has the required amount of Torn Page
   */
  hundred_acre_unlocked(snapshot, staticData, amount) {
    const count = snapshot?.inventory?.["Torn Page"] || 0;
    return count >= amount;
  },

  /**
   * Check if Prison Keeper fight is accessible.
   * Based on worlds/kh2/Rules.py:849-858
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Prison Keeper fight
   */
  get_prison_keeper_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const defensiveTool = ['Reflect Element', 'Guard'];
    const formList = ['Valor Form', 'Wisdom Form', 'Limit Form', 'Master Form', 'Final Form'];
    const partyLimit = ['Donald Fantasia', 'Donald Flare Force', 'Teamwork', 'Tornado Fusion'];

    let categoriesAvailable = 0;
    if (defensiveTool.some(tool => snapshot?.inventory?.[tool] > 0)) categoriesAvailable++;
    if (formList.some(form => snapshot?.inventory?.[form] > 0)) categoriesAvailable++;
    if (partyLimit.some(limit => snapshot?.inventory?.[limit] > 0)) categoriesAvailable++;

    if (fightLogic === 0) return categoriesAvailable >= 3; // easy
    if (fightLogic === 1) return categoriesAvailable >= 2; // normal
    return categoriesAvailable >= 1; // hard
  },

  /**
   * Check if Shan Yu fight is accessible.
   * Based on worlds/kh2/Rules.py:726-735
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Shan Yu fight
   */
  get_shan_yu_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const gapCloser = ['Slide Dash', 'Flash Step'];
    const defensiveTool = ['Reflect Element', 'Guard'];
    const formList = ['Valor Form', 'Wisdom Form', 'Limit Form', 'Master Form', 'Final Form'];

    let categoriesAvailable = 0;
    if (gapCloser.some(item => snapshot?.inventory?.[item] > 0)) categoriesAvailable++;
    if (defensiveTool.some(tool => snapshot?.inventory?.[tool] > 0)) categoriesAvailable++;
    if (formList.some(form => snapshot?.inventory?.[form] > 0)) categoriesAvailable++;

    if (fightLogic === 0) return categoriesAvailable >= 3; // easy
    if (fightLogic === 1) return categoriesAvailable >= 2; // normal
    // hard: defensive tool or drive form
    const hasDefensiveTool = defensiveTool.some(tool => snapshot?.inventory?.[tool] > 0);
    const hasForm = formList.some(form => snapshot?.inventory?.[form] > 0);
    return hasDefensiveTool || hasForm;
  },

  /**
   * Check if Dark Thorn fight is accessible.
   * Based on worlds/kh2/Rules.py:784-793
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Dark Thorn fight
   */
  get_dark_thorn_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const formList = ['Valor Form', 'Wisdom Form', 'Limit Form', 'Master Form', 'Final Form'];
    const gapCloser = ['Slide Dash', 'Flash Step'];
    const defensiveTool = ['Reflect Element', 'Guard'];

    if (fightLogic === 0) { // easy: all 3 categories
      let categoriesAvailable = 0;
      if (formList.some(form => snapshot?.inventory?.[form] > 0)) categoriesAvailable++;
      if (gapCloser.some(item => snapshot?.inventory?.[item] > 0)) categoriesAvailable++;
      if (defensiveTool.some(tool => snapshot?.inventory?.[tool] > 0)) categoriesAvailable++;
      return categoriesAvailable >= 3;
    } else if (fightLogic === 1) { // normal: drive form AND defensive tool (no gap closer)
      let categoriesAvailable = 0;
      if (formList.some(form => snapshot?.inventory?.[form] > 0)) categoriesAvailable++;
      if (defensiveTool.some(tool => snapshot?.inventory?.[tool] > 0)) categoriesAvailable++;
      return categoriesAvailable >= 2;
    } else { // hard: defensive tool only
      return defensiveTool.some(tool => snapshot?.inventory?.[tool] > 0);
    }
  },

  /**
   * Check if Fire Lord fight is accessible.
   * Based on worlds/kh2/Rules.py:743-750
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Fire Lord fight
   */
  get_fire_lord_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const formList = ['Valor Form', 'Wisdom Form', 'Limit Form', 'Master Form', 'Final Form'];
    const defensiveTool = ['Reflect Element', 'Guard'];
    const blackMagic = ['Fire Element', 'Blizzard Element', 'Thunder Element'];
    const partyLimit = ['Donald Fantasia', 'Donald Flare Force', 'Teamwork', 'Tornado Fusion'];

    let categoriesAvailable = 0;
    if (formList.some(form => snapshot?.inventory?.[form] > 0)) categoriesAvailable++;
    if (defensiveTool.some(tool => snapshot?.inventory?.[tool] > 0)) categoriesAvailable++;
    if (blackMagic.some(magic => snapshot?.inventory?.[magic] > 0)) categoriesAvailable++;
    if (partyLimit.some(limit => snapshot?.inventory?.[limit] > 0)) categoriesAvailable++;

    if (fightLogic === 0) return categoriesAvailable >= 4; // easy
    if (fightLogic === 1) return categoriesAvailable >= 3; // normal
    return categoriesAvailable >= 2; // hard
  },

  /**
   * Check if Blizzard Lord fight is accessible.
   * Based on worlds/kh2/Rules.py:753-760
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Blizzard Lord fight
   */
  get_blizzard_lord_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const formList = ['Valor Form', 'Wisdom Form', 'Limit Form', 'Master Form', 'Final Form'];
    const defensiveTool = ['Reflect Element', 'Guard'];
    const blackMagic = ['Fire Element', 'Blizzard Element', 'Thunder Element'];
    const partyLimit = ['Donald Fantasia', 'Donald Flare Force', 'Teamwork', 'Tornado Fusion'];

    let categoriesAvailable = 0;
    if (formList.some(form => snapshot?.inventory?.[form] > 0)) categoriesAvailable++;
    if (defensiveTool.some(tool => snapshot?.inventory?.[tool] > 0)) categoriesAvailable++;
    if (blackMagic.some(magic => snapshot?.inventory?.[magic] > 0)) categoriesAvailable++;
    if (partyLimit.some(limit => snapshot?.inventory?.[limit] > 0)) categoriesAvailable++;

    if (fightLogic === 0) return categoriesAvailable >= 4; // easy
    if (fightLogic === 1) return categoriesAvailable >= 3; // normal
    return categoriesAvailable >= 2; // hard
  },

  /**
   * Check if Oogie Boogie fight is accessible.
   * Based on worlds/kh2/Rules.py:861-863
   * This is a static method that always returns true (fight is free).
   *
   * @returns {boolean} Always returns true
   */
  get_oogie_rules() {
    return true;
  },

  /**
   * Check if Beast fight is accessible.
   * Based on worlds/kh2/Rules.py:779-781
   * This is a static method that always returns true (fight is free).
   *
   * @returns {boolean} Always returns true
   */
  get_beast_rules() {
    return true;
  },

  /**
   * Check if Thresholder fight is accessible.
   * Based on worlds/kh2/Rules.py:767-776
   *
   * Requires different item combinations based on fight_logic setting:
   * - easy (0): drive form + black magic + defensive tool (3 categories)
   * - normal (1): 2 of the above 3 categories
   * - hard (2): defensive tool or drive form (1 category)
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Thresholder fight
   */
  get_thresholder_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    // Define item categories (from worlds/kh2/Logic.py)
    const formList = ['Valor Form', 'Wisdom Form', 'Limit Form', 'Master Form', 'Final Form'];
    const blackMagic = ['Fire Element', 'Blizzard Element', 'Thunder Element'];
    const defensiveTool = ['Reflect Element', 'Guard'];

    // Count how many categories the player has access to
    let categoriesAvailable = 0;

    // Check if player has any form
    if (formList.some(form => snapshot?.inventory?.[form] > 0)) {
      categoriesAvailable++;
    }

    // Check if player has any black magic
    if (blackMagic.some(magic => snapshot?.inventory?.[magic] > 0)) {
      categoriesAvailable++;
    }

    // Check if player has any defensive tool
    if (defensiveTool.some(tool => snapshot?.inventory?.[tool] > 0)) {
      categoriesAvailable++;
    }

    // Apply fight logic based on setting
    if (fightLogic === 0) { // easy
      return categoriesAvailable >= 3;
    } else if (fightLogic === 1) { // normal (default)
      return categoriesAvailable >= 2;
    } else { // hard (2)
      // For hard mode, need defensive tool OR drive form (not black magic alone)
      const hasForm = formList.some(form => snapshot?.inventory?.[form] > 0);
      const hasDefensiveTool = defensiveTool.some(tool => snapshot?.inventory?.[tool] > 0);
      return hasForm || hasDefensiveTool;
    }
  },

  /**
   * Check if Demyx fight is accessible.
   * Based on worlds/kh2/Rules.py:887-896
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Demyx fight
   */
  get_demyx_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const defensiveTool = ['Reflect Element', 'Guard'];
    const formList = ['Valor Form', 'Wisdom Form', 'Limit Form', 'Master Form', 'Final Form'];
    const partyLimit = ['Donald Fantasia', 'Donald Flare Force', 'Teamwork', 'Tornado Fusion'];

    // Count categories using kh2_list_any_sum
    const categoriesAvailable = helperFunctions.kh2_list_any_sum(
      [defensiveTool, formList, partyLimit],
      snapshot
    );

    if (fightLogic === 0) return categoriesAvailable >= 3; // easy
    if (fightLogic === 1) {
      // normal: defensive tool + drive form (2 categories)
      const hasDefensive = defensiveTool.some(tool => snapshot?.inventory?.[tool] > 0);
      const hasForm = formList.some(form => snapshot?.inventory?.[form] > 0);
      return hasDefensive && hasForm;
    }
    // hard: defensive tool only
    return defensiveTool.some(tool => snapshot?.inventory?.[tool] > 0);
  },

  /**
   * Check if Cavern of Remembrance first fight movement requirements are met.
   * Based on worlds/kh2/Rules.py:931-940
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player meets movement requirements
   */
  get_cor_first_fight_movement_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    if (fightLogic === 0) { // easy: quick run 3 or wisdom 5
      return (snapshot?.inventory?.['Quick Run'] >= 3) ||
        helperFunctions.form_list_unlock(snapshot, staticData, 'Wisdom Form', 3, true);
    } else if (fightLogic === 1) { // normal: (quick run 2 and aerial dodge 1) or wisdom 5
      return helperFunctions.kh2_dict_count({'Quick Run': 2, 'Aerial Dodge': 1}, snapshot) ||
        helperFunctions.form_list_unlock(snapshot, staticData, 'Wisdom Form', 3, true);
    } else { // hard: (quick run 1, aerial dodge 1) or (wisdom form and aerial dodge 1)
      return helperFunctions.kh2_has_all(snapshot, staticData, ['Aerial Dodge', 'Quick Run']) ||
        helperFunctions.kh2_has_all(snapshot, staticData, ['Aerial Dodge', 'Wisdom Form']);
    }
  },

  /**
   * Check if Cavern of Remembrance first fight requirements are met.
   * Based on worlds/kh2/Rules.py:942-951
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access first fight
   */
  get_cor_first_fight_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const notHardCorToolsDict = {
      'Reflect Element': 3,
      'Stitch': 1,
      'Chicken Little': 1,
      'Magnet Element': 2,
      'Explosion': 1,
      'Finishing Leap': 1,
      'Thunder Element': 2
    };

    const toolCount = helperFunctions.kh2_dict_one_count(notHardCorToolsDict, snapshot);

    if (fightLogic === 0) { // easy: 5 tools or 4 tools + final form 1
      return toolCount >= 5 ||
        (toolCount >= 4 && helperFunctions.form_list_unlock(snapshot, staticData, 'Final Form', 1, true));
    } else if (fightLogic === 1) { // normal: 3 tools or 2 tools + final form 1
      return toolCount >= 3 ||
        (toolCount >= 2 && helperFunctions.form_list_unlock(snapshot, staticData, 'Final Form', 1, true));
    } else { // hard: reflect + (stitch or chicken little) + final form
      return (snapshot?.inventory?.['Reflect Element'] > 0) &&
        helperFunctions.kh2_has_any(snapshot, staticData, ['Stitch', 'Chicken Little']) &&
        helperFunctions.form_list_unlock(snapshot, staticData, 'Final Form', 1, true);
    }
  },

  /**
   * Check if Cavern of Remembrance skip requirements are met.
   * Based on worlds/kh2/Rules.py:953-977
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can skip the first fight
   */
  get_cor_skip_first_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};

    // Check if CoR skip is enabled
    if (!settings.CorSkipToggle) {
      return false;
    }

    const fightLogic = settings.FightLogic ?? 1; // Default: normal
    const magic = ['Fire Element', 'Blizzard Element', 'Thunder Element', 'Reflect Element', 'Cure Element', 'Magnet Element'];

    // Void cross rules
    let voidCrossPass = false;
    if (fightLogic === 0) { // easy: aerial dodge 3, master form, fire
      voidCrossPass = (snapshot?.inventory?.['Aerial Dodge'] >= 3) &&
        helperFunctions.kh2_has_all(snapshot, staticData, ['Master Form', 'Fire Element']);
    } else if (fightLogic === 1) { // normal: aerial dodge 2, master form, fire
      voidCrossPass = (snapshot?.inventory?.['Aerial Dodge'] >= 2) &&
        helperFunctions.kh2_has_all(snapshot, staticData, ['Master Form', 'Fire Element']);
    } else { // hard: multiple options
      voidCrossPass = helperFunctions.kh2_dict_count({'Quick Run': 3, 'Aerial Dodge': 1}, snapshot) ||
        (helperFunctions.kh2_dict_count({'Quick Run': 2, 'Aerial Dodge': 2}, snapshot) &&
          helperFunctions.kh2_has_any(snapshot, staticData, magic)) ||
        ((snapshot?.inventory?.['Final Form'] > 0) &&
          (helperFunctions.kh2_has_any(snapshot, staticData, magic) || (snapshot?.inventory?.['Combo Master'] > 0))) ||
        ((snapshot?.inventory?.['Master Form'] > 0) &&
          helperFunctions.kh2_has_any(snapshot, staticData, ['Reflect Element', 'Fire Element', 'Combo Master']));
    }

    // Wall rise rules
    let wallRisePass = true;
    if (fightLogic === 2) { // hard only
      wallRisePass = (snapshot?.inventory?.['Aerial Dodge'] > 0) &&
        (helperFunctions.form_list_unlock(snapshot, staticData, 'Final Form', 1, true) ||
          (snapshot?.inventory?.['Glide'] >= 2));
    }

    return voidCrossPass && wallRisePass;
  },

  /**
   * Check if Cavern of Remembrance second fight movement requirements are met.
   * Based on worlds/kh2/Rules.py:979-991
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player meets movement requirements
   */
  get_cor_second_fight_movement_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal
    const magic = ['Fire Element', 'Blizzard Element', 'Thunder Element', 'Reflect Element', 'Cure Element', 'Magnet Element'];

    if (fightLogic === 0) { // easy: quick run 2, aerial dodge 3 or master form 5
      return helperFunctions.kh2_dict_count({'Quick Run': 2, 'Aerial Dodge': 3}, snapshot) ||
        helperFunctions.form_list_unlock(snapshot, staticData, 'Master Form', 3, true);
    } else if (fightLogic === 1) { // normal: quick run 2, aerial dodge 2 or master 5
      return helperFunctions.kh2_dict_count({'Quick Run': 2, 'Aerial Dodge': 2}, snapshot) ||
        helperFunctions.form_list_unlock(snapshot, staticData, 'Master Form', 3, true);
    } else { // hard: multiple options
      return (helperFunctions.kh2_has_all(snapshot, staticData, ['Glide', 'Aerial Dodge']) &&
        helperFunctions.kh2_has_any(snapshot, staticData, magic)) ||
        ((snapshot?.inventory?.['Master Form'] > 0) && helperFunctions.kh2_has_any(snapshot, staticData, magic)) ||
        ((snapshot?.inventory?.['Glide'] > 0) && (snapshot?.inventory?.['Aerial Dodge'] >= 2));
    }
  },

  /**
   * Check if Cerberus fight is accessible.
   * Based on worlds/kh2/Rules.py:672-680
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Cerberus fight
   */
  get_cerberus_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const defensiveTool = ['Reflect Element', 'Guard'];
    const blackMagic = ['Fire Element', 'Blizzard Element', 'Thunder Element'];

    if (fightLogic === 0 || fightLogic === 1) { // easy or normal: defensive tool + black magic
      return helperFunctions.kh2_list_any_sum([defensiveTool, blackMagic], snapshot) >= 2;
    }
    // hard: defensive tool only
    return helperFunctions.kh2_has_any(snapshot, staticData, defensiveTool);
  },

  /**
   * Check if Olympus Pete fight is accessible.
   * Based on worlds/kh2/Rules.py:723-732
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Olympus Pete fight
   */
  get_olympus_pete_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const gapCloser = ['Slide Dash', 'Flash Step'];
    const defensiveTool = ['Reflect Element', 'Guard'];
    const formList = ['Valor Form', 'Wisdom Form', 'Limit Form', 'Master Form', 'Final Form'];

    const categoriesAvailable = helperFunctions.kh2_list_any_sum(
      [gapCloser, defensiveTool, formList],
      snapshot
    );

    if (fightLogic === 0) return categoriesAvailable >= 3; // easy
    if (fightLogic === 1) return categoriesAvailable >= 2; // normal
    return categoriesAvailable >= 1; // hard
  },

  /**
   * Check if Hydra fight is accessible.
   * Based on worlds/kh2/Rules.py:734-743
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Hydra fight
   */
  get_hydra_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const blackMagic = ['Fire Element', 'Blizzard Element', 'Thunder Element'];
    const defensiveTool = ['Reflect Element', 'Guard'];
    const formList = ['Valor Form', 'Wisdom Form', 'Limit Form', 'Master Form', 'Final Form'];

    const categoriesAvailable = helperFunctions.kh2_list_any_sum(
      [blackMagic, defensiveTool, formList],
      snapshot
    );

    if (fightLogic === 0) return categoriesAvailable >= 3; // easy
    if (fightLogic === 1) return categoriesAvailable >= 2; // normal
    return categoriesAvailable >= 1; // hard
  },

  /**
   * Check if Hades fight is accessible.
   * Based on worlds/kh2/Rules.py:745-754
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Hades fight
   */
  get_hades_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const gapCloser = ['Slide Dash', 'Flash Step'];
    const summons = ['Chicken Little', 'Stitch', 'Genie', 'Peter Pan'];
    const defensiveTool = ['Reflect Element', 'Guard'];
    const formList = ['Valor Form', 'Wisdom Form', 'Limit Form', 'Master Form', 'Final Form'];

    const categoriesAvailable = helperFunctions.kh2_list_any_sum(
      [gapCloser, summons, defensiveTool, formList],
      snapshot
    );

    if (fightLogic === 0) return categoriesAvailable >= 4; // easy
    if (fightLogic === 1) return categoriesAvailable >= 3; // normal
    return categoriesAvailable >= 2; // hard
  },

  /**
   * Check if Ansem Riku fight is accessible.
   * Based on worlds/kh2/Rules.py:516-525
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Ansem Riku fight
   */
  get_ansem_riku_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const gapCloser = ['Slide Dash', 'Flash Step'];
    const defensiveTool = ['Reflect Element', 'Guard'];
    const groundFinisher = ['Guard Break', 'Explosion', 'Finishing Leap'];

    if (fightLogic === 0) { // easy: 3 of 4 categories
      const categoriesAvailable = helperFunctions.kh2_list_any_sum(
        [gapCloser, defensiveTool, ['Limit Form'], groundFinisher],
        snapshot
      );
      return categoriesAvailable >= 3;
    } else if (fightLogic === 1) { // normal: 2 of 4 categories
      const categoriesAvailable = helperFunctions.kh2_list_any_sum(
        [gapCloser, defensiveTool, ['Limit Form'], groundFinisher],
        snapshot
      );
      return categoriesAvailable >= 2;
    } else { // hard: defensive tool or limit form
      return helperFunctions.kh2_has_any(snapshot, staticData, ['Reflect Element', 'Guard', 'Limit Form']);
    }
  },

  /**
   * Check if Final Form region is accessible.
   * Based on worlds/kh2/Rules.py:372-381
   *
   * Can reach one of: TT3, TWTNW post Roxas, BC2, LoD2, or PR2
   * Checks if player can reach any of the final leveling access locations.
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Final Form region
   */
  final_form_region_access(snapshot, staticData) {
    // These locations are defined in Logic.py:608-614 (final_leveling_access)
    // The Python code checks if any of these locations can be reached, which means:
    // 1. The parent region of the location is accessible
    // 2. The location's access rule passes
    //
    // To avoid circular dependencies (since checking location access would require
    // region access which requires this helper), we check the parent regions instead.
    // From the Python code: "The access rules of each of the locations in final_leveling_access
    // do not check for being able to reach other locations or other regions, so it is only
    // the parent region of each location that needs to be added as an indirect condition."
    //
    // Parent regions (from rules.json):
    const finalLevelingRegions = [
      'Roxas',                // Roxas Event Location
      'Grim Reaper 2',        // (PR2) Grim Reaper 2 Bonus: Sora Slot 1
      'Xaldin',               // (BC2) Xaldin Bonus: Sora Slot 1
      'Storm Rider',          // (LoD2) Storm Rider Bonus: Sora Slot 1
      'Twilight Town 3'       // (TT3) Underground Concourse Mythril Gem
    ];

    // Check if any of these parent regions are accessible
    const regionReachability = snapshot?.regionReachability || {};

    return finalLevelingRegions.some(region =>
      regionReachability[region] === 'reachable'
    );
  },

  /**
   * Check if Storm Rider fight is accessible.
   * Based on worlds/kh2/Rules.py:527-536
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Storm Rider fight
   */
  get_storm_rider_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const defensiveTool = ['Reflect Element', 'Guard'];
    const partyLimit = ['Donald Fantasia', 'Donald Flare Force', 'Teamwork', 'Tornado Fusion'];
    const aerialMove = ['Aerial Dive', 'Aerial Spiral', 'Horizontal Slash', 'Aerial Sweep', 'Aerial Finish'];
    const formList = ['Valor Form', 'Wisdom Form', 'Limit Form', 'Master Form', 'Final Form'];

    const categoriesAvailable = helperFunctions.kh2_list_any_sum(
      [defensiveTool, partyLimit, aerialMove, formList],
      snapshot
    );

    if (fightLogic === 0) return categoriesAvailable >= 4; // easy
    if (fightLogic === 1) return categoriesAvailable >= 3; // normal
    return categoriesAvailable >= 2; // hard
  },

  /**
   * Check if Barbosa fight is accessible.
   * Based on worlds/kh2/Rules.py:get_barbosa_rules
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Barbosa fight
   */
  get_barbosa_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const defensiveTool = ['Reflect Element', 'Guard'];
    const elementalMagic = ['Blizzard Element', 'Thunder Element'];

    if (fightLogic === 0) { // easy: 2+ Blizzard/Thunder AND defensive tool
      const magicCount = elementalMagic.reduce((sum, item) =>
        sum + (snapshot?.inventory?.[item] > 0 ? 1 : 0), 0);
      const hasDefensive = defensiveTool.some(tool => snapshot?.inventory?.[tool] > 0);
      return magicCount >= 2 && hasDefensive;
    } else if (fightLogic === 1) { // normal: 2+ of (defensive tool, Blizzard, Thunder)
      const categoriesAvailable = helperFunctions.kh2_list_any_sum(
        [defensiveTool, elementalMagic],
        snapshot
      );
      return categoriesAvailable >= 2;
    } else { // hard: defensive tool only
      return defensiveTool.some(tool => snapshot?.inventory?.[tool] > 0);
    }
  },

  /**
   * Check if Scar fight is accessible.
   * Based on worlds/kh2/Rules.py:1018-1027
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Scar fight
   */
  get_scar_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    if (fightLogic === 0) { // easy: Reflect, Thunder, Fire
      return helperFunctions.kh2_has_all(snapshot, staticData, ['Reflect Element', 'Thunder Element', 'Fire Element']);
    } else if (fightLogic === 1) { // normal: Reflect, Fire
      return helperFunctions.kh2_has_all(snapshot, staticData, ['Reflect Element', 'Fire Element']);
    } else { // hard: Reflect only
      return snapshot?.inventory?.['Reflect Element'] > 0;
    }
  },

  /**
   * Check if Hostile Program fight is accessible.
   * Based on worlds/kh2/Rules.py:get_hostile_program_rules
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Hostile Program fight
   */
  get_hostile_program_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const donaldLimit = ['Donald Fantasia', 'Donald Flare Force'];
    const formList = ['Valor Form', 'Wisdom Form', 'Limit Form', 'Master Form', 'Final Form'];
    const summons = ['Chicken Little', 'Stitch', 'Genie', 'Peter Pan'];
    const reflectElement = ['Reflect Element'];

    const categoriesAvailable = helperFunctions.kh2_list_any_sum(
      [donaldLimit, formList, summons, reflectElement],
      snapshot
    );

    if (fightLogic === 0) return categoriesAvailable >= 4; // easy
    if (fightLogic === 1) return categoriesAvailable >= 3; // normal
    return categoriesAvailable >= 2; // hard
  },

  /**
   * Check if Transport fight is accessible.
   * Based on worlds/kh2/Rules.py:get_transport_fight_rules
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Transport fight
   */
  get_transport_fight_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const transportTools = {
      'Reflect Element': 3,
      'Stitch': 1,
      'Chicken Little': 1,
      'Magnet Element': 2,
      'Explosion': 1,
      'Finishing Leap': 1,
      'Thunder Element': 3,
      'Donald Fantasia': 1,
      'Donald Flare Force': 1,
      'Genie': 1
    };

    if (fightLogic === 0) { // easy: All requirements met
      return helperFunctions.kh2_dict_count(transportTools, snapshot);
    } else { // normal/hard: Count items that meet their requirements
      const metCount = helperFunctions.kh2_dict_one_count(transportTools, snapshot);
      if (fightLogic === 1) return metCount >= 7; // normal
      return metCount >= 5; // hard
    }
  },

  /**
   * Check if Transport movement requirements are met.
   * Based on worlds/kh2/Rules.py:get_transport_movement_rules
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player meets Transport movement requirements
   */
  get_transport_movement_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const magic = ['Fire Element', 'Blizzard Element', 'Thunder Element',
                   'Reflect Element', 'Cure Element', 'Magnet Element'];

    if (fightLogic === 0) { // easy: High Jump 3, Aerial Dodge 3, Glide 3
      return helperFunctions.kh2_dict_count(
        {'High Jump': 3, 'Aerial Dodge': 3, 'Glide': 3},
        snapshot
      );
    } else if (fightLogic === 1) { // normal: High Jump 2, Aerial Dodge 2, Glide 3
      return helperFunctions.kh2_dict_count(
        {'High Jump': 2, 'Aerial Dodge': 2, 'Glide': 3},
        snapshot
      );
    } else { // hard: Multiple option combinations
      const option1 = helperFunctions.kh2_dict_count(
        {'High Jump': 2, 'Aerial Dodge': 1, 'Glide': 2}, snapshot
      ) && helperFunctions.kh2_has_any(snapshot, staticData, magic);

      const option2 = helperFunctions.kh2_dict_count(
        {'High Jump': 1, 'Aerial Dodge': 3, 'Glide': 2}, snapshot
      ) && helperFunctions.kh2_has_any(snapshot, staticData, magic);

      const option3 = helperFunctions.kh2_dict_count(
        {'High Jump': 1, 'Aerial Dodge': 1, 'Glide': 3}, snapshot
      );

      const option4 = helperFunctions.kh2_has_all(snapshot, staticData, ['Master Form', 'Aerial Dodge']) &&
                     helperFunctions.kh2_has_any(snapshot, staticData, magic);

      return option1 || option2 || option3 || option4;
    }
  },

  /**
   * Check if Old Pete fight is accessible.
   * Based on worlds/kh2/Rules.py:get_old_pete_rules
   * The fight is free with no requirements.
   *
   * @returns {boolean} Always returns true
   */
  get_old_pete_rules() {
    return true;
  },

  /**
   * Check if Future Pete fight is accessible.
   * Based on worlds/kh2/Rules.py:get_future_pete_rules
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Future Pete fight
   */
  get_future_pete_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const defensiveTool = ['Reflect Element', 'Guard'];
    const gapCloser = ['Slide Dash', 'Flash Step'];
    const formList = ['Valor Form', 'Wisdom Form', 'Limit Form', 'Master Form', 'Final Form'];

    const categoriesAvailable = helperFunctions.kh2_list_any_sum(
      [defensiveTool, gapCloser, formList],
      snapshot
    );

    if (fightLogic === 0) return categoriesAvailable >= 3; // easy
    if (fightLogic === 1) return categoriesAvailable >= 2; // normal
    return categoriesAvailable >= 1; // hard
  },

  /**
   * Check if Experiment fight is accessible.
   * Based on worlds/kh2/Rules.py:get_experiment_rules
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Experiment fight
   */
  get_experiment_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const formList = ['Valor Form', 'Wisdom Form', 'Limit Form', 'Master Form', 'Final Form'];
    const defensiveTool = ['Reflect Element', 'Guard'];
    const partyLimit = ['Donald Fantasia', 'Donald Flare Force', 'Teamwork', 'Tornado Fusion'];
    const summons = ['Chicken Little', 'Stitch', 'Genie', 'Peter Pan'];

    const categoriesAvailable = helperFunctions.kh2_list_any_sum(
      [formList, defensiveTool, partyLimit, summons],
      snapshot
    );

    if (fightLogic === 0) return categoriesAvailable >= 4; // easy
    if (fightLogic === 1) return categoriesAvailable >= 3; // normal
    return categoriesAvailable >= 2; // hard
  },

  /**
   * Check if Groundshaker fight is accessible.
   * Based on worlds/kh2/Rules.py:get_groundshaker_rules
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Groundshaker fight
   */
  get_groundshaker_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const airComboCount = snapshot?.inventory?.['Air Combo Plus'] || 0;
    const hasBerserkCharge = snapshot?.inventory?.['Berserk Charge'] > 0;
    const hasCure = snapshot?.inventory?.['Cure Element'] > 0;
    const hasReflect = snapshot?.inventory?.['Reflect Element'] > 0;

    if (fightLogic === 0) { // easy: Air Combo Plus (2) AND Berserk Charge AND Cure AND Reflect
      return airComboCount >= 2 &&
        helperFunctions.kh2_has_all(snapshot, staticData, ['Berserk Charge', 'Cure Element', 'Reflect Element']);
    } else if (fightLogic === 1) { // normal: Berserk Charge AND Reflect AND Cure
      return helperFunctions.kh2_has_all(snapshot, staticData, ['Berserk Charge', 'Reflect Element', 'Cure Element']);
    } else { // hard: (Berserk Charge OR Air Combo Plus (2)) AND Reflect
      return (hasBerserkCharge || airComboCount >= 2) && hasReflect;
    }
  },

  /**
   * Check if Xaldin fight is accessible.
   * Based on worlds/kh2/Rules.py:get_xaldin_rules
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Xaldin fight
   */
  get_xaldin_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const aerialMove = ['Aerial Dive', 'Aerial Spiral', 'Horizontal Slash', 'Aerial Sweep', 'Aerial Finish'];
    const hasGuard = snapshot?.inventory?.['Guard'] > 0;
    const aerialMoveCount = helperFunctions.kh2_list_count_sum(aerialMove, snapshot);

    if (fightLogic === 0) { // easy: Guard AND (Valor/Master/Final) AND 2+ aerial moves
      const forms = ['Valor Form', 'Master Form', 'Final Form'];
      const hasGuardAndForms = helperFunctions.kh2_list_any_sum(
        [['Guard'], forms],
        snapshot
      ) >= 2;
      return hasGuardAndForms && aerialMoveCount >= 2;
    } else if (fightLogic === 1) { // normal: Guard AND 1+ aerial move
      const hasAerialMove = helperFunctions.kh2_list_any_sum([aerialMove], snapshot) >= 1;
      return hasGuard && hasAerialMove;
    } else { // hard: Guard only
      return hasGuard;
    }
  },

  /**
   * Check if Data Xaldin fight is accessible.
   * Based on worlds/kh2/Rules.py:805-814
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Data Xaldin fight
   */
  get_data_xaldin_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    if (fightLogic === 0) { // easy
      return helperFunctions.kh2_dict_count(EASY_DATA_XALDIN, snapshot) &&
             helperFunctions.form_list_unlock(snapshot, staticData, 'Final Form', 5, true);
    } else if (fightLogic === 1) { // normal
      return helperFunctions.kh2_dict_count(NORMAL_DATA_XALDIN, snapshot) &&
             helperFunctions.form_list_unlock(snapshot, staticData, 'Final Form', 5, true);
    } else { // hard
      return helperFunctions.kh2_dict_count(HARD_DATA_XALDIN, snapshot) &&
             helperFunctions.form_list_unlock(snapshot, staticData, 'Final Form', 3, true) &&
             helperFunctions.kh2_has_any(snapshot, staticData, PARTY_LIMIT);
    }
  },

  /**
   * Check if Data Axel fight is accessible.
   * Based on worlds/kh2/Rules.py:1074-1083
   *
   * Note: Limit level 5 requires form_list_unlock(LimitForm, 3) (from worlds/kh2/Rules.py:332)
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Data Axel fight
   */
  get_data_axel_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    // Limit level 5 requirement: form_list_unlock(Limit Form, 3)
    const canReachLimitLvl5 = helperFunctions.form_list_unlock(snapshot, staticData, 'Limit Form', 3, false);

    if (fightLogic === 0) { // easy
      return helperFunctions.kh2_dict_count(EASY_DATA_AXEL, snapshot) &&
             canReachLimitLvl5 &&
             helperFunctions.kh2_list_any_sum([DONALD_LIMIT], snapshot) >= 1;
    } else if (fightLogic === 1) { // normal
      return helperFunctions.kh2_dict_count(NORMAL_DATA_AXEL, snapshot) &&
             canReachLimitLvl5 &&
             helperFunctions.kh2_list_any_sum([DONALD_LIMIT, GAP_CLOSER], snapshot) >= 2;
    } else { // hard
      return helperFunctions.kh2_dict_count(HARD_DATA_AXEL, snapshot) &&
             helperFunctions.kh2_list_any_sum([GAP_CLOSER, GROUND_FINISHER], snapshot) >= 2;
    }
  },

  /**
   * Check if MCP (Master Control Program) fight is accessible.
   * Based on worlds/kh2/Rules.py:get_mcp_rules
   * Same requirements as Hostile Program
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access MCP fight
   */
  get_mcp_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const donaldLimit = ['Donald Fantasia', 'Donald Flare Force'];
    const formList = ['Valor Form', 'Wisdom Form', 'Limit Form', 'Master Form', 'Final Form'];
    const summons = ['Chicken Little', 'Stitch', 'Genie', 'Peter Pan'];
    const reflectElement = ['Reflect Element'];

    const categoriesAvailable = helperFunctions.kh2_list_any_sum(
      [donaldLimit, formList, summons, reflectElement],
      snapshot
    );

    if (fightLogic === 0) return categoriesAvailable >= 4; // easy
    if (fightLogic === 1) return categoriesAvailable >= 3; // normal
    return categoriesAvailable >= 2; // hard
  },

  /**
   * Check if Titan Cup is accessible.
   * Based on worlds/kh2/Rules.py:get_titan_cup_rules
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Titan Cup
   */
  get_titan_cup_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const summons = ['Chicken Little', 'Stitch', 'Genie', 'Peter Pan'];
    const summonsCount = helperFunctions.kh2_list_count_sum(summons, snapshot);
    const reflectCount = snapshot?.inventory?.['Reflect Element'] || 0;

    // Check basic requirements based on fight logic
    let basicRequirements = false;
    if (fightLogic === 0) { // easy: 4 summons + Reflera (2)
      basicRequirements = summonsCount >= 4 && reflectCount >= 2;
    } else if (fightLogic === 1) { // normal: 3 summons + Reflera (2)
      basicRequirements = summonsCount >= 3 && reflectCount >= 2;
    } else { // hard: 2 summons + Reflera (2)
      basicRequirements = summonsCount >= 2 && reflectCount >= 2;
    }

    // Also requires Hades Event OR Hades Cup Trophy
    const hasHadesAccess = (snapshot?.inventory?.['Hades Event'] > 0) ||
                          (snapshot?.inventory?.['Hades Cup Trophy'] > 0);

    return basicRequirements && hasHadesAccess;
  },

  /**
   * Check if Genie Jafar fight is accessible.
   * Based on worlds/kh2/Rules.py:get_genie_jafar_rules
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Genie Jafar fight
   */
  get_genie_jafar_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const defensiveTool = ['Reflect Element', 'Guard'];
    const blackMagic = ['Fire Element', 'Blizzard Element', 'Thunder Element'];
    const groundFinisher = ['Guard Break', 'Explosion', 'Finishing Leap'];

    if (fightLogic === 0) { // easy: defensive tool + black magic + ground finisher + Finishing Plus (4 categories)
      return helperFunctions.kh2_list_any_sum([defensiveTool, blackMagic, groundFinisher, ['Finishing Plus']], snapshot) >= 4;
    } else if (fightLogic === 1) { // normal: defensive tool + ground finisher + Finishing Plus (3 categories)
      return helperFunctions.kh2_list_any_sum([defensiveTool, groundFinisher, ['Finishing Plus']], snapshot) >= 3;
    } else { // hard: defensive tool + Finishing Plus (2 categories)
      return helperFunctions.kh2_list_any_sum([defensiveTool, ['Finishing Plus']], snapshot) >= 2;
    }
  },

  /**
   * Check if Roxas fight is accessible.
   * Based on worlds/kh2/Rules.py:get_roxas_rules
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Roxas fight
   */
  get_roxas_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const easyRoxasTools = {
      'Aerial Dodge': 1,
      'Glide': 1,
      'Limit Form': 1,
      'Thunder Element': 1,
      'Reflect Element': 2,
      'Guard Break': 1,
      'Slide Dash': 1,
      'Flash Step': 1,
      'Finishing Plus': 1,
      'Blizzard Element': 1
    };

    const normalRoxasTools = {
      'Thunder Element': 1,
      'Reflect Element': 2,
      'Guard Break': 1,
      'Slide Dash': 1,
      'Flash Step': 1,
      'Finishing Plus': 1,
      'Blizzard Element': 1
    };

    if (fightLogic === 0) { // easy
      return helperFunctions.kh2_dict_count(easyRoxasTools, snapshot);
    } else if (fightLogic === 1) { // normal
      return helperFunctions.kh2_dict_count(normalRoxasTools, snapshot);
    } else { // hard
      return (snapshot?.inventory?.['Guard'] || 0) > 0;
    }
  },

  /**
   * Check if Xigbar fight is accessible.
   * Based on worlds/kh2/Rules.py:get_xigbar_rules
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Xigbar fight
   */
  get_xigbar_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const easyXigbarTools = {
      'Horizontal Slash': 1,
      'Fire Element': 2,
      'Finishing Plus': 1,
      'Glide': 2,
      'Aerial Dodge': 2,
      'Quick Run': 2,
      'Reflect Element': 1,
      'Guard': 1
    };

    const normalXigbarTools = {
      'Fire Element': 2,
      'Finishing Plus': 1,
      'Glide': 2,
      'Aerial Dodge': 2,
      'Quick Run': 2,
      'Reflect Element': 1,
      'Guard': 1
    };

    if (fightLogic === 0) { // easy: tools + Final Form level 1 + (Light & Darkness OR Final Form)
      const hasTools = helperFunctions.kh2_dict_count(easyXigbarTools, snapshot);
      const finalFormLevel = helperFunctions.form_list_unlock(snapshot, staticData, 'Final Form', 1);
      const hasLightOrFinal = (snapshot?.inventory?.['Light & Darkness'] || 0) > 0 ||
                             (snapshot?.inventory?.['Final Form'] || 0) > 0;
      return hasTools && finalFormLevel && hasLightOrFinal;
    } else if (fightLogic === 1) { // normal: tools + Final Form level 1
      const hasTools = helperFunctions.kh2_dict_count(normalXigbarTools, snapshot);
      const finalFormLevel = helperFunctions.form_list_unlock(snapshot, staticData, 'Final Form', 1);
      return hasTools && finalFormLevel;
    } else { // hard: Guard + Quick Run + Finishing Plus
      return helperFunctions.kh2_has_all(snapshot, staticData, ['Guard', 'Quick Run', 'Finishing Plus']);
    }
  },

  /**
   * Check if Luxord fight is accessible.
   * Based on worlds/kh2/Rules.py:get_luxord_rules
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Luxord fight
   */
  get_luxord_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const easyLuxordTools = {
      'Aerial Dodge': 1,
      'Glide': 1,
      'Quick Run': 2,
      'Guard': 1,
      'Reflect Element': 2,
      'Slide Dash': 1,
      'Flash Step': 1,
      'Limit Form': 1
    };

    const normalLuxordTools = {
      'Aerial Dodge': 1,
      'Glide': 1,
      'Quick Run': 2,
      'Guard': 1,
      'Reflect Element': 2
    };

    const groundFinisher = ['Guard Break', 'Explosion', 'Finishing Leap'];
    const gapCloser = ['Slide Dash', 'Flash Step'];

    if (fightLogic === 0) { // easy: tools + any ground finisher
      const hasTools = helperFunctions.kh2_dict_count(easyLuxordTools, snapshot);
      const hasGroundFinisher = helperFunctions.kh2_has_any(snapshot, staticData, groundFinisher);
      return hasTools && hasGroundFinisher;
    } else if (fightLogic === 1) { // normal: tools + (gap closer OR ground finisher) >= 2
      const hasTools = helperFunctions.kh2_dict_count(normalLuxordTools, snapshot);
      const count = helperFunctions.kh2_list_any_sum([gapCloser, groundFinisher], snapshot);
      return hasTools && count >= 2;
    } else { // hard: Guard + Quick Run
      return helperFunctions.kh2_has_all(snapshot, staticData, ['Guard', 'Quick Run']);
    }
  },

  /**
   * Check if Saix fight is accessible.
   * Based on worlds/kh2/Rules.py:get_saix_rules
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Saix fight
   */
  get_saix_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const easySaixTools = {
      'Aerial Dodge': 1,
      'Glide': 1,
      'Quick Run': 2,
      'Guard': 1,
      'Reflect Element': 2,
      'Slide Dash': 1,
      'Flash Step': 1,
      'Limit Form': 1
    };

    const normalSaixTools = {
      'Aerial Dodge': 1,
      'Glide': 1,
      'Quick Run': 2,
      'Guard': 1,
      'Reflect Element': 2
    };

    const groundFinisher = ['Guard Break', 'Explosion', 'Finishing Leap'];
    const gapCloser = ['Slide Dash', 'Flash Step'];

    if (fightLogic === 0) { // easy: tools + any ground finisher
      const hasTools = helperFunctions.kh2_dict_count(easySaixTools, snapshot);
      const hasGroundFinisher = helperFunctions.kh2_has_any(snapshot, staticData, groundFinisher);
      return hasTools && hasGroundFinisher;
    } else if (fightLogic === 1) { // normal: tools + (gap closer OR ground finisher) >= 2
      const hasTools = helperFunctions.kh2_dict_count(normalSaixTools, snapshot);
      const count = helperFunctions.kh2_list_any_sum([gapCloser, groundFinisher], snapshot);
      return hasTools && count >= 2;
    } else { // hard: Guard
      return (snapshot?.inventory?.['Guard'] || 0) > 0;
    }
  },

  /**
   * Check if Data Lexaeus fight is accessible.
   * Based on worlds/kh2/Rules.py:get_data_lexaeus_rules
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Data Lexaeus fight
   */
  get_data_lexaeus_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const easyDataLexTools = {
      'Guard': 1,
      'Fire Element': 3,
      'Reflect Element': 2,
      'Slide Dash': 1,
      'Flash Step': 1
    };

    const normalDataLexTools = {
      'Guard': 1,
      'Fire Element': 3,
      'Reflect Element': 1
    };

    const donaldLimit = ['Donald Fantasia', 'Donald Flare Force'];
    const gapCloser = ['Slide Dash', 'Flash Step'];
    const defensiveTool = ['Reflect Element', 'Guard'];

    if (fightLogic === 0) { // easy: tools + Final Form 5+ + donald limit
      const hasTools = helperFunctions.kh2_dict_count(easyDataLexTools, snapshot);
      const finalFormLevel = helperFunctions.form_list_unlock(snapshot, staticData, 'Final Form', 5);
      const hasDonaldLimit = helperFunctions.kh2_list_any_sum([donaldLimit], snapshot) >= 1;
      return hasTools && finalFormLevel && hasDonaldLimit;
    } else if (fightLogic === 1) { // normal: tools + Final Form 3+ + (donald limit OR gap closer) >= 2
      const hasTools = helperFunctions.kh2_dict_count(normalDataLexTools, snapshot);
      const finalFormLevel = helperFunctions.form_list_unlock(snapshot, staticData, 'Final Form', 3);
      const count = helperFunctions.kh2_list_any_sum([donaldLimit, gapCloser], snapshot);
      return hasTools && finalFormLevel && count >= 2;
    } else { // hard: (defensive tool OR gap closer) >= 2
      return helperFunctions.kh2_list_any_sum([defensiveTool, gapCloser], snapshot) >= 2;
    }
  },

  /**
   * Check if Data Marluxia fight is accessible.
   * Based on worlds/kh2/Rules.py:get_data_marluxia_rules
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Data Marluxia fight
   */
  get_data_marluxia_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const easyDataMarluxiaTools = {
      'Guard': 1,
      'Fire Element': 3,
      'Reflect Element': 2,
      'Slide Dash': 1,
      'Flash Step': 1,
      'Aerial Recovery': 1
    };

    const normalDataMarluxiaTools = {
      'Guard': 1,
      'Fire Element': 3,
      'Reflect Element': 1,
      'Aerial Recovery': 1
    };

    const donaldLimit = ['Donald Fantasia', 'Donald Flare Force'];
    const gapCloser = ['Slide Dash', 'Flash Step'];
    const defensiveTool = ['Reflect Element', 'Guard'];

    if (fightLogic === 0) { // easy: tools + Final Form 5+ + donald limit
      const hasTools = helperFunctions.kh2_dict_count(easyDataMarluxiaTools, snapshot);
      const finalFormLevel = helperFunctions.form_list_unlock(snapshot, staticData, 'Final Form', 5);
      const hasDonaldLimit = helperFunctions.kh2_list_any_sum([donaldLimit], snapshot) >= 1;
      return hasTools && finalFormLevel && hasDonaldLimit;
    } else if (fightLogic === 1) { // normal: tools + Final Form 3+ + (donald limit OR gap closer) >= 2
      const hasTools = helperFunctions.kh2_dict_count(normalDataMarluxiaTools, snapshot);
      const finalFormLevel = helperFunctions.form_list_unlock(snapshot, staticData, 'Final Form', 3);
      const count = helperFunctions.kh2_list_any_sum([donaldLimit, gapCloser], snapshot);
      return hasTools && finalFormLevel && count >= 2;
    } else { // hard: (defensive tool OR gap closer OR Aerial Recovery) >= 3
      return helperFunctions.kh2_list_any_sum([defensiveTool, gapCloser, ['Aerial Recovery']], snapshot) >= 3;
    }
  },

  /**
   * Check if Cerberus Cup is accessible.
   * Based on worlds/kh2/Rules.py:get_cerberus_cup_rules
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Cerberus Cup
   */
  get_cerberus_cup_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const forms = ['Valor Form', 'Wisdom Form', 'Limit Form', 'Master Form', 'Final Form'];

    let hasFormLevel = false;
    if (fightLogic === 0) { // easy: any form level 5 (requires 3 forms total)
      hasFormLevel = forms.some(form =>
        helperFunctions.form_list_unlock(snapshot, staticData, form, 3, true)
      );
    } else if (fightLogic === 1) { // normal: any form level 4 (requires 2 forms total)
      hasFormLevel = forms.some(form =>
        helperFunctions.form_list_unlock(snapshot, staticData, form, 2, true)
      );
    } // hard: no form requirement

    const hasReflect = (snapshot?.inventory?.['Reflect Element'] || 0) > 0;

    // Also requires (Scar Event + Oogie Boogie Event + Twin Lords Event) OR Hades Cup Trophy
    const hasEvents = (snapshot?.inventory?.['Scar Event'] || 0) > 0 &&
                     (snapshot?.inventory?.['Oogie Boogie Event'] || 0) > 0 &&
                     (snapshot?.inventory?.['Twin Lords Event'] || 0) > 0;
    const hasHadesCup = (snapshot?.inventory?.['Hades Cup Trophy'] || 0) > 0;

    if (fightLogic === 2) { // hard: just Reflect + events/hades cup
      return hasReflect && (hasEvents || hasHadesCup);
    } else {
      return hasFormLevel && hasReflect && (hasEvents || hasHadesCup);
    }
  },

  /**
   * Check if Pain and Panic Cup is accessible.
   * Based on worlds/kh2/Rules.py:get_pain_and_panic_cup_rules
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Pain and Panic Cup
   */
  get_pain_and_panic_cup_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const partyLimit = ['Donald Fantasia', 'Donald Flare Force', 'Teamwork', 'Tornado Fusion'];
    const partyLimitCount = helperFunctions.kh2_list_count_sum(partyLimit, snapshot);
    const hasReflect = (snapshot?.inventory?.['Reflect Element'] || 0) > 0;

    let basicRequirements = false;
    if (fightLogic === 0) { // easy: 2 party limits + Reflect
      basicRequirements = partyLimitCount >= 2 && hasReflect;
    } else if (fightLogic === 1) { // normal: 1 party limit + Reflect
      basicRequirements = partyLimitCount >= 1 && hasReflect;
    } else { // hard: just Reflect
      basicRequirements = hasReflect;
    }

    // Also requires Future Pete Event OR Hades Cup Trophy
    const hasFuturePete = (snapshot?.inventory?.['Future Pete Event'] || 0) > 0;
    const hasHadesCup = (snapshot?.inventory?.['Hades Cup Trophy'] || 0) > 0;

    return basicRequirements && (hasFuturePete || hasHadesCup);
  },

  /**
   * Check if Goddess of Fate Cup is accessible.
   * Based on worlds/kh2/Rules.py:get_goddess_of_fate_cup_rules
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Goddess of Fate Cup
   */
  get_goddess_of_fate_cup_rules(snapshot, staticData) {
    // Requires all three cup events
    const hasP_and_P = (snapshot?.inventory?.['Pain and Panic Cup Event'] || 0) > 0;
    const hasCerberus = (snapshot?.inventory?.['Cerberus Cup Event'] || 0) > 0;
    const hasTitan = (snapshot?.inventory?.['Titan Cup Event'] || 0) > 0;

    return hasP_and_P && hasCerberus && hasTitan;
  },

  /**
   * Check if Hades Cup is accessible.
   * Based on worlds/kh2/Rules.py:get_hades_cup_rules
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Hades Cup
   */
  get_hades_cup_rules(snapshot, staticData) {
    // Requires Goddess of Fate Cup Event
    return (snapshot?.inventory?.['Goddess of Fate Cup Event'] || 0) > 0;
  },

  /**
   * Check if Thousand Heartless fight is accessible.
   * Based on worlds/kh2/Rules.py:get_thousand_heartless_rules
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Thousand Heartless fight
   */
  get_thousand_heartless_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const easyThousandHeartlessTools = {
      'Second Chance': 1,
      'Once More': 1,
      'Guard': 1,
      'Magnet Element': 2
    };

    const normalThousandHeartlessTools = {
      'Limit Form': 1,
      'Guard': 1
    };

    if (fightLogic === 0) { // easy
      return helperFunctions.kh2_dict_count(easyThousandHeartlessTools, snapshot);
    } else if (fightLogic === 1) { // normal
      return helperFunctions.kh2_dict_count(normalThousandHeartlessTools, snapshot);
    } else { // hard
      return (snapshot?.inventory?.['Guard'] || 0) > 0;
    }
  },

  /**
   * Check if Data Roxas fight is accessible.
   * Based on worlds/kh2/Rules.py:get_data_roxas_rules
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Data Roxas fight
   */
  get_data_roxas_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const easyDataRoxasTools = {
      'Guard': 1,
      'Reflect Element': 3,
      'Slide Dash': 1,
      'Flash Step': 1,
      'Guard Break': 1,
      'Explosion': 1,
      'Dodge Roll': 3,
      'Finishing Plus': 1,
      'Second Chance': 1,
      'Once More': 1
    };

    const normalDataRoxasTools = {
      'Guard': 1,
      'Reflect Element': 2,
      'Slide Dash': 1,
      'Flash Step': 1,
      'Guard Break': 1,
      'Explosion': 1,
      'Dodge Roll': 3,
      'Finishing Plus': 1
    };

    const hardDataRoxasTools = {
      'Guard': 1,
      'Reflect Element': 1,
      'Dodge Roll': 2,
      'Finishing Plus': 1
    };

    const donaldLimit = ['Donald Fantasia', 'Donald Flare Force'];
    const gapCloser = ['Slide Dash', 'Flash Step'];
    const groundFinisher = ['Guard Break', 'Explosion', 'Finishing Leap'];

    // Check if player can reach Limit Form Level 5 location
    // The location requires form_list_unlock("Limit Form", 3), which means Limit Form level 3 (4 total forms)
    const canReachLimitLvl5 = helperFunctions.form_list_unlock(snapshot, staticData, 'Limit Form', 3);

    if (fightLogic === 0) { // easy
      const hasTools = helperFunctions.kh2_dict_count(easyDataRoxasTools, snapshot);
      const hasDonaldLimit = helperFunctions.kh2_list_any_sum([donaldLimit], snapshot) >= 1;
      return hasTools && canReachLimitLvl5 && hasDonaldLimit;
    } else if (fightLogic === 1) { // normal
      const hasTools = helperFunctions.kh2_dict_count(normalDataRoxasTools, snapshot);
      const count = helperFunctions.kh2_list_any_sum([donaldLimit, gapCloser], snapshot);
      return hasTools && canReachLimitLvl5 && count >= 2;
    } else { // hard
      const hasTools = helperFunctions.kh2_dict_count(hardDataRoxasTools, snapshot);
      const count = helperFunctions.kh2_list_any_sum([gapCloser, groundFinisher], snapshot);
      return hasTools && count >= 2;
    }
  },

  /**
   * Check if Data Demyx fight is accessible.
   * Based on worlds/kh2/Rules.py:get_data_demyx_rules
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Data Demyx fight
   */
  get_data_demyx_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const easyDataDemyxTools = {
      'Form Boost': 1,
      'Reflect Element': 2,
      'Fire Element': 3,
      'Donald Flare Force': 1,
      'Guard': 1,
      'Second Chance': 1,
      'Once More': 1,
      'Finishing Plus': 1
    };

    const normalDataDemyxTools = {
      'Reflect Element': 2,
      'Fire Element': 3,
      'Donald Flare Force': 1,
      'Guard': 1,
      'Finishing Plus': 1
    };

    const hardDataDemyxTools = {
      'Reflect Element': 1,
      'Fire Element': 2,
      'Donald Flare Force': 1,
      'Guard': 1,
      'Finishing Plus': 1
    };

    if (fightLogic === 0) { // easy: tools + Wisdom Form level 5 (6 total forms)
      const hasTools = helperFunctions.kh2_dict_count(easyDataDemyxTools, snapshot);
      const hasWisdomLevel = helperFunctions.form_list_unlock(snapshot, staticData, 'Wisdom Form', 5, true);
      return hasTools && hasWisdomLevel;
    } else if (fightLogic === 1) { // normal: tools + Wisdom Form level 5 (6 total forms)
      const hasTools = helperFunctions.kh2_dict_count(normalDataDemyxTools, snapshot);
      const hasWisdomLevel = helperFunctions.form_list_unlock(snapshot, staticData, 'Wisdom Form', 5, true);
      return hasTools && hasWisdomLevel;
    } else { // hard: tools + Wisdom Form level 4 (5 total forms)
      const hasTools = helperFunctions.kh2_dict_count(hardDataDemyxTools, snapshot);
      const hasWisdomLevel = helperFunctions.form_list_unlock(snapshot, staticData, 'Wisdom Form', 4, true);
      return hasTools && hasWisdomLevel;
    }
  },

  /**
   * Check if Sephiroth fight is accessible.
   * Based on worlds/kh2/Rules.py:get_sephiroth_rules
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Sephiroth fight
   */
  get_sephiroth_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const easySephirothTools = {
      'Guard': 1,
      'Reflect Element': 3,
      'Slide Dash': 1,
      'Flash Step': 1,
      'Guard Break': 1,
      'Explosion': 1,
      'Dodge Roll': 3,
      'Finishing Plus': 1,
      'Second Chance': 1,
      'Once More': 1
    };

    const normalSephirothTools = {
      'Guard': 1,
      'Reflect Element': 2,
      'Slide Dash': 1,
      'Flash Step': 1,
      'Guard Break': 1,
      'Explosion': 1,
      'Dodge Roll': 3,
      'Finishing Plus': 1
    };

    const hardSephirothTools = {
      'Guard': 1,
      'Reflect Element': 1,
      'Dodge Roll': 2,
      'Finishing Plus': 1
    };

    const gapCloser = ['Slide Dash', 'Flash Step'];
    const groundFinisher = ['Guard Break', 'Explosion', 'Finishing Leap'];

    // Check if player can reach Limit Form Level 5 location
    // The location requires form_list_unlock("Limit Form", 3), which means Limit Form level 3 (4 total forms)
    const canReachLimitLvl5 = helperFunctions.form_list_unlock(snapshot, staticData, 'Limit Form', 3);

    if (fightLogic === 0) { // easy: tools + can reach Limit Form Level 5
      const hasTools = helperFunctions.kh2_dict_count(easySephirothTools, snapshot);
      return hasTools && canReachLimitLvl5;
    } else if (fightLogic === 1) { // normal: tools + can reach Limit Form Level 5 + has gap closer
      const hasTools = helperFunctions.kh2_dict_count(normalSephirothTools, snapshot);
      const hasGapCloser = helperFunctions.kh2_list_any_sum([gapCloser], snapshot) >= 1;
      return hasTools && canReachLimitLvl5 && hasGapCloser;
    } else { // hard: tools + has at least 2 of (gap closer or ground finisher)
      const hasTools = helperFunctions.kh2_dict_count(hardSephirothTools, snapshot);
      const count = helperFunctions.kh2_list_any_sum([gapCloser, groundFinisher], snapshot);
      return hasTools && count >= 2;
    }
  },

  /**
   * Check if Grim Reaper 1 fight is accessible.
   * Based on worlds/kh2/Rules.py:646-648
   * This is a free fight with no requirements.
   *
   * @returns {boolean} Always returns true
   */
  get_grim_reaper1_rules() {
    return true;
  },

  /**
   * Check if Grim Reaper 2 fight is accessible.
   * Based on worlds/kh2/Rules.py:650-659
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Grim Reaper 2 fight
   */
  get_grim_reaper2_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const defensiveTool = ['Reflect Element', 'Guard'];
    const blackMagic = ['Fire Element', 'Blizzard Element', 'Thunder Element'];

    if (fightLogic === 0) { // easy: master form + thunder + defensive option (2 of 2)
      return helperFunctions.kh2_list_any_sum([defensiveTool, ['Master Form', 'Thunder Element']], snapshot) >= 2;
    } else if (fightLogic === 1) { // normal: (master form OR stitch) + thunder + defensive option (3 of 3)
      return helperFunctions.kh2_list_any_sum([defensiveTool, ['Master Form', 'Stitch'], ['Thunder Element']], snapshot) >= 3;
    } else { // hard: any black magic + defensive option (2 of 2)
      return helperFunctions.kh2_list_any_sum([blackMagic, defensiveTool], snapshot) >= 2;
    }
  },

  /**
   * Check if Data Luxord fight is accessible.
   * Based on worlds/kh2/Rules.py:661-674
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Data Luxord fight
   */
  get_data_luxord_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const easyDataLuxordTools = {
      'Slide Dash': 1,
      'Flash Step': 1,
      'Aerial Dodge': 2,
      'Glide': 2,
      'Reflect Element': 3,
      'Guard': 1
    };

    const defensiveTool = ['Reflect Element', 'Guard'];

    if (fightLogic === 0) { // easy: gap closers + reflega + aerial dodge 2 + glide 2 + guard
      return helperFunctions.kh2_dict_count(easyDataLuxordTools, snapshot);
    } else if (fightLogic === 1) { // normal: 1 gap closer + reflect + aerial dodge 1 + glide 1 + guard
      const hasRequired = helperFunctions.kh2_has_all(snapshot, staticData, ['Reflect Element', 'Aerial Dodge', 'Glide', 'Guard']);
      const hasDefensive = helperFunctions.kh2_has_any(snapshot, staticData, defensiveTool);
      return hasRequired && hasDefensive;
    } else { // hard: quick run OR defensive option
      return (snapshot?.inventory?.['Quick Run'] > 0) || helperFunctions.kh2_has_any(snapshot, staticData, defensiveTool);
    }
  },

  /**
   * Check if Xemnas fight is accessible.
   * Based on worlds/kh2/Rules.py:1130-1140
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Xemnas fight
   */
  get_xemnas_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const gapCloser = ['Slide Dash', 'Flash Step'];
    const groundFinisher = ['Guard Break', 'Explosion', 'Finishing Leap'];

    const easyXemnasTools = {
      'Aerial Dodge': 1,
      'Glide': 1,
      'Quick Run': 2,
      'Guard': 1,
      'Reflect Element': 2,
      'Slide Dash': 1,
      'Flash Step': 1,
      'Limit Form': 1
    };

    const normalXemnasTools = {
      'Aerial Dodge': 1,
      'Glide': 1,
      'Quick Run': 2,
      'Guard': 1,
      'Reflect Element': 2
    };

    if (fightLogic === 0) { // easy
      return helperFunctions.kh2_dict_count(easyXemnasTools, snapshot) &&
        helperFunctions.kh2_has_any(snapshot, staticData, groundFinisher);
    } else if (fightLogic === 1) { // normal
      return helperFunctions.kh2_dict_count(normalXemnasTools, snapshot) &&
        helperFunctions.kh2_list_any_sum([gapCloser, groundFinisher], snapshot) >= 2;
    } else { // hard
      return snapshot?.inventory?.['Guard'] > 0;
    }
  },

  /**
   * Check if Armored Xemnas (first fight) is accessible.
   * Based on worlds/kh2/Rules.py:1142-1151
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Armored Xemnas fight
   */
  get_armored_xemnas_one_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const donaldLimit = ['Donald Fantasia', 'Donald Flare Force'];
    const gapCloser = ['Slide Dash', 'Flash Step'];
    const groundFinisher = ['Guard Break', 'Explosion', 'Finishing Leap'];

    if (fightLogic === 0) { // easy: donald limit + reflect + gap closer + ground finisher
      return helperFunctions.kh2_list_any_sum([donaldLimit, gapCloser, groundFinisher, ['Reflect Element']], snapshot) >= 4;
    } else if (fightLogic === 1) { // normal: reflect + gap closer + ground finisher
      return helperFunctions.kh2_list_any_sum([gapCloser, groundFinisher, ['Reflect Element']], snapshot) >= 3;
    } else { // hard: reflect
      return snapshot?.inventory?.['Reflect Element'] > 0;
    }
  },

  /**
   * Check if Armored Xemnas 2 (second fight) is accessible.
   * Based on worlds/kh2/Rules.py:1153-1162
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Armored Xemnas 2 fight
   */
  get_armored_xemnas_two_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const gapCloser = ['Slide Dash', 'Flash Step'];
    const groundFinisher = ['Guard Break', 'Explosion', 'Finishing Leap'];

    if (fightLogic === 0) { // easy: gap closer + ground finisher + reflect + thunder
      return helperFunctions.kh2_list_any_sum([gapCloser, groundFinisher, ['Reflect Element'], ['Thunder Element']], snapshot) >= 4;
    } else if (fightLogic === 1) { // normal: gap closer + ground finisher + reflect
      return helperFunctions.kh2_list_any_sum([gapCloser, groundFinisher, ['Reflect Element']], snapshot) >= 3;
    } else { // hard: reflect
      return snapshot?.inventory?.['Reflect Element'] > 0;
    }
  },

  /**
   * Check if Final Xemnas fight is accessible.
   * Based on worlds/kh2/Rules.py:1164-1173
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Final Xemnas fight
   */
  get_final_xemnas_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const gapCloser = ['Slide Dash', 'Flash Step'];

    if (fightLogic === 0) { // easy: limit form + finishing plus + guard + reflera (2) + gap closer
      return helperFunctions.kh2_has_all(snapshot, staticData, ['Limit Form', 'Finishing Plus', 'Guard']) &&
        (snapshot?.inventory?.['Reflect Element'] || 0) >= 2 &&
        helperFunctions.kh2_has_any(snapshot, staticData, gapCloser);
    } else if (fightLogic === 1) { // normal: reflect + finishing plus + guard
      return helperFunctions.kh2_has_all(snapshot, staticData, ['Reflect Element', 'Finishing Plus', 'Guard']);
    } else { // hard: guard
      return snapshot?.inventory?.['Guard'] > 0;
    }
  },

  /**
   * Check if Data Xigbar fight is accessible.
   * Based on worlds/kh2/Rules.py:538-548
   */
  get_data_xigbar_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const donaldLimit = ['Donald Fantasia', 'Donald Flare Force'];
    const defensiveTool = ['Reflect Element', 'Guard'];

    const easyDataXigbarTools = {
      'Finishing Plus': 1,
      'Guard': 1,
      'Aerial Dive': 1,
      'Horizontal Slash': 1,
      'Air Combo Plus': 2,
      'Fire Element': 3,
      'Reflect Element': 3
    };

    const normalDataXigbarTools = {
      'Finishing Plus': 1,
      'Guard': 1,
      'Horizontal Slash': 1,
      'Fire Element': 3,
      'Reflect Element': 3
    };

    if (fightLogic === 0) { // easy
      return helperFunctions.kh2_dict_count(easyDataXigbarTools, snapshot) &&
        helperFunctions.form_list_unlock(snapshot, staticData, 'Final Form', 5, true) &&
        helperFunctions.kh2_has_any(snapshot, staticData, donaldLimit);
    } else if (fightLogic === 1) { // normal
      return helperFunctions.kh2_dict_count(normalDataXigbarTools, snapshot) &&
        helperFunctions.form_list_unlock(snapshot, staticData, 'Final Form', 5, true) &&
        helperFunctions.kh2_has_any(snapshot, staticData, donaldLimit);
    } else { // hard
      return ((helperFunctions.form_list_unlock(snapshot, staticData, 'Final Form', 3, true) &&
        (snapshot?.inventory?.['Fire Element'] || 0) >= 2) ||
        helperFunctions.kh2_has_any(snapshot, staticData, donaldLimit)) &&
        (snapshot?.inventory?.['Finishing Plus'] > 0) &&
        helperFunctions.kh2_has_any(snapshot, staticData, defensiveTool);
    }
  },

  /**
   * Check if Data Zexion fight is accessible.
   * Based on worlds/kh2/Rules.py:756-765
   */
  get_data_zexion_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const donaldLimit = ['Donald Fantasia', 'Donald Flare Force'];
    const gapCloser = ['Slide Dash', 'Flash Step'];

    const easyDataZexion = {
      'Fire Element': 3,
      'Second Chance': 1,
      'Once More': 1,
      'Donald Fantasia': 1,
      'Donald Flare Force': 1,
      'Reflect Element': 3,
      'Guard': 1,
      'Slide Dash': 1,
      'Flash Step': 1,
      'Quick Run': 3
    };

    const normalDataZexion = {
      'Fire Element': 3,
      'Reflect Element': 3,
      'Guard': 1,
      'Quick Run': 3
    };

    const hardDataZexion = {
      'Fire Element': 2,
      'Reflect Element': 1,
      'Quick Run': 2
    };

    if (fightLogic === 0) { // easy
      return helperFunctions.kh2_dict_count(easyDataZexion, snapshot) &&
        helperFunctions.form_list_unlock(snapshot, staticData, 'Final Form', 5, true);
    } else if (fightLogic === 1) { // normal
      return helperFunctions.kh2_dict_count(normalDataZexion, snapshot) &&
        helperFunctions.kh2_list_any_sum([donaldLimit, gapCloser], snapshot) >= 2 &&
        helperFunctions.form_list_unlock(snapshot, staticData, 'Final Form', 5, true);
    } else { // hard
      return helperFunctions.kh2_dict_count(hardDataZexion, snapshot) &&
        helperFunctions.kh2_list_any_sum([donaldLimit, gapCloser], snapshot) >= 2 &&
        helperFunctions.form_list_unlock(snapshot, staticData, 'Final Form', 3, true);
    }
  },

  /**
   * Check if Data Larxene fight is accessible.
   * Based on worlds/kh2/Rules.py:838-847
   */
  get_data_larxene_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const gapCloser = ['Slide Dash', 'Flash Step'];
    const groundFinisher = ['Guard Break', 'Explosion', 'Finishing Leap'];
    const donaldLimit = ['Donald Fantasia', 'Donald Flare Force'];

    const easyDataLarxene = {
      'Fire Element': 3,
      'Second Chance': 1,
      'Once More': 1,
      'Donald Fantasia': 1,
      'Donald Flare Force': 1,
      'Reflect Element': 3,
      'Guard': 1,
      'Slide Dash': 1,
      'Flash Step': 1,
      'Aerial Dodge': 3,
      'Glide': 3,
      'Guard Break': 1,
      'Explosion': 1
    };

    const normalDataLarxene = {
      'Fire Element': 3,
      'Reflect Element': 3,
      'Guard': 1,
      'Aerial Dodge': 3,
      'Glide': 3
    };

    const hardDataLarxene = {
      'Fire Element': 2,
      'Reflect Element': 1,
      'Guard': 1,
      'Aerial Dodge': 2,
      'Glide': 2
    };

    if (fightLogic === 0) { // easy
      return helperFunctions.kh2_dict_count(easyDataLarxene, snapshot) &&
        helperFunctions.form_list_unlock(snapshot, staticData, 'Final Form', 5, true);
    } else if (fightLogic === 1) { // normal
      return helperFunctions.kh2_dict_count(normalDataLarxene, snapshot) &&
        helperFunctions.kh2_list_any_sum([gapCloser, groundFinisher, donaldLimit], snapshot) >= 3 &&
        helperFunctions.form_list_unlock(snapshot, staticData, 'Final Form', 5, true);
    } else { // hard
      return helperFunctions.kh2_dict_count(hardDataLarxene, snapshot) &&
        helperFunctions.kh2_list_any_sum([gapCloser, donaldLimit], snapshot) >= 2 &&
        helperFunctions.form_list_unlock(snapshot, staticData, 'Final Form', 3, true);
    }
  },

  /**
   * Check if Data Vexen fight is accessible.
   * Based on worlds/kh2/Rules.py:876-885
   */
  get_data_vexen_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const gapCloser = ['Slide Dash', 'Flash Step'];
    const groundFinisher = ['Guard Break', 'Explosion', 'Finishing Leap'];
    const donaldLimit = ['Donald Fantasia', 'Donald Flare Force'];

    const easyDataVexen = {
      'Fire Element': 3,
      'Second Chance': 1,
      'Once More': 1,
      'Donald Fantasia': 1,
      'Donald Flare Force': 1,
      'Reflect Element': 3,
      'Guard': 1,
      'Slide Dash': 1,
      'Flash Step': 1,
      'Aerial Dodge': 3,
      'Glide': 3,
      'Guard Break': 1,
      'Explosion': 1,
      'Dodge Roll': 3,
      'Quick Run': 3
    };

    const normalDataVexen = {
      'Fire Element': 3,
      'Reflect Element': 3,
      'Guard': 1,
      'Aerial Dodge': 3,
      'Glide': 3,
      'Dodge Roll': 3,
      'Quick Run': 3
    };

    const hardDataVexen = {
      'Fire Element': 2,
      'Reflect Element': 1,
      'Guard': 1,
      'Aerial Dodge': 2,
      'Glide': 2,
      'Dodge Roll': 3,
      'Quick Run': 3
    };

    if (fightLogic === 0) { // easy
      return helperFunctions.kh2_dict_count(easyDataVexen, snapshot) &&
        helperFunctions.form_list_unlock(snapshot, staticData, 'Final Form', 5, true);
    } else if (fightLogic === 1) { // normal
      return helperFunctions.kh2_dict_count(normalDataVexen, snapshot) &&
        helperFunctions.kh2_list_any_sum([gapCloser, groundFinisher, donaldLimit], snapshot) >= 3 &&
        helperFunctions.form_list_unlock(snapshot, staticData, 'Final Form', 5, true);
    } else { // hard
      return helperFunctions.kh2_dict_count(hardDataVexen, snapshot) &&
        helperFunctions.kh2_list_any_sum([gapCloser, donaldLimit], snapshot) >= 2 &&
        helperFunctions.form_list_unlock(snapshot, staticData, 'Final Form', 3, true);
    }
  },

  /**
   * Check if Data Saix fight is accessible.
   * Based on worlds/kh2/Rules.py:1040-1049
   */
  get_data_saix_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const gapCloser = ['Slide Dash', 'Flash Step'];
    const groundFinisher = ['Guard Break', 'Explosion', 'Finishing Leap'];
    const donaldLimit = ['Donald Fantasia', 'Donald Flare Force'];

    const easyDataSaix = {
      'Guard': 1,
      'Slide Dash': 1,
      'Flash Step': 1,
      'Thunder Element': 1,
      'Blizzard Element': 1,
      'Donald Flare Force': 1,
      'Donald Fantasia': 1,
      'Fire Element': 3,
      'Reflect Element': 3,
      'Guard Break': 1,
      'Explosion': 1,
      'Aerial Dodge': 3,
      'Glide': 3,
      'Second Chance': 1,
      'Once More': 1
    };

    const normalDataSaix = {
      'Guard': 1,
      'Thunder Element': 1,
      'Blizzard Element': 1,
      'Fire Element': 3,
      'Reflect Element': 3,
      'Aerial Dodge': 3,
      'Glide': 3
    };

    const hardDataSaix = {
      'Guard': 1,
      'Blizzard Element': 1,
      'Reflect Element': 1,
      'Aerial Dodge': 3,
      'Glide': 3
    };

    if (fightLogic === 0) { // easy
      return helperFunctions.kh2_dict_count(easyDataSaix, snapshot) &&
        helperFunctions.form_list_unlock(snapshot, staticData, 'Final Form', 5, false);
    } else if (fightLogic === 1) { // normal
      return helperFunctions.kh2_dict_count(normalDataSaix, snapshot) &&
        helperFunctions.kh2_list_any_sum([gapCloser, groundFinisher, donaldLimit], snapshot) >= 3 &&
        helperFunctions.form_list_unlock(snapshot, staticData, 'Final Form', 5, false);
    } else { // hard
      return helperFunctions.kh2_dict_count(hardDataSaix, snapshot) &&
        helperFunctions.kh2_list_any_sum([gapCloser, groundFinisher], snapshot) >= 2;
    }
  },

  /**
   * Check if Data Xemnas fight is accessible.
   * Based on worlds/kh2/Rules.py:1174-1183
   */
  get_data_xemnas_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const gapCloser = ['Slide Dash', 'Flash Step'];
    const groundFinisher = ['Guard Break', 'Explosion', 'Finishing Leap'];

    const easyDataXemnas = {
      'Combo Master': 1,
      'Slapshot': 1,
      'Reflect Element': 3,
      'Slide Dash': 1,
      'Flash Step': 1,
      'Finishing Plus': 1,
      'Guard': 1,
      'Trinity Limit': 1,
      'Second Chance': 1,
      'Once More': 1,
      'Limit Form': 1
    };

    const normalDataXemnas = {
      'Combo Master': 1,
      'Slapshot': 1,
      'Reflect Element': 3,
      'Slide Dash': 1,
      'Flash Step': 1,
      'Finishing Plus': 1,
      'Guard': 1,
      'Limit Form': 1
    };

    const hardDataXemnas = {
      'Combo Master': 1,
      'Slapshot': 1,
      'Reflect Element': 2,
      'Finishing Plus': 1,
      'Guard': 1,
      'Limit Form': 1
    };

    if (fightLogic === 0) { // easy
      // Limit level 5 requires form_list_unlock('Limit Form', 3)
      // We inline this check to avoid circular dependency issues during reachability computation
      return helperFunctions.kh2_dict_count(easyDataXemnas, snapshot) &&
        helperFunctions.kh2_list_count_sum(groundFinisher, snapshot) >= 2 &&
        helperFunctions.form_list_unlock(snapshot, staticData, 'Limit Form', 3);
    } else if (fightLogic === 1) { // normal
      // Limit level 5 requires form_list_unlock('Limit Form', 3)
      // We inline this check to avoid circular dependency issues during reachability computation
      return helperFunctions.kh2_dict_count(normalDataXemnas, snapshot) &&
        helperFunctions.kh2_list_count_sum(groundFinisher, snapshot) >= 2 &&
        helperFunctions.form_list_unlock(snapshot, staticData, 'Limit Form', 3);
    } else { // hard
      return helperFunctions.kh2_dict_count(hardDataXemnas, snapshot) &&
        helperFunctions.kh2_list_any_sum([groundFinisher, gapCloser], snapshot) >= 2;
    }
  },

  /**
   * Check if Terra (Lingering Will) fight is accessible.
   * Based on worlds/kh2/Rules.py:1175-1183
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @returns {boolean} True if player can access Terra fight
   */
  get_terra_rules(snapshot, staticData) {
    const settings = staticData?.settings || {};
    const fightLogic = settings.FightLogic ?? 1; // Default: normal

    const gapCloser = ['Slide Dash', 'Flash Step'];
    const donaldLimit = ['Donald Fantasia', 'Donald Flare Force'];

    const easyTerraTools = {
      'Second Chance': 1,
      'Once More': 1,
      'Slide Dash': 1,
      'Flash Step': 1,
      'Explosion': 1,
      'Combo Plus': 2,
      'Fire Element': 3,
      'Donald Fantasia': 1,
      'Donald Flare Force': 1,
      'Reflect Element': 1,
      'Guard': 1,
      'Dodge Roll': 3,
      'Aerial Dodge': 3,
      'Glide': 3
    };

    const normalTerraTools = {
      'Slide Dash': 1,
      'Flash Step': 1,
      'Explosion': 1,
      'Combo Plus': 2,
      'Guard': 1,
      'Dodge Roll': 2,
      'Aerial Dodge': 2,
      'Glide': 2
    };

    const hardTerraTools = {
      'Explosion': 1,
      'Combo Plus': 2,
      'Dodge Roll': 2,
      'Aerial Dodge': 2,
      'Glide': 2,
      'Guard': 1
    };

    if (fightLogic === 0) { // easy
      return helperFunctions.kh2_dict_count(easyTerraTools, snapshot) &&
        helperFunctions.form_list_unlock(snapshot, staticData, 'Final Form', 5, true);
    } else if (fightLogic === 1) { // normal
      return helperFunctions.kh2_dict_count(normalTerraTools, snapshot) &&
        helperFunctions.kh2_list_any_sum([donaldLimit], snapshot) >= 1;
    } else { // hard
      return helperFunctions.kh2_dict_count(hardTerraTools, snapshot) &&
        helperFunctions.kh2_list_any_sum([gapCloser], snapshot) >= 1;
    }
  },

  /**
   * Utility: Sum up the count of all items in a list.
   * Based on worlds/kh2/Rules.py:93-100
   *
   * @param {Array<string>} itemList - Array of item names
   * @param {Object} snapshot - Game state snapshot
   * @returns {number} Total count of all items in the list
   */
  kh2_list_count_sum(itemList, snapshot) {
    return itemList.reduce((sum, itemName) =>
      sum + (snapshot?.inventory?.[itemName] || 0), 0);
  },

  /**
   * Utility: Check if player has any item from a list of item lists.
   * Based on worlds/kh2/Rules.py:101-108
   *
   * @param {Array<Array<string>>} listOfItemLists - Array of item name arrays
   * @param {Object} snapshot - Game state snapshot
   * @returns {number} Count of lists where player has at least one item
   */
  kh2_list_any_sum(listOfItemLists, snapshot) {
    let count = 0;
    for (const itemList of listOfItemLists) {
      if (itemList.some(item => snapshot?.inventory?.[item] > 0)) {
        count++;
      }
    }
    return count;
  },

  /**
   * Utility: Check if player has all required item counts from a dictionary.
   * Based on worlds/kh2/Rules.py:110-117
   *
   * @param {Object} itemNameToCount - Dictionary mapping item names to required counts
   * @param {Object} snapshot - Game state snapshot
   * @returns {boolean} True if player has all required counts
   */
  kh2_dict_count(itemNameToCount, snapshot) {
    for (const [itemName, requiredCount] of Object.entries(itemNameToCount)) {
      if ((snapshot?.inventory?.[itemName] || 0) < requiredCount) {
        return false;
      }
    }
    return true;
  },

  /**
   * Utility: Count how many items in dictionary meet their required count.
   * Based on worlds/kh2/Rules.py:119-126
   *
   * @param {Object} itemNameToCount - Dictionary mapping item names to required counts
   * @param {Object} snapshot - Game state snapshot
   * @returns {number} Count of items that meet their required count
   */
  kh2_dict_one_count(itemNameToCount, snapshot) {
    let count = 0;
    for (const [itemName, requiredCount] of Object.entries(itemNameToCount)) {
      if ((snapshot?.inventory?.[itemName] || 0) >= requiredCount) {
        count++;
      }
    }
    return count;
  },

  /**
   * Utility: Check if player has all items from a list.
   * Based on worlds/kh2/Rules.py:151-153
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @param {Array<string>} items - Array of item names
   * @returns {boolean} True if player has at least one of all items
   */
  kh2_has_all(snapshot, staticData, items) {
    return items.every(item => snapshot?.inventory?.[item] > 0);
  },

  /**
   * Utility: Check if player has any item from a list.
   * Based on worlds/kh2/Rules.py:155-156
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains settings)
   * @param {Array<string>} items - Array of item names
   * @returns {boolean} True if player has at least one item
   */
  kh2_has_any(snapshot, staticData, items) {
    return items.some(item => snapshot?.inventory?.[item] > 0);
  },

  /**
   * Utility: Check if a location can be reached.
   * Based on worlds/kh2/Rules.py:183-189
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data
   * @param {string} locationName - Name of the location to check
   * @returns {boolean} True if the location is reachable
   */
  kh2_can_reach(snapshot, staticData, locationName) {
    // Check if location is reachable or has been checked
    // locationReachability tracks: 'reachable', 'unreachable', or 'checked'
    const locationStatus = snapshot?.locationReachability?.[locationName];

    return locationStatus === 'reachable' || locationStatus === 'checked';
  }
};
