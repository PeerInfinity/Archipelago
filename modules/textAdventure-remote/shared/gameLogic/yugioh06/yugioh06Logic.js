/**
 * Thread-agnostic Yu-Gi-Oh! 2006 game logic functions
 * These pure functions operate on a canonical state object and return results
 * without modifying the state
 */

// Core booster pack items (from worlds/yugioh06/logic.py)
const CORE_BOOSTER = [
  "LEGEND OF B.E.W.D.",
  "METAL RAIDERS",
  "PHARAOH'S SERVANT",
  "PHARAONIC GUARDIAN",
  "SPELL RULER",
  "LABYRINTH OF NIGHTMARE",
  "LEGACY OF DARKNESS",
  "MAGICIAN'S FORCE",
  "DARK CRISIS",
  "INVASION OF CHAOS",
  "ANCIENT SANCTUARY",
  "SOUL OF THE DUELIST",
  "RISE OF DESTINY",
  "FLAMING ETERNITY",
  "THE LOST MILLENIUM",
  "CYBERNETIC REVOLUTION",
  "ELEMENTAL ENERGY",
  "SHADOW OF INFINITY",
];

// Fusion data (from worlds/yugioh06/fusions.py)
// Each fusion has: materials (list of required cards), replaceable (can use fusion subs), additionalSpells (alternative fusion methods)
const FUSIONS = {
  "Elemental Hero Flame Wingman": {
    materials: ["Elemental Hero Avian", "Elemental Hero Burstinatrix"],
    replaceable: true,
    additionalSpells: ["Miracle Fusion"]
  },
  "Elemental Hero Madballman": {
    materials: ["Elemental Hero Bubbleman", "Elemental Hero Clayman"],
    replaceable: true,
    additionalSpells: ["Miracle Fusion"]
  },
  "Elemental Hero Rampart Blaster": {
    materials: ["Elemental Hero Burstinatrix", "Elemental Hero Clayman"],
    replaceable: true,
    additionalSpells: ["Miracle Fusion"]
  },
  "Elemental Hero Shining Flare Wingman": {
    materials: ["Elemental Hero Flame Wingman", "Elemental Hero Sparkman"],
    replaceable: true,
    additionalSpells: ["Miracle Fusion"]
  },
  "Elemental Hero Steam Healer": {
    materials: ["Elemental Hero Burstinatrix", "Elemental Hero Bubbleman"],
    replaceable: true,
    additionalSpells: ["Miracle Fusion"]
  },
  "Elemental Hero Wildedge": {
    materials: ["Elemental Hero Wildheart", "Elemental Hero Bladedge"],
    replaceable: true,
    additionalSpells: ["Miracle Fusion"]
  }
};

// Fusion substitute monsters that can replace any fusion material
const FUSION_SUBS = [
  "The Dark - Hex-Sealed Fusion",
  "The Earth - Hex-Sealed Fusion",
  "The Light - Hex-Sealed Fusion",
  "Goddess with the Third Eye",
  "King of the Swamp",
  "Versago the Destroyer",
  // Only in All-packs
  "Beastking of the Swamps",
  "Mystical Sheep #1"
];

/**
 * Check if player has an item
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {string} itemName - Name of the item to check
 * @returns {boolean} True if player has the item
 */
export function has(snapshot, staticData, itemName) {
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

  return (snapshot.inventory[itemName] || 0) > 0;
}

/**
 * Count how many of an item the player has
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {string} itemName - Name of the item to count
 * @returns {number} Number of items
 */
export function count(snapshot, staticData, itemName) {
  // Check events first (events are binary - either 1 or 0)
  if (snapshot.events && snapshot.events.includes(itemName)) {
    return 1;
  }

  // Check flags
  if (snapshot.flags && snapshot.flags.includes(itemName)) {
    return 1;
  }

  // Check inventory
  if (!snapshot.inventory) return 0;
  return snapshot.inventory[itemName] || 0;
}

/**
 * Check if player has at least 'amount' different items from a list
 * Equivalent to Python's state.has_from_list(list, player, amount)
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {Array<string>} itemList - List of item names to check
 * @param {number} amount - Minimum number of different items required
 * @returns {boolean} True if player has at least 'amount' items from the list
 */
export function has_from_list(snapshot, staticData, itemList, amount) {
  let foundCount = 0;

  for (const itemName of itemList) {
    if (has(snapshot, staticData, itemName)) {
      foundCount++;
      if (foundCount >= amount) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if player has at least 'count' UNIQUE items from a list (ignores duplicates)
 * Equivalent to Python's state.has_from_list_unique(list, player, count)
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {Array<string>} itemList - List of item names to check
 * @param {number} amount - Minimum number of unique items required
 * @returns {boolean} True if player has at least 'amount' unique items from the list
 */
export function has_from_list_unique(snapshot, staticData, itemList, amount) {
  let foundCount = 0;

  for (const itemName of itemList) {
    // Check if the player has at least one of this item (count > 0)
    if (count(snapshot, staticData, itemName) > 0) {
      foundCount++;
      if (foundCount >= amount) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check difficulty requirement based on core booster packs owned
 * Equivalent to Python's yugioh06_difficulty(state, player, amount)
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {number} amount - Minimum number of core booster packs required
 * @returns {boolean} True if player has at least 'amount' core booster packs
 */
export function yugioh06_difficulty(snapshot, staticData, amount) {
  return has_from_list(snapshot, staticData, CORE_BOOSTER, amount);
}

/**
 * Helper to check if player has any item from a list
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {Array<string>} itemList - List of item names
 * @returns {boolean} True if player has at least one item from the list
 */
function has_any(snapshot, staticData, itemList) {
  for (const itemName of itemList) {
    if (has(snapshot, staticData, itemName)) {
      return true;
    }
  }
  return false;
}

/**
 * Helper to check if player has all items from a list
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {Array<string>} itemList - List of item names
 * @returns {boolean} True if player has all items from the list
 */
function has_all(snapshot, staticData, itemList) {
  for (const itemName of itemList) {
    if (!has(snapshot, staticData, itemName)) {
      return false;
    }
  }
  return true;
}

/**
 * Helper to count unique items from a list
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {Array<string>} itemList - List of item names
 * @returns {number} Number of unique items the player has
 */
function count_from_list_unique(snapshot, staticData, itemList) {
  let foundCount = 0;
  for (const itemName of itemList) {
    if (count(snapshot, staticData, itemName) > 0) {
      foundCount++;
    }
  }
  return foundCount;
}

// Custom helper functions from worlds/yugioh06/rules.py

export function only_light(snapshot, staticData) {
  return has_from_list_unique(snapshot, staticData, [
    "Dunames Dark Witch",
    "X-Head Cannon",
    "Homunculus the Alchemic Being",
    "Hysteric Fairy",
    "Ninja Grandmaster Sasuke"
  ], 2) &&
  has_from_list_unique(snapshot, staticData, [
    "Chaos Command Magician",
    "Cybernetic Magician",
    "Kaiser Glider",
    "The Agent of Judgment - Saturn",
    "Zaborg the Thunder Monarch",
    "Cyber Dragon"
  ], 1) &&
  has_from_list_unique(snapshot, staticData, [
    "D.D. Warrior Lady",
    "Mystic Swordsman LV2",
    "Y-Dragon Head",
    "Z-Metal Tank"
  ], 2) &&
  has(snapshot, staticData, "Shining Angel");
}

export function only_dark(snapshot, staticData) {
  return has_from_list_unique(snapshot, staticData, [
    "Dark Elf",
    "Archfiend Soldier",
    "Mad Dog of Darkness",
    "Vorse Raider",
    "Skilled Dark Magician",
    "Skull Descovery Knight",
    "Mechanicalchaser",
    "Dark Blade",
    "Gil Garth",
    "La Jinn the Mystical Genie of the Lamp",
    "Opticlops",
    "Zure, Knight of Dark World",
    "Brron, Mad King of Dark World",
    "D.D. Survivor",
    "Exarion Universe",
    "Kycoo the Ghost Destroyer",
    "Regenerating Mummy"
  ], 2) &&
  has_any(snapshot, staticData, [
    "Summoned Skull",
    "Skull Archfiend of Lightning",
    "The End of Anubis",
    "Dark Ruler Ha Des",
    "Beast of Talwar",
    "Inferno Hammer",
    "Jinzo",
    "Ryu Kokki"
  ]) &&
  has_from_list_unique(snapshot, staticData, [
    "Legendary Fiend",
    "Don Zaloog",
    "Newdoria",
    "Sangan",
    "Spirit Reaper",
    "Giant Germ"
  ], 2) &&
  has(snapshot, staticData, "Mystic Tomato");
}

export function only_earth(snapshot, staticData) {
  return has_from_list_unique(snapshot, staticData, [
    "Berserk Gorilla",
    "Gemini Elf",
    "Insect Knight",
    "Toon Gemini Elf",
    "Familiar-Possessed - Aussa",
    "Neo Bug",
    "Blindly Loyal Goblin",
    "Chiron the Mage",
    "Gearfried the Iron Knight"
  ], 2) &&
  has_any(snapshot, staticData, [
    "Dark Driceratops",
    "Granmarg the Rock Monarch",
    "Hieracosphinx",
    "Saber Beetle"
  ]) &&
  has_from_list_unique(snapshot, staticData, [
    "Hyper Hammerhead",
    "Green Gadget",
    "Red Gadget",
    "Yellow Gadget",
    "Dimensional Warrior",
    "Enraged Muka Muka",
    "Exiled Force"
  ], 2) &&
  has(snapshot, staticData, "Giant Rat");
}

export function only_water(snapshot, staticData) {
  return has_from_list_unique(snapshot, staticData, [
    "Gagagigo",
    "Familiar-Possessed - Eria",
    "7 Colored Fish",
    "Sea Serpent Warrior of Darkness",
    "Abyss Soldier"
  ], 2) &&
  has_any(snapshot, staticData, [
    "Giga Gagagigo",
    "Amphibian Beast",
    "Terrorking Salmon",
    "Mobius the Frost Monarch"
  ]) &&
  has_from_list_unique(snapshot, staticData, [
    "Revival Jam",
    "Yomi Ship",
    "Treeborn Frog"
  ], 2) &&
  has(snapshot, staticData, "Mother Grizzly");
}

export function only_fire(snapshot, staticData) {
  return has_from_list_unique(snapshot, staticData, [
    "Blazing Inpachi",
    "Familiar-Possessed - Hiita",
    "Great Angus",
    "Fire Beaters"
  ], 2) &&
  has_any(snapshot, staticData, [
    "Thestalos the Firestorm Monarch",
    "Horus the Black Flame Dragon LV6"
  ]) &&
  has_from_list_unique(snapshot, staticData, [
    "Solar Flare Dragon",
    "Tenkabito Shien",
    "Ultimate Baseball Kid"
  ], 2) &&
  has(snapshot, staticData, "UFO Turtle");
}

export function only_wind(snapshot, staticData) {
  return has_from_list_unique(snapshot, staticData, [
    "Luster Dragon",
    "Slate Warrior",
    "Spear Dragon",
    "Familiar-Possessed - Wynn",
    "Harpie's Brother",
    "Nin-Ken Dog",
    "Cyber Harpie Lady",
    "Oxygeddon"
  ], 2) &&
  has_any(snapshot, staticData, [
    "Cyber-Tech Alligator",
    "Luster Dragon #2",
    "Armed Dragon LV5",
    "Roc from the Valley of Haze"
  ]) &&
  has_from_list_unique(snapshot, staticData, [
    "Armed Dragon LV3",
    "Twin-Headed Behemoth",
    "Harpie Lady 1"
  ], 2) &&
  has(snapshot, staticData, "Flying Kamakiri 1");
}

export function only_fairy(snapshot, staticData) {
  return has_any(snapshot, staticData, [
    "Dunames Dark Witch",
    "Hysteric Fairy"
  ]) &&
  (count_from_list_unique(snapshot, staticData, [
    "Dunames Dark Witch",
    "Hysteric Fairy",
    "Dancing Fairy",
    "Zolga",
    "Shining Angel",
    "Kelbek",
    "Mudora",
    "Asura Priest",
    "Cestus of Dagla"
  ]) + (has_any(snapshot, staticData, [
    "The Agent of Judgment - Saturn",
    "Airknight Parshath"
  ]) ? 1 : 0)) >= 7;
}

export function only_warrior(snapshot, staticData) {
  return has_any(snapshot, staticData, [
    "Dark Blade",
    "Blindly Loyal Goblin",
    "D.D. Survivor",
    "Gearfried the Iron knight",
    "Ninja Grandmaster Sasuke",
    "Warrior Beaters"
  ]) &&
  (count_from_list_unique(snapshot, staticData, [
    "Warrior Lady of the Wasteland",
    "Exiled Force",
    "Mystic Swordsman LV2",
    "Dimensional Warrior",
    "Dandylion",
    "D.D. Assailant",
    "Blade Knight",
    "D.D. Warrior Lady",
    "Marauding Captain",
    "Command Knight",
    "Reinforcement of the Army"
  ]) + (has_any(snapshot, staticData, [
    "Freed the Matchless General",
    "Holy Knight Ishzark",
    "Silent Swordsman Lv5"
  ]) ? 1 : 0)) >= 7;
}

export function only_zombie(snapshot, staticData) {
  return has(snapshot, staticData, "Pyramid Turtle") &&
    has_from_list_unique(snapshot, staticData, [
      "Regenerating Mummy",
      "Ryu Kokki",
      "Spirit Reaper",
      "Master Kyonshee",
      "Curse of Vampire",
      "Vampire Lord",
      "Goblin Zombie",
      "Book of Life",
      "Call of the Mummy"
    ], 6);
}

export function only_dragon(snapshot, staticData) {
  return has_any(snapshot, staticData, [
    "Luster Dragon",
    "Spear Dragon",
    "Cave Dragon"
  ]) &&
  (count_from_list_unique(snapshot, staticData, [
    "Luster Dragon",
    "Spear Dragon",
    "Cave Dragon",
    "Armed Dragon LV3",
    "Masked Dragon",
    "Twin-Headed Behemoth",
    "Element Dragon",
    "Troop Dragon",
    "Horus the Black Flame Dragon LV4",
    "Stamping Destruction"
  ]) + (has_any(snapshot, staticData, [
    "Luster Dragon #2",
    "Armed Dragon LV5",
    "Kaiser Glider",
    "Horus the Black Flame Dragon LV6"
  ]) ? 1 : 0)) >= 7;
}

export function only_spellcaster(snapshot, staticData) {
  return has_any(snapshot, staticData, [
    "Dark Elf",
    "Gemini Elf",
    "Skilled Dark Magician",
    "Toon Gemini Elf",
    "Kycoo the Ghost Destroyer",
    "Familiar-Possessed - Aussa"
  ]) &&
  (count_from_list_unique(snapshot, staticData, [
    "Dark Elf",
    "Gemini Elf",
    "Skilled Dark Magician",
    "Toon Gemini Elf",
    "Kycoo the Ghost Destroyer",
    "Familiar-Possessed - Aussa",
    "Breaker the magical Warrior",
    "The Tricky",
    "Injection Fairy Lily",
    "Magician of Faith",
    "Tsukuyomi",
    "Gravekeeper's Spy",
    "Gravekeeper's Guard",
    "Summon Priest",
    "Old Vindictive Magician",
    "Apprentice Magician",
    "Magical Dimension"
  ]) + (has_any(snapshot, staticData, [
    "Chaos Command Magician",
    "Cybernetic Magician"
  ]) ? 1 : 0)) >= 7;
}

export function equip_unions(snapshot, staticData) {
  return ((has_all(snapshot, staticData, ["Burning Beast", "Freezing Beast", "Metallizing Parasite - Lunatite", "Mother Grizzly"]) ||
    has_all(snapshot, staticData, ["Dark Blade", "Pitch-Dark Dragon", "Giant Orc", "Second Goblin", "Mystic Tomato"]) ||
    has_all(snapshot, staticData, ["Decayed Commander", "Zombie Tiger", "Vampire Orchis", "Des Dendle", "Giant Rat"]) ||
    has_all(snapshot, staticData, ["Indomitable Fighter Lei Lei", "Protective Soul Ailin", "V-Tiger Jet", "W-Wing Catapult", "Shining Angel"]) ||
    has_all(snapshot, staticData, ["X-Head Cannon", "Y-Dragon Head", "Z-Metal Tank", "Shining Angel"])) &&
    has_any(snapshot, staticData, ["Frontline Base", "Formation Union", "Roll Out!"]));
}

export function can_gain_lp_every_turn(snapshot, staticData) {
  return count_from_list_unique(snapshot, staticData, [
    "Solemn Wishes",
    "Cure Mermaid",
    "Dancing Fairy",
    "Princess Pikeru",
    "Kiseitai"
  ]) >= 3;
}

export function only_normal(snapshot, staticData) {
  return has_from_list_unique(snapshot, staticData, [
    "Archfiend Soldier",
    "Gemini Elf",
    "Insect Knight",
    "Luster Dragon",
    "Mad Dog of Darkness",
    "Vorse Raider",
    "Blazing Inpachi",
    "Gagagigo",
    "Mechanicalchaser",
    "7 Colored Fish",
    "Dark Blade",
    "Dunames Dark Witch",
    "Giant Red Snake",
    "Gil Garth",
    "Great Angus",
    "Harpie's Brother",
    "La Jinn the Mystical Genie of the Lamp",
    "Neo Bug",
    "Nin-Ken Dog",
    "Opticlops",
    "Sea Serpent Warrior of Darkness",
    "X-Head Cannon",
    "Zure, Knight of Dark World"
  ], 6) &&
  has_any(snapshot, staticData, [
    "Cyber-Tech Alligator",
    "Summoned Skull",
    "Giga Gagagigo",
    "Amphibian Beast",
    "Beast of Talwar",
    "Luster Dragon #2",
    "Terrorking Salmon"
  ]);
}

export function only_level(snapshot, staticData) {
  return has(snapshot, staticData, "Level Up!") &&
    ((has_all(snapshot, staticData, ["Armed Dragon LV3", "Armed Dragon LV5"]) ? 1 : 0) +
    (has_all(snapshot, staticData, ["Horus the Black Flame Dragon LV4", "Horus the Black Flame Dragon LV6"]) ? 1 : 0) +
    (has_all(snapshot, staticData, ["Mystic Swordsman LV4", "Mystic Swordsman LV6"]) ? 1 : 0) +
    (has_all(snapshot, staticData, ["Silent Swordsman Lv3", "Silent Swordsman Lv5"]) ? 1 : 0) +
    (has_all(snapshot, staticData, ["Ultimate Insect Lv3", "Ultimate Insect Lv5"]) ? 1 : 0)) >= 3;
}

export function spell_counter(snapshot, staticData) {
  return has(snapshot, staticData, "Pitch-Black Power Stone") &&
    has_from_list_unique(snapshot, staticData, [
      "Blast Magician",
      "Magical Marionette",
      "Mythical Beast Cerberus",
      "Royal Magical Library",
      "Spell-Counter Cards"
    ], 2);
}

export function take_control(snapshot, staticData) {
  return has_from_list_unique(snapshot, staticData, [
    "Aussa the Earth Charmer",
    "Jowls of Dark Demise",
    "Brain Control",
    "Creature Swap",
    "Enemy Controller",
    "Mind Control",
    "Magician of Faith"
  ], 5);
}

export function only_toons(snapshot, staticData) {
  return has_all(snapshot, staticData, [
    "Toon Gemini Elf",
    "Toon Goblin Attack Force",
    "Toon Masked Sorcerer",
    "Toon Mermaid",
    "Toon Dark Magician Girl",
    "Toon World"
  ]);
}

export function only_spirit(snapshot, staticData) {
  return has_all(snapshot, staticData, [
    "Asura Priest",
    "Fushi No Tori",
    "Maharaghi",
    "Susa Soldier"
  ]);
}

export function pacman_deck(snapshot, staticData) {
  return has_from_list_unique(snapshot, staticData, [
    "Des Lacooda",
    "Swarm of Locusts",
    "Swarm of Scarabs",
    "Wandering Mummy",
    "Golem Sentry",
    "Great Spirit",
    "Royal Keeper",
    "Stealth Bird"
  ], 4);
}

export function quick_plays(snapshot, staticData) {
  return has_from_list_unique(snapshot, staticData, [
    "Collapse",
    "Emergency Provisions",
    "Enemy Controller",
    "Graceful Dice",
    "Mystik Wok",
    "Offerings to the Doomed",
    "Poison of the Old Man",
    "Reload",
    "Rush Recklessly",
    "The Reliable Guardian"
  ], 4);
}

export function counter_traps(snapshot, staticData) {
  return has_from_list_unique(snapshot, staticData, [
    "Cursed Seal of the Forbidden Spell",
    "Divine Wrath",
    "Horn of Heaven",
    "Magic Drain",
    "Magic Jammer",
    "Negate Attack",
    "Seven Tools of the Bandit",
    "Solemn Judgment",
    "Spell Shield Type-8"
  ], 5);
}

export function back_row_removal(snapshot, staticData) {
  return has_from_list_unique(snapshot, staticData, [
    "Anteatereatingant",
    "B.E.S. Tetran",
    "Breaker the Magical Warrior",
    "Calamity of the Wicked",
    "Chiron the Mage",
    "Dust Tornado",
    "Heavy Storm",
    "Mystical Space Typhoon",
    "Mobius the Frost Monarch",
    "Raigeki Break",
    "Stamping Destruction",
    "Swarm of Locusts"
  ], 2);
}

/**
 * Check if player has all materials needed to create a fusion monster
 * Mirrors Python logic from worlds/yugioh06/fusions.py has_all_materials()
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {string} monster - Name of the fusion monster to check
 * @returns {boolean} True if player has the fusion card and all materials
 */
export function has_all_materials(snapshot, staticData, monster) {
  const data = FUSIONS[monster];

  // Must have the fusion monster card itself
  if (!has(snapshot, staticData, monster)) {
    return false;
  }

  // If not a known fusion, just check if we have the card
  if (!data) {
    return true;
  }

  // Count materials available (fusion subs count as one material if replaceable)
  let materialsAvailable = 0;
  if (data.replaceable && has_any(snapshot, staticData, FUSION_SUBS)) {
    materialsAvailable = 1;
  }

  // Recursively check each material
  for (const material of data.materials) {
    if (has_all_materials(snapshot, staticData, material)) {
      materialsAvailable++;
    }
  }

  return materialsAvailable >= data.materials.length;
}

/**
 * Count how many fusion monsters from a list the player can create
 * Mirrors Python logic from worlds/yugioh06/fusions.py count_has_materials()
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {Array<string>} monsters - List of fusion monster names to check
 * @returns {number} Number of monsters that can be created
 */
export function count_has_materials(snapshot, staticData, monsters) {
  let amount = 0;
  for (const monster of monsters) {
    if (has_all_materials(snapshot, staticData, monster)) {
      amount++;
    }
  }
  return amount;
}

// Helper function registry
export const helperFunctions = {
  // Core inventory functions
  has,
  count,
  has_from_list,
  has_from_list_unique,
  count_from_list_unique,

  // Yu-Gi-Oh! 2006 specific helpers
  yugioh06_difficulty,
  only_light,
  only_dark,
  only_earth,
  only_water,
  only_fire,
  only_wind,
  only_fairy,
  only_warrior,
  only_zombie,
  only_dragon,
  only_spellcaster,
  equip_unions,
  can_gain_lp_every_turn,
  only_normal,
  only_level,
  spell_counter,
  take_control,
  only_toons,
  only_spirit,
  pacman_deck,
  quick_plays,
  counter_traps,
  back_row_removal,
  has_all_materials,
  count_has_materials,
};
